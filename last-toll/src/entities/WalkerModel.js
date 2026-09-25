import * as THREE from 'three';
import { Batcher } from '../world/Batcher.js';

// Articulated low-poly walker built from boxes sharing one geometry.
// Local forward is +Z. Bones are plain Groups so the AI can pose them directly,
// and hit volumes are read from marker objects in world space.

const WALKER_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

const SKIN = [0x8a9078, 0x7a8470, 0x9a9484, 0x6f7a66, 0x8a8070, 0x5f5a4e, 0x7c7462];
const SHIRT = [0x5a4a3a, 0x3a4a5a, 0x6a3a3a, 0x7a7a6a, 0x4a5a3a, 0x2a2a2a, 0x8a7a5a, 0x5a3a5a, 0x9a9a8a, 0x3a5a5a];
const PANTS = [0x2a3040, 0x3a3a34, 0x4a3a2a, 0x2a2a2a, 0x5a5448, 0x3a3a4a];
const BLOOD = 0x3a0606;
const HIDDEN = 0.0001;
const _p = new THREE.Vector3();

// Each walker is a single skinned mesh: every box is rigidly bound to one bone,
// so the whole body costs one draw call. Parts are hidden by scaling their bone to zero.
export class WalkerModel {
  constructor(rng, { riot = false, fresh = false } = {}) {
    const skin = rng.pick(SKIN);
    const shirt = riot ? 0x22262a : rng.pick(SHIRT);
    const pants = riot ? 0x1e2226 : rng.pick(PANTS);
    const dark = 0x151210;
    const eye = 0xd2d0b6;
    const armor = 0x0f1114;
    const bones = [];
    const parts = [];
    const bone = (parent, x, y, z) => {
      const b = new THREE.Bone();
      b.position.set(x, y, z);
      if (parent) parent.add(b);
      bones.push(b);
      return b;
    };
    const add = (b, list) => parts.push([b, list]);

    this.root = new THREE.Group();
    this.body = bone(null, 0, 0, 0);
    this.root.add(this.body);
    this.hips = bone(this.body, 0, 0.95, 0);
    add(this.hips, [[0, 0, 0, 0.36, 0.16, 0.2, pants]]);

    this.torso = bone(this.hips, 0, 0.06, 0);
    const girth = rng.range(0.92, 1.12);
    const tp = [[0, 0.28, 0, 0.4 * girth, 0.56, 0.22 * girth, shirt]];
    if (rng.chance(0.8)) tp.push([rng.range(-0.1, 0.1), rng.range(0.15, 0.45), 0.112 * girth, rng.range(0.1, 0.24), rng.range(0.1, 0.3), 0.01, BLOOD]);
    if (rng.chance(0.5)) tp.push([rng.range(-0.12, 0.12), rng.range(0.1, 0.4), 0.113 * girth, 0.08, 0.12, 0.012, skin]);
    if (riot) {
      tp.push([0, 0.3, 0, 0.44 * girth, 0.46, 0.27 * girth, armor]);
      tp.push([0, 0.36, 0.14 * girth, 0.2, 0.12, 0.01, 0xa8a8a0]);
    }
    add(this.torso, tp);

    this.neck = bone(this.torso, 0, 0.58, 0);
    this.headGroup = bone(this.neck, 0, 0, 0);
    const hp = [
      [0, 0.13, 0.01, 0.2, 0.25, 0.22, skin],
      [-0.05, 0.16, 0.115, 0.045, 0.03, 0.02, dark],
      [0.05, 0.16, 0.115, 0.045, 0.03, 0.02, dark],
      [-0.05, 0.16, 0.122, 0.022, 0.014, 0.01, eye],
      [0.05, 0.16, 0.122, 0.022, 0.014, 0.01, eye],
      [0, 0.26, -0.01, 0.21, 0.04, 0.23, rng.pick([0x2a2218, 0x4a3a2a, 0x6a6a60, 0x1a1a1a])],
    ];
    if (rng.chance(0.6)) hp.push([0, 0.02, 0.118, 0.1, 0.08, 0.01, BLOOD]);
    add(this.headGroup, hp);
    this.jaw = bone(this.headGroup, 0, 0.04, 0.02);
    add(this.jaw, [[0, -0.02, 0.03, 0.16, 0.05, 0.14, skin], [0, -0.005, 0.1, 0.12, 0.015, 0.012, 0x2a0404]]);
    this.helmetBone = null;
    if (riot) {
      this.helmetBone = bone(this.headGroup, 0, 0, 0);
      add(this.helmetBone, [[0, 0.16, -0.01, 0.26, 0.3, 0.27, 0x16181b], [0, 0.12, 0.13, 0.22, 0.16, 0.02, 0x8a9aa0]]);
    }
    this.helmet = this.helmetBone;
    this.headCenter = new THREE.Object3D();
    this.headCenter.position.set(0, 0.13, 0.01);
    this.headGroup.add(this.headCenter);
    this.stump = bone(this.neck, 0, 0, 0);
    add(this.stump, [[0, 0.02, 0, 0.12, 0.06, 0.12, 0x5a0a0a]]);

    const arm = (side) => {
      const sh = bone(this.torso, side * 0.25 * girth, 0.5, 0);
      add(sh, [[0, -0.15, 0, 0.09, 0.32, 0.1, rng.chance(0.4) ? skin : shirt]]);
      const el = bone(sh, 0, -0.31, 0);
      add(el, [[0, -0.14, 0, 0.08, 0.29, 0.08, skin], [0, -0.34, 0.01, 0.07, 0.1, 0.045, skin]]);
      const hand = new THREE.Object3D();
      hand.position.y = -0.3;
      el.add(hand);
      return { sh, el, hand };
    };
    this.armL = arm(-1);
    this.armR = arm(1);

    const leg = (side) => {
      const hip = bone(this.hips, side * 0.1, -0.04, 0);
      add(hip, [[0, -0.22, 0, 0.14, 0.44, 0.15, pants]]);
      const stump = bone(this.hips, side * 0.1, -0.04, 0);
      add(stump, [[0, -0.07, 0, 0.14, 0.14, 0.15, pants], [0, -0.15, 0, 0.12, 0.02, 0.13, 0x5a0a0a]]);
      const knee = bone(hip, 0, -0.44, 0);
      const kp = [[0, -0.21, 0, 0.12, 0.43, 0.13, pants], [0, -0.44, 0.04, 0.11, 0.07, 0.22, dark]];
      if (riot) kp.push([0, -0.05, 0.07, 0.13, 0.14, 0.03, armor]);
      add(knee, kp);
      const footPt = new THREE.Object3D();
      footPt.position.y = -0.44;
      knee.add(footPt);
      return { hip, knee, stump, footPt };
    };
    this.legL = leg(-1);
    this.legR = leg(1);

    // Bake every box into one geometry in the rest pose, bound to its bone.
    this.root.updateMatrixWorld(true);
    const b = new Batcher();
    const skinIndex = [];
    for (const [bn, list] of parts) {
      const start = b.vcount;
      for (const q of list) b.box(q[0], q[1], q[2], q[3], q[4], q[5], q[6], { jitter: 0, ao: 1 });
      const bi = bones.indexOf(bn);
      for (let v = start; v < b.vcount; v++) {
        _p.set(b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]).applyMatrix4(bn.matrixWorld);
        b.pos[v * 3] = _p.x; b.pos[v * 3 + 1] = _p.y; b.pos[v * 3 + 2] = _p.z;
        skinIndex.push(bi, 0, 0, 0);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    const weights = new Float32Array((skinIndex.length / 4) * 4);
    for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
    geom.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    geom.setIndex(b.idx);
    const mesh = new THREE.SkinnedMesh(geom, WALKER_MAT);
    mesh.castShadow = true;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 2.4);
    this.root.add(mesh);
    mesh.bind(new THREE.Skeleton(bones));
    this.mesh = mesh;

    this.stump.scale.setScalar(HIDDEN);
    this.legL.stump.scale.setScalar(HIDDEN);
    this.legR.stump.scale.setScalar(HIDDEN);

    // Personality in the animation.
    this.limp = rng.chance(0.35) ? rng.range(0.2, 0.6) : 0;
    this.tilt = rng.range(-0.35, 0.35);
    this.hunch = rng.range(0.05, 0.3);
    this.armLazy = rng.range(0, 1);
    this.phase = rng.range(0, 10);
    this.jawT = rng.range(0, 10);
    this.fresh = fresh;

    this.fall = 0; // 0 standing .. 1 lying
    this.fallDir = 1;
    this.crawler = false;
    this.headless = false;
  }

