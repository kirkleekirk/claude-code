// Persistent player profile: stash, loadout, backpack, benches, contracts.
// Saved to localStorage; every access is guarded because storage can be
// unavailable (private windows, sandboxed frames).

import { makeItem, def, MATS } from '../data/items.js';
import { PACK_BASE, PACK_STEP } from '../data/recipes.js';
import { ZONES } from '../data/zones.js';
import { RNG } from '../core/rng.js';

const SAVE_KEY = 'lasttoll.save.v1';
export const STASH_CAP = 60;

export function newProfile() {
  const pistol = makeItem('pistol', 1, { loaded: 8, chambered: true, dur: 120 });
  return {
    version: 1,
    day: 1,
    health: 88,
    nourishment: 70,
    stats: { raids: 0, extracted: 0, deaths: 0, kills: 0, headKills: 0, stabKills: 0 },
    stash: [
      makeItem('ammo_9mm', 10),
      makeItem('cloth', 4),
      makeItem('scrap', 3),
      makeItem('tape', 1),
      makeItem('beans', 2),
      makeItem('rice', 1),
      makeItem('gunpowder', 1),
    ],
    loadout: { knife: makeItem('screwdriver'), melee: null, sidearm: pistol, long: null },
    backpack: [makeItem('bandage', 2), makeItem('ammo_9mm', 6), makeItem('soda', 1)],
    benches: { weapon: 1, ammo: 1, med: 1, kitchen: 1 },
    packLevel: 0,
    contracts: [],
    contractDay: 0,
    lastZone: 'cypress',
    lastResult: null,
    settings: { sens: 1, volume: 0.8, fov: 68, invertY: false },
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.version !== 1) return null;
    const base = newProfile();
    p.settings = { ...base.settings, ...(p.settings || {}) };
    p.stats = { ...base.stats, ...(p.stats || {}) };
    p.benches = { ...base.benches, ...(p.benches || {}) };
    return p;
  } catch (_) {
    return null;
  }
}

export function saveProfile(p) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
    return true;
  } catch (_) {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
}

export function packCapacity(p) {
  return PACK_BASE + PACK_STEP * (p.packLevel || 0);
}

export function maxHealthFor(nourishment) {
  return Math.round(60 + 40 * Math.max(0, Math.min(100, nourishment)) / 100);
}

// ---- Generic slot-list helpers ------------------------------------------

// Adds an item into a slot list with capacity `cap`, merging stacks.
// Returns the quantity that did not fit (0 = all added).
export function addToList(list, cap, item) {
  const d = def(item.id);
  const stack = d.stack || 1;
  let qty = item.qty;
  if (stack > 1) {
    for (const s of list) {
      if (qty <= 0) break;
      if (s.id === item.id && s.qty < stack) {
        const take = Math.min(stack - s.qty, qty);
        s.qty += take;
        qty -= take;
      }
    }
  }
  while (qty > 0 && list.length < cap) {
    const take = Math.min(stack, qty);
    if (stack > 1) list.push({ ...item, qty: take });
    else list.push(item);
    qty -= take;
  }
  return qty;
}

export function canFit(list, cap, item) {
  const d = def(item.id);
  const stack = d.stack || 1;
  let room = (cap - list.length) * stack;
  if (stack > 1) for (const s of list) if (s.id === item.id) room += stack - s.qty;
  return room >= item.qty;
}

export function countIn(lists, id) {
  let n = 0;
  for (const l of lists) for (const s of l) if (s && s.id === id) n += s.qty;
  return n;
}

export function removeFrom(lists, id, qty) {
  for (const l of lists) {
    for (let i = l.length - 1; i >= 0 && qty > 0; i--) {
      const s = l[i];
      if (s.id !== id) continue;
      const take = Math.min(s.qty, qty);
      s.qty -= take;
      qty -= take;
      if (s.qty <= 0) l.splice(i, 1);
    }
  }
  return qty;
}

export function hasCost(lists, cost) {
  for (const [id, q] of Object.entries(cost)) if (countIn(lists, id) < q) return false;
  return true;
}

export function payCost(lists, cost) {
  for (const [id, q] of Object.entries(cost)) removeFrom(lists, id, q);
}

// ---- Contracts ------------------------------------------------------------

const CONTRACT_REWARDS = [
  { gunpowder: 2, scrap: 2 },
  { steel: 2, fasteners: 2 },
  { electronics: 1, glue: 2, tape: 1 },
  { leather: 2, cloth: 3 },
  { chemicals: 2, cloth: 2 },
  { medkit: 1 },
  { ammo_9mm: 12 },
  { ammo_12g: 6 },
  { mre: 1, bandage: 2 },
];

function rollOne(p, rng, kind) {
  if (kind === 'kills') {
    const n = rng.int(8, 16) + p.day;
    return { kind, target: n, progress: 0, text: `Put down ${n} walkers and make it back.`, reward: rng.pick(CONTRACT_REWARDS) };
  }
  if (kind === 'stabKills') {
    const n = rng.int(4, 8);
    return { kind, target: n, progress: 0, text: `Kill ${n} walkers with a blade through the skull.`, reward: rng.pick(CONTRACT_REWARDS) };
  }
  if (kind === 'deliver') {
    const id = rng.pick(['electronics', 'chemicals', 'steel', 'leather', 'fasteners', 'glue']);
    const n = rng.int(2, 4);
    return { kind, item: id, target: n, progress: 0, text: `Deliver ${n} ${def(id).name} to the galley.`, reward: rng.pick(CONTRACT_REWARDS) };
  }
  const z = rng.pick(ZONES.slice(1));
  return { kind: 'extract', zone: z.id, target: 1, progress: 0, text: `Extract from ${z.name}.`, reward: rng.pick(CONTRACT_REWARDS) };
}

const CONTRACT_KINDS = ['kills', 'stabKills', 'deliver', 'extract'];

export function rollContracts(p) {
  const rng = new RNG(p.day * 7919 + 17);
  p.contracts = CONTRACT_KINDS.map((k) => rollOne(p, rng, k));
  p.contractDay = p.day;
}

export function ensureContracts(p) {
  if (!p.contracts || p.contracts.length === 0) rollContracts(p);
}

// A new morning: claimed contracts are replaced; unfinished ones stay on the board.
export function refreshContracts(p) {
  ensureContracts(p);
  if (p.contractDay === p.day) return;
  const rng = new RNG(p.day * 7919 + 17);
  p.contracts = p.contracts.map((c) => (c.done ? rollOne(p, rng, c.kind) : c));
  p.contractDay = p.day;
}

export function applyRaidToContracts(p, raid) {
  for (const c of p.contracts) {
    if (c.done) continue;
    if (c.kind === 'kills') c.progress = Math.min(c.target, c.progress + raid.kills);
    if (c.kind === 'stabKills') c.progress = Math.min(c.target, c.progress + raid.stabKills);
    if (c.kind === 'extract' && raid.zone === c.zone) c.progress = 1;
  }
}

export function isMaterial(id) {
  return MATS.includes(id);
}
