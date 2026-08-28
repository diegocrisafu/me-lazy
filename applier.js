/* ═══════════════════════════════════════════
   ATS APPLICATION FILLER

   Runs on the application form itself — Greenhouse,
   Lever, Ashby, SmartRecruiters, Workday, Amazon,
   Microsoft — fills what it can from the saved
   profile, and selects the CV variant the pipeline
   chose.

   Two modes:
     review  fills everything and stops at submit
     auto    fills and submits

   Review is the default, and screening questions are
   never guessed. Work authorisation, sponsorship and
   salary answers decide auto-rejections, so anything
   this script is not confident about is left blank
   and flagged rather than filled with a plausible
   guess.
   ═══════════════════════════════════════════ */

(() => {
  'use strict';
  const TAG = '[ACC:apply]';

  let pending = null;
  const ANSWERS = self.__answers;
  const filled = {};
  const skipped = [];

  /* ─────────── React-safe value setting ───────────
     Greenhouse, Lever and Ashby are React apps; assigning
     .value directly updates the DOM but not component
     state, and the value is lost on submit. */
  function setValue(el, value) {
    if (el.value && el.value.trim()) return false;
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value); else el.value = value;

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.outline = '2px solid rgba(10,102,194,.45)';
    setTimeout(() => { el.style.outline = ''; }, 2500);
    return true;
  }

  function labelFor(el) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.textContent.trim();
    }
    const own = el.closest('label');
    if (own) return own.textContent.trim();
    const grp = el.closest('.field, .form-group, [class*="field"], [class*="question"], [data-automation-id]');
    if (grp) {
      const l = grp.querySelector('label, legend, [class*="label"]');
      if (l) return l.textContent.trim();
    }
    return el.getAttribute('aria-label') || el.placeholder || '';
  }

  function signals(el) {
    return [el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
            el.getAttribute('data-automation-id'), labelFor(el)]
      .filter(Boolean).join(' ').toLowerCase();
  }

  /* ─────────── filling ───────────
     Answers come from the shared bank in answers.js, so the popup, the
     runner's pre-flight check and this filler all agree on what is known.
     Anything the bank cannot answer honestly is left blank and reported. */

  function fillOne(el) {
    if (!pending) return;
    if (['file', 'hidden', 'submit', 'button', 'password'].includes(el.type)) return;
    if (el.disabled || el.readOnly) return;
    if (el.value && el.value.trim()) return;

    const label = labelFor(el) || signals(el);
    if (!label) return;

    const r = ANSWERS.answerFor(label, pending.answers || {});

    if (r.status === 'exact') {
      const ok = el.tagName === 'SELECT' ? selectOption(el, r.value) : setValue(el, r.value);
      if (ok) filled[r.ruleId] = r.value;
      return;
    }

    if (r.status === 'longform') {
      // A cover-letter or "why us" box: paste the composed letter.
      const letter = pending.coverLetter;
      if (letter && (el.tagName === 'TEXTAREA' || (el.maxLength ?? 9999) > 200)) {
        const text = el.maxLength > 0 && el.maxLength < letter.length
          ? letter.slice(0, el.maxLength) : letter;
        if (setValue(el, text)) { filled[r.ruleId] = '[cover letter]'; return; }
      }
      skipped.push({ label: label.slice(0, 90), reason: 'needs written prose', kind: r.longformKind });
      return;
    }

    if (r.status === 'demographic') {
      skipped.push({ label: label.slice(0, 90), reason: 'demographic — left for you' });
      return;
    }

    skipped.push({
      label: label.slice(0, 90),
      reason: r.reason || 'no saved answer',
      critical: Boolean(r.critical)
    });
  }

  function selectOption(sel, value) {
    const want = value.toLowerCase();
    for (const o of sel.options) {
      if (o.value.toLowerCase() === want || o.textContent.trim().toLowerCase() === want) {
        sel.value = o.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    for (const o of sel.options) {
      if (o.textContent.toLowerCase().includes(want)) {
        sel.value = o.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  /* ─────────── CV variant selection ───────────
     Where the ATS lets you pick among previously
     uploaded resumes, choose the one the pipeline
     selected so the dashboard's record of which CV
     went out is accurate rather than assumed. */
  function selectResume() {
    if (!pending?.cvFile) return { matched: false, reason: 'no variant assigned' };

    const patterns = (pending.cvPatterns || [])
      .concat(pending.cvFile.toLowerCase().replace(/\.pdf$/, ''));

    const candidates = Array.from(document.querySelectorAll(
      'label, [role="radio"], [class*="resume"], [class*="attachment"], option, [data-automation-id*="file"]'
    ));

    for (const el of candidates) {
      const text = (el.textContent || '').toLowerCase();
      if (!text) continue;
      if (patterns.some(p => p && text.includes(p))) {
        const clickable = el.querySelector('input[type="radio"], button') || el;
        try { clickable.click(); } catch {}
        el.style.outline = '2px solid rgba(109,40,217,.6)';
        return { matched: true, via: text.slice(0, 70) };
      }
    }
    return {
      matched: false,
      reason: `"${pending.cvFile}" not among the uploaded resumes — upload it or attach manually`
    };
  }

  /* ─────────── run ─────────── */
  function fillAll(root = document) {
    root.querySelectorAll('input, textarea, select').forEach(fillOne);
  }

  function findSubmit() {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
    return btns.find(b => /^(submit|submit application|apply|soumettre|postuler)$/i
      .test((b.textContent || b.value || '').trim()));
  }

  async function run() {
    const res = await chrome.runtime.sendMessage({ type: 'GET_PENDING_APPLY' }).catch(() => null);
    pending = res?.pending || null;
    if (!pending || pending.tabId == null) return;   // not a run we initiated

    if (!pending.answers) {
      const a = await chrome.runtime.sendMessage({ type: 'GET_ANSWERS' }).catch(() => null);
      pending.answers = a?.answers || {};
    }

    fillAll();
    const resume = selectResume();

    // Multi-step forms reveal fields progressively.
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) setTimeout(() => fillAll(n), 250);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    const report = {
      type: 'APPLY_RESULT',
      id: pending.id,
      mode: pending.mode,
      answers: filled,
      skipped,
      resume,
      submitted: false
    };

    if (pending.mode === 'auto') {
      // Refuse to submit while a question that decides auto-rejection is
      // still blank, or the right CV could not be attached.
      const blocking = skipped.filter(s => s.critical);
      if (blocking.length) {
        report.blocked = 'unanswered screening question: ' +
          blocking.map(s => s.label).join('; ');
      } else if (!resume.matched && pending.cvFile) {
        report.blocked = resume.reason;
      } else {
        const btn = findSubmit();
        if (btn) { btn.click(); report.submitted = true; }
        else report.blocked = 'submit button not found';
      }
      if (report.blocked) console.warn(`${TAG} auto-submit withheld: ${report.blocked}`);
    }

    chrome.runtime.sendMessage(report).catch(() => {});
    console.log(`${TAG} filled`, Object.keys(filled).length, 'fields;',
      skipped.length, 'left for you;', resume.matched ? 'CV attached' : 'CV not matched');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 900));
  } else {
    setTimeout(run, 900);
  }
})();
