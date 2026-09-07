/* ═══════════════════════════════════════════
   TIERS

   Not every application deserves the same
   effort, and spending the same effort on all
   of them wastes the ones that matter. A
   generic application to Jane Street is a
   wasted shot; a generic application to a
   mid-size SaaS company is a reasonable bet
   that costs nothing.

   S   held back for you and Claude to tailor —
       CV rewritten against this posting, real
       cover letter, screening answers checked
   A   automated, but with the best-matching CV
       and a composed cover letter
   B   automated
   C   automated only when there is capacity
   ═══════════════════════════════════════════ */

/* Employers where a tailored application is worth an hour of your time.
   Pay, brand on your CV afterwards, and how much a good application
   actually moves the needle — all three, not just prestige. */
const S_TIER_EMPLOYERS = new Set([
  // big tech
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'nvidia',
  'openai', 'anthropic', 'stripe', 'databricks', 'figma', 'airbnb',
  'snowflake', 'coinbase', 'doordash', 'pinterest', 'notion', 'ramp', 'plaid',
  // top quant
  'janestreet', 'jane-street', 'citadel', 'citadelsecurities', 'twosigma',
  'hrt', 'huddersfield', 'drw', 'imc', 'optiver', 'sig', 'jump', 'point72',
  'deshaw', 'radix', 'akuna', 'oldmission', 'tower', 'virtu', 'flowtraders',
  'fiverings', 'squarepoint', 'man-group', 'mangroup',
  // banks that pay and run real grad programmes
  'rbc', 'td', 'bmo', 'scotiabank', 'goldmansachs', 'jpmorgan', 'morganstanley',
  'amex', 'americanexpress', 'capitalone'
]);

/** Employers worth a strong automated application but not an hour of yours. */
const A_TIER_SECTORS = new Set(['bigtech', 'quant', 'bank', 'fintech', 'ai']);


/* ─────────── WHAT MAKES A ROLE WORTH AN HOUR ───────────
   Pay alone would send you to a niche desk over a role that opens more
   doors. Four things matter beyond it, scored 1-5:

   brand       what the name does for the next application, for years
   stability   how likely the job still exists in eighteen months
   growth      what you learn, and how fast you move once inside
   options     how many different directions it leaves open afterwards
   title       how fast the title moves and how high it goes — a scale-up
               makes you a lead in three years, a bank has a ladder with
               named rungs, a prop desk pays you enormously to stay a
               "Trader" or "Engineer" for a decade

   A niche FPGA seat at a prop shop pays enormously and scores low on
   options; a backend role at a scale-up pays less and scores high on all
   three of the others. Both belong on the shortlist, for different reasons. */

const EMPLOYER_PROFILE = {
  // Big tech: the brand carries, and generalist work leaves everything open.
  google: [5, 5, 5, 5, 4], meta: [5, 4, 5, 5, 4], apple: [5, 5, 4, 4, 3],
  amazon: [5, 5, 4, 5, 4], microsoft: [5, 5, 4, 5, 4], netflix: [5, 4, 5, 4, 3],
  nvidia: [5, 5, 5, 4, 4],
  // Frontier AI: brand is now equal to big tech, stability less proven.
  openai: [5, 4, 5, 5, 5], anthropic: [5, 4, 5, 5, 5], cohere: [4, 3, 4, 4, 5],
  // Scale-ups that read well and pay well.
  stripe: [5, 4, 5, 5, 4], databricks: [5, 4, 5, 4, 4], snowflake: [4, 4, 4, 4, 4],
  figma: [5, 4, 5, 4, 4], airbnb: [4, 4, 4, 4, 3], doordash: [4, 4, 4, 4, 4],
  pinterest: [4, 4, 4, 4, 3], notion: [4, 3, 4, 4, 5], ramp: [4, 3, 5, 4, 5],
  plaid: [4, 3, 4, 4, 4], coinbase: [4, 3, 4, 4, 4], mongodb: [4, 4, 4, 4, 3],
  shopify: [5, 4, 4, 5, 4], cloudflare: [4, 4, 4, 4, 4], datadog: [4, 4, 4, 4, 3],
  // Quant: pays the most, brand is elite inside finance and narrow outside,
  // and a specialised seat can be hard to leave.
  janestreet: [5, 5, 5, 3, 2], citadel: [5, 5, 4, 3, 3], citadelsecurities: [5, 5, 4, 3, 3],
  twosigma: [5, 4, 4, 3, 3], hrt: [5, 4, 4, 3, 2], drw: [4, 4, 4, 3, 2],
  imc: [4, 4, 4, 3, 2], optiver: [4, 4, 4, 3, 2], sig: [4, 4, 4, 3, 2],
  jump: [5, 4, 4, 3, 2], point72: [4, 4, 4, 3, 3], deshaw: [5, 5, 4, 3, 3],
  tower: [4, 4, 4, 2, 2], virtu: [4, 4, 4, 2, 2], flowtraders: [4, 4, 4, 2, 2],
  fiverings: [3, 3, 4, 2, 2], akuna: [3, 3, 4, 2, 2], oldmission: [3, 3, 4, 2, 2],
  belvedere: [3, 3, 3, 2, 2], squarepoint: [4, 4, 4, 3, 3], mangroup: [4, 4, 3, 3, 3],
  // Banks: the most stable thing on this list, slower, and a Canadian bank
  // on the CV travels well at home.
  rbc: [4, 5, 3, 4, 4], td: [4, 5, 3, 4, 4], bmo: [4, 5, 3, 4, 4],
  scotiabank: [4, 5, 3, 4, 4], goldmansachs: [5, 4, 4, 4, 4], jpmorgan: [5, 5, 4, 4, 4],
  morganstanley: [5, 4, 4, 4, 4], amex: [4, 5, 3, 4, 4], capitalone: [4, 4, 3, 4, 4]
};

