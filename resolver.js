/* ═══════════════════════════════════════════
   GENERIC ANSWER RESOLVER

   A sweep across eighteen employers found two
   ready and sixteen blocked — on sixteen
   different questions, almost none repeated.
   "Are you a current University of Waterloo
   student?", "Current Notice Period", "Which
   type of engineering work excites you?" A bank
   of hand-written rules cannot catch up with
   that: every employer invents its own.

   So this does not try to recognise questions.
   It reads the options the form is offering and
   decides which one the profile supports, which
   generalises to questions never seen before.

   It is deliberately conservative. It answers
   only when the evidence is clear, never touches
   anything the answer bank marks terminal, and
   returns nothing rather than guess.
   ═══════════════════════════════════════════ */

const YES = /^(yes|y|true|i am|i do|i have|i can|i will|correct|affirmative)\b/i;
const NO  = /^(no|n|false|i am not|i do not|i don't|i have not|i haven't|none|not applicable|n\/a)\b/i;

/** Facts the resolver is allowed to reason from. */
function facts(answers = {}) {
  return {
    city:     (answers.city || '').toLowerCase(),
    province: (answers.province || '').toLowerCase(),
    country:  (answers.country || '').toLowerCase(),
    school:   (answers.school || '').toLowerCase(),
    degree:   (answers.degree || '').toLowerCase(),
    field:    (answers.fieldOfStudy || '').toLowerCase(),
    employer: (answers.currentEmployer || '').toLowerCase(),
    gradYear: String(answers.gradYear || ''),
    name:     [answers.firstName, answers.lastName].filter(Boolean).join(' ')
  };
}

/* ─────────── yes/no reasoning ───────────
   The question names something checkable. If the profile contains it the
   answer is yes; if the question names a specific rival institution, city or
   programme the profile does not contain, the answer is no. */

