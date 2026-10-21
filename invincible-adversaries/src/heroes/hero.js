import * as THREE from 'three';
import { instantiate } from '../engine/assets.js';
import { Rig, RIG_DEFS } from '../anim/rig.js';
import { Animator, STYLES } from '../anim/animator.js';
import { dressHero } from './materials.js';
import { HEROES, RULES } from './data.js';
import { ARENA } from '../world/arena.js';
import { clamp, clamp01, damp, dampT, lerp, smoothstep, wrapAngle, yawOf, pitchOf, TAU, DEG, ease, rand } from '../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), X_AXIS = new THREE.Vector3(1, 0, 0);
// fastest the body turns (rad/s): an aim flick behind turns the hero over a few frames instead of
// flipping it in one, while aimDir (which every attack uses) still changes instantly
const TURN_RATE = 18;
const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = 28;
let UID = 1;

export function emptyIntents() {
  return {
    mx: 0, mz: 0, up: false, down: false, jump: false, jumpHeld: false, flyToggle: false,
    primary: false, primaryPressed: false, secondary: false, secondaryPressed: false,
    a1: false, a2: false, a3: false, ult: false, ultHeld: false,
    aimDir: new THREE.Vector3(0, 0, 1), aimPoint: new THREE.Vector3(0, 0, 10), aimOrigin: new THREE.Vector3(), aimHero: null,
  };
}

