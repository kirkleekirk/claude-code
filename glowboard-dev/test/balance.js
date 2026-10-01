// Headless AI-vs-AI balance harness. Every faction pairing, both seats, many games, 4 worker threads.
// node test/balance.js [--games 200] [--mirror 100] [--nodes 160] [--from src] [--diff normal] [--only corn,blue] [--json out.json]
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const path = require('path');
const fs = require('fs');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }

function playGame(E, AI, d0, d1, seed, first, opts) {
  let st = E.newGame({ seed, first, players: [{ deck: d0 }, { deck: d1 }] }).state;
  for (const p of [0, 1]) st = E.apply(st, AI.decide(st, p, opts)).state;
  let guard = 0;
  while (st.winner == null && guard++ < 200) {
    const me = st.active;
    st = AI.playTurn(st, me, Object.assign({}, opts, { seed: (E.hashSeed(seed) + st.turn * 7919) >>> 0 })).state;
  }
  return { winner: st.winner, rounds: st.round, first: st.first, hp: [st.players[0].hp, st.players[1].hp], reason: st.reason };
}

if (!isMainThread) {
  const { Engine: E, AI } = require(path.join(__dirname, 'load.js'))({ from: workerData.from });
  const res = [];
  for (const job of workerData.jobs) {
    const d0 = E.STARTERS[job.a], d1 = E.STARTERS[job.b];
    const opts = { difficulty: workerData.diff, useTime: false, tune: { nodes: workerData.nodes } };
    const g = playGame(E, AI, d0, d1, job.seed, job.first, opts);
    res.push(Object.assign({ a: job.a, b: job.b }, g));
    if (res.length % 20 === 0) parentPort.postMessage({ progress: 20 });
  }
  parentPort.postMessage({ done: res });
} else {
  const games = +arg('games', 200), mirror = +arg('mirror', 100), nodes = +arg('nodes', 160);
  const from = arg('from', undefined), diff = arg('diff', 'normal');
  const only = arg('only', null);
  const { Engine: E } = require('./load')({ from });
  let F = Object.keys(E.STARTERS);
  if (only) F = only.split(',');
  const jobs = [];
  let n = 0;
  for (let i = 0; i < F.length; i++) for (let j = i; j < F.length; j++) {
    const count = i === j ? mirror : games;
    for (let g = 0; g < count; g++) jobs.push({ a: F[i], b: F[j], first: g % 2, seed: 'bal-' + F[i] + '-' + F[j] + '-' + g + '-' + (n++) });
  }
  const W = Math.max(1, Math.min(os.cpus().length, 4));
  const chunks = Array.from({ length: W }, () => []);
  jobs.forEach((j, i) => chunks[i % W].push(j));
  const t0 = Date.now();
  let doneCount = 0, results = [], finished = 0;
  for (const ch of chunks) {
    const w = new Worker(__filename, { workerData: { jobs: ch, from, nodes, diff } });
    w.on('message', m => {
      if (m.progress) { doneCount += m.progress; if (doneCount % 200 === 0) process.stderr.write('  ' + doneCount + '/' + jobs.length + ' games, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's\n'); }
      if (m.done) { results = results.concat(m.done); if (++finished === W) report(results); }
    });
    w.on('error', e => { console.error(e); process.exit(1); });
  }
  function report(R) {
    const fac = {}; F.forEach(f => (fac[f] = { w: 0, g: 0 }));
    const pair = {};
    let firstWins = 0, decided = 0, rounds = 0, stale = 0, ot = 0;
    for (const r of R) {
      rounds += r.rounds;
      if (r.winner === -1 || r.reason === 'rounds') stale++;
      if (r.rounds >= E.OVERTIME) ot++;
      if (r.winner === 0 || r.winner === 1) { decided++; if (r.winner === r.first) firstWins++; }
      if (r.a === r.b) continue;
      const wa = r.winner === 0 ? 1 : r.winner === 1 ? 0 : 0.5;
      fac[r.a].g++; fac[r.b].g++; fac[r.a].w += wa; fac[r.b].w += 1 - wa;
      const k = r.a + ' vs ' + r.b; pair[k] = pair[k] || { w: 0, g: 0 }; pair[k].g++; pair[k].w += wa;
    }
    const out = { games: R.length, secs: (Date.now() - t0) / 1000, firstPlayer: firstWins / Math.max(1, decided), avgRounds: rounds / R.length, stalemates: stale / R.length, overtime: ot / R.length, factions: {}, pairs: {} };
    console.log('\nFaction win rates (non-mirror):');
    for (const f of F) { const x = fac[f]; out.factions[f] = x.w / Math.max(1, x.g); console.log('  ' + f.padEnd(6) + ' ' + (100 * out.factions[f]).toFixed(1).padStart(5) + '%  (' + x.g + ' games)'); }
    console.log('\nPairings (row faction win %):');
    for (const k in pair) { out.pairs[k] = pair[k].w / pair[k].g; console.log('  ' + k.padEnd(16) + (100 * out.pairs[k]).toFixed(1).padStart(6) + '%'); }
    console.log('\nFirst player wins: ' + (100 * out.firstPlayer).toFixed(1) + '%   Avg rounds: ' + out.avgRounds.toFixed(2) + '   Stalemates: ' + (100 * out.stalemates).toFixed(2) + '%   Reached overtime: ' + (100 * out.overtime).toFixed(1) + '%');
    console.log('Games: ' + R.length + ' in ' + out.secs.toFixed(0) + 's');
    const j = arg('json', null); if (j) fs.writeFileSync(j, JSON.stringify(out, null, 2));
  }
}
