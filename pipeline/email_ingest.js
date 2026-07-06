// Gmail IMAP ingestion of job-alert emails (IIM Jobs, Hirist, Instahyre, LinkedIn, direct recruiter mails…).
// Uses the same GMAIL_APP_PASSWORD as the digest sender. Fail-soft: no creds / IMAP error → [] with a health note.
'use strict';
const { loadJson, makeJob, stripHtml, parseDate, sha1 } = require('./lib');

function domainOf(addr) { const m = (addr || '').match(/@([^>\s]+)/); return m ? m[1].toLowerCase() : ''; }

// Many portal alerts put the job in a clean subject line — parse those directly.
// "Diptanshu, apply now to 'Product Manager at Adobe'"  → {Product Manager, Adobe}
// "Principal Product Manager @ MoEngage Inc"            → {Principal Product Manager, MoEngage Inc}
const ROLE_RE = /\b(product|program|project|associate|senior|sr|junior|lead|principal|staff|group)\b|\b(manager|owner|head|director|vp|lead|principal|engineer|designer|analyst|specialist|architect|developer|consultant|strategist|officer)\b/i;
// LinkedIn/Naukri notifications that are NOT job alerts
const NON_JOB_RE = /appeared in|viewed your|who'?s viewed|connection|invitation|congratulat|security advice|block this recruiter|reset your|verify your|reserve your spot|seats? left|webinar|follow |accept\b|profile is|endorse|anniversary|birthday|message from|new message|you have \d+ notification/i;

