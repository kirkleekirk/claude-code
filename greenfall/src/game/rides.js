// Drivable vehicles: dirt bikes and pickup trucks. Simple, grounded handling with fuel,
// condition (damage), crashes, refuelling with gas cans, repairs and siphoning fuel from
// abandoned cars. Engines are loud — the dead hear you coming.
import * as THREE from 'three';
import { makeDirtBike, makePickupTruck } from './vehicles.js';
import { COL } from '../world/buildings.js';
import { SURF } from '../world/worldgen.js';
import { RNG } from '../core/rng.js';
import { clamp, lerp, wrapAngle } from '../core/math.js';
import { BY_ID } from '../data/cosmetics.js';

export const VDEF = {
  bike: { name: 'Dirt Bike', maxSpeed: 22, accel: 9, brake: 16, reverse: 3.5, steer: 0.62, wheelbase: 1.4, fuelPerKm: 0.32, can: 0.6, noise: 70, hp: 260, circles: [0.55, -0.5], radius: 0.42, height: 1.5, offroad: 0.95, forest: 0.82, crash: 0.022, ram: 7, ramSelf: 0.03, ramSlow: 0.75, throwAt: 11, seatY: 0.62, camDist: 5.2, cab: false },
  truck: { name: 'Pickup Truck', maxSpeed: 27, accel: 6.2, brake: 13, reverse: 6, steer: 0.6, wheelbase: 3.4, fuelPerKm: 0.17, can: 0.3, noise: 80, hp: 900, circles: [1.9, 0.6, -0.7, -2.0], radius: 1.05, height: 1.9, offroad: 0.75, forest: 0.55, crash: 0.008, ram: 12, ramSelf: 0.004, ramSlow: 0.93, throwAt: 99, seatY: 0.9, camDist: 7.5, cab: true, ignoreThin: true },
};
const BIKE_PAINTS = [{ body: 0xe8702a, accent: 0x1e1e1e }, { body: 0x2f6fb5, accent: 0xf0f0f0 }, { body: 0x3a9a5b, accent: 0x1e1e1e }, { body: 0xc0392b, accent: 0xf0f0f0 }, { body: 0xe6b422, accent: 0x1e1e1e }, { body: 0x6a6a6a, accent: 0xd9473a }];
const TRUCK_COLORS = [0x2e5c8a, 0xb03a2e, 0xe8e4da, 0x2b2b2b, 0x6d7b4c, 0x8a6a4a, 0x4a6a5a];

