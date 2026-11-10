import * as THREE from 'three';
import { litMaterial } from '../gfx/materials.js';
import { Noise, hash2, smoothstep } from '../core/noise.js';
import * as MD from './models.js';

const SECTOR = 128;
const COVER_CELL = 20;
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function kindsFor(planet) {
  const gem = { gem: true, glow: 1.25, nightBoost: 1.0, spec: 1.3, shin: 90, rim: 0.3, rimCol: 0x7ffff0, wrap: 0.35 };
  if (planet === 'korr') {
    return {
      boulder: { geo: MD.boulder(3), mat: litMaterial({ wrap: 0.12, spec: 0.15, shin: 20 }), vis: 420, col: 0.85, walk: true },
      basalt: { geo: MD.basaltColumns(4), mat: litMaterial({ wrap: 0.1, spec: 0.25, shin: 30 }), vis: 9999, reflect: true, col: 0.5 },
      ore: { geo: MD.crystalCluster(31, { count: 5, fat: 1.5 }), mat: litMaterial({ ...gem, rimCol: 0x6fa0ff, glow: 1.1 }), vis: 600, col: 0.22 },
      slag: { geo: MD.crystalCluster(41, { count: 4, fat: 1.2 }), mat: litMaterial({ ...gem, rimCol: 0xff9050, glow: 1.6 }), vis: 400, col: 0.2 },
    };
  }
  return {
    crystalBig: { geo: MD.crystalCluster(11), mat: litMaterial(gem), vis: 9999, reflect: true, col: 0.19 },
    crystalSmall: { geo: MD.crystalCluster(23, { count: 4 }), mat: litMaterial(gem), vis: 280, col: 0 },
    stalk: { geo: MD.stalkPod(5), mat: litMaterial({ sway: 0.12, wrap: 0.5, trans: 0.5, glow: 1.2, nightBoost: 2 }), vis: 300, col: 0 },
    lantern: { geo: MD.lanternTree(3), mat: litMaterial({ sway: 0.22, wrap: 0.45, glow: 1.5, nightBoost: 0.8 }), vis: 9999, reflect: true, col: 0.3 },
    fern: { geo: MD.veilFern(7), mat: litMaterial({ double: true, sway: 0.1, wrap: 0.6, trans: 1.1, glow: 1.0, nightBoost: 2 }), vis: 190, col: 0 },
    caps: { geo: MD.glowCaps(4), mat: litMaterial({ wrap: 0.5, glow: 1.0, nightBoost: 1.6 }), vis: 150, col: 0 },
    boulder: { geo: MD.boulder(2), mat: litMaterial({ wrap: 0.12, spec: 0.1, shin: 20 }), vis: 420, col: 0.85, walk: true },
    spire: { geo: MD.rockSpire(6), mat: litMaterial({ wrap: 0.1 }), vis: 9999, reflect: true, col: 0.15 },
    bulb: { geo: MD.emberBulb(8), mat: litMaterial({ sway: 0.03, wrap: 0.4, glow: 1.8, nightBoost: 1.4 }), vis: 240, col: 0.36 },
    floater: { geo: MD.boulder(9), mat: litMaterial({ wrap: 0.2, bob: 0.9, glow: 1.2, rim: 0.22, rimCol: 0x40fff0 }), vis: 9999, reflect: true, col: 0 },
  };
}

