/* PM Interview Coach — SPA logic: routing, dashboard, interactive interview flow,
   speech (type or speak), progress tracking (localStorage), optional AI feedback. */
'use strict';
const DATA = window.COACH_DATA;
const LS_KEY = 'pmcoach.v1';
const $ = s => document.querySelector(s);
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const todayKey = () => new Date().toISOString().slice(0, 10);
function toast(m){ const t=$('#toast'); t.textContent=m; t.style.display='block'; clearTimeout(t._t); t._t=setTimeout(()=>t.style.display='none',2600); }

/* ---------------- state ---------------- */
function loadState(){
  let s; try { s = JSON.parse(localStorage.getItem(LS_KEY)); } catch { s = null; }
  if(!s) s = {};
  s.version = 1;
  s.streak = s.streak || { current: 0, longest: 0, lastActiveDate: null };
  s.activity = s.activity || {};
  s.moduleProgress = s.moduleProgress || {};
  s.sessions = s.sessions || [];
  s.settings = Object.assign({ voiceInput:true, readAloud:false, aiFeedback:false, apiKey:'', aiModel:'claude-sonnet-5', aiProvider:'anthropic', openaiKey:'', openaiModel:'gpt-4o' }, s.settings || {});
  return s;
}
let STATE = loadState();
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }
window.__coachSettings = () => STATE.settings;   // read-only bridge for ai.js

function recordSession(sess){
  STATE.sessions.unshift(sess);
  STATE.sessions = STATE.sessions.slice(0, 500);
  // activity
  const k = todayKey();
  const a = STATE.activity[k] || { sessions:0, minutes:0 };
  a.sessions += 1; a.minutes += Math.round((sess.durationSec||0)/60);
  STATE.activity[k] = a;
  // streak
  const last = STATE.streak.lastActiveDate;
  if(last !== k){
    const y = new Date(Date.now()-86400000).toISOString().slice(0,10);
    STATE.streak.current = (last === y) ? STATE.streak.current + 1 : 1;
    STATE.streak.longest = Math.max(STATE.streak.longest, STATE.streak.current);
    STATE.streak.lastActiveDate = k;
  }
  // module progress
  const mp = STATE.moduleProgress[sess.moduleId] || { attempts:0, bestScore:0, lastScore:0, totalScore:0 };
  mp.attempts += 1; mp.lastScore = sess.score; mp.totalScore += sess.score;
  mp.bestScore = Math.max(mp.bestScore, sess.score);
  STATE.moduleProgress[sess.moduleId] = mp;
  save();
}

/* ---------------- derived ---------------- */
function moduleById(id){ return DATA.modules.find(m=>m.id===id); }
function caseById(id){ return DATA.cases.find(c=>c.id===id); }
function casesForModule(id){ return DATA.cases.filter(c=>c.moduleId===id); }
function masteryOf(id){
  const mp = STATE.moduleProgress[id];
  if(!mp || !mp.attempts) return { pct:0, label:'Not started', attempts:0 };
  const avg = mp.totalScore/mp.attempts;
  const pct = Math.round(Math.min(100, (avg*0.7) + Math.min(mp.attempts,6)/6*30));
  const label = pct>=80?'Strong':pct>=60?'Solid':pct>=35?'Practicing':'Started';
  return { pct, label, attempts: mp.attempts, best: mp.bestScore, avg: Math.round(avg) };
}
function totalStats(){
  const s = STATE.sessions;
  const week = s.filter(x=> Date.now()-new Date(x.ts).getTime() < 7*86400000).length;
  const mins = Object.values(STATE.activity).reduce((a,b)=>a+(b.minutes||0),0);
  const started = Object.keys(STATE.moduleProgress).length;
  return { total:s.length, week, mins, started };
}

