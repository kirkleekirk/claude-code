// Terrain heightfield: analytic base shape (rolling hills west, town terrace
// east, river beyond), then stamps for building pads, roads and fields.
// Rendering uses chunked meshes; the playable middle is 2 m resolution,
// the scenery ring is coarser. Heights are queried with the same
// triangulation the mesh uses, so feet never float or sink.
import * as THREE from 'three';
import { makeNoise2D, smoothstep, clamp, lerp } from '../util.js';

// The farm country lies a long way west of town: everything out there sits
// FARM_SHIFT metres west of where the old, smaller county had it, and the
// land around Carver's Crossing (NEW_LAND) fills the gap in between.
export const FARM_SHIFT = 640;
export const NEW_LAND = { x0: -26 - FARM_SHIFT, x1: -26 };
export const T = {
  // full heightfield extent (includes scenery beyond the play area)
  x0: -448 - FARM_SHIFT, x1: 640, z0: -384, z1: 384, res: 2,
  // playable bounds (invisible walls)
  play: { x0: -312 - FARM_SHIFT, x1: 222, z0: -248, z1: 248 },
  water: 0,
  town: { x0: 66, x1: 190, z0: -134, z1: 134 },
  floodwallX: 190,
};
T.nx = Math.round((T.x1 - T.x0) / T.res) + 1;
T.nz = Math.round((T.z1 - T.z0) / T.res) + 1;

const n1 = makeNoise2D(1337), n2 = makeNoise2D(4242), n3 = makeNoise2D(777), n4 = makeNoise2D(9001);

