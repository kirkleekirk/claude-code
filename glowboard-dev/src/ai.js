/* AI */
// Card Wars opponent. Plans a whole turn with a time/node-boxed beam search over the engine,
// using only information its seat could know (Engine.redact). Personalities shift the weights.
var AI = (function (E) {
'use strict';

const PERSONALITIES = {
  balanced: { hp: 1.0, oppHp: 1.0, board: 1.0, card: 1.0, threat: 0.55 },
  aggro:    { hp: 0.8, oppHp: 1.45, board: 0.9, card: 0.8, threat: 0.45 },
  turtle:   { hp: 1.35, oppHp: 0.85, board: 1.1, card: 1.0, threat: 0.65 },
  tempo:    { hp: 1.0, oppHp: 1.15, board: 1.25, card: 0.85, threat: 0.55 },
  control:  { hp: 1.1, oppHp: 0.95, board: 1.15, card: 1.3, threat: 0.6 }
};
const DIFFICULTY = {
  easy:   { width: 2, depth: 3, ms: 14, nodes: 60, noise: 6, blunder: 0.22 },
  normal: { width: 4, depth: 6, ms: 40, nodes: 300, noise: 2.2, blunder: 0 },
  hard:   { width: 9, depth: 8, ms: 70, nodes: 1100, noise: 0, blunder: 0, horizon: 2 }
};
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function mkRng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ------------------------------------------------------------- evaluation
function creatureValue(st, side, lane) {
  const c = st.players[side].lanes[lane].creature, cd = E.CARDS[c.id], s = E.cStats(st, side, lane);
  const hp = Math.max(0, s.hp);
  let v = 1.2 + s.atk * 1.5 + hp * 0.75;
  const k = cd.kw;
  if (k.guard) v += 1;
  if (k.flying) v += s.atk * 0.45;
  if (k.ranged) v += 0.8;
  if (k.lifesteal) v += s.atk * 0.35;
  if (k.immortal) v += 2;
  if (k.ripen) v += (2 - (c.ripen || 0)) * 0.7;
  if (cd.floop) v += cd.r === 'L' ? 3.5 : 1.4;
  if (cd.r === 'L') v += 2;
  v += (c.shield || 0) * 0.6;
  if (c.burn) v -= Math.min(hp, c.burn * 1.2);
  if (c.rot) v -= Math.min(hp, 2.5);
  if (c.frozen) v -= s.atk * 0.9 + 0.5;
  if (c.stuck) v -= 0.3;
  if (k.collapse && st.players[side].lanes[lane].land.down) v -= s.atk;
  if (E.napping(st, side, lane)) v += 1.5;
  return v;
}
function buildingValue(st, side, lane) {
  const b = st.players[side].lanes[lane].building, cd = E.CARDS[b.id];
  if (b.hidden) return 3.5;
  return 2 + (cd.cost || 0) * 1.6 + Math.max(0, E.bDef(b) - b.dmg) * 0.35;
}
function hpCurve(h) { return h <= 0 ? -60 : h + (h < 8 ? (h - 8) * 0.7 : 0); }

function features(st, me, W) {
  const o = 1 - me, P = st.players[me], O = st.players[o];
  let v = W.hp * hpCurve(P.hp) - W.oppHp * 1.15 * hpCurve(O.hp);
  for (let l = 0; l < 4; l++) {
    if (P.lanes[l].creature) v += W.board * creatureValue(st, me, l);
    if (O.lanes[l].creature) v -= W.board * creatureValue(st, o, l);
    if (P.lanes[l].building) v += W.board * buildingValue(st, me, l);
    if (O.lanes[l].building) v -= W.board * buildingValue(st, o, l);
    if (P.lanes[l].land.down) v -= 1.4;
    if (O.lanes[l].land.down) v += 1.4;
  }
  v += W.card * 1.25 * Math.min(P.hand.length, 7) - 0.9 * Math.min(O.hand.length, 8);
  return v;
}

// Score a position right after our turn ended (opponent to act): blend the board now with the
// board after the opponent's creatures swing back at us.
function evaluate(st, me, W) {
  if (st.winner != null) return st.winner === me ? 100000 - st.turn * 10 : (st.winner === -1 ? -500 : -100000 + st.turn * 10);
  const base = features(st, me, W);
  const pv = E.previewFights(st);
  if (!pv.state) return base;
  if (pv.state.winner === 1 - me) return -60000;
  const threat = features(pv.state, me, W);
  let v = (1 - W.threat) * base + W.threat * threat;
  if (W.horizon > 1) {
    // Hard: also look at our swing back after their swing (board trades two exchanges deep)
    const s2 = E.clone(pv.state); s2.active = me; s2.turn += 1;
    for (let l = 0; l < 4; l++) { const c = s2.players[me].lanes[l].creature; if (c) { c.flooped = false; } }
    const pv2 = E.previewFights(s2);
    if (pv2.state) { if (pv2.state.winner === me) v += 400; v = 0.7 * v + 0.3 * features(pv2.state, me, W); }
  }
  return v;
}

// ------------------------------------------------------------- search
function prune(st, me, acts) {
  const P = st.players[me];
  const empty = [], bempty = [];
  for (let l = 0; l < 4; l++) { if (!P.lanes[l].creature) empty.push(l); if (!P.lanes[l].building) bempty.push(l); }
  return acts.filter(a => {
    if (a.t === 'end') return false;
    if (a.t === 'play' && a.lane != null) {
      const cd = E.CARDS[P.hand.find(c => c.uid === a.uid).id];
      if (cd.type === 'creature' && P.lanes[a.lane].creature && empty.length) return false;
      if (cd.type === 'building' && P.lanes[a.lane].building && bempty.length) return false;
    }
    return true;
  });
}

function resolvePending(st, me) {
  let guard = 0;
  while (st.pending && st.pending.side === me && guard++ < 4) {
    const uid = chooseSteal(st, me);
    const r = E.apply(st, { t: 'choose', p: me, uid }, { inPlace: true });
    if (r.error) break;
  }
  return st;
}
function chooseSteal(st, me) {
  const pd = st.pending; if (!pd) return null;
  const O = st.players[pd.from];
  let best = null, bv = -1;
  for (const uid of pd.options) { const c = O.hand.find(x => x.uid === uid); if (!c) continue; const cd = E.CARDS[c.id]; const v = (cd.cost || 0) * 2 + (cd.r === 'E' ? 3 : cd.r === 'R' ? 1 : 0) + (E.meetsReq(st, me, cd) ? 2 : 0); if (v > bv) { bv = v; best = uid; } }
  return best;
}

function leafScore(st, me, W, rng, noise) {
  const r = E.apply(st, { t: 'end', p: me });
  let s = r.error ? -1e6 : evaluate(r.state, me, W);
  if (noise) s += (rng() - 0.5) * noise * 2;
  return s;
}

function planTurn(state, me, opts) {
  opts = opts || {};
  const D = Object.assign({}, DIFFICULTY[opts.difficulty || 'normal'], opts.tune || {});
  const W = Object.assign({}, PERSONALITIES[opts.personality || 'balanced'], { horizon: D.horizon || 1 });
  const rng = mkRng(opts.seed != null ? opts.seed : (state.rng ^ (state.turn * 2654435761)));
  const useTime = opts.useTime !== false && !opts.nodeBudgetOnly;
  const t0 = now();
  let nodes = 0;
  const root = resolvePending(E.redact(state, me), me);
  if (root.active !== me || root.winner != null) return [];
  const rootScore = leafScore(root, me, W, rng, D.noise);
  let best = { seq: [], score: rootScore };
  let beam = [{ st: root, seq: [], score: rootScore }];
  const out = () => (useTime && now() - t0 > D.ms) || nodes >= D.nodes;
  for (let depth = 0; depth < D.depth && beam.length && !out(); depth++) {
    const cand = [];
    for (const node of beam) {
      const acts = prune(node.st, me, E.legalActions(node.st, me));
      for (const a of acts) {
        if (out()) break;
        const r = E.apply(node.st, a);
        if (r.error) continue;
        nodes++;
        const st2 = resolvePending(r.state, me);
        const child = { st: st2, seq: node.seq.concat([a]), score: leafScore(st2, me, W, rng, D.noise) };
        // drawing reveals nothing to the search (the card is '?'), so stop expanding after a draw
        child.terminal = a.t === 'draw' || st2.winner != null;
        cand.push(child);
        if (child.score > best.score + 1e-6) best = child;
      }
      if (out()) break;
    }
    cand.sort((x, y) => y.score - x.score);
    beam = [];
    const seen = {};
    for (const c of cand) {
      if (beam.length >= D.width) break;
      if (c.terminal) continue;
      const key = c.seq.map(a => a.t + (a.uid || '') + ':' + (a.lane != null ? a.lane : '') + ':' + (a.from != null ? a.from + '>' + a.to : '')).sort().join('|');
      if (seen[key]) continue; seen[key] = 1;
      beam.push(c);
    }
  }
  let seq = best.seq;
  // Easy opponents sometimes fumble: swap in a random legal play.
  if (D.blunder && rng() < D.blunder) {
    const acts = prune(root, me, E.legalActions(root, me));
    if (acts.length) seq = [acts[Math.floor(rng() * acts.length)]];
  }
  return seq;
}

function mulligan(state, me) {
  const P = state.players[me];
  let creatures = 0, playable = 0;
  const lands = {};
  for (const L of P.lanes) lands[L.land.type] = (lands[L.land.type] || 0) + 1;
  for (const c of P.hand) {
    const cd = E.CARDS[c.id];
    if (cd.type === 'creature') creatures++;
    if (cd.land === 'rainbow' || (lands[cd.land] || 0) >= cd.req) if (cd.cost <= 1) playable++;
  }
  return creatures < 2 || playable < 2;
}

// Next command for seat `me` (handles mulligan, pending choices and planning).
function decide(state, me, opts) {
  if (state.winner != null) return null;
  if (state.pending && state.pending.side === me) return { t: 'choose', p: me, uid: chooseSteal(state, me) };
  if (state.phase === 'mulligan') return state.players[me].mulled == null ? { t: 'mulligan', p: me, redraw: mulligan(state, me) } : null;
  if (state.active !== me) return null;
  const seq = planTurn(state, me, opts);
  return seq.length ? seq[0] : { t: 'end', p: me };
}

// Runs a whole AI turn headlessly, re-planning whenever new information appears. Returns all events.
function playTurn(state, me, opts, onCmd) {
  let st = state, guard = 0, plan = [], events = [];
  while (st.winner == null && st.active === me && st.phase === 'main' && guard++ < 40) {
    if (st.pending && st.pending.side === me) {
      const r = E.apply(st, { t: 'choose', p: me, uid: chooseSteal(st, me) });
      st = r.state; events = events.concat(r.events); if (onCmd) onCmd(r); continue;
    }
    if (!plan.length) { plan = planTurn(st, me, opts); if (!plan.length) plan = [{ t: 'end', p: me }]; }
    const cmd = plan.shift();
    const r = E.apply(st, cmd);
    if (r.error) { plan = []; if (cmd.t === 'end') break; continue; }
    st = r.state; events = events.concat(r.events); if (onCmd) onCmd(r, cmd);
    if (cmd.t === 'end') break;
    if (r.events.some(e => e.rng || e.t === 'draw' || e.t === 'trap' || e.t === 'reveal')) plan = [];
    if (!plan.length && st.active === me && st.winner == null) plan = [];
  }
  if (st.active === me && st.winner == null && st.phase === 'main') { const r = E.apply(st, { t: 'end', p: me }); st = r.state; events = events.concat(r.events); }
  return { state: st, events };
}

return { PERSONALITIES, DIFFICULTY, planTurn, decide, playTurn, mulligan, chooseSteal, evaluate, features };
})(Engine);
/* END AI */
