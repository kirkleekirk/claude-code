import * as THREE from 'three';
import { Kit, Lunge, Travel } from '../kit.js';
import { clips } from '../../anim/clip.js';
import { makeMask, MASK_UPPER } from '../../anim/pose.js';
import { SHAPE } from '../../vfx/particles.js';
import { RULES } from '../data.js';
import { clamp, clamp01, rand, lerp, damp, yawOf } from '../../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const U = RULES.immortal;
const LIFE = [3.0, 2.5, 1.4, 1]; // HDR: the light that knits him back together
const UPPER_ROOT = makeMask(['upper', { g: 'rootYaw', w: 0.8 }, { g: 'rootZ', w: 0.7 }, { g: 'rootY', w: 0.7 }, { g: 'rootPitch', w: 0.6 }]);
const UPPER_Y = makeMask(['upper', { g: 'rootY', w: 1 }]);
const FULL = makeMask(['all']);
const GUARD_L = { LikW: 1, Lik: [0.1, -0.26, 0.34], Lpole: [1, -1, -0.3], Lfist: 1 };
const GUARD_R = { RikW: 1, Rik: [0.1, -0.26, 0.34], Rpole: [1, -1, -0.3], Rfist: 1 };
// down on one knee: the left foot planted in front, the right knee on the ground
const KNEEL = {
  rootY: -0.56, rootPitch: 4, spinePitch: 34, spineRoll: 3, headPitch: 32,
  BlegIkW: 1, LlegIk: [0.2, 0.12, 0.4], RlegIk: [-0.15, 0.13, -0.46], LfootGround: 1,
  LikW: 1, Lik: [0.05, -0.62, 0.55], Lpole: [1, -0.4, -0.4], Lfist: 1,
  RikW: 1, Rik: [0.14, -1.0, 0.22], Rpole: [1, 0, -0.5], Rfist: 0.5, Rspread: 0.4,
};

