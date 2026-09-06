#!/usr/bin/env node
/* ═══════════════════════════════════════════
   RE-SCORE THE QUEUE

   Records keep the level, family and priority
   they were given when they were found. So a
   change to the rules — a new role family, a
   wider years ceiling — only ever applies to
   postings discovered afterwards, and the ones
   already in the queue stay mislabelled.

   This re-runs the current rules over everything
   still queued or scouted.
   ═══════════════════════════════════════════ */

const store = require('../daemon/store.js');
const T = require('../targeting.js');
const { selectCV } = require('../cv-selector.js');
const { CV_PROFILES } = require('../cv-profiles.js');
const { byId } = require('../companies.js');

const apps = store.getApplications();
const settings = store.getSettings();
const rules = { ...T.DEFAULT_RULES, ...(settings.rules || {}) };

let changed = 0, dropped = 0, promoted = 0;
const famBefore = {}, famAfter = {}, lvlAfter = {};

for (const rec of Object.values(apps)) {
  if (!['queued', 'scouted'].includes(rec.status)) continue;
  famBefore[rec.family || '?'] = (famBefore[rec.family || '?'] || 0) + 1;

  const company = byId(rec.companyId);
  const job = { ...rec, companyCountry: company?.country };
  const salary = {
    found: Boolean(rec.salaryAnnualMaxCAD),
    min: rec.salaryAnnualMinCAD, max: rec.salaryAnnualMaxCAD
  };

  const ev = T.evaluate(job, salary, rules);
  if (!ev.eligible) {
    // No longer a role we pursue — park it rather than deleting anything.
    if (rec.status === 'queued') { rec.status = 'scouted'; rec.scoutReason = ev.reasons.join(', '); dropped++; }
    continue;
  }

  const before = `${rec.family}|${rec.level}|${Math.round(rec.priority || 0)}`;
  const cv = selectCV(job, ev, CV_PROFILES, {});
  const prio = T.oaPriority(job, ev, cv.score, { canadaFirst: rules.canadaFirst !== false });

  rec.family = ev.family;
  rec.level = ev.level;
  rec.requiredYears = ev.requiredYears;
  rec.matchScore = cv.score;
  rec.cvId = cv.profile.id;
  rec.cvName = cv.profile.name;
  rec.cvShort = cv.profile.short;
  rec.cvFile = cv.profile.file;
  rec.priority = prio.score;
  if (rec.status === 'scouted' && !rec.scoutBlockers?.length && !rec.applyResult) {
    rec.status = 'queued'; promoted++;
  }

  famAfter[rec.family] = (famAfter[rec.family] || 0) + 1;
  lvlAfter[rec.level] = (lvlAfter[rec.level] || 0) + 1;
  if (`${rec.family}|${rec.level}|${Math.round(rec.priority)}` !== before) changed++;
}

store.saveApplications(apps);
console.log(`re-scored ${changed} records · ${dropped} parked · ${promoted} brought back\n`);
console.log('families before :', JSON.stringify(famBefore));
console.log('families after  :', JSON.stringify(famAfter));
console.log('levels after    :', JSON.stringify(lvlAfter));
