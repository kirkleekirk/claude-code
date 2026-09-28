// Persistent player profile: stash, loadout, backpack, benches, contracts.
// Saved to localStorage; every access is guarded because storage can be
// unavailable (private windows, sandboxed frames).

import { makeItem, def, MATS, ITEMS } from '../data/items.js';
import { PACK_BASE, PACK_STEP } from '../data/recipes.js';
import { ZONES } from '../data/zones.js';
import { RNG } from '../core/rng.js';
import { newStory } from '../data/story.js';

const SAVE_KEY = 'lasttoll.save.v1';
export const STASH_CAP = 60;

export function newProfile() {
  const zip = makeItem('zip_pistol', 1, { loaded: 1, dur: 50 });
  return {
    version: 2,
    day: 1,
    health: 88,
    nourishment: 70,
    stats: { raids: 0, extracted: 0, deaths: 0, kills: 0, headKills: 0, stabKills: 0 },
    stash: [
      makeItem('ammo_38', 8),
      makeItem('cloth', 4),
      makeItem('scrap', 5),
      makeItem('tape', 3),
      makeItem('fasteners', 2),
      makeItem('glue', 1),
      makeItem('beans', 2),
      makeItem('rice', 1),
      makeItem('gunpowder', 1),
    ],
    loadout: { knife: makeItem('screwdriver'), melee: null, sidearm: zip, long: null },
    backpack: [makeItem('bandage', 2), makeItem('ammo_38', 6), makeItem('soda', 1)],
    stations: { workshop: 1, reloading: 1, infirmary: 1, galley: 1, gunsmith: 1 },
    parts: {}, // removed mods waiting in the gunsmith's drawer: { modId: count }
    packLevel: 0,
    contracts: [],
    contractDay: 0,
    lastZone: 'cypress',
    lastResult: null,
    story: newStory(),
    settings: { sens: 1, volume: 0.8, fov: 68, invertY: false, voices: true },
  };
}

// Bring an older save up to date: benches became stations, guns gained mod slots,
// and the old screw-on suppressor became a gunsmith mod.
function migrate(p) {
  if (p.version === 1) {
    const b = p.benches || {};
    p.stations = { workshop: b.weapon || 1, reloading: b.ammo || 1, infirmary: b.med || 1, galley: b.kitchen || 1, gunsmith: 1 };
    delete p.benches;
    p.version = 2;
  }
  p.parts = p.parts || {};
  const fix = (it) => {
    if (!it) return;
    const d = ITEMS[it.id];
    if (!d || d.kind !== 'gun') return;
    it.mods = it.mods || {};
    if (it.sup) {
      if (d.family === 'pistol' && !it.mods.muzzle) it.mods.muzzle = 'pistol_sup';
      else p.stash.push(makeItem('suppressor'));
      delete it.sup;
    }
  };
  for (const it of p.stash) fix(it);
  for (const it of p.backpack) fix(it);
  for (const k of Object.keys(p.loadout)) fix(p.loadout[k]);
  // drop anything the catalogue no longer knows
  const known = (it) => it && ITEMS[it.id];
  p.stash = p.stash.filter(known);
  p.backpack = p.backpack.filter(known);
  for (const k of Object.keys(p.loadout)) if (p.loadout[k] && !known(p.loadout[k])) p.loadout[k] = null;
  return p;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || (p.version !== 1 && p.version !== 2)) return null;
    migrate(p);
    const base = newProfile();
    p.settings = { ...base.settings, ...(p.settings || {}) };
    p.stats = { ...base.stats, ...(p.stats || {}) };
    p.stations = { ...base.stations, ...(p.stations || {}) };
    p.story = { ...base.story, ...(p.story || {}) };
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

// Work out how to pay a cost, breaking salvage down into components where the
// materials on hand fall short. Returns { ok, scrap: {junkId: n}, short: {id: n}, fromSalvage: {id: n} }.
export function planCost(lists, cost) {
  const cnt = {};
  for (const l of lists) for (const s of l) if (s) cnt[s.id] = (cnt[s.id] || 0) + s.qty;
  const scrap = {}, short = {}, fromSalvage = {};
  // things asked for by name (including salvage) are set aside first
  const entries = Object.entries(cost).sort(([a], [b]) => (MATS.includes(a) ? 1 : 0) - (MATS.includes(b) ? 1 : 0));
  // keycards open lockers; the bench never breaks one down on its own
  const junk = Object.keys(ITEMS).filter((id) => ITEMS[id].yields && !ITEMS[id].keep);
  for (const [id, q] of entries) {
    let need = q;
    const take = Math.min(cnt[id] || 0, need);
    cnt[id] = (cnt[id] || 0) - take;
    need -= take;
    if (need > 0 && MATS.includes(id)) {
      const sources = junk.filter((j) => (cnt[j] || 0) > 0 && ITEMS[j].yields[id]).sort((a, b) => ITEMS[b].yields[id] - ITEMS[a].yields[id]);
      for (const j of sources) {
        while (need > 0 && cnt[j] > 0) {
          cnt[j]--;
          scrap[j] = (scrap[j] || 0) + 1;
          for (const [k, v] of Object.entries(ITEMS[j].yields)) cnt[k] = (cnt[k] || 0) + v;
          const got = Math.min(cnt[id], need);
          cnt[id] -= got;
          need -= got;
          fromSalvage[id] = (fromSalvage[id] || 0) + got;
        }
        if (need <= 0) break;
      }
    }
    if (need > 0) short[id] = need;
  }
  return { ok: Object.keys(short).length === 0, scrap, short, fromSalvage };
}

// Pay a cost, scrapping salvage as planned. `give` puts the byproducts somewhere.
export function payWithSalvage(lists, cost, give) {
  const plan = planCost(lists, cost);
  if (!plan.ok) return false;
  for (const [j, n] of Object.entries(plan.scrap)) {
    removeFrom(lists, j, n);
    for (const [k, v] of Object.entries(ITEMS[j].yields)) give(makeItem(k, v * n));
  }
  payCost(lists, cost);
  return true;
}

// ---- Contracts ------------------------------------------------------------

const CONTRACT_REWARDS = [
  { gunpowder: 2, scrap: 2 },
  { steel: 2, fasteners: 2 },
  { electronics: 1, glue: 2, tape: 1 },
  { leather: 2, cloth: 3 },
  { chemicals: 2, cloth: 2 },
  { medkit: 1 },
  { ammo_38: 12 },
  { ammo_12g: 6 },
  { arrow: 8 },
  { steel: 1, electronics: 1, glue: 1 },
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
