import * as THREE from 'three';
import { Kit } from '../kit.js';
import { clips, mirrorClip } from '../../anim/clip.js';
import { makeMask } from '../../anim/pose.js';
import { SHAPE } from '../../vfx/particles.js';
import { clamp, clamp01, rand, lerp } from '../../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// HDR colours: the kinetic charge he puts into things (hot pink) and its hottest flashes
const CHARGE = [4, 0.85, 2.1, 1];
const CHARGE_HOT = [4, 2.4, 3.2, 1];
const UPPER_ROOT = makeMask(['upper', { g: 'rootYaw', w: 0.7 }, { g: 'rootY', w: 0.6 }]);
const ARMS_SPINE = makeMask(['arms', 'spine', { g: 'head', w: 0.5 }]);
const FULL = makeMask(['all']);

const FLICK = {
  // a quick sidearm flick off the fingertips
  mask: UPPER_ROOT, fadeIn: 0.04, fadeOut: 0.16,
  keys: [
    { t: 0, p: { RikW: 1, Rik: [0.34, 0.02, 0.2], Rpole: [1, -0.5, -0.6], Rfist: 0.6, RhandFlex: -35, RforeTwist: -30, spineYaw: -10, rootYaw: -4 } },
    { t: 0.07, e: 'snap', p: { Rik: [0.02, 0.06, 0.96], RhandFlex: 25, Rfist: 0.2, Rspread: 0.5, spineYaw: 12, rootYaw: 5 } },
    { t: 0.2, e: 'out', p: { Rik: [0.04, 0.04, 0.9], RhandFlex: 10 } },
  ],
};

