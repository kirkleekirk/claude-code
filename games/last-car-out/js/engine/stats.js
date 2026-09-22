/* Aggregate the player's stats, flags and hooks from level, skills, gear, sets and memories. */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;

  const BASE = () => ({
    maxHp: 0, armor: 0, dmgPct: 0, dmgFlat: 0, critChance: 0.05, critDmg: 1.5, dodge: 0.05,
    maxFocus: 10, focusRegen: 2, ap: 3, abilityPower: 0, lootFind: 0, lifesteal: 0, thorns: 0,
    bleedChance: 0, statusResist: 0, backpack: 10, pouch: 1, sight: 1, instabilitySlow: 0,
    xpGain: 0, sellBonus: 0, buyDiscount: 0, healBonus: 0, maxHpPct: 0, dmgTaken: 0,
  });

  function compute(G) {
    const L = G.level;
    const S = BASE();
    S.maxHp = 60 + 8 * (L - 1);
    const flags = {};
    const hooks = {};
    const addStats = (o) => { if (o) for (const k in o) S[k] = (S[k] || 0) + o[k]; };
    const addFlags = (o) => {
      if (!o) return;
      for (const k in o) {
        const v = o[k];
        if (typeof v === 'boolean') flags[k] = flags[k] || v;
        else flags[k] = (flags[k] || 0) + v;
      }
    };
    const addHooks = (o, src) => { if (o) for (const k in o) (hooks[k] = hooks[k] || []).push({ fn: o[k], src }); };

    for (const id in G.skills) {
      const r = G.skills[id];
      const node = D.SKILLS[id];
      if (!node || !r) continue;
      if (node.stats) addStats(node.stats(r, L));
      if (node.flags) addFlags(node.flags(r));
      if (node.hooks) addHooks(node.hooks(r), node.name);
    }

    const relics = new Set();
    let weapon = null;
    for (const slot of D.SLOTS) {
      const item = G.equip[slot.id];
      if (!item) continue;
      const info = LCO.engine.loot.itemStats(item);
      addStats(info.stats);
      if (item.kind === 'weapon') weapon = info.weapon;
      if (item.kind === 'offhand' && info.props) {
        const pr = Object.assign({}, info.props);
        if (pr.sight) { S.sight += pr.sight; delete pr.sight; }
        addFlags(pr);
      }
      if (item.power) {
        const pw = D.MINOR_POWERS[item.power];
        if (pw) { addFlags(pw.flags); addHooks(pw.hooks, pw.name); }
      }
      if (item.relic) {
        const rd = D.RELICS[item.relic];
        if (rd) { relics.add(item.relic); addFlags(rd.flags); addHooks(rd.hooks, rd.name); }
      }
    }
    for (const id in D.SETS) {
      const set = D.SETS[id];
      if (set.pieces.every((p) => relics.has(p))) { addStats(set.stats); addFlags(set.flags); S.setActive = (S.setActive || []).concat(id); }
    }
    for (const m of G.memories || []) {
      const md = D.MEMORIES[m];
      if (md && md.stats) addStats(md.stats);
    }

    S.maxHp = Math.max(1, Math.round(S.maxHp * (1 + S.maxHpPct)));
    S.dodge = flags.noDodge ? 0 : U.clamp(S.dodge, 0, 0.6);
    S.critChance = U.clamp(S.critChance, 0, 0.95);
    S.statusResist = U.clamp(S.statusResist, 0, 0.8);
    S.instabilitySlow = U.clamp(S.instabilitySlow, 0, 0.6);
    S.lootFind = Math.max(0, S.lootFind);
    S.backpack = Math.max(4, Math.round(S.backpack));
    S.pouch = Math.max(0, Math.round(S.pouch));
    S.sight = U.clamp(Math.round(S.sight), 1, 4);
    S.maxFocus = Math.max(1, Math.round(S.maxFocus));
    S.armor = Math.max(0, Math.round(S.armor));
    S.weapon = weapon || { min: 2, max: 4, ap: 1, hits: 1, props: {}, name: 'Bare Hands', icon: 'gauntlet' };
    S.flags = flags;
    S.hooks = hooks;
    S.level = L;
    S.relics = relics;
    return S;
  }

  /* Armor → damage reduction. */
  function armorReduction(armor) { return Math.min(0.75, armor / (armor + 50)); }

  /* Ability damage/healing scale: grows with level and Ability Power. */
  function spell(n, S) { return Math.max(1, Math.round(n * (1 + 0.07 * (S.level - 1)) * (1 + S.abilityPower))); }

  LCO.engine.stats = { compute, armorReduction, spell };
})();
