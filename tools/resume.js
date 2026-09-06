#!/usr/bin/env node
/* ═══════════════════════════════════════════
   RÉSUMÉ BUILDER

   One page, single column, real text. Every
   layout trick that looks good to a person —
   two columns, text boxes, tables, icons,
   contact details in a header — is something
   an ATS parser either scrambles or drops, and
   the parse happens before anyone reads it.

   node tools/resume.js            all variants
   node tools/resume.js quant      just one
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const C = require('../resume-content.js');
const browser = require('../daemon/browser.js');

const OUT = path.join(__dirname, '..', 'cv');
const VARIANTS = {
  swe:     { tag: 'swe',     label: 'Software Engineer' },
  quant:   { tag: 'quant',   label: 'Quantitative Developer' },
  data:    { tag: 'data',    label: 'Data Engineer' },
  analyst: { tag: 'analyst', label: 'Business Analyst' }
};

/** Page count read from the PDF itself. */
function countPages(file) {
  const buf = fs.readFileSync(file);
  const m = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bullets for this variant, keeping the résumé's own order. */
function bulletsFor(role, tag, max) {
  const mine = role.bullets.filter(b => b.tags.includes(tag));
  const rest = role.bullets.filter(b => !b.tags.includes(tag));
  return [...mine, ...rest].slice(0, max).map(b => b.text);
}

function render(tag, label, squeeze = 0) {
  const skills = C.SKILLS[tag] || C.SKILLS.swe;
  const summary = C.SUMMARIES[tag] || C.SUMMARIES.swe;

  // The most recent roles carry the most bullets; older ones are compressed
  // so the page holds without dropping a job off it entirely. Squeeze steps
  // take bullets off the oldest roles first, where the least is lost.
  const BUDGETS = [
    [4, 3, 3, 2, 3, 2],
    [4, 3, 2, 2, 2, 2],
    [4, 2, 2, 1, 2, 2],
    [3, 2, 2, 1, 2, 1]
  ];
  const budget = BUDGETS[Math.min(squeeze, BUDGETS.length - 1)];
  const FONT = [9.4, 9.1, 8.9, 8.7][Math.min(squeeze, 3)];

  const jobs = C.EXPERIENCE.map((role, i) => {
    const bs = bulletsFor(role, tag, budget[i] ?? 2);
    if (!bs.length) return '';
    return `<section class="role">
      <div class="rowline">
        <span class="who"><strong>${esc(role.company)}</strong> · ${esc(role.title)}</span>
        <span class="when">${esc(role.dates)}</span>
      </div>
      ${role.note ? `<div class="note">${esc(role.note)}</div>` : ''}
      <ul>${bs.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </section>`;
  }).join('');

  const projects = C.PROJECTS
    .filter(p => p.tags.includes(tag))
    .slice(0, 2)
    .map(p => `<section class="role">
      <div class="rowline">
        <span class="who"><strong>${esc(p.name)}</strong></span>
        <span class="when">${esc(p.dates)}</span>
      </div>
      <ul>${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </section>`).join('');

  const contact = [
    C.CONTACT.location, C.CONTACT.phone, C.CONTACT.email,
    ...C.CONTACT.links.map(l => l.label)
  ].map(esc).join(' &nbsp;|&nbsp; ');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(C.CONTACT.name)}</title>
<style>
  @page { size: letter; margin: 0.45in 0.5in; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Times New Roman", Georgia, serif;
         font-size: ${FONT}pt; line-height: 1.27; color: #000; }
  h1 { font-size: 17pt; letter-spacing: 0.06em; margin: 0 0 2pt;
       text-align: center; font-weight: 700; }
  .contact { text-align: center; font-size: 8.6pt; margin-bottom: 7pt; }
  h2 { font-size: ${FONT}pt; letter-spacing: 0.09em; text-transform: uppercase;
       margin: 8pt 0 3pt; padding-bottom: 1.5pt; border-bottom: 0.75pt solid #000;
       font-weight: 700; }
  p.summary { margin: 0 0 1pt; text-align: justify; }
  .rowline { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
  .who { flex: 1; }
  .when { white-space: nowrap; font-size: 8.8pt; }
  .note { font-style: italic; font-size: 8.6pt; }
  .role { margin-bottom: 4.5pt; }
  ul { margin: 1.5pt 0 0; padding-left: 13pt; }
  li { margin-bottom: 1pt; text-align: justify; }
  .skills div { margin-bottom: 1.5pt; }
  .edu { margin-bottom: 2pt; }
</style></head><body>

<h1>${esc(C.CONTACT.name)}</h1>
<div class="contact">${contact}</div>

<h2>Summary</h2>
<p class="summary">${esc(summary)}</p>

<h2>Skills</h2>
<div class="skills">
  ${Object.entries(skills).map(([k, v]) =>
    `<div><strong>${esc(k)}:</strong> ${esc(v)}</div>`).join('')}
</div>

<h2>Experience</h2>
${jobs}

<h2>Projects</h2>
${projects}

<h2>Education</h2>
${C.EDUCATION.map(e => `<div class="edu rowline">
  <span class="who"><strong>${esc(e.school)}</strong> · ${esc(e.degree)}${e.detail ? ' · ' + esc(e.detail) : ''}</span>
  <span class="when">${esc(e.dates)}</span></div>`).join('')}

</body></html>`;
}

(async () => {
  const only = process.argv[2];
  const picks = only ? { [only]: VARIANTS[only] } : VARIANTS;
  if (only && !VARIANTS[only]) {
    console.log('Unknown variant. One of: ' + Object.keys(VARIANTS).join(', '));
    process.exit(1);
  }

  const ctx = await browser.launch({ headless: true });
  const page = await ctx.newPage();

  for (const [tag, v] of Object.entries(picks)) {
    const htmlPath = path.join(OUT, `.resume-${tag}.html`);
    const pdfPath = path.join(OUT, `Diego Crisafulli - ${v.label}.pdf`);

    // Tighten until it genuinely fits, checking the PDF itself rather than
    // estimating from the page height — the estimate said one page while
    // Chromium was writing two.
    let pages = 0, squeeze = 0;
    for (; squeeze < 4; squeeze++) {
      fs.writeFileSync(htmlPath, render(tag, v.label, squeeze));
      await page.goto('file://' + htmlPath, { waitUntil: 'load' });
      await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true,
                       margin: { top: '0.45in', bottom: '0.45in', left: '0.5in', right: '0.5in' } });
      pages = countPages(pdfPath);
      if (pages === 1) break;
    }
    console.log(`  ${pages === 1 ? 'ok ' : pages + 'pp'}  ${path.basename(pdfPath)}` +
                (squeeze ? `   (tightened ${squeeze}x)` : ''));
    fs.unlinkSync(htmlPath);
  }

  await page.close();
  await ctx.close();
  await browser.closeShared().catch(() => {});
})();
