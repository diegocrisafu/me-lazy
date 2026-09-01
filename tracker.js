/* ═══════════════════════════════════════════
   APPLICATION TRACKER

   Storage schema and the derived metrics the
   dashboard reads.

   The pipeline is deliberately assessment-first,
   so the status ladder has an explicit assessment
   stage rather than folding it into "in progress".
   That is what makes it possible to measure which
   CV variant actually earns assessments instead of
   guessing.
   ═══════════════════════════════════════════ */

const STATUSES = [
  'queued',        // surfaced by a hunt, not yet applied
  'scouted',       // worth pursuing, but needs a person — see the scouting report
  'applied',       // submitted
  'oa_received',   // assessment invitation arrived  <- the goal
  'oa_completed',  // assessment submitted
  'interview',     // human stage reached
  'offer',
  'rejected',
  'ghosted'        // no movement past the threshold
];

const STATUS_LABELS = {
  queued: 'Queued',
  scouted: 'Needs You',
  applied: 'Applied',
  oa_received: 'OA Received',
  oa_completed: 'OA Done',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted'
};

// Statuses that prove the application got past the resume screen.
const RESPONDED = new Set(['oa_received', 'oa_completed', 'interview', 'offer']);
const GHOST_DAYS = 21;

function makeRecord(job, extra = {}) {
  const now = new Date().toISOString();
  return {
    id: job.id,
    sourceId: job.sourceId,
    companyId: job.companyId,
    company: job.company,
    title: job.title,
    location: job.location,
    region: job.region,
    remote: Boolean(job.remote),
    sector: job.sector,
    country: job.country,
    url: job.url,
    applyUrl: job.applyUrl,
    ats: job.ats,
    autoApply: job.autoApply !== false,

    family: job.family || null,
    level: job.level,
    levelInferred: Boolean(job.levelInferred),
    returnToSchool: Boolean(job.returnToSchool),
    requiredYears: job.requiredYears ?? null,

    // Pay, kept both raw and normalized so the gate is auditable later.
    salaryRaw: job.salary?.raw || null,
    salaryDisplay: job.salaryDisplay || '—',
    salaryAnnualMinCAD: job.salary?.annualMinCAD ?? null,
    salaryAnnualMaxCAD: job.salary?.annualMaxCAD ?? null,
    salaryConfident: Boolean(job.salary?.confident),

    // Which CV went out, and why. The reason matters because the intern
    // rule can override the keyword ranking.
    cvId: job.cvId,
    cvName: job.cvName,
    cvShort: job.cvShort,
    cvFile: job.cvFile,
    cvReason: job.cvReason,
    cvRanking: job.cvRanking || [],
    // Whether the conditional claim applied, and whether preferring it
    // meant passing over a better content match.
    cvConditionMet: Boolean(job.cvConditionMet),
    cvClaimOverrodeFit: Boolean(job.cvClaimOverrodeFit),
    cvWithheld: job.cvWithheld || null,

    matchScore: job.matchScore ?? null,
    priority: job.priority ?? null,
    oaLikelihood: job.oaLikelihood ?? null,
    oaPlatform: job.oaPlatform || null,
    ageDaysAtFind: job.ageDays ?? null,

    status: 'queued',
    appliedAt: null,
    oaReceivedAt: null,
    firstResponseAt: null,
    applyMode: null,            // 'auto' | 'review' | 'manual'
    screeningAnswers: {},       // what was actually submitted, for audit
    notes: '',
    statusHistory: [{ status: 'queued', at: now }],
    foundAt: now,
    lastUpdated: now,
    runId: extra.runId || null
  };
}

function applyStatus(record, status, meta = {}) {
  const now = new Date().toISOString();
  record.status = status;
  record.lastUpdated = now;
  record.statusHistory = record.statusHistory || [];
  record.statusHistory.push({ status, at: now, ...meta });

  if (status === 'applied' && !record.appliedAt) {
    record.appliedAt = now;
    if (meta.mode) record.applyMode = meta.mode;
  }
  if (status === 'oa_received' && !record.oaReceivedAt) record.oaReceivedAt = now;
  if (RESPONDED.has(status) && !record.firstResponseAt) record.firstResponseAt = now;
  return record;
}

