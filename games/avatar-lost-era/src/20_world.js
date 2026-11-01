/* =====================================================================
   WORLD: terrain, water, sky, vegetation, structures, colliders
   ===================================================================== */
const WORLD = { size: 640, half: 320, seg: 224, sea: 0 };
WORLD.step = WORLD.size / WORLD.seg;

/* ---------- geometry merge builder (vertex-coloured, one draw call) ---------- */
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, opt = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (opt.jitter) { const p = g.attributes.position; const r = U.rng(opt.seed || 1);
      // jitter shared positions consistently by hashing the rounded coordinate
      for (let i = 0; i < p.count; i++) { const kx = Math.round(p.getX(i) * 100), ky = Math.round(p.getY(i) * 100), kz = Math.round(p.getZ(i) * 100);
        const h = U.hash2(kx * 7 + ky * 13 + (opt.seed || 0), kz * 3 + ky); p.setXYZ(i, p.getX(i) * (1 + (h - 0.5) * opt.jitter), p.getY(i) * (1 + (U.hash2(kx, ky + kz) - 0.5) * opt.jitter), p.getZ(i) * (1 + (U.hash2(kz, kx) - 0.5) * opt.jitter)); }
      r(); }
    TMP.e.set(rx, ry, rz); TMP.q.setFromEuler(TMP.e); TMP.m.compose(TMP.v1.set(x, y, z), TMP.q, TMP.v2.set(sx, sy, sz));
    g.applyMatrix4(TMP.m); g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal; const c = TMP.c.set(color);
    let minY = Infinity, maxY = -Infinity; if (opt.ao || opt.topTint) for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      let k = 1; if (opt.ao) k = U.lerp(1 - opt.ao, 1, U.clamp((p.getY(i) - minY) / (maxY - minY + 1e-4), 0, 1));
      if (opt.vary) k *= 1 + (U.hash2(i * 3 + 1, Math.round(p.getY(i) * 10)) - 0.5) * opt.vary;
      if (opt.topTint) { const t = U.clamp((p.getY(i) - minY) / (maxY - minY + 1e-4), 0, 1); TMP.v3.set(c.r, c.g, c.b).lerp(TMP.v1.set(opt.topTint.r, opt.topTint.g, opt.topTint.b), t * t); this.col.push(TMP.v3.x * k, TMP.v3.y * k, TMP.v3.z * k); }
      else this.col.push(c.r * k, c.g * k, c.b * k);
    }
    g.dispose(); return this;
  }
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.computeBoundingSphere(); return g; }
}
const MAT = {};
function lambert(key, opts) { if (!MAT[key]) MAT[key] = new THREE.MeshLambertMaterial(opts); return MAT[key]; }
const VCMAT = () => lambert('vc', { vertexColors: true });

