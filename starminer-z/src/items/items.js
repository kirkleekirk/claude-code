// Every item: blocks you can carry and place, crafting materials, tools, knives, guns and ammo,
// with the recipes that make them. Modelled on the original game's early item set.

import { B } from '../world/blocks.js';

export const TIERS = {
  stone: { name: 'Stone', tier: 1, speed: 2.2, color: 0x8b877f, durability: 140 },
  copper: { name: 'Copper', tier: 2, speed: 3.2, color: 0xc0703e, durability: 260 },
  iron: { name: 'Iron', tier: 3, speed: 4.4, color: 0xb9bdc2, durability: 520 },
  gold: { name: 'Gold', tier: 4, speed: 6.0, color: 0xf0c443, durability: 900 },
  diamond: { name: 'Diamond', tier: 5, speed: 8.0, color: 0x9ce6ef, durability: 2000 },
};

// guns: damage per bullet, rounds per minute, magazine, spread in degrees, reload seconds
const GUNS = {
  pistol: { name: 'Pistol', dmg: 12, rpm: 320, auto: false, mag: 8, spread: 1.4, reload: 1.3, pellets: 1, recoil: 0.05, range: 60, desc: 'Reliable semi-auto sidearm. Uses Bullets' },
  smg: { name: 'SMG', dmg: 8, rpm: 840, auto: true, mag: 32, spread: 3.2, reload: 1.7, pellets: 1, recoil: 0.025, range: 45, desc: 'Fast firing, short range. Uses Bullets' },
  assault: { name: 'Assault Rifle', dmg: 14, rpm: 600, auto: true, mag: 30, spread: 1.9, reload: 2.1, pellets: 1, recoil: 0.035, range: 80, desc: 'High power full auto. Uses Bullets' },
  shotgun: { name: 'Shotgun', dmg: 9, rpm: 75, auto: false, mag: 6, spread: 7.5, reload: 2.4, pellets: 9, recoil: 0.12, range: 30, desc: 'Devastating up close. Uses Bullets' },
  rifle: { name: 'Rifle', dmg: 70, rpm: 48, auto: false, mag: 5, spread: 0.25, reload: 2.6, pellets: 1, recoil: 0.14, range: 160, zoom: 2.6, desc: 'Bolt action. One shot, one kill. Uses Bullets' },
};
const GUN_MATS = { iron: { prefix: '', mult: 1, ing: 'iron' }, gold: { prefix: 'Gold ', mult: 1.7, ing: 'gold' }, diamond: { prefix: 'Diamond ', mult: 2.6, ing: 'diamond' } };
const GUN_COST = { pistol: [2, 1], smg: [3, 1], assault: [4, 2], shotgun: [3, 2], rifle: [3, 3] };

export const ITEMS = {};
const add = (id, def) => { ITEMS[id] = { id, stack: 64, ...def }; return ITEMS[id]; };

// ---- blocks ----
const blockItem = (id, block, name, desc, extra = {}) => add(id, { kind: 'block', block, name, desc, ...extra });
blockItem('dirt', B.DIRT, 'Dirt', 'Soft earth. Dig it with a spade');
blockItem('sand', B.SAND, 'Sand', 'Fine desert sand');
blockItem('rock', B.ROCK, 'Rock', 'Solid stone. Needs a pick');
blockItem('snow', B.SNOW, 'Snow', 'Packed snow');
blockItem('ice', B.ICE, 'Ice', 'Frozen water');
blockItem('log', B.LOG, 'Log', 'A tree trunk. Craft it into Wood');
blockItem('wood', B.WOOD, 'Wood', 'Planks for building');
blockItem('leaves', B.LEAVES, 'Leaves', 'Leafy block');
blockItem('copper_ore', B.COPPER_ORE, 'Copper Ore', 'Smelt with Coal to make Copper');
blockItem('iron_ore', B.IRON_ORE, 'Iron Ore', 'Smelt with Coal to make Iron');
blockItem('gold_ore', B.GOLD_ORE, 'Gold Ore', 'Smelt with Coal to make Gold');
blockItem('bloodstone', B.BLOODSTONE, 'BloodStone', 'Hard red rock from the depths');
blockItem('lantern', B.LANTERN, 'Lantern', 'A bright, steady light');
blockItem('torch', B.TORCH, 'Torch', 'Lights up the dark. Place on walls or floors');
blockItem('copper_wall', B.COPPER_WALL, 'Copper Wall', 'Tough wall. Zombies take longer to dig through');
blockItem('iron_wall', B.IRON_WALL, 'Iron Wall', 'Tougher wall');
blockItem('gold_wall', B.GOLD_WALL, 'Gold Wall', 'Very tough wall');
blockItem('diamond_wall', B.DIAMOND_WALL, 'Diamond Wall', 'The toughest wall there is');
blockItem('glass', B.GLASS, 'Glass', 'See-through block');

