#!/usr/bin/env node
/* ═══════════════════════════════════════════
   DAEMON

   The loop that makes this run on its own.
   Ticks once a minute; the policy in runner.js
   decides whether the tick becomes a hunt, an
   application, or nothing at all.
   ═══════════════════════════════════════════ */

const store = require('./store.js');
const browser = require('./browser.js');
const runner = require('../runner.js');
const tracker = require('../tracker.js');
const answers = require('../answers.js');
const cover = require('../cover-letter.js');
const { CV_PROFILES } = require('../cv-profiles.js');
const { hunt } = require('./hunt.js');
const { applyTo } = require('./apply.js');

const TICK_MS = 60000;
let stopping = false;

// Local time, to match the quiet-hours window and the machine's own clock.
// UTC stamps here made a four-minute-old entry look two hours stale.
const log = (...a) => console.log(
  new Date().toLocaleTimeString('en-CA', { hour12: false }), ...a);

async function tick() {
  const settings = store.getSettings();
  if (!settings.runner.enabled) return;

  const state = store.getRunnerState();
  const apps = store.getApplications();

  const decision = runner.decide({
    queue: Object.values(apps),
    records: apps,
    lastHuntAt: state.lastHuntAt,
    lastApplyAt: state.lastApplyAt,
    consecutiveFailures: state.consecutiveFailures,
    nextApplyGapMinutes: state.nextApplyGapMinutes
  }, settings.runner);

  state.lastDecision = { action: decision.action, reason: decision.reason,
                         job: decision.job?.id || null, at: new Date().toISOString() };

  if (decision.action === 'hunt') {
    log('hunting —', decision.reason);
    try {
      const r = await hunt();
      log(`  +${r.added} new roles (${r.total} in queue, ${r.stats.fetched.toLocaleString()} scanned)`);
      state.consecutiveFailures = 0;
    } catch (e) {
      log('  hunt failed:', e.message);
      state.consecutiveFailures++;
    }
    state.lastHuntAt = new Date().toISOString();
    store.saveRunnerState(state);
    return;
  }

  if (decision.action === 'apply') {
    const r = await applyOne(decision.job.id, settings);
    state.lastApplyAt = new Date().toISOString();
    state.nextApplyGapMinutes = runner.nextDelayMinutes(
      settings.runner.applyEveryMinutes, settings.runner.jitterPercent);
    state.consecutiveFailures = r.ok ? 0 : state.consecutiveFailures + 1;
    store.saveRunnerState(state);
    return;
  }

  store.saveRunnerState(state);
}

async function applyOne(id, settings = store.getSettings()) {
  const apps = store.getApplications();
  const rec = apps[id];
  if (!rec) return { ok: false, error: 'unknown application' };

  const cv = CV_PROFILES.find(p => p.id === rec.cvId);
  const ans = answers.defaultAnswers(settings.profile || {}, cv?.facts || {}, { region: rec.region });
  const missing = answers.missingCritical(ans);

  const check = runner.applyability(
    { ...rec, cvNeedsFile: cv?.enabled === false }, ans,
    { missingCritical: settings.runner.requireCriticalAnswers ? missing : [],
      requireCriticalAnswers: settings.runner.requireCriticalAnswers });

  if (!check.canAuto) {
    tracker.applyStatus(rec, 'scouted', { reason: check.reason });
    rec.scoutReason = check.reason;
    rec.scoutBlockers = check.blockers;
    apps[id] = rec; store.saveApplications(apps);
    log(`  scouted  ${rec.company} — ${rec.title.slice(0, 44)}  (${check.reason})`);
    return { ok: true, scouted: true };
  }

  const letter = settings.coverLetter.enabled
    ? cover.compose(rec, cv, settings.profile, {
        level: rec.level, family: rec.family, location: { region: rec.region } })
    : null;

  const ctx = await browser.getShared({ headless: settings.runner.headless });

  // The first N applications fill and screenshot without submitting, so a
  // systematic fill problem surfaces before it reaches many employers.
  const dryRun = (settings.runner.dryRunRemaining || 0) > 0;

  const result = await applyTo(ctx, rec, {
    settings, dryRun, coverLetter: letter?.text || null, cvFacts: cv?.facts || {}
  });

  rec.applyResult = {
    submitted: result.submitted, blocked: result.blocked || null,
    filledCount: result.filled?.length || 0,
    skipped: result.skipped || [],
    screenshots: (result.screenshots || []).map(s => s.split('/data/')[1] || s),
    dir: result.dir?.split('/data/')[1] || null,
    at: result.at
  };
  rec.coverLetter = letter?.text || null;

  if (result.submitted) {
    tracker.applyStatus(rec, 'applied', { mode: 'auto' });
    log(`  APPLIED  ${rec.company} — ${rec.title.slice(0, 44)}  [${rec.cvShort}]`);
  } else if (dryRun && /no form found/.test(result.blocked || '')) {
    // Not a rehearsal problem: this posting has no fillable form and never
    // will. Scout it now rather than spending an attempt on it every pass.
    tracker.applyStatus(rec, 'scouted', { reason: result.blocked });
    rec.scoutReason = result.blocked;
    log(`  scouted  ${rec.company} — ${rec.title.slice(0, 40)}  (no form; apply by hand)`);
  } else if (dryRun) {
    // Stays queued — a dry run is a rehearsal, not an attempt — but it must
    // not be picked again next tick, or the loop rehearses one role forever.
    rec.dryRunAt = new Date().toISOString();
    log(`  dry-run  ${rec.company} — ${rec.title.slice(0, 40)}  ${result.filled.length} fields filled` +
        (result.blocked ? `  (${result.blocked})` : ''));
    settings.runner.dryRunRemaining = Math.max(0, settings.runner.dryRunRemaining - 1);
    store.saveSettings(settings);
  } else {
    tracker.applyStatus(rec, 'scouted', { reason: result.blocked || result.error });
    rec.scoutReason = result.blocked || result.error || 'could not complete the form';
    rec.scoutBlockers = (result.skipped || []).filter(s => s.critical).map(s => s.label);
    log(`  blocked  ${rec.company} — ${rec.title.slice(0, 40)}  (${rec.scoutReason})`);
  }

  apps[id] = rec;
  store.saveApplications(apps);
  return { ok: result.ok && !result.error, ...result };
}

async function main() {
  const s = store.getSettings();
  log('daemon started');
  log(`  runner ${s.runner.enabled ? 'ENABLED' : 'disabled'} · cap ${s.runner.dailyCap}/day` +
      ` · ~1 per ${s.runner.applyEveryMinutes}min · quiet ${s.runner.quietHours.start}:00-${s.runner.quietHours.end}:00`);
  if (s.runner.dryRunRemaining) log(`  DRY RUN for the next ${s.runner.dryRunRemaining} applications`);

  const missing = answers.missingCritical(answers.defaultAnswers(s.profile || {}));
  if (missing.length) log(`  WARNING: ${missing.length} terminal answers unset — ${missing.join(', ')}`);

  while (!stopping) {
    try { await tick(); } catch (e) { log('tick error:', e.message); }
    await new Promise(r => setTimeout(r, TICK_MS));
  }
  await browser.closeShared();
  log('daemon stopped');
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { stopping = true; await browser.closeShared(); process.exit(0); });
}

if (require.main === module) main();
module.exports = { tick, applyOne, main };
