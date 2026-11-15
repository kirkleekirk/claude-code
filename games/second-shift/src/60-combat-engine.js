/* =====================================================================
   60-combat-engine: grid battles with a timeline, knockback, hazards, AI.
   Logic only. All mutations are mirrored as "events" for the renderer.
   ===================================================================== */

const BW = 9, BH = 6, ROUND_T = 10;
let FOE_HP_MUL = 1.35, FOE_ATK_MUL = 1.0;   // global battle tuning knobs
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tk = (x, y) => x + ',' + y;
const inB = (x, y) => x >= 0 && y >= 0 && x < BW && y < BH;
const mdist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const unitAt = (B, x, y) => B.units.find(u => u.alive && u.x === x && u.y === y) || null;
const obsAt = (B, x, y) => B.obs.find(o => o.alive && o.x === x && o.y === y) || null;
const hzAt = (B, x, y) => B.hz.filter(z => z.x === x && z.y === y);
const unitById = (B, uid) => B.units.find(u => u.uid === uid);
const foesOf = (B, u) => B.units.filter(o => o.alive && o.team !== u.team);
const alliesOf = (B, u) => B.units.filter(o => o.alive && o.team === u.team);
const roundOf = B => Math.floor(B.t / ROUND_T) + 1;

/* ---------- unit factories ---------- */
let _uid = 1;
function heroUnit(id) {
  const H = HEROES[id], m = mods(id), s = x => effStat(id, x);
  const P = (6 + 1.35 * s(H.power)) * (1 + (m.dmg || 0));
  const maxHp = Math.round(22 + 6 * s('vigor') + (m.hp || 0));
  return {
    uid: _uid++, id, team: 'hero', name: H.name, look: H.look, kit: H.kit, P, armor: m.armor || 0, maxHp, hp: maxHp, shield: 0,
    move: 2 + Math.floor(s('mobility') / 4) + (m.move || 0), speed: 8 + 1.4 * s('mobility'), crit: 0.05 + 0.025 * s('intellect') + (m.crit || 0),
    hypeGain: 1 + 0.05 * s('charisma') + (m.hype || 0), hype: Math.min(100, m.startHype || 0), mods: m, cd: {}, st: {}, alive: true, flying: false, size: 1, x: 0, y: 0,
    vis: null, nextAct: 0, cost: 0, ai: 'hero', stats: Object.fromEntries(STATS.map(k => [k, s(k)])),
  };
}
function foeUnit(type, lvl) {
  const E = ENEMIES[type], hpM = (0.85 + 0.15 * lvl) * FOE_HP_MUL, atkM = (0.9 + 0.1 * lvl) * FOE_ATK_MUL;
  return {
    uid: _uid++, id: type, team: 'foe', name: E.name, look: E.look, kit: E.kit, P: E.atk * atkM, armor: E.armor || 0, maxHp: Math.round(E.hp * hpM), hp: Math.round(E.hp * hpM), shield: 0,
    move: E.move, speed: E.speed, crit: 0.05, hypeGain: 0, hype: 0, mods: {}, cd: {}, st: {}, alive: true, flying: !!E.flying, size: E.boss ? 1.45 : (E.look.small ? 0.8 : 1), boss: !!E.boss,
    x: 0, y: 0, vis: null, nextAct: 0, cost: 0, ai: E.ai, stats: {},
  };
}
function setTiming(B, u, first) {
  u.cost = 100 / u.speed;
  if (first) u.nextAct = u.cost * lerp(0.35, 0.85, R());
}
function newBattle(call, teamIds) {
  const enc = ENCOUNTERS[call.fight], B = {
    W: BW, H: BH, enc, call, units: [], obs: [], hz: [], t: 0, turn: 0, over: false, result: null, radioUsed: false, nextObs: 1,
    stats: { dmgDealt: 0, slams: 0, flanks: 0, ults: 0 }, par: enc.par, arena: ARENAS[enc.arena],
  };
  teamIds.forEach((id, i) => { const u = heroUnit(id); const sp = HERO_SPAWNS[i]; u.x = sp[0]; u.y = sp[1]; setTiming(B, u, true); B.units.push(u); });
  enc.en.forEach(([type, x, y]) => { const u = foeUnit(type, enc.lvl); u.x = x; u.y = y; setTiming(B, u, true); B.units.push(u); });
  enc.obs.forEach(([x, y, type]) => addObstacle(B, x, y, type));
  enc.hz.forEach(([x, y, type]) => B.hz.push({ x, y, type, until: Infinity, vis: true }));
  B.units.forEach(u => { u.vis = { x: u.x, y: u.y, hp: u.hp, shield: 0, hype: u.hype, alpha: 1, pose: 'idle', pa: 0, flash: 0, ox: 0, oy: 0, lift: 0, face: u.team === 'hero' ? 1 : -1 }; });
  return B;
}
function addObstacle(B, x, y, type) {
  const hp = { car: 30, crate: 14, barrel: 8, pillar: 9999, planter: 12 }[type] || 12;
  const o = { id: B.nextObs++, x, y, type, hp, maxHp: hp, alive: true, vis: true, explosive: type === 'barrel', indestructible: type === 'pillar' };
  B.obs.push(o); return o;
}
function cloneB(B) {
  const C = Object.assign({}, B);
  C.units = B.units.map(u => Object.assign({}, u, { cd: Object.assign({}, u.cd), st: Object.assign({}, u.st) }));
  C.obs = B.obs.map(o => Object.assign({}, o)); C.hz = B.hz.map(z => Object.assign({}, z)); C.stats = Object.assign({}, B.stats);
  return C;
}

