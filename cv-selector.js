/* ═══════════════════════════════════════════
   CV VARIANT SELECTION

   Picks which of the three resumes to send.

   Two signals decide it:
     1. how much of the posting's vocabulary the
        variant already contains (skill overlap)
     2. whether the variant was written for this
        kind of role (curated boost terms)

   A level rule sits on top: internships require
   a currently-enrolled story, and only one
   variant tells it. That rule is also where the
   graduation-date conflict between the variants
   becomes load-bearing, so the reason is always
   recorded on the application.
   ═══════════════════════════════════════════ */

const CV_STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are',
  'be','been','have','has','had','do','does','did','will','would','can','our','you','your','we',
  'they','this','that','these','those','it','its','as','all','any','more','most','other','such',
  'work','working','role','team','experience','including','using','based','who','what','when',
  'their','them','than','then','there','here','also','into','over','about','across','within',
  'per','via','etc','ability','strong','excellent','good','great','required','preferred','plus'
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s\+\#\.\-\/]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !CV_STOPWORDS.has(w));
}

/** Unigrams + bigrams, so "machine learning" and "data pipeline" survive. */
function termSet(text) {
  const words = tokenize(text);
  const set = new Set(words);
  for (let i = 0; i < words.length - 1; i++) set.add(words[i] + ' ' + words[i + 1]);
  return set;
}

/** Fraction of the posting's distinctive terms the resume already covers. */
function overlapScore(jdTerms, resumeTerms) {
  if (jdTerms.size === 0) return 0;
  let hits = 0;
  for (const term of jdTerms) if (resumeTerms.has(term)) hits++;
  return hits / jdTerms.size;
}

function boostScore(jdText, profile) {
  const lower = String(jdText || '').toLowerCase();
  const boosts = profile.boost || [];
  if (boosts.length === 0) return 0;
  let hits = 0;
  for (const term of boosts) if (lower.includes(term.toLowerCase())) hits++;
  return hits / boosts.length;
}

// Cache the derived term sets — the resumes never change within a run.
const _resumeTermCache = new Map();
function resumeTermsFor(profile) {
  if (!_resumeTermCache.has(profile.id)) {
    _resumeTermCache.set(profile.id, termSet(profile.resumeText));
  }
  return _resumeTermCache.get(profile.id);
}

/**
 * @param {object} job        normalized job (title, description, company, sector)
 * @param {object} evaluation result of targeting.evaluate()
 * @param {Array}  profiles   CV_PROFILES
 * @returns {{profile, score, reason, ranking}}
 */
function selectCV(job, evaluation, profiles, opts = {}) {
  const jdText = `${job.title || ''}\n${job.description || ''}`;
  const jdTerms = termSet(jdText);

  // A variant with no uploaded PDF can never be attached, so it is not a
  // candidate — selecting it would record a CV that did not actually go out.
  let available = profiles.filter(p => p.enabled !== false);

  // A CV written for one specific posting wins there outright, and is never
  // considered anywhere else.
  const pinned = available.find(p => p.pinnedTo &&
    p.pinnedTo.companyId === job.companyId &&
    (!p.pinnedTo.titlePattern || new RegExp(p.pinnedTo.titlePattern, 'i').test(job.title || '')));

  if (pinned) {
    return {
      profile: pinned,
      score: 100,
      reason: `written specifically for this ${pinned.pinnedTo.companyId.toUpperCase()} posting`,
      conditionMet: false, claimOverrodeFit: false, withheld: null, pinned: true,
      ranking: [{ id: pinned.id, short: pinned.short, score: 100, withheld: false }]
    };
  }
  available = available.filter(p => !p.pinnedTo);

  // Only variants written for this role family compete. A quant CV should
  // never be sent to a business-analyst posting just because the vocabulary
  // happens to overlap.
  const family = evaluation.family;
  const inFamily = available.filter(p => !p.families || !family || p.families.includes(family));
  if (inFamily.length) available = inFamily;

  const ranking = available.map(p => {
    const overlap = overlapScore(jdTerms, resumeTermsFor(p));
    const boost = boostScore(jdText, p);

    // Sector affinity — a small, explicit nudge rather than a hidden rule.
    // Families already do the heavy routing, so this only breaks ties.
    let sectorFit = 0;
    if (job.sector === 'quant' && /^quant/.test(p.id)) sectorFit = 0.08;
    else if ((job.sector === 'bank' || job.sector === 'fintech') &&
             (p.id === 'backend' || p.id === 'business-analyst')) sectorFit = 0.06;
    else if (job.sector === 'bigtech' && p.id === 'big-tech') sectorFit = 0.06;
    else if (p.id === 'early-career') sectorFit = 0.02;

    const raw = 0.45 * overlap + 0.43 * boost + sectorFit;
    return { profile: p, overlap, boost, sectorFit, score: Math.round(raw * 1000) / 10 };
  }).sort((a, b) => b.score - a.score);

  // A variant carrying a conditional claim is withheld unless the posting
  // meets that claim's condition. The Big Tech variant lists a McGill
  // Master's that has been applied to but not yet started — it belongs only
  // on internships that require returning to school afterwards, and never
  // on new-grad postings, where continuing study contradicts the pitch.
  const conditionMet = evaluation.level === 'intern' && evaluation.returnToSchool === true;

  const permitted = ranking.filter(r => {
    if (!r.profile.conditionalClaim) return true;
    if (r.profile.conditionalClaim.appliesWhen !== 'intern-returning-to-school') return true;
    return conditionMet;
  });

  const held = ranking.find(r => r.profile.conditionalClaim && !permitted.includes(r));

  // When the condition is met the claim is the point of the variant, so it is
  // preferred rather than merely allowed to compete — the posting requires
  // continuing study, and only this variant states it. Content ranking is
  // still recorded so an override is visible rather than silent.
  const carrier = conditionMet
    ? permitted.find(r => r.profile.conditionalClaim)
    : null;

  let chosen = carrier || permitted[0] || ranking[0];
  let reason;

  if (carrier) {
    const top = permitted[0];
    reason = top && top !== carrier
      ? `internship requires returning to school, so ${carrier.profile.short} was sent for the McGill MSc line ` +
        `— though ${top.profile.short} fit the posting better (${top.score} vs ${carrier.score})`
      : `internship requires returning to school; ${carrier.profile.short} carries the McGill MSc ` +
        `and also ranked highest (${carrier.score})`;
  } else if (held && held === ranking[0]) {
    reason = `${chosen.profile.short} chosen (${chosen.score}); ` +
             `${held.profile.short} ranked higher at ${held.score} but was withheld — ` +
             `it lists continuing study, which only suits internships that require it`;
  } else {
    reason = `best keyword and skill overlap (${chosen.score})`;
  }

  return {
    profile: chosen.profile,
    score: chosen.score,
    reason,
    family,
    conditionMet,
    // True when the claim was preferred over a better content match, so the
    // trade-off is auditable on the application record.
    claimOverrodeFit: Boolean(carrier && permitted[0] && permitted[0] !== carrier),
    withheld: held ? { id: held.profile.id, short: held.profile.short, score: held.score } : null,
    ranking: ranking.map(r => ({
      id: r.profile.id, short: r.profile.short, score: r.score,
      withheld: Boolean(r.profile.conditionalClaim) && !permitted.includes(r)
    }))
  };
}

const __cvSelector = { selectCV, termSet, overlapScore, boostScore };

// Node (tests) and browser / service-worker (importScripts or <script>)
if (typeof module !== 'undefined' && module.exports) module.exports = __cvSelector;
if (typeof self !== 'undefined') self.__cvSelector = __cvSelector;