// ---- materials ----
add('stick', { kind: 'material', name: 'Stick', desc: 'Handles for tools and torches' });
add('coal', { kind: 'material', name: 'Coal', desc: 'Fuel for smelting and torches' });
add('copper', { kind: 'material', name: 'Copper', desc: 'Copper bar. Tools, walls and Bullets' });
add('iron', { kind: 'material', name: 'Iron', desc: 'Iron bar. Tools, guns and walls' });
add('gold', { kind: 'material', name: 'Gold', desc: 'Gold bar. Strong tools and guns' });
add('diamond', { kind: 'material', name: 'Diamond', desc: 'The hardest material there is' });

// ---- tools ----
for (const [k, t] of Object.entries(TIERS)) {
  add(`pick_${k}`, { kind: 'tool', tool: 'pick', mat: k, tier: t.tier, speed: t.speed, color: t.color, name: `${t.name} PickAxe`, stack: 1, durability: t.durability, melee: 8 + t.tier * 2, desc: `Digs rock and ore${t.tier >= 2 ? `, up to ${['', '', 'Iron', 'Gold', 'Diamond', 'BloodStone'][t.tier]} Ore` : ''}` });
  add(`spade_${k}`, { kind: 'tool', tool: 'spade', mat: k, tier: t.tier, speed: t.speed, color: t.color, name: `${t.name} Spade`, stack: 1, durability: t.durability, melee: 6 + t.tier * 2, desc: 'Digs dirt, sand and snow fast' });
  add(`axe_${k}`, { kind: 'tool', tool: 'axe', mat: k, tier: t.tier, speed: t.speed, color: t.color, name: `${t.name} Axe`, stack: 1, durability: t.durability, melee: 10 + t.tier * 3, desc: 'Chops wood fast' });
}
add('compass', { kind: 'tool', tool: 'compass', name: 'Compass', stack: 1, desc: 'Points the way back to the start tower' });

// ---- knives ----
add('knife', { kind: 'melee', mat: 'iron', name: 'Knife', stack: 1, damage: 26, rate: 0.42, durability: 600, desc: 'Fast melee weapon' });
add('knife_gold', { kind: 'melee', mat: 'gold', name: 'Gold Knife', stack: 1, damage: 44, rate: 0.4, durability: 1100, desc: 'Sharper and stronger' });
add('knife_diamond', { kind: 'melee', mat: 'diamond', name: 'Diamond Knife', stack: 1, damage: 70, rate: 0.38, durability: 2400, desc: 'The deadliest blade' });

// ---- guns ----
for (const [gk, g] of Object.entries(GUNS)) {
  for (const [mk, m] of Object.entries(GUN_MATS)) {
    const id = mk === 'iron' ? gk : `${gk}_${mk}`;
    add(id, { kind: 'gun', gun: gk, mat: mk, name: `${m.prefix}${g.name}`, stack: 1, ...g, dmg: Math.round(g.dmg * m.mult), ammo: 'bullets', desc: g.desc, durability: 0 });
  }
}

// ---- ammo ----
add('bullets', { kind: 'ammo', name: 'Bullets', stack: 999, desc: 'Ammunition for every gun' });

