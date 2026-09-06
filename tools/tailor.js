#!/usr/bin/env node
/* ═══════════════════════════════════════════
   TAILOR ONE APPLICATION

   For the roles worth an hour: rewrite the CV
   against this specific posting and draft a
   cover letter for it.

   What it does not do is invent anything. It
   reorders, renames and re-emphasises what is
   already true — which is most of the gap,
   because the CV is written to read cleanly and
   the posting is written in keywords.

   node tools/tailor.js --list
   node tools/tailor.js <search text>
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const store = require('../daemon/store.js');
const TIERS = require('../tiers.js');
const C = require('../resume-content.js');
const LONGFORM = require('../longform.js');
const { build } = require('./resume.js');
const browser = require('../daemon/browser.js');

const OUT = path.join(__dirname, '..', 'cv', 'tailored');
fs.mkdirSync(OUT, { recursive: true });

/* The vocabulary a posting is screened on — same list the gap report uses. */
const TERMS = require('./keyword-terms.js');

const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CASE_SENSITIVE = new Set(['Go', 'R', 'C', 'C++', 'C#', 'API', 'REST', 'FIX',
                                'AWS', 'GCP', 'LLM', 'NLP', 'RAG', 'SQL', 'ETL']);
const hits = (text, term) => {
  const b = /^[\w+#]+$/.test(term) ? '\\b' : '';
  return new RegExp(b + esc(term) + b, CASE_SENSITIVE.has(term) ? '' : 'i').test(text);
};

/** Terms this posting asks for, split by whether you can back them up. */
function analyse(job) {
  const d = `${job.title || ''}\n${job.description || ''}`;
  const asked = TERMS.filter(t => hits(d, t));

  const evidence = [
    ...Object.values(C.SKILLS).flatMap(v => Object.values(v)),
    ...C.EXPERIENCE.flatMap(e => e.bullets.map(b => b.text)),
    ...C.PROJECTS.flatMap(p => p.bullets),
    ...Object.values(C.SUMMARIES)
  ].join(' ');

  return {
    asked,
    have: asked.filter(t => hits(evidence, t)),
    missing: asked.filter(t => !hits(evidence, t))
  };
}

/** Skills lines reordered so what this posting asks for comes first. */
function tailorSkills(baseSkills, have) {
  const wanted = new Set(have.map(t => t.toLowerCase()));
  const out = {};
  for (const [heading, line] of Object.entries(baseSkills)) {
    const items = line.split(/,\s*/);
    const first = items.filter(i => wanted.has(i.toLowerCase().replace(/\s*\(.*\)/, '')));
    const rest = items.filter(i => !first.includes(i));
    out[heading] = [...first, ...rest].join(', ');
  }
  return out;
}

/** Float the bullets that answer this posting. */
function ranker(job) {
  const d = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  const words = new Set(d.split(/[^a-z+#.]+/).filter(w => w.length > 3));
  return bullets => bullets
    .map(b => {
      const bw = b.toLowerCase().split(/[^a-z+#.]+/).filter(w => w.length > 3);
      const overlap = bw.filter(w => words.has(w)).length;
      return { b, overlap };
    })
    .sort((x, y) => y.overlap - x.overlap)
    .map(x => x.b);
}

function summaryFor(job, have) {
  const base = C.SUMMARIES[familyTag(job)] || C.SUMMARIES.swe;
  // Name the two or three things this posting leads with, where you have them.
  const lead = have.filter(t => t.length > 2).slice(0, 4);
  if (!lead.length) return base;
  return base.replace(/\.$/, '') + ` Direct experience with ${lead.slice(0, 3).join(', ')}.`;
}

function familyTag(job) {
  const f = String(job.family || '');
  if (f.startsWith('quant')) return 'quant';
  if (f === 'data') return 'data';
  if (f === 'analyst') return 'analyst';
  return 'swe';
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

(async () => {
  const args = process.argv.slice(2);
  const recs = Object.values(store.getApplications()).filter(r => r.status === 'queued');
  const tiered = TIERS.assignTiers(recs);
  const shortlist = tiered.filter(x => x.tier === 'S');

  if (!args.length || args[0] === '--list') {
    console.log(`\nS-TIER — ${shortlist.length} roles held back for you\n`);
    shortlist.forEach((x, i) => {
      const r = x.rec;
      console.log(`${String(i + 1).padStart(2)}. ${(r.salaryDisplay || 'pay undisclosed').padEnd(24)} ${r.company}`);
      console.log(`    ${r.title}`);
      console.log(`    ${r.location || ''} · ${r.applyUrl || r.url}`);
    });
    console.log(`\nTailor one:  node tools/tailor.js <part of the title or company>\n`);
    return;
  }

  const q = args.join(' ').toLowerCase();
  const pick = shortlist.find(x =>
    `${x.rec.company} ${x.rec.title}`.toLowerCase().includes(q)) ||
    tiered.find(x => `${x.rec.company} ${x.rec.title}`.toLowerCase().includes(q));

  if (!pick) { console.log(`Nothing matching "${args.join(' ')}". Try --list.`); return; }

  const job = pick.rec;
  const a = analyse(job);
  const tag = familyTag(job);

  console.log(`\n${job.company} — ${job.title}`);
  console.log(`${job.location || ''} · ${job.salaryDisplay || 'pay undisclosed'} · tier ${pick.tier}\n`);
  console.log(`asks for ${a.asked.length} of the terms worth counting`);
  console.log(`  you can back up : ${a.have.join(', ') || '(none)'}`);
  console.log(`  you cannot      : ${a.missing.join(', ') || '(none)'}`);
  console.log(`\n  The second list is not a gap to fill by claiming them. It is what to`);
  console.log(`  read up on before the interview, and what to leave alone on the CV.\n`);

  const ctx = await browser.launch({ headless: true });
  const page = await ctx.newPage();

  const pdfPath = path.join(OUT, `Diego Crisafulli - ${job.company} - ${job.title.slice(0, 40).trim()}.pdf`
    .replace(/[/\\:]/g, '-'));
  const { pages } = await build(page, tag, job.company, pdfPath, {
    skills: tailorSkills(C.SKILLS[tag] || C.SKILLS.swe, a.have),
    summary: summaryFor(job, a.have),
    rankBullets: ranker(job)
  });

  const letter = LONGFORM.compose('coverLetter', job, { limit: 0 }) ||
                 LONGFORM.compose('whyCompany', job, { limit: 0 });
  const letterPath = pdfPath.replace(/\.pdf$/, ' - cover letter.txt');
  fs.writeFileSync(letterPath, letter + '\n');

  await page.close(); await ctx.close();
  await browser.closeShared().catch(() => {});

  console.log(`  CV     ${pdfPath}${pages === 1 ? '' : `  (${pages} pages!)`}`);
  console.log(`  letter ${letterPath}`);
  console.log(`  apply  ${job.applyUrl || job.url}\n`);
})();
