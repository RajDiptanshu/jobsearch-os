// Rebuilds a local read-only snapshot; never changes the original coach or its data.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const project = path.resolve(__dirname, '..'), repo = path.resolve(project, '../..');
function load(file, key) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  const box = vm.createContext({window: {}}, {codeGeneration: {strings: false, wasm: false}});
  vm.runInContext(source, box, {timeout: 1000, filename: file});
  return {data: box.window[key], source: {path: file, sha256: crypto.createHash('sha256').update(source).digest('hex')}};
}
const questions = load('public/coach/questions.js', 'COACH_QUESTIONS');
const cases = load('public/coach/data.js', 'COACH_DATA');
const entries = Object.entries(questions.data.byCategory).flatMap(([category, list]) =>
  list.map((question, index) => ({id: `${category}-${index+1}`, category, question})));
const corpus = {
  version: 1,
  provenance: 'Practice prompts copied from this repository. Reported interview/company attributions have not been independently verified. Case numbers are hypothetical premises, not career evidence or market data.',
  sources: [questions.source, cases.source],
  questions: entries,
  cases: cases.data.cases.map(c => ({id: c.id, title: c.title, question: c.prompt, category: ({'flipkart-bigbasket':'design','meesho-crisis':'problem','genai-trust':'problem'})[c.id] || ({'india-cases':'problem','product-sense':'design','fraud-payments':'strategy','ai-pm':'technical','rca':'problem','metrics':'estimation','system-design':'technical'})[c.moduleId] || c.moduleId,
    stages: c.stages.map(s => ({question: s.ask, considerations: s.modelPoints || [], pushback: s.pushback || ''})), rubric: c.rubric || []}))
};
fs.mkdirSync(path.join(project, 'knowledge'), {recursive:true});
fs.writeFileSync(path.join(project, 'knowledge/pm-question-bank.json'), JSON.stringify(corpus,null,2)+'\n');
const skillbook=JSON.parse(fs.readFileSync(path.join(project,'knowledge/pm-skills.json'),'utf8'));
const manual=['# PM answer skills','',skillbook.principle,'',`The app retrieves relevant material from ${entries.length} practice entries, ${corpus.cases.length} worked cases and private preparation notes. It does not train or fine-tune a model. Company attributions in the original bank are unverified. Examples below are hypothetical, not personal career claims.`, '', 'Write an actual answer, rather than a recital of these checklists. Start with a decision or a consequential, specific question. Each technical detail should explain how a user/business failure is prevented. Keep references, uncertainty and preparation gaps outside the spoken answer.'];
for(const s of skillbook.skills)manual.push('',`## ${s.title}`,'',...s.moves.map(m=>'- '+m),'','### Spoken example','',s.voiceExample,'','### Worked reasoning','',s.workedExample,'','### Avoid','',...s.traps.map(t=>'- '+t),'','### Likely probes','',...s.probes.map(p=>'- '+p));
fs.writeFileSync(path.join(project,'knowledge/PM-ANSWER-SKILLS.md'),manual.join('\n')+'\n');
console.log(JSON.stringify({questions: entries.length, categories: Object.keys(questions.data.byCategory).length, workedCases: corpus.cases.length}));
