// The sandbox: a second save for trying things out. Every weapon is on the armory rack,
// every mod is in the parts drawer, the benches are fully built, every place is on the
// board (Port Lafitte and the Covenant job included), and the rules are yours to change:
// no damage, ammo that never runs out, no Sweep, any time of day. Your own game's save
// is never touched.

import { ITEMS, MATS, def, makeItem } from '../data/items.js';
import { MODS } from '../data/mods.js';
import { STATIONS } from '../data/recipes.js';
import { newHeist } from '../data/heist.js';
import { newProfile } from './Profile.js';
import { weaponStats } from './weapons.js';

// Times of day a sandbox trip can start at (hours; null keeps the place's own).
export const SANDBOX_HOURS = [
  { h: null, label: 'As the place has it' },
  { h: 17.2, label: 'Late afternoon' },
  { h: 18.4, label: 'Sunset' },
  { h: 19.4, label: 'Dusk' },
  { h: 21.5, label: 'Night' },
];

// Armory racks, in the order they're shown.
export const RACKS = [
  { id: 'blades', label: 'Blades and blunt', test: (d) => d.kind === 'melee' },
  { id: 't0', label: 'Tier 0 · scrap', test: (d) => d.kind === 'gun' && d.tier === 0 },
  { id: 't1', label: 'Tier 1 · worn', test: (d) => d.kind === 'gun' && d.tier === 1 },
  { id: 't2', label: 'Tier 2 · commercial', test: (d) => d.kind === 'gun' && d.tier === 2 },
  { id: 't3', label: 'Tier 3 · military', test: (d) => d.kind === 'gun' && d.tier === 3 },
  { id: 'x', label: 'Experimental', test: (d) => d.kind === 'gun' && d.tier === 4 },
];

export function rackItems(rack) {
  return Object.keys(ITEMS).filter((id) => ITEMS[id].cat === 'weapon' && rack.test(ITEMS[id]));
}

const MEDS = ['bandage', 'antiseptic', 'pills', 'medkit', 'adrenaline', 'nano_injector'];
const HEIST_GEAR = [['dive_gear', 1], ['cutting_torch', 1], ['boat_keys', 1], ['fuel_can', 4], ['hull_plate', 2], ['manifest', 1]];
const AMMO = [...new Set(Object.values(ITEMS).filter((d) => d.kind === 'gun' && d.ammo).map((d) => d.ammo))];

// A weapon off the rack, loaded to its (modded) capacity.
export function rackWeapon(id, mods = null) {
  const d = def(id);
  if (d.kind !== 'gun') return makeItem(id);
  const it = makeItem(id, 1, { loaded: 0, mods: mods || {} });
  it.loaded = weaponStats(it).cap;
  return it;
}

export function newSandboxProfile(settings = null) {
  const p = newProfile();
  p.sandbox = { god: true, ammo: true, sweep: false, hour: null };
  p.health = 100;
  p.nourishment = 100;
  for (const k of Object.keys(STATIONS)) p.stations[k] = STATIONS[k].max;
  p.packLevel = 3;
  // every place on the board from the start, the Covenant job scouted and ready to plan
  p.heist = { ...newHeist(), stage: 'planning', scouted: true };
  p.lastZone = 'harbor';
  if (settings) p.settings = { ...p.settings, ...settings };
  // a kit that passes for both the silent and the loud approaches
  p.loadout = {
    knife: rackWeapon('combat_knife'),
    melee: rackWeapon('machete'),
    sidearm: rackWeapon('m17', { muzzle: 'pistol_sup' }),
    long: rackWeapon('m4', { sights: 'red_dot', stock: 'adj_stock' }),
  };
  p.stash = [];
  p.backpack = [];
  restock(p);
  return p;
}

// Top everything back up: salvage, ammo, meds, the Covenant setups, spare guns for the
// crew, a full parts drawer, and ammo in the pack for whatever you're carrying.
export function restock(p) {
  const keep = p.stash.filter((it) => {
    const d = def(it.id);
    return d.cat === 'weapon' || (d.cat !== 'mat' && d.cat !== 'ammo' && d.cat !== 'med' && d.cat !== 'story');
  });
  const stash = [];
  const full = (id, stacks = 1) => { const n = def(id).stack || 1; for (let i = 0; i < stacks; i++) stash.push(makeItem(id, n)); };
  for (const m of MATS) full(m, 2);
  for (const a of AMMO) full(a);
  for (const m of MEDS) full(m);
  full('battery');
  full('mre');
  for (const [id, n] of HEIST_GEAR) stash.push(makeItem(id, n));
  // "guns for the crew" on the All Hands job counts spares in the stash
  const spares = keep.filter((it) => def(it.id).kind === 'gun').length;
  if (spares < 2) for (const id of ['rifle', 'shotgun'].slice(spares)) stash.push(rackWeapon(id));
  p.stash = [...stash, ...keep].slice(0, 60);
  p.parts = {};
  for (const m of MODS) p.parts[m.id] = 3;
  p.backpack = packFor(p.loadout);
}

// What goes in the pack: a couple of full stacks for each gun you carry, and meds.
export function packFor(loadout) {
  const pack = [];
  const seen = new Set();
  for (const it of Object.values(loadout)) {
    if (!it) continue;
    const d = def(it.id);
    if (d.kind !== 'gun' || !d.ammo || seen.has(d.ammo)) continue;
    seen.add(d.ammo);
    pack.push(makeItem(d.ammo, def(d.ammo).stack || 1), makeItem(d.ammo, def(d.ammo).stack || 1));
  }
  pack.push(makeItem('bandage', 4), makeItem('medkit', 2), makeItem('battery', 2));
  return pack;
}

// Put a weapon from the rack into its holster (replacing what was there).
// Returns the slot it went into.
export function equipFromRack(loadout, id) {
  const slot = def(id).slot;
  loadout[slot] = rackWeapon(id);
  return slot;
}
