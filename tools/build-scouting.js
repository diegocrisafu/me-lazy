#!/usr/bin/env node
/* ═══════════════════════════════════════════
   THE SCOUTING REPORT

   Roles worth applying to that the system could
   not file itself, with the reason it could not
   and a direct link to the form. Generated from
   the live store, so it is a work queue rather
   than a screenshot of one.

   Grouped by why it stopped, because the reasons
   ask for different things from you: some need a
   single sign-in, some need one answer, and some
   need ten minutes on a site that will not take
   an automated application at all.

   node tools/build-scouting.js
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const store = require('../daemon/store.js');
const TIERS = require('../tiers.js');

const OUT = path.join(__dirname, '..', 'scouting.html');

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Why a role is here, in the words that tell you what to do about it. */
const REASONS = [
  { id: 'account',  test: /needs an account|sign-in|npm run login/i,
    title: 'One sign-in away',
    lead: 'These use Workday or a company account. Signing in once unlocks every role at that employer — the command is under each group.' },
  { id: 'wizard',   test: /amazon|multi-step wizard/i,
    title: 'Signed in, but the form has steps',
    lead: 'You are already signed in and the form arrives part-filled from your profile. What stops the automation is a multi-page wizard whose questions differ per posting. These are quick by hand.' },
  { id: 'noform',   test: /no form found|redirects its board|own application flow|submit control not found/i,
    title: 'No form to fill',
    lead: 'The board sends you to the company’s own software. There is nothing on the page for an automated filler to complete, so these are yours entirely.' },
  { id: 'question', test: /required still empty|no option matched|no saved answer|unanswered/i,
    title: 'Waiting on one answer',
    lead: 'Everything else was filled. One question needs a fact only you have — answer it once with node tools/answer.js and the whole employer unlocks.' },
  { id: 'unsure',   test: /clicked submit but no confirmation/i,
    title: 'Submitted, but unconfirmed',
    lead: 'The form was completed and submitted, and no confirmation appeared. Worth checking in the employer’s portal before applying again — a duplicate is worse than a gap.' },
  { id: 'other',    test: /.*/,
    title: 'Everything else',
    lead: 'Roles that stopped for reasons that did not group cleanly. The reason is printed against each one.' }
];

function groupOf(reason) {
  return (REASONS.find(r => r.test.test(String(reason || ''))) || REASONS[REASONS.length - 1]).id;
}

/* One sign-in command per employer, where that is what is needed. */
function loginHint(rec) {
  if (/amazon/i.test(rec.scoutReason || '')) return null;
  if (!/needs an account/i.test(rec.scoutReason || '')) return null;
  try {
    const host = new URL(rec.applyUrl || rec.url).hostname;
    return `npm run login -- https://${host}`;
  } catch { return null; }
}

/* Undisclosed pay is stored as an em dash, which renders as a stray
   separator with nothing after it. */
const money = r => {
  const v = String(r.salaryDisplay || '').trim();
  return v && !/^[—–-]+$/.test(v) ? v : null;
};

