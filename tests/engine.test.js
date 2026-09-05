/* Unit tests — node:test, zero dependencies.
   Run: node --test tests/                       */
const { test } = require('node:test');
const assert = require('node:assert');

const salary   = require('../salary.js');
const target   = require('../targeting.js');
const cvsel    = require('../cv-selector.js');
const tracker  = require('../tracker.js');
const sources  = require('../sources.js');
const { CV_PROFILES, CV_FACT_CONFLICTS } = require('../cv-profiles.js');
const { COMPANIES, prioritized } = require('../companies.js');

/* ═══════ SALARY ═══════ */

test('annual salary range parses', () => {
  const s = salary.parseSalary('$90,000/yr - $120,000/yr');
  assert.equal(s.period, 'year');
  assert.equal(s.annualMin, 90000);
  assert.equal(s.annualMax, 120000);
  assert.ok(s.confident);
});

test('hourly intern pay normalizes to annual', () => {
  const s = salary.parseSalary('$45.00/hr - $55.00/hr');
  assert.equal(s.period, 'hour');
  assert.equal(s.annualMin, 93600);   // 45 * 2080
  assert.equal(s.annualMax, 114400);
});

test('monthly pay normalizes to annual', () => {
  const s = salary.parseSalary('$8,500 per month');
  assert.equal(s.annualMax, 102000);
});

test('USD converts for comparison against a CAD threshold', () => {
  const s = salary.parseSalary('USD $150,000 per year');
  assert.equal(s.currency, 'USD');
  assert.ok(s.annualMaxCAD > s.annualMax);
});

test('French Quebec salary format parses', () => {
  const s = salary.parseSalary('70 000 $ par an');
  assert.equal(s.annualMax, 70000);
});

test('pay gate accepts a qualifying hourly rate and rejects a low one', () => {
  assert.equal(salary.meetsThreshold(salary.parseSalary('$45/hr'), 90000).pass, true);
  assert.equal(salary.meetsThreshold(salary.parseSalary('$32/hr'), 90000).pass, false);
});

test('prose without figures yields no salary', () => {
  assert.equal(salary.parseSalary('Competitive salary and benefits').found, false);
});

/* ═══════ LEVEL CLASSIFICATION ═══════ */

test('internship titles classify as intern', () => {
  for (const t of ['Software Engineer Intern', 'SWE Co-op 2027', 'Stagiaire en développement logiciel']) {
    assert.equal(target.classifyLevel(t), 'intern', t);
  }
});

test('new-grad titles classify as newgrad', () => {
  for (const t of ['New Grad Software Engineer', 'Graduate Software Engineer', 'Développeur junior']) {
    assert.equal(target.classifyLevel(t), 'newgrad', t);
  }
});

test('senior titles are rejected, including numeral levels', () => {
  for (const t of ['Senior Software Engineer', 'Staff Engineer', 'Software Engineer II', 'Principal Architect']) {
    assert.equal(target.classifyLevel(t), 'senior', t);
  }
});

test('non-engineering titles are not dev roles', () => {
  for (const t of ['Sales Engineer', 'Product Manager', 'Recruiter', 'Mechanical Engineer']) {
    assert.equal(target.isDevRole(t), false, t);
  }
});

/* ═══════ EXPERIENCE PARSING ═══════
   This is the regression that let mid-level Amazon roles
   through as new-grad: qualifiers sit between the number
   and the word "experience". */

test('years requirement parses through intervening qualifiers', () => {
  assert.equal(target.requiredYears('3+ years of non-internship professional software development experience'), 3);
  assert.equal(target.requiredYears('2+ years of non-internship design or architecture experience'), 2);
  assert.equal(target.requiredYears('At least 6 years building backend systems'), 6);
  assert.equal(target.requiredYears('Minimum of 4 years software engineering experience'), 4);
});

test('entry-level language reports no years requirement', () => {
  assert.equal(target.requiredYears('Currently pursuing a Bachelors degree in Computer Science'), 0);
});

/* ═══════ ELIGIBILITY ═══════ */

test('mid-level role is rejected even when the title is silent about level', () => {
  const job = {
    title: 'Software Development Engineer',
    location: 'Vancouver, BC, CAN',
    description: '3+ years of non-internship professional software development experience.'
  };
  const ev = target.evaluate(job, { found: false });
  assert.equal(ev.eligible, false);
  assert.ok(ev.reasons.includes('requires-3y-experience'));
});

