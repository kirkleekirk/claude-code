// Checks that AI difficulties are ordered: hard beats normal, normal beats easy (random decks, both seats).
// node test/difficulty.js [games=300]
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

if (!isMainThread) {
  const { Engine: E, AI } = require(path.join(__dirname, 'load.js'))({ from: workerData.from });
  const F = Object.keys(E.STARTERS);
  const out = [];
  for (const job of workerData.jobs) {
    const [da, db] = job.pair;
    const fa = F[job.i % F.length], fb = F[(job.i * 7 + 3) % F.length];
    const st0 = E.newGame({ seed: 'diff' + job.i, first: job.i % 2, players: [{ deck: E.STARTERS[fa] }, { deck: E.STARTERS[fb] }] }).state;
    const seed = E.hashSeed('d' + job.i);
    const st = AI.playGame(st0, { difficulty: da, useTime: false, seed }, { difficulty: db, useTime: false, seed: seed + 1 }, 4000);
    out.push({ pair: job.pair.join('>'), aWon: st.winner === 0 ? 1 : st.winner === 1 ? 0 : 0.5 });
  }
  parentPort.postMessage(out);
} else {
  const n = +(process.argv[2] || 300);
  const pairs = [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']];
  const jobs = [];
  for (const pair of pairs) for (let i = 0; i < n; i++) jobs.push({ pair, i });
  const W = 4, chunks = Array.from({ length: W }, () => []);
  jobs.forEach((j, k) => chunks[k % W].push(j));
  let res = [], done = 0;
  const t0 = Date.now();
  for (const ch of chunks) {
    const w = new Worker(__filename, { workerData: { jobs: ch, from: process.env.FROM } });
    w.on('message', m => { res = res.concat(m); if (++done === W) {
      for (const p of pairs) { const k = p.join('>'), r = res.filter(x => x.pair === k); console.log(k.padEnd(14) + (100 * r.reduce((a, x) => a + x.aWon, 0) / r.length).toFixed(1) + '% for ' + p[0] + ' (' + r.length + ' games)'); }
      console.log('secs', ((Date.now() - t0) / 1000).toFixed(0));
    } });
    w.on('error', e => { console.error(e); process.exit(1); });
  }
}
