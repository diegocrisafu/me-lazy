/* Probes every configured ATS endpoint and reports which tokens resolve.
   Run: node tools/verify-sources.js            */
const { COMPANIES } = require('../companies.js');

const TIMEOUT = 12000;

async function probe(url, init = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal,
      headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0', ...(init.headers || {}) } });
    const txt = await r.text();
    let json = null;
    try { json = JSON.parse(txt); } catch {}
    return { status: r.status, json, len: txt.length };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(t); }
}

function countOf(c, res) {
  if (!res.json) return null;
  const j = res.json;
  switch (c.ats) {
    case 'greenhouse':      return Array.isArray(j.jobs) ? j.jobs.length : null;
    case 'lever':           return Array.isArray(j) ? j.length : null;
    case 'ashby':           return j.jobs ? j.jobs.length : null;
    case 'smartrecruiters': return typeof j.totalFound === 'number' ? j.totalFound : null;
    case 'workday':         return typeof j.total === 'number' ? j.total : null;
    default: return null;
  }
}

function urlFor(c) {
  switch (c.ats) {
    case 'greenhouse':      return [`https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs`, {}];
    case 'lever':           return [`https://api.lever.co/v0/postings/${c.token}?mode=json`, {}];
    case 'ashby':           return [`https://api.ashbyhq.com/posting-api/job-board/${c.org}`, {}];
    case 'smartrecruiters': return [`https://api.smartrecruiters.com/v1/companies/${c.token}/postings?limit=10`, {}];
    case 'workday':         return [`https://${c.host}/wday/cxs/${c.tenant}/${c.site}/jobs`,
      { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ appliedFacets:{}, limit:20, offset:0, searchText:'' }) }];
    default: return null;
  }
}

(async () => {
  const targets = COMPANIES.filter(c => c.ats !== 'custom');
  const results = [];
  const CONC = 8;
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC);
    const out = await Promise.all(batch.map(async c => {
      const u = urlFor(c);
      if (!u) return { c, ok:false, note:'no url' };
      const res = await probe(u[0], u[1]);
      const n = countOf(c, res);
      return { c, res, n, ok: res.status === 200 && n !== null && n > 0 };
    }));
    results.push(...out);
    process.stderr.write('.');
  }
  process.stderr.write('\n\n');

  const ok = results.filter(r => r.ok);
  const bad = results.filter(r => !r.ok);

  console.log('WORKING (' + ok.length + '/' + results.length + '):');
  for (const r of ok.sort((a,b)=>b.n-a.n)) {
    console.log('  ' + String(r.n).padStart(6) + ' jobs  ' + r.c.country + '  ' + r.c.name.padEnd(24) + r.c.ats);
  }
  console.log('\nFAILED (' + bad.length + '):');
  for (const r of bad) {
    const why = r.res ? (r.res.error || ('HTTP ' + r.res.status + (r.n === 0 ? ' / 0 jobs' : ''))) : r.note;
    console.log('  ' + r.c.country + '  ' + r.c.name.padEnd(24) + r.c.ats.padEnd(16) + why);
  }
  console.log('\nTOTAL LIVE JOBS REACHABLE: ' + ok.reduce((s,r)=>s+r.n,0).toLocaleString());
})();
