// One of the dead, run the way CastleMiner Z runs them (AI.BaseZombie and its states, read from
// the original's code):
//
//   emerge   the dead climb out of the ground (skeletons drop out of the cave roof instead, and
//            archers stand up); they can't be hurt until they're out
//   chase    straight at you, at a walk until they've chased you long enough (45 s, or a few
//            seconds of you running) and then flat out; they hop at walls (fast ones clear
//            several blocks), and get frustrated when something stops them
//   attack   three or four swings, a fit of rage, more swings, while you're in reach
//   dig      a frustrated zombie, or one with you above or below it, digs toward you through
//            whatever it's strong enough to break; it gives up on what it can't
//   give up  too far behind, dug into a wall it can't break, or you're dead: it goes off to eat
//            (the skeletons rage), and is gone
//   hit      every hit staggers them; die: they fall, and lie there a few seconds
//
// The archers walk up to within 35 m and shoot, five to nine arrows, then give up.
//
// The body is the original's model (./cmz/bodies.js) when the ripped files are there, else one
// built on the avatar rig standing in for it; either way the clips' timing is the original's.

import * as THREE from 'three';
import { SOLID, B } from '../world/blocks.js';
import { AvatarModel } from './avatar/model.js';
import { CmzBody } from './cmz/bodies.js';
import { TYPES, attacksFor, damageMultiplier, HARDNESS, randomInt } from './cmz/types.js';

const GRAVITY = 20; // the original's BasicPhysics.Gravity
const HALF = 0.35, TALL = 1.65; // the original's box for the dead
const EPS = 0.001;
const _v = new THREE.Vector3();

// The original's clip lengths (seconds), so the stand-in bodies keep its timing.
const LENGTHS = {
  arise_1: 2.3, arise_2: 3.5667, arise_3: 8.3, arise_4: 8.3, walk: 1.6333, walk2: 1.3, run: 1.3, run_fast: 0.6333,
  attack1: 1.6333, attack2: 2.3, attack3: 1.9333, attack4: 1.9667, attack5: 2.4333, enraged: 3.6333,
  hit_reaction1: 1.6333, hit_reaction3: 1.6333, death1: 1.9667, death2: 2.3, death3: 2.6333, eat_start: 1.3,
};
const SKELETON_LENGTHS = {
  walk: 1.3, walk2: 1.9667, run: 0.6333, attack1: 1.9333, attack2: 1.9667, attack3: 2.4333, axes_atack1: 1.3, axes_atack2: 1.3,
  enraged: 3.6333, gethit1: 0.9667, gethit2: 2.6333, gethit3: 0.8, death1: 1.8, death2: 1.8, death3: 1.8, death4: 1.9667,
  death5: 2.3, death6: 2.9667, death7: 2.6333, standup: 2.1333, standup2: 3.4667, walk_archer1: 1.3, idle_archer1: 3.3, atack_archer1: 1.6333,
};

// every clip the dead play, numbered the same on every machine (online, a body's clip goes by
// its number)
export const CLIP_NAMES = [...new Set([...Object.keys(LENGTHS), ...Object.keys(SKELETON_LENGTHS)])];

// Without the original's bodies: the avatar rig, playing the nearest of its own clips.
function standIn(name, zombie) {
  if (/^arise|^standup/.test(name)) return 'climb';
  if (/^run/.test(name)) return 'run';
  if (/walk/.test(name)) return 'walk';
  if (/atta?ck/.test(name)) return zombie ? 'swingClub' : 'punch';
  if (/^death/.test(name)) return 'faint';
  return 'idle';
}

class AvatarBody {
  constructor(game, T, look, shared) {
    this.zombie = T.kind === 'zombie';
    this.model = new AvatarModel(look, game.app.sky.uniforms, game.app.terrain.uniforms, shared);
    this.root = new THREE.Group();
    this.root.add(this.model.root);
    this.lengths = this.zombie ? LENGTHS : SKELETON_LENGTHS;
    this.name = '';
    this.t = 0;
  }

  has(name) { return name in this.lengths; }

  duration(name) { return this.lengths[name] ?? 1.5; }

  play(name, { loop = false, fade = 0.25, speed = 1 } = {}) {
    this.name = name;
    this.t = 0;
    this.speed = speed;
    const clip = standIn(name, this.zombie);
    this.model.play(clip, { once: !loop && clip !== 'idle', fade: Math.max(0.05, fade), speed: clip === 'faint' ? 1.2 : speed, restart: true });
    const L = this.model.layer;
    L.reach = this.zombie && /walk|run/.test(name) ? 0.9 : 0;
    L.lean = this.zombie ? 0.15 : 0.04;
  }

