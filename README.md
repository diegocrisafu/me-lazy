# Application Command Center

A Chrome extension (Manifest V3) that finds internship and new-grad developer roles paying **$90k+**, picks which of three CV variants to send, and tracks every application through to the online assessment.

Covers software, quant and analyst roles across **73 employers** — Canadian banks and tech first, then US big tech, quant desks and fintech — ordered by how reliably each fires an automated assessment.

---

## How it works

```
ATS APIs  ──▶  title gate  ──▶  pay gate  ──▶  eligibility  ──▶  CV pick  ──▶  priority queue
  73 employers    cheap, no        normalized     family, level,    11 variants    assessment-first
  21k+ postings   description      to annual      years, region     + why           ordering
```

Rather than scraping a job board, it reads the applicant-tracking systems directly. Greenhouse, Lever, Ashby, SmartRecruiters and Workday all expose public, unauthenticated JSON, and Amazon and Microsoft run their own search endpoints. That is more volume, structured pay data, and no scraping.

### Assessment-first ordering

The queue is **not** sorted by match quality. The goal is assessment volume, so priority combines:

| Signal | Weight | Why |
|---|---|---|
| Employer OA likelihood | 42% | Quant firms and Amazon automate assessments; most employers do not |
| Posting freshness | 24% | Many employers cap assessment invites to the first wave of applicants |
| CV fit | 20% | Some employers gate the assessment behind a resume screen |
| Level match | 14% | Internships convert to assessments more reliably than new-grad roles |

Canadian postings get a 1.0 multiplier against 0.82 for US.

### Role families

Postings are classified into a family, and only CV variants written for that family compete. Widening scope means adding a family, not loosening the filter.

| Family | Variants | Found last run |
|---|---|---|
| `swe` | Early Career · Campus · Backend · Big Tech | 55 |
| `data` | Quant Analyst · Early Career · Backend | 24 |
| `quant-research` | Quant Analyst · Quant Equity | 22 |
| `quant-dev` | Quant Dev · Quant Dev (Grad) · Quant Equity | 4 |
| `analyst` | Business | 1 |

Finance roles that are not quantitative — financial analyst, IB analyst, trader, credit, compliance — are excluded by title. PhD-only quant seats are filtered out too; they sit next to bachelor-level ones at the same pay.

### CV variant selection

Eleven variants. Two are special:

- **BMO Full Stack** is *pinned* to one posting — it wins there outright and is never considered elsewhere. Add more pinned variants with `pinnedTo: { companyId, titlePattern }`.
- **Big Tech** carries a *conditional claim*: the McGill MSc is applied to, not started, so it goes only to internships that require enrolment after the placement (detected in English and French) and is withheld everywhere else, including every new-grad posting.

> **Still to resolve:** ten variants end the Concordia degree in September 2026; the Big Tech one says December 2026. Every CV you've added since uses September, so that variant is now the lone outlier.

---

## Running unattended

Turn on **Auto-apply** and a tick every minute decides: hunt, send one application, or wait.

| Guard | Default |
|---|---|
| Pacing | ~1 application / 7 min, ±45% jitter, re-rolled each time |
| Quiet hours | 23:00 – 07:00 local |
| Daily cap | 25, counted from the records themselves |
| Circuit breaker | pauses after 4 consecutive failures |

**Terminal answers are never guessed.** Work authorisation, sponsorship, citizenship, security clearance and salary decide automatic rejections. If one is blank the application stops and the role goes to the scouting report. Demographic questions are never answered. Auto-apply refuses to switch on at all while a terminal answer is missing — fill them in on the Profile tab first.

### Cover letters

Composed locally, no external service. By selection rather than generation: a bank of true paragraphs about real work, chosen by what the posting emphasises. Nothing is invented, so a letter cannot claim experience that isn't on the CV. Generate one for any role from the drawer, or let the runner attach it automatically.

### Scouting report

Of the last 106 eligible roles, **93 can be submitted unattended and 13 cannot**. Those 13 get their own dashboard page with the link, why it was flagged, which CV to attach, and enough of the posting to judge it — rather than being silently dropped.

| Reason | Applies to |
|---|---|
| Workday needs an account per employer | TD, BMO, CIBC, Manulife, Capital One, NVIDIA, Citi |
| Employer runs its own flow | Amazon, Microsoft, Netflix, Google, Apple, Meta |
| A terminal screening answer is blank | any — fix it and it returns to the queue |
| The chosen CV has no uploaded PDF | Big Tech (no MSc) |

---

## Apply modes

| Mode | Behaviour |
|---|---|
| **Review** (default) | Opens the form, fills every field it can, selects the right CV, then stops so you can check the screening answers before submitting |
| **Auto** | Fills and submits, and is what the continuous runner uses |

Auto mode still **refuses to submit** when a screening question it has no saved answer for is blank. Work authorisation, sponsorship and salary answers decide automatic rejections, so the filler never guesses at them — it leaves them and flags them. Demographic questions are always left alone.

---

## Files

