import * as THREE from '../../vendor/three.module.min.js';
import { makeRng, makeNoise2D, clamp } from '../util.js';
import { mergeGeometries } from './materials.js';
import { patchFog, foliageUniforms } from './fog.js';

// Tall Pacific Northwest conifers (Douglas fir / hemlock silhouettes), sword ferns,
// mossy boulders, fallen logs and subalpine meadow grass. All instanced.

function colorize(geo, fn) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// One drooping, jagged whorl of branches (cheap far-LOD trees).
function whorl(radius, height, points, rng, droop) {
  const ring = points * 2;
  const pos = [];
  const idx = [];
  pos.push(0, height, 0); // apex
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2 + rng() * 0.2;
    const tip = k % 2 === 0;
    const r = tip ? radius * (0.85 + rng() * 0.3) : radius * (0.45 + rng() * 0.15);
    const y = tip ? -droop * (0.7 + rng() * 0.6) : droop * 0.15;
    pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  pos.push(0, -droop * 0.4, 0); // underside centre
  const under = ring + 1;
  for (let k = 0; k < ring; k++) {
    const a = 1 + k;
    const b = 1 + ((k + 1) % ring);
    idx.push(0, b, a);
    idx.push(under, a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

function makeConeConifer(seed, { height = 30, layers = 7 }) {
  const rng = makeRng(seed);
  const parts = [];
  const crownBase = height * (0.22 + rng() * 0.12);
  const crownH = height - crownBase;
  const maxR = height * (0.16 + rng() * 0.05);
  const n = layers;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const y = crownBase + f * crownH * 0.94;
    const r = maxR * Math.pow(1 - f, 0.85) * (0.75 + rng() * 0.35) + 0.25;
    const hgt = (crownH / n) * (2.3 + rng() * 0.6);
    const g = whorl(r, hgt, 5, rng, r * 0.42);
    const m = new THREE.Matrix4().makeRotationY(rng() * Math.PI * 2);
    m.setPosition((rng() - 0.5) * 0.3, y, (rng() - 0.5) * 0.3);
    parts.push({ geometry: g, matrix: m });
  }
  for (const p of parts) p.geometry.computeVertexNormals();
  const foliage = mergeGeometries(parts.map((p) => ({ geometry: p.geometry, matrix: p.matrix })));
  colorize(foliage, (x, y, z, c) => {
    const tipness = clamp(Math.hypot(x, z) / (maxR * 0.9), 0, 1);
    c.setRGB(0.05 + tipness * 0.05, 0.11 + tipness * 0.09 + (y / height) * 0.03, 0.08 + tipness * 0.03);
  });
  return { foliage, height, radius: maxR };
}

// Fir branch atlas: two hand-drawn-by-code sprays of needles on transparent canvas.
export function makeBranchTexture() {
  const W = 512;
  const Hh = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Hh;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, Hh);
  ctx.lineCap = 'round';
  for (let cell = 0; cell < 2; cell++) {
    const rng = makeRng(77 + cell * 13);
    const ox = cell * 256;
    const stem = (t) => [ox + 6 + t * 244, 128 + Math.sin(t * 2.2) * 6 * (cell ? -1 : 1)];
    // side twigs with needles
    for (let t = 0.02; t < 0.97; t += 0.035 + rng() * 0.02) {
      const [sx, sy] = stem(t);
      for (const side of [-1, 1]) {
        const ang = (0.55 + rng() * 0.45) * side;
        const len = (96 * Math.pow(1 - t, 0.6) + 14) * (0.7 + rng() * 0.4);
        const ex = sx + Math.cos(ang) * len * 0.9;
        const ey = sy + Math.sin(ang) * len;
        const steps = Math.floor(len / 2.4);
        for (let k = 0; k < steps; k++) {
          const f = k / steps;
          const px = sx + (ex - sx) * f;
          const py = sy + (ey - sy) * f + Math.sin(f * 3) * 3 * side;
          const nl = 7 + 5 * (1 - f) * (1 - t);
          const g = 70 + rng() * 50 + f * 40 + t * 30;
          ctx.strokeStyle = `rgba(${18 + f * 30 + rng() * 15},${g},${30 + f * 20},1)`;
          ctx.lineWidth = 1.7;
          for (const ns of [-1, 1]) {
            const na = ang + ns * (0.9 + rng() * 0.4);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = 'rgba(60,46,34,1)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(66,50,38,1)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.05) {
      const [x, y] = stem(t);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Douglas-fir style crown built from drooping branch cards.
function makeCardConifer(seed, { height = 30, levels = 17, perLevel = 7 }) {
  const rng = makeRng(seed);
  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const idx = [];
  const crownBase = height * (0.16 + rng() * 0.1);
  const crownH = height - crownBase;
  const maxR = height * (0.15 + rng() * 0.035);
  let v = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const pushV = (p, n, u, vv, shade) => {
    pos.push(p.x, p.y, p.z);
    nrm.push(n.x, n.y, n.z);
    uv.push(u, vv);
    col.push(shade * 0.92, shade, shade * 0.9);
  };
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const wv = new THREE.Vector3();
  const base = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const n0 = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < levels; i++) {
    const f = i / (levels - 1);
    const y = crownBase + Math.pow(f, 0.92) * crownH * 0.96;
    const r = (maxR * Math.pow(1 - f, 0.95) + 0.45) * (0.82 + rng() * 0.3);
    const count = Math.max(3, Math.round(perLevel * (0.55 + 0.45 * (1 - f))));
    const a0 = rng() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const a = a0 + (k / count) * Math.PI * 2 + (rng() - 0.5) * 0.6;
      const len = r * (0.85 + rng() * 0.3);
      const droop = len * (0.18 + rng() * 0.22) * (1.15 - f * 0.6);
      dir.set(Math.cos(a), 0, Math.sin(a));
      side.set(-Math.sin(a), 0, Math.cos(a));
      const roll = (rng() - 0.5) * 0.7;
      wv.copy(side).multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll));
      const w = len * (0.55 + rng() * 0.25) + 0.3;
      base.copy(dir).multiplyScalar(0.15).setY(y + droop * 0.15);
      tip.copy(dir).multiplyScalar(len).setY(y - droop);
      n0.copy(dir).multiplyScalar(0.55).addScaledVector(up, 0.75).normalize();
      const cell = rng() < 0.5 ? 0 : 0.5;
      const shadeB = 0.5 + f * 0.25;
      const shadeT = 0.95 + f * 0.15;
      pushV(tmp.copy(base).addScaledVector(wv, -w * 0.3), n0, cell, 0.2, shadeB);
      pushV(tmp.copy(base).addScaledVector(wv, w * 0.3), n0, cell, 0.8, shadeB);
      pushV(tmp.copy(tip).addScaledVector(wv, w * 0.5), n0, cell + 0.5, 1, shadeT);
      pushV(tmp.copy(tip).addScaledVector(wv, -w * 0.5), n0, cell + 0.5, 0, shadeT);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  // leader: two crossed vertical cards for the spire
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI * 0.5 + rng();
    side.set(Math.cos(a), 0, Math.sin(a));
    const y0 = height * 0.86;
    const y1 = height * 1.02;
    const w = 1.1;
    n0.set(0, 1, 0);
    pushV(tmp.set(0, y0, 0).addScaledVector(side, -w / 2), n0, 0.5, 0, 0.9);
    pushV(tmp.set(0, y0, 0).addScaledVector(side, w / 2), n0, 0.5, 1, 0.9);
    pushV(tmp.set(0, y1, 0).addScaledVector(side, w * 0.15), n0, 1.0, 0.6, 1.1);
    pushV(tmp.set(0, y1, 0).addScaledVector(side, -w * 0.15), n0, 1.0, 0.4, 1.1);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const trunk = new THREE.CylinderGeometry(0.12, height * 0.018 + 0.25, height, 7, 1, true);
  trunk.translate(0, height / 2, 0);
  return { foliage: g, trunk, height, radius: maxR };
}


function makeFoliageMaterial(tex, msaa) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.92, metalness: 0,
    color: new THREE.Color(0.62, 0.7, 0.58),
  });
  mat.alphaToCoverage = msaa > 0;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, foliageUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDirW;\nuniform vec3 uSunCol;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 Ls = normalize((viewMatrix * vec4(uSunDirW, 0.0)).xyz);
        vec3 Vd = normalize(vViewPosition);
        float back = pow(max(dot(-Vd, Ls), 0.0), 5.0);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uSunCol * back * 0.6;
      }`);
  };
  mat.customProgramCacheKey = () => 'foliage-cards';
  return patchFog(mat);
}

function makeFern(seed) {
  const rng = makeRng(seed);
  const pos = [];
  const fronds = 9 + Math.floor(rng() * 5);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rng() * 0.4;
    const len = 0.7 + rng() * 0.5;
    const lift = 0.5 + rng() * 0.35;
    const segs = 6;
    let px = 0;
    let py = 0.05;
    let pz = 0;
    const dirx = Math.cos(a);
    const dirz = Math.sin(a);
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const w0 = 0.09 * (1 - t0 * 0.85);
      const w1 = 0.09 * (1 - t1 * 0.85);
      const y0 = lift * Math.sin(t0 * Math.PI * 0.75) * len;
      const y1 = lift * Math.sin(t1 * Math.PI * 0.75) * len;
      const x0 = dirx * t0 * len;
      const z0 = dirz * t0 * len;
      const x1 = dirx * t1 * len;
      const z1 = dirz * t1 * len;
      const sx = -dirz;
      const sz = dirx;
      pos.push(
        x0 + sx * w0, y0, z0 + sz * w0, x0 - sx * w0, y0, z0 - sz * w0, x1 + sx * w1, y1, z1 + sz * w1,
        x1 + sx * w1, y1, z1 + sz * w1, x0 - sx * w0, y0, z0 - sz * w0, x1 - sx * w1, y1, z1 - sz * w1,
      );
      px = x1;
      py = y1;
      pz = z1;
    }
    void px;
    void py;
    void pz;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  colorize(g, (x, y, z, c) => {
    const t = clamp(Math.hypot(x, z) / 1.1, 0, 1);
    c.setRGB(0.07 + t * 0.06, 0.16 + t * 0.12, 0.05 + t * 0.03);
  });
  return g;
}

function makeGrassTuft(seed, palette) {
  const rng = makeRng(seed);
  const pos = [];
  const blades = 12;
  for (let b = 0; b < blades; b++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 0.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.22 + rng() * 0.4;
    const w = 0.012 + rng() * 0.01;
    // bent two-segment blade leaning outward
    const lean = 0.05 + rng() * 0.16;
    const ox = Math.cos(a) * lean;
    const oz = Math.sin(a) * lean;
    const sx = Math.cos(a + 1.57) * w;
    const sz = Math.sin(a + 1.57) * w;
    const mx = x + ox * 0.35;
    const mz = z + oz * 0.35;
    const my = h * 0.55;
    pos.push(x - sx, 0, z - sz, x + sx, 0, z + sz, mx + sx * 0.7, my, mz + sz * 0.7);
    pos.push(x - sx, 0, z - sz, mx + sx * 0.7, my, mz + sz * 0.7, mx - sx * 0.7, my, mz - sz * 0.7);
    pos.push(mx - sx * 0.7, my, mz - sz * 0.7, mx + sx * 0.7, my, mz + sz * 0.7, x + ox, h, z + oz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // up-facing normals: blades light like the meadow floor instead of flashing black edge-on
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  colorize(g, (x, y, z, c) => {
    const t = clamp(y / 0.55, 0, 1);
    c.copy(palette[0]).lerp(palette[1], t * t * (3 - 2 * t));
  });
  return g;
}

function makeRock(seed) {
  const noise = makeNoise2D(seed);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // displacement depends on position only, so the duplicated corner vertices of
    // neighbouring faces move together (random jitter here tore visible cracks in the rock)
    const d = 1 + noise.fbm(x * 1.7 + 3, z * 1.7 + y, 3) * 0.45 + noise.fbm(x * 5 + y * 3, z * 5 - y * 2, 2) * 0.04;
    p.setXYZ(i, x * d * 1.25, y * d * 0.75, z * d);
  }
  g.computeVertexNormals();
  colorize(g, (x, y, z, c) => {
    // moss on the upward faces
    const moss = clamp((y / 0.75) * 1.4 - 0.1, 0, 1);
    c.setRGB(0.55 - moss * 0.35, 0.56 - moss * 0.18, 0.52 - moss * 0.36);
  });
  return g;
}

function makeLog(seed) {
  const rng = makeRng(seed);
  const len = 7 + rng() * 6;
  const r = 0.35 + rng() * 0.25;
  const g = new THREE.CylinderGeometry(r * 0.85, r, len, 9, 4);
  g.rotateZ(Math.PI / 2);
  return { geometry: g, len, r };
}

// Instanced set that is chunked spatially so frustum culling actually helps.
class ChunkedInstances {
  constructor(geometry, material, chunk = 40, { castShadow = true, receiveShadow = true } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.chunk = chunk;
    this.buckets = new Map();
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
  }
  add(matrix, color = null) {
    const e = matrix.elements;
    const k = Math.floor(e[12] / this.chunk) + ':' + Math.floor(e[14] / this.chunk);
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = []));
    b.push({ m: matrix.clone(), c: color });
  }
  build(parent) {
    const meshes = [];
    for (const list of this.buckets.values()) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (it.c) mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

// Where each layer is scattered. The defaults are Rainshadow's; other maps pass their own.
const VEG_DEFAULTS = {
  near: { x0: -150, x1: 110, z0: -150, z1: 120, count: 1700 },
  far: { cx: -20, cz: -10, r0: 140, r1: 300, count: 2200, minY: -40 },
  valley: { x0: -260, x1: -100, z0: -220, z1: 200, maxY: -60, count: 700 },
  ferns: { x0: -110, x1: 80, z0: -110, z1: 90, count: 5200 },
  grass: { x0: -95, x1: -20, z0: -70, z1: 20, count: 7000 },
  rocks: { x0: -150, x1: 110, z0: -150, z1: 120, count: 900 },
};

export function buildVegetation({ scene, terrain, physics, materials, map, density }) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  scene.add(group);
  const rng = makeRng(424242);
  const noise = makeNoise2D(99);
  const cfg = { ...VEG_DEFAULTS, ...(map.config || {}) };
  // trees stand on the outside surface (over a cave that is the mountain, not the cave floor)
  const groundAt = map.surfaceHeight || ((x, z) => terrain.heightAt(x, z));

  // tree prototypes: 4 near variants, 2 far variants
  const protos = [];
  const branchTex = makeBranchTexture();
  const cardMat = makeFoliageMaterial(branchTex, density.msaa || 0);
  for (let i = 0; i < 4; i++) protos.push(makeCardConifer(1000 + i * 17, { height: 30, levels: 15 + i, perLevel: 7 }));
  const farProtos = [makeConeConifer(2001, { height: 30 }), makeConeConifer(2002, { height: 30 })];
  const treeSets = protos.map((p) => ({
    foliage: new ChunkedInstances(p.foliage, cardMat),
    trunk: new ChunkedInstances(p.trunk, materials.trunk),
    proto: p,
  }));
  const farSets = farProtos.map((p) => ({
    foliage: new ChunkedInstances(p.foliage, materials.foliage, 80, { castShadow: false, receiveShadow: false }),
    proto: p,
  }));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const tint = new THREE.Color();
  const trees = [];
  const minGap = 4.2;
  const grid = new Map();
  const cellKey = (x, z) => Math.floor(x / 6) + ',' + Math.floor(z / 6);
  const tooClose = (x, z, gap) => {
    const cx = Math.floor(x / 6);
    const cz = Math.floor(z / 6);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = grid.get(cx + dx + ',' + (cz + dz));
        if (!arr) continue;
        for (const o of arr) if ((o.x - x) ** 2 + (o.z - z) ** 2 < gap * gap) return true;
      }
    }
    return false;
  };
  const placeTree = (x, z, far) => {
    const y = groundAt(x, z);
    const h = 18 + rng() * 26 + noise.fbm(x / 40, z / 40, 2) * 8;
    const sc = h / 30;
    const lean = (rng() - 0.5) * 0.04;
    q.setFromEuler(new THREE.Euler(lean, rng() * Math.PI * 2, lean));
    s.set(sc * (0.85 + rng() * 0.3), sc, sc * (0.85 + rng() * 0.3));
    t.set(x, y - 0.3, z);
    m.compose(t, q, s);
    const shade = 0.75 + rng() * 0.45;
    tint.setRGB(shade * (0.9 + rng() * 0.15), shade, shade * (0.9 + rng() * 0.2));
    if (far) {
      rng.pick(farSets).foliage.add(m, tint);
    } else {
      const set = rng.pick(treeSets);
      set.foliage.add(m, tint);
      set.trunk.add(m, null);
      const trunkR = (30 * 0.018 + 0.25) * sc;
      if (map.inPlayable(x, z, 6)) {
        physics.addCylinder({ x, z, r: trunkR + 0.05, y0: y - 1, y1: y + 6, material: 'wood', nav: true });
      }
    }
    const k = cellKey(x, z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ x, z });
    trees.push({ x, z, h });
  };

  // hand-placed trees inside the playable space (cover + silhouettes against the sky)
  for (const [x, z] of map.extraTrees || []) placeTree(x, z, false);

  // near forest: rejection sampled inside the world box but outside clearings
  const nearCount = Math.floor(cfg.near.count * density.trees);
  let tries = 0;
  let placed = 0;
  while (placed < nearCount && tries < nearCount * 12) {
    tries++;
    const x = rng.range(cfg.near.x0, cfg.near.x1);
    const z = rng.range(cfg.near.z0, cfg.near.z1);
    const clear = map.treeClearance(x, z);
    if (clear <= 0) continue;
    // clumpier density using noise
    if (noise.fbm(x / 35, z / 35, 3) < -0.25 && rng() < 0.6) continue;
    if (tooClose(x, z, minGap * (map.inPlayable(x, z, 0) ? 1.4 : 1))) continue;
    placeTree(x, z, false);
    placed++;
  }
  // far ring: cheap trees filling the hills out to the fog
  const farCount = Math.floor(cfg.far.count * density.trees);
  for (let i = 0; i < farCount; i++) {
    const a = rng() * Math.PI * 2;
    const r = cfg.far.r0 + Math.pow(rng(), 0.7) * (cfg.far.r1 - cfg.far.r0);
    const x = cfg.far.cx + Math.cos(a) * r;
    const z = cfg.far.cz + Math.sin(a) * r;
    if (map.treeClearance(x, z) <= 0) continue;
    if (groundAt(x, z) < cfg.far.minY) continue;
    placeTree(x, z, true);
  }
  // valley below the cliff: a sea of treetops poking out of the fog
  const valleyCount = cfg.valley ? Math.floor(cfg.valley.count * density.trees) : 0;
  for (let i = 0; i < valleyCount; i++) {
    const x = rng.range(cfg.valley.x0, cfg.valley.x1);
    const z = rng.range(cfg.valley.z0, cfg.valley.z1);
    if (groundAt(x, z) > cfg.valley.maxY) continue;
    placeTree(x, z, true);
  }

  for (const set of treeSets) {
    set.foliage.build(group);
    set.trunk.build(group);
  }
  for (const set of farSets) set.foliage.build(group);

  // ---- ferns ------------------------------------------------------------------------
  const fernGeo = [makeFern(5), makeFern(6), makeFern(7)];
  const fernSets = fernGeo.map((g) => new ChunkedInstances(g, materials.fern, 30, { castShadow: false, receiveShadow: true }));
  const fernCount = Math.floor(cfg.ferns.count * density.ferns);
  for (let i = 0; i < fernCount; i++) {
    const x = rng.range(cfg.ferns.x0, cfg.ferns.x1);
    const z = rng.range(cfg.ferns.z0, cfg.ferns.z1);
    if (map.fernAllowed && !map.fernAllowed(x, z)) continue;
    if (noise.fbm(x / 18 + 50, z / 18, 3) < -0.1) continue;
    const y = groundAt(x, z);
    const sc = 0.7 + rng() * 0.9;
    q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
    m.compose(t.set(x, y - 0.05, z), q, s.set(sc, sc * (0.8 + rng() * 0.4), sc));
    const shade = 0.7 + rng() * 0.5;
    rng.pick(fernSets).add(m, tint.setRGB(shade, shade, shade * 0.9));
  }
  for (const fs of fernSets) fs.build(group);

  // ---- meadow grass (ridge) ------------------------------------------------------------
  const meadowPal = [
    [new THREE.Color(0.2, 0.16, 0.06), new THREE.Color(0.56, 0.38, 0.14)],
    [new THREE.Color(0.19, 0.12, 0.05), new THREE.Color(0.5, 0.28, 0.11)],
    [new THREE.Color(0.13, 0.16, 0.06), new THREE.Color(0.4, 0.4, 0.16)],
  ];
  const grassSets = meadowPal.map((p, i) => new ChunkedInstances(makeGrassTuft(300 + i, p), materials.grass, 25, { castShadow: false }));
  const grassCount = Math.floor(cfg.grass.count * density.ferns);
  for (let i = 0; i < grassCount; i++) {
    const x = rng.range(cfg.grass.x0, cfg.grass.x1);
    const z = rng.range(cfg.grass.z0, cfg.grass.z1);
    const mm = map.meadowMask(x, z);
    if (mm <= 0 || rng() > mm) continue;
    const y = groundAt(x, z);
    const sc = 0.8 + rng() * 0.8;
    q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
    m.compose(t.set(x, y - 0.02, z), q, s.set(sc, sc, sc));
    rng.pick(grassSets).add(m, null);
  }
  for (const gs of grassSets) gs.build(group);

  // ---- boulders + logs -----------------------------------------------------------------
  const rockGeo = [makeRock(11), makeRock(12), makeRock(13)];
  const rockSets = rockGeo.map((g) => new ChunkedInstances(g, materials.rock, 40));
  for (const r of map.rocks) {
    const y = groundAt(r.x, r.z);
    const sc = r.s;
    q.setFromEuler(new THREE.Euler(0, r.rot ?? rng() * 6.28, 0));
    m.compose(t.set(r.x, y + sc * 0.15, r.z), q, s.set(sc, sc, sc));
    rockSets[r.v ?? i3(rng)].add(m, null);
    physics.addCylinder({ x: r.x, z: r.z, r: sc * 1.05, y0: y - 1, y1: y + sc * 0.75, walkable: true, material: 'rock' });
  }
  for (let i = 0; i < cfg.rocks.count; i++) {
    const x = rng.range(cfg.rocks.x0, cfg.rocks.x1);
    const z = rng.range(cfg.rocks.z0, cfg.rocks.z1);
    if (map.inPlayable(x, z, 8) || map.treeClearance(x, z) <= 0) continue;
    const y = groundAt(x, z);
    const sc = 0.6 + rng() * 2.2;
    q.setFromEuler(new THREE.Euler(0, rng() * 6.28, 0));
    m.compose(t.set(x, y, z), q, s.set(sc, sc, sc));
    rng.pick(rockSets).add(m, null);
  }
  for (const rs of rockSets) rs.build(group);

  const logGroup = [];
  for (const L of map.logs) {
    const { geometry, len, r } = makeLog(L.seed || 1);
    const y = groundAt(L.x, L.z) + r * 0.8;
    const mesh = new THREE.Mesh(geometry, materials.log);
    mesh.position.set(L.x, y, L.z);
    mesh.rotation.y = L.rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    logGroup.push(mesh);
    physics.addBox({ x: L.x, y: y - r, z: L.z, w: len, h: r * 2, d: r * 1.6, rot: L.rot, walkable: true, material: 'wood' });
  }

  return { group, trees };
}

function i3(rng) {
  return Math.floor(rng() * 3);
}
