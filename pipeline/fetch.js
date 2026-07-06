// Job fetchers: ATS boards (Greenhouse/Lever/Ashby), remote-job APIs, Adzuna (optional), incoming/ ingest
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA, loadJson, stripHtml, makeJob, parseDate, fetchJson } = require('./lib');
const { fetchNaukriBrowser, fetchShine, fetchFoundit, fetchLinkedIn, fetchJSearch } = require('./portals');
const { ingestEmails } = require('./email_ingest');

// Keep a job at fetch time if the title looks PM-adjacent (final relevance is decided by scoring)
function titleLooksRelevant(title) {
  const t = (title || '').toLowerCase();
  if (/\bproduct\b/.test(t)) return true;
  if (/\b(fraud|risk|payments?|trust)\b.*\b(manager|lead|head)\b/.test(t)) return true;
  return false;
}

async function fetchGreenhouse(board) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`;
  const data = await fetchJson(url);
  return (data.jobs || []).filter(j => titleLooksRelevant(j.title)).map(j => makeJob({
    title: j.title,
    company: board.company,
    location: (j.location && j.location.name) || (j.offices || []).map(o => o.name).join(', '),
    url: j.absolute_url,
    posted_at: parseDate(j.updated_at || j.first_published),
    source: `greenhouse:${board.token}`,
    description: stripHtml(j.content || ''),
    remote: /remote/i.test((j.location && j.location.name) || '')
  }));
}

async function fetchLever(board) {
  const url = `https://api.lever.co/v0/postings/${board.token}?mode=json`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) throw new Error('unexpected response');
  return data.filter(j => titleLooksRelevant(j.text)).map(j => makeJob({
    title: j.text,
    company: board.company,
    location: (j.categories && [j.categories.location, j.categories.team].filter(Boolean).join(' · ')) || '',
    url: j.hostedUrl,
    apply_url: j.applyUrl || j.hostedUrl,
    posted_at: parseDate(j.createdAt),
    job_type: j.categories && j.categories.commitment,
    source: `lever:${board.token}`,
    description: stripHtml(j.descriptionPlain || j.description || (j.lists || []).map(l => `${l.text}\n${stripHtml(l.content)}`).join('\n')),
    remote: /remote/i.test(JSON.stringify(j.categories || {}))
  }));
}

async function fetchAshby(board) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}?includeCompensation=true`;
  const data = await fetchJson(url);
  return (data.jobs || []).filter(j => titleLooksRelevant(j.title)).map(j => {
    let salary = null;
    if (j.compensation && j.compensation.compensationTierSummary) salary = j.compensation.compensationTierSummary;
    return makeJob({
      title: j.title,
      company: board.company,
      location: [j.location, ...(j.secondaryLocations || []).map(l => l.location)].filter(Boolean).join(', '),
      url: j.jobUrl,
      apply_url: j.applyUrl || j.jobUrl,
      posted_at: parseDate(j.publishedAt),
      job_type: j.employmentType,
      salary,
      source: `ashby:${board.token}`,
      description: stripHtml(j.descriptionHtml || j.descriptionPlain || ''),
      remote: !!j.isRemote
    });
  });
}

async function fetchRemoteOK() {
  const data = await fetchJson('https://remoteok.com/api?tag=product', {}, 20000);
  const items = (Array.isArray(data) ? data : []).filter(x => x && x.id && x.position);
  return items.filter(j => titleLooksRelevant(j.position)).map(j => makeJob({
    title: j.position,
    company: j.company,
    location: j.location || 'Remote',
    url: j.url,
    posted_at: parseDate(j.date),
    salary: j.salary_min ? `$${j.salary_min}-${j.salary_max || '?'}` : null,
    source: 'remoteok',
    description: stripHtml(j.description || ''),
    remote: true
  }));
}

async function fetchRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs?search=product%20manager&limit=50', {}, 20000);
  return (data.jobs || []).filter(j => titleLooksRelevant(j.title)).map(j => makeJob({
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    url: j.url,
    posted_at: parseDate(j.publication_date),
    salary: j.salary || null,
    job_type: j.job_type,
    source: 'remotive',
    description: stripHtml(j.description || ''),
    remote: true
  }));
}

async function fetchAdzuna(env) {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return null; // not configured
  const out = [];
  const queries = [
    { what: 'product manager', where: 'Gurgaon' },
    { what: 'product manager', where: 'Bengaluru' },
    { what: 'senior product manager fintech', where: '' }
  ];
  for (const q of queries) {
    const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${env.ADZUNA_APP_ID}&app_key=${env.ADZUNA_APP_KEY}&results_per_page=30&what=${encodeURIComponent(q.what)}${q.where ? `&where=${encodeURIComponent(q.where)}` : ''}&sort_by=date&content-type=application/json`;
    const data = await fetchJson(url, {}, 20000);
    for (const j of data.results || []) {
      if (!titleLooksRelevant(j.title)) continue;
      out.push(makeJob({
        title: stripHtml(j.title),
        company: j.company && j.company.display_name,
        location: j.location && j.location.display_name,
        url: j.redirect_url,
        posted_at: parseDate(j.created),
        salary: j.salary_min ? `₹${Math.round(j.salary_min).toLocaleString('en-IN')}${j.salary_max ? '–₹' + Math.round(j.salary_max).toLocaleString('en-IN') : ''}` : null,
        source: 'adzuna',
        description: stripHtml(j.description || '')
      }));
    }
  }
  return out;
}

