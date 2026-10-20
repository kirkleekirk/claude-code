import * as THREE from 'three';
import { clamp, damp, dampT, fbm1, lerp, DEG } from './math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();

export class ThirdPersonCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(72, aspect, 0.08, 3200);
    this.yaw = 0; this.pitch = -0.08;
    this.dist = 4.2; this.curDist = 4.2;
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

  forward(out = _fwd) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  /**
   * target: hero (uses position, height), obstacles for collision, opts {speed, flying, boost}
   */
  update(dt, target, collide, opts = {}) {
    const h = target.camHeight || this.height;
    const dist = (target.camDist || this.dist) * (1 + clamp(opts.speed || 0, 0, 60) * 0.006) * (1 - this.zoom * 0.35);
    this.pivot.copy(target.root.position);
    this.pivot.y += h;
    if (!this.initialized) { this.pivotSmooth.copy(this.pivot); this.initialized = true; }
    // follow with slight lag (tighter when slow)
    const lag = opts.flying ? 14 : 22;
    this.pivotSmooth.lerp(this.pivot, dampT(lag, dt));
    if (this.pivotSmooth.distanceToSquared(this.pivot) > 36) this.pivotSmooth.copy(this.pivot);
    const fwd = this.forward(_fwd);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).negate(); // camera right
    // desired camera position: behind & over the shoulder
    const shoulder = this.shoulder * (1 - this.zoom * 0.2);
    const desired = _v.copy(this.pivotSmooth).addScaledVector(_right, shoulder);
    const camBack = _w.copy(fwd).multiplyScalar(-dist);
    // collision: shorten boom
    let d = dist;
    if (collide) d = collide(desired, camBack, dist);
    this.curDist = d < this.curDist ? d : damp(this.curDist, d, 6, dt);
    const camPos = this.pos.copy(desired).addScaledVector(fwd, -this.curDist);
    if (camPos.y < 0.25) camPos.y = 0.25;
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

  /** world ray from screen center */
  aimRay(origin, dir) {
    origin.copy(this.cam.position);
    this.cam.getWorldDirection(dir);
    return dir;
  }
}
