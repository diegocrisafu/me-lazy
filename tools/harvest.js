#!/usr/bin/env node
/* ═══════════════════════════════════════════
   QUESTION HARVESTER

   Visits one posting per employer and records
   every question it asks, with the options it
   offers. Employers reuse their question set
   across all their postings, so answering IMC's
   six questions once unlocks every IMC role —
   which is far better leverage than inferring
   the same answer over and over at submit time.

   Output is a catalogue split three ways: what
   is already answered, what the resolver can
   decide, and what genuinely needs Diego. The
   last list is ranked by how many postings each
   question is blocking.

   Run: node tools/harvest.js [employers]
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const browser = require('../daemon/browser.js');
const store = require('../daemon/store.js');
const ANSWERS = require('../answers.js');
const RESOLVER = require('../resolver.js');

const BOOK = path.join(__dirname, '..', 'data', 'answer-book.json');

/** Questions are matched on a normalised form so trivial wording differences
    — punctuation, the required asterisk, case — do not create duplicates. */
function keyOf(question) {
  return String(question).toLowerCase()
    .replace(/[✱*]+/g, ' ')
    .replace(/[^a-z0-9\s?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function harvestOne(ctx, rec) {
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(8000);
  try {
    await page.goto(rec.applyUrl || rec.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Dismiss a cookie wall and open the form if it is behind a button.
    for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Accept all")',
                       'button:has-text("Accept")']) {
      const el = await page.$(sel).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 2000 }).catch(() => {}); break;
      }
    }
    const visible = await page.evaluate(() => document.querySelectorAll('input,select,textarea').length);
    if (visible < 5) {
      for (const sel of ['a:has-text("Apply for this job")', 'button:has-text("Apply")']) {
        const el = await page.$(sel).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) {
          await el.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(2500); break;
        }
      }
    }

    // Every question, with whatever the control offers.
    return await page.evaluate(() => {
      const clean = s => (s || '').replace(/\s+/g, ' ').trim();
      const labelOf = el => {
        if (el.id) {
          const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (l && clean(l.textContent)) return clean(l.textContent);
        }
        const own = el.closest('label');
        if (own && clean(own.textContent)) return clean(own.textContent);
        const aria = el.getAttribute('aria-label');
        if (aria) return clean(aria);
        let n = el.parentElement;
        for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
          const l = n.querySelector('label, legend, [class*="label"]');
          if (l && !l.contains(el) && clean(l.textContent)) return clean(l.textContent);
        }
        return clean(el.placeholder || el.name || '');
      };

      const out = [];
      const seenGroup = new Set();

      document.querySelectorAll('input, select, textarea').forEach(el => {
        const type = (el.type || '').toLowerCase();
        if (['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type)) return;
        if (!(el.offsetParent || el.getClientRects().length)) return;
        if (/requiredInput/i.test(el.className || '')) return;

        const required = Boolean(el.required || el.getAttribute('aria-required') === 'true');
        const q = labelOf(el);
        if (!q) return;

        // Radio and checkbox groups are one question, not many.
        if (['radio', 'checkbox'].includes(type)) {
          const name = el.name || q;
          if (seenGroup.has(name)) return;
          seenGroup.add(name);
          const sibs = [...document.querySelectorAll(`input[name="${CSS.escape(name)}"]`)];
          const opts = sibs.map(s => {
            const l = s.closest('label') || (s.id ? document.querySelector(`label[for="${CSS.escape(s.id)}"]`) : null);
            return clean((l && l.textContent) || s.value);
          }).filter(Boolean);
          let group = '';
          let n = el.closest('fieldset, [class*="field"], div');
          for (let i = 0; i < 5 && n && !group; i++, n = n.parentElement) {
            const l = n.querySelector('legend, label:not([for]), [class*="label"]');
            if (l && !l.querySelector('input')) group = clean(l.textContent);
          }
          out.push({ q: group || q, kind: type, required, options: opts.slice(0, 20) });
          return;
        }

        if (el.tagName === 'SELECT') {
          out.push({ q, kind: 'select', required,
            options: [...el.options].map(o => clean(o.textContent)).filter(Boolean).slice(0, 20) });
          return;
        }

        // react-select: the options only exist once opened, so record the
        // question and let the answer be decided at fill time.
        const combo = el.getAttribute('role') === 'combobox' ||
                      /select__input/.test(el.className || '');
        out.push({ q, kind: combo ? 'combobox' : (el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
                   required, options: [] });
      });
      return out;
    }).catch(() => []);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const limit = Number(process.argv[2] || 24);
  const apps = store.getApplications();
  const settings = store.getSettings();
  const answers = ANSWERS.defaultAnswers(settings.profile || {}, {}, { region: 'US' });

  // One posting per employer, most promising first.
  const perCo = new Map();
  for (const r of Object.values(apps)
    .filter(r => r.status === 'queued' || r.status === 'scouted')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    if (!perCo.has(r.companyId)) perCo.set(r.companyId, r);
  }
  const picks = [...perCo.values()].slice(0, limit);

  // How many queued postings each employer has — the leverage of answering.
  const postingCount = {};
  for (const r of Object.values(apps)) {
    if (r.status === 'queued') postingCount[r.companyId] = (postingCount[r.companyId] || 0) + 1;
  }

  const ctx = await browser.launch({ headless: true });
  const catalogue = {};

  for (const rec of picks) {
    const qs = await harvestOne(ctx, rec);
    for (const item of qs) {
      const k = keyOf(item.q);
      if (!k) continue;
      const entry = catalogue[k] || (catalogue[k] = {
        question: item.q, kind: item.kind, required: false,
        options: [], employers: [], postings: 0
      });
      entry.required = entry.required || item.required;
      if (item.options.length > entry.options.length) entry.options = item.options;
      if (!entry.employers.includes(rec.company)) {
        entry.employers.push(rec.company);
        entry.postings += postingCount[rec.companyId] || 1;
      }
    }
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  await browser.closeShared().catch(() => {});
  await ctx.close().catch(() => {});

  // Classify: already answered, resolver can decide, or needs Diego.
  const known = [], resolvable = [], needsYou = [];
  for (const [k, e] of Object.entries(catalogue)) {
    const a = ANSWERS.answerFor(e.question, answers);
    if (a.status === 'exact' || a.status === 'consent' || a.status === 'demographic') {
      known.push({ k, ...e, answer: a.value || '(decline)' });
    } else if (RESOLVER.resolve(e.question, e.options, answers)) {
      resolvable.push({ k, ...e, answer: RESOLVER.resolve(e.question, e.options, answers).value });
    } else {
      needsYou.push({ k, ...e });
    }
  }

  const total = Object.keys(catalogue).length;
  console.log(`\n${total} distinct questions across ${picks.length} employers\n`);
  console.log(`  answered by the bank : ${known.length}`);
  console.log(`  resolver can decide  : ${resolvable.length}`);
  console.log(`  NEEDS YOU            : ${needsYou.length}\n`);

  needsYou.sort((a, b) => (b.required - a.required) || (b.postings - a.postings));
  console.log('QUESTIONS THAT NEED YOU, most postings first:');
  for (const e of needsYou.slice(0, 30)) {
    console.log(`  ${e.required ? '*' : ' '} [${String(e.postings).padStart(3)} postings] ${e.question.slice(0, 84)}`);
    if (e.options.length) console.log(`      offers: ${e.options.slice(0, 6).join(' | ').slice(0, 96)}`);
    console.log(`      ${e.employers.slice(0, 4).join(', ')}`);
  }

  fs.writeFileSync(BOOK, JSON.stringify({
    harvestedAt: new Date().toISOString(),
    catalogue, needsYou: needsYou.map(e => ({
      key: e.k, question: e.question, kind: e.kind, required: e.required,
      options: e.options, employers: e.employers, postings: e.postings, answer: null
    }))
  }, null, 1));
  console.log(`\nwritten to data/answer-book.json — fill in the "answer" fields and they are used verbatim`);
})();
