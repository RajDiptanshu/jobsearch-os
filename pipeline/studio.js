// Resume Studio: multiple CV versions + JD-driven ATS analysis + full ATS rewrite.
// Uses the exact PROMPT 1 / PROMPT 2 the user specified.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA } = require('./lib');
const { aiComplete } = require('./ai');
const { loadResume } = require('./resume');

const STORE = path.join(DATA, 'cv_versions.json');

function loadStore() {
  try { if (fs.existsSync(STORE)) return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
  return { versions: [], activeId: null };
}
function saveStore(s) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const tmp = STORE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
  fs.renameSync(tmp, STORE);
}
function ensureSeeded(env) {
  const s = loadStore();
  if (s.versions.length) return s;
  // seed with the user's current CV so there's always a base version
  let md = '';
  try { md = loadResume(env).markdown; } catch {}
  const v = { id: 'v' + Date.now().toString(36), name: 'Master CV', markdown: md, source: 'current-resume', created_at: new Date().toISOString() };
  s.versions.push(v); s.activeId = v.id;
  saveStore(s);
  return s;
}
function listVersions(env) {
  const s = ensureSeeded(env);
  return { activeId: s.activeId, versions: s.versions.map(v => ({ id: v.id, name: v.name, source: v.source, created_at: v.created_at, chars: (v.markdown || '').length })) };
}
function getVersion(env, id) { const s = ensureSeeded(env); return s.versions.find(v => v.id === id) || s.versions.find(v => v.id === s.activeId) || s.versions[0]; }
function addVersion(env, { name, markdown, source }) {
  const s = ensureSeeded(env);
  const v = { id: 'v' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), name: (name || 'Untitled').slice(0, 80), markdown: String(markdown || '').slice(0, 40000), source: source || 'manual', created_at: new Date().toISOString() };
  s.versions.unshift(v); if (!s.activeId) s.activeId = v.id;
  saveStore(s); return v;
}
function updateVersion(env, id, patch) {
  const s = ensureSeeded(env); const v = s.versions.find(x => x.id === id); if (!v) return null;
  if ('name' in patch) v.name = String(patch.name).slice(0, 80);
  if ('markdown' in patch) v.markdown = String(patch.markdown).slice(0, 40000);
  saveStore(s); return v;
}
function deleteVersion(env, id) {
  const s = ensureSeeded(env); s.versions = s.versions.filter(v => v.id !== id);
  if (s.activeId === id) s.activeId = s.versions[0] ? s.versions[0].id : null;
  saveStore(s); return true;
}
function setActive(env, id) { const s = ensureSeeded(env); if (s.versions.find(v => v.id === id)) { s.activeId = id; saveStore(s); } return s.activeId; }

/* ---------------- PROMPT 1 — ATS Keyword Analysis (user's exact spec) ---------------- */
async function analyze(cvMarkdown, jd, env) {
  const system =
`You are an expert ATS (Applicant Tracking System) analyst. Analyze the candidate's resume against the job description and produce a precise, actionable report. Be specific to THIS resume and THIS JD — no generic filler.
Output in clean markdown with these exact numbered sections:
1. **ATS Match Score** (out of 100) — one number + one line explaining it.
2. **Missing Keywords** — every important keyword/skill/tool in the JD that is absent from the resume, as a list.
3. **Formatting Issues** — flag anything that could break ATS parsing (tables, columns, images, headers/footers, unusual fonts, graphics). If the resume is clean, say so.
4. **Section-wise Feedback** — for each of Summary, Skills, Experience, Education: what to improve.
5. **Top 10 Keywords to Add** — ranked by importance for this specific role, as a numbered list.
6. **Rewritten Professional Summary** — an ATS-optimized summary tailored to this JD (3–4 lines, truthful to the resume).

After the markdown report, append EXACTLY this machine-readable block (so the app can build checkboxes) and nothing after it:
<<SUGGESTIONS>>
{"atsScore": <number>, "suggestions": [{"id":"s1","label":"<short actionable change, e.g. 'Add “A/B testing” to Skills'>"}, ...]}
<<END>>
Include 6–12 concrete, individually-selectable suggestions (keyword additions, bullet rewrites, section fixes) in that JSON.`;
  const user = `RESUME (markdown):\n${cvMarkdown}\n\nJOB DESCRIPTION:\n${jd}`;
  const raw = await aiComplete({ system, user, env, maxTokens: 3500 });
  // split human markdown from the machine block
  let markdown = raw, suggestions = [], atsScore = null;
  const m = raw.match(/<<SUGGESTIONS>>([\s\S]*?)<<END>>/);
  if (m) {
    markdown = raw.slice(0, m.index).trim();
    try { const j = JSON.parse(m[1].trim()); suggestions = Array.isArray(j.suggestions) ? j.suggestions : []; atsScore = j.atsScore ?? null; } catch {}
  }
  if (atsScore == null) { const sm = markdown.match(/(\d{1,3})\s*\/\s*100/); if (sm) atsScore = +sm[1]; }
  return { markdown, suggestions, atsScore };
}

