/* ═══════════════════════════════════════════
   TARGETING

   Decides which postings are worth an
   application and in what order to work them.

   Ordering is deliberately not "best match
   first". The objective is assessment volume,
   and an assessment is triggered by employers
   who automate it, on postings that are still
   fresh enough to be in the first wave of
   applicants. Match quality is a tiebreaker,
   not the primary key.
   ═══════════════════════════════════════════ */

/* ─────────── LEVEL CLASSIFICATION ─────────── */

const LEVEL_PATTERNS = {
  intern: [
    /\bintern(ship)?\b/i, /\bco[\s\-]?op\b/i, /\bstagiaire\b/i, /\bstage\b/i,
    /\bsummer\s*20\d\d\b/i, /\bindustrial\s*placement\b/i
  ],
  newgrad: [
    /\bnew\s*grad(uate)?\b/i, /\buniversity\s*grad(uate)?\b/i, /\bcampus\b/i,
    /\bearly\s*career\b/i, /\bentry[\s\-]?level\b/i, /\bgraduate\s*(program|scheme|role)\b/i,
    // "Graduate Software Engineer" is the standard UK/AU/quant new-grad
    // title. Anchored to a role noun so a "graduate degree" line in the
    // requirements does not match.
    /\bgraduate\s+(?:software|engineer|developer|data|quantitative|technolog|analyst)/i,
    /\brotational\s*(program|analyst)\b/i, /\bjunior\b/i, /\bd[ée]butant\b/i,
    /\bnouveau\s*dipl[ôo]m[ée]\b/i, /\banalyst\s*program\b/i
  ],
  // Anything matching these is out of scope regardless of other signals.
  senior: [
    /\bsenior\b/i, /\bsr\.?\s/i, /\bstaff\b/i, /\bprincipal\b/i, /\blead\b/i,
    /\bmanager\b/i, /\bdirector\b/i, /\bhead\s*of\b/i, /\bvp\b/i, /\bchief\b/i,
    /\barchitect\b/i, /\bIII\b/, /\bIV\b/, /\bL[4-9]\b/i
  ],
  // The stretch band. "Engineer II", "Engineer 2", "Intermediate" — one rung
  // above new grad, which is where the title and the money start moving and
  // which a five-internship record actually answers.
  mid: [
    /\bII\b/, /\b2\b(?!\d)/, /\bL[23]\b/i, /\bintermediate\b/i,
    /\bmid[-\s]?level\b/i, /\bassociate\s+(?:software|developer|engineer)/i
  ]
};

function classifyLevel(title = '', description = '') {
  const t = String(title);
  for (const re of LEVEL_PATTERNS.senior)  if (re.test(t)) return 'senior';
  for (const re of LEVEL_PATTERNS.intern)  if (re.test(t)) return 'intern';
  for (const re of LEVEL_PATTERNS.newgrad) if (re.test(t)) return 'newgrad';
  for (const re of LEVEL_PATTERNS.mid)     if (re.test(t)) return 'mid';

  // Title was silent — fall back to the description, but only for the
  // strong signals, since JDs mention "intern" in boilerplate constantly.
  const d = String(description).slice(0, 1500);
  if (/\b(intern|co[\s\-]?op)\b.{0,40}\b(program|position|role|opportunity)\b/i.test(d)) return 'intern';
  if (/\bnew\s*grad|recent\s*graduate|graduating\s*(in|by)\s*20\d\d/i.test(d)) return 'newgrad';

  // An unmarked title asking for a few years is the stretch band. Leaving
  // these as "unknown" discarded 319 postings — most of the ordinary
  // "Software Engineer" market, and the part of it worth stretching into.
  //
  // Except where the posting rules internships out in as many words. Amazon
  // writes "3+ years of non-internship professional software development
  // experience", and five internships is exactly what that sentence is
  // there to exclude. Taking it at its word is not pessimism; applying
  // anyway burns the application and the employer's patience.
  const yrs = requiredYears(description);
  const excludesInternships =
    /\bnon[-\s]?intern(ship)?\b|\bexcluding\s+internships?\b|\boutside\s+of\s+internships?\b|\bpost[-\s]?graduation\s+experience\b/i
      .test(d);
  if (yrs > 0 && yrs <= 4 && !excludesInternships) return 'mid';

  return 'unknown';
}

