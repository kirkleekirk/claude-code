// Match director: drop plane, day/night clock, hordes schedule, airdrops, the mid-match
// riverboat evac, the final helicopter, pacing and end-of-match results.
import * as THREE from 'three';
import { makePlane, makeBoat, makeHeli, makeParachuteCrate } from './vehicles.js';
import { DOCKS, LZS, WORLD } from '../world/layout.js';
import { RNG } from '../core/rng.js';
import { clamp, formatTime, lerp } from '../core/math.js';

export const PRESETS = {
  quick: { label: 'Quick', desc: '~25 min · 30 survivors', players: 30, duration: 25 * 60, dayLen: 12 * 60, hordeInterval: 150, hordeGrowth: 0.4, survivalScale: 1.7, heliAt: 5, boatAt: 0.45, lootMul: 1.25, botSkill: 0.85, initialHordes: 2, ambientMul: 1 },
  standard: { label: 'Standard', desc: '~1 hr · 50 survivors', players: 50, duration: 65 * 60, dayLen: 24 * 60, hordeInterval: 300, hordeGrowth: 0.17, survivalScale: 1.0, heliAt: 6, boatAt: 0.45, lootMul: 1, botSkill: 1, initialHordes: 3, ambientMul: 1 },
  marathon: { label: 'Marathon', desc: '2–3 hr · 60 survivors', players: 60, duration: 150 * 60, dayLen: 36 * 60, hordeInterval: 520, hordeGrowth: 0.075, survivalScale: 0.65, heliAt: 7, boatAt: 0.45, lootMul: 0.9, botSkill: 1.05, initialHordes: 3, ambientMul: 1.1 },
};

export class Match {
  constructor(G, presetKey = 'standard') {
    this.G = G;
    this.presetKey = PRESETS[presetKey] ? presetKey : 'standard';
    const P = (this.preset = PRESETS[this.presetKey]);
    this.rng = new RNG(G.seed + 7);
    this.elapsed = 0;
    this.phase = 'plane';
    this.survivalScale = P.survivalScale;
    this.hordeInterval = P.hordeInterval;
    this.hordeGrowth = P.hordeGrowth;
    this.lootMul = P.lootMul;
    this.botSkill = P.botSkill;
    this.ambientMul = P.ambientMul;
    this.speed = 1;
    this.boat = null; this.heli = null;
    this.boatState = 'none'; this.heliState = 'none';
    this.boatSeats = 3;
    this.airdrops = [];
    this.nextAirdrop = 0.18;
    this.result = null;
    this.events = [];
    this.group = new THREE.Group();
    this.group.name = 'match';
    G.scene.add(this.group);
    this.setupPlane();
  }
  get progress() { return clamp(this.elapsed / this.preset.duration, 0, 1.5); }
  get aliveCount() { return this.G.survivors.filter((s) => s.alive && !s.extracted).length; }
  get totalPlayers() { return this.G.survivors.length; }

  setupPlane() {
    const a = this.rng.range(0, Math.PI * 2);
    const cx = 2000 + this.rng.range(-500, 500), cz = 1500 + this.rng.range(-400, 400);
    const L = 2900;
    const from = new THREE.Vector3(cx - Math.cos(a) * L, 520, cz - Math.sin(a) * L);
    const to = new THREE.Vector3(cx + Math.cos(a) * L, 520, cz + Math.sin(a) * L);
    const mesh = makePlane();
    mesh.lookAt(to.x - from.x + mesh.position.x, 0, to.z - from.z);
    this.group.add(mesh);
    const dir = to.clone().sub(from).normalize();
    this.plane = { from, to, pos: from.clone(), vel: dir.clone().multiplyScalar(58), t: 0, mesh, canJump: false, len: from.distanceTo(to) };
    mesh.position.copy(from);
    mesh.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  }
  planeOverLand(p) { return p.x > 150 && p.x < 3800 && p.z > 150 && p.z < 2850 && this.G.world.coastAt(p.x, p.z) > 0; }