/* ---------- timeline ---------- */
function nextUnit(B) {
  let best = null;
  for (const u of B.units) { if (!u.alive) continue; if (!best || u.nextAct < best.nextAct - 1e-6 || (Math.abs(u.nextAct - best.nextAct) < 1e-6 && u.team === 'hero' && best.team !== 'hero')) best = u; }
  return best;
}
function timelineOrder(B, n) {
  const live = B.units.filter(u => u.alive).map(u => ({ u, t: u.nextAct })), out = [];
  for (let i = 0; i < (n || 10) && live.length; i++) {
    let bi = 0; for (let j = 1; j < live.length; j++) if (live[j].t < live[bi].t - 1e-6) bi = j;
    out.push(live[bi].u); live[bi].t += live[bi].u.cost;
  }
  return out;
}

/* ---------- movement ---------- */
function canStopAt(B, u, x, y) { return !unitAt(B, x, y) && !obsAt(B, x, y); }
function reachable(B, u) {
  const dist = new Map([[tk(u.x, u.y), 0]]), prev = new Map(), q = [{ x: u.x, y: u.y }];
  while (q.length) {
    const c = q.shift(), d = dist.get(tk(c.x, c.y)); if (d >= u.move) continue;
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx, ny = c.y + dy; if (!inB(nx, ny)) continue; const k = tk(nx, ny); if (dist.has(k)) continue;
      if (unitAt(B, nx, ny)) continue;
      if (obsAt(B, nx, ny) && !u.flying) continue;
      dist.set(k, d + 1); prev.set(k, c); q.push({ x: nx, y: ny });
    }
  }
  for (const k of Array.from(dist.keys())) { const [x, y] = k.split(',').map(Number); if (!canStopAt(B, u, x, y) && !(x === u.x && y === u.y)) dist.delete(k); }
  return { dist, prev };
}
function pathTo(R0, u, x, y) {
  const path = []; let c = { x, y };
  while (!(c.x === u.x && c.y === u.y)) { path.unshift(c); c = R0.prev.get(tk(c.x, c.y)); if (!c) return []; }
  return path;
}

/* ---------- ability geometry ---------- */
function dirFrom(u, t) {
  const dx = t.x - u.x, dy = t.y - u.y;
  if (Math.abs(dx) >= Math.abs(dy)) return [Math.sign(dx) || 1, 0];
  return [0, Math.sign(dy)];
}
function footprint(B, u, ab, t) {
  const tiles = [], hit = [], add = (arr, x, y, w) => { if (inB(x, y)) arr.push({ x, y, w: w == null ? 1 : w }); };
  const sp = ab.splash == null ? 1 : ab.splash, r = ab.ar || 0;
  let dir = null, land = null;
  const shape = (cx, cy, self) => {
    if (!self) { add(tiles, cx, cy, 1); add(hit, cx, cy, 1); }
    if (ab.area === 'diamond') { for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (!dx && !dy) continue; if (Math.abs(dx) + Math.abs(dy) <= r) { add(tiles, cx + dx, cy + dy, sp); add(hit, cx + dx, cy + dy, sp); } } }
    else if (ab.area === 'square') { for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (!dx && !dy) continue; add(tiles, cx + dx, cy + dy, sp); add(hit, cx + dx, cy + dy, sp); } }
    else if (ab.area === 'plus') { for (const [dx, dy] of DIRS) for (let i = 1; i <= r; i++) { add(tiles, cx + dx * i, cy + dy * i, sp); add(hit, cx + dx * i, cy + dy * i, sp); } }
  };
  switch (ab.tgt) {
    case 'adj': add(tiles, t.x, t.y); add(hit, t.x, t.y); break;
    case 'line': {
      dir = dirFrom(u, t); let x = u.x, y = u.y;
      for (let i = 1; i <= ab.r; i++) { x += dir[0]; y += dir[1]; if (!inB(x, y)) break; add(tiles, x, y); const blk = unitAt(B, x, y) || obsAt(B, x, y); if (ab.pierce) add(hit, x, y); else if (blk) { add(hit, x, y); break; } }
      break;
    }
    case 'cone': {
      dir = dirFrom(u, t); const [dx, dy] = dir, px = -dy, py = dx;
      for (let d = 1; d <= ab.r; d++) for (let l = -(d - 1); l <= d - 1; l++) { add(tiles, u.x + dx * d + px * l, u.y + dy * d + py * l); add(hit, u.x + dx * d + px * l, u.y + dy * d + py * l); }
      break;
    }
    case 'row': for (let x = 0; x < BW; x++) { add(tiles, x, t.y); add(hit, x, t.y); } break;
    case 'none': if (ab.area === 'all') for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) { add(tiles, x, y); add(hit, x, y); } break;
    case 'self': shape(u.x, u.y, true); break;
    case 'tile': case 'ally': case 'empty': shape(t.x, t.y, false); if (ab.move === 'tp') { tiles.length = 0; hit.length = 0; shape(t.x, t.y, true); add(tiles, t.x, t.y, 0); } break;
    case 'dash': case 'charge': {
      dir = dirFrom(u, t); let x = u.x, y = u.y;
      for (let i = 1; i <= ab.r; i++) {
        x += dir[0]; y += dir[1]; if (!inB(x, y)) break;
        const un = unitAt(B, x, y), ob = obsAt(B, x, y);
        if (ob) break;
        if (un && ab.tgt === 'charge') { add(hit, x, y); break; }
        add(tiles, x, y); if (un) add(hit, x, y); else land = { x, y };
      }
      break;
    }
    default: break;
  }
  return { tiles, hit, dir, land };
}
function sideOK(u, v, side) { return side === 'all' || (side === 'foe' ? v.team !== u.team : v.team === u.team); }
function isLegalTarget(B, u, ab, t) {
  if (!inB(t.x, t.y)) return false;
  const d = mdist(u, t), rng = (ab.r || 0) + (ab.tgt === 'tile' || ab.tgt === 'ally' || ab.tgt === 'empty' || ab.tgt === 'row' ? (u.mods.rng || 0) : 0);
  switch (ab.tgt) {
    case 'adj': return d === 1;
    case 'line': case 'cone': case 'dash': case 'charge': return (t.x === u.x) !== (t.y === u.y) ? (t.x === u.x || t.y === u.y) && d <= (ab.r || 1) : false;
    case 'tile': return d <= rng && d > 0;
    case 'empty': return d <= rng && d > 0 && canStopAt(B, u, t.x, t.y);
    case 'ally': { if (d > rng) return false; const v = unitAt(B, t.x, t.y); if (!v || v.team !== u.team) return false; if (ab.noSelf && v === u) return false; return true; }
    case 'row': return true;
    case 'self': case 'none': return true;
    default: return false;
  }
}
function canUse(u, ab) {
  if (ab.ult) return u.hype >= 100;
  return !(u.cd[ab.id] > 0);
}

