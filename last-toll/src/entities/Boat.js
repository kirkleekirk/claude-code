import * as THREE from 'three';
import { Batcher } from '../world/Batcher.js';
import { damp, clamp, wrapAngle } from '../core/math.js';

// A boat you can drive: Ray's speedboat from the marina, or the Covenant's orange
// lifeboat. W throttles up gently and quietly; hold Shift to open it wide, which
// anyone on the water can hear. A and D steer, S backs off. The survivor stands at
// the console and can look around freely while driving.
//
// heading uses the survivor's convention: forward is (-sin h, 0, -cos h).

const KINDS = {
  speed: { len: 8.2, beam: 2.6, quiet: 4.6, full: 17, turn: 1.25, deck: 0.55, seat: [0, 0.45, 0.9], name: 'the speedboat' },
  life: { len: 7.4, beam: 2.6, quiet: 3.4, full: 8.5, turn: 0.8, deck: 0.5, seat: [0, 0.4, 1.4], name: 'the lifeboat' },
};

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Boat {
  constructor({ scene, world, audio, kind = 'speed', pos, heading = 0 }) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.kind = kind;
    this.k = KINDS[kind];
    this.pos = new THREE.Vector3(pos.x, world.waterY, pos.z);
    this.heading = heading;
    this.speed = 0;
    this.throttle = 0;
    this.steer = 0;
    this.driver = null;
    this.loud = false;
    this.t = Math.random() * 10;
    this.root = new THREE.Group();
    this.root.add(kind === 'speed' ? speedboatMesh(this.k) : lifeboatMesh(this.k));
    scene.add(this.root);
    this.wake = new THREE.Mesh(new THREE.PlaneGeometry(3, 12).rotateX(-Math.PI / 2).translate(0, 0, 7), new THREE.MeshBasicMaterial({ color: 0xe8f0f0, transparent: true, opacity: 0, depthWrite: false }));
    this.wake.position.y = 0.04;
    this.root.add(this.wake);
    this._place();
  }

  get deckY() { return this.pos.y + this.k.deck; }

  // Where the driver stands, in world space.
  seat(out) {
    const [sx, , sz] = this.k.seat;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    return out.set(this.pos.x + sx * c + sz * s, this.deckY, this.pos.z - sx * s + sz * c);
  }

  // Where the wheel is (what you look at to take it).
  console(out) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const z = this.k.seat[2] - 0.7;
    return out.set(this.pos.x + z * s, this.deckY + 1.0, this.pos.z + z * c);
  }

  forward(out) {
    return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  board(player) {
    this.driver = player;
    player.mode = 'seat';
    player.vel.set(0, 0, 0);
    if (!this.engine) this.engine = this.audio.engine?.(this.pos) || null;
    this.engine?.rev(0);
  }

  leave() {
    this.driver = null;
    this.throttle = 0;
  }

  update(dt, input, time) {
    this.t += dt;
    const k = this.k;
    if (this.driver && input) {
      const fwd = input.moveZ, turn = -input.moveX;
      this.loud = fwd > 0.1 && input.isDown('ShiftLeft');
      const want = fwd > 0.1 ? (this.loud ? 1 : k.quiet / k.full) : fwd < -0.1 ? -0.18 : 0;
      this.throttle = damp(this.throttle, want, 1.6, dt);
      this.steer = damp(this.steer, turn, 5, dt);
    } else {
      this.throttle = damp(this.throttle, 0, 2, dt);
      this.steer = damp(this.steer, 0, 5, dt);
      this.loud = false;
    }
    const target = this.throttle * k.full;
    this.speed = damp(this.speed, target, target > this.speed ? 0.9 : 0.6, dt);
    // steering bites harder with some way on
    const bite = clamp(Math.abs(this.speed) / 4, 0.25, 1) * Math.sign(this.speed || 1);
    this.heading = wrapAngle(this.heading + this.steer * k.turn * bite * dt);
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += -Math.sin(this.heading) * this.speed * dt;
    this.pos.z += -Math.cos(this.heading) * this.speed * dt;
    // bump off anything solid at the waterline: sample the bow, the middle and the stern
    let hit = false;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    for (const off of [-k.len * 0.36, 0, k.len * 0.36]) {
      _p.set(this.pos.x + off * s, this.world.waterY - 0.9, this.pos.z + off * c);
      const bx = _p.x, bz = _p.z;
      if (this.world.resolveCircle(_p, k.beam * 0.5, 0.2, 1.7)) {
        hit = true;
        this.pos.x += _p.x - bx;
        this.pos.z += _p.z - bz;
      }
    }
    if (hit) {
      if (Math.abs(this.speed) > 5) this.audio.impact?.(this.pos, 'hard');
      this.speed *= 0.3;
      if (Math.hypot(this.pos.x - px, this.pos.z - pz) < 0.001) this.speed = 0;
    }
    this._place();
    if (this.engine) {
      this.engine.set(this.pos);
      this.engine.rev(clamp(Math.abs(this.throttle), 0, 1));
    }
  }

  _place() {
    const sp = Math.abs(this.speed);
    const planing = clamp(sp / this.k.full, 0, 1);
    const bob = Math.sin(this.t * 1.3) * 0.05 + Math.sin(this.t * 2.9) * 0.02;
    this.root.position.set(this.pos.x, this.pos.y + bob + planing * 0.15, this.pos.z);
    this.root.rotation.set(0, this.heading, 0, 'YXZ');
    // bow up under power, a lean into the turn
    this.root.rotation.x = planing * 0.09 + Math.sin(this.t * 1.7) * 0.012;
    this.root.rotation.z = -this.steer * planing * 0.12 + Math.sin(this.t * 1.1) * 0.015;
    this.wake.material.opacity = planing * 0.35;
  }

  dispose() {
    this.engine?.stop();
    this.engine = null;
    this.scene.remove(this.root);
  }
}