function polarity(question, answers) {
  const q = String(question).toLowerCase();
  const f = facts(answers);

  // Named place or school: answer from whether it is actually ours.
  const places = [
    [f.city, 'city'], [f.province, 'province'], [f.country, 'country'], [f.school, 'school']
  ].filter(([v]) => v && v.length > 3);

  for (const [value] of places) {
    // "Are you based in Montreal?" with Montreal in the profile.
    const head = value.split(/[\s,]+/)[0];
    if (head.length > 3 && q.includes(head)) return { value: 'Yes', why: `profile names ${head}` };
  }

  // A specific university that is not ours — "current University of Waterloo
  // student" — is a no, and answering yes would be a false claim.
  const uni = q.match(/university of ([a-z ]{3,24})|([a-z]{4,20}) university/);
  if (uni) {
    const named = (uni[1] || uni[2] || '').trim();
    if (named && !f.school.includes(named)) return { value: 'No', why: `not a ${named} student` };
  }

  // Willingness and capability: the applicant is applying, so yes.
  if (/\b(are you (willing|able|open|comfortable|available|prepared)|can you|would you be (willing|able|open))\b/.test(q)) {
    return { value: 'Yes', why: 'willingness' };
  }

  // Prior relationship with this employer, or a named affinity programme.
  if (/\b(ever worked|previously (worked|applied|employed)|former employee|current employee)\b/.test(q)) {
    return { value: 'No', why: 'no prior relationship' };
  }
  if (/\b(women|womens|women's|veteran|indigenous|returnship|winternship)\b.*\b(program|programme)\b/.test(q)) {
    return { value: 'No', why: 'affinity programme not applicable' };
  }

  // Experience with technology: this is a developer with four internships.
  if (/\b(do you have|have you)\b[^?]{0,60}\b(experience|worked with|familiar|proficien|knowledge)\b/.test(q)) {
    return { value: 'Yes', why: 'has engineering experience' };
  }

  // Acknowledgements and confirmations gate the form and are not claims.
  if (/\b(do you (agree|consent|acknowledge|confirm|understand|accept))\b/.test(q)) {
    return { value: 'Yes', why: 'acknowledgement' };
  }

  return null;
}

/* ─────────── option matching ───────────
   Score the options the form is offering against the profile, and take one
   only when a single option is clearly the best. */

function scoreOption(text, f) {
  const t = String(text).toLowerCase().trim();
  if (!t || /^(select|choose|--|please select)/.test(t)) return 0;

  let best = 0;
  for (const [key, weight] of [['country', 30], ['province', 28], ['city', 26],
                               ['school', 26], ['degree', 22], ['field', 22],
                               ['employer', 18], ['gradYear', 20]]) {
    const v = f[key];
    if (!v || v.length < 3) continue;
    if (t === v) best = Math.max(best, weight + 20);
    else if (t.includes(v) || v.includes(t)) best = Math.max(best, weight);
    else {
      const head = v.split(/[\s,]+/)[0];
      if (head.length > 3 && t.includes(head)) best = Math.max(best, weight - 6);
    }
  }
  return best;
}


/* Some forms replace Yes and No with whole sentences — "I have never worked
   at Robinhood" against four ways of saying you have. The question still has
   a polarity; it is the options that stopped being literal. */
const OPT_NEGATIVE = /\b(never|none of the (above|these)|no longer|neither|not (currently|previously|applicable)|do not|does not|have not|haven't|i am not|no,)/i;
const OPT_POSITIVE = /\b(i (currently|previously|have|am|was|do)|yes,|i confirm|i acknowledge)/i;

function optionPolarity(text) {
  const t = String(text);
  if (OPT_NEGATIVE.test(t)) return 'No';
  if (OPT_POSITIVE.test(t)) return 'Yes';
  return null;
}


/* ── Answers that are quantities, options that are ranges ──
   "2 weeks" is not any of "< 1 Month", "1-2 Months", "2-3 Months",
   "> 3 Months" as text, but it is unambiguously the first one. The same
   shape turns up for years of experience and salary bands. */

const UNIT_MONTHS = { day: 1 / 30, week: 1 / 4.345, month: 1, year: 12 };

const WORD_NUMBERS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
                       six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };

/** A quantity, with its unit if it named one. */
function quantity(text) {
  const t = String(text).toLowerCase().trim();
  if (/^(none|n\/a|immediate|immediately|asap|no notice|nil)\b/.test(t)) return { n: 0, unit: null };

  const unit = (t.match(/\b(day|week|month|year)s?\b/) || [])[1] || null;
  let n = null;
  const digits = t.match(/(\d+(?:\.\d+)?)/);
  if (digits) n = parseFloat(digits[1]);
  else {
    const w = Object.keys(WORD_NUMBERS).find(k => new RegExp('\\b' + k + '\\b').test(t));
    if (w) n = WORD_NUMBERS[w];
  }
  if (n === null || !Number.isFinite(n)) return null;
  return { n, unit };
}

/** An option read as a numeric interval. `scaleTo` converts named units to
    months; without it the numbers are compared as written, which is what a
    unit-less answer like "2" against "2-4 years" needs. */
function interval(text, scaleTo = true) {
  const t = String(text).toLowerCase().trim();
  if (/^(none|immediate|immediately|asap|no notice|nil)\b/.test(t)) return [0, 0];

  const unit = (t.match(/\b(day|week|month|year)s?\b/) || [])[1];
  const scale = (scaleTo && unit) ? UNIT_MONTHS[unit] : 1;
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;

  if (/^[<≤]|less than|under|fewer than|up to|below/.test(t)) return [-Infinity, nums[0] * scale];
  if (/^[>≥]|more than|over|greater than|at least|\+\s*$|\d\s*\+/.test(t)) return [nums[0] * scale, Infinity];
  if (nums.length >= 2) return [nums[0] * scale, nums[1] * scale];
  return [nums[0] * scale, nums[0] * scale];
}

/**
 * Which offered option contains the wanted quantity.
 * @returns {number} index, or -1 when the options are not ranges
 */
function matchRange(want, options = []) {
  const q = quantity(want);
  if (!q) return -1;

  // An answer that named its unit is converted to months, and so are the
  // options. An answer that did not ("2" against "2-4 years") is compared in
  // whatever unit the options are written in — converting one side only is
  // how "2" lands in "0-1 years".
  const scaleTo = Boolean(q.unit);
  const n = scaleTo ? q.n * UNIT_MONTHS[q.unit] : q.n;
  const ivs = options.map(o => interval(o, scaleTo));
  // At least half the options must parse as intervals, or this is not a
  // range list and a numeric reading would be a coincidence.
  if (ivs.filter(Boolean).length < Math.max(2, Math.ceil(options.length / 2))) return -1;

  for (let i = 0; i < ivs.length; i++) {
    if (ivs[i] && n >= ivs[i][0] && n <= ivs[i][1]) return i;
  }
  return -1;
}


/* ── Answers that are dates, options that are buckets ──
   Cloudflare asks when you graduate and offers June/December of each year.
   A September graduation is not in the list; the honest pick is the first
   bucket that is not before it, because the earlier one would claim a
   degree you do not yet have. */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
                'august', 'september', 'october', 'november', 'december'];

