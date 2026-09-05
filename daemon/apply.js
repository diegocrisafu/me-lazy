/* ═══════════════════════════════════════════
   APPLIER

   Drives a real application form to submission.

   Filling is label-driven rather than selector-
   driven: every input is matched to a question
   by its visible label, then resolved through
   the shared answer bank. That survives the
   markup changes that break hard-coded
   selectors, and it means the popup, the
   pre-flight check and this filler can never
   disagree about what is known.

   Nothing is submitted until a screenshot of the
   filled form is on disk.
   ═══════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const ANSWERS = require('../answers.js');
const RESOLVER = require('../resolver.js');
const store = require('./store.js');

const CV_DIR = path.join(__dirname, '..', 'cv');

/* ─────────── batch field survey ───────────
   Reading a label and a control's state one element at a time costs two
   browser round-trips each. A form with a hundred controls, surveyed twice,
   is four hundred round-trips before a single character is typed — which is
   how the fill budget expired mid-form on the larger applications. Collect
   it all in one pass, then only reach back into the page for the controls
   actually worth filling. */

async function surveyFields(page) {
  return page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();

    function labelOf(el) {
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l && clean(l.textContent)) return clean(l.textContent);
      }
      const own = el.closest('label');
      if (own && clean(own.textContent)) return clean(own.textContent);
      const aria = el.getAttribute('aria-label');
      if (aria) return clean(aria);
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const t = by.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
        if (clean(t)) return clean(t);
      }
      let node = el.parentElement;
      for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
        const l = node.querySelector('label, legend, [class*="label"]');
        if (l && !l.contains(el) && clean(l.textContent)) return clean(l.textContent);
      }
      return clean(el.placeholder || el.name || '');
    }

    const out = [];
    document.querySelectorAll('input, textarea, select').forEach((el, i) => {
      const cls = (el.className || '').toString();
      out.push({
        i,
        tag: el.tagName.toLowerCase(),
        type: (el.type || '').toLowerCase(),
        name: el.name || '',
        hasValue: Boolean(el.value && el.value.trim()),
        disabled: el.disabled || el.readOnly,
        visible: Boolean(el.offsetParent || el.getClientRects().length),
        maxLength: el.maxLength,
        isProxy: /requiredInput/i.test(cls),
        isCombo: el.getAttribute('role') === 'combobox' ||
                 /select__input/.test(cls) ||
                 Boolean(el.closest('[class*="select__container"]')),
        label: labelOf(el)
      });
    });
    return out;
  }).catch(() => []);
}

/* ─────────── field discovery ─────────── */

/** The visible question text for a control, tried in order of reliability. */
async function labelFor(page, handle) {
  return handle.evaluate((el) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && clean(l.textContent)) return clean(l.textContent);
    }
    const own = el.closest('label');
    if (own && clean(own.textContent)) return clean(own.textContent);

    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);

    if (el.getAttribute('aria-labelledby')) {
      const t = el.getAttribute('aria-labelledby').split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || '').join(' ');
      if (clean(t)) return clean(t);
    }

    // Walk up to a field wrapper and take its label-ish descendant.
    let node = el.parentElement;
    for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
      const l = node.querySelector('label, legend, .application-label, [class*="label"]');
      if (l && !l.contains(el) && clean(l.textContent)) return clean(l.textContent);
    }
    return clean(el.placeholder || el.name || '');
  });
}

/* ─────────── filling ─────────── */

