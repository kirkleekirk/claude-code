import * as THREE from 'three';
import { Kit, Lunge, Travel } from '../kit.js';
import { clips, mirrorClip } from '../../anim/clip.js';
import { makeMask } from '../../anim/pose.js';
import { SHAPE } from '../../vfx/particles.js';
import { RULES } from '../data.js';
import { clamp, clamp01, rand, lerp, damp } from '../../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const R = RULES.allen;
const MAX_RES = R.maxLevel * R.strainPerLevel;
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const GOLD = [3.4, 1.9, 0.5, 1]; // HDR: the Resilience surge
const UPPER_ROOT = makeMask(['upper', { g: 'rootYaw', w: 0.8 }, { g: 'rootZ', w: 0.7 }, { g: 'rootY', w: 0.7 }, { g: 'rootPitch', w: 0.6 }]);
const UPPER_Y = makeMask(['upper', { g: 'rootY', w: 1 }]);
const FULL = makeMask(['all']);

const HAYMAKER = {
  // a wide, looping right: cocked out behind the shoulder, then whipped across with the whole body
  mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.22,
  keys: [
    { t: 0, p: { RikW: 1, Rik: [0.85, -0.05, -0.25], Rpole: [0.4, 0.2, -1], Rfist: 1, LikW: 1, Lik: [0.12, -0.3, 0.38], Lpole: [1, -1, -0.2], Lfist: 1, spineYaw: -40, rootYaw: -16, spinePitch: 2, browAnger: 1 } },
    // (coiling a little further: the wind-up reads before the snap)
    { t: 0.08, e: 'inout', p: { Rik: [0.9, -0.02, -0.32], spineYaw: -45, rootYaw: -18 } },
    { t: 0.15, e: 'snap', p: { Rik: [-0.3, 0.02, 0.8], Rpole: [0.9, 0.7, 0.1], spineYaw: 34, rootYaw: 16, spinePitch: 14, rootZ: 0.14 } },
    { t: 0.3, e: 'out', p: { Rik: [-0.36, -0.02, 0.74] } },
  ],
  events: [{ t: 0.13, e: 'hit' }],
};

