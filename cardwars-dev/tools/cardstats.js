// Per-card impact: for every card, how often the side that played it went on to win.
// node tools/cardstats.js [--games 40] [--nodes 100] [--only corn,blue]
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
if (!isMainThread) {
  const { Engine: E, AI } = require(path.join(__dirname, '..', 'test', 'load.js'))({ from: 'src' });
  const out = [];
  for (const job of workerData.jobs) {
    let st = E.newGame({ seed: job.seed, first: job.first, players: [{ deck: E.STARTERS[job.a] }, { deck: E.STARTERS[job.b] }] }).state;
    const ctx = [{}, {}], played = [{}, {}];
    let guard = 0;
    while (st.winner == null && guard++ < 4000) {
      const p = AI.actor(st);
      let cmd = AI.decide(st, p, { difficulty: 'normal', useTime: false, tune: { nodes: workerData.nodes }, seed: guard * 31 + 7 }, ctx[p]);
      if (!cmd) break;
      let r = E.apply(st, cmd);
      if (r.error) { r = E.apply(st, st.phase === 'setup' ? { t: 'ready', p } : (st.pending && st.pending.kind === 'defend' ? { t: 'defend', p } : { t: 'battle', p })); if (r.error) break; ctx[p].plan = null; }
      for (const e of r.events) {
        if (e.t === 'summon' && !e.token && e.how !== 'raise') played[e.side][e.id] = 1;
        if (e.t === 'build' && !e.twin) played[e.side][e.id] = 1;
        if (e.t === 'cast') played[e.side][e.id] = 1;
        if (e.t === 'floop') played[e.side]['floop:' + e.id] = 1;
        if (e.t === 'block') played[e.side]['block'] = 1;
      }
      AI.observe(ctx[p], r.events);
      st = r.state;
    }
    out.push({ a: job.a, b: job.b, winner: st.winner, played, rounds: st.round });
  }
  parentPort.postMessage(out);
} else {
  const games = +arg('games', 40), nodes = +arg('nodes', 100);
  const { Engine: E } = require(path.join(__dirname, '..', 'test', 'load.js'))({ from: 'src' });
  let F = Object.keys(E.STARTERS); const only = arg('only', null); if (only) F = only.split(',');
  const jobs = []; let n = 0;
  for (let i = 0; i < F.length; i++) for (let j = 0; j < F.length; j++) if (i !== j) for (let g = 0; g < games / 2; g++) jobs.push({ a: F[i], b: F[j], first: g % 2, seed: 'cs-' + (n++) });
  const W = 4, chunks = Array.from({ length: W }, () => []); jobs.forEach((j, i) => chunks[i % W].push(j));
  let res = [], done = 0;
  for (const ch of chunks) { const w = new Worker(__filename, { workerData: { jobs: ch, nodes } }); w.on('message', m => { res = res.concat(m); if (++done === W) report(res); }); w.on('error', e => { console.error(e); process.exit(1); }); }
  function report(R) {
    const st = {};
    for (const r of R) for (const s of [0, 1]) for (const id in r.played[s]) {
      const k = id; st[k] = st[k] || { n: 0, w: 0, decks: {} };
      st[k].n++; if (r.winner === s) st[k].w++;
      const deck = s === 0 ? r.a : r.b; st[k].decks[deck] = 1;
    }
    const rows = Object.keys(st).map(k => ({ k, n: st[k].n, wr: st[k].w / st[k].n, decks: Object.keys(st[k].decks).join(',') })).sort((a, b) => b.wr - a.wr);
    for (const r of rows) console.log((100 * r.wr).toFixed(0).padStart(4) + '%  ' + String(r.n).padStart(4) + '  ' + r.k.padEnd(22) + ' ' + r.decks);
    console.log('games', R.length, 'avg rounds', (R.reduce((a, r) => a + r.rounds, 0) / R.length).toFixed(1));
  }
}