```
manifest.json      MV3 config, ATS host permissions
background.js      service worker — hunt orchestration, storage, routing
pipeline.js        fetch -> filter -> score -> select, with dedup
runner.js          continuous-run policy: pacing, caps, what can be auto-applied
answers.js         screening answer bank; flags what must never be guessed
cover-letter.js    local cover-letter composition from an evidence bank
sources.js         adapters: Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Amazon, Microsoft
companies.js       51 target employers, tiered, with OA likelihood per employer
targeting.js       level classification, pay gate, eligibility, priority scoring
salary.js          hourly/weekly/monthly -> annual, multi-currency
cv-selector.js     which of the three resumes to send, and why
cv-profiles.js     the three CV variants + their declared fact conflicts
tracker.js         application records, status ladder, per-CV metrics
applier.js         content script — fills ATS forms, selects the CV
dashboard.{html,css,js}   tracking UI
popup.{html,css,js}       targeting settings + profile
tests/engine.test.js      59 unit tests, zero dependencies
tools/verify-sources.js   probes every ATS endpoint
```

---

## Install

```bash
npm install
npx playwright install chromium
```

## Run it

```bash
npm run hunt                 # discover roles (~100s, 73 employers)
npm run status               # see the queue and readiness
npm run dashboard            # http://localhost:7777
npm run apply                # apply to the top queued role, once
npm start                    # the daemon: hunts and applies on its own
bash tools/install-daemon.sh # run at login, restart on crash
```

## Before it can send anything

**1. Put your CV PDFs in `cv/`.** Filenames must match `cv-profiles.js`. Ten of eleven are already there.

**2. Fill the Profile tab** at `http://localhost:7777`. Six answers are *terminal* — they decide automatic rejections, so they are never guessed and auto-apply refuses to start without them:

| Answer | Why |
|---|---|
| Authorised to work in Canada | wrong value = instant filter-out |
| Authorised to work in the US | asked on every US posting |
| Requires visa sponsorship | the single most common auto-reject |
| Citizenship / status | banks gate on it |
| Security clearance | same |
| Salary expectation | a blank box fails some forms outright |

**3. Dry-run first.** Set `runner.dryRunRemaining` to 20 in `data/settings.json`. The daemon fills and screenshots each application but never clicks submit. Check the screenshots in `data/screenshots/`, then set it to 0.

**4. Turn on Auto-apply** from the dashboard.

### Where the emails come from

This system never sends email. Confirmations come from **employers**, to the address in your Profile tab — so it must be the address you want them at. Sent applications appear under **Applications** with a screenshot; anything it declined to send is on the **Scouting Report** with the reason.

## Architecture

Playwright driving a real Chromium with a persistent profile, run as a launchd daemon.

```
daemon/index.js    the loop — decides hunt / apply / wait each minute
daemon/apply.js    drives real forms: label-driven fill, react-select,
                   choice groups, file upload, screenshot before submit
daemon/browser.js  persistent Chrome profile (logins survive between runs)
daemon/hunt.js     discovery via the ATS APIs
daemon/server.js   local dashboard on 127.0.0.1 only
daemon/store.js    atomic JSON on disk in data/
```

Shared logic, all unit-tested and browser-free:

```
companies.js  73 employers, tiered, with assessment likelihood
sources.js    Greenhouse, Lever, Ashby, SmartRecruiters, Workday,
              Amazon, Netflix, Microsoft, Google, Apple, Meta
targeting.js  role families, pay gate, eligibility, priority
salary.js     hourly/monthly -> annual, multi-currency
cv-selector.js  which of 11 CVs, and why
answers.js    screening answer bank; flags what must never be guessed
cover-letter.js  local composition from an evidence bank
runner.js     pacing, caps, what can be auto-applied
tracker.js    records, status ladder, per-CV metrics
```

### Every submission leaves evidence

```
data/screenshots/2026-08-28_point72_cubist-quantitative-researcher/
  before-submit.png     the filled form, captured before clicking
  after-submit.png      the confirmation page
  answers.json          every field and the value written
  cover-letter.txt      the letter sent
  result.json           what filled, what was skipped, and why
```

It refuses to submit when the page still considers a required field empty — which is how a half-filled application gets caught instead of sent.

## Test

```bash
node --test tests/            # 59 unit tests
node tools/smoke.js          # boots the service worker against mocked Chrome APIs
node tools/verify-sources.js # probe every ATS endpoint
```

`tools/smoke.js` is the one to run after any change to the worker: it loads `background.js`, exercises every message the dashboard and popup send, runs a real hunt, and checks that records persist with a CV and a family attached.

---

## Source health

64 of 73 employers verified live, **~21,200 postings reachable**. Eight hosts (RBC, Scotiabank, National Bank, Desjardins, Microsoft, Google, Apple, Meta) reject server-side probes via TLS fingerprinting but answer normally from inside the browser — use **Verify sources** in the dashboard, which runs the check from the extension.

---

## Privacy

All data stays in `chrome.storage.local`. The only network calls are to the public job boards themselves. No accounts, no telemetry, no third-party services.
