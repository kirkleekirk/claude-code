// Everything that wants the player dead, and where it comes from: CastleMiner Z's EnemyManager,
// read from the original's code. Every frame:
//
//   on the surface   zombies climb out of the ground round you, sooner and sooner as night
//                    deepens (none at all near the start until late evening; far out the nights
//                    start earlier) and the further out you are (each day survived counts as
//                    another 120 m); at dusk some are skeleton archers. A lantern keeps them
//                    from climbing out by it. At most 17 at once.
//   new ground       every 40 m or so further out than you've been, by daylight, two to four
//                    of the dead come for you (and a first lot 20 seconds in)
//   in the dark      down in the caves (anywhere the sky doesn't reach), skeletons drop out of
//                    the roof somewhere near, unless it's lit there; deeper means tougher, and
//                    they come in waves, a minute on and a minute off. At most 8.
//   the witching     just after midnight every zombie runs
//   Hell's demon     deep and far enough out underground, once five minutes have gone by, the
//                    Felguard; once you've met one, one in ten of the dead anywhere may be one,
//                    five minutes or more apart
//   the crash sites  near space rock, the aliens: one every 10 to 20 seconds, every 3 to 7 once
//                    they're roused by noise (digging the rock, shooting inside the asteroid).
//                    At most 10.
//
// Which of the dead it is (how tough, how fast, how hard it digs) goes by distance, as in the
// original's table (../entities/cmz/types.js). 50 at most in all.

import * as THREE from 'three';
import { Enemy } from '../entities/enemy.js';
import { Ghost, GHOST_FLOATS } from '../net/remote.js';
import { TYPES, getZombie, findEnemy, initPackage, randomFloat, randomInt, FELGUARD, ALIEN } from '../entities/cmz/types.js';
import { zombieLook } from '../entities/avatar/zombie.js';
import { skeletonLook } from '../entities/avatar/skeleton.js';
import { buildAvatarGeometry } from '../entities/avatar/model.js';
import { SOLID, B, HEIGHT } from '../world/blocks.js';

// the original's y = 0 is our y = 64; Hell starts 40 below it
const GROUND = 64;
const HELL = GROUND - 40;
const MAX_TOTAL = 50, MAX_SURFACE = 5 + 12, MAX_CAVE = 8, MAX_ALIENS = 10;
// the Felguard's timer (EnemyManager._spawnFelgardTimer), and its odds once met
const FELGUARD_WAIT = 5 * 60, FELGUARD_CHANCE = 0.1;
// how far round the player space rock is looked for (three of the aliens' spawn radius)
const ROCK_REACH = 30;

