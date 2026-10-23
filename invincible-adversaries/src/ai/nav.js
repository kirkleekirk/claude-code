import * as THREE from 'three';
import { ARENA, terrainY } from '../world/arena.js';

// Ground navigation for bots: a walkability grid over the map (a cell is open when a hero-sized
// body standing there at ground level wouldn't be inside a wall or a piece of cover), A* across
// it, and the path pulled tight so they walk in straight lines rather than stair-stepping.
const CS = 1.5; // m per cell

export class NavGrid {
  constructor(world) {
    this.w = world;
    const r = ARENA.rect || { minX: -ARENA.boundR, maxX: ARENA.boundR, minZ: -ARENA.boundR, maxZ: ARENA.boundR };
    this.x0 = r.minX; this.z0 = r.minZ;
    this.nx = Math.ceil((r.maxX - r.minX) / CS); this.nz = Math.ceil((r.maxZ - r.minZ) / CS);
    const N = this.nx * this.nz;
    this.open = new Uint8Array(N);
    const p = new THREE.Vector3();
    // (the map's own walls and cover only: moving things like the payload are left out)
    const dyn = world.dynamic; world.dynamic = [];
    for (let k = 0; k < this.nz; k++) for (let i = 0; i < this.nx; i++) {
      const x = this.x0 + (i + 0.5) * CS, z = this.z0 + (k + 0.5) * CS;
      if (!ARENA.rect && Math.hypot(x, z) > ARENA.boundR - 1) continue;
      p.set(x, terrainY(x, z), z);
      this.open[k * this.nx + i] = world.blocked(p, 0.55) ? 0 : 1;
    }
    world.dynamic = dyn;
    // steep ground (the crater's walls where it's not graded) costs more to climb
    this.cost = new Float32Array(N).fill(1);
    if (ARENA.terrain) for (let k = 0; k < this.nz; k++) for (let i = 0; i < this.nx; i++) {
      const x = this.x0 + (i + 0.5) * CS, z = this.z0 + (k + 0.5) * CS;
      const s = Math.hypot(terrainY(x + 0.7, z) - terrainY(x - 0.7, z), terrainY(x, z + 0.7) - terrainY(x, z - 0.7)) / 1.4;
      if (s > 0.35) this.cost[k * this.nx + i] = 1 + (s - 0.35) * 6;
    }
    this.g = new Float32Array(N); this.from = new Int32Array(N); this.seen = new Uint32Array(N); this.pass = 0;
    this.heap = new BinaryHeap(N * 4);
  }
  cell(x, z) { return [Math.floor((x - this.x0) / CS), Math.floor((z - this.z0) / CS)]; }
  idx(i, k) { return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -1 : k * this.nx + i; }
  isOpen(i, k) { const j = this.idx(i, k); return j >= 0 && this.open[j] === 1; }
  /** the nearest open cell to (x, z), searching outward a few rings */
  nearestOpen(x, z, rings = 6) {
    const [ci, ck] = this.cell(x, z);
    if (this.isOpen(ci, ck)) return [ci, ck];
    for (let r = 1; r <= rings; r++) {
      let best = null, bd = Infinity;
      for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dk)) !== r || !this.isOpen(ci + di, ck + dk)) continue;
        const d = di * di + dk * dk;
        if (d < bd) { bd = d; best = [ci + di, ck + dk]; }
      }
      if (best) return best;
    }
    return null;
  }
  center(i, k) { const x = this.x0 + (i + 0.5) * CS, z = this.z0 + (k + 0.5) * CS; return new THREE.Vector3(x, terrainY(x, z), z); }
  /** can a body walk the straight line a-b over open cells? */
  walkable(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (CS * 0.5));
    for (let s = 0; s <= n; s++) {
      const t = s / Math.max(1, n), [i, k] = this.cell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!this.isOpen(i, k)) return false;
    }
    return true;
  }
  /** a path of waypoints from a to b (Vector3s at ground height), or null */
  find(a, b, maxIter = 24000) {
    const s = this.nearestOpen(a.x, a.z), e = this.nearestOpen(b.x, b.z, 10);
    if (!s || !e) return null;
    const nx = this.nx, si = this.idx(s[0], s[1]), ei = this.idx(e[0], e[1]);
    if (si === ei) return [this.center(e[0], e[1])];
    const pass = ++this.pass, G = this.g, F = this.from, S = this.seen, H = this.heap;
    H.clear();
    const hx = (j) => { const i = j % nx, k = (j / nx) | 0; const di = Math.abs(i - e[0]), dk = Math.abs(k - e[1]); return (Math.max(di, dk) + 0.414 * Math.min(di, dk)); };
    G[si] = 0; F[si] = -1; S[si] = pass;
    H.push(si, hx(si));
    let found = false, it = 0;
    while (H.size && it++ < maxIter) {
      const j = H.pop();
      if (j === ei) { found = true; break; }
      const i = j % nx, k = (j / nx) | 0, gj = G[j];
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue;
        const ni = i + di, nk = k + dk;
        if (!this.isOpen(ni, nk)) continue;
        // no cutting corners past a wall
        if (di && dk && (!this.isOpen(i + di, k) || !this.isOpen(i, k + dk))) continue;
        const nj = nk * nx + ni;
        const ng = gj + (di && dk ? 1.414 : 1) * this.cost[nj];
        if (S[nj] === pass && ng >= G[nj]) continue;
        S[nj] = pass; G[nj] = ng; F[nj] = j;
        H.push(nj, ng + hx(nj));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let j = ei; j !== -1; j = F[j]) cells.push(j);
    cells.reverse();
    // pull the path tight: from each kept point, jump to the furthest cell still in a straight walk
    const pts = cells.map((j) => [this.x0 + ((j % nx) + 0.5) * CS, this.z0 + (((j / nx) | 0) + 0.5) * CS]);
    const out = [];
    let cur = [a.x, a.z], ci = 0;
    while (ci < pts.length - 1) {
      let best = ci + 1;
      for (let q = Math.min(pts.length - 1, ci + 40); q > ci + 1; q--) if (this.walkable(cur[0], cur[1], pts[q][0], pts[q][1])) { best = q; break; }
      cur = pts[best]; ci = best;
      out.push(new THREE.Vector3(cur[0], terrainY(cur[0], cur[1]), cur[1]));
    }
    return out;
  }
}

class BinaryHeap {
  constructor(n) { this.k = new Int32Array(n); this.v = new Float32Array(n); this.size = 0; }
  clear() { this.size = 0; }
  push(key, val) {
    let i = this.size++;
    if (i >= this.k.length) { this.size--; return; }
    const K = this.k, V = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (V[p] <= val) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = val;
  }
  pop() {
    const K = this.k, V = this.v, top = K[0], n = --this.size;
    if (n > 0) {
      const key = K[n], val = V[n];
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && V[c + 1] < V[c]) c++; if (V[c] >= val) break; K[i] = K[c]; V[i] = V[c]; i = c; }
      K[i] = key; V[i] = val;
    }
    return top;
  }
}
