// Structure layout from one module kit. Every place is generated in a local frame (gate at the
// bottom), then mapped to world tiles by a mirror/transpose so geometry stays identical.
import { HQ_SIZE, PLAZA, ARCHETYPES, HOUSE_SIZES, STYLES } from '../data/places.js';
import { RNG, hashStr } from '../core/rng.js';

export const C = { EMPTY: 0, WALL: 1, TOWER: 2, GATE: 3, STREET: 4, PLAZA: 5, BLD: 6, RES: 7, FENCE: 8, YARD: 9, OBST: 10, WATER: 11, LANE: 12 };
const isStreetCode = (v) => v === C.STREET || v === C.PLAZA || v === C.GATE || v === C.YARD || v === C.LANE;

class Grid {
  constructor(W, H) { this.W = W; this.H = H; this.c = new Uint8Array(W * H); this.f = new Array(W * H).fill(null); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  get(x, y) { return this.in(x, y) ? this.c[y * this.W + x] : C.WALL; }
  set(x, y, v, floor) { if (this.in(x, y)) { this.c[y * this.W + x] = v; if (floor !== undefined) this.f[y * this.W + x] = floor; } }
  rect(x, y, w, h, v, floor, onlyIf) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!onlyIf || onlyIf(this.get(i, j))) this.set(i, j, v, floor);
  }
}

// Local -> world transforms. Gate side decides the frame; S is identity.
export function makeTransform(gate, x0, y0, W, H) {
  switch (gate) {
    case 'N': return { pt: (x, y) => [x0 + x, y0 + (H - 1 - y)], dir: { N: 'S', S: 'N', E: 'E', W: 'W' } };
    case 'E': return { pt: (x, y) => [x0 + y, y0 + x], dir: { N: 'W', S: 'E', E: 'S', W: 'N' } };
    case 'W': return { pt: (x, y) => [x0 + (H - 1 - y), y0 + x], dir: { N: 'E', S: 'W', E: 'S', W: 'N' } };
    default: return { pt: (x, y) => [x0 + x, y0 + y], dir: { N: 'N', S: 'S', E: 'E', W: 'W' } };
  }
}

function localDims(p) { return p.gate === 'E' || p.gate === 'W' ? [p.h, p.w] : [p.w, p.h]; }

// ---------- building placement (setback packer) ----------
function canPlace(g, x, y, w, h) {
  if (x < 1 || y < 1 || x + w > g.W - 1 || y + h > g.H - 1) return false;
  for (let j = y - 1; j <= y + h; j++) {
    for (let i = x - 1; i <= x + w; i++) {
      const v = g.get(i, j);
      const inside = i >= x && i < x + w && j >= y && j < y + h;
      if (inside ? v !== C.EMPTY : v !== C.EMPTY && v !== C.RES && v !== C.LANE) return false;
    }
  }
  return true;
}

function frontage(g, x, y, w, h) {
  const s = { N: [], S: [], W: [], E: [] };
  const ok = (near, far) => near === C.LANE || (near !== C.BLD && near !== C.OBST && isStreetCode(far));
  for (let i = x + 1; i < x + w - 1; i++) {
    if (ok(g.get(i, y - 1), g.get(i, y - 2))) s.N.push(i);
    if (ok(g.get(i, y + h), g.get(i, y + h + 1))) s.S.push(i);
  }
  for (let j = y + 1; j < y + h - 1; j++) {
    if (ok(g.get(x - 1, j), g.get(x - 2, j))) s.W.push(j);
    if (ok(g.get(x + w, j), g.get(x + w + 1, j))) s.E.push(j);
  }
  return s;
}