/* ─────────── ROLE FAMILY ───────────

   Roles are grouped into families rather than tested
   against a single "is this a dev job" predicate. Each
   CV variant declares the families it was written for,
   so widening into quant and analyst work is a matter
   of adding a family, not loosening the filter.        */

const ROLE_FAMILIES = {
  /* Solutions and forward-deployed engineering. The most under-rated
     category for this profile: it pays like software engineering, it is
     nowhere near as contested, and it is the one place where four years of
     talking to stakeholders while writing the code is the qualification
     rather than a footnote. Palantir, Ramp, Scale and most enterprise AI
     companies hire heavily here. */
  solutions: [
    /\bsolutions?\s*(?:engineer|architect|developer|consultant)\b/i,
    /\bforward[\s-]?deployed\b/i, /\bimplementation\s*(?:engineer|consultant|specialist)\b/i,
    /\bintegration\s*engineer\b/i, /\bcustomer\s*engineer\b/i,
    /\bfield\s*engineer\b/i, /\bdeployment\s*(?:engineer|strategist)\b/i,
    /\bpartner\s*engineer\b/i, /\bsales\s*engineer\b/i,
    /\btechnical\s*(?:account|success)\s*(?:manager|engineer)\b/i,
    /\bapplications?\s*engineer\b/i
  ],

  /* Technical product and programme work. A CS degree plus a shipping record
     is the standard way in, and the title ladder moves faster here than in
     engineering. */
  'tech-product': [
    /\btechnical\s*(?:program|project|product)\s*manager\b/i, /\bTPM\b/,
    /\bassociate\s*product\s*manager\b/i, /\bAPM\b/,
    /\bproduct\s*(?:manager|owner)\b.*\b(technical|platform|api|developer|infrastructure)\b/i,
    /\b(technical|platform|api|developer)\b.*\bproduct\s*manager\b/i,
    /\bproduct\s*analyst\b/i, /\bprogram\s*manager\b.*\b(engineering|technical|platform)\b/i,
    /\bproduct\s*operations\b/i, /\bbusiness\s*systems?\s*analyst\b/i
  ],

  // Software engineering
  swe: [
    /\bsoftware\s*(?:development\s*)?engineer\b/i, /\bsoftware\s*developer\b/i,
    /\bSDE\b/, /\bSWE\b/, /\bdeveloper\b/i, /\bprogrammer\b/i,
    /\b(?:back|front)[\s\-]?end\b/i, /\bfull[\s\-]?stack\b/i,
    /\bplatform\s*engineer\b/i, /\bsystems?\s*engineer\b/i,
    /\binfrastructure\s*engineer\b/i, /\bcloud\s*engineer\b/i,
    /\bdevops\b/i, /\bsite\s*reliability\b/i, /\bSRE\b/,
    /\bSDET\b/i, /\bengineer\s*in\s*test\b/i, /\bmobile\s*(?:engineer|developer)\b/i,
    /\bd[ée]veloppeur\b/i, /\bg[ée]nie\s*logiciel\b/i
  ],

  // Quant engineering — building the systems
  'quant-dev': [
    // Allow qualifiers between the two words: "Quantitative Equity
    // Developer", "Quant Trading Engineer".
    /\bquant(?:itative)?\s+(?:[\w\-]+\s+){0,2}?(?:developer|technologist|engineer|software|programmer)/i,
    /\bquant\s*dev\b/i, /\balgorithmic\s*trading\s*(?:developer|engineer)/i,
    /\btrading\s*(?:systems?\s*)?(?:developer|engineer)/i,
    /\blow[\s\-]?latency\s*(?:developer|engineer)/i,
    /\bcore\s*(?:developer|engineer)\b.*\btrading\b/i
  ],

  // Quant research — modelling and statistics
  'quant-research': [
    /\bquant(?:itative)?\s+(?:[\w\-]+\s+){0,2}?(?:analyst|researcher|research|strateg|modell?er)/i,
    /\bquant\s*research\b/i, /\bresearch\s*(?:analyst|scientist)\b.*\b(?:quant|trading|market)/i,
    /\bmodel(?:ling|ing)?\s*analyst\b/i, /\brisk\s*quant/i,
    /\bstatistic(?:al|ian)\b.*\b(?:analyst|modell?er)\b/i
  ],

  // Data
  data: [
    /\bdata\s*(?:engineer|scientist|analyst)\b/i,
    /\bmachine\s*learning\s*(?:engineer|scientist)\b/i, /\bml\s*engineer\b/i,
    /\banalytics\s*engineer\b/i, /\bresearch\s*engineer\b/i,
    /\banalyste\s*(?:de\s*)?donn[ée]es\b/i
  ],

  // Business / technology analyst
  analyst: [
    /\bbusiness\s*(?:systems?\s*)?analyst\b/i,
    /\btechnolog(?:y|ies)\s*analyst\b/i, /\btechnical\s*analyst\b/i,
    /\bproduct\s*analyst\b/i, /\bsystems?\s*analyst\b/i,
    /\bsolutions?\s*analyst\b/i, /\bIT\s*analyst\b/i,
    /\banalyste\s*d[’']affaires\b/i,
    // Bank grad schemes are analyst-titled but engineering work
    /\b(?:technology|engineering|developer)\s*(?:analyst\s*)?program\b/i
  ]
};

/* Titles that read as technical but are a different job. Kept separate from
   the families so widening scope never accidentally admits them. */
/* Titles that are pursued despite matching an exclusion below. A "Sales
   Engineer" is an engineer who demos and integrates the product, not a
   salesperson, and it pays like engineering. A "Technical Program Manager"
   wants a CS degree. These are the less-contested lanes into good
   companies, and blanket-excluding the words shut all of them. */
const EXCLUSION_OVERRIDE = [
  /\bsales\s*engineer\b/i, /\bsolutions?\s*(?:engineer|architect)\b/i,
  /\bforward[\s-]?deployed\b/i, /\bimplementation\s*(?:engineer|consultant)\b/i,
  /\bcustomer\s*engineer\b/i, /\bpartner\s*engineer\b/i,
  /\btechnical\s*(?:program|project|product)\s*manager\b/i, /\bTPM\b/,
  /\bassociate\s*product\s*manager\b/i, /\bAPM\b/,
  /\bproduct\s*analyst\b/i, /\bbusiness\s*systems?\s*analyst\b/i,
  /\bsolutions?\s*(?:developer|consultant)\b.*\b(engineer|technical|software|data)\b/i
];

const EXCLUDED_TITLE = [
  /\bsales\b/i, /\bsolutions?\s*(?:architect|consultant)\b/i,
  /\bcustomer\s*(?:success|support)\b/i, /\brecruit/i, /\bdesigner\b/i,
  /\bproduct\s*manager\b/i, /\b(?:program|project)\s*manager\b/i,
  /\bmarketing\b/i, /\baccount\s*(?:executive|manager)\b/i,
  /\bsupport\s*engineer\b/i, /\bfield\s*engineer\b/i,
  /\bmechanical\b/i, /\belectrical\b/i, /\bcivil\b/i, /\bchemical\b/i,
  /\bhardware\s*engineer\b/i, /\bnetwork\s*engineer\b/i,
  /\bteacher\b/i, /\bnurse\b/i, /\bpharmac/i, /\bwarehouse\b/i,
  // Finance roles that are not quantitative or technical
  /\b(?:financial|credit|equity\s*research|investment\s*banking|treasury|audit)\s*analyst\b/i,
  /\binvestment\s*banking\b/i, /\bwealth\s*(?:advisor|management\s*analyst)\b/i,
  /\brelationship\s*manager\b/i, /\bteller\b/i, /\bcompliance\s*analyst\b/i,
  /\btrader\b/i   // trading seats, not engineering
];

/**
 * @returns {string|null} the family this title belongs to, or null
 */
function classifyFamily(title = '') {
  const t = String(title);
  const spared = EXCLUSION_OVERRIDE.some(re => re.test(t));
  if (!spared) { for (const re of EXCLUDED_TITLE) if (re.test(t)) return null; }
  // Most specific first: a "Quantitative Developer" is quant, not generic
  // swe, and a "Forward Deployed Software Engineer" is solutions work rather
  // than a plain engineering seat — which matters, because it is scored and
  // CV-matched differently.
  for (const fam of ['quant-dev', 'quant-research', 'solutions', 'tech-product',
                     'data', 'analyst', 'swe']) {
    for (const re of ROLE_FAMILIES[fam]) if (re.test(t)) return fam;
  }
  return null;
}

/** Backwards-compatible predicate: is this a role we pursue at all? */
function isDevRole(title = '') {
  return classifyFamily(title) !== null;
}

/* Positive markers that a posting is genuinely open to someone with no
   professional track record. Required before inferring entry level from
   a silent title. */
const ENTRY_EVIDENCE = new RegExp([
  '\\b(?:currently\\s+)?(?:pursuing|enrolled\\s+in|working\\s+toward)\\b',
  '|\\brecent\\s+grad(?:uate)?\\b|\\bgraduating\\s+(?:in|by|before)\\s*20\\d\\d',
  '|\\bnew\\s*grad(?:uate)?\\b|\\bentry[\\s\\-]?level\\b',
  '|\\bno\\s+(?:prior\\s+)?(?:professional\\s+)?experience\\s+(?:is\\s+)?(?:required|necessary)\\b',
  '|\\b0\\s*[-–to]+\\s*[12]\\s*years?\\b',
  '|\\b(?:final|last)\\s+year\\s+student\\b|\\bundergraduate\\b',
  '|\\bstudents?\\s+(?:who|graduating|pursuing)\\b',
  '|\\bd[ée]butant\\b|\\b[ée]tudiant\\b|\\bnouveau\\s*dipl[ôo]m[ée]\\b'
].join(''), 'i');

/* ─────────── EXPERIENCE REQUIREMENT ─────────── */

/** Largest "N+ years" requirement stated in the description. */
function requiredYears(description = '') {
  const d = String(description);
  let max = 0;
  const patterns = [
    // Employers put arbitrary qualifiers between the number and the word
    // "experience" — Amazon's standard line is "3+ years of non-internship
    // professional software development experience". Allow up to six
    // intervening words rather than enumerating the qualifiers.
    /(\d+)\s*\+?\s*(?:to\s*\d+\s*)?years?\s+(?:of\s+)?(?:[\w\-\/\+#\.]+\s+){0,6}?(?:experience|expertise|background)/gi,
    /minimum\s+(?:of\s+)?(\d+)\s*(?:\+\s*)?years?/gi,
    /(?:at\s+least|over)\s+(\d+)\s*(?:\+\s*)?years?/gi,
    /(\d+)\s*\+\s*(?:ans|ann[ée]es)\s+d[’']exp[ée]rience/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(d)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n < 30 && n > max) max = n;
    }
  }
  return max;
}

/* ─────────── RETURN-TO-SCHOOL REQUIREMENT ───────────
   Many internships are only open to candidates who go
   back to a degree program afterwards — it is what makes
   the placement an internship rather than a hire. This is
   the condition that decides whether a continuing-study
   claim belongs on the CV, so it is detected explicitly
   rather than assumed of every internship. */

const RETURN_TO_SCHOOL = new RegExp([
  'return(?:ing)?\\s+to\\s+(?:school|studies|university|college|campus|a\\s+degree)',
  '|must\\s+be\\s+(?:enrolled|returning)[^.]{0,60}(?:following|after|fall|autumn|subsequent)',
  '|enrolled[^.]{0,50}(?:semester|term|quarter|year)\\s+(?:following|after)',
  '|continu(?:e|ing)\\s+(?:your\\s+)?(?:studies|education|degree)',
  '|graduat\\w*\\s+(?:no\\s+earlier\\s+than|after|on\\s+or\\s+after)',
  // The canonical construction is "currently enrolled ... graduating/
  // graduation date <year after the placement>", which is how the banks
  // and most large employers phrase the requirement.
  '|(?:expected\\s+)?graduat\\w*(?:\\s+date)?[^.]{0,40}(?:20(?:2[7-9]|3\\d))',
  '|currently\\s+enrolled[^.]{0,120}(?:20(?:2[7-9]|3\\d))',
  '|pursuing\\s+a\\s+degree[^.]{0,60}return',
  '|retour\\s+aux\\s+[ée]tudes|poursuivre\\s+(?:vos\\s+)?[ée]tudes'
].join(''), 'i');

function requiresReturnToSchool(description = '') {
  return RETURN_TO_SCHOOL.test(String(description));
}

/* ─────────── SENIORITY WITHOUT A NUMBER ───────────
   Plenty of postings never state a years requirement yet plainly expect an
   experienced hire: "founding engineer", "deep expertise", "you have shipped
   and owned", "mentor the team". Admitting ambiguous-level roles is useful
   for volume, but not if it sweeps these in — they are not winnable and each
   one costs an application slot. */

const SENIOR_LANGUAGE = new RegExp([
  '\\bfounding\\s+(?:engineer|member|team)',
  '|\\bdeep\\s+(?:expertise|experience|knowledge)\\b',
  '|\\bproven\\s+track\\s+record\\b',
  '|\\bextensive\\s+experience\\b',
  '|\\bmentor(?:ing|ship)?\\s+(?:junior|other|the\\s+team|engineers)',
  '|\\blead\\s+(?:a\\s+)?(?:team|group|squad)\\b',
  '|\\bown\\s+the\\s+(?:roadmap|architecture|vision|strategy)\\b',
  '|\\bset\\s+(?:the\\s+)?technical\\s+direction\\b',
  '|\\bdrive\\s+(?:the\\s+)?(?:architecture|technical\\s+strategy)\\b',
  '|\\bseasoned\\b|\\bexpert[\\s-]level\\b',
  '|\\bindustry\\s+veteran\\b',
  '|\\byou\\s+have\\s+(?:built|shipped|scaled)\\s+[^.]{0,40}\\bproduction\\b'
].join(''), 'i');

function readsSenior(description = '') {
  return SENIOR_LANGUAGE.test(String(description).slice(0, 4000));
}

/* ─────────── ADVANCED-DEGREE REQUIREMENT ───────────
   Quant desks post PhD-only research seats alongside
   bachelor-level ones, at the same pay. Applying to
   them is wasted effort, so they are filtered out
   rather than left to clog the queue. */

const PHD_REQUIRED = new RegExp([
  '\\bph\\.?d\\.?\\b(?![^.]{0,30}\\b(?:not\\s+required|or\\s+equivalent|preferred|a\\s+plus|nice))',
  '|\\bdoctora(?:l|te)\\b',
  '|\\b(?:ms|master.?s)\\s*(?:degree\\s*)?required\\b',
  '|\\brequires?\\s+(?:a\\s+)?(?:ph\\.?d|doctorate)'
].join(''), 'i');

/** True when the posting is only open to graduate-degree candidates. */
function requiresAdvancedDegree(title = '', description = '') {
  // The title is the reliable signal — "Quantitative Researcher, PhD".
  if (PHD_REQUIRED.test(String(title))) return true;
  // In the body, only a hard requirement counts.
  const d = String(description).slice(0, 2500);
  return /\b(?:must|required to)\s+(?:hold|have)[^.]{0,40}\b(?:ph\.?d|doctorate)\b/i.test(d) ||
         /\bph\.?d\.?\s+(?:is\s+)?required\b/i.test(d);
}

/* ─────────── LOCATION ─────────── */

const CA_HINTS = /\b(canada|canadian|ontario|quebec|québec|british columbia|alberta|toronto|montr[eé]al|vancouver|ottawa|waterloo|calgary|edmonton|halifax|winnipeg|mississauga|markham|CAN\b|,\s*ON\b|,\s*QC\b|,\s*BC\b|,\s*AB\b)/i;
// \bUS\b matters on its own: "Remote - US" and "Remote (US)" were landing in
// OTHER and being filtered out with everything foreign, which quietly threw
// away most of the remote market.
const US_HINTS = /\b(united states|usa|u\.s\.?a?|new york|california|seattle|san francisco|austin|boston|chicago|denver|atlanta|texas|washington)\b/i;
// The bare acronym is matched case-sensitively, because /\bus\b/i also
// matches the English word in "join us" and would call every such posting
// American.
const US_ABBR = /\b(US|U\.S\.|USA)\b|,\s*(?:NY|CA|WA|TX|MA|IL|CO|GA|NC|VA|PA|FL|NJ|UT|OR|AZ)\b/;
const REMOTE_HINTS = /\bremote\b|\bwork\s*from\s*home\b|\bdistributed\b|\bt[ée]l[ée]travail\b/i;

/**
 * @param job
 * @param homeRegion  the employer's own country, used when a remote posting
 *   names no location at all — a bare "Remote" at a US company is a US role,
 *   and calling it OTHER filtered it out.
 */
function classifyLocation(job, homeRegion) {
  const s = `${job.location || ''} ${job.title || ''}`;
  const remote = REMOTE_HINTS.test(s) || Boolean(job.remote);
  if (CA_HINTS.test(s)) return { region: 'CA', remote };
  if (US_HINTS.test(s) || US_ABBR.test(s)) return { region: 'US', remote };
  if (remote && (homeRegion === 'CA' || homeRegion === 'US')) {
    return { region: homeRegion, remote, inferred: true };
  }
  return { region: 'OTHER', remote };
}

/* ─────────── CITY PREFERENCE ───────────
   Region alone is too coarse: a Vancouver role and a Toronto role are both
   "CA" but are not equally useful to someone in Montreal. These are the
   cities worth ranking above the rest. */

const PREFERRED_CITIES = [
  { re: /montr[ée]al/i,            weight: 1.14 },
  { re: /\btoronto\b|\bgta\b/i,  weight: 1.12 },
  { re: /new\s*york|\bnyc\b|manhattan/i, weight: 1.08 },
  { re: /ottawa|waterloo|kitchener/i, weight: 1.04 }
];

/**
 * @param location
 * @param loc  the classifyLocation result, when available
 *
 * A remote Canadian role beats a Toronto one: same access to the job, no
 * move, and no work-authorisation question. Remote in the US is worth
 * pursuing but is not the same thing — the company still has to be willing
 * to put a Canadian on its payroll, so it ranks below the Canadian cities
 * rather than above them.
 */
function cityWeight(location = '', loc = null) {
  const s = String(location);
  const remote = loc ? loc.remote : REMOTE_HINTS.test(s);

  if (remote) {
    const region = loc ? loc.region
      : (CA_HINTS.test(s) ? 'CA' : (US_HINTS.test(s) || US_ABBR.test(s)) ? 'US' : 'OTHER');
    if (region === 'CA') return 1.16;
    if (region === 'US') return 1.06;
    return 1.03;
  }
  for (const { re, weight } of PREFERRED_CITIES) if (re.test(s)) return weight;
  return 1.0;
}

/* ─────────── ELIGIBILITY ─────────── */

const DEFAULT_RULES = {
  minSalaryCAD: 90000,
  salaryPolicy: 'max',          // compare range top against the threshold
  allowUnknownSalary: true,     // most postings do not disclose pay
  // Internships stay in — they convert, and they are winnable. "mid" is the
  // stretch band: an unmarked "Software Engineer" that wants two or three
  // years is a role the internship record actually answers.
  levels: ['intern', 'newgrad', 'mid'],
  allowUnknownLevel: false,
  // A title with no seniority marker is common, especially at banks. If the
  // body asks for no more than a year of experience, the role is entry-level
  // whatever the title says — treat it as new-grad rather than discarding it.
  inferEntryFromExperience: true,
  inferEntryMaxYears: 1,
  // Five internships across five years is real, dated, verifiable experience,
  // and it is unusual for a new graduate. A posting asking for three years is
  // a legitimate stretch, not a waste of an application — and the stretch is
  // where the title and the pay are. Four is the point where the ask stops
  // being about internships and starts being about someone who has shipped
  // and owned production systems for years.
  maxRequiredYears: 4,
  regions: ['CA', 'US'],
  maxAgeDays: 45,
  // Which role families to pursue. Widening scope is a config change.
  // Broad on purpose. A CS degree with five internships, front-end and
  // back-end both, and four years of stakeholder work qualifies for more
  // than one lane — and the less-contested lanes are where a career
  // breakout is actually available.
  families: ['swe', 'solutions', 'tech-product', 'quant-dev', 'quant-research',
             'data', 'analyst'],
  // Quant desks post PhD-only seats next to bachelor-level ones.
  excludeAdvancedDegree: true,
  // Applies only to postings whose level could not be determined.
  rejectSeniorTone: true
};

/**
 * @returns {{eligible:boolean, reasons:string[], level, location, salary, years}}
 */
function evaluate(job, salary, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const reasons = [];

  let level = classifyLevel(job.title, job.description);
  // job.companyCountry lets a bare "Remote" inherit the employer's country
  // instead of falling into OTHER and being filtered out.
  const location = classifyLocation(job, job.companyCountry || rules.homeRegion);
  const years = requiredYears(job.description);
  const returnToSchool = requiresReturnToSchool(job.description);
  const advancedDegree = requiresAdvancedDegree(job.title, job.description);
  const seniorTone = readsSenior(job.description);
  let levelInferred = false;

  const family = classifyFamily(job.title);
  if (!family) reasons.push('not-a-target-role');
  else if (r.families && !r.families.includes(family)) reasons.push(`family-${family}-disabled`);

  // Infer entry level only on positive evidence. An unparsed years
  // requirement means "we could not read one", not "there is none" —
  // treating those as equivalent sweeps in every mid-level role whose
  // phrasing the parser missed.
  if (level === 'unknown' && r.inferEntryFromExperience &&
      job.description && job.description.length > 200 &&
      years <= r.inferEntryMaxYears &&
      ENTRY_EVIDENCE.test(job.description)) {
    level = 'newgrad';
    levelInferred = true;
  }

  if (level === 'unknown' && seniorTone && r.rejectSeniorTone !== false) {
    reasons.push('reads-as-experienced-hire');
  }

  if (level === 'senior') reasons.push('too-senior');
  else if (!r.levels.includes(level) && !(level === 'unknown' && r.allowUnknownLevel)) {
    reasons.push(
      level === 'unknown' && /\bnon[-\s]?intern(ship)?\b|\bexcluding\s+internships?\b/i.test(job.description || '')
        ? 'requires-non-internship-experience'
        : level === 'unknown' ? 'level-unclear' : `level-${level}`);
  }

  if (years > r.maxRequiredYears) reasons.push(`requires-${years}y-experience`);

  if (advancedDegree && r.excludeAdvancedDegree !== false) reasons.push('requires-phd');

  if (!r.regions.includes(location.region)) reasons.push(`region-${location.region}`);

  if (job.ageDays != null && job.ageDays > r.maxAgeDays) reasons.push('stale-posting');

  // Pay gate. Undisclosed pay is the common case, so it is a policy choice
  // rather than an automatic rejection.
  if (salary && salary.found && salary.confident) {
    const value = r.salaryPolicy === 'min' ? salary.annualMinCAD : salary.annualMaxCAD;
    if (value != null && value < r.minSalaryCAD) reasons.push('below-pay-threshold');
  } else if (!r.allowUnknownSalary) {
    reasons.push('pay-undisclosed');
  }

  return { eligible: reasons.length === 0, reasons, family, level, levelInferred, location, years, returnToSchool };
}

/* ─────────── ASSESSMENT PRIORITY ───────────
   The queue key. Highest expected number of
   assessments per unit of effort first. */

function freshnessFactor(ageDays) {
  if (ageDays == null) return 0.55;          // unknown — assume middling
  if (ageDays <= 1) return 1.0;
  if (ageDays <= 3) return 0.92;
  if (ageDays <= 7) return 0.8;
  if (ageDays <= 14) return 0.6;
  if (ageDays <= 30) return 0.38;
  return 0.2;
}

function oaPriority(job, evaluation, matchScore = 0, opts = {}) {
  const { canadaFirst = true } = opts;

  const oa = job.oaLikelihood ?? 0;
  const fresh = freshnessFactor(job.ageDays);

  // An automated assessment is only useful if the application is plausible
  // enough to pass the resume screen that gates it at some employers.
  const fit = Math.min(1, (matchScore || 0) / 100);

  const levelBoost = evaluation.level === 'intern' ? 1.0
                   : evaluation.level === 'newgrad' ? 0.95 : 0.7;

  const regionBoost = canadaFirst
    ? (evaluation.location.region === 'CA' ? 1.0 : 0.82)
    : 1.0;

  // Within a region, rank the places that are actually convenient — and
  // remote-in-Canada above all of them, since it needs no move and raises
  // no work-authorisation question.
  const cityBoost = cityWeight(job.location, evaluation.location);

  // Quant and big tech automate assessments far more consistently than
  // the median employer, and that is already priced into oaLikelihood —
  // this only nudges ties.
  const sectorBoost = ({ quant: 1.06, bigtech: 1.03, bank: 1.02 })[job.sector] || 1.0;

  const score = 100
    * (0.42 * oa + 0.24 * fresh + 0.20 * fit + 0.14 * levelBoost)
    * regionBoost * cityBoost * sectorBoost;

  return {
    score: Math.round(score * 10) / 10,
    parts: { oa, fresh, fit, levelBoost, regionBoost, cityBoost, sectorBoost }
  };
}

const __targeting = {
    classifyLevel, isDevRole, classifyFamily, ROLE_FAMILIES, requiredYears, classifyLocation,
    evaluate, oaPriority, freshnessFactor, DEFAULT_RULES, ENTRY_EVIDENCE,
  requiresReturnToSchool, RETURN_TO_SCHOOL, requiresAdvancedDegree, readsSenior,
  cityWeight, PREFERRED_CITIES
  };

// Node (tests) and browser / service-worker (importScripts or <script>)
if (typeof module !== 'undefined' && module.exports) module.exports = __targeting;
if (typeof self !== 'undefined') self.__targeting = __targeting;