function parseSubjectJob(subject) {
  let s = (subject || '').replace(/^\s*(re|fwd?):\s*/i, '').trim();
  if (NON_JOB_RE.test(s)) return null;
  s = s.replace(/^[A-Z][a-z]+,\s*/, '');                 // strip "Name, " greeting
  s = s.replace(/^\s*(apply\s+(?:now\s+)?to|new job:|job alert:|hiring:|now hiring:?)\s*/i, '');
  s = s.replace(/^['"‘’“”]+|['"‘’“”]+$/g, '').trim();
  let title = null, company = null;
  let m = s.match(/^(.+?)\s+(?:at|@)\s+(.+?)['"’”]?\s*$/i);
  if (m && m[1].length <= 80 && m[2].length <= 60) { title = m[1].trim(); company = m[2].replace(/['"’”]+$/, '').trim(); }
  else { m = s.match(/^(.+?)\s+[-–—|]\s+(.+)$/); if (m && m[2].length <= 60) { title = m[1].trim(); company = m[2].trim(); } }
  if (!title || !ROLE_RE.test(title)) return null;        // must look like a real job title
  // guard against swapped/garbage like "Product Jobs": X @ Y
  if (/\bjobs?\b\s*[:"]/i.test(title)) return null;
  return { title, company };
}
function isDigestSubject(subject) {
  return /\d+\s+(new\s+)?jobs?|jobs?\s+for\s+you|recommended|top\s+jobs|jobs?\s+matching|new\s+jobs?|job\s+recommendations|picked\s+for\s+you/i.test((subject || '').toLowerCase());
}

// Pull plausible job links + titles out of a portal-alert email's HTML
function extractJobsFromHtml(html, senderDomain, portalDomains) {
  const out = [];
  if (!html) return out;
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html))) {
    let href = m[1].trim();
    const text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('#')) continue;
    // job-detail-ish links only
    if (!/job|jd|opening|apply|position|vacanc|hiring|\/jobs?\//i.test(href)) continue;
    // skip obvious nav/footer/unsubscribe
    if (/unsubscribe|preferences|privacy|settings|help|login|profile\/edit|mailto/i.test(href)) continue;
    if (text.length < 6 || text.length > 140) continue;
    if (/unsubscribe|view (all|more)|see all|manage|update your|click here|browse|home|log ?in|sign ?in/i.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // title/company split heuristics: "Title at Company" | "Title - Company" | "Title, Company"
    let title = text, company = '';
    let sp = text.match(/^(.*?)\s+(?:at|@|with|-|–|—|\|)\s+(.+)$/);
    if (sp && sp[2].length <= 60 && !/manager|lead|head|director|engineer|analyst/i.test(sp[2])) { title = sp[1].trim(); company = sp[2].trim(); }
    out.push({ title, company, href: href.split('#')[0] });
    if (out.length >= 15) break;
  }
  return out;
}

async function ingestEmails(env) {
  const user = env.GMAIL_USER || env.IMAP_USER || env.SMTP_USER;
  const pass = env.GMAIL_APP_PASSWORD || env.IMAP_PASS || env.SMTP_PASS;
  if (!user || !pass) return { jobs: [], ok: false, reason: 'not configured (needs GMAIL_USER + GMAIL_APP_PASSWORD)' };

  let ImapFlow, simpleParser;
  try { ({ ImapFlow } = require('imapflow')); ({ simpleParser } = require('mailparser')); }
  catch { return { jobs: [], ok: false, reason: 'imapflow/mailparser not installed (npm install)' }; }

  const cfg = loadJson('email_sources.json', { portal_domains: [], subject_keywords: [], lookback_days: 7, max_emails_per_scan: 40 });
  const portals = cfg.portal_domains || [];
  const keywords = (cfg.subject_keywords || []).map(s => s.toLowerCase());
  const ignore = (cfg.ignore_senders || []).map(s => s.toLowerCase());
  const host = env.IMAP_HOST || 'imap.gmail.com';

  const client = new ImapFlow({ host, port: +(env.IMAP_PORT || 993), secure: true, auth: { user, pass }, logger: false, emitLogs: false });
  const jobs = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - (cfg.lookback_days || 7) * 86400000);
      // pass 1: envelopes, pick relevant uids
      const candidates = [];
      for await (const msg of client.fetch({ since }, { envelope: true, uid: true })) {
        const env2 = msg.envelope || {};
        const from = (env2.from && env2.from[0]) || {};
        const fromAddr = (from.address || '').toLowerCase();
        const fromDomain = domainOf(fromAddr);
        const subject = (env2.subject || '').toLowerCase();
        if (fromAddr === user.toLowerCase()) continue;            // skip our own digest emails (no feedback loop)
        if (/🎯|job match(es)? — top:/i.test(env2.subject || '')) continue; // our digest subject
        if (ignore.some(ig => fromAddr.includes(ig))) continue;
        const isPortal = portals.some(d => fromDomain === d || fromDomain.endsWith('.' + d));
        const subjHit = keywords.some(k => subject.includes(k));
        if (isPortal || subjHit) candidates.push({ uid: msg.uid, fromAddr, fromDomain, isPortal, subject: env2.subject || '', date: env2.date, replyTo: (env2.replyTo && env2.replyTo[0] && env2.replyTo[0].address) || null });
      }
      // newest first, cap per scan (IMAP returns oldest-first, so sort before slicing)
      candidates.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      const picked = candidates.slice(0, cfg.max_emails_per_scan || 40);
      // pass 2: fetch source + parse
      for (const c of picked) {
        try {
          const { content } = await client.download(c.uid, null, { uid: true });
          const chunks = [];
          for await (const ch of content) chunks.push(ch);
          const mail = await simpleParser(Buffer.concat(chunks));
          const html = mail.html || (mail.textAsHtml || '');
          const senderName = (mail.from && mail.from.value && mail.from.value[0] && mail.from.value[0].name) || c.fromDomain;

          if (c.isPortal) {
            const srcTag = `email:${c.fromDomain.replace(/^(www\.|match\.|em\.|e\.|mailer\.|updates\.|digest\.|alerts?\.)/, '').replace(/\.(com|in|io|co|tech|fyi|club)$/, '')}`;
            const bodyMail = (html.match(/mailto:([^"'?>\s]+)/i) || [])[1] || null;
            const recruiter = (bodyMail && !/no-?reply|donotreply/i.test(bodyMail)) ? bodyMail : null;
            const firstJobLink = (html.match(/href=["'](https?:\/\/[^"']*(?:\/jobs?\/|job-?listing|\/jd|jobdetail|apply|\/viewjob|position|opening|jobId=|currentJobId=)[^"']*)["']/i) || [])[1] || '';

            if (isDigestSubject(c.subject)) {
              // multi-job digest (IIM Jobs, "5 new jobs…") — pull job links from the HTML
              for (const f of extractJobsFromHtml(html, c.fromDomain, portals)) {
                jobs.push(makeJob({
                  title: f.title, company: f.company || senderName.replace(/\s*(job|alert|team|noreply|no-reply).*/i, '').trim() || c.fromDomain,
                  location: '', url: f.href, posted_at: parseDate(mail.date), source: srcTag, description: '',
                  recruiter_email: recruiter, notes: `digest email "${(c.subject || '').slice(0, 80)}"`
                }));
              }
            } else {
              // single-job alert (LinkedIn/Indeed/etc.) — the subject IS the job
              const sj = parseSubjectJob(c.subject);
              if (sj) {
                jobs.push(makeJob({
                  title: sj.title, company: sj.company, location: '',
                  url: firstJobLink || `https://${c.fromDomain}`, posted_at: parseDate(mail.date),
                  source: srcTag, description: '', recruiter_email: recruiter,
                  notes: `email alert "${(c.subject || '').slice(0, 80)}"`
                }));
              } else if (!NON_JOB_RE.test(c.subject)) {
                // couldn't parse subject but not a known non-job notice — try HTML links, keep only role-like titles
                for (const f of extractJobsFromHtml(html, c.fromDomain, portals)) {
                  if (!ROLE_RE.test(f.title)) continue;
                  jobs.push(makeJob({
                    title: f.title, company: f.company || c.fromDomain, location: '', url: f.href,
                    posted_at: parseDate(mail.date), source: srcTag, description: '', recruiter_email: recruiter,
                    notes: `email "${(c.subject || '').slice(0, 80)}"`
                  }));
                }
              }
            }
          } else {
            // direct recruiter mail: the whole email is one opportunity; the sender IS the recruiter
            const recruiter = (c.replyTo && !/no-?reply|donotreply/i.test(c.replyTo)) ? c.replyTo
              : (!/no-?reply|donotreply|jobs@|alerts?@|notifications?@/i.test(c.fromAddr) ? c.fromAddr : null);
            const bodyText = stripHtml(html) || mail.text || '';
            // try to lift a company from signature/domain
            const company = senderName && !/@/.test(senderName) ? senderName : c.fromDomain.replace(/\.(com|in|io|co)$/, '');
            const applyLink = (html.match(/href=["'](https?:\/\/[^"']*(?:job|apply|career|lever|greenhouse|workday|ashby)[^"']*)["']/i) || [])[1] || '';
            jobs.push(makeJob({
              title: (mail.subject || 'Opportunity via email').replace(/^(re|fwd?):\s*/i, '').trim(),
              company,
              location: '',
              url: applyLink || `mailto:${recruiter || c.fromAddr}`,
              apply_url: applyLink || undefined,
              posted_at: parseDate(mail.date),
              source: 'email:recruiter',
              description: bodyText.slice(0, 8000),
              recruiter_email: recruiter,
              notes: `direct mail from ${c.fromAddr}`
            }));
          }
        } catch (e) { /* skip a bad message, keep going */ }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.close(); } catch {}
    return { jobs, ok: false, reason: `IMAP error: ${e.message}` };
  }
  // de-dupe within this scan by url/title
  const seen = new Set();
  const deduped = jobs.filter(j => { const k = (j.url || j.title).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return { jobs: deduped, ok: true, count: deduped.length };
}

module.exports = { ingestEmails, extractJobsFromHtml, parseSubjectJob, isDigestSubject };
