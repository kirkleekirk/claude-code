// Static collision world: axis-aligned boxes in a uniform grid, used for player
// and walker movement, bullet/LOS raycasts, and a nav grid for flow fields.

const UNREACHED = 65535;

export class World {
  constructor(half = 92) {
    this.half = half;
    this.cs = 4;
    this.gn = Math.ceil((half * 2) / this.cs);
    this.grid = new Array(this.gn * this.gn);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    this.boxes = [];
    this.stamp = 1;
    this.interactables = [];
    this.interiors = []; // rects {x0,z0,x1,z1} with wooden floors
    this.nav = null;
  }

  addBox(x0, y0, z0, x1, y1, z1, opts = {}) {
    const b = {
      x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
      x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
      collide: opts.collide !== false,
      occlude: opts.occlude !== false,
      kind: opts.kind || 'wall',
      stamp: 0,
    };
    this.boxes.push(b);
    const c0x = this._cell(b.x0), c1x = this._cell(b.x1);
    const c0z = this._cell(b.z0), c1z = this._cell(b.z1);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) this.grid[cz * this.gn + cx].push(b);
    return b;
  }

  // Convenience: box from center + size.
  addBoxC(cx, cy, cz, sx, sy, sz, opts) {
    return this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, opts);
  }

  _cell(v) {
    return Math.max(0, Math.min(this.gn - 1, Math.floor((v + this.half) / this.cs)));
  }

  _forBoxesNear(x0, z0, x1, z1, fn) {
    const s = ++this.stamp;
    const c0x = this._cell(x0), c1x = this._cell(x1), c0z = this._cell(z0), c1z = this._cell(z1);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const arr = this.grid[cz * this.gn + cx];
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          if (b.stamp === s) continue;
          b.stamp = s;
          fn(b);
        }
      }
    }
  }

  // Push a vertical cylinder (circle on XZ, spanning yMin..yMax) out of solid boxes.
  // Returns true if any collision happened.
  resolveCircle(pos, r, yMin = 0.35, yMax = 1.7) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      this._forBoxesNear(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (b) => {
        if (!b.collide || b.y1 <= yMin || b.y0 >= yMax) return;
        const cx = pos.x < b.x0 ? b.x0 : pos.x > b.x1 ? b.x1 : pos.x;
        const cz = pos.z < b.z0 ? b.z0 : pos.z > b.z1 ? b.z1 : pos.z;
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // Center inside the box: push out along the shallowest axis.
          const pl = pos.x - b.x0, pr = b.x1 - pos.x, pb = pos.z - b.z0, pf = b.z1 - pos.z;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) pos.x = b.x0 - r;
          else if (m === pr) pos.x = b.x1 + r;
          else if (m === pb) pos.z = b.z0 - r;
          else pos.z = b.z1 + r;
        }
      });
    }
    return hit;
  }

  // 3D ray vs boxes using a 2D DDA over the grid. Returns {t, nx, ny, nz, box} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 200, occludersOnly = true) {
    const half = this.half, cs = this.cs, gn = this.gn;
    let best = maxDist, bestBox = null, bnx = 0, bny = 0, bnz = 0;
    const s = ++this.stamp;
    const testBox = (b) => {
      if (b.stamp === s) return;
      b.stamp = s;
      if (occludersOnly ? !b.occlude : !b.collide) return;
      // slab test
      let tmin = 0, tmax = best, nx = 0, ny = 0, nz = 0;
      if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return; } else {
        let t1 = (b.x0 - ox) / dx, t2 = (b.x1 - ox) / dx, n = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
        if (t1 > tmin) { tmin = t1; nx = n; ny = 0; nz = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return; } else {
        let t1 = (b.y0 - oy) / dy, t2 = (b.y1 - oy) / dy, n = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = n; nz = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return; } else {
        let t1 = (b.z0 - oz) / dz, t2 = (b.z1 - oz) / dz, n = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = n; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (tmin < best && tmin >= 0) {
        // Origin inside a box counts as an immediate hit only for thick boxes.
        best = tmin;
        bestBox = b;
        bnx = nx; bny = ny; bnz = nz;
      }
    };

    let x = ox + half, z = oz + half;
    let cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = Math.abs(dx) > 1e-9 ? cs / Math.abs(dx) : Infinity;
    const tDZ = Math.abs(dz) > 1e-9 ? cs / Math.abs(dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((cx + (dx > 0 ? 1 : 0)) * cs - x) / dx : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((cz + (dz > 0 ? 1 : 0)) * cs - z) / dz : Infinity;
    let guard = 0;
    while (guard++ < 400) {
      if (cx >= 0 && cx < gn && cz >= 0 && cz < gn) {
        const arr = this.grid[cz * gn + cx];
        for (let i = 0; i < arr.length; i++) testBox(arr[i]);
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best <= tNext || tNext > maxDist) break;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; } else { cz += stepZ; tMaxZ += tDZ; }
      if ((cx < -1 || cx > gn || cz < -1 || cz > gn)) break;
    }
    if (!bestBox) return null;
    return { t: best, nx: bnx, ny: bny, nz: bnz, box: bestBox };
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d, true);
    return !h;
  }

  surfaceAt(x, z) {
    for (const r of this.interiors) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.surface || 'wood';
    return 'ground';
  }

  isIndoors(x, z) {
    for (const r of this.interiors) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return false;
  }

  // ---- Navigation -----------------------------------------------------------

  buildNav(res = 0.5) {
    const n = Math.ceil((this.half * 2) / res);
    this.navRes = res;
    this.navN = n;
    const nav = new Uint8Array(n * n);
    const pad = 0.2;
    for (const b of this.boxes) {
      if (!b.collide || b.y1 <= 0.35 || b.y0 >= 1.2) continue;
      const i0 = Math.max(0, Math.ceil((b.x0 - pad + this.half) / res - 0.5));
      const i1 = Math.min(n - 1, Math.floor((b.x1 + pad + this.half) / res - 0.5));
      const j0 = Math.max(0, Math.ceil((b.z0 - pad + this.half) / res - 0.5));
      const j1 = Math.min(n - 1, Math.floor((b.z1 + pad + this.half) / res - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) nav[j * n + i] = 1;
    }
    this.nav = nav;
    this.queue = new Int32Array(n * n);
  }

  navCell(x, z) {
    const n = this.navN, res = this.navRes;
    const i = Math.floor((x + this.half) / res), j = Math.floor((z + this.half) / res);
    if (i < 0 || j < 0 || i >= n || j >= n) return -1;
    return j * n + i;
  }

  navCenter(cell, out) {
    const n = this.navN, res = this.navRes;
    out.x = (cell % n + 0.5) * res - this.half;
    out.z = (Math.floor(cell / n) + 0.5) * res - this.half;
    return out;
  }

  newField() {
    return new Uint16Array(this.navN * this.navN).fill(UNREACHED);
  }

  // Breadth-first distance field (8-neighbour, no corner cutting) out to maxSteps.
  computeField(field, tx, tz, maxSteps = 140) {
    field.fill(UNREACHED);
    const n = this.navN, nav = this.nav, q = this.queue;
    let start = this.navCell(tx, tz);
    if (start < 0) return;
    if (nav[start]) {
      // Target is inside padding (e.g. player hugging a wall): seed from nearest open neighbour.
      let found = -1;
      for (let r = 1; r < 4 && found < 0; r++) {
        for (let dj = -r; dj <= r && found < 0; dj++) for (let di = -r; di <= r; di++) {
          const c = start + dj * n + di;
          if (c >= 0 && c < nav.length && !nav[c]) { found = c; break; }
        }
      }
      if (found < 0) return;
      start = found;
    }
    let head = 0, tail = 0;
    field[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const c = q[head++];
      const d = field[c];
      if (d >= maxSteps) continue;
      const ci = c % n, cj = (c - ci) / n;
      const nd = d + 1;
      const l = ci > 0 && !nav[c - 1];
      const r = ci < n - 1 && !nav[c + 1];
      const u = cj > 0 && !nav[c - n];
      const dn = cj < n - 1 && !nav[c + n];
      if (l && field[c - 1] === UNREACHED) { field[c - 1] = nd; q[tail++] = c - 1; }
      if (r && field[c + 1] === UNREACHED) { field[c + 1] = nd; q[tail++] = c + 1; }
      if (u && field[c - n] === UNREACHED) { field[c - n] = nd; q[tail++] = c - n; }
      if (dn && field[c + n] === UNREACHED) { field[c + n] = nd; q[tail++] = c + n; }
      if (l && u && !nav[c - n - 1] && field[c - n - 1] === UNREACHED) { field[c - n - 1] = nd; q[tail++] = c - n - 1; }
      if (r && u && !nav[c - n + 1] && field[c - n + 1] === UNREACHED) { field[c - n + 1] = nd; q[tail++] = c - n + 1; }
      if (l && dn && !nav[c + n - 1] && field[c + n - 1] === UNREACHED) { field[c + n - 1] = nd; q[tail++] = c + n - 1; }
      if (r && dn && !nav[c + n + 1] && field[c + n + 1] === UNREACHED) { field[c + n + 1] = nd; q[tail++] = c + n + 1; }
    }
  }

  // Direction to step down the field from (x,z). Writes out.x/out.z, returns distance or -1.
  fieldDir(field, x, z, out, prefX = 0, prefZ = 0) {
    const n = this.navN;
    const c = this.navCell(x, z);
    if (c < 0) return -1;
    const d0 = field[c];
    let best = d0 === UNREACHED ? UNREACHED : d0, bestC = -1, bestScore = Infinity;
    const ci = c % n;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        if (ci + di < 0 || ci + di >= n) continue;
        const nc = c + dj * n + di;
        if (nc < 0 || nc >= field.length) continue;
        const d = field[nc];
        if (d === UNREACHED || d > best) continue;
        // Tie-break toward the preferred direction so paths look natural.
        const score = d * 10 - (di * prefX + dj * prefZ);
        if (d < best || score < bestScore) {
          if (d < best) best = d;
          bestScore = score;
          bestC = nc;
        }
      }
    }
    if (bestC < 0) return d0 === UNREACHED ? -1 : d0;
    this.navCenter(bestC, out);
    out.x -= x;
    out.z -= z;
    const len = Math.hypot(out.x, out.z) || 1;
    out.x /= len;
    out.z /= len;
    return best;
  }

  fieldValue(field, x, z) {
    const c = this.navCell(x, z);
    return c < 0 ? UNREACHED : field[c];
  }

  isWalkable(x, z) {
    const c = this.navCell(x, z);
    return c >= 0 && !this.nav[c];
  }
}

export { UNREACHED };
