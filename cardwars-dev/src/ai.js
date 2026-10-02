/* AI */
// Card Wars opponent. Plans a whole turn with a time/node-boxed beam search over the engine, using only what
// its seat could know (Engine.redact). It predicts the defender's response ("what'll you use to defend?")
// and the enemy's swing back. Personalities shift the weights; difficulties set search size and mistakes.
var AI = (function (E) {
'use strict';

const PERSONALITIES = {
  balanced: { safe: 1.0, kill: 1.0, board: 1.0, card: 1.0, threat: 0.5 },
  aggro:    { safe: 0.8, kill: 1.4, board: 0.95, card: 0.8, threat: 0.4 },
  turtle:   { safe: 1.35, kill: 0.85, board: 1.1, card: 1.0, threat: 0.6 },
  tempo:    { safe: 1.0, kill: 1.15, board: 1.2, card: 0.85, threat: 0.5 },
  control:  { safe: 1.1, kill: 0.95, board: 1.15, card: 1.3, threat: 0.55 }
};
const DIFFICULTY = {
  easy:   { width: 2, depth: 4, ms: 14, nodes: 60, noise: 6, blunder: 0.22, defend: 0.5 },
  normal: { width: 3, depth: 6, ms: 30, nodes: 160, noise: 4.0, blunder: 0.05, defend: 1 },
  hard:   { width: 6, depth: 8, ms: 60, nodes: 600, noise: 0, blunder: 0, defend: 1, horizon: 2 }
};
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
function mkRng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ------------------------------------------------------------- evaluation
function creatureValue(st, side, lane) {
  const c = st.players[side].lanes[lane].creature, cd = E.CARDS[c.id], s = E.cStats(st, side, lane);
  const hp = Math.max(0, s.hp), k = cd.kw;
  let v = 2 + s.atk * 1.35 + hp * 0.8;
  if (k.guard) v += 1;
  if (k.flying) v += 1 + s.atk * 0.3;
  if (k.ranged) v += 0.8;
  if (k.vamp) v += 0.8;
  if (k.cool) v += 2;
  if (k.rally) v += 1.2;
  if (k.immortal) v += 2;
  if (k.ripen) v += (1 - (c.ripen || 0)) * 0.8;
  if (k.pigNap) v += 1.5;
  if (k.scholar) v += 1.2 + (c.study > 0 ? 3 : 0);
  if (cd.floop) v += cd.r === 'L' ? 3 : 1.3;
  if (cd.r === 'L') v += 1.5;
  v += (c.shield || 0) * 0.6;
  if (c.burn) v -= Math.min(hp, c.burn * 1.2);
  if (c.rot) v -= Math.min(hp, 2.5);
  if (c.frozen) v -= s.atk * 0.9 + 0.5;
  if (c.stuck) v -= 0.3;
  if (c.nap || c.inside) v += 1.5;
  return v;
}
function buildingValue(st, side, lane) {
  const b = st.players[side].lanes[lane].building, cd = E.CARDS[b.id];
  if (b.hidden) return 3.5;
  return 2.5 + (cd.cost || 0) * 1.4 + Math.max(0, E.bDef(b) - b.dmg) * 0.3 + (cd.kw.spirit ? 2 : 0) + (cd.kw.school ? 1 : 0);
}
// Kingdom safety: a small kingdom is one bad battle away from "That's the game".
function safety(k) { return k <= 0 ? -80 : -14 / (k + 0.6); }

function features(st, me, W) {
  const o = 1 - me, P = st.players[me], O = st.players[o];
  let v = 0;
  for (let l = 0; l < 4; l++) {
    if (P.lanes[l].creature) v += W.board * creatureValue(st, me, l);
    if (O.lanes[l].creature) v -= W.board * creatureValue(st, o, l);
    if (P.lanes[l].building) v += W.board * buildingValue(st, me, l);
    if (O.lanes[l].building) v -= W.board * buildingValue(st, o, l);
    if (P.lanes[l].land.down) v -= 1.3;
    if (O.lanes[l].land.down) v += 1.3;
  }
  v += W.safe * 2.2 * safety(E.kingdomSize(st, me)) - W.kill * 2.2 * safety(E.kingdomSize(st, o));
  v += W.card * 1.2 * Math.min(P.hand.length, 7) - 0.9 * Math.min(O.hand.length, 8);
  v += 0.25 * Math.min(P.deck.length, 6) - 0.2 * Math.min(O.deck.length, 6);
  return v;
}

// Score a position right after our turn ended: blend the board now with the board after the enemy swings back.
function evaluate(st, me, W) {
  if (st.winner != null) return st.winner === me ? 100000 - st.turn * 10 : (st.winner === -1 ? -400 : -100000 + st.turn * 10);
  const base = features(st, me, W);
  const pv = E.previewThreat(st, 1 - me);
  if (E.kingdomSize(pv.state, me) === 0) return -50000 + base;
  let v = (1 - W.threat) * base + W.threat * features(pv.state, me, W);
  if (W.horizon > 1) {
    const pv2 = E.previewThreat(pv.state, me);
    if (E.kingdomSize(pv2.state, 1 - me) === 0) v += 250;
    v = 0.7 * v + 0.3 * features(pv2.state, me, W);
  }
  return v;
}

// ------------------------------------------------------------- defending ("So, what'll you use to defend?")
function afterDefense(st, me, W) {
  if (st.winner != null) return st.winner === me ? 100000 : (st.winner === -1 ? -400 : -100000);
  return features(st, me, W);
}
// Greedy: keep adding the floop or block that most improves the position after the battle resolves.
function defendPlan(st, me, W, maxSteps) {
  let cur = st; const cmds = [];
  for (let i = 0; i < (maxSteps || 4); i++) {
    const r0 = E.apply(cur, { t: 'defend', p: me });
    let bestV = r0.error ? -1e9 : afterDefense(r0.state, me, W), best = null;
    for (const o of E.defenseOptions(cur, me)) {
      const r = E.apply(cur, o); if (r.error) continue;
      const r2 = E.apply(r.state, { t: 'defend', p: me }); if (r2.error) continue;
      const v = afterDefense(r2.state, me, W);
      if (v > bestV + 0.4) { bestV = v; best = { o, st: r.state }; }
    }
    if (!best) break;
    cmds.push(best.o); cur = best.st;
  }
  return cmds;
}

// ------------------------------------------------------------- search
function prune(st, me, acts) {
  const P = st.players[me];
  let empty = 0, bempty = 0;
  for (let l = 0; l < 4; l++) { if (!P.lanes[l].creature) empty++; if (!P.lanes[l].building) bempty++; }
  return acts.filter(a => {
    if (a.t === 'battle' || a.t === 'ready') return false;
    if (a.t === 'play' && a.lane != null) {
      const cd = E.CARDS[P.hand.find(c => c.uid === a.uid).id];
      if (cd.type === 'creature' && P.lanes[a.lane].creature && empty) return false;
      if (cd.type === 'building' && P.lanes[a.lane].building && bempty) return false;
    }
    return true;
  });
}

function resolvePending(st, me, W) {
  let guard = 0;
  while (st.pending && st.pending.side === me && guard++ < 4) {
    const pd = st.pending;
    let cmd;
    if (pd.kind === 'steal') cmd = { t: 'choose', p: me, uid: chooseSteal(st, me) };
    else if (pd.kind === 'discard') cmd = { t: 'discard', p: me, uid: chooseDiscard(st, me) };
    else break;
    const r = E.apply(st, cmd, { inPlace: true });
    if (r.error) break;
  }
  return st;
}

// Value of a card in hand for player p (used to discard, to steal and to judge hands).
function cardValue(st, p, id, dupe) {
  const cd = E.CARDS[id]; if (!cd || cd.type === 'unknown') return 0;
  let v = (cd.cost || 0) * 1.2 + ({ C: 0, R: 0.7, E: 1.3, L: 2.2 }[cd.r] || 0);
  if (cd.type === 'creature') v += 1.2 + (cd.atk || 0) * 0.3 + (cd.def || 0) * 0.15;
  if (cd.type === 'building') v += 0.6;
  if (!E.meetsReq(st, p, cd)) {
    // can the landscapes come back? (Reclaim, Plant Corn) - otherwise it's dead weight
    v -= 2;
  }
  if (cd.kw.hides) { let ok = false; for (const L of st.players[p].lanes) if (L.land.orig === cd.kw.hides) ok = true; if (!ok) v -= 4; }
  if (id === 'r_reclaim') { let down = 0; for (const L of st.players[p].lanes) if (L.land.down) down++; v += down ? 2 + down : -1.5; }
  if (dupe) v -= 0.6;
  return v;
}
function chooseDiscard(st, me) {
  const P = st.players[me]; let best = null, bv = 1e9; const seen = {};
  for (const c of P.hand) { const v = cardValue(st, me, c.id, seen[c.id]); seen[c.id] = 1; if (v < bv) { bv = v; best = c.uid; } }
  return best;
}
function chooseSteal(st, me) {
  const pd = st.pending; if (!pd) return null;
  const O = st.players[pd.from];
  let best = null, bv = -1e9;
  for (const uid of pd.options) { const c = O.hand.find(x => x.uid === uid); if (!c) continue; const v = cardValue(st, me, c.id) + 0.5 * cardValue(st, pd.from, c.id); if (v > bv) { bv = v; best = uid; } }
  return best;
}

function leafScore(st, me, W, rng, noise) {
  let r = E.apply(st, { t: 'battle', p: me });
  if (r.error) return -1e6;
  let s2 = r.state;
  if (s2.pending && s2.pending.kind === 'defend' && s2.pending.side === 1 - me) {
    // the defender answers with its best single floop or block (public information only)
    const plan = defendPlan(s2, 1 - me, PERSONALITIES.balanced, 1);
    for (const c of plan) { const x = E.apply(s2, c); if (!x.error) s2 = x.state; }
    const x = E.apply(s2, { t: 'defend', p: 1 - me }); if (x.error) return -1e6;
    s2 = x.state;
  }
  let s = evaluate(s2, me, W);
  if (noise) s += (rng() - 0.5) * noise * 2;
  return s;
}

function actKey(a) { return a.t + (a.uid || '') + ':' + (a.lane != null ? a.lane : '') + ':' + (a.from != null ? a.from + '>' + a.to : '') + ':' + (a.slot || ''); }

function planTurn(state, me, opts) {
  opts = opts || {};
  const D = Object.assign({}, DIFFICULTY[opts.difficulty || 'normal'], opts.tune || {});
  const W = Object.assign({}, PERSONALITIES[opts.personality || 'balanced'], { horizon: D.horizon || 1 });
  const rng = mkRng(opts.seed != null ? opts.seed : (state.rng ^ (state.turn * 2654435761)));
  const useTime = opts.useTime !== false;
  const t0 = now();
  let nodes = 0;
  const root = resolvePending(E.redact(state, me), me, W);
  if (root.active !== me || root.winner != null || root.phase !== 'main' || root.pending) return [];
  const rootScore = leafScore(root, me, W, rng, D.noise);
  let best = { seq: [], score: rootScore, st: root };
  let beam = [best];
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
        const st2 = resolvePending(r.state, me, W);
        const child = { st: st2, seq: node.seq.concat([a]), score: leafScore(st2, me, W, rng, D.noise) };
        child.terminal = a.t === 'draw' || st2.winner != null || (st2.pending && st2.pending.side !== me);
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
      const key = c.seq.map(actKey).sort().join('|');
      if (seen[key]) continue; seen[key] = 1;
      beam.push(c);
    }
  }
  // Greedy finish: add any remaining attacks that still help.
  let seq = best.seq, cur = best.st, curScore = best.score;
  if (!best.terminal) {
    for (let i = 0; i < 4; i++) {
      let add = null, addSt = null, addScore = curScore;
      for (const a of E.legalActions(cur, me)) {
        if (a.t !== 'activate') continue;
        const r = E.apply(cur, a); if (r.error) continue;
        const sc = leafScore(r.state, me, W, rng, 0);
        if (sc > addScore + 0.3) { add = a; addSt = r.state; addScore = sc; }
      }
      if (!add) break;
      seq = seq.concat([add]); cur = addSt; curScore = addScore;
    }
  }
  if (D.blunder && rng() < D.blunder) {
    const acts = prune(root, me, E.legalActions(root, me));
    if (acts.length) seq = [acts[Math.floor(rng() * acts.length)]];
  }
  return seq;
}