/* Where an employer is not listed, its tier and sector say enough. */
function profileOf(rec) {
  const id = String(rec.companyId || '').toLowerCase();
  if (EMPLOYER_PROFILE[id]) return EMPLOYER_PROFILE[id];

  const tier = rec.tier || 3;
  const brand = tier === 1 ? 4 : tier === 2 ? 3 : 2;
  const stability = rec.sector === 'bank' ? 5
                  : rec.sector === 'bigtech' ? 4
                  : tier === 1 ? 4 : tier === 2 ? 3 : 2;
  const growth = rec.sector === 'ai' || rec.sector === 'fintech' ? 4 : 3;
  const options = rec.sector === 'quant' ? 2 : 3;
  // Smaller and faster-growing means the title moves sooner.
  const title = rec.sector === 'quant' ? 2
              : rec.sector === 'bank' ? 4
              : tier >= 2 ? 4 : 3;
  return [brand, stability, growth, options, title];
}

/** 0-1, blending pay with what the role does for the rest of your career. */
function opportunityScore(rec) {
  const [brand, stability, growth, options, title = 3] = profileOf(rec);

  // Pay, normalised against the top of this market rather than an absolute.
  const pay = rec.salaryAnnualMaxCAD || 0;
  const payScore = pay ? Math.min(1, pay / 350000) : 0.45;   // undisclosed sits mid

  const parts = {
    pay: payScore,
    brand: brand / 5,
    title: title / 5,
    growth: growth / 5,
    options: options / 5,
    stability: stability / 5
  };

  // You said the goal is a high title, high pay, or a mix. So pay and the
  // two things that make a title — the name on the CV and how fast it moves
  // — carry most of the weight between them, and nothing single-handedly
  // decides it. A prop desk that pays 300k and leaves you a "Trader" for a
  // decade and a scale-up that pays 200k and makes you a lead both surface;
  // neither buries the other.
  const score = parts.pay * 0.30 + parts.brand * 0.20 + parts.title * 0.18 +
                parts.growth * 0.14 + parts.options * 0.10 + parts.stability * 0.08;
  return { score, parts };
}


/* ─────────── WILL YOU ACTUALLY GET IT ───────────
   The factors above describe the prize. None of them describe your odds,
   and a shortlist ranked on prize alone fills up with roles you cannot
   win — a senior position at OpenAI paying 445k scores highest on every
   one of them and is a lottery ticket.

   An hour of tailoring is the scarce thing. It should go where it changes
   an outcome, which means expected value: prize x probability. */

