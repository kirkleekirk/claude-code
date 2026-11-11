import * as THREE from 'three';
import { litMaterial } from '../gfx/materials.js';
import { hash2, smoothstep, Noise } from '../core/noise.js';
import { nodeGeometry } from './structures.js';

export const NODE_TYPES = {
  scrap: { hand: 'Salvage', label: 'Gate Scrap', item: 'scrap', n: [1, 1], hp: 10, scale: [0.9, 1.3], respawn: 0, radius: 0.6, tall: 0.6 },
  ferrite: { label: 'Ferrite Deposit', item: 'ferrite', n: [2, 3], hp: 36, scale: [0.9, 1.5], respawn: 240, radius: 0.85, tall: 0.9 },
  lumen: { label: 'Lumen Crystal', item: 'lumen', n: [1, 2], hp: 26, scale: [0.8, 1.3], respawn: 240, radius: 0.6, tall: 1.3, gem: true },
  pod: { hand: 'Pick', label: 'Breather Pod', item: 'pod', n: [1, 2], hp: 12, scale: [0.8, 1.25], respawn: 180, radius: 0.5, tall: 1.3, sway: true, extra: ['fiber', 0.3] },
  bloom: { hand: 'Pick', label: 'Aether Bloom', item: 'bloom', n: [1, 1], hp: 9, scale: [0.85, 1.3], respawn: 200, radius: 0.4, tall: 0.9, sway: true },
  reed: { hand: 'Cut', label: 'Sinew Reed', item: 'fiber', n: [2, 3], hp: 12, scale: [0.8, 1.3], respawn: 160, radius: 0.45, tall: 1.6, sway: true },
  emberglass: { label: 'Emberglass', item: 'emberglass', n: [1, 2], hp: 40, scale: [0.9, 1.5], respawn: 300, radius: 0.6, tall: 1.0, gem: true },
  korrite: { label: 'Korrite Ore', item: 'korrite', n: [2, 3], hp: 50, scale: [0.9, 1.6], respawn: 300, radius: 0.9, tall: 1.0 },
  voltite: { label: 'Voltite', item: 'voltite', n: [1, 2], hp: 42, scale: [0.8, 1.4], respawn: 300, radius: 0.6, tall: 1.4, gem: true },
  heliox: { label: 'Heliox Geode', item: 'heliox', n: [1, 1], hp: 85, scale: [1.0, 1.4], respawn: 600, radius: 0.7, tall: 1.2 },
};

function rules(kind) {
  if (kind === 'korr') {
    return [
      { type: 'korrite', spacing: 19, density: (c) => 0.3 + c.wC * 0.25 },
      { type: 'voltite', spacing: 21, density: (c) => 0.1 + c.wC * 0.55 },
      { type: 'heliox', spacing: 55, density: (c) => (c.far > 110 ? 0.16 + c.wE * 0.6 : 0) },
    ];
  }
  return [
    { type: 'ferrite', spacing: 24, density: (c) => c.wB * 0.3 + c.wE * 0.36 + c.wM * 0.3 + c.wC * 0.16 },
    { type: 'lumen', spacing: 21, density: (c) => c.wC * 0.62 + c.wB * 0.22 + c.wM * 0.15 },
    { type: 'pod', spacing: 9, density: (c) => c.wB * smoothstep(8.5, 1.4, c.h) * 0.55 },
    { type: 'bloom', spacing: 15, density: (c) => c.wB * 0.3 + c.wC * 0.34 + c.wM * 0.15 },
    { type: 'reed', spacing: 13, density: (c) => c.wB * (0.22 + 0.4 * smoothstep(7, 2, c.h)) + c.wM * 0.1 },
    { type: 'emberglass', spacing: 21, density: (c) => c.wE * 0.55 },
  ];
}

