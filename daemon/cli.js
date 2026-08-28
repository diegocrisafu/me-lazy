#!/usr/bin/env node
/* Command line for the daemon: one-off hunts, single applications,
   status, and an interactive login for sites needing an account. */

const store = require('./store.js');
const browser = require('./browser.js');
const answers = require('../answers.js');
const tracker = require('../tracker.js');
const { hunt } = require('./hunt.js');
const { applyOne } = require('./index.js');

const [, , cmd, ...args] = process.argv;
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);

async function cmdHunt() {
  console.log('Hunting…');
  const r = await hunt({ onProgress: p =>
    process.stderr.write(`\r  ${p.done}/${p.total} sources · ${p.found} eligible   `) });
  process.stderr.write('\n');
  console.log(`\n${r.added} new roles queued (${r.total} eligible of ` +
              `${r.stats.fetched.toLocaleString()} scanned in ${(r.stats.elapsedMs / 1000).toFixed(0)}s)`);
  cmdStatus();
}

function cmdStatus() {
  const apps = store.getApplications();
  const s = store.getSettings();
  const list = Object.values(apps);
  const m = tracker.metrics(apps);

  console.log('\n── PIPELINE ──');
  console.log(`  queued ${m.queued}   scouted ${list.filter(r => r.status === 'scouted').length}` +
              `   applied ${m.applied}   OAs ${m.oaReceived}   interviews ${m.interviews}   offers ${m.offers}`);

  const missing = answers.missingCritical(answers.defaultAnswers(s.profile || {}));
  console.log('\n── READINESS ──');
  console.log(`  runner:   ${s.runner.enabled ? 'ENABLED' : 'disabled'}` +
              (s.runner.dryRunRemaining ? `  (dry run: ${s.runner.dryRunRemaining} left)` : ''));
  console.log(`  profile:  ${missing.length ? 'INCOMPLETE — ' + missing.join(', ') : 'complete'}`);
  console.log(`  today:    ${runnerAppliedToday(apps)} of ${s.runner.dailyCap}`);

  const queued = list.filter(r => r.status === 'queued')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 10);
  if (queued.length) {
    console.log('\n── NEXT UP ──');
    for (const j of queued) {
      console.log(`  ${pad(j.priority, 5)} ${pad(j.region, 3)} ${pad(j.company, 16)}` +
                  ` ${pad(j.title, 40)} ${pad(j.cvShort, 17)} ${j.salaryDisplay}`);
    }
  }
}

function runnerAppliedToday(apps) {
  const day = new Date().toISOString().slice(0, 10);
  return Object.values(apps).filter(r => r.appliedAt?.slice(0, 10) === day).length;
}

async function cmdApply() {
  const apps = store.getApplications();
  const id = args[0] || Object.values(apps)
    .filter(r => r.status === 'queued')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]?.id;
  if (!id) return console.log('Nothing queued. Run: npm run hunt');

  const rec = apps[id];
  console.log(`Applying: ${rec.company} — ${rec.title}`);
  console.log(`CV: ${rec.cvShort}  ·  ${rec.applyUrl || rec.url}\n`);

  const r = await applyOne(id);
  await browser.closeShared();

  console.log(`\nsubmitted: ${r.submitted}   ${r.blocked ? '(' + r.blocked + ')' : ''}`);
  if (r.filled) console.log(`filled ${r.filled.length} fields`);
  if (r.skipped?.length) {
    console.log('left blank:');
    r.skipped.forEach(s => console.log(`  ${s.critical ? '!' : ' '} ${pad(s.label, 46)} ${s.reason}`));
  }
  if (r.dir) console.log(`\nevidence: ${r.dir}`);
}

/** Opens a visible browser so accounts can be created once, by hand.
    The session persists, so later runs are already logged in. */
async function cmdLogin() {
  const url = args[0];
  if (!url) return console.log('Usage: npm run login -- <url>');
  console.log('Opening a visible browser. Log in, then close the window.');
  const ctx = await browser.launch({ headless: false, profile: 'default' });
  const page = await ctx.newPage();
  await page.goto(url);
  await new Promise(res => ctx.on('close', res));
  console.log('Session saved.');
}

(async () => {
  switch (cmd) {
    case 'hunt':   await cmdHunt(); break;
    case 'apply':  await cmdApply(); break;
    case 'login':  await cmdLogin(); break;
    case 'status':
    default:       cmdStatus();
  }
  process.exit(0);
})();
