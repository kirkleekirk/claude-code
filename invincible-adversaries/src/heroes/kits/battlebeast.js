import * as THREE from 'three';
import { Kit, Lunge, Travel } from '../kit.js';
import { clips, mirrorClip } from '../../anim/clip.js';
import { makeMask } from '../../anim/pose.js';
import { SHAPE } from '../../vfx/particles.js';
import { RULES } from '../data.js';
import { clamp, clamp01, rand, lerp, damp } from '../../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const RAGE = [3.8, 0.4, 0.25, 1]; // HDR blood red
const UPPER_ROOT = makeMask(['upper', { g: 'rootYaw', w: 0.8 }, { g: 'rootZ', w: 0.7 }, { g: 'rootY', w: 0.7 }, { g: 'rootPitch', w: 0.6 }]);
const UPPER_Y = makeMask(['upper', { g: 'rootY', w: 1 }]);
const FULL = makeMask(['all']);

const CLAW = {
  // a raking claw: the hand cocked high behind the shoulder, then dragged down across the body
  mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.22,
  keys: [
    { t: 0, p: { RikW: 1, Rik: [0.62, 0.38, -0.15], Rpole: [0.6, 0.2, -1], Rfist: 0, Rspread: 1, RhandFlex: -25, LikW: 1, Lik: [0.25, -0.2, 0.4], Lpole: [1, -1, -0.2], Lfist: 0.3, Lspread: 0.8, spineYaw: -32, rootYaw: -12, spinePitch: 6, browAnger: 1, jaw: 0.2 } },
    { t: 0.14, e: 'snap', p: { Rik: [-0.3, -0.38, 0.78], Rpole: [1, -0.2, -0.3], RhandFlex: 10, spineYaw: 30, rootYaw: 14, spinePitch: 16, rootZ: 0.14, jaw: 0.6 } },
    { t: 0.28, e: 'out', p: { Rik: [-0.32, -0.42, 0.72] } },
  ],
  events: [{ t: 0.13, e: 'hit' }],
};

