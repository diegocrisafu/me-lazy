/* ═══════════════════════════════════════════
   Job Command Center — Website
   Standalone matching engine + UI
   Zero dependencies. Zero network requests.
   ═══════════════════════════════════════════ */

// ── DOM helpers ──
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ═══════════════════════════════
// TAXONOMY LOADER
// ═══════════════════════════════

let taxonomyEN = null;
let taxonomyFR = null;
let reverseIndexEN = null;
let reverseIndexFR = null;

async function loadTaxonomies() {
  try {
    const [enResp, frResp] = await Promise.all([
      fetch('taxonomy-en.json'),
      fetch('taxonomy-fr.json')
    ]);
    if (enResp.ok) taxonomyEN = await enResp.json();
    if (frResp.ok) taxonomyFR = await frResp.json();
    if (taxonomyEN) reverseIndexEN = buildReverseIndex(taxonomyEN);
    if (taxonomyFR) reverseIndexFR = buildReverseIndex(taxonomyFR);
  } catch (e) {
    console.error('Failed to load taxonomies:', e);
  }
}

// ═══════════════════════════════
// STOPWORDS
// ═══════════════════════════════

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','will','would','could','should','can','may','might',
  'shall','must','need','not','no','nor','so','if','then','than','that','this','these','those','it','its',
  'we','our','you','your','they','their','he','she','his','her','who','which','what','when','where','how',
  'all','each','every','both','few','more','most','other','some','such','only','very','just','also','about',
  'up','out','into','over','after','before','between','under','above','below','as','while','during','through',
  'able','across','well','new','within','per','including','based','using','work','working','role','team',
  'experience','looking','join','ability','strong','excellent','good','great','required','preferred',
  'le','la','les','un','une','des','du','de','et','ou','mais','en','dans','sur','pour','par','avec','est',
  'sont','sera','nous','vous','ils','elles','ce','cette','ces','qui','que','dont','se','ne','pas','plus',
  'aussi','bien','tout','tous','toute','toutes','autre','autres','notre','votre','leur','comme','entre'
]);

// ═══════════════════════════════
// N-GRAM GENERATION
// ═══════════════════════════════

function generateNgrams(text, maxN) {
  if (maxN === undefined) maxN = 4;
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s\+\#\.\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(function(w) { return w.length > 0; });
  const ngrams = new Set();

  for (var n = 1; n <= Math.min(maxN, words.length); n++) {
    for (var i = 0; i <= words.length - n; i++) {
      var slice = words.slice(i, i + n);
      if (slice.every(function(w) { return STOPWORDS.has(w); })) continue;
      ngrams.add(slice.join(' '));
    }
  }
  return ngrams;
}

// ═══════════════════════════════
// REVERSE ALIAS INDEX
// ═══════════════════════════════

function buildReverseIndex(taxonomy) {
  const index = {};
  for (const [category, skills] of Object.entries(taxonomy)) {
    for (const [skillName, skillData] of Object.entries(skills)) {
      const canonical = skillName.toLowerCase();
      index[canonical] = { canonical: skillName, category: category, weight: skillData.weight, suggestion: skillData.suggestion };
      for (const alias of skillData.aliases) {
        index[alias.toLowerCase()] = { canonical: skillName, category: category, weight: skillData.weight, suggestion: skillData.suggestion };
      }
    }
  }
  return index;
}

// ═══════════════════════════════
// LANGUAGE DETECTION
// ═══════════════════════════════

const FR_SIGNALS = ['expérience','responsabilités','compétences','exigences','atout','qualifications','entreprise','poste','équipe','développement','environnement','connaissance','capacité','gestion','projet','nous','vous','notre','travail','être'];
const EN_SIGNALS = ['experience','responsibilities','skills','requirements','qualifications','company','role','team','development','environment','knowledge','ability','management','project','work','looking','looking for','we are','you will','must have'];

