// JobSearchOS pipeline orchestrator: fetch → dedupe → score → suggest → apply-package → email → persist
// Run every 3h by Windows Task Scheduler, or on demand (dashboard "Run now" / `npm run run-pipeline`).
// Flags: --no-email  --quiet
'use strict';
const { loadJson, saveJson, loadEnv } = require('./lib');
const { fetchAll } = require('./fetch');
const { scoreJob } = require('./score');
const { suggestForJob } = require('./suggest');
const { sendDigest } = require('./email');
const { enrichNewJobs } = require('./portals');
const { generateApplication, sendApplicationEmail } = require('./apply');

const EMAIL_MIN_SCORE = 55;   // only email the digest for matches at/above this
const KEEP_MIN_SCORE = 25;    // don't store obvious noise
const MAX_EMAIL_JOBS = 12;    // cap digest length

async function main() {
  const t0 = Date.now();
  const env = loadEnv();
  const noEmail = process.argv.includes('--no-email');
  const profile = loadJson('profile.json', null);
  if (!profile) { console.error('profile.json missing'); process.exit(1); }

  const store = loadJson('jobs.json', { jobs: [] });
  const byId = new Map(store.jobs.map(j => [j.id, j]));
  const byUrl = new Map(store.jobs.filter(j => j.url).map(j => [j.url, j]));
  const byKey = new Map(store.jobs.map(j => [`${(j.company || '').toLowerCase()}|${(j.title || '').toLowerCase()}|${(j.location || '').toLowerCase()}`, j]));

  console.log('[run] fetching sources…');
  const { jobs: fetched, health } = await fetchAll(env);
  console.log(`[run] fetched ${fetched.length} PM-relevant postings from ${health.filter(h => h.ok).length}/${health.length} sources`);

  const pendingNew = [];
  let updated = 0;
  for (const job of fetched) {
    const key = `${(job.company || '').toLowerCase()}|${(job.title || '').toLowerCase()}|${(job.location || '').toLowerCase()}`;
    const existing = byId.get(job.id) || byUrl.get(job.url) || byKey.get(key);
    if (existing) {
      // refresh mutable fields, keep user state (status/notes/emailed_at)
      existing.description = job.description && job.description.length > (existing.description || '').length ? job.description : existing.description;
      existing.salary = existing.salary || job.salary;
      existing.posted_at = existing.posted_at || job.posted_at;
      const rescored = scoreJob(existing, profile);
      if (!existing.score || rescored.total !== existing.score.total) updated++;
      existing.score = rescored;
      if (!existing.suggestions || !existing.suggestions.length || existing.score.jd_thin === false) {
        existing.suggestions = suggestForJob(existing, profile);
      }
      continue;
    }
    if (byKey.has(key) || pendingNew.some(p => p.id === job.id || (p.url && p.url === job.url))) continue; // dupe within this fetch
    byKey.set(key, job);
    pendingNew.push(job);
  }

  // Enrich promising thin portal results (Naukri/LinkedIn) with full JDs, then score everything
  const preScored = pendingNew.map(j => ({ j, s: scoreJob(j, profile).total })).sort((a, b) => b.s - a.s).map(x => x.j);
  try {
    const enrichedIds = await enrichNewJobs(preScored);
    if (enrichedIds.length) console.log(`[run] enriched ${enrichedIds.length} portal JDs (naukri/linkedin)`);
  } catch (e) { console.error('[run] enrichment skipped:', e.message); }

  const newJobs = [];
  for (const job of pendingNew) {
    job.score = scoreJob(job, profile);
    if (job.score.total < KEEP_MIN_SCORE) continue;
    job.suggestions = suggestForJob(job, profile);
    byId.set(job.id, job);
    if (job.url) byUrl.set(job.url, job);
    store.jobs.push(job);
    newJobs.push(job);
  }

  // prune stale low-value entries (>60 days old, never interacted, score <40)
  const before = store.jobs.length;
  store.jobs = store.jobs.filter(j => {
    const age = (Date.now() - new Date(j.discovered_at).getTime()) / 86400000;
    return !(age > 60 && j.status === 'new' && (j.score?.total || 0) < 40);
  });

  // ── APPLY step: generate an application package for every match >= threshold (once per job) ──
  const APPLY_MIN = +(env.AUTO_APPLY_MIN_SCORE || 50);
  let generated = 0;
  for (const j of store.jobs) {
    if ((j.score?.total || 0) >= APPLY_MIN && !j.application && j.status !== 'hidden' && j.status !== 'rejected') {
      j.application = generateApplication(j, profile);
      // email-channel packages are ready to send; portal-channel need a human click
      j.application.status = j.application.channel === 'email' ? 'queued' : 'draft';
      generated++;
    }
  }
  if (generated) console.log(`[run] generated ${generated} application packages (>= ${APPLY_MIN}% match)`);

  // ── AUTO-SEND (opt-in): email recruiters for queued email-channel apps, capped per run ──
  const autoSend = env.AUTO_SEND_EMAIL === 'true';
  const sendCap = +(env.AUTO_SEND_MAX_PER_RUN || 5);
  const sentApps = [];
  if (autoSend) {
    const queue = store.jobs
      .filter(j => j.application && j.application.channel === 'email' && j.application.status === 'queued' && !j.application.sent_at)
      .sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0))
      .slice(0, sendCap);
    for (const j of queue) {
      const res = await sendApplicationEmail(j, profile, env);
      if (res.ok) {
        j.application.status = 'sent';
        j.application.sent_at = new Date().toISOString();
        j.status = 'applied';
        sentApps.push({ id: j.id, title: j.title, company: j.company, to: res.to });
      } else {
        j.application.last_error = res.reason;
      }
    }
    if (sentApps.length) console.log(`[run] AUTO-SENT ${sentApps.length} recruiter emails: ${sentApps.map(s => s.company).join(', ')}`);
  }

  const runInfo = {
    at: new Date().toISOString(),
    duration_ms: Date.now() - t0,
    fetched: fetched.length,
    new: newJobs.length,
    updated,
    pruned: before - store.jobs.length,
    total_tracked: store.jobs.length,
    sources_ok: health.filter(h => h.ok).length,
    sources_total: health.length,
    health,
    port: env.PORT || 4321,
    apps_generated: generated,
    apps_auto_sent: sentApps.length,
    auto_send: autoSend,
    email: null
  };

  // email digest for new matches above threshold
  const emailable = newJobs
    .filter(j => (j.score?.total || 0) >= EMAIL_MIN_SCORE)
    .sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0))
    .slice(0, MAX_EMAIL_JOBS);

  if (!noEmail && emailable.length) {
    console.log(`[run] emailing digest of ${emailable.length} matches…`);
    const res = await sendDigest(emailable, runInfo, profile, env);
    runInfo.email = res;
    if (res.sent) for (const j of emailable) j.emailed_at = runInfo.at;
    console.log(res.sent ? `[run] email sent to ${res.to}` : `[run] email not sent: ${res.reason} (archived: ${res.archived || 'n/a'})`);
  } else {
    runInfo.email = { sent: false, reason: noEmail ? 'disabled by flag' : 'no new matches ≥ ' + EMAIL_MIN_SCORE };
  }

  saveJson('jobs.json', store);
  const runs = loadJson('runs.json', { runs: [] });
  runs.runs.unshift(runInfo);
  runs.runs = runs.runs.slice(0, 200);
  saveJson('runs.json', runs);

  console.log(`[run] done in ${(runInfo.duration_ms / 1000).toFixed(1)}s — new: ${runInfo.new}, updated: ${updated}, tracked: ${runInfo.total_tracked}, apps: ${generated} generated / ${sentApps.length} sent`);
  const topNew = newJobs.sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0)).slice(0, 5);
  for (const j of topNew) console.log(`   ${String(j.score.total).padStart(3)}%  ${j.title} — ${j.company} (${j.location}) [${j.source}]`);
}

// Force a clean exit: undici's keep-alive socket pool and fetch timers can hold the event loop
// open long after work is done, which would leave the scheduled task stuck "Running".
main()
  .then(() => process.exit(0))
  .catch(e => { console.error('[run] fatal:', e); process.exit(1); });