  update(dt) {
    const G = this.G;
    if (this.phase !== 'ended') this.elapsed += dt * (this.phase === 'plane' ? 0.35 : 1);
    // clock: day length preset, start 7:30
    G.dayNight.hour = (7.5 + (this.elapsed / this.preset.dayLen) * 24) % 24;
    if (this.plane) this.updatePlane(dt);
    if (this.phase === 'live' || this.phase === 'final') this.updateLive(dt);
    this.updateBoat(dt);
    this.updateHeli(dt);
    this.updateAirdrops(dt);
  }
  updatePlane(dt) {
    const pl = this.plane, G = this.G;
    pl.t = Math.min(1, pl.t + (58 * dt) / pl.len);
    pl.pos.lerpVectors(pl.from, pl.to, pl.t);
    pl.mesh.position.copy(pl.pos);
    for (const p of pl.mesh.props) p.rotation.z += dt * 40;
    pl.canJump = this.planeOverLand(pl.pos) || pl.t > 0.2;
    G.audio?.loop('plane', pl.t < 1, 0.9, pl.pos);
    if (G.player.mode === 'plane' && pl.t >= 0.97) G.player.forceJump = true;
    if (G.player.mode === 'plane' && pl.t > 0.1) G.hud.setObjective(pl.canJump ? 'Press SPACE to jump' : 'Wait for land...');
    if (pl.t >= 1) {
      this.group.remove(pl.mesh);
      G.audio?.loop('plane', false);
      this.plane = null;
    }
    if (this.phase === 'plane' && G.player.mode !== 'plane') this.startLive();
  }
  startLive() {
    const G = this.G;
    this.phase = 'live';
    // initial hordes far from the player
    for (let i = 0; i < this.preset.initialHordes; i++) G.hordes.naturalSpawn();
    G.hordes.nextNatural = this.hordeInterval;
    G.hud.announce('SURVIVE. LOOT. EXTRACT.', 'yellow');
    G.hud.setObjective('Find weapons, food and water. Avoid the hordes.');
  }

  // ---------------- pacing ----------------
  paceFactor() {
    const total = this.totalPlayers;
    const target = clamp(Math.pow(1 - clamp(this.progress, 0, 1), 1.25), 0.05, 1);
    const actual = this.aliveCount / total;
    return clamp(1 + (actual - target) * 7, 0.25, 5);
  }

  updateLive(dt) {
    const G = this.G;
    const p = this.progress;
    // riverboat
    if (this.boatState === 'none' && p >= this.preset.boatAt) this.announceBoat();
    // helicopter
    const others = G.survivors.filter((s) => s !== G.player && s.alive && !s.extracted).length;
    if (this.heliState === 'none' && (this.aliveCount <= this.preset.heliAt || p >= 1.0) && p > 0.3) this.announceHeli();
    // auto-extract: helicopter is out and every other team is gone
    if ((this.heliState === 'inbound' || this.heliState === 'landed') && others === 0 && G.player.alive && !G.player.extracted) this.extractPlayer('heli', true);
    // airdrops
    if (p >= this.nextAirdrop && this.nextAirdrop < 0.95) { this.spawnAirdrop(); this.nextAirdrop += 0.2; }
    // the player died
    if (!G.player.alive && !this.result) { this.resultT = (this.resultT || 0) + dt; if (this.resultT > 3.5) this.finish('eliminated'); }
  }

