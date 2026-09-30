import * as THREE from 'three';
import { WalkerModel, makeVolumes } from './WalkerModel.js';
import { CREW } from '../data/story.js';
import { wrapAngle, clamp } from '../core/math.js';

// The Magnolia's crew, armed, on the Covenant job. They keep up with you, take the
// ladders when you do, and shoot at any Guardsman they can see. The Guard shoots
// back. A crew member who takes too much goes down and gets back up a little later:
// nobody aboard the Magnolia dies on this job unless you do.

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Ally {
  constructor(squad, id, pos, gun) {
    const c = CREW[id];
    this.squad = squad;
    this.id = id;
    this.name = c.name.split(' ')[0];
    this.isAlly = true;
    this.model = new WalkerModel(squad.rng, { soldier: true, living: c.look, gun });
    this.gun = gun;
    this.root = this.model.root;
    this.pos = this.root.position;
    this.pos.copy(pos);
    this.facing = 0;
    this.vel = new THREE.Vector3();
    this.hp = 260;
    this.down = false;
    this.downT = 0;
    this.target = null;
    this.senseT = Math.random() * 0.4;
    this.shotT = 1 + Math.random();
    this.aim = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.climb = null;
    this.vol = makeVolumes();
    this.volFrame = -1;
    this.slot = squad.allies.length;
    this.model.mesh.castShadow = true;
  }

  volumes() {
    if (this.volFrame !== this.squad.frame) {
      this.model.volumes(this.vol);
      this.volFrame = this.squad.frame;
    }
    return this.vol;
  }

  get eyeY() { return this.pos.y + 1.6; }

  damage(n) {
    if (this.down) return;
    this.hp -= n;
    this.squad.fx.blood(_v.copy(this.pos).setY(this.pos.y + 1.3), 6, 0.6);
    if (this.hp <= 0) {
      this.down = true;
      this.downT = 22;
      this.climb = null;
      this.squad.hud?.toast(`${this.name} is down`, true);
      this.squad.audio.hurt?.();
    }
  }
}

export class Squad {
  constructor({ scene, world, player, guards, fx, audio, hud, rng, climbs, noise }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.guards = guards;
    this.fx = fx;
    this.audio = audio;
    this.hud = hud;
    this.rng = rng;
    this.climbs = climbs || [];
    this.noise = noise;
    this.allies = [];
    this.frame = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    guards.allies = this.allies;
  }

  add(id, pos, gun) {
    const a = new Ally(this, id, pos, gun);
    this.allies.push(a);
    this.group.add(a.root);
    return a;
  }

  update(dt, time) {
    this.frame++;
    for (const a of this.allies) this._update(a, dt, time);
  }

