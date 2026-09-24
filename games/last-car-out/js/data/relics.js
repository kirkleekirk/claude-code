/* Item powers (hooks) and the unique Relic / Engine-Forged items.
   Hook signatures (C = combat API from engine/combat.js):
     onCombatStart(C) onTurnStart(C) onStrike(C, target, hit) onCrit(C, target, hit)
     onKill(C, target) onTakeDamage(C, attacker, amount) onDodge(C, attacker)
     onAbility(C, abilityId) onLethal(C) -> true to prevent death
   stats: merged into player stats. flags: named behaviours the engine checks. */
(function () {
  'use strict';
  const D = LCO.data;
  const pct = (x) => Math.round(x * 100) + '%';

  /* Minor powers roll on Exquisite gear. */
  D.MINOR_POWERS = {
    sparking:   { name: 'Sparking',   desc: 'Strikes have a 20% chance to arc for +40% damage and Chill.',
                  hooks: { onStrike(C, t, hit) { if (!hit.killed && hit.dmg > 0 && Math.random() < 0.2) { C.damage(t, Math.round(hit.dmg * 0.4), { src: 'power', label: 'Spark' }); C.addStatus(t, 'chill', 1); } } } },
    vampiric:   { name: 'Vampiric',   desc: '+5% Lifesteal.', stats: { lifesteal: 0.05 } },
    warding:    { name: 'Warding',    desc: 'Start each fight with Guard equal to 15% of max HP.',
                  hooks: { onCombatStart(C) { C.gainGuard(Math.round(C.p.maxHp * 0.15)); } } },
    hasty:      { name: 'Hasty',      desc: '+1 AP on the first turn of each fight.',
                  hooks: { onCombatStart(C) { C.p.apBonusNext += 1; } } },
    thorny:     { name: 'Thorny',     desc: '+5 Thorns.', stats: { thorns: 5 } },
    lucky:      { name: 'Lucky',      desc: '+15% Loot Find.', stats: { lootFind: 0.15 } },
    resolute:   { name: 'Resolute',   desc: 'You cannot be Stunned.', flags: { stunImmune: true } },
    venomous:   { name: 'Venomous',   desc: 'Strikes apply 1 Corruption.', hooks: { onStrike(C, t, hit) { if (!hit.killed) C.addStatus(t, 'corrupt', 1); } } },
    glinting:   { name: 'Glinting',   desc: 'Critical hits restore 1 Focus.', hooks: { onCrit(C) { C.gainFocus(1); } } },
    farsighted: { name: 'Farsighted', desc: 'All exits in a car are revealed. +1 sight.', stats: { sight: 1 }, flags: { revealExits: true } },
    steady:     { name: 'Steady',     desc: 'Instability rises 10% slower.', stats: { instabilitySlow: 0.1 } },
    mending:    { name: 'Mending',    desc: 'Heal 5% of max HP on kill.', hooks: { onKill(C) { C.heal(Math.round(C.p.maxHp * 0.05)); } } },
  };

  /* Relics: rarity 4 (Relic) or 5 (Engine-Forged). `base` supplies slot, icon and base stats. */
  D.RELICS = {
    glad_hemisphere: {
      name: "Glad-One's Hemisphere", base: 'name_tag', icon: 'coin', rarity: 4, minTier: 2, set: 'one_one',
      lore: 'Half of a very cheerful robot. It hums when you are hurt.',
      desc: 'Heal 10% of max HP at the start of each fight. Once per raid, when you would fall, get back up at 30% HP.',
      hooks: {
        onCombatStart(C) { C.heal(Math.round(C.p.maxHp * 0.1)); },
        onLethal(C) { if (C.raidOnce('glad_revive')) { C.p.hp = Math.round(C.p.maxHp * 0.3); C.log("Glad-One's Hemisphere whirs — you stand back up!", 'good'); return true; } return false; },
      },
    },
    sad_hemisphere: {
      name: "Sad-One's Hemisphere", base: 'name_tag', icon: 'coin', rarity: 4, minTier: 3, set: 'one_one',
      lore: 'The other half. It sighs every few minutes.',
      desc: '+25% Weapon Damage, but you take 10% more damage.',
      stats: { dmgPct: 0.25, dmgTaken: 0.1 },
    },
    corgi_crown: {
      name: 'Crown of the Corgi King', base: 'name_tag', icon: 'crown', rarity: 4, minTier: 1,
      lore: 'Loyal subjects answer the crown, wherever it goes.',
      desc: 'A Corgi Knight fights beside you every fight, biting a random enemy each turn.',
      hooks: { onCombatStart(C) { C.summon({ id: 'corgi', name: 'Corgi Knight', dmg: 4 + C.tier * 3, turns: 99 }); } },
    },
    cats_bell: {
      name: "The Cat's Bell", base: 'lucky_coin', icon: 'badge', rarity: 4, minTier: 1,
      lore: 'She will want it back. She will be charming about it.',
      desc: 'Sell items for 25% more. A merchant is always somewhere in the car.',
      stats: { sellBonus: 0.25 }, flags: { merchantEveryCar: true },
    },
    flip_knife: {
      name: 'Flip, the Mirror Knife', base: 'carving_knife', icon: 'blade', rarity: 4, minTier: 3,
      lore: 'Its reflection cuts a half-second after it does.',
      desc: 'Strikes echo onto another enemy for 50% damage. Critical hits grant a Mirror Image.',
      hooks: {
        onStrike(C, t, hit) { if (hit.dmg > 0) { const o = C.randomEnemy(t); if (o) C.damage(o, Math.round(hit.dmg * 0.5), { src: 'power', label: 'Echo' }); } },
        onCrit(C) { C.addStatus(C.p, 'mirror', 1); },
      },
    },
    steward_lamp: {
      name: "Steward's Searchlight", base: 'rail_lantern', icon: 'lantern', rarity: 4, minTier: 2,
      lore: 'Pried off a Steward. It still sweeps for things out of place.',
      desc: 'The whole car is revealed on arrival. Chilled enemies take 25% more damage.',
      flags: { revealMap: true, chilledBonus: 0.25 },
    },
    chrome_gauntlet: {
      name: 'Chromium Gauntlet', base: 'brass_knuckles', icon: 'gauntlet', rarity: 4, minTier: 4,
      lore: 'Cold enough to make your teeth ache through the glove.',
      desc: 'Strikes apply 1 Chill. Strikes against Stunned enemies shatter for double damage.',
      flags: { shatterStunned: 1 },
      hooks: { onStrike(C, t, hit) { if (!hit.killed) C.addStatus(t, 'chill', 1); } },
    },
    ghom_reel: {
      name: 'Reel of the Ghom', base: 'tape_deck', icon: 'tape', rarity: 4, minTier: 5,
      lore: 'The tape keeps playing after the batteries die.',
      desc: 'Corruption you apply is 2 stacks stronger. Heal for 50% of Corruption damage you deal.',
      flags: { corruptBonus: 2, corruptLeech: 0.5 },
    },
    pocketwatch: {
      name: "The Conductor's Pocketwatch", base: 'pocket_watch', icon: 'watch', rarity: 4, minTier: 2,
      lore: 'Keeps perfect time for a train that never arrives.',
      desc: '+1 AP every third turn. Instability rises 25% slower.',
      stats: { instabilitySlow: 0.25 },
      hooks: { onTurnStart(C) { if (C.p.turn % 3 === 0) { C.gainAp(1); C.log('The Pocketwatch ticks: +1 AP.', 'good'); } } },
    },
    unpunched_ticket: {
      name: 'The Unpunched Ticket', base: 'ticket_stub', icon: 'ticket', rarity: 4, minTier: 3,
      lore: 'Valid for one trip, destination: out.',
      desc: 'Once per raid, extract from any room outside of a fight — keeping everything.',
      flags: { anywhereExtract: true },
    },
    brass_lungs: {
      name: 'Brass Lungs', base: 'boiler_plate', icon: 'plate', rarity: 4, minTier: 3,
      lore: 'Breathes for you when you forget to.',
      desc: '+30 Max HP. While below half HP, heal 6% of max HP at the start of each turn.',
      stats: { maxHp: 30 },
      hooks: { onTurnStart(C) { if (C.p.hp < C.p.maxHp / 2) C.heal(Math.round(C.p.maxHp * 0.06)); } },
    },
    apex_jacket: {
      name: 'Apex Racing Jacket', base: 'travel_coat', icon: 'coat', rarity: 4, minTier: 4,
      lore: 'Stitched with tallies. You do not want to count them.',
      desc: '+15% Weapon Damage. Kills refund 1 AP once per turn. +25% damage to Weak or Stunned enemies.',
      stats: { dmgPct: 0.15 }, flags: { killRefundAp: 1, bullyBonus: 0.25 },
    },
    resonant_prism: {
      name: 'Resonant Prism', base: 'glass_eye', icon: 'crystal', rarity: 4, minTier: 3,
      lore: 'Every hit rings like a struck glass.',
      desc: '+10% Crit Chance and +100% Crit Damage. You cannot dodge.',
      stats: { critChance: 0.1, critDmg: 1.0 }, flags: { noDodge: true },
    },
    beach_parasol: {
      name: 'Beach Car Parasol', base: 'umbrella_spear', icon: 'spear', rarity: 4, minTier: 2,
      lore: 'Smells like sunscreen and salt, somehow, forever.',
      desc: '+10% Dodge. After you Brace, the first enemy to hit you eats a free counter-Strike.',
      stats: { dodge: 0.1 }, flags: { braceCounter: true },
    },
    cardigan: {
      name: 'The Comfortable Cardigan', base: 'knit_sweater', icon: 'sweater', rarity: 4, minTier: 1,
      lore: 'Warm from the dryer, always.',
      desc: '+8 Max Focus. Abilities cost 1 less Focus. Heal 3% of max HP whenever you use an ability.',
      stats: { maxFocus: 8 }, flags: { abilityDiscount: 1 },
      hooks: { onAbility(C) { C.heal(Math.round(C.p.maxHp * 0.03)); } },
    },
    flec_mask: {
      name: 'Mask of a Flec', base: 'pocket_mirror', icon: 'mirror', rarity: 4, minTier: 4,
      lore: 'Wear it and your reflection stops copying you.',
      desc: 'Start each fight with 2 Mirror Images. When an image takes a hit, the attacker is struck back.',
      flags: { mirrorRetaliate: true },
      hooks: { onCombatStart(C) { C.addStatus(C.p, 'mirror', 2); } },
    },
    hourglass: {
      name: 'Hourglass of the Unmade', base: 'pocket_watch', icon: 'clock', rarity: 4, minTier: 3,
      lore: 'The sand falls up.',
      desc: 'Each kill lowers the car’s Instability by 3. +10% Experience.',
      stats: { xpGain: 0.1 },
      hooks: { onKill(C) { C.adjustInstability(-3); } },
    },
    engineer_wrench: {
      name: "Engineer's Wrench", base: 'lead_pipe', icon: 'tool', rarity: 4, minTier: 2,
      lore: 'Tightens bolts. Loosens teeth.',
      desc: 'Your summons deal double damage. Strikes have a 25% chance to cut ability cooldowns by 1.',
      flags: { summonDouble: true },
      hooks: { onStrike(C) { if (Math.random() < 0.25) C.reduceCooldowns(1); } },
    },
    voice_tape: {
      name: 'Tape of a Voice You Know', base: 'tape_deck', icon: 'tape', rarity: 4, minTier: 2,
      lore: 'It says your name like it misses you.',
      desc: '+15% Status Resist. Each turn, 35% chance to shake off a debuff and gain 2 Focus.',
      stats: { statusResist: 0.15 },
      hooks: { onTurnStart(C) { if (Math.random() < 0.35) { C.cleanse(1); C.gainFocus(2); } } },
    },
    porters_satchel: {
      name: "Porter's Bottomless Satchel", base: 'porter_vest', icon: 'bag', rarity: 4, minTier: 1,
      lore: 'You have not found the bottom. You have stopped looking.',
      desc: '+6 Backpack slots. +10% Loot Find.',
      stats: { backpack: 6, lootFind: 0.1 },
    },
    locket_keeping: {
      name: 'Locket of Keeping', base: 'lucky_coin', icon: 'pendant', rarity: 4, minTier: 2,
      lore: 'Whatever you put inside, the train cannot take.',
      desc: '+2 Secure Pouch slots.',
      stats: { pouch: 2 },
    },
    /* Engine-Forged */
    heartstone: {
      name: 'Heartstone of the Engine', base: 'glass_eye', icon: 'flame', rarity: 5, minTier: 7,
      lore: 'Still warm. Still beating. Still angry.',
      desc: '+1 AP every turn. Each fight opens with a blast for 12% of every enemy’s max HP (5% against bosses).',
      stats: { ap: 1 },
      hooks: { onCombatStart(C) { for (const e of C.alive()) C.damage(e, Math.round(e.maxHp * (e.boss ? 0.05 : 0.12)), { src: 'power', label: 'Heartstone', ignoreBlock: true }); } },
    },
    pale_key: {
      name: 'The Pale Door Key', base: 'ticket_stub', icon: 'key', rarity: 5, minTier: 6,
      lore: 'It fits a door you have not seen yet.',
      desc: 'Every exit counts as the Far Door. Your Number falls 50% faster.',
      flags: { allExitsFar: true, numberDropBonus: 0.5 },
    },
    train_wheel: {
      name: 'Wheel of the Infinite Train', base: 'fire_axe', icon: 'gear', rarity: 5, minTier: 7,
      lore: 'Pulled from the track. The train did not slow down.',
      desc: 'Strikes hit every enemy at full damage. 20% chance to Stun.',
      flags: { cleaveFull: true, extraStun: 0.2 },
    },
    conductor_mask: {
      name: "The Conductor's Mask", base: 'porter_vest', icon: 'eye', rarity: 5, minTier: 7,
      lore: 'The face of the one who decides which cars exist.',
      desc: 'Enemies deal 20% less damage to you. Immune to Corruption. +25% Status Resist.',
      stats: { statusResist: 0.25 }, flags: { enemyDmgReduce: 0.2, corruptImmune: true },
    },
    rail_spike: {
      name: 'The Infinite Rail Spike', base: 'umbrella_spear', icon: 'spear', rarity: 5, minTier: 6,
      lore: 'Every swing is heavier than the last.',
      desc: 'Every Strike in a fight makes your later Strikes 6% stronger, without limit.',
      flags: { spikeStacking: 0.06 },
    },
    zeroed_glove: {
      name: 'The Zeroed Glove', base: 'lucky_coin', icon: 'gauntlet', rarity: 5, minTier: 6,
      lore: 'Pull it on and the glow on your palm goes quiet.',
      desc: 'Your Number rises half as much. +25% Experience.',
      stats: { xpGain: 0.25 }, flags: { numberGainHalf: true },
    },
  };

  D.SETS = {
    one_one: {
      name: 'One-One, Reunited', pieces: ['glad_hemisphere', 'sad_hemisphere'],
      desc: 'Wear both halves: +1 AP every turn, and your Number cannot rise during the raid.',
      stats: { ap: 1 }, flags: { numberLock: true },
    },
  };

  D.fmtPct = pct;
})();
