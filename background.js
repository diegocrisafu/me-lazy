/* ═══════════════════════════════════════════
   SERVICE WORKER

   Owns the hunt, storage and the message router.
   The matching, filtering and selection logic all
   live in the imported modules so they can be
   unit-tested outside the browser.
   ═══════════════════════════════════════════ */

importScripts(
  'cv-profiles.js',
  'companies.js',
  'salary.js',
  'targeting.js',
  'cv-selector.js',
  'sources.js',
  'pipeline.js',
  'tracker.js',
  'answers.js',
  'cover-letter.js',
  'runner.js'
);

const SCHEMA_VERSION = 2;
const MAX_DESC_STORED = 4000;

/* ─────────── storage ─────────── */
const get = (k) => new Promise(r => chrome.storage.local.get(k, o => r(o[k])));
const set = (o) => new Promise(r => chrome.storage.local.set(o, r));

async function getSettings() {
  const s = await get('settings');
  return {
    minSalaryCAD: 90000,
    salaryPolicy: 'max',
    allowUnknownSalary: true,
    levels: ['intern', 'newgrad'],
    maxRequiredYears: 2,
    regions: ['CA', 'US'],
    maxAgeDays: 45,
    canadaFirst: true,
    // Review is the default. Auto-submit fills and submits without a human
    // look, which is where a wrong screening answer becomes an auto-reject.
    applyMode: 'review',
    families: ['swe', 'quant-dev', 'quant-research', 'data', 'analyst'],
    runner: { ...__runner.RUNNER_DEFAULTS },
    coverLetter: { enabled: true },
    ...(s || {}),
    runner: { ...__runner.RUNNER_DEFAULTS, ...((s || {}).runner || {}) }
  };
}

/* ─────────── runner state ─────────── */
async function getRunnerState() {
  return (await get('runnerState')) || {
    lastHuntAt: null, lastApplyAt: null,
    consecutiveFailures: 0, nextApplyGapMinutes: null, lastDecision: null
  };
}
const setRunnerState = (s) => set({ runnerState: s });

/* ─────────── hunt ─────────── */
let huntInProgress = false;

async function startHunt() {
  if (huntInProgress) return { error: 'A hunt is already running' };
  huntInProgress = true;

  try {
    const settings = await getSettings();
    const companies = __companies.prioritized(undefined, { canadaFirst: settings.canadaFirst });

    const result = await __pipeline.runHunt({
      companies,
      profiles: CV_PROFILES,
      rules: settings,
      concurrency: 6,
      descriptionBudget: 60,
      fetchOpts: { maxPagesPerQuery: 3, maxPerCountry: 300 },
      onProgress: (p) => {
        chrome.runtime.sendMessage({ type: 'HUNT_PROGRESS', ...p }).catch(() => {});
      }
    });

    const runId = 'run_' + Date.now();
    const existing = (await get('applications')) || {};
    let added = 0;

    for (const job of result.queue) {
      // Never overwrite a record that already has history.
      if (existing[job.id]) continue;
      const rec = __tracker.makeRecord(job, { runId });
      rec.description = (job.description || '').slice(0, MAX_DESC_STORED);
      rec.duplicateCount = job.duplicateCount || 1;
      existing[job.id] = rec;
      added++;
    }

    await set({ applications: existing });

    // Source health, for the Sources tab.
    const sources = companies.map(c => ({
      id: c.id, name: c.name, country: c.country, ats: c.ats,
      verified: c.ats === 'custom' ? null : c.verified,
      jobs: c.jobs, oa: c.oa?.likelihood ?? null
    }));
    await set({ sources, lastRun: { runId, at: new Date().toISOString(), ...result.stats } });

    return {
      ok: true,
      found: added,
      totalQueued: result.queue.length,
      fetched: result.stats.fetched,
      duplicatesCollapsed: result.stats.duplicatesCollapsed,
      elapsedMs: result.stats.elapsedMs
    };
  } catch (e) {
    return { error: e.message };
  } finally {
    huntInProgress = false;
  }
}

/* ─────────── verify sources in-browser ───────────
   Several Workday tenants refuse server-side clients
   but answer normally from the browser, so this is
   the authoritative check. */
