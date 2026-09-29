import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { avatarAssets } from './AvatarAssets.js';

// Gear fitted to the avatar's own shapes, built in bind space:
//  - hats and helmets are shells shrink-wrapped over the head (and hair, when the hat
//    sits on it), so they hug the skull instead of floating over it;
//  - the visor and bandana are bands wrapped around the face;
//  - the vest is grown out of the shirt and bends with the chest;
//  - small hard things (glasses, pouches, the pack) are rigid pieces on one bone.
//
// Every piece: { geo, color, bone } for a rigid piece, or { geo, color, skin: { idx, wt } }
// for one that follows the skin of the part it was grown from.

const C = new THREE.Vector3(0, 1.3, 0); // the middle of the head at eye level
const BUZZ = 0.93; // a buzz cut: the short hair pulled in toward the head's middle

// ---- where things are, in bind space ----------------------------------------------------------

let boxes = null;
export function headBox(sex) {
  if (!boxes) {
    boxes = {};
    const A = avatarAssets();
    for (const s of ['m', 'f']) {
      const b = new THREE.Box3();
      const p = A.parts[`${s}_head`].pos;
      for (let i = 0; i < p.length; i += 3) b.expandByPoint(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
      boxes[s] = b;
    }
  }
  return boxes[sex];
}

export function buzzPoint(sex, v) {
  const c = headBox(sex).getCenter(new THREE.Vector3());
  return v.sub(c).multiplyScalar(BUZZ).add(c);
}

// the head (and hair) as a cloud of points; ears can be left out so a band passes over them
const clouds = new Map();
function cloud(sex, hair, { ears = true } = {}) {
  const key = `${sex}|${hair}|${ears}`;
  if (clouds.has(key)) return clouds.get(key);
  const A = avatarAssets();
  const pts = [];
  const v = new THREE.Vector3();
  const take = (part, buzz) => {
    const p = A.parts[part].pos;
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i], p[i + 1], p[i + 2]);
      if (!ears && Math.abs(v.x) > 0.118 && v.y > 1.19 && v.y < 1.37) continue;
      if (buzz) buzzPoint(sex, v);
      pts.push(v.x, v.y, v.z);
    }
  };
  take(`${sex}_head`);
  if (hair === 'short' || hair === 'buzz') take('m_hair', hair === 'buzz');
  if (hair === 'bob' || hair === 'pony') take('f_hair');
  const out = new Float32Array(pts);
  clouds.set(key, out);
  return out;
}

// How far the cloud reaches along a direction from the head's middle: the furthest
// point inside a narrow cone around it.
function envelope(pts, cone = 0.955) {
  const n = pts.length / 3;
  const dir = new Float32Array(n * 3), len = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3] - C.x, y = pts[i * 3 + 1] - C.y, z = pts[i * 3 + 2] - C.z;
    const l = Math.hypot(x, y, z) || 1e-6;
    len[i] = l;
    dir[i * 3] = x / l; dir[i * 3 + 1] = y / l; dir[i * 3 + 2] = z / l;
  }
  return (dx, dy, dz) => {
    let best = 0, nearC = -2, near = 0;
    for (let i = 0; i < n; i++) {
      const c = dir[i * 3] * dx + dir[i * 3 + 1] * dy + dir[i * 3 + 2] * dz;
      if (c > cone) { const r = len[i] * c; if (r > best) best = r; } else if (c > nearC) { nearC = c; near = len[i] * Math.max(c, 0); }
    }
    return best || near;
  };
}

// direction from the head's middle: phi from straight up, theta round from the front (+z)
const dirOf = (phi, theta, out = new THREE.Vector3()) => out.set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
const _d = new THREE.Vector3();

