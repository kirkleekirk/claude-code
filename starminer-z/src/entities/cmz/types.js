// CastleMiner Z's table of the dead (AI.EnemyType.Init), and its rules for which of them come
// for you where (FindEnemy, GetZombie, GetAbovegroundEnemy, GetBelowgroundEnemy) and how each
// one is rolled when it's made (CreateInitPackage). Health is the original's own (a starter
// pistol round takes 0.3 of it), and so is everything else here.
//
// 0-17: zombies, slow and weak to fast and tough, further out. 18-25: skeleton archers, up on
// the surface at dusk. 26-49: skeletons in the caves, plain ones, swordsmen, then the axemen.
// (50 and 51, the Hell demon and the space aliens, aren't in this game.)

import { B } from '../../world/blocks.js';

// what a weapon's damage is (the original's damage-type flags), and what it does to each
export const DMG = { BLUNT: 1, PIERCING: 2, BLADE: 4, BULLET: 8, SHOTGUN: 16 };

// models (local-assets/models) and skins (their index in its list)
const MODELS = ['zombie', 'skeleton', 'skeleton_archer', 'skeleton_axes', 'skeleton_sword'];

function zombie(i, skin, hardest, dig) {
  const f = i / 16;
  return {
    id: i, kind: 'zombie', model: 'zombie', skin, foundIn: 0, hardest, dig,
    // the type's constructor sets the slow speed's spread to 0.5; Init sets the rest
    health: i === 17 ? 18 * 1.5 : i + 1,
    baseSlow: 0.5 + f * 1.5, randSlow: 0.5, baseFast: 6.5 + f * 1.5, baseRunActivation: 4 - f, fastJump: 13 + 3 * f,
    spawnRadius: 20, attackSpeed: 2, dieSpeed: 2, hitSpeed: 2, spawnSpeed: 3, hasRunFast: true, bulletStrike: 1,
  };
}

function skeleton(i, model, skin, foundIn, cls) {
  return {
    id: i, kind: cls === 3 ? 'archer' : 'skeleton', model: MODELS[model], skin, foundIn, skeletonClass: cls, hardest: 2, dig: 1,
    health: 1, baseSlow: 2, randSlow: 3.5, baseFast: 6, baseRunActivation: 1000, fastJump: 10,
    spawnRadius: cls === 3 ? 40 : 10, attackSpeed: 1, dieSpeed: 1, hitSpeed: 1, spawnSpeed: 1, hasRunFast: false, bulletStrike: 0.6,
  };
}

export const TYPES = [];
{
  const Z = [[0, 0, 2, 0.1], [1, 1, 2, 0.1], [2, 2, 2, 0.2], [3, 3, 2, 0.2], [4, 4, 2, 0.3], [5, 5, 2, 0.3], [6, 6, 2, 0.4], [7, 0, 2, 0.4],
    [8, 1, 3, 0.5], [9, 2, 3, 0.5], [10, 3, 3, 0.6], [11, 4, 3, 0.6], [12, 5, 3, 0.7], [13, 6, 3, 0.7], [14, 0, 3, 0.8], [15, 1, 3, 0.8],
    [16, 2, 3, 0.9], [17, 3, 3, 1.0]];
  for (const [i, skin, hardest, dig] of Z) TYPES[i] = zombie(i, skin, hardest, dig);
  // archers: model 2, skins 7..11, found above ground
  [7, 8, 9, 10, 11, 7, 8, 9].forEach((skin, k) => { TYPES[18 + k] = skeleton(18 + k, 2, skin, 0, 3); });
  // cave skeletons: [model, skin, class] (class 0 plain, 1 axes, 2 sword)
  const S = [[1, 7, 0], [1, 8, 0], [1, 9, 0], [1, 10, 0], [1, 11, 0], [4, 7, 2], [1, 8, 0], [4, 9, 2], [1, 10, 0], [4, 11, 2], [1, 7, 0], [4, 8, 2],
    [3, 9, 1], [4, 10, 2], [3, 11, 1], [4, 7, 2], [3, 8, 1], [4, 9, 2], [3, 10, 1], [4, 11, 2], [3, 7, 1], [3, 8, 1], [3, 9, 1], [3, 10, 1]];
  S.forEach(([model, skin, cls], k) => { TYPES[26 + k] = skeleton(26 + k, model, skin, 1, cls); });
  for (let k = 0; k < 8; k++) TYPES[18 + k].health = 1 + 2.5 * k;
  for (let k = 0; k < 24; k++) TYPES[26 + k].health = 1 + 0.9 * k;
}

