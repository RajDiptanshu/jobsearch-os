# JobSearchOS — CV Entry + PM Interview Playbook

> Positioning **JobSearchOS** (the self-built job-discovery + interview-prep platform) as a flagship
> **0→1 AI Product Manager** project: "how I automated my own job hunt."

Why this is a great AI-PM story: it's a product *you scoped, built, shipped, and use daily* — with
real prioritization, deliberate scope cuts, trust/ethics guardrails, and an explainability-over-black-box
decision. That's exactly the judgment AI PM interviews probe. Two live demos back it up.

---

## 1. CV bullet points

Pick 2–4. They descend outcome → build → judgment, so trim from the bottom.

**Project block (recommended):**

> **JobSearchOS — self-built AI job-discovery & interview-prep platform** *(personal, 2025 · [live demos])*
> - Designed and shipped, solo and end-to-end, an automation system that pulls postings from **20+ sources across 4 integration patterns** (public ATS APIs, reverse-engineered portal endpoints, aggregators, and **IMAP inbox scanning** of job-alert emails) every 3 hours — turning a manual multi-tab daily grind into a push system.
> - Built a **transparent multi-factor matching engine** that scores 400+ live postings 0–100% on title/domain/skills/location/experience/recency, with a per-factor breakdown in the UI — deliberately a tunable formula, **not a black-box model**, so every match is explainable.
> - Shipped an **AI application-prep layer**: per-JD resume-tailoring suggestions (missing ATS keywords pulled from the JD, best achievement matched from a tagged evidence bank) and auto-generated application packages (recruiter email + screening answers), queued for one-click send.
> - Added a **500-question interactive interview coach** (SPA with speech I/O and self-scoring, optional Claude-API grading) — a live, public demo used daily.
> - Made explicit product trade-offs: **no auto-apply bots** (account-ban risk), opt-in/rate-capped recruiter emails, and a sanitized public snapshot that never exposes personal data.

**Headline single-liner (if space is tight):**
- Built **JobSearchOS**, an AI-assisted platform that scrapes 20+ job sources, scores every posting with an explainable matching engine, auto-drafts tailored applications, and includes a 500-question interview coach — shipped solo, end-to-end, with two live deployments.

**Alternate framings (match to the JD):**
- *AI/GenAI-led:* "Shipped an AI-assisted job platform — LLM-drafted tailored applications and rubric-graded interview coaching — with explainable, human-in-the-loop scoring rather than an opaque model."
- *0→1 / builder-led:* "Took a personal product from problem to two live deployments solo: pipeline, scoring algorithm, 8+ source integrations, scheduling automation, two frontend SPAs, and serverless deployment."
- *Systems-led:* "Architected a hybrid desktop+serverless pipeline (fetch→dedupe→score→suggest→generate→email) integrating 20+ heterogeneous sources into one normalized job model."

---

## 2. Interview talking points

### Problem statement (~30 seconds)
Job boards make you *pull* — you babysit five tabs, re-search the same queries daily, and still miss things. I wanted something that *pushes*: continuously watch the market, tell me the moment something fits, tell me **why** it fits, and tell me exactly what to change on my resume for that specific JD. Nothing off-the-shelf did all four — **find → prep → apply-prep → track** — in one place, so I built it.

### User & user flow
**User:** me (single-user by design — that shaped real architecture calls). The pipeline: **Find → Match → Prep → Apply → Track.**
1. **Find:** every 3 hours, pull fresh postings from 20+ sources.
2. **Match:** score each posting 0–100% with a visible per-factor breakdown.
3. **Prep:** for a given JD, surface missing ATS keywords + the strongest achievement to lead with.
4. **Apply:** for strong matches, auto-generate a tailored recruiter email + screening answers, queued for one-click send.
5. **Track:** move postings through a status pipeline (New → Shortlisted → Applied → Interview → Offer).
Plus a standalone **interview coach** SPA for practice.

