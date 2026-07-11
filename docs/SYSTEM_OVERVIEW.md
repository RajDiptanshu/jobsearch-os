# JobSearchOS — System Overview & Interview Showcase

*A personal, end-to-end job-search automation platform: it continuously discovers PM openings across 20+ sources, scores each against my profile with an explainable algorithm, tailors my resume per job with AI, and packages applications — plus a companion AI interview coach.*

---

## 1. What it does (the problem)

Job boards make you **pull** — you search the same portals every day and still miss things. I wanted a system that **pushes**: watch the whole market continuously, tell me the moment something fits, tell me *why* it fits and how confident it is, rewrite my CV for that specific JD, and prep me for the interview. Nothing off-the-shelf did all of that in one place, so I built it.

**One-line pitch:** *"I built an AI-assisted job-search platform that scrapes 20+ sources every 3 hours, scores every posting against my profile with a transparent weighted algorithm, auto-tailors my resume per JD, and includes a 579-question AI interview coach — all deployed and running in production for my own search."*

---

## 2. The complete flow

```
 SCHEDULER (every 3h)               ┌─────────────────────────────────────────┐
 Windows Task Scheduler ──────────► │  pipeline/run.js  (orchestrator)         │
 or "Run now" button                │  fetch → dedupe → enrich → score →       │
                                     │  suggest → tailor → email → persist      │
                                     └───────────────┬─────────────────────────┘
        ┌──────────────┬──────────────┬─────────────┼──────────────┬───────────────┐
        ▼              ▼              ▼              ▼              ▼               ▼
   ATS boards     LinkedIn/Shine/  Gmail IMAP     score.js       suggest.js     apply.js /
   (Greenhouse/   foundit/JSearch  inbox scan     weighted       resume-gap     resume.js
   Lever/Ashby)   (portal scrape)  (job alerts)   multi-factor   suggestions    AI CV tailor
        │              │              │            + confidence                  + Word/PDF
        └──────────────┴──────────────┴─────────────┬──────────────┴───────────────┘
                                                     ▼
                                          data/jobs.json  (flat-file store, atomic writes)
                                                     │
                     ┌───────────────────────────────┼───────────────────────────────┐
                     ▼                               ▼                                ▼
               server.js (dashboard)          email.js (digest)              Vercel PWA mirror
               REST API + UI + AI proxy        HTML + CV drafts attached      (sanitized, installable)
```

**Step by step, every run:**
1. **Fetch** — pull fresh postings from all sources in parallel (fail-soft: a blocked source logs FAIL, never breaks the run).
2. **Dedupe** — collapse by URL / (company+title+location) against the existing store and within the run.
3. **Enrich** — thin LinkedIn cards (no JD text) get their full description fetched from LinkedIn's guest job-posting endpoint (capped per run to stay polite).
4. **Score** — every job gets a 0–100 match with a per-factor breakdown and a **confidence** level.
5. **Suggest** — per-JD resume-change tips (which achievement to lead with, missing ATS keywords, gap repositioning).
6. **Tailor** — for top matches, AI rewrites my actual CV for that JD and generates a Word/PDF draft.
7. **Email** — a digest of new matches with confidence, suggestions, apply links, and the tailored CV drafts attached.
8. **Persist + publish** — write the store; publish a sanitized snapshot to the installable web app.

---

## 3. How I fetch jobs — the technical process & stack (interview-ready)

This is the most technically interesting part. I integrate **20+ sources across four genuinely different patterns** — I can talk to each:

| # | Pattern | Sources | How it works | What it demonstrates |
|---|---------|---------|--------------|----------------------|
| 1 | **Documented public APIs** | Greenhouse, Lever, Ashby (16 company boards: Razorpay, PhonePe, Groww, Careem…) | Official JSON endpoints (`boards-api.greenhouse.io/v1/boards/{token}/jobs`). Clean, reliable, full JD text. | Reading API docs, normalizing heterogeneous schemas |
| 2 | **Reverse-engineered portal endpoints** | LinkedIn (guest jobs API), Shine, foundit/Monster | Found the JSON/HTML endpoints these sites call from their own front-ends via the browser Network tab, then called them directly with the right headers. LinkedIn's `jobs-guest/jobs/api/seeMoreJobPostings/search` returns HTML cards I parse with regex; a second endpoint returns full JD by job-id. | Reverse-engineering, HTML/DOM parsing, rate-limit etiquette |
| 3 | **Aggregator APIs** | RemoteOK, Remotive, Adzuna, JSearch (Google-for-Jobs) | Public JSON feeds / keyed APIs that fan out across many boards in one call. | API integration, optional-key feature flags |
| 4 | **Email ingestion (IMAP)** | Gmail inbox — LinkedIn/Indeed/Naukri/Glassdoor/IIM-Jobs alerts + direct recruiter mail | Connect to Gmail over IMAP with an app password, scan the last N days, parse job title/company from the alert's subject line (and full body for digests). | IMAP/MIME, the "read the alert emails you already get" insight |

**Why this matters:** many portals (Naukri) sit behind bot-protection (Akamai) that blocks headless browsers at the CDN edge — I recognized that as a losing arms race and **rerouted**: I read Naukri's own alert emails over IMAP instead of fighting its defenses. Pragmatism over brute force.

**Fetching stack:** Node.js native `fetch()`, `AbortController` timeouts, low concurrency + jitter to stay polite, per-source `try/catch` so one failure never kills the run, Playwright/Chromium available for browser-mode fallback.

**The LinkedIn coverage fix (Task 1):** postings I saw on linkedin.com weren't reaching the portal because the fetcher only asked for the **last 24 hours** (`f_TPR=r86400`) with **one page** per city. I widened it to: no time-filter on core-city queries (LinkedIn's own relevance ranking, all ages) + **2 pages** each, added Noida/Delhi/remote + domain-flavored queries (payments/fintech/fraud/AI), per-query fail-soft, and I now re-enrich existing thin jobs each run. Result: LinkedIn coverage jumped from ~15 cards/run to **120+ unique postings/run** and the store's LinkedIn jobs went from ~296 to **362**.

---

## 4. The match score & confidence metric

**Scoring is a transparent weighted formula, not a black-box model** — deliberately, so every score is explainable and instantly tunable.

**Six factors (rich-JD weights):** Title fit 30% · Domain fit 25% · Skills overlap 15% · Location 15% · Experience-range fit 10% · Recency 5%. Each is scored 0–100 and the breakdown is shown in the UI.

**The confidence problem (Task 2) & fix:** LinkedIn cards often arrive with **no JD text**, so domain/skills/experience scored as 0 — which *systematically* dragged the same role ~20 points lower on LinkedIn than on a full-JD source. That's the "match % varies vs LinkedIn" issue. Fix:
- When a JD is thin, I **stop scoring what I can't see** and re-weight to what I can: **Title 50% · Location 25% · Recency 15% · Domain-from-title 10%.**
- Every score now carries a **confidence** label surfaced as a badge in the dashboard and email:
  - **High** — full JD analysed (≥1200 chars), all six factors scored.
  - **Medium** — partial JD.
  - **Low** — title + location only (no JD yet); shown as *"low confidence · title only."*
- Thin LinkedIn jobs get their JD **enriched** on the next run, then automatically re-scored to high confidence.

So the number you see is now honest about how much it actually knows.

---

## 5. Outputs (the deliverables)

- **Live dashboard** (`localhost:4321`) — search/filter/sort, match rings, confidence badges, per-factor breakdown, status pipeline (New → Shortlisted → Applied → Interview → Offer).
- **Installable PWA** (Vercel) — the same view from any device, password-gated, auto-refreshing.
- **Email digest** (every 3h) — new matches with confidence + suggestions + apply links, **plus AI-tailored CV drafts (.doc) attached** for the top matches.
- **Per-JD resume tailoring** — "Tailor my resume" rewrites my actual CV for a JD (truthful reorder/reword, never fabricated), editable, exportable as **PDF or Word (.doc)** named per company (Task 3).
- **Application packages** — tailored recruiter email + screening-question answers, queued for one-click send.
- **AI Interview Coach** — 579 questions across 9 rounds, per-company prep, "Complete answer" + "Evaluate my answer" via Claude/GPT-4o, speech I/O.

