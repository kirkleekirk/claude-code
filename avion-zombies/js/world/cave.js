import * as THREE from '../../vendor/three.module.min.js';
import { clamp, lerp, smoothstep, makeRng, makeNoise2D } from '../util.js';

// Caves for the 2.5D engine. A cave is described as rooms (ellipses / polygons) and tunnels
// (polylines with width and height). From that we bake 2D fields on a fine grid:
//   F  floor height        C  ceiling height (the vault curves down to the floor at the walls)
//   D  signed distance to the wall (+ inside)
// The visible rock is a 3D signed distance function built from those fields plus lumpy 3D
// noise, meshed with surface nets. Collision and navigation use the same fields, so feet,
// heads and bullets meet the rock where it is drawn.

// ---- 3D value noise ---------------------------------------------------------------------------
const PERM = new Uint8Array(512);
const VALS = new Float32Array(256);
{
  const rng = makeRng(90210);
  const p = [];
  for (let i = 0; i < 256; i++) {
    p.push(i);
    VALS[i] = rng() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
function lat(ix, iy, iz) {
  return VALS[PERM[(ix & 255) + PERM[(iy & 255) + PERM[iz & 255]]]];
}
export function vnoise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const a = lat(ix, iy, iz) + (lat(ix + 1, iy, iz) - lat(ix, iy, iz)) * ux;
  const b = lat(ix, iy + 1, iz) + (lat(ix + 1, iy + 1, iz) - lat(ix, iy + 1, iz)) * ux;
  const c = lat(ix, iy, iz + 1) + (lat(ix + 1, iy, iz + 1) - lat(ix, iy, iz + 1)) * ux;
  const d = lat(ix, iy + 1, iz + 1) + (lat(ix + 1, iy + 1, iz + 1) - lat(ix, iy + 1, iz + 1)) * ux;
  const e = a + (b - a) * uy;
  const f = c + (d - c) * uy;
  return e + (f - e) * uz;
}
// lumpy rock: big bulges and alcoves, knobs, small grit
function rockNoise(x, y, z) {
  return (
    vnoise3(x * 0.11 + 31, y * 0.14, z * 0.11) * 1.1 +
    vnoise3(x * 0.32, y * 0.42, z * 0.32) * 0.55 +
    vnoise3(x * 0.9 + 17, y * 1.1, z * 0.9) * 0.24 +
    vnoise3(x * 2.3, y * 2.3 + 5, z * 2.3) * 0.08
  );
}

const AO_D = [0.4, 1.0, 2.2];
const AO_W = [0.45, 0.35, 0.3];

function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}

// ---- rock styles ------------------------------------------------------------------------------
// amp: 3D lumpiness (m). curve: how far from the wall the vault reaches full height (m).
export const ROCK = {
  limestone: { id: 0, amp: 0.55, curve: 2.8, color: [0.6, 0.53, 0.45], floor: [0.42, 0.37, 0.32] },
  flowstone: { id: 1, amp: 0.4, curve: 2.4, color: [0.78, 0.64, 0.47], floor: [0.55, 0.46, 0.36] },
  blasted: { id: 2, amp: 0.16, curve: 0.9, color: [0.47, 0.46, 0.45], floor: [0.36, 0.35, 0.34] },
  basalt: { id: 3, amp: 0.5, curve: 2.2, color: [0.27, 0.255, 0.25], floor: [0.21, 0.2, 0.19] },
  crystal: { id: 4, amp: 0.45, curve: 2.6, color: [0.72, 0.66, 0.56], floor: [0.5, 0.45, 0.38] },
  built: { id: 5, amp: 0.05, curve: 0.5, color: [0.55, 0.54, 0.52], floor: [0.45, 0.44, 0.42] },
};
const ROCK_LIST = Object.values(ROCK).sort((a, b) => a.id - b.id);

