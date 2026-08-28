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
    /\barchitect\b/i, /\bIII\b/, /\bIV\b/, /\bL[4-9]\b/i, /\bII\b/
  ]
};

function classifyLevel(title = '', description = '') {
  const t = String(title);
  for (const re of LEVEL_PATTERNS.senior)  if (re.test(t)) return 'senior';
  for (const re of LEVEL_PATTERNS.intern)  if (re.test(t)) return 'intern';
  for (const re of LEVEL_PATTERNS.newgrad) if (re.test(t)) return 'newgrad';

  // Title was silent — fall back to the description, but only for the
  // strong signals, since JDs mention "intern" in boilerplate constantly.
  const d = String(description).slice(0, 1500);
  if (/\b(intern|co[\s\-]?op)\b.{0,40}\b(program|position|role|opportunity)\b/i.test(d)) return 'intern';
  if (/\bnew\s*grad|recent\s*graduate|graduating\s*(in|by)\s*20\d\d/i.test(d)) return 'newgrad';

  return 'unknown';
}

/* ─────────── ROLE FAMILY ───────────

   Roles are grouped into families rather than tested
   against a single "is this a dev job" predicate. Each
   CV variant declares the families it was written for,
   so widening into quant and analyst work is a matter
   of adding a family, not loosening the filter.        */

const ROLE_FAMILIES = {
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
  for (const re of EXCLUDED_TITLE) if (re.test(t)) return null;
  // Most specific first: a "Quantitative Developer" is quant, not generic swe.
  for (const fam of ['quant-dev', 'quant-research', 'data', 'analyst', 'swe']) {
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
const US_HINTS = /\b(united states|usa|u\.s\.|new york|california|seattle|san francisco|austin|boston|chicago|texas|washington|USA\b|,\s*NY\b|,\s*CA\b|,\s*WA\b|,\s*TX\b|,\s*MA\b|,\s*IL\b)/i;
const REMOTE_HINTS = /\bremote\b|\bwork\s*from\s*home\b|\bdistributed\b|\bt[ée]l[ée]travail\b/i;

function classifyLocation(job) {
  const s = `${job.location || ''} ${job.title || ''}`;
  const remote = REMOTE_HINTS.test(s) || Boolean(job.remote);
  if (CA_HINTS.test(s)) return { region: 'CA', remote };
  if (US_HINTS.test(s)) return { region: 'US', remote };
  return { region: 'OTHER', remote };
}

/* ─────────── ELIGIBILITY ─────────── */

const DEFAULT_RULES = {
  minSalaryCAD: 90000,
  salaryPolicy: 'max',          // compare range top against the threshold
  allowUnknownSalary: true,     // most postings do not disclose pay
  levels: ['intern', 'newgrad'],
  allowUnknownLevel: false,
  // A title with no seniority marker is common, especially at banks. If the
  // body asks for no more than a year of experience, the role is entry-level
  // whatever the title says — treat it as new-grad rather than discarding it.
  inferEntryFromExperience: true,
  inferEntryMaxYears: 1,
  maxRequiredYears: 2,
  regions: ['CA', 'US'],
  maxAgeDays: 45,
  // Which role families to pursue. Widening scope is a config change.
  families: ['swe', 'quant-dev', 'quant-research', 'data', 'analyst'],
  // Quant desks post PhD-only seats next to bachelor-level ones.
  excludeAdvancedDegree: true
};

/**
 * @returns {{eligible:boolean, reasons:string[], level, location, salary, years}}
 */
function evaluate(job, salary, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const reasons = [];

  let level = classifyLevel(job.title, job.description);
  const location = classifyLocation(job);
  const years = requiredYears(job.description);
  const returnToSchool = requiresReturnToSchool(job.description);
  const advancedDegree = requiresAdvancedDegree(job.title, job.description);
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

  if (level === 'senior') reasons.push('too-senior');
  else if (!r.levels.includes(level) && !(level === 'unknown' && r.allowUnknownLevel)) {
    reasons.push(level === 'unknown' ? 'level-unclear' : `level-${level}`);
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

  // Quant and big tech automate assessments far more consistently than
  // the median employer, and that is already priced into oaLikelihood —
  // this only nudges ties.
  const sectorBoost = ({ quant: 1.06, bigtech: 1.03, bank: 1.02 })[job.sector] || 1.0;

  const score = 100
    * (0.42 * oa + 0.24 * fresh + 0.20 * fit + 0.14 * levelBoost)
    * regionBoost * sectorBoost;

  return {
    score: Math.round(score * 10) / 10,
    parts: { oa, fresh, fit, levelBoost, regionBoost, sectorBoost }
  };
}

const __targeting = {
    classifyLevel, isDevRole, classifyFamily, ROLE_FAMILIES, requiredYears, classifyLocation,
    evaluate, oaPriority, freshnessFactor, DEFAULT_RULES, ENTRY_EVIDENCE,
  requiresReturnToSchool, RETURN_TO_SCHOOL, requiresAdvancedDegree
  };

// Node (tests) and browser / service-worker (importScripts or <script>)
if (typeof module !== 'undefined' && module.exports) module.exports = __targeting;
if (typeof self !== 'undefined') self.__targeting = __targeting;