// Placement rules. density(ctx) returns acceptance probability for a jittered
// grid candidate; ctx carries biome weights, slope, height and noise masks.
function rulesFor(planet) {
  if (planet === 'korr') {
    return [
      { kind: 'boulder', spacing: 9, scale: [0.4, 2.6, 2.2], sink: 0.2, density: (c) => 0.18 + c.slope * 0.5 + c.wE * 0.35, tint: (c, r) => { const v = 0.35 + r() * 0.3; return [v * 1.05, v * 0.92, v * 0.86]; } },
      { kind: 'basalt', spacing: 24, scale: [3, 11, 2], sink: 0.4, maxSlope: 0.4, density: (c) => c.wM * 0.5 * smoothstep(0.1, 0.5, c.n1) + 0.03, tint: () => [0.6, 0.58, 0.62] },
      { kind: 'ore', spacing: 13, scale: [0.8, 3.4, 2.5], sink: 0.1, density: (c) => c.wC * 0.55, tint: (c, r) => [0.5, 0.6 + r() * 0.2, 1.8] },
      { kind: 'slag', spacing: 10, scale: [0.5, 1.8, 2], sink: 0.1, minH: 0.1, density: (c) => smoothstep(9, 1, c.h - c.sea) * 0.7, tint: () => [2.4, 0.5, 0.14] },
    ];
  }
  return [
    { kind: 'crystalBig', spacing: 17, scale: [3, 19, 2.1], sink: 0.5, maxSlope: 0.55, density: (c) => c.wC * smoothstep(0.02, 0.4, c.n1) * 0.8 + c.wM * 0.035, tint: (c, r) => (c.wM > 0.5 ? [0.9, 1.05, 1.5] : r() < 0.12 ? [1.5, 0.55, 1.5] : [1, 1, 1]) },
    { kind: 'crystalSmall', spacing: 6.5, scale: [0.4, 2.3, 2], sink: 0.08, density: (c) => c.wC * (0.2 + 0.5 * smoothstep(-0.1, 0.4, c.n1)) + c.wM * 0.03, tint: (c, r) => (c.wM > 0.5 ? [0.9, 1.05, 1.5] : r() < 0.15 ? [1.5, 0.55, 1.5] : [1, 1 + r() * 0.2, 1]) },
    { kind: 'stalk', spacing: 5, scale: [0.8, 1.7, 1.4], sink: 0.05, maxSlope: 0.4, density: (c) => c.wB * (0.07 + 0.75 * smoothstep(7.5, 1.2, c.h) * smoothstep(-0.25, 0.25, c.n2)), tint: (c, r) => { const v = 0.85 + r() * 0.3; return [v, v, v]; } },
    { kind: 'lantern', spacing: 23, scale: [0.85, 1.7, 1.5], sink: 0.25, maxSlope: 0.3, minH: 2.5, density: (c) => c.wB * 0.5 * smoothstep(-0.05, 0.35, c.n1) + c.wC * 0.1 + c.wM * 0.1 * smoothstep(90, 30, c.h), tint: (c, r) => (r() < 0.3 ? [1.3, 0.7, 1.2] : [1, 1, 1]) },
    { kind: 'fern', spacing: 6, scale: [0.7, 1.9, 1.5], sink: 0.02, maxSlope: 0.5, density: (c) => c.wB * 0.3 * smoothstep(-0.3, 0.3, c.n2) + c.wM * 0.1 * smoothstep(100, 30, c.h), tint: (c, r) => { const t = r(); return t < 0.6 ? [1, 1, 1] : t < 0.85 ? [0.45, 0.8, 1.5] : [1.2, 1.0, 0.45]; } },
    { kind: 'caps', spacing: 5.5, scale: [0.7, 2.1, 2], sink: 0.0, density: (c) => (c.wB * 0.22 + c.wC * 0.3 + c.wM * 0.12) * smoothstep(0.0, 0.35, c.n3), tint: (c, r) => { const t = r(); return t < 0.55 ? [1, 1, 1] : t < 0.8 ? [1.6, 0.5, 1.1] : [1.3, 1.1, 0.4]; } },
    { kind: 'boulder', spacing: 10, scale: [0.35, 2.4, 2.6], sink: 0.3, maxSlope: 0.42, density: (c) => 0.08 + c.slope * 0.5 + c.wE * 0.14 + c.wM * 0.1, tint: (c, r) => { const v = 0.8 + r() * 0.4; return c.wE > 0.5 ? [1.15 * v, 0.56 * v, 0.3 * v] : c.wC > 0.5 ? [0.3 * v, 0.24 * v, 0.52 * v] : c.wM > 0.5 ? [0.34 * v, 0.38 * v, 0.5 * v] : [0.4 * v, 0.28 * v, 0.36 * v]; } },
    { kind: 'spire', spacing: 30, scale: [7, 26, 2], sink: 0.6, maxSlope: 0.6, density: (c) => c.wE * 0.42 * smoothstep(0.0, 0.4, c.n1), tint: (c, r) => { const v = 0.85 + r() * 0.3; return [v, v, v]; } },
    { kind: 'bulb', spacing: 10, scale: [0.7, 1.8, 1.5], sink: 0.05, maxSlope: 0.3, density: (c) => c.wE * 0.34 * smoothstep(-0.2, 0.3, c.n2), tint: () => [1, 1, 1] },
    { kind: 'floater', spacing: 34, scale: [1.5, 6, 2], sink: 0, lift: [9, 38], density: (c) => c.wC * 0.5 * smoothstep(0.0, 0.3, c.n3), tint: () => [0.22, 0.18, 0.4] },
  ];
}

