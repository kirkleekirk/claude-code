// Item registry. Static ids for materials/gadgets/loot; dynamic keys for seeds, buds, packs,
// components, mods and ammo are described by itemInfo().
import { STRAINS, QUALITY, PACKS } from './strains.js';
import { COMPONENTS, MATERIALS, MODS, AMMO, AMMO_VARIANTS, THROWABLES, GADGETS } from './guns.js';

export const STATIC_ITEMS = {
  scrap: { name: 'Scrap', cat: 'material', icon: 'scrap', base: 4, w: 1, desc: 'Rusted metal. Smelt it, press it, compost it.' },
  iron: { name: 'Iron Ingot', cat: 'material', icon: 'ingot', tint: 'ink', base: 12, w: 1, desc: 'Smelted from scrap. Standard components.' },
  steel: { name: 'Steel Ingot', cat: 'material', icon: 'ingot', tint: 'sea', base: 30, w: 1, desc: 'Refined iron. Bench II components.' },
  alloy: { name: 'Alloy', cat: 'material', icon: 'ingot', tint: 'gold', base: 80, w: 1, desc: 'Pre-Collapse alloy. Rare. Bench III.' },
  timber: { name: 'Timber', cat: 'material', icon: 'timber', base: 6, w: 1, desc: 'Stocks, bolts, crates.' },
  spring: { name: 'Spring Coil', cat: 'material', icon: 'spring', base: 10, w: 0.2, desc: 'Actions, magazines, lockpicks.' },
  brass: { name: 'Brass', cat: 'material', icon: 'brass', base: 8, w: 0.3, desc: 'Cartridge cases.' },
  propellant: { name: 'Propellant', cat: 'material', icon: 'powder', base: 9, w: 0.5, desc: 'Ammo and explosives.' },
  polymer: { name: 'Polymer', cat: 'material', icon: 'polymer', base: 16, w: 0.3, desc: 'Grips, optics, smoke.' },
  fuel: { name: 'Fuel', cat: 'material', icon: 'fuel', base: 6, w: 1, desc: 'Smelters and generators drink it.' },
  compost: { name: 'Compost', cat: 'material', icon: 'compost', base: 3, w: 0.5, desc: 'Feeds plants (+50 nutrients).' },
  grain: { name: 'Grain', cat: 'material', icon: 'sack', base: 3, w: 1, desc: 'Mash for the brewery.' },
  medkit: { name: 'Medkit', cat: 'gadget', icon: 'meds', base: 35, w: 0.5, desc: 'Heals 50 HP (use from the hotbar slot 4 menu).' },
  repairkit: { name: 'Repair Kit', cat: 'gadget', icon: 'gear', base: 30, w: 0.5, desc: 'Restores 40% durability to a gun.' },
  jewelry: { name: 'Jewelry', cat: 'loot', icon: 'ring', base: 90, w: 0.2, desc: 'Fence it. Hot goods.' },
  meds: { name: 'Old Medicine', cat: 'loot', icon: 'meds', base: 45, w: 0.3, desc: 'Clinics pay well.' },
  electronics: { name: 'Electronics', cat: 'loot', icon: 'circuit', base: 65, w: 0.5, desc: 'Pre-Collapse boards.' },
  relic: { name: 'Relic', cat: 'loot', icon: 'relic', base: 160, w: 0.5, desc: 'Idols and curios. Saint Verity collectors pay most.' },
  documents: { name: 'Ledger Pages', cat: 'loot', icon: 'papers', base: 40, w: 0.1, desc: 'Paperwork. Can be read for intel (tip-off).' },
  foodsack: { name: 'Food Sack', cat: 'loot', icon: 'sack', base: 18, w: 1, desc: 'Grain-depot goods.' },
  shine: { name: 'Moonshine', cat: 'product', icon: 'jug', base: 26, w: 1, desc: 'Brewery bootleg. High margin, high heat.' },
};
for (const [id, t] of Object.entries(THROWABLES)) STATIC_ITEMS[id] = { name: t.name, cat: 'throwable', icon: t.icon, base: t.price, w: 0.5, desc: t.desc };
for (const [id, t] of Object.entries(GADGETS)) STATIC_ITEMS[id] = { name: t.name, cat: 'gadget', icon: t.icon, base: t.price, w: 0.5, desc: t.desc };