  setSpeed(s) { this.speed = s; this.model.current?.setEffectiveTimeScale(s); }

  stop() {}

  update(dt) {
    this.t += dt * (this.speed || 1);
    // climbing out of the ground
    const rise = /^arise/.test(this.name) ? Math.max(0, 1 - this.t / this.duration(this.name)) : 0;
    this.model.root.position.y = -1.9 * rise * rise;
    this.model.update(dt);
  }

  setLight(sky, block) { this.model.setLight(sky, block); }

  set flash(v) { this.model.material.uniforms.uFlash.value = v; }

  set opacity(v) { this.model.material.uniforms.uOpacity.value = v; }

  dispose() {
    this.model.dispose();
    this.model.material.dispose();
    this.root.removeFromParent();
  }
}

// A body for one of the dead of this type: the original's model, or (stand: { look, shared })
// one built on the avatar rig.
export function enemyBody(game, type, stand) {
  const T = TYPES[type], bodies = game.app.cmzBodies;
  return bodies && !stand ? new CmzBody(bodies, T.model, T.skin, game.app.sky.uniforms, game.app.terrain.uniforms) : new AvatarBody(game, T, stand.look, stand.shared);
}

export class Enemy {
  // type: an index into TYPES; pkg: its rolled speeds (initPackage); stand: for the stand-in
  // bodies, { look, shared }
  constructor(game, type, x, y, z, pkg, stand = null) {
    const T = TYPES[type];
    this.game = game;
    this.world = game.world;
    this.T = T;
    this.type = type;
    this.kind = T.kind;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.health = T.health;
    this.pkg = pkg;
    this.speed = pkg.slow;
    this.fast = false;
    this.tilFast = pkg.normalActivation;
    this.tilRunFast = pkg.runActivation;
    this.frustration = 15;
    this.onGround = false;
    this.touchingWall = false;
    this.hittable = false;
    this.blocking = false;
    this.swingCount = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.animIndex = -1;
    this.stateTimer = 0;
    this.yaw = 0;
    this.dead = false;
    this.gone = false;
    this.dist = 0;
    this.growl = null;
    this.opacity = 1;
    this.body = enemyBody(game, type, stand);
    this.root = this.body.root;
    this.clip = { name: '', t: 0, dur: 1, speed: 1, loop: false };
    this.state = null;
    this.root.position.copy(this.pos);
    const S = T.kind === 'zombie' ? ZOMBIE : T.kind === 'archer' ? ARCHER : SKELETON;
    this.S = S;
    this.change(S.emerge);
  }

  // ---- the animation clock (the original's AnimationPlayer: clip time, run at a speed) ---------

  playClip(name, loop, fade = 0.25) {
    const c = this.clip;
    c.name = name; c.t = 0; c.loop = loop; c.speed = 1;
    c.dur = this.body.duration(name) || 1;
    this.body.play(name, { loop, fade, speed: 1 });
  }

  setClipSpeed(s) { this.clip.speed = s; this.body.setSpeed(s); }

  get nearEnd() { return this.clip.dur - this.clip.t < 0.25; }

  get finished() { return !this.clip.loop && this.clip.t >= this.clip.dur; }

  change(state) {
    this.state = state;
    state.enter(this);
  }

  // ---- where the player is -----------------------------------------------------------------

  get target() { return this.game.player; }

