#!/usr/bin/env node
/* ═══════════════════════════════════════════
   APPLY TO THE TOP OF THE QUEUE, TAILORED

   Walks the S and A tiers by expected value and
   submits, giving each one a CV rewritten
   against that posting first. Stops at the
   target, or when it runs out of roles.

   These are real submissions.

   node tools/apply-batch.js [count]
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const store = require('../daemon/store.js');
const TIERS = require('../tiers.js');
const ANSWERS = require('../answers.js');
const tracker = require('../tracker.js');
const browser = require('../daemon/browser.js');
const { applyTo } = require('../daemon/apply.js');
const { CV_PROFILES } = require('../cv-profiles.js');
const { build } = require('./resume.js');
const C = require('../resume-content.js');
const TERMS = require('./keyword-terms.js');
const cover = require('../cover-letter.js');
const tailoredLetter = require('../tailored-letter.js');

const TAILORED = path.join(__dirname, '..', 'cv', 'tailored');
fs.mkdirSync(TAILORED, { recursive: true });

const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CASE_SENSITIVE = new Set(['Go', 'R', 'C', 'C++', 'C#', 'API', 'REST', 'FIX',
                                'AWS', 'GCP', 'LLM', 'NLP', 'RAG', 'SQL', 'ETL']);
const hits = (text, term) => new RegExp(
  (/^[\w+#]+$/.test(term) ? '\\b' : '') + esc(term) + (/^[\w+#]+$/.test(term) ? '\\b' : ''),
  CASE_SENSITIVE.has(term) ? '' : 'i').test(text);

const EVIDENCE = [
  ...Object.values(C.SKILLS).flatMap(v => Object.values(v)),
  ...C.EXPERIENCE.flatMap(e => e.bullets.map(b => b.text)),
  ...C.PROJECTS.flatMap(p => p.bullets),
  ...Object.values(C.SUMMARIES)
].join(' ');

function familyTag(job) {
  const f = String(job.family || '');
  if (f.startsWith('quant')) return 'quant';
  if (f === 'data') return 'data';
  if (f === 'analyst' || f === 'tech-product') return 'analyst';
  return 'swe';
}

/** Skills lines reordered so what the posting asks for reads first. */
function tailorSkills(base, have) {
  const want = new Set(have.map(t => t.toLowerCase()));
  const out = {};
  for (const [k, line] of Object.entries(base)) {
    const items = line.split(/,\s*/);
    const first = items.filter(i => want.has(i.toLowerCase().replace(/\s*\(.*\)/, '')));
    out[k] = [...first, ...items.filter(i => !first.includes(i))].join(', ');
  }
  return out;
}

