// One-off/maintenance: probe every watchlist board, report health, disable dead boards with --apply
'use strict';
const { loadJson, saveJson, fetchJson } = require('./lib');

const URLS = {
  greenhouse: t => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`,
  lever: t => `https://api.lever.co/v0/postings/${t}?mode=json&limit=1`,
  ashby: t => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`
};

(async () => {
  const apply = process.argv.includes('--apply');
  const wl = loadJson('watchlist.json', { boards: [] });
  const results = [];
  const CONC = 10; let i = 0;
  async function worker() {
    while (i < wl.boards.length) {
      const b = wl.boards[i++];
      try {
        const data = await fetchJson(URLS[b.ats](b.token), {}, 12000);
        const count = Array.isArray(data) ? data.length : (data.jobs || []).length;
        results.push({ ...b, ok: true, count });
      } catch (e) {
        results.push({ ...b, ok: false, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.ats.padEnd(10)} ${r.token.padEnd(35)} ${r.ok ? r.count + ' postings' : r.error}`);
  const okCount = results.filter(r => r.ok).length;
  console.log(`\n${okCount}/${results.length} boards live`);
  if (apply) {
    wl.boards = wl.boards.map(b => {
      const r = results.find(x => x.token === b.token && x.ats === b.ats);
      return { ...b, enabled: r ? r.ok : b.enabled, last_probe: new Date().toISOString(), last_probe_ok: r ? r.ok : null };
    });
    saveJson('watchlist.json', wl);
    console.log('watchlist.json updated (dead boards disabled)');
  }
})();