  // Seconds until the two meet, from how they're moving (the original's TimeToIntercept).
  timeToIntercept() {
    const t = this.target;
    const dx = this.pos.x - t.pos.x, dz = this.pos.z - t.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1) return 0;
    const rx = t.vel.x - this.vel.x, rz = t.vel.z - this.vel.z;
    if (dx * rx + dz * rz < 0) return Infinity;
    const r2 = rx * rx + rz * rz;
    if (r2 < 0.001) return Infinity;
    const r = Math.sqrt(r2), d = Math.sqrt(d2);
    const c = (rx / r) * (dx / d) + (rz / r) * (dz / d);
    if (c < 0.01) return Infinity;
    return d / c / r;
  }

  faceTarget() {
    const t = this.target;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    if (dx * dx + dz * dz > 0.2 * 0.2) this.yaw = Math.atan2(dx, dz);
  }

  zeroVelocity() { this.vel.x = 0; this.vel.z = 0; }

  reduceVelocity() { this.vel.x *= 0.99; this.vel.z *= 0.99; }

  speedUp() {
    if (!this.T.hasRunFast) return;
    this.fast = true;
    this.speed = this.pkg.fast;
    if (this.state === CHASE) startMoveAnimation(this);
  }

  // ---- being hit ---------------------------------------------------------------------------

  // A hit at height y from a weapon { dmg, type } (the original's EnemyDamage and its type).
  // Returns true if it killed.
  takeDamage(y, weapon) {
    if (this.health <= 0) return false;
    const head = y - this.pos.y > 1.5;
    this.health -= weapon.dmg * damageMultiplier(this.T, weapon.type, head);
    if (this.health <= 0) {
      this.change(this.S.die);
      return true;
    }
    if (this.state !== this.S.hit) this.change(this.S.hit);
    return false;
  }

  giveUp() {
    if (this.dead || this.state === this.S.giveUp) return;
    this.change(this.S.giveUp);
  }

  remove() { this.gone = true; }

  // ---- the frame ------------------------------------------------------------------------------

  update(dt) {
    const w = this.world;
    // the original lets go of anything whose ground isn't loaded
    if (!w.isLoaded(this.pos.x, this.pos.z)) { this.gone = true; return; }
    const p = this.target;
    this.dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (p.dead && !this.dead) this.giveUp();
    this.state.update(this, dt);
    if (this.gone) return;
    // the clip runs on
    const c = this.clip;
    c.t += dt * c.speed;
    if (c.t > c.dur) c.t = c.loop ? c.t % c.dur : c.dur;
    this.physics(dt);
    if (this.growl) this.game.audio?.move?.(this.growl, this.pos);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    // far off, the body only every few frames
    this.animAcc = (this.animAcc || 0) + dt;
    if (this.dist < 40 || this.animAcc > 0.1) { this.body.update(this.animAcc); this.animAcc = 0; }
    const L = w.lightAt(this.pos.x, this.pos.y + 1.2, this.pos.z);
    this.body.setLight(L.sky / 15, L.block / 15);
  }

  // Does the box at (x, y, z) overlap anything solid? (Not the blocks it was made inside of:
  // skeletons drop out of the cave roof.)
  collides(x, y, z) {
    const w = this.world, G = this.embedded;
    const x0 = Math.floor(x - HALF), x1 = Math.floor(x + HALF - EPS);
    const y0 = Math.floor(y), y1 = Math.floor(y + TALL - EPS);
    const z0 = Math.floor(z - HALF), z1 = Math.floor(z + HALF - EPS);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      if (SOLID[w.getBlock(bx, by, bz)] && !(G && G.has(`${bx},${by},${bz}`))) return true;
    }
    return false;
  }

  // the solid cells the box is in
  cellsIn(P) {
    const out = new Set();
    for (let by = Math.floor(P.y); by <= Math.floor(P.y + TALL - EPS); by++) for (let bz = Math.floor(P.z - HALF); bz <= Math.floor(P.z + HALF - EPS); bz++) {
      for (let bx = Math.floor(P.x - HALF); bx <= Math.floor(P.x + HALF - EPS); bx++) if (SOLID[this.world.getBlock(bx, by, bz)]) out.add(`${bx},${by},${bz}`);
    }
    return out;
  }

  // Gravity, and the box slid along whatever it runs into (the original's ResolveCollsion, its
  // probe skipping the blocks the box starts embedded in). Caught inside a block some other way,
  // it climbs out.
  physics(dt) {
    const v = this.vel, P = this.pos;
    if (this.embedded === undefined) { const c = this.cellsIn(P); this.embedded = c.size ? c : null; }
    else if (this.embedded) {
      const c = this.cellsIn(P);
      if (![...c].some((k) => this.embedded.has(k))) this.embedded = null;
    }
    v.y -= GRAVITY * dt;
    if (v.y < -60) v.y = -60;
    this.onGround = false;
    this.touchingWall = false;
    if (this.collides(P.x, P.y, P.z)) {
      P.y += Math.min(1, dt * 6);
      v.y = Math.max(0, v.y);
      this.touchingWall = true;
    } else {
      const steps = Math.max(1, Math.ceil((Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z)) * dt / 0.3));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        for (const axis of ['x', 'z']) {
          const d = v[axis] * h;
          if (!d) continue;
          const nx = axis === 'x' ? P.x + d : P.x, nz = axis === 'z' ? P.z + d : P.z;
          if (!this.collides(nx, P.y, nz)) { P.x = nx; P.z = nz; continue; }
          const p0 = P[axis];
          P[axis] = d > 0 ? Math.floor(p0 + HALF + d) - HALF - EPS : Math.floor(p0 - HALF + d) + 1 + HALF + EPS;
          if (this.collides(P.x, P.y, P.z)) P[axis] = p0;
          v[axis] = 0;
          this.touchingWall = true;
        }
        const dy = v.y * h;
        if (!dy) continue;
        if (!this.collides(P.x, P.y + dy, P.z)) { P.y += dy; continue; }
        if (dy < 0) {
          P.y = Math.floor(P.y + dy) + 1 + EPS;
          if (this.collides(P.x, P.y, P.z)) P.y = Math.ceil(P.y);
          this.onGround = true;
        } else {
          P.y = Math.floor(P.y + TALL + dy) - TALL - EPS;
          this.touchingWall = true;
        }
        v.y = 0;
      }
    }
    if (P.y < -20) { this.gone = true; return; }
    // stuck (barely moving) runs the frustration down; moving freely resets it
    if (v.x * v.x + v.z * v.z < 0.25) this.frustration -= dt;
    else this.frustration = 2.5;
  }

  // The original's Explosive.EnemyBreakBlocks: in the box, each block no harder than `hardest`
  // that `damage` beats breaks, half the time. 2: something broke; 3: nothing solid there; 0:
  // something it could break, not yet; 1: only what it can't.
  breakBlocks(x0, y0, z0, x1, y1, z1, damage, hardest) {
    const w = this.world, g = this.game;
    let canDig = false, broke = false, solid = false;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const id = w.getBlock(x, y, z);
      if (id === B.AIR) continue;
      if (SOLID[id]) solid = true;
      const hard = HARDNESS[id];
      if (hard > hardest) continue;
      canDig = true;
      if (damage <= hard || Math.random() >= 0.5) continue;
      broke = true;
      g.removeBlock ? g.removeBlock(x, y, z) : w.setBlock(x, y, z, B.AIR);
    }
    return broke ? 2 : !solid ? 3 : canDig ? 0 : 1;
  }

  // ---- for the rest of the game ----------------------------------------------------------------

  // Would a block at (x, y, z) overlap this body? (Nothing can be built inside one.)
  occupies(x, y, z) {
    if (!this.blocking) return false;
    const P = this.pos;
    return x + 1 > P.x - HALF && x < P.x + HALF && z + 1 > P.z - HALF && z < P.z + HALF && y + 1 > P.y && y < P.y + TALL;
  }

  // Where a ray meets the box: the distance and the point's height, or null.
  intersect(o, d, maxDist) {
    if (!this.hittable) return null;
    const P = this.pos;
    let t0 = 0, t1 = maxDist;
    for (const [oa, da, lo, hi] of [[o.x, d.x, P.x - HALF, P.x + HALF], [o.y, d.y, P.y, P.y + TALL], [o.z, d.z, P.z - HALF, P.z + HALF]]) {
      if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
      let a = (lo - oa) / da, b = (hi - oa) / da;
      if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    return { dist: t0, y: o.y + d.y * t0 };
  }

  dispose() {
    if (this.growl) this.game.audio?.stop?.(this.growl);
    this.body.dispose();
    this.root.removeFromParent();
  }
}