export const BEAST_CLIPS = clips({
  clawR: CLAW,
  clawL: mirrorClip(CLAW),
  // finisher: both claws raised high, then brought down together
  doubleClaw: {
    mask: UPPER_ROOT, fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.34, 0.95, 0.1], Bpole: [1, 0.2, -0.7], Bfist: 0, Bspread: 1, BhandFlex: -30, spinePitch: -22, headPitch: -14, rootY: -0.05, browAnger: 1, jaw: 0.5 } },
      { t: 0.13, e: 'in', p: { Bik: [0.36, 1.0, -0.06], spinePitch: -28, jaw: 0.8 } },
      { t: 0.22, e: 'snap', p: { Bik: [0.12, -0.62, 0.74], Bpole: [1, -0.3, -0.4], BhandFlex: 15, spinePitch: 44, headPitch: 16, rootY: -0.24, rootPitch: 6, jaw: 1 } },
      { t: 0.4, e: 'out', p: { Bik: [0.12, -0.6, 0.72], jaw: 0.6 } },
    ],
    events: [{ t: 0.215, e: 'hit' }],
  },
  // RMB held: forearms crossed in front of the face, hunkered down behind the gauntlets
  brace: {
    mask: UPPER_Y, fadeIn: 0.08, fadeOut: 0.18, loop: true, duration: 1,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [-0.1, 0.18, 0.46], Bpole: [1, -0.7, -0.1], Bfist: 1, BforeTwist: -40, spinePitch: 14, headPitch: 12, rootY: -0.12, browAnger: 1 } },
      { t: 0.5, p: { Bik: [-0.1, 0.2, 0.47], spinePitch: 15 } },
      { t: 1, p: { Bik: [-0.1, 0.18, 0.46], spinePitch: 14 } },
    ],
  },
  // a big hit on the guard rocks him back
  braceHit: {
    mask: makeMask(['spine', 'head']), fadeIn: 0.02, fadeOut: 0.18,
    keys: [{ t: 0, p: { spinePitch: 4, headPitch: 2 } }, { t: 0.16, e: 'out', p: { spinePitch: 14, headPitch: 12 } }],
  },
  // coil, spring: claws out in front for the whole leap
  pounce: {
    mask: UPPER_Y, fadeIn: 0.04, fadeOut: 0.2, loop: true, duration: 2,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.3, 0.2, 0.75], Bpole: [1, 0.1, -0.6], Bfist: 0, Bspread: 1, BhandFlex: -30, spinePitch: 18, headPitch: -18, jaw: 0.9, browAnger: 1 } },
      { t: 1, p: { Bik: [0.32, 0.26, 0.78] } },
      { t: 2, p: { Bik: [0.3, 0.2, 0.75] } },
    ],
  },
  // lands on all claws: a crouch with both hands driven into the ground
  pounceLand: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.35,
    keys: [
      { t: 0, p: { rootY: -0.62, spinePitch: 48, headPitch: -26, BlegIkW: 1, LlegIk: [0.24, 0.12, 0.2], RlegIk: [-0.24, 0.12, -0.25], BfootGround: 1, BikW: 1, Bik: [0.28, -1.25, 0.55], Bpole: [1, 0, -0.3], Bfist: 0, Bspread: 1, browAnger: 1, jaw: 0.8 } },
      { t: 0.3, e: 'out', p: { rootY: -0.5, spinePitch: 36 } },
      { t: 0.5, e: 'inout', p: { rootY: -0.3, spinePitch: 20, jaw: 0.3 } },
    ],
  },
  // chest out, arms flexed wide, head thrown back, jaws open
  roar: {
    mask: UPPER_Y, fadeIn: 0.08, fadeOut: 0.4,
    keys: [
      { t: 0, p: { Barm: [0.5, -0.6, 0.35], Belbow: 90, Bfist: 1, spinePitch: 22, headPitch: 18, rootY: -0.1, browAnger: 1, jaw: 0.2 } },
      { t: 0.24, e: 'snap', p: { Barm: [0.78, -0.42, 0.05], Belbow: 105, Bfist: 0.3, Bspread: 1, BclavLift: 16, spinePitch: -18, headPitch: -30, rootY: 0, jaw: 1 } },
      { t: 1, e: 'inout', p: { Barm: [0.74, -0.46, 0.08], spinePitch: -12, headPitch: -20, jaw: 0.8 } },
    ],
    events: [{ t: 0.23, e: 'roar' }],
  },
  grab: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.15,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.3, 0.05, 0.5], Bpole: [1, -0.6, -0.4], Bfist: 0, Bspread: 1, spinePitch: 8, browAnger: 1 } },
      { t: 0.12, e: 'snap', p: { Bik: [0.06, 0.1, 0.95], Bfist: 0.6, spinePitch: 18 } },
      { t: 0.2, p: { Bfist: 1 } },
    ],
  },
  // the victim held high overhead
  hoist: {
    mask: UPPER_Y, fadeIn: 0.1, fadeOut: 0.1, loop: true, duration: 1,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.08, 0.98, 0.25], Bpole: [1, 0.2, -0.5], Bfist: 1, spinePitch: -16, headPitch: -18, rootY: -0.04, jaw: 0.7, browAnger: 1 } },
      { t: 0.5, p: { Bik: [0.08, 1.0, 0.2] } },
      { t: 1, p: { Bik: [0.08, 0.98, 0.25] } },
    ],
  },
  hurl: {
    mask: UPPER_ROOT, fadeIn: 0.04, fadeOut: 0.3,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.08, 0.98, -0.05], Bpole: [1, 0.2, -0.6], Bfist: 1, spinePitch: -24, headPitch: -16, jaw: 0.8 } },
      { t: 0.13, e: 'snap', p: { Bik: [0.05, 0.25, 1.0], Bpole: [1, -0.4, -0.3], Bfist: 0, Bspread: 1, spinePitch: 32, headPitch: 6, rootZ: 0.15, jaw: 1 } },
      { t: 0.4, e: 'out', p: { Bik: [0.06, 0.15, 0.92], spinePitch: 22 } },
    ],
  },
  // the ult: hunched low, then rearing up with the roar
  berserk: {
    mask: UPPER_Y, fadeIn: 0.06, fadeOut: 0.45,
    keys: [
      { t: 0, p: { Barm: [0.45, -0.75, 0.3], Belbow: 80, Bfist: 1, spinePitch: 36, headPitch: 20, rootY: -0.3, browAnger: 1 } },
      { t: 0.3, e: 'snap', p: { Barm: [0.85, 0.15, 0.05], Belbow: 55, Bfist: 0, Bspread: 1, BclavLift: 20, spinePitch: -22, headPitch: -34, rootY: 0.02, jaw: 1 } },
      { t: 1.1, e: 'inout', p: { Barm: [0.8, 0.05, 0.1], spinePitch: -14, headPitch: -22, jaw: 0.7 } },
    ],
    events: [{ t: 0.29, e: 'roar' }],
  },
  getup: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.5, spinePitch: 42, headPitch: -20, Barm: [0.4, -0.85, 0.35], Belbow: 45, Bfist: 0.3, Bspread: 0.8 } },
      { t: 0.32, e: 'inout', p: { rootY: -0.12, spinePitch: 14, headPitch: 0 } },
    ],
  },
});

