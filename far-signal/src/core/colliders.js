// Static 2.5D collision: vertical cylinders and oriented boxes with a top height.
// Anything whose top is within step reach counts as ground instead of a wall.
const STEP = 0.5;

export class Colliders {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); this.count = 0; }

  _key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }

  _insert(c, x0, z0, x1, z1) {
    const cs = this.cell;
    for (let iz = Math.floor(z0 / cs); iz <= Math.floor(z1 / cs); iz++) {
      for (let ix = Math.floor(x0 / cs); ix <= Math.floor(x1 / cs); ix++) {
        const k = this._key(ix, iz);
        let a = this.map.get(k);
        if (!a) { a = []; this.map.set(k, a); }
        a.push(c);
      }
    }
    this.count++;
    return c;
  }

  addCircle(x, z, r, top, opts = {}) {
    const c = { box: false, x, z, r, top, bottom: opts.bottom ?? -1e9, walk: opts.walk ?? false, dead: false, tag: opts.tag };
    return this._insert(c, x - r, z - r, x + r, z + r);
  }

  addBox(x, z, hx, hz, rot, top, opts = {}) {
    const c = { box: true, x, z, hx, hz, cos: Math.cos(rot), sin: Math.sin(rot), top, bottom: opts.bottom ?? -1e9, walk: opts.walk ?? true, dead: false, tag: opts.tag };
    const e = Math.hypot(hx, hz);
    return this._insert(c, x - e, z - e, x + e, z + e);
  }

  remove(c) { c.dead = true; }

  _near(x, z) { return this.map.get(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell))); }

  // Highest walkable surface under the point that the feet can reach.
  groundAt(x, z, feetY, base) {
    const list = this._near(x, z);
    let g = base;
    if (!list) return g;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.dead || !c.walk || c.top <= g || c.top > feetY + STEP) continue;
      if (c.box) {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) g = c.top;
      } else {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz <= c.r * c.r) g = c.top;
      }
    }
    return g;
  }

  // Push a vertical capsule (radius, feet..head) out of walls. Mutates pos.x/z.
  resolve(pos, radius, feetY, headY) {
    const list = this._near(pos.x, pos.z);
    if (!list) return false;
    let hit = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.dead) continue;
      if (c.walk && feetY >= c.top - STEP) continue;
      if (!c.walk && feetY >= c.top) continue;
      if (headY < c.bottom) continue;
      if (c.box) {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        const ex = c.hx + radius, ez = c.hz + radius;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
          let nlx = lx, nlz = lz;
          if (px < pz) nlx = lx < 0 ? -ex : ex; else nlz = lz < 0 ? -ez : ez;
          pos.x = c.x + nlx * c.cos - nlz * c.sin;
          pos.z = c.z + nlx * c.sin + nlz * c.cos;
          hit = true;
        }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const rr = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4;
          pos.x = c.x + (dx / d) * rr;
          pos.z = c.z + (dz / d) * rr;
          hit = true;
        }
      }
    }
    return hit;
  }

  // Segment test used by the camera and projectiles (coarse sampling).
  blocked(x, y, z) {
    const list = this._near(x, z);
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.dead || y > c.top || y < c.bottom) continue;
      const dx = x - c.x, dz = z - c.z;
      if (c.box) {
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) return true;
      } else if (dx * dx + dz * dz < c.r * c.r) return true;
    }
    return false;
  }
}