function detectLanguage(text) {
  const lower = text.toLowerCase();
  const frScore = FR_SIGNALS.filter(function(w) { return lower.includes(w); }).length;
  const enScore = EN_SIGNALS.filter(function(w) { return lower.includes(w); }).length;
  if (Math.abs(frScore - enScore) <= 3) return 'mixed';
  return frScore > enScore ? 'fr' : 'en';
}

// ═══════════════════════════════
// SECTION-AWARE WEIGHTING
// ═══════════════════════════════

const SECTION_PATTERNS = {
  required: {
    en: /^(?:requirements?|qualifications?|must\s*have|what\s*you(?:'ll)?\s*need|what\s*we(?:'re)?\s*looking\s*for|key\s*skills|essential|minimum\s*qualifications?)/i,
    fr: /^(?:exigences?|qualifications?\s*requises?|compétences?\s*requises?|profil\s*recherché|vous\s*avez|prérequis|ce\s*que\s*nous\s*cherchons)/i,
    multiplier: 1.5
  },
  preferred: {
    en: /^(?:nice\s*to\s*have|bonus|preferred|assets?|additional|desired|plus|good\s*to\s*have)/i,
    fr: /^(?:atouts?|compétences?\s*souhaitées?|un\s*plus|serait\s*un\s*atout|bonus|de\s*préférence|idéalement)/i,
    multiplier: 0.6
  },
  ignored: {
    en: /^(?:benefits?|perks?|what\s*we\s*offer|compensation|our\s*culture|about\s*us|who\s*we\s*are)/i,
    fr: /^(?:avantages?|ce\s*que\s*nous\s*offrons|rémunération|notre\s*culture|à\s*propos\s*de\s*nous|qui\s*sommes)/i,
    multiplier: 0
  }
};

function assignSectionWeights(text) {
  const lines = text.split('\n');
  const sections = [];
  var currentMultiplier = 1.0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;

    var isHeader = false;
    for (const [sectionType, pattern] of Object.entries(SECTION_PATTERNS)) {
      if (pattern.en.test(trimmed) || pattern.fr.test(trimmed)) {
        currentMultiplier = pattern.multiplier;
        isHeader = true;
        break;
      }
    }

    if (!isHeader) {
      sections.push({ text: trimmed, multiplier: currentMultiplier });
    }
  }
  return sections;
}

// ═══════════════════════════════
// MATCHING ENGINE
// ═══════════════════════════════

