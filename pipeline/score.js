// Match-scoring engine: 0-100 with breakdown, mirroring Tsenta's match-percentage idea
'use strict';
const { daysAgo } = require('./lib');

function norm(s) { return (s || '').toLowerCase(); }

// Escape for regex, then match as loose word-boundary phrase
function hit(text, kw) {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(text);
}

function scoreTitle(job, profile) {
  const t = norm(job.title);
  let best = 0, matched = null;
  for (const tt of profile.targets.titles) {
    if (t.includes(tt.pattern) && tt.weight > best) { best = tt.weight; matched = tt.pattern; }
  }
  // domain-flavored PM titles get a small boost (e.g., "Product Manager - Risk")
  let domainBoost = 0;
  for (const d of profile.domains) {
    if (d.keywords.some(k => t.includes(k))) { domainBoost = 8; break; }
  }
  let penalty = 0;
  for (const n of profile.targets.title_negatives) {
    if (t.includes(n.pattern)) penalty = Math.max(penalty, n.penalty);
  }
  // "product manager" containing "project manager"-negative shouldn't fire unless truly present — patterns are distinct strings, fine.
  const score = Math.max(0, Math.min(100, best + domainBoost - penalty));
  return { score, matched, penalty };
}

function scoreDomains(job, profile) {
  const text = norm(job.title + ' ' + job.description);
  const hits = [];
  let weighted = 0, maxPossible = 0;
  for (const d of profile.domains) {
    maxPossible += d.weight;
    const kws = d.keywords.filter(k => hit(text, k));
    if (kws.length) {
      hits.push({ domain: d.name, keywords: kws.slice(0, 6) });
      // full weight if 2+ keyword hits, else 60%
      weighted += d.weight * (kws.length >= 2 ? 1 : 0.6);
    }
  }
  // Normalize: hitting user's top-2 domains ≈ 100. Use 22 as saturation point (fraud 10 + payments 10 ≈ jackpot).
  const score = Math.min(100, Math.round((weighted / 22) * 100));
  return { score, hits };
}

function scoreSkills(job, profile) {
  const text = norm(job.title + ' ' + job.description);
  if (!job.description || job.description.length < 80) return { score: 55, hits: [], thin: true }; // no JD text — neutral-ish
  const hits = [];
  let got = 0, total = 0;
  for (const s of profile.skills) {
    const w = s.strength === 'advanced' ? 1.2 : 1.0;
    total += w;
    if (s.keywords.some(k => hit(text, k))) { hits.push(s.name); got += w; }
  }
  const score = Math.round((got / total) * 100);
  return { score, hits };
}

function scoreLocation(job, profile) {
  const loc = norm(job.location + ' ' + (job.remote ? 'remote' : ''));
  const L = profile.targets.locations;
  if (!loc.trim()) return { score: 50, label: 'unknown' };
  if (L.preferred.some(p => loc.includes(p))) return { score: 100, label: 'preferred' };
  if (job.remote && /india|worldwide|anywhere|apac|asia/.test(loc)) return { score: 90, label: 'remote-ok' };
  if (L.acceptable.some(p => loc.includes(p))) return { score: 75, label: 'acceptable' };
  if (job.remote) return { score: 60, label: 'remote-unspecified' };
  // Other Indian metros still plausible
  if (/mumbai|pune|hyderabad|chennai|ahmedabad|jaipur|kolkata/.test(loc)) return { score: 45, label: 'other-india-metro' };
  return { score: 15, label: 'other' };
}

