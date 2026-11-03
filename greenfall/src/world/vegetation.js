// Trees (instanced per cell, two LODs), crop rows and the grass carpet around the camera.
import * as THREE from 'three';
import { GeoBuilder } from './geo.js';
import { TEX, canvasTexture } from './textures.js';
import { TREE, SURF } from './worldgen.js';
import { U } from './materials.js';
import { GW, WORLD } from './layout.js';
import { RNG } from '../core/rng.js';

// ---------- tree geometry ----------
function treeGeo(type, lod, variant = 0) {
  const gb = new GeoBuilder();
  gb.wind = [];
  const r = new RNG(type * 100 + variant * 7 + 3);
  const low = lod > 0;
  const det = low ? 0 : 1;
  const trunk = (h, r0, r1, c = 0x5a4334) => { gb.setSway(0).setColor(c).setLayer(TEX.BARK); gb.cylinder(0, -0.3, 0, r1, r0, h + 0.3, low ? 4 : 7, 0.8); };
  const leaf = (x, y, z, rx, ry, rz, c) => { gb.setSway(0.35).setColor(c).setLayer(TEX.LEAVES); gb.blob(x, y, z, rx, ry, rz, det, low ? 0.05 : 0.2, r.int(1, 999)); };
  switch (type) {
    case TREE.OAK: {
      trunk(4.2, 0.42, 0.28);
      if (!low) {
        gb.setSway(0).setColor(0x5a4334).setLayer(TEX.BARK);
        for (let k = 0; k < 3; k++) { const a = k * 2.1 + r.next(); gb.beam(0, 3.2, 0, Math.cos(a) * 2.6, 5.4, Math.sin(a) * 2.6, 0.22); }
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r.next() * 0.5; const d = r.range(1.8, 3.2); leaf(Math.cos(a) * d, r.range(5.2, 6.6), Math.sin(a) * d, r.range(2.2, 2.9), r.range(1.7, 2.3), r.range(2.2, 2.9), 0xffffff); }
        leaf(0, 7.3, 0, 3.0, 2.2, 3.0, 0xffffff);
      } else { leaf(0, 6.2, 0, 5.0, 3.2, 5.0, 0xffffff); }
      break;
    }
    case TREE.ROUND: {
      trunk(3.0, 0.3, 0.2);
      if (!low) { leaf(0, 4.6, 0, 2.6, 2.6, 2.6, 0xffffff); leaf(1.2, 5.6, 0.4, 1.9, 1.9, 1.9, 0xffffff); leaf(-1.0, 5.3, -0.8, 1.9, 2.0, 1.9, 0xffffff); leaf(0.2, 6.6, -0.2, 1.6, 1.5, 1.6, 0xffffff); }
      else leaf(0, 5.2, 0, 3.0, 3.0, 3.0, 0xffffff);
      break;
    }
    case TREE.PINE: {
      trunk(2.5, 0.28, 0.18, 0x4a3628);
      gb.setSway(0.25).setColor(0xffffff).setLayer(TEX.LEAVES);
      const tiers = low ? 2 : 4;
      for (let k = 0; k < tiers; k++) {
        const y = 2 + k * (low ? 3.4 : 2.0);
        const rr = (low ? 3.0 : 3.2) - k * (low ? 1.1 : 0.62);
        gb.cylinder(0, y, 0, 0.05, rr, low ? 4.2 : 2.9, low ? 6 : 9, 0.6);
      }
      break;
    }
    case TREE.LIVEOAK: {
      trunk(2.6, 0.62, 0.45, 0x4a3a30);
      if (!low) {
        gb.setSway(0).setColor(0x4a3a30).setLayer(TEX.BARK);
        for (let k = 0; k < 4; k++) { const a = k * 1.6 + r.next() * 0.6; gb.beam(0, 2.3, 0, Math.cos(a) * 4.8, 3.9 + r.next(), Math.sin(a) * 4.8, 0.32); }
        for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + r.next(); const d = r.range(2.5, 5.0); leaf(Math.cos(a) * d, r.range(4.6, 5.6), Math.sin(a) * d, r.range(2.6, 3.4), r.range(1.2, 1.7), r.range(2.6, 3.4), 0xffffff); }
        // spanish moss strands
        gb.setSway(0.6).setColor(0x9aa88a).setLayer(TEX.MOSS);
        for (let k = 0; k < 18; k++) { const a = r.next() * Math.PI * 2, d = r.range(2, 6); const x = Math.cos(a) * d, z = Math.sin(a) * d; const len = r.range(1.2, 2.6); gb.box(x, 4.3 - len / 2, z, 0.12, len, 0.12, 1); }
      } else leaf(0, 5.0, 0, 6.5, 2.4, 6.5, 0xffffff);
      break;
    }
    case TREE.BUSH: {
      leaf(0, 0.6, 0, 1.2, 0.9, 1.2, 0xffffff);
      if (!low) { leaf(0.7, 0.5, 0.3, 0.8, 0.7, 0.8, 0xffffff); leaf(-0.6, 0.45, -0.4, 0.8, 0.6, 0.8, 0xffffff); }
      break;
    }
    case TREE.DEAD: {
      trunk(5.0, 0.32, 0.16, 0x6a5a4c);
      gb.setSway(0.02).setColor(0x6a5a4c).setLayer(TEX.BARK);
      if (!low) for (let k = 0; k < 6; k++) { const a = k * 1.1, y = 2.5 + k * 0.45; gb.beam(0, y, 0, Math.cos(a) * 2.2, y + 1.6, Math.sin(a) * 2.2, 0.1); }
      break;
    }
    case TREE.APPLE: {
      trunk(1.6, 0.18, 0.12);
      leaf(0, 2.6, 0, 1.9, 1.5, 1.9, 0xffffff);
      if (!low) {
        gb.setSway(0.3).setColor(0xd02a1f).setLayer(TEX.WHITE);
        for (let k = 0; k < 10; k++) { const a = r.next() * 6.28, d = r.range(1.2, 1.8); gb.blob(Math.cos(a) * d, r.range(2.0, 3.2), Math.sin(a) * d, 0.12, 0.12, 0.12, 0, 0, k); }
      }
      break;
    }
  }
  return gb.build();
}

