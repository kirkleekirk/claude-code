// Static collision world: Y-rotated boxes, vertical cylinders and the terrain heightfield.
// Characters are vertical capsules approximated as circles in XZ with a height span.
import { clamp } from '../util.js';

const CELL = 4;
const key = (ix, iz) => (ix + 2048) * 8192 + (iz + 2048);

export class PhysicsWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.colliders = [];
    this.grid = new Map();
    this.stamp = 1;
    // optional: a CaveField (rock ceilings, lumpy walls, bullets) and a WalkField (smooth map edges)
    this.cave = null;
    this.walls = null;
  }

  // Is there rock at this point? (only caves have overhead rock)
  rockAt(x, y, z) {
    const cave = this.cave;
    return cave !== null && cave.inExtent(x, z) && cave.sdf(x, y, z) < 0.04;
  }

  _insert(c) {
    const r = c.bound;
    const x0 = Math.floor((c.cx - r) / CELL);
    const x1 = Math.floor((c.cx + r) / CELL);
    const z0 = Math.floor((c.cz - r) / CELL);
    const z1 = Math.floor((c.cz + r) / CELL);
    c.cells = [];
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
        c.cells.push(k);
      }
    }
  }

  // Box centred at (x, y + h/2, z) when `base` is used, or explicit centre.
  addBox({ x, y, z, w, h, d, rot = 0, walkable = true, material = 'concrete', tag = null, door = null, bullets = true, nav = true, climbable = true }) {
    const c = {
      type: 'box', cx: x, cy: y + h / 2, cz: z, hx: w / 2, hy: h / 2, hz: d / 2, rot,
      cos: Math.cos(rot), sin: Math.sin(rot), minY: y, maxY: y + h,
      walkable, material, tag, door, bullets, nav, climbable, disabled: false, _stamp: 0,
    };
    c.bound = Math.hypot(c.hx, c.hz);
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  addCylinder({ x, z, r, y0, y1, walkable = false, material = 'wood', tag = null, bullets = true, nav = true }) {
    const c = {
      type: 'cyl', cx: x, cz: z, cy: (y0 + y1) / 2, r, minY: y0, maxY: y1, walkable, material, tag, bullets, nav,
      climbable: false, disabled: false, _stamp: 0,
    };
    c.bound = r;
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  query(x, z, radius, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.grid.get(key(ix, iz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (c._stamp === s || c.disabled) continue;
          c._stamp = s;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Signed push needed to move circle (x,z,r) out of collider c in XZ, or null.
  circlePush(c, x, z, r) {
    if (c.type === 'cyl') {
      const dx = x - c.cx;
      const dz = z - c.cz;
      const d2 = dx * dx + dz * dz;
      const rr = r + c.r;
      if (d2 >= rr * rr) return null;
      const d = Math.sqrt(d2) || 1e-4;
      const pen = rr - d;
      return { x: (dx / d) * pen, z: (dz / d) * pen, nx: dx / d, nz: dz / d };
    }
    const dx = x - c.cx;
    const dz = z - c.cz;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const qx = clamp(lx, -c.hx, c.hx);
    const qz = clamp(lz, -c.hz, c.hz);
    let ox = lx - qx;
    let oz = lz - qz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= r * r) return null;
    let nx;
    let nz;
    let pen;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nx = ox / d;
      nz = oz / d;
      pen = r - d;
    } else {
      const px = c.hx - Math.abs(lx);
      const pz = c.hz - Math.abs(lz);
      if (px < pz) {
        nx = Math.sign(lx) || 1;
        nz = 0;
        pen = px + r;
      } else {
        nx = 0;
        nz = Math.sign(lz) || 1;
        pen = pz + r;
      }
    }
    // back to world
    const wx = nx * c.cos + nz * c.sin;
    const wz = -nx * c.sin + nz * c.cos;
    return { x: wx * pen, z: wz * pen, nx: wx, nz: wz };
  }

  // Does circle overlap collider footprint?
  footprintOverlap(c, x, z, r) {
    if (c.type === 'cyl') {
      const dx = x - c.cx;
      const dz = z - c.cz;
      return dx * dx + dz * dz < (r + c.r) * (r + c.r);
    }
    const dx = x - c.cx;
    const dz = z - c.cz;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const ox = lx - clamp(lx, -c.hx, c.hx);
    const oz = lz - clamp(lz, -c.hz, c.hz);
    return ox * ox + oz * oz < r * r;
  }

  pointInside(c, x, z, margin = 0) {
    if (c.type === 'cyl') {
      const dx = x - c.cx;
      const dz = z - c.cz;
      return dx * dx + dz * dz < (c.r + margin) * (c.r + margin);
    }
    const dx = x - c.cx;
    const dz = z - c.cz;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    return Math.abs(lx) <= c.hx + margin && Math.abs(lz) <= c.hz + margin;
  }

  // Highest walkable surface under (x,z) whose top is <= maxY.
  groundHeight(x, z, r, maxY, out) {
    let best = this.terrain.heightAt(x, z);
    let bestC = null;
    const cands = this.query(x, z, r + 0.1, this._tmpQ || (this._tmpQ = []));
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (!c.walkable) continue;
      if (c.maxY > maxY || c.maxY <= best) continue;
      if (this.footprintOverlap(c, x, z, r)) {
        best = c.maxY;
        bestC = c;
      }
    }
    if (out) {
      out.collider = bestC;
      out.material = bestC ? bestC.material : 'dirt';
    }
    return best;
  }

  // Move a character {x,y,z,r,h,vx,vy,vz,grounded} by velocity * dt with sliding collision.
  moveCharacter(ch, dt, stepUp = 0.45, ignore = null) {
    const speed = Math.hypot(ch.vx, ch.vy, ch.vz);
    const steps = clamp(Math.ceil((speed * dt) / 0.18), 1, 8);
    const sdt = dt / steps;
    const info = this._groundInfo || (this._groundInfo = {});
    let hitWall = false;
    for (let s = 0; s < steps; s++) {
      const prevY = ch.y;
      ch.x += ch.vx * sdt;
      ch.z += ch.vz * sdt;
      for (let iter = 0; iter < 3; iter++) {
        let moved = false;
        const cands = this.query(ch.x, ch.z, ch.r + 0.2, this._tmpM || (this._tmpM = []));
        for (let i = 0; i < cands.length; i++) {
          const c = cands[i];
          if (c === ignore) continue;
          if (c.minY >= ch.y + ch.h - 0.05) continue; // above head
          if (c.maxY <= ch.y + 0.02) continue; // below feet
          if (c.walkable && c.maxY <= ch.y + stepUp && (ch.grounded || c.maxY <= ch.y + 0.2)) continue; // step onto
          const p = this.circlePush(c, ch.x, ch.z, ch.r);
          if (!p) continue;
          ch.x += p.x;
          ch.z += p.z;
          const vn = ch.vx * p.nx + ch.vz * p.nz;
          if (vn < 0) {
            ch.vx -= vn * p.nx;
            ch.vz -= vn * p.nz;
          }
          moved = true;
          hitWall = true;
        }
        if (!moved) break;
      }
      // map edges and cave walls
      if (this.walls !== null) {
        const p = this.walls.push(ch.x, ch.z, ch.r);
        if (p) {
          ch.x += p.x;
          ch.z += p.z;
          const vn = ch.vx * p.nx + ch.vz * p.nz;
          if (vn < 0) {
            ch.vx -= vn * p.nx;
            ch.vz -= vn * p.nz;
          }
          hitWall = true;
        }
      }
      // vertical
      ch.y += ch.vy * sdt;
      // rock overhead: heads stop at the cave ceiling
      if (ch.vy > 0 && this.rockAt(ch.x, ch.y + ch.h + 0.08, ch.z)) {
        ch.y = Math.min(ch.y, prevY);
        ch.vy = 0;
      }
      if (ch.vy > 0) {
        const cands = this.query(ch.x, ch.z, ch.r, this._tmpM);
        for (let i = 0; i < cands.length; i++) {
          const c = cands[i];
          if (c === ignore) continue;
          const head = ch.y + ch.h;
          if (c.minY > prevY + ch.h - 0.02 && c.minY < head && this.footprintOverlap(c, ch.x, ch.z, ch.r * 0.8)) {
            ch.y = c.minY - ch.h;
            ch.vy = 0;
          }
        }
      }
      const ref = Math.max(prevY, ch.y) + (ch.grounded ? stepUp : 0.25);
      const g = this.groundHeight(ch.x, ch.z, ch.r * 0.7, ref, info);
      if (ch.y <= g) {
        ch.y = g;
        if (ch.vy < 0) ch.landSpeed = -ch.vy;
        ch.vy = 0;
        ch.grounded = true;
      } else if (ch.grounded && ch.vy <= 0 && ch.y - g < stepUp + 0.05) {
        ch.y = g; // stick to slopes and down-steps
        ch.vy = 0;
      } else {
        ch.grounded = false;
      }
      ch.groundMaterial = info.material;
      ch.groundCollider = info.collider;
    }
    return hitWall;
  }

  // Ray against colliders + terrain. Returns nearest hit or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
    let best = maxDist;
    let hit = null;
    const filter = opts.filter;
    // walk the 2D grid along the ray
    const s = ++this.stamp;
    let t = 0;
    const stepLen = CELL * 0.5;
    const horiz = Math.hypot(dx, dz);
    const visit = (ix, iz) => {
      const arr = this.grid.get(key(ix, iz));
      if (!arr) return;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c._stamp === s || c.disabled) continue;
        c._stamp = s;
        if (opts.bullets && !c.bullets) continue;
        if (filter && !filter(c)) continue;
        const r = c.type === 'box' ? this._rayBox(c, ox, oy, oz, dx, dy, dz) : this._rayCyl(c, ox, oy, oz, dx, dy, dz);
        if (r && r.t < best && r.t >= 0) {
          best = r.t;
          hit = { dist: r.t, nx: r.nx, ny: r.ny, nz: r.nz, collider: c, material: c.material };
        }
      }
    };
    if (horiz < 1e-4) {
      visit(Math.floor(ox / CELL), Math.floor(oz / CELL));
    } else {
      let lastK = null;
      while (t <= best + CELL) {
        const px = ox + dx * t;
        const pz = oz + dz * t;
        for (let ax = -1; ax <= 1; ax++) {
          for (let az = -1; az <= 1; az++) {
            const ix = Math.floor(px / CELL) + ax;
            const iz = Math.floor(pz / CELL) + az;
            const k = key(ix, iz);
            if (k === lastK) continue;
            visit(ix, iz);
          }
        }
        t += stepLen / Math.max(horiz, 0.2);
        if (t > maxDist + CELL) break;
      }
    }
    if (!opts.noTerrain) {
      const th = this.terrain.raycast(ox, oy, oz, dx, dy, dz, best);
      if (th && th.dist < best) {
        best = th.dist;
        hit = { dist: th.dist, nx: th.nx, ny: th.ny, nz: th.nz, collider: null, material: 'dirt' };
      }
      if (this.cave !== null) {
        const ch = this.cave.raycast(ox, oy, oz, dx, dy, dz, best);
        if (ch && ch.dist < best) {
          best = ch.dist;
          hit = { dist: ch.dist, nx: ch.nx, ny: ch.ny, nz: ch.nz, collider: null, material: 'rock' };
        }
      }
    }
    if (hit) {
      hit.x = ox + dx * hit.dist;
      hit.y = oy + dy * hit.dist;
      hit.z = oz + dz * hit.dist;
    }
    return hit;
  }

  _rayBox(c, ox, oy, oz, dx, dy, dz) {
    const rx = ox - c.cx;
    const rz = oz - c.cz;
    const lox = rx * c.cos - rz * c.sin;
    const loz = rx * c.sin + rz * c.cos;
    const ldx = dx * c.cos - dz * c.sin;
    const ldz = dx * c.sin + dz * c.cos;
    const loy = oy - c.cy;
    let tmin = -Infinity;
    let tmax = Infinity;
    let axis = -1;
    let sign = 0;
    const slab = (o, d, h, ax) => {
      if (Math.abs(d) < 1e-9) {
        return o >= -h && o <= h;
      }
      let t1 = (-h - o) / d;
      let t2 = (h - o) / d;
      let sg = -1;
      if (t1 > t2) {
        const tt = t1;
        t1 = t2;
        t2 = tt;
        sg = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = ax;
        sign = sg;
      }
      if (t2 < tmax) tmax = t2;
      return tmin <= tmax;
    };
    if (!slab(lox, ldx, c.hx, 0)) return null;
    if (!slab(loy, dy, c.hy, 1)) return null;
    if (!slab(loz, ldz, c.hz, 2)) return null;
    if (tmax < 0) return null;
    if (tmin < 0) return null; // origin inside
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (axis === 0) nx = sign;
    else if (axis === 1) ny = sign;
    else nz = sign;
    // local -> world normal
    const wx = nx * c.cos + nz * c.sin;
    const wz = -nx * c.sin + nz * c.cos;
    return { t: tmin, nx: wx, ny, nz: wz };
  }

  _rayCyl(c, ox, oy, oz, dx, dy, dz) {
    const fx = ox - c.cx;
    const fz = oz - c.cz;
    const a = dx * dx + dz * dz;
    let best = null;
    if (a > 1e-9) {
      const b = 2 * (fx * dx + fz * dz);
      const cc = fx * fx + fz * fz - c.r * c.r;
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t = (-b - sq) / (2 * a);
        if (t >= 0) {
          const y = oy + dy * t;
          if (y >= c.minY && y <= c.maxY) {
            const hx = fx + dx * t;
            const hz = fz + dz * t;
            best = { t, nx: hx / c.r, ny: 0, nz: hz / c.r };
          }
        }
      }
    }
    if (Math.abs(dy) > 1e-6) {
      const capY = dy < 0 ? c.maxY : c.minY;
      const t = (capY - oy) / dy;
      if (t >= 0 && (!best || t < best.t)) {
        const hx = fx + dx * t;
        const hz = fz + dz * t;
        if (hx * hx + hz * hz <= c.r * c.r) best = { t, nx: 0, ny: dy < 0 ? 1 : -1, nz: 0 };
      }
    }
    return best;
  }

  // Line of sight between two points (bullets + terrain).
  visible(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-3) return true;
    return !this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, { bullets: true });
  }
}
