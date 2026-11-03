// Wildlife: deer in the woods, chickens around farms, cows & horses in pastures.
// Hunt them for raw meat (cook it at a campfire!).
import * as THREE from 'three';
import { M } from './character.js';
import { RNG } from '../core/rng.js';
import { dampAngle } from '../core/math.js';
import { SURF } from '../world/worldgen.js';

function deerMesh(scale = 1, color = 0x9a6a3a) {
  const g = new THREE.Group();
  const body = M(color), light = M(0xe8d8c0), dark = M(0x3a2a1a);
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), body); b.rotation.x = Math.PI / 2; b.position.y = 1.0; g.add(b);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.45, 3, 6), body); neck.position.set(0, 1.35, 0.6); neck.rotation.x = -0.6; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), body); head.scale.set(1, 1, 1.6); head.position.set(0, 1.62, 0.78); g.add(head);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), light); tail.position.set(0, 1.12, -0.62); g.add(tail);
  g.legs = [];
  for (const [x, z] of [[-0.18, 0.42], [0.18, 0.42], [-0.18, -0.42], [0.18, -0.42]]) { const l = new THREE.Group(); l.position.set(x, 0.85, z); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.85, 5), body); m.position.y = -0.42; l.add(m); const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), dark); h.position.y = -0.84; l.add(h); g.add(l); g.legs.push(l); }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function chickenMesh() {
  const g = new THREE.Group();
  const w = M(0xf0ece0), r = M(0xd03a2a), y = M(0xe8b030);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), w); b.scale.set(1, 0.9, 1.3); b.position.y = 0.32; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), w); h.position.set(0, 0.52, 0.18); g.add(h);
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.1), r); c.position.set(0, 0.63, 0.18); g.add(c);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), y); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.5, 0.3); g.add(bk);
  g.legs = [];
  for (const x of [-0.06, 0.06]) { const l = new THREE.Group(); l.position.set(x, 0.18, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 4), y); m.position.y = -0.09; l.add(m); g.add(l); g.legs.push(l); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const KINDS = {
  deer: { hp: 60, speed: 8.5, wander: 1.2, meat: ['rawmeat', 2], make: () => deerMesh(1), r: 0.55, h: 1.5, flee: 32 },
  cow: { hp: 140, speed: 3.2, wander: 0.6, meat: ['rawmeat', 3], make: () => deerMesh(1.35, [0x2a2a2a, 0x7a4a2a, 0xe8e0d0][Math.floor(Math.random() * 3)]), r: 0.8, h: 1.8, flee: 8 },
  horse: { hp: 120, speed: 9, wander: 0.8, meat: ['rawmeat', 3], make: () => deerMesh(1.45, [0x5a3a22, 0x2a1a10, 0x8a6a4a][Math.floor(Math.random() * 3)]), r: 0.8, h: 2, flee: 18 },
  chicken: { hp: 15, speed: 4.5, wander: 0.9, meat: ['rawchicken', 1], make: chickenMesh, r: 0.25, h: 0.6, flee: 7 },
};

