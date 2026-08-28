/* ═══════════════════════════════════════════
   SALARY NORMALIZATION

   Every source quotes pay differently. Interns
   are almost always quoted hourly or monthly,
   new-grad roles annually. Everything is
   normalized to an annual figure so a single
   threshold (>= $90k) can gate them all.
   ═══════════════════════════════════════════ */

const HOURS_PER_YEAR = 2080;   // 40h x 52w
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;
const WORKDAYS_PER_YEAR = 260;

const PERIOD_MULTIPLIERS = {
  hour: HOURS_PER_YEAR,
  day: WORKDAYS_PER_YEAR,
  week: WEEKS_PER_YEAR,
  month: MONTHS_PER_YEAR,
  year: 1
};

// Indicative only — used to compare foreign postings against a CAD threshold.
// Overridable in settings; the raw posted figure is always retained.
const DEFAULT_FX_TO_CAD = {
  CAD: 1.0,
  USD: 1.37,
  EUR: 1.48,
  GBP: 1.73
};

const PERIOD_PATTERNS = [
  { period: 'hour',  re: /\b(?:per\s*hour|hourly|\/\s*h(?:r|our)?\b|an\s*hour|de\s*l['’]heure|\/\s*heure|horaire)/i },
  { period: 'day',   re: /\b(?:per\s*day|daily|\/\s*day\b|a\s*day|par\s*jour|\/\s*jour)/i },
  { period: 'week',  re: /\b(?:per\s*week|weekly|\/\s*wk\b|\/\s*week\b|a\s*week|par\s*semaine)/i },
  { period: 'month', re: /\b(?:per\s*month|monthly|\/\s*mo(?:nth)?\b|a\s*month|par\s*mois|\/\s*mois|mensuel)/i },
  { period: 'year',  re: /\b(?:per\s*year|per\s*annum|annually|annual|yearly|\/\s*yr\b|\/\s*year\b|a\s*year|par\s*an|\/\s*an\b|annuel)/i }
];

const CURRENCY_PATTERNS = [
  { code: 'CAD', re: /\b(?:CAD|CA\$|C\$)\b|\bcanadian\s*dollars?\b|\$\s*CA\b|\bCAD\$/i },
  { code: 'USD', re: /\b(?:USD|US\$|U\.S\.\s*dollars?)\b|\bUS\s*\$/i },
  { code: 'GBP', re: /£|\bGBP\b/i },
  { code: 'EUR', re: /€|\bEUR\b/i }
];

/** Pull every number that looks like money out of a string. */
function extractAmounts(text) {
  const amounts = [];

  // 1) $120,000 / $120K / 120 000 $ / 120.50
  const re = /(?:[$£€]\s*)?(\d{1,3}(?:[,\s ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kK])?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/[,\s ]/g, '');
    let value = parseFloat(raw);
    if (isNaN(value)) continue;

    // "120K" -> 120000
    if (m[2]) value *= 1000;

    // A bare "120" next to a currency symbol in a salary context is almost
    // certainly 120K, but we do not guess — small bare numbers are dropped
    // unless they are plausible hourly rates.
    amounts.push({ value, index: m.index, hadK: Boolean(m[2]) });
  }
  return amounts;
}

function detectPeriod(text) {
  for (const { period, re } of PERIOD_PATTERNS) {
    if (re.test(text)) return period;
  }
  return null;
}

function detectCurrency(text) {
  for (const { code, re } of CURRENCY_PATTERNS) {
    if (re.test(text)) return code;
  }
  if (/\$/.test(text)) return 'UNKNOWN_DOLLAR';
  return null;
}

/**
 * Infer the pay period when the posting does not say it outright.
 * Ranges tell us a lot: 25-80 is hourly, 4000-15000 is monthly,
 * 60000+ is annual.
 */
function inferPeriod(value) {
  if (value > 0 && value < 200) return 'hour';
  if (value >= 200 && value < 3000) return 'week';
  if (value >= 3000 && value < 25000) return 'month';
  return 'year';
}

/**
 * Parse a salary string into a normalized annual range.
 *
 * @param {string} text            raw salary text from any source
 * @param {object} [opts]
 * @param {string} [opts.assumeCurrency]  fallback when only "$" is present
 * @param {object} [opts.fx]              currency -> CAD multipliers
 * @returns {object} normalized salary record
 */
function parseSalary(text, opts = {}) {
  const empty = {
    found: false, raw: null,
    min: null, max: null, period: null, currency: null,
    annualMin: null, annualMax: null,
    annualMinCAD: null, annualMaxCAD: null,
    confident: false, inferred: false
  };

  if (!text || typeof text !== 'string') return empty;
  const raw = text.trim();
  if (!raw) return empty;

  const amounts = extractAmounts(raw);
  if (amounts.length === 0) return { ...empty, raw };

  let period = detectPeriod(raw);
  const inferredPeriod = period === null;

  let currency = detectCurrency(raw);
  if (currency === 'UNKNOWN_DOLLAR' || currency === null) {
    currency = opts.assumeCurrency || 'CAD';
  }

  // Keep plausible salary figures. Drop stray numbers like a "401" in "401k"
  // or a year like 2026.
  const candidates = amounts
    .map(a => a.value)
    .filter(v => v > 0)
    .filter(v => !(v >= 1900 && v <= 2100 && !inferredPeriod && period === 'year'));

  if (candidates.length === 0) return { ...empty, raw };

  let min = Math.min(...candidates);
  let max = Math.max(...candidates);

  if (inferredPeriod) period = inferPeriod(max);

  const mult = PERIOD_MULTIPLIERS[period] ?? 1;
  const annualMin = Math.round(min * mult);
  const annualMax = Math.round(max * mult);

  const fx = { ...DEFAULT_FX_TO_CAD, ...(opts.fx || {}) };
  const rate = fx[currency] ?? 1.0;

  return {
    found: true,
    raw,
    min, max, period, currency,
    annualMin, annualMax,
    annualMinCAD: Math.round(annualMin * rate),
    annualMaxCAD: Math.round(annualMax * rate),
    // Confident when the posting stated the period explicitly and gave a
    // figure that survives sanity checks.
    confident: !inferredPeriod && annualMax >= 10000 && annualMax < 2000000,
    inferred: inferredPeriod
  };
}

/** Scan a full job description for compensation language. */
const JD_SALARY_RE = new RegExp(
  [
    '(?:base\\s*(?:pay|salary)|salary\\s*range|pay\\s*range|compensation\\s*range',
    '|expected\\s*(?:base\\s*)?(?:pay|salary)|hourly\\s*rate|rate\\s*of\\s*pay',
    '|salaire|r[ée]mun[ée]ration|[ée]chelle\\s*salariale)',
    '[^.\\n]{0,120}?',
    '[$£€]\\s*\\d[\\d,\\s.]*[kK]?',
    '[^.\\n]{0,120}'
  ].join(''),
  'i'
);

function findSalaryInDescription(description, opts = {}) {
  if (!description) return { found: false };
  const m = description.match(JD_SALARY_RE);
  if (!m) return { found: false };
  return parseSalary(m[0], opts);
}

/**
 * Gate a job against a minimum-pay threshold.
 *
 * policy 'max'  — range top must clear the bar (lenient, default)
 * policy 'min'  — range bottom must clear the bar (strict)
 */
function meetsThreshold(salary, thresholdCAD, policy = 'max') {
  if (!salary || !salary.found) return { pass: false, reason: 'no-salary-data', known: false };

  const value = policy === 'min' ? salary.annualMinCAD : salary.annualMaxCAD;
  if (value == null) return { pass: false, reason: 'unparsed', known: false };

  return {
    pass: value >= thresholdCAD,
    reason: value >= thresholdCAD ? 'meets-threshold' : 'below-threshold',
    known: true,
    comparedValue: value
  };
}

function formatSalary(salary) {
  if (!salary || !salary.found) return '—';
  const fmt = (n) => '$' + Math.round(n / 1000) + 'k';
  const cur = salary.currency && salary.currency !== 'CAD' ? ` ${salary.currency}` : '';
  if (salary.annualMin === salary.annualMax) return fmt(salary.annualMax) + cur;
  return `${fmt(salary.annualMin)}–${fmt(salary.annualMax)}${cur}`;
}

const __salary = {
    parseSalary, findSalaryInDescription, meetsThreshold, formatSalary,
    inferPeriod, DEFAULT_FX_TO_CAD, PERIOD_MULTIPLIERS
  };

// Node (tests) and browser / service-worker (importScripts or <script>)
if (typeof module !== 'undefined' && module.exports) module.exports = __salary;
if (typeof self !== 'undefined') self.__salary = __salary;