// ---- the states (the original's AI.*: Enter once, then Update every frame) ---------------------

const growlFor = (e) => {
  if (!e.growl?.playing) e.growl = e.game.audio?.growl?.(e.kind === 'zombie' ? 'zombie' : 'skeleton', e.pos) ?? null;
};

function startMoveAnimation(e) {
  const s = e.speed;
  if (s < 2.7) { e.playClip('walk', true); e.setClipSpeed(Math.min(s / 1, 1)); }
  else if (s < 3.7) { e.playClip('walk2', true); e.setClipSpeed(Math.min(s / 1, 1)); }
  else if (s >= 5 && e.T.hasRunFast) { e.playClip('run_fast', true); e.setClipSpeed(Math.min(s / 4, 1)); }
  else { e.playClip('run', true); e.setClipSpeed(Math.min(s / 3, 1)); }
}

// the zombies climb out of the ground, facing anywhere; the archers stand up
const EMERGE = {
  name: 'emerge',
  enter(e) {
    e.blocking = true;
    e.hittable = false;
    if (e.kind === 'archer') {
      e.swingCount = 5 + randomInt(0, 5);
      e.playClip(randomInt(0, 2) ? 'standup2' : 'standup', false, 0);
    } else e.playClip(`arise_${randomInt(0, 4) + 1}`, false, 0);
    e.setClipSpeed(e.pkg.emergeSpeed);
    e.yaw = Math.random() * Math.PI * 2;
    if (e.T.foundIn === 0) {
      e.game.audio?.play?.('CreatureUnearth', e.pos);
      e.growl = e.game.audio?.play?.('ZombieCry', e.pos) ?? null;
    }
  },
  update(e) { if (e.nearEnd) e.change(e.S.chase); },
};

