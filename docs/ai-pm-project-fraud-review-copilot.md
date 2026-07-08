# AI Fraud-Review Copilot — CV Entry + PM Interview Playbook

> Positioning the GPT-4o fraud-review assistant (Fareportal) as your flagship **AI Product Manager** project.

A quick note before the content: this assistant is currently in a **live trial**, so
lead with the *process, decisions, and early signals* — not final ROI you can't yet defend.
That is exactly what AI PM interviewers probe. Honest framing ("in trial, early results show…")
is more credible than inflated outcomes and protects you if they dig.

---

## 1. CV bullet points

Pick 2–4 depending on how much room you have. They move from outcome → build → AI-craft, so you can trim from the bottom.

**Headline version (single bullet, if space is tight):**
- Built and shipped a **GPT-4o fraud-review copilot** that consolidates conflicting signals from 4 fraud vendors (Forter, Accertify, MaxMind, Ekata) into one plain-language recommendation with cited evidence — now in live trial with reviewers, targeting **>50% cut in per-case review time**.

**Full project block (recommended):**

> **AI Fraud-Review Copilot — GPT-4o decision-support for human reviewers** *(Fareportal, 2025)*
> - Identified that manual fraud review was the bottleneck in the decisioning funnel — reviewers hopped across **4 vendor dashboards** to reconcile conflicting risk signals, driving slow, inconsistent approve/deny calls; scoped and shipped an LLM copilot to compress that.
> - Designed a **GPT-4o assistant** that ingests multi-vendor signals + booking context and returns a single **plain-language recommendation with the evidence it's based on**, so reviewers decide faster without losing auditability.
> - Ran the model in **shadow mode** against historical reviewer decisions before any user saw it, using agreement rate and false-negative leakage as go/no-go gates — then rolled out to a **live reviewer trial** targeting **>50% lower per-case review time**.
> - Owned the full AI product loop as PM: problem framing, prompt design, RAG over policy/case history, human-in-the-loop guardrails (reviewer always makes the final call), eval harness, and success metrics.

**Alternate framings (swap in based on the JD):**
- *Efficiency-led:* "Cut fraud-review handling time by consolidating 4 vendors' signals into one GPT-4o recommendation — freeing reviewer capacity for high-value manual cases."
- *Trust/safety-led:* "Shipped an LLM copilot with human-in-the-loop guardrails and shadow-mode evaluation, keeping the human reviewer as the accountable decision-maker while GPT-4o handled synthesis."
- *0→1-led:* "Took an AI decision-support product from problem discovery to live trial — defined the eval strategy, guardrails, and rollout gates for an LLM feature in a high-stakes fraud domain."

---

## 2. Interview talking points

### Problem statement (say this in ~30 seconds)
Fareportal is a high-volume global travel marketplace. When a booking is flagged as risky, a **human fraud reviewer** has to make the final approve/deny call. To do that they pull signals from **multiple fraud vendors** — Forter, Accertify, MaxMind, Ekata — each with its own score, reason codes, and dashboard. These signals often **disagree** (one says high-risk, another says clean). The reviewer becomes a manual signal-aggregator: reconciling conflicting inputs under time pressure. That made review **slow, inconsistent between reviewers, and hard to scale** as volume grew — and it was the tightest bottleneck in a decisioning flow I already owned end-to-end.

### The insight / why AI
The task wasn't *deciding* — reviewers are good at that. It was **synthesis**: reading five sources and writing the one-paragraph "here's what's going on" that a decision hangs on. That's a language task LLMs are genuinely good at, and it's a **decision-support** use case (assist, don't automate) — which keeps a human accountable in a high-stakes, chargeback-exposed domain. That framing is the whole pitch: *narrow, augmentative, auditable.*

### User & user flow
**Primary user:** the fraud review analyst. **Secondary stakeholders:** risk ops leadership (accuracy/coverage), finance (chargeback exposure), and the customer (booking not wrongly cancelled).

