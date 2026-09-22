/* Stats for Finn, Jake and the team, from level, skills, gear, relics, princesses and journey perks. */
(function () {
  'use strict';
  const D = AE.data;
  const U = AE.U;
  const M = AE.meta;

  /* Stats that belong to the whole team rather than one hero. */
  const TEAM_KEYS = new Set(['backpack', 'tummy', 'luck', 'goldFind', 'xp', 'blizzardSlow', 'interactSpeed', 'buyDiscount', 'sellBonus', 'healPower',
    'reviveSpeed', 'reviveHp', 'switchCd', 'tagStrike', 'lastStand', 'autoRevive', 'healShare', 'ultraSuper', 'bffRage']);
  const WEAPON_SLOT = { finn: 'finnWeapon', jake: 'jakeWeapon' };
  const GEAR_SLOT = { finn: 'finnGear', jake: 'jakeGear' };

  function heroBase(G, id) {
    const b = D.HERO_BASE[id];
    return {
      id, maxHp: b.hp + b.hpPerLevel * (G.level - 1), hp: 0, hpPct: 0, armor: 0, dmg: 0, dmgFlat: 0, crit: 0.05, critDmg: 1.5, atkSpd: 0, speed: 0, cdr: 0,
      lifesteal: 0, dodge: 0.03, reach: 0, knockback: 0, burnChance: 0, chillChance: 0, bleedChance: 0, stunChance: 0, meterGain: 0, companion: 0,
      companionArmor: 0, finisher: 0, finisherBeam: 0, riposte: 0, vsDisabled: 0, killHeal: 0, regen: 0, blinkChance: 0, dashCd: 0, aftershock: 0,
      rhythm: 0, shieldReflect: 0, hooks: {}, baseSpeed: b.speed, radius: b.radius, baseDashCd: b.dashCd,
    };
  }

  function compute(G) {
    const H = { finn: heroBase(G, 'finn'), jake: heroBase(G, 'jake') };
    const T = { backpack: 8, tummy: 1, luck: 0, goldFind: 0, xp: 0, blizzardSlow: 0, interactSpeed: 0, buyDiscount: 0, sellBonus: 0, healPower: 0,
      reviveSpeed: 0, reviveHp: 0, switchCd: 0, tagStrike: 0, lastStand: 0, autoRevive: 0, healShare: 0, ultraSuper: 0, bffRage: 0, hooks: {} };
    const addTo = (target, o) => { for (const k in o) target[k] = (target[k] || 0) + o[k]; };
    const add = (scope, o) => {
      if (!o) return;
      const team = {}, hero = {};
      for (const k in o) (TEAM_KEYS.has(k) ? team : hero)[k] = o[k];
      addTo(T, team);
      if (scope === 'finn' || scope === 'both' || scope === 'team') addTo(H.finn, hero);
      if (scope === 'jake' || scope === 'both' || scope === 'team') addTo(H.jake, hero);
    };
    const addHooks = (scope, hooks) => {
      if (!hooks) return;
      const targets = scope === 'finn' ? [H.finn.hooks] : scope === 'jake' ? [H.jake.hooks] : [H.finn.hooks, H.jake.hooks, T.hooks];
      for (const t of targets) addTo(t, hooks);
    };

    for (const id in G.skills) {
      const n = D.SKILLS[id];
      const r = G.skills[id];
      if (n && r && n.stats) add(n.scope, n.stats(r));
    }
    for (const slot of D.SLOTS) {
      const it = G.equip[slot.id];
      if (!it) continue;
      const scope = slot.hero;
      add(scope, M.loot.itemStats(it).stats);
      if (it.power) { const pw = D.POWERS[it.power]; if (pw.hook) addHooks(scope, { [pw.hook]: 1 }); }
      if (it.relic) { addHooks(scope, D.RELICS[it.relic].hooks); G.codex.relics[it.relic] = true; }
    }
    for (const p of D.PRINCESSES) if (G.princesses[p.id]) add('both', p.stats);
    for (const k of G.perks || []) if (D.JOURNEY_PERKS[k]) add('both', D.JOURNEY_PERKS[k].stats);

    for (const id of ['finn', 'jake']) {
      const S = H[id];
      S.maxHp = Math.max(1, Math.round((S.maxHp + S.hp) * (1 + S.hpPct)));
      S.crit = U.clamp(S.crit, 0, 0.9);
      S.dodge = U.clamp(S.dodge, 0, 0.5);
      S.cdr = U.clamp(S.cdr, 0, 0.6);
      S.moveSpeed = S.baseSpeed * Math.max(0.5, 1 + S.speed);
      S.dashCdFinal = S.baseDashCd * Math.max(0.3, 1 - S.dashCd);
      const w = G.equip[WEAPON_SLOT[id]];
      const info = w ? M.loot.itemStats(w).weapon : null;
      S.weapon = info || (id === 'finn' ? { dmg: 4, spd: 1.1, reach: 1, arc: 1, name: 'Bare Fists' } : { dmg: 7, spd: 1, reach: 1, arc: 1, name: 'Bare Paws' });
      S.armorGear = G.equip[GEAR_SLOT[id]];
      /* base damage grows a little with level too */
      S.power = (S.weapon.dmg * (1 + 0.03 * (G.level - 1)) + S.dmgFlat) * (1 + S.dmg);
      S.attackRate = S.weapon.spd * (1 + S.atkSpd);
      S.reachMult = (S.weapon.reach || 1) * (1 + S.reach);
    }
    T.backpack = Math.max(4, Math.round(T.backpack));
    T.tummy = Math.max(0, Math.round(T.tummy));
    T.luck = Math.max(0, T.luck);
    T.blizzardSlow = U.clamp(T.blizzardSlow, 0, 0.5);
    return { finn: H.finn, jake: H.jake, team: T, level: G.level };
  }

  function armorReduction(armor) { return Math.min(0.7, armor / (armor + 60)); }

  M.stats = { compute, armorReduction, TEAM_KEYS };
})();