function chooseDoor(b, fr) {
  const order = ['S', 'E', 'W', 'N'];
  let best = null;
  for (const side of order) if (fr[side].length && (!best || fr[side].length > fr[best].length)) best = side;
  if (!best) return null;
  const list = fr[best];
  const mid = best === 'N' || best === 'S' ? b.x + (b.w - 1) / 2 : b.y + (b.h - 1) / 2;
  const c = list.reduce((a, v) => (Math.abs(v - mid) < Math.abs(a - mid) ? v : a), list[0]);
  if (best === 'N') return { x: c, y: b.y, f: 'N' };
  if (best === 'S') return { x: c, y: b.y + b.h - 1, f: 'S' };
  if (best === 'W') return { x: b.x, y: c, f: 'W' };
  return { x: b.x + b.w - 1, y: c, f: 'E' };
}

function commitBuilding(g, b) {
  g.rect(b.x - 1, b.y - 1, b.w + 2, b.h + 2, C.RES, undefined, (v) => v === C.EMPTY);
  g.rect(b.x, b.y, b.w, b.h, C.BLD);
}

function placeBest(g, sizes, score) {
  let best = null;
  for (const [a, d] of sizes) {
    for (const [w, h] of a === d ? [[a, d]] : [[a, d], [d, a]]) {
      for (let y = 1; y < g.H - h; y++) {
        for (let x = 1; x < g.W - w; x++) {
          if (!canPlace(g, x, y, w, h)) continue;
          const fr = frontage(g, x, y, w, h);
          const door = chooseDoor({ x, y, w, h }, fr);
          if (!door) continue;
          const sc = score(x, y, w, h, door);
          if (!best || sc < best.sc) best = { x, y, w, h, door, sc };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function shrinkSizes([a, d]) {
  const out = [[a, d]];
  if (a > 5) out.push([a - 1, d]);
  if (d > 4) out.push([a, d - 1]);
  if (a > 5 && d > 4) out.push([a - 1, d - 1]);
  out.push([5, 4], [4, 4]);
  return out;
}

// ---------- settlement template ----------
function genSettlement(p) {
  const [W, H] = localDims(p);
  const g = new Grid(W, H);
  const style = STYLES[p.palette];
  const cx = Math.floor(W / 2);
  const buildings = [];
  const props = [];
  // Perimeter wall, corner watchtowers, gate on the main axis.
  g.rect(0, 0, W, H, C.WALL);
  g.rect(1, 1, W - 2, H - 2, C.EMPTY);
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) g.set(x, y, C.TOWER);
  for (let d = -1; d <= 1; d++) g.set(cx + d, H - 1, C.GATE, style.street);
  // 1-wide service lane ring (second approach route to the vault).
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (x === 1 || x === W - 2 || y === 1 || y === H - 2) g.set(x, y, C.LANE, style.lane);
  }
  // HQ / vault at the far end of the main street.
  const [hw, hd] = HQ_SIZE[p.size];
  const hq = { x: cx - Math.floor(hw / 2), y: 3, w: hw, h: hd, role: 'hq', name: p.hq.name, hq: true };
  hq.doors = [{ x: cx, y: hq.y + hd - 1, f: 'S' }, { x: cx, y: hq.y, f: 'N' }];
  commitBuilding(g, hq);
  buildings.push(hq);
  // Main street from gate to HQ.
  for (let y = hq.y + hd + 1; y < H - 1; y++) for (let d = -1; d <= 1; d++) g.set(cx + d, y, C.STREET, style.street);
  // Plaza (market) and cross street.
  const [pw, pd, cross] = PLAZA[p.size];
  const top = hq.y + hd + 2, bottom = H - 4;
  const py = Math.round(top + (bottom - top) * 0.45);
  const plaza = { x: cx - Math.floor(pw / 2), y: py - Math.floor(pd / 2), w: pw, h: pd };
  if (cross) for (let x = 1; x < W - 1; x++) for (let d = -1; d <= 1; d++) if (g.get(x, py + d) === C.EMPTY) g.set(x, py + d, C.STREET, style.street);
  g.rect(plaza.x, plaza.y, plaza.w, plaza.h, C.PLAZA, style.plaza, (v) => v === C.EMPTY || v === C.STREET);
  // Named buildings, then lots for sale, then houses.
  // Priority: civic/commercial buildings, then business lots, then barracks (guards also use posts).
  const named = p.buildings.map(([role, name]) => ({ role, name }));
  const want = named.filter((w) => w.role !== 'barracks');
  for (let i = 0; i < (p.lots || 0); i++) want.push({ role: 'lot', name: 'Vacant Lot', lot: true });
  want.push(...named.filter((w) => w.role === 'barracks'));
  const pcx = plaza.x + plaza.w / 2, pcy = plaza.y + plaza.h / 2;
  for (const wb of want) {
    const arch = ARCHETYPES[wb.role];
    const near = wb.role === 'barracks' ? [cx, H - 3] : [pcx, pcy];
    const found = placeBest(g, shrinkSizes(arch.size), (x, y, w, h) => Math.hypot(x + w / 2 - near[0], y + h / 2 - near[1]) - w * h * 0.05);
    if (!found) continue;
    const b = { x: found.x, y: found.y, w: found.w, h: found.h, role: wb.role, name: wb.name, lot: !!wb.lot, doors: [found.door] };
    commitBuilding(g, b);
    buildings.push(b);
  }
  for (let guard = 0; guard < 60; guard++) {
    const found = placeBest(g, HOUSE_SIZES, (x, y) => y * W + x);
    if (!found) break;
    const b = { x: found.x, y: found.y, w: found.w, h: found.h, role: 'house', name: 'House', doors: [found.door] };
    commitBuilding(g, b);
    buildings.push(b);
  }
  decorateSettlement(g, p, buildings, props, plaza, cx);
  const spawns = settlementSpawns(g, p, buildings, plaza, cx);
  return { g, W, H, buildings, props, plaza, spawns, gateLocal: { x: cx, y: H - 1 } };
}

function decorateSettlement(g, p, buildings, props, plaza, cx) {
  const rng = new RNG(hashStr(p.id + ':props'));
  const W = g.W, H = g.H;
  const doorFront = new Set();
  for (const b of buildings) for (const d of b.doors) { const [ox, oy] = outside(d); doorFront.add(ox + ',' + oy); }
  const free = (x, y) => (g.get(x, y) === C.RES || g.get(x, y) === C.EMPTY) && !doorFront.has(x + ',' + y) && !isNearDoor(buildings, x, y) && !blocksPassage(g, x, y);
  // Street lamps along the main street, alternating sides.
  for (let y = H - 4; y > 6; y -= 4) {
    const side = ((H - y) / 4) % 2 ? -2 : 2;
    if (free(cx + side, y)) { props.push({ x: cx + side, y, type: 'lamp' }); g.set(cx + side, y, C.OBST); }
  }
  // Market stalls ring the plaza; a well in the middle.
  const clearOfDoors = (x, y) => !buildings.some((b) => b.doors.some((d) => { const [ox, oy] = outside(d); return Math.abs(ox - x) + Math.abs(oy - y) <= 2; }));
  const stallSpots = [];
  for (let i = plaza.x + 1; i < plaza.x + plaza.w - 1; i += 3) {
    if (Math.abs(i - cx) > 1) stallSpots.push([i, plaza.y], [i, plaza.y + plaza.h - 1]);
  }
  stallSpots.filter(([x, y]) => clearOfDoors(x, y)).slice(0, Math.max(2, Math.floor(plaza.w / 3))).forEach(([x, y], k) => {
    props.push({ x, y, type: 'stall', variant: k, market: k === 0 });
    g.set(x, y, C.OBST);
  });
  const wellX = plaza.x + 1, wellY = plaza.y + Math.floor(plaza.h / 2);
  if (g.get(wellX, wellY) === C.PLAZA && clearOfDoors(wellX, wellY)) { props.push({ x: wellX, y: wellY, type: 'well' }); g.set(wellX, wellY, C.OBST); }
  const benchX = plaza.x + plaza.w - 2;
  if (g.get(benchX, wellY) === C.PLAZA && clearOfDoors(benchX, wellY)) { props.push({ x: benchX, y: wellY, type: 'bench' }); g.set(benchX, wellY, C.OBST); }
  // Banners flank the gate on the wall; job board inside the gate.
  props.push({ x: cx - 2, y: H - 1, type: 'banner', onWall: true }, { x: cx + 2, y: H - 1, type: 'banner', onWall: true });
  // Crates and barrels beside some buildings.
  for (const b of buildings) {
    if (b.role === 'house' && !rng.chance(0.35)) continue;
    const spots = [[b.x - 1, b.y + b.h - 1], [b.x + b.w, b.y + b.h - 1], [b.x - 1, b.y], [b.x + b.w, b.y]];
    for (const [x, y] of spots) {
      if (free(x, y) && !blocksPassage(g, x, y)) {
        props.push({ x, y, type: rng.chance(0.5) ? 'crates' : 'barrel' });
        g.set(x, y, C.OBST);
        break;
      }
    }
  }
}

function isNearDoor(buildings, x, y) {
  for (const b of buildings) for (const d of b.doors) {
    const [ox, oy] = outside(d);
    if (Math.abs(ox - x) + Math.abs(oy - y) <= 1) return true;
  }
  return false;
}

// A prop must not sit in a corridor (blocked on both sides of either axis).
function blocksPassage(g, x, y) {
  const pass = (i, j) => { const v = g.get(i, j); return v === C.RES || v === C.EMPTY || isStreetCode(v); };
  return (!pass(x - 1, y) && !pass(x + 1, y)) || (!pass(x, y - 1) && !pass(x, y + 1));
}

function localConnected(g, starts, targets) {
  const pass = (v) => v === C.YARD || v === C.STREET || v === C.PLAZA || v === C.GATE || v === C.RES || v === C.EMPTY || v === C.LANE;
  const seen = new Uint8Array(g.W * g.H);
  const stack = [];
  for (const [x, y] of starts) if (g.in(x, y) && pass(g.get(x, y))) { seen[y * g.W + x] = 1; stack.push([x, y]); }
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!g.in(nx, ny) || seen[ny * g.W + nx] || !pass(g.get(nx, ny))) continue;
      seen[ny * g.W + nx] = 1; stack.push([nx, ny]);
    }
  }
  return targets.every(([x, y]) => g.in(x, y) && seen[y * g.W + x]);
}

