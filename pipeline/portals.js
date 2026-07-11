// Portal fetchers: Naukri + LinkedIn (unofficial public endpoints their own sites use) + JSearch (Google-for-Jobs API).
// Low-volume, jittered, fail-soft: a blocked source reports FAIL in health and never breaks the run.
'use strict';
const { makeJob, stripHtml, parseDate } = require('./lib');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(base) { return base + Math.floor(Math.random() * 400); }

async function fetchText(url, headers = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

async function fetchJsonWithHeaders(url, headers = {}, timeoutMs = 15000) {
  const txt = await fetchText(url, { Accept: 'application/json', ...headers }, timeoutMs);
  return JSON.parse(txt);
}

// Build search queries automatically from the profile (no manual company lists)
function buildQueries(profile) {
  const locs = ['Gurugram', 'Bengaluru', 'Noida'];
  const titles = ['Product Manager', 'Senior Product Manager'];
  const flavored = ['Product Manager Payments', 'Product Manager Fintech', 'Product Manager Fraud Risk'];
  // rotate flavored queries by hour so every domain gets coverage through the day without extra volume
  const hour = new Date().getHours();
  const flavor = flavored[hour % flavored.length];
  return {
    naukri: [
      { keyword: titles[0], location: locs[0] },
      { keyword: titles[0], location: locs[1] },
      { keyword: titles[1], location: locs[0] },
      { keyword: titles[1], location: locs[1] },
      { keyword: flavor, location: '' }
    ],
    linkedin: [
      // Core city queries: NO time filter + 2 pages → catches everything LinkedIn ranks for the city,
      // not just the last 24h (this was why postings visible on linkedin.com never reached the portal).
      { keywords: titles[0], location: 'Gurugram, Haryana, India', deep: true, tpr: '' },
      { keywords: titles[0], location: 'Bengaluru, Karnataka, India', deep: true, tpr: '' },
      { keywords: titles[0], location: 'Noida, Uttar Pradesh, India', tpr: '' },
      { keywords: titles[0], location: 'Delhi, India', tpr: '' },
      { keywords: titles[1], location: 'Gurugram, Haryana, India', tpr: '' },
      { keywords: titles[1], location: 'Bengaluru, Karnataka, India', tpr: '' },
      // Remote-India (f_WT=2 = LinkedIn's remote filter), last 7 days
      { keywords: titles[0], location: 'India', remote: true, tpr: 'r604800' },
      // Domain-flavored, last 7 days — ALL of them every run (no rotation; coverage beats economy here)
      { keywords: 'Product Manager Payments', location: 'India', tpr: 'r604800' },
      { keywords: 'Product Manager Fintech', location: 'India', tpr: 'r604800' },
      { keywords: 'Product Manager Fraud Risk', location: 'India', tpr: 'r604800' },
      { keywords: 'AI Product Manager', location: 'India', tpr: 'r604800' }
    ],
    jsearch: [
      `${titles[0]} jobs in Gurugram`,
      `${titles[1]} jobs in Bengaluru`,
      `${flavor} jobs in India`
    ]
  };
}

// ───────────────────────── NAUKRI (browser mode) ─────────────────────────
// Naukri's JSON API returns 406 "recaptcha required" for non-browser clients, so we don't call it.
// Instead, if Playwright is installed (npm run setup-naukri), we render the public search page
// in headless Chromium — same as a person opening the page — and read the listed jobs.
async function fetchNaukriBrowser(profile) {
  let pw;
  try { pw = require('playwright'); }
  catch { throw new Error('API needs reCAPTCHA; browser mode not installed — run: npm run setup-naukri'); }
  const searches = [
    'https://www.naukri.com/product-manager-jobs-in-gurugram',
    'https://www.naukri.com/product-manager-jobs-in-bengaluru',
    'https://www.naukri.com/senior-product-manager-jobs-in-gurugram'
  ];
  const browser = await pw.chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] });
  const out = [];
  try {
    const ctx = await browser.newContext({
      userAgent: UA, viewport: { width: 1366, height: 900 }, locale: 'en-IN',
      extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9', 'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126"', 'sec-ch-ua-platform': '"Windows"', 'Upgrade-Insecure-Requests': '1' }
    });
    // light stealth so Akamai's sensor sees a browser-shaped navigator
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
    });
    const page = await ctx.newPage();
    for (const url of searches) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        // Akamai serves a JS challenge first; give it time to resolve, then wait for job cards
        await page.waitForSelector('a[href*="job-listings"]', { timeout: 20000 });
        const jobs = await page.evaluate(() => {
          const seen = new Set();
          const items = [];
          for (const a of document.querySelectorAll('a[href*="job-listings"]')) {
            const href = a.href;
            if (seen.has(href) || !a.textContent.trim()) continue;
            seen.add(href);
            const wrap = a.closest('[class*="jobtuple" i], [class*="jobTuple" i], article, [class*="cust-job" i]') || a.parentElement;
            const txt = (sel) => { const el = wrap && wrap.querySelector(sel); return el ? el.textContent.trim() : ''; };
            items.push({
              title: a.textContent.trim(),
              href,
              company: txt('[class*="comp-name" i], [class*="companyInfo" i] a, [class*="subTitle" i]'),
              location: txt('[class*="location" i], [class*="loc" i] span'),
              experience: txt('[class*="expwdth" i], [class*="experience" i]'),
              salary: txt('[class*="sal" i]'),
              posted: txt('[class*="job-post-day" i], [class*="postedDate" i], [class*="fleft-day" i]'),
              snippet: txt('[class*="job-desc" i], [class*="jobDescription" i]')
            });
          }
          return items.slice(0, 25);
        });
        for (const j of jobs) {
          if (!j.title || !j.company) continue;
          // "3 Days Ago" / "Just Now" → approximate ISO
          let posted = null;
          const pm = (j.posted || '').match(/(\d+)\s*day/i);
          if (pm) posted = new Date(Date.now() - (+pm[1]) * 86400000).toISOString();
          else if (/just now|today|few hours/i.test(j.posted || '')) posted = new Date().toISOString();
          out.push(makeJob({
            title: j.title, company: j.company, location: j.location || '',
            url: j.href.split('?')[0],
            posted_at: posted,
            salary: j.salary && !/not disclosed/i.test(j.salary) ? j.salary : null,
            source: 'naukri',
            description: [j.snippet, j.experience ? `Experience: ${j.experience}` : ''].filter(Boolean).join('\n'),
            remote: /remote|work from home|wfh|hybrid/i.test(`${j.location} ${j.title}`)
          }));
        }
        await sleep(jitter(1200));
      } catch (e) { /* one search failing shouldn't kill the rest */ }
    }
  } finally {
    await browser.close();
  }
  if (!out.length) throw new Error('page rendered but no job cards parsed (markup change or bot-block)');
  return out;
}

