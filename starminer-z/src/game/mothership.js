// The alien ship: this game's own, not the original's. Now and then, from the second day on, a
// mothership comes over the horizon to where someone is:
//
//   coming      it comes in high over the world, humming, flies right over whoever it came to,
//               and stops about 20 m past them, over the top of everything; its alarm sounds,
//               and a green light shines down from its middle to the ground
//   drones      from then on, every 9 seconds, one of its drones dives out of it and plunges into
//               the ground round the foot of the light (eight at most): pods two blocks high, a
//               glowing eye on top
//   up          stand on one and shoot its eye five times, and it gives way: the light takes
//               you up through the middle of the ship. (The light lets anyone down gently, too:
//               it's the way out; it takes no one up.)
//   inside      a round hall with the ship's core over the hole in its floor, shielded while its
//               four power nodes stand. Aliens beam in on the pads, and the core shoots at
//               whoever's there. Break the nodes, then the core, and the ship comes down:
//               everyone in it is let down the light, it blows apart, and each who was in it
//               gets its loot (Advanced Chips, Space Goo, Space Rock, diamonds)
//   going       seven and a half minutes after it came, it leaves, letting down whoever's in it
//
// Online, the host runs it: it says when one comes and where, and keeps the core's and the
// nodes' health, which everyone's hits go to. Every machine shows the rest the same from that
// (the ship, the light, the drones and where and when they land, all from the seed it was sent
// and the time since), runs the core's shots and the aliens at its own player, and says when its
// player has broken a drone. PVP inside goes by the host's setting, as anywhere.
//
// The ship's hull, inside and out, and its drones are laid over the world's own blocks while
// it's here (World.setOverlay): solid to everything, never saved, and unbreakable.

import * as THREE from 'three';
import { B, SOLID, HEIGHT } from '../world/blocks.js';
import { ALIEN } from '../entities/cmz/types.js';
import { RULES } from './modes.js';
import { weaponDamage } from '../items/items.js';
import { mulberry32 } from '../core/noise.js';
import { makeShip, makeBeam, makeDrone, makeHall, makeCore, makeBoltParts, DRONE_EYE_Y } from '../gfx/mothershipModels.js';

const testParams = new URLSearchParams(location.search);

// the hall: its floor (where you stand: over the top of the world), its room out to 14 from the
// middle and its wall to 15.5, 7 high; the hole in its floor (3 x 3) the light comes up
// through; the power nodes' pillars (2 high), the pads the aliens beam in on, the core (over
// the hole) and a node's crystal (over its pillar's foot)
const FLOOR = 134, ROOM = 14, WALL = 15.5, ROOM_H = 7, HOLE = 1;
const NODES = [[9, 0], [0, 9], [-9, 0], [0, -9]];
const PADS = [[8, 8], [-8, 8], [8, -8], [-8, -8]];
const CORE_Y = 4.5, NODE_Y = 2.55;
// coming: from this far off, this high, taking this long; then (from its coming) the light on,
// and its drones, one every 9 seconds; and when it goes, unless it's brought down first
const FAR = 600, CRUISE = 165, ARRIVE = 24, BEAM_ON = ARRIVE + 4;
const DRONES = 8, DRONE_FIRST = ARRIVE + 12, DRONE_EVERY = 9, DRONE_FALL = 2.2, DRONE_HITS = 5;
const STAY = 450, LEAVE_AT = ARRIVE + STAY, WARN_AT = LEAVE_AT - 20;
// its health; how far from the light's middle it holds you up, and how fast it lets you down
const NODE_HEALTH = 150, CORE_HEALTH = 600;
const BEAM_R = 2.1, SLOW_FALL = 3.5;
// the core's shots (seconds apart, shielded or bare) and the aliens it sends
const BOLT_SPEED = 20, BOLT_DAMAGE = 0.18, BOLT_EVERY = 2.2, BOLT_EVERY_BARE = 1.4, BOLT_LIFE = 4;
const ALIEN_EVERY = 7, ALIEN_MAX = 5;
// how often one comes: 20 to 60 minutes of play apart (40 on average); another look in half a
// minute if no one's anywhere it could come
const MIN_WAIT = 20 * 60, MAX_WAIT = 60 * 60, RETRY = 30;
// heard from this far off
const HEAR = 900;
// what each who was in it gets when it comes down: its Advanced Chips (what the exo suit and the
// gadgets to come are made with), Space Goo, Space Rock and diamonds
const LOOT = [['advanced_chip', 2], ['slime', 8], ['space_rock', 16], ['diamond', 6]];
// the lift, up and down: its stages' lengths
const UP = [0.9, 3.0, 0.7], DOWN = [0.8, 3.6, 0.7];
// leaving: how long it waits (for whoever's in it to be let down) before it goes
const LET_DOWN = DOWN[0] + DOWN[1] + DOWN[2], GO_AFTER = LET_DOWN + 2.5;

// The hall's hull, as cells from the one the light comes up through (the floor's at y -1, the
// room 0 to 6, the ceiling 7): which are solid, and which are the room (with the hole).
const HALL = (() => {
  const solid = new Set(), room = new Set();
  for (let x = -16; x <= 16; x++) for (let z = -16; z <= 16; z++) {
    const d = Math.hypot(x, z);
    if (d > WALL) continue;
    if (Math.abs(x) <= HOLE && Math.abs(z) <= HOLE) room.add(`${x},-1,${z}`); else solid.add(`${x},-1,${z}`);
    solid.add(`${x},${ROOM_H},${z}`);
    for (let y = 0; y < ROOM_H; y++) (d > ROOM ? solid : room).add(`${x},${y},${z}`);
  }
  for (const [x, z] of NODES) for (let y = 0; y < 2; y++) { solid.add(`${x},${y},${z}`); room.delete(`${x},${y},${z}`); }
  return { solid, room };
})();

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const DOWNWARD = new THREE.Vector3(0, -1, 0);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => Math.min(1, Math.max(0, u));
// the near side of a ray (o, unit d) through a ball, within max: its distance, or null
function rayBall(o, d, max, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 && t <= max ? t : cc < 0 ? 0 : null;
}
// (a key for a cell near the ship: its place from the light's cell, and its height)
const cellKey = (dx, y, dz) => ((dx + 64) * 128 + (dz + 64)) * 256 + y;

// ---- one visit ----------------------------------------------------------------------------------

