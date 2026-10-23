import * as THREE from 'three';
import { Kit } from '../kit.js';
import { clips } from '../../anim/clip.js';
import { makeMask, CH } from '../../anim/pose.js';
import { SHAPE } from '../../vfx/particles.js';
import { patchHeroMaterial, makeOutlineMaterial } from '../materials.js';
import { RULES } from '../data.js';
import { clamp, clamp01, rand, lerp, damp, dampT, Spring, ease, TAU } from '../../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1), X_AXIS = new THREE.Vector3(1, 0, 0);
// HDR colours (bloom): plasma, hard light, EMP, overclock, override
const AMBER = [3.6, 1.7, 0.45, 1];
const CYAN = [0.55, 2.6, 3.4, 1];
const EMP = [1.2, 2.1, 4.2, 1];
const GOLD = [3.4, 2.3, 0.55, 1];
const RED = [3.8, 0.55, 0.35, 1];
const ARMS_SPINE = makeMask(['arms', 'spine', { g: 'head', w: 0.5 }]);

export const ROBOT_CLIPS = clips({
  // wrist cannons up: both forearms level at the aim, fists closed, palms down
  cannonStance: {
    mask: ARMS_SPINE, fadeIn: 0.08, fadeOut: 0.25, loop: true, duration: 1,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.08, -0.02, 0.9], Rpole: [1, -0.9, -0.2], Rfist: 1, RhandFlex: 6, RforeTwist: -50,
        LikW: 1, Lik: [0.14, -0.1, 0.82], Lpole: [1, -0.9, -0.2], Lfist: 1, LhandFlex: 6, LforeTwist: -50, spinePitch: 5 } },
      { t: 1, p: {} },
    ],
  },
  // the back pods tilt up and fire; the shoulders brace and rock with the salvo
  salvo: {
    mask: makeMask(['upper']), fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { spinePitch: -4, headPitch: -8, Barm: [0.42, -0.82, 0.22], Belbow: 52, Bfist: 1 } },
      { t: 0.12, e: 'out', p: { spinePitch: 9, headPitch: 2, Barm: [0.48, -0.8, 0.3], Belbow: 64 } },
      { t: 0.55, e: 'inout', p: { spinePitch: 4, headPitch: 0 } },
    ],
    events: [{ t: 0.08, e: 'fire' }],
  },
  // palm thrust: the hard-light wall unfolds from his right hand
  barrierCast: {
    mask: ARMS_SPINE, fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.25, 0.05, 0.3], Rpole: [1, -0.6, -0.5], Rfist: 0, Rspread: 0.6, RhandFlex: -20, LikW: 1, Lik: [0.2, -0.3, 0.45], Lpole: [1, -0.8, 0], Lfist: 1, spinePitch: -4, spineYaw: 12 } },
      { t: 0.14, e: 'snap', p: { Rik: [0.02, 0.08, 1.0], Rspread: 1, RhandFlex: -80, spinePitch: 8, spineYaw: -10 } },
      { t: 0.42, e: 'inout', p: { Rik: [0.03, 0.06, 0.96], RhandFlex: -70 } },
    ],
    events: [{ t: 0.13, e: 'cast' }],
  },
  // overhand throw of the EMP charge
  empThrow: {
    mask: ARMS_SPINE, fadeIn: 0.05, fadeOut: 0.25,
    keys: [
      { t: 0, p: { RikW: 1, Rik: [0.35, 0.55, -0.35], Rpole: [1, -0.2, -0.6], Rfist: 0.6, LikW: 1, Lik: [0.15, -0.05, 0.7], Lpole: [1, -0.8, -0.2], Lfist: 0.3, spinePitch: -8, spineYaw: -18 } },
      { t: 0.17, e: 'snap', p: { Rik: [0.02, 0.15, 0.96], Rfist: 0, Rspread: 1, Lik: [0.3, -0.4, 0.3], spinePitch: 14, spineYaw: 16 } },
      { t: 0.36, p: { Rik: [0.05, 0.05, 0.9] } },
    ],
    events: [{ t: 0.16, e: 'throw' }],
  },
  // both hands up and out: the repair drones launch from the back pods
  dronesCast: {
    mask: ARMS_SPINE, fadeIn: 0.06, fadeOut: 0.3,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [0.2, -0.15, 0.45], Bpole: [1, -0.6, -0.4], Bfist: 0.4, spinePitch: 6, headPitch: 4 } },
      { t: 0.16, e: 'out', p: { Bik: [0.55, 0.45, 0.62], Bfist: 0, Bspread: 1, BhandFlex: -30, spinePitch: -10, headPitch: -16 } },
      { t: 0.5, e: 'inout', p: { Bik: [0.5, 0.35, 0.6] } },
    ],
    events: [{ t: 0.12, e: 'launch' }],
  },
  // ult: gathers the hack with arms crossed and the chest open, then throws them wide as the wave goes out
  override: {
    mask: makeMask(['upper', { g: 'rootY', w: 1 }]), fadeIn: 0.12, fadeOut: 0.4,
    keys: [
      { t: 0, p: { BikW: 1, Bik: [-0.2, -0.05, 0.42], Bpole: [1, -0.6, -0.4], Bfist: 1, spinePitch: 18, headPitch: 14, rootY: -0.1 } },
      { t: 0.55, e: 'in3', p: { Bik: [-0.28, -0.12, 0.36], spinePitch: 26, headPitch: 20, rootY: -0.2 } },
      { t: 0.78, e: 'snap', p: { BikW: 0, Barm: [0.96, 0.22, 0.12], Belbow: 8, Bfist: 0, Bspread: 1, BhandFlex: -40, spinePitch: -22, headPitch: -26, rootY: 0.02 } },
      { t: 1.3, e: 'out', p: { Barm: [0.9, 0.3, 0.15], spinePitch: -14, headPitch: -18, rootY: 0 } },
    ],
    events: [{ t: 0.78, e: 'wave' }],
  },
  getup: {
    mask: makeMask(['all']), fadeIn: 0.06, fadeOut: 0.25,
    keys: [
      { t: 0, p: { rootY: -0.4, spinePitch: 40, headPitch: -20, Barm: [0.35, -0.85, 0.35], Belbow: 40 } },
      { t: 0.3, e: 'inout', p: { rootY: -0.08, spinePitch: 10, headPitch: 0 } },
    ],
  },
});

// ------------------------------------------------------------------ hoverbike
// The bike's seat (top of its dip, 0.55 m up, just behind the middle) sits under Robot's hips; the grips
// and exhausts are in the bike's own frame (nose +z).
const SEAT = new THREE.Vector3(0, 0.55, -0.05);
const GRIP = new THREE.Vector3(0.24, 0.86, 0.36);
const NOZZLES = [new THREE.Vector3(0.47, 0.52, -1.42), new THREE.Vector3(-0.47, 0.52, -1.42), new THREE.Vector3(0, 0.72, -1.3)];
const RIDE_HIPS = -0.16 - 0.1; // the ride pose lowers the hips 0.16 m; the seat is 0.1 m under the pelvis joint

/**
 * Robot's flight: the hoverbike streaks in under him on take-off and peels away (or crashes, if he
 * dies on it) when he lands, falls out of the sky or gets knocked off. It rides on the hero's tilt
 * group, so it pitches and banks with him around his hips.
 */
