// Markets: demand, saturation, prices (with a math breakdown for tooltips), selling and buying.
import { PLACE, MARKET_IDS } from '../data/places.js';
import { PACKS, QUALITY, STRAINS } from '../data/strains.js';
import { BP, FAMILIES, GRADES, MATERIALS, AMMO } from '../data/guns.js';
import { itemInfo, STATIC_ITEMS } from '../data/items.js';
import { TRADE_RANK } from '../data/progress.js';
import { count, addItem, takeItem } from './inventory.js';
import { earn, spend, canAfford, log, fx, stat, addRep, hasPerk, D, rank, isDay, marketOpen } from './state.js';
import { addHeat } from './heat.js';

// Per-town market profile: daily demand (units), price factors, what the town sells.
export const MARKET = {
  millbrook: { weed: 28, shine: 12, gun: 1.0, ammo: 80, loot: 3, weedPrice: 0.95, drugHeat: 1.0, sells: { 'seed:dust_devil': 1, 'seed:ashleaf': 1, compost: 0.9, grain: 0.8, timber: 0.9, fuel: 1.1, scrap: 1.2 } },
  coppergate: { weed: 40, shine: 16, gun: 4.0, ammo: 220, loot: 6, weedPrice: 1.0, drugHeat: 1.0, gunBonus: 1.2, sells: { scrap: 0.85, iron: 0.9, brass: 0.85, propellant: 0.9, spring: 0.9, 'ammo:light': 1, 'ammo:medium': 1, 'ammo:shell': 1, lockpick: 1, repairkit: 1, medkit: 1.1 } },
  harbor9: { weed: 50, shine: 22, gun: 2.0, ammo: 120, loot: 8, weedPrice: 1.05, drugHeat: 1.0, bulk: true, sells: { polymer: 0.85, timber: 0.95, fuel: 0.85, 'seed:glowvine': 1, brass: 1.0, medkit: 1.0, 'ammo:bolt': 1 } },
  stverity: { weed: 10, shine: 4, gun: 1.2, ammo: 60, loot: 8, weedPrice: 1.6, drugHeat: 3.0, relicBonus: 1.5, sells: { compost: 0.8, grain: 0.8, medkit: 0.85, 'seed:rail_rose': 1.1, timber: 1.0 } },
  foundry: { weed: 42, shine: 18, gun: 3.0, ammo: 240, loot: 5, weedPrice: 1.05, drugHeat: 1.2, gunBonus: 1.1, sells: { iron: 0.75, steel: 0.8, alloy: 1.15, spring: 0.8, brass: 0.8, propellant: 0.85, fuel: 0.8, scrap: 0.9, 'ammo:heavy': 1, 'ammo:medium': 0.95, boltcutter: 1, repairkit: 0.9 } },
  newhaven: { weed: 60, shine: 20, gun: 2.5, ammo: 150, loot: 10, weedPrice: 1.25, drugHeat: 1.6, sells: { polymer: 0.95, steel: 1.0, medkit: 1.0, electronics: 1.4, 'seed:marrow_kush': 1.1, repairkit: 1.0 } },
  crossroads: { weed: 34, shine: 14, gun: 2.0, ammo: 100, loot: 6, weedPrice: 0.9, drugHeat: 0, bulk: true, sells: { scrap: 1.0, timber: 1.0, fuel: 1.0, compost: 1.0, molotov: 1, pipebomb: 1, caltrops: 1, smokepot: 1, lockpick: 1.05, medkit: 1.1, 'seed:dust_devil': 1.1, 'seed:ashleaf': 1.1, 'seed:rail_rose': 1.15, 'seed:glowvine': 1.15, 'seed:marrow_kush': 1.15 } },
};

export const BLUEPRINT_SHOP = { rustlers_lever: 600, rattler: 700, pump_gutter: 650, whisper: 800, needle: 2200, ironclad: 2000, quiet_hand: 1900, hailstorm: 6000, warden_breaker: 7500 };

export const sat = (S, town, cat) => S.markets[town].sat[cat] || 0;
const mod = (S, town, cat) => S.markets[town].mods.filter((m) => m.cat === cat || m.cat === 'all').reduce((a, m) => a + m.mod, 0);