// Secret kingdom setup: place the best cards for the Setup budget (the enemy kingdom is hidden).
function planSetup(state, me, opts) {
  opts = opts || {};
  const W = Object.assign({}, PERSONALITIES[opts.personality || 'balanced']);
  const root = E.redact(state, me);
  let cur = root; const seq = [];
  for (let i = 0; i < 4; i++) {
    let best = null, bv = features(cur, me, W) + 0.5;
    for (const a of E.legalActions(cur, me)) {
      if (a.t !== 'play') continue;
      const r = E.apply(cur, a); if (r.error) continue;
      const v = features(r.state, me, W) + (E.CARDS[r.state.players[me].lanes[a.lane].creature ? r.state.players[me].lanes[a.lane].creature.id : 'x'] ? 1.5 : 0);
      if (v > bv) { bv = v; best = { a, st: r.state }; }
    }
    if (!best) break;
    seq.push(best.a); cur = best.st;
  }
  return seq;
}

function mulligan(state, me) {
  const P = state.players[me];
  let creatures = 0, playable = 0;
  for (const c of P.hand) {
    const cd = E.CARDS[c.id];
    if (cd.type === 'creature') creatures++;
    if (E.meetsReq(state, me, cd) && cd.cost <= 1) playable++;
  }
  return creatures < 2 || playable < 2;
}