  // ---------------- riverboat (mid-match extraction) ----------------
  announceBoat() {
    const G = this.G;
    const d = this.rng.pick(DOCKS);
    this.dock = d;
    this.boatState = 'inbound';
    this.boatT = 180;
    const mesh = makeBoat();
    this.group.add(mesh);
    const ca = Math.cos(d.rot), sa = Math.sin(d.rot);
    // approach from the sea, perpendicular-ish to the shore
    const dirOut = d.id === 'harbor' ? new THREE.Vector3(0, 0, -1) : d.id === 'gull' ? new THREE.Vector3(0.2, 0, 1).normalize() : new THREE.Vector3(1, 0, 0);
    this.boat = { mesh, dock: new THREE.Vector3(d.boatX, 0.6, d.boatZ), start: new THREE.Vector3(d.boatX, 0.6, d.boatZ).addScaledVector(dirOut, 700), aboard: [] };
    void ca; void sa;
    mesh.position.copy(this.boat.start);
    mesh.lookAt(this.boat.dock.x, 0.6, this.boat.dock.z);
    G.hud.announce(`THE MAGNOLIA IS COMING — ${d.name.toUpperCase()}`, 'yellow');
    G.hud.killfeedSystem(`Riverboat evac docking at ${d.name} in 3:00. Room for ${this.boatSeats}.`);
    G.audio?.play('announce', null, { vol: 0.8, bus: 'ui' });
  }
  updateBoat(dt) {
    const G = this.G, b = this.boat;
    if (!b) return;
    b.mesh.wheel.rotation.x -= dt * (this.boatState === 'docked' ? 0.4 : 2.5);
    if (this.boatState === 'inbound') {
      this.boatT -= dt;
      const k = clamp(1 - this.boatT / 180, 0, 1);
      const e = 1 - Math.pow(1 - k, 2.2);
      b.mesh.position.lerpVectors(b.start, b.dock, e);
      b.mesh.position.y = 0.6 + Math.sin(G.time * 0.8) * 0.15;
      if (this.boatT <= 0) {
        this.boatState = 'docked'; this.boatT = 240; this.hornT = 0;
        G.hud.announce('THE MAGNOLIA HAS DOCKED — BOARD NOW', 'yellow');
        G.hud.setObjective(`Board the riverboat at ${this.dock.name} (${this.boatSeats} seats left)`);
      }
    } else if (this.boatState === 'docked') {
      this.boatT -= dt;
      this.hornT -= dt;
      b.mesh.position.y = 0.6 + Math.sin(G.time * 0.8) * 0.12;
      if (this.hornT <= 0) { this.hornT = 30; G.audio?.play('boat_horn', b.mesh.position, { vol: 1 }); G.emitNoise(this.dock.x, this.dock.z, 600, null, 'horn', true); }
      // abstract bots may make it aboard
      if (this.rng.chance(dt * 0.016)) {
        const cand = G.survivors.filter((s) => s !== G.player && s.alive && !s.extracted && !s.physical && Math.hypot(s.pos.x - this.dock.x, s.pos.z - this.dock.z) < 1400);
        if (cand.length) this.board(this.rng.pick(cand), 'boat');
      }
      if (this.boatT <= 0 || this.boatSeats <= 0) this.departBoat();
    } else if (this.boatState === 'departing') {
      this.boatT += dt;
      b.mesh.position.lerpVectors(b.dock, b.start, clamp(this.boatT / 60, 0, 1) ** 1.6);
      if (this.boatT > 60) { this.group.remove(b.mesh); this.boat = null; this.boatState = 'gone'; }
    }
  }
  departBoat() {
    this.boatState = 'departing'; this.boatT = 0;
    this.G.audio?.play('boat_horn', this.boat.mesh.position, { vol: 1 });
    this.G.hud.announce('THE MAGNOLIA HAS LEFT', 'yellow');
    this.G.hud.setObjective('Survive until the evac helicopter arrives.');
  }
  board(s, how) {
    if (s.extracted || !s.alive) return;
    if (how === 'boat') { if (this.boatSeats <= 0) return; this.boatSeats--; }
    s.extracted = true;
    s.extractedBy = how;
    if (s.physical && s.character && s !== this.G.player) this.G.scene.remove(s.character.root);
    this.G.hud.killfeedSystem(`${s.name} escaped on the ${how === 'boat' ? 'riverboat' : 'helicopter'}`);
    if (s === this.G.player) this.extractPlayer(how);
    else if (how === 'boat') this.G.hud.setObjective(`Board the riverboat at ${this.dock.name} (${this.boatSeats} seats left)`);
  }