  removeHead() {
    this.headless = true;
    this.headGroup.scale.setScalar(HIDDEN);
    this.stump.scale.setScalar(1);
  }

  removeLegs() {
    this.crawler = true;
    for (const l of [this.legL, this.legR]) {
      l.hip.scale.setScalar(HIDDEN);
      l.stump.scale.setScalar(1);
    }
  }

  removeHelmet() {
    if (this.helmet) {
      this.helmet.scale.setScalar(HIDDEN);
      this.helmet = null;
    }
  }

  // Pose the skeleton. p: { speed, chase, lunge, grab, stagger, held, down, dead, dt, reach }
  animate(dt, p) {
    const t = (this.jawT += dt);
    const s = Math.min(1, p.speed / 1.6);
    this.phase += dt * (1.5 + p.speed * 2.1);
    const ph = this.phase;
    const limp = this.limp;
    const L = this.legL, R = this.legR;
    const AL = this.armL, AR = this.armR;

    // fall/lie blend
    if (p.dead || p.down) {
      this.fall = Math.min(1, this.fall + dt * (p.dead ? 2.1 : 2.6) * (0.4 + this.fall * 1.6));
    } else {
      this.fall = Math.max(0, this.fall - dt * (p.getup ? 0.9 : 3));
    }
    const f = this.fall;
    const ease = f * f * (3 - 2 * f);
    if (this.crawler && !p.dead) {
      this.body.rotation.x = 1.38;
      this.body.position.set(0, 0.2, -0.9);
    } else {
      this.body.rotation.x = this.fallDir * (Math.PI / 2 - 0.08) * ease;
      this.body.position.set(0, 0.13 * ease, 0);
    }

    if (this.crawler && !p.dead) {
      // drag forward with alternating arms
      const c = Math.sin(ph * 1.2);
      AL.sh.rotation.set(-2.7 + c * 0.5, 0, -0.2);
      AR.sh.rotation.set(-2.7 - c * 0.5, 0, 0.2);
      AL.el.rotation.x = -0.4 - Math.max(0, c) * 0.6;
      AR.el.rotation.x = -0.4 - Math.max(0, -c) * 0.6;
      this.torso.rotation.set(0, 0, c * 0.08);
      this.headGroup.rotation.set(-1.1, 0, this.tilt * 0.4);
      L.hip.rotation.x = 0.2;
      R.hip.rotation.x = 0.2;
      this.jaw.rotation.x = 0.15 + Math.max(0, Math.sin(t * 7)) * 0.35;
      return;
    }

    if (f > 0.02) {
      // limp body while falling / lying
      const k = ease;
      AL.sh.rotation.set(-0.3 * k - 2.2 * k * (this.fallDir > 0 ? 0.3 : 1), 0, -0.6 * k);
      AR.sh.rotation.set(-0.2 * k - 2.2 * k * (this.fallDir > 0 ? 0.3 : 0.9), 0, 0.7 * k);
      AL.el.rotation.x = -0.3 * k;
      AR.el.rotation.x = -0.5 * k;
      L.hip.rotation.x = -0.1 * k;
      R.hip.rotation.x = 0.15 * k;
      L.knee.rotation.x = 0.2 * k;
      R.knee.rotation.x = 0.1 * k;
      this.torso.rotation.set(0, 0, 0);
      this.headGroup.rotation.set(0, 0, 0.6 * k * (this.tilt > 0 ? 1 : -1));
      if (!p.dead) this.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(t * 5)) * 0.3;
      else this.jaw.rotation.x = 0.35;
      if (f > 0.98) return;
    }

