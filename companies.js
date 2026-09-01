/* ═══════════════════════════════════════════
   TARGET COMPANIES

   Canadian banks and Canadian tech first, then
   US. `ats` names the system that actually hosts
   the postings — that is what determines whether
   we can read jobs over an API and how far the
   application can be driven.

   `oa` is how reliably the employer fires an
   online assessment, and on which platform. It
   drives queue priority: the goal is assessment
   volume, not application volume.

   `verified` records whether the endpoint returned
   live postings during the last probe, and `jobs`
   the count seen. Entries with verified:false are
   NOT dead — several Workday tenants reject
   server-side probes via TLS fingerprinting but
   answer normally from inside the browser. Re-run
   the check in-extension (Sources -> Verify) or via
   `node tools/verify-sources.js` from a browser-like
   client.
   ═══════════════════════════════════════════ */

const COMPANIES = [

  /* ═══════════ TIER 1 — CANADIAN BANKS ═══════════ */

  { id:'td', name:'TD Bank', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'td.wd3.myworkdayjobs.com', tenant:'td', site:'TD_Bank_Careers',
    verified:true, jobs:1746,
    oa:{ likelihood:0.7, platform:'HackerRank', note:'Technology Analyst Program auto-assesses' } },

  { id:'bmo', name:'BMO', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'bmo.wd3.myworkdayjobs.com', tenant:'bmo', site:'External',
    verified:true, jobs:1028,
    oa:{ likelihood:0.65, platform:'HackerRank' } },

  { id:'cibc', name:'CIBC', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'cibc.wd3.myworkdayjobs.com', tenant:'cibc', site:'search',
    verified:true, jobs:525,
    oa:{ likelihood:0.6, platform:'Pymetrics' } },

  { id:'manulife', name:'Manulife', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'manulife.wd3.myworkdayjobs.com', tenant:'manulife', site:'MFCJH_Jobs',
    verified:true, jobs:639,
    oa:{ likelihood:0.5, platform:'HackerRank' } },

  // Blocked to server-side probes; expected to answer from the browser.
  { id:'rbc', name:'RBC', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'jobs.rbc.com', tenant:'rbc', site:'RBCCAREERS',
    verified:false, jobs:null,
    oa:{ likelihood:0.75, platform:'HackerRank', note:'Amplify + Tech Analyst programs' } },

  { id:'scotiabank', name:'Scotiabank', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'scotiabank.wd3.myworkdayjobs.com', tenant:'scotiabank', site:'Scotiabank_Careers',
    verified:false, jobs:null,
    oa:{ likelihood:0.65, platform:'HackerRank' } },

  { id:'nbc', name:'National Bank', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'nbc.wd3.myworkdayjobs.com', tenant:'nbc', site:'BNC_Careers',
    verified:false, jobs:null,
    oa:{ likelihood:0.5, platform:'HackerRank', note:'Montreal HQ — strong local fit' } },

  { id:'desjardins', name:'Desjardins', tier:1, country:'CA', sector:'bank',
    ats:'workday', host:'desjardins.wd3.myworkdayjobs.com', tenant:'desjardins', site:'Desjardins_Careers',
    verified:false, jobs:null,
    oa:{ likelihood:0.4, platform:'unknown', note:'Quebec — many French postings' } },

  /* ═══════════ TIER 1 — CANADIAN TECH ═══════════ */

  { id:'cohere', name:'Cohere', tier:1, country:'CA', sector:'ai',
    ats:'ashby', org:'cohere', verified:true, jobs:146,
    oa:{ likelihood:0.5, platform:'CodeSignal', note:'Toronto HQ' } },

  { id:'wealthsimple', name:'Wealthsimple', tier:1, country:'CA', sector:'fintech',
    ats:'ashby', org:'wealthsimple', verified:true, jobs:36,
    oa:{ likelihood:0.6, platform:'CoderPad' } },

  { id:'1password', name:'1Password', tier:1, country:'CA', sector:'tech',
    ats:'ashby', org:'1password', verified:true, jobs:65,
    oa:{ likelihood:0.4, platform:'unknown' } },

  { id:'faire', name:'Faire', tier:1, country:'CA', sector:'tech',
    ats:'greenhouse', token:'faire', verified:true, jobs:62,
    oa:{ likelihood:0.7, platform:'CodeSignal', note:'Toronto + Waterloo hiring' } },

  { id:'hootsuite', name:'Hootsuite', tier:1, country:'CA', sector:'tech',
    ats:'greenhouse', token:'hootsuite', verified:true, jobs:27,
    oa:{ likelihood:0.4, platform:'unknown', note:'Vancouver HQ' } },

  { id:'benevity', name:'Benevity', tier:1, country:'CA', sector:'tech',
    ats:'ashby', org:'benevity', verified:true, jobs:11,
    oa:{ likelihood:0.35, platform:'unknown', note:'Calgary HQ' } },

  { id:'lightspeed', name:'Lightspeed Commerce', tier:1, country:'CA', sector:'tech',
    ats:'ashby', org:'lightspeed', verified:true, jobs:4,
    oa:{ likelihood:0.45, platform:'HackerRank', note:'Montreal HQ' } },

  /* ═══════════ TIER 2 — QUANT & TRADING ═══════════
     Highest assessment-per-application rate of any
     category. Nearly all fire a timed HackerRank or
     CodeSignal within days, and intern pay clears
     the threshold by a wide margin. */

  { id:'jane-street', name:'Jane Street', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'janestreet', verified:true, jobs:234,
    // Redirects its board URL to www.janestreet.com — no fillable form there,
    // so postings go to the scouting report instead of the apply queue.
    autoApply: false,
    oa:{ likelihood:0.8, platform:'Custom', note:'Also hires into NYC from Canadian schools' } },

  { id:'optiver', name:'Optiver', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'optiverus', verified:true, jobs:172,
    // Redirects its board URL to www.optiver.com — no fillable form there,
    // so postings go to the scouting report instead of the apply queue.
    autoApply: false,
    oa:{ likelihood:0.9, platform:'HackerRank', note:'Timed test sent almost immediately' } },

  { id:'imc', name:'IMC Trading', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'imc', verified:true, jobs:171,
    oa:{ likelihood:0.9, platform:'HackerRank' } },

  { id:'drw', name:'DRW', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'drweng', verified:true, jobs:158,
    oa:{ likelihood:0.8, platform:'HackerRank' } },

  { id:'jump', name:'Jump Trading', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'jumptrading', verified:true, jobs:110,
    // Redirects its board URL to www.jumptrading.com — no fillable form there,
    // so postings go to the scouting report instead of the apply queue.
    autoApply: false,
    oa:{ likelihood:0.85, platform:'HackerRank' } },

  { id:'squarepoint', name:'Squarepoint Capital', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'squarepointcapital', verified:true, jobs:91,
    // Redirects its board URL to www.squarepoint-capital.com — no fillable form there,
    // so postings go to the scouting report instead of the apply queue.
    autoApply: false,
    oa:{ likelihood:0.85, platform:'HackerRank' } },

  { id:'akuna', name:'Akuna Capital', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'akunacapital', verified:true, jobs:34,
    // Redirects its board URL to akunacapital.com — no fillable form there,
    // so postings go to the scouting report instead of the apply queue.
    autoApply: false,
    oa:{ likelihood:0.9, platform:'HackerRank' } },

  { id:'belvedere', name:'Belvedere Trading', tier:2, country:'US', sector:'quant',
    ats:'lever', token:'belvederetrading', verified:true, jobs:14,
    oa:{ likelihood:0.85, platform:'HackerRank' } },

  /* ═══════════ TIER 2 — BIG TECH & AI ═══════════ */

  { id:'databricks', name:'Databricks', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'databricks', verified:true, jobs:833,
    oa:{ likelihood:0.75, platform:'HackerRank' } },

  { id:'openai', name:'OpenAI', tier:2, country:'US', sector:'ai',
    ats:'ashby', org:'openai', verified:true, jobs:745,
    oa:{ likelihood:0.4, platform:'CoderPad' } },

  { id:'stripe', name:'Stripe', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'stripe', verified:true, jobs:581,
    // Redirects its board URL to stripe.com — no fillable form there,
    // so postings go to the scouting report instead of the apply queue.
    autoApply: false,
    oa:{ likelihood:0.7, platform:'HackerRank' } },

  { id:'anthropic', name:'Anthropic', tier:2, country:'US', sector:'ai',
    ats:'greenhouse', token:'anthropic', verified:true, jobs:560,
    oa:{ likelihood:0.4, platform:'CoderPad' } },

  { id:'datadog', name:'Datadog', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'datadog', verified:true, jobs:450,
    oa:{ likelihood:0.7, platform:'CodeSignal' } },

  { id:'snowflake', name:'Snowflake', tier:2, country:'US', sector:'bigtech',
    ats:'ashby', org:'snowflake', verified:true, jobs:385,
    oa:{ likelihood:0.6, platform:'HackerRank' } },

  { id:'palantir', name:'Palantir', tier:2, country:'US', sector:'bigtech',
    ats:'lever', token:'palantir', verified:true, jobs:306,
    oa:{ likelihood:0.7, platform:'HackerRank' } },

  { id:'scale', name:'Scale AI', tier:2, country:'US', sector:'ai',
    ats:'greenhouse', token:'scaleai', verified:true, jobs:218,
    oa:{ likelihood:0.6, platform:'CodeSignal' } },

  { id:'pinterest', name:'Pinterest', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'pinterest', verified:true, jobs:216,
    oa:{ likelihood:0.6, platform:'CodeSignal' } },

  { id:'affirm', name:'Affirm', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'affirm', verified:true, jobs:204,
    oa:{ likelihood:0.65, platform:'CodeSignal', note:'Hires remote in Canada' } },

  { id:'airbnb', name:'Airbnb', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'airbnb', verified:true, jobs:186,
    oa:{ likelihood:0.55, platform:'CodeSignal' } },

  { id:'coinbase', name:'Coinbase', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'coinbase', verified:true, jobs:179,
    oa:{ likelihood:0.8, platform:'CodeSignal', note:'Hires remote in Canada' } },

  { id:'figma', name:'Figma', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'figma', verified:true, jobs:159,
    oa:{ likelihood:0.6, platform:'CoderPad' } },

  { id:'reddit', name:'Reddit', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'reddit', verified:true, jobs:153,
    oa:{ likelihood:0.6, platform:'CodeSignal', note:'Has a Toronto office' } },

  { id:'ramp', name:'Ramp', tier:2, country:'US', sector:'fintech',
    ats:'ashby', org:'ramp', verified:true, jobs:135,
    oa:{ likelihood:0.65, platform:'CodeSignal' } },

  { id:'robinhood', name:'Robinhood', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'robinhood', verified:true, jobs:130,
    oa:{ likelihood:0.75, platform:'CodeSignal' } },

  { id:'instacart', name:'Instacart', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'instacart', verified:true, jobs:121,
    oa:{ likelihood:0.6, platform:'CodeSignal', note:'Large Toronto engineering office' } },

  { id:'plaid', name:'Plaid', tier:2, country:'US', sector:'fintech',
    ats:'ashby', org:'plaid', verified:true, jobs:101,
    oa:{ likelihood:0.6, platform:'CodeSignal' } },

  { id:'discord', name:'Discord', tier:2, country:'US', sector:'bigtech',
    ats:'greenhouse', token:'discord', verified:true, jobs:52,
    oa:{ likelihood:0.55, platform:'CoderPad' } },

  /* ═══════════ TIER 2 — WORKDAY ENTERPRISE ═══════════ */

  { id:'capitalone', name:'Capital One', tier:2, country:'US', sector:'bank',
    ats:'workday', host:'capitalone.wd12.myworkdayjobs.com', tenant:'capitalone', site:'Capital_One',
    verified:true, jobs:1846,
    oa:{ likelihood:0.85, platform:'Cognitive + Coding', note:'Fully automated assessment pipeline' } },

  { id:'nvidia', name:'NVIDIA', tier:2, country:'US', sector:'bigtech',
    ats:'workday', host:'nvidia.wd5.myworkdayjobs.com', tenant:'nvidia', site:'NVIDIAExternalCareerSite',
    verified:true, jobs:2000,
    oa:{ likelihood:0.5, platform:'HackerRank', note:'Presagis/Omniverse background is a real hook' } },

  { id:'citi', name:'Citi', tier:2, country:'US', sector:'bank',
    ats:'workday', host:'citi.wd5.myworkdayjobs.com', tenant:'citi', site:'2',
    verified:true, jobs:2000,
    oa:{ likelihood:0.7, platform:'HackerRank + HireVue' } },

  { id:'salesforce', name:'Salesforce', tier:2, country:'US', sector:'bigtech',
    ats:'workday', host:'salesforce.wd12.myworkdayjobs.com', tenant:'salesforce', site:'External_Career_Site',
    verified:true, jobs:1536,
    oa:{ likelihood:0.5, platform:'HackerRank' } },

  { id:'autodesk', name:'Autodesk', tier:2, country:'US', sector:'bigtech',
    ats:'workday', host:'autodesk.wd1.myworkdayjobs.com', tenant:'autodesk', site:'Ext',
    verified:true, jobs:416,
    oa:{ likelihood:0.45, platform:'HackerRank', note:'Montreal office; 3D/simulation overlap' } },

  { id:'workday-inc', name:'Workday', tier:2, country:'US', sector:'bigtech',
    ats:'workday', host:'workday.wd5.myworkdayjobs.com', tenant:'workday', site:'Workday',
    verified:true, jobs:372,
    oa:{ likelihood:0.5, platform:'HackerRank' } },

  { id:'blackrock', name:'BlackRock', tier:2, country:'US', sector:'bank',
    ats:'workday', host:'blackrock.wd1.myworkdayjobs.com', tenant:'blackrock', site:'BlackRock_Professional',
    verified:true, jobs:322,
    oa:{ likelihood:0.7, platform:'HackerRank' } },

  /* ═══════════ TIER 3 — CUSTOM ADAPTERS ═══════════ */


  /* ═══════════ TIER 2 — QUANT & ASSET MANAGEMENT (added) ═══════════ */

  { id:'point72', name:'Point72', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'point72', verified:true, jobs:235,
    oa:{ likelihood:0.7, platform:'HackerRank', note:'Academy + quant dev pipelines' } },

  { id:'tower', name:'Tower Research Capital', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'towerresearchcapital', verified:true, jobs:85,
    oa:{ likelihood:0.85, platform:'HackerRank' } },

  { id:'aqr', name:'AQR Capital', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'aqr', verified:true, jobs:51,
    oa:{ likelihood:0.75, platform:'HackerRank', note:'Strong quant-research intake' } },

  { id:'mangroup', name:'Man Group', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'mangroup', verified:true, jobs:57,
    oa:{ likelihood:0.7, platform:'HackerRank' } },

  { id:'virtu', name:'Virtu Financial', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'virtu', verified:true, jobs:47,
    oa:{ likelihood:0.8, platform:'HackerRank' } },

  { id:'flowtraders', name:'Flow Traders', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'flowtraders', verified:true, jobs:43,
    oa:{ likelihood:0.85, platform:'HackerRank' } },

  { id:'oldmission', name:'Old Mission Capital', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'oldmissioncapital', verified:true, jobs:36,
    // Redirects its board URL to www.oldmissioncapital.com — no fillable form there,
    // so postings go to the scouting report instead of the apply queue.
    autoApply: false,
    oa:{ likelihood:0.85, platform:'HackerRank' } },

  { id:'fiverings', name:'Five Rings', tier:2, country:'US', sector:'quant',
    ats:'greenhouse', token:'fiveringsllc', verified:true, jobs:15,
    oa:{ likelihood:0.9, platform:'HackerRank', note:'Very high assessment rate' } },

  /* ═══════════ TIER 1 — CANADIAN FINTECH (added) ═══════════ */

  { id:'hopper', name:'Hopper', tier:1, country:'CA', sector:'tech',
    ats:'ashby', org:'hopper', verified:true, jobs:43,
    oa:{ likelihood:0.5, platform:'CoderPad', note:'Montreal HQ' } },

  { id:'neofinancial', name:'Neo Financial', tier:1, country:'CA', sector:'fintech',
    ats:'ashby', org:'neofinancial', verified:true, jobs:98,
    oa:{ likelihood:0.55, platform:'unknown', note:'Calgary / Winnipeg' } },

  { id:'float', name:'Float', tier:1, country:'CA', sector:'fintech',
    ats:'ashby', org:'float', verified:true, jobs:24,
    oa:{ likelihood:0.45, platform:'unknown', note:'Toronto' } },

  { id:'koho', name:'KOHO', tier:1, country:'CA', sector:'fintech',
    ats:'ashby', org:'koho', verified:true, jobs:9,
    oa:{ likelihood:0.4, platform:'unknown', note:'Toronto' } },

  { id:'appdirect', name:'AppDirect', tier:1, country:'CA', sector:'tech',
    ats:'greenhouse', token:'appdirect', verified:true, jobs:61,
    oa:{ likelihood:0.45, platform:'unknown', note:'Montreal office' } },

  /* ═══════════ TIER 2 — FINTECH (added) ═══════════ */

  { id:'brex', name:'Brex', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'brex', verified:true, jobs:289,
    oa:{ likelihood:0.65, platform:'CodeSignal' } },

  { id:'block', name:'Block', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'block', verified:true, jobs:189,
    oa:{ likelihood:0.6, platform:'HackerRank', note:'Hires in Canada' } },

  { id:'nubank', name:'Nubank', tier:2, country:'US', sector:'fintech',
    ats:'ashby', org:'nubank', verified:true, jobs:118,
    oa:{ likelihood:0.6, platform:'CodeSignal' } },

  { id:'chime', name:'Chime', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'chime', verified:true, jobs:63,
    oa:{ likelihood:0.6, platform:'CodeSignal' } },

  { id:'sofi', name:'SoFi', tier:2, country:'US', sector:'fintech',
    ats:'greenhouse', token:'sofi', verified:true, jobs:60,
    oa:{ likelihood:0.6, platform:'HackerRank' } },

  /* ═══════════ TIER 3 — CUSTOM ADAPTERS ═══════════ */

  { id:'netflix', name:'Netflix', tier:2, country:'US', sector:'bigtech',
    ats:'custom', adapter:'netflix', verified:true, jobs:198,
    oa:{ likelihood:0.35, platform:'CoderPad', note:'Rarely runs a standard OA' } },

  { id:'google', name:'Google', tier:3, country:'US', sector:'bigtech',
    ats:'custom', adapter:'google', verified:false, jobs:null,
    oa:{ likelihood:0.5, platform:'Codility', note:'Browser-only; blocks server-side probes' } },

  { id:'apple', name:'Apple', tier:3, country:'US', sector:'bigtech',
    ats:'custom', adapter:'apple', verified:false, jobs:null,
    oa:{ likelihood:0.4, platform:'Custom', note:'Browser-only' } },

  { id:'meta', name:'Meta', tier:3, country:'US', sector:'bigtech',
    ats:'custom', adapter:'meta', verified:false, jobs:null,
    oa:{ likelihood:0.5, platform:'CodeSignal', note:'Browser-only' } },

  { id:'amazon', name:'Amazon', tier:3, country:'US', sector:'bigtech',
    ats:'custom', adapter:'amazon', verified:null, jobs:null,
    oa:{ likelihood:0.9, platform:'Amazon OA', note:'SDE intern / new grad OA is near-automatic' } },

  { id:'microsoft', name:'Microsoft', tier:3, country:'US', sector:'bigtech',
    ats:'custom', adapter:'microsoft', verified:null, jobs:null,
    oa:{ likelihood:0.6, platform:'Codility', note:'Vancouver + Montreal presence' } }
];