(function build() {
  const all = Object.values(store.getApplications());
  const scouted = all.filter(r => r.status === 'scouted');

  // Rank them the same way the applier does, so the top of each list is the
  // one worth your next half hour.
  const tiered = TIERS.assignTiers(scouted);
  const byId = new Map(tiered.map(x => [x.rec.id, x]));

  const rows = scouted
    .filter(r => (byId.get(r.id)?.tier) !== 'X')      // ruled out by location
    .map(r => ({ rec: r, tier: byId.get(r.id)?.tier || 'C',
                 ev: TIERS.expectedValue(r).ev, group: groupOf(r.scoutReason) }))
    .sort((a, b) => b.ev - a.ev);

  const groups = REASONS.map(g => ({
    ...g,
    items: rows.filter(r => r.group === g.id)
  })).filter(g => g.items.length);

  const total = rows.length;
  const employers = new Set(rows.map(r => r.rec.company)).size;
  const applied = all.filter(r => r.status === 'applied').length;

  const card = ({ rec, tier, ev }) => {
    const hint = loginHint(rec);
    const pay = money(rec);
    return `<li class="role" data-tier="${esc(tier)}">
      <div class="role-head">
        <span class="tier tier-${esc(tier)}" title="Tier ${esc(tier)}">${esc(tier)}</span>
        <div class="role-id">
          <h3 class="role-title"><a href="${esc(rec.applyUrl || rec.url)}" rel="noopener nofollow">${esc(rec.title)}</a></h3>
          <p class="role-meta">${esc(rec.company)}${rec.location ? ' · ' + esc(rec.location) : ''}${pay ? ' · ' + esc(pay) : ''}</p>
        </div>
      </div>
      <p class="role-why">${esc(rec.scoutReason || 'no reason recorded')}</p>
      ${hint ? `<p class="role-cmd"><code>${esc(hint)}</code></p>` : ''}
    </li>`;
  };

  const section = g => `
<section class="group" id="${esc(g.id)}" aria-labelledby="${esc(g.id)}-h">
  <div class="group-head">
    <h2 id="${esc(g.id)}-h">${esc(g.title)}</h2>
    <span class="count">${g.items.length}</span>
  </div>
  <p class="group-lead">${esc(g.lead)}</p>
  <ol class="roles">${g.items.slice(0, 60).map(card).join('')}</ol>
  ${g.items.length > 60 ? `<p class="more">and ${g.items.length - 60} more in this group</p>` : ''}
</section>`;

  const generated = new Date().toISOString();
  const generatedHuman = new Date().toLocaleDateString('en-CA',
    { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>Scouting Report — Roles to Apply to by Hand | Diego Crisafulli</title>
<meta name="description" content="${total} software roles worth applying to that an automated filler could not complete, grouped by what stops each one: an account, a wizard, a missing form, or one unanswered question." />
<link rel="canonical" href="https://diegocrisafulli.dev/scouting.html" />
<meta name="robots" content="index, follow" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Diego Crisafulli" />
<meta property="og:title" content="Scouting Report — Roles to Apply to by Hand" />
<meta property="og:description" content="${total} roles across ${employers} employers that could not be filed automatically, and the reason for each." />
<meta property="og:url" content="https://diegocrisafulli.dev/scouting.html" />
<meta property="og:image" content="https://diegocrisafulli.dev/social-card.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Scouting report: roles to apply to by hand" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Scouting Report — Roles to Apply to by Hand" />
<meta name="twitter:description" content="${total} roles that could not be filed automatically, and the reason for each." />
<meta name="twitter:image" content="https://diegocrisafulli.dev/social-card.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="site/style.css" />
<link rel="stylesheet" href="site/scouting.css" />
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://diegocrisafulli.dev/' },
        { '@type': 'ListItem', position: 2, name: 'Scouting report', item: 'https://diegocrisafulli.dev/scouting.html' }
      ] },
    { '@type': 'CollectionPage',
      name: 'Scouting report',
      description: `${total} software roles that could not be applied to automatically.`,
      url: 'https://diegocrisafulli.dev/scouting.html',
      dateModified: generated,
      isPartOf: { '@type': 'WebSite', name: 'Diego Crisafulli', url: 'https://diegocrisafulli.dev/' } }
  ]
}, null, 2)}
</script>
</head>
<body class="scouting">

<a href="#main" class="sr-only">Skip to content</a>

<nav class="nav" id="nav" aria-label="Primary">
  <div class="nav-in">
    <a href="/" class="nav-name">Diego Crisafulli</a>
    <div class="nav-links">
      <a href="/#summary" class="nav-link">Summary</a>
      <a href="/#work" class="nav-link">Work</a>
      <a href="/#projects" class="nav-link">Projects</a>
      <a href="/scouting.html" class="nav-link" aria-current="page">Scouting</a>
    </div>
    <a href="/#contact" class="nav-cta">Get in touch</a>
  </div>
</nav>

<nav class="crumbs" aria-label="Breadcrumb">
  <div class="wrap">
    <ol>
      <li><a href="/">Home</a></li>
      <li aria-current="page">Scouting report</li>
    </ol>
  </div>
</nav>

<main id="main">
  <header class="s-hero">
    <div class="wrap">
      <p class="eyebrow">Updated ${esc(generatedHuman)}</p>
      <h1>Roles that need a human</h1>
      <p class="s-lead">
        An automated filler has sent ${applied} applications. These ${total} it could not,
        across ${employers} employers — grouped by what stops each one, because the fix
        differs: a single sign-in, a form with pages, a site with no form at all, or one
        question only I can answer.
      </p>
      <ul class="stats">
        <li><span class="stat-n">${total}</span><span class="stat-l">roles waiting</span></li>
        <li><span class="stat-n">${employers}</span><span class="stat-l">employers</span></li>
        <li><span class="stat-n">${applied}</span><span class="stat-l">already sent</span></li>
      </ul>
      <p class="jump">Jump to: ${groups.map(g => `<a href="#${esc(g.id)}">${esc(g.title)}</a>`).join(' · ')}</p>
    </div>
  </header>

  <div class="wrap">
    ${groups.map(section).join('\n')}
  </div>
</main>

<footer class="s-foot">
  <div class="wrap">
    <p>Generated from the live application store on ${esc(generatedHuman)}.
       <a href="/">Back to the portfolio</a> · <a href="/#contact">Get in touch</a></p>
  </div>
</footer>

</body>
</html>
`;

  fs.writeFileSync(OUT, html);
  console.log(`scouting.html — ${total} roles, ${employers} employers, ${groups.length} groups`);
  for (const g of groups) console.log(`  ${String(g.items.length).padStart(4)}  ${g.title}`);
})();