function ranker(job) {
  const d = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  const words = new Set(d.split(/[^a-z+#.]+/).filter(w => w.length > 3));
  return bullets => bullets
    .map(b => ({ b, n: b.toLowerCase().split(/[^a-z+#.]+/).filter(w => words.has(w)).length }))
    .sort((x, y) => y.n - x.n).map(x => x.b);
}

(async () => {
  const target = Number(process.argv[2] || 15);
  const perEmployer = Number(process.env.PER_EMPLOYER || 3);

  const apps = store.getApplications();
  const settings = store.getSettings();
  const queued = Object.values(apps).filter(r => r.status === 'queued');
  const tiered = TIERS.assignTiers(queued);

  const pool = tiered
    .filter(x => x.tier === 'S' || x.tier === 'A')
    .sort((a, b) => TIERS.expectedValue(b.rec).ev - TIERS.expectedValue(a.rec).ev);

  console.log(`${pool.length} S/A roles · aiming for ${target} submissions ` +
              `· at most ${perEmployer} per employer\n`);

  const ctx = await browser.launch({ headless: true });
  const page = await ctx.newPage();

  let sent = 0, tried = 0;
  const takenBy = {};

  for (const x of pool) {
    if (sent >= target) break;
    const job = x.rec;
    if ((takenBy[job.companyId] || 0) >= perEmployer) continue;
    tried++;

    const cvProfile = CV_PROFILES.find(p => p.id === job.cvId) || CV_PROFILES[0];
    const tag = familyTag(job);

    // A CV written against this posting: its own vocabulary first.
    const jd = `${job.title || ''}\n${job.description || ''}`;
    const asked = TERMS.filter(t => hits(jd, t));
    const have = asked.filter(t => hits(EVIDENCE, t));

    const pdfPath = path.join(TAILORED,
      `Diego Crisafulli - ${job.company} - ${String(job.title).slice(0, 34)}.pdf`
        .replace(/[/\\:]/g, '-'));

    let cvFile = cvProfile.file;
    try {
      await build(page, tag, job.company, pdfPath, {
        skills: tailorSkills(C.SKILLS[tag] || C.SKILLS.swe, have),
        summary: (C.SUMMARIES[tag] || C.SUMMARIES.swe).replace(/\.$/, '') +
                 (have.length ? ` Direct experience with ${have.slice(0, 3).join(', ')}.` : ''),
        rankBullets: ranker(job)
      });
      // applyTo resolves cvFile against cv/, so store the relative path.
      cvFile = path.relative(path.join(__dirname, '..', 'cv'), pdfPath);
    } catch (e) {
      console.log(`  (kept the standard CV for ${job.company}: ${e.message.slice(0, 40)})`);
    }

    // A letter that reads the posting. The generic composer opened every one
    // with the same line about being an "early career generalist", which is
    // a template artefact rather than a reason to hire anyone.
    const tl = tailoredLetter.compose(job, settings.profile || {});
    const letter = tl.evidenceUsed
      ? { text: tl.text }
      : cover.compose(job, cvProfile, settings.profile || {},
                      { family: job.family, level: job.level });

    const rec = { ...job, cvFile };
    let result;
    try {
      result = await applyTo(ctx, rec, {
        settings, dryRun: false,
        coverLetter: letter?.text || null,
        cvFacts: cvProfile.facts || {}
      });
    } catch (e) {
      result = { submitted: false, blocked: 'threw: ' + e.message.slice(0, 60), filled: [] };
    }

    const live = apps[job.id];
    if (live) {
      live.applyResult = {
        submitted: result.submitted, blocked: result.blocked || null,
        filledCount: result.filled?.length || 0,
        skipped: result.skipped || [],
        screenshots: (result.screenshots || []).map(s => s.split('/data/')[1] || s),
        at: result.at
      };
      live.cvFile = cvFile;
      live.coverLetter = letter?.text || null;
      if (result.submitted) {
        tracker.applyStatus(live, 'applied', { mode: 'tailored' });
        live.tailored = true;
      } else {
        tracker.applyStatus(live, 'scouted', { reason: result.blocked });
        live.scoutReason = result.blocked;
        live.scoutBlockers = [...new Set([
          ...(result.skipped || []).filter(s => s.critical).map(s => s.label),
          ...(result.requiredStillEmpty || [])])].filter(Boolean);
      }
      store.saveApplications(apps);
    }

    await new Promise(r => setTimeout(r, 4000 + Math.random() * 6000));

    if (result.submitted) {
      sent++;
      takenBy[job.companyId] = (takenBy[job.companyId] || 0) + 1;
      console.log(`  ${String(sent).padStart(2)}. SENT  ${x.tier}  ${String(job.company).padEnd(14)} ` +
                  `${String(job.title).slice(0, 40)}`);
    } else {
      console.log(`      --    ${x.tier}  ${String(job.company).padEnd(14)} ` +
                  `${String(job.title).slice(0, 30)}  (${String(result.blocked).slice(0, 44)})`);
    }
  }

  await page.close().catch(() => {});
  await ctx.close().catch(() => {});
  await browser.closeShared().catch(() => {});
  console.log(`\n${sent} submitted from ${tried} attempts.`);
})();