// the angle down from the crown at which the padded envelope crosses height y
function phiAt(env, theta, y, pad) {
  let lo = 0.02, hi = Math.PI - 0.02;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    dirOf(mid, theta, _d);
    const h = C.y + _d.y * (env(_d.x, _d.y, _d.z) + pad);
    if (h > y) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// A grid of points on the envelope. cols run round the head (theta), rows run down it (phi).
// rowPhis(theta) gives each row's phi; padAt(row, col) the gap over the envelope.
function wrapGrid(env, { thetas, rowPhis, padAt }) {
  const rows = rowPhis(thetas[0]).length, cols = thetas.length;
  const dirs = [], rad = new Float32Array(rows * cols);
  for (let i = 0; i < cols; i++) {
    const phis = rowPhis(thetas[i]);
    for (let j = 0; j < rows; j++) {
      const d = dirOf(phis[j], thetas[i]);
      dirs[j * cols + i] = d;
      rad[j * cols + i] = env(d.x, d.y, d.z);
    }
  }
  // smooth out the lumps of a sparse mesh, never pulling in below it
  const sm = rad.slice();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let s = 0, n = 0;
    for (const [dj, di] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const jj = j + dj, ii = i + di;
      if (jj < 0 || jj >= rows || ii < 0 || ii >= cols) continue;
      s += rad[jj * cols + ii]; n++;
    }
    sm[j * cols + i] = Math.max(rad[j * cols + i], (s / n + rad[j * cols + i]) / 2);
  }
  const P = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) P.push(dirs[j * cols + i].clone().multiplyScalar(sm[j * cols + i] + padAt(j, i)).add(C));
  return { P, rows, cols };
}

// A grid made into a thin solid: an outer face, an inner face `off(p)` away, and strips
// joining them round the edges. outward(p) points away from the outer face.
function slab({ P, rows, cols }, { wrap = false, outward, off, top = true }) {
  const pos = [], index = [];
  const push = (arr) => { const b = pos.length / 3; for (const p of arr) pos.push(p.x, p.y, p.z); return b; };
  const a_ = new THREE.Vector3(), b_ = new THREE.Vector3(), c_ = new THREE.Vector3(), n_ = new THREE.Vector3(), m_ = new THREE.Vector3();
  const get = (i, v) => v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const tri = (a, b, c, ref) => {
    get(a, a_); get(b, b_); get(c, c_);
    n_.subVectors(b_, a_).cross(m_.subVectors(c_, a_));
    if (n_.dot(ref) < 0) index.push(a, c, b); else index.push(a, b, c);
  };
  const Q = P.map((p) => p.clone().add(off(p)));
  const o = push(P), q = push(Q);
  const ic = wrap ? cols : cols - 1;
  const ref = new THREE.Vector3();
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < ic; i++) {
    const i1 = (i + 1) % cols;
    const k = [j * cols + i, j * cols + i1, (j + 1) * cols + i1, (j + 1) * cols + i];
    ref.copy(outward(P[k[0]].clone().add(P[k[2]]).multiplyScalar(0.5)));
    tri(o + k[0], o + k[1], o + k[2], ref); tri(o + k[0], o + k[2], o + k[3], ref);
    ref.negate();
    tri(q + k[0], q + k[1], q + k[2], ref); tri(q + k[0], q + k[2], q + k[3], ref);
  }
  // edges: each border as a list of [grid index, the index one step in from it]
  const borders = [];
  const row = (j, jin) => { const b = []; for (let i = 0; i < cols; i++) b.push([j * cols + i, jin * cols + i]); if (wrap) b.push(b[0]); return b; };
  borders.push(row(rows - 1, rows - 2));
  if (top) borders.push(row(0, 1));
  if (!wrap) {
    for (const [i, iin] of [[0, 1], [cols - 1, cols - 2]]) { const b = []; for (let j = 0; j < rows; j++) b.push([j * cols + i, j * cols + iin]); borders.push(b); }
  }
  for (const b of borders) {
    const eo = push(b.map(([k]) => P[k])), eq = push(b.map(([k]) => Q[k]));
    for (let s = 0; s < b.length - 1; s++) {
      ref.subVectors(P[b[s][0]], P[b[s][1]]).add(m_.subVectors(P[b[s + 1][0]], P[b[s + 1][1]]));
      tri(eo + s, eo + s + 1, eq + s + 1, ref); tri(eo + s, eq + s + 1, eq + s, ref);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

const range = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const around = (n) => Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
// a rim that runs from yFront at the brow round to yBack at the nape
const rimLine = (yFront, yBack) => (theta) => yFront + (yBack - yFront) * (1 - Math.cos(theta)) / 2;
const fromMiddle = (p) => p.clone().sub(C);
const inward = (t) => (p) => C.clone().sub(p).normalize().multiplyScalar(t);

// A shell over the crown down to a rim line. lift raises the crown (a beanie's slouch).
function dome(env, rim, pad, { rows = 11, cols = 36, flare = 0, lift = 0, thick = 0.01 } = {}) {
  const phiMax = new Map();
  const grid = wrapGrid(env, {
    thetas: around(cols),
    rowPhis: (t) => {
      if (!phiMax.has(t)) phiMax.set(t, phiAt(env, t, rim(t), pad));
      return range(0, 1, rows).map((f) => phiMax.get(t) * f);
    },
    padAt: (j) => pad + flare * (j / (rows - 1)) ** 4 + lift * (1 - j / (rows - 1)) ** 2,
  });
  return { grid, geo: slab(grid, { wrap: true, outward: fromMiddle, off: inward(thick), top: false }) };
}

// A band round part of the head, between two height lines.
function band(env, { from, to, yTop, yBot, pad, rows = 4, cols = 24, thick = 0.008 }) {
  const grid = wrapGrid(env, {
    thetas: range(from, to, cols),
    rowPhis: (t) => range(phiAt(env, t, yTop(t), pad), phiAt(env, t, yBot(t), pad), rows),
    padAt: () => pad,
  });
  return slab(grid, { outward: fromMiddle, off: inward(thick) });
}

// A peak jutting forward from the front of a rim.
function peak(rimPts, { length, drop, thick = 0.007 }) {
  // rimPts: points along the front of the rim, left to right
  const cols = rimPts.length, P = [];
  const rows = 3;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = rimPts[i];
      const t = (i / (cols - 1)) * 2 - 1; // -1..1 across the peak
      const out = new THREE.Vector3(p.x - C.x, 0, p.z - C.z).normalize();
      const f = j / (rows - 1);
      const reach = length * Math.cos((t * Math.PI) / 2) ** 0.6 * f;
      P.push(p.clone().addScaledVector(out, reach).add(new THREE.Vector3(0, -drop * f * f - 0.004, 0)));
    }
  }
  return slab({ P, rows, cols }, { outward: () => new THREE.Vector3(0, 1, 0), off: () => new THREE.Vector3(0, -thick, 0) });
}

