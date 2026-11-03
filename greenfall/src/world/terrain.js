// Terrain chunks with 4 LOD levels and skirts. LOD 1-3 are built at load, LOD 0 lazily.
import * as THREE from 'three';
import { GW, GH, WORLD } from './layout.js';
import { SURF } from './worldgen.js';
import { clamp } from '../core/math.js';

export const CHUNK = 256;
const CELLS = CHUNK / WORLD.CELL; // 64
export const CX = Math.ceil(WORLD.W / CHUNK);
export const CZ = Math.ceil(WORLD.H / CHUNK);
const LOD_STEPS = [1, 2, 4, 8];
export const LOD_DIST = [420, 900, 1700];

const PALETTE = {};
const setP = (k, hex, det) => { PALETTE[k] = { c: new THREE.Color(hex), det }; };
// det = detail weights [grass, dirt, rock]
setP(SURF.GRASS, 0x6aad3a, [1, 0, 0]);
setP(SURF.DRYGRASS, 0x9fae46, [1, 0.3, 0]);
setP(SURF.FOREST, 0x4f7a2c, [0.6, 0.6, 0]);
setP(SURF.DIRT, 0x9a7a52, [0, 1, 0.2]);
setP(SURF.SAND, 0xe2d3a0, [0, 0.6, 0.4]);
setP(SURF.ROCK, 0x8d8a84, [0, 0.2, 1]);
setP(SURF.LAWN, 0x73b842, [1, 0, 0]);
setP(SURF.PAVE, 0x67686d, [0, 0.4, 0.6]);
setP(SURF.COBBLE, 0x8f8576, [0, 0.5, 0.6]);
setP(SURF.SOIL, 0x7b5a3b, [0, 1, 0]);
setP(SURF.WHEAT, 0xd4b356, [0.8, 0.4, 0]);
setP(SURF.CORN, 0x7f9c3a, [0.8, 0.5, 0]);
setP(SURF.PASTURE, 0x7bb646, [1, 0, 0]);
setP(SURF.GRAVEL, 0xa39985, [0, 0.4, 0.6]);
setP(SURF.MUD, 0x6e5c42, [0, 1, 0.2]);
setP(SURF.SEABED, 0xcdbd8c, [0, 0.6, 0.4]);
setP(SURF.DIRTROAD, 0x9a7a55, [0, 1, 0.1]);
setP(SURF.ASPHALT, 0x56585d, [0, 0.3, 0.7]);

const _tmp = new THREE.Color();
const _autumn = [new THREE.Color(0x7a6a2e), new THREE.Color(0x8a5a2a), new THREE.Color(0x5c7a2c)];