export const ALLEN_CLIPS = clips({
  hayR: HAYMAKER,
  hayL: mirrorClip(HAYMAKER),
  // finisher: the right comes over the top and down, his weight dropping in behind it
  overhand: {
    mask: UPPER_ROOT, fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.35, 0.85, -0.2], Rpole: [1, 0.3, -0.6], Rfist: 1, LikW: 1, Lik: [0.1, -0.25, 0.4], Lpole: [1, -1, -0.2], Lfist: 1, spineYaw: -24, spinePitch: -14, rootYaw: -10, headPitch: -8, browAnger: 1 } },
      { t: 0.13, e: 'in', p: { Rik: [0.38, 0.92, -0.32], spinePitch: -20 } },
      { t: 0.22, e: 'snap', p: { Rik: [-0.1, -0.55, 0.8], Rpole: [1, -0.2, -0.4], spineYaw: 26, spinePitch: 40, rootYaw: 12, headPitch: 14, rootY: -0.2, rootZ: 0.15, rootPitch: 6 } },
      { t: 0.4, e: 'out', p: { Rik: [-0.1, -0.52, 0.78] } },
    ],
    events: [{ t: 0.165, e: 'hit' }],
  },
  // RMB held: the right fist drawn all the way back, the left out front lining it up
  windup: {
    mask: UPPER_ROOT, fadeIn: 0.12, fadeOut: 0.1, loop: true, duration: 0.6,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.55, 0.05, -0.55], Rpole: [0.6, -0.4, -1], Rfist: 1, LikW: 1, Lik: [0.05, -0.05, 0.75], Lpole: [1, -0.6, -0.3], Lfist: 0.7, spineYaw: -48, rootYaw: -18, spinePitch: 8, rootY: -0.1, browAnger: 1 } },
      { t: 0.3, p: { Rik: [0.56, 0.09, -0.58], spineYaw: -51 } },
      { t: 0.6, p: { Rik: [0.55, 0.05, -0.55], spineYaw: -48 } },
    ],
  },
  crack: {
    mask: UPPER_ROOT, fadeIn: 0.02, fadeOut: 0.3,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.55, 0.05, -0.55], Rpole: [0.6, -0.4, -1], Rfist: 1, LikW: 1, Lik: [0.05, -0.05, 0.75], Lpole: [1, -0.6, -0.3], Lfist: 1, spineYaw: -48, rootYaw: -18, spinePitch: 8, rootY: -0.1, browAnger: 1 } },
      { t: 0.08, e: 'snap', p: { Rik: [-0.12, 0.08, 1.02], Rpole: [1, -0.5, -0.3], RclavFwd: 26, Lik: [0.3, -0.35, -0.05], spineYaw: 40, rootYaw: 18, spinePitch: 16, rootZ: 0.2, rootY: -0.06 } },
      { t: 0.32, e: 'out', p: { Rik: [-0.1, 0.06, 0.98] } },
    ],
    events: [{ t: 0.075, e: 'hit' }],
  },
  // SHIFT: head down behind the right shoulder, fists tucked in
  bulldoze: {
    mask: UPPER_Y, fadeIn: 0.05, fadeOut: 0.2, loop: true, duration: 1,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.2, -0.32, 0.22], Rpole: [1, -1, -0.2], Rfist: 1, LikW: 1, Lik: [0.25, -0.12, 0.45], Lpole: [1, -0.8, -0.3], Lfist: 1, spineYaw: 30, spinePitch: 26, spineRoll: -6, headPitch: -16, headYaw: -18, RclavFwd: 18, RclavLift: -6, rootY: -0.08, browAnger: 1 } },
      { t: 1, p: {} },
    ],
  },
  // E: a double-biceps "bring it", chest out
  harden: {
    mask: UPPER_Y, fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { Barm: [0.55, -0.6, 0.3], Belbow: 95, Bfist: 1, spinePitch: 20, headPitch: 10, rootY: -0.12, browAnger: 1 } },
      { t: 0.18, e: 'snap', p: { Barm: [0.9, 0.22, 0.05], Belbow: 120, BarmTwist: -30, BclavLift: 14, spinePitch: -10, headPitch: -12, rootY: 0 } },
      { t: 0.6, e: 'inout', p: { Barm: [0.88, 0.16, 0.08], spinePitch: -6 } },
    ],
    events: [{ t: 0.17, e: 'flex' }],
  },
  // F: gathers himself, then throws his chest out and his head back
  surge: {
    mask: UPPER_Y, fadeIn: 0.08, fadeOut: 0.4,
    keys: [
      { t: 0, p: { Barm: [0.45, -0.8, 0.3], Belbow: 70, Bfist: 1, spinePitch: 30, headPitch: 22, rootY: -0.18, browAnger: 1 } },
      { t: 0.16, e: 'inout', p: { Barm: [0.4, -0.85, 0.34], Belbow: 80, spinePitch: 34, headPitch: 26, rootY: -0.22 } },
      { t: 0.25, e: 'snap', p: { Barm: [0.7, -0.66, -0.3], Belbow: 30, BclavLift: 10, spinePitch: -20, headPitch: -32, rootY: 0.02 } },
      { t: 0.9, e: 'inout', p: { Barm: [0.68, -0.7, -0.26], spinePitch: -12, headPitch: -20 } },
    ],
    events: [{ t: 0.24, e: 'surge' }],
  },
  // Q: crouched and shaking with it, then exploding up and open
  limit: {
    mask: UPPER_Y, fadeIn: 0.06, fadeOut: 0.45,
    keys: [
      { t: 0, p: { Barm: [0.35, -0.85, 0.35], Belbow: 100, Bfist: 1, spinePitch: 40, headPitch: 25, rootY: -0.35, browAnger: 1 } },
      { t: 0.35, e: 'in', p: { Barm: [0.3, -0.9, 0.38], spinePitch: 44, rootY: -0.4 } },
      { t: 0.45, e: 'snap', p: { Barm: [0.8, 0.45, -0.1], Belbow: 35, BclavLift: 22, spinePitch: -24, headPitch: -36, rootY: 0.05 } },
      { t: 1.2, e: 'inout', p: { Barm: [0.78, 0.35, -0.05], spinePitch: -14, headPitch: -22 } },
    ],
    events: [{ t: 0.44, e: 'blast' }],
  },
  land: {
    mask: FULL, fadeIn: 0.03, fadeOut: 0.35,
    keys: [
      { t: 0, p: { rootY: -0.55, spinePitch: 34, headPitch: -20, BlegIkW: 1, LlegIk: [0.24, 0.12, 0.15], RlegIk: [-0.24, 0.12, -0.2], BfootGround: 1, Barm: [0.5, -0.75, 0.2], Belbow: 50, Bfist: 1, browAnger: 1 } },
      { t: 0.35, e: 'out', p: { rootY: -0.38, spinePitch: 20 } },
    ],
  },
  getup: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.5, spinePitch: 40, headPitch: -20, Barm: [0.35, -0.85, 0.35], Belbow: 45, Bfist: 1 } },
      { t: 0.3, e: 'inout', p: { rootY: -0.1, spinePitch: 10 } },
    ],
  },
});