export const IMMORTAL_CLIPS = clips({
  straightR: {
    mask: UPPER_ROOT, fadeIn: 0.04, fadeOut: 0.18,
    keys: [
      { t: 0, p: { ...GUARD_L, RikW: 1, Rik: [0.24, -0.18, 0.12], Rpole: [1, -0.6, -0.7], Rfist: 1, spineYaw: -20, rootYaw: -8, spinePitch: 4, browAnger: 1 } },
      { t: 0.06, e: 'inout', p: { Rik: [0.27, -0.15, 0.04], spineYaw: -26, rootYaw: -11 } },
      { t: 0.12, e: 'snap', p: { Rik: [-0.14, 0.06, 1.0], spineYaw: 34, RclavFwd: 24, spinePitch: 12, rootYaw: 14, rootZ: 0.12 } },
      { t: 0.22, e: 'out', p: { Rik: [-0.12, 0.04, 0.95] } },
    ],
    events: [{ t: 0.115, e: 'hit' }],
  },
  hookL: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.2,
    keys: [
      { t: 0, p: { ...GUARD_R, LikW: 1, Lik: [0.6, -0.1, 0.24], Lpole: [1, -0.2, -0.5], Lfist: 1, spineYaw: 28, rootYaw: 10, browAnger: 1 } },
      { t: 0.06, e: 'inout', p: { Lik: [0.7, -0.03, 0.18], Lpole: [1, 0.1, -0.6], spineYaw: 34, rootYaw: 14 } },
      { t: 0.13, e: 'snap', p: { Lik: [0.0, 0.05, 0.7], Lpole: [1, 0.3, 0.1], spineYaw: -36, rootYaw: -16, spinePitch: 8, LclavLift: 8, LclavFwd: 14 } },
      { t: 0.24, e: 'out', p: { Lik: [-0.05, 0.03, 0.64] } },
    ],
    events: [{ t: 0.12, e: 'hit' }],
  },
  // finisher: both fists locked together, raised and brought down
  hammer: {
    mask: UPPER_ROOT, fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [-0.06, 0.98, 0.12], Bpole: [1, 0.2, -0.6], Bfist: 1, spinePitch: -22, headPitch: -12, rootY: 0.04, browAnger: 1 } },
      { t: 0.12, e: 'in', p: { Bik: [-0.06, 1.0, -0.05], spinePitch: -28 } },
      { t: 0.2, e: 'snap', p: { Bik: [-0.07, -0.72, 0.72], Bpole: [1, -0.2, -0.4], spinePitch: 46, headPitch: 18, rootY: -0.22, rootPitch: 6 } },
      { t: 0.36, e: 'out', p: { Bik: [-0.07, -0.7, 0.7] } },
    ],
    // (the snap gets the fists there early in its segment: the hit lands when they do)
    events: [{ t: 0.15, e: 'hit' }],
  },
  // RMB: dropped low, then everything rising through the right fist
  uppercut: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.26,
    keys: [
      { t: 0, p: { ...GUARD_L, RikW: 1, Rik: [0.18, -0.64, 0.2], Rpole: [0.9, -0.7, -0.4], Rfist: 1, rootY: -0.16, spinePitch: 22, spineYaw: -16, browAnger: 1 } },
      { t: 0.09, e: 'inout', p: { Rik: [0.2, -0.8, 0.14], rootY: -0.24, spinePitch: 28, spineYaw: -24, headPitch: -6 } },
      { t: 0.17, e: 'snap', p: { Rik: [-0.06, 0.66, 0.6], Rpole: [1, -0.5, -0.5], rootY: 0.08, spinePitch: -14, spineYaw: 24, headPitch: -22, RclavLift: 18, RclavFwd: 14 } },
      { t: 0.34, e: 'out', p: { Rik: [-0.05, 0.7, 0.56], rootY: 0.06 } },
    ],
    events: [{ t: 0.125, e: 'hit' }],
  },
  // SHIFT in flight: right fist out in front, the left along his side (the fist comes up through the
  // front: blending an arm straight from hanging to overhead would swing it through the shoulder)
  dive: {
    mask: MASK_UPPER, fadeIn: 0.08, fadeOut: 0.2,
    keys: [
      { t: 0, p: { Rarm: [0.15, 0.2, 0.97], Relbow: 30, Rfist: 1, Larm: [0.18, -0.96, -0.2], Lelbow: 14, Lfist: 1, browAnger: 1 } },
      { t: 0.16, e: 'out', p: { Rarm: [0.06, 0.98, 0.14], Relbow: 4 } },
    ],
  },
  // the three-point landing
  superland: {
    mask: FULL, fadeIn: 0.04, fadeOut: 0.32,
    keys: [
      { t: 0, p: { rootY: -0.54, rootPitch: 8, spinePitch: 40, headPitch: -26, LlegIkW: 0, Lleg: [0.1, -0.95, -0.12], Lknee: 86, LfootPitch: -35, LfootGround: 0, RlegIkW: 1, RlegIk: [-0.15, 0.1, 0.48], RfootGround: 1,
        RikW: 1, Rik: [0.05, -1.4, 0.45], Rpole: [1, 0, -0.3], Rfist: 1, LikW: 1, Lik: [0.95, -0.25, -0.35], Lpole: [0.2, -0.9, -0.4], Lfist: 0.8, browAnger: 1 } },
      { t: 0.32, e: 'out', p: { rootY: -0.55, spinePitch: 34, headPitch: -18 } },
      { t: 0.5, e: 'inout', p: { rootY: -0.45, spinePitch: 22, headPitch: -6 } },
    ],
  },
  // E: a fist thrown up high, shouting them on
  rally: {
    mask: UPPER_Y, fadeIn: 0.08, fadeOut: 0.4,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.25, -0.2, 0.3], Rpole: [1, -0.8, -0.3], Rfist: 1, Larm: [0.4, -0.85, 0.2], Lelbow: 60, Lfist: 1, spinePitch: 14, headPitch: 6, browAnger: 1 } },
      { t: 0.2, e: 'snap', p: { Rik: [0.12, 1.0, 0.18], Rpole: [1, 0.2, -0.5], RclavLift: 18, Larm: [0.55, -0.75, 0.1], Lelbow: 85, spinePitch: -14, headPitch: -22 } },
      { t: 0.9, e: 'inout', p: { Rik: [0.12, 0.98, 0.2], spinePitch: -10, headPitch: -16 } },
    ],
    events: [{ t: 0.19, e: 'cry' }],
  },
  // F: both fists high overhead, then driven into the ground
  hammerfall: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.35,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.0, 1.0, 0.1], Bpole: [1, 0.2, -0.6], Bfist: 1, spinePitch: -24, headPitch: -16, rootY: 0.06, browAnger: 1 } },
      { t: 0.18, e: 'in', p: { Bik: [0.0, 1.02, -0.06], spinePitch: -30, rootY: 0.1 } },
      // down hard, but over a few frames: accelerating in, then the crouch absorbing it
      { t: 0.26, e: 'in', p: { Bik: [0.06, 0.1, 0.75], Bpole: [1, -0.1, -0.4], spinePitch: 28, rootY: -0.3 } },
      { t: 0.3, e: 'out', p: { Bik: [0.1, -1.3, 0.6], Bpole: [1, 0, -0.3], spinePitch: 52, headPitch: -10, rootY: -0.58, rootPitch: 8, BlegIkW: 1, LlegIk: [0.24, 0.12, 0.18], RlegIk: [-0.24, 0.12, -0.22], BfootGround: 1 } },
      { t: 0.6, e: 'out', p: { rootY: -0.5, spinePitch: 44 } },
      { t: 0.85, e: 'inout', p: { rootY: -0.25, spinePitch: 20 } },
    ],
    events: [{ t: 0.27, e: 'hit' }],
  },
  // diving from the air: fists together overhead all the way down
  plunge: {
    mask: MASK_UPPER, fadeIn: 0.06, fadeOut: 0.1, loop: true, duration: 1,
    keys: [{ t: 0, p: { BikW: 1, Bik: [0.0, 1.0, 0.12], Bpole: [1, 0.2, -0.6], Bfist: 1, spinePitch: -18, headPitch: -12, browAnger: 1 } }, { t: 1, p: {} }],
  },
  smash: {
    mask: FULL, fadeIn: 0.07, fadeOut: 0.35,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.1, -1.3, 0.6], Bpole: [1, 0, -0.3], Bfist: 1, spinePitch: 52, headPitch: -10, rootY: -0.58, rootPitch: 8, BlegIkW: 1, LlegIk: [0.24, 0.12, 0.18], RlegIk: [-0.24, 0.12, -0.22], BfootGround: 1, browAnger: 1 } },
      { t: 0.32, e: 'out', p: { rootY: -0.5, spinePitch: 44 } },
      { t: 0.6, e: 'inout', p: { rootY: -0.25, spinePitch: 20 } },
    ],
  },
  // Undying: down on one knee, head bowed, while he mends
  kneel: {
    mask: FULL, fadeIn: 0.22, fadeOut: 0.3, loop: true, duration: 2,
    keys: [
      { t: 0, p: { ...KNEEL } },
      { t: 1, p: { spinePitch: 37, headPitch: 35, rootY: -0.575 } },
      { t: 2, p: { spinePitch: 34, headPitch: 32, rootY: -0.56 } },
    ],
  },
  rise: {
    mask: FULL, fadeIn: 0.04, fadeOut: 0.4,
    keys: [
      { t: 0, p: { ...KNEEL } },
      { t: 0.3, e: 'out', p: { rootY: -0.04, rootPitch: 0, spinePitch: -14, spineRoll: 0, headPitch: -26, BlegIkW: 0, LikW: 0, RikW: 0, Barm: [0.66, -0.7, 0.12], Belbow: 38, BclavLift: 14, Bfist: 1, Rspread: 0, browAnger: 1 } },
      { t: 0.8, e: 'inout', p: { rootY: 0, spinePitch: -8, headPitch: -12 } },
    ],
    events: [{ t: 0.28, e: 'rise' }],
  },
  // Q: arms flung out, roaring at the sky
  undying: {
    mask: UPPER_Y, fadeIn: 0.06, fadeOut: 0.45,
    keys: [
      { t: 0, p: { Barm: [0.45, -0.75, 0.3], Belbow: 80, Bfist: 1, spinePitch: 32, headPitch: 18, rootY: -0.22, browAnger: 1 } },
      { t: 0.3, e: 'snap', p: { Barm: [0.88, 0.1, -0.1], Belbow: 30, BclavLift: 18, spinePitch: -22, headPitch: -34, rootY: 0.02 } },
      { t: 1.1, e: 'inout', p: { Barm: [0.84, 0.04, -0.05], spinePitch: -14, headPitch: -22 } },
    ],
    events: [{ t: 0.29, e: 'roar' }],
  },
  land: {
    mask: FULL, fadeIn: 0.03, fadeOut: 0.35,
    keys: [
      { t: 0, p: { rootY: -0.5, spinePitch: 34, headPitch: -20, BlegIkW: 1, LlegIk: [0.22, 0.12, 0.15], RlegIk: [-0.22, 0.12, -0.2], BfootGround: 1, Barm: [0.5, -0.75, 0.2], Belbow: 50, Bfist: 1, browAnger: 1 } },
      { t: 0.35, e: 'out', p: { rootY: -0.35, spinePitch: 20 } },
    ],
  },
  getup: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.45, spinePitch: 40, headPitch: -20, Barm: [0.35, -0.85, 0.35], Belbow: 45, Bfist: 1 } },
      { t: 0.3, e: 'inout', p: { rootY: -0.1, spinePitch: 10 } },
    ],
  },
});