export function tradeAllowed(S, town) {
  return rank(S) >= (TRADE_RANK[town] ?? 0) || S.towns[town]?.occupied;
}

export function demandOf(S, town, cat) {
  const M = MARKET[town];
  let base = cat === 'weed' ? M.weed : cat === 'shine' ? M.shine : cat.startsWith('gun') ? M.gun : cat === 'ammo' ? M.ammo : cat === 'loot' ? M.loot : 10;
  const T = S.towns[town];
  if (T) {
    if (T.status === 'devastated') base *= 0.45;
    else if (T.status === 'alarmed') base *= 0.85;
    if (T.occupied) base *= 1.15;
    base *= 0.7 + 0.3 * (T.wealth / (PLACE[town].wealth || 100));
  }
  for (const b of S.businesses) if (b.town === town && b.type === 'tradepost') base *= 1.15;
  return Math.max(1, base);
}

// Weed price for one pack, with a step-by-step breakdown.
export function weedPrice(S, town, strain, q, form, hustle = 0, opts = {}) {
  const M = MARKET[town];
  const pk = PACKS[form];
  const qm = QUALITY[q].mult;
  const s = Math.min(1, sat(S, town, 'weed'));
  const em = mod(S, town, 'weed');
  const legendary = STRAINS[strain] && STRAINS[strain].legendary ? 1.5 : 1;
  const perk = hasPerk(S, 'op_tongue') ? 1.06 : 1;
  const bulk = opts.bulk ? (opts.bulkMult || 0.7) : 1;
  const satF = opts.bulk ? 1 - 0.3 * Math.min(1, sat(S, town, 'bulk')) : 1 - 0.6 * s;
  const reg = opts.regular || 1;
  const price = pk.base * qm * satF * (1 + em) * (1 + 0.03 * hustle) * M.weedPrice * legendary * perk * D(S).price * bulk * reg;
  const lines = [
    `!h${pk.name} of ${QUALITY[q].name} @ ${PLACE[town].name}`,
    `Base $${pk.base} x quality ${qm}`,
    opts.bulk ? `x bulk discount ${bulk} (no heat)` : `x (1 - 0.6 x sat ${s.toFixed(2)}) = ${satF.toFixed(2)}`,
    `x (1 + event ${em >= 0 ? '+' : ''}${em.toFixed(2)})`,
    `x (1 + 0.03 x hustle ${hustle})`,
    `x town ${M.weedPrice}${legendary > 1 ? ' x legendary 1.5' : ''}${perk > 1 ? ' x Silver Tongue 1.06' : ''}${reg > 1 ? ' x regular ' + reg.toFixed(2) : ''}${D(S).price !== 1 ? ' x difficulty ' + D(S).price : ''}`,
    `!y= $${price.toFixed(2)}`,
  ];
  return { price: Math.max(0.5, price), lines };
}

export function satGain(S, town, cat, units) {
  return 0.5 * units / demandOf(S, town, cat) * (hasPerk(S, 'op_market') ? 0.8 : 1);
}

export function bumpSat(S, town, cat, units) {
  const m = S.markets[town];
  m.sat[cat] = Math.min(1.2, (m.sat[cat] || 0) + satGain(S, town, cat, units));
}

export function streetHeatPerUnit(S, town, stealth = 0) {
  const M = MARKET[town];
  let v = 0.2 * M.drugHeat * D(S).heat * (isDay(S) ? 1 : 0.7) * Math.max(0.4, 1 - 0.06 * stealth);
  if (S.businesses.some((b) => b.town === town && b.type === 'garage')) v *= 0.7;
  if (S.businesses.some((b) => b.town === town && b.backroom === 'dist')) v *= 0.8;
  return v;
}

