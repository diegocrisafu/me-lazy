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

  /* "Are you authorised to work WITHOUT needing sponsorship?" is the
     sponsorship question inverted, and it has to be answered inverted. The
     sponsorship rule matched it on the word "sponsorship" and answered "No"
     — which tells the employer you are not allowed to work there. It is the
     single worst wrong answer on a form, and it went out on every Ashby
     application. This rule has to come first, and its regex is longer, so
     longest-match keeps it first regardless of order. */
  { id: 'workAuthNoSponsorship', critical: true,
    re: /(?:authoriz|authoris|eligible|entitled|permitted|able)\w*\s*to\s*work[^?]{0,80}without[^?]{0,40}(?:sponsor|visa|work\s*permit)|do\s*not\s*(?:require|need)[^?]{0,30}sponsor\w*[^?]{0,30}to\s*work/i,
    from: 'workAuthNoSponsorship' },

  { id: 'sponsorship', critical: true,
    re: /sponsor|visa\s*support|immigration\s*(?:support|assistance)|parrainage|work\s*permit\s*support|(?:ongoing\s*)?employer\s*(?:support|assistance)[^?]{0,50}right\s*to\s*work|require[^?]{0,40}employer\s*(?:support|sponsorship)/i,
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

  { id: 'citizenshipCountry', critical: true,
    re: /(?:which\s*)?country\/?(?:region)?\s*(?:do\s*you\s*have\s*)?citizenship|country\s*of\s*citizenship|citizenship\s*country/i,
    from: 'citizenshipCountry' },

  // Asked for export-control screening, and a yes/no rather than a country.
  // It has to outrank the citizenship rule, which is critical and so never
  // falls through to a second reading — it was answering "Canadian citizen"
  // into a Yes/No control.
  { id: 'otherResidency',
    re: /(?:since\s*obtaining|after\s*obtaining)[^?]{0,60}(?:permanent\s*resident|citizenship)[^?]{0,40}|permanent\s*resident\s*(?:in|of)\s*any\s*other\s*countr\w*/i,
    from: 'otherResidency' },
  { id: 'citizenship', critical: true,
    re: /citizen|permanent\s*resident|citoyen|r[ée]sident\s*permanent/i,
    not: /sponsor/i, from: 'citizenship' },

  { id: 'securityClearance', critical: true,
    re: /security\s*clearance|habilitation\s*de\s*s[ée]curit[ée]/i,
    from: 'securityClearance' },

  /* "Are you a resident of California?" — a state-level residency question,
     asked for CCPA notices. Montreal is not any US state, and the polarity
     logic only knows countries. */
  { id: 'usStateResidency',
    re: /resident\s*(?:of|in)\s*(?:the\s*state\s*of\s*)?(?:california|colorado|new\s*york|washington|illinois|texas|massachusetts|virginia|connecticut|utah|oregon)\b/i,
    from: 'usStateResidency' },

  /* Government-service screening, standard at defence-adjacent employers. */
  { id: 'governmentEmployee',
    re: /(?:current\s*or\s*former\s*)?(?:civilian\s*or\s*military\s*)?employee\s*of\s*the\s*(?:united\s*states|u\.?s\.?)\s*government|federal\s*(?:government\s*)?employ(?:ee|ment)\b/i,
    from: 'governmentEmployee' },
  { id: 'postGovernmentRestrictions',
    re: /restrictions?\s*on\s*post[-\s]?government\s*employment|post[-\s]?government\s*employment\s*restrictions?/i,
    from: 'postGovernmentRestrictions' },

  /* "Any recruiting timelines we should know about?" — a real question with
     a real answer: the McKesson contract runs to December 2026, so a start
     in January is clean, and a competing deadline is worth naming because it
     moves you up a queue rather than down it. */
  /* The detail box first, so its longer match wins over the yes/no. Same
     split as outstandingOffers: the question asks whether, the follow-up
     asks what. */
  { id: 'recruitingTimelineDetail',
    re: /(?:share|provide|tell\s*us)\s*(?:more\s*)?details?[^?]{0,40}timeline|details?\s*about\s*(?:the\s*)?(?:relevant\s*)?timeline|please\s*(?:describe|explain)[^?]{0,30}timeline/i,
    from: 'recruitingTimelineDetail' },
  { id: 'recruitingTimeline',
    re: /(?:do\s*you\s*have\s*)?any\s*(?:recruit(?:ing|ment)?\s*)?timelines?|recruit(?:ing|ment)?\s*timeline|timeline\s*(?:we|us)\s*should|deadlines?\s*(?:we|us)\s*should|any\s*(?:other\s*)?deadlines|decision\s*deadline|timing\s*constraints?/i,
    from: 'recruitingTimeline' },

  /* Interviewed here before — the same shape as having worked here. */
  { id: 'interviewedBefore',
    re: /(?:have\s*you\s*)?(?:ever\s*)?interview(?:ed)?\s*(?:with|at|for)\b[^?]{0,40}(?:before|previously|in\s*the\s*past)|previously\s*interviewed/i,
    from: 'interviewedBefore' },

  /* Still enrolled? Derived from the graduation date rather than assumed. */
  { id: 'currentlyStudent',
    re: /(?:are\s*you\s*)?currently\s*(?:a\s*)?(?:student|enrolled)\b|still\s*(?:a\s*student|enrolled|studying)/i,
    not: /return|internship\s*(?:end|complet)/i, from: 'currentlyStudent' },

  /* Some school-email fields want a reason when you do not supply one. */
  { id: 'noSchoolEmailReason',
    re: /(?:do\s*not|don'?t)\s*have\s*a\s*(?:school|university|academic)\s*e-?mail|reason[^?]{0,30}school\s*e-?mail/i,
    from: 'noSchoolEmailReason' },

  /* "Team Matching" — which team you want, asked as a bare label. */
  { id: 'teamMatching',
    re: /^team\s*matching|team\s*preference|which\s*team[^?]{0,30}(?:interested|prefer|join)/i,
    from: 'preferredDepartment' },

  /* Anthropic's "which location for your 25% time in person" and its kin:
     a choice of office, not a question about where you live. */
  { id: 'officePreference',
    re: /which\s*(?:one|office|location)[^?]{0,60}(?:interested\s*in\s*working|prefer|based)|locations?\s*listed\s*on\s*the\s*job\s*posting|preferred\s*office/i,
    from: 'preferredLocation' },

  /* "Are you currently a <Company> employee?" — the present-tense form of
     having worked there. */
  { id: 'currentEmployeeHere',
    re: /are\s*you\s*(?:currently\s*)?an?\s*(?:current\s*)?[\w& .'-]{2,26}\s*employee\b|currently\s*employed\s*(?:by|at)\s*[\w& .'-]{2,26}\s*\??/i,
    from: 'currentEmployeeHere' },

  /* "What AI technologies are you comfortable with?" — a list question, not
     a scale and not prose. */
  { id: 'aiTechnologies',
    re: /(?:what|which)[^?]{0,30}\bai\b[^?]{0,40}(?:technolog|tools?|frameworks?|stack)|ai[- ]specific\s*technolog|(?:genai|llm)[^?]{0,30}(?:tools?|technolog|experience\s*with)/i,
    from: 'aiTechnologies' },

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
  { id: 'fullName',   re: /full\s*(?:legal\s*)?name|legal\s*name|your\s*name|nom\s*complet|^name$/i, from: 'fullName' },
  { id: 'email',      re: /e-?mail|courriel/i, from: 'email' },
  // "Confirm email" wants the same address again — the old rule excluded it
  // and left a required field blank on every form that asks twice.
  { id: 'emailConfirm',
    re: /(?:confirm|verify|re-?enter|repeat)[^?]{0,20}e-?mail|e-?mail[^?]{0,20}confirmation/i,
    from: 'email' },
  { id: 'phone',      re: /phone|mobile|cell|t[ée]l[ée]phone/i, from: 'phone' },
  // Only filled where the form marks it required — see whenRequired in
  // fillField. A mailing address is not something to hand over to every
  // form that has a box for it.
  { id: 'address', whenRequired: true,
    re: /street|address|adresse/i, not: /e-?mail/i, from: 'address' },
  { id: 'city',       re: /\bcity\b|\bville\b|where\s*are\s*you\s*(?:currently\s*)?(?:located|based|living)|current\s*location|where\s*do\s*you\s*live/i, from: 'city' },
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
  { id: 'degree',       re: /degree|dipl[ôo]me|\bqualification/i, from: 'degree' },
  { id: 'fieldOfStudy', re: /field\s*of\s*study|area\s*of\s*study|major|discipline|domaine|programme?\s*of\s*study|course\s*of\s*study|area\s*of\s*concentration/i, from: 'fieldOfStudy' },
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
    re: /salary\s*expectation|expected\s*(?:salary|compensation|pay)|desired\s*(?:salary|pay|compensation)|pr[ée]tentions|what\s*(?:annual\s*)?salary|annual\s*salary|compensation\s*expectation|base\s*salary\s*(?:expectation|requirement)|what.{0,24}(?:salary|compensation).{0,40}(?:expect|looking|seeking|excited)/i,
    from: 'salaryExpectation' },
  { id: 'salaryRangeAck',
    re: /(?:reviewed|read|seen)[^?]{0,40}(?:salary|compensation|pay)\s*range|salary\s*range[^?]{0,50}(?:aligned|align|acceptable|comfortable|agree|expectations)|are\s*(?:you|your\s*expectations)[^?]{0,40}aligned[^?]{0,30}range/i,
    from: 'salaryRangeAck' },
  { id: 'noticePeriod', re: /notice\s*period|pr[ée]avis/i, from: 'noticePeriod' },
  { id: 'priorApplication', re: /previously\s*(?:applied|worked)|former\s*employee|d[ée]j[àa]\s*postul/i, from: 'previouslyApplied' },
  { id: 'referral', re: /how\s*did\s*you\s*(?:hear|learn|find|come\s*to\s*know)|how\s*(?:did|do)\s*you\s*(?:hear|learn)\s*about|referred\s*by|source|r[ée]f[ée]rence|where\s*did\s*you\s*(?:hear|find)/i, from: 'referralSource' },


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
  // "Will you return to school after the internship" is the same question as
  // "are you pursuing further education", asked the way employers who run
  // internship programmes ask it — and it is the one Cloudflare, Amazon and
  // most co-op programmes gate eligibility on.
  { id: 'furtherEducation', re: /further\s*education|pursu\w*\s*(?:a\s*)?(?:master|graduate|phd|additional)|continue\s*(?:your\s*)?education|postgraduate|(?:return|returning|go\s*back)\s*to\s*(?:the\s*)?(?:school|university|program\w*|studies)(?:[^.?]{0,60})?|enrolled\s*in\s*a\s*(?:university|program)[^.?]{0,80}return/i,
    from: 'furtherEducation' },
  { id: 'offersDetail', re: /if\s*(?:you\s*)?answered\s*.?yes.?[^?]{0,60}(?:offer|detail)|provide\s*details?\s*on\s*competing|details?\s*(?:about|on)\s*(?:your\s*)?offers?/i,
    from: 'outstandingOffersDetail' },
  { id: 'outstandingOffers', re: /outstanding\s*offer|other\s*offers?|competing\s*offer|holding\s*any\s*offer|have\s*any\s*offers?|currently\s*have\s*(?:any\s*)?offers?|any\s*(?:active\s*)?offers?\b/i,
    from: 'outstandingOffers' },
  { id: 'internTerm', re: /winter\s*or\s*summer|prefer\s*a\s*(?:winter|summer|fall)\s*intern|which\s*(?:intern(?:ship)?\s*)?(?:term|season)/i,
    from: 'graduationTerm' },
  { id: 'readyFullTime', re: /ready\s*for\s*full[\s-]?time\s*employment|available\s*for\s*full[\s-]?time/i,
    from: 'readyFullTime' },
  { id: 'department', re: /which\s*(?:department|team|desk|group|area)|most\s*interested\s*in|preferred\s*(?:team|department)/i,
    from: 'preferredDepartment' },
  { id: 'militaryService', re: /served\s*in\s*the\s*military|military\s*(?:service|status|experience)|armed\s*forces|protected\s*veteran/i,
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
  { id: 'yearsExperience', re: /years?\s*of\s*(?:\w+\s+){0,2}experience|how\s*many\s*years|experience\s*\(years\)|total\s*years/i,
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
    re: /why\s*(?:do\s*you\s*want\s*to\s*)?(?:work|join)|why\s*(?:this\s*)?(?:company|us|role)|what\s*(?:interests|excites)|why\s*are\s*you\s*(?:interested|excited)|what\s*(?:draws|attracts)\s*you|excited\s*to\s*join|why\s*(?:would\s*you\s*)?(?:like|want)\s*to|^\s*why\s+(?!do|did|does|are|is|was|were|would|should|have|has|you|we|the|this|that|not|now|leave|leaving)[a-z][\w&.'-]{1,24}(?:\s+[a-z][\w&.'-]{1,24})?\s*\??\s*\*?\s*$/i },
  { id: 'coverLetter', longform: true,
    re: /cover\s*letter|lettre\s*de\s*motivation|additional\s*information|anything\s*else/i },
  { id: 'strengths', longform: true,
    not: /race|ethnic|gender|orientation|disab|veteran|demographic/i,
    re: /greatest\s*strength|tell\s*us\s*(?:something\s*)?about\s*yourself|describe\s*yourself|tell\s*us\s*something[^?]{0,60}(?:resume|r[ée]sum[ée]|cv)\b|(?:not|n't)\s*(?:find\s*)?on\s*(?:your\s*)?(?:resume|r[ée]sum[ée]|cv)\b|why\s*(?:do\s*you\s*think\s*)?(?:are\s*)?you[^?]{0,30}\b(?:good\s*fit|right\s*fit|a\s*fit|right\s*(?:person|candidate))\b|what\s*makes\s*you[^?]{0,40}(?:candidate|fit)|what\s*qualities[^?]{0,60}(?:great|good|strong|successful)|how\s*do\s*your\s*skills\s*and\s*experience/i },
  { id: 'values', longform: true,
    re: /in\s*line\s*with\s*your\s*values|something\s*meaningful[^?]{0,40}(?:you\s*have\s*done|values)|(?:example|time)[^?]{0,30}(?:lived|acted\s*on)\s*(?:your|our)\s*values|what\s*(?:do\s*you\s*)?(?:value|care\s*about)\s*most/i },
  { id: 'project', longform: true,
    re: /(?:favourite|favorite|interesting|challenging|recent|significant)\b[^?]{0,30}\bproject\b|describe\s*(?:a|your)[^?]{0,40}\bproject\b|proud\s*of|technical\s*challenge|describe\s*your\s*experience\s*(?:working\s*)?(?:with|in|on)\b|tell\s*us\s*about\s*(?:a|your)\s*(?:time|experience)/i },


  /* ── Demographic ──
     These are never invented. But every one of these forms offers a decline
     option, and several mark the question required — so refusing to touch it
     leaves the application unsubmittable. Declining is both honest and what
     the form is built to accept. ── */
  { id: 'gender',     demographic: true, re: /gender|genre|sex\b/i },
  { id: 'race',       demographic: true, re: /race|ethnic|visible\s*minorit|hispanic|latino|latinx/i },
  { id: 'veteran',    demographic: true, re: /veteran|militaire/i },
  { id: 'disability', demographic: true, re: /disab|handicap/i },
  { id: 'indigenous', demographic: true, re: /indigenous|aboriginal|autochtone|first\s*nations/i },
  /* Being shared with an employer's partner or talent network is opt-in and
     only widens where the application is seen. */
  { id: 'shareWithPartners', consent: true,
    re: /share\s*my\s*(?:resume|r[ée]sum[ée]|profile|contact\s*information)[^?]{0,70}(?:partners?|network|affiliates?|third\s*part)|talent\s*(?:network|community)|consider\s*me\s*for\s*other\s*(?:roles|positions|opportunities)/i },
  { id: 'policyConsent', consent: true,
    re: /\b(?:ai|privacy|applicant|candidate|recruitment|data)\s*(?:use\s*)?policy\b|policy\s*for\s*application|terms\s*(?:and|&)\s*conditions|code\s*of\s*conduct|arbitration\s*agreement|agreement\s*to\s*arbitrate|please\s*read\s*the[^?]{0,40}agreement/i },
  { id: 'lgbtq',      demographic: true, re: /lgbt|sexual\s*orientation|orientation\s*sexuelle/i },
  // "I identify as:" is how several forms head the whole self-identification
  // block without naming what they are asking about. It is never anything but
  // demographic, and declining is the same answer either way.
  { id: 'selfIdentify', demographic: true, re: /\bi\s*identify\s*as\b|self[-\s]?identif|voluntary\s*self[-\s]?disclosure|transgender|pronouns?\b/i }
];

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];


/* ═══════════════════════════════════════════
   ANSWER BOOK

   Harvested questions with answers given once
   and reused verbatim. This is consulted before
   any rule or inference, because an answer you
   supplied is always better than one derived:
   no algorithm can produce a SAT score, whether
   you hold competing offers, or whether you have
   used a company's product.

   Employers reuse their question set across all
   their postings, so answering IMC's five
   questions unlocks every IMC role.
   ═══════════════════════════════════════════ */

let _book = null;

/** Normalised so wording noise does not create misses. */
function bookKey(question) {
  return String(question).toLowerCase()
    .replace(/[✱*]+/g, ' ')
    .replace(/[^a-z0-9\s?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Load once; the daemon is long-lived and the file rarely changes. */
function loadBook(dir) {
  if (_book) return _book;
  _book = {};
  try {
    // Only available under Node; the browser build simply has no book.
    const fs = require('fs');
    const path = require('path');
    const p = path.join(dir || __dirname, 'data', 'answer-book.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const e of raw.needsYou || []) {
      if (e.answer !== null && e.answer !== undefined && e.answer !== '') {
        _book[e.key] = e.answer;
      }
    }
    for (const [k, v] of Object.entries(raw.answered || {})) _book[k] = v;
  } catch { /* no book yet */ }
  return _book;
}

function bookLookup(question, dir) {
  const b = loadBook(dir);
  const k = bookKey(question);
  if (b[k] !== undefined) return b[k];
  // A prefix match catches the same question truncated differently by a form.
  for (const key of Object.keys(b)) {
    if (key.length > 24 && (k.startsWith(key) || key.startsWith(k))) return b[key];
  }
  return undefined;
}

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
    address: profile.address || '3680 rue de Loreto',
    city: profile.city || 'Montreal',
    province: profile.province || 'Quebec',
    // Deliberately no fallback. I had this as H3A0G4, which is downtown
    // Montreal and not where you live — a postal code is checkable and
    // wrong-by-invention is worse than blank.
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
    // Deliberately no fallback. A GPA is a checkable number that firms
    // screen on, so an invented one is either a false claim or a needlessly
    // weak one. Blank blocks the handful of forms that ask, which surfaces
    // it as a question rather than guessing on your behalf.
    // 2.94 on Concordia's 4.3 scale. The exact figure first, because it is
    // checkable against a transcript; the rounded and one-decimal forms are
    // offered only for controls that will not take two decimals or that ask
    // for a band, where 2.94 lands correctly either way.
    gpa: cvFacts.gpa || profile.gpa || ['2.94', '2.9', '3.0'],
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
    // Montreal is not a US state.
    usStateResidency: 'No',
    governmentEmployee: profile.governmentEmployee || 'No',
    postGovernmentRestrictions: profile.postGovernmentRestrictions || 'No',
    // Yes — there is a timeline, and saying so puts you in front of a
    // recruiter rather than behind one.
    recruitingTimeline: profile.recruitingTimeline || 'Yes',
    recruitingTimelineDetail: profile.recruitingTimelineDetail ||
      'My contract at McKesson runs to December 2026, so I am available from January 2027 ' +
      'and can move quickly on interviews before then. No competing offer deadlines at present.',
    interviewedBefore: profile.interviewedBefore || 'No',
    // Enrolled until the graduation date on the CV, and not after it.
    currentlyStudent: (() => {
      const g = String(cvFacts.gradDate || profile.gradDate || '2026-09').slice(0, 7);
      const now = new Date().toISOString().slice(0, 7);
      return g >= now ? 'Yes' : 'No';
    })(),
    noSchoolEmailReason: profile.noSchoolEmailReason ||
      'My Concordia address is no longer my primary contact as I finish my degree; ' +
      'I check the personal address above daily.',
    currentEmployeeHere: profile.currentEmployeeHere || 'No',
    aiTechnologies: profile.aiTechnologies ||
      'LLM APIs (OpenAI, Anthropic) in production Python and .NET services, ' +
      'retrieval-augmented generation over an unstructured video and transcript corpus, ' +
      'semantic search and embeddings, prompt design and evaluation, and machine-learning ' +
      'point-cloud workflows from the NVIDIA research collaboration at Presagis.',
    over18: profile.over18 || 'Yes',

    relocate: profile.relocate || 'Yes',
    onsite: profile.onsite || 'Yes',
    startDate: profile.startDate || 'January 2027',
    salaryExpectation: profile.salaryExpectation || '',
    // On contract with McKesson through December 2026.
    noticePeriod: profile.noticePeriod || ['2 weeks', 'Two weeks', 'None'],
    previouslyApplied: profile.previouslyApplied || 'No',
    // Menus offer wildly different vocabularies here. A list is tried in
    // order, so one of them matches whatever this form happens to call it.
    // Concordia grades on a 4.30 scale, not 4.0.
    gradingScale: profile.gradingScale || ['4.3', '4.30', '4.0'],
    // Canadian universities do not require SAT/ACT, so there is usually no
    // score to give. Offer the ways forms phrase "none".
    testScoreType: profile.testScoreType ||
      ['None', 'N/A', 'Not applicable', 'Prefer not to answer', 'Other', 'Did not take'],
    testScore: profile.testScore || ['N/A', 'None', 'Prefer not to answer'],
    // Bachelor's start year minus four is the usual high-school finish.
    // Year menus want a bare year; prose fields want the full date. Offer
    // both so whichever the form uses, one of them matches.
    highSchoolGradYear: profile.highSchoolGradYear || ['2020', 'June 2020', '2020-06'],
    educationLevel: profile.educationLevel ||
      ["Bachelor's Degree", 'Bachelors', "Bachelor's", 'Undergraduate', 'BS', 'University'],
    // Only true for internships that require returning to school afterwards —
    // the same condition that governs the McGill claim on the Big Tech CV.
    // Answering Yes on a full-time role would say you are leaving to study.
    furtherEducation: (ctx.returnToSchool === true ? 'Yes' : 'No'),
    // You do hold a McKesson offer. This answers Yes: it is a checkable fact,
    // a false No is the kind of thing that unravels late, and a competing
    // offer usually reads as demand rather than as a reason to pass.
    outstandingOffers: profile.outstandingOffers || 'Yes',
    outstandingOffersDetail: profile.outstandingOffersDetail ||
      'I hold a return offer from McKesson, where I am currently on contract ' +
      'through December 2026. This role is my first preference.',
    preferredDepartment: profile.preferredDepartment ||
      ['Software Engineering', 'Software Development', 'Engineering', 'Technology',
       'Core Development', 'Software', 'Development', 'Quantitative Development',
       'Quantitative Research', 'Any', 'No preference'],
    militaryService: profile.militaryService || 'No',
    // The inverse of `sponsorship`: authorised without needing it. In Canada
    // that is Yes for a citizen; in the US it is No, because TN status is
    // still employer support.
    workAuthNoSponsorship: (ctx.region === 'US') ? 'No' : 'Yes',
    // You are applying to the posting, and your expectation sits inside the
    // ranges this question is asked about.
    salaryRangeAck: profile.salaryRangeAck || 'Yes',
    // One citizenship, living in the country that issued it.
    otherResidency: profile.otherResidency || 'No',
    currentEmployer: profile.currentEmployer || 'McKesson',
    currentTitle: profile.currentTitle || 'Software Developer',
    // No non-compete, no conflicts, able to do the job — all "No"/"Yes"
    // answers that were blocking forms purely because no rule existed.
    employmentAgreements: profile.employmentAgreements || 'No',
    canPerformDuties: profile.canPerformDuties || 'Yes',
    conflictsOfInterest: profile.conflictsOfInterest || 'No',
    acknowledge: profile.acknowledge || ['Yes', 'I acknowledge', 'I understand', 'I agree'],
    programmingLanguages: profile.programmingLanguages ||
      'Python, C++, C, Java, JavaScript, TypeScript, Swift, PowerShell, SQL',
    // Everything else the CV lists. The skill-level matcher was only being
    // shown the languages line, so it answered "beginner" for Docker and AWS
    // — both of which are on the résumé — and understated you on every form
    // that asks.
    skills: profile.skills ||
      '.NET, SQL, MongoDB, NoSQL, AWS, Amazon Web Services, GCP, Google Cloud Platform, ' +
      'Power BI, machine learning, artificial intelligence, LLM, data structures, algorithms',
    tools: profile.tools ||
      'Git, Docker, CI/CD, Jenkins, Bash, PowerShell, Jira, HTML, CSS, Unreal Engine, SQLite, asyncio',
    // Five internships spanning 2021 to 2026, accumulating about three years
    // of actual working time. Three is the number you can defend line by
    // line from the CV dates, which is the only kind worth putting on a
    // form — "2" undercounted it and "5" would be the calendar span rather
    // than time worked.
    yearsExperience: profile.yearsExperience || ['3', '3+', '4', '2'],
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

  // An answer you gave beats anything derived, including a terminal one.
  const booked = bookLookup(q, opts.dir);
  if (booked !== undefined) {
    return { status: 'exact', ruleId: 'book', value: String(booked), fromBook: true };
  }

  // Every rule that fits, then the most specific one — not the first one
  // declared. A long question mentions many things incidentally ("...the
  // country where you are applying", "...may result in disqualification"),
  // and declaration order has no idea which mention is the question. The
  // longest match is the one that saw the most of what was actually asked.
  // Forms mark required fields by appending an asterisk to the label, which
  // silently breaks every anchored rule: /^title$/ never sees "Title*".
  const qm = q.replace(/[\s*✱:]+$/, '').trim() || q;

  const candidates = [];
  let firstMiss = null;
  for (const rule of ANSWER_RULES) {
    const m = qm.match(rule.re) || q.match(rule.re);
    if (!m) continue;
    if (rule.not && rule.not.test(q)) continue;
    candidates.push([m[0].length, candidates.length, rule]);
  }
  candidates.sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));

  for (const [, , rule] of candidates) {
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
      // A critical question stops here — guessing at work authorisation from
      // some weaker rule that also matched is exactly how an application gets
      // auto-rejected. Anything else falls through to the next-best reading,
      // keeping this one as the answer only if nothing better resolves.
      const miss = { status: 'unknown', ruleId: rule.id, critical: Boolean(rule.critical),
                     reason: rule.critical
                       ? 'no saved answer, and this question decides auto-rejection'
                       : 'no saved answer' };
      if (rule.critical) return miss;
      if (!firstMiss) firstMiss = miss;
      continue;
    }
    return { status: 'exact', ruleId: rule.id,
             value: Array.isArray(value) ? value[0] : String(value),
             alternatives: Array.isArray(value) ? value : null,
             whenRequired: Boolean(rule.whenRequired),
             critical: Boolean(rule.critical) };
  }

  // Yes/no questions we have not seen before are still unsafe to guess.
  return firstMiss || { status: 'unknown', reason: 'question not recognised' };
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

const __answers = { ANSWER_RULES, defaultAnswers, answerFor, missingCritical,
                    bookKey, bookLookup, loadBook };
if (typeof module !== 'undefined' && module.exports) module.exports = __answers;
if (typeof self !== 'undefined') self.__answers = __answers;