// what a hit does to each kind: zombies shrug off blunt blows and some of a blade; skeletons
// let a lot of a piercing hit through, and the shotgun's spread breaks them up; a shot to the
// head counts for more
export function damageMultiplier(T, type, head) {
  let m = 1;
  if (T.kind === 'zombie') {
    if (type & DMG.BLUNT) m *= 0.5;
    else if (type & DMG.BLADE) m *= 0.75;
    if (head) m *= 2.5;
  } else {
    if (type & DMG.PIERCING) m *= 0.5;
    else if (type & DMG.SHOTGUN) m *= 1.5;
    else if (type & DMG.BLADE) m *= 0.75;
    if (head) m *= 2;
  }
  return m;
}

export const randomFloat = (a, b) => (b === undefined ? Math.random() * a : a + (b - a) * Math.random());
// .NET's Random.Next(min, max): max excluded
export const randomInt = (a, b) => a + Math.floor(Math.random() * (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

// Which of a run of types, by how far out: mostly the one for this distance, sometimes the one
// or two before it, each band `spread` metres wide.
export function findEnemy(spread, dist, first, last) {
  const range = last - first;
  const x = dist / spread;
  let i0 = Math.floor(x), i1 = i0 - 1, i2 = i1 - 1, w0, w1 = 0, w2 = 0;
  const fr = x - i0;
  if (i0 > range) { i0 = range; i1 = range - 1; i2 = range - 2; w0 = 1; w1 = 1; w2 = 0.5; }
  else {
    w0 = Math.sin((fr * Math.PI / 2) / 3);
    if (i1 >= 0) w1 = Math.sin(((1 + fr) * Math.PI / 2) / 3);
    if (i2 >= 0) w2 = Math.sin(((2 + fr) * Math.PI / 2) / 3);
  }
  const r = randomFloat(w0 + w1 + w2);
  return (r <= w0 ? i0 : r <= w0 + w1 ? i1 : i2) + first;
}

export const getZombie = (dist) => findEnemy(188.888885, dist, 0, 17);

// on the surface: archers in the half light (likelier the further from midnight), else the dead
export function getAbovegroundEnemy(midnight, dist) {
  if (Math.random() < Math.pow(1 - midnight, 4)) return findEnemy(425, dist, 18, 25);
  return getZombie(dist);
}

// underground: deeper counts as further out
export function getBelowgroundEnemy(depth, dist) {
  return findEnemy(141.666672, dist + (depth * 2 * 141.666672) / 50, 26, 49);
}

// One of a type, rolled: how slow it walks, how fast it runs once it gets going, how soon it
// does, and how fast it climbs out of the ground (quicker in the dead of night).
export function initPackage(T, midnight) {
  const p = { slow: randomFloat(T.baseSlow, T.baseSlow + T.randSlow), fast: 0, runActivation: 0, normalActivation: 0, emergeSpeed: T.spawnSpeed };
  if (T.hasRunFast) {
    p.fast = randomFloat(T.baseFast - 0.25, T.baseFast + 0.25);
    p.runActivation = lerp(T.baseRunActivation, T.baseRunActivation * 0.5, randomFloat(midnight));
    p.normalActivation = 45;
    if (midnight > 0.8) p.emergeSpeed = T.spawnSpeed;
    else if (T.spawnSpeed === 1) p.emergeSpeed = 1;
    else p.emergeSpeed = lerp(T.spawnSpeed / 2, T.spawnSpeed, Math.min(1, midnight * 2));
  }
  return p;
}

// The attacks: clip names, when in each the blow lands (seconds into the clip, which the original
// divides by the clip's speed), how much of the player's health it takes, and its reach.
export const ATTACKS = {
  zombie: {
    clips: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    times: [[0.8333], [0.8333, 1.466667], [0.7333], [0.9333], [1.5]],
    damage: [0.4, 0.3, 0.4, 0.4, 0.6],
    range: [1.6, 1.8, 1.6, 2.1, 2.1],
  },
  skeleton: {
    clips: ['attack1', 'attack2', 'attack1', 'attack2', 'attack3'],
    times: [[0.7], [0.9333], [0.7], [0.9333], [1.5667]],
    damage: [0.4, 0.4, 0.4, 0.4, 0.6],
    range: [1.6, 2.0, 1.6, 2.0, 2.1],
  },
  axes: {
    clips: ['attack1', 'attack2', 'attack1', 'attack2', 'attack1', 'attack2', 'attack3', 'axes_atack1', 'axes_atack2', 'axes_atack1', 'axes_atack2'],
    times: [[0.7], [0.9333], [0.7], [0.9333], [0.7], [0.9333], [1.5667], [0.2667, 0.5667, 0.933, 1.2667], [0.3333, 0.6667, 1.033, 1.3667],
      [0.2667, 0.5667, 0.933, 1.2667], [0.3333, 0.6667, 1.033, 1.3667]],
    damage: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.6, 0.2, 0.2, 0.2, 0.2],
    range: [1.6, 2.0, 1.6, 2.0, 1.6, 2.0, 2.1, 1.6, 1.6, 1.6, 1.6],
  },
};

export function attacksFor(T) {
  return T.kind === 'zombie' ? ATTACKS.zombie : T.skeletonClass === 1 ? ATTACKS.axes : ATTACKS.skeleton;
}

// What a block takes to break (the original's hardness): a zombie can only dig what's no harder
// than its type allows, and needs its swings, times its strength, to be more than this. The
// walls are 4: nothing that digs gets through them. (Glass isn't in the original; it goes as
// easily as a door. The start tower doesn't go at all.)
export const HARDNESS = new Uint8Array(256).fill(5);
for (const [ids, h] of [
  [[B.GRASS, B.DIRT, B.ICE, B.LOG, B.WOOD, B.LANTERN, B.CRATE], 2],
  [[B.SAND, B.SNOW, B.SNOW_GRASS, B.LEAVES, B.GLASS, B.TORCH, B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ, B.TNT, B.C4,
    B.DOOR_LOWER_X, B.DOOR_LOWER_Z, B.DOOR_UPPER_X, B.DOOR_UPPER_Z, B.DOOR_LOWER_OPEN_X, B.DOOR_LOWER_OPEN_Z, B.DOOR_UPPER_OPEN_X, B.DOOR_UPPER_OPEN_Z], 1],
  [[B.ROCK, B.COAL_ORE, B.COPPER_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.LAVA], 3],
  [[B.BLOODSTONE, B.COPPER_WALL, B.IRON_WALL, B.GOLD_WALL, B.DIAMOND_WALL, B.SLIME, B.SPACE_ROCK, B.SPACE_ROCK_BUILT], 4],
  [[B.BEDROCK, B.TOWER_STONE, B.FIXED_LANTERN], 5],
]) for (const id of ids) HARDNESS[id] = h;

// How much of an explosion's force a metre of each block lets through (the original's
// DamageTransmision; whatever isn't listed lets it all through).
export const DAMAGE_THROUGH = new Float32Array(256).fill(1);
for (const [ids, t] of [
  [[B.DIRT, B.GRASS, B.SNOW_GRASS, B.LOG, B.WOOD, B.DOOR_LOWER_X, B.DOOR_LOWER_Z, B.DOOR_UPPER_X, B.DOOR_UPPER_Z], 0.8],
  [[B.SAND], 0.7], [[B.ICE, B.GLASS], 0.9],
  [[B.ROCK, B.GOLD_ORE, B.IRON_ORE, B.COPPER_ORE, B.COAL_ORE], 0.5], [[B.DIAMOND_ORE], 0.4],
  [[B.BEDROCK, B.TOWER_STONE, B.IRON_WALL, B.COPPER_WALL, B.GOLD_WALL], 0.3], [[B.BLOODSTONE, B.DIAMOND_WALL], 0.2],
  [[B.SPACE_ROCK, B.SPACE_ROCK_BUILT], 0.1],
]) for (const id of ids) DAMAGE_THROUGH[id] = t;

// What stops an explosion's force outright on its way to you (the original's DragonType
// BreakLookup for its first kind of dragon, which the damage check borrows): bedrock and the
// rest no dragon breaks, and rock, ore, walls and lanterns.
export const BLAST_PROOF = new Uint8Array(256);
for (const id of [B.FIXED_LANTERN, B.BEDROCK, B.TOWER_STONE, B.BLOODSTONE, B.SPACE_ROCK, B.SPACE_ROCK_BUILT, B.SLIME, B.ROCK, B.LANTERN,
  B.GOLD_ORE, B.IRON_ORE, B.COPPER_ORE, B.COAL_ORE, B.DIAMOND_ORE, B.IRON_WALL, B.COPPER_WALL, B.GOLD_WALL, B.DIAMOND_WALL]) BLAST_PROOF[id] = 1;

// Which blocks turn a laser bolt back (BouncesLasers), and how much a grenade keeps of its speed
// off each (BounceRestitution; whatever isn't listed, 0.6).
export const BOUNCES_LASERS = new Uint8Array(256);
for (const id of [B.BEDROCK, B.TOWER_STONE, B.BLOODSTONE, B.DIAMOND_WALL]) BOUNCES_LASERS[id] = 1;
export const BOUNCE = new Float32Array(256).fill(0.6);
for (const [ids, r] of [
  [[B.DIRT, B.GRASS, B.SNOW_GRASS, B.SNOW, B.TNT, B.DOOR_LOWER_X, B.DOOR_LOWER_Z, B.DOOR_UPPER_X, B.DOOR_UPPER_Z, B.DOOR_LOWER_OPEN_X,
    B.DOOR_LOWER_OPEN_Z, B.DOOR_UPPER_OPEN_X, B.DOOR_UPPER_OPEN_Z], 0.4],
  [[B.SAND, B.LEAVES, B.SLIME, B.LAVA], 0.1],
]) for (const id of ids) BOUNCE[id] = r;