/** Canada first, then tier, then assessment likelihood. */
function prioritized(companies = COMPANIES, opts = {}) {
  const { canadaFirst = true, includeUnverified = true } = opts;
  return companies
    .filter(c => includeUnverified || c.verified !== false)
    .slice()
    .sort((a, b) => {
      if (canadaFirst && a.country !== b.country) return a.country === 'CA' ? -1 : 1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return (b.oa?.likelihood || 0) - (a.oa?.likelihood || 0);
    });
}

function byId(id) { return COMPANIES.find(c => c.id === id) || null; }

/** Employers whose board URL redirects away from a fillable form. */
function canAutoApply(companyId) {
  const c = byId(companyId);
  return c ? c.autoApply !== false : true;
}

function stats() {
  const out = { total: COMPANIES.length, verified: 0, unverified: 0, reachableJobs: 0,
                byCountry: {}, bySector: {}, byAts: {} };
  for (const c of COMPANIES) {
    if (c.verified === true) { out.verified++; out.reachableJobs += c.jobs || 0; }
    else if (c.verified === false) out.unverified++;
    out.byCountry[c.country] = (out.byCountry[c.country] || 0) + 1;
    out.bySector[c.sector] = (out.bySector[c.sector] || 0) + 1;
    out.byAts[c.ats] = (out.byAts[c.ats] || 0) + 1;
  }
  return out;
}

const __companies = { COMPANIES, prioritized, byId, stats, canAutoApply };

// Node (tests) and browser / service-worker (importScripts or <script>)
if (typeof module !== 'undefined' && module.exports) module.exports = __companies;
if (typeof self !== 'undefined') self.__companies = __companies;