export const REX_CLIPS = clips({
  flickR: FLICK,
  flickL: mirrorClip(FLICK),
  // overhand throw of the charged rod
  rodThrow: {
    mask: ARMS_SPINE, fadeIn: 0.05, fadeOut: 0.25,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.35, 0.6, -0.3], Rpole: [1, -0.2, -0.6], Rfist: 1, LikW: 1, Lik: [0.2, -0.05, 0.7], Lpole: [1, -0.8, -0.2], Lfist: 0.4, spinePitch: -8, spineYaw: -20 } },
      { t: 0.16, e: 'snap', p: { Rik: [0.02, 0.12, 0.98], Rfist: 0.2, Rspread: 0.8, Lik: [0.3, -0.4, 0.25], spinePitch: 14, spineYaw: 18 } },
      { t: 0.36, p: { Rik: [0.05, 0.05, 0.9] } },
    ],
    events: [{ t: 0.15, e: 'throw' }],
  },
  // RMB again: a snap of the fingers and the rod goes up
  detonate: {
    mask: makeMask(['armR', { g: 'head', w: 0.4 }]), fadeIn: 0.04, fadeOut: 0.2,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.25, 0.3, 0.55], Rpole: [1, -0.6, -0.4], Rfist: 0.5, RhandFlex: -10, headPitch: -4 } },
      { t: 0.08, e: 'snap', p: { Rik: [0.2, 0.42, 0.62], Rfist: 0.95, RhandFlex: 12 } },
      { t: 0.3, p: {} },
    ],
  },
  // reaches back to the belt and lobs the grenade underhand
  grenadeLob: {
    mask: ARMS_SPINE, fadeIn: 0.05, fadeOut: 0.25,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.12, -0.95, -0.12], Rpole: [1, 0, -0.3], Rfist: 0.8, spinePitch: 14, spineYaw: -12 } },
      { t: 0.14, e: 'in', p: { Rik: [0.16, -0.85, -0.35], spinePitch: 16 } },
      { t: 0.26, e: 'out', p: { Rik: [0.05, 0.35, 0.9], Rfist: 0.1, Rspread: 0.7, spinePitch: -6, spineYaw: 10 } },
      { t: 0.45, p: { Rik: [0.06, 0.25, 0.85] } },
    ],
    events: [{ t: 0.1, e: 'grab' }, { t: 0.24, e: 'throw' }],
  },
  // both hands sweep out across the body, scattering coins
  fan: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.25,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [-0.15, -0.05, 0.42], Bpole: [1, -0.6, -0.4], Bfist: 0.8, spinePitch: 6, rootY: -0.06 } },
      { t: 0.12, e: 'snap', p: { Bik: [0.55, 0.05, 0.75], Bfist: 0, Bspread: 1, BhandFlex: 20, spinePitch: -2, rootY: -0.02 } },
      { t: 0.36, e: 'out', p: { Bik: [0.6, 0.02, 0.7] } },
    ],
    events: [{ t: 0.11, e: 'throw' }],
  },
  // a crouch, then the blast throws him up with his arms flung high
  blastJump: {
    mask: FULL, fadeIn: 0.03, fadeOut: 0.3,
    keys: [
      { t: 0, p: { rootY: -0.2, spinePitch: 22, Barm: [0.4, -0.7, -0.35], Belbow: 40, Bfist: 1, headPitch: -10 } },
      { t: 0.1, e: 'out', p: { rootY: 0.02, spinePitch: -10, Barm: [0.45, 0.55, -0.1], Belbow: 20, headPitch: -16 } },
      { t: 0.5, e: 'inout', p: { spinePitch: 4, Barm: [0.5, -0.3, 0.1], Belbow: 40, headPitch: 0 } },
    ],
  },
  // the ult: arms tense out, fists clenched, shaking with the charge building in him
  overcharge: {
    mask: makeMask(['upper']), fadeIn: 0.15, fadeOut: 0.2, loop: true, duration: 0.24,
    keys: [
      { t: 0, p: { Barm: [0.62, -0.62, 0.22], Belbow: 55, Bfist: 1, BforeTwist: -30, spinePitch: 8, headPitch: 6, browAnger: 1, jaw: 0.3 } },
      { t: 0.12, p: { Barm: [0.65, -0.6, 0.25], Belbow: 58, spinePitch: 9 } },
      { t: 0.24, p: { Barm: [0.62, -0.62, 0.22], Belbow: 55, spinePitch: 8 } },
    ],
  },
  // the moment he goes off: arms flung wide, head back
  splode: {
    mask: makeMask(['upper']), fadeIn: 0.03, fadeOut: 0.4,
    keys: [
      { t: 0, p: { Barm: [0.95, 0.25, 0.1], Belbow: 6, Bfist: 0, Bspread: 1, BhandFlex: -30, spinePitch: -24, headPitch: -28, jaw: 1 } },
      { t: 0.5, e: 'out', p: { Barm: [0.9, 0.1, 0.15], spinePitch: -14, headPitch: -16, jaw: 0.6 } },
    ],
  },
  getup: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.42, spinePitch: 40, headPitch: -20, Barm: [0.35, -0.85, 0.35], Belbow: 45, Bfist: 0.7 } },
      { t: 0.3, e: 'inout', p: { rootY: -0.08, spinePitch: 10, headPitch: 0 } },
    ],
  },
});

/** a prop baked into the model (the coin, the rod), taken off it for the kit to throw copies of */
function takeProp(h, name) {
  const src = h.model.getObjectByName(name);
  if (!src) return null;
  src.updateWorldMatrix(true, false);
  const sc = new THREE.Vector3(); src.matrixWorld.decompose(_v, new THREE.Quaternion(), sc);
  src.parent.remove(src);
  return { geo: src.geometry, map: src.material.map || null, scale: sc.x };
}

function grenadeMesh(fx) {
  if (!fx._rexGrenade) {
    const body = new THREE.SphereGeometry(0.11, 14, 10); body.scale(1, 1.2, 1);
    const band = new THREE.TorusGeometry(0.112, 0.016, 6, 18); band.rotateX(Math.PI / 2);
    const pin = new THREE.TorusGeometry(0.03, 0.008, 5, 10); pin.translate(0, 0.15, 0);
    fx._rexGrenade = {
      body, band, pin,
      shell: new THREE.MeshStandardMaterial({ color: 0x4b5338, roughness: 0.6, metalness: 0.3 }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.9, 2.2) }),
    };
    fx._rexGrenade.shell.userData.shared = fx._rexGrenade.glow.userData.shared = true;
  }
  const G = fx._rexGrenade, g = new THREE.Group();
  const b = new THREE.Mesh(G.body, G.shell); b.castShadow = true; g.add(b);
  g.add(new THREE.Mesh(G.band, G.glow), new THREE.Mesh(G.pin, G.shell));
  return g;
}