/* ---------- damage, effects, knockback ---------- */
const dirv = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y; return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 0, 0] : [0, Math.sign(dy)]; };
function E(ctx, t, data) { const e = Object.assign({ t, b: ctx.beat }, data); ctx.ev.push(e); return e; }

function gainHype(u, amt) { if (u.team !== 'hero') return; u.hype = Math.min(100, u.hype + amt * u.hypeGain); }
function dealDamage(ctx, v, dmg, info) {
  info = info || {};
  const { B, u, ab } = ctx;
  let d = Math.max(1, Math.round(dmg)), absorbed = 0;
  if (v.shield > 0 && !(ab && ab.pierceShield && !info.env)) { absorbed = Math.min(v.shield, d); v.shield -= absorbed; d -= absorbed; }
  v.hp = Math.max(0, v.hp - d);
  ctx.sum.dmg[v.uid] = (ctx.sum.dmg[v.uid] || 0) + d + absorbed;
  if (info.flank) (ctx.sum.flank = ctx.sum.flank || []).push(v.uid);
  if (u && v.team !== u.team) B.stats.dmgDealt += d;
  E(ctx, 'hit', { u: v.uid, dmg: d, absorbed, hp: v.hp, shield: v.shield, crit: !!info.crit, flank: !!info.flank, kind: info.kind || 'hit', src: u ? u.uid : null });
  if (u && v.team !== u.team) gainHype(u, Math.min(40, 8 + d * 0.5));
  gainHype(v, 4 + d * 0.35);
  if (v.hp <= 0) killUnit(ctx, v, u);
  return d;
}
function killUnit(ctx, v, by) {
  if (!v.alive) return;
  v.alive = false; ctx.sum.kills.push(v.uid);
  E(ctx, 'die', { u: v.uid });
  if (by && by.team !== v.team) gainHype(by, 18);
}
function healUnit(ctx, v, amt) {
  const a = Math.min(v.maxHp - v.hp, Math.round(amt)); if (a <= 0) return;
  v.hp += a; ctx.sum.heal += a; E(ctx, 'heal', { u: v.uid, amt: a, hp: v.hp });
}
function applyFx(ctx, v, fx) {
  const { B, u } = ctx, m = u ? u.mods : {};
  switch (fx.k) {
    case 'burn': v.st.burn = { dmg: fx.v + (m.burn ? 2 : 0), n: (fx.n || 2) + (m.burn ? 1 : 0) }; E(ctx, 'fx', { u: v.uid, k: 'burn' }); break;
    case 'delay': case 'slow': { const amt = fx.v + (m.delay || 0); v.nextAct += amt; E(ctx, 'fx', { u: v.uid, k: 'delay', amt }); ctx.sum.buffs++; break; }
    case 'haste': v.nextAct = Math.max(B.t + 0.02, v.nextAct - fx.v); E(ctx, 'fx', { u: v.uid, k: 'haste' }); ctx.sum.buffs++; break;
    case 'mark': v.st.mark = fx.n || 1; E(ctx, 'fx', { u: v.uid, k: 'mark' }); break;
    case 'rally': v.st.rally = fx.n || 2; E(ctx, 'fx', { u: v.uid, k: 'rally' }); ctx.sum.buffs++; break;
    case 'shield': v.shield += fx.v; E(ctx, 'fx', { u: v.uid, k: 'shield', shield: v.shield }); ctx.sum.buffs++; break;
    case 'freeze': v.st.frozen = true; E(ctx, 'fx', { u: v.uid, k: 'freeze' }); break;
    case 'cdr': Object.keys(v.cd).forEach(k => { v.cd[k] = Math.max(0, v.cd[k] - fx.v); }); E(ctx, 'fx', { u: v.uid, k: 'cdr' }); ctx.sum.buffs++; break;
    case 'hype': { const tgt = fx.self ? u : v; if (tgt && tgt.team === 'hero') { tgt.hype = Math.min(100, tgt.hype + fx.v); E(ctx, 'fx', { u: tgt.uid, k: 'hype' }); } break; }
    case 'cleanse': delete v.st.burn; delete v.st.mark; delete v.st.frozen; E(ctx, 'fx', { u: v.uid, k: 'cleanse' }); ctx.sum.buffs++; break;
    default: break;
  }
}
function damageObstacle(ctx, o, dmg) {
  if (!o.alive || o.indestructible) return;
  if (ctx.sum) ctx.sum.obs = (ctx.sum.obs || 0) + 1;
  o.hp -= dmg;
  E(ctx, 'obsHit', { o: o.id, hp: o.hp, maxHp: o.maxHp });
  if (o.hp <= 0) {
    o.alive = false; E(ctx, 'obsDie', { o: o.id, x: o.x, y: o.y, type: o.type });
    if (o.explosive) explodeAt(ctx, o.x, o.y, 11, 1, 'barrel');
  }
}
function explodeAt(ctx, cx, cy, dmg, rad, kind) {
  const { B } = ctx; ctx.beat++;
  E(ctx, 'boom', { x: cx, y: cy, r: rad, kind });
  ctx.beat++;
  for (let dx = -rad; dx <= rad; dx++) for (let dy = -rad; dy <= rad; dy++) {
    const x = cx + dx, y = cy + dy; if (!inB(x, y)) continue;
    const v = unitAt(B, x, y); if (v) dealDamage(ctx, v, dmg, { env: true, kind: 'boom' });
    const o = obsAt(B, x, y); if (o && !(dx === 0 && dy === 0)) damageObstacle(ctx, o, dmg);
  }
}
function applyHazardOn(ctx, v, z) {
  if (v.flying || !v.alive) return;
  if (z.type === 'fire') { dealDamage(ctx, v, 5, { env: true, kind: 'fire' }); if (v.alive) applyFx(ctx, v, { k: 'burn', v: 3, n: 2 }); }
  else if (z.type === 'electric') { dealDamage(ctx, v, 6, { env: true, kind: 'zap' }); if (v.alive) applyFx(ctx, v, { k: 'delay', v: 4 }); }
  else if (z.type === 'toxic') { dealDamage(ctx, v, 4, { env: true, kind: 'toxic' }); }
}
function pushUnit(ctx, v, dx, dy, n, byAb) {
  const { B } = ctx; let moved = 0, path = [{ x: v.x, y: v.y }], coll = null;
  const startX = v.x, startY = v.y;
  for (let i = 1; i <= n; i++) {
    const nx = v.x + dx, ny = v.y + dy;
    if (!inB(nx, ny)) { coll = { edge: true, left: n - i + 1 }; break; }
    const ou = unitAt(B, nx, ny), oo = obsAt(B, nx, ny);
    if (ou || oo) { coll = { u: ou, o: oo, left: n - i + 1 }; break; }
    v.x = nx; v.y = ny; moved++; path.push({ x: nx, y: ny });
    const zs = hzAt(B, nx, ny);
    if (zs.some(z => z.type === 'ice')) n += 2;
  }
  if (moved || coll) { ctx.beat = Math.max(ctx.beat, 2); }
  if (moved) { E(ctx, 'push', { u: v.uid, path, from: { x: startX, y: startY } }); ctx.sum.push[v.uid] = { x: v.x, y: v.y }; }
  if (coll) {
    const dmg = 4 + 2 * coll.left + ((ctx.u && ctx.u.mods.kb) ? 1 : 0), cb = ctx.beat + 1;
    ctx.beat = cb; B.stats.slams++;
    E(ctx, 'slam', { x: v.x + dx * 0.5, y: v.y + dy * 0.5, u: v.uid, dx, dy });
    dealDamage(ctx, v, dmg, { env: true, kind: 'slam' });
    if (coll.u) dealDamage(ctx, coll.u, dmg, { env: true, kind: 'slam' });
    if (coll.o) damageObstacle(ctx, coll.o, dmg + 2);
  }
  if (v.alive && moved) { hzAt(B, v.x, v.y).forEach(z => { if (!(z.type === 'ice' || z.type === 'bomb')) { ctx.beat++; applyHazardOn(ctx, v, z); } }); }
}
function pullUnit(ctx, v, pivot, n) {
  const { B } = ctx; const path = [{ x: v.x, y: v.y }]; let moved = 0;
  for (let i = 0; i < n; i++) {
    if (mdist(v, pivot) <= 1) break;
    const [dx, dy] = dirv(v, pivot), nx = v.x + dx, ny = v.y + dy;
    if (!inB(nx, ny) || unitAt(B, nx, ny) || obsAt(B, nx, ny) || (nx === pivot.x && ny === pivot.y)) break;
    v.x = nx; v.y = ny; moved++; path.push({ x: nx, y: ny });
  }
  if (moved) { ctx.beat = Math.max(ctx.beat, 2); E(ctx, 'push', { u: v.uid, path, pull: true }); ctx.sum.push[v.uid] = { x: v.x, y: v.y }; hzAt(B, v.x, v.y).forEach(z => { if (!(z.type === 'ice' || z.type === 'bomb')) applyHazardOn(ctx, v, z); }); }
}