const CHASE = {
  name: 'chase',
  enter(e) {
    e.blocking = true;
    e.hittable = true;
    startMoveAnimation(e);
    e.frustration = 2.5;
  },
  update(e, dt) {
    growlFor(e);
    const t = e.target, v = e.vel;
    let dx = t.pos.x - e.pos.x;
    const dy = t.pos.y - e.pos.y;
    let dz = t.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5 && e.timeToIntercept() < 1 / e.speed) {
      if (Math.abs(dy) > 4 && e.onGround && t.onGround) e.change(e.S.dig);
      else e.change(e.S.attack);
      return;
    }
    if (e.frustration <= 0) { e.change(e.S.dig); e.zeroVelocity(); return; }
    if (e.T.hasRunFast && !e.fast) {
      e.tilFast -= dt;
      if (e.tilFast <= 0 || e.game.enemies.zombieFest) e.speedUp();
      // a few seconds of the player running and they break into a run too
      if (t.vel.x * t.vel.x + t.vel.z * t.vel.z > 3.5) {
        e.tilRunFast -= dt;
        if (e.tilRunFast < 0) e.speedUp();
      }
    }
    if (dist * dist < 0.001) { dx = 0; dz = 0; } else { dx /= dist; dz /= dist; }
    let s = e.speed;
    if (!e.onGround) s *= e.fast ? 1 : 0.5;
    else if (e.touchingWall) v.y += e.fast ? e.T.fastJump : 10;
    v.x = dx * s;
    v.z = dz * s;
    if (v.x * v.x + v.z * v.z > 0.2) e.yaw = Math.atan2(v.x, v.z);
    if (dist >= 5) {
      // fallen too far behind: they try digging, and give up from there
      if (e.fast) { if (e.timeToIntercept() > 8) e.change(e.S.dig); }
      else if (dist > 25) e.change(e.S.dig);
    }
  },
};

// swings at the player while they're in reach; a fit of rage now and then
function attackState(rageClip = 'enraged') {
  return {
    name: 'attack',
    enter(e) {
      if (e.onGround) e.zeroVelocity();
      const A = attacksFor(e.T);
      e.animIndex = randomInt(0, A.clips.length);
      e.playClip(A.clips[e.animIndex], false);
      e.swingCount = 2 + randomInt(0, 3);
      e.hitCount = 0;
      e.missCount = randomInt(3, 5);
      e.setClipSpeed(e.T.attackSpeed);
    },
    update(e) {
      if (e.onGround) e.zeroVelocity(); else e.reduceVelocity();
      const t = e.target, A = attacksFor(e.T);
      if (e.nearEnd) {
        if (!e.hitCount) e.missCount--;
        const dx = t.pos.x - e.pos.x, dy = t.pos.y - e.pos.y, dz = t.pos.z - e.pos.z;
        if (e.missCount <= 0) {
          if (Math.abs(dy) > 1.5 && t.onGround && e.onGround) { e.change(e.S.dig); return; }
          e.missCount = randomInt(1, 3);
          e.hitCount = 1;
          e.animIndex = -1;
          e.playClip(rageClip, false);
          return;
        }
        const d = Math.hypot(dx, dz);
        if (d >= 1) { e.change(e.S.chase); return; }
        if (d > 0.1) e.yaw = Math.atan2(dx, dz);
        e.animIndex = randomInt(0, A.clips.length);
        e.playClip(A.clips[e.animIndex], false);
        e.hitCount = 0;
        e.swingCount = 2 + randomInt(0, 3);
        return;
      }
      if (e.animIndex === -1) return;
      const times = A.times[e.animIndex];
      // (the original divides the blow's moment by the clip's speed, though the clock is clip time)
      if (e.clip.t < times[e.hitCount] / e.clip.speed) return;
      const dx = t.pos.x - e.pos.x, dy = t.pos.y - e.pos.y, dz = t.pos.z - e.pos.z;
      if (Math.abs(dy) < 1.2 && !t.dead) {
        const d2 = dx * dx + dz * dz;
        let hit = d2 < 0.05;
        const r = A.range[e.animIndex];
        if (!hit && d2 < r * r) {
          const d = Math.sqrt(d2);
          hit = (dx / d) * Math.sin(e.yaw) + (dz / d) * Math.cos(e.yaw) > 0.7;
        }
        // (a blow doesn't knock you back in the original)
        if (hit) t.hurt(A.damage[e.animIndex] * t.maxHealth, null, e.kind);
      }
      e.hitCount++;
      if (e.hitCount === times.length) { e.animIndex = -1; e.hitCount = 0; }
    },
  };
}