/** Applications with no movement past the ghost threshold. */
function findGhosted(records, days = GHOST_DAYS) {
  const cutoff = Date.now() - days * 86400000;
  return records.filter(r =>
    r.status === 'applied' &&
    r.appliedAt &&
    new Date(r.appliedAt).getTime() < cutoff
  );
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

/* ─────────── METRICS ─────────── */

function metrics(records) {
  const list = Object.values(records || {});
  const applied = list.filter(r => r.appliedAt);
  const oas = list.filter(r => r.oaReceivedAt);
  const responded = list.filter(r => r.firstResponseAt);

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = 0;
  for (const r of list) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  const turnarounds = oas
    .map(r => daysBetween(r.appliedAt, r.oaReceivedAt))
    .filter(d => d != null && d >= 0);

  return {
    total: list.length,
    queued: byStatus.queued || 0,
    applied: applied.length,
    oaReceived: oas.length,
    interviews: list.filter(r => ['interview', 'offer'].includes(r.status)).length,
    offers: byStatus.offer || 0,
    byStatus,
    // The headline number: assessments per application.
    oaRate: applied.length ? Math.round((oas.length / applied.length) * 1000) / 10 : 0,
    responseRate: applied.length ? Math.round((responded.length / applied.length) * 1000) / 10 : 0,
    medianDaysToOA: turnarounds.length
      ? turnarounds.sort((a, b) => a - b)[Math.floor(turnarounds.length / 2)]
      : null
  };
}

/** Per-CV performance. With three variants in rotation this is the
    only way to tell which resume is actually working. */
function cvPerformance(records, profiles = []) {
  const list = Object.values(records || {});
  const out = {};

  for (const p of profiles) {
    out[p.id] = { id: p.id, name: p.name, short: p.short, color: p.color,
                  queued: 0, applied: 0, oaReceived: 0, responded: 0, offers: 0,
                  oaRate: 0, responseRate: 0 };
  }
  for (const r of list) {
    const b = out[r.cvId] || (out[r.cvId] = { id: r.cvId, name: r.cvName || r.cvId,
      short: r.cvShort || r.cvId, queued: 0, applied: 0, oaReceived: 0, responded: 0, offers: 0 });
    if (r.status === 'queued') b.queued++;
    if (r.appliedAt) b.applied++;
    if (r.oaReceivedAt) b.oaReceived++;
    if (r.firstResponseAt) b.responded++;
    if (r.status === 'offer') b.offers++;
  }
  for (const b of Object.values(out)) {
    b.oaRate = b.applied ? Math.round((b.oaReceived / b.applied) * 1000) / 10 : 0;
    b.responseRate = b.applied ? Math.round((b.responded / b.applied) * 1000) / 10 : 0;
  }
  return Object.values(out);
}

/** Which employers actually convert applications into assessments. */
function companyPerformance(records) {
  const list = Object.values(records || {});
  const out = {};
  for (const r of list) {
    const b = out[r.companyId] || (out[r.companyId] = {
      companyId: r.companyId, company: r.company, sector: r.sector, country: r.country,
      applied: 0, oaReceived: 0, responded: 0
    });
    if (r.appliedAt) b.applied++;
    if (r.oaReceivedAt) b.oaReceived++;
    if (r.firstResponseAt) b.responded++;
  }
  return Object.values(out)
    .map(b => ({ ...b, oaRate: b.applied ? Math.round((b.oaReceived / b.applied) * 1000) / 10 : 0 }))
    .sort((a, b) => b.oaReceived - a.oaReceived || b.applied - a.applied);
}

function toCSV(records) {
  const cols = ['company','title','location','region','level','salaryDisplay',
                'cvShort','cvReason','status','priority','oaPlatform',
                'foundAt','appliedAt','oaReceivedAt','applyMode','url'];
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = Object.values(records || {})
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map(r => cols.map(c => esc(r[c])).join(','));
  return [cols.join(','), ...rows].join('\n');
}

const __tracker = {
    STATUSES, STATUS_LABELS, RESPONDED, GHOST_DAYS,
    makeRecord, applyStatus, findGhosted, metrics,
    cvPerformance, companyPerformance, toCSV, daysBetween
  };

// Node (tests) and browser / service-worker (importScripts or <script>)
if (typeof module !== 'undefined' && module.exports) module.exports = __tracker;
if (typeof self !== 'undefined') self.__tracker = __tracker;