export class RexKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = REX_CLIPS;
    this.fireT = 0; this.hand = 0;
    this.rods = []; this.grenades = [];
    this.ultState = null;
    this.coin = takeProp(h, 'Rex_Coin');
    this.rod = takeProp(h, 'Rex_Rod');
    // what he charges glows hot pink (one material for every coin and rod he throws)
    this.chargedMat = new THREE.MeshStandardMaterial({ color: 0xffe2d0, map: this.coin && this.coin.map, emissive: new THREE.Color(1, 0.22, 0.55), emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.55 });
    this.rodMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, map: this.rod && this.rod.map, emissive: new THREE.Color(1, 0.22, 0.55), emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.4 });
    // the grenade on his belt: gone while Concussion Grenade recharges
    this.grenadeBone = h.rig.bones.get('grenade_02') || null;
    this.grenadeScale = this.grenadeBone ? this.grenadeBone.scale.clone() : null;
    this.belt = 1;
  }

  /** every frame, even while stunned, carried or dead: rods tick, grenades fly, the charge builds */
  tick(dt) {
    const h = this.h;
    if (this.ultState) this.ultTick(dt);
    for (const r of this.rods) this.rodTick(r, dt);
    this.rods = this.rods.filter((r) => !r.done);
    for (const g of this.grenades) this.grenadeTick(g, dt);
    this.grenades = this.grenades.filter((g) => !g.done);
    if (this.grenadeBone) {
      // it pops back onto the belt when the grenade is ready again
      this.belt = h.cd.a2 > 0 ? 0 : Math.min(1, this.belt + dt * 6);
      this.grenadeBone.scale.copy(this.grenadeScale).multiplyScalar(Math.max(0.001, this.belt));
    }
  }

  update(dt, it) {
    super.update(dt);
    const h = this.h;
    // while the body charges he can only move
    if (this.ultState || h.override) return;
    if (it.secondaryPressed && this.rods.some((r) => r.armed)) return this.detonateRods();
    if (it.ult && this.ultOk()) return this.overcharge();
    // a blast jump is never locked out by a throw: it is how he dodges
    if (it.a1 && this.ready('a1')) return this.blastJump(it);
    if (it.a2 && this.ready('a2') && this.free) return this.grenade(it);
    if (it.a3 && this.ready('a3') && this.free) return this.pocketChange(it);
    if (it.secondaryPressed && this.ready('secondary') && this.free) return this.throwRod(it);
    if (it.primary && this.free) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT += 0.3; this.flick(it); }
    } else this.fireT = Math.max(0, this.fireT - dt);
  }

  // ---------------- shared: blasts and rocket jumps ----------------
  /** an explosion of his: falloff damage and knockback to enemies, light self-launch, the fireball */
  blast(p, { r, dmg, minDmg = dmg * 0.5, skip = null, scale = 1, knock = 4, up = 3, self = 1, slow = 0, slowT = 0, type = 'proj', sfx = 'coin_pop', vol = 0.6 } = {}) {
    const h = this.h, w = this.w;
    for (const e of w.inSphere(p, r, this.enemyFilter())) {
      if (e === skip) continue;
      const k = clamp01((e.center || e.pos).distanceTo(p) / r);
      const kd = _w.subVectors(e.center || e.pos, p).setY(0);
      if (kd.lengthSq() < 1e-4) kd.set(0, 0, 1);
      kd.normalize();
      const kv = knock > 0 ? kd.clone().multiplyScalar(knock * (1 - k * 0.5)).setY(up * (1 - k * 0.5)) : null;
      w.damage(h, e, lerp(dmg, minDmg, k), { from: p, knock: kv, power: clamp(dmg / 70, 0.3, 1.4), noFlinch: dmg < 18, type, slow, slowT });
    }
    this.selfLaunch(p, r * 1.15, self);
    this.fx.explosion(p, { scale, groundY: w.groundAt(p.x, p.z) });
    w.sfx(sfx, p, { vol, minGap: 0.03 });
    w.shakeAt(p, 0.08 + 0.22 * scale);
  }
  /** his own blasts never hurt him: they throw him (rocket jumps) */
  selfLaunch(p, reach, power) {
    const h = this.h;
    if (power <= 0 || h.dead || h.override || h.carriedBy || this.ultState) return;
    const c = h.center || h.pos;
    const d = c.distanceTo(p);
    if (d > reach) return;
    _v.subVectors(c, p);
    if (_v.lengthSq() < 1e-4) _v.set(0, 1, 0);
    _v.normalize(); _v.y += 0.8; _v.normalize();
    h.vel.addScaledVector(_v, power * 16 * (1 - d / reach));
    if (h.vel.y > 1.5) { h.grounded = false; if (h.mode === 'ground') h.mode = 'air'; h.pos.y += 0.04; h.launched = true; }
  }

  // ---------------- LMB: charged coins ----------------
  flick(it) {
    const h = this.h;
    const side = this.hand++ % 2 === 0 ? 'R' : 'L';
    h.anim.play(side === 'R' ? this.clips.flickR : this.clips.flickL);
    this.throwCoin(side, null, it.aimPoint, { speed: 75, dmg: 30, splash: 15, r: 2.2, splashHit: true });
    this.w.sfx('coin_flick', h.center, { vol: 0.5, minGap: 0.04 });
  }
  /** one charged coin from a hand, toward aimPoint (or along dir); `splashHit`: the hero it hits takes the splash too */
  throwCoin(side, dir, aimPoint, { speed = 75, dmg = 30, splash = 15, r = 2.2, self = 0.6, scale = 0.55, life = 1.4, splashHit = false } = {}) {
    const h = this.h, w = this.w, fx = this.fx, kit = this;
    const o = h.bonePos(side === 'L' ? 'handL' : 'handR', new THREE.Vector3()).addScaledVector(h.aimDir, 0.25);
    const d = dir ? dir.clone() : _v.subVectors(aimPoint, o).normalize().clone();
    if (!dir && d.dot(h.aimDir) < 0.6) d.copy(h.aimDir);
    let mesh = null;
    if (this.coin) {
      mesh = new THREE.Mesh(this.coin.geo, this.chargedMat);
      mesh.scale.setScalar(this.coin.scale * 1.5);
      mesh.position.copy(o);
      w.scene.add(mesh);
    }
    const spin = new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize(), spinRate = rand(24, 34);
    const tr = fx.trail({ color: 0xff5aa0, intensity: 2.4, width: 0.07, life: 0.12, max: 10, minDist: 0.2 });
    fx.glow(o, { color: CHARGE, size: 0.4, life: 0.06 });
    w.spawnProjectile({
      owner: h, pos: o, vel: d.multiplyScalar(speed), radius: 0.12, gravity: 6, life, dmg,
      onUpdate: (dt, p) => {
        if (mesh) { mesh.position.copy(p); mesh.rotateOnAxis(spin, spinRate * dt); }
        tr.push(p);
        fx.add.spawn({ p, life: 0.06, size: 0.3, size1: 0.1, color: CHARGE, color1: [3, 0.4, 1.2, 0], shape: SHAPE.GLOW });
      },
      onHitHero: (e, p) => { w.damage(h, e, dmg, { hitPos: p.clone(), power: 0.45, type: 'proj' }); return true; },
      onEnd: (proj, hero) => {
        tr.stop();
        if (mesh) w.scene.remove(mesh);
        kit.blast(proj.pos.clone(), { r, dmg: splash, minDmg: splash * 0.5, skip: splashHit ? null : hero, scale, knock: 1.5, up: 1, self, vol: 0.45 });
      },
    });
  }

  // ---------------- RMB: sticky rod ----------------
  throwRod(it) {
    const h = this.h;
    this.use('secondary');
    this.busyT = 0.25;
    h.anim.play(this.clips.rodThrow, { onEvent: (e) => { if (e === 'throw' && !h.dead) this.launchRod(it); } });
  }
  launchRod(it) {
    const h = this.h, w = this.w, fx = this.fx;
    const o = h.bonePos('handR', new THREE.Vector3()).addScaledVector(h.aimDir, 0.3);
    const dir = _v.subVectors(it.aimPoint, o).normalize().clone();
    if (dir.dot(h.aimDir) < 0.5) dir.copy(h.aimDir);
    dir.y += 0.05; dir.normalize();
    const mesh = new THREE.Group();
    if (this.rod) { const m = new THREE.Mesh(this.rod.geo, this.rodMat); m.scale.setScalar(this.rod.scale * 1.2); m.castShadow = true; mesh.add(m); }
    mesh.position.copy(o);
    w.scene.add(mesh);
    const rod = { mesh, armed: false, done: false, t: 0, beep: 0, stuck: null, offset: new THREE.Vector3(), pos: o.clone() };
    this.rods.push(rod);
    const tr = fx.trail({ color: 0xff5aa0, intensity: 1.8, width: 0.09, life: 0.18, max: 14, minDist: 0.2 });
    w.sfx('rod_throw', o, { vol: 0.6 });
    w.spawnProjectile({
      owner: h, pos: o, vel: dir.multiplyScalar(40), radius: 0.18, gravity: 11, life: 2.5, dmg: 10,
      onUpdate: (dt, p) => { mesh.position.copy(p); mesh.rotation.x += dt * 16; mesh.rotation.y += dt * 4; tr.push(p); },
      onHitHero: (e, p) => { rod.stuck = e; rod.offset.subVectors(p, e.pos); return true; },
      onEnd: (proj, hero, hit) => {
        tr.stop();
        if (rod.done) return;
        void hero;
        rod.pos.copy(proj.pos); rod.armed = true; rod.t = 0;
        // stuck into a wall or the floor: the rod juts out along the surface normal
        if (!rod.stuck && hit && hit.normal) mesh.quaternion.setFromUnitVectors(UP, hit.normal);
        fx.sparks(rod.pos, hit && hit.normal ? hit.normal : UP, { n: 6, color: CHARGE, speed: 5, life: 0.25, size: 0.04 });
        w.sfx('rod_stick', rod.pos, { vol: 0.7 });
      },
    });
  }
  rodTick(r, dt) {
    if (!r.armed || r.done) return;
    const w = this.w;
    r.t += dt;
    if (r.stuck) {
      if (r.stuck.dead || !w.heroes.includes(r.stuck)) r.stuck = null;
      else r.pos.copy(r.stuck.pos).add(r.offset);
    }
    r.mesh.position.copy(r.pos);
    // it beeps faster and faster
    r.beep -= dt;
    if (r.beep <= 0) {
      r.beep = Math.max(0.12, 0.42 - r.t * 0.11);
      this.fx.glow(r.pos, { color: CHARGE_HOT, size: 0.7, life: 0.07 });
      w.sfx('rod_beep', r.pos, { vol: 0.35, minGap: 0.05 });
    }
    if (Math.random() < dt * 20) this.fx.add.spawn({ p: r.pos, v: [rand(-1, 1), rand(0, 2), rand(-1, 1)], life: 0.2, size: 0.04, size1: 0.01, color: CHARGE, color1: [3, 0.4, 1.2, 0], shape: SHAPE.SPARK });
    if (r.t > 3) this.explodeRod(r);
  }
  detonateRods() {
    const h = this.h;
    h.anim.play(this.clips.detonate);
    this.w.sfx('finger_snap', h.center, { vol: 0.6 });
    for (const r of this.rods) if (r.armed) this.explodeRod(r);
  }
  explodeRod(r) {
    if (r.done) return;
    r.done = true;
    this.w.scene.remove(r.mesh);
    const stuck = r.stuck && !r.stuck.dead ? r.stuck : null;
    this.blast(r.pos.clone(), { r: 5, dmg: 110, minDmg: 50, scale: 1.3, knock: 10, up: 7, self: 1, type: 'ability', sfx: 'rod_boom', vol: 1 });
    if (stuck && !stuck.dead) this.w.damage(this.h, stuck, 30, { from: stuck.center, noFlinch: true, type: 'ability' });
  }

  // ---------------- SHIFT: blast jump ----------------
  blastJump(it) {
    const h = this.h, w = this.w;
    this.use('a1');
    const flat = _v.set(h.aimDir.x, 0, h.aimDir.z);
    if (flat.lengthSq() < 1e-4) flat.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    flat.normalize();
    // movement keys steer it (relative to the aim), otherwise it goes where he looks
    const dir = flat.clone();
    if (Math.abs(it.mx) + Math.abs(it.mz) > 0.1) {
      dir.multiplyScalar(it.mz).add(_w.set(-flat.z, 0, flat.x).multiplyScalar(it.mx));
      if (dir.lengthSq() < 1e-4) dir.copy(flat);
      dir.normalize();
    }
    const pitch = clamp(h.aimDir.y, -0.3, 0.8);
    const vy = 15 + Math.max(0, pitch) * 6, vh = 16 - Math.max(0, pitch) * 5;
    const foot = h.pos.clone(); foot.y += 0.25;
    h.vel.set(dir.x * vh, vy, dir.z * vh);
    h.grounded = false; h.mode = 'air'; h.pos.y += 0.05; h.launched = true;
    this.blast(foot, { r: 4, dmg: 45, minDmg: 25, scale: 0.8, knock: 7, up: 5, self: 0, type: 'ability', sfx: 'blast_jump', vol: 0.9 });
    h.anim.play(this.clips.blastJump);
    if (h.isPlayer) w.camRig.kick(6);
  }

  // ---------------- E: concussion grenade ----------------
  grenade(it) {
    const h = this.h;
    this.use('a2');
    this.busyT = 0.35;
    h.anim.play(this.clips.grenadeLob, { onEvent: (e) => { if (e === 'throw' && !h.dead) this.lob(it); } });
  }
  lob(it) {
    const h = this.h, w = this.w;
    const o = h.bonePos('handR', new THREE.Vector3()).addScaledVector(h.aimDir, 0.3);
    const dir = _v.subVectors(it.aimPoint, o).normalize().clone();
    if (dir.dot(h.aimDir) < 0.5) dir.copy(h.aimDir);
    dir.y += 0.22; dir.normalize();
    const mesh = grenadeMesh(this.fx);
    mesh.position.copy(o);
    w.scene.add(mesh);
    this.grenades.push({ mesh, pos: o.clone(), prev: o.clone(), vel: dir.multiplyScalar(24), t: 0, bounces: 0, done: false, spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)) });
    w.sfx('grenade_throw', o, { vol: 0.6 });
  }
  grenadeTick(g, dt) {
    if (g.done) return;
    const w = this.w, h = this.h;
    g.t += dt;
    g.prev.copy(g.pos);
    g.vel.y -= 22 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // an enemy (or their bubble) in the way sets it off
    for (const e of w.heroes) {
      if (e.team === h.team || !e.targetable) continue;
      const rr = (e.shieldRadius ? e.shieldRadius() : 0) || e.radius + 0.15;
      if (_u.copy(e.center || e.pos).distanceTo(g.pos) < rr + 0.25 || segDist(e.capA, e.capB, g.pos) < e.radius + 0.15) { this.explodeGrenade(g); return; }
    }
    if (w.barriers.length && w.barrierHit(g.prev, g.pos, h.team)) { g.pos.copy(g.prev); this.explodeGrenade(g); return; }
    // the first bounce sends it on, the second contact (or the fuse) sets it off
    const hit = w.sweepWorld(g.prev, g.pos, 0.12);
    if (hit) {
      g.bounces++;
      if (g.bounces >= 2) { g.pos.copy(hit.point).addScaledVector(hit.normal, 0.15); this.explodeGrenade(g); return; }
      g.pos.copy(hit.point).addScaledVector(hit.normal, 0.13);
      const vn = g.vel.dot(hit.normal);
      g.vel.addScaledVector(hit.normal, -1.5 * vn).multiplyScalar(0.55);
      w.sfx('grenade_bounce', g.pos, { vol: 0.6 });
      this.fx.dustRing(g.pos, { n: 6, radius: 0.2, speed: 3, size: 0.4, size1: 1, life: 0.5 });
    }
    g.mesh.position.copy(g.pos);
    g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
    if (Math.floor(g.t * 10) % 2 === 0) this.fx.add.spawn({ p: g.pos, life: 0.05, size: 0.35, size1: 0.2, color: CHARGE, color1: [3, 0.4, 1.2, 0], shape: SHAPE.GLOW });
    if (g.t > 1.4) this.explodeGrenade(g);
  }
  explodeGrenade(g) {
    if (g.done) return;
    g.done = true;
    this.w.scene.remove(g.mesh);
    this.blast(g.pos.clone(), { r: 6, dmg: 80, minDmg: 40, scale: 1.4, knock: 5, up: 10, self: 1.1, slow: 0.35, slowT: 2, type: 'ability', sfx: 'grenade_boom', vol: 1 });
    this.fx.sphere(g.pos, { color: 0xffb0d0, intensity: 0.45, r0: 0.5, r1: 6.5, life: 0.28, fresnel: 2.6 });
  }

  // ---------------- F: pocket change ----------------
  pocketChange(it) {
    const h = this.h, w = this.w;
    this.use('a3');
    this.busyT = 0.3;
    h.anim.play(this.clips.fan, {
      onEvent: (e) => {
        if (e !== 'throw' || h.dead) return;
        const base = h.aimDir.clone();
        // a tight fan of short-fused coins: the ones that miss still burst around the target
        for (let i = 0; i < 7; i++) {
          const d = base.clone().applyAxisAngle(UP, (i - 3) * 0.055);
          d.y += rand(-0.02, 0.03); d.normalize();
          this.throwCoin(i % 2 ? 'L' : 'R', d, null, { speed: 85, dmg: 24, splash: 12, r: 1.8, self: 0.25, scale: 0.42, life: 0.2 });
        }
        w.sfx('coin_fan', h.center, { vol: 0.8 });
      },
    });
  }

  // ---------------- Q: SPLODE! ----------------
  overcharge() {
    const h = this.h, w = this.w;
    h.ult = 0;
    w.emit('ult', { hero: h, name: 'SPLODE!' });
    this.ultState = { t: 0 };
    h.unstoppable = true;
    h.status.haste = Math.max(h.status.haste, 0.3); h.status.hasteT = Math.max(h.status.hasteT, 2.1);
    h.U.uGlowColor.value.setRGB(1, 0.3, 0.62);
    w.sfx('splode_charge', h.center, { vol: 1, important: true });
    this.overAnim = h.anim.play(this.clips.overcharge, { hold: true });
  }
  ultTick(dt) {
    const st = this.ultState, h = this.h, w = this.w, fx = this.fx;
    if (h.dead) { this.fizzle(); return; }
    st.t += dt;
    const k = clamp01(st.t / 2);
    h.glowTarget = 0.2 + k * 1.1;
    // the charge crawls over him, faster and hotter as it builds
    if (Math.random() < dt * (24 + 70 * k)) {
      const p = _v.copy(h.capA).lerp(h.capB, Math.random()).add(_w.set(rand(-0.35, 0.35), rand(-0.2, 0.2), rand(-0.35, 0.35)));
      fx.add.spawn({ p, v: [rand(-2, 2), rand(0, 3), rand(-2, 2)], life: rand(0.1, 0.25), size: rand(0.04, 0.1), size1: 0.01, color: k > 0.7 ? CHARGE_HOT : CHARGE, color1: [3, 0.4, 1.2, 0], shape: SHAPE.SPARK });
    }
    if (Math.random() < dt * 8 * k) fx.glow(h.center, { color: CHARGE, size: 1.2 + k, life: 0.08 });
    if (h.isPlayer) w.camRig.addTrauma(dt * (0.4 + k * 1.2));
    if (st.t >= 2) this.splode();
  }
  splode() {
    const h = this.h, w = this.w, fx = this.fx;
    const p = h.center.clone();
    const gy = w.groundAt(p.x, p.z);
    this.endCharge();
    h.anim.play(this.clips.splode);
    const R = 12;
    for (const e of w.inSphere(p, R, this.enemyFilter())) {
      const dd = (e.center || e.pos).distanceTo(p), k = clamp01(dd / R);
      const kd = _w.subVectors(e.pos, p).setY(0);
      if (kd.lengthSq() < 1e-4) kd.set(0, 0, 1);
      kd.normalize();
      w.damage(h, e, lerp(380, 120, k), { from: p, knock: kd.clone().multiplyScalar(15 * (1 - k * 0.5)).setY(11), power: 1.6, type: 'ult' });
    }
    // he rides his own blast up and comes down unhurt
    h.invuln = Math.max(h.invuln, 0.5);
    if (!h.carriedBy) { h.vel.set(rand(-2, 2), 19, rand(-2, 2)); h.grounded = false; h.mode = 'air'; h.pos.y += 0.05; h.launched = true; }
    fx.explosion(p, { scale: 2.4, groundY: gy });
    fx.sphere(p, { color: 0xff5a9a, intensity: 0.45, r0: 1, r1: 13, life: 0.45, fresnel: 2.6 });
    // the blast rips outward in a ring of secondary bursts
    let bt = 0, made = 0;
    const ring = Array.from({ length: 7 }, (_, i) => ({ a: i / 7 * Math.PI * 2 + rand(-0.3, 0.3), r: rand(4, 9), t: 0.03 + i * 0.035 }));
    fx.every((dt) => {
      bt += dt;
      while (made < ring.length && bt >= ring[made].t) {
        const b = ring[made++], q = new THREE.Vector3(p.x + Math.cos(b.a) * b.r, Math.max(gy + 0.6, p.y - 0.5), p.z + Math.sin(b.a) * b.r);
        fx.explosion(q, { scale: rand(0.8, 1.1), groundY: w.groundAt(q.x, q.z) });
      }
      return made < ring.length;
    });
    const g = new THREE.Vector3(p.x, gy, p.z);
    fx.ring(g, { color: 0xffc0d8, intensity: 1.4, r0: 1, r1: 17, life: 0.7, soft: 0.3 });
    if (p.y - gy < 4) { fx.decal(g, 14, 'crater', 20, 1); fx.rocks(g, { n: 30, speed: 20, size: 0.35, up: 1.5 }); fx.dustRing(g, { n: 30, radius: 2, speed: 18, size: 1.6, size1: 5, life: 1.4 }); }
    fx.smoke(p, { n: 16, size: 2.4, size1: 7, speed: 7, life: 2.2, spread: 3, color: [0.22, 0.2, 0.2, 0.45] });
    w.renderer.flash(0xffd6e6, 0.28);
    w.renderer.fx.ca = Math.max(w.renderer.fx.ca, 0.015);
    w.renderer.addWave(p, { strength: 0.09, life: 0.9, speed: 2.2, width: 0.12 });
    w.sfx('splode_boom', p, { vol: 1.1, important: true, reverb: 0.6 });
    w.shakeAt(p, 1.1);
    w.hitstop(0.12, h);
    if (w.settings.comic) fx.comic(p.clone().add(_w.set(0, 3.5, 0)), 'SPLODE!', { size: 4.5, life: 1.1, fill: '#ff4f8a' });
  }
  endCharge() {
    const h = this.h;
    this.ultState = null;
    h.unstoppable = false;
    h.glowTarget = 0;
    if (this.overAnim) { h.anim.stop(0.1); this.overAnim = null; }
  }
  /** killed while charging: the charge bleeds off harmlessly */
  fizzle() {
    const h = this.h;
    this.endCharge();
    this.fx.energyBurst(h.center, { color: CHARGE, size: 1.2, n: 18, light: 0xff4f8a });
  }

  onDeath() {
    if (this.ultState) this.fizzle();
  }
  dispose() {
    if (this.ultState) this.endCharge();
    for (const r of this.rods) { r.done = true; this.w.scene.remove(r.mesh); }
    for (const g of this.grenades) { g.done = true; this.w.scene.remove(g.mesh); }
    this.rods = []; this.grenades = [];
    this.chargedMat.dispose(); this.rodMat.dispose();
  }
}

/** distance from p to segment a-b */
function segDist(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-9 ? clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2) : 0;
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