const ATTACK = attackState();

// digging toward the player, through what it's strong enough to break
const DIG = {
  name: 'dig',
  enter(e) {
    const t = e.target;
    if (_v.subVectors(t.pos, e.pos).lengthSq() > 256) { e.change(e.S.giveUp); return; }
    if (e.onGround) e.zeroVelocity();
    const A = attacksFor(e.T);
    e.animIndex = randomInt(0, A.clips.length);
    e.playClip(A.clips[e.animIndex], false);
    e.hitCount = 0;
    e.swingCount = 0;
    e.missCount = 0;
    e.setClipSpeed(e.T.attackSpeed);
  },
  update(e) {
    if (e.onGround) e.zeroVelocity(); else e.reduceVelocity();
    const t = e.target, A = attacksFor(e.T);
    if (e.nearEnd) {
      if (e.missCount === 4) { e.change(e.S.giveUp); return; }
      if (!e.missCount || (e.missCount & 2)) { e.change(e.S.chase); return; }
      const dx = t.pos.x - e.pos.x, dy = t.pos.y - e.pos.y, dz = t.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1 && Math.abs(dy) < 1.5) { e.change(e.S.attack); return; }
      if (d > 16 || Math.abs(dy) > 8) { e.change(e.S.giveUp); return; }
      e.yaw = Math.atan2(dx, dz);
      e.animIndex = randomInt(0, A.clips.length);
      e.playClip(A.clips[e.animIndex], false);
      e.hitCount = 0;
      e.missCount = 0;
      return;
    }
    if (e.animIndex === -1) return;
    const times = A.times[e.animIndex];
    if (e.clip.t < times[e.hitCount] / e.clip.speed) return;
    // the blocks: its own column and the next one toward the player, three high (a block
    // higher or lower if the player is above or below)
    const P = e.pos;
    const bx = Math.floor(P.x), bz = Math.floor(P.z);
    let by = Math.floor(P.y);
    if (t.pos.y >= P.y + 1) by++; else if (t.pos.y <= P.y - 1) by--;
    let x0 = bx, x1 = bx, z0 = bz, z1 = bz;
    if (t.pos.x > P.x) x1++; else x0--;
    if (t.pos.z >= P.z) z1++; else z0--;
    e.swingCount++;
    const damage = Math.floor(Math.fround(Math.fround(e.swingCount) * Math.fround(e.T.dig)));
    const r = e.breakBlocks(x0, by, z0, x1, by + 2, z1, damage, e.T.hardest);
    if (r === 0) e.missCount |= 1;
    else if (r === 1) e.missCount |= 4;
    else if (r === 2) e.missCount |= 2;
    if (r !== 3) e.game.audio?.enemyDig?.(e.pos);
    e.hitCount++;
    if (e.hitCount === times.length) { e.animIndex = -1; e.hitCount = 0; }
  },
};

const GIVE_UP = {
  name: 'giveUp',
  enter(e) {
    e.zeroVelocity();
    e.playClip(e.kind === 'zombie' ? 'eat_start' : 'enraged', false);
  },
  update(e) { if (e.finished) e.remove(); },
};

const HIT = {
  name: 'hit',
  enter(e) {
    e.zeroVelocity();
    e.playClip(e.kind === 'zombie' ? (randomInt(0, 2) ? 'hit_reaction3' : 'hit_reaction1') : `gethit${randomInt(0, 3) + 1}`, false);
    e.setClipSpeed(e.T.hitSpeed);
  },
  update(e) { if (e.nearEnd) e.change(e.S.chase); },
};

