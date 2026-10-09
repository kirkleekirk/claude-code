// A zombie or a skeleton: a body on the avatar rig, driven by a small brain. It moves the way
// the player does (the same kind of box against the same blocks, hopping up single blocks),
// hunts the player when they're near, strikes when it reaches them, staggers when it's hit and
// falls when it dies. It can't climb walls or dig: a tower or a wall keeps it out, as in
// CastleMiner Z.

import * as THREE from 'three';
import { AvatarModel } from './avatar/model.js';
import { SOLID, B, BLOCKS } from '../world/blocks.js';

// What the dead can dig through, by how far out they are (after CastleMiner Z: out past the
// Desert they get through stone, the Mountains copper, the Snowfields iron, the Edge gold;
// diamond stops them all, and nothing gets through bloodstone or bedrock).
const DIG_TIER = (id) => {
  switch (id) {
    case B.DIRT: case B.GRASS: case B.SAND: case B.SNOW: case B.SNOW_GRASS: case B.LEAVES: case B.WOOD:
    case B.LOG: case B.GLASS: case B.ICE: case B.CRATE: case B.LANTERN: return 0;
    case B.ROCK: case B.COAL_ORE: case B.COPPER_ORE: case B.IRON_ORE: case B.GOLD_ORE: case B.DIAMOND_ORE: return 1;
    case B.COPPER_WALL: return 2;
    case B.IRON_WALL: return 3;
    case B.GOLD_WALL: return 4;
    default: return 99;
  }
};
export function digTierAt(dist) {
  return dist < 950 ? 0 : dist < 1600 ? 1 : dist < 2300 ? 2 : dist < 3000 ? 3 : 4;
}

const EPS = 0.001;
const GRAVITY = 27;
const _d = new THREE.Vector3(), _e = new THREE.Vector3();

