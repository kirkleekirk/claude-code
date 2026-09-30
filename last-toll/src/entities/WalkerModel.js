import * as THREE from 'three';
import { AvatarModel } from './avatar/AvatarModel.js';
import { visorGeometry } from './avatar/AvatarGear.js';
import { walkerLook, guardLook } from './avatar/looks.js';
import { weaponModel } from '../world/Models.js';

// Every person in the parish, living or dead, on the avatar rig (see entities/avatar):
// the walkers, the Living Guard's soldiers and the Magnolia's crew. The rig's clips
// drive the body; a pose layer on top reaches the arms of the dead, holds the Guard's
// rifles and folds the crew's arms. Hit volumes are read from the bones in world space.
//
// The walkers come in two looks, a setting away: 'avatar' (the same bodies as the
// living, dead; the default) or 'blocky' (boxes with painted pixel skins).

let walkerStyle = 'avatar';
export function setWalkerStyle(s) { walkerStyle = s === 'blocky' ? 'blocky' : 'avatar'; }
export function getWalkerStyle() { return walkerStyle; }

const VISOR_MAT = new THREE.MeshBasicMaterial({ color: 0xff2a18 });
VISOR_MAT.userData.shared = true;

// crew poses, as hand targets in the model's space (bind-pose units)
const P = (x, y, z) => new THREE.Vector3(x, y, z);
const OUT_L = P(1, -0.8, -0.2), OUT_R = P(-1, -0.8, -0.2);