export class Hero {
  constructor(world, key, team, opts = {}) {
    this.world = world; this.key = key; this.def = HEROES[key]; this.team = team;
    this.id = UID++;
    this.name = opts.name || this.def.name;
    this.isPlayer = !!opts.isPlayer;
    // scene graph
    this.root = new THREE.Group(); this.visual = new THREE.Group(); this.space = new THREE.Group();
    this.root.add(this.visual); this.visual.add(this.space);
    const inst = instantiate(key);
    this.model = inst.scene;
    this.space.add(this.model);
    this.space.updateMatrixWorld(true);
    this.dress = dressHero(this.model, key, team);
    this.U = this.dress.uniforms;
    this.rig = new Rig(this.space, RIG_DEFS[key]);
    this.anim = new Animator(this.rig, STYLES[key]);
    this.anim.onFootstep = (side, k) => this.onFootstep(side, k);
    {
      // dissolve noise frequency in world units
      let s = 1; this.model.traverse((o) => { if (o.isSkinnedMesh && s === 1) s = o.matrixWorld.getMaxScaleOnAxis(); });
      this.U.uDissolveScale.value = 6.5 * s;
    }
    world.scene.add(this.root);
    // state
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.intents = emptyIntents();
    this.ctrl = null;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.overhealth = 0; this.ohT = 0;
    this.bubble = null;
    this.status = { slow: 0, slowT: 0, vuln: 0, vulnT: 0, stunT: 0, dr: 0, drT: 0, boost: 0, boostT: 0, rootT: 0 };
    this.mode = 'ground';
    this.grounded = true;
    this.groundY = 0;
    this.flyEnergy = 1;
    this.cd = {}; this.charges = {};
    this.ult = 0;
    this.lastHurt = -99; this.lastCombat = -99; this.lastDamage = -99;
    this.dead = false; this.deadT = 0; this.respawnT = 0; this.killDir = new THREE.Vector3(0, 0, 1);
    this.invuln = 0; this.untargetable = false; this.hidden = false;
    this.override = null; // ability-driven movement
    this.carriedBy = null; this.carrying = null;
    this.tumbleT = 0; this.tumbleFly = false;
    this.landed = 0; this.jumped = false;
    this.footT = 0;
    this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1);
    this.glow = 0; this.glowTarget = 0;
    this.dissolve = 0; this.dissolveTarget = 0;
    this.spawnProtect = 0;
    this.kills = 0; this.deaths = 0; this.damageDone = 0; this.healingDone = 0;
    this.kit = null;
    this.boost = 0;
    this.combatStance = 0;
    this.capA = new THREE.Vector3(); this.capB = new THREE.Vector3();
    this.bodyUp = new THREE.Vector3(0, 1, 0);
    this.prevGrounded = true;
    this.unstoppable = key === 'omniman';
    this.spawnAt(ARENA.spawns[team]);
  }

  get radius() { return this.def.radius; }
  get height() { return this.def.height; }
  get alive() { return !this.dead; }
  get flying() { return this.mode === 'fly'; }
  get ultPct() { return clamp01(this.ult / this.def.ultCost); }
  get ultReady() { return this.ult >= this.def.ultCost; }
  get camHeight() { return this.def.camHeight; }
  get camDist() { return this.def.camDist; }
  get speedFactor() { return (1 - (this.unstoppable ? 0 : this.status.slow)); }
  get targetable() { return !this.dead && !this.untargetable && !this.hidden; }

  spawnAt(p) {
    this.root.updateMatrixWorld(true);
    const from = _m.copy(this.root.matrixWorld);
    this.pos.copy(p);
    this.pos.x += rand(-4, 4); this.pos.z += rand(-2, 2);
    this.vel.set(0, 0, 0);
    this.yaw = this.visYaw = p.z < 0 ? 0 : Math.PI;
    this.aimDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.root.rotation.set(0, this.yaw, 0);
    this.mode = 'ground'; this.grounded = true;
    this.anim.feet.L.init = false; this.anim.feet.R.init = false;
    // capes/hair are simulated in world space: carry them along, or they whip across the map
    this.root.updateMatrixWorld(true);
    this.anim.chains.transform(from.invert().premultiply(this.root.matrixWorld));
  }

  // ------------------------------------------------------------------ update
  update(dt, time) {
    this.time = time;
    const it = this.intents;
    if (this.dead) { this.updateDead(dt); this.updateVisual(dt); return; }
    // timers
    const st = this.status;
    for (const k of ['slowT', 'vulnT', 'drT', 'boostT']) if (st[k] > 0) { st[k] -= dt; if (st[k] <= 0) { st[k] = 0; st[k.replace('T', '')] = 0; } }
    if (st.stunT > 0) st.stunT -= dt;
    if (st.rootT > 0) st.rootT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.spawnProtect > 0) this.spawnProtect -= dt;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);
    if (this.ohT > 0) this.ohT -= dt; else if (this.overhealth > 0) this.overhealth = Math.max(0, this.overhealth - 60 * dt);
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) { this.bubble.fx && this.bubble.fx.pop(false); this.bubble = null; }
    }
    // passive regen
    const rg = this.def.regen;
    if (time - this.lastHurt > rg.delay && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + rg.rate * dt);
    // ult passive charge
    this.ult = Math.min(this.def.ultCost, this.ult + RULES.ultPassive * dt * (this.world.settings.fastUlt ? 40 : 1));
    if (this.world.settings.noCooldowns) for (const k in this.cd) this.cd[k] = Math.min(this.cd[k], 0.05);
    this.combatStance = damp(this.combatStance, time - this.lastCombat < 3 ? 1 : 0, 3, dt);

    // control
    const stunned = st.stunT > 0 || !!this.carriedBy;
    if (!stunned) this.aimDir.copy(it.aimDir);
    if (this.kit && !stunned) this.kit.update(dt, it);
    if (this.carriedBy) {
      // position driven by carrier
      this.mode = 'tumble'; this.tumbleFly = false;
    } else if (this.override) {
      const keep = this.override.update(dt);
      if (keep === false) { const o = this.override; this.override = null; o.onEnd && o.onEnd(); }
    } else if (this.mode === 'tumble') {
      this.tumbleT -= dt;
      this.vel.y -= GRAVITY * dt;
      this.vel.x = damp(this.vel.x, 0, 1.2, dt); this.vel.z = damp(this.vel.z, 0, 1.2, dt);
      this.integrate(dt);
      if (this.grounded && this.tumbleT < 0.2) {
        this.mode = 'ground';
        this.landed = 6;
        if (this.kit && this.kit.clips && this.kit.clips.getup) this.anim.play(this.kit.clips.getup);
      } else if (!this.grounded && this.tumbleT < 0) {
        // recover in mid-air: fliers knocked out of flight stabilise, everyone else falls with air control
        const f = this.def.flight;
        this.mode = this.tumbleFly && f && (f.unlimited || this.flyEnergy > 0.15) ? 'fly' : 'air';
      }
    } else {
      this.move(dt, stunned ? null : it);
    }
    // facing
    if (!this.override || this.override.faceAim) {
      const ay = yawOf(this.aimDir);
      this.yaw = this.mode === 'tumble' ? this.yaw : (stunned ? this.yaw : ay);
    }
    const turn = wrapAngle(this.yaw - this.visYaw), maxTurn = TURN_RATE * dt;
    this.visYaw = wrapAngle(this.visYaw + clamp(turn, -maxTurn, maxTurn));
    this.root.rotation.set(0, this.visYaw, 0);
    this.updateVisual(dt);
  }

  move(dt, it) {
    const d = this.def;
    const sf = this.speedFactor * (this.status.rootT > 0 ? 0 : 1);
    const ay = it ? yawOf(it.aimDir) : this.yaw;
    const fx = Math.sin(ay), fz = Math.cos(ay);
    const rx = -Math.cos(ay), rz = Math.sin(ay);
    const mx = it ? it.mx : 0, mz = it ? it.mz : 0;
    const canFly = !!d.flight;
    // toggle flight
    if (it && canFly) {
      const tryFly = it.flyToggle || (it.jump && !this.grounded && this.mode === 'air') || (this.mode === 'air' && it.jumpHeld && this.vel.y < -2);
      if (this.mode !== 'fly' && tryFly && (d.flight.unlimited || this.flyEnergy > 0.15)) {
        this.mode = 'fly';
        this.vel.y = Math.max(this.vel.y, 3);
        this.world.sfx('takeoff', this.pos, { vol: 0.7 });
        this.world.fx.dustRing(this.pos, { n: this.grounded ? 16 : 0, speed: 8, size: 0.8, size1: 2.4 });
        this.grounded = false;
      } else if (this.mode === 'fly' && it.flyToggle) {
        this.mode = 'air';
      }
    }
    if (this.mode === 'fly') {
      // energy
      if (!d.flight.unlimited) {
        const hover = Math.hypot(mx, mz) < 0.1 && !it?.up;
        this.flyEnergy -= dt / d.flight.duration * (hover ? 0.55 : 1);
        if (this.flyEnergy <= 0) { this.flyEnergy = 0; this.mode = 'air'; }
      }
      const spd = d.flight.speed * sf * (1 + this.boost * 0.5);
      const ad = it ? it.aimDir : _u.set(fx, 0, fz);
      _v.set(0, 0, 0);
      _v.addScaledVector(ad, mz);
      _v.x += rx * mx; _v.z += rz * mx;
      if (it && it.up) _v.y += 1;
      if (it && it.down) _v.y -= 1;
      if (_v.lengthSq() > 1) _v.normalize();
      _v.multiplyScalar(spd);
      const accel = d.flight.accel;
      _w.subVectors(_v, this.vel);
      const maxDv = accel * dt * (_v.lengthSq() < 0.01 ? 0.8 : 1);
      if (_w.length() > maxDv) _w.setLength(maxDv);
      this.vel.add(_w);
      // gentle bob correction when hovering
      this.integrate(dt);
      if (this.grounded && this.vel.y <= 0.1 && (it && (it.down || _v.y < -0.5))) { this.mode = 'ground'; this.land(Math.max(Math.abs(this.vel.y), this.landedSoft || 0)); this.landedSoft = 0; }
      else if (this.grounded) { this.grounded = false; this.pos.y = this.groundY + 0.02; if (this.vel.y < 0) this.vel.y = 0; }
      return;
    }
    // ground / air
    if (!d.flight?.unlimited && this.grounded) this.flyEnergy = Math.min(1, this.flyEnergy + dt * (d.flight ? d.flight.regen : 1) / (d.flight ? d.flight.duration : 1) * 2.2);
    let wx = fx * mz + rx * mx, wz = fz * mz + rz * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const spd = d.speed * sf;
    wx *= spd; wz *= spd;
    const accel = this.grounded ? (wl > 0.05 ? 75 : 55) : 24;
    const dvx = wx - this.vel.x, dvz = wz - this.vel.z;
    const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
    if (dl > maxDv) { this.vel.x += dvx / dl * maxDv; this.vel.z += dvz / dl * maxDv; }
    else { this.vel.x = wx; this.vel.z = wz; }
    if (it && it.jump && this.grounded) {
      this.vel.y = d.jump;
      this.grounded = false; this.mode = 'air';
      this.jumped = true;
      this.world.sfx('jump', this.pos, { vol: 0.5 });
    }
    if (!this.grounded) this.vel.y -= GRAVITY * dt;
    this.integrate(dt);
    if (this.grounded && this.mode === 'air') { this.mode = 'ground'; }
    if (!this.grounded && this.mode === 'ground') this.mode = 'air';
  }

  land(speed) {
    this.landed = speed;
    if (speed > 6) {
      this.world.sfx(this.key === 'omniman' ? 'step_heavy' : 'land', this.pos, { vol: clamp(speed / 20, 0.3, 1) });
      this.world.fx.dustRing(this.pos, { n: Math.round(clamp(speed, 6, 26)), speed: speed * 0.5, size: 0.6, size1: 1.8, life: 0.8 });
      if (speed > 16) { this.world.fx.ring(this.pos, { r1: speed * 0.25, life: 0.35, intensity: 1 }); this.world.shakeAt(this.pos, clamp(speed / 60, 0, 0.5)); }
    }
  }

  /** move with collisions against ground, obstacles, arena bounds */
  integrate(dt) {
    const p = this.pos;
    p.addScaledVector(this.vel, dt);
    const w = this.world;
    const r = this.radius;
    // obstacles
    this.groundY = 0;
    for (const o of w.obstacles) {
      if (o.type === 'cyl') {
        if (p.y > o.h) continue;
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), rr = o.r + r;
        if (d < rr) { const k = (rr - d) / (d || 1); p.x += dx * k; p.z += dz * k; this.onWallHit && this.onWallHit(); }
      } else {
        const mn = o.min, mx = o.max;
        const inX = p.x > mn.x - r && p.x < mx.x + r, inZ = p.z > mn.z - r && p.z < mx.z + r;
        if (!inX || !inZ) continue;
        if (p.y >= mx.y - 0.35) { this.groundY = Math.max(this.groundY, mx.y); continue; }
        if (p.y + this.height < mn.y) continue;
        // push out along minimal axis
        const pl = p.x - (mn.x - r), pr = (mx.x + r) - p.x, pb = p.z - (mn.z - r), pf = (mx.z + r) - p.z;
        const m = Math.min(pl, pr, pb, pf);
        if (m === pl) p.x = mn.x - r; else if (m === pr) p.x = mx.x + r; else if (m === pb) p.z = mn.z - r; else p.z = mx.z + r;
        this.onWallHit && this.onWallHit();
      }
    }
    // feet inside a box's top band (rising up a wall, stepping onto a ledge): mantle onto the top
    // rather than letting forward motion carry the body into the box
    if (p.y < this.groundY) { p.y = this.groundY; if (this.vel.y < 0) this.vel.y = 0; }
    // bounds
    const R = Math.hypot(p.x, p.z);
    if (R > ARENA.boundR) { p.x *= ARENA.boundR / R; p.z *= ARENA.boundR / R; }
    if (p.y > ARENA.ceiling) { p.y = ARENA.ceiling; if (this.vel.y > 0) this.vel.y = 0; }
    // ground
    const was = this.grounded;
    if (p.y <= this.groundY + 0.001 && this.vel.y <= 0.01) {
      const impact = -this.vel.y;
      p.y = this.groundY;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
      if (!was && this.mode !== 'fly') this.land(impact);
      else if (!was && this.mode === 'fly') this.landedSoft = impact;
    } else if (p.y > this.groundY + 0.05) {
      this.grounded = false;
    }
  }

  knock(v, { force = false, tumble = true } = {}) {
    if (this.dead) return;
    if (this.unstoppable && !force) return;
    this.vel.add(v);
    if (tumble && v.length() > 9 && !this.override) {
      if (this.mode !== 'tumble') this.tumbleFly = this.mode === 'fly';
      this.mode = 'tumble'; this.tumbleT = 0.5 + v.length() * 0.03;
      this.grounded = false; this.pos.y += 0.05;
      this.anim.tumbleVel.set(rand(-6, 6), rand(-2, 2), rand(-6, 6));
    } else if (this.mode === 'ground' && v.y > 2) { this.grounded = false; this.mode = 'air'; }
  }

  // ------------------------------------------------------------------ visuals
  updateVisual(dt) {
    const a = this.anim;
    const mode = this.dead ? 'dead' : (this.mode === 'tumble' ? 'tumble' : (this.override && this.override.animMode) || this.mode);
    const s = this._animState ||= {};
    s.mode = mode === 'stun' ? 'ground' : mode;
    s.vel = this.override && this.override.animVel ? this.override.animVel : this.vel;
    s.yaw = this.visYaw;
    s.aimDir = this.aimDir;
    s.landed = this.landed; this.landed = 0;
    s.groundDist = this.pos.y - this.groundY;
    s.floorY = this.groundY;
    s.boost = this.override && this.override.boost !== undefined ? this.override.boost : this.boost;
    s.combat = this.combatStance;
    s.deadT = this.deadT;
    s.flutter = this.override && this.override.flutter || 0;
    s.noLean = !!(this.override && this.override.noLean);
    s.slide = !!(this.override && this.override.slide);
    // tumbling: 0 while spinning, rising to 1 as touchdown nears (and while skidding on the ground)
    if (mode === 'tumble' && !this.carriedBy) {
      const tti = this.vel.y < -0.5 ? (this.pos.y - this.groundY) / -this.vel.y : 9;
      s.tumbleSettle = this.grounded ? 1 : 1 - smoothstep(0.12, 0.5, tti);
    } else s.tumbleSettle = 0;
    this.root.updateMatrixWorld(true);
    a.update(dt, s);
    // body tilt (flight / tumble / death)
    let q;
    if (this.dead) {
      const k = ease.in(clamp01(this.deadT / 0.55));
      const bounce = this.deadT > 0.55 ? Math.sin(clamp01((this.deadT - 0.55) / 0.25) * Math.PI) * 0.08 : 0;
      _v.set(this.killDir.z, 0, -this.killDir.x).normalize(); // axis perpendicular to fall direction (world)
      // convert world axis to root-local
      _q.copy(this.root.quaternion).invert();
      _v.applyQuaternion(_q);
      q = _q.setFromAxisAngle(_v, (k * 86 - bounce * 40) * DEG);
      this.visual.quaternion.copy(q);
      this.visual.position.set(0, 0.12 * k, 0);
    } else if (mode === 'tumble') {
      const tv = a.tumbleVel, k = s.tumbleSettle;
      if (this.carriedBy) a.tumble.slerp(_q.setFromAxisAngle(X_AXIS, -0.35), dampT(6, dt)); // held: limp, leaning back
      else {
        // spin while airborne; coming down, the spin itself unwinds toward upright (moving the state
        // rather than blending a spinning target, which flips sides whenever it passes 180°)
        a.tumble.multiply(_q.setFromEuler(_e.set(tv.x * dt * (1 - k), tv.y * dt * (1 - k), tv.z * dt * (1 - k))));
        if (k > 0) a.tumble.slerp(_q.identity(), dampT(16 * k, dt));
      }
      this.visual.quaternion.slerp(a.tumble, dampT(10 + 8 * k, dt));
      // body tilt picks up from here when the tumble ends, so recovery rotates instead of popping
      a.bodyQ.copy(this.visual.quaternion);
      const pv = _v.set(0, this.rig.hipsHeight, 0);
      this.visual.position.copy(pv).sub(_w.copy(pv).applyQuaternion(this.visual.quaternion));
    } else {
      a.tumble.identity();
      q = a.bodyTilt(dt, mode);
      this.visual.quaternion.copy(q);
      const pv = _v.set(0, this.rig.hipsHeight, 0);
      this.visual.position.copy(pv).sub(_w.copy(pv).applyQuaternion(q));
    }
    this.bodyUp.set(0, 1, 0).applyQuaternion(this.visual.quaternion).applyQuaternion(this.root.quaternion);
    // material fx
    this.flash = Math.max(0, this.flash - dt * 7);
    this.U.uFlash.value = this.flash;
    this.U.uFlashColor.value.copy(this.flashColor);
    this.glow = damp(this.glow, this.glowTarget, 6, dt);
    this.U.uGlow.value = this.glow;
    this.dissolve = damp(this.dissolve, this.dissolveTarget, this.dissolveTarget > this.dissolve ? 1.6 : 2.4, dt);
    if (Math.abs(this.dissolve - this.dissolveTarget) < 0.003) this.dissolve = this.dissolveTarget;
    this.U.uDissolve.value = this.dissolve;
    this.U.uTime.value = this.time || 0;
    this.root.visible = !this.hidden && this.dissolve < 0.995;
    // capsule
    const hh = this.rig.hipsHeight;
    _v.set(0, hh, 0).applyQuaternion(this.visual.quaternion).add(this.visual.position).applyQuaternion(this.root.quaternion).add(this.pos);
    const half = this.height * 0.5 - this.radius;
    this.capA.copy(_v).addScaledVector(this.bodyUp, -half * 0.9);
    this.capB.copy(_v).addScaledVector(this.bodyUp, half * 1.05);
    this.center = this.center || new THREE.Vector3();
    this.center.copy(_v).addScaledVector(this.bodyUp, 0.1);
  }

  onFootstep(side, k) {
    if (this.dead || !this.grounded) return;
    const heavy = this.key === 'omniman';
    this.world.sfx(heavy ? 'step_heavy' : 'step', this.pos, { vol: (heavy ? 0.55 : 0.32) * k, minGap: 0.12, key: this.id, ref: 4 });
    if (heavy && k > 0.6) this.world.shakeAt(this.pos, 0.04);
  }

  // helpers for VFX attachment
  bonePos(part, out) {
    const r = this.rig;
    let b;
    switch (part) {
      case 'handL': b = r.side.L.hand.bone; break;
      case 'handR': b = r.side.R.hand.bone; break;
      case 'fistL': b = (r.side.L.fingers.middle && r.side.L.fingers.middle[0]) ? r.side.L.fingers.middle[0].bone : r.side.L.hand.bone; break;
      case 'fistR': b = (r.side.R.fingers.middle && r.side.R.fingers.middle[0]) ? r.side.R.fingers.middle[0].bone : r.side.R.hand.bone; break;
      case 'head': b = r.head.bone; break;
      case 'chest': b = r.spine[r.spine.length - 1].bone; break;
      case 'hips': b = r.hips.bone; break;
      case 'footL': b = r.side.L.foot.bone; break;
      case 'footR': b = r.side.R.foot.bone; break;
      default: b = r.hips.bone;
    }
    return b.getWorldPosition(out);
  }
  bubbleCenter(out) { return out.copy(this.center || this.pos); }
  /** radius of the active bubble shield (0 without one): hits land on it, not on the body */
  shieldRadius() { return this.bubble ? (this.bubble.fx ? this.bubble.fx.radius : this.height * 0.62) : 0; }
  chestPos(out) { return out.copy(this.center || this.pos).addScaledVector(this.bodyUp, 0.25); }

  // ------------------------------------------------------------------ death
  updateDead(dt) {
    this.deadT += dt;
    this.vel.y -= GRAVITY * dt;
    this.vel.x = damp(this.vel.x, 0, 3, dt); this.vel.z = damp(this.vel.z, 0, 3, dt);
    this.integrate(dt);
    if (this.deadT > 1.6) this.dissolveTarget = 1;
    this.respawnT -= this.world.realDt ?? dt; // a respawn timer doesn't pause for other heroes' hitstop
    if (this.respawnT <= 0) this.world.respawn(this);
  }

  die(killer, dir) {
    this.dead = true; this.deadT = 0;
    this.respawnT = RULES.respawn;
    this.killDir.copy(dir || _v.set(Math.sin(this.yaw + Math.PI), 0, Math.cos(this.yaw + Math.PI)));
    this.killDir.y = 0; if (this.killDir.lengthSq() < 0.01) this.killDir.set(0, 0, 1); this.killDir.normalize();
    this.endActions(true);
    this.anim.stop(0.1);
    this.mode = 'air';
    this.glowTarget = 0;
    this.deaths++;
  }

  /** end abilities, carries and the bubble (on death, and when the hero leaves the world) */
  endActions(died) {
    if (this.override) { const o = this.override; this.override = null; o.onEnd && o.onEnd(died); }
    if (this.carrying) { this.carrying.carriedBy = null; this.carrying = null; }
    if (this.carriedBy) { this.carriedBy.carrying = null; this.carriedBy = null; }
    if (this.bubble) { this.bubble.fx && this.bubble.fx.pop(true); this.bubble = null; }
    this.kit && this.kit.onDeath && this.kit.onDeath();
  }

  revive(at, hpFrac = 1) {
    this.dead = false; this.deadT = 0;
    if (at) this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp * hpFrac;
    this.mode = this.pos.y > 0.2 ? 'air' : 'ground';
    this.dissolve = 1; this.dissolveTarget = 0;
    this.visual.quaternion.identity(); this.visual.position.set(0, 0, 0);
    this.anim.bodyQ.identity(); this.anim.bodyTarget.identity();
    this.anim.feet.L.init = false; this.anim.feet.R.init = false;
    this.anim.chains.reset();
    this.status.stunT = 0; this.status.slow = 0; this.status.vuln = 0;
    this.flyEnergy = 1;
    this.invuln = 1.0; this.spawnProtect = 1.5;
    this.lastHurt = -99;
  }
}
