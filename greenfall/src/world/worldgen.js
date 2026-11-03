// World data generation: heightfield, coast, roads, building lots, fields, trees and props.
// Produces plain data only – meshes are built lazily per chunk by world.js.
import { WORLD, GW, GH, COAST, QUAYS, REGIONS, ROAD_TYPES, ROADS, MILLBROOK_GRID, BELLEROSE_GRID, POIS, LAKE, LOOKOUT_HILL, QUARRY } from './layout.js';
import { Simplex2 } from '../core/noise.js';
import { RNG, hash01 } from '../core/rng.js';
import { clamp, lerp, smoothstep, segDist, pointInPoly } from '../core/math.js';

export const OCC = { ROAD: 1, NOBUILD: 2, BUILDING: 4, FIELD: 8, WATER: 16, NOTREE: 32, TOWN: 64, PAVE: 128 };
export const SURF = { GRASS: 0, DRYGRASS: 1, FOREST: 2, DIRT: 3, SAND: 4, ROCK: 5, LAWN: 6, PAVE: 7, COBBLE: 8, SOIL: 9,
  WHEAT: 10, CORN: 11, PASTURE: 12, GRAVEL: 13, MUD: 14, SEABED: 15, DIRTROAD: 16, ASPHALT: 17 };
export const TREE = { OAK: 0, ROUND: 1, PINE: 2, LIVEOAK: 3, BUSH: 4, DEAD: 5, APPLE: 6 };
const CELL = WORLD.CELL;

export function regionAt(x, z) {
  for (const key in REGIONS) {
    const p = REGIONS[key].poly;
    if (x >= p[0][0] && x <= p[1][0] && z >= p[0][1] && z <= p[2][1]) return key;
  }
  return 'center';
}
const REGION_PARAMS = {
  millbrook: { roll: 7, hill: 0.05, forest: -0.12, flat: 0.55 },
  retail: { roll: 4, hill: 0.0, forest: -0.3, flat: 0.75 },
  farms: { roll: 9, hill: 0.08, forest: -0.08, flat: 0.25 },
  harbor: { roll: 6, hill: 0.0, forest: -0.2, flat: 0.5 },
  bellerose: { roll: 2.5, hill: 0.0, forest: -0.35, flat: 0.85 },
  center: { roll: 20, hill: 1.0, forest: 0.14, flat: 0.0 },
};

function catmull(pts, step) {
  // dense Catmull-Rom then resample by arc length
  const dense = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const sub = Math.max(2, Math.ceil(segLen / 2));
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[n - 1].slice());
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    let segL = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let start = 0;
    while (acc + (segL - start) >= step) {
      const need = step - acc;
      start += need;
      const t = start / segL;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      acc = 0;
    }
    acc += segL - start;
  }
  const last = dense[dense.length - 1];
  const lo = out[out.length - 1];
  if (Math.hypot(last[0] - lo[0], last[1] - lo[1]) > step * 0.3) out.push(last.slice());
  return out;
}

export class WorldData {
  constructor(seed = 20261103) {
    this.seed = seed;
    this.noise = new Simplex2(seed);
    this.noise2 = new Simplex2(seed + 77);
    this.rng = new RNG(seed);
    const N = GW * GH;
    this.height = new Float32Array(N);
    this.coast = new Float32Array(N);
    this.occ = new Uint8Array(N);
    this.surf = new Uint8Array(N);
    this.roadW = new Float32Array(N);
    this.roadH = new Float32Array(N);
    this.roadType = new Uint8Array(N);
    this.forest = new Float32Array(N);
    this.roads = [];
    this.buildings = [];
    this.fields = [];
    this.props = [];
    this.fences = [];
    this.poles = [];
    this.wires = [];
    this.ponds = [];
    this.lots = [];
    this.lake = null;
    this.trees = null;
    this.rocks = [];
    this.landmarks = [];
    this.parking = [];
  }

