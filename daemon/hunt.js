/* Discovery: the same pipeline the extension used, running in Node. */
const path = require('path');
const store = require('./store.js');
const { prioritized } = require('../companies.js');
const { CV_PROFILES } = require('../cv-profiles.js');
const { runHunt } = require('../pipeline.js');
const tracker = require('../tracker.js');

async function hunt(opts = {}) {
  const settings = store.getSettings();
  const companies = prioritized(undefined, { canadaFirst: settings.canadaFirst });

  const result = await runHunt({
    companies,
    profiles: CV_PROFILES,
    rules: settings,
    concurrency: opts.concurrency || 8,
    descriptionBudget: opts.descriptionBudget || 60,
    fetchOpts: { maxPagesPerQuery: 2, maxPerCountry: 300 },
    onProgress: opts.onProgress || (() => {})
  });

  const apps = store.getApplications();
  const runId = 'run_' + Date.now();
  let added = 0;

  for (const job of result.queue) {
    if (apps[job.id]) continue;              // never overwrite history
    const rec = tracker.makeRecord(job, { runId });
    rec.description = (job.description || '').slice(0, 4000);
    rec.duplicateCount = job.duplicateCount || 1;
    apps[job.id] = rec;
    added++;
  }
  store.saveApplications(apps);
  store.saveSources(companies.map(c => ({
    id: c.id, name: c.name, country: c.country, ats: c.ats,
    verified: c.ats === 'custom' ? null : c.verified, jobs: c.jobs,
    oa: c.oa?.likelihood ?? null
  })));

  return { added, total: result.queue.length, stats: result.stats, runId };
}

module.exports = { hunt };