test('entry level is inferred only on positive evidence', () => {
  const base = 'We build large scale systems using modern tooling and practices. '.repeat(6);
  const silent = target.evaluate(
    { title: 'Software Development Engineer', location: 'Toronto, ON', description: base },
    { found: false });
  assert.equal(silent.eligible, false, 'silence must not imply entry level');

  const evidenced = target.evaluate(
    { title: 'Software Development Engineer', location: 'Toronto, ON',
      description: base + ' Currently pursuing a Bachelors degree in Computer Science.' },
      // ENTRY_EVIDENCE language only — none of the phrases classifyLevel
      // matches directly — so this exercises the inference path.
    { found: false });
  assert.equal(evidenced.eligible, true);
  assert.equal(evidenced.level, 'newgrad');
  assert.equal(evidenced.levelInferred, true);
});

test('pay below the threshold is rejected when disclosed', () => {
  const job = { title: 'Software Engineer Intern', location: 'Toronto, ON', description: 'Pursuing a degree.' };
  const ev = target.evaluate(job, salary.parseSalary('$20/hr'), { minSalaryCAD: 90000 });
  assert.ok(ev.reasons.includes('below-pay-threshold'));
});

test('undisclosed pay is allowed or rejected by policy', () => {
  const job = { title: 'Software Engineer Intern', location: 'Toronto, ON', description: 'Pursuing a degree.' };
  assert.equal(target.evaluate(job, { found: false }, { allowUnknownSalary: true }).eligible, true);
  assert.ok(target.evaluate(job, { found: false }, { allowUnknownSalary: false })
    .reasons.includes('pay-undisclosed'));
});

test('locations classify into regions', () => {
  assert.equal(target.classifyLocation({ location: 'Montréal, QC' }).region, 'CA');
  assert.equal(target.classifyLocation({ location: 'Seattle, WA' }).region, 'US');
  assert.equal(target.classifyLocation({ location: 'London, UK' }).region, 'OTHER');
});

/* ═══════ PRIORITY ═══════ */

test('fresher postings outrank stale ones', () => {
  const job = { oaLikelihood: 0.8, sector: 'quant', ageDays: 1 };
  const ev = { level: 'intern', location: { region: 'CA' } };
  const fresh = target.oaPriority(job, ev, 60).score;
  const stale = target.oaPriority({ ...job, ageDays: 40 }, ev, 60).score;
  assert.ok(fresh > stale, `${fresh} should beat ${stale}`);
});

test('employers that automate assessments outrank those that do not', () => {
  const ev = { level: 'intern', location: { region: 'CA' } };
  const auto   = target.oaPriority({ oaLikelihood: 0.9, sector: 'quant', ageDays: 3 }, ev, 60).score;
  const manual = target.oaPriority({ oaLikelihood: 0.2, sector: 'quant', ageDays: 3 }, ev, 60).score;
  assert.ok(auto > manual);
});

test('Canada is preferred when canadaFirst is set', () => {
  const job = { oaLikelihood: 0.7, sector: 'bank', ageDays: 5 };
  const ca = target.oaPriority(job, { level: 'newgrad', location: { region: 'CA' } }, 50).score;
  const us = target.oaPriority(job, { level: 'newgrad', location: { region: 'US' } }, 50).score;
  assert.ok(ca > us);
});

/* ═══════ CV SELECTION ═══════ */

test('backend posting selects the backend variant', { skip: CV_PROFILES.length < 3 ? 'running against cv-profiles.example.js' : false }, () => {
  const job = { title: 'New Grad Software Engineer, Backend', sector: 'fintech',
    description: 'Build backend REST APIs with SQL, Postgres, Docker and CI/CD. Design data pipelines.' };
  const ev = target.evaluate(job, { found: false });
  assert.equal(cvsel.selectCV(job, ev, CV_PROFILES).profile.id, 'backend');
});

test('return-to-school requirement is detected, including French', () => {
  assert.equal(target.requiresReturnToSchool('Must be returning to school following the internship.'), true);
  assert.equal(target.requiresReturnToSchool('You must be enrolled in a degree program for the fall semester following the internship.'), true);
  assert.equal(target.requiresReturnToSchool('Vous devez poursuivre vos études après le stage.'), true);
  assert.equal(target.requiresReturnToSchool('Work with our platform team on distributed systems.'), false);
});

