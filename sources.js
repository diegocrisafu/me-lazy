/* ═══════════════════════════════════════════
   ATS SOURCE ADAPTERS

   One adapter per applicant-tracking system.
   Each returns jobs in a single normalized shape
   so the filter, scorer and tracker never need to
   know where a posting came from.

   All of these are public, unauthenticated
   endpoints. From a Chrome extension the requests
   carry the browser's own fingerprint, so hosts
   that reject server-side clients answer normally.
   ═══════════════════════════════════════════ */

const FETCH_TIMEOUT = 15000;

async function httpJSON(url, init = {}, timeout = FETCH_TIMEOUT) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        'accept': 'application/json',
        ...(init.headers || {})
      }
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, data: await res.json() };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── HTML -> text, for ATSs that return markup ──

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function stripHTML(html) {
  if (!html) return '';
  // Greenhouse returns markup that is itself HTML-escaped, so entities must be
  // decoded before tags are removed — otherwise "&lt;p&gt;" decodes into a
  // literal "<p>" only after the tag pass has gone, and survives as visible
  // text. Decode, strip, then decode again for entities inside the content.
  let s = decodeEntities(String(html));
  s = stripTags(s);
  s = decodeEntities(s);
  s = stripTags(s);   // markup revealed by the second decode
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

/** The shape every adapter produces. */
function normalize(company, raw) {
  return {
    id: `${company.id}:${raw.sourceId}`,
    sourceId: String(raw.sourceId),
    companyId: company.id,
    company: company.name,
    country: company.country,
    sector: company.sector,
    tier: company.tier,
    ats: company.ats,
    oaLikelihood: company.oa?.likelihood ?? 0,
    oaPlatform: company.oa?.platform || null,

    title: raw.title || '',
    location: raw.location || '',
    remote: Boolean(raw.remote),
    url: raw.url || '',
    applyUrl: raw.applyUrl || raw.url || '',
    description: raw.description || '',
    salaryRaw: raw.salaryRaw || null,
    postedAt: raw.postedAt || null,
    ageDays: daysSince(raw.postedAt),
    fetchedAt: new Date().toISOString()
  };
}

/* ─────────────── GREENHOUSE ─────────────── */
async function fetchGreenhouse(company) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`;
  const r = await httpJSON(url);
  if (!r.ok || !Array.isArray(r.data?.jobs)) return { ok: false, error: r.error || `HTTP ${r.status}`, jobs: [] };

  const jobs = r.data.jobs.map(j => {
    // Greenhouse puts pay in metadata on some boards
    let salaryRaw = null;
    if (Array.isArray(j.metadata)) {
      const pay = j.metadata.find(m => /salary|compensation|pay/i.test(m.name || ''));
      if (pay && pay.value) salaryRaw = String(pay.value);
    }
    return normalize(company, {
      sourceId: j.id,
      title: j.title,
      location: j.location?.name || '',
      url: j.absolute_url,
      // Many boards set absolute_url to the employer's own careers page, which
      // only embeds the board — the fillable form is always on the canonical
      // host. Applying to the wrapper page finds no form at all.
      applyUrl: `https://job-boards.greenhouse.io/${company.token}/jobs/${j.id}`,
      description: stripHTML(j.content),
      postedAt: j.updated_at || j.first_published,
      salaryRaw
    });
  });
  return { ok: true, jobs };
}

/* ─────────────── LEVER ─────────────── */
async function fetchLever(company) {
  const url = `https://api.lever.co/v0/postings/${company.token}?mode=json`;
  const r = await httpJSON(url);
  if (!r.ok || !Array.isArray(r.data)) return { ok: false, error: r.error || `HTTP ${r.status}`, jobs: [] };

  const jobs = r.data.map(j => normalize(company, {
    sourceId: j.id,
    title: j.text,
    location: j.categories?.location || '',
    remote: /remote/i.test(j.workplaceType || j.categories?.location || ''),
    url: j.hostedUrl,
    applyUrl: j.applyUrl || (j.hostedUrl ? j.hostedUrl.replace(/\/$/, '') + '/apply' : ''),
    description: j.descriptionPlain || stripHTML(j.description),
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    salaryRaw: j.salaryRange
      ? `${j.salaryRange.min}-${j.salaryRange.max} ${j.salaryRange.currency || ''} ${j.salaryRange.interval || ''}`
      : null
  }));
  return { ok: true, jobs };
}

