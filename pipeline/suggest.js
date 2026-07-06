// Resume-tailoring suggestion engine (Tsenta "Prep" step):
// compares the JD against the master resume/profile and produces concrete, prioritized changes.
'use strict';

function norm(s) { return (s || '').toLowerCase(); }
function hit(text, kw) {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(text);
}

function suggestForJob(job, profile) {
  const jd = norm(job.title + '\n' + job.description);
  const hasJD = job.description && job.description.length >= 80;
  const suggestions = [];
  const resumeKw = profile.resume_keywords_present.map(norm);

  // 1. Headline mirroring — always applicable
  suggestions.push({
    type: 'headline',
    priority: 1,
    text: `Mirror the exact JD title in your resume headline: "${job.title}${job.company ? ' — targeting ' + job.company : ''}". ATS ranks title-echo highly; your current headline says "Product Manager" generically.`
  });

  // 2. Evidence spotlight — pick achievements whose tags intersect the JD
  const evidenceScored = profile.evidence.map(ev => {
    const hits = ev.tags.filter(tag => hit(jd, tag));
    return { ev, hits: hits.length };
  }).filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);

  if (evidenceScored.length) {
    for (const { ev } of evidenceScored) {
      suggestions.push({
        type: 'evidence',
        priority: 2,
        text: `Lead with this proof point (matches this JD): ${ev.headline}. ${ev.detail.split('.')[0]}.`
      });
    }
  } else {
    suggestions.push({
      type: 'evidence',
      priority: 2,
      text: `Default anchor bullets for PM roles: (1) blacklist engine —74.6% algo fraud cancellations; (2) GPT-4o decisioning panel live in shadow mode; (3) $124K vendor cost saving. Reorder so the most JD-relevant one is bullet #1.`
    });
  }

  // 3. Keyword gaps — JD keywords from domain/skill clusters missing from resume keyword set
  const missing = [];
  const present = [];
  for (const d of profile.domains) {
    for (const kw of d.keywords) {
      if (hit(jd, kw)) {
        if (resumeKw.some(rk => rk === norm(kw) || norm(kw).includes(rk) || rk.includes(norm(kw)))) present.push(kw);
        else missing.push(kw);
      }
    }
  }
  for (const s of profile.skills) {
    for (const kw of s.keywords) {
      if (hit(jd, kw) && !resumeKw.some(rk => rk === norm(kw) || norm(kw).includes(rk) || rk.includes(norm(kw)))) missing.push(kw);
    }
  }
  const uniqMissing = [...new Set(missing)].slice(0, 8);
  if (hasJD && uniqMissing.length) {
    suggestions.push({
      type: 'keyword',
      priority: 3,
      text: `Add these JD keywords (verbatim) where truthful — summary or skills section: ${uniqMissing.join(', ')}. They appear in the JD but not in your master resume, so ATS keyword-matching will under-rank you.`
    });
  }

  // 4. Gap advice — domain-specific repositioning guidance
  for (const [gapKw, advice] of Object.entries(profile.gap_advice)) {
    if (hit(jd, gapKw)) {
      suggestions.push({ type: 'gap', priority: 4, text: advice });
    }
  }

  // 5. Experience phrasing
  const m = norm(job.description).match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)|(?:minimum|min\.?|at least)\s*(?:of\s*)?(\d{1,2})\s*\+?\s*(?:years|yrs)|(\d{1,2})\s*\+\s*(?:years|yrs)/);
  if (m) {
    const minReq = +(m[1] || m[3] || m[4]);
    if (minReq > 3.5 && minReq <= 6) {
      suggestions.push({
        type: 'general',
        priority: 5,
        text: `JD asks for ${minReq}+ years — state "5.5+ years of experience (3+ in product management)" in your summary so screeners count your total experience, not just the PM title years.`
      });
    } else if (minReq > 6) {
      suggestions.push({
        type: 'general',
        priority: 5,
        text: `JD asks ${minReq}+ years — this is a stretch (you have 5.5 total). Apply only if the scope excites you; emphasize breadth of ownership (0→1 GenAI build, $570K exposure closure, cross-functional leadership across 5 teams) to compensate.`
      });
    }
  }

  // 6. Company-type tailoring
  if (/(fintech|payments|lending|bank|finance|upi|card)/.test(jd)) {
    suggestions.push({
      type: 'general',
      priority: 6,
      text: `Fintech JD: quantify risk outcomes in money terms first ($124K vendor saving, $570K chargeback exposure closed, 74.6% fraud-cancellation cut) — fintech hiring managers read ₹/$ impact before percentages.`
    });
  }
  if (/(ai|genai|llm|machine learning|artificial intelligence)/.test(jd)) {
    suggestions.push({
      type: 'general',
      priority: 6,
      text: `AI-flavored JD: move the GPT-4o decisioning panel to your first bullet and name the methodology (golden-dataset evaluation, shadow-mode validation, structured-output design, AI governance guardrails) — these are the exact phrases AI-product interviewers look for.`
    });
  }

  // 7. Thin-JD note
  if (!hasJD) {
    suggestions.push({
      type: 'general',
      priority: 9,
      text: `Full JD text not captured yet — open the posting link and paste the JD into the dashboard's suggestion box (or rerun with details) for keyword-level tailoring. Suggestions above are based on the title.`
    });
  }

  // Deduplicate by text, sort by priority
  const seen = new Set();
  return suggestions.filter(s => !seen.has(s.text) && seen.add(s.text)).sort((a, b) => a.priority - b.priority);
}

module.exports = { suggestForJob };
