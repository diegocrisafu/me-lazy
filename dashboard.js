/* ═══════════════════════════════════════════
   Application Command Center — UI
   ═══════════════════════════════════════════ */

(() => {
  'use strict';

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const state = {
    records: {},        // id -> application record
    sources: [],        // company source health
    scouting: [],       // roles that need a person
    runner: null,
    view: 'queue',
    filters: { search: '', region: '', level: '', cv: '', status: '', paidOnly: false },
    openId: null,
    hunting: false
  };

  const PROFILES  = (typeof CV_PROFILES !== 'undefined') ? CV_PROFILES : [];
  const CONFLICTS = (typeof CV_FACT_CONFLICTS !== 'undefined') ? CV_FACT_CONFLICTS : [];
  const CONDITIONAL = (typeof CV_CONDITIONAL_CLAIMS !== 'undefined') ? CV_CONDITIONAL_CLAIMS : [];
  const T = (typeof window !== 'undefined' && window.__tracker) ? window.__tracker : null;

  const STATUSES = T?.STATUSES || ['queued','applied','oa_received','oa_completed','interview','offer','rejected','ghosted'];
  const LABELS   = T?.STATUS_LABELS || {};

  const profileById = (id) => PROFILES.find(p => p.id === id);

  /* ─────────── messaging ─────────── */
  function send(type, payload = {}) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        return resolve({ error: 'Extension context unavailable' });
      }
      chrome.runtime.sendMessage({ type, ...payload }, (r) => resolve(r || {}));
    });
  }

  /* ─────────── helpers ─────────── */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const days = Math.round((Date.now() - d) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function statusPill(status) {
    const cls = { offer:'pill-good', interview:'pill-good',
      oa_received:'pill-oa', oa_completed:'pill-oa',
      applied:'pill-accent', queued:'pill-mute',
      rejected:'pill-bad', ghosted:'pill-warn' }[status] || 'pill-mute';
    return `<span class="pill ${cls}">${esc(LABELS[status] || status)}</span>`;
  }

  function cvPill(record) {
    const p = profileById(record.cvId);
    const color = p?.color || 'var(--text-dim)';
    return `<span class="pill pill-cv" style="background:${color}1a;color:${color};border-color:${color}55">${esc(record.cvShort || record.cvId || '—')}</span>`;
  }

  function prioClass(p) {
    if (p >= 70) return 'prio prio-hot';
    if (p >= 55) return 'prio prio-warm';
    return 'prio';
  }

  function salaryCell(r) {
    if (!r.salaryDisplay || r.salaryDisplay === '—') {
      return '<span class="salary-soft">undisclosed</span>';
    }
    return r.salaryConfident
      ? esc(r.salaryDisplay)
      : `<span class="salary-soft" title="Inferred from the posting body">${esc(r.salaryDisplay)}?</span>`;
  }

  /* ─────────── load ─────────── */
  async function load() {
    const [recs, srcs, scout, runner] = await Promise.all([
      send('GET_APPLICATIONS'),
      send('GET_SOURCES'),
      send('GET_SCOUTING_REPORT'),
      send('GET_RUNNER')
    ]);
    state.records = recs.applications || {};
    state.sources = srcs.sources || [];
    state.scouting = scout.report || [];
    state.runner = runner || null;
    renderAll();
  }

  function renderAll() {
    renderConflicts();
    renderRunner();
    renderMetrics();
    renderCVPerformance();
    renderCurrentView();
    renderCounts();
  }

  /* ─────────── conflicts ─────────── */
  function renderConflicts() {
    const rows = [];

    // Conditional claims are deliberate rules, not mistakes — shown so the
    // rule stays visible and a variant used outside its condition is caught.
    for (const c of CONDITIONAL) {
      rows.push(`
        <div class="conflict">
          <div class="conflict-field">${esc(c.label)}
            <span class="pill pill-accent">conditional</span>
          </div>
          <div class="conflict-claim">On <strong>${esc(c.variant)}</strong> only · ${esc(c.status)}</div>
          <div class="conflict-note">${esc(c.note)} Withheld automatically everywhere else.</div>
        </div>`);
    }

    for (const c of CONFLICTS) {
      rows.push(`
        <div class="conflict">
          <div class="conflict-field">${esc(c.field)}
            <span class="pill ${c.severity === 'high' ? 'pill-bad' : 'pill-mute'}">${esc(c.severity)}</span>
          </div>
          ${c.claims.map(cl => `<div class="conflict-claim"><strong>${esc(cl.value)}</strong> — ${
            cl.variants.map(v => esc(profileById(v)?.short || v)).join(', ')}</div>`).join('')}
          <div class="conflict-note">${esc(c.note)}</div>
        </div>`);
    }

    // Variants declared but missing their PDF cannot be sent.
    const missing = PROFILES.filter(p => p.enabled === false);
    for (const p of missing) {
      rows.push(`
        <div class="conflict">
          <div class="conflict-field">${esc(p.name)}
            <span class="pill pill-warn">needs file</span>
          </div>
          <div class="conflict-note">Upload <strong>${esc(p.file)}</strong> and set
            <code>enabled: true</code> to use this variant. Until then it is never selected.</div>
        </div>`);
    }

    if (!rows.length) return;
    $('#conflict-alert').hidden = false;

    const high = CONFLICTS.filter(c => c.severity === 'high').length;
    $('#conflict-summary').textContent =
      `${CONDITIONAL.length} conditional claim${CONDITIONAL.length === 1 ? '' : 's'} in force` +
      (high ? `, ${high} genuine conflict${high === 1 ? '' : 's'} to resolve` : '') +
      (missing.length ? `, ${missing.length} variant awaiting its PDF` : '') + '.';

    $('#conflict-list').innerHTML = rows.join('');
  }


  /* ─────────── runner ─────────── */
  function renderRunner() {
    const r = state.runner;
    if (!r || !r.settings) return;
    const on = Boolean(r.settings.enabled);

    $('#runner-dot').className = 'runner-dot' +
      (on ? (r.state?.consecutiveFailures >= (r.settings.maxConsecutiveFailures || 4) ? ' paused' : ' on') : '');
    $('#runner-label').textContent = on ? 'Auto-apply on' : 'Auto-apply off';
    $('#runner-bar').hidden = !on;
    if (!on) return;

    const d = r.state?.lastDecision;
    $('#runner-state').textContent = d ? ({
      apply: 'Applying', hunt: 'Hunting', wait: 'Waiting' }[d.action] || d.action) : 'Starting';
    $('#runner-today').textContent =
      `${r.appliedToday || 0} of ${r.settings.dailyCap} sent today`;
    $('#runner-next').textContent = d?.reason || '';
  }

  async function toggleRunner() {
    const on = Boolean(state.runner?.settings?.enabled);
    if (!on) {
      // Never start unattended applying with unanswered critical questions.
      const a = await send('GET_ANSWERS');
      if ((a.missingCritical || []).length) {
        alert('Fill these in on the Profile tab before turning auto-apply on — ' +
          'they decide automatic rejections and are never guessed:\n\n' +
          a.missingCritical.join('\n'));
        return;
      }
    }
    await send('SET_RUNNER', { runner: { enabled: !on } });
    await load();
  }

  /* ─────────── scouting report ─────────── */
  function renderScouting() {
    const rows = state.scouting;
    $('#tab-scout-count').textContent = rows.length;
    $('#scout-empty').hidden = rows.length > 0;

    $('#scout-list').innerHTML = rows.map(s => `
      <div class="scout-card">
        <div class="scout-head">
          <div>
            <div class="scout-title"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a></div>
            <div class="scout-co">${esc(s.company)} · ${esc(s.location || '—')}</div>
          </div>
          <div class="scout-meta">
            <span class="${prioClass(s.priority)}">${s.priority ?? '—'}</span>
            <span class="pill pill-mute">${esc(s.level || '—')}</span>
            ${s.salaryDisplay && s.salaryDisplay !== '—' ? `<span class="pill pill-good">${esc(s.salaryDisplay)}</span>` : ''}
            ${s.oaPlatform ? `<span class="pill pill-oa">${esc(s.oaPlatform)}</span>` : ''}
          </div>
        </div>

        <div class="scout-why"><strong>Why you:</strong> ${esc(s.reason)}${
          s.blockers && s.blockers.length > 1
            ? ' · ' + s.blockers.slice(1).map(esc).join(' · ') : ''}</div>

        ${s.summary ? `<div class="scout-summary">${esc(s.summary)}…</div>` : ''}

        <div class="scout-actions">
          <a class="scout-link" href="${esc(s.url)}" target="_blank" rel="noopener">Open application</a>
          <button class="btn btn-sm act-letter" data-id="${esc(s.id)}">Cover letter</button>
          <button class="btn btn-sm act-done" data-id="${esc(s.id)}">Mark applied</button>
          <span class="scout-cv">Attach: <strong>${esc(s.cvShort || '—')}</strong>${
            s.cvFile ? ` · ${esc(s.cvFile)}` : ''}</span>
        </div>
      </div>`).join('');
  }

  /* ─────────── metrics ─────────── */
  function renderMetrics() {
    const list = Object.values(state.records);
    const applied = list.filter(r => r.appliedAt);
    const oas     = list.filter(r => r.oaReceivedAt);
    const responded = list.filter(r => r.firstResponseAt);

    const turnaround = oas
      .map(r => Math.round((new Date(r.oaReceivedAt) - new Date(r.appliedAt)) / 86400000))
      .filter(d => Number.isFinite(d) && d >= 0)
      .sort((a, b) => a - b);

    $('#m-oa').textContent = oas.length;
    $('#m-oa-rate').textContent = applied.length
      ? `${Math.round(oas.length / applied.length * 1000) / 10}% of applications`
      : 'no applications yet';
    $('#m-queued').textContent    = list.filter(r => r.status === 'queued').length;
    $('#m-applied').textContent   = applied.length;
    $('#m-interview').textContent = list.filter(r => ['interview','offer'].includes(r.status)).length;
    $('#m-offers').textContent    = list.filter(r => r.status === 'offer').length;
    $('#m-response').textContent  = applied.length
      ? `${Math.round(responded.length / applied.length * 1000) / 10}%` : '0%';
    $('#m-ttoa').textContent = turnaround.length
      ? `${turnaround[Math.floor(turnaround.length / 2)]}d` : '—';
  }

  /* ─────────── CV performance ─────────── */
  function renderCVPerformance() {
    const list = Object.values(state.records);
    const buckets = PROFILES.map(p => {
      const mine = list.filter(r => r.cvId === p.id);
      const applied = mine.filter(r => r.appliedAt).length;
      const oa = mine.filter(r => r.oaReceivedAt).length;
      return { p, queued: mine.filter(r => r.status === 'queued').length, applied, oa,
               rate: applied ? Math.round(oa / applied * 1000) / 10 : 0 };
    });
    const maxRate = Math.max(1, ...buckets.map(b => b.rate));

    $('#cv-grid').innerHTML = buckets.map(b => `
      <div class="cv-card">
        <div class="cv-card-head">
          <span class="cv-dot" style="background:${b.p.color}"></span>
          <span class="cv-card-name">${esc(b.p.name)}</span>
        </div>
        <div class="cv-stats">
          <div><span class="cv-stat-v">${b.queued}</span><span class="cv-stat-l">Queued</span></div>
          <div><span class="cv-stat-v">${b.applied}</span><span class="cv-stat-l">Applied</span></div>
          <div><span class="cv-stat-v">${b.oa}</span><span class="cv-stat-l">OAs</span></div>
        </div>
        <div class="cv-bar"><div class="cv-bar-fill" style="width:${b.rate / maxRate * 100}%;background:${b.p.color}"></div></div>
        <div class="cv-rate">${b.applied ? b.rate + '% assessment rate' : 'no data yet'}</div>
      </div>`).join('');
  }

  /* ─────────── filtering ─────────── */
  function filtered(list) {
    const f = state.filters;
    const q = f.search.trim().toLowerCase();
    return list.filter(r => {
      if (q && !(`${r.title} ${r.company}`.toLowerCase().includes(q))) return false;
      if (f.region && r.region !== f.region) return false;
      if (f.level && r.level !== f.level) return false;
      if (f.cv && r.cvId !== f.cv) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.paidOnly && !(r.salaryConfident && (r.salaryAnnualMaxCAD || 0) >= 90000)) return false;
      return true;
    });
  }

  /* ─────────── views ─────────── */
  function renderCurrentView() {
    ['queue','applications','scouting','companies','sources'].forEach(v => {
      $(`#view-${v}`).hidden = state.view !== v;
    });
    $('#filters').hidden = !['queue','applications'].includes(state.view);
    if (state.view === 'queue') renderQueue();
    if (state.view === 'applications') renderApplications();
    if (state.view === 'scouting') renderScouting();
    if (state.view === 'companies') renderCompanies();
    if (state.view === 'sources') renderSources();
  }

  function renderQueue() {
    const rows = filtered(Object.values(state.records).filter(r => r.status === 'queued'))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    $('#queue-empty').hidden = rows.length > 0;
    $('#queue-body').innerHTML = rows.map(r => `
      <tr data-id="${esc(r.id)}">
        <td><span class="${prioClass(r.priority)}">${r.priority ?? '—'}</span></td>
        <td>
          <div class="role-title">${esc(r.title)}</div>
          <div class="role-sub">${r.duplicateCount > 1 ? `+${r.duplicateCount - 1} duplicate listings · ` : ''}${r.ageDaysAtFind != null ? r.ageDaysAtFind + 'd old' : 'age unknown'}</div>
        </td>
        <td>${esc(r.company)}</td>
        <td>${esc(r.location || '—')}</td>
        <td>${esc(r.level || '—')}${r.levelInferred ? '<span class="inferred">inferred</span>' : ''}</td>
        <td>${salaryCell(r)}</td>
        <td>${cvPill(r)}</td>
        <td>${r.oaPlatform ? `<span class="pill pill-oa">${esc(r.oaPlatform)}</span>` : '<span class="salary-soft">—</span>'}</td>
        <td><button class="btn btn-sm btn-primary act-apply" data-id="${esc(r.id)}">Apply</button></td>
      </tr>`).join('');
  }

  function renderApplications() {
    const rows = filtered(Object.values(state.records).filter(r => !['queued','scouted'].includes(r.status)))
      .sort((a, b) => new Date(b.appliedAt || b.foundAt) - new Date(a.appliedAt || a.foundAt));

    $('#apps-empty').hidden = rows.length > 0;
    $('#apps-body').innerHTML = rows.map(r => `
      <tr data-id="${esc(r.id)}">
        <td>
          <div class="role-title">${esc(r.title)}</div>
          <div class="role-sub">${esc(r.location || '')}</div>
        </td>
        <td>${esc(r.company)}</td>
        <td>${cvPill(r)}</td>
        <td>${fmtDate(r.appliedAt)}</td>
        <td>${statusPill(r.status)}</td>
        <td>${r.oaReceivedAt ? fmtDate(r.oaReceivedAt) : '<span class="salary-soft">—</span>'}</td>
        <td>${salaryCell(r)}</td>
        <td><button class="btn btn-sm act-open" data-id="${esc(r.id)}">Open</button></td>
      </tr>`).join('');
  }

  function renderCompanies() {
    const list = Object.values(state.records);
    const map = {};
    for (const r of list) {
      const b = map[r.companyId] || (map[r.companyId] = {
        company: r.company, sector: r.sector, country: r.country,
        applied: 0, oa: 0, expected: r.oaLikelihood });
      if (r.appliedAt) b.applied++;
      if (r.oaReceivedAt) b.oa++;
    }
    const rows = Object.values(map).sort((a, b) => b.oa - a.oa || b.applied - a.applied);
    $('#companies-body').innerHTML = rows.length ? rows.map(b => `
      <tr>
        <td class="role-title">${esc(b.company)}</td>
        <td>${esc(b.sector || '—')}</td>
        <td>${esc(b.country || '—')}</td>
        <td>${b.applied}</td>
        <td>${b.oa}</td>
        <td>${b.applied ? Math.round(b.oa / b.applied * 1000) / 10 + '%' : '—'}</td>
        <td>${b.expected != null ? Math.round(b.expected * 100) + '%' : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">No applications yet.</td></tr>';
  }

  function renderSources() {
    $('#sources-body').innerHTML = state.sources.length ? state.sources.map(s => `
      <tr>
        <td class="role-title">${esc(s.name)}</td>
        <td>${esc(s.country)}</td>
        <td><span class="pill pill-mute">${esc(s.ats)}</span></td>
        <td>${s.verified === true ? '<span class="pill pill-good">live</span>'
             : s.verified === false ? '<span class="pill pill-warn">unverified</span>'
             : '<span class="pill pill-mute">custom</span>'}</td>
        <td>${s.jobs != null ? s.jobs.toLocaleString() : '—'}</td>
        <td>${s.oa != null ? Math.round(s.oa * 100) + '%' : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty">No source data. Run a hunt.</td></tr>';
  }

  function renderCounts() {
    const list = Object.values(state.records);
    $('#tab-queue-count').textContent = list.filter(r => r.status === 'queued').length;
    $('#tab-apps-count').textContent  = list.filter(r => !['queued','scouted'].includes(r.status)).length;
    $('#tab-scout-count').textContent = state.scouting.length;
  }

  /* ─────────── drawer ─────────── */
  function openDrawer(id) {
    const r = state.records[id];
    if (!r) return;
    state.openId = id;

    $('#d-title').textContent   = r.title;
    $('#d-company').textContent = `${r.company} · ${r.location || '—'}`;

    const meta = [
      ['Level', (r.level || '—') + (r.levelInferred ? ' (inferred)' : '')],
      ['Pay', r.salaryDisplay + (r.salaryConfident ? '' : ' (unconfirmed)')],
      ['Priority', r.priority ?? '—'],
      ['Assessment', r.oaPlatform || 'unknown'],
      ['Found', fmtDate(r.foundAt)],
      ['Applied', fmtDate(r.appliedAt)]
    ];
    $('#d-meta').innerHTML = meta.map(([l, v]) =>
      `<div class="d-meta-item"><div class="d-meta-l">${esc(l)}</div><div class="d-meta-v">${esc(v)}</div></div>`).join('');

    const p = profileById(r.cvId);
    $('#d-cv-choice').innerHTML =
      `<span class="cv-dot" style="background:${p?.color || '#888'}"></span>${esc(r.cvName || r.cvId || '—')}`;
    $('#d-cv-reason').textContent = r.cvReason || '';
    if (r.cvClaimOverrodeFit) {
      $('#d-cv-reason').insertAdjacentHTML('afterend',
        '<p class="cv-reason" style="color:var(--warn)">The MSc requirement took precedence over the closer content match.</p>');
    }

    const ranking = r.cvRanking || [];
    const max = Math.max(1, ...ranking.map(x => x.score));
    $('#d-cv-bars').innerHTML = ranking.map(x => {
      const pp = profileById(x.id);
      return `<div class="cv-bar-row">
        <span>${esc(x.short)}</span>
        <span class="cv-bar"><span class="cv-bar-fill" style="width:${x.score / max * 100}%;background:${pp?.color || '#888'}"></span></span>
        <span class="cv-bar-num">${x.score}</span>
      </div>`;
    }).join('');

    $('#d-status').innerHTML = STATUSES.map(s =>
      `<option value="${s}" ${s === r.status ? 'selected' : ''}>${esc(LABELS[s] || s)}</option>`).join('');
    $('#d-notes').value = r.notes || '';
    $('#d-link').href = r.applyUrl || r.url || '#';
    $('#d-desc').textContent = (r.description || 'No description captured.').slice(0, 4000);

    $('#d-letter').hidden = true;
    $('#d-letter-btn').textContent = 'Generate for this role';
    $('#drawer').hidden = false;
    $('#drawer-backdrop').hidden = false;
  }

  function closeDrawer() {
    $('#drawer').hidden = true;
    $('#drawer-backdrop').hidden = true;
    state.openId = null;
  }

  /* ─────────── actions ─────────── */
  async function runHunt() {
    if (state.hunting) return;
    state.hunting = true;
    $('#btn-hunt').disabled = true;
    $('#hunt-label').textContent = 'Hunting…';
    $('#runbar').hidden = false;
    $('#runbar-fill').style.width = '0%';
    $('#runbar-text').textContent = 'Starting…';

    const res = await send('START_HUNT');
    if (res.error) {
      $('#runbar-text').textContent = 'Failed: ' + res.error;
    } else {
      $('#runbar-text').textContent =
        `${res.found} roles queued · ${res.fetched?.toLocaleString?.() || res.fetched} postings scanned` +
        (res.duplicatesCollapsed ? ` · ${res.duplicatesCollapsed} duplicates collapsed` : '');
      $('#runbar-fill').style.width = '100%';
    }
    state.hunting = false;
    $('#btn-hunt').disabled = false;
    $('#hunt-label').textContent = 'Run hunt';
    await load();
    setTimeout(() => { $('#runbar').hidden = true; }, 6000);
  }

  // Progress pushed from the service worker during a hunt
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'HUNT_PROGRESS') {
        const pct = Math.round(msg.done / msg.total * 100);
        $('#runbar').hidden = false;
        $('#runbar-fill').style.width = pct + '%';
        $('#runbar-text').textContent =
          `${msg.done}/${msg.total} sources · ${msg.found} eligible`;
      }
    });
  }

  /* ─────────── wiring ─────────── */
  function wire() {
    $('#btn-hunt').addEventListener('click', runHunt);
    $('#btn-runner').addEventListener('click', toggleRunner);

    $('#btn-export').addEventListener('click', async () => {
      const r = await send('EXPORT_CSV');
      if (!r.csv) return;
      const blob = new Blob([r.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    $('#btn-verify').addEventListener('click', async () => {
      $('#btn-verify').disabled = true;
      $('#btn-verify').textContent = 'Verifying…';
      const r = await send('VERIFY_SOURCES');
      state.sources = r.sources || state.sources;
      state.view = 'sources';
      $$('.tab').forEach(t => t.classList.toggle('tab-active', t.dataset.view === 'sources'));
      renderCurrentView();
      $('#btn-verify').disabled = false;
      $('#btn-verify').textContent = 'Verify sources';
    });

    $$('.tab').forEach(tab => tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      $$('.tab').forEach(t => t.classList.toggle('tab-active', t === tab));
      renderCurrentView();
    }));

    const bind = (sel, key, prop = 'value') =>
      $(sel).addEventListener('input', (e) => {
        state.filters[key] = prop === 'checked' ? e.target.checked : e.target.value;
        renderCurrentView();
      });
    bind('#f-search', 'search');
    bind('#f-region', 'region');
    bind('#f-level', 'level');
    bind('#f-cv', 'cv');
    bind('#f-status', 'status');
    bind('#f-paid', 'paidOnly', 'checked');

    $('#f-cv').innerHTML = '<option value="">All CVs</option>' +
      PROFILES.map(p => `<option value="${p.id}">${esc(p.short)}</option>`).join('');
    $('#f-status').innerHTML = '<option value="">All statuses</option>' +
      STATUSES.map(s => `<option value="${s}">${esc(LABELS[s] || s)}</option>`).join('');

    document.body.addEventListener('click', async (e) => {
      const applyBtn = e.target.closest('.act-apply');
      if (applyBtn) {
        e.stopPropagation();
        const id = applyBtn.dataset.id;
        applyBtn.disabled = true;
        applyBtn.textContent = 'Opening…';
        await send('APPLY_TO', { id });
        await load();
        return;
      }
      const letterBtn = e.target.closest('.act-letter');
      if (letterBtn) {
        e.stopPropagation();
        const r = await send('PREVIEW_COVER_LETTER', { id: letterBtn.dataset.id });
        if (r.letter) {
          await navigator.clipboard.writeText(r.letter.text).catch(() => {});
          letterBtn.textContent = 'Copied';
          setTimeout(() => { letterBtn.textContent = 'Cover letter'; }, 1800);
        }
        return;
      }
      const doneBtn = e.target.closest('.act-done');
      if (doneBtn) {
        e.stopPropagation();
        await send('UPDATE_APPLICATION', { id: doneBtn.dataset.id, status: 'applied' });
        await load();
        return;
      }
      const openBtn = e.target.closest('.act-open');
      if (openBtn) { e.stopPropagation(); openDrawer(openBtn.dataset.id); return; }
      const row = e.target.closest('tr[data-id]');
      if (row) openDrawer(row.dataset.id);
    });

    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    $('#d-save').addEventListener('click', async () => {
      if (!state.openId) return;
      await send('UPDATE_APPLICATION', {
        id: state.openId,
        status: $('#d-status').value,
        notes: $('#d-notes').value
      });
      closeDrawer();
      await load();
    });

    $('#d-letter-btn').addEventListener('click', async () => {
      if (!state.openId) return;
      const r = await send('PREVIEW_COVER_LETTER', { id: state.openId });
      if (r.letter) {
        $('#d-letter').textContent = r.letter.text;
        $('#d-letter').hidden = false;
        $('#d-letter-btn').textContent = 'Regenerate';
      }
    });

    $('#conflict-toggle').addEventListener('click', () => {
      const el = $('#conflict-list');
      el.hidden = !el.hidden;
      $('#conflict-toggle').textContent = el.hidden ? 'Details' : 'Hide';
    });
  }

  wire();
  load();
})();