// ───────────────────────── SHINE ─────────────────────────
// Open JSON API used by shine.com's own frontend. Full JDs included in search results.
async function fetchShine(profile) {
  const queries = [
    { q: 'product-manager', loc: 'gurgaon' },
    { q: 'product-manager', loc: 'bangalore' },
    { q: 'senior-product-manager', loc: '' },
    { q: 'product-manager-payments', loc: '' }
  ];
  const out = [];
  for (const query of queries) {
    const url = `https://www.shine.com/api/v2/search/simple/?q=${encodeURIComponent(query.q)}${query.loc ? `&loc=${encodeURIComponent(query.loc)}` : ''}&limit=25`;
    const data = await fetchJsonWithHeaders(url);
    for (const j of data.results || []) {
      if (!j.jJT) continue;
      out.push(makeJob({
        title: stripHtml(j.jJT).replace(/\s*\.\.\.$/, ''),
        company: stripHtml(j.jCName || j.jCD || ''),
        location: Array.isArray(j.jLoc) ? j.jLoc.join(', ') : (j.jLoc || ''),
        url: j.jSlug ? `https://www.shine.com/jobs/${j.jSlug}` : '',
        posted_at: parseDate(j.jPDate),
        salary: j.jSal || null,
        source: 'shine',
        description: [stripHtml(j.jJD || j.jJDT || ''), j.jExp ? `Experience: ${j.jExp}` : '', j.jKwd ? `Keywords: ${j.jKwd}` : ''].filter(Boolean).join('\n'),
        remote: /remote|work from home|wfh/i.test(`${j.jJT} ${j.jJD || ''}`.slice(0, 400))
      }));
    }
    await sleep(jitter(500));
  }
  return out;
}