  _update(a, dt, time) {
    const P = this.player.pos, W = this.world;
    if (a.down) {
      a.downT -= dt;
      a.model.animate(dt, { speed: 0, down: true });
      if (a.downT <= 0) {
        a.down = false;
        a.hp = 140;
        this.hud?.toast(`${a.name} is back on their feet`);
      }
      return;
    }
    // on a ladder: up (or down) it, then step off
    if (a.climb) {
      const c = a.climb;
      c.t += dt;
      const len = c.from.distanceTo(c.to);
      const k = clamp(c.t / (len / 2.2), 0, 1);
      if (c.phase === 'ladder') {
        a.pos.copy(c.a).lerp(c.b, k);
        a.model.animate(dt, { speed: 1.2 });
        if (k >= 1) { c.phase = 'off'; c.t = 0; }
      } else {
        const k2 = clamp(c.t / 0.6, 0, 1);
        a.pos.copy(c.b).lerp(c.end, k2);
        if (k2 >= 1) a.climb = null;
      }
      a.root.rotation.y = a.facing;
      return;
    }
    // who to shoot at
    a.senseT -= dt;
    if (a.senseT <= 0) {
      a.senseT = 0.4;
      a.target = null;
      let best = 42;
      for (const s of this.guards.soldiers) {
        if (s.dead) continue;
        const d = Math.hypot(s.pos.x - a.pos.x, s.pos.z - a.pos.z, (s.pos.y - a.pos.y) * 0.6);
        if (d < best && W.lineOfSight(a.pos.x, a.eyeY, a.pos.z, s.pos.x, s.pos.y + 1.5, s.pos.z)) { best = d; a.target = s; }
      }
    }
    if (a.target && a.target.dead) a.target = null;

    // where to be: with you, on your level
    let gx = null, gz = null, speed = 0;
    const dy = P.y - a.pos.y;
    if (Math.abs(dy) > 1.5 && this.player.mode !== 'climb') {
      // find a ladder from here to where you are
      let best = null, bd = Infinity;
      for (const c of this.climbs) {
        const up = dy > 0;
        const here = up ? c.base : c.off, there = up ? c.off : c.base;
        if (Math.abs(here.y - a.pos.y) > 1.2 || Math.abs(there.y - P.y) > 2.0) continue;
        if (c.water) continue;
        const d = Math.hypot(here.x - a.pos.x, here.z - a.pos.z);
        if (d < bd) { bd = d; best = { c, up, here }; }
      }
      // no ladder straight to you (or stuck on the way): catch up somewhere you aren't looking
      a.lostT = (a.lostT || 0) + dt;
      if (a.lostT > 7 && this._catchUp(a)) return;
      if (best) {
        if (bd < 0.9) {
          const c = best.c;
          a.climb = best.up
            ? { from: c.from, to: c.to, a: c.from.clone(), b: c.to.clone(), end: c.off.clone(), phase: 'ladder', t: 0 }
            : { from: c.to, to: c.from, a: c.to.clone(), b: c.from.clone(), end: c.base.clone(), phase: 'ladder', t: 0 };
          return;
        }
        gx = best.here.x; gz = best.here.z; speed = 3.2;
      }
    } else {
      a.lostT = 0;
      // keep a few metres off your shoulder
      const ang = this.player.yaw + (a.slot % 2 ? 2.4 : -2.4);
      const tx = P.x + Math.sin(ang) * -3.2, tz = P.z + Math.cos(ang) * -3.2;
      const d = Math.hypot(tx - a.pos.x, tz - a.pos.z);
      if (d > 1.2) { gx = tx; gz = tz; speed = d > 8 ? 4.2 : a.target ? 1.6 : 2.6; }
    }
    let dirX = 0, dirZ = 0;
    if (gx !== null) {
      const dx = gx - a.pos.x, dz = gz - a.pos.z, d = Math.hypot(dx, dz) || 1;
      dirX = dx / d; dirZ = dz / d;
    }
    const k = Math.min(1, dt * 6);
    a.vel.x += (dirX * speed - a.vel.x) * k;
    a.vel.z += (dirZ * speed - a.vel.z) * k;
    const px = a.pos.x, pz = a.pos.z;
    a.pos.x += a.vel.x * dt;
    a.pos.z += a.vel.z * dt;
    W.resolveCircle(a.pos, 0.3);
    W.constrainAt(a.pos, px, pz, 0.3);
    if (W.floorMode) {
      const g = W.heightAt(a.pos.x, a.pos.z, a.pos.y);
      if (g !== null) a.pos.y = g;
    }
    // stay out of your way
    const pdx = a.pos.x - P.x, pdz = a.pos.z - P.z, pd = Math.hypot(pdx, pdz);
    if (pd < 0.8 && pd > 1e-4 && Math.abs(P.y - a.pos.y) < 1) { a.pos.x += (pdx / pd) * (0.8 - pd); a.pos.z += (pdz / pd) * (0.8 - pd); }

    // shooting
    let faceX = null, faceZ = null;
    if (a.target) {
      const s = a.target;
      const tp = s.volumes().neck;
      faceX = tp.x - a.pos.x; faceZ = tp.z - a.pos.z;
      a.lookPitch = Math.atan2(tp.y - a.eyeY, Math.hypot(faceX, faceZ));
      a.aim = Math.min(1, a.aim + dt * 4);
      a.shotT -= dt;
      if (a.shotT <= 0 && a.aim > 0.8) {
        a.shotT = this.rng.range(1.0, 1.9);
        this._fire(a, s, tp);
      }
    } else {
      a.aim = Math.max(0, a.aim - dt * 2);
      a.lookPitch *= 0.9;
      if (Math.hypot(a.vel.x, a.vel.z) > 0.2) { faceX = a.vel.x; faceZ = a.vel.z; }
    }
    if (faceX !== null) a.facing += wrapAngle(Math.atan2(faceX, faceZ) - a.facing) * Math.min(1, dt * 6);
    a.root.rotation.y = a.facing;
    a.model.animate(dt, { speed: Math.hypot(a.vel.x, a.vel.z), vx: a.vel.x, vz: a.vel.z, aim: a.aim, lookYaw: 0, lookPitch: a.lookPitch, stagger: 0 });
  }

  // Put an ally a couple of metres behind you on your own level, out of your sight.
  _catchUp(a) {
    const P = this.player.pos, W = this.world;
    for (const back of [2.5, 3.5, 1.8]) {
      for (const side of [0, 1.2, -1.2]) {
        const yaw = this.player.yaw;
        const x = P.x + Math.sin(yaw) * back + Math.cos(yaw) * side;
        const z = P.z + Math.cos(yaw) * back - Math.sin(yaw) * side;
        if (!W.floorOKAt(x, z, 0.3, P.y)) continue;
        const h = W.heightAt(x, z, P.y + 0.3);
        if (h === null || Math.abs(h - P.y) > 0.6) continue;
        a.pos.set(x, h, z);
        a.climb = null;
        a.lostT = 0;
        return true;
      }
    }
    return false;
  }

  _fire(a, s, tp) {
    const from = a.model.muzzle.getWorldPosition(new THREE.Vector3());
    const dist = from.distanceTo(tp);
    const chance = clamp(0.62 - dist * 0.009, 0.2, 0.7);
    let end;
    _d.copy(tp).sub(from).normalize();
    if (this.rng.chance(chance) && this.world.lineOfSight(from.x, from.y, from.z, tp.x, tp.y, tp.z)) {
      end = tp.clone();
      const head = this.rng.chance(0.25);
      this.guards.damage(s, { part: head ? 'head' : 'body', damage: head ? 160 : 55, kind: 'bullet', power: 1, dirX: _d.x, dirZ: _d.z, point: end, armorPierce: false });
    } else {
      end = from.clone().addScaledVector(_d, dist + 4).add(new THREE.Vector3(this.rng.range(-0.6, 0.6), this.rng.range(-0.3, 0.5), this.rng.range(-0.6, 0.6)));
    }
    this.fx.beam(from, end, 0xffd890);
    this.fx.muzzleFlash(from, 0.8);
    this.audio.gunshot(a.gun === 'shotgun' ? 'shotgun' : 'rifle', from);
    this.noise?.(from, 45);
  }

  dispose() {
    for (const a of this.allies) a.model.av?.dispose?.();
    this.scene.remove(this.group);
  }
}
