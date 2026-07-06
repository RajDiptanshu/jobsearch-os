// Application generator + sender (Tsenta "Apply" step).
// For every >= threshold match it builds a tailored recruiter email, screening answers, and a channel
// (email when a recruiter address is known, else the portal apply link). Sending is gated by run.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA } = require('./lib');

function norm(s) { return (s || '').toLowerCase(); }
function hit(text, kw) {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(text);
}

// Pick the 3 achievements whose tags best match this JD
function topEvidence(job, profile, n = 3) {
  const jd = norm(job.title + '\n' + job.description);
  const scored = profile.evidence.map(ev => ({ ev, hits: ev.tags.filter(t => hit(jd, t)).length }))
    .sort((a, b) => b.hits - a.hits);
  const picked = scored.filter(x => x.hits > 0).slice(0, n).map(x => x.ev);
  // fall back to the flagship three if nothing matched
  if (!picked.length) return profile.evidence.slice(0, n);
  return picked;
}

function buildEmail(job, profile) {
  const id = profile.identity;
  const ev = topEvidence(job, profile, 3);
  const roleLine = job.title ? `the ${job.title} role${job.company ? ` at ${job.company}` : ''}` : `a Product Manager opening${job.company ? ` at ${job.company}` : ''}`;
  const subject = `Application: ${job.title || 'Product Manager'}${job.company ? ` — ${job.company}` : ''} | ${id.name}, PM (Fraud/Payments/GenAI)`;

  const bullets = ev.map(e => `• ${e.headline}.`).join('\n');
  const body =
`Hi${job.company ? ` ${job.company} team` : ' there'},

I'd like to apply for ${roleLine}. I'm a Product Manager with ${id.total_experience_years}+ years of experience (${id.pm_experience_years}+ in product management) across fraud, risk and payments on a high-volume travel marketplace, with recent 0→1 GenAI work — a strong fit for what this role needs.

A few results most relevant to this role:
${bullets}

Quick context: currently ${id.current_role}; MBA (Strategy, IT & Systems) from IIM Lucknow. Open to ${(profile.targets.locations.preferred || []).slice(0,2).join(' / ')} and remote. My resume is attached, and I'm happy to share more detail or walk through any of the above.

Best regards,
${id.name}
${id.phone} · ${id.email}
https://${id.linkedin}`;

  return { subject, body };
}

function buildScreeningAnswers(job, profile) {
  const id = profile.identity;
  const jd = norm(job.title + ' ' + job.description);
  const qa = [
    { q: 'Total experience', a: `${id.total_experience_years}+ years (including ${id.pm_experience_years}+ years in product management).` },
    { q: 'Current company & role', a: id.current_role },
    { q: 'Notice period', a: `${id.notice_period_days} days` },
    { q: 'Current CTC', a: `₹${(id.current_ctc_inr / 100000).toFixed(1)}L per annum` },
    { q: 'Expected CTC', a: `₹${(id.expected_ctc_inr / 100000).toFixed(1)}L per annum (negotiable for the right role)` },
    { q: 'Preferred location', a: `${(profile.targets.locations.preferred || []).slice(0, 2).join(' / ')}; open to remote/hybrid` },
    { q: 'Education', a: (id.education || []).join('; ') },
    { q: 'Why this role', a: `Direct overlap with my fraud/risk/payments and GenAI product background${/payment|fintech|fraud|risk/.test(jd) ? ' — this is exactly the domain I ship in today' : ''}.` }
  ];
  return qa;
}

// Build the application package for a job (does not send)
function generateApplication(job, profile) {
  const { subject, body } = buildEmail(job, profile);
  const screening = buildScreeningAnswers(job, profile);
  const recruiter = job.recruiter_email || null;
  const applyUrl = job.apply_url || job.url || '';
  const channel = recruiter ? 'email' : 'portal';
  return {
    status: 'draft',            // draft → (queued) → sent | applied | skipped
    channel,                    // 'email' (auto-sendable) | 'portal' (one-click open)
    recruiter_email: recruiter,
    apply_url: applyUrl,
    subject,
    body,
    screening,
    generated_at: new Date().toISOString(),
    sent_at: null
  };
}

// Send the application email via SMTP with the resume PDF attached
async function sendApplicationEmail(job, profile, env) {
  const app = job.application;
  if (!app || app.channel !== 'email' || !app.recruiter_email) return { ok: false, reason: 'no email channel' };
  const user = env.GMAIL_USER || env.SMTP_USER;
  const pass = env.GMAIL_APP_PASSWORD || env.SMTP_PASS;
  if (!user || !pass) return { ok: false, reason: 'SMTP not configured' };

  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return { ok: false, reason: 'nodemailer missing' }; }

  const attachments = [];
  const resumePath = env.RESUME_PATH;
  if (resumePath && fs.existsSync(resumePath)) {
    attachments.push({ filename: path.basename(resumePath), path: resumePath });
  }
  const transporter = nodemailer.createTransport(
    env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: +(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', auth: { user, pass } }
      : { service: 'gmail', auth: { user, pass } }
  );
  try {
    const info = await transporter.sendMail({
      from: `"${profile.identity.name}" <${user}>`,
      to: app.recruiter_email,
      cc: env.APPLY_CC || undefined,
      bcc: env.APPLY_BCC || user, // keep a copy in your own inbox
      subject: app.subject,
      text: app.body + (attachments.length ? '' : '\n\n(Resume: set RESUME_PATH in .env to auto-attach.)'),
      attachments
    });
    // archive a copy of what was sent
    try {
      const dir = path.join(DATA, 'applications');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${job.id}.txt`),
        `TO: ${app.recruiter_email}\nSUBJECT: ${app.subject}\n\n${app.body}\n`, 'utf8');
    } catch {}
    return { ok: true, to: app.recruiter_email, messageId: info.messageId, attached: attachments.length > 0 };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { generateApplication, sendApplicationEmail, buildEmail, buildScreeningAnswers, topEvidence };
