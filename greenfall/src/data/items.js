// Item, weapon and loot definitions.
export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export const RARITY_HEX = ['#b0b4b8', '#5fcf3a', '#3a9ae8', '#b54ae8', '#f0a020'];
export const AMMO = {
  a45: { name: '.45 Rounds', short: '.45', color: '#e8c050', pickup: 14 },
  a9: { name: '9mm Rounds', short: '9mm', color: '#d8d0b0', pickup: 30 },
  g12: { name: '12 Gauge Shells', short: '12ga', color: '#d8503a', pickup: 8 },
  a556: { name: '5.56 Rounds', short: '5.56', color: '#7aa8d8', pickup: 30 },
  a762: { name: '7.62 Rounds', short: '7.62', color: '#c88a5a', pickup: 10 },
  bolts: { name: 'Crossbow Bolts', short: 'Bolts', color: '#9ad87a', pickup: 6 },
};
export const MATERIALS = ['wood', 'stone', 'metal'];
export const MAT_CAP = 999;

// Guns. `rar` lists the rarities a gun can spawn in (0 Common … 4 Legendary); `dmg` and
// `reload` are indexed by rarity. `hipRate` multiplies the fire rate when shooting from the
// hip (revolvers can be fanned). `noise` = meters a gunshot can be heard by the dead.
// Spread is in radians: `spread` from the hip, `adsSpread` aimed.
export const WEAPONS = {
  // ---- .45 revolvers ----
  snub: { name: 'Snub-Nose Revolver', model: 'snub', sound: 'revolver', ammo: 'a45', rar: [1], mag: 8, rate: 3.0, hipRate: 1.6, dmg: [34, 34, 34, 34, 34], head: 1.8, spread: 0.06, adsSpread: 0.03, bloom: 0.018, reload: [2.2, 2.2, 2.2, 2.2, 2.2], range: 55, auto: false, noise: 170, recoil: 0.03, slotIcon: 'SN',
    blurb: 'Eight short-barrel .45 rounds. Fast and wild — fan it from the hip.' },
  longrev: { name: 'Long-Barrel Revolver', model: 'longrev', sound: 'revolver', ammo: 'a45', rar: [2], mag: 6, rate: 1.5, hipRate: 1.6, dmg: [62, 62, 62, 62, 62], head: 2.0, spread: 0.035, adsSpread: 0.005, bloom: 0.02, reload: [2.6, 2.6, 2.6, 2.6, 2.6], range: 140, auto: false, noise: 200, recoil: 0.045, slotIcon: 'LR',
    blurb: 'Six heavy .45 rounds at a steady pace. Accurate when aimed, faster from the hip.' },
  // ---- 9mm ----
  pistol: { name: '9mm Pistol', model: 'pistol', sound: 'pistol', ammo: 'a9', rar: [0, 1, 2], mag: 15, rate: 6.0, dmg: [22, 23, 25, 25, 25], head: 2, spread: 0.026, adsSpread: 0.011, bloom: 0.01, reload: [1.45, 1.4, 1.3, 1.3, 1.3], range: 75, auto: false, noise: 120, recoil: 0.01, slotIcon: 'P',
    blurb: 'Small, light and quick. Takes a suppressor well.' },
  mp5: { name: 'MP5', model: 'mp5', sound: 'smg', ammo: 'a9', rar: [1, 2, 3], mag: 30, rate: 12, dmg: [16, 17, 18, 19, 19], head: 1.75, spread: 0.032, adsSpread: 0.018, bloom: 0.006, reload: [2.2, 2.2, 2.1, 2.0, 2.0], range: 85, auto: true, noise: 140, recoil: 0.006, slotIcon: 'SMG',
    blurb: 'Full-auto 9mm. Shreds up close, falls off at range.' },
  // ---- 12 gauge ----
  pump: { name: 'Pump Shotgun', model: 'shotgun', sound: 'shotgun', ammo: 'g12', rar: [1, 2], mag: 5, rate: 0.75, dmg: [12, 12, 13, 13, 13], pellets: 9, head: 1.6, spread: 0.07, adsSpread: 0.058, bloom: 0, reload: [0.52, 0.52, 0.48, 0.48, 0.48], perShell: true, range: 40, auto: false, noise: 190, recoil: 0.05, slotIcon: 'SG',
    blurb: 'Nine pellets of 12 gauge. Devastating inside a house, useless across a field.' },
  // ---- 5.56 ----
  m4: { name: 'M4 Carbine', model: 'm4', sound: 'ar', ammo: 'a556', rar: [0, 1, 2, 3, 4], mag: 30, rate: 6.5, dmg: [28, 29, 31, 33, 35], head: 1.5, spread: 0.02, adsSpread: 0.005, bloom: 0.009, reload: [2.4, 2.3, 2.2, 2.1, 2.0], range: 230, auto: true, noise: 170, recoil: 0.009, slotIcon: 'M4',
    blurb: 'Controllable, accurate full-auto rifle. Takes almost every mod.' },
  ak: { name: 'AK-47', model: 'ak', sound: 'ak', ammo: 'a556', rar: [1, 2, 3, 4], mag: 30, rate: 5.3, dmg: [34, 34, 36, 38, 40], head: 1.5, spread: 0.026, adsSpread: 0.008, bloom: 0.014, reload: [2.7, 2.7, 2.6, 2.5, 2.4], range: 220, auto: true, noise: 185, recoil: 0.016, slotIcon: 'AK',
    blurb: 'Hits harder than the M4 but kicks like a mule.' },
  // ---- 7.62 ----
  scout: { name: 'Black Bolt-Action', model: 'scout', sound: 'scout', ammo: 'a762', rar: [2, 3], mag: 5, rate: 1.15, dmg: [78, 78, 78, 84, 84], head: 2.2, spread: 0.05, adsSpread: 0.0008, bloom: 0, reload: [2.4, 2.4, 2.4, 2.2, 2.2], range: 550, auto: false, noise: 230, recoil: 0.04, scope: true, zoom: 30, drop: 9, speed: 400, slotIcon: 'BA',
    blurb: 'Compact black sniper with a quick bolt and a 2× scope.' },
  longrifle: { name: 'Walnut Long Rifle', model: 'longrifle', sound: 'sniper', ammo: 'a762', rar: [2, 3, 4], mag: 4, rate: 0.55, dmg: [105, 105, 105, 112, 120], head: 2.5, spread: 0.08, adsSpread: 0.0003, bloom: 0, reload: [3.0, 3.0, 3.0, 2.8, 2.6], range: 900, auto: false, noise: 280, recoil: 0.07, scope: true, zoom: 14, drop: 8, speed: 440, slotIcon: 'SR',
    blurb: 'Heavy wood-stock rifle with a long scope. One shot, one kill — at any range.' },
  // ---- not guns ----
  crossbow: { name: 'Crossbow', model: 'crossbow', ammo: 'bolts', rar: [0, 1, 2, 3, 4], mag: 1, rate: 0.9, dmg: [68, 72, 78, 84, 90], head: 2.2, spread: 0.02, adsSpread: 0.002, bloom: 0, reload: [1.4, 1.35, 1.3, 1.25, 1.2], range: 160, auto: false, noise: 6, recoil: 0.02, projectile: true, speed: 75, drop: 9, suppressed: true, slotIcon: 'XB',
    blurb: 'Silent. The dead never hear it.' },
  // ---- melee: found, not brought. They gather materials and break things. ----
  // harvest = materials per hit multiplier; smash = damage multiplier vs doors, boards and walls
  machete: { name: 'Machete', model: 'machete', melee: true, rar: [0, 1, 2, 3, 4], rate: 1.7, dmg: [40, 42, 45, 48, 52], head: 1.3, range: 2.4, noise: 2, slotIcon: 'MA',
    harvest: { wood: 0.8, stone: 0.25, metal: 0.25 }, smash: 0.7, blurb: 'Fast and quiet. Best against the dead; can hack some wood.' },
  axe: { name: 'Fire Axe', model: 'axe', melee: true, rar: [0, 1, 2], rate: 1.15, dmg: [48, 50, 54, 54, 54], head: 1.3, range: 2.5, noise: 4, slotIcon: 'AX',
    harvest: { wood: 1.6, stone: 0.5, metal: 0.4 }, smash: 1.8, blurb: 'Fells trees and chops through doors, boards and walls.' },
  pickaxe: { name: 'Pickaxe', model: 'pickaxe', melee: true, rar: [0, 1, 2], rate: 1.0, dmg: [42, 44, 47, 47, 47], head: 1.3, range: 2.5, noise: 5, slotIcon: 'PK',
    harvest: { wood: 0.6, stone: 1.6, metal: 1.4 }, smash: 1.5, blurb: 'Breaks rock and scrap metal. Brick walls crumble.' },
};
// the rarity a gun actually spawns in: the allowed rarity closest to the roll
export function clampRarity(id, r) {
  const L = WEAPONS[id]?.rar;
  if (!L || !L.length) return r;
  let best = L[0];
  for (const x of L) if (Math.abs(x - r) < Math.abs(best - r) || (Math.abs(x - r) === Math.abs(best - r) && x > best)) best = x;
  return best;
}
export const THROWABLES = {
  grenade: { name: 'Frag Grenade', model: 'grenade', stack: 6, fuse: 2.2, radius: 7, dmg: 105, noise: 300 },
  molotov: { name: 'Molotov', model: 'molotov', stack: 4, fireRadius: 5, fireTime: 9, fireDps: 14, noise: 60 },
  noisemaker: { name: 'Alarm Clock', model: 'noisemaker', stack: 5, lure: 26, noise: 160 },
};
// type: heal | food | throw | deploy | craft | valuable
export const ITEMS = {
  bandage: { type: 'heal', name: 'Bandage', stack: 15, time: 3.2, heal: 15, healCap: 75, stopBleed: true, icon: '✚', color: '#e8e0d0', value: 5 },
  medkit: { type: 'heal', name: 'Medkit', stack: 3, time: 8, heal: 100, healCap: 100, stopBleed: true, icon: '✚', color: '#e84a4a', value: 25 },
  splint: { type: 'heal', name: 'Splint', stack: 4, time: 4, fixFracture: true, icon: '⟂', color: '#c8a070', value: 10 },
  antibiotics: { type: 'heal', name: 'Antibiotics', stack: 4, time: 2, cureInfection: true, cureSick: true, icon: '◉', color: '#7ad8e8', value: 20 },
  painkillers: { type: 'heal', name: 'Painkillers', stack: 6, time: 1.5, heal: 10, healCap: 100, painkill: 120, icon: '●', color: '#f0f0f0', value: 10 },
  armor: { type: 'heal', name: 'Armor Plate', stack: 6, time: 3, armor: 25, icon: '⛨', color: '#5aa8e8', value: 15 },
  beans: { type: 'food', name: 'Canned Beans', stack: 6, time: 2.5, food: 35, water: 4, icon: '🥫', color: '#d8a050', value: 4 },
  chips: { type: 'food', name: 'Bag of Chips', stack: 6, time: 1.6, food: 16, water: -4, icon: '◆', color: '#e8c040', value: 2 },
  apple: { type: 'food', name: 'Apple', stack: 10, time: 1.4, food: 12, water: 6, icon: '●', color: '#d03a2a', value: 1 },
  corn: { type: 'food', name: 'Ear of Corn', stack: 10, time: 1.8, food: 9, cooks: 'roastcorn', icon: '▮', color: '#e8c840', value: 1 },
  roastcorn: { type: 'food', name: 'Roasted Corn', stack: 10, time: 1.8, food: 24, icon: '▮', color: '#c89030', value: 2 },
  rawmeat: { type: 'food', name: 'Raw Venison', stack: 5, time: 2.4, food: 14, sick: 0.65, cooks: 'cookedmeat', icon: '◗', color: '#c04040', value: 2 },
  cookedmeat: { type: 'food', name: 'Cooked Venison', stack: 5, time: 2.4, food: 48, icon: '◗', color: '#8a4a2a', value: 6 },
  rawchicken: { type: 'food', name: 'Raw Chicken', stack: 5, time: 2.2, food: 10, sick: 0.8, cooks: 'cookedchicken', icon: '◖', color: '#f0b0a0', value: 2 },
  cookedchicken: { type: 'food', name: 'Roast Chicken', stack: 5, time: 2.2, food: 36, icon: '◖', color: '#c8803a', value: 5 },
  water: { type: 'food', name: 'Water Bottle', stack: 6, time: 1.6, water: 42, icon: '💧', color: '#7ac8f0', value: 3 },
  dirtywater: { type: 'food', name: 'Dirty Water', stack: 6, time: 1.6, water: 30, sick: 0.5, cooks: 'water', icon: '💧', color: '#8a9a5a', value: 0 },
  soda: { type: 'food', name: 'Soda Pop', stack: 6, time: 1.4, water: 22, food: 4, stamina: 30, icon: '▯', color: '#e05050', value: 2 },
  energy: { type: 'food', name: 'Energy Drink', stack: 4, time: 1.4, water: 18, stamina: 90, icon: '⚡', color: '#7aff5a', value: 4 },
  gascan: { type: 'tool', name: 'Gas Can', stack: 2, icon: '⛽', color: '#e0503a', value: 8 },
  repairkit: { type: 'tool', name: 'Repair Kit', stack: 2, icon: '🔧', color: '#b8c0c8', value: 12 },
  trowel: { type: 'trowel', name: "Mason's Trowel", stack: 1, icon: '🧱', color: '#d07a4a', value: 10 },
  cloth: { type: 'craft', name: 'Cloth Scraps', stack: 20, icon: '≋', color: '#d8d0c0', value: 1 },
  campfire: { type: 'deploy', name: 'Campfire Kit', stack: 3, icon: '🔥', color: '#f08030', value: 6 },
  watch: { type: 'valuable', name: 'Gold Pocket Watch', stack: 1, icon: '◷', color: '#f0c040', value: 220 },
  locket: { type: 'valuable', name: 'Silver Locket', stack: 1, icon: '♡', color: '#d8d8e0', value: 140 },
  cash: { type: 'valuable', name: 'Cash Bundle', stack: 5, icon: '$', color: '#7ad87a', value: 90 },
  coin: { type: 'valuable', name: 'Rare Coin', stack: 3, icon: '◎', color: '#e8b040', value: 160 },
  records: { type: 'valuable', name: 'Vintage Records', stack: 1, icon: '◉', color: '#3a3a3a', value: 120 },
  idol: { type: 'valuable', name: 'Jade Idol', stack: 1, icon: '♦', color: '#5ae8a0', value: 400 },
};
for (const k in THROWABLES) ITEMS[k] = { type: 'throw', ...THROWABLES[k], icon: '●', color: '#8aa870', value: 8 };
for (const k in WEAPONS) ITEMS[k] = { type: 'weapon', stack: 1, ...WEAPONS[k], value: 12 };

