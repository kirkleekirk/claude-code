import * as THREE from 'three';
import { bloodTexture, radialTexture } from '../world/Textures.js';

// Pooled particles (blood, sparks, gibs, brass), ground decals, and the
// muzzle-flash light. Everything is instanced to keep draw calls flat.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    const max = 700;
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.parts = new THREE.InstancedMesh(geo, mat, max);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    for (let i = 0; i < max; i++) this.parts.setColorAt(i, _c.set(0xffffff));
    scene.add(this.parts);
    this.P = [];
    for (let i = 0; i < max; i++) this.P.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.03, color: 0, g: 9.8, spin: new THREE.Vector3(), rot: new THREE.Vector3(), bounce: 0, glow: false });
    this.nextP = 0;

    // sparks: additive glow particles (separate so they read in the dark)
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, fog: false });
    this.sparks_ = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), sparkMat, 120);
    this.sparks_.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks_.frustumCulled = false;
    this.sparks_.count = 0;
    scene.add(this.sparks_);
    this.S = [];
    for (let i = 0; i < 120; i++) this.S.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
    this.nextS = 0;

    // ground blood pools
    const poolMat = new THREE.MeshLambertMaterial({ map: bloodTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, 90);
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 1;
    scene.add(this.pools);
    this.poolData = [];
    this.nextPool = 0;

    // wall impact marks
    const holeMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(10,8,6,0.95)', 'rgba(10,8,6,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), holeMat, 140);
    this.holes.count = 0;
    this.holes.frustumCulled = false;
    scene.add(this.holes);
    this.nextHole = 0;

    this.flash = new THREE.PointLight(0xffc27a, 0, 14, 1.6);
    scene.add(this.flash);
    this.flashT = 0;
  }

  _emit(pos, vel, { life = 1, size = 0.03, color = 0x5a0606, g = 9.8, bounce = 0.2, spin = 8 } = {}) {
    const p = this.P[this.nextP];
    this.nextP = (this.nextP + 1) % this.max;
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = life;
    p.max = life;
    p.size = size;
    p.g = g;
    p.bounce = bounce;
    p.spin.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.color = color;
    p.lastSlot = -1;
    return p;
  }

  blood(point, n = 10, strength = 1, dir = null) {
    if (!point) return;
    for (let i = 0; i < n; i++) {
      _p.set((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).multiplyScalar(1.6 * strength);
      if (dir) _p.addScaledVector(dir, 1.5 * strength);
      this._emit(point, _p, { life: 0.8 + Math.random() * 0.8, size: 0.02 + Math.random() * 0.035, color: Math.random() < 0.5 ? 0x4a0404 : 0x6a0a08 });
    }
  }

  gib(point, dx = 0, dz = 0) {
    if (!point) return;
    for (let i = 0; i < 7; i++) {
      _p.set(dx * 2 + (Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 2, dz * 2 + (Math.random() - 0.5) * 2.5);
      this._emit(point, _p, { life: 6 + Math.random() * 4, size: 0.05 + Math.random() * 0.05, color: i === 0 ? 0x7a8070 : 0x3a0404, bounce: 0.3, spin: 12 });
    }
    this.blood(point, 20, 1.5);
  }

  brass(pos, vel) {
    this._emit(pos, vel, { life: 2.5, size: 0.012, color: 0xb08d3a, bounce: 0.45, spin: 30 });
  }

  sparks(point, n = 6) {
    if (!point) return;
    for (let i = 0; i < n; i++) {
      const s = this.S[this.nextS];
      this.nextS = (this.nextS + 1) % this.S.length;
      s.alive = true;
      s.pos.copy(point);
      s.vel.set((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5);
      s.life = 0.15 + Math.random() * 0.25;
    }
  }

  dust(point, normal, n = 6) {
    for (let i = 0; i < n; i++) {
      _p.copy(normal).multiplyScalar(1.2 + Math.random()).add(_s.set((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)));
      this._emit(point, _p, { life: 0.5 + Math.random() * 0.5, size: 0.02 + Math.random() * 0.03, color: 0x6a665a, g: 4, bounce: 0.1 });
    }
  }

  bloodPool(x, z, size = 1) {
    const i = this.nextPool;
    this.nextPool = (this.nextPool + 1) % 90;
    this.poolData[i] = { x, z, size: 0.05, target: size, rot: Math.random() * 6.28 };
    this.pools.count = Math.max(this.pools.count, i + 1);
    this._poolMatrix(i);
  }

  _poolMatrix(i) {
    const d = this.poolData[i];
    _q.setFromAxisAngle(UP, d.rot);
    _s.set(d.size, 1, d.size);
    _p.set(d.x, 0.07 + (i % 7) * 0.001, d.z);
    _m.compose(_p, _q, _s);
    this.pools.setMatrixAt(i, _m);
    this.pools.instanceMatrix.needsUpdate = true;
  }

  impact(point, normal, surface = 'hard') {
    const i = this.nextHole;
    this.nextHole = (this.nextHole + 1) % 140;
    _p.copy(point).addScaledVector(normal, 0.01);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const s = 0.06 + Math.random() * 0.04;
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    this.holes.setMatrixAt(i, _m);
    this.holes.count = Math.max(this.holes.count, i + 1);
    this.holes.instanceMatrix.needsUpdate = true;
    if (surface === 'hard') this.sparks(point, 3);
    this.dust(point, normal, 5);
  }

  muzzleFlash(pos, intensity = 1) {
    this.flash.position.copy(pos);
    this.flash.intensity = 30 * intensity;
    this.flashT = 0.06;
  }

  update(dt) {
    // particles
    let count = 0;
    const im = this.parts;
    let colorDirty = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.P[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vel.y -= p.g * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.06 + p.size / 2) {
        p.pos.y = 0.06 + p.size / 2;
        if (p.vel.y < -1 && p.bounce > 0) {
          p.vel.y = -p.vel.y * p.bounce;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
        } else {
          p.vel.set(0, 0, 0);
          p.spin.set(0, 0, 0);
        }
      }
      p.rot.addScaledVector(p.spin, dt);
      const fade = Math.min(1, p.life / Math.min(0.3, p.max));
      _e.set(p.rot.x, p.rot.y, p.rot.z);
      _q.setFromEuler(_e);
      const sz = p.size * fade;
      _s.set(sz, sz, sz);
      _m.compose(p.pos, _q, _s);
      im.setMatrixAt(count, _m);
      if (p.lastSlot !== count) {
        im.setColorAt(count, _c.setHex(p.color));
        p.lastSlot = count;
        colorDirty = true;
      }
      count++;
    }
    im.count = count;
    im.instanceMatrix.needsUpdate = true;
    if (colorDirty && im.instanceColor) im.instanceColor.needsUpdate = true;

    // sparks
    let sc = 0;
    for (const s of this.S) {
      if (!s.alive) continue;
      s.life -= dt;
      if (s.life <= 0) { s.alive = false; continue; }
      s.vel.y -= 9.8 * dt;
      s.pos.addScaledVector(s.vel, dt);
      _q.identity();
      const z = 0.015;
      _s.set(z, z, z);
      _m.compose(s.pos, _q, _s);
      this.sparks_.setMatrixAt(sc++, _m);
    }
    this.sparks_.count = sc;
    this.sparks_.instanceMatrix.needsUpdate = true;

    // growing blood pools
    for (let i = 0; i < this.poolData.length; i++) {
      const d = this.poolData[i];
      if (d && d.size < d.target) {
        d.size = Math.min(d.target, d.size + dt * 0.35);
        this._poolMatrix(i);
      }
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.intensity = 0;
      else this.flash.intensity *= 0.6;
    }
  }

  dispose() {
    for (const o of [this.parts, this.sparks_, this.pools, this.holes, this.flash]) this.scene.remove(o);
  }
}
