/* A hero's final numbers, from level, skill tree, gear (stats, bonuses, Powers, uniques), armor sets,
   boss trophies and journey perks. Also lists every active Power and every known ability for the UI. */
(function () {
  'use strict';
  const D = DT.data;
  const U = DT.U;
  const M = DT.meta;

  function addMod(mods, k, v) {
    const rule = D.MOD_RULES[k] || 'add';
    if (rule === 'min') mods[k] = mods[k] ? Math.min(mods[k], v) : v;
    else if (rule === 'max') mods[k] = Math.max(mods[k] || 0, v);
    else if (rule === 'or') mods[k] = mods[k] || v ? 1 : 0;
    else mods[k] = (mods[k] || 0) + v;
  }

  const BARE = {
    finn: { kind: 'sword', type: 'short', dmg: 4, spd: 1.0, name: 'Bare fists', rarity: 0 },
    jake: { kind: 'instrument', form: 'viola', dmg: 7, spd: 1.0, name: 'Bare paws', rarity: 0 },
  };

  /* o.equip / o.tree / o.level let the UI preview "what if" changes. */
  function compute(G, heroId, o) {
    o = o || {};
    const H = D.HEROES[heroId];
    const C = G.chars[heroId];
    const equip = o.equip || C.equip;
    const tree = o.tree || C.tree;
    const L = o.level || C.level;
    const st = {}, mods = {}, abMods = {};
    const powers = [], abilities = [];
    const addStats = (obj) => { for (const k in obj) st[k] = (st[k] || 0) + obj[k]; };
    const addMods = (obj) => { for (const k in obj) addMod(mods, k, obj[k]); };

    /* skill tree first (it can boost gear Powers) */
    const T = D.TREES[heroId];
    for (const id in tree) {
      const n = T.nodes[id];
      if (!n || !tree[id]) continue;
      if (n.stats) addStats(n.stats);
      if (n.mods) addMods(n.mods);
      if (n.abMods) for (const ab in n.abMods) { abMods[ab] = abMods[ab] || {}; for (const k in n.abMods[ab]) abMods[ab][k] = (abMods[ab][k] || 0) + n.abMods[ab][k]; }
      if (n.type === 'ability') abilities.push({ id: n.ability, src: 'tree', node: id });
    }
    const scale = mods.powerScale || 0;

    /* gear */
    let weapon = null, pieces = 0, legends = 0;
    const setCount = {};
    const locked = (slot) => (slot.level && L < slot.level) || (slot.node && !tree[slot.node]);
    for (const slot of H.slots) {
      const it = equip[slot.id];
      if (!it || locked(slot)) continue;
      const ef = M.loot.effects(it, scale);
      addStats(ef.stats);
      addMods(ef.mods);
      for (const p of ef.powers) powers.push(Object.assign({ source: it.name, rarity: it.rarity, uid: it.uid }, p));
      if (ef.grants) abilities.push({ id: ef.grants, src: 'item', uid: it.uid, itemName: it.name, rarity: it.rarity });
      if (ef.weapon) weapon = Object.assign({ name: it.name, rarity: it.rarity, uid: it.uid }, ef.weapon);
      if (D.KINDS[it.kind].piece) pieces++;
      if (it.set) setCount[it.set] = (setCount[it.set] || 0) + 1;
      if (it.rarity >= 4) legends++;
    }
    /* armor sets */
    const sets = [];
    for (const id in setCount) {
      const def = D.SETS[id];
      const have = setCount[id] + (mods.setReduce || 0);
      const bonuses = [2, 4].map((need) => {
        const b = def.bonus[need];
        const active = have >= need;
        if (active) { if (b.stats) addStats(b.stats); if (b.mods) addMods(b.mods); powers.push({ name: `${def.name} (${need})`, icon: 'armor', text: b.text, kind: 'set', source: 'Armor set', rarity: 3 }); }
        return { need: Math.max(1, need - (mods.setReduce || 0)), text: b.text, active };
      });
      sets.push({ id, name: def.name, color: def.color, count: setCount[id], bonuses });
    }
    /* trophies and journey perks (shared by both heroes) */
    for (const k in G.trophies) if (G.trophies[k] && D.TROPHIES[k]) addStats(D.TROPHIES[k].stats);
    for (const k of G.perks || []) if (D.JOURNEY_PERKS[k]) addStats(D.JOURNEY_PERKS[k].stats);

    const s = (k) => st[k] || 0;
    weapon = weapon || Object.assign({}, BARE[heroId]);
    const S = { id: heroId, name: H.name, level: L, st, mods, abMods, powers, sets, pieces, legends };
    S.maxHp = Math.max(1, Math.round((H.hp + H.hpPerLevel * (L - 1) + s('hp')) * Math.max(0.2, 1 + s('hpPct'))));
    S.armor = Math.max(0, Math.round((s('armor') + (H.armorPerLevel || 0) * (L - 1)) * Math.max(0, 1 + s('armorPct') + (mods.armorPerPiece || 0) * pieces)));
    S.levelMult = 1 + (0.03 + (H.levelDmg || 0)) * (L - 1);
    S.dmgMult = Math.max(0.1, 1 + s('dmg') + (mods.legendDmg || 0) * legends);
    S.power = (weapon.dmg * S.levelMult + s('dmgFlat')) * S.dmgMult;
    S.primaryDmg = s('primaryDmg');
    S.abilityPower = s('abilityPower');
    S.finisherDmg = s('finisherDmg');
    S.crit = U.clamp(0.05 + s('crit'), 0, 0.9);
    S.critDmg = 1.5 + s('critDmg');
    S.atkSpd = s('atkSpd');
    S.attackRate = weapon.spd * Math.max(0.3, 1 + s('atkSpd'));
    S.reachMult = Math.max(0.5, 1 + s('reach'));
    S.moveSpeed = H.speed * Math.max(0.5, 1 + s('speed'));
    S.dashCdFinal = H.dashCd * Math.max(0.3, 1 - s('dashCd'));
    S.dashCharges = 1 + (mods.dashCharges || 0);
    S.cdr = U.clamp(s('cdr'), -0.5, 0.6);
    S.dodge = U.clamp(0.03 + s('dodge'), 0, 0.5);
    for (const k of ['lifesteal', 'regen', 'thorns', 'knockback', 'meterGain', 'killHeal', 'healPower', 'goldFind', 'xp', 'interactSpeed', 'sellBonus']) S[k] = s(k);
    for (const k of ['burnChance', 'chillChance', 'shockChance', 'bleedChance', 'stunChance', 'rootChance', 'freezeChance']) S[k] = U.clamp(s(k), 0, 0.95);
    S.backpack = Math.max(3, H.backpackBase + Math.round(s('backpack')));
    S.belt = U.clamp(H.beltBase + Math.round(s('belt')), 1, 5);
    S.safe = U.clamp(H.safeBase + Math.round(s('safe')), 0, 6);
    S.luck = Math.max(0, s('luck'));
    S.loopSlow = U.clamp(s('loopSlow'), 0, 0.5);
    S.buyDiscount = U.clamp(s('buyDiscount'), 0, 0.5);
    S.scale = mods.bigBoy ? 1.2 : 1;
    S.radius = H.radius * S.scale;
    S.weapon = weapon;
    if (weapon.kind === 'sword') S.swordType = D.SWORD_TYPES[weapon.type];
    else S.form = D.PUNCH_FORMS[weapon.form];
    const seen = new Set();
    S.abilities = abilities.filter((a) => { if (seen.has(a.id)) return false; seen.add(a.id); const h = D.ABILITIES[a.id].hero; return h === heroId || h === 'any'; });
    S.abilitySlots = M.abilitySlots(G, heroId);
    return S;
  }

  function armorReduction(armor) { return Math.min(0.75, armor / (armor + 60)); }

  /* Rough numbers for the stats panel. */
  function offense(S) {
    const critF = 1 + S.crit * (S.critDmg - 1);
    if (S.swordType) {
      const combo = S.swordType.combo;
      const avgMult = U.sum(combo, (c, i) => c.mult) / combo.length + S.finisherDmg * (combo[combo.length - 1].mult / combo.length);
      const avgT = U.sum(combo, (c) => c.t) / combo.length / S.attackRate;
      const hit = S.power * (1 + S.primaryDmg);
      return { hit, perSec: 1 / avgT, dps: (hit * avgMult * critF) / avgT, reach: S.swordType.reach * S.reachMult };
    }
    const f = S.form;
    const t = 0.42 / (S.attackRate * f.spd);
    const hit = S.power * (1 + S.primaryDmg) * f.mult;
    /* one target: about two accordion fists land, and rhythm notes add an extra hit every few punches */
    let per = 1;
    if (f.split) per *= Math.min(f.split, 2);
    const every = (S.mods && S.mods.rhythmEvery) || f.rhythm;
    if (every) per *= 1 + (1.6 + ((S.mods && S.mods.rhythmMult) || 0)) / every;
    return { hit, perSec: 1 / t, dps: (hit * per * critF) / t, reach: f.reach * S.reachMult };
  }

  M.stats = { compute, armorReduction, offense, addMod };
})();