export class Animals {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.group = new THREE.Group();
    this.group.name = 'animals';
    this.rng = new RNG(G.seed + 3);
    this.spawnT = 0;
    this.max = 16;
  }
  spawnAround(px, pz) {
    const G = this.G, w = G.world;
    for (let t = 0; t < 8 && this.list.length < this.max; t++) {
      const a = this.rng.next() * Math.PI * 2, r = this.rng.range(70, 180);
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (x < 50 || z < 50 || x > 3800 || z > 2900 || w.isWater(x, z) || w.coastAt(x, z) < 20) continue;
      const s = w.sampleGrid(w.surf, x, z);
      let kind = null;
      const field = w.fields.find((f) => f.crop === 'pasture' && Math.hypot(f.x - x, f.z - z) < Math.min(f.w, f.d) / 2);
      if (field) kind = field.animals || (this.rng.chance(0.5) ? 'cow' : null);
      else if (s === SURF.FOREST || (s === SURF.GRASS && this.rng.chance(0.3))) kind = this.rng.chance(0.85) ? 'deer' : null;
      else if (w.buildings.some((b) => (b.kind === 'barn' || b.kind === 'farmhouse') && Math.hypot(b.x - x, b.z - z) < 40)) kind = 'chicken';
      if (!kind) continue;
      const n = kind === 'chicken' ? this.rng.int(2, 4) : kind === 'deer' ? this.rng.int(1, 3) : this.rng.int(2, 4);
      for (let k = 0; k < n && this.list.length < this.max; k++) this.spawn(kind, x + this.rng.range(-4, 4), z + this.rng.range(-4, 4), field);
    }
  }
  spawn(kind, x, z, field) {
    const K = KINDS[kind];
    const mesh = K.make();
    const a = { kind, K, mesh, pos: new THREE.Vector3(x, this.G.world.heightAt(x, z), z), yaw: this.rng.next() * 6.28, hp: K.hp, state: 'idle', t: this.rng.range(0, 4), goal: null, field, phase: 0, dead: 0, vel: 0 };
    mesh.position.copy(a.pos);
    this.group.add(mesh);
    this.list.push(a);
  }
  update(dt) {
    const G = this.G, P = G.player;
    if (P.mode !== 'ground' && P.mode !== 'dead') return;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 6; if (this.list.length < this.max) this.spawnAround(P.pos.x, P.pos.z); }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      const dP = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z);
      if (dP > 260) { this.group.remove(a.mesh); this.list.splice(i, 1); continue; }
      if (a.hp <= 0) { a.dead += dt; a.mesh.rotation.z = Math.min(1.5, a.dead * 3); if (a.dead > 40) { this.group.remove(a.mesh); this.list.splice(i, 1); } continue; }
      a.t -= dt;
      // flee from survivors and zombies
      let threat = null, td = a.K.flee;
      for (const s of G.survivors) { if (!s.alive || !s.physical) continue; const d = Math.hypot(s.pos.x - a.pos.x, s.pos.z - a.pos.z); if (d < td * (s.crouch ? 0.5 : 1)) { td = d; threat = s.pos; } }
      for (const z of G.zombies.list) { if (z.state === 'dead') continue; const d = Math.hypot(z.pos.x - a.pos.x, z.pos.z - a.pos.z); if (d < td) { td = d; threat = z.pos; } }
      let speed = 0;
      if (threat || a.scared > 0) {
        a.scared = threat ? 3 : a.scared - dt;
        if (threat) a.fleeDir = Math.atan2(a.pos.x - threat.x, a.pos.z - threat.z);
        a.yaw = dampAngle(a.yaw, a.fleeDir ?? a.yaw, 6, dt);
        speed = a.K.speed;
      } else if (a.t <= 0) {
        a.t = this.rng.range(2, 7);
        a.state = this.rng.chance(0.5) ? 'walk' : 'idle';
        a.yaw += this.rng.range(-1.5, 1.5);
      } else if (a.state === 'walk') speed = a.K.wander;
      const nx = a.pos.x + Math.sin(a.yaw) * speed * dt, nz = a.pos.z + Math.cos(a.yaw) * speed * dt;
      if (!G.world.isWater(nx, nz) && (!a.field || a.kind === 'deer' || Math.hypot(nx - a.field.x, nz - a.field.z) < Math.min(a.field.w, a.field.d) / 2 - 3 || threat)) { a.pos.x = nx; a.pos.z = nz; }
      else a.yaw += Math.PI * 0.7;
      a.pos.y = G.physics.groundAt(a.pos.x, a.pos.z, a.pos.y + 0.8, 0.2);
      a.phase += dt * speed * 2.2;
      a.mesh.position.copy(a.pos);
      a.mesh.rotation.y = a.yaw;
      const legs = a.mesh.legs;
      for (let k = 0; k < legs.length; k++) legs[k].rotation.x = Math.sin(a.phase + (k % 2 ? Math.PI : 0) + (k > 1 ? Math.PI / 2 : 0)) * (speed > 0.1 ? 0.6 : 0);
    }
  }
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = null;
    for (const a of this.list) {
      if (a.hp <= 0) continue;
      const cx = a.pos.x, cy = a.pos.y + a.K.h * 0.6, cz = a.pos.z, r = a.K.r + 0.2;
      const px = ox - cx, py = oy - cy, pz = oz - cz;
      const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t >= 0 && t < best) { best = t; hit = { t, animal: a, part: 'body' }; }
    }
    return hit;
  }
  damage(a, dmg) {
    if (a.hp <= 0) return;
    a.hp -= dmg;
    a.scared = 5;
    if (a.hp <= 0) {
      const [id, n] = a.K.meat;
      for (let k = 0; k < n; k++) this.G.inter.dropItem({ id, n: 1, r: 0 }, a.pos.x, a.pos.y + 0.5, a.pos.z);
      this.G.audio?.play('hit_flesh', a.pos, { vol: 0.7 });
    }
  }
  explosion(x, y, z, r, dmg) { for (const a of this.list) if (Math.hypot(a.pos.x - x, a.pos.z - z) < r) this.damage(a, dmg); }
}
