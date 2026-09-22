/* Item creation, naming, stats, value, and loot tables. */
(function () {
  'use strict';
  const D = LCO.data;
  const R = LCO.R;
  const U = LCO.U;
  const r2 = (x) => Math.round(x * 100) / 100;
  const GEAR = ['weapon', 'offhand', 'armor', 'charm'];

  const scale = (ilvl, upg) => (1 + 0.3 * (ilvl - 1)) * (1 + 0.1 * (upg || 0));
  const pscale = (ilvl, upg) => (1 + 0.08 * (ilvl - 1)) * (1 + 0.05 * (upg || 0));

  function rollAffixValue(def, ilvl) {
    const raw = R.float(def.range[0], def.range[1]);
    if (def.type === 'flat') return Math.max(1, Math.round(raw * (1 + 0.3 * (ilvl - 1))));
    if (def.type === 'pct') return r2(raw * (1 + 0.1 * (ilvl - 1)));
    return Math.round(raw);
  }
  function rollAffixes(kind, n, ilvl, exclude) {
    const pool = Object.keys(D.AFFIXES).filter((id) => {
      const a = D.AFFIXES[id];
      return a.slots.includes(kind) && (a.minIlvl || 1) <= ilvl && !(exclude || []).includes(id);
    });
    return R.shuffle(pool).slice(0, n).map((id) => ({ id, v: rollAffixValue(D.AFFIXES[id], ilvl) }));
  }

  function nameOf(item) {
    if (item.relic) return D.RELICS[item.relic].name;
    if (item.kind === 'consumable') return D.CONSUMABLES[item.base].name;
    if (item.kind === 'valuable') return D.VALUABLES[item.base].name;
    const b = D.BASES[item.base];
    const pre = item.affixes.map((a) => D.AFFIXES[a.id].pre).find(Boolean);
    const suf = item.affixes.map((a) => D.AFFIXES[a.id].suf).find(Boolean);
    const parts = [];
    if (pre) parts.push(pre);
    else if (item.rarity === 0) parts.push('Worn');
    parts.push(b.name);
    if (suf) parts.push(suf);
    return parts.join(' ');
  }

  function makeItem(o) {
    const rd = o.relic ? D.RELICS[o.relic] : null;
    const baseId = rd ? rd.base : o.base;
    const b = D.BASES[baseId];
    const rarity = rd ? rd.rarity : o.rarity || 0;
    const ilvl = U.clamp(o.ilvl || 1, 1, 12);
    const item = { uid: U.uid('i'), base: baseId, kind: b.kind, rarity, ilvl, affixes: [], power: null, relic: o.relic || null, upg: 0, qty: 1 };
    item.affixes = o.affixes || rollAffixes(b.kind, D.RARITIES[rarity].affixes, ilvl);
    if (rarity === 3) item.power = o.power || R.pick(Object.keys(D.MINOR_POWERS));
    item.name = nameOf(item);
    return item;
  }
  function makeConsumable(id, qty) {
    const c = D.CONSUMABLES[id];
    return { uid: U.uid('c'), base: id, kind: 'consumable', rarity: c.rarity || 0, ilvl: 1, qty: qty || 1, name: c.name };
  }
  function makeValuable(id, ilvl) {
    const v = D.VALUABLES[id];
    return { uid: U.uid('v'), base: id, kind: 'valuable', rarity: v.rarity, ilvl: ilvl || 1, qty: 1, name: v.name };
  }

  function iconOf(item) {
    if (item.relic) return D.RELICS[item.relic].icon;
    if (item.kind === 'consumable') return D.CONSUMABLES[item.base].icon;
    if (item.kind === 'valuable') return D.VALUABLES[item.base].icon;
    return D.BASES[item.base].icon;
  }

  /* Full numeric contribution of a gear item (base + affixes + relic + power). */
  function itemStats(item) {
    const out = { stats: {}, weapon: null, props: null };
    if (!GEAR.includes(item.kind)) return out;
    const b = D.BASES[item.base];
    const sc = scale(item.ilvl, item.upg);
    const ps = pscale(item.ilvl, item.upg);
    const add = (k, v) => { out.stats[k] = r2((out.stats[k] || 0) + v); };
    if (b.stats) for (const k in b.stats) add(k, Math.round(b.stats[k] * sc));
    if (b.pstats) for (const k in b.pstats) add(k, r2(b.pstats[k] * ps));
    for (const a of item.affixes) {
      const def = D.AFFIXES[a.id];
      if (!def) continue;
      const m = def.type === 'fixed' ? 1 : 1 + 0.05 * (item.upg || 0);
      add(def.stat, def.type === 'flat' ? Math.round(a.v * m) : def.type === 'pct' ? r2(a.v * m) : a.v);
    }
    if (item.relic) {
      const rd = D.RELICS[item.relic];
      if (rd.stats) for (const k in rd.stats) add(k, k === 'maxHp' || k === 'maxFocus' ? Math.round(rd.stats[k] * sc) : rd.stats[k]);
    }
    if (item.power) {
      const pw = D.MINOR_POWERS[item.power];
      if (pw && pw.stats) for (const k in pw.stats) add(k, pw.stats[k]);
    }
    if (item.kind === 'weapon') {
      out.weapon = { min: Math.max(1, Math.round(b.dmg[0] * sc)), max: Math.max(1, Math.round(b.dmg[1] * sc)), ap: b.ap, hits: b.hits, props: Object.assign({}, b.props), name: item.name, icon: iconOf(item) };
    } else if (b.props && Object.keys(b.props).length) {
      out.props = Object.assign({}, b.props);
    }
    return out;
  }

  function value(item) {
    if (item.kind === 'consumable') return D.CONSUMABLES[item.base].value * (item.qty || 1);
    if (item.kind === 'valuable') return Math.round(D.VALUABLES[item.base].value * (1 + 0.15 * (item.ilvl - 1))) * (item.qty || 1);
    const base = D.BASE_VALUE[item.kind] || 10;
    return Math.round(base * D.RARITIES[item.rarity].value * (1 + 0.35 * (item.ilvl - 1)) * (1 + 0.25 * (item.upg || 0)));
  }
  const sellPrice = (item, S) => Math.max(1, Math.round(value(item) * (1 + (S.sellBonus || 0))));
  const buyPrice = (item, S) => Math.max(1, Math.round(value(item) * 2.5 * Math.max(0.5, 1 - (S.buyDiscount || 0))));
  function salvageYield(item, S) {
    if (!GEAR.includes(item.kind)) return null;
    const f = S.flags || {};
    const scrap = Math.max(1, Math.round((value(item) / 5) * (1 + (f.scrapBonus || 0))));
    let glimmer = item.rarity >= 4 ? 2 : item.rarity === 3 ? 1 : 0;
    const bonusGlimmerChance = f.glimmerSalvage || 0;
    return { scrap, glimmer, bonusGlimmerChance };
  }

  /* ---------- loot tables ---------- */
  function rollRarity(tier, lootFind, boost, min) {
    const w = [50, 30, 14 + tier * 1.2, 3.5 + tier * 0.8, 0.5 + tier * 0.25, tier >= 6 ? (tier - 5) * 0.12 : 0];
    const lf = 1 + (lootFind || 0);
    for (let r = 2; r < w.length; r++) w[r] *= Math.pow(lf, r * 0.6);
    let r = R.weighted(w.map((x, i) => [x, i]));
    if (r < 4 && boost) r = Math.min(3, r + boost);
    if (min && r < min) r = min;
    return r;
  }
  function rollRelic(tier, rarity) {
    let pool = Object.keys(D.RELICS).filter((id) => D.RELICS[id].rarity === rarity && D.RELICS[id].minTier <= tier);
    if (!pool.length && rarity === 5) return rollRelic(tier, 4);
    if (!pool.length) pool = Object.keys(D.RELICS).filter((id) => D.RELICS[id].rarity === 4);
    return R.pick(pool);
  }
  function rollGear(tier, o) {
    o = o || {};
    const rarity = rollRarity(tier, o.lootFind, o.rarityBoost, o.minRarity);
    const ilvl = U.clamp(tier + (o.ilvlBonus || 0), 1, 12);
    if (rarity >= 4) return makeItem({ relic: rollRelic(tier, rarity), ilvl });
    const kind = o.kind || R.weighted([[3, 'weapon'], [3, 'armor'], [2, 'offhand'], [3, 'charm']]);
    const bases = Object.keys(D.BASES).filter((id) => D.BASES[id].kind === kind);
    return makeItem({ base: R.pick(bases), rarity, ilvl });
  }
  function rollValuable(tier, o) {
    o = o || {};
    const w = [40, 30, 18, 8 + tier, tier >= 4 ? tier * 0.8 : 0];
    let r = R.weighted(w.map((x, i) => [x, i]));
    if (o.minRarity) r = Math.max(r, Math.min(4, o.minRarity));
    let pool = Object.keys(D.VALUABLES).filter((id) => D.VALUABLES[id].rarity === r && (D.VALUABLES[id].minTier || 1) <= tier);
    if (!pool.length) pool = Object.keys(D.VALUABLES).filter((id) => D.VALUABLES[id].rarity <= Math.min(r, 3));
    return makeValuable(R.pick(pool), tier);
  }
  const CONSUMABLE_W = [[5, 'bandage'], [5, 'beans'], [4, 'tonic'], [2, 'salts'], [3, 'firecracker'], [2, 'chrome_dust'], [2, 'flare'], [1.5, 'mirror_tonic'], [1.5, 'stability_coil'], [1.5, 'schematic'], [1.2, 'coupling_key']];
  function rollConsumable() { return makeConsumable(R.weighted(CONSUMABLE_W), 1); }

  function rollAny(tier, o) {
    o = o || {};
    if (o.kind === 'valuable') return rollValuable(tier, o);
    if (o.kind === 'consumable') return rollConsumable();
    if (o.kind && o.kind !== 'gear') return rollGear(tier, o);
    if (o.kind === 'gear') return rollGear(tier, Object.assign({}, o, { kind: null }));
    const valW = o.valuableBoost ? 60 : 30;
    const pick = R.weighted([[45, 'gear'], [valW, 'valuable'], [25, 'consumable']]);
    if (pick === 'gear') return rollGear(tier, o);
    if (pick === 'valuable') return rollValuable(tier, o);
    return rollConsumable();
  }

  function rollCache(tier, depthF, S, mod) {
    const f = S.flags || {};
    const o = { lootFind: S.lootFind + (mod === 'garrison' ? 0.2 : 0), valuableBoost: mod === 'lost_prop' };
    let n = 1 + (R.chance(0.45 + 0.3 * depthF) ? 1 : 0) + (mod === 'overstock' ? 1 : 0) + (R.chance(f.forager || 0) ? 1 : 0);
    const items = [];
    for (let i = 0; i < n; i++) items.push(rollAny(tier, o));
    const tickets = Math.round(R.int(4, 12) * tier * (1 + (f.foragerTickets || 0)) * (mod === 'unsteady' ? 1.25 : 1));
    return { items, tickets, scrap: R.chance(0.35) ? R.int(1, 3) * tier : 0 };
  }
  function rollVault(tier, S, rumor) {
    const o = { lootFind: S.lootFind, rarityBoost: 1 };
    const items = [rollGear(tier, { lootFind: S.lootFind, minRarity: 3, ilvlBonus: 1 }), rollAny(tier, o), rollValuable(tier, { minRarity: 2 })];
    if (rumor === 'relic') items[0] = makeItem({ relic: rollRelic(tier, 4), ilvl: tier + 1 });
    return { items, tickets: R.int(20, 40) * tier, scrap: R.int(2, 5) * tier };
  }
  function enemyDrops(e, tier, S, mod) {
    const o = { lootFind: S.lootFind + (mod === 'garrison' ? 0.2 : 0), valuableBoost: mod === 'lost_prop' };
    const boost = mod === 'red_signal' ? 1.3 : 1;
    const items = [];
    const lf = 1 + S.lootFind * 0.5;
    if (e.boss) {
      if (e.id === 'conductor_echo') items.push(makeItem({ relic: rollRelic(10, 5), ilvl: 12 }));
      items.push(makeItem({ relic: rollRelic(10, 4), ilvl: 11 }), rollGear(10, { minRarity: 3, ilvlBonus: 1 }), rollValuable(10, { minRarity: 3 }));
    } else if (e.hunter) {
      items.push(R.chance(0.3) ? makeItem({ relic: rollRelic(tier, 4), ilvl: tier }) : rollGear(tier, { minRarity: 2, lootFind: S.lootFind }));
    } else if (e.elite) {
      items.push(rollGear(tier, Object.assign({}, o, { rarityBoost: 1, ilvlBonus: 1 })));
      if (R.chance(0.5 * boost)) items.push(rollValuable(tier, { minRarity: 1 }));
      if (R.chance(0.35 * boost)) items.push(rollAny(tier, o));
    } else {
      if (R.chance(0.2 * lf * boost)) items.push(rollGear(tier, o));
      if (R.chance(0.12 * boost * (mod === 'lost_prop' ? 2 : 1))) items.push(rollValuable(tier, o));
      if (R.chance(0.12 * boost)) items.push(rollConsumable());
    }
    const tickets = Math.round(R.int(2, 7) * tier * (e.elite ? 3 : 1) * (e.boss ? 10 : 1) * boost);
    const scrap = R.chance(0.3) ? R.int(1, 2) * tier : 0;
    return { items, tickets, scrap };
  }

  /* Human-readable stat lines for the inspect panel. */
  const STAT_LABEL = {
    maxHp: (v) => `${U.signed(v)} Max HP`, armor: (v) => `${U.signed(v)} Armor`, dmgPct: (v) => `${U.signed(Math.round(v * 100))}% Weapon Damage`,
    dmgFlat: (v) => `${U.signed(v)} Damage per hit`, critChance: (v) => `${U.signed(Math.round(v * 100))}% Crit Chance`, critDmg: (v) => `${U.signed(Math.round(v * 100))}% Crit Damage`,
    dodge: (v) => `${U.signed(Math.round(v * 100))}% Dodge`, maxFocus: (v) => `${U.signed(v)} Max Focus`, focusRegen: (v) => `${U.signed(v)} Focus per turn`,
    abilityPower: (v) => `${U.signed(Math.round(v * 100))}% Ability Power`, lootFind: (v) => `${U.signed(Math.round(v * 100))}% Loot Find`, lifesteal: (v) => `${Math.round(v * 100)}% Lifesteal`,
    thorns: (v) => `${U.signed(v)} Thorns`, bleedChance: (v) => `${Math.round(v * 100)}% chance to Bleed`, statusResist: (v) => `${U.signed(Math.round(v * 100))}% Status Resist`,
    backpack: (v) => `${U.signed(v)} Backpack slots`, pouch: (v) => `${U.signed(v)} Secure Pouch slots`, xpGain: (v) => `${U.signed(Math.round(v * 100))}% Experience`,
    instabilitySlow: (v) => `Instability ${Math.round(v * 100)}% slower`, healBonus: (v) => `${U.signed(Math.round(v * 100))}% Healing`, ap: (v) => `${U.signed(v)} AP per turn`,
    sellBonus: (v) => `Sell for ${Math.round(v * 100)}% more`, dmgTaken: (v) => `Take ${Math.round(v * 100)}% more damage`, sight: (v) => `${U.signed(v)} sight`,
  };
  function statLines(item) {
    const info = itemStats(item);
    const lines = [];
    if (info.weapon) lines.push(`${info.weapon.min}–${info.weapon.max} damage${info.weapon.hits > 1 ? ' ×' + info.weapon.hits : ''} · Strike costs ${info.weapon.ap} AP`);
    for (const k in info.stats) {
      const v = info.stats[k];
      if (!v) continue;
      lines.push(STAT_LABEL[k] ? STAT_LABEL[k](v) : `${k} ${v}`);
    }
    return lines;
  }

  LCO.engine.loot = {
    makeItem, makeConsumable, makeValuable, nameOf, iconOf, itemStats, value, sellPrice, buyPrice, salvageYield,
    rollRarity, rollRelic, rollGear, rollValuable, rollConsumable, rollAny, rollCache, rollVault, enemyDrops,
    rollAffixes, statLines, STAT_LABEL, GEAR, scale,
  };
})();