Before → after:
1. **Before:** case lands in queue → reviewer opens 4 vendor dashboards → mentally reconciles scores + reason codes → checks booking/customer history → writes a call → approve/deny.
2. **After:** case lands in queue → copilot has already pulled and consolidated all vendor signals + booking context → reviewer sees **one plain-language summary + a recommendation + the evidence/citations behind it** → reviewer confirms or overrides → decision logged (including overrides, which feed evaluation).

Key design choice: the reviewer **still makes the final call**. The copilot compresses the reading, not the deciding.

### Pain points it removes
- **Context-switching tax:** 4 dashboards → 1 view.
- **Signal conflict:** the model explains *why* signals disagree instead of leaving the reviewer to guess.
- **Inconsistency:** a shared, explained baseline reduces reviewer-to-reviewer variance.
- **Speed:** target >50% reduction in per-case time, which grows effective review capacity without headcount.
- **Onboarding:** newer reviewers get an experienced-reviewer-style summary from day one.

### Tech stack & architecture (know this cold)
- **Model:** GPT-4o — chosen for strong reasoning + structured/plain-language output and low latency for an interactive queue; no PII fine-tuning needed for a synthesis task.
- **Retrieval (RAG):** vendor signals, reason-code glossaries, internal fraud policy, and similar past cases retrieved and injected into context so the model reasons over *our* data and policy, not just its training.
- **Prompt design:** structured system prompt that forces a fixed output shape — recommendation, confidence, the specific signals cited, and caveats — so output is scannable and auditable.
- **Guardrails / human-in-the-loop:** advisory only; reviewer confirms/overrides; no auto-actioning of bookings.
- **Evaluation:** **shadow mode** first — model ran silently against historical decisions; measured agreement with reviewers and, critically, **false-negative leakage** (cases it would wave through that were actually fraud) before any live exposure.
- **Rollout:** phased live trial with a subset of reviewers; override rate and time-per-case tracked as the real-world metrics.
- **Adjacent stack you own:** decisioning rules engine, 3DS/SCA, vendor scoring APIs, SQL/Power BI for analysis.

### Metrics
- **North star:** per-case review time (target >50% reduction).
- **Guardrail (must-not-regress):** fraud catch rate / false-negative leakage — speed can't cost coverage.
- **Adoption/quality:** reviewer override rate (too high = not trusted; near-zero = automation bias risk), agreement rate in shadow mode.
- **Downstream:** review-queue throughput, and eventually chargeback rate on copilot-assisted decisions.

---

## 3. Likely interview questions (with how to answer)

**AI-PM-specific — these are where you win or lose the "AI PM" label:**

1. **"How did you handle hallucination in a high-stakes domain?"**
   Three layers: (a) RAG grounds it in actual vendor signals + policy so it isn't inventing facts; (b) the output must **cite the specific signals** it used, so a reviewer can verify in seconds; (c) it's **advisory** — a human confirms every call, so a bad summary is caught, not actioned. I treated hallucination as a UX + workflow problem, not just a model problem.

2. **"Why GPT-4o and not a fine-tuned or smaller/open model?"**
   The task is synthesis + explanation, not classification, so prompt+RAG beat fine-tuning on time-to-value and maintenance. GPT-4o gave the reasoning quality and latency the interactive queue needed. Fine-tuning/distillation to a cheaper model is a *phase 2* once trial data shows the stable prompt and volume justify the cost — I'd frame it as a cost/latency optimization, not a day-1 need.

3. **"How did you evaluate it before trusting it?"**
   Shadow mode against historical labeled decisions before any reviewer saw output. Primary gate wasn't raw accuracy — it was **false-negative leakage** (fraud it would approve), because in fraud a confident-but-wrong "approve" is far more expensive than a slow review. Only after that cleared did we go to a phased live trial with override tracking.

4. **"What's your biggest risk and how do you mitigate it?"**
   **Automation bias** — reviewers rubber-stamping the recommendation and override rate collapsing to zero, which quietly re-introduces the model's errors as decisions. Mitigations: surface *evidence not just verdict*, monitor override rate as a health metric (not just efficiency), and periodically inject known-hard cases to keep reviewers engaged.

