/* ═══════════════════════════════════════════
   A LETTER ABOUT THIS POSTING

   The generic composer produced the same four
   paragraphs for every role, opening with a
   line — "the part of my background most
   relevant here is early career generalist" —
   that reads as a template artefact because it
   is one.

   This reads the posting, takes the things it
   actually asks for, and answers those with the
   specific work that speaks to them. Where
   nothing in the CV speaks to a requirement, it
   is left out rather than papered over.
   ═══════════════════════════════════════════ */

const C = require('./resume-content.js');

/* Evidence, tagged by what it demonstrates. Each entry is one true claim
   with the number attached, phrased to slot into a sentence. */
const EVIDENCE = [
  { tags: ['ai', 'llm', 'rag', 'retrieval', 'search', 'ml', 'inference', 'agent', 'nlp'],
    weight: 3,
    text: 'I am building a retrieval-augmented agent at McKesson: an ingestion pipeline that turns ' +
          'recorded calls into transcripts, keyframes and summaries, and a retrieval layer that makes ' +
          'the corpus semantically searchable so answers are grounded in the meetings rather than the ' +
          'model. The hard part has been retrieval quality — deciding what context is worth putting in ' +
          'front of the model at all.' },
  { tags: ['c++', 'performance', 'latency', 'profiling', 'optimization', 'systems', 'low-level', 'kernel', 'embedded'],
    weight: 3,
    text: 'Three of my internships were in performance-sensitive C++. Profiling CAE\'s sensor-processing ' +
          'modules and rebuilding them around the Strategy pattern improved platform performance by up ' +
          'to 15%, and the measuring mattered more than the refactor — most of the work was finding out ' +
          'where the time actually went.' },
  { tags: ['pipeline', 'data', 'etl', 'streaming', 'ingestion', 'throughput', 'reliability', 'validation'],
    weight: 3,
    text: 'I build data pipelines end to end. At CAE I wrote C++ pipelines for real-time sensor streams ' +
          'with validation and automated tests that cut data inconsistency by 20%, and PowerShell ' +
          'automation that diffed Git-versioned assets across environments to surface configuration ' +
          'drift nobody had visibility into.' },
  { tags: ['trading', 'market', 'quant', 'execution', 'statistics', 'bayesian', 'time series', 'alpha', 'risk'],
    weight: 3,
    text: 'Outside work I run a live trading system: an asyncio pipeline polling 100+ prediction markets ' +
          'every thirty seconds, five concurrent strategies executing on-chain, and a Bayesian scoring ' +
          'engine that updates each strategy from realised outcomes. It has taught me more about sample ' +
          'size and the difference between edge and noise than any course did.' },
  { tags: ['infrastructure', 'cloud', 'aws', 'gcp', 'docker', 'ci/cd', 'devops', 'platform', 'kubernetes', 'network'],
    weight: 2,
    text: 'My cloud-engineering internship at CAE was infrastructure work: automation that compared ' +
          'Git-versioned virtual assets across environments and raised data-governance coverage by 35%, ' +
          'plus the reporting that made configuration differences legible to the people who had to act ' +
          'on them.' },
  { tags: ['automation', 'tooling', 'developer', 'productivity', 'internal', 'workflow'],
    weight: 2,
    text: 'I go looking for the manual step everyone has quietly accepted. At CAE an XML-based developer ' +
          'productivity extension took a recurring four-hour task down to thirty minutes, which ' +
          'compounded across every release after it.' },
  { tags: ['simulation', '3d', 'graphics', 'robotics', 'vision', 'lidar', 'sensor', 'digital twin'],
    weight: 2,
    text: 'My background is unusual for a new graduate: LiDAR and infrared simulation in C++ at CAE, and ' +
          'an Omniverse digital-twin pipeline at Presagis built alongside NVIDIA research, where I ' +
          'co-authored three internal reports on machine-learning point-cloud workflows for robotics.' },
  { tags: ['stakeholder', 'cross-functional', 'customer', 'deployment', 'solutions', 'business', 'product'],
    weight: 2,
    text: 'Most of what I have shipped was for people outside engineering — approval workflows for ' +
          'business teams, asset-review reports for simulation stakeholders, prototypes demoed to guide ' +
          'roadmap decisions. Getting the requirement right has usually been harder than the code.' },
  { tags: ['security', 'privacy', 'compliance', 'governance'],
    weight: 2,
    text: 'At McKesson I built internal tooling whose job was enforcing data-privacy policy on how staff ' +
          'handled sensitive customer and employee information — a control in the software rather than ' +
          'in a training document, because that is the one that holds when people are busy.' }
];

/* Phrases a posting uses to introduce what it wants. */
const WANT_LINES = [
  /you(?:'|’)?ll\s+(?:be\s+)?(?:work(?:ing)?\s+on|build(?:ing)?|design(?:ing)?|own(?:ing)?|lead(?:ing)?)\s+([^.\n]{20,150})/gi,
  /(?:we\s+are|we're)\s+looking\s+for\s+([^.\n]{20,150})/gi,
  /the\s+team\s+(?:owns|builds|is\s+building|operates)\s+([^.\n]{20,150})/gi,
  /(?:this\s+role|the\s+role)\s+(?:involves|focuses\s+on|is\s+about)\s+([^.\n]{20,150})/gi
];

const clean = t => String(t).replace(/\s+/g, ' ').trim().replace(/[,;:]$/, '');

/** Trim to a clause boundary, so a hook never ends mid-word. */
function toClause(t, limit = 130) {
  const s = clean(t);
  if (s.length <= limit) return trimDangling(s);
  const cut = s.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' — '), cut.lastIndexOf('; '));
  if (stop > limit * 0.5) return cut.slice(0, stop);
  const word = cut.lastIndexOf(' ');
  return trimDangling(word > 0 ? cut.slice(0, word) : cut);
}

