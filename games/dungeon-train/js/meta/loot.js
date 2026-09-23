/* Loot: making items, naming them, working out what they do, what they're worth, and what drops. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  /* growth curves */
  const flatScale = (ilvl, upg) => (1 + 0.3 * (ilvl - 1)) * (1 + 0.1 * (upg || 0));
  const pctScale = (ilvl, upg) => (1 + 0.08 * (ilvl - 1)) * (1 + 0.05 * (upg || 0));
  const weaponDmg = (dmg, ilvl, upg) => dmg * (1 + 0.32 * (ilvl - 1)) * (1 + 0.1 * (upg || 0));
  const powerP = (it) => (1 + 0.1 * (it.ilvl - 1)) * (1 + 0.06 * (it.upg || 0));
  const reqLevel = (it) => (D.KINDS[it.kind] && D.KINDS[it.kind].gear ? Math.max(1, (it.ilvl - 1) * 4 - 1) : 1);
  const heroFor = (it) => (D.KINDS[it.kind] ? D.KINDS[it.kind].hero || null : null);
  const isGear = (it) => !!(it && D.KINDS[it.kind] && D.KINDS[it.kind].gear);

  function rollAffixValue(def, ilvl) {
    const raw = R.float(def.range[0], def.range[1]);
    if (def.type === 'fixed') return Math.round(raw);
    if (def.type === 'flat') return Math.max(1, Math.round(raw * (1 + 0.3 * (ilvl - 1))));
    return r3(raw * (1 + 0.1 * (ilvl - 1)));
  }
  function rollAffixes(kind, n, ilvl, exclude) {
    const pool = Object.keys(D.AFFIXES).filter((id) => D.AFFIXES[id].kinds.includes(kind) && !(exclude || []).includes(id));
    return R.shuffle(pool).slice(0, n).map((id) => ({ id, v: rollAffixValue(D.AFFIXES[id], ilvl) }));
  }
  /* counts and switches that shouldn't be scaled by power-boosting skill nodes */
  const FIXED_MODS = new Set(['dashCharges', 'split', 'pierce', 'chain', 'bmoDrone', 'magnet', 'critChain', 'loopFast', 'gunterBottle']);
  const powerPool = (kind) => Object.keys(D.POWERS).filter((id) => D.POWERS[id].kinds.includes(kind));
  function rollPower(kind, not) { const pool = powerPool(kind).filter((p) => p !== not); return pool.length ? R.pick(pool) : null; }

  function nameOf(it) {
    if (it.kind === 'consumable') return D.CONSUMABLES[it.base].name;
    if (it.kind === 'valuable') return D.VALUABLES[it.base].name;
    if (it.kind === 'trophy') return D.TROPHIES[it.base].name;
    if (it.unique) return D.UNIQUES[it.unique].name;
    if (it.set) return D.SETS[it.set].pieces[it.kind][1];
    const b = D.BASES[it.base];
    if (it.power) return `${b.name} of ${D.POWERS[it.power].name}`;
    const pre = (it.affixes || []).map((a) => D.AFFIXES[a.id].pre).find(Boolean);
    const suf = (it.affixes || []).map((a) => D.AFFIXES[a.id].suf).find(Boolean);
    return [pre || (it.rarity === 0 ? 'Plain' : ''), b.name, suf || ''].filter(Boolean).join(' ');
  }

  function makeItem(o) {
    const ud = o.unique ? D.UNIQUES[o.unique] : null;
    let base = ud ? ud.base : o.base;
    if (o.set && !ud) base = D.SETS[o.set].pieces[D.BASES[base || D.SETS[o.set].pieces.helmet[0]].kind][0];
    const b = D.BASES[base];
    const rarity = ud ? ud.rarity : U.clamp(o.rarity || 0, 0, 3);
    const ilvl = U.clamp(o.ilvl || 1, 1, 10);
    const it = { uid: U.uid('i'), kind: b.kind, base, rarity, ilvl, upg: 0, affixes: [], power: null, unique: o.unique || null, set: ud ? null : o.set || null, qty: 1 };
    it.affixes = o.affixes || rollAffixes(b.kind, D.RARITIES[rarity].affixes, ilvl);
    if (rarity === 3 && !ud) it.power = o.power || rollPower(b.kind);
    it.name = nameOf(it);
    return it;
  }
  function makeConsumable(id, qty) { const c = D.CONSUMABLES[id]; return { uid: U.uid('c'), kind: 'consumable', base: id, rarity: c.rarity, ilvl: 1, qty: qty || 1, name: c.name }; }
  function makeValuable(id, ilvl) { const v = D.VALUABLES[id]; return { uid: U.uid('v'), kind: 'valuable', base: id, rarity: v.rarity, ilvl: ilvl || 1, qty: 1, name: v.name }; }
  function makeTrophy(lineId) { return { uid: U.uid('t'), kind: 'trophy', base: lineId, rarity: 4, ilvl: 1, qty: 1, name: D.TROPHIES[lineId].name }; }

  function artOf(it) {
    if (it.unique) return D.UNIQUES[it.unique].art || D.BASES[it.base].art;
    if (D.BASES[it.base]) return D.BASES[it.base].art;
    return null;
  }
  function iconOf(it) {
    if (it.kind === 'consumable') return D.CONSUMABLES[it.base].icon;
    if (it.kind === 'valuable') return D.VALUABLES[it.base].icon;
    if (it.kind === 'trophy') return 'trophy';
    return D.KINDS[it.kind].icon;
  }

  /* Everything an item does: flat stats, behaviour mods, the powers the player reads, and a granted ability.
     `scale` boosts Powers (Finn's Relic Lore nodes). */
  function effects(it, scale) {
    const out = { stats: {}, mods: {}, powers: [], grants: null, weapon: null };
    if (!isGear(it)) return out;
    const b = D.BASES[it.base];
    const fs = flatScale(it.ilvl, it.upg), ps = pctScale(it.ilvl, it.upg);
    const add = (k, v) => { out.stats[k] = r3((out.stats[k] || 0) + v); };
    if (b.stats) for (const k in b.stats) add(k, k === 'backpack' || k === 'belt' ? b.stats[k] : Math.round(b.stats[k] * fs));
    if (b.pstats) for (const k in b.pstats) add(k, b.pstats[k] * ps);
    for (const a of it.affixes || []) {
      const def = D.AFFIXES[a.id];
      if (!def) continue;
      add(def.stat, def.type === 'pct' ? a.v * (1 + 0.05 * (it.upg || 0)) : def.type === 'flat' ? Math.round(a.v * (1 + 0.05 * (it.upg || 0))) : a.v);
    }
    if (b.sword) out.weapon = { kind: 'sword', type: b.sword.type, dmg: weaponDmg(b.sword.dmg, it.ilvl, it.upg), spd: b.sword.spd };
    if (b.punch) out.weapon = { kind: 'instrument', form: b.punch.form, dmg: weaponDmg(b.punch.dmg, it.ilvl, it.upg), spd: b.punch.spd };
    const p = powerP(it) * (1 + (scale || 0));
    if (it.power) {
      const pw = D.POWERS[it.power];
      if (pw.stats) for (const [k, v] of Object.entries(pw.stats(p))) add(k, v);
      if (pw.mods) Object.assign(out.mods, pw.mods(p));
      out.powers.push({ id: it.power, name: pw.name, icon: pw.icon, text: pw.desc(p), kind: 'power' });
    }
    if (it.unique) {
      const ud = D.UNIQUES[it.unique];
      const us = 1 + (scale || 0);
      if (ud.stats) for (const [k, v] of Object.entries(ud.stats)) add(k, k === 'hp' ? Math.round(v * fs) : k === 'safe' || k === 'backpack' || k === 'belt' ? v : v * us);
      if (ud.mods) for (const [k, v] of Object.entries(ud.mods)) out.mods[k] = FIXED_MODS.has(k) || D.MOD_RULES[k] === 'or' || D.MOD_RULES[k] === 'min' ? v : r3(v * us);
      for (const e of ud.effects) out.powers.push({ name: e.name, icon: 'star', text: e.text, kind: 'unique' });
      out.grants = ud.grants || null;
    }
    return out;
  }

  /* A one-line plain description of what the item IS for. */
  function summaryOf(it) {
    if (it.kind === 'consumable') return D.CONSUMABLES[it.base].desc;
    if (it.kind === 'valuable') return 'Treasure! Sell it to Choose Goose for gold.';
    if (it.kind === 'trophy') return `Proof you beat ${D.ENEMIES[D.TROPHIES[it.base].boss].name}. Get it home to claim: ${D.TROPHIES[it.base].perk}`;
    const b = D.BASES[it.base];
    if (b.sword) return D.SWORD_TYPES[b.sword.type].desc;
    if (b.punch) return D.PUNCH_FORMS[b.punch.form].desc;
    return b.text;
  }

  function value(it) {
    if (it.kind === 'consumable') return D.CONSUMABLES[it.base].value * (it.qty || 1);
    if (it.kind === 'valuable') return Math.round(D.VALUABLES[it.base].value * (1 + 0.15 * (it.ilvl - 1))) * (it.qty || 1);
    if (it.kind === 'trophy') return 0;
    return Math.round((D.KINDS[it.kind].value || 12) * D.RARITIES[it.rarity].value * (1 + 0.35 * (it.ilvl - 1)) * (1 + 0.25 * (it.upg || 0)) * (it.set ? 1.3 : 1));
  }
  const sellPrice = (it, S) => (it.kind === 'trophy' ? 0 : Math.max(1, Math.round(value(it) * (1 + ((S && S.sellBonus) || 0)))));
  const buyPrice = (it, S) => Math.max(1, Math.round(value(it) * 2.5 * Math.max(0.5, 1 - ((S && S.buyDiscount) || 0))));
  function salvageYield(it) {
    if (!isGear(it)) return null;
    return { dust: Math.max(1, Math.round(value(it) / 5)), shards: it.rarity >= 4 ? 3 : it.rarity === 3 ? 1 : 0 };
  }

  /* ---------- drop tables ---------- */
  function rollRarity(tier, luck, min) {
    const w = [52, 30, 13 + tier * 1.2, 3.5 + tier * 0.8, 0.6 + tier * 0.3, tier >= 5 ? (tier - 4) * 0.18 : 0];
    const lf = 1 + (luck || 0);
    for (let r = 2; r < w.length; r++) w[r] *= Math.pow(lf, r * 0.6);
    let r = R.weighted(w.map((x, i) => [x, i]));
    if (min && r < min) r = min;
    return r;
  }
  const KIND_W = { sword: 2, helmet: 1, armor: 1, gauntlets: 1, boots: 1, pack: 0.7, instrument: 3.2, collar: 1.8, relic: 2.6 };
  function pickKind(hero) {
    const usable = (k) => !hero || D.KINDS[k].hero === hero || D.KINDS[k].hero === 'any';
    const favor = hero && R.chance(0.6);
    return R.weighted(Object.keys(KIND_W).map((k) => [favor && !usable(k) ? 0 : KIND_W[k], k]));
  }
  function rollUnique(tier, rarity, kind, hero) {
    const ok = (id, strictKind) => { const u = D.UNIQUES[id]; return u.rarity === rarity && u.minTier <= tier && (!strictKind || u.kind === kind); };
    let pool = Object.keys(D.UNIQUES).filter((id) => ok(id, true));
    if (!pool.length) pool = Object.keys(D.UNIQUES).filter((id) => ok(id, false) && (!hero || D.KINDS[D.UNIQUES[id].kind].hero === hero || D.KINDS[D.UNIQUES[id].kind].hero === 'any'));
    if (!pool.length) pool = Object.keys(D.UNIQUES).filter((id) => ok(id, false));
    if (!pool.length && rarity === 5) return rollUnique(tier, 4, kind, hero);
    return pool.length ? R.pick(pool) : null;
  }
  function rollGear(tier, o) {
    o = o || {};
    const rarity = rollRarity(tier, o.luck, o.minRarity);
    const ilvl = U.clamp(tier + (o.ilvlBonus || 0), 1, 10);
    const kind = o.kind || pickKind(o.hero);
    if (rarity >= 4) { const u = rollUnique(tier, rarity, kind, o.hero); if (u) return makeItem({ unique: u, ilvl }); }
    const r = Math.min(3, rarity);
    if (D.KINDS[kind].piece && r >= 2 && tier >= 2 && R.chance(0.3)) {
      const set = R.pick(Object.keys(D.SETS));
      return makeItem({ base: D.SETS[set].pieces[kind][0], set, rarity: r, ilvl });
    }
    const bases = Object.keys(D.BASES).filter((b) => D.BASES[b].kind === kind);
    return makeItem({ base: R.pick(bases), rarity: r, ilvl });
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
  const CONS_W = [[6, 'bacon_pancakes'], [4, 'candy'], [1.6, 'burrito'], [2.5, 'ice_cream'], [2.5, 'science_potion'], [3, 'gunter_bomb'], [2, 'pocket_watch'], [1, 'rainbow_flare'], [1.5, 'skeleton_key'], [0.8, 'perfect_sandwich'], [2, 'garlic_bread'], [2, 'hot_sauce']];
  const rollConsumable = () => makeConsumable(R.weighted(CONS_W), 1);
  function rollAny(tier, o) {
    const pick = R.weighted([[46, 'gear'], [32, 'valuable'], [22, 'consumable']]);
    if (pick === 'gear') return rollGear(tier, o);
    if (pick === 'valuable') return rollValuable(tier, o);
    return rollConsumable();
  }

  /* What falls out of things. Returns { items, gold }. S = the stats of the hero doing the looting. */
  function drops(source, tier, S, o) {
    o = o || {};
    const luck = ((S && S.luck) || 0) + (o.luckBonus || 0);
    const hero = S && S.id;
    const g = { luck, hero };
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
        items.push(rollGear(tier, g), rollAny(tier, g));
        if (R.chance(0.45 * lf)) items.push(rollAny(tier, g));
        break;
      case 'vaultChest':
        gold = R.int(30, 60) * tier;
        items.push(rollGear(tier, Object.assign({ minRarity: 2, ilvlBonus: 1 }, g)), rollValuable(tier, { minRarity: 2 }), rollAny(tier, g));
        if (R.chance(0.3)) items.push(rollGear(tier, Object.assign({ minRarity: 4 }, g)));
        break;
      case 'enemy':
        gold = R.int(1, 4) * tier;
        if (R.chance(0.09 * lf)) items.push(rollGear(tier, g));
        if (R.chance(0.05 * lf)) items.push(rollValuable(tier));
        if (R.chance(0.05)) items.push(rollConsumable());
        break;
      case 'elite':
        gold = R.int(40, 70) * tier;
        items.push(rollGear(tier, Object.assign({ minRarity: 2, ilvlBonus: 1 }, g)), rollValuable(tier, { minRarity: 1 }));
        if (R.chance(0.25 * lf)) items.push(rollGear(tier, Object.assign({ minRarity: 4 }, g)));
        break;
      case 'boss':
        gold = R.int(150, 220) * tier;
        items.push(rollGear(tier, Object.assign({ minRarity: 4, ilvlBonus: 1 }, g)), rollGear(tier, Object.assign({ minRarity: 3, ilvlBonus: 1 }, g)), rollValuable(tier, { minRarity: 3 }), rollAny(tier, g));
        if (tier >= 6 && R.chance(0.35)) items.push(rollGear(tier, Object.assign({ minRarity: 5 }, g)));
        break;
      default: break;
    }
    if (o.extra) for (let i = 0; i < o.extra; i++) items.push(rollAny(tier, g));
    gold = Math.round(gold * (1 + ((S && S.goldFind) || 0)));
    return { items, gold };
  }

  DT.meta.loot = { makeItem, makeConsumable, makeValuable, makeTrophy, nameOf, artOf, iconOf, effects, summaryOf, value, sellPrice, buyPrice, salvageYield, reqLevel, heroFor, isGear,
    rollRarity, rollGear, rollValuable, rollConsumable, rollAny, rollAffixes, rollPower, powerPool, drops, weaponDmg, powerP };
})();