---

## 6. Tech stack (by layer)

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | **Node.js**, zero framework (raw `http`) | ~15 REST routes didn't justify Express; wrote the router/static-serving/body-parsing by hand |
| Storage | **Flat JSON files**, atomic write-temp-then-rename | Single user, ~1000 records — a DB would be premature infra |
| Fetching | Native `fetch`, `AbortController`, jitter, Playwright fallback | 4 integration patterns, fail-soft |
| Email | **imapflow** (read) + **mailparser** (MIME) + **nodemailer** (send) | One Gmail app-password powers inbox-scan, digests, and recruiter mail |
| Scoring | Hand-written weighted multi-factor + confidence | Explainable and tunable, not ML |
| AI | **Claude** (Anthropic) + **GPT-4o** (OpenAI), provider-agnostic streaming client | Server-side proxy (key in `.env`, default) or browser bring-your-own-key; SSE streaming |
| Resume export | Markdown → styled HTML → **PDF (Playwright)** / **Word (.doc)** | Copy-paste-ready drafts |
| Frontend | **Vanilla JS SPAs**, hash routing, no framework | Dashboard + coach, direct DOM + template strings |
| Speech | **Web Speech API** (recognition + synthesis) | Type-or-speak interview practice |
| Auth (PWA) | Custom **HMAC-SHA256** signed cookie | Single-password gate, no session store |
| Scheduling | **Windows Task Scheduler** | Cron-equivalent for a desktop-resident job |
| Deploy | **Vercel** — serverless functions + static hosting | Desktop does the heavy scan; Vercel hosts the portable/public pieces |

---

## 7. Limitations (honest — and good interview material)

- **Naukri isn't directly scraped** — Akamai Bot Manager blocks headless browsers at the CDN edge. Mitigation: read Naukri's alert emails over IMAP. (Real answer: reliable scraping would need a paid unblocker proxy — not worth it for one source.)
- **Portal endpoints are unofficial** — LinkedIn/Shine/foundit can change markup any time. Each fetcher is fail-soft and logs FAIL; a parser may occasionally need a tweak.
- **Scores are heuristic**, not an ATS — they rank and prioritize; a recruiter's parser may weigh differently. The confidence metric is exactly about being honest here.
- **No portal auto-submit** — deliberate. LinkedIn/Naukri ban bots that fill their forms; I stop at one-click apply to protect the accounts.
- **AI tailoring needs a key + human review** — truthful-rewrite-only prompt, and I always review before exporting the PDF.
- **Cross-device status sync on the PWA is per-device** (localStorage) — no shared DB by design.

---

## 8. Metrics that describe the system

- 20+ integrated sources across 4 integration patterns · 16 live ATS boards
- ~1000 postings tracked and re-scored every run
- LinkedIn coverage: **~15 → 120+** unique cards/run after the fix
- Full pipeline run: ~90–140s; serverless live-scan: ~2–4s
- Coach: **579 questions across 9 rounds** + 24 companies × 5 industries
- Confidence distribution (current store): ~60% high · ~26% medium · ~13% low

---

## 9. How I'd talk about this in an interview

**If asked "tell me about a project":** *"I built JobSearchOS end-to-end — a job-search automation platform I actually run for my own search. The interesting engineering is on ingestion: I integrate 20+ sources across four different patterns — documented APIs, reverse-engineered portal endpoints I found in browser network tabs, aggregator APIs, and IMAP inbox scanning of the job-alert emails I already receive. Everything's scored with a transparent weighted algorithm that carries a confidence level, because thin JDs shouldn't pretend to be high-confidence matches. I made deliberate product calls too — no auto-apply bots because portals ban them, and truthful-rewrite-only for AI resume tailoring."*

