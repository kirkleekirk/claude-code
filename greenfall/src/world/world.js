// World streaming: per-256m chunk content with far (boxes + low trees) and near (full
// buildings with interiors, props, fences, crops, detailed trees) representations,
// built incrementally under a frame-time budget. Also feeds colliders to physics.
import * as THREE from 'three';
import { GeoBuilder } from './geo.js';
import { generateBuilding, farBuilding, NULL_GB, COL } from './buildings.js';
import { buildProp, buildLandmark, buildFence, buildPole, poleAttach, buildRoads } from './props.js';
import { Vegetation, cropMaterials, buildCrops, TREE_INFO } from './vegetation.js';
import { SignAtlas } from './signs.js';
import { makeWorldMaterial } from './materials.js';
import { CHUNK, CX, CZ } from './terrain.js';
import { TEX } from './textures.js';
import { WORLD } from './layout.js';

const CELL = 128;

export class WorldView {
  constructor(data, physics, quality) {
    this.data = data;
    this.physics = physics;
    this.q = quality;
    this.group = new THREE.Group();
    this.group.name = 'world';
    const lambert = !!quality.lambert;
    this.mats = {
      world: makeWorldMaterial({ lambert }),
      veg: makeWorldMaterial({ lambert, wind: true, canopyTint: true }),
      road: makeWorldMaterial({ lambert, polygonOffset: -3 }),
      lines: makeWorldMaterial({ lambert, polygonOffset: -5 }),
    };
    this.crop = cropMaterials();
    this.signs = new SignAtlas();
    this.veg = new Vegetation(data, this.mats);
    this.chunks = [];
    for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) {
      this.chunks.push({ cx, cz, x0: cx * CHUNK, z0: cz * CHUNK, x1: (cx + 1) * CHUNK, z1: (cz + 1) * CHUNK,
        center: new THREE.Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK),
        buildings: [], props: [], landmarks: [], fences: [], poles: [], wires: [], fields: [], rocks: [],
        far: null, near: null, staticG: null, state: 'far', job: null, colliders: null, colActive: false, treeLookup: null, nearTrees: null, dyn: null });
    }
    const chunkOf = (x, z) => {
      const cx = Math.min(CX - 1, Math.max(0, Math.floor(x / CHUNK))), cz = Math.min(CZ - 1, Math.max(0, Math.floor(z / CHUNK)));
      return this.chunks[cz * CX + cx];
    };
    this.chunkOf = chunkOf;
    for (const b of data.buildings) chunkOf(b.x, b.z).buildings.push(b);
    for (const p of data.props) chunkOf(p.x, p.z).props.push(p);
    for (const l of data.landmarks) chunkOf(l.x, l.z).landmarks.push(l);
    for (const f of data.fences) chunkOf((f.x1 + f.x2) / 2, (f.z1 + f.z2) / 2).fences.push(f);
    for (const p of data.poles) chunkOf(p.x, p.z).poles.push(p);
    for (const w of data.wires) chunkOf(w[0].x, w[0].z).wires.push(w);
    for (const r of data.rocks) chunkOf(r.x, r.z).rocks.push(r);
    for (const f of data.fields) {
      const R = Math.hypot(f.w, f.d) / 2;
      for (const ch of this.chunks) if (f.x + R > ch.x0 && f.x - R < ch.x1 && f.z + R > ch.z0 && f.z - R < ch.z1) ch.fields.push(f);
    }
    this.rockGeo = new THREE.DodecahedronGeometry(1, 0);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 1, flatShading: true });
    this.queue = [];
    this.onChunkNear = null;
    this.onChunkFar = null;
    this.buildTimeMs = 0;
  }

  // build always-present static groups + far LOD for every chunk (called during loading)
  buildStatic(progress) {
    let i = 0;
    for (const ch of this.chunks) {
      ch.staticG = this.buildStaticGroup(ch);
      this.group.add(ch.staticG);
      ch.far = this.buildFarGroup(ch);
      this.group.add(ch.far);
      this.group.add(ch.farT);
      if (progress && (++i % 20 === 0)) progress(i / this.chunks.length);
    }
  }
  buildStaticGroup(ch) {
    const g = new THREE.Group();
    const gb = new GeoBuilder(), roads = new GeoBuilder(), lines = new GeoBuilder(), signs = new GeoBuilder();
    const signList = [];
    const cols = [];
    for (const l of ch.landmarks) buildLandmark(l, gb, cols, signList, 0);
    ch.landmarkCols = cols;
    buildRoads(this.data, ch.x0, ch.z0, ch.x1, ch.z1, roads, lines);
    for (const s of signList) this.signs.emit(signs, s);
    const add = (b, mat, shadow = true) => {
      if (b.isEmpty()) return;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = shadow; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
    };
    add(gb, this.mats.world);
    const detailG = new THREE.Group();
    g.add(detailG);
    const addD = (b, mat) => { if (b.isEmpty()) return; const m = new THREE.Mesh(b.build(), mat); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); detailG.add(m); };
    addD(roads, this.mats.road);
    addD(lines, this.mats.lines);
    addD(signs, this.signs.material);
    ch.staticDetail = detailG;
    // power lines
    if (ch.wires.length) {
      const pos = [];
      for (const [a, b] of ch.wires) {
        const pa = poleAttach(a), pb = poleAttach(b);
        for (let k = 0; k < 3; k++) {
          const [x0, y0, z0] = pa[k], [x1, y1, z1] = pb[k];
          const segs = 6;
          for (let s = 0; s < segs; s++) {
            const t0 = s / segs, t1 = (s + 1) / segs;
            const sag = (t) => -Math.sin(t * Math.PI) * 0.9;
            pos.push(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0 + sag(t0), z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1 + sag(t1), z0 + (z1 - z0) * t1);
          }
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const ls = new THREE.LineSegments(lg, WorldView.wireMat || (WorldView.wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.75 })));
      detailG.add(ls);
    }
    return g;
  }
  buildFarGroup(ch) {
    const g = new THREE.Group();
    const gb = new GeoBuilder();
    for (const b of ch.buildings) farBuilding(b, gb);
    if (!gb.isEmpty()) {
      const m = new THREE.Mesh(gb.build(), this.mats.world);
      m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
    }
    const trees = this.veg.buildCell(ch.x0, ch.z0, ch.x1, ch.z1, 1);
    for (const m of trees.group.children) { m.castShadow = false; m.receiveShadow = false; }
    ch.farT = trees.group;
    ch.farTreeLookup = trees.lookup;
    return g;
  }

  // ---------- near build (incremental job) ----------
  startNearJob(ch) {
    const tasks = [];
    const cells = {};
    const cellOf = (x, z) => {
      const k = Math.floor((x - ch.x0) / CELL) + ',' + Math.floor((z - ch.z0) / CELL);
      if (!cells[k]) cells[k] = { gb: new GeoBuilder(), signs: new GeoBuilder(), corn: new GeoBuilder(), wheat: new GeoBuilder(), soy: new GeoBuilder() };
      return cells[k];
    };
    const cols = [];
    const signList = [];
    for (const b of ch.buildings) tasks.push(() => {
      const cell = cellOf(b.x, b.z);
      const before = signList.length;
      const rt = generateBuilding(b, cell.gb, signList, 0);
      for (let i = before; i < signList.length; i++) this.signs.emit(cell.signs, signList[i]);
      if (!b.rt) b.rt = rt; // first generation defines runtime state
      for (const c of rt.colliders) { c.building = b.id; cols.push(c); }
    });
    for (const p of ch.props) tasks.push(() => buildProp(p, cellOf(p.x, p.z).gb, cols, 0));
    tasks.push(() => { for (const f of ch.fences) buildFence(f, cellOf((f.x1 + f.x2) / 2, (f.z1 + f.z2) / 2).gb, cols, this.data, 0); });
    tasks.push(() => { for (const p of ch.poles) buildPole(p, cellOf(p.x, p.z).gb, cols); });
    for (const f of ch.fields) tasks.push(() => {
      for (let cz = ch.z0; cz < ch.z1; cz += CELL) for (let cx = ch.x0; cx < ch.x1; cx += CELL) {
        const cell = cellOf(cx + 1, cz + 1);
        buildCrops(this.data, f, cx, cz, cx + CELL, cz + CELL, cell);
      }
    });
    tasks.push(() => {
      // tree trunks colliders + near trees
      const t = this.data.trees;
      for (let i = 0; i < t.n; i++) {
        const x = t.x[i], z = t.z[i];
        if (x < ch.x0 || x >= ch.x1 || z < ch.z0 || z >= ch.z1 || !t.alive[i]) continue;
        const info = TREE_INFO[t.t[i]];
        if (info.trunkR <= 0) continue;
        cols.push({ kind: 2, x, y: t.y[i] + 2.5, z, hx: info.trunkR * t.s[i], hy: 2.5, hz: info.trunkR * t.s[i], rot: 0, flags: COL.SOLID | COL.BULLET, ref: { type: 'tree', tree: i } });
      }
    });
    tasks.push(() => {
      for (const r of ch.rocks) cols.push({ kind: 2, x: r.x, y: r.y + r.s * 0.4, z: r.z, hx: r.s * 0.9, hy: r.s * 0.75, hz: r.s * 0.9, rot: 0, flags: COL.SOLID | COL.BULLET | COL.WALK, ref: { type: 'rock', rock: r } });
    });
    ch.job = { tasks, i: 0, cells, cols };
  }
  finishNearJob(ch) {
    const job = ch.job;
    const g = new THREE.Group();
    const add = (b, mat, shadow = true) => {
      if (b.isEmpty()) return;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = shadow; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
    };
    for (const k in job.cells) {
      const c = job.cells[k];
      add(c.gb, this.mats.world);
      add(c.signs, this.signs.material, false);
      add(c.corn, this.crop.corn, true);
      add(c.wheat, this.crop.wheat, false);
      add(c.soy, this.crop.soy, false);
    }
    const trees = this.veg.buildCell(ch.x0, ch.z0, ch.x1, ch.z1, 0);
    ch.nearT = trees.group;
    ch.treeLookup = trees.lookup;
    if (ch.rocks.length) {
      const im = new THREE.InstancedMesh(this.rockGeo, this.rockMat, ch.rocks.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      ch.rocks.forEach((r, i) => {
        e.set(r.r * 0.3, r.r, r.r * 0.7);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(r.x, r.y + r.s * 0.25, r.z), q, new THREE.Vector3(r.s * 1.2, r.s * 0.85, r.s));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
      ch.rockMesh = im;
    }
    ch.near = g;
    ch.colliders = job.cols.concat(ch.landmarkCols || []);
    ch.job = null;
  }

  activateNear(ch) {
    this.group.add(ch.near);
    this.group.add(ch.nearT);
    this.group.remove(ch.far);
    ch.state = 'near';
    this.physics.addAll(ch.colliders);
    ch.colActive = true;
    ch._treeNear = null;
    if (this.onChunkNear) this.onChunkNear(ch);
  }
  // ---------- per-frame update ----------
  update(camPos, focusList, budgetMs = 5) {
    const t0 = performance.now();
    const near = this.q.detailDist;
    // decide desired state per chunk
    let cand = null, candD = 1e9;
    for (const ch of this.chunks) {
      const dx = Math.max(0, Math.abs(camPos.x - ch.center.x) - CHUNK / 2);
      const dz = Math.max(0, Math.abs(camPos.z - ch.center.z) - CHUNK / 2);
      const dy = Math.max(0, camPos.y - 120);
      const d = Math.hypot(dx, dz, dy);
      ch.dist = d;
      // physics focus distance (player / physical entities)
      let fd = 1e9;
      for (const f of focusList) {
        const fx = Math.max(0, Math.abs(f.x - ch.center.x) - CHUNK / 2), fz = Math.max(0, Math.abs(f.z - ch.center.z) - CHUNK / 2);
        fd = Math.min(fd, Math.hypot(fx, fz));
      }
      ch.focusDist = fd;
      const wantNear = d < near || fd < 60;
      if (wantNear && ch.state === 'far' && !ch.job) {
        if (d < candD) { candD = d; cand = ch; }
      } else if (!wantNear && ch.state === 'near' && d > near + 120 && fd > 160) {
        this.dropNear(ch);
      }
    }
    if (cand && !this.queue.includes(cand)) { this.startNearJob(cand); this.queue.push(cand); }
    // process jobs (closest first)
    this.queue.sort((a, b) => a.dist - b.dist);
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const ch = this.queue[0];
      const job = ch.job;
      while (job.i < job.tasks.length && performance.now() - t0 < budgetMs) job.tasks[job.i++]();
      if (job.i >= job.tasks.length) {
        this.finishNearJob(ch);
        this.queue.shift();
        this.activateNear(ch);
      }
    }
    this.buildTimeMs = performance.now() - t0;
    // shadows only for close chunks; detailed trees only within treeNear
    const treeNear = this.q.treeNear;
    const alt = Math.max(0, camPos.y - 60);
    const dDetail = 1100 + alt * 2, dTrees = 1500 + alt * 2.5, dFarB = 2400 + alt * 3;
    for (const ch of this.chunks) {
      const dd = Math.hypot(Math.max(0, Math.abs(camPos.x - ch.center.x) - CHUNK / 2), Math.max(0, Math.abs(camPos.z - ch.center.z) - CHUNK / 2));
      if (ch.staticDetail) ch.staticDetail.visible = dd < dDetail;
      if (ch.state === 'far') { ch.far.visible = dd < dFarB; ch.farT.visible = dd < dTrees; }
      if (ch.state !== 'near') continue;
      const cast = ch.dist < 140;
      if (ch._cast !== cast) { ch._cast = cast; ch.near.traverse((o) => { if (o.isMesh) o.castShadow = cast; }); ch.nearT.traverse((o) => { if (o.isMesh) o.castShadow = cast; }); }
      const tn = ch.dist < treeNear;
      if (ch._treeNear !== tn) { ch._treeNear = tn; ch.nearT.visible = tn; ch.farT.visible = !tn; }
    }
  }
  dropNear(ch) {
    if (this.onChunkFar) this.onChunkFar(ch);
    this.group.remove(ch.near);
    this.group.remove(ch.nearT);
    ch.farT.visible = true;
    for (const o of ch.nearT.children) o.dispose();
    ch.nearT = null;
    ch.near.traverse((o) => { if (o.geometry && o.geometry !== this.rockGeo && !Object.values(this.veg.geos).some((g) => g.includes(o.geometry))) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    ch.near = null;
    ch.treeLookup = null;
    this.group.add(ch.far);
    ch.state = 'far';
    if (ch.colActive) { this.physics.removeAll(ch.colliders); ch.colActive = false; }
    ch.colliders = null;
  }
  // force-build chunks around a point synchronously (loading screen / spawn)
  buildAround(x, z, radius) {
    for (const ch of this.chunks) {
      const d = Math.hypot(Math.max(0, Math.abs(x - ch.center.x) - CHUNK / 2), Math.max(0, Math.abs(z - ch.center.z) - CHUNK / 2));
      if (d > radius || ch.state === 'near') continue;
      if (!ch.job) this.startNearJob(ch);
      while (ch.job.i < ch.job.tasks.length) ch.job.tasks[ch.job.i++]();
      this.finishNearJob(ch);
      const qi = this.queue.indexOf(ch); if (qi >= 0) this.queue.splice(qi, 1);
      this.activateNear(ch);
    }
  }
  isReadyAt(x, z) { const ch = this.chunkOf(x, z); return ch.state === 'near'; }

  // remove a tree (harvested): hide instance in near + far meshes, drop collider
  removeTree(i) {
    const t = this.data.trees;
    if (!t.alive[i]) return;
    t.alive[i] = 0;
    const ch = this.chunkOf(t.x[i], t.z[i]);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const lk of [ch.treeLookup, ch.farTreeLookup]) {
      const e = lk && lk.get(i);
      if (e) { e[0].setMatrixAt(e[1], zero); e[0].instanceMatrix.needsUpdate = true; }
    }
    if (ch.colliders) {
      const c = ch.colliders.find((cc) => cc.ref && cc.ref.type === 'tree' && cc.ref.tree === i);
      if (c) { this.physics.remove(c); ch.colliders.splice(ch.colliders.indexOf(c), 1); }
    }
  }
  setLampGlow(v) { this.signs.material.emissiveIntensity = v * 0.35; }
}
export { CELL, TEX, WORLD };