// ---- shapes -----------------------------------------------------------------------------------
function makeShape(spec, noise2) {
  const s = { ...spec, rock: ROCK[spec.kind || 'limestone'] };
  const f = spec.floor ?? 0;
  s.floorFn = typeof f === 'function' ? f : () => f;
  const h = spec.h ?? 6;
  s.hFn = typeof h === 'function' ? h : () => h;
  s.wobble = spec.wobble ?? (s.rock === ROCK.blasted || s.rock === ROCK.built ? 0.15 : 1.2);
  if (spec.type === 'tunnel') {
    // pts: [x, z, floorY, width, height]
    s.seg = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < spec.pts.length - 1; i++) {
      const a = spec.pts[i];
      const b = spec.pts[i + 1];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      s.seg.push({ a, b, dx, dz, l2: dx * dx + dz * dz || 1e-6 });
    }
    for (const p of spec.pts) {
      const r = p[3] / 2 + 10;
      minX = Math.min(minX, p[0] - r);
      maxX = Math.max(maxX, p[0] + r);
      minZ = Math.min(minZ, p[1] - r);
      maxZ = Math.max(maxZ, p[1] + r);
    }
    s.box = [minX, minZ, maxX, maxZ];
  } else if (spec.type === 'poly') {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of spec.pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    s.box = [minX - 10, minZ - 10, maxX + 10, maxZ + 10];
  } else {
    const r = Math.max(spec.rx, spec.rz) + 10;
    s.box = [spec.x - r, spec.z - r, spec.x + r, spec.z + r];
    s.cos = Math.cos(spec.rot || 0);
    s.sin = Math.sin(spec.rot || 0);
  }
  s.seed = spec.seed ?? Math.floor(Math.abs(s.box[0] * 7 + s.box[1] * 13));
  s.noise2 = noise2;
  return s;
}

// Evaluate one shape at (x,z): signed distance (negative inside), floor and headroom.
function evalShape(s, x, z, out) {
  let sd;
  let fy;
  let hh;
  if (s.type === 'tunnel') {
    let best = Infinity;
    let bt = 0;
    let bs = null;
    for (const g of s.seg) {
      const t = clamp(((x - g.a[0]) * g.dx + (z - g.a[1]) * g.dz) / g.l2, 0, 1);
      const qx = g.a[0] + g.dx * t;
      const qz = g.a[1] + g.dz * t;
      const w = g.a[3] + (g.b[3] - g.a[3]) * t;
      const d = Math.hypot(x - qx, z - qz) - w / 2;
      if (d < best) {
        best = d;
        bt = t;
        bs = g;
      }
    }
    sd = best;
    fy = bs.a[2] + (bs.b[2] - bs.a[2]) * bt;
    hh = bs.a[4] + (bs.b[4] - bs.a[4]) * bt;
  } else if (s.type === 'poly') {
    const pts = s.pts;
    let dmin = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, az] = pts[j];
      const [bx, bz] = pts[i];
      const ex = bx - ax;
      const ez = bz - az;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1e-6), 0, 1);
      dmin = Math.min(dmin, Math.hypot(x - ax - ex * t, z - az - ez * t));
      if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    }
    sd = inside ? -dmin : dmin;
    fy = s.floorFn(x, z);
    hh = s.hFn(x, z);
  } else {
    const lx = (x - s.x) * s.cos + (z - s.z) * s.sin;
    const lz = -(x - s.x) * s.sin + (z - s.z) * s.cos;
    const r = Math.hypot(lx, lz);
    const c = r > 1e-6 ? lx / r : 1;
    const sn = r > 1e-6 ? lz / r : 0;
    const re = 1 / Math.sqrt((c * c) / (s.rx * s.rx) + (sn * sn) / (s.rz * s.rz));
    sd = r - re;
    fy = s.floorFn(x, z);
    hh = s.hFn(x, z);
  }
  if (s.wobble) sd += s.wobble * s.noise2.fbm(x / 7 + s.seed, z / 7 - s.seed, 3);
  out.sd = sd;
  out.f = fy;
  out.h = hh;
  return out;
}