async function verifySources() {
  const companies = __companies.prioritized();
  const out = [];

  for (let i = 0; i < companies.length; i += 6) {
    const batch = companies.slice(i, i + 6);
    const res = await Promise.all(batch.map(async (c) => {
      if (c.ats === 'custom') {
        const r = await __sources.fetchCompany(c, { maxPerCountry: 100 });
        return { id: c.id, name: c.name, country: c.country, ats: c.ats,
                 verified: r.ok && r.jobs.length > 0, jobs: r.jobs?.length ?? 0,
                 oa: c.oa?.likelihood ?? null };
      }
      const r = await __sources.fetchCompany(c, { maxPagesPerQuery: 1 });
      return { id: c.id, name: c.name, country: c.country, ats: c.ats,
               verified: r.ok && r.jobs.length > 0, jobs: r.jobs?.length ?? 0,
               error: r.error || null, oa: c.oa?.likelihood ?? null };
    }));
    out.push(...res);
  }
  await set({ sources: out });
  return out;
}

/* ─────────── applying ─────────── */
async function applyTo(id) {
  const apps = (await get('applications')) || {};
  const rec = apps[id];
  if (!rec) return { error: 'Unknown application' };

  const settings = await getSettings();

  // Open the posting and hand the applier the CV choice and profile. The
  // content script fills the form; whether it submits is the mode's call.
  const tab = await chrome.tabs.create({ url: rec.applyUrl || rec.url, active: true });

  await set({
    pendingApply: {
      id: rec.id, tabId: tab.id,
      cvId: rec.cvId, cvFile: rec.cvFile,
      mode: settings.applyMode,
      startedAt: Date.now()
    }
  });

  __tracker.applyStatus(rec, 'applied', { mode: settings.applyMode });
  apps[id] = rec;
  await set({ applications: apps });

  return { ok: true, mode: settings.applyMode, tabId: tab.id };
}

/* ─────────── ghost sweep ─────────── */
async function sweepGhosted() {
  const apps = (await get('applications')) || {};
  const stale = __tracker.findGhosted(Object.values(apps));
  if (!stale.length) return 0;
  for (const r of stale) __tracker.applyStatus(apps[r.id], 'ghosted');
  await set({ applications: apps });

  chrome.notifications.create({
    type: 'basic', iconUrl: 'icons/icon128.png',
    title: 'Application Command Center',
    message: `${stale.length} application${stale.length > 1 ? 's' : ''} passed ${__tracker.GHOST_DAYS} days with no response.`
  });
  return stale.length;
}

chrome.alarms.create('sweepGhosted', { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'sweepGhosted') sweepGhosted();
  if (a.name === 'runnerTick') runnerTick();
});

/* ─────────── migrations ─────────── */
async function migrate() {
  const v = (await get('schemaVersion')) || 0;
  if (v < 2) {
    // v1 stored LinkedIn-only scans keyed by numeric job id and used a
    // different status vocabulary. Preserve them under the new schema.
    const apps = (await get('applications')) || {};
    for (const [id, a] of Object.entries(apps)) {
      if (!a.statusHistory) a.statusHistory = [{ status: a.status || 'queued', at: a.savedDate || new Date().toISOString() }];
      if (a.status === 'saved') a.status = 'queued';
      if (a.status === 'phone_screen' || a.status === 'interviewing') a.status = 'interview';
      if (!a.foundAt) a.foundAt = a.savedDate || new Date().toISOString();
      if (!a.cvId) { a.cvId = 'early-career'; a.cvShort = 'Early Career'; a.cvName = 'Early Career Generalist'; }
      if (a.appliedDate && !a.appliedAt) a.appliedAt = a.appliedDate;
    }
    await set({ applications: apps, schemaVersion: 2 });
  }
}

chrome.runtime.onInstalled.addListener(() => { migrate(); });


/* ═══════════════════════════════
   CONTINUOUS RUNNER

   Fires every minute; the policy in runner.js
   decides whether that tick becomes a hunt, an
   application, or nothing.
   ═══════════════════════════════ */

chrome.alarms.create('runnerTick', { periodInMinutes: 1 });

