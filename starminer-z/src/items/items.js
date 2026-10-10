// Every item, as CastleMiner Z registers them (InventoryItem.Initalize, its later updates
// included: the bloodstone tier, the light machine guns, the laser guns and swords, the rocket
// launchers, grenades, TNT and C4, the crate, door, clock, locator and teleporter), with the
// original's own numbers, and its CookBook of recipes.
//
// The numbers, as the original keeps them:
//   enemyDamage   what a hit does to the dead (the weakest zombie has 1.0 of health, the toughest
//                 27), with its damageType
//   cooldown      seconds between one use and the next (for a gun, between shots)
//   uses          how many uses it lasts (the original's ItemSelfDamagePerUse is 1 / uses);
//                 0: it never wears out
//   stack         how many to a slot
// and a gun's: mag (ClipCapacity) and perReload (RoundsPerReload: a shotgun loads one shell at a
// time), reload seconds, auto, recoil in degrees, inaccuracy (how far a shot strays: forward plus
// up to this much of right and up), zoom (ShoulderMagnification), and its bullets' velocity
// (metres a second) and flightTime (seconds), falling at 10 m/s/s on the way.

import { B } from '../world/blocks.js';
import { DMG } from '../entities/cmz/types.js';

// { dmg, type } for a hit with an item (or bare hands)
export function weaponDamage(it) {
  if (!it) return { dmg: 0.025, type: DMG.BLUNT };
  return { dmg: it.enemyDamage ?? 0.1, type: it.damageType ?? DMG.BLUNT };
}

// The materials, in the original's order (ToolMaterialTypes), with CMZColors' colour for each,
// and what a tool of it wears out after (the original's ItemSelfDamagePerUse by material)
export const MATERIALS = ['wood', 'stone', 'copper', 'iron', 'gold', 'diamond', 'bloodstone'];
export const TIERS = {
  wood: { name: 'Wood', tier: 0, color: 0x8b4513, uses: 200 },
  stone: { name: 'Stone', tier: 1, color: 0xa9a9a9, uses: 400 },
  copper: { name: 'Copper', tier: 2, color: 0xb87333, uses: 800 },
  iron: { name: 'Iron', tier: 3, color: 0x808080, uses: 2000 },
  gold: { name: 'Gold', tier: 4, color: 0xffd700, uses: 3000 },
  diamond: { name: 'Diamond', tier: 5, color: 0x00ffff, uses: 4000 },
  bloodstone: { name: 'BloodStone', tier: 6, color: 0x8b0000, uses: 5000 },
};
// a laser's colour by material (CMZColors.GetLaserMaterialcColor)
export const LASER_COLORS = { copper: 0x00ff00, iron: 0xff0000, gold: 0xffff00, diamond: 0x0000ff };

export const ITEMS = {};
// the original's numbers for our items (InventoryItemIDs), and back
export const ORIGINAL_ID = {};
export const FROM_ORIGINAL = {};
const add = (orig, id, def) => {
  ITEMS[id] = { id, orig, stack: 64, cooldown: 0.3, enemyDamage: 0.1, damageType: DMG.BLUNT, uses: 0, desc: '', desc2: '', ...def };
  if (orig != null) { ORIGINAL_ID[id] = orig; FROM_ORIGINAL[orig] = id; }
  return ITEMS[id];
};

// ---- blocks (BlockInventoryItemClass: 64 to a stack, a tenth of a second to place) ----------------
const block = (orig, id, blk, name, desc, desc2, dmg, extra = {}) =>
  add(orig, id, { kind: 'block', block: blk, name, desc, desc2, enemyDamage: dmg, cooldown: 0.1, ...extra });
