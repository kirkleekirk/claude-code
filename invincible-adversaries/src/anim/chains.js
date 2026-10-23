import * as THREE from 'three';
import { noise1 } from '../engine/math.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const GRAV = -9.8;

/** Verlet-simulated bone chain (capes, hair). Works in world space. */
class Chain {
  constructor(rec) {
    this.def = rec.def;
    this.joints = rec.joints;
    const n = rec.joints.length;
    const tip = rec.def.tipExtend ? 1 : 0;
    this.count = n + tip; // number of points
    this.p = []; this.pp = []; this.rest = [];
    for (let i = 0; i < this.count; i++) { this.p.push(new THREE.Vector3()); this.pp.push(new THREE.Vector3()); this.rest.push(new THREE.Vector3()); }
    // local directions & lengths (bone i -> point i+1)
    this.localDir = []; this.len = [];
    for (let i = 0; i < n - 1; i++) {
      const c = rec.joints[i + 1].bone.position;
      this.localDir.push(c.clone().normalize());
      this.len.push(0);
    }
    if (tip) {
      // tip continues along previous segment in rig space
      const a = rec.joints[n - 2].pos, b = rec.joints[n - 1].pos;
      const dirRig = new THREE.Vector3().subVectors(b, a).normalize();
      const inv = rec.joints[n - 1].WT.clone().invert();
      this.localDir.push(dirRig.applyQuaternion(inv).normalize());
      this.len.push(rec.def.tipExtend);
      this.tipRig = true;
    }
    this.bones = rec.joints.map((j) => j.bone);
    this.LT = rec.joints.map((j) => j.LT.clone());
    this.initialized = false;
  }

  /** compute rigid "animated rest" points from current parent transforms */
  computeRest() {
    const b0 = this.bones[0];
    b0.parent.updateWorldMatrix(true, false);
    b0.parent.matrixWorld.decompose(_v, _qp, _s);
    const scale = _s.x;
    // anchor
    _m.compose(_v.set(0, 0, 0), _q.identity(), _w.set(1, 1, 1));
    this.rest[0].copy(b0.position).applyMatrix4(b0.parent.matrixWorld);
    _q.copy(_qp);
    for (let i = 0; i < this.localDir.length; i++) {
      _q.multiply(this.LT[i]);
      const L = i < this.bones.length - 1 ? this.bones[i + 1].position.length() * scale : this.len[i];
      this.len[i] = L;
      _d.copy(this.localDir[i]).applyQuaternion(_q);
      this.rest[i + 1].copy(this.rest[i]).addScaledVector(_d, L);
    }
  }

  reset() {
    this.computeRest();
    for (let i = 0; i < this.count; i++) { this.p[i].copy(this.rest[i]); this.pp[i].copy(this.rest[i]); }
    this.initialized = true;
  }

