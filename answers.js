/* ═══════════════════════════════════════════
   SCREENING ANSWER BANK

   Application forms ask the same few dozen
   questions in endlessly varied wording. This
   maps a question to a stored answer, and —
   critically — reports when it does NOT know.

   Confidence is what makes unattended running
   safe. `exact` answers are facts from the
   profile. `derived` answers are composed from
   the posting. Anything else is `unknown`, and
   an unknown answer stops an auto-submit rather
   than being guessed: a wrong work-authorisation
   or sponsorship answer is an instant rejection.
   ═══════════════════════════════════════════ */

const ANSWER_RULES = [
  /* ── Eligibility. Wrong answers here are terminal. ──
     Order matters enormously. "Will you need visa sponsorship to work
     lawfully in Canada?" contains work-authorisation language, so the
     sponsorship rule has to be tested first — matching the authorisation
     rule instead answers "Yes, I am authorised", which the form reads as
     "Yes, I need sponsorship". That is an instant auto-reject. */

  { id: 'sponsorship', critical: true,
    re: /sponsor|visa\s*support|immigration\s*(?:support|assistance)|parrainage|work\s*permit\s*support/i,
    from: 'sponsorship' },

  { id: 'workAuthCA',  critical: true,
    re: /(?:legally\s*)?(?:authorized|authorised|entitled|eligible)\s*to\s*work[^?]{0,60}canada|canadian\s*work\s*(?:authorization|permit)|permis\s*de\s*travail/i,
    not: /sponsor|visa/i, from: 'workAuthCanada' },

  { id: 'workAuthUS',  critical: true,
    re: /(?:legally\s*)?(?:authorized|authorised|eligible)\s*to\s*work[^?]{0,60}(?:united\s*states|u\.?s\.?a?\b)/i,
    not: /sponsor|visa/i, from: 'workAuthUS' },

  { id: 'workAuth',    critical: true,
    re: /authorized\s*to\s*work|authorised\s*to\s*work|work\s*authorization|right\s*to\s*work|legally\s*entitled/i,
    not: /sponsor|visa/i, from: 'workAuthCanada' },

  { id: 'citizenship', critical: true,
    re: /citizen|permanent\s*resident|citoyen|r[ée]sident\s*permanent/i,
    not: /sponsor/i, from: 'citizenship' },

  { id: 'securityClearance', critical: true,
    re: /security\s*clearance|habilitation\s*de\s*s[ée]curit[ée]/i,
    from: 'securityClearance' },

  { id: 'citizenshipCountry', critical: true,
    re: /(?:which\s*)?country\/?(?:region)?\s*(?:do\s*you\s*have\s*)?citizenship|country\s*of\s*citizenship|citizenship\s*country/i,
    from: 'citizenshipCountry' },
  { id: 'age18', re: /(?:at\s*least|over)\s*18|age\s*of\s*majority/i, from: 'over18' },

/* ── Location and logistics the blocked list surfaced ── */
  { id: 'intendToWork', re: /from\s*where\s*do\s*you\s*intend\s*to\s*work|where\s*(?:will|do)\s*you\s*(?:intend\s*to\s*)?work|work\s*location\s*preference/i,
    from: 'preferredLocation' },
  { id: 'universityLocation', re: /location\s*of\s*your\s*(?:current\s*)?university|where\s*is\s*your\s*(?:university|school)/i,
    from: 'universityLocation' },
  { id: 'flexwork', re: /flexwork|days\s*a\s*week[^?]{0,40}office|hybrid\s*requirement|in[\s-]office\s*requirement/i,
    from: 'onsite' },
  { id: 'provideDocs', re: /documentation\s*reflecting|verify\s*(?:your\s*)?(?:education|employment)|background\s*check/i,
    from: 'canProvideDocs' },

  /* ── Identity ── */
  { id: 'firstName',  re: /first\s*name|given\s*name|pr[ée]nom/i, from: 'firstName' },
  { id: 'lastName',   re: /last\s*name|family\s*name|surname|nom\s*de\s*famille/i, from: 'lastName' },
  { id: 'fullName',   re: /full\s*name|your\s*name|nom\s*complet/i, from: 'fullName' },
  { id: 'email',      re: /e-?mail|courriel/i, not: /confirm/i, from: 'email' },
  { id: 'phone',      re: /phone|mobile|cell|t[ée]l[ée]phone/i, from: 'phone' },
  { id: 'address',    re: /street|address|adresse/i, not: /e-?mail/i, from: 'address' },
  { id: 'city',       re: /\bcity\b|\bville\b/i, from: 'city' },
  // \bstate\b, not /state/ — otherwise "United States" matches here and the
  // work-authorisation question gets answered with a province.
  { id: 'province',   re: /\bprovince\b|\bstate\b|\br[ée]gion\b/i, not: /united\s*states|work/i, from: 'province' },
  { id: 'postalCode', re: /postal|zip/i, from: 'postalCode' },
  { id: 'country',    re: /\bcountry\b|\bpays\b/i, not: /work|authoriz|authoris|citizen/i, from: 'country' },

  /* ── Links ── */
  { id: 'linkedin',  re: /linkedin/i, from: 'linkedin' },
  { id: 'github',    re: /github|git\s*hub/i, from: 'github' },
  { id: 'portfolio', re: /portfolio|personal\s*(?:site|website)|website/i, from: 'website' },

  /* ── Education ── */
  { id: 'school',       re: /school|university|universit[ée]|college|institution|[ée]tablissement|currently\s*attend/i,
    not: /when|date|month|year|complete|graduat|scale|gpa|grade/i, from: 'school' },
  { id: 'degree',       re: /degree|dipl[ôo]me|qualification/i, from: 'degree' },
  { id: 'fieldOfStudy', re: /field\s*of\s*study|major|discipline|domaine|programme?\s*of\s*study/i, from: 'fieldOfStudy' },
  { id: 'gpa',          re: /\bgpa\b|grade\s*point|moyenne|academic\s*average/i, from: 'gpa' },
  // Education date controls are usually split into month and year selects.
  // "Immediately" in a month dropdown is a failed submit, so these are
  // separated from the availability question entirely.
  { id: 'eduEndMonth',   re: /end\s*date\s*month|graduation\s*month|completion\s*month/i, from: 'gradMonth' },
  { id: 'eduEndYear',    re: /end\s*date\s*year|graduation\s*year|completion\s*year/i,   from: 'gradYear' },
  { id: 'eduStartMonth', re: /start\s*date\s*month/i, from: 'eduStartMonth' },
  { id: 'eduStartYear',  re: /start\s*date\s*year/i,  from: 'eduStartYear' },
  { id: 'gradYearOnly',  re: /(?:when\s*(?:did|do)\s*you\s*(?:expect\s*to\s*)?graduat|graduation\s*year|year\s*of\s*graduation|expect\s*to\s*graduate)/i,
    not: /high\s*school/i, from: 'gradYearOptions' },
  { id: 'gradDate',      re: /graduation|grad\s*date|expected\s*(?:date|completion|graduation)|date\s*de\s*fin|when\s*(?:will\s*)?you\s*(?:will\s*)?complete/i,
    not: /month|year|high\s*school/i, from: 'gradDate' },
  { id: 'currentYear',  re: /year\s*of\s*study|current\s*year|ann[ée]e\s*d.?[ée]tude/i, from: 'yearOfStudy' },

  /* ── Logistics ── */
  { id: 'relocate',   re: /relocat|d[ée]m[ée]nag|willing\s*to\s*move/i, from: 'relocate' },
  { id: 'onsite',     re: /on-?site|in\s*office|hybrid|commute|pr[ée]sentiel/i, from: 'onsite' },
  { id: 'startDate',  re: /when\s*(?:can|could)\s*you\s*start|available\s*to\s*start|availability|disponibilit[ée]|earliest\s*start/i,
    not: /month|year|education|school|degree/i, from: 'startDate' },
  { id: 'salary', critical: true,
    re: /salary\s*expectation|expected\s*(?:salary|compensation|pay)|desired\s*(?:salary|pay)|pr[ée]tentions/i,
    from: 'salaryExpectation' },
  { id: 'noticePeriod', re: /notice\s*period|pr[ée]avis/i, from: 'noticePeriod' },
  { id: 'priorApplication', re: /previously\s*(?:applied|worked)|former\s*employee|d[ée]j[àa]\s*postul/i, from: 'previouslyApplied' },
  { id: 'referral', re: /how\s*did\s*you\s*hear|referred\s*by|source|r[ée]f[ée]rence/i, from: 'referralSource' },


  /* ── Common employer-specific questions ──
     Every form invents its own. These are the ones that actually recur, and
     each maps to a stored answer the user can override in settings. None is
     terminal, so a wrong guess costs nothing — but leaving them blank stops
     the submit, because forms mark them required. */

  { id: 'highSchoolGrad', re: /high\s*school[^?]{0,30}(?:graduat|complet|finish)|when\s*did\s*you\s*graduate\s*from\s*high/i,
    from: 'highSchoolGradYear' },
  { id: 'applyingLocation', re: /which\s*location\s*(?:are\s*you\s*)?applying|location\s*(?:are\s*you\s*)?applying\s*(?:to|for)|applying\s*to\s*which/i,
    from: 'preferredLocation' },
  { id: 'educationLevel', re: /highest\s*(?:level\s*of\s*)?education|level\s*of\s*(?:study|education)|degree\s*level|education\s*level/i,
    from: 'educationLevel' },
  { id: 'cityPreference', re: /from\s*the\s*cities|other\s*(?:cities|locations|offices)|additional\s*locations|open\s*to\s*(?:other\s*)?locations|any\s*others?\s*you\s*would\s*consider/i,
    from: 'preferredLocation' },
  { id: 'testScoreType', re: /standardi[sz]ed\s*test|test\s*score\s*type|sat\s*\/?\s*act|which\s*test\s*did\s*you/i,
    from: 'testScoreType' },
  { id: 'testScore', re: /\b(?:sat|act|gre|gmat)\b\s*score|test\s*score(?!\s*type)/i,
    from: 'testScore' },
  { id: 'gradingScale', re: /grading\s*scale|gpa\s*scale|out\s*of\s*(?:what|how\s*much)|scale\s*used/i,
    from: 'gradingScale' },
  { id: 'furtherEducation', re: /further\s*education|pursu\w*\s*(?:a\s*)?(?:master|graduate|phd|additional)|continue\s*(?:your\s*)?education|postgraduate/i,
    from: 'furtherEducation' },
  { id: 'outstandingOffers', re: /outstanding\s*offer|other\s*offers|competing\s*offer|holding\s*any\s*offer/i,
    from: 'outstandingOffers' },
  { id: 'internTerm', re: /winter\s*or\s*summer|prefer\s*a\s*(?:winter|summer|fall)\s*intern|which\s*(?:intern(?:ship)?\s*)?(?:term|season)/i,
    from: 'graduationTerm' },
  { id: 'readyFullTime', re: /ready\s*for\s*full[\s-]?time\s*employment|available\s*for\s*full[\s-]?time/i,
    from: 'readyFullTime' },
  { id: 'department', re: /which\s*(?:department|team|desk|group|area)|most\s*interested\s*in|preferred\s*(?:team|department)/i,
    from: 'preferredDepartment' },
  { id: 'militaryService', re: /served\s*in\s*the\s*military|military\s*service|armed\s*forces/i,
    from: 'militaryService' },
  { id: 'currentEmployer', re: /current\s*(?:employer|company)|present\s*employer|company\s*name|employer\s*name|most\s*recent\s*(?:employer|company)/i,
    from: 'currentEmployer' },
  { id: 'currentTitle', re: /^title$|job\s*title|current\s*(?:role|position|title)|most\s*recent\s*(?:title|role)/i,
    from: 'currentTitle' },
  { id: 'employmentAgreement', critical: false,
    re: /employment\s*agreement|non[\s-]?compete|post[\s-]?employment\s*(?:restriction|obligation)|restrictive\s*covenant/i,
    from: 'employmentAgreements' },
  { id: 'reasonableAccommodation',
    re: /essential\s*functions|reasonable\s*accommodation/i, from: 'canPerformDuties' },
  { id: 'previouslyWorkedHere',
    re: /(?:ever\s*)?worked\s*(?:for|at)\s*\w+|previously\s*(?:been\s*)?employed|former\s*employee/i,
    from: 'previouslyApplied' },
  { id: 'conflictsOfInterest',
    re: /personal\/?familial\s*relationship|outside\s*business\s*activit|intellectual\s*property\s*ownership|government\s*official|conflict\s*of\s*interest/i,
    from: 'conflictsOfInterest' },
  { id: 'singleRoleAck',
    re: /reviewed\s*for\s*one\s*position|apply\s*to\s*your\s*top\s*choice|one\s*position\s*at\s*a\s*time/i,
    from: 'acknowledge' },
  { id: 'noticePeriodQ', re: /notice\s*period|when\s*could\s*you\s*(?:join|begin)|availability\s*to\s*start/i,
    from: 'noticePeriod' },
  { id: 'programmingLanguages', re: /programming\s*languages?|which\s*languages?\s*(?:do\s*you|are\s*you)|preferred\s*language/i,
    from: 'programmingLanguages' },
  { id: 'yearsExperience', re: /years?\s*of\s*(?:relevant\s*)?experience|how\s*many\s*years/i,
    from: 'yearsExperience' },
  { id: 'graduationTerm', re: /which\s*(?:term|semester|season)|summer\s*or\s*fall|term\s*(?:are\s*you\s*)?applying/i,
    from: 'graduationTerm' },
  { id: 'preferredLocation', re: /preferred\s*(?:work\s*)?(?:location|office|city)|which\s*office|location\s*preference|work\s*location/i,
    from: 'preferredLocation' },
  { id: 'howHeard', re: /how\s*did\s*you\s*(?:first\s*)?hear|where\s*did\s*you\s*(?:hear|find)|source\s*of\s*referral/i,
    from: 'referralSource' },
  { id: 'visaStatus', re: /visa\s*status|immigration\s*status/i, not: /sponsor/i, from: 'citizenship' },

  /* Consent and acknowledgement. Required, and answering "Yes" is the only
     way to proceed — a form cannot be submitted while consent is unchecked. */
  { id: 'consent', consent: true,
    re: /privacy|consent|acknowledg|i\s*agree|terms|gdpr|data\s*protection|certify|confirm\s*that\s*the\s*(?:above|information)|opt\s*in|permission\s*to/i },

  /* ── Free text ── */
  { id: 'whyCompany', longform: true,
    re: /why\s*(?:do\s*you\s*want\s*to\s*)?(?:work|join)|why\s*(?:this\s*)?(?:company|us|role)|what\s*(?:interests|excites)/i },
  { id: 'coverLetter', longform: true,
    re: /cover\s*letter|lettre\s*de\s*motivation|additional\s*information|anything\s*else/i },
  { id: 'strengths', longform: true,
    not: /race|ethnic|gender|orientation|disab|veteran|demographic/i,
    re: /greatest\s*strength|tell\s*us\s*about\s*yourself|describe\s*yourself/i },
  { id: 'project', longform: true,
    re: /(?:favourite|favorite|interesting|challenging|recent|significant)\b[^?]{0,30}\bproject\b|describe\s*(?:a|your)[^?]{0,40}\bproject\b|proud\s*of|technical\s*challenge/i },


  /* ── Demographic ──
     These are never invented. But every one of these forms offers a decline
     option, and several mark the question required — so refusing to touch it
     leaves the application unsubmittable. Declining is both honest and what
     the form is built to accept. ── */
  { id: 'gender',     demographic: true, re: /gender|genre|sex\b/i },
  { id: 'race',       demographic: true, re: /race|ethnic|visible\s*minorit/i },
  { id: 'veteran',    demographic: true, re: /veteran|militaire/i },
  { id: 'disability', demographic: true, re: /disab|handicap/i },
  { id: 'indigenous', demographic: true, re: /indigenous|aboriginal|autochtone|first\s*nations/i },
  { id: 'lgbtq',      demographic: true, re: /lgbt|sexual\s*orientation|orientation\s*sexuelle/i }
];

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