test('the conditional-claim variant is sent only to return-to-school internships', { skip: CV_PROFILES.length < 3 ? 'running against cv-profiles.example.js' : false }, () => {
  const desc = 'Data structures, algorithms, object-oriented design, scalable distributed systems in C++ and Java. ';
  const withReturn = { title: 'Software Engineer Intern', sector: 'bigtech',
    description: desc + 'Currently pursuing a degree. Must be returning to school following the internship.' };
  const pick = cvsel.selectCV(withReturn, target.evaluate(withReturn, { found: false }), CV_PROFILES);
  assert.equal(pick.profile.id, 'big-tech');
  assert.equal(pick.conditionMet, true);
  assert.match(pick.reason, /returning to school/i);
});

test('the conditional-claim variant is withheld from internships with no return requirement', { skip: CV_PROFILES.length < 3 ? 'running against cv-profiles.example.js' : false }, () => {
  const job = { title: 'Software Engineer Intern', sector: 'quant',
    description: 'Low latency C++ systems. Algorithms and data structures. Strong problem solving.' };
  const pick = cvsel.selectCV(job, target.evaluate(job, { found: false }), CV_PROFILES);
  assert.notEqual(pick.profile.id, 'big-tech');
  assert.ok(pick.withheld, 'the withheld variant must be reported');
  assert.match(pick.reason, /withheld/i);
});

test('the conditional-claim variant never goes to a new-grad posting', { skip: CV_PROFILES.length < 3 ? 'running against cv-profiles.example.js' : false }, () => {
  const job = { title: 'Graduate Software Engineer', sector: 'quant',
    description: 'Algorithms, data structures, object-oriented design, scalable systems, C++ and Python.' };
  const pick = cvsel.selectCV(job, target.evaluate(job, { found: false }), CV_PROFILES);
  assert.notEqual(pick.profile.id, 'big-tech');
});

test('a variant with no uploaded PDF is never selected', { skip: CV_PROFILES.length < 3 ? 'running against cv-profiles.example.js' : false }, () => {
  const disabled = CV_PROFILES.filter(p => p.enabled === false);
  assert.ok(disabled.length > 0, 'the no-MSc slot should exist');
  const job = { title: 'Graduate Software Engineer', sector: 'quant',
    description: 'Algorithms, data structures, scalable systems, C++.' };
  const pick = cvsel.selectCV(job, target.evaluate(job, { found: false }), CV_PROFILES);
  assert.ok(!disabled.some(d => d.id === pick.profile.id));
});

test('every available CV variant is ranked and the reason is recorded', () => {
  const job = { title: 'New Grad Software Engineer', sector: 'tech', description: 'Python and cloud.' };
  const pick = cvsel.selectCV(job, target.evaluate(job, { found: false }), CV_PROFILES);
  // Only variants that are available AND written for this role family
  // compete, so the ranking is a subset of the full variant list.
  const eligible = CV_PROFILES.filter(p =>
    p.enabled !== false && !p.pinnedTo && (!p.families || p.families.includes('swe')));
  assert.equal(pick.ranking.length, eligible.length);
  assert.ok(pick.reason.length > 0);
});

/* ═══════ CV VARIANTS ═══════ */

test('the declared fact conflicts between variants are recorded', { skip: CV_PROFILES.length < 3
  ? 'running against cv-profiles.example.js' : false }, () => {
  assert.ok(CV_FACT_CONFLICTS.length >= 2);
  const grad = CV_FACT_CONFLICTS.find(c => /graduation/i.test(c.field));
  assert.ok(grad, 'graduation-date conflict must be declared');
  assert.equal(grad.severity, 'high');
});

test('the Masters is modelled as a conditional claim, not a fact', { skip: CV_PROFILES.length < 3
  ? 'running against cv-profiles.example.js' : false }, () => {
  const conditional = CV_PROFILES.filter(p => p.conditionalClaim);
  assert.equal(conditional.length, 1);
  assert.equal(conditional[0].id, 'big-tech');
  assert.equal(conditional[0].conditionalClaim.appliesWhen, 'intern-returning-to-school');
  // It is prospective, so no variant may present it as a completed fact.
  for (const p of CV_PROFILES) assert.ok(!p.facts?.mastersProgram, p.id);
});

test('level vocabulary is kept out of boost lists', () => {
  for (const p of CV_PROFILES) {
    for (const term of p.boost) {
      assert.ok(!/^(intern|internship|co-?op|new grad|entry level)$/i.test(term),
        `${p.id} boost list must not contain the level term "${term}"`);
    }
  }
});

/* ═══════ TRACKER ═══════ */

