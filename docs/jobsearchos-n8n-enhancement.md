# Enhancing JobSearchOS with n8n — Build Plan + Interview Showcase

> How to layer **n8n** (open-source workflow orchestration) on top of JobSearchOS to turn a
> desktop script into an observable, agentic, human-in-the-loop automation system — and how to
> **demo it in an interview** so it reads as senior AI-PM judgment, not a hobby hack.

---

## 1. The PM framing: *why* n8n (say this first)

Today the pipeline is strong but coupled: a **Windows Task Scheduler** cron fires `pipeline/run.js`,
which does scheduling, integration, scoring, LLM drafting, and email — all in code, on a machine that
has to be on. That's fine for v1, but it hides three things an interviewer cares about:

- **Observability** — when a run fails at 3am, I don't see it.
- **Human-in-the-loop** — "review queue in the app" is passive; nothing pulls *me* into the decision.
- **Extensibility** — adding a new channel (Slack, Telegram, Notion, Sheets) means writing another integration.

n8n fixes all three by becoming the **orchestration layer**: it owns scheduling, fan-out, retries,
approvals, and 400+ native integrations, while my code keeps owning what it's *good* at — the
**explainable scoring logic**. That separation (orchestrator vs. domain logic) is itself the point I'm
making: *I know which layer should own which responsibility.*

> One-liner for the room: **"I kept my scoring engine as code because it's my core IP and needs to be
> explainable, and I moved orchestration to n8n because scheduling, retries, approvals, and integrations
> are a solved problem I shouldn't be hand-rolling. n8n is the conductor; my pipeline is the instrument."**

---

## 2. Target architecture

```
        ┌──────────────────────────── n8n (orchestration) ────────────────────────────┐
        │  Schedule Trigger (every 3h)                                                  │
        │      │                                                                        │
        │      ▼                                                                        │
        │  HTTP → JobSearchOS scan endpoint  ──►  returns fresh, scored postings        │
        │      │                                   (my code still owns scoring)         │
        │      ▼                                                                        │
        │  Filter: score ≥ 80  ──►  Split into items                                    │
        │      │                                                                        │
        │      ▼                                                                        │
        │  AI Agent node: draft tailored recruiter email + "why fit" from JD + profile  │
        │      │                                                                        │
        │      ▼                                                                        │
        │  Telegram: "Strong match at ▢. Send this draft?"  [Approve] [Skip]  ◄── ME    │
        │      │ approved                    │ skipped                                   │
        │      ▼                             ▼                                           │
        │  Send email + HTTP → mark      HTTP → mark "Skipped"                           │
        │  "Applied" in JobSearchOS                                                      │
        │                                                                               │
        │  ── Error Trigger workflow ──►  Telegram alert on ANY failure (observability)  │
        └───────────────────────────────────────────────────────────────────────────────┘
                  │ my Node pipeline is now a set of callable HTTP endpoints
                  ▼
        server.js  (scoring, suggestions, status pipeline, data store)  ← unchanged core
```

The refactor to enable this is small and worth naming: expose the pipeline's stages as **HTTP endpoints**
(`/api/scan`, `/api/mark-status`) so n8n can call them. You already have a serverless live-scan endpoint —
this is the same idea, generalized.

---

## 3. Workflows to build (each maps to a product capability *and* an interview point)

| # | Workflow | What it does | What it demonstrates |
|---|---|---|---|
| **1** | **Scheduled AI triage + approval** *(flagship)* | Cron → scan → filter → AI-draft → **Telegram approve/skip** → send + status-sync | Agentic automation *with* human-in-the-loop guardrail |
| **2** | **Error/observability workflow** | n8n Error Trigger → Telegram/email alert with node + payload | Production ops maturity, not just happy-path |
| **3** | **Multi-channel digest** | Schedule → format top matches → fan out to Email + Telegram + Notion/Sheets | Integration breadth without new code |
| **4** | **Inbound JD capture** | Webhook / email trigger → parse a JD I forward → score → reply with tailored resume gaps | On-demand, event-driven (vs. only scheduled) |
| **5** | **Interview-stage automation** | Status → "Interview" fires calendar hold + auto-generates a prep doc from the coach bank | Closes the loop find→prep→apply→**interview** |
| **6** | **Semantic evidence match (RAG upgrade)** | Embed JD + evidence bank into a vector store node; match by meaning, not tag overlap | Evolves the "why not ML" story into "when ML earns its place" |