// Who has to act next in this state (mulligan, setup, pending choices, then the active player).
function actor(st) {
  if (st.winner != null) return -1;
  if (st.phase === 'mulligan') return st.players[0].mulled == null ? 0 : 1;
  if (st.phase === 'setup') return !st.players[st.first].ready ? st.first : 1 - st.first;
  if (st.pending) return st.pending.side;
  return st.active;
}

// Next command for seat `me`. `ctx` (one per seat) caches the current plan between calls.
function decide(state, me, opts, ctx) {
  ctx = ctx || {};
  opts = opts || {};
  if (state.winner != null) return null;
  const W = Object.assign({}, PERSONALITIES[opts.personality || 'balanced']);
  const D = DIFFICULTY[opts.difficulty || 'normal'];
  if (state.phase === 'mulligan') return state.players[me].mulled == null ? { t: 'mulligan', p: me, redraw: mulligan(state, me) } : null;
  if (state.phase === 'setup') {
    if (state.players[me].ready) return null;
    if (ctx.setupKey !== state.uid + ':' + me || !ctx.setup) { ctx.setup = planSetup(state, me, opts); ctx.setupKey = state.uid + ':' + me; }
    while (ctx.setup.length) { const c = ctx.setup.shift(); if (!E.playBlock(state, me, c.uid)) return c; }
    return { t: 'ready', p: me };
  }
  const pd = state.pending;
  if (pd) {
    if (pd.side !== me) return null;
    if (pd.kind === 'steal') return { t: 'choose', p: me, uid: chooseSteal(state, me) };
    if (pd.kind === 'discard') return { t: 'discard', p: me, uid: chooseDiscard(state, me) };
    if (pd.kind === 'defend') {
      const key = state.turn + ':' + state.active;
      if (ctx.defKey !== key) {
        ctx.defKey = key;
        const rng = mkRng((opts.seed || 1) ^ state.turn);
        ctx.def = (D.defend >= 1 || rng() < D.defend) ? defendPlan(E.redact(state, me), me, W, 4) : [];
      }
      while (ctx.def.length) { const c = ctx.def.shift(); if (!E.apply(state, c).error) return c; }
      return { t: 'defend', p: me };
    }
  }
  if (state.active !== me || state.phase !== 'main') return null;
  const key = state.turn;
  if (ctx.turnKey !== key || !ctx.plan || !ctx.plan.length) {
    if (ctx.turnKey === key && ctx.plan && !ctx.plan.length && ctx.done) return { t: 'battle', p: me };
    ctx.turnKey = key;
    ctx.plan = planTurn(state, me, opts);
    ctx.done = true;
    if (!ctx.plan.length) return { t: 'battle', p: me };
  }
  while (ctx.plan.length) {
    const c = ctx.plan.shift();
    if (!E.apply(state, c).error) return c;
    ctx.plan = []; break;
  }
  ctx.done = false;   // a plan step failed or ran out: plan again from here
  const again = planTurn(state, me, opts);
  ctx.plan = again; ctx.done = true;
  if (!again.length) return { t: 'battle', p: me };
  return ctx.plan.shift();
}
// After a command, call observe() so new information (a draw, a revealed trap...) triggers a re-plan.
function observe(ctx, events) {
  if (!ctx || !events) return;
  for (const e of events) if (e.rng || e.t === 'draw' || e.t === 'trap' || e.t === 'reveal' || e.t === 'stealCard') { ctx.plan = null; ctx.turnKey = null; return; }
}

// Plays a whole game headlessly (balance harness, tests). Returns the final state.
function playGame(state, opts0, opts1, maxCmds) {
  let st = state; const ctx = [{}, {}]; const opts = [opts0 || {}, opts1 || opts0 || {}];
  let guard = 0;
  while (st.winner == null && guard++ < (maxCmds || 3000)) {
    const p = actor(st); if (p < 0) break;
    const o = Object.assign({}, opts[p], { seed: ((opts[p].seed || 7) + st.turn * 7919 + guard) >>> 0 });
    let cmd = decide(st, p, o, ctx[p]);
    if (!cmd) break;
    let r = E.apply(st, cmd);
    if (r.error) {
      const fb = st.phase === 'setup' ? { t: 'ready', p } : (st.pending && st.pending.kind === 'defend' ? { t: 'defend', p } : { t: 'battle', p });
      ctx[p].plan = null;
      r = E.apply(st, fb);
      if (r.error) break;
    }
    observe(ctx[p], r.events);
    st = r.state;
  }
  return st;
}

return { PERSONALITIES, DIFFICULTY, planTurn, planSetup, decide, observe, actor, playGame, defendPlan, mulligan, chooseSteal, chooseDiscard, evaluate, features, cardValue };
})(Engine);
/* END AI */
