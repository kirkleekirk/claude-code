import * as THREE from 'three';
import { Kit, Lunge, Travel } from '../kit.js';
import { clips } from '../../anim/clip.js';
import { MASK_UPPER, makeMask } from '../../anim/pose.js';
import { clamp, clamp01, rand, lerp, yawOf, TAU } from '../../engine/math.js';
import { SHAPE } from '../../vfx/particles.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const UPPER_ROOT = makeMask(['upper', { g: 'rootYaw', w: 0.7 }, { g: 'rootZ', w: 0.6 }, { g: 'rootY', w: 0.6 }]);
const FULL = makeMask(['all']);

const GUARD_L = { LikW: 1, Lik: [0.08, -0.28, 0.32], Lpole: [1, -1, -0.3], Lfist: 1 };
const GUARD_R = { RikW: 1, Rik: [0.08, -0.28, 0.32], Rpole: [1, -1, -0.3], Rfist: 1 };

export const INV_CLIPS = clips({
  jab: {
    mask: UPPER_ROOT, fadeIn: 0.04, fadeOut: 0.17,
    keys: [
      { t: 0, p: { ...GUARD_R, LikW: 1, Lik: [0.2, -0.16, 0.24], Lpole: [1, -0.6, -0.6], Lfist: 1, spineYaw: 10, spinePitch: 4, rootYaw: 4 } },
      { t: 0.05, e: 'inout', p: { Lik: [0.22, -0.14, 0.16], spineYaw: 16, LclavFwd: -6 } },
      { t: 0.1, e: 'out3', p: { Lik: [-0.1, 0.05, 0.98], spineYaw: -26, LclavFwd: 20, spinePitch: 10, rootYaw: -10, rootZ: 0.08, headYaw: 8 } },
      { t: 0.18, e: 'out', p: { Lik: [-0.08, 0.03, 0.93] } },
    ],
    events: [{ t: 0.095, e: 'hit' }],
  },
  cross: {
    mask: UPPER_ROOT, fadeIn: 0.04, fadeOut: 0.17,
    keys: [
      { t: 0, p: { ...GUARD_L, RikW: 1, Rik: [0.22, -0.18, 0.16], Rpole: [1, -0.6, -0.7], Rfist: 1, spineYaw: -16, rootYaw: -6, spinePitch: 4 } },
      { t: 0.055, e: 'inout', p: { Rik: [0.26, -0.15, 0.06], spineYaw: -24, rootYaw: -10, RclavFwd: -8 } },
      { t: 0.11, e: 'out3', p: { Rik: [-0.14, 0.06, 1.0], spineYaw: 36, RclavFwd: 24, spinePitch: 13, rootYaw: 15, rootZ: 0.11, headYaw: -8 } },
      { t: 0.19, e: 'out', p: { Rik: [-0.12, 0.04, 0.95] } },
    ],
    events: [{ t: 0.105, e: 'hit' }],
  },
  hook: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.2,
    keys: [
      { t: 0, p: { ...GUARD_R, LikW: 1, Lik: [0.55, -0.12, 0.28], Lpole: [1, -0.2, -0.5], Lfist: 1, spineYaw: 24, rootYaw: 9, LarmTwist: 0 } },
      { t: 0.06, e: 'inout', p: { Lik: [0.66, -0.04, 0.22], Lpole: [1, 0.1, -0.6], spineYaw: 32, rootYaw: 13 } },
      { t: 0.125, e: 'out3', p: { Lik: [0.0, 0.05, 0.66], Lpole: [1, 0.3, 0.1], spineYaw: -34, rootYaw: -16, spinePitch: 8, LclavLift: 8, LclavFwd: 14, headYaw: 10 } },
      { t: 0.22, e: 'out', p: { Lik: [-0.06, 0.03, 0.6] } },
    ],
    events: [{ t: 0.115, e: 'hit' }],
  },
  uppercut: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.24,
    keys: [
      { t: 0, p: { ...GUARD_L, RikW: 1, Rik: [0.18, -0.62, 0.22], Rpole: [0.9, -0.7, -0.4], Rfist: 1, rootY: -0.12, spinePitch: 18, spineYaw: -14 } },
      { t: 0.08, e: 'inout', p: { Rik: [0.2, -0.78, 0.16], rootY: -0.2, spinePitch: 26, spineYaw: -22, headPitch: -6 } },
      { t: 0.16, e: 'out3', p: { Rik: [-0.06, 0.6, 0.66], Rpole: [1, -0.5, -0.5], rootY: 0.05, spinePitch: -12, spineYaw: 22, headPitch: -18, RclavLift: 16, RclavFwd: 14 } },
      { t: 0.3, e: 'out', p: { Rik: [-0.05, 0.66, 0.6], rootY: 0.04 } },
    ],
    events: [{ t: 0.15, e: 'hit' }],
  },
  clap: {
    mask: UPPER_ROOT, fadeIn: 0.06, fadeOut: 0.22,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.95, 0.16, 0.12], Bpole: [0.3, -0.9, -0.5], Bfist: 0, Bspread: 0.9, BhandFlex: -12, BforeTwist: -70, spinePitch: -10, headPitch: -6 } },
      { t: 0.12, e: 'inout', p: { Bik: [1.0, 0.22, 0.02], spinePitch: -14 } },
      { t: 0.18, e: 'out3', p: { Bik: [-0.04, 0.12, 0.8], BhandFlex: 0, Bspread: 0.2, spinePitch: 14, headPitch: 6 } },
      { t: 0.32, e: 'out', p: { Bik: [-0.03, 0.1, 0.78] } },
    ],
    events: [{ t: 0.17, e: 'hit' }],
  },
  grab: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.15,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.35, 0.0, 0.5], Bpole: [1, -0.7, -0.3], Bfist: 0.2, Bspread: 0.8, spinePitch: 6 } },
      { t: 0.12, e: 'snap', p: { Bik: [-0.06, 0.08, 0.92], Bfist: 0.5, spinePitch: 16 } },
      { t: 0.2, p: { Bik: [-0.05, 0.08, 0.9], Bfist: 0.9 } },
    ],
  },
  carry: {
    mask: MASK_UPPER, fadeIn: 0.08, fadeOut: 0.12, loop: true, duration: 1,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [-0.02, 0.45, 0.72], Bpole: [1, -0.4, -0.3], Bfist: 0.85, spinePitch: -8, headPitch: -10 } },
      { t: 0.5, p: { Bik: [-0.02, 0.5, 0.7] } },
      { t: 1, p: { Bik: [-0.02, 0.45, 0.72] } },
    ],
  },
  slamThrow: {
    mask: MASK_UPPER, fadeIn: 0.05, fadeOut: 0.2,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.1, 0.98, 0.25], Bpole: [1, 0, -0.5], Bfist: 1, spinePitch: -24, headPitch: -12 } },
      { t: 0.14, e: 'snap', p: { Bik: [-0.05, -0.62, 0.72], spinePitch: 42, headPitch: 10 } },
      { t: 0.3, p: { Bik: [-0.05, -0.6, 0.7] } },
    ],
  },
  superland: {
    mask: FULL, fadeIn: 0.04, fadeOut: 0.32,
    keys: [
      { t: 0, p: { rootY: -0.54, rootPitch: 8, spinePitch: 40, headPitch: -26, LlegIkW: 0, Lleg: [0.1, -0.95, -0.12], Lknee: 86, LfootPitch: -35, LfootGround: 0, RlegIkW: 1, RlegIk: [-0.15, 0.1, 0.48], RfootGround: 1,
        RikW: 1, Rik: [0.05, -1.4, 0.45], Rpole: [1, 0, -0.3], Rfist: 1, LikW: 1, Lik: [0.95, -0.25, -0.35], Lpole: [0.2, -0.9, -0.4], Lfist: 0.8 } },
      { t: 0.32, e: 'out', p: { rootY: -0.55, spinePitch: 34, headPitch: -18 } },
      { t: 0.5, e: 'inout', p: { rootY: -0.45, spinePitch: 22, headPitch: -6 } },
    ],
  },
  divePrep: {
    mask: FULL, fadeIn: 0.03, fadeOut: 0.1,
    keys: [
      { t: 0, p: { rootY: -0.22, spinePitch: 28, Barm: [0.35, -0.75, -0.35], Belbow: 40, Bfist: 1 } },
      { t: 0.1, e: 'out', p: { rootY: 0.02, spinePitch: -8, Barm: [0.1, 0.9, 0.3], Belbow: 8 } },
    ],
  },
  getup: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.45, spinePitch: 45, headPitch: -20, Barm: [0.3, -0.9, 0.35], Belbow: 50, Bfist: 0.7 } },
      { t: 0.32, e: 'inout', p: { rootY: -0.1, spinePitch: 12, headPitch: 0 } },
    ],
  },
  ultRise: {
    mask: MASK_UPPER, fadeIn: 0.1, fadeOut: 0.3, loop: true, duration: 1,
    keys: [{ t: 0, p: { Rarm: [0.06, 0.98, 0.12], Relbow: 2, Rfist: 1, Larm: [0.15, -0.97, -0.1], Lelbow: 10, Lfist: 1 } }, { t: 1, p: {} }],
  },
});