**Best debugging war-stories to tell:**
- **Naukri/Akamai** — hit CDN-level bot detection, recognized the losing arms race, rerouted to reading their emails. *(Judgment > brute force.)*
- **LinkedIn coverage gap** — jobs visible on the site weren't reaching the portal; root-caused it to a 24h time-filter + single-page query, widened the query matrix and added JD-enrichment. *(Systematic root-cause on a "missing data" bug.)*
- **The confidence metric** — realized thin-JD jobs were being unfairly under-scored ~20 pts, re-weighted to only-what-we-can-see and surfaced a confidence label. *(Turning a data-quality flaw into an honest UX signal.)*
- **Windows Task Scheduler PATH / stuck-process / PowerShell newline / IMAP uid bugs** — a set of "looked fine, wasn't" environment bugs that took real diagnosis.

---

## 10. Model PM interview questions (practice on this project)

**On the product itself:**
1. What's the North-Star metric for JobSearchOS, and the guardrail?
2. How would you measure whether the match algorithm is actually good?
3. Walk me through the build/buy decision on scraping vs a paid aggregator.
4. How would you productize this for other job-seekers? What changes at 10k users?
5. The confidence metric — how would you validate it's calibrated?
6. Where does AI add real value here vs. where is it a gimmick?

**Classic PM rounds (all practiced in the Coach):**
- **Product design:** "Design a job-search product for someone employed and job-hunting quietly."
- **RCA:** "Applications-submitted dropped 20% this week — investigate." *(Same MECE cause-tree method the pipeline debugging used.)*
- **Metrics:** "You launched resume-tailoring. What metrics prove it works?"
- **Estimation:** "Estimate the number of PM job postings in India per month."
- **Strategy:** "Should a job board build its own AI resume tool or partner?"
- **Behavioural:** "Tell me about a time you cut scope deliberately." → the no-auto-apply decision.

---

## 11. Incorporating n8n to streamline the flow

**n8n** is an open-source, self-hostable workflow-automation tool (visual nodes, cron triggers, HTTP + Gmail + branching). It's a natural fit to **replace the bespoke scheduler + orchestrator glue** with a visual, observable pipeline — great to show as "I can build this with code *and* with low-code automation."

**Target n8n workflow (one flow, runs every 3h):**

1. **Cron trigger** (every 3 hours) — replaces Windows Task Scheduler.
2. **HTTP Request nodes (parallel)** — one per source (Greenhouse/Lever/Ashby/LinkedIn/Shine/foundit/RemoteOK/Remotive). n8n fans these out natively.
3. **Gmail node** — read job-alert emails (n8n has a native Gmail trigger/read node — no IMAP code).
4. **Merge + Code node** — dedupe + normalize into the common job schema (reuse the same JS logic).
5. **HTTP Request → my scoring endpoint** (or an inline Code node running `score.js`) — attach match % + confidence.
6. **Filter node** — keep score ≥ threshold.
7. **HTTP Request → Anthropic** — tailor CV + generate suggestions for top matches.
8. **Gmail Send node** — email the digest with the CV drafts attached.
9. **HTTP Request → Google Sheets / Notion / Postgres node** — persist the job store (n8n has native nodes for all three — this also solves cross-device sync for free).
10. **(Optional) Slack/Telegram node** — instant push for a ≥85% match.

**Why n8n here (the pitch):** it turns the pipeline into a **visual, monitored, retry-able** flow — every run shows which source failed and why, retries are built-in, and swapping the store to Postgres/Notion is a node change, not a code change. The trade-off: the reverse-engineered LinkedIn/Shine parsing still needs a Code node (n8n can't magically bypass bot-protection), and self-hosting n8n is one more service to run. I'd keep the scraping/parsing as reusable Code nodes and let n8n own scheduling, fan-out, branching, retries, persistence, and notifications.

*(An importable starter workflow is included in the repo at `n8n/jobsearchos-workflow.json`.)*

---

*Built solo, end-to-end — ingestion, scoring algorithm, AI integration, two SPAs, scheduling, and deployment — with AI-assisted implementation throughout. Live code: github.com/RajDiptanshu/jobsearch-os*