    // --- upright locomotion ---
    const amp = 0.25 + s * 0.45;
    const sw = Math.sin(ph);
    const swL = sw * amp * (1 - limp * 0.5);
    const swR = -sw * amp;
    L.hip.rotation.x = -swL;
    R.hip.rotation.x = -swR;
    L.knee.rotation.x = Math.max(0, Math.sin(ph + 1.2)) * (0.3 + s * 0.6);
    R.knee.rotation.x = Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * (0.3 + s * 0.6) + limp * 0.3;
    this.hips.position.y = 0.95 - Math.abs(Math.cos(ph)) * 0.04 * s - limp * 0.04 * Math.max(0, sw);
    this.hips.rotation.z = sw * 0.06 * s + limp * 0.05 * sw;

    let lean = this.hunch + s * 0.15;
    let armFwd = 0.2 + this.armLazy * 0.3;
    let armSpread = 0.1;
    let jaw = 0.1 + Math.max(0, Math.sin(t * 2.3 + Math.sin(t * 0.7) * 2)) * 0.25;
    if (p.chase) {
      armFwd = 1.15 + Math.sin(t * 3) * 0.1;
      lean += 0.12;
      jaw = 0.2 + Math.max(0, Math.sin(t * 6)) * 0.4;
    }
    if (p.lunge > 0) {
      armFwd = 1.3 + p.lunge * 0.4;
      lean += 0.25 * p.lunge;
      armSpread = 0.25 * (1 - p.lunge);
      jaw = 0.5;
    }
    if (p.grab || p.held) {
      armFwd = 1.45 + Math.sin(t * 9) * 0.12;
      armSpread = p.held ? 0.3 + Math.sin(t * 7) * 0.2 : -0.05;
      lean = p.held ? -0.05 : 0.2;
      jaw = 0.25 + Math.abs(Math.sin(t * 11)) * 0.5;
    }
    if (p.stagger > 0) {
      lean -= p.stagger * 0.5;
      armFwd = 0.2;
      armSpread = 0.5 * p.stagger;
    }
    this.torso.rotation.set(lean, Math.sin(ph) * 0.08, 0);
    this.headGroup.rotation.set(-lean * 0.6 + (p.grab ? 0.2 : 0), Math.sin(t * 0.8) * 0.15, this.tilt + Math.sin(t * 1.3) * 0.05);
    const armSw = p.chase || p.grab || p.held || p.lunge > 0 ? 0.08 : 0.35;
    AL.sh.rotation.set(-armFwd - lean - swL * armSw, 0, -armSpread);
    AR.sh.rotation.set(-armFwd * (0.85 + this.armLazy * 0.15) - lean - swR * armSw, 0, armSpread);
    AL.el.rotation.x = -0.25 - (p.grab ? 0.5 : 0) + Math.sin(t * 2 + 1) * 0.05;
    AR.el.rotation.x = -0.35 - (p.grab ? 0.5 : 0) + Math.sin(t * 2.2) * 0.05;
    this.jaw.rotation.x = jaw;
  }

  // World-space hit volumes. Writes into the provided vectors.
  volumes(out) {
    this.root.updateMatrixWorld(true);
    this.headCenter.getWorldPosition(out.head);
    this.neck.getWorldPosition(out.neck);
    this.hips.getWorldPosition(out.hips);
    this.legL.knee.getWorldPosition(out.kneeL);
    this.legR.knee.getWorldPosition(out.kneeR);
    this.legL.footPt.getWorldPosition(out.footL);
    this.legR.footPt.getWorldPosition(out.footR);
    this.armL.sh.getWorldPosition(out.shL);
    this.armR.sh.getWorldPosition(out.shR);
    this.armL.hand.getWorldPosition(out.handL);
    this.armR.hand.getWorldPosition(out.handR);
    return out;
  }
}

export function makeVolumes() {
  const v = () => new THREE.Vector3();
  return { head: v(), neck: v(), hips: v(), kneeL: v(), kneeR: v(), footL: v(), footR: v(), shL: v(), shR: v(), handL: v(), handR: v() };
}