class Hoverbike {
  constructor(kit) {
    const h = kit.h;
    this.kit = kit; this.h = h; this.w = kit.w; this.fx = kit.fx;
    const src = h.model.getObjectByName('Robot_Hoverbike');
    this.ok = !!src;
    this.state = 'off'; this.k = 0; this.ghosts = [];
    this.root = new THREE.Group();
    h.visual.add(this.root);
    const seatY = h.rig.hipsHeight + RIDE_HIPS;
    this.root.position.set(0, seatY - SEAT.y, -SEAT.z - 0.04);
    // grips in rig space, for the ride pose's hand IK
    h.anim.rideGrip = {
      L: new THREE.Vector3(GRIP.x, GRIP.y, GRIP.z).add(this.root.position),
      R: new THREE.Vector3(-GRIP.x, GRIP.y, GRIP.z).add(this.root.position),
    };
    if (!this.ok) return;
    // detached from the model it keeps the model's scale (the converter left the bike in metres under it)
    src.updateWorldMatrix(true, false);
    const sc = new THREE.Vector3(); src.matrixWorld.decompose(_v, _q, sc);
    src.parent.remove(src);
    src.position.set(0, 0, 0); src.quaternion.identity(); src.scale.copy(sc);
    // its own dissolve, so it can materialise apart from Robot (it shares his hit flash and team rim)
    this.U = { ...h.U, uDissolve: { value: 1 }, uDissolveColor: { value: new THREE.Color(0.06, 0.32, 0.45) } };
    src.material.roughness = 0.4; src.material.metalness = 0; src.material.envMapIntensity = 0.7;
    patchHeroMaterial(src.material, this.U, { rimMul: 0.6 });
    src.castShadow = true; src.receiveShadow = true; src.frustumCulled = false;
    const ol = new THREE.Mesh(src.geometry, makeOutlineMaterial(h.team === 0 ? 0x06080f : 0x2a0006, this.U, 2.2));
    ol.renderOrder = 1; ol.frustumCulled = false;
    src.add(ol);
    this.mesh = src; this.outline = ol;
    this.root.add(src);
    this.root.visible = false;
    this.voice = null;
  }
  get riding() { return this.state === 'on' || this.state === 'arriving'; }

  update(dt, want) {
    const h = this.h;
    if (want && !this.riding) this.arrive();
    else if (!want && this.riding) this.leave(h.dead ? 'crash' : 'away');
    if (this.state === 'arriving') {
      this.k = Math.min(1, this.k + dt / 0.28);
      const e = ease.out3(this.k);
      // swoops up from below and behind into the seat
      this.mesh.position.set(0, -1.6 * (1 - e), -2.2 * (1 - e));
      this.mesh.rotation.x = 0.35 * (1 - e);
      this.U.uDissolve.value = 1 - this.k;
      if (this.k >= 1) { this.state = 'on'; this.U.uDissolve.value = 0; }
    }
    if (this.riding) this.thrusters(dt);
    for (let i = this.ghosts.length - 1; i >= 0; i--) if (!this.ghosts[i].update(dt)) this.ghosts.splice(i, 1);
  }

  arrive() {
    const h = this.h;
    this.state = 'arriving'; this.k = 0;
    if (!this.ok) return;
    this.root.visible = true;
    this.U.uDissolve.value = 1;
    this.w.sfx('bike_summon', h.pos, { vol: 0.85 });
    if (this.w.audio && this.w.audio.engineVoice && !this.voice) this.voice = this.w.audio.engineVoice(h.pos);
  }

  /** the bike leaves as a free object: it peels away and dematerialises, or falls and crashes */
  leave(how) {
    const h = this.h;
    this.state = 'off';
    if (this.voice) { this.voice.stop(); this.voice = null; }
    if (!this.ok) return;
    this.root.visible = false;
    if (this.U.uDissolve.value > 0.9) return; // never really arrived
    this.mesh.updateWorldMatrix(true, false);
    this.ghosts.push(new BikeGhost(this, how));
    if (how === 'away') this.w.sfx('bike_away', h.pos, { vol: 0.7 });
  }

  thrusters(dt) {
    if (!this.ok || this.U.uDissolve.value > 0.6) return;
    const h = this.h, fx = this.fx;
    const sp = h.vel.length(), k = clamp01(0.35 + sp / 22);
    this.mesh.updateWorldMatrix(true, false);
    const back = _w.set(0, 0, -1).transformDirection(this.mesh.matrixWorld);
    for (let i = 0; i < NOZZLES.length; i++) {
      const p = _v.copy(NOZZLES[i]).applyMatrix4(this.mesh.matrixWorld);
      const s = i === 2 ? 0.55 : 1, jet = 9 + 9 * k;
      // a hot core at the nozzle and a short flame streaming off it
      fx.add.spawn({ p, life: 0.04, size: 0.3 * s, size1: 0.22 * s, color: [4, 3.2, 1.6, 1], color1: [4, 2, 0.6, 0.5], shape: SHAPE.GLOW });
      fx.add.spawn({ p, v: [back.x * jet + rand(-0.3, 0.3), back.y * jet + rand(-0.3, 0.3), back.z * jet + rand(-0.3, 0.3)], life: 0.05 + 0.05 * k, size: 0.2 * s, size1: 0.05, color: [4, 2.2, 0.7, 0.9], color1: [3, 0.5, 0.1, 0], shape: SHAPE.GLOW });
      if (Math.random() < dt * 30 * k) fx.add.spawn({ p, v: [back.x * 18 + rand(-1, 1), back.y * 18 + rand(-1, 1), back.z * 18 + rand(-1, 1)], life: 0.12, size: 0.05 * s, size1: 0.01, color: [4, 3, 1.4, 1], color1: [3, 0.8, 0.2, 0], shape: SHAPE.SPARK });
    }
    if (this.voice) this.voice.set(h.pos, clamp01(sp / 20), h.override && h.override.boost ? 1 : 0);
  }

  dispose() {
    if (this.voice) { this.voice.stop(); this.voice = null; }
    for (const g of this.ghosts) g.dispose();
    this.ghosts = [];
    this.h.visual.remove(this.root);
    if (this.ok) { this.mesh.material.dispose(); this.outline.material.dispose(); }
  }
}