export class Rides {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.group = new THREE.Group();
    this.group.name = 'rides';
    this.rng = new RNG(G.seed + 99);
    this.streamT = 0;
    this.light = new THREE.SpotLight(0xfff0d0, 0, 60, 0.55, 0.5, 1.2);
    G.scene.add(this.light); G.scene.add(this.light.target);
  }
  spawnAll() {
    const W = this.G.world, r = this.rng;
    const spots = [];
    const near = (x, z, d) => spots.some((s) => Math.hypot(s.x - x, s.z - z) < d);
    const tryAt = (b, type, side = r.sign()) => {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      for (let k = 0; k < 4; k++) {
        const lx = side * (b.w / 2 + (type === 'truck' ? 3.2 : 2.4)), lz = r.range(-b.d / 3, b.d / 3);
        const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
        const occ = W.occAt(x, z);
        if (occ & (4 | 16) || W.coastAt(x, z) < 10 || near(x, z, 6)) { side = -side; continue; }
        if (W.props.some((p) => (p.type === 'car' || p.type === 'truck' || p.type === 'tractor') && Math.abs(p.x - x) < 4 && Math.abs(p.z - z) < 4)) continue;
        spots.push({ x, z, type, rot: b.rot + (r.chance(0.5) ? 0 : Math.PI) + r.range(-0.12, 0.12) }); // parked alongside, like a driveway
        return true;
      }
      return false;
    };
    for (const b of W.buildings) {
      if (b.kind === 'farmhouse' && r.chance(0.45)) tryAt(b, r.chance(0.5) ? 'truck' : 'bike');
      else if (b.kind === 'barn' && r.chance(0.18)) tryAt(b, 'bike');
      else if ((b.kind === 'house' || b.kind === 'cabin' || b.kind === 'shack') && r.chance(0.05)) tryAt(b, r.chance(0.7) ? 'bike' : 'truck');
      else if ((b.kind === 'gas' || b.kind === 'motel' || b.kind === 'millhall' || b.kind === 'warehouse' || b.kind === 'store') && r.chance(0.6)) tryAt(b, r.chance(0.5) ? 'truck' : 'bike');
    }
    for (const sp of spots) {
      const def = VDEF[sp.type];
      const empty = r.chance(0.22), broken = r.chance(0.18);
      this.list.push({ id: this.list.length, type: sp.type, def, pos: new THREE.Vector3(sp.x, W.heightAt(sp.x, sp.z), sp.z), yaw: sp.rot, speed: 0, steer: 0, vy: 0, pitch: 0, lean: 0,
        fuel: empty ? 0 : r.range(0.12, 0.75), hp: broken ? r.range(0.04, 0.14) : r.range(0.45, 1), wrecked: false, driver: null, mesh: null, col: null, wheelRot: 0, noiseT: 0, smokeT: 0,
        paint: sp.type === 'bike' ? r.pick(BIKE_PAINTS) : null, color: sp.type === 'truck' ? r.pick(TRUCK_COLORS) : null, airborne: false });
    }
    return this.list.length;
  }
  // ----- streaming -----
  makeMesh(v) {
    const m = v.type === 'bike' ? makeDirtBike(v.paint) : makePickupTruck(v.color);
    v.mesh = m;
    if (v.wrecked) this.burnLook(v);
    this.group.add(m);
    this.syncMesh(v);
  }
  dropMesh(v) { if (v.mesh) { this.group.remove(v.mesh); v.mesh = null; } }
  makeCol(v) {
    const D = v.def;
    const len = v.type === 'bike' ? 2.0 : 5.8, w = v.type === 'bike' ? 0.6 : 2.05;
    v.col = { kind: 0, x: v.pos.x, y: v.pos.y + D.height / 2, z: v.pos.z, hx: w / 2, hy: D.height / 2, hz: len / 2, rot: v.yaw, flags: COL.SOLID | COL.BULLET | COL.WALK, ref: { vehicle: v, type: 'metal' } };
    this.G.physics.add(v.col);
  }
  syncCol(v) { if (!v.col) return; v.col.x = v.pos.x; v.col.y = v.pos.y + v.def.height / 2; v.col.z = v.pos.z; v.col.rot = v.yaw; this.G.physics.update(v.col); }
  syncMesh(v) {
    const m = v.mesh;
    if (!m) return;
    m.position.copy(v.pos);
    m.rotation.order = 'YXZ';
    m.rotation.set(-v.pitch, v.yaw, v.lean);
    if (v.type === 'bike') { m.rear.rotation.x = v.wheelRot; m.front.rotation.x = v.wheelRot; m.steerPivot.rotation.y = v.steer * 0.8; }
    else { for (const w of m.wheels) w.rotation.x = v.wheelRot; for (const w of m.frontWheels) w.rotation.y = v.steer; }
  }
  burnLook(v) { if (!v.mesh) return; v.mesh.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.18); o.material.emissiveIntensity = 0; } }); }
  setPaint(v, paintId) {
    const p = BY_ID[paintId]?.paint;
    if (!p || v.type !== 'bike') return;
    v.paint = p;
    if (v.mesh) { v.mesh.paintMats[0].color.setHex(p.body); v.mesh.paintMats[1].color.setHex(p.accent); }
  }

  nearest(s, maxD = 3) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (v.driver) continue;
      const d = Math.hypot(v.pos.x - s.pos.x, v.pos.z - s.pos.z) - (v.type === 'truck' ? 1.4 : 0.2);
      if (d < bd && Math.abs(v.pos.y - s.pos.y) < 2.5) { bd = d; best = v; }
    }
    return best;
  }
  status(v) {
    if (v.wrecked) return 'Burned out';
    if (v.hp < 0.15) return "Engine won't start — needs repair";
    if (v.fuel <= 0) return 'Out of fuel';
    return null;
  }
  canPatch(s) { return s.mods && s.mods.has('hotwire') && s.inv.mats.metal >= 20; }

  // ----- player actions -----
  enter(s, v) {
    if (v.wrecked) { this.G.hud.toast(s.isPlayer, 'It\'s a burned-out wreck'); return false; }
    v.driver = s; s.vehicle = v;
    s.cancelAction();
    if (s.isPlayer) { this.setPaint(v, this.G.profile.data.equipped.paint); this.G.audio?.play('door_close', v.pos, { vol: 0.5 }); }
    const why = this.status(v);
    v.engineOn = !why;
    if (why) this.G.hud.toast(s.isPlayer, why); else this.G.audio?.play('engine_start', null, { vol: 0.7 });
    if (v.col) { this.G.physics.remove(v.col); v.col = null; }
    return true;
  }
  exit(s, force = false) {
    const v = s.vehicle;
    if (!v) return;
    if (!force && Math.abs(v.speed) > 7) { this.G.hud.toast(s.isPlayer, 'Slow down to get off'); return; }
    v.driver = null; s.vehicle = null; v.engineOn = false;
    const side = Math.cos(v.yaw), sz = -Math.sin(v.yaw); // vehicle's left side
    const off = v.type === 'truck' ? 1.8 : 0.9;
    s.pos.set(v.pos.x + side * off, v.pos.y + 0.2, v.pos.z + sz * off);
    s.vel.set(side * (force ? Math.abs(v.speed) * 0.3 : 0), force ? 3 : 0, sz * (force ? Math.abs(v.speed) * 0.3 : 0));
    if (this.G.physics.pushOut(s.pos, 0.36, 1.75, 0.5) > 0 && !force) s.pos.set(v.pos.x - side * off, v.pos.y + 0.2, v.pos.z - sz * off);
    s.pos.y = this.G.physics.groundAt(s.pos.x, s.pos.z, s.pos.y + 1.5, 0.3);
    v.speed *= force ? 0.4 : 0;
    this.makeCol(v);
    if (s.character) { s.character.root.visible = true; s.character.anim.state = 'ground'; s.character.root.rotation.z = 0; }
    if (s.isPlayer) { s.mode = 'ground'; this.G.audio?.engine(false); this.light.intensity = 0; }
  }
  useItemOn(s, slotRef) {
    const v = this.nearest(s, 3.2);
    const id = slotRef.slot.id;
    if (!v) { this.G.hud.toast(s.isPlayer, 'Stand next to a vehicle to use this'); return false; }
    if (v.wrecked) { this.G.hud.toast(s.isPlayer, 'Nothing left to fix — it\'s burned out'); return false; }
    if (id === 'gascan' && v.fuel >= 0.98) { this.G.hud.toast(s.isPlayer, 'The tank is already full'); return false; }
    if (id === 'repairkit' && v.hp >= 0.98) { this.G.hud.toast(s.isPlayer, 'It\'s running fine'); return false; }
    const repairMul = s.mods ? s.mods.get('repair') : 1;
    const dur = id === 'gascan' ? 2.5 : 4 / repairMul;
    s.character?.playAction(id === 'gascan' ? 'consume' : 'hammer', dur);
    this.G.audio?.play(id === 'gascan' ? 'pour' : 'hammer', s.pos, { vol: 0.6 });
    return s.startAction('use', dur, () => {
      const L = slotRef.list, cur = L[slotRef.i];
      if (!cur || cur.id !== id) return;
      if (id === 'gascan') { v.fuel = Math.min(1, v.fuel + v.def.can); this.G.hud.toast(s.isPlayer, `${v.def.name} refuelled — ${Math.round(v.fuel * 100)}%`); }
      else { v.hp = Math.min(1, v.hp + 0.45 * repairMul); this.G.hud.toast(s.isPlayer, `${v.def.name} repaired — ${Math.round(v.hp * 100)}%`); }
      cur.n--; if (cur.n <= 0) { L[slotRef.i] = null; s.refreshModel(); }
      this.G.emitNoise(s.pos.x, s.pos.z, 12, s, 'repair');
    });
  }
  patch(s, v) {
    if (!this.canPatch(s)) return;
    s.inv.mats.metal -= 20;
    v.hp = Math.min(1, v.hp + 0.2 * (s.mods ? s.mods.get('repair') : 1));
    this.G.hud.toast(s.isPlayer, `Scrap repair — ${Math.round(v.hp * 100)}%`);
    this.G.emitNoise(s.pos.x, s.pos.z, 25, s, 'repair');
  }
  siphon(s, prop) {
    prop.siphoned = true;
    if (this.rng.chance(0.5)) {
      const left = s.addItem('gascan', 1);
      if (left) this.G.hud.toast(s.isPlayer, 'Inventory full'); else this.G.hud.pickup('gascan', 1, 0);
    } else this.G.hud.toast(s.isPlayer, 'The tank is bone dry');
  }
  damage(v, amount, src) {
    if (v.wrecked) return;
    v.hp -= amount / v.def.hp;
    if (v.hp <= 0) this.wreck(v);
  }
  wreck(v) {
    v.hp = 0; v.wrecked = true; v.engineOn = false;
    const G = this.G;
    G.fx.explosion(v.pos.x, v.pos.y + 0.8, v.pos.z, v.type === 'truck' ? 5 : 3);
    G.audio?.play('explosion', v.pos, { vol: 0.9 });
    G.emitNoise(v.pos.x, v.pos.z, 220, null, 'explosion', true);
    v.fireT = 25;
    v.fireFx = G.fx.addFire(v.pos.x, v.pos.y + 0.3, v.pos.z, v.type === 'truck' ? 1.6 : 0.8);
    if (v.driver) { const d = v.driver; this.exit(d, true); d.takeDamage(v.type === 'truck' ? 45 : 30, null, { type: 'explosion' }); }
    for (const s of G.survivors) if (s.alive && s.physical && Math.hypot(s.pos.x - v.pos.x, s.pos.z - v.pos.z) < 5) s.takeDamage(25, null, { type: 'explosion' });
    G.zombies.explosion(v.pos.x, v.pos.y, v.pos.z, 5, 80, null);
    this.burnLook(v);
  }
  explosion(x, y, z, r, dmg) { for (const v of this.list) { const d = Math.hypot(v.pos.x - x, v.pos.z - z); if (d < r + 2) this.damage(v, dmg * 2 * (1 - d / (r + 2)), null); } }

  // ----- driving -----
  drive(s, v, dt, inp) {
    const G = this.G, D = v.def;
    const engineOK = v.fuel > 0 && v.hp >= 0.15 && !v.wrecked;
    if (v.engineOn && !engineOK) { v.engineOn = false; G.hud.toast(s.isPlayer, v.fuel <= 0 ? 'Out of fuel' : 'The engine died'); G.audio?.play('dryfire', null, { vol: 0.4 }); }
    const surf = G.world.sampleGrid(G.world.surf, v.pos.x, v.pos.z);
    const onRoad = surf === SURF.ASPHALT || surf === SURF.GRAVEL || surf === SURF.DIRTROAD || surf === SURF.PAVE || surf === SURF.COBBLE;
    const surfK = onRoad ? 1 : surf === SURF.FOREST || surf === SURF.CORN ? D.forest : D.offroad;
    const hpK = v.hp < 0.5 ? 0.55 + 0.9 * v.hp : 1;
    const vmax = D.maxSpeed * surfK * hpK;
    const thr = v.engineOn ? inp.y : Math.min(0, inp.y);
    if (thr > 0) {
      if (v.speed < -0.3) v.speed += D.brake * dt;
      else v.speed += D.accel * thr * Math.max(0, 1 - v.speed / vmax) * dt;
    } else if (thr < 0) {
      if (v.speed > 0.3) v.speed -= D.brake * -thr * dt;
      else if (v.engineOn) v.speed = Math.max(-D.reverse, v.speed - D.accel * 0.5 * dt);
    } else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), (1.2 + Math.abs(v.speed) * 0.06) * dt);
    if (inp.brake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), D.brake * 1.5 * dt);
    if (v.speed > vmax + 0.5) v.speed = lerp(v.speed, vmax, Math.min(1, dt * 1.5));
    if (v.airborne) v.speed *= 1 - dt * 0.05;
    // steering (bicycle model)
    const maxSteer = D.steer * (1 - Math.min(0.65, Math.abs(v.speed) / D.maxSpeed * 0.7));
    v.steer += (inp.x * maxSteer - v.steer) * Math.min(1, dt * 7);
    if (!v.airborne) v.yaw -= (v.speed / D.wheelbase) * Math.tan(v.steer) * dt;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const px = v.pos.x, py = v.pos.y, pz = v.pos.z;
    v.pos.x += fx * v.speed * dt; v.pos.z += fz * v.speed * dt;
    // water stalls the engine
    if (G.world.waterLevelAt(v.pos.x, v.pos.z) - G.world.heightAt(v.pos.x, v.pos.z) > 0.8) { v.speed *= 0.9; if (v.engineOn) { v.engineOn = false; G.hud.toast(s.isPlayer, 'The engine flooded'); } }
    // ground following
    const hw = D.wheelbase / 2;
    const hf = G.physics.groundAt(v.pos.x + fx * hw, v.pos.z + fz * hw, v.pos.y + 1.0, 0.25);
    const hr = G.physics.groundAt(v.pos.x - fx * hw, v.pos.z - fz * hw, v.pos.y + 1.0, 0.25);
    const ty = (hf + hr) / 2;
    if (ty < v.pos.y - 0.25) {
      v.airborne = true;
      v.vy -= 22 * dt;
      v.pos.y = Math.max(ty, v.pos.y + v.vy * dt);
      if (v.pos.y <= ty + 0.01) this.land(s, v, ty);
    } else {
      if (v.airborne) this.land(s, v, ty);
      v.vy = clamp((ty - py) / Math.max(dt, 1e-3), -30, 12);
      v.pos.y = ty;
      v.pitch = lerp(v.pitch, Math.atan2(hf - hr, D.wheelbase), Math.min(1, dt * 10));
    }
    // collisions with the world
    let hitN = null;
    for (const k of D.circles) {
      const t = { x: v.pos.x + fx * k, y: v.pos.y + 0.35, z: v.pos.z + fz * k };
      const ox = t.x, oz = t.z;
      const n = G.physics.pushOut(t, D.radius, D.height - 0.35, 0.55, !!D.ignoreThin, (c) => !(c.ref && c.ref.vehicle === v));
      if (n) { v.pos.x += t.x - ox; v.pos.z += t.z - oz; hitN = G.physics.lastNormal; }
    }
    if (hitN) {
      const nl = Math.hypot(hitN.x, hitN.z) || 1;
      const impact = Math.abs(v.speed) * Math.abs((fx * hitN.x + fz * hitN.z) / nl);
      if (impact > 3.5) {
        this.damage(v, (impact - 3.5) * D.crash * D.hp * 3.2, null);
        G.audio?.play('crash', v.pos, { vol: Math.min(1, impact / 12) });
        G.emitNoise(v.pos.x, v.pos.z, 45, s, 'crash');
        if (s.isPlayer) G.player.shake(Math.min(1, impact / 10));
        if (v.type === 'bike' && impact > D.throwAt && v.driver) { const d = v.driver; this.exit(d, true); d.takeDamage(Math.round(impact * 2.2), null, { type: 'fall' }); if (impact > 15 && Math.random() < 0.5) d.breakLeg(); G.hud.toast(d.isPlayer, 'You were thrown off the bike!'); }
        v.speed = -v.speed * 0.2;
      } else v.speed *= 0.6;
    }
    // ramming zombies and survivors
    if (Math.abs(v.speed) > 3) {
      const front = D.circles[0];
      const cx = v.pos.x + fx * front, cz = v.pos.z + fz * front, rr = D.radius + 0.7;
      for (const zb of G.zombies.list) {
        if (zb.state === 'dead' || zb.rise < 1) continue;
        if (Math.abs(zb.pos.x - cx) > rr || Math.abs(zb.pos.z - cz) > rr || Math.abs(zb.pos.y - v.pos.y) > 2) continue;
        G.zombies.damage(zb, Math.abs(v.speed) * D.ram, s, { dir: [fx, fz], melee: true });
        zb.vel.x += fx * v.speed * 0.5; zb.vel.z += fz * v.speed * 0.5;
        this.damage(v, D.ramSelf * D.hp * (zb.type === 'brute' ? 4 : 1), null);
        v.speed *= zb.type === 'brute' ? 0.3 : D.ramSlow;
        G.fx.impact(zb.pos.x, zb.pos.y + 1, zb.pos.z, -fx, 0.3, -fz, 'ichor');
        G.audio?.play('hit_flesh', zb.pos, { vol: 0.8 });
      }
      for (const o of G.survivors) {
        if (o === s || !o.alive || !o.physical || o.vehicle) continue;
        if (Math.abs(o.pos.x - cx) > rr || Math.abs(o.pos.z - cz) > rr || Math.abs(o.pos.y - v.pos.y) > 2) continue;
        o.takeDamage(Math.round(Math.abs(v.speed) * (v.type === 'truck' ? 4 : 2.5)), s, { type: 'melee' });
        o.vel.x += fx * v.speed * 0.6; o.vel.z += fz * v.speed * 0.6; o.vel.y = 4;
        v.speed *= 0.6;
      }
    }
    // fuel, noise, wheels, lean, smoke
    const dist = Math.hypot(v.pos.x - px, v.pos.z - pz);
    if (v.engineOn) v.fuel = Math.max(0, v.fuel - (dist / 1000) * D.fuelPerKm * (s.mods ? s.mods.get('fuel') : 1) - dt * 0.00025);
    v.noiseT -= dt;
    if (v.engineOn && v.noiseT <= 0) { v.noiseT = 0.8; G.emitNoise(v.pos.x, v.pos.z, D.noise * (0.45 + 0.55 * Math.min(1, Math.abs(v.speed) / D.maxSpeed)), s, 'engine'); }
    v.wheelRot += (v.speed * dt) / (v.type === 'bike' ? 0.36 : 0.45);
    if (v.type === 'bike') v.lean = lerp(v.lean, clamp(v.steer * Math.min(1, Math.abs(v.speed) / 8) * 1.2, -0.6, 0.6), Math.min(1, dt * 6));
    if (s.isPlayer) G.audio?.engine(v.engineOn, Math.abs(v.speed) / D.maxSpeed, v.type);
    this.syncMesh(v);
  }
  land(s, v, ty) {
    const fall = -v.vy;
    v.airborne = false; v.pos.y = ty;
    if (fall > 9) {
      this.damage(v, (fall - 9) * v.def.hp * 0.012, null);
      this.G.audio?.play('land_hard', v.pos, { vol: 0.7 });
      if (v.type === 'bike' && fall > 15 && v.driver) { const d = v.driver; this.exit(d, true); d.takeDamage(Math.round((fall - 12) * 4), null, { type: 'fall' }); }
    }
    v.vy = 0;
  }

  // ----- per frame -----
  update(dt) {
    const G = this.G, cp = G.camera.position, P = G.player;
    this.streamT -= dt;
    if (this.streamT <= 0) {
      this.streamT = 0.4;
      for (const v of this.list) {
        const dc = Math.abs(v.pos.x - cp.x) + Math.abs(v.pos.z - cp.z);
        if (!v.mesh && dc < 260) this.makeMesh(v); else if (v.mesh && dc > 320 && !v.driver) this.dropMesh(v);
        const dp = Math.abs(v.pos.x - P.pos.x) + Math.abs(v.pos.z - P.pos.z);
        if (!v.driver && !v.col && dp < 160 && G.view.isReadyAt(v.pos.x, v.pos.z)) { v.pos.y = G.physics.groundAt(v.pos.x, v.pos.z, v.pos.y + 1.5, 0.4); this.syncMesh(v); this.makeCol(v); }
        else if (v.col && dp > 220) { G.physics.remove(v.col); v.col = null; }
      }
    }
    for (const v of this.list) {
      if (v.fireT > 0) { v.fireT -= dt; if (v.fireT <= 0) G.fx.removeFire(v.fireFx); }
      if (v.mesh && !v.wrecked && v.hp < 0.4 && (v.driver || v.hp < 0.15)) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) { v.smokeT = 0.12; const f = v.type === 'truck' ? 2.4 : 0.6; G.fx.norm.emit(v.pos.x + Math.sin(v.yaw) * f, v.pos.y + 1.1, v.pos.z + Math.cos(v.yaw) * f, (Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4, 2.2, 0.5, 0.18, 0.18, 0.18, 0.5, -0.1, 0.4, 0.9); }
      }
      if (!v.driver && Math.abs(v.speed) > 0.1) { v.speed *= 1 - dt * 2; } // coast to a stop when abandoned
    }
    // headlights on the driven vehicle
    const dv = P.vehicle;
    const want = dv && P.headlights && !dv.wrecked;
    this.light.intensity = want ? 14 : 0;
    if (want) {
      const fx = Math.sin(dv.yaw), fz = Math.cos(dv.yaw);
      this.light.position.set(dv.pos.x + fx * 1.2, dv.pos.y + 1.1, dv.pos.z + fz * 1.2);
      this.light.target.position.set(dv.pos.x + fx * 20, dv.pos.y - 1, dv.pos.z + fz * 20);
      this.light.target.updateMatrixWorld();
    }
  }
}
