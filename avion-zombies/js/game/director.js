import { audio } from '../engine/audio.js';
import { rand, pick, chance, clamp } from '../util.js';

// Round flow: zombie counts, health curve, speed mix, special "swarm" rounds.
export function zombieCount(round) {
  if (round <= 4) return [6, 8, 13, 18][round - 1];
  let n = 24 + (round - 5) * 3.6;
  if (round >= 10) n += Math.pow(round - 9, 1.3) * 2.2;
  return Math.min(130, Math.floor(n));
}

export function zombieHealth(round) {
  if (round <= 9) return 150 + 100 * (round - 1);
  return Math.round(950 * Math.pow(1.1, round - 9));
}

function speedTier(round) {
  const r = Math.random();
  if (round <= 2) return 'walk';
  if (round === 3) return r < 0.3 ? 'run' : 'walk';
  if (round === 4) return r < 0.55 ? 'run' : 'walk';
  if (round < 8) return r < 0.8 ? 'run' : 'walk';
  if (round < 10) return r < 0.12 ? 'sprint' : r < 0.9 ? 'run' : 'walk';
  if (round < 15) return r < 0.5 ? 'sprint' : 'run';
  return r < 0.82 ? 'sprint' : 'run';
}

function zombieType(round) {
  const r = Math.random();
  if (round >= 12 && r < 0.07) return 'bloater';
  if (round >= 9 && r < 0.15) return 'emz';
  if (round >= 6 && r < 0.3) return 'exo';
  return 'walker';
}

export class Director {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.round = 0;
    this.state = 'idle';
    this.t = 0;
    this.toSpawn = 0;
    this.spawned = 0;
    this.killed = 0;
    this.spawnT = 0;
    this.swarm = false;
    this.nextSwarm = 5 + Math.floor(Math.random() * 2);
    this.queueBonus = 0;
    this.paused = false; // held while the Nightwarden fight runs
  }

  start() {
    this.reset();
    this.state = 'intro';
    this.t = 3.5;
  }

  get remaining() {
    return this.toSpawn - this.killed;
  }

  beginRound(n) {
    const game = this.game;
    this.round = n;
    this.swarm = n === this.nextSwarm;
    if (this.swarm) this.nextSwarm = n + 5 + Math.floor(Math.random() * 2);
    this.toSpawn = this.swarm ? Math.floor(zombieCount(n) * 0.75) + 6 : zombieCount(n);
    this.spawned = 0;
    this.killed = 0;
    this.health = zombieHealth(n);
    this.spawnDelay = Math.max(0.35, 2.0 * Math.pow(0.95, n - 1)) * (this.swarm ? 0.6 : 1);
    this.spawnT = this.swarm ? 2.5 : 1.0;
    this.state = 'active';
    game.powerups.dropsThisRound = 0;
    if (n > 1) game.weapons.frags = Math.min(4, game.weapons.frags + 2);
    game.world.sky.setRound(n);
    game.world.sky.fogBoostTarget = this.swarm ? 1 : 0;
    game.hud.roundStart(n, this.swarm);
    audio.play(this.swarm ? 'swarm_horn' : 'round_start', { bus: 'music', volume: 0.9 });
    if (this.swarm) {
      audio.announce('Warning. Exo swarm detected.');
      audio.loop('alarm', 'alarm', { volume: 0.25, bus: 'ambience' });
      setTimeout(() => audio.stopLoop('alarm', 1.5), 6000);
    }
    game.onRoundStart(n);
  }

  endRound() {
    const game = this.game;
    this.state = 'intermission';
    this.t = this.swarm ? 7 : 9.5;
    game.hud.roundEnd(this.round);
    audio.play('round_end', { bus: 'music', volume: 0.85 });
    if (this.swarm) {
      game.powerups.spawn('ammo', game.player.pos.clone().setY(game.player.pos.y + 1));
      game.world.sky.fogBoostTarget = 0;
    }
  }

  onRecycled() {
    this.spawned = Math.max(0, this.spawned - 1);
  }

  onKilled() {
    this.killed++;
  }

  // Zones where zombies may come from: the player's zone and open neighbours.
  activeZones() {
    const game = this.game;
    const zones = game.map.ZONES;
    const pz = game.player.zone;
    const set = new Set();
    if (pz < 0) {
      for (const z of zones) if (game.zoneOpen[z.id]) set.add(z.id);
      return set;
    }
    set.add(pz);
    for (const a of zones[pz].adjacent) {
      if (game.zoneOpen[a] && game.doorBetweenOpen(pz, a)) set.add(a);
    }
    return set;
  }

  pickSpawner() {
    const game = this.game;
    const zones = this.activeZones();
    const p = game.player.ch;
    const nav = game.world.nav;
    const cands = [];
    for (const sp of game.map.SPAWNERS) {
      if (!zones.has(sp.zone)) continue;
      const d = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (d < 7 || d > 55) continue;
      const i = nav.idx(sp.x, sp.z);
      const pd = i >= 0 ? nav.dist[nav.nearestWalkable(i, 3)] : 65535;
      if (pd >= 65535) continue;
      // prefer spawners that are close by path but not right on top of the player
      const w = 1 / (1 + Math.abs(pd / 10 - 18) / 8);
      cands.push([sp, w]);
    }
    if (!cands.length) return null;
    let total = cands.reduce((a, c) => a + c[1], 0);
    let r = Math.random() * total;
    for (const [sp, w] of cands) {
      r -= w;
      if (r <= 0) return sp;
    }
    return cands[cands.length - 1][0];
  }

  update(dt) {
    const game = this.game;
    if (this.state === 'idle' || game.over || this.paused) return;
    if (this.state === 'intro') {
      this.t -= dt;
      if (this.t <= 0) this.beginRound(1);
      return;
    }
    if (this.state === 'intermission') {
      this.t -= dt;
      if (this.t <= 0) this.beginRound(this.round + 1);
      return;
    }
    // active
    if (this.spawned < this.toSpawn) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && game.zombies.canSpawn()) {
        const sp = this.pickSpawner();
        if (sp) {
          const type = this.swarm ? 'exo' : zombieType(this.round);
          const tier = this.swarm ? (this.round < 8 ? 'run' : 'sprint') : speedTier(this.round);
          game.zombies.spawn(sp, { type, tier, health: this.health * (this.swarm ? 0.6 : 1) });
          this.spawned++;
          this.spawnT = this.spawnDelay * rand(0.7, 1.2);
        } else this.spawnT = 0.5;
      }
    }
    if (this.spawned >= this.toSpawn && game.zombies.aliveCount === 0 && this.killed >= this.toSpawn) this.endRound();
    // safety: if counts drift (recycles), close the round once nothing is left
    if (this.spawned >= this.toSpawn && game.zombies.aliveCount === 0 && this.killed < this.toSpawn) {
      this.killed = this.toSpawn;
    }
  }
}