// ---- the field --------------------------------------------------------------------------------
export class CaveField {
  // spec: { bounds:{minX,maxX,minZ,maxZ}, res, shapes:[...], cover(x,z) -> bool (under the mountain),
  //         post(x,z,cell) optional per-cell tweaks, walkable(x,z) optional extra veto }
  constructor(spec) {
    this.spec = spec;
    const b = spec.bounds;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.res = spec.res || 0.5;
    this.nx = Math.ceil((b.maxX - b.minX) / this.res) + 1;
    this.nz = Math.ceil((b.maxZ - b.minZ) / this.res) + 1;
    this.maxX = this.minX + (this.nx - 1) * this.res;
    this.maxZ = this.minZ + (this.nz - 1) * this.res;
    const n = this.nx * this.nz;
    this.F = new Float32Array(n);
    this.C = new Float32Array(n);
    this.D = new Float32Array(n).fill(-50);
    this.K = new Uint8Array(n);
    this.AMP = new Float32Array(n);
    this.ext = new Uint8Array(n);
    this.W = null;
    this.noise2 = makeNoise2D(spec.seed || 7);
    this.shapes = spec.shapes.map((s) => makeShape(s, this.noise2));
  }

  // Bake the 2D fields. Yields between rows when given a tick() (keeps the loading bar alive).
  async bake(tick) {
    const { nx, nz, res } = this;
    const tmp = { sd: 0, f: 0, h: 0 };
    const k = 1.4;
    const post = this.spec.post;
    const cell = { f: 0, c: 0, d: 0, kind: 0, amp: 0 };
    for (let j = 0; j < nz; j++) {
      const z = this.minZ + j * res;
      const near = this.shapes.filter((s) => z >= s.box[1] && z <= s.box[3]);
      for (let i = 0; i < nx; i++) {
        const x = this.minX + i * res;
        let un = Infinity;
        let ws = 0;
        let fs = 0;
        let hs = 0;
        let cs = 0;
        let as = 0;
        let bestW = -1;
        let kind = 0;
        for (const s of near) {
          if (x < s.box[0] || x > s.box[2]) continue;
          evalShape(s, x, z, tmp);
          un = un === Infinity ? tmp.sd : smin(un, tmp.sd, k);
          const w = 1 / (1 + Math.exp(tmp.sd / 0.7)) + 1e-4 * Math.exp(-Math.max(tmp.sd, 0) / 6);
          ws += w;
          fs += w * tmp.f;
          hs += w * tmp.h;
          cs += w * s.rock.curve;
          as += w * (s.amp ?? s.rock.amp);
          if (w > bestW) {
            bestW = w;
            kind = s.rock.id;
          }
        }
        const idx = j * nx + i;
        if (un === Infinity) {
          this.D[idx] = -50;
          this.F[idx] = 0;
          this.C[idx] = -1;
          continue;
        }
        const D = -un;
        const f = fs / ws;
        const h = hs / ws;
        const curve = cs / ws;
        const u = clamp(D / curve, 0, 1);
        const vault = 1 - Math.pow(1 - u, 2.2);
        cell.f = f;
        cell.d = D;
        cell.c = D > 0 ? f + h * vault : f - 0.6 + D;
        cell.kind = kind;
        cell.amp = as / ws;
        cell.h = h;
        if (post) post(x, z, cell);
        this.F[idx] = cell.f;
        this.C[idx] = cell.c;
        this.D[idx] = cell.d;
        this.K[idx] = cell.kind;
        this.AMP[idx] = cell.amp;
        this.ext[idx] = cell.d > -8 && (!this.spec.cover || this.spec.cover(x, z)) ? 1 : 0;
      }
      if (tick && (j & 15) === 0) await tick(j / nz);
    }
  }

