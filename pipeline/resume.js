// Resume tailoring + PDF export.
// - loadResume(env): reads the master resume markdown (RESUME_MD_PATH in .env)
// - tailorResume(job, env): AI rewrites the resume for a specific JD (truthful — reorder/reword, no fabrication)
// - resumePdf(markdown): renders a clean A4 PDF via Playwright's chromium (already a dependency)
'use strict';
const fs = require('fs');
const path = require('path');
const { aiComplete } = require('./ai');

// Prefer the user's ACTUAL current CV (converted from Diptanshu_PM.pdf) so tailored drafts
// are copy-paste compatible with what they really send out; fall back to the old master.
const DEFAULT_RESUME = fs.existsSync(path.join(__dirname, '..', 'data', 'resume_current.md'))
  ? path.join(__dirname, '..', 'data', 'resume_current.md')
  : path.join(__dirname, '..', '..', 'Career_Switch_2026', '09_Resume', 'master_resume.md');

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
`You are an expert resume writer for product managers. Tailor the candidate's resume to ONE specific job description while KEEPING THE FORMAT, STRUCTURE, AND LENGTH IDENTICAL. Stay 100% truthful.

This resume renders into a fixed single-page template. Your job is to change ONLY the wording to reflect the JD — not the layout. Follow these rules exactly:

MUST NOT CHANGE (copy through verbatim):
- The name line "# DIPTANSHU" and the contact line right under it.
- Every section heading (## Professional Summary, ## Professional Experience, ## Education & Academic Achievements, ## Skills & Core Competencies) — same headings, same order.
- Every company/role header line and its date, EXACTLY, including the " | " separators and the " @ Date" suffix (e.g. "### FAREPORTAL | Product Manager | Gurugram @ Apr'23 – Present").
- The italic sub-group headers (*Fraud Prevention & Risk Decisioning*, *Payments & AI*, *Growth & Customer Experience*).
- The **Awards:** line, the three **Skills** category labels (**Fraud & Risk:**, **Payments:**, **Product & Tools:**), and the Education bullets with their " @ Year".
- The SAME NUMBER of bullets under every role — do not add, remove, split, or merge bullets.

MAY CHANGE (only to align with the JD, and only where truthful):
- Reword the Professional Summary to echo the target role's language/title.
- Reword individual experience bullets to surface the JD's keywords and emphasize the most relevant impact FIRST within each bullet. Keep the leading "**Bold Label:**" where one exists.
- CRITICAL: keep the TOTAL length equal to or slightly SHORTER than the original so it stays ONE page — each bullet must stay ≤ 2 printed lines. If a reworded bullet gets longer, trim words elsewhere to compensate. Never make the resume longer than the source.
- Reorder the comma-separated items inside each Skills line so JD-relevant skills the candidate genuinely has come first. Do not invent new skills.
- Preserve all real numbers/metrics (e.g. ~\$150K, 70%, 66% YoY, 42% → 63%) — you may keep them as-is or move them earlier, never change or drop them.

NEVER invent employers, titles, dates, numbers, skills, or bullets.
Output ONLY the tailored resume markdown, starting with "# DIPTANSHU". No commentary, no code fences.`;
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
  // claude-sonnet-5 has extended thinking on, which occasionally eats the token budget and
  // returns an empty or truncated resume. Give generous headroom and validate the result,
  // retrying up to 3x; only a well-formed full resume (name + all sections) is accepted.
  const looksComplete = (s) => s.includes('# DIPTANSHU')
    && /##\s*Professional Experience/i.test(s)
    && /##\s*Skills & Core Competencies/i.test(s)
    && s.length > 2500;
  let last = '', lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await aiComplete({ system, user, env, maxTokens: 6000 });
      last = raw.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/, '').trim();
      if (looksComplete(last)) return last;
    } catch (e) { lastErr = e; }
  }
  if (looksComplete(last)) return last;
  throw new Error(lastErr ? `tailoring failed (${lastErr.message}) — please try again` : 'tailoring returned an incomplete resume — please try again');
}

/* ---------- markdown → styled HTML → PDF ----------
   Renders to the EXACT template of Diptanshu_PM_Fintech_Fraud_Template_2_4.pdf:
   Carlito/Calibri, accent blue #2e74b5, US-Letter, single page.
   Structure conventions the markdown must follow:
     # Name                         → centered black name
     (line right after # )          → centered blue contact strip
     ## Section                     → blue uppercase heading with underline rule
     ### COMPANY | Role | Loc @ Date → company (blue) + role/loc (black bold), date right-aligned
     *Sub-group*                    → bold-italic sub-header
     - bullet                       → disc bullet (education bullets may use " @ Year" for a right date)
     **Label:** text                → paragraph with bold lead-in (skills / awards)
*/
const ACCENT = '#2e74b5';
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); }
function splitDate(s) { const i = s.indexOf(' @ '); return i >= 0 ? [s.slice(0, i).trim(), s.slice(i + 3).trim()] : [s, null]; }