function scoreExperience(job, profile) {
  const text = norm(job.description);
  if (!text || text.length < 80) return { score: 70, label: 'unspecified' };
  const me = profile.identity.pm_experience_years;         // 3.2 PM years
  const meTotal = profile.identity.total_experience_years; // 5.5 total
  // find patterns like "3-5 years", "5+ years", "minimum 4 years"
  let min = null, max = null;
  let m = text.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)/);
  if (m) { min = +m[1]; max = +m[2]; }
  else if ((m = text.match(/(?:minimum|min\.?|at least)\s*(?:of\s*)?(\d{1,2})\s*\+?\s*(?:years|yrs)/))) { min = +m[1]; }
  else if ((m = text.match(/(\d{1,2})\s*\+\s*(?:years|yrs)/))) { min = +m[1]; }
  if (min == null) return { score: 70, label: 'unspecified' };
  max = max || min + 3;
  const fitsPM = me >= min - 0.5 && me <= max + 1.5;
  const fitsTotal = meTotal >= min - 0.5 && meTotal <= max + 2;
  if (fitsPM) return { score: 100, label: `${min}-${max} yrs (fits PM exp)` };
  if (fitsTotal) return { score: 85, label: `${min}-${max} yrs (fits total exp)` };
  if (min > meTotal + 2) return { score: 30, label: `${min}+ yrs (senior stretch)` };
  if (max < 2) return { score: 45, label: 'too junior' };
  return { score: 60, label: `${min}-${max} yrs (partial fit)` };
}

function scoreRecency(job) {
  const d = daysAgo(job.posted_at) ?? daysAgo(job.discovered_at);
  if (d == null) return { score: 50, label: 'unknown' };
  if (d <= 1) return { score: 100, label: 'today' };
  if (d <= 3) return { score: 92, label: 'this week' };
  if (d <= 7) return { score: 80, label: 'this week' };
  if (d <= 14) return { score: 62, label: '1-2 weeks' };
  if (d <= 30) return { score: 45, label: '2-4 weeks' };
  if (d <= 60) return { score: 28, label: '1-2 months' };
  return { score: 15, label: 'stale' };
}

const WEIGHTS = { title: 0.30, domain: 0.25, skills: 0.15, location: 0.15, experience: 0.10, recency: 0.05 };
// When there's no JD text (LinkedIn cards etc.) we can't know domain/skills/experience —
// scoring them as 0/neutral systematically punished those sources ~20 points vs rich-JD
// sources for the SAME role. Instead: judge only what we can see, and say so via `confidence`.
const WEIGHTS_THIN = { title: 0.50, domain: 0.10, location: 0.25, recency: 0.15 };

function scoreJob(job, profile) {
  const title = scoreTitle(job, profile);
  const domain = scoreDomains(job, profile);      // on thin jobs this scans the title only — real signal, low weight
  const skills = scoreSkills(job, profile);
  const location = scoreLocation(job, profile);
  const experience = scoreExperience(job, profile);
  const recency = scoreRecency(job);

  const descLen = (job.description || '').length;
  const thin = descLen < 80;
  const confidence = thin ? 'low' : (descLen >= 1200 ? 'high' : 'medium');

  let total;
  if (thin) {
    total =
      title.score * WEIGHTS_THIN.title +
      domain.score * WEIGHTS_THIN.domain +
      location.score * WEIGHTS_THIN.location +
      recency.score * WEIGHTS_THIN.recency;
  } else {
    total =
      title.score * WEIGHTS.title +
      domain.score * WEIGHTS.domain +
      skills.score * WEIGHTS.skills +
      location.score * WEIGHTS.location +
      experience.score * WEIGHTS.experience +
      recency.score * WEIGHTS.recency;
  }

  // Hard guards: non-PM titles can't ride high on domain alone
  if (title.score < 30) total = Math.min(total, 38);
  total = Math.round(Math.max(0, Math.min(100, total)));

  const W = thin ? WEIGHTS_THIN : WEIGHTS;
  return {
    total,
    confidence,                                    // high = full JD analysed · medium = partial · low = title/location only
    breakdown: {
      title: { score: title.score, weight: W.title, matched: title.matched },
      domain: { score: domain.score, weight: W.domain },
      skills: { score: skills.score, weight: thin ? 0 : WEIGHTS.skills },
      location: { score: location.score, weight: W.location, label: location.label },
      experience: { score: experience.score, weight: thin ? 0 : WEIGHTS.experience, label: experience.label },
      recency: { score: recency.score, weight: W.recency, label: recency.label }
    },
    domains_hit: domain.hits,
    skills_hit: skills.hits,
    jd_thin: thin
  };
}

module.exports = { scoreJob };