export class WalkerModel {
  // living: a crew member's look (see CREW in data/story.js)
  constructor(rng, { riot = false, fresh = false, soldier = false, living = null } = {}) {
    this.soldier = soldier;
    this.living = !!living;
    this.fresh = fresh;
    const look = living || (soldier ? guardLook(rng) : { ...walkerLook(rng, { riot, fresh }), style: walkerStyle });
    this.look = look;

    this.root = new THREE.Group();
    // tips over (about the feet) when a body falls forward
    this.body = new THREE.Group();
    this.root.add(this.body);
    const av = new AvatarModel(look);
    this.av = av;
    this.body.add(av.root);
    this.mesh = av.mesh;
    this.talks = look.style !== 'blocky';

    // markers read for hit volumes, and places things get hung
    this.headGroup = av.attach('HEAD__Skeleton', [0, 1.19, -0.016]);
    this.headCenter = av.attach('HEAD__Skeleton', [0, 1.32, 0]);
    this.handMarkL = av.attach('LF_W__Skeleton', [0.56, 1.03, -0.03]);
    this.handMarkR = av.attach('RT_W__Skeleton', [-0.56, 1.03, -0.03]);
    this.headRadius = av.headRadius;
    this.headHeight = av.headHeight;
    this.helmet = (look.gear || []).includes('helmet') ? 'X_HELMET' : null;
    const B = av.byName;
    // what volumes() reads, every parent before its children
    this._volChain = [
      'BASE', 'BACKA', 'BACKB', 'NECK', 'HEAD', this.headCenter, 'LF_C', 'LF_S', 'LF_E', 'LF_W', this.handMarkL,
      'RT_C', 'RT_S', 'RT_E', 'RT_W', this.handMarkR, 'LF_H', 'LF_K', 'LF_A', 'RT_H', 'RT_K', 'RT_A',
    ].map((b) => (typeof b === 'string' ? B[`${b}__Skeleton`] : b));
    this.bone = {
      neck: B.NECK__Skeleton, hips: B.BASE__Skeleton,
      kneeL: B.LF_K__Skeleton, kneeR: B.RT_K__Skeleton, footL: B.LF_A__Skeleton, footR: B.RT_A__Skeleton,
      shL: B.LF_S__Skeleton, shR: B.RT_S__Skeleton,
    };

    if (soldier) {
      // the Guard's red eye-band glows on its own
      this.visor = av.attach('HEAD__Skeleton', [0, 0, 0], new THREE.Mesh(visorGeometry(look.sex), VISOR_MAT));
      // the carbine, on a pivot that swings from low ready up to the shoulder
      const mount = av.attach('BACKB__Skeleton', [0, 0, 0]);
      this.pivot = new THREE.Object3D();
      mount.add(this.pivot);
      this.rifle = weaponModel('arc_carbine');
      this.rifle.scale.setScalar(0.9 / av.scale);
      this.rifle.rotation.y = Math.PI;
      this.pivot.add(this.rifle);
      this.muzzle = this.rifle.getObjectByName('muzzle');
      this.gripR = new THREE.Object3D();
      this.gripR.position.set(0, -0.055, 0.05);
      this.gripL = new THREE.Object3D();
      this.gripL.position.set(0, -0.035, -0.12);
      this.rifle.add(this.gripR, this.gripL);
      this.chargeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0, fog: false }));
      this.muzzle.add(this.chargeGlow);
    }

    // personality in the animation
    this.tilt = rng.range(-0.35, 0.35);
    this.hunch = rng.range(0.05, 0.3);
    this.armLazy = rng.range(0, 1);
    this.t = rng.range(0, 10);
    if (soldier) { this.hunch = 0.03; this.tilt = 0; }
    if (living) { this.hunch = living.hunch ?? 0.02; this.tilt = 0; }
    this.fall = 0; // 0 standing .. 1 lying
    this.fallDir = 1;
    this.crawler = false;
    this.headless = false;
  }

  removeHead() {
    this.headless = true;
    this.av.hide('HEAD__Skeleton');
    this.av.show('X_NECK_STUMP');
  }

  removeLegs() {
    this.crawler = true;
    this.av.hide('LF_H__Skeleton');
    this.av.hide('RT_H__Skeleton');
    this.av.show('X_HIP_STUMP_L');
    this.av.show('X_HIP_STUMP_R');
  }

  removeHelmet() {
    if (this.helmet) {
      this.av.hide(this.helmet);
      this.helmet = null;
    }
  }

  // Pose the body. p: { speed, chase, lunge, grab, stagger, held, down, dead, getup }
  //   soldiers also: { aim, lookYaw, lookPitch, vx, vz }
  //   the crew: { pose: 'stand'|'lean'|'work'|'arms'|'smoke', lookYaw, lookPitch, talk }
  animate(dt, p) {
    const av = this.av, L = av.layer;
    this.t += dt;
    if (p.dead || p.down) this.fall = Math.min(1, this.fall + dt * (p.dead ? 2.1 : 2.6) * (0.4 + this.fall * 1.6));
    else this.fall = Math.max(0, this.fall - dt * (p.getup ? 0.9 : 3));
    const f = this.fall;
    const ease = f * f * (3 - 2 * f);
    // the layer starts clean every frame
    L.reach = 0; L.reachL = null; L.reachR = null; L.lift = 0; L.spread = 0; L.sway = 0; L.swayRate = 1;
    L.lean = 0; L.tilt = 0; L.yaw = 0; L.pitch = 0; L.handL = null; L.handR = null;
    this.body.rotation.x = 0;
    this.body.position.y = 0;

    if (this.crawler) {
      // dragging itself along; the dead stop where they lie
      av.play('crawl', { speed: p.dead ? 0 : Math.min(1.8, Math.max(0.3, (p.speed || 0) / 0.35)) });
      L.pitch = -0.45;
      L.tilt = this.tilt * 0.5;
      this._mouth(!p.dead && Math.sin(this.t * 7) > 0.3);
    } else if (f > 0.001) {
      if (this.fallDir < 0) {
        // over backward: the rig's own faint, run by the fall
        const a = av.play('faint', { fade: 0.15, speed: 0 });
        a.time = ease * a.getClip().duration * 0.97;
      } else {
        // over forward, arms out to break it
        this.body.rotation.x = (Math.PI / 2 - 0.1) * ease;
        this.body.position.y = 0.1 * ease;
        av.play('idle', { fade: 0.2 });
        L.reach = 0.3 + ease * 0.6;
        L.lift = 0.3 * ease;
        L.spread = 0.25 * ease;
        L.pitch = -0.6 * ease;
      }
      L.tilt = 0.5 * ease * (this.tilt > 0 ? 1 : -1);
      this._mouth(!p.dead && Math.sin(this.t * 5) > 0.5);
      // lying still: nothing left to animate
      if (p.dead && f >= 1 && this.settled) return;
      this.settled = p.dead && f >= 1;
    } else if (this.living) this._alive(p);
    else if (this.soldier) this._soldier(p);
    else this._dead(p);
    av.update(dt);
  }

  // Walking with the clips: a speed in m/s picks the clip and how fast it plays.
  _locomote(speed, run = 2.1) {
    const av = this.av;
    if (speed < 0.08) return av.play('idle', { fade: 0.3 });
    if (speed > run) return av.play('run', { fade: 0.25, speed: Math.min(1.35, Math.max(0.6, speed / 2.7)) });
    return av.play('walk', { fade: 0.25, speed: Math.min(2.3, Math.max(0.35, speed / 0.83)) });
  }

  // The dead on their feet: a shamble, arms out, head lolling.
  _dead(p) {
    const L = this.av.layer, t = this.t;
    const s = p.speed || 0;
    this._locomote(s, this.fresh ? 1.9 : 9);
    let lean = this.hunch + Math.min(s, 2) * 0.07;
    let reach = 0.3 + this.armLazy * 0.35, lift = 0, spread = 0, sway = 1, rate = 1;
    let mouth = Math.sin(t * 2.3 + Math.sin(t * 0.7) * 2) > 0.6;
    if (p.chase) { reach = 0.92; lean += 0.1; mouth = Math.sin(t * 6) > 0; }
    if (p.lunge > 0) { reach = 1; lift = 0.25 * p.lunge; lean += 0.3 * p.lunge; mouth = true; }
    if (p.grab || p.held) {
      reach = 1; lift = 0.12; sway = 2.2; rate = 3.4;
      lean = p.held ? -0.12 : 0.22;
      spread = p.held ? 0.18 : -0.06;
      mouth = Math.sin(t * 11) > -0.2;
    }
    if (p.stagger > 0) { lean -= p.stagger * 0.45; reach = 0.15; spread = 0.3 * p.stagger; }
    L.reach = reach;
    L.reachR = reach * (0.82 + this.armLazy * 0.18);
    L.lift = lift; L.spread = spread; L.sway = sway; L.swayRate = rate;
    L.lean = lean;
    L.tilt = this.tilt + Math.sin(t * 1.3) * 0.05;
    L.pitch = -lean * 0.7 + (p.grab ? 0.2 : 0);
    L.yaw = Math.sin(t * 0.8) * 0.15;
    this._mouth(mouth);
  }

  // A Guard soldier: carbine in both hands, low ready until there's something to shoot.
  _soldier(p) {
    const av = this.av, L = av.layer;
    const s = p.speed || 0, aim = p.aim || 0;
    // which way they're moving, relative to where they face
    const f = this.root.rotation.y;
    const lx = (p.vx || 0) * Math.cos(f) - (p.vz || 0) * Math.sin(f);
    const lz = (p.vx || 0) * Math.sin(f) + (p.vz || 0) * Math.cos(f);
    if (s > 0.15 && Math.abs(lx) > Math.abs(lz) * 1.2) av.play(lx > 0 ? 'strafeLeft' : 'strafeRight', { fade: 0.25, speed: Math.min(1.8, Math.max(0.5, s / 0.8)) });
    else if (s > 0.15 && lz < -0.1) av.play('walk', { fade: 0.25, speed: -Math.min(1.8, Math.max(0.4, s / 0.83)) });
    else this._locomote(s, 2.2);
    // the carbine: low ready, or up at the shoulder and on target
    const pitch = p.lookPitch || 0;
    this.pivot.position.set(-0.1, 0.99 + aim * 0.06, 0.28 - aim * 0.02);
    this.pivot.rotation.set(0.5 * (1 - aim) - pitch * aim, 0.12 * (1 - aim), 0);
    L.handR = { obj: this.gripR, pole: OUT_R, w: 1 };
    L.handL = { obj: this.gripL, pole: OUT_L, w: 1 };
    L.lean = this.hunch + s * 0.03 - (p.stagger || 0) * 0.3;
    L.yaw = (p.lookYaw || 0) * 0.7;
    L.pitch = -pitch * 0.6;
    this._mouth(false);
  }

  // The crew aboard the Magnolia: a pose, breathing, looking at you, talking.
  _alive(p) {
    const av = this.av, L = av.layer, t = this.t;
    const pose = p.pose || 'stand';
    const talk = !!p.talk;
    av.play('idle', { fade: 0.4 });
    L.lean = this.hunch;
    if (pose === 'lean') L.lean -= 0.04;
    if (pose === 'arms') {
      // arms folded across the chest
      L.handL = { local: P(-0.07, 0.94, 0.14), pole: OUT_L, w: 1 };
      L.handR = { local: P(0.08, 0.97, 0.16), pole: OUT_R, w: 1 };
    } else if (pose === 'work' && !talk) {
      // busy with something at waist height
      L.handL = { local: P(0.07 + Math.sin(t * 2.2) * 0.02, 0.84, 0.26), pole: OUT_L, w: 1 };
      L.handR = { local: P(-0.07, 0.84 + Math.sin(t * 2.7 + 1) * 0.02, 0.26), pole: OUT_R, w: 1 };
      L.lean += 0.15;
    } else if (pose === 'smoke') {
      // a hand up to the mouth now and then
      const puff = Math.max(0, Math.sin(t * 0.5 + this.armLazy * 6)) ** 6;
      L.handR = { local: P(-0.1 + puff * 0.08, 0.95 + puff * 0.27, 0.14 + puff * 0.04), pole: OUT_R, w: 1 };
    }
    if (talk && pose !== 'work') {
      // talking with one hand
      const g = Math.sin(t * 3.1);
      L.handR = { local: P(-0.16 + g * 0.03, 0.9 + Math.sin(t * 4.3) * 0.04, 0.22), pole: OUT_R, w: 1 };
    }
    L.yaw = Math.max(-1.1, Math.min(1.1, p.lookYaw || 0));
    L.pitch = -Math.max(-0.5, Math.min(0.4, p.lookPitch || 0)) + (pose === 'work' && !talk ? 0.35 : 0);
    this._mouth(talk && Math.abs(Math.sin(this.t * 9.5)) * Math.abs(Math.sin(this.t * 2.3)) > 0.3);
  }

  _mouth(open) {
    if (this.talks) this.av.talk(open);
  }

  // World-space hit volumes. Writes into the provided vectors.
  volumes(out) {
    this.mesh.updateWorldMatrix(true, false);
    for (const b of this._volChain) b.updateWorldMatrix(false, false);
    const b = this.bone;
    out.head.setFromMatrixPosition(this.headCenter.matrixWorld);
    out.neck.setFromMatrixPosition(b.neck.matrixWorld);
    out.hips.setFromMatrixPosition(b.hips.matrixWorld);
    out.kneeL.setFromMatrixPosition(b.kneeL.matrixWorld);
    out.kneeR.setFromMatrixPosition(b.kneeR.matrixWorld);
    out.footL.setFromMatrixPosition(b.footL.matrixWorld);
    out.footR.setFromMatrixPosition(b.footR.matrixWorld);
    out.shL.setFromMatrixPosition(b.shL.matrixWorld);
    out.shR.setFromMatrixPosition(b.shR.matrixWorld);
    out.handL.setFromMatrixPosition(this.handMarkL.matrixWorld);
    out.handR.setFromMatrixPosition(this.handMarkR.matrixWorld);
    return out;
  }
}

export function makeVolumes() {
  const v = () => new THREE.Vector3();
  return { head: v(), neck: v(), hips: v(), kneeL: v(), kneeR: v(), footL: v(), footR: v(), shL: v(), shR: v(), handL: v(), handR: v() };
}