class Visit {
  // (dir: the way from where it stops to where it comes in from, over whoever it came to; or,
  // not given, any way)
  constructor(mgr, seed, hx, hz, elapsed, dir = null) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.seed = seed >>> 0;
    this.hx = hx; this.hz = hz;
    this.t = elapsed;
    this.origin = new THREE.Vector3(hx + 0.5, FLOOR, hz + 0.5);
    this.at = new THREE.Vector3();
    const rnd = mulberry32(this.seed);
    const any = rnd() * Math.PI * 2;
    this.dir = Number.isFinite(dir) ? dir : any;
    const a = this.dir, b = a + Math.PI * (0.6 + rnd() * 0.8);
    this.from = new THREE.Vector3(this.origin.x + Math.cos(a) * FAR, CRUISE, this.origin.z + Math.sin(a) * FAR);
    this.away = new THREE.Vector3(Math.cos(b), 0.3, Math.sin(b)).normalize();
    this.spin = rnd() * Math.PI * 2;
    // the drones: round the foot of the light, in an order that goes round and across it
    this.drones = [];
    const a0 = rnd() * Math.PI * 2, order = [0, 4, 2, 6, 1, 5, 3, 7];
    for (let k = 0; k < DRONES; k++) {
      const slot = order[k];
      const th = a0 + (slot * Math.PI * 2) / DRONES + (rnd() - 0.5) * 0.3, r = 7.5 + rnd() * 3.5;
      this.drones.push({
        i: k, th, lx: hx + Math.round(Math.cos(th) * r), lz: hz + Math.round(Math.sin(th) * r),
        launch: DRONE_FIRST + k * DRONE_EVERY, state: 'docked', hits: 0, base: 0, cells: [], model: null, spent: false, flash: 0,
      });
    }
    // how it ends (the host says: 'gone' it left, 'down' it was brought down) and when
    this.end = null;
    this.endT = 0;
    // the boss: the nodes' health and the core's (the host's word, or ours till it's heard)
    this.nodes = NODES.map(() => NODE_HEALTH);
    this.core = CORE_HEALTH;
    this.sent = 0;
    this.timeSent = 5;
    this.dirty = false;
    // this machine's player: on the lift, been inside, what it's been told
    this.lift = null;
    this.took = false;
    this.told = {};
    this.aliens = [];
    this.alienT = 3;
    this.boltT = 2;
    this.bolts = [];
    this.alarmed = false;
    this.warned = false;
    this.cells = new Map();
    this.ground = null;
    this.build();
    this.overlay();
  }

  get host() { return this.mgr.host; }
  get shielded() { return this.nodes.some((h) => h > 0); }
  get alive() { return this.core > 0 && this.end !== 'down'; }

  // ---- what it's made of ----

  build() {
    const g = this.game, app = g.app;
    this.ship = makeShip(app);
    g.scene.add(this.ship.group);
    this.beam = makeBeam();
    g.scene.add(this.beam.beam, this.beam.pool);
    this.beam.beam.visible = this.beam.pool.visible = false;
    // the hall, with its core and nodes, where it'll stop
    this.hall = new THREE.Group();
    this.hall.position.copy(this.origin);
    const inner = makeHall(HALL.solid, (x, y, z) => HALL.room.has(`${x},${y},${z}`));
    this.hallMesh = inner;
    this.hall.add(inner.mesh);
    this.coreModel = makeCore(NODES.map(([x, z]) => [x, NODE_Y, z]));
    this.coreModel.group.position.set(0, CORE_Y, 0);
    this.hall.add(this.coreModel.group);
    for (const n of this.coreModel.nodes) {
      this.hall.add(n.crystal, n.line);
      n.line.position.copy(n.from);
      _v.set(0, CORE_Y, 0).sub(n.from).normalize();
      n.line.quaternion.setFromUnitVectors(_w.set(0, 0, 1), _v);
      n.line.scale.z = n.from.distanceTo(_w.set(0, CORE_Y, 0)) / n.len;
    }
    this.hall.visible = false;
    g.scene.add(this.hall);
    this.boltParts = makeBoltParts();
  }

  // The cells it lays over the world: the hall's hull (from the start: up there, nothing's in
  // the way of it), and each drone's once it's down.
  overlay() {
    for (const k of HALL.solid) {
      const [x, y, z] = k.split(',').map(Number);
      this.cells.set(cellKey(x, FLOOR + y, z), B.SHIP_HULL);
    }
    const hx = this.hx, hz = this.hz, cells = this.cells;
    const insideHall = (x, y, z) => y >= FLOOR - 1 && y < FLOOR + ROOM_H + 1 && (x - hx) * (x - hx) + (z - hz) * (z - hz) <= 17 * 17;
    const LIT = { sky: 11, block: 7 };
    this.mgr.game.world.setOverlay({
      x0: hx - 40, x1: hx + 40, z0: hz - 40, z1: hz + 40, y0: 0, y1: FLOOR + ROOM_H + 1,
      at: (x, y, z) => cells.get(cellKey(x - hx, y, z - hz)) || 0,
      // (lit inside by the hall's own light, whatever the time of day)
      light: (x, y, z) => (insideHall(Math.floor(x), Math.floor(y), Math.floor(z)) ? LIT : null),
    });
  }

  dropOverlay() {
    this.cells.clear();
    if (this.mgr.game.world.overlay?.at) this.mgr.game.world.setOverlay(null);
  }

  dispose() {
    this.dropOverlay();
    this.ship.dispose();
    this.beam.dispose();
    this.hallMesh.dispose();
    this.coreModel.dispose();
    this.hall.removeFromParent();
    for (const d of this.drones) d.model?.dispose();
    for (const b of this.bolts) b.mesh.removeFromParent();
    this.boltParts.dispose();
    for (const e of this.aliens) if (!e.dead) e.gone = true;
    const a = this.game.audio;
    a?.stop?.(this.hum, 1.5);
    a?.stop?.(this.alarm, 0.5);
    const u = this.game.app.terrain.uniforms.uBeam;
    if (u) u.value.w = 0;
    const p = this.game.player;
    if (this.lift) { p.carried = false; this.lift = null; }
    this.game.hud.bossBar?.(null);
  }

  // ---- where things are ----

  // the ground under the light (the highest solid block under the ship there), once it's known
  groundY() {
    if (this.ground != null) return this.ground;
    const w = this.game.world, x = this.hx, z = this.hz;
    if (!w.isLoaded(x, z)) return null;
    for (let y = HEIGHT - 1; y > 0; y--) if (SOLID[w.getBlock(x, y, z)]) return (this.ground = y + 1);
    return (this.ground = 1);
  }

  // where the ship is (its hall's floor's middle), and how it's turned
  shipAt(out) {
    const t = this.t;
    if (this.end === 'gone') {
      const s = Math.max(0, t - this.endT - GO_AFTER);
      return out.copy(this.origin).addScaledVector(this.away, 2 * s * s);
    }
    if (t < ARRIVE) {
      const u = t / ARRIVE, e = 1 - (1 - u) * (1 - u);
      return out.copy(this.from).lerp(this.origin, e);
    }
    out.copy(this.origin);
    out.y += Math.sin(t * 1.4) * 0.12;
    if (this.end === 'down') { const k = t - this.endT; out.x += Math.sin(k * 23) * 0.12 * k; out.z += Math.cos(k * 19) * 0.12 * k; }
    return out;
  }

  // is the local player in the hall
  inside(p = this.game.player.pos) {
    const dx = p.x - this.origin.x, dz = p.z - this.origin.z;
    return p.y >= FLOOR - 1.2 && p.y < FLOOR + ROOM_H && dx * dx + dz * dz <= (WALL + 1) * (WALL + 1);
  }

  // anyone this machine knows of up there (this player, or on the lift)
  anyoneUp() { return !!this.lift || this.inside(); }

  beamOn() { return this.t >= BEAM_ON && this.t < LEAVE_AT + 30 && (!this.end || this.t - this.endT < (this.end === 'down' ? 6.5 : LET_DOWN + 1)); }

  // ---- every frame ----

  update(dt, live) {
    const g = this.game, p = g.player, a = g.audio;
    if (live) this.t += dt;
    const t = this.t;
    const at = this.shipAt(this.at);
    const S = this.ship;
    S.group.position.copy(at);
    S.group.rotation.y = this.spin + t * 0.08;
    S.uniforms.uTime.value = t;
    const alarm = (t >= WARN_AT && !this.end) || this.end === 'down';
    S.uniforms.uAlarm.value = alarm ? 1 : 0;
    this.hallMesh.uniforms.uTime.value = t;
    this.hallMesh.uniforms.uAlarm.value = alarm ? 1 : 0;
    // seen up close only once it's here (and gone once it's blown apart)
    const blown = this.end === 'down' && t - this.endT > 6.5;
    S.group.visible = !blown;
    this.hall.visible = t >= ARRIVE - 2 && !blown && (this.inside(g.camera.position) || this.anyoneUp());

    // the sound of it
    const dist = at.distanceTo(g.camera.position);
    if (!this.hum?.playing && !blown && dist < HEAR) this.hum = a?.playOwn?.('ship-hum', at, 0.9, { loop: true, hear: HEAR * 1.2, ref: 34, rolloff: 1, fadeIn: 3 }) ?? null;
    if (this.hum) { a?.move?.(this.hum, at); if (blown) { a?.stop?.(this.hum, 0.8); this.hum = null; } }
    if (!this.alarmed && t >= ARRIVE && !this.end) {
      this.alarmed = true;
      if (dist < 500) {
        this.alarm = a?.playOwn?.('ship-alarm', null, 0.75) ?? null;
        g.hud.message('An alien ship has come');
      }
    }
    if (!this.warned && t >= WARN_AT && !this.end) {
      this.warned = true;
      if (dist < 500) { this.alarm = a?.playOwn?.('ship-alarm', null, 0.75, { duration: 8.3, fadeOut: 1.5 }) ?? null; g.hud.message('The ship is about to leave'); }
    }

    // its light: on, off, and the ground it lights
    const gy = this.groundY();
    const on = this.beamOn() && gy != null;
    const B0 = this.beam;
    const want = on ? 1 : 0;
    B0.uniforms.uAlpha.value += (want - B0.uniforms.uAlpha.value) * Math.min(1, dt * (on ? 0.7 : 2));
    const alpha = B0.uniforms.uAlpha.value;
    B0.beam.visible = B0.pool.visible = alpha > 0.01 && gy != null;
    if (gy != null) {
      const top = at.y - 2.7, len = Math.max(1, top - gy);
      B0.beam.position.set(at.x, top, at.z);
      B0.beam.scale.set(1, len, 1);
      B0.uniforms.uLen.value = len;
      B0.pool.position.set(this.origin.x, gy + 0.06, this.origin.z);
    }
    B0.uniforms.uTime.value = t;
    // (from in it, an even glow all round: see makeBeam)
    const cam = g.camera.position, cx = cam.x - at.x, cz = cam.z - at.z;
    const inBeam = gy != null && cam.y < at.y && cam.y > gy - 1 && cx * cx + cz * cz < 3.3 * 3.3 ? 1 : 0;
    B0.uniforms.uInside.value += (inBeam - B0.uniforms.uInside.value) * Math.min(1, dt * 5);
    // motes of it, drifting up
    if (on && alpha > 0.3 && dist < 160 && Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2, y = gy + Math.random() * (at.y - 3 - gy);
      g.sprites.emit('spark', this.origin.x + Math.cos(a) * r, y, this.origin.z + Math.sin(a) * r, { color: 0x7dffad, size: 0.09, life: 1.6, v: _w.set(0, 2.2, 0), drag: 0 });
    }
    const ub = g.app.terrain.uniforms.uBeam;
    if (ub) ub.value.set(this.origin.x, this.origin.z, 4.5, gy != null ? alpha * 0.8 : 0);

    // the drones
    for (const d of this.drones) this.updateDrone(d, dt, gy);

    // the core and its nodes
    const C = this.coreModel;
    C.uniforms.uTime.value = t;
    C.uniforms.uHit.value = Math.max(0, C.uniforms.uHit.value - dt * 4);
    C.uniforms.uShield.value += ((this.shielded && this.alive ? 1 : 0) - C.uniforms.uShield.value) * Math.min(1, dt * 3);
    C.uniforms.uDim.value = this.alive ? 0 : Math.min(1, C.uniforms.uDim.value + dt);
    C.crystal.rotation.y += dt * 0.9; C.crystal.rotation.x += dt * 0.4;
    C.shell.rotation.y -= dt * 0.5;
    this.hallMesh.uniforms.uCore.value = this.alive ? 1 : Math.max(0, this.hallMesh.uniforms.uCore.value - dt);
    C.nodes.forEach((n, k) => {
      const up = this.nodes[k] > 0;
      n.crystal.visible = up;
      n.line.visible = up && this.alive;
      n.crystal.rotation.y += dt * 1.5;
      n.crystal.position.y = NODE_Y + Math.sin(t * 2 + k) * 0.08;
    });

    // the host: how long it's been here, now and then (for whoever's fallen behind: loading the
    // world as they joined, or away in another tab), and its word on the boss's health
    if (this.host && !this.end && (this.timeSent -= dt) <= 0) {
      this.timeSent = 5;
      this.mgr.send({ t: 'ut', e: Math.round(t * 10) / 10 });
    }
    if (this.host && this.dirty && (this.sent -= dt) <= 0) {
      this.sent = 0.2;
      this.dirty = false;
      this.mgr.send({ t: 'ux', n: this.nodes.map((h) => Math.round(h * 10) / 10), c: Math.round(this.core * 10) / 10 });
    }

    // this player: the lift, the light holding them up, the hall
    if (this.lift && p.dead) { this.lift = null; p.carried = false; g.hud.el?.classList.remove('beamed'); }
    if (this.lift) this.updateLift(dt);
    else if (on && !p.dead) {
      const dx = p.pos.x - this.origin.x, dz = p.pos.z - this.origin.z;
      if (dx * dx + dz * dz < BEAM_R * BEAM_R && p.pos.y < FLOOR && p.vel.y < -SLOW_FALL) { p.vel.y = -SLOW_FALL; p.fallStart = null; }
    }
    const inside = !this.lift && this.inside() && !p.dead;
    if (inside) {
      this.took = true;
      if (!this.told.hall) { this.told.hall = true; g.hud.hint('Break the four power nodes, then the core', 5); }
      if (live && this.alive && !this.end) { this.updateAliens(dt); this.updateBolts(dt, true); }
    }
    if (!inside || !this.alive) this.updateBolts(dt, false);
    g.hud.bossBar?.(inside && this.alive && !this.end ? { core: this.core / CORE_HEALTH, nodes: this.nodes.map((h) => h > 0), shielded: this.shielded } : null);

    // its end: the host says when it goes (and if its word doesn't come, it goes anyway)
    if (!this.end && t >= LEAVE_AT && this.host) this.mgr.finish('gone');
    if (!this.end && t > LEAVE_AT + 8) this.finish('gone');
    if (this.end && live) this.updateEnd(dt);
  }

  // ---- drones ----

  dronePath(d, u, out) {
    const at = this.shipAt(_w).clone();
    const from = at.add(_v.set(Math.cos(d.th) * 5, -3, Math.sin(d.th) * 5));
    const to = new THREE.Vector3(d.lx + 0.5, d.base, d.lz + 0.5);
    const mid = from.clone().lerp(to, 0.5).add(_v.set(Math.cos(d.th) * 6, 4, Math.sin(d.th) * 6));
    const k = u * u, m = 1 - k;
    return out.set(m * m * from.x + 2 * m * k * mid.x + k * k * to.x, m * m * from.y + 2 * m * k * mid.y + k * k * to.y, m * m * from.z + 2 * m * k * mid.z + k * k * to.z);
  }

  updateDrone(d, dt, gy) {
    const g = this.game, t = this.t;
    if (d.state === 'docked') {
      if (t < d.launch || this.end) return;
      // where it'll land: the highest ground under its foot, known before it falls
      const w = g.world;
      if (!w.isLoaded(d.lx, d.lz) || gy == null) return;
      let top = 0;
      d.groundCol = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        let y = HEIGHT - 1;
        for (; y > 0; y--) { const id = w.getBlock(d.lx + dx, y, d.lz + dz); if (SOLID[id] && id !== B.LEAVES && id !== B.LOG) break; }
        d.groundCol.push([d.lx + dx, d.lz + dz, y]);
        top = Math.max(top, y);
      }
      d.base = top + 1;
      d.model = makeDrone(g.app);
      g.scene.add(d.model.group);
      d.state = t < d.launch + DRONE_FALL ? 'falling' : 'landed';
      if (d.state === 'landed') this.land(d, false);
    }
    const M = d.model;
    if (!M) return;
    if (d.state === 'falling') {
      const u = clamp01((t - d.launch) / DRONE_FALL);
      const pos = this.dronePath(d, u, M.group.position);
      const ahead = this.dronePath(d, Math.min(1, u + 0.02), _v.clone());
      const dir = ahead.sub(pos);
      if (dir.lengthSq() > 1e-6) M.group.quaternion.slerp(_q.setFromUnitVectors(DOWNWARD, dir.normalize()), Math.min(1, dt * 8));
      if (Math.random() < dt * 30) g.sprites.emit('spark', pos.x, pos.y + 1, pos.z, { color: 0x7dffad, size: 0.12, life: 0.5, spread: 1.5 });
      if (u >= 1) { d.state = 'landed'; this.land(d, true); }
    } else if (d.state === 'rising') {
      const u = clamp01((t - d.riseT) / 2);
      this.dronePath(d, 1 - u, M.group.position);
      if (u >= 1) { M.dispose(); d.model = null; d.state = 'away'; }
    }
    if (d.state === 'landed') {
      M.group.position.set(d.lx + 0.5, d.base, d.lz + 0.5);
      M.group.quaternion.identity();
      M.group.rotation.y = d.th;
    }
    // its eye: green, flashing white when hit, red when it gives way, dark once spent
    d.flash = Math.max(0, d.flash - dt * 3);
    const eye = M.eyeMat.uniforms.uTint.value;
    if (d.spent) { const k = clamp01((t - d.spentT) / 0.8); eye.setRGB(1 - k * 0.92, 0.25 * (1 - k) + 0.04, 0.15 * (1 - k) + 0.04); M.mat.uniforms.uEmissiveColor.value.setScalar(0); }
    else eye.setRGB(0.27 + d.flash * 0.73, 1, 0.55 + d.flash * 0.45);
    M.eye.scale.setScalar(1 + Math.sin(t * 6 + d.i) * 0.06 + d.flash * 0.2);
    const L = g.world.lightAt(M.group.position.x, M.group.position.y + 2.2, M.group.position.z);
    M.setLight(L.sky / 15, L.block / 15);
  }

  // A drone comes down: dust, the ground shaking, and (fresh: just now, not caught up) the thud.
  land(d, fresh) {
    const g = this.game, p = g.player;
    const top = d.base + 2;
    for (const [x, z, gyc] of d.groundCol) for (let y = gyc + 1; y < top; y++) { const k = cellKey(x - this.hx, y, z - this.hz); this.cells.set(k, B.SHIP_HULL); d.cells.push(k); }
    // anyone it came down on is pushed up onto it (and the dead too)
    const inFoot = (P) => P.x > d.lx - 1 - 0.35 && P.x < d.lx + 2 + 0.35 && P.z > d.lz - 1 - 0.35 && P.z < d.lz + 2 + 0.35 && P.y < top && P.y > d.base - 2;
    if (!p.dead && !this.lift && inFoot(p.pos)) { p.pos.y = top + 0.01; p.vel.y = 0; p.fallStart = null; }
    for (const e of g.enemies?.list || []) if (!e.dead && inFoot(e.pos)) e.pos.y = top + 0.01;
    if (!fresh) return;
    const c = new THREE.Vector3(d.lx + 0.5, d.base, d.lz + 0.5);
    for (let i = 0; i < 24; i++) g.sprites.emit('dust', c.x, c.y + 0.2, c.z, { color: 0x6a645c, size: 0.16, life: 1.3, spread: 9, gravity: 12, drag: 0.6, alpha: 0.9 });
    for (let i = 0; i < 10; i++) g.sprites.emit('smoke', c.x, c.y + 0.4, c.z, { color: 0x58544f, size: 0.9, grow: 2, life: 1.6, spread: 3.5, alpha: 0.5 });
    for (let i = 0; i < 12; i++) g.sprites.emit('spark', c.x, c.y + 1, c.z, { color: 0x7dffad, size: 0.1, life: 0.6, spread: 6 });
    g.audio?.playOwn?.('ship-hum', c, 1.6, { rate: 0.42, offset: 6, duration: 1.2, fadeOut: 0.9, hear: 220, ref: 10 });
    const near = c.distanceTo(p.pos);
    if (near < 30) g.shake = Math.max(g.shake || 0, (1 - near / 30) * 0.5);
    if (!this.told.drone && near < 50) { this.told.drone = true; g.hud.hint('A drone came down by the light: climb onto it and shoot its top', 6); }
  }

  // Is this player standing on drone d?
  standingOn(d, p) {
    const top = d.base + 2;
    return p.onGround && Math.abs(p.pos.y - top) < 0.3 && p.pos.x >= d.lx - 1 && p.pos.x < d.lx + 2 && p.pos.z >= d.lz - 1 && p.pos.z < d.lz + 2;
  }

  // Our shot in a drone's eye: five from on top of it and it gives way, sending us up.
  hitEye(d, mine) {
    const g = this.game, M = d.model;
    if (!M || d.spent) return;
    d.flash = 1;
    const c = M.eye.getWorldPosition(_v);
    for (let i = 0; i < 6; i++) g.sprites.emit('spark', c.x, c.y, c.z, { color: 0xb8ffd0, size: 0.08, life: 0.3, spread: 5 });
    if (!mine) return;
    const p = g.player;
    if (!this.standingOn(d, p)) {
      if (!this.told.glance) { this.told.glance = true; g.hud.hint('It shrugs that off from there: get on top of it and shoot', 4); }
      return;
    }
    if (++d.hits < DRONE_HITS) return;
    this.spendDrone(d);
    this.mgr.send({ t: 'ud', i: d.i });
    this.startLift('up');
  }

  spendDrone(d) {
    if (d.spent) return;
    d.spent = true;
    d.spentT = this.t;
    const g = this.game, M = d.model;
    if (!M) return;
    const c = M.eye.getWorldPosition(_v);
    for (let i = 0; i < 20; i++) g.sprites.emit('spark', c.x, c.y, c.z, { color: i % 2 ? 0xff7050 : 0xfff0c0, size: 0.1, life: 0.6, spread: 7 });
    g.sprites.emit('flame', c.x, c.y, c.z, { color: 0xc8ffe0, size: 1.4, grow: 1.4, life: 0.2, spread: 0, alpha: 0.9 });
  }

  // ---- the lift ----

  // Up the light into the hall (kind 'up'), or down it to the ground ('down').
  startLift(kind) {
    const g = this.game, p = g.player;
    if (this.lift || p.dead) return;
    const o = this.origin, gy = this.groundY() ?? 64;
    const phi = Math.random() * Math.PI * 2;
    let pts, times;
    if (kind === 'up') {
      pts = [p.pos.clone(), new THREE.Vector3(o.x, p.pos.y + 1.5, o.z), new THREE.Vector3(o.x, FLOOR + 1.0, o.z), new THREE.Vector3(o.x + Math.cos(phi) * 2.6, FLOOR + 0.02, o.z + Math.sin(phi) * 2.6)];
      times = UP;
    } else {
      const end = new THREE.Vector3(o.x + Math.cos(phi) * 3.2, 0, o.z + Math.sin(phi) * 3.2);
      end.y = this.landing(end.x, end.z, gy);
      pts = [p.pos.clone(), new THREE.Vector3(o.x, FLOOR + 1.2, o.z), new THREE.Vector3(o.x, gy + 1.4, o.z), end];
      times = DOWN;
    }
    this.lift = { kind, t: 0, pts, times };
    p.carried = true;
    p.vel.set(0, 0, 0);
    g.audio?.playOwn?.('ship-hum', null, 0.55, { rate: kind === 'up' ? 1.7 : 1.35, offset: 12, duration: kind === 'up' ? 4.4 : 5, fadeIn: 0.4, fadeOut: 1.4 });
    g.hud.el?.classList.add('beamed');
  }

  // where someone let down at (x, z) comes to stand: on the highest thing there under the ship,
  // in any of the columns their feet are over (set down level with the lowest, they'd be stuck
  // in the side of a higher one)
  landing(x, z, fallback) {
    const w = this.game.world, r = this.game.player.radius;
    if (!w.isLoaded(x, z)) return fallback;
    let top = 0;
    for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      for (let y = FLOOR - 3; y > top; y--) if (SOLID[w.getBlock(x + dx, y, z + dz)]) { top = y; break; }
    }
    return top > 0 ? top + 1.02 : fallback;
  }

  updateLift(dt) {
    const g = this.game, p = g.player, L = this.lift;
    L.t += dt;
    let t = L.t, k = 0;
    while (k < L.times.length && t > L.times[k]) { t -= L.times[k]; k++; }
    if (k >= L.times.length) {
      p.pos.copy(L.pts[L.pts.length - 1]);
      p.carried = false;
      p.vel.set(0, 0, 0);
      p.fallStart = null;
      p.onGround = true;
      this.lift = null;
      g.hud.el?.classList.remove('beamed');
      return;
    }
    p.pos.copy(L.pts[k]).lerp(L.pts[k + 1], ease(t / L.times[k]));
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    if (Math.random() < dt * 40) {
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.6;
      g.sprites.emit('spark', p.pos.x + Math.cos(a) * r, p.pos.y + Math.random() * 1.8, p.pos.z + Math.sin(a) * r, { color: 0x7dffad, size: 0.07, life: 0.6, spread: 0.6, v: _v.set(0, L.kind === 'up' ? 3 : -3, 0) });
    }
  }

  // ---- inside: the aliens, and the core's shots ----

  updateAliens(dt) {
    const g = this.game;
    this.aliens = this.aliens.filter((e) => !e.gone && !e.dead);
    if ((this.alienT -= dt) > 0 || this.aliens.length >= ALIEN_MAX) return;
    this.alienT = ALIEN_EVERY * (this.shielded ? 1 : 0.75);
    const [x, z] = PADS[Math.floor(Math.random() * PADS.length)];
    const at = new THREE.Vector3(this.origin.x + x, FLOOR + 0.05, this.origin.z + z);
    const e = g.enemies?.spawn(ALIEN, at.x, at.y, at.z, 0);
    if (!e) return;
    this.aliens.push(e);
    g.sprites.emit('flame', at.x, at.y + 1, at.z, { color: 0x9dffc0, size: 2.2, grow: 1.5, life: 0.35, spread: 0, alpha: 0.8 });
    for (let i = 0; i < 14; i++) g.sprites.emit('spark', at.x, at.y + Math.random() * 2, at.z, { color: 0x7dffad, size: 0.09, life: 0.7, spread: 2.5 });
  }

  updateBolts(dt, firing) {
    const g = this.game, p = g.player, w = g.world;
    if (firing && !p.dead && !p.carried) {
      if ((this.boltT -= dt) <= 0) {
        this.boltT = this.shielded ? BOLT_EVERY : BOLT_EVERY_BARE;
        const from = new THREE.Vector3(this.origin.x, FLOOR + CORE_Y, this.origin.z);
        const aim = new THREE.Vector3(p.pos.x, p.pos.y + 1.0, p.pos.z).sub(from).normalize();
        aim.x += (Math.random() - 0.5) * 0.05; aim.y += (Math.random() - 0.5) * 0.05; aim.z += (Math.random() - 0.5) * 0.05;
        aim.normalize();
        from.addScaledVector(aim, 1.6);
        const mesh = new THREE.Mesh(this.boltParts.geo, this.boltParts.mat);
        mesh.position.copy(from);
        g.scene.add(mesh);
        this.bolts.push({ mesh, pos: from, v: aim.multiplyScalar(BOLT_SPEED), life: BOLT_LIFE });
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.pos.addScaledVector(b.v, dt);
      b.mesh.position.copy(b.pos);
      if (Math.random() < dt * 30) g.sprites.emit('spark', b.pos.x, b.pos.y, b.pos.z, { color: 0x7dffad, size: 0.1, life: 0.3, spread: 0.3 });
      let done = b.life <= 0 || SOLID[w.getBlock(b.pos.x, b.pos.y, b.pos.z)];
      // in this player (from their feet to the top of their head)
      if (!done && !p.dead) {
        const dy = Math.max(p.pos.y + 0.3, Math.min(p.pos.y + 1.5, b.pos.y)) - b.pos.y;
        const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z;
        if (dx * dx + dz * dz + dy * dy < 0.55 * 0.55) {
          done = true;
          p.hurt(BOLT_DAMAGE * p.maxHealth, b.pos.clone().sub(b.v), 'bolt');
        }
      }
      if (done) {
        for (let k = 0; k < 8; k++) g.sprites.emit('spark', b.pos.x, b.pos.y, b.pos.z, { color: 0x9dffc0, size: 0.09, life: 0.35, spread: 4 });
        b.mesh.removeFromParent();
        this.bolts.splice(i, 1);
      }
    }
  }

  // ---- hits ----

  // What along a ray could be shot of it (within max): a drone's eye, a node, the core (or its
  // shield): { part, dist } or null.
  raycast(o, d, max) {
    let best = null;
    const test = (part, c, r) => { const t = rayBall(o, d, best ? best.dist : max, c, r); if (t != null) best = { part, dist: t }; };
    for (const D of this.drones) if (D.state === 'landed' && !D.spent && D.model) test({ kind: 'eye', i: D.i }, _w.set(D.lx + 0.5, D.base + DRONE_EYE_Y, D.lz + 0.5), 0.5);
    if (this.alive && !this.end && this.t >= ARRIVE) {
      NODES.forEach(([x, z], k) => { if (this.nodes[k] > 0) test({ kind: 'node', k }, _w.set(this.origin.x + x, FLOOR + NODE_Y, this.origin.z + z), 0.6); });
      test({ kind: this.shielded ? 'shield' : 'core' }, _w.set(this.origin.x, FLOOR + CORE_Y, this.origin.z), this.shielded ? 2.7 : 1.5);
    }
    return best;
  }

  // a shot in one of its parts (every machine sees it; only the shooter's counts)
  shot(part, at, it, mine) {
    const g = this.game, s = g.sprites;
    if (part.kind === 'eye') { const d = this.drones[part.i]; if (d) this.hitEye(d, mine); return; }
    if (part.kind === 'shield') {
      this.coreModel.uniforms.uHit.value = 0.6;
      for (let i = 0; i < 4; i++) s.emit('spark', at.x, at.y, at.z, { color: 0x9dffc0, size: 0.08, life: 0.25, spread: 3 });
      return;
    }
    for (let i = 0; i < 5; i++) s.emit('spark', at.x, at.y, at.z, { color: part.kind === 'core' ? 0xffffff : 0xb8ffd0, size: 0.09, life: 0.3, spread: 5 });
    if (part.kind === 'core') this.coreModel.uniforms.uHit.value = 1;
    if (!mine) return;
    this.hitPart(part.kind === 'core' ? 4 : part.k, Math.min(300, weaponDamage(it).dmg));
  }

  // An explosion (anyone's: each machine takes its own player's share) near its parts.
  blast(c, type, mine) {
    if (!mine || !this.alive || this.end) return;
    const power = type === 1 ? 150 : type === 0 ? 120 : type === 2 ? 100 : type === 4 ? 60 : 0;
    if (!power) return;
    NODES.forEach(([x, z], k) => {
      if (this.nodes[k] <= 0) return;
      const d = _w.set(this.origin.x + x, FLOOR + NODE_Y, this.origin.z + z).distanceTo(c);
      if (d < 4) this.hitPart(k, power * (1 - d / 4));
    });
    if (!this.shielded) {
      const d = _w.set(this.origin.x, FLOOR + CORE_Y, this.origin.z).distanceTo(c);
      if (d < 5) this.hitPart(4, power * (1 - d / 5));
    }
  }

  // damage to part k (0-3 the nodes, 4 the core): the host's to keep, the others' to send it
  hitPart(k, dmg) {
    if (!(dmg > 0) || !this.alive || this.end) return;
    if (k < 4 && this.nodes[k] <= 0) return;
    if (k === 4 && this.shielded) return;
    if (!this.host) {
      this.mgr.send({ t: 'uh', k, d: Math.round(dmg * 100) / 100 });
      // (shown now; the host's word follows)
      if (k < 4) this.nodes[k] = Math.max(0.1, this.nodes[k] - dmg); else this.core = Math.max(0.1, this.core - dmg);
      return;
    }
    this.applyHit(k, dmg);
  }

  // (the host) a hit taken off, and what follows from it
  applyHit(k, dmg) {
    if (!this.alive || this.end || !(dmg > 0)) return;
    const nodes = this.nodes.slice();
    let core = this.core;
    if (k < 4) {
      if (nodes[k] <= 0) return;
      nodes[k] = Math.max(0, nodes[k] - dmg);
    } else {
      if (this.shielded) return;
      core = Math.max(0, core - dmg);
    }
    this.dirty = true;
    this.setState(nodes, core);
    if (core <= 0) this.mgr.finish('down');
  }

  // the boss's health as the host has it (shown here: nodes breaking, the shield dropping)
  setState(nodes, core) {
    const g = this.game, was = this.nodes.slice(), wasShielded = this.shielded;
    this.nodes = nodes.slice(0, 4);
    this.core = core;
    this.nodes.forEach((h, k) => {
      if (was[k] > 0 && h <= 0) {
        const [x, z] = NODES[k], c = new THREE.Vector3(this.origin.x + x, FLOOR + NODE_Y, this.origin.z + z);
        g.explosives?.effects(c, false);
        for (let i = 0; i < 18; i++) g.sprites.emit('spark', c.x, c.y, c.z, { color: 0x9dffc0, size: 0.11, life: 0.8, spread: 8 });
      }
    });
    if (wasShielded && !this.shielded && this.inside()) g.hud.message("The core's shield is down!");
  }

  // ---- the end of it ----

  // how it ends ('gone': it leaves; 'down': it's brought down), on every machine
  finish(how) {
    if (this.end) return;
    this.end = how;
    this.endT = this.t;
    const g = this.game, p = g.player;
    const near = this.origin.distanceTo(p.pos) < 500;
    if (how === 'down') {
      this.core = 0;
      const c = new THREE.Vector3(this.origin.x, FLOOR + CORE_Y, this.origin.z);
      g.explosives?.effects(c, false);
      for (let i = 0; i < 30; i++) g.sprites.emit('spark', c.x, c.y, c.z, { color: i % 2 ? 0xffffff : 0x9dffc0, size: 0.14, life: 1, spread: 12 });
      if (near) { this.alarm = g.audio?.playOwn?.('ship-alarm', null, 0.75, { duration: 8.3, fadeOut: 1.5 }) ?? null; g.hud.message('The ship is going down!'); }
      if (this.inside() || this.lift) this.took = true;
    }
    for (const e of this.aliens) if (!e.dead) e.gone = true;
    this.aliens = [];
  }

  updateEnd(dt) {
    const g = this.game, p = g.player, k = this.t - this.endT;
    // whoever's up there is let down
    if (k > (this.end === 'down' ? 1.5 : 0) && !this.lift && this.inside() && !p.dead) this.startLift('down');
    // the drones: back up into it as it goes; burnt out as it comes down
    for (const d of this.drones) {
      if (d.state !== 'landed' || !d.model) continue;
      if (this.end === 'gone' && k > LET_DOWN + 0.5) { this.dropCells(d); d.state = 'rising'; d.riseT = this.t; }
      if (this.end === 'down' && k > 6.5 && !d.burnt) {
        d.burnt = true;
        this.spendDrone(d);
        const c = d.model.group.position;
        for (let i = 0; i < 16; i++) g.sprites.emit('smoke', c.x, c.y + 2, c.z, { color: 0x3c3a38, size: 0.8, grow: 2, life: 2, spread: 2, gravity: -1, alpha: 0.5 });
      }
    }
    if (this.end === 'down') {
      // smoke as it goes, then it blows apart
      const at = this.shipAt(_v);
      if (k < 6.5 && Math.random() < dt * 12) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
        g.sprites.emit('smoke', at.x + Math.cos(a) * r, at.y + 1, at.z + Math.sin(a) * r, { color: 0x2c2a28, size: 1.6, grow: 3, life: 2.5, spread: 1.5, gravity: -1.5, alpha: 0.6 });
        if (Math.random() < 0.25) g.explosives?.effects(_w.set(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r), false);
      }
      if (k > 6.5 && !this.blew) {
        this.blew = true;
        this.ship.uniforms.uPower.value = 0;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2, r = i ? 6 + Math.random() * 16 : 0;
          g.explosives?.effects(_w.set(at.x + Math.cos(a) * r, at.y + Math.random() * 4, at.z + Math.sin(a) * r).clone(), false);
        }
        for (let i = 0; i < 60; i++) g.sprites.emit('dust', at.x + (Math.random() - 0.5) * 30, at.y, at.z + (Math.random() - 0.5) * 30, { color: 0x4a5054, size: 0.3, life: 4, spread: 6, gravity: 9, drag: 0.2, alpha: 0.95 });
        g.lightFlash?.(at, 1);
        // the loot, for whoever was in it
        if (this.took) this.loot();
      }
    }
    const over = this.end === 'down' ? k > 11 : k > GO_AFTER + 16;
    if (over && !this.lift) this.mgr.visitOver();
  }

  dropCells(d) { for (const c of d.cells) this.cells.delete(c); d.cells = []; }

  loot() {
    const g = this.game, p = g.player, o = this.origin;
    const at = p.pos.distanceTo(o) < 80 && p.pos.y < FLOOR - 2 ? p.pos : new THREE.Vector3(o.x + 3, this.groundY() ?? p.pos.y, o.z);
    for (const [id, n] of LOOT) g.drops.spawn(id, n, at.x + (Math.random() - 0.5), at.y + 0.6, at.z + (Math.random() - 0.5));
    g.hud.message('The ship left something behind');
  }

  // a safe place to keep this player at when the game's saved with them up there
  safeSpot() {
    if (!this.lift && !this.inside()) return null;
    const gy = this.groundY() ?? 80;
    const x = this.origin.x + 3.2, z = this.origin.z;
    return new THREE.Vector3(x, this.landing(x, z, gy), z);
  }

  info() {
    return { s: this.seed, h: [this.hx, this.hz], a: this.dir, e: this.t, n: this.nodes, c: this.core, d: this.drones.filter((d) => d.spent).map((d) => d.i), w: this.end };
  }
}

