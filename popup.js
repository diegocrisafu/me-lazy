(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const send = (type, p = {}) => new Promise(r =>
    chrome.runtime.sendMessage({ type, ...p }, x => r(x || {})));

  async function load() {
    const [apps, cfg] = await Promise.all([send('GET_APPLICATIONS'), send('GET_SETTINGS')]);
    const list = Object.values(apps.applications || {});
    $('#s-queued').textContent  = list.filter(r => r.status === 'queued').length;
    $('#s-applied').textContent = list.filter(r => r.appliedAt).length;
    $('#s-oa').textContent      = list.filter(r => r.oaReceivedAt).length;

    const s = cfg.settings || {};
    $('#sub').textContent = `≥ $${((s.minSalaryCAD || 90000) / 1000)}k · ${s.canadaFirst ? 'Canada first' : 'all regions'}`;
    $('#minSalary').value = s.minSalaryCAD ?? 90000;
    $('#allowUnknownSalary').checked = s.allowUnknownSalary !== false;
    $('#canadaFirst').checked = s.canadaFirst !== false;
    $('#lv-intern').checked  = (s.levels || []).includes('intern');
    $('#lv-newgrad').checked = (s.levels || []).includes('newgrad');
    $('#applyMode').value = s.applyMode || 'review';
    hint();

    const p = s.profile || {};
    ['firstName','lastName','email','phone','city','linkedin','github']
      .forEach(k => { if ($('#' + k)) $('#' + k).value = p[k] || ''; });
    SCREENING_KEYS.forEach(k => { if ($('#sc-' + k)) $('#sc-' + k).value = p[k] || ''; });
    renderPreflight();
  }

  const SCREENING_KEYS = ['workAuthCanada','workAuthUS','sponsorship','citizenship',
                          'securityClearance','salaryExpectation','relocate'];

  // Terminal answers — auto-apply is blocked until all are set.
  const REQUIRED_KEYS = ['workAuthCanada','workAuthUS','sponsorship','citizenship',
                         'securityClearance','salaryExpectation'];

  async function renderPreflight() {
    const r = await send('GET_ANSWERS');
    const missing = r.missingCritical || [];
    const el = $('#preflight');
    if (!el) return;
    if (!missing.length) {
      el.className = 'preflight ok';
      el.textContent = 'Ready — auto-apply can be turned on from the dashboard.';
    } else {
      el.className = 'preflight blocked';
      el.textContent = `${missing.length} answer${missing.length > 1 ? 's' : ''} still needed before auto-apply can start.`;
    }
  }

  function hint() {
    $('#mode-hint').textContent = $('#applyMode').value === 'auto'
      ? 'Submits without a human look. It still refuses to submit when a screening question it cannot answer is blank.'
      : 'Opens the form, fills it, and stops so you can check the screening answers before submitting.';
  }

  $('#applyMode').addEventListener('change', hint);

  $('#hunt').addEventListener('click', async () => {
    $('#hunt').disabled = true;
    $('#hunt').textContent = 'Hunting…';
    const r = await send('START_HUNT');
    $('#hunt').textContent = r.error ? 'Failed' : `+${r.found} queued`;
    await load();
    setTimeout(() => { $('#hunt').disabled = false; $('#hunt').textContent = 'Run hunt'; }, 2500);
  });

  $('#dash').addEventListener('click', () => send('OPEN_DASHBOARD'));

  document.querySelectorAll('.t').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.t').forEach(x => x.classList.toggle('t-on', x === t));
    $('#p-settings').hidden = t.dataset.p !== 'settings';
    $('#p-profile').hidden  = t.dataset.p !== 'profile';
  }));

  $('#save-settings').addEventListener('click', async () => {
    const levels = [];
    if ($('#lv-intern').checked)  levels.push('intern');
    if ($('#lv-newgrad').checked) levels.push('newgrad');
    await send('SAVE_SETTINGS', { settings: {
      minSalaryCAD: parseInt($('#minSalary').value, 10) || 90000,
      allowUnknownSalary: $('#allowUnknownSalary').checked,
      canadaFirst: $('#canadaFirst').checked,
      levels: levels.length ? levels : ['intern', 'newgrad'],
      applyMode: $('#applyMode').value
    }});
    $('#save-settings').textContent = 'Saved';
    setTimeout(() => { $('#save-settings').textContent = 'Save'; }, 1200);
    load();
  });

  $('#save-profile').addEventListener('click', async () => {
    const cfg = await send('GET_SETTINGS');
    const profile = { ...(cfg.settings?.profile || {}) };
    ['firstName','lastName','email','phone','city','linkedin','github']
      .forEach(k => { profile[k] = $('#' + k).value.trim(); });
    // Stored flat so answers.js reads them directly, with no second mapping
    // that could drift from the answer bank's field names.
    SCREENING_KEYS.forEach(k => {
      const el = $('#sc-' + k);
      if (el) profile[k] = el.value.trim();
    });
    await send('SAVE_SETTINGS', { settings: { profile } });
    $('#save-profile').textContent = 'Saved';
    setTimeout(() => { $('#save-profile').textContent = 'Save profile'; }, 1200);
    renderPreflight();
  });

  load();
})();
