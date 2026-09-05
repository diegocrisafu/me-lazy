#!/usr/bin/env node
/* ═══════════════════════════════════════════
   ANSWER THE OPEN QUESTIONS

   Walks the harvested questions that need Diego,
   most-blocking first, and writes the answers
   into the book. Each one is asked once and then
   reused across every posting at that employer.

   node tools/answer.js          answer the unanswered, in order
   node tools/answer.js --list   just show what is outstanding
   node tools/answer.js --all    revisit answered ones too
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BOOK = path.join(__dirname, '..', 'data', 'answer-book.json');

if (!fs.existsSync(BOOK)) {
  console.log('No answer book yet. Run:  node tools/harvest.js');
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(BOOK, 'utf8'));
const items = raw.needsYou || [];

const outstanding = items
  .filter(e => process.argv.includes('--all') || e.answer === null || e.answer === '')
  .sort((a, b) => (b.required - a.required) || (b.postings - a.postings));

if (process.argv.includes('--list')) {
  console.log(`${outstanding.length} unanswered of ${items.length}\n`);
  outstanding.forEach((e, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${e.required ? '[required] ' : ''}` +
                `${e.postings} posting${e.postings === 1 ? '' : 's'} · ${e.employers.slice(0, 3).join(', ')}`);
    console.log(`     ${e.question.slice(0, 100)}`);
    if (e.options.length) console.log(`     offers: ${e.options.slice(0, 6).join(' | ').slice(0, 92)}`);
  });
  process.exit(0);
}

if (!outstanding.length) {
  console.log('Nothing outstanding. Every harvested question has an answer.');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

(async () => {
  console.log(`${outstanding.length} questions need you. Each is asked once and reused`);
  console.log(`across every posting at that employer.\n`);
  console.log(`Enter to skip · "s" to skip · "q" to save and quit\n`);

  let answered = 0;
  for (const e of outstanding) {
    console.log('─'.repeat(72));
    console.log(`${e.required ? 'REQUIRED · ' : ''}blocks ${e.postings} posting${e.postings === 1 ? '' : 's'} at ${e.employers.slice(0, 3).join(', ')}`);
    console.log(`\n  ${e.question}\n`);
    if (e.options.length) {
      console.log('  the form offers:');
      e.options.slice(0, 10).forEach((o, i) => console.log(`    ${i + 1}. ${o}`));
      console.log('');
    }

    const a = (await ask('  your answer > ')).trim();
    if (a.toLowerCase() === 'q') break;
    if (!a || a.toLowerCase() === 's') continue;

    // Allow picking an offered option by number.
    const n = Number(a);
    e.answer = (Number.isInteger(n) && n >= 1 && n <= e.options.length)
      ? e.options[n - 1] : a;
    answered++;
    console.log(`  recorded: ${e.answer}\n`);
  }
  rl.close();

  fs.writeFileSync(BOOK, JSON.stringify(raw, null, 1));
  const left = items.filter(e => !e.answer).length;
  console.log(`\nSaved ${answered}. ${left} still unanswered.`);
  console.log('These are now used verbatim, ahead of any rule or inference.');

  // Postings the daemon parked on a question you have now answered go back in
  // the queue. Without this, answering fixes only the next posting the runner
  // happens to reach, and the forty already held stay held.
  const store = require('../daemon/store.js');
  const answeredKeys = new Set(items.filter(e => e.answer).map(e => e.key));
  const keyOf = q => String(q).toLowerCase().replace(/[^a-z0-9\s?]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 120);

  const apps = store.getApplications();
  let released = 0;
  for (const rec of Object.values(apps)) {
    if (rec.status !== 'scouted' || !rec.scoutBlockers?.length) continue;
    // Only when every question that stopped it now has an answer.
    if (!rec.scoutBlockers.every(b => answeredKeys.has(keyOf(b)))) continue;
    rec.status = 'queued';
    delete rec.scoutReason; delete rec.scoutBlockers;
    delete rec.applyResult; delete rec.blockedWithSibling;
    released++;
  }
  if (released) {
    store.saveApplications(apps);
    console.log(`${released} posting${released === 1 ? '' : 's'} released back into the queue.`);
  }
})();