  simulate(dt, env, t) {
    if (!this.initialized) this.reset();
    this.computeRest();
    const def = this.def;
    const p = this.p, pp = this.pp, rest = this.rest;
    p[0].copy(rest[0]); pp[0].copy(rest[0]);
    const stiff = 1 - Math.pow(1 - def.stiffness, dt * 60);
    const drag = def.drag;
    const g = GRAV * (def.gravity ?? 1);
    const flutter = env.flutter || 0;
    const dt2 = dt * dt;
    for (let i = 1; i < this.count; i++) {
      const cur = p[i], prev = pp[i];
      // velocity
      _v.subVectors(cur, prev);
      const vx = _v.x / dt, vy = _v.y / dt, vz = _v.z / dt;
      // drag toward wind velocity
      let ax = (env.wind.x - vx) * drag;
      let ay = (env.wind.y - vy) * drag + g;
      let az = (env.wind.z - vz) * drag;
      if (flutter > 0) {
        const k = i / this.count;
        ax += noise1(t * 7.1 + i * 1.7 + this.seed) * flutter * k;
        ay += noise1(t * 6.3 + i * 2.3 + this.seed + 40) * flutter * k;
        az += noise1(t * 5.7 + i * 1.1 + this.seed + 90) * flutter * k * 0.5;
      }
      prev.copy(cur);
      cur.x += _v.x * 0.985 + ax * dt2;
      cur.y += _v.y * 0.985 + ay * dt2;
      cur.z += _v.z * 0.985 + az * dt2;
      // shape stiffness (pull to rigid pose)
      cur.lerp(rest[i], stiff * (1 - (i / this.count) * 0.4));
    }
    // constraints
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < this.count; i++) {
        const a = p[i - 1], b = p[i];
        _d.subVectors(b, a);
        const L = _d.length() || 1e-6;
        const target = this.len[i - 1];
        b.copy(a).addScaledVector(_d, target / L);
      }
      if (env.colliders) {
        for (let i = 1; i < this.count; i++) {
          const pt = p[i];
          for (const c of env.colliders) {
            // capsule collider a-b radius r
            const r = c.r + (def.radius ? def.radius * 0.35 : 0.03);
            closestOnSeg(pt, c.a, c.b, _w);
            _d.subVectors(pt, _w);
            const d2 = _d.lengthSq();
            if (d2 < r * r) {
              const d = Math.sqrt(d2) || 1e-6;
              pt.addScaledVector(_d, (r - d) / d);
            }
          }
        }
      }
      // capes stay on the back: no swinging in front of the torso plane or rising over the shoulders.
      // The frame rotates with the torso, so in flight the cape still streams back over the body.
      if (def.behind && env.torso) {
        const a = p[0], F = env.torso.fwd, U = env.torso.up;
        for (let i = 1; i < this.count; i++) {
          _d.subVectors(p[i], a);
          const f = _d.dot(F) - def.behind.fwd;
          if (f > 0) p[i].addScaledVector(F, -f);
          const u = _d.dot(U) - def.behind.up;
          if (u > 0) p[i].addScaledVector(U, -u);
        }
      }
    }
  }

  /** write bone rotations from simulated points */
  apply() {
    const n = this.bones.length;
    const segs = this.localDir.length;
    for (let i = 0; i < Math.min(segs, n); i++) {
      const bone = this.bones[i];
      bone.parent.updateWorldMatrix(false, false);
      bone.parent.matrixWorld.decompose(_v, _qp, _s);
      // animated rest world rotation
      _q.copy(_qp).multiply(this.LT[i]);
      _d.copy(this.localDir[i]).applyQuaternion(_q);
      _w.subVectors(this.p[i + 1], this.p[i]).normalize();
      _q2.setFromUnitVectors(_d, _w);
      _q.premultiply(_q2); // new world rotation
      bone.quaternion.copy(_qp.invert().multiply(_q));
      bone.updateMatrixWorld(false);
      bone.matrixWorldNeedsUpdate = false;
    }
  }
}

function closestOnSeg(p, a, b, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
}

export class ChainSystem {
  constructor(rig) {
    this.rig = rig;
    this.chains = rig.chains.map((c, i) => { const ch = new Chain(c); ch.seed = i * 13.7; return ch; });
    this.groups = {};
    for (const c of this.chains) if (c.def.group) (this.groups[c.def.group] ||= []).push(c);
    this.time = 0;
  }
  reset() { for (const c of this.chains) c.reset(); }
  /** move every simulated point rigidly (teleports keep the cape's shape and motion) */
  transform(m) {
    for (const c of this.chains) {
      if (!c.initialized) continue;
      for (let i = 0; i < c.count; i++) { c.p[i].applyMatrix4(m); c.pp[i].applyMatrix4(m); }
    }
  }
  update(dt, env) {
    if (!this.chains.length) return;
    this.time += dt;
    const steps = dt > 1 / 45 ? 3 : 2;
    const h = Math.min(dt, 1 / 20) / steps;
    for (let s = 0; s < steps; s++) {
      for (const c of this.chains) c.simulate(h, env, this.time);
      // lateral coupling keeps cape strips together like cloth
      for (const g in this.groups) couple(this.groups[g]);
    }
    for (const c of this.chains) c.apply();
  }
}

function couple(list) {
  if (list.length < 2) return;
  for (let k = 0; k < list.length - 1; k++) {
    const A = list[k], B = list[k + 1];
    const n = Math.min(A.count, B.count);
    for (let i = 1; i < n; i++) {
      const ra = A.rest[i], rb = B.rest[i];
      const restD = ra.distanceTo(rb);
      const pa = A.p[i], pb = B.p[i];
      _d.subVectors(pb, pa);
      const d = _d.length() || 1e-6;
      const diff = (d - restD) / d * 0.25;
      pa.addScaledVector(_d, diff);
      pb.addScaledVector(_d, -diff);
    }
  }
}
