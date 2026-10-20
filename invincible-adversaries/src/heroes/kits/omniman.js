import * as THREE from 'three';
import { Kit, Lunge, Travel } from '../kit.js';
import { clips } from '../../anim/clip.js';
import { makeMask, MASK_UPPER } from '../../anim/pose.js';
import { SHAPE } from '../../vfx/particles.js';
import { clamp, clamp01, rand, lerp, damp, yawOf, TAU } from '../../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const UPPER_ROOT = makeMask(['upper', { g: 'rootYaw', w: 0.8 }, { g: 'rootZ', w: 0.7 }, { g: 'rootY', w: 0.7 }, { g: 'rootPitch', w: 0.6 }]);
const FULL = makeMask(['all']);

export const OMNI_CLIPS = clips({
  hookR: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.2,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.75, -0.08, -0.12], Rpole: [0.5, 0.1, -1], Rfist: 1, LikW: 1, Lik: [0.15, -0.3, 0.35], Lpole: [1, -1, -0.2], Lfist: 1, spineYaw: -36, rootYaw: -14, spinePitch: 2, browAnger: 1 } },
      { t: 0.13, e: 'snap', p: { Rik: [-0.25, 0.04, 0.82], Rpole: [0.9, 0.6, 0], spineYaw: 30, rootYaw: 14, spinePitch: 12, rootZ: 0.12, jaw: 0.4 } },
      { t: 0.25, e: 'out', p: { Rik: [-0.3, 0.02, 0.78] } },
    ],
    events: [{ t: 0.12, e: 'hit' }],
  },
  straightL: {
    mask: UPPER_ROOT, fadeIn: 0.05, fadeOut: 0.2,
    keys: [
      { t: 0, p: { LikW: 1, Lik: [0.3, -0.12, 0.0], Lpole: [1, -0.6, -0.8], Lfist: 1, RikW: 1, Rik: [0.15, -0.35, 0.3], Rpole: [1, -1, -0.2], Rfist: 1, spineYaw: 26, rootYaw: 10, browAnger: 1 } },
      { t: 0.11, e: 'snap', p: { Lik: [-0.12, 0.06, 1.0], spineYaw: -30, LclavFwd: 22, spinePitch: 14, rootYaw: -12, rootZ: 0.14 } },
      { t: 0.22, e: 'out', p: { Lik: [-0.1, 0.05, 0.96] } },
    ],
    events: [{ t: 0.1, e: 'hit' }],
  },
  hammer: {
    mask: UPPER_ROOT, fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [-0.06, 0.98, 0.12], Bpole: [1, 0.2, -0.6], Bfist: 1, spinePitch: -22, headPitch: -12, rootY: 0.04, browAnger: 1 } },
      { t: 0.12, e: 'in', p: { Bik: [-0.06, 1.0, -0.05], spinePitch: -28 } },
      { t: 0.2, e: 'snap', p: { Bik: [-0.07, -0.72, 0.72], Bpole: [1, -0.2, -0.4], spinePitch: 46, headPitch: 18, rootY: -0.22, rootPitch: 6, jaw: 0.7 } },
      { t: 0.36, e: 'out', p: { Bik: [-0.07, -0.7, 0.7] } },
    ],
    events: [{ t: 0.195, e: 'hit' }],
  },
  rip: {
    mask: makeMask(['upper', { g: 'rootY', w: 1 }, { g: 'rootPitch', w: 1 }, { g: 'rootYaw', w: 1 }]), fadeIn: 0.06, fadeOut: 0.28,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.2, -0.3, 0.4], Rpole: [1, -0.4, -0.3], Rfist: 0, Rspread: 0.8, LikW: 1, Lik: [0.35, -0.4, 0.2], Lpole: [1, -1, 0], Lfist: 1, spinePitch: 10 } },
      { t: 0.16, e: 'out', p: { Rik: [0.15, -1.55, 0.55], rootY: -0.42, spinePitch: 42, rootYaw: -10, headPitch: -20 } },
      { t: 0.22, p: { Rfist: 0.7 } },
      { t: 0.36, e: 'inout', p: { Rik: [0.25, 0.95, -0.25], Rpole: [1, 0.2, -0.6], rootY: 0.0, spinePitch: -14, spineYaw: -25, rootYaw: -16, headPitch: -6 } },
      { t: 0.46, e: 'snap', p: { Rik: [-0.05, 0.35, 0.95], Rpole: [1, -0.3, -0.3], spinePitch: 18, spineYaw: 28, rootYaw: 12, rootZ: 0.12, Rspread: 1, Rfist: 0 } },
      { t: 0.62, e: 'out', p: { Rik: [-0.05, 0.25, 0.9] } },
    ],
    events: [{ t: 0.18, e: 'grab' }, { t: 0.45, e: 'throw' }],
  },
  clap: {
    mask: UPPER_ROOT, fadeIn: 0.08, fadeOut: 0.32,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [1.0, 0.38, -0.1], Bpole: [0.2, -0.9, -0.6], Bfist: 0, Bspread: 1, BhandFlex: -10, BforeTwist: -70, spinePitch: -16, headPitch: -12, rootY: 0.02, browAnger: 1 } },
      { t: 0.22, e: 'in', p: { Bik: [0.98, 0.42, 0.05], spinePitch: -20, jaw: 0.5 } },
      { t: 0.29, e: 'snap', p: { Bik: [-0.05, 0.16, 0.86], BhandFlex: 0, Bspread: 0.1, spinePitch: 20, headPitch: 8, rootY: -0.16, jaw: 1 } },
      { t: 0.48, e: 'out', p: { Bik: [-0.04, 0.14, 0.84], jaw: 0.6 } },
    ],
    events: [{ t: 0.285, e: 'hit' }],
  },
  roar: {
    mask: makeMask(['upper', { g: 'rootY', w: 1 }]), fadeIn: 0.08, fadeOut: 0.4,
    keys: [
      { t: 0, p: { Barm: [0.55, -0.55, 0.3], Belbow: 95, Bfist: 1, BarmTwist: -20, spinePitch: 18, headPitch: 15, rootY: -0.08, browAnger: 1 } },
      { t: 0.25, e: 'snap', p: { Barm: [0.75, -0.4, 0.05], Belbow: 110, spinePitch: -16, headPitch: -26, rootY: 0.0, jaw: 1, BclavLift: 12 } },
      { t: 0.9, e: 'inout', p: { Barm: [0.72, -0.45, 0.08], spinePitch: -12, headPitch: -18, jaw: 0.6 } },
    ],
    events: [{ t: 0.24, e: 'roar' }],
  },
  chargePose: {
    mask: MASK_UPPER, fadeIn: 0.05, fadeOut: 0.2, loop: true, duration: 1,
    keys: [{ t: 0, p: { RikW: 1, Rik: [-0.05, 0.1, 1.0], Rpole: [1, -0.4, -0.4], Rfist: 1, Larm: [0.25, -0.9, -0.3], Lelbow: 20, Lfist: 1, browAnger: 1, jaw: 0.3 } }, { t: 1, p: {} }],
  },
  blitz: {
    mask: UPPER_ROOT, fadeIn: 0.02, fadeOut: 0.12,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.3, -0.05, 0.1], Rpole: [1, -0.4, -0.7], Rfist: 1, LikW: 1, Lik: [0.2, -0.3, 0.3], Lpole: [1, -1, -0.2], Lfist: 1, spineYaw: -24, browAnger: 1, jaw: 0.5 } },
      { t: 0.06, e: 'snap', p: { Rik: [-0.12, 0.05, 1.0], spineYaw: 34, spinePitch: 12 } },
      { t: 0.14, p: { Rik: [-0.1, 0.05, 0.96] } },
    ],
  },
  land: {
    mask: FULL, fadeIn: 0.03, fadeOut: 0.35,
    keys: [
      { t: 0, p: { rootY: -0.5, spinePitch: 34, headPitch: -20, BlegIkW: 1, LlegIk: [0.22, 0.12, 0.15], RlegIk: [-0.22, 0.12, -0.2], BfootGround: 1, Barm: [0.5, -0.75, 0.2], Belbow: 50, Bfist: 1, browAnger: 1 } },
      { t: 0.35, e: 'out', p: { rootY: -0.35, spinePitch: 20 } },
    ],
  },
  getup: {
    mask: FULL, fadeIn: 0.02, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.45, spinePitch: 40, headPitch: -20, Barm: [0.35, -0.85, 0.35], Belbow: 45, Bfist: 1 } },
      { t: 0.3, e: 'inout', p: { rootY: -0.1, spinePitch: 10 } },
    ],
  },
});