### Pain points it removes
- **The pull tax:** manual daily searching across many boards → one push feed.
- **Opaque relevance:** "why is this a match?" answered with a transparent score, not a guess.
- **Generic applications:** per-JD keyword gaps + evidence matching → tailored, not copy-paste.
- **Context loss:** a single tracked pipeline instead of a spreadsheet + memory.

### Tech stack & architecture (know this cold)
Orchestrator: `pipeline/run.js` → **fetch → dedupe → enrich → score → suggest → generate → email**.
- **Backend:** Node.js, **zero framework** (raw `http`) — ~10 routes didn't need Express; wrote routing, static serving, JSON parsing directly.
- **Storage:** flat JSON files with **atomic writes** (write-temp-then-rename) — a DB would be premature for a single-user, hundreds-of-records tool.
- **Integrations:** native `fetch()` against documented APIs (Greenhouse/Lever/Ashby) *and* reverse-engineered ones (Shine, foundit, LinkedIn guest endpoint) read off browser network tabs; normalized 8+ schemas into one job model.
- **Email:** imapflow (read inbox alerts) + mailparser + nodemailer (send digests/recruiter mail) — one Gmail app password, three jobs.
- **Scoring:** hand-written weighted multi-factor formula — chosen over ML *on purpose*, for explainability + tunability without retraining.
- **Frontend:** two vanilla-JS SPAs (dashboard + coach), hash routing, `localStorage`; **Web Speech API** for type-or-speak practice.
- **Auth:** custom **HMAC-SHA256** signed cookie (single-password gate), no library/session store.
- **Automation:** Windows Task Scheduler (cron-equivalent) via `.cmd`/`.vbs` entry points.
- **Deployment:** hybrid — desktop runs the deep 20-source scan; **Vercel** serverless + static hosts the public/portable pieces; **PWA** (manifest + network-first service worker) makes the dashboard installable.
- **AI-assist:** Claude API, **bring-your-own-key, browser-direct** — coach grades answers against a rubric only if the user supplies a key; never required, never server-proxied.

### Metrics / scale
- 20+ sources · 4 integration patterns · 16 ATS boards monitored · 400+ postings re-scored per run.
- Full pipeline ~30–140s; serverless live-scan ~2–4s.
- 500-question bank across 5 categories, each backed by a reusable framework (not 500 hardcoded scripts).

---

## 3. Likely interview questions (with how to answer)

**AI-PM / product-judgment — where you win the label:**

1. **"Why a hand-written scoring formula instead of an ML model?"**
   Explainability and control. As the user, I need to see *why* a job scored 62% (title vs domain vs skills…), and I need to re-tune weights instantly without labeled data or retraining. For a single-user tool, an ML model would add opacity and infra cost for no accuracy I could act on. I treat "use ML" as a decision to justify, not a default — and here a transparent formula was the right call. If I scaled to many users with behavioral feedback (which jobs they actually applied to), *that* signal would justify a learned ranker.

2. **"Where does the AI/LLM actually add value vs. where did you deliberately not use it?"**
   LLM earns its place in *language* tasks: drafting tailored recruiter emails, screening-question answers, and grading interview responses against a rubric. It's deliberately kept *out* of matching/ranking (needs to be explainable) and out of any auto-submission. That "what not to automate" line is the product decision.

3. **"Why did you decide *not* to auto-apply on portals?"**
   LinkedIn/Naukri detect and ban automated form submissions. Automating the final click risked the exact account I need for the job hunt — a bad risk/reward. So the system stops at "one click to apply." It's a deliberate scope cut framed as a guardrail, not a missing feature — which is the kind of judgment that separates shipping from over-building.

4. **"How do you handle trust/privacy given real personal data?"**
   The public web companion *never* sees real data — a build step strips compensation, phone, recruiter emails, and application content before anything publishes to Vercel; people view a sanitized snapshot. Auto-emailing recruiters is opt-in, rate-capped, and off by default, because blindly emailing at a 50%-match threshold could hurt my own reputation. Safe defaults, explicit opt-in for anything irreversible.

5. **"How would you evaluate whether the matching is any good?"**
   Precision at the top of the feed: of the postings it scored 80%+, how many did I actually shortlist/apply to? That applied-vs-scored gap is a cheap real-world signal I can log. I'd watch for false negatives too (good jobs it under-scored) by periodically reviewing the 50–70% band. Weight-tuning is then a measured loop, not a vibe.