function roleHtml(text) {
  const [left, date] = splitDate(text);
  const p = left.indexOf(' | ');
  const comp = p >= 0 ? left.slice(0, p) : left;
  const rest = p >= 0 ? left.slice(p) : '';
  return `<div class="role"><div class="roleL"><span class="co">${inline(comp)}</span>${rest ? `<span class="rr">${inline(rest)}</span>` : ''}</div>${date ? `<div class="rd">${inline(date)}</div>` : ''}</div>`;
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  let html = '', inList = false, afterH1 = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    let m;
    if ((m = line.match(/^# (.+)/))) { closeList(); html += `<h1>${inline(m[1])}</h1>`; afterH1 = true; continue; }
    if ((m = line.match(/^## (.+)/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; afterH1 = false; continue; }
    if ((m = line.match(/^### (.+)/))) { closeList(); html += roleHtml(m[1]); afterH1 = false; continue; }
    if ((m = line.match(/^[-•] (.+)/))) {
      if (!inList) { html += '<ul>'; inList = true; }
      const [txt, date] = splitDate(m[1]);
      html += date ? `<li><div class="drow"><span>${inline(txt)}</span><span class="ld">${inline(date)}</span></div></li>` : `<li>${inline(m[1])}</li>`;
      continue;
    }
    closeList();
    if (afterH1) { html += `<div class="contact">${inline(line)}</div>`; afterH1 = false; continue; }
    if (/^\*[^*].*\*$/.test(line)) { html += `<div class="rolegroup">${inline(line.slice(1, -1))}</div>`; continue; }
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

// Shared CSS (units templated so PDF uses px/pt and Word uses pt).
function css(u) {
  const b = u === 'pt';
  return `
  * { box-sizing: border-box; }
  body { font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif; font-size: 10.2pt; line-height: 1.2; color: #000; margin: 0; }
  h1 { font-size: 15.5pt; font-weight: 700; text-align: center; margin: 0 0 1pt; color: #000; letter-spacing: .3px; }
  .contact { text-align: center; font-size: 10.2pt; color: ${ACCENT}; margin: 0 0 5pt; }
  h2 { font-size: 10.8pt; font-weight: 700; text-transform: uppercase; color: ${ACCENT}; margin: 6.5pt 0 2pt; border-bottom: 1.2pt solid ${ACCENT}; padding-bottom: 1pt; }
  .role { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; margin: 4pt 0 1pt; }
  .role .co { font-size: 11.2pt; font-weight: 700; color: ${ACCENT}; }
  .role .rr { font-size: 10.2pt; font-weight: 700; color: #000; }
  .role .rd { font-size: 10.2pt; font-weight: 700; color: #000; white-space: nowrap; }
  .rolegroup { font-size: 10.2pt; font-weight: 700; font-style: italic; color: #000; margin: 2pt 0 1pt; }
  p { margin: 1.5pt 0; }
  ul { margin: 1pt 0 2pt; padding-left: 14pt; }
  li { margin: 1pt 0; }
  .drow { display: flex; justify-content: space-between; gap: 12pt; }
  .drow .ld { font-weight: 700; white-space: nowrap; }
  b { font-weight: 700; color: #000; }
  i { font-style: italic; }`;
}

function resumeHtml(md) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 10mm 12mm; }
  ${css('px')}
  </style></head><body>${mdToHtml(md)}</body></html>`;
}

// Word-compatible .doc export (HTML that MS Word opens natively) — same template, Letter, 1 page.
function resumeDocHtml(md) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>CV</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: 8.5in 11in; margin: 0.42in 0.5in; }
  ${css('pt')}
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
    // Guarantee a single page: measure the content at the printable width and, only if it
    // overflows, scale down just enough to fit. The base CV fits at 1.0 (no change); a
    // slightly-longer tailored draft gets a barely-perceptible shrink instead of spilling.
    const scale = await page.evaluate(() => {
      const PRINT_W = 8.5 * 96 - 2 * (12 / 25.4 * 96);   // Letter width − 12mm side margins @96dpi
      const PRINT_H = 11 * 96 - 2 * (10 / 25.4 * 96);    // Letter height − 10mm top/bottom margins
      document.body.style.width = PRINT_W + 'px';
      const h = document.body.getBoundingClientRect().height;
      return h > PRINT_H ? Math.max(0.75, PRINT_H / h) : 1;
    });
    return await page.pdf({ format: 'Letter', printBackground: true, scale, margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' } });
  } finally { await browser.close(); }
}

module.exports = { loadResume, tailorResume, resumePdf, resumeHtml, resumeDocHtml };
