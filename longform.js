/* ═══════════════════════════════════════════
   LONG-FORM ANSWERS

   "Why do you want to work here?", "Describe a
   project you are proud of", "What excites you
   about this role?" — the questions where a real
   answer separates a candidate from a filled-in
   form. They were being skipped, which is the
   worst outcome: the application still goes in,
   just visibly emptier than the next one.

   These are composed the same way as the cover
   letter — by selecting true paragraphs about
   real work and binding them to what the posting
   actually asks for. Nothing is invented, so an
   answer can never claim experience the CV does
   not support.
   ═══════════════════════════════════════════ */

/* Evidence, phrased for prose rather than a bullet. */
const STORIES = {
  agent: {
    triggers: ['llm', 'ai', 'agent', 'genai', 'rag', 'retrieval', 'nlp', 'machine learning',
               'anthropic', 'openai', 'cohere', 'reinforcement', 'model', 'inference'],
    text: 'At McKesson I am building an AI agent for the AI Canada team that ingests recorded ' +
          'video calls and turns them into structured transcripts, keyframes and summaries, then ' +
          'makes that corpus queryable so the agent can answer questions across past meetings. ' +
          'The interesting part has been retrieval quality rather than generation — deciding what ' +
          'context is actually worth putting in front of the model.'
  },
  trading: {
    triggers: ['trading', 'market', 'latency', 'execution', 'exchange', 'alpha', 'quant', 'strategy'],
    text: 'I run a trading system called Roger that scans over a hundred prediction markets every ' +
          'thirty seconds through an asyncio pipeline and executes five concurrent strategies on ' +
          'the Polygon mainnet. A Bayesian scoring engine updates each strategy from realised ' +
          'outcomes, which forced me to think carefully about sample size and the difference ' +
          'between a real edge and noise.'
  },
  performance: {
    triggers: ['performance', 'optimi', 'c++', 'latency', 'profiling', 'scale', 'systems', 'efficient'],
    text: 'Most of my internships were in performance-sensitive C++. Refactoring CAE\'s ' +
          'sensor-processing modules with profiling tools and a Strategy-pattern redesign improved ' +
          'platform performance by up to 15% and made the code far easier to extend, which mattered ' +
          'more to the team than the raw number did.'
  },
  pipelines: {
    triggers: ['pipeline', 'etl', 'data', 'ingestion', 'streaming', 'throughput', 'backend'],
    text: 'I build data pipelines end to end. At CAE I wrote C++ sensor-stream pipelines with ' +
          'validation and automated tests that cut data inconsistency by 20%, and PowerShell ' +
          'automation that diffed Git-versioned virtual assets across environments to surface ' +
          'configuration drift nobody had visibility into before.'
  },
  automation: {
    triggers: ['automation', 'tooling', 'developer productivity', 'internal tools', 'ci/cd', 'devops'],
    text: 'I tend to go looking for the manual step that keeps getting repeated. At CAE I built an ' +
          'XML-based developer productivity extension that took a recurring four-hour task down to ' +
          'thirty minutes, which compounded across every release after it.'
  },
  simulation: {
    triggers: ['simulation', '3d', 'graphics', 'digital twin', 'robotics', 'vision', 'lidar', 'sensor'],
    text: 'My background is unusual for a new graduate: LiDAR and infrared simulation in C++ at CAE, ' +
          'and an Omniverse digital-twin pipeline at Presagis built alongside NVIDIA research, where ' +
          'I co-authored three internal reports on machine-learning point-cloud workflows for robotics.'
  }
};

/** Which stories the posting actually calls for. */
function pick(job, max = 2) {
  // The company and the title count, not only the description. An Anthropic
  // reinforcement-learning role was pulling the CAE pipeline paragraph
  // because the posting body happened not to say "AI" — the name on the door
  // is the strongest signal there is about what they want to read.
  const text = `${job.company || ''} ${job.title || ''} ${job.description || ''}`.toLowerCase();
  const scored = Object.entries(STORIES)
    .map(([k, s]) => [k, s, s.triggers.filter(t => text.includes(t)).length])
    .filter(([, , n]) => n > 0)
    .sort((a, b) => b[2] - a[2]);
  if (!scored.length) return [STORIES.agent, STORIES.pipelines].slice(0, max);
  return scored.slice(0, max).map(([, s]) => s);
}

/** A concrete hook from the posting, so the answer is about them. */
function hook(job) {
  const d = String(job.description || '');
  const m = d.match(/(?:you (?:will|'ll) (?:be )?(?:work(?:ing)? on|build(?:ing)?|design(?:ing)?)|the team (?:builds|owns|is building))\s+([^.\n]{15,110})/i);
  if (m) return m[1].replace(/\s+/g, ' ').trim().replace(/[,;]$/, '');
  return null;
}

const KINDS = {
  /* Why this company / role */
  whyCompany(job) {
    const co = job.company || 'your team';
    const h = hook(job);
    const stories = pick(job, 1);
    return [
      h ? `What draws me to ${co} is the actual work — ${h}.`
        : `${co} is working on problems I have spent my degree and five internships getting close to.`,
      stories[0].text,
      `I would rather be somewhere the engineering is the product than somewhere it supports it, ` +
      `and that is what this role reads like.`
    ].join(' ');
  },

  /* Most interesting or challenging project */
  project(job) {
    const stories = pick(job, 1);
    return stories[0].text +
      ' The part I would call hardest was not the code but deciding what to measure — it is easy ' +
      'to ship something that looks like it works and never find out that it does not.';
  },

  /* Greatest strength / tell us about yourself */
  strengths(job) {
    return 'I am at my best when the problem is under-specified and the first job is working out ' +
      'what is actually being asked. Across five internships the pattern has been the same: find ' +
      'the manual step everyone has quietly accepted, and remove it. ' + pick(job, 1)[0].text;
  },

  /* "Something meaningful you have done in line with your values" — asked
     by Anthropic and increasingly by others. The failure mode is a
     platitude, so this answers with a specific piece of work and what the
     choice in it actually was. */
  values(job) {
    return 'At McKesson I built internal iOS tooling whose job was to enforce data-privacy ' +
      'policy on how staff handled sensitive customer and employee information. It would have ' +
      'been faster to ship the feature and leave the policy to a training document; the reason ' +
      'not to is that the failure mode there is somebody\'s medical or payroll data, and a ' +
      'control that exists in the software is the only one that holds when people are busy. ' +
      'The same instinct shows up in the rest of my work as removing the manual step everyone ' +
      'has quietly accepted — a four-hour task at CAE cut to thirty minutes — because the ' +
      'repeated manual step is where mistakes and resentment both accumulate.';
  },

  /* Open "anything else" boxes */
  coverLetter(job, cover) { return cover || KINDS.whyCompany(job); }
};

/**
 * @param {string} kind  longform rule id from answers.js
 * @param {object} job   the posting
 * @param {object} opts  { cover, limit }
 * @returns {string|null}
 */
function compose(kind, job, opts = {}) {
  const fn = KINDS[kind];
  if (!fn) return null;
  let text = fn(job, opts.cover);
  if (!text) return null;

  // Respect a form's character limit rather than being truncated mid-sentence.
  const limit = opts.limit && opts.limit > 80 ? opts.limit : 0;
  if (limit && text.length > limit) {
    const cut = text.slice(0, limit);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
    text = end > limit * 0.5 ? cut.slice(0, end + 1) : cut;
  }
  return text.trim();
}

const __longform = { compose, pick, hook, STORIES, KINDS };
if (typeof module !== 'undefined' && module.exports) module.exports = __longform;
if (typeof self !== 'undefined') self.__longform = __longform;