6. **"How would this scale from one user to many?"**
   Three changes: flat JSON → a real datastore (per-user isolation); the single Gmail credential → OAuth per user; and the static formula → a per-user learned ranker trained on their apply behavior. I'd also move scanning fully serverless with a queue instead of the desktop scheduler. I designed v1 *for one user on purpose* — that's why flat files and a hardcoded scheduler were correct then, and what I'd change is clear.

**Classic PM / engineering-judgment questions:**
7. "Biggest thing that broke and what you learned?" → Naukri blocked headless Chromium at the Akamai edge even with stealth patches. Rather than an unwinnable proxy arms race for one source, I pivoted — Naukri now arrives via its own email alerts read over IMAP. *Recognizing a losing trade and re-routing is the lesson.*
8. "How did you prioritize scope?" → Ruthless single-user cuts: no DB, no framework, no auth library, no portal auto-apply. Each is defensible by the constraint (one user, ~10 routes, hundreds of records).
9. "Why zero-framework Node / flat files — isn't that naive?" → Deliberate. ~10 routes and hundreds of records don't need Express or Postgres; picking them would be résumé-driven over-engineering. I can articulate *what a framework abstracts*, which is stronger than importing one by reflex.
10. "How is the interview coach different from 500 hardcoded Q&As?" → Each question routes through a reusable step-by-step *framework* by category, so it teaches the method, not an answer key — and it's extensible without hand-writing 500 scripts.

---

## 4. How to present yourself as an *AI* Product Manager

The signal isn't "I used AI." It's that you made **crisp decisions about where AI belongs, where it doesn't, and how you'd know if it's working** — and you shipped it.

**Positioning line:**
> "I don't just spec AI features — I ship them. JobSearchOS is a product I scoped, built, and use daily: I decided where an LLM earns its place, where an explainable formula beats a model, and where automating the last step was the *wrong* call. That's the judgment I bring as an AI PM."

**Emphasize, in order:**
1. **You shipped 0→1, solo** — pipeline, scoring, integrations, two SPAs, deployment. Two live demos. Rare and credible.
2. **You made the model-vs-rules call consciously** — explainable formula for ranking, LLM for language. AI PMs know what *not* to modelize.
3. **You designed guardrails** — no auto-apply, opt-in recruiter mail, sanitized public data. Trust and blast-radius thinking.
4. **You can talk evaluation** — precision-at-top-of-feed, applied-vs-scored gap, the 50–70% false-negative band.
5. **You pivot on evidence** — the Naukri→IMAP war story shows you cut losing bets instead of sinking cost.
6. **You have a scale story** — exactly what changes at N users and why v1's "naive" choices were correct for one user.

**90-second STAR opener:**
- **S:** "Job boards make you pull — five tabs a day, re-running the same searches, still missing roles."
- **T:** "I wanted a system that pushes: find, tell me *why* it fits, tell me what to change on my resume, and track it — in one place."
- **A:** "I built JobSearchOS solo — 20+ sources across 4 integration patterns into one normalized model, an *explainable* multi-factor scorer, and an LLM layer that drafts tailored applications and grades interview practice. I deliberately kept the LLM out of ranking and refused to auto-submit on portals."
- **R:** "It runs every 3 hours, re-scores 400+ postings, and it's what I actually use — with two live demos, including a public interview coach."

**Traps to avoid:**
- Don't oversell it as a scalable SaaS — its power *is* the deliberate single-user scoping. Own that; it reads as maturity, not limitation.
- Don't lead with the tech stack — lead with the problem and the *decisions*. The "why not ML / why not auto-apply" answers are your differentiators.
- Don't hide that implementation was AI-assisted (Claude) — frame it as an AI PM *using AI to build AI*, which is exactly the modern PM skill they're screening for. The product judgment is yours.

**Demo tip:** in-interview, open the public interview coach link and the dashboard PWA. A working thing you can click beats any slide.