function flankOf(B, u, v) {
  const [dx, dy] = dirv(u, v), ox = v.x + dx, oy = v.y + dy;
  const a = unitAt(B, ox, oy); return !!(a && a !== u && a.team === u.team);
}
function calcDamage(B, u, ab, v, w, flank, dry) {
  let d = u.P * ab.dmg * w;
  if (u.st.rally > 0) d *= 1.3;
  if (ab.ult && u.mods.ultDmg) d *= 1 + u.mods.ultDmg;
  if (ab.place && u.mods.boom) d *= 1 + u.mods.boom;
  if (flank) d *= 1.4;
  if (v.st.mark > 0) d *= 1.3;
  d = Math.max(1, d - v.armor);
  let crit = false;
  if (!dry && R() < u.crit) { crit = true; d *= 1.5; }
  return { d: Math.round(d), crit };
}

/* ---------- THE ability resolver ---------- */
function useAbility(B, u, ab, t, ev, dry) {
  const sum = { dmg: {}, kills: [], heal: 0, buffs: 0, push: {}, hits: 0 };
  const ctx = { B, u, ab, ev, dry, sum, beat: 0 };
  const fp = footprint(B, u, ab, t);
  E(ctx, 'cast', { u: u.uid, ab: ab.id, name: ab.name, tgt: t, ult: !!ab.ult, dir: fp.dir, tgt_k: ab.tgt, proj: (ab.tgt === 'line' && !ab.pierce) || (ab.tgt === 'tile' && ab.dmg > 0), tiles: fp.tiles.map(x => ({ x: x.x, y: x.y })) });
  ctx.beat = 1;
  if (ab.ult) { u.hype = 0; B.stats.ults++; }
  const mark = [];
  /* movement before the hit */
  if (ab.move === 'tp') { const from = { x: u.x, y: u.y }; u.x = t.x; u.y = t.y; E(ctx, 'blink', { u: u.uid, from, to: { x: t.x, y: t.y } }); ctx.beat++; }
  if ((ab.tgt === 'dash') && fp.land) {
    const path = [{ x: u.x, y: u.y }]; const dir = fp.dir; let x = u.x, y = u.y;
    while (!(x === fp.land.x && y === fp.land.y)) { x += dir[0]; y += dir[1]; path.push({ x, y }); }
    E(ctx, 'dash', { u: u.uid, path }); u.x = fp.land.x; u.y = fp.land.y; ctx.beat++;
  }
  if (ab.tgt === 'charge') {
    const dir = fp.dir; let x = u.x, y = u.y; const path = [{ x, y }];
    for (let i = 1; i <= ab.r; i++) { const nx = x + dir[0], ny = y + dir[1]; if (!inB(nx, ny) || unitAt(B, nx, ny) || obsAt(B, nx, ny)) break; x = nx; y = ny; path.push({ x, y }); }
    if (path.length > 1) { E(ctx, 'dash', { u: u.uid, path }); u.x = x; u.y = y; ctx.beat++; }
    // victim is the unit directly ahead after the charge
    const vic = unitAt(B, x + dir[0], y + dir[1]); fp.hit = vic ? [{ x: vic.x, y: vic.y, w: 1 }] : [];
  }
  const origin = (ab.tgt === 'self') ? { x: u.x, y: u.y } : { x: t.x, y: t.y };
  const hitTiles = (ab.tgt === 'self' || ab.tgt === 'none') ? fp.hit : fp.hit;
  /* gather victims */
  let victims = [];
  hitTiles.forEach(ti => { const v = unitAt(B, ti.x, ti.y); if (v && v !== u && sideOK(u, v, ab.side)) victims.push({ v, w: ti.w }); else if (v === u && (ab.tgt === 'ally' && !ab.noSelf) && ab.side === 'ally') victims.push({ v, w: ti.w }); });
  if (ab.tgt === 'ally' && ab.move !== 'swap') { /* self-target allowed via the tile itself */ }
  const wasFoeTarget = victims.length > 0;
  if (ab.side === 'ally' && ab.area === 'all') victims = B.units.filter(o => o.alive && o.team === u.team).map(v => ({ v, w: 1 }));
  if (ab.area === 'barrage') { barrage(ctx); }
  /* damage / heal / fx */
  const single = victims.length === 1 || (ab.area === 'one' && victims.length) || ab.tgt === 'adj' || ab.tgt === 'line';
  victims.forEach(({ v, w }) => {
    if (!v.alive) return;
    if (ab.dmg > 0) {
      const fl = single && ab.side === 'foe' && (ab.tgt === 'adj' || ab.tgt === 'line' || ab.tgt === 'tile') && ab.area === 'one' ? flankOf(B, u, v) : false;
      const r = calcDamage(B, u, ab, v, w, fl, dry);
      if (fl) B.stats.flanks++;
      dealDamage(ctx, v, r.d, { crit: r.crit, flank: fl });
      ctx.sum.hits++;
      if (ab.chain && v.alive !== undefined) {
        const nb = DIRS.map(([dx, dy]) => unitAt(B, v.x + dx, v.y + dy)).filter(o => o && o.team !== u.team && o !== v)[0];
        if (nb) { E(ctx, 'chain', { from: v.uid, to: nb.uid }); dealDamage(ctx, nb, Math.max(1, Math.round(r.d * ab.chain)), {}); }
      }
    }
    if (ab.heal && v.alive) healUnit(ctx, v, u.P * ab.heal * (1 + (u.mods.heal || 0)));
    if (ab.healPct && v.alive) healUnit(ctx, v, v.maxHp * ab.healPct * (1 + (u.mods.heal || 0)));
    (ab.fx || []).forEach(fx => { if (!v.alive) return; if (fx.self) applyFx(ctx, u, fx); else applyFx(ctx, v, fx); });
    if (v.alive && (ab.kb || ab.pull)) mark.push({ v, w });
  });
  /* obstacles in the area take damage */
  if (ab.dmg > 0) hitTiles.forEach(ti => { const o = obsAt(B, ti.x, ti.y); if (o && ab.side !== 'ally') { ctx.beat = Math.max(ctx.beat, 1); damageObstacle(ctx, o, Math.round(u.P * ab.dmg * ti.w)); } });
  /* knockback / pull — furthest first */
  if (mark.length) {
    const pivot = (ab.kbFrom === 'center' || ab.tgt === 'tile') ? { x: t.x, y: t.y } : { x: u.x, y: u.y };
    if (ab.kb) {
      mark.sort((a, b) => mdist(b.v, pivot) - mdist(a.v, pivot));
      mark.forEach(({ v }) => { if (!v.alive) return; let dir = dirv(pivot, v); if (!dir[0] && !dir[1]) dir = dirv(u, v); if (!dir[0] && !dir[1]) dir = [1, 0]; pushUnit(ctx, v, dir[0], dir[1], ab.kb + (u.mods.kb || 0)); });
    }
    if (ab.pull) {
      const pv = ab.pullTo === 'caster' ? { x: u.x, y: u.y } : { x: t.x, y: t.y };
      mark.sort((a, b) => mdist(a.v, pv) - mdist(b.v, pv));
      mark.forEach(({ v }) => { if (v.alive) pullUnit(ctx, v, pv, ab.pull + (u.mods.pullp || 0)); });
    }
  }
  /* swaps */
  if (ab.move === 'swap') {
    let other = null;
    if (ab.tgt === 'ally') other = unitAt(B, t.x, t.y);
    else other = victims.map(x => x.v).find(v => v.alive);
    if (other && other !== u) { const a = { x: u.x, y: u.y }, b = { x: other.x, y: other.y }; u.x = b.x; u.y = b.y; other.x = a.x; other.y = a.y; ctx.beat++; E(ctx, 'swap', { ua: u.uid, ub: other.uid, pa: a, pb: b }); }
  }
  /* hazards + placed objects */
  if (ab.hz) {
    ctx.beat++;
    const dur = ab.hz === 'ice' ? 40 : 30;
    fp.tiles.forEach(ti => { if (obsAt(B, ti.x, ti.y)) return; B.hz = B.hz.filter(z => !(z.x === ti.x && z.y === ti.y && z.type !== 'bomb')); const z = { x: ti.x, y: ti.y, type: ab.hz, until: B.t + dur, vis: false }; B.hz.push(z); E(ctx, 'hz', { x: ti.x, y: ti.y, type: ab.hz }); const v = unitAt(B, ti.x, ti.y); if (v && ab.hz !== 'ice') applyHazardOn(ctx, v, z); });
  }
  if (ab.place === 'bomb') { B.hz.push({ x: t.x, y: t.y, type: 'bomb', until: B.t + 20.5, fuseAt: B.t + 20, owner: u.uid, dmg: u.P * 2.0 * (1 + (u.mods.boom || 0)), vis: false }); E(ctx, 'hz', { x: t.x, y: t.y, type: 'bomb' }); ctx.sum.buffs++; }
  if (ab.place === 'barrel') { const o = addObstacle(B, t.x, t.y, 'barrel'); o.vis = false; E(ctx, 'obsAdd', { o: o.id, x: t.x, y: t.y, type: 'barrel' }); ctx.sum.buffs++; }
  if (ab.special === 'summon') {
    const free = []; for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) if (canStopAt(B, u, x, y) && mdist({ x, y }, u) <= 3 && mdist({ x, y }, u) >= 1) free.push({ x, y });
    for (let i = 0; i < ab.n && free.length; i++) {
      const idx = Math.floor(R() * free.length), p = free.splice(idx, 1)[0];
      const nu = foeUnit(ab.unit, B.enc.lvl); nu.x = p.x; nu.y = p.y; nu.cost = 100 / nu.speed; nu.nextAct = B.t + 6 + i * 2;
      nu.vis = { x: p.x, y: p.y, hp: nu.hp, shield: 0, hype: 0, alpha: 0, pose: 'idle', pa: 0, flash: 0, ox: 0, oy: 0, lift: 0, face: -1 };
      B.units.push(nu); E(ctx, 'spawn', { u: nu.uid }); ctx.sum.buffs += 2;
    }
  }
  if (ab.extra === 'extraTurn') { u.extra = true; Object.keys(u.cd).forEach(k => { u.cd[k] = 0; }); E(ctx, 'fx', { u: u.uid, k: 'extra' }); }
  /* cooldown */
  if (ab.cd > 0) u.cd[ab.id] = Math.max(1, ab.cd - (u.mods.cdr || 0) + 1);
  return sum;
}
function barrage(ctx) {
  const { B, u, ab } = ctx; const foes = foesOf(B, u); if (!foes.length) return;
  for (let i = 0; i < ab.n; i++) {
    const f = foes.filter(x => x.alive); const base = f.length ? f[Math.floor(R() * f.length)] : null;
    const tx = base ? base.x : Math.floor(R() * BW), ty = base ? base.y : Math.floor(R() * BH);
    ctx.beat += 1; E(ctx, 'boom', { x: tx, y: ty, r: 1, kind: 'finale', small: true });
    ctx.beat += 1;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (Math.abs(dx) + Math.abs(dy) > 1) continue; const x = tx + dx, y = ty + dy; if (!inB(x, y)) continue; const v = unitAt(B, x, y); if (v && v.team !== u.team) { const r = calcDamage(B, u, ab, v, dx || dy ? 0.6 : 1, false, ctx.dry); dealDamage(ctx, v, r.d, { crit: r.crit }); } const o = obsAt(B, x, y); if (o) damageObstacle(ctx, o, 8); }
  }
}

