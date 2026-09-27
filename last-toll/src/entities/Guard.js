import * as THREE from 'three';
import { WalkerModel, makeVolumes } from './WalkerModel.js';
import { rayCapsule, raySphere, wrapAngle, clamp } from '../core/math.js';
import { rollItem } from '../data/loot.js';
import { makeItem } from '../data/items.js';
import { radialTexture } from '../world/Textures.js';

// The Living Guard: what's left of a rebuilding army's local garrison, cut off
// from its command and running the parish like an occupation. Soldiers patrol,
// hunt anyone outside their walls, and burn the dead with experimental lasers.
// Searchlight drones fly the Sweep and call the dead down on whoever they find.

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Soldier {
  constructor(force, pos, opts = {}) {
    const rng = force.rng;
    this.force = force;
    this.model = new WalkerModel(rng, { soldier: true });
    this.root = this.model.root;
    this.pos = this.root.position;
    this.pos.set(pos.x, 0, pos.z);
    this.facing = opts.facing ?? rng.range(-Math.PI, Math.PI);
    this.state = opts.post ? 'post' : 'patrol';
    this.route = opts.route || null;
    this.routeI = 0;
    this.home = this.pos.clone();
    this.hp = 120;
    this.helmet = true;
    this.dead = false;
    this.vel = new THREE.Vector3();
    this.push = new THREE.Vector3();
    this.t = 0;
    this.waitT = 0;
    this.senseT = rng.range(0, 0.3);
    this.shotT = rng.range(0.8, 1.8);
    this.charge = 0;
    this.lastSeen = new THREE.Vector3();
    this.investigate = new THREE.Vector3();
    this.lostT = 99;
    this.strafeT = 0;
    this.strafeDir = 1;
    this.stagger = 0;
    this.grappled = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.aim = 0;
    this.threat = null;
    this.seesPlayer = false;
    this.vol = makeVolumes();
    this.volFrame = -1;
    this.deadT = 0;
    this.root.rotation.y = this.facing;
  }

  volumes() {
    if (this.volFrame !== this.force.frame) {
      this.model.volumes(this.vol);
      this.volFrame = this.force.frame;
    }
    return this.vol;
  }

  get inCombat() { return this.state === 'combat'; }
}

export class Drone {
  constructor(force, pos) {
    this.force = force;
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x22262b });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), dark);
    g.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2f353b }));
    dome.position.y = 0.1;
    g.add(dome);
    this.rotors = [];
    for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.08), dark);
      arm.position.set(x / 2, 0, z / 2);
      arm.rotation.y = Math.atan2(-z, x);
      g.add(arm);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0x3a3f44, transparent: true, opacity: 0.55 }));
      rotor.position.set(x, 0.08, z);
      g.add(rotor);
      this.rotors.push(rotor);
    }
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a18 }));
    this.eye.position.set(0, -0.12, 0.38);
    g.add(this.eye);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 10), new THREE.MeshBasicMaterial({ color: 0xfff4e0 }));
    lamp.position.set(0, -0.16, 0);
    g.add(lamp);
    // searchlight cone, rendered as a soft additive beam
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1, 18, 1, true).translate(0, -0.5, 0), force.beamMat.clone());
    this.beam.frustumCulled = false;
    force.group.add(this.beam);
    g.position.copy(pos);
    this.group = g;
    this.pos = g.position;
    force.group.add(g);
    this.hp = 60;
    this.dead = false;
    this.state = 'patrol';
    this.goal = pos.clone();
    this.aimPt = new THREE.Vector3(pos.x, 0, pos.z);
    this.sweepPh = Math.random() * 10;
    this.senseT = 0;
    this.lostT = 0;
    this.alarmT = 0;
    this.vy = 0;
    this.light = force.claimLight();
    this.hum = force.audio.hum(pos, 112 + Math.random() * 12);
  }
}