// Town terrace: downtown blocks sit level; the streets slope between them
// and drop toward the river on the last block (like an old river town).
export const TOWN_KNOTS = [[40, 11.9], [90, 11.1], [122, 11.1], [134, 10.3], [170, 10.3], [192, 8.5], [240, 8.5]];
export function townPlane(x) {
  const K = TOWN_KNOTS;
  if (x <= K[0][0]) return K[0][1];
  for (let i = 0; i < K.length - 1; i++) {
    const [x0, y0] = K[i], [x1, y1] = K[i + 1];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return K[K.length - 1][1];
}
// River edges
export function riverNear(z) {
  const inTown = 1 - smoothstep(130, 175, Math.abs(z));
  return lerp(203 + 5 * n4(z / 90, 3.1), 222, inTown);
}
export function riverFar(z) { return 334 + 16 * Math.sin(z / 170) + 6 * n4(z / 60, 7.3); }

// Turkey Creek: a shallow wooded valley winding north-south through the new land
export function creekX(z) { return -312 + 24 * Math.sin(z / 96 + 0.6) + 9 * Math.sin(z / 37 + 2.1); }
export const CREEK = { half: 30, depth: 5.2, channel: 2.6, chanHalf: 3.2 };
const CROSSING_AT = [-470, -10], CROSSING_Y = 22.5;
// the rolling hills of the farm country (no town, no river)
function hillsAt(x, z) { return 25 + 11 * n1(x / 230, z / 230) + 5 * n2(x / 95 + 3, z / 95) + 1.4 * n3(x / 33, z / 33); }
// the land between: the same kind of hills, a little broader and lower, with
// the creek valley cut through it; it runs into the real ground on both sides
function newLandHeight(x, z) {
  let h = 23 + 9 * n1((x + 4100) / 250, (z - 900) / 250) + 4 * n2((x + 4100) / 105, z / 105 + 7) + 1.3 * n3(x / 34 + 40, z / 34);
  // Carver's Crossing sits on a broad level shelf of ground
  const cd = Math.hypot(x - CROSSING_AT[0], (z - CROSSING_AT[1]) * 0.85);
  h = lerp(h, CROSSING_Y, 1 - smoothstep(60, 125, cd));
  const d = Math.abs(x - creekX(z));
  h -= CREEK.depth * (1 - smoothstep(CREEK.chanHalf, CREEK.half, d));
  h -= CREEK.channel * (1 - smoothstep(CREEK.chanHalf * 0.4, CREEK.chanHalf + 1.5, d));
  const band = 120;
  if (x < (NEW_LAND.x0 + NEW_LAND.x1) / 2) {
    const e = smoothstep(NEW_LAND.x0, NEW_LAND.x0 + band, x);
    return lerp(hillsAt(x + FARM_SHIFT, z), h, e);
  }
  const e = 1 - smoothstep(NEW_LAND.x1 - band, NEW_LAND.x1, x);
  return lerp(oldBaseHeight(x, z), h, e);
}
export function baseHeight(x, z) {
  if (x <= NEW_LAND.x0) return oldBaseHeight(x + FARM_SHIFT, z);
  if (x >= NEW_LAND.x1) return oldBaseHeight(x, z);
  return newLandHeight(x, z);
}
// the county as it was laid out before the farm country moved west
function oldBaseHeight(x, z) {
  // rolling hills
  let hills = hillsAt(x, z);
  // hills flatten a little toward the town side and rise into bluffs north & south of town
  const east = smoothstep(-40, 90, x);
  const bluff = smoothstep(120, 190, Math.abs(z)) * smoothstep(40, 150, x);
  hills = lerp(hills, 15 + 4 * n2(x / 70, z / 70), east * (1 - bluff));
  hills += bluff * (8 + 6 * n3(x / 50, z / 50));
  // town terrace mask
  const tx = smoothstep(14, 74, x);
  const tz = 1 - smoothstep(T.town.z1 - 6, T.town.z1 + 40, Math.abs(z));
  const tm = tx * tz;
  let h = lerp(hills, townPlane(x) + 0.25 * n3(x / 40, z / 40), tm);
  // river valley
  const rn = riverNear(z), rf = riverFar(z);
  // bank down to the water on the near side
  const inTownBank = 1 - smoothstep(130, 160, Math.abs(z));
  const bankStart = lerp(rn - 26, T.floodwallX + 1, inTownBank);
  if (x > bankStart) {
    const bed = -4.5 + 1.2 * n4(x / 40, z / 40);
    const t = smoothstep(bankStart, rn + 8, x);
    h = lerp(h, bed, t);
  }
  // far bank rising into wooded hills
  if (x > rf - 30) {
    const far = 7 + 9 * smoothstep(rf, rf + 160, x) + 5 * n1(x / 80, z / 80) + 2 * n3(x / 25, z / 25);
    const t = smoothstep(rf - 12, rf + 22, x);
    h = lerp(h, far, t);
  }
  return h;
}

export class Terrain {
  constructor() {
    this.h = new Float32Array(T.nx * T.nz);
    for (let j = 0; j < T.nz; j++) {
      const z = T.z0 + j * T.res;
      for (let i = 0; i < T.nx; i++) this.h[j * T.nx + i] = baseHeight(T.x0 + i * T.res, z);
    }
    this.relax(0.62, 160);
    this.base = this.h.slice();
    this.roadMask = new Uint8Array(T.nx * T.nz);
    this.padMask = new Uint8Array(T.nx * T.nz);
    this.splat = null;
    this.chunks = [];
    this.group = new THREE.Group();
    this.group.name = 'terrain';
  }
  idx(i, j) { return j * T.nx + i; }
  // Limit slopes (rise per metre) by moving material from steep tops to
  // their feet, so bluffs read as steep banks instead of stretched walls.
  // `fixed` (optional) marks grid points that must not move (road beds,
  // streets, building pads); their free neighbours take all the change.
  relax(maxSlope, iters, fixed = null) {
    const h = this.h, nx = T.nx, nz = T.nz, m = maxSlope * T.res;
    const pair = (a, b) => {
      const d = h[a] - h[b];
      if (Math.abs(d) <= m) return 0;
      const fa = fixed && fixed[a], fb = fixed && fixed[b];
      if (fa && fb) return 0;
      const e = (Math.abs(d) - m) * Math.sign(d);
      if (fa) h[b] += e;
      else if (fb) h[a] -= e;
      else { h[a] -= e * 0.5; h[b] += e * 0.5; }
      return 1;
    };
    for (let it = 0; it < iters; it++) {
      let moved = 0;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = j * nx + i;
        if (i + 1 < nx) moved += pair(a, a + 1);
        if (j + 1 < nz) moved += pair(a, a + nx);
      }
      if (!moved) break;
    }
  }
  hAt(i, j) {
    i = clamp(i, 0, T.nx - 1); j = clamp(j, 0, T.nz - 1);
    return this.h[j * T.nx + i];
  }
  // Height on the rendered triangles (diagonal from (i,j) to (i+1,j+1)).
  height(x, z) {
    const fx = (x - T.x0) / T.res, fz = (z - T.z0) / T.res;
    let i = Math.floor(fx), j = Math.floor(fz);
    i = clamp(i, 0, T.nx - 2); j = clamp(j, 0, T.nz - 2);
    const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
    const h00 = this.h[j * T.nx + i], h10 = this.h[j * T.nx + i + 1];
    const h01 = this.h[(j + 1) * T.nx + i], h11 = this.h[(j + 1) * T.nx + i + 1];
    if (u >= v) return h00 + (h10 - h00) * u + (h11 - h10) * v;
    return h00 + (h11 - h01) * u + (h01 - h00) * v;
  }
  normal(x, z, out = new THREE.Vector3()) {
    const e = 1;
    out.set(this.height(x - e, z) - this.height(x + e, z), 2 * e, this.height(x, z - e) - this.height(x, z + e));
    return out.normalize();
  }
  // ---- stamps ----
  // visit grid points inside an expanded rect
  forRect(x0, z0, x1, z1, fn) {
    const i0 = clamp(Math.floor((x0 - T.x0) / T.res), 0, T.nx - 1), i1 = clamp(Math.ceil((x1 - T.x0) / T.res), 0, T.nx - 1);
    const j0 = clamp(Math.floor((z0 - T.z0) / T.res), 0, T.nz - 1), j1 = clamp(Math.ceil((z1 - T.z0) / T.res), 0, T.nz - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, T.x0 + i * T.res, T.z0 + j * T.res);
  }
  // Flatten a rectangle to height y, blending out over `margin` metres.
  flattenRect(x0, z0, x1, z1, y, margin = 6, mode = 'set') {
    this.forRect(x0 - margin, z0 - margin, x1 + margin, z1 + margin, (i, j, x, z) => {
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const d = Math.hypot(dx, dz);
      const t = d <= 0 ? 1 : 1 - smoothstep(0, margin, d);
      const k = this.idx(i, j);
      const cur = this.h[k];
      let target = y;
      if (mode === 'lower') target = Math.min(cur, y);
      if (mode === 'raise') target = Math.max(cur, y);
      this.h[k] = lerp(cur, target, t);
    });
  }
  // Force a rect to be at most y (used under foundations so ground never pokes through floors).
  clampBelow(x0, z0, x1, z1, y) {
    this.forRect(x0, z0, x1, z1, (i, j, x, z) => {
      if (x < x0 - 1e-6 || x > x1 + 1e-6 || z < z0 - 1e-6 || z > z1 + 1e-6) return;
      const k = this.idx(i, j);
      if (this.h[k] > y) this.h[k] = y;
    });
  }
  // Road corridor stamp. samples: [{x,z,y,dx,dz}] centreline with heights; half = half width.
  stampRoad(samples, half, shoulder = 4, ditch = 0.0, crown = 0.06, adjust = null) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const s of samples) { x0 = Math.min(x0, s.x); z0 = Math.min(z0, s.z); x1 = Math.max(x1, s.x); z1 = Math.max(z1, s.z); }
    const maxReach = half + 1.2 + 30;
    // for each grid point: nearest segment
    this.forRect(x0 - maxReach, z0 - maxReach, x1 + maxReach, z1 + maxReach, (i, j, x, z) => {
      let best = Infinity, by = 0, bk = 0, bt = 0;
      for (let k = 0; k < samples.length - 1; k++) {
        const a = samples[k], b = samples[k + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
        t = clamp(t, 0, 1);
        const cx = a.x + dx * t, cz = a.z + dz * t;
        const d = Math.hypot(x - cx, z - cz);
        if (d < best) { best = d; by = a.y + (b.y - a.y) * t; bk = k; bt = t; }
      }
      const adj = (y) => (adjust ? adjust(samples[bk], samples[bk + 1], bt, x, z, y) : y);
      const k = this.idx(i, j);
      const cur = this.h[k];
      // banks get wider where the road cuts or fills a lot (about 1:2)
      const bank = Math.min(30, Math.max(shoulder, Math.abs(cur - by) * 2.2));
      const flat = half + 1.2;
      if (best > flat + bank) return;
      if (best <= flat) {
        this.h[k] = adj(by - crown * Math.min(1, (best / half) * (best / half))) - 0.07;
        this.roadMask[k] = 1;
      } else {
        if (this.roadMask[k] || this.padMask[k]) return; // never bury another road's bed or cut a building pad
        const t = smoothstep(0, bank, best - flat);
        this.h[k] = lerp(adj(by - crown) - 0.1, cur, t);
      }
    });
  }
  // Sample a smoothed height profile along a polyline (for roads).
  profile(poly, window = 24, maxGrade = 0.08, pins = null) {
    const pts = poly.map(([x, z]) => ({ x, z, y: this.height(x, z) }));
    // cumulative distance
    let acc = 0;
    pts.forEach((p, i) => { if (i) acc += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.s = acc; });
    const sm = pts.map((p) => {
      let sum = 0, w = 0;
      for (const q of pts) {
        const d = Math.abs(q.s - p.s);
        if (d > window) continue;
        const k = 1 - d / window;
        sum += q.y * k; w += k;
      }
      return sum / w;
    });
    pts.forEach((p, i) => { p.y = sm[i]; });
    // pinned heights (road junctions, town street ends): pins is a Map
    // index -> y. Nearby samples are eased toward the pins' offsets.
    const fixed = pins instanceof Map ? pins : new Map();
    if (fixed.size) {
      const list = [...fixed].map(([i, y]) => [pts[i].s, y - pts[i].y]);
      const R = 70;
      for (const p of pts) {
        let sw = 0, so = 0;
        for (const [ps, off] of list) {
          const w = 1 - smoothstep(0, R, Math.abs(p.s - ps));
          sw += w; so += w * off;
        }
        if (sw > 0) p.y += so / Math.max(1, sw);
      }
    }
    const applyPins = () => { for (const [i, y] of fixed) pts[i].y = y; };
    applyPins();
    // grade clamp (forward & backward passes), anchored at pins
    for (let pass = 0; pass < 16; pass++) {
      for (let i = 1; i < pts.length; i++) {
        if (fixed.has(i)) continue;
        const d = pts[i].s - pts[i - 1].s;
        pts[i].y = clamp(pts[i].y, pts[i - 1].y - maxGrade * d, pts[i - 1].y + maxGrade * d);
      }
      for (let i = pts.length - 2; i >= 0; i--) {
        if (fixed.has(i)) continue;
        const d = pts[i + 1].s - pts[i].s;
        pts[i].y = clamp(pts[i].y, pts[i + 1].y - maxGrade * d, pts[i + 1].y + maxGrade * d);
      }
      applyPins();
    }
    return pts;
  }
  // Recompute mesh for chunks overlapping a world rect (after runtime edits).
  refresh(x0, z0, x1, z1) {
    for (const c of this.chunks) {
      if (c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1) continue;
      this.updateChunk(c);
    }
  }

  // ---------------- mesh ----------------
  // splatFn(x, z, h, slope) -> [grass, dry, dirt, gravel] (sand = remainder)
  build(material, splatFn, opts = {}) {
    this.splatFn = splatFn;
    this.material = material;
    const CH = 128;
    for (let cz = T.z0; cz < T.z1; cz += CH) {
      for (let cx = T.x0; cx < T.x1; cx += CH) {
        const x1 = Math.min(cx + CH, T.x1), z1 = Math.min(cz + CH, T.z1);
        const centerX = (cx + x1) / 2, centerZ = (cz + z1) / 2;
        const p = T.play;
        const nearPlay = centerX > p.x0 - 80 && centerX < p.x1 + 140 && centerZ > p.z0 - 80 && centerZ < p.z1 + 80;
        const step = nearPlay ? 1 : (opts.farStep || 4); // in grid units
        const c = { x0: cx, z0: cz, x1, z1, step, mesh: null };
        this.chunks.push(c);
        this.updateChunk(c);
      }
    }
  }
  updateChunk(c) {
    const i0 = Math.round((c.x0 - T.x0) / T.res), i1 = Math.round((c.x1 - T.x0) / T.res);
    const j0 = Math.round((c.z0 - T.z0) / T.res), j1 = Math.round((c.z1 - T.z0) / T.res);
    const st = c.step;
    const ni = Math.floor((i1 - i0) / st) + 1, nj = Math.floor((j1 - j0) / st) + 1;
    const skirt = st > 1;
    const vcount = ni * nj + (skirt ? 2 * (ni + nj) : 0);
    const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), spl = new Float32Array(vcount * 4);
    const idx = [];
    const n = new THREE.Vector3();
    let v = 0;
    const put = (i, j, dy = 0) => {
      const x = T.x0 + i * T.res, z = T.z0 + j * T.res, y = this.hAt(i, j);
      pos[v * 3] = x; pos[v * 3 + 1] = y + dy; pos[v * 3 + 2] = z;
      const hl = this.hAt(i - 1, j), hr = this.hAt(i + 1, j), hd = this.hAt(i, j - 1), hu = this.hAt(i, j + 1);
      n.set(hl - hr, 2 * T.res, hd - hu).normalize();
      nor[v * 3] = n.x; nor[v * 3 + 1] = n.y; nor[v * 3 + 2] = n.z;
      const s = this.splatFn(x, z, y, 1 - n.y);
      spl[v * 4] = s[0]; spl[v * 4 + 1] = s[1]; spl[v * 4 + 2] = s[2]; spl[v * 4 + 3] = s[3];
      return v++;
    };
    for (let b = 0; b < nj; b++) for (let a = 0; a < ni; a++) put(i0 + a * st, j0 + b * st);
    for (let b = 0; b < nj - 1; b++) for (let a = 0; a < ni - 1; a++) {
      const p00 = b * ni + a, p10 = p00 + 1, p01 = p00 + ni, p11 = p01 + 1;
      // diagonal p00-p11 to match height()
      idx.push(p00, p11, p10, p00, p01, p11);
    }
    if (skirt) {
      const edge = (list) => {
        const start = v;
        for (const [a, b] of list) put(i0 + a * st, j0 + b * st, -3);
        return start;
      };
      const sides = [
        Array.from({ length: ni }, (_, a) => [a, 0]),
        Array.from({ length: ni }, (_, a) => [a, nj - 1]),
        Array.from({ length: nj }, (_, b) => [0, b]),
        Array.from({ length: nj }, (_, b) => [ni - 1, b]),
      ];
      sides.forEach((list, si) => {
        const s0 = edge(list);
        for (let k = 0; k < list.length - 1; k++) {
          const top0 = list[k][1] * ni + list[k][0], top1 = list[k + 1][1] * ni + list[k + 1][0];
          const bot0 = s0 + k, bot1 = s0 + k + 1;
          // double-sided skirt (both windings)
          idx.push(top0, bot0, top1, top1, bot0, bot1, top0, top1, bot0, top1, bot1, bot0);
        }
        void si;
      });
    }
    const g = c.mesh ? c.mesh.geometry : new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
    g.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    if (!c.mesh) {
      c.mesh = new THREE.Mesh(g, this.material);
      c.mesh.receiveShadow = true;
      c.mesh.castShadow = c.step === 1;
      c.mesh.matrixAutoUpdate = false;
      c.mesh.name = 'terrainChunk';
      this.group.add(c.mesh);
    }
  }
}

