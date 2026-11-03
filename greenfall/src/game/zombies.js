// The dead. Rendered with instanced body parts (one draw call per part for every zombie),
// driven by a lightweight AI: wander → hear/see → investigate → chase → attack, breaking
// doors, barricades and builds, vaulting through windows and following building nav graphs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { torsoGeo, pelvisGeo } from './character.js';
import { COL } from '../world/buildings.js';
import { clamp, lerp, wrapAngle, dampAngle } from '../core/math.js';
import { RNG } from '../core/rng.js';

const TYPES = {
  walker: { hp: 100, speed: 1.35, nightSpeed: 2.3, chase: 2.6, nightChase: 3.6, dmg: 13, struct: 14, scale: 1, sight: 26 },
  runner: { hp: 75, speed: 1.8, nightSpeed: 2.6, chase: 5.0, nightChase: 6.2, dmg: 9, struct: 10, scale: 0.95, sight: 30 },
  brute: { hp: 420, speed: 1.2, nightSpeed: 1.8, chase: 2.4, nightChase: 3.0, dmg: 32, struct: 75, scale: 1.38, sight: 22 },
};
const SKINS = [0x7f9a72, 0x8aa07c, 0x6f8a62, 0x97a585, 0x7a8f78, 0x8c9a6a];
const SHIRTS = [0x5a4a3a, 0x3a4a5a, 0x6a3a32, 0x4a5a3a, 0x7a6a50, 0x3a3a3a, 0x6a5a7a, 0x8a7a5a, 0x5a6a6a, 0x7a4a2a];
const PANTS = [0x2e3a4e, 0x3a3428, 0x4a4a3a, 0x2a2a2a, 0x5a4a3a, 0x3a4a5a];

const PARTS = ['pelvis', 'torso', 'head', 'uaL', 'uaR', 'faL', 'faR', 'thL', 'thR', 'shL', 'shR', 'eyes', 'hair'];

