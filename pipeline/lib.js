// Shared utilities: JSON store, env loader, text helpers, job normalization
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function loadJson(file, fallback) {
  try {
    const p = path.isAbsolute(file) ? file : path.join(DATA, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`[lib] failed to read ${file}: ${e.message}`);
    return fallback;
  }
}

function saveJson(file, obj) {
  const p = path.isAbsolute(file) ? file : path.join(DATA, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

// Minimal .env loader (no dependency). Reads jobsearch-os/.env
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  const env = { ...process.env };
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        env[m[1]] = v;
      }
    }
  }
  return env;
}

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }

function stripHtml(html) {
  if (!html) return '';
  let s = String(html);
  // Greenhouse (and some APIs) return HTML-escaped markup — unescape structural entities first so tags strip correctly
  if (/&lt;\s*(p|div|ul|li|br|h[1-6]|strong|em|span)/i.test(s)) {
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// Normalized job schema
function makeJob(o) {
  const url = o.url || '';
  const id = o.id || sha1(url || `${o.company}|${o.title}|${o.location}`);
  return {
    id,
    title: (o.title || '').trim(),
    company: (o.company || '').trim(),
    location: (o.location || '').trim(),
    url,
    apply_url: o.apply_url || url,
    salary: o.salary || null,
    job_type: o.job_type || null,
    remote: !!o.remote,
    posted_at: o.posted_at || null,          // ISO string or null
    discovered_at: o.discovered_at || new Date().toISOString(),
    source: o.source || 'unknown',
    description: (o.description || '').slice(0, 20000),
    score: o.score || null,
    suggestions: o.suggestions || [],
    status: o.status || 'new',
    emailed_at: o.emailed_at || null,
    recruiter_email: o.recruiter_email || null,
    application: o.application || null,
    notes: o.notes || ''
  };
}

// Robust-ish date parser for "June 25, 2026", ISO, ms timestamps
function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? null : d.toISOString(); }
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

function daysAgo(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

async function fetchJson(url, opts = {}, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobSearchOS/1.0', 'Accept': 'application/json', ...(opts.headers || {}) }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

module.exports = { ROOT, DATA, loadJson, saveJson, loadEnv, sha1, stripHtml, makeJob, parseDate, daysAgo, fetchJson };