function winProbability(rec) {
  const title = String(rec.title || '');
  const parts = {};

  // Level. This is the single biggest factor and the one a prize-only
  // ranking ignores completely. A senior or staff title is not a long shot,
  // it is a different job market.
  parts.level =
    /\b(intern|internship|co-?op)\b/i.test(title) ? 1.0 :
    /\b(new\s*grad|graduate|campus|early\s*career|university|entry[-\s]level|associate|\b20\d\d\s*grad)\b/i.test(title) ? 0.95 :
    /\b(senior|staff|principal|lead|manager|director|head\s+of|architect|sr\.?)\b/i.test(title) ? 0.05 :
    rec.level === 'intern' ? 1.0 :
    rec.level === 'newgrad' ? 0.85 :
    0.35;   // an unmarked title is usually mid-level

  // How much a specialist seat wants something you do not have. An FPGA or
  // PhD-flavoured research seat is not winnable off this CV, however well
  // the rest of it scores.
  parts.specialism =
    /\b(fpga|verilog|vhdl|kernel|compiler|cryptograph|formal\s*verif)\b/i.test(title) ? 0.15 :
    /\bresearch\s*(scientist|engineer)\b/i.test(title) ? 0.3 :
    /\b(quantitative\s*research|quant\s*research)\b/i.test(title) ? 0.35 :
    1.0;

  // CV overlap, on the scale these scores actually use (they top out near 30).
  parts.fit = Math.max(0.35, Math.min(1, (rec.matchScore || 0) / 22));

  // Where it is. Canada is frictionless. The US is genuinely open to you —
  // TN status covers most software roles for a Canadian citizen with a
  // degree, which is a real advantage over most international applicants —
  // but it is still a step the employer has to agree to.
  parts.geography = rec.region === 'CA' ? 1.0 : rec.remote ? 0.8 : 0.75;

  // Age. A posting a month old has a queue in front of you.
  const age = rec.ageDaysAtFind ?? 10;
  parts.freshness = age <= 7 ? 1.0 : age <= 21 ? 0.85 : age <= 40 ? 0.65 : 0.45;

  // How hard the employer screens on academics. This is the correction that
  // matters most for this profile: a 2.94 is a hard filter at most quant
  // desks and at a few big-tech campus programmes, and no amount of
  // tailoring gets past a numeric cutoff. The same CV — five internships,
  // shipped production systems, breadth across the stack — is near the top
  // of the pile at a product company that reads experience instead.
  //
  // So the odds here are not pessimism about the candidate. They are about
  // where this particular candidate's strengths are legible.
  const sector = String(rec.sector || '');
  parts.academicScreen =
    sector === 'quant' ? 0.35 :
    /\b(quantitative\s*research|quant\s*research|researcher)\b/i.test(title) ? 0.4 :
    sector === 'bank' ? 0.75 :
    sector === 'bigtech' ? 0.7 :
    1.0;

  // Assessment-first employers convert applications into signal instead of
  // silence, which is worth something on its own with a contract ending in
  // December.
  parts.process = 0.7 + 0.3 * (rec.oaLikelihood ?? 0.4);

  // Is it the career, or just the company? "Data Scientist, Real Estate &
  // Workplace" at a frontier AI lab has the brand and none of the work —
  // it is a corporate function that happens to sit inside a famous name,
  // and two years of it is two years off the track you want. This is a
  // prize adjustment as much as an odds one, and it belongs here because
  // the brand score cannot see it.
  const OFF_TRACK = /\b(people|hr|recruit\w*|real\s*estate|workplace|facilit\w*|marketing|sales|procurement|legal|communications|community|brand)\b/i;
  const ON_TRACK = /\b(software|engineer\w*|developer|quant\w*|machine\s*learning|infrastructure|platform|backend|front[-\s]?end|full[-\s]?stack|data\s*engineer|systems|trading)\b/i;
  parts.onTrack = OFF_TRACK.test(title) ? 0.25 : ON_TRACK.test(title) ? 1.0 : 0.6;

  const p = parts.level * parts.specialism * parts.fit * parts.onTrack *
            parts.academicScreen * parts.geography * parts.freshness * parts.process;
  return { p, parts };
}

/** Prize x probability. The number to rank an hour of effort by. */
function expectedValue(rec) {
  const prize = opportunityScore(rec);
  const odds = winProbability(rec);
  return { ev: prize.score * odds.p, prize: prize.score, p: odds.p,
           parts: { ...prize.parts, ...odds.parts } };
}


/* ─────────── PLACES THAT ONLY EARN A GOOD ROLE ───────────
   Montreal is home and Toronto is a move you would make for most things.
   New York and Vancouver are a bigger disruption — a border or a continent
   — so they are worth it only for a role that is worth it. S and A go; B
   and C do not, whatever else they score. */

const NEW_YORK = /new\s*york|\bnyc\b|manhattan|brooklyn/i;
const VANCOUVER = /vancouver/i;
const SELECTIVE_CITIES = new RegExp(NEW_YORK.source + '|' + VANCOUVER.source, 'i');

/* Only when that is the whole story. Plenty of postings list several
   cities — "San Francisco, CA; New York, NY" — and one of those being New
   York is no reason to drop a role you could take in the other. The gate
   applies when New York or Vancouver is the only place named. */
const OTHER_CITY = /montr[ée]al|toronto|ottawa|waterloo|calgary|edmonton|winnipeg|halifax|quebec|san\s*francisco|seattle|austin|boston|chicago|denver|atlanta|los\s*angeles|san\s*jose|palo\s*alto|mountain\s*view|sunnyvale|bellevue|remote|anywhere/i;

/**
 * The lowest tier worth applying at, for where this role is.
 * @returns {'B'|'A'|null} null where the ordinary rules apply
 */