export class Zombies {
  constructor(G, max = 80) {
    this.G = G;
    this.max = max;
    this.list = [];
    this.pool = [];
    this.rng = new RNG(777);
    for (let i = 0; i < max; i++) this.pool.push(this.makeZombie(i));
    this.group = new THREE.Group();
    this.group.name = 'zombies';
    this.buildMeshes();
    // dummy rig for pose → matrices
    this.rig = this.buildRig();
    this.m4 = new THREE.Matrix4();
    this.col = new THREE.Color();
    this.killedTotal = 0;
    this.groanT = 0;
  }
  makeZombie(i) {
    return { idx: i, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, hp: 100, maxHp: 100, type: 'walker', state: 'idle', stateT: 0,
      target: null, tpos: new THREE.Vector3(), phase: Math.random() * 10, atkCd: 0, atkT: -1, horde: null, stuckT: 0, lastPos: new THREE.Vector3(), senseT: Math.random() * 0.5,
      path: null, pathI: 0, rise: 0, dieT: 0, burn: 0, scale: 1, side: 0, sideT: 0, alertT: 0, vaultT: 0, vaultFrom: null, vaultTo: null, building: -1, smash: null, yv: 0, stagger: 0, onGround: true };
  }
  buildMeshes() {
    const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
    const geos = {
      pelvis: pelvisGeo(), torso: torsoGeo(0.95), head: (() => { const g = new THREE.SphereGeometry(0.16, 14, 10); g.scale(1, 1.1, 1.05); return g; })(),
      uaL: cap(0.07, 0.22), uaR: cap(0.07, 0.22), faL: cap(0.06, 0.22), faR: cap(0.06, 0.22), thL: cap(0.095, 0.3), thR: cap(0.095, 0.3), shL: cap(0.08, 0.29), shR: cap(0.08, 0.29),
      eyes: (() => { const a = new THREE.SphereGeometry(0.028, 6, 5); a.translate(-0.055, 0.02, 0.145); const b = new THREE.SphereGeometry(0.028, 6, 5); b.translate(0.055, 0.02, 0.145); const g = new THREE.BufferGeometry(); const pa = [...a.attributes.position.array, ...b.attributes.position.array]; g.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); g.computeVertexNormals(); return g; })(),
      hair: (() => { const g = new THREE.SphereGeometry(0.168, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45); g.translate(0, 0.02, -0.01); return g; })(),
    };
    // offset capsules so their origin is at the top joint
    for (const k of ['uaL', 'uaR']) geos[k].translate(0, -0.15, 0);
    for (const k of ['faL', 'faR']) geos[k].translate(0, -0.15, 0);
    for (const k of ['thL', 'thR']) geos[k].translate(0, -0.2, 0);
    for (const k of ['shL', 'shR']) geos[k].translate(0, -0.2, 0);
    geos.torso.translate(0, -0.02, 0);
    this.mats = {
      base: new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }),
      eyes: new THREE.MeshStandardMaterial({ color: 0x9aff7a, emissive: 0x7aff5a, emissiveIntensity: 2.2 }),
    };
    this.meshes = {};
    for (const p of PARTS) {
      const m = new THREE.InstancedMesh(geos[p], p === 'eyes' ? this.mats.eyes : this.mats.base, this.max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.castShadow = p !== 'eyes' && p !== 'hair';
      m.frustumCulled = false;
      if (p !== 'eyes') m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes[p] = m;
      this.group.add(m);
    }
  }
  buildRig() {
    const g = () => new THREE.Object3D();
    const R = { root: g() };
    R.root.rotation.order = 'YXZ';
    R.hips = g(); R.hips.position.y = 0.95; R.root.add(R.hips);
    R.pelvis = g(); R.hips.add(R.pelvis);
    R.spine = g(); R.spine.position.y = 0.1; R.hips.add(R.spine);
    R.torso = g(); R.spine.add(R.torso);
    R.chest = g(); R.chest.position.y = 0.48; R.spine.add(R.chest);
    R.neck = g(); R.neck.position.y = 0.08; R.chest.add(R.neck);
    R.head = g(); R.head.position.y = 0.17; R.neck.add(R.head);
    R.eyes = g(); R.head.add(R.eyes);
    R.hair = g(); R.head.add(R.hair);
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      R['ua' + s] = g(); R['ua' + s].position.set(sx * 0.28, 0, 0); R.chest.add(R['ua' + s]);
      R['fa' + s] = g(); R['fa' + s].position.set(0, -0.3, 0); R['ua' + s].add(R['fa' + s]);
      R['th' + s] = g(); R['th' + s].position.set(sx * 0.1, -0.06, 0); R.hips.add(R['th' + s]);
      R['sh' + s] = g(); R['sh' + s].position.set(0, -0.43, 0); R['th' + s].add(R['sh' + s]);
    }
    return R;
  }

  // ---------- spawning ----------
  spawn(x, z, opts = {}) {
    if (!this.pool.length) return null;
    const G = this.G;
    const zb = this.pool.pop();
    const night = G.env?.night > 0.5;
    const r = this.rng;
    const type = opts.type || (r.chance(night ? 0.22 : 0.1) ? 'runner' : r.chance(0.06 + (G.match?.progress || 0) * 0.08) ? 'brute' : 'walker');
    const T = TYPES[type];
    zb.type = type;
    const hpScale = 1 + (G.match?.progress || 0) * 0.4;
    zb.maxHp = zb.hp = Math.round(T.hp * hpScale);
    zb.scale = T.scale * r.range(0.92, 1.08);
    zb.pos.set(x, G.physics.groundAt(x, z, 999), z);
    zb.vel.set(0, 0, 0);
    zb.yaw = r.range(-Math.PI, Math.PI);
    zb.active = true;
    zb.state = opts.state || 'wander';
    zb.stateT = 0;
    zb.target = null;
    zb.tpos.set(x + r.range(-20, 20), 0, z + r.range(-20, 20));
    zb.horde = opts.horde ?? null;
    zb.rise = opts.rise ? 0.001 : 1;
    zb.dieT = 0; zb.burn = 0; zb.atkCd = 1; zb.atkT = -1; zb.path = null; zb.stuckT = 0; zb.alertT = 0; zb.vaultT = 0; zb.building = -1; zb.smash = null; zb.stagger = 0;
    zb.lastPos.copy(zb.pos);
    zb.skin = r.pick(SKINS); zb.shirt = r.pick(SHIRTS); zb.pants = r.pick(PANTS); zb.hair = r.chance(0.6) ? r.pick([0x2a2a20, 0x5a4a3a, 0x8a8a7a, 0x3a2a1a]) : null;
    zb.armPose = r.range(0.7, 1.4);
    if (opts.rise) { G.fx.dirtBurst(x, zb.pos.y, z); G.audio?.play('rise', zb.pos, { vol: 0.6 }); }
    this.list.push(zb);
    return zb;
  }
  release(zb) {
    zb.active = false;
    const i = this.list.indexOf(zb);
    if (i >= 0) this.list.splice(i, 1);
    this.pool.push(zb);
  }
  clear() { while (this.list.length) this.release(this.list[0]); }
  get count() { return this.list.length; }
  aliveCount() { let n = 0; for (const z of this.list) if (z.state !== 'dead') n++; return n; }

  // ---------- senses ----------
  hear(x, z, radius, src, kind) {
    for (const zb of this.list) {
      if (zb.state === 'dead') continue;
      const d = Math.hypot(zb.pos.x - x, zb.pos.z - z);
      if (d > radius) continue;
      if (zb.state === 'chase' && zb.target && zb.target.alive && kind !== 'lure') continue;
      // lures pull strongly; gunshots near make them chase the shooter if visible
      zb.state = 'investigate';
      zb.tpos.set(x + (Math.random() - 0.5) * 6, 0, z + (Math.random() - 0.5) * 6);
      zb.stateT = 0;
      zb.path = null;
      zb.alertT = 12;
      if (src && src.alive && d < radius * 0.35 && kind !== 'lure') { zb.state = 'chase'; zb.target = src; }
    }
  }
  canSee(zb, s) {
    const G = this.G;
    const T = TYPES[zb.type];
    const night = G.env?.night || 0;
    let range = T.sight * lerp(1, 0.62, night);
    if (s.crouch) range *= 0.6;
    if (s.flashlight && night > 0.4) range *= 2.3;
    if (zb.horde) range *= 1.3;
    if (s.sprinting) range *= 1.2;
    const dx = s.pos.x - zb.pos.x, dz = s.pos.z - zb.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 4) {
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - zb.yaw));
      if (ang > 1.15) return false;
    }
    if (Math.abs(s.pos.y - zb.pos.y) > 8) return false;
    return G.physics.lineOfSight(zb.pos.x, zb.pos.y + 1.5 * zb.scale, zb.pos.z, s.pos.x, s.pos.y + 1.3, s.pos.z);
  }

  // ---------- damage ----------
  damage(zb, dmg, src, opts = {}) {
    if (!zb.active || zb.state === 'dead') return;
    if (opts.head) dmg *= 1.5; // aim for the head
    zb.hp -= dmg;
    zb.stagger = Math.max(zb.stagger, opts.melee ? 0.45 : 0.18);
    if (opts.dir && opts.melee) { zb.vel.x += opts.dir[0] * 3; zb.vel.z += opts.dir[1] * 3; }
    if (src && src.alive && zb.state !== 'chase') { zb.state = 'chase'; zb.target = src; zb.path = null; }
    if (zb.hp <= 0) this.kill(zb, src, opts);
    else if (Math.random() < 0.3) this.G.audio?.play('zombie_hurt', zb.pos, { vol: 0.7 });
  }
  kill(zb, src, opts = {}) {
    zb.state = 'dead';
    zb.dieT = 0;
    zb.hp = 0;
    this.killedTotal++;
    if (src) { src.stats.zombieKills++; if (src.isPlayer) this.G.hud.zombieKill(opts.head); }
    this.G.audio?.play('zombie_die', zb.pos, { vol: 0.8 });
    this.G.hordes?.onZombieKilled(zb);
  }
  burnArea(x, z, r, dps, src) {
    for (const zb of this.list) {
      if (zb.state === 'dead') continue;
      if (Math.hypot(zb.pos.x - x, zb.pos.z - z) < r) { zb.burn = 4; this.damage(zb, dps * 0.5, src); }
    }
  }
  explosion(x, y, z, r, dmg, src) {
    for (const zb of [...this.list]) {
      if (zb.state === 'dead') continue;
      const d = Math.hypot(zb.pos.x - x, zb.pos.y + 1 - y, zb.pos.z - z);
      if (d < r) { this.damage(zb, dmg * (1.2 - d / r * 0.7), src, { dir: [(zb.pos.x - x) / (d || 1), (zb.pos.z - z) / (d || 1)], melee: true }); }
    }
  }
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = null;
    for (const zb of this.list) {
      if (zb.state === 'dead' || zb.rise < 0.5) continue;
      const tx = zb.pos.x - ox, tz = zb.pos.z - oz;
      const along = tx * dx + tz * dz;
      if (along < -1 || along > best + 1) continue;
      if (Math.abs(tx * dz - tz * dx) > 1.3) continue;
      const s = zb.scale, by = zb.pos.y + (zb.yv || 0);
      const lean = zb.type === 'runner' ? 0.15 : 0.1;
      const fx = Math.sin(zb.yaw) * lean, fz = Math.cos(zb.yaw) * lean;
      const spheres = [[zb.pos.x + fx * 2, by + 1.6 * s, zb.pos.z + fz * 2, 0.21 * s, 'head'], [zb.pos.x + fx, by + 1.15 * s, zb.pos.z + fz, 0.34 * s, 'body'], [zb.pos.x, by + 0.75 * s, zb.pos.z, 0.3 * s, 'body'], [zb.pos.x, by + 0.35 * s, zb.pos.z, 0.26 * s, 'legs']];
      for (const sp of spheres) {
        const px = ox - sp[0], py = oy - sp[1], pz = oz - sp[2];
        const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - sp[3] * sp[3];
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t >= 0 && t < best) { best = t; hit = { t, zombie: zb, part: sp[4] }; }
      }
    }
    return hit;
  }

  // ---------- AI ----------
  update(dt) {
    const G = this.G;
    const night = G.env?.night || 0;
    const physical = G.survivors.filter((s) => s.alive && s.physical && !s.extracted);
    const player = G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const zb = this.list[i];
      if (zb.state === 'dead') {
        zb.dieT += dt;
        if (zb.dieT > 9) this.release(zb);
        continue;
      }
      // despawn when far from every physical survivor
      let nearest = null, nd = 1e9;
      for (const s of physical) { const d = Math.hypot(s.pos.x - zb.pos.x, s.pos.z - zb.pos.z); if (d < nd) { nd = d; nearest = s; } }
      if (nd > (zb.horde ? 170 : 140) && zb.state !== 'chase') { this.release(zb); continue; }
      const T = TYPES[zb.type];
      if (zb.rise < 1) { zb.rise = Math.min(1, zb.rise + dt / 2.4); if (zb.rise < 1) continue; }
      zb.stateT += dt;
      zb.atkCd -= dt;
      if (zb.burn > 0) { zb.burn -= dt; if (Math.random() < dt * 2) this.damage(zb, 6, null); if (zb.state === 'dead') continue; }
      if (zb.stagger > 0) zb.stagger -= dt;
      // far zombies think less often
      const lod = nd > 70 ? 3 : nd > 35 ? 2 : 1;
      zb.senseT -= dt;
      if (zb.senseT <= 0) {
        zb.senseT = 0.3 * lod + Math.random() * 0.2;
        // look for survivors
        if (zb.state !== 'chase' || !zb.target || !zb.target.alive || zb.target.extracted) {
          for (const s of physical) {
            if (this.canSee(zb, s)) {
              const wasChasing = zb.state === 'chase';
              zb.state = 'chase'; zb.target = s; zb.path = null; zb.stateT = 0;
              if (!wasChasing) { G.audio?.play('zombie_alert', zb.pos, { vol: 0.9 }); G.hordes?.onSpotted(zb, s); }
              break;
            }
          }
          if (zb.state === 'chase' && (!zb.target || !zb.target.alive || zb.target.extracted)) { zb.state = 'wander'; zb.target = null; }
        } else if (zb.target) {
          // lose target if far and not visible
          const d = Math.hypot(zb.target.pos.x - zb.pos.x, zb.target.pos.z - zb.pos.z);
          if (d > 60 || (d > 18 && zb.stateT > 6 && !this.canSee(zb, zb.target))) {
            zb.state = 'investigate'; zb.tpos.copy(zb.target.pos); zb.target = null; zb.stateT = 0;
          } else if (this.canSee(zb, zb.target)) zb.stateT = 0;
        }
      }
      // choose movement goal
      let gx = zb.tpos.x, gz = zb.tpos.z, speed = night > 0.5 ? T.nightSpeed : T.speed;
      if (zb.state === 'chase' && zb.target) {
        speed = night > 0.5 ? T.nightChase : T.chase;
        const goal = this.navGoal(zb, zb.target.pos, zb.target.indoor);
        gx = goal.x; gz = goal.z;
      } else if (zb.state === 'investigate') {
        const d = Math.hypot(gx - zb.pos.x, gz - zb.pos.z);
        if (d < 2.5 || zb.stateT > 30) { zb.state = 'wander'; zb.stateT = 0; }
      } else if (zb.state === 'wander') {
        speed *= 0.55;
        if (zb.stateT > 8 + Math.random() * 6 || Math.hypot(gx - zb.pos.x, gz - zb.pos.z) < 2) {
          zb.stateT = 0;
          let cx = zb.pos.x, cz = zb.pos.z;
          const h = zb.horde && G.hordes.get(zb.horde);
          if (h) { cx = h.x; cz = h.z; }
          zb.tpos.set(cx + (Math.random() - 0.5) * 40, 0, cz + (Math.random() - 0.5) * 40);
        }
        if (zb.stateT < 3) speed = 0;
      }
      if (zb.stagger > 0) speed *= 0.2;
      // vaulting through a window
      if (zb.vaultT > 0) {
        zb.vaultT -= dt;
        const k = 1 - clamp(zb.vaultT / 1.4, 0, 1);
        zb.pos.lerpVectors(zb.vaultFrom, zb.vaultTo, k);
        zb.pos.y = lerp(zb.vaultFrom.y, zb.vaultTo.y, k) + Math.sin(k * Math.PI) * 0.9;
        continue;
      }
      // attack target
      if (zb.state === 'chase' && zb.target) {
        const t = zb.target;
        const dx = t.pos.x - zb.pos.x, dz = t.pos.z - zb.pos.z;
        const d = Math.hypot(dx, dz);
        const reach = 1.35 * zb.scale;
        if (d < reach + 0.4 && Math.abs(t.pos.y - zb.pos.y) < 1.6) {
          speed = d < reach * 0.8 ? 0 : speed * 0.4;
          zb.yaw = dampAngle(zb.yaw, Math.atan2(dx, dz), 10, dt);
          if (zb.atkCd <= 0 && zb.atkT < 0) { zb.atkT = 0; G.audio?.play('zombie_attack', zb.pos, { vol: 0.8 }); }
        }
      }
      if (zb.atkT >= 0) {
        zb.atkT += dt;
        if (zb.atkT > 0.42 && zb.atkT - dt <= 0.42) this.resolveAttack(zb);
        if (zb.atkT > 0.9) { zb.atkT = -1; zb.atkCd = zb.type === 'brute' ? 1.8 : 1.2; }
        speed *= 0.2;
      }
      // smashing an obstacle
      if (zb.smash) {
        speed = 0;
        zb.smashT = (zb.smashT || 0) + dt;
        if (zb.smashT > 1.1) {
          zb.smashT = 0;
          const ob = zb.smash;
          zb.atkT = 0;
          const dmg = T.struct;
          let alive = true;
          if (ob.piece) alive = G.builds.damage(ob.piece, dmg, null);
          else if (ob.barricade) alive = G.inter.damageBarricade(ob.barricade, dmg, null);
          else if (ob.door) alive = G.inter.damageDoor(ob.door, dmg, null);
          G.audio?.play('smash', zb.pos, { vol: 0.9 });
          G.emitNoise(zb.pos.x, zb.pos.z, 25, null, 'smash');
          if (!alive || zb.stateT > 40) zb.smash = null;
        }
        if (zb.smash && Math.hypot(zb.smash.x - zb.pos.x, zb.smash.z - zb.pos.z) > 2.6) zb.smash = null;
      }
      // steer
      let dx = gx - zb.pos.x, dz = gz - zb.pos.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.01) { dx /= dl; dz /= dl; }
      if (zb.sideT > 0) {
        zb.sideT -= dt;
        const sx = -dz * zb.side, sz = dx * zb.side;
        dx = dx * 0.3 + sx; dz = dz * 0.3 + sz;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      }
      // separation
      for (const o of this.list) {
        if (o === zb || o.state === 'dead') continue;
        const ox = zb.pos.x - o.pos.x, oz = zb.pos.z - o.pos.z;
        const d2 = ox * ox + oz * oz;
        if (d2 < 0.8 && d2 > 1e-6) { const d = Math.sqrt(d2); dx += (ox / d) * (0.9 - d) * 1.5; dz += (oz / d) * (0.9 - d) * 1.5; }
      }
      const tv = speed;
      zb.vel.x += (dx * tv - zb.vel.x) * Math.min(1, dt * 5);
      zb.vel.z += (dz * tv - zb.vel.z) * Math.min(1, dt * 5);
      if (speed > 0.1 && dl > 0.3) zb.yaw = dampAngle(zb.yaw, Math.atan2(zb.vel.x, zb.vel.z), 6, dt);
      const ox = zb.pos.x, oz = zb.pos.z;
      zb.pos.x += zb.vel.x * dt;
      zb.pos.z += zb.vel.z * dt;
      if (lod < 3 || i % 2 === (G.frame & 1)) {
        G.physics.pushOut(zb.pos, 0.34 * zb.scale, 1.7 * zb.scale, 0.55, true);
        const gy = G.physics.groundAt(zb.pos.x, zb.pos.z, zb.pos.y + 0.6, 0.3);
        if (gy < zb.pos.y - 0.3) { zb.yv -= 20 * dt; zb.pos.y = Math.max(gy, zb.pos.y + zb.yv * dt); if (zb.pos.y <= gy + 0.01) zb.yv = 0; }
        else { zb.pos.y = gy; zb.yv = 0; }
      }
      // stuck detection → smash or sidestep or vault
      const moved = Math.hypot(zb.pos.x - ox, zb.pos.z - oz);
      if (speed > 0.5 && moved < speed * dt * 0.25 && !zb.smash && zb.atkT < 0) {
        zb.stuckT += dt;
        if (zb.stuckT > 0.6) {
          zb.stuckT = 0;
          const ob = this.findObstacle(zb, dx, dz);
          if (ob) { zb.smash = ob; zb.smashT = 0.6; }
          else { zb.side = Math.random() < 0.5 ? -1 : 1; zb.sideT = 1.2; zb.path = null; }
        }
      } else zb.stuckT = Math.max(0, zb.stuckT - dt);
    }
    this.groanT -= dt;
    if (this.groanT <= 0 && this.list.length) {
      this.groanT = 1.2 + Math.random() * 2.5 / Math.max(1, this.list.length / 10);
      const zb = this.list[Math.floor(Math.random() * this.list.length)];
      if (zb.state !== 'dead') G.audio?.play(zb.state === 'chase' ? 'zombie_chase' : 'zombie_groan', zb.pos, { vol: 0.8, pitch: zb.type === 'brute' ? 0.7 : zb.type === 'runner' ? 1.2 : 1 });
    }
  }
  resolveAttack(zb) {
    const t = zb.target;
    const G = this.G;
    if (!t || !t.alive) return;
    const d = Math.hypot(t.pos.x - zb.pos.x, t.pos.z - zb.pos.z);
    if (d < 1.75 * zb.scale && Math.abs(t.pos.y - zb.pos.y) < 1.7) {
      const T = TYPES[zb.type];
      const scale = 0.72 + Math.min(1, G.match?.progress || 0) * 0.5;
      if (t.vehicle && t.vehicle.def.cab) { G.rides.damage(t.vehicle, T.dmg * scale * 3, null); G.audio?.play('smash', zb.pos, { vol: 0.8 }); return; }
      t.takeDamage(Math.round(T.dmg * scale), null, { type: 'zombie', heavy: zb.type === 'brute', infect: zb.type === 'runner' ? 0.14 : 0.1 });
      G.audio?.play('zombie_hit', t.pos, { vol: 0.9 });
      if (t.isPlayer) { G.hud.damageFrom(zb.pos); G.player.shake(zb.type === 'brute' ? 0.6 : 0.25); }
      if (zb.type === 'brute') { const k = 7 / (d || 1); t.vel.x += (t.pos.x - zb.pos.x) * k; t.vel.z += (t.pos.z - zb.pos.z) * k; t.vel.y = 4; }
    }
  }
  findObstacle(zb, dx, dz) {
    const G = this.G;
    let found = null;
    const px = zb.pos.x + dx * 0.9, pz = zb.pos.z + dz * 0.9;
    G.physics.query(px - 0.9, pz - 0.9, px + 0.9, pz + 0.9, (c) => {
      const ref = c.ref;
      if (!ref) return;
      if (ref.piece || ref.barricade || ref.door) {
        if (c.maxY < zb.pos.y + 0.3 || c.minY > zb.pos.y + 1.8) return;
        found = { piece: ref.piece, barricade: ref.barricade, door: ref.door, x: c.x, z: c.z };
        return false;
      }
    });
    return found;
  }
  // building-aware navigation: returns next waypoint toward the target position
  navGoal(zb, tpos, indoor) {
    const G = this.G;
    const zIn = G.inter.buildingAt(zb.pos.x, zb.pos.y, zb.pos.z);
    const tIn = indoor ?? G.inter.buildingAt(tpos.x, tpos.y, tpos.z);
    if (!tIn && !zIn) { zb.path = null; return tpos; }
    if (tIn && zIn && tIn.b === zIn.b && tIn.floor === zIn.floor) { zb.path = null; return tpos; }
    // need a path through a building nav graph
    const b = (tIn || zIn).b;
    const rt = b.rt;
    if (!rt) return tpos;
    if (!zb.path || zb.pathB !== b.id || zb.pathT !== (tIn ? tIn.room : -1) || zb.pathZ !== (zIn ? zIn.room : -1)) {
      zb.path = G.inter.findPath(b, zb.pos, tpos, zIn, tIn);
      zb.pathI = 0; zb.pathB = b.id; zb.pathT = tIn ? tIn.room : -1; zb.pathZ = zIn ? zIn.room : -1;
    }
    const path = zb.path;
    if (!path || zb.pathI >= path.length) return tpos;
    const node = path[zb.pathI];
    const d = Math.hypot(node.x - zb.pos.x, node.z - zb.pos.z);
    if (d < 0.8 && Math.abs(node.y - zb.pos.y) < 1.8) {
      // traversing a vault edge?
      const next = path[zb.pathI + 1];
      if (next && node.vaultTo === next) {
        const ent = node.entrance;
        if (ent && ent.rec.boarded > 0) { zb.smash = { barricade: ent.rec, x: ent.rec.x, z: ent.rec.z }; zb.smashT = 0.5; return node; }
        zb.vaultT = 1.4; zb.vaultFrom = zb.pos.clone(); zb.vaultTo = new THREE.Vector3(next.x, next.y, next.z);
        G.audio?.play('zombie_climb', zb.pos, { vol: 0.6 });
        zb.pathI += 2;
        return next;
      }
      zb.pathI++;
      return path[zb.pathI] || tpos;
    }
    return node;
  }

  // ---------- render ----------
  render(dt, camPos) {
    const R = this.rig;
    const n = this.list.length;
    const night = this.G.env?.night || 0;
    this.mats.eyes.emissiveIntensity = 0.6 + night * 2.4;
    let k = 0;
    for (const zb of this.list) {
      const d = Math.hypot(zb.pos.x - camPos.x, zb.pos.z - camPos.z);
      if (d > 160) continue;
      this.pose(zb, dt);
      R.root.updateMatrixWorld(true);
      for (const p of PARTS) {
        if (p === 'hair' && !zb.hair) { this.m4.makeScale(0, 0, 0); this.meshes[p].setMatrixAt(k, this.m4); continue; }
        this.meshes[p].setMatrixAt(k, R[p].matrixWorld);
        if (p !== 'eyes') {
          let c = zb.skin;
          if (p === 'torso' || p === 'uaL' || p === 'uaR') c = zb.shirt;
          else if (p === 'pelvis' || p === 'thL' || p === 'thR' || p === 'shL' || p === 'shR') c = zb.pants;
          else if (p === 'hair') c = zb.hair;
          this.col.setHex(c);
          if (zb.burn > 0) this.col.multiplyScalar(0.4);
          if (zb.state === 'dead') this.col.multiplyScalar(0.75);
          this.meshes[p].setColorAt(k, this.col);
        }
      }
      k++;
    }
    for (const p of PARTS) {
      const m = this.meshes[p];
      m.count = k;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    void n;
  }
  pose(zb, dt) {
    const R = this.rig;
    const s = zb.scale;
    for (const k in R) if (k !== 'root') R[k].rotation.set(0, 0, 0);
    R.root.position.copy(zb.pos);
    R.root.rotation.set(0, zb.yaw, 0);
    R.root.scale.setScalar(s);
    R.hips.position.set(0, 0.95, 0);
    const speed = Math.hypot(zb.vel.x, zb.vel.z);
    zb.phase += dt * (1.5 + speed * 1.6);
    const ph = zb.phase;
    const amp = Math.min(1, speed / 2) * (zb.type === 'runner' && speed > 3 ? 1.3 : 0.7);
    // hunch & shamble
    R.spine.rotation.x = zb.type === 'runner' && speed > 3 ? 0.55 : 0.28;
    R.spine.rotation.z = Math.sin(ph * 0.5) * 0.08;
    R.head.rotation.z = 0.25 * Math.sin(zb.idx);
    R.head.rotation.x = -0.25;
    R.thL.rotation.x = Math.sin(ph) * amp; R.thR.rotation.x = -Math.sin(ph) * amp;
    R.shL.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * amp * 1.3; R.shR.rotation.x = Math.max(0, Math.sin(ph + 0.6)) * amp * 1.3;
    R.hips.position.y = 0.95 + Math.abs(Math.sin(ph)) * 0.04 * amp;
    R.hips.rotation.z = Math.sin(ph) * 0.06;
    // arms reaching
    const reach = zb.state === 'chase' ? 1.0 : 0.65;
    R.uaL.rotation.x = -zb.armPose * reach * 1.3 + Math.sin(ph * 0.7) * 0.15; R.uaR.rotation.x = -zb.armPose * reach * 1.2 + Math.cos(ph * 0.6) * 0.15;
    R.uaL.rotation.z = -0.15; R.uaR.rotation.z = 0.15;
    R.faL.rotation.x = -0.3; R.faR.rotation.x = -0.4;
    if (zb.atkT >= 0) {
      const t = zb.atkT / 0.9;
      const sw = t < 0.45 ? -t / 0.45 * 1.2 : -1.2 + (t - 0.45) / 0.55 * 1.8;
      R.uaL.rotation.x = -1.6 + sw; R.uaR.rotation.x = -1.6 + sw; R.spine.rotation.x += Math.sin(t * Math.PI) * 0.3;
    }
    if (zb.smash) { const t = (zb.smashT || 0) / 1.1; R.uaL.rotation.x = -2.6 + Math.sin(t * Math.PI) * 2; R.uaR.rotation.x = -2.4 + Math.sin(t * Math.PI) * 2; }
    if (zb.vaultT > 0) { R.spine.rotation.x = 1.0; R.thL.rotation.x = -1.2; R.thR.rotation.x = -0.4; }
    if (zb.rise < 1) {
      const t = zb.rise;
      R.root.position.y = zb.pos.y - (1 - t) * 1.9;
      R.uaL.rotation.x = -2.8; R.uaR.rotation.x = -2.6 + Math.sin(t * 20) * 0.2;
      R.spine.rotation.x = 0.5 * (1 - t);
    }
    if (zb.state === 'dead') {
      const t = clamp(zb.dieT * 1.8, 0, 1);
      R.root.rotation.x = -t * 1.5;
      R.hips.position.y = lerp(0.95, 0.2, t);
      R.uaL.rotation.z = -1.2 * t; R.uaR.rotation.z = 1.2 * t;
      if (zb.dieT > 7) R.root.position.y = zb.pos.y - (zb.dieT - 7) * 0.6;
    }
    zb.yv = zb.yv || 0;
  }
}