5. **"Speed vs. accuracy — how do you trade off?"**
   I don't trade catch-rate for speed. Coverage is a guardrail metric that must not regress; speed is the goal metric. If the copilot sped things up but leaked fraud, that's a fail regardless of the time saved.

6. **"How do you measure success for an AI feature that's assistive?"**
   Goal metric (time-per-case) + guardrail (catch-rate/leakage) + trust signal (override rate in a healthy band) + adoption. I explicitly avoid a single vanity metric because assistive AI can look great on speed while silently degrading decisions.

7. **"What would you do differently / what's next?"**
   Build a tighter feedback loop from overrides into prompt/RAG improvements; A/B the copilot on the guardrail metric, not just speed; explore cost-optimizing the model once the prompt stabilizes; expand from summary to suggested next actions (still human-confirmed).

**Classic PM questions to be ready for:**
8. "How did you prioritize this over other roadmap items?" → It sat on the critical path of a funnel I owned; review was the bottleneck; assistive AI was low-blast-radius (human-in-loop) with high upside.
9. "Who did you have to align, and how?" → Risk ops (accuracy fears), reviewers (job-threat fears — I framed it as removing grunt work, not replacing them), leadership (ROI), legal/compliance (auditability).
10. "How did you de-risk reviewer pushback?" → Involved reviewers in defining the output format; positioned as a copilot; shadow mode meant zero disruption during validation.
11. "What did you cut from scope?" → Auto-actioning, multi-language, and model fine-tuning — all deferred to keep v1 narrow and safe.

---

## 4. How to present yourself as an *AI* Product Manager

The difference between "a PM who used ChatGPT" and an **AI PM** is that you can talk fluently about **evaluation, guardrails, human-in-the-loop design, and the model-selection trade-off.** Lead with those, not with the model name.

**Your positioning line:**
> "I'm a PM who ships AI into a high-stakes, money-and-fraud domain — where you can't just 'trust the model.' My edge is designing the guardrails, evaluation, and human-in-the-loop workflow that make an LLM safe to put in front of decision-makers."

**What to emphasize (in priority order):**
1. **You framed the AI use case correctly** — a narrow synthesis task, assistive not autonomous. Good AI PMs know *what not to automate.*
2. **You built an evaluation strategy** — shadow mode, leakage as the gate. This is the single most credible signal of AI PM maturity.
3. **You designed for trust** — citations, human confirmation, override tracking. Shows you think about adoption and failure modes, not just the demo.
4. **You understand the trade-off space** — prompt+RAG vs fine-tune, GPT-4o vs cheaper model, speed vs coverage — and you can say *why* you chose each, with a phase-2 view.
5. **You tie it to business** — it lives inside a fraud/payments P&L you already own ($124K vendor savings, 30% fewer fraud cancellations). AI wasn't a science project; it was a lever on a funnel.

**How to open the story in an interview (STAR, ~90 sec):**
- **S:** "I own fraud decisioning at a high-volume travel marketplace. The bottleneck was human review — reviewers reconciling 4 disagreeing fraud vendors by hand."
- **T:** "I wanted to cut per-case review time by half without losing an ounce of fraud coverage."
- **A:** "I scoped a GPT-4o copilot as *decision support, not automation* — RAG over our signals and policy, a forced output format with cited evidence, and a shadow-mode eval gated on false-negative leakage before any reviewer saw it."
- **R:** "It's in live trial now, targeting >50% less review time, with the human still owning the call. Early signal is [agreement/override numbers you can share]."

**Traps to avoid:**
- Don't claim final ROI on a trialed product — say "in trial, targeting / early signal." Interviewers respect the honesty and it invites the *good* follow-ups you're prepared for.
- Don't lead with "GPT-4o" — lead with the problem and the guardrails. Anyone can name a model.
- Don't overclaim autonomy. Your *human-in-the-loop* choice is a strength; present it as deliberate, not a limitation.

**One-line CV summary tweak** (to reinforce the AI-PM identity up top):
> "...full-stack ownership of payments and fraud risk, now extending into **AI-assisted fraud decisioning** — shipping LLM decision-support with the evaluation and guardrails a high-stakes domain demands."