export function outside(d) {
  const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[d.f];
  return [d.x + v[0], d.y + v[1]];
}

function settlementSpawns(g, p, buildings, plaza, cx) {
  const H = g.H, W = g.W;
  const hq = buildings[0];
  const guards = [];
  guards.push({ x: cx - 2, y: H - 2, post: true }, { x: cx + 2, y: H - 2, post: true });
  guards.push({ x: cx, y: hq.y + hq.h + 1, post: true });
  guards.push({ x: cx, y: hq.y + 1, inside: true });
  const patrolMain = [[cx, H - 3], [cx, plaza.y + plaza.h + 1], [cx, hq.y + hq.h + 2]];
  const patrolRing = [[1, H - 2], [1, 1], [W - 2, 1], [W - 2, H - 2]];
  const snipers = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
  const folk = [];
  for (let i = plaza.x; i < plaza.x + plaza.w; i++) for (let j = plaza.y; j < plaza.y + plaza.h; j++) if (g.get(i, j) === C.PLAZA && (i + j) % 3 === 0) folk.push([i, j]);
  const market = { x: plaza.x + Math.floor(plaza.w / 2), y: plaza.y + Math.floor(plaza.h / 2) };
  return { guards, patrols: [patrolMain, patrolRing], snipers, folk, market, vault: { x: cx, y: hq.y + 1 } };
}