/* ---------- turn lifecycle ---------- */
function beginTurn(B, u, ev) {
  const ctx = { B, u: null, ab: null, ev, dry: false, sum: { dmg: {}, kills: [], heal: 0, buffs: 0, push: {}, hits: 0 }, beat: 0 };
  B.t = Math.max(B.t, u.nextAct); B.turn++;
  // time-based hazards
  B.hz.slice().forEach(z => {
    if (z.type === 'bomb' && z.fuseAt <= B.t) { B.hz.splice(B.hz.indexOf(z), 1); E(ctx, 'hzEnd', { x: z.x, y: z.y, type: 'bomb' }); explodeAt(Object.assign(ctx, { u: unitById(B, z.owner) || null }), z.x, z.y, Math.round(z.dmg), 1, 'bomb'); ctx.u = null; }
    else if (z.until <= B.t) { B.hz.splice(B.hz.indexOf(z), 1); E(ctx, 'hzEnd', { x: z.x, y: z.y, type: z.type }); }
  });
  if (!u.alive) return 'dead';
  Object.keys(u.cd).forEach(k => { if (u.cd[k] > 0) u.cd[k]--; });
  if (u.team === 'hero') gainHype(u, 5);
  ctx.beat = 1;
  if (u.st.burn) { const bd = u.st.burn; dealDamage(ctx, u, bd.dmg, { env: true, kind: 'burn' }); bd.n--; if (bd.n <= 0) delete u.st.burn; }
  if (u.alive) hzAt(B, u.x, u.y).forEach(z => { if (u.alive && z.type !== 'ice' && z.type !== 'bomb') { ctx.beat++; applyHazardOn(ctx, u, z); } });
  if (!u.alive) return 'dead';
  if (u.st.mark > 0) u.st.mark--; if (u.st.rally > 0) u.st.rally--;
  if (u.st.frozen) { delete u.st.frozen; E(ctx, 'skip', { u: u.uid }); return 'skip'; }
  return 'ok';
}
function endTurn(B, u) {
  u.nextAct = B.t + (u.extra ? 0.05 : u.cost); u.extra = false;
}
function checkOver(B) {
  const heroes = B.units.filter(u => u.alive && u.team === 'hero').length, foes = B.units.filter(u => u.alive && u.team === 'foe').length;
  if (!foes) { B.over = true; B.result = 'win'; } else if (!heroes) { B.over = true; B.result = 'loss'; }
  return B.over;
}
function battleSummary(B, retreat) {
  const heroes = B.units.filter(u => u.team === 'hero'), kos = heroes.filter(u => !u.alive).length, rounds = roundOf(B);
  const win = B.result === 'win' && !retreat;
  let outcome = 'fail', rank = 'D';
  if (win) {
    if (kos === 0) { outcome = rounds <= B.par ? 'flawless' : 'success'; rank = rounds <= B.par ? 'S' : 'A'; }
    else if (kos >= Math.ceil(heroes.length / 2)) { outcome = 'scrape'; rank = 'C'; } else { outcome = 'success'; rank = 'B'; }
  }
  return { win, outcome, rank, kos, rounds, koIds: heroes.filter(u => !u.alive).map(u => u.id), par: B.par, dmg: B.stats.dmgDealt, slams: B.stats.slams };
}

