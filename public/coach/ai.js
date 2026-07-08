/* CoachAI — the AI tutor brain (Anthropic Claude / OpenAI GPT-4o).
   Two ways to run:
     (1) SERVER PROXY  — when the coach is served by the local dashboard, /api/coach/* uses the
         ANTHROPIC_API_KEY in jobsearch-os/.env. Zero setup: answers just work by default.
     (2) BROWSER BYO   — on the static Vercel deploy there's no server, so it uses the user's own
         key from Settings (localStorage, sent straight to the provider).
   Streams SSE so answers appear live, like a chatbot, and matches theproductfolks answer depth. */
'use strict';
(function () {
  const PROVIDERS = {
    anthropic: { label: 'Claude (Anthropic)', models: ['claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'] },
    openai: { label: 'GPT-4o (OpenAI)', models: ['gpt-4o', 'gpt-4o-mini'] }
  };

  function settings() { return (window.__coachSettings && window.__coachSettings()) || {}; }
  function provider() { const s = settings(); return PROVIDERS[s.aiProvider] ? s.aiProvider : 'anthropic'; }
  function apiKey() { const s = settings(); return provider() === 'openai' ? (s.openaiKey || '').trim() : (s.apiKey || '').trim(); }
  function model() { const s = settings(); const p = provider(); const m = p === 'openai' ? s.openaiModel : s.aiModel; return PROVIDERS[p].models.includes(m) ? m : PROVIDERS[p].models[0]; }

  /* ---- server proxy detection (cached) ---- */
  let SERVER = undefined;                 // undefined = not checked, null = none, obj = available
  async function detectServer() {
    if (SERVER !== undefined) return SERVER;
    try { const r = await fetch('/api/coach/ai', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); SERVER = d.available ? d : null; } else SERVER = null; }
    catch { SERVER = null; }
    return SERVER;
  }
  function configured() { return !!SERVER || !!apiKey(); }      // sync best-effort (detectServer runs on load)
  async function ready() { await detectServer(); return configured(); }
  function activeLabel() { return SERVER ? (`server · ${SERVER.model}`) : (PROVIDERS[provider()].label + ' · ' + model()); }

  /* ---- unified streaming: prefer server proxy, else browser-direct ---- */
  async function stream({ system, user, maxTokens = 2200, onDelta }) {
    await detectServer();
    if (SERVER) return streamProxy({ system, user, maxTokens, onDelta });
    return streamDirect({ system, user, maxTokens, onDelta });
  }

  async function streamProxy({ system, user, maxTokens, onDelta }) {
    const res = await fetch('/api/coach/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, user, maxTokens }) });
    if (!res.ok) throw new Error('server proxy HTTP ' + res.status);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const l = line.trim(); if (!l.startsWith('data:')) continue;
        const payload = l.slice(5).trim(); if (payload === '"[DONE]"' || payload === '[DONE]') continue;
        try { const j = JSON.parse(payload); if (j.error) throw new Error(j.error); if (j.t) { full += j.t; onDelta && onDelta(j.t, full); } } catch (e) { if (e.message && e.message !== 'Unexpected end of JSON input') { /* real error */ if (!/JSON/.test(e.message)) throw e; } }
      }
    }
    return full;
  }

  async function streamDirect({ system, user, maxTokens, onDelta }) {
    const p = provider(), key = apiKey();
    if (!key) throw new Error('NO_KEY');
    let res;
    if (p === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: model(), max_tokens: maxTokens, stream: true, system, messages: [{ role: 'user', content: user }] }) });
    } else {
      res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model: model(), max_tokens: maxTokens, stream: true, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    }
    if (!res.ok) { const t = await res.text().catch(() => ''); if (res.status === 401 || res.status === 403) throw new Error('Invalid API key — check Settings.'); if (res.status === 429) throw new Error('Rate limit / out of credits.'); throw new Error(`HTTP ${res.status} ${t.slice(0, 140)}`); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const l = line.trim(); if (!l.startsWith('data:')) continue;
        const payload = l.slice(5).trim(); if (payload === '[DONE]') continue;
        try { const j = JSON.parse(payload); let delta = '';
          if (p === 'anthropic') { if (j.type === 'content_block_delta' && j.delta && j.delta.text) delta = j.delta.text; }
          else delta = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || '';
          if (delta) { full += delta; onDelta && onDelta(delta, full); }
        } catch { /* partial */ }
      }
    }
    return full;
  }

  /* ---- candidate background (behavioral/experience answers use HIS real stories) ---- */
  function candidateContext() {
    const D = window.COACH_DATA || {}; const p = D.profile || {};
    const edges = (D.modules || []).map(m => m.learn && m.learn.edge).filter(Boolean).slice(0, 6);
    return `CANDIDATE (answer as this person for behavioural/experience questions; never invent employers or numbers beyond this):\n${p.name || 'the candidate'} — ${p.focus || 'Product Manager'}.\n- ${edges.join('\n- ')}`;
  }

  /* ---- per-round answer templates (drives depth + structure to match theproductfolks) ---- */
  const TEMPLATES = {
    problem:
`Use this EXACT structure (a full case-study walkthrough, like a top candidate thinking aloud):
## 1. Clarify the problem
Write 4–6 lines of realistic **Me:** / **Interviewer:** dialogue that pins down the metric definition, magnitude, timeframe, whether it's a real change vs a tracking artifact, and which segments/geographies are affected.
## 2. Identify possible causes
State the MECE cause tree in words: **External**, **Internal (product / tech / backend)**, **Operational**. One line each.
## 3. External factors — Me/Interviewer dialogue probing competition, seasonality, market/PR events.
## 4. Internal factors — Me/Interviewer dialogue probing recent launches, bugs, instrumentation, pricing/policy changes.
## 5. Operational factors — dialogue probing supply/ops/quality changes.
## 6. Narrow down & analyse — bullets: the leading hypothesis and the exact data/analysis you'd run to confirm each suspected cause.
## 7. Recommendation / solution — numbered, titled actions with a one-line description each.
## 8. Metrics to monitor — bullets, each metric with its definition/formula and a guardrail.`,
    design:
`Use this structure:
## 1. Clarify & scope — 3–4 lines of **Me:** / **Interviewer:** dialogue (platform, goal, constraints); then state your assumption.
## 2. Users & their job-to-be-done — name 2–3 segments, pick ONE, state the JTBD and why.
## 3. Pain points (prioritised) — list top pains for that user; pick the one to solve and say why (reach × severity × fit).
## 4. Solutions — 2–3 distinct ideas; pick one; define the MVP crisply.
## 5. Trade-offs & risks — impact vs effort, reversibility, key edge cases, abuse/AI risk if relevant.
## 6. Success metrics — one North-Star (with formula) + one guardrail.
End with **⚡ Likely pushback:** and a one-line response.`,
    metrics:
`Use this structure:
## 1. Product, stage & goal — what user value + business goal, and lifecycle stage.
## 2. User journey / funnel — map the AARRR stages or the specific flow; mark the value moment.
## 3. Metric tree — **North-Star** (with formula) → 2–3 **input metrics** that drive it → 1–2 **guardrail/counter-metrics**, each with its formula.
## 4. The daily few — the 1–3 metrics you'd actually watch every morning and why.
## 5. Caveats — vanity vs actionable, gaming risk, where you'd segment; ship/no-ship rule if it's a test.`,
    estimation:
`Use this structure (think aloud, round hard):
## 1. Clarify & approach — restate exactly what to estimate + units + geography; pick top-down or bottom-up.
## 2. Assumptions — list your anchor numbers (population, penetration %, frequency) with clean round figures.
## 3. Calculation — walk the math layer by layer to a number/range.
## 4. Sanity check — compare to a known anchor; state confidence and the biggest source of error.`,
    behavioral:
`Answer in FIRST PERSON as the candidate, using their real background. Use STAR:
## Situation & Task — 2 sentences of context + your specific responsibility (quantify the stakes).
## Action — what YOU did: the decisions, the trade-off, who you influenced (this is the bulk).
## Result — quantified outcome + what you learned / would do differently.
Then **⚡ If they dig:** one likely follow-up ("who disagreed?" / "what would you change?") and how you'd answer it.`,
    strategy:
`Use this structure:
## 1. Clarify the objective — what business outcome are we driving (revenue / share / retention / defensibility)? 2 lines of dialogue.
## 2. Options — lay out 2–3 genuinely different strategic paths (incl. build/buy/partner where relevant).
## 3. Trade-offs — cost, time-to-value, risk, strategic fit, reversibility for each.
## 4. Recommendation — commit to one with an explicit "because", and name what would change your mind.
## 5. Metrics & risks — the proof metric + leading indicator + top risk with a mitigation.`,
    technical:
`Use this structure (PM-level: the why & what, not code):
## 1. What it is / how it works — explain the system or feature at a high level in plain language.
## 2. Users & critical flows — key actors and the main paths.
## 3. What's good / what's weak — an honest critique or the key design trade-offs (reliability, latency, clarity, cost).
## 4. Improvements — 2–3 concrete changes and why, tied to a user or business need.
## 5. How you'd measure success/health — metrics + guardrails.`,
    hr:
`Answer crisply and honestly, tailored to the candidate — no fluff. Structure depends on the question:
- "Tell me about yourself" → **Present** (current role + a signature win) → **Past** (the arc that led here) → **Future** (why this move now). ~60–90 seconds.
- "Why this company/role" → 2–3 SPECIFIC, non-generic reasons tied to the company + how the candidate's background maps.
- "Strengths / weaknesses" → one real strength with proof; one real weakness + what you're actively doing about it.
- "Why leaving / gap / salary" → honest, positive framing; for salary give a reasoned range, not a single number.
Keep it under 200 words, first person, using the candidate background.`,
    'hiring-manager':
`Answer as an experience deep-dive in FIRST PERSON using the candidate's real work. Structure:
## Context — the product/problem and why it mattered (with a number).
## Your role & the hard decision — what you owned and the key trade-off you made (and the option you rejected).
## Execution — how you drove it across teams / handled pushback.
## Result & reflection — quantified outcome + the sharpest thing you learned.
Then **⚡ If they dig:** one likely probe and your answer.`
  };

  function completeAnswerPrompts(question, cat, opts) {
    opts = opts || {};
    const catId = cat ? cat.id : 'design';
    const template = TEMPLATES[catId] || TEMPLATES.design;
    const co = opts.company ? `\nFRAME THE ANSWER for a ${opts.company} interview — use ${opts.company}'s product, users, and context where it makes the answer sharper.` : '';
    const usesCandidate = catId === 'behavioral' || catId === 'hiring-manager' || catId === 'hr';
    const system =
`You are a world-class PM interview coach writing a COMPLETE, model answer — the kind published on top case-study sites — that a candidate could study and deliver. Be concrete: real numbers, named user segments, named metrics WITH formulas, realistic dialogue where the template asks for it.
Format in markdown: "## " section headers, "**bold**", "- " bullets, "1." numbered lists, and dialogue lines as "**Me:**" / "**Interviewer:**".
${template}${co}
${usesCandidate ? candidateContext() : 'You MAY draw on this candidate background if role-relevant:\n' + candidateContext()}
Be thorough (this is a full worked answer, ~500–800 words for case questions) but skip any preamble — start directly at "## 1".`;
    const user = `Interview question — ${cat ? cat.title : 'PM'} round${opts.company ? ' · ' + opts.company : ''}:\n"${question}"\n\nWrite the complete model answer.`;
    return { system, user };
  }

  function evaluatePrompts(question, stageName, stagePrompt, userAnswer, cat) {
    const catId = cat ? cat.id : '';
    const system =
`You are a supportive but rigorous PM interview tutor. The candidate answered ${stageName ? `the "${stageName}" step of` : ''} an interview question. Respond in this EXACT markdown format:
**Score:** x/10 — one-line justification.
**What worked:** 2 bullets.
**What's missing:** 2–3 bullets, specific to THIS question (not generic advice).
**Your answer, upgraded:** rewrite THEIR answer the way it should be delivered — keep their substance, voice and real examples, but restructure, sharpen, and add what was missing. Speakable first-person prose, under 200 words.
${(catId === 'behavioral' || catId === 'hiring-manager' || catId === 'hr') ? candidateContext() : ''}`;
    const user = `QUESTION: "${question}"${stagePrompt ? `\nSTEP: ${stagePrompt}` : ''}\n\nCANDIDATE'S ANSWER:\n${userAnswer}`;
    return { system, user };
  }

  function companyGuidePrompts(company, industry) {
    const system =
`You are a PM interview coach. Write a concise, practical interview PREP GUIDE for "${company}"${industry ? ` (${industry})` : ''} in markdown with these sections:
## Interview process — the typical PM loop/rounds for this company (screen, case/design, analytical, behavioural/values, hiring manager, bar-raiser, etc.).
## What they test most — the 2–4 skills/traits this company weights heavily, and any signature style (e.g. Amazon LPs, Google product sense, a take-home).
## 5 likely questions — a numbered list of 5 realistic questions for THIS company, mixing rounds.
## How to stand out — 3 crisp, company-specific tips.
Ground it in what this company actually builds. ~350 words. No preamble.`;
    const user = `Give me the interview prep guide for ${company}.`;
    return { system, user };
  }

  /* ---- markdown-lite renderer (escapes first; handles headers, bold, bullets, numbers, dialogue) ---- */
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function md(s) {
    let h = esc(s);
    h = h.replace(/^\s*#{2,3}\s+(.*)$/gm, '<div style="font-weight:750;margin:13px 0 4px;color:var(--text);font-size:13.5px">$1</div>');
    h = h.replace(/\*\*(Me:)\*\*/g, '<b style="color:var(--accent-bright)">$1</b>');
    h = h.replace(/\*\*(Interviewer:)\*\*/g, '<b style="color:var(--gold)">$1</b>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<b style="color:var(--text)">$1</b>');
    h = h.replace(/^\s*(\d+)\.\s+(.*)$/gm, '<div style="display:flex;gap:8px;margin:3px 0"><span style="color:var(--accent-bright);font-weight:700;flex:none">$1.</span><span>$2</span></div>');
    h = h.replace(/^\s*[-•]\s+(.*)$/gm, '<div style="display:flex;gap:7px;margin:2px 0"><span style="color:var(--accent-bright);flex:none">•</span><span>$1</span></div>');
    h = h.replace(/\n{2,}/g, '<div style="height:8px"></div>').replace(/\n/g, '<br>');
    return h;
  }

  /* ---- shared "chatbot panel" runner ---- */
  const cache = new Map();
  async function runInto(panelEl, cacheKey, promptFn) {
    await detectServer();
    if (!configured()) {
      panelEl.innerHTML = `<div style="font-size:13px;color:var(--text-dim);line-height:1.7">🔑 <b>Connect an AI to get live answers.</b> On this deployed site, add your Claude or GPT-4o key in <a href="#/settings">Settings</a> (stored in your browser only). On your local dashboard it's already wired via <code>.env</code>.</div>`;
      return;
    }
    if (cache.has(cacheKey)) { panelEl.innerHTML = md(cache.get(cacheKey)); return; }
    panelEl.innerHTML = `<div style="font-size:12.5px;color:var(--muted)">🤖 ${SERVER ? 'thinking' : 'thinking'}…</div>`;
    try {
      const { system, user } = promptFn();
      const full = await stream({ system, user, onDelta: (_, sofar) => { panelEl.innerHTML = md(sofar) + '<span style="color:var(--accent-bright)">▌</span>'; } });
      panelEl.innerHTML = md(full);
      cache.set(cacheKey, full);
    } catch (e) {
      panelEl.innerHTML = `<div style="font-size:13px;color:var(--red)">⚠ ${esc(e.message === 'NO_KEY' ? 'Add your API key in Settings first.' : e.message)}</div>`;
    }
  }

  // kick off server detection immediately so the UI can reflect "AI ready" fast
  detectServer();

  window.CoachAI = { PROVIDERS, configured, ready, provider, model, activeLabel, hasServer: () => !!SERVER, stream, completeAnswerPrompts, evaluatePrompts, companyGuidePrompts, md, runInto, candidateContext };
})();