// ---------- camps: compact palisade compound ----------
function genCamp(p) {
  const [W, H] = localDims(p);
  const g = new Grid(W, H);
  const style = STYLES[p.palette];
  const cx = Math.floor(W / 2);
  g.rect(0, 0, W, H, C.WALL);
  g.rect(1, 1, W - 2, H - 2, C.YARD, style.plaza);
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) g.set(x, y, C.TOWER);
  for (let d = -1; d <= 1; d++) g.set(cx + d, H - 1, C.GATE, style.street);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (x === 1 || x === W - 2 || y === 1) g.set(x, y, C.STREET, style.lane);
  const hw = 7, hd = 4;
  const hq = { x: cx - 3, y: 2, w: hw, h: hd, role: 'hq', name: p.hq.name, hq: true, doors: [{ x: cx, y: 2 + hd - 1, f: 'S' }, { x: cx, y: 2, f: 'N' }] };
  g.rect(hq.x, hq.y, hw, hd, C.BLD);
  const bw = 4, bh = 3, by = 2 + hd + 1;
  const left = { x: 2, y: by, w: bw, h: bh, role: p.buildings[0][0], name: p.buildings[0][1], doors: [{ x: 2 + bw - 1, y: by + 1, f: 'E' }] };
  const right = { x: W - 2 - bw, y: by, w: bw, h: bh, role: p.buildings[1][0], name: p.buildings[1][1], doors: [{ x: W - 2 - bw, y: by + 1, f: 'W' }] };
  for (const b of [left, right]) g.rect(b.x, b.y, b.w, b.h, C.BLD);
  const props = [
    { x: 2, y: H - 2, type: 'fire' }, { x: W - 3, y: H - 2, type: 'crates' },
    { x: cx + 2, y: H - 1, type: 'banner', onWall: true }, { x: cx - 2, y: H - 1, type: 'banner', onWall: true },
  ];
  for (const pr of props) if (!pr.onWall) g.set(pr.x, pr.y, C.OBST);
  const spawns = {
    guards: [{ x: cx - 1, y: H - 2, post: true }, { x: cx + 1, y: H - 2, post: true }, { x: cx, y: hq.y + 1, inside: true }, { x: 3, y: 1, post: true }],
    patrols: [[[1, H - 2], [1, 1], [W - 2, 1], [W - 2, H - 2]]],
    snipers: [[0, 0], [W - 1, 0]], folk: [], market: null, vault: { x: cx, y: hq.y + 1 }, boss: { x: cx, y: hq.y + 2 },
  };
  return { g, W, H, buildings: [hq, left, right], props, plaza: null, spawns, gateLocal: { x: cx, y: H - 1 } };
}