export const KINDS = {
  zombie: { hp: 40, damage: 10, speed: 2.2, reach: 1.3, rate: 1.5, blood: 0x5a0805, height: 1.74, aggro: 46, strike: 'swingClub', strikeAt: 0.42, strikeLen: 0.95 },
  skeleton: { hp: 55, damage: 14, speed: 3.1, reach: 1.3, rate: 1.15, blood: 0xcfc6ac, height: 1.7, aggro: 30, strike: 'punch', strikeAt: 0.3, strikeLen: 0.7 },
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Enemy {
  // scale: { hp, damage, speed } multipliers for how far out and how many days in
  constructor(game, kind, look, shared, x, y, z, scale = {}) {
    const K = KINDS[kind];
    this.game = game;
    this.world = game.world;
    this.kind = kind;
    this.K = K;
    this.model = new AvatarModel(look, game.app.sky.uniforms, game.app.terrain.uniforms, shared);
    this.root = this.model.root;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.radius = 0.3;
    this.height = K.height;
    this.maxHp = this.hp = Math.round(K.hp * (scale.hp ?? 1));
    this.damage = Math.round(K.damage * (scale.damage ?? 1));
    this.speed = K.speed * (scale.speed ?? 1) * (0.88 + Math.random() * 0.24);
    this.bloodColor = K.blood;
    this.onGround = false;
    this.dead = false;
    this.deadT = 0;
    this.gone = false;
    this.attackT = 0.6 + Math.random();
    this.strikeT = 0;
    this.struck = false;
    this.flash = 0;
    this.stagger = 0;
    this.wander = Math.random() * Math.PI * 2;
    this.wanderT = 0;
    this.detour = 0;
    this.detourT = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.stuckT = 0;
    this.t = Math.random() * 10;
    this.hunch = 0.08 + Math.random() * 0.22;
    this.tilt = (Math.random() - 0.5) * 0.6;
    this.armLazy = Math.random();
    this.headMark = this.model.attach('HEAD__Skeleton', [0, 1.32, 0]);
    this.groanT = 1 + Math.random() * 6;
    this.animAcc = 0;
    this.hunting = false;
    this.dig = null; // { x, y, z, t, need }
    this.blockedT = 0;
    this.digTier = scale.digTier ?? 0;
    this.sprint = false;
    // the dead come up out of the ground
    this.rise = kind === 'zombie' && scale.rise !== false ? 1.5 : 0;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (this.rise) this.root.position.y -= 1.9;
  }

  // Does the body's box at (x, y, z) overlap anything solid?
  collides(x, y, z) {
    const r = this.radius, w = this.world;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r - EPS);
    const y0 = Math.floor(y), y1 = Math.floor(y + this.height - EPS);
    const z0 = Math.floor(z - r), z1 = Math.floor(z + r - EPS);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      if (SOLID[w.getBlock(bx, by, bz)]) return true;
    }
    return false;
  }

  // Is there a block in the cell (x, y, z)?
  occupies(x, y, z) {
    if (this.dead) return false;
    const r = this.radius;
    return x + 1 > this.pos.x - r && x < this.pos.x + r && z + 1 > this.pos.z - r && z < this.pos.z + r && y + 1 > this.pos.y && y < this.pos.y + this.height;
  }

  // What's ahead on a heading: 0 clear, 1 a step it can hop, 2 a wall (or a drop it won't take)
  probe(heading, wantDown = false) {
    const w = this.world;
    const ax = this.pos.x + Math.sin(heading) * (this.radius + 0.42), az = this.pos.z + Math.cos(heading) * (this.radius + 0.42);
    const y = Math.floor(this.pos.y + 0.05);
    const s0 = SOLID[w.getBlock(ax, y, az)], s1 = SOLID[w.getBlock(ax, y + 1, az)], s2 = SOLID[w.getBlock(ax, y + 2, az)];
    if (s1 || (s0 && s2)) return 2;
    if (s0) return SOLID[w.getBlock(this.pos.x, y + 2, this.pos.z)] ? 2 : 1;
    // a long drop, or lava
    let floor = 0;
    for (let k = 1; k <= 4; k++) {
      const id = w.getBlock(ax, y - k, az);
      if (id === B.LAVA) return 2;
      if (SOLID[id]) { floor = k; break; }
    }
    if (!floor && !wantDown) return 2;
    return 0;
  }

  hurt(dmg, dir, head, game) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 1;
    this.stagger = Math.min(0.55, 0.12 + dmg / 70);
    const k = 1.5 + Math.min(4, dmg * 0.06);
    this.knock.x += dir.x * k;
    this.knock.z += dir.z * k;
    this.hunting = true;
    if (this.hp <= 0) this.die(dir, game, head);
    else game.audio?.enemyHurt?.(this.kind, this.pos);
  }

  die(dir, game) {
    this.dead = true;
    this.deadT = 0;
    this.strikeT = 0;
    if (game) game.stats.kills++;
    // over backward, away from whatever killed it
    if (dir) this.yaw = Math.atan2(-dir.x, -dir.z);
    this.root.rotation.y = this.yaw;
    const L = this.model.layer;
    L.reach = 0; L.reachL = null; L.reachR = null; L.lean = 0; L.tilt = 0; L.yaw = 0; L.pitch = 0;
    this.model.play('faint', { once: true, fade: 0.1, speed: 1.2 + Math.random() * 0.2 });
    game?.audio?.enemyDie?.(this.kind, this.pos);
  }

  // dt: seconds; ctx: { player, near (distance for detail) }
  update(dt, ctx) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4.5);
    const u = this.model.material.uniforms;
    u.uFlash.value = this.flash * 0.6;
    if (this.dead) { this.updateDead(dt); this.light(); return; }
    const w = this.world;
    if (!w.isLoaded(this.pos.x, this.pos.z)) return;
    const p = ctx.player;
    if (this.rise > 0) { this.updateRise(dt, p); this.light(); return; }
    _d.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const dist = _d.length();
    const dy = p.pos.y - this.pos.y;
    this.dist = dist;
    if (p.dead) this.hunting = false;
    else if (dist < this.K.aggro) this.hunting = true;
    else if (dist > this.K.aggro * 1.4) this.hunting = false;

    // where it wants to go
    let goal;
    if (this.hunting) goal = Math.atan2(_d.x, _d.z);
    else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 2.5 + Math.random() * 5; this.wander += (Math.random() - 0.5) * 2.4; }
      goal = this.wander;
    }
    let speed = this.hunting ? this.speed * (this.sprint ? 1.55 : 1) : this.speed * 0.32;
    if (!this.hunting && Math.sin(this.t * 0.6 + this.armLazy * 9) > 0.5) speed = 0; // standing about
    const close = this.hunting && dist < this.K.reach * 0.75 && Math.abs(dy) < 1.5;
    if (close) speed = 0;
    // round walls: try headings to one side, then the other, and keep to one for a while
    let heading = goal;
    if (speed > 0) {
      if (this.detourT > 0) {
        this.detourT -= dt;
        heading = this.detour;
        if (this.probe(goal, dy < -1) !== 2 && this.detourT < 0.4) this.detourT = 0;
      }
      const ahead = this.probe(heading, this.hunting && dy < -1);
      // walled off from the player: dig through, if it's something they can break out here
      if (this.kind === 'zombie' && this.hunting && Math.abs(dy) < 6 && (dist < 9 || (this.noWay && dist < 18)) && this.probe(goal, true) === 2 && this.onGround) {
        this.blockedT += dt;
        if (this.blockedT > 0.9 && !this.dig) this.startDig(goal);
      } else this.blockedT = Math.max(0, this.blockedT - dt * 2);
      if (this.dig) { speed = 0; heading = goal; }
      else if (ahead === 2) {
        let found = false;
        for (let k = 1; k <= 5 && !found; k++) {
          for (const s of [this.side, -this.side]) {
            const h = goal + s * k * 0.55;
            if (this.probe(h, this.hunting && dy < -1) !== 2) { this.detour = h; this.detourT = 0.7 + Math.random() * 0.8; this.side = s; heading = h; found = true; break; }
          }
        }
        this.noWay = !found;
        if (!found) { speed = 0; if (!this.hunting) this.wander += Math.PI * (0.5 + Math.random()); }
      } else if (ahead === 1 && this.onGround) {
        this.vel.y = 8.1; // hop up the step
        this.onGround = false;
      }
    }
    if (this.stagger > 0) { this.stagger -= dt; speed *= 0.15; }
    if (this.strikeT > 0) speed *= 0.25;

    // steer and move
    const tx = Math.sin(heading) * speed, tz = Math.cos(heading) * speed;
    const acc = this.onGround ? 10 : 2.5;
    this.vel.x += (tx - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, acc * dt);
    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -50) this.vel.y = -50;
    const kx = this.knock.x, kz = this.knock.z;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
    this.move(dt, kx, kz);
    // stuck in a wall (a block placed on it, or bad ground): climb out
    if (this.collides(this.pos.x, this.pos.y, this.pos.z)) {
      this.stuckT += dt;
      if (this.stuckT > 0.3) { this.pos.y += 1; this.stuckT = 0; }
    } else this.stuckT = 0;
    if (this.pos.y < -20) { this.gone = true; return; }

    // face where it's going, or the player when it's at them
    const face = close || this.strikeT > 0 ? goal : speed > 0.2 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw;
    const turn = wrap(face - this.yaw);
    this.yaw += Math.sign(turn) * Math.min(Math.abs(turn), dt * (this.kind === 'skeleton' ? 7 : 4.5));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;

    if (this.dig) this.updateDig(dt, goal);
    // strike
    this.attackT -= dt;
    if (this.strikeT > 0) {
      this.strikeT -= dt;
      if (!this.struck && this.strikeT <= this.K.strikeLen - this.K.strikeAt) {
        this.struck = true;
        if (dist < this.K.reach + 0.35 && Math.abs(dy) < 1.7 && !p.dead) p.hurt(this.damage, this.pos, this.kind);
      }
    } else if (this.hunting && dist < this.K.reach && Math.abs(dy) < 1.6 && this.attackT <= 0 && this.canSee(p)) {
      this.attackT = this.K.rate * (0.85 + Math.random() * 0.3);
      this.strikeT = this.K.strikeLen;
      this.struck = false;
      this.model.play(this.K.strike, { once: true, fade: 0.12, speed: 1.25, restart: true });
      this.game.audio?.enemyAttack?.(this.kind, this.pos);
    }

    // a groan now and then
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = (this.hunting ? 3 : 6) + Math.random() * 6;
      if (dist < 30) this.game.audio?.enemyIdle?.(this.kind, this.pos, dist);
    }

    // the body (far away, every other frame)
    this.animAcc += dt;
    if (dist > 34 && this.animAcc < 0.05) { this.light(); return; }
    this.animate(this.animAcc, Math.hypot(this.vel.x, this.vel.z), dist, dy, goal);
    this.animAcc = 0;
    this.light();
  }

  // Climbing up out of the ground, dirt flying.
  updateRise(dt, p) {
    const m = this.model;
    this.rise -= dt;
    const f = Math.max(0, this.rise / 1.5);
    this.root.position.copy(this.pos);
    this.root.position.y -= 1.9 * f * f;
    _d.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    this.yaw = Math.atan2(_d.x, _d.z);
    this.root.rotation.y = this.yaw;
    const L = m.layer;
    L.reach = 0.6 * (1 - f); L.reachL = null; L.reachR = null; L.lean = 0.3 * f; L.lift = 0.4 * f;
    m.play('climb', { fade: 0.1, speed: 1.3 });
    m.update(dt);
    this.dirtT = (this.dirtT || 0) - dt;
    if (this.dirtT <= 0 && this.game.sprites) {
      this.dirtT = 0.12;
      const id = this.world.getBlock(this.pos.x, this.pos.y - 0.5, this.pos.z);
      const col = BLOCKS[id]?.color ?? 0x6a4a2a;
      this.game.sprites.emit('dust', this.pos.x, this.pos.y + 0.1, this.pos.z, { color: col, size: 0.12, life: 0.7, spread: 1.6, gravity: 7, alpha: 0.9 });
    }
    if (this.rise <= 0) { this.rise = 0; m.play('idle', { fade: 0.2 }); }
  }

  startDig(heading) {
    const w = this.world;
    const ax = Math.floor(this.pos.x + Math.sin(heading) * (this.radius + 0.5)), az = Math.floor(this.pos.z + Math.cos(heading) * (this.radius + 0.5));
    const y = Math.floor(this.pos.y + 0.05);
    for (const yy of [y + 1, y]) {
      const id = w.getBlock(ax, yy, az);
      if (!SOLID[id]) continue;
      const tier = DIG_TIER(id);
      // the hardest they can manage, they manage only sometimes
      if (tier > this.digTier || (tier === 4 && Math.random() < 0.6)) { this.blockedT = -2; return; }
      const hard = BLOCKS[id]?.hardness ?? 2;
      this.dig = { x: ax, y: yy, z: az, t: 0, need: (1.2 + hard * 1.6) / (1 + this.digTier * 0.3), id, swing: 0 };
      return;
    }
    this.blockedT = 0;
  }

  updateDig(dt, goal) {
    const d = this.dig, w = this.world;
    if (w.getBlock(d.x, d.y, d.z) !== d.id) { this.dig = null; this.blockedT = 0; return; }
    d.t += dt;
    d.swing -= dt;
    this.yaw = goal;
    this.root.rotation.y = goal;
    if (d.swing <= 0) {
      d.swing = 0.85;
      this.model.play(this.K.strike, { once: true, fade: 0.1, speed: 1.4, restart: true });
      this.strikeT = 0.6;
      this.struck = true;
      this.game.audio?.enemyDig?.(this.pos, d.id);
      this.game.debris?.burst?.(d.x + 0.5, d.y + 0.5, d.z + 0.5, BLOCKS[d.id]?.color ?? 0x777777, 4, 0.5);
    }
    if (d.t >= d.need) {
      w.setBlock(d.x, d.y, d.z, B.AIR);
      this.game.debris?.burst?.(d.x + 0.5, d.y + 0.5, d.z + 0.5, BLOCKS[d.id]?.color ?? 0x777777, 12, 0.6);
      this.game.audio?.breakBlock?.(BLOCKS[d.id]?.sound || 'stone');
      this.dig = null;
      this.blockedT = 0.5;
    }
  }

  canSee(p) {
    const h = this.headMark.getWorldPosition(_e);
    const eye = p.eye;
    const dx = eye.x - h.x, dy = eye.y - h.y, dz = eye.z - h.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return true;
    const hit = this.world.raycast(h.x, h.y, h.z, dx / L, dy / L, dz / L, L, (id) => SOLID[id] === 1);
    return !hit;
  }

  move(dt, kx, kz) {
    const vx = this.vel.x + kx, vz = this.vel.z + kz;
    const steps = Math.max(1, Math.ceil((Math.abs(vx) + Math.abs(this.vel.y) + Math.abs(vz)) * dt / 0.3));
    const h = dt / steps;
    let grounded = false;
    for (let i = 0; i < steps; i++) {
      for (const axis of ['x', 'z']) {
        const d = (axis === 'x' ? vx : vz) * h;
        if (!d) continue;
        const nx = axis === 'x' ? this.pos.x + d : this.pos.x;
        const nz = axis === 'z' ? this.pos.z + d : this.pos.z;
        if (!this.collides(nx, this.pos.y, nz)) { this.pos.x = nx; this.pos.z = nz; continue; }
        const p0 = this.pos[axis], r = this.radius;
        this.pos[axis] = d > 0 ? Math.floor(p0 + r + d) - r - EPS : Math.floor(p0 - r + d) + 1 + r + EPS;
        if (this.collides(this.pos.x, this.pos.y, this.pos.z)) this.pos[axis] = p0;
        this.vel[axis] = 0;
      }
      const dy = this.vel.y * h;
      if (!this.collides(this.pos.x, this.pos.y + dy, this.pos.z)) this.pos.y += dy;
      else {
        if (dy < 0) {
          this.pos.y = Math.floor(this.pos.y + dy) + 1 + EPS;
          if (this.collides(this.pos.x, this.pos.y, this.pos.z)) this.pos.y = Math.ceil(this.pos.y);
          grounded = true;
        } else this.pos.y = Math.floor(this.pos.y + this.height + dy) - this.height - EPS;
        this.vel.y = 0;
      }
    }
    this.onGround = grounded || (this.vel.y <= 0 && this.collides(this.pos.x, this.pos.y - 0.05, this.pos.z));
  }

  // The pose: the pack's walk under a shamble (arms out, hunched, head lolling) for the dead,
  // a stiff, quick march for the skeletons.
  animate(dt, speed, dist, dy, goal) {
    const m = this.model, L = m.layer, t = this.t;
    L.reach = 0; L.reachL = null; L.reachR = null; L.lift = 0; L.spread = 0; L.sway = 0; L.swayRate = 1;
    L.lean = 0; L.tilt = 0; L.yaw = 0; L.pitch = 0; L.handL = null; L.handR = null;
    const zombie = this.kind === 'zombie';
    if (this.strikeT > 0) {
      L.lean = this.hunch * 0.5 + 0.1;
    } else {
      if (speed < 0.12) m.play('idle', { fade: 0.35 });
      else if (zombie && speed > 3.0) m.play('run', { fade: 0.3, speed: Math.min(1.35, Math.max(0.7, speed / 3.4)) });
      else m.play('walk', { fade: 0.3, speed: Math.min(2.6, Math.max(0.4, speed / (zombie ? 1.05 : 0.95))) });
      if (zombie) {
        const reach = this.hunting ? 0.92 : 0.3 + this.armLazy * 0.4;
        L.reach = reach;
        L.reachR = reach * (0.8 + this.armLazy * 0.2);
        L.sway = 1;
        L.swayRate = 0.8 + speed * 0.2;
        L.lean = this.hunch + Math.min(speed, 3) * 0.05;
        L.tilt = this.tilt + Math.sin(t * 1.3) * 0.06;
      } else {
        L.reach = this.hunting ? 0.45 : 0;
        L.lean = 0.04;
        L.tilt = Math.sin(t * 7.3) * 0.04;
      }
    }
    if (this.stagger > 0) { L.lean -= this.stagger * 0.7; L.reach *= 0.3; if (L.reachR != null) L.reachR *= 0.3; L.spread = this.stagger * 0.4; }
    // the head turns to the player when it's near
    let hy = zombie ? Math.sin(t * 0.8) * 0.15 : 0, hp = -L.lean * 0.6;
    if (this.hunting && dist < 14) {
      hy = Math.max(-1, Math.min(1, wrap(goal - this.yaw)));
      hp = Math.max(-0.5, Math.min(0.5, -Math.atan2(dy + 0.2, Math.max(0.5, dist)))) - L.lean * 0.4;
    }
    L.yaw = hy;
    L.pitch = hp;
    m.update(dt);
  }

  updateDead(dt) {
    this.deadT += dt;
    const m = this.model;
    // keep falling with gravity if it died in the air
    this.vel.x *= Math.max(0, 1 - dt * 6); this.vel.z *= Math.max(0, 1 - dt * 6);
    this.vel.y -= GRAVITY * dt;
    this.move(dt, this.knock.x, this.knock.z);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    this.root.position.copy(this.pos);
    if (this.deadT < 2.4) m.update(dt);
    // then sink away
    const f = Math.max(0, (this.deadT - 2.6) / 1.3);
    if (f > 0) {
      this.root.position.y -= f * 0.45;
      m.material.uniforms.uOpacity.value = 1 - f;
    }
    if (f >= 1) this.gone = true;
  }

  light() {
    const h = this.root.position;
    const L = this.world.lightAt(h.x, h.y + 1.45, h.z);
    this.model.setLight(L.sky / 15, L.block / 15);
  }

  // Where a ray first meets this body: { dist, head } or null
  intersect(o, d, maxDist) {
    if (this.dead) return null;
    // the head: a sphere round the skull
    const h = this.headMark.getWorldPosition(_e);
    let best = null;
    const hr = this.kind === 'skeleton' ? 0.2 : 0.22;
    const ox = o.x - h.x, oy = o.y - h.y, oz = o.z - h.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const c = ox * ox + oy * oy + oz * oz - hr * hr;
    const disc = b * b - c;
    if (disc >= 0) {
      const tt = -b - Math.sqrt(disc);
      if (tt > 0 && tt < maxDist) best = { dist: tt, head: true };
    }
    // the body: an upright cylinder from the feet to the shoulders
    const r = 0.27, y0 = this.pos.y, y1 = h.y - hr * 0.8;
    const px = o.x - this.pos.x, pz = o.z - this.pos.z;
    const A = d.x * d.x + d.z * d.z;
    if (A > 1e-8) {
      const B2 = px * d.x + pz * d.z, C = px * px + pz * pz - r * r;
      const D = B2 * B2 - A * C;
      if (D >= 0) {
        const s = Math.sqrt(D);
        for (const tt of [(-B2 - s) / A, (-B2 + s) / A]) {
          if (tt <= 0 || tt >= maxDist) continue;
          const y = o.y + d.y * tt;
          if (y >= y0 && y <= y1) { if (!best || tt < best.dist) best = { dist: tt, head: false }; break; }
        }
      }
    }
    return best;
  }

  dispose() {
    this.model.dispose();
    this.model.material.dispose();
    this.root.removeFromParent();
  }
}