const lerp = (a, b, t) => a + (b - a) * t;

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geos = new Map();
    this.arrows = [];
    this.tSurface = 0;
    this.tCave = 0;
    this.localSurface = 0;
    this.localCave = 0;
    this.zombieFest = false;
    this.frenzyT = -1;
    this.cleared = 50;
    this.firstContact = 20;
    this.leftToSpawn = 0;
    this.nextT = 0;
    // online: each one numbered, so the other machines can tell them apart; and theirs, as
    // they show here ("owner:number" -> Ghost)
    this.nextId = 0;
    this.ghosts = new Map();
    // the Felguard: the wait till the next can come, and whether one's been met
    this.felguardT = FELGUARD_WAIT;
    this.felguardMet = false;
    // the aliens: how much noise there's been (0-20), whether it's roused them, the wait till
    // the next, and what the last look round for space rock found
    this.localAliens = 0;
    this.sound = 0;
    this.aroused = false;
    this.tAlien = 0;
    this.nextAlien = randomFloat(10, 20);
    this.rock = { near: false, inside: false, closest: Infinity, wait: 0, scan: null };
  }

  // ---- the clock and the distance -------------------------------------------------------------

  // how far out the game counts you: from the start, plus 120 m for every day survived
  playerDistance() {
    const g = this.game, p = g.player.pos;
    return Math.hypot(p.x, p.z) + (g.mode === 'endurance' ? (g.cmzDay - 0.41) * 120 : 0);
  }

  // 0 at noon to 1 at the dead of night (the original's terrain PercentMidnight, peaking a little
  // before one in the morning)
  percentMidnight() {
    let m = ((this.game.app.sky.time + 0.96 + 0.5) % 1) * 2;
    if (m > 1) m = 2 - m;
    return m;
  }

  // How much of the night's dead come: near the start only the depth of the night counts; by
  // 5000 m out all of it does. Hell is always night.
  midnight(dist, y) {
    if (y < HELL) return 0.85;
    if (this.zombieFest) return 1;
    let m = this.percentMidnight();
    const k = (1 - Math.min(dist / 5000, 1)) * 0.5;
    m = Math.max(0, m - k) / (1 - k);
    return Math.min(0.79, Math.max(0, m));
  }

  // the shortest wait between them, by distance (the original's Endurance numbers)
  minSpawnTime(dist) { return lerp(5, 1, dist / 3450); }

  // ---- making them ------------------------------------------------------------------------------

  // the stand-in bodies (no ripped models) share a built mesh per look
  shared(look) {
    let s = this.geos.get(look);
    if (!s) { s = { geo: buildAvatarGeometry(look) }; this.geos.set(look, s); }
    return s;
  }

  // without the original's bodies: the look one of this type wears on the avatar rig
  standFor(T) {
    if (this.game.app.cmzBodies) return null;
    const key = T.kind === 'zombie' ? `z${T.skin}` : T.kind === 'felguard' || T.kind === 'alien' ? T.kind : 's';
    if (!this.looks) this.looks = new Map();
    let look = this.looks.get(key);
    if (!look) {
      if (T.kind === 'zombie') look = zombieLook(1 + T.skin);
      // the Felguard: one of the dead, burnt red; the aliens: grey-green, with glowing green eyes
      else if (T.kind === 'felguard') look = { ...zombieLook(3), skin: 0x8a2218 };
      else if (T.kind === 'alien') { const b = skeletonLook(2); look = { ...b, skin: 0x8fa894, face: { ...b.face, iris: 0x60ff70 } }; }
      else look = skeletonLook(1);
      this.looks.set(key, look);
    }
    return { look, shared: this.shared(look) };
  }

  spawn(type, x, y, z, midnight = 0) {
    const g = this.game, T = TYPES[type];
    // (HandleSpawnEnemyMessage: a Felguard starts its timer again; an alien's an encounter)
    if (type === FELGUARD) this.felguardT = FELGUARD_WAIT;
    if (type === ALIEN && g.mode === 'endurance') g.stats.alienEncounters = (g.stats.alienEncounters || 0) + 1;
    const e = new Enemy(g, type, x, y, z, initPackage(T, midnight), this.standFor(T));
    // (kept within what a 32-bit float holds exactly)
    e.nid = this.nextId = (this.nextId % 16000000) + 1;
    g.scene.add(e.root);
    this.list.push(e);
    return e;
  }

  // ---- other players' dead (online) ------------------------------------------------------------

  // A snapshot of the dead one machine runs (see enemySnapshot): whatever's new appears, what's
  // missing is gone.
  ghostsFrom(owner, f, now) {
    const seen = new Set();
    for (let o = 0; o + GHOST_FLOATS <= f.length; o += GHOST_FLOATS) {
      const nid = f[o], type = f[o + 1];
      if (!TYPES[type]) continue;
      const key = `${owner}:${nid}`;
      let gh = this.ghosts.get(key);
      if (!gh) { gh = new Ghost(this.game, owner, nid, type, this.standFor(TYPES[type])); this.ghosts.set(key, gh); }
      gh.receive(f, o, now);
      seen.add(key);
    }
    for (const [key, gh] of this.ghosts) if (gh.owner === owner && !seen.has(key)) { gh.dispose(); this.ghosts.delete(key); }
  }

  dropGhosts(owner) {
    for (const [key, gh] of this.ghosts) if (owner == null || gh.owner === owner) { gh.dispose(); this.ghosts.delete(key); }
  }

  // ours and theirs
  *bodies() {
    yield* this.list;
    yield* this.ghosts.values();
  }

  // ---- every frame ----------------------------------------------------------------------------

  update(dt, active) {
    if (this.ghosts.size) { const now = performance.now(); for (const gh of this.ghosts.values()) gh.update(dt, now); }
    if (!active) return;
    const g = this.game, p = g.player;
    this.felguardT -= dt;
    this.addSound(-2 * dt);
    if (this.list.length < MAX_TOTAL && !p.dead) this.spawning(dt);
    for (const e of this.list) e.update(dt);
    this.updateArrows(dt);
    // the dead in your way slow you down (the original's AttentuateVelocity)
    p.crowd = this.attenuate(p);
    // let go of what's gone
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      if (!e.gone) continue;
      // (by where it was counted when it came: the original takes a Felguard that came up on
      // the surface off the caves' count, which would leave the surface a place short for good)
      if (e.slot === 'surface') this.localSurface--; else if (e.slot === 'cave') this.localCave--; else if (e.slot === 'alien') this.localAliens--;
      e.dispose();
      L.splice(i, 1);
    }
  }

  spawning(dt) {
    const g = this.game, p = g.player, w = g.world, pos = p.pos;
    this.tSurface += dt;
    this.tCave += dt;
    const loaded = w.isLoaded(pos.x, pos.z);
    const sun = loaded ? w.lightAt(pos.x, pos.y + 1, pos.z).sky / 15 : -1;
    const flat = Math.hypot(pos.x, pos.z);

    // the witching hour: a few seconds into the dead of night, every zombie runs
    if (this.percentMidnight() > 0.9) {
      if (!this.zombieFest) {
        if (this.frenzyT === -1) this.frenzyT = 3;
        else if (this.frenzyT > 0) {
          this.frenzyT -= dt;
          if (this.frenzyT < 0) { this.frenzyT = -1; this.zombieFest = true; }
        }
      }
    } else this.zombieFest = false;

    // new ground (Endurance): every 40 m or so further out than you've been
    if (flat > this.cleared) {
      this.firstContact = -1;
      if (sun > 0.01) {
        if (!this.leftToSpawn) this.nextT = randomFloat(2);
        this.leftToSpawn += randomInt(2, 5);
      }
      const b = Math.floor(1.5 + flat / 40) * 40;
      this.cleared = randomFloat(b - 10, b + 10);
    }
    if (this.firstContact > 0) {
      this.firstContact -= dt;
      if (this.firstContact < 0) { this.nextT = randomFloat(2); this.leftToSpawn += randomInt(2, 5); }
    }
    if (this.leftToSpawn > 0) {
      this.nextT -= dt;
      if (this.nextT <= 0) {
        this.spawnRandomZombies(pos);
        if (this.leftToSpawn > 0) this.nextT += randomFloat(2, 5);
      }
    }

    if (this.localSurface < MAX_SURFACE) {
      this.tSurface += dt;
      this.spawnAboveground(pos);
    }
    // the crash sites: a look round for space rock every three seconds; near it, the aliens
    this.scanForRock(dt, pos);
    if (this.rock.near && this.localAliens < MAX_ALIENS) {
      this.tAlien += dt;
      this.spawnAlien(pos);
    }
    if (sun !== -1 && sun <= 0.4 && this.localCave < MAX_CAVE) {
      this.tCave += dt;
      this.spawnBelowground(pos, g.time);
    }
  }

  // somewhere round the player, where they're heading (five seconds ahead at this speed)
  around(pos, r) {
    const v = this.game.player.vel;
    return { x: pos.x + v.x * 5 + randomInt(-r, r + 1), y: pos.y + 1, z: pos.z + v.z * 5 + randomInt(-r, r + 1) };
  }

  // ---- which of them (EnemyType.GetZombie, GetAbovegroundEnemy, GetBelowgroundEnemy) ----------

  get felguardReady() { return this.felguardT <= 0; }

  // once a Felguard's been met, one in ten may be another, when its timer's run out
  zombieType(d) {
    if (this.felguardMet && this.felguardReady && Math.random() < FELGUARD_CHANCE) { this.felguardT = FELGUARD_WAIT; return FELGUARD; }
    return getZombie(d);
  }

  // on the surface: archers in the half light (likelier the further from midnight), else the dead
  abovegroundType(midnight, d) {
    if (Math.random() < Math.pow(1 - midnight, 4)) return findEnemy(425, d, 18, 25);
    return this.zombieType(d);
  }

  // underground: deeper counts as further out, and past the toughest skeletons' distance, with
  // its timer run out, the Felguard (the first time for sure, after that one time in ten)
  belowgroundType(depth, d) {
    const dist = d + (depth * 2 * 141.666672) / 50;
    if (this.felguardReady && (Math.random() < FELGUARD_CHANCE || !this.felguardMet)) {
      const t = findEnemy(141.666672, dist, 26, 50);
      if (t === FELGUARD) { this.felguardT = FELGUARD_WAIT; this.felguardMet = true; }
      return t;
    }
    return findEnemy(141.666672, dist, 26, 49);
  }

  spawnRandomZombies(pos) {
    const d = this.playerDistance();
    const m = this.midnight(d, pos.y);
    const type = this.zombieType(d);
    const at = this.around(pos, TYPES[type].spawnRadius);
    if (!this.game.world.isLoaded(at.x, at.z)) return;
    const s = this.topmostGround(at);
    this.leftToSpawn--;
    if (!s) return;
    this.spawn(type, s.x, s.y, s.z, m).slot = 'surface';
    this.localSurface++;
  }

  spawnAboveground(pos) {
    const g = this.game, w = g.world;
    const d = this.playerDistance();
    const m = this.midnight(d, pos.y);
    if (m <= 0.0001) { this.tSurface = 0; return; }
    const T = lerp(60, this.minSpawnTime(d), Math.pow(m, 0.25));
    if (this.tSurface <= T * (1 + Math.random() * 0.5)) return;
    const type = this.abovegroundType(m, d);
    const at = this.around(pos, TYPES[type].spawnRadius);
    if (!w.isLoaded(at.x, at.z)) return;
    const s = pos.y > HELL ? this.topmostGround(at) : this.safeStart(at);
    if (!s) return;
    // a lantern's light keeps them from coming up by it
    const L = w.lightAt(s.x, s.y + 0.5, s.z);
    if (L.block / 15 >= 0.4 && this.nearLantern(s.x, s.y + 0.5, s.z, 7.2)) return;
    this.tSurface = 0;
    this.spawn(type, s.x, s.y, s.z, m).slot = 'surface';
    this.localSurface++;
  }

  spawnBelowground(pos, time) {
    const w = this.game.world;
    // deeper, and in the minute-on, minute-off waves, they come quicker
    const depth = Math.floor(Math.min(50, Math.max(0, 20 - (pos.y - GROUND))));
    let f = depth / 50;
    const s = Math.sin(((time / 60) % 2) * Math.PI);
    f *= s > 0 ? Math.sqrt(s) : 0;
    const d = pos.y >= HELL ? this.playerDistance() : 3500;
    const T = lerp(60, this.minSpawnTime(d), f);
    if (this.tCave <= T * (1 + Math.random() * 0.5)) return;
    const type = this.belowgroundType(depth, d);
    const r = TYPES[type].spawnRadius;
    const off = () => { const o = randomInt(-r, r); return o <= 0 ? o - 5 : o + 5; };
    const at = { x: pos.x + off(), y: pos.y + 1, z: pos.z + off() };
    if (!w.isLoaded(at.x, at.z)) return;
    const c = this.closestCeiling(at);
    if (!c) return;
    // not where it's lit
    const L = w.lightAt(c.x, c.y - 1, c.z);
    if (L.sky / 15 > 0.4 || L.block / 15 > 0.4) return;
    this.tCave = 0;
    // in the roof: it drops out of it
    this.spawn(type, c.x, c.y, c.z, 0).slot = 'cave';
    this.localCave++;
  }

  // ---- the aliens (EnemyManager.SpawnAlien, SearchForSpaceRock, AddToSoundLevel) ---------------

  // Noise near the crash sites: over 20 it rouses the aliens; it dies away at 2 a second, and
  // once it's all gone they settle (unless you're inside the asteroid).
  addSound(v) {
    this.sound += v;
    if (this.sound > 20) {
      this.sound = 20;
      if (!this.aroused) { this.aroused = true; this.nextAlien = randomFloat(3, 7); }
    } else if (this.sound < 0) {
      this.sound = 0;
      if (!this.rock.inside && this.aroused) { this.aroused = false; this.nextAlien = randomFloat(10, 20); }
    }
  }

  // a block dug (out: it came out; else a swing at it, with something in hand), or a shot fired
  noise(kind, id, tool) {
    if (kind === 'dug' && id === B.SPACE_ROCK) this.addSound(10);
    else if (kind === 'swing' && id === B.SPACE_ROCK && tool) this.addSound(1);
    else if (kind === 'shot' && this.rock.inside) this.addSound(5);
  }

  // Every three seconds, a look through the blocks within 30 of the player for the crash
  // sites' space rock (not what players have put down): whether there's any, how near, and
  // whether the player's inside an asteroid. (The original does it as a background task; this
  // goes through a slice of the columns each frame.)
  scanForRock(dt, pos) {
    const R = this.rock, w = this.game.world;
    if (!R.scan) {
      R.wait -= dt;
      if (R.wait > 0) return;
      R.scan = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), px: pos.x, py: pos.y, pz: pos.z, i: 0, found: false, best: Infinity };
    }
    const S = R.scan, side = 2 * ROCK_REACH + 1;
    const y0 = Math.max(0, S.y - ROCK_REACH), y1 = Math.min(HEIGHT - 1, S.y + ROCK_REACH);
    for (let n = 0; n < 64 && S.i < side * side; n++, S.i++) {
      const x = S.x - ROCK_REACH + (S.i % side), z = S.z - ROCK_REACH + Math.floor(S.i / side);
      if (!w.isLoaded(x, z)) continue;
      for (let y = y0; y <= y1; y++) {
        if (w.getBlock(x, y, z) !== B.SPACE_ROCK) continue;
        S.found = true;
        const d = Math.hypot(x + 0.5 - S.px, y + 0.5 - S.py, z + 0.5 - S.pz);
        if (d < S.best) S.best = d;
      }
    }
    if (S.i < side * side) return;
    R.near = S.found;
    if (S.found) R.closest = S.best;
    R.inside = S.found && this.inAsteroid(S.px, S.py, S.pz);
    R.scan = null;
    R.wait = 3;
  }

  // PointIsInAsteroid: not out under the sky, with space rock somewhere above and below
  inAsteroid(px, py, pz) {
    const w = this.game.world, x = Math.floor(px), z = Math.floor(pz), y0 = Math.floor(py);
    let roof = false, under = false;
    for (let y = y0 + 1; y < HEIGHT && !roof; y++) if (w.getBlock(x, y, z) === B.SPACE_ROCK) roof = true;
    if (!roof) return false;
    for (let y = y0; y >= 0 && !under; y--) if (w.getBlock(x, y, z) === B.SPACE_ROCK) under = true;
    return under;
  }

  spawnAlien(pos) {
    if (this.tAlien <= this.nextAlien) return;
    const w = this.game.world, R = this.rock, r = TYPES[ALIEN].spawnRadius;
    let at = null;
    if (this.aroused && w.isLoaded(pos.x, pos.z)) at = this.nearbySpot(pos, r * 2);
    else {
      // somewhere round the player: 5 to 30 out (inside the asteroid, 1 to 10)
      const k = R.inside ? r : r * 3, min = R.inside ? 1 : 5;
      const off = () => { const o = randomInt(-k, k); return o > 0 ? o + min : o - min; };
      const p = { x: pos.x + off(), y: pos.y + 1, z: pos.z + off() };
      if (w.isLoaded(p.x, p.z)) at = this.alienSpot(p, R.closest > r);
    }
    if (!at) return;
    // standing on space rock, or well away from it
    const bx = Math.floor(at.x), by = Math.floor(at.y), bz = Math.floor(at.z);
    let below = w.getBlock(bx, by - 1, bz);
    if (!SOLID[below]) below = w.getBlock(bx, by - 2, bz);
    if (below !== B.SPACE_ROCK && R.closest <= r * 2) return;
    this.tAlien = 0;
    this.nextAlien = this.aroused ? randomFloat(3, 7) : randomFloat(10, 20);
    this.spawn(ALIEN, at.x, at.y + 0.5, at.z, 0).slot = 'alien';
    this.localAliens++;
  }

  // FindAlienSpawnPoint: down the column, a top of space rock with room above it to stand: far
  // from the rock, the first from the top (the asteroid's face); near it, the one nearest the
  // player's height (in its caves)
  alienSpot(p, far) {
    const w = this.game.world, x = Math.floor(p.x), z = Math.floor(p.z), py = Math.floor(p.y);
    let found = far, best = -1, bestDiff = Infinity, low = 1, air = 0;
    for (let y = HEIGHT - 1; y >= low; y--) {
      const id = w.getBlock(x, y, z);
      if (!found) { if (id === B.SPACE_ROCK) found = true; air = 0; continue; }
      if (id === B.SPACE_ROCK) {
        if (air > 1) {
          if (far) { best = y; break; }
          const d = Math.abs(y - py);
          if (d > bestDiff) { if (best !== -1) break; } else { bestDiff = d; best = y; low = py - d; }
        }
        air = 0;
      } else if (!SOLID[id]) air++;
      else air = 0;
    }
    return best < 0 ? null : { x: x + 0.5, y: best + 1.1, z: z + 0.5 };
  }

  // FindNearbySpawnPoint: a few steps' walk from the player over ground a body could step along
  // (a block up or down at a time), never straight back the way it came
  nearbySpot(pos, steps) {
    const w = this.game.world;
    let x = Math.floor(pos.x), z = Math.floor(pos.z), y = Math.floor(pos.y), back = -1;
    const stand = (sx, sy, sz) => SOLID[w.getBlock(sx, sy - 1, sz)] && !SOLID[w.getBlock(sx, sy, sz)] && !SOLID[w.getBlock(sx, sy + 1, sz)];
    const DIRS = [[-1, 0], [0, -1], [1, 0], [0, 1]];
    for (let k = 0; k < steps; k++) {
      let moved = false;
      for (let t = 0, d = randomInt(0, 4); t < 4 && !moved; t++, d = (d + 1) % 4) {
        if (d === back) continue;
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        for (const ny of [y, y + 1, y - 1]) if (stand(nx, ny, nz)) { x = nx; z = nz; y = ny; back = (d + 2) % 4; moved = true; break; }
      }
      if (!moved) return null;
    }
    return { x: x + 0.5, y: y + 0.1, z: z + 0.5 };
  }

  // ---- places (the original's BlockTerrain.Find*) ----------------------------------------------

  // on top of the highest solid block in the column
  topmostGround(at) {
    const w = this.game.world;
    const x = Math.floor(at.x), z = Math.floor(at.z);
    for (let y = HEIGHT - 1; y > 0; y--) if (SOLID[w.getBlock(x, y, z)]) return { x: x + 0.5, y: y + 1.1, z: z + 0.5 };
    return null;
  }

  // in Hell: the nearest place in the column with room to stand, above or below
  safeStart(at) {
    const w = this.game.world;
    const x = Math.floor(at.x), z = Math.floor(at.z), y0 = Math.max(1, Math.min(HEIGHT - 3, Math.floor(at.y)));
    const ok = (y) => SOLID[w.getBlock(x, y - 1, z)] && !SOLID[w.getBlock(x, y, z)] && !SOLID[w.getBlock(x, y + 1, z)];
    for (let k = 0; k < 64; k++) {
      if (ok(y0 + k)) return { x: x + 0.5, y: y0 + k + 0.1, z: z + 0.5 };
      if (y0 - k > 1 && ok(y0 - k)) return { x: x + 0.5, y: y0 - k + 0.1, z: z + 0.5 };
    }
    return null;
  }

  // the first solid block above a gap: up through any solid it starts in, then to the next roof
  closestCeiling(at) {
    const w = this.game.world;
    const x = Math.floor(at.x), z = Math.floor(at.z);
    let y = Math.max(0, Math.min(HEIGHT - 1, Math.floor(at.y)));
    while (y < HEIGHT && SOLID[w.getBlock(x, y, z)]) y++;
    for (; y < HEIGHT; y++) if (SOLID[w.getBlock(x, y, z)]) return { x: x + 0.5, y: y + 0.1, z: z + 0.5 };
    return null;
  }

  nearLantern(x, y, z, r) {
    const w = this.game.world, r2 = r * r;
    for (let dy = -7; dy <= 7; dy++) for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) {
      if (w.getBlock(x + dx, y + dy, z + dz) !== B.LANTERN) continue;
      const bx = Math.floor(x + dx) + 0.5 - x, by = Math.floor(y + dy) + 0.5 - y, bz = Math.floor(z + dz) + 0.5 - z;
      if (bx * bx + by * by + bz * bz <= r2) return true;
    }
    return false;
  }

  // ---- the player among them ---------------------------------------------------------------------

  // Pushing into the dead slows you: each within 2 m halves your speed, and walking straight into
  // one all but stops you.
  attenuate(p) {
    let k = 1;
    const vx = p.vel.x, vz = p.vel.z, vl = Math.hypot(vx, vz);
    for (const e of this.bodies()) {
      if (!e.blocking) continue;
      const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y, dz = e.pos.z - p.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= 4 || Math.abs(dy) >= 1.5) continue;
      let f = 0.5;
      if (d2 > 0.0001 && vl > 1e-4) {
        const d = Math.sqrt(d2);
        const dot = (dx * vx + dz * vz) / (d * vl);
        if (dot > 0) f *= Math.min(1, 2 * (1 - dot));
      }
      k *= f;
    }
    return k;
  }

  // ---- the archers' arrows ---------------------------------------------------------------------

  // Off at 25 m/s on an arc that drops onto the target, if one does; straight at it if not.
  // (Online it flies on every machine, from the same place the same way: remote, one of
  // another machine's archers shot it.)
  shootArrow(from, to, remote = false) {
    if (!remote) this.game.online?.arrow(from, to);
    const v = ballistic(from, to, 25, 10) || to.clone().sub(from).normalize().multiplyScalar(25);
    if (!this.arrowGeo) {
      this.arrowGeo = new THREE.BoxGeometry(0.035, 0.035, 0.7);
      this.arrowMat = new THREE.MeshBasicMaterial({ color: 0x3a2a1a });
    }
    const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    this.arrows.push({ pos: from.clone(), vel: v, t: 2, near: false, mesh });
  }

  updateArrows(dt) {
    const g = this.game, p = g.player, w = g.world;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.t -= dt;
      const from = a.pos.clone();
      a.vel.y -= 10 * dt;
      a.pos.addScaledVector(a.vel, dt);
      const seg = a.pos.clone().sub(from), len = seg.length();
      let done = a.t <= 0;
      if (len > 1e-6 && !done) {
        const dir = seg.divideScalar(len);
        const hitP = !p.dead ? rayBox(from, dir, len, p.pos.x - 0.35, p.pos.y, p.pos.z - 0.35, p.pos.x + 0.35, p.pos.y + p.height, p.pos.z + 0.35) : null;
        const hitW = w.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, len, (id) => SOLID[id] === 1);
        if (hitP != null && (!hitW || hitP < hitW.dist)) {
          p.hurt(0.35 * p.maxHealth, null, 'arrow');
          g.audio?.bulletHit?.(a.pos);
          done = true;
        } else if (hitW) {
          g.audio?.impact?.(hitW.id, from.clone().addScaledVector(dir, hitW.dist));
          done = true;
        }
      }
      // the whistle as it goes past
      if (!a.near && a.pos.distanceToSquared(p.pos) < 25) { a.near = true; g.audio?.play?.('arrow', a.pos); }
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
      if (done) { a.mesh.removeFromParent(); this.arrows.splice(i, 1); }
    }
  }

  // ---- for the rest of the game ----------------------------------------------------------------

  // The first body along a ray: { enemy, dist, y } or null. A bullet goes through a skeleton
  // four times in ten, unless it's a head shot (melee: always hits).
  raycast(o, d, maxDist, blockDist = Infinity, bullet = false) {
    const lim = Math.min(maxDist, blockDist);
    let best = null;
    for (const e of this.bodies()) {
      const dx = e.pos.x - o.x, dz = e.pos.z - o.z;
      if (dx * dx + dz * dz > (lim + 2) * (lim + 2)) continue;
      const h = e.intersect(o, d, lim);
      if (!h || (best && h.dist >= best.dist)) continue;
      if (bullet && e.T.bulletStrike < 1 && h.y - e.pos.y <= 1.5 && Math.random() > e.T.bulletStrike) continue;
      best = { enemy: e, dist: h.dist, y: h.y };
    }
    return best;
  }

  occupies(x, y, z) {
    for (const e of this.bodies()) if (e.occupies(x, y, z)) return true;
    return false;
  }

  clearNear(at, r) {
    for (const e of this.list) if (Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < r) e.gone = true;
  }

  get count() { return this.list.filter((e) => !e.dead).length; }

  dispose() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
    this.dropGhosts();
    for (const a of this.arrows) a.mesh.removeFromParent();
    this.arrows.length = 0;
    for (const s of this.geos.values()) s.geo.dispose();
    this.geos.clear();
    this.arrowGeo?.dispose();
    this.arrowMat?.dispose();
  }
}

// The launch velocity at `speed` that drops onto `to` under `g` (the lower arc), or null.
function ballistic(from, to, speed, g) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const x = Math.hypot(dx, dz);
  if (x < 1e-4) return null;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * x * x + 2 * dy * v2);
  if (disc < 0) return null;
  const a = Math.atan((v2 - Math.sqrt(disc)) / (g * x));
  return new THREE.Vector3((dx / x) * Math.cos(a) * speed, Math.sin(a) * speed, (dz / x) * Math.cos(a) * speed);
}

// distance along a ray to a box, or null
function rayBox(o, d, max, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = max;
  for (const [oa, da, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
    let a = (lo - oa) / da, b = (hi - oa) / da;
    if (a > b) { const s = a; a = b; b = s; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
