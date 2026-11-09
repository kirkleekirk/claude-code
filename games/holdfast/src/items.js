// Everything you can carry: resources, four kinds of ammunition, eight guns
// and the odd thing a plan needs. Each survivor carries a pack (limited by
// weight); the camp keeps its own storage. The loot pool says what turns up
// where, and how rarely.

export const RES = {
  food: { name: 'Food', w: 1 }, meds: { name: 'Meds', w: 0.5 }, wood: { name: 'Wood', w: 1 },
  metal: { name: 'Metal', w: 1 }, stone: { name: 'Stone', w: 1.5 }, fuel: { name: 'Fuel', w: 1 },
};
export const AMMO = {
  '9mm': { name: '9mm', w: 0.01, box: [8, 24] },
  '12ga': { name: 'Shotgun shells', short: '12 ga', w: 0.03, box: [4, 10] },
  '5.56': { name: '5.56', w: 0.015, box: [10, 30] },
  '7.62': { name: '7.62', w: 0.025, box: [3, 8] },
};
// cls: how it's held (pistol: one or two hands close in; long: shouldered).
// dmg per pellet; rate: seconds between shots; spread: radians at the hip
// (aimed is a quarter); knock: pushes the dead back; scope: aim zoom.
export const GUNS = {
  1911: { name: '1911', full: '1911 pistol', ammo: '9mm', cls: 'pistol', mag: 8, dmg: 46, pellets: 1, rate: 0.24, auto: false, spread: 0.035, range: 45, reload: 1.3, noise: 60, w: 1, recoil: 0.5 },
  uzi: { name: 'Uzi', full: 'Uzi submachine gun', ammo: '9mm', cls: 'pistol', mag: 32, dmg: 22, pellets: 1, rate: 0.075, auto: true, spread: 0.07, range: 35, reload: 1.8, noise: 65, w: 2, recoil: 0.22 },
  pump: { name: 'Pump shotgun', full: 'Pump-action shotgun', ammo: '12ga', cls: 'long', mag: 6, dmg: 17, pellets: 9, rate: 0.8, auto: false, spread: 0.11, range: 22, reload: 2.8, noise: 85, w: 3.5, recoil: 1.2, knock: 1 },
  sweeper: { name: 'Streetsweeper', full: 'Streetsweeper drum shotgun', ammo: '12ga', cls: 'long', mag: 12, dmg: 15, pellets: 9, rate: 0.2, auto: true, spread: 0.13, range: 18, reload: 3.4, noise: 90, w: 4.5, recoil: 0.85, knock: 1 },
  m4: { name: 'M4', full: 'M4 carbine', ammo: '5.56', cls: 'long', mag: 30, dmg: 34, pellets: 1, rate: 0.09, auto: true, spread: 0.04, range: 80, reload: 2.2, noise: 80, w: 3, recoil: 0.3 },
  ak: { name: 'AK', full: 'AK rifle', ammo: '5.56', cls: 'long', mag: 30, dmg: 38, pellets: 1, rate: 0.105, auto: true, spread: 0.055, range: 75, reload: 2.4, noise: 85, w: 3.5, recoil: 0.38 },
  scout: { name: 'Scout rifle', full: 'Scout bolt-action rifle', ammo: '7.62', cls: 'long', mag: 5, dmg: 150, pellets: 1, rate: 0.85, auto: false, spread: 0.02, range: 110, reload: 2.0, noise: 90, w: 2.2, recoil: 0.9, quick: true },
  long: { name: 'Long rifle', full: 'Long-range rifle', ammo: '7.62', cls: 'long', mag: 5, dmg: 240, pellets: 1, rate: 1.35, auto: false, spread: 0.03, range: 220, reload: 3.0, noise: 100, w: 5, recoil: 1.3, scope: 4.5 },
};
export const ITEMS = {
  kit: { name: 'Claim kit', w: 2 }, sedatives: { name: 'Sedatives', w: 0.2 }, liquor: { name: 'Whiskey', w: 1 }, seeds: { name: 'Seed stock', w: 1 },
};
export const GUN_ORDER = ['1911', 'uzi', 'pump', 'sweeper', 'm4', 'ak', 'scout', 'long'];

