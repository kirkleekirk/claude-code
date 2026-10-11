// What another player's machine runs, as this one shows it: the other players themselves, and
// the dead that come for them. Neither is simulated here. Each goes where the last word from
// its machine put it, carried on a little at the speed it was going, so it moves smoothly
// between messages.

import * as THREE from 'three';
import { Puppet } from '../entities/puppet.js';
import { lookFromProfile } from '../entities/avatar/looks.js';
import { Enemy, enemyBody, CLIP_NAMES } from '../entities/enemy.js';
import { TYPES } from '../entities/cmz/types.js';

const _p = new THREE.Vector3();
const CLIP_INDEX = new Map(CLIP_NAMES.map((n, i) => [n, i]));

// the seconds since o's last frame, really (at least the frame's own)
function smoothStep(o, dt, now) {
  const s = o.frameAt ? Math.min(0.5, Math.max(dt, (now - o.frameAt) / 1000)) : dt;
  o.frameAt = now;
  return s;
}

// toward an angle the short way round
function turn(a, b, k) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// ---- other players ------------------------------------------------------------------------------

// flags in a player's state
export const SHOULDER = 1, RELOAD = 2, DEAD = 4, CROUCH = 8, GROUND = 16;

export class RemotePlayer {
  constructor(game, id, name, prof) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.prof = prof;
    this.puppet = new Puppet(game.app, lookFromProfile(prof));
    game.scene.add(this.puppet.root);
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.tyaw = 0; this.tpitch = 0;
    this.held = null;
    this.uses = 0;
    this.useNow = false;
    this.flags = 0;
    this.reloadTime = 0;
    this.heard = false;
    this.lastAt = 0;
    this.tag = game.hud.addTag(name);
  }

  setLook(prof) {
    this.prof = prof;
    this.puppet.dispose();
    this.puppet = new Puppet(this.game.app, lookFromProfile(prof));
    this.game.scene.add(this.puppet.root);
  }

  get dead() { return !!(this.flags & DEAD); }

  // m: { p: [x, y, z], v: [x, y, z], a: [yaw, pitch], h: item, u: uses, f: flags, rt }
  receive(m, now) {
    const p = m.p, v = m.v, a = m.a;
    if (!Array.isArray(p) || !p.every(Number.isFinite)) return;
    this.target.set(p[0], p[1], p[2]);
    if (Array.isArray(v) && v.every(Number.isFinite)) this.vel.set(v[0], v[1], v[2]).clampLength(0, 30);
    if (Array.isArray(a) && a.every(Number.isFinite)) { this.tyaw = a[0]; this.tpitch = a[1]; }
    if (!this.heard) { this.pos.copy(this.target); this.yaw = this.tyaw; this.pitch = this.tpitch; }
    this.held = typeof m.h === 'string' ? m.h : null;
    // a swing or a shot since the last word: the clip starts again
    if (m.u !== this.uses) { if (this.heard) this.useNow = true; this.uses = m.u; }
    this.flags = m.f | 0;
    this.reloadTime = +m.rt || 0;
    this.lastAt = now;
    this.heard = true;
  }

  update(dt, now) {
    if (!this.heard) { this.puppet.root.visible = false; this.game.hud.placeTag(this.tag, null); return; }
    // (smoothed over the time that's really gone by: a slow frame doesn't leave them behind)
    const real = smoothStep(this, dt, now);
    const since = Math.min(0.25, (now - this.lastAt) / 1000);
    _p.copy(this.target).addScaledVector(this.vel, since);
    // a long way off (a respawn, a teleport): straight there
    if (this.pos.distanceToSquared(_p) > 64) this.pos.copy(_p);
    else this.pos.lerp(_p, 1 - Math.exp(-real * 14));
    const k = 1 - Math.exp(-real * 16);
    this.yaw = turn(this.yaw, this.tyaw, k);
    this.pitch += (this.tpitch - this.pitch) * k;
    const g = this.game, P = this.pos;
    const far = Math.hypot(P.x - g.player.pos.x, P.z - g.player.pos.z) > g.world.radius * 16;
    this.puppet.root.visible = !far;
    if (!far) {
      const L = g.world.lightAt(P.x, P.y + 1.4, P.z);
      this.puppet.update(dt, {
        pos: P, yaw: this.yaw, pitch: this.pitch, vel: this.vel, onGround: !!(this.flags & GROUND), held: this.held,
        use: this.useNow, shoulder: this.flags & SHOULDER, reload: this.flags & RELOAD, reloadTime: this.reloadTime,
        dead: this.dead, light: { sky: L.sky / 15, block: L.block / 15 },
      });
    }
    this.useNow = false;
    g.hud.placeTag(this.tag, this.dead ? null : _p.set(P.x, P.y + 2.05, P.z), g.camera);
  }

  // where a shot of theirs comes from: the gun's barrel tip, or about where it would be
  muzzle(out) {
    const m = this.puppet.muzzle;
    if (m && this.puppet.root.visible) return m.getWorldPosition(out);
    return out.set(this.pos.x, this.pos.y + 1.45, this.pos.z);
  }

  // would a block at (x, y, z) overlap them?
  occupies(x, y, z) {
    const P = this.pos, r = 0.3;
    return x + 1 > P.x - r && x < P.x + r && z + 1 > P.z - r && z < P.z + r && y + 1 > P.y && y < P.y + 1.8;
  }

  dispose() {
    this.puppet.dispose();
    this.game.hud.removeTag(this.tag);
  }
}

// ---- other players' dead --------------------------------------------------------------------------

