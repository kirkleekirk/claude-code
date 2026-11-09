// Vehicles: the cars and pickups left around Bridger County. Most will still
// run if you find them some fuel; wrecks can be searched and stripped for
// scrap. You drive with W/S and A/D (the stick on a phone), your followers
// pile in with you, and what doesn't fit in your pack rides in the trunk
// until you pull into camp.
import * as THREE from 'three';
import { vehicleGeometry, carMaterial, glassMaterial, MODELS } from './models.js';
import { T } from '../world/terrain.js';
import { STREETS } from '../world/layout.js';
import { carFlat } from '../world/vegetation.js';
import { Pack, GUNS, itemName } from '../items.js';
import { isTouch } from '../platform.js';

const GRAV = 22;
const SHOW_DIST = { high: 360, low: 230 };
const IGNORE = new Set(['npcblock', 'walk', 'floor', 'roof', 'door-frame']);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const mph = (v) => Math.round(Math.abs(v) * 2.237);

export class Vehicle {
  constructor(mgr, o) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.id = o.id;
    this.kind = o.kind;
    this.M = MODELS[o.kind];
    this.paint = o.paint;
    this.wreck = !!o.wreck;
    this.wear = o.wear ?? (this.wreck ? 0.9 : 0.3);
    this.x = o.x; this.z = o.z; this.yaw = o.yaw || 0;
    this.y = o.y ?? this.game.physics.terrain.height(o.x, o.z);
    this.pitch = 0; this.roll = 0; this.vy = 0;
    this.vx = 0; this.vz = 0; this.steer = 0; this.spin = 0;
    this.fuel = o.fuel ?? 0;
    this.health = o.health ?? this.M.health;
    this.stripped = !!o.stripped;
    this.used = !!o.used;
    this.trunk = new Pack(this.M.trunk).load(o.trunk);
    this.trunk.cap = this.M.trunk;
    this.lights = false;
    this.brake = 0;
    this.riders = [];
    this.boxes = [];
    this.seed = o.seed ?? Math.random() * 10;
    // the trunk (or the bed) is searched like any other container
    this.loot = { type: 'loot', table: this.kind === 'pickup' ? 'truck' : 'car', pos: [0, 0, 0], label: this.kind === 'pickup' ? 'Search the truck bed' : 'Search the trunk', searched: !!o.searched, left: o.left || null, vehicle: this };
    // stable handles for the interaction system (it compares refs)
    this.acts = {};
    for (const a of ['drive', 'stow', 'refuel', 'repair', 'strip']) this.acts[a] = { vehicle: this, act: a };
    this.build();
    this.settle();
  }
  get L() { return this.M.L; }
  get W() { return this.M.W; }
  get forward() { return _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get speed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get drivable() { return !this.wreck && this.health > 0; }
  build() {
    const G = vehicleGeometry(), M = this.M;
    const paint = new THREE.Color(this.paint);
    // wrecks: sun-faded, smoke-browned paint
    if (this.wreck) paint.lerp(new THREE.Color('#6a645a'), 0.35);
    this.mat = carMaterial({ paint: '#' + paint.getHexString(), wear: this.wear, seed: this.seed, cheap: this.mgr.cheap });
    const g = this.group = new THREE.Group();
    g.rotation.order = 'YXZ';
    this.body = new THREE.Mesh(G[this.kind].opaque, this.mat);
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.glass = new THREE.Mesh(G[this.kind].glass, this.wreck ? this.mgr.grimy : this.mgr.glassMat);
    this.glass.renderOrder = 2;
    this.wheels = new THREE.InstancedMesh(G.wheel, this.mgr.wheelMat, 4);
    this.wheels.castShadow = true;
    g.add(this.body, this.glass, this.wheels);
    this.game.scene.add(g);
    this.wheelY = [M.wheelR, M.wheelR, M.wheelR, M.wheelR];
    this.placeWheels();
    this.wheels.computeBoundingSphere();
  }
  // wheel order: front-left, front-right, rear-left, rear-right (left = +x)
  wheelLocal(i) { const M = this.M; return [(i % 2 ? -1 : 1) * M.wheelX, (i < 2 ? 1 : -1) * M.wheelbase / 2]; }
  placeWheels() {
    const M = this.M, flat = this.wreck;
    for (let i = 0; i < 4; i++) {
      const [lx, lz] = this.wheelLocal(i);
      _e.set(this.spin, i < 2 ? this.steer : 0, 0, 'YXZ');
      _q.setFromEuler(_e);
      const r = M.wheelR;
      _s.set(r, flat ? r * 0.8 : r, r);
      _m.compose(_v.set(lx, flat ? r * 0.8 : this.wheelY[i], lz), _q, _s);
      this.wheels.setMatrixAt(i, _m);
    }
    this.wheels.instanceMatrix.needsUpdate = true;
  }
  // world position of a point in the car's frame (ground-level origin)
  toWorld(lx, ly, lz, out = new THREE.Vector3()) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(this.x + lx * c + lz * s, this.y + ly, this.z - lx * s + lz * c);
  }
  toLocal(x, z) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = x - this.x, dz = z - this.z;
    return [dx * c - dz * s, dx * s + dz * c];
  }
  // sit the car on the ground under its wheels
  settle() {
    const ph = this.game.physics, gy = [];
    for (let i = 0; i < 4; i++) {
      const [lx, lz] = this.wheelLocal(i), p = this.toWorld(lx, 0, lz, _v);
      gy.push(ph.groundAt(p.x, p.z, this.y + 0.6, 0.15));
    }
    this.y = (gy[0] + gy[1] + gy[2] + gy[3]) / 4;
    this.pitch = -Math.atan2((gy[0] + gy[1]) / 2 - (gy[2] + gy[3]) / 2, this.M.wheelbase);
    this.roll = Math.atan2((gy[0] + gy[2]) / 2 - (gy[1] + gy[3]) / 2, this.M.wheelX * 2);
    if (this.wreck) { this.y -= 0.07; this.roll += (this.seed % 1 - 0.5) * 0.05; }
    this.vy = 0;
    this.sync();
    this.placeBoxes();
  }
  sync() {
    const g = this.group;
    g.position.set(this.x, this.y + (this.bob || 0), this.z);
    g.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    g.updateMatrixWorld(true);
  }
  // collision boxes along the body, so angled cars stay tight; they move
  // with the car a few times a second while it's driven
  placeBoxes() {
    const ph = this.game.physics;
    // drop the old set (and its owner entry, so the list never grows)
    ph.removeOwner(this);
    this.boxes = [];
    const M = this.M, L = M.L / 2, W = M.W / 2, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const n = Math.max(1, Math.ceil(M.L / 0.9));
    const shrink = Math.abs(Math.sin(2 * this.yaw)) * 0.12;
    for (let i = 0; i < n; i++) {
      const z0 = -L + (2 * L * i) / n, z1 = -L + (2 * L * (i + 1)) / n;
      const xs = [], zs = [];
      for (const [lx, lz] of [[-W, z0], [W, z0], [W, z1], [-W, z1]]) { xs.push(this.x + lx * c + lz * s); zs.push(this.z - lx * s + lz * c); }
      const box = { min: [Math.min(...xs) + shrink, this.y, Math.min(...zs) + shrink], max: [Math.max(...xs) - shrink, this.y + M.height, Math.max(...zs) - shrink], kind: 'car', carId: this.id, owner: this };
      ph.add(box, this);
      this.boxes.push(box);
    }
    this.boxAt = [this.x, this.z, this.yaw];
    const t = this.toWorld(0, 0.9, -M.L / 2 - 0.35);
    this.loot.pos[0] = t.x; this.loot.pos[1] = t.y; this.loot.pos[2] = t.z;
  }
  removeBoxes() { this.game.physics.removeOwner(this); this.boxes = []; }
  // the doors you get in by (driver's side first)
  doorPoints() {
    const hw = this.M.W / 2;
    return [this.toWorld(hw + 0.55, 0, 0.15), this.toWorld(-hw - 0.55, 0, 0.15)];
  }
  setLamps(head, tail) {
    const u = this.mat.userData.u;
    u.uHead.value = head; u.uTail.value = tail; u.uAmber.value = head > 0 ? 0.7 : 0;
  }
  // a knock from a crash, a zombie or a bullet
  takeHit(n, quiet = false) {
    if (this.wreck) return;
    this.health -= n;
    if (this.health <= 0) {
      this.health = 0;
      if (!quiet && this.mgr.driving === this) this.game.hud.toast(`The ${this.M.name.toLowerCase()} is done for. It won't run again.`, 4);
      this.wreck = true; this.wear = Math.max(this.wear, 0.75);
      this.glass.material = this.mgr.grimy;
      this.mat.userData.u.uWear.value = this.wear;
      this.placeWheels();
    }
  }
  dispose() {
    this.removeBoxes();
    this.game.scene.remove(this.group);
    this.mat.dispose();
  }
  toJSON() {
    return {
      id: this.id, kind: this.kind, paint: this.paint, wreck: this.wreck, wear: this.wear, seed: this.seed,
      ...(this.away ? { x: this.away.home[0], z: this.away.home[1], yaw: this.away.home[2] } : { x: +this.x.toFixed(2), z: +this.z.toFixed(2), y: +this.y.toFixed(2), yaw: +this.yaw.toFixed(3) }),
      fuel: +this.fuel.toFixed(3), health: +this.health.toFixed(1), searched: this.loot.searched, left: this.loot.left, stripped: this.stripped, used: this.used || undefined,
      trunk: this.trunk.isEmpty() ? null : this.trunk.toJSON(),
    };
  }
}

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.n = 0;
    this.glassMat = glassMaterial(false);
    this.grimy = glassMaterial(true);
    this.cheap = !!(game.quality && game.quality.level === 'low');
    this.wheelMat = carMaterial({ paint: '#222222', wear: 0.35, seed: 3, cheap: true });
    this.driving = null;
    this.camYaw = 0; this.orbit = 0; this.orbitT = 0; this.camPitch = 0.16;
    this.camPos = new THREE.Vector3();
    this.shake = 0;
    // the driven car's headlights (made once, so no shader rebuilds later)
    const hl = this.headlight = new THREE.SpotLight(0xfff0d8, 0, 85, 0.48, 0.6, 1.0);
    game.scene.add(hl, hl.target);
    this.engine = null;
  }
  // ---------------- the county's cars ----------------
  spawn(o) {
    const v = new Vehicle(this, { id: o.id || 'v' + this.n++, ...o });
    this.list.push(v);
    return v;
  }
  // first time in this world: what the map left parked
  fromWorld(spots) {
    for (const s of spots) this.spawn(s);
  }
  restore(list) {
    for (const v of this.list) v.dispose();
    this.list = [];
    for (const o of list || []) if (MODELS[o.kind]) { const v = this.spawn(o); const k = +String(o.id).replace(/\D/g, ''); if (k >= this.n) this.n = k + 1; void v; }
  }
  toJSON() { return this.list.map((v) => v.toJSON()); }
  nearest(x, z, r = 6, pred = null) {
    let best = null, bd = r;
    for (const v of this.list) {
      const d = Math.hypot(v.x - x, v.z - z) - v.M.L / 2;
      if (d < bd && (!pred || pred(v))) { bd = d; best = v; }
    }
    return best;
  }

  byId(id) { return this.list.find((v) => v.id === id) || null; }
  // a running car with some gas parked inside your claim (for supply runs)
  campCar() {
    const g = this.game;
    let best = null;
    for (const v of this.list) {
      if (!v.drivable || v.away || v === this.driving || v.fuel < 0.15 || !g.claims.at(v.x, v.z)) continue;
      if (!best || v.M.trunk > best.M.trunk) best = v;
    }
    return best;
  }
  // gone on a trip: off the map until the crew comes home
  sendOut(v, team) {
    v.away = { team: team.length, home: [v.x, v.z, v.yaw] };
    v.removeBoxes();
    v.group.visible = false;
  }
  carBack(id, m) {
    const v = this.byId(id);
    if (!v || !v.away) return;
    if (--v.away.team > 0) return;
    const [x, z, yaw] = v.away.home;
    v.away = null;
    v.x = x; v.z = z; v.yaw = yaw;
    v.fuel = Math.max(0, v.fuel - 0.1 - Math.random() * 0.08);
    if (Math.random() < 0.3) v.takeHit(5 + Math.random() * 15, true);
    v.settle();
    void m;
  }

  // ---------------- interaction (on foot) ----------------
  // offers for the interaction system: get in, stow your pack, refuel, patch
  // up, strip a wreck; the trunk search is a normal container
  candidates(p, out, pushLoot) {
    const g = this.game, pack = g.player.body && g.player.body.pack;
    const inCamp = !!g.claims.at(p.x, p.z);
    for (const v of this.list) {
      if (v.away) continue;
      const d0 = Math.hypot(v.x - p.x, v.z - p.z);
      if (d0 > v.M.L / 2 + 3.2 || Math.abs(v.y - p.y) > 1.6) continue;
      const [lx, lz] = v.toLocal(p.x, p.z), hw = v.M.W / 2, hl = v.M.L / 2;
      const side = Math.abs(lx) > hw - 0.1 && Math.abs(lz) < hl - 0.3;
      const rear = lz < -hl + 0.6 && Math.abs(lx) < hw + 0.6;
      const front = lz > hl - 0.6 && Math.abs(lx) < hw + 0.6;
      const push = (act, lpt, extra = 0) => {
        const w = v.toWorld(lpt[0], 1.0, lpt[1]);
        out.push({ kind: 'veh', ref: v.acts[act], pos: [w.x, w.y, w.z], dist: Math.hypot(w.x - p.x, w.z - p.z) + extra });
      };
      if (rear || (Math.abs(lz) > hl - 1.2 && Math.abs(lx) < hw + 1.4)) pushLoot(v.loot);
      if (v.drivable && side) push('drive', [Math.sign(lx) * (hw + 0.3), 0.15]);
      if (!v.drivable && !v.stripped && (side || front)) push('strip', [Math.sign(lx || 1) * (hw + 0.3), 0.6], 0.2);
      if (v.drivable && rear && v.loot.searched && pack && !pack.isEmpty() && !inCamp && v.trunk.room() > 0.5) push('stow', [0, -hl - 0.3], 0.1);
      if (v.drivable && v.fuel < 0.92 && (side || rear) && this.supply('fuel', 1, false)) push('refuel', [-(hw + 0.3), -hl + 0.9], 0.3);
      if (v.drivable && v.health < v.M.health * 0.75 && front && this.supply('metal', 2, false)) push('repair', [0, hl + 0.3], 0.2);
    }
  }
  // fuel or metal from your pack, or from camp storage when you're at camp
  supply(id, n, take = true) {
    const g = this.game, b = g.player.body, inCamp = !!g.claims.at(g.player.pos.x, g.player.pos.z);
    const have = (b ? b.pack.count('res', id) : 0) + (inCamp ? g.storage.count('res', id) : 0);
    if (have < n) return false;
    if (take) {
      let need = n;
      if (b) need -= b.pack.take('res', id, need);
      if (need > 0) g.storage.take('res', id, need);
      g.markDirty && g.markDirty();
    }
    return true;
  }
  interact(best, dt, inp, it) {
    const g = this.game, { vehicle: v, act } = best.ref, name = v.M.name.toLowerCase();
    const hold = (secs, label, done) => {
      if (inp.down('KeyE')) it.hold += dt; else it.hold = Math.max(0, it.hold - dt * 2);
      g.hud.setPrompt(label, 'Hold E', it.hold > 0 ? it.hold / secs : null);
      g.player.noise = Math.max(g.player.noise, inp.down('KeyE') ? 5 : 0);
      if (it.hold >= secs) { it.hold = 0; done(); }
    };
    if (act === 'drive') {
      g.hud.setPrompt(v.fuel <= 0.002 ? `Get in the ${name} (empty tank)` : `Drive the ${name}`);
      if (inp.pressed('KeyE')) { inp.pressedSet.delete('KeyE'); this.enter(v); }
    } else if (act === 'stow') {
      g.hud.setPrompt(`Put your pack in the ${v.kind === 'pickup' ? 'truck bed' : 'trunk'}`);
      if (inp.pressed('KeyE')) { inp.pressedSet.delete('KeyE'); this.stow(v); }
    } else if (act === 'refuel') {
      hold(1.4, `Refuel the ${name} (1 Fuel)`, () => {
        if (!this.supply('fuel', 1)) return;
        v.fuel = Math.min(1, v.fuel + 0.3);
        g.audio.noise(0.5, 500, 0.8, 0.25, 'lowpass');
        g.hud.loot(`Tank ${Math.round(v.fuel * 100)}% full`);
      });
    } else if (act === 'repair') {
      hold(2.6, `Patch up the ${name} (2 Metal)`, () => {
        if (!this.supply('metal', 2)) return;
        v.health = Math.min(v.M.health, v.health + v.M.health * 0.35);
        g.audio.build();
        g.hud.loot(`The ${name} is in ${condWord(v)} shape`);
      });
    } else if (act === 'strip') {
      hold(3.2, `Strip the wreck for scrap`, () => {
        v.stripped = true;
        const entries = [{ kind: 'res', id: 'metal', n: 2 + Math.floor(Math.random() * 3) }];
        if (Math.random() < 0.35) entries.push({ kind: 'res', id: 'fuel', n: 1 });
        const { got, left } = g.giveLoot(g.player.body, entries);
        g.audio.salvage();
        if (got.length) g.hud.loot('Stripped ' + got.join(', '));
        if (left.length) g.hud.toast('Your pack is full.', 2.5);
        g.markDirty && g.markDirty();
      });
    }
  }
  // empty your pack into the trunk (keeping what you'd want on you)
  stow(v) {
    const g = this.game, b = g.player.body, pk = b.pack, tr = v.trunk, moved = [];
    const keep = { food: 2, meds: 2 };
    const gd = b.gear.gun ? GUNS[b.gear.gun.id] : null;
    for (const [k, n] of Object.entries(pk.res)) { const t = tr.add('res', k, Math.max(0, n - (keep[k] || 0))); if (t) { pk.take('res', k, t); moved.push(itemName('res', k, t)); } }
    for (const [k, n] of Object.entries(pk.ammo)) { const t = tr.add('ammo', k, Math.max(0, n - (gd && gd.ammo === k ? gd.mag * 3 : 0))); if (t) { pk.take('ammo', k, t); moved.push(itemName('ammo', k, t)); } }
    for (const gun of [...pk.guns]) if (tr.add('gun', gun.id, 1, { mag: gun.mag })) { pk.take('gun', gun.id); moved.push(itemName('gun', gun.id)); }
    g.hud.loot(moved.length ? `In the ${v.kind === 'pickup' ? 'bed' : 'trunk'}: ${moved.join(', ')}` : `The ${v.kind === 'pickup' ? 'bed' : 'trunk'} is full`);
    if (moved.length) g.markDirty && g.markDirty();
  }
  // what a search couldn't fit in your pack goes in the car you came in
  overflow(left) {
    const g = this.game, v = this.lastDriven;
    if (!v || !v.drivable || Math.hypot(v.x - g.player.pos.x, v.z - g.player.pos.z) > 30) return left;
    const rest = [], put = [];
    for (const e of left) {
      const n = v.trunk.add(e.kind, e.id, e.n, { mag: e.mag });
      if (n > 0) put.push(itemName(e.kind, e.id, n));
      if (n < e.n) rest.push({ ...e, n: e.n - n });
    }
    if (put.length) g.hud.toast(`Pack full: ${put.join(', ')} went in the ${v.kind === 'pickup' ? 'truck bed' : 'trunk'}.`, 3.5);
    return rest;
  }
  // at camp: the trunk goes into storage
  unloadTrunk(v) {
    const g = this.game, tr = v.trunk, moved = [];
    for (const [k, n] of Object.entries(tr.res)) if (n > 0) { tr.take('res', k, n); g.storage.put('res', k, n); moved.push(itemName('res', k, n)); }
    for (const [k, n] of Object.entries(tr.ammo)) if (n > 0) { tr.take('ammo', k, n); g.storage.put('ammo', k, n); moved.push(itemName('ammo', k, n)); }
    for (const [k, n] of Object.entries(tr.items)) if (n > 0) { tr.take('item', k, n); g.storage.put('item', k, n); moved.push(itemName('item', k, n)); }
    while (tr.guns.length) { const gun = tr.guns.pop(); g.storage.put('gun', gun.id, 1, { mag: gun.mag }); moved.push(itemName('gun', gun.id)); }
    if (moved.length) { g.hud.loot(`Unloaded at camp: ${moved.join(', ')}`); g.markDirty && g.markDirty(); }
  }

  // ---------------- getting in and out ----------------
  enter(v) {
    const g = this.game, p = g.player;
    if (this.driving || !v.drivable || p.dead || !p.body) return;
    this.driving = v;
    this.lastDriven = v;
    v.used = true;
    p.vehicle = v;
    p.vel.set(0, 0, 0);
    p.aiming = false; p.crouch = false; p.attackT = -1;
    if (g.player.flashlightOn) { g.player.flashlightOn = false; this.flashWasOn = true; }
    v.removeBoxes();
    v.parkT = 0;
    // lights on after dark
    v.lights = g.sky.darkness > 0.55;
    this.camYaw = v.yaw; this.orbit = 0; this.camInit = false;
    // your followers pile in
    const seats = v.M.seats.length - 1;
    const soc = g.society;
    if (soc) {
      const fol = soc.npcs.filter((n) => n.faction === 'camp' && n.mode === 'follow' && !n.dead && !n.downed && !n.controlled && !n.riding && Math.hypot(n.pos.x - v.x, n.pos.z - v.z) < 28)
        .sort((a, b) => Math.hypot(a.pos.x - v.x, a.pos.z - v.z) - Math.hypot(b.pos.x - v.x, b.pos.z - v.z));
      for (const n of fol.slice(0, seats)) this.board(v, n);
      if (fol.length > seats) g.hud.toast(`No room for ${fol.slice(seats).map((n) => n.first).join(' and ')}. They'll follow on foot.`, 3.5);
    }
    g.audio.thud();
    this.startEngine();
    document.getElementById('ui').classList.add('driving');
    if (!this.taught) {
      this.taught = true;
      g.hud.toast(isTouch ? 'Stick: steer and drive · Brake: handbrake · Use: get out · Horn draws the dead' : 'W/S drive and brake · A/D steer · Space handbrake · E get out · F lights · Q horn', 6);
    }
    if (v.fuel <= 0.002) g.hud.toast('The tank is empty. Bring Fuel and refuel it at the filler cap.', 4);
  }
  board(v, n) {
    if (n.task && n.task.slot && n.task.slot.user === n) n.task.slot.user = null;
    n.stop(); n.task = null; n.setAct(null); n.combatTarget = null; n.aiming = false;
    n.riding = v;
    n.seat = v.riders.length + 1;
    v.riders.push(n);
  }
  // somewhere clear beside the car
  exitSpot(v, side = 1) {
    const ph = this.game.physics, hw = v.M.W / 2;
    const tries = [[side * (hw + 0.7), 0.1], [-side * (hw + 0.7), 0.1], [side * (hw + 0.7), -1.2], [0, -v.M.L / 2 - 0.9], [0, v.M.L / 2 + 0.9], [side * (hw + 1.6), 0.1]];
    for (const [lx, lz] of tries) {
      const w = v.toWorld(lx, 0, lz);
      const gy = ph.groundAt(w.x, w.z, v.y + 1.2, 0.2);
      if (gy < T.water - 0.8 || Math.abs(gy - v.y) > 1.2) continue;
      // (the car's own boxes don't count: an angled car's are a little wide)
      const [cx, cz] = ph.collide(w.x, w.z, 0.34, gy, gy + 1.7, 0.48, v, 'door');
      if (Math.hypot(cx - w.x, cz - w.z) < 0.08) return [w.x, gy, w.z];
    }
    const w = v.toWorld(side * (hw + 0.8), 0, 0);
    return [w.x, v.y, w.z];
  }
  exit(force = false) {
    const g = this.game, v = this.driving, p = g.player;
    if (!v) return true;
    if (!force && Math.abs(v.speed) > 3.2) { g.hud.toast('Slow down first.', 1.5); return false; }
    v.vx = v.vz = 0;
    this.driving = null;
    p.vehicle = null;
    const [x, y, z] = this.exitSpot(v, 1);
    p.spawn(x, z, y);
    p.facing = Math.atan2(x - v.x, z - v.z);
    p.char.root.quaternion.identity();
    p.char.root.rotation.set(0, p.facing, 0);
    g.tpc.yaw = this.camYaw + Math.PI + this.orbit;
    g.tpc.pitch = -0.2;
    for (const n of v.riders) this.unboard(v, n);
    v.riders = [];
    v.lights = false;
    v.setLamps(0, 0);
    this.headlight.intensity = 0;
    v.settle();
    this.stopEngine();
    document.getElementById('ui').classList.remove('driving');
    if (this.flashWasOn) { this.flashWasOn = false; if (g.sky.darkness > 0.5) p.flashlightOn = true; }
    g.audio.thud();
    if (g.claims.at(v.x, v.z) && !v.trunk.isEmpty()) this.unloadTrunk(v);
    g.markDirty && g.markDirty();
    return true;
  }
  unboard(v, n) {
    const side = n.seat % 2 ? -1 : 1;
    n.riding = null; n.seat = 0;
    const [x, y, z] = this.exitSpot(v, side);
    n.pos.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8);
    n.visualY = y;
    n.vel.set(0, 0, 0);
    n.char.root.quaternion.identity();
    n.setAct(null);
  }
  // something took the player out of the seat (death, a switch of body, a load)
  eject() { if (this.driving) this.exit(true); }

  // ---------------- per frame ----------------
  update(dt) {
    // riders sit in their seats; anyone hurt badly enough falls out
    for (const v of this.list) for (const n of [...v.riders]) {
      if (n.dead || n.downed) { this.unboard(v, n); v.riders = v.riders.filter((o) => o !== n); continue; }
      if (v !== this.driving) this.placeRider(v, n, dt);
    }
  }
  // every frame, whatever the view: what's drawn, and the grass under the
  // four cars nearest the camera pressed flat
  cull() {
    const g = this.game, cam = g.camera.position;
    const show = SHOW_DIST[g.quality && g.quality.level === 'low' ? 'low' : 'high'];
    const near = [];
    for (const v of this.list) {
      const d = Math.hypot(v.x - cam.x, v.z - cam.z);
      v.camD = d;
      if (v.away) { v.group.visible = false; continue; }
      if (d < 60) near.push(v);
      v.group.visible = d < show;
      v.body.castShadow = d < 90;
      v.wheels.castShadow = d < 60;
    }
    near.sort((a, b) => a.camD - b.camD);
    for (let i = 0; i < 4; i++) {
      const v = near[i], A = carFlat.uCarA.value[i], B = carFlat.uCarB.value[i];
      if (!v) { A.set(1e6, 1e6, 1, 0); continue; }
      A.set(v.x, v.z, Math.cos(v.yaw), Math.sin(v.yaw));
      B.set(v.M.L / 2 - 0.1, v.M.W / 2 - 0.05, 0, 0);
    }
  }
  // seat transform → a body sitting in it
  placeRider(v, n, dt) {
    const seat = v.M.seats[Math.min(n.seat || 0, v.M.seats.length - 1)];
    const root = n.char.root;
    v.group.updateMatrixWorld(true);
    root.position.set(seat[0], seat[1] - 0.45, seat[2]).applyMatrix4(v.group.matrixWorld);
    root.quaternion.copy(v.group.quaternion);
    n.pos.set(root.position.x, v.y + 0.3, root.position.z);
    n.visualY = n.pos.y;
    n.facing = v.yaw;
    root.visible = v.group.visible;
    if (n.items) n.items.group.visible = false;
    if (n.char !== this.game.player.char || this.driving !== v) n.char.animate(dt, { speed: 0, mode: 'idle', act: 'sit_ride', seatH: 0.45, lookYaw: Math.sin(performance.now() / 2300 + (n.seat || 0)) * 0.5 });
    root.updateMatrixWorld(true);
  }
  // the driven car: input, physics, the people in it, the camera, sound
  updateDriving(dt) {
    const v = this.driving;
    if (!v) return;
    const g = this.game, inp = g.input, p = g.player;
    if (p.dead) { this.exit(true); return; }
    // wrecked under you: roll to a stop and climb out
    if (!v.drivable && Math.abs(v.speed) < 0.6) { this.exit(true); return; }
    let ax = inp.moveAxis();
    // a phone stick pushed sideways steers; up and down drive
    let throttle = ax.y, steerIn = ax.x;
    const hand = inp.down('Space');
    if (inp.pressed('KeyF')) { v.lights = !v.lights; }
    if (inp.pressed('KeyQ') || inp.pressed('TouchAttack')) this.horn(v);
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < steps; i++) this.step(v, dt / steps, throttle, steerIn, hand);
    v.sync();
    // boxes follow a few times a second so others bump into it
    v.parkT = (v.parkT || 0) + dt;
    if (v.parkT > 0.3 && (Math.hypot(v.x - v.boxAt[0], v.z - v.boxAt[1]) > 0.25 || Math.abs(wrapPi(v.yaw - v.boxAt[2])) > 0.04 || !v.boxes.length)) {
      v.parkT = 0;
      if (Math.abs(v.speed) < 2) v.placeBoxes(); else v.removeBoxes();
      v.boxAt = [v.x, v.z, v.yaw];
    }
    // wheels: roll, steer, follow the ground
    v.spin += v.speed / v.M.wheelR * dt;
    v.placeWheels();
    // the driver
    this.placeRider(v, p.body, dt);
    p.char.animate(dt, { speed: 0, mode: 'idle', act: 'sit_drive', seatH: 0.45, lookYaw: -v.steer * 0.6 });
    p.char.root.visible = true;
    p.weaponMesh.visible = false;
    p.pos.set(p.char.root.position.x, v.y + 0.4, p.char.root.position.z);
    p.visualY = v.y; p.speed = Math.abs(v.speed);
    p.noise = 14 + Math.abs(v.speed) * 1.6;
    for (const n of v.riders) this.placeRider(v, n, dt);
    this.camera(v, dt);
    this.lamps(v, dt);
    this.engineSound(v, throttle);
    this.hud(v);
    // pulling into camp unloads the trunk
    const inCamp = !!g.claims.at(v.x, v.z);
    if (inCamp && this.wasInCamp === false) { if (!v.trunk.isEmpty()) this.unloadTrunk(v); if (p.body) g.unload(p.body, true); }
    this.wasInCamp = inCamp;
  }
  surface(x, z) {
    const w = this.game.world;
    if (w.roadDist && w.roadDist(x, z) < 0.6) return 'road';
    for (const s of STREETS.ns) if (x > s.x0 - 0.5 && x < s.x1 + 0.5 && z > s.z0 && z < s.z1) return 'road';
    for (const s of STREETS.ew) if (x > s.x0 && x < s.x1 && z > s.z0 - 0.5 && z < s.z1 + 0.5) return 'road';
    return 'dirt';
  }
  step(v, dt, throttle, steerIn, hand) {
    const g = this.game, ph = g.physics, M = v.M;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
    let vF = v.vx * fx + v.vz * fz, vL = v.vx * lx + v.vz * lz;
    const road = this.surface(v.x, v.z) === 'road';
    const vmax = M.maxSpeed * (road ? 1 : M.offroad) * (v.health < M.health * 0.3 ? 0.7 : 1);
    if (v.fuel <= 0 || !v.drivable) throttle = Math.min(0, throttle) * (vF > 0.5 ? 1 : 0);
    let a = 0;
    v.brake = 0;
    if (throttle > 0.05) {
      if (vF < -0.4) { a = M.brake * throttle; v.brake = 1; }
      else a = M.accel * throttle * Math.max(0, 1 - (vF / vmax) ** 2);
    } else if (throttle < -0.05) {
      if (vF > 0.4) { a = -M.brake * -throttle; v.brake = 1; }
      else a = vF > -7 ? -M.accel * 0.55 * -throttle : 0;
    } else a = -Math.sign(vF) * Math.min(Math.abs(vF) / dt, road ? 0.7 : 1.6);
    if (hand && Math.abs(vF) > 0.1) { a -= Math.sign(vF) * 6.5; v.brake = 1; }
    // hills: slower going up, quicker coming down
    // (a car left idle stays put; the parking brake holds it)
    if (Math.abs(vF) > 0.5 || Math.abs(throttle) > 0.05) a += 9.8 * Math.sin(v.pitch) * 0.8;
    if (vF > vmax) a = Math.min(a, -1.5);
    vF += a * dt;
    if (Math.abs(vF) < 0.03 && Math.abs(throttle) < 0.05) vF = 0;
    // steering: less lock at speed, the wheels come back by themselves
    const lock = 0.62 / (1 + Math.abs(vF) * 0.09);
    const want = -steerIn * lock;
    v.steer += (want - v.steer) * Math.min(1, dt * (Math.abs(steerIn) > 0.05 ? 7 : 5));
    // grip: the tyres kill sideways slide; the handbrake lets the tail out
    const grip = (hand ? 1.6 : road ? 11 : 6.5) * M.grip;
    vL *= Math.exp(-grip * dt);
    v.yaw += (vF * Math.tan(v.steer) / M.wheelbase) * dt * (hand ? 1.3 : 1);
    v.slide = Math.abs(vL);
    const nfx = Math.sin(v.yaw), nfz = Math.cos(v.yaw), nlx = Math.cos(v.yaw), nlz = -Math.sin(v.yaw);
    v.vx = nfx * vF + nlx * vL; v.vz = nfz * vF + nlz * vL;
    // fuel burns with distance, more under load
    const dist = Math.hypot(v.vx, v.vz) * dt;
    v.fuel = Math.max(0, v.fuel - dist * M.fuelUse * (1 + Math.max(0, throttle) * 0.3));
    if (v.fuel <= 0 && !this.dryWarned) { this.dryWarned = true; g.hud.toast('Out of fuel.', 3); }
    if (v.fuel > 0) this.dryWarned = false;
    // move, then push out of anything solid
    const ox = v.x, oz = v.z;
    let nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
    const r = M.W / 2 + 0.02, off = M.L / 2 - r;
    let hitN = null, hitDepth = 0;
    for (let it = 0; it < 2; it++) {
      let bx = 0, bz = 0, bd = 0;
      for (const o of [off, 0, -off]) {
        const cx = nx + nfx * o, cz = nz + nfz * o;
        const [rx, rz] = ph.collide(cx, cz, r, v.y + 0.3, v.y + M.height, 0.32, v, IGNORE);
        const d = Math.hypot(rx - cx, rz - cz);
        if (d > bd) { bd = d; bx = rx - cx; bz = rz - cz; }
      }
      if (bd < 1e-4) break;
      nx += bx; nz += bz;
      if (bd > hitDepth) { hitDepth = bd; hitN = [bx / bd, bz / bd]; }
    }
    // deep water stops you at the bank
    const tw = ph.terrain.height(nx + nfx * M.L * 0.45 * Math.sign(vF || 1), nz + nfz * M.L * 0.45 * Math.sign(vF || 1));
    if (tw < T.water - 0.7) {
      nx = ox; nz = oz; v.vx = 0; v.vz = 0;
      if (!this.waterWarn || performance.now() > this.waterWarn) { this.waterWarn = performance.now() + 3000; g.hud.toast('Too deep to drive into.', 2); }
    }
    v.x = nx; v.z = nz;
    if (hitN) {
      const vn = v.vx * hitN[0] + v.vz * hitN[1];
      if (vn < 0) {
        v.vx -= hitN[0] * vn * 1.15; v.vz -= hitN[1] * vn * 1.15;
        const impact = -vn;
        if (impact > 3) {
          v.takeHit((impact - 3) * 3.2 / M.mass);
          this.shake = Math.min(1, impact / 14);
          if (!this.bangT || performance.now() > this.bangT) { this.bangT = performance.now() + 250; g.audio.thud(); if (impact > 8) g.audio.bang(); }
          if (impact > 9 && g.player.body) g.player.damage((impact - 9) * 1.8, { crash: true });
        }
      }
    }
    // the ground under each wheel: height, pitch and roll, and flying off crests
    const gy = [];
    for (let i = 0; i < 4; i++) {
      const [wx, wz] = v.wheelLocal(i);
      const px = v.x + wx * nlx + wz * nfx, pz = v.z + wx * nlz + wz * nfz;
      gy.push(ph.groundAt(px, pz, v.y + 0.55, 0.12));
    }
    const target = (gy[0] + gy[1] + gy[2] + gy[3]) / 4;
    if (target >= v.y - 0.02) {
      if (v.vy < -7) { v.takeHit((-v.vy - 7) * 2.5 / M.mass); g.audio.thud(); this.shake = Math.min(1, -v.vy / 14); }
      v.y = target;
      v.vy = 0;
      v.air = 0;
    } else {
      v.vy -= GRAV * dt;
      v.y = Math.max(target, v.y + v.vy * dt);
      v.air = (v.air || 0) + dt;
      if (v.y <= target) v.vy = 0;
    }
    const tp = -Math.atan2((gy[0] + gy[1]) / 2 - (gy[2] + gy[3]) / 2, M.wheelbase);
    const tr = Math.atan2((gy[0] + gy[2]) / 2 - (gy[1] + gy[3]) / 2, M.wheelX * 2);
    const k = Math.min(1, dt * (v.air > 0.05 ? 1.5 : 12));
    // a little body roll in corners, squat and dive under power and braking
    const lat = vF * vF * Math.tan(v.steer) / M.wheelbase;
    v.pitch += (tp - a * 0.004 - v.pitch) * k;
    v.roll += (tr - lat * 0.006 - v.roll) * k;
    for (let i = 0; i < 4; i++) v.wheelY[i] = M.wheelR + Math.max(-0.1, Math.min(0.1, gy[i] - target));
    // rough going off the road
    v.bob = road ? 0 : Math.sin(performance.now() / 70 + v.x) * Math.min(0.025, Math.abs(vF) * 0.002);
    // the dead (and anyone in the way)
    this.runOver(v, vF, nfx, nfz);
  }
  runOver(v, vF, fx, fz) {
    const g = this.game, M = v.M, hw = M.W / 2 + 0.35, hl = M.L / 2 + 0.35;
    for (const z of g.zombies.list) {
      if (z.dead) continue;
      const dx = z.pos.x - v.x, dz = z.pos.z - v.z;
      if (dx * dx + dz * dz > (hl + 1) * (hl + 1) || Math.abs(z.pos.y - v.y) > 1.5) continue;
      const [lx, lz] = v.toLocal(z.pos.x, z.pos.z);
      if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
      const sp = Math.abs(vF);
      if (sp > 2.5 && Math.sign(lz) === Math.sign(vF)) {
        z.hurt(sp * 9, fx * Math.sign(vF), fz * Math.sign(vF), 'car');
        z.vel.x += fx * vF * 0.6; z.vel.z += fz * vF * 0.6;
        if (z.health > 0) z.downT = Math.max(z.downT || 0, 2.2);
        v.takeHit(1 + sp * 0.12 / M.mass, true);
        const keep = 1 - 0.1 / M.mass;
        v.vx *= keep; v.vz *= keep;
        g.audio.thud();
        this.shake = Math.max(this.shake, 0.35);
      } else {
        // shoved aside
        const s = Math.sign(lx) || 1, push = hw - Math.abs(lx);
        const c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
        z.pos.x += s * push * c; z.pos.z -= s * push * sn;
      }
    }
    // people step (or get shoved) out of the way
    const soc = g.society;
    if (soc) for (const n of soc.npcs) {
      if (n.dead || n.riding || n.controlled || n.mode === 'away') continue;
      const dx = n.pos.x - v.x, dz = n.pos.z - v.z;
      if (dx * dx + dz * dz > (hl + 1) * (hl + 1)) continue;
      const [lx, lz] = v.toLocal(n.pos.x, n.pos.z);
      if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
      const s = Math.sign(lx) || 1, push = hw - Math.abs(lx) + 0.05;
      n.pos.x += s * push * Math.cos(v.yaw); n.pos.z -= s * push * Math.sin(v.yaw);
      if (Math.abs(vF) > 4 && n.faction === 'raider' && n.damage) n.damage(Math.abs(vF) * 3, g.player.body);
    }
  }
  horn(v) {
    const g = this.game, a = g.audio;
    if (this.hornT && performance.now() < this.hornT) return;
    this.hornT = performance.now() + 600;
    a.tone(392, 0.45, 0.18, 'square'); a.tone(311, 0.45, 0.16, 'square');
    g.zombies.alertNoise(new THREE.Vector3(v.x, v.y, v.z), 70);
  }
  // chase camera: swings round behind the car, lets you look about with the
  // mouse or a drag, and never ends up inside a wall
  camera(v, dt) {
    const g = this.game, inp = g.input, cam = g.camera;
    const ld = inp.lookDelta();
    const dragging = !inp.locked && (inp.mouse.buttons & 1) && inp.dragMoved;
    if ((inp.locked || inp.touch.active || dragging) && (Math.abs(ld.x) + Math.abs(ld.y) > 0)) {
      const s = inp.touch.active ? g.tpc.touchSens : g.tpc.sens;
      this.orbit -= ld.x * s; this.camPitch = Math.max(-0.05, Math.min(0.7, this.camPitch + ld.y * s * 0.6));
      this.orbitT = 1.6;
    } else {
      this.orbitT -= dt;
      if (this.orbitT <= 0) { this.orbit *= Math.exp(-dt * 1.8); this.camPitch += (0.16 - this.camPitch) * Math.min(1, dt * 1.2); }
    }
    // follow the way the car is going (reversing keeps the view forward)
    const sp = v.speed;
    this.camYaw += wrapPi(v.yaw - this.camYaw) * Math.min(1, dt * (1.5 + Math.abs(sp) * 0.08));
    const yaw = this.camYaw + this.orbit;
    const dist = v.M.L * 1.35 + Math.min(3, Math.abs(sp) * 0.08), pitch = this.camPitch;
    const pivot = _v.set(v.x, v.y + v.M.height * 0.85, v.z);
    const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const hit = g.physics.raycast(pivot.x, pivot.y, pivot.z, dir[0], dir[1], dir[2], dist + 0.4, { skipGlass: true, filter: (b) => b.owner !== v && b.kind !== 'tree' && b.kind !== 'zombie' && b.kind !== 'prop-small', terrainPad: 0.4, pad: 0.15 });
    const d = Math.max(1.8, Math.min(dist, hit.dist - 0.3));
    const want = new THREE.Vector3(pivot.x + dir[0] * d, pivot.y + dir[1] * d, pivot.z + dir[2] * d);
    if (!this.camInit) { this.camInit = true; this.camPos.copy(want); }
    this.camPos.lerp(want, Math.min(1, dt * 9));
    cam.position.copy(this.camPos);
    if (this.shake > 0.01) { cam.position.x += (Math.random() - 0.5) * this.shake * 0.25; cam.position.y += (Math.random() - 0.5) * this.shake * 0.25; this.shake *= Math.exp(-dt * 6); }
    cam.lookAt(v.x + Math.sin(yaw) * 2.5, v.y + v.M.height * 0.7, v.z + Math.cos(yaw) * 2.5);
    const fov = 62 + Math.min(12, Math.abs(sp) * 0.4);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
    // keep the on-foot camera pointed the same way for when you get out
    g.tpc.yaw = yaw + Math.PI;
  }
  lamps(v, dt) {
    const hl = this.headlight;
    const brake = v.brake ? 1 : 0;
    v.setLamps(v.lights ? 2.6 : 0, v.lights ? 1.2 + brake * 2 : brake * 2.2);
    hl.intensity += ((v.lights ? 120 : 0) - hl.intensity) * Math.min(1, dt * 10);
    if (hl.intensity > 0.5) {
      const f = v.toWorld(0, 0.75, v.M.L / 2 + 0.2);
      hl.position.copy(f);
      const t = v.toWorld(0, -0.4, v.M.L / 2 + 22);
      hl.target.position.copy(t);
      hl.target.updateMatrixWorld();
    }
  }
  // ---------------- engine sound ----------------
  startEngine() {
    const a = this.game.audio;
    if (!a.ok || !a.ok() || this.engine) return;
    const c = a.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), gn = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square';
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2;
    gn.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(gn); gn.connect(a.master);
    o1.start(); o2.start();
    this.engine = { o1, o2, f, gn };
  }
  stopEngine() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const t = this.game.audio.ctx.currentTime;
    e.gn.gain.setTargetAtTime(0, t, 0.15);
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.gn.disconnect(); } catch (err) { /* already stopped */ } }, 900);
  }
  engineSound(v, throttle) {
    if (!this.engine) { this.startEngine(); if (!this.engine) return; }
    const e = this.engine, c = this.game.audio.ctx, t = c.currentTime;
    const sp = Math.abs(v.speed), span = v.M.maxSpeed / 4;
    const gear = Math.min(3, Math.floor(sp / span));
    const rpm = v.fuel > 0 ? 0.22 + (sp - gear * span) / span * 0.6 + Math.max(0, throttle) * 0.15 : 0;
    const base = 30 + rpm * 85;
    e.o1.frequency.setTargetAtTime(base, t, 0.06);
    e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    e.f.frequency.setTargetAtTime(260 + rpm * 900, t, 0.08);
    e.gn.gain.setTargetAtTime(v.fuel > 0 ? 0.05 + Math.abs(throttle) * 0.05 : 0, t, 0.1);
    // tyres squeal when the tail slides
    if (v.slide > 3.2 && (!this.squealT || performance.now() > this.squealT)) { this.squealT = performance.now() + 140; this.game.audio.noise(0.16, 2400, 6, Math.min(0.18, v.slide * 0.03)); }
  }
  // ---------------- driving HUD ----------------
  hud(v) {
    let el = this.hudEl;
    if (!el) {
      el = this.hudEl = document.createElement('div');
      el.className = 'drive-hud';
      el.innerHTML = '<div class="dh-speed"><b id="dh-mph">0</b><span>mph</span></div><div class="dh-name" id="dh-name"></div><div class="dh-row"><span>Fuel</span><div class="dh-bar"><i id="dh-fuel"></i></div></div><div class="dh-row"><span>Body</span><div class="dh-bar"><i id="dh-body"></i></div></div><div class="dh-keys" id="dh-keys"></div>';
      document.getElementById('ui').appendChild(el);
    }
    const key = `${mph(v.speed)}|${Math.round(v.fuel * 100)}|${Math.round(v.health)}|${v.lights}|${v.trunk.weight().toFixed(0)}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    el.querySelector('#dh-mph').textContent = mph(v.speed);
    const load = v.trunk.weight();
    el.querySelector('#dh-name').textContent = v.M.name + (load > 0.5 ? ` · ${Math.round(load)}/${v.M.trunk} kg aboard` : '');
    const fuel = el.querySelector('#dh-fuel'); fuel.style.width = Math.round(v.fuel * 100) + '%'; fuel.className = v.fuel < 0.15 ? 'low' : '';
    const body = el.querySelector('#dh-body'); body.style.width = Math.round(100 * v.health / v.M.health) + '%'; body.className = v.health < v.M.health * 0.3 ? 'low' : '';
    el.querySelector('#dh-keys').textContent = isTouch ? '' : `E get out · F lights ${v.lights ? 'off' : 'on'} · Space handbrake · Q horn`;
  }
}

export function condWord(v) {
  const k = v.health / v.M.health;
  return k > 0.85 ? 'good' : k > 0.55 ? 'fair' : k > 0.25 ? 'poor' : 'awful';
}