// what a block drops when it's dug out
export function dropFor(block) {
  switch (block) {
    case B.GRASS: case B.SNOW_GRASS: return 'dirt';
    case B.COAL_ORE: return 'coal';
    case B.DIAMOND_ORE: return 'diamond';
    case B.LEAVES: return Math.random() < 0.18 ? 'stick' : null;
    case B.GLASS: return null;
    case B.TORCH: case B.TORCH_PX: case B.TORCH_NX: case B.TORCH_PZ: case B.TORCH_NZ: return 'torch';
    default: {
      for (const it of Object.values(ITEMS)) if (it.kind === 'block' && it.block === block) return it.id;
      return null;
    }
  }
}

// ---- recipes ----
// Each: out item, count made, components [item, count], the menu tab.
export const RECIPES = [];
const r = (tab, out, n, ...comps) => RECIPES.push({ tab, out, n, in: comps });

r('materials', 'wood', 4, ['log', 1]);
r('materials', 'stick', 4, ['wood', 1]);
r('materials', 'copper', 1, ['copper_ore', 1], ['coal', 1]);
r('materials', 'iron', 1, ['iron_ore', 1], ['coal', 1]);
r('materials', 'gold', 1, ['gold_ore', 1], ['coal', 1]);

const ING = { stone: 'rock', copper: 'copper', iron: 'iron', gold: 'gold', diamond: 'diamond' };
for (const k of Object.keys(TIERS)) {
  r('tools', `pick_${k}`, 1, [ING[k], 2], ['stick', 2]);
  r('tools', `spade_${k}`, 1, [ING[k], 1], ['stick', 2]);
  r('tools', `axe_${k}`, 1, [ING[k], 2], ['stick', 2]);
}
r('tools', 'compass', 1, ['iron', 1], ['copper', 1]);

r('weapons', 'knife', 1, ['iron', 1], ['stick', 1]);
r('weapons', 'knife_gold', 1, ['gold', 1], ['stick', 1]);
r('weapons', 'knife_diamond', 1, ['diamond', 1], ['stick', 1]);
for (const gk of Object.keys(GUNS)) {
  for (const [mk, m] of Object.entries(GUN_MATS)) {
    const id = mk === 'iron' ? gk : `${gk}_${mk}`;
    const [a, b] = GUN_COST[gk];
    r('weapons', id, 1, [m.ing, a], ['wood', b]);
  }
}

r('ammo', 'bullets', 50, ['copper', 1], ['coal', 1]);
r('ammo', 'bullets', 120, ['iron', 1], ['coal', 2]);

r('structures', 'torch', 4, ['stick', 1], ['coal', 1]);
r('structures', 'lantern', 2, ['iron', 1], ['torch', 1]);
r('structures', 'glass', 2, ['sand', 2], ['coal', 1]);
r('structures', 'copper_wall', 4, ['copper', 1], ['rock', 2]);
r('structures', 'iron_wall', 4, ['iron', 1], ['rock', 2]);
r('structures', 'gold_wall', 4, ['gold', 1], ['rock', 2]);
r('structures', 'diamond_wall', 4, ['diamond', 1], ['rock', 2]);

export const TABS = [
  { id: 'materials', name: 'Materials' },
  { id: 'tools', name: 'Tools' },
  { id: 'weapons', name: 'Weapons' },
  { id: 'ammo', name: 'Ammo' },
  { id: 'structures', name: 'Structures' },
];

// How long it takes to dig a block with an item, in seconds; Infinity if it can't be done.
export function digTime(blockDef, item) {
  if (!blockDef.breakable) return Infinity;
  const tier = item && item.kind === 'tool' ? item.tier : 0;
  const tool = item && item.kind === 'tool' ? item.tool : null;
  if (blockDef.tier > tier) return Infinity;
  let speed = 1;
  if (tool && tool === blockDef.tool) speed = item.speed;
  else if (tool && blockDef.tool === 'none') speed = 1.5;
  else if (tool) speed = 1 + (item.speed - 1) * 0.25;
  // bare hands are slow on anything but soft ground
  if (!tool && blockDef.tool === 'pick') speed = 0.35;
  return Math.max(0.05, (blockDef.hardness * 1.5) / speed);
}