/* =====================================================================
   AI (used by foes — and by the headless balance harness for heroes)
   ===================================================================== */
function enumTargets(B, u, ab) {
  const out = [], seen = new Set(), add = (x, y) => { const k = tk(x, y); if (!seen.has(k) && inB(x, y)) { seen.add(k); out.push({ x, y }); } };
  const foes = foesOf(B, u), allies = alliesOf(B, u), rng = (ab.r || 0) + (ab.tgt === 'tile' || ab.tgt === 'ally' || ab.tgt === 'empty' ? (u.mods.rng || 0) : 0);
  switch (ab.tgt) {
    case 'adj': DIRS.forEach(([dx, dy]) => add(u.x + dx, u.y + dy)); break;
    case 'line': case 'cone': case 'dash': case 'charge': DIRS.forEach(([dx, dy]) => add(u.x + dx, u.y + dy)); break;
    case 'self': case 'none': add(u.x, u.y); break;
    case 'row': foes.forEach(f => add(f.x, f.y)); break;
    case 'ally': allies.forEach(a => { if (mdist(a, u) <= rng && !(ab.noSelf && a === u)) add(a.x, a.y); }); break;
    case 'tile': {
      const need = (ab.ar || 0) + 1;
      for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) { const d = mdist({ x, y }, u); if (d > rng || d === 0) continue; if (!ab.dmg || foes.some(f => mdist(f, { x, y }) <= need) || ab.hz) add(x, y); }
      break;
    }
    case 'empty': for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) { const d = mdist({ x, y }, u); if (d > 0 && d <= rng && canStopAt(B, u, x, y)) add(x, y); } break;
    default: break;
  }
  return out;
}
function scoreSummary(B, u, sum, C) {
  let s = 0;
  for (const uid in sum.dmg) {
    const v = C.units.find(x => x.uid === +uid), v0 = unitById(B, +uid); if (!v || !v0) continue;
    const real = Math.min(sum.dmg[uid], v0.hp + v0.shield);
    if (v.team !== u.team) s += real + (sum.kills.includes(+uid) ? 16 + v0.maxHp * 0.12 : 0) + (v.boss ? 0 : 0);
    else s -= real * 1.7 + (sum.kills.includes(+uid) ? 30 : 0);
  }
  s += sum.heal * 0.9 + sum.buffs * 4;
  return s;
}
function tileDanger(B, u, x, y) {
  let d = 0; if (u.flying) return 0;
  hzAt(B, x, y).forEach(z => { if (z.type === 'fire') d += 8; else if (z.type === 'electric') d += 9; else if (z.type === 'toxic') d += 6; else if (z.type === 'bomb') d += 7; });
  return d;
}
function aiChoose(B, u) {
  const foes = foesOf(B, u); if (!foes.length) return null;
  const R0 = reachable(B, u), cands = [];
  const usable = u.kit.filter(ab => !ab.ult && canUse(u, ab) && !(ab.special === 'summon' && alliesOf(B, u).length >= 5));
  let best = null;
  for (const k of R0.dist.keys()) {
    const [x, y] = k.split(',').map(Number);
    const near = foes.reduce((m, f) => Math.min(m, Math.abs(f.x - x) + Math.abs(f.y - y)), 99);
    let pos = -near * 1.2 - tileDanger(B, u, x, y);
    if (u.ai === 'kite') { const adj = foes.filter(f => Math.abs(f.x - x) + Math.abs(f.y - y) === 1).length; pos = -Math.abs(near - 3) * 1.6 - adj * 5 - tileDanger(B, u, x, y); }
    if (u.ai === 'support') { const al = alliesOf(B, u).filter(a => a !== u); const ad = al.length ? al.reduce((m, a) => Math.min(m, Math.abs(a.x - x) + Math.abs(a.y - y)), 99) : 0; pos = -Math.abs(near - 4) * 1.2 - ad * 0.8 - tileDanger(B, u, x, y); }
    const cand0 = { x, y, pos, ab: null, tgt: null, score: pos * 0.4 };
    if (!best || cand0.score > best.score) best = cand0;
    for (const ab of usable) {
      const C0 = cloneB(B); const cu = C0.units.find(q => q.uid === u.uid); cu.x = x; cu.y = y;
      for (const t of enumTargets(C0, cu, ab)) {
        if (!isLegalTarget(C0, cu, ab, t)) continue;
        const C = cloneB(C0), cu2 = C.units.find(q => q.uid === u.uid);
        const sum = useAbility(C, cu2, ab, t, [], true);
        const sc = scoreSummary(B, u, sum, C);
        if (sc <= 0.5 && ab.needFoe) continue;
        const score = sc + pos * 0.4 + R() * 1.2;
        if (!best || score > best.score) best = { x, y, pos, ab, tgt: t, score };
      }
    }
  }
  if (!best) return null;
  const path = (best.x === u.x && best.y === u.y) ? [] : pathTo(R0, u, best.x, best.y);
  return { path, ab: best.ab, tgt: best.tgt, x: best.x, y: best.y };
}
/* when nothing can be attacked this turn, advance toward the closest target */
function aiAdvance(B, u) {
  const foes = foesOf(B, u); if (!foes.length) return null;
  const R0 = reachable(B, u); let best = null;
  for (const k of R0.dist.keys()) { const [x, y] = k.split(',').map(Number); const near = foes.reduce((m, f) => Math.min(m, Math.abs(f.x - x) + Math.abs(f.y - y)), 99); const sc = -near - tileDanger(B, u, x, y) + R() * 0.3; if (!best || sc > best.sc) best = { x, y, sc }; }
  if (!best || (best.x === u.x && best.y === u.y)) return null;
  return { path: pathTo(R0, u, best.x, best.y), ab: null, tgt: null, x: best.x, y: best.y };
}
function moveUnitLogic(B, u, path, ev) {
  if (!path.length) return;
  const ctx = { B, u: null, ab: null, ev, dry: false, sum: { dmg: {}, kills: [], heal: 0, buffs: 0, push: {}, hits: 0 }, beat: 0 };
  const from = { x: u.x, y: u.y }; const last = path[path.length - 1];
  u.x = last.x; u.y = last.y;
  E(ctx, 'move', { u: u.uid, path: [from].concat(path) });
  ctx.beat = 1;
  hzAt(B, u.x, u.y).forEach(z => { if (u.alive && z.type !== 'ice' && z.type !== 'bomb') { applyHazardOn(ctx, u, z); ctx.beat++; } });
}

