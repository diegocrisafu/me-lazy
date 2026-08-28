/* ═══════════════════════════════════════════
   HUNT PIPELINE

   fetch -> title filter -> pay gate -> eligibility
         -> CV selection -> assessment priority

   The title filter runs before descriptions are
   fetched. Workday and SmartRecruiters only return
   a description on a per-posting call, and a large
   tenant lists thousands of roles, so filtering on
   the cheap fields first turns an impossible number
   of requests into a few dozen.
   ═══════════════════════════════════════════ */

(function (root, factory) {
  const mod = factory(
    typeof require === 'function' ? require('./sources.js')      : root.__sources,
    typeof require === 'function' ? require('./targeting.js')    : root.__targeting,
    typeof require === 'function' ? require('./salary.js')       : root.__salary,
    typeof require === 'function' ? require('./cv-selector.js')  : root.__cvSelector
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.__pipeline = mod;
})(typeof self !== 'undefined' ? self : this, function (sources, targeting, salaryLib, cvSel) {

  const { fetchCompany, fetchWorkdayDescription } = sources;
  const { evaluate, oaPriority, isDevRole, classifyLevel } = targeting;
  const { parseSalary, findSalaryInDescription } = salaryLib;
  const { selectCV } = cvSel;

  /** Cheap pre-filter on title alone, before any description is fetched. */
  function passesTitleGate(job, rules) {
    if (!isDevRole(job.title)) return false;
    const level = classifyLevel(job.title, '');
    if (level === 'senior') return false;
    // 'unknown' survives here: many bank postings hide the level in the body,
    // and we can afford one description fetch to find out.
    return level === 'intern' || level === 'newgrad' || level === 'unknown';
  }

  function resolveSalary(job, rules) {
    if (job.salaryRaw) {
      const s = parseSalary(job.salaryRaw, { assumeCurrency: job.country === 'CA' ? 'CAD' : 'USD' });
      if (s.found) return s;
    }
    if (job.description) {
      const s = findSalaryInDescription(job.description, { assumeCurrency: job.country === 'CA' ? 'CAD' : 'USD' });
      if (s.found) return s;
    }
    return { found: false };
  }

  async function processCompany(company, ctx) {
    const { rules, profiles, descriptionBudget } = ctx;
    const res = await fetchCompany(company, ctx.fetchOpts || {});
    if (!res.ok) {
      return { company: company.id, ok: false, error: res.error, fetched: 0, kept: [], rejected: {} };
    }

    const rejected = {};
    const kept = [];
    let descFetches = 0;

    // Cheap gate first.
    const candidates = res.jobs.filter(j => {
      if (passesTitleGate(j, rules)) return true;
      rejected['title-gate'] = (rejected['title-gate'] || 0) + 1;
      return false;
    });

    for (const job of candidates) {
      // Lazily pull the description only for survivors that lack one.
      if (!job.description && company.ats === 'workday' && descFetches < descriptionBudget) {
        job.description = await fetchWorkdayDescription(company, job);
        descFetches++;
      }

      const salary = resolveSalary(job, rules);
      const ev = evaluate(job, salary, rules);

      if (!ev.eligible) {
        for (const r of ev.reasons) rejected[r] = (rejected[r] || 0) + 1;
        continue;
      }

      const cv = selectCV(job, ev, profiles);
      const matchPct = cv.score;                 // overlap-derived fit, 0-100ish
      const prio = oaPriority(job, ev, matchPct, { canadaFirst: rules.canadaFirst !== false });

      kept.push({
        ...job,
        family: ev.family,
        level: ev.level,
        levelInferred: ev.levelInferred,
        returnToSchool: ev.returnToSchool,
        region: ev.location.region,
        remote: ev.location.remote,
        requiredYears: ev.years,
        salary,
        salaryDisplay: salaryLib.formatSalary(salary),
        cvId: cv.profile.id,
        cvName: cv.profile.name,
        cvShort: cv.profile.short,
        cvFile: cv.profile.file,
        cvReason: cv.reason,
        cvRanking: cv.ranking,
        cvConditionMet: cv.conditionMet,
        cvClaimOverrodeFit: cv.claimOverrodeFit,
        cvWithheld: cv.withheld,
        matchScore: matchPct,
        priority: prio.score,
        priorityParts: prio.parts
      });
    }

    return { company: company.id, ok: true, fetched: res.jobs.length, kept, rejected, descFetches };
  }

  /** Collapse repeated listings of the same role at the same employer. */
  function dedupe(jobs) {
    const best = new Map();
    let collapsed = 0;

    for (const job of jobs) {
      const key = job.companyId + '|' + String(job.title || '')
        .toLowerCase()
        .replace(/\(.*?\)/g, ' ')          // "(Remote)", "(Summer 2027)"
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

      const existing = best.get(key);
      if (!existing) { best.set(key, { ...job, duplicateCount: 1 }); continue; }

      collapsed++;
      existing.duplicateCount++;
      // Prefer a Canadian instance, then the higher-priority one.
      const better = (job.region === 'CA' && existing.region !== 'CA') ||
                     (job.region === existing.region && job.priority > existing.priority);
      if (better) {
        best.set(key, { ...job, duplicateCount: existing.duplicateCount });
      }
    }
    return { jobs: [...best.values()], collapsed };
  }

  /**
   * @param {object} opts
   * @param {Array}  opts.companies  prioritized company list
   * @param {Array}  opts.profiles   CV_PROFILES
   * @param {object} opts.rules      targeting rules
   * @param {number} opts.concurrency
   * @param {function} opts.onProgress
   */
  async function runHunt(opts) {
    const {
      companies, profiles, rules = {},
      concurrency = 4, descriptionBudget = 40,
      fetchOpts = {}, onProgress = () => {}
    } = opts;

    const ctx = { rules, profiles, descriptionBudget, fetchOpts };
    const results = [];
    const startedAt = Date.now();

    for (let i = 0; i < companies.length; i += concurrency) {
      const batch = companies.slice(i, i + concurrency);
      const out = await Promise.all(batch.map(c => processCompany(c, ctx)));
      results.push(...out);
      onProgress({
        done: Math.min(i + concurrency, companies.length),
        total: companies.length,
        found: results.reduce((s, r) => s + r.kept.length, 0)
      });
    }

    // Employers list one role once per location, and Amazon in particular
    // repeats a single opening a dozen times with distinct ids. Applying to
    // each is wasted effort, so collapse them and keep the strongest
    // instance — Canada preferred, then priority.
    const deduped = dedupe(results.flatMap(r => r.kept));

    const queue = deduped.jobs.sort((a, b) => b.priority - a.priority);

    const rejected = {};
    for (const r of results) {
      for (const [k, v] of Object.entries(r.rejected || {})) rejected[k] = (rejected[k] || 0) + v;
    }

    return {
      queue,
      stats: {
        companies: companies.length,
        ok: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).map(r => ({ company: r.company, error: r.error })),
        fetched: results.reduce((s, r) => s + (r.fetched || 0), 0),
        eligible: queue.length,
        duplicatesCollapsed: deduped.collapsed,
        rejected,
        elapsedMs: Date.now() - startedAt
      }
    };
  }

  return { runHunt, processCompany, passesTitleGate, resolveSalary };
});
