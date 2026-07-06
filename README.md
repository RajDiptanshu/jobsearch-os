# JobSearchOS 🎯

**An AI-assisted, self-built job discovery & interview-prep platform** — a personal automation system that scrapes 20+ job sources across 4 different API/scraping patterns, scores every posting against a weighted-factor matching profile, generates tailored applications, and ships a 500-question interactive interview coach with speech I/O. Built as a real production tool I use daily for my own job search — not a tutorial project.

**Live demos:**
- 🎓 **Interview Coach** (public, try it): https://pm-interview-coach-eosin.vercel.app
- 📱 **Job Dashboard PWA** (installable, password-protected — private job-search data): https://jobsearch-web-inky.vercel.app

> **Note on this repo:** this is the *code and architecture* — the `data/` folder (scraped listings, personal profile, email credentials, sent applications) is intentionally excluded via `.gitignore`. See [Privacy & what's excluded](#privacy--whats-excluded).

---

## The problem

Job boards make you pull. I wanted something that pushes: continuously watch the market, tell me the moment something fits, tell me *why* it fits, and tell me exactly what to change on my resume for that specific JD — without me babysitting five tabs a day. Nothing off-the-shelf did all four (find → prep → apply-prep → track) in one place, so I built it.

## What it does

| Stage | What happens |
|---|---|
| **Find** | Every 3 hours (or on-demand), pulls fresh postings from 20+ sources across 4 integration patterns: public ATS APIs (Greenhouse/Lever/Ashby), reverse-engineered portal JSON endpoints (Shine, foundit/Monster, LinkedIn's guest API), aggregators (RemoteOK, Remotive, Adzuna, JSearch/Google-Jobs), and **IMAP inbox scanning** for job-alert emails (LinkedIn, Naukri, Indeed, Glassdoor, IIM Jobs, direct recruiter mail) |
| **Match** | Scores every posting 0–100% with a transparent, explainable multi-factor algorithm — title fit, domain fit, skills overlap, location, experience-range fit, recency — each independently weighted and shown broken down in the UI (not a black-box score) |
| **Prep** | Per-JD resume-tailoring suggestions: which achievement to lead with (matched from an evidence bank by tag overlap), missing ATS keywords pulled straight from the JD text, and domain-specific repositioning advice |
| **Apply** | For strong matches, auto-generates a complete application package — tailored recruiter email + screening-question answers + resume attached — queued for one-click send, or fully automatic if explicitly opted in |
| **Track** | Dashboard to search/filter/sort and move postings through a status pipeline (New → Shortlisted → Applied → Interview → Offer) |
| **Interview Coach** | A separate SPA with 9 topic modules, 10 multi-stage mock-interview flows, and a 500-question bank — each question walks you through the right framework step-by-step, with type-or-speak answers (Web Speech API) and self-scoring |

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node.js**, zero framework (raw `http` module) | ~10 REST routes didn't need Express; wrote the router, static file serving, and JSON body parsing directly — shows I understand what a framework abstracts away, not just how to import one |
| Storage | **Flat JSON files** on disk | Single-user, hundreds of records — a database would be premature infrastructure. Atomic writes via write-to-temp-then-rename to avoid partial-write corruption |
| Job fetching | Native `fetch()` against a mix of documented APIs (Greenhouse/Lever/Ashby) and undocumented ones I reverse-engineered from browser network tabs (Shine, foundit, LinkedIn guest endpoint) | Real integration work — reading response shapes, handling inconsistent fields across 8+ different source schemas, normalizing into one job model |
| Email | **imapflow** (IMAP client) + **mailparser** (MIME parsing) + **nodemailer** (SMTP send) | Same Gmail app-password powers three things: reading inbox alerts, sending digests, emailing recruiters |
| Browser automation | **Playwright** (attempted, for Naukri) | Ultimately disabled — see [war story #1](#things-that-broke-and-what-i-learned) below |
| Scoring | Hand-written weighted multi-factor algorithm | Deliberately not ML — needed to be explainable (I can see *why* a job scored 87%) and tunable without retraining |
| Frontend | **Vanilla JS SPA**, hash-based routing, no framework | Two separate SPAs (job dashboard, interview coach) built the same way — direct DOM manipulation, template-string rendering, `localStorage` for client state |
| Speech I/O | **Web Speech API** (`SpeechRecognition` + `SpeechSynthesisUtterance`) | Native browser API for the coach's type-or-speak interview practice, with a proper start/stop toggle |
| Auth (web companion) | Custom **HMAC-SHA256** signed cookie, no library | Single-password gate for the PWA — simple enough not to need a session store |
| Automation/scheduling | **Windows Task Scheduler** (PowerShell `ScheduledTasks` module) | Cron-equivalent for a desktop-resident always-on job; `.cmd`/`.vbs` entry points because Task Scheduler's execution environment doesn't inherit a normal shell `PATH` |
| Deployment | **Vercel** — serverless functions (API) + static hosting (SPA), for the portable/public-facing pieces | Desktop does the heavy scan; Vercel hosts what needs to work from any device |
| PWA | Web App Manifest + Service Worker | Installable, works offline for cached data, network-first caching so deploys aren't stuck behind a stale cache |
| AI-assist (optional) | Claude API, bring-your-own-key, called directly from the browser | Coach can grade typed answers against a rubric if the user supplies their own key — never required, never proxied through a server |

---

## Architecture

```
                       ┌─────────────────────────────────────────┐
                       │         pipeline/run.js  (orchestrator)   │
                       │  fetch → dedupe → enrich → score → suggest│
                       │       → generate applications → email      │
                       └───────────────┬─────────────────────────┘
                                       │
        ┌──────────────┬──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   fetch.js       portals.js    email_ingest.js   score.js      suggest.js
   ATS boards     LinkedIn/      Gmail IMAP        weighted       resume-gap
   (GH/Lever/     Shine/         inbox scan        multi-factor   suggestions
   Ashby) +       foundit/                         scoring        from evidence
   RemoteOK/      JSearch                                         bank
   Remotive/
   Adzuna
        │              │              │              │              │
        └──────────────┴──────────────┴──────┬───────┴──────────────┘
                                              ▼
                                      data/jobs.json
                                     (flat-file store)
                                              │
                ┌─────────────────────────────┼─────────────────────────────┐
                ▼                             ▼                             ▼
          server.js                    apply.js                      email.js
     REST API + static UI         application-package            HTML digest +
     (search/filter/sort,           generator (email +             SMTP send
      apply queue, status)          screening answers)

                                              │
                                              ▼
                              Windows Task Scheduler (every 3h)
                              triggers run_hourly.cmd → also
                              publishes a sanitized snapshot to
                              the Vercel-hosted PWA companion
```

The **Interview Coach** (`public/coach/`) is a fully independent SPA sharing nothing but the visual language — its own router, its own data files (`data.js`, `questions.js`), its own progress store in `localStorage`.

---

## Key design decisions (and why)

- **No auto-apply bots on job portals.** LinkedIn/Naukri actively detect and ban automated form submissions. The system stops at "one click to apply" for portal-sourced jobs — automating that last click wasn't worth the account-ban risk. This is a deliberate scope cut, not a missing feature.
- **Auto-emailing recruiters is opt-in and rate-capped**, off by default. Blindly emailing recruiters at a 50%-match threshold could hurt a candidate's reputation — the safe default is a review queue; going hands-off is one explicit environment flag away.
- **The public web companion never sees real personal data.** A build step (`build-seed.js`) strips compensation, phone number, recruiter emails, and application content before anything is published to Vercel — the dashboard people can view is a sanitized snapshot.
- **Vercel is serverless — there's no "run every 3 hours" on it.** Solved with a hybrid: the desktop does the deep 20-source scan on a real OS scheduler and auto-publishes a sanitized snapshot; the web app's own "Run" button does a fast (~2–4s), serverless-friendly live scan of the sources that work well from a datacenter IP.
- **Scoring is a transparent formula, not a model.** Every score shown in the UI has a visible per-factor breakdown (title/domain/skills/location/experience/recency), so a 62% match is explainable, not a mystery — and the weights are one constant object away from re-tuning.

## Things that broke, and what I learned

1. **Naukri blocked headless Chromium at the CDN edge (Akamai Bot Manager)**, even with stealth patches (`navigator.webdriver` override, spoofed plugins). Rather than escalate into a proxy-unblocker arms race for one source, I recognized the losing trade and pivoted — Naukri jobs now arrive via its own email alerts, read straight out of the inbox over IMAP.
2. **Windows Task Scheduler doesn't inherit a normal PATH** — `node` "wasn't found" only when triggered by the scheduler, never when I ran the same script by hand. Fixed by hardcoding the absolute `node.exe` path in the entry-point `.cmd`.
3. **A completed script kept the scheduled task stuck "Running."** Node's event loop was being held open by lingering keep-alive sockets even after all work was done, so the *next* scheduled run got skipped (instance policy: don't overlap). Fixed with an explicit `process.exit(0)` after the async work resolves.
4. **A PowerShell one-liner silently broke authentication** — piping a password into `vercel env add` appended a trailing newline to the stored value, so `password === expected` failed even though they looked identical printed side-by-side. Fixed by `.trim()`-ing both sides defensively.
5. **IMAP fetch/download needs an explicit `{uid: true}`**, or `imapflow` silently treats a UID as a sequence number and returns nothing — no error, just an empty result that looked like "no matching emails" until I diffed against a raw IMAP session.
6. **The installed PWA kept showing yesterday's app** after every deploy — the service worker was cache-first. Switched to network-first with a version-bumped cache name so a fresh deploy is never masked by a stale install.

## Scale

- 20+ integrated sources across 4 distinct integration patterns (documented API, reverse-engineered API, aggregator API, IMAP)
- 16 company ATS boards actively monitored (Greenhouse/Lever/Ashby)
- 400+ postings tracked and re-scored on every run
- Full pipeline run: ~30–140s depending on source count; standalone serverless live-scan: ~2–4s
- 500-question interview bank across 5 categories, each backed by a reusable step-by-step framework (not 500 hardcoded scripts)

---

## Quick start

```bash
git clone https://github.com/RajDiptanshu/jobsearch-os.git
cd jobsearch-os
npm install
cp .env.example .env        # fill in your own Gmail app password / keys (all optional except port)
npm start                   # dashboard at http://localhost:4321
node pipeline/run.js        # run one scan manually (or click ▶ Run now in the UI)
```

The dashboard works with an empty `data/jobs.json` (created on first run) — you'll see 0 jobs until the pipeline runs against your own `data/profile.json` (copy the shape described below).

### Configuring your own matching profile

`data/profile.json` isn't included (it's your personal data). Shape it like:

```json
{
  "identity": { "name": "...", "total_experience_years": 5, "pm_experience_years": 3 },
  "targets": { "titles": [...], "locations": {...} },
  "domains": [{ "name": "Fintech", "weight": 10, "keywords": [...] }],
  "skills": [{ "name": "SQL", "keywords": [...], "strength": "advanced" }],
  "evidence": [{ "id": "...", "tags": [...], "headline": "...", "detail": "..." }]
}
```

Full field reference is in `pipeline/score.js` and `pipeline/suggest.js` — every field maps directly to a scoring factor or a suggestion rule.

---

## Repo structure

```
jobsearch-os/
├── server.js               # zero-dependency HTTP server + REST API
├── public/
│   ├── index.html          # job dashboard SPA
│   └── coach/               # Interview Coach SPA (independent app)
│       ├── index.html
│       ├── app.js           # routing, guided-practice engine, speech I/O, progress
│       ├── data.js           # 9 modules + 10 multi-stage case flows
│       └── questions.js      # 500-question bank + 5 category frameworks
├── pipeline/
│   ├── run.js               # orchestrator
│   ├── fetch.js              # ATS boards + aggregators
│   ├── portals.js            # LinkedIn/Shine/foundit/JSearch/Naukri(disabled)
│   ├── email_ingest.js        # Gmail IMAP job-alert scanning
│   ├── score.js               # weighted multi-factor scoring
│   ├── suggest.js             # resume-gap suggestion engine
│   ├── apply.js                # application-package generator + sender
│   ├── email.js                 # HTML digest + SMTP
│   └── lib.js                   # shared store/env/normalization utilities
├── data/                    # runtime data — see .gitignore, not committed
├── run_hourly.cmd / .vbs   # Task Scheduler entry points
└── .env.example             # config template (no real secrets)
```

## Privacy & what's excluded

This repo ships **code and architecture only**. `.gitignore` excludes:
- `.env` — real credentials (Gmail app password, auth secrets, API keys)
- `data/profile.json` — personal identity, compensation, contact details
- `data/jobs.json`, `data/runs.json` — real scraped listings and run history
- `data/outbox/`, `data/applications/` — actual sent digests and recruiter emails
- `data/logs/` — may contain personal search activity

None of this is needed to read or run the code — the app boots with an empty store and populates from whatever profile/credentials *you* provide.

## Companion projects

- **[jobsearch-web](https://github.com/RajDiptanshu/jobsearch-web)** — the installable PWA companion (Vercel serverless functions + static SPA), auth-gated, with its own fast live-scan endpoint for datacenter-friendly sources.
- **Interview Coach** standalone deploy — same codebase as `public/coach/`, deployed independently at the live demo link above.

---

*Built solo, end-to-end — pipeline design, scoring algorithm, scraping/API integration, scheduling automation, two frontend SPAs, and deployment, with AI-assisted implementation (Claude) throughout.*