/* ---------------- router ---------------- */
const routes = {
  '': renderHome, 'home': renderHome,
  'modules': renderModules,
  'module': (id)=>renderModule(id),
  'case': (id)=>renderCase(id),
  'bank': (id)=>renderBank(id),
  'guided': (arg)=>renderGuided(arg),
  'practice': (id)=> id ? renderQuickPractice(id) : renderPracticePicker(),
  'history': renderHistory,
  'settings': renderSettings
};
function router(){
  stopSpeech();
  const hash = location.hash.replace(/^#\/?/, '');
  const [route, arg] = hash.split('/');
  const fn = routes[route] || renderHome;
  document.querySelectorAll('#nav a[data-route]').forEach(a=>a.classList.toggle('active', a.dataset.route === (route||'home')));
  const v = $('#view'); v.innerHTML='';
  const node = fn(arg);
  if(node) v.appendChild(node);
  window.scrollTo(0,0);
}
window.addEventListener('hashchange', router);

/* ---------------- HOME / DASHBOARD ---------------- */
function renderHome(){
  const st = totalStats();
  const plan = todaysPlan();
  const wrap = el('<div></div>');
  wrap.appendChild(el(`
   <div class="grid" style="grid-template-columns:repeat(4,1fr)">
     ${kpi('🔥', STATE.streak.current, 'Day streak', 'green')}
     ${kpi('✅', st.total, 'Sessions done', '')}
     ${kpi('📅', st.week, 'This week', 'blue')}
     ${kpi('⏱️', st.mins, 'Minutes practiced', 'gold')}
   </div>`));

  // Question Bank banner
  const qbTotal = Object.values((window.COACH_QUESTIONS||{byCategory:{}}).byCategory).reduce((a,b)=>a+b.length,0);
  if(qbTotal){
    wrap.appendChild(el(`<div class="card" style="margin-top:16px;display:flex;gap:14px;align-items:center;cursor:pointer;background:linear-gradient(180deg,rgba(16,185,129,.06),var(--panel-2));border-color:var(--line-bright)" onclick="location.hash='#/bank'">
      <div style="font-size:30px">📚</div>
      <div style="flex:1"><div style="font-weight:700;font-size:16px">Question Bank — ${qbTotal} real interview questions</div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:3px">Product Design · Data & Metrics · Problem Solving · Estimation · Behavioural — each with step-by-step guided practice.</div></div>
      <span class="btn sm">Open bank →</span></div>`));
  }

  // Today's plan
  const planCard = el(`<div><h2 class="sec"><span class="bar"></span>Today's plan <span class="tag">${DATA.profile.focus}</span></h2></div>`);
  const pg = el('<div class="grid" style="grid-template-columns:repeat(3,1fr)"></div>');
  plan.forEach(p=> pg.appendChild(planTile(p)));
  planCard.appendChild(pg);
  wrap.appendChild(planCard);

  // Module progress
  const mp = el(`<div><h2 class="sec"><span class="bar"></span>Module mastery <span class="tag">${st.started}/${DATA.modules.length} started</span></h2></div>`);
  const mg = el('<div class="grid" style="grid-template-columns:repeat(2,1fr)"></div>');
  DATA.modules.forEach(m=> mg.appendChild(moduleProgressCard(m)));
  mp.appendChild(mg); wrap.appendChild(mp);

  // Activity heatmap (14d)
  wrap.appendChild(el(`<div><h2 class="sec"><span class="bar"></span>Last 14 days</h2>${heatmap()}</div>`));

  // Recent sessions
  const rc = el(`<div><h2 class="sec"><span class="bar"></span>Recent sessions</h2></div>`);
  rc.appendChild(recentSessionsTable());
  wrap.appendChild(rc);
  return wrap;
}
function kpi(icon, n, label, cls){
  return `<div class="card" style="padding:15px 16px"><div style="font-size:18px">${icon}</div><div style="font-size:26px;font-weight:750;letter-spacing:-1px;margin-top:6px" class="${cls==='green'?'':''}">${n}</div><div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-top:4px">${label}</div></div>`;
}
function todaysPlan(){
  // one weak-spot module, one least-practiced module, one case (prefer home-turf/high-value)
  const weak = DATA.profile.weakSpots.map(moduleById).filter(Boolean);
  const byAttempts = [...DATA.modules].sort((a,b)=> (STATE.moduleProgress[a.id]?.attempts||0) - (STATE.moduleProgress[b.id]?.attempts||0));
  const picks = [];
  if(weak[0]) picks.push({ type:'module', m: weak[0], why:'Your growth area — do a rep' });
  const least = byAttempts.find(m=> !picks.some(p=>p.m && p.m.id===m.id));
  if(least) picks.push({ type:'module', m: least, why:'Least practiced' });
  // a case not done today
  const doneToday = new Set(STATE.sessions.filter(s=>s.ts.slice(0,10)===todayKey()&&s.caseId).map(s=>s.caseId));
  const caseChoice = DATA.cases.find(c=> !doneToday.has(c.id)) || DATA.cases[0];
  picks.push({ type:'case', c: caseChoice, why:'Live case flow' });
  return picks.slice(0,3);
}
function planTile(p){
  if(p.type==='case'){
    return el(`<div class="card" style="cursor:pointer" onclick="location.hash='#/case/${p.c.id}'">
      <div class="chipset" style="margin-bottom:8px"><span class="diff ${p.c.difficulty}">${p.c.difficulty}</span><span class="pill">${esc(p.c.company)}</span></div>
      <div style="font-weight:650;font-size:15px">${esc(p.c.title)}</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:6px">${esc(p.why)} · ~${p.c.estMinutes} min</div>
      <div style="margin-top:12px"><span class="btn sm">Start case →</span></div></div>`);
  }
  const m = p.m; const mm = masteryOf(m.id);
  return el(`<div class="card" style="cursor:pointer" onclick="location.hash='#/module/${m.id}'">
    <div style="font-size:20px">${m.icon}</div>
    <div style="font-weight:650;font-size:15px;margin-top:6px">${esc(m.title)}</div>
    <div style="font-size:12.5px;color:var(--muted);margin-top:6px">${esc(p.why)} · ${mm.label}</div>
    <div style="margin-top:12px"><span class="btn sm ghost">Open module →</span></div></div>`);
}
function moduleProgressCard(m){
  const mm = masteryOf(m.id);
  const weak = DATA.profile.weakSpots.includes(m.id);
  return el(`<div class="card" style="cursor:pointer;display:flex;gap:14px;align-items:center" onclick="location.hash='#/module/${m.id}'">
    <div style="font-size:26px">${m.icon}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px"><span style="font-weight:650">${esc(m.title)}</span>${weak?'<span class="diff Hard">focus</span>':''}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(m.tagline)}</div>
      <div style="height:7px;background:var(--panel-2);border-radius:6px;margin-top:9px;overflow:hidden;border:1px solid var(--line-soft)"><div style="height:100%;width:${mm.pct}%;background:linear-gradient(90deg,var(--accent),var(--accent-bright))"></div></div>
    </div>
    <div style="text-align:right;flex:none"><div style="font-weight:750;font-size:16px;color:${mm.pct>=60?'var(--accent-bright)':'var(--text-dim)'}">${mm.pct}%</div><div style="font-size:10px;color:var(--muted)">${mm.label}${mm.attempts?` · ${mm.attempts}x`:''}</div></div>
  </div>`);
}
function heatmap(){
  let cells='';
  for(let i=13;i>=0;i--){
    const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    const a = STATE.activity[d];
    const n = a? a.sessions : 0;
    const bg = n===0?'var(--panel-2)': n===1?'rgba(16,185,129,.30)': n===2?'rgba(16,185,129,.55)':'var(--accent)';
    cells += `<div title="${d}: ${n} session(s)" style="width:100%;aspect-ratio:1;border-radius:6px;background:${bg};border:1px solid var(--line-soft)"></div>`;
  }
  return `<div class="card"><div style="display:grid;grid-template-columns:repeat(14,1fr);gap:6px">${cells}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:10px">Each square is a day · brighter = more sessions</div></div>`;
}
function recentSessionsTable(){
  const s = STATE.sessions.slice(0,8);
  if(!s.length) return el(`<div class="card" style="color:var(--muted);text-align:center">No sessions yet — start with today's plan above.</div>`);
  const rows = s.map(x=>`<tr>
    <td>${new Date(x.ts).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})}</td>
    <td>${esc(x.title)}</td>
    <td><span class="pill" style="padding:3px 9px">${x.type}</span></td>
    <td style="color:${x.score>=70?'var(--accent-bright)':x.score>=45?'var(--amber)':'var(--muted)'};font-weight:700">${x.score}%</td>
    <td>${Math.round((x.durationSec||0)/60)}m</td></tr>`).join('');
  const t = el(`<div class="card" style="padding:6px 10px"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr>${['When','Session','Type','Self-score','Time'].map(h=>`<th style="text-align:left;color:var(--muted);font-weight:600;padding:8px;border-bottom:1px solid var(--line)">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>`);
  return t;
}

/* ---------------- MODULES LIST ---------------- */
function renderModules(){
  const wrap = el('<div></div>');
  wrap.appendChild(el(`<h2 class="sec"><span class="bar"></span>All modules <span class="tag">${DATA.modules.length} tracks · learn + practice</span></h2>`));
  const g = el('<div class="grid" style="grid-template-columns:repeat(3,1fr)"></div>');
  DATA.modules.forEach(m=>{
    const mm = masteryOf(m.id);
    g.appendChild(el(`<div class="card" style="cursor:pointer;display:flex;flex-direction:column" onclick="location.hash='#/module/${m.id}'">
      <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:26px">${m.icon}</span><span class="diff ${m.difficulty}">${m.difficulty}</span></div>
      <div style="font-weight:650;font-size:16px;margin-top:10px">${esc(m.title)}</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:5px;flex:1">${esc(m.tagline)}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:11.5px;color:var(--muted)">
        <span>📝 ${m.questions.length} Qs</span><span>·</span><span>🎭 ${casesForModule(m.id).length} cases</span><span style="margin-left:auto;color:${mm.pct>=60?'var(--accent-bright)':'var(--muted)'}">${mm.pct}%</span></div>
    </div>`));
  });
  wrap.appendChild(g);
  return wrap;
}

/* ---------------- MODULE DETAIL (learn + questions) ---------------- */
function renderModule(id){
  const m = moduleById(id); if(!m) return el('<div class="card">Module not found.</div>');
  const L = m.learn; const mm = masteryOf(id);
  const wrap = el('<div></div>');
  wrap.appendChild(el(`<div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
    <span style="font-size:34px">${m.icon}</span>
    <div><div style="font-size:22px;font-weight:700;letter-spacing:-.4px">${esc(m.title)}</div>
    <div style="color:var(--muted);font-size:13px;margin-top:2px">${esc(m.tagline)} · <span class="diff ${m.difficulty}">${m.difficulty}</span> · ${mm.label} ${mm.attempts?`(${mm.attempts} reps)`:''}</div></div></div>`));

  // Learn card
  const learn = el(`<div class="card" style="margin-top:12px"></div>`);
  learn.appendChild(el(`<div style="font-size:14px;color:var(--text-dim);line-height:1.7">${esc(L.overview)}</div>`));
  learn.appendChild(el(`<div style="font-weight:650;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin:16px 0 8px">Framework</div>`));
  const steps = el('<div style="display:flex;flex-direction:column;gap:8px"></div>');
  L.framework.forEach((f,i)=> steps.appendChild(el(`<div style="display:flex;gap:11px;align-items:flex-start">
    <div style="flex:none;width:24px;height:24px;border-radius:7px;background:rgba(16,185,129,.12);color:var(--accent-bright);display:grid;place-items:center;font-size:12px;font-weight:700">${i+1}</div>
    <div style="font-size:13px"><b style="color:var(--text)">${esc(f.step)}.</b> <span style="color:var(--text-dim)">${esc(f.detail)}</span></div></div>`)));
  learn.appendChild(steps);
  learn.appendChild(el(`<div style="margin-top:16px;background:rgba(224,169,75,.06);border:1px solid rgba(224,169,75,.22);border-radius:10px;padding:12px"><b style="color:var(--amber);font-size:12px">2026 shift</b><div style="font-size:13px;color:var(--text-dim);margin-top:4px">${esc(L.shift2026)}</div></div>`));
  const tips = el(`<div style="margin-top:12px"><div style="font-weight:650;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:6px">Tips</div><ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-dim);line-height:1.8">${L.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`);
  learn.appendChild(tips);
  learn.appendChild(el(`<div style="margin-top:14px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.22);border-radius:10px;padding:12px"><b style="color:var(--accent-bright);font-size:12px">✦ Your edge</b><div style="font-size:13px;color:var(--text-dim);margin-top:4px">${esc(L.edge)}</div></div>`));
  wrap.appendChild(learn);

  // Cases for this module
  const cs = casesForModule(id);
  if(cs.length){
    wrap.appendChild(el(`<h2 class="sec"><span class="bar"></span>Live case flows</h2>`));
    const cg = el('<div class="grid" style="grid-template-columns:repeat(2,1fr)"></div>');
    cs.forEach(c=> cg.appendChild(el(`<div class="card" style="cursor:pointer" onclick="location.hash='#/case/${c.id}'">
      <div class="chipset" style="margin-bottom:8px"><span class="diff ${c.difficulty}">${c.difficulty}</span><span class="pill" style="padding:3px 9px">${esc(c.company)}</span><span class="pill" style="padding:3px 9px">${c.stages.length} stages · ~${c.estMinutes}m</span></div>
      <div style="font-weight:650;font-size:15px">${esc(c.title)}</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:6px">${esc(c.prompt).slice(0,120)}…</div>
      <div style="margin-top:12px"><span class="btn sm">Start interview →</span></div></div>`)));
    wrap.appendChild(cg);
  }

  // Question bank → quick practice
  wrap.appendChild(el(`<h2 class="sec"><span class="bar"></span>Question bank <span class="tag">${m.questions.length} real/patterned questions</span></h2>`));
  const ql = el('<div class="grid" style="gap:10px"></div>');
  m.questions.forEach((q,i)=> ql.appendChild(el(`<div class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:center">
    <div style="flex:1"><div style="font-size:14px;color:var(--text)">${esc(q.q)}</div>
      <div style="margin-top:5px" class="chipset"><span class="pill" style="padding:2px 8px;font-size:11px">${esc(q.company)}</span><span class="diff ${q.difficulty}">${q.difficulty}</span>${(q.tags||[]).map(t=>`<span class="pill" style="padding:2px 8px;font-size:11px;color:var(--muted)">#${esc(t)}</span>`).join('')}</div></div>
    <button class="btn sm ghost" onclick="startQuick('${m.id}',${i})">Practice →</button></div>`)));
  wrap.appendChild(ql);
  return wrap;
}

/* ---------------- QUICK PRACTICE (single question) ---------------- */
let quickCtx = null;
window.startQuick = (moduleId, qIndex)=>{ quickCtx = { moduleId, qIndex }; location.hash = `#/practice/${moduleId}`; };
function renderPracticePicker(){
  const wrap = el(`<div><h2 class="sec"><span class="bar"></span>Quick practice</h2><div class="card" style="color:var(--text-dim)">Pick a module, then a question, to do a single timed rep with the framework as your guide. Or run a full multi-stage case from any module page.</div></div>`);
  const g = el('<div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:14px"></div>');
  DATA.modules.forEach(m=> g.appendChild(el(`<div class="card" style="cursor:pointer" onclick="location.hash='#/module/${m.id}'"><span style="font-size:22px">${m.icon}</span><div style="font-weight:650;margin-top:8px">${esc(m.title)}</div><div style="font-size:12px;color:var(--muted);margin-top:4px">${m.questions.length} questions</div></div>`)));
  wrap.appendChild(g); return wrap;
}
function renderQuickPractice(moduleId){
  const m = moduleById(moduleId); if(!m) return renderPracticePicker();
  const idx = quickCtx && quickCtx.moduleId===moduleId ? quickCtx.qIndex : Math.floor(Math.random()*m.questions.length);
  const q = m.questions[idx];
  const started = Date.now();
  const wrap = el('<div></div>');
  wrap.appendChild(el(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><a class="btn sm ghost" href="#/module/${m.id}">← ${esc(m.title)}</a><span class="diff ${q.difficulty}">${q.difficulty}</span><span class="pill" style="padding:3px 9px">${esc(q.company)}</span><span class="pill" id="qTimer" style="padding:3px 9px">0:00</span></div>`));
  wrap.appendChild(el(`<div class="card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Question</div><div style="font-size:18px;font-weight:600;margin-top:6px;line-height:1.5">${esc(q.q)}</div>
    <div style="margin-top:8px"><button class="btn sm ghost" onclick="toggleRead(this)" data-q="${esc(q.q)}">🔊 Read aloud</button></div></div>`));
  wrap.appendChild(answerBox('quick'));
  // AI tutor CTAs
  wrap.appendChild(el(`<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn ghost" id="qpEval">✨ Evaluate & improve my answer</button>
    <button class="btn ghost" id="qpFull">💡 Complete answer</button></div>`));
  wrap.appendChild(el('<div class="aipanel" id="qpEvalPanel" style="display:none;margin-top:12px"></div>'));
  wrap.appendChild(el('<div class="aipanel" id="qpFullPanel" style="display:none;margin-top:12px"></div>'));
  const guide = el(`<div class="card" style="margin-top:14px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">Framework to structure your answer</div>${m.learn.framework.map((f,i)=>`<div style="font-size:13px;margin:5px 0"><b style="color:var(--accent-bright)">${i+1}. ${esc(f.step)}</b> — <span style="color:var(--text-dim)">${esc(f.detail)}</span></div>`).join('')}</div>`);
  wrap.appendChild(guide);
  // self rate + save
  const done = el(`<div class="card" style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div style="font-size:13px;color:var(--text-dim)">How did that rep feel?</div><div class="chipset" id="qRate"></div><button class="btn" id="qSave" disabled>Save rep</button></div>`);
  wrap.appendChild(done);
  setTimeout(()=>{
    [['1 · shaky',20],['2',40],['3 · ok',60],['4',80],['5 · sharp',100]].forEach(([lab,val])=>{
      const b = el(`<button class="btn sm ghost">${lab}</button>`);
      b.onclick=()=>{ done._score=val; $('#qRate').querySelectorAll('button').forEach(x=>x.classList.add('ghost')); b.classList.remove('ghost'); $('#qSave').disabled=false; };
      $('#qRate').appendChild(b);
    });
    $('#qSave').onclick=()=>{
      const ansEl = $('#answerText');
      recordSession({ id:'s'+Date.now(), ts:new Date().toISOString(), type:'quick', moduleId:m.id, caseId:null,
        title:`Q: ${q.q.slice(0,60)}`, durationSec:Math.round((Date.now()-started)/1000), score: done._score||60,
        mode: ansEl && ansEl.value.trim() ? 'type':'speak', answers:[{stage:q.q, text: ansEl?ansEl.value:''}] });
      toast('Rep saved ✓'); location.hash = '#/module/'+m.id;
    };
    startTimer('#qTimer', started);
    // AI tutor wiring (quick practice has no `flow` — call CoachAI directly)
    const qcat = (QB.categories||[]).find(c=>c.moduleId===m.id) || null;
    $('#qpFull').onclick = function(){
      const p=$('#qpFullPanel');
      if(p.style.display!=='none' && p.dataset.done){ p.style.display='none'; this.textContent='💡 Complete answer'; return; }
      p.style.display='block'; this.textContent='▲ Hide complete answer'; p.dataset.done='1';
      p.innerHTML=''; const card=el(`<div class="card" style="background:rgba(16,185,129,.05);border-color:rgba(16,185,129,.22)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--accent-bright);font-weight:700;margin-bottom:8px">💡 Complete model answer</div><div class="aibody" style="font-size:13.5px;color:var(--text-dim);line-height:1.75"></div></div>`);
      p.appendChild(card);
      CoachAI.runInto(card.querySelector('.aibody'), 'complete:qp:'+m.id+':'+idx, ()=>CoachAI.completeAnswerPrompts(q.q, qcat));
    };
    $('#qpEval').onclick = async function(){
      const text = ($('#answerText')&&$('#answerText').value.trim())||'';
      if(!text){ toast('Type or speak an answer first — then I can evaluate it'); return; }
      const p=$('#qpEvalPanel'); p.style.display='block'; p.innerHTML='';
      const card=el(`<div class="card" style="background:rgba(91,147,214,.05);border-color:rgba(91,147,214,.25)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--blue);font-weight:700;margin-bottom:8px">🤖 AI tutor — evaluation & upgraded answer</div><div class="aibody" style="font-size:13.5px;color:var(--text-dim);line-height:1.75"></div></div>`);
      p.appendChild(card); const body=card.querySelector('.aibody');
      if(!CoachAI.configured()){ body.innerHTML=`🔑 <b>Connect your AI first.</b> Add your OpenAI (GPT-4o) or Claude key in <a href="#/settings">Settings</a>.`; return; }
      this.disabled=true;
      try{
        const {system,user}=CoachAI.evaluatePrompts(q.q,'','',text,qcat);
        const full=await CoachAI.stream({system,user,onDelta:(_,sofar)=>{ body.innerHTML=CoachAI.md(sofar)+'<span style="color:var(--accent-bright)">▌</span>'; }});
        body.innerHTML=CoachAI.md(full);
      }catch(e){ body.innerHTML=`<span style="color:var(--red)">⚠ ${esc(e.message)}</span>`; }
      this.disabled=false;
    };
  },0);
  return wrap;
}

/* ---------------- CASE FLOW (multi-stage interview) ---------------- */
let flow = null;
function renderCase(id){
  const c = caseById(id); if(!c) return el('<div class="card">Case not found.</div>');
  flow = { c, stage:-1, started:Date.now(), answers:[], revealed:false };
  const wrap = el('<div id="flowRoot"></div>');
  setTimeout(()=>renderFlowIntro(), 0);
  return wrap;
}
function renderFlowIntro(){
  const c = flow.c; const root = $('#flowRoot'); if(!root) return; root.innerHTML='';
  root.appendChild(el(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><a class="btn sm ghost" href="#/module/${c.moduleId}">← ${esc(moduleById(c.moduleId).title)}</a><span class="diff ${c.difficulty}">${c.difficulty}</span><span class="pill" style="padding:3px 9px">${esc(c.company)}</span></div>`));
  root.appendChild(el(`<div class="card">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Interview case · ${c.stages.length} stages · ~${c.estMinutes} min</div>
    <div style="font-size:21px;font-weight:700;margin:8px 0 4px;letter-spacing:-.3px">${esc(c.title)}</div>
    <div style="font-size:15px;color:var(--text-dim);line-height:1.6">${esc(c.prompt)}</div>
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn" onclick="nextStage()">▶ Begin interview</button>
      <button class="btn ghost sm" onclick="toggleRead(this)" data-q="${esc(c.prompt)}">🔊 Read prompt</button>
      <span style="font-size:12px;color:var(--muted)">Answer each stage by typing or speaking. You'll see model points + a pushback after each.</span>
    </div></div>`));
  return root;
}
window.nextStage = ()=>{
  flow.stage++;
  if(flow.stage >= flow.c.stages.length){ renderFlowScore(); return; }
  renderStage();
};
function renderStage(){
  const c = flow.c; const s = c.stages[flow.stage]; const root = $('#flowRoot'); root.innerHTML='';
  const n = flow.stage+1, total = c.stages.length;
  if(flow.readAloud!==false && STATE.settings.readAloud) speak(s.ask);
  root.appendChild(el(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
     <span class="pill" style="padding:3px 10px">${esc(c.company)} · ${esc(c.title)}</span>
     <span class="pill" id="stTimer" style="padding:3px 10px">0:00</span>
     <div style="flex:1;height:6px;background:var(--panel-2);border-radius:6px;overflow:hidden;border:1px solid var(--line-soft)"><div style="height:100%;width:${Math.round(n/total*100)}%;background:linear-gradient(90deg,var(--accent),var(--accent-bright))"></div></div>
     <span style="font-size:12px;color:var(--muted)">Stage ${n}/${total}</span></div>`));
  // interviewer question
  root.appendChild(el(`<div class="card" style="border-color:var(--line-bright)">
     <div style="display:flex;gap:11px;align-items:flex-start">
       <div style="flex:none;width:34px;height:34px;border-radius:10px;background:linear-gradient(140deg,var(--accent),#0c8f66);display:grid;place-items:center;font-size:17px">🎤</div>
       <div style="flex:1"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px">Interviewer</div>
         <div style="font-size:16.5px;font-weight:600;margin-top:3px;line-height:1.5">${esc(s.ask)}</div>
         ${s.hint?`<div style="font-size:12.5px;color:var(--muted);margin-top:8px">💡 ${esc(s.hint)}</div>`:''}
         <button class="btn sm ghost" style="margin-top:10px" onclick="toggleRead(this)" data-q="${esc(s.ask)}">🔊 Read aloud</button></div>
     </div></div>`));
  // answer box
  root.appendChild(answerBox('stage'));
  // reveal + next controls
  root.appendChild(el(`<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap" id="stageCtrl">
     <button class="btn" onclick="revealStage()">Reveal model points & pushback</button>
     <button class="btn ghost" onclick="aiEvaluate(this)">✨ Evaluate & improve my answer</button>
     <button class="btn ghost" onclick="aiCompleteFlow(this)">💡 Complete answer</button>
  </div>`));
  root.appendChild(el('<div class="aipanel" id="aiEvalPanel" style="display:none;margin-top:12px" ></div>'));
  root.appendChild(el('<div class="aipanel" id="aiFullPanel" style="display:none;margin-top:12px"></div>'));
  root.appendChild(el('<div id="reveal"></div>'));
  startTimer('#stTimer', Date.now());
}
window.revealStage = ()=>{
  const c = flow.c; const s = c.stages[flow.stage];
  const ansEl = $('#answerText'); const text = ansEl?ansEl.value.trim():'';
  flow.answers[flow.stage] = { stage:s.ask, text };
  const box = $('#reveal'); if(!box) return;
  box.innerHTML='';
  box.appendChild(el(`<div class="card" style="margin-top:14px;background:rgba(16,185,129,.05);border-color:rgba(16,185,129,.22)">
     <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--accent-bright);font-weight:700">What a strong answer hits</div>
     <ul style="margin:8px 0 0;padding-left:18px;font-size:13.5px;color:var(--text-dim);line-height:1.9">${s.modelPoints.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>`));
  if(s.pushback) box.appendChild(el(`<div class="card" style="margin-top:12px;background:rgba(229,105,95,.05);border-color:rgba(229,105,95,.22)">
     <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--red);font-weight:700">⚡ Interviewer pushback — answer this too</div>
     <div style="font-size:14.5px;color:var(--text);margin-top:6px">${esc(s.pushback)}</div>
     <div style="font-size:12px;color:var(--muted);margin-top:6px">Say your response out loud (or jot it) before moving on — pushback handling is what separates strong candidates.</div></div>`));
  const isLast = flow.stage === c.stages.length-1;
  box.appendChild(el(`<div style="margin-top:14px"><button class="btn" onclick="nextStage()">${isLast?'Finish & self-score →':'Next stage →'}</button></div>`));
  $('#stageCtrl').style.display='none';
};
// category context for the current flow (guided carries it; cases map via moduleId)
function flowCategory(){
  if(!flow || !flow.c) return null;
  if(flow.c.category) return flow.c.category;
  return (QB.categories||[]).find(c=>c.moduleId===flow.c.moduleId) || null;
}
window.aiEvaluate = async (btn)=>{
  const s = flow.c.stages[flow.stage];
  const ansEl = $('#answerText'); const text = ansEl?ansEl.value.trim():'';
  const panel = $('#aiEvalPanel'); if(!panel) return;
  if(!text){ toast('Type or speak an answer first — then I can evaluate it'); return; }
  panel.style.display='block';
  panel.innerHTML='';
  const card = el(`<div class="card" style="background:rgba(91,147,214,.05);border-color:rgba(91,147,214,.25)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--blue);font-weight:700;margin-bottom:8px">🤖 AI tutor — evaluation & upgraded answer</div><div class="aibody" style="font-size:13.5px;color:var(--text-dim);line-height:1.75"></div></div>`);
  panel.appendChild(card);
  const body = card.querySelector('.aibody');
  btn.disabled=true;
  if(!CoachAI.configured()){
    body.innerHTML = `🔑 <b>Connect your AI first.</b> Add your OpenAI (GPT-4o) or Claude key in <a href="#/settings">Settings</a> — stored in this browser only.`;
    btn.disabled=false; return;
  }
  try{
    const { system, user } = CoachAI.evaluatePrompts(flow.c.prompt, s.hint||'', s.ask, text, flowCategory());
    const full = await CoachAI.stream({ system, user, onDelta:(_,sofar)=>{ body.innerHTML = CoachAI.md(sofar)+'<span style="color:var(--accent-bright)">▌</span>'; } });
    body.innerHTML = CoachAI.md(full);
  }catch(e){ body.innerHTML = `<span style="color:var(--red)">⚠ ${esc(e.message)}</span>`; }
  btn.disabled=false;
};
window.aiCompleteFlow = (btn)=>{
  const panel = $('#aiFullPanel'); if(!panel) return;
  if(panel.style.display!=='none' && panel.dataset.done){ panel.style.display='none'; btn.textContent='💡 Complete answer'; return; }
  panel.style.display='block'; btn.textContent='▲ Hide complete answer';
  panel.innerHTML='';
  const card = el(`<div class="card" style="background:rgba(16,185,129,.05);border-color:rgba(16,185,129,.22)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--accent-bright);font-weight:700;margin-bottom:8px">💡 Complete model answer</div><div class="aibody" style="font-size:13.5px;color:var(--text-dim);line-height:1.75"></div></div>`);
  panel.appendChild(card);
  panel.dataset.done='1';
  CoachAI.runInto(card.querySelector('.aibody'), 'complete:flow:'+flow.c.id, ()=>CoachAI.completeAnswerPrompts(flow.c.prompt, flowCategory()));
};
function renderFlowScore(){
  const c = flow.c; const root = $('#flowRoot'); root.innerHTML='';
  const dur = Math.round((Date.now()-flow.started)/1000);
  root.appendChild(el(`<div class="card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Self-assessment</div>
    <div style="font-size:20px;font-weight:700;margin:6px 0 2px">${esc(c.title)} — how did you do?</div>
    <div style="font-size:13px;color:var(--muted)">Check each criterion you genuinely hit. Be honest — this drives your progress tracking.</div></div>`));
  const rub = el('<div class="card" style="margin-top:12px"></div>');
  c.rubric.forEach((r,i)=>{
    const row = el(`<label style="display:flex;gap:11px;align-items:center;padding:9px 4px;cursor:pointer;border-top:${i?'1px solid var(--line-soft)':'0'}">
      <input type="checkbox" style="width:18px;height:18px;accent-color:var(--accent)"><span style="font-size:14px;color:var(--text-dim)">${esc(r)}</span></label>`);
    rub.appendChild(row);
  });
  root.appendChild(rub);
  root.appendChild(el(`<div class="card" style="margin-top:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
     <div id="scorePreview" style="font-size:26px;font-weight:750;color:var(--muted)">—</div>
     <div style="font-size:13px;color:var(--muted);flex:1">Your score updates as you check criteria.</div>
     <button class="btn" onclick="saveCase(${dur})">Save session ✓</button>
     <a class="btn ghost sm" href="${c.retryHash || ('#/case/'+c.id)}" onclick="setTimeout(()=>location.reload(),50)">Retry</a></div>`));
  const update = ()=>{ const checks=[...root.querySelectorAll('input[type=checkbox]')]; const n=checks.filter(x=>x.checked).length; const pct=Math.round(n/checks.length*100); $('#scorePreview').textContent=pct+'%'; $('#scorePreview').style.color = pct>=70?'var(--accent-bright)':pct>=45?'var(--amber)':'var(--muted)'; flow._score=pct; flow._checks=checks.map(x=>x.checked); };
  root.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change',update));
}
window.saveCase = (dur)=>{
  const c = flow.c;
  recordSession({ id:'s'+Date.now(), ts:new Date().toISOString(), type:c.sessionType||'case', moduleId:c.moduleId, caseId:c.id,
    title:`${c.company}: ${c.title}`, durationSec:dur, score: flow._score||0,
    rubricChecks: flow._checks||[], answers: flow.answers });
  toast('Session saved ✓ · streak '+STATE.streak.current);
  location.hash = c.sessionType==='guided' ? '#/bank' : '#/';
};

/* ---------------- QUESTION BANK (500 real interview questions) ---------------- */
const QB = window.COACH_QUESTIONS || { categories:[], byCategory:{} };
function qbCatById(id){ return QB.categories.find(c=>c.id===id); }
let bankState = { cat:'all', q:'' };
function companyOf(text){
  const m = String(text).match(/\b(Google|Facebook|Meta|Instagram|WhatsApp|Amazon|Uber|Lyft|Netflix|Apple|Microsoft|LinkedIn|Spotify|YouTube|Airbnb|Swiggy|Zomato|Flipkart|Paytm|PhonePe|Slack|Zoom|Reddit|Twitter|TikTok|Tesla|Walmart|Yelp|Dropbox|Redfin|Canva|Shopify|Visa|Ola)\b/);
  return m ? m[1] : null;
}
function renderBank(catId){
  if(catId && qbCatById(catId)) bankState.cat = catId;
  const wrap = el('<div></div>');
  wrap.appendChild(el(`<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px">
    <div style="font-size:22px;font-weight:700;letter-spacing:-.4px">📚 Question Bank</div>
    <span class="pill">500 real interview questions</span></div>`));
  wrap.appendChild(el(`<div class="card" style="color:var(--text-dim);font-size:13.5px;margin-top:10px">Pick any question and the coach walks you through the right framework <b style="color:var(--text)">one step at a time</b> — you answer (type or speak), then see exactly what a strong answer covers at that step. From the "600 Product Management Interview Questions" set.</div>`));

  // category tabs
  const tabs = el('<div class="chipset" style="margin:14px 0"></div>');
  const mkTab=(id,label,count)=>{ const b=el(`<span class="chip ${bankState.cat===id?'active':''}">${label}${count!=null?` · ${count}`:''}</span>`); b.onclick=()=>{ bankState.cat=id; drawBank(); document.querySelectorAll('#bankTabs .chip').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }; return b; };
  const total = Object.values(QB.byCategory).reduce((a,b)=>a+b.length,0);
  tabs.id='bankTabs';
  tabs.appendChild(mkTab('all','All',total));
  QB.categories.forEach(c=> tabs.appendChild(mkTab(c.id, `${c.icon} ${c.title}`, (QB.byCategory[c.id]||[]).length)));
  wrap.appendChild(tabs);

  // search
  const searchRow = el(`<div class="card" style="padding:10px 12px;margin-bottom:12px"><input id="bankSearch" placeholder="Search questions… (payments, Uber, drop, estimate, retention)" style="width:100%;background:var(--panel-2);border:1px solid var(--line-bright);color:var(--text);border-radius:9px;padding:10px 12px;font-size:13px;outline:none" value="${esc(bankState.q)}"></div>`);
  wrap.appendChild(searchRow);
  wrap.appendChild(el('<div id="bankCount" class="tag" style="color:var(--muted);font-size:12px;margin:0 2px 10px;display:block"></div>'));
  wrap.appendChild(el('<div id="bankList" class="grid" style="gap:9px"></div>'));

  setTimeout(()=>{ const s=$('#bankSearch'); if(s){ s.oninput=()=>{ bankState.q=s.value; drawBank(); }; } drawBank(); },0);
  return wrap;
}
function drawBank(){
  const list=$('#bankList'); if(!list) return;
  const q=(bankState.q||'').toLowerCase().trim();
  const cats = bankState.cat==='all' ? QB.categories.map(c=>c.id) : [bankState.cat];
  const rows=[];
  for(const cid of cats){
    const cat=qbCatById(cid);
    (QB.byCategory[cid]||[]).forEach((text,idx)=>{ if(!q || text.toLowerCase().includes(q)) rows.push({cid,idx,text,cat}); });
  }
  const shown=rows.slice(0,150);
  $('#bankCount').textContent = `${rows.length} question${rows.length===1?'':'s'}${q?' matching "'+bankState.q+'"':''}${rows.length>150?' — showing 150':''}`;
  list.innerHTML = shown.map(r=>{
    const co=companyOf(r.text);
    return `<div class="card" style="padding:13px 15px">
      <div style="display:flex;gap:12px;align-items:center">
        <span style="font-size:18px;flex:none">${r.cat.icon}</span>
        <div style="flex:1;min-width:0"><div style="font-size:13.5px;color:var(--text);line-height:1.5">${esc(r.text)}</div>
          <div class="chipset" style="margin-top:5px"><span class="pill" style="padding:2px 8px;font-size:10.5px">${esc(r.cat.title)}</span>${co?`<span class="pill" style="padding:2px 8px;font-size:10.5px;color:var(--muted)">${esc(co)}</span>`:''}</div></div>
        <div style="display:flex;flex-direction:column;gap:6px;flex:none;align-items:stretch">
          <button class="btn sm" onclick="location.hash='#/guided/${r.cid}:${r.idx}'">Practice →</button>
          <button class="btn sm ghost" onclick="bankAnswer(this,'${r.cid}',${r.idx})">💡 Complete answer</button>
        </div>
      </div>
      <div class="aipanel" id="bkans-${r.cid}-${r.idx}" style="display:none;margin-top:12px;border-top:1px solid var(--line-soft);padding-top:12px;font-size:13.5px;color:var(--text-dim);line-height:1.75"></div>
    </div>`;
  }).join('') || '<div class="card" style="text-align:center;color:var(--muted)">No questions match your search.</div>';
}

window.bankAnswer = (btn, cid, idx)=>{
  const panel = $('#bkans-'+cid+'-'+idx); if(!panel) return;
  if(panel.style.display!=='none'){ panel.style.display='none'; btn.textContent='💡 Complete answer'; return; }
  panel.style.display='block'; btn.textContent='▲ Hide answer';
  const cat = qbCatById(cid); const q = (QB.byCategory[cid]||[])[idx];
  CoachAI.runInto(panel, 'complete:'+cid+':'+idx, ()=>CoachAI.completeAnswerPrompts(q, cat));
};

/* ---------------- GUIDED PRACTICE (step-by-step, any bank question) ---------------- */
function renderGuided(arg){
  const [cid, idxStr] = String(arg||'').split(':');
  const cat = qbCatById(cid); const idx = +idxStr;
  const question = cat && QB.byCategory[cid] ? QB.byCategory[cid][idx] : null;
  if(!cat || question==null) return el('<div class="card">Question not found. <a href="#/bank">← Question Bank</a></div>');
  const module = moduleById(cat.moduleId);
  // synthesize a case from the category framework so we can reuse the flow engine
  const synth = {
    id: `guided-${cid}-${idx}`, sessionType:'guided', retryHash:`#/guided/${cid}:${idx}`,
    moduleId: cat.moduleId, title: question.length>70?question.slice(0,70)+'…':question, company: cat.title, difficulty:'Core',
    estMinutes: cat.framework.length*3, prompt: question, category: cat,
    stages: cat.framework.map(s=>({ ask: s.prompt, hint: s.name, modelPoints: [s.coaching, ...(s.tips||[])], pushback:null })),
    rubric: cat.framework.map(s=>s.name)
  };
  flow = { c: synth, stage:-1, started:Date.now(), answers:[] };
  const wrap = el('<div id="flowRoot"></div>');
  setTimeout(()=>renderGuidedIntro(), 0);
  return wrap;
}
function renderGuidedIntro(){
  const c = flow.c; const cat = c.category; const root = $('#flowRoot'); if(!root) return; root.innerHTML='';
  root.appendChild(el(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap"><a class="btn sm ghost" href="#/bank/${cat.id}">← Question Bank</a><span class="pill">${cat.icon} ${esc(cat.title)}</span><span class="pill" style="padding:3px 9px">${c.stages.length} steps</span></div>`));
  root.appendChild(el(`<div class="card" style="border-color:var(--line-bright)">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Interview question</div>
    <div style="font-size:18.5px;font-weight:650;margin:8px 0 4px;line-height:1.45">${esc(c.prompt)}</div>
    <button class="btn ghost sm" style="margin-top:6px" onclick="toggleRead(this)" data-q="${esc(c.prompt)}">🔊 Read aloud</button></div>`));
  // framework preview
  const fw = el(`<div class="card" style="margin-top:12px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">How to answer it — ${esc(cat.title)} framework</div></div>`);
  cat.framework.forEach((s,i)=> fw.appendChild(el(`<div style="display:flex;gap:11px;align-items:flex-start;margin:6px 0">
    <div style="flex:none;width:22px;height:22px;border-radius:6px;background:rgba(16,185,129,.12);color:var(--accent-bright);display:grid;place-items:center;font-size:11px;font-weight:700">${i+1}</div>
    <div style="font-size:13px"><b style="color:var(--text)">${esc(s.name)}</b> <span style="color:var(--muted)">— ${esc(s.prompt)}</span></div></div>`)));
  root.appendChild(fw);
  // worked example (collapsible)
  if(cat.example){
    root.appendChild(el(`<details class="card" style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--accent-bright)">💡 See a worked example (${esc(cat.example.question.slice(0,54))}…)</summary>
      <div style="margin-top:10px;font-size:12.5px;color:var(--text-dim);white-space:pre-wrap;line-height:1.7">${esc(cat.example.answer)}</div></details>`));
  }
  root.appendChild(el(`<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <button class="btn" onclick="nextStage()">▶ Start guided practice</button>
    <button class="btn ghost" onclick="aiCompleteFlow(this)">💡 Give me the complete answer</button>
    <span style="font-size:12px;color:var(--muted)">You'll answer each step (type or speak); after each, see what a strong answer covers.</span></div>`));
  root.appendChild(el('<div class="aipanel" id="aiFullPanel" style="display:none;margin-top:12px"></div>'));
  return root;
}

/* ---------------- shared answer box (type or speak) ---------------- */
function answerBox(kind){
  const box = el(`<div class="card" style="margin-top:14px">
     <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
       <span style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Your answer</span>
       <span style="flex:1"></span>
       <button class="btn sm ghost" id="micBtn" type="button">🎙️ Speak</button>
       <button class="btn sm ghost" type="button" onclick="document.getElementById('answerText').value=''">Clear</button>
     </div>
     <textarea id="answerText" placeholder="Type your answer here — or click 🎙️ Speak and talk. Structure it out loud like a real interview." style="width:100%;min-height:140px;background:var(--panel-2);border:1px solid var(--line-bright);border-radius:10px;color:var(--text);font:14px/1.6 Inter,sans-serif;padding:12px;resize:vertical;outline:none"></textarea>
     <div id="micStatus" style="font-size:11.5px;color:var(--muted);margin-top:6px">Tip: speaking your answer builds real interview fluency. Mic needs a Chrome/Edge browser + permission.</div>
   </div>`);
  setTimeout(()=>wireMic(), 0);
  return box;
}

/* ---------------- speech ---------------- */
let recog=null, recognizing=false;
function wireMic(){
  const btn = $('#micBtn'); if(!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ btn.disabled=true; btn.textContent='🎙️ n/a'; $('#micStatus').textContent='Speech input needs Chrome or Edge. You can still type.'; return; }
  btn.onclick = ()=>{
    if(recognizing){ stopSpeech(); return; }
    recog = new SR(); recog.lang='en-IN'; recog.continuous=true; recog.interimResults=true;
    const ta = $('#answerText'); let base = ta.value ? ta.value+' ' : '';
    recog.onresult = (e)=>{ let interim=''; let final='';
      for(let i=e.resultIndex;i<e.results.length;i++){ const r=e.results[i]; if(r.isFinal) final+=r[0].transcript+' '; else interim+=r[0].transcript; }
      if(final) base+=final;
      ta.value = base + interim;
    };
    recog.onerror = (e)=>{ $('#micStatus').textContent='Mic error: '+e.error+' — you can type instead.'; };
    recog.onend = ()=>{ recognizing=false; if(btn){btn.textContent='🎙️ Speak'; btn.classList.add('ghost');} };
    recog.start(); recognizing=true; btn.textContent='⏹ Stop'; btn.classList.remove('ghost');
    $('#micStatus').textContent='Listening… speak naturally, then click Stop.';
  };
}
function stopSpeech(){ try{ if(recog&&recognizing){recog.stop();} }catch{} recognizing=false; try{ window.speechSynthesis && speechSynthesis.cancel(); }catch{} resetTtsBtn(); }

/* ---- text-to-speech with a stop control (button toggles to Stop + floating Stop bar) ---- */
let ttsBtn = null;
function ttsBar(){
  let b = document.getElementById('ttsStop');
  if(!b){
    b = document.createElement('button'); b.id = 'ttsStop'; b.textContent = '⏹ Stop reading';
    b.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:90;background:var(--panel-elev);border:1px solid var(--red);color:var(--red);padding:10px 18px;border-radius:11px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none';
    b.onclick = ()=>{ try{ speechSynthesis.cancel(); }catch{} resetTtsBtn(); };
    document.body.appendChild(b);
  }
  return b;
}
function resetTtsBtn(){ if(ttsBtn){ try{ ttsBtn.textContent = ttsBtn.dataset.label || '🔊 Read aloud'; }catch{} ttsBtn = null; } const b=document.getElementById('ttsStop'); if(b) b.style.display='none'; }
function startSpeak(text, btn){
  if(!window.speechSynthesis) return;
  try{ speechSynthesis.cancel(); }catch{} resetTtsBtn();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-IN'; u.rate = 1;
  u.onend = u.onerror = ()=> resetTtsBtn();
  if(btn){ if(!btn.dataset.label) btn.dataset.label = btn.textContent; ttsBtn = btn; btn.textContent = '⏹ Stop'; }
  ttsBar().style.display = 'block';
  speechSynthesis.speak(u);
}
window.speak = (text)=>{ try{ startSpeak(text, null); }catch{} };
window.toggleRead = (btn)=>{
  try{
    if(ttsBtn === btn && window.speechSynthesis && speechSynthesis.speaking){ speechSynthesis.cancel(); resetTtsBtn(); return; }
    startSpeak(btn.dataset.q, btn);
  }catch{}
};

/* ---------------- timer ---------------- */
function startTimer(sel, from){
  const t = $(sel); if(!t) return;
  const tick=()=>{ if(!document.body.contains(t)) return clearInterval(id); const s=Math.floor((Date.now()-from)/1000); t.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
  const id=setInterval(tick,1000); tick();
}

/* ---------------- HISTORY ---------------- */
function renderHistory(){
  const wrap = el(`<div><h2 class="sec"><span class="bar"></span>Practice history <span class="tag">${STATE.sessions.length} sessions · streak ${STATE.streak.current} (best ${STATE.streak.longest})</span></h2></div>`);
  if(!STATE.sessions.length){ wrap.appendChild(el('<div class="card" style="color:var(--muted);text-align:center">No sessions yet.</div>')); return wrap; }
  const g = el('<div class="grid" style="gap:10px"></div>');
  STATE.sessions.slice(0,60).forEach(s=>{
    const m = moduleById(s.moduleId);
    g.appendChild(el(`<div class="card" style="padding:13px 16px;display:flex;gap:12px;align-items:center">
      <span style="font-size:20px">${m?m.icon:'📝'}</span>
      <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px">${esc(s.title)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${new Date(s.ts).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})} · ${s.type} · ${Math.round((s.durationSec||0)/60)}m</div></div>
      <div style="text-align:right"><div style="font-weight:750;color:${s.score>=70?'var(--accent-bright)':s.score>=45?'var(--amber)':'var(--muted)'}">${s.score}%</div></div></div>`));
  });
  wrap.appendChild(g);
  wrap.appendChild(el(`<div style="margin-top:16px"><button class="btn ghost sm" onclick="exportData()">⬇ Export progress (JSON)</button></div>`));
  return wrap;
}

/* ---------------- SETTINGS ---------------- */
function renderSettings(){
  const s = STATE.settings;
  const wrap = el(`<div><h2 class="sec"><span class="bar"></span>Settings</h2></div>`);
  wrap.appendChild(el(`<div class="card">
    <div style="font-weight:650;margin-bottom:4px">Practice preferences</div>
    ${toggleRow('readAloud','Read interviewer questions aloud', s.readAloud)}
    ${toggleRow('voiceInput','Enable microphone answer input by default', s.voiceInput)}
  </div>`));
  wrap.appendChild(el(`<div class="card" style="margin-top:14px">
    <div style="font-weight:650">🤖 AI Tutor — connect GPT-4o or Claude</div>
    <div style="font-size:12.5px;color:var(--muted);margin:6px 0 12px">Powers <b>"Evaluate & improve my answer"</b> and <b>"Give me the complete answer"</b> on every question. Bring your own key — it's stored <b>only in this browser</b> (localStorage) and sent directly to the provider, never to any server of ours. Without a key, the built-in model points + self-scoring still work.</div>
    <div style="display:grid;gap:10px">
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:5px">Provider</div>
        <select id="setProvider" style="width:100%;background:var(--panel-2);border:1px solid var(--line-bright);color:var(--text);border-radius:9px;padding:10px 11px;font-size:13px" onchange="document.getElementById('anthBlock').style.display=this.value==='anthropic'?'grid':'none';document.getElementById('oaiBlock').style.display=this.value==='openai'?'grid':'none'">
          <option value="anthropic" ${s.aiProvider!=='openai'?'selected':''}>Claude (Anthropic)</option>
          <option value="openai" ${s.aiProvider==='openai'?'selected':''}>GPT-4o (OpenAI)</option>
        </select>
      </div>
      <div id="anthBlock" style="display:${s.aiProvider!=='openai'?'grid':'none'};gap:8px">
        <input id="setApiKey" type="password" placeholder="sk-ant-…  (console.anthropic.com → API keys)" value="${esc(s.apiKey)}" autocomplete="off" style="background:var(--panel-2);border:1px solid var(--line-bright);color:var(--text);border-radius:9px;padding:10px 12px;font-size:13px">
        <select id="setModel" style="background:var(--panel-2);border:1px solid var(--line-bright);color:var(--text-dim);border-radius:9px;padding:9px 11px;font-size:13px">
          ${['claude-sonnet-5','claude-haiku-4-5-20251001','claude-opus-4-8'].map(mo=>`<option value="${mo}" ${s.aiModel===mo?'selected':''}>${mo}</option>`).join('')}
        </select>
      </div>
      <div id="oaiBlock" style="display:${s.aiProvider==='openai'?'grid':'none'};gap:8px">
        <input id="setOpenaiKey" type="password" placeholder="sk-…  (platform.openai.com → API keys)" value="${esc(s.openaiKey)}" autocomplete="off" style="background:var(--panel-2);border:1px solid var(--line-bright);color:var(--text);border-radius:9px;padding:10px 12px;font-size:13px">
        <select id="setOpenaiModel" style="background:var(--panel-2);border:1px solid var(--line-bright);color:var(--text-dim);border-radius:9px;padding:9px 11px;font-size:13px">
          ${['gpt-4o','gpt-4o-mini'].map(mo=>`<option value="${mo}" ${s.openaiModel===mo?'selected':''}>${mo}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn sm" onclick="saveSettings()">Save settings</button>
        <button class="btn ghost sm" onclick="testAI(this)">Test connection</button>
        <span id="aiTestResult" style="font-size:12px;color:var(--muted)"></span>
      </div>
    </div>
  </div>`));
  wrap.appendChild(el(`<div class="card" style="margin-top:14px">
    <div style="font-weight:650">Your data</div>
    <div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">All progress lives in this browser. Export to back up or move devices.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn ghost sm" onclick="exportData()">⬇ Export JSON</button>
      <label class="btn ghost sm" style="cursor:pointer">⬆ Import JSON<input type="file" accept="application/json" style="display:none" onchange="importData(event)"></label>
      <button class="btn ghost sm" style="color:var(--red);border-color:rgba(229,105,95,.3)" onclick="resetData()">Reset all progress</button>
    </div>
  </div>`));
  return wrap;
}
function toggleRow(key,label,val){
  return `<label style="display:flex;align-items:center;gap:11px;padding:8px 0;cursor:pointer"><input type="checkbox" data-setting="${key}" ${val?'checked':''} style="width:18px;height:18px;accent-color:var(--accent)"><span style="font-size:13.5px;color:var(--text-dim)">${esc(label)}</span></label>`;
}
window.saveSettings = ()=>{
  document.querySelectorAll('input[data-setting]').forEach(c=>{ STATE.settings[c.dataset.setting]=c.checked; });
  const k=$('#setApiKey'); if(k) STATE.settings.apiKey=k.value.trim();
  const m=$('#setModel'); if(m) STATE.settings.aiModel=m.value;
  const p=$('#setProvider'); if(p) STATE.settings.aiProvider=p.value;
  const ok=$('#setOpenaiKey'); if(ok) STATE.settings.openaiKey=ok.value.trim();
  const om=$('#setOpenaiModel'); if(om) STATE.settings.openaiModel=om.value;
  save(); toast('Settings saved ✓');
};
window.testAI = async (btn)=>{
  window.saveSettings();
  const out=$('#aiTestResult'); out.textContent='testing…'; btn.disabled=true;
  try{
    if(!CoachAI.configured()) throw new Error('no key entered');
    const r = await CoachAI.stream({ system:'Reply with exactly: OK', user:'ping', maxTokens:10 });
    out.textContent = r.trim().slice(0,40) ? `✓ connected (${CoachAI.model()})` : '✓ connected';
    out.style.color='var(--accent-bright)';
  }catch(e){ out.textContent='✗ '+(e.message==='NO_KEY'?'no key entered':e.message); out.style.color='var(--red)'; }
  btn.disabled=false;
};
window.exportData = ()=>{ const blob=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`pmcoach-progress-${todayKey()}.json`; a.click(); };
window.importData = (e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); STATE=Object.assign(loadState(),d); save(); toast('Imported ✓'); router(); }catch{ toast('Invalid file'); } }; r.readAsText(f); };
window.resetData = ()=>{ if(confirm('Erase all practice progress in this browser?')){ localStorage.removeItem(LS_KEY); STATE=loadState(); toast('Progress reset'); location.hash='#/'; router(); } };

/* ---------------- boot ---------------- */
if(!location.hash) location.hash='#/';
router();