export const MATERIAL_ITEMS = ['scrap', 'iron', 'steel', 'alloy', 'timber', 'spring', 'brass', 'propellant', 'polymer', 'fuel', 'compost', 'grain'];
export const LOOT_ITEMS = ['jewelry', 'meds', 'electronics', 'relic', 'documents', 'foodsack'];

const cache = new Map();

// Returns { name, cat, icon, tint, base, w, desc } for any inventory key.
export function itemInfo(key, hybrids) {
  if (STATIC_ITEMS[key]) return STATIC_ITEMS[key];
  if (cache.has(key)) return cache.get(key);
  const p = key.split(':');
  let out;
  const strainName = (id) => (STRAINS[id] ? STRAINS[id].name : (hybrids && hybrids[id] ? hybrids[id].name : 'Hybrid'));
  const strainTint = (id) => (STRAINS[id] ? STRAINS[id].tint : (hybrids && hybrids[id] ? hybrids[id].tint : 'green'));
  switch (p[0]) {
    case 'seed': out = { name: strainName(p[1]) + ' Seeds', cat: 'seed', icon: 'seed', tint: strainTint(p[1]), base: STRAINS[p[1]] ? STRAINS[p[1]].seedPrice || 60 : 40, w: 0.05, desc: 'Plant in a grow plot.' }; break;
    case 'bud': out = { name: `${QUALITY[+p[2]].name} ${strainName(p[1])} (cured)`, cat: 'bud', icon: 'bud', tint: strainTint(p[1]), base: 9, w: 0.1, desc: 'Cured bud. Pack it into baggies, jars or bricks.' }; break;
    case 'pack': { const pk = PACKS[p[3]]; out = { name: `${QUALITY[+p[2]].name} ${strainName(p[1])} ${pk.name}`, cat: 'product', icon: pk.icon, tint: strainTint(p[1]), base: pk.base * QUALITY[+p[2]].mult, w: pk.units * 0.1, desc: `${pk.units} unit${pk.units > 1 ? 's' : ''} of product.` }; break; }
    case 'comp': { const c = COMPONENTS[p[1]]; const m = MATERIALS[p[2]]; out = { name: `${m.name} ${c.name} ${'★'.repeat(+p[3])}`, cat: 'component', icon: c.icon, tint: p[2], base: Math.round(12 * m.mult * (1 + 0.15 * (+p[3] - 3)) * c.ingots), w: 0.5, desc: c.desc }; break; }
    case 'mod': { const m = MODS[p[1]]; out = { name: m.name, cat: 'mod', icon: 'mod', tint: 'teal', base: 40 + Object.values(m.recipe).reduce((a, b) => a + b, 0) * 18, w: 0.3, desc: m.desc }; break; }
    case 'ammo': { const a = AMMO[p[1]]; const v = AMMO_VARIANTS[p[2] || 'std']; out = { name: `${v.name ? v.name + ' ' : ''}${a.name} rounds`, cat: 'ammo', icon: a.icon, tint: p[2] === 'ap' ? 'sea' : p[2] === 'inc' ? 'heat' : a.tint, base: a.value * (p[2] && p[2] !== 'std' ? 1.7 : 1), w: 0.01, desc: 'Ammunition.' }; break; }
    default: out = { name: key, cat: 'misc', icon: 'bag', base: 1, w: 0.1, desc: '' };
  }
  cache.set(key, out);
  return out;
}

export const ammoKey = (type, variant = 'std') => (variant === 'std' ? `ammo:${type}` : `ammo:${type}:${variant}`);
export const compKey = (type, mat, stars) => `comp:${type}:${mat}:${stars}`;
export const packKey = (strain, q, form) => `pack:${strain}:${q}:${form}`;
export const budKey = (strain, q) => `bud:${strain}:${q}`;
