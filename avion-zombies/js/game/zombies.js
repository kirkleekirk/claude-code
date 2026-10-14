import * as THREE from '../../vendor/three.module.min.js';
import { buildBody, makeZombieMaterial } from './avatar.js';
import { audio } from '../engine/audio.js';
import { clamp, lerp, rand, pick, wrapAngle, dampAngle, smoothstep, chance } from '../util.js';

// The undead: Avion test subjects (Kinect crowd avatars) driven by a shared flow field.
const MAX_ALIVE = 24;
const MAX_POOL = 40;
const TYPES = {
  walker: { tint: 0xffffff, eye: 0xff8a2a, health: 1, damage: 50 },
  exo: { tint: 0xd8dccf, eye: 0x7fd0ff, health: 1.35, damage: 60 },
  emz: { tint: 0xa9c0ff, eye: 0x6fb8ff, health: 2.0, damage: 55 },
  bloater: { tint: 0xc8e08a, eye: 0xe8ff5a, health: 1.8, damage: 50 },
};
const SPEEDS = { walk: [0.95, 1.3], run: [2.5, 3.1], sprint: [4.0, 4.7] };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0);
const NX = new THREE.Vector3(-1, 0, 0);

function boneWorld(bone, out, lx = 0, ly = 0, lz = 0) {
  return out.set(lx, ly, lz).applyMatrix4(bone.matrixWorld);
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : cc < 0 ? 0 : -1;
}

function rayCapsule(o, d, a, b, r) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vz = b.z - a.z;
  const wx = o.x - a.x;
  const wy = o.y - a.y;
  const wz = o.z - a.z;
  const bb = d.x * vx + d.y * vy + d.z * vz;
  const cc = vx * vx + vy * vy + vz * vz;
  const dd = d.x * wx + d.y * wy + d.z * wz;
  const ee = vx * wx + vy * wy + vz * wz;
  const D = cc - bb * bb;
  let t = D > 1e-8 ? (ee - dd * bb) / D : 0;
  t = clamp(t, 0, 1);
  let s = t * bb - dd;
  if (s < 0) {
    s = 0;
    t = clamp(ee / cc, 0, 1);
  }
  const px = wx + s * d.x - t * vx;
  const py = wy + s * d.y - t * vy;
  const pz = wz + s * d.z - t * vz;
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return -1;
  return Math.max(0, s - Math.sqrt(r * r - d2));
}

class Zombie {
  constructor(mgr, fig, avatars) {
    this.mgr = mgr;
    this.fig = fig;
    this.material = makeZombieMaterial(avatars);
    const body = buildBody(fig, this.material);
    this.mesh = body.mesh;
    this.B = body.bones;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.root.visible = false;
    mgr.scene.add(this.root);
    this.ch = { x: 0, y: 0, z: 0, r: 0.3, h: 1.7, vx: 0, vy: 0, vz: 0, grounded: true };
    this.alive = false;
    this.active = false;
    this.hit = {
      head: new THREE.Vector3(), hips: new THREE.Vector3(), chest: new THREE.Vector3(),
      limbs: Array.from({ length: 8 }, () => [new THREE.Vector3(), new THREE.Vector3()]),
      frame: -1,
    };
    this.attachments = new THREE.Group();
    this._buildExoParts();
  }