test('status transitions stamp the right timestamps', () => {
  const r = tracker.makeRecord({ id: 'x', title: 'T', company: 'C', cvId: 'backend' });
  assert.equal(r.status, 'queued');
  tracker.applyStatus(r, 'applied', { mode: 'review' });
  assert.ok(r.appliedAt);
  assert.equal(r.applyMode, 'review');
  tracker.applyStatus(r, 'oa_received');
  assert.ok(r.oaReceivedAt);
  assert.ok(r.firstResponseAt, 'an assessment counts as a response');
  assert.equal(r.statusHistory.length, 3);
});

test('assessment rate is computed per CV variant', () => {
  const recs = {};
  for (let i = 0; i < 6; i++) {
    const cv = i < 3 ? 'big-tech' : 'backend';
    const r = tracker.makeRecord({ id: 'j' + i, title: 'T', company: 'C', cvId: cv, cvShort: cv });
    tracker.applyStatus(r, 'applied');
    if (cv === 'big-tech' && i < 2) tracker.applyStatus(r, 'oa_received');
    recs['j' + i] = r;
  }
  const perf = tracker.cvPerformance(recs, CV_PROFILES);
  assert.equal(perf.find(p => p.id === 'big-tech').oaRate, 66.7);
  assert.equal(perf.find(p => p.id === 'backend').oaRate, 0);
});

test('ghosting is detected past the threshold only', () => {
  const old = tracker.makeRecord({ id: 'a', title: 'T', company: 'C' });
  tracker.applyStatus(old, 'applied');
  old.appliedAt = new Date(Date.now() - 30 * 86400000).toISOString();

  const recent = tracker.makeRecord({ id: 'b', title: 'T', company: 'C' });
  tracker.applyStatus(recent, 'applied');

  const ghosted = tracker.findGhosted([old, recent]);
  assert.equal(ghosted.length, 1);
  assert.equal(ghosted[0].id, 'a');
});

test('CSV export records the CV used and escapes commas', () => {
  const r = tracker.makeRecord({ id: 'z', title: 'Engineer, Backend', company: 'C', cvShort: 'Backend' });
  const csv = tracker.toCSV({ z: r });
  assert.match(csv.split('\n')[0], /cvShort/);
  assert.match(csv, /"Engineer, Backend"/);
});

/* ═══════ SOURCES ═══════ */

test('Workday posting prose converts to an age in days', () => {
  assert.equal(sources.parseWorkdayPostedOn('Posted Today'), 0);
  assert.equal(sources.parseWorkdayPostedOn('Posted Yesterday'), 1);
  assert.equal(sources.parseWorkdayPostedOn('Posted 3 Days Ago'), 3);
  assert.equal(sources.parseWorkdayPostedOn('Posted 2 Weeks Ago'), 14);
  assert.equal(sources.parseWorkdayPostedOn('Posted 30+ Days Ago'), 30);
});

test('HTML strips to readable text', () => {
  const out = sources.stripHTML('<p>Build&nbsp;systems</p><ul><li>Python</li></ul>');
  assert.match(out, /Build systems/);
  assert.match(out, /Python/);
  assert.ok(!out.includes('<'));
});

/* ═══════ COMPANY LIST ═══════ */

test('Canadian employers are queued before US ones', () => {
  const order = prioritized();
  const firstUS = order.findIndex(c => c.country === 'US');
  const lastCA  = order.map(c => c.country).lastIndexOf('CA');
  assert.ok(lastCA < firstUS, 'all Canadian employers must precede US ones');
});

test('every company declares a reachable source configuration', () => {
  for (const c of COMPANIES) {
    assert.ok(c.id && c.name && c.ats, `${c.id} incomplete`);
    if (c.ats === 'greenhouse' || c.ats === 'lever' || c.ats === 'smartrecruiters') assert.ok(c.token, c.id);
    if (c.ats === 'ashby') assert.ok(c.org, c.id);
    if (c.ats === 'workday') assert.ok(c.host && c.tenant && c.site, c.id);
    if (c.ats === 'custom') assert.ok(c.adapter, c.id);
    assert.ok(c.oa && typeof c.oa.likelihood === 'number', `${c.id} missing OA estimate`);
  }
});


/* ═══════ ROLE FAMILIES ═══════ */

