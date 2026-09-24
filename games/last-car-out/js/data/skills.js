/* Skill tree: 5 branches x 7 tiers. A tier opens once enough points sit in its branch.
   node.stats(r, L) / node.flags(r) / node.hooks(r) take the node rank r (and player level L). */
(function () {
  'use strict';
  const D = LCO.data;
  const p = (x) => Math.round(x * 100) + '%';

  D.BRANCHES = [
    { id: 'passenger',  name: 'Passenger',  motto: 'The art of getting out alive.',        icon: 'ticket' },
    { id: 'denizen',    name: 'Denizen',    motto: 'Fight like the train’s wildest.',      icon: 'fang' },
    { id: 'conductor',  name: 'Conductor',  motto: 'Machines, signals, and the rules.',     icon: 'gear' },
    { id: 'reflection', name: 'Reflection', motto: 'Tricks borrowed from the Mirror World.', icon: 'mirror' },
    { id: 'corruption', name: 'Corruption', motto: 'Power the train never meant to give.', icon: 'tar' },
  ];
  D.TIER_REQ = [0, 0, 3, 6, 9, 12, 15, 18]; /* index = tier */

  const SKILLS = {};
  function N(branch, id, tier, col, name, max, o) {
    SKILLS[id] = Object.assign({ id, branch, tier, col, name, max }, o);
  }

  /* ---------------- PASSENGER ---------------- */
  N('passenger', 'pa_pockets', 1, 0, 'Deep Pockets', 3, { desc: (r) => `+${2 * r} Backpack slots.`, stats: (r) => ({ backpack: 2 * r }) });
  N('passenger', 'pa_firstaid', 1, 1, 'First Aid', 1, { ability: 'first_aid' });
  N('passenger', 'pa_hardened', 1, 2, 'Road-Hardened', 3, { desc: (r) => `+${6 * r}% Max HP.`, stats: (r) => ({ maxHpPct: 0.06 * r }) });
  N('passenger', 'pa_scavenger', 2, 0, "Scavenger's Eye", 3, { desc: (r) => `+${8 * r}% Loot Find.`, stats: (r) => ({ lootFind: 0.08 * r }) });
  N('passenger', 'pa_lining', 2, 1, 'Secure Lining', 2, { req: 'pa_firstaid', desc: (r) => `+${r} Secure Pouch ${r === 1 ? 'slot' : 'slots'}. The pouch survives death.`, stats: (r) => ({ pouch: r }) });
  N('passenger', 'pa_pathfinder', 2, 2, 'Pathfinder', 2, { desc: (r) => `See ${r} ${r === 1 ? 'room' : 'rooms'} further. Instability rises ${10 * r}% slower.`, stats: (r) => ({ sight: r, instabilitySlow: 0.1 * r }) });
  N('passenger', 'pa_secondwind', 3, 0, 'Second Wind', 1, { desc: () => 'Once per raid, when you would fall, stay up at 1 HP with Guard worth 25% of max HP.',
    hooks: () => ({ onLethal(C) { if (C.raidOnce('second_wind')) { C.p.hp = 1; C.gainGuard(Math.round(C.p.maxHp * 0.25)); C.log('Second Wind — you refuse to fall.', 'good'); return true; } return false; } }) });
  N('passenger', 'pa_duck', 3, 1, 'Duck and Cover', 1, { req: 'pa_lining', ability: 'duck_cover' });
  N('passenger', 'pa_medic', 3, 2, 'Field Medic', 2, { desc: (r) => `+${15 * r}% healing. Consumables heal ${25 * r}% more.`, stats: (r) => ({ healBonus: 0.15 * r }), flags: (r) => ({ consumableHeal: 0.25 * r }) });
  N('passenger', 'pa_lostfound', 4, 0, 'Lost & Found', 3, { desc: (r) => `When you die, each lost item has a ${12 * r}% chance to turn up in your stash.`, flags: (r) => ({ lostFound: 0.12 * r }) });
  N('passenger', 'pa_haggler', 4, 1, 'Haggler', 2, { desc: (r) => `Sell for ${10 * r}% more, buy for ${10 * r}% less.`, stats: (r) => ({ sellBonus: 0.1 * r, buyDiscount: 0.1 * r }) });
  N('passenger', 'pa_forager', 4, 2, 'Forager', 2, { desc: (r) => `Caches have a ${20 * r}% chance to hold an extra item and ${15 * r}% more Tickets.`, flags: (r) => ({ forager: 0.2 * r, foragerTickets: 0.15 * r }) });
  N('passenger', 'pa_cord', 5, 0, 'Emergency Cord', 1, { desc: () => 'Once per raid, pull the cord to extract from any room outside a fight. A random third of your backpack is lost in the scramble.', flags: () => ({ emergencyCord: true }) });
  N('passenger', 'pa_adrenal', 5, 2, 'Adrenal Surge', 1, { ability: 'adrenal_surge' });
  N('passenger', 'pa_ironwill', 6, 0, 'Iron Will', 2, { desc: (r) => `+${12 * r}% Status Resist. Dying raises your Number ${2 * r} less.`, stats: (r) => ({ statusResist: 0.12 * r }), flags: (r) => ({ deathNumberReduce: 2 * r }) });
  N('passenger', 'pa_seasoned', 6, 2, 'Seasoned Traveler', 3, { desc: (r) => `+${6 * r}% Experience and +${4 * r}% Dodge.`, stats: (r) => ({ xpGain: 0.06 * r, dodge: 0.04 * r }) });
  N('passenger', 'pa_lastcar', 7, 1, 'Last Car Out', 1, { desc: () => 'Collapse no longer hurts you. While the car collapses you gain +1 AP and +40% damage, and extracting doubles your Experience and Ticket haul.', flags: () => ({ lastCarOut: true }) });

  /* ---------------- DENIZEN ---------------- */
  N('denizen', 'de_hands', 1, 0, 'Heavy Hands', 5, { desc: (r) => `+${6 * r}% Weapon Damage.`, stats: (r) => ({ dmgPct: 0.06 * r }) });
  N('denizen', 'de_cleave', 1, 1, 'Cleave', 1, { ability: 'cleave' });
  N('denizen', 'de_hide', 1, 2, 'Thick Hide', 3, { desc: (r) => `+${3 * r} Armor.`, stats: (r) => ({ armor: 3 * r }) });
  N('denizen', 'de_bloodletter', 2, 0, 'Bloodletter', 3, { desc: (r) => `Strikes have a +${12 * r}% chance to cause 2 Bleed.`, stats: (r) => ({ bleedChance: 0.12 * r }) });
  N('denizen', 'de_bellow', 2, 1, 'Bellow', 1, { req: 'de_cleave', ability: 'bellow' });
  N('denizen', 'de_momentum', 2, 2, 'Momentum', 3, { desc: (r) => `Each Strike after the first in a turn deals +${8 * r}% more (stacking).`, flags: (r) => ({ momentum: 0.08 * r }) });
  N('denizen', 'de_crush', 3, 0, 'Crushing Blow', 1, { ability: 'crushing_blow' });
  N('denizen', 'de_brutal', 3, 1, 'Brutality', 3, { desc: (r) => `+${4 * r}% Crit Chance and +${10 * r}% Crit Damage.`, stats: (r) => ({ critChance: 0.04 * r, critDmg: 0.1 * r }) });
  N('denizen', 'de_vigor', 3, 2, 'Vigor', 3, { desc: (r) => `+${12 * r} Max HP.`, stats: (r) => ({ maxHp: 12 * r }) });
  N('denizen', 'de_bloodthirst', 4, 0, 'Bloodthirst', 3, { desc: (r) => `+${3 * r}% Lifesteal.`, stats: (r) => ({ lifesteal: 0.03 * r }) });
  N('denizen', 'de_unstoppable', 4, 1, 'Unstoppable', 1, { desc: () => 'You cannot be Stunned or made Weak.', flags: () => ({ stunImmune: true, weakImmune: true }) });
  N('denizen', 'de_rampage', 4, 2, 'Rampage', 2, { desc: (r) => 'Your first kill each turn refunds 1 AP' + (r >= 2 ? ' and 3 Focus.' : '.'),
    hooks: (r) => ({ onKill(C) { if (C.turnOnce('rampage')) { C.gainAp(1); if (r >= 2) C.gainFocus(3); } } }) });
  N('denizen', 'de_whirlwind', 5, 0, 'Whirlwind', 1, { req: 'de_crush', ability: 'whirlwind' });
  N('denizen', 'de_barbs', 5, 2, 'Barbed Hide', 2, { desc: (r) => `+${r} Thorns per 2 levels (min ${3 * r}).`, stats: (r, L) => ({ thorns: Math.max(3 * r, r * Math.floor(L / 2)) }) });
  N('denizen', 'de_berserker', 6, 0, 'Berserker', 2, { desc: (r) => `Below half HP, deal ${15 * r}% more damage and take ${10 * r}% less.`, flags: (r) => ({ berserk: r }) });
  N('denizen', 'de_execute', 6, 2, 'Execute', 1, { ability: 'execute' });
  N('denizen', 'de_primal', 7, 1, 'Heart of the Beast', 1, { ability: 'primal_form' });

  /* ---------------- CONDUCTOR ---------------- */
  N('conductor', 'co_arc', 1, 0, 'Arc Bolt', 1, { ability: 'arc_bolt' });
  N('conductor', 'co_tinker', 1, 1, 'Tinkerer', 3, { desc: (r) => `+${10 * r}% Ability Power.`, stats: (r) => ({ abilityPower: 0.1 * r }) });
  N('conductor', 'co_capacitor', 1, 2, 'Capacitor', 3, { desc: (r) => `+${3 * r} Max Focus.` + (r >= 3 ? ' +1 Focus per turn.' : ' At rank 3, +1 Focus per turn.'), stats: (r) => ({ maxFocus: 3 * r, focusRegen: r >= 3 ? 1 : 0 }) });
  N('conductor', 'co_sentry', 2, 0, 'Sentry Lamp', 1, { req: 'co_arc', ability: 'sentry_lamp' });
  N('conductor', 'co_recycler', 2, 1, 'Recycler', 2, { desc: (r) => `+${25 * r}% Scrap from salvage.` + (r >= 2 ? ' Salvage has a 15% chance to yield Glimmer.' : ''), flags: (r) => ({ scrapBonus: 0.25 * r, glimmerSalvage: r >= 2 ? 0.15 : 0 }) });
  N('conductor', 'co_lockwork', 2, 2, 'Lockwork', 2, { desc: (r) => `Pick vault locks without a key: ${50 * r}% chance.`, flags: (r) => ({ lockpick: 0.5 * r }) });
  N('conductor', 'co_overclock', 3, 0, 'Overclock', 1, { ability: 'overclock' });
  N('conductor', 'co_static', 3, 1, 'Static Field', 3, { desc: (r) => `When hit, ${12 * r}% chance to give the attacker 2 Chill.`,
    hooks: (r) => ({ onTakeDamage(C, attacker) { if (attacker && attacker.hp > 0 && Math.random() < 0.12 * r) C.addStatus(attacker, 'chill', 2); } }) });
  N('conductor', 'co_schedule', 3, 2, 'Schedule Keeper', 2, { desc: (r) => `Instability rises ${12 * r}% slower.`, stats: (r) => ({ instabilitySlow: 0.12 * r }) });
  N('conductor', 'co_chain', 4, 0, 'Chain Lightning', 1, { req: 'co_sentry', ability: 'chain_lightning' });
  N('conductor', 'co_jammer', 4, 1, 'Signal Jammer', 2, { desc: (r) => `Enemy buffs, summons, and wind-ups have a ${20 * r}% chance to fizzle.`, flags: (r) => ({ jammer: 0.2 * r }) });
  N('conductor', 'co_plating', 4, 2, 'Plated Chassis', 3, { desc: (r) => `+${2 * r} Armor. Brace grants ${20 * r}% more Guard.`, stats: (r) => ({ armor: 2 * r }), flags: (r) => ({ braceBonus: 0.2 * r }) });
  N('conductor', 'co_twin', 5, 0, 'Twin Lamps', 1, { req: 'co_chain', desc: () => 'Sentry Lamp deploys two lamps that last 2 turns longer.', flags: () => ({ twinLamps: true }) });
  N('conductor', 'co_precision', 5, 2, 'Precision Tools', 2, { desc: (r) => `Abilities can critically hit, with +${8 * r}% extra crit chance.`, flags: (r) => ({ abilityCrit: 0.08 * r }) });
  N('conductor', 'co_signal', 6, 0, 'Stopping Signal', 1, { ability: 'stopping_signal' });
  N('conductor', 'co_efficient', 6, 2, 'Efficient Design', 2, { desc: (r) => 'Abilities cost 1 less Focus.' + (r >= 2 ? ' Cooldowns are 1 turn shorter.' : ' At rank 2, cooldowns are 1 turn shorter.'), flags: (r) => ({ abilityDiscount: 1, cdReduce: r >= 2 ? 1 : 0 }) });
  N('conductor', 'co_protocol', 7, 1, 'Protocol One-One', 1, { ability: 'protocol_one_one' });

  /* ---------------- REFLECTION ---------------- */
  N('reflection', 're_keen', 1, 0, 'Keen Edge', 3, { desc: (r) => `+${5 * r}% Crit Chance.`, stats: (r) => ({ critChance: 0.05 * r }) });
  N('reflection', 're_shadowstep', 1, 1, 'Shadowstep', 1, { ability: 'shadowstep' });
  N('reflection', 're_sidestep', 1, 2, 'Sidestep', 3, { desc: (r) => `+${4 * r}% Dodge.`, stats: (r) => ({ dodge: 0.04 * r }) });
  N('reflection', 're_backstab', 2, 0, 'Backstab', 2, { desc: (r) => `+${30 * r}% damage to Stunned enemies and enemies winding up.`, flags: (r) => ({ backstab: 0.3 * r }) });
  N('reflection', 're_silvered', 2, 1, 'Silvered', 3, { desc: (r) => `+${15 * r}% Crit Damage.`, stats: (r) => ({ critDmg: 0.15 * r }) });
  N('reflection', 're_smoke', 2, 2, 'Smoke Bomb', 1, { req: 're_shadowstep', ability: 'smoke_bomb' });
  N('reflection', 're_double', 3, 0, 'Mirror Double', 1, { ability: 'mirror_double' });
  N('reflection', 're_evasion', 3, 1, 'Evasion Master', 2, { desc: (r) => `Gain ${r} Focus whenever you dodge or an image absorbs a hit.`, hooks: (r) => ({ onDodge(C) { C.gainFocus(r); } }) });
  N('reflection', 're_grace', 3, 2, "Flec's Grace", 1, { desc: () => 'Start every fight with a Mirror Image.', hooks: () => ({ onCombatStart(C) { C.addStatus(C.p, 'mirror', 1); } }) });
  N('reflection', 're_shatter', 4, 0, 'Glass Shatter', 1, { req: 're_double', ability: 'glass_shatter' });
  N('reflection', 're_opportunist', 4, 1, 'Opportunist', 2, { desc: (r) => `+${15 * r}% damage to enemies suffering any debuff.`, flags: (r) => ({ opportunist: 0.15 * r }) });
  N('reflection', 're_quicksilver', 4, 2, 'Quicksilver', 2, { desc: (r) => '+1 AP on the first turn of each fight.' + (r >= 2 ? ' You also start Hidden.' : ''),
    hooks: (r) => ({ onCombatStart(C) { C.p.apBonusNext += 1; if (r >= 2) C.addStatus(C.p, 'hidden', 1); } }) });
  N('reflection', 're_twin', 5, 0, 'Twin Reflection', 1, { req: 're_shatter', desc: () => 'Mirror Double lasts 2 turns longer and copies 75% of each Strike.', flags: () => ({ twinReflection: true }) });
  N('reflection', 're_glassfang', 5, 2, 'Glass Fang', 3, { desc: (r) => `Critical hits deal bonus damage equal to ${3 * r}% of the target's max HP (${r}% against bosses).`, flags: (r) => ({ glassFang: 0.03 * r }) });
  N('reflection', 're_hall', 6, 0, 'Hall of Mirrors', 1, { ability: 'hall_of_mirrors' });
  N('reflection', 're_perfect', 6, 2, 'Perfect Reflection', 2, { desc: (r) => `${15 * r}% chance to bounce an enemy's debuff back at them.`, flags: (r) => ({ reflectDebuff: 0.15 * r }) });
  N('reflection', 're_flip', 7, 1, 'The Flip Side', 1, { ability: 'flip_side' });

  /* ---------------- CORRUPTION ---------------- */
  N('corruption', 'cr_blight', 1, 0, 'Blight', 1, { ability: 'blight' });
  N('corruption', 'cr_pact', 1, 1, 'Dark Pact', 3, { desc: (r) => `+${10 * r}% Weapon Damage and Ability Power, but −${4 * r}% Max HP.`, stats: (r) => ({ dmgPct: 0.1 * r, abilityPower: 0.1 * r, maxHpPct: -0.04 * r }) });
  N('corruption', 'cr_siphon', 1, 2, 'Siphon', 3, { desc: (r) => `Heal for ${15 * r}% of the Corruption damage you deal.`, flags: (r) => ({ corruptLeech: 0.15 * r }) });
  N('corruption', 'cr_bloodprice', 2, 0, 'Blood Price', 1, { desc: () => 'When you are short on Focus, abilities take 3 HP per missing point instead.', flags: () => ({ bloodPrice: true }) });
  N('corruption', 'cr_drain', 2, 1, 'Tape Drain', 1, { req: 'cr_blight', ability: 'tape_drain' });
  N('corruption', 'cr_spread', 2, 2, 'Spreading Rot', 2, { desc: (r) => `When a Corrupted enemy dies, ${50 * r}% of its Corruption spreads to every other enemy.`, flags: (r) => ({ spreadRot: 0.5 * r }) });
  N('corruption', 'cr_fester', 3, 0, 'Festering', 3, { desc: (r) => `Corruption on enemies grows by ${1 + r} each turn instead of 1.`, flags: (r) => ({ festering: r }) });
  N('corruption', 'cr_unmake', 3, 1, 'Unmake', 1, { ability: 'unmake' });
  N('corruption', 'cr_numb', 3, 2, 'Numbness', 2, { desc: (r) => `Every rise in your Number is ${r} smaller (never below 1).`, flags: (r) => ({ numberGainReduce: r }) });
  N('corruption', 'cr_embrace', 4, 0, "Ghom's Embrace", 2, { desc: (r) => `When hit, ${15 * r}% chance to smear 3 Corruption onto the attacker.`,
    hooks: (r) => ({ onTakeDamage(C, attacker) { if (attacker && attacker.hp > 0 && Math.random() < 0.15 * r) C.addStatus(attacker, 'corrupt', 3); } }) });
  N('corruption', 'cr_soultax', 4, 1, 'Soul Tax', 1, { desc: () => 'Kills restore 2 Focus and 5% of max HP.', hooks: () => ({ onKill(C) { C.gainFocus(2); C.heal(Math.round(C.p.maxHp * 0.05)); } }) });
  N('corruption', 'cr_dread', 4, 2, 'Dread', 1, { ability: 'dread' });
  N('corruption', 'cr_offering', 5, 0, 'Blood Offering', 1, { req: 'cr_fester', ability: 'blood_offering' });
  N('corruption', 'cr_tarskin', 5, 2, 'Tar Skin', 2, { desc: (r) => `At or below 35% HP, take ${12 * r}% less damage.`, flags: (r) => ({ tarSkin: 0.12 * r }) });
  N('corruption', 'cr_pandemic', 6, 0, 'Pandemic', 1, { desc: () => 'Blight hits every enemy.', flags: () => ({ pandemic: true }) });
  N('corruption', 'cr_grudge', 6, 2, 'Undying Grudge', 1, { desc: () => 'Once per raid, when you would fall, explode for 40% of your max HP against every enemy and rise at 20% HP. Your Number rises by 3.',
    hooks: () => ({ onLethal(C) { if (!C.raidOnce('grudge')) return false; C.p.hp = Math.round(C.p.maxHp * 0.2); for (const e of C.alive()) C.damage(e, Math.round(C.p.maxHp * 0.4), { src: 'power', label: 'Grudge', ignoreBlock: true }); C.numberDelta(3); C.log('Undying Grudge — you tear yourself back together.', 'bad'); return true; } }) });
  N('corruption', 'cr_eclipse', 7, 1, 'Eclipse', 1, { ability: 'eclipse' });

  D.SKILLS = SKILLS;
  D.SKILL_LIST = Object.values(SKILLS);
  D.fmtP = p;
})();