// Ingest jobs dropped by Claude/MCP runs (or any external tool) into data/incoming/*.json
// Accepts: array of jobs, or {jobs: [...]} — fields flexible, normalized here.
function ingestIncoming() {
  const dir = path.join(DATA, 'incoming');
  const processedDir = path.join(dir, 'processed');
  fs.mkdirSync(processedDir, { recursive: true });
  const out = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const arr = Array.isArray(raw) ? raw : (raw.jobs || []);
      for (const j of arr) {
        out.push(makeJob({
          title: j.title, company: j.company, location: j.location,
          url: j.url || j.apply_url || j.view_job_url,
          apply_url: j.apply_url || j.url,
          posted_at: parseDate(j.posted_at || j.posted_on || j.posted),
          salary: j.salary || j.compensation && j.compensation !== 'N/A' ? j.compensation : j.salary || null,
          job_type: j.job_type && j.job_type !== 'N/A' ? j.job_type : null,
          source: j.source || 'indeed-mcp',
          description: j.description || '',
          remote: /remote/i.test(j.location || '')
        }));
      }
      fs.renameSync(p, path.join(processedDir, `${Date.now()}-${f}`));
    } catch (e) {
      console.error(`[ingest] skipping ${f}: ${e.message}`);
    }
  }
  return out;
}

// Run all fetchers with limited concurrency; returns { jobs, health }
async function fetchAll(env) {
  const watchlist = loadJson('watchlist.json', { boards: [] });
  const profile = loadJson('profile.json', {});
  const tasks = [];

  for (const b of watchlist.boards.filter(b => b.enabled !== false)) {
    const fn = b.ats === 'greenhouse' ? fetchGreenhouse : b.ats === 'lever' ? fetchLever : b.ats === 'ashby' ? fetchAshby : null;
    if (fn) tasks.push({ name: `${b.ats}:${b.token}`, company: b.company, run: () => fn(b) });
  }
  // Portal scrapers — auto-queried from profile, no manual company lists (each is internally sequential + jittered)
  // Naukri is behind Akamai Bot Manager and blocks headless browsers; opt-in only (needs a paid unblocker proxy to work). See README.
  if (env.ENABLE_NAUKRI === 'true') tasks.push({ name: 'naukri(browser)', company: '-', run: () => fetchNaukriBrowser(profile) });
  tasks.push({ name: 'shine', company: '-', run: () => fetchShine(profile) });
  tasks.push({ name: 'foundit', company: '-', run: () => fetchFoundit(profile) });
  tasks.push({ name: 'linkedin', company: '-', run: () => fetchLinkedIn(profile) });
  if (env.RAPIDAPI_KEY) tasks.push({ name: 'jsearch(google-jobs)', company: '-', run: () => fetchJSearch(env, profile) });
  tasks.push({ name: 'remoteok', company: '-', run: fetchRemoteOK });
  tasks.push({ name: 'remotive', company: '-', run: fetchRemotive });
  if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) tasks.push({ name: 'adzuna', company: '-', run: () => fetchAdzuna(env) });

  const health = [];
  const jobs = [];
  const CONCURRENCY = 8;
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const t = tasks[i++];
      try {
        const res = (await t.run() || []).filter(j => titleLooksRelevant(j.title));
        jobs.push(...res);
        health.push({ source: t.name, company: t.company, ok: true, count: res.length });
      } catch (e) {
        health.push({ source: t.name, company: t.company, ok: false, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const incoming = ingestIncoming();
  if (incoming.length) health.push({ source: 'incoming(indeed-mcp)', company: '-', ok: true, count: incoming.length });
  jobs.push(...incoming);

  // Gmail job-alert emails (IIM Jobs, Hirist, direct recruiter mails…) — only when creds are set
  try {
    const em = await ingestEmails(env);
    const relevant = (em.jobs || []).filter(j => titleLooksRelevant(j.title));
    jobs.push(...relevant);
    health.push({ source: 'email(inbox)', company: '-', ok: em.ok, count: em.ok ? relevant.length : undefined, error: em.ok ? undefined : em.reason });
  } catch (e) {
    health.push({ source: 'email(inbox)', company: '-', ok: false, error: e.message });
  }

  return { jobs, health };
}

module.exports = { fetchAll, titleLooksRelevant };
