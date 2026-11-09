// Paths anywhere on the map. The world is cut into 16 m tiles, each a grid
// of 0.5 m cells that can hold several walkable surfaces (the ground, a
// floor, a stair step, a loft), built from the collision boxes the first
// time someone needs to walk through it and rebuilt when something there
// changes (a wall built, a barricade torn down). Doors count as open
// (people open them on the way through); low fences can be vaulted; deep
// water and the edge of the map can't be crossed.
//
// A* runs over cells across tiles with a node budget; when the goal can't
// be reached (or the budget runs out) it returns the best partial path, so
// people at least get as close as the world allows. Paths are then pulled
// tight so people walk straight lines where they can and only turn at
// corners.
import { T } from '../world/terrain.js';

const RES = 0.5, TS = 32, TILE = RES * TS;
const RAD = 0.2; // clearance the grid keeps (1 m doorways on the 0.5 m grid stay two cells wide)
const BLOCK = new Set(['solid', 'prop', 'glass', 'fence', 'tree', 'car', 'roof', 'floor', 'stair', 'barricade', 'npcblock']);
const SURF = new Set(['floor', 'stair', 'walk']);
const STRIDE = 4096; // nodes per tile id
const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

class Tile {
  constructor(id, ti, tj) {
    this.id = id; this.ti = ti; this.tj = tj;
    this.x0 = ti * TILE; this.z0 = tj * TILE;
    this.first = new Int16Array(TS * TS).fill(-1);
    this.cnt = new Uint8Array(TS * TS);
    this.fence = new Uint8Array(TS * TS); // blocked at ground level only by a vaultable fence
    this.ys = null; this.cell = null; this.stair = null;
    this.stale = false;
    this.used = 0;
  }
}

