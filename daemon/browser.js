/* ═══════════════════════════════════════════
   BROWSER SESSION

   A persistent Chrome profile, not a fresh
   context per run. That is the whole point:
   logins to Workday tenants survive between
   runs, which is what makes the banks
   reachable at all.

   Running real Chromium also carries a real TLS
   fingerprint, so the hosts that answer a
   server-side fetch with an empty 406 — RBC,
   Scotiabank, National Bank, Desjardins,
   Microsoft, Google, Apple, Meta — respond
   normally here.
   ═══════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PROFILES = path.join(__dirname, '..', 'data', 'profiles');

let shared = null;

/**
 * @param {object} opts
 * @param {string} [opts.profile]   profile name — 'default', or per-employer
 * @param {boolean} [opts.headless]
 */
async function launch(opts = {}) {
  const { profile = 'default', headless = true } = opts;
  const dir = path.join(PROFILES, profile);
  fs.mkdirSync(dir, { recursive: true });

  const ctx = await chromium.launchPersistentContext(dir, {
    headless,
    viewport: { width: 1440, height: 960 },
    locale: 'en-CA',
    timezoneId: 'America/Toronto',
    // A default UA advertising HeadlessChrome is the single most common
    // reason an application form silently refuses to submit.
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run'
    ]
  });

  // navigator.webdriver is the other obvious tell.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  ctx.setDefaultTimeout(30000);
  ctx.setDefaultNavigationTimeout(45000);
  return ctx;
}

/** One long-lived context for the daemon, reused across applications. */
async function getShared(opts = {}) {
  if (shared && shared.__alive) return shared;
  shared = await launch(opts);
  shared.__alive = true;
  shared.on('close', () => { shared.__alive = false; });
  return shared;
}

async function closeShared() {
  if (shared && shared.__alive) {
    await shared.close().catch(() => {});
    shared.__alive = false;
  }
  shared = null;
}

/** Fetch JSON from inside the browser, so the request carries Chrome's
    fingerprint and any cookies the profile already holds. */
async function browserFetchJSON(ctx, url, init = {}) {
  const page = await ctx.newPage();
  try {
    // about:blank has a null origin; navigate to the target's own origin
    // first so the request is same-origin and cookies are attached.
    const origin = new URL(url).origin;
    await page.goto(origin, { waitUntil: 'domcontentloaded' }).catch(() => {});
    return await page.evaluate(async ([u, i]) => {
      const r = await fetch(u, {
        method: i.method || 'GET',
        headers: i.headers || { accept: 'application/json' },
        body: i.body || undefined,
        credentials: 'include'
      });
      const text = await r.text();
      try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
      catch { return { ok: false, status: r.status, error: 'not json', sample: text.slice(0, 200) }; }
    }, [url, init]);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { launch, getShared, closeShared, browserFetchJSON, PROFILES };
