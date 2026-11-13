// Walkable-surface grid for a rectangle of the world (a camp). Each 0.5 m
// cell can hold several surfaces (ground, a floor, a stair step) so paths go
// through doorways, up stairs and between storeys. Doors count as open
// (survivors open them on the way through).
const BLOCK = new Set(['solid', 'prop', 'glass', 'fence', 'tree', 'car', 'roof', 'floor', 'stair', 'barricade', 'npcblock']);
const SURF = new Set(['floor', 'stair', 'walk']);

export class NavGrid {
  constructor(physics, x0, z0, x1, z1, res = 0.5) {
    this.ph = physics;
    this.res = res;
    this.x0 = x0; this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / res); this.nz = Math.ceil((z1 - z0) / res);
    this.build();
  }
  cell(x, z) { return [Math.floor((x - this.x0) / this.res), Math.floor((z - this.z0) / this.res)]; }
  build() {
    const ph = this.ph, r = this.res, rad = 0.2; // 1 m doorways stay two cells wide
    this.nodes = []; // {i, j, y}
    this.byCell = new Map(); // i*nz+j -> [node ids]
    const q = [];
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = this.x0 + (i + 0.5) * r, z = this.z0 + (j + 0.5) * r;
      // anything you can stand on, as the physics sees it (entry steps and
      // thresholds too), and whether it's a stair tread
      const ys = [[ph.terrain.height(x, z), false]];
      ph.query(x - rad, z - rad, x + rad, z + rad, q);
      for (const b of q) {
        if (b.kind === 'glass' || b.kind === 'door' || b.noGround) continue;
        if (x < b.min[0] - 0.05 || x > b.max[0] + 0.05 || z < b.min[2] - 0.05 || z > b.max[2] + 0.05) continue;
        ys.push([b.max[1], b.kind === 'stair']);
      }
      ys.sort((a, b) => a[0] - b[0]);
      const ids = [];
      let last = -1e9;
      for (const [y, stair] of ys) {
        if (y - last < 0.3) { if (stair && ids.length) this.nodes[ids[ids.length - 1]].stair = true; continue; } // same surface
        // standing room: nothing solid from knee to head within the body radius
        let ok = true;
        for (const b of q) {
          if (!BLOCK.has(b.kind)) continue;
          if (b.max[1] <= y + 0.4 || b.min[1] >= y + 1.75) continue;
          if (x + rad < b.min[0] || x - rad > b.max[0] || z + rad < b.min[2] || z - rad > b.max[2]) continue;
          ok = false; break;
        }
        // not standing inside a higher surface (ground under a floor slab)
        if (ok) { ids.push(this.nodes.length); this.nodes.push({ i, j, y, x, z, stair }); last = y; }
      }
      if (ids.length) this.byCell.set(i * this.nz + j, ids);
    }
    // neighbours
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    this.adj = this.nodes.map(() => []);
    this.nodes.forEach((n, id) => {
      for (const [di, dj] of D) {
        const ids = this.byCell.get((n.i + di) * this.nz + (n.j + dj));
        if (!ids || n.i + di < 0 || n.i + di >= this.nx) continue;
        for (const m of ids) {
          const o = this.nodes[m];
          // a body steps 0.48 m; onto or off a stair cell (two treads) 0.75
          if (Math.abs(o.y - n.y) > (o.stair || n.stair ? 0.75 : 0.48)) continue;
          if (di && dj) {
            // diagonal: both side cells must be walkable at this height
            const a = this.at(n.i + di, n.j, n.y), b = this.at(n.i, n.j + dj, n.y);
            if (a < 0 || b < 0) continue;
          }
          this.adj[id].push(m);
        }
      }
    });
    this.version = (this.version || 0) + 1;
  }
  at(i, j, y) {
    const ids = this.byCell.get(i * this.nz + j);
    if (!ids) return -1;
    let best = -1, bd = 0.6;
    for (const id of ids) { const d = Math.abs(this.nodes[id].y - y); if (d < bd) { bd = d; best = id; } }
    return best;
  }
  // nearest node to a world point (searching outward a little)
  nearest(x, y, z, reach = 4) {
    const [ci, cj] = this.cell(x, z);
    let best = -1, bd = Infinity;
    for (let rr = 0; rr <= reach; rr++) {
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== rr) continue;
        const ids = this.byCell.get((ci + di) * this.nz + (cj + dj));
        if (!ids || ci + di < 0 || ci + di >= this.nx) continue;
        for (const id of ids) {
          const n = this.nodes[id];
          if (!this.adj[id].length) continue;
          const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 2;
          if (d < bd) { bd = d; best = id; }
        }
      }
      if (best >= 0 && rr >= 1) break;
    }
    return best;
  }
  contains(x, z) { return x > this.x0 && z > this.z0 && x < this.x0 + this.nx * this.res && z < this.z0 + this.nz * this.res; }
  // A* from a to b (world points). Returns [{x,y,z}] or null.
  path(ax, ay, az, bx, by, bz) {
    const s = this.nearest(ax, ay, az), g = this.nearest(bx, by, bz);
    if (s < 0 || g < 0) return null;
    if (s === g) return [{ x: bx, y: by, z: bz }];
    const N = this.nodes, gs = new Float32Array(N.length).fill(Infinity), from = new Int32Array(N.length).fill(-1);
    const closed = new Uint8Array(N.length);
    const heap = new Heap();
    const H = (id) => Math.hypot(N[id].x - N[g].x, N[id].z - N[g].z) + Math.abs(N[id].y - N[g].y);
    gs[s] = 0; heap.push(s, H(s));
    let iter = 0;
    while (heap.size && iter++ < 40000) {
      const c = heap.pop();
      if (c === g) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const nc = N[c];
      for (const m of this.adj[c]) {
        if (closed[m]) continue;
        const nm = N[m];
        const cost = gs[c] + Math.hypot(nm.x - nc.x, nm.z - nc.z) + Math.abs(nm.y - nc.y) * 0.5;
        if (cost < gs[m]) { gs[m] = cost; from[m] = c; heap.push(m, cost + H(m)); }
      }
    }
    if (from[g] < 0) return null;
    const pts = [];
    for (let c = g; c >= 0 && c !== s; c = from[c]) pts.push(N[c]);
    pts.reverse();
    // drop points on straight runs
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], a = out[out.length - 1], n = pts[k + 1];
      if (a && n && Math.abs((p.x - a.x) * (n.z - p.z) - (p.z - a.z) * (n.x - p.x)) < 1e-4 && Math.abs(n.y - a.y) < 0.05) continue;
      out.push({ x: p.x, y: p.y, z: p.z });
    }
    out.push({ x: bx, y: by, z: bz });
    return out;
  }
}

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