const CANOPY_PALETTES = {
  [TREE.OAK]: [0x5e9a36, 0x6aa63c, 0x4f8a30, 0x8aa83a, 0xa8a83a],
  [TREE.ROUND]: [0xe0892a, 0xe3b23c, 0xc4532c, 0x6aa63c, 0xd9a02a, 0x8db83e, 0xb8432c],
  [TREE.PINE]: [0x2f6a3a, 0x2a5e34, 0x3a7440],
  [TREE.LIVEOAK]: [0x4f7a34, 0x5a8a3a, 0x46703a],
  [TREE.BUSH]: [0x4f8a30, 0x6aa63c, 0x7a9a32, 0xa88a32],
  [TREE.DEAD]: [0x7a6a58],
  [TREE.APPLE]: [0x4f9a34, 0x5aa63a],
};
export const TREE_INFO = {
  [TREE.OAK]: { trunkR: 0.45, height: 9, wood: 1 },
  [TREE.ROUND]: { trunkR: 0.32, height: 8, wood: 0.8 },
  [TREE.PINE]: { trunkR: 0.3, height: 10, wood: 0.9 },
  [TREE.LIVEOAK]: { trunkR: 0.65, height: 7, wood: 1.2 },
  [TREE.BUSH]: { trunkR: 0, height: 1.6, wood: 0.2 },
  [TREE.DEAD]: { trunkR: 0.3, height: 8, wood: 0.6 },
  [TREE.APPLE]: { trunkR: 0.18, height: 4, wood: 0.4 },
};