  _buildExoParts() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x4d545b, metalness: 0.8, roughness: 0.4 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.6, 5) });
    this.exoParts = [];
    const add = (bone, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.B[bone].add(m);
      this.exoParts.push(m);
      m.visible = false;
      return m;
    };
    add('chest', new THREE.BoxGeometry(0.3, 0.32, 0.14), metal, 0, 0.05, -0.17);
    add('chest', new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), glow, 0.08, -0.16, -0.22);
    add('chest', new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), glow, -0.08, -0.16, -0.22);
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      add('hip' + side, new THREE.BoxGeometry(0.03, 0.3, 0.05), metal, 0.075 * sx, -0.17, 0);
      add('knee' + side, new THREE.BoxGeometry(0.03, 0.28, 0.05), metal, 0.07 * sx, -0.15, 0.02);
      add('shoulder' + side, new THREE.BoxGeometry(0.24, 0.035, 0.05), metal, 0.13 * sx, 0.05, 0);
    }
  }

  setType(type) {
    this.type = type;
    const T = TYPES[type];
    this.material.color.set(T.tint).multiplyScalar(rand(0.88, 1.08));
    this.material.emissive.set(T.eye);
    this.material.emissiveIntensity = type === 'emz' ? 4 : 3.2;
    for (const p of this.exoParts) p.visible = type === 'exo';
    const big = type === 'bloater';
    this.B.chest.scale.set(big ? 1.4 : 1, big ? 1.2 : 1, big ? 1.5 : 1);
    this.B.spine.scale.set(big ? 1.3 : 1, 1, big ? 1.35 : 1);
  }

  spawn(sp, opts) {
    const mgr = this.mgr;
    this.setType(opts.type);
    this.alive = true;
    this.active = true;
    this.root.visible = true;
    this.maxHealth = this.health = opts.health * TYPES[opts.type].health;
    this.damageOut = TYPES[opts.type].damage;
    this.tier = opts.tier;
    const [s0, s1] = SPEEDS[opts.tier];
    this.speed = rand(s0, s1) * (opts.type === 'exo' ? 1.08 : 1) * (opts.type === 'bloater' ? 0.8 : 1);
    this.crawler = false;
    this.headless = false;
    this.state = 'rise';
    this.t = 0;
    this.riseDur = sp.type === 'vent' ? 1.0 : 1.5;
    this.phase = Math.random() * 10;
    this.attackCd = 0;
    this.vocalT = rand(1, 4);
    this.stepT = 0;
    this.leapCd = rand(2, 5);
    this.stagger = 0;
    this.flinch = 0;
    this.cook = 0;
    this.shock = 0;
    this.unreach = 0;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.farT = 0;
    this.sinking = 0;
    this.deathT = 0;
    this.crooked = rand(-0.35, 0.35);
    this.reachBias = rand(-0.2, 0.2);
    this.voice = null;
    this.climb = null;
    this.leap = null;
    const y = mgr.world.physics.groundHeight(sp.x, sp.z, 0.3, 100);
    this.ch.x = sp.x + rand(-0.3, 0.3);
    this.ch.z = sp.z + rand(-0.3, 0.3);
    this.ch.y = y;
    this.groundY = y;
    this.ch.vx = this.ch.vy = this.ch.vz = 0;
    this.ch.grounded = true;
    this.yaw = Math.atan2(mgr.game.player.ch.x - sp.x, mgr.game.player.ch.z - sp.z);
    for (const b of Object.values(this.B)) {
      if (b.name !== 'chest' && b.name !== 'spine') b.scale.set(1, 1, 1);
    }
    this.B.head.scale.setScalar(0.86);
    this.root.scale.setScalar(rand(0.94, 1.07) * (opts.type === 'bloater' ? 1.08 : 1));
    this.mesh.visible = true;
    this.root.position.set(this.ch.x, y - 1.8, this.ch.z);
    this.spawnType = sp.type;
    if (sp.type === 'vent') {
      mgr.game.particles.sparks(sp.x, y + 0.1, sp.z, 0, 1, 0, 10);
      mgr.game.particles.dust(sp.x, y + 0.2, sp.z, 0, 1, 0, [0.45, 0.45, 0.45], 4, 1.2);
      audio.play3D('impact_metal', new THREE.Vector3(sp.x, y, sp.z), { volume: 0.8, refDistance: 4 });
    } else {
      mgr.game.particles.dirtBurst(sp.x, y, sp.z);
      audio.play3D('dirt_burst', new THREE.Vector3(sp.x, y, sp.z), { volume: 0.9, refDistance: 4 });
    }
    if (opts.type === 'emz') this.crackle = true;
  }

  get pos() {
    return this.root.position;
  }

  chestPos() {
    return _v2.copy(this.hit.chest);
  }

  head() {
    return this.hit.head;
  }

  despawn() {
    this.alive = false;
    this.active = false;
    this.root.visible = false;
    if (this.voice) this.voice.stop(0.2);
    this.voice = null;
  }

  // ---- AI ---------------------------------------------------------------------------------
  update(dt, ctx) {
    const mgr = this.mgr;
    const game = mgr.game;
    const ch = this.ch;
    this.t += dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 4);
    if (this.leapCd > 0) this.leapCd -= dt;

    if (!this.alive) {
      this.deathT += dt;
      if (this.deathT > 5) {
        this.sinking += dt;
        this.root.position.y -= dt * 0.45;
        if (this.sinking > 2.2) this.despawn();
      }
      this.animate(dt);
      return;
    }

    if (this.state === 'rise') {
      const k = clamp(this.t / this.riseDur, 0, 1);
      const e = 1 - Math.pow(1 - k, 2.2);
      this.root.position.set(ch.x, this.groundY - 1.8 * (1 - e), ch.z);
      if (k >= 1) this.state = 'chase';
      this.animate(dt);
      return;
    }
    if (this.cook > 0) {
      this.cook += dt;
      this.root.position.set(ch.x + rand(-0.02, 0.02), ch.y, ch.z + rand(-0.02, 0.02));
      if (this.cook > 1.25) mgr.kill(this, { source: 'microwave', part: 'torso', dir: new THREE.Vector3(0, 1, 0) }, true);
      this.animate(dt);
      return;
    }
    if (this.shock > 0) {
      this.shock -= dt;
      if (Math.random() < 0.3) game.particles.electric(ch.x, ch.y + 1.2, ch.z, 3);
      this.animate(dt);
      this.root.position.set(ch.x, ch.y, ch.z);
      return;
    }

    const target = ctx;
    const dx = target.x - ch.x;
    const dz = target.z - ch.z;
    const dy = target.y - ch.y;
    const dist = Math.hypot(dx, dz);
    this.distToTarget = dist;

    // vocals
    this.vocalT -= dt;
    if (this.vocalT <= 0) {
      this.vocalT = this.tier === 'walk' ? rand(3, 7) : rand(2.5, 5);
      if (dist < 40) {
        const cat = this.crawler ? 'crawl' : this.type === 'emz' && chance(0.4) ? 'elec' : this.tier === 'walk' ? 'ambient' : 'sprint';
        this.say(cat, { volume: this.tier === 'walk' ? 0.85 : 1 });
      }
    }
    if (this.voice) this.voice.setPosition(this.headPos());

    if (this.state === 'attack') {
      this.attackT += dt;
      // keep facing the target while swinging
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
      if (!this.attackHit && this.attackT >= 0.42) {
        this.attackHit = true;
        if (ctx.isPlayer && dist < 1.75 && Math.abs(dy) < 1.5 && !game.player.downed) {
          const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          if ((dx * f.x + dz * f.z) / Math.max(0.01, dist) > 0.2 || dist < 0.8) {
            game.hurtPlayer(this.damageOut, ch.x, ch.z);
            audio.zombie('swipe', this.headPos(), { volume: 0.9, force: true });
          }
        } else if (!ctx.isPlayer && ctx.lure) {
          ctx.lure.hp -= 1;
        }
      }
      if (this.attackT >= 0.85) {
        this.state = 'chase';
        this.attackCd = 0.25;
      }
      this.root.position.set(ch.x, ch.y, ch.z);
      this.animate(dt);
      return;
    }
    if (this.state === 'climb') {
      const c = this.climb;
      c.t += dt;
      const k = clamp(c.t / c.dur, 0, 1);
      const up = smoothstep(0, 0.65, k);
      const fwd = smoothstep(0.45, 1, k);
      ch.x = lerp(c.from.x, c.to.x, fwd);
      ch.z = lerp(c.from.z, c.to.z, fwd);
      ch.y = lerp(c.from.y, c.to.y, up) + Math.sin(k * Math.PI) * 0.15;
      this.yaw = dampAngle(this.yaw, Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z), 10, dt);
      if (k >= 1) {
        this.state = 'chase';
        ch.vy = 0;
        ch.grounded = true;
      }
      this.root.position.set(ch.x, ch.y, ch.z);
      this.animate(dt);
      return;
    }
    if (this.state === 'leap') {
      const L = this.leap;
      L.t += dt;
      const k = clamp(L.t / L.dur, 0, 1);
      ch.x = lerp(L.from.x, L.to.x, k);
      ch.z = lerp(L.from.z, L.to.z, k);
      ch.y = lerp(L.from.y, L.to.y, k) + Math.sin(k * Math.PI) * L.h;
      if (Math.random() < 0.6) game.particles.add.spawn({ x: ch.x, y: ch.y + 0.9, z: ch.z, vx: rand(-1, 1), vy: -3, vz: rand(-1, 1), life: 0.3, size: 0.12, size1: 0.02, r: 1, g: 2.4, b: 5, a: 1, a1: 0, cell: 0 });
      if (k >= 1) {
        this.state = 'chase';
        ch.grounded = true;
        ch.vy = 0;
        game.particles.dust(ch.x, ch.y, ch.z, 0, 1, 0, [0.4, 0.36, 0.32], 3, 1.2);
      }
      this.root.position.set(ch.x, ch.y, ch.z);
      this.animate(dt);
      return;
    }

    // ---- chase ----------------------------------------------------------------------------
    const attackRange = this.crawler ? 1.0 : 1.2;
    if (dist < attackRange && Math.abs(dy) < 1.3 && this.attackCd <= 0 && this.stagger <= 0 && (ctx.isPlayer ? !game.player.downed : true)) {
      this.state = 'attack';
      this.attackT = 0;
      this.attackHit = false;
      this.attackArm = chance(0.5) ? 1 : -1;
      if (chance(0.55)) this.say('attack');
      ch.vx = ch.vz = 0;
      this.root.position.set(ch.x, ch.y, ch.z);
      this.animate(dt);
      return;
    }

    let sp = this.crawler ? 0.8 : this.speed;
    if (this.stagger > 0) {
      this.stagger -= dt;
      sp *= 0.15;
    }
    if (ctx.isPlayer && game.player.downed) sp *= 0.4;
    const nav = mgr.world.nav;
    let mx = 0;
    let mz = 0;
    let climbTo = -1;
    if (dist < 1.0) {
      mx = dx;
      mz = dz;
    } else if (dist < 14 && Math.abs(dy) < 0.8 && nav.clearPath(ch.x, ch.z, target.x, target.z)) {
      mx = dx;
      mz = dz;
    } else {
      const i = nav.idx(ch.x, ch.z);
      const cur = nav.walkable(i) ? i : nav.nearestWalkable(i, 3);
      const n1 = nav.nextCell(cur);
      if (n1 >= 0) {
        const dh = nav.floor[n1] - ch.y;
        if (dh > 0.55) climbTo = n1;
        const n2 = nav.nextCell(n1);
        const aim = n2 >= 0 && nav.floor[n2] - ch.y <= 0.55 && climbTo < 0 ? n2 : n1;
        mx = nav.cx(aim) - ch.x;
        mz = nav.cz(aim) - ch.z;
      } else if (cur >= 0 && nav.dist[cur] >= 65535) {
        // outside the field: head straight for the target, the director may recycle us
        mx = dx;
        mz = dz;
        this.farT += dt;
      } else {
        mx = dx;
        mz = dz;
      }
    }
    // climbing onto containers / ledges
    if (climbTo >= 0 && this.state === 'chase') {
      const hx = nav.cx(climbTo);
      const hz = nav.cz(climbTo);
      if (Math.hypot(hx - ch.x, hz - ch.z) < 1.0) {
        const toY = nav.floor[climbTo];
        this.startClimb(new THREE.Vector3(hx, toY, hz), toY - ch.y);
        this.root.position.set(ch.x, ch.y, ch.z);
        this.animate(dt);
        return;
      }
    }
    // player perched out of reach right above us: claw up after them
    if (ctx.isPlayer && dist < 2.4 && dy > 1.3 && game.player.ch.grounded) {
      this.unreach += dt;
      if (this.unreach > 1.1) {
        this.unreach = 0;
        const l = Math.max(0.01, dist);
        this.startClimb(new THREE.Vector3(target.x - (dx / l) * 0.55, target.y, target.z - (dz / l) * 0.55), dy);
        this.root.position.set(ch.x, ch.y, ch.z);
        this.animate(dt);
        return;
      }
    } else this.unreach = Math.max(0, this.unreach - dt);

    // exo zombies boost-leap at you
    if (this.type === 'exo' && this.leapCd <= 0 && dist > 4 && dist < 12 && Math.abs(dy) < 3 && !this.crawler && this.stagger <= 0) {
      if (mgr.world.physics.visible(ch.x, ch.y + 1.4, ch.z, target.x, target.y + 1.0, target.z)) {
        const l = dist;
        const land = new THREE.Vector3(target.x - (dx / l) * 1.0, target.y, target.z - (dz / l) * 1.0);
        this.leap = { from: new THREE.Vector3(ch.x, ch.y, ch.z), to: land, t: 0, dur: 0.45 + dist * 0.045, h: 1.6 + dist * 0.1 };
        this.state = 'leap';
        this.leapCd = rand(4, 7);
        audio.play3D('exo_jump', this.headPos(), { volume: 0.9, refDistance: 4 });
        this.root.position.set(ch.x, ch.y, ch.z);
        this.animate(dt);
        return;
      }
    }

    const ml = Math.hypot(mx, mz) || 1;
    let vx = (mx / ml) * sp;
    let vz = (mz / ml) * sp;
    // separation
    const sep = mgr.separation(this);
    vx += sep.x * 2.2;
    vz += sep.z * 2.2;
    const k = 1 - Math.exp(-8 * dt);
    ch.vx += (vx - ch.vx) * k;
    ch.vz += (vz - ch.vz) * k;
    if (!ch.grounded) ch.vy -= 20 * dt;
    mgr.world.physics.moveCharacter(ch, dt, 0.55);
    const moved = Math.hypot(ch.vx, ch.vz);
    if (moved > 0.2) this.yaw = dampAngle(this.yaw, Math.atan2(ch.vx, ch.vz), 7, dt);
    this.moveSpeed = moved;
    this.root.position.set(ch.x, ch.y, ch.z);

    // stuck watchdog
    this.stuckT += dt;
    if (this.stuckT > 3) {
      const d = Math.hypot(ch.x - this.lastPos.x, ch.z - this.lastPos.z);
      this.stuck = d < 0.6 && dist > 3 ? (this.stuck || 0) + 1 : 0;
      this.lastPos.set(ch.x, ch.y, ch.z);
      this.stuckT = 0;
      if (this.stuck >= 2) {
        this.stuck = 0;
        mgr.recycle(this);
        return;
      }
    }

    // footsteps
    if (dist < 14 && moved > 0.5) {
      this.stepT -= dt * moved;
      if (this.stepT <= 0) {
        this.stepT = 1.1;
        if (mgr.stepBudget > 0) {
          mgr.stepBudget--;
          audio.zombie(this.crawler ? 'drag' : 'step', _v.set(ch.x, ch.y + 0.1, ch.z), { volume: 0.55, force: true, refDistance: 2.5, maxDistance: 20 });
        }
      }
    }
    if (this.type === 'emz' && Math.random() < dt * 4) game.particles.electric(ch.x, ch.y + 1.1, ch.z, 2, 1.4);
    this.animate(dt);
  }

  say(cat, opts = {}) {
    if (this.voice) return null;
    const v = audio.zombie(cat, this.headPos(), opts);
    if (v) {
      this.voice = v;
      const prev = v.onEnd;
      v.onEnd = () => {
        if (prev) prev();
        if (this.voice === v) this.voice = null;
      };
    }
    return v;
  }

  startClimb(to, height) {
    this.state = 'climb';
    this.climb = { from: new THREE.Vector3(this.ch.x, this.ch.y, this.ch.z), to, t: 0, dur: 0.45 + Math.max(0, height) * 0.32 };
  }

  headPos() {
    return _v.set(this.ch.x, this.ch.y + 1.55, this.ch.z);
  }

  // ---- procedural animation on the avatar skeleton --------------------------------------
  animate(dt) {
    const B = this.B;
    const t = this.t;
    for (const b of Object.values(B)) b.quaternion.copy(b.userData.bindQ);
    B.hips.position.copy(B.hips.userData.bindP);
    const rot = (bone, x, y = 0, z = 0) => {
      _q.setFromEuler(_e.set(x, y, z, 'YXZ'));
      bone.quaternion.multiply(_q);
    };
    const armDir = (bone, left, dx, dy, dz) => {
      _v.set(left ? dx : -dx, dy, dz).normalize();
      _q.setFromUnitVectors(left ? X : NX, _v);
      bone.quaternion.premultiply(_q);
    };
    this.root.rotation.set(0, this.yaw, 0);

    if (!this.alive) {
      this._poseDeath(rot, armDir);
      return;
    }
    const speed = this.moveSpeed || 0;
    const tier = this.crawler ? 'crawl' : this.tier;
    const freq = tier === 'walk' ? 6.2 : tier === 'run' ? 9.2 : 12;
    this.phase += dt * freq * clamp(speed / Math.max(0.5, this.speed), 0.25, 1.3);
    const p = this.phase * 0.5;
    const s = Math.sin(p);
    const c = Math.cos(p);

    if (this.state === 'rise') {
      const k = clamp(this.t / this.riseDur, 0, 1);
      rot(B.spine, -0.3 + k * 0.5, 0, Math.sin(t * 6) * 0.1);
      armDir(B.shoulderL, true, 0.2, 0.9 - k * 0.7, 0.4 + k * 0.5 + Math.sin(t * 9) * 0.2);
      armDir(B.shoulderR, false, 0.2, 0.9 - k * 0.7, 0.4 + k * 0.5 + Math.cos(t * 9) * 0.2);
      rot(B.hipL, -0.6 * (1 - k), 0, 0);
      rot(B.kneeL, 1.0 * (1 - k), 0, 0);
      rot(B.hipR, -0.3 * (1 - k), 0, 0);
      rot(B.kneeR, 0.8 * (1 - k), 0, 0);
      rot(B.head, -0.4 + k * 0.4, 0, this.crooked);
      return;
    }

    if (this.crawler) {
      B.hips.position.y = 0.32;
      rot(B.hips, 1.32, 0, s * 0.08);
      rot(B.spine, -0.25, s * 0.15, 0);
      rot(B.chest, -0.25, 0, 0);
      rot(B.head, -0.55, 0, this.crooked);
      armDir(B.shoulderL, true, 0.25, -0.65 + 0.45 * s, 0.7 + 0.35 * c);
      armDir(B.shoulderR, false, 0.25, -0.65 - 0.45 * s, 0.7 - 0.35 * c);
      rot(B.hipL, 0.1, 0, 0.05);
      rot(B.hipR, 0.1, 0, -0.05);
      return;
    }

    const amp = tier === 'walk' ? 0.42 : tier === 'run' ? 0.7 : 0.9;
    const lean = tier === 'walk' ? 0.22 : tier === 'run' ? 0.38 : 0.52;
    const moveK = clamp(speed / 1.2, 0, 1);
    // legs
    rot(B.hipL, -s * amp * moveK, 0, 0.03);
    rot(B.hipR, s * amp * moveK, 0, -0.03);
    rot(B.kneeL, Math.max(0, -c) * amp * 1.4 * moveK + 0.08, 0, 0);
    rot(B.kneeR, Math.max(0, c) * amp * 1.4 * moveK + 0.08, 0, 0);
    rot(B.ankleL, -0.1 * s * moveK, 0, 0);
    rot(B.ankleR, 0.1 * s * moveK, 0, 0);
    B.hips.position.y -= Math.abs(c) * 0.045 * moveK + (tier === 'walk' ? 0.04 : 0.07);
    rot(B.hips, 0, s * 0.12 * moveK, s * 0.05 * moveK + (tier === 'walk' ? this.crooked * 0.15 : 0));
    // torso
    rot(B.spine, lean + Math.sin(p * 2) * 0.03, -s * 0.1, tier === 'walk' ? this.crooked * 0.2 : 0);
    rot(B.chest, 0.05, -s * 0.12, 0);
    rot(B.head, -lean * 0.6 + Math.sin(t * 1.7) * 0.05, Math.sin(t * 0.9) * 0.15, this.crooked + Math.sin(t * 2.3) * 0.05);
    // arms
    if (tier === 'sprint') {
      // pumping, human-like (the scary ones)
      armDir(B.shoulderL, true, 0.15, -0.85, -0.45 * s + 0.15);
      armDir(B.shoulderR, false, 0.15, -0.85, 0.45 * s + 0.15);
      rot(B.elbowL, 0, -1.2, 0);
      rot(B.elbowR, 0, 1.2, 0);
    } else if (tier === 'run') {
      armDir(B.shoulderL, true, 0.18 + this.reachBias * 0.2, -0.05 + c * 0.25, 1);
      armDir(B.shoulderR, false, 0.18, -0.35 - c * 0.3, 0.8);
      rot(B.elbowL, 0, -0.3, 0);
      rot(B.elbowR, 0, 0.5, 0);
    } else {
      // classic shamble: arms out, reaching
      armDir(B.shoulderL, true, 0.2, -0.12 + 0.08 * s + this.reachBias, 1);
      armDir(B.shoulderR, false, 0.2, -0.3 - 0.08 * s - this.reachBias, 0.9);
      rot(B.elbowL, 0, -0.25, 0);
      rot(B.elbowR, 0, 0.35, 0);
    }
    // attack overlay
    if (this.state === 'attack') {
      const k = clamp(this.attackT / 0.85, 0, 1);
      const raise = smoothstep(0, 0.4, k) * (1 - smoothstep(0.45, 0.6, k));
      const swing = smoothstep(0.42, 0.58, k) * (1 - smoothstep(0.75, 1, k));
      const arm = this.attackArm > 0 ? B.shoulderL : B.shoulderR;
      armDir(arm, this.attackArm > 0, 0.1, raise * 1.6 - swing * 1.2, 0.6 + swing * 0.6);
      const other = this.attackArm > 0 ? B.shoulderR : B.shoulderL;
      armDir(other, this.attackArm < 0, 0.3, raise * 0.8 - swing * 0.5, 0.8);
      rot(B.spine, swing * 0.35 - raise * 0.15, this.attackArm * swing * 0.3, 0);
    }
    if (this.state === 'climb' || this.state === 'leap') {
      armDir(B.shoulderL, true, 0.1, 0.8, 0.6);
      armDir(B.shoulderR, false, 0.1, 0.8, 0.6);
      rot(B.hipL, -0.9, 0, 0);
      rot(B.kneeL, 1.2, 0, 0);
      rot(B.hipR, -0.4, 0, 0);
      rot(B.kneeR, 0.9, 0, 0);
    }
    // hit flinch
    if (this.flinch > 0) {
      rot(B.chest, -this.flinch * 0.5, this.flinchDir * this.flinch * 0.4, 0);
      rot(B.head, -this.flinch * 0.4, 0, 0);
    }
    if (this.shock > 0 || this.cook > 0) {
      for (const b of Object.values(B)) {
        if (b.name === 'hips') continue;
        rot(b, rand(-0.25, 0.25), rand(-0.25, 0.25), rand(-0.25, 0.25));
      }
    }
    if (this.cook > 0) {
      const k = clamp(this.cook / 1.25, 0, 1);
      const sw = 1 + k * 0.65;
      B.chest.scale.set(sw, sw, sw);
      B.spine.scale.set(1 + k * 0.5, 1, 1 + k * 0.5);
      B.head.scale.setScalar(0.86 * (1 + k * 0.5));
      this.material.emissiveIntensity = 3.2 + k * 10;
    }
  }

  _poseDeath(rot, armDir) {
    const B = this.B;
    const k = clamp(this.deathT / 0.75, 0, 1);
    const e = k * k * (3 - 2 * k);
    const dir = this.deathDir; // +1 falls backward, -1 falls forward
    B.hips.position.y = lerp(B.hips.userData.bindP.y, 0.2, e);
    rot(B.hips, -dir * 1.45 * e, this.deathTwist * e, this.deathTwist * 0.5 * e);
    rot(B.spine, dir * -0.15 * e, 0, 0);
    rot(B.head, -dir * 0.3 * e, this.crooked, 0);
    armDir(B.shoulderL, true, 0.8, -0.2 + (dir > 0 ? 0.4 : -0.4) * e, 0.3);
    armDir(B.shoulderR, false, 0.8, -0.2 + (dir > 0 ? 0.4 : -0.4) * e, -0.2);
    rot(B.hipL, -0.3 * e * dir, 0, 0.1);
    rot(B.kneeL, 0.6 * e, 0, 0);
    rot(B.hipR, 0.2 * e, 0, -0.15);
    rot(B.kneeR, 0.3 * e, 0, 0);
    if (this.crawler) B.hips.position.y = 0.2;
  }

  updateHitboxes(frame) {
    if (this.hit.frame === frame) return;
    this.hit.frame = frame;
    this.root.updateMatrixWorld(true);
    const B = this.B;
    const h = this.hit;
    boneWorld(B.head, h.head, 0, 0.17, 0.02);
    boneWorld(B.hips, h.hips, 0, 0.0, 0);
    boneWorld(B.chest, h.chest, 0, 0.12, 0);
    const L = h.limbs;
    boneWorld(B.hipL, L[0][0]);
    boneWorld(B.kneeL, L[0][1]);
    boneWorld(B.kneeL, L[1][0]);
    boneWorld(B.ankleL, L[1][1]);
    boneWorld(B.hipR, L[2][0]);
    boneWorld(B.kneeR, L[2][1]);
    boneWorld(B.kneeR, L[3][0]);
    boneWorld(B.ankleR, L[3][1]);
    boneWorld(B.shoulderL, L[4][0]);
    boneWorld(B.elbowL, L[4][1]);
    boneWorld(B.elbowL, L[5][0]);
    boneWorld(B.elbowL, L[5][1], 0.3, 0, 0);
    boneWorld(B.shoulderR, L[6][0]);
    boneWorld(B.elbowR, L[6][1]);
    boneWorld(B.elbowR, L[7][0]);
    boneWorld(B.elbowR, L[7][1], -0.3, 0, 0);
  }

  raycast(o, d, maxDist) {
    const h = this.hit;
    // coarse sphere
    _v.copy(h.hips).add(h.chest).multiplyScalar(0.5);
    if (raySphere(o, d, _v, 1.25 * this.root.scale.x + (this.type === 'bloater' ? 0.3 : 0)) < 0) return null;
    let best = Infinity;
    let part = null;
    if (!this.headless) {
      const t = raySphere(o, d, h.head, 0.16 * this.root.scale.x);
      if (t >= 0 && t < best) {
        best = t;
        part = 'head';
      }
    }
    const tr = rayCapsule(o, d, h.hips, h.chest, (this.type === 'bloater' ? 0.32 : 0.21) * this.root.scale.x);
    if (tr >= 0 && tr < best) {
      best = tr;
      part = 'torso';
    }
    for (let i = 0; i < 8; i++) {
      if (this.crawler && i < 4) continue;
      const tl = rayCapsule(o, d, h.limbs[i][0], h.limbs[i][1], i < 4 ? 0.085 : 0.065);
      if (tl >= 0 && tl < best) {
        best = tl;
        part = 'limb';
      }
    }
    if (!part || best > maxDist) return null;
    return { zombie: this, dist: best, part, point: o.clone().addScaledVector(d, best) };
  }
}