const RAW = 'This is a raw material that must be found';
block(1, 'dirt', B.DIRT, 'Dirt', 'Found on the surface', RAW, 0.01);
block(2, 'sand', B.SAND, 'Sand', 'Found on the surface', RAW, 0.01);
block(3, 'rock', B.ROCK, 'Rock', 'Commonly found underground', RAW, 0.1);
block(4, 'log', B.LOG, 'Log', 'Comes from trees', RAW, 0.075);
block(5, 'wood', B.WOOD, 'Wood', 'Made from logs', RAW, 0.075);
block(6, 'lantern', B.LANTERN, 'Lantern', 'Lights the world', 'More durable than a torch', 0.075);
block(7, 'bloodstone', B.BLOODSTONE, 'BloodStone', 'Found in hell', 'Bloodstone is very hard', 0.15);
block(8, 'space_rock_junk', B.SPACE_ROCK, 'Space Rock', 'Comes from space', 'Junk', 0.15);
block(107, 'space_rock', B.SPACE_ROCK_BUILT, 'Space Rock', 'Comes from space', 'Used to make alien tools and weapons', 0.15);
const WALL = ['Strong walls for building', 'Prevents some monsters from digging'];
block(9, 'iron_wall', B.IRON_WALL, 'Iron Wall', ...WALL, 0.1);
block(10, 'copper_wall', B.COPPER_WALL, 'Copper Wall', ...WALL, 0.1);
block(11, 'gold_wall', B.GOLD_WALL, 'Golden Wall', ...WALL, 0.1);
block(12, 'diamond_wall', B.DIAMOND_WALL, 'Diamond Wall', ...WALL, 0.1);
block(73, 'crate', B.CRATE, 'Crate', 'Used for storing items', '', 0.1);
block(74, 'snow', B.SNOW, 'Snow', 'Found on the surface', RAW, 0.01);
block(75, 'ice', B.ICE, 'Ice', 'Found on the surface', RAW, 0.01);
block(79, 'tnt', B.TNT, 'TNT', 'Used to blow up large areas', 'Only destroys certain materials', 0.1);
block(80, 'c4', B.C4, 'C4', 'Used to blow up large areas', 'Destroys everything', 0.1);
block(102, 'slime', B.SLIME, 'Space Goo', 'Space Goo', 'Used to make alien weapons', 0.075);
// (ItemBlockInventoryItemClass: blocks drawn as things, 0.025 a hit)
block(14, 'torch', B.TORCH, 'Torch', 'Use these to light your world', 'They also keep some monsters away', 0.025, { cooldown: 0.1 });
block(76, 'door', B.DOOR_LOWER_X, 'Door', 'Open or close to keep monsters out', '', 0.025, { door: true });
// this game's own
block(null, 'leaves', B.LEAVES, 'Leaves', 'Leafy block', '', 0.01);
block(null, 'glass', B.GLASS, 'Glass', 'See-through block', '', 0.01);

// ---- materials (ModelInventoryItemClass) -----------------------------------------------------------
const material = (orig, id, name, desc, desc2, extra = {}) => add(orig, id, { kind: 'material', name, desc, desc2, ...extra });
material(13, 'stick', 'Wood Stick', 'Use this to make various items', 'Such as a pickaxe or a torch', { enemyDamage: 0.05 });
material(15, 'coal', 'Coal', 'Used to craft items', RAW);
material(16, 'copper_ore', 'Copper Ore', 'Can be made into copper', RAW);
material(17, 'iron_ore', 'Iron Ore', 'Can be made into iron', RAW);
material(18, 'gold_ore', 'Gold Ore', 'Can be made into gold', RAW);
material(19, 'diamond', 'Diamond', 'Very hard substance', 'Used to make diamond tools');
material(20, 'iron', 'Iron', 'Used to craft items', 'Made from Iron ore');
material(21, 'copper', 'Copper', 'Used to craft items', 'Made from Copper ore');
material(22, 'gold', 'Gold', 'Used to craft items', 'Made from Gold ore');
material(106, 'gunpowder', 'Gun Powder', 'Used to craft ammunition', RAW);
material(108, 'explosive_powder', 'Explosive Powder', 'Used to craft explosives', 'Dropped by dragons and demons');
const casing = (orig, id, name) => material(orig, id, name, 'Used for making ammunition', '', { stack: 5000 });
casing(41, 'casing_brass', 'Brass Casing');
casing(42, 'casing_iron', 'Iron Casing');
casing(43, 'casing_gold', 'Gold Casing');
casing(111, 'casing_diamond', 'Diamond Casing');

// ---- ammo (5000 to a stack) ----------------------------------------------------------------
const ammo = (orig, id, name, desc) => add(orig, id, { kind: 'ammo', name, desc, stack: 5000 });
ammo(44, 'bullets', 'Bullets', 'Ammo for conventional weapons');
ammo(45, 'bullets_iron', 'Iron Bullets', 'Ammo for gold weapons');
ammo(46, 'bullets_gold', 'Gold Bullets', 'Ammo for diamond weapons');
ammo(47, 'bullets_diamond', 'Diamond Bullets', 'Ammo for bloodstone');
ammo(48, 'bullets_bloodstone', 'BloodStone Bullets', '');
ammo(109, 'bullets_laser', 'Laser Bullets', 'Ammo for laser weapons');
ammo(105, 'rockets', 'Rockets', 'Ammo for rocket launchers');