/**
 * Allen the Alien. Unopan Resilience: damage he lives through is Strain, and once he has survived
 * the fight (a few seconds without taking damage) it turns into levels of Resilience: more health,
 * damage, speed and flight speed. The closer he came to dying, the more it counts.
 */
export class AllenKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = ALLEN_CLIPS;
    this.combo = 0; this.comboT = 0; this.nextAt = 0; this.queued = false;
    this.res = 0; // banked Resilience, in Strain points (a level every R.strainPerLevel)
    this.strain = 0; // damage survived, not banked yet
    this.level = 0;
    this.charge = null; // RMB wind-up
    this.brace = null; // Unbreakable
    this.ultState = null;
    this.scale = 1;
    this.lastLevelAt = -99;
  }
  /** the level the bonuses use (the ult runs him at the top) */
  get eff() { return this.ultState ? R.maxLevel : this.level; }
  get dmgMul() { return 1 + R.dmg * this.eff; }
  get speedMul() { return (1 + R.speed * this.eff) * (this.charge ? 0.6 : 1); }
  get flyMul() { return 1 + R.fly * this.eff; }
  /** what the HUD and the overhead name show */
  get tag() { return this.eff ? ROMAN[this.eff] : ''; }
  hudPassive() {
    const lv = this.eff, top = lv >= R.maxLevel;
    return {
      text: `RESILIENCE ${lv ? ROMAN[lv] : '0'}`, hot: !!this.ultState,
      fill: top ? 1 : (this.res % R.strainPerLevel) / R.strainPerLevel,
      pend: top ? 0 : Math.min(1, this.strain / R.strainPerLevel),
    };
  }

  /** health follows the level: a gained level comes with its health already filled */
  applyLevel() {
    const h = this.h;
    this.level = Math.min(R.maxLevel, Math.floor(this.res / R.strainPerLevel + 1e-6));
    const max = Math.round(h.def.hp * (1 + R.hp * this.eff));
    if (max !== h.maxHp) {
      const grow = max - h.maxHp;
      h.maxHp = max;
      h.hp = h.dead ? h.hp : clamp(h.hp + Math.max(0, grow), 1, max);
    }
  }

  /** every frame, dead or alive: banking Strain, the brace, the ult and the look of it all */
  tick(dt) {
    const h = this.h, w = this.w;
    // the fight is over and he is still standing: the Strain becomes Resilience
    if (!h.dead && this.strain > 0 && w.time - h.lastHurt > R.bankDelay) this.bank(false);
    if (this.brace) {
      this.brace.t += dt;
      if (h.dead || this.brace.t >= 3) this.endBrace(!h.dead);
    }
    if (this.ultState) {
      this.ultState.t += dt;
      if (h.dead || this.ultState.t >= 10) this.endUlt(!h.dead);
    }
    h.unstoppable = !h.dead && !!(this.brace || this.ultState);
    // he grows a little with every level
    const want = 1 + this.eff * 0.012 + (this.ultState ? 0.04 : 0);
    this.scale = damp(this.scale, want, 4, dt);
    h.visual.scale.setScalar(this.scale);
    if (h.dead) return;
    // the glow: a level-up flares, the brace and the ult burn steady
    const flare = Math.max(0, 1 - (w.time - this.lastLevelAt) / 0.8);
    const g = Math.max(flare * 0.55, this.brace ? 0.3 : 0, this.ultState ? 0.38 : 0, this.eff >= 6 ? 0.04 + (this.eff - 6) * 0.02 : 0);
    if (g > 0.005 || h.glowTarget > 0) { h.glowTarget = g; h.U.uGlowColor.value.setRGB(1, 0.58, 0.16); }
    // embers off him at high levels, a storm of them in the ult
    const rate = this.ultState ? 40 : this.brace ? 14 : this.eff >= 4 ? (this.eff - 3) * 1.6 : 0;
    if (rate && Math.random() < dt * rate) {
      const p = _v.copy(h.capA).lerp(h.capB, Math.random()).add(_w.set(rand(-0.45, 0.45), rand(-0.3, 0.3), rand(-0.45, 0.45)));
      this.fx.add.spawn({ p, v: [rand(-0.4, 0.4), rand(1.2, 3), rand(-0.4, 0.4)], life: rand(0.35, 0.7), size: rand(0.05, 0.11), size1: 0.01, color: GOLD, color1: [2.4, 0.6, 0.1, 0], shape: SHAPE.SPARK });
    }
  }

  /** damage that reached him (after shields): it all builds Strain, the near-death part twice over */
  onHurt(dealt, hpLoss, src, o) {
    const h = this.h;
    if (h.dead) return;
    const T = h.maxHp * R.lowHp, before = h.hp + hpLoss;
    const low = Math.max(0, Math.min(before, T) - Math.max(0, h.hp));
    let s = dealt + low * (R.lowMul - 1);
    if (this.brace) s *= 2;
    this.strain = Math.min(MAX_RES, this.strain + s);
  }

  /** Strain into Resilience; returns how much went in */
  bank(forced) {
    const h = this.h, w = this.w;
    const before = this.level;
    const add = Math.min(this.strain, MAX_RES - this.res);
    this.res += add;
    const got = this.strain;
    this.strain = 0;
    this.applyLevel();
    const p = h.pos.clone(); p.y += 0.05;
    if (this.level > before) {
      this.lastLevelAt = w.time;
      this.fx.ring(p, { color: 0xffb030, intensity: 1.6, r0: 0.5, r1: 4 + this.level * 0.3, life: 0.55 });
      this.fx.converge(h.center, { n: 22, radius: 2.4, color: GOLD, life: 0.45, size: 0.13 });
      this.fx.glow(h.center, { color: GOLD, size: 2.6, life: 0.3 });
      for (let i = 0; i < 14; i++) this.fx.add.spawn({ p: [h.pos.x + rand(-0.6, 0.6), h.pos.y + rand(0, 0.4), h.pos.z + rand(-0.6, 0.6)], v: [rand(-0.3, 0.3), rand(4, 8), rand(-0.3, 0.3)], life: rand(0.5, 0.9), size: rand(0.07, 0.13), size1: 0.01, color: GOLD, color1: [2.6, 0.8, 0.1, 0], shape: SHAPE.SPARK });
      w.sfx('resilience_up', h.center, { vol: 0.9, important: h.isPlayer, rate: 1 + this.level * 0.03 });
      if (h.isPlayer) this.msg(`RESILIENCE ${ROMAN[this.level]}${this.level >= R.maxLevel ? ' · MAX' : ''}`);
      if (w.settings.comic && (h.isPlayer || this.level - before >= 2)) this.fx.comic(h.center.clone().add(_w.set(0, 1.6, 0)), this.level >= R.maxLevel ? 'UNSTOPPABLE!' : 'STRONGER!', { size: 2, fill: '#ff9a1c', life: 0.8 });
    } else if (got > 20 && !forced) {
      this.fx.ring(p, { color: 0xffb030, intensity: 0.7, r0: 0.4, r1: 2.2, life: 0.4 });
      w.sfx('ready', h.center, { vol: 0.35, ui: h.isPlayer });
    }
    return got;
  }

  update(dt, it) {
    super.update(dt);
    const h = this.h, w = this.w;
    this.comboT += dt;
    if (this.comboT > 0.9) this.combo = 0;
    if (h.override) return;
    if (this.charge) { this.chargeTick(dt, it); return; }
    if (it.ult && this.ultOk()) return this.beyond();
    if (it.a1 && this.ready('a1') && this.free) return this.bulldozer(it);
    if (it.a2 && this.ready('a2') && this.free) return this.unbreakable();
    if (it.a3 && this.ready('a3') && this.free) return this.secondWind();
    if ((it.secondaryPressed || it.secondary) && this.ready('secondary') && this.free && w.time >= this.nextAt) return this.windUp();
    if (it.primary || it.primaryPressed) this.queued = true;
    if (this.queued && w.time >= this.nextAt && this.free) { this.queued = false; this.strike(it); }
  }

  mitigate(amt) {
    // Unbreakable: half of it bounces off (all of it is remembered for the shockwave)
    if (this.brace) { this.brace.took += amt; return amt * 0.5; }
    return amt;
  }

  // ---------------- LMB: haymakers ----------------
  strike(it) {
    const h = this.h, w = this.w;
    const i = this.combo;
    this.combo = (this.combo + 1) % 3;
    this.comboT = 0;
    const fast = this.ultState ? 0.8 : 1;
    const clip = [this.clips.hayR, this.clips.hayL, this.clips.overhand][i];
    const dmg = [48, 48, 82][i];
    this.nextAt = w.time + [0.34, 0.32, 0.58][i] * fast;
    const tgt = this.aimTarget(6.8, 0.6);
    if (tgt && tgt.pos.distanceTo(h.pos) > 2.4) h.override = new Lunge(h, tgt, { speed: 24, maxT: 0.2, stopDist: 1.5 });
    if (tgt) h.aimDir.copy(_v.subVectors(tgt.center, h.center).normalize());
    w.sfx('swing_heavy', h.pos, { vol: 0.75, rate: 0.8 });
    h.anim.play(clip, {
      speed: 1 / fast,
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const fin = i === 2;
        const hits = this.melee({
          reach: 1.7, radius: 2.0, dmg, knock: fin ? 6 : 5, up: fin ? 5 : 1, power: fin ? 1.4 : 1.05, cleave: true,
          hitSfx: 'punch_heavy', fxPower: fin ? 1.6 : 1.25,
        });
        if (fin) {
          const p = h.pos.clone().addScaledVector(_v.set(h.aimDir.x, 0, h.aimDir.z).normalize(), 1.7);
          p.y = w.floorAt(p.x, p.z, h.pos.y);
          if (h.pos.y - p.y < 2.5) { this.fx.groundSlam(p, { power: 0.55 }); w.sfx('ground_slam', p, { vol: 0.55, rate: 1.25 }); }
          w.shakeAt(h.pos, 0.35);
        }
        if (hits.length) {
          w.hitstop(fin ? 0.1 : 0.06, h); w.shakeAt(h.pos, 0.22);
          if (fin && w.settings.comic && Math.random() < 0.4) this.fx.comic(hits[0].center.clone().add(_w.set(0, 1, 0)), 'KRAKK!', { size: 2, fill: '#39d36e' });
        }
      },
    });
  }

  // ---------------- RMB: planet cracker ----------------
  windUp() {
    const h = this.h;
    this.charge = { t: 0, anim: h.anim.play(this.clips.windup, { hold: true }), hum: this.w.sfx('charge', h.center, { vol: 0.55, rate: 1.25 }) };
  }
  chargeTick(dt, it) {
    const c = this.charge, h = this.h;
    c.t += dt;
    const k = clamp01(c.t / 1.0);
    // power gathering in the fist
    if (Math.random() < dt * (12 + 40 * k)) {
      // motes drawn into the fist
      h.bonePos('fistR', _u);
      _w.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 0.6) * (1 - k * 0.4));
      this.fx.add.spawn({ p: _u.clone().add(_w), v: _w.clone().multiplyScalar(-1 / 0.22), life: 0.22, size: 0.04 + k * 0.05, size1: 0.08 + k * 0.08, color: [GOLD[0], GOLD[1], GOLD[2], 0], color1: GOLD, shape: SHAPE.SPARK });
    }
    if (k >= 1 && !c.full) { c.full = true; this.fx.glow(h.bonePos('fistR', _u), { color: GOLD, size: 1.2, life: 0.15 }); this.w.sfx('counter_ready', h.center, { vol: 0.5, ui: h.isPlayer }); }
    if (!it.secondary || c.t > 1.5 || it.primaryPressed) this.release(k);
  }
  release(k) {
    const h = this.h, w = this.w, kit = this;
    this.charge = null;
    this.use('secondary');
    this.nextAt = w.time + 0.45;
    this.busyT = 0.35;
    const tgt = this.aimTarget(7.5, 0.55);
    if (tgt && tgt.pos.distanceTo(h.pos) > 2.2) h.override = new Lunge(h, tgt, { speed: 30, maxT: 0.2, stopDist: 1.5 });
    else if (!tgt) { _v.set(h.aimDir.x, 0, h.aimDir.z).normalize(); h.vel.addScaledVector(_v, 10 * k); }
    if (tgt) h.aimDir.copy(_v.subVectors(tgt.center, h.center).normalize());
    w.sfx('swing_heavy', h.pos, { vol: 0.9, rate: 0.7 });
    const tr = this.fx.trail({ color: 0xffc070, intensity: 1.2 + k, width: 0.12 + k * 0.1, life: 0.16, max: 16, minDist: 0.04 });
    let tt = 0;
    this.fx.every((dt) => { tt += dt; tr.push(h.bonePos('fistR', _u)); if (tt > 0.2 || h.dead) { tr.stop(); return false; } return true; });
    h.anim.play(this.clips.crack, {
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const dmg = lerp(70, 160, k), full = k >= 0.95;
        const hits = kit.melee({
          reach: 1.9, radius: 1.8, dmg, knock: lerp(6, 22, k), up: lerp(2, 8, k), power: 1 + k * 0.6, hitSfx: 'punch_heavy', fxPower: 1.4 + k,
          onHit: (e2, p, dir) => { if (full) e2.knock(dir.clone().multiplyScalar(8).setY(4), { force: false }); },
        });
        const fp = h.bonePos('fistR', new THREE.Vector3());
        kit.fx.glow(fp, { color: GOLD, size: 1.2 + k * 1.6, life: 0.14 });
        if (k > 0.5) kit.fx.ring(fp, { color: 0xffd090, intensity: 1.2, r0: 0.3, r1: 2 + k * 3, life: 0.3, normal: h.aimDir });
        if (hits.length) {
          w.hitstop(0.06 + k * 0.08, h); w.shakeAt(fp, 0.25 + k * 0.4);
          if (full) {
            w.renderer.addWave(fp, { strength: 0.05, life: 0.45 });
            w.sfx('sonic_boom', fp, { vol: 0.6, rate: 1.4 });
            if (w.settings.comic) kit.fx.comic(hits[0].center.clone().add(_w.set(0, 1.2, 0)), 'KA-BOOM!', { size: 2.6, fill: '#ff9a1c' });
          }
        }
      },
    });
  }

  // ---------------- SHIFT: bulldozer ----------------
  bulldozer(it) {
    const h = this.h, w = this.w, kit = this;
    this.use('a1');
    const dir = h.aimDir.clone();
    const flying = h.mode === 'fly';
    if (!flying) dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    dir.normalize();
    const hit = new Set();
    w.sfx('dash', h.pos, { vol: 0.9, rate: 0.75 });
    w.sfx('step_heavy', h.pos, { vol: 0.8 });
    this.fx.dustRing(h.pos, { n: 16, speed: 9, size: 0.9, size1: 2.4 });
    h.anim.play(this.clips.bulldoze, { hold: true });
    if (h.isPlayer) { w.renderer.fx.speedLines = 0.6; w.camRig.kick(8); }
    const tr = this.fx.trail({ color: 0xffe0b0, intensity: 0.9, width: 0.7, life: 0.3, max: 30, minDist: 0.3 });
    let dust = 0;
    const travel = new Travel(h, {
      dir, speed: 44, dist: 24, animMode: flying ? 'fly' : 'ground', boost: flying ? 1 : 0,
      onStep: (a, b, dt) => {
        tr.push(h.center);
        // the ground tears up under him
        dust += dt;
        if (!flying && dust > 0.05) { dust = 0; kit.fx.dustRing(h.pos, { n: 4, radius: 0.5, speed: 4, size: 0.7, size1: 1.8, life: 0.6 }); }
        for (const e of w.heroes) {
          if (e.team === h.team || !e.targetable || hit.has(e)) continue;
          if (segPoint(a, b, e.center) > 1.7 + e.radius) continue;
          hit.add(e);
          // knocked aside, off whichever side of him they were
          const side = _w.crossVectors(dir, UP);
          if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
          side.normalize();
          if (_u.subVectors(e.pos, h.pos).dot(side) < 0) side.negate();
          const kv = side.multiplyScalar(11).addScaledVector(dir, 8); kv.y += 6;
          w.damage(h, e, 65, { dir: dir.clone(), knock: kv.clone(), power: 1.3, type: 'ability' });
          kit.fx.punchImpact(e.center, dir, { power: 1.5 });
          w.sfx('punch_heavy', e.center, { vol: 1 });
          w.hitstop(0.05, h); w.shakeAt(e.center, 0.35);
          if (w.settings.comic && hit.size === 2) kit.fx.comic(e.center.clone().add(_w.set(0, 1.2, 0)), 'OUTTA THE WAY!', { size: 1.8, fill: '#39d36e' });
        }
      },
    });
    travel.onEnd = (died) => {
      tr.stop();
      h.anim.stop(0.2);
      if (h.isPlayer) w.renderer.fx.speedLines = 0;
      if (died) return;
      h.vel.copy(dir).multiplyScalar(5);
      if (travel.hitWall) {
        const p = h.center.clone().addScaledVector(dir, 0.8);
        kit.fx.rocks(p, { n: 14, speed: 8, size: 0.24 }); kit.fx.smoke(p, { n: 8, size: 1.1, size1: 2.8 });
        w.sfx('rock_hit', p, { vol: 0.9 }); w.shakeAt(p, 0.45);
      }
      if (h.grounded && !flying) { h.anim.play(kit.clips.land, { fadeIn: 0.1 }); kit.fx.dustRing(h.pos, { n: 14, speed: 6, size: 0.7, size1: 2.2, life: 0.6 }); }
      else if (!h.grounded) h.mode = h.def.flight && h.flyEnergy > 0.1 && flying ? 'fly' : 'air';
    };
    h.override = travel;
  }

  // ---------------- E: unbreakable ----------------
  unbreakable() {
    const h = this.h, w = this.w;
    this.use('a2');
    this.busyT = 0.3;
    this.brace = { t: 0, took: 0 };
    h.anim.play(this.clips.harden, {
      onEvent: (e) => {
        if (e !== 'flex' || h.dead) return;
        this.fx.sphere(h.center, { color: 0xffa030, intensity: 0.8, r1: 2.2, life: 0.3 });
        this.fx.ring(_v.copy(h.pos).setY(h.pos.y + 0.05), { color: 0xffb040, intensity: 1.2, r1: 3.5, life: 0.4 });
      },
    });
    w.sfx('unbreakable', h.center, { vol: 0.9 });
  }
  endBrace(alive) {
    const h = this.h, w = this.w;
    const b = this.brace;
    this.brace = null;
    if (!alive || !b) return;
    // everything he soaked up comes back out
    const dmg = Math.min(220, 50 + b.took * 0.3);
    const c = h.center.clone(), R9 = 9;
    for (const e of w.inSphere(c, R9, this.enemyFilter())) {
      _w.subVectors(e.pos, h.pos).setY(0);
      const d = _w.length(); _w.normalize();
      w.damage(h, e, lerp(dmg, dmg * 0.6, clamp01(d / R9)), { dir: _w.clone(), knock: _w.clone().multiplyScalar(12).setY(5), power: 1.3, type: 'ability' });
    }
    this.fx.sphere(c, { color: 0xffb040, intensity: 1.1, r1: R9 * 0.7, life: 0.4 });
    this.fx.ring(_v.set(c.x, w.floorAt(c.x, c.z, c.y) + 0.05, c.z), { color: 0xffa030, intensity: 1.4, r1: R9, life: 0.5 });
    this.fx.dustRing(h.pos, { n: 26, speed: 14, size: 1.1, size1: 3.2 });
    w.renderer.addWave(c, { strength: 0.06, life: 0.55 });
    w.sfx('thunderclap', c, { vol: 0.9, rate: 1.2 });
    w.shakeAt(c, 0.55);
    if (w.settings.comic && b.took > 250) this.fx.comic(c.clone().add(_w.set(0, 2, 0)), 'IS THAT ALL?!', { size: 2.2, fill: '#ff9a1c' });
  }

  // ---------------- F: second wind ----------------
  secondWind() {
    const h = this.h, w = this.w;
    if (this.strain < 10) { this.msg('No Strain to come back from'); w.sfx('denied', null, { ui: h.isPlayer }); this.use('a3', 1); return; }
    this.use('a3');
    this.busyT = 0.4;
    h.anim.play(this.clips.surge, {
      onEvent: (e) => {
        if (e !== 'surge' || h.dead) return;
        const got = this.bank(true);
        w.heal(h, h, Math.max(40, got * 0.4));
        this.fx.healBurst(h.pos, { color: GOLD });
        this.fx.sphere(h.center, { color: 0xffb040, intensity: 1, r1: 3, life: 0.35 });
        w.sfx('second_wind', h.center, { vol: 1 });
      },
    });
  }

  // ---------------- Q: beyond the limit ----------------
  beyond() {
    const h = this.h, w = this.w;
    h.ult = 0;
    w.emit('ult', { hero: h, name: 'BEYOND THE LIMIT' });
    this.busyT = 0.6;
    h.status.stunT = 0; h.status.slow = 0;
    w.sfx('limit_break', h.center, { vol: 1, important: true });
    h.anim.play(this.clips.limit, {
      onEvent: (e) => {
        if (e !== 'blast' || h.dead) return;
        // the blast goes off at the level he is at; then the surge lifts him to the top
        const c = h.center.clone();
        for (const t of w.inSphere(c, 10, this.enemyFilter())) {
          _w.subVectors(t.pos, h.pos).setY(0).normalize();
          w.damage(h, t, 120, { dir: _w.clone(), knock: _w.clone().multiplyScalar(14).setY(6), power: 1.5, type: 'ult' });
        }
        this.ultState = { t: 0 };
        this.applyLevel();
        w.heal(h, h, h.maxHp * 0.4);
        this.fx.sphere(c, { color: 0xffa030, intensity: 1.3, r1: 8, life: 0.5 });
        this.fx.ring(_v.set(c.x, w.floorAt(c.x, c.z, c.y) + 0.05, c.z), { color: 0xffc050, intensity: 1.8, r1: 12, life: 0.6 });
        this.fx.pillar(h.pos, { color: 0xffa030, height: 22, radius: 1.6, life: 1.2 });
        this.fx.dustRing(h.pos, { n: 34, speed: 16, size: 1.3, size1: 3.6, life: 1.1 });
        w.renderer.addWave(c, { strength: 0.09, life: 0.7, speed: 1.8, width: 0.1 });
        w.renderer.flash(0xffb050, 0.3);
        w.shakeAt(c, 0.8);
        if (w.settings.comic) this.fx.comic(c.clone().add(_w.set(0, 2.6, 0)), 'BEYOND THE LIMIT!', { size: 3.2, life: 1, fill: '#ff9a1c' });
      },
    });
  }
  endUlt(alive) {
    if (!this.ultState) return;
    this.ultState = null;
    // the surge leaves something behind
    if (alive) this.res = Math.min(MAX_RES, this.res + 2 * R.strainPerLevel);
    this.applyLevel();
    if (alive) { this.lastLevelAt = this.w.time; this.w.sfx('resilience_up', this.h.center, { vol: 0.7 }); }
  }

  onDeath() {
    // he didn't come back from this one: the Strain is gone and half his Resilience with it
    this.strain = 0;
    this.charge = null;
    this.brace = null;
    this.endUlt(false);
    this.res = Math.floor(this.level / 2) * R.strainPerLevel;
    this.applyLevel();
    this.h.unstoppable = false;
  }
  dispose() {
    this.h.visual.scale.setScalar(1);
    this.h.unstoppable = false;
  }
}

function segPoint(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-9 ? clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2) : 0;
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