function coverFor(planet) {
  if (planet === 'korr') return null;
  const mk = (geo) => ({ geo });
  return {
    basin: mk(MD.tendrilClump(1, 7)),
    crystal: mk(MD.shardTuft(2)),
    mesa: mk(MD.tendrilClump(3, 5, { base: [0.2, 0.12, 0.05], tip: [0.8, 0.58, 0.28], glow: 0, h: 0.42, w: 0.04, spread: 0.2 })),
    mount: mk(MD.tendrilClump(4, 5, { base: [0.03, 0.06, 0.09], tip: [0.45, 0.8, 0.95], glow: 0.18, h: 0.34, w: 0.06 })),
  };
}

export class Flora {
  constructor(gfx, terrain, def, colliders) {
    this.gfx = gfx; this.terrain = terrain; this.def = def;
    this.group = new THREE.Group();
    this.meshes = [];
    this.kinds = kindsFor(def.kind);
    this.noise = new Noise(def.seed + 555);
    this.frame = 0;
    this._scatter(colliders);
    this.cover = coverFor(def.kind);
    this.coverCells = new Map();
    if (this.cover) {
      this.coverR = 52;
      this.coverMat = litMaterial({ double: true, upn: true, sway: 0.13, fade: [this.coverR * 0.62, this.coverR], wrap: 0.5, trans: 0.2, glow: 0.8, nightBoost: 3.5 });
    }
  }