// ---- tools -----------------------------------------------------------------------------------
// picks, spades and axes: one hit's damage by material, as the original registers them
const PICK_DMG = { stone: 0.1, copper: 0.2, iron: 0.4, gold: 0.8, diamond: 1.6, bloodstone: 3.0 };
const SPADE_DMG = { stone: 0.1, copper: 0.2, iron: 0.4, gold: 0.8, diamond: 1.6 };
const AXE_DMG = { stone: 0.15, copper: 0.3, iron: 0.5, gold: 1.0, diamond: 2.0 };
const tool = (orig, id, kind, mat, dmg, type, name, desc, desc2) => add(orig, id, {
  kind: 'tool', tool: kind, mat, tier: TIERS[mat].tier, color: TIERS[mat].color, name, desc, desc2, stack: 1,
  enemyDamage: dmg, damageType: type, uses: TIERS[mat].uses,
});
[23, 24, 25, 26, 27, 28].forEach((orig, i) => {
  const m = MATERIALS[i + 1];
  tool(orig, `pick_${m}`, 'pick', m, PICK_DMG[m], DMG.BLADE, `${TIERS[m].name} PickAxe`, 'Used for breaking certain stones and ores', '');
});
[29, 30, 31, 32, 33].forEach((orig, i) => {
  const m = MATERIALS[i + 1];
  tool(orig, `spade_${m}`, 'spade', m, SPADE_DMG[m], DMG.BLUNT, `${TIERS[m].name} Spade`, 'Used for digging dirt and sand', 'Also removes C4 and TNT');
});
[34, 35, 36, 37, 38].forEach((orig, i) => {
  const m = MATERIALS[i + 1];
  tool(orig, `axe_${m}`, 'axe', m, AXE_DMG[m], DMG.BLADE, `${TIERS[m].name} Axe`, 'Used for chopping wood', 'Can also be used for basic melee defense');
});
// laser swords: a pick that cuts nearly anything, and a blade (200 uses whatever they're made of)
for (const [orig, m] of [[115, 'copper'], [114, 'iron'], [116, 'gold'], [117, 'diamond'], [118, 'bloodstone']]) {
  const it = tool(orig, m === 'iron' ? 'saber' : `saber_${m}`, 'pick', m, 8.0, DMG.BLADE, `${TIERS[m].name} Laser Sword`, 'Advanced melee and mining tool', '');
  it.laser = true;
  it.uses = 200;
  it.beam = LASER_COLORS[m] ?? 0xffffff;
}
add(39, 'compass', { kind: 'tool', tool: 'compass', name: 'Compass', stack: 1, desc: 'Show the direction to or away from the start point', desc2: 'In endurance mode travel in the direction of the green arrow' });
add(40, 'clock', { kind: 'tool', tool: 'clock', name: 'Clock', stack: 1, desc: 'Show the time of day' });
add(77, 'locator', { kind: 'tool', tool: 'locator', name: 'Locator', stack: 1, uses: 10, desc: 'Show the direction to a chosen location and GPS coordinates' });
add(78, 'teleporter', { kind: 'tool', tool: 'teleporter', name: 'Teleporter', stack: 1, uses: 1, desc: 'Show the direction to a chosen location and GPS coordinates', desc2: 'Use the item by pressing the left trigger to teleport to the chosen location' });

// ---- knives -------------------------------------------------------------------------------
for (const [orig, id, m, dmg, uses, cd] of [[49, 'knife', 'iron', 0.5, 50, 0.5], [55, 'knife_gold', 'gold', 1.0, 100, 0.4],
  [61, 'knife_diamond', 'diamond', 2.0, 200, 0.3], [67, 'knife_bloodstone', 'bloodstone', 4.0, 300, 0.25]]) {
  add(orig, id, { kind: 'melee', mat: m, tier: TIERS[m].tier, name: `${m === 'iron' ? '' : `${TIERS[m].name} `}Knife`, stack: 1, enemyDamage: dmg, damageType: DMG.BLADE, uses, cooldown: cd, rate: cd, desc: 'Basic Melee Defense' });
}