export const RECIPES = [
  { id: 'bandage', out: 'bandage', n: 1, cost: { cloth: 2 }, desc: 'Stops bleeding, heals a little.' },
  { id: 'splint', out: 'splint', n: 1, cost: { cloth: 1, wood: 20 }, desc: 'Sets a fractured leg.' },
  { id: 'campfire', out: 'campfire', n: 1, cost: { wood: 30, stone: 10 }, desc: 'Cook food, boil water, stay warm. Light attracts the dead.' },
  { id: 'armor', out: 'armor', n: 1, cost: { metal: 40, cloth: 2 }, desc: 'Improvised armor plate (+25 armor).' },
];

// ---------- loot tables ----------
const W = (arr) => arr; // [id, weight]
export const LOOT = {
  weapon: W([['pistol', 18], ['snub', 10], ['longrev', 5], ['mp5', 13], ['pump', 16], ['m4', 15], ['ak', 11], ['scout', 5], ['longrifle', 3], ['crossbow', 4], ['machete', 5], ['axe', 5], ['pickaxe', 4]]),
  ammo: W([['a9', 28], ['a556', 28], ['g12', 18], ['a45', 13], ['a762', 9], ['bolts', 4]]),
  heal: W([['bandage', 40], ['medkit', 8], ['splint', 14], ['antibiotics', 10], ['painkillers', 12], ['armor', 16]]),
  food: W([['beans', 22], ['chips', 18], ['water', 24], ['soda', 12], ['energy', 5], ['apple', 8], ['dirtywater', 6], ['rawchicken', 3], ['corn', 2]]),
  throw: W([['grenade', 35], ['molotov', 30], ['noisemaker', 35]]),
  craft: W([['cloth', 66], ['campfire', 28], ['trowel', 6]]),
  auto: W([['gascan', 60], ['repairkit', 40]]),
  valuable: W([['cash', 35], ['locket', 20], ['watch', 15], ['coin', 15], ['records', 12], ['idol', 3]]),
};
export const CAT_WEIGHTS = {
  default: [['weapon', 24], ['ammo', 24], ['heal', 15], ['food', 20], ['throw', 6], ['craft', 7], ['valuable', 4], ['auto', 4]],
  auto: [['auto', 55], ['food', 25], ['craft', 10], ['ammo', 10]],
  food: [['food', 70], ['ammo', 10], ['heal', 8], ['craft', 6], ['weapon', 6]],
  meds: [['heal', 70], ['food', 15], ['craft', 15]],
  guns: [['weapon', 44], ['ammo', 38], ['blueprint', 10], ['throw', 8]],
  tools: [['craft', 28], ['auto', 20], ['throw', 18], ['heal', 14], ['weapon', 10], ['ammo', 10], ['blueprint', 6]],
  farm: [['food', 32], ['ammo', 18], ['weapon', 18], ['craft', 16], ['auto', 12], ['throw', 4]],
};
export const CONTAINER_LOOT = {
  fridge: [['food', 100]], cabinet: [['food', 45], ['heal', 20], ['ammo', 25], ['valuable', 10]], dresser: [['craft', 35], ['valuable', 25], ['ammo', 25], ['weapon', 15]],
  medcab: [['heal', 100]], toolbox: [['auto', 38], ['craft', 28], ['throw', 14], ['heal', 8], ['ammo', 7], ['blueprint', 5]], shelf: [['food', 30], ['heal', 20], ['ammo', 22], ['craft', 13], ['throw', 8], ['auto', 7]],
  register: [['valuable', 85], ['ammo', 15]], crate: [['ammo', 36], ['weapon', 32], ['heal', 14], ['throw', 9], ['blueprint', 9]],
};
export const RARITY_WEIGHTS = {
  floor: [[0, 44], [1, 33], [2, 16], [3, 6], [4, 1]],
  container: [[0, 30], [1, 36], [2, 22], [3, 10], [4, 2]],
  supply: [[1, 10], [2, 40], [3, 38], [4, 12]],
  airdrop: [[3, 55], [4, 45]],
};