export class ZombieManager {
  constructor(game, avatars) {
    this.game = game;
    this.world = game.world;
    this.scene = game.scene;
    this.avatars = avatars;
    this.pool = [];
    this.frame = 0;
    this.flowT = 0;
    this.flowDirty = true;
    this.hash = new Map();
    this.behindT = 0;
    this.stepBudget = 6;
  }

  reset() {
    for (const z of this.pool) z.despawn();
    this.flowDirty = true;
  }

  get aliveCount() {
    let n = 0;
    for (const z of this.pool) if (z.alive) n++;
    return n;
  }

  get alive() {
    return this.pool.filter((z) => z.alive);
  }

  canSpawn() {
    return this.aliveCount < MAX_ALIVE;
  }

  spawn(sp, opts) {
    let z = this.pool.find((p) => !p.active);
    if (!z) {
      if (this.pool.length >= MAX_POOL) {
        // reclaim the oldest corpse
        z = this.pool.filter((p) => !p.alive).sort((a, b) => b.deathT - a.deathT)[0];
        if (!z) return null;
        z.despawn();
      } else {
        z = new Zombie(this, this.avatars.figures[this.pool.length % this.avatars.figures.length], this.avatars);
        this.pool.push(z);
      }
    }
    z.spawn(sp, opts);
    return z;
  }