test('titles route to the right role family', () => {
  const cases = {
    'Software Development Engineer Intern': 'swe',
    'Quantitative Developer': 'quant-dev',
    'Quantitative Equity Developer': 'quant-dev',
    'Quantitative Analyst': 'quant-research',
    'Business Analyst': 'analyst',
    'Data Engineer, New Grad': 'data',
    'Analyste d\'affaires': 'analyst'
  };
  for (const [title, fam] of Object.entries(cases)) {
    assert.equal(target.classifyFamily(title), fam, title);
  }
});

test('finance roles that are not quantitative are excluded', () => {
  for (const t of ['Financial Analyst', 'Investment Banking Analyst', 'Equity Research Analyst',
                   'Trader', 'Credit Analyst', 'Compliance Analyst']) {
    assert.equal(target.classifyFamily(t), null, t);
  }
});

test('a quant CV is never sent to an analyst posting', { skip: CV_PROFILES.length < 3 ? 'running against cv-profiles.example.js' : false }, () => {
  const job = { title: 'Business Systems Analyst', sector: 'bank', companyId: 'td',
    description: 'Gather requirements from stakeholders, document business processes, reporting in Power BI.' };
  const pick = cvsel.selectCV(job, target.evaluate(job, { found: false }), CV_PROFILES);
  assert.ok(!/^quant/.test(pick.profile.id), `got ${pick.profile.id}`);
});

test('a CV pinned to one employer wins there and nowhere else', { skip: CV_PROFILES.length < 3 ? 'running against cv-profiles.example.js' : false }, () => {
  const bmo = { title: 'BMO Capital Markets Winter 2027, Full Stack Engineer', companyId: 'bmo',
    sector: 'bank', description: 'React, RESTful APIs, ETL, agile.' };
  const pick = cvsel.selectCV(bmo, target.evaluate(bmo, { found: false }), CV_PROFILES);
  assert.equal(pick.profile.id, 'bmo-fullstack');
  assert.equal(pick.pinned, true);

  const other = { title: 'Full Stack Engineer', companyId: 'td', sector: 'bank',
    description: 'React, RESTful APIs, ETL, agile.' };
  const pick2 = cvsel.selectCV(other, target.evaluate(other, { found: false }), CV_PROFILES);
  assert.notEqual(pick2.profile.id, 'bmo-fullstack');
});

/* ═══════ ANSWER BANK ═══════ */

const answers = require('../answers.js');

test('identity and education questions resolve exactly', () => {
  const a = answers.defaultAnswers({ firstName: 'Diego', lastName: 'Crisafulli', email: 'd@x.com' });
  assert.equal(answers.answerFor('First Name', a).value, 'Diego');
  assert.equal(answers.answerFor('What is your GPA?', a).status, 'unknown');
  assert.equal(answers.answerFor('Email address', a).value, 'd@x.com');
});

test('"United States" does not match the province rule', () => {
  const a = answers.defaultAnswers({ workAuthUS: 'No', province: 'Quebec' });
  const r = answers.answerFor('Are you authorized to work in the United States?', a);
  assert.equal(r.ruleId, 'workAuthUS');
  assert.equal(r.value, 'No');
});

test('unanswered eligibility questions are flagged critical, never guessed', () => {
  const a = answers.defaultAnswers({});
  const r = answers.answerFor('Will you require visa sponsorship?', a);
  assert.equal(r.status, 'unknown');
  assert.equal(r.critical, true);
});

test('demographic questions are never answered automatically', () => {
  const a = answers.defaultAnswers({ firstName: 'Diego' });
  for (const q of ['Gender', 'Race / Ethnicity', 'Do you have a disability?', 'Veteran status']) {
    assert.equal(answers.answerFor(q, a).status, 'demographic', q);
  }
});

test('unrecognised questions return unknown rather than a guess', () => {
  const r = answers.answerFor('What is your favourite colour?', answers.defaultAnswers({}));
  assert.equal(r.status, 'unknown');
  assert.equal(r.value, undefined);
});

test('missingCritical lists exactly the blank terminal answers', () => {
  // Sponsorship is stored per region, because a Canadian citizen needs none
  // in Canada and does need one in the US.
  const complete = { workAuthCanada: 'Yes', workAuthUS: 'No',
    sponsorshipCanada: 'No', sponsorshipUS: 'Yes',
    citizenship: 'Canadian citizen', securityClearance: 'No', salaryExpectation: '95000' };
  assert.deepEqual(answers.missingCritical(answers.defaultAnswers(complete)), []);

  const { sponsorshipUS, ...partial } = complete;
  assert.ok(answers.missingCritical(answers.defaultAnswers(partial)).includes('sponsorshipUS'));
});