// ---- the game's part ---------------------------------------------------------------------------

export class Mothership {
  constructor(game, welcome = null) {
    this.game = game;
    this.visit = null;
    // (the host's) seconds of play till one may come
    this.wait = testParams.has('ufo') ? 0 : MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
    // joining a game with one about
    const u = welcome?.ufo;
    if (u && Number.isInteger(u.s) && Array.isArray(u.h) && u.h.every(Number.isInteger) && Number.isFinite(u.e)) {
      this.begin(u.s, u.h[0], u.h[1], Math.max(0, u.e), Number.isFinite(u.a) ? u.a : null);
      const v = this.visit;
      if (Array.isArray(u.n) && u.n.length === 4 && u.n.every(Number.isFinite) && Number.isFinite(u.c)) v.setState(u.n, u.c);
      if (Array.isArray(u.d)) for (const i of u.d) if (v.drones[i]) v.drones[i].spent = true;
      if (u.w === 'gone' || u.w === 'down') v.finish(u.w);
    }
  }

  get host() { const o = this.game.online; return !o || o.host; }
  get active() { return !!this.visit; }

  send(m) { const o = this.game.online; if (o?.link?.count) o.link.send(m); }

  dispose() { this.visit?.dispose(); this.visit = null; }

  // (a new start: none about)
  clear() { this.dispose(); }