// One of the dead in a snapshot: its number, type, where it is and which way it faces, the clip
// it's playing (by number) and how far through at what speed, what it can do, and how faded.
export const GHOST_FLOATS = 11;
const HITTABLE = 1, BLOCKING = 2, GONE = 4, LOOP = 8;

export function enemySnapshot(list) {
  const f = new Float32Array(list.length * GHOST_FLOATS);
  list.forEach((e, k) => {
    const o = k * GHOST_FLOATS;
    f[o] = e.nid; f[o + 1] = e.type;
    f[o + 2] = e.pos.x; f[o + 3] = e.pos.y; f[o + 4] = e.pos.z; f[o + 5] = e.yaw;
    f[o + 6] = CLIP_INDEX.get(e.clip.name) ?? -1; f[o + 7] = e.clip.t; f[o + 8] = e.clip.speed;
    f[o + 9] = (e.hittable ? HITTABLE : 0) | (e.blocking ? BLOCKING : 0) | (e.dead ? GONE : 0) | (e.clip.loop ? LOOP : 0);
    f[o + 10] = e.opacity;
  });
  return f;
}

export class Ghost {
  constructor(game, owner, nid, type, stand) {
    this.game = game;
    this.owner = owner;
    this.nid = nid;
    this.type = type;
    this.T = TYPES[type];
    this.kind = this.T.kind;
    this.body = enemyBody(game, type, stand);
    this.root = this.body.root;
    game.scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.tyaw = 0;
    this.clipName = '';
    this.clipT = 0;
    this.clipSpeed = 1;
    this.hittable = false;
    this.blocking = false;
    this.dead = false;
    this.heard = false;
    this.lastAt = 0;
    this.growl = null;
    this.animAcc = 0;
  }

  receive(f, o, now) {
    const x = f[o + 2], y = f[o + 3], z = f[o + 4];
    if (!Number.isFinite(x + y + z)) return;
    if (this.heard) {
      const s = (now - this.lastAt) / 1000;
      if (s > 0.02) this.vel.set((x - this.target.x) / s, (y - this.target.y) / s, (z - this.target.z) / s).clampLength(0, 15);
    } else { this.pos.set(x, y, z); this.yaw = f[o + 5]; }
    this.target.set(x, y, z);
    this.tyaw = f[o + 5];
    this.lastAt = now;
    const flags = f[o + 9];
    this.hittable = !!(flags & HITTABLE);
    this.blocking = !!(flags & BLOCKING);
    const wasDead = this.dead;
    this.dead = !!(flags & GONE);
    const name = CLIP_NAMES[f[o + 6]] ?? '', t = f[o + 7], speed = f[o + 8] || 1;
    // a new clip, or the same one again from the start
    if (name && (name !== this.clipName || t + 0.2 < this.clipT)) {
      this.body.play(name, { loop: !!(flags & LOOP), fade: this.heard ? 0.25 : 0, speed });
      // (as far through as it is there: a zombie half out of the ground stays half out)
      if (this.body.action) this.body.action.time = t;
      else if (this.body.t != null) this.body.t = t;
      if (!this.heard && /^arise|^standup/.test(name) && this.T.foundIn === 0) {
        this.game.audio?.play?.('CreatureUnearth', this.pos);
        this.growl = this.game.audio?.play?.('ZombieCry', this.pos) ?? null;
      }
      this.clipName = name;
    }
    this.clipT = t;
    if (speed !== this.clipSpeed) { this.clipSpeed = speed; this.body.setSpeed(speed); }
    this.body.opacity = f[o + 10];
    if (this.dead && !wasDead && this.growl) { this.game.audio?.stop?.(this.growl); this.growl = null; }
    this.heard = true;
  }

  update(dt, now) {
    if (!this.heard) { this.root.visible = false; return; }
    this.clipT += dt * this.clipSpeed;
    const real = smoothStep(this, dt, now);
    const since = Math.min(0.25, (now - this.lastAt) / 1000);
    _p.copy(this.target).addScaledVector(this.vel, since);
    if (this.pos.distanceToSquared(_p) > 36) this.pos.copy(_p);
    else this.pos.lerp(_p, 1 - Math.exp(-real * 12));
    this.yaw = turn(this.yaw, this.tyaw, 1 - Math.exp(-real * 14));
    const g = this.game, P = this.pos;
    const dist = Math.hypot(P.x - g.player.pos.x, P.z - g.player.pos.z);
    this.root.visible = dist < g.world.radius * 16;
    this.root.position.copy(P);
    this.root.rotation.y = this.yaw;
    // the growl that never stops while they chase someone
    if (!this.dead && /walk|run|MoveLoop/.test(this.clipName) && !this.growl?.playing) this.growl = g.audio?.growl?.(this.kind, P) ?? null;
    if (this.growl) g.audio?.move?.(this.growl, P);
    if (!this.root.visible) return;
    this.animAcc += dt;
    if (dist < 40 || this.animAcc > 0.1) { this.body.update(this.animAcc); this.animAcc = 0; }
    const L = g.world.lightAt(P.x, P.y + 1.2, P.z);
    this.body.setLight(L.sky / 15, L.block / 15);
  }

  // a hit goes to the machine that runs it; what it does shows when that machine says so
  takeDamage(y, weapon) {
    this.game.online?.hitGhost(this, y, weapon);
    return false;
  }

  dispose() {
    if (this.growl) this.game.audio?.stop?.(this.growl);
    this.body.dispose();
    this.root.removeFromParent();
  }
}

// the same box as the original's dead, to shoot at and to build round
Ghost.prototype.intersect = Enemy.prototype.intersect;
Ghost.prototype.occupies = Enemy.prototype.occupies;