function runMatchingEngine(jobDescription, resumeText, language) {
  var reverseIndex;

  if (language === 'mixed') {
    reverseIndex = Object.assign({}, reverseIndexEN || {}, reverseIndexFR || {});
  } else if (language === 'fr' && reverseIndexFR) {
    reverseIndex = reverseIndexFR;
  } else if (reverseIndexEN) {
    reverseIndex = reverseIndexEN;
  } else {
    return { score: 0, matched: [], highPriorityGaps: [], lowPriorityGaps: [], categoryBreakdown: {} };
  }

  // Resume skills
  const resumeNgrams = generateNgrams(resumeText);
  const resumeSkills = new Map();
  for (const ngram of resumeNgrams) {
    if (reverseIndex[ngram]) {
      const info = reverseIndex[ngram];
      if (!resumeSkills.has(info.canonical)) {
        resumeSkills.set(info.canonical, { resumeAlias: ngram, category: info.category, weight: info.weight, suggestion: info.suggestion });
      }
    }
  }

  // Job skills with section awareness
  const sections = assignSectionWeights(jobDescription);
  const jobSkills = new Map();

  for (const section of sections) {
    if (section.multiplier === 0) continue;
    const sectionNgrams = generateNgrams(section.text);
    for (const ngram of sectionNgrams) {
      if (reverseIndex[ngram]) {
        const info = reverseIndex[ngram];
        if (!jobSkills.has(info.canonical) || jobSkills.get(info.canonical).sectionMultiplier < section.multiplier) {
          jobSkills.set(info.canonical, {
            jobAlias: ngram,
            weight: info.weight,
            sectionMultiplier: section.multiplier,
            category: info.category,
            suggestion: info.suggestion
          });
        }
      }
    }
  }

  // Score
  var matchedWeight = 0;
  var totalWeight = 0;
  const matched = [];
  const highPriorityGaps = [];
  const lowPriorityGaps = [];
  const categoryStats = {};

  for (const [canonical, jobInfo] of jobSkills) {
    const effectiveWeight = jobInfo.weight * jobInfo.sectionMultiplier;
    totalWeight += effectiveWeight;

    if (!categoryStats[jobInfo.category]) {
      categoryStats[jobInfo.category] = { matched: 0, total: 0 };
    }
    categoryStats[jobInfo.category].total += effectiveWeight;

    if (resumeSkills.has(canonical)) {
      matchedWeight += effectiveWeight;
      categoryStats[jobInfo.category].matched += effectiveWeight;
      matched.push({
        skill: canonical,
        resumeAlias: resumeSkills.get(canonical).resumeAlias,
        jobAlias: jobInfo.jobAlias,
        weight: effectiveWeight
      });
    } else {
      const gap = {
        skill: canonical,
        jobAlias: jobInfo.jobAlias,
        weight: effectiveWeight,
        category: jobInfo.category,
        suggestion: jobInfo.suggestion
      };
      if (jobInfo.sectionMultiplier >= 1.0) {
        highPriorityGaps.push(gap);
      } else {
        lowPriorityGaps.push(gap);
      }
    }
  }

  highPriorityGaps.sort(function(a, b) { return b.weight - a.weight; });
  lowPriorityGaps.sort(function(a, b) { return b.weight - a.weight; });
  matched.sort(function(a, b) { return b.weight - a.weight; });

  const categoryBreakdown = {};
  for (const [cat, stats] of Object.entries(categoryStats)) {
    categoryBreakdown[cat] = {
      matched: stats.matched,
      total: stats.total,
      percentage: stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0
    };
  }

  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

  return {
    score: score,
    matched: matched,
    highPriorityGaps: highPriorityGaps,
    lowPriorityGaps: lowPriorityGaps,
    categoryBreakdown: categoryBreakdown,
    totalSkillsInJob: jobSkills.size,
    totalSkillsMatched: matched.length,
    language: language
  };
}

// ═══════════════════════════════
// PDF EXTRACTION (client-side via pdf.js)
// ═══════════════════════════════

async function extractTextFromPDF(file) {
  var pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF library not loaded');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var arrayBuffer = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  var allText = [];

  for (var i = 1; i <= pdf.numPages; i++) {
    var page = await pdf.getPage(i);
    var content = await page.getTextContent();
    var pageText = content.items.map(function(item) { return item.str; }).join(' ');
    allText.push(pageText);
  }
  return allText.join('\n\n');
}

async function extractTextFromTxt(file) {
  return await file.text();
}

async function handleFileUpload(file, textarea, metaEl) {
  if (!file) return;
  var name = file.name.toLowerCase();

  try {
    var text;
    if (name.endsWith('.pdf')) {
      metaEl.textContent = 'Reading PDF...';
      text = await extractTextFromPDF(file);
    } else if (name.endsWith('.txt')) {
      text = await extractTextFromTxt(file);
    } else {
      metaEl.textContent = 'Unsupported file type. Use PDF or TXT.';
      return;
    }

    if (text.trim().length < 10) {
      metaEl.textContent = 'Could not extract text from this file. Try pasting instead.';
      return;
    }

    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
  } catch (e) {
    metaEl.textContent = 'Error reading file: ' + e.message;
  }
}

// ═══════════════════════════════
// UI — INPUTS
// ═══════════════════════════════

const resumeInput = $('#resume-input');
const jdInput = $('#jd-input');
const analyzeBtn = $('#analyze-btn');
const resumeMeta = $('#resume-meta');
const jdMeta = $('#jd-meta');