export class Vegetation {
  constructor(world, materials) {
    this.world = world;
    this.mat = materials.veg;
    this.geos = {};
    for (const t of Object.values(TREE)) this.geos[t] = [treeGeo(t, 0), treeGeo(t, 1)];
    this.tmpM = new THREE.Matrix4();
    this.tmpC = new THREE.Color();
  }
  // Build instanced meshes for the trees inside [x0,x1)x[z0,z1). Returns {group, index}
  buildCell(x0, z0, x1, z1, lod) {
    const tr = this.world.trees;
    const byType = {};
    const farKey = (t) => (t === TREE.PINE ? TREE.PINE : t === TREE.BUSH ? TREE.BUSH : TREE.ROUND);
    for (let i = 0; i < tr.n; i++) {
      const x = tr.x[i], z = tr.z[i];
      if (x < x0 || x >= x1 || z < z0 || z >= z1 || !tr.alive[i]) continue;
      const key = lod > 0 ? farKey(tr.t[i]) : tr.t[i];
      if (lod > 0 && key === TREE.BUSH) continue;
      (byType[key] ||= []).push(i);
    }
    const group = new THREE.Group();
    const lookup = new Map(); // tree index → [mesh, instance]
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const k in byType) {
      const t = +k;
      const ids = byType[k];
      const mesh = new THREE.InstancedMesh(this.geos[t][lod], this.mat, ids.length);
      ids.forEach((id, n) => {
        const pal = CANOPY_PALETTES[tr.t[id]];
        q.setFromAxisAngle(up, tr.r[id]);
        let sc = tr.s[id];
        if (lod > 0 && tr.t[id] === TREE.OAK) sc *= 1.25;
        if (lod > 0 && tr.t[id] === TREE.LIVEOAK) sc *= 1.3;
        if (lod > 0 && tr.t[id] === TREE.APPLE) sc *= 0.55;
        s.set(sc, sc * (0.9 + (tr.c[id] * 0.25)), sc);
        p.set(tr.x[id], tr.y[id] - 0.05, tr.z[id]);
        this.tmpM.compose(p, q, s);
        mesh.setMatrixAt(n, this.tmpM);
        this.tmpC.setHex(pal[Math.floor(tr.c[id] * pal.length) % pal.length]);
        mesh.setColorAt(n, this.tmpC);
        lookup.set(id, [mesh, n]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = lod === 0;
      mesh.receiveShadow = lod === 0;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return { group, lookup };
  }
}

// ---------- crops ----------
let _cornTex = null, _wheatTex = null, _soyTex = null;
function cropTextures() {
  if (_cornTex) return;
  _cornTex = canvasTexture(256, 512, (c) => {
    c.clearRect(0, 0, 256, 512);
    for (let k = 0; k < 6; k++) {
      const x = 20 + k * 42 + Math.random() * 10;
      c.strokeStyle = '#6f8f2e'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(x, 512); c.lineTo(x + Math.random() * 6 - 3, 60); c.stroke();
      for (let l = 0; l < 7; l++) {
        const y = 470 - l * 58, dir = l % 2 ? 1 : -1;
        c.fillStyle = l > 4 ? '#a8a845' : '#79a33a';
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + dir * 40, y - 30, x + dir * 60, y + 10); c.quadraticCurveTo(x + dir * 30, y - 12, x, y + 8); c.fill();
      }
      c.fillStyle = '#d8b850'; c.fillRect(x - 3, 30, 6, 40);
      c.fillStyle = '#e8d070'; c.beginPath(); c.ellipse(x + 8, 250, 7, 22, 0.3, 0, 6.3); c.fill();
    }
  });
  _wheatTex = canvasTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    for (let k = 0; k < 70; k++) {
      const x = Math.random() * 256, h = 150 + Math.random() * 90;
      c.strokeStyle = `rgb(${200 + Math.random() * 40},${160 + Math.random() * 40},${70 + Math.random() * 30})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, 256); c.lineTo(x + Math.random() * 10 - 5, 256 - h); c.stroke();
      c.fillStyle = `rgb(${220 + Math.random() * 30},${185 + Math.random() * 30},${90})`;
      c.beginPath(); c.ellipse(x + Math.random() * 6 - 3, 256 - h, 3, 12, 0, 0, 6.3); c.fill();
    }
  });
  _soyTex = canvasTexture(256, 128, (c) => {
    c.clearRect(0, 0, 256, 128);
    for (let k = 0; k < 40; k++) {
      c.fillStyle = Math.random() < 0.5 ? '#5f9a35' : '#4f8a2a';
      c.beginPath(); c.ellipse(Math.random() * 256, 40 + Math.random() * 88, 14, 10, Math.random() * 3, 0, 6.3); c.fill();
    }
  });
  for (const t of [_cornTex, _wheatTex, _soyTex]) { t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; }
}

export function makeCropMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.95 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sway = uv.y;
        vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
        transformed.x += sin(uTime * 1.6 + wp0.x * 0.15 + wp0.z * 0.1) * 0.12 * sway;
        transformed.z += cos(uTime * 1.3 + wp0.z * 0.15) * 0.08 * sway;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 1.0, 0.0);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\n vec3 normal = normalize(vNormal);\n vec3 nonPerturbedNormal = normal;');
  };
  m.customProgramCacheKey = () => 'crop';
  return m;
}
export function cropMaterials() {
  cropTextures();
  return { corn: makeCropMaterial(_cornTex), wheat: makeCropMaterial(_wheatTex), soy: makeCropMaterial(_soyTex) };
}

// Build crop strips for a field clipped to a cell. Returns {corn, wheat, soy} GeoBuilders (may be empty)
export function buildCrops(world, field, x0, z0, x1, z1, out) {
  const kinds = { corn: { row: 1.1, h: 2.5, cross: 2.2, len: 3, tex: 'corn' }, wheat: { row: 0.6, h: 1.05, cross: 0, len: 2.5, tex: 'wheat' }, hay: { row: 0.8, h: 0.6, cross: 0, len: 2.5, tex: 'wheat' }, soy: { row: 0.9, h: 0.55, cross: 0, len: 2.5, tex: 'soy' } };
  const k = kinds[field.crop];
  if (!k) return;
  const gb = out[k.tex];
  const c = Math.cos(field.rot), s = Math.sin(field.rot);
  const toW = (lx, lz) => [field.x + lx * c + lz * s, field.z - lx * s + lz * c];
  const hw = field.w / 2 - 1.5, hd = field.d / 2 - 1.5;
  const colTint = field.crop === 'corn' ? 0xffffff : field.crop === 'hay' ? 0xd8c890 : 0xffffff;
  const strip = (ax, az, bx, bz, h, u0, u1) => {
    const [wx0, wz0] = toW(ax, az), [wx1, wz1] = toW(bx, bz);
    const mx = (wx0 + wx1) / 2, mz = (wz0 + wz1) / 2;
    if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) return;
    const y0 = world.heightAt(wx0, wz0) - 0.05, y1 = world.heightAt(wx1, wz1) - 0.05;
    gb.setColor(colTint).setLayer(0);
    gb.quad([wx0, y0, wz0], [wx1, y1, wz1], [wx1, y1 + h, wz1], [wx0, y0 + h, wz0], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  };
  const r = new RNG(Math.floor(field.x + field.z));
  for (let lz = -hd; lz <= hd; lz += k.row) {
    for (let lx = -hw; lx < hw; lx += k.len) {
      const e = Math.min(hw, lx + k.len);
      const u0 = r.next();
      strip(lx, lz + r.range(-0.08, 0.08), e, lz + r.range(-0.08, 0.08), k.h * r.range(0.88, 1.08), u0, u0 + (e - lx) / 3);
    }
  }
  if (k.cross) {
    for (let lx = -hw; lx <= hw; lx += k.cross) for (let lz = -hd; lz < hd; lz += k.len) {
      const e = Math.min(hd, lz + k.len);
      const u0 = r.next();
      strip(lx, lz, lx, e, k.h * r.range(0.85, 1.05), u0, u0 + (e - lz) / 3);
    }
  }
}

// ---------- grass carpet ----------
export class Grass {
  constructor(world, terrain, density = 1) {
    this.world = world; this.terrain = terrain;
    this.density = density;
    this.tile = 8;
    this.radiusTiles = density >= 1.2 ? 7 : density >= 1 ? 6 : 4;
    this.perTile = Math.round(70 * density);
    const n = (this.radiusTiles * 2 + 1) ** 2;
    this.slots = new Map();
    // blade clump geometry
    const gb = new GeoBuilder();
    gb.wind = [];
    const rr = new RNG(42);
    for (let b = 0; b < 7; b++) {
      const a = rr.next() * Math.PI, ox = rr.range(-0.35, 0.35), oz = rr.range(-0.35, 0.35);
      const h = rr.range(0.35, 0.7), w = 0.07;
      const ca = Math.cos(a) * w, sa = Math.sin(a) * w;
      const lean = rr.range(-0.12, 0.12);
      gb.setSway(1.0);
      gb.setColor(0x6a9a40);
      gb.vert(ox - ca, 0, oz - sa, 0, 1, 0, 0, 0);
      gb.vert(ox + ca, 0, oz + sa, 0, 1, 0, 1, 0);
      gb.setColor(0xe8ffb0);
      gb.vert(ox + lean, h, oz + lean * 0.5, 0, 1, 0, 0.5, 1);
    }
    const geo = gb.build();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uCam = this.camU = { value: new THREE.Vector3() };
      shader.uniforms.uRad = { value: this.radiusTiles * this.tile };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uCam; uniform float uRad; attribute float aWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = instanceMatrix[3].xyz;
          float dcam = length(ip.xz - uCam.xz);
          float fade = smoothstep(uRad, uRad * 0.65, dcam);
          transformed.y *= fade;
          float ph = ip.x * 0.31 + ip.z * 0.23;
          transformed.x += (sin(uTime * 2.1 + ph) * 0.5 + sin(uTime * 3.7 + ph * 2.0) * 0.2) * aWind * transformed.y * 0.35;
          transformed.z += cos(uTime * 1.7 + ph) * aWind * transformed.y * 0.2;`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 1.0, 0.0);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\n vec3 normal = normalize(vNormal);\n vec3 nonPerturbedNormal = normal;');
    };
    mat.customProgramCacheKey = () => 'grass';
    this.mesh = new THREE.InstancedMesh(geo, mat, n * this.perTile);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = n * this.perTile;
    this.mesh.receiveShadow = true;
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.mesh.count; i++) { this.mesh.setMatrixAt(i, this.zero); this.mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    this.grid = this.radiusTiles * 2 + 1;
    this.tileKeys = new Array(this.grid * this.grid).fill(null);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  fillTile(slot, tx, tz) {
    const w = this.world, t = this.terrain;
    const base = slot * this.perTile;
    const r = new RNG((tx * 73856093) ^ (tz * 19349663));
    const okSurf = (s) => s === SURF.GRASS || s === SURF.LAWN || s === SURF.PASTURE || s === SURF.DRYGRASS || s === SURF.FOREST;
    for (let k = 0; k < this.perTile; k++) {
      const x = tx * this.tile + r.next() * this.tile, z = tz * this.tile + r.next() * this.tile;
      const gx = Math.round(x / WORLD.CELL), gz = Math.round(z / WORLD.CELL);
      const i = gz * GW + gx;
      const s = w.surf[i];
      if (x < 0 || z < 0 || x > WORLD.W || z > WORLD.H || !okSurf(s) || w.occ[i] & 1 || w.height[i] < 0.3 || (s === SURF.FOREST && r.next() < 0.5)) { this.mesh.setMatrixAt(base + k, this.zero); continue; }
      const y = w.heightAt(x, z);
      this.q.setFromAxisAngle(this.up, r.next() * 6.28);
      const sc = r.range(0.7, 1.4) * (s === SURF.LAWN ? 0.6 : s === SURF.DRYGRASS ? 1.2 : 1);
      this.s.set(sc, sc, sc);
      this.v.set(x, y - 0.02, z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(base + k, this.m);
      this.c.setRGB(t.colors[i * 3] * 1.25, t.colors[i * 3 + 1] * 1.15, t.colors[i * 3 + 2] * 1.1);
      this.mesh.setColorAt(base + k, this.c);
    }
  }
  update(cam) {
    if (this.camU) this.camU.value.copy(cam);
    const ctx = Math.floor(cam.x / this.tile), ctz = Math.floor(cam.z / this.tile);
    const R = this.radiusTiles;
    let changed = false;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const tx = ctx + dx, tz = ctz + dz;
      const sx = ((tx % this.grid) + this.grid) % this.grid, sz = ((tz % this.grid) + this.grid) % this.grid;
      const slot = sz * this.grid + sx;
      const key = tx * 100000 + tz;
      if (this.tileKeys[slot] !== key) { this.tileKeys[slot] = key; this.fillTile(slot, tx, tz); changed = true; }
    }
    if (changed) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }
}