// ---------- ruins: broken fence, collapsed shells, loot ----------
function genRuin(p) {
  const W = p.w, H = p.h;
  const g = new Grid(W, H);
  const rng = new RNG(hashStr(p.id));
  g.rect(0, 0, W, H, C.YARD, 'rubblefloor');
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (rng.chance(0.55)) g.set(x, y, C.FENCE);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (rng.chance(0.55)) g.set(x, y, C.FENCE);
  // Guaranteed opening on the access side.
  const open = { N: [[Math.floor(W / 2) - 2, 0, 5, 1]], S: [[Math.floor(W / 2) - 2, H - 1, 5, 1]], W: [[0, Math.floor(H / 2) - 2, 1, 5]], E: [[W - 1, Math.floor(H / 2) - 2, 1, 5]] }[p.open];
  for (const [x, y, w, h] of open) g.rect(x, y, w, h, C.YARD);
  const buildings = [];
  const sw = W >= 14 ? 5 : 4;
  const shells = H >= 12 ? [[2, 2, sw, 4], [W - 2 - sw, 2, sw, 4], [Math.floor(W / 2) - 2, H - 5, 4, 3]] : [[2, 2, sw, 4], [W - 2 - sw, H - 6, sw, 4]];
  for (const [x, y, w, h] of shells) {
    const b = { x, y, w, h, role: 'ruin', name: 'Ruined Shell', ruined: true };
    const cxDoor = x + Math.floor(w / 2);
    b.doors = [{ x: cxDoor, y: y + h - 1, f: 'S' }];
    g.rect(x, y, w, h, C.BLD);
    buildings.push(b);
  }
  const props = [];
  const loot = [];
  // Every random prop must keep doors and loot reachable from the access gap.
  const entry = open[0];
  const starts = [];
  for (let j = entry[1]; j < entry[1] + entry[3]; j++) for (let i = entry[0]; i < entry[0] + entry[2]; i++) starts.push([i, j]);
  const targets = buildings.map((b) => outside(b.doors[0]));
  const tryPut = (x, y, code) => {
    if (g.get(x, y) !== C.YARD || isNearDoor(buildings, x, y)) return false;
    g.set(x, y, code);
    if (!localConnected(g, starts, targets)) { g.set(x, y, C.YARD); return false; }
    return true;
  };
  for (const b of buildings) loot.push({ x: b.x + 1, y: b.y + 1, tier: p.tier });
  for (let k = 0; k < 4 + p.tier; k++) {
    const x = rng.int(1, W - 2), y = rng.int(1, H - 2);
    if (tryPut(x, y, C.OBST)) props.push({ x, y, type: rng.pick(['rubble', 'wreck', 'tires', 'rubble']) });
  }
  const yardLoot = [];
  for (let k = 0; k < 2; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
      if (tryPut(x, y, C.OBST)) { yardLoot.push({ x, y, tier: p.tier }); targets.push([x - 1, y]); break; }
    }
  }
  const dens = [[Math.floor(W / 2), Math.floor(H / 2)], [W - 3, H - 3], [2, H - 3]];
  return { g, W, H, buildings, props, plaza: null, spawns: { dens, loot: [...loot, ...yardLoot], entrance: open[0] }, gateLocal: null, ruin: true };
}