  // ---- bilinear field queries -----------------------------------------------------------------
  _bl(arr, x, z) {
    const fx = (x - this.minX) / this.res;
    const fz = (z - this.minZ) / this.res;
    const i = Math.max(0, Math.min(this.nx - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.nz - 2, Math.floor(fz)));
    const u = clamp(fx - i, 0, 1);
    const v = clamp(fz - j, 0, 1);
    const o = j * this.nx + i;
    const a = arr[o];
    const b = arr[o + 1];
    const c = arr[o + this.nx];
    const d = arr[o + this.nx + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  inBounds(x, z) {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ;
  }
  // inside the part of the world where the cave fields replace the open-air terrain
  inExtent(x, z) {
    if (!this.inBounds(x, z)) return false;
    const i = Math.round((x - this.minX) / this.res);
    const j = Math.round((z - this.minZ) / this.res);
    return this.ext[j * this.nx + i] === 1;
  }
  floorAt(x, z) {
    return this._bl(this.F, x, z);
  }
  ceilAt(x, z) {
    return this._bl(this.C, x, z);
  }
  distAt(x, z) {
    return this._bl(this.D, x, z);
  }

  // The rock: positive in air. Smooth-min of floor, vault and walls, plus lumps that fade out
  // near the floor so the walkable surface stays where the physics floor is.
  sdf(x, y, z) {
    const f = this._bl(this.F, x, z);
    const c = this._bl(this.C, x, z);
    const d = this._bl(this.D, x, z);
    let s = smin(smin(y - f, c - y, 0.45), d, 0.45);
    const amp = this._bl(this.AMP, x, z);
    const above = y - f;
    if (amp > 0 && s > -amp * 2 - 0.4 && s < amp * 2 + 0.4) {
      const ramp = above < 0.25 ? 0 : above > 1.7 ? 1 : (above - 0.25) / 1.45;
      if (ramp > 0) s += amp * ramp * rockNoise(x, y, z);
    }
    return s;
  }

  // The same rock without the lumps (cheap; used for baking light).
  sdfBase(x, y, z) {
    const f = this._bl(this.F, x, z);
    const c = this._bl(this.C, x, z);
    const d = this._bl(this.D, x, z);
    return smin(smin(y - f, c - y, 0.45), d, 0.45);
  }

  // ---- walkability + wall distance --------------------------------------------------------------
  // A cell is walkable when a standing body fits in the actual (lumpy) rock there.
  buildWalk(extraVeto) {
    const { nx, nz, res } = this;
    const walk = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        if (!this.ext[idx] || this.D[idx] < 0.35) continue;
        const x = this.minX + i * res;
        const z = this.minZ + j * res;
        const f = this.F[idx];
        if (this.C[idx] - f < 2.1) continue;
        let ok = true;
        for (const hy of [0.35, 0.95, 1.5, 2.0]) {
          if (this.sdf(x, f + hy, z) < 0.06) {
            ok = false;
            break;
          }
        }
        if (ok && extraVeto && extraVeto(x, z)) ok = false;
        walk[idx] = ok ? 1 : 0;
      }
    }
    this.walk = walk;
  }

  walkableAt(x, z) {
    if (!this.inBounds(x, z)) return false;
    const i = Math.round((x - this.minX) / this.res);
    const j = Math.round((z - this.minZ) / this.res);
    return this.walk[j * this.nx + i] === 1;
  }

