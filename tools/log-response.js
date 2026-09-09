#!/usr/bin/env node
/* ═══════════════════════════════════════════
   RECORD WHAT COMES BACK

   Rejections are the only feedback this system
   gets, and none of it was being kept — so the
   same mix of applications went out again.

   node tools/log-response.js reject <company> [title fragment]
   node tools/log-response.js oa|interview|offer <company> [title]
   node tools/log-response.js report
   ═══════════════════════════════════════════ */

const store = require('../daemon/store.js');

const [, , verb, company, ...rest] = process.argv;
const fragment = rest.join(' ').toLowerCase();

const OUTCOMES = { reject: 'rejected', oa: 'assessment', interview: 'interview', offer: 'offer' };

function report() {
  const ap = Object.values(store.getApplications()).filter(r => r.status === 'applied');
  const withOutcome = ap.filter(r => r.outcome);
  console.log(`${ap.length} applications · ${withOutcome.length} with a recorded outcome\n`);

  const by = {};
  for (const r of withOutcome) by[r.outcome] = (by[r.outcome] || 0) + 1;
  for (const [k, v] of Object.entries(by)) console.log(`  ${String(v).padStart(3)}  ${k}`);

  if (!withOutcome.length) return;

  // What the rejections have in common is the whole point of recording them.
  const rej = withOutcome.filter(r => r.outcome === 'rejected');
  if (rej.length >= 3) {
    console.log('\nwhat the rejections have in common:');
    for (const key of ['sector', 'level', 'family']) {
      const c = {};
      for (const r of rej) c[r[key] || '?'] = (c[r[key] || '?'] || 0) + 1;
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
      const base = {};
      for (const r of ap) base[r[key] || '?'] = (base[r[key] || '?'] || 0) + 1;
      const rate = Math.round(top[1] / (base[top[0]] || 1) * 100);
      console.log(`  ${key}: ${top[0]} — ${top[1]} of ${base[top[0]] || 0} sent (${rate}%)`);
    }
  }
}

if (!verb || verb === 'report') { report(); process.exit(0); }

const outcome = OUTCOMES[verb];
if (!outcome || !company) {
  console.log('Usage: node tools/log-response.js reject|oa|interview|offer <company> [title fragment]');
  console.log('       node tools/log-response.js report');
  process.exit(1);
}

const apps = store.getApplications();
const hits = Object.values(apps).filter(r =>
  r.status === 'applied' &&
  String(r.company).toLowerCase().includes(company.toLowerCase()) &&
  (!fragment || String(r.title).toLowerCase().includes(fragment)));

if (!hits.length) { console.log(`No application matching "${company}${fragment ? ' / ' + fragment : ''}"`); process.exit(1); }
if (hits.length > 1 && !fragment) {
  console.log(`${hits.length} applications at ${hits[0].company} — add part of the title:`);
  for (const h of hits) console.log(`   ${h.title}`);
  process.exit(1);
}

for (const h of hits) {
  h.outcome = outcome;
  h.outcomeAt = new Date().toISOString();
  h.firstResponseAt = h.firstResponseAt || h.outcomeAt;
  console.log(`${outcome}: ${h.company} — ${h.title}`);
}
store.saveApplications(apps);