// ---------- Crossroads market: four entrances, stalls around a plaza ----------
function genMarket(p) {
  const W = p.w, H = p.h;
  const g = new Grid(W, H);
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  g.rect(0, 0, W, H, C.FENCE);
  g.rect(1, 1, W - 2, H - 2, C.PLAZA, 'cobble');
  for (let d = -1; d <= 1; d++) { g.set(cx + d, 0, C.GATE, 'dirtfloor'); g.set(cx + d, H - 1, C.GATE, 'dirtfloor'); g.set(0, cy + d, C.GATE, 'dirtfloor'); g.set(W - 1, cy + d, C.GATE, 'dirtfloor'); }
  const fixer = { x: 2, y: 2, w: 5, h: 4, role: 'fixer', name: "Fixer's Shack", doors: [{ x: 4, y: 5, f: 'S' }] };
  const tavern = { x: W - 7, y: 2, w: 5, h: 4, role: 'tavern', name: 'The Crossing Tent', doors: [{ x: W - 5, y: 5, f: 'S' }] };
  for (const b of [fixer, tavern]) g.rect(b.x, b.y, b.w, b.h, C.BLD);
  const stalls = [
    { x: 3, y: H - 4, npc: 'mags', label: "Mags' Stall" },
    { x: 6, y: H - 4, npc: 'blueprints', label: 'Blueprint Dealer' },
    { x: W - 4, y: H - 4, npc: 'smuggler', label: 'Bulk Smuggler' },
    { x: W - 7, y: H - 4, npc: 'armsbroker', label: 'Arms Broker' },
    { x: 3, y: cy, npc: 'seeds', label: 'Seed Vendor' },
    { x: W - 4, y: cy, npc: 'materials', label: 'Scrap Trader' },
  ];
  const props = stalls.map((s, k) => ({ x: s.x, y: s.y, type: 'stall', variant: k + 2, npc: s.npc }));
  props.push({ x: cx - 2, y: cy - 2, type: 'jobboard' }, { x: cx + 2, y: cy + 2, type: 'lamp' }, { x: cx - 2, y: cy + 2, type: 'lamp' }, { x: cx + 2, y: cy - 2, type: 'fire' });
  for (const pr of props) g.set(pr.x, pr.y, C.OBST);
  const spawns = { vendors: stalls.map((s) => ({ npc: s.npc, label: s.label, x: s.x, y: s.y + 1 })), folk: [[cx, cy], [cx - 3, cy + 1], [cx + 3, cy - 1]], fixer: { x: 4, y: 6 } };
  return { g, W, H, buildings: [fixer, tavern], props, plaza: { x: 1, y: 1, w: W - 2, h: H - 2 }, spawns, gateLocal: { x: cx, y: H - 1 } };
}