/* ─────────────── ASHBY ───────────────
   Ashby is the only one that reliably returns
   structured compensation, which makes the pay
   gate exact rather than inferred. */
async function fetchAshby(company) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.org}?includeCompensation=true`;
  const r = await httpJSON(url);
  if (!r.ok || !Array.isArray(r.data?.jobs)) return { ok: false, error: r.error || `HTTP ${r.status}`, jobs: [] };

  const jobs = r.data.jobs.map(j => {
    let salaryRaw = null;
    const comp = j.compensation?.compensationTierSummary || j.compensationTierSummary;
    if (comp) salaryRaw = String(comp);
    else if (Array.isArray(j.compensation?.summaryComponents)) {
      const c = j.compensation.summaryComponents.find(x => x.compensationType === 'Salary');
      if (c) salaryRaw = `${c.minValue ?? ''}-${c.maxValue ?? ''} ${c.currencyCode || ''} ${c.interval || ''}`;
    }
    return normalize(company, {
      sourceId: j.id,
      title: j.title,
      location: j.location || j.locationName || '',
      remote: Boolean(j.isRemote),
      url: j.jobUrl || j.applyUrl,
      applyUrl: j.applyUrl ||
        (company.org && j.id ? `https://jobs.ashbyhq.com/${company.org}/${j.id}/application` : j.jobUrl),
      description: j.descriptionPlain || stripHTML(j.descriptionHtml),
      postedAt: j.publishedAt || j.updatedAt,
      salaryRaw
    });
  });
  return { ok: true, jobs };
}

/* ─────────────── SMARTRECRUITERS ─────────────── */
async function fetchSmartRecruiters(company) {
  const out = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const url = `https://api.smartrecruiters.com/v1/companies/${company.token}/postings?limit=100&offset=${offset}`;
    const r = await httpJSON(url);
    if (!r.ok || !Array.isArray(r.data?.content)) break;
    out.push(...r.data.content);
    if (out.length >= (r.data.totalFound || 0)) break;
  }
  const jobs = out.map(j => normalize(company, {
    sourceId: j.id,
    title: j.name,
    location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(', '),
    remote: Boolean(j.location?.remote),
    url: `https://jobs.smartrecruiters.com/${company.token}/${j.id}`,
    description: '', // requires a per-posting call; filled lazily
    postedAt: j.releasedDate
  }));
  return { ok: true, jobs };
}

/** "Posted 3 Days Ago" / "Posted Today" / "Posted 30+ Days Ago" -> days */
function parseWorkdayPostedOn(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/today|just posted/.test(t)) return 0;
  if (/yesterday/.test(t)) return 1;
  const m = t.match(/(\d+)\s*\+?\s*(day|week|month)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n * ({ day: 1, week: 7, month: 30 })[m[2]];
}

/* ─────────────── WORKDAY ───────────────
   Two-phase: a paged POST for the list, then an
   optional GET per posting for the description.
   Descriptions are fetched lazily only for jobs
   that already survived the title and pay filters,
   which keeps a 2000-job tenant to a few calls. */
const WORKDAY_QUERIES = [
  'intern', 'internship', 'co-op', 'new grad', 'graduate',
  'campus', 'entry level', 'junior', 'software developer', 'software engineer'
];