export class Nodes {
  constructor(game, world) {
    this.game = game; this.world = world;
    this.group = new THREE.Group();
    this.list = [];
    this.grid = new Map();
    this.meshes = {};
    this.time = 0;
    const def = world.def, terrain = world.terrain;
    const half = terrain.half;
    const sp = [0, 0, 0, 0], nrm = new THREE.Vector3();
    const land = def.pois.landing;
    const add = (type, x, z, seed) => {
      const T = NODE_TYPES[type];
      const h = terrain.heightAt(x, z);
      const sc = T.scale[0] + (T.scale[1] - T.scale[0]) * hash2(seed, 3, 9);
      this.list.push({ type, T, x, y: h - 0.04, z, scale: sc, rot: hash2(seed, 5, 9) * 6.283, hp: T.hp, alive: true, respawnAt: 0, idx: 0, col: null, wob: 0 });
    };
    rules(def.kind).forEach((rule, ri) => {
      const s = rule.spacing;
      const n = Math.floor((half * 2 - 60) / s);
      const ctx = { h: 0, wB: 0, wC: 0, wE: 0, wM: 0, far: 0 };
      for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
        const x = -half + 30 + (gx + hash2(gx, gz, ri * 5 + 41)) * s, z = -half + 30 + (gz + hash2(gx, gz, ri * 5 + 42)) * s;
        const h = terrain.heightAt(x, z);
        if (h < world.sea + 0.8) continue;
        terrain.normalAt(x, z, nrm);
        if (nrm.y < 0.8) continue;
        terrain.splatAt(x, z, sp);
        ctx.h = h; ctx.wC = sp[0]; ctx.wE = sp[1]; ctx.wM = sp[2]; ctx.wB = Math.max(0, 1 - sp[0] - sp[1] - sp[2]);
        ctx.far = Math.hypot(x - land.x, z - land.z);
        if (ctx.far < land.r * 0.8) continue;
        let near = false;
        for (const k in def.pois) { const p = def.pois[k]; if (k !== 'landing' && p.flat !== undefined && Math.hypot(x - p.x, z - p.z) < p.r) near = true; }
        if (near) continue;
        if (hash2(gx, gz, ri * 5 + 43) > rule.density(ctx)) continue;
        add(rule.type, x, z, gx * 131 + gz * 17 + ri);
      }
    });
    // guaranteed starter resources around the landing site
    if (def.kind === 'veyra') {
      for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283 + 0.3, d = 8 + (i % 3) * 4.5; add('scrap', land.x + Math.cos(a) * d, land.z + Math.sin(a) * d, 900 + i); }
      for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + 1.1, d = 44 + (i % 3) * 13; add(i % 2 ? 'lumen' : 'ferrite', land.x + Math.cos(a) * d, land.z + Math.sin(a) * d, 950 + i); }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.4; add('reed', land.x + Math.cos(a) * 38, land.z + Math.sin(a) * 38, 990 + i); }
    } else {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283, d = 48 + (i % 2) * 16; add(i % 2 ? 'voltite' : 'korrite', land.x + Math.cos(a) * d, land.z + Math.sin(a) * d, 700 + i); }
    }
    // instanced meshes
    const byType = {};
    for (const nd of this.list) (byType[nd.type] = byType[nd.type] || []).push(nd);
    for (const type in byType) {
      const T = NODE_TYPES[type], arr = byType[type];
      const mat = litMaterial({ wrap: 0.35, glow: 1.5, nightBoost: 0.8, spec: 0.7, shin: 50, rim: 0.35, rimCol: 0xffffff, gem: !!T.gem, sway: T.sway ? 0.1 : 0, double: !!T.sway, metal: type === 'korrite' ? 0.35 : type === 'scrap' ? 0.15 : 0 });
      const mesh = new THREE.InstancedMesh(nodeGeometry(type), mat, arr.length);
      mesh.frustumCulled = false;
      arr.forEach((nd, i) => {
        nd.idx = i;
        if (world.colliders && T.radius > 0.55) nd.col = world.colliders.addCircle(nd.x, nd.z, T.radius * nd.scale * 0.8, nd.y + T.tall * nd.scale, { walk: false });
        const k = this._key(nd.x, nd.z);
        let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(nd);
      });
      this.meshes[type] = mesh;
      arr.forEach((nd) => this._place(nd));
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  _key(x, z) { return (Math.floor(x / 24) + 512) * 2048 + (Math.floor(z / 24) + 512); }

  _place(nd) {
    const s = nd.alive ? nd.scale * (1 + nd.wob * 0.12) : 0.0001;
    _q.setFromAxisAngle(_up, nd.rot + nd.wob * 0.3);
    _m.compose(_p.set(nd.x, nd.y, nd.z), _q, _s.set(s, s * (1 - nd.wob * 0.1), s));
    this.meshes[nd.type].setMatrixAt(nd.idx, _m);
    this.meshes[nd.type].instanceMatrix.needsUpdate = true;
  }

  near(x, z, r, out = []) {
    out.length = 0;
    const c = Math.ceil(r / 24);
    const cx = Math.floor(x / 24), cz = Math.floor(z / 24);
    for (let dz = -c; dz <= c; dz++) for (let dx = -c; dx <= c; dx++) {
      const a = this.grid.get((cx + dx + 512) * 2048 + (cz + dz + 512));
      if (a) for (const nd of a) if (nd.alive && Math.hypot(nd.x - x, nd.z - z) < r) out.push(nd);
    }
    return out;
  }

  // Ray pick; returns the closest living node along the ray within maxDist.
  pick(origin, dir, maxDist, slack = 0.35) {
    let best = null, bestT = maxDist;
    const cand = this.near(origin.x + dir.x * maxDist * 0.5, origin.z + dir.z * maxDist * 0.5, maxDist * 0.5 + 3, _cand);
    for (const nd of cand) {
      const cy = nd.y + nd.T.tall * nd.scale * 0.5, rr = Math.max(nd.T.radius, nd.T.tall * 0.5) * nd.scale + slack;
      const ox = nd.x - origin.x, oy = cy - origin.y, oz = nd.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = ox - dir.x * t, py = oy - dir.y * t, pz = oz - dir.z * t;
      if (px * px + py * py + pz * pz < rr * rr) { best = nd; bestT = t; }
    }
    return best;
  }

  center(nd, out) { return out.set(nd.x, nd.y + nd.T.tall * nd.scale * 0.5, nd.z); }

  mine(nd, amount) {
    if (!nd.alive) return false;
    nd.hp -= amount;
    nd.wob = 1;
    if (nd.hp <= 0) {
      nd.alive = false;
      nd.respawnAt = nd.T.respawn > 0 ? this.time + nd.T.respawn : Infinity;
      if (nd.col) nd.col.dead = true;
      const g = this.game, c = this.center(nd, new THREE.Vector3());
      const n = nd.T.n[0] + Math.floor(Math.random() * (nd.T.n[1] - nd.T.n[0] + 1));
      for (let i = 0; i < n; i++) g.combat.spawnLoot(c, nd.T.item);
      if (nd.T.extra && Math.random() < nd.T.extra[1]) g.combat.spawnLoot(c, nd.T.extra[0]);
      g.particles.burst(c, 22, 5, 0.6, 0.9, 0.7, 1, 0.95, { gravity: 7 });
      g.audio.play('break');
      this._place(nd);
      return true;
    }
    return false;
  }

  update(dt) {
    this.time += dt;
    this._tick = (this._tick || 0) + 1;
    for (let i = 0; i < this.list.length; i++) {
      const nd = this.list[i];
      if (nd.wob > 0) { nd.wob = Math.max(0, nd.wob - dt * 6); if (nd.alive) this._place(nd); }
      if (!nd.alive && this.time >= nd.respawnAt && (this._tick + i) % 60 === 0) {
        const p = this.game.player.pos;
        if (Math.hypot(p.x - nd.x, p.z - nd.z) > 50) { nd.alive = true; nd.hp = nd.T.hp; if (nd.col) nd.col.dead = false; this._place(nd); }
      }
    }
  }

  dispose() { for (const k in this.meshes) { this.meshes[k].geometry.dispose(); this.meshes[k].material.dispose(); this.meshes[k].dispose(); } }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _cand = [];