// File uploads
var resumeFile = $('#resume-file');
var jdFile = $('#jd-file');
if (resumeFile) {
  resumeFile.addEventListener('change', function(e) {
    handleFileUpload(e.target.files[0], resumeInput, resumeMeta);
  });
}
if (jdFile) {
  jdFile.addEventListener('change', function(e) {
    handleFileUpload(e.target.files[0], jdInput, jdMeta);
  });
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(function(w) { return w.length > 0; }).length;
}

function updateMeta() {
  const rText = resumeInput.value.trim();
  const jText = jdInput.value.trim();

  if (rText.length > 0) {
    const words = countWords(rText);
    // Quick skill preview
    const index = reverseIndexEN || reverseIndexFR;
    var skillCount = 0;
    if (index) {
      const ngrams = generateNgrams(rText);
      const found = new Set();
      for (const ng of ngrams) {
        if (index[ng] && !found.has(index[ng].canonical)) {
          found.add(index[ng].canonical);
          skillCount++;
        }
      }
    }
    resumeMeta.textContent = words + ' words' + (skillCount > 0 ? ' \u00B7 ' + skillCount + ' skills detected' : '');
  } else {
    resumeMeta.textContent = '';
  }

  if (jText.length > 0) {
    jdMeta.textContent = countWords(jText) + ' words';
  } else {
    jdMeta.textContent = '';
  }

  analyzeBtn.disabled = !(rText.length >= 50 && jText.length >= 50);
}

resumeInput.addEventListener('input', updateMeta);
jdInput.addEventListener('input', updateMeta);

// ═══════════════════════════════
// UI — ANALYZE
// ═══════════════════════════════

analyzeBtn.addEventListener('click', function() {
  const resumeText = resumeInput.value.trim();
  const jdText = jdInput.value.trim();
  if (resumeText.length < 50 || jdText.length < 50) return;

  const language = detectLanguage(jdText);
  const result = runMatchingEngine(jdText, resumeText, language);
  renderResults(result);
  $('#results').classList.remove('hidden');
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#reset-btn').addEventListener('click', function() {
  resumeInput.value = '';
  jdInput.value = '';
  resumeMeta.textContent = '';
  jdMeta.textContent = '';
  analyzeBtn.disabled = true;
  $('#results').classList.add('hidden');
  $('#tool').scrollIntoView({ behavior: 'smooth' });
});

// ═══════════════════════════════
// UI — RENDER RESULTS
// ═══════════════════════════════

const CAT_NAMES = {
  languages: 'Languages', frameworks: 'Frameworks', databases: 'Databases',
  cloud: 'Cloud', devops: 'DevOps', data_ml: 'Data & ML',
  testing: 'Testing', practices: 'Practices', soft_skills: 'Soft Skills',
  '3d_graphics': '3D & Graphics', design: 'Design', cad_engineering: 'CAD & Engineering',
  robotics_iot: 'Robotics & IoT', business_tools: 'Business Tools'
};

function renderResults(data) {
  const score = data.score || 0;

  // Score ring
  const card = $('#score-card');
  card.className = 'result-score-card';
  if (score >= 70) card.classList.add('score-high');
  else if (score >= 40) card.classList.add('score-medium');
  else card.classList.add('score-low');

  $('#score-value').textContent = score + '%';
  const circ = 2 * Math.PI * 52;
  const offset = circ - (score / 100) * circ;
  const ring = $('#score-ring-progress');
  ring.style.strokeDashoffset = circ;
  ring.style.transition = 'stroke-dashoffset 0.7s ease';
  setTimeout(function() { ring.style.strokeDashoffset = offset; }, 80);

  var detail = data.totalSkillsMatched + ' of ' + data.totalSkillsInJob + ' skills matched';
  if (data.language !== 'en') detail += ' (detected: ' + data.language + ')';
  $('#score-detail').textContent = detail;

  // Quality warning
  var warningEl = $('#quality-warning');
  if (data.totalSkillsInJob < 3) {
    warningEl.textContent = 'Very few skills detected in the job description. Make sure you pasted the full posting, not just a snippet or sidebar text.';
    warningEl.classList.remove('hidden');
  } else if (data.totalSkillsInJob < 6) {
    warningEl.textContent = 'Only ' + data.totalSkillsInJob + ' skills found in the job description. This might be a non-technical role, or the posting may be incomplete.';
    warningEl.classList.remove('hidden');
  } else {
    warningEl.classList.add('hidden');
  }

  // Breakdown
  renderBreakdown(data.categoryBreakdown);

  // Matched
  $('#matched-count').textContent = data.matched.length;
  renderSkills($('#matched-skills'), data.matched, 'ok');

  // High gaps
  $('#high-gap-count').textContent = data.highPriorityGaps.length;
  var hCard = $('#high-gaps-card');
  if (data.highPriorityGaps.length > 0) {
    hCard.classList.remove('hidden');
    renderSkills($('#high-gap-skills'), data.highPriorityGaps, 'miss');
  } else {
    hCard.classList.add('hidden');
  }

  // Low gaps
  $('#low-gap-count').textContent = data.lowPriorityGaps.length;
  var lCard = $('#low-gaps-card');
  if (data.lowPriorityGaps.length > 0) {
    lCard.classList.remove('hidden');
    renderSkills($('#low-gap-skills'), data.lowPriorityGaps, 'low');
  } else {
    lCard.classList.add('hidden');
  }
}