// ---- guns ---------------------------------------------------------------------------------
// each kind: its model and sounds, fire interval, clip, reload, recoil, inaccuracy, zoom,
// bullet speed and flight (the original's *InventoryItemClass constructors)
const GUNS = {
  pistol: { name: 'Pistol', desc: 'Basic semi automatic gun', interval: 0.1, auto: false, mag: 8, perReload: 8, reload: 1.63, recoil: 3, inaccuracy: 0.05, zoom: 1.2, velocity: 75, flightTime: 1.0, shot: 'GunShot4', reloadSound: 'Reload' },
  smg: { name: 'Sub Machine Gun', desc: 'High rate of fire', interval: 0.06403, auto: true, mag: 20, perReload: 20, reload: 2.0, recoil: 3, inaccuracy: 0.1, zoom: 1.1, velocity: 100, flightTime: 1.0, shot: 'GunShot2', reloadSound: 'Reload' },
  assault: { name: 'Assault Rifle', desc: 'High power full auto', interval: 0.1, auto: true, mag: 30, perReload: 30, reload: 3.0, recoil: 3, inaccuracy: 0.02, zoom: 2.0, velocity: 100, flightTime: 2.0, shot: 'GunShot3', reloadSound: 'AssaultReload' },
  shotgun: { name: 'Shotgun', desc: 'Short range burst fire', interval: 1.0, auto: false, mag: 6, perReload: 1, reload: 0.567, recoil: 10, inaccuracy: 0.1, zoom: 1.0, velocity: 50, flightTime: 0.4, pellets: 5, shot: 'Shotgun', reloadSound: 'ShotGunReload' },
  rifle: { name: 'Rifle', desc: 'High power very accurate', interval: 0.0031746, auto: false, mag: 8, perReload: 8, reload: 2.4, recoil: 12, inaccuracy: 0.0, zoom: 1.5, velocity: 150, flightTime: 2.0, shot: 'GunShot1', reloadSound: 'AssaultReload' },
  lmg: { name: 'Light Machine Gun', desc: 'Powerful with a large clip capacity', interval: 0.112, auto: true, mag: 100, perReload: 100, reload: 9.7, recoil: 3, inaccuracy: 0.1, zoom: 1.3, velocity: 100, flightTime: 1.0, shot: 'GunShot2', reloadSound: 'Reload' },
};
// by material: its prefix, a hit's damage for each kind, the bullets it takes, and how long it
// lasts (shots)
const GUN_MATS = {
  iron: { prefix: '', ammo: 'bullets', uses: 1000, dmg: { pistol: 0.3, smg: 0.3, assault: 0.5, shotgun: 0.3, rifle: 0.5, lmg: 0.5 }, use: 'Uses Bullets' },
  gold: { prefix: 'Gold ', ammo: 'bullets_iron', uses: 2198, dmg: { pistol: 1.0, smg: 1.0, assault: 2.5, shotgun: 1.0, rifle: 2.5, lmg: 2.5 }, use: 'Uses Iron Bullets' },
  diamond: { prefix: 'Diamond ', ammo: 'bullets_gold', uses: 4184, dmg: { pistol: 4.0, smg: 4.0, assault: 6.0, shotgun: 4.0, rifle: 6.0, lmg: 6.0 }, use: 'Uses Gold Bullets' },
  bloodstone: { prefix: 'BloodStone ', ammo: 'bullets_diamond', uses: 10000, dmg: { pistol: 8.0, smg: 8.0, assault: 12.0, shotgun: 8.0, rifle: 12.0, lmg: 12.0 }, use: 'Uses Diamond Bullets' },
};
const GUN_IDS = {
  pistol: [51, 57, 63, 69], smg: [54, 60, 66, 72], assault: [50, 56, 62, 68], shotgun: [52, 58, 64, 70], rifle: [53, 59, 65, 71], lmg: [119, 120, 121, 122],
};
const gunDef = (g, extra) => ({
  kind: 'gun', stack: 1, auto: g.auto, mag: g.mag, perReload: g.perReload, reload: g.reload, recoil: g.recoil, inaccuracy: g.inaccuracy,
  zoom: g.zoom, velocity: g.velocity, flightTime: g.flightTime, pellets: g.pellets ?? 1, cooldown: g.interval, rpm: 60 / g.interval,
  range: g.velocity * g.flightTime, shot: g.shot, reloadSound: g.reloadSound, ...extra,
});
for (const [gk, g] of Object.entries(GUNS)) {
  Object.entries(GUN_MATS).forEach(([mk, m], mi) => {
    const id = mk === 'iron' ? gk : `${gk}_${mk}`;
    add(GUN_IDS[gk][mi], id, gunDef(g, {
      gun: gk, mat: mk, tier: TIERS[mk].tier, name: `${m.prefix}${g.name}`, desc: g.desc, desc2: m.use, ammo: m.ammo, uses: m.uses,
      enemyDamage: m.dmg[gk], damageType: gk === 'shotgun' ? DMG.SHOTGUN : DMG.BULLET,
    }));
  });
}
// the laser guns: blaster bolts, in copper, iron, gold and diamond, all on Laser Bullets
const LASERS = {
  assault: { name: 'Laser Assault Rifle', desc: 'High power full auto', dmg: 15, interval: 0.06, auto: true, mag: 30, perReload: 30, reload: 2.5, inaccuracy: 0.02, zoom: 2.0, shot: 'LaserGun3', reloadSound: 'AssaultReload', ids: [87, 82, 92, 97] },
  smg: { name: 'Laser Sub Machine Gun', desc: 'High rate of fire', dmg: 10, interval: 0.06, auto: true, mag: 20, perReload: 20, reload: 2.05, inaccuracy: 0.1, zoom: 1.1, shot: 'LaserGun2', reloadSound: 'Reload', ids: [91, 86, 96, 101] },
  pistol: { name: 'Laser Pistol', desc: 'Basic semi automatic gun', dmg: 10, interval: 0.06, auto: false, mag: 7, perReload: 7, reload: 1.25, inaccuracy: 0.05, zoom: 1.2, shot: 'LaserGun4', reloadSound: 'Reload', ids: [88, 83, 93, 98] },
  rifle: { name: 'Laser Rifle', desc: 'High power very accurate', dmg: 15, interval: 0.26, auto: false, mag: 10, perReload: 10, reload: 2.95, inaccuracy: 0.0, zoom: 2.5, scoped: true, shot: 'LaserGun1', reloadSound: 'AssaultReload', ids: [90, 85, 95, 100] },
  shotgun: { name: 'Laser Shotgun', desc: 'Short range burst fire', dmg: 10, interval: 0.19, auto: false, mag: 8, perReload: 1, reload: 0.57, inaccuracy: 0.1, zoom: 1.0, pellets: 5, shot: 'LaserGun5', reloadSound: 'ShotGunReload', ids: [89, 84, 94, 99] },
};
for (const [gk, g] of Object.entries(LASERS)) {
  ['copper', 'iron', 'gold', 'diamond'].forEach((mk, mi) => {
    const id = mk === 'iron' ? `laser_${gk}` : `laser_${gk}_${mk}`;
    add(g.ids[mi], id, gunDef({ ...g, recoil: 3, velocity: 100, flightTime: 2.0 }, {
      gun: gk, laser: true, mat: mk, tier: TIERS[mk].tier, name: g.name, desc: g.desc, desc2: 'Uses Laser Bullets', ammo: 'bullets_laser',
      uses: 2000, enemyDamage: g.dmg, damageType: gk === 'shotgun' ? DMG.SHOTGUN : DMG.BULLET, color: LASER_COLORS[mk],
    }));
  });
}
// the rocket launchers: one rocket in them, and that's them done (the guided one locks on to a
// dragon before it fires)
const RPG = { name: '', interval: 1.0, auto: false, mag: 1, perReload: 1, reload: 0.567, recoil: 10, inaccuracy: 0.1, zoom: 1.0, velocity: 50, flightTime: 0.4, shot: 'RPGLaunch', reloadSound: 'ShotGunReload' };
add(103, 'rocket_launcher', gunDef(RPG, { gun: 'rocket', mat: 'bloodstone', name: 'Rocket Launcher', desc: 'Dumb fired projectile grenade', desc2: 'Uses Rockets', ammo: 'rockets', uses: 1, enemyDamage: 100, damageType: DMG.SHOTGUN, scoped: true }));
add(104, 'rocket_launcher_guided', gunDef({ ...RPG, zoom: 2.0 }, { gun: 'rocket', guided: true, mat: 'bloodstone', name: 'Anti Dragon Guided Missile', desc: 'Guided missile used for killing dragons', desc2: 'Uses Rockets', ammo: 'rockets', uses: 1, enemyDamage: 100, damageType: DMG.SHOTGUN, scoped: true }));
// grenades: ten to a stack, a second between throws
add(110, 'grenade', { kind: 'grenade', grenade: 'he', name: 'Grenade', desc: 'Blow up Zombies', stack: 10, cooldown: 1.0 });