  // ---- for the rest of the game ----

  raycast(o, d, max) { return this.visit && this.visit.t >= ARRIVE - 2 ? this.visit.raycast(o, d, max) : null; }
  shot(hit, it, mine) { this.visit?.shot(hit.ship, hit.at, it, mine); }
  blast(c, type, mine) { this.visit?.blast(c, type, mine); }
  safeSpot() { return this.visit?.safeSpot() ?? null; }
  welcomeInfo() { return this.visit && !this.visit.over ? this.visit.info() : null; }
  get lifting() { return !!this.visit?.lift; }
  cancelLift() { const v = this.visit; if (v?.lift) { v.lift = null; this.game.player.carried = false; this.game.hud.el?.classList.remove('beamed'); } }

  // ---- every frame ----

  update(dt, live) {
    const g = this.game;
    if (this.visit) this.visit.update(dt, live);
    if (!live || !this.host || this.visit || g.attract || !g.ready) return;
    // when one may come: from the second day on, not with no enemies, not in Dragon Endurance
    const test = testParams.has('ufo');
    if (!test && (RULES.noEnemies(g) || g.mode === 'dragon' || g.dayNumber < 2)) return;
    if ((this.wait -= dt) > 0) return;
    const target = this.pickTarget();
    if (!target) { this.wait = RETRY; return; }
    this.wait = MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
    // about 20 m past them (where they're looking, the first time it's asked for), coming in
    // over them from the other side
    let a = Math.random() * Math.PI * 2;
    if (test && target === g.player.pos) a = Math.atan2(-Math.cos(g.player.yaw), -Math.sin(g.player.yaw));
    const r = 18 + Math.random() * 8;
    const hx = Math.floor(target.x + Math.cos(a) * r), hz = Math.floor(target.z + Math.sin(a) * r);
    const dir = Math.round(Math.atan2(target.z - (hz + 0.5), target.x - (hx + 0.5)) * 1000) / 1000;
    const seed = (Math.random() * 0x7fffffff) | 0;
    this.begin(seed, hx, hz, 0, dir);
    this.send({ t: 'us', s: seed, h: [hx, hz], a: dir });
  }