export class Terrain {
  constructor(world, material) {
    this.world = world;
    this.material = material;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.chunks = [];
    this.indexCache = {};
    this.colors = null;
    this.precomputeVertexData();
    for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) {
      const ch = { cx, cz, lods: [null, null, null, null], mesh: null, lod: -1, center: new THREE.Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK) };
      let hs = 0, n = 0;
      for (let k = 0; k < 4; k++) { const x = clamp((cx + (k & 1)) * CHUNK, 0, WORLD.W), z = clamp((cz + (k >> 1)) * CHUNK, 0, WORLD.H); hs += world.heightAt(x, z); n++; }
      ch.center.y = hs / n;
      this.chunks.push(ch);
    }
    for (const ch of this.chunks) for (let l = 1; l < 4; l++) ch.lods[l] = this.buildChunk(ch, l);
    this.pending = [];
  }

  precomputeVertexData() {
    // Per-cell vertex color + detail weights + normal for the whole map (shared by all LODs)
    const w = this.world;
    const N = GW * GH;
    this.colors = new Float32Array(N * 3);
    this.details = new Float32Array(N * 3);
    this.normals = new Float32Array(N * 3);
    const nz = w.noise;
    const h = w.height;
    for (let gz = 0; gz < GH; gz++) {
      for (let gx = 0; gx < GW; gx++) {
        const i = gz * GW + gx;
        const x = gx * WORLD.CELL, z = gz * WORLD.CELL;
        const p = PALETTE[w.surf[i]] || PALETTE[SURF.GRASS];
        _tmp.copy(p.c);
        const n1 = nz.noise(x / 90, z / 90), n2 = nz.noise(x / 23 + 5, z / 23);
        const s = w.surf[i];
        if (s === SURF.GRASS || s === SURF.LAWN || s === SURF.PASTURE || s === SURF.DRYGRASS) {
          _tmp.multiplyScalar(0.9 + n1 * 0.12 + n2 * 0.05);
          if (n1 > 0.35) _tmp.lerp(_autumn[0], (n1 - 0.35) * 0.5);
          const f = w.forest[i];
          if (f > 0.2) _tmp.lerp(PALETTE[SURF.FOREST].c, f * 0.5);
        } else if (s === SURF.FOREST) {
          _tmp.lerp(_autumn[(Math.abs(n2 * 10) | 0) % 3], 0.25 + n1 * 0.2);
        } else {
          _tmp.multiplyScalar(0.93 + n2 * 0.08);
        }
        // road shoulders get a dusty tint
        const rw = w.roadW[i];
        if (rw > 0.05 && !w.roadType[i]) _tmp.lerp(PALETTE[SURF.DIRT].c, rw * 0.35);
        // underwater darkening
        if (h[i] < 0) _tmp.multiplyScalar(clamp(1 + h[i] * 0.03, 0.4, 1));
        this.colors[i * 3] = _tmp.r; this.colors[i * 3 + 1] = _tmp.g; this.colors[i * 3 + 2] = _tmp.b;
        this.details[i * 3] = p.det[0]; this.details[i * 3 + 1] = p.det[1]; this.details[i * 3 + 2] = p.det[2];
        const l = h[gz * GW + Math.max(0, gx - 1)], r = h[gz * GW + Math.min(GW - 1, gx + 1)];
        const u = h[Math.max(0, gz - 1) * GW + gx], d = h[Math.min(GH - 1, gz + 1) * GW + gx];
        let nx = l - r, ny = 2 * WORLD.CELL, nzz = u - d;
        const ln = Math.hypot(nx, ny, nzz);
        this.normals[i * 3] = nx / ln; this.normals[i * 3 + 1] = ny / ln; this.normals[i * 3 + 2] = nzz / ln;
      }
    }
  }

  getIndex(lod) {
    if (this.indexCache[lod]) return this.indexCache[lod];
    const n = CELLS / LOD_STEPS[lod] + 1; // verts per side
    const idx = [];
    const v = (i, j) => j * n + i;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    // skirts: ring of extra vertices after the grid, in order: top edge, right, bottom, left
    const base = n * n;
    let k = 0;
    const ring = [];
    for (let i = 0; i < n; i++) ring.push([v(i, 0), base + k++]);
    for (let j = 0; j < n; j++) ring.push([v(n - 1, j), base + k++]);
    for (let i = n - 1; i >= 0; i--) ring.push([v(i, n - 1), base + k++]);
    for (let j = n - 1; j >= 0; j--) ring.push([v(0, j), base + k++]);
    for (let e = 0; e < 4; e++) {
      for (let i = 0; i < n - 1; i++) {
        const [t0, s0] = ring[e * n + i], [t1, s1] = ring[e * n + i + 1];
        idx.push(t0, s0, t1, t1, s0, s1);
      }
    }
    const attr = new THREE.Uint32BufferAttribute(idx, 1);
    this.indexCache[lod] = attr;
    return attr;
  }

  buildChunk(ch, lod) {
    const step = LOD_STEPS[lod];
    const n = CELLS / step + 1;
    const total = n * n + 4 * n;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), det = new Float32Array(total * 3);
    const gx0 = ch.cx * CELLS, gz0 = ch.cz * CELLS;
    const h = this.world.height;
    const put = (k, gx, gz, drop) => {
      const cgx = Math.min(GW - 1, gx), cgz = Math.min(GH - 1, gz);
      const i = cgz * GW + cgx;
      pos[k * 3] = gx * WORLD.CELL; pos[k * 3 + 1] = h[i] - drop; pos[k * 3 + 2] = gz * WORLD.CELL;
      nor[k * 3] = this.normals[i * 3]; nor[k * 3 + 1] = this.normals[i * 3 + 1]; nor[k * 3 + 2] = this.normals[i * 3 + 2];
      col[k * 3] = this.colors[i * 3]; col[k * 3 + 1] = this.colors[i * 3 + 1]; col[k * 3 + 2] = this.colors[i * 3 + 2];
      det[k * 3] = this.details[i * 3]; det[k * 3 + 1] = this.details[i * 3 + 1]; det[k * 3 + 2] = this.details[i * 3 + 2];
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) put(j * n + i, gx0 + i * step, gz0 + j * step, 0);
    let k = n * n;
    const drop = 2 + step * 1.5;
    for (let i = 0; i < n; i++) put(k++, gx0 + i * step, gz0, drop);
    for (let j = 0; j < n; j++) put(k++, gx0 + (n - 1) * step, gz0 + j * step, drop);
    for (let i = n - 1; i >= 0; i--) put(k++, gx0 + i * step, gz0 + (n - 1) * step, drop);
    for (let j = n - 1; j >= 0; j--) put(k++, gx0, gz0 + j * step, drop);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aDetail', new THREE.BufferAttribute(det, 3));
    g.setIndex(this.getIndex(lod));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.userData.lod = lod;
    return m;
  }

  update(camPos, budgetMs = 3) {
    const t0 = performance.now();
    for (const ch of this.chunks) {
      const dx = Math.max(0, Math.abs(camPos.x - ch.center.x) - CHUNK / 2);
      const dz = Math.max(0, Math.abs(camPos.z - ch.center.z) - CHUNK / 2);
      const dy = camPos.y - ch.center.y;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.5);
      let want = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : d < LOD_DIST[2] ? 2 : 3;
      ch.dist = d;
      if (want === 0 && !ch.lods[0]) {
        if (performance.now() - t0 < budgetMs) ch.lods[0] = this.buildChunk(ch, 0);
        else want = 1;
      }
      if (want !== ch.lod) {
        if (ch.mesh) this.group.remove(ch.mesh);
        ch.mesh = ch.lods[want];
        this.group.add(ch.mesh);
        ch.lod = want;
      }
      // free distant LOD0 meshes to save memory
      if (ch.lods[0] && d > LOD_DIST[0] * 2.2 && ch.lod !== 0) {
        ch.lods[0].geometry.dispose();
        ch.lods[0] = null;
      }
    }
  }
  prebuildAround(x, z, radius) {
    for (const ch of this.chunks) {
      const d = Math.hypot(x - ch.center.x, z - ch.center.z);
      if (d < radius && !ch.lods[0]) ch.lods[0] = this.buildChunk(ch, 0);
    }
  }
}
