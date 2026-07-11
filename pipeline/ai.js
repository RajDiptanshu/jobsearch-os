// Server-side AI client for resume tailoring (Anthropic Claude or OpenAI GPT-4o).
// Keys live in .env: AI_PROVIDER=anthropic|openai, ANTHROPIC_API_KEY / OPENAI_API_KEY, optional AI_MODEL.
'use strict';

function aiConfig(env) {
  const provider = (env.AI_PROVIDER || (env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic')).toLowerCase();
  const key = provider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  const model = env.AI_MODEL || (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-5');
  return { provider, key: (key || '').trim(), model };
}

async function aiComplete({ system, user, env, maxTokens = 3000 }) {
  const { provider, key, model } = aiConfig(env);
  if (!key) throw new Error('No AI key configured — add ANTHROPIC_API_KEY or OPENAI_API_KEY to jobsearch-os\\.env');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    let res, text;
    if (provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
      });
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const d = await res.json();
      text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    } else {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
      });
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const d = await res.json();
      // claude-sonnet-5 emits a "thinking" content block first (extended thinking on by default),
      // so join ALL text-type blocks rather than assuming content[0] is the answer.
      text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    }
    if (!text) throw new Error('empty AI response');
    return text;
  } finally { clearTimeout(t); }
}

module.exports = { aiComplete, aiConfig };