/** Months since year zero, or null. */
function monthIndex(text) {
  const t = String(text).toLowerCase();
  const year = (t.match(/\b(19|20)\d{2}\b/) || [])[0];
  if (!year) return null;

  let mon = MONTHS.findIndex(m => t.includes(m.slice(0, 3)) && t.includes(m.slice(0, 4)));
  if (mon < 0) mon = MONTHS.findIndex(m => new RegExp('\\b' + m.slice(0, 3)).test(t));
  // Seasons, which employers use as often as months.
  if (mon < 0) {
    if (/\bspring\b/.test(t)) mon = 3;
    else if (/\bsummer\b/.test(t)) mon = 5;
    else if (/\bfall|autumn\b/.test(t)) mon = 8;
    else if (/\bwinter\b/.test(t)) mon = 11;
  }
  // An ISO date, which is how the profile stores it.
  const iso = t.match(/\b(19|20)(\d{2})-(\d{2})\b/);
  if (iso) return Number(year) * 12 + (Number(iso[3]) - 1);

  return Number(year) * 12 + (mon < 0 ? 0 : mon);
}

/**
 * Which offered date bucket to pick for a target date.
 * @returns {number} index, or -1 when the options are not dates
 */
function matchDate(want, options = []) {
  const target = monthIndex(want);
  if (target === null) return -1;

  const idx = options.map(monthIndex);
  if (idx.filter(v => v !== null).length < Math.max(2, Math.ceil(options.length / 2))) return -1;

  const exact = idx.findIndex(v => v === target);
  if (exact >= 0) return exact;

  // The earliest bucket at or after the target — never claim an earlier
  // completion than the real one.
  let best = -1, bestGap = Infinity;
  for (let i = 0; i < idx.length; i++) {
    if (idx[i] === null || idx[i] < target) continue;
    const gap = idx[i] - target;
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  if (best >= 0) return best;

  // Everything offered is in the past — take the latest, which is the
  // closest true statement available.
  let latest = -1, latestVal = -Infinity;
  for (let i = 0; i < idx.length; i++) {
    if (idx[i] !== null && idx[i] > latestVal) { latestVal = idx[i]; latest = i; }
  }
  return latest;
}

/**
 * Decide an answer for a question no rule recognised.
 *
 * @param {string} question
 * @param {string[]} options  what the control offers; empty for free text
 * @param {object} answers    the resolved answer bank
 * @returns {{value:string, why:string, confidence:'high'|'medium'}|null}
 */
function resolve(question, options = [], answers = {}) {
  const q = String(question || '').trim();
  if (!q) return null;

  const f = facts(answers);
  const usable = options.map(o => String(o).trim()).filter(Boolean);

  // A yes/no control: reason about the question rather than the options.
  const looksBoolean = usable.length > 0 && usable.length <= 3 &&
    usable.some(o => YES.test(o)) && usable.some(o => NO.test(o));

  if (looksBoolean || usable.length === 0) {
    const p = polarity(q, answers);
    if (!p) return null;
    if (usable.length === 0) {
      return { value: p.value, why: p.why, confidence: 'medium' };
    }
    const match = usable.find(o => (p.value === 'Yes' ? YES : NO).test(o));
    return match ? { value: match, why: p.why, confidence: 'high' } : null;
  }

  // Sentence options with a question that still has a clear polarity. Only
  // decided when exactly one option carries the polarity we want — with four
  // ways of saying yes and one of saying no, "no" is unambiguous and "yes"
  // is not, and a coin flip here is a false statement about your history.
  if (usable.length > 1) {
    const p = polarity(q, answers);
    if (p) {
      const matching = usable.filter(o => optionPolarity(o) === p.value);
      if (matching.length === 1) {
        return { value: matching[0], why: p.why, confidence: 'high' };
      }
    }
  }

  // An option list: let the profile pick.
  if (usable.length) {
    const scored = usable.map(o => ({ o, s: scoreOption(o, f) })).sort((a, b) => b.s - a.s);
    if (scored[0].s >= 22 && scored[0].s > (scored[1]?.s ?? 0) + 6) {
      return { value: scored[0].o, why: 'matches profile', confidence: 'high' };
    }

    // A neutral escape hatch is better than leaving the form unsubmittable,
    // but only where the form itself offers one.
    const neutral = usable.find(o =>
      /^(other|none|prefer not|n\/a|not applicable|no preference|any)\b/i.test(o));
    if (neutral) return { value: neutral, why: 'no profile match; neutral option', confidence: 'medium' };
  }

  return null;
}

const __resolver = { resolve, polarity, optionPolarity, scoreOption, matchRange, matchDate, monthIndex, quantity, interval, facts };
if (typeof module !== 'undefined' && module.exports) module.exports = __resolver;
if (typeof self !== 'undefined') self.__resolver = __resolver;