  // ---------- grid helpers ----------
  idx(gx, gz) { return gz * GW + gx; }
  heightAt(x, z) {
    let fx = x / CELL, fz = z / CELL;
    if (fx < 0) fx = 0; else if (fx > GW - 1.001) fx = GW - 1.001;
    if (fz < 0) fz = 0; else if (fz > GH - 1.001) fz = GH - 1.001;
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const i = iz * GW + ix;
    const h = this.height;
    // triangle-consistent interpolation (matches the terrain mesh diagonal)
    if (tx + tz <= 1) {
      return h[i] + (h[i + 1] - h[i]) * tx + (h[i + GW] - h[i]) * tz;
    }
    return h[i + GW + 1] + (h[i + GW] - h[i + GW + 1]) * (1 - tx) + (h[i + 1] - h[i + GW + 1]) * (1 - tz);
  }
  normalAt(x, z, out) {
    const e = 2;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }
  sampleGrid(arr, x, z) {
    const gx = clamp(Math.round(x / CELL), 0, GW - 1), gz = clamp(Math.round(z / CELL), 0, GH - 1);
    return arr[gz * GW + gx];
  }
  coastAt(x, z) { return this.sampleGrid(this.coast, x, z); }
  occAt(x, z) { return this.sampleGrid(this.occ, x, z); }
  isWater(x, z) {
    if (this.heightAt(x, z) < 0) return true;
    if (this.lake) {
      const e = this.ellipseE(x, z);
      if (e < 1.5 && this.heightAt(x, z) < this.lake.level) return true;
    }
    for (const p of this.ponds) {
      if (Math.hypot(x - p.x, z - p.z) < p.r * 1.3 && this.heightAt(x, z) < p.level) return true;
    }
    return false;
  }
  waterLevelAt(x, z) {
    if (this.lake && this.ellipseE(x, z) < 1.6) return this.lake.level;
    for (const p of this.ponds) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.4) return p.level;
    return 0;
  }
  ellipseE(x, z) {
    const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
    return dx * dx + dz * dz;
  }

  // Iterate over grid cells covered by a rotated rectangle (center, rot, half-extents + margin)
  forRect(cx, cz, rot, w, d, margin, fn) {
    const hw = w / 2 + margin, hd = d / 2 + margin;
    const c = Math.cos(rot), s = Math.sin(rot);
    const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
    const gx0 = clamp(Math.floor((cx - ex) / CELL), 0, GW - 1), gx1 = clamp(Math.ceil((cx + ex) / CELL), 0, GW - 1);
    const gz0 = clamp(Math.floor((cz - ez) / CELL), 0, GH - 1), gz1 = clamp(Math.ceil((cz + ez) / CELL), 0, GH - 1);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx * CELL - cx, dz = gz * CELL - cz;
        // world → local (inverse of three.js Y rotation)
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
          if (fn(gz * GW + gx, lx, lz) === false) return false;
        }
      }
    }
    return true;
  }
  canPlace(cx, cz, rot, w, d, margin = 2, mask = OCC.ROAD | OCC.NOBUILD | OCC.BUILDING | OCC.FIELD | OCC.WATER, maxSlope = 4.5, minCoast = 14) {
    let hmin = 1e9, hmax = -1e9, ok = true;
    const res = this.forRect(cx, cz, rot, w, d, margin, (i) => {
      if (this.occ[i] & mask) { ok = false; return false; }
      if (this.coast[i] < minCoast) { ok = false; return false; }
      const h = this.height[i];
      if (h < hmin) hmin = h;
      if (h > hmax) hmax = h;
    });
    if (!res || !ok) return false;
    if (hmax - hmin > maxSlope) return false;
    if (cx < 60 || cz < 60 || cx > WORLD.W - 60 || cz > WORLD.H - 60) return false;
    return true;
  }
  mark(cx, cz, rot, w, d, margin, bits) {
    this.forRect(cx, cz, rot, w, d, margin, (i) => { this.occ[i] |= bits; });
  }

  // ---------- generation pipeline ----------
  generate(progress = () => {}) {
    const steps = [
      ['Charting the coastline', () => this.computeCoast()],
      ['Raising the land', () => this.computeBaseHeight()],
      ['Laying roads', () => this.buildRoads()],
      ['Filling Lake Wren', () => this.carveLakeAndQuarry()],
      ['Grading town lots', () => this.flattenTowns()],
      ['Paving Route 9', () => this.applyRoads()],
      ['Building Greenfall County', () => this.placeContent()],
      ['Pouring foundations', () => this.flattenPads()],
      ['Setting up workbenches', () => this.placeBenches()],
      ['Painting the land', () => this.classifySurface()],
      ['Planting forests', () => this.placeTrees()],
      ['Stringing power lines', () => this.placeRoadside()],
    ];
    for (let i = 0; i < steps.length; i++) {
      progress(i / steps.length, steps[i][0]);
      steps[i][1]();
    }
    progress(1, 'Done');
  }

  computeCoast() {
    // coarse signed distance to the coast polygon, then refine with noise
    const C = 16, cw = Math.ceil(WORLD.W / C) + 1, ch = Math.ceil(WORLD.H / C) + 1;
    const coarse = new Float32Array(cw * ch);
    const n = COAST.length;
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const x = i * C, z = j * C;
        let best = 1e9;
        for (let k = 0; k < n; k++) {
          const a = COAST[k], b = COAST[(k + 1) % n];
          const d = segDist(x, z, a[0], a[1], b[0], b[1]).d;
          if (d < best) best = d;
        }
        coarse[j * cw + i] = pointInPoly(x, z, COAST) ? best : -best;
      }
    }
    const nz = this.noise;
    for (let gz = 0; gz < GH; gz++) {
      for (let gx = 0; gx < GW; gx++) {
        const x = gx * CELL, z = gz * CELL;
        const fx = x / C, fz = z / C;
        const ix = Math.min(cw - 2, fx | 0), iz = Math.min(ch - 2, fz | 0);
        const tx = fx - ix, tz = fz - iz;
        const a = coarse[iz * cw + ix], b = coarse[iz * cw + ix + 1], c = coarse[(iz + 1) * cw + ix], d = coarse[(iz + 1) * cw + ix + 1];
        let dist = lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
        const q = this.quayWeight(x, z);
        const wobble = nz.fbm(x / 340, z / 340, 3) * 55 + nz.noise(x / 70, z / 70) * 9;
        dist += wobble * (1 - q);
        this.coast[gz * GW + gx] = dist;
      }
    }
  }
  quayWeight(x, z) {
    let w = 0;
    for (const q of QUAYS) {
      const dx = Math.max(q.x1 - x, 0, x - q.x2), dz = Math.max(q.z1 - z, 0, z - q.z2);
      w = Math.max(w, 1 - smoothstep(0, 60, Math.hypot(dx, dz)));
    }
    return w;
  }

  computeBaseHeight() {
    // region parameter field (coarse + blurred for soft transitions)
    const C = 16, cw = Math.ceil(WORLD.W / C) + 1, ch = Math.ceil(WORLD.H / C) + 1;
    const fields = ['roll', 'hill', 'forest', 'flat'].map(() => new Float32Array(cw * ch));
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const p = REGION_PARAMS[regionAt(i * C, j * C)];
      fields[0][j * cw + i] = p.roll; fields[1][j * cw + i] = p.hill; fields[2][j * cw + i] = p.forest; fields[3][j * cw + i] = p.flat;
    }
    const blur = (arr, r) => {
      const tmp = new Float32Array(arr.length);
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
          let s = 0, c = 0;
          for (let k = -r; k <= r; k++) { const ii = clamp(i + k, 0, cw - 1); s += arr[j * cw + ii]; c++; }
          tmp[j * cw + i] = s / c;
        }
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
          let s = 0, c = 0;
          for (let k = -r; k <= r; k++) { const jj = clamp(j + k, 0, ch - 1); s += tmp[jj * cw + i]; c++; }
          arr[j * cw + i] = s / c;
        }
      }
    };
    fields.forEach((f) => blur(f, 7));
    this._regionFields = { fields, cw, ch, C };
    const sample = (f, x, z) => {
      const fx = x / C, fz = z / C;
      const ix = Math.min(cw - 2, fx | 0), iz = Math.min(ch - 2, fz | 0);
      const tx = fx - ix, tz = fz - iz;
      return lerp(lerp(f[iz * cw + ix], f[iz * cw + ix + 1], tx), lerp(f[(iz + 1) * cw + ix], f[(iz + 1) * cw + ix + 1], tx), tz);
    };
    this.regionField = (k, x, z) => sample(fields[k], x, z);
    const nz = this.noise, nz2 = this.noise2;
    const LH = LOOKOUT_HILL;
    for (let gz = 0; gz < GH; gz++) {
      for (let gx = 0; gx < GW; gx++) {
        const x = gx * CELL, z = gz * CELL;
        const i = gz * GW + gx;
        const d = this.coast[i];
        const q = this.quayWeight(x, z);
        let h;
        if (d < 0) {
          h = Math.max(-26, d * 0.1) - 0.6;
          h = lerp(h, Math.max(-9, d * 2) - 2.5, q);
        } else {
          const beach = smoothstep(0, 50, d);
          h = 0.35 + beach * 2.1;
          const inland = smoothstep(25, 650, d);
          const roll = sample(fields[0], x, z), hill = sample(fields[1], x, z), flat = sample(fields[3], x, z);
          const n1 = nz.fbm(x / 650, z / 650, 4) * 0.5 + 0.5;
          const rid = nz2.ridged(x / 950, z / 950, 4);
          const det = nz.fbm(x / 110, z / 110, 3) * 1.4 * (1 - flat);
          h += inland * (5 + roll * n1 + hill * rid * 40) + det * inland;
          const gd = Math.hypot(x - LH.x, z - LH.z);
          h += LH.h * Math.exp(-(gd * gd) / (2 * LH.sigma * LH.sigma));
          // sea wall along quays
          h = lerp(h, Math.max(h, 3.3), q * smoothstep(0, 6, d));
        }
        this.height[i] = h;
      }
    }
  }

  buildRoads() {
    const add = (name, type, pts) => {
      const t = ROAD_TYPES[type];
      const samples = catmull(pts, 4);
      const xs = new Float32Array(samples.length), zs = new Float32Array(samples.length);
      samples.forEach((p, k) => { xs[k] = p[0]; zs[k] = p[1]; });
      this.roads.push({ id: this.roads.length, name, type, width: t.width, shoulder: t.shoulder, xs, zs, n: samples.length, prof: null });
    };
    for (const r of ROADS) add(r.name, r.type, r.pts);
    for (const s of MILLBROOK_GRID.ns) add('Millbrook St', 'street', [[s.x, s.z1], [s.x, s.z2]]);
    for (const s of MILLBROOK_GRID.ew) add('Millbrook Ave', 'street', [[s.x1, s.z], [s.x2, s.z]]);
    for (const s of BELLEROSE_GRID.ns) add('Rue', 'cobble', [[s.x, s.z1], [s.x, s.z2]]);
    for (const s of BELLEROSE_GRID.ew) add('Rue', 'cobble', [[s.x1, s.z], [s.x2, s.z]]);
    // Spatial index of road samples (64 m buckets) for fast nearest-road queries
    this.roadIndex = new Map();
    for (const r of this.roads) {
      for (let k = 0; k < r.n; k++) {
        const key = ((r.xs[k] / 64) | 0) + ',' + ((r.zs[k] / 64) | 0);
        let arr = this.roadIndex.get(key);
        if (!arr) { arr = []; this.roadIndex.set(key, arr); }
        arr.push(r.id, k);
      }
    }
  }
  nearestRoad(x, z, maxD = 64) {
    let best = null, bd = maxD;
    const cx = (x / 64) | 0, cz = (z / 64) | 0;
    const R = Math.ceil(maxD / 64) + 1;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const arr = this.roadIndex.get((cx + i) + ',' + (cz + j));
      if (!arr) continue;
      for (let k = 0; k < arr.length; k += 2) {
        const r = this.roads[arr[k]], s = arr[k + 1];
        const s2 = Math.min(r.n - 1, s + 1);
        const sd = segDist(x, z, r.xs[s], r.zs[s], r.xs[s2], r.zs[s2]);
        const d = sd.d - r.width / 2;
        if (d < bd) { bd = d; best = { road: r, k: s, d, cx: sd.cx, cz: sd.cz }; }
      }
    }
    return best;
  }
  roadFrame(r, k) {
    const a = Math.max(0, k - 1), b = Math.min(r.n - 1, k + 1);
    let tx = r.xs[b] - r.xs[a], tz = r.zs[b] - r.zs[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return { x: r.xs[k], z: r.zs[k], tx, tz, nx: -tz, nz: tx };
  }

  carveLakeAndQuarry() {
    // Lake Wren: water level from the surrounding rim so the lake never spills.
    let rimMin = 1e9;
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      const x = LAKE.x + Math.cos(t) * LAKE.rx * 1.25, z = LAKE.z + Math.sin(t) * LAKE.rz * 1.25;
      rimMin = Math.min(rimMin, this.heightAt(x, z));
    }
    const level = Math.max(4, rimMin - 1.2);
    this.lake = { ...LAKE, level };
    const Rm = (LAKE.rx + LAKE.rz) / 2;
    this.forRect(LAKE.x, LAKE.z, 0, LAKE.rx * 3.6, LAKE.rz * 3.6, 0, (i, lx, lz) => {
      const dx = lx / LAKE.rx, dz = lz / LAKE.rz;
      const wob = this.noise.noise((LAKE.x + lx) / 60, (LAKE.z + lz) / 60) * 0.1;
      const e = Math.max(0, dx * dx + dz * dz + wob);
      const se = Math.sqrt(e);
      const orig = this.height[i];
      const bowl = e < 1 ? level - 0.6 - 7.5 * Math.pow(1 - e, 0.6) : level - 0.6 + (se - 1) * Rm * 0.22;
      let berm = -1e9;
      if (e > 1) {
        const up = Math.min(1.9, (se - 1) * Rm * 0.22);
        const down = Math.max(0, se - 1.22) * Rm * 0.18;
        berm = level - 0.6 + up - down;
      }
      this.height[i] = Math.max(Math.min(orig, bowl), berm);
      if (e < 1.12) this.occ[i] |= OCC.WATER;
      if (e < 1.4) this.occ[i] |= OCC.NOBUILD;
    });
    // Old Quarry: terraced pit
    const Q = QUARRY;
    const rim = this.heightAt(Q.x, Q.z);
    this.quarryFloor = rim - Q.depth;
    this.forRect(Q.x, Q.z, 0, Q.rx * 2.6, Q.rz * 2.6, 0, (i, lx, lz) => {
      const dx = lx / Q.rx, dz = lz / Q.rz;
      const e = Math.sqrt(dx * dx + dz * dz);
      if (e < 1.25) {
        const t = clamp((1.25 - e) / 1.0, 0, 1);
        const terr = Math.floor(t * 4) / 4 + smoothstep(0.7, 1, (t * 4) % 1) / 4;
        const target = rim - Q.depth * clamp(terr, 0, 1);
        this.height[i] = lerp(this.height[i], target, smoothstep(1.25, 1.0, e));
        this.occ[i] |= OCC.NOBUILD | OCC.NOTREE;
      }
    });
  }

  flattenTowns() {
    // Pull terrain toward a smooth plane in built-up areas so streets and lots sit nicely.
    const smooth = new Float32Array(this.height.length);
    // big box blur of current height (radius ~ 48m) via coarse sampling
    const R = 12;
    const tmp = new Float32Array(this.height.length);
    const h = this.height;
    for (let gz = 0; gz < GH; gz++) {
      let s = 0;
      for (let k = -R; k <= R; k++) s += h[gz * GW + clamp(k, 0, GW - 1)];
      for (let gx = 0; gx < GW; gx++) {
        tmp[gz * GW + gx] = s / (2 * R + 1);
        s += h[gz * GW + clamp(gx + R + 1, 0, GW - 1)] - h[gz * GW + clamp(gx - R, 0, GW - 1)];
      }
    }
    for (let gx = 0; gx < GW; gx++) {
      let s = 0;
      for (let k = -R; k <= R; k++) s += tmp[clamp(k, 0, GH - 1) * GW + gx];
      for (let gz = 0; gz < GH; gz++) {
        smooth[gz * GW + gx] = s / (2 * R + 1);
        s += tmp[clamp(gz + R + 1, 0, GH - 1) * GW + gx] - tmp[clamp(gz - R, 0, GH - 1) * GW + gx];
      }
    }
    for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
      const i = gz * GW + gx;
      if (this.coast[i] < 2) continue;
      const flat = this.regionField(3, gx * CELL, gz * CELL);
      if (flat > 0.01) h[i] = lerp(h[i], Math.max(smooth[i], 1.6), flat * smoothstep(2, 30, this.coast[i]));
    }
  }

  applyRoads() {
    // smoothed longitudinal profile per road
    for (const r of this.roads) {
      const raw = new Float32Array(r.n);
      for (let k = 0; k < r.n; k++) raw[k] = Math.max(1.4, this.heightAt(r.xs[k], r.zs[k]));
      let prof = raw;
      const W = r.type === 'highway' ? 10 : 7;
      for (let pass = 0; pass < 3; pass++) {
        const out = new Float32Array(r.n);
        for (let k = 0; k < r.n; k++) {
          let s = 0, c = 0;
          for (let j = -W; j <= W; j++) { const kk = clamp(k + j, 0, r.n - 1); s += prof[kk]; c++; }
          out[k] = s / c;
        }
        prof = out;
      }
      r.prof = prof;
    }
    const typeIdx = Object.keys(ROAD_TYPES);
    for (const r of this.roads) {
      const hw = r.width / 2, sh = r.shoulder;
      const tIndex = typeIdx.indexOf(r.type) + 1;
      for (let k = 0; k < r.n - 1; k++) {
        const ax = r.xs[k], az = r.zs[k], bx = r.xs[k + 1], bz = r.zs[k + 1];
        const pad = hw + sh + CELL;
        const gx0 = clamp(Math.floor((Math.min(ax, bx) - pad) / CELL), 0, GW - 1), gx1 = clamp(Math.ceil((Math.max(ax, bx) + pad) / CELL), 0, GW - 1);
        const gz0 = clamp(Math.floor((Math.min(az, bz) - pad) / CELL), 0, GH - 1), gz1 = clamp(Math.ceil((Math.max(az, bz) + pad) / CELL), 0, GH - 1);
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
          const sd = segDist(gx * CELL, gz * CELL, ax, az, bx, bz);
          const d = sd.d;
          if (d > hw + sh) continue;
          const i = gz * GW + gx;
          const w = 1 - smoothstep(hw + 0.5, hw + sh, d);
          if (w > this.roadW[i]) { this.roadW[i] = w; this.roadH[i] = lerp(r.prof[k], r.prof[k + 1], sd.t); }
          if (d < hw + 0.6) { this.occ[i] |= OCC.ROAD; if (!this.roadType[i] || d < hw) this.roadType[i] = tIndex; }
          if (d < hw + 1.2) this.occ[i] |= OCC.NOBUILD;
          if (d < hw + 4) this.occ[i] |= OCC.NOTREE;
        }
      }
    }
    for (let i = 0; i < this.height.length; i++) {
      if (this.roadW[i] > 0) this.height[i] = lerp(this.height[i], this.roadH[i], this.roadW[i]);
    }
  }

  // Weapon workbenches: every gun shop, pawn shop, sheriff's office and hardware store has
  // one, plus a share of garages, barns, gas stations and warehouses. Decided here
  // (deterministically) so the map can show them before their buildings stream in.
  placeBenches() {
    const GUN_SIGNS = ['GUNS', 'SHERIFF', 'ARMY SURPLUS', 'PAWN', 'HARDWARE'];
    for (const b of this.buildings) {
      const h = ((b.seed >>> 4) % 1000) / 1000;
      b.bench = ((b.kind === 'store' || b.kind === 'shop') && GUN_SIGNS.includes(b.sign)) || (b.kind === 'garage' && h < 0.5) || (b.kind === 'barn' && h < 0.22) || (b.kind === 'gas' && h < 0.6) || (b.kind === 'warehouse' && h < 0.5);
    }
  }

  // ---------- content placement ----------
  addBuilding(kind, x, z, rot, w, d, extra = {}) {
    const b = { id: this.buildings.length, kind, x, z, rot, w, d, floors: 1, seed: (this.rng.next() * 1e9) | 0, ...extra };
    this.buildings.push(b);
    this.mark(x, z, rot, w, d, 0.5, OCC.BUILDING | OCC.NOTREE);
    this.mark(x, z, rot, w, d, extra.margin ?? 4, OCC.NOBUILD | OCC.NOTREE);
    return b;
  }
  tryBuilding(kind, x, z, rot, w, d, extra = {}, margin = 2.5, maxSlope = 4.5) {
    if (!this.canPlace(x, z, rot, w, d, margin, undefined, maxSlope)) return null;
    return this.addBuilding(kind, x, z, rot, w, d, extra);
  }
  addProp(type, x, z, rot = 0, s = 1, data = null) {
    this.props.push({ type, x, z, rot, s, data });
  }
  addPave(x, z, rot, w, d, surf = SURF.PAVE) {
    this.parking.push({ x, z, rot, w, d });
    this.forRect(x, z, rot, w, d, 0, (i) => { this.occ[i] |= OCC.PAVE | OCC.NOTREE | OCC.NOBUILD; this.surf[i] = surf; });
  }

  // Place a sequence of lots along a road. `make` returns a building spec {kind,w,d,...} or null.
  alongRoad(r, opts, make) {
    const rng = this.rng;
    const hw = r.width / 2;
    const L = r.n * 4;
    let s = opts.start ?? 10;
    const end = Math.min(L - 10, opts.end ?? L - 10);
    const sides = opts.sides ?? [1, -1];
    while (s < end) {
      const k = Math.min(r.n - 1, Math.round(s / 4));
      const f = this.roadFrame(r, k);
      for (const side of sides) {
        if (opts.chance && !rng.chance(opts.chance)) continue;
        const spec = make(rng, f, side);
        if (!spec) continue;
        const setback = rng.range(opts.setback[0], opts.setback[1]);
        const off = hw + setback + spec.d / 2;
        const cx = f.x + f.nx * side * off, cz = f.z + f.nz * side * off;
        if (opts.filter && !opts.filter(cx, cz)) continue;
        const rot = Math.atan2(-f.nx * side, -f.nz * side); // front faces road
        const b = this.tryBuilding(spec.kind, cx, cz, rot, spec.w, spec.d, spec, spec.gap ?? 2.5, spec.maxSlope ?? 4.5);
        if (b) {
          b.roadSide = { x: f.x + f.nx * side * (hw + 0.5), z: f.z + f.nz * side * (hw + 0.5) };
          if (spec.after) spec.after(b, f, side);
        }
      }
      s += Math.max(2, rng.range(opts.spacing[0], opts.spacing[1]));
    }
  }

  houseStyle(rng, region) {
    const sidings = [0xf2efe6, 0xe9e2c8, 0xbcd3e0, 0xc9d8b6, 0xd8d3cc, 0xf0d8a8, 0xc2c8cf, 0xe8c9b9, 0x9fb7c9];
    const roofs = [0x4a4f57, 0x5a3a2e, 0x3e4a5c, 0x6b6e70, 0x7a3b2e, 0x2f3b33];
    const trims = [0xffffff, 0xf4f1ea, 0x3c3f44, 0x5b4636];
    const shutters = [0x2f4f3a, 0x23324a, 0x5a2a24, 0x1f1f1f, 0x6b7f5a];
    const brick = rng.chance(region === 'millbrook' ? 0.18 : 0.08);
    return {
      wall: brick ? rng.pick([0xa3523f, 0x8f4a3a, 0xb06a52]) : rng.pick(sidings),
      wallTex: brick ? 'BRICK' : 'SIDING',
      roof: rng.pick(roofs),
      trim: rng.pick(trims),
      shutter: rng.chance(0.6) ? rng.pick(shutters) : null,
      roofType: rng.chance(0.8) ? 'gable' : 'hip',
      porch: rng.chance(0.55),
      chimney: rng.chance(0.5),
    };
  }

  placeContent() {
    const rng = this.rng;
    const roadsByName = (n) => this.roads.filter((r) => r.name === n);
    const R9 = roadsByName('Route 9')[0];

    // ---------- landmarks with fixed spots ----------
    // Millbrook
    this.addBuilding('church', 628, 520, 0, 13, 24, { floors: 1, margin: 6 });
    this.addBuilding('school', 770, 838, Math.PI, 54, 22, { floors: 1, margin: 5 });
    this.addPave(770, 875, 0, 50, 14);
    this.landmarks.push({ type: 'watertower', x: 1040, z: 690, label: 'MILLBROOK' });
    this.mark(1040, 690, 0, 16, 16, 2, OCC.BUILDING | OCC.NOBUILD | OCC.NOTREE);
    this.landmarks.push({ type: 'gazebo', x: 770, z: 690 });
    this.mark(770, 680, 0, 120, 140, 0, OCC.NOBUILD);
    this.addBuilding('store', 910, 640, Math.PI, 16, 20, { floors: 1, sign: 'SHERIFF', style: { wall: 0xc9b79a, wallTex: 'BRICK' }, margin: 3 });

    // Route 9 Plaza
    this.addBuilding('gas', 1236, 662, Math.PI, 16, 12, { sign: 'GAS & GO', margin: 3 });
    this.landmarks.push({ type: 'canopy', x: 1242, z: 624, rot: 0 });
    this.mark(1242, 624, 0, 22, 14, 1, OCC.BUILDING | OCC.NOBUILD | OCC.NOTREE);
    this.addPave(1242, 630, 0, 34, 30);
    const shops = ['GROCERY', 'PHARMACY', 'HARDWARE', 'ARMY SURPLUS', 'PAWN', 'LAUNDRY', 'VIDEO'];
    let sx = 1360;
    for (let k = 0; k < 7; k++) {
      const w = rng.range(15, 20);
      this.addBuilding('store', sx + w / 2, 492, 0, w, 24, { sign: shops[k], strip: true, margin: 0.2 });
      sx += w + 0.3;
    }
    this.addPave(1460, 550, 0, 230, 62);
    this.addBuilding('diner', 1640, 540, 0, 20, 11, { sign: 'DINER', margin: 3 });
    this.addPave(1640, 565, 0, 34, 18);
    this.addBuilding('bigbox', 1480, 745, Math.PI, 72, 50, { sign: 'MEGA MART', margin: 4 });
    this.addPave(1480, 665, 0, 110, 60);
    this.addBuilding('store', 1626, 700, Math.PI, 28, 22, { sign: 'FEED & SEED', margin: 3 });
    this.addPave(1626, 660, 0, 30, 30);
    this.addBuilding('motel', 1380, 820, -Math.PI / 2, 12, 56, { sign: 'MOTEL', margin: 3, floors: 1 });
    this.addPave(1350, 820, 0, 26, 60);
    this.addBuilding('store', 1240, 760, Math.PI / 2, 18, 20, { sign: 'PHARMACY', margin: 3 });

    // Pelican Harbor
    for (let k = 0; k < 5; k++) this.tryBuilding('warehouse', 2930 + k * 84, 870, Math.PI, 44, 26, { sign: k === 2 ? 'PELICAN SEAFOOD' : null, margin: 4 }, 1, 9);
    this.landmarks.push({ type: 'crane', x: 3010, z: 790, rot: 0 }, { type: 'crane', x: 3230, z: 790, rot: 0 });
    this.landmarks.push({ type: 'lighthouse', x: 3605, z: 262 });
    this.mark(3605, 262, 0, 14, 14, 2, OCC.BUILDING | OCC.NOBUILD);
    this.tryBuilding('house', 3560, 310, 0, 10, 9, { floors: 2, style: this.houseStyle(rng, 'harbor') });
    for (let k = 0; k < 3; k++) this.landmarks.push({ type: 'tank', x: 3640, z: 520 + k * 32 });
    this.mark(3640, 552, 0, 30, 96, 2, OCC.BUILDING | OCC.NOBUILD | OCC.NOTREE);
    this.addPave(3530, 720, 0, 130, 160, SURF.PAVE);
    for (let k = 0; k < 26; k++) {
      const cx = 3480 + (k % 6) * 18, cz = 660 + Math.floor(k / 6) * 30;
      const stack = rng.int(1, 3);
      for (let s = 0; s < stack; s++) this.addProp('container', cx, cz, 0, 1, { y: s * 2.6, color: rng.pick([0xc0392b, 0x2e6da4, 0x2f8f5b, 0xd68a1e, 0x7a7f87, 0x8e44ad]) });
    }
    this.addProp('pier', 2790, 420, Math.PI / 2, 1, { len: 60, w: 6 });
    this.addProp('pier', 2830, 600, Math.PI / 2, 1, { len: 50, w: 6 });
    this.addProp('pier', 3100, 745, Math.PI, 1, { len: 45, w: 10 });
    this.addProp('pier', 3380, 470, -Math.PI / 2, 1, { len: 40, w: 6 });

    // Bellerose
    this.addBuilding('cathedral', 3360, 1630, 0, 30, 44, { margin: 3 });
    this.mark(3360, 1700, 0, 110, 110, 0, OCC.NOBUILD);
    this.landmarks.push({ type: 'statue', x: 3360, z: 1705 });
    this.landmarks.push({ type: 'cemetery', x: 3240, z: 2345, w: 104, d: 190 });
    this.mark(3240, 2345, 0, 106, 192, 0, OCC.BUILDING | OCC.NOBUILD);
    for (let k = 0; k < 6; k++) this.tryBuilding('warehouse', 3680, 1520 + k * 110, Math.PI / 2, 26, 50, { sign: k === 1 ? 'COTTON EXCHANGE' : null, style: { wall: 0xa86a4a, wallTex: 'BRICK' }, margin: 3 }, 1, 9);
    this.addProp('boardwalk', 3755, 1850, 0, 1, { len: 760, w: 14 });
    this.addProp('pier', 3790, 1880, -Math.PI / 2, 1, { len: 60, w: 12 });
    this.addProp('pier', 3790, 1620, -Math.PI / 2, 1, { len: 40, w: 6 });
    this.addProp('pier', 3790, 2120, -Math.PI / 2, 1, { len: 40, w: 6 });

    // Cedar Ridge landmarks
    this.addBuilding('millhall', 2000, 840, 0.12, 26, 44, { margin: 4 });
    this.tryBuilding('shed', 1960, 900, 0.12, 10, 8, { sign: 'OFFICE' });
    for (let k = 0; k < 8; k++) this.addProp('logpile', 2040 + (k % 4) * 12, 880 + Math.floor(k / 4) * 14, 0.12, 1);
    this.mark(2060, 890, 0.12, 50, 30, 2, OCC.NOBUILD | OCC.NOTREE);
    this.landmarks.push({ type: 'radiotower', x: LOOKOUT_HILL.x, z: LOOKOUT_HILL.z });
    this.mark(LOOKOUT_HILL.x, LOOKOUT_HILL.z, 0, 14, 14, 2, OCC.BUILDING | OCC.NOBUILD);
    this.tryBuilding('cabin', LOOKOUT_HILL.x + 22, LOOKOUT_HILL.z + 10, -0.4, 9, 7, { sign: 'RANGER' }, 2, 6);
    // Fairgrounds
    this.addPave(2560, 2030, 0, 240, 190, SURF.DIRT);
    this.landmarks.push({ type: 'ferris', x: 2640, z: 2060, rot: 0.3 });
    this.addBuilding('fairbarn', 2480, 1990, 0, 20, 50, { margin: 2 });
    this.addBuilding('fairbarn', 2510, 2090, Math.PI / 2, 18, 44, { margin: 2 });
    this.landmarks.push({ type: 'grandstand', x: 2620, z: 1950, rot: Math.PI });
    for (let k = 0; k < 7; k++) this.landmarks.push({ type: 'tent', x: 2560 + Math.cos(k) * 45, z: 2040 + Math.sin(k * 1.7) * 40, rot: rng.range(0, 6), color: rng.pick([0xd9473a, 0x2f6fb5, 0xe6b422, 0x3a9a5b]) });
    // Quarry
    this.tryBuilding('shed', QUARRY.x + 120, QUARRY.z - 40, 0, 12, 8, { sign: 'QUARRY' }, 2, 8);
    // Gull Point
    this.tryBuilding('shack', 1745, 2770, 0, 10, 8, { sign: 'BAIT & TACKLE' }, 2, 6);
    this.addProp('pier', 1760, 2830, 0, 1, { len: 95, w: 8 });
    // Grain Co-op
    this.landmarks.push({ type: 'elevator', x: 1050, z: 1500, rot: 0.4 });
    this.mark(1050, 1500, 0.4, 30, 20, 2, OCC.BUILDING | OCC.NOBUILD | OCC.NOTREE);
    this.tryBuilding('warehouse', 1000, 1470, 0.4, 30, 18, { sign: 'GRAIN CO-OP', style: { wall: 0xb8bcc2, wallTex: 'METAL' } }, 1, 7);
    this.addPave(1020, 1530, 0.4, 70, 40, SURF.GRAVEL);

    // ---------- towns ----------
    // Millbrook downtown along Route 9
    const downtown = (cx, cz) => cx > 590 && cx < 1000 && Math.abs(cz - 595) < 60;
    this.alongRoad(R9, { start: 380, end: 820, spacing: [9.5, 12.5], setback: [2.5, 2.5], filter: downtown }, (r) => ({
      kind: 'shop', w: r.range(9, 12), d: r.range(16, 20), floors: r.chance(0.7) ? 2 : 1, gap: 0.2, margin: 0.3,
      sign: r.pick(['BARBER', 'BOOKS', 'BAKERY', 'TAVERN', 'HARDWARE', 'POST OFFICE', 'BANK', 'DRUGS', 'CAFE', 'TOYS', 'ANTIQUES', 'TAILOR', 'GUNS', 'MARKET']),
      style: { wall: r.pick([0xa3523f, 0x8f4a3a, 0xb8735a, 0xc9b79a, 0x7f8c6a, 0x9a6b4f]), wallTex: 'BRICK' },
    }));
    const townHouse = (r) => ({ kind: 'house', w: r.range(9, 13), d: r.range(8, 11), floors: r.chance(0.55) ? 2 : 1, style: this.houseStyle(r, 'millbrook'),
      after: (b) => this.yardExtras(b) });
    for (const st of this.roads.filter((r) => r.name.startsWith('Millbrook'))) {
      this.alongRoad(st, { spacing: [21, 28], setback: [6, 10] }, townHouse);
    }
    // rural residential lanes
    const rural = (r) => ({ kind: r.chance(0.2) ? 'farmhouse' : 'house', w: r.range(10, 14), d: r.range(9, 12), floors: r.chance(0.5) ? 2 : 1,
      style: this.houseStyle(r, 'rural'), after: (b) => this.yardExtras(b, true) });
    for (const n of ['Pine Ln', 'Hollow Ln', 'Maple Ln']) for (const r of roadsByName(n)) this.alongRoad(r, { spacing: [45, 80], setback: [10, 20] }, rural);
    this.alongRoad(R9, { start: 0, end: 330, spacing: [50, 85], setback: [12, 22] }, rural);

    // Bellerose townhouses on every cobbled street
    const bellColors = [0xe8b4a0, 0xf2d6a2, 0xa8cdbf, 0xc7b8e0, 0xf3c6c6, 0xb9d3e8, 0xe9e1c6, 0xd9a07a, 0x9fc5a8, 0xf0b77c];
    const townhouse = (r) => ({ kind: 'townhouse', w: r.range(8, 12), d: r.range(13, 17), floors: r.chance(0.6) ? 2 : 3, gap: 0.2, margin: 0.4,
      style: { wall: r.pick(bellColors), wallTex: 'STUCCO', trim: 0xfaf6ee, shutter: r.pick([0x2f5a3c, 0x23426a, 0x1f2d24, 0x5a7d6a]), roof: 0x5d5a58, balcony: r.chance(0.85) } });
    for (const r of this.roads.filter((rr) => rr.type === 'cobble')) this.alongRoad(r, { spacing: [8.5, 12.4], setback: [1.6, 1.6] }, townhouse);
    const r9Bell = (cx, cz) => cz > 1280 && cz < 2460;
    this.alongRoad(R9, { start: 0, end: R9.n * 4, spacing: [8.5, 12.4], setback: [1.8, 1.8], filter: r9Bell }, townhouse);

    // Harbor fishing village
    for (const n of ['Harbor W', 'Harbor E']) for (const r of roadsByName(n)) this.alongRoad(r, { spacing: [24, 40], setback: [5, 9] }, (rg) => ({
      kind: rg.chance(0.3) ? 'shack' : 'house', w: rg.range(8, 11), d: rg.range(7, 10), floors: rg.chance(0.4) ? 2 : 1,
      style: { ...this.houseStyle(rg, 'harbor'), wall: rg.pick([0xd8e3e8, 0x9fb7c9, 0xe9e2c8, 0x8fa89a, 0xc4a484]) },
    }));

    // ---------- farms ----------
    const farmRoads = ['Old Mill Rd', 'Haygood Ln', 'Creek Ln', 'Miller Ln', 'Orchard Ln', 'County Line Rd', 'Lakeview Rd', 'Ridge Rd', 'Redbarn Ln', 'Bayou Rd', 'Lookout Rd', 'Ridge Spur', 'Route 9'];
    for (const n of farmRoads) for (const r of roadsByName(n)) {
      this.alongRoad(r, { spacing: n === 'Route 9' ? [260, 420] : [200, 330], setback: [14, 26], start: 60, filter: (cx, cz) => {
        const reg = regionAt(cx, cz);
        return reg === 'farms' || reg === 'center' || (n === 'Route 9' && reg === 'millbrook' && cx < 450);
      } }, (rg, f, side) => this.farmstead(rg, f, side));
    }
    // special: Haygood horse ranch & Dawson orchard & Redbarn
    this.ranch(420, 1520);
    this.orchard(430, 2330);
    this.lakeCabins();
    this.bayouShacks();

    // homesteads scattered along gravel/dirt roads in Cedar Ridge
    for (const r of this.roads.filter((rr) => (rr.type === 'gravel' || rr.type === 'dirt'))) {
      this.alongRoad(r, { spacing: [90, 160], setback: [10, 18], chance: 0.6, filter: (cx, cz) => regionAt(cx, cz) === 'center' || regionAt(cx, cz) === 'farms' }, (rg) => ({
        kind: rg.chance(0.4) ? 'cabin' : 'house', w: rg.range(8, 12), d: rg.range(7, 10), floors: 1, style: this.houseStyle(rg, 'rural'),
        after: (b) => this.yardExtras(b, true),
      }));
    }
    this.placeFields();
  }

  yardExtras(b, rural = false) {
    const rng = this.rng;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const toW = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    // mailbox at the road
    if (b.roadSide && rng.chance(0.8)) this.addProp('mailbox', b.roadSide.x + (rng.next() - 0.5) * 4, b.roadSide.z, b.rot, 1);
    // shed or garage beside / behind
    if (rng.chance(rural ? 0.6 : 0.35)) {
      const side = rng.sign();
      const [x, z] = toW(side * (b.w / 2 + 6), -b.d / 2 - 4);
      this.tryBuilding(rng.chance(0.5) ? 'shed' : 'garage', x, z, b.rot, rng.range(5, 7), rng.range(5, 7), {}, 1.5, 3);
    }
    if (rng.chance(0.35)) {
      const [x, z] = toW(rng.sign() * (b.w / 2 + 3.5), b.d / 2 + 4);
      this.addProp(rng.chance(0.75) ? 'car' : 'truck', x, z, b.rot + Math.PI / 2 + rng.range(-0.1, 0.1), 1, { color: this.carColor(rng) });
    }
    if (!rural && rng.chance(0.4)) {
      // picket fence along the front yard
      const [x1, z1] = toW(-b.w / 2 - 3, b.d / 2 + 5);
      const [x2, z2] = toW(b.w / 2 + 3, b.d / 2 + 5);
      this.fences.push({ x1, z1, x2, z2, kind: 'picket', gap: 0.5 });
    }
  }
  carColor(rng) { return rng.pick([0xb03a2e, 0x2e5c8a, 0xe8e4da, 0x2b2b2b, 0x6d7b4c, 0xc49a3a, 0x7d8a92, 0x4a6a5a, 0x8a3f6b, 0xd36b2d]); }

  farmstead(rng, f, side) {
    // farmhouse by the road, red barn + silos behind, sheds, pond, hay bales
    const spec = { kind: 'farmhouse', w: rng.range(12, 15), d: rng.range(10, 12), floors: 2,
      style: { ...this.houseStyle(rng, 'farm'), wall: rng.pick([0xf6f3ea, 0xf6f3ea, 0xe9e2c8, 0xd8d3cc]), porch: true }, margin: 3 };
    spec.after = (b) => {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const toW = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
      const lat = rng.sign() * rng.range(18, 30);
      const back = -rng.range(38, 55);
      const [bx, bz] = toW(lat, back);
      const barnRot = b.rot + (rng.chance(0.5) ? 0 : Math.PI / 2) + rng.range(-0.05, 0.05);
      const barnColor = rng.pick([0xa3302a, 0xa3302a, 0x9a2c26, 0x8c3a2c, 0x6f6a62, 0xb8a57a]);
      const barn = this.tryBuilding('barn', bx, bz, barnRot, rng.range(16, 20), rng.range(24, 30), { style: { wall: barnColor, roof: rng.pick([0x5a5f66, 0x3c4148, 0x7d3a2a]), trim: 0xf4f1ea } }, 3, 6);
      if (barn) {
        const sc = Math.cos(barnRot), ss = Math.sin(barnRot);
        const nSilo = rng.int(1, 3);
        for (let k = 0; k < nSilo; k++) {
          const lx = barn.w / 2 + 6 + k * 8.5, lz = -barn.d / 4;
          const x = barn.x + lx * sc + lz * ss, z = barn.z - lx * ss + lz * sc;
          if (this.canPlace(x, z, 0, 8, 8, 0.5)) {
            this.landmarks.push({ type: 'silo', x, z, r: rng.range(3, 3.8), h: rng.range(13, 19), dome: rng.chance(0.7), color: rng.pick([0xb9bec4, 0xd6d0c4, 0x9aa3a8]) });
            this.mark(x, z, 0, 8, 8, 0.5, OCC.BUILDING | OCC.NOBUILD | OCC.NOTREE);
          }
        }
        // hay bales near barn
        for (let k = 0; k < rng.int(2, 7); k++) {
          const lx = rng.range(-barn.w, barn.w), lz = barn.d / 2 + rng.range(4, 14);
          this.addProp('haybale', barn.x + lx * sc + lz * ss, barn.z - lx * ss + lz * sc, rng.range(0, 6), 1);
        }
        if (rng.chance(0.6)) {
          const lx = -barn.w / 2 - 6, lz = barn.d / 3;
          this.addProp('tractor', barn.x + lx * sc + lz * ss, barn.z - lx * ss + lz * sc, barnRot + rng.range(-0.5, 0.5), 1, { color: rng.pick([0x2f7d32, 0xc0392b, 0xe67e22]) });
        }
        if (rng.chance(0.35)) {
          const lx = barn.w / 2 + 14, lz = barn.d / 2 + 10;
          this.landmarks.push({ type: 'windmill', x: barn.x + lx * sc + lz * ss, z: barn.z - lx * ss + lz * sc });
        }
      }
      if (rng.chance(0.55)) {
        const [x, z] = toW(-lat * 0.8, back - 10);
        this.tryBuilding('shed', x, z, b.rot + rng.range(-0.2, 0.2), rng.range(6, 9), rng.range(5, 7), {}, 1.5, 4);
      }
      if (rng.chance(0.3)) {
        const [x, z] = toW(-lat * 1.6, back - 30);
        this.addPond(x, z, rng.range(12, 22));
      }
      if (b.roadSide) this.addProp('mailbox', b.roadSide.x, b.roadSide.z, b.rot, 1);
      if (rng.chance(0.5)) {
        const [x, z] = toW(rng.sign() * (b.w / 2 + 4), b.d / 2 + 3);
        this.addProp('truck', x, z, b.rot + Math.PI / 2, 1, { color: this.carColor(rng) });
      }
      b.farm = { barn: barn ? barn.id : -1 };
      this.lots.push({ x: b.x, z: b.z, rot: b.rot, farm: true });
    };
    return spec;
  }

  addPond(x, z, r) {
    if (!this.canPlace(x, z, 0, r * 2.8, r * 2.8, 0, OCC.ROAD | OCC.BUILDING | OCC.WATER, 6, 40)) return;
    let rim = 1e9;
    for (let a = 0; a < 16; a++) rim = Math.min(rim, this.heightAt(x + Math.cos(a * 0.39) * r * 1.3, z + Math.sin(a * 0.39) * r * 1.3));
    const level = rim - 0.5;
    this.forRect(x, z, 0, r * 5, r * 5, 0, (i, lx, lz) => {
      const e = Math.hypot(lx, lz) / r;
      const orig = this.height[i];
      const bowl = e < 1 ? level - 0.4 - 2.2 * Math.pow(1 - e, 0.7) : level - 0.4 + (e - 1) * r * 0.22;
      const berm = e > 1 ? level - 0.4 + Math.min(0.9, (e - 1) * r * 0.22) - Math.max(0, e - 1.5) * r * 0.18 : -1e9;
      this.height[i] = Math.max(Math.min(orig, bowl), berm);
      if (e < 1.1) this.occ[i] |= OCC.WATER;
      if (e < 1.6) this.occ[i] |= OCC.NOBUILD;
      if (e < 1.05) this.occ[i] |= OCC.NOTREE;
    });
    this.ponds.push({ x, z, r, level });
  }

  ranch(x, z) {
    const rng = this.rng;
    this.tryBuilding('farmhouse', x, z - 40, 0, 16, 12, { floors: 2, style: { ...this.houseStyle(rng, 'farm'), wall: 0xf6f3ea, roof: 0x2f3b33, porch: true } }, 2, 6);
    this.tryBuilding('barn', x + 50, z + 10, Math.PI / 2, 16, 34, { style: { wall: 0x2f2a26, roof: 0x5a5f66, trim: 0xf4f1ea }, sign: 'HAYGOOD' }, 2, 6);
    this.tryBuilding('barn', x - 40, z + 30, 0, 14, 22, { style: { wall: 0xa3302a, roof: 0x5a5f66, trim: 0xf4f1ea } }, 2, 6);
    // white-fenced horse paddocks (the Kentucky look)
    for (let k = 0; k < 3; k++) {
      const fx = x - 120 + k * 115, fz = z + 120;
      const w = 100, d = 120;
      if (this.canPlace(fx, fz, 0, w, d, 1, OCC.ROAD | OCC.BUILDING | OCC.WATER | OCC.FIELD, 12)) {
        this.fields.push({ x: fx, z: fz, rot: 0, w, d, crop: 'pasture', fence: 'rail-white', animals: 'horse' });
        this.mark(fx, fz, 0, w, d, 0, OCC.FIELD | OCC.NOBUILD);
      }
    }
  }
  orchard(x, z) {
    const rng = this.rng;
    this.tryBuilding('farmhouse', x + 90, z - 70, Math.PI / 2, 13, 11, { floors: 2, style: { ...this.houseStyle(rng, 'farm'), porch: true } }, 2, 6);
    this.tryBuilding('shack', x + 140, z + 10, -Math.PI / 2, 9, 6, { sign: 'APPLES' }, 2, 6);
    for (let k = 0; k < 2; k++) {
      const fx = x - 30 + k * 0, fz = z - 40 + k * 120;
      if (this.canPlace(fx, fz, 0, 150, 100, 1, OCC.ROAD | OCC.BUILDING | OCC.WATER | OCC.FIELD, 14)) {
        this.fields.push({ x: fx, z: fz, rot: 0, w: 150, d: 100, crop: 'orchard', fence: 'rail' });
        this.mark(fx, fz, 0, 150, 100, 0, OCC.FIELD | OCC.NOBUILD | OCC.NOTREE);
      }
    }
  }
  lakeCabins() {
    const rng = this.rng;
    for (let k = 0; k < 14; k++) {
      const t = -Math.PI * 0.95 + (k / 13) * Math.PI * 1.1 + rng.range(-0.05, 0.05);
      const e = 1.75 + rng.range(0, 0.25);
      const x = LAKE.x + Math.cos(t) * LAKE.rx * e, z = LAKE.z + Math.sin(t) * LAKE.rz * e;
      const rot = Math.atan2(LAKE.x - x, LAKE.z - z);
      const b = this.tryBuilding('cabin', x, z, rot, rng.range(8, 10), rng.range(7, 8), { floors: rng.chance(0.25) ? 2 : 1 }, 2, 6);
      if (b && rng.chance(0.6)) {
        const px = LAKE.x + Math.cos(t) * LAKE.rx * 1.05, pz = LAKE.z + Math.sin(t) * LAKE.rz * 1.05;
        this.addProp('pier', px, pz, rot + Math.PI, 1, { len: 18, w: 3, lake: true });
      }
    }
    this.tryBuilding('boathouse', LAKE.x + LAKE.rx * 1.3, LAKE.z + 20, -Math.PI / 2, 12, 16, { sign: 'BOATS' }, 1, 7);
  }
  bayouShacks() {
    const rng = this.rng;
    for (let k = 0; k < 9; k++) {
      const x = 2900 + rng.range(-150, 150), z = 1560 + rng.range(-140, 140);
      this.tryBuilding('shack', x, z, rng.range(0, 6.28), rng.range(7, 10), rng.range(6, 8), { stilts: true }, 2, 5);
    }
    for (let k = 0; k < 6; k++) this.addPond(2900 + rng.range(-180, 180), 1560 + rng.range(-160, 160), rng.range(14, 30));
  }

  placeFields() {
    const rng = this.rng;
    const crops = [['corn', 3], ['wheat', 3], ['soy', 2], ['plowed', 1], ['pasture', 2.5], ['hay', 1]];
    let attempts = 0, placed = 0;
    while (attempts < 9000 && placed < 170) {
      attempts++;
      const x = rng.range(200, 3100), z = rng.range(1050, 2850);
      const reg = regionAt(x, z);
      if (reg !== 'farms' && !(reg === 'center' && rng.chance(0.35))) continue;
      const nr = this.nearestRoad(x, z, 200);
      if (!nr) continue;
      const f = this.roadFrame(nr.road, nr.k);
      const rot = Math.atan2(f.tx, f.tz);
      const w = rng.range(70, 190), d = rng.range(70, 210);
      if (!this.canPlace(x, z, rot, w, d, 3, OCC.ROAD | OCC.BUILDING | OCC.FIELD | OCC.WATER | OCC.NOBUILD, 14, 30)) continue;
      const crop = rng.weighted(crops);
      const fence = crop === 'pasture' ? (rng.chance(0.3) ? 'rail-white' : 'rail') : (rng.chance(0.3) ? 'wire' : null);
      this.fields.push({ x, z, rot, w, d, crop, fence, animals: crop === 'pasture' ? rng.pick(['cow', 'cow', 'horse', null]) : null });
      this.mark(x, z, rot, w, d, 0, OCC.FIELD | OCC.NOTREE);
      this.mark(x, z, rot, w, d, 2, OCC.NOBUILD);
      // lone shade oak in pastures
      if (crop === 'pasture' && rng.chance(0.7)) this.lots.push({ loneOak: true, x: x + rng.range(-w / 3, w / 3), z: z + rng.range(-d / 3, d / 3) });
      if ((crop === 'hay' || crop === 'wheat') && rng.chance(0.6)) {
        for (let k = 0; k < rng.int(4, 12); k++) {
          const lx = rng.range(-w / 2 + 6, w / 2 - 6), lz = rng.range(-d / 2 + 6, d / 2 - 6);
          const c = Math.cos(rot), s = Math.sin(rot);
          this.addProp('haybale', x + lx * c + lz * s, z - lx * s + lz * c, rng.range(0, 6), 1, { field: true });
        }
      }
      placed++;
    }
    // field fences
    for (const fd of this.fields) {
      if (!fd.fence) continue;
      const c = Math.cos(fd.rot), s = Math.sin(fd.rot);
      const hw = fd.w / 2 + 1, hd = fd.d / 2 + 1;
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [fd.x + lx * c + lz * s, fd.z - lx * s + lz * c]);
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b = corners[(k + 1) % 4];
        this.fences.push({ x1: a[0], z1: a[1], x2: b[0], z2: b[1], kind: fd.fence, gap: k === 2 ? 0.5 : 0 });
      }
    }
  }

  flattenPads() {
    for (const b of this.buildings) {
      let sum = 0, n = 0, hmax = -1e9;
      this.forRect(b.x, b.z, b.rot, b.w, b.d, 0, (i) => { sum += this.height[i]; n++; hmax = Math.max(hmax, this.height[i]); });
      const base = n ? Math.max(sum / n + 0.15, hmax - 0.6) : this.heightAt(b.x, b.z);
      b.y = base;
      const m = 6;
      this.forRect(b.x, b.z, b.rot, b.w, b.d, m, (i, lx, lz) => {
        const ox = Math.max(0, Math.abs(lx) - b.w / 2), oz = Math.max(0, Math.abs(lz) - b.d / 2);
        const t = smoothstep(m, 0.5, Math.hypot(ox, oz));
        // don't disturb roads
        const keep = this.occ[i] & OCC.ROAD ? 0.15 : 1;
        this.height[i] = lerp(this.height[i], base - 0.12, t * keep);
      });
    }
    for (const p of this.parking) {
      const base = this.heightAt(p.x, p.z);
      this.forRect(p.x, p.z, p.rot, p.w, p.d, 4, (i, lx, lz) => {
        const ox = Math.max(0, Math.abs(lx) - p.w / 2), oz = Math.max(0, Math.abs(lz) - p.d / 2);
        const t = smoothstep(4, 0, Math.hypot(ox, oz));
        if (!(this.occ[i] & OCC.BUILDING)) this.height[i] = lerp(this.height[i], base, t * 0.85);
      });
    }
    for (const l of this.landmarks) l.y = this.heightAt(l.x, l.z);
    for (const p of this.props) if (p.data && p.data.lake) p.y = this.lake.level + 0.6;
  }

  classifySurface() {
    const nz = this.noise;
    for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
      const i = gz * GW + gx;
      const x = gx * CELL, z = gz * CELL;
      const d = this.coast[i];
      const h = this.height[i];
      // forest density
      const reg = this.regionField(2, x, z);
      let fo = nz.fbm(x / 520 + 9, z / 520 - 4, 4) * 0.9 + reg + 0.05;
      fo += smoothstep(30, 70, h) * 0.15;
      this.forest[i] = clamp(smoothstep(0.08, 0.42, fo), 0, 1);
      if (this.occ[i] & OCC.PAVE) continue;
      // slope
      const hl = this.height[i - (gx > 0 ? 1 : 0)], hr = this.height[i + (gx < GW - 1 ? 1 : 0)];
      const hu = this.height[i - (gz > 0 ? GW : 0)], hd = this.height[i + (gz < GH - 1 ? GW : 0)];
      const slope = Math.hypot(hr - hl, hd - hu) / (2 * CELL);
      let s = SURF.GRASS;
      if (h < -0.3) s = SURF.SEABED;
      else if (d < 38 + nz.noise(x / 50, z / 50) * 14 && this.quayWeight(x, z) < 0.5) s = SURF.SAND;
      else if (slope > 0.62) s = SURF.ROCK;
      else if (this.forest[i] > 0.55) s = SURF.FOREST;
      else if (nz.noise(x / 180, z / 180) > 0.45) s = SURF.DRYGRASS;
      if (this.lake && this.ellipseE(x, z) < 1.25) s = SURF.MUD;
      if (this.occ[i] & OCC.WATER && s !== SURF.SEABED) s = SURF.MUD;
      if (this.quarryFloor !== undefined) {
        const dx = (x - QUARRY.x) / QUARRY.rx, dz = (z - QUARRY.z) / QUARRY.rz;
        if (dx * dx + dz * dz < 1.6) s = SURF.ROCK;
      }
      this.surf[i] = s;
    }
    // fields
    const cropSurf = { corn: SURF.CORN, wheat: SURF.WHEAT, soy: SURF.SOIL, plowed: SURF.SOIL, pasture: SURF.PASTURE, hay: SURF.WHEAT, orchard: SURF.PASTURE };
    for (const f of this.fields) this.forRect(f.x, f.z, f.rot, f.w, f.d, 0, (i) => { this.surf[i] = cropSurf[f.crop]; });
    // lawns in towns around buildings
    for (const b of this.buildings) {
      const reg = regionAt(b.x, b.z);
      if (reg === 'millbrook' || reg === 'harbor') this.forRect(b.x, b.z, b.rot, b.w, b.d, 8, (i) => {
        if (!(this.occ[i] & (OCC.ROAD | OCC.PAVE)) && this.surf[i] !== SURF.SAND) this.surf[i] = SURF.LAWN;
      });
      if (reg === 'bellerose' || b.kind === 'shop' || b.strip) this.forRect(b.x, b.z, b.rot, b.w, b.d, 3, (i) => {
        if (!(this.occ[i] & OCC.ROAD)) this.surf[i] = reg === 'bellerose' ? SURF.COBBLE : SURF.PAVE;
      });
      if (b.kind === 'barn' || b.kind === 'farmhouse') this.forRect(b.x, b.z, b.rot, b.w, b.d, 6, (i) => {
        if (!(this.occ[i] & OCC.ROAD) && this.surf[i] <= SURF.DRYGRASS) this.surf[i] = SURF.DIRT;
      });
    }
    // roads paint (for far LOD and under-ribbon color)
    const typeSurf = { 1: SURF.ASPHALT, 2: SURF.ASPHALT, 3: SURF.ASPHALT, 4: SURF.COBBLE, 5: SURF.GRAVEL, 6: SURF.DIRTROAD };
    for (let i = 0; i < this.surf.length; i++) if (this.roadType[i]) this.surf[i] = typeSurf[this.roadType[i]];
  }

  placeTrees() {
    const rng = new RNG(this.seed + 5);
    const xs = [], zs = [], ss = [], rs = [], ts = [], cs = [];
    const nz = this.noise2;
    const okAt = (x, z, extra = 0) => {
      if (x < 20 || z < 20 || x > WORLD.W - 20 || z > WORLD.H - 20) return false;
      const gx = Math.round(x / CELL), gz = Math.round(z / CELL);
      const i = gz * GW + gx;
      if (this.occ[i] & (OCC.ROAD | OCC.NOTREE | OCC.BUILDING | OCC.FIELD | OCC.WATER | OCC.PAVE)) return false;
      if (this.coast[i] < 10 + extra) return false;
      if (this.height[i] < 0.6) return false;
      return true;
    };
    const pickType = (x, z, h, reg) => {
      const c = this.sampleGrid(this.coast, x, z);
      const r = rng.next();
      if (reg === 'bellerose' || (Math.hypot(x - 2900, z - 1560) < 260)) return r < 0.75 ? TREE.LIVEOAK : TREE.ROUND;
      if (c < 140) return r < 0.65 ? TREE.PINE : TREE.ROUND;
      if (h > 48) return r < 0.6 ? TREE.PINE : r < 0.85 ? TREE.ROUND : TREE.OAK;
      if (reg === 'center') return r < 0.3 ? TREE.OAK : r < 0.68 ? TREE.ROUND : r < 0.95 ? TREE.PINE : TREE.DEAD;
      return r < 0.5 ? TREE.OAK : r < 0.9 ? TREE.ROUND : TREE.PINE;
    };
    const push = (x, z, type, scale) => {
      xs.push(x); zs.push(z); ss.push(scale); rs.push(rng.next() * Math.PI * 2); ts.push(type); cs.push(rng.next());
    };
    // forests
    const SP = 7.5;
    for (let z = 0; z < WORLD.H; z += SP) for (let x = 0; x < WORLD.W; x += SP) {
      const px = x + rng.range(-3.5, 3.5), pz = z + rng.range(-3.5, 3.5);
      const f = this.sampleGrid(this.forest, px, pz);
      if (f < 0.05) {
        // sparse lone trees in open country
        if (rng.chance(0.004) && okAt(px, pz)) push(px, pz, rng.chance(0.6) ? TREE.OAK : TREE.ROUND, rng.range(1.1, 1.6));
        else if (rng.chance(0.006) && okAt(px, pz)) push(px, pz, TREE.BUSH, rng.range(0.8, 1.4));
        continue;
      }
      if (!rng.chance(f * 0.85)) continue;
      if (!okAt(px, pz)) continue;
      const h = this.heightAt(px, pz);
      const reg = regionAt(px, pz);
      if (rng.chance(0.18)) push(px, pz, TREE.BUSH, rng.range(0.8, 1.5));
      else push(px, pz, pickType(px, pz, h, reg), rng.range(0.8, 1.3));
    }
    // roadside tree lines (some stretches form tunnels like old Georgia lanes)
    for (const r of this.roads) {
      if (r.type === 'cobble' || r.type === 'street') continue;
      const reg0 = regionAt(r.xs[0], r.zs[0]);
      for (let k = 2; k < r.n - 2; k += 3) {
        const f = this.roadFrame(r, k);
        const v = nz.fbm(f.x / 300, f.z / 300, 2);
        const reg = regionAt(f.x, f.z);
        if (reg === 'retail' || reg === 'bellerose') continue;
        const thresh = r.type === 'dirt' ? -0.1 : r.type === 'gravel' ? 0.0 : 0.15;
        if (v < thresh) continue;
        for (const side of [1, -1]) {
          if (!rng.chance(0.7)) continue;
          const off = r.width / 2 + rng.range(5.5, 8.5);
          const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
          if (!okAt(x, z)) continue;
          const tunnel = v > 0.35 && (r.type === 'dirt' || r.type === 'gravel');
          push(x, z, tunnel ? (rng.chance(0.7) ? TREE.LIVEOAK : TREE.OAK) : (rng.chance(0.55) ? TREE.OAK : TREE.ROUND), tunnel ? rng.range(1.2, 1.6) : rng.range(0.95, 1.35));
        }
      }
      void reg0;
    }
    // lone shade oaks in pastures
    for (const l of this.lots) if (l.loneOak) { xs.push(l.x); zs.push(l.z); ss.push(rng.range(1.5, 2.0)); rs.push(rng.next() * 6.28); ts.push(TREE.OAK); cs.push(rng.next()); }
    // orchard rows
    for (const f of this.fields) {
      if (f.crop !== 'orchard') continue;
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      for (let lz = -f.d / 2 + 6; lz < f.d / 2 - 4; lz += 9) for (let lx = -f.w / 2 + 6; lx < f.w / 2 - 4; lx += 8) {
        xs.push(f.x + lx * c + lz * s); zs.push(f.z - lx * s + lz * c); ss.push(rng.range(0.85, 1.05)); rs.push(rng.next() * 6.28); ts.push(TREE.APPLE); cs.push(rng.next());
      }
    }
    // town street trees
    for (const r of this.roads) {
      if (r.type !== 'street' && !(r.type === 'cobble' && rng.chance(0.4))) continue;
      for (let k = 3; k < r.n - 3; k += rng.int(5, 8)) {
        const f = this.roadFrame(r, k);
        const side = rng.sign();
        const off = r.width / 2 + 2.6;
        const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
        const i = this.idx(Math.round(x / CELL), Math.round(z / CELL));
        if (this.occ[i] & (OCC.BUILDING | OCC.WATER)) continue;
        push(x, z, r.type === 'cobble' ? TREE.LIVEOAK : TREE.ROUND, rng.range(0.8, 1.05));
      }
    }
    // cathedral square & park
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      push(3360 + Math.cos(a) * 42, 1705 + Math.sin(a) * 38, TREE.LIVEOAK, rng.range(0.9, 1.2));
      push(770 + Math.cos(a) * 50, 690 + Math.sin(a) * 55, rng.chance(0.5) ? TREE.OAK : TREE.ROUND, rng.range(0.9, 1.2));
    }
    const n = xs.length;
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = this.heightAt(xs[i], zs[i]);
    this.trees = { n, x: Float32Array.from(xs), z: Float32Array.from(zs), y, s: Float32Array.from(ss), r: Float32Array.from(rs), t: Uint8Array.from(ts), c: Float32Array.from(cs), alive: new Uint8Array(n).fill(1) };
    // rocks in the hills and quarry
    for (let k = 0; k < 2600; k++) {
      const x = rng.range(1300, 3000), z = rng.range(200, 2850);
      if (!okAt(x, z)) continue;
      const h = this.heightAt(x, z);
      if (regionAt(x, z) !== 'center' || (h < 22 && !rng.chance(0.25))) continue;
      this.rocks.push({ x, z, y: h, s: rng.range(0.8, 2.6), r: rng.next() * 6.28 });
    }
    for (let k = 0; k < 70; k++) {
      const a = rng.next() * Math.PI * 2, e = rng.range(0.2, 1.1);
      const x = QUARRY.x + Math.cos(a) * QUARRY.rx * e, z = QUARRY.z + Math.sin(a) * QUARRY.rz * e;
      this.rocks.push({ x, z, y: this.heightAt(x, z), s: rng.range(1, 3), r: rng.next() * 6.28 });
    }
  }

  placeRoadside() {
    const rng = new RNG(this.seed + 9);
    // power poles + wires along main roads (the wires-over-the-fields look)
    for (const r of this.roads) {
      if (!(r.type === 'highway' || r.type === 'country' || r.type === 'gravel')) continue;
      let prev = null;
      const side = r.id % 2 ? 1 : -1;
      for (let k = 4; k < r.n - 2; k += 11) {
        const f = this.roadFrame(r, k);
        const reg = regionAt(f.x, f.z);
        if (reg === 'bellerose') { prev = null; continue; }
        const off = r.width / 2 + 3.2;
        const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
        const i = this.idx(Math.round(x / CELL), Math.round(z / CELL));
        if (this.occ[i] & (OCC.BUILDING | OCC.WATER) || this.coast[i] < 6) { prev = null; continue; }
        const pole = { x, z, y: this.heightAt(x, z), rot: Math.atan2(f.tx, f.tz) };
        this.poles.push(pole);
        if (prev) this.wires.push([prev, pole]);
        prev = pole;
      }
    }
    // farm road fences (post & rail) on open stretches
    for (const r of this.roads) {
      if (!(r.type === 'country' || r.type === 'dirt' || r.type === 'gravel')) continue;
      for (const side of [1, -1]) {
        let run = null;
        for (let k = 2; k < r.n - 2; k += 2) {
          const f = this.roadFrame(r, k);
          const reg = regionAt(f.x, f.z);
          const off = r.width / 2 + 2.2;
          const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
          const i = this.idx(Math.round(x / CELL), Math.round(z / CELL));
          const v = this.noise.noise(f.x / 260 + side * 7, f.z / 260);
          const ok = (reg === 'farms' || reg === 'center') && v > -0.05 && !(this.occ[i] & (OCC.BUILDING | OCC.WATER | OCC.PAVE)) && this.coast[i] > 10;
          // avoid crossing other roads
          let crossing = false;
          if (ok) { const nr = this.nearestRoad(x, z, 6); if (nr && nr.road !== r && nr.d < 3) crossing = true; }
          if (ok && !crossing) {
            if (!run) run = { x, z, kind: reg === 'farms' && v > 0.35 ? 'rail-white' : 'rail' };
            else {
              this.fences.push({ x1: run.x, z1: run.z, x2: x, z2: z, kind: run.kind, gap: 0 });
              run = { x, z, kind: run.kind };
            }
          } else run = null;
        }
      }
    }
    // abandoned cars along roads + parked cars in towns
    for (const r of this.roads) {
      const town = r.type === 'street' || r.type === 'cobble';
      const step = town ? 9 : 40;
      for (let k = 3; k < r.n - 3; k += rng.int(step, step * 2)) {
        if (!town && !rng.chance(r.type === 'highway' ? 0.55 : 0.25)) continue;
        const f = this.roadFrame(r, k);
        const side = rng.sign();
        const off = town ? r.width / 2 - 1.3 : rng.range(0, r.width / 2);
        const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
        const rot = Math.atan2(f.tx, f.tz) + (town ? (side > 0 ? 0 : Math.PI) : rng.range(-0.6, 0.6));
        this.addProp(rng.chance(0.75) ? 'car' : 'truck', x, z, rot, 1, { color: this.carColor(rng), wreck: !town && rng.chance(0.3) });
      }
    }
    // parking lots
    for (const p of this.parking) {
      const n = Math.floor((p.w * p.d) / 400);
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      for (let k = 0; k < n; k++) {
        if (!rng.chance(0.6)) continue;
        const lx = rng.range(-p.w / 2 + 4, p.w / 2 - 4), lz = rng.range(-p.d / 2 + 3, p.d / 2 - 3);
        this.addProp(rng.chance(0.8) ? 'car' : 'truck', p.x + lx * c + lz * s, p.z - lx * s + lz * c, p.rot + (rng.chance(0.5) ? 0 : Math.PI) + rng.range(-0.15, 0.15), 1, { color: this.carColor(rng) });
      }
    }
    // Bellerose gas lamps & benches
    for (const r of this.roads.filter((rr) => rr.type === 'cobble')) {
      for (let k = 4; k < r.n - 4; k += 7) {
        const f = this.roadFrame(r, k);
        for (const side of [1, -1]) {
          const off = r.width / 2 + 0.8;
          this.addProp('lamp', f.x + f.nx * side * off, f.z + f.nz * side * off, 0, 1);
        }
      }
    }
    // misc farm clutter
    for (const b of this.buildings) {
      if (b.kind !== 'barn' && b.kind !== 'warehouse' && b.kind !== 'store' && b.kind !== 'bigbox') continue;
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      for (let k = 0; k < rng.int(1, 4); k++) {
        const lx = rng.sign() * (b.w / 2 + 1.6), lz = rng.range(-b.d / 2, b.d / 2);
        this.addProp(b.kind === 'barn' ? 'barrel' : rng.chance(0.5) ? 'dumpster' : 'crate', b.x + lx * c + lz * s, b.z - lx * s + lz * c, b.rot, 1);
      }
    }
    for (const p of this.props) if (p.y === undefined) p.y = this.heightAt(p.x, p.z);
  }
}
