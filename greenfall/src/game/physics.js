// Collision world: oriented boxes (yaw only), ramps and vertical cylinders in a spatial
// hash, plus the terrain heightfield. Handles character movement and raycasts.
import { COL } from '../world/buildings.js';

const CS = 8; // hash cell size (m)
const key = (cx, cz) => ((cx + 4096) & 0xffff) | (((cz + 4096) & 0xffff) << 16);

export class Physics {
  constructor(world) {
    this.world = world;
    this.hash = new Map();
    this.stamp = 1;
    this.count = 0;
  }
  prep(c) {
    c.c = Math.cos(c.rot); c.s = Math.sin(c.rot);
    if (c.kind === 2) {
      c.minX = c.x - c.hx; c.maxX = c.x + c.hx; c.minZ = c.z - c.hz; c.maxZ = c.z + c.hz;
    } else {
      const ex = Math.abs(c.c) * c.hx + Math.abs(c.s) * c.hz, ez = Math.abs(c.s) * c.hx + Math.abs(c.c) * c.hz;
      c.minX = c.x - ex; c.maxX = c.x + ex; c.minZ = c.z - ez; c.maxZ = c.z + ez;
    }
    c.minY = c.y - c.hy; c.maxY = c.y + c.hy;
    c._s = 0;
  }
  add(c) {
    if (c._in) return;
    this.prep(c);
    const x0 = Math.floor(c.minX / CS), x1 = Math.floor(c.maxX / CS), z0 = Math.floor(c.minZ / CS), z1 = Math.floor(c.maxZ / CS);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = key(x, z);
      let a = this.hash.get(k);
      if (!a) { a = []; this.hash.set(k, a); }
      a.push(c);
    }
    c._in = true;
    this.count++;
  }
  remove(c) {
    if (!c._in) return;
    const x0 = Math.floor(c.minX / CS), x1 = Math.floor(c.maxX / CS), z0 = Math.floor(c.minZ / CS), z1 = Math.floor(c.maxZ / CS);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = key(x, z);
      const a = this.hash.get(k);
      if (!a) continue;
      const i = a.indexOf(c);
      if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
      if (!a.length) this.hash.delete(k);
    }
    c._in = false;
    this.count--;
  }
  addAll(list) { for (const c of list) this.add(c); }
  removeAll(list) { for (const c of list) this.remove(c); }
  update(c) { this.remove(c); this.add(c); }

  // iterate colliders overlapping an XZ box
  query(minX, minZ, maxX, maxZ, fn) {
    const s = ++this.stamp;
    const x0 = Math.floor(minX / CS), x1 = Math.floor(maxX / CS), z0 = Math.floor(minZ / CS), z1 = Math.floor(maxZ / CS);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const a = this.hash.get(key(x, z));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const c = a[i];
        if (c._s === s) continue;
        c._s = s;
        if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
        if (fn(c) === false) return;
      }
    }
  }

  rampTop(c, lz) {
    const t = Math.min(1, Math.max(0, (lz + c.hz) / (2 * c.hz)));
    return c.minY + t * 2 * c.hy;
  }
  // top surface height of collider at world (x,z), or -Infinity if not over it
  topAt(c, x, z, pad = 0) {
    if (c.kind === 2) {
      const dx = x - c.x, dz = z - c.z;
      return dx * dx + dz * dz <= (c.hx + pad) * (c.hx + pad) ? c.maxY : -Infinity;
    }
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
    if (Math.abs(lx) > c.hx + pad || Math.abs(lz) > c.hz + pad) return -Infinity;
    if (c.kind === 1) return this.rampTop(c, lz);
    return c.maxY;
  }

  // Highest walkable surface under (x,z) that is at or below yMax
  groundAt(x, z, yMax, radius = 0.3) {
    let g = this.world.heightAt(x, z);
    const r = radius;
    this.query(x - r, z - r, x + r, z + r, (c) => {
      if (!(c.flags & COL.WALK)) return;
      const t = this.topAt(c, x, z, r * 0.6);
      if (t > g && t <= yMax) g = t;
    });
    return g;
  }

  // Resolve a vertical capsule (circle radius r, feet y, height h) against solids. Mutates pos.
  // Returns number of contacts. stepUp: obstacles whose top is below feet+stepUp are ignored.
  pushOut(pos, r, h, stepUp, ignoreThin = false, filter = null) {
    let contacts = 0;
    let nx = 0, nz = 0;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (c) => {
        if (!(c.flags & COL.SOLID)) return;
        if (ignoreThin && c.flags & COL.THIN) return;
        if (filter && !filter(c)) return;
        const feet = pos.y, head = pos.y + h;
        if (c.minY >= head) return;
        if (c.kind === 2) {
          if (c.maxY <= feet + stepUp) return;
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d2 = dx * dx + dz * dz, rr = c.hx + r;
          if (d2 >= rr * rr) return;
          const d = Math.sqrt(d2) || 0.0001;
          const push = rr - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
          nx += dx / d; nz += dz / d;
          contacts++; moved = true;
          return;
        }
        const dx = pos.x - c.x, dz = pos.z - c.z;
        let lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        let top = c.maxY;
        if (c.kind === 1) {
          top = this.rampTop(c, Math.max(-c.hz, Math.min(c.hz, lz)));
          if (top <= feet + stepUp) return;
          // the low end of a ramp is walkable; only block from the sides / high end
        }
        if (top <= feet + stepUp) return;
        const cx = Math.max(-c.hx, Math.min(c.hx, lx)), cz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ox = lx - cx, oz = lz - cz;
        let d2 = ox * ox + oz * oz;
        if (d2 >= r * r) return;
        let pxl, pzl;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pxl = (ox / d) * push; pzl = (oz / d) * push;
        } else {
          // center inside: push out along the smallest penetration axis
          const px = c.hx - Math.abs(lx) + r, pz = c.hz - Math.abs(lz) + r;
          if (px < pz) { pxl = Math.sign(lx || 1) * px; pzl = 0; } else { pxl = 0; pzl = Math.sign(lz || 1) * pz; }
        }
        // local → world (inverse rotation)
        const wx = pxl * c.c + pzl * c.s, wz = -pxl * c.s + pzl * c.c;
        pos.x += wx; pos.z += wz;
        const l = Math.hypot(wx, wz) || 1;
        nx += wx / l; nz += wz / l;
        contacts++; moved = true;
      });
      if (!moved) break;
    }
    this.lastNormal = { x: nx, z: nz };
    return contacts;
  }

  // Lowest collider bottom above y within radius (for ceilings)
  ceilingAt(x, z, yFrom, yTo, r) {
    let ceil = Infinity;
    this.query(x - r, z - r, x + r, z + r, (c) => {
      if (!(c.flags & COL.SOLID) || c.kind === 1) return;
      if (c.minY < yFrom - 0.01 || c.minY > yTo) return;
      const t = this.topAt(c, x, z, r * 0.5);
      if (t === -Infinity) return;
      if (c.minY < ceil) ceil = c.minY;
    });
    return ceil;
  }

  // ---------- raycast ----------
  rayCollider(c, ox, oy, oz, dx, dy, dz, maxT) {
    if (c.kind === 2) {
      const px = ox - c.x, pz = oz - c.z;
      const a = dx * dx + dz * dz;
      if (a < 1e-9) return Infinity;
      const b = 2 * (px * dx + pz * dz), cc = px * px + pz * pz - c.hx * c.hx;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return Infinity;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0) t = (-b + sq) / (2 * a);
      if (t < 0 || t > maxT) return Infinity;
      const y = oy + dy * t;
      if (y < c.minY || y > c.maxY) {
        // caps
        const tc = dy !== 0 ? ((dy > 0 ? c.minY : c.maxY) - oy) / dy : Infinity;
        if (tc >= 0 && tc <= maxT) { const hx = px + dx * tc, hz = pz + dz * tc; if (hx * hx + hz * hz <= c.hx * c.hx) { this._n = [0, dy > 0 ? -1 : 1, 0]; return tc; } }
        return Infinity;
      }
      const hx = px + dx * t, hz = pz + dz * t, l = Math.hypot(hx, hz) || 1;
      this._n = [hx / l, 0, hz / l];
      return t;
    }
    // to local
    const rx = ox - c.x, rz = oz - c.z, ry = oy - c.y;
    const lx = rx * c.c - rz * c.s, lz = rx * c.s + rz * c.c;
    const ldx = dx * c.c - dz * c.s, ldz = dx * c.s + dz * c.c;
    if (c.kind === 1) {
      // inclined plane through (z=-hz, y=-hy) → (z=hz, y=hy)
      const slope = c.hy / c.hz;
      // plane: y - slope*z = 0 (local, centered). n = (0, 1, -slope)
      const denom = dy - slope * ldz;
      if (Math.abs(denom) < 1e-6) return Infinity;
      const t = -(ry - slope * lz) / denom;
      if (t < 0 || t > maxT) return Infinity;
      const hx = lx + ldx * t, hz = lz + ldz * t;
      if (Math.abs(hx) > c.hx || Math.abs(hz) > c.hz) return Infinity;
      const nl = Math.hypot(1, slope);
      const nlz = -slope / nl, nly = 1 / nl;
      const sgn = denom < 0 ? 1 : -1;
      this._n = [sgn * (nlz * c.s), sgn * nly, sgn * (nlz * c.c)];
      return t;
    }
    let tmin = 0, tmax = maxT, axis = -1, sign = 1;
    const o = [lx, ry, lz], d = [ldx, dy, ldz], h = [c.hx, c.hy, c.hz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < -h[i] || o[i] > h[i]) return Infinity; continue; }
      let t1 = (-h[i] - o[i]) / d[i], t2 = (h[i] - o[i]) / d[i];
      let s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
    if (axis < 0) { this._n = [-dx, -dy, -dz]; return 0; }
    // local normal → world
    let nlx = 0, nly = 0, nlz = 0;
    if (axis === 0) nlx = sign; else if (axis === 1) nly = sign; else nlz = sign;
    this._n = [nlx * c.c + nlz * c.s, nly, -nlx * c.s + nlz * c.c];
    return tmin;
  }

  // mask: collider flag bits required (default BULLET). Returns hit or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mask = COL.BULLET, ignore = null) {
    let best = maxDist, hit = null;
    // DDA over XZ hash cells
    let cx = Math.floor(ox / CS), cz = Math.floor(oz / CS);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CS / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? CS / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CS - ox : ox - cx * CS) / Math.abs(dx)) : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CS - oz : oz - cz * CS) / Math.abs(dz)) : Infinity;
    const s = ++this.stamp;
    let t = 0;
    let guard = 0;
    while (t <= best && guard++ < 400) {
      const a = this.hash.get(key(cx, cz));
      if (a) for (let i = 0; i < a.length; i++) {
        const c = a[i];
        if (c._s === s) continue;
        c._s = s;
        if (!(c.flags & mask) || c === ignore) continue;
        const tc = this.rayCollider(c, ox, oy, oz, dx, dy, dz, best);
        if (tc < best) { best = tc; hit = { t: tc, collider: c, n: this._n }; }
      }
      if (tmx < tmz) { t = tmx; tmx += tdx; cx += stepX; } else { t = tmz; tmz += tdz; cz += stepZ; }
    }
    // terrain
    const tt = this.rayTerrain(ox, oy, oz, dx, dy, dz, best);
    if (tt < best) { best = tt; hit = { t: tt, collider: null, terrain: true, n: [0, 1, 0] }; }
    if (hit) { hit.x = ox + dx * hit.t; hit.y = oy + dy * hit.t; hit.z = oz + dz * hit.t; }
    return hit;
  }
  rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    const w = this.world;
    let step = 1.5;
    let prevT = 0, prevD = oy - w.heightAt(ox, oz);
    if (prevD < 0) return 0;
    for (let t = step; t <= maxT + step; t += step) {
      const tt = Math.min(t, maxT);
      const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
      const d = y - w.heightAt(x, z);
      if (d < 0) {
        // bisection
        let a = prevT, b = tt;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) / 2;
          const dm = oy + dy * m - w.heightAt(ox + dx * m, oz + dz * m);
          if (dm < 0) b = m; else a = m;
        }
        return b;
      }
      prevT = tt; prevD = d;
      if (tt >= maxT) break;
      step = Math.min(6, Math.max(1.0, d * 0.5));
    }
    return Infinity;
  }
  lineOfSight(ax, ay, az, bx, by, bz, mask = COL.BULLET) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return true;
    const hit = this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, mask);
    return !hit;
  }
}
