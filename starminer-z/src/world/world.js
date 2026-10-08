// The world on the main thread: which chunk columns are loaded, their blocks and light,
// the meshes drawn for them, and every change the player has made.
//
// Columns are generated and meshed by a pool of workers. A column is meshed once its eight
// neighbours exist (light crosses chunk borders); an edit re-meshes it, and its neighbours
// when the edit sits on a border.

import * as THREE from 'three';
import WorldWorker from './worker.js?worker&inline';
import { WorldGen } from './gen.js';
import { Mesher } from './mesher.js';
import { B, CHUNK, HEIGHT, COLUMN_SIZE, SOLID, OPAQUE, BLOCKS } from './blocks.js';

const key = (cx, cz) => `${cx},${cz}`;

export class World {
  constructor({ seed, scene, materials, renderDistance = 8, edits = null }) {
    this.seed = seed;
    this.scene = scene;
    this.materials = materials;
    this.radius = renderDistance;
    this.gen = new WorldGen(seed);
    this.columns = new Map();
    // the player's changes: column key -> Map(index -> block id)
    this.edits = new Map();
    if (edits) for (const [k, list] of Object.entries(edits)) this.edits.set(k, new Map(list));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.workers = [];
    this.jobs = new Map();
    this.nextJob = 1;
    this.center = { cx: 0, cz: 0 };
    this.genInFlight = 0;
    this.meshInFlight = 0;
    this.stats = { meshMs: 0, meshes: 0 };
    this.onColumnMeshed = null;
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new WorldWorker();
        w.onmessage = (e) => this.onMessage(e.data);
        w.onerror = (e) => console.error('world worker error', e.message);
        w.postMessage({ type: 'init', seed });
        w.busy = 0;
        this.workers.push(w);
      }
    } catch (err) {
      // no workers (a locked-down frame): do the work here, a little each frame
      console.warn('world workers unavailable, generating on the main thread', err);
      this.workers.length = 0;
      this.localMesher = new Mesher();
    }
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const c of this.columns.values()) this.dropMeshes(c);
    this.scene.remove(this.group);
  }

  // ---- streaming ------------------------------------------------------------------------------

  setRenderDistance(r) { this.radius = r; }

  update(px, pz, budgetMs = 4) {
    this.lastX = px; this.lastZ = pz;
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    this.center.cx = cx; this.center.cz = cz;
    const R = this.radius;
    // wanted columns, nearest first
    if (!this._order || this._orderR !== R) {
      this._orderR = R;
      this._order = [];
      for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d = dx * dx + dz * dz;
        if (d <= (R + 1.5) * (R + 1.5)) this._order.push([dx, dz, d]);
      }
      this._order.sort((a, b) => a[2] - b[2]);
    }
    const maxGen = Math.max(2, this.workers.length * 3), maxMesh = Math.max(2, this.workers.length * 3);
    const t0 = performance.now();
    for (const [dx, dz, d] of this._order) {
      const x = cx + dx, z = cz + dz;
      const k = key(x, z);
      let c = this.columns.get(k);
      if (!c) {
        if (this.genInFlight >= maxGen) continue;
        if (!this.workers.length && performance.now() - t0 > budgetMs) continue;
        c = { cx: x, cz: z, key: k, blocks: null, light: null, heights: null, state: 'gen', meshes: null, dirty: false, version: 0, meshedVersion: -1 };
        this.columns.set(k, c);
        this.requestGen(c);
        continue;
      }
      // mesh only inside the radius, and only once all neighbours exist
      if (d > (R + 0.5) * (R + 0.5)) continue;
      if (c.state !== 'ready') continue;
      if (c.meshing || c.meshedVersion === c.version) continue;
      if (this.meshInFlight >= maxMesh) continue;
      if (!this.neighboursReady(x, z)) continue;
      if (!this.workers.length && performance.now() - t0 > budgetMs) continue;
      this.requestMesh(c);
    }
    // unload what's far away
    for (const c of this.columns.values()) {
      const dx = c.cx - cx, dz = c.cz - cz;
      if (dx * dx + dz * dz > (R + 3) * (R + 3)) {
        this.dropMeshes(c);
        if (!c.meshing && c.state === 'ready') this.columns.delete(c.key);
      }
    }
  }

  neighboursReady(x, z) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.columns.get(key(x + dx, z + dz));
      if (!n || n.state !== 'ready') return false;
    }
    return true;
  }

  pickWorker() {
    let best = this.workers[0];
    for (const w of this.workers) if (w.busy < best.busy) best = w;
    return best;
  }

  requestGen(c) {
    this.genInFlight++;
    if (!this.workers.length) {
      // main-thread fallback
      const blocks = this.gen.generateColumn(c.cx, c.cz);
      this.genInFlight--;
      this.finishGen(c, blocks);
      return;
    }
    const id = this.nextJob++;
    const w = this.pickWorker();
    w.busy++;
    this.jobs.set(id, { c, w });
    w.postMessage({ type: 'gen', id, cx: c.cx, cz: c.cz });
  }

  finishGen(c, blocks) {
    // replay the player's changes
    const ed = this.edits.get(c.key);
    if (ed) for (const [i, id] of ed) blocks[i] = id;
    c.blocks = blocks;
    c.state = 'ready';
    c.version++;
    // neighbours may now be meshable, and their light may change
  }

  requestMesh(c) {
    const cols = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cols.push(this.columns.get(key(c.cx + dx, c.cz + dz)).blocks);
    c.meshing = true;
    const version = c.version;
    this.meshInFlight++;
    if (!this.workers.length) {
      const t = performance.now();
      const r = this.localMesher.build(cols);
      this.meshInFlight--;
      this.finishMesh(c, r, version, performance.now() - t);
      return;
    }
    const id = this.nextJob++;
    const w = this.pickWorker();
    w.busy++;
    this.jobs.set(id, { c, w });
    w.postMessage({ type: 'mesh', id, cx: c.cx, cz: c.cz, version, cols });
  }

  onMessage(m) {
    const job = this.jobs.get(m.id);
    if (!job) return;
    this.jobs.delete(m.id);
    job.w.busy--;
    if (m.type === 'error') {
      console.error('world worker:', m.message);
      if (job.c.state === 'gen') this.genInFlight--; else { this.meshInFlight--; job.c.meshing = false; }
      return;
    }
    if (m.type === 'gen') {
      this.genInFlight--;
      if (this.columns.get(job.c.key) !== job.c) return;
      this.finishGen(job.c, m.blocks);
    } else if (m.type === 'mesh') {
      this.meshInFlight--;
      this.finishMesh(job.c, m.mesh, m.version, m.ms);
    }
    // keep the workers fed without waiting for the next frame
    if (this.genInFlight + this.meshInFlight < this.workers.length * 2) this.update(this.lastX, this.lastZ);
  }

  finishMesh(c, r, version, ms) {
    c.meshing = false;
    this.stats.meshMs = this.stats.meshMs * 0.9 + ms * 0.1;
    this.stats.meshes++;
    if (this.columns.get(c.key) !== c) return;
    c.light = r.light;
    c.heights = r.heights;
    c.meshedVersion = version;
    this.dropMeshes(c);
    c.meshes = {};
    for (const pass of ['opaque', 'cutout']) {
      const g = r[pass];
      if (!g.count) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('aPos', new THREE.BufferAttribute(g.pos, 3));
      geo.setAttribute('aUv', new THREE.BufferAttribute(g.uv, 2));
      geo.setAttribute('aData', new THREE.BufferAttribute(g.data, 4));
      geo.setIndex(new THREE.BufferAttribute(g.index, 1));
      const y0 = Math.max(0, r.ymin), y1 = Math.min(HEIGHT, r.ymax + 1);
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, y0, 0), new THREE.Vector3(16, y1, 16));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geo, this.materials[pass]);
      mesh.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.column = c;
      this.group.add(mesh);
      c.meshes[pass] = mesh;
    }
    if (this.onColumnMeshed) this.onColumnMeshed(c);
  }

  dropMeshes(c) {
    if (!c.meshes) return;
    for (const m of Object.values(c.meshes)) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    c.meshes = null;
  }

  // How much of the area around (x, z) has meshes, 0..1 (for the loading screen).
  readiness(x, z, r = 3) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    let n = 0, ok = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      n++;
      const c = this.columns.get(key(cx + dx, cz + dz));
      if (c && c.meshedVersion >= 0) ok++;
    }
    return ok / n;
  }

  // ---- blocks ---------------------------------------------------------------------------------

  column(x, z) {
    return this.columns.get(key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  }

  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const c = this.columns.get(key(x >> 4, z >> 4));
    if (!c || !c.blocks) return B.ROCK; // unloaded: solid, so nothing falls out of the world
    return c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }

  isLoaded(x, z) {
    const c = this.columns.get(key(Math.floor(x) >> 4, Math.floor(z) >> 4));
    return !!(c && c.blocks);
  }

  setBlock(x, y, z, id) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 1 || y >= HEIGHT - 2) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.columns.get(key(cx, cz));
    if (!c || !c.blocks) return false;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    if (c.blocks[i] === id) return false;
    c.blocks[i] = id;
    let ed = this.edits.get(c.key);
    if (!ed) { ed = new Map(); this.edits.set(c.key, ed); }
    ed.set(i, id);
    // re-light and re-mesh: this column, and neighbours within light's reach of the edit
    const lx = x & 15, lz = z & 15;
    this.touch(cx, cz);
    const reach = 15;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nearX = dx === 0 || (dx < 0 ? lx < reach : lx > 15 - reach);
      const nearZ = dz === 0 || (dz < 0 ? lz < reach : lz > 15 - reach);
      if (nearX && nearZ) this.touch(cx + dx, cz + dz);
    }
    // the edited column goes first so the change shows straight away
    this.urgent = c;
    return true;
  }

  touch(cx, cz) {
    const c = this.columns.get(key(cx, cz));
    if (c && c.state === 'ready') c.version++;
  }

  // Re-mesh the column the player just changed before anything else.
  flushUrgent() {
    const c = this.urgent;
    if (!c) return;
    this.urgent = null;
    if (!c.meshing && c.meshedVersion !== c.version && this.neighboursReady(c.cx, c.cz)) this.requestMesh(c);
  }

  // Light at a block: { sky, block } in 0..15 (from the last mesh of its column).
  lightAt(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y >= HEIGHT) return { sky: 15, block: 0 };
    if (y < 0) return { sky: 0, block: 0 };
    const c = this.columns.get(key(x >> 4, z >> 4));
    if (!c || !c.light) return { sky: 15, block: 0 };
    const v = c.light[(x & 15) | ((z & 15) << 4) | (y << 8)];
    return { sky: v >> 4, block: v & 15 };
  }

  // Highest solid block at (x, z), or -1 if unknown.
  surfaceY(x, z) {
    const c = this.column(x, z);
    if (!c || !c.blocks) return -1;
    const lx = Math.floor(x) & 15, lz = Math.floor(z) & 15;
    for (let y = HEIGHT - 2; y > 0; y--) if (SOLID[c.blocks[lx | (lz << 4) | (y << 8)]]) return y;
    return -1;
  }

  isSolid(x, y, z) { return SOLID[this.getBlock(x, y, z)] === 1; }
  isOpaque(x, y, z) { return OPAQUE[this.getBlock(x, y, z)] === 1; }

  // Step through the grid along a ray (Amanatides & Woo). Returns the first block that isn't
  // air (or that `hit(id)` accepts), with the face it was entered through.
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 6, hit = null) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity;
    let ty = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity;
    let tz = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 256; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && (hit ? hit(id) : true)) return { x, y, z, id, nx, ny, nz, dist: t };
      if (tx < ty && tx < tz) { t = tx; if (t > maxDist) break; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; if (t > maxDist) break; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; if (t > maxDist) break; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  // The changes, in a form that survives JSON (for saving).
  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) if (m.size) out[k] = [...m];
    return out;
  }
}

export { BLOCKS, COLUMN_SIZE };