async function fetchWorkday(company, opts = {}) {
  const {
    searchQueries = WORKDAY_QUERIES,
    maxPagesPerQuery = 5,
    pageSize = 20
  } = opts;

  const base = `https://${company.host}/wday/cxs/${company.tenant}/${company.site}`;
  const seen = new Map();
  let total = null;
  let anyOk = false;
  let firstError = null;

  // A large tenant lists thousands of roles, and paging all of them is both
  // slow and pointless. Workday searches server-side, so ask it directly for
  // the handful of vocabularies that describe early-career work and merge
  // the results instead.
  //
  // The queries are independent, so they run together — sequentially this is
  // the slowest stage of the whole hunt.
  const runQuery = async (q) => {
    const out = [];
    for (let page = 0; page < maxPagesPerQuery; page++) {
      const r = await httpJSON(`${base}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: pageSize, offset: page * pageSize, searchText: q })
      });
      if (!r.ok) return { ok: false, error: r.error || `HTTP ${r.status}`, postings: out, total: null };
      const postings = r.data?.jobPostings || [];
      out.push(...postings);
      if (postings.length < pageSize) return { ok: true, postings: out, total: r.data?.total ?? null };
    }
    return { ok: true, postings: out, total: null };
  };

  const settled = await Promise.all(searchQueries.map(runQuery));
  for (const s of settled) {
    if (!s.ok) { firstError = firstError || s.error; continue; }
    anyOk = true;
    if (total == null && s.total != null) total = s.total;
    for (const p of s.postings) {
      const key = p.externalPath || p.title;
      if (!seen.has(key)) seen.set(key, p);
    }
  }

  if (!anyOk) return { ok: false, error: firstError || 'no results', jobs: [] };
  const all = [...seen.values()];

  const jobs = all.map(j => {
    const path = j.externalPath || '';
    return normalize(company, {
      sourceId: j.bulletFields?.[0] || path.split('/').pop() || j.title,
      title: j.title,
      location: j.locationsText || '',
      remote: /remote/i.test(j.locationsText || ''),
      url: `https://${company.host}/en-US/${company.site}${path}`,
      description: '', // lazily filled by fetchWorkdayDescription
      postedAt: null,
      _wdPath: path
    });
  });

  // normalize() only carries the shared field set, so re-attach the two
  // Workday-specific bits the lazy description fetch and the freshness
  // score depend on. Workday reports recency as prose ("Posted 3 Days
  // Ago") rather than a date, so parse it into ageDays.
  jobs.forEach((job, i) => {
    job._wdPath = all[i]?.externalPath || '';
    job.postedText = all[i]?.postedOn || null;
    if (job.ageDays == null && job.postedText) {
      job.ageDays = parseWorkdayPostedOn(job.postedText);
    }
  });
  return { ok: true, jobs, total };
}

async function fetchWorkdayDescription(company, job) {
  if (!job._wdPath) return '';
  const base = `https://${company.host}/wday/cxs/${company.tenant}/${company.site}`;
  const r = await httpJSON(`${base}${job._wdPath}`);
  if (!r.ok) return '';
  const info = r.data?.jobPostingInfo || {};
  return stripHTML(info.jobDescription || '');
}

/* ─────────────── AMAZON ───────────────
   Amazon runs its own search endpoint and is the
   single highest-yield source for automatic SDE
   assessments.

   Note: a `base_query` here is matched strictly and
   collapses results to near-zero. Far better to pull
   the whole software-development category per country
   and let our own title filter do the selecting. */
async function fetchAmazon(company, opts = {}) {
  const { countries = ['CAN', 'USA'], maxPerCountry = 500, pageSize = 100 } = opts;
  const seen = new Map();

  for (const country of countries) {
    for (let offset = 0; offset < maxPerCountry; offset += pageSize) {
      const url = 'https://www.amazon.jobs/en/search.json?' + new URLSearchParams({
        'category[]': 'software-development',
        country,
        result_limit: String(pageSize),
        offset: String(offset),
        sort: 'recent'
      });
      const r = await httpJSON(url);
      const list = r.data?.jobs;
      if (!r.ok || !Array.isArray(list) || list.length === 0) break;

      for (const j of list) {
        const key = j.id_icims || j.job_path;
        if (seen.has(key)) continue;
        seen.set(key, normalize(company, {
          sourceId: key,
          title: j.title,
          location: j.normalized_location || j.location || '',
          url: 'https://www.amazon.jobs' + j.job_path,
          description: stripHTML([j.description, j.basic_qualifications, j.preferred_qualifications]
            .filter(Boolean).join('\n\n')),
          postedAt: j.posted_date ? new Date(j.posted_date).toISOString() : null
        }));
      }
      if (list.length < pageSize) break;
      if (seen.size >= (r.data.hits || Infinity)) break;
    }
  }
  return { ok: true, jobs: [...seen.values()] };
}

