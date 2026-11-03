// Item, weapon and loot definitions.
export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export const RARITY_HEX = ['#b0b4b8', '#5fcf3a', '#3a9ae8', '#b54ae8', '#f0a020'];
export const AMMO = {
  light: { name: 'Light Ammo', color: '#d8d0b0', pickup: 30 },
  medium: { name: 'Medium Ammo', color: '#7aa8d8', pickup: 20 },
  heavy: { name: 'Heavy Ammo', color: '#d87a5a', pickup: 6 },
  shells: { name: 'Shells', color: '#e8c050', pickup: 8 },
  bolts: { name: 'Bolts', color: '#9ad87a', pickup: 6 },
};
export const MATERIALS = ['wood', 'stone', 'metal'];
export const MAT_CAP = 999;

// noise = meters a gunshot can be heard by the dead.
export const WEAPONS = {
  ar: { name: 'Ranch Rifle', model: 'ar', ammo: 'medium', mag: 30, rate: 5.5, dmg: [30, 31, 33, 35, 36], head: 1.5, spread: 0.022, adsSpread: 0.006, bloom: 0.012, reload: [2.6, 2.5, 2.4, 2.3, 2.2], range: 220, auto: true, noise: 170, recoil: 0.012, slotIcon: 'AR' },
  scar: { name: 'Prairie Carbine', model: 'ar', ammo: 'medium', mag: 30, rate: 5.0, dmg: [0, 0, 0, 36, 38], head: 1.5, spread: 0.018, adsSpread: 0.004, bloom: 0.01, reload: [2.3, 2.3, 2.3, 2.2, 2.1], range: 240, auto: true, noise: 170, recoil: 0.011, minRarity: 3, slotIcon: 'AR' },
  smg: { name: 'Tac SMG', model: 'smg', ammo: 'light', mag: 30, rate: 11, dmg: [16, 17, 18, 19, 20], head: 1.75, spread: 0.035, adsSpread: 0.022, bloom: 0.006, reload: [2.2, 2.1, 2.0, 1.9, 1.8], range: 90, auto: true, noise: 140, recoil: 0.006, slotIcon: 'SMG' },
  ssmg: { name: 'Hush SMG', model: 'smg', ammo: 'light', mag: 25, rate: 10, dmg: [14, 15, 16, 17, 18], head: 1.75, spread: 0.035, adsSpread: 0.024, bloom: 0.007, reload: [2.3, 2.2, 2.1, 2.0, 1.9], range: 80, auto: true, noise: 28, recoil: 0.005, suppressed: true, slotIcon: 'SMG' },
  pump: { name: 'Pump Shotgun', model: 'shotgun', ammo: 'shells', mag: 5, rate: 0.75, dmg: [9, 9.5, 10, 10.5, 11], pellets: 10, head: 1.6, spread: 0.075, adsSpread: 0.06, bloom: 0, reload: [0.55, 0.52, 0.5, 0.48, 0.45], perShell: true, range: 40, auto: false, noise: 190, recoil: 0.05, slotIcon: 'SG' },
  sniper: { name: 'Hunting Rifle', model: 'sniper', ammo: 'heavy', mag: 1, rate: 0.7, dmg: [86, 90, 95, 100, 105], head: 2.5, spread: 0.06, adsSpread: 0.0005, bloom: 0, reload: [2.0, 1.9, 1.8, 1.7, 1.6], range: 700, auto: false, noise: 260, recoil: 0.06, scope: true, drop: 9, speed: 380, slotIcon: 'SR' },
  bolt: { name: 'Longshot', model: 'sniper', ammo: 'heavy', mag: 4, rate: 0.5, dmg: [0, 0, 105, 110, 116], head: 2.5, spread: 0.08, adsSpread: 0.0003, bloom: 0, reload: [3, 3, 2.9, 2.8, 2.7], range: 900, auto: false, noise: 280, recoil: 0.07, scope: true, drop: 8, speed: 420, minRarity: 2, slotIcon: 'SR' },
  pistol: { name: 'Sidearm', model: 'pistol', ammo: 'light', mag: 16, rate: 6.5, dmg: [23, 24, 25, 26, 28], head: 2, spread: 0.028, adsSpread: 0.012, bloom: 0.01, reload: [1.5, 1.45, 1.4, 1.35, 1.3], range: 80, auto: false, noise: 120, recoil: 0.01, slotIcon: 'P' },
  spistol: { name: 'Quiet Pistol', model: 'pistol', ammo: 'light', mag: 12, rate: 5, dmg: [24, 25, 26, 27, 29], head: 2, spread: 0.026, adsSpread: 0.01, bloom: 0.01, reload: [1.6, 1.55, 1.5, 1.45, 1.4], range: 70, auto: false, noise: 22, recoil: 0.008, suppressed: true, slotIcon: 'P' },
  revolver: { name: 'Six-Shooter', model: 'revolver', ammo: 'heavy', mag: 6, rate: 1.6, dmg: [52, 54, 57, 60, 63], head: 2, spread: 0.02, adsSpread: 0.006, bloom: 0.02, reload: [2.4, 2.3, 2.2, 2.1, 2.0], range: 110, auto: false, noise: 190, recoil: 0.04, slotIcon: 'R' },
  crossbow: { name: 'Crossbow', model: 'crossbow', ammo: 'bolts', mag: 1, rate: 0.9, dmg: [68, 72, 78, 84, 90], head: 2.2, spread: 0.02, adsSpread: 0.002, bloom: 0, reload: [1.4, 1.35, 1.3, 1.25, 1.2], range: 160, auto: false, noise: 6, recoil: 0.02, projectile: true, speed: 75, drop: 9, suppressed: true, slotIcon: 'XB' },
  machete: { name: 'Machete', model: 'machete', melee: true, rate: 1.7, dmg: [40, 42, 45, 48, 52], head: 1.3, range: 2.4, noise: 2, slotIcon: 'M' },
};
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
  weapon: W([['ar', 22], ['smg', 16], ['ssmg', 6], ['pump', 18], ['pistol', 16], ['spistol', 6], ['revolver', 7], ['sniper', 6], ['crossbow', 5], ['machete', 6]]),
  ammo: W([['light', 30], ['medium', 30], ['shells', 20], ['heavy', 12], ['bolts', 8]]),
  heal: W([['bandage', 40], ['medkit', 8], ['splint', 14], ['antibiotics', 10], ['painkillers', 12], ['armor', 16]]),
  food: W([['beans', 22], ['chips', 18], ['water', 24], ['soda', 12], ['energy', 5], ['apple', 8], ['dirtywater', 6], ['rawchicken', 3], ['corn', 2]]),
  throw: W([['grenade', 35], ['molotov', 30], ['noisemaker', 35]]),
  craft: W([['cloth', 70], ['campfire', 30]]),
  auto: W([['gascan', 60], ['repairkit', 40]]),
  valuable: W([['cash', 35], ['locket', 20], ['watch', 15], ['coin', 15], ['records', 12], ['idol', 3]]),
};
export const CAT_WEIGHTS = {
  default: [['weapon', 24], ['ammo', 24], ['heal', 15], ['food', 20], ['throw', 6], ['craft', 7], ['valuable', 4], ['auto', 4]],
  auto: [['auto', 55], ['food', 25], ['craft', 10], ['ammo', 10]],
  food: [['food', 70], ['ammo', 10], ['heal', 8], ['craft', 6], ['weapon', 6]],
  meds: [['heal', 70], ['food', 15], ['craft', 15]],
  guns: [['weapon', 50], ['ammo', 40], ['throw', 10]],
  tools: [['craft', 30], ['auto', 20], ['throw', 20], ['heal', 15], ['weapon', 10], ['ammo', 10]],
  farm: [['food', 32], ['ammo', 18], ['weapon', 18], ['craft', 16], ['auto', 12], ['throw', 4]],
};
export const CONTAINER_LOOT = {
  fridge: [['food', 100]], cabinet: [['food', 45], ['heal', 20], ['ammo', 25], ['valuable', 10]], dresser: [['craft', 35], ['valuable', 25], ['ammo', 25], ['weapon', 15]],
  medcab: [['heal', 100]], toolbox: [['auto', 40], ['craft', 30], ['throw', 15], ['heal', 8], ['ammo', 7]], shelf: [['food', 30], ['heal', 20], ['ammo', 22], ['craft', 13], ['throw', 8], ['auto', 7]],
  register: [['valuable', 85], ['ammo', 15]], crate: [['ammo', 40], ['weapon', 35], ['heal', 15], ['throw', 10]],
};
export const RARITY_WEIGHTS = {
  floor: [[0, 44], [1, 33], [2, 16], [3, 6], [4, 1]],
  container: [[0, 30], [1, 36], [2, 22], [3, 10], [4, 2]],
  supply: [[1, 10], [2, 40], [3, 38], [4, 12]],
  airdrop: [[3, 55], [4, 45]],
};
export function weaponMinRarity(id) { return WEAPONS[id]?.minRarity ?? 0; }