// ---------------- a survivor's pack ----------------
export class Pack {
  constructor(cap = 26) { this.cap = cap; this.res = {}; this.ammo = {}; this.items = {}; this.guns = []; }
  weight() {
    let w = 0;
    for (const k in this.res) w += (this.res[k] || 0) * RES[k].w;
    for (const k in this.ammo) w += (this.ammo[k] || 0) * AMMO[k].w;
    for (const k in this.items) w += (this.items[k] || 0) * (ITEMS[k] ? ITEMS[k].w : 1);
    for (const g of this.guns) w += GUNS[g.id].w;
    return w;
  }
  room() { return Math.max(0, this.cap - this.weight()); }
  count(kind, id) { return kind === 'gun' ? this.guns.filter((g) => g.id === id).length : (this.bag(kind)[id] || 0); }
  bag(kind) { return kind === 'res' ? this.res : kind === 'ammo' ? this.ammo : this.items; }
  unitW(kind, id) { return kind === 'res' ? RES[id].w : kind === 'ammo' ? AMMO[id].w : kind === 'gun' ? GUNS[id].w : (ITEMS[id] ? ITEMS[id].w : 1); }
  // add up to n; returns how many fit
  add(kind, id, n = 1, extra = {}) {
    const fit = Math.min(n, Math.floor(this.room() / this.unitW(kind, id) + 1e-6));
    if (fit <= 0) return 0;
    if (kind === 'gun') { for (let i = 0; i < fit; i++) this.guns.push({ id, mag: extra.mag ?? 0 }); return fit; }
    const b = this.bag(kind); b[id] = (b[id] || 0) + fit;
    return fit;
  }
  take(kind, id, n = 1) {
    if (kind === 'gun') { const i = this.guns.findIndex((g) => g.id === id); if (i < 0) return null; return this.guns.splice(i, 1)[0]; }
    const b = this.bag(kind), t = Math.min(n, b[id] || 0);
    b[id] = (b[id] || 0) - t;
    if (!b[id]) delete b[id];
    return t;
  }
  isEmpty() { return !this.guns.length && ![this.res, this.ammo, this.items].some((b) => Object.values(b).some((v) => v > 0)); }
  toJSON() { return { cap: this.cap, res: this.res, ammo: this.ammo, items: this.items, guns: this.guns }; }
  load(j) { if (!j) return this; this.cap = j.cap || this.cap; Object.assign(this.res, j.res || {}); Object.assign(this.ammo, j.ammo || {}); Object.assign(this.items, j.items || {}); this.guns = (j.guns || []).filter((g) => GUNS[g.id]); return this; }
}

// ---------------- the camp's storage ----------------
export const START_RES = { wood: 30, metal: 12, stone: 12, food: 3, meds: 2, fuel: 0 };
export class Storage {
  constructor() {
    this.res = { ...START_RES };
    this.ammo = {};
    this.guns = {}; // id -> [mag, mag, ...]
    this.items = {};
    this.claimKits = 1;
  }
  // building and camp upkeep pay in resources
  can(cost) { for (const k in cost) if ((this.res[k] || 0) < cost[k]) return false; return true; }
  pay(cost) { if (!this.can(cost)) return false; for (const k in cost) this.res[k] -= cost[k]; return true; }
  add(res) {
    for (const k in res) {
      if (k === 'ammo') { const t = ['9mm', '9mm', '12ga', '5.56', '7.62'][Math.floor(Math.random() * 5)]; this.ammo[t] = (this.ammo[t] || 0) + res[k] * 4; continue; }
      if (AMMO[k]) { this.ammo[k] = (this.ammo[k] || 0) + res[k]; continue; }
      this.res[k] = (this.res[k] || 0) + res[k];
    }
  }
  count(kind, id) { return kind === 'gun' ? (this.guns[id] || []).length : ((kind === 'res' ? this.res : kind === 'ammo' ? this.ammo : this.items)[id] || 0); }
  put(kind, id, n = 1, extra = {}) {
    if (kind === 'gun') { for (let i = 0; i < n; i++) (this.guns[id] || (this.guns[id] = [])).push(extra.mag ?? 0); return; }
    if (kind === 'item' && id === 'kit') { this.claimKits += n; return; }
    const b = kind === 'res' ? this.res : kind === 'ammo' ? this.ammo : this.items;
    b[id] = (b[id] || 0) + n;
  }
  take(kind, id, n = 1) {
    if (kind === 'gun') { const l = this.guns[id]; if (!l || !l.length) return null; const mag = l.pop(); if (!l.length) delete this.guns[id]; return { id, mag }; }
    if (kind === 'item' && id === 'kit') { const t = Math.min(n, this.claimKits); this.claimKits -= t; return t; }
    const b = kind === 'res' ? this.res : kind === 'ammo' ? this.ammo : this.items;
    const t = Math.min(n, b[id] || 0);
    b[id] = (b[id] || 0) - t;
    return t;
  }
  // legacy views kept for older code paths
  get weapons() { return { bat: true, pistol: this.count('gun', '1911') > 0 }; }
  toJSON() { return { v: 2, res: this.res, ammo: this.ammo, guns: this.guns, items: this.items, claimKits: this.claimKits }; }
  load(j) {
    if (!j) return;
    Object.assign(this.res, j.res || {});
    this.claimKits = j.claimKits ?? this.claimKits;
    Object.assign(this.items, j.items || {});
    if (j.v === 2) { Object.assign(this.ammo, j.ammo || {}); for (const [k, l] of Object.entries(j.guns || {})) if (GUNS[k]) this.guns[k] = l; }
    else {
      // an older save: one ammo count and maybe a pistol
      if (this.res.ammo) { this.ammo['9mm'] = (this.ammo['9mm'] || 0) + this.res.ammo; }
      if (j.weapons && j.weapons.pistol) this.legacyPistol = true;
    }
    delete this.res.ammo;
  }
}

