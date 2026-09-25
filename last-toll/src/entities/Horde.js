import * as THREE from 'three';
import { WalkerModel, makeVolumes } from './WalkerModel.js';
import { RNG } from '../core/rng.js';
import { rayCapsule, raySphere, wrapAngle } from '../core/math.js';
import { rollItem } from '../data/loot.js';

// Walkers: perception, pathing (flow fields), grabbing, crippling, dying.
// The dead only die when the brain is destroyed. Body damage staggers,
// knocks down, or takes their legs.

let NEXT_ID = 1;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = { x: 0, z: 0 };

export class Walker {
  constructor(horde, pos, opts) {
    this.id = NEXT_ID++;
    this.horde = horde;
    const rng = horde.rng;
    this.riot = !!opts.riot;
    this.fresh = !!opts.fresh;
    this.model = new WalkerModel(rng, { riot: this.riot, fresh: this.fresh });
    this.root = this.model.root;
    this.pos = this.root.position;
    this.pos.set(pos.x, 0, pos.z);
    this.facing = rng.range(-Math.PI, Math.PI);
    this.vel = new THREE.Vector3();
    this.push = new THREE.Vector3();
    this.state = opts.state || 'wander';
    this.t = 0;
    this.skull = 100;
    this.legs = 100;
    this.helmet = this.riot;
    this.helmetHits = 0;
    this.wanderSpeed = rng.range(0.35, 0.65);
    this.chaseSpeed = this.fresh ? rng.range(2.3, 2.8) : rng.range(1.25, 1.8);
    this.home = this.pos.clone();
    this.target = this.pos.clone();
    this.pickWander(rng);
    this.senseT = rng.range(0, 0.4);
    this.seesPlayer = false;
    this.lastSeen = new THREE.Vector3();
    this.lostT = 0;
    this.attackCd = 0;
    this.groanT = rng.range(2, 12);
    this.stuckT = 0;
    this.stuckCheck = this.pos.clone();
    this.sidestepT = 0;
    this.sidestep = new THREE.Vector3();
    this.stagger = 0;
    this.lunge = 0;
    this.biteT = 0;
    this.downT = 0;
    this.deadT = 0;
    this.useNoiseField = false;
    this.lod = 0;
    this.vol = makeVolumes();
    this.volFrame = -1;
    this.lootRolled = false;
    this.alive = true;
    this.hunting = !!opts.hunting;
    if (this.state === 'dormant') {
      this.model.fall = 1;
      this.model.fallDir = rng.chance(0.5) ? 1 : -1;
    }
    this.root.rotation.y = this.facing;
  }

  pickWander(rng) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(2, 9);
    this.target.set(this.home.x + Math.cos(a) * d, 0, this.home.z + Math.sin(a) * d);
    this.waitT = rng.chance(0.4) ? rng.range(1, 5) : 0;
  }

  get dead() { return this.state === 'dead'; }
  get isDown() { return this.state === 'down' || this.state === 'dormant' || this.state === 'getup'; }
  get canAct() { return !this.dead && this.state !== 'dormant' && this.state !== 'down' && this.state !== 'getup'; }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  volumes() {
    if (this.volFrame !== this.horde.frame) {
      this.model.volumes(this.vol);
      this.volFrame = this.horde.frame;
    }
    return this.vol;
  }

  headPos(out) {
    return out.copy(this.volumes().head);
  }

  // Knock back and stagger. dir: unit vector away from the attacker.
  shove(dirX, dirZ, strength = 1, duration = 0.8) {
    if (this.dead || this.state === 'dormant') return;
    if (this.state === 'grab') this.horde.player.releaseGrabber(this);
    if (this.state === 'held') return;
    if (this.crawlerLike) {
      this.push.x += dirX * strength * 0.6;
      this.push.z += dirZ * strength * 0.6;
      return;
    }
    this.push.x += dirX * strength * 2.4;
    this.push.z += dirZ * strength * 2.4;
    this.stagger = Math.max(this.stagger, duration);
    if (this.state !== 'down') this.setState('stagger');
    this.attackCd = Math.max(this.attackCd, 0.9);
  }

  knockDown(dirX, dirZ, strength = 1) {
    if (this.dead || this.model.crawler) return;
    if (this.state === 'grab') this.horde.player.releaseGrabber(this);
    this.push.x += dirX * strength * 2.0;
    this.push.z += dirZ * strength * 2.0;
    // fall away from the hit: backward relative to facing if hit from the front
    const fwdX = Math.sin(this.facing), fwdZ = Math.cos(this.facing);
    this.model.fallDir = fwdX * dirX + fwdZ * dirZ > 0 ? 1 : -1;
    this.downT = this.horde.rng.range(2.2, 3.4);
    this.setState('down');
    this.horde.audio.bodyFall(this.pos);
  }

  get crawlerLike() { return this.model.crawler; }
}