  _scatter(colliders) {
    const { terrain, def } = this;
    const half = terrain.half, sea = terrain.sea;
    const rules = rulesFor(def.kind);
    const buckets = new Map();
    const sp = [0, 0, 0, 0];
    const nrm = new THREE.Vector3();
    const N = this.noise;
    const ctx = { x: 0, z: 0, h: 0, sea, wB: 0, wC: 0, wE: 0, wM: 0, slope: 0, n1: 0, n2: 0, n3: 0 };
    const pois = Object.values(def.pois);
    rules.forEach((rule, ri) => {
      const s = rule.spacing;
      const n = Math.floor((half * 2 - 40) / s);
      for (let gz = 0; gz < n; gz++) {
        for (let gx = 0; gx < n; gx++) {
          const x = -half + 20 + (gx + hash2(gx, gz, ri * 7 + 1)) * s;
          const z = -half + 20 + (gz + hash2(gx, gz, ri * 7 + 2)) * s;
          const h = terrain.heightAt(x, z);
          if (h < sea + (rule.minH ?? 0.7)) continue;
          terrain.splatAt(x, z, sp);
          if (sp[3] > 0.25) continue;
          let skip = false;
          for (const p of pois) {
            if (p.flat === undefined) continue;
            const dx = x - p.x, dz = z - p.z;
            if (dx * dx + dz * dz < p.r * p.r * 1.1) { skip = true; break; }
          }
          if (skip) continue;
          terrain.normalAt(x, z, nrm);
          const slope = 1 - nrm.y;
          if (slope > (rule.maxSlope ?? 0.7)) continue;
          ctx.x = x; ctx.z = z; ctx.h = h; ctx.slope = slope;
          ctx.wC = sp[0]; ctx.wE = sp[1]; ctx.wM = sp[2]; ctx.wB = Math.max(0, 1 - sp[0] - sp[1] - sp[2]);
          ctx.n1 = N.fbm(x / 130 + ri * 3.1, z / 130, 3);
          ctx.n2 = N.fbm(x / 55 - ri * 1.7, z / 55 + 4, 2);
          ctx.n3 = N.pnoise(x / 28 + 9, z / 28 - ri);
          if (hash2(gx, gz, ri * 7 + 3) > rule.density(ctx)) continue;
          let k = 0;
          const rnd = () => hash2(gx * 31 + (k++), gz * 17 + k, ri * 7 + 4);
          const sc = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * Math.pow(rnd(), rule.scale[2]);
          const tint = rule.tint(ctx, rnd);
          const lift = rule.lift ? rule.lift[0] + rnd() * (rule.lift[1] - rule.lift[0]) : 0;
          const y = h - rule.sink * sc * (0.5 + slope) + lift;
          const rot = rnd() * Math.PI * 2;
          const sx = Math.floor((x + half) / SECTOR), sz = Math.floor((z + half) / SECTOR);
          const key = rule.kind + ':' + sx + ':' + sz;
          let b = buckets.get(key);
          if (!b) { b = { kind: rule.kind, sx, sz, items: [] }; buckets.set(key, b); }
          b.items.push(x, y, z, rot, sc, tint[0], tint[1], tint[2], (rnd() - 0.5) * 0.25);
          const kd = this.kinds[rule.kind];
          if (colliders && kd.col > 0 && !rule.lift && sc * kd.col > 0.5) {
            colliders.addCircle(x, z, sc * kd.col, y + sc * (kd.walk ? 0.72 : 30), { walk: !!kd.walk });
          }
        }
      }
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
    this.instanceCount = 0;
    for (const b of buckets.values()) {
      const kd = this.kinds[b.kind];
      const n = b.items.length / 9;
      const mesh = new THREE.InstancedMesh(kd.geo, kd.mat, n);
      for (let i = 0; i < n; i++) {
        const o = i * 9;
        p.set(b.items[o], b.items[o + 1], b.items[o + 2]);
        e.set(b.items[o + 8], b.items[o + 3], b.items[o + 8] * 0.7, 'YXZ');
        q.setFromEuler(e);
        const sc = b.items[o + 4];
        s3.set(sc, sc * (0.9 + 0.2 * hash2(i, b.sx, b.sz)), sc);
        m4.compose(p, q, s3);
        mesh.setMatrixAt(i, m4);
        col.setRGB(b.items[o + 5], b.items[o + 6], b.items[o + 7]);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      mesh.userData.vis = kd.vis;
      mesh.userData.cx = -this.terrain.half + (b.sx + 0.5) * SECTOR;
      mesh.userData.cz = -this.terrain.half + (b.sz + 0.5) * SECTOR;
      if (kd.reflect) mesh.layers.enable(1);
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.instanceCount += n;
    }
  }

  _fillCover(cx, cz) {
    const { terrain } = this;
    const dens = this.gfx.q.flora;
    const x0 = cx * COVER_CELL, z0 = cz * COVER_CELL;
    const sp = [0, 0, 0, 0];
    terrain.splatAt(x0 + COVER_CELL / 2, z0 + COVER_CELL / 2, sp);
    const wB = Math.max(0, 1 - sp[0] - sp[1] - sp[2]);
    let variant = 'basin', best = wB;
    if (sp[0] > best) { variant = 'crystal'; best = sp[0]; }
    if (sp[1] > best) { variant = 'mesa'; best = sp[1]; }
    if (sp[2] > best) { variant = 'mount'; best = sp[2]; }
    const baseN = variant === 'basin' ? 900 : variant === 'crystal' ? 420 : variant === 'mount' ? 240 : 150;
    const max = Math.round(baseN * dens);
    const data = [];
    const nrm = new THREE.Vector3();
    for (let i = 0; i < max; i++) {
      const x = x0 + hash2(cx * 13 + i, cz * 7, 11) * COVER_CELL, z = z0 + hash2(cx * 5, cz * 11 + i, 12) * COVER_CELL;
      const h = terrain.heightAt(x, z);
      if (h < terrain.sea + 0.5) continue;
      terrain.splatAt(x, z, sp);
      if (sp[3] > 0.45) continue;
      terrain.normalAt(x, z, nrm);
      if (nrm.y < 0.72) continue;
      const patch = this.noise.fbm(x / 17, z / 17, 2);
      const r1 = hash2(cx + i * 3, cz - i, 13);
      if (r1 > 0.62 + patch * 1.1) continue;
      const hue = this.noise.pnoise(x / 40 + 3, z / 40);
      data.push(x, h, z, r1 * 6.283, 0.7 + hash2(i, cx, cz) * 0.9, hue, nrm.x, nrm.z);
    }
    const n = data.length / 8;
    if (!n) return null;
    const mesh = new THREE.InstancedMesh(this.cover[variant].geo, this.coverMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      p.set(data[o], data[o + 1], data[o + 2]);
      e.set(data[o + 7] * -0.6, data[o + 3], data[o + 6] * 0.6, 'YXZ');
      q.setFromEuler(e);
      const sc = data[o + 4];
      s3.set(sc, sc * 1.1, sc);
      m4.compose(p, q, s3);
      mesh.setMatrixAt(i, m4);
      const hue = data[o + 5];
      if (variant === 'basin') {
        if (hue > 0.18) col.setRGB(1.6, 0.42, 1.0); else if (hue < -0.25) col.setRGB(1.25, 1.0, 0.4); else col.setRGB(1, 1, 1);
      } else col.setRGB(1, 1, 1);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  update(camPos, focus) {
    this.frame++;
    if (this.frame % 8 === 1) {
      const ds = this.gfx.q.drawDist;
      for (const m of this.meshes) {
        const d = Math.hypot(camPos.x - m.userData.cx, camPos.z - m.userData.cz) - SECTOR * 0.71;
        m.visible = d < m.userData.vis * ds;
      }
    }
    if (!this.cover) return;
    const f = focus || camPos;
    const R = this.coverR;
    const ccx = Math.floor(f.x / COVER_CELL), ccz = Math.floor(f.z / COVER_CELL);
    const cr = Math.ceil(R / COVER_CELL) + 1;
    if (this._ccx !== ccx || this._ccz !== ccz) {
      this._ccx = ccx; this._ccz = ccz;
      this._want = [];
      for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        const d = Math.hypot((cx + 0.5) * COVER_CELL - f.x, (cz + 0.5) * COVER_CELL - f.z);
        if (d < R + COVER_CELL * 0.75) this._want.push({ cx, cz, d, key: cx + ':' + cz });
      }
      this._want.sort((a, b) => a.d - b.d);
      const keep = new Set(this._want.map((w) => w.key));
      for (const [k, m] of this.coverCells) {
        if (!keep.has(k)) { if (m) { this.group.remove(m); m.dispose(); } this.coverCells.delete(k); }
      }
    }
    // build at most a couple of cells per frame to avoid hitches
    let budget = 2;
    for (const w of this._want) {
      if (budget <= 0) break;
      if (this.coverCells.has(w.key)) continue;
      const m = this._fillCover(w.cx, w.cz);
      this.coverCells.set(w.key, m);
      if (m) this.group.add(m);
      budget--;
    }
  }

  // Force all nearby ground cover to exist (used before screenshots / on spawn).
  warm(focus) {
    for (let i = 0; i < 80; i++) this.update(focus, focus);
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    for (const m of this.coverCells.values()) if (m) m.dispose();
    for (const k in this.kinds) { this.kinds[k].geo.dispose(); this.kinds[k].mat.dispose(); }
    if (this.cover) { for (const k in this.cover) this.cover[k].geo.dispose(); this.coverMat.dispose(); }
  }
}