// Sell `n` packs of `key` (pack:strain:q:form) on the street in `town`. Returns {ok, total, units, msg}.
export function sellPacks(S, town, key, n, seller = { hustle: 0, stealth: 0, who: 'you' }, opts = {}) {
  if (!marketOpen(S, town) && !opts.ignoreHours) return { ok: false, msg: 'Market is closed (07:00-20:00).' };
  if (S.laylow > 0 && !opts.bulk) return { ok: false, msg: "You're laying low. No street deals." };
  if (!tradeAllowed(S, town)) return { ok: false, msg: `${PLACE[town].name} won't trade with nobodies yet.` };
  const [, strain, q, form] = key.split(':');
  const pk = PACKS[form];
  let total = 0, units = 0, sold = 0;
  for (let i = 0; i < n; i++) {
    if (!takeItem(S, key, 1)) break;
    const { price } = weedPrice(S, town, strain, +q, form, seller.hustle, opts);
    total += price;
    units += pk.units;
    sold++;
    bumpSat(S, town, opts.bulk ? 'bulk' : 'weed', pk.units * (opts.bulk ? 0.3 : 1));
  }
  if (!sold) return { ok: false, msg: 'Nothing to sell.' };
  const where = opts.toStash ? 'dirty' : seller.who === 'you' ? 'carried' : 'dirty';
  earn(S, where, total, opts.bulk ? 'bulk' : seller.who === 'you' ? 'street' : 'dealers');
  stat(S, 'unitsSold', units);
  stat(S, 'weedRevenue', total);
  if (!opts.bulk) {
    const h = units * streetHeatPerUnit(S, town, seller.stealth);
    addHeat(S, town, h, 'street sales', { quiet: true });
    addRep(S, units * 0.15, null, 'sales');
  } else addRep(S, units * 0.05, null, 'sales');
  if (seller.who === 'you') fx(S, 'sale', { amount: total, town });
  return { ok: true, total, units, sold, msg: `Sold ${sold} ${pk.name.toLowerCase()}${sold > 1 ? 's' : ''} for $${Math.round(total)}` };
}

// ---------- named regulars ----------
export function regularPrice(S, reg, key) {
  const [, strain, q, form] = key.split(':');
  const match = strain === reg.likes && form === reg.form && +q >= reg.minQ;
  const mult = 1 + reg.premium * (match ? 1 : 0.3) + reg.loyalty / 300;
  return { ...weedPrice(S, reg.town, strain, +q, form, 0, { regular: mult }), match };
}

export function sellToRegular(S, regId, key, n = 1) {
  const reg = S.regulars.find((r) => r.id === regId);
  if (!reg) return { ok: false, msg: 'Gone.' };
  if (!key.startsWith('pack:')) return { ok: false, msg: 'They only buy packed product.' };
  if (S.laylow > 0) return { ok: false, msg: "You're laying low." };
  let total = 0, sold = 0, units = 0;
  const pk = PACKS[key.split(':')[3]];
  for (let i = 0; i < n; i++) {
    if (reg.bought + pk.units > reg.budget) break;
    if (!takeItem(S, key, 1)) break;
    const { price, match } = regularPrice(S, reg, key);
    total += price; sold++; units += pk.units; reg.bought += pk.units;
    reg.loyalty = Math.min(100, reg.loyalty + (match ? 4 : 1));
  }
  if (!sold) return { ok: false, msg: reg.bought >= reg.budget ? reg.name + ' has bought enough today.' : 'Nothing to sell.' };
  earn(S, 'carried', total, 'regulars');
  if (reg.town !== 'crossroads') addHeat(S, reg.town, units * streetHeatPerUnit(S, reg.town) * 0.5, 'regular', { quiet: true });
  addRep(S, units * 0.2, null, 'sales');
  stat(S, 'unitsSold', units);
  if (reg.loyalty >= 50 && reg.gifts === 0) { reg.gifts = 1; const s = reg.likes; addItem(S, 'seed:' + s, 3); S.strains.known[s] = true; log(S, reg.name + ' gave you 3 ' + STRAINS[s].name + ' seeds. "For a friend."', 'good'); }
  if (reg.loyalty >= 100 && reg.gifts === 1) { reg.gifts = 2; S.tips.push({ day: S.day, town: reg.town === 'crossroads' ? 'millbrook' : reg.town, src: 'regular' }); S.favors += 1; log(S, reg.name + ' owes you: +1 favor and a tip-off for the Job Board.', 'good'); }
  fx(S, 'sale', { amount: total, town: reg.town });
  return { ok: true, total, msg: reg.name + ' paid $' + Math.round(total) + '.' };
}

