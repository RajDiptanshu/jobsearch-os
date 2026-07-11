// Email digest: new matches with JD summary + tailoring suggestions.
// Sends via Gmail SMTP (app password in .env) when configured; always archives HTML to data/outbox/.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA } = require('./lib');

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function scoreColor(n) { return n >= 85 ? '#b8945a' : n >= 70 ? '#0f9d6e' : n >= 55 ? '#c78a33' : '#6b7280'; }

function jobCardHtml(job) {
  const s = job.score || { total: 0, breakdown: {}, domains_hit: [], skills_hit: [] };
  const chips = (s.domains_hit || []).map(d => `<span style="display:inline-block;background:#ecfdf5;color:#065f46;border-radius:10px;padding:2px 8px;font-size:11px;margin:2px">${esc(d.domain)}</span>`).join('');
  const sugg = (job.suggestions || []).slice(0, 6).map(x => `<li style="margin:6px 0;font-size:13px;color:#374151">${esc(x.text)}</li>`).join('');
  const jdSnippet = job.description ? esc(job.description.slice(0, 700)) + (job.description.length > 700 ? '…' : '') : '<i>Full JD not captured — open the posting for details.</i>';
  return `
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:14px 0;background:#fff">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <a href="${esc(job.apply_url || job.url)}" style="font-size:16px;font-weight:700;color:#0f9d6e;text-decoration:none">${esc(job.title)}</a>
        <div style="font-size:13px;color:#111827;margin-top:2px"><b>${esc(job.company)}</b> · ${esc(job.location || '—')}${job.salary ? ' · ' + esc(job.salary) : ''}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">Source: ${esc(job.source)}${job.posted_at ? ' · Posted: ' + new Date(job.posted_at).toDateString() : ''}</div>
      </td>
      <td align="right" valign="top" style="white-space:nowrap">
        <div style="font-size:22px;font-weight:800;color:${scoreColor(s.total)}">${s.total}%</div>
        <div style="font-size:10px;color:#9ca3af">MATCH · ${(s.confidence || 'med').toUpperCase()} CONF</div>
      </td>
    </tr></table>
    <div style="margin-top:8px">${chips}</div>
    <details style="margin-top:10px">
      <summary style="font-size:13px;color:#1f2937;cursor:pointer;font-weight:600">Job description (snippet)</summary>
      <div style="font-size:12px;color:#4b5563;white-space:pre-wrap;margin-top:6px;max-height:220px;overflow:auto">${jdSnippet}</div>
    </details>
    <div style="margin-top:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px">
      <div style="font-size:12px;font-weight:700;color:#166534;margin-bottom:4px">✍️ RESUME CHANGES SUGGESTED FOR THIS JD</div>
      <ul style="margin:0;padding-left:18px">${sugg || '<li style="font-size:13px">Looks aligned — apply with the master resume.</li>'}</ul>
    </div>
    <div style="margin-top:10px">
      <a href="${esc(job.apply_url || job.url)}" style="background:linear-gradient(140deg,#10b981,#0c8f66);color:#04130d;font-size:13px;font-weight:700;padding:9px 16px;border-radius:8px;text-decoration:none">Apply / View posting →</a>
    </div>
  </div>`;
}

function buildDigestHtml(newJobs, runInfo, profile, draftCount = 0) {
  const top = newJobs.slice().sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
  const best = top[0];
  const draftsBanner = draftCount ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px 16px;margin:14px 0 0;font-size:13px;color:#065f46">📎 <b>${draftCount} tailored CV draft${draftCount === 1 ? '' : 's'} attached</b> — your current CV rewritten for the top match${draftCount === 1 ? '' : 'es'} below. Open in Word, review/tweak, save as PDF, apply.</div>` : '';
  return `<!doctype html><html><body style="margin:0;background:#eef1f0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:20px">
    <div style="background:linear-gradient(150deg,#0d1512 0%,#08090c 100%);border:1px solid #1c2a24;border-radius:16px;padding:22px;color:#fff">
      <div style="font-size:20px;font-weight:700;letter-spacing:-.3px">JobSearchOS — ${top.length} new match${top.length === 1 ? '' : 'es'}</div>
      <div style="font-size:13px;color:#9fb1c0;margin-top:5px">Scanned ${new Date(runInfo.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · ${runInfo.sources_ok}/${runInfo.sources_total} sources · Best: <b style="color:#c9a86a">${best ? best.score.total + '% — ' + esc(best.title) + ' @ ' + esc(best.company) : '—'}</b></div>
      <div style="font-size:12px;color:#7c8896;margin-top:7px">Dashboard: <a href="http://localhost:${runInfo.port || 4321}" style="color:#34d399">http://localhost:${runInfo.port || 4321}</a></div>
    </div>
    ${draftsBanner}
    ${top.map(jobCardHtml).join('')}
    <div style="font-size:11px;color:#9ca3af;text-align:center;padding:16px">
      JobSearchOS · automated hourly scan for ${esc(profile.identity.name)} · profile: PM / fraud-risk-payments / GenAI · ${esc(profile.identity.location)}
    </div>
  </div></body></html>`;
}

function archiveDigest(html) {
  const outDir = path.join(DATA, 'outbox');
  fs.mkdirSync(outDir, { recursive: true });
  const file = `digest-${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
  fs.writeFileSync(path.join(outDir, file), html, 'utf8');
  return file;
}

async function sendDigest(newJobs, runInfo, profile, env, attachments = []) {
  if (!newJobs.length) return { sent: false, reason: 'no new jobs', archived: null };
  const html = buildDigestHtml(newJobs, runInfo, profile, attachments.length);
  const archived = archiveDigest(html);
  const best = newJobs.slice().sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0))[0];
  const subject = `🎯 ${newJobs.length} new job match${newJobs.length === 1 ? '' : 'es'} — top: ${best.score?.total || '?'}% ${best.title} @ ${best.company}`;

  const user = env.GMAIL_USER || env.SMTP_USER;
  const pass = env.GMAIL_APP_PASSWORD || env.SMTP_PASS;
  const to = env.DIGEST_TO || profile.identity.email;

  if (!user || !pass) {
    return { sent: false, reason: 'SMTP not configured (set GMAIL_USER + GMAIL_APP_PASSWORD in .env)', archived, subject };
  }

  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch { return { sent: false, reason: 'nodemailer not installed (run npm install)', archived, subject }; }

  const transporter = nodemailer.createTransport(
    env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: +(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', auth: { user, pass } }
      : { service: 'gmail', auth: { user, pass } }
  );
  try {
    await transporter.sendMail({ from: `"JobSearchOS" <${user}>`, to, subject, html, attachments });
    return { sent: true, to, archived, subject, drafts: attachments.length };
  } catch (e) {
    return { sent: false, reason: `send failed: ${e.message}`, archived, subject };
  }
}

module.exports = { sendDigest, buildDigestHtml };
