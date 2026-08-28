/* ═══════════════════════════════════════════
   CV VARIANTS — TEMPLATE

   Copy to cv-profiles.js and fill in with your own
   details. The real file is gitignored: it contains
   full resume text and, if you use conditional
   claims, notes about how you present your record.
   That is not something to publish.

   `resumeText` holds SUMMARY, SKILLS and PROJECTS
   rather than the whole CV. Experience bullets are
   near-identical across variants, so including them
   adds the same term hits to every candidate and
   only compresses the differences between them.

   `families` declares which role families a variant
   serves — see targeting.js.
   ═══════════════════════════════════════════ */

const CV_PROFILES = [
  {
    id: 'early-career',
    name: 'Early Career Generalist',
    short: 'Early Career',
    color: '#0a66c2',
    file: 'YOUR_NAME_Early_Career.pdf',
    filePatterns: ['early career'],
    families: ['swe', 'data'],
    facts: {
      school: 'Your University',
      degree: "Bachelor's, Computer Science",
      fieldOfStudy: 'Computer Science',
      gpa: '0.0',
      gradDate: '2027-05'
    },
    boost: ['distributed systems', 'cloud', 'aws', 'docker', 'ci/cd', 'automation'],
    resumeText: `Your summary paragraph.
Languages: ...
Frameworks & Cloud: ...
Tools: ...
Projects: ...`
  },

  {
    id: 'backend',
    name: 'Backend / Full-Stack',
    short: 'Backend',
    color: '#7c3aed',
    file: 'YOUR_NAME_Backend.pdf',
    filePatterns: ['backend'],
    families: ['swe', 'data'],
    facts: { school: 'Your University', degree: "Bachelor's, Computer Science",
             fieldOfStudy: 'Computer Science', gpa: '0.0', gradDate: '2027-05' },
    boost: ['backend', 'api', 'rest', 'sql', 'postgres', 'docker', 'microservices'],
    resumeText: `Your backend-focused summary.
Languages: ...
Frameworks & Cloud: ...`
  }

  /* Add more variants. Two optional mechanisms:

     pinnedTo: { companyId: 'bmo', titlePattern: 'full.?stack' }
       A CV written for one posting. Wins there outright, never used elsewhere.

     conditionalClaim: { label, status, appliesWhen: 'intern-returning-to-school', note }
       A claim that belongs on the CV only when the posting meets a condition.
       Enforced in cv-selector.js — the variant is withheld everywhere else.

     enabled: false
       Declared but has no PDF yet. Never selected.                          */
];

/* Genuine disagreements between your variants, surfaced in the dashboard. */
const CV_FACT_CONFLICTS = [];

const CV_CONDITIONAL_CLAIMS = CV_PROFILES
  .filter(p => p.conditionalClaim)
  .map(p => ({ variantId: p.id, variant: p.short, ...p.conditionalClaim }));

const __cvProfiles = { CV_PROFILES, CV_FACT_CONFLICTS, CV_CONDITIONAL_CLAIMS };

if (typeof module !== 'undefined' && module.exports) module.exports = __cvProfiles;
if (typeof self !== 'undefined') self.__cvProfiles = __cvProfiles;