  // ---------------- helicopter (final extraction) ----------------
  announceHeli() {
    const G = this.G;
    // choose LZ: not inside hordes, prefer far from current hordes
    let best = null, bs = -1e9;
    for (const lz of LZS) {
      const z = G.hordes.zoneAt(lz.x, lz.z);
      const s = (z.edge > 0 ? z.edge : -500) + this.rng.range(0, 300);
      if (s > bs) { bs = s; best = lz; }
    }
    this.lz = best;
    this.heliState = 'inbound';
    this.heliT = 120;
    const mesh = makeHeli();
    this.group.add(mesh);
    const gy = G.world.heightAt(best.x, best.z);
    this.heli = { mesh, land: new THREE.Vector3(best.x, gy, best.z), start: new THREE.Vector3(best.x - 1800, gy + 260, best.z - 600) };
    mesh.position.copy(this.heli.start);
    this.phase = 'final';
    G.hordes.surge = 1;
    for (const h of G.hordes.list) { h.tx = best.x; h.tz = best.z; h.migrating = 40; }
    G.hud.announce(`EVAC HELICOPTER INBOUND — ${best.name.toUpperCase()}`, 'red');
    G.hud.killfeedSystem(`Final evac: helicopter landing at ${best.name} in 2:00. The dead are coming.`);
    G.hud.setObjective(`Reach the helicopter at ${best.name}`);
    G.audio?.play('announce', null, { vol: 0.9, bus: 'ui' });
  }
  updateHeli(dt) {
    const G = this.G, h = this.heli;
    if (!h) return;
    h.mesh.rotor.rotation.y += dt * 30;
    h.mesh.tailRotor.rotation.x += dt * 40;
    G.audio?.loop('heli', this.heliState !== 'gone', 1.0, h.mesh.position);
    if (this.heliState === 'inbound') {
      this.heliT -= dt;
      const k = clamp(1 - this.heliT / 120, 0, 1);
      const pos = new THREE.Vector3().lerpVectors(h.start, h.land, Math.min(1, k * 1.15));
      pos.y = lerp(h.start.y, h.land.y, Math.pow(k, 3));
      h.mesh.position.copy(pos);
      h.mesh.rotation.y = Math.atan2(h.land.x - h.start.x, h.land.z - h.start.z);
      h.mesh.rotation.x = 0.15 * (1 - k);
      if (Math.random() < dt * 8) G.fx.norm.emit(h.land.x + 3, h.land.y + 0.3, h.land.z, (Math.random() - 0.5) * 0.6, 2.5, (Math.random() - 0.5) * 0.6, 4, 1.2, 0.9, 0.15, 0.1, 0.6, -0.15, 0.2, 1.2);
      if (this.heliT <= 0) { this.heliState = 'landed'; this.heliT = 150; G.hud.announce('THE HELICOPTER HAS LANDED — GET TO THE CHOPPER', 'red'); G.emitNoise(h.land.x, h.land.z, 500, null, 'heli', true); }
    } else if (this.heliState === 'landed') {
      this.heliT -= dt;
      h.mesh.position.copy(h.land);
      if (Math.random() < dt * 10) G.fx.norm.emit(h.land.x + 3, h.land.y + 0.3, h.land.z, (Math.random() - 0.5) * 0.6, 2.5, (Math.random() - 0.5) * 0.6, 4, 1.2, 0.9, 0.15, 0.1, 0.6, -0.15, 0.2, 1.2);
      if (Math.random() < dt * 0.5) G.emitNoise(h.land.x, h.land.z, 400, null, 'heli', true);
      // abstract bots may reach it
      if (this.rng.chance(dt * 0.01)) {
        const cand = G.survivors.filter((s) => s !== G.player && s.alive && !s.extracted && !s.physical);
        if (cand.length) this.board(this.rng.pick(cand), 'heli');
      }
      if (this.heliT <= 0) this.departHeli();
    } else if (this.heliState === 'departing') {
      this.heliT += dt;
      h.mesh.position.y += dt * (8 + this.heliT * 2);
      h.mesh.position.x += dt * this.heliT * 3;
      if (this.heliT > 30) { this.group.remove(h.mesh); this.heliState = 'gone'; G.audio?.loop('heli', false); this.heli = null; }
    }
  }
  departHeli() {
    const G = this.G;
    this.heliState = 'departing'; this.heliT = 0;
    G.hud.announce('THE HELICOPTER IS LEAVING', 'red');
    // everyone still on the island is lost
    if (G.player.alive && !G.player.extracted) { setTimeout(() => { if (!this.result) this.finish('left'); }, 5000); }
    for (const s of G.survivors) if (s !== G.player && s.alive && !s.extracted) { s.health = 0; s.die(null, { type: 'left' }); }
  }
  extractionTarget(bot) {
    if (this.boatState === 'docked' && this.boatSeats > 0 && bot.gear > 0.2) {
      const d = Math.hypot(bot.pos.x - this.dock.x, bot.pos.z - this.dock.z);
      if (d < 700) return { x: this.dock.x, z: this.dock.z };
    }
    if (this.heliState === 'landed' || this.heliState === 'inbound') return { x: this.lz.x, z: this.lz.z };
    return null;
  }
  // called each frame by the game for the player and physical bots
  checkBoarding(s) {
    if (!s.alive || s.extracted) return null;
    if (this.boatState === 'docked' && this.boatSeats > 0 && Math.hypot(s.pos.x - this.dock.x, s.pos.z - this.dock.z) < 12) return 'boat';
    if (this.heliState === 'landed' && Math.hypot(s.pos.x - this.heli.land.x, s.pos.z - this.heli.land.z) < 9) return 'heli';
    return null;
  }
  extractPlayer(how, auto = false) {
    const G = this.G, P = G.player;
    if (!P.extracted) { P.extracted = true; P.extractedBy = how; }
    P.mode = 'extracted';
    P.cancelAction();
    if (P.character) P.character.root.visible = false;
    P.extractCam = how === 'boat' && this.boat ? this.boat.mesh.position : this.heli ? this.heli.mesh.position : P.pos.clone();
    G.audio?.play('extract', null, { vol: 0.9, bus: 'ui' });
    if (how === 'heli' && this.heliState === 'landed') this.departHeli();
    if (how === 'heli' && this.heliState === 'inbound') { this.heliState = 'landed'; this.heliT = 3; }
    if (how === 'boat' && this.boatState === 'docked' && this.boatSeats <= 0) this.departBoat();
    G.hud.announce(auto ? 'LAST SURVIVOR — EXTRACTED!' : 'EXTRACTED!', 'yellow');
    setTimeout(() => this.finish('extracted', how, auto), 4500);
  }