// the original's InventoryItemIDs that are other things, or nothing: 0 bare hands, 81 a space
// knife never made, 112 and 113 spent launchers (unnamed)

// ---- what comes out of a block ---------------------------------------------------------------

// What a block gives when it's dug out with this tool in hand (the original's CreatesWhenDug):
// a pick gets ore out of its ore and walls back off the wall; grass gives dirt, lava's crust rock,
// a crash site's rock the space rock; anything else, the block itself if it's carried as one.
export function dropFor(block, tool = null) {
  if (tool?.tool === 'pick') {
    switch (block) {
      case B.GOLD_ORE: return 'gold_ore';
      case B.IRON_ORE: return 'iron_ore';
      case B.COPPER_ORE: return 'copper_ore';
      case B.COAL_ORE: return 'coal';
      case B.DIAMOND_ORE: return 'diamond';
      default:
    }
  }
  switch (block) {
    case B.GRASS: case B.SNOW_GRASS: return 'dirt';
    case B.LAVA: return 'rock';
    case B.SPACE_ROCK: return 'space_rock';
    case B.TORCH: case B.TORCH_PX: case B.TORCH_NX: case B.TORCH_PZ: case B.TORCH_NZ: return 'torch';
    case B.LEAVES: case B.GLASS: return null;
    default:
      if (block >= B.DOOR_LOWER_X && block <= B.DOOR_UPPER_OPEN_Z) return 'door';
      return BLOCK_ITEM.get(block) ?? null;
  }
}
const BLOCK_ITEM = new Map();
for (const it of Object.values(ITEMS)) if (it.kind === 'block' && !BLOCK_ITEM.has(it.block) && it.orig !== 8) BLOCK_ITEM.set(it.block, it.id);