export class BeastKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = BEAST_CLIPS;
    this.combo = 0; this.comboT = 0; this.nextAt = 0; this.queued = false;
    this.bracing = false; this.braceT = 0; this.blocked = 0; this.counterT = 0; this.braceAnim = null;
    this.thrown = [];
    this.ultState = null;
    this.landing = null;
    this.rage = 0; this.scale = 1;
  }
  /** bracing slows him to a walk */
  get speedMul() { return this.bracing ? 0.55 : 1; }

  /** every frame, even while stunned, carried or dead: the berserk passive, thrown enemies, the ult */
  tick(dt) {
    const h = this.h, st = h.status;
    // Thirst for Battle: badly hurt, he fights harder and shrugs hits off
    const raging = !h.dead && h.hp / h.maxHp < RULES.beastRage;
    if (raging) {
      st.boost = Math.max(st.boost, 0.25); st.boostT = Math.max(st.boostT, 0.1);
      st.dr = Math.max(st.dr, 0.25); st.drT = Math.max(st.drT, 0.1);
    }
    this.rage = damp(this.rage, raging ? 1 : 0, 4, dt);
    if (this.ultState) {
      this.ultState.t += dt;
      // Pounce every 2 s at most while berserk
      if (h.cd.a1 > 2) h.cd.a1 = 2;
      if (this.ultState.t > 8 || h.dead) this.endUlt();
    }
    const want = this.ultState ? 1.2 : 1;
    this.scale = damp(this.scale, want, 5, dt);
    if (Math.abs(this.scale - want) < 1e-3) this.scale = want;
    h.visual.scale.setScalar(this.scale);
    if (!h.dead && (this.rage > 0.05 || this.ultState)) {
      h.glowTarget = Math.max(this.rage * 0.16, this.ultState ? 0.28 : 0);
      h.U.uGlowColor.value.setRGB(1, 0.12, 0.06);
      // hot breath and red embers coming off him
      if (Math.random() < dt * (this.ultState ? 30 : 12 * this.rage)) {
        const p = _v.copy(h.capA).lerp(h.capB, Math.random()).add(_w.set(rand(-0.4, 0.4), rand(-0.2, 0.3), rand(-0.4, 0.4)));
        this.fx.add.spawn({ p, v: [rand(-0.5, 0.5), rand(1, 2.5), rand(-0.5, 0.5)], life: rand(0.3, 0.6), size: rand(0.05, 0.1), size1: 0.01, color: RAGE, color1: [2, 0.1, 0, 0], shape: SHAPE.SPARK });
      }
      if (this.ultState && Math.random() < dt * 6) {
        h.bonePos('head', _u).addScaledVector(h.aimDir, 0.25);
        this.fx.alpha.spawn({ p: _u, v: [h.aimDir.x * 1.2, rand(0.2, 0.6), h.aimDir.z * 1.2], life: 0.7, size: 0.12, size1: 0.5, color: [0.85, 0.82, 0.8, 0.35], color1: [0.9, 0.9, 0.9, 0], shape: SHAPE.SMOKE, drag: 1.5 });
      }
    } else if (!h.dead && h.glowTarget > 0) h.glowTarget = 0;
    // a pounce that ended just above the floor slams when he touches down
    if (this.landing) {
      const l = this.landing;
      l.t += dt;
      if (h.dead || h.override || h.carriedBy || l.t > 0.6) this.landing = null;
      else if (h.grounded) { this.landing = null; this.pounceLand(l.foe); }
    }
    // enemies he threw: the crash hurts
    for (const t of this.thrown) this.thrownTick(t, dt);
    this.thrown = this.thrown.filter((t) => !t.done);
  }

  update(dt, it) {
    super.update(dt);
    const h = this.h, w = this.w;
    this.comboT += dt;
    if (this.comboT > 0.9) this.combo = 0;
    if (h.override) return;
    if (this.bracing) {
      this.braceT += dt;
      const attack = it.primary || it.primaryPressed || it.a1 || it.a2 || it.a3 || it.ult;
      if (!it.secondary || this.braceT > 4 || attack) this.endBrace();
      else return;
    }
    if (it.ult && this.ultOk()) return this.worthyFoe();
    if (it.a1 && this.ready('a1') && this.free) return this.pounce(it);
    if (it.a2 && this.ready('a2') && this.free) return this.roar();
    if (it.a3 && this.ready('a3') && this.free) return this.hurl(it);
    if (it.secondary && this.ready('secondary') && this.free && !it.primary) return this.brace();
    if (it.primary || it.primaryPressed) this.queued = true;
    if (this.queued && w.time >= this.nextAt && this.free) { this.queued = false; this.strike(it); }
  }

  /** damage he takes: the brace soaks hits from the front, the berserk ult everything */
  mitigate(amt, src, o) {
    const h = this.h, w = this.w;
    let a = amt;
    if (this.ultState) a *= 0.6;
    if (this.bracing && src && src !== h) {
      const from = o.from || src.center || src.pos;
      _v.subVectors(from, h.center || h.pos).setY(0);
      _w.set(h.aimDir.x, 0, h.aimDir.z);
      if (_v.lengthSq() > 1e-4 && _w.lengthSq() > 1e-4 && _v.normalize().dot(_w.normalize()) > 0.2) {
        const b = a * 0.65;
        a -= b; this.blocked += b;
        const p = h.chestPos(_u).addScaledVector(_v, 0.6);
        this.fx.sparks(p, _v, { n: 4 + Math.min(10, Math.round(b / 8)), color: [3.4, 2.6, 1.8, 1], speed: 8, life: 0.25, size: 0.05 });
        w.sfx('guard_block', p, { vol: clamp(b / 50, 0.3, 0.9), minGap: 0.06 });
        if (b > 30) h.anim.play(this.clips.braceHit);
        if (this.blocked >= 80 && !this.counterReady) { this.counterReady = true; this.fx.glow(p, { color: RAGE, size: 1.4, life: 0.15 }); w.sfx('counter_ready', h.center, { vol: 0.6, ui: h.isPlayer }); }
      }
    }
    return a;
  }

  // ---------------- LMB: rending claws ----------------
  strike(it) {
    const h = this.h, w = this.w;
    const i = this.combo;
    this.combo = (this.combo + 1) % 3;
    this.comboT = 0;
    const fast = this.ultState ? 0.7 : 1;
    const clip = [this.clips.clawR, this.clips.clawL, this.clips.doubleClaw][i];
    const counter = this.counterT > w.time;
    if (counter) this.counterT = 0;
    const dmg = [55, 55, 95][i] * (counter ? 1.5 : 1);
    this.nextAt = w.time + [0.34, 0.32, 0.58][i] * fast;
    const tgt = this.aimTarget(7, 0.6);
    if (tgt && tgt.pos.distanceTo(h.pos) > 2.5) h.override = new Lunge(h, tgt, { speed: 24, maxT: 0.22, stopDist: 1.7 });
    if (tgt) h.aimDir.copy(_v.subVectors(tgt.center, h.center).normalize());
    w.sfx('claw_swipe', h.pos, { vol: 0.75, rate: counter ? 0.85 : 1 });
    this.clawTrail(i === 2 ? 'B' : i === 0 ? 'R' : 'L', 0.22 * fast, counter);
    h.anim.play(clip, {
      speed: 1 / fast,
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const fin = i === 2;
        const hits = this.melee({
          reach: 1.9, radius: 2.2, dmg, knock: fin ? 5 : 4, up: fin ? 8 : 1, power: fin ? 1.4 : 1, cleave: true,
          hitSfx: 'claw_hit', fxPower: fin || counter ? 1.6 : 1.2,
          onHit: (e2, p, dir) => this.slashFx(p, dir, fin || counter),
        });
        if (counter && hits.length) { w.renderer.addWave(hits[0].center, { strength: 0.05, life: 0.4 }); if (w.settings.comic) this.fx.comic(hits[0].center.clone().add(_w.set(0, 1.2, 0)), 'RRAAH!', { size: 2.2, fill: '#c4122f' }); }
        if (hits.length) { w.hitstop(fin ? 0.1 : 0.06, h); w.shakeAt(h.pos, fin ? 0.4 : 0.22); }
      },
    });
  }
  /** three streaks off the fingertips while a swipe lasts */
  clawTrail(side, life, hot) {
    const h = this.h, fx = this.fx;
    for (const s of side === 'B' ? ['L', 'R'] : [side]) {
      const sd = h.rig.side[s];
      for (const f of ['index', 'middle', 'ring']) {
        const ch = sd.fingers[f];
        if (!ch || !ch.length) continue;
        const bone = ch[ch.length - 1].bone;
        const tr = fx.trail({ color: hot ? 0xff6050 : 0xfff2ec, intensity: hot ? 2.4 : 1.7, width: 0.05, life: 0.12, max: 16, minDist: 0.04 });
        let t = 0;
        fx.every((dt) => {
          t += dt;
          bone.getWorldPosition(_u); tr.push(_u);
          if (t > life || h.dead) { tr.stop(); return false; }
          return true;
        });
      }
    }
  }
  /** claw marks where a swipe lands: three short parallel slashes */
  slashFx(p, dir, big) {
    const fx = this.fx;
    const side = _w.crossVectors(dir, UP);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const down = _u.crossVectors(side, dir).normalize();
    for (let k = -1; k <= 1; k++) {
      const tr = fx.trail({ color: big ? 0xff5040 : 0xffe8e0, intensity: big ? 2.6 : 2, width: 0.06, life: 0.16, max: 6, minDist: 0.01 });
      const o = p.clone().addScaledVector(side, k * 0.14).addScaledVector(dir, -0.15);
      for (let i = 0; i <= 4; i++) tr.push(o.clone().addScaledVector(down, (i / 4 - 0.5) * 0.9).addScaledVector(side, (i / 4 - 0.5) * 0.3));
      tr.stop();
    }
  }

  // ---------------- RMB: brace ----------------
  brace() {
    const h = this.h;
    this.bracing = true; this.braceT = 0; this.blocked = 0; this.counterReady = false;
    this.braceAnim = h.anim.play(this.clips.brace, { hold: true });
    this.w.sfx('guard_up', h.center, { vol: 0.6 });
  }
  endBrace() {
    const h = this.h;
    if (!this.bracing) return;
    this.bracing = false;
    this.use('secondary');
    if (this.braceAnim) { h.anim.stop(0.15); this.braceAnim = null; }
    // a big block arms a counter for the next claw
    if (this.counterReady) { this.counterT = this.w.time + 1.2; this.counterReady = false; }
  }

  // ---------------- SHIFT: pounce ----------------
  pounce(it) {
    const h = this.h, w = this.w, kit = this;
    const foe = it.aimHero && it.aimHero.team !== h.team && it.aimHero.targetable ? it.aimHero : this.aimTarget(32, 0.15);
    let target;
    if (foe) {
      // leads a moving target by the time the leap takes
      const tEst = h.pos.distanceTo(foe.pos) / 38;
      target = foe.pos.clone().addScaledVector(foe.vel, Math.min(tEst, 0.8));
      // a jump is over by the time he lands: go for the floor under them (fliers he swats on the way)
      if (foe.grounded || foe.mode !== 'fly' && foe.pos.y - foe.groundY < 3) target.y = foe.groundY;
    } else target = it.aimPoint.clone();
    _v.subVectors(target, h.pos);
    if (_v.length() > 30) target = h.pos.clone().addScaledVector(_v.normalize(), 30);
    if (!foe || foe.grounded) target.y = Math.max(target.y, w.groundAt(target.x, target.z));
    if (target.distanceTo(h.pos) < 3) { w.sfx('denied', null, { ui: true }); return; }
    // never into the ceiling
    target.y = Math.min(target.y, 120);
    this.use('a1');
    const flat = Math.hypot(target.x - h.pos.x, target.z - h.pos.z), rise = target.y - h.pos.y;
    const arc = clamp(2 + flat * 0.16 - Math.min(0, rise) * 0.3, 2, 8);
    const dir = _v.subVectors(target, h.pos).normalize().clone();
    w.sfx('pounce_leap', h.pos, { vol: 0.9 });
    this.fx.dustRing(h.pos, { n: 18, speed: 9, size: 0.9, size1: 2.6 });
    this.fx.rocks(h.pos, { n: 6, speed: 6, size: 0.15 });
    h.anim.play(this.clips.pounce, { hold: true });
    const tr = this.fx.trail({ color: 0xfff0e0, intensity: 0.9, width: 0.45, life: 0.3, max: 30, minDist: 0.3 });
    let swatted = null;
    const travel = new Travel(h, {
      dir, speed: 38, dist: 999, toPoint: target, arc, animMode: 'air', boost: 0, flutter: 22,
      onStep: (a, b) => {
        tr.push(h.center);
        // an enemy in the air on the way gets caught and swatted down
        for (const e of w.heroes) {
          if (e.team === h.team || !e.targetable || e.grounded || e.carriedBy) continue;
          if (segDist(a, b, e.center) < 1.4 + e.radius) { swatted = e; return false; }
        }
        return true;
      },
    });
    travel.onEnd = (died) => {
      tr.stop();
      h.anim.stop(0.15);
      if (died) return;
      if (swatted) kit.swat(swatted, dir);
      else kit.pounceLand(foe);
    };
    h.override = travel;
  }
  /** caught a flier in mid-leap: claws in, and down they go */
  swat(e, dir) {
    const h = this.h, w = this.w;
    w.damage(h, e, 90, { power: 1.4, type: 'ability', knock: _w.copy(dir).setY(0).normalize().multiplyScalar(6).setY(-26).clone(), forceKnock: true });
    this.fx.punchImpact(e.center, dir, { power: 1.8 });
    this.slashFx(e.center.clone(), dir, true);
    w.sfx('claw_hit', e.center, { vol: 1 }); w.sfx('punch_heavy', e.center, { vol: 0.8 });
    w.hitstop(0.09, h); w.shakeAt(e.center, 0.5);
    if (w.settings.comic) this.fx.comic(e.center.clone().add(_w.set(0, 1.2, 0)), 'GOT YOU!', { size: 2.2, fill: '#c4122f' });
    h.vel.set(0, -4, 0); h.mode = 'air';
  }
  pounceLand(foe) {
    const h = this.h, w = this.w;
    const p = h.pos.clone();
    // (the surface under him, cover tops included: the leap keeps it current)
    const gy = h.groundY;
    if (p.y > gy + 1.2) { h.mode = 'air'; h.vel.set(0, -2, 0); return; } // came up short against a wall: just drop
    // the leap ended a little above the floor: drop the rest of the way and slam on touchdown
    if (p.y > gy + 0.02) { h.mode = 'air'; h.grounded = false; h.vel.set(0, -14, 0); this.landing = { foe, t: 0 }; return; }
    h.mode = 'ground'; h.vel.set(0, 0, 0);
    h.anim.play(this.clips.pounceLand);
    h.status.rootT = 0.32; this.busyT = 0.32;
    this.fx.groundSlam(p, { power: 1.1 });
    w.sfx('pounce_land', p, { vol: 1, important: true });
    w.shakeAt(p, 0.6);
    let hit = 0;
    for (const e of w.inSphere(p, 5, this.enemyFilter())) {
      _w.subVectors(e.pos, p); _w.y = 0;
      const d = _w.length(); _w.normalize();
      // the one he landed on is pinned under him
      const pinned = d < 1.6 + e.radius || e === foe && d < 2.6;
      w.damage(h, e, lerp(90, 55, clamp01(d / 5)), { dir: _w.clone(), knock: pinned ? null : _w.clone().multiplyScalar(4).setY(7), stun: pinned ? 0.8 : 0, slow: 0.3, slowT: 1.5, power: 1.3, type: 'ability' });
      if (pinned) this.slashFx(e.center.clone(), _w.set(0, -1, 0).clone(), true);
      hit++;
    }
    if (hit) w.hitstop(0.08, h);
  }

  // ---------------- E: primal roar ----------------
  roar() {
    const h = this.h;
    this.use('a2');
    this.busyT = 0.55;
    h.anim.play(this.clips.roar, { onEvent: (e) => { if (e === 'roar' && !h.dead) this.roarBlast(15, 0.3, 3, true); } });
  }
  /** the roar itself: enemies near him lose damage and speed; he gains overhealth (when `shield`) */
  roarBlast(R, weak, dur, shield) {
    const h = this.h, w = this.w, fx = this.fx;
    const c = h.center.clone();
    h.bonePos('head', _u);
    const mouth = _u.clone().addScaledVector(h.aimDir, 0.3);
    for (const e of w.inSphere(c, R, this.enemyFilter())) {
      w.damage(h, e, 20, { power: 0.9, slow: 0.3, slowT: dur, type: 'ability' });
      e.status.weak = Math.max(e.status.weak, weak); e.status.weakT = Math.max(e.status.weakT, dur);
      fx.glow(e.center, { color: RAGE, size: 1.4, life: 0.12 });
    }
    if (shield) { h.overhealth = Math.max(h.overhealth, 150); h.ohT = 5; }
    // the sound you can see: rings rolling out from the jaws and a wave across the ground
    for (let k = 0; k < 4; k++) {
      setTimeout(() => { if (!h.dead) fx.ring(mouth.clone().addScaledVector(h.aimDir, 0.4 + k * 0.7), { color: 0xffe8d8, intensity: 0.9 - k * 0.15, r0: 0.4 + k * 0.5, r1: 4 + k * 3, life: 0.45, normal: h.aimDir, soft: 0.45 }); }, k * 70);
    }
    fx.ring(_w.set(c.x, w.groundAt(c.x, c.z) + 0.05, c.z), { color: 0xff6040, intensity: 1.2, r0: 0.5, r1: R, life: 0.6, soft: 0.3 });
    fx.dustRing(h.pos, { n: 30, radius: 1, speed: 15, size: 1.2, size1: 3.4, life: 1.1 });
    w.renderer.addWave(mouth.clone().addScaledVector(h.aimDir, 0.6), { strength: 0.07, life: 0.75, speed: 1.6, width: 0.1 });
    w.renderer.fx.ca = Math.max(w.renderer.fx.ca, 0.012);
    w.sfx('lion_roar', mouth, { vol: 1.1, important: true });
    w.shakeAt(c, 0.7);
  }

  // ---------------- F: hurl ----------------
  hurl(it) {
    const h = this.h, w = this.w, kit = this;
    const tgt = this.aimTarget(4.4, 0.75);
    h.anim.play(this.clips.grab);
    if (!tgt) { this.use('a3', 1.5); w.sfx('swing_heavy', h.pos, { vol: 0.6 }); return; }
    this.use('a3');
    const seq = {
      phase: 'grab', t: 0, faceAim: true, animMode: 'ground', animVel: new THREE.Vector3(), boost: 0,
      update(dt) {
        this.t += dt;
        if (tgt.dead || h.dead || !w.heroes.includes(tgt)) { release(); return false; }
        if (this.phase === 'grab') {
          if (this.t > 0.12) {
            this.phase = 'lift'; this.t = 0;
            tgt.carriedBy = h; h.carrying = tgt;
            w.damage(h, tgt, 60, { power: 1.1, type: 'ability' });
            kit.fx.punchImpact(tgt.center, _v.subVectors(tgt.center, h.center).normalize(), { power: 1 });
            w.sfx('hurl_grab', tgt.center, { vol: 0.9 });
            h.anim.play(kit.clips.hoist, { hold: true });
          }
          return true;
        }
        if (this.phase === 'lift') {
          const k = Math.min(1, this.t / 0.32);
          hold(lerp(1.1, 0.25, k), lerp(0.6, 2.3, k));
          if (this.t > 0.4) { this.phase = 'throw'; this.t = 0; h.anim.play(kit.clips.hurl); w.sfx('hurl_throw', h.pos, { vol: 1 }); }
          return true;
        }
        // throw: forward and out of his hands
        hold(lerp(0.25, 1.4, Math.min(1, this.t / 0.12)), lerp(2.3, 1.7, Math.min(1, this.t / 0.12)));
        if (this.t > 0.12) {
          release();
          const dir = h.aimDir.clone();
          tgt.vel.copy(dir).setY(0).normalize().multiplyScalar(34);
          tgt.vel.y = 9 + clamp(dir.y, -0.2, 0.6) * 12;
          tgt.mode = 'tumble'; tgt.tumbleT = 1.2; tgt.grounded = false; tgt.tumbleFly = false;
          tgt.anim.tumbleVel.set(rand(-6, 6), rand(-2, 2), rand(-6, 6));
          kit.thrown.push({ e: tgt, t: 0, done: false, speed: 34 });
          return false;
        }
        return true;
      },
      // (a throw ends on the hurl clip's follow-through; cut short, the overhead hold has to go)
      onEnd() { release(); if (this.phase !== 'throw') h.anim.stop(0.2); },
    };
    function hold(fwd, up) {
      _v.set(h.aimDir.x, 0, h.aimDir.z).normalize();
      tgt.pos.copy(h.pos).addScaledVector(_v, fwd); tgt.pos.y += up;
      tgt.vel.set(0, 0, 0);
      tgt.yaw = h.yaw + Math.PI;
    }
    function release() {
      if (tgt.carriedBy === h) { tgt.carriedBy = null; tgt.mode = 'air'; tgt.tumbleT = 0.3; }
      if (h.carrying === tgt) h.carrying = null;
    }
    h.override = seq;
  }
  thrownTick(t, dt) {
    const w = this.w, e = t.e;
    t.t += dt;
    // (if he died after the throw, the crash is just a landing)
    if (e.dead || !w.heroes.includes(e) || e.carriedBy || this.h.dead) { t.done = true; return; }
    const sp = Math.hypot(e.vel.x, e.vel.z);
    // crashes into the floor, or into a wall (the push-out kills the speed)
    const crashed = t.t > 0.1 && (e.grounded || sp < t.speed * 0.4);
    t.speed = Math.max(sp, 1);
    if (!crashed && t.t < 2.5) return;
    t.done = true;
    const p = e.pos.clone();
    w.damage(this.h, e, 70, { stun: 0.6, power: 1.4, type: 'ability' });
    this.fx.groundSlam(p, { power: 0.7, crater: e.grounded });
    w.sfx('ground_slam', p, { vol: 0.9 });
    w.shakeAt(p, 0.45);
    if (w.settings.comic) this.fx.comic(p.clone().add(_w.set(0, 2, 0)), 'CRASH!', { size: 2.3 });
  }

  // ---------------- Q: WORTHY FOE ----------------
  worthyFoe() {
    const h = this.h, w = this.w;
    h.ult = 0;
    w.emit('ult', { hero: h, name: 'WORTHY FOE' });
    this.ultState = { t: 0 };
    h.unstoppable = true;
    h.cd.a1 = 0;
    h.status.haste = Math.max(h.status.haste, 0.3); h.status.hasteT = Math.max(h.status.hasteT, 8);
    this.busyT = 0.5;
    h.anim.play(this.clips.berserk, {
      onEvent: (e) => {
        if (e !== 'roar' || h.dead) return;
        this.roarBlast(12, 0.2, 2, false);
        this.fx.sphere(h.center, { color: 0xff2a10, intensity: 1.1, r1: 5, life: 0.45 });
        w.renderer.flash(0xff6040, 0.25);
        if (w.settings.comic) this.fx.comic(h.center.clone().add(_w.set(0, 2.4, 0)), 'FACE ME!', { size: 3.4, life: 1, fill: '#c4122f' });
      },
    });
    w.sfx('berserk', h.center, { vol: 1, important: true });
  }
  endUlt() {
    const h = this.h;
    if (!this.ultState) return;
    this.ultState = null;
    h.unstoppable = false;
  }

  onDeath() {
    if (this.bracing) { this.bracing = false; this.braceAnim = null; }
    this.landing = null;
    this.endUlt();
  }
  dispose() {
    this.endUlt();
    this.h.visual.scale.setScalar(1);
  }
}

/** distance from p to segment a-b */
function segDist(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-9 ? clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2) : 0;
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