// they fall, and lie there five seconds after the fall is done (then fade away)
const DIE = {
  name: 'die',
  enter(e) {
    e.zeroVelocity();
    e.blocking = false;
    e.hittable = false;
    e.dead = true;
    e.playClip(`death${randomInt(0, e.kind === 'zombie' ? 3 : 7) + 1}`, false);
    e.frustration = 5;
    e.setClipSpeed(e.T.dieSpeed);
    if (e.growl) { e.game.audio?.stop?.(e.growl); e.growl = null; }
  },
  update(e, dt) {
    if (!e.finished) return;
    e.frustration -= dt;
    e.body.opacity = e.opacity = Math.min(1, Math.max(0, e.frustration / 0.6));
    if (e.frustration < 0) e.remove();
  },
};

// ---- the archers ------------------------------------------------------------------------------

const ARCHER_CHASE = {
  name: 'archerChase',
  enter(e) {
    e.blocking = true;
    e.hittable = true;
    e.playClip('walk_archer1', true);
    e.setClipSpeed(e.speed / 1);
    e.frustration = 2.5;
    e.stateTimer = 0;
  },
  update(e, dt) {
    growlFor(e);
    e.stateTimer -= dt;
    const t = e.target, v = e.vel;
    let dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    // in range, and it can see you: it stops to shoot
    if (dist < 35 && e.stateTimer <= 0) {
      e.stateTimer = 0.5;
      const ox = e.pos.x, oy = e.pos.y + 1.5, oz = e.pos.z;
      const lx = t.pos.x - ox, ly = t.pos.y + 1.5 - oy, lz = t.pos.z - oz;
      const L = Math.hypot(lx, ly, lz);
      if (L < 0.01 || !e.world.raycast(ox, oy, oz, lx / L, ly / L, lz / L, L, (id) => SOLID[id] === 1)) {
        e.faceTarget();
        e.change(ARCHER_ATTACK);
        return;
      }
    }
    if (e.frustration < 0) { e.change(e.S.giveUp); e.zeroVelocity(); return; }
    if (dist * dist < 0.001) { dx = 0; dz = 0; } else { dx /= dist; dz /= dist; }
    let s = e.speed;
    if (!e.onGround) s *= 0.5;
    else if (e.touchingWall) v.y += 10;
    v.x = dx * s;
    v.z = dz * s;
    if (v.x * v.x + v.z * v.z > 0.2) e.yaw = Math.atan2(v.x, v.z);
  },
};

const ARCHER_ATTACK = {
  name: 'archerAttack',
  enter(e) {
    e.zeroVelocity();
    e.hitCount = 0;
    e.playClip('atack_archer1', false);
    e.swingCount--;
  },
  update(e) {
    if (e.nearEnd) { e.change(e.swingCount <= 0 ? e.S.giveUp : ARCHER_IDLE); return; }
    e.faceTarget();
    if (e.clip.t > 1.1 && !e.hitCount) {
      e.hitCount = 1;
      const t = e.target;
      e.game.enemies.shootArrow(new THREE.Vector3(e.pos.x, e.pos.y + 1.5, e.pos.z), new THREE.Vector3(t.pos.x, t.pos.y + 0.5, t.pos.z));
    }
  },
};

const ARCHER_IDLE = {
  name: 'archerIdle',
  enter(e) {
    e.zeroVelocity();
    e.playClip('idle_archer1', true);
    e.stateTimer = 1 + Math.random() * 2;
  },
  update(e, dt) {
    e.stateTimer -= dt;
    if (e.stateTimer <= 0) e.change(e.S.chase);
  },
};

// each kind's states (the original's EnemyType.Get*State): skeletons come straight on, and
// can't dig, so a frustrated one gives up
const ZOMBIE = { emerge: EMERGE, chase: CHASE, attack: ATTACK, dig: DIG, giveUp: GIVE_UP, hit: HIT, die: DIE };
const SKELETON = { emerge: CHASE, chase: CHASE, attack: ATTACK, dig: GIVE_UP, giveUp: GIVE_UP, hit: HIT, die: DIE };
const ARCHER = { emerge: EMERGE, chase: ARCHER_CHASE, attack: ARCHER_ATTACK, dig: GIVE_UP, giveUp: GIVE_UP, hit: HIT, die: DIE };