// ---------- The Hollow: hand-authored depot yard + 6x6 build grid ----------
export const HOLLOW_GRID = { x: 9, y: 12, cell: 2, step: 3, n: 6 };

function genHollow(p) {
  const W = p.w, H = p.h;
  const g = new Grid(W, H);
  g.rect(0, 0, W, H, C.WALL);
  g.rect(1, 1, W - 2, H - 2, C.YARD, 'dirtfloor');
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) g.set(x, y, C.TOWER);
  // Local frame here is already world-oriented (gate N at top); transform 'S' keeps it.
  for (let d = 17; d <= 19; d++) g.set(d, 0, C.GATE, 'dirtfloor');
  for (const x of [4, 5]) g.set(x, H - 1, C.GATE, 'rail');
  g.rect(17, 1, 3, 9, C.STREET, 'dirtfloor');
  g.rect(2, 9, W - 4, 2, C.STREET, 'dirtfloor');
  const depot = { x: 3, y: 2, w: 12, h: 6, role: 'depot', name: 'The Old Depot', doors: [{ x: 8, y: 7, f: 'S' }] };
  const garage = { x: 27, y: 3, w: 6, h: 5, role: 'garage', name: 'Vehicle Shed', doors: [{ x: 29, y: 7, f: 'S' }] };
  for (const b of [depot, garage]) g.rect(b.x, b.y, b.w, b.h, C.BLD);
  // Rail spur: enters through the south wall, runs up the west yard.
  for (let y = 12; y < H - 1; y++) for (const x of [4, 5]) g.set(x, y, C.YARD, 'rail');
  // Build grid floor: concrete paths.
  const G = HOLLOW_GRID;
  g.rect(G.x - 1, G.y - 1, G.step * G.n + 1, G.step * G.n + 1, C.YARD, 'concrete');
  const props = [
    { x: 22, y: 2, type: 'watertower' }, { x: 4, y: 16, type: 'boxcar' },
    { x: 2, y: 13, type: 'scrap' }, { x: 2, y: 20, type: 'compost' },
    { x: 16, y: 1, type: 'lamp' }, { x: 20, y: 1, type: 'lamp' }, { x: 16, y: 8, type: 'lamp' },
    { x: 30, y: 14, type: 'dummy' }, { x: 32, y: 14, type: 'dummy' }, { x: 30, y: 20, type: 'sandbags' }, { x: 31, y: 20, type: 'sandbags' },
    { x: 7, y: 29, type: 'lamp' }, { x: 28, y: 28, type: 'lamp' }, { x: 15, y: 0, type: 'banner', onWall: true }, { x: 21, y: 0, type: 'banner', onWall: true },
  ];
  for (const pr of props) if (!pr.onWall) {
    if (pr.type === 'watertower') g.rect(pr.x, pr.y, 3, 3, C.OBST);
    else if (pr.type === 'boxcar') g.rect(pr.x, pr.y, 2, 4, C.OBST);
    else g.set(pr.x, pr.y, C.OBST);
  }
  const cells = [];
  for (let j = 0; j < G.n; j++) for (let i = 0; i < G.n; i++) cells.push({ i, j, x: G.x + i * G.step, y: G.y + j * G.step });
  const spawns = { mags: { x: 10, y: 10 }, stash: { x: 5, y: 4 }, parking: { x: 2, y: 25 }, crew: [[24, 11], [12, 11], [28, 24], [7, 24]], defend: [[18, 2], [13, 11], [23, 11]] };
  return { g, W, H, buildings: [depot, garage], props, plaza: null, spawns, gateLocal: { x: 18, y: 0 }, cells };
}