/** a hoverbike that has left its rider */
class BikeGhost {
  constructor(bike, how) {
    const h = bike.h;
    this.bike = bike; this.w = bike.w; this.fx = bike.fx; this.how = how; this.t = 0;
    this.U = { ...bike.U, uDissolve: { value: 0 } };
    this.mat = bike.mesh.material.clone(); patchHeroMaterial(this.mat, this.U, { rimMul: 0.6 });
    this.mesh = new THREE.Mesh(bike.mesh.geometry, this.mat);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    bike.mesh.matrixWorld.decompose(this.mesh.position, this.mesh.quaternion, this.mesh.scale);
    this.w.scene.add(this.mesh);
    const fwd = _v.set(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    this.vel = h.vel.clone();
    if (how === 'away') this.vel.addScaledVector(fwd, 10).add(_w.set(0, 3.5, 0));
    else this.vel.add(_w.set(rand(-2, 2), 2, rand(-2, 2)));
    this.spin = new THREE.Vector3(rand(-1.5, 1.5), rand(-1, 1), rand(-2.5, 2.5));
    this.landed = false;
  }
  update(dt) {
    this.t += dt;
    const m = this.mesh;
    if (this.how === 'away') {
      // peels off, accelerating, and dematerialises in hard light
      this.vel.addScaledVector(_v.set(0, 0, 1).applyQuaternion(m.quaternion), 30 * dt);
      m.rotateX(-0.6 * dt);
      this.U.uDissolve.value = clamp01((this.t - 0.15) / 0.55);
      if (this.U.uDissolve.value < 0.7) this.fx.add.spawn({ p: m.position.clone().addScaledVector(_v.set(0, 0, -1).applyQuaternion(m.quaternion), 1.35), life: 0.06, size: 0.3, size1: 0.08, color: [4, 2.2, 0.8, 0.8], color1: [3, 0.6, 0.1, 0], shape: SHAPE.GLOW });
    } else {
      // no rider: it drops, tumbling, and blows up on the ground
      this.vel.y -= 28 * dt;
      m.rotateX(this.spin.x * dt); m.rotateY(this.spin.y * dt); m.rotateZ(this.spin.z * dt);
      if (Math.random() < 0.5) this.fx.alpha.spawn({ p: m.position.clone(), v: [rand(-1, 1), rand(1, 2), rand(-1, 1)], life: 0.8, size: 0.5, size1: 1.6, color: [0.25, 0.24, 0.24, 0.55], color1: [0.4, 0.38, 0.36, 0], shape: SHAPE.SMOKE });
      const gy = this.w.groundAt(m.position.x, m.position.z);
      if (!this.landed && m.position.y <= gy + 0.4) {
        this.landed = true; this.landedT = this.t;
        const p = m.position.clone(); p.y = gy + 0.3;
        this.fx.energyBurst(p, { color: [4, 1.8, 0.5, 1], size: 1.6, n: 22, light: 0xff9a40 });
        this.fx.smoke(p, { n: 10, size: 1.2, size1: 3.5, speed: 4, life: 1.6, color: [0.3, 0.28, 0.27, 0.45] });
        this.fx.rocks(p, { n: 8, speed: 7, size: 0.15 });
        this.fx.decal(p, 2.6, 'scorch', 8, 0.8);
        this.w.sfx('missile_boom', p, { vol: 1 });
        this.w.shakeAt(p, 0.25);
      }
      if (this.landed) { this.vel.set(0, 0, 0); this.U.uDissolve.value = clamp01((this.t - this.landedT) / 0.4); }
      else this.U.uDissolve.value = clamp01((this.t - 2.5) / 0.4);
    }
    m.position.addScaledVector(this.vel, dt);
    if (this.U.uDissolve.value >= 1 || this.t > 4) { this.dispose(); return false; }
    return true;
  }
  dispose() { this.w.scene.remove(this.mesh); this.mat.dispose(); }
}

// ------------------------------------------------------------------ hard-light barrier
const BARRIER_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const BARRIER_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uT, uDeploy, uFade, uHealth, uAspect;
  uniform vec4 uHits[6];
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float hexEdge(vec2 p) {
    // distance to the nearest hexagon edge (cells about 0.28 m across)
    p *= vec2(1.0, 1.1547);
    vec2 a = mod(p, vec2(1.0, 1.7320508)) - vec2(0.5, 0.8660254);
    vec2 b = mod(p - vec2(0.5, 0.8660254), vec2(1.0, 1.7320508)) - vec2(0.5, 0.8660254);
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    g = abs(g);
    return 0.5 - max(dot(g, vec2(0.5, 0.8660254)), g.x);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  void main() {
    vec2 q = vec2((vUv.x - 0.5) * uAspect, vUv.y);
    // unfolds from the middle out and from the ground up
    float reveal = smoothstep(uDeploy * 0.55 * uAspect, uDeploy * 0.55 * uAspect - 0.25, abs(q.x)) * smoothstep(uDeploy * 1.15, uDeploy * 1.15 - 0.12, vUv.y);
    float e = hexEdge(q * 3.6);
    float grid = smoothstep(0.06, 0.0, e);
    float cell = hash(floor(q * 3.6 * vec2(1.0, 1.1547)));
    float scan = smoothstep(0.08, 0.0, abs(fract(vUv.y * 1.2 - uT * 0.45) - 0.5) - 0.42);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float border = smoothstep(0.03, 0.0, min(min(vUv.x, 1.0 - vUv.x) * uAspect, min(vUv.y, 1.0 - vUv.y)));
    float a = 0.07 + grid * 0.42 + fres * 0.3 + scan * 0.18 + border * 0.9 + cell * 0.04;
    // impact ripples
    for (int i = 0; i < 6; i++) {
      vec4 h = uHits[i];
      if (h.z < 1.0) {
        float d = length(q - vec2((h.x - 0.5) * uAspect, h.y));
        float ring = smoothstep(0.12, 0.0, abs(d - h.z * 1.6)) * (1.0 - h.z);
        a += ring * 1.2 * h.w + smoothstep(0.5, 0.0, d) * (1.0 - h.z) * 0.8 * h.w;
      }
    }
    // a weakened wall flickers and breaks up
    float flick = 1.0 - (1.0 - uHealth) * 0.55 * step(0.5, hash(vec2(floor(uT * 24.0), cell)));
    a *= reveal * uFade * flick;
    vec3 col = uColor * (0.8 + grid * 0.6 + border * 0.8);
    gl_FragColor = vec4(col * a, a);
  }`;

class HardLight {
  constructor(kit, center, normal) {
    this.kit = kit; this.w = kit.w; this.fx = kit.fx; this.owner = kit.h; this.team = kit.h.team;
    this.c = center.clone();
    this.n = normal.clone().setY(0).normalize();
    this.r = new THREE.Vector3(this.n.z, 0, -this.n.x);
    this.W = 7; this.H = 4.2; this.sag = 0.45;
    this.hp = this.maxHp = 700; this.life = 5; this.t = 0; this.alive = true; this.fade = 1; this.endT = 0;
    const g = new THREE.PlaneGeometry(this.W, this.H, 28, 8);
    // bowed toward the enemy, like a riot shield
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / (this.W / 2); pos.setZ(i, this.sag * (1 - x * x)); }
    g.computeVertexNormals();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0.35, 1.9, 2.6) }, uT: { value: 0 }, uDeploy: { value: 0 }, uFade: { value: 1 }, uHealth: { value: 1 }, uAspect: { value: this.W / this.H },
        uHits: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 0, 1, 0)) },
      },
      vertexShader: BARRIER_VERT, fragmentShader: BARRIER_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.copy(this.c);
    this.mesh.lookAt(_v.copy(this.c).add(this.n));
    this.mesh.renderOrder = 8;
    this.w.scene.add(this.mesh);
    this.hitIdx = 0;
    // emitter line along the ground and a flash where it springs up
    const base = _v.copy(this.c); base.y -= this.H / 2 - 0.05;
    this.fx.glow(base, { color: CYAN, size: 3, life: 0.25 });
    this.fx.lights.flash(this.c, 0x5ee8ff, 18, 12, 0.3);
    for (let i = 0; i < 26; i++) {
      const u = rand(-0.5, 0.5);
      const p = _w.copy(base).addScaledVector(this.r, u * this.W);
      this.fx.add.spawn({ p, v: [rand(-0.5, 0.5), rand(2, 7), rand(-0.5, 0.5)], life: rand(0.3, 0.7), size: rand(0.05, 0.1), size1: 0.01, color: CYAN, color1: [0.3, 1.5, 2.5, 0], shape: SHAPE.SPARK });
    }
  }
  /** where segment a->b crosses the wall (t in 0..1), or -1 */
  segT(a, b) {
    const da = _u.subVectors(a, this.c).dot(this.n), db = _w.subVectors(b, this.c).dot(this.n);
    if ((da > 0) === (db > 0) || Math.abs(da - db) < 1e-6) return -1;
    const t = da / (da - db);
    const p = _v.copy(a).lerp(b, t).sub(this.c);
    if (Math.abs(p.dot(this.r)) > this.W / 2 || Math.abs(p.y) > this.H / 2) return -1;
    return t;
  }
  normalAt(from) { return _u.subVectors(from, this.c).dot(this.n) >= 0 ? this.n.clone() : this.n.clone().negate(); }
  hit(point, amount, src) {
    if (!this.alive) return;
    // (the owner is credited with what the wall actually soaked, not the overkill of the breaking hit)
    const took = Math.min(amount, Math.max(0, this.hp));
    this.hp -= amount;
    if (src && src !== this.owner && this.owner) { this.owner.ult = Math.min(this.owner.def.ultCost, this.owner.ult + took * RULES.ultPerShield); this.owner.healingDone += took; }
    const d = _v.subVectors(point, this.c);
    const h = this.mat.uniforms.uHits.value[this.hitIdx++ % 6];
    h.set(d.dot(this.r) / this.W + 0.5, d.y / this.H + 0.5, 0, clamp(amount / 40, 0.4, 1.6));
    this.fx.glow(point, { color: CYAN, size: clamp(amount / 30, 0.5, 1.8), life: 0.1 });
    if (amount > 20) this.fx.sparks(point, this.normalAt(src ? (src.center || src.pos) : point), { n: 5, color: CYAN, speed: 7, life: 0.25, size: 0.05 });
    this.w.sfx('barrier_hit', point, { vol: clamp(amount / 60, 0.25, 0.8), minGap: 0.05 });
    if (this.hp <= 0) this.shatter();
  }
  shatter() {
    this.alive = false; this.endT = 0.12;
    this.w.sfx('barrier_break', this.c, { vol: 0.95 });
    this.fx.lights.flash(this.c, 0x5ee8ff, 30, 14, 0.25);
    for (let i = 0; i < 70; i++) {
      const p = _v.copy(this.c).addScaledVector(this.r, rand(-0.5, 0.5) * this.W); p.y += rand(-0.5, 0.5) * this.H;
      this.fx.add.spawn({ p, v: [rand(-3, 3) + this.n.x * rand(-4, 4), rand(-1, 4), rand(-3, 3) + this.n.z * rand(-4, 4)], life: rand(0.4, 0.9), size: rand(0.08, 0.2), size1: 0.02, color: CYAN, color1: [0.3, 1.4, 2.4, 0], shape: SHAPE.SHARD, grav: 9 });
    }
  }
  update(dt) {
    this.t += dt;
    const u = this.mat.uniforms;
    u.uT.value = this.t;
    u.uDeploy.value = ease.out3(clamp01(this.t / 0.3));
    u.uHealth.value = clamp01(this.hp / this.maxHp);
    for (const h of u.uHits.value) if (h.z < 1) h.z += dt * 2.2;
    if (this.alive && this.t > this.life) { this.alive = false; this.endT = 0.35; }
    if (!this.alive) {
      this.fade -= dt / this.endT;
      u.uFade.value = Math.max(0, this.fade);
      if (this.fade <= 0) { this.dispose(); return false; }
    }
    return true;
  }
  dispose() { if (this.mesh.parent) { this.w.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); } this.alive = false; }
}

// ------------------------------------------------------------------ repair drone
function droneMesh(fx) {
  if (!fx._droneGeo) {
    const body = new THREE.IcosahedronGeometry(0.16, 1); body.scale(1, 0.55, 1.2);
    fx._droneGeo = { body, ring: new THREE.TorusGeometry(0.24, 0.022, 6, 28), eye: new THREE.SphereGeometry(0.05, 10, 6) };
    fx._droneGeo.ring.rotateX(Math.PI / 2);
    fx._droneMat = {
      body: new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.55, roughness: 0.35 }),
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 3.4) }),
    };
    fx._droneMat.body.userData.shared = fx._droneMat.ring.userData.shared = true;
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(fx._droneGeo.body, fx._droneMat.body));
  const ring = new THREE.Mesh(fx._droneGeo.ring, fx._droneMat.ring); g.add(ring);
  const eye = new THREE.Mesh(fx._droneGeo.eye, fx._droneMat.ring); eye.position.set(0, 0, 0.17); g.add(eye);
  g.userData.ring = ring;
  return g;
}

class RepairDrone {
  constructor(kit, target, i) {
    this.kit = kit; this.w = kit.w; this.fx = kit.fx; this.h = kit.h; this.target = target; this.i = i;
    this.mesh = droneMesh(this.fx);
    this.from = kit.podPos(i % 2 ? 'L' : 'R', new THREE.Vector3());
    this.mesh.position.copy(this.from);
    this.w.scene.add(this.mesh);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.4, 2.8), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false; this.beam.renderOrder = 9;
    this.w.scene.add(this.beam);
    this.trail = this.fx.trail({ color: 0x5ee8ff, intensity: 2, width: 0.06, life: 0.25, max: 16, minDist: 0.12 });
    this.phase = 'fly'; this.t = 0; this.heal = 4; this.acc = 0; this.tick = 0;
    this.orbit = i * TAU / 3;
  }
  /** hover spot beside the patient's shoulder */
  spot(out) {
    const a = this.target, t = this.w.time * 1.6 + this.orbit;
    return out.copy(a.center || a.pos).add(_w.set(Math.cos(t) * 0.75, a.height * 0.42 + Math.sin(this.w.time * 3 + this.i) * 0.06, Math.sin(t) * 0.75));
  }
  retarget() {
    let best = null, bf = 2;
    for (const a of this.w.alliesOf(this.h, true)) {
      const d = a.pos.distanceTo(this.mesh.position);
      if (d < 30 && a.hp / a.maxHp < bf) { bf = a.hp / a.maxHp; best = a; }
    }
    return best;
  }
  update(dt) {
    this.t += dt;
    const m = this.mesh, a = this.target;
    m.userData.ring.rotation.y += dt * 9;
    if (this.phase !== 'leave' && (!a || a.dead)) {
      this.target = this.retarget();
      if (!this.target) { this.phase = 'leave'; this.t = 0; }
      else if (this.phase === 'heal') { this.phase = 'fly'; this.t = 0; this.from = m.position.clone(); }
    }
    if (this.phase === 'fly') {
      // arc out of the pod and swing in to the patient
      const k = clamp01(this.t / 0.45), e = ease.inout(k);
      const to = this.spot(_v);
      m.position.lerpVectors(this.from, to, e);
      m.position.y += Math.sin(k * Math.PI) * 1.2;
      if (k >= 1) { this.phase = 'heal'; this.t = 0; this.w.sfx('drone_heal', to, { vol: 0.45 }); }
    } else if (this.phase === 'heal') {
      m.position.lerp(this.spot(_v), dampT(10, dt));
      const tgt = this.target;
      const amt = Math.min(25 * dt, this.heal * 25);
      this.heal -= dt;
      this.acc += amt;
      this.tick -= dt;
      if (this.tick <= 0) { this.tick = 0.5; this.w.heal(this.h, tgt, this.acc); this.acc = 0; }
      tgt.status.dr = Math.max(tgt.status.dr, 0.15); tgt.status.drT = Math.max(tgt.status.drT, 0.15);
      // repair beam to the chest
      const c = tgt.chestPos(_w);
      const d = _u.subVectors(c, m.position), len = d.length();
      this.beam.visible = len > 0.05;
      this.beam.position.copy(m.position).addScaledVector(d, 0.5);
      this.beam.quaternion.setFromUnitVectors(UP, d.normalize());
      this.beam.scale.set(0.018 + Math.sin(this.t * 30) * 0.006, len, 0.018);
      this.beam.material.opacity = 0.55 + Math.sin(this.t * 22) * 0.2;
      if (Math.random() < dt * 14) this.fx.add.spawn({ p: [c.x + rand(-0.3, 0.3), c.y + rand(-0.5, 0.4), c.z + rand(-0.3, 0.3)], v: [0, rand(0.6, 1.6), 0], life: 0.55, size: 0.1, size1: 0.02, color: [0.9, 3.2, 2.2, 1], color1: [0.6, 3, 1.6, 0], shape: SHAPE.STAR });
      if (this.heal <= 0) { if (this.acc > 0) this.w.heal(this.h, tgt, this.acc); this.phase = 'leave'; this.t = 0; }
    } else {
      this.beam.visible = false;
      m.position.y += dt * 4;
      m.scale.setScalar(Math.max(0.01, 1 - this.t / 0.4));
      if (this.t > 0.4) { this.dispose(); return false; }
    }
    this.trail.push(m.position);
    if (Math.random() < 0.5) this.fx.add.spawn({ p: m.position, life: 0.06, size: 0.3, size1: 0.1, color: [0.5, 2.4, 3, 0.6], color1: [0.3, 1.5, 2.5, 0], shape: SHAPE.GLOW });
    return true;
  }
  dispose() {
    this.trail.stop();
    this.w.scene.remove(this.mesh); this.w.scene.remove(this.beam);
    this.beam.geometry.dispose(); this.beam.material.dispose();
  }
}

// ------------------------------------------------------------------ override wave (ult)
const WAVE_VERT = /* glsl */`
  varying vec2 vUv; varying float vDist;
  void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`;
const WAVE_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uO, uT;
  varying vec2 vUv; varying float vDist;
  void main() {
    float h = vUv.y;
    // thin scan lines: vertical every few degrees, horizontal ones racing up the wall
    float grid = smoothstep(0.012, 0.0, abs(fract(vUv.x * 120.0) - 0.5) - 0.48) * 0.5 + smoothstep(0.03, 0.0, abs(fract(h * 5.0 - uT * 3.0) - 0.5) - 0.47) * 0.6;
    float a = (pow(1.0 - h, 3.0) * 0.12 + grid * (1.0 - h) * 0.45 + smoothstep(0.05, 0.0, h) * 0.5) * uO;
    // a wall sweeping past the camera mustn't fill the screen
    a *= smoothstep(1.5, 8.0, vDist);
    gl_FragColor = vec4(uColor * a, a);
  }`;

/** EMP lock on an enemy: no abilities or flight for `dur`, with sparks crawling over the body */
function disrupt(kit, e, dur, color = EMP) {
  const fresh = !(e.status.disruptT > 0);
  e.status.disruptT = Math.max(e.status.disruptT, dur);
  if (!fresh) return;
  const fx = kit.fx;
  fx.every((dt) => {
    if (e.dead || e.status.disruptT <= 0) return false;
    if (Math.random() < dt * 26) {
      const p = _v.copy(e.capA).lerp(e.capB, Math.random()).add(_w.set(rand(-0.3, 0.3), rand(-0.2, 0.2), rand(-0.3, 0.3)));
      fx.add.spawn({ p, v: [rand(-2, 2), rand(-1, 2), rand(-2, 2)], life: rand(0.08, 0.2), size: rand(0.04, 0.09), size1: 0.01, color, color1: [1, 1.5, 3, 0], shape: SHAPE.SPARK });
    }
    if (Math.random() < dt * 4) {
      // a little arc jumping across the body
      const tr = fx.trail({ color: color === EMP ? 0x7fb8ff : 0xff5a3c, intensity: 3, width: 0.03, life: 0.08, max: 8, minDist: 0.01 });
      const a = _v.copy(e.capA).lerp(e.capB, Math.random()), b = _w.copy(e.capA).lerp(e.capB, Math.random());
      for (let i = 0; i <= 5; i++) { _u.lerpVectors(a, b, i / 5); _u.x += rand(-0.25, 0.25); _u.z += rand(-0.25, 0.25); tr.push(_u); }
      tr.stop();
    }
    return true;
  });
  if (e.isPlayer) { kit.w.renderer.flash(color === EMP ? 0x88bbff : 0xff6a50, 0.18); kit.w.renderer.fx.ca = Math.max(kit.w.renderer.fx.ca, 0.012); }
}

/** a jagged electric arc from a to b */
function zap(fx, a, b, color = 0x7fb8ff, width = 0.06) {
  const tr = fx.trail({ color, intensity: 3.2, width, life: 0.16, max: 14, minDist: 0.01 });
  const d = a.distanceTo(b);
  for (let i = 0; i <= 10; i++) {
    _u.lerpVectors(a, b, i / 10);
    if (i > 0 && i < 10) _u.add(_w.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(d * 0.06));
    tr.push(_u);
  }
  tr.stop();
}

// ------------------------------------------------------------------ the kit
export class RobotKit extends Kit {
  constructor(h) {
    super(h);
    this.clips = ROBOT_CLIPS;
    this.fireT = 0; this.hand = 0; this.burst = 0; this.firing = 0; this.stance = null;
    this.recoil = { L: new Spring(0, 8, 0.45), R: new Spring(0, 8, 0.45) };
    this.ultState = null;
    this.drones = [];
    this.uplinkT = 0;
    // the extra bones: back pods (tilt open to fire), chest panel (slides open for the ult)
    this.bones = {};
    for (const n of ['left_launcher_low_r', 'left_launcher_low_l', 'spine_04_chest_panel']) {
      const b = h.rig.bones.get(n);
      if (b) this.bones[n] = { b, p: b.position.clone(), q: b.quaternion.clone() };
    }
    this.pod = 0; this.podT = 0; this.chest = 0; this.chestT = 0;
    this.bike = new Hoverbike(this);
  }
  get busy() { return this.busyT > 0 || !!this.h.override; }

  /** every frame, even while stunned, carried or dead */
  tick(dt) {
    const h = this.h, w = this.w;
    this.bike.update(dt, h.mode === 'fly' && !h.dead && !h.carriedBy);
    // deployed drones carry on whatever happens to Robot
    this.drones = this.drones.filter((d) => d.update(dt));
    // Tactical Uplink: allies near Robot recharge their abilities faster
    if (!h.dead) for (const a of w.heroes) if (a.team === h.team && !a.dead && a.pos.distanceToSquared(h.pos) < RULES.uplinkRange * RULES.uplinkRange) a.status.uplinkT = Math.max(a.status.uplinkT, 0.15);
    // pods and chest panel ease open and shut
    this.podT -= dt; this.chestT -= dt;
    this.pod = damp(this.pod, this.podT > 0 && !h.dead ? 1 : 0, this.podT > 0 ? 22 : 9, dt);
    this.chest = damp(this.chest, this.chestT > 0 && !h.dead ? 1 : 0, this.chestT > 0 ? 14 : 6, dt);
    for (const side of ['left_launcher_low_r', 'left_launcher_low_l']) {
      const B = this.bones[side]; if (!B) continue;
      B.b.quaternion.copy(B.q).multiply(_q.setFromAxisAngle(X_AXIS, this.pod * 0.75));
    }
    const C = this.bones.spine_04_chest_panel;
    if (C) C.b.position.copy(C.p).add(_v.set(0, 0, this.chest * 0.03));
  }

  update(dt, it) {
    super.update(dt);
    const h = this.h, w = this.w;
    // recoil additive on the cannon arms
    for (const s of ['L', 'R']) {
      const r = this.recoil[s].update(dt, 0);
      const av = h.anim.additive.v;
      av[CH[s + 'elbow']] += r * 26; av[CH[s + 'clavFwd']] += -r * 8; av[CH[s + 'handFlex']] += r * 14;
      av[CH[s + 'ikZ']] += -r * 0.1;
    }
    if (this.ultState) { this.ultUpdate(dt); return; }
    if (h.override) return;
    if (it.ult && this.ultOk()) return this.tacticalOverride();
    if (it.a1 && this.ready('a1') && this.free) return this.barrier(it);
    if (it.a2 && this.ready('a2') && this.free) return this.emp(it);
    if (it.a3 && this.ready('a3') && this.free) return this.repair(it);
    if (it.secondaryPressed && this.ready('secondary') && this.free) return this.missiles(it);
    if (it.primary && this.free) {
      this.firing = 0.25;
      if (!this.stance || this.stance.ending) this.stance = h.anim.play(this.clips.cannonStance, { hold: true });
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT += 1 / 8; this.fireCannon(it); }
    } else {
      this.fireT = Math.max(0, this.fireT - dt);
      this.firing -= dt;
      if (this.firing <= 0) this.burst = 0;
      if (this.stance && this.firing <= 0) { h.anim.stop(0.25); this.stance = null; }
    }
  }

  /** muzzle of a wrist cannon (just past the wrist, along the aim) */
  muzzle(side, out) {
    this.h.bonePos(side === 'L' ? 'handL' : 'handR', out);
    return out.addScaledVector(this.h.aimDir, 0.16);
  }
  /** mouth of a back pod */
  podPos(side, out) {
    const h = this.h, B = this.bones[side === 'L' ? 'left_launcher_low_l' : 'left_launcher_low_r'];
    if (B) B.b.getWorldPosition(out); else h.chestPos(out);
    // the two pods sit either side of the spine, a little above the bone
    const right = _w.set(Math.cos(h.visYaw), 0, -Math.sin(h.visYaw)).multiplyScalar(-1);
    return out.addScaledVector(right, side === 'L' ? -0.14 : 0.14).addScaledVector(h.bodyUp, 0.12).addScaledVector(_u.set(Math.sin(h.visYaw), 0, Math.cos(h.visYaw)), -0.12);
  }

  // ---------------- LMB: wrist cannons ----------------
  fireCannon(it) {
    const h = this.h, w = this.w, fx = this.fx;
    const side = this.hand++ % 2 === 0 ? 'R' : 'L';
    this.recoil[side].v += 10;
    const o = this.muzzle(side, new THREE.Vector3());
    const dir = _v.subVectors(it.aimPoint, o).normalize().clone();
    if (dir.dot(h.aimDir) < 0.6) dir.copy(h.aimDir);
    // a little spread builds up over a long burst
    const spread = Math.min(0.012, this.burst++ * 0.0008);
    dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread); dir.normalize();
    w.sfx('plasma_fire', o, { vol: 0.42 });
    fx.glow(o, { color: AMBER, size: 0.55, life: 0.07 });
    fx.sparks(o, dir, { n: 3, color: AMBER, speed: 9, life: 0.12, size: 0.04, grav: 0 });
    const tr = fx.trail({ color: 0xffa040, intensity: 3, width: 0.11, life: 0.12, max: 10, minDist: 0.25 });
    w.spawnProjectile({
      owner: h, pos: o, vel: dir.clone().multiplyScalar(140), radius: 0.1, life: 1.2, dmg: 17,
      onUpdate: (dt, p) => { tr.push(p); fx.add.spawn({ p, life: 0.08, size: 0.45, size1: 0.16, color: [4, 2.4, 0.9, 0.9], color1: [3, 1, 0.2, 0], shape: SHAPE.GLOW }); },
      onHitHero: (e, p) => { w.damage(h, e, 17, { hitPos: p.clone(), power: 0.3, type: 'proj' }); return true; },
      onEnd: (proj, hero, hit) => {
        tr.stop();
        const p = proj.pos;
        fx.glow(p, { color: AMBER, size: 0.75, life: 0.1 });
        fx.sparks(p, hit && hit.normal ? hit.normal : dir.clone().negate(), { n: 6, color: AMBER, speed: 8, life: 0.25, size: 0.05 });
        w.sfx('plasma_hit', p, { vol: 0.32, minGap: 0.03 });
      },
    });
  }

