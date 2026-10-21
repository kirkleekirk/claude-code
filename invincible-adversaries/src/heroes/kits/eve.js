import * as THREE from 'three';
import { Kit, Travel } from '../kit.js';
import { clips } from '../../anim/clip.js';
import { makeMask, MASK_UPPER, CH } from '../../anim/pose.js';
import { Bubble, Beam } from '../../vfx/effects.js';
import { SHAPE } from '../../vfx/particles.js';
import { clamp, clamp01, rand, lerp, damp, dampT, Spring, yawOf, TAU } from '../../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const PINK = [3.2, 0.7, 2.6, 1];
const FULL = makeMask(['all']);
const ARMS_SPINE = makeMask(['arms', 'spine', { g: 'head', w: 0.5 }]);

export const EVE_CLIPS = clips({
  fireStance: {
    mask: ARMS_SPINE, fadeIn: 0.08, fadeOut: 0.25, loop: true, duration: 1,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.05, 0.02, 0.9], Rpole: [1, -0.8, -0.3], Rfist: 0, Rspread: 0.9, RhandFlex: -62, RforeTwist: -12,
        LikW: 1, Lik: [0.12, -0.08, 0.78], Lpole: [1, -0.8, -0.3], Lfist: 0, Lspread: 0.9, LhandFlex: -62, LforeTwist: -12, spinePitch: 4 } },
      { t: 1, p: {} },
    ],
  },
  fistCast: {
    mask: makeMask(['upper', { g: 'rootZ', w: 1 }, { g: 'rootY', w: 0.6 }]), fadeIn: 0.05, fadeOut: 0.25,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.25, -0.05, 0.3], Bpole: [1, -0.6, -0.5], Bfist: 0, Bspread: 1, BhandFlex: -40, spinePitch: -8, rootZ: -0.05 } },
      { t: 0.14, e: 'snap', p: { Bik: [-0.04, 0.05, 0.98], BhandFlex: -75, spinePitch: 12, rootZ: 0.12, rootY: -0.04 } },
      { t: 0.32, e: 'out', p: { Bik: [-0.03, 0.04, 0.95] } },
    ],
    events: [{ t: 0.13, e: 'fire' }],
  },
  bubbleCast: {
    mask: ARMS_SPINE, fadeIn: 0.06, fadeOut: 0.28,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.3, 0.1, 0.4], Rpole: [1, -0.5, -0.5], Rfist: 0, Rspread: 1, RhandFlex: -30, LikW: 1, Lik: [0.4, -0.3, 0.4], Lpole: [1, -0.8, 0], Lfist: 0, Lspread: 1, LhandFlex: -20 } },
      { t: 0.13, e: 'out', p: { Rik: [0.0, 0.12, 0.98], RhandFlex: -70, Lik: [0.5, -0.1, 0.55] } },
      { t: 0.36, e: 'inout', p: { Rik: [0.02, 0.1, 0.95], Lik: [0.55, -0.3, 0.2] } },
    ],
    events: [{ t: 0.12, e: 'cast' }],
  },
  toss: {
    mask: ARMS_SPINE, fadeIn: 0.05, fadeOut: 0.25,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.3, -0.85, -0.35], Rpole: [1, -0.4, 0.2], Rfist: 0.4, spinePitch: 10, spineYaw: -15 } },
      { t: 0.16, e: 'out', p: { Rik: [0.0, 0.25, 0.95], Rfist: 0, Rspread: 1, spinePitch: -4, spineYaw: 15 } },
      { t: 0.3, p: { Rik: [0.0, 0.3, 0.9] } },
    ],
    events: [{ t: 0.15, e: 'throw' }],
  },
  pulse: {
    mask: makeMask(['upper', { g: 'rootY', w: 1 }]), fadeIn: 0.06, fadeOut: 0.32,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [-0.05, 0.05, 0.45], Bpole: [1, -1, -0.2], Bfist: 0, Bspread: 0.3, BhandFlex: 30, spinePitch: 12, rootY: -0.08, headPitch: 10 } },
      { t: 0.16, e: 'in', p: { Bik: [-0.08, 0.0, 0.38], spinePitch: 16 } },
      { t: 0.26, e: 'snap', p: { Bik: [0.98, 0.22, 0.12], Bspread: 1, BhandFlex: -50, spinePitch: -14, rootY: 0.02, headPitch: -12 } },
      { t: 0.45, p: { Bik: [0.95, 0.18, 0.1] } },
    ],
    events: [{ t: 0.25, e: 'pulse' }],
  },
  unbound: {
    mask: FULL, fadeIn: 0.15, fadeOut: 0.4, hold: true,
    keys: [
      { t: 0, p: { BikW: 0, Barm: [0.5, -0.6, 0.3], Belbow: 60, Bfist: 1, spinePitch: 25, headPitch: 25, BlegIkW: 0, Lleg: [0.05, -0.95, 0.2], Lknee: 50, Rleg: [0.02, -0.9, 0.35], Rknee: 70, BfootPitch: 40, BfootGround: 0 } },
      { t: 0.55, e: 'in3', p: { Barm: [0.55, -0.7, 0.35], Belbow: 75, spinePitch: 32, headPitch: 32 } },
      { t: 0.85, e: 'snap', p: { Barm: [0.97, 0.15, 0.05], Belbow: 6, Bfist: 0, Bspread: 1, BhandFlex: -30, spinePitch: -22, headPitch: -32, Lleg: [0.12, -0.98, -0.02], Lknee: 6, Rleg: [0.1, -0.98, 0.05], Rknee: 14 } },
      { t: 1.2, e: 'out', p: { Barm: [0.9, 0.3, 0.1], spinePitch: -16, headPitch: -20 } },
    ],
    events: [{ t: 0.85, e: 'burst' }],
  },
  beam: {
    mask: makeMask(['upper']), fadeIn: 0.12, fadeOut: 0.3, loop: true, duration: 0.5,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [-0.04, 0.06, 0.96], Rpole: [1, -0.6, -0.4], LikW: 1, Lik: [0.04, 0.0, 0.94], Lpole: [1, -0.6, -0.4], Bfist: 0, Bspread: 1, BhandFlex: -72, spinePitch: -4 } },
      { t: 0.25, p: { Rik: [-0.03, 0.07, 0.95], Lik: [0.05, -0.01, 0.93], spinePitch: -6 } },
      { t: 0.5, p: { Rik: [-0.04, 0.06, 0.96], Lik: [0.04, 0.0, 0.94], spinePitch: -4 } },
    ],
  },
  revive: {
    mask: makeMask(['upper']), fadeIn: 0.15, fadeOut: 0.45,
    keys: [
      { t: 0, p: { Barm: [0.4, 0.9, 0.2], Belbow: 15, Bfist: 0, Bspread: 1, BhandFlex: -40, spinePitch: -18, headPitch: -40 } },
      { t: 0.6, e: 'inout', p: { Barm: [0.55, 0.82, 0.15], spinePitch: -22, headPitch: -45 } },
      { t: 1.3, e: 'inout', p: { Barm: [0.5, 0.85, 0.2] } },
    ],
  },
  getup: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.4, spinePitch: 40, headPitch: -20, Barm: [0.35, -0.85, 0.35], Belbow: 40 } },
      { t: 0.3, e: 'inout', p: { rootY: -0.08, spinePitch: 10, headPitch: 0 } },
    ],
  },
});

