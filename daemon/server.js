#!/usr/bin/env node
/* ═══════════════════════════════════════════
   LOCAL DASHBOARD

   Serves the tracking UI and a small JSON API
   on localhost. Bound to 127.0.0.1 only —
   the data includes a full personal profile
   and should never be reachable off the machine.
   ═══════════════════════════════════════════ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store.js');
const tracker = require('../tracker.js');
const answers = require('../answers.js');
const cover = require('../cover-letter.js');
const runner = require('../runner.js');
const { CV_PROFILES, CV_FACT_CONFLICTS, CV_CONDITIONAL_CLAIMS } = require('../cv-profiles.js');

const PORT = process.env.PORT || 7777;
const WEB = path.join(__dirname, 'web');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
               '.json': 'application/json', '.png': 'image/png' };

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

function scoutingReport() {
  const apps = store.getApplications();
  return Object.values(apps)
    .filter(r => r.status === 'scouted' ||
      (r.status === 'queued' && !runner.applyability({ ats: r.ats }, {}, { missingCritical: [] }).canAuto))
    .map(r => ({
      id: r.id, company: r.company, title: r.title, location: r.location,
      region: r.region, level: r.level, family: r.family,
      salaryDisplay: r.salaryDisplay, priority: r.priority,
      oaPlatform: r.oaPlatform, ats: r.ats,
      url: r.applyUrl || r.url, cvShort: r.cvShort, cvFile: r.cvFile,
      reason: r.scoutReason || (r.ats === 'workday'
        ? 'Workday needs an account with this employer'
        : 'employer runs its own application flow'),
      blockers: r.scoutBlockers || [],
      summary: (r.description || '').replace(/\s+/g, ' ').slice(0, 420),
      evidence: r.applyResult?.dir || null,
      foundAt: r.foundAt
    }))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (p === '/api/state') {
      const apps = store.getApplications();
      const s = store.getSettings();
      const ans = answers.defaultAnswers(s.profile || {});
      return json(res, 200, {
        applications: apps,
        metrics: tracker.metrics(apps),
        cv: tracker.cvPerformance(apps, CV_PROFILES),
        companies: tracker.companyPerformance(apps),
        scouting: scoutingReport(),
        sources: store.getSources(),
        settings: s,
        runnerState: store.getRunnerState(),
        appliedToday: runner.appliedToday(apps),
        missingCritical: answers.missingCritical(ans),
        profiles: CV_PROFILES.map(c => ({ id: c.id, name: c.name, short: c.short,
          color: c.color, file: c.file, enabled: c.enabled !== false,
          families: c.families, conditionalClaim: c.conditionalClaim || null })),
        conflicts: CV_FACT_CONFLICTS,
        conditional: CV_CONDITIONAL_CLAIMS
      });
    }

    if (p === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req);
      const s = store.getSettings();
      const next = { ...s, ...body,
        profile: { ...s.profile, ...(body.profile || {}) },
        runner: { ...s.runner, ...(body.runner || {}) } };
      store.saveSettings(next);
      return json(res, 200, { ok: true, settings: next });
    }

    if (p === '/api/application' && req.method === 'POST') {
      const { id, status, notes } = await readBody(req);
      const apps = store.getApplications();
      if (!apps[id]) return json(res, 404, { error: 'unknown application' });
      if (notes != null) apps[id].notes = notes;
      if (status && status !== apps[id].status) tracker.applyStatus(apps[id], status);
      store.saveApplications(apps);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/cover-letter') {
      const apps = store.getApplications();
      const rec = apps[url.searchParams.get('id')];
      if (!rec) return json(res, 404, { error: 'unknown application' });
      const s = store.getSettings();
      const cv = CV_PROFILES.find(c => c.id === rec.cvId);
      return json(res, 200, { letter: cover.compose(rec, cv, s.profile,
        { level: rec.level, family: rec.family, location: { region: rec.region } }) });
    }

    if (p === '/api/csv') {
      const csv = tracker.toCSV(store.getApplications());
      res.writeHead(200, { 'content-type': 'text/csv',
        'content-disposition': 'attachment; filename="applications.csv"' });
      return res.end(csv);
    }

    // Screenshots and evidence, read-only.
    if (p.startsWith('/evidence/')) {
      const rel = decodeURIComponent(p.slice('/evidence/'.length));
      const abs = path.join(store.ROOT, rel);
      // Never serve outside the data directory.
      if (!abs.startsWith(store.ROOT) || !fs.existsSync(abs)) {
        return json(res, 404, { error: 'not found' });
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
      return fs.createReadStream(abs).pipe(res);
    }

    // Static UI
    const file = p === '/' ? 'index.html' : p.replace(/^\//, '');
    const abs = path.join(WEB, file);
    if (abs.startsWith(WEB) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'text/plain' });
      return fs.createReadStream(abs).pipe(res);
    }
    json(res, 404, { error: 'not found' });

  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

// Loopback only: this serves a full personal profile and application history.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
});
