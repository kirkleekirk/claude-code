/* Powers: special properties that change HOW you fight (not just numbers).
   Mathematical items roll one Power from their kind's pool; uniques have fixed signature effects.
   A power returns `stats` (normal numbers) and/or `mods` (behaviour switches read by game/combat.js).
   p = power strength: grows with item tier, upgrades, and some skill nodes. */
(function () {
  'use strict';
  const D = DT.data;
  const pc = (v) => Math.round(v * 100) + '%';
  const s1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

  D.POWERS = {
    /* ---------- swords (Finn's attacks) ---------- */
    beam_slash:    { name: 'Beam Slash', kinds: ['sword'], icon: 'bolt', mods: (p) => ({ beamEvery: 3, beamDmg: 0.7 * p }), desc: (p) => `Every 3rd swing also fires a Sword Beam that flies through enemies for ${pc(0.7 * p)} damage.` },
    thunder_edge:  { name: 'Thunder Edge', kinds: ['sword'], icon: 'bolt', stats: (p) => ({ shockChance: 0.25 * p }), desc: (p) => `Hits have a ${pc(0.25 * p)} chance to Shock: lightning jumps to 2 more enemies.` },
    frostbite:     { name: 'Frostbite', kinds: ['sword', 'instrument', 'gauntlets'], icon: 'snow', stats: (p) => ({ chillChance: 0.35 * p }), desc: (p) => `Hits have a ${pc(0.35 * p)} chance to Chill. Chilling an already-Chilled enemy Freezes it.` },
    blazing:       { name: 'Blazing', kinds: ['sword', 'instrument', 'gauntlets'], icon: 'flame', stats: (p) => ({ burnChance: 0.3 * p }), desc: (p) => `Hits have a ${pc(0.3 * p)} chance to set enemies on fire (Burn).` },
    serrated:      { name: 'Serrated', kinds: ['sword'], icon: 'drop', stats: (p) => ({ bleedChance: 0.35 * p }), desc: (p) => `Hits have a ${pc(0.35 * p)} chance to cause Bleeding. Bleeding stacks up to 3 times.` },
    earthshaker:   { name: 'Earthshaker', kinds: ['sword'], icon: 'target', mods: (p) => ({ finisherQuake: 0.8 * p }), desc: (p) => `The last hit of your combo sends a shockwave around you for ${pc(0.8 * p)} damage.` },
    twin_strike:   { name: 'Twin Strike', kinds: ['sword', 'instrument'], icon: 'sword', mods: (p) => ({ echoChance: 0.22 * p }), desc: (p) => `${pc(0.22 * p)} chance for an attack to instantly hit a second time for half damage.` },
    heros_mercy:   { name: 'Hero’s Mercy', kinds: ['sword'], icon: 'skull', mods: (p) => ({ executeBelow: Math.min(0.25, 0.12 * p) }), desc: (p) => `Your attacks instantly defeat regular enemies with less than ${pc(Math.min(0.25, 0.12 * p))} health left.` },
    vampire_bite:  { name: 'Vampire Bite', kinds: ['sword', 'instrument'], icon: 'drop', stats: (p) => ({ lifesteal: 0.05 * p }), desc: (p) => `Heal for ${pc(0.05 * p)} of the damage your attacks deal (Lifesteal).` },
    battle_rhythm: { name: 'Battle Rhythm', kinds: ['sword', 'instrument', 'gauntlets'], icon: 'music', mods: (p) => ({ frenzy: 0.1 * p }), desc: (p) => `Every enemy you defeat gives +${pc(0.1 * p)} attack speed for 4 seconds. Stacks 3 times.` },
    algebraic:     { name: 'Algebraic!', kinds: ['relic', 'sword', 'instrument'], icon: 'star', stats: (p) => ({ meterGain: 0.35 * p }), desc: (p) => `Your MATHEMATICAL! super meter fills ${pc(0.35 * p)} faster.` },
    giant_slayer:  { name: 'Giant Slayer', kinds: ['relic', 'sword', 'instrument'], icon: 'crown', mods: (p) => ({ vsBig: 0.3 * p }), desc: (p) => `+${pc(0.3 * p)} damage to elites and bosses.` },
    /* ---------- instruments (Jake's punch) ---------- */
    sustain:       { name: 'Sustain', kinds: ['instrument'], icon: 'music', mods: (p) => ({ linger: 0.8 * p }), desc: (p) => `Your fist can hang in the air ${s1(0.8 * p)}s longer. Hold attack to keep it out and steer it with your aim — it hits everything it passes through.` },
    power_chord:   { name: 'Power Chord', kinds: ['instrument'], icon: 'fist', mods: (p) => ({ pierce: p >= 1.3 ? 3 : 2 }), desc: (p) => `Your punch goes straight through up to ${p >= 1.3 ? 3 : 2} extra enemies.` },
    bass_drop:     { name: 'Bass Drop', kinds: ['instrument'], icon: 'bomb', mods: (p) => ({ explode: 0.5 * p }), desc: (p) => `Punches explode on impact for ${pc(0.5 * p)} damage to everything around the target.` },
    harmony:       { name: 'Harmony', kinds: ['instrument'], icon: 'fan', mods: () => ({ split: 2 }), desc: () => 'Every punch throws 2 extra fists that fan out to the sides.' },
    electric:      { name: 'Electric', kinds: ['instrument'], icon: 'bolt', mods: (p) => ({ chain: 2, chainMult: 0.45 * p }), desc: (p) => `Punches zap 2 more enemies nearby for ${pc(0.45 * p)} damage.` },
    cold_jazz:     { name: 'Cold Jazz', kinds: ['instrument', 'relic'], icon: 'snow', mods: (p) => ({ primaryFreeze: 0.12 * p }), desc: (p) => `Your attacks have a ${pc(0.12 * p)} chance to Freeze enemies solid.` },
    encore_yank:   { name: 'Encore Yank', kinds: ['instrument'], icon: 'hook', mods: () => ({ pull: 1 }), desc: () => 'Your fist drags the enemies it hits back toward you.' },
    reverb:        { name: 'Reverb', kinds: ['instrument'], icon: 'refresh', mods: () => ({ returnHit: 1 }), desc: () => 'Your fist hits everything again on the way back.' },
    knockout_note: { name: 'Knockout Note', kinds: ['instrument'], icon: 'star', stats: (p) => ({ stunChance: 0.15 * p }), desc: (p) => `Punches have a ${pc(0.15 * p)} chance to Stun for 1 second.` },
    soundwave:     { name: 'Soundwave', kinds: ['instrument'], icon: 'wind', mods: (p) => ({ beamEvery: 3, beamDmg: 0.7 * p }), desc: (p) => `Every 3rd punch also blasts a sound wave that flies through enemies for ${pc(0.7 * p)} damage.` },
    /* ---------- helmets ---------- */
    clear_head:    { name: 'Clear Head', kinds: ['helmet', 'collar'], icon: 'clock', stats: (p) => ({ cdr: 0.12 * p }), desc: (p) => `Abilities recharge ${pc(0.12 * p)} faster.` },
    eagle_eye:     { name: 'Eagle Eye', kinds: ['helmet'], icon: 'target', stats: (p) => ({ crit: 0.08 * p, critDmg: 0.15 * p }), desc: (p) => `+${pc(0.08 * p)} crit chance and +${pc(0.15 * p)} crit damage.` },
    brave_heart:   { name: 'Brave Heart', kinds: ['helmet', 'armor'], icon: 'heart', mods: (p) => ({ lowHpDmg: 0.3 * p }), desc: (p) => `While below 35% health you deal ${pc(0.3 * p)} more damage.` },
    treasure_sense:{ name: 'Treasure Sense', kinds: ['helmet', 'pack'], icon: 'eye', mods: () => ({ revealMap: 1 }), stats: (p) => ({ luck: 0.1 * p }), desc: (p) => `Every chest and exit on the train shows on your radar. +${pc(0.1 * p)} luck.` },
    brainwaves:    { name: 'Brainwaves', kinds: ['relic', 'helmet'], icon: 'clock', mods: (p) => ({ cdOnKill: 0.5 * p }), desc: (p) => `Each enemy you defeat knocks ${s1(0.5 * p)}s off your ability cooldowns.` },
    /* ---------- body armor ---------- */
    peppermint_guard: { name: 'Peppermint Guard', kinds: ['armor', 'collar'], icon: 'shield', mods: (p) => ({ blockEvery: Math.max(4, Math.round(8 / p)) }), desc: (p) => `Completely block one hit every ${Math.max(4, Math.round(8 / p))} seconds.` },
    spiky:         { name: 'Spiky', kinds: ['armor', 'collar'], icon: 'star', stats: (p) => ({ thorns: 0.5 * p }), desc: (p) => `Enemies that hit you take ${pc(0.5 * p)} of the damage back.` },
    frost_armor:   { name: 'Frost Armor', kinds: ['armor', 'collar'], icon: 'snow', mods: () => ({ hurtChill: 1 }), stats: (p) => ({ armor: Math.round(4 * p) }), desc: (p) => `Enemies that hit you get Chilled. +${Math.round(4 * p)} armor.` },
    second_wind:   { name: 'Second Wind', kinds: ['armor'], icon: 'heal', mods: (p) => ({ secondWind: Math.min(0.6, 0.35 * p) }), desc: (p) => `Once per trip, when you would be knocked out, you pop back up with ${pc(Math.min(0.6, 0.35 * p))} health.` },
    /* ---------- gauntlets ---------- */
    quick_hands:   { name: 'Quick Hands', kinds: ['gauntlets'], icon: 'wind', stats: (p) => ({ atkSpd: 0.15 * p }), desc: (p) => `Attack ${pc(0.15 * p)} faster.` },
    strong_arms:   { name: 'Strong Arms', kinds: ['gauntlets'], icon: 'fist', stats: (p) => ({ primaryDmg: 0.18 * p }), desc: (p) => `Your sword combo deals ${pc(0.18 * p)} more damage.` },
    crushing:      { name: 'Crushing', kinds: ['gauntlets', 'relic'], icon: 'fist', mods: (p) => ({ vsDisabled: 0.35 * p }), desc: (p) => `+${pc(0.35 * p)} damage to Frozen, Stunned or Rooted enemies.` },
    /* ---------- boots ---------- */
    fire_walk:     { name: 'Fire Walk', kinds: ['boots', 'collar'], icon: 'flame', mods: () => ({ fireTrail: 1 }), desc: () => 'Your dodge leaves a trail of fire that Burns enemies.' },
    static_step:   { name: 'Static Step', kinds: ['boots'], icon: 'bolt', mods: () => ({ dashShock: 1 }), desc: () => 'Dodging through enemies Shocks them.' },
    swift:         { name: 'Swift', kinds: ['boots'], icon: 'dash', stats: (p) => ({ speed: 0.1 * p, dashCd: 0.2 * p }), desc: (p) => `+${pc(0.1 * p)} move speed, and your dodge recharges ${pc(0.2 * p)} faster.` },
    double_dash:   { name: 'Double Dodge', kinds: ['boots'], icon: 'dash', mods: () => ({ dashCharges: 1 }), desc: () => 'Store up 2 dodges at once.' },
    /* ---------- backpacks ---------- */
    coin_magnet:   { name: 'Coin Magnet', kinds: ['pack', 'relic'], icon: 'coin', mods: () => ({ magnet: 4 }), stats: (p) => ({ goldFind: 0.1 * p }), desc: (p) => `Coins fly to you from much further away. +${pc(0.1 * p)} gold.` },
    extra_pouch:   { name: 'Extra Pouch', kinds: ['pack'], icon: 'pancake', stats: () => ({ belt: 1 }), desc: () => '+1 snack belt slot.' },
    lunchbox:      { name: 'Lunchbox', kinds: ['pack', 'collar'], icon: 'pancake', stats: (p) => ({ healPower: 0.5 * p }), desc: (p) => `Snacks heal ${pc(0.5 * p)} more.` },
    bigger_inside: { name: 'Bigger on the Inside', kinds: ['pack'], icon: 'bag', stats: () => ({ backpack: 3 }), desc: () => '+3 backpack slots.' },
    /* ---------- new Powers from the new lines ---------- */
    hot_head:      { name: 'Hot Head', kinds: ['helmet', 'collar'], icon: 'flame', mods: (p) => ({ killBurst: 0.6 * p }), desc: (p) => `Enemies you defeat explode in fire for ${pc(0.6 * p)} damage, setting everything nearby on fire (Burn).` },
    snow_globe:    { name: 'Snow Globe', kinds: ['relic', 'collar'], icon: 'snow', mods: () => ({ frostBurst: 1 }), stats: (p) => ({ chillChance: 0.1 * p }), desc: (p) => `${pc(0.1 * p)} chance on hit to Chill. Enemies defeated while Chilled or Frozen Chill everything around them.` },
    wizard_wisdom: { name: 'Wizard Wisdom', kinds: ['helmet', 'relic', 'collar'], icon: 'star', mods: (p) => ({ cdOnKill: 0.3 * p }), stats: (p) => ({ abilityPower: 0.1 * p }), desc: (p) => `Abilities deal ${pc(0.1 * p)} more damage, and each enemy you defeat knocks ${s1(0.3 * p)}s off your ability cooldowns.` },
    vampire_ward:  { name: 'Vampire Ward', kinds: ['armor', 'collar', 'relic'], icon: 'drop', stats: (p) => ({ lifesteal: 0.03 * p, regen: 0.003 * p }), desc: (p) => `Heal for ${pc(0.03 * p)} of the damage your attacks deal, and regenerate ${(0.3 * p).toFixed(1)}% health per second.` },
    bucket_charge: { name: 'Bucket Charge', kinds: ['boots', 'armor', 'collar'], icon: 'dash', mods: (p) => ({ dashStun: Math.min(1.2, 0.6 * p) }), desc: (p) => `Your dodge roll Stuns every enemy you roll through for ${s1(Math.min(1.2, 0.6 * p))}s.` },
    crystal_skin:  { name: 'Crystal Skin', kinds: ['armor', 'collar'], icon: 'crystal', stats: (p) => ({ thorns: 0.25 * p, armorPct: 0.1 * p }), desc: (p) => `+${pc(0.1 * p)} armor, and enemies that hit you take ${pc(0.25 * p)} of the damage back.` },
    approx_knowledge: { name: 'Approximate Knowledge', kinds: ['relic', 'helmet'], icon: 'eye', stats: (p) => ({ crit: 0.06 * p, luck: 0.1 * p }), desc: (p) => `You know approximately many things: +${pc(0.06 * p)} crit chance and +${pc(0.1 * p)} luck.` },
    lich_whisper:  { name: 'Lich Whisper', kinds: ['relic', 'sword', 'instrument'], icon: 'skull', mods: (p) => ({ lowHpDmg: 0.5 * p, lowHpLifesteal: 0.08 * p }), desc: (p) => `While below 35% health you deal ${pc(0.5 * p)} more damage and heal for ${pc(0.08 * p)} of your attack damage.` },
    geode_guard:   { name: 'Geode Guard', kinds: ['gauntlets', 'helmet'], icon: 'shield', mods: (p) => ({ blockEvery: Math.max(5, Math.round(10 / p)) }), desc: (p) => `A crystal plate pops up to completely block one hit every ${Math.max(5, Math.round(10 / p))} seconds.` },
    future_sight:  { name: 'Future Sight', kinds: ['helmet', 'relic'], icon: 'eye', stats: (p) => ({ dodge: 0.08 * p }), desc: (p) => `You see attacks coming: +${pc(0.08 * p)} chance to dodge hits.` },
    tadpole_swarm: { name: 'Tadpole Swarm', kinds: ['instrument'], icon: 'fan', mods: () => ({ split: 1 }), stats: (p) => ({ primaryDmg: 0.08 * p }), desc: (p) => `Every punch throws 1 extra fist, like a little wizard tadpole. +${pc(0.08 * p)} attack damage.` },
    hair_trigger:  { name: 'Hair Trigger', kinds: ['sword', 'instrument', 'gauntlets'], icon: 'bolt', mods: () => ({ dashShock: 1 }), stats: (p) => ({ shockChance: 0.12 * p }), desc: (p) => `Staticky like a Hair Ape: ${pc(0.12 * p)} chance on hit to Shock, and dodging through enemies Shocks them.` },
    lucky:         { name: 'Lucky', kinds: ['relic', 'pack', 'helmet'], icon: 'star', stats: (p) => ({ luck: 0.2 * p }), desc: (p) => `+${pc(0.2 * p)} luck: better loot, more often.` },
    /* ---------- collars (Jake) ---------- */
    magic_tag:     { name: 'Magic Tag', kinds: ['collar', 'relic'], icon: 'sparkle', stats: (p) => ({ abilityPower: 0.22 * p }), desc: (p) => `Abilities deal ${pc(0.22 * p)} more damage.` },
    big_bark:      { name: 'Big Bark', kinds: ['collar'], icon: 'volume', mods: () => ({ castStun: 3 }), desc: () => 'Using an ability Stuns enemies close to you for half a second.' },
    stretchy_collar: { name: 'Stretchy Collar', kinds: ['collar'], icon: 'tummy', stats: () => ({ safe: 1 }), desc: () => '+1 Tummy slot. Items in your Tummy are safe even if you get knocked out.' },
    encore:        { name: 'Encore', kinds: ['relic', 'collar'], icon: 'music', mods: (p) => ({ echoAbility: 0.15 * p }), desc: (p) => `${pc(0.15 * p)} chance for an ability to happen a second time for free.` },
    /* ---------- relics (either hero) ---------- */
    frozen_heart:  { name: 'Frozen Heart', kinds: ['relic'], icon: 'snow', mods: (p) => ({ primaryFreeze: 0.15 * p, freezeDur: 0.3 * p }), desc: (p) => `Your attacks have a ${pc(0.15 * p)} chance to Freeze enemies solid for ${s1(1.2 + 0.3 * p)} seconds.` },
    shatter:       { name: 'Shatter', kinds: ['relic'], icon: 'crystal', mods: (p) => ({ shatter: 0.6 * p, vsCold: 0.2 * p }), desc: (p) => `+${pc(0.2 * p)} damage to Chilled and Frozen enemies. Hitting a Frozen enemy Shatters the ice for ${pc(0.6 * p)} damage to everything nearby.` },
    ember:         { name: 'Ember', kinds: ['relic'], icon: 'flame', mods: (p) => ({ burnAura: 0.25 * p }), desc: (p) => `Every second you scorch nearby enemies for ${pc(0.25 * p)} damage and set them on fire.` },
    pixel_pal:     { name: 'Pixel Pal', kinds: ['relic'], icon: 'bmo', mods: (p) => ({ bmoDrone: 1, droneDmg: 0.6 * p }), desc: (p) => `A tiny pixel buddy floats beside you and zaps an enemy for ${pc(0.6 * p)} damage every second.` },
    ice_bolt:      { name: 'Ice Bolt', kinds: ['relic'], icon: 'snow', mods: (p) => ({ iceBolts: 2.5, boltDmg: 0.7 * p }), desc: (p) => `Every 2.5 seconds, fire an ice bolt at the nearest enemy for ${pc(0.7 * p)} damage. It Chills.` },
    boom:          { name: 'Boom', kinds: ['relic'], icon: 'bomb', mods: (p) => ({ killBurst: 0.5 * p }), desc: (p) => `Defeated enemies explode for ${pc(0.5 * p)} damage and set their neighbors on fire.` },
    bubble:        { name: 'Bubble', kinds: ['relic'], icon: 'shield', mods: (p) => ({ castShield: 0.1 * p }), desc: (p) => `Using an ability wraps you in a shield worth ${pc(0.1 * p)} of your max health.` },
    warm_pie:      { name: 'Warm Pie', kinds: ['relic'], icon: 'heart', mods: () => ({ pieHeal: 20 }), desc: () => 'Every 20 seconds, you eat some pie and heal 15% of your max health.' },
  };

  /* How behaviour switches combine when several items have them. Default: add. */
  D.MOD_RULES = {
    beamEvery: 'min', igniteEvery: 'min', rhythmEvery: 'min', blockEvery: 'min', iceBolts: 'min', pieHeal: 'min',
    executeBelow: 'max', secondWind: 'max', magnet: 'max', castStun: 'max', dashStun: 'max',
    returnHit: 'or', pull: 'or', wideArc: 'or', revealMap: 'or', hurtChill: 'or', fireTrail: 'or', rainbowTrail: 'or', dashShock: 'or',
    kbImmune: 'or', frostBurst: 'or', burnSpread: 'or', abilityChill: 'or', wildMagic: 'or', snackDamage: 'or', freeSnack: 'or', explodeChill: 'or',
  };

  /* Keywords the UI highlights, with a plain explanation on hover. */
  D.GLOSSARY = {
    Chilled: 'Slowed by 45%. Chill it again while it’s Chilled and it Freezes.',
    Chill: 'Slows an enemy by 45%. Chill it again while it’s Chilled and it Freezes.',
    Frozen: 'Stuck in a block of ice: can’t move or attack. Bosses and elites break free faster.',
    Freeze: 'Traps an enemy in ice: it can’t move or attack for a while. Bosses and elites break free faster.',
    Shatters: 'Hitting a Frozen enemy breaks the ice and deals bonus damage to everything nearby.',
    Shatter: 'Hitting a Frozen enemy breaks the ice and deals bonus damage to everything nearby.',
    Burning: 'On fire: takes damage every second for 3 seconds.',
    Burn: 'Sets an enemy on fire: it takes damage every second for 3 seconds.',
    Bleeding: 'Takes damage every second for 4 seconds. Stacks up to 3 times.',
    Shock: 'Lightning jumps from the enemy to 2 more nearby. Shocked enemies take 15% more damage for 2 seconds.',
    Shocks: 'Lightning jumps from the enemy to 2 more nearby. Shocked enemies take 15% more damage for 2 seconds.',
    Stunned: 'Seeing stars: can’t move or attack for a moment.',
    Stun: 'Knocks an enemy silly: it can’t move or attack for a moment.',
    Stuns: 'Knocks an enemy silly: it can’t move or attack for a moment.',
    Rooted: 'Stuck in place by roots. It can still attack if you get close.',
    Root: 'Traps an enemy in roots: it can’t move, but can still attack if you get close.',
    Fear: 'Scared: runs away from you and can’t attack.',
    Lifesteal: 'You heal for part of the damage your attacks deal.',
    Elites: 'Tough named enemies with a gold ring under their feet. They drop better loot.',
    'crit chance': 'Chance for a hit to be a critical hit, which deals bonus crit damage.',
    'crit damage': 'How hard critical hits hit. 150% means a crit deals one and a half times normal damage.',
    'ability damage': 'Makes abilities hit harder. Jake’s skill tree has lots of it.',
    'Tummy': 'Jake’s safe pocket. Items in it come home even if you get knocked out.',
    'Hat Stash': 'Finn’s safe pocket (under his hat!). Items in it come home even if you get knocked out.',
    'MATHEMATICAL!': 'Your super. The meter fills as you fight; press Q when it’s full.',
  };
})();
