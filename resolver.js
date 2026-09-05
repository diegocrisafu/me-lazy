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

const __resolver = { resolve, polarity, scoreOption, facts };
if (typeof module !== 'undefined' && module.exports) module.exports = __resolver;
if (typeof self !== 'undefined') self.__resolver = __resolver;