/* ---------- wind sway shader injection ---------- */
const WIND = { uniforms: { uTime: { value: 0 }, uWind: { value: 1 } } };
function windify(mat, strength, heightScale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uniforms.uTime; sh.uniforms.uWind = WIND.uniforms.uWind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float hk = max(position.y, 0.0) / ${heightScale.toFixed(2)};
      float sw = sin(uTime * 1.7 + ip.x * 0.21 + ip.z * 0.17) + 0.5 * sin(uTime * 3.1 + ip.x * 0.5);
      transformed.x += sw * ${strength.toFixed(3)} * hk * hk * uWind;
      transformed.z += cos(uTime * 1.3 + ip.z * 0.23) * ${(strength * 0.6).toFixed(3)} * hk * hk * uWind;`);
  };
  mat.customProgramCacheKey = () => 'wind' + strength + heightScale;
  return mat;
}

/* ---------- height field ---------- */
const PADS = [
  { x: -205, z: -25, r: 27, b: 14 }, { x: 25, z: -225, r: 14, b: 12 }, { x: 168, z: -119, r: 13, b: 10, at: [168, -99] },
  { x: 145, z: 32, r: 20, b: 12 }, { x: -40, z: 102, r: 9, b: 8 }, { x: -46, z: 52, r: 14, b: 10 },
];
function baseHeight(x, z) {
  const rc = Math.hypot(x, z);
  let h = 3.4 + Noise.fbm(x * 0.0075, z * 0.0075, 4) * 6 + Noise.fbm(x * 0.035 + 11, z * 0.035 - 7, 2) * 1.1;
  h += U.smooth(60, 210, rc) * 7;
  // northern mountains
  const nmz = z + Noise.fbm(x * 0.006, 3.3, 2) * 30;
  const nm = U.smooth(-105, -195, nmz);
  if (nm > 0) h += nm * (12 + Noise.ridged(x * 0.011 + 5, z * 0.011, 4) * 78);
  h += 52 * Math.exp(-((x - 25) ** 2 + (z + 225) ** 2) / (2 * 30 * 30));
  // western crags: terraced mesas of red rock
  const wx = x + Noise.fbm(z * 0.008, 9.1, 2) * 25;
  const wc = U.smooth(-115, -170, wx) * U.smooth(150, 95, z);
  if (wc > 0) { let m = 5 + (Noise.fbm(x * 0.018, z * 0.018, 3) * 0.5 + 0.5) * 34; const t = m / 6; m = (Math.floor(t) + Math.pow(t - Math.floor(t), 5)) * 6; h += wc * m; }
  // pagoda hill
  const dp = Math.hypot(x - 82, z + 78); h += 30 * U.smooth(48, 9, dp);
  // badgermole ridge
  const db = Math.hypot((x - 178) * 0.75, (z + 152) * 1.3); h += 42 * U.smooth(60, 16, db) * (0.85 + 0.15 * Noise.fbm(x * 0.05, z * 0.05, 2));
  // misty marsh
  const dm = Math.hypot(x + 170, z - 175); h = U.lerp(h, 1.3 + Noise.fbm(x * 0.05, z * 0.05, 2) * 1.4, U.smooth(80, 35, dm));
  // east coast and island edge
  const cx = x + Noise.fbm(z * 0.01, 1.7, 2) * 30; h = U.lerp(h, -7, U.smooth(200, 252, cx));
  const er = rc + Noise.fbm(x * 0.01, z * 0.01, 2) * 22; h = U.lerp(h, -14, U.smooth(272, 312, er));
  // Lake Yue
  const dl = Math.hypot((x + 80) / 1.15, z - 140); h = U.lerp(h, -5, U.smooth(43, 22, dl));
  // river
  const dr = U.polyDist(x, z, RIVER); h = U.lerp(h, Math.min(h, -2.4), U.smooth(11.5, 3.6, dr));
  // village plateau
  h = U.lerp(h, 4.2 + Noise.fbm(x * 0.03, z * 0.03, 1) * 0.3, U.smooth(60, 38, rc));
  return h;
}
const PAD_H = PADS.map(p => p.at ? baseHeight(p.at[0], p.at[1]) : baseHeight(p.x, p.z)); // 'at': level a pad to its approach ground (the cave sits at the foot of its ridge)
function rawHeight(x, z) {
  let h = baseHeight(x, z);
  for (let i = 0; i < PADS.length; i++) { const p = PADS[i]; const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + p.b) h = U.lerp(h, PAD_H[i], U.smooth(p.r + p.b, p.r, d)); }
  return h;
}

const HF = { n: WORLD.seg + 1, h: null, slope: null };
function buildHeightField() {
  const n = HF.n; HF.h = new Float32Array(n * n); HF.slope = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) HF.h[j * n + i] = rawHeight(-WORLD.half + i * WORLD.step, -WORLD.half + j * WORLD.step);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = HF.h[j * n + Math.min(i + 1, n - 1)] - HF.h[j * n + Math.max(i - 1, 0)], b = HF.h[Math.min(j + 1, n - 1) * n + i] - HF.h[Math.max(j - 1, 0) * n + i];
    HF.slope[j * n + i] = Math.hypot(a, b) / (2 * WORLD.step);
  }
}
function terrainH(x, z) {
  const fx = (x + WORLD.half) / WORLD.step, fz = (z + WORLD.half) / WORLD.step; const n = HF.n;
  if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) return -14;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const h00 = HF.h[j * n + i], h10 = HF.h[j * n + i + 1], h01 = HF.h[(j + 1) * n + i], h11 = HF.h[(j + 1) * n + i + 1];
  // match the triangle split used by PlaneGeometry (diagonal from (i,j+1) to (i+1,j))
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}
function slopeAt(x, z) { const n = HF.n; const i = U.clamp(Math.round((x + WORLD.half) / WORLD.step), 0, n - 1), j = U.clamp(Math.round((z + WORLD.half) / WORLD.step), 0, n - 1); return HF.slope[j * n + i]; }

/* ---------- platforms (walkable surfaces above terrain) & colliders ---------- */
const PLATFORMS = [];
function addPlatform(x, z, hw, hd, rot, y) { PLATFORMS.push({ x, z, hw, hd, rot, y, c: Math.cos(rot), s: Math.sin(rot) }); }
function groundH(x, z, fromY = 1e9) {
  let h = terrainH(x, z);
  for (let i = 0; i < PLATFORMS.length; i++) { const p = PLATFORMS[i]; const dx = x - p.x, dz = z - p.z;
    const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
    if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd && p.y > h && p.y <= fromY + 0.6) h = p.y; }
  return h;
}
const COLL = { cell: 16, map: new Map(), list: [] };
function collKey(i, j) { return i * 1000 + j; }
function addCollider(c) {
  c.id = COLL.list.length; COLL.list.push(c); if (c.type === 'box') { c.cs = Math.cos(c.rot); c.sn = Math.sin(c.rot); }
  const rad = c.type === 'box' ? Math.hypot(c.hw, c.hd) : c.r;
  const i0 = Math.floor((c.x - rad) / COLL.cell), i1 = Math.floor((c.x + rad) / COLL.cell), j0 = Math.floor((c.z - rad) / COLL.cell), j1 = Math.floor((c.z + rad) / COLL.cell);
  c.cells = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = collKey(i, j); if (!COLL.map.has(k)) COLL.map.set(k, []); COLL.map.get(k).push(c); c.cells.push(k); }
  return c;
}
function removeCollider(c) { if (!c || !c.cells) return; for (const k of c.cells) { const a = COLL.map.get(k); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } } c.cells = null; c.dead = true; }
const _near = [];
function collidersNear(x, z) {
  _near.length = 0; const i = Math.floor(x / COLL.cell), j = Math.floor(z / COLL.cell);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = COLL.map.get(collKey(i + a, j + b)); if (l) for (const c of l) if (!_near.includes(c)) _near.push(c); }
  return _near;
}
// push a circle (x,z,r) at height y out of colliders; returns true if pushed. mutates pos
function resolveCollisions(pos, r, y) {
  let hit = false; const list = collidersNear(pos.x, pos.z);
  for (const c of list) {
    if (c.top !== undefined && y >= c.top - 0.25) continue;
    if (c.bottom !== undefined && y + 1.6 < c.bottom) continue;
    if (c.type === 'circle') {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-5) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; hit = true; }
    } else {
      const dx = pos.x - c.x, dz = pos.z - c.z; let lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs;
      const px = U.clamp(lx, -c.hw, c.hw), pz = U.clamp(lz, -c.hd, c.hd); let ddx = lx - px, ddz = lz - pz; let d = Math.hypot(ddx, ddz);
      if (d < r) {
        if (d < 1e-5) { // inside: push out along smallest axis
          const ox = c.hw - Math.abs(lx), oz = c.hd - Math.abs(lz);
          if (ox < oz) lx = Math.sign(lx || 1) * (c.hw + r); else lz = Math.sign(lz || 1) * (c.hd + r);
        } else { lx = px + ddx / d * r; lz = pz + ddz / d * r; }
        // back to world (inverse of the local transform)
        pos.x = c.x + lx * c.cs + lz * c.sn;
        pos.z = c.z - lx * c.sn + lz * c.cs;
        hit = true;
      }
    }
  }
  return hit;
}

/* ---------- biomes & colour ---------- */
function regionInfo(x, z, h) {
  const marsh = U.smooth(80, 40, Math.hypot(x + 170, z - 175));
  const wx = x + Noise.fbm(z * 0.008, 9.1, 2) * 25; const crag = U.smooth(-115, -160, wx) * U.smooth(150, 95, z) * (1 - marsh);
  const forest = Noise.fbm(x * 0.012 + 40, z * 0.012 - 20, 3);
  const rc = Math.hypot(x, z);
  const snowLine = 60 + Noise.fbm(x * 0.02, z * 0.02, 2) * 8;
  return { crag, marsh, forest, rc, snow: U.smooth(snowLine - 4, snowLine + 4, h) };
}
const COL = {};
function hexc(h) { return COL[h] || (COL[h] = new THREE.Color(h)); }
function terrainColor(x, z, h, slope, out) {
  const ri = regionInfo(x, z, h); const n1 = Noise.fbm(x * 0.06, z * 0.06, 2), n2 = Noise.s2(x * 0.2, z * 0.2);
  // base grass (warm, painterly)
  out.copy(hexc('#86b24c')).lerp(hexc('#b0c45c'), U.clamp(n1 * 0.8 + 0.5, 0, 1));
  if (ri.forest > 0.05 && ri.rc > 55) out.lerp(hexc('#557f34'), U.smooth(0.05, 0.25, ri.forest) * 0.8);
  if (z < -60) out.lerp(hexc('#5f7f3e'), U.smooth(-60, -140, z) * 0.6);
  // farm plots east/west of the village
  const farm = farmAt(x, z); if (farm) out.copy((Math.floor((farm.u) / 2.2) % 2) ? hexc('#8f7448') : hexc('#7c9a3a'));
  // marsh
  if (ri.marsh > 0) out.lerp(hexc('#5d7e52'), ri.marsh * 0.7);
  // crags (red rock / ash)
  if (ri.crag > 0) { const rr = hexc('#b4553a').clone().lerp(hexc('#7a3424'), U.clamp(n2 * 0.5 + 0.5, 0, 1)); out.lerp(rr, ri.crag); }
  // rock on steep slopes and high ground
  const rockAmt = Math.max(U.smooth(0.75, 1.2, slope), U.smooth(38, 52, h) * 0.8);
  if (rockAmt > 0) out.lerp(ri.crag > 0.5 ? hexc('#6e3427') : hexc('#8a8478').clone().lerp(hexc('#6a645a'), n2 * 0.5 + 0.5), rockAmt);
  // snow
  if (ri.snow > 0) out.lerp(hexc('#f2f6fb'), ri.snow * U.smooth(1.5, 0.7, slope) + ri.snow * 0.2);
  // roads
  let rd = 1e9; for (const r of ROADS) rd = Math.min(rd, U.polyDist(x, z, r));
  if (rd < 3.2 && h > 0.8) out.lerp(hexc('#a88b5c'), U.smooth(3.2, 1.6, rd) * 0.9);
  // village plaza
  if (ri.rc < 15) out.lerp(hexc('#b9a888'), U.smooth(15, 13, ri.rc));
  // beaches and underwater
  if (h < 1.8) out.lerp(hexc('#e0cc94'), U.smooth(1.8, 0.4, h) * (ri.marsh > 0.5 ? 0.3 : 1));
  if (h < 0) { out.lerp(hexc('#3f8a8a'), U.smooth(0, -2, h)); out.lerp(hexc('#123a5a'), U.smooth(-2, -10, h)); }
  // painterly variance
  const k = 1 + n2 * 0.06; out.multiplyScalar(k);
  return out;
}
function farmAt(x, z) {
  // two cabbage fields near the village
  const F = [{ x: 46, z: 30, w: 26, d: 16, rot: 0.15 }, { x: -48, z: -26, w: 22, d: 18, rot: -0.3 }];
  for (const f of F) { const dx = x - f.x, dz = z - f.z, c = Math.cos(-f.rot), s = Math.sin(-f.rot); const u = dx * c - dz * s, v = dx * s + dz * c;
    if (Math.abs(u) < f.w / 2 && Math.abs(v) < f.d / 2) return { u: u + f.w / 2, v: v + f.d / 2, f }; }
  return null;
}

/* ---------- textures ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); } t.anisotropy = 4; return t;
}
function waterNormalTex() {
  const s = 256; const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); const img = g.createImageData(s, s);
  const hgt = (x, y) => { let v = 0; for (let k = 1; k <= 4; k++) v += Math.sin((x * k * 2 + y * (5 - k)) * Math.PI * 2 / s * 2 + k * 1.7) / k + Math.cos((y * k * 3 - x * k) * Math.PI * 2 / s + k) / (k * 1.5); return v; };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1); const nx = -dx * 0.6, ny = -dy * 0.6, nz = 1; const l = Math.hypot(nx, ny, nz); const i = (y * s + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function softTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
}
function cloudTex(seed) {
  const r = U.rng(seed);
  return canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 26; i++) { const x = w * (0.18 + r() * 0.64), y = h * (0.45 + (r() - 0.5) * 0.35), rad = 18 + r() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); const b = 235 + r() * 20; gr.addColorStop(0, `rgba(${b},${b},${b},.55)`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  });
}

/* ---------- World build ---------- */
const World = {
  scene: null, group: null, sky: null, sun: null, hemi: null, amb: null, water: null, clouds: [], treeRecs: [], bushRecs: [], rockRecs: [], lanterns: [], flames: [], interact: [], minimapImg: null,
  build(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    buildHeightField();
    this.buildTerrain(); this.buildWater(); this.buildSky(); this.buildLights();
    this.buildStructures(); this.buildVegetation(); this.buildGrass();
    this.buildMinimap();
  },
  buildTerrain() {
    const n = WORLD.seg; const g = new THREE.PlaneGeometry(WORLD.size, WORLD.size, n, n); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; const cols = new Float32Array(p.count * 3); const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); const ii = Math.round((x + WORLD.half) / WORLD.step), jj = Math.round((z + WORLD.half) / WORLD.step);
      const h = HF.h[jj * HF.n + ii]; p.setY(i, h); terrainColor(x, z, h, HF.slope[jj * HF.n + ii], c); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.name = 'terrain'; this.group.add(m); this.terrain = m;
    // distant ocean floor skirt so the horizon is never empty
  },
  buildWater() {
    const nt = waterNormalTex(); nt.repeat.set(60, 60); this.waterNormal = nt;
    const mat = new THREE.MeshPhongMaterial({ color: 0x2c86b8, specular: 0xbfe7ff, shininess: 90, transparent: true, opacity: 0.8, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600, 1, 1), mat); w.rotation.x = -Math.PI / 2; w.position.y = WORLD.sea; w.renderOrder = 2; w.name = 'water';
    this.group.add(w); this.water = w;
    // shoreline foam ring: thin brighter band at the waterline using a second transparent plane slightly above at shallow areas is costly; we fake it in terrain colour instead.
  },
  buildSky() {
    const geo = new THREE.SphereGeometry(1200, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: V3(0, 1, 0) }, moonDir: { value: V3(0, -1, 0) }, sunCol: { value: new THREE.Color() }, stars: { value: 0 }, uTime: WIND.uniforms.uTime, moonPhase: { value: 1 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 moonDir; uniform vec3 sunCol; uniform float stars; uniform float uTime; uniform float moonPhase; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){ vec3 d = normalize(vDir); float y = d.y;
          vec3 c = mix(hor, top, pow(clamp(y,0.0,1.0), 0.55));
          c = mix(c, bot, smoothstep(0.0,-0.25,y));
          float sd = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(sd, 6.0)*0.35 + pow(sd, 60.0)*0.5) * smoothstep(-0.3,0.1,sunDir.y);
          c = mix(c, vec3(1.0,0.97,0.88)*1.6, smoothstep(0.9993,0.9996,sd));
          float md = max(dot(d, moonDir), 0.0);
          float disc = smoothstep(0.99955,0.99975,md);
          vec3 off = normalize(moonDir + vec3(0.025*(1.0-moonPhase),0.004,0.0));
          float shade = smoothstep(0.99955,0.99975,max(dot(d, off),0.0));
          float crater = 0.85 + 0.15 * hash(floor(d * 900.0));
          c = mix(c, vec3(0.92,0.94,1.0) * crater * 1.15, disc * mix(1.0, 1.0-shade, step(moonPhase,0.95)) * mix(0.35, 1.0, stars));
          c += vec3(0.5,0.6,0.8) * pow(md, 200.0) * 0.4 * smoothstep(-0.1,0.2,moonDir.y);
          if (stars > 0.01 && y > 0.0) { vec3 q = floor(d*260.0); float h = hash(q); float tw = 0.6+0.4*sin(uTime*2.0+h*50.0);
            c += vec3(1.0,0.95,0.9) * step(0.9965, h) * stars * tw * smoothstep(0.0,0.25,y); }
          gl_FragColor = vec4(c,1.0);
          #include <colorspace_fragment>
        }`
    });
    this.sky = new THREE.Mesh(geo, mat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; this.scene.add(this.sky);
    // clouds
    const tex = [cloudTex(11), cloudTex(23), cloudTex(37)]; const r = U.rng(99);
    for (let i = 0; i < 34; i++) {
      const m = new THREE.SpriteMaterial({ map: tex[i % 3], transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
      const s = new THREE.Sprite(m); const sc = 120 + r() * 160; s.scale.set(sc, sc * 0.45, 1);
      s.userData = { a: r() * Math.PI * 2, d: 260 + r() * 520, y: 150 + r() * 90, sp: 0.002 + r() * 0.004 };
      this.scene.add(s); this.clouds.push(s);
    }
    this.scene.fog = new THREE.Fog(0xcfe6f5, 60, 560);
  },
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a4a2a, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.6); this.sun.position.set(100, 200, 50); this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.amb = new THREE.AmbientLight(0xffffff, 0.15); this.scene.add(this.amb);
  },

  /* ---------------- vegetation ---------------- */
  treeGeo(type) {
    const b = new GeoBuilder();
    if (type === 'broad') {
      b.add(new THREE.CylinderGeometry(0.22, 0.42, 4.2, 7), '#6a4a2e', 0, 2.1, 0, 0, 0, 0, 1, 1, 1, { ao: 0.4 });
      b.add(new THREE.CylinderGeometry(0.1, 0.18, 2, 5), '#6a4a2e', 0.7, 3.4, 0, 0, 0, -0.7);
      const fol = [[0, 5.2, 0, 2.3], [1.3, 4.6, 0.6, 1.7], [-1.2, 4.7, -0.5, 1.8], [0.2, 6.3, -0.3, 1.6]];
      fol.forEach(([x, y, z, r], i) => b.add(new THREE.IcosahedronGeometry(r, 1), '#5f9a3a', x, y, z, i, i * 2, 0, 1, 0.85, 1, { ao: 0.45, topTint: hexc('#a8c95a'), jitter: 0.18, seed: i + 3 }));
    } else if (type === 'pine') {
      b.add(new THREE.CylinderGeometry(0.16, 0.32, 4.2, 6), '#5a3e28', 0, 2.1, 0, 0, 0, 0, 1, 1, 1, { ao: 0.4 });
      [[2.4, 2.6, 3.1], [2.0, 2.4, 4.4], [1.5, 2.2, 5.6], [0.9, 1.8, 6.7]].forEach(([r, h, y], i) => b.add(new THREE.ConeGeometry(r, h, 8, 1), '#2f5a32', 0, y, 0, 0, i * 0.7, 0, 1, 1, 1, { ao: 0.5, topTint: hexc('#5a8a4a') }));
    } else if (type === 'peach') {
      b.add(new THREE.CylinderGeometry(0.15, 0.28, 2.6, 6), '#5a3a2a', 0, 1.3, 0, 0, 0, 0.08, 1, 1, 1, { ao: 0.4 });
      [[0, 3.2, 0, 1.6], [0.9, 2.9, 0.4, 1.1], [-0.8, 3.0, -0.3, 1.2]].forEach(([x, y, z, r], i) => b.add(new THREE.IcosahedronGeometry(r, 1), '#f2b8c8', x, y, z, 0, i, 0, 1, 0.8, 1, { ao: 0.35, topTint: hexc('#fff0f4'), jitter: 0.15, seed: i + 9 }));
      for (let i = 0; i < 7; i++) { const a = i * 0.9; b.add(new THREE.SphereGeometry(0.13, 6, 4), '#ff9a5a', Math.cos(a) * 1.3, 2.5 + (i % 3) * 0.35, Math.sin(a) * 1.3); }
    } else if (type === 'ash') {
      b.add(new THREE.CylinderGeometry(0.12, 0.35, 4, 5), '#3a2a24', 0, 2, 0, 0, 0, 0.1, 1, 1, 1, { ao: 0.3 });
      b.add(new THREE.CylinderGeometry(0.05, 0.12, 2, 4), '#3a2a24', 0.6, 3.4, 0, 0, 0, -0.9);
      b.add(new THREE.CylinderGeometry(0.05, 0.1, 1.6, 4), '#3a2a24', -0.5, 3.0, 0.2, 0.3, 0, 0.9);
      b.add(new THREE.IcosahedronGeometry(0.9, 0), '#8a5a2a', 0.2, 4.4, 0, 0, 0, 0, 1.2, 0.6, 1.2, { jitter: 0.2 });
    } else if (type === 'bamboo') {
      for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.3 + (i % 3) * 0.35, h = 6 + (i % 4) * 1.6; const x = Math.cos(a) * r, z = Math.sin(a) * r;
        b.add(new THREE.CylinderGeometry(0.07, 0.09, h, 5), '#7aa04a', x, h / 2, z, 0.04 * Math.sin(a), 0, 0.04 * Math.cos(a), 1, 1, 1, { ao: 0.3 });
        b.add(new THREE.ConeGeometry(0.7, 1.6, 5), '#5f9a3a', x, h - 0.2, z, Math.PI, a, 0, 1, 1, 0.4); }
    } else if (type === 'bush') {
      b.add(new THREE.IcosahedronGeometry(0.9, 1), '#4f7f30', 0, 0.6, 0, 0, 0, 0, 1.2, 0.8, 1.2, { ao: 0.5, topTint: hexc('#7aa64a'), jitter: 0.2, seed: 4 });
      for (let i = 0; i < 9; i++) { const a = i * 0.7; b.add(new THREE.SphereGeometry(0.09, 5, 4), '#c0283a', Math.cos(a) * 0.95, 0.5 + (i % 3) * 0.22, Math.sin(a) * 0.95); }
    } else if (type === 'reed') {
      for (let i = 0; i < 6; i++) { const a = i * 1.1; b.add(new THREE.CylinderGeometry(0.02, 0.04, 1.6 + (i % 3) * 0.3, 3), '#8a9a4a', Math.cos(a) * 0.25, 0.8, Math.sin(a) * 0.25, Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
        b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 4), '#6a4a2a', Math.cos(a) * 0.3, 1.7 + (i % 3) * 0.3, Math.sin(a) * 0.3); }
    } else if (type === 'rock') {
      b.add(new THREE.DodecahedronGeometry(1, 1), '#8f8a80', 0, 0.35, 0, 0, 0, 0, 1, 0.7, 1, { ao: 0.45, jitter: 0.35, seed: 5, topTint: hexc('#a8a296') });
    } else if (type === 'redrock') {
      b.add(new THREE.DodecahedronGeometry(1, 1), '#8a3a26', 0, 0.35, 0, 0, 0, 0, 1, 0.8, 1, { ao: 0.45, jitter: 0.35, seed: 8, topTint: hexc('#b8603a') });
    }
    return b.build();
  },
  instanced(type, recs, opt = {}) {
    if (!recs.length) return null;
    const geo = this.treeGeo(type); const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (opt.wind) windify(mat, opt.wind, opt.windH || 6);
    const im = new THREE.InstancedMesh(geo, mat, recs.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(), p = V3(); const c = new THREE.Color();
    recs.forEach((r, i) => { q.setFromAxisAngle(TMP.v3.set(0, 1, 0), r.rot); s.set(r.s * (r.sx || 1), r.s * (r.sy || 1), r.s * (r.sx || 1)); p.set(r.x, r.y, r.z); m.compose(p, q, s); im.setMatrixAt(i, m); c.setRGB(r.tint, r.tint, r.tint * (r.tb || 1)); im.setColorAt(i, c); r.inst = i; r.mesh = im; });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; im.name = type; this.group.add(im); return im;
  },
  buildVegetation() {
    const r = U.rng(2024); const recs = { broad: [], pine: [], peach: [], ash: [], bamboo: [], bush: [], reed: [], rock: [], redrock: [] };
    const roadD = (x, z) => { let d = 1e9; for (const rd of ROADS) d = Math.min(d, U.polyDist(x, z, rd)); return d; };
    // seat objects on the LOWEST ground under their footprint so nothing hovers on hillsides
    const minUnder = (x, z, rad) => { let m = terrainH(x, z); for (let a = 0; a < 6.28; a += 0.785) { m = Math.min(m, terrainH(x + Math.cos(a) * rad, z + Math.sin(a) * rad), terrainH(x + Math.cos(a) * rad * 0.5, z + Math.sin(a) * rad * 0.5)); } return m; };
    // occupancy grid of placed vegetation: nothing spawns inside something else (rocks may still cluster and touch)
    const occ = new Map(); const ok8 = (x, z) => Math.floor(x / 8) * 1000 + Math.floor(z / 8);
    const occupy = (x, z, rad, kind) => { const k = ok8(x, z); if (!occ.has(k)) occ.set(k, []); occ.get(k).push({ x, z, rad, kind }); };
    const crowded = (x, z, rad, kind) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = occ.get(ok8(x + i * 8, z + j * 8)); if (!l) continue;
        for (const o of l) { const d = Math.hypot(x - o.x, z - o.z); if (kind === 'rock' && o.kind === 'rock') { if (d < Math.max(rad, o.rad) * 0.6) return true; } else if (d < (rad + o.rad) * 0.9) return true; } } return false; };
    const onStair = (x, z, pad) => (this.stairPts || []).some(p => Math.hypot(x - p[0], z - p[1]) < 2.2 + pad);
    const nearLandmark = (x, z, pad = 0) => { for (const k in LOC) { const L = LOC[k]; if (k === 'lake' || k === 'crags' || k === 'pillars' || k === 'shore') continue; if (Math.hypot(x - L.x, z - L.z) < L.r + pad) return true; } return false; };
    const blocked = (x, z, rr) => { const l = collidersNear(x, z); for (const c of l) { if (c.type === 'circle' && Math.hypot(x - c.x, z - c.z) < c.r + rr) return true; if (c.type === 'box' && Math.hypot(x - c.x, z - c.z) < Math.hypot(c.hw, c.hd) + rr) return true; } return false; };
    for (let i = 0; i < 9000; i++) {
      const x = (r() - 0.5) * 600, z = (r() - 0.5) * 600; const h = terrainH(x, z); if (h < 1.0) continue;
      const sl = slopeAt(x, z); const ri = regionInfo(x, z, h); const rd = roadD(x, z);
      if (rd < 4 || nearLandmark(x, z, 4) || farmAt(x, z) || onStair(x, z, 1.5)) continue;
      if (ri.rc < 50 && r() < 0.85) continue;
      const tint = 0.85 + r() * 0.3;
      if (ri.crag > 0.6) { if (r() < 0.08 && sl < 0.8 && recs.ash.length < 90 && !blocked(x, z, 1) && !crowded(x, z, 0.6, 'tree')) occupy(x, z, 0.5, 'tree'), recs.ash.push({ x, y: NaN, z, rot: r() * 6.3, s: 0.8 + r() * 0.6, tint }); continue; }
      if (ri.snow > 0.3) continue;
      if (ri.marsh > 0.5) { if (r() < 0.25 && recs.bamboo.length < 140 && sl < 0.7 && !crowded(x, z, 1.0, 'tree') && !blocked(x, z, 1.2)) occupy(x, z, 0.9, 'tree'), recs.bamboo.push({ x, y: NaN, z, rot: r() * 6.3, s: 0.8 + r() * 0.5, tint }); continue; }
      if (sl > 0.9) continue;
      const forest = ri.forest > 0.05 && ri.rc > 55;
      const pineZone = z < -70 || h > 26;
      if (forest || r() < 0.05) {
        if (blocked(x, z, 1.4) || crowded(x, z, 1.0, 'tree')) continue;
        if (pineZone && recs.pine.length < 650) occupy(x, z, 0.5, 'tree'), recs.pine.push({ x, y: NaN, z, rot: r() * 6.3, s: 0.8 + r() * 0.7, tint });
        else if (!pineZone && recs.broad.length < 720) occupy(x, z, 0.6, 'tree'), recs.broad.push({ x, y: NaN, z, rot: r() * 6.3, s: 0.75 + r() * 0.65, tint, tb: 0.85 + r() * 0.2 });
      }
    }
    // orchard of moon peaches near the village
    for (let i = 0; i < 26; i++) { const a = -0.9 + (i % 13) * 0.11, rr = 54 + Math.floor(i / 13) * 7; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; const h = terrainH(x, z); if (h > 1 && roadD(x, z) > 4) occupy(x, z, 0.5, 'tree'), recs.peach.push({ x, y: NaN, z, rot: r() * 6.3, s: 0.9 + r() * 0.3, tint: 1 }); }
    // berry bushes, reeds, rocks
    for (let i = 0; i < 5000; i++) {
      const x = (r() - 0.5) * 600, z = (r() - 0.5) * 600; const h = terrainH(x, z); const sl = slopeAt(x, z); const ri = regionInfo(x, z, h); const rd = roadD(x, z);
      if (nearLandmark(x, z, 2) || farmAt(x, z) || onStair(x, z, 1)) continue;
      if (h > -0.4 && h < 0.9 && recs.reed.length < 320 && ri.crag < 0.3) { if (blocked(x, z, 0.5) || crowded(x, z, 0.4, 'reed')) continue; recs.reed.push({ x, y: h - 0.1, z, rot: r() * 6.3, s: 0.8 + r() * 0.5, tint: 0.9 + r() * 0.2 }); continue; }
      if (h < 1) continue;
      if (ri.crag > 0.5) { if (recs.redrock.length < 260 && r() < 0.5) { const s = 0.5 + Math.pow(r(), 2.5) * 4.5; if (blocked(x, z, s * 0.8) || crowded(x, z, s * 0.8, 'rock')) continue; occupy(x, z, s * 0.8, 'rock'); recs.redrock.push({ x, y: NaN, z, rot: r() * 6.3, s, sy: 0.7 + r() * 0.8, tint: 0.85 + r() * 0.3 }); } continue; }
      if (rd > 3 && ri.rc > 40 && ri.snow < 0.5 && sl < 0.6 && recs.bush.length < 170 && r() < 0.18 && (ri.forest > -0.1)) { if (!blocked(x, z, 0.8) && !crowded(x, z, 1.0, 'bush')) occupy(x, z, 1.0, 'bush'), recs.bush.push({ x, y: NaN, z, rot: r() * 6.3, s: 0.8 + r() * 0.4, tint: 0.9 + r() * 0.2 }); continue; }
      if (ri.rc > 42 && recs.rock.length < 520 && r() < 0.35 + U.smooth(0.4, 1.0, sl)) { const s = 0.3 + Math.pow(r(), 3) * 4.2; if (rd < 2.2 + s || blocked(x, z, s * 0.8) || crowded(x, z, s * 0.8, 'rock')) continue; occupy(x, z, s * 0.8, 'rock'); recs.rock.push({ x, y: NaN, z, rot: r() * 6.3, s, sy: 0.6 + r() * 0.7, sx: 1, tint: 0.85 + r() * 0.3 }); }
    }
    // targeted passes: reeds along river banks, the lake and the coast; bamboo groves through the misty marsh
    for (let i = 0; i < 6000 && recs.reed.length < 320; i++) {
      let x, z; const m = r();
      if (m < 0.55) { const k = Math.floor(r() * (RIVER.length - 1)); const u = r(); const a = RIVER[k], b = RIVER[k + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); const off = (r() < 0.5 ? -1 : 1) * (4 + r() * 6); x = a[0] + dx * u - dz / L * off; z = a[1] + dz * u + dx / L * off; }
      else if (m < 0.85) { const a = r() * 6.28, rr = 28 + r() * 16; x = -80 + Math.cos(a) * rr * 1.15; z = 140 + Math.sin(a) * rr; }
      else { x = 190 + r() * 60; z = (r() - 0.5) * 400; }
      const h = terrainH(x, z); if (h < -0.5 || h > 0.8 || regionInfo(x, z, h).crag > 0.3 || blocked(x, z, 0.5) || crowded(x, z, 0.4, 'reed') || nearLandmark(x, z, 2) || roadD(x, z) < 2.5) continue;
      recs.reed.push({ x, y: h - 0.1, z, rot: r() * 6.3, s: 0.8 + r() * 0.5, tint: 0.9 + r() * 0.2 });
    }
    for (let i = 0; i < 3000 && recs.bamboo.length < 140; i++) {
      const a = r() * 6.28, rr = Math.sqrt(r()) * 72; const x = LOC.pillars.x + Math.cos(a) * rr, z = LOC.pillars.z + Math.sin(a) * rr; const h = terrainH(x, z);
      if (h < 0.9 || slopeAt(x, z) > 0.7 || regionInfo(x, z, h).marsh < 0.4 || blocked(x, z, 1.2) || crowded(x, z, 1.0, 'tree') || roadD(x, z) < 3) continue;
      occupy(x, z, 0.9, 'tree'); recs.bamboo.push({ x, y: NaN, z, rot: r() * 6.3, s: 0.8 + r() * 0.5, tint: 0.85 + r() * 0.3 });
    }
    // final seating (trunk/rock/bush footprints measured against the lowest terrain beneath them)
    for (const [k, list] of Object.entries(recs)) for (const o of list) { const h = terrainH(o.x, o.z); const s = o.s, sy = o.sy || 1;
      if (k === 'rock') o.y = Math.min(h - 0.15 * s, minUnder(o.x, o.z, 0.8 * s) + 0.07 * s * sy);
      else if (k === 'redrock') o.y = Math.min(h - 0.15 * s, minUnder(o.x, o.z, 0.8 * s) + 0.13 * s * sy);
      else if (k === 'bush') o.y = Math.min(h - 0.05, minUnder(o.x, o.z, 0.86 * s) - 0.17 * s);
      else if (k === 'reed') o.y = h - 0.1;
      else o.y = minUnder(o.x, o.z, (k === 'bamboo' ? 0.9 : 0.45) * s) - 0.12; }
    this.instanced('broad', recs.broad, { wind: 0.12, windH: 7 }); this.instanced('pine', recs.pine, { wind: 0.08, windH: 7 }); this.instanced('peach', recs.peach, { wind: 0.08, windH: 4 });
    this.instanced('ash', recs.ash); this.instanced('bamboo', recs.bamboo, { wind: 0.25, windH: 8 }); this.instanced('bush', recs.bush, { wind: 0.04, windH: 1.5 });
    this.instanced('reed', recs.reed, { wind: 0.15, windH: 2 }); this.instanced('rock', recs.rock); this.instanced('redrock', recs.redrock);
    // colliders + interactables
    for (const t of recs.broad) { addCollider({ type: 'circle', x: t.x, z: t.z, r: 0.5 * t.s }); this.treeRecs.push(Object.assign(t, { kind: 'tree' })); }
    for (const t of recs.pine) { addCollider({ type: 'circle', x: t.x, z: t.z, r: 0.4 * t.s }); this.treeRecs.push(Object.assign(t, { kind: 'tree' })); }
    for (const t of recs.peach) { addCollider({ type: 'circle', x: t.x, z: t.z, r: 0.35 }); this.treeRecs.push(Object.assign(t, { kind: 'peach' })); }
    for (const t of recs.ash) addCollider({ type: 'circle', x: t.x, z: t.z, r: 0.4 * t.s });
    for (const t of recs.bamboo) addCollider({ type: 'circle', x: t.x, z: t.z, r: 0.6 * t.s });
    for (const t of recs.bush) this.bushRecs.push(Object.assign(t, { kind: 'bush', berries: 3 }));
    for (const t of recs.rock.concat(recs.redrock)) { if (t.s > 0.9) addCollider({ type: 'circle', x: t.x, z: t.z, r: t.s * 0.85, top: t.y + t.s * (t.sy || 1) * 1.1 }); this.rockRecs.push(Object.assign(t, { kind: 'rock' })); }
    this.vegCounts = Object.fromEntries(Object.entries(recs).map(([k, v]) => [k, v.length]));
    this.vegRecs = recs;
    // canopy grid for the camera: it must never end up inside a tree
    this.canopy = new Map(); const ck = (x, z) => Math.floor(x / 12) * 1000 + Math.floor(z / 12);
    for (const [type, list] of [['broad', recs.broad], ['pine', recs.pine], ['peach', recs.peach]]) for (const t of list) { const k = ck(t.x, t.z); if (!this.canopy.has(k)) this.canopy.set(k, []); this.canopy.get(k).push({ type, x: t.x, y: t.y, z: t.z, s: t.s }); }
    this.canopyKey = ck;
  },
  /* grass patch that follows the player */
  buildGrass() {
    const b = new GeoBuilder();
    // a clump of 7 thin, slightly curved blades
    for (let i = 0; i < 7; i++) { const a = i * 2.39, r = 0.04 + (i % 3) * 0.05; const geo = new THREE.BufferGeometry(); const w = 0.035 + (i % 2) * 0.012, h = 0.32 + (i % 4) * 0.07; const lean = 0.08 + (i % 3) * 0.04;
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, w * 0.4, h * 0.6, lean * 0.5, w * 0.4, h * 0.6, lean * 0.5, -w * 0.4, h * 0.6, lean * 0.5, -w, 0, 0, -w * 0.4, h * 0.6, lean * 0.5, w * 0.4, h * 0.6, lean * 0.5, 0, h, lean], 3));
      b.add(geo, '#ffffff', Math.cos(a) * r, 0, Math.sin(a) * r, 0, a, 0, 1, 1, 1, { ao: 0.3 }); }
    const geo = b.build(); // normals point up for soft lighting
    const nor = geo.attributes.normal; for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
    const mat = windify(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.1, 0.45);
    this.grassN = IS_TOUCH ? 5000 : 9000; this.grass = new THREE.InstancedMesh(geo, mat, this.grassN); this.grass.frustumCulled = false; this.group.add(this.grass);
    const fb = new GeoBuilder(); fb.add(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 3), '#4f7f30', 0, 0.17, 0); fb.add(new THREE.IcosahedronGeometry(0.07, 0), '#ffffff', 0, 0.36, 0, 0, 0, 0, 1, 0.5, 1);
    this.flowersN = IS_TOUCH ? 400 : 800; this.flowers = new THREE.InstancedMesh(fb.build(), windify(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.06, 0.4), this.flowersN); this.flowers.frustumCulled = false; this.group.add(this.flowers);
    this.grassCenter = V3(1e9, 0, 1e9);
  },
  // per-cell grass data is deterministic, so cache it: moving only computes the newly exposed strip of cells
  grassCell(i, j, cell) {
    const key = i * 65536 + j; let d = this.gcache.get(key); if (d !== undefined) return d; d = null;
    const x = (i + U.hash2(j, i * 3)) * cell, z = (j + U.hash2(i * 7, j)) * cell; const h = terrainH(x, z);
    if (h >= 0.7) { const sl = slopeAt(x, z); const ri = regionInfo(x, z, h);
      if (sl <= 0.85 && ri.crag <= 0.5 && ri.snow <= 0.3 && h <= 45 && ri.rc >= 15) { let rd = 1e9; for (const r of ROADS) { rd = Math.min(rd, U.polyDist(x, z, r)); if (rd < 2) break; }
        if (rd >= 2) { const c = new THREE.Color(); terrainColor(x, z, h, sl, c); c.multiplyScalar(1.12 + U.hash2(i * 5, j * 9) * 0.3);
          d = { x, z, h, c, sc: 0.75 + U.hash2(j * 11, i) * 0.6, rot: U.hash2(i, j) * 6.28, flower: U.hash2(i * 13, j * 17) < 0.06 && ri.marsh < 0.5, fc: Math.floor(U.hash2(i, j * 5) * 5), marsh: ri.marsh > 0.5 }; } } }
    if (this.gcache.size > 90000) this.gcache.clear(); this.gcache.set(key, d); return d;
  },
  updateGrass(px, pz, force) {
    if (!force && Math.hypot(px - this.grassCenter.x, pz - this.grassCenter.z) < 8) return;
    this.grassCenter.set(px, 0, pz); this.gcache = this.gcache || new Map();
    const R = IS_TOUCH ? 40 : 52, cell = 1.25; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(), p = V3(), up = V3(0, 1, 0); let gi = 0, fi = 0;
    const fcols = this.fcols || (this.fcols = ['#fff6e0', '#ffd24a', '#ff8fb0', '#e8502a', '#b58fe0'].map(h => new THREE.Color(h)));
    const i0 = Math.floor((px - R) / cell), i1 = Math.floor((px + R) / cell), j0 = Math.floor((pz - R) / cell), j1 = Math.floor((pz + R) / cell);
    for (let i = i0; i <= i1 && gi < this.grassN; i++) for (let j = j0; j <= j1 && gi < this.grassN; j++) {
      const d = this.grassCell(i, j, cell); if (!d) continue; const dist = Math.hypot(d.x - px, d.z - pz); if (dist > R) continue;
      if (U.hash2(i, j) < 0.25 + 0.55 * (dist / R) ** 2) continue;
      q.setFromAxisAngle(up, d.rot); s.set(d.sc, d.sc * (d.marsh ? 1.6 : 1), d.sc); p.set(d.x, d.h - 0.05, d.z); m.compose(p, q, s);
      if (d.flower && fi < this.flowersN) { this.flowers.setMatrixAt(fi, m); this.flowers.setColorAt(fi, fcols[d.fc]); fi++; }
      else { this.grass.setMatrixAt(gi, m); this.grass.setColorAt(gi, d.c); gi++; }
    }
    this.grass.count = gi; this.flowers.count = fi;
    this.grass.instanceMatrix.needsUpdate = true; if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true; if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
  },

  /* ---------------- structures ---------------- */
  addMesh(builder, name) { const m = new THREE.Mesh(builder.build(), VCMAT()); m.name = name || 'struct'; this.group.add(m); return m; },
  glow(color, x, y, z, size, night = true) {
    const m = new THREE.SpriteMaterial({ map: this.glowTex || (this.glowTex = softTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)')), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.set(size, size, 1); this.group.add(s); if (night) this.lanterns.push(s); return s;
  },
  roofHip(b, cx, cy, cz, w, d, h, color, rot, trim = '#2a3a24') {
    // hip roof with flared, upturned eaves
    b.add(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), color, cx, cy + h / 2, cz, 0, rot + Math.PI / 4, 0, w * 1.0, h, d * 1.0, { ao: 0.25 });
    b.add(new THREE.BoxGeometry(1, 1, 1), trim, cx, cy + 0.05, cz, 0, rot, 0, w * 0.74, 0.18, d * 0.74);
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const [ux, uz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const lx = ux * w * 0.36, lz = uz * d * 0.36; const wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
      b.add(new THREE.ConeGeometry(0.16, 0.8, 4), trim, wx, cy + 0.25, wz, uz * 0.6 * c + 0, 0, -ux * 0.6, 1, 1, 1); }
    b.add(new THREE.BoxGeometry(1, 1, 1), trim, cx, cy + h * 0.95, cz, 0, rot, 0, 0.3, 0.3, 0.3);
  },
  house(b, x, z, rot, w, d, opts = {}) {
    const y = terrainH(x, z) - 0.2; const c = Math.cos(rot), s = Math.sin(rot); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const wallH = opts.tall ? 4.6 : 2.8; const wall = opts.wall || '#e6d6ad'; const pil = opts.pillar || '#6a2e1a';
    b.add(new THREE.BoxGeometry(w + 0.4, 0.7, d + 0.4), '#8f877a', x, y + 0.35, z, 0, rot, 0, 1, 1, 1, { ao: 0.3 });
    b.add(new THREE.BoxGeometry(w, wallH, d), wall, x, y + 0.7 + wallH / 2, z, 0, rot, 0, 1, 1, 1, { ao: 0.25 });
    // pillars and beams
    for (const [ux, uz] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]]) { const [px, pz] = L(ux * w / 2, uz * d / 2); b.add(new THREE.CylinderGeometry(0.16, 0.18, wallH + 0.2, 6), pil, px, y + 0.7 + wallH / 2, pz); }
    const [bx1, bz1] = L(0, d / 2 + 0.01); b.add(new THREE.BoxGeometry(w, 0.22, 0.1), pil, bx1, y + 0.7 + wallH - 0.1, bz1, 0, rot, 0);
    const [bx2, bz2] = L(0, -d / 2 - 0.01); b.add(new THREE.BoxGeometry(w, 0.22, 0.1), pil, bx2, y + 0.7 + wallH - 0.1, bz2, 0, rot, 0);
    // door and lattice windows (front = +z local)
    const [dx, dz] = L(0, d / 2 + 0.03); b.add(new THREE.BoxGeometry(1.2, 2.0, 0.08), '#4a2a1a', dx, y + 1.7, dz, 0, rot, 0);
    for (const ux of [-1, 1]) { const [wx, wz] = L(ux * w * 0.3, d / 2 + 0.03); b.add(new THREE.BoxGeometry(0.9, 0.8, 0.07), '#3a2414', wx, y + 2.0, wz, 0, rot, 0);
      b.add(new THREE.BoxGeometry(0.06, 0.8, 0.1), '#c9a46a', wx, y + 2.0, wz, 0, rot, 0); b.add(new THREE.BoxGeometry(0.9, 0.06, 0.1), '#c9a46a', wx, y + 2.0, wz, 0, rot, 0); }
    this.roofHip(b, x, y + 0.7 + wallH, z, w + 2.0, d + 2.0, opts.roofH || 2.3, opts.roof || '#3f6e3a', rot, opts.trim || '#2a3a24');
    if (opts.tall) { this.roofHip(b, x, y + 0.7 + wallH * 0.48, z, w + 2.6, d + 2.6, 0.9, opts.roof || '#3f6e3a', rot, opts.trim || '#2a3a24'); }
    addCollider({ type: 'box', x, z, hw: w / 2 + 0.25, hd: d / 2 + 0.25, rot, top: y + 0.7 + wallH + 2 });
  },
  buildStructures() {
    const r = U.rng(77);
    /* --- Tienhai Village --- */
    const vb = new GeoBuilder();
    const houses = [];
    const ring = [[23, 0.75], [27, 1.18], [24, 2.42], [28, 2.82], [23, 3.85], [27, 4.22], [24, 4.58], [29, 5.0], [25, 5.82], [27, 6.16]];
    const roadAngles = [0.29, 1.89, 1.97, 3.31, 5.35];
    ring.forEach(([rr, a], i) => { if (roadAngles.some(ra => Math.abs(U.angDiff(a, ra)) < 0.3)) return; // keep roads clear
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr; const rot = Math.atan2(-x, -z); const w = 6 + r() * 2.5, d = 5 + r() * 1.5;
      const roof = U.pick(r, ['#3f6e3a', '#3f6e3a', '#4a7a44', '#7a3a26']); houses.push({ x, z, rot, w, d });
      this.house(vb, x, z, rot, w, d, { roof, tall: i === 3, wall: U.pick(r, ['#e6d6ad', '#ead9b2', '#dccaa0']) }); });
    this.houses = houses;
    // the Inn of the Jade Lantern (bigger) and Elder Bao's house
    this.house(vb, -30, -18, Math.atan2(30, 18), 10, 7, { tall: true, roof: '#2f5e3a' }); this.inn = { x: -30, z: -18 };
    this.house(vb, 6, -34, Math.atan2(-6, 34), 8, 6, { roof: '#5a3a26', wall: '#efe0bb' }); this.elderHouse = { x: 6, z: -34 };
    // plaza: paving ring + statue of Avatar Guo-Lin
    const py = terrainH(0, 0);
    vb.add(new THREE.CylinderGeometry(13, 13.4, 0.3, 32), '#b8ab90', 0, py + 0.05, 0, 0, 0, 0, 1, 1, 1, { vary: 0.08 });
    vb.add(new THREE.CylinderGeometry(9, 9, 0.32, 32), '#a89a80', 0, py + 0.07, 0);
    vb.add(new THREE.CylinderGeometry(1.9, 2.3, 1.4, 8), '#8f877a', 0, py + 0.8, 0, 0, 0, 0, 1, 1, 1, { ao: 0.3 });
    vb.add(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 8), '#a39b8c', 0, py + 1.6, 0);
    addCollider({ type: 'circle', x: 0, z: 0, r: 2.3 });
    this.statueAt = V3(0, py + 1.75, 0);
    // well
    vb.add(new THREE.CylinderGeometry(1.1, 1.2, 1, 12, 1, true), '#8f877a', 12, terrainH(12, 9) + 0.5, 9); vb.add(new THREE.TorusGeometry(1.15, 0.15, 6, 16), '#a39b8c', 12, terrainH(12, 9) + 1.0, 9, Math.PI / 2);
    vb.add(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), '#6a2e1a', 11, terrainH(12, 9) + 1.6, 9); vb.add(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), '#6a2e1a', 13, terrainH(12, 9) + 1.6, 9);
    vb.add(new THREE.ConeGeometry(1.7, 0.9, 4), '#3f6e3a', 12, terrainH(12, 9) + 3.1, 9, 0, Math.PI / 4, 0); addCollider({ type: 'circle', x: 12, z: 9, r: 1.3 });
    this.well = { x: 12, z: 9 };
    // market stalls
    const stalls = [{ x: -11, z: 8, rot: 0.9, c: '#c0392b' }, { x: -12.5, z: -9, rot: 2.2, c: '#d9a441' }, { x: 13, z: -6, rot: -1.1, c: '#2f6e8a' }];
    for (const st of stalls) { const y = terrainH(st.x, st.z); const c = Math.cos(st.rot), s = Math.sin(st.rot);
      for (const [ux, uz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) vb.add(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5), '#5a3a22', st.x + (ux * 1.4 * c + uz * 0.9 * s), y + 1.2, st.z + (-ux * 1.4 * s + uz * 0.9 * c));
      vb.add(new THREE.BoxGeometry(3.2, 0.12, 2.2), st.c, st.x, y + 2.45, st.z, 0.12, st.rot, 0); vb.add(new THREE.BoxGeometry(2.8, 0.9, 1.0), '#7a5a3a', st.x, y + 0.45, st.z, 0, st.rot, 0, 1, 1, 1, { ao: 0.3 });
      for (let k = 0; k < 5; k++) vb.add(new THREE.SphereGeometry(0.2, 6, 5), U.pick(r, ['#e8502a', '#ffb02a', '#7aa04a', '#f2b8c8']), st.x + (k - 2) * 0.5 * c, y + 1.0, st.z - (k - 2) * 0.5 * s);
      addCollider({ type: 'box', x: st.x, z: st.z, hw: 1.5, hd: 0.6, rot: st.rot, top: y + 1.0 }); }
    this.stalls = stalls;
    // the cabbage cart
    const cc = { x: 17, z: 0.2, rot: -1.2 }; /* beside (not on) the east road */ const cy = terrainH(cc.x, cc.z); this.cabbageCart = cc;
    vb.add(new THREE.BoxGeometry(2.6, 0.5, 1.5), '#8a5a2a', cc.x, cy + 0.9, cc.z, 0, cc.rot, 0, 1, 1, 1, { ao: 0.3 });
    for (const sd of [-1, 1]) vb.add(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12), '#5a3a1a', cc.x + Math.sin(cc.rot) * sd * 0.85, cy + 0.55, cc.z + Math.cos(cc.rot) * sd * 0.85, Math.PI / 2, cc.rot + Math.PI / 2, 0);
    for (let k = 0; k < 9; k++) vb.add(new THREE.IcosahedronGeometry(0.3, 1), k % 2 ? '#8fc45a' : '#a8d470', cc.x + ((k % 3) - 1) * 0.6 * Math.cos(cc.rot) + ((Math.floor(k / 3)) - 1) * 0.4 * Math.sin(cc.rot), cy + 1.35 + (k % 2) * 0.12, cc.z - ((k % 3) - 1) * 0.6 * Math.sin(cc.rot) + ((Math.floor(k / 3)) - 1) * 0.4 * Math.cos(cc.rot), 0, 0, 0, 1, 0.85, 1, { topTint: hexc('#d8f0a0') });
    addCollider({ type: 'circle', x: cc.x, z: cc.z, r: 1.4 });
    // paifang gate on the south road
    const gdl = Math.hypot(-20, 50), gpx = 50 / gdl, gpz = 20 / gdl; const gx = -13.2, gz = 38, grot = -Math.atan2(gpz, gpx); const gy = terrainH(gx, gz); const gc = Math.cos(grot), gs = Math.sin(grot);
    for (const sd of [-1, 1]) { const px = gx + sd * 3.2 * gc, pz = gz - sd * 3.2 * gs; vb.add(new THREE.CylinderGeometry(0.3, 0.34, 6, 8), '#a8321f', px, gy + 3, pz); vb.add(new THREE.BoxGeometry(0.9, 0.6, 0.9), '#5a5248', px, gy + 0.3, pz); addCollider({ type: 'circle', x: px, z: pz, r: 0.5 }); }
    vb.add(new THREE.BoxGeometry(8.4, 0.5, 0.5), '#a8321f', gx, gy + 5.0, gz, 0, grot, 0); vb.add(new THREE.BoxGeometry(7.2, 0.3, 0.4), '#a8321f', gx, gy + 4.1, gz, 0, grot, 0);
    vb.add(new THREE.BoxGeometry(2.2, 0.9, 0.2), '#2a3a24', gx, gy + 4.55, gz, 0, grot, 0);
    this.roofHip(vb, gx, gy + 5.25, gz, 10, 1.8, 1.0, '#3f6e3a', grot);
    // lantern posts
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.13; const x = Math.cos(a) * 14.5, z = Math.sin(a) * 14.5; const y = terrainH(x, z);
      vb.add(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 5), '#3a2a1a', x, y + 1.3, z); vb.add(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 8), '#d8402a', x, y + 2.75, z); vb.add(new THREE.ConeGeometry(0.34, 0.25, 8), '#2a1a10', x, y + 3.1, z);
      this.glow(0xff8a3a, x, y + 2.75, z, 2.2); }
    // fences around fields + cabbage rows
    const cab = new GeoBuilder();
    for (const f of [{ x: 46, z: 30, w: 26, d: 16, rot: 0.15 }, { x: -48, z: -26, w: 22, d: 18, rot: -0.3 }]) {
      const c = Math.cos(f.rot), s = Math.sin(f.rot); const L = (u, v) => [f.x + u * c + v * s, f.z - u * s + v * c];
      for (let u = -f.w / 2; u <= f.w / 2; u += 2.6) for (const v of [-f.d / 2 - 0.6, f.d / 2 + 0.6]) { const [x, z] = L(u, v); vb.add(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 4), '#6a4a2a', x, terrainH(x, z) + 0.5, z); }
      for (const v of [-f.d / 2 - 0.6, f.d / 2 + 0.6]) { const [x, z] = L(0, v); vb.add(new THREE.BoxGeometry(f.w, 0.08, 0.06), '#7a5a3a', x, terrainH(x, z) + 0.8, z, 0, f.rot, 0); }
      for (let u = -f.w / 2 + 1; u < f.w / 2; u += 2.2) for (let v = -f.d / 2 + 1; v < f.d / 2; v += 1.4) { if (Math.floor((u + f.w / 2) / 2.2) % 2) continue; const [x, z] = L(u + 1.1, v);
        cab.add(new THREE.IcosahedronGeometry(0.32, 1), U.hash2(Math.round(u * 10), Math.round(v * 10)) > 0.5 ? '#8fc45a' : '#a8d470', x, terrainH(x, z) + 0.2, z, 0, 0, 0, 1, 0.8, 1, { topTint: hexc('#d8f0a0') }); }
    }
    this.addMesh(cab, 'cabbages');
    // signposts at junctions
    const sign = (x, z, labels) => { const y = terrainH(x, z); vb.add(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 5), '#5a3a22', x, y + 1.3, z);
      labels.forEach((ang, i) => vb.add(new THREE.BoxGeometry(1.4, 0.28, 0.06), '#b08a5a', x + Math.cos(ang) * 0.6, y + 2.2 - i * 0.36, z + Math.sin(ang) * 0.6, 0, -ang, 0)); addCollider({ type: 'circle', x, z, r: 0.2 }); };
    sign(-12.2, 46, [Math.atan2(-45, 16), Math.atan2(55, -25)]); sign(60, 21, [Math.atan2(11, 85), Math.atan2(-80, 60), Math.atan2(-21, -60)]); sign(-62, -6, [Math.atan2(-19, -125), Math.atan2(6, 62)]);
    this.addMesh(vb, 'village');

    /* --- Bridge over the river on the south road --- */
    // the deck runs along the road segment (-30,80)→(-20,150), centred where that road meets the river
    const bb = new GeoBuilder(); const ul = Math.hypot(10, 70), bc = 10 / ul, bs = 70 / ul; const brz = 148.3, brx = -30 + (brz - 80) / 70 * 10;
    const roadAng = -Math.atan2(-bs, bc); /* mesh/platform rotation is -roadAng, whose local +x axis is (bc, bs) */
    const bl = 24; const endA = [brx - bc * bl / 2, brz - bs * bl / 2], endB = [brx + bc * bl / 2, brz + bs * bl / 2];
    const deckY = Math.max(1.25, Math.min(terrainH(...endA), terrainH(...endB)) + 0.1); // level with the banks
    bb.add(new THREE.BoxGeometry(bl, 0.3, 3.4), '#7a5a36', brx, deckY - 0.15, brz, 0, -roadAng, 0, 1, 1, 1, { vary: 0.1 });
    for (let k = -bl / 2; k <= bl / 2; k += 2.2) { for (const sd of [-1, 1]) { const x = brx + k * bc - sd * 1.6 * bs, z = brz + k * bs + sd * 1.6 * bc;
      bb.add(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), '#5a3a22', x, deckY + 0.5, z); if (Math.abs(k) < bl / 2 - 3) { const bot = Math.min(-2.6, terrainH(x, z) - 0.5); bb.add(new THREE.CylinderGeometry(0.16, 0.18, deckY - bot, 6), '#4a2e1a', x, (deckY + bot) / 2, z); } } }
    for (const sd of [-1, 1]) bb.add(new THREE.BoxGeometry(bl, 0.1, 0.1), '#6a4a2a', brx - sd * 1.6 * bs, deckY + 1.0, brz + sd * 1.6 * bc, 0, -roadAng, 0);
    this.addMesh(bb, 'bridge'); addPlatform(brx, brz, bl / 2, 1.7, -roadAng, deckY);
    for (const sd of [-1, 1]) addCollider({ type: 'box', x: brx - sd * 1.75 * bs, z: brz + sd * 1.75 * bc, hw: bl / 2 - 1, hd: 0.1, rot: -roadAng, bottom: deckY - 0.5 });

    /* --- Lookout Pagoda on its hill, with a spiral stair --- */
    const pb = new GeoBuilder(); const px = 82, pz = -78; const ptop = terrainH(px, pz) - 0.1;
    pb.add(new THREE.CylinderGeometry(8, 8.5, 0.8, 8), '#8f877a', px, ptop + 0.2, pz, 0, Math.PI / 8, 0, 1, 1, 1, { ao: 0.3 });
    let y = ptop + 0.6; const tiers = 5;
    for (let t = 0; t < tiers; t++) { const w = 6.4 - t * 1.0, h = t === 0 ? 3.2 : 2.4;
      pb.add(new THREE.BoxGeometry(w, h, w), t % 2 ? '#c24a2a' : '#b5432a', px, y + h / 2, pz, 0, 0, 0, 1, 1, 1, { ao: 0.3 });
      for (const [ux, uz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pb.add(new THREE.CylinderGeometry(0.14, 0.14, h, 6), '#5a1e12', px + ux * w / 2, y + h / 2, pz + uz * w / 2);
      pb.add(new THREE.BoxGeometry(w * 0.4, h * 0.55, 0.1), '#2a120a', px, y + h * 0.4, pz + w / 2 + 0.02);
      this.roofHip(pb, px, y + h, pz, w + 2.6, w + 2.6, 1.3, '#3a4a3a', 0, '#22261e');
      y += h + 0.55; }
    pb.add(new THREE.CylinderGeometry(0.06, 0.12, 3.2, 6), '#d9a441', px, y + 1.2, pz); for (let k = 0; k < 4; k++) pb.add(new THREE.SphereGeometry(0.28 - k * 0.04, 8, 6), '#e8b84a', px, y + 0.2 + k * 0.6, pz);
    this.pagodaTop = V3(px, y, pz);
    addCollider({ type: 'box', x: px, z: pz, hw: 3.4, hd: 3.4, rot: 0, top: ptop + 20 });
    // spiral stair slabs
    const steps = 70; let prevA = 0;
    for (let i = 0; i < steps; i++) { const t = i / (steps - 1); const a = 2.53 - t * Math.PI * 2.1; const rr = 44 - t * 34; const x = px + Math.cos(a) * rr, z = pz + Math.sin(a) * rr; const h = terrainH(x, z);
      pb.add(new THREE.BoxGeometry(1.4, 0.35, 3.0), '#a39b8c', x, h + 0.05, z, 0, -a, 0, 1, 1, 1, { vary: 0.12 }); prevA = a; (this.stairPts = this.stairPts || []).push([x, z]);
      if (i % 9 === 4) { const lx = px + Math.cos(a) * (rr + 2.2), lz = pz + Math.sin(a) * (rr + 2.2), ly = terrainH(lx, lz); pb.add(new THREE.BoxGeometry(0.5, 1.1, 0.5), '#8f877a', lx, ly + 0.55, lz); pb.add(new THREE.BoxGeometry(0.7, 0.2, 0.7), '#6a645a', lx, ly + 1.2, lz); this.glow(0xffa04a, lx, ly + 0.9, lz, 1.4); } }
    void prevA;
    this.addMesh(pb, 'pagoda');

    /* --- Elder Banyan --- */
    const tb = new GeoBuilder(); const bx = LOC.banyan.x, bz = LOC.banyan.z, by = terrainH(bx, bz) - 0.3;
    tb.add(new THREE.CylinderGeometry(1.4, 2.8, 9, 10), '#5e4630', bx, by + 4.5, bz, 0, 0, 0, 1, 1, 1, { ao: 0.5, jitter: 0.12, seed: 2 });
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; tb.add(new THREE.CylinderGeometry(0.35, 0.6, 9, 6), '#5a422c', bx + Math.cos(a) * 4.5, by + 8.5, bz + Math.sin(a) * 4.5, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      const rx = bx + Math.cos(a + 0.3) * (6 + (i % 3)), rz = bz + Math.sin(a + 0.3) * (6 + (i % 3)); tb.add(new THREE.CylinderGeometry(0.1, 0.18, 10, 5), '#6a5038', rx, by + 5, rz); addCollider({ type: 'circle', x: rx, z: rz, r: 0.25 });
      for (let k = 0; k < 3; k++) { const ra = a + k * 0.7; const rr = 7 + k * 2.5; tb.add(new THREE.IcosahedronGeometry(4.2 - k * 0.6, 1), '#4f8a34', bx + Math.cos(ra) * rr, by + 12 + (k % 2) * 1.5, bz + Math.sin(ra) * rr, 0, ra, 0, 1, 0.55, 1, { ao: 0.5, topTint: hexc('#9fc458'), jitter: 0.2, seed: i * 3 + k }); } }
    tb.add(new THREE.IcosahedronGeometry(6, 1), '#4f8a34', bx, by + 15, bz, 0, 0, 0, 1.3, 0.55, 1.3, { ao: 0.4, topTint: hexc('#a8c95a'), jitter: 0.15, seed: 31 });
    // meditation stone and small shrine
    tb.add(new THREE.CylinderGeometry(1.2, 1.4, 0.4, 10), '#a39b8c', bx + 5, by + 0.5, bz + 6);
    for (const [ox, oz] of [[3, 9], [8, 4]]) { tb.add(new THREE.BoxGeometry(0.5, 1.1, 0.5), '#8f877a', bx + ox, by + 0.8, bz + oz); this.glow(0xffc070, bx + ox, by + 1.6, bz + oz, 1.6); tb.add(new THREE.ConeGeometry(0.5, 0.4, 4), '#6a645a', bx + ox, by + 1.6 + 0.3, bz + oz, 0, Math.PI / 4, 0); }
    this.addMesh(tb, 'banyan'); addCollider({ type: 'circle', x: bx, z: bz, r: 2.6 }); this.banyanSeat = V3(bx + 5, by + 0.7, bz + 6);
    // hanging lights in the banyan (spirit-like motes)
    for (let i = 0; i < 6; i++) { const a = i * 1.05; this.glow(0xbfffd8, bx + Math.cos(a) * 6, by + 7 + (i % 3), bz + Math.sin(a) * 6, 0.9); }

    /* --- Moon Pool Shrine --- */
    const mb = new GeoBuilder(); const mx = LOC.moonpool.x, mz = LOC.moonpool.z, my = terrainH(mx, mz) - 0.1;
    mb.add(new THREE.CylinderGeometry(7, 7.4, 0.6, 24), '#e8eef5', mx, my + 0.3, mz, 0, 0, 0, 1, 1, 1, { ao: 0.2 });
    mb.add(new THREE.TorusGeometry(3.4, 0.35, 8, 28), '#d0dce8', mx, my + 0.7, mz, Math.PI / 2);
    mb.add(new THREE.CylinderGeometry(3.3, 3.3, 0.3, 24), '#0e2a48', mx, my + 0.45, mz);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const x = mx + Math.cos(a) * 5.6, z = mz + Math.sin(a) * 5.6;
      mb.add(new THREE.BoxGeometry(0.6, 1.4, 0.6), '#dfe8f0', x, my + 1.3, z); mb.add(new THREE.ConeGeometry(0.6, 0.5, 4), '#a8bccc', x, my + 2.2, z, 0, Math.PI / 4, 0); this.glow(0x9fd8ff, x, my + 1.6, z, 1.5); }
    // moon arch
    mb.add(new THREE.CylinderGeometry(0.25, 0.3, 5, 8), '#dfe8f0', mx - 3, my + 2.8, mz - 6.4); mb.add(new THREE.CylinderGeometry(0.25, 0.3, 5, 8), '#dfe8f0', mx + 3, my + 2.8, mz - 6.4);
    mb.add(new THREE.TorusGeometry(3, 0.25, 6, 20, Math.PI), '#dfe8f0', mx, my + 5.2, mz - 6.4);
    mb.add(new THREE.TorusGeometry(0.9, 0.22, 6, 18, Math.PI * 1.3), '#bfe7ff', mx, my + 6.1, mz - 6.4, 0, 0, 0.9);
    this.addMesh(mb, 'moonpool'); addPlatform(mx, mz, 6.6, 6.6, 0, my + 0.6);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.55, fog: false })); pool.rotation.x = -Math.PI / 2; pool.position.set(mx, my + 0.62, mz); this.group.add(pool); this.moonPoolSurf = pool;
    this.moonPoolCenter = V3(mx, my + 0.6, mz);
    // the two koi: Tui (white) and La (black)
    this.koi = [];
    for (const col of [0xf5f5f0, 0x151515]) { const kb = new GeoBuilder(); kb.add(new THREE.SphereGeometry(0.22, 8, 6), col === 0x151515 ? '#1a1a1a' : '#f8f6ee', 0, 0, 0, 0, 0, 0, 1, 0.6, 2.2); kb.add(new THREE.ConeGeometry(0.2, 0.35, 5), col === 0x151515 ? '#2a2a2a' : '#ffffff', 0, 0, -0.55, -Math.PI / 2, 0, 0, 1, 0.4, 1);
      kb.add(new THREE.SphereGeometry(0.05, 5, 4), col === 0x151515 ? '#f8f6ee' : '#1a1a1a', 0, 0.06, 0.32);
      const k = new THREE.Mesh(kb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col === 0x151515 ? 0x0a1a2a : 0x6a7a8a })); k.position.copy(this.moonPoolCenter); this.group.add(k); this.koi.push(k); }

    /* --- Sun Warrior Ruins --- */
    const sb = new GeoBuilder(); const sx = LOC.sunruins.x, sz = LOC.sunruins.z, sy = terrainH(sx, sz) - 0.4;
    const stone = '#c9a46a', dark = '#9a7444';
    let ly = sy; const levels = [[22, 2.2], [17, 2.2], [12, 2.2], [7.5, 2.2]];
    levels.forEach(([w, h], i) => { sb.add(new THREE.BoxGeometry(w, h, w), i % 2 ? stone : '#bf9a60', sx, ly + h / 2, sz, 0, 0, 0, 1, 1, 1, { ao: 0.35, vary: 0.08 });
      sb.add(new THREE.BoxGeometry(w + 0.3, 0.3, w + 0.3), dark, sx, ly + h - 0.05, sz); addPlatform(sx, sz, w / 2, w / 2, 0, ly + h); ly += h; });
    // central stair on the east face (toward the valley)
    for (let k = 0; k < 20; k++) { const sx2 = sx + 13.5 - (k + 0.5) * 0.4875, sh = sy + 0.4 + (k + 1) / 20 * 8.4; sb.add(new THREE.BoxGeometry(0.5, 0.6, 4), k % 2 ? '#d8b47a' : '#cfa970', sx2, sh - 0.3, sz, 0, 0, 0, 1, 1, 1, { ao: 0.2 }); addPlatform(sx2, sz, 0.25, 2, 0, sh); }
    for (let k = 0; k < levels.length; k++) { const [w, h] = levels[k]; addCollider({ type: 'box', x: sx, z: sz, hw: w / 2, hd: w / 2, rot: 0, top: sy + h * (k + 1) }); }
    // sun disc on the face
    sb.add(new THREE.CylinderGeometry(2.0, 2.0, 0.3, 24), '#e0802a', sx + 8.6, sy + 5.6, sz - 5.5, 0, 0, Math.PI / 2);
    // eternal flame brazier at the top
    this.eternalFlame = V3(sx, ly + 1.2, sz);
    sb.add(new THREE.CylinderGeometry(1.2, 0.7, 1.0, 10), '#7a5a3a', sx, ly + 0.5, sz); addCollider({ type: 'circle', x: sx, z: sz, r: 1.25, top: ly + 1.0 }); sb.add(new THREE.TorusGeometry(1.2, 0.15, 6, 16), '#d9a441', sx, ly + 1.0, sz, Math.PI / 2);
    // ring of pillars, some broken
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; if (i === 0) continue; /* the eastern gap is the entrance from the road */ const rr = 19; const x = sx + Math.cos(a) * rr, z = sz + Math.sin(a) * rr; const h = (i % 4 === 1) ? 2 + r() * 2 : 6.5; const gy = terrainH(x, z) - 0.2;
      sb.add(new THREE.BoxGeometry(1.3, 0.6, 1.3), dark, x, gy + 0.3, z); sb.add(new THREE.CylinderGeometry(0.55, 0.6, h, 8), stone, x, gy + h / 2 + 0.6, z, 0, 0, 0, 1, 1, 1, { ao: 0.3, vary: 0.1 });
      if (h > 6) { sb.add(new THREE.BoxGeometry(1.5, 0.5, 1.5), dark, x, gy + h + 0.85, z); }
      else sb.add(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 8), stone, x + 1.5, gy + 0.55, z + 0.4, Math.PI / 2, a, 0);
      addCollider({ type: 'circle', x, z, r: 0.75 }); }
    // stylised dragon statues flanking the stair: serpentine bodies of stacked spheres
    for (const sd of [-1, 1]) { const bx0 = sx + 13.5, bz0 = sz + sd * 4; const gy = terrainH(bx0, bz0);
      sb.add(new THREE.BoxGeometry(2, 1.2, 2), dark, bx0, gy + 0.6, bz0);
      for (let k = 0; k < 9; k++) { const t = k / 8; sb.add(new THREE.SphereGeometry(0.55 - t * 0.2, 8, 6), sd > 0 ? '#3f7a8a' : '#a8402a', bx0 + Math.sin(t * 5) * 0.6, gy + 1.4 + t * 3.2, bz0 + Math.cos(t * 5) * 0.6 * sd); }
      sb.add(new THREE.ConeGeometry(0.45, 1.2, 6), sd > 0 ? '#3f7a8a' : '#a8402a', bx0 + 0.6, gy + 4.8, bz0, 0, 0, -Math.PI / 2); sb.add(new THREE.ConeGeometry(0.12, 0.7, 4), '#d9a441', bx0, gy + 5.4, bz0 + 0.3, 0.4, 0, 0); sb.add(new THREE.ConeGeometry(0.12, 0.7, 4), '#d9a441', bx0, gy + 5.4, bz0 - 0.3, -0.4, 0, 0);
      addCollider({ type: 'circle', x: bx0, z: bz0, r: 1.2 }); }
    this.addMesh(sb, 'sunruins');
    this.flames.push({ pos: this.eternalFlame.clone(), size: 2.3, light: true, eternal: true });
    this.glow(0xff8a2a, this.eternalFlame.x, this.eternalFlame.y + 0.8, this.eternalFlame.z, 9, false);

    /* --- Sky Bison Peak: Air Nomad shrine --- */
    const ab = new GeoBuilder(); const ax = LOC.bisonpeak.x, az = LOC.bisonpeak.z, ay = terrainH(ax, az) - 0.2;
    ab.add(new THREE.CylinderGeometry(9, 9.6, 0.8, 24), '#d8d0c0', ax, ay + 0.4, az, 0, 0, 0, 1, 1, 1, { ao: 0.2 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ab.add(new THREE.CylinderGeometry(0.22, 0.25, 4.6, 8), '#efe8da', ax + Math.cos(a) * 4.2, ay + 3.1, az + Math.sin(a) * 4.2); addCollider({ type: 'circle', x: ax + Math.cos(a) * 4.2, z: az + Math.sin(a) * 4.2, r: 0.3 }); }
    ab.add(new THREE.CylinderGeometry(5.2, 5.2, 0.5, 16), '#d9a441', ax, ay + 5.5, az);
    ab.add(new THREE.ConeGeometry(5.6, 6.5, 16), '#2f7f8f', ax, ay + 9.0, az, 0, 0, 0, 1, 1, 1, { ao: 0.3, topTint: hexc('#5aa8b8') });
    ab.add(new THREE.ConeGeometry(0.3, 2, 8), '#e8b84a', ax, ay + 13, az);
    // prayer-flag strings
    const flagCols = ['#3a7fd5', '#f2f2ea', '#c0392b', '#2f8a4a', '#f2c14e'];
    for (let s = 0; s < 4; s++) { const a = s * Math.PI / 2 + 0.4; for (let k = 1; k < 9; k++) { const t = k / 9; const x = ax + Math.cos(a) * (4.2 + t * 6), z = az + Math.sin(a) * (4.2 + t * 6), yy = ay + 5.2 - t * 3.5 - Math.sin(t * Math.PI) * 0.6;
      ab.add(new THREE.PlaneGeometry(0.5, 0.6), flagCols[k % 5], x, yy, z, 0, -a + Math.PI / 2, 0); } }
    this.addMesh(ab, 'airshrine'); addPlatform(ax, az, 9, 9, 0, ay + 0.8);
    // the air nomad symbol painted on the floor
    const sym = canvasTex(256, 256, (g) => { g.translate(128, 128); g.strokeStyle = '#2f7f8f'; g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * Math.PI * 2 / 3); g.beginPath(); g.arc(0, -70, 30, Math.PI * 0.5, Math.PI * 1.6); g.stroke(); g.beginPath(); g.moveTo(-10, -42); g.quadraticCurveTo(-40, -70, -12, -100); g.stroke(); g.restore(); } });
    const symM = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshLambertMaterial({ map: sym, transparent: true, depthWrite: false })); symM.rotation.x = -Math.PI / 2; symM.position.set(ax, ay + 0.82, az); this.group.add(symM);
    this.peakCenter = V3(ax, ay + 0.8, az);

    /* --- Badgermole Cave (grotto) --- */
    const cb = new GeoBuilder(); const kx = LOC.badgercave.x, kz = LOC.badgercave.z, ky = terrainH(kx, kz) - 0.3;
    for (let i = 0; i < 16; i++) { const a = Math.PI * 0.75 + i / 15 * Math.PI * 1.5; // open to the south-west (toward the road)
      const rr = 8.5 + (i % 3) * 0.6; const x = kx + Math.cos(a) * rr, z = kz + Math.sin(a) * rr - 2; const s = 2.6 + (i % 4) * 0.5;
      cb.add(new THREE.DodecahedronGeometry(s, 1), '#6e675c', x, ky + s * 0.8, z, i, i * 2, 0, 1, 1.6, 1, { jitter: 0.3, seed: i + 40, ao: 0.4, topTint: hexc('#8a8478') }); addCollider({ type: 'circle', x, z, r: s * 0.9 }); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9; cb.add(new THREE.DodecahedronGeometry(4.2, 1), '#5e574e', kx + Math.cos(a) * 4, ky + 8.5 + (i % 2), kz - 2 + Math.sin(a) * 4, i, i, 0, 1.4, 0.6, 1.4, { jitter: 0.25, seed: i + 70, topTint: hexc('#7f8a5a') }); }
    cb.add(new THREE.CylinderGeometry(8, 8, 0.2, 16), '#3a342c', kx, ky + 0.35, kz - 2);
    for (let i = 0; i < 12; i++) { const a = i * 0.53 + 0.3, rr = 5.5 + (i % 3) * 0.8; const x = kx + Math.cos(a) * rr, z = kz - 2 + Math.sin(a) * rr;
      if (Math.sin(a) > 0.6 && Math.cos(a) > -0.2) continue;
      cb.add(new THREE.OctahedronGeometry(0.5 + (i % 3) * 0.25, 0), '#7affb0', x, ky + 0.6 + (i % 2) * 0.8, z, i, i, 0.3, 0.6, 1.8, 0.6); this.glow(0x6affa0, x, ky + 1.0 + (i % 2) * 0.8, z, 1.8, false); }
    this.addMesh(cb, 'cave'); this.caveCenter = V3(kx, ky + 0.4, kz - 2);
    // crystal material glow tweak
    /* --- Daofei Camp --- */
    const db = new GeoBuilder(); const fx = LOC.daofei.x, fz = LOC.daofei.z, fy = terrainH(fx, fz) - 0.2;
    for (let i = 0; i < 34; i++) { const a = i / 34 * Math.PI * 2; if (Math.abs(U.angDiff(a, Math.PI + 0.15)) < 0.35 || Math.abs(U.angDiff(a, 0.34)) < 0.3) continue; /* gates where the road passes through */ const rr = 17; const x = fx + Math.cos(a) * rr, z = fz + Math.sin(a) * rr; const gy = terrainH(x, z);
      db.add(new THREE.CylinderGeometry(0.28, 0.32, 4, 6), '#6a4a2e', x, gy + 1.8, z, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1, 1, 1, 1, { ao: 0.3 }); db.add(new THREE.ConeGeometry(0.3, 0.8, 6), '#7a5a3a', x, gy + 4.2, z);
      addCollider({ type: 'circle', x, z, r: 0.6 }); }
    const tents = [[6, 6, '#7a3a2a'], [-6, 7, '#6a5a3a'], [7, -6, '#5a4a3a'], [-5, -7, '#7a3a2a']];
    for (const [ox, oz, c] of tents) { const x = fx + ox, z = fz + oz, gy = terrainH(x, z); db.add(new THREE.ConeGeometry(3, 3.4, 7), c, x, gy + 1.6, z, 0, r() * 3, 0, 1, 1, 1, { ao: 0.35 }); db.add(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), '#3a2a1a', x, gy + 2, z); addCollider({ type: 'circle', x, z, r: 2.6 }); }
    // banner
    db.add(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), '#3a2a1a', fx + 2, fy + 3.5, fz - 1); this.daofeiBanner = V3(fx + 2, fy + 5.8, fz - 1);
    for (let k = 0; k < 6; k++) { const x = fx + (r() - 0.5) * 18, z = fz + (r() - 0.5) * 18; if (Math.hypot(x - fx, z - fz) < 4 || U.polyDist(x, z, ROADS[1]) < 3) continue; db.add(new THREE.BoxGeometry(1, 0.9, 1), '#7a5a36', x, terrainH(x, z) + 0.45, z, 0, r() * 3, 0, 1, 1, 1, { ao: 0.3 }); addCollider({ type: 'circle', x, z, r: 0.7 }); }
    db.add(new THREE.TorusGeometry(1.0, 0.25, 6, 10), '#5a5248', fx, fy + 0.3, fz, Math.PI / 2);
    this.addMesh(db, 'daofeicamp');
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 8, 1), new THREE.MeshLambertMaterial({ map: canvasTex(128, 80, (g) => { g.fillStyle = '#8a1a12'; g.fillRect(0, 0, 128, 80); g.fillStyle = '#111'; g.font = 'bold 56px serif'; g.textAlign = 'center'; g.fillText('匪', 64, 62); }), side: THREE.DoubleSide }));
    flag.position.set(fx + 3.2, fy + 6.0, fz - 1); this.group.add(flag); this.flag = flag;
    this.daofeiFire = V3(fx, fy + 0.4, fz);

    /* --- Misty Pillars --- */
    const mp = new GeoBuilder(); const pr = U.rng(555);
    for (let i = 0; i < 26; i++) { const a = pr() * Math.PI * 2, rr = 10 + pr() * 58; const x = LOC.pillars.x + Math.cos(a) * rr, z = LOC.pillars.z + Math.sin(a) * rr; const gy = terrainH(x, z) - 1;
      if (Math.hypot(x, z) > 280) continue;
      const rad = 3 + pr() * 5, h = 26 + pr() * 46;
      mp.add(new THREE.CylinderGeometry(rad * 0.8, rad, h, 9, 5), '#8a8478', x, gy + h / 2, z, 0, pr() * 6, 0, 1, 1, 1, { jitter: 0.22, seed: i + 100, ao: 0.55, topTint: hexc('#a8a296') });
      mp.add(new THREE.IcosahedronGeometry(rad * 0.95, 1), '#4f8a34', x, gy + h + 0.3, z, 0, 0, 0, 1, 0.45, 1, { jitter: 0.2, seed: i, topTint: hexc('#8fc458') });
      for (let k = 0; k < 3; k++) { const va = pr() * 6.3; mp.add(new THREE.CylinderGeometry(0.15, 0.15, h * 0.4, 4), '#3f7a34', x + Math.cos(va) * rad * 0.82, gy + h - h * 0.2, z + Math.sin(va) * rad * 0.82); }
      addCollider({ type: 'circle', x, z, r: rad * 0.95 }); }
    this.addMesh(mp, 'pillars');
    // mist sprites
    this.mist = []; const mt = softTex('rgba(255,255,255,.55)', 'rgba(255,255,255,0)');
    for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, transparent: true, depthWrite: false, opacity: 0.45, color: 0xe8f4f0 })); const a = pr() * 6.3, rr = pr() * 60;
      s.position.set(LOC.pillars.x + Math.cos(a) * rr, 4 + pr() * 10, LOC.pillars.z + Math.sin(a) * rr); s.scale.set(40, 14, 1); this.group.add(s); this.mist.push(s); }
  },

  /* ---------------- minimap base image ---------------- */
  buildMinimap() {
    // bake from the terrain's own vertex colours (fast), then upscale smoothly
    const n = HF.n; const c0 = document.createElement('canvas'); c0.width = c0.height = n; const g0 = c0.getContext('2d'); const img = g0.createImageData(n, n);
    const cols = this.terrain.geometry.attributes.color; const col = new THREE.Color();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const vi = j * n + i; const h = HF.h[vi]; col.setRGB(cols.getX(vi), cols.getY(vi), cols.getZ(vi)).convertLinearToSRGB();
      let r = col.r, g = col.g, b = col.b; if (h < 0) { const d = U.clamp(-h / 8, 0, 1); r = U.lerp(0.36, 0.12, d); g = U.lerp(0.66, 0.3, d); b = U.lerp(0.8, 0.5, d); }
      const sh = U.clamp(1 + (HF.h[Math.max(0, j - 1) * n + Math.max(0, i - 1)] - h) * -0.05, 0.72, 1.22); const k = vi * 4; img.data[k] = U.clamp(r * sh, 0, 1) * 255; img.data[k + 1] = U.clamp(g * sh, 0, 1) * 255; img.data[k + 2] = U.clamp(b * sh, 0, 1) * 255; img.data[k + 3] = 255; }
    g0.putImageData(img, 0, 0);
    const S = 768; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(c0, 0, 0, S, S);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(240,220,170,0.35)'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(110,70,30,.6)'; g.lineWidth = 2.5; g.setLineDash([5, 4]);
    for (const rd of ROADS) { g.beginPath(); rd.forEach(([x, z], i) => { const px = (x + WORLD.half) / WORLD.size * S, pz = (z + WORLD.half) / WORLD.size * S; i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.stroke(); }
    g.setLineDash([]); this.minimapImg = c;
  },

  /* ---------------- per-frame environment ---------------- */
  tick(t, dt, camPos, env) {
    WIND.uniforms.uTime.value = t;
    this.sky.position.copy(camPos);
    for (const c of this.clouds) { const u = c.userData; u.a += u.sp * dt; c.position.set(camPos.x + Math.cos(u.a) * u.d, u.y, camPos.z + Math.sin(u.a) * u.d); c.material.color.copy(env.cloud); }
    if (this.waterNormal) { this.waterNormal.offset.x = t * 0.004; this.waterNormal.offset.y = t * 0.0025; }
    const night = env.night;
    for (const l of this.lanterns) { l.material.opacity = 0.25 + night * 0.85; }
    if (this.koi) this.koi.forEach((k, i) => { const a = t * 0.6 + i * Math.PI; k.position.set(this.moonPoolCenter.x + Math.cos(a) * 1.6, this.moonPoolCenter.y + 0.08, this.moonPoolCenter.z + Math.sin(a) * 1.6); k.rotation.y = -a; });
    if (this.moonPoolSurf) this.moonPoolSurf.material.opacity = 0.45 + night * 0.4 + Math.sin(t * 2) * 0.04;
    if (this.flag) { const p = this.flag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(t * 4 + x * 2.5) * 0.18 * (x + 1.2) / 2.4); } p.needsUpdate = true; }
    if (this.mist) this.mist.forEach((m, i) => { m.material.opacity = 0.3 + 0.2 * Math.sin(t * 0.2 + i) + env.morning * 0.3; });
  },
};