  // someone it could come to: alive, and up in the open (not down a mine)
  pickTarget() {
    const g = this.game, out = [];
    const p = g.player;
    if (!p.dead && p.pos.y > 40 && (g.depth ?? 0) <= 2) out.push(p.pos);
    for (const r of g.online?.players.values() || []) if (!r.dead && r.pos.y > 40 && r.pos.y < HEIGHT) out.push(r.pos);
    return out.length ? out[Math.floor(Math.random() * out.length)] : null;
  }

  begin(seed, hx, hz, elapsed, dir = null) {
    this.visit?.dispose();
    this.visit = new Visit(this, seed, hx, hz, elapsed, dir);
  }

  // (the host) how it ends, for everyone
  finish(how) {
    if (!this.visit || this.visit.end) return;
    this.visit.finish(how);
    if (this.host) this.send({ t: 'ue', w: how });
  }

  visitOver() {
    if (!this.visit) return;
    this.visit.over = true;
    this.visit.dispose();
    this.visit = null;
  }

  // ---- from the others ----

  handleStart(seed, hx, hz, dir) { if (!this.host) this.begin(seed, hx, hz, 0, dir); }
  handleTime(e) { const v = this.visit; if (!this.host && v && !v.end && Math.abs(e - v.t) > 1) v.t = e; }
  handleDrone(i) { const v = this.visit, d = v?.drones[i]; if (d) v.spendDrone(d); }
  handleHit(k, dmg) { if (this.host) this.visit?.applyHit(k, dmg); }
  handleState(nodes, core) { if (!this.host) this.visit?.setState(nodes, core); }
  handleEnd(how) { if (!this.host) this.visit?.finish(how); }
}

// the visit's timeline, for tests and the README
export const SHIP = { FLOOR, ARRIVE, BEAM_ON, DRONE_FIRST, DRONE_EVERY, DRONE_FALL, DRONE_HITS, LEAVE_AT, NODES, PADS, CORE_Y, NODE_Y, NODE_HEALTH, CORE_HEALTH };