// ---- how long digging takes --------------------------------------------------------------------

// The original's TimeToDig, for each block of ours (seconds; null: it can't be dug that way):
// bare hands (and anything that isn't a tool), and picks, spades and axes by material (stone,
// copper, iron, gold, diamond, bloodstone), and the laser swords, run out of its code.
const DIG = (() => {
  const T = {};
  const set = (blocks, row) => { for (const b of blocks) T[b] = row; };
  //                              hands  pick: st  cu   fe   au   di   bs | spade: st cu  fe   au   di   | axe: st cu fe   au   di | saber
  const row = (h, p, s, a, x) => ({ hands: h, pick: p, spade: s, axe: a, saber: x });
  const all = (v, n) => Array(n).fill(v);
  set([B.DIRT, B.GRASS, B.SNOW_GRASS], row(1.5, all(1.5, 6), [1, 0.5, 0.25, 0.1, 0], all(1.5, 5), 0.01));
  set([B.SAND], row(1, all(1, 6), [0.75, 0.5, 0.25, 0.1, 0], all(1, 5), 0.01));
  set([B.SNOW], row(1, all(1, 6), [0.75, 0.5, 0.25, 0.1, 0], all(1, 5), 0.01));
  set([B.LANTERN], row(2, all(2, 6), all(2, 5), all(2, 5), 2));
  set([B.ROCK], row(10, [2, 1.5, 0.5, 0.25, 0.1, 0.01], all(10, 5), all(10, 5), 0.01));
  set([B.GOLD_ORE], row(null, [null, null, 6, 3, 2, 1], all(null, 5), all(null, 5), 0.5));
  set([B.IRON_ORE], row(null, [9, 6, 3, 2, 1, 0.5], all(null, 5), all(null, 5), 0.5));
  set([B.COPPER_ORE], row(null, [6, 3, 1.5, 1, 0.5, 0.2], all(null, 5), all(null, 5), 0.2));
  set([B.COAL_ORE], row(null, [3, 1.5, 1, 0.5, 0.25, 0.1], all(null, 5), all(null, 5), 0.1));
  set([B.DIAMOND_ORE], row(null, [null, null, null, 5, 3, 1.5], all(null, 5), all(null, 5), 0.5));
  set([B.LAVA], row(0, all(0, 6), all(0, 5), all(0, 5), 0));
  set([B.ICE], row(5, [1, 0.75, 0.25, 0.1, 0.05, 0.01], all(5, 5), all(5, 5), 0.01));
  set([B.LOG], row(4, all(4, 6), all(4, 5), [2, 1, 0.5, 0.25, 0], 4));
  set([B.LEAVES], row(1, all(1, 6), all(1, 5), [0.5, 0.1, 0, 0, 0], 0.01));
  set([B.WOOD], row(3, all(3, 6), all(3, 5), [1, 0.5, 0.25, 0, 0], 0.01));
  set([B.BLOODSTONE], row(null, [null, null, null, null, 10, 3], all(null, 5), all(null, 5), 1));
  set([B.SPACE_ROCK, B.SPACE_ROCK_BUILT], row(null, [null, null, null, null, null, 3], all(null, 5), all(null, 5), 2));
  set([B.SLIME], row(null, [null, null, null, null, null, 6], all(null, 5), all(null, 5), 4));
  set([B.IRON_WALL], row(null, [null, null, 3, 2, 1, 0.5], all(null, 5), all(null, 5), 0.5));
  set([B.COPPER_WALL], row(null, [null, 3, 1.5, 1, 0.5, 0.2], all(null, 5), all(null, 5), 0.2));
  set([B.GOLD_WALL], row(null, [null, null, null, 3, 2, 1], all(null, 5), all(null, 5), 0.5));
  set([B.DIAMOND_WALL], row(null, [null, null, null, null, 3, 1.5], all(null, 5), all(null, 5), 0.5));
  set([B.TORCH, B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ], row(0, all(0, 6), all(0, 5), all(0, 5), 0));
  set([B.CRATE], row(2, all(2, 6), all(2, 5), all(2, 5), 2));
  set([B.DOOR_LOWER_X, B.DOOR_LOWER_Z, B.DOOR_UPPER_X, B.DOOR_UPPER_Z, B.DOOR_LOWER_OPEN_X, B.DOOR_LOWER_OPEN_Z, B.DOOR_UPPER_OPEN_X, B.DOOR_UPPER_OPEN_Z],
    row(2, all(2, 6), all(2, 5), all(2, 5), 2));
  set([B.TNT, B.C4], row(null, all(null, 6), [1, 0.5, 0.25, 0.1, 0], all(null, 5), null));
  // this game's own: glass like ice, the tower's stone like bedrock
  set([B.GLASS], row(1, all(0.5, 6), all(1, 5), all(1, 5), 0.01));
  return T;
})();