export class Horde {
  constructor({ scene, world, player, audio, fx, env, loot, rng, events }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.fx = fx;
    this.env = env;
    this.loot = loot;
    this.rng = rng || new RNG(1);
    this.events = events;
    this.walkers = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.playerField = world.newField();
    this.noiseField = world.newField();
    this.fieldT = 0;
    this.noiseFieldT = 0;
    this.noisePos = new THREE.Vector3();
    this.noiseId = 0;
    this.frame = 0;
    this.corpses = [];
    this.anyChasing = false;
  }

  spawn(pos, opts = {}) {
    const w = new Walker(this, pos, opts);
    this.walkers.push(w);
    this.group.add(w.root);
    return w;
  }

  get aliveCount() {
    let n = 0;
    for (const w of this.walkers) if (!w.dead) n++;
    return n;
  }

  // Sound travels: walkers inside the radius come to investigate.
  noise(pos, radius, opts = {}) {
    if (radius <= 0) return;
    const big = radius >= 14;
    if (big && this.noiseFieldT <= 0) {
      this.world.computeField(this.noiseField, pos.x, pos.z, Math.min(160, Math.ceil(radius * 2.2)));
      this.noiseFieldT = 0.6;
      this.noisePos.copy(pos);
      this.noiseId++;
    }
    for (const w of this.walkers) {
      if (w.dead || w.state === 'held' || w.state === 'grab') continue;
      const d = Math.hypot(w.pos.x - pos.x, w.pos.z - pos.z);
      if (d > radius) continue;
      if (d > radius * 0.55 && !this.world.lineOfSight(w.pos.x, 1.6, w.pos.z, pos.x, 1.5, pos.z)) {
        // muffled through walls
        if (d > radius * 0.7) continue;
      }
      if (w.state === 'dormant') {
        if (d < Math.min(radius, 14)) {
          w.setState('getup');
          w.target.copy(pos);
        }
        continue;
      }
      if (w.state === 'chase' || w.state === 'lunge') continue;
      if (w.isDown) { w.target.copy(pos); continue; }
      w.target.set(pos.x + this.rng.range(-2, 2), 0, pos.z + this.rng.range(-2, 2));
      w.useNoiseField = big && this.noiseId > 0;
      w.noiseRef = this.noiseId;
      if (w.state !== 'stagger') w.setState('investigate');
      if (opts.alarm && d < radius * 0.35) {
        w.setState('chase');
      }
    }
  }

  // ---- update -----------------------------------------------------------------

  update(dt, time) {
    this.frame++;
    const player = this.player;
    const P = player.pos;
    this.fieldT -= dt;
    this.noiseFieldT -= dt;
    if (this.fieldT <= 0 && this.anyChasing) {
      this.world.computeField(this.playerField, P.x, P.z, 150);
      this.fieldT = 0.35;
    }
    this.anyChasing = false;
    const ws = this.walkers;
    const rng = this.rng;
    const sight = this.env.sightRange;

    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const dx = P.x - w.pos.x, dz = P.z - w.pos.z;
      const dist = Math.hypot(dx, dz);
      w.distToPlayer = dist;
      // LOD: far walkers tick slowly and freeze their skeleton.
      const far = dist > 55;
      w.root.visible = dist < this.env.drawDistance;
      if (w.dead) {
        this._updateDead(w, dt);
        continue;
      }
      if (far) {
        w.lod = (w.lod + 1) % 4;
        if (w.lod !== 0 && w.state !== 'chase') continue;
      }
      const sdt = far && w.state !== 'chase' ? dt * 4 : dt;
      w.t += sdt;
      w.attackCd -= sdt;
      if (w.state === 'chase' || w.state === 'lunge' || w.hunting) this.anyChasing = true;

      // perception
      w.senseT -= sdt;
      if (w.senseT <= 0 && !player.dead) {
        w.senseT = 0.25 + rng.next() * 0.15;
        this._sense(w, dx, dz, dist, sight);
      }

      this._think(w, sdt, dx, dz, dist, rng);
      this._move(w, sdt, dist);

      // groans
      w.groanT -= sdt;
      if (w.groanT <= 0) {
        const chasing = w.state === 'chase' || w.state === 'lunge' || w.state === 'grab';
        w.groanT = chasing ? rng.range(1.8, 4.5) : rng.range(5, 14);
        if (dist < 30 && w.state !== 'dormant') {
          w.headPos(_v);
          this.audio.groan(_v, w.fresh ? 1.25 : rng.range(0.85, 1.1), chasing ? 0.85 : 0.35, rng.range(0.9, 1.7));
        }
      }

      if (!far || w.state === 'chase') {
        w.model.animate(sdt, {
          speed: Math.hypot(w.vel.x, w.vel.z),
          chase: w.state === 'chase',
          lunge: w.state === 'lunge' ? Math.min(1, w.t / 0.3) : 0,
          grab: w.state === 'grab',
          held: w.state === 'held',
          stagger: w.state === 'stagger' ? Math.min(1, w.stagger * 2) : 0,
          down: w.state === 'down' || w.state === 'dormant',
          getup: w.state === 'getup',
          dead: false,
        });
      }
      w.root.rotation.y = w.facing;
    }