export class GuardForce {
  constructor({ scene, world, player, audio, fx, env, loot, rng, hud, horde, noise, onKill }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.fx = fx;
    this.env = env;
    this.loot = loot;
    this.rng = rng;
    this.hud = hud;
    this.horde = horde;
    this.noise = noise;
    this.onKill = onKill;
    this.soldiers = [];
    this.drones = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.frame = 0;
    this.warnT = 0;
    this.beamMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,244,220,0.55)', 'rgba(255,244,220,0)'), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    // a fixed pool of real spotlights so the light count never changes mid-raid
    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.SpotLight(0xfff0dc, 0, 34, 0.26, 0.55, 1.2);
      scene.add(l);
      scene.add(l.target);
      this.lights.push({ light: l, used: false });
    }
  }

  claimLight() {
    const free = this.lights.find((l) => !l.used);
    if (!free) return null;
    free.used = true;
    return free;
  }

  spawnSoldier(pos, opts = {}) {
    const s = new Soldier(this, pos, opts);
    this.soldiers.push(s);
    this.group.add(s.root);
    return s;
  }

  spawnDrone(pos) {
    const d = new Drone(this, pos);
    this.drones.push(d);
    return d;
  }

  get aliveSoldiers() { return this.soldiers.filter((s) => !s.dead).length; }

  // Any sound the Guard can hear pulls nearby soldiers in to look.
  onNoise(pos, radius) {
    for (const s of this.soldiers) {
      if (s.dead || s.inCombat) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d > radius * 0.9) continue;
      s.investigate.set(pos.x + this.rng.range(-2, 2), 0, pos.z + this.rng.range(-2, 2));
      s.state = 'alert';
      s.t = 0;
    }
  }

  // A soldier or drone calls in the player's position.
  callIn(pos, radius = 45) {
    for (const s of this.soldiers) {
      if (s.dead || s.inCombat) continue;
      if (Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) > radius) continue;
      s.investigate.copy(pos);
      s.state = 'alert';
      s.t = 0;
    }
  }

  get spotted() {
    for (const s of this.soldiers) if (!s.dead && s.inCombat && s.lostT < 3) return true;
    for (const d of this.drones) if (!d.dead && d.state === 'track') return true;
    return false;
  }

  // ---- update -------------------------------------------------------------------

  update(dt, time) {
    this.frame++;
    this.warnT -= dt;
    for (const s of this.soldiers) this._updateSoldier(s, dt, time);
    for (const d of this.drones) this._updateDrone(d, dt, time);
  }

  _canSee(s, range) {
    const p = this.player;
    if (p.dead) return false;
    const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    const near = p.crouched ? 2.5 : 4;
    if (dist > range && dist > near) return false;
    const fx = Math.sin(s.facing + s.lookYaw), fz = Math.cos(s.facing + s.lookYaw);
    const dot = (fx * dx + fz * dz) / (dist || 1);
    if (dot < 0.25 && dist > near && !s.inCombat) return false;
    return this.world.lineOfSight(s.pos.x, 1.62, s.pos.z, p.eye.x, p.eye.y - 0.15, p.eye.z);
  }

  _updateSoldier(s, dt, time) {
    const p = this.player;
    if (s.dead) {
      s.deadT += dt;
      if (s.model.fall < 1) {
        s.model.animate(dt, { speed: 0, dead: true });
        s.root.rotation.y = s.facing;
      }
      return;
    }
    const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    s.root.visible = dist < this.env.drawDistance + 15;
    s.t += dt;
    const rng = this.rng;

    // senses
    s.senseT -= dt;
    if (s.senseT <= 0) {
      s.senseT = 0.3;
      let range = this.env.sightRange * 1.6;
      if (p.flashlightOn && this.env.darkness > 0.4) range *= 1.6;
      if (p.crouched) range *= 0.6;
      s.seesPlayer = this._canSee(s, range);
      if (s.seesPlayer) {
        s.lastSeen.copy(p.pos);
        s.lostT = 0;
        if (!s.inCombat) {
          s.state = 'combat';
          s.t = 0;
          s.shotT = rng.range(0.6, 1.2);
          this.audio.radio();
          if (this.warnT <= 0) {
            this.hud.toast('The Guard has eyes on you', true);
            this.warnT = 8;
          }
          this.callIn(p.pos, 35);
        }
      }
      // walkers close enough to matter
      s.threat = null;
      let best = 9;
      for (const w of this.horde.walkers) {
        if (w.dead || w.state === 'dormant') continue;
        const d = Math.hypot(w.pos.x - s.pos.x, w.pos.z - s.pos.z);
        if (d < best && this.world.lineOfSight(s.pos.x, 1.6, s.pos.z, w.pos.x, 1.5, w.pos.z)) { best = d; s.threat = w; }
      }
    }
    if (!s.seesPlayer) s.lostT += dt;

    let speed = 0, dirX = 0, dirZ = 0;
    let faceX = null, faceZ = null;
    let target = null;
    if (s.grappled > 0) {
      s.grappled -= dt;
      s.charge = 0;
    } else if (s.stagger > 0) {
      s.stagger -= dt;
      s.charge = 0;
    } else if (s.state === 'patrol' || s.state === 'post') {
      if (s.state === 'patrol') {
        const goal = s.route ? s.route[s.routeI] : s.home;
        const gx = goal.x - s.pos.x, gz = goal.z - s.pos.z;
        const gd = Math.hypot(gx, gz);
        if (s.waitT > 0) s.waitT -= dt;
        else if (gd < 0.8) {
          s.waitT = rng.range(1.5, 4);
          if (s.route) s.routeI = (s.routeI + 1) % s.route.length;
        } else {
          speed = 1.25;
          dirX = gx / gd;
          dirZ = gz / gd;
        }
      }
      s.lookYaw = Math.sin(time * 0.45 + s.home.x) * 0.9;
      if (s.threat && Math.hypot(s.threat.pos.x - s.pos.x, s.threat.pos.z - s.pos.z) < 8) target = s.threat;
    } else if (s.state === 'alert') {
      const gx = s.investigate.x - s.pos.x, gz = s.investigate.z - s.pos.z;
      const gd = Math.hypot(gx, gz);
      if (gd > 1.5 && s.t < 25) {
        speed = 2.1;
        dirX = gx / gd;
        dirZ = gz / gd;
      } else {
        s.lookYaw = Math.sin(time * 1.2) * 1.2;
        if (s.t > 30 || (gd <= 1.5 && s.waitT > 5)) {
          s.state = s.route ? 'patrol' : 'post';
          s.waitT = 0;
        }
        s.waitT += dt;
      }
      if (s.threat) target = s.threat;
    } else if (s.state === 'combat') {
      s.lookYaw *= 0.9;
      if (s.lostT > 7) {
        s.state = 'alert';
        s.investigate.copy(s.lastSeen);
        s.t = 0;
        s.waitT = 0;
      } else {
        const tx = s.lastSeen.x - s.pos.x, tz = s.lastSeen.z - s.pos.z;
        const td = Math.hypot(tx, tz) || 1;
        // keep a firing distance; circle when in range
        if (!s.seesPlayer) { speed = 2.3; dirX = tx / td; dirZ = tz / td; }
        else if (td > 17) { speed = 2.0; dirX = tx / td; dirZ = tz / td; }
        else if (td < 6) { speed = 1.8; dirX = -tx / td; dirZ = -tz / td; }
        else {
          s.strafeT -= dt;
          if (s.strafeT <= 0) { s.strafeT = rng.range(1.2, 2.8); s.strafeDir = rng.sign(); }
          speed = 1.4;
          dirX = (-tz / td) * s.strafeDir;
          dirZ = (tx / td) * s.strafeDir;
        }
        faceX = tx; faceZ = tz;
        target = s.threat && Math.hypot(s.threat.pos.x - s.pos.x, s.threat.pos.z - s.pos.z) < 4.5 ? s.threat : s.seesPlayer ? 'player' : null;
      }
    }

    // shooting: a visible charge-up, then the shot
    if (target && s.grappled <= 0 && s.stagger <= 0) {
      const tp = target === 'player' ? _v.set(p.pos.x, p.eye.y - 0.35, p.pos.z) : _v.copy(target.volumes().head);
      faceX = tp.x - s.pos.x;
      faceZ = tp.z - s.pos.z;
      s.lookPitch = Math.atan2(tp.y - 1.5, Math.hypot(faceX, faceZ));
      s.aim = Math.min(1, s.aim + dt * 4);
      if (s.charge > 0) {
        s.charge += dt / 0.55;
        if (s.charge >= 1) {
          this._fire(s, target, tp);
          s.charge = 0;
          s.shotT = target === 'player' ? rng.range(1.3, 2.3) : rng.range(0.6, 1.1);
        }
      } else {
        s.shotT -= dt;
        if (s.shotT <= 0 && s.aim > 0.8) {
          s.charge = 0.001;
          s.muzzleWorld = s.model.muzzle.getWorldPosition(new THREE.Vector3());
          this.audio.laserCharge(s.muzzleWorld, 0.55);
        }
      }
      if (target !== 'player') speed *= 0.4;
    } else {
      s.aim = Math.max(0, s.aim - dt * 2);
      s.charge = 0;
      s.lookPitch *= 0.9;
    }
    s.model.chargeGlow.material.opacity = s.charge * 0.9;
    s.model.chargeGlow.scale.setScalar(0.4 + s.charge * 1.4);

    // move
    const k = Math.min(1, dt * 6);
    s.vel.x += (dirX * speed - s.vel.x) * k;
    s.vel.z += (dirZ * speed - s.vel.z) * k;
    const px = s.pos.x, pz = s.pos.z;
    s.pos.x += (s.vel.x + s.push.x) * dt;
    s.pos.z += (s.vel.z + s.push.z) * dt;
    s.push.multiplyScalar(Math.exp(-dt * 6));
    this.world.resolveCircle(s.pos, 0.3);
    this.world.constrain(s.pos, px, pz, 0.3);
    // stay out of the player's body
    const pdx = s.pos.x - p.pos.x, pdz = s.pos.z - p.pos.z, pd = Math.hypot(pdx, pdz);
    if (pd < 0.65 && pd > 1e-4) { s.pos.x += (pdx / pd) * (0.65 - pd); s.pos.z += (pdz / pd) * (0.65 - pd); }
    if (faceX === null && Math.hypot(s.vel.x, s.vel.z) > 0.2) { faceX = s.vel.x; faceZ = s.vel.z; }
    if (faceX !== null) s.facing += wrapAngle(Math.atan2(faceX, faceZ) - s.facing) * Math.min(1, dt * 6);
    s.root.rotation.y = s.facing;
    if (dist < 70) {
      s.model.animate(dt, { speed: Math.hypot(s.vel.x, s.vel.z), aim: s.aim, lookYaw: s.lookYaw, lookPitch: s.lookPitch, stagger: s.stagger > 0 ? 1 : 0 });
    }
  }

  _fire(s, target, tp) {
    const p = this.player;
    const from = s.model.muzzle.getWorldPosition(new THREE.Vector3());
    let end;
    if (target === 'player') {
      const dist = from.distanceTo(tp);
      const moving = Math.hypot(p.vel.x, p.vel.z);
      let chance = 0.86 - dist * 0.022 - moving * 0.09 - this.env.darkness * 0.12;
      if (p.crouched && dist > 10) chance -= 0.1;
      if (p.flashlightOn && this.env.darkness > 0.5) chance += 0.15;
      if (p.grabbed) chance += 0.2;
      chance = clamp(chance, 0.12, 0.92);
      if (this.world.lineOfSight(from.x, from.y, from.z, tp.x, tp.y, tp.z) && this.rng.chance(chance)) {
        end = tp.clone();
        p.damage(this.rng.range(13, 20), 'laser', s);
        this.audio.burn(p.eye);
      } else {
        // a near miss that scorches whatever is behind you
        _d.copy(tp).sub(from).normalize();
        const side = new THREE.Vector3(-_d.z, 0, _d.x).multiplyScalar(this.rng.sign() * this.rng.range(0.5, 1.3));
        end = tp.clone().add(side).add(new THREE.Vector3(0, this.rng.range(-0.4, 0.6), 0));
        _d.copy(end).sub(from).normalize();
        const hit = this.world.raycast(from.x, from.y, from.z, _d.x, _d.y, _d.z, 60, true);
        end = hit ? from.clone().addScaledVector(_d, hit.t) : from.clone().addScaledVector(_d, 60);
        if (hit) this.fx.impact(end, _v2.set(hit.nx, hit.ny, hit.nz), 'burn');
      }
    } else {
      const w = target;
      const head = this.rng.chance(0.6);
      const v = w.volumes();
      end = (head ? v.head : v.neck).clone();
      const f = { x: end.x - from.x, z: end.z - from.z };
      const l = Math.hypot(f.x, f.z) || 1;
      this.horde.damage(w, { part: head ? 'head' : 'body', damage: head ? 300 : 40, kind: 'bullet', power: 1, pierce: 0, knock: 0.4, dirX: f.x / l, dirZ: f.z / l, armorPierce: true, point: end });
    }
    this.fx.beam(from, end, 0xff3a24);
    this.fx.muzzleFlash(from, 0.8, 0xff4a2a);
    this.audio.laser(from);
    this.noise(from, 30);
  }

  // ---- drones ---------------------------------------------------------------------

  _updateDrone(d, dt, time) {
    const p = this.player;
    for (const r of d.rotors) r.rotation.y += dt * 40;
    if (d.dead) {
      // it comes down on the deck, or goes into the water and under
      const floorY = d.floorY ?? (d.floorY = this.world.onFloor(d.pos.x, d.pos.z) ? 0.3 : this.env.waterY - 0.8);
      if (d.pos.y > floorY) {
        d.vy -= 9.8 * dt;
        d.pos.y = Math.max(floorY, d.pos.y + d.vy * dt);
        d.group.rotation.x += dt * 4;
        d.group.rotation.z += dt * 3;
        if (d.pos.y <= floorY) {
          if (this.world.onFloor(d.pos.x, d.pos.z)) {
            this.fx.sparks(d.pos, 18);
            this.audio.gunshot('shotgun', d.pos);
            this.audio.impact(d.pos, 'hard');
            for (const it of [makeItem('electronics', 2), this.rng.chance(0.6) ? makeItem('ecell', 1) : makeItem('scrap', 2)]) {
              this._drop(it, d.pos);
            }
          } else {
            this.audio.splash(d.pos, 1.2);
            this.fx.splash(_v.set(d.pos.x, this.env.waterY + 0.05, d.pos.z));
          }
          d.hum?.stop();
          d.hum = null;
        }
      }
      d.beam.visible = false;
      if (d.light) { d.light.light.intensity = 0; d.light.used = false; d.light = null; }
      return;
    }
    const dx = p.pos.x - d.pos.x, dz = p.pos.z - d.pos.z;
    const flat = Math.hypot(dx, dz);
    if (d.state === 'patrol') {
      if (Math.hypot(d.goal.x - d.pos.x, d.goal.z - d.pos.z) < 3) {
        const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(12, 34);
        d.goal.set(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r);
      }
      d.sweepPh += dt * 0.7;
      const ax = d.pos.x + Math.cos(d.sweepPh) * 7, az = d.pos.z + Math.sin(d.sweepPh * 1.3) * 7;
      d.aimPt.x += (ax - d.aimPt.x) * Math.min(1, dt * 2);
      d.aimPt.z += (az - d.aimPt.z) * Math.min(1, dt * 2);
      this._flyToward(d, d.goal.x, d.goal.z, 5.5, dt);
    } else {
      // track: hover off the player's shoulder with the light on them
      d.aimPt.x += (p.pos.x - d.aimPt.x) * Math.min(1, dt * 5);
      d.aimPt.z += (p.pos.z - d.aimPt.z) * Math.min(1, dt * 5);
      const ox = flat > 1e-3 ? -dx / flat : 1, oz = flat > 1e-3 ? -dz / flat : 0;
      this._flyToward(d, p.pos.x + ox * 7, p.pos.z + oz * 7, 6.5, dt);
      d.alarmT -= dt;
      if (d.alarmT <= 0) {
        d.alarmT = 2.6;
        this.audio.alarm(d.pos);
        this.noise(p.pos, 38, { alarm: true });
        this.callIn(p.pos, 70);
      }
    }
    d.pos.y = 10.5 + Math.sin(time * 1.3 + d.sweepPh) * 0.4;
    d.aimPt.y = 0;
    // beam from the drone to its aim point
    _d.copy(d.aimPt).sub(d.pos);
    const len = _d.length();
    d.beam.position.copy(d.pos);
    d.beam.scale.set(1, len, 1);
    d.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _d.normalize());
    d.beam.visible = true;
    // from inside the cone the shell reads as a flat sheet across the view: fade it out
    const eye = p.eye;
    const ax = d.aimPt.x - d.pos.x, ay = d.aimPt.y - d.pos.y, az = d.aimPt.z - d.pos.z;
    const al = Math.hypot(ax, ay, az) || 1;
    const ex = eye.x - d.pos.x, ey = eye.y - d.pos.y, ez = eye.z - d.pos.z;
    const along = clamp((ex * ax + ey * ay + ez * az) / al, 0, al);
    const off = Math.hypot(ex - (ax / al) * along, ey - (ay / al) * along, ez - (az / al) * along);
    const rad = 2.4 * (along / al);
    d.beam.material.opacity = 0.32 * clamp((off - rad * 0.9) / 2.5, 0.12, 1);
    if (d.light) {
      d.light.light.position.copy(d.pos);
      d.light.light.target.position.copy(d.aimPt);
      d.light.light.target.updateMatrixWorld();
      d.light.light.intensity = 90;
    }
    d.hum?.set(d.pos);
    // sensing: is the player standing in the light, with nothing overhead?
    d.senseT -= dt;
    if (d.senseT <= 0) {
      d.senseT = 0.2;
      const inLight = Math.hypot(p.pos.x - d.aimPt.x, p.pos.z - d.aimPt.z) < 3.4;
      const visible = !p.dead && (inLight || (d.state === 'track' && flat < 26)) && this.world.lineOfSight(d.pos.x, d.pos.y - 0.3, d.pos.z, p.eye.x, p.eye.y, p.eye.z);
      if (visible) {
        d.lostT = 0;
        if (d.state !== 'track') {
          d.state = 'track';
          d.alarmT = 0;
          this.hud.toast('Guard drone has your position — break line of sight', true);
        }
      } else if (d.state === 'track') {
        d.lostT += 0.2;
        if (d.lostT > 5) {
          d.state = 'patrol';
          d.goal.copy(d.pos);
        }
      }
    }
    d.eye.material.color.setHex(d.state === 'track' && Math.sin(time * 14) > 0 ? 0xffffff : 0xff2a18);
  }

  _flyToward(d, x, z, speed, dt) {
    const gx = x - d.pos.x, gz = z - d.pos.z;
    const gd = Math.hypot(gx, gz);
    if (gd < 0.2) return;
    const s = Math.min(speed, gd * 2);
    d.pos.x += (gx / gd) * s * dt;
    d.pos.z += (gz / gd) * s * dt;
    d.group.rotation.y = Math.atan2(gx, gz);
    d.group.rotation.x = 0.12;
  }

  // ---- being shot, stabbed and bitten -----------------------------------------------

  raycast(o, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const rx = s.pos.x - o.x, rz = s.pos.z - o.z;
      const along = rx * dir.x + rz * dir.z;
      if (along < -2 || along > bestT + 2) continue;
      if (Math.abs(rx * dir.z - rz * dir.x) > 2.2) continue;
      const v = s.volumes();
      let t = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, v.head.x, v.head.y, v.head.z, 0.16);
      if (t >= 0 && t < bestT) { bestT = t; best = { soldier: s, part: 'head', t }; }
      t = rayCapsule(o, dir, v.hips, v.neck, 0.23);
      if (t >= 0 && t < bestT) { bestT = t; best = { soldier: s, part: 'body', t }; }
      for (const [a, b] of [[v.hips, v.kneeL], [v.kneeL, v.footL], [v.hips, v.kneeR], [v.kneeR, v.footR], [v.shL, v.handL], [v.shR, v.handR]]) {
        t = rayCapsule(o, dir, a, b, 0.09);
        if (t >= 0 && t < bestT) { bestT = t; best = { soldier: s, part: 'limb', t }; }
      }
    }
    for (const d of this.drones) {
      if (d.dead) continue;
      const t = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, d.pos.x, d.pos.y, d.pos.z, 0.7);
      if (t >= 0 && t < bestT) { bestT = t; best = { drone: d, part: 'drone', t }; }
    }
    if (best) best.point = new THREE.Vector3(o.x + dir.x * best.t, o.y + dir.y * best.t, o.z + dir.z * best.t);
    return best;
  }

  // Melee: closest soldier near the aim ray within reach.
  nearestInFront(o, dir, range) {
    let best = null, bd = range;
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const v = s.volumes();
      _v.copy(v.neck).lerp(v.hips, 0.3).sub(o);
      const d = _v.length();
      if (d > bd) continue;
      if (_v.dot(dir) / (d || 1) < 0.82) continue;
      bd = d;
      best = s;
    }
    return best;
  }

  // hit: { part, damage, kind ('stab'|'blunt'|'chop'|'bullet'), power, dirX, dirZ, fromBelow, armorPierce, point, melee }
  damage(target, hit) {
    if (target instanceof Drone || target.drone) {
      const d = target.drone || target;
      if (d.dead) return { result: 'none' };
      d.hp -= hit.damage;
      this.fx.sparks(hit.point, 8);
      this.audio.impact(hit.point, 'hard');
      if (d.hp <= 0) {
        d.dead = true;
        d.vy = 0;
        this.onKill?.(d, { drone: true });
        return { result: 'kill' };
      }
      if (d.state !== 'track') { d.state = 'track'; d.alarmT = 0; }
      return { result: 'hit' };
    }
    const s = target;
    if (s.dead) return { result: 'none' };
    const p = this.player;
    // from behind, unaware: a quiet takedown
    const fx = Math.sin(s.facing), fz = Math.cos(s.facing);
    const behind = fx * (p.pos.x - s.pos.x) + fz * (p.pos.z - s.pos.z) < -0.3 * Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z);
    if (hit.melee && !s.inCombat && behind && (hit.kind === 'stab' || hit.kind === 'chop')) {
      this.fx.blood(hit.point, 12, 1);
      this._kill(s, hit, 'takedown');
      return { result: 'kill', how: 'takedown' };
    }
    let dmg = hit.damage;
    if (hit.part === 'head') {
      if (s.helmet && !hit.armorPierce && !hit.fromBelow) {
        if (hit.melee) {
          this.fx.sparks(hit.point, 6);
          s.stagger = 0.4;
          this._provoke(s);
          return { result: 'deflect' };
        }
        dmg *= 0.35;
        this.fx.sparks(hit.point, 5);
      } else dmg = Math.max(dmg, 200);
    } else if (hit.melee) {
      dmg *= hit.kind === 'stab' ? 2.6 : 2.2;
    }
    s.hp -= dmg;
    this.fx.blood(hit.point, 8, 0.8);
    s.push.x += (hit.dirX || 0) * 1.2;
    s.push.z += (hit.dirZ || 0) * 1.2;
    s.stagger = Math.max(s.stagger, hit.melee ? 0.35 : 0.15);
    if (s.hp <= 0) {
      this._kill(s, hit, hit.part === 'head' ? 'headshot' : 'down');
      return { result: 'kill' };
    }
    this._provoke(s);
    return { result: 'hit' };
  }

  _provoke(s) {
    s.lastSeen.copy(this.player.pos);
    s.lostT = 0;
    if (!s.inCombat) {
      s.state = 'combat';
      s.shotT = this.rng.range(0.4, 0.9);
      this.callIn(this.player.pos, 30);
    }
  }

  // A walker gets its teeth into a soldier.
  bite(s, w) {
    if (s.dead) return;
    s.grappled = 1.2;
    s.hp -= 34;
    this.fx.blood(s.volumes().neck, 10, 1);
    this.audio.hurt();
    if (s.hp <= 0) this._kill(s, { dirX: w.pos.x - s.pos.x, dirZ: w.pos.z - s.pos.z }, 'eaten');
  }

  _kill(s, hit, how) {
    s.dead = true;
    s.deadT = 0;
    s.charge = 0;
    s.model.chargeGlow.material.opacity = 0;
    s.model.visor.material = s.model.visor.material.clone();
    s.model.visor.material.color.setHex(0x3a0a08);
    const fx = Math.sin(s.facing), fz = Math.cos(s.facing);
    s.model.fallDir = hit.dirX !== undefined && fx * hit.dirX + fz * hit.dirZ > 0 ? 1 : -1;
    this.audio.bodyFall(s.pos);
    // what they carried
    const drops = [rollItem(this.rng, 'guardDrop', 3)];
    if (this.rng.chance(0.45)) drops.push(rollItem(this.rng, 'guardDrop', 3));
    if (this.rng.chance(0.12)) drops.push(makeItem('arc_carbine', 1, { dur: Math.round(150 * this.rng.range(0.25, 0.6)), loaded: this.rng.int(0, 10) }));
    for (const it of drops) this._drop(it, s.pos);
    this.onKill?.(s, { how, part: hit.part });
  }

  // Drop an item near `pos`, never out over the water.
  _drop(it, pos) {
    for (let i = 0; i < 6; i++) {
      const x = pos.x + this.rng.range(-0.7, 0.7), z = pos.z + this.rng.range(-0.7, 0.7);
      if (this.world.onFloor(x, z) && this.world.isWalkable(x, z)) return this.loot.dropItem(it, _v.set(x, 0, z));
    }
    this.loot.dropItem(it, _v.set(pos.x, 0, pos.z));
  }

  dispose() {
    for (const d of this.drones) d.hum?.stop();
    for (const l of this.lights) { this.scene.remove(l.light); this.scene.remove(l.light.target); }
    this.scene.remove(this.group);
  }
}
