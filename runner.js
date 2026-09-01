/* ═══════════════════════════════════════════
   CONTINUOUS RUNNER

   Keeps the pipeline going without supervision:
   hunts on a schedule, then works the queue one
   application at a time.

   Three properties make unattended operation
   safe rather than reckless:

   1. Applications go out one at a time on a
      randomised human-scale interval. Bursts are
      what get accounts flagged.
   2. A daily cap, so a bug cannot empty the queue
      into a hundred employers overnight.
   3. Anything the filler cannot answer honestly
      stops that application and routes the role
      to the scouting report instead of guessing.
   ═══════════════════════════════════════════ */

const RUNNER_DEFAULTS = {
  enabled: false,
  huntEveryMinutes: 180,        // 3h — postings do not appear faster than this
  applyEveryMinutes: 7,         // one application per ~7 min, jittered
  jitterPercent: 45,
  dailyCap: 25,
  maxConsecutiveFailures: 4,    // pause rather than hammer a broken form
  quietHours: { start: 23, end: 7 },  // local time; nobody applies at 4am
  requireCriticalAnswers: true
};

/** Randomised so the cadence never looks mechanical. */
function nextDelayMinutes(base, jitterPercent) {
  const jitter = base * (jitterPercent / 100);
  return Math.max(1, base + (Math.random() * 2 - 1) * jitter);
}

function inQuietHours(now, quiet) {
  if (!quiet) return false;
  const h = now.getHours();
  return quiet.start > quiet.end
    ? (h >= quiet.start || h < quiet.end)   // window crosses midnight
    : (h >= quiet.start && h < quiet.end);
}

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Applications sent today, from the records themselves. */
function appliedToday(records, day = todayKey()) {
  return Object.values(records || {})
    .filter(r => r.appliedAt && r.appliedAt.slice(0, 10) === day).length;
}

/**
 * Decide what the runner should do on this tick.
 * Pure, so the policy is testable without a browser.
 *
 * @returns {{action:'hunt'|'apply'|'wait', reason:string, job?, waitMinutes?}}
 */
function decide(state, cfg = {}) {
  const c = { ...RUNNER_DEFAULTS, ...cfg };
  const now = state.now ? new Date(state.now) : new Date();

  if (!c.enabled) return { action: 'wait', reason: 'runner is off' };

  if (state.consecutiveFailures >= c.maxConsecutiveFailures) {
    return { action: 'wait', reason:
      `paused after ${state.consecutiveFailures} consecutive failures — check the last few applications` };
  }

  if (inQuietHours(now, c.quietHours)) {
    return { action: 'wait', reason: 'quiet hours', waitMinutes: 30 };
  }

  const sentToday = appliedToday(state.records, todayKey(now));
  if (sentToday >= c.dailyCap) {
    return { action: 'wait', reason: `daily cap reached (${sentToday}/${c.dailyCap})`, waitMinutes: 60 };
  }

  // Refresh the queue when it is stale or running dry.
  const sinceHuntMin = state.lastHuntAt
    ? (now - new Date(state.lastHuntAt)) / 60000
    : Infinity;
  // A role already rehearsed in a dry run is not a fresh candidate.
  const queue = (state.queue || []).filter(j => j.status === 'queued' && !j.dryRunAt);

  if (sinceHuntMin >= c.huntEveryMinutes || queue.length === 0) {
    return { action: 'hunt', reason: queue.length === 0
      ? 'queue is empty'
      : `last hunt ${Math.round(sinceHuntMin)} min ago` };
  }

  // Respect the pacing between applications.
  const sinceApplyMin = state.lastApplyAt
    ? (now - new Date(state.lastApplyAt)) / 60000
    : Infinity;
  if (sinceApplyMin < (state.nextApplyGapMinutes || c.applyEveryMinutes)) {
    return { action: 'wait', reason: 'pacing between applications',
             waitMinutes: Math.ceil((state.nextApplyGapMinutes || c.applyEveryMinutes) - sinceApplyMin) };
  }

  // Highest expected assessments first.
  const next = queue.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
  if (!next) return { action: 'hunt', reason: 'nothing left to apply to' };

  return {
    action: 'apply',
    reason: `priority ${next.priority}`,
    job: next,
    sentToday,
    remainingToday: c.dailyCap - sentToday
  };
}

/* ─────────── Can this be applied to unattended? ───────────
   The honest answer is often no. Workday wants an account per
   employer; some ATSs need a file upload the extension cannot
   perform. Those roles are not dropped — they go to the
   scouting report so they can be done by hand. */

const AUTO_APPLY_SUPPORT = {
  greenhouse:      { auto: true,  note: 'single-page form, fully fillable' },
  lever:           { auto: true,  note: 'single-page form, fully fillable' },
  ashby:           { auto: true,  note: 'single-page form, fully fillable' },
  smartrecruiters: { auto: true,  note: 'single-page form' },
  workday:         { auto: false, reason: 'needs an account per employer and a multi-step wizard' },
  custom:          { auto: false, reason: 'employer runs its own application flow' }
};

/**
 * @returns {{canAuto:boolean, reason?:string, blockers:string[]}}
 */
function applyability(job, answers = {}, opts = {}) {
  const blockers = [];
  const support = AUTO_APPLY_SUPPORT[job.ats] || { auto: false, reason: 'unknown system' };

  if (!support.auto) blockers.push(support.reason);

  // Measured per employer: some boards redirect to the company's own careers
  // site, where there is no form to fill. Knowing that up front saves an
  // attempt on every posting they list.
  if (job.autoApply === false) {
    blockers.push('employer redirects its board to its own site — no form to fill');
  }

  if (opts.requireCriticalAnswers !== false) {
    const missing = opts.missingCritical || [];
    if (missing.length) {
      blockers.push(`unanswered screening question${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    }
  }

  if (job.cvNeedsFile) blockers.push(`CV file not uploaded: ${job.cvFile}`);

  return {
    canAuto: blockers.length === 0,
    reason: blockers[0],
    blockers,
    note: support.note
  };
}

const __runner = {
  RUNNER_DEFAULTS, AUTO_APPLY_SUPPORT,
  decide, applyability, nextDelayMinutes, inQuietHours, appliedToday, todayKey
};
if (typeof module !== 'undefined' && module.exports) module.exports = __runner;
if (typeof self !== 'undefined') self.__runner = __runner;