// ───────────────────────── FOUNDIT (Monster India) ─────────────────────────
// Middleware JSON API used by foundit.in's frontend; needs XHR-style headers.
const FOUNDIT_HEADERS = { Accept: 'application/json, text/plain, */*', 'x-requested-with': 'XMLHttpRequest', Referer: 'https://www.foundit.in/srp/results' };

async function fetchFoundit(profile) {
  const queries = [
    { query: 'product manager', locations: 'Gurgaon' },
    { query: 'product manager', locations: 'Bengaluru / Bangalore' },
    { query: 'senior product manager', locations: '' }
  ];
  const out = [];
  for (const q of queries) {
    const url = `https://www.foundit.in/middleware/jobsearch?sort=1&limit=20&query=${encodeURIComponent(q.query)}${q.locations ? `&locations=${encodeURIComponent(q.locations)}` : ''}`;
    const data = await fetchJsonWithHeaders(url, FOUNDIT_HEADERS);
    for (const j of (data.jobSearchResponse && data.jobSearchResponse.data) || []) {
      if (!j.title || j.isTestJob) continue;
      const salary = j.salary && !/^0-0/.test(j.salary) ? j.salary : null;
      out.push(makeJob({
        title: stripHtml(j.title),
        company: stripHtml(j.companyName || j.recruiterName || ''),
        location: (j.locations || '').split(',').map(s => s.trim()).filter((v, i, a) => a.indexOf(v) === i).join(', '),
        url: j.seoJdUrl || j.jdUrl ? `https://www.foundit.in${j.seoJdUrl || j.jdUrl}` : (j.applyUrl || j.redirectUrl || ''),
        apply_url: j.applyUrl || j.redirectUrl || undefined,
        posted_at: parseDate(j.createdAt),
        salary,
        job_type: (j.employmentTypes || [])[0] || null,
        source: 'foundit',
        description: [
          j.skills ? `Skills: ${j.skills}` : '',
          (j.functions || []).length ? `Function: ${j.functions.join(', ')}` : '',
          (j.industries || []).length ? `Industry: ${j.industries.join(', ')}` : '',
          j.exp ? `Experience: ${j.exp}` : ''
        ].filter(Boolean).join('\n'),
        remote: /remote|work from home/i.test(`${j.title} ${j.locations}`)
      }));
    }
    await sleep(jitter(600));
  }
  return out;
}

