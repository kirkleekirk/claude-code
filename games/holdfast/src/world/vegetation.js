// Vegetation: instanced low-poly trees (with LOD), corn and soybean rows,
// hay bales, pampas clumps and dense grass tufts around the player.
import * as THREE from 'three';
import { mulberry32, makeNoise2D, clamp, lerp } from '../util.js';
import { cornTexture, grassTuftTexture, pampasTexture } from '../textures.js';
import { T } from './terrain.js';

const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.4 } };
export function updateWind(dt, wind) {
  windUniforms.uTime.value += dt;
  windUniforms.uWind.value = lerp(windUniforms.uWind.value, wind, Math.min(1, dt * 0.5));
}

// Inject sway into a material. `heightScale` = metres at which sway reaches full.
function addWind(mat, heightScale, amp, instanced = true) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = ${instanced ? 'vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2])' : '(modelMatrix * vec4(position, 1.0)).xyz'};
          float k = clamp(position.y / ${heightScale.toFixed(2)}, 0.0, 1.0);
          k *= k;
          float ph = uTime * 1.7 + ip.x * 0.31 + ip.z * 0.17;
          float s = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.3;
          transformed.x += s * ${amp.toFixed(3)} * k * (0.4 + uWind);
          transformed.z += cos(ph * 0.9) * ${amp.toFixed(3)} * 0.6 * k * (0.4 + uWind);
        }`);
  };
  mat.customProgramCacheKey = () => 'wind' + heightScale + amp + instanced;
}

// ---------------- tree archetypes ----------------
function colorize(geo, fn) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function mergeGeos(geos) {
  // simple non-indexed merge
  let n = 0;
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const SRGB = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

function blob(r, detail, seed, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const rng = mulberry32(seed);
  const p = g.attributes.position;
  // lumpy: displace shared positions consistently
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = map.get(key);
    if (k === undefined) { k = 0.82 + rng() * 0.36; map.set(key, k); }
    p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
  }
  g.computeVertexNormals();
  return g;
}

function trunkGeo(h, r0, r1, seg = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  return g;
}

// Returns {near, far} geometries for an archetype
function makeTree(kind, seed, leafHex) {
  const rng = mulberry32(seed);
  const bark = SRGB('#5a4a3c');
  const parts = [], farParts = [];
  const leaf = (x, y, z, base) => {
    const shade = 0.62 + 0.38 * clamp((y - base) / 6, 0, 1);
    return shade;
  };
  if (kind === 'oak' || kind === 'maple' || kind === 'cottonwood') {
    const H = kind === 'cottonwood' ? 9 + rng() * 3 : 4.5 + rng() * 1.5;
    const R = kind === 'cottonwood' ? 4.2 : kind === 'oak' ? 4.8 : 3.8;
    const g0 = trunkGeo(H + 1, 0.32, 0.18, 7);
    colorize(g0, () => bark);
    parts.push(g0); farParts.push(colorize(trunkGeo(H + 1, 0.3, 0.2, 4), () => bark));
    // branches
    for (let b = 0; b < 3; b++) {
      const br = trunkGeo(2.4, 0.14, 0.06, 5);
      br.rotateZ((0.6 + rng() * 0.4) * (b % 2 ? 1 : -1));
      br.rotateY(rng() * Math.PI * 2);
      br.translate(0, H * (0.6 + rng() * 0.3), 0);
      colorize(br, () => bark);
      parts.push(br);
    }
    const base = SRGB(leafHex || (kind === 'maple' ? '#4f7a32' : kind === 'cottonwood' ? '#5d7d3a' : '#466d2e'));
    const n = kind === 'cottonwood' ? 11 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.5;
      const rr = i === 0 ? 0 : R * (0.35 + rng() * 0.45);
      const y = H + (kind === 'cottonwood' ? rng() * 6 : rng() * 2.6) + (i === 0 ? 1.6 : 0);
      const s = (kind === 'cottonwood' ? 2.2 : 2.5) + rng() * 1.2;
      const g = blob(s, 1, seed * 31 + i, 1, 0.85, 1);
      g.translate(Math.cos(a) * rr, y, Math.sin(a) * rr);
      const tint = 0.85 + rng() * 0.3;
      colorize(g, (x, yy, z) => { const k = leaf(x, yy, z, H - 1) * tint; return [base[0] * k, base[1] * k, base[2] * k]; });
      parts.push(g);
    }
    // far LOD: three big blobs
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      const g = blob(R * 0.75, 0, seed + i, 1, 0.8, 1);
      g.translate(Math.cos(a) * R * 0.35, H + 1.8 + (i === 0 ? 0.8 : 0), Math.sin(a) * R * 0.35);
      colorize(g, (x, yy, z) => { const k = leaf(x, yy, z, H - 1); return [base[0] * k, base[1] * k, base[2] * k]; });
      farParts.push(g);
    }
  } else if (kind === 'cedar') {
    const H = 6 + rng() * 3;
    parts.push(colorize(trunkGeo(1.5, 0.2, 0.15, 5), () => bark));
    farParts.push(colorize(trunkGeo(1.5, 0.2, 0.15, 4), () => bark));
    const base = SRGB('#2f4a2b');
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const r = 1.9 * (1 - t * 0.7);
      const h = H / tiers * 1.7;
      const g = new THREE.ConeGeometry(r, h, 8, 1);
      g.translate(0, 1 + t * (H - 1.2) + h / 2, 0);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const j = 0.88 + rng() * 0.24; p.setX(k, p.getX(k) * j); p.setZ(k, p.getZ(k) * j); }
      g.computeVertexNormals();
      colorize(g, (x, y) => { const k = 0.7 + 0.3 * clamp(y / H, 0, 1); return [base[0] * k, base[1] * k, base[2] * k]; });
      parts.push(g);
    }
    const g = new THREE.ConeGeometry(1.9, H, 6, 1); g.translate(0, 1 + H / 2, 0);
    farParts.push(colorize(g, () => base));
  } else if (kind === 'shrub') {
    const base = SRGB('#4c6e30');
    for (let i = 0; i < 4; i++) {
      const g = blob(0.9 + rng() * 0.5, 1, seed + i, 1, 0.8, 1);
      g.translate((rng() - 0.5) * 1.6, 0.7 + rng() * 0.5, (rng() - 0.5) * 1.6);
      colorize(g, (x, y) => { const k = 0.65 + 0.35 * clamp(y / 2, 0, 1); return [base[0] * k, base[1] * k, base[2] * k]; });
      parts.push(g);
    }
    const g = blob(1.3, 0, seed, 1.2, 0.7, 1.2); g.translate(0, 0.8, 0);
    farParts.push(colorize(g, () => base));
  }
  return { near: mergeGeos(parts), far: mergeGeos(farParts) };
}

// Archetypes. Index constants used by the world placer.
export const TREE = { OAK: 0, OAK2: 1, MAPLE: 2, COTTON: 3, CEDAR: 4, CEDAR2: 5, SHRUB: 6, MAPLE_FALL: 7, OAK_FALL: 8, MAPLE_RED: 9 };
const KINDS = [
  { kind: 'oak', seed: 11 }, { kind: 'oak', seed: 23 }, { kind: 'maple', seed: 37 },
  { kind: 'cottonwood', seed: 41 }, { kind: 'cedar', seed: 53 }, { kind: 'cedar', seed: 59 }, { kind: 'shrub', seed: 67 },
  { kind: 'maple', seed: 71, leaf: '#c4782a' }, { kind: 'oak', seed: 83, leaf: '#a8862e' }, { kind: 'maple', seed: 97, leaf: '#a8442a' },
];

export class Trees {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.items = KINDS.map(() => []); // per archetype: [x, y, z, rotY, scale, color]
    this.lodDist = quality.level === 'low' ? 110 : 170;
  }
  add(x, y, z, kindIdx, scale, rng) {
    const col = new THREE.Color(1, 1, 1);
    col.setRGB(0.82 + rng() * 0.3, 0.82 + rng() * 0.3, 0.8 + rng() * 0.25);
    this.items[kindIdx].push({ x, y, z, r: rng() * Math.PI * 2, s: scale, col });
  }
  get total() { return this.items.reduce((a, l) => a + l.length, 0); }
  build() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    addWind(mat, 12, 0.18);
    this.meshes = [];
    KINDS.forEach((k, i) => {
      const list = this.items[i];
      if (!list.length) return;
      const g = makeTree(k.kind, k.seed, k.leaf);
      const near = new THREE.InstancedMesh(g.near, mat, list.length);
      const far = new THREE.InstancedMesh(g.far, mat, list.length);
      near.castShadow = true; near.receiveShadow = true;
      far.castShadow = false; far.receiveShadow = false;
      near.frustumCulled = false; far.frustumCulled = false;
      this.scene.add(near, far);
      this.meshes.push({ near, far, list });
    });
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
  }
  update(camPos) {
    if (camPos.distanceToSquared(this.lastPos) < 25) return;
    this.lastPos.copy(camPos);
    const d2 = this.lodDist * this.lodDist;
    const v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const { near, far, list } of this.meshes) {
      let a = 0, b = 0;
      for (const t of list) {
        const dx = t.x - camPos.x, dz = t.z - camPos.z;
        const isNear = dx * dx + dz * dz < d2;
        this.q.setFromAxisAngle(up, t.r);
        v.set(t.x, t.y, t.z); s.setScalar(t.s);
        this.m4.compose(v, this.q, s);
        if (isNear) { near.setMatrixAt(a, this.m4); near.setColorAt(a, t.col); a++; }
        else { far.setMatrixAt(b, this.m4); far.setColorAt(b, t.col); b++; }
      }
      near.count = a; far.count = b;
      near.instanceMatrix.needsUpdate = true; far.instanceMatrix.needsUpdate = true;
      if (near.instanceColor) near.instanceColor.needsUpdate = true;
      if (far.instanceColor) far.instanceColor.needsUpdate = true;
    }
  }
}

// ---------------- crops ----------------
export function buildCrops(scene, fields, terrain, quality) {
  const group = new THREE.Group();
  const cornMat = new THREE.MeshStandardMaterial({ map: cornTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 });
  addWind(cornMat, 2.4, 0.12, false);
  const beanTex = grassTuftTexture(false);
  const beanMat = new THREE.MeshStandardMaterial({ map: beanTex, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true, roughness: 0.95 });
  addWind(beanMat, 0.8, 0.04, false);
  for (const f of fields) {
    if (f.crop !== 'corn' && f.crop !== 'beans') continue;
    const corn = f.crop === 'corn';
    const H = corn ? 2.5 : 0.7;
    const rowGap = corn ? (quality.level === 'low' ? 1.9 : 1.52) : 1.2;
    const segLen = corn ? 3.0 : 4;
    const pos = [], uv = [], col = [], idx = [];
    const rng = mulberry32(Math.floor(f.x0 * 13 + f.z0 * 7));
    const tint = corn ? [0.95 + rng() * 0.1, 0.92, 0.78] : [0.75, 0.95, 0.55];
    const alongX = f.rows === 'x';
    const L = alongX ? f.x1 - f.x0 : f.z1 - f.z0, Wd = alongX ? f.z1 - f.z0 : f.x1 - f.x0;
    const P = (a, b) => (alongX ? [f.x0 + a, f.z0 + b] : [f.x0 + b, f.z0 + a]);
    const quad = (ax, az, bx, bz, h, u0, u1, c) => {
      const ya = terrain.height(ax, az) - 0.05, yb = terrain.height(bx, bz) - 0.05;
      const base = pos.length / 3;
      pos.push(ax, ya, az, bx, yb, bz, bx, yb + h, bz, ax, ya + h, az);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      for (let k = 0; k < 4; k++) col.push(c[0], c[1], c[2]);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let r = rowGap / 2 + 0.6; r < Wd - 0.6; r += rowGap) {
      const rowTint = 0.9 + rng() * 0.2;
      for (let a = 0.5; a < L - 0.5; a += segLen) {
        const a1 = Math.min(L - 0.5, a + segLen);
        const [ax, az] = P(a, r), [bx, bz] = P(a1, r);
        const h = H * (0.9 + rng() * 0.2);
        const c = tint.map((v) => v * rowTint * (0.9 + rng() * 0.15));
        quad(ax, az, bx, bz, h, a * 0.6, a1 * 0.6, c);
        // cross quad
        if (corn) {
          const am = (a + a1) / 2;
          const [cx0, cz0] = P(am, r - 0.45), [cx1, cz1] = P(am, r + 0.45);
          quad(cx0, cz0, cx1, cz1, h * 0.95, 0, 0.35, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // point normals upward-ish so lighting doesn't flip on double-sided quads
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.3, 0.9, nrm.getZ(i) * 0.3);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, corn ? cornMat : beanMat);
    m.castShadow = corn; m.receiveShadow = true;
    group.add(m);
  }
  scene.add(group);
  return group;
}

// ---------------- pampas / tall grass clumps (static) ----------------
export function buildClumps(scene, points) {
  const tex = pampasTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, vertexColors: true });
  addWind(mat, 2.2, 0.15);
  const g = crossedQuads(2.2, 2.3);
  const inst = new THREE.InstancedMesh(g, mat, Math.max(1, points.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  points.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    m4.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    inst.setMatrixAt(i, m4);
  });
  inst.count = points.length;
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
  return inst;
}

function crossedQuads(w, h, n = 2) {
  const pos = [], uv = [], nor = [], idx = [], col = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI;
    const c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
    const b = pos.length / 3;
    pos.push(-c, 0, -s, c, 0, s, c, h, s, -c, h, -s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) { nor.push(0, 1, 0); col.push(1, 1, 1); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------------- grass tufts around the camera ----------------
export class GrassField {
  constructor(scene, quality, acceptFn, heightFn) {
    this.count = Math.round(7000 * quality.grass);
    this.radius = quality.level === 'low' ? 26 : 38;
    this.accept = acceptFn; this.height = heightFn;
    const tex = grassTuftTexture(false), texD = grassTuftTexture(true);
    const mk = (t) => { const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, vertexColors: true }); addWind(m, 0.7, 0.08); return m; };
    this.meshes = [new THREE.InstancedMesh(crossedQuads(0.9, 0.7), mk(tex), this.count), new THREE.InstancedMesh(crossedQuads(0.9, 0.75), mk(texD), this.count)];
    for (const m of this.meshes) { m.frustumCulled = false; m.receiveShadow = true; m.count = 0; scene.add(m); }
    this.center = new THREE.Vector3(1e9, 0, 0);
    this.m4 = new THREE.Matrix4();
  }
  update(p) {
    if (Math.hypot(p.x - this.center.x, p.z - this.center.z) < 6) return;
    this.center.set(p.x, 0, p.z);
    const R = this.radius, step = Math.sqrt((Math.PI * R * R) / this.count) * 0.95;
    const counts = [0, 0];
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
    const gx0 = Math.floor((p.x - R) / step), gx1 = Math.ceil((p.x + R) / step);
    const gz0 = Math.floor((p.z - R) / step), gz1 = Math.ceil((p.z + R) / step);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      // deterministic jitter per grid cell
      let h = (gx * 73856093) ^ (gz * 19349663);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const r1 = ((h >>> 0) % 10000) / 10000, r2 = (((h >>> 8) >>> 0) % 10000) / 10000, r3 = (((h >>> 16) >>> 0) % 1000) / 1000;
      const x = (gx + r1) * step, z = (gz + r2) * step;
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > R * R) continue;
      const kind = this.accept(x, z, r3);
      if (kind < 0) continue;
      const mesh = this.meshes[kind];
      if (counts[kind] >= this.count) continue;
      q.setFromAxisAngle(up, r3 * 6.28);
      const sc = 0.7 + r1 * 0.7;
      v.set(x, this.height(x, z) - 0.03, z); s.set(sc, sc * (0.8 + r2 * 0.6), sc);
      this.m4.compose(v, q, s);
      mesh.setMatrixAt(counts[kind]++, this.m4);
    }
    this.meshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; });
  }
}

export { windUniforms };
void T; void makeNoise2D;