  // ---- ray against the rock (bullets, line of sight) ------------------------------------------
  // Only the stretch of the ray inside the cave extent is tested.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const step = 0.3;
    let t = 0;
    let prevS = null;
    let prevT = 0;
    while (t <= maxDist) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      if (this.inExtent(x, z)) {
        const s = this.sdf(x, y, z);
        if (s < 0) {
          let a = prevS === null ? t : prevT;
          let b = t;
          if (prevS !== null) {
            for (let k = 0; k < 7; k++) {
              const m = (a + b) * 0.5;
              if (this.sdf(ox + dx * m, oy + dy * m, oz + dz * m) < 0) b = m;
              else a = m;
            }
          }
          const hx = ox + dx * b;
          const hy = oy + dy * b;
          const hz = oz + dz * b;
          const n = this.normal(hx, hy, hz);
          return { dist: b, nx: n.x, ny: n.y, nz: n.z };
        }
        prevS = s;
        // big empty spaces: step further when far from any rock
        t += Math.max(step, Math.min(2, s * 0.6));
      } else {
        prevS = null;
        t += 0.5;
      }
      prevT = t;
    }
    return null;
  }

  normal(x, y, z, out = new THREE.Vector3()) {
    const e = 0.12;
    const gx = this.sdf(x + e, y, z) - this.sdf(x - e, y, z);
    const gy = this.sdf(x, y + e, z) - this.sdf(x, y - e, z);
    const gz = this.sdf(x, y, z + e) - this.sdf(x, y, z - e);
    return out.set(gx, gy, gz).normalize();
  }

  // Height of the visible ceiling straight above (x, f+1) (for hanging formations).
  ceilingSurface(x, z) {
    const f = this.floorAt(x, z);
    const c = this.ceilAt(x, z);
    let a = f + 1;
    let b = c + 1.5;
    if (this.sdf(x, a, z) < 0) return null;
    // walk up to the first rock, then bisect
    let y = a;
    while (y < b && this.sdf(x, y, z) > 0) y += 0.25;
    if (y >= b) return null;
    let lo = y - 0.25;
    let hi = y;
    for (let k = 0; k < 8; k++) {
      const m = (lo + hi) / 2;
      if (this.sdf(x, m, z) > 0) lo = m;
      else hi = m;
    }
    return lo;
  }

  // ---- meshing (surface nets) -------------------------------------------------------------------
  // voxel: lattice spacing. Builds chunked geometries with position, normal, color, wet.
  async mesh(voxel, colorFn, tick) {
    const chunkCells = Math.max(8, Math.round(12 / voxel));
    const x0 = this.minX + 1;
    const z0 = this.minZ + 1;
    const nxv = Math.floor((this.maxX - 1 - x0) / voxel);
    const nzv = Math.floor((this.maxZ - 1 - z0) / voxel);
    const chunks = [];
    const total = Math.ceil(nxv / chunkCells) * Math.ceil(nzv / chunkCells);
    let done = 0;
    for (let cz = 0; cz < nzv; cz += chunkCells) {
      for (let cx = 0; cx < nxv; cx += chunkCells) {
        const g = this._meshChunk(x0, z0, voxel, cx, cz, Math.min(chunkCells, nxv - cx), Math.min(chunkCells, nzv - cz), colorFn);
        if (g) chunks.push(g);
        done++;
        if (tick && (done & 7) === 0) await tick(done / total);
      }
    }
    return chunks;
  }

  _meshChunk(x0, z0, v, ci, cj, ni, nj, colorFn) {
    // the chunk owns lattice edges starting in [ci, ci+ni) x [cj, cj+nj); cells are needed one
    // further on each side so quads on the border can find their four vertices
    const ia = ci - 1;
    const ja = cj - 1;
    const NI = ni + 3;
    const NJ = nj + 3;
    // does any part of this chunk touch the cave?
    let anyInside = false;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let j = 0; j < NJ; j++) {
      for (let i = 0; i < NI; i++) {
        const x = x0 + (ia + i) * v;
        const z = z0 + (ja + j) * v;
        if (!this.inExtent(x, z)) continue;
        const d = this.distAt(x, z);
        const lump = 2 * this._bl(this.AMP, x, z) + 0.5;
        if (d < -lump - 0.5) continue;
        anyInside = true;
        const f = this.floorAt(x, z);
        const c = this.ceilAt(x, z);
        yMin = Math.min(yMin, f - 1.2);
        yMax = Math.max(yMax, Math.max(c, f) + lump + 0.6);
      }
    }
    if (!anyInside) return null;
    const ky0 = Math.floor(yMin / v);
    const NK = Math.ceil(yMax / v) - ky0 + 1;
    const N = NI * NJ * NK;
    const S = new Float32Array(N);
    const idx = (i, j, k) => (k * NJ + j) * NI + i;
    for (let k = 0; k < NK; k++) {
      const y = (ky0 + k) * v;
      for (let j = 0; j < NJ; j++) {
        const z = z0 + (ja + j) * v;
        for (let i = 0; i < NI; i++) {
          const x = x0 + (ia + i) * v;
          // outside the cave extent is solid, except the open mouths in front of the portals
          S[idx(i, j, k)] = this.inExtent(x, z) ? this.sdf(x, y, z) : this.spec.openAt && this.spec.openAt(x, z) ? 1 : -1;
        }
      }
    }
    // one vertex per cell that the surface crosses
    const cellV = new Int32Array((NI - 1) * (NJ - 1) * (NK - 1)).fill(-1);
    const cidx = (i, j, k) => (k * (NJ - 1) + j) * (NI - 1) + i;
    const pos = [];
    const col = [];
    const wet = [];
    const nrm = [];
    const c0 = [0, 0, 0];
    const tmpN = new THREE.Vector3();
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < NK - 1; k++) {
      for (let j = 0; j < NJ - 1; j++) {
        for (let i = 0; i < NI - 1; i++) {
          let mask = 0;
          for (let q = 0; q < 8; q++) {
            const s = S[idx(i + (q & 1), j + ((q >> 1) & 1), k + ((q >> 2) & 1))];
            cv[q] = s;
            if (s > 0) mask |= 1 << q;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let cnt = 0;
          for (const [a, b] of EDGES) {
            const sa = cv[a];
            const sb = cv[b];
            if (sa > 0 === sb > 0) continue;
            const t = sa / (sa - sb);
            sx += (a & 1) + (((b & 1) - (a & 1)) * t);
            sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
            sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
            cnt++;
          }
          let px = x0 + (ia + i + sx / cnt) * v;
          let pz = z0 + (ja + j + sy / cnt) * v;
          let py = (ky0 + k + sz / cnt) * v;
          // one Newton step onto the true surface
          if (this.inExtent(px, pz)) {
            const s = this.sdf(px, py, pz);
            this.normal(px, py, pz, tmpN);
            const lim = v * 0.5;
            px -= clamp(s * tmpN.x, -lim, lim);
            py -= clamp(s * tmpN.y, -lim, lim);
            pz -= clamp(s * tmpN.z, -lim, lim);
          }
          this.normal(px, py, pz, tmpN);
          cellV[cidx(i, j, k)] = pos.length / 3;
          pos.push(px, py, pz);
          nrm.push(tmpN.x, tmpN.y, tmpN.z);
          const w = colorFn(this, px, py, pz, tmpN, c0);
          // ambient occlusion from the rock itself: crevices and corners go dark
          let occ = 0;
          for (let q = 0; q < 3; q++) {
            const dq = AO_D[q];
            const sq = this.sdf(px + tmpN.x * dq, py + tmpN.y * dq, pz + tmpN.z * dq);
            occ += AO_W[q] * Math.max(0, dq - sq) / dq;
          }
          const ao = clamp(1 - occ * 1.15, 0.18, 1);
          col.push(c0[0] * ao, c0[1] * ao, c0[2] * ao);
          wet.push(w);
        }
      }
    }
    if (!pos.length) return null;
    // quads across every lattice edge the surface crosses (edges owned by this chunk only)
    const index = [];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) index.push(a, c, b, a, d, c);
      else index.push(a, b, c, a, c, d);
    };
    for (let k = 1; k < NK - 1; k++) {
      for (let j = 1; j < NJ - 1; j++) {
        for (let i = 1; i < NI - 1; i++) {
          if (i > ni || j > nj) continue; // the next chunk owns these edges
          const s0 = S[idx(i, j, k)] > 0;
          // x edge: (i,j,k)-(i+1,j,k) shared by cells (i, j-1..j, k-1..k)
          // winding: each quad below faces -axis as listed, so flip it when the air is on the + side
          if (i < NI - 1 && s0 !== S[idx(i + 1, j, k)] > 0) {
            quad(cellV[cidx(i, j - 1, k - 1)], cellV[cidx(i, j, k - 1)], cellV[cidx(i, j, k)], cellV[cidx(i, j - 1, k)], !s0);
          }
          // z (lattice j) edge: (i,j,k)-(i,j+1,k) shared by cells (i-1..i, j, k-1..k)
          if (j < NJ - 1 && s0 !== S[idx(i, j + 1, k)] > 0) {
            quad(cellV[cidx(i - 1, j, k - 1)], cellV[cidx(i - 1, j, k)], cellV[cidx(i, j, k)], cellV[cidx(i, j, k - 1)], !s0);
          }
          // y (lattice k) edge: (i,j,k)-(i,j,k+1) shared by cells (i-1..i, j-1..j, k)
          if (k < NK - 1 && s0 !== S[idx(i, j, k + 1)] > 0) {
            quad(cellV[cidx(i - 1, j - 1, k)], cellV[cidx(i, j - 1, k)], cellV[cidx(i, j, k)], cellV[cidx(i - 1, j, k)], !s0);
          }
        }
      }
    }
    if (!index.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aWet', new THREE.Float32BufferAttribute(wet, 1));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

// ---- wall distance over the whole map -----------------------------------------------------------
// A walk mask over the map bounds (outdoors from the map's walk function, underground from the
// cave), turned into distance-to-the-nearest-wall so characters can be kept off walls smoothly.
export class WalkField {
  constructor({ minX, minZ, maxX, maxZ, res = 0.5 }, walkable) {
    this.minX = minX;
    this.minZ = minZ;
    this.res = res;
    this.nx = Math.ceil((maxX - minX) / res) + 1;
    this.nz = Math.ceil((maxZ - minZ) / res) + 1;
    const n = this.nx * this.nz;
    const W = new Float32Array(n);
    const INF = 1e6;
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        W[j * this.nx + i] = walkable(minX + i * res, minZ + j * res) ? INF : 0;
      }
    }
    // two-pass chamfer distance (3-4 weights), in cells
    const nx = this.nx;
    const nz = this.nz;
    const a = 1;
    const b = Math.SQRT2;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const o = j * nx + i;
        let v = W[o];
        if (v === 0) continue;
        if (i > 0) v = Math.min(v, W[o - 1] + a);
        if (j > 0) {
          v = Math.min(v, W[o - nx] + a);
          if (i > 0) v = Math.min(v, W[o - nx - 1] + b);
          if (i < nx - 1) v = Math.min(v, W[o - nx + 1] + b);
        }
        W[o] = v;
      }
    }
    for (let j = nz - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const o = j * nx + i;
        let v = W[o];
        if (v === 0) continue;
        if (i < nx - 1) v = Math.min(v, W[o + 1] + a);
        if (j < nz - 1) {
          v = Math.min(v, W[o + nx] + a);
          if (i < nx - 1) v = Math.min(v, W[o + nx + 1] + b);
          if (i > 0) v = Math.min(v, W[o + nx - 1] + b);
        }
        W[o] = v;
      }
    }
    // cells -> metres, measured from the wall edge rather than the blocked cell's centre
    for (let i = 0; i < n; i++) W[i] = W[i] >= INF ? 50 : Math.max(0, W[i] * res - res * 0.5);
    this.W = W;
  }

  dist(x, z) {
    const fx = (x - this.minX) / this.res;
    const fz = (z - this.minZ) / this.res;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return 0;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const o = j * this.nx + i;
    const W = this.W;
    return W[o] + (W[o + 1] - W[o]) * u + (W[o + this.nx] - W[o]) * v + (W[o] - W[o + 1] - W[o + this.nx] + W[o + this.nx + 1]) * u * v;
  }

  // Push a circle (x,z,r) out of the walls. Returns {x, z, nx, nz} or null.
  push(x, z, r) {
    const d = this.dist(x, z);
    if (d >= r) return null;
    const e = this.res * 0.5;
    let gx = this.dist(x + e, z) - this.dist(x - e, z);
    let gz = this.dist(x, z + e) - this.dist(x, z - e);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-5) return null;
    gx /= gl;
    gz /= gl;
    const pen = Math.min(r - d, 0.5);
    return { x: gx * pen, z: gz * pen, nx: gx, nz: gz };
  }
}

export { ROCK_LIST, smin };
