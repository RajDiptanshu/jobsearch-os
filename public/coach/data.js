/* PM Interview Coach — content compiled from Career_Switch_2026/11_Interview_Prep
   (question bank, India case studies, case-study prep guide, 2-week plan).
   Loaded as a global for the static SPA. */
window.COACH_DATA = {
  profile: {
    name: "Diptanshu",
    focus: "Fraud / Payments / AI Product Manager · India + Dubai",
    weakSpots: ["ai-pm", "metrics"],       // self-rated growth areas
    homeTurf: ["fraud-payments", "rca", "behavioral"]
  },

  /* ---------------- MODULES ---------------- */
  modules: [
    {
      id: "product-sense",
      title: "Product Sense & Design",
      icon: "🧭",
      tagline: "Design & improve products for real user needs",
      difficulty: "Core",
      estMinutes: 50,
      learn: {
        overview: "A 45–55 min, deliberately open-ended round. In 2026 interviewers (esp. Google & Meta) interrupt with pointed follow-ups instead of letting you monologue — and some run a dedicated AI product-sense round (normal prompt, then live vibe-coding a prototype in a chatbot).",
        framework: [
          { step: "Clarify", detail: "Confirm scope, platform, business goal. Ask 2–3 sharp questions, not 10." },
          { step: "User & needs (JTBD)", detail: "Name specific segments and the job they're hiring the product to do — not generic personas." },
          { step: "Prioritize problems", detail: "Pick the highest-value pain point and say why (reach × severity × strategic fit)." },
          { step: "Brainstorm solutions", detail: "Generate 2–3 real options, not one obvious one." },
          { step: "Evaluate trade-offs", detail: "Impact vs effort, risk, reversibility. Show judgment, not just structure." },
          { step: "Recommend + metrics", detail: "Commit to one, define the success metric and a guardrail metric." }
        ],
        shift2026: "Generic prompts are being replaced by company-specific ones tied to a real team's work. Framework-heavy answers with no judgment underneath get rejected — the scaffold is to think out loud with, not a script to perform.",
        tips: [
          "State your structure up front ('I'll clarify, pick a user, prioritize pains, then solution + metrics'), then actually follow it.",
          "When interrupted, engage the follow-up fully before returning to your thread — don't cling to your script.",
          "Always end with a crisp success metric + one guardrail (e.g., engagement up without hurting trust/latency)."
        ],
        edge: "Lean on your fraud/payments instincts for trade-off reasoning — you naturally think about risk, reversibility and guardrails, which is exactly the judgment layer interviewers now probe for."
      },
      questions: [
        { q: "You've been made the PM of Payments at Google, tasked with building a product for very busy people. How would you design it?", company: "Google", tags: ["payments"], difficulty: "Medium" },
        { q: "You're a PM at Meta tasked with a tool to connect handymen with consumers. How would you design the product?", company: "Meta", tags: ["marketplace"], difficulty: "Medium" },
        { q: "Design a parking solution.", company: "Meta", tags: ["design"], difficulty: "Medium" },
        { q: "You're a PM at Meta in charge of a brand-new product for volunteering. What would you do and why?", company: "Meta", tags: ["0-1"], difficulty: "Medium" },
        { q: "How would you improve Facebook Groups?", company: "Meta", tags: ["improve"], difficulty: "Medium" },
        { q: "Design a jobs product for Facebook.", company: "Meta", tags: ["design"], difficulty: "Medium" },
        { q: "What's your favorite product and why? How would you improve it?", company: "Cross-company", tags: ["improve"], difficulty: "Easy" },
        { q: "Design a product for an underserved user group of your choice.", company: "Cross-company", tags: ["design"], difficulty: "Medium" }
      ]
    },
    {
      id: "metrics",
      title: "Metrics & Estimation",
      icon: "📐",
      tagline: "Guesstimates & metric definition under pressure",
      difficulty: "Core",
      estMinutes: 40,
      learn: {
        overview: "Estimation (market-sizing / guesstimates) is reportedly more common than pure metric-definition at Google. You're judged on clean structure and sanity-checking out loud, not perfect precision.",
        framework: [
          { step: "Clarify assumptions", detail: "Population, geography, time window, what exactly counts. State them explicitly." },
          { step: "Structure", detail: "Choose top-down (total → segment) or bottom-up (unit → aggregate). Say which and why." },
          { step: "Round numbers", detail: "Use clean round figures (India ≈ 1.4B people, ~600M smartphone users) so arithmetic stays fast." },
          { step: "Calculate", detail: "Walk the math out loud, layer by layer." },
          { step: "Sanity-check", detail: "Compare to a known anchor. If it's off by 100×, find where and fix it." }
        ],
        shift2026: "For metric-definition questions (Meesho-style), you're asked to name AND calculate each metric, not just list them — define the formula.",
        tips: [
          "Keep India anchors ready: 1.4B population, ~600M smartphone users, ~350M+ UPI users, ~500M internet users.",
          "For metrics: separate the North Star from input metrics from guardrails. Always add one counter-metric.",
          "Target < 8 minutes for a clean estimate. Precision loses to structure here."
        ],
        edge: "This is a self-flagged growth area — do extra reps. Your analytics background (SQL, funnel metrics, chargeback rates) means metric-definition is closer to a home game than you rate it."
      },
      questions: [
        { q: "Estimate the number of queries per day on Google Maps.", company: "Google", tags: ["estimation"], difficulty: "Medium" },
        { q: "Estimate the UPI transaction volume in India per day.", company: "India", tags: ["estimation","payments"], difficulty: "Medium" },
        { q: "Size the quick-commerce delivery market in Tier-2 Indian cities.", company: "India", tags: ["estimation"], difficulty: "Hard" },
        { q: "Estimate how many Zoom meetings take place over an average week.", company: "Cross-company", tags: ["estimation"], difficulty: "Medium" },
        { q: "Estimate Amazon's revenue on Prime Day.", company: "Amazon", tags: ["estimation"], difficulty: "Medium" },
        { q: "Estimate the storage cost of all videos on YouTube.", company: "Google", tags: ["estimation"], difficulty: "Hard" },
        { q: "What three quantitative metrics would you watch daily if you were Netflix's CEO?", company: "Netflix", tags: ["metrics"], difficulty: "Medium" },
        { q: "Name a product you use and 3 metrics to measure its performance — and how you'd calculate each.", company: "Meesho", tags: ["metrics"], difficulty: "Medium" }
      ]
    },
    {
      id: "rca",
      title: "Root Cause Analysis",
      icon: "🔍",
      tagline: "'Metric dropped 20% — why?'",
      difficulty: "Core",
      estMinutes: 35,
      learn: {
        overview: "The '[Metric] dropped X% — investigate' pattern shows up at nearly every company. Interviewers value the systematic MECE approach over landing the 'right' cause — and expect you to propose an action the moment you name a cause.",
        framework: [
          { step: "Clarify the metric", detail: "Definition? Absolute vs % change? Time window? Any known launches/holidays/outages?" },
          { step: "Internal (MECE)", detail: "Logging/instrumentation changes, recent feature launches, bugs, infra/system failures." },
          { step: "External (MECE)", detail: "Seasonality, demographic shifts, competitor actions, macro/market events." },
          { step: "Segment", detail: "Slice by platform, geo, cohort, new-vs-returning to localize the drop." },
          { step: "Name cause + act", detail: "State the most likely root cause, then immediately propose a concrete next action." }
        ],
        shift2026: "PMs are expected to be biased toward action — diagnosis alone reads as incomplete.",
        tips: [
          "Open with 'Is this a real drop or a measurement artifact?' — rules out logging/tracking bugs first.",
          "Explicitly say 'internal vs external' out loud — the MECE signal is what's scored.",
          "Localize before theorizing: a drop isolated to Android + one region tells a very different story than a global one."
        ],
        edge: "You've literally done RCA on live fraud data (chargeback spikes, false-positive investigations). Narrate a real one — it beats any textbook structure."
      },
      questions: [
        { q: "Fraud chargebacks spiked 20% this month — how do you investigate?", company: "Fintech", tags: ["fraud"], difficulty: "Medium" },
        { q: "User engagement dropped 40% after a UPI app update — why, and what do you do?", company: "India", tags: ["payments"], difficulty: "Medium" },
        { q: "A brokerage platform sees a 30% decrease in mutual-fund transactions — investigate.", company: "India", tags: ["fintech"], difficulty: "Medium" },
        { q: "Facebook Friend Request Acceptance Rate is falling — diagnose it.", company: "Cross-company", tags: ["social"], difficulty: "Medium" },
        { q: "An e-commerce platform sees 20% lower conversion in Tier-2 cities — investigate and recommend.", company: "India", tags: ["ecommerce"], difficulty: "Hard" },
        { q: "Daily active users dropped 15% week-over-week with no launch — walk me through it.", company: "Cross-company", tags: ["engagement"], difficulty: "Medium" }
      ]
    },
    {
      id: "strategy",
      title: "Product Strategy",
      icon: "♟️",
      tagline: "GTM, pricing, growth & build/buy/partner",
      difficulty: "Core",
      estMinutes: 45,
      learn: {
        overview: "Set the business objective → generate multiple strategic options → evaluate trade-offs/prioritize → recommend with a clear rationale. Often paired with a build-vs-buy-vs-partner decision in fintech.",
        framework: [
          { step: "Objective", detail: "What business outcome are we driving? Revenue, share, retention, defensibility? Say it before solutions." },
          { step: "Options", detail: "Lay out 2–3 genuinely different strategic paths." },
          { step: "Trade-offs", detail: "Cost/benefit, time-to-value, risk, strategic alignment, reversibility." },
          { step: "Recommend", detail: "Commit to one with an explicit 'because', and name what would change your mind." }
        ],
        shift2026: "Because AI generates plausible-sounding strategy instantly, Meta/Stripe/OpenAI reject generic framework answers with no judgment. Anchor in real numbers and decisions, not textbook structure.",
        tips: [
          "For build/buy/partner: score on cost, internal capability, timeline, data security, and short- vs long-term value.",
          "Name the one metric that proves the strategy worked, and the leading indicator you'd watch first.",
          "In fintech, treat Legal/Compliance/Risk as first-class constraints, not afterthoughts."
        ],
        edge: "Your Forter vendor optimization IS a real build/buy/partner story (you tightened internal rules vs. paying for vendor coverage). Use it as your worked example."
      },
      questions: [
        { q: "How would you evaluate whether to build, buy, or partner for a new fraud-detection tool?", company: "Capital One-style", tags: ["fraud","build-buy"], difficulty: "Hard" },
        { q: "Your CEO asks: should Razorpay build its own UPI app? Evaluate.", company: "Razorpay", tags: ["payments","strategy"], difficulty: "Hard" },
        { q: "How would you launch a standalone Amazon restaurant food-delivery app?", company: "Amazon", tags: ["gtm"], difficulty: "Medium" },
        { q: "How would you launch a new product-recommendation carousel for Amazon?", company: "Amazon", tags: ["gtm"], difficulty: "Medium" },
        { q: "WhatsApp wants to grow revenue in India — how would you do it?", company: "Meta", tags: ["growth","india"], difficulty: "Hard" },
        { q: "Why do you reckon PhonePe got a $9B valuation? What would you do next as PM?", company: "PhonePe", tags: ["market"], difficulty: "Medium" }
      ]
    },
    {
      id: "behavioral",
      title: "Behavioral & Leadership",
      icon: "🎯",
      tagline: "STAR stories that survive 15 min of digging",
      difficulty: "Core",
      estMinutes: 40,
      learn: {
        overview: "Amazon has the heaviest behavioral emphasis: each interviewer probes 1–2 of the 16 Leadership Principles for ~25 min and digs into a single story for 10–20 minutes. Recommended story bank: 25+ defensible stories.",
        framework: [
          { step: "Situation", detail: "Set context fast — 2 sentences, enough stakes to matter." },
          { step: "Task", detail: "Your specific responsibility and the goal/constraint." },
          { step: "Action", detail: "What YOU did (not the team). This is where 80% of the depth lives." },
          { step: "Result", detail: "Quantified outcome + what you learned / would do differently." }
        ],
        shift2026: "Depth and defensibility beat breadth. Expect 'why', 'who disagreed', 'what would you do differently', 'what did the data say' on a single story for 15+ minutes.",
        tips: [
          "Amazon PM loops lean on the first four LPs: Customer Obsession, Ownership, Invent & Simplify, Are Right A Lot.",
          "Have a real Failure story ready — it's the most-probed and the easiest to under-prepare.",
          "Keep the opening answer ~90 seconds, then let the interviewer dig — don't dump everything at once."
        ],
        edge: "Your strongest three: Forter vendor negotiation, blacklist cross-team rollout, CCV AI architecture call. Your blacklist story has a genuine failed-first-A/B-then-recovered arc — that's an ideal Failure/Ownership story."
      },
      questions: [
        { q: "Tell me about a time you took a calculated risk.", company: "Amazon", tags: ["ownership"], difficulty: "Medium" },
        { q: "Tell me about a time you had to make a fast, high-impact decision with incomplete data.", company: "Amazon", tags: ["bias-for-action"], difficulty: "Medium" },
        { q: "Tell me about a project that failed or underperformed. What did you do?", company: "Amazon", tags: ["failure"], difficulty: "Hard" },
        { q: "Tell me about a time you influenced a change by only asking questions.", company: "Amazon", tags: ["influence"], difficulty: "Medium" },
        { q: "Give an example of when you did more than what was required.", company: "Amazon", tags: ["ownership"], difficulty: "Medium" },
        { q: "Tell me about a time you had to handle a crisis.", company: "Amazon", tags: ["crisis"], difficulty: "Medium" },
        { q: "Tell me about a time you disagreed with a senior stakeholder. What happened?", company: "Cross-company", tags: ["conflict"], difficulty: "Medium" }
      ]
    },
    {
      id: "system-design",
      title: "System Design for PMs",
      icon: "🧩",
      tagline: "The why & what to build, not the code",
      difficulty: "Advanced",
      estMinutes: 45,
      learn: {
        overview: "For PMs (vs engineers) this round is about the why and what — high-level architecture, trade-offs, and how technical decisions map to user/business needs, not implementation detail. Reported mix: ~50% 'design a big app', ~30% 'design a category', rest frontend/low-level/infra.",
        framework: [
          { step: "Requirements", detail: "Functional (what it must do) + non-functional (scale, latency, reliability, security)." },
          { step: "Users & flows", detail: "Key actors and the critical paths through the system." },
          { step: "High-level architecture", detail: "Major components + data flow between them. Draw the boxes." },
          { step: "Deep-dive one piece", detail: "Pick the interesting/risky component and reason about trade-offs." },
          { step: "Trade-offs & metrics", detail: "Consistency vs availability, build vs buy, and how you'd measure success/health." }
        ],
        shift2026: "For a payments/dev-tools API prompt, you're judged on what makes an API good to build on — reliability, clarity, ease of correct integration — not raw technical depth.",
        tips: [
          "State assumptions about scale early (QPS, users, data volume) — it frames every later choice.",
          "Tie each technical decision back to a user or business need out loud.",
          "It's fine to say 'I'd validate this with engineering' — judgment about the unknown beats false certainty."
        ],
        edge: "You navigated a real architecture trade-off: extending the standalone Fraud API vs building on Fareportal's FARA platform. That's a differentiated, true system-design answer — rehearse it as one."
      },
      questions: [
        { q: "Design a payments API. What makes it good to build on?", company: "Stripe", tags: ["payments","api"], difficulty: "Hard" },
        { q: "How would you design a notifications system? (triggers, channels, settings, delivery guarantees)", company: "Cross-company", tags: ["platform"], difficulty: "Medium" },
        { q: "Design a fraud-decisioning service that returns approve/review/reject in real time.", company: "Fintech", tags: ["fraud"], difficulty: "Hard" },
        { q: "Design a system to detect and block repeat fraudsters before booking creation.", company: "Fintech", tags: ["fraud"], difficulty: "Hard" },
        { q: "Design a rate-limiter for a public API.", company: "Cross-company", tags: ["platform"], difficulty: "Medium" }
      ]
    },
    {
      id: "ai-pm",
      title: "AI Product Management",
      icon: "🤖",
      tagline: "Evals, hallucination, RAG, agentic judgment",
      difficulty: "Advanced",
      estMinutes: 50,
      learn: {
        overview: "Now its own interview pillar. Focus areas: your evaluation harness (offline eval set + online metrics), defining hallucination and the rate you'd refuse to launch above, RAG failure modes, token/latency unit economics, prompts-as-specs, and judgment on when to ship agentic behavior.",
        framework: [
          { step: "Problem & fit", detail: "Is AI actually the right tool, or is a rule/heuristic better and cheaper?" },
          { step: "Eval design", detail: "Offline golden set + online metrics. Define what 'good' means before building." },
          { step: "Failure modes", detail: "Hallucination, silent retrieval failure, distribution shift — and how you'd catch each." },
          { step: "Guardrails", detail: "Human-in-the-loop, refusal thresholds, override tracking, PII handling." },
          { step: "Unit economics", detail: "Token cost, latency budget, model choice/fallback, when to ship vs hold." }
        ],
        shift2026: "Candidates are increasingly asked to build a small working demo live (Cursor, v0, similar) — judged less on code quality, more on whether you can get hands-on when needed.",
        tips: [
          "Be ready for 'The retrieval step fails silently and the LLM answers confidently wrong — how do you catch that?' → measure retrieval quality separately from generation quality.",
          "Define hallucination concretely and state a launch-blocking rate for your context.",
          "Have a view on chunk-vs-whole-document and handling ambiguous queries that return multiple partial matches."
        ],
        edge: "Your CCV AI Assistant (GPT-4o, structured output, shadow-mode eval, golden-dataset validation, explicit non-RAG Phase-1 decision, GPT-4o vs Gemini fallback) answers nearly every bullet from REAL experience. Practice 'why isn't this RAG?' and 'how would you know it's working?' — both are directly answerable. This is your flagged weak spot on paper but your strongest true material."
      },
      questions: [
        { q: "Walk me through the evaluation harness for an AI feature you'd ship. What's offline vs online?", company: "AI-PM", tags: ["evals"], difficulty: "Hard" },
        { q: "Define hallucination. What rate would make you refuse to launch?", company: "AI-PM", tags: ["quality"], difficulty: "Medium" },
        { q: "Retrieval fails silently and the LLM answers confidently wrong. How do you catch it?", company: "AI-PM", tags: ["rag"], difficulty: "Hard" },
        { q: "Your GenAI fraud assistant hits 85% agent agreement in shadow mode but agents don't trust it. Diagnose and fix.", company: "Fintech-AI", tags: ["trust","fraud"], difficulty: "Hard" },
        { q: "When would you NOT use RAG? Defend a non-RAG architecture.", company: "AI-PM", tags: ["rag","architecture"], difficulty: "Hard" },
        { q: "How would you decide when it's safe to ship agentic (auto-acting) behavior vs keep a human in the loop?", company: "AI-PM", tags: ["agentic"], difficulty: "Hard" }
      ]
    },
    {
      id: "fraud-payments",
      title: "Fraud / Risk / Payments PM",
      icon: "🛡️",
      tagline: "Your home turf — get fluent in the vocabulary",
      difficulty: "Niche",
      estMinutes: 45,
      learn: {
        overview: "Less standardized publicly, but recurring themes: the conversion-vs-fraud trade-off, chargeback/dispute lifecycle, payments plumbing fluency (gateway → acquirer → networks), rules-vs-ML, 3DS routing, and KPI fluency (GPV, auth rate, chargeback rate, dispute win rate, processing cost).",
        framework: [
          { step: "Frame the tension", detail: "Almost every payments question is conversion vs fraud vs cost. Name the trade-off first." },
          { step: "Map the flow", detail: "Gateway → acquirer → networks → issuer; call out AVS/CVV, 3DS, tokenization touchpoints." },
          { step: "Rules vs ML", detail: "When deterministic rules beat models (explainability, compliance) vs when ML wins (scale, drift)." },
          { step: "Quantify", detail: "Tie decisions to $ impact: chargeback rate, false-positive cost, auth-rate lift, vendor cost." },
          { step: "Compliance as constraint", detail: "Legal/Risk/Compliance are real gates, especially for AI decisioning." }
        ],
        shift2026: "The prep here is less 'learn new content' and more 'narrate what you already did in industry-standard vocabulary' — recruiters use GPV/auth-rate/representment, not your internal Fareportal terms.",
        tips: [
          "Translation reps: 'incorrect billing' → vendor cost/precision; 'CCV review' → manual review queue; 'block engine' → pre-auth risk decisioning.",
          "Recurring-payments specifics: card updater/network tokens, smart retry, 3DS on initial setup, proration, churn.",
          "Always quantify the business impact — this niche rewards $ and % over qualitative reasoning."
        ],
        edge: "Nearly every theme maps to your achievement bank: blacklist engine, Forter optimization, 3DS/SCA rollout, $570K chargeback-exposure closure, Adyen migration. This is a home game — the work is fluency, not learning."
      },
      questions: [
        { q: "A new instant-checkout feature lifted conversion 10% but raised fraud losses 25%. What do you do?", company: "Payments", tags: ["tradeoff"], difficulty: "Hard" },
        { q: "Fraud chargebacks rose 15% QoQ but vendor coverage cost is flat. How do you approach it?", company: "Payments", tags: ["fraud","cost"], difficulty: "Hard" },
        { q: "Walk me through the chargeback/dispute lifecycle and where product can improve win rate.", company: "Payments", tags: ["chargeback"], difficulty: "Medium" },
        { q: "How would you reduce false-positive fraud declines without raising fraud losses?", company: "Payments", tags: ["tradeoff"], difficulty: "Hard" },
        { q: "Design a phased fraud roadmap in a resource-constrained environment.", company: "Fintech", tags: ["roadmap"], difficulty: "Medium" },
        { q: "How do you decide 3DS routing to balance auth rate vs fraud?", company: "Payments", tags: ["3ds"], difficulty: "Hard" }
      ]
    },
    {
      id: "india-cases",
      title: "India Product-Company Cases",
      icon: "🇮🇳",
      tagline: "Flipkart, Razorpay, Meesho, Swiggy, Zepto patterns",
      difficulty: "Regional",
      estMinutes: 45,
      learn: {
        overview: "India loops lean on guesstimates, business/KPI cases, and product design tied to the company's own context. Many companies reuse well-known generic cases (FB Friend-Request rate, Swiggy delivery optimization), so practicing famous cases has real transfer value.",
        framework: [
          { step: "Problem-first", detail: "Meesho explicitly watches whether you understand the user problem before jumping to solutions." },
          { step: "Name metrics", detail: "Several companies ask you to name AND calculate the metrics you'd track — don't stay abstract." },
          { step: "Context-fit", detail: "Tie the answer to the company's real business (marketplace, quick-commerce, payments)." },
          { step: "Prioritize + recommend", detail: "Commit to one defensible recommendation with an outcome you'd measure." }
        ],
        shift2026: "Formats vary: Flipkart often wants a ~6-page deck before live rounds; Razorpay/Swiggy use take-home cases; Zepto/Swiggy add SQL and A/B-testing rounds.",
        tips: [
          "Keep India guesstimate anchors sharp (UPI volume, quick-commerce TAM in Tier-2).",
          "For quick-commerce, one delivery-optimization case transfers across Swiggy/Zepto/Zomato.",
          "For payments companies, your fraud/payments depth is a differentiator — use it."
        ],
        edge: "Meesho's ₹100cr/₹20cr crisis question is closest to your real chargeback-recovery muscle; Razorpay's 'build our own UPI app' is the same shape as the Capital One build/buy/partner case you already have material for."
      },
      questions: [
        { q: "You released a feature worth ₹100cr in scope and ₹20cr fell through due to an issue — what steps do you take?", company: "Meesho", tags: ["crisis","rca"], difficulty: "Hard" },
        { q: "Should Razorpay build its own UPI app? Your CEO wants a recommendation.", company: "Razorpay", tags: ["strategy","payments"], difficulty: "Hard" },
        { q: "Improve the NPS of BigBasket detractors who rated partly-delivered orders badly (process already optimized).", company: "Flipkart", tags: ["improve","nps"], difficulty: "Hard" },
        { q: "Design an app to help people choose which cheese to buy at a grocery store.", company: "Flipkart", tags: ["design"], difficulty: "Medium" },
        { q: "Design a quick-commerce delivery-optimization solution (Swiggy/Zepto-style).", company: "Swiggy/Zepto", tags: ["quick-commerce"], difficulty: "Hard" },
        { q: "Design a subscription product for a grocery-delivery app.", company: "India", tags: ["design","subscription"], difficulty: "Medium" }
      ]
    }
  ],

  /* ---------------- INTERACTIVE CASE FLOWS ----------------
     Each flow = a staged interview. The coach asks a stage question; you answer
     (type or speak); then you reveal model points + a likely pushback and self-score. */
  cases: [
    {
      id: "meesho-crisis",
      moduleId: "india-cases",
      title: "The ₹20cr shortfall",
      company: "Meesho",
      difficulty: "Hard",
      estMinutes: 25,
      prompt: "You released a feature worth ₹100cr in scope. Due to an issue, ₹20cr of that fell through. Walk me through exactly what you do.",
      stages: [
        { ask: "First 60 minutes: what do you do and in what order?", hint: "Triage before diagnosis. Think blast-radius, comms, and stopping the bleed.",
          modelPoints: ["Assess blast radius: is ₹20cr still leaking or already lost? Contain first.", "Stand up a war-room + single owner; notify stakeholders with a facts-only update.", "Decide rollback vs forward-fix based on reversibility and time-to-fix.", "Preserve data/logs for root-cause before anything is overwritten."],
          pushback: "Engineering says a clean rollback will itself cost ₹5cr in downstream breakage. Now what?" },
        { ask: "How do you find the root cause? Give me your structure.", hint: "MECE: internal vs external. Segment to localize.",
          modelPoints: ["Confirm it's real, not a reporting artifact (instrumentation check first).", "Internal: recent launch/config, bug, infra failure, dependency change.", "External: seasonality, a partner/PSP outage, market event.", "Segment by geo/platform/cohort to localize the ₹20cr."],
          pushback: "The metric team says tracking looks fine and the money genuinely didn't convert. Where do you look next?" },
        { ask: "What do you change so this never happens again?", hint: "Process + product + guardrail metric.",
          modelPoints: ["Add a pre-launch guardrail/canary + kill-switch for high-scope releases.", "Define a real-time guardrail metric with alerting thresholds.", "Blameless post-mortem; convert learnings into launch-checklist gates.", "Right-size rollout (phased %) for anything above a ₹-threshold."],
          pushback: "Leadership wants the feature re-shipped this week. How do you balance speed vs the safeguards you just described?" }
      ],
      rubric: ["Triaged before diagnosing", "MECE root-cause structure", "Quantified / money-aware", "Concrete preventive action", "Handled pushback with judgment"]
    },
    {
      id: "razorpay-upi",
      moduleId: "strategy",
      title: "Should Razorpay build its own UPI app?",
      company: "Razorpay",
      difficulty: "Hard",
      estMinutes: 30,
      prompt: "Your CEO asks you to evaluate whether Razorpay should build its own consumer UPI app. Give a recommendation.",
      stages: [
        { ask: "Before any recommendation — how do you frame the decision?", hint: "Objective first. Build/buy/partner lens.",
          modelPoints: ["Clarify the strategic objective: consumer distribution? data? defensibility vs PhonePe/GPay?", "Frame as build vs partner vs stay-B2B, not just yes/no.", "Name constraints: NPCI/regulatory, 30% UPI market-share cap, CAC of a consumer app."],
          pushback: "The CEO says 'assume distribution isn't a problem'. Does your framing change?" },
        { ask: "Walk the trade-offs. What are the 2–3 real options and their costs?", hint: "Cost, capability, timeline, data security, short vs long-term value.",
          modelPoints: ["Build: huge CAC, brand shift B2B→B2C, years to scale, but owns consumer data + defensibility.", "Partner/embed: faster, lower risk, but weaker moat.", "Stay B2B and go deeper on merchant payments/credit where they already win.", "Consumer UPI is near-zero-margin — monetization must come from adjacent products."],
          pushback: "PhonePe and GPay own ~85% share. What's your honest read on Razorpay's odds?" },
        { ask: "Your recommendation in 3 sentences, plus the one metric that proves you right.", hint: "Commit. Name what would change your mind.",
          modelPoints: ["Take a clear stance (most defensible: don't build a standalone app; double down on merchant + embedded UPI).", "State the leading metric (e.g., merchant UPI TPV / attach of credit) you'd watch.", "Name the disconfirming signal that would reverse your call."],
          pushback: "If you're wrong and a competitor's consumer app starts eating your merchant relationships, what's your hedge?" }
      ],
      rubric: ["Objective framed before solution", "Genuine build/buy/partner options", "Quantitative trade-off reasoning", "Committed recommendation", "Named a proof metric + disconfirmer"]
    },
    {
      id: "google-payments",
      moduleId: "product-sense",
      title: "Payments for very busy people",
      company: "Google",
      difficulty: "Medium",
      estMinutes: 30,
      prompt: "You're the PM of Payments at Google, tasked with building a product for very busy people. Design it.",
      stages: [
        { ask: "Clarify scope and pick the user. Who exactly is 'very busy'?", hint: "Narrow the segment; name the job-to-be-done.",
          modelPoints: ["Clarify: platform, geography, B2C vs SMB, existing Google Pay footprint.", "Pick one segment (e.g., time-poor working parents, or SMB owners) and their JTBD.", "State the core need: reduce time/cognitive load per payment decision."],
          pushback: "Assume it's Indian SMB owners. Does your design change?" },
        { ask: "What are the top pain points, and which one do you solve first?", hint: "Prioritize by reach × severity × strategic fit.",
          modelPoints: ["Enumerate pains: repetitive bills, reconciliation, remembering due dates, context-switching.", "Prioritize one (e.g., automated recurring + proactive nudges).", "Say why that one first (frequency + defensible with Google's context signals)."],
          pushback: "How is this meaningfully better than what PhonePe/GPay autopay already do?" },
        { ask: "Your solution + the success metric and a guardrail.", hint: "MVP scope, one North Star, one counter-metric.",
          modelPoints: ["Define MVP crisply (not the everything-app).", "North Star: time saved / payments completed hands-off.", "Guardrail: failed-payment rate, trust/opt-out rate, fraud on automation."],
          pushback: "Automation increases fraud/mistaken-payment risk. How do you keep trust?" }
      ],
      rubric: ["Narrowed to a real user + JTBD", "Prioritized with explicit reasoning", "Differentiated vs incumbents", "North Star + guardrail metric", "Reasoned about trust/risk"]
    },
    {
      id: "conversion-vs-fraud",
      moduleId: "fraud-payments",
      title: "Checkout lift, fraud spike",
      company: "Payments",
      difficulty: "Hard",
      estMinutes: 25,
      prompt: "A new instant-checkout feature increased conversion 10% but also increased fraud losses 25%. What do you do?",
      stages: [
        { ask: "How do you frame this trade-off and what data do you pull first?", hint: "Net $ impact, not just the two percentages.",
          modelPoints: ["Compute net: is the 10% conversion $ gain > the 25% fraud $ loss? Get absolute numbers.", "Segment fraud: which cohorts/BINs/geos/amounts drive the 25%?", "Separate first-party (friendly) fraud from third-party."],
          pushback: "Finance says net revenue is still up 4%. Does that mean you ship it as-is?" },
        { ask: "What levers do you have, and which do you pull?", hint: "Targeted friction, not blanket friction.",
          modelPoints: ["Risk-based step-up (3DS/OTP) only on high-risk segments — keep low-risk frictionless.", "Tune rules/model thresholds for the offending cohorts.", "Velocity/limits on the exact fraud pattern; manual-review queue for the gray zone."],
          pushback: "Adding step-up on high-risk cohorts drops their conversion. How do you decide the threshold?" },
        { ask: "How do you validate and what do you commit to?", hint: "A/B, guardrails, reversibility.",
          modelPoints: ["A/B the targeted-friction version vs control; measure net $ + auth rate + chargeback rate.", "Set a guardrail auto-rollback if chargeback rate crosses X.", "Recommend: keep the feature, add risk-based friction — quantify expected net."],
          pushback: "Chargebacks lag 30–60 days. How do you avoid declaring victory too early?" }
      ],
      rubric: ["Reasoned on net $ not raw %", "Segmented the fraud", "Targeted (not blanket) friction", "A/B + guardrail plan", "Handled chargeback-lag nuance"]
    },
    {
      id: "genai-trust",
      moduleId: "ai-pm",
      title: "The AI agents don't trust",
      company: "Fintech-AI",
      difficulty: "Hard",
      estMinutes: 25,
      prompt: "Your GenAI fraud-decisioning assistant shows 85% agreement with agents in shadow mode, but agents report low trust in its recommendations. Diagnose and fix.",
      stages: [
        { ask: "How do you diagnose the trust gap? 85% agreement sounds fine on paper.", hint: "Agreement ≠ trust. Look at the 15% and the explanations.",
          modelPoints: ["Analyze the 15% disagreements: are they high-stakes cases? That's where trust breaks.", "Is the rationale human-readable and specific, or generic? Trust needs explainability.", "Are false-negatives (says approve, is fraud) concentrated? One bad miss kills trust."],
          pushback: "Agents say 'it's right most of the time but I can't tell WHEN it's wrong.' What does that tell you?" },
        { ask: "What do you actually change in the product?", hint: "Calibrated confidence, rationale, escalation.",
          modelPoints: ["Surface calibrated confidence + the specific signals behind each call, not just a verdict.", "Make it escalate/abstain on ambiguous cases rather than guess.", "Track overrides and feed disagreements back into rules/prompt; show agents their feedback changed it."],
          pushback: "How would you measure whether trust actually improved, not just agreement?" },
        { ask: "What's your launch gate before moving from shadow to assisted mode?", hint: "Define the bar quantitatively.",
          modelPoints: ["Set thresholds: false-negative rate < X%, agreement on high-value cases, agent-satisfaction score.", "Human-in-the-loop preserved; no auto-approve/reject.", "Staged rollout with override tracking + regression re-test after prompt changes."],
          pushback: "Compliance asks what happens the first time it confidently approves a big fraud. Your answer?" }
      ],
      rubric: ["Distinguished agreement from trust", "Focused on the 15% / high-stakes", "Calibrated confidence + explainability", "Defined a measurable trust metric", "Real launch gate + compliance answer"]
    },
    {
      id: "flipkart-bigbasket",
      moduleId: "india-cases",
      title: "BigBasket detractor NPS",
      company: "Flipkart",
      difficulty: "Hard",
      estMinutes: 25,
      prompt: "You're a PM at BigBasket. How would you improve the NPS of detractors who gave a bad rating for partly-delivered items — assuming the fulfilment process is already optimized?",
      stages: [
        { ask: "The process is already optimized — so where's the NPS lever? Frame it.", hint: "If fulfilment is fixed, the lever is expectation + recovery, not delivery.",
          modelPoints: ["Reframe: you can't fix the partial-delivery event, so target expectation-setting + service recovery.", "Segment detractors: which items, order values, frequencies drive the worst scores?", "Name the JTBD: the customer wants predictability and to feel made-whole."],
          pushback: "Leadership says 'we already refund the missing item — what more do they want?'" },
        { ask: "Give me 2–3 solutions and prioritize.", hint: "Proactive comms, instant recovery, substitution choice.",
          modelPoints: ["Proactive real-time notice + choice (substitute / refund / redeliver) before it's a surprise.", "Instant, generous recovery (auto-credit + apology) on partial orders.", "Let customers pre-set substitution preferences to avoid the miss entirely."],
          pushback: "Instant credits cost money on every partial order. How do you justify it?" },
        { ask: "What metric proves it worked, and what's the guardrail?", hint: "Detractor→passive conversion, not just top-line NPS.",
          modelPoints: ["Primary: detractor recovery rate / repeat-purchase of affected cohort.", "Guardrail: credit cost per order, abuse rate on the recovery offer.", "Measure via targeted A/B on the detractor cohort."],
          pushback: "Some users will game the auto-credit. How do you protect against abuse?" }
      ],
      rubric: ["Reframed given the constraint", "Segmented detractors", "Prioritized with cost awareness", "Recovery-focused metric", "Handled abuse/cost pushback"]
    },
    {
      id: "cheese-app",
      moduleId: "product-sense",
      title: "The cheese-buying app",
      company: "Flipkart",
      difficulty: "Medium",
      estMinutes: 25,
      prompt: "Design an app to help people choose which cheese to buy at a grocery store. (Pure product design — zero relation to your background, on purpose.)",
      stages: [
        { ask: "Clarify and pick your user. Who's confused at the cheese aisle and why?", hint: "There are very different users here — pick one.",
          modelPoints: ["Segment: novice/overwhelmed shopper vs recipe-driven vs dietary-restricted vs gifting.", "Pick one (e.g., the overwhelmed novice) and their JTBD: 'choose confidently in 30 seconds'.", "Clarify context: in-store, time-pressured, phone in hand."],
          pushback: "Why the novice and not the foodie who'd actually pay for this?" },
        { ask: "What's the core experience? Walk the key flow.", hint: "In-store, fast, low-friction input.",
          modelPoints: ["Input by use-case ('for a burger', 'for a cheese board') or scan the shelf.", "Output: a ranked shortlist with why, price, and pairing.", "Reduce to the fewest taps — they're standing in an aisle."],
          pushback: "Scanning shelves reliably is hard. What's your v1 if the scan doesn't work?" },
        { ask: "Success metric + how you'd know people actually use it in-store.", hint: "Decision completion, not downloads.",
          modelPoints: ["North Star: successful in-store decisions (add-to-cart / purchase follow-through).", "Guardrail: time-to-decision, repeat usage.", "MVP: skip the fancy CV; start with a guided-question flow."],
          pushback: "How do you keep this from being a one-time-use novelty?" }
      ],
      rubric: ["Picked a specific user", "Designed for the real in-store context", "Ruthless MVP scoping", "Completion-based metric", "Addressed retention"]
    },
    {
      id: "rca-upi",
      moduleId: "rca",
      title: "UPI app engagement dropped 40%",
      company: "India",
      difficulty: "Medium",
      estMinutes: 20,
      prompt: "User engagement dropped 40% after a UPI app update. Why, and what do you do?",
      stages: [
        { ask: "What do you clarify before investigating?", hint: "Metric definition, window, and 'is it real?'",
          modelPoints: ["Define 'engagement': DAU? txns/user? session length? Which one dropped 40%?", "Timing: exactly at the update, or gradual? Which user segments/OS versions?", "Rule out an instrumentation/analytics break from the release first."],
          pushback: "Analytics confirms tracking is intact and it's a real 40% on transactions-per-user. Continue." },
        { ask: "Structure the causes — MECE.", hint: "Internal (the update) vs external.",
          modelPoints: ["Internal: a broken/slow flow in the update, new permission prompt, added step, crash on some OS.", "External: a UPI outage, NPCI change, competitor promo, seasonality.", "Segment by OS/app-version/region to localize."],
          pushback: "It's isolated to Android users on the newest app version. What's your leading hypothesis?" },
        { ask: "Name the likely cause and your immediate action.", hint: "Diagnosis + action, together.",
          modelPoints: ["Likely: a regression in the payment flow for that Android build (crash / added friction).", "Action: hotfix or roll back that build; add a canary + crash-rate alert.", "Verify recovery on the affected cohort before closing."],
          pushback: "Rollback takes 24h to propagate. What do you do in the meantime?" }
      ],
      rubric: ["Clarified metric + ruled out artifact", "MECE internal/external", "Localized by segment", "Named cause AND action", "Handled the interim-mitigation pushback"]
    },
    {
      id: "estimate-upi",
      moduleId: "metrics",
      title: "Estimate India's daily UPI volume",
      company: "India",
      difficulty: "Medium",
      estMinutes: 15,
      prompt: "Estimate the number of UPI transactions in India per day. Think out loud and structure it.",
      stages: [
        { ask: "State your approach and top-line assumptions.", hint: "Top-down from users, or bottom-up from txns/user.",
          modelPoints: ["Choose bottom-up: UPI users × transactions per user per day.", "Anchor: ~350–400M UPI users in India.", "Assume avg ~2–3 UPI txns/user/day across the active base (many small P2M payments)."],
          pushback: "Is 'active users' the same as 'registered users'? Adjust." },
        { ask: "Do the math out loud.", hint: "Round hard, keep it clean.",
          modelPoints: ["~350M active × ~2.5 txns/day ≈ ~875M/day → round to ~0.8–1B/day.", "Layer: heavy users (merchants, gig workers) pull the average up.", "Land on a range, not a false-precise number."],
          pushback: "Give me a single number you'd defend, and why." },
        { ask: "Sanity-check against something you know.", hint: "Compare to a public anchor.",
          modelPoints: ["Cross-check vs monthly: ~0.9B/day ≈ ~27B/month — in the right order of magnitude for India UPI.", "Call out the biggest source of error (active-user % and txns/user).", "State confidence: right within ~2×, which is what estimation wants."],
          pushback: "If I told you the real number is ~2× yours, where's your estimate most likely wrong?" }
      ],
      rubric: ["Clear top-down/bottom-up choice", "Reasonable, stated assumptions", "Clean rounded arithmetic", "Sanity-checked vs an anchor", "Named the biggest error source"]
    },
    {
      id: "payments-api",
      moduleId: "system-design",
      title: "Design a payments API",
      company: "Stripe",
      difficulty: "Hard",
      estMinutes: 30,
      prompt: "Design a payments API. What makes it good to build on? (PM lens — the why and what, not the code.)",
      stages: [
        { ask: "Requirements first — functional and non-functional.", hint: "What must it do; at what scale/reliability/security.",
          modelPoints: ["Functional: create charge, auth/capture, refund, idempotent retries, webhooks, dispute handling.", "Non-functional: reliability (payments can't drop), low latency, PCI security, clear errors.", "Name the developer as the primary 'user' — DX is the product."],
          pushback: "Which single non-functional requirement would you never trade off, and why?" },
        { ask: "What makes this API genuinely good to build on?", hint: "Reliability, clarity, ease of correct integration.",
          modelPoints: ["Idempotency keys so retries never double-charge.", "Predictable, well-documented errors; sensible defaults; hard-to-misuse design.", "Webhooks for async state; sandbox + test cards; versioning that doesn't break integrators."],
          pushback: "A partner integrates it wrong and double-charges customers. Whose fault is it, and what do you change?" },
        { ask: "How do you measure the API's success and health?", hint: "Adoption + reliability + integration success.",
          modelPoints: ["Health: success/auth rate, p99 latency, error rate by type.", "Adoption: time-to-first-successful-charge, integration completion rate.", "Trust: incidents, double-charge rate, support tickets per 1k integrations."],
          pushback: "Tie one of these metrics back to a real product decision you'd make from it." }
      ],
      rubric: ["Split functional vs non-functional", "Made DX the product", "Idempotency/error-handling depth", "Health + adoption metrics", "Connected metric → decision"]
    }
  ]
};