/** Defaults filled in from the CV facts, overridable in the popup. */
/**
 * @param {object} profile
 * @param {object} cvFacts
 * @param {object} [ctx]   { region: 'CA' | 'US' } — the posting's country
 */
function defaultAnswers(profile = {}, cvFacts = {}, ctx = {}) {
  const first = profile.firstName || 'Diego';
  const last  = profile.lastName  || 'Crisafulli';
  return {
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`.trim(),
    email: profile.email || '',
    phone: profile.phone || '',
    address: profile.address || '',
    city: profile.city || 'Montreal',
    province: profile.province || 'Quebec',
    postalCode: profile.postalCode || '',
    country: profile.country || 'Canada',
    linkedin: profile.linkedin || '',
    github: profile.github || '',
    website: profile.website || '',

    school: cvFacts.school || 'Concordia University',
    // Forms offer "Bachelor's Degree", not "Bachelor's, Computer Science" —
    // the level belongs here and the subject belongs in fieldOfStudy.
    degree: "Bachelor's Degree",
    fieldOfStudy: cvFacts.fieldOfStudy || 'Computer Science',
    gpa: cvFacts.gpa || '3.0',
    // Graduation menus phrase this every possible way: a month and year, a
    // bare year, or a bracket like "Prior to December 2026". Offer all three
    // shapes so whichever the form uses, one of them scores a match.
    gradDate: (() => {
      const g = cvFacts.gradDate || '2026-09';
      const [y, m] = g.split('-');
      const month = MONTHS[parseInt(m, 10) - 1];
      return [ month + ' ' + y, y, month,
               'Prior to December ' + y, 'Before December ' + y,
               'On or before ' + month + ' ' + y, g ];
    })(),
    // Split forms want these separately; derive rather than ask twice.
    gradMonth: MONTHS[parseInt((cvFacts.gradDate || '2026-09').split('-')[1], 10) - 1] || 'September',
    gradYear: (cvFacts.gradDate || '2026-09').split('-')[0],
    eduStartMonth: 'September',
    eduStartYear: '2022',
    gradYearOptions: (() => {
      const y = (cvFacts.gradDate || '2026-09').split('-')[0];
      const m = MONTHS[parseInt((cvFacts.gradDate || '2026-09').split('-')[1], 10) - 1];
      return [y, m + ' ' + y, y + '-' + (cvFacts.gradDate || '2026-09').split('-')[1]];
    })(),
    yearOfStudy: profile.yearOfStudy || 'Final year',

    // Eligibility — no defaults invented; these must be set explicitly.
    workAuthCanada: profile.workAuthCanada ?? '',
    workAuthUS: profile.workAuthUS ?? '',
    // A Canadian citizen needs no sponsorship in Canada and does need it in
    // the US. Answering with one value for both is a false statement on
    // whichever half it does not fit, so it resolves per posting.
    sponsorship: (ctx.region === 'US'
      ? (profile.sponsorshipUS ?? profile.sponsorship)
      : (profile.sponsorshipCanada ?? profile.sponsorship)) ?? '',
    sponsorshipCanada: profile.sponsorshipCanada ?? '',
    sponsorshipUS: profile.sponsorshipUS ?? '',
    citizenship: profile.citizenship ?? '',
    securityClearance: profile.securityClearance ?? '',
    over18: profile.over18 || 'Yes',

    relocate: profile.relocate || 'Yes',
    onsite: profile.onsite || 'Yes',
    startDate: profile.startDate || 'Immediately',
    salaryExpectation: profile.salaryExpectation || '',
    noticePeriod: profile.noticePeriod || 'None',
    previouslyApplied: profile.previouslyApplied || 'No',
    // Menus offer wildly different vocabularies here. A list is tried in
    // order, so one of them matches whatever this form happens to call it.
    gradingScale: profile.gradingScale || '4.0',
    // Canadian universities do not require SAT/ACT, so there is usually no
    // score to give. Offer the ways forms phrase "none".
    testScoreType: profile.testScoreType ||
      ['None', 'N/A', 'Not applicable', 'Prefer not to answer', 'Other', 'Did not take'],
    testScore: profile.testScore || ['N/A', 'None', 'Prefer not to answer'],
    // Bachelor's start year minus four is the usual high-school finish.
    // Year menus want a bare year; prose fields want the full date. Offer
    // both so whichever the form uses, one of them matches.
    highSchoolGradYear: profile.highSchoolGradYear || ['2020', '2021', '2019'],
    educationLevel: profile.educationLevel ||
      ["Bachelor's Degree", 'Bachelors', "Bachelor's", 'Undergraduate', 'BS', 'University'],
    furtherEducation: profile.furtherEducation || 'No',
    outstandingOffers: profile.outstandingOffers || 'No',
    preferredDepartment: profile.preferredDepartment ||
      ['Software Engineering', 'Software Development', 'Engineering', 'Technology',
       'Core Development', 'Software', 'Development', 'Quantitative Development',
       'Quantitative Research', 'Any', 'No preference'],
    militaryService: profile.militaryService || 'No',
    currentEmployer: profile.currentEmployer || 'McKesson',
    currentTitle: profile.currentTitle || 'Software Developer',
    // No non-compete, no conflicts, able to do the job — all "No"/"Yes"
    // answers that were blocking forms purely because no rule existed.
    employmentAgreements: profile.employmentAgreements || 'No',
    canPerformDuties: profile.canPerformDuties || 'Yes',
    conflictsOfInterest: profile.conflictsOfInterest || 'No',
    acknowledge: profile.acknowledge || ['Yes', 'I acknowledge', 'I understand', 'I agree'],
    programmingLanguages: profile.programmingLanguages || 'Python, C++, Java, JavaScript',
    yearsExperience: profile.yearsExperience || '2',
    graduationTerm: profile.graduationTerm ||
      ['Summer', 'Summer 2027', 'Winter', 'Either', 'No preference', 'Any'],
    preferredLocation: profile.preferredLocation ||
      ['Montreal', 'Toronto', 'Remote', 'New York', 'Any'],

    universityLocation: profile.universityLocation ||
      ['Montreal', 'Canada', 'Quebec', 'Montreal, Canada'],
    canProvideDocs: profile.canProvideDocs || 'Yes',
    // The country, not the status — "which country/region do you have
    // citizenship in" wants Canada, not "Canadian citizen".
    citizenshipCountry: profile.citizenshipCountry || ['Canada', 'CA', 'Canadian'],
    readyFullTime: profile.readyFullTime || 'Yes',
    referralSource: profile.referralSource ||
      ['Company Website', 'Company Site', 'Job Board', 'LinkedIn', 'Website', 'Other'],

    ...(profile.custom || {})
  };
}

/**
 * Resolve one question to an answer.
 * @returns {{status:'exact'|'longform'|'demographic'|'unknown', value?, ruleId?, critical?}}
 */
function answerFor(question, answers = {}, opts = {}) {
  const q = String(question || '').trim();
  if (!q) return { status: 'unknown', reason: 'no question text' };

  for (const rule of ANSWER_RULES) {
    if (!rule.re.test(q)) continue;
    if (rule.not && rule.not.test(q)) continue;

    if (rule.demographic) {
      // Never a substantive answer — only the decline option, in the several
      // phrasings forms use for it.
      return { status: 'demographic', ruleId: rule.id,
               decline: ['Prefer not to say', 'Decline to self identify',
                         'I don\'t wish to answer', 'Prefer not to disclose',
                         'Decline to answer', 'I do not wish to answer',
                         'Prefer not to specify', 'Do not wish to disclose'],
               reason: 'demographic — declining, never answered substantively' };
    }
    if (rule.consent) {
      // Consent is not a fact to look up — the form cannot be submitted
      // without it, and the user chose to apply.
      return { status: 'consent', ruleId: rule.id, value: 'Yes',
               reason: 'consent / acknowledgement' };
    }
    if (rule.longform) {
      return { status: 'longform', ruleId: rule.id,
               reason: 'needs written prose', longformKind: rule.id };
    }

    const value = answers[rule.from];
    if (value === undefined || value === null || value === '' ||
        (Array.isArray(value) && !value.length)) {
      return { status: 'unknown', ruleId: rule.id, critical: Boolean(rule.critical),
               reason: rule.critical
                 ? 'no saved answer, and this question decides auto-rejection'
                 : 'no saved answer' };
    }
    return { status: 'exact', ruleId: rule.id,
             value: Array.isArray(value) ? value[0] : String(value),
             alternatives: Array.isArray(value) ? value : null,
             critical: Boolean(rule.critical) };
  }

  // Yes/no questions we have not seen before are still unsafe to guess.
  return { status: 'unknown', reason: 'question not recognised' };
}

/** Which stored answers are still blank — surfaced in the popup. */
function missingCritical(answers = {}) {
  const criticalFields = ANSWER_RULES.filter(r => r.critical && r.from).map(r => r.from);
  const needed = [...new Set(criticalFields)]
    // Resolved per posting from the two region-specific values below.
    .filter(f => f !== 'sponsorship');
  const missing = needed.filter(f => !answers[f]);
  for (const f of ['sponsorshipCanada', 'sponsorshipUS']) {
    if (!answers[f]) missing.push(f);
  }
  return missing;
}

const __answers = { ANSWER_RULES, defaultAnswers, answerFor, missingCritical };
if (typeof module !== 'undefined' && module.exports) module.exports = __answers;
if (typeof self !== 'undefined') self.__answers = __answers;