function speedboatMesh(k) {
  const b = new Batcher();
  const L = k.len, W = k.beam;
  // hull: a deep vee, white with a red stripe, tapering to the bow (-z)
  b.box(0, 0.05, 0.6, W, 0.9, L - 1.2, 0xe8e4d8, { ao: 1 });
  for (let i = 0; i < 4; i++) {
    const w = W * (1 - (i + 1) * 0.2);
    b.box(0, 0.1 + i * 0.03, -L / 2 + 0.9 - i * 0.35, w, 0.85 - i * 0.12, 0.4, 0xe8e4d8, { ao: 1 });
  }
  b.box(0, 0.32, 0.6, W + 0.02, 0.12, L - 1.2, 0xb8201a);
  b.box(0, -0.35, 0.6, W - 0.3, 0.2, L - 1.6, 0x1a1a1a);
  // deck, console with a windshield, bench seat
  b.box(0, 0.52, 0.8, W - 0.3, 0.06, L - 2.2, 0xb8b0a0);
  b.box(0, 0.95, 0.2, 1.1, 0.8, 0.8, 0xe8e4d8);
  b.box(0, 1.5, -0.12, 1.2, 0.5, 0.05, 0x9ab8c8, { rotY: 0 });
  b.box(0, 1.38, 0.2, 0.3, 0.05, 0.3, 0x1a1a1a);
  b.box(0, 0.8, 2.3, W - 0.5, 0.5, 0.7, 0x2a4a6a);
  // twin outboards on the transom
  for (const x of [-0.5, 0.5]) {
    b.box(x, 0.7, L / 2 + 0.1, 0.45, 0.9, 0.55, 0x1a1a1a);
    b.box(x, 0.1, L / 2 + 0.2, 0.18, 0.8, 0.2, 0x2a2a2a);
  }
  const m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  return m;
}

function lifeboatMesh(k) {
  const b = new Batcher();
  const L = k.len, W = k.beam;
  b.box(0, 0.2, 0.3, W, 1.3, L - 0.6, 0xe06a1a, { ao: 1 });
  for (let i = 0; i < 3; i++) b.box(0, 0.25, -L / 2 + 0.5 - i * 0.3, W * (0.8 - i * 0.22), 1.2, 0.35, 0xe06a1a, { ao: 1 });
  b.box(0, 1.3, 0.8, W - 0.4, 1.0, L - 2.6, 0xe06a1a);
  b.box(0, 1.3, -0.5, W - 0.38, 0.35, 0.04, 0x1a2a34);
  b.box(0, 0.55, 1.2, W - 0.4, 0.06, L - 2.4, 0x5a5048);
  b.box(0, 0.9, 0.4, 0.6, 0.6, 0.4, 0x3a3a3a);
  const m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  return m;
}