  recycle(z) {
    // pulled out of play (stuck / too far) and handed back to the director's queue
    z.despawn();
    this.game.director.onRecycled(z);
  }

  markFlowDirty() {
    this.flowDirty = true;
  }

  target() {
    const g = this.game;
    const lure = g.grenades.activeLure();
    if (lure) return { x: lure.pos.x, y: lure.pos.y - 1.4, z: lure.pos.z, isPlayer: false, lure };
    const ch = g.player.ch;
    return { x: ch.x, y: ch.y, z: ch.z, isPlayer: true };
  }

  separation(z) {
    const out = { x: 0, z: 0 };
    const ch = z.ch;
    const cx = Math.floor(ch.x / 1.5);
    const cz = Math.floor(ch.z / 1.5);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const arr = this.hash.get(ix * 4096 + iz);
        if (!arr) continue;
        for (const o of arr) {
          if (o === z) continue;
          const dx = ch.x - o.ch.x;
          const dz = ch.z - o.ch.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 0.56 && d2 > 1e-6 && Math.abs(ch.y - o.ch.y) < 1.2) {
            const d = Math.sqrt(d2);
            const f = (0.75 - d) / 0.75;
            out.x += (dx / d) * f;
            out.z += (dz / d) * f;
          }
        }
      }
    }
    return out;
  }

  update(dt) {
    this.frame++;
    const tgt = this.target();
    // flow field toward the player / lure
    this.flowT -= dt;
    const cell = this.world.nav.idx(tgt.x, tgt.z);
    if (this.flowDirty || (this.flowT <= 0 && cell !== this.lastFlowCell)) {
      this.world.nav.computeFlow(tgt.x, tgt.z);
      this.lastFlowCell = cell;
      this.flowDirty = false;
      this.flowT = 0.3;
    }
    // spatial hash
    this.hash.clear();
    for (const z of this.pool) {
      if (!z.alive) continue;
      const k = Math.floor(z.ch.x / 1.5) * 4096 + Math.floor(z.ch.z / 1.5);
      let arr = this.hash.get(k);
      if (!arr) this.hash.set(k, (arr = []));
      arr.push(z);
    }
    this.stepBudget = Math.min(8, this.stepBudget + dt * 7);
    for (const z of this.pool) if (z.active) z.update(dt, tgt);
    // "behind you" growl
    this.behindT -= dt;
    if (this.behindT <= 0 && tgt.isPlayer) {
      const p = this.game.player;
      for (const z of this.pool) {
        if (!z.alive || z.state === 'rise') continue;
        const dx = z.ch.x - p.ch.x;
        const dz = z.ch.z - p.ch.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.5 && d > 0.5 && (dx * p.forward.x + dz * p.forward.z) / d < -0.35) {
          audio.zombie('behind', z.headPos(), { volume: 1.1, force: true });
          this.behindT = 7;
          break;
        }
      }
    }
    // EMZ crackle on the nearest one
    let nearest = null;
    let nd = 14;
    for (const z of this.pool) {
      if (!z.alive || z.type !== 'emz') continue;
      const d = Math.hypot(z.ch.x - tgt.x, z.ch.z - tgt.z);
      if (d < nd) {
        nd = d;
        nearest = z;
      }
    }
    if (nearest) {
      const v = audio.loop('emz', 'crackle_loop', { pos: nearest.headPos(), volume: 0.6, refDistance: 2.5 });
      if (v && v.setPosition) v.setPosition(nearest.headPos());
    } else audio.stopLoop('emz');
  }

  // ---- queries used by weapons ------------------------------------------------------------
  raycast(o, d, maxDist) {
    const out = [];
    for (const z of this.pool) {
      if (!z.alive || z.state === 'rise' && z.t < 0.5) continue;
      // cheap reject before touching bones
      const tx = z.ch.x - o.x;
      const ty = z.ch.y + 1 - o.y;
      const tz = z.ch.z - o.z;
      const along = tx * d.x + ty * d.y + tz * d.z;
      if (along < -2 || along > maxDist + 2) continue;
      const perp2 = tx * tx + ty * ty + tz * tz - along * along;
      if (perp2 > 4) continue;
      z.updateHitboxes(this.frame);
      const h = z.raycast(o, d, maxDist);
      if (h) out.push(h);
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  inCone(o, d, range, angle) {
    const out = [];
    const cosA = Math.cos(angle);
    for (const z of this.pool) {
      if (!z.alive) continue;
      _v.set(z.ch.x - o.x, z.ch.y + 1.0 - o.y, z.ch.z - o.z);
      const dist = _v.length();
      if (dist > range) continue;
      if (_v.dot(d) / Math.max(0.01, dist) < cosA && dist > 1.2) continue;
      if (!this.world.physics.visible(o.x, o.y, o.z, z.ch.x, z.ch.y + 1.0, z.ch.z)) continue;
      out.push(z);
    }
    return out;
  }

  meleeTarget(eye, fwd, range) {
    let best = null;
    let bestD = range;
    for (const z of this.pool) {
      if (!z.alive || z.state === 'rise') continue;
      const dx = z.ch.x - eye.x;
      const dz = z.ch.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const dy = z.ch.y + 1.0 - eye.y;
      if (Math.abs(dy) > 1.6) continue;
      const fl = Math.hypot(fwd.x, fwd.z) || 1;
      if ((dx * fwd.x + dz * fwd.z) / (d * fl) < 0.45 && d > 0.7) continue;
      best = z;
      bestD = d;
    }
    return best;
  }

  bestAimTarget(cam, maxAngle, maxDist) {
    const fwd = _v2;
    cam.getWorldDirection(fwd);
    let best = null;
    let bestA = maxAngle;
    for (const z of this.pool) {
      if (!z.alive || z.state === 'rise') continue;
      z.updateHitboxes(this.frame);
      const aim = z.headless ? z.hit.chest : _v.copy(z.hit.chest).lerp(z.hit.head, 0.55);
      const dx = aim.x - cam.position.x;
      const dy = aim.y - cam.position.y;
      const dz = aim.z - cam.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxDist) continue;
      const a = Math.acos(clamp((dx * fwd.x + dy * fwd.y + dz * fwd.z) / d, -1, 1));
      if (a < bestA) {
        if (!this.world.physics.visible(cam.position.x, cam.position.y, cam.position.z, aim.x, aim.y, aim.z)) continue;
        bestA = a;
        const yawTo = Math.atan2(-dx, -dz);
        const camYaw = Math.atan2(-fwd.x, -fwd.z);
        const pitchTo = Math.atan2(dy, Math.hypot(dx, dz));
        const camPitch = Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z));
        best = { zombie: z, yawErr: -wrapAngle(yawTo - camYaw), pitchErr: pitchTo - camPitch };
      }
    }
    return best;
  }

  pushPlayer(ch) {
    for (const z of this.pool) {
      if (!z.alive || z.state === 'rise') continue;
      const dx = ch.x - z.ch.x;
      const dz = ch.z - z.ch.z;
      const d2 = dx * dx + dz * dz;
      const r = ch.r + 0.28;
      if (d2 < r * r && d2 > 1e-6 && Math.abs(ch.y - z.ch.y) < 1.4) {
        const d = Math.sqrt(d2);
        const push = r - d;
        ch.x += (dx / d) * push;
        ch.z += (dz / d) * push;
      }
    }
  }

  // ---- damage + death ---------------------------------------------------------------------
  damage(z, amount, info) {
    if (!z.alive) return;
    const game = this.game;
    if (info.source === 'microwave') {
      if (z.cook <= 0) {
        z.cook = 0.01;
        audio.zombie('elec', z.headPos(), { volume: 1, force: true });
      }
      return;
    }
    const insta = game.powerups.active('insta');
    if (insta && info.source !== 'slam-light') amount = z.health + 1;
    z.health -= amount;
    const P = game.particles;
    const pt = info.point || z.hit.chest;
    if (info.source === 'bullet' || info.source === 'melee') {
      if (z.type === 'emz') P.electric(pt.x, pt.y, pt.z, 6);
      P.blood(pt.x, pt.y, pt.z, info.dir || _v.set(0, 0, 0), info.part === 'head' ? 1.4 : 1, z.ch.y);
      if (Math.random() < 0.35) audio.play3D('impact_flesh', pt, { volume: 0.5, refDistance: 3 });
    }
    z.flinch = Math.min(1, z.flinch + (info.part === 'head' ? 0.8 : 0.45));
    z.flinchDir = info.dir ? Math.sign(info.dir.x * Math.cos(z.yaw) - info.dir.z * Math.sin(z.yaw)) || 1 : 1;
    if (info.knock) {
      z.stagger = 0.5;
      const d = info.dir || _v.set(0, 0, 1);
      z.ch.vx += d.x * info.knock;
      z.ch.vz += d.z * info.knock;
    }
    if (z.health <= 0) {
      this.kill(z, info);
      game.hud.hitmarker(true, info.part === 'head');
    } else {
      if (info.source === 'bullet' || info.source === 'melee') {
        game.addPoints(10, false);
        game.hud.hitmarker(false, false);
      }
      // explosives can take the legs off
      if (info.source === 'explosive' && !z.crawler && Math.random() < 0.3 && z.type !== 'exo') {
        z.crawler = true;
        z.B.kneeL.scale.setScalar(0.01);
        z.B.kneeR.scale.setScalar(0.01);
        P.gib(z.ch.x, z.ch.y + 0.5, z.ch.z, 0.6);
      }
      if (info.source === 'slam-light') z.stagger = 0.8;
    }
  }

  kill(z, info, gibbed = false) {
    if (!z.alive) return;
    const game = this.game;
    z.alive = false;
    z.state = 'dead';
    z.deathT = 0;
    z.sinking = 0;
    z.cook = 0;
    z.material.emissiveIntensity = 0.4;
    const d = info.dir || _v.set(0, 0, 1);
    const facing = Math.sin(z.yaw) * d.x + Math.cos(z.yaw) * d.z;
    z.deathDir = facing < 0 ? 1 : -1;
    z.deathTwist = rand(-0.5, 0.5);
    if (z.voice) {
      z.voice.stop(0.1);
      z.voice = null;
    }
    const P = game.particles;
    const head = z.hit.head;
    if (info.part === 'head' && (info.source === 'bullet' || info.source === 'melee')) {
      z.headless = true;
      z.B.head.scale.setScalar(0.001);
      P.gib(head.x, head.y, head.z, 1);
      audio.zombie('gib', head, { volume: 1, force: true });
      audio.play('headshot', { volume: 0.45 });
    } else if (info.source === 'microwave' || gibbed) {
      P.gib(z.ch.x, z.ch.y + 1.0, z.ch.z, 2.4);
      audio.zombie('gib', z.headPos(), { volume: 1.2, force: true });
      z.mesh.visible = false;
      z.deathT = 4.9;
    } else if (info.source === 'explosive') {
      P.gib(z.ch.x, z.ch.y + 1.0, z.ch.z, 1.2);
      if (Math.random() < 0.5) z.B.shoulderL.scale.setScalar(0.01);
      if (Math.random() < 0.5) z.B.elbowR.scale.setScalar(0.01);
    }
    if (chance(0.55)) audio.zombie('death', z.headPos(), { volume: 1, force: true });
    setTimeout(() => z.active && audio.zombie('fall', _v.set(z.ch.x, z.ch.y, z.ch.z), { volume: 0.7, force: true }), 500);
    // EMZ discharge: knocks your exo offline if you're close
    if (z.type === 'emz') {
      P.electric(z.ch.x, z.ch.y + 1, z.ch.z, 30, 3);
      const p = game.player;
      if (Math.hypot(p.ch.x - z.ch.x, p.ch.z - z.ch.z) < 5.5) game.empPlayer(6);
    }
    if (z.type === 'bloater') game.explode(new THREE.Vector3(z.ch.x, z.ch.y + 1, z.ch.z), 4.5, 900, { toxic: true });
    game.onZombieKilled(z, info);
  }
}