// ---------------- material ----------------
import { getTex } from '../textures.js';
const TER_LAYERS = ['grass', 'dryGrass', 'dirt', 'gravel', 'sand'];
export function terrainMaterial(size = 512) {
  const n = TER_LAYERS.length;
  const A = new Uint8Array(size * size * 4 * n), N = new Uint8Array(size * size * 4 * n);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const tiles = [];
  TER_LAYERS.forEach((name, i) => {
    const t = getTex(name);
    tiles.push(t.tile[0]);
    for (const [src, dst, isN] of [[t.map, A, false], [t.normalMap, N, true]]) {
      const off = i * size * size * 4;
      if (!src) { for (let p = 0; p < size * size; p++) { dst[off + p * 4] = 128; dst[off + p * 4 + 1] = 128; dst[off + p * 4 + 2] = 255; dst[off + p * 4 + 3] = 255; } continue; }
      ctx.save(); ctx.translate(0, size); ctx.scale(1, -1); ctx.drawImage(src.image, 0, 0, size, size); ctx.restore();
      const d = ctx.getImageData(0, 0, size, size).data;
      if (isN) { for (let p = 0; p < size * size; p++) { dst[off + p * 4] = d[p * 4]; dst[off + p * 4 + 1] = 255 - d[p * 4 + 1]; dst[off + p * 4 + 2] = d[p * 4 + 2]; dst[off + p * 4 + 3] = 255; } }
      else dst.set(d, off);
    }
  });
  const mk = (data, srgb) => {
    const tex = new THREE.DataArrayTexture(data, size, size, n);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  const albedo = mk(A, true), normal = mk(N, false);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  // where grass blades stand (set once the ground map exists): the ground under
  // them is shaded as the thatch it is, close to the camera
  const under = m.userData.ground = { uGround: { value: null }, uGRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uGFade: { value: new THREE.Vector2(8, 30) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, under);
    sh.uniforms.uTA = { value: albedo };
    sh.uniforms.uTN = { value: normal };
    sh.uniforms.uTiles = { value: tiles };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uTA; uniform sampler2DArray uTN; uniform float uTiles[5];
        uniform sampler2D uGround; uniform vec4 uGRect; uniform vec2 uGFade;
        varying vec4 vSplat; varying vec3 vWPos;
        float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float tnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(thash(i),thash(i+vec2(1,0)),f.x), mix(thash(i+vec2(0,1)),thash(i+vec2(1,1)),f.x), f.y); }
        vec4 terW(){ vec4 w = clamp(vSplat, 0.0, 1.0); return w; }
      `)
      .replace('#include <map_fragment>', `
        vec4 sw = terW();
        float sandW = clamp(1.0 - sw.x - sw.y - sw.z - sw.w, 0.0, 1.0);
        // break up blends with noise so transitions look natural
        float bn = tnoise(vWPos.xz * 0.35) * 0.5 + tnoise(vWPos.xz * 1.3) * 0.25;
        vec4 w5a = sw * (0.6 + bn); float w5b = sandW * (0.6 + bn);
        w5a = pow(w5a, vec4(2.0)); w5b = pow(w5b, 2.0);
        float tot = w5a.x + w5a.y + w5a.z + w5a.w + w5b + 1e-4;
        w5a /= tot; w5b /= tot;
        vec2 wp = vWPos.xz;
        vec3 tc = vec3(0.0); vec3 tn = vec3(0.0);
        float wl[5]; wl[0]=w5a.x; wl[1]=w5a.y; wl[2]=w5a.z; wl[3]=w5a.w; wl[4]=w5b;
        for (int i = 0; i < 5; i++) {
          if (wl[i] < 0.01) continue;
          vec2 uvA = wp / uTiles[i];
          vec2 uvB = wp / (uTiles[i] * 3.7) + vec2(0.37, 0.71);
          vec3 a = texture(uTA, vec3(uvA, float(i))).rgb;
          vec3 b = texture(uTA, vec3(uvB, float(i))).rgb;
          tc += mix(a, b, 0.35) * wl[i];
          tn += (texture(uTN, vec3(uvA, float(i))).xyz * 2.0 - 1.0) * wl[i];
        }
        float macro = 0.82 + 0.36 * tnoise(wp * 0.02) + 0.12 * (tnoise(wp * 0.11) - 0.5);
        vec4 gm = texture2D(uGround, (wp - uGRect.xy) / uGRect.zw);
        float under = gm.r * (1.0 - gm.a * 0.75) * (1.0 - smoothstep(uGFade.x, uGFade.y, distance(wp, cameraPosition.xz))) * (wl[0] + wl[1]);
        tc *= mix(vec3(1.0), vec3(0.62, 0.6, 0.66), under);
        diffuseColor.rgb *= tc * macro;
      `)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
          vec2 st0 = dFdx( vWPos.xz ), st1 = dFdy( vWPos.xz );
          vec3 N = normal;
          vec3 q1perp = cross( q1, N ), q0perp = cross( N, q0 );
          vec3 Tt = q1perp * st0.x + q0perp * st1.x;
          vec3 Bt = q1perp * st0.y + q0perp * st1.y;
          float det = max( dot( Tt, Tt ), dot( Bt, Bt ) );
          float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
          mat3 tbnT = mat3( Tt * scale, -Bt * scale, N );
          vec3 mn = normalize(vec3(tn.xy * 0.8, max(tn.z, 0.2)));
          normal = normalize( tbnT * mn );
          #if NUM_DIR_LIGHTS > 0
          {
            // grass stands up: a low sun still lights it, so grassy ground leans its normal toward the light
            vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ), dl = directionalLights[ 0 ].direction;
            vec3 hl = dl - upV * dot( dl, upV );
            normal = normalize( normal + hl * ( 0.38 * ( wl[0] + wl[1] ) ) );
          }
          #endif
        }
      `);
  };
  m.customProgramCacheKey = () => 'holdfast-terrain-v1';
  return m;
}
