#!/usr/bin/env node
/* ═══════════════════════════════════════════
   KEYWORD GAP

   What the postings you are actually applying
   to ask for, against what your CV says. The
   point is not to stuff terms in — it is to
   find the ones you can honestly claim and are
   simply not saying, which is what an ATS
   keyword match and a six-second human skim
   both run on.

   node tools/keywords.js [family]
   ═══════════════════════════════════════════ */

const store = require('../daemon/store.js');
const { CV_PROFILES } = require('../cv-profiles.js');

/* Terms worth counting. A bare word frequency list returns "team" and
   "work"; this is the vocabulary a résumé is actually screened on. */
const TERMS = [
  // languages
  'Python', 'C++', 'Java', 'JavaScript', 'TypeScript', 'Go', 'Golang', 'Rust',
  'Scala', 'Kotlin', 'Swift', 'C#', 'Ruby', 'Perl', 'R', 'MATLAB', 'SQL', 'Bash',
  // data & backend
  'REST', 'GraphQL', 'gRPC', 'microservices', 'API', 'ETL', 'Kafka', 'Spark',
  'Hadoop', 'Airflow', 'Snowflake', 'Databricks', 'PostgreSQL', 'MySQL',
  'MongoDB', 'Redis', 'NoSQL', 'data pipeline', 'distributed systems',
  'event-driven', 'message queue', 'streaming', 'batch processing',
  // cloud & infra
  'AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD',
  'Jenkins', 'GitHub Actions', 'serverless', 'Linux', 'observability',
  'monitoring', 'infrastructure as code',
  // ai
  'machine learning', 'deep learning', 'LLM', 'NLP', 'PyTorch', 'TensorFlow',
  'RAG', 'embeddings', 'transformers', 'generative AI', 'MLOps', 'inference',
  // quant & finance
  'low latency', 'high frequency', 'market data', 'order book', 'FIX',
  'derivatives', 'options', 'risk', 'backtesting', 'time series',
  'stochastic', 'Monte Carlo', 'portfolio', 'alpha', 'execution',
  // practice
  'unit testing', 'test automation', 'code review', 'agile', 'scrum',
  'design patterns', 'object-oriented', 'concurrency', 'multithreading',
  'performance optimization', 'profiling', 'debugging', 'scalability',
  'system design', 'algorithms', 'data structures'
];

const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Short names are matched case-sensitively, because "\bGo\b" case-insensitive
   matches the English verb and reported Go as a requirement in 19% of
   postings. Same for R, and for acronyms generally. */
const CASE_SENSITIVE = new Set(['Go', 'R', 'C', 'C++', 'C#', 'API', 'REST', 'FIX',
                                'AWS', 'GCP', 'LLM', 'NLP', 'RAG', 'SQL', 'ETL']);

const hits = (text, term) => {
  const b = /^[\w+#]+$/.test(term) ? '\\b' : '';
  const flags = CASE_SENSITIVE.has(term) ? '' : 'i';
  return new RegExp(b + esc(term) + b, flags).test(text);
};

const family = process.argv[2];

const postings = Object.values(store.getApplications())
  .filter(r => ['queued', 'scouted', 'applied'].includes(r.status))
  .filter(r => r.description && r.description.length > 200)
  .filter(r => !family || (r.family || '').includes(family));

if (!postings.length) {
  console.log('No postings with descriptions' + (family ? ` for family "${family}"` : ''));
  process.exit(0);
}

// What the market asks for.
const demand = {};
for (const r of postings) {
  const d = r.description;
  for (const t of TERMS) if (hits(d, t)) demand[t] = (demand[t] || 0) + 1;
}

// What every CV variant says, pooled — a term on any variant is one you own.
const cvText = CV_PROFILES.map(p => p.resumeText || '').join(' ');
const onCv = new Set(TERMS.filter(t => hits(cvText, t)));

const ranked = Object.entries(demand).sort((a, b) => b[1] - a[1]);
const pct = n => Math.round(n / postings.length * 100);

console.log(`\n${postings.length} postings${family ? ` in ${family}` : ''}\n`);

console.log('ASKED FOR MOST, AND ALREADY ON YOUR CV');
for (const [t, n] of ranked.filter(([t]) => onCv.has(t)).slice(0, 14)) {
  console.log(`  ${String(pct(n) + '%').padStart(4)}  ${t}`);
}

console.log('\nASKED FOR MOST, AND MISSING FROM YOUR CV');
console.log('  (the ones worth adding are the ones you can back up)');
for (const [t, n] of ranked.filter(([t]) => !onCv.has(t)).slice(0, 22)) {
  console.log(`  ${String(pct(n) + '%').padStart(4)}  ${t}`);
}