function floorTierFor(rec) {
  const loc = String(rec.location || '');
  if (!SELECTIVE_CITIES.test(loc)) return null;
  if (rec.remote) return null;
  if (OTHER_CITY.test(loc)) return null;
  // New York is worth a solid role; Vancouver is a continent away and worth
  // only a good one.
  return NEW_YORK.test(loc) ? 'B' : 'A';
}

function needsHighTier(rec) {
  return floorTierFor(rec) !== null;
}

const FIT_HIGH = 19;   // ~p90 of matchScore on the live queue
const PRIO_HIGH = 48;  // ~p90 of priority
const FIT_MID = 15;
const PRIO_MID = 42;

/**
 * @param rec        a queued application record
 * @param opts       { sTierCap } how many S-tier roles to hold at once
 * @returns {{tier:'S'|'A'|'B'|'C', why:string}}
 */
function tierOf(rec, opts = {}) {
  const id = String(rec.companyId || '').toLowerCase();
  const prestige = S_TIER_EMPLOYERS.has(id);
  const fit = rec.matchScore || 0;
  const prio = rec.priority || 0;
  const home = rec.region === 'CA' || rec.remote;

  // Thresholds are on the scale these scores actually use: matchScore tops
  // out near 30 and priority near 60, so asking for 55% fit selected nothing.
  // These are roughly the 90th percentile of the live queue.
  // Pay is the point. A disclosed range at the top of the market earns a
  // place on the shortlist on its own, because that is where an hour of
  // tailoring buys the most — and most postings never disclose, so this can
  // only ever add roles, never filter them out.
  const pay = rec.salaryAnnualMaxCAD || 0;
  const paysWell = pay >= 150000;

  if (prestige && (fit >= FIT_HIGH || prio >= PRIO_HIGH || paysWell)) {
    const reason = paysWell ? `pays up to ${Math.round(pay / 1000)}k`
                 : fit >= FIT_HIGH ? `${Math.round(fit)} CV fit`
                 : `priority ${Math.round(prio)}`;
    return { tier: 'S', why: `${rec.company} — ${reason}, worth tailoring` };
  }
  if (paysWell && prio >= PRIO_MID) {
    return { tier: 'S', why: `${rec.company} — pays up to ${Math.round(pay / 1000)}k, worth tailoring` };
  }

  if (prestige || (A_TIER_SECTORS.has(rec.sector) && fit >= FIT_MID)) {
    return { tier: 'A', why: 'strong employer — best CV and a composed letter' };
  }
  if (prio >= PRIO_MID || (home && fit >= FIT_MID)) {
    return { tier: 'B', why: 'solid fit, automated' };
  }
  return { tier: 'C', why: 'volume — automated when there is capacity' };
}

/** Tier every record, and cap S so the shortlist stays a list you can act on. */
function assignTiers(records, opts = {}) {
  const cap = opts.sTierCap ?? 12;
  const scored = records.map(r => ({ rec: r, ...tierOf(r, opts) }));

  const perEmployer = opts.perEmployer ?? 2;
  const s = scored.filter(x => x.tier === 'S')
    .sort((a, b) => (expectedValue(b.rec).ev - expectedValue(a.rec).ev)
                 || ((b.rec.priority || 0) - (a.rec.priority || 0)));

  // At most a couple per employer. Twelve DRW roles is not a shortlist, it is
  // one application written twelve times, and it crowds out every other firm.
  const taken = {};
  const keep = [];
  for (const x of s) {
    const co = x.rec.companyId;
    if ((taken[co] || 0) >= perEmployer) { x.tier = 'A'; x.why = `${x.rec.company} already on the shortlist — automated`; continue; }
    if (keep.length >= cap) { x.tier = 'A'; x.why = 'past the shortlist cap — automated'; continue; }
    taken[co] = (taken[co] || 0) + 1;
    x.rank = keep.length + 1;
    keep.push(x);
  }
  // Ranked order, so the shortlist reads top-down as the order to work it.
  // A B or C role in a city that only earns a good one is not pursued.
  const RANK = { S: 0, A: 1, B: 2, C: 3 };
  for (const x of scored) {
    const floor = floorTierFor(x.rec);
    if (!floor) continue;
    if (RANK[x.tier] <= RANK[floor]) continue;
    x.tier = 'X';
    x.why = `${x.rec.location} is worth ${floor === 'B' ? 'a solid' : 'a good'} role, not this one`;
  }

  return [...keep, ...scored.filter(x => x.tier !== 'S')];
}

const __tiers = { tierOf, assignTiers, needsHighTier, floorTierFor, SELECTIVE_CITIES, opportunityScore, winProbability,
                  expectedValue, profileOf,
                  EMPLOYER_PROFILE, S_TIER_EMPLOYERS, A_TIER_SECTORS };
if (typeof module !== 'undefined' && module.exports) module.exports = __tiers;
if (typeof self !== 'undefined') self.__tiers = __tiers;
