/* Item creation, naming, stats, value, and drop tables. */
(function () {
  'use strict';
  const D = AE.data;
  const R = AE.R;
  const U = AE.U;
  const r2 = (x) => Math.round(x * 100) / 100;

  const scale = (ilvl, upg) => (1 + 0.3 * (ilvl - 1)) * (1 + 0.1 * (upg || 0));
  const pscale = (ilvl, upg) => (1 + 0.08 * (ilvl - 1)) * (1 + 0.05 * (upg || 0));

  function rollAffixValue(def, ilvl) {
    const raw = R.float(def.range[0], def.range[1]);
    if (def.type === 'flat') return Math.max(1, Math.round(raw * (1 + 0.3 * (ilvl - 1))));
    return r2(raw * (1 + 0.1 * (ilvl - 1)));
  }
  function rollAffixes(kind, n, ilvl) {
    const pool = Object.keys(D.AFFIXES).filter((id) => D.AFFIXES[id].slots.includes(kind));
    return R.shuffle(pool).slice(0, n).map((id) => ({ id, v: rollAffixValue(D.AFFIXES[id], ilvl) }));
  }
  function nameOf(it) {
    if (it.relic) return D.RELICS[it.relic].name;
    if (it.kind === 'consumable') return D.CONSUMABLES[it.base].name;
    if (it.kind === 'valuable') return D.VALUABLES[it.base].name;
    const b = D.BASES[it.base];
    const pre = it.affixes.map((a) => D.AFFIXES[a.id].pre).find(Boolean);
    const suf = it.affixes.map((a) => D.AFFIXES[a.id].suf).find(Boolean);
    return [pre || (it.rarity === 0 ? 'Plain' : ''), b.name, suf || ''].filter(Boolean).join(' ');
  }
  function makeItem(o) {
    const rd = o.relic ? D.RELICS[o.relic] : null;
    const base = rd ? rd.base : o.base;
    const b = D.BASES[base];
    const rarity = rd ? rd.rarity : o.rarity || 0;
    const ilvl = U.clamp(o.ilvl || 1, 1, 10);
    const it = { uid: U.uid('i'), base, kind: b.kind, rarity, ilvl, affixes: [], power: null, relic: o.relic || null, upg: 0, qty: 1 };
    it.affixes = o.affixes || rollAffixes(b.kind, D.RARITIES[rarity].affixes, ilvl);
    if (rarity === 3) it.power = o.power || R.pick(Object.keys(D.POWERS));
    it.name = nameOf(it);
    return it;
  }
  function makeConsumable(id, qty) { const c = D.CONSUMABLES[id]; return { uid: U.uid('c'), base: id, kind: 'consumable', rarity: c.rarity, ilvl: 1, qty: qty || 1, name: c.name }; }
  function makeValuable(id, ilvl) { const v = D.VALUABLES[id]; return { uid: U.uid('v'), base: id, kind: 'valuable', rarity: v.rarity, ilvl: ilvl || 1, qty: 1, name: v.name }; }
  function iconOf(it) {
    if (it.relic) return D.RELICS[it.relic].icon;
    if (it.kind === 'consumable') return D.CONSUMABLES[it.base].icon;
    if (it.kind === 'valuable') return D.VALUABLES[it.base].icon;
    return D.BASES[it.base].icon;
  }

  function itemStats(it) {
    const out = { stats: {}, weapon: null };
    if (!D.GEAR_KINDS.includes(it.kind)) return out;
    const b = D.BASES[it.base];
    const sc = scale(it.ilvl, it.upg), ps = pscale(it.ilvl, it.upg);
    const add = (k, v) => { out.stats[k] = r2((out.stats[k] || 0) + v); };
    if (b.stats) for (const k in b.stats) add(k, k === 'backpack' ? b.stats[k] : Math.round(b.stats[k] * sc));
    if (b.pstats) for (const k in b.pstats) add(k, r2(b.pstats[k] * ps));
    for (const a of it.affixes) {
      const def = D.AFFIXES[a.id];
      if (def) add(def.stat, def.type === 'flat' ? Math.round(a.v * (1 + 0.05 * (it.upg || 0))) : r2(a.v * (1 + 0.05 * (it.upg || 0))));
    }
    if (it.relic) { const rd = D.RELICS[it.relic]; if (rd.stats) for (const k in rd.stats) add(k, k === 'hp' ? Math.round(rd.stats[k] * sc) : rd.stats[k]); }
    if (it.power) { const pw = D.POWERS[it.power]; if (pw.stats) for (const k in pw.stats) add(k, pw.stats[k]); }
    if (it.kind === 'sword' || it.kind === 'knuckles') {
      out.weapon = { dmg: r2(b.dmg * (1 + 0.32 * (it.ilvl - 1)) * (1 + 0.1 * (it.upg || 0))), spd: b.spd, reach: b.reach || 1, arc: b.arc || 1, name: it.name };
    }
    return out;
  }

  function value(it) {
    if (it.kind === 'consumable') return D.CONSUMABLES[it.base].value * (it.qty || 1);
    if (it.kind === 'valuable') return Math.round(D.VALUABLES[it.base].value * (1 + 0.15 * (it.ilvl - 1))) * (it.qty || 1);
    return Math.round((D.BASE_VALUE[it.kind] || 12) * D.RARITIES[it.rarity].value * (1 + 0.35 * (it.ilvl - 1)) * (1 + 0.25 * (it.upg || 0)));
  }
  const sellPrice = (it, T) => Math.max(1, Math.round(value(it) * (1 + (T.sellBonus || 0))));
  const buyPrice = (it, T) => Math.max(1, Math.round(value(it) * 2.5 * Math.max(0.5, 1 - (T.buyDiscount || 0))));
  function salvageYield(it) {
    if (!D.GEAR_KINDS.includes(it.kind)) return null;
    return { dust: Math.max(1, Math.round(value(it) / 5)), shards: it.rarity >= 4 ? 2 : it.rarity === 3 ? 1 : 0 };
  }

  /* ---------- drop tables ---------- */
  function rollRarity(tier, luck, min) {
    const w = [52, 30, 13 + tier * 1.2, 3.5 + tier * 0.8, 0.6 + tier * 0.3, tier >= 5 ? (tier - 4) * 0.15 : 0];
    const lf = 1 + (luck || 0);
    for (let r = 2; r < w.length; r++) w[r] *= Math.pow(lf, r * 0.6);
    let r = R.weighted(w.map((x, i) => [x, i]));
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
    const rarity = rollRarity(tier, o.luck, o.minRarity);
    const ilvl = U.clamp(tier + (o.ilvlBonus || 0), 1, 10);
    if (rarity >= 4) return makeItem({ relic: rollRelic(tier, rarity), ilvl });
    const kind = o.kind || R.weighted([[3, 'sword'], [3, 'knuckles'], [2, 'finnGear'], [2, 'jakeGear'], [3, 'trinket']]);
    const bases = Object.keys(D.BASES).filter((b) => D.BASES[b].kind === kind);
    return makeItem({ base: R.pick(bases), rarity, ilvl });
  }
  function rollValuable(tier, o) {
    o = o || {};
    const w = [40, 30, 18, 8 + tier, tier >= 5 ? tier * 0.7 : 0];
    let r = R.weighted(w.map((x, i) => [x, i]));
    if (o.minRarity) r = Math.max(r, o.minRarity);
    let pool = Object.keys(D.VALUABLES).filter((id) => D.VALUABLES[id].rarity === r && (D.VALUABLES[id].minTier || 1) <= tier);
    if (!pool.length) pool = Object.keys(D.VALUABLES).filter((id) => D.VALUABLES[id].rarity <= Math.min(r, 3));
    return makeValuable(R.pick(pool), tier);
  }
  const CONS_W = [[6, 'bacon_pancakes'], [4, 'candy'], [2, 'burrito'], [2.5, 'ice_cream'], [2.5, 'science_potion'], [3, 'gunter_bomb'], [2, 'hot_cocoa'], [1, 'rainbow_flare'], [1.5, 'skeleton_key']];
  const rollConsumable = () => makeConsumable(R.weighted(CONS_W), 1);
  function rollAny(tier, o) {
    o = o || {};
    const pick = R.weighted([[44, 'gear'], [32, 'valuable'], [24, 'consumable']]);
    if (pick === 'gear') return rollGear(tier, o);
    if (pick === 'valuable') return rollValuable(tier, o);
    return rollConsumable();
  }

  /* What falls out of things. Returns { items, gold }. */
  function drops(source, tier, T, o) {
    o = o || {};
    const luck = T.luck + (o.luckBonus || 0);
    const items = [];
    let gold = 0;
    const lf = 1 + luck * 0.5;
    switch (source) {
      case 'breakable':
        gold = R.chance(0.7) ? R.int(2, 6) * tier : 0;
        if (R.chance(0.12 * lf)) items.push(R.chance(0.6) ? rollConsumable() : rollValuable(tier));
        break;
      case 'chest':
        gold = R.int(10, 25) * tier;
        items.push(rollGear(tier, { luck }));
        items.push(rollAny(tier, { luck }));
        if (R.chance(0.45 * lf)) items.push(rollAny(tier, { luck }));
        break;
      case 'vaultChest':
        gold = R.int(30, 60) * tier;
        items.push(rollGear(tier, { luck, minRarity: 2, ilvlBonus: 1 }), rollValuable(tier, { minRarity: 2 }), rollAny(tier, { luck }));
        if (R.chance(0.35)) items.push(makeItem({ relic: rollRelic(tier, 4), ilvl: tier }));
        break;
      case 'enemy':
        gold = R.int(1, 4) * tier;
        if (R.chance(0.1 * lf)) items.push(rollGear(tier, { luck }));
        if (R.chance(0.06 * lf)) items.push(rollValuable(tier));
        if (R.chance(0.06)) items.push(rollConsumable());
        break;
      case 'elite':
        gold = R.int(40, 70) * tier;
        items.push(rollGear(tier, { luck, minRarity: 2, ilvlBonus: 1 }), rollValuable(tier, { minRarity: 1 }));
        if (R.chance(0.3 * lf)) items.push(makeItem({ relic: rollRelic(tier, 4), ilvl: tier }));
        break;
      case 'boss':
        gold = 2500;
        items.push(makeItem({ relic: rollRelic(10, 5), ilvl: 10 }), makeItem({ relic: rollRelic(10, 4), ilvl: 10 }), rollValuable(10, { minRarity: 4 }), rollGear(10, { luck, minRarity: 3 }));
        break;
      default: break;
    }
    gold = Math.round(gold * (1 + (T.goldFind || 0)));
    return { items, gold };
  }

  const STAT_LABEL = {
    hp: (v) => `${U.signed(v)} Max HP`, hpPct: (v) => `${U.signed(Math.round(v * 100))}% Max HP`, armor: (v) => `${U.signed(v)} Armor`, dmg: (v) => `${U.signed(Math.round(v * 100))}% Damage`,
    dmgFlat: (v) => `${U.signed(v)} Damage per hit`, crit: (v) => `${U.signed(Math.round(v * 100))}% Crit Chance`, critDmg: (v) => `${U.signed(Math.round(v * 100))}% Crit Damage`,
    atkSpd: (v) => `${U.signed(Math.round(v * 100))}% Attack Speed`, speed: (v) => `${U.signed(Math.round(v * 100))}% Move Speed`, cdr: (v) => `${Math.round(v * 100)}% Faster Cooldowns`,
    lifesteal: (v) => `${Math.round(v * 100)}% Lifesteal`, luck: (v) => `${U.signed(Math.round(v * 100))}% Luck`, dodge: (v) => `${U.signed(Math.round(v * 100))}% Dodge`,
    meterGain: (v) => `${U.signed(Math.round(v * 100))}% Super Meter Gain`, reach: (v) => `${U.signed(Math.round(v * 100))}% Reach`, burnChance: (v) => `${Math.round(v * 100)}% Burn Chance`,
    chillChance: (v) => `${Math.round(v * 100)}% Chill Chance`, goldFind: (v) => `${U.signed(Math.round(v * 100))}% Gold`, xp: (v) => `${U.signed(Math.round(v * 100))}% XP`,
    backpack: (v) => `${U.signed(v)} Backpack Slots`, tummy: (v) => `${U.signed(v)} Tummy Slots`, knockback: (v) => `${U.signed(Math.round(v * 100))}% Knockback`,
    buyDiscount: (v) => `Buy ${Math.round(v * 100)}% cheaper`, sellBonus: (v) => `Sell for ${Math.round(v * 100)}% more`,
  };
  function statLines(it) {
    const info = itemStats(it);
    const lines = [];
    if (info.weapon) lines.push(`${info.weapon.dmg.toFixed(1)} damage · ${info.weapon.spd >= 1.1 ? 'fast' : info.weapon.spd <= 0.8 ? 'slow' : 'steady'} swings${info.weapon.reach > 1 ? ' · long reach' : ''}`);
    for (const k in info.stats) { const v = info.stats[k]; if (v) lines.push(STAT_LABEL[k] ? STAT_LABEL[k](v) : `${k} ${v}`); }
    return lines;
  }
  const heroFor = (it) => (it.kind === 'sword' || it.kind === 'finnGear' ? 'finn' : it.kind === 'knuckles' || it.kind === 'jakeGear' ? 'jake' : it.kind === 'trinket' ? 'both' : null);

  AE.meta.loot = { makeItem, makeConsumable, makeValuable, nameOf, iconOf, itemStats, value, sellPrice, buyPrice, salvageYield,
    rollRarity, rollRelic, rollGear, rollValuable, rollConsumable, rollAny, rollAffixes, drops, statLines, heroFor, STAT_LABEL };
})();
