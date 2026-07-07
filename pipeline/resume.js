// Resume tailoring + PDF export.
// - loadResume(env): reads the master resume markdown (RESUME_MD_PATH in .env)
// - tailorResume(job, env): AI rewrites the resume for a specific JD (truthful — reorder/reword, no fabrication)
// - resumePdf(markdown): renders a clean A4 PDF via Playwright's chromium (already a dependency)
'use strict';
const fs = require('fs');
const path = require('path');
const { aiComplete } = require('./ai');

const DEFAULT_RESUME = path.join(__dirname, '..', '..', 'Career_Switch_2026', '09_Resume', 'master_resume.md');

function loadResume(env) {
  const p = env.RESUME_MD_PATH && fs.existsSync(env.RESUME_MD_PATH) ? env.RESUME_MD_PATH : DEFAULT_RESUME;
  if (!fs.existsSync(p)) throw new Error(`Resume markdown not found — set RESUME_MD_PATH in .env (looked at ${p})`);
  let md = fs.readFileSync(p, 'utf8');
  // strip internal notes section (everything from the "ATS Optimization Notes" rule onward)
  md = md.split(/\n---\s*\n### ATS Optimization Notes/)[0].trim();
  return { markdown: md, path: p };
}

async function tailorResume(job, env) {
  const { markdown } = loadResume(env);
  const suggestions = (job.suggestions || []).map(s => `- ${s.text}`).join('\n');
  const system =
`You are an expert resume writer for product managers. Rewrite the candidate's resume so it is maximally tailored to ONE specific job description, while staying 100% truthful.

Hard rules:
- NEVER invent employers, titles, dates, numbers, or skills not present in the original. You may reorder, reword, emphasize, merge, or drop bullets — never fabricate.
- Keep the exact same markdown structure conventions as the input (# name, contact line, ## sections, ### roles, bold, "-" bullets).
- Rewrite the Professional Summary to mirror the target role's language and echo the job title.
- Reorder bullets inside each role so the most JD-relevant ones come first; sharpen wording with the JD's own keywords where truthful.
- Reorder/edit Core Skills so the JD's required skills (that the candidate genuinely has) appear first.
- Keep total length roughly the same or slightly shorter (this must stay a 2-page resume).
- Output ONLY the tailored resume markdown. No commentary, no code fences.`;
  const user =
`TARGET JOB
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || '—'}

JOB DESCRIPTION:
${(job.description || '(full JD not captured — tailor from the title, company and suggestions below)').slice(0, 6000)}

TAILORING SUGGESTIONS ALREADY IDENTIFIED (apply the ones that make sense):
${suggestions || '(none)'}

CANDIDATE'S CURRENT MASTER RESUME (markdown):
${markdown}`;
  const tailored = await aiComplete({ system, user, env, maxTokens: 4000 });
  return tailored.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/* ---------- markdown → styled HTML → PDF ---------- */
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); }

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  let html = '', inList = false, first = true;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    let m;
    if ((m = line.match(/^# (.+)/))) { closeList(); html += `<h1>${inline(m[1])}</h1>`; first = false; continue; }
    if ((m = line.match(/^## (.+)/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; continue; }
    if ((m = line.match(/^### (.+)/))) { closeList(); html += `<h3>${inline(m[1])}</h3>`; continue; }
    if ((m = line.match(/^[-•] (.+)/))) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(m[1])}</li>`; continue; }
    closeList();
    // the line right after the H1 is the contact strip
    if (html.endsWith('</h1>')) { html += `<div class="contact">${inline(line)}</div>`; continue; }
    if (/^\*[^*].*\*$/.test(line)) { html += `<div class="rolegroup">${inline(line.slice(1, -1))}</div>`; continue; }
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

function resumeHtml(md) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 13mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 9.6pt/1.42 'Segoe UI', Calibri, Arial, sans-serif; color: #1a2330; margin: 0; }
  h1 { font-size: 19pt; letter-spacing: .3px; margin: 0 0 2px; color: #0d3b2e; }
  .contact { font-size: 8.8pt; color: #445264; border-bottom: 1.6px solid #0f9d6e; padding-bottom: 6px; margin-bottom: 8px; }
  h2 { font-size: 10.6pt; text-transform: uppercase; letter-spacing: 1.1px; color: #0f9d6e; margin: 11px 0 4px; border-bottom: 1px solid #dde4ec; padding-bottom: 2px; }
  h3 { font-size: 10pt; margin: 7px 0 1px; color: #14202e; }
  .rolegroup { font-size: 9pt; font-style: italic; color: #52606f; margin: 5px 0 2px; }
  p { margin: 2px 0; }
  ul { margin: 2px 0 4px; padding-left: 15px; }
  li { margin: 1.5px 0; text-align: justify; }
  b { color: #10202f; }
  </style></head><body>${mdToHtml(md)}</body></html>`;
}

async function resumePdf(markdown) {
  let pw;
  try { pw = require('playwright'); }
  catch { throw new Error('playwright not installed — run: npm run setup-naukri (installs chromium)'); }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(resumeHtml(markdown), { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '13mm', bottom: '13mm', left: '14mm', right: '14mm' } });
  } finally { await browser.close(); }
}

module.exports = { loadResume, tailorResume, resumePdf, resumeHtml };