/** @param info  one row from surveyFields(), so no round-trip is needed here */
async function fillField(page, handle, info, answers, ctx) {
  let label = info.label;

  // Consent controls frequently carry no readable label at all — only a name
  // like "gdpr_demographic_data_consent_given". Fall back to the name so the
  // control is still recognised rather than silently blocking the form.
  if (!label) {
    const raw = (info.name || '').replace(/[_\[\]]+/g, ' ').trim();
    if (!raw) return null;
    label = raw;
  }

  const r = ANSWERS.answerFor(label, answers);

  if (r.status === 'exact') {
    if (info.tag === 'select') {
      const picked = await selectOption(handle, r.value);
      if (picked) return { field: r.ruleId, label, value: r.value, kind: 'select' };
      if (!r.critical) {
        const guess = await resolveUnknown(page, handle, info, label, answers, ctx);
        if (guess) return guess;
      }
      return null;
    }
    if (info.type === 'radio' || info.type === 'checkbox') {
      return await setChoice(page, handle, label, r.value)
        ? { field: r.ruleId, label, value: r.value, kind: 'choice' } : null;
    }
    if (info.isCombo) {
      // Try each acceptable phrasing until the menu accepts one.
      let rendered = '';
      for (const candidate of (r.alternatives || [r.value])) {
        rendered = await fillCombobox(page, handle, candidate);
        if (rendered) break;
      }
      if (!rendered) {
        // A rule matched but its value is not among the options — the school
        // rule firing on "are you a University of Waterloo student" and trying
        // to answer with a university name into a yes/no menu. The question is
        // still answerable; it just needs reading rather than recognising.
        if (!r.critical) {
          const guess = await resolveUnknown(page, handle, info, label, answers, ctx);
          if (guess) return guess;
        }
        ctx.skipped.push({ label,
          reason: 'no option matched "' + r.value + '"',
          critical: !!r.critical, kind: 'dropdown' });
        return null;
      }
      return { field: r.ruleId, label, value: rendered, kind: 'combobox' };
    }

    await handle.fill(String(r.value), { timeout: 3000 }).catch(() => {});
    // Read back — a fill that React discards is worse than no fill at all,
    // because it reports success while leaving a required field empty.
    const got = await handle.inputValue().catch(() => '');
    if (!got) {
      ctx.skipped.push({ label, reason: 'value did not stick', critical: !!r.critical });
      return null;
    }
    return { field: r.ruleId, label, value: got, kind: 'text' };
  }

  if (r.status === 'consent') {
    if (info.type === 'checkbox') {
      await handle.check({ timeout: 2000 }).catch(() => {});
      const on = await handle.isChecked().catch(() => false);
      return on ? { field: 'consent', label, value: 'checked', kind: 'consent' } : null;
    }
    if (info.tag === 'select' || await isCombobox(handle)) {
      // Consent menus phrase agreement however they like — "Yes",
      // "I acknowledge", "I have read and agree". Try the common wordings,
      // then fall back to the only affirmative option on offer.
      for (const phrase of ['Yes', 'I acknowledge', 'I agree', 'I accept',
                            'Acknowledge', 'Agree', 'Accept', 'I have read']) {
        const v = await fillCombobox(page, handle, phrase);
        if (v) return { field: 'consent', label, value: v, kind: 'consent' };
      }
      const only = await pickSoleAffirmative(page, handle);
      if (only) return { field: 'consent', label, value: only, kind: 'consent' };
      return null;
    }
    if (info.type === 'radio') {
      const ok = await setChoice(page, handle, label, 'Yes');
      return ok ? { field: 'consent', label, value: 'Yes', kind: 'consent' } : null;
    }
    return null;
  }

  if (r.status === 'longform') {
    const letter = ctx.coverLetter;
    const roomy = info.tag === 'textarea' || info.maxLength <= 0 || info.maxLength > 400;
    if (letter && roomy) {
      const text = info.maxLength > 0 && info.maxLength < letter.length
        ? letter.slice(0, info.maxLength) : letter;
      await handle.fill(text);
      return { field: r.ruleId, label, value: '[cover letter]' };
    }
    ctx.skipped.push({ label, reason: 'needs written prose' });
    return null;
  }

  if (r.status === 'demographic') {
    // Select the decline option where the form offers one. Anything else is
    // left alone — a substantive demographic answer is never invented, but
    // several forms mark these required, and declining is what they expect.
    if (info.tag === 'select' || info.isCombo) {
      for (const phrase of r.decline || []) {
        const v = info.tag === 'select'
          ? (await selectOption(handle, phrase) ? phrase : '')
          : await fillCombobox(page, handle, phrase);
        if (v) return { field: r.ruleId, label, value: v, kind: 'declined' };
      }
    }
    ctx.skipped.push({ label, reason: 'demographic — no decline option offered' });
    return null;
  }

  if (!r.critical) {
    const guess = await resolveUnknown(page, handle, info, label, answers, ctx);
    if (guess) return guess;
  }
  ctx.skipped.push({ label, reason: r.reason || 'no saved answer', critical: !!r.critical });
  return null;
}

async function selectOption(handle, value) {
  const want = String(value).toLowerCase();
  const options = await handle.evaluate(el =>
    Array.from(el.options || []).map(o => ({ value: o.value, text: (o.textContent || '').trim() })));
  if (!options.length) return false;

  let match = options.find(o => o.text.toLowerCase() === want || o.value.toLowerCase() === want);
  if (!match) match = options.find(o => o.text.toLowerCase().includes(want));
  if (!match && /^(yes|no)$/i.test(want)) {
    match = options.find(o => new RegExp('^' + want, 'i').test(o.text.trim()));
  }
  if (!match) return false;
  await handle.selectOption({ value: match.value }).catch(() => {});
  return true;
}

