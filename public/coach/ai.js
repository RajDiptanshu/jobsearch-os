/* CoachAI — provider-agnostic AI tutor client (Anthropic Claude / OpenAI GPT-4o).
   Browser-direct with the user's OWN key (localStorage only, never sent to any server of ours).
   Streams responses SSE-style so answers appear live, like a chatbot. */
'use strict';
(function(){
  const PROVIDERS = {
    anthropic: {
      label: 'Claude (Anthropic)',
      models: ['claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'],
      keyHint: 'sk-ant-…  (console.anthropic.com → API keys)'
    },
    openai: {
      label: 'GPT-4o (OpenAI)',
      models: ['gpt-4o', 'gpt-4o-mini'],
      keyHint: 'sk-…  (platform.openai.com → API keys)'
    }
  };

  function settings(){
    // STATE is defined in app.js; ai.js is loaded after data/questions but used from app.js handlers post-boot
    const s = (window.__coachSettings && window.__coachSettings()) || {};
    return s;
  }
  function provider(){ const s = settings(); return PROVIDERS[s.aiProvider] ? s.aiProvider : 'anthropic'; }
  function apiKey(){ const s = settings(); return provider()==='openai' ? (s.openaiKey||'').trim() : (s.apiKey||'').trim(); }
  function model(){ const s = settings(); const p = provider();
    const m = p==='openai' ? s.openaiModel : s.aiModel;
    return PROVIDERS[p].models.includes(m) ? m : PROVIDERS[p].models[0]; }
  function configured(){ return !!apiKey(); }

  /* ---- SSE streaming for both providers; onDelta(textChunk) fires as tokens arrive ---- */
  async function stream({ system, user, maxTokens = 1400, onDelta }){
    const p = provider(), key = apiKey();
    if(!key) throw new Error('NO_KEY');
    let res;
    if(p === 'anthropic'){
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({ model: model(), max_tokens: maxTokens, stream: true, system, messages: [{ role:'user', content:user }] })
      });
    } else {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type':'application/json', 'authorization':'Bearer '+key },
        body: JSON.stringify({ model: model(), max_tokens: maxTokens, stream: true, messages: [{ role:'system', content:system }, { role:'user', content:user }] })
      });
    }
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      if(res.status === 401 || res.status === 403) throw new Error('Invalid API key — check Settings.');
      if(res.status === 429) throw new Error('Rate limit / out of credits on your ' + PROVIDERS[p].label + ' account.');
      throw new Error(`HTTP ${res.status} ${t.slice(0,140)}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buf += dec.decode(value, { stream:true });
      const lines = buf.split('\n'); buf = lines.pop();
      for(const line of lines){
        const l = line.trim();
        if(!l.startsWith('data:')) continue;
        const payload = l.slice(5).trim();
        if(payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          let delta = '';
          if(p === 'anthropic'){ if(j.type === 'content_block_delta' && j.delta && j.delta.text) delta = j.delta.text; }
          else { delta = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || ''; }
          if(delta){ full += delta; onDelta && onDelta(delta, full); }
        } catch { /* partial JSON line — ignored, rebuffered next round */ }
      }
    }
    return full;
  }

  /* ---- candidate background (from coach content — used so behavioral answers use HIS real stories) ---- */
  function candidateContext(){
    const D = window.COACH_DATA || {};
    const p = D.profile || {};
    const edges = (D.modules||[]).map(m => m.learn && m.learn.edge).filter(Boolean).slice(0,6);
    return `Candidate: ${p.name||'the candidate'} — ${p.focus||'Product Manager'}.\nBackground highlights:\n- ${edges.join('\n- ')}`;
  }

  /* ---- prompt builders ---- */
  function completeAnswerPrompts(question, cat){
    const steps = (cat && cat.framework || []).map((s,i)=>`${i+1}. ${s.name}`).join(' → ');
    const isBehavioral = cat && cat.id === 'behavioral';
    const system =
`You are a world-class PM interview coach giving a COMPLETE model answer to an interview question, exactly as a top candidate would deliver it out loud.
Structure the answer with a bold mini-header per framework step${steps ? ` (${steps})` : ''}, and under each, 2–4 crisp sentences or tight bullets with concrete specifics (real numbers, named segments, named metrics with formulas where relevant).
${isBehavioral ? 'Answer AS the candidate in first person, using the real background below — do not invent employers or fake numbers beyond it.\n' + candidateContext() : 'Where role-specific experience helps, you may draw on this candidate background:\n' + candidateContext()}
End with a one-line "⚡ Likely interviewer pushback:" and a one-sentence response to it.
Total under 450 words. No preamble — start directly with the first step header.`;
    const user = `Interview question (${cat ? cat.title : 'PM'}):\n"${question}"\n\nGive me the complete model answer.`;
    return { system, user };
  }

  function evaluatePrompts(question, stageName, stagePrompt, userAnswer, cat){
    const system =
`You are a supportive but rigorous PM interview tutor. The candidate answered ${stageName ? `the "${stageName}" step of` : ''} an interview question. Do FOUR things, in this exact format:
**Score:** x/10 — one-line justification.
**What worked:** 2 bullets.
**What's missing:** 2–3 bullets, specific to this question (not generic advice).
**Your answer, upgraded:** rewrite THEIR answer the way it should be delivered — keep their substance, voice and any real examples, but restructure, sharpen, and add what was missing. Write it as speakable first-person prose, under 200 words.
${cat && cat.id === 'behavioral' ? candidateContext() : ''}`;
    const user = `QUESTION: "${question}"${stagePrompt ? `\nSTEP BEING ANSWERED: ${stagePrompt}` : ''}\n\nCANDIDATE'S ANSWER:\n${userAnswer}`;
    return { system, user };
  }

  /* ---- tiny markdown-lite renderer for streamed answers (safe: escapes first) ---- */
  function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function md(s){
    let h = esc(s);
    h = h.replace(/^### (.*)$/gm,'<div style="font-weight:700;margin:10px 0 3px;color:var(--text)">$1</div>');
    h = h.replace(/^## (.*)$/gm,'<div style="font-weight:700;margin:10px 0 3px;color:var(--text)">$1</div>');
    h = h.replace(/\*\*(.+?)\*\*/g,'<b style="color:var(--text)">$1</b>');
    h = h.replace(/^[-•] (.*)$/gm,'<div style="display:flex;gap:7px;margin:2px 0"><span style="color:var(--accent-bright)">•</span><span>$1</span></div>');
    h = h.replace(/\n{2,}/g,'<div style="height:8px"></div>').replace(/\n/g,'<br>');
    return h;
  }

  /* ---- shared "chatbot panel" runner: streams into a target element ---- */
  const cache = new Map(); // question-key → completed text (don't re-bill on toggle)
  async function runInto(panelEl, cacheKey, promptFn){
    if(!configured()){
      panelEl.innerHTML = `<div style="font-size:13px;color:var(--text-dim);line-height:1.7">🔑 <b>Connect your AI first.</b> Add your OpenAI (GPT-4o) or Claude API key in <a href="#/settings">Settings</a> — it stays in this browser only. Then this button gives live tutor answers.</div>`;
      return;
    }
    if(cache.has(cacheKey)){ panelEl.innerHTML = md(cache.get(cacheKey)); return; }
    panelEl.innerHTML = `<div style="font-size:12.5px;color:var(--muted)">🤖 thinking<span class="aidots">…</span></div>`;
    try{
      const { system, user } = promptFn();
      const full = await stream({ system, user, onDelta: (_, sofar) => { panelEl.innerHTML = md(sofar) + '<span style="color:var(--accent-bright)">▌</span>'; } });
      panelEl.innerHTML = md(full);
      cache.set(cacheKey, full);
    }catch(e){
      panelEl.innerHTML = `<div style="font-size:13px;color:var(--red)">⚠ ${esc(e.message === 'NO_KEY' ? 'Add your API key in Settings first.' : e.message)}</div>`;
    }
  }

  window.CoachAI = { PROVIDERS, configured, provider, model, stream, completeAnswerPrompts, evaluatePrompts, md, runInto, candidateContext };
})();