/* ─────────────── MICROSOFT ─────────────── */
async function fetchMicrosoft(company, opts = {}) {
  const { queries = ['software engineer intern', 'software engineer new grad'], pages = 2 } = opts;
  const seen = new Map();

  for (const q of queries) {
    for (let p = 1; p <= pages; p++) {
      const url = 'https://gcsservices.careers.microsoft.com/search/api/v1/search?' + new URLSearchParams({
        q, l: 'en_us', pg: String(p), pgSz: '20', o: 'Recent', flt: 'true'
      });
      const r = await httpJSON(url);
      const results = r.data?.operationResult?.result?.jobs;
      if (!r.ok || !Array.isArray(results)) break;

      for (const j of results) {
        if (seen.has(j.jobId)) continue;
        const loc = j.properties?.primaryLocation ||
                    (j.properties?.locations || []).join(', ') || '';
        seen.set(j.jobId, normalize(company, {
          sourceId: j.jobId,
          title: j.title,
          location: loc,
          url: `https://jobs.careers.microsoft.com/global/en/job/${j.jobId}`,
          description: stripHTML(j.properties?.description || ''),
          postedAt: j.postingDate || null
        }));
      }
    }
  }
  return { ok: true, jobs: [...seen.values()] };
}

/* ─────────────── NETFLIX ─────────────── */
async function fetchNetflix(company, opts = {}) {
  const { queries = ['engineer', 'analyst', 'data', 'intern'], pageSize = 100 } = opts;
  const seen = new Map();

  for (const q of queries) {
    for (let start = 0; start < 300; start += pageSize) {
      const url = 'https://explore.jobs.netflix.net/api/apply/v2/jobs?' + new URLSearchParams({
        domain: 'netflix.com', query: q, start: String(start), num: String(pageSize)
      });
      const r = await httpJSON(url);
      const list = r.data?.positions;
      if (!r.ok || !Array.isArray(list) || list.length === 0) break;

      for (const j of list) {
        if (seen.has(j.id)) continue;
        seen.set(j.id, normalize(company, {
          sourceId: j.id,
          title: j.name,
          location: j.location || (j.locations || []).join(', '),
          url: j.canonicalPositionUrl || `https://explore.jobs.netflix.net/careers/job/${j.id}`,
          description: stripHTML(j.job_description || j.description || ''),
          postedAt: j.t_create ? new Date(j.t_create * 1000).toISOString() : null
        }));
      }
      if (list.length < pageSize) break;
    }
  }
  return { ok: true, jobs: [...seen.values()] };
}

/* ─────────────── BROWSER-ONLY ADAPTERS ───────────────
   Google, Apple and Meta reject server-side clients by TLS fingerprint, the
   same way several bank tenants do. From inside the extension the request
   carries Chrome's own fingerprint, so these are expected to work there.
   They are marked verified:false until confirmed in-browser. */