// ──────────────────────── LINKEDIN ────────────────────────
// Public guest endpoints (what linkedin.com serves logged-out visitors). HTML fragments, parsed with regex.
async function linkedinSearch(q, start = 0) {
  const params = new URLSearchParams({ keywords: q.keywords, location: q.location, start: String(start) });
  if (q.tpr) params.set('f_TPR', q.tpr);           // '' = no time filter (all ages, LinkedIn relevance-ranked)
  if (q.remote) params.set('f_WT', '2');           // LinkedIn's remote-workplace filter
  const html = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`);
  const out = [];
  // each card: <a class="base-card__full-link" href="...">…<span class="sr-only"> Title </span>
  const cards = html.split(/base-card__full-link/).slice(1);
  for (const c of cards.slice(0, 25)) {
    const href = (c.match(/href="([^"]+)"/) || [])[1];
    const title = (c.match(/sr-only">\s*([\s\S]*?)\s*<\/span>/) || [])[1];
    const company = (c.match(/base-search-card__subtitle[^>]*>\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/) || [])[1]
      || (c.match(/base-search-card__subtitle[^>]*>\s*([\s\S]*?)\s*</) || [])[1];
    const location = (c.match(/job-search-card__location[^>]*>\s*([\s\S]*?)\s*</) || [])[1];
    const dt = (c.match(/datetime="([^"]+)"/) || [])[1];
    if (!href || !title) continue;
    const cleanUrl = href.split('?')[0];
    out.push(makeJob({
      title: stripHtml(title),
      company: stripHtml(company || ''),
      location: stripHtml(location || ''),
      url: cleanUrl,
      posted_at: parseDate(dt),
      source: 'linkedin',
      description: '',
      remote: /remote/i.test(location || ''),
      notes: (cleanUrl.match(/-(\d{8,})$/) || [])[1] ? `liJobId:${cleanUrl.match(/-(\d{8,})$/)[1]}` : ''
    }));
  }
  return out;
}

async function fetchLinkedIn(profile) {
  const queries = buildQueries(profile).linkedin;
  const all = [];
  let failed = 0, attempted = 0;
  for (const q of queries) {
    const pages = q.deep ? [0, 25] : [0];          // deep queries pull page 2 as well
    for (const start of pages) {
      attempted++;
      try { all.push(...await linkedinSearch(q, start)); }
      catch (e) { failed++; }                       // one 429 must never kill the whole source
      await sleep(jitter(900));
    }
  }
  if (!all.length && failed === attempted) throw new Error(`all ${attempted} queries failed (rate-limited?)`);
  return all;
}

async function linkedinDetail(job) {
  const m = (job.notes || '').match(/liJobId:(\d+)/);
  if (!m) return null;
  const html = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${m[1]}`);
  const desc = (html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/) || [])[1];
  const criteria = [...html.matchAll(/description__job-criteria-subheader">\s*([\s\S]*?)\s*<\/h3>\s*<span[^>]*>\s*([\s\S]*?)\s*<\/span>/g)]
    .map(x => `${stripHtml(x[1])}: ${stripHtml(x[2])}`).join(' · ');
  if (!desc) return null;
  return stripHtml(desc) + (criteria ? `\n${criteria}` : '');
}

// ──────────────────────── JSEARCH (Google for Jobs) ────────────────────────
async function fetchJSearch(env, profile) {
  if (!env.RAPIDAPI_KEY) return null;
  const out = [];
  for (const q of buildQueries(profile).jsearch) {
    const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q)}&date_posted=today&num_pages=1`;
    const data = await fetchJsonWithHeaders(url, { 'X-RapidAPI-Key': env.RAPIDAPI_KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' }, 20000);
    for (const j of data.data || []) {
      out.push(makeJob({
        title: j.job_title,
        company: j.employer_name,
        location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ') || (j.job_is_remote ? 'Remote' : ''),
        url: j.job_apply_link,
        posted_at: parseDate(j.job_posted_at_datetime_utc),
        salary: j.job_min_salary ? `${j.job_salary_currency || ''} ${j.job_min_salary}-${j.job_max_salary || '?'} ${j.job_salary_period || ''}`.trim() : null,
        job_type: j.job_employment_type,
        source: 'jsearch',
        description: (j.job_description || '').slice(0, 20000),
        remote: !!j.job_is_remote
      }));
    }
    await sleep(jitter(400));
  }
  return out;
}

// Enrich thin LinkedIn jobs with full JDs (capped per run to stay under the radar).
// Pass new jobs first, then existing thin ones — new hits get priority within the cap.
async function enrichNewJobs(newJobs, caps = { linkedin: 18 }, existingThin = []) {
  const enriched = [];
  const isThinLi = j => j.source === 'linkedin' && (j.description || '').length < 400;
  const targets = [...newJobs.filter(isThinLi), ...existingThin.filter(isThinLi)].slice(0, caps.linkedin);
  for (const job of targets) {
    try { const d = await linkedinDetail(job); if (d) { job.description = d.slice(0, 20000); enriched.push(job.id); } } catch { /* fail-soft */ }
    await sleep(jitter(1100));
  }
  return enriched;
}

module.exports = { fetchNaukriBrowser, fetchShine, fetchFoundit, fetchLinkedIn, fetchJSearch, enrichNewJobs, buildQueries };