test('sponsorship is answered per posting region', () => {
  const p = { sponsorshipCanada: 'No', sponsorshipUS: 'Yes' };
  const ca = answers.defaultAnswers(p, {}, { region: 'CA' });
  const us = answers.defaultAnswers(p, {}, { region: 'US' });
  const q = 'Will you now or in the future require sponsorship for employment visa status?';
  assert.equal(answers.answerFor(q, ca).value, 'No');
  assert.equal(answers.answerFor(q, us).value, 'Yes');
});

test('consent controls are recognised even with no readable label', () => {
  const a = answers.defaultAnswers({});
  for (const q of ['gdpr demographic data consent given', 'Privacy Policy Acknowledgement',
                   'I agree to the terms']) {
    assert.equal(answers.answerFor(q, a).status, 'consent', q);
  }
});

/* ═══════ COVER LETTER ═══════ */

const cover = require('../cover-letter.js');

test('the letter names the role and company and stays factual', () => {
  const job = { title: 'Software Engineer Intern', company: 'Optiver', sector: 'quant',
    description: 'Low latency trading systems in C++, execution and market data.' };
  const ev = target.evaluate(job, { found: false });
  const cv = CV_PROFILES.find(p => p.id === 'quant-dev');
  const out = cover.compose(job, cv, { firstName: 'Diego', lastName: 'Crisafulli' }, ev);
  assert.match(out.text, /Optiver/);
  assert.match(out.text, /Software Engineer Intern/);
  assert.ok(out.evidenceUsed.length > 0);
  // Every claim traces to a stored evidence paragraph — nothing invented.
  for (const id of out.evidenceUsed) {
    assert.ok(cover.EVIDENCE.some(e => e.id === id));
  }
});

test('a trading posting pulls the trading paragraph even when titled generically', () => {
  const job = { title: 'Software Engineer Intern', company: 'Jump', sector: 'quant',
    description: 'Trading systems, market data, order execution and low latency.' };
  const ev = target.evaluate(job, { found: false });
  const out = cover.compose(job, CV_PROFILES[0], {}, ev);
  assert.ok(out.evidenceUsed.includes('trading'), out.evidenceUsed.join(','));
});

test('the short form respects a character limit', () => {
  const job = { title: 'Engineer', company: 'X', description: 'Build things.' };
  const out = cover.composeShort(job, CV_PROFILES[0], {}, {}, 400);
  assert.ok(out.text.length <= 400);
});

/* ═══════ RUNNER ═══════ */

const runner = require('../runner.js');

test('the runner stays off unless enabled', () => {
  assert.equal(runner.decide({ queue: [], records: {} }, { enabled: false }).action, 'wait');
});

test('the runner respects quiet hours and the daily cap', () => {
  const cfg = { enabled: true, dailyCap: 2 };
  const q = [{ id: 'a', status: 'queued', priority: 80 }];

  const night = runner.decide({ queue: q, records: {}, now: '2026-08-27T03:00:00' }, cfg);
  assert.equal(night.action, 'wait');
  assert.match(night.reason, /quiet/);

  // Pin the clock to the middle of the working day. Using the real wall
  // clock made this pass or fail depending on the hour it happened to run.
  const noon = '2026-08-27T14:00:00';
  const day = noon.slice(0, 10);
  const records = { a: { appliedAt: day + 'T10:00:00.000Z' },
                    b: { appliedAt: day + 'T11:00:00.000Z' } };
  const capped = runner.decide({ queue: q, records, now: noon,
    lastHuntAt: noon }, cfg);
  assert.match(capped.reason, /daily cap/);
});

test('the runner pauses after repeated failures rather than hammering', () => {
  const d = runner.decide({ queue: [{ id: 'a', status: 'queued' }], records: {},
    consecutiveFailures: 9 }, { enabled: true });
  assert.equal(d.action, 'wait');
  assert.match(d.reason, /paused/);
});

test('the runner applies to the highest-priority queued role', () => {
  const now = new Date('2026-08-27T14:00:00');
  const q = [{ id: 'low', status: 'queued', priority: 20 }, { id: 'high', status: 'queued', priority: 90 }];
  const d = runner.decide({ queue: q, records: {}, now: now.toISOString(),
    lastHuntAt: now.toISOString(), lastApplyAt: new Date('2026-08-27T13:00:00').toISOString() },
    { enabled: true });
  assert.equal(d.action, 'apply');
  assert.equal(d.job.id, 'high');
});

