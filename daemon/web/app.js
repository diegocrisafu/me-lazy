/* Application Command Center — local dashboard */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let S = null;                       // full server state
  const view = { name: 'queue', openId: null,
                 filters: { search: '', region: '', family: '', cv: '' } };

  const api = {
    state:    () => fetch('/api/state').then(r => r.json()),
    settings: (b) => fetch('/api/settings', { method: 'POST',
                headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
    update:   (b) => fetch('/api/application', { method: 'POST',
                headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
    letter:   (id) => fetch('/api/cover-letter?id=' + encodeURIComponent(id)).then(r => r.json())
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const fmtDate = iso => {
    if (!iso) return '—';
    const d = Math.round((Date.now() - new Date(iso)) / 86400000);
    return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? d + 'd ago'
      : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const profileById = id => (S.profiles || []).find(p => p.id === id);
  const prioClass = p => p >= 70 ? 'prio prio-hot' : p >= 55 ? 'prio prio-warm' : 'prio';

  function statusPill(s) {
    const cls = { offer:'pill-good', interview:'pill-good', oa_received:'pill-oa',
      oa_completed:'pill-oa', applied:'pill-accent', queued:'pill-mute',
      scouted:'pill-warn', rejected:'pill-bad', ghosted:'pill-warn' }[s] || 'pill-mute';
    const label = { queued:'Queued', scouted:'Needs You', applied:'Applied',
      oa_received:'OA Received', oa_completed:'OA Done', interview:'Interview',
      offer:'Offer', rejected:'Rejected', ghosted:'Ghosted' }[s] || s;
    return `<span class="pill ${cls}">${esc(label)}</span>`;
  }

  function cvPill(r) {
    const p = profileById(r.cvId);
    const c = p?.color || 'var(--text-dim)';
    return `<span class="pill pill-cv" style="background:${c}1a;color:${c};border-color:${c}55">${esc(r.cvShort || '—')}</span>`;
  }

  const salaryCell = r => (!r.salaryDisplay || r.salaryDisplay === '—')
    ? '<span class="salary-soft">undisclosed</span>'
    : (r.salaryConfident ? esc(r.salaryDisplay)
       : `<span class="salary-soft" title="Inferred from the posting">${esc(r.salaryDisplay)}?</span>`);

  /* ─────────── load + render ─────────── */
  async function load() { S = await api.state(); render(); }

  function render() {
    renderSetup(); renderRunner(); renderConflicts();
    renderMetrics(); renderCV(); renderCounts(); renderView();
  }

  function renderSetup() {
    const missing = S.missingCritical || [];
    const noPdf = (S.profiles || []).filter(p => !p.enabled);
    if (!missing.length && !noPdf.length) { $('#setup-alert').hidden = true; return; }
    $('#setup-alert').hidden = false;
    $('#setup-title').textContent = missing.length
      ? 'Auto-apply is blocked' : 'One CV variant has no file';
    $('#setup-body').innerHTML = [
      missing.length ? `${missing.length} terminal answer${missing.length > 1 ? 's' : ''} unset — ` +
        `<strong>${missing.map(esc).join(', ')}</strong>. These decide automatic rejections and are never guessed. ` +
        `Fill them on the <a href="#" data-goto="profile">Profile</a> tab.` : '',
      noPdf.length ? `${noPdf.map(p => esc(p.short)).join(', ')} has no PDF in <code>cv/</code>, so it is never selected.` : ''
    ].filter(Boolean).join('<br>');
  }

  function renderRunner() {
    const r = S.settings.runner, st = S.runnerState || {};
    const on = !!r.enabled;
    $('#runner-dot').className = 'runner-dot' + (on
      ? (st.consecutiveFailures >= r.maxConsecutiveFailures ? ' paused' : ' on') : '');
    $('#runner-label').textContent = on ? 'Auto-apply on' : 'Auto-apply off';
    $('#runner-bar').hidden = !on;
    if (!on) return;
    const d = st.lastDecision;
    $('#runner-state').textContent = d
      ? ({ apply: 'Applying', hunt: 'Hunting', wait: 'Waiting' }[d.action] || d.action) : 'Starting';
    $('#runner-today').textContent = `${S.appliedToday} of ${r.dailyCap} sent today`;
    $('#runner-next').textContent = (r.dryRunRemaining ? `DRY RUN (${r.dryRunRemaining} left) · ` : '') +
      (d?.reason || '');
  }

  function renderConflicts() {
    const rows = [];
    for (const c of S.conditional || []) rows.push(`
      <div class="conflict"><div class="conflict-field">${esc(c.label)}
        <span class="pill pill-accent">conditional</span></div>
        <div class="conflict-claim">On <strong>${esc(c.variant)}</strong> only · ${esc(c.status)}</div>
        <div class="conflict-note">${esc(c.note)} Withheld automatically everywhere else.</div></div>`);
    for (const c of S.conflicts || []) rows.push(`
      <div class="conflict"><div class="conflict-field">${esc(c.field)}
        <span class="pill ${c.severity === 'high' ? 'pill-bad' : 'pill-mute'}">${esc(c.severity)}</span></div>
        ${c.claims.map(cl => `<div class="conflict-claim"><strong>${esc(cl.value)}</strong> — ${
          cl.variants.map(v => esc(profileById(v)?.short || v)).join(', ')}</div>`).join('')}
        <div class="conflict-note">${esc(c.note)}</div></div>`);
    if (!rows.length) return;
    $('#conflict-alert').hidden = false;
    $('#conflict-summary').textContent =
      `${(S.conditional || []).length} conditional claim in force, ` +
      `${(S.conflicts || []).filter(c => c.severity === 'high').length} conflict to resolve.`;
    $('#conflict-list').innerHTML = rows.join('');
  }

  function renderMetrics() {
    const m = S.metrics, list = Object.values(S.applications);
    $('#m-oa').textContent = m.oaReceived;
    $('#m-oa-rate').textContent = m.applied ? `${m.oaRate}% of applications` : 'no applications yet';
    $('#m-queued').textContent = m.queued;
    $('#m-applied').textContent = m.applied;
    $('#m-scouted').textContent = list.filter(r => r.status === 'scouted').length;
    $('#m-interview').textContent = m.interviews;
    $('#m-offers').textContent = m.offers;
    $('#m-response').textContent = m.responseRate + '%';
  }

  function renderCV() {
    const max = Math.max(1, ...S.cv.map(c => c.oaRate));
    $('#cv-grid').innerHTML = S.cv.filter(c => profileById(c.id)).map(c => {
      const p = profileById(c.id);
      return `<div class="cv-card">
        <div class="cv-card-head"><span class="cv-dot" style="background:${p.color}"></span>
          <span class="cv-card-name">${esc(c.name)}</span></div>
        <div class="cv-stats">
          <div><span class="cv-stat-v">${c.queued}</span><span class="cv-stat-l">Queued</span></div>
          <div><span class="cv-stat-v">${c.applied}</span><span class="cv-stat-l">Applied</span></div>
          <div><span class="cv-stat-v">${c.oaReceived}</span><span class="cv-stat-l">OAs</span></div>
        </div>
        <div class="cv-bar"><div class="cv-bar-fill" style="width:${c.oaRate / max * 100}%;background:${p.color}"></div></div>
        <div class="cv-rate">${c.applied ? c.oaRate + '% assessment rate' : 'no data yet'}</div>
      </div>`;
    }).join('');
  }

  function renderCounts() {
    const l = Object.values(S.applications);
    $('#c-queue').textContent = l.filter(r => r.status === 'queued').length;
    $('#c-apps').textContent  = l.filter(r => !['queued','scouted'].includes(r.status)).length;
    $('#c-scout').textContent = S.scouting.length;
  }

  function filtered(list) {
    const f = view.filters, q = f.search.toLowerCase().trim();
    return list.filter(r =>
      (!q || `${r.title} ${r.company}`.toLowerCase().includes(q)) &&
      (!f.region || r.region === f.region) &&
      (!f.family || r.family === f.family) &&
      (!f.cv || r.cvId === f.cv));
  }

  function renderView() {
    ['queue','applications','scouting','profile','sources']
      .forEach(v => $('#view-' + v).hidden = view.name !== v);
    $('#filters').hidden = !['queue','applications'].includes(view.name);
    ({ queue: renderQueue, applications: renderApps, scouting: renderScout,
       profile: renderProfile, sources: renderSources })[view.name]();
  }

  function renderQueue() {
    const rows = filtered(Object.values(S.applications).filter(r => r.status === 'queued'))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    $('#queue-empty').hidden = rows.length > 0;
    $('#queue-body').innerHTML = rows.map(r => `<tr data-id="${esc(r.id)}">
      <td><span class="${prioClass(r.priority)}">${r.priority ?? '—'}</span></td>
      <td><div class="role-title">${esc(r.title)}</div>
        <div class="role-sub">${r.duplicateCount > 1 ? `+${r.duplicateCount - 1} duplicates · ` : ''}${
          r.ageDaysAtFind != null ? r.ageDaysAtFind + 'd old' : 'age unknown'} · ${esc(r.location || '')}</div></td>
      <td>${esc(r.company)}</td>
      <td><span class="pill pill-mute">${esc(r.family || '—')}</span></td>
      <td>${salaryCell(r)}</td>
      <td>${cvPill(r)}</td>
      <td>${r.oaPlatform ? `<span class="pill pill-oa">${esc(r.oaPlatform)}</span>` : '<span class="salary-soft">—</span>'}</td>
    </tr>`).join('');
  }

  function renderApps() {
    const rows = filtered(Object.values(S.applications)
      .filter(r => !['queued','scouted'].includes(r.status)))
      .sort((a, b) => new Date(b.appliedAt || b.foundAt) - new Date(a.appliedAt || a.foundAt));
    $('#apps-empty').hidden = rows.length > 0;
    $('#apps-body').innerHTML = rows.map(r => `<tr data-id="${esc(r.id)}">
      <td><div class="role-title">${esc(r.title)}</div>
        <div class="role-sub">${esc(r.location || '')}</div></td>
      <td>${esc(r.company)}</td><td>${cvPill(r)}</td>
      <td>${fmtDate(r.appliedAt)}</td><td>${statusPill(r.status)}</td>
      <td>${r.applyResult?.dir
        ? `<a class="d-link" href="/evidence/${encodeURI(r.applyResult.dir)}/before-submit.png" target="_blank">screenshot ↗</a>`
        : '<span class="salary-soft">—</span>'}</td>
    </tr>`).join('');
  }

  function renderScout() {
    $('#scout-empty').hidden = S.scouting.length > 0;
    $('#scout-list').innerHTML = S.scouting.map(s => `
      <div class="scout-card">
        <div class="scout-head">
          <div><div class="scout-title"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a></div>
            <div class="scout-co">${esc(s.company)} · ${esc(s.location || '—')}</div></div>
          <div class="scout-meta">
            <span class="${prioClass(s.priority)}">${s.priority ?? '—'}</span>
            <span class="pill pill-mute">${esc(s.level || '—')}</span>
            ${s.salaryDisplay && s.salaryDisplay !== '—' ? `<span class="pill pill-good">${esc(s.salaryDisplay)}</span>` : ''}
            ${s.oaPlatform ? `<span class="pill pill-oa">${esc(s.oaPlatform)}</span>` : ''}
          </div>
        </div>
        <div class="scout-why"><strong>Why you:</strong> ${esc(s.reason)}</div>
        ${s.summary ? `<div class="scout-summary">${esc(s.summary)}…</div>` : ''}
        <div class="scout-actions">
          <a class="scout-link" href="${esc(s.url)}" target="_blank" rel="noopener">Open application</a>
          <button class="btn btn-sm act-letter" data-id="${esc(s.id)}">Copy cover letter</button>
          <button class="btn btn-sm act-done" data-id="${esc(s.id)}">Mark applied</button>
          ${s.evidence ? `<a class="btn btn-sm" href="/evidence/${encodeURI(s.evidence)}/before-submit.png" target="_blank">Screenshot</a>` : ''}
          <span class="scout-cv">Attach: <strong>${esc(s.cvShort || '—')}</strong></span>
        </div>
      </div>`).join('');
  }

  const PROFILE_FIELDS = [
    ['firstName','First name','text'], ['lastName','Last name','text'],
    ['email','Email','email'], ['phone','Phone','text'],
    ['city','City','text'], ['province','Province','text'],
    ['postalCode','Postal code','text'], ['country','Country','text'],
    ['linkedin','LinkedIn URL','text'], ['github','GitHub URL','text'],
    ['website','Portfolio URL','text'],
    ['workAuthCanada','Authorised to work in Canada','yesno', true],
    ['workAuthUS','Authorised to work in the US','yesno', true],
    ['sponsorship','Will require visa sponsorship','yesno', true],
    ['citizenship','Citizenship / status','status', true],
    ['securityClearance','Active security clearance','yesno', true],
    ['salaryExpectation','Salary expectation (CAD/yr)','text', true],
    ['relocate','Willing to relocate','yesno'],
    ['startDate','Earliest start date','text']
  ];

  function renderProfile() {
    const p = S.settings.profile || {};
    const missing = new Set(S.missingCritical || []);
    $('#profile-form').innerHTML = PROFILE_FIELDS.map(([k, label, type, critical]) => {
      const bad = critical && missing.has(k);
      const input = type === 'yesno'
        ? `<select id="p-${k}" class="input"><option value="">— required —</option>
             <option${p[k] === 'Yes' ? ' selected' : ''}>Yes</option>
             <option${p[k] === 'No' ? ' selected' : ''}>No</option></select>`
        : type === 'status'
        ? `<select id="p-${k}" class="input"><option value="">— required —</option>
             ${['Canadian citizen','Permanent resident','Work permit','Student visa','Other']
               .map(o => `<option${p[k] === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input id="p-${k}" class="input" type="${type}" value="${esc(p[k] || '')}" />`;
      return `<label class="form-field${bad ? ' form-field-bad' : ''}">
        <span>${esc(label)}${critical ? ' <em>terminal</em>' : ''}</span>${input}</label>`;
    }).join('');
  }

  function renderSources() {
    $('#sources-body').innerHTML = (S.sources || []).map(s => `<tr>
      <td class="role-title">${esc(s.name)}</td><td>${esc(s.country)}</td>
      <td><span class="pill pill-mute">${esc(s.ats)}</span></td>
      <td>${s.verified === true ? '<span class="pill pill-good">live</span>'
        : s.verified === false ? '<span class="pill pill-warn">unverified</span>'
        : '<span class="pill pill-mute">custom</span>'}</td>
      <td>${s.jobs != null ? s.jobs.toLocaleString() : '—'}</td>
      <td>${s.oa != null ? Math.round(s.oa * 100) + '%' : '—'}</td></tr>`).join('')
      || '<tr><td colspan="6" class="empty">No source data. Run a hunt.</td></tr>';
  }

  /* ─────────── drawer ─────────── */
  function openDrawer(id) {
    const r = S.applications[id];
    if (!r) return;
    view.openId = id;
    $('#d-title').textContent = r.title;
    $('#d-company').textContent = `${r.company} · ${r.location || '—'}`;
    $('#d-meta').innerHTML = [
      ['Family', r.family || '—'], ['Level', (r.level || '—') + (r.levelInferred ? ' (inferred)' : '')],
      ['Pay', r.salaryDisplay], ['Priority', r.priority ?? '—'],
      ['Assessment', r.oaPlatform || 'unknown'], ['Applied', fmtDate(r.appliedAt)]
    ].map(([l, v]) => `<div class="d-meta-item"><div class="d-meta-l">${esc(l)}</div>
      <div class="d-meta-v">${esc(v)}</div></div>`).join('');

    const p = profileById(r.cvId);
    $('#d-cv-choice').innerHTML =
      `<span class="cv-dot" style="background:${p?.color || '#888'}"></span>${esc(r.cvName || '—')}`;
    $('#d-cv-reason').textContent = r.cvReason || '';
    const rank = r.cvRanking || [], max = Math.max(1, ...rank.map(x => x.score));
    $('#d-cv-bars').innerHTML = rank.map(x => {
      const pp = profileById(x.id);
      return `<div class="cv-bar-row"><span>${esc(x.short)}</span>
        <span class="cv-bar"><span class="cv-bar-fill" style="width:${x.score / max * 100}%;background:${pp?.color || '#888'}"></span></span>
        <span class="cv-bar-num">${x.score}</span></div>`;
    }).join('');

    const ev = r.applyResult;
    $('#d-evidence-section').hidden = !ev;
    if (ev) {
      $('#d-evidence').innerHTML =
        `<p class="cv-reason">${ev.filledCount} fields filled · ${
          ev.submitted ? 'submitted' : esc(ev.blocked || 'not submitted')}</p>` +
        (ev.dir ? `<a class="d-link" href="/evidence/${encodeURI(ev.dir)}/before-submit.png" target="_blank">Open screenshot ↗</a>` : '') +
        (ev.skipped?.length ? `<div class="cv-bars">${ev.skipped.slice(0, 8).map(s =>
          `<div class="conflict-note">${s.critical ? '⚠ ' : ''}${esc(s.label)} — ${esc(s.reason)}</div>`).join('')}</div>` : '');
    }

    $('#d-status').innerHTML = ['queued','scouted','applied','oa_received','oa_completed',
      'interview','offer','rejected','ghosted']
      .map(s => `<option value="${s}"${s === r.status ? ' selected' : ''}>${s}</option>`).join('');
    $('#d-notes').value = r.notes || '';
    $('#d-link').href = r.applyUrl || r.url || '#';
    $('#d-desc').textContent = (r.description || 'No description captured.').slice(0, 4000);
    $('#d-letter').hidden = true;
    $('#d-letter-btn').textContent = 'Generate';
    $('#drawer').hidden = false; $('#drawer-backdrop').hidden = false;
  }
  const closeDrawer = () => {
    $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true; view.openId = null;
  };

  /* ─────────── wiring ─────────── */
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    view.name = t.dataset.view;
    $$('.tab').forEach(x => x.classList.toggle('tab-active', x === t));
    renderView();
  }));

  ['search','region','family','cv'].forEach(k =>
    $('#f-' + k).addEventListener('input', e => { view.filters[k] = e.target.value; renderView(); }));

  $('#btn-runner').addEventListener('click', async () => {
    const on = !!S.settings.runner.enabled;
    if (!on && (S.missingCritical || []).length) {
      alert('Fill these on the Profile tab first — they decide automatic rejections ' +
            'and are never guessed:\n\n' + S.missingCritical.join('\n'));
      return;
    }
    await api.settings({ runner: { enabled: !on } });
    await load();
  });

  $('#btn-export').addEventListener('click', () => { window.location = '/api/csv'; });

  $('#save-profile').addEventListener('click', async () => {
    const profile = {};
    PROFILE_FIELDS.forEach(([k]) => { const el = $('#p-' + k); if (el) profile[k] = el.value.trim(); });
    await api.settings({ profile });
    $('#save-status').textContent = 'Saved';
    await load(); renderProfile();
    setTimeout(() => { $('#save-status').textContent = ''; }, 2000);
  });

  $('#d-save').addEventListener('click', async () => {
    await api.update({ id: view.openId, status: $('#d-status').value, notes: $('#d-notes').value });
    closeDrawer(); await load();
  });

  $('#d-letter-btn').addEventListener('click', async () => {
    const r = await api.letter(view.openId);
    if (r.letter) { $('#d-letter').textContent = r.letter.text; $('#d-letter').hidden = false; }
  });

  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  $('#conflict-toggle').addEventListener('click', () => {
    const el = $('#conflict-list'); el.hidden = !el.hidden;
    $('#conflict-toggle').textContent = el.hidden ? 'Details' : 'Hide';
  });

  document.body.addEventListener('click', async e => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      e.preventDefault();
      const tab = $$('.tab').find(t => t.dataset.view === goto.dataset.goto);
      tab?.click(); return;
    }
    const letter = e.target.closest('.act-letter');
    if (letter) {
      e.stopPropagation();
      const r = await api.letter(letter.dataset.id);
      if (r.letter) { await navigator.clipboard.writeText(r.letter.text).catch(() => {});
        letter.textContent = 'Copied'; setTimeout(() => { letter.textContent = 'Copy cover letter'; }, 1800); }
      return;
    }
    const done = e.target.closest('.act-done');
    if (done) { e.stopPropagation(); await api.update({ id: done.dataset.id, status: 'applied' }); await load(); return; }
    const row = e.target.closest('tr[data-id]');
    if (row) openDrawer(row.dataset.id);
  });

  load();
  setInterval(load, 30000);   // the daemon changes state underneath us
})();