// ---------- public: generate any place, return world-space records ----------
export function generatePlace(p) {
  let L;
  if (p.kind === 'settlement') L = genSettlement(p);
  else if (p.kind === 'camp') L = genCamp(p);
  else if (p.kind === 'ruin') L = genRuin(p);
  else if (p.kind === 'market') L = genMarket(p);
  else L = genHollow(p);
  const frame = p.kind === 'settlement' || p.kind === 'camp' ? p.gate : 'S';
  const tf = makeTransform(frame, p.at[0], p.at[1], L.W, L.H);
  return toWorld(p, L, tf);
}

function mapRect(tf, r) {
  const [ax, ay] = tf.pt(r.x, r.y);
  const [bx, by] = tf.pt(r.x + r.w - 1, r.y + r.h - 1);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1 };
}

function toWorld(p, L, tf) {
  const style = STYLES[p.palette];
  const cells = [];
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    const code = L.g.get(x, y);
    const [wx, wy] = tf.pt(x, y);
    cells.push({ x: wx, y: wy, code, floor: L.g.f[y * L.W + x] });
  }
  const pt = (o) => { const [x, y] = tf.pt(o.x, o.y); return { ...o, x, y }; };
  const pa = (a) => { const [x, y] = tf.pt(a[0], a[1]); return [x, y]; };
  const buildings = L.buildings.map((b, k) => {
    const r = mapRect(tf, b);
    const arch = ARCHETYPES[b.role] || ARCHETYPES.house;
    return {
      ...r, role: b.role, name: b.name, hq: !!b.hq, lot: !!b.lot, ruined: !!b.ruined, place: p.id, idx: k,
      doors: b.doors.map((d) => ({ ...pt(d), f: tf.dir[d.f] })),
      floor: b.role === 'hq' ? 'tile' : arch.floor, roof: b.ruined ? 'collapsed' : style.roof, style: p.palette, sign: arch.sign, lamp: arch.lamp,
      propsWanted: arch.props,
    };
  });
  const props = L.props.map((o) => pt(o));
  const sp = L.spawns || {};
  const spawns = {};
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) spawns[k] = v.map((e) => (Array.isArray(e) ? (Array.isArray(e[0]) ? e.map(pa) : pa(e)) : (e && typeof e === 'object' && 'x' in e ? pt(e) : e)));
    else if (v && typeof v === 'object' && 'x' in v) spawns[k] = pt(v);
    else spawns[k] = v;
  }
  if (sp.patrols) spawns.patrols = sp.patrols.map((route) => route.map(pa));
  if (sp.entrance) { const r = mapRect(tf, { x: sp.entrance[0], y: sp.entrance[1], w: sp.entrance[2], h: sp.entrance[3] }); spawns.entrance = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) }; }
  const out = { id: p.id, place: p, box: { x: p.at[0], y: p.at[1], w: p.w, h: p.h }, cells, buildings, props, spawns, style };
  if (L.plaza) out.plaza = mapRect(tf, L.plaza);
  if (L.gateLocal) { const [gx, gy] = tf.pt(L.gateLocal.x, L.gateLocal.y); out.gate = { x: gx, y: gy }; }
  if (L.cells) out.gridCells = L.cells.map((c) => ({ ...c, ...pt(c) }));
  return out;
}