// points on the front of a dome's rim, between two thetas
function rimFront(grid, from, to) {
  const { P, rows, cols } = grid;
  const out = [];
  for (let i = 0; i < cols; i++) {
    let t = (i / cols) * Math.PI * 2;
    if (t > Math.PI) t -= Math.PI * 2;
    if (t >= from && t <= to) out.push([t, P[(rows - 1) * cols + i]]);
  }
  return out.sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

// ---- the vest: the shirt, grown outward ----------------------------------------------------------

function vestShell(sex, regionsOf, thick) {
  const A = avatarAssets();
  const p = A.parts[`${sex}_top`];
  const reg = regionsOf(`${sex}_top`);
  const keep = (i) => reg[i] === 'torso' && p.pos[i * 3 + 1] < 1.085 && p.pos[i * 3 + 1] > 0.73;
  const tri = p.index || Uint32Array.from({ length: p.count }, (_, i) => i);
  const used = new Map(), pos = [], nor = [], idx = [], wt = [], index = [];
  const vert = (i) => {
    if (used.has(i)) return used.get(i);
    const k = used.size;
    used.set(i, k);
    for (let a = 0; a < 3; a++) { pos.push(p.pos[i * 3 + a] + p.nor[i * 3 + a] * thick); nor.push(p.nor[i * 3 + a]); }
    for (let a = 0; a < 4; a++) { idx.push(p.idx[i * 4 + a]); wt.push(p.wt[i * 4 + a]); }
    return k;
  };
  for (let t = 0; t < tri.length; t += 3) {
    if (!keep(tri[t]) || !keep(tri[t + 1]) || !keep(tri[t + 2])) continue;
    index.push(vert(tri[t]), vert(tri[t + 1]), vert(tri[t + 2]));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(index);
  return { geo, skin: { idx: Uint16Array.from(idx), wt: Float32Array.from(wt) } };
}

// the front and back of the chest (torso only, no sleeves), for placing pouches and the pack
const chestCache = {};
function chest(sex, regionsOf) {
  if (chestCache[sex]) return chestCache[sex];
  const A = avatarAssets();
  const p = A.parts[`${sex}_top`];
  const reg = regionsOf(`${sex}_top`);
  const box = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (reg[i] === 'torso') box.expandByPoint(new THREE.Vector3(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]));
  // how far forward the chest comes at a given height and side
  const frontAt = (x, y) => {
    let z = -1;
    for (let i = 0; i < p.count; i++) {
      if (reg[i] !== 'torso') continue;
      if (Math.abs(p.pos[i * 3] - x) < 0.04 && Math.abs(p.pos[i * 3 + 1] - y) < 0.04) z = Math.max(z, p.pos[i * 3 + 2]);
    }
    return z < -0.5 ? box.max.z : z;
  };
  chestCache[sex] = { box, frontAt };
  return chestCache[sex];
}

// ---- all of it ----------------------------------------------------------------------------------

const at = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));