async function runnerTick() {
  const settings = await getSettings();
  if (!settings.runner?.enabled) return;

  const state = await getRunnerState();
  const apps = (await get('applications')) || {};

  const decision = __runner.decide({
    queue: Object.values(apps),
    records: apps,
    lastHuntAt: state.lastHuntAt,
    lastApplyAt: state.lastApplyAt,
    consecutiveFailures: state.consecutiveFailures,
    nextApplyGapMinutes: state.nextApplyGapMinutes
  }, settings.runner);

  state.lastDecision = { ...decision, job: decision.job?.id || null, at: new Date().toISOString() };

  if (decision.action === 'hunt') {
    const r = await startHunt();
    state.lastHuntAt = new Date().toISOString();
    state.consecutiveFailures = r.error ? state.consecutiveFailures + 1 : 0;
    await setRunnerState(state);
    return;
  }

  if (decision.action === 'apply') {
    const result = await autoApply(decision.job.id);
    state.lastApplyAt = new Date().toISOString();
    // Re-roll the gap each time so the cadence is never mechanical.
    state.nextApplyGapMinutes = __runner.nextDelayMinutes(
      settings.runner.applyEveryMinutes, settings.runner.jitterPercent);
    state.consecutiveFailures = result.ok ? 0 : state.consecutiveFailures + 1;
    await setRunnerState(state);
    return;
  }

  await setRunnerState(state);
}

/**
 * Apply without supervision. Anything that cannot be answered honestly
 * routes the role to the scouting report instead of being guessed at.
 */
async function autoApply(id) {
  const apps = (await get('applications')) || {};
  const rec = apps[id];
  if (!rec) return { ok: false, error: 'unknown application' };

  const settings = await getSettings();
  const answers = __answers.defaultAnswers(settings.profile || {},
    CV_PROFILES.find(p => p.id === rec.cvId)?.facts || {});
  const missing = __answers.missingCritical(answers);

  const cvProfile = CV_PROFILES.find(p => p.id === rec.cvId);
  const check = __runner.applyability(
    { ...rec, cvNeedsFile: cvProfile?.enabled === false },
    answers,
    { missingCritical: settings.runner?.requireCriticalAnswers ? missing : [],
      requireCriticalAnswers: settings.runner?.requireCriticalAnswers });

  if (!check.canAuto) {
    // Not a failure — a role that needs a person. Record why and move on.
    rec.status = 'scouted';
    rec.scoutReason = check.reason;
    rec.scoutBlockers = check.blockers;
    rec.lastUpdated = new Date().toISOString();
    rec.statusHistory.push({ status: 'scouted', at: rec.lastUpdated, reason: check.reason });
    apps[id] = rec;
    await set({ applications: apps });
    return { ok: true, scouted: true, reason: check.reason };
  }

  // Compose the cover letter now so it is ready when the form asks.
  let letter = null;
  if (settings.coverLetter?.enabled !== false && cvProfile) {
    letter = __coverLetter.compose(rec, cvProfile, settings.profile || {},
      { level: rec.level, family: rec.family, location: { region: rec.region } });
    rec.coverLetter = letter.text;
    rec.coverLetterEvidence = letter.evidenceUsed;
  }

  const tab = await chrome.tabs.create({ url: rec.applyUrl || rec.url, active: false });
  await set({ pendingApply: {
    id: rec.id, tabId: tab.id, cvId: rec.cvId, cvFile: rec.cvFile,
    cvPatterns: cvProfile?.filePatterns || [],
    mode: 'auto', answers, coverLetter: letter?.text || null,
    startedAt: Date.now()
  }});

  __tracker.applyStatus(rec, 'applied', { mode: 'auto' });
  apps[id] = rec;
  await set({ applications: apps });
  return { ok: true, tabId: tab.id };
}

/* ─────────── scouting report ───────────
   Roles worth pursuing that the runner will not
   submit for you, with the reason and everything
   needed to do it by hand. */