/** Answer a control the rule bank could not, by reading what it offers.
    Every employer invents its own questions, so recognising them one by one
    cannot keep pace; reading the options generalises. Terminal questions are
    never routed here — a wrong work-authorisation answer ends the
    application, so those stay with the answer bank. */
async function resolveUnknown(page, handle, info, label, answers, ctx) {
  if (info.tag !== 'select' && !info.isCombo &&
      !['radio', 'checkbox'].includes(info.type)) {
    const r = RESOLVER.resolve(label, [], answers);
    if (!r || r.confidence !== 'high') return null;
    await handle.fill(String(r.value), { timeout: 3000 }).catch(() => {});
    const got = await handle.inputValue().catch(() => '');
    return got ? { field: 'resolved', label, value: got, kind: 'resolved' } : null;
  }

  if (info.tag === 'select') {
    const opts = await handle.evaluate(el =>
      Array.from(el.options || []).map(o => (o.textContent || '').trim())).catch(() => []);
    const r = RESOLVER.resolve(label, opts, answers);
    if (!r) return null;
    return (await selectOption(handle, r.value))
      ? { field: 'resolved', label, value: r.value, kind: 'resolved' } : null;
  }

  if (info.isCombo) {
    await handle.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    if (!await handle.click({ timeout: 3000 }).then(() => true).catch(() => false)) return null;
    await page.waitForTimeout(400);

    const n = await countOptions(page);
    if (!n || n > 60) { await page.keyboard.press('Escape').catch(() => {}); return null; }

    const texts = await readOptionTexts(page, 60);
    const r = RESOLVER.resolve(label, texts, answers);
    const idx = r ? texts.findIndex(t => t === r.value) : -1;
    if (idx < 0) { await page.keyboard.press('Escape').catch(() => {}); return null; }

    await clickOptionAt(page, idx);
    await page.waitForTimeout(250);
    const rendered = await readComboValue(page, handle);
    return rendered ? { field: 'resolved', label, value: rendered, kind: 'resolved' } : null;
  }
  return null;
}


/* ─────────── react-select comboboxes ───────────
   Greenhouse, Ashby and Lever render dropdowns as a div plus a text input
   with role="combobox" — there is no <select> on the page at all. Calling
   fill() on that input types into a search box and is discarded on blur,
   which looks like a filled field in a log and an empty one on the form.
   The menu has to be opened, an option chosen, and the rendered value read
   back to confirm it stuck. */