test('Workday roles are routed to a person, not auto-submitted', () => {
  assert.equal(runner.applyability({ ats: 'workday' }, {}, { missingCritical: [] }).canAuto, false);
  assert.equal(runner.applyability({ ats: 'greenhouse' }, {}, { missingCritical: [] }).canAuto, true);
});

test('a missing critical answer blocks auto-apply', () => {
  const a = runner.applyability({ ats: 'greenhouse' }, {}, { missingCritical: ['sponsorship'] });
  assert.equal(a.canAuto, false);
  assert.match(a.reason, /sponsorship/);
});

test('a variant with no uploaded PDF blocks auto-apply', () => {
  const a = runner.applyability({ ats: 'greenhouse', cvNeedsFile: true, cvFile: 'X.pdf' },
    {}, { missingCritical: [] });
  assert.equal(a.canAuto, false);
  assert.match(a.reason, /not uploaded/);
});

test('a long question is answered on what it asks, not what it mentions', () => {
  const ans = answers.defaultAnswers({ firstName: 'Diego' }, {}, { region: 'US' });

  // "...Privacy Policy applicable to the country where you are applying"
  // mentions a country. It is not asking for one.
  const policy = answers.answerFor(
    'Please review and acknowledge the specific Robinhood Applicant Privacy ' +
    'Policy applicable to the country where you are applying.*', ans);
  assert.equal(policy.status, 'consent');

  // "disqualification" contains "qualification". It is not asking for a degree.
  const worked = answers.answerFor(
    'Have you ever worked for Robinhood as an employee, intern or contractor? ' +
    'Note that providing false or misleading information may result in ' +
    'disqualification from the hiring process.*', ans);
  assert.equal(worked.ruleId, 'previouslyWorkedHere');
  assert.equal(worked.value, 'No');

  // The plain forms of both still resolve the way they always did.
  assert.equal(answers.answerFor('What country do you live in?', ans).ruleId, 'country');
  assert.equal(answers.answerFor('What is your highest degree?', ans).ruleId, 'degree');
});

test('sentence options are resolved by polarity, and only when unambiguous', () => {
  const resolver = require('../resolver.js');
  const a = answers.defaultAnswers({ firstName: 'Diego' }, {}, { region: 'US' });

  // Robinhood asks "have you ever worked here" and offers five sentences
  // instead of Yes and No. Exactly one of them is a no.
  const opts = [
    'I currently work at Robinhood as a full-time employee or intern',
    'I have previously worked at Robinhood as a full-time employee or intern (Hoodie Alumni)',
    'I currently work at Robinhood in a contractor role',
    'I have previously worked at Robinhood in a contractor role',
    'I have never worked at Robinhood'
  ];
  const r = resolver.resolve(
    'Have you ever worked for Robinhood as an employee, intern or contractor?', opts, a);
  assert.equal(r.value, 'I have never worked at Robinhood');

  // Two options carrying the wanted polarity is a coin flip, so it stays
  // unanswered rather than making a false claim about history.
  const amb = resolver.resolve('Have you ever worked at Acme?',
    ['I have never worked at Acme', 'I have not worked at Acme in five years',
     'I currently work at Acme', 'I previously worked at Acme'], a);
  assert.equal(amb, null);
});

test('a quantity answer finds the range option that contains it', () => {
  const resolver = require('../resolver.js');

  // Man Group offers notice period as buckets, not as a number of weeks.
  const notice = ['< 1 Month', '1-2 Months', '2-3 Months', '> 3 Months'];
  assert.equal(notice[resolver.matchRange('2 weeks', notice)], '< 1 Month');
  assert.equal(notice[resolver.matchRange('Two weeks', notice)], '< 1 Month');
  assert.equal(notice[resolver.matchRange('6 weeks', notice)], '1-2 Months');

  // A unit-less answer is read in the options' own unit. Converting one side
  // only is how "2" lands in "0-1 years".
  const years = ['0-1 years', '2-4 years', '5+ years'];
  assert.equal(years[resolver.matchRange('2', years)], '2-4 years');
  assert.equal(years[resolver.matchRange('7', years)], '5+ years');

  // A list that is not ranges is left alone.
  assert.equal(resolver.matchRange('2 weeks', ['Yes', 'No', 'Maybe']), -1);
});