    this._separate();
  }

  _sense(w, dx, dz, dist, sight) {
    const player = this.player;
    w.seesPlayer = false;
    if (w.state === 'held' || w.state === 'grab') { w.seesPlayer = true; return; }
    if (w.state === 'dormant') {
      const wake = player.crouched ? 1.8 : 3.4;
      if (dist < wake) {
        w.setState('getup');
        w.target.copy(player.pos);
      }
      return;
    }
    if (player.disguise > 0) {
      // smeared in their guts, you smell like one of them
      if (w.state === 'chase' && !w.hunting) {
        w.target.copy(w.lastSeen);
        w.useNoiseField = false;
        w.setState('investigate');
      }
      w.hunting = false;
      return;
    }
    let range = sight * (player.crouched ? 0.55 : 1);
    if (player.flashlightOn && this.env.darkness > 0.5) range *= 1.45;
    if (player.sprinting) range *= 1.15;
    const near = player.crouched ? 1.6 : 2.6;
    if (dist > range && dist > near) return;
    const fx = Math.sin(w.facing), fz = Math.cos(w.facing);
    const dot = (fx * dx + fz * dz) / (dist || 1);
    const inCone = dot > 0.3 || dist < near || w.state === 'chase';
    if (!inCone) return;
    const eye = this.world.lineOfSight(w.pos.x, 1.6, w.pos.z, player.eye.x, player.eye.y - 0.1, player.eye.z);
    if (!eye) {
      // chasers still smell you when very close
      if (w.state === 'chase' && dist < 3) w.seesPlayer = true;
      return;
    }
    w.seesPlayer = true;
    w.lastSeen.copy(player.pos);
    w.lostT = 0;
    if (w.state !== 'chase' && w.state !== 'lunge' && w.state !== 'stagger' && !w.isDown) {
      w.setState('chase');
      w.headPos(_v);
      if (dist < 25) this.audio.snarl(_v);
      this.events?.onSpotted?.(w);
    }
  }

  _think(w, dt, dx, dz, dist, rng) {
    const player = this.player;
    switch (w.state) {
      case 'wander': {
        if (w.waitT > 0) { w.waitT -= dt; w.desired = 0; break; }
        const tx = w.target.x - w.pos.x, tz = w.target.z - w.pos.z;
        if (Math.hypot(tx, tz) < 0.8 || w.t > 20) { w.pickWander(rng); w.t = 0; }
        w.desired = w.wanderSpeed;
        w.goal = w.target;
        if (w.hunting) { w.setState('chase'); }
        break;
      }
      case 'investigate': {
        const tx = w.target.x - w.pos.x, tz = w.target.z - w.pos.z;
        w.desired = w.wanderSpeed * 1.6;
        w.goal = w.target;
        if (Math.hypot(tx, tz) < 1.5 || w.t > 25) {
          w.home.copy(w.pos);
          w.pickWander(rng);
          w.setState('wander');
        }
        break;
      }
      case 'chase': {
        if (player.dead) { w.setState('wander'); break; }
        w.desired = w.chaseSpeed;
        if (!w.seesPlayer && !w.hunting) {
          w.lostT += dt;
          if (w.lostT > 7) {
            w.target.copy(w.lastSeen);
            w.useNoiseField = false;
            w.setState('investigate');
            break;
          }
        }
        const reach = w.model.crawler ? 1.0 : 1.3;
        if (dist < reach && w.attackCd <= 0 && !player.dead) {
          w.setState('lunge');
          w.headPos(_v);
          this.audio.snarl(_v);
        }
        break;
      }
      case 'lunge': {
        w.desired = w.model.crawler ? 0.2 : 0.6;
        const windup = w.fresh ? 0.38 : 0.55;
        if (w.t >= windup) {
          const fx = Math.sin(w.facing), fz = Math.cos(w.facing);
          const dot = (fx * dx + fz * dz) / (dist || 1);
          const reach = w.model.crawler ? 1.15 : 1.45;
          if (dist < reach && dot > 0.45 && !player.dead && player.canBeGrabbed(w)) {
            w.setState('grab');
            w.biteT = 0;
            player.addGrabber(w);
          } else {
            w.attackCd = 1.1;
            w.setState('chase');
          }
        }
        break;
      }
      case 'grab': {
        w.desired = 0;
        w.biteT += dt;
        const biteAt = (w.fresh ? 1.7 : 2.3) / Math.max(1, player.grabbers.length * 0.8);
        w.biteProgress = w.biteT / biteAt;
        if (w.biteT >= biteAt) {
          player.bite(w);
          w.attackCd = 2.5;
          const len = dist || 1;
          w.shove(-dx / len, -dz / len, 0.8, 0.9);
        }
        break;
      }
      case 'stagger': {
        w.desired = 0;
        w.stagger -= dt;
        if (w.stagger <= 0) w.setState('chase');
        break;
      }
      case 'down': {
        w.desired = 0;
        w.downT -= dt;
        if (w.downT <= 0) w.setState('getup');
        break;
      }
      case 'getup': {
        w.desired = 0;
        if (w.t > 1.3) {
          w.setState(w.seesPlayer || w.distToPlayer < 12 ? 'chase' : 'investigate');
        }
        break;
      }
      case 'dormant':
      case 'held':
      default:
        w.desired = 0;
    }
  }

  _move(w, dt, dist) {
    const world = this.world;
    const player = this.player;
    let speed = w.desired || 0;
    if (w.model.crawler) speed = Math.min(speed, 0.5);
    let dirX = 0, dirZ = 0;
    if (w.state === 'held') {
      w.vel.set(0, 0, 0);
      return;
    }
    if (w.state === 'grab') {
      // cling at arm's length, facing the player
      const dx = player.pos.x - w.pos.x, dz = player.pos.z - w.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = w.model.crawler ? 0.8 : 0.62;
      w.pos.x += (dx / d) * (d - want) * Math.min(1, dt * 8);
      w.pos.z += (dz / d) * (d - want) * Math.min(1, dt * 8);
      w.facing = Math.atan2(dx, dz);
      w.vel.set(0, 0, 0);
      world.resolveCircle(w.pos, 0.28);
      return;
    }
    if (speed > 0.01) {
      if (w.state === 'chase' || w.state === 'lunge') {
        const dx = player.pos.x - w.pos.x, dz = player.pos.z - w.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        let used = false;
        if (d > 2.2) {
          const r = world.fieldDir(this.playerField, w.pos.x, w.pos.z, _dir, dx / d, dz / d);
          if (r >= 0 && r < 65535 && (_dir.x || _dir.z)) {
            dirX = _dir.x; dirZ = _dir.z; used = true;
          }
        }
        if (!used) { dirX = dx / d; dirZ = dz / d; }
      } else if (w.goal) {
        const gx = w.goal.x - w.pos.x, gz = w.goal.z - w.pos.z;
        const d = Math.hypot(gx, gz) || 1;
        let used = false;
        if (w.state === 'investigate' && w.useNoiseField && w.noiseRef === this.noiseId && d > 2) {
          const r = world.fieldDir(this.noiseField, w.pos.x, w.pos.z, _dir, gx / d, gz / d);
          if (r >= 0 && r < 65535 && (_dir.x || _dir.z)) { dirX = _dir.x; dirZ = _dir.z; used = true; }
        }
        if (!used) { dirX = gx / d; dirZ = gz / d; }
      }
      // unstick: sidestep when blocked
      if (w.sidestepT > 0) {
        w.sidestepT -= dt;
        dirX = dirX * 0.3 + w.sidestep.x;
        dirZ = dirZ * 0.3 + w.sidestep.z;
        const l = Math.hypot(dirX, dirZ) || 1;
        dirX /= l; dirZ /= l;
      }
    }
    // steer velocity toward desired
    const tx = dirX * speed, tz = dirZ * speed;
    const k = Math.min(1, dt * (w.state === 'chase' ? 5 : 3));
    w.vel.x += (tx - w.vel.x) * k;
    w.vel.z += (tz - w.vel.z) * k;
    // impulses decay
    w.pos.x += (w.vel.x + w.push.x) * dt;
    w.pos.z += (w.vel.z + w.push.z) * dt;
    const decay = Math.exp(-dt * 5);
    w.push.x *= decay;
    w.push.z *= decay;
    world.resolveCircle(w.pos, 0.28);
    // face movement (or player when close/chasing)
    let faceX = w.vel.x, faceZ = w.vel.z;
    if ((w.state === 'chase' || w.state === 'lunge') && dist < 4) {
      faceX = player.pos.x - w.pos.x;
      faceZ = player.pos.z - w.pos.z;
    }
    if (Math.abs(faceX) + Math.abs(faceZ) > 0.02 && w.state !== 'stagger' && !w.isDown) {
      const target = Math.atan2(faceX, faceZ);
      w.facing += wrapAngle(target - w.facing) * Math.min(1, dt * (w.state === 'lunge' ? 10 : 4));
    }
    // stuck detection
    w.stuckT += dt;
    if (w.stuckT > 1.2) {
      const moved = Math.hypot(w.pos.x - w.stuckCheck.x, w.pos.z - w.stuckCheck.z);
      if (speed > 0.3 && moved < 0.25 * speed && w.sidestepT <= 0) {
        const a = this.rng.range(0, Math.PI * 2);
        w.sidestep.set(Math.cos(a), 0, Math.sin(a));
        w.sidestepT = 0.7;
        if (w.state === 'wander') w.pickWander(this.rng);
      }
      w.stuckT = 0;
      w.stuckCheck.copy(w.pos);
    }
  }

  _separate() {
    const ws = this.walkers;
    const P = this.player.pos;
    const minD = 0.62;
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i];
      if (a.dead || a.distToPlayer > 40) continue;
      for (let j = i + 1; j < ws.length; j++) {
        const b = ws[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        const aFixed = a.state === 'held' || a.state === 'grab';
        const bFixed = b.state === 'held' || b.state === 'grab';
        if (!aFixed) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
        if (!bFixed) { b.pos.x += nx * push; b.pos.z += nz * push; }
      }
      // body contact with the player
      if (a.state === 'held' || a.state === 'grab' || a.isDown) continue;
      const dx = a.pos.x - P.x, dz = a.pos.z - P.z;
      const d2 = dx * dx + dz * dz;
      const pr = 0.6;
      if (d2 < pr * pr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = pr - d;
        a.pos.x += (dx / d) * push * 0.75;
        a.pos.z += (dz / d) * push * 0.75;
        this.player.nudge(-(dx / d) * push * 0.25, -(dz / d) * push * 0.25);
      }
    }
  }

  _updateDead(w, dt) {
    w.deadT += dt;
    if (w.model.fall < 1) {
      const before = w.model.fall;
      w.model.animate(dt, { speed: 0, dead: true });
      if (before < 0.9 && w.model.fall >= 0.9) this.audio.bodyFall(w.pos);
      w.pos.x += w.push.x * dt;
      w.pos.z += w.push.z * dt;
      w.push.multiplyScalar(Math.exp(-dt * 6));
      this.world.resolveCircle(w.pos, 0.25);
      w.root.rotation.y = w.facing;
    }
  }

  // ---- damage --------------------------------------------------------------------

  kill(w, info = {}) {
    if (w.dead) return;
    if (w.state === 'grab') this.player.releaseGrabber(w);
    if (w.state === 'held') this.player.onHeldDied?.(w);
    w.setState('dead');
    w.alive = false;
    w.deadT = 0;
    const fx = Math.sin(w.facing), fz = Math.cos(w.facing);
    if (info.dirX !== undefined) {
      w.model.fallDir = fx * info.dirX + fz * info.dirZ > 0 ? 1 : -1;
      w.push.x += info.dirX * 1.2;
      w.push.z += info.dirZ * 1.2;
    } else w.model.fallDir = this.rng.chance(0.5) ? 1 : -1;
    if (w.model.crawler) w.model.fallDir = 1;
    this.corpses.push(w);
    if (this.corpses.length > 60) {
      const old = this.corpses.shift();
      this.group.remove(old.root);
      const idx = this.walkers.indexOf(old);
      if (idx >= 0) this.walkers.splice(idx, 1);
    }
    if (!w.lootRolled) {
      w.lootRolled = true;
      if (this.rng.chance(0.14)) {
        this.loot.dropItem(rollItem(this.rng, 'walker', 1), _v.set(w.pos.x + this.rng.range(-0.4, 0.4), 0, w.pos.z + this.rng.range(-0.4, 0.4)));
      }
    }
    this.fx.bloodPool(w.pos.x + fx * 0.8 * w.model.fallDir, w.pos.z + fz * 0.8 * w.model.fallDir, 0.9 + this.rng.next() * 0.6);
    this.events?.onKill?.(w, info);
  }

  // Resolve a hit on a walker body part. Returns a description for feedback.
  // hit: { part, damage (head/body amount), kind: 'stab'|'blunt'|'chop'|'bullet', power, pierce, sever,
  //        dirX, dirZ, fromBelow, armorPierce, knock, point }
  damage(w, hit) {
    if (w.dead) return { result: 'none' };
    const rng = this.rng;
    const r = { result: 'hit', part: hit.part };
    const helmetBlocks = w.helmet && hit.part === 'head' && !hit.fromBelow && !hit.armorPierce;
    if (hit.part === 'head') {
      if (helmetBlocks) {
        if (hit.kind === 'chop' && hit.heavy && hit.power >= 0.8) {
          // an axe splits the helmet open
          w.helmet = false;
          w.model.removeHelmet();
          this.fx.sparks(hit.point, 10);
          r.result = 'helmetOff';
          w.shove(hit.dirX, hit.dirZ, 0.8, 0.7);
          return r;
        }
        w.helmetHits++;
        if (hit.kind === 'blunt' && w.helmetHits >= 3) {
          w.helmet = false;
          w.model.removeHelmet();
          r.result = 'helmetOff';
        } else r.result = 'deflect';
        this.fx.sparks(hit.point, 6);
        w.shove(hit.dirX, hit.dirZ, 0.4 + (hit.knock || 0) * 0.5, 0.5);
        return r;
      }
      if (hit.kind === 'stab') {
        const need = w.fresh ? 0.55 : 0.5;
        if (hit.power * hit.pierce >= need || hit.fromBelow) {
          this.fx.blood(hit.point, 14, 1);
          r.result = 'kill';
          this.kill(w, { ...hit, how: 'stab' });
          return r;
        }
        r.result = 'glance';
        w.skull -= 10;
        this.fx.blood(hit.point, 4, 0.5);
        w.shove(hit.dirX, hit.dirZ, 0.3, 0.4);
        return r;
      }
      w.skull -= hit.damage;
      this.fx.blood(hit.point, hit.kind === 'bullet' ? 18 : 12, hit.kind === 'bullet' ? 1.4 : 1);
      if (w.skull <= 0) {
        r.result = 'kill';
        if ((hit.kind === 'chop' && hit.power >= (hit.sever || 1)) || (hit.kind === 'bullet' && hit.damage >= 300)) {
          w.model.removeHead();
          this.fx.gib(hit.point, hit.dirX, hit.dirZ);
          r.result = 'decap';
        }
        this.kill(w, { ...hit, how: hit.kind });
        return r;
      }
      // survived the blow: reel or drop
      if (hit.kind === 'blunt' && hit.power * (hit.knock || 0.5) > 0.55 && rng.chance(0.6)) {
        w.knockDown(hit.dirX, hit.dirZ, 0.8);
        r.result = 'knockdown';
      } else w.shove(hit.dirX, hit.dirZ, 0.5 + (hit.knock || 0.3), 0.6);
      return r;
    }
    // body / limbs never kill
    this.fx.blood(hit.point, hit.kind === 'bullet' ? 8 : 6, 0.7);
    if (hit.part === 'leg') {
      w.legs -= hit.damage * (hit.kind === 'chop' ? 1.6 : 1);
      if (w.legs <= 0 && !w.model.crawler && (hit.kind === 'chop' || hit.kind === 'bullet')) {
        w.model.removeLegs();
        if (w.state === 'grab') this.player.releaseGrabber(w);
        w.setState('chase');
        this.fx.gib(hit.point, hit.dirX, hit.dirZ);
        this.audio.bodyFall(w.pos);
        r.result = 'crippled';
        return r;
      }
    }
    const knockPower = hit.power * (hit.knock || 0.3);
    if (hit.kind !== 'stab' && knockPower > 0.6 && rng.chance(0.55 + knockPower * 0.3)) {
      w.knockDown(hit.dirX, hit.dirZ, 1);
      r.result = 'knockdown';
    } else {
      const str = hit.kind === 'bullet' ? 0.25 + hit.damage / 120 : 0.35 + knockPower;
      w.shove(hit.dirX, hit.dirZ, str, 0.35 + knockPower * 0.6);
      r.result = 'stagger';
    }
    return r;
  }

  // Ray against all walkers' hit volumes. Returns nearest {walker, part, t, point}.
  raycast(o, d, maxDist, opts = {}) {
    let best = null, bestT = maxDist;
    const pad = opts.pad || 0;
    for (const w of this.walkers) {
      if (w.dead && !opts.includeDead) continue;
      if (opts.exclude && opts.exclude.has(w)) continue;
      const rx = w.pos.x - o.x, rz = w.pos.z - o.z;
      const along = rx * d.x + rz * d.z;
      if (along < -2 || along > bestT + 2.5) continue;
      const perp = Math.abs(rx * d.z - rz * d.x);
      if (perp > 2.5) continue;
      const v = w.volumes();
      const headR = (w.helmet ? 0.16 : 0.14) + pad * 1.2;
      let t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, v.head.x, v.head.y, v.head.z, headR);
      if (t >= 0 && t < bestT) { bestT = t; best = { walker: w, part: 'head', t }; }
      t = rayCapsule(o, d, v.hips, v.neck, 0.2 + pad);
      if (t >= 0 && t < bestT) { bestT = t; best = { walker: w, part: 'body', t }; }
      if (!w.model.crawler) {
        for (const [a, b] of [[v.hips, v.kneeL], [v.kneeL, v.footL], [v.hips, v.kneeR], [v.kneeR, v.footR]]) {
          t = rayCapsule(o, d, a, b, 0.085 + pad);
          if (t >= 0 && t < bestT) { bestT = t; best = { walker: w, part: 'leg', t }; }
        }
      }
      for (const [a, b] of [[v.shL, v.handL], [v.shR, v.handR]]) {
        t = rayCapsule(o, d, a, b, 0.065 + pad * 0.5);
        if (t >= 0 && t < bestT) { bestT = t; best = { walker: w, part: 'arm', t }; }
      }
    }
    if (best) best.point = new THREE.Vector3(o.x + d.x * best.t, o.y + d.y * best.t, o.z + d.z * best.t);
    return best;
  }

  // Best living walker to grab or strike near the aim ray.
  nearestInFront(o, d, range, minDot = 0.8, filter = null) {
    let best = null, bestScore = Infinity;
    for (const w of this.walkers) {
      if (w.dead) continue;
      if (filter && !filter(w)) continue;
      const hp = w.volumes().head;
      const cx = (hp.x + w.pos.x) / 2, cy = hp.y * 0.75, cz = (hp.z + w.pos.z) / 2;
      _v2.set(cx - o.x, cy - o.y, cz - o.z);
      const dist = _v2.length();
      if (dist > range) continue;
      const dot = (_v2.x * d.x + _v2.y * d.y + _v2.z * d.z) / (dist || 1);
      const flat = Math.hypot(_v2.x, _v2.z);
      const flatDot = (_v2.x * d.x + _v2.z * d.z) / ((flat || 1) * (Math.hypot(d.x, d.z) || 1));
      if (flatDot < minDot && dot < minDot) continue;
      const score = dist * (2 - Math.max(dot, flatDot));
      if (score < bestScore) { bestScore = score; best = w; }
    }
    return best;
  }

  countNear(pos, radius) {
    let n = 0;
    for (const w of this.walkers) if (!w.dead && Math.hypot(w.pos.x - pos.x, w.pos.z - pos.z) < radius) n++;
    return n;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

