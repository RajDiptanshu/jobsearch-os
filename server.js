// JobSearchOS dashboard server — zero-dependency Node http server
// Serves the dashboard UI + JSON API over data/jobs.json, runs.json, watchlist.json
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DATA, loadJson, saveJson, loadEnv } = require('./pipeline/lib');
const { suggestForJob } = require('./pipeline/suggest');
const { scoreJob } = require('./pipeline/score');
const { generateApplication, sendApplicationEmail } = require('./pipeline/apply');

const env = loadEnv();
const PORT = +(env.PORT || 4321);
const PUBLIC = path.join(__dirname, 'public');

let pipelineProc = null; // guard: one run at a time
let pipelineLog = [];

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': (MIME[ext] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function filterJobs(query) {
  const store = loadJson('jobs.json', { jobs: [] });
  let jobs = store.jobs;
  const q = (query.q || '').toLowerCase().trim();
  if (q) jobs = jobs.filter(j => (j.title + ' ' + j.company + ' ' + j.location + ' ' + j.description).toLowerCase().includes(q));
  if (query.status && query.status !== 'all') jobs = jobs.filter(j => j.status === query.status);
  if (query.source && query.source !== 'all') jobs = jobs.filter(j => j.source.startsWith(query.source));
  if (query.location && query.location !== 'all') {
    const l = query.location.toLowerCase();
    if (l === 'remote') jobs = jobs.filter(j => j.remote || /remote/i.test(j.location));
    else jobs = jobs.filter(j => j.location.toLowerCase().includes(l));
  }
  const minScore = +(query.minScore || 0);
  if (minScore) jobs = jobs.filter(j => (j.score?.total || 0) >= minScore);
  if (query.new === '1') jobs = jobs.filter(j => (Date.now() - new Date(j.discovered_at).getTime()) < 86400000);

  const sort = query.sort || 'score';
  jobs = jobs.slice().sort((a, b) => {
    if (sort === 'score') return (b.score?.total || 0) - (a.score?.total || 0);
    if (sort === 'discovered') return new Date(b.discovered_at) - new Date(a.discovered_at);
    if (sort === 'posted') return new Date(b.posted_at || 0) - new Date(a.posted_at || 0);
    if (sort === 'company') return (a.company || '').localeCompare(b.company || '');
    return 0;
  });
  const total = jobs.length;
  const limit = Math.min(+(query.limit || 100), 500);
  const offset = +(query.offset || 0);
  return { total, jobs: jobs.slice(offset, offset + limit) };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;
  const query = Object.fromEntries(u.searchParams.entries());

  try {
    // ---------- API ----------
    if (p === '/api/jobs' && req.method === 'GET') return json(res, 200, filterJobs(query));

    if (p.match(/^\/api\/jobs\/[^/]+$/) && req.method === 'PATCH') {
      const id = decodeURIComponent(p.split('/')[3]);
      const body = await readBody(req);
      const store = loadJson('jobs.json', { jobs: [] });
      const job = store.jobs.find(j => j.id === id);
      if (!job) return json(res, 404, { error: 'job not found' });
      const allowed = ['status', 'notes'];
      for (const k of allowed) if (k in body) job[k] = body[k];
      saveJson('jobs.json', store);
      return json(res, 200, { ok: true, job });
    }

    if (p.match(/^\/api\/jobs\/[^/]+\/jd$/) && req.method === 'POST') {
      // paste a JD for a thin job → rescore + regenerate suggestions
      const id = decodeURIComponent(p.split('/')[3]);
      const body = await readBody(req);
      const store = loadJson('jobs.json', { jobs: [] });
      const job = store.jobs.find(j => j.id === id);
      if (!job) return json(res, 404, { error: 'job not found' });
      if (body.description) job.description = String(body.description).slice(0, 20000);
      const profile = loadJson('profile.json', null);
      job.score = scoreJob(job, profile);
      job.suggestions = suggestForJob(job, profile);
      saveJson('jobs.json', store);
      return json(res, 200, { ok: true, job });
    }

    // ---------- apply queue ----------
    if (p === '/api/queue' && req.method === 'GET') {
      const store = loadJson('jobs.json', { jobs: [] });
      const withApp = store.jobs
        .filter(j => j.application && j.application.status !== 'skipped')
        .sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
      const actionable = withApp.filter(j => ['draft', 'queued'].includes(j.application.status));
      const done = withApp.filter(j => j.application.status === 'sent');
      const shape = j => ({ id: j.id, title: j.title, company: j.company, location: j.location, url: j.url, score: j.score?.total || 0, status: j.status, application: j.application });
      return json(res, 200, {
        actionable: actionable.slice(0, 100).map(shape),
        sent: done.slice(0, 50).map(shape),
        counts: { actionable: actionable.length, email_ready: actionable.filter(j => j.application.channel === 'email').length, portal: actionable.filter(j => j.application.channel === 'portal').length, sent: done.length }
      });
    }

    if (p.match(/^\/api\/jobs\/[^/]+\/send$/) && req.method === 'POST') {
      const id = decodeURIComponent(p.split('/')[3]);
      const store = loadJson('jobs.json', { jobs: [] });
      const job = store.jobs.find(j => j.id === id);
      if (!job || !job.application) return json(res, 404, { error: 'no application for job' });
      if (job.application.channel !== 'email') return json(res, 400, { error: 'portal-channel: open the apply link and submit manually' });
      const profile = loadJson('profile.json', null);
      const result = await sendApplicationEmail(job, profile, env);
      if (result.ok) {
        job.application.status = 'sent';
        job.application.sent_at = new Date().toISOString();
        job.status = 'applied';
        saveJson('jobs.json', store);
      } else {
        job.application.last_error = result.reason;
        saveJson('jobs.json', store);
      }
      return json(res, result.ok ? 200 : 502, result);
    }

    if (p.match(/^\/api\/jobs\/[^/]+\/application$/) && req.method === 'PATCH') {
      const id = decodeURIComponent(p.split('/')[3]);
      const body = await readBody(req);
      const store = loadJson('jobs.json', { jobs: [] });
      const job = store.jobs.find(j => j.id === id);
      if (!job) return json(res, 404, { error: 'job not found' });
      const profile = loadJson('profile.json', null);
      if (body.action === 'regenerate') { job.application = generateApplication(job, profile); job.application.status = job.application.channel === 'email' ? 'queued' : 'draft'; }
      else if (body.action === 'skip') { if (job.application) job.application.status = 'skipped'; }
      else if (body.action === 'mark_applied') { if (job.application) job.application.status = 'sent'; job.status = 'applied'; }
      else {
        // manual edits (recruiter_email / subject / body)
        if (!job.application) job.application = generateApplication(job, profile);
        for (const k of ['recruiter_email', 'subject', 'body']) if (k in body) job.application[k] = body[k];
        if (body.recruiter_email) { job.recruiter_email = body.recruiter_email; job.application.channel = 'email'; if (job.application.status === 'draft') job.application.status = 'queued'; }
      }
      saveJson('jobs.json', store);
      return json(res, 200, { ok: true, application: job.application });
    }

    if (p === '/api/status' && req.method === 'GET') {
      const runs = loadJson('runs.json', { runs: [] });
      const store = loadJson('jobs.json', { jobs: [] });
      const wl = loadJson('watchlist.json', { boards: [] });
      const now = Date.now();
      const jobs = store.jobs;
      const smtpConfigured = !!((env.GMAIL_USER || env.SMTP_USER) && (env.GMAIL_APP_PASSWORD || env.SMTP_PASS));
      const outbox = fs.existsSync(path.join(DATA, 'outbox')) ? fs.readdirSync(path.join(DATA, 'outbox')).filter(f => f.endsWith('.html')).sort().reverse().slice(0, 20) : [];
      return json(res, 200, {
        last_run: runs.runs[0] || null,
        runs: runs.runs.slice(0, 24).map(r => ({ at: r.at, new: r.new, fetched: r.fetched, sources_ok: r.sources_ok, sources_total: r.sources_total, email: r.email && { sent: r.email.sent, reason: r.email.reason } })),
        counts: {
          total: jobs.length,
          new_24h: jobs.filter(j => now - new Date(j.discovered_at).getTime() < 86400000).length,
          match_70: jobs.filter(j => (j.score?.total || 0) >= 70).length,
          applied: jobs.filter(j => j.status === 'applied').length,
          interview: jobs.filter(j => j.status === 'interview').length,
          apply_ready: jobs.filter(j => j.application && ['draft', 'queued'].includes(j.application.status)).length,
          email_ready: jobs.filter(j => j.application && j.application.channel === 'email' && j.application.status === 'queued').length
        },
        pipeline_running: !!pipelineProc,
        pipeline_log: pipelineLog.slice(-30),
        smtp_configured: smtpConfigured,
        auto_send: env.AUTO_SEND_EMAIL === 'true',
        apply_min_score: +(env.AUTO_APPLY_MIN_SCORE || 50),
        digest_to: env.DIGEST_TO || (loadJson('profile.json', {}).identity || {}).email,
        watchlist: wl.boards.map(b => ({ company: b.company, ats: b.ats, token: b.token, enabled: b.enabled !== false, last_probe_ok: b.last_probe_ok })),
        outbox
      });
    }

    if (p === '/api/run' && req.method === 'POST') {
      if (pipelineProc) return json(res, 409, { error: 'pipeline already running' });
      pipelineLog = [`[${new Date().toLocaleTimeString()}] pipeline started`];
      pipelineProc = spawn(process.execPath, [path.join(__dirname, 'pipeline', 'run.js')], { cwd: __dirname });
      pipelineProc.stdout.on('data', d => pipelineLog.push(...String(d).trim().split('\n')));
      pipelineProc.stderr.on('data', d => pipelineLog.push('ERR: ' + String(d).trim()));
      pipelineProc.on('exit', code => { pipelineLog.push(`[exit ${code}]`); pipelineProc = null; });
      return json(res, 202, { ok: true, message: 'pipeline started' });
    }

    if (p === '/api/outbox' && req.method === 'GET') {
      const dir = path.join(DATA, 'outbox');
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort().reverse() : [];
      return json(res, 200, { files });
    }
    if (p.startsWith('/outbox/') && req.method === 'GET') {
      const f = path.basename(decodeURIComponent(p.slice('/outbox/'.length)));
      return serveStatic(res, path.join(DATA, 'outbox', f));
    }

    // ---------- static ----------
    if (p === '/' || p === '/index.html') return serveStatic(res, path.join(PUBLIC, 'index.html'));
    const safe = path.normalize(path.join(PUBLIC, decodeURIComponent(p))).replace(/^(\.\.[\/\\])+/, '');
    if (safe.startsWith(PUBLIC) && fs.existsSync(safe)) {
      const stat = fs.statSync(safe);
      if (stat.isFile()) return serveStatic(res, safe);
      if (stat.isDirectory()) {                             // e.g. /coach/ → /coach/index.html
        const idx = path.join(safe, 'index.html');
        if (fs.existsSync(idx)) return serveStatic(res, idx);
      }
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`JobSearchOS dashboard → http://localhost:${PORT}`));