/* A clause cut at a boundary often ends on a conjunction — "...training
   efficiency and" — which reads as a sentence that lost its ending. */
function trimDangling(t) {
  let out = clean(t);
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/[\s,;:—–-]*\b(and|or|but|with|for|to|of|in|on|that|which|the|a|an)\s*$/i, '');
    if (next === out) break;
    out = clean(next);
  }
  return out;
}

/* Culture copy, which every posting has and none of it says what the work
   is. Opening a letter by quoting "people who share our values and challenge
   ordinary thinking" back at them is worse than not quoting anything. */
const BOILERPLATE = /share\s+our\s+values|challenge\s+ordinary|push\s+the\s+pace|passionate\s+about|world[- ]class\s+team|fast[- ]paced\s+environment|equal\s+opportunity|diverse\s+and\s+inclusive|make\s+a\s+difference|join\s+us\s+(?:in|on)|exciting\s+opportunity|team\s+players?/i;

/* "In this role, you'll partner with Sales…" quotes better without its
   lead-in, which is addressed to the reader rather than describing the job. */
function stripLeadIn(t) {
  return clean(String(t)
    .replace(/^(?:in\s+this\s+role|as\s+a[^,]{0,40}|on\s+this\s+team|here)\s*,\s*/i, '')
    .replace(/^(?:you(?:'|’)?ll|you\s+will)\s+/i, '')
    .replace(/^[-–—•]\s*/, ''));
}

/** Is this sentence about the work, rather than about the company? */
function describesWork(t, job) {
  if (!t || t.length < 30) return false;
  if (BOILERPLATE.test(t)) return false;
  // A company's own tagline says nothing about why you want the job.
  if (job.company && new RegExp('^(?:at\\s+)?' + job.company.split(/\s+/)[0].replace(/[^\w]/g, '') + '\\b', 'i').test(t)) return false;
  if (/\b(is|are|we're|we are)\s+(?:seeking|looking\s+for|hiring)\b/i.test(t)) return false;
  if (/\bmission\s+is\b|\bour\s+mission\b/i.test(t)) return false;
  // Sentences about the candidate rather than the work read absurdly when
  // quoted back: "the work is the ideal candidate will have deep experience".
  if (/^(?:the\s+)?(?:ideal\s+)?candidate\b|^you\s+will\s+be\s+(?:a|an)\b|^we\s+want\b/i.test(t)) return false;
  return /\b(system|service|platform|infrastructure|pipeline|model|data|network|API|software|application|tool|product|code|cluster|deploy|build|design|scale|latency|training|inference|automation|owns)\b/i.test(t);
}

/** One concrete sentence about what this team does. */
function whatTheyDo(job) {
  const d = String(job.description || '').replace(/https?:\/\/\S+/g, ' ');

  for (const re of WANT_LINES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(d))) {
      if (!m[1]) continue;
      const t = stripLeadIn(toClause(m[1]));
      if (describesWork(t, job)) return t;
    }
  }

  // Failing that, the first sentence in the body that is about the work.
  for (const line of d.split(/\n+/).map(clean)) {
    if (/^[A-Z\s]{6,}$/.test(line)) continue;       // section heading
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const t = stripLeadIn(toClause(sentence, 150));
      if (describesWork(t, job)) return t;
    }
  }
  return null;
}

/** The evidence this posting actually calls for, strongest first. */
function evidenceFor(job, max = 3) {
  const hay = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  return EVIDENCE
    .map(e => ({ e, score: e.tags.filter(t => hay.includes(t)).length * e.weight }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.e.text);
}

/**
 * @param job      the posting
 * @param profile  contact details
 * @returns {{text:string, evidenceUsed:number, hook:string|null}}
 */
function compose(job, profile = {}) {
  const company = job.company || 'your team';
  const role = String(job.title || 'this role').replace(/\s*[-–—]\s*\d{4}.*$/, '').trim();
  const hook = whatTheyDo(job);
  const evidence = evidenceFor(job);

  // Stated as its own sentence rather than spliced into one, because a hook
  // is sometimes a noun phrase and sometimes a full clause, and no single
  // splice reads well for both.
  const opening = hook
    ? `I am applying for the ${role} role at ${company}. What drew me to it: ${hook}. ` +
      `That is close to what I have spent my degree and five internships doing.`
    : `I am applying for the ${role} role at ${company}. I am finishing a Computer Science degree at ` +
      `Concordia in Montreal, with five internships behind me at McKesson, CAE and Presagis.`;

  // The role title is already in the opening; repeating it in full reads as
  // a mail merge.
  const closing =
    `I graduate in September and my contract at McKesson runs to December, so I am available from ` +
    `January and can interview well before then. I would welcome the chance to talk it through.`;

  const body = evidence.length ? evidence : [
    'Across five internships the pattern has been the same: find the manual step everyone has quietly ' +
    'accepted, and remove it. A four-hour task at CAE became a thirty-minute one; approval steps at ' +
    'McKesson came out of the workflow entirely.'
  ];

  const text = [
    `Dear ${company} hiring team,`, '',
    opening, '',
    ...body.flatMap(p => [p, '']),
    closing, '',
    'Sincerely,',
    `${profile.firstName || 'Diego'} ${profile.lastName || 'Crisafulli'}`,
    `${profile.email || 'diego.crisafu@gmail.com'} · ${profile.phone || '+1 514 679 5568'}`
  ].join('\n');

  return { text, evidenceUsed: evidence.length, hook };
}

const __tailoredLetter = { compose, evidenceFor, whatTheyDo, EVIDENCE };
if (typeof module !== 'undefined' && module.exports) module.exports = __tailoredLetter;