async function scoutingReport() {
  const apps = (await get('applications')) || {};
  return Object.values(apps)
    .filter(r => r.status === 'scouted' ||
      (r.status === 'queued' && (r.ats === 'workday' || r.ats === 'custom')))
    .map(r => ({
      id: r.id, company: r.company, title: r.title, location: r.location,
      region: r.region, level: r.level, family: r.family,
      salaryDisplay: r.salaryDisplay, priority: r.priority,
      oaPlatform: r.oaPlatform, oaLikelihood: r.oaLikelihood,
      ats: r.ats, url: r.applyUrl || r.url,
      cvShort: r.cvShort, cvFile: r.cvFile,
      reason: r.scoutReason || (r.ats === 'workday'
        ? 'Workday needs an account with this employer'
        : 'employer runs its own application flow'),
      blockers: r.scoutBlockers || [],
      // Enough of the posting to decide whether to spend the time.
      summary: (r.description || '').replace(/\s+/g, ' ').slice(0, 420),
      foundAt: r.foundAt
    }))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/* ─────────── router ─────────── */
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'START_HUNT':
          respond(await startHunt()); break;

        case 'VERIFY_SOURCES':
          respond({ sources: await verifySources() }); break;

        case 'GET_APPLICATIONS':
          respond({ applications: (await get('applications')) || {} }); break;

        case 'GET_SOURCES':
          respond({ sources: (await get('sources')) || [] }); break;

        case 'GET_SETTINGS':
          respond({ settings: await getSettings() }); break;

        case 'SAVE_SETTINGS':
          await set({ settings: { ...(await getSettings()), ...msg.settings } });
          respond({ ok: true }); break;

        case 'APPLY_TO':
          respond(await applyTo(msg.id)); break;

        case 'UPDATE_APPLICATION': {
          const apps = (await get('applications')) || {};
          const rec = apps[msg.id];
          if (!rec) return respond({ error: 'Unknown application' });
          if (msg.notes != null) rec.notes = msg.notes;
          if (msg.status && msg.status !== rec.status) __tracker.applyStatus(rec, msg.status);
          rec.lastUpdated = new Date().toISOString();
          apps[msg.id] = rec;
          await set({ applications: apps });
          respond({ ok: true, record: rec }); break;
        }

        case 'GET_METRICS': {
          const apps = (await get('applications')) || {};
          respond({
            metrics: __tracker.metrics(apps),
            cv: __tracker.cvPerformance(apps, CV_PROFILES),
            companies: __tracker.companyPerformance(apps)
          }); break;
        }

        case 'EXPORT_CSV':
          respond({ csv: __tracker.toCSV((await get('applications')) || {}) }); break;

        case 'GET_PENDING_APPLY':
          respond({ pending: (await get('pendingApply')) || null }); break;

        // The applier reports what it filled, so the answers submitted are
        // recoverable later rather than lost inside a closed tab.
        case 'APPLY_RESULT': {
          const pending = (await get('pendingApply')) || {};
          const apps = (await get('applications')) || {};
          const rec = apps[msg.id || pending.id];
          if (rec) {
            rec.screeningAnswers = msg.answers || {};
            rec.applyMode = msg.mode || rec.applyMode;
            if (msg.submitted) __tracker.applyStatus(rec, 'applied', { mode: msg.mode, auto: true });
            rec.lastUpdated = new Date().toISOString();
            apps[rec.id] = rec;
            await set({ applications: apps });
          }
          await set({ pendingApply: null });
          respond({ ok: true }); break;
        }

        case 'GET_SCOUTING_REPORT':
          respond({ report: await scoutingReport() }); break;

        case 'GET_RUNNER':
          respond({
            settings: (await getSettings()).runner,
            state: await getRunnerState(),
            appliedToday: __runner.appliedToday((await get('applications')) || {})
          }); break;

        case 'SET_RUNNER': {
          const s = await getSettings();
          await set({ settings: { ...s, runner: { ...s.runner, ...msg.runner } } });
          respond({ ok: true }); break;
        }

        case 'PREVIEW_COVER_LETTER': {
          const apps = (await get('applications')) || {};
          const rec = apps[msg.id];
          if (!rec) return respond({ error: 'unknown application' });
          const s = await getSettings();
          const cv = CV_PROFILES.find(p => p.id === rec.cvId);
          respond({ letter: __coverLetter.compose(rec, cv, s.profile || {},
            { level: rec.level, family: rec.family, location: { region: rec.region } }) });
          break;
        }

        case 'GET_ANSWERS': {
          const s = await getSettings();
          const answers = __answers.defaultAnswers(s.profile || {});
          respond({ answers, missingCritical: __answers.missingCritical(answers) });
          break;
        }

        case 'OPEN_DASHBOARD':
          chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
          respond({ ok: true }); break;

        default:
          respond({ error: 'Unknown message type: ' + msg.type });
      }
    } catch (e) {
      respond({ error: e.message });
    }
  })();
  return true; // async response
});

console.log('[ACC] Service worker ready —',
  COMPANIES.length, 'companies,', CV_PROFILES.length, 'CV variants');