**Build order for interview readiness:** #1 and #2 first (they're the demo), then #3. #4–#6 are the
"here's my roadmap" answer — you don't have to build them to talk credibly about them.

---

## 4. The flagship workflow in detail (Workflow #1)

This is the one to actually build and screen-record, because it hits every AI-PM theme in ~8 nodes.

1. **Schedule Trigger** — every 3 hours (replaces Task Scheduler; now cloud-hostable, no "PC must be on").
2. **HTTP Request → `GET /api/scan`** — calls JobSearchOS; my code returns freshly scored postings. *Scoring stays mine.*
3. **Code / Filter** — keep `score ≥ 80`, shape `{title, company, jd, score, breakdown}` per item.
4. **AI Agent (LLM) node** — prompt: *"Given this JD and my profile/evidence bank, draft a tailored recruiter email and 3 bullets on why I fit. Cite the specific JD requirements you're matching."* Output constrained to a fixed shape.
5. **Telegram → Send and Wait for Response (Approval)** — pushes me the draft + `[Approve] [Skip]` buttons. **Nothing goes out without my tap.**
6. **IF approved** →
   - **Send email** (SMTP/Gmail node) to the recruiter, and
   - **HTTP Request → `POST /api/mark-status`** = `Applied` (keeps the app's pipeline the source of truth).
7. **Else** → **HTTP Request → `POST /api/mark-status`** = `Skipped` (so it won't resurface).
8. **Error Trigger workflow** (separate) → Telegram alert on any failure, with the failing node and payload.

Why this is the demo: it's **agentic** (autonomously scans, filters, drafts) but **guarded**
(human approves before anything irreversible), **observable** (errors page me), and **integrated**
(scoring API + LLM + Telegram + email + status sync) — the exact profile of a well-designed AI feature.

A ready-to-import **starter scaffold** of this workflow is in `n8n/ai-job-triage-approval.workflow.json`
(import into n8n, then wire your own credentials + endpoint URLs — see that file's header notes).

---

## 5. How to showcase it in the interview

**Structure the story as an upgrade, not a rebuild** — that shows iteration and judgment:
> "v1 was a cron job on my desktop. It worked, but it was invisible when it failed and it made *me* go
> check a queue. So I re-architected the orchestration onto n8n and kept my scoring engine as the
> callable core. Now it scans, an AI drafts the outreach, and it *taps me on the shoulder* on Telegram
> to approve before anything sends — with errors paging me automatically."

**The three things to make them see:**
1. **Separation of concerns** — "orchestration on n8n, IP (scoring) in my code." Senior signal.
2. **Human-in-the-loop as a designed guardrail** — the Telegram approval *is* the responsible-AI story. You automated everything *up to* the irreversible step, and deliberately stopped there.
3. **Observability** — the error workflow. Most people demo the happy path; you demo the 3am failure.

**The demo itself (2 minutes, highest impact):**
- Screen-record or live-open the n8n canvas — the **visual DAG is the artifact**; it reads instantly.
- Trigger a run; show the Telegram message with Approve/Skip arriving on your phone.
- Tap Approve; show the email queued/sent and the status flipping to "Applied" in the dashboard.
- Bonus: force an error and show the alert fire.
- Close with the canvas again: "This is the whole system on one screen — that legibility is *why* I chose a workflow tool over more code."

**Deliberately keep the human in the loop when they push you to full-auto** — "Why not just auto-send?"
is bait. Answer: *"Because outbound recruiter emails are irreversible and reputation-bearing. I automated
the 95% that's safe — scanning, scoring, drafting — and put a human gate on the 5% that isn't. Going
hands-off is one node away, but the right default is approve-first."*

---

## 6. Likely interview questions (with answers)

1. **"Why n8n and not just more code / Zapier / Airflow?"**
   Zapier is closed and per-task-priced and can't self-host near my data; Airflow is heavyweight Python DAGs — overkill for this. n8n is open-source, self-hostable (my job-search data stays mine), visual (the workflow *is* the documentation), and has native AI-agent + human-approval nodes. It's the right weight for the problem — same "don't over-build" instinct as choosing flat files over Postgres in v1.

2. **"Isn't a visual tool less powerful than code?"**
   For orchestration, the visual DAG is an *asset* — anyone can read the flow, and I still drop to a Code node for anything custom. I moved *orchestration* to n8n, not my *logic*. Right tool per layer.

3. **"What did you have to change in JobSearchOS to make this work?"**
   Exposed the pipeline stages as HTTP endpoints (`/api/scan`, `/api/mark-status`) so n8n can call them and the app stays the source of truth. Small, clean seam — and it made the core more testable as a side effect.

4. **"How do you handle failures / partial runs / duplicate sends?"**
   Error Trigger workflow pages me; HTTP calls have retry-on-fail; and status is written back to the app immediately on send so a re-run can't double-email (idempotency via the status field). I can show the error path, not just claim it.

5. **"Where's the AI, really — is it just calling an LLM?"**
   The LLM does the *language* work (tailored drafting) inside a governed workflow: grounded on my JD + evidence bank, output-shaped, and gated by human approval. The "AI product" isn't the model call — it's the *system* around it: what triggers it, what grounds it, what checks it, what it's allowed to do unattended. That system design is the PM work.

6. **"How would you scale or productize this for other job seekers?"**
   n8n workflows become per-user templates; the approval channel becomes configurable (Telegram/Slack/email); the scan endpoint goes multi-tenant. The orchestration layer barely changes — which is the payoff of having separated it out.

7. **"What's the risk of agentic automation here and how do you contain blast radius?"**
   The irreversible action (sending outreach) is the only gated step; everything reversible runs unattended. Rate caps + approve-first default bound the worst case to "an email I personally approved." That's deliberate blast-radius design.

---

## 7. CV bullet updates (once you've built Workflow #1)

Add to the JobSearchOS block, or use to refresh it:

- Re-architected the automation layer onto **n8n**, separating orchestration (scheduling, retries, integrations, approvals) from the explainable scoring engine — turning a desktop cron script into an **observable, cloud-hostable workflow system**.
- Built an **agentic job-triage workflow with a human-in-the-loop approval gate**: scans and scores postings, has an LLM draft tailored outreach, and requests one-tap **Telegram approval** before any irreversible send — with an error-alerting workflow for production observability.
- Designed the AI feature as a *governed system* — grounded prompts, shaped output, human approval on irreversible actions, and status write-back for idempotency — not a bare model call.

**One-line résumé-summary reinforcement:**
> "...ships AI as *governed systems* — grounded, human-in-the-loop, observable — using orchestration
> (n8n) over hand-rolled glue where it's the right tool."

---

## 8. Build checklist (do this to make it real)

- [ ] Self-host n8n (Docker one-liner) or use n8n Cloud free tier.
- [ ] Add `/api/scan` and `/api/mark-status` endpoints to `server.js` (thin wrappers over existing pipeline stages).
- [ ] Import `n8n/ai-job-triage-approval.workflow.json`; set credentials (LLM key, Telegram bot, SMTP) and your endpoint base URL.
- [ ] Add the LLM node's grounding: pass profile/evidence-bank context into the draft prompt.
- [ ] Build the Error Trigger workflow (2 nodes: Error Trigger → Telegram).
- [ ] Screen-record the end-to-end run (scan → Telegram approve → sent → status flip) for the interview.
- [ ] Take one screenshot of the n8n canvas — that image goes in your portfolio/deck.
