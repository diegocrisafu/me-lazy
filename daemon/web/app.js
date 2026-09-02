/* ═══════════════════════════════════════════
   Command Center — client

   Views are driven by the URL hash so a section
   can be linked and survives a reload. State is
   refetched on a timer because the runner changes
   it underneath us.
   ═══════════════════════════════════════════ */

(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let S = null;
  const ui = {
    view: 'overview',
    open: null,
    f: { search: '', status: '', cv: '' },
    q: { search: '', region: '', family: '' }
  };

  const VIEWS = {
    overview:     ['Overview', 'Autonomous application pipeline'],
    applications: ['Applications', 'Everything submitted, with the evidence captured at send'],
    queue:        ['Queue', 'Ranked by expected assessments, worked top down'],
    scouting:     ['Scouting report', 'Roles that need you rather than the runner'],
    resumes:      ['Résumés', 'Eleven variants, routed by role family'],
    profile:      ['Profile', 'Details and screening answers used on every form'],
    sources:      ['Sources', 'Employers and the systems their postings come from']
  };

  /* ─────────── helpers ─────────── */

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const icon = (id, w = 16) =>
    `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<use href="#${id}"/></svg>`;

  function ago(iso) {
    if (!iso) return '—';
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const h = Math.round(mins / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.round(h / 24);
    return d < 30 ? d + 'd ago'
      : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* Screenshots are only written for what actually happened: a blocked run
     has before-submit or error, never after-submit. Link what exists. */
  function shotUrl(r, kind) {
    const shots = r.applyResult?.screenshots || [];
    const hit = shots.find(s => s.includes(kind + '-submit'));
    return hit ? '/evidence/' + encodeURI(hit) : null;
  }

  const profileOf = id => (S.profiles || []).find(p => p.id === id);

  function cvTag(r) {
    const p = profileOf(r.cvId);
    const c = p?.color || 'var(--ink-3)';
    return `<span class="cv-tag"><span class="cv-dot" style="background:${c}"></span>${esc(r.cvShort || '—')}</span>`;
  }

  const STATUS = {
    queued: ['Queued', 'b-mute'], scouted: ['Needs you', 'b-warn'],
    applied: ['Applied', 'b-applied'], oa_received: ['Assessment', 'b-oa'],
    oa_completed: ['OA done', 'b-oa'], interview: ['Interview', 'b-good'],
    offer: ['Offer', 'b-good'], rejected: ['Rejected', 'b-bad'], ghosted: ['Ghosted', 'b-warn']
  };
  const statusBadge = s => {
    const [label, cls] = STATUS[s] || [s, 'b-mute'];
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  };

  const prioClass = p => p >= 65 ? 'prio prio-hot' : p >= 52 ? 'prio prio-warm' : 'prio';

  const payCell = r => (!r.salaryDisplay || r.salaryDisplay === '—')
    ? '<span style="color:var(--ink-3)">—</span>'
    : `<span class="num">${esc(r.salaryDisplay)}</span>`;

  function emptyState(el, iconId, title, text, action) {
    el.innerHTML = `<div class="empty">
      <div class="empty-icon">${icon(iconId, 20)}</div>
      <div class="empty-title">${esc(title)}</div>
      <p class="empty-text">${esc(text)}</p>
      ${action || ''}</div>`;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ─────────── api ─────────── */

  const api = {
    state: () => fetch('/api/state').then(r => r.json()),
    post: (path, body) => fetch(path, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    letter: id => fetch('/api/cover-letter?id=' + encodeURIComponent(id)).then(r => r.json()),
    one:    id => fetch('/api/application?id=' + encodeURIComponent(id)).then(r => r.json())
  };

  async function load() {
    try { S = await api.state(); render(); }
    catch { $('#status-text').textContent = 'Daemon unreachable'; }
  }

  /* ─────────── render ─────────── */

  function render() {
    renderStatus();
    renderCounts();
    renderView();
  }

  function renderStatus() {
    const r = S.settings.runner, st = S.runnerState || {};
    const dry = r.dryRunRemaining > 0;
    const paused = st.consecutiveFailures >= r.maxConsecutiveFailures;
    const live = r.enabled && !dry && !paused;

    $('#status-dot').className = 'status-dot' + (live ? ' live' : r.enabled ? ' paused' : '');
    $('#status-text').textContent = !r.enabled ? 'Runner stopped'
      : paused ? 'Paused — repeated failures'
      : dry ? `Rehearsing (${r.dryRunRemaining} left)` : 'Running';
    $('#status-sub').textContent = r.enabled
      ? `${S.appliedToday}/${r.dailyCap} today · ${st.lastDecision?.reason || 'starting'}`
      : 'Start it to begin applying';

    $('#runner-label').textContent = r.enabled ? 'Stop runner' : 'Start runner';
    $('#btn-runner').className = 'btn ' + (r.enabled ? '' : 'btn-primary');
  }

  function renderCounts() {
    const l = Object.values(S.applications);
    $('#n-apps').textContent  = l.filter(r => !['queued', 'scouted'].includes(r.status)).length;
    $('#n-queue').textContent = l.filter(r => r.status === 'queued').length;
    $('#n-scout').textContent = S.scouting.length;
  }

  function renderView() {
    Object.keys(VIEWS).forEach(v => { $('#v-' + v).hidden = v !== ui.view; });
    $$('.nav-item').forEach(b => {
      const on = b.dataset.view === ui.view;
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const [title, sub] = VIEWS[ui.view];
    $('#page-title').textContent = title;
    $('#page-sub').textContent = sub;

    ({ overview: renderOverview, applications: renderApps, queue: renderQueue,
       scouting: renderScout, resumes: renderResumes, profile: renderProfile,
       sources: renderSources })[ui.view]();
  }

  /* ─────────── overview ─────────── */

  function renderOverview() {
    const m = S.metrics;
    const list = Object.values(S.applications);
    const scouted = list.filter(r => r.status === 'scouted').length;

    $('#stats').innerHTML = [
      { k: 'Applications sent', v: m.applied, sub: `${S.appliedToday} today`, cls: 'stat-hero',
        spark: true },
      { k: 'Assessments', v: m.oaReceived, sub: m.applied ? `${m.oaRate}% of sent` : 'none yet' },
      { k: 'In queue', v: m.queued, sub: 'ranked by priority' },
      { k: 'Needs you', v: scouted, sub: 'on the scouting report', cls: scouted ? 'stat-amber' : '' },
      { k: 'Interviews', v: m.interviews, sub: 'reached a human', cls: m.interviews ? 'stat-good' : '' },
      { k: 'Response rate', v: m.responseRate + '%', sub: 'of applications sent' }
    ].map(s => `<div class="stat ${s.cls || ''}">
        <div class="stat-label">${esc(s.k)}</div>
        <div class="stat-value">${esc(String(s.v))}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
        ${s.spark ? sparkline(list) : ''}
      </div>`).join('');

    renderCvPerf();
    renderActivity();
  }

  /* Applications per day over the last fortnight. Hand-drawn rather than
     pulling a charting library into a local tool for one small figure. */
  function sparkline(list) {
    const days = 14, now = new Date(); now.setHours(0, 0, 0, 0);
    const buckets = new Array(days).fill(0);
    for (const r of list) {
      if (!r.appliedAt) continue;
      const d = Math.floor((now - new Date(r.appliedAt).setHours(0, 0, 0, 0)) / 86400000);
      if (d >= 0 && d < days) buckets[days - 1 - d]++;
    }
    if (!buckets.some(Boolean)) return '';
    const max = Math.max(...buckets, 1);
    const w = 100 / days;
    const bars = buckets.map((v, i) => {
      const h = v ? Math.max(8, (v / max) * 100) : 3;
      return `<rect x="${(i * w).toFixed(2)}%" y="${(100 - h).toFixed(2)}%" ` +
             `width="${(w * 0.62).toFixed(2)}%" height="${h.toFixed(2)}%" rx="1" ` +
             `fill="${v ? 'var(--accent)' : 'var(--line)'}"><title>${v} on day ${i + 1}</title></rect>`;
    }).join('');
    return `<svg class="spark" viewBox="0 0 100 100" preserveAspectRatio="none"
      role="img" aria-label="Applications per day, last ${days} days">${bars}</svg>`;
  }

  function renderCvPerf() {
    const rows = (S.cv || []).filter(c => profileOf(c.id));
    if (!rows.length) {
      $('#cv-perf').innerHTML = '<p class="panel-hint">No résumé data yet.</p>';
      return;
    }
    const max = Math.max(1, ...rows.map(c => c.applied));
    $('#cv-perf').innerHTML = rows
      .sort((a, b) => b.applied - a.applied || b.queued - a.queued)
      .map(c => {
        const p = profileOf(c.id);
        const pct = (c.applied / max) * 100;
        return `<div class="cv-row">
          <div class="cv-name"><span class="cv-dot" style="background:${p.color}"></span>${esc(c.short)}</div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${p.color}"></div></div>
          <div class="cv-figs">${c.applied} sent · ${c.oaReceived} OA</div>
        </div>`;
      }).join('');
  }

  function renderActivity() {
    const list = Object.values(S.applications)
      .filter(r => r.appliedAt || r.status === 'scouted')
      .sort((a, b) => new Date(b.lastUpdated || b.foundAt) - new Date(a.lastUpdated || a.foundAt))
      .slice(0, 9);

    if (!list.length) {
      emptyState($('#activity'), 'i-inbox', 'Nothing yet',
        'Activity appears here once the runner starts working the queue.');
      return;
    }
    $('#activity').innerHTML = `<div class="feed">` + list.map(r => {
      const sent = Boolean(r.appliedAt);
      return `<div class="feed-item">
        <span class="feed-icon ${sent ? 'fi-applied' : 'fi-scouted'}">
          ${icon(sent ? 'i-send' : 'i-flag', 12)}</span>
        <div class="feed-text">
          <span class="feed-co">${esc(r.company)}</span> — ${esc(r.title)}
          <div class="t-sub">${sent ? 'Applied with ' + esc(r.cvShort || '—') : esc(r.scoutReason || 'needs you')}</div>
        </div>
        <span class="feed-time">${esc(ago(r.appliedAt || r.lastUpdated))}</span>
      </div>`;
    }).join('') + `</div>`;
  }

  /* ─────────── applications ─────────── */

  function renderApps() {
    const q = ui.f.search.toLowerCase().trim();
    const rows = Object.values(S.applications)
      .filter(r => !['queued', 'scouted'].includes(r.status))
      .filter(r => (!q || `${r.title} ${r.company}`.toLowerCase().includes(q)) &&
                   (!ui.f.status || r.status === ui.f.status) &&
                   (!ui.f.cv || r.cvId === ui.f.cv))
      .sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0));

    $('#apps-body').innerHTML = rows.map(r => `<tr class="row" data-id="${esc(r.id)}" tabindex="0">
      <td><div class="t-main">${esc(r.title)}</div><div class="t-sub">${esc(r.location || '')}</div></td>
      <td>${esc(r.company)}</td>
      <td>${cvTag(r)}</td>
      <td class="num" style="white-space:nowrap">${esc(ago(r.appliedAt))}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${shotUrl(r, 'after') || shotUrl(r, 'before')
        ? `<a class="btn btn-sm" href="${shotUrl(r, 'after') || shotUrl(r, 'before')}" target="_blank" rel="noopener">${icon('i-ext', 13)} Proof</a>`
        : '<span style="color:var(--ink-3)">—</span>'}</td>
    </tr>`).join('');

    $('#apps-empty').innerHTML = '';
    if (!rows.length) {
      emptyState($('#apps-empty'), 'i-send', 'No applications yet',
        Object.values(S.applications).some(r => r.status === 'queued')
          ? 'The queue is populated. Start the runner and submissions will appear here with a screenshot of exactly what was sent.'
          : 'Run a hunt to populate the queue first.');
    }
  }

  /* ─────────── queue ─────────── */

  function renderQueue() {
    const q = ui.q.search.toLowerCase().trim();
    const rows = Object.values(S.applications)
      .filter(r => r.status === 'queued')
      .filter(r => (!q || `${r.title} ${r.company}`.toLowerCase().includes(q)) &&
                   (!ui.q.region || r.region === ui.q.region) &&
                   (!ui.q.family || r.family === ui.q.family))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    $('#queue-body').innerHTML = rows.slice(0, 300).map(r => `<tr class="row" data-id="${esc(r.id)}" tabindex="0">
      <td><span class="${prioClass(r.priority)}">${r.priority ?? '—'}</span></td>
      <td><div class="t-main">${esc(r.title)}</div>
          <div class="t-sub">${esc(r.location || '')}${r.ageDaysAtFind != null ? ' · ' + r.ageDaysAtFind + 'd old' : ''}</div></td>
      <td>${esc(r.company)}</td>
      <td><span class="badge b-mute">${esc(r.family || '—')}</span></td>
      <td>${payCell(r)}</td>
      <td>${cvTag(r)}</td>
    </tr>`).join('');

    $('#queue-empty').innerHTML = '';
    if (!rows.length) {
      emptyState($('#queue-empty'), 'i-layers', 'Queue is empty',
        'Run npm run hunt, or wait for the runner to refresh it on its own schedule.');
    }
  }

  /* ─────────── scouting ─────────── */

  function renderScout() {
    const rows = S.scouting;
    $('#scout-empty').innerHTML = '';
    if (!rows.length) {
      emptyState($('#scout-empty'), 'i-flag', 'Nothing flagged',
        'Roles the runner cannot submit on its own will collect here with a link and a reason.');
      $('#scout-list').innerHTML = '';
      return;
    }
    $('#scout-list').innerHTML = rows.slice(0, 200).map(s => `<article class="scout">
      <div class="scout-top">
        <div style="min-width:0">
          <h3 class="scout-role"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></h3>
          <div class="scout-co">${esc(s.company)} · ${esc(s.location || '—')}</div>
        </div>
        <div class="scout-tags">
          <span class="${prioClass(s.priority)}">${s.priority ?? '—'}</span>
          <span class="badge b-mute">${esc(s.level || '—')}</span>
          ${s.salaryDisplay && s.salaryDisplay !== '—' ? `<span class="badge b-good">${esc(s.salaryDisplay)}</span>` : ''}
          ${s.oaPlatform && s.oaPlatform !== 'unknown' ? `<span class="badge b-oa">${esc(s.oaPlatform)}</span>` : ''}
        </div>
      </div>
      <p class="scout-why"><strong>Why you:</strong> ${esc(s.reason)}</p>
      ${s.summary ? `<p class="scout-desc">${esc(s.summary)}</p>` : ''}
      <div class="scout-acts">
        <a class="btn btn-sm btn-primary" href="${esc(s.url)}" target="_blank" rel="noopener">
          ${icon('i-ext', 13)} Open application</a>
        <button class="btn btn-sm act-letter" data-id="${esc(s.id)}">${icon('i-copy', 13)} Cover letter</button>
        <button class="btn btn-sm act-done" data-id="${esc(s.id)}">${icon('i-check', 13)} Mark applied</button>
        <span class="scout-cv">Attach ${esc(s.cvShort || '—')}</span>
      </div>
    </article>`).join('');
  }

  /* ─────────── resumes ─────────── */

  function renderResumes() {
    const perf = Object.fromEntries((S.cv || []).map(c => [c.id, c]));
    $('#resumes-body').innerHTML = (S.profiles || []).map(p => {
      const c = perf[p.id] || { queued: 0, applied: 0, oaReceived: 0, oaRate: 0 };
      return `<tr>
        <td><span class="cv-tag"><span class="cv-dot" style="background:${p.color}"></span>${esc(p.name)}</span></td>
        <td>${(p.families || []).map(f => `<span class="badge b-mute">${esc(f)}</span>`).join(' ')}</td>
        <td class="num">${c.queued}</td>
        <td class="num">${c.applied}</td>
        <td class="num">${c.oaReceived}</td>
        <td class="num">${c.applied ? c.oaRate + '%' : '—'}</td>
        <td>${p.enabled
          ? `<span class="t-sub">${esc(p.file)}</span>`
          : `<span class="badge b-warn">no PDF</span>`}</td>
      </tr>`;
    }).join('');

    const claims = [
      ...(S.conditional || []).map(c => `<div style="margin-bottom:12px">
        <div style="font-weight:600;font-size:13.5px">${esc(c.label)}
          <span class="badge b-applied">conditional</span></div>
        <p class="panel-hint" style="margin-top:4px">On ${esc(c.variant)} only · ${esc(c.status)}. ${esc(c.note)}</p>
      </div>`),
      ...(S.conflicts || []).map(c => `<div style="margin-bottom:12px">
        <div style="font-weight:600;font-size:13.5px">${esc(c.field)}
          <span class="badge ${c.severity === 'high' ? 'b-bad' : 'b-mute'}">${esc(c.severity)}</span></div>
        <p class="panel-hint" style="margin-top:4px">${esc(c.note)}</p>
      </div>`)
    ];
    if (claims.length) {
      $('#claims-panel').hidden = false;
      $('#claims-body').innerHTML = claims.join('');
    }
  }

  /* ─────────── profile ─────────── */

  const FIELDS = [
    ['firstName', 'First name', 'text'], ['lastName', 'Last name', 'text'],
    ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
    ['city', 'City', 'text'], ['province', 'Province', 'text'],
    ['postalCode', 'Postal code', 'text'], ['country', 'Country', 'text'],
    ['linkedin', 'LinkedIn URL', 'url'], ['github', 'GitHub URL', 'url'],
    ['website', 'Portfolio URL', 'url'],
    ['workAuthCanada', 'Authorised to work in Canada', 'yn', 1],
    ['workAuthUS', 'Authorised to work in the US', 'yn', 1],
    ['sponsorshipCanada', 'Needs sponsorship in Canada', 'yn', 1],
    ['sponsorshipUS', 'Needs sponsorship in the US', 'yn', 1],
    ['citizenship', 'Status', 'status', 1],
    ['securityClearance', 'Active security clearance', 'yn', 1],
    ['salaryExpectation', 'Salary expectation (CAD)', 'text', 1],
    ['relocate', 'Willing to relocate', 'yn'],
    ['startDate', 'Earliest start date', 'text']
  ];

  function renderProfile() {
    const p = S.settings.profile || {};
    const missing = new Set(S.missingCritical || []);
    $('#profile-form').innerHTML = FIELDS.map(([k, label, type, req]) => {
      const bad = req && missing.has(k);
      const opts = type === 'status'
        ? ['Canadian citizen', 'Permanent resident', 'Work permit', 'Student visa', 'Other']
        : ['Yes', 'No'];
      const control = (type === 'yn' || type === 'status')
        ? `<select class="input" id="p-${k}"><option value="">— select —</option>${
            opts.map(o => `<option${p[k] === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input class="input" id="p-${k}" type="${type}" value="${esc(p[k] || '')}" />`;
      return `<div class="field${bad ? ' field-bad' : ''}">
        <label for="p-${k}">${esc(label)}${req ? '<span class="req">terminal</span>' : ''}</label>
        ${control}</div>`;
    }).join('');
    $('#save-note').textContent = missing.size
      ? `${missing.size} terminal answer${missing.size > 1 ? 's' : ''} missing — the runner will not start`
      : 'All terminal answers set';
  }

  /* ─────────── sources ─────────── */

  function renderSources() {
    $('#sources-body').innerHTML = (S.sources || []).map(s => `<tr>
      <td class="t-main">${esc(s.name)}</td>
      <td>${esc(s.country)}</td>
      <td><span class="badge b-mute">${esc(s.ats)}</span></td>
      <td>${s.verified === true ? '<span class="badge b-good">live</span>'
          : s.verified === false ? '<span class="badge b-warn">unverified</span>'
          : '<span class="badge b-mute">custom</span>'}</td>
      <td class="num">${s.jobs != null ? s.jobs.toLocaleString() : '—'}</td>
      <td class="num">${s.oa != null ? Math.round(s.oa * 100) + '%' : '—'}</td>
    </tr>`).join('');
  }

  /* ─────────── drawer ─────────── */

  async function openDrawer(id) {
    const listed = S.applications[id];
    if (!listed) return;
    ui.open = id;
    // The list payload omits descriptions; pull the full record for the panel.
    const full = await api.one(id).then(x => x.application).catch(() => null);
    const r = full || listed;
    if (ui.open !== id) return;   // closed or switched while fetching
    $('#d-title').textContent = r.title;
    $('#d-co').textContent = `${r.company} · ${r.location || '—'}`;

    const ev = r.applyResult;
    const meta = [
      ['Status', (STATUS[r.status] || [r.status])[0]],
      ['Family', r.family || '—'],
      ['Level', (r.level || '—') + (r.levelInferred ? ' (inferred)' : '')],
      ['Pay', r.salaryDisplay || '—'],
      ['Priority', r.priority ?? '—'],
      ['Assessment', r.oaPlatform || 'unknown']
    ];

    $('#d-body').innerHTML = `
      <div class="dsec"><div class="dmeta">${meta.map(([k, v]) =>
        `<div class="dmeta-item"><div class="dmeta-k">${esc(k)}</div><div class="dmeta-v">${esc(String(v))}</div></div>`).join('')}</div></div>

      <div class="dsec">
        <h4>Résumé chosen</h4>
        <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px">
          <span class="cv-dot" style="background:${profileOf(r.cvId)?.color || '#888'}"></span>${esc(r.cvName || '—')}
        </div>
        <p class="panel-hint" style="margin-top:6px;line-height:1.5">${esc(r.cvReason || '')}</p>
      </div>

      ${ev ? `<div class="dsec">
        <h4>What was sent</h4>
        <p class="panel-hint" style="margin-bottom:9px">${ev.filledCount} fields filled ·
          ${ev.submitted ? 'submitted' : esc(ev.blocked || 'not submitted')}</p>
        ${shotUrl(r, 'before') ? `<a href="${shotUrl(r, 'after') || shotUrl(r, 'before')}" target="_blank" rel="noopener">
          <img class="shot" src="${shotUrl(r, 'before')}" loading="lazy"
               alt="Screenshot of the completed form for ${esc(r.title)} at ${esc(r.company)}, captured before submitting" />
        </a>` : '<p class="panel-hint">No screenshot captured.</p>'}
      </div>` : ''}

      <div class="dsec">
        <h4>Status</h4>
        <select class="input" id="d-status" style="width:100%;margin-bottom:9px">
          ${Object.keys(STATUS).map(s =>
            `<option value="${s}"${s === r.status ? ' selected' : ''}>${STATUS[s][0]}</option>`).join('')}
        </select>
        <textarea class="input" id="d-notes" rows="3" style="width:100%;font-family:var(--sans)"
          placeholder="Notes">${esc(r.notes || '')}</textarea>
        <button class="btn btn-primary" id="d-save" style="margin-top:9px;width:100%">Save</button>
      </div>

      <div class="dsec">
        <h4>Cover letter</h4>
        <button class="btn btn-sm" id="d-letter">${icon('i-copy', 13)} Generate</button>
        <pre class="pre" id="d-letter-out" hidden></pre>
      </div>

      <div class="dsec">
        <h4>Posting</h4>
        <a class="btn btn-sm" href="${esc(r.applyUrl || r.url || '#')}" target="_blank" rel="noopener">
          ${icon('i-ext', 13)} Open original</a>
        <pre class="pre" style="margin-top:9px">${esc((r.description || 'No description captured.').slice(0, 3000))}</pre>
      </div>`;

    $('#drawer').hidden = false;
    $('#scrim').hidden = false;
    $('#d-close').focus();

    $('#d-save').addEventListener('click', async () => {
      await api.post('/api/application', { id, status: $('#d-status').value, notes: $('#d-notes').value });
      closeDrawer(); await load(); toast('Saved');
    });
    $('#d-letter').addEventListener('click', async () => {
      const res = await api.letter(id);
      if (res.letter) {
        $('#d-letter-out').textContent = res.letter.text;
        $('#d-letter-out').hidden = false;
      }
    });
  }

  function closeDrawer() {
    $('#drawer').hidden = true;
    $('#scrim').hidden = true;
    ui.open = null;
  }

  /* ─────────── events ─────────── */

  function go(view) {
    if (!VIEWS[view]) view = 'overview';
    ui.view = view;
    if (location.hash.slice(1) !== view) location.hash = view;
    renderView();
  }

  $$('.nav-item').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));

  $('#btn-runner').addEventListener('click', async () => {
    const on = S.settings.runner.enabled;
    if (!on && (S.missingCritical || []).length) {
      go('profile');
      toast('Fill the terminal answers first — they decide automatic rejections');
      return;
    }
    await api.post('/api/settings', { runner: { enabled: !on } });
    await load();
    toast(on ? 'Runner stopped' : 'Runner started');
  });

  $('#btn-export').addEventListener('click', () => { window.location = '/api/csv'; });

  $('#save-profile').addEventListener('click', async () => {
    const profile = {};
    FIELDS.forEach(([k]) => { const el = $('#p-' + k); if (el) profile[k] = el.value.trim(); });
    await api.post('/api/settings', { profile });
    await load(); renderProfile(); toast('Profile saved');
  });

  const bind = (sel, obj, key) => $(sel)?.addEventListener('input', e => {
    obj[key] = e.target.value; renderView();
  });
  bind('#f-search', ui.f, 'search'); bind('#f-status', ui.f, 'status'); bind('#f-cv', ui.f, 'cv');
  bind('#q-search', ui.q, 'search'); bind('#q-region', ui.q, 'region'); bind('#q-family', ui.q, 'family');

  $('#d-close').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.open) closeDrawer(); });

  document.body.addEventListener('click', async e => {
    const letter = e.target.closest('.act-letter');
    if (letter) {
      const res = await api.letter(letter.dataset.id);
      if (res.letter) {
        await navigator.clipboard.writeText(res.letter.text).catch(() => {});
        toast('Cover letter copied');
      }
      return;
    }
    const done = e.target.closest('.act-done');
    if (done) {
      await api.post('/api/application', { id: done.dataset.id, status: 'applied' });
      await load(); toast('Marked as applied');
      return;
    }
    const row = e.target.closest('tr.row');
    if (row && !e.target.closest('a')) openDrawer(row.dataset.id);
  });

  document.body.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const row = e.target.closest('tr.row');
    if (row) { e.preventDefault(); openDrawer(row.dataset.id); }
  });

  /* ─────────── boot ─────────── */

  (async () => {
    await load();
    // Populate filter options once the shape of the data is known.
    $('#f-status').innerHTML = '<option value="">All statuses</option>' +
      Object.entries(STATUS).filter(([k]) => !['queued', 'scouted'].includes(k))
        .map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('');
    $('#f-cv').innerHTML = '<option value="">All résumés</option>' +
      (S.profiles || []).map(p => `<option value="${p.id}">${esc(p.short)}</option>`).join('');
    const fams = [...new Set(Object.values(S.applications).map(r => r.family).filter(Boolean))];
    $('#q-family').innerHTML = '<option value="">All families</option>' +
      fams.map(f => `<option value="${f}">${esc(f)}</option>`).join('');

    go(location.hash.slice(1) || 'overview');
    setInterval(load, 20000);   // the runner changes state underneath us
  })();
})();