// ---------------- the loot pool ----------------
// [kind, id, min, max, chance]; ammo with 0,0 means "a box" (AMMO.box)
const L = (kind, id, a, b, p) => [kind, id, a, b, p];
const TABLES = {
  kitchen: [L('res', 'food', 1, 4, 0.75), L('res', 'meds', 1, 1, 0.08), L('res', 'fuel', 1, 1, 0.06), L('ammo', '9mm', 0, 0, 0.04)],
  fridge: [L('res', 'food', 1, 3, 0.6)],
  bedroom: [L('res', 'meds', 1, 1, 0.25), L('ammo', '9mm', 0, 0, 0.16), L('ammo', '12ga', 0, 0, 0.07), L('ammo', '7.62', 0, 0, 0.04), L('res', 'wood', 1, 2, 0.2),
    L('gun', '1911', 1, 1, 0.035), L('gun', 'pump', 1, 1, 0.015), L('gun', 'scout', 1, 1, 0.01), L('gun', 'long', 1, 1, 0.003), L('item', 'kit', 1, 1, 0.03)],
  meds: [L('res', 'meds', 1, 2, 0.6), L('res', 'food', 1, 1, 0.1)],
  office: [L('ammo', '9mm', 0, 0, 0.13), L('res', 'meds', 1, 1, 0.2), L('res', 'metal', 1, 2, 0.25), L('gun', '1911', 1, 1, 0.02), L('item', 'kit', 1, 1, 0.04)],
  store: [L('res', 'food', 2, 5, 0.65), L('res', 'meds', 1, 2, 0.15), L('res', 'wood', 1, 2, 0.15), L('ammo', '12ga', 0, 0, 0.05)],
  hardware: [L('res', 'metal', 2, 5, 0.7), L('res', 'wood', 2, 4, 0.5), L('res', 'stone', 1, 3, 0.35), L('res', 'fuel', 1, 1, 0.15), L('ammo', '12ga', 0, 0, 0.08)],
  register: [L('ammo', '9mm', 0, 0, 0.3), L('gun', '1911', 1, 1, 0.06), L('gun', 'uzi', 1, 1, 0.01)],
  bar: [L('res', 'food', 1, 3, 0.5), L('res', 'fuel', 1, 2, 0.3), L('ammo', '12ga', 0, 0, 0.1), L('gun', 'pump', 1, 1, 0.025)],
  laundry: [L('res', 'meds', 1, 1, 0.12), L('res', 'wood', 1, 1, 0.2)],
  garage: [L('res', 'metal', 2, 4, 0.6), L('res', 'wood', 1, 3, 0.5), L('res', 'fuel', 1, 2, 0.35), L('ammo', '12ga', 0, 0, 0.12), L('gun', 'pump', 1, 1, 0.03)],
  workshop: [L('res', 'metal', 2, 5, 0.7), L('res', 'wood', 1, 3, 0.4), L('res', 'stone', 1, 2, 0.2), L('ammo', '7.62', 0, 0, 0.06), L('gun', 'scout', 1, 1, 0.02)],
  crate: [L('res', 'wood', 2, 5, 0.6), L('res', 'metal', 1, 3, 0.4), L('res', 'food', 1, 2, 0.25), L('res', 'stone', 1, 2, 0.2), L('ammo', '12ga', 0, 0, 0.05)],
  fuel: [L('res', 'fuel', 2, 4, 0.8)],
  car: [L('res', 'fuel', 1, 2, 0.6), L('res', 'metal', 1, 2, 0.4), L('ammo', '9mm', 0, 0, 0.1), L('res', 'food', 1, 1, 0.2), L('gun', '1911', 1, 1, 0.015)],
  truck: [L('res', 'fuel', 1, 3, 0.6), L('res', 'metal', 2, 3, 0.5), L('res', 'wood', 1, 3, 0.3), L('ammo', '9mm', 0, 0, 0.1), L('ammo', '5.56', 0, 0, 0.05), L('ammo', '12ga', 0, 0, 0.08), L('gun', 'pump', 1, 1, 0.02), L('gun', 'm4', 1, 1, 0.008)],
  // caches survivors know about
  food_cache: [L('res', 'food', 6, 10, 1), L('res', 'meds', 1, 1, 0.3), L('res', 'fuel', 1, 2, 0.2)],
  seed_cache: [L('res', 'food', 3, 5, 1), L('item', 'seeds', 1, 1, 1)],
  med_cache: [L('res', 'meds', 4, 6, 1), L('res', 'food', 1, 2, 0.5)],
  fuel_cache: [L('res', 'fuel', 4, 8, 1), L('res', 'metal', 2, 4, 0.7)],
  build_cache: [L('res', 'wood', 10, 16, 1), L('res', 'metal', 5, 8, 1), L('res', 'stone', 4, 6, 0.8)],
  gun_cache: [L('ammo', '7.62', 0, 0, 1), L('ammo', '7.62', 0, 0, 0.6), L('gun', 'scout', 1, 1, 0.7), L('gun', 'long', 1, 1, 0.15), L('ammo', '12ga', 0, 0, 0.5), L('gun', 'sweeper', 1, 1, 0.06), L('gun', '1911', 1, 1, 0.4), L('ammo', '9mm', 0, 0, 0.6), L('res', 'food', 2, 3, 0.6)],
  mixed_cache: [L('res', 'food', 3, 5, 1), L('res', 'meds', 2, 3, 1), L('ammo', '9mm', 0, 0, 0.8), L('ammo', '5.56', 0, 0, 0.3), L('res', 'fuel', 1, 2, 0.6)],
  liquor_cache: [L('res', 'food', 1, 2, 0.6), L('res', 'fuel', 1, 1, 0.3)],
  // what raiders keep, carry and haul
  raider_stash: [L('res', 'food', 6, 12, 1), L('res', 'meds', 2, 4, 0.9), L('ammo', '5.56', 0, 0, 1), L('ammo', '5.56', 0, 0, 0.7), L('ammo', '9mm', 0, 0, 0.9), L('ammo', '12ga', 0, 0, 0.6),
    L('res', 'metal', 4, 8, 0.8), L('res', 'fuel', 2, 5, 0.8), L('gun', 'ak', 1, 1, 0.3), L('gun', 'm4', 1, 1, 0.18), L('gun', 'uzi', 1, 1, 0.15), L('gun', 'sweeper', 1, 1, 0.06), L('item', 'kit', 1, 1, 0.3)],
  raider_body: [L('ammo', '9mm', 0, 0, 0.35), L('ammo', '5.56', 0, 0, 0.25), L('ammo', '12ga', 0, 0, 0.2), L('res', 'food', 1, 1, 0.3), L('res', 'meds', 1, 1, 0.2)],
  supply_run: [L('res', 'food', 3, 6, 1), L('ammo', '5.56', 0, 0, 0.8), L('ammo', '9mm', 0, 0, 0.6), L('res', 'meds', 1, 2, 0.5), L('res', 'fuel', 1, 2, 0.5), L('gun', 'ak', 1, 1, 0.12)],
};
export function lootTable(t) { return TABLES[t] || TABLES.crate; }