  // ---------------- RMB: micro-missiles ----------------
  missiles(it) {
    const h = this.h, w = this.w;
    this.use('secondary');
    this.busyT = 0.3;
    const target = it.aimHero && it.aimHero.team !== h.team ? it.aimHero : this.aimTarget(70, 0.25);
    const goal = it.aimPoint.clone();
    this.podT = 0.95;
    w.sfx('pod_open', h.center, { vol: 0.6 });
    h.anim.play(this.clips.salvo, {
      onEvent: (e) => {
        if (e !== 'fire' || h.dead) return;
        let i = 0, t = 0;
        this.fx.every((dt) => {
          if (h.dead) return false;
          t += dt;
          while (i < 8 && t >= i * 0.055) this.launchMissile(i++, target, goal);
          return i < 8;
        });
      },
    });
  }
  launchMissile(i, target, goal) {
    const h = this.h, w = this.w, fx = this.fx, kit = this;
    const side = i % 2 ? 'L' : 'R';
    const o = this.podPos(side, new THREE.Vector3());
    const right = _w.set(Math.cos(h.visYaw), 0, -Math.sin(h.visYaw)).negate();
    const vel = h.bodyUp.clone().multiplyScalar(rand(8, 11)).addScaledVector(right, (side === 'R' ? 1 : -1) * rand(2.5, 5)).addScaledVector(h.aimDir, 5);
    if (!fx._missileGeo) { fx._missileGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.34, 8); fx._missileGeo.rotateX(Math.PI / 2); fx._missileMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd4, metalness: 0.5, roughness: 0.4 }); }
    const mesh = new THREE.Mesh(fx._missileGeo, fx._missileMat);
    mesh.position.copy(o);
    w.scene.add(mesh);
    const smoke = fx.trail({ color: 0xc8c4be, intensity: 0.75, width: 0.16, life: 0.5, max: 28, minDist: 0.25, additive: false });
    const wob = rand(0, TAU);
    let age = 0;
    fx.glow(o, { color: AMBER, size: 0.5, life: 0.08 });
    w.sfx('missile_launch', o, { vol: 0.55, minGap: 0.03 });
    w.spawnProjectile({
      owner: h, pos: o, vel, radius: 0.16, life: 2.8, dmg: 14,
      onUpdate: (dt, p, proj) => {
        age += dt;
        const aimAt = target && target.targetable ? target.center : goal;
        const want = _v.subVectors(aimAt, p);
        const dist = want.length();
        want.normalize();
        // a corkscrew that tightens as it closes in
        const sw = Math.min(1, dist / 12) * 0.35;
        want.add(_u.set(Math.cos(age * 14 + wob), Math.sin(age * 14 + wob), 0).multiplyScalar(sw)).normalize();
        const sp = Math.min(58, proj.vel.length() + 110 * dt);
        proj.vel.lerp(want.multiplyScalar(sp), dampT(age < 0.12 ? 2 : 8, dt)).setLength(sp);
        mesh.position.copy(p);
        mesh.quaternion.setFromUnitVectors(FWD, _u.copy(proj.vel).normalize());
        smoke.push(p);
        fx.add.spawn({ p: _w.copy(p).addScaledVector(_u, -0.22), life: 0.05, size: 0.24, size1: 0.08, color: [4, 2.2, 0.7, 0.9], color1: [3, 0.6, 0.1, 0], shape: SHAPE.GLOW });
      },
      onHitHero: (e, p) => { w.damage(h, e, 14, { hitPos: p.clone(), power: 0.3, type: 'proj' }); return true; },
      onEnd: (proj, hero) => {
        smoke.stop();
        w.scene.remove(mesh);
        const p = proj.pos.clone();
        for (const e of w.inSphere(p, 2.5, kit.enemyFilter())) if (e !== hero) w.damage(h, e, 12, { from: p, noFlinch: true, power: 0.15, type: 'proj' });
        fx.glow(p, { color: [4, 2, 0.6, 1], size: 1.6, life: 0.12 });
        fx.sparks(p, UP, { n: 8, color: AMBER, speed: 9, life: 0.35, size: 0.06 });
        fx.smoke(p, { n: 3, size: 0.6, size1: 1.8, speed: 2.5, life: 0.9, color: [0.4, 0.38, 0.36, 0.4] });
        if (i % 3 === 0) fx.lights.flash(p, 0xff9a40, 14, 8, 0.12);
        w.sfx('missile_boom', p, { vol: 0.45, minGap: 0.04 });
      },
    });
  }

  // ---------------- SHIFT: hard-light barrier ----------------
  barrier(it) {
    const h = this.h, w = this.w;
    this.use('a1');
    this.busyT = 0.3;
    h.anim.play(this.clips.barrierCast, {
      onEvent: (e) => {
        if (e !== 'cast' || h.dead) return;
        const fwd = _v.set(h.aimDir.x, 0, h.aimDir.z);
        if (fwd.lengthSq() < 1e-4) fwd.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
        fwd.normalize();
        const c = h.pos.clone().addScaledVector(fwd, 4);
        const gy = w.groundAt(c.x, c.z);
        // on the ground, or at the flier's height when there's air under it
        c.y = h.pos.y - gy > 2.5 ? h.center.y : gy + 2.1;
        const b = new HardLight(this, c, fwd);
        w.barriers.push(b);
        w.sfx('barrier_up', c, { vol: 0.9 });
        // a line of light from the palm to the wall
        const o = this.muzzle('R', new THREE.Vector3());
        const tr = this.fx.trail({ color: 0x5ee8ff, intensity: 3, width: 0.1, life: 0.22, max: 10, minDist: 0.01 });
        for (let i = 0; i <= 8; i++) tr.push(_w.lerpVectors(o, c, i / 8));
        tr.stop();
      },
    });
  }

  // ---------------- E: EMP disruptor ----------------
  emp(it) {
    const h = this.h, w = this.w, fx = this.fx;
    this.use('a2');
    this.busyT = 0.28;
    h.anim.play(this.clips.empThrow, {
      onEvent: (e) => {
        if (e !== 'throw' || h.dead) return;
        const o = this.muzzle('R', new THREE.Vector3());
        const dir = h.aimDir.clone(); dir.y += 0.16; dir.normalize();
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 2.4, 4.4) }));
        core.position.copy(o); w.scene.add(core);
        const tr = fx.trail({ color: 0x7fb8ff, intensity: 2.4, width: 0.12, life: 0.3, max: 20, minDist: 0.15 });
        w.sfx('emp_throw', o, { vol: 0.6 });
        let age = 0;
        w.spawnProjectile({
          owner: h, pos: o, vel: dir.multiplyScalar(30), radius: 0.22, gravity: 18, life: 2.2, dmg: 40,
          onUpdate: (dt, p) => {
            age += dt;
            core.position.copy(p); core.rotation.x += dt * 9; core.rotation.y += dt * 7;
            tr.push(p);
            // blinking charge light
            if (Math.floor(age * 12) % 2 === 0) fx.add.spawn({ p, life: 0.05, size: 0.5, size1: 0.3, color: EMP, color1: [1, 1.6, 3.4, 0], shape: SHAPE.GLOW });
            if (Math.random() < 0.4) fx.add.spawn({ p, v: [rand(-2, 2), rand(-2, 2), rand(-2, 2)], life: 0.12, size: 0.04, size1: 0.01, color: EMP, color1: [1, 1.5, 3, 0], shape: SHAPE.SPARK });
          },
          onHitHero: () => true,
          onEnd: (proj) => { tr.stop(); w.scene.remove(core); core.geometry.dispose(); core.material.dispose(); this.empBlast(proj.pos.clone()); },
        });
      },
    });
  }
  empBlast(p) {
    const h = this.h, w = this.w, fx = this.fx;
    fx.sphere(p, { color: 0x6aa8ff, intensity: 1.8, r0: 0.4, r1: 7.4, life: 0.4, fresnel: 1.6 });
    fx.ring(p, { color: 0x7fb8ff, intensity: 2, r1: 8, life: 0.45, soft: 0.25 });
    fx.glow(p, { color: EMP, size: 4, life: 0.16 });
    fx.sparks(p, UP, { n: 30, color: EMP, speed: 16, life: 0.45, size: 0.06, spread: 1.4 });
    fx.lights.flash(p, 0x7fb8ff, 36, 16, 0.3);
    w.renderer.addWave(p, { strength: 0.05, life: 0.45, speed: 2.4 });
    w.shakeAt(p, 0.35);
    w.sfx('emp_blast', p, { vol: 1 });
    for (let i = 0; i < 6; i++) zap(fx, p, _v.copy(p).add(_w.set(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 6.5))));
    for (const e of w.inSphere(p, 7, this.enemyFilter())) {
      // a barrier between the blast and the target soaks the whole effect
      if (w.barrierHit(p, e.center, h.team)) { w.damage(h, e, 40, { from: p, power: 0.6, type: 'ability' }); continue; }
      zap(fx, p, e.center, 0x9cc8ff, 0.09);
      w.damage(h, e, 40, { from: p, power: 0.6, type: 'ability' });
      if (e.dead) continue;
      if (e.bubble) { e.bubble.fx && e.bubble.fx.pop(true); e.bubble = null; w.sfx('bubble_break', e.center, { vol: 0.7 }); }
      e.overhealth = 0;
      disrupt(this, e, 2);
    }
  }

  // ---------------- F: repair drones ----------------
  repair(it) {
    const h = this.h, w = this.w;
    this.use('a3');
    this.busyT = 0.3;
    this.podT = 0.6;
    h.anim.play(this.clips.dronesCast, {
      onEvent: (e) => {
        if (e !== 'launch' || h.dead) return;
        // the hurt allies in reach, most hurt first; with fewer than three, the worst get two
        const near = w.alliesOf(h, true).filter((a) => a.pos.distanceTo(h.pos) < 25).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        const hurt = near.filter((a) => a.hp < a.maxHp - 1);
        const pick = hurt.length ? hurt : near;
        for (let i = 0; i < 3; i++) this.drones.push(new RepairDrone(this, pick[i % pick.length] || h, i));
        w.sfx('drone_launch', h.center, { vol: 0.8 });
      },
    });
  }

  // ---------------- Q: TACTICAL OVERRIDE ----------------
  tacticalOverride() {
    const h = this.h, w = this.w, kit = this;
    h.ult = 0;
    w.emit('ult', { hero: h, name: 'TACTICAL OVERRIDE' });
    this.ultState = { t: 0, waved: false };
    h.invuln = 0.9;
    this.chestT = 1.2;
    w.sfx('override', h.center, { vol: 1, important: true });
    h.glowTarget = 0.14; h.U.uGlowColor.value.setRGB(0.3, 0.9, 1.0);
    h.anim.play(this.clips.override, { onEvent: (e) => { if (e === 'wave' && !h.dead) this.overrideWave(); } });
    const flying = h.mode === 'fly';
    h.override = {
      faceAim: true, animMode: flying ? 'fly' : 'ground', animVel: new THREE.Vector3(), t: 0,
      update(dt) {
        this.t += dt;
        if (!kit.ultState) return false;
        h.vel.x = damp(h.vel.x, 0, 8, dt); h.vel.z = damp(h.vel.z, 0, 8, dt);
        if (flying) { h.vel.y = damp(h.vel.y, 0, 8, dt); h.mode = 'fly'; } else h.vel.y -= 28 * dt;
        h.integrate(dt);
        // gathering energy
        if (!kit.ultState.waved) for (let i = 0; i < 3; i++) {
          const a = this.t * 7 + i * TAU / 3, r = 1.6 - this.t;
          kit.fx.add.spawn({ p: [h.center.x + Math.cos(a) * r, h.center.y + rand(-0.6, 0.8), h.center.z + Math.sin(a) * r], v: [0, rand(0.5, 1.5), 0], life: 0.3, size: 0.07, size1: 0.01, color: CYAN, color1: [0.3, 1.5, 2.5, 0], shape: SHAPE.SPARK });
        }
        return true;
      },
    };
  }
  ultUpdate(dt) {
    const st = this.ultState, h = this.h;
    st.t += dt;
    if (h.dead || st.t > 1.25) this.endUlt();
  }
  overrideWave() {
    const h = this.h, w = this.w, fx = this.fx;
    const c = h.pos.clone(); c.y = Math.max(c.y, w.groundAt(c.x, c.z));
    this.ultState.waved = true;
    w.sfx('override_wave', h.center, { vol: 1, important: true });
    w.renderer.flash(0x7fe8ff, 0.12);
    w.renderer.addWave(h.center, { strength: 0.08, life: 0.8, speed: 1.6 });
    w.shakeAt(c, 0.45);
    fx.glow(h.center, { color: CYAN, size: 3, life: 0.18 });
    fx.lights.flash(h.center, 0x5ee8ff, 30, 30, 0.45);
    // the scan wall: an open cylinder with a grid, racing out across the arena
    const R = 35;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.4, 2.2, 3) }, uO: { value: 1 }, uT: { value: 0 } },
      vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    wall.geometry.translate(0, 0.5, 0);
    wall.position.copy(c);
    wall.renderOrder = 8;
    w.scene.add(wall);
    fx.ring(c, { color: 0x5ee8ff, intensity: 1.2, r0: 0.5, r1: R, life: 0.9, soft: 0.12 });
    const hit = new Set();
    let wt = 0;
    const kit = this;
    fx.items.push({
      update(dt) {
        wt += dt;
        const r = Math.min(R, 0.5 + wt * 45), fade = clamp01(1 - (wt - 0.55) / 0.4);
        wall.scale.set(r, 3.2 * (1 - wt * 0.3), r);
        wall.material.uniforms.uO.value = fade;
        wall.material.uniforms.uT.value = wt;
        for (const e of w.heroes) {
          if (hit.has(e) || e.dead) continue;
          if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > r + e.radius) continue;
          hit.add(e);
          if (e.team === h.team) kit.overclock(e);
          else if (e.targetable) kit.overridden(e);
        }
        return fade > 0;
      },
      dispose(scene) { scene.remove(wall); wall.geometry.dispose(); wall.material.dispose(); },
    });
  }
  overridden(e) {
    const h = this.h, w = this.w, fx = this.fx;
    w.damage(h, e, 20, { from: e.center, power: 0.5, type: 'ult' });
    if (e.dead) return;
    disrupt(this, e, 3, RED);
    e.status.vuln = Math.max(e.status.vuln, 0.2); e.status.vulnT = Math.max(e.status.vulnT, 3);
    fx.glow(e.center, { color: RED, size: 2.2, life: 0.15 });
    fx.ring(_v.copy(e.pos).setY(e.pos.y + 0.06), { color: 0xff5a3c, intensity: 1.8, r0: 0.3, r1: 2.2, life: 0.5, soft: 0.2 });
    zap(fx, _v.copy(e.center).add(_w.set(0, 1.6, 0)), e.center, 0xff6a50, 0.07);
    w.sfx('override_hit', e.center, { vol: 0.7, minGap: 0.04 });
  }
  overclock(a) {
    const w = this.w, fx = this.fx;
    for (const k in a.cd) a.cd[k] = 0;
    const ab = a.def.abilities; for (const k in ab) if (ab[k].charges) a.charges[k] = ab[k].charges;
    a.status.boost = Math.max(a.status.boost, 0.2); a.status.boostT = Math.max(a.status.boostT, 6);
    a.status.haste = Math.max(a.status.haste, 0.2); a.status.hasteT = Math.max(a.status.hasteT, 6);
    fx.ring(_v.copy(a.pos).setY(a.pos.y + 0.06), { color: 0xffc040, intensity: 1.8, r0: 0.3, r1: 2.6, life: 0.55, soft: 0.25 });
    fx.converge(a.center, { n: 20, radius: 2, color: GOLD, life: 0.3 });
    w.sfx('overclock', a.center, { vol: 0.7, ui: a.isPlayer, minGap: 0.04 });
    if (a.isPlayer) w.renderer.flash(0xffd070, 0.18);
    // golden sparks rising off the body for as long as it lasts
    fx.every((dt) => {
      if (a.dead || a.status.hasteT <= 0) return false;
      if (Math.random() < dt * 18) {
        const p = _v.copy(a.capA).lerp(a.capB, Math.random()).add(_w.set(rand(-0.35, 0.35), 0, rand(-0.35, 0.35)));
        fx.add.spawn({ p, v: [0, rand(1.5, 3.5), 0], life: rand(0.3, 0.6), size: rand(0.05, 0.1), size1: 0.01, color: GOLD, color1: [3, 1.6, 0.3, 0], shape: SHAPE.SPARK });
      }
      return true;
    });
  }
  endUlt() {
    const h = this.h;
    if (!this.ultState) return;
    this.ultState = null;
    h.glowTarget = 0;
    if (h.override) { const o = h.override; h.override = null; o.onEnd && o.onEnd(); }
  }

  onDeath() {
    if (this.ultState) this.endUlt();
    if (this.stance) { this.stance = null; this.firing = 0; }
  }
  dispose() {
    if (this.ultState) this.endUlt();
    for (const d of this.drones) d.dispose();
    this.drones = [];
    // swapped out: his walls go with him
    for (const b of this.w.barriers) if (b.owner === this.h) b.dispose();
    this.w.barriers = this.w.barriers.filter((b) => b.owner !== this.h);
    this.bike.dispose();
    this.h.anim.rideGrip = null;
  }
}