export function regularsDaily(S) { for (const r of S.regulars) r.bought = 0; }

// ---------- guns ----------
export function compMult(c) { return MATERIALS[c.mat].mult * (1 + 0.08 * (c.stars - 3)); }

export function gunValue(S, g) {
  const bp = BP[g.bp];
  const gm = GRADES.find((x) => x.id === g.grade).mult;
  const cond = 0.4 + 0.6 * (g.dur / g.maxDur);
  const mat = Object.values(g.comps).reduce((a, c) => a + compMult(c), 0) / 5;
  const mods = 1 + 0.05 * Object.keys(g.mods).length;
  return bp.value * gm * cond * mat * mods;
}

export function gunSalePrice(S, g, town, buyer = 'compact') {
  const bp = BP[g.bp];
  const fam = bp.family;
  const M = MARKET[town];
  const s = Math.min(1, sat(S, town, 'gun_' + fam));
  const demandF = Math.max(0.6, Math.min(1.4, demandOf(S, town, 'gun_' + fam) / 2)) * (M.gunBonus || 1) * FAMILIES[fam].demand;
  let war = 1;
  if (buyer !== 'compact') { const r = S.rivals[buyer]; war += 0.25 * Object.values(S.rivals).filter((o) => o.alive && o.id !== buyer && o.stance === 'war').length; if (r && r.stance === 'war') war = 0; }
  else if (S.compact.crackdownDays > 0) war = 1.2;
  const v = gunValue(S, g);
  const perk = hasPerk(S, 'op_tongue') ? 1.06 : 1;
  const price = v * demandF * (1 - 0.6 * s) * war * perk * D(S).price;
  const lines = [`!h${bp.name} (${g.grade})`, `Value $${v.toFixed(0)} = base $${bp.value} x grade x condition x materials x mods`, `x demand ${demandF.toFixed(2)}`, `x (1 - 0.6 x sat ${s.toFixed(2)})`, `x war ${war.toFixed(2)}${perk > 1 ? ' x 1.06' : ''}`, `!y= $${price.toFixed(0)}`];
  return { price, lines };
}

export function sellGun(S, gunId, town, buyer = 'compact') {
  const i = S.guns.findIndex((g) => g.id === gunId);
  if (i < 0) return { ok: false, msg: 'No such gun.' };
  const g = S.guns[i];
  if (S.player.loadout.includes(g.id)) return { ok: false, msg: 'Unequip it first.' };
  if (S.crew.some((c) => c.gun === g.id)) return { ok: false, msg: 'A crew member carries it.' };
  const { price } = gunSalePrice(S, g, town, buyer);
  if (price <= 0) return { ok: false, msg: 'They will not deal with you while at war.' };
  S.guns.splice(i, 1);
  earn(S, town === 'crossroads' || buyer !== 'compact' ? 'carried' : 'carried', price, 'guns');
  bumpSat(S, town, 'gun_' + BP[g.bp].family, 1);
  S.arms[buyer] = (S.arms[buyer] || 0) + gunValue(S, g) / 100;
  stat(S, 'gunsSold');
  addRep(S, 1 + (['fine', 'masterwork', 'legendary'].indexOf(g.grade) + 1), null, 'guns');
  fx(S, 'sale', { amount: price, town });
  return { ok: true, total: price, msg: `Sold ${BP[g.bp].name} for $${Math.round(price)}` };
}

// ---------- loot, ammo ----------
export function lootPrice(S, key, town, via = 'market') {
  const base = itemInfo(key).base;
  let f = via === 'fence' ? 0.7 : via === 'pawn' ? 0.85 : 0.5;
  if (key === 'relic' && MARKET[town] && MARKET[town].relicBonus) f *= MARKET[town].relicBonus;
  const s = town ? Math.min(1, sat(S, town, 'loot')) : 0;
  return base * f * (1 - 0.5 * s) * D(S).price;
}