// How long it takes to dig a block with an item, in seconds; Infinity if it can't be done.
export function digTime(blockDef, item) {
  const row = DIG[blockDef.id];
  if (!row || !blockDef.breakable) return Infinity;
  let t;
  if (item?.laser && item.tool === 'pick') t = row.saber;
  else if (item?.kind === 'tool' && row[item.tool]) t = row[item.tool][item.tier - 1];
  else t = row.hands;
  return t == null ? Infinity : t;
}

// ---- recipes --------------------------------------------------------------------------------

// The original's CookBook, in its order: out item, how many it makes, components [item, count],
// and the tab this game's crafting screen shows it under.
export const RECIPES = [];
const r = (tab, out, n, ...comps) => RECIPES.push({ tab, out, n, in: comps });
r('materials', 'wood', 4, ['log', 1]);
r('materials', 'stick', 4, ['wood', 1]);
r('structures', 'torch', 4, ['coal', 1], ['stick', 1]);
r('structures', 'lantern', 4, ['torch', 1], ['iron', 1], ['sand', 4], ['coal', 2]);
r('ammo', 'casing_brass', 200, ['copper', 1]);
r('ammo', 'casing_iron', 200, ['iron', 1]);
r('ammo', 'casing_gold', 200, ['gold', 1]);
r('ammo', 'casing_diamond', 100, ['diamond', 1]);
r('ammo', 'bullets', 100, ['rock', 1], ['casing_brass', 100], ['coal', 1]);
r('ammo', 'bullets_iron', 100, ['iron', 1], ['casing_brass', 100], ['coal', 1]);
r('ammo', 'bullets_gold', 100, ['gold', 1], ['casing_iron', 100], ['coal', 1]);
r('ammo', 'bullets_diamond', 100, ['diamond', 1], ['casing_gold', 100], ['coal', 1]);
r('ammo', 'bullets_laser', 100, ['space_rock', 1], ['casing_diamond', 100]);
r('tools', 'compass', 1, ['sand', 1], ['coal', 1], ['iron', 1]);
r('tools', 'clock', 1, ['sand', 1], ['coal', 1], ['wood', 1], ['copper', 1]);
r('tools', 'locator', 1, ['sand', 1], ['coal', 1], ['iron', 1], ['gold', 1]);
r('tools', 'teleporter', 1, ['sand', 1], ['coal', 1], ['bloodstone', 1], ['diamond', 1]);
r('structures', 'crate', 1, ['wood', 10], ['iron', 2]);
r('tools', 'pick_stone', 1, ['rock', 4], ['stick', 2]);
r('tools', 'pick_copper', 1, ['copper', 2], ['stick', 2]);
r('tools', 'pick_iron', 1, ['iron', 2], ['stick', 2]);
r('tools', 'pick_gold', 1, ['gold', 2], ['iron', 3]);
r('tools', 'pick_diamond', 1, ['diamond', 2], ['gold', 3]);
r('tools', 'pick_bloodstone', 1, ['bloodstone', 10], ['diamond', 3]);
r('tools', 'spade_stone', 1, ['rock', 2], ['stick', 2]);
r('tools', 'spade_copper', 1, ['copper', 1], ['stick', 2]);
r('tools', 'spade_iron', 1, ['iron', 1], ['stick', 2]);
r('tools', 'spade_gold', 1, ['gold', 1], ['iron', 2]);
r('tools', 'spade_diamond', 1, ['diamond', 1], ['gold', 2]);
r('tools', 'axe_stone', 1, ['rock', 4], ['stick', 2]);
r('tools', 'axe_copper', 1, ['copper', 2], ['stick', 2]);
r('tools', 'axe_iron', 1, ['iron', 2], ['stick', 2]);
r('tools', 'axe_gold', 1, ['gold', 2], ['iron', 2]);
r('tools', 'axe_diamond', 1, ['diamond', 2], ['gold', 2]);
r('materials', 'iron', 1, ['iron_ore', 2], ['coal', 1]);
r('materials', 'gold', 1, ['gold_ore', 2], ['coal', 1]);
r('materials', 'copper', 1, ['copper_ore', 2], ['coal', 1]);
r('materials', 'iron', 1, ['iron_ore', 2], ['log', 1]);
r('materials', 'gold', 1, ['gold_ore', 2], ['log', 1]);
r('materials', 'copper', 1, ['copper_ore', 2], ['log', 1]);
r('weapons', 'knife', 1, ['iron', 1], ['wood', 1]);
r('weapons', 'knife_gold', 1, ['gold', 1], ['iron', 1]);
r('weapons', 'knife_diamond', 1, ['diamond', 1], ['gold', 1]);
r('weapons', 'knife_bloodstone', 1, ['bloodstone', 10], ['diamond', 1]);
r('weapons', 'saber', 1, ['iron', 2], ['space_rock', 4]);
r('weapons', 'saber_copper', 1, ['copper', 2], ['space_rock', 4]);
r('weapons', 'saber_gold', 1, ['gold', 2], ['space_rock', 4]);
r('weapons', 'saber_diamond', 1, ['diamond', 2], ['space_rock', 4]);
r('weapons', 'saber_bloodstone', 1, ['bloodstone', 2], ['space_rock', 4]);
// the guns, kind by kind, iron, gold, diamond, bloodstone, then the laser ones
const gunRecipes = (gk, iron, gold, diamond, blood, laser) => {
  r('weapons', gk, 1, ['iron', iron[0]], ['wood', iron[1]]);
  r('weapons', `${gk}_gold`, 1, ['gold', gold[0]], ['iron', gold[1]]);
  r('weapons', `${gk}_diamond`, 1, ['diamond', diamond[0]], ['gold', diamond[1]]);
  r('weapons', `${gk}_bloodstone`, 1, ['bloodstone', blood[0]], ['diamond', blood[1]]);
  if (!laser) return;
  const [goo, dia] = laser;
  r('weapons', `laser_${gk}`, 1, ['slime', goo], ['diamond', dia], ['iron', 1]);
  r('weapons', `laser_${gk}_copper`, 1, ['slime', goo], ['diamond', dia], ['copper', 1]);
  r('weapons', `laser_${gk}_gold`, 1, ['slime', goo], ['diamond', dia], ['gold', 1]);
  r('weapons', `laser_${gk}_diamond`, 1, ['slime', goo], ['diamond', dia + 1]);
};
gunRecipes('pistol', [2, 2], [2, 2], [2, 2], [30, 2], [2, 2]);
gunRecipes('lmg', [6, 2], [6, 3], [6, 3], [60, 6], null);
gunRecipes('smg', [3, 2], [3, 2], [3, 2], [20, 3], [3, 3]);
gunRecipes('rifle', [3, 2], [3, 2], [3, 2], [20, 3], [3, 3]);
gunRecipes('shotgun', [3, 2], [3, 2], [3, 2], [20, 3], [3, 3]);
gunRecipes('assault', [5, 3], [5, 3], [5, 3], [50, 6], [5, 6]);
r('structures', 'copper_wall', 1, ['copper', 2]);
r('materials', 'copper', 1, ['copper_wall', 1]);
r('structures', 'iron_wall', 1, ['iron', 2]);
r('materials', 'iron', 1, ['iron_wall', 1]);
r('structures', 'gold_wall', 1, ['gold', 2]);
r('materials', 'gold', 1, ['gold_wall', 1]);
r('structures', 'diamond_wall', 1, ['diamond', 2]);
r('materials', 'diamond', 1, ['diamond_wall', 1]);
r('explosives', 'tnt', 1, ['explosive_powder', 1], ['sand', 3], ['coal', 3]);
r('explosives', 'c4', 1, ['explosive_powder', 3], ['sand', 3], ['coal', 3]);
r('explosives', 'grenade', 1, ['explosive_powder', 1], ['iron', 1]);
r('explosives', 'rocket_launcher', 1, ['explosive_powder', 2], ['iron', 3], ['wood', 2]);
r('explosives', 'rocket_launcher_guided', 1, ['explosive_powder', 2], ['iron', 3], ['copper', 2], ['space_rock', 1]);
r('structures', 'door', 1, ['wood', 5], ['iron', 1]);

export const TABS = [
  { id: 'materials', name: 'Materials' },
  { id: 'tools', name: 'Tools' },
  { id: 'weapons', name: 'Weapons' },
  { id: 'ammo', name: 'Ammo' },
  { id: 'explosives', name: 'Explosives' },
  { id: 'structures', name: 'Structures' },
];

// The things a player starts with (the original's SetDefaultInventory; on Hardcore, nothing).
export const STARTER_KIT = [['pick_stone', 1], ['compass', 1], ['pistol', 1], ['knife', 1], ['bullets', 200], ['torch', 16]];