test('a graduation date picks the bucket that does not claim an earlier degree', () => {
  const resolver = require('../resolver.js');
  const o = ['Before 2025', 'June 2025', 'December 2025', 'June 2026',
             'December 2026', 'June 2027', 'N/A'];

  // September 2026 is not offered. June 2026 would claim a degree three
  // months before it exists, so the pick is December 2026.
  assert.equal(o[resolver.matchDate('2026-09', o)], 'December 2026');
  assert.equal(o[resolver.matchDate('June 2026', o)], 'June 2026');

  // Employers use seasons as often as months.
  const seasons = ['Fall 2026', 'Winter 2027', 'Spring 2027'];
  assert.equal(seasons[resolver.matchDate('2026-09', seasons)], 'Fall 2026');

  assert.equal(resolver.matchDate('2026-09', ['Yes', 'No']), -1);
});

test('returning to school after an internship is the further-education question', () => {
  const back = answers.defaultAnswers({}, { gradDate: '2026-09' },
    { region: 'US', returnToSchool: true });
  const notBack = answers.defaultAnswers({}, { gradDate: '2026-09' },
    { region: 'US', returnToSchool: false });
  const q = 'Are you currently enrolled in a university or program and will ' +
            'return to the program upon completion of internship?*';

  assert.equal(answers.answerFor(q, back).value, 'Yes');
  assert.equal(answers.answerFor(q, notBack).value, 'No');
  // It must not be read as "which university do you attend".
  assert.equal(answers.answerFor(q, back).ruleId, 'furtherEducation');
  assert.equal(answers.answerFor('Which university do you attend?', back).ruleId, 'school');
});

test('options identify a question the words do not', () => {
  const resolver = require('../resolver.js');
  const opts = ['Immediately after the internship ends',
                'Need to return to school and available upon graduation'];
  const q = 'A successful internship may lead to consideration for a full-time ' +
            'opportunity. If you were to receive a full-time offer, when would ' +
            'you be available to start?';

  // Nothing in the question is recognisable, but the options are exactly the
  // return-to-school dichotomy, which the profile already answers.
  const back = answers.defaultAnswers({}, { gradDate: '2026-09' },
    { region: 'US', returnToSchool: true });
  assert.match(resolver.resolve(q, opts, back).value, /return to school/);

  const done = answers.defaultAnswers({}, { gradDate: '2026-09' },
    { region: 'US', returnToSchool: false });
  assert.match(resolver.resolve(q, opts, done).value, /^Immediately/);
});

test('a ranked preference gives a real second choice, ordered by CV strength', () => {
  const resolver = require('../resolver.js');
  const a = answers.defaultAnswers({}, {}, { region: 'US' });

  const cf = ['Backend/Systems', 'Full-stack', 'Frontend'];
  assert.equal(resolver.resolve('1st choice: Area of interest in Software Engineering', cf, a).value,
               'Backend/Systems');
  assert.equal(resolver.resolve('2nd choice (optional): Area of interest in Software Engineering', cf, a).value,
               'Full-stack');

  // The second pick is a genuine second, not a repeat — some forms reject that.
  const fig = ['Product Engineering', 'Backend/Infrastructure', 'Security Engineering', 'Open to any area'];
  const first = resolver.resolve('Which type of engineering work excites you most? Select your first choice.', fig, a).value;
  const second = resolver.resolve('Which type of engineering work excites you most? Select your second choice.', fig, a).value;
  assert.equal(first, 'Backend/Infrastructure');
  assert.notEqual(second, first);

  // An ordinal on something that is not an area list is left alone.
  assert.equal(resolver.matchPreference('What is your favourite colour?', ['Red', 'Blue']), null);
});

test('a skill scale is answered from the CV, never above it', () => {
  const resolver = require('../resolver.js');
  const a = answers.defaultAnswers({}, {}, { region: 'US' });
  const scale = ['None', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];

  // On the CV's skills line: the middle of the scale.
  assert.equal(resolver.matchScale('How familiar are you with Python?', scale, a), 'Intermediate');
  assert.equal(resolver.matchScale('My experience with C++ is as follows:', scale, a), 'Intermediate');

  // Not on it: the weakest positive rung. Never advanced or expert, which
  // the CV could not support.
  const docker = resolver.matchScale('My experience with Docker is as follows:', scale, a);
  assert.equal(docker, 'Beginner');

  // A list that is not a scale is left alone.
  assert.equal(resolver.matchScale('My experience with Docker is as follows:', ['Yes', 'No'], a), null);
});
