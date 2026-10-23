import * as THREE from 'three';
import { clamp, damp, dampT, fbm1, lerp, DEG } from './math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _arm = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// Nothing but cut() moves the camera in one jump. The boom length eases toward what the situation asks
// for, collisions pull it in fast but over several frames, and a fast hero drags the follow point along
// instead of it jumping onto the hero.
const MAX_LAG = 3; // m the follow point may trail the hero
const BOOM_SPEED = 12; // m/s the wanted boom length may change (speed, altitude, death)
const BOOM_IN = 20; // m/s a collision may pull the camera in
const BOOM_OUT = 3; // /s easing back out once clear...
const BOOM_HOLD = 0.25; // ...for this long (strafing past a row of pillars)
const PROBE = 0.3; // m: radius of the collision probe around the camera
const MIN_ARM = 0.6; // m: closest the camera comes to the follow point

export class ThirdPersonCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(72, aspect, 0.08, 3200);
    this.yaw = 0; this.pitch = -0.08;
    this.dist = 4.2; this.curDist = 4.2; this.want = 4.2;
    this.armNow = 4.2; this.clearT = 0; this.cuts = 0; this.lift = 0;
    this.shoulder = 0.62; this.height = 1.55;
    this.fovBase = 72; this.fovKick = 0; this.fov = 72;
    this.trauma = 0; this.shakeT = 0;
    this.pos = new THREE.Vector3();
    this.pivot = new THREE.Vector3();
    this.pivotSmooth = new THREE.Vector3();
    this.override = null; // { pos, look, blend }
    this.overrideBlend = 0;
    this.sens = 0.0022;
    this.invertY = false;
    this.zoom = 0; // aim zoom
    this.lean = 0;
    this.initialized = false;
  }
  look(dx, dy) {
    this.yaw -= dx * this.sens;
    this.pitch -= dy * this.sens * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.38);
  }
  addTrauma(t) { this.trauma = Math.min(1.25, this.trauma + t); }
  kick(f) { this.fovKick = Math.max(this.fovKick, f); }
  /** jump straight to the target on the next update (match start, respawn, hero swap) */
  cut() { this.initialized = false; this.cuts++; }

  forward(out = _fwd) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  /**
   * target: hero (uses position, height); ray(from, dir, dist) returns the clear distance along a ray
   * (camera collision); opts {speed, flying, boost}
   */
  update(dt, target, ray, opts = {}) {
    const h = target.camHeight || this.height;
    const want = (target.camDist || this.dist) * (1 + clamp(opts.speed || 0, 0, 60) * 0.006) * (1 - this.zoom * 0.35);
    this.pivot.copy(target.root.position);
    this.pivot.y += h;
    const cutNow = !this.initialized;
    if (cutNow) { this.pivotSmooth.copy(this.pivot); this.want = want; this.clearT = 0; this.initialized = true; }
    // the boom length asked for can change in one frame (a dash ending, a landing, dropping out of the
    // stratosphere), so ease toward it
    this.want += clamp((want - this.want) * dampT(3, dt), -BOOM_SPEED * dt, BOOM_SPEED * dt);
    // follow with slight lag (tighter when slow), at most MAX_LAG behind
    this.pivotSmooth.lerp(this.pivot, dampT(opts.flying ? 14 : 22, dt));
    const gap = this.pivotSmooth.distanceTo(this.pivot);
    if (gap > MAX_LAG) this.pivotSmooth.lerp(this.pivot, 1 - MAX_LAG / gap);
    const fwd = this.forward(_fwd);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).negate(); // camera right
    // the arm runs from the follow point to the spot behind and over the shoulder
    const shoulder = this.shoulder * (1 - this.zoom * 0.2);
    const arm = _arm.copy(_right).multiplyScalar(shoulder).addScaledVector(fwd, -this.want);
    const armLen = arm.length();
    arm.multiplyScalar(1 / armLen);
    // collision: the clear share of the arm. Backed against a wall taller than the follow point, the arm
    // starts higher up, over the wall, rather than leaving the camera inside it
    let clear = 1, liftWant = 0;
    if (ray) {
      const base = this.clearShare(this.pivotSmooth, arm, armLen, ray);
      if (base * armLen < MIN_ARM + 0.3 && arm.y > -0.5) {
        const room = Math.min(1.3, ray(this.pivotSmooth, UP, 1.6) - 0.3);
        if (room > 0.3 && this.clearShare(_o.copy(this.pivotSmooth).addScaledVector(UP, room), arm, armLen, ray) * armLen > base * armLen + 0.6) liftWant = room;
      }
      this.lift = cutNow ? liftWant : liftWant > this.lift ? Math.min(liftWant, this.lift + 8 * dt) : damp(this.lift, liftWant, 2.5, dt);
      clear = this.lift > 0.01 ? this.clearShare(_o.copy(this.pivotSmooth).addScaledVector(UP, this.lift), arm, armLen, ray) : base;
      clear = clamp(clear, Math.min(1, MIN_ARM / armLen), 1);
    } else this.lift = 0;
    // the arm pulls in fast but over a few frames (a one-frame jump reads as a snap), whether a wall
    // or a shorter wanted boom asks for it, and eases back out once clear
    const reach = clear * armLen;
    // how far the clear distance came in since the last frame: backing into a pillar at flight speed,
    // the eased pull-in alone would trail a wall that keeps coming by speed / 18 and sit inside it
    const closing = this.lastReach == null ? 0 : Math.max(0, this.lastReach - reach);
    this.lastReach = reach;
    if (cutNow) this.armNow = reach;
    else if (reach < this.armNow) {
      this.armNow -= Math.min(Math.max((this.armNow - reach) * dampT(18, dt), closing), BOOM_IN * dt, this.armNow - reach);
      this.clearT = 0;
    } else if ((this.clearT += dt) > BOOM_HOLD) this.armNow = Math.min(reach, damp(this.armNow, reach, BOOM_OUT, dt));
    this.curDist = this.armNow;
    const camPos = this.pos.copy(this.pivotSmooth).addScaledVector(UP, this.lift).addScaledVector(arm, this.armNow);
    // never below the ground (the crater floor drops below y = 0)
    const gy = this.groundAt ? this.groundAt(camPos.x, camPos.z) : 0;
    if (camPos.y < gy + 0.25) camPos.y = gy + 0.25;
    // FOV
    this.fovKick = damp(this.fovKick, 0, 3, dt);
    const fovT = this.fovBase + (opts.boost ? 14 : 0) + clamp((opts.speed || 0) - 10, 0, 50) * 0.2 + this.fovKick - this.zoom * 18;
    this.fov = damp(this.fov, fovT, 5, dt);
    this.cam.fov = this.fov;
    // shake
    this.shakeT += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    const t = this.shakeT * 22;
    const sx = fbm1(t, 2) * 0.32 * s, sy = fbm1(t + 31, 2) * 0.32 * s, sr = fbm1(t + 77, 2) * 0.08 * s;
    // cinematic override
    const ob = this.overrideBlend = damp(this.overrideBlend, this.override ? 1 : 0, this.override ? (this.override.speed || 4) : 5, dt);
    let lookAt = _w.copy(camPos).add(fwd);
    if (ob > 0.001 && this.override) {
      camPos.lerp(this.override.pos, ob);
      const la = _v.copy(camPos).add(fwd).lerp(this.override.look, ob);
      lookAt.copy(la);
    }
    this.cam.position.copy(camPos);
    this.cam.lookAt(lookAt);
    this.cam.rotateZ(sr + this.lean);
    this.cam.rotateY(sx * 0.12);
    this.cam.rotateX(sy * 0.12);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
  }

  /**
   * the clear share of the arm from origin: traced to the camera spot and to four points around it, so
   * a pillar edge shortens the arm gradually rather than all at once
   */
  clearShare(origin, arm, armLen, ray) {
    let c = 1;
    for (let i = 0; i < 5; i++) {
      const q = _q.copy(origin).addScaledVector(arm, armLen);
      if (i === 1 || i === 2) q.addScaledVector(_right, i === 1 ? PROBE : -PROBE);
      else if (i > 2) q.y += i === 3 ? PROBE : -PROBE;
      const d = _d.subVectors(q, origin), len = d.length();
      d.multiplyScalar(1 / len);
      c = Math.min(c, (ray(origin, d, len + 0.3) - 0.35) / len);
    }
    return c;
  }

  /** world ray from screen center */
  aimRay(origin, dir) {
    origin.copy(this.cam.position);
    this.cam.getWorldDirection(dir);
    return dir;
  }
}