/* ---------------- PROMPT 2 — Full Resume Rewrite (user's exact spec) ---------------- */
async function rewrite(cvMarkdown, jd, selectedSuggestions, env) {
  const picks = (selectedSuggestions || []).filter(Boolean);
  const system =
`You are an expert resume writer. Rewrite the candidate's COMPLETE resume, optimized for ATS and this specific job description. Stay 100% truthful — reorder, reword, and emphasize, but never invent employers, titles, dates, numbers, or skills the candidate doesn't have.

Hard requirements:
- Single-column layout only (no tables, no columns).
- Use these EXACT section headings, in this order: Contact Information, Professional Summary, Technical Skills, Work Experience, Projects, Education, Certifications.
- Integrate the JD's important/missing keywords naturally into the bullet points (only where truthful).
- Each Work Experience bullet must follow: [Action Verb] + [what you did] + [quantified result].
- Technical Skills: comma-separated plain text, no icons or symbols.
- Length: 1 page if under 2 years experience, otherwise 2 pages max.
- Output as clean markdown (# name, ## sections, - bullets, ** for role/company) so it can be copied into a DOCX/PDF. No commentary, no code fences — start with the name.`;
  const user =
`JOB DESCRIPTION:\n${jd}\n\n${picks.length ? `PRIORITIZE IMPLEMENTING THESE SELECTED CHANGES:\n- ${picks.join('\n- ')}\n\n` : ''}CANDIDATE'S CURRENT RESUME (markdown):\n${cvMarkdown}`;
  const out = await aiComplete({ system, user, env, maxTokens: 4000 });
  return out.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

/* ---------------- Interview War Room — personalized company dossier (S-Framework format) ---------------- */
async function warroom(cvMarkdown, jd, company, role, env) {
  const co = (company || 'the target company').trim();
  const rl = (role || 'Product Manager').trim();
  const system =
`You are an elite PM interview coach who builds personalized "Interview War Room" dossiers. Ground EVERY example in the candidate's ACTUAL resume — real employers, real projects, real metrics — never invent experience. Be specific to ${co}'s product domain (not generic). Output clean markdown with these EXACT sections, in this order:

# 🎯 Interview War Room — ${co} · ${rl}

## 1. Rounds You'll Face
A markdown table: | Round | Focus | What they're really testing | — 4–6 realistic rounds for this role.

## 2. Cross-Round Questions You'll Likely Get
A markdown table: | Theme | Example Question | Your Response Strategy | — 5–7 rows (Impact & ROI, Prioritization, Failure, Collaboration, Metrics, Domain depth). Use the candidate's REAL numbers in the strategy column.

## 3. Behavioral Story Playbook (STAR)
A markdown table: | Competency | Story Source (from resume) | Key Impact | — one row each for Influence without authority, Innovation, Analytical depth, Failure & learning, Leadership vision. Pull the Story Source and Impact straight from the resume.

## 4. ${co} Context Mapping
A markdown table: | ${co} PM Focus | Your Resume Leverage | — map 4–5 of ${co}'s likely product priorities to specific things on the candidate's resume.

## 5. 🎬 Live Interview Simulation
Simulate a realistic, high-pressure exchange for the 2 most likely flagship questions for this role. For EACH question use exactly this structure:
**Q (Interviewer):** <question specific to ${co}>
**Your Answer:** <crisp structured model answer grounded in the resume>
**Pushback:** "<a skeptical challenge>"
**Your Response:** <how to hold your ground with judgment>
**Interruption:** "<a mid-answer curveball>"
**Your Response:** <composed handling>
**Director follow-up:** "<a senior, strategic question>"
**Your Answer:** <mature, business-level answer>
*Interviewer hears: <one line on the signal this sends>*

## 6. 🏗️ System / Product Design Templates
For the 2–3 most likely design prompts for ${co}, give each as: **<Name>** — **Goal:** … **Flow:** (numbered 1–5) … **PM insight (say this):** "<a memorable one-liner>" … **Key trade-offs:** (bulleted).

## 7. 📖 One-Page Vocabulary Cheat Sheet (read 10 min before)
8–12 crisp term: definition lines relevant to ${co}'s domain and this role.

## 8. ✅ Final Confidence Check
5–6 first-person affirmations, each grounded in a REAL thing from the candidate's resume (e.g. "You've already shipped …").

No preamble, no closing commentary — start with the # heading.`;
  const user =
`TARGET COMPANY: ${co}\nTARGET ROLE: ${rl}\n\n${jd && jd.length > 30 ? `JOB DESCRIPTION:\n${jd}\n\n` : ''}CANDIDATE'S RESUME (markdown):\n${cvMarkdown}`;
  const out = await aiComplete({ system, user, env, maxTokens: 8000 });
  return out.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

module.exports = { listVersions, getVersion, addVersion, updateVersion, deleteVersion, setActive, analyze, rewrite, warroom, ensureSeeded };