export function sellLoot(S, key, n, town, via = 'market') {
  let total = 0, k = 0;
  for (; k < n; k++) {
    if (!takeItem(S, key, 1)) break;
    total += lootPrice(S, key, town, via);
    if (town) bumpSat(S, town, 'loot', 1);
  }
  if (!k) return { ok: false, msg: 'Nothing to sell.' };
  earn(S, via === 'pawn' ? 'dirty' : 'carried', total, 'fencing');
  stat(S, 'lootSold', k);
  return { ok: true, total, msg: `Fenced ${k} x ${itemInfo(key).name} for $${Math.round(total)}` };
}

export function shineSell(S, town, n) {
  let total = 0, k = 0;
  for (; k < n; k++) {
    if (!takeItem(S, 'shine', 1)) break;
    const s = Math.min(1, sat(S, town, 'shine'));
    total += 26 * (1 - 0.6 * s) * (1 + mod(S, town, 'shine')) * D(S).price;
    bumpSat(S, town, 'shine', 1);
  }
  if (!k) return { ok: false, msg: 'No moonshine.' };
  earn(S, 'carried', total, 'moonshine');
  addHeat(S, town, k * 0.5 * MARKET[town].drugHeat, 'moonshine', { quiet: true });
  addRep(S, k * 0.3, null, 'sales');
  return { ok: true, total, msg: `Sold ${k} jugs for $${Math.round(total)}` };
}

// ---------- buying ----------
export function buyPrice(S, town, key) {
  const M = MARKET[town];
  const f = M.sells[key];
  if (f === undefined) return null;
  const base = itemInfo(key, S.strains.hybrids).base;
  let p = base * f * D(S).cost * (S.towns[town] && S.towns[town].status === 'alarmed' ? 1.2 : 1);
  if (hasPerk(S, 'op_bulk')) p *= 0.85;
  if (key.startsWith('seed:')) { const st = key.split(':')[1]; if (STRAINS[st] && rank(S) < STRAINS[st].rank) return null; }
  return Math.max(1, Math.round(p * 100) / 100);
}

export function buyItem(S, town, key, n = 1) {
  const p = buyPrice(S, town, key);
  if (p === null) return { ok: false, msg: 'Not sold here.' };
  if (!marketOpen(S, town)) return { ok: false, msg: 'Market is closed.' };
  const total = p * n;
  if (!spend(S, 'dirty', total, 'supplies')) return { ok: false, msg: `Need $${Math.ceil(total)}.` };
  addItem(S, key, key.startsWith('ammo:') ? n * 10 : n);
  if (key.startsWith('seed:')) S.strains.known[key.split(':')[1]] = true;
  return { ok: true, msg: `Bought ${n} x ${itemInfo(key, S.strains.hybrids).name}` };
}

export function buyBlueprint(S, id) {
  const price = BLUEPRINT_SHOP[id];
  if (!price) return { ok: false, msg: 'Not for sale.' };
  if (S.bps[id]) return { ok: false, msg: 'Already known.' };
  if (rank(S) < BP[id].rank) return { ok: false, msg: 'The dealer wants a bigger name first.' };
  if (!spend(S, 'dirty', price * D(S).cost, 'blueprints')) return { ok: false, msg: `Need $${price}.` };
  S.bps[id] = true;
  stat(S, 'blueprints');
  log(S, `Blueprint learned: ${BP[id].name}`, 'good');
  return { ok: true, msg: 'Blueprint learned.' };
}

// ---------- daily market upkeep ----------
export function marketsDaily(S) {
  for (const id of MARKET_IDS) {
    const m = S.markets[id];
    for (const k of Object.keys(m.sat)) { m.sat[k] = Math.max(0, m.sat[k] - 0.12); if (m.sat[k] === 0) delete m.sat[k]; }
    for (const md of m.mods) md.days--;
    m.mods = m.mods.filter((md) => md.days > 0);
  }
}

export function addMarketMod(S, town, cat, modv, days, why) {
  S.markets[town].mods.push({ cat, mod: modv, days, why });
}

// Best street price today for a baggie of Mid (Markets overlay / price map).
export function priceIndex(S, town) {
  return weedPrice(S, town, 'ashleaf', 1, 'baggie', 0).price;
}

export function ammoValue(type) { return AMMO[type].value; }
export function staticPrice(key) { return STATIC_ITEMS[key] ? STATIC_ITEMS[key].base : itemInfo(key).base; }
export { count };
