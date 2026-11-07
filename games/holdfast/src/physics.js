// Collision world: static & dynamic axis-aligned boxes in a spatial hash, plus
// the terrain heightfield. Characters are vertical capsules (circle in XZ).
const CELLSZ = 4;

export class Physics {
  constructor(terrain) {
    this.terrain = terrain;
    this.hash = new Map();
    this.owners = new Map(); // owner -> list of boxes
    this.dynamic = new Set();
    this.stamp = 0;
    this.bounds = null;
  }
  key(i, j) { return i * 100003 + j; }
  add(box, owner = null) {
    box._id = box._id || ++this.stamp;
    const i0 = Math.floor(box.min[0] / CELLSZ), i1 = Math.floor(box.max[0] / CELLSZ);
    const j0 = Math.floor(box.min[2] / CELLSZ), j1 = Math.floor(box.max[2] / CELLSZ);
    box._cells = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      let a = this.hash.get(k);
      if (!a) { a = []; this.hash.set(k, a); }
      a.push(box);
      box._cells.push(k);
    }
    if (owner) {
      let l = this.owners.get(owner);
      if (!l) { l = []; this.owners.set(owner, l); }
      l.push(box);
    }
    return box;
  }
  remove(box) {
    if (!box._cells) return;
    for (const k of box._cells) {
      const a = this.hash.get(k);
      if (!a) continue;
      const i = a.indexOf(box);
      if (i >= 0) a.splice(i, 1);
    }
    box._cells = null;
  }
  removeOwner(owner) {
    const l = this.owners.get(owner);
    if (!l) return;
    for (const b of l) this.remove(b);
    this.owners.delete(owner);
  }
  // Boxes overlapping an XZ rect
  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const seen = ++this.stamp;
    const i0 = Math.floor(x0 / CELLSZ), i1 = Math.floor(x1 / CELLSZ);
    const j0 = Math.floor(z0 / CELLSZ), j1 = Math.floor(z1 / CELLSZ);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.hash.get(this.key(i, j));
      if (!a) continue;
      for (const b of a) {
        if (b._seen === seen) continue;
        b._seen = seen;
        if (b.max[0] < x0 || b.min[0] > x1 || b.max[2] < z0 || b.min[2] > z1) continue;
        out.push(b);
      }
    }
    return out;
  }
  // Highest walkable surface under (x,z) with top <= maxY (feet + step).
  groundAt(x, z, maxY, r = 0.2) {
    let g = this.terrain.height(x, z);
    const list = this.query(x - r, z - r, x + r, z + r, this._q || (this._q = []));
    for (const b of list) {
      if (b.kind === 'glass' || b.noGround) continue;
      if (b.max[1] > maxY) continue;
      if (x + r < b.min[0] || x - r > b.max[0] || z + r < b.min[2] || z - r > b.max[2]) continue;
      if (b.max[1] > g) g = b.max[1];
    }
    return g;
  }
  // Resolve a circle (x,z,r) for a body spanning [y0, y1]; boxes whose top is
  // below y0+step are ignored (they can be stepped onto). Returns new [x,z].
  collide(x, z, r, y0, y1, step = 0.45, ignore = null, ignoreKind = null) {
    for (let iter = 0; iter < 4; iter++) {
      const list = this.query(x - r - 0.1, z - r - 0.1, x + r + 0.1, z + r + 0.1, this._c || (this._c = []));
      let moved = false;
      for (const b of list) {
        if (b === ignore || (ignore && b.owner === ignore) || (ignoreKind && b.kind === ignoreKind)) continue;
        if (b.max[1] <= y0 + step || b.min[1] >= y1) continue;
        // closest point on box (XZ)
        const cx = Math.max(b.min[0], Math.min(x, b.max[0]));
        const cz = Math.max(b.min[2], Math.min(z, b.max[2]));
        let dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-10) {
          // centre inside box: push out along the shallowest axis
          const pl = x - b.min[0], pr = b.max[0] - x, pd = z - b.min[2], pu = b.max[2] - z;
          const m = Math.min(pl, pr, pd, pu);
          if (m === pl) x = b.min[0] - r; else if (m === pr) x = b.max[0] + r;
          else if (m === pd) z = b.min[2] - r; else z = b.max[2] + r;
        } else {
          const d = Math.sqrt(d2);
          const push = r - d;
          x += (dx / d) * push; z += (dz / d) * push;
        }
        moved = true;
      }
      if (!moved) break;
    }
    // world bounds
    if (this.bounds) {
      const B = this.bounds;
      x = Math.max(B.x0, Math.min(B.x1, x));
      z = Math.max(B.z0, Math.min(B.z1, z));
    }
    return [x, z];
  }
  // Lowest box bottom above y within the circle (for ceilings / head bumps).
  ceilingAt(x, z, y, r = 0.25) {
    let c = Infinity;
    const list = this.query(x - r, z - r, x + r, z + r, this._q2 || (this._q2 = []));
    for (const b of list) {
      if (b.min[1] < y) continue;
      if (x + r < b.min[0] || x - r > b.max[0] || z + r < b.min[2] || z - r > b.max[2]) continue;
      if (b.min[1] < c) c = b.min[1];
    }
    return c;
  }
  // Ray vs boxes & terrain. Returns distance (<= maxD) to first hit.
  raycast(ox, oy, oz, dx, dy, dz, maxD, opts = {}) {
    let best = maxD, hitBox = null;
    const x1 = ox + dx * maxD, z1 = oz + dz * maxD;
    const list = this.query(Math.min(ox, x1) - 0.5, Math.min(oz, z1) - 0.5, Math.max(ox, x1) + 0.5, Math.max(oz, z1) + 0.5, this._r || (this._r = []));
    for (const b of list) {
      if (opts.skipGlass && b.kind === 'glass') continue;
      if (opts.filter && !opts.filter(b)) continue;
      const pad = opts.pad || 0;
      let tmin = 0, tmax = best;
      let ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        const o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz;
        const mn = b.min[a] - pad, mx = b.max[a] + pad;
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) ok = false; continue; }
        let t0 = (mn - o) / d, t1 = (mx - o) / d;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
        if (t0 > tmin) tmin = t0;
        if (t1 < tmax) tmax = t1;
        if (tmin > tmax) ok = false;
      }
      if (ok && tmin < best) { best = tmin; hitBox = b; }
    }
    if (!opts.noTerrain) {
      // march the terrain
      const steps = Math.ceil(best / 0.5);
      for (let i = 1; i <= steps; i++) {
        const t = Math.min(best, i * 0.5);
        const y = oy + dy * t, h = this.terrain.height(ox + dx * t, oz + dz * t);
        if (y < h + (opts.terrainPad || 0)) { best = Math.max(0, t - 0.5); hitBox = null; break; }
      }
    }
    return { dist: best, box: hitBox };
  }
}
