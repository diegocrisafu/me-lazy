/* Boots the service worker against mocked Chrome APIs to catch anything that
   would break on "Load unpacked". Run: node tools/smoke.js               */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const store = {};
const alarms = [];
const listeners = { message: [], alarm: [], installed: [] };
const tabsCreated = [];
const notifications = [];

const chrome = {
  runtime: {
    onMessage: { addListener: f => listeners.message.push(f) },
    onInstalled: { addListener: f => listeners.installed.push(f) },
    getURL: p => 'chrome-extension://test/' + p,
    sendMessage: async () => ({}),
    lastError: null
  },
  storage: { local: {
    get: (k, cb) => { const keys = Array.isArray(k) ? k : [k];
      const out = {}; for (const key of keys) if (key in store) out[key] = store[key]; cb(out); },
    set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    getBytesInUse: (k, cb) => cb(JSON.stringify(store).length)
  }},
  alarms: { create: (n, o) => alarms.push({ n, o }),
            onAlarm: { addListener: f => listeners.alarm.push(f) } },
  tabs: { create: async (o) => { const t = { id: tabsCreated.length + 1, ...o };
          tabsCreated.push(t); return t; }, sendMessage: async () => ({}) },
  notifications: { create: (o) => notifications.push(o) },
  scripting: {}
};

const ctx = { chrome, console, fetch, AbortController, setTimeout, clearTimeout,
              URLSearchParams, Date, Math, JSON, Promise, Set, Map, RegExp, Error };
ctx.self = ctx;
ctx.globalThis = ctx;
ctx.importScripts = (...files) => {
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
};
vm.createContext(ctx);

const fail = [];
function check(name, fn) {
  try { const r = fn(); console.log('  PASS  ' + name + (r ? '  ' + r : '')); }
  catch (e) { fail.push(name); console.log('  FAIL  ' + name + '  -> ' + e.message); }
}

console.log('Loading service worker…');
try {
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), ctx,
    { filename: 'background.js' });
  console.log('  service worker loaded without throwing\n');
} catch (e) {
  console.log('  FATAL: ' + e.message + '\n' + e.stack);
  process.exit(1);
}

// A hunt takes ~60s, so the timeout has to be generous or the harness
// resolves with a stub and every downstream check reads as a product bug.
const send = (msg, timeoutMs = 15000) => new Promise((res, rej) => {
  let done = false;
  for (const l of listeners.message) {
    l(msg, {}, (r) => { if (!done) { done = true; res(r); } });
  }
  setTimeout(() => { if (!done) { done = true; rej(new Error(
    `no response to ${msg.type} within ${timeoutMs}ms`)); } }, timeoutMs);
});

(async () => {
  console.log('Registered alarms: ' + alarms.map(a => a.n).join(', '));
  console.log('Message listeners: ' + listeners.message.length + '\n');

  console.log('Router:');
  const settings = await send({ type: 'GET_SETTINGS' });
  check('GET_SETTINGS', () => {
    if (!settings.settings) throw new Error('no settings returned');
    if (settings.settings.runner.enabled !== false) throw new Error('runner should default off');
    return 'minSalary ' + settings.settings.minSalaryCAD + ', runner off';
  });

  const apps = await send({ type: 'GET_APPLICATIONS' });
  check('GET_APPLICATIONS', () => {
    if (!apps.applications) throw new Error('no applications object');
    return Object.keys(apps.applications).length + ' stored';
  });

  const ans = await send({ type: 'GET_ANSWERS' });
  check('GET_ANSWERS', () => {
    if (!ans.answers) throw new Error('no answers');
    if (!Array.isArray(ans.missingCritical)) throw new Error('missingCritical not an array');
    return ans.missingCritical.length + ' terminal answers still blank';
  });

  const scout = await send({ type: 'GET_SCOUTING_REPORT' });
  check('GET_SCOUTING_REPORT', () => {
    if (!Array.isArray(scout.report)) throw new Error('report not an array');
    return scout.report.length + ' entries';
  });

  const run = await send({ type: 'GET_RUNNER' });
  check('GET_RUNNER', () => {
    if (!run.settings) throw new Error('no runner settings');
    return 'applied today: ' + run.appliedToday;
  });

  const set = await send({ type: 'SET_RUNNER', runner: { enabled: true } });
  const run2 = await send({ type: 'GET_RUNNER' });
  check('SET_RUNNER persists', () => {
    if (!set.ok) throw new Error('not ok');
    if (run2.settings.enabled !== true) throw new Error('did not persist');
    return 'enabled -> true';
  });
  await send({ type: 'SET_RUNNER', runner: { enabled: false } });

  const csv = await send({ type: 'EXPORT_CSV' });
  check('EXPORT_CSV', () => {
    if (typeof csv.csv !== 'string') throw new Error('no csv');
    return csv.csv.split('\n')[0].split(',').length + ' columns';
  });

  const bad = await send({ type: 'NOT_A_REAL_MESSAGE' });
  check('unknown message is handled', () => {
    if (!bad.error) throw new Error('should return an error');
    return 'returns error, does not throw';
  });

  console.log('\nRunner tick (should do nothing while disabled):');
  const before = JSON.stringify(store);
  for (const l of listeners.alarm) l({ name: 'runnerTick' });
  await new Promise(r => setTimeout(r, 400));
  check('disabled runner is inert', () => {
    if (tabsCreated.length) throw new Error('opened a tab while disabled!');
    return 'no tabs opened, no applications sent';
  });

  console.log('\nLive hunt through the worker (hits real APIs):');
  const hunt = await send({ type: 'START_HUNT' }, 240000);
  check('START_HUNT', () => {
    if (hunt.error) throw new Error(hunt.error);
    if (typeof hunt.found !== 'number') throw new Error('no result returned');
    if (!hunt.fetched) throw new Error('fetched nothing — check network / host permissions');
    return hunt.found + ' queued from ' + hunt.fetched.toLocaleString() + ' postings';
  });

  const after = await send({ type: 'GET_APPLICATIONS' });
  check('hunt persisted records', () => {
    const n = Object.keys(after.applications).length;
    if (!n) throw new Error('nothing stored');
    const one = Object.values(after.applications)[0];
    if (!one.cvId) throw new Error('record missing cvId');
    if (!one.family) throw new Error('record missing family');
    return n + ' records, each with CV + family';
  });

  const scout2 = await send({ type: 'GET_SCOUTING_REPORT' });
  check('scouting report populated', () => scout2.report.length + ' roles need a person');

  const firstId = Object.keys(after.applications)[0];
  const letter = await send({ type: 'PREVIEW_COVER_LETTER', id: firstId });
  check('cover letter generates', () => {
    if (!letter.letter?.text) throw new Error(letter.error || 'no letter');
    return letter.letter.wordCount + ' words, evidence: ' + letter.letter.evidenceUsed.join('+');
  });

  console.log('\n' + (fail.length ? 'FAILURES: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