const shellCache = new Map();
// shells depend only on the body, the hair and the piece: build each once
function cached(key, make) {
  if (!shellCache.has(key)) shellCache.set(key, make());
  return shellCache.get(key);
}

// look → { pieces, hidesHair(x, y, z) | null }
export function buildGear(look, sex, hair, regionsOf, shade) {
  const pieces = [];
  let hidesHair = null;
  const col = (k, d) => (look.gearColor && look.gearColor[k]) ?? d;
  const rigid = (geo, bone, color, m) => { if (m) geo = geo.clone().applyMatrix4(m); pieces.push({ geo, bone, color }); };
  const gear = look.gear || [];
  const K = (name) => `${sex}|${hair}|${name}`;

  for (const g of gear) {
    if (g === 'helmet') {
      // a steel pot: over the skull, not the hair (the hair under it is cut away)
      const rim = rimLine(1.372, 1.225);
      const s = cached(K('helmet'), () => {
        const env = envelope(cloud(sex, 'bald', { ears: false }));
        const d = dome(env, rim, 0.034, { flare: 0.028, lift: 0.012, thick: 0.014 });
        return d.geo;
      });
      const c = col('helmet', 0x2a2e33);
      // on its own bone, so it can be knocked off
      rigid(s, 'X_HELMET', c);
      hidesHair = (x, y, z) => y > rim(Math.atan2(x, z)) - 0.012;
    } else if (g === 'beanie') {
      const rim = rimLine(1.372, 1.3);
      const [shell, cuff] = cached(K('beanie'), () => {
        const env = envelope(cloud(sex, hair));
        const d = dome(env, rim, 0.01, { lift: 0.02 });
        const cf = band(env, { from: 0, to: Math.PI * 2 - 1e-3, yTop: (t) => rim(t) + 0.045, yBot: (t) => rim(t) - 0.002, pad: 0.021, rows: 3, cols: 37, thick: 0.013 });
        return [d.geo, cf];
      });
      const c = col('beanie', 0x3a3f34);
      rigid(shell, 'HEAD__Skeleton', c);
      rigid(cuff, 'HEAD__Skeleton', shade(c, -0.18));
    } else if (g === 'cap') {
      const rim = rimLine(1.382, 1.315);
      const [shell, bill] = cached(K('cap'), () => {
        const env = envelope(cloud(sex, hair));
        const d = dome(env, rim, 0.01, { cols: 40 });
        const b = peak(rimFront(d.grid, -1.15, 1.15), { length: 0.11, drop: 0.018 });
        return [d.geo, b];
      });
      const c = col('cap', 0x6a2a24);
      rigid(shell, 'HEAD__Skeleton', c);
      rigid(bill, 'HEAD__Skeleton', shade(c, -0.22));
    } else if (g === 'captain') {
      const rim = rimLine(1.39, 1.35);
      const [band_, crown, top, bill] = cached(K('captain'), () => {
        const env = envelope(cloud(sex, hair));
        const d = dome(env, rim, 0.012, { cols: 40, rows: 7 });
        // the crown: the rim's outline raised into a wall that flares out to a flat top
        const { P, rows, cols } = d.grid;
        const ring = P.slice((rows - 1) * cols);
        const topY = 1.5, wallRows = 5;
        const W = [];
        for (let j = 0; j < wallRows; j++) {
          const f = j / (wallRows - 1);
          for (const p of ring) {
            const out = new THREE.Vector3(p.x - C.x, 0, p.z - C.z);
            const q = new THREE.Vector3(C.x, 0, C.z).addScaledVector(out, 1 + 0.13 * f * f).add(new THREE.Vector3(0, 0, 0.016 * f));
            q.y = p.y + (topY - p.y) * f;
            W.push(q);
          }
        }
        const wall = slab({ P: W, rows: wallRows, cols }, { wrap: true, outward: (p) => new THREE.Vector3(p.x - C.x, 0, p.z - C.z), off: (p) => new THREE.Vector3(C.x - p.x, 0, C.z - p.z).normalize().multiplyScalar(0.008), top: false });
        const last = W.slice((wallRows - 1) * cols);
        const T = [];
        const mid = last.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / last.length);
        for (let j = 0; j < 3; j++) for (const p of last) T.push(mid.clone().lerp(p, 1 - j * 0.5).setY(topY + 0.004));
        const lid = slab({ P: T, rows: 3, cols }, { wrap: true, outward: () => new THREE.Vector3(0, 1, 0), off: () => new THREE.Vector3(0, -0.01, 0), top: false });
        const bnd = band(env, { from: 0, to: Math.PI * 2 - 1e-3, yTop: (t) => rim(t) + 0.04, yBot: (t) => rim(t) - 0.002, pad: 0.018, rows: 2, cols: 41, thick: 0.01 });
        const b = peak(rimFront(d.grid, -1.1, 1.1), { length: 0.085, drop: 0.03 });
        return [bnd, wall, lid, b];
      });
      const c = col('captain', 0x1e2230);
      rigid(crown, 'HEAD__Skeleton', c);
      rigid(top, 'HEAD__Skeleton', 0xe8e4d8);
      rigid(band_, 'HEAD__Skeleton', 0x121418);
      rigid(bill, 'HEAD__Skeleton', 0x0e0f12);
      rigid(new THREE.BoxGeometry(1, 1, 1), 'HEAD__Skeleton', 0xc9a24a, at(0, rim(0) + 0.022, headBox(sex).max.z + 0.028, 0.05, 0.028, 0.008));
    } else if (g === 'wrap') {
      // a headscarf tied at the back
      const rim = rimLine(1.365, 1.19);
      const shell = cached(K('wrap'), () => dome(envelope(cloud(sex, hair)), rim, 0.012, { lift: 0.006 }).geo);
      const c = col('wrap', 0x7a2a3a);
      rigid(shell, 'HEAD__Skeleton', c);
      const back = Math.min(headBox(sex).min.z, hair === 'bald' ? 0 : -0.2);
      rigid(new THREE.SphereGeometry(1, 10, 8), 'HEAD__Skeleton', shade(c, -0.12), at(0, 1.3, back - 0.012, 0.045, 0.035, 0.035));
      for (const s of [-1, 1]) rigid(new THREE.ConeGeometry(1, 1, 6), 'HEAD__Skeleton', shade(c, -0.08), at(s * 0.02, 1.25, back - 0.005, 0.02, 0.1, 0.012));
    } else if (g === 'visor') {
      // the Guard's red eye-band
      rigid(visorGeometry(sex), 'HEAD__Skeleton', col('visor', 0xd8281c));
    } else if (g === 'bandana') {
      // over the nose and mouth, hanging to a point under the chin
      const b = cached(K('bandana'), () => band(envelope(cloud(sex, 'bald', { ears: false })), {
        from: -1.62, to: 1.62, rows: 5, cols: 27, pad: 0.012, thick: 0.006,
        yTop: (t) => 1.262 + 0.03 * Math.abs(t) / 1.62,
        yBot: (t) => 1.1 + 0.1 * (Math.abs(t) / 1.62) ** 1.4,
      }));
      rigid(b, 'HEAD__Skeleton', col('bandana', 0x8a2a24));
    } else if (g === 'glasses') {
      const h = headBox(sex), hs = h.getSize(new THREE.Vector3());
      const y = h.min.y + hs.y * 0.465, z = h.max.z - 0.012;
      for (const s of [-1, 1]) rigid(new THREE.TorusGeometry(1, 0.1, 5, 18), 'HEAD__Skeleton', col('glasses', 0x1a1a1a), at(s * hs.x * 0.2, y, z, hs.x * 0.095, hs.x * 0.08, 0.6));
      rigid(new THREE.BoxGeometry(1, 1, 1), 'HEAD__Skeleton', col('glasses', 0x1a1a1a), at(0, y + hs.y * 0.01, z + 0.004, hs.x * 0.12, 0.005, 0.005));
    } else if (g === 'vest') {
      const v = cached(`${sex}|vest`, () => vestShell(sex, regionsOf, 0.016));
      const c = col('vest', 0x2a2e33);
      pieces.push({ geo: v.geo, color: c, skin: v.skin });
      const { frontAt } = chest(sex, regionsOf);
      const pouch = new RoundedBoxGeometry(1, 1, 1, 2, 0.2);
      for (const x of [-0.075, 0, 0.075]) {
        const y = 0.86;
        rigid(pouch, 'BACKB__Skeleton', shade(c, 0.14), at(x, y, frontAt(x, y) + 0.03, 0.062, 0.085, 0.036));
      }
      // a unit patch (the Guard's red), only when the look names one
      const patch = look.gearColor && look.gearColor.patch;
      const px = 0.07, py = 1.0;
      if (patch != null) rigid(new THREE.BoxGeometry(1, 1, 1), 'BACKB__Skeleton', patch, at(px, py, frontAt(px, py) + 0.019, 0.06, 0.035, 0.006));
    } else if (g === 'pack') {
      const { box } = chest(sex, regionsOf);
      const c = col('pack', 0x4d5233);
      const back = box.min.z - (gear.includes('vest') ? 0.016 : 0);
      rigid(new RoundedBoxGeometry(1, 1, 1, 2, 0.16), 'BACKB__Skeleton', c, at(0, 0.93, back - 0.06, 0.26, 0.3, 0.12));
      rigid(new RoundedBoxGeometry(1, 1, 1, 2, 0.2), 'BACKB__Skeleton', shade(c, -0.15), at(0, 0.83, back - 0.13, 0.2, 0.1, 0.06));
      rigid(new RoundedBoxGeometry(1, 1, 1, 2, 0.3), 'BACKB__Skeleton', shade(c, -0.25), at(0, 1.1, back - 0.06, 0.24, 0.06, 0.09));
    }
  }
  // what dismemberment leaves: a raw neck, and the tops of the thighs; each on its own
  // bone, hidden until the head or legs come off
  if (look.gore) {
    const raw = 0x5a0a0a;
    rigid(new THREE.CylinderGeometry(0.058, 0.064, 0.035, 12), 'X_NECK_STUMP', raw, at(0, 1.13, -0.02));
    const pants = (look.bottoms && look.bottoms.color) ?? 0x3a4a5a;
    for (const [s, bone] of [[1, 'X_HIP_STUMP_L'], [-1, 'X_HIP_STUMP_R']]) {
      rigid(new THREE.CylinderGeometry(0.078, 0.074, 0.09, 12), bone, pants, at(s * 0.09, 0.665, 0));
      rigid(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), bone, raw, at(s * 0.09, 0.615, 0));
    }
  }
  return { pieces, hidesHair };
}

// The Guard's eye-band, fitted to the head. The Guard wear it as a separate glowing piece.
export function visorGeometry(sex) {
  return cached(`${sex}|visor`, () => band(envelope(cloud(sex, 'bald', { ears: false })), { from: -1.4, to: 1.4, yTop: () => 1.336, yBot: () => 1.276, pad: 0.016, rows: 3, cols: 25, thick: 0.01 }));
}