/**
 * The Immortal. Undying: a killing blow drops him to one knee instead of killing him, and a few
 * seconds later he stands back up, unless they finish the job while he is down.
 */
export class ImmortalKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = IMMORTAL_CLIPS;
    this.combo = 0; this.comboT = 0; this.nextAt = 0; this.queued = false;
    this.undyingCd = 0;
    this.down = null;
    this.ultState = null;
    this.plunging = false;
  }
  get undyingReady() { return this.undyingCd <= 0 && !this.down; }
  /** the ult heals him for part of all the damage he deals */
  get lifesteal() { return this.ultState ? 0.3 : 0; }
  hudPassive() {
    if (this.down) return { text: 'UNDYING · RISING', hot: true, fill: clamp01(this.down.t / U.downT), pend: 0 };
    if (this.ultState) return { text: 'UNDYING · IMMORTAL', hot: true, fill: 1, pend: 0 };
    return { text: this.undyingCd > 0 ? `UNDYING · ${Math.ceil(this.undyingCd)}s` : 'UNDYING · READY', hot: false, fill: 1 - this.undyingCd / U.cd, pend: 0 };
  }
  get tag() { return this.down ? 'DOWN' : ''; }

  tick(dt) {
    const h = this.h, w = this.w;
    if (!this.down && !this.ultState && this.undyingCd > 0) this.undyingCd = Math.max(0, this.undyingCd - dt * (w.settings.noCooldowns ? 50 : 1));
    if (this.ultState) {
      this.ultState.t += dt;
      if (h.dead || this.ultState.t >= 8) this.endUlt();
    }
    h.unstoppable = !h.dead && !!(this.down || this.ultState);
    h.anchored = !h.dead && !!this.down;
    if (h.dead) return;
    // glow: mending while down, burning gold through the ult
    const g = this.down ? 0.15 + 0.35 * clamp01(this.down.t / U.downT) : this.ultState ? 0.36 : 0;
    if (g > 0 || h.glowTarget > 0) { h.glowTarget = g; h.U.uGlowColor.value.setRGB(1, 0.82, 0.42); }
    if (this.ultState && Math.random() < dt * 28) {
      const p = _v.copy(h.capA).lerp(h.capB, Math.random()).add(_w.set(rand(-0.4, 0.4), rand(-0.3, 0.3), rand(-0.4, 0.4)));
      this.fx.add.spawn({ p, v: [rand(-0.3, 0.3), rand(1, 2.4), rand(-0.3, 0.3)], life: rand(0.4, 0.7), size: rand(0.05, 0.1), size1: 0.01, color: LIFE, color1: [2.2, 1.4, 0.4, 0], shape: SHAPE.SPARK });
    }
  }

  update(dt, it) {
    super.update(dt);
    const h = this.h, w = this.w;
    this.comboT += dt;
    if (this.comboT > 0.85) this.combo = 0;
    if (h.override) return;
    if (it.ult && this.ultOk()) return this.immortal();
    if (it.a1 && this.ready('a1') && this.free) return this.guardianDive(it);
    if (it.a2 && this.ready('a2') && this.free) return this.rally();
    if (it.a3 && this.ready('a3') && this.free) return this.hammerfall(it);
    if (it.secondaryPressed && this.ready('secondary') && this.free && w.time >= this.nextAt) return this.uppercut(it);
    if (it.primary || it.primaryPressed) this.queued = true;
    if (this.queued && w.time >= this.nextAt && this.free) { this.queued = false; this.strike(it); }
  }

  // ---------------- passive: undying ----------------
  /** down on one knee, mending, he takes half damage */
  mitigate(amt) { return this.down ? amt * U.downTaken : amt; }
  /** a killing blow: during the ult nothing kills him; otherwise Undying takes it, if it's ready */
  cheatDeath(src, dir) {
    const h = this.h;
    if (this.ultState) { h.hp = 1; return true; }
    if (this.down || this.undyingCd > 0 || h.carriedBy) return false;
    this.goDown(src, dir);
    return true;
  }
  goDown(src, dir) {
    const h = this.h, w = this.w, kit = this;
    // whatever he was doing ends here
    if (h.override) { const o = h.override; h.override = null; o.onEnd && o.onEnd(true); }
    if (h.carrying) { h.carrying.carriedBy = null; h.carrying = null; }
    for (const k in h.status) if (k !== 'uplinkT') h.status[k] = 0;
    h.overhealth = 0;
    this.queued = false;
    this.down = { t: 0, landed: false, beat: 0 };
    // what they have to get through to finish him
    h.hp = U.will;
    h.unstoppable = true; h.anchored = true;
    w.sfx('undying_fall', h.center, { vol: 1, important: true });
    this.fx.glow(h.center, { color: LIFE, size: 2.4, life: 0.25 });
    if (h.isPlayer) w.emit('message', { hero: h, text: `UNDYING: rising in ${U.downT} seconds. Survive it!` });
    if (w.settings.comic) this.fx.comic(h.center.clone().add(_w.set(0, 1.4, 0)), 'NOT YET...', { size: 2, fill: '#d9b25a', life: 0.9 });
    const seq = {
      faceAim: false, animMode: 'ground', animVel: new THREE.Vector3(), boost: 0, noLean: true,
      update(dt) {
        const d = kit.down;
        if (!d) return false;
        h.aimDir.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
        if (!d.landed) {
          // knocked out of the air: he comes down hard first
          h.vel.x = damp(h.vel.x, 0, 3, dt); h.vel.z = damp(h.vel.z, 0, 3, dt);
          h.vel.y -= 42 * dt;
          this.animMode = 'air';
          h.integrate(dt);
          if (h.grounded || h.pos.y - h.groundY < 0.05) {
            d.landed = true; this.animMode = 'ground'; h.mode = 'ground';
            if (-h.vel.y > 8) { kit.fx.groundSlam(h.pos, { power: 0.6 }); w.sfx('land', h.pos, { vol: 0.9 }); }
            h.vel.set(0, 0, 0);
            h.anim.play(kit.clips.kneel, { hold: true });
          }
          return true;
        }
        h.vel.set(0, 0, 0);
        d.t += dt;
        // the wounds closing: light drawn into him, a heartbeat that quickens
        const k = clamp01(d.t / U.downT);
        if (Math.random() < dt * (14 + 30 * k)) {
          _w.set(rand(-1.6, 1.6), rand(-0.6, 1.4), rand(-1.6, 1.6));
          kit.fx.add.spawn({ p: _u.copy(h.center).add(_w), v: _w.multiplyScalar(-1 / 0.5), life: 0.5, size: 0.05, size1: 0.12, color: [LIFE[0], LIFE[1], LIFE[2], 0], color1: LIFE, shape: SHAPE.SPARK });
        }
        d.beat -= dt;
        if (d.beat <= 0) {
          d.beat = lerp(0.8, 0.32, k);
          kit.fx.ring(_v.copy(h.pos).setY(h.pos.y + 0.06), { color: 0xffd890, intensity: 0.5 + k * 0.6, r0: 0.4, r1: 1.6 + k * 1.4, life: 0.4 });
          w.sfx('heartbeat', h.center, { vol: 0.5 + k * 0.4, ui: h.isPlayer, rate: 1 + k * 0.25 });
        }
        if (d.t >= U.downT) { kit.rise(); return false; }
        return true;
      },
      // finished off while down (the override ends before the kit hears of the death): Undying is spent
      onEnd(died) { if (died && kit.down) { kit.down = null; kit.undyingCd = U.cd; } },
    };
    h.override = seq;
  }
  rise() {
    const h = this.h, w = this.w;
    this.down = null;
    this.undyingCd = U.cd;
    h.hp = h.maxHp * U.riseHp;
    h.invuln = 0.4;
    this.busyT = 0.45;
    h.anim.play(this.clips.rise, {
      onEvent: (e) => {
        if (e !== 'rise' || h.dead) return;
        const c = h.center.clone();
        for (const t of w.inSphere(c, 8, this.enemyFilter())) {
          _w.subVectors(t.pos, h.pos).setY(0).normalize();
          w.damage(h, t, 80, { dir: _w.clone(), knock: _w.clone().multiplyScalar(13).setY(6), power: 1.4, type: 'ability' });
        }
        this.fx.sphere(c, { color: 0xffe0a0, intensity: 1.3, r1: 6, life: 0.45 });
        this.fx.ring(_v.set(c.x, w.floorAt(c.x, c.z, c.y) + 0.05, c.z), { color: 0xffd070, intensity: 1.6, r1: 9, life: 0.55 });
        this.fx.pillar(h.pos, { color: 0xffd070, height: 20, radius: 1.4, life: 1.1 });
        this.fx.dustRing(h.pos, { n: 28, speed: 14, size: 1.2, size1: 3.2 });
        w.renderer.addWave(c, { strength: 0.07, life: 0.6 });
        w.sfx('undying_rise', c, { vol: 1, important: true });
        w.shakeAt(c, 0.6);
        if (w.settings.comic) this.fx.comic(c.clone().add(_w.set(0, 2.2, 0)), 'I AM IMMORTAL!', { size: 2.8, fill: '#d9b25a', life: 1 });
      },
    });
  }

  // ---------------- LMB: centuries of war ----------------
  strike(it) {
    const h = this.h, w = this.w;
    const i = this.combo;
    this.combo = (this.combo + 1) % 3;
    this.comboT = 0;
    const clip = [this.clips.straightR, this.clips.hookL, this.clips.hammer][i];
    const dmg = [52, 52, 90][i];
    this.nextAt = w.time + [0.31, 0.3, 0.56][i];
    const tgt = this.aimTarget(6.6, 0.6);
    if (tgt && tgt.pos.distanceTo(h.pos) > 2.3) h.override = new Lunge(h, tgt, { speed: 25, maxT: 0.2, stopDist: 1.4 });
    if (tgt) h.aimDir.copy(_v.subVectors(tgt.center, h.center).normalize());
    w.sfx('swing_heavy', h.pos, { vol: 0.7, rate: 0.9 });
    h.anim.play(clip, {
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const fin = i === 2;
        const hits = this.melee({
          reach: 1.6, radius: 1.9, dmg, knock: fin ? 4 : 5, up: fin ? 6 : 1, power: fin ? 1.4 : 1.0, cleave: true,
          hitSfx: 'punch_heavy', fxPower: fin ? 1.6 : 1.25,
        });
        if (fin) {
          const p = h.pos.clone().addScaledVector(_v.set(h.aimDir.x, 0, h.aimDir.z).normalize(), 1.6);
          p.y = w.floorAt(p.x, p.z, h.pos.y);
          if (h.pos.y - p.y < 2.5) {
            this.fx.groundSlam(p, { power: 0.7 });
            w.sfx('ground_slam', p, { vol: 0.65, rate: 1.2 });
            for (const e2 of w.inSphere(p, 3.2, this.enemyFilter())) if (!hits.includes(e2)) w.damage(h, e2, 30, { knock: _w.subVectors(e2.pos, p).setY(0).normalize().multiplyScalar(5).setY(6).clone() });
          }
          w.shakeAt(h.pos, 0.4);
        }
        if (hits.length) { w.hitstop(fin ? 0.1 : 0.06, h); w.shakeAt(h.pos, 0.22); }
      },
    });
  }

  // ---------------- RMB: skybreaker uppercut ----------------
  uppercut(it) {
    const h = this.h, w = this.w;
    this.use('secondary');
    this.nextAt = w.time + 0.5;
    this.busyT = 0.3;
    const tgt = this.aimTarget(6, 0.6);
    if (tgt && tgt.pos.distanceTo(h.pos) > 2.2) h.override = new Lunge(h, tgt, { speed: 26, maxT: 0.2, stopDist: 1.3 });
    if (tgt) h.aimDir.copy(_v.subVectors(tgt.center, h.center).normalize());
    w.sfx('swing_heavy', h.pos, { vol: 0.8, rate: 0.8 });
    h.anim.play(this.clips.uppercut, {
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const hits = this.melee({
          reach: 1.5, radius: 1.7, dmg: 85, knock: 1.5, up: 0, power: 1.4, hitSfx: 'punch_heavy', fxPower: 1.7,
          onHit: (e2) => { e2.knock(_w.set(0, 19, 0).addScaledVector(_u.set(h.aimDir.x, 0, h.aimDir.z).normalize(), 2), { force: true }); },
        });
        const fp = h.bonePos('fistR', new THREE.Vector3());
        this.fx.sonicCone(fp, UP, { scale: 0.5, life: 0.35 });
        if (hits.length) {
          w.hitstop(0.09, h); w.shakeAt(fp, 0.4);
          this.fx.ring(hits[0].center, { r1: 3.5, life: 0.3, normal: UP, intensity: 1.2 });
          if (w.settings.comic) this.fx.comic(hits[0].center.clone().add(_w.set(0, 1.6, 0)), 'SKY-HIGH!', { size: 2.2, fill: '#5f8fe0' });
        }
      },
    });
  }

  // ---------------- SHIFT: guardian's dive ----------------
  /** the ally he's diving to: whoever is under the crosshair, else the one nearest the aim */
  diveAlly(it) {
    const h = this.h, w = this.w;
    if (it.aimHero && it.aimHero.team === h.team && it.aimHero !== h && !it.aimHero.dead && it.aimHero.pos.distanceTo(h.pos) < 38) return it.aimHero;
    let best = null, bs = -1;
    for (const a of w.alliesOf(h)) {
      _v.subVectors(a.center || a.pos, h.center || h.pos);
      const d = _v.length();
      if (d > 36 || d < 3) continue;
      const dot = _v.multiplyScalar(1 / d).dot(h.aimDir);
      if (dot < Math.cos(0.22)) continue;
      const s = dot * 2 - d / 36;
      if (s > bs) { bs = s; best = a; }
    }
    return best;
  }
  guardianDive(it) {
    const h = this.h, w = this.w, kit = this;
    const ally = this.diveAlly(it);
    let target;
    if (ally) {
      // land between them and the nearest threat, else just in front of them
      const foe = this.nearestEnemy(30, ally.pos);
      _v.subVectors(foe ? foe.pos : h.pos, ally.pos).setY(0);
      if (_v.lengthSq() < 1e-3) _v.set(-h.aimDir.x, 0, -h.aimDir.z);
      _v.normalize();
      target = ally.pos.clone().addScaledVector(_v, 2.2);
      if (ally.grounded || ally.mode !== 'fly') target.y = w.floorAt(target.x, target.z, ally.pos.y + 0.5);
      if (w.blocked(target, h.radius)) target.copy(ally.pos);
    } else {
      // a spot, or an enemy: he comes down just short of them, on the ground under them unless
      // they are well up in the air
      const foe = it.aimHero && it.aimHero.team !== h.team && it.aimHero.targetable ? it.aimHero : null;
      target = foe ? foe.pos.clone() : it.aimPoint.clone();
      _v.subVectors(target, h.pos);
      if (_v.length() > 35) target = h.pos.clone().addScaledVector(_v.normalize(), 35);
      else if (foe) target.addScaledVector(_v.setY(0).normalize(), -1.6);
      // (the floor under the spot: aimed at a wall, that's its foot, not the roof above)
      const gy = w.floorAt(target.x, target.z, target.y);
      if (target.y - gy < 3) target.y = gy;
    }
    if (target.distanceTo(h.pos) < 3) { w.sfx('denied', null, { ui: h.isPlayer }); return; }
    target.y = Math.min(target.y, 120);
    this.use('a1');
    const air = ally && !ally.grounded && ally.mode === 'fly';
    const flat = Math.hypot(target.x - h.pos.x, target.z - h.pos.z), rise = target.y - h.pos.y;
    const arc = air ? 0 : clamp(2 + flat * 0.12 - Math.min(0, rise) * 0.25, 2, 7);
    w.sfx('takeoff', h.pos, { vol: 0.9 });
    w.sfx('dash', h.pos, { vol: 0.6, rate: 0.85 });
    if (h.grounded) this.fx.dustRing(h.pos, { n: 18, speed: 9, size: 0.9, size1: 2.6 });
    h.anim.play(this.clips.dive, { hold: true });
    const tr = this.fx.trail({ color: 0xffe6b0, intensity: 1.1, width: 0.5, life: 0.35, max: 34, minDist: 0.3 });
    const travel = new Travel(h, { dir: _v.subVectors(target, h.pos), speed: 55, dist: 999, toPoint: target, arc, animMode: 'fly', boost: 1, flutter: 30, onStep: () => { tr.push(h.center); return true; } });
    travel.onEnd = (died) => {
      tr.stop();
      h.anim.stop(0.12);
      if (died) return;
      if (ally && !ally.dead) {
        ally.overhealth = Math.max(ally.overhealth, 120); ally.ohT = 5;
        this.fx.ring(ally.center, { color: 0xffd070, intensity: 1.2, r1: 2.5, life: 0.4 });
        this.fx.glow(ally.center, { color: LIFE, size: 1.8, life: 0.2 });
        if (ally.isPlayer) w.emit('message', { hero: ally, text: 'The Immortal has your back: +120 overhealth' });
      }
      const p = h.pos.clone();
      const onGround = p.y - h.groundY < 0.3;
      if (onGround) {
        h.mode = 'ground'; h.vel.set(0, 0, 0);
        h.anim.play(kit.clips.superland);
        h.status.rootT = 0.25; this.busyT = 0.25;
        this.fx.groundSlam(p, { power: 1 });
      } else {
        h.mode = h.flyEnergy > 0.1 ? 'fly' : 'air'; h.vel.set(0, 0, 0);
        this.fx.ring(h.center, { r1: 6, life: 0.35, intensity: 1.2 });
      }
      for (const e of w.inSphere(onGround ? p : h.center, 6, this.enemyFilter())) {
        _w.subVectors(e.pos, p).setY(0).normalize();
        w.damage(h, e, 55, { dir: _w.clone(), knock: _w.clone().multiplyScalar(9).setY(5), power: 1.2, type: 'ability' });
      }
      w.sfx('pounce_land', p, { vol: 0.85 });
      w.shakeAt(p, 0.5);
    };
    h.override = travel;
  }

  // ---------------- E: rallying cry ----------------
  rally() {
    const h = this.h, w = this.w;
    this.use('a2');
    this.busyT = 0.45;
    h.anim.play(this.clips.rally, {
      onEvent: (e) => {
        if (e !== 'cry' || h.dead) return;
        for (const a of w.alliesOf(h, true)) {
          if (a.pos.distanceTo(h.pos) > 18) continue;
          const st = a.status;
          st.dr = Math.max(st.dr, 0.2); st.drT = Math.max(st.drT, 4);
          st.boost = Math.max(st.boost, 0.15); st.boostT = Math.max(st.boostT, 4);
          a.overhealth = Math.max(a.overhealth, 60); a.ohT = Math.max(a.ohT, 4);
          this.fx.glow(a.center, { color: LIFE, size: 1.6, life: 0.25 });
          if (a !== h) this.fx.pillar(a.pos, { color: 0xffd070, height: 6, radius: 0.7, life: 0.7, intensity: 1.4 });
        }
        const c = h.center.clone();
        h.bonePos('fistR', _u);
        this.fx.glow(_u, { color: LIFE, size: 2, life: 0.3 });
        this.fx.ring(_v.set(c.x, w.floorAt(c.x, c.z, c.y) + 0.05, c.z), { color: 0xffd070, intensity: 1.4, r0: 0.5, r1: 18, life: 0.7, soft: 0.3 });
        for (let k = 0; k < 3; k++) setTimeout(() => { if (!h.dead) this.fx.ring(h.center, { color: 0xffe8c0, intensity: 0.8 - k * 0.2, r0: 0.6 + k, r1: 5 + k * 3, life: 0.45, normal: UP, soft: 0.4 }); }, k * 90);
        w.sfx('war_cry', c, { vol: 1, important: true });
        w.shakeAt(c, 0.3);
      },
    });
  }

  // ---------------- F: hammerfall ----------------
  hammerfall(it) {
    const h = this.h, w = this.w, kit = this;
    this.use('a3');
    const high = h.pos.y - h.groundY;
    if (h.grounded || high < 2.5) {
      this.busyT = 0.55;
      h.status.rootT = 0.5;
      h.anim.play(this.clips.hammerfall, { onEvent: (e) => { if (e === 'hit' && !h.dead) kit.quake(h.pos.clone(), 0); } });
      w.sfx('swing_heavy', h.pos, { vol: 0.8, rate: 0.7 });
      return;
    }
    // from the air: straight down onto the ground under the crosshair (within reach) or under him
    let p = it.aimPoint.clone();
    if (p.distanceTo(h.pos) > 30 || p.y > h.pos.y - 1) p = h.pos.clone();
    p.y = w.floorAt(p.x, p.z, p.y);
    this.plunging = true;
    h.anim.play(this.clips.plunge, { hold: true });
    w.sfx('dash', h.pos, { vol: 0.8, rate: 0.7 });
    const tr = this.fx.trail({ color: 0xffe6b0, intensity: 1.2, width: 0.6, life: 0.3, max: 30, minDist: 0.3 });
    const travel = new Travel(h, { dir: _v.subVectors(p, h.pos), speed: 62, dist: 999, toPoint: p, animMode: 'fly', boost: 1, flutter: 30, onStep: () => { tr.push(h.center); return true; } });
    travel.onEnd = (died) => {
      tr.stop();
      kit.plunging = false;
      if (died) { h.anim.stop(0.1); return; }
      h.mode = 'ground'; h.vel.set(0, 0, 0);
      h.anim.play(kit.clips.smash);
      h.status.rootT = 0.35; kit.busyT = 0.35;
      kit.quake(h.pos.clone(), high);
    };
    h.override = travel;
  }
  /** the fists hitting the ground; height adds to it */
  quake(p, high) {
    const h = this.h, w = this.w;
    p.y = w.floorAt(p.x, p.z, p.y);
    const bonus = clamp(high / 25, 0, 1);
    const R8 = 8 + bonus * 1.5, top = 95 + bonus * 40;
    for (const e of w.inSphere(p, R8, this.enemyFilter())) {
      _w.subVectors(e.pos, p).setY(0);
      const d = _w.length(); _w.normalize();
      w.damage(h, e, lerp(top, 60, clamp01(d / R8)), { dir: _w.clone(), knock: _w.clone().multiplyScalar(5).setY(10), slow: 0.3, slowT: 2, power: 1.4, type: 'ability' });
    }
    this.fx.groundSlam(p, { power: 1.2 + bonus * 0.6 });
    this.fx.ring(_v.copy(p).setY(p.y + 0.05), { color: 0xffe0b0, intensity: 1.3, r1: R8 + 2, life: 0.5 });
    this.fx.rocks(p, { n: 16, speed: 10, size: 0.26, up: 1.4 });
    w.renderer.addWave(p, { strength: 0.06, life: 0.55 });
    w.sfx('ground_slam', p, { vol: 1, important: true, rate: 0.9 });
    w.shakeAt(p, 0.6 + bonus * 0.3);
    if (w.settings.comic && (bonus > 0.3 || Math.random() < 0.3)) this.fx.comic(p.clone().add(_w.set(0, 2, 0)), 'KRA-KOOM!', { size: 2.4 });
  }

  // ---------------- Q: I AM IMMORTAL ----------------
  immortal() {
    const h = this.h, w = this.w;
    h.ult = 0;
    w.emit('ult', { hero: h, name: 'I AM IMMORTAL' });
    this.ultState = { t: 0 };
    this.undyingCd = 0;
    h.status.boost = Math.max(h.status.boost, 0.2); h.status.boostT = Math.max(h.status.boostT, 8);
    h.status.stunT = 0; h.status.slow = 0;
    this.busyT = 0.55;
    w.sfx('war_cry', h.center, { vol: 1, important: true, rate: 0.85 });
    h.anim.play(this.clips.undying, {
      onEvent: (e) => {
        if (e !== 'roar' || h.dead) return;
        const c = h.center.clone();
        for (const t of w.inSphere(c, 10, this.enemyFilter())) {
          _w.subVectors(t.pos, h.pos).setY(0).normalize();
          w.damage(h, t, 60, { dir: _w.clone(), knock: _w.clone().multiplyScalar(14).setY(5), power: 1.4, type: 'ult' });
        }
        this.fx.sphere(c, { color: 0xffd890, intensity: 1.2, r1: 7, life: 0.5 });
        this.fx.pillar(h.pos, { color: 0xffd070, height: 26, radius: 1.8, life: 1.4 });
        this.fx.ring(_v.set(c.x, w.floorAt(c.x, c.z, c.y) + 0.05, c.z), { color: 0xffd070, intensity: 1.8, r1: 12, life: 0.6 });
        this.fx.dustRing(h.pos, { n: 30, speed: 15, size: 1.2, size1: 3.4 });
        w.renderer.addWave(c, { strength: 0.08, life: 0.7, speed: 1.7 });
        w.renderer.flash(0xffe0a0, 0.25);
        w.shakeAt(c, 0.7);
        if (w.settings.comic) this.fx.comic(c.clone().add(_w.set(0, 2.6, 0)), 'I AM IMMORTAL!', { size: 3.2, life: 1, fill: '#d9b25a' });
      },
    });
  }
  endUlt() {
    if (!this.ultState) return;
    this.ultState = null;
  }

  onDeath() {
    // finished off while down (or with Undying spent): it's used either way
    if (this.down) this.undyingCd = U.cd;
    this.down = null;
    this.plunging = false;
    this.endUlt();
    this.h.unstoppable = false; this.h.anchored = false;
  }
  dispose() { this.h.unstoppable = false; this.h.anchored = false; }
}
