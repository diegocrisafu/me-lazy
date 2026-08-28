/* ═══════════════════════════════════════════
   COVER LETTER

   Composed from the posting and the chosen CV
   variant, with no external service — the
   extension makes no third-party calls.

   The approach is selection, not generation:
   a bank of true, specific paragraphs about
   real work, chosen by what the posting asks
   for. Nothing is invented, so a letter can
   never claim experience that is not on the CV.
   ═══════════════════════════════════════════ */

/* Evidence paragraphs. Each is a real accomplishment with the terms that
   should trigger it. `families` limits a paragraph to relevant role types. */
const EVIDENCE = [
  { id: 'ai-production',
    triggers: ['ai', 'machine learning', 'ml', 'llm', 'automation', 'decision', 'production'],
    families: ['swe', 'data', 'analyst'],
    text: 'At McKesson I integrated Python and .NET AI modules into production decision workflows, automating routine approvals and measurably reducing the manual review effort for business teams.' },

  { id: 'pipelines',
    triggers: ['pipeline', 'etl', 'data engineering', 'ingestion', 'streaming', 'throughput'],
    families: ['swe', 'data', 'quant-dev'],
    text: 'I build data pipelines end to end: at CAE I wrote C++ sensor-stream pipelines with validation and automated tests that cut data inconsistency by 20%, and my own trading bot ingests 100+ prediction markets every 30 seconds in Python with asyncio at steady end-to-end latency.' },

  { id: 'trading',
    triggers: ['trading', 'market', 'latency', 'execution', 'exchange', 'alpha', 'strategy', 'order'],
    families: ['quant-dev', 'quant-research'],
    text: 'Outside work I run Roger, a trading system that executes five concurrent strategies on the Polygon mainnet through asynchronous workers, with a Bayesian scoring engine that learns from realised outcomes and stores them in SQLite for fast strategy evaluation.' },

  { id: 'quant-modelling',
    triggers: ['model', 'statistical', 'statistics', 'forecast', 'time series', 'research', 'quantitative'],
    families: ['quant-research', 'data'],
    text: 'My trading project is fundamentally a modelling problem: the Bayesian scoring engine updates strategy weights from realised trade outcomes, which meant thinking carefully about priors, sample size and the difference between a real edge and noise.' },

  { id: 'performance',
    triggers: ['performance', 'optimize', 'optimise', 'low latency', 'profiling', 'c++', 'scale', 'efficient'],
    families: ['swe', 'quant-dev'],
    text: 'I have spent most of my internships in performance-sensitive C++: refactoring CAE\'s sensor-processing modules with profiling tools and a Strategy-pattern redesign improved platform performance by up to 15% while making the code substantially easier to maintain.' },

  { id: 'automation',
    triggers: ['automation', 'tooling', 'developer productivity', 'internal tools', 'powershell', 'ci/cd', 'devops'],
    families: ['swe', 'analyst', 'data'],
    text: 'I gravitate toward removing repeated manual work. At CAE I built an XML-based developer productivity extension that took a recurring four-hour task down to thirty minutes, and PowerShell automation that raised configuration-governance coverage by 35%.' },

  { id: 'stakeholders',
    triggers: ['stakeholder', 'communication', 'cross-functional', 'business', 'requirements', 'present'],
    families: ['analyst', 'swe', 'data'],
    text: 'Much of my value has come from translating between technical and business contexts — gathering what stakeholders actually needed, then delivering the tool that answered it, including pitching security and compliance workflow changes to VP-level managers at McKesson.' },

  { id: 'cloud',
    triggers: ['cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'infrastructure', 'distributed'],
    families: ['swe', 'data'],
    text: 'I have worked across cloud and on-premises environments, prototyping backend and cloud-storage features in .NET and Python and using Git-based workflows throughout.' },

  { id: 'simulation',
    triggers: ['simulation', '3d', 'graphics', 'digital twin', 'robotics', 'computer vision', 'lidar', 'sensor'],
    families: ['swe', 'data', 'quant-dev'],
    text: 'My simulation background is unusual for a new graduate: LiDAR and infrared test coverage in C++ at CAE, and an Omniverse digital-twin pipeline at Presagis built alongside NVIDIA research that cut manual modelling hours by 25%.' }
];

const OPENERS = {
  intern: (role, company) =>
    `I am applying for the ${role} internship at ${company}. I am a final-year Computer Science student at Concordia in Montreal, and I have spent four internships — at McKesson, CAE and Presagis — shipping software that went into production rather than sitting in a sandbox.`,
  newgrad: (role, company) =>
    `I am applying for the ${role} position at ${company}. I finish my Computer Science degree at Concordia this year, and I come to it with four completed internships at McKesson, CAE and Presagis, all of them writing production software.`,
  default: (role, company) =>
    `I am writing to apply for the ${role} role at ${company}. I am a Computer Science student at Concordia in Montreal with four internships behind me at McKesson, CAE and Presagis.`
};

const CLOSERS = {
  CA: (company) =>
    `I am based in Montreal and authorised to work in Canada, so I can start without any immigration process. I would welcome the chance to talk about what ${company} is building.`,
  US: (company) =>
    `I am based in Montreal and open to relocating for the right role. I would welcome the chance to talk about what ${company} is building.`,
  default: (company) =>
    `I would welcome the chance to talk about what ${company} is building.`
};

const STOP = new Set(['and','the','for','with','you','our','are','will','that','this','have','from','your']);

/** Terms the posting actually emphasises, for choosing evidence. */
function postingTerms(job) {
  const text = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  return text;
}

function pickEvidence(job, family, max = 3) {
  const text = postingTerms(job);

  // A generically-titled role at a trading firm is still a trading job, so
  // the sector widens the pool the family alone would have closed off.
  const extra = job.sector === 'quant' ? ['quant-dev', 'quant-research']
              : job.sector === 'bank' || job.sector === 'fintech' ? ['analyst']
              : [];
  const allowed = new Set([family, ...extra].filter(Boolean));

  const scored = EVIDENCE
    .filter(e => !e.families || allowed.size === 0 || e.families.some(f => allowed.has(f)))
    .map(e => {
      let hits = 0;
      for (const t of e.triggers) if (text.includes(t)) hits++;
      return { e, hits };
    })
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  // Always say something concrete, even for a sparse posting.
  if (scored.length === 0) {
    return EVIDENCE.filter(e => !e.families || allowed.size === 0 ||
      e.families.some(f => allowed.has(f))).slice(0, 2);
  }
  return scored.slice(0, max).map(x => x.e);
}

/**
 * @param {object} job      normalized job (title, company, description, region)
 * @param {object} cv       the chosen CV variant
 * @param {object} profile  contact details
 * @param {object} evaluation  targeting result (level, family, location)
 * @returns {{text:string, wordCount:number, evidenceUsed:string[]}}
 */
function compose(job, cv, profile = {}, evaluation = {}) {
  const company = job.company || 'your team';
  const role = job.title || 'this role';
  const level = evaluation.level || 'default';
  const family = evaluation.family;
  const region = evaluation.location?.region;

  const opener = (OPENERS[level] || OPENERS.default)(role, company);
  const evidence = pickEvidence(job, family);
  const closer = (CLOSERS[region] || CLOSERS.default)(company);

  // One sentence tying the CV variant's angle to the posting.
  const angle = cv?.headline || cv?.name;
  const bridge = angle
    ? `The part of my background most relevant here is ${angle.toLowerCase().replace(/\s*\(no msc\)/i, '')}.`
    : '';

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Diego Crisafulli';
  const contact = [profile.email, profile.phone].filter(Boolean).join(' · ');

  const body = [
    opener,
    bridge,
    ...evidence.map(e => e.text),
    closer
  ].filter(Boolean).join('\n\n');

  const text = `Dear ${company} hiring team,\n\n${body}\n\nSincerely,\n${name}${contact ? '\n' + contact : ''}`;

  return {
    text,
    wordCount: text.split(/\s+/).length,
    evidenceUsed: evidence.map(e => e.id)
  };
}

/** Short form for boxes with a tight character limit. */
function composeShort(job, cv, profile = {}, evaluation = {}, limit = 900) {
  const full = compose(job, cv, profile, evaluation);
  if (full.text.length <= limit) return full;

  const company = job.company || 'your team';
  const role = job.title || 'this role';
  const level = evaluation.level || 'default';
  const evidence = pickEvidence(job, evaluation.family, 1);
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Diego Crisafulli';

  const text = `${(OPENERS[level] || OPENERS.default)(role, company)}\n\n${
    evidence.map(e => e.text).join(' ')}\n\n${
    (CLOSERS[evaluation.location?.region] || CLOSERS.default)(company)}\n\n${name}`;

  return { text: text.slice(0, limit), wordCount: text.split(/\s+/).length,
           evidenceUsed: evidence.map(e => e.id), truncated: text.length > limit };
}

const __coverLetter = { compose, composeShort, pickEvidence, EVIDENCE };
if (typeof module !== 'undefined' && module.exports) module.exports = __coverLetter;
if (typeof self !== 'undefined') self.__coverLetter = __coverLetter;