function optionScore(optionText, want) {
  const o = optionText.toLowerCase().trim();
  const w = String(want).toLowerCase().trim();
  if (!o) return 0;
  if (o === w) return 100;

  // Yes/No must be exact at the start — "No" must never match "Not sure".
  if (/^(yes|no)$/.test(w)) return new RegExp('^' + w + '\\b').test(o) ? 95 : 0;

  if (o.includes(w) || w.includes(o)) return 80;

  // Token overlap: "Bachelor's, Computer Science" vs "Bachelor's Degree"
  const tok = s => s.split(/[^a-z0-9+#]+/).filter(t => t.length > 2);
  const ow = new Set(tok(o)), ww = tok(w);
  if (!ww.length) return 0;
  const hits = ww.filter(t => ow.has(t)).length;
  return hits ? Math.round((hits / ww.length) * 70) : 0;
}

/** A short key to filter a long menu — full sentences match nothing. */
function searchKey(value) {
  const v = String(value).trim();
  const m = v.match(/\b(19|20)\d{2}\b/);         // a year is the best key for date menus
  if (m) return m[0];
  const first = v.split(/[^A-Za-z0-9']+/).filter(w => w.length > 2)[0];
  return first || v.slice(0, 12);
}

/* Menu-option selectors in priority order. They must not be combined into
   one comma-selector: the phone-number field keeps 246 country entries with
   role="option" in the DOM at all times, so a combined query returns those
   first and a limit truncates the real menu away entirely. Take the first
   selector that matches and stop. */
const OPTION_SELECTORS = [
  '.select__menu .select__option',
  '.select__option',
  '[class*="select__option"]',
  '[role="listbox"]:not([hidden]) [role="option"]',
  '[role="option"]'
];

async function optionSelector(page) {
  for (const sel of OPTION_SELECTORS) {
    const n = await page.$$eval(sel, els => els.length).catch(() => 0);
    if (n > 0) return { sel, n };
  }
  return { sel: null, n: 0 };
}

/** How many options the open menu has, without reading any of them. */
async function countOptions(page) {
  return (await optionSelector(page)).n;
}

/** Option texts in one round-trip.
    Reading textContent per element cost a round-trip each, and a school or
    city menu carries several hundred entries — that alone was minutes per
    form, which is what exhausted the fill budget. */
async function readOptionTexts(page, limit = 400) {
  const { sel } = await optionSelector(page);
  if (!sel) return [];
  return page.$$eval(sel,
    (els, lim) => els.slice(0, lim).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()),
    limit).catch(() => []);
}

/** Click the nth option without holding a handle to every sibling. */
async function clickOptionAt(page, index) {
  const { sel } = await optionSelector(page);
  if (!sel) return false;
  const els = await page.$$(sel);
  const el = els[index];
  if (!el) return false;
  await el.click({ timeout: 3000 }).catch(() => {});
  return true;
}


/** When a consent menu offers a single affirmative choice, take it. */
async function pickSoleAffirmative(page, input) {
  await input.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  const texts = await readOptionTexts(page, 40);
  const usable = texts
    .map((t, i) => ({ t, i }))
    .filter(o => o.t && !/^(select|choose|--|none)/i.test(o.t));

  // Only safe without ambiguity: one option, or a clear affirmative.
  let pick = usable.length === 1 ? usable[0]
           : usable.find(o => /^(yes|i\s|accept|agree|acknowledg)/i.test(o.t));
  if (!pick) { await page.keyboard.press('Escape').catch(() => {}); return ''; }
  await clickOptionAt(page, pick.i);
  await page.waitForTimeout(300);
  return readComboValue(page, input);
}

async function fillCombobox(page, input, value) {
  const want = String(value);

  // Every interaction gets an explicit short timeout. Playwright's default
  // actionability wait is 30s, and a form with a dozen dropdowns that are
  // covered or off-screen turns that into a ten-minute hang.
  await input.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  const opened = await input.click({ timeout: 3000 }).then(() => true).catch(() => false);
  if (!opened) return '';

  // Wait for the menu to actually render rather than a fixed delay. The old
  // per-option read was slow enough to mask this; once it was batched, the
  // count raced the menu open and came back empty.
  await page.waitForSelector(OPTION_SELECTORS[1], { timeout: 2500, state: 'attached' })
    .catch(() => {});

  // Open the menu and see how big it is before reading anything. A school or
  // city list runs to several hundred entries; narrowing first turns that
  // into a handful.
  let n = await countOptions(page);

  if (n === 0 || n > 40) {
    await page.keyboard.type(searchKey(want), { delay: 8 });
    await page.waitForTimeout(400);
    n = await countOptions(page);
  }

  if (!n) {
    await page.keyboard.press('Escape').catch(() => {});
    return '';
  }

  const texts = await readOptionTexts(page, 60);
  let bestIdx = -1, bestScore = 0;
  for (let i = 0; i < texts.length; i++) {
    const s = optionScore(texts[i], want);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }

  // Below this the menu does not contain the answer; guessing at an
  // unrelated option is worse than leaving it for a human.
  if (bestIdx < 0 || bestScore < 40) {
    await page.keyboard.press('Escape').catch(() => {});
    return '';
  }

  await clickOptionAt(page, bestIdx);
  await page.waitForTimeout(220);
  return readComboValue(page, input);
}

/** The text react-select renders once a choice is committed. */
async function readComboValue(page, input) {
  return input.evaluate((el) => {
    const container = el.closest('[class*="select__container"], [class*="select-shell"], [class*="field"]')
                   || el.parentElement?.parentElement?.parentElement;
    if (!container) return '';
    const v = container.querySelector('[class*="singleValue"], [class*="single-value"], [class*="multi-value__label"]');
    return v ? (v.textContent || '').trim() : '';
  });
}

async function isCombobox(handle) {
  return handle.evaluate(el => {
    if (/requiredInput/i.test(el.className || '')) return false;   // the proxy
    return el.getAttribute('role') === 'combobox' ||
           /select__input/.test(el.className || '') ||
           !!el.closest('[class*="select__container"]');
  });
}

async function setChoice(page, handle, label, value) {
  const want = String(value).toLowerCase();
  const own = await handle.evaluate(el => (el.value || '').toLowerCase());
  if (own === want || (own === 'true' && want === 'yes') || (own === 'false' && want === 'no')) {
    await handle.check().catch(() => {});
    return true;
  }
  return false;
}


/* ─────────── radio groups ───────────
   A required radio group is one question rendered as several inputs. Each
   input carries its own option label, and the question text sits above them
   all — so neither the per-input pass nor a naive required-field scan sees
   it. Both have to treat the group as a single unit. */

async function fillChoiceGroups(page, answers, ctx) {
  const groups = await page.evaluate(() => {
    const byName = {};
    // Checkbox groups look like radio groups to a user but share a name with
    // a [] suffix. Greenhouse renders "pick your office" this way, and it is
    // marked required — so it has to be answered, not skipped.
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
      const name = el.name || el.getAttribute('aria-labelledby') || '';
      if (!name) return;
      (byName[name] = byName[name] || []).push(el);
    });
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();

    return Object.entries(byName).map(([name, els]) => {
      const first = els[0];
      // The question is the nearest heading-ish text above the group.
      let question = '';
      let node = first.closest('fieldset, [class*="field"], [class*="question"], div');
      for (let i = 0; i < 5 && node && !question; i++, node = node.parentElement) {
        const l = node.querySelector('legend, label:not([for]), [class*="label"]');
        if (l && !l.querySelector('input')) question = clean(l.textContent);
      }
      // Fall back to the group name for unlabelled consent controls.
      if (!question) question = name.replace(/[_\[\]]+/g, ' ').trim();
      const options = els.map(el => {
        const own = el.closest('label');
        const forLab = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        return { value: el.value, text: clean((own || forLab)?.textContent || el.value) };
      });
      const required = els.some(e => e.required || e.getAttribute('aria-required') === 'true')
        || /\*/.test(question);
      const answered = els.some(e => e.checked);
      const kind = els[0].type;
      // A lone consent checkbox is not a multiple-choice question.
      const single = els.length === 1;
      return { name, question, options, required, answered, kind, single };
    });
  }).catch(() => []);

  const filled = [];
  for (const g of groups) {
    if (g.answered || !g.question) continue;
    const r = ANSWERS.answerFor(g.question, answers);

    let want = null;
    if (r.status === 'exact') want = r.alternatives || [r.value];
    else if (r.status === 'consent') {
      // A single consent checkbox is just ticked.
      if (g.single && g.kind === 'checkbox') {
        const ok = await page.evaluate((name) => {
          const el = document.querySelector(`input[name="${CSS.escape(name)}"]`);
          if (!el) return false;
          if (!el.checked) el.click();
          return el.checked;
        }, g.name).catch(() => false);
        if (ok) filled.push({ field: 'consent', label: g.question, value: 'checked', kind: 'consent' });
        continue;
      }
      want = ['Yes', 'I accept', 'I agree'];
    }
    else { if (g.required) ctx.skipped.push({ label: g.question, reason: r.reason || 'no saved answer' }); continue; }

    let picked = null;
    for (const candidate of want) {
      for (const o of g.options) {
        if (optionScore(o.text, candidate) >= 40) { picked = o; break; }
      }
      if (picked) break;
    }
    if (!picked) {
      const guess = RESOLVER.resolve(g.question, g.options.map(o => o.text), answers);
      if (guess) picked = g.options.find(o => o.text === guess.value) || null;
    }
    if (!picked) {
      if (g.required) ctx.skipped.push({ label: g.question,
        reason: `no option matched (offers: ${g.options.map(o => o.text).slice(0, 4).join(', ')})` });
      continue;
    }

    const ok = await page.evaluate(([name, value]) => {
      const el = document.querySelector(
        `input[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
      if (!el) return false;
      if (!el.checked) el.click();
      return el.checked;
    }, [g.name, picked.value]).catch(() => false);

    if (ok) filled.push({ field: g.kind, label: g.question, value: picked.text, kind: g.kind });
  }
  return filled;
}

/* ─────────── resume + cover letter upload ─────────── */

async function attachFiles(page, record, ctx) {
  const out = { resume: null, coverLetter: null, transcript: null };
  const inputs = await page.$$('input[type="file"]');
  if (!inputs.length) return out;

  const cvPath = path.join(CV_DIR, record.cvFile || '');
  const haveCV = record.cvFile && fs.existsSync(cvPath);

  // Optional: drop transcript.pdf into cv/ and required-transcript forms
  // become submittable instead of landing on the scouting report.
  const transcript = ['transcript.pdf', 'Transcript.pdf']
    .map(f => path.join(CV_DIR, f)).find(f => fs.existsSync(f)) || null;

  for (const input of inputs) {
    // File widgets label the button, not the question — both inputs on a
    // Greenhouse form read "Attach", so the label alone cannot tell a résumé
    // slot from a transcript slot. Read the surrounding block's text instead.
    const context = await input.evaluate(el => {
      const clean = s => (s || '').replace(/\s+/g, ' ').trim();
      let node = el.parentElement, best = '';
      for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
        const t = clean(node.textContent);
        if (t.length > best.length && t.length < 400) best = t;
        if (/transcript|resume|cv\b|cover\s*letter/i.test(best)) break;
      }
      return { text: best, name: (el.name || '') + ' ' + (el.id || '') };
    }).catch(() => ({ text: '', name: '' }));

    const label = context.text.toLowerCase();
    const name = context.name.toLowerCase();
    const hay = label + ' ' + name;

    const isCover = /cover|lettre|motivation/.test(hay);
    // Several employers — Five Rings, DRW — make an academic transcript a
    // required upload and refuse the form without one. Supplying it turns
    // those from scouting entries back into submittable applications.
    const isTranscript = /transcript|relev[ée]\s*de\s*notes|academic\s*record|grade\s*report/.test(hay);
    const isResume = (/resume|cv\b|curriculum/.test(hay) && !isTranscript) ||
                     (!isCover && !isTranscript && !out.resume);

    try {
      let target = null;
      if (isCover && ctx.coverLetterFile) target = ctx.coverLetterFile;
      else if (isTranscript && transcript) target = transcript;
      else if (isResume && haveCV) target = cvPath;
      if (!target && !isCover && !isResume && !isTranscript && transcript && !out.transcript) {
        // An unrecognised extra file slot on a form that already has a résumé
        // is, on these employers, the transcript request.
        target = transcript;
      }
      if (!target) {
        if (isTranscript) {
          ctx.skipped.push({ label: label || 'transcript',
            reason: 'no transcript in cv/ — add transcript.pdf to unlock these',
            critical: true });
        }
        continue;
      }

      await input.setInputFiles(target, { timeout: 5000 });
      // These inputs are visually-hidden and wrapped in a custom widget, so
      // React only notices the file if it sees the event.
      await input.evaluate(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // The widget uploads asynchronously; a screenshot taken too early shows
      // an empty field even though the input holds the file.
      await page.waitForTimeout(2500);

      const attached = await input.evaluate(el => el.files && el.files.length ? el.files[0].name : '');
      if (!attached) {
        ctx.skipped.push({ label: label || 'file', reason: 'file did not attach', critical: isResume });
        continue;
      }
      if (isCover) out.coverLetter = attached;
      else if (isTranscript) out.transcript = attached;
      else out.resume = attached;
    } catch (e) {
      ctx.skipped.push({ label: label || 'file input', reason: 'upload failed: ' + e.message,
                         critical: isResume });
    }
  }

  if (!out.resume && haveCV) ctx.skipped.push({ label: 'resume', reason: 'no file input matched' });
  if (!haveCV) ctx.skipped.push({ label: 'resume', reason: `CV not on disk: ${record.cvFile}`, critical: true });
  return out;
}

/* ─────────── per-ATS entry points ─────────── */

/* ─────────── getting to the form ───────────
   Two things routinely stand between a job URL and a fillable form, and
   both look identical to a filler that only counts DOM nodes: a cookie
   banner covering the page, and a form that stays collapsed until an
   "Apply" button is pressed. Several boards ship the form in the DOM
   while hiding it, so the presence of a file input proves nothing —
   only visible fields do. */

async function dismissOverlays(page) {
  const accepts = [
    'button:has-text("Accept all")', 'button:has-text("Accept All")',
    'button:has-text("Accept cookies")', 'button:has-text("Accept")',
    'button:has-text("I agree")', 'button:has-text("Got it")',
    'button:has-text("Allow all")', 'button:has-text("Tout accepter")',
    '#onetrust-accept-btn-handler', '[aria-label*="accept" i]'
  ];
  for (const sel of accepts) {
    const el = await page.$(sel).catch(() => null);
    if (!el) continue;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    await el.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

/** Visible, fillable controls — the only count that means anything. */
async function visibleFieldCount(page) {
  return page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('input, textarea, select').forEach(el => {
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(el.type)) return;
      if (el.disabled) return;
      if (!(el.offsetParent || el.getClientRects().length)) return;
      n++;
    });
    return n;
  }).catch(() => 0);
}

async function openForm(page, record) {
  const url = record.applyUrl || record.url;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await dismissOverlays(page);

  const triggers = [
    'a:has-text("Apply for this job")', 'button:has-text("Apply for this job")',
    'a:has-text("Apply now")', 'button:has-text("Apply now")',
    'a:has-text("Apply")', 'button:has-text("Apply")',
    '[data-testid*="apply" i]', 'a[href*="apply" i]'
  ];

  // Try up to twice: an Apply click sometimes navigates to a page that
  // itself needs the banner dismissed before the form renders.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (await visibleFieldCount(page) >= 4) break;

    let clicked = false;
    for (const sel of triggers) {
      const el = await page.$(sel).catch(() => null);
      if (!el) continue;
      if (!await el.isVisible().catch(() => false)) continue;
      await el.click({ timeout: 3000 }).catch(() => {});
      clicked = true;
      break;
    }
    if (!clicked) break;

    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await dismissOverlays(page);
  }

  return page.url();
}

async function findSubmit(page) {
  const candidates = [
    'button[type="submit"]', 'input[type="submit"]',
    'button:has-text("Submit application")', 'button:has-text("Submit Application")',
    'button:has-text("Submit")', 'button:has-text("Send application")'
  ];
  for (const sel of candidates) {
    const el = await page.$(sel);
    if (!el) continue;
    const usable = await el.evaluate(e => !e.disabled &&
      !!(e.offsetParent || e.getClientRects().length));
    if (usable) return el;
  }
  return null;
}

/**
 * Fill and (optionally) submit one application.
 *
 * @returns {{ok, submitted, filled, skipped, blocked, screenshots, dir}}
 */
async function applyTo(ctxBrowser, record, opts = {}) {
  const settings = opts.settings || store.getSettings();
  const answers = ANSWERS.defaultAnswers(settings.profile || {}, opts.cvFacts || {},
                                         { region: record.region });
  const dryRun = Boolean(opts.dryRun);

  const dir = store.artifactDir(record);
  const ctx = {
    skipped: [],
    coverLetter: opts.coverLetter || null,
    coverLetterFile: null
  };

  // A cover letter on disk, so forms wanting an upload get one too.
  if (ctx.coverLetter) {
    ctx.coverLetterFile = path.join(dir, 'cover-letter.txt');
    fs.writeFileSync(ctx.coverLetterFile, ctx.coverLetter);
  }

  const page = await ctxBrowser.newPage();
  // Element actions get a short leash so one covered control cannot stall
  // the run. Navigation needs far longer — setDefaultTimeout caps both, and
  // an 8s cap silently failed every page slower than that.
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(45000);
  const shots = [];
  const filled = [];
  const deadline = Date.now() + (opts.budgetMs || 420000);

  try {
    const formUrl = await openForm(page, record);

    // Fill, then fill again — some forms reveal conditional questions only
    // after an earlier answer is set.
    for (let pass = 0; pass < 2; pass++) {
      const survey = await surveyFields(page);
      const controls = await page.$$('input, textarea, select');

      // Only reach into the page for controls that could actually take a
      // value. Skipping the rest here — rather than inside fillField after
      // two round-trips — is what keeps a large form inside the budget.
      const worth = survey.filter(f =>
        !f.disabled && f.visible && !f.hasValue && !f.isProxy &&
        !['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(f.type));

      for (const info of worth) {
        if (Date.now() > deadline) { ctx.skipped.push({ label: '(remaining fields)',
          reason: 'time budget exhausted', critical: true }); break; }
        const handle = controls[info.i];
        if (!handle) continue;
        const r = await fillField(page, handle, info, answers, ctx).catch(() => null);
        if (r && !filled.some(f => f.label === r.label)) filled.push(r);
      }
      if (pass === 0) await page.waitForTimeout(800);
    }

    // Radio groups after the per-input passes, so conditional groups revealed
    // by earlier answers are present by now.
    for (const g of await fillChoiceGroups(page, answers, ctx)) {
      if (!filled.some(f => f.label === g.label)) filled.push(g);
    }

    const files = await attachFiles(page, record, ctx);

    // Required fields the form still considers empty. This is the check that
    // catches a filler which reported success but left the form blank.
    const empties = await page.evaluate(() => {
      const out = [];
      const clean = s => (s || '').replace(/\s+/g, ' ').trim();

      // Choice groups: required if any member is, empty unless one is checked.
      // A checkbox's .value is "on" whether or not it is ticked, so the
      // generic value test below would pass every unchecked required box.
      const groups = {};
      document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
        const n = el.name; if (!n) return;
        (groups[n] = groups[n] || []).push(el);
      });
      for (const [name, els] of Object.entries(groups)) {
        if (els.some(e => e.checked)) continue;
        let q = '', node = els[0].closest('fieldset, [class*="field"], div');
        for (let i = 0; i < 5 && node && !q; i++, node = node.parentElement) {
          const l = node.querySelector('legend, label:not([for]), [class*="label"]');
          if (l && !l.querySelector('input')) q = clean(l.textContent);
        }
        const req = els.some(e => e.required || e.getAttribute('aria-required') === 'true') || /\*/.test(q);
        if (req) out.push(q || name);
      }

      document.querySelectorAll('input, textarea, select').forEach(el => {
        const req = el.required || el.getAttribute('aria-required') === 'true';
        if (!req) return;
        if (el.type === 'radio' || el.type === 'checkbox') return;  // grouped above
        if (el.type === 'file') { if (!el.files?.length) out.push(el.id || el.name || 'file'); return; }
        // A dropdown is judged by what react-select rendered, never by the
        // proxy input, which stays empty even on a correctly chosen option.
        const container = el.closest('[class*="select__container"]');
        if (container) {
          const proxy = /requiredInput/i.test(el.className || '');
          if (proxy) return;                       // the combobox speaks for it
          if (el.getAttribute('role') === 'combobox') {
            const v = container.querySelector('[class*="singleValue"], [class*="single-value"], [class*="multi-value__label"]');
            if (!v || !v.textContent.trim()) {
              const lab = container.querySelector('label');
              out.push((lab?.textContent || el.id || 'dropdown').replace(/\s+/g, ' ').trim());
            }
            return;
          }
        }
        if (!el.value || !el.value.trim()) {
          const lab = document.querySelector(`label[for="${el.id}"]`);
          out.push((lab?.textContent || el.name || el.id || 'field').replace(/\s+/g, ' ').trim());
        }
      });
      return [...new Set(out)];
    }).catch(() => []);
    ctx.requiredStillEmpty = empties;

    // Evidence before any irreversible action.
    const shotPath = path.join(dir, 'before-submit.png');
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
    shots.push(shotPath);

    // Two fill passes mean gaps are recorded twice, and a field that failed
    // on the first pass but succeeded on the second must not still read as a
    // gap — otherwise a working form looks broken.
    const filledLabels = new Set(filled.map(f => f.label));
    const seen = new Set();
    ctx.skipped = ctx.skipped.filter(s => {
      if (filledLabels.has(s.label)) return false;
      const k = s.label + '|' + s.reason;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    const criticalGaps = ctx.skipped.filter(s => s.critical);
    let blocked = null;
    let submitted = false;

    if (!filled.length) {
      blocked = 'no form found on the page — nothing was filled';
    } else if (criticalGaps.length) {
      blocked = 'unanswered: ' + criticalGaps.map(s => s.label).join('; ');
    } else if (ctx.requiredStillEmpty && ctx.requiredStillEmpty.length) {
      // Submitting a form the page itself considers incomplete either fails
      // validation or sends a half-empty application. Neither is acceptable.
      blocked = 'required still empty: ' + ctx.requiredStillEmpty.slice(0, 6).join('; ');
    } else if (dryRun) {
      blocked = 'dry run — filled and captured, not submitted';
    } else {
      const btn = await findSubmit(page);
      if (!btn) {
        blocked = 'submit control not found';
      } else {
        await btn.click();
        await page.waitForTimeout(6000);
        const outcome = await confirmSubmitted(page);
        submitted = outcome === true;
        if (outcome === 'challenge') {
          blocked = 'Greenhouse asked for an emailed security code — ' +
                    'open the link, paste the code and resubmit';
        }
        const after = path.join(dir, 'after-submit.png');
        await page.screenshot({ path: after, fullPage: true }).catch(() => {});
        shots.push(after);
        if (!submitted && !blocked) blocked = 'clicked submit but no confirmation appeared';
      }
    }

    const result = {
      ok: true, submitted, blocked,
      url: formUrl,
      filled, skipped: ctx.skipped, files,
      requiredStillEmpty: ctx.requiredStillEmpty || [],
      screenshots: shots, dir,
      at: new Date().toISOString()
    };
    store.writeArtifact(dir, 'result.json', result);
    store.writeArtifact(dir, 'answers.json',
      Object.fromEntries(filled.map(f => [f.field || f.label, f.value])));
    return result;

  } catch (e) {
    const shot = path.join(dir, 'error.png');
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const result = { ok: false, submitted: false, error: e.message,
                     filled, skipped: ctx.skipped, screenshots: [shot], dir,
                     at: new Date().toISOString() };
    store.writeArtifact(dir, 'result.json', result);
    return result;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Did the page actually acknowledge the submission? */
async function confirmSubmitted(page) {
  const text = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');

  // Greenhouse sometimes challenges a submission with a code emailed to the
  // applicant, and the application is not filed until that code is entered.
  // The page looks nothing like a failure, so without this it reads as sent.
  if (/security code|verification code|enter the code|resubmit your application/i.test(text)) {
    return 'challenge';
  }
  const positive = /thank you|application (?:has been )?(?:submitted|received|sent)|we(?:'ve| have) received|submission (?:received|successful)|merci|candidature (?:re[çc]ue|envoy[ée]e)/i;
  const stillForm = await page.$('input[type="file"], button:has-text("Submit")');
  if (positive.test(text)) return true;
  // A form that vanished is the other reliable signal.
  return !stillForm;
}

module.exports = { applyTo, labelFor, findSubmit, confirmSubmitted, CV_DIR };