async function fetchGoogle(company, opts = {}) {
  const { queries = ['software engineer', 'data', 'analyst'], pages = 2 } = opts;
  const seen = new Map();
  for (const q of queries) {
    for (let page = 1; page <= pages; page++) {
      const url = 'https://www.google.com/about/careers/applications/api/jobs/search?' +
        new URLSearchParams({ q, page: String(page), location: 'Canada' });
      const r = await httpJSON(url);
      const list = r.data?.jobs;
      if (!r.ok || !Array.isArray(list) || !list.length) break;
      for (const j of list) {
        const id = j.id || j.job_id;
        if (seen.has(id)) continue;
        seen.set(id, normalize(company, {
          sourceId: id, title: j.title,
          location: (j.locations || []).map(l => l.display).join(', '),
          url: j.apply_url || `https://www.google.com/about/careers/applications/jobs/results/${id}`,
          description: stripHTML(j.description || ''), postedAt: j.publish_date || null
        }));
      }
    }
  }
  return { ok: seen.size > 0, jobs: [...seen.values()],
           error: seen.size ? null : 'no results (blocked server-side; retry in-browser)' };
}

async function fetchApple(company) {
  const r = await httpJSON('https://jobs.apple.com/api/role/search', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'software engineer', page: 1,
      filters: { locations: ['postLocation-CANC'] } })
  });
  const list = r.data?.searchResults;
  if (!r.ok || !Array.isArray(list)) {
    return { ok: false, error: r.error || `HTTP ${r.status} (retry in-browser)`, jobs: [] };
  }
  return { ok: true, jobs: list.map(j => normalize(company, {
    sourceId: j.positionId, title: j.postingTitle,
    location: (j.locations || []).map(l => l.name).join(', '),
    url: `https://jobs.apple.com/en-ca/details/${j.positionId}`,
    description: stripHTML(j.jobSummary || ''), postedAt: j.postingDate || null
  })) };
}

async function fetchMeta(company) {
  const r = await httpJSON('https://www.metacareers.com/graphql', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ doc_id: '9114524511922157', variables: JSON.stringify({
      search_input: { q: 'software engineer', divisions: [], offices: ['Canada'] } }) }).toString()
  });
  const list = r.data?.data?.job_search_with_featured_jobs?.all_jobs;
  if (!r.ok || !Array.isArray(list)) {
    return { ok: false, error: r.error || `HTTP ${r.status} (retry in-browser)`, jobs: [] };
  }
  return { ok: true, jobs: list.map(j => normalize(company, {
    sourceId: j.id, title: j.title, location: (j.locations || []).join(', '),
    url: `https://www.metacareers.com/jobs/${j.id}/`,
    description: stripHTML(j.description || ''), postedAt: null
  })) };
}

/* ─────────────── DISPATCH ─────────────── */
async function fetchCompany(company, opts = {}) {
  try {
    switch (company.ats) {
      case 'greenhouse':      return await fetchGreenhouse(company);
      case 'lever':           return await fetchLever(company);
      case 'ashby':           return await fetchAshby(company);
      case 'smartrecruiters': return await fetchSmartRecruiters(company);
      case 'workday':         return await fetchWorkday(company, opts);
      case 'custom':
        if (company.adapter === 'amazon')    return await fetchAmazon(company, opts);
        if (company.adapter === 'microsoft') return await fetchMicrosoft(company, opts);
        if (company.adapter === 'netflix')   return await fetchNetflix(company, opts);
        if (company.adapter === 'google')    return await fetchGoogle(company, opts);
        if (company.adapter === 'apple')     return await fetchApple(company);
        if (company.adapter === 'meta')      return await fetchMeta(company);
        return { ok: false, error: 'no adapter', jobs: [] };
      default:
        return { ok: false, error: 'unknown ats', jobs: [] };
    }
  } catch (e) {
    return { ok: false, error: e.message, jobs: [] };
  }
}

const __sources = {
  fetchCompany, fetchGreenhouse, fetchLever, fetchAshby,
  fetchSmartRecruiters, fetchWorkday, fetchWorkdayDescription,
  fetchAmazon, fetchMicrosoft, fetchNetflix, fetchGoogle, fetchApple, fetchMeta, stripHTML, decodeEntities, normalize, daysSince, httpJSON,
  parseWorkdayPostedOn
};

// Node (tests) and browser / service-worker (importScripts or <script>)
if (typeof module !== 'undefined' && module.exports) module.exports = __sources;
if (typeof self !== 'undefined') self.__sources = __sources;