/** Construct fist visual: blocky energy fist assembled from rounded boxes. */
function makeFistMesh(fx) {
  if (!fx._fistGeo) {
    const parts = [];
    const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2); g.translate(x, y, z); parts.push(g); };
    box(0.9, 0.7, 0.8, 0, 0, -0.1); // palm
    for (let i = 0; i < 4; i++) box(0.2, 0.28, 0.32, -0.33 + i * 0.22, 0.22, 0.38); // knuckles
    box(0.22, 0.25, 0.5, 0.52, -0.08, 0.12); // thumb
    box(0.62, 0.52, 0.6, 0, 0, -0.62); // wrist
    const merged = mergeGeos(parts);
    merged.computeVertexNormals();
    fx._fistGeo = merged;
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(3.2, 0.8, 2.8) }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uOpacity; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6); float scan = 0.6 + 0.4*sin(vP.z*18.0 - uTime*25.0); float a = (0.25 + f*1.2) * scan * uOpacity; gl_FragColor = vec4(uColor*a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(fx._fistGeo, mat);
  m.renderOrder = 9;
  return m;
}
function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

class Field {
  constructor(kit, pos) {
    this.kit = kit; this.w = kit.w; this.fx = kit.fx; this.h = kit.h;
    this.pos = pos.clone(); this.pos.y = this.w.groundAt(pos.x, pos.z);
    this.r = 6; this.life = 4; this.t = 0; this.tick = 0;
    this.decal = this.fx.decal(this.pos, this.r * 2.1, 'atom', this.life + 0.5, 0.95);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, TAU, 0, Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uO: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uT, uO; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); float bands = 0.5 + 0.5*sin(vP.y*30.0 - uT*6.0); float a = (f*0.75 + bands*0.05) * uO * (1.0 - vP.y*0.6); gl_FragColor = vec4(vec3(2.6,0.5,2.2)*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    }));
    dome.position.copy(this.pos); dome.scale.set(this.r, this.r * 0.55, this.r);
    this.dome = dome;
    this.w.scene.add(dome);
    this.fx.ring(this.pos, { color: 0xff55dd, intensity: 1.5, r0: 0.5, r1: this.r, life: 0.4 });
    this.fx.energyBurst(_v.copy(this.pos).setY(this.pos.y + 0.5), { size: 1.6 });
    this.w.sfx('field', this.pos, { vol: 0.9 });
    this.snd = this.w.sfx('crackle', this.pos, { vol: 0.6 });
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.life;
    this.dome.material.uniforms.uT.value = this.t;
    this.dome.material.uniforms.uO.value = Math.min(1, this.t * 6) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    // motes
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * this.r;
      this.fx.add.spawn({ p: [this.pos.x + Math.cos(a) * r, this.pos.y + 0.1, this.pos.z + Math.sin(a) * r], v: [0, rand(1.5, 4), 0], life: rand(0.5, 1.1), size: rand(0.05, 0.12), size1: 0.02, color: PINK, color1: [2, 0.4, 2, 0], shape: Math.random() < 0.3 ? SHAPE.STAR : SHAPE.DOT });
    }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      for (const e of this.w.heroes) {
        if (e.team === this.h.team || !e.targetable) continue;
        _v.subVectors(e.pos, this.pos); if (Math.abs(_v.y) > 4) continue; _v.y = 0;
        if (_v.length() < this.r + e.radius) {
          e.status.vuln = Math.max(e.status.vuln, 0.25); e.status.vulnT = Math.max(e.status.vulnT, 0.45);
          if (!e.unstoppable) { e.status.slow = Math.max(e.status.slow, 0.3); e.status.slowT = Math.max(e.status.slowT, 0.45); }
          this.w.damage(this.h, e, 15 * 0.25, { noFlinch: true, power: 0.1, type: 'dot' });
          // crackle arc on target
          this.fx.sparks(e.center, UP, { n: 3, color: PINK, speed: 5, life: 0.2, size: 0.05 });
        }
      }
    }
    if (this.t >= this.life) { this.w.scene.remove(this.dome); this.dome.material.dispose(); return false; }
    return true;
  }
}