function renderBreakdown(breakdown) {
  const el = $('#breakdown-bars');
  el.innerHTML = '';
  for (const [cat, d] of Object.entries(breakdown)) {
    const pct = d.percentage || 0;
    var color = 'var(--blue)';
    if (pct >= 70) color = 'var(--green)';
    else if (pct >= 40) color = 'var(--orange)';
    else color = 'var(--red)';

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML =
      '<span class="bar-label">' + esc(CAT_NAMES[cat] || cat) + '</span>' +
      '<div class="bar-bg"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<span class="bar-pct">' + pct + '%</span>';
    el.appendChild(row);
  }
}

function renderSkills(container, skills, type) {
  container.innerHTML = '';
  for (const sk of skills) {
    const div = document.createElement('div');
    div.className = 'sk';

    var iconClass, iconSvg;
    if (type === 'ok') {
      iconClass = 'sk-icon-ok';
      iconSvg = '<polyline points="20 6 9 17 4 12"/>';
    } else if (type === 'miss') {
      iconClass = 'sk-icon-miss';
      iconSvg = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
    } else {
      iconClass = 'sk-icon-low';
      iconSvg = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
    }

    var html = '<svg class="sk-icon ' + iconClass + '" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' + iconSvg + '</svg><div><div class="sk-name">' + esc(sk.skill) + '</div>';

    if (type === 'ok' && sk.resumeAlias && sk.jobAlias && sk.resumeAlias !== sk.jobAlias) {
      html += '<div class="sk-alias">Resume: "' + esc(sk.resumeAlias) + '" = Job: "' + esc(sk.jobAlias) + '"</div>';
    } else if (type !== 'ok' && sk.jobAlias) {
      html += '<div class="sk-alias">Job says: "' + esc(sk.jobAlias) + '"</div>';
    }

    if (sk.suggestion && type !== 'ok') {
      html += '<div class="sk-sug" data-text="' + esc(sk.suggestion) + '">' + esc(sk.suggestion) + '</div>';
    }

    html += '</div>';
    div.innerHTML = html;

    // Copy suggestion on click
    var sug = div.querySelector('.sk-sug');
    if (sug) {
      sug.addEventListener('click', function() {
        var self = this;
        var original = self.getAttribute('data-text');
        navigator.clipboard.writeText(original).then(function() {
          self.textContent = 'Copied!';
          showToast();
          setTimeout(function() { self.textContent = original; }, 1200);
        });
      });
    }

    container.appendChild(div);
  }
}

// ═══════════════════════════════
// UI — TOAST
// ═══════════════════════════════

function showToast() {
  var el = $('#toast');
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 1500);
}

// ═══════════════════════════════
// INIT
// ═══════════════════════════════

loadTaxonomies().then(function() {
  updateMeta();
});