// How picked-over the county is (chosen on the survivor screen). Applies to
// what's lying around in houses, shops, cars and on bodies; caches someone
// told you about and raider stashes are what they are.
export const SCARCITY = {
  plenty: { name: 'Plentiful', chance: 1, empty: 0.05, box: 1, desc: 'Most cupboards still have something in them.' },
  scarce: { name: 'Scarce', chance: 0.62, empty: 0.25, box: 0.75, desc: 'A lot of places have been picked over. Ammo is precious.' },
  desperate: { name: 'Desperate', chance: 0.42, empty: 0.4, box: 0.6, desc: 'Nearly everything is gone. Every can counts.' },
};
let scarce = SCARCITY.scarce;
export function setScarcity(level) { scarce = SCARCITY[level] || SCARCITY.scarce; }
const KEPT = new Set(['food_cache', 'seed_cache', 'med_cache', 'fuel_cache', 'build_cache', 'gun_cache', 'mixed_cache', 'liquor_cache', 'raider_stash']);
// what you start with at camp, by how scarce things are
export const START_BY = {
  plenty: { wood: 30, metal: 12, stone: 12, food: 3, meds: 2, fuel: 0 },
  scarce: { wood: 20, metal: 7, stone: 7, food: 2, meds: 1, fuel: 0 },
  desperate: { wood: 12, metal: 4, stone: 4, food: 1, meds: 0, fuel: 0 },
};

