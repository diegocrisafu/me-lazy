/* ═══════════════════════════════════════════
   STORE

   Plain JSON on disk. The dataset is a few
   thousand records at most, and a single file
   the user can open, diff and back up is worth
   more here than a database.

   Writes go through a temp file and a rename so
   a crash mid-write cannot truncate the store.
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data');
const FILES = {
  applications: path.join(ROOT, 'applications.json'),
  settings:     path.join(ROOT, 'settings.json'),
  runner:       path.join(ROOT, 'runner-state.json'),
  sources:      path.join(ROOT, 'sources.json')
};

function ensure() {
  for (const d of [ROOT, path.join(ROOT, 'screenshots'), path.join(ROOT, 'profiles')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function read(key, fallback) {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(FILES[key], 'utf8'));
  } catch {
    return fallback;
  }
}

/** Atomic: write to a sibling temp file, then rename. */
function write(key, value) {
  ensure();
  const target = FILES[key];
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, target);
  return value;
}

const DEFAULT_SETTINGS = {
  minSalaryCAD: 90000,
  salaryPolicy: 'max',
  allowUnknownSalary: true,
  levels: ['intern', 'newgrad'],
  families: ['swe', 'quant-dev', 'quant-research', 'data', 'analyst'],
  maxRequiredYears: 2,
  regions: ['CA', 'US'],
  maxAgeDays: 45,
  canadaFirst: true,
  excludeAdvancedDegree: true,

  profile: {
    firstName: '', lastName: '', email: '', phone: '',
    address: '', city: 'Montreal', province: 'Quebec',
    postalCode: '', country: 'Canada',
    linkedin: '', github: '', website: '',
    workAuthCanada: '', workAuthUS: '', sponsorship: '',
    citizenship: '', securityClearance: '', salaryExpectation: '',
    relocate: 'Yes', startDate: 'Immediately'
  },

  runner: {
    enabled: false,
    huntEveryMinutes: 180,
    applyEveryMinutes: 7,
    jitterPercent: 45,
    dailyCap: 25,
    maxConsecutiveFailures: 4,
    quietHours: { start: 23, end: 7 },
    requireCriticalAnswers: true,
    // Fill and screenshot but never click submit, for the first N applications.
    dryRunRemaining: 0,
    headless: true
  },

  coverLetter: { enabled: true },
  screenshots: { enabled: true, beforeSubmit: true, onFailure: true }
};

function getSettings() {
  const s = read('settings', null);
  if (!s) return write('settings', DEFAULT_SETTINGS);
  // Merge so new keys appear without wiping what the user set.
  return {
    ...DEFAULT_SETTINGS, ...s,
    profile: { ...DEFAULT_SETTINGS.profile, ...(s.profile || {}) },
    runner:  { ...DEFAULT_SETTINGS.runner,  ...(s.runner  || {}) },
    screenshots: { ...DEFAULT_SETTINGS.screenshots, ...(s.screenshots || {}) }
  };
}
const saveSettings = (s) => write('settings', s);

const getApplications = () => read('applications', {});
const saveApplications = (a) => write('applications', a);

const getRunnerState = () => read('runner', {
  lastHuntAt: null, lastApplyAt: null, consecutiveFailures: 0,
  nextApplyGapMinutes: null, lastDecision: null
});
const saveRunnerState = (s) => write('runner', s);

const getSources = () => read('sources', []);
const saveSources = (s) => write('sources', s);

/** Per-application evidence directory: screenshots, answers, letter, result. */
function artifactDir(record) {
  ensure();
  const day = new Date().toISOString().slice(0, 10);
  const slug = `${record.companyId}_${String(record.title || '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`.replace(/-+$/, '');
  const dir = path.join(ROOT, 'screenshots', `${day}_${slug}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeArtifact(dir, name, contents) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 1));
  return p;
}

module.exports = {
  ROOT, FILES, DEFAULT_SETTINGS,
  getSettings, saveSettings,
  getApplications, saveApplications,
  getRunnerState, saveRunnerState,
  getSources, saveSources,
  artifactDir, writeArtifact, ensure
};