  // ---------------- airdrops ----------------
  spawnAirdrop() {
    const G = this.G;
    let x, z;
    for (let k = 0; k < 20; k++) {
      x = this.rng.range(500, 3500); z = this.rng.range(400, 2600);
      if (G.world.coastAt(x, z) > 60 && !G.hordes.inside(x, z)) break;
    }
    const mesh = makeParachuteCrate();
    const y = G.world.heightAt(x, z);
    mesh.position.set(x, y + 260, z);
    this.group.add(mesh);
    this.airdrops.push({ x, z, y, mesh, landed: false });
    G.hud.announce('SUPPLY DROP INCOMING', 'yellow');
    G.hud.killfeedSystem('A supply drop is falling — check your map.');
  }
  updateAirdrops(dt) {
    const G = this.G;
    for (const a of this.airdrops) {
      if (a.landed) continue;
      a.mesh.position.y -= dt * 7;
      a.mesh.rotation.y += dt * 0.3;
      if (a.mesh.position.y <= a.y + 0.5) {
        a.landed = true;
        this.group.remove(a.mesh);
        G.inter.crates.push({ x: a.x, y: a.y, z: a.z, rot: 0, opened: false, mesh: null, kind: 'airdrop' });
        const ch = G.view.chunkOf(a.x, a.z);
        if (ch.state === 'near') G.inter.makeCrateMesh(G.inter.crates[G.inter.crates.length - 1]);
        G.emitNoise(a.x, a.z, 250, null, 'airdrop', true);
      }
    }
  }

  // ---------------- end ----------------
  finish(outcome, how = null, auto = false) {
    if (this.result) return;
    const G = this.G, P = G.player;
    this.phase = 'ended';
    const placement = outcome === 'extracted' ? 1 : this.aliveCount + 1;
    const loot = outcome === 'extracted' ? P.lootValue() : 0;
    const mins = P.stats.timeAlive / 60;
    const shards = Math.round(40 + P.stats.kills * 30 + P.stats.zombieKills * 1.5 + mins * 3 + (outcome === 'extracted' ? 350 + loot : 0) + (outcome === 'left' ? 60 : 0));
    const xp = Math.round(120 + P.stats.kills * 80 + P.stats.zombieKills * 6 + mins * 25 + (outcome === 'extracted' ? 900 : 0) + P.stats.boarded * 10 + P.stats.searched * 4);
    this.result = { outcome, how, auto, placement, total: this.totalPlayers, kills: P.stats.kills, zombieKills: P.stats.zombieKills, time: P.stats.timeAlive, loot, shards, xp, damage: Math.round(P.stats.damage), built: P.stats.built, boarded: P.stats.boarded, killer: P.killedBy || null, preset: this.preset.label };
    G.onMatchEnd?.(this.result);
  }
  objectiveText() {
    if (this.phase === 'plane') return '';
    if (this.heliState === 'inbound') return `Helicopter lands at ${this.lz.name} in ${formatTime(this.heliT)}`;
    if (this.heliState === 'landed') return `Helicopter leaves ${this.lz.name} in ${formatTime(this.heliT)}`;
    if (this.boatState === 'inbound') return `Riverboat docks at ${this.dock.name} in ${formatTime(this.boatT)}`;
    if (this.boatState === 'docked') return `Riverboat leaves ${this.dock.name} in ${formatTime(this.boatT)} · ${this.boatSeats} seats`;
    return null;
  }
}