// what a search turns up: [{ kind, id, n, mag }]
export function rollLoot(table, luck = 1) {
  const out = [], world = !KEPT.has(table), sc = world ? scarce : SCARCITY.plenty;
  // somebody got here first
  if (world && Math.random() < sc.empty / Math.max(0.6, luck)) return out;
  for (const [kind, id, a, b, p] of lootTable(table)) {
    if (Math.random() > p * luck * sc.chance) continue;
    if (kind === 'ammo') {
      const [lo, hi] = a || b ? [a, b] : AMMO[id].box;
      out.push({ kind, id, n: Math.max(1, Math.round((lo + Math.floor(Math.random() * (hi - lo + 1))) * sc.box)) });
    } else if (kind === 'gun') out.push({ kind, id, n: 1, mag: Math.floor(Math.random() * (GUNS[id].mag + 1) * 0.7) });
    else out.push({ kind, id, n: a + Math.floor(Math.random() * (b - a + 1)) });
  }
  // the same ammo twice in one search is one bigger box
  const merged = [];
  for (const e of out) { const m = e.kind === 'ammo' && merged.find((x) => x.kind === 'ammo' && x.id === e.id); if (m) m.n += e.n; else merged.push(e); }
  return merged;
}
// "4 Wood, 2 Fuel, 7 shotgun shells" from a tally of { 'kind:id': n }
export function tallyText(tally, max = 6) {
  const parts = Object.entries(tally).filter(([, n]) => n > 0).map(([k, n]) => { const [kind, id] = k.split(':'); return itemName(kind, id, n); });
  return parts.length > max ? parts.slice(0, max).join(', ') + ' and more' : parts.join(', ');
}
export function itemName(kind, id, n = 1) {
  if (kind === 'res') return `${n} ${RES[id].name}`;
  if (kind === 'ammo') return id === '12ga' ? `${n} shotgun shell${n === 1 ? '' : 's'}` : `${n} ${AMMO[id].name} round${n === 1 ? '' : 's'}`;
  if (kind === 'gun') return n > 1 ? `${n} ${GUNS[id].name}s` : `a${/^[aeiou]/i.test(GUNS[id].name) ? 'n' : ''} ${GUNS[id].name}`;
  return n > 1 ? `${n} ${ITEMS[id].name}` : ITEMS[id] ? ITEMS[id].name : id;
}

// small inline icons for the pack screen
export const ICONS = {
  food: '<path d="M7 3v8a3 3 0 0 0 2 2.8V21h2v-7.2A3 3 0 0 0 13 11V3h-1.5v6h-1V3h-1v6h-1V3zM17 3c-1.7 0-3 2-3 5v5h2v8h2V3z"/>',
  meds: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  wood: '<path d="M3 15l12-9 3 3-12 9zm14-7l2-2 2 2-2 2zM4 19h16v2H4z"/>',
  metal: '<path d="M4 7l8-4 8 4v10l-8 4-8-4zm8 2l-5-2.5V15l5 2.5zm1 8.5l5-2.5V6.5L13 9z"/>',
  stone: '<path d="M4 16l3-8 6-3 6 5 1 8-8 2z"/>',
  fuel: '<path d="M6 3h8l2 2v16H4V5zm2 3v4h6V6zm9 2h2l1 2v9a2 2 0 0 1-4 0v-3h1v3a1 1 0 0 0 2 0v-8l-1-1h-1z"/>',
  ammo: '<path d="M7 9l2-6 2 6v12H7zm6 0l2-6 2 6v12h-4z"/>',
  gun: '<path d="M2 9h16l2-2h2v4h-6l-1 2h-3l-1 4H7l1-4H2z"/>',
  item: '<path d="M5 7h14l-1 14H6zm4-4h6v3H9z"/>',
};