function boulderMesh() {
  const g = new THREE.IcosahedronGeometry(0.75, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i));
    const n = 0.8 + 0.25 * Math.sin(_v.x * 5.1 + _v.y * 3.3) * Math.cos(_v.z * 4.7) + Math.random() * 0.12;
    _v.multiplyScalar(n); _v.y *= 0.78;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8c857c, roughness: 0.95, flatShading: true }));
  m.castShadow = true;
  // grass/dirt cap
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.62, 7).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 1 }));
  cap.position.y = 0.5; m.add(cap);
  return m;
}

export class OmniKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = OMNI_CLIPS;
    this.combo = 0; this.comboT = 0; this.nextAt = 0; this.queued = false;
  }

  update(dt, it) {
    super.update(dt);
    const h = this.h;
    this.comboT += dt;
    if (this.comboT > 0.85) this.combo = 0;
    // red rage glow decays with buff
    h.glowTarget = h.status.boostT > 0 ? 0.55 : (this.blitzing ? 0.8 : 0);
    if (h.status.boostT > 0 && Math.random() < dt * 40) {
      _v.copy(h.center).add(_w.set(rand(-0.5, 0.5), rand(-0.9, 0.9), rand(-0.5, 0.5)));
      this.fx.add.spawn({ p: _v, v: [0, rand(1, 3), 0], life: 0.45, size: 0.18, size1: 0.02, color: [3.5, 0.5, 0.3, 0.8], color1: [2, 0.1, 0, 0], shape: SHAPE.GLOW });
    }
    if (h.override) return;
    if (it.ult && h.ultReady && this.free) return this.rampage(it);
    if (it.a1 && this.ready('a1') && this.free) return this.charge(it);
    if (it.a2 && this.ready('a2') && this.free) return this.thunderclap(it);
    if (it.a3 && this.ready('a3') && this.free) return this.conqueror(it);
    if (it.secondaryPressed && this.ready('secondary') && this.free && this.w.time >= this.nextAt) return this.boulder(it);
    if (it.primary || it.primaryPressed) this.queued = true;
    if (this.queued && this.w.time >= this.nextAt && this.free) { this.queued = false; this.strike(it); }
  }

  strike(it) {
    const h = this.h, w = this.w;
    const i = this.combo;
    this.combo = (this.combo + 1) % 3;
    this.comboT = 0;
    const clip = [this.clips.hookR, this.clips.straightL, this.clips.hammer][i];
    const dmg = [58, 58, 96][i];
    this.nextAt = w.time + [0.32, 0.3, 0.55][i];
    const tgt = this.aimTarget(6.5, 0.6);
    if (tgt && tgt.pos.distanceTo(h.pos) > 2.3) h.override = new Lunge(h, tgt, { speed: 24, maxT: 0.2, stopDist: 1.4 });
    if (tgt) h.aimDir.copy(_v.subVectors(tgt.center, h.center).normalize());
    w.sfx('swing_heavy', h.pos, { vol: 0.7, rate: 0.85 });
    h.anim.play(clip, {
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const fin = i === 2;
        const hits = this.melee({
          reach: 1.6, radius: 1.9, dmg, knock: fin ? 4 : 5, up: fin ? 7 : 1, power: fin ? 1.4 : 1.0, cleave: true,
          hitSfx: 'punch_heavy', fxPower: fin ? 1.6 : 1.25,
        });
        if (fin) {
          const p = h.pos.clone().addScaledVector(_v.set(h.aimDir.x, 0, h.aimDir.z).normalize(), 1.6);
          p.y = w.groundAt(p.x, p.z);
          if (h.pos.y - p.y < 2.5) {
            this.fx.groundSlam(p, { power: 0.75 });
            w.sfx('ground_slam', p, { vol: 0.7, rate: 1.2 });
            for (const e2 of w.inSphere(p, 3.2, this.enemyFilter())) if (!hits.includes(e2)) w.damage(h, e2, 30, { knock: _w.subVectors(e2.pos, p).setY(0).normalize().multiplyScalar(5).setY(6).clone() });
          }
          w.shakeAt(h.pos, 0.4);
        }
        if (hits.length) { w.hitstop(fin ? 0.1 : 0.06); w.shakeAt(h.pos, 0.22); if (fin && w.settings.comic && Math.random() < 0.4) this.fx.comic(hits[0].center.clone().add(_w.set(0, 1, 0)), 'CRUNCH!', { size: 2 }); }
      },
    });
  }

  boulder(it) {
    const h = this.h, w = this.w, kit = this;
    this.use('secondary');
    this.nextAt = w.time + 0.6;
    this.busyT = 0.55;
    let rock = null;
    h.status.slow = Math.max(h.status.slow, 0); // unstoppable anyway
    h.anim.play(this.clips.rip, {
      onEvent: (e) => {
        if (h.dead) { if (rock) w.scene.remove(rock); return; }
        if (e === 'grab') {
          const p = h.pos.clone().addScaledVector(_v.set(h.aimDir.x, 0, h.aimDir.z).normalize(), 1.0);
          p.y = w.groundAt(p.x, p.z);
          this.fx.decal(p, 2.6, 'crater', 10, 0.9);
          this.fx.rocks(p, { n: 8, speed: 6, size: 0.18 });
          this.fx.smoke(p, { n: 5, size: 0.8, size1: 2.2, speed: 2 });
          w.sfx('rock_rip', p, { vol: 0.9 });
          rock = boulderMesh();
          w.scene.add(rock);
          const follow = () => { if (!rock || !rock.parent) return false; h.bonePos('handR', _u); rock.position.copy(_u).addScaledVector(UP, 0.35); rock.rotation.y += 0.02; return !thrown; };
          let thrown = false;
          this.fx.every(follow);
          rock.userData.setThrown = () => { thrown = true; };
        }
        if (e === 'throw' && rock) {
          rock.userData.setThrown();
          const o = rock.position.clone();
          const dir = _v.subVectors(it.aimPoint, o).normalize().clone();
          if (dir.dot(h.aimDir) < 0.5) dir.copy(h.aimDir);
          dir.y += 0.04; dir.normalize();
          w.sfx('swing_heavy', o, { vol: 0.9, rate: 0.75 });
          const r = rock; rock = null;
          const spin = new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
          w.spawnProjectile({
            owner: h, pos: o, vel: dir.multiplyScalar(42), radius: 0.75, gravity: 9, life: 3,
            onUpdate: (dt, p) => {
              r.position.copy(p); r.rotation.x += spin.x * dt; r.rotation.y += spin.y * dt; r.rotation.z += spin.z * dt;
              if (Math.random() < 0.5) kit.fx.alpha.spawn({ p, v: [rand(-1, 1), rand(-1, 1), rand(-1, 1)], life: 0.5, size: 0.3, size1: 0.9, color: [0.55, 0.52, 0.48, 0.4], color1: [0.6, 0.58, 0.55, 0], shape: SHAPE.SMOKE });
            },
            onHitHero: (e2, p) => { w.damage(h, e2, 105, { hitPos: p.clone(), knock: _w.copy(e2.pos).sub(o).setY(0).normalize().multiplyScalar(9).setY(4).clone(), power: 1.3, type: 'proj' }); return true; },
            onEnd: (proj, hero) => {
              w.scene.remove(r);
              const p = proj.pos.clone();
              for (const e3 of w.inSphere(p, 3.5, kit.enemyFilter())) if (e3 !== hero) w.damage(h, e3, 45, { knock: _w.subVectors(e3.pos, p).setY(0).normalize().multiplyScalar(6).setY(3).clone(), power: 0.7 });
              kit.fx.rocks(p, { n: 18, speed: 11, size: 0.26, up: 1.2 });
              kit.fx.smoke(p, { n: 10, size: 1.2, size1: 3.4, speed: 4.5, color: [0.6, 0.57, 0.53, 0.55] });
              kit.fx.glow(p, { color: [3, 2.6, 2.2, 1], size: 2.5, life: 0.12 });
              kit.fx.ring(_v.copy(p).setY(Math.max(0.05, p.y - 0.4)), { r1: 5, life: 0.4, intensity: 1.2 });
              if (p.y < 1.2) kit.fx.decal(p, 4, 'crater', 12, 0.85);
              w.renderer.addWave(p, { strength: 0.035, life: 0.4 });
              w.sfx('rock_hit', p, { vol: 1 });
              w.shakeAt(p, 0.35);
            },
          });
        }
      },
    });
  }

  charge(it) {
    const h = this.h, w = this.w, kit = this;
    this.use('a1');
    const dir = h.aimDir.clone();
    if (h.mode !== 'fly' && h.grounded) dir.y = clamp(dir.y, 0.0, 0.5);
    dir.normalize();
    const passed = new Set();
    let carried = null;
    w.sfx('dash', h.pos, { vol: 0.9, rate: 0.8 });
    w.sfx('roar', h.pos, { vol: 0.5, rate: 1.2 });
    this.fx.dustRing(h.pos, { n: 18, speed: 10, size: 0.9, size1: 2.6 });
    h.anim.play(this.clips.chargePose, { hold: true });
    if (h.isPlayer) { w.renderer.fx.speedLines = 0.7; w.camRig.kick(10); }
    const tr = this.fx.trail({ color: 0xffd0c0, intensity: 1.2, width: 0.6, life: 0.35, max: 30, minDist: 0.3 });
    const travel = new Travel(h, {
      dir, speed: 50, dist: 24, animMode: 'fly', boost: 1,
      onStep: (a, b) => {
        tr.push(h.center);
        if (carried) {
          carried.pos.copy(h.pos).addScaledVector(dir, 1.3); carried.pos.y = h.pos.y + 0.2; carried.vel.set(0, 0, 0);
          return;
        }
        for (const e of w.heroes) {
          if (e.team === h.team || !e.targetable || passed.has(e)) continue;
          if (segPoint(a, b, e.center) < 1.9) {
            passed.add(e);
            if (!carried) {
              carried = e; e.carriedBy = h; h.carrying = e;
              w.damage(h, e, 85, { power: 1.2, type: 'ability' });
              kit.fx.punchImpact(e.center, dir, { power: 1.5 });
              w.sfx('punch_heavy', e.center, { vol: 1 });
              w.hitstop(0.05);
            }
          }
        }
      },
    });
    travel.onEnd = () => {
      tr.stop();
      h.anim.stop(0.2);
      if (h.isPlayer) w.renderer.fx.speedLines = 0;
      h.vel.copy(dir).multiplyScalar(6);
      if (carried) {
        const e = carried; carried = null;
        e.carriedBy = null; h.carrying = null;
        const p = e.center.clone();
        w.damage(h, e, 35, { stun: 0.6, knock: dir.clone().multiplyScalar(12).setY(5), forceKnock: false, power: 1.5, type: 'ability' });
        kit.fx.punchImpact(p, dir, { power: 2.2 });
        kit.fx.ring(p, { r1: 5, life: 0.35, normal: dir, intensity: 1.2 });
        if (travel.hitWall) { kit.fx.rocks(p, { n: 14, speed: 9, size: 0.25 }); kit.fx.smoke(p, { n: 8, size: 1.2, size1: 3 }); }
        w.renderer.addWave(p, { strength: 0.05, life: 0.5 });
        w.sfx('punch_heavy', p, { vol: 1 }); w.sfx('ground_slam', p, { vol: 0.6, rate: 1.3 });
        w.hitstop(0.1); w.shakeAt(p, 0.5);
        if (w.settings.comic) kit.fx.comic(p.clone().add(_w.set(0, 1.2, 0)), 'BAM!', { size: 2.2 });
      }
      if (!h.grounded) h.mode = h.def.flight && h.flyEnergy > 0.1 ? 'fly' : 'air';
    };
    h.override = travel;
  }

  thunderclap(it) {
    const h = this.h, w = this.w, kit = this;
    this.use('a2');
    this.busyT = 0.45;
    h.anim.play(this.clips.clap, {
      onEvent: (e) => {
        if (e !== 'hit' || h.dead) return;
        const o = h.chestPos(new THREE.Vector3()).addScaledVector(h.aimDir, 0.8);
        const dir = h.aimDir.clone();
        const hits = w.inCone(o, dir, 22, 0.7, this.enemyFilter());
        for (const t of hits) {
          const kd = _w.subVectors(t.center, o).normalize();
          const kv = kd.clone().multiplyScalar(14); kv.y += 4;
          w.damage(h, t, 85, { dir: kd.clone(), knock: kv, slow: 0.3, slowT: 2, power: 1.4, type: 'ability' });
          kit.fx.punchImpact(t.center, kd, { power: 1.1, gore: false });
        }
        // massive forward shockwave
        kit.fx.glow(o, { color: [2.6, 2.6, 2.6, 1], size: 1.9, life: 0.12 });
        kit.fx.star(o, { color: [3, 3, 3, 1], size: 2.2 });
        for (let k = 0; k < 6; k++) {
          const p = o.clone().addScaledVector(dir, 1 + k * 3.6);
          setTimeout(() => {
            kit.fx.ring(p, { color: 0xf2f8ff, intensity: 0.95 - k * 0.08, r0: 0.6 + k * 0.6, r1: 3 + k * 2.4, life: 0.4, normal: dir, soft: 0.3 });
            const gp = _v.set(p.x, w.groundAt(p.x, p.z), p.z);
            if (p.y - gp.y < 4) { kit.fx.dustRing(gp, { n: 10, radius: 1 + k * 0.4, speed: 7, size: 1, size1: 3, life: 0.9 }); if (k % 2 === 0) kit.fx.rocks(gp, { n: 3, speed: 7, size: 0.18 }); }
          }, k * 38);
        }
        w.renderer.addWave(o, { strength: 0.08, life: 0.7, speed: 1.8, width: 0.1 });
        w.renderer.fx.ca = Math.max(w.renderer.fx.ca, 0.01);
        w.sfx('thunderclap', o, { vol: 1.1, important: true });
        w.shakeAt(o, 0.75);
        if (hits.length) w.hitstop(0.07);
      },
    });
  }

  conqueror(it) {
    const h = this.h, w = this.w;
    this.use('a3');
    this.busyT = 0.35;
    h.anim.play(this.clips.roar, {
      onEvent: (e) => {
        if (e !== 'roar' || h.dead) return;
        h.overhealth = 225; h.ohT = 5;
        h.status.boost = 0.2; h.status.boostT = 4;
        h.status.dr = 0.3; h.status.drT = 4;
        h.U.uGlowColor.value.setRGB(1, 0.12, 0.05);
        this.fx.ring(_v.copy(h.pos).setY(0.1), { color: 0xff3020, intensity: 1.5, r1: 9, life: 0.6 });
        this.fx.sphere(h.center, { color: 0xff2a10, intensity: 1.0, r1: 4, life: 0.4 });
        this.fx.dustRing(h.pos, { n: 22, speed: 12, size: 1, size1: 3 });
        w.renderer.addWave(h.center, { strength: 0.05, life: 0.6 });
        w.sfx('roar', h.pos, { vol: 1, important: true });
        w.shakeAt(h.pos, 0.45);
      },
    });
  }

  // ---------------- Q: A Fraction Of Our Power ----------------
  rampage(it) {
    const h = this.h, w = this.w, kit = this;
    // pick up to 5 targets chained by proximity
    const pool = w.heroes.filter((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(h.pos) < 40 && w.lineOfSight(h.center, e.center));
    if (!pool.length) { this.msg('No targets in range'); w.sfx('denied', null, { ui: true }); return; }
    h.ult = 0;
    w.emit('ult', { hero: h, name: 'A FRACTION OF OUR POWER' });
    const order = [];
    let from = h.pos;
    const left = pool.slice();
    while (order.length < 5 && left.length) {
      left.sort((a, b) => a.pos.distanceTo(from) - b.pos.distanceTo(from));
      const n = left.shift(); order.push(n); from = n.pos;
    }
    while (order.length < 3) order.push(order[order.length - 1]);
    w.sfx('roar', h.pos, { vol: 1, important: true, rate: 0.9 });
    h.U.uGlowColor.value.setRGB(1, 0.15, 0.05);
    this.blitzing = true;
    h.untargetable = true;
    const strikes = order.map((t) => ({ t }));
    let idx = 0, phase = 'zip', pt = 0;
    const tr = this.fx.trail({ color: 0xff5a40, intensity: 1.8, width: 0.7, life: 0.3, max: 40, minDist: 0.25 });
    const seq = {
      faceAim: false, animMode: 'fly', boost: 1, animVel: new THREE.Vector3(), flutter: 40,
      update(dt) {
        pt += dt;
        const s = strikes[idx];
        if (!s) return false;
        const t = s.t;
        if (t.dead && phase === 'zip') { idx++; pt = 0; return idx < strikes.length; }
        if (phase === 'zip') {
          // approach to a point next to the target, from an alternating angle
          if (!s.approach) {
            const ang = rand(0, TAU);
            s.approach = new THREE.Vector3(Math.cos(ang) * 1.6, 0.2, Math.sin(ang) * 1.6);
            w.sfx('zip', h.pos, { vol: 0.9 });
          }
          _v.copy(t.pos).add(s.approach);
          _w.subVectors(_v, h.pos);
          const d = _w.length();
          const sp = 95;
          const step = Math.min(d, sp * dt);
          if (d > 1e-3) h.pos.addScaledVector(_w.normalize(), step);
          this.animVel.copy(_w).multiplyScalar(sp);
          h.yaw = yawOf(_u.subVectors(t.pos, h.pos));
          tr.push(h.center);
          if (d < 0.25 || pt > 0.5) {
            phase = 'hit'; pt = 0;
            h.aimDir.copy(_u.subVectors(t.center, h.center).normalize());
            h.anim.play(kit.clips.blitz);
          }
          return true;
        }
        if (phase === 'hit') {
          this.animVel.set(0, 0, 0); this.boost = 0;
          if (!s.done && pt > 0.06) {
            s.done = true;
            h.untargetable = false;
            const dir = _u.subVectors(t.center, h.center).normalize().clone();
            const kv = dir.clone().multiplyScalar(10); kv.y += 5;
            w.damage(h, t, 150, { dir, knock: kv, power: 1.6, type: 'ult' });
            h.untargetable = true;
            kit.fx.punchImpact(t.center, dir, { power: 2.4 });
            kit.fx.ring(t.center, { r1: 4, life: 0.3, normal: dir, intensity: 1.2 });
            w.renderer.addWave(t.center, { strength: 0.05, life: 0.4 });
            w.sfx('punch_heavy', t.center, { vol: 1, important: true });
            w.hitstop(0.09); w.shakeAt(t.center, 0.45);
            if (w.settings.comic && idx === strikes.length - 1) kit.fx.comic(t.center.clone().add(_w.set(0, 1.5, 0)), 'THINK, MARK!', { size: 3.6, life: 1.1, fill: '#ff2d2d' });
          }
          if (pt > 0.16) { phase = 'zip'; pt = 0; idx++; this.boost = 1; }
          return idx < strikes.length;
        }
        return false;
      },
      onEnd() {
        tr.stop();
        h.untargetable = false;
        kit.blitzing = false;
        // finishing thunderclap
        const p = h.pos.clone(); p.y = Math.max(p.y, w.groundAt(p.x, p.z));
        for (const e of w.inSphere(h.center, 7, kit.enemyFilter())) w.damage(h, e, 80, { knock: _w.subVectors(e.pos, p).setY(0).normalize().multiplyScalar(12).setY(6).clone(), power: 1.2, type: 'ult' });
        kit.fx.sphere(h.center, { color: 0xffffff, intensity: 1.0, r1: 8, life: 0.4 });
        kit.fx.ring(h.center, { r1: 12, life: 0.5, intensity: 1.2 });
        w.sfx('thunderclap', h.pos, { vol: 1, important: true });
        w.renderer.addWave(h.center, { strength: 0.07, life: 0.6 });
        w.shakeAt(h.pos, 0.7);
        h.anim.play(kit.clips.clap);
        h.vel.set(0, 0, 0);
        h.mode = h.grounded ? 'ground' : 'fly';
      },
    };
    h.override = seq;
  }
}

function segPoint(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = clamp01(t);
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