export class EveKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = EVE_CLIPS;
    this.fireT = 0; this.hand = 0; this.firing = 0;
    this.recoil = { L: new Spring(0, 7, 0.45), R: new Spring(0, 7, 0.45) };
    this.stance = null;
    this.ultState = null;
    this.handGlow = 0;
    this.lastShot = -9;
  }
  get busy() { return this.busyT > 0 || !!this.h.override; }

  update(dt, it) {
    super.update(dt);
    const h = this.h, w = this.w;
    // recoil additive
    for (const s of ['L', 'R']) {
      const r = this.recoil[s].update(dt, 0);
      const av = h.anim.additive.v;
      av[CH[s + 'elbow']] += r * 30; av[CH[s + 'clavFwd']] += -r * 10; av[CH[s + 'handFlex']] += r * 20;
      av[CH[s + 'ikZ']] += -r * 0.12;
    }
    // ambient energy at hands
    this.handGlow = damp(this.handGlow, w.time - this.lastShot < 0.4 ? 1 : 0.15, 6, dt);
    if (Math.random() < dt * 30 * this.handGlow) {
      const side = Math.random() < 0.5 ? 'handL' : 'handR';
      h.bonePos(side, _v);
      this.fx.add.spawn({ p: _v, v: [rand(-0.5, 0.5), rand(0.2, 1.2), rand(-0.5, 0.5)], life: 0.35, size: 0.06, size1: 0.01, color: PINK, color1: [2, 0.3, 2, 0], shape: SHAPE.DOT });
    }
    if (this.ultState) { this.ultUpdate(dt, it); return; }
    if (h.override) return;
    if (it.ult && h.ultReady && this.free) return this.unbound();
    if (it.a1 && this.ready('a1') && this.free) return this.bubble(it);
    if (it.a2 && this.ready('a2') && this.free) return this.field(it);
    if (it.a3 && this.ready('a3') && this.free) return this.pulse(it);
    if (it.secondaryPressed && this.ready('secondary') && this.free) return this.constructFist(it);
    // primary
    if (it.primary && this.free) {
      this.firing = 0.25;
      if (!this.stance || this.stance.ending) this.stance = h.anim.play(this.clips.fireStance, { hold: true });
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT += 1 / 7; this.fireBolt(it); }
    } else {
      this.fireT = Math.max(0, this.fireT - dt);
      this.firing -= dt;
      if (this.stance && this.firing <= 0) { h.anim.stop(0.25); this.stance = null; }
    }
  }

  handPos(side, out) { this.h.bonePos(side === 'L' ? 'handL' : 'handR', out); return out.addScaledVector(this.h.aimDir, 0.12); }

  fireBolt(it) {
    const h = this.h, w = this.w;
    const side = this.hand++ % 2 === 0 ? 'R' : 'L';
    this.recoil[side].v += 9;
    this.lastShot = w.time;
    const o = this.handPos(side, new THREE.Vector3());
    const dir = _v.subVectors(it.aimPoint, o).normalize().clone();
    if (dir.dot(h.aimDir) < 0.6) dir.copy(h.aimDir);
    w.sfx('bolt_fire', o, { vol: 0.45 });
    this.fx.glow(o, { color: PINK, size: 0.45, life: 0.08 });
    const tr = this.fx.trail({ color: 0xff55dd, intensity: 2.6, width: 0.07, life: 0.12, max: 12, minDist: 0.2 });
    const kit = this;
    w.spawnProjectile({
      owner: h, pos: o, vel: dir.multiplyScalar(95), radius: 0.12, life: 1.6,
      onUpdate: (dt, p) => { tr.push(p); if (Math.random() < 0.6) kit.fx.add.spawn({ p, life: 0.12, size: 0.28, size1: 0.1, color: [3.5, 1.1, 3, 0.7], color1: [2, 0.2, 2, 0], shape: SHAPE.GLOW }); },
      onHitHero: (e, p) => { w.damage(h, e, 21, { hitPos: p.clone(), power: 0.35, type: 'proj' }); return true; },
      onEnd: (proj, hero) => {
        tr.stop();
        const p = proj.pos;
        kit.fx.energyBurst(p, { size: 0.42, n: 6 });
        w.sfx('bolt_hit', p, { vol: 0.35, minGap: 0.03 });
        // small splash + weak heal for allies near the impact (not Eve herself: point-blank that
        // would be ~35 HP/s of self-healing)
        for (const e of w.inSphere(p, 1.2, kit.enemyFilter())) if (e !== hero) w.damage(h, e, 8, { noFlinch: true, power: 0.1 });
        for (const a of w.inSphere(p, 4, kit.allyFilter(false))) {
          const got = w.heal(h, a, 5);
          if (got > 0) kit.fx.add.spawn({ p: a.center, v: [0, 1.5, 0], life: 0.5, size: 0.12, size1: 0.02, color: [1.2, 3, 1.8, 1], color1: [1, 3, 1.5, 0], shape: SHAPE.STAR });
        }
      },
    });
  }

  constructFist(it) {
    const h = this.h, w = this.w, kit = this;
    this.use('secondary');
    this.busyT = 0.3;
    w.sfx('construct', h.pos, { vol: 0.8 });
    h.anim.play(this.clips.fistCast, {
      onEvent: (e) => {
        if (e !== 'fire' || h.dead) return;
        const o = h.chestPos(new THREE.Vector3()).addScaledVector(h.aimDir, 1.4);
        const dir = _v.subVectors(it.aimPoint, o).normalize().clone();
        if (dir.dot(h.aimDir) < 0.5) dir.copy(h.aimDir);
        const mesh = makeFistMesh(this.fx);
        mesh.position.copy(o); mesh.scale.setScalar(0.2);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        w.scene.add(mesh);
        const tr = this.fx.trail({ color: 0xff55dd, intensity: 2, width: 0.6, life: 0.3, max: 24, minDist: 0.3 });
        let age = 0;
        this.fx.converge(o, { n: 18, radius: 1.6, life: 0.2 });
        w.spawnProjectile({
          owner: h, pos: o, vel: dir.clone().multiplyScalar(48), radius: 0.95, life: 1.3,
          onUpdate: (dt, p) => {
            age += dt;
            mesh.position.copy(p);
            mesh.scale.setScalar(Math.min(1.25, 0.2 + age * 9));
            mesh.material.uniforms.uTime.value = age;
            tr.push(p);
            kit.fx.add.spawn({ p: [p.x + rand(-0.6, 0.6), p.y + rand(-0.6, 0.6), p.z + rand(-0.6, 0.6)], v: dir.clone().multiplyScalar(-6), life: 0.25, size: 0.1, size1: 0.02, color: PINK, color1: [2, 0.3, 2, 0], shape: SHAPE.SPARK });
          },
          onHitHero: (e, p) => {
            const kv = dir.clone().multiplyScalar(14); kv.y += 4;
            w.damage(h, e, 90, { hitPos: p.clone(), dir: dir.clone(), knock: kv, power: 1.3, type: 'ability' });
            return true;
          },
          onEnd: (proj) => {
            tr.stop();
            w.scene.remove(mesh); mesh.material.dispose();
            const p = proj.pos;
            kit.fx.energyBurst(p, { size: 2.2, n: 26 });
            kit.fx.ring(p, { color: 0xff66dd, intensity: 1.3, r1: 4, life: 0.35, normal: dir.clone().negate() });
            w.renderer.addWave(p, { strength: 0.04, life: 0.45 });
            w.sfx('construct_hit', p, { vol: 0.9 });
            w.shakeAt(p, 0.3);
          },
        });
      },
    });
  }

  bubbleTarget(it) {
    const h = this.h, w = this.w;
    // ally under crosshair, else ally near crosshair, else self
    const ray = w.rayHeroes(it.aimOrigin, it.aimDir, 50, (x) => x.team === h.team && x !== h, 0.7);
    if (ray) return ray.hero;
    let best = null, bd = 0.17;
    for (const a of w.alliesOf(h)) {
      _v.subVectors(a.center, it.aimOrigin); const d = _v.length(); if (d > 50) continue;
      const ang = Math.acos(clamp(_v.normalize().dot(it.aimDir), -1, 1));
      if (ang < bd) { bd = ang; best = a; }
    }
    return best || h;
  }
  applyBubble(target, amt = 225, dur = 4) {
    const w = this.w, h = this.h;
    if (target.bubble) { target.bubble.fx && target.bubble.fx.pop(false); }
    const fx = new Bubble(this.fx, target, { radius: target.height * 0.62 });
    this.fx.items.push({ update: (dt) => fx.update(dt), dispose: () => fx.dispose() });
    target.bubble = { amt, t: dur, owner: h, fx };
    w.sfx('bubble_up', target.center, { vol: 0.8 });
    this.fx.converge(target.center, { n: 20, radius: 2, life: 0.3 });
  }
  bubble(it) {
    const h = this.h, w = this.w;
    const target = this.bubbleTarget(it);
    this.use('a1');
    this.busyT = 0.2;
    h.anim.play(this.clips.bubbleCast, {
      onEvent: (e) => {
        if (e !== 'cast' || h.dead || target.dead) return;
        this.applyBubble(target);
        if (target !== h) {
          // zap line from hand to target
          const o = this.handPos('R', new THREE.Vector3());
          const tr = this.fx.trail({ color: 0xff77ee, intensity: 3, width: 0.12, life: 0.25, max: 16, minDist: 0.01 });
          for (let i = 0; i <= 12; i++) { _v.lerpVectors(o, target.center, i / 12); _v.y += Math.sin(i / 12 * Math.PI) * 0.6; tr.push(_v); }
          tr.stop();
        }
      },
    });
  }

  field(it) {
    const h = this.h, w = this.w, kit = this;
    this.use('a2');
    this.busyT = 0.25;
    h.anim.play(this.clips.toss, {
      onEvent: (e) => {
        if (e !== 'throw' || h.dead) return;
        const o = this.handPos('R', new THREE.Vector3());
        const dir = h.aimDir.clone(); dir.y += 0.18; dir.normalize();
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1, 3.5) }));
        orb.position.copy(o); w.scene.add(orb);
        const tr = this.fx.trail({ color: 0xff55dd, intensity: 2, width: 0.18, life: 0.3, max: 20, minDist: 0.15 });
        w.sfx('swing', o, { vol: 0.5, rate: 1.4 });
        w.spawnProjectile({
          owner: h, pos: o, vel: dir.multiplyScalar(30), radius: 0.3, gravity: 16, life: 3,
          onUpdate: (dt, p) => { orb.position.copy(p); tr.push(p); },
          onEnd: (proj) => { tr.stop(); w.scene.remove(orb); orb.geometry.dispose(); w.zones.push(new Field(kit, proj.pos)); },
        });
      },
    });
  }

  pulse(it) {
    const h = this.h, w = this.w;
    this.use('a3');
    this.busyT = 0.35;
    h.anim.play(this.clips.pulse, {
      onEvent: (e) => {
        if (e !== 'pulse' || h.dead) return;
        const c = h.center.clone();
        this.fx.ring(_v.copy(h.pos).setY(0.1), { color: 0xff7ae0, intensity: 1.4, r0: 0.5, r1: 15, life: 0.7, soft: 0.3 });
        this.fx.ring(_v.copy(h.pos).setY(0.12), { color: 0x9dffc8, intensity: 0.7, r0: 0.5, r1: 13, life: 0.8, soft: 0.35 });
        this.fx.sphere(c, { color: 0xff7ae0, intensity: 0.9, r0: 0.5, r1: 7, life: 0.45, fresnel: 2.2 });
        this.fx.glow(c, { color: [2, 1, 2, 1], size: 2.2, life: 0.18 });
        w.sfx('heal_pulse', c, { vol: 0.9 });
        for (const a of w.alliesOf(h, true)) {
          if (a.pos.distanceTo(h.pos) > 15) continue;
          w.heal(h, a, 80);
          a.status.slow = 0; a.status.slowT = 0;
          let hot = 40, t = 0;
          this.fx.every((dt) => { t += dt; if (a.dead) return false; const d = Math.min(hot, 20 * dt); hot -= d; w.heal(h, a, d, { silent: true }); return t < 2; });
          this.fx.healBurst(a.pos, { color: [3, 1.2, 2.6, 1] });
          this.fx.healBurst(a.pos);
        }
      },
    });
  }

  // ---------------- Q: UNBOUND ----------------
  unbound() {
    const h = this.h, w = this.w, kit = this;
    h.ult = 0;
    w.emit('ult', { hero: h, name: 'UNBOUND' });
    this.ultState = { phase: 'rise', t: 0, choice: null };
    h.invuln = 1.2;
    h.glowTarget = 0.35;
    h.U.uGlowColor.value.setRGB(1.0, 0.25, 0.85);
    w.sfx('unbound', h.pos, { vol: 1, important: true });
    h.anim.play(this.clips.unbound, {
      hold: true,
      onEvent: (e) => {
        if (e !== 'burst') return;
        const c = h.center.clone();
        w.sfx('unbound_burst', c, { vol: 1, important: true });
        this.fx.sphere(c, { color: 0xff44dd, intensity: 1.6, r0: 0.5, r1: 9, life: 0.6, fresnel: 1.8 });
        this.fx.ring(c, { color: 0xff66ee, intensity: 1.8, r1: 14, life: 0.6, normal: UP });
        this.fx.energyBurst(c, { size: 3, n: 60 });
        w.renderer.flash(0xff66dd, 0.35);
        w.renderer.addWave(c, { strength: 0.07, life: 0.7, speed: 1.8 });
        w.shakeAt(c, 0.5);
        h.glowTarget = 0.5;
        // knock back nearby enemies a little
        for (const e2 of w.inSphere(c, 6, kit.enemyFilter())) w.damage(h, e2, 30, { knock: _w.subVectors(e2.pos, h.pos).setY(0).normalize().multiplyScalar(10).setY(4).clone(), type: 'ult' });
      },
    });
    const start = h.pos.y;
    h.override = {
      faceAim: true, animMode: 'fly', boost: 0, animVel: new THREE.Vector3(), t: 0,
      update(dt) {
        this.t += dt;
        const st = kit.ultState; if (!st) return false;
        // rise to hover height
        const ty = Math.max(start, w.groundAt(h.pos.x, h.pos.z)) + 3.2;
        h.pos.y = damp(h.pos.y, ty, 3, dt);
        h.vel.set(0, 0, 0);
        h.mode = 'fly';
        // swirl particles
        for (let i = 0; i < 4; i++) {
          const a = this.t * 6 + i * TAU / 4, r = 1.3;
          kit.fx.add.spawn({ p: [h.center.x + Math.cos(a) * r, h.center.y + rand(-1, 1), h.center.z + Math.sin(a) * r], v: [0, rand(1, 3), 0], life: 0.5, size: 0.1, size1: 0.02, color: PINK, color1: [2, 0.2, 2, 0], shape: SHAPE.SPARK });
        }
        return true;
      },
      onEnd: () => {},
    };
  }

  ultUpdate(dt, it) {
    const st = this.ultState, h = this.h, w = this.w;
    st.t += dt;
    if (h.dead) { this.endUlt(); return; }
    if (st.phase === 'rise') {
      if (st.t > 1.0) { st.phase = 'choose'; st.t = 0; w.emit('eveChoice', { hero: h, open: true }); }
      return;
    }
    if (st.phase === 'choose') {
      let choice = null;
      if (it.primaryPressed) choice = 'beam';
      else if (it.secondaryPressed) choice = 'revive';
      else if (it.choice) choice = it.choice;
      else if (st.t > 4) choice = w.heroes.some((x) => x.team === h.team && x.dead) ? 'revive' : 'beam';
      if (choice) {
        w.emit('eveChoice', { hero: h, open: false, choice });
        if (choice === 'beam') this.startBeam(); else this.reconstruction();
      }
      return;
    }
    if (st.phase === 'beam') return this.beamUpdate(dt, it);
    if (st.phase === 'revive') {
      if (st.t > 1.6) this.endUlt();
    }
  }

  startBeam() {
    const h = this.h, w = this.w;
    const st = this.ultState;
    st.phase = 'beam'; st.t = 0;
    st.dir = h.aimDir.clone();
    st.beam = new Beam(this.fx, { color: 0xff3fd2, width: 1.15 });
    this.fx.items.push({ update: (dt) => st.beam.update(dt), dispose: () => st.beam.dispose() });
    st.voice = w.audio ? w.audio.beamVoice(h.center) : null;
    st.tick = 0;
    st.scorchT = 0;
    w.sfx('beam_start', h.center, { vol: 1, important: true });
    h.anim.play(this.clips.beam, { hold: true });
    // keep hovering, allow slow drift
    h.override = {
      faceAim: true, animMode: 'fly', boost: 0, animVel: new THREE.Vector3(), flutter: 30,
      update: (dt) => {
        const it = h.intents;
        _v.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
        _w.set(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
        const mv = _u.set(0, 0, 0).addScaledVector(_v, it.mz).addScaledVector(_w, it.mx);
        if (mv.lengthSq() > 1) mv.normalize();
        h.vel.copy(mv.multiplyScalar(3));
        h.pos.addScaledVector(h.vel, dt);
        h.integrate(0);
        if (h.pos.y < 1.5) h.pos.y = damp(h.pos.y, 2.5, 3, dt);
        h.mode = 'fly';
        return !!this.ultState;
      },
    };
  }

  beamUpdate(dt, it) {
    const st = this.ultState, h = this.h, w = this.w, fx = this.fx;
    st.t += 0; // already advanced
    const D = 4.6;
    const power = Math.min(1, st.t * 4) * (st.t > D - 0.4 ? clamp01((D - st.t) / 0.4) : 1);
    // limited turn rate toward aim
    const maxTurn = 1.7 * dt;
    const ang = st.dir.angleTo(h.aimDir);
    if (ang > 1e-4) { _q.setFromUnitVectors(st.dir, h.aimDir); if (ang > maxTurn) _q.slerp(new THREE.Quaternion(), 1 - maxTurn / ang); st.dir.applyQuaternion(_q).normalize(); }
    // origin between hands
    h.bonePos('handL', _v); h.bonePos('handR', _w);
    const o = _v.add(_w).multiplyScalar(0.5).addScaledVector(st.dir, 0.25).clone();
    const hitW = w.rayWorld(o, st.dir, 95);
    const len = hitW ? hitW.dist : 95;
    const end = o.clone().addScaledVector(st.dir, len);
    st.beam.set(o, end, power);
    st.voice && st.voice.set(o, power);
    if (h.isPlayer) { w.camRig.addTrauma(0.05); w.renderer.fx.ca = Math.max(w.renderer.fx.ca, 0.004); }
    // muzzle & impact fx
    fx.glow(o, { color: [4, 1.3, 3.6, 1], size: 1.6 * power, life: 0.06 });
    if (hitW) {
      fx.glow(end, { color: [4, 1.2, 3.4, 1], size: 3.2 * power, life: 0.08 });
      if (Math.random() < 0.7) fx.sparks(end, hitW.normal, { n: 3, color: PINK, speed: 14, life: 0.4 });
      if (Math.random() < 0.25) fx.smoke(end, { n: 1, color: [0.5, 0.35, 0.5, 0.4], size: 1.5, size1: 4, speed: 4, life: 1.4 });
      st.scorchT -= dt;
      if (st.scorchT <= 0 && hitW.normal.y > 0.5) { st.scorchT = 0.12; fx.decal(end, 3.2, 'scorch', 10, 0.8); }
      if (Math.random() < 0.15) fx.rocks(end, { n: 1, speed: 8, size: 0.15 });
      fx.lights.flash(end, 0xff55dd, 22 * power, 14, 0.08);
    }
    // damage ticks
    st.tick -= dt;
    if (st.tick <= 0) {
      st.tick = 0.1;
      for (const e of w.heroes) {
        if (e.team === h.team || !e.targetable) continue;
        const d = segPoint(o, end, e.center);
        if (d < 1.7 + e.radius) {
          const kv = st.dir.clone().multiplyScalar(2.2);
          w.damage(h, e, 42 * power, { knock: kv, power: 0.5, flashColor: 0xff66dd, type: 'ult', noFlinch: Math.random() < 0.5 });
          fx.energyBurst(e.center, { size: 0.8, n: 5 });
        }
      }
    }
    if (st.t > D) this.endUlt();
  }

  reconstruction() {
    const h = this.h, w = this.w, fx = this.fx;
    const st = this.ultState;
    st.phase = 'revive'; st.t = 0;
    h.anim.play(this.clips.revive);
    w.sfx('revive', h.center, { vol: 1, important: true, ui: h.isPlayer });
    fx.pillar(h.pos, { color: 0xff6be0, height: 30, radius: 2, life: 1.8, intensity: 1.9 });
    w.renderer.flash(0xffb0f0, 0.3);
    const revived = [];
    for (const a of w.heroes) {
      if (a.team !== h.team) continue;
      if (a.dead) {
        const at = a.pos.clone(); at.y = Math.max(0, w.groundAt(at.x, at.z));
        a.revive(at, 1);
        a.overhealth = 150; a.ohT = 5;
        fx.pillar(at, { color: 0xff6be0, height: 22, radius: 1.5, life: 1.6, intensity: 1.9 });
        fx.converge(_v.copy(at).setY(1), { n: 40, radius: 3, life: 0.6 });
        revived.push(a);
        w.emit('revive', { by: h, hero: a });
      } else if (a.pos.distanceTo(h.pos) < 35) {
        w.heal(h, a, 200, { noUlt: true });
        fx.healBurst(a.pos, { color: [3, 1.2, 2.6, 1] });
      }
      if (!a.dead) this.applyBubble(a, 150, 3);
    }
    if (!revived.length) this.msg('Team shielded');
  }

  endUlt() {
    const st = this.ultState; if (!st) return;
    const h = this.h, w = this.w;
    if (st.beam) { st.beam.power = 0; st.beam.alive = false; }
    if (st.voice) st.voice.stop();
    if (st.phase === 'beam') w.sfx('beam_end', h.center, { vol: 0.8 });
    if (st.phase === 'choose') w.emit('eveChoice', { hero: h, open: false });
    this.ultState = null;
    h.glowTarget = 0;
    h.anim.stop(0.3);
    if (h.override) { const o = h.override; h.override = null; o.onEnd && o.onEnd(); }
    h.mode = 'fly';
  }
  onDeath() { if (this.ultState) this.endUlt(); }
  dispose() { if (this.ultState) this.endUlt(); }
}

function segPoint(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = clamp01(t);
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