export class WorldNav {
  constructor(game) {
    this.game = game;
    this.ph = game.physics;
    this.tiles = new Map();
    this.byId = [];
    this.q = [];
    this.builds = 0; this.searches = 0; this.frameBudget = 0;
    this.hook();
  }
  // when collision boxes come and go, the tiles under them are rebuilt
  hook() {
    const ph = this.ph, add = ph.add.bind(ph), remove = ph.remove.bind(ph), nav = this;
    ph.add = (box, owner) => { const r = add(box, owner); nav.touch(box); return r; };
    ph.remove = (box) => { nav.touch(box); return remove(box); };
  }
  touch(b) {
    if (!this.tiles.size || !b || !b.min || b.kind === 'door') return;
    if (!BLOCK.has(b.kind) && !SURF.has(b.kind)) return;
    const i0 = Math.floor((b.min[0] - 1) / TILE), i1 = Math.floor((b.max[0] + 1) / TILE);
    const j0 = Math.floor((b.min[2] - 1) / TILE), j1 = Math.floor((b.max[2] + 1) / TILE);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const t = this.tiles.get(key(i, j)); if (t) t.stale = true; }
  }
  // ---------------- tiles ----------------
  tile(ti, tj) {
    const k = key(ti, tj);
    let t = this.tiles.get(k);
    if (t && !t.stale) { t.used = this.searches; return t; }
    const id = t ? t.id : this.byId.length;
    t = new Tile(id, ti, tj);
    this.byId[id] = t;
    this.tiles.set(k, t);
    t.used = this.searches;
    this.build(t);
    return t;
  }
  build(t) {
    this.builds++;
    const ph = this.ph, ter = ph.terrain, q = this.q, P = T.play;
    const ys = [], cellOf = [], stair = [];
    for (let cj = 0; cj < TS; cj++) for (let ci = 0; ci < TS; ci++) {
      const c = cj * TS + ci;
      const x = t.x0 + (ci + 0.5) * RES, z = t.z0 + (cj + 0.5) * RES;
      if (x < P.x0 + 0.5 || x > P.x1 - 0.5 || z < P.z0 + 0.5 || z > P.z1 - 0.5) continue;
      const g = ter.height(x, z);
      const cand = g < T.water - 1.0 ? [] : [[g, 0]];
      ph.query(x - RAD, z - RAD, x + RAD, z + RAD, q);
      // anything you can stand on, as the physics sees it (entry steps,
      // porches, thresholds and floors as well as stairs)
      for (const b of q) {
        if (b.kind === 'glass' || b.kind === 'door' || b.noGround) continue;
        if (x < b.min[0] - 0.05 || x > b.max[0] + 0.05 || z < b.min[2] - 0.05 || z > b.max[2] + 0.05) continue;
        cand.push([b.max[1], b.kind === 'stair' ? 1 : 0]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      let last = -1e9, n = 0;
      for (const [y, isStair] of cand) {
        if (y - last < 0.3) { if (isStair && n) stair[stair.length - 1] = 1; continue; }
        let ok = true, onlyFence = true;
        for (const b of q) {
          if (!BLOCK.has(b.kind)) continue;
          if (b.max[1] <= y + 0.4 || b.min[1] >= y + 1.75) continue;
          if (x + RAD < b.min[0] || x - RAD > b.max[0] || z + RAD < b.min[2] || z - RAD > b.max[2]) continue;
          ok = false;
          if (b.kind !== 'fence' || b.max[1] > y + 1.4) onlyFence = false;
        }
        if (ok && ys.length < STRIDE - 1 && n < 4) {
          if (n === 0) t.first[c] = ys.length;
          ys.push(y); cellOf.push(c); stair.push(isStair); n++; last = y;
        } else if (!ok && onlyFence && y === g) t.fence[c] = 1;
      }
      t.cnt[c] = n;
    }
    t.ys = Float32Array.from(ys);
    t.cell = Uint16Array.from(cellOf);
    t.stair = Uint8Array.from(stair);
  }
  // node at global cell (gi, gj) closest to height y (within maxDy), or -1
  nodeAt(gi, gj, y, maxDy = 0.5) {
    const ti = Math.floor(gi / TS), tj = Math.floor(gj / TS);
    const t = this.tile(ti, tj);
    const c = (gj - tj * TS) * TS + (gi - ti * TS);
    const n = t.cnt[c];
    if (!n) return -1;
    let best = -1, bd = maxDy;
    for (let k = 0; k < n; k++) { const l = t.first[c] + k, d = Math.abs(t.ys[l] - y); if (d <= bd) { bd = d; best = t.id * STRIDE + l; } }
    return best;
  }
  isStair(id) { const t = this.byId[(id / STRIDE) | 0]; return t.stair[id % STRIDE] === 1; }
  // the neighbour a body can step to from a node at height y: up to 0.48 m,
  // or 0.75 m onto or off a staircase (cells span two treads)
  stepTo(gi, gj, y, fromStair) {
    const m = this.nodeAt(gi, gj, y, fromStair ? 0.75 : 0.48);
    if (m >= 0 || fromStair) return m;
    const s = this.nodeAt(gi, gj, y, 0.75);
    return s >= 0 && this.isStair(s) ? s : -1;
  }
  fenceAt(gi, gj) {
    const ti = Math.floor(gi / TS), tj = Math.floor(gj / TS);
    return this.tile(ti, tj).fence[(gj - tj * TS) * TS + (gi - ti * TS)] === 1;
  }
  info(id) {
    const t = this.byId[Math.floor(id / STRIDE)], l = id % STRIDE, c = t.cell[l];
    const gi = t.ti * TS + (c % TS), gj = t.tj * TS + Math.floor(c / TS);
    return { gi, gj, y: t.ys[l], x: (gi + 0.5) * RES, z: (gj + 0.5) * RES };
  }
  // nearest walkable node to a world point (searching outward a little)
  nearest(x, y, z, reach = 4) {
    const ci = Math.floor(x / RES), cj = Math.floor(z / RES);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= reach; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const id = this.nodeAt(ci + di, cj + dj, y, 1.6);
        if (id < 0) continue;
        const n = this.info(id);
        const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 2;
        if (d < bd) { bd = d; best = id; }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }
  // ---------------- search ----------------
  // walkable straight line between two points (sampled along the cells)
  lineClear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 60) return false;
    const n = Math.max(1, Math.ceil(d / 0.25));
    let y = a.y;
    for (let k = 1; k <= n; k++) {
      const u = k / n, x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
      const id = this.nodeAt(Math.floor(x / RES), Math.floor(z / RES), y, 0.6);
      if (id < 0) return false;
      y = this.byId[Math.floor(id / STRIDE)].ys[id % STRIDE];
    }
    return Math.abs(y - b.y) < 1.2;
  }
  // A* from a to b. Returns { pts: [{x,y,z,vault?}], partial } or null.
  // Arriving within opts.near metres of b counts (default 0.9).
  path(a, b, opts = {}) {
    this.searches++;
    const s = this.nearest(a.x, a.y, a.z, 3);
    if (s < 0) return null;
    const near = opts.near ?? 0.9;
    const ggi = Math.floor(b.x / RES), ggj = Math.floor(b.z / RES);
    const budget = opts.budget || 16000, W = opts.weight || 1.3;
    const byId = this.byId;
    // node decode without allocating: tile, local index -> global cell & y
    const decode = (id) => { const t = byId[(id / STRIDE) | 0], l = id % STRIDE, c = t.cell[l]; _gi = t.ti * TS + (c % TS); _gj = t.tj * TS + ((c / TS) | 0); _y = t.ys[l]; };
    let _gi = 0, _gj = 0, _y = 0;
    const H = (gi, gj, y) => { const dx = Math.abs(gi - ggi), dz = Math.abs(gj - ggj); return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * RES * W + Math.abs(y - b.y) * 0.5; };
    const gs = new Map(), from = new Map(), vault = new Set(), closed = new Set();
    const heap = new Heap();
    decode(s);
    const sx = (_gi + 0.5) * RES, sz = (_gj + 0.5) * RES, sy = _y;
    gs.set(s, 0); heap.push(s, H(_gi, _gj, _y));
    let best = s, bestD = Infinity, it = 0, found = -1;
    while (heap.size && it++ < budget) {
      const c = heap.pop();
      if (closed.has(c)) continue;
      closed.add(c);
      decode(c);
      const gi = _gi, gj = _gj, y = _y, gc = gs.get(c), st = this.isStair(c);
      const cx = (gi + 0.5) * RES, cz = (gj + 0.5) * RES;
      const dd = Math.hypot(cx - b.x, cz - b.z);
      if (dd <= near && Math.abs(y - b.y) < 1.3) { found = c; break; }
      if (dd + Math.abs(y - b.y) < bestD) { bestD = dd + Math.abs(y - b.y); best = c; }
      for (let q = 0; q < 8; q++) {
        const di = D8[q][0], dj = D8[q][1];
        let m = this.stepTo(gi + di, gj + dj, y, st);
        let cost = D8[q][2] * RES, jump = false;
        if (m >= 0 && di && dj && (this.stepTo(gi + di, gj, y, st) < 0 || this.stepTo(gi, gj + dj, y, st) < 0)) m = -1; // no cutting corners
        if (m < 0 && !(di && dj) && !opts.noVault && this.fenceAt(gi + di, gj + dj)) {
          // over a low fence: land two or three cells on
          for (let k = 2; k <= 3; k++) {
            if (k === 3 && !this.fenceAt(gi + di * 2, gj + dj * 2)) break;
            const l = this.nodeAt(gi + di * k, gj + dj * k, y, 0.7);
            if (l >= 0) { m = l; cost = k * RES + 2.5; jump = true; break; }
          }
        }
        if (m < 0 || closed.has(m)) continue;
        decode(m);
        const ng = gc + cost + Math.abs(_y - y) * 0.5;
        if (ng < (gs.get(m) ?? Infinity)) {
          gs.set(m, ng); from.set(m, c);
          if (jump) vault.add(m); else vault.delete(m);
          heap.push(m, ng + H(_gi, _gj, _y));
        }
      }
    }
    this.lastIters = it;
    const end = found >= 0 ? found : best;
    if (end === s && found < 0) return null;
    const raw = [];
    for (let c = end; c !== undefined && c !== s; c = from.get(c)) { decode(c); raw.push({ x: (_gi + 0.5) * RES, y: _y, z: (_gj + 0.5) * RES, vault: vault.has(c) }); }
    raw.reverse();
    if (found >= 0 && !raw.length) return { pts: [{ x: b.x, y: b.y, z: b.z }], partial: false };
    const pts = this.smooth({ x: sx, y: sy, z: sz }, raw);
    // finish on the exact spot when it's a step away in the open
    if (found >= 0) { const l = pts[pts.length - 1]; if (!l.vault && this.lineClear(l, b)) pts.push({ x: b.x, y: b.y, z: b.z }); }
    return { pts, partial: found < 0 };
  }
  // pull the path tight: keep only the corners, every vault landing and
  // the take-off point before it
  smooth(start, raw) {
    const out = [];
    let anchor = start, k = 0;
    while (k < raw.length) {
      if (raw[k].vault) { out.push(raw[k]); anchor = raw[k]; k++; continue; }
      let lim = raw.length - 1;
      for (let n = k; n < raw.length - 1; n++) if (raw[n + 1].vault) { lim = n; break; }
      let j = k;
      for (let n = k + 1; n <= lim && n < k + 80; n++) {
        if (this.lineClear(anchor, raw[n])) j = n;
        else if (n - j > 6) break;
      }
      out.push(raw[j]);
      anchor = raw[j];
      k = j + 1;
    }
    return out;
  }
  // drop tiles nobody has walked through in a while (memory)
  trim(max = 600) {
    if (this.tiles.size <= max) return;
    const all = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, t] of all.slice(0, this.tiles.size - max)) { this.tiles.delete(k); this.byId[t.id] = null; }
  }
}

function key(i, j) { return (i + 4096) * 8192 + (j + 4096); }

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v;
    K.push(k); V.push(v);
    let i = K.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (V[p] <= V[i]) break; [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p; }
  }
  pop() {
    const K = this.k, V = this.v, top = K[0], lk = K.pop(), lv = V.pop();
    if (K.length) {
      K[0] = lk; V[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < K.length && V[l] < V[m]) m = l;
        if (r < K.length && V[r] < V[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m;
      }
    }
    return top;
  }
}
export { TILE as NAV_TILE };