/* ---------- radio support ---------- */
function radioSupport(B, kind, targetUid, ev) {
  B.radioUsed = true;
  const ctx = { B, u: null, ab: null, ev, dry: false, sum: { dmg: {}, kills: [], heal: 0, buffs: 0, push: {}, hits: 0 }, beat: 0 };
  E(ctx, 'radio', { kind });
  ctx.beat = 1;
  if (kind === 'medevac') { const v = unitById(B, targetUid); if (v && v.alive) healUnit(ctx, v, v.maxHp * 0.45); }
  else if (kind === 'pep') B.units.filter(u => u.alive && u.team === 'hero').forEach(u => { u.hype = Math.min(100, u.hype + 35); E(ctx, 'fx', { u: u.uid, k: 'hype' }); });
  else if (kind === 'block') B.units.filter(u => u.alive && u.team === 'foe').forEach(u => { u.nextAct += 7; E(ctx, 'fx', { u: u.uid, k: 'delay', amt: 7 }); });
}

/* =====================================================================
   Headless sim: both sides use the AI. Used by the balance harness.
   ===================================================================== */
function simBattle(call, ids, maxTurns) {
  const B = newBattle(call, ids); let guard = 0;
  while (!B.over && guard++ < (maxTurns || 400)) {
    const u = nextUnit(B); if (!u) break;
    const ev = []; const st = beginTurn(B, u, ev);
    if (checkOver(B)) break;
    if (st === 'ok') {
      if (u.team === 'hero' && u.hype >= 100) { const ult = u.kit.find(a => a.ult); let bestU = null; for (const t of enumTargets(B, u, ult)) { if (!isLegalTarget(B, u, ult, t)) continue; const C = cloneB(B); const cu = C.units.find(q => q.uid === u.uid); const sum = useAbility(C, cu, ult, t, [], true); const sc = scoreSummary(B, u, sum, C); if (sc > 5 && (!bestU || sc > bestU.sc)) bestU = { t, sc }; } if (bestU) useAbility(B, u, ult, bestU.t, ev, false); }
      let plan = aiChoose(B, u);
      if (plan && plan.ab) { moveUnitLogic(B, u, plan.path, ev); useAbility(B, u, plan.ab, plan.tgt, ev, false); }
      else { const adv = aiAdvance(B, u); if (adv) moveUnitLogic(B, u, adv.path, ev); }
    }
    if (checkOver(B)) break;
    endTurn(B, u);
  }
  if (!B.over) { B.over = true; B.result = 'loss'; }
  return { B, sum: battleSummary(B) };
}