export class InvincibleKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = INV_CLIPS;
    this.combo = 0; this.comboT = 0; this.nextAt = 0; this.queued = false;
    this.fistTrail = null;
    this.marker = null;
  }
  get busy() { return this.busyT > 0 || !!this.h.override; }

  update(dt, it) {
    super.update(dt);
    const h = this.h;
    this.comboT += dt;
    if (this.comboT > 0.75) this.combo = 0;
    if (h.override) { if (this.seq && this.seq.input) this.seq.input(it); return; }
    if (it.ult && h.ultReady && this.free) return this.machBreaker(it);
    if (it.a1 && this.ready('a1') && this.free) return this.dash(it);
    if (it.a2 && this.ready('a2') && this.free) return this.dive(it);
    if (it.a3 && this.ready('a3') && this.free) return this.slam(it);
    if (it.secondaryPressed && this.ready('secondary') && this.free && this.w.time >= this.nextAt) return this.clap(it);
    if (it.primary || it.primaryPressed) this.queued = true;
    if (this.queued && this.w.time >= this.nextAt && this.free) { this.queued = false; this.strike(it); }
  }

  // ---------------- primary: Viltrumite Barrage ----------------
  strike(it) {
    const h = this.h, w = this.w;
    const i = this.combo;
    this.combo = (this.combo + 1) % 4;
    this.comboT = 0;
    const clip = [this.clips.jab, this.clips.cross, this.clips.hook, this.clips.uppercut][i];
    const dmg = [44, 44, 52, 80][i];
    const gap = [0.2, 0.22, 0.25, 0.46][i];
    this.nextAt = w.time + gap;
    const tgt = this.aimTarget(7.8, 0.55);
    if (tgt) {
      const d = tgt.pos.distanceTo(h.pos);
      if (d > 2.0) h.override = new Lunge(h, tgt, { speed: 30, maxT: 0.2, stopDist: 1.15 });
      _v.copy(tgt.center).sub(h.center); h.aimDir.copy(_v.normalize());
    }
    const side = i % 2 === 0 ? 'L' : 'R';
    w.sfx(i === 3 ? 'swing_heavy' : 'swing', h.pos, { vol: 0.6 });
    this.trailFist(side, i === 3 ? 0.22 : 0.16);
    h.anim.play(clip, {
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const fin = i === 3;
        const hits = this.melee({
          reach: 1.55, radius: 1.45, dmg, knock: fin ? 6 : 2.2, up: fin ? 9 : 0.6, power: fin ? 1.3 : 0.7,
          hitSfx: fin ? 'punch_heavy' : 'punch_light', fxPower: fin ? 1.6 : 1,
          onHit: (e2, p) => { if (fin && w.settings.comic && Math.random() < 0.35) this.fx.comic(_v.copy(p).add(_w.set(0, 0.8, 0)), ['POW!', 'WHAM!', 'THWACK!'][(Math.random() * 3) | 0], { size: 1.8 }); },
        });
        if (hits.length) { w.hitstop(fin ? 0.09 : 0.045, h); w.shakeAt(h.pos, fin ? 0.35 : 0.14); }
      },
    });
  }
  trailFist(side, life) {
    const h = this.h;
    const tr = this.fx.trail({ color: 0xfff6d0, intensity: 1.6, width: 0.12, life: 0.14, max: 20 });
    let t = 0;
    this.fx.every((dt) => {
      t += dt;
      h.bonePos(side === 'L' ? 'fistL' : 'fistR', _u);
      tr.push(_u);
      if (t > life || h.dead) { tr.stop(); return false; }
    });
  }

  // ---------------- RMB: Shockwave Clap ----------------
  clap(it) {
    const h = this.h, w = this.w;
    this.use('secondary');
    this.nextAt = w.time + 0.38;
    this.busyT = 0.3;
    h.anim.play(this.clips.clap, {
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const o = h.chestPos(_v).clone();
        const dir = h.aimDir.clone();
        const hits = w.inCone(o, dir, 16, 0.5, this.enemyFilter());
        for (const t of hits) {
          const kd = _w.subVectors(t.center, o).normalize();
          const kv = kd.clone().multiplyScalar(7); kv.y += 2.5;
          w.damage(h, t, 65, { dir: kd.clone(), knock: kv, power: 0.9, type: 'ability' });
          this.fx.punchImpact(t.center, kd, { power: 0.8, gore: false });
        }
        this.shockFx(o, dir, 1);
        w.sfx('thunderclap', o, { vol: 0.6, rate: 1.3 });
        w.shakeAt(o, 0.3);
        if (hits.length) w.hitstop(0.04, h);
      },
    });
  }
  shockFx(o, dir, scale) {
    const fx = this.fx, w = this.w;
    fx.glow(o, { color: [4, 4, 4, 1], size: 1.4 * scale, life: 0.12 });
    fx.star(o, { size: 1.5 * scale });
    for (let k = 0; k < 4; k++) {
      const p = o.clone().addScaledVector(dir, 1.2 + k * 3.2 * scale);
      setTimeout(() => {
        fx.ring(p, { color: 0xeaf6ff, intensity: 1.6, r0: 0.4 + k * 0.6, r1: (2 + k * 1.6) * scale, life: 0.32, normal: dir, soft: 0.45 });
        if (p.y < 2.5) fx.dustRing(_v.set(p.x, 0, p.z), { n: 8, radius: 0.5, speed: 5, size: 0.7, size1: 2.2, life: 0.7 });
      }, k * 45);
    }
    w.renderer.addWave(o, { strength: 0.04 * scale, life: 0.5, speed: 1.5 });
    for (let i = 0; i < 20; i++) {
      _w.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.45).add(dir).normalize().multiplyScalar(rand(14, 26));
      fx.alpha.spawn({ p: o, v: _w, life: rand(0.3, 0.6), size: 0.35, size1: 1.6, color: [0.95, 0.97, 1, 0.35], color1: [1, 1, 1, 0], shape: SHAPE.SMOKE, drag: 5 });
    }
  }

  // ---------------- SHIFT: Sonic Boom Dash ----------------
  dash(it) {
    const h = this.h, w = this.w;
    this.use('a1');
    const dir = h.aimDir.clone();
    if (h.mode !== 'fly' && dir.y < 0.25) dir.y = Math.max(dir.y, 0.02);
    dir.normalize();
    const wasFly = h.mode === 'fly' || !h.grounded;
    const hit = new Set();
    const start = h.center.clone();
    this.fx.sonicBoom(start, dir, { scale: 1 });
    w.sfx('sonic_boom', start, { vol: 0.75, important: true });
    w.sfx('dash', start, { vol: 0.8 });
    w.shakeAt(start, 0.35);
    if (h.isPlayer) { w.renderer.fx.speedLines = 1; w.camRig.kick(14); }
    const tr = this.fx.trail({ color: 0xdff2ff, intensity: 1.2, width: 0.55, life: 0.45, max: 40, minDist: 0.3 });
    const travel = new Travel(h, {
      dir, speed: 88, dist: 32, animMode: 'fly', boost: 1,
      onStep: (a, b) => {
        tr.push(h.center);
        for (const e of w.heroes) {
          if (e.team === h.team || !e.targetable || hit.has(e)) continue;
          if (segPoint(a, b, e.center) < 2.1) {
            hit.add(e);
            _w.subVectors(e.center, b); _w.addScaledVector(dir, -_w.dot(dir)); if (_w.lengthSq() < 0.01) _w.set(-dir.z, 0, dir.x); _w.normalize();
            const kv = _w.clone().multiplyScalar(9); kv.y += 6;
            w.damage(h, e, 75, { dir: dir.clone(), knock: kv, power: 1.2, type: 'ability' });
            this.fx.punchImpact(e.center, dir, { power: 1.3 });
            w.sfx('punch_heavy', e.center, { vol: 0.9 });
            w.hitstop(0.05, h);
          }
        }
      },
    });
    travel.onEnd = () => {
      tr.stop();
      if (h.isPlayer) w.renderer.fx.speedLines = 0;
      h.vel.copy(dir).multiplyScalar(14);
      if (wasFly || !h.grounded) { h.mode = 'fly'; } else h.mode = 'ground';
    };
    h.override = travel;
  }

  // ---------------- E: Meteor Dive ----------------
  dive(it) {
    const h = this.h, w = this.w;
    let target = (it.aimHero && it.aimHero.team !== h.team) ? it.aimHero.pos.clone() : it.aimPoint.clone();
    _v.subVectors(target, h.pos);
    if (_v.length() > 45) target = h.pos.clone().addScaledVector(_v.normalize(), 45);
    if (target.y < 0.3) target.y = w.groundAt(target.x, target.z);
    if (target.distanceTo(h.pos) < 3) { w.sfx('denied', null, { ui: true }); return; }
    // diving at a hero: touch down just in front of them (still deep inside the blast), not inside them
    if (it.aimHero && it.aimHero.team !== h.team) {
      _v.set(h.pos.x - target.x, 0, h.pos.z - target.z);
      if (_v.lengthSq() > 1e-4) target.addScaledVector(_v.normalize(), Math.min(it.aimHero.radius + h.radius + 0.25, 1.4));
      target.y = Math.max(target.y, w.groundAt(target.x, target.z));
    }
    this.use('a2');
    w.sfx('whistle', h.pos, { vol: 0.6, rate: 1.6 });
    h.anim.play(this.clips.divePrep);
    const dir = _v.subVectors(target, h.pos).normalize().clone();
    const tr = this.fx.trail({ color: 0xffe2a8, intensity: 1.6, width: 0.5, life: 0.35, max: 40, minDist: 0.25 });
    // from the ground (or anything flatter than a real dive) leap up and come down on the point,
    // which clears low cover and lands the slam from above
    const flat = Math.hypot(target.x - h.pos.x, target.z - h.pos.z), drop = h.pos.y - target.y;
    const arc = clamp(flat * 0.22 - drop * 0.5, 0, 9);
    const travel = new Travel(h, { dir, speed: 74, dist: 999, toPoint: target, arc, animMode: 'fly', boost: 1, onStep: () => tr.push(h.center) });
    travel.onEnd = (died) => {
      tr.stop();
      if (died) return; // a dive cut short by death doesn't land
      const p = h.pos.clone();
      const onGround = p.y < w.groundAt(p.x, p.z) + 1.2;
      if (onGround) { this.fx.groundSlam(p, { power: 1.25 }); h.mode = 'ground'; h.vel.set(0, 0, 0); h.anim.play(this.clips.superland); h.status.rootT = 0.38; this.busyT = 0.38; }
      else { this.fx.sphere(p, { color: 0xfff0d0, r1: 6, life: 0.35 }); this.fx.glow(p, { size: 4, life: 0.2 }); h.mode = 'fly'; h.vel.set(0, 3, 0); }
      w.sfx('ground_slam', p, { vol: 1, important: true });
      w.shakeAt(p, 0.6);
      const hits = w.inSphere(p, 6, this.enemyFilter());
      for (const e of hits) {
        _w.subVectors(e.pos, p); _w.y = 0; const d = _w.length(); _w.normalize();
        const kv = _w.clone().multiplyScalar(6); kv.y = 9;
        w.damage(h, e, 95 * (1 - clamp01(d / 6) * 0.35), { dir: _w.clone(), knock: kv, power: 1.3, type: 'ability' });
      }
      if (hits.length) w.hitstop(0.07, h);
    };
    h.override = travel;
  }

  // ---------------- F: Skyward Slam ----------------
  slam(it) {
    const h = this.h, w = this.w;
    const tgt = this.aimTarget(7, 0.7);
    h.anim.play(this.clips.grab);
    if (!tgt) { this.use('a3', 1.5); w.sfx('swing', h.pos); return; }
    this.use('a3');
    const kit = this;
    const seq = {
      phase: 'reach', t: 0, faceAim: false, animMode: 'fly', boost: 0, animVel: new THREE.Vector3(),
      update(dt) {
        this.t += dt;
        if (tgt.dead || h.dead) { release(); return false; }
        if (this.phase === 'reach') {
          _v.subVectors(tgt.center, h.center); const d = _v.length();
          if (d < 1.4 || this.t > 0.25) {
            this.phase = 'rise'; this.t = 0;
            tgt.carriedBy = h; h.carrying = tgt;
            w.damage(h, tgt, 20, { power: 0.8, noFlinch: false });
            kit.fx.punchImpact(tgt.center, _v.normalize(), { power: 0.8 });
            w.sfx('punch_light', tgt.center);
            h.anim.play(kit.clips.carry, { hold: true });
            w.sfx('takeoff', h.pos, { vol: 0.9 });
            this.dir = new THREE.Vector3(h.aimDir.x, 0, h.aimDir.z).normalize();
          } else { _v.normalize(); h.pos.addScaledVector(_v, Math.min(d, 34 * dt)); h.yaw = yawOf(_v); this.animVel.copy(_v).multiplyScalar(10); }
          return true;
        }
        if (this.phase === 'rise') {
          const sp = 30 * (1 - this.t * 1.2);
          h.pos.y += Math.max(6, sp) * dt;
          h.pos.addScaledVector(this.dir, 2 * dt);
          h.integrate(0);
          hold(0.95, 0.75);
          this.animVel.set(0, 18, 0);
          if (this.t > 0.42) { this.phase = 'throw'; this.t = 0; h.anim.play(kit.clips.slamThrow); w.sfx('swing_heavy', h.pos); }
          return true;
        }
        if (this.phase === 'throw') {
          hold(0.9, 1.1 - this.t * 8);
          if (this.t > 0.13) { this.phase = 'fall'; this.t = 0; }
          return true;
        }
        if (this.phase === 'fall') {
          const sp = 58;
          _v.set(this.dir.x * 0.18, -1, this.dir.z * 0.18).normalize();
          h.pos.addScaledVector(_v, sp * dt);
          this.animVel.copy(_v).multiplyScalar(sp);
          hold(0.4, -1.3);
          const gy = w.groundAt(tgt.pos.x, tgt.pos.z);
          if (tgt.pos.y <= gy + 0.05) {
            tgt.pos.y = gy;
            release();
            const p = tgt.pos.clone();
            w.damage(h, tgt, 110, { stun: 0.9, power: 1.5, knock: _w.set(0, 2, 0).clone(), type: 'ability' });
            for (const e of w.inSphere(p, 4, kit.enemyFilter())) if (e !== tgt) w.damage(h, e, 40, { knock: _w.subVectors(e.pos, p).setY(0).normalize().multiplyScalar(7).setY(5).clone() });
            kit.fx.groundSlam(p, { power: 1.15 });
            kit.fx.blood(tgt.center, UP, { n: 14, speed: 9 });
            w.sfx('ground_slam', p, { vol: 1 }); w.sfx('punch_heavy', p);
            if (w.settings.comic) kit.fx.comic(p.clone().add(_w.set(0, 2.2, 0)), 'SLAM!', { size: 2.4 });
            w.hitstop(0.11, h); w.shakeAt(p, 0.65);
            h.pos.y = Math.max(h.pos.y, gy + 1.5);
            h.vel.set(0, 7, 0); h.mode = 'fly';
            return false;
          }
          return true;
        }
        return false;
      },
      onEnd() { release(); h.anim.stop(0.2); },
    };
    function hold(fwd, up) {
      tgt.pos.copy(h.pos).addScaledVector(seq.dir || h.aimDir, fwd); tgt.pos.y += up + 0.4;
      tgt.vel.set(0, 0, 0);
      tgt.yaw = h.yaw + Math.PI;
    }
    function release() {
      if (tgt.carriedBy === h) { tgt.carriedBy = null; tgt.mode = 'air'; tgt.tumbleT = 0.3; }
      if (h.carrying === tgt) h.carrying = null;
    }
    h.override = seq;
  }

  // ---------------- Q: Mach Breaker ----------------
  machBreaker(it) {
    const h = this.h, w = this.w, kit = this;
    h.ult = 0;
    this.w.emit('ult', { hero: h, name: 'MACH BREAKER' });
    const startXZ = h.pos.clone();
    const peak = Math.max(h.pos.y + 70, 105);
    this.fx.sonicBoom(h.center.clone(), UP, { scale: 1.3 });
    this.fx.dustRing(h.pos, { n: 30, speed: 16, size: 1.2, size1: 3.5 });
    w.sfx('sonic_boom', h.pos, { vol: 1, important: true });
    w.sfx('charge', h.pos, { vol: 0.8 });
    w.shakeAt(h.pos, 0.4);
    h.anim.playOverlay(this.clips.ultRise, { hold: true });
    const tr = this.fx.trail({ color: 0xfff2c0, intensity: 1.8, width: 0.6, life: 0.6, max: 50, minDist: 0.4 });
    const seq = {
      phase: 'rise', t: 0, faceAim: true, animMode: 'fly', boost: 0, animVel: new THREE.Vector3(0, 30, 0), target: new THREE.Vector3(), flutter: 20,
      input(i) { this.it = i; },
      update(dt) {
        this.t += dt;
        const i = this.it || it;
        if (this.phase === 'rise') {
          h.untargetable = true;
          const sp = 40 + this.t * 160;
          h.pos.y = Math.min(peak, h.pos.y + sp * dt);
          h.vel.set(0, sp, 0); this.animVel.set(0, sp, 0);
          tr.push(h.center);
          if (h.isPlayer) w.renderer.fx.speedLines = 0.8;
          if (h.pos.y >= peak - 0.1) {
            this.phase = 'aim'; this.t = 0; tr.stop();
            h.anim.stop(0.2); h.anim.overlay && (h.anim.overlay.ending = true);
            if (h.isPlayer) { w.renderer.fx.speedLines = 0; kit.makeMarker(); }
          }
          return true;
        }
        if (this.phase === 'aim') {
          h.vel.set(0, 0, 0); this.animVel.set(0, 0, 0);
          // choose target from aim (player) or bot-provided aim point
          const ap = i.aimPoint;
          this.target.copy(ap); this.target.y = w.groundAt(ap.x, ap.z);
          _v.subVectors(this.target, startXZ); _v.y = 0;
          if (_v.length() > 60) { _v.setLength(60); this.target.set(startXZ.x + _v.x, 0, startXZ.z + _v.z); this.target.y = w.groundAt(this.target.x, this.target.z); }
          if (kit.marker) { kit.marker.position.set(this.target.x, this.target.y + 0.06, this.target.z); kit.marker.rotation.y += dt * 1.5; kit.marker.material.opacity = 0.6 + Math.sin(this.t * 14) * 0.3; }
          if ((i.primaryPressed || i.ult) && this.t > 0.25 || this.t > 3.2) {
            this.phase = 'fall'; this.t = 0;
            w.sfx('whistle', h.pos, { vol: 1, important: true });
            this.dir = _v.subVectors(this.target, h.pos).normalize().clone();
            this.trail = kit.fx.trail({ color: 0xffb060, intensity: 2.6, width: 0.9, life: 0.5, max: 60, minDist: 0.5 });
            this.boomed = false;
          }
          return true;
        }
        if (this.phase === 'fall') {
          const sp = 175;
          h.untargetable = false;
          this.dir.subVectors(this.target, h.pos);
          const d = this.dir.length(); this.dir.normalize();
          const step = Math.min(d, sp * dt);
          h.pos.addScaledVector(this.dir, step);
          h.vel.copy(this.dir).multiplyScalar(sp); this.animVel.copy(h.vel); this.boost = 1;
          this.trail.push(h.center);
          if (h.isPlayer) w.renderer.fx.speedLines = 1;
          if (!this.boomed && d < 55) { this.boomed = true; kit.fx.sonicBoom(h.center.clone(), this.dir, { scale: 1.6 }); w.sfx('sonic_boom', h.pos, { vol: 1, important: true }); }
          if (Math.random() < 0.8) kit.fx.add.spawn({ p: h.center, v: _w.copy(this.dir).multiplyScalar(-20).add(_u.set(rand(-3, 3), rand(-3, 3), rand(-3, 3))), life: 0.3, size: 0.5, size1: 1.4, color: [4, 2.2, 0.8, 1], color1: [2, 0.4, 0.1, 0], shape: SHAPE.GLOW });
          if (d < 0.2) { this.impact(); return false; }
          return true;
        }
        return false;
      },
      impact() {
        const p = this.target.clone();
        h.pos.copy(p); h.vel.set(0, 0, 0); h.mode = 'ground';
        this.trail && this.trail.stop();
        if (h.isPlayer) w.renderer.fx.speedLines = 0;
        const R = 11;
        for (const e of w.inSphere(p, R, kit.enemyFilter())) {
          _w.subVectors(e.pos, p); _w.y = 0; const dd = _w.length(); _w.normalize();
          const dmg = lerp(420, 150, clamp01(dd / R));
          const kv = _w.clone().multiplyScalar(10); kv.y = 15;
          w.damage(h, e, dmg, { dir: _w.clone(), knock: kv, power: 1.5, type: 'ult' });
        }
        kit.fx.groundSlam(p, { power: 2.6 });
        kit.fx.sphere(_w.copy(p).setY(1), { color: 0xffd9a0, intensity: 1.5, r1: 13, life: 0.5, fresnel: 1.5 });
        kit.fx.smoke(_w.copy(p).setY(1.5), { n: 18, size: 2.6, size1: 8, speed: 9, life: 2.0, spread: 4, color: [0.55, 0.52, 0.5, 0.3] });
        kit.fx.rocks(p, { n: 40, speed: 22, size: 0.4, up: 1.6, spread: 1.4 });
        kit.fx.decal(p, 24, 'crater', 20, 1);
        w.renderer.flash(0xfff4e0, 0.55);
        w.renderer.fx.ca = 0.015;
        w.renderer.addWave(p, { strength: 0.09, life: 0.9, speed: 2.2, width: 0.12 });
        w.sfx('explosion', p, { vol: 1.1, important: true, reverb: 0.6 });
        w.hitstop(0.13, h);
        w.shakeAt(p, 1.1);
        if (w.settings.comic) kit.fx.comic(p.clone().add(_w.set(0, 4, 0)), 'KRAKOOM!', { size: 4.5, life: 1.1, fill: '#ff5a1f' });
        h.anim.play(kit.clips.superland);
        h.status.rootT = 0.5; kit.busyT = 0.5;
      },
      onEnd(died) {
        h.untargetable = false; kit.clearMarker(); tr.stop();
        this.trail && this.trail.stop();
        if (h.isPlayer) w.renderer.fx.speedLines = 0;
      },
    };
    this.seq = seq;
    h.override = seq;
  }
  makeMarker() {
    if (this.marker) return;
    const g = new THREE.RingGeometry(10.2, 11, 64).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.2), transparent: true, opacity: 0.8, depthWrite: false }));
    const inner = new THREE.Mesh(new THREE.RingGeometry(0, 2.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3), transparent: true, opacity: 0.5, depthWrite: false }));
    m.add(inner);
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.2), transparent: true, opacity: 0.7, depthWrite: false }));
      bar.position.set(Math.cos(k * Math.PI / 2) * 6.5, 0, Math.sin(k * Math.PI / 2) * 6.5); bar.rotation.y = -k * Math.PI / 2;
      m.add(bar);
    }
    m.renderOrder = 20;
    this.w.scene.add(m);
    this.marker = m;
  }
  clearMarker() { if (this.marker) { this.w.scene.remove(this.marker); this.marker = null; } }
  onDeath() { this.clearMarker(); }
  dispose() { this.clearMarker(); }
}

function segPoint(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = clamp01(t);
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
