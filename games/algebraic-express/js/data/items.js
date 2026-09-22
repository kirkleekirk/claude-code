/* Items: rarities, slots, bases, affixes, minor powers, consumables, valuables. */
(function () {
  'use strict';
  const D = AE.data;

  D.RARITIES = [
    { id: 0, name: 'Plain',        affixes: 0, value: 1,   color: '#9aa0a6' },
    { id: 1, name: 'Radical',      affixes: 1, value: 2.2, color: '#3fb950' },
    { id: 2, name: 'Algebraic',    affixes: 2, value: 4.5, color: '#3d8bfd' },
    { id: 3, name: 'Mathematical', affixes: 3, value: 10,  color: '#a855f7' },
    { id: 4, name: 'Legendary',    affixes: 2, value: 28,  color: '#f59e0b' },
    { id: 5, name: 'Glob-Tier',    affixes: 3, value: 70,  color: '#ec4899' },
  ];

  D.SLOTS = [
    { id: 'finnWeapon', hero: 'finn', kind: 'sword',    name: "Finn's Sword" },
    { id: 'finnGear',   hero: 'finn', kind: 'finnGear', name: "Finn's Gear" },
    { id: 'jakeWeapon', hero: 'jake', kind: 'knuckles', name: "Jake's Fists" },
    { id: 'jakeGear',   hero: 'jake', kind: 'jakeGear', name: "Jake's Gear" },
    { id: 'trinket1',   hero: 'both', kind: 'trinket',  name: 'Trinket' },
    { id: 'trinket2',   hero: 'both', kind: 'trinket',  name: 'Trinket' },
  ];
  D.GEAR_KINDS = ['sword', 'knuckles', 'finnGear', 'jakeGear', 'trinket'];
  D.KIND_LABEL = { sword: 'Sword', knuckles: 'Fist Wear', finnGear: 'Finn Gear', jakeGear: 'Jake Gear', trinket: 'Trinket', consumable: 'Snack & Supply', valuable: 'Treasure' };
  D.BASE_VALUE = { sword: 16, knuckles: 16, finnGear: 14, jakeGear: 14, trinket: 12 };

  /* dmg = weapon base damage at item tier 1. spd = attack speed multiplier. reach / arc = multipliers. */
  D.BASES = {
    wood_sword:     { kind: 'sword', name: 'Wooden Sword',      icon: 'sword', dmg: 7,  spd: 1.15, text: 'Light and quick.' },
    iron_sword:     { kind: 'sword', name: 'Iron Sword',        icon: 'sword', dmg: 9,  spd: 1.0,  text: 'A good, honest sword.' },
    great_sword:    { kind: 'sword', name: 'Great Sword',       icon: 'sword', dmg: 14, spd: 0.72, reach: 1.25, arc: 1.3, text: 'Huge, slow, wide swings.' },
    crystal_sword:  { kind: 'sword', name: 'Crystal Sword',     icon: 'sword', dmg: 8,  spd: 1.05, pstats: { crit: 0.08 }, text: 'It glitters. It crits.' },
    candy_dagger:   { kind: 'sword', name: 'Candy Dagger',      icon: 'sword', dmg: 6,  spd: 1.35, reach: 0.85, text: 'Stabby and sweet.' },
    mitts:          { kind: 'knuckles', name: 'Boxing Mitts',   icon: 'fist', dmg: 11, spd: 1.0,  text: 'Squishy on the outside.' },
    brass_rings:    { kind: 'knuckles', name: 'Brass Rings',    icon: 'fist', dmg: 13, spd: 0.9,  text: 'Jake wears them on every finger.' },
    stone_fists:    { kind: 'knuckles', name: 'Stone Gauntlets', icon: 'fist', dmg: 17, spd: 0.72, text: 'Slow, heavy, satisfying.' },
    bow_wraps:      { kind: 'knuckles', name: 'Viola-Bow Wraps', icon: 'fist', dmg: 10, spd: 1.1,  reach: 1.2, text: 'Extra stretch on every punch.' },
    bear_hat:       { kind: 'finnGear', name: 'Bear Hat',          icon: 'hat', stats: { hp: 12, armor: 2 } },
    hero_tunic:     { kind: 'finnGear', name: 'Hero Tunic',        icon: 'shield', stats: { hp: 8, armor: 4 } },
    candy_plate:    { kind: 'finnGear', name: 'Candy Knight Plate', icon: 'shield', stats: { hp: 20, armor: 6 }, pstats: { speed: -0.05 } },
    adventure_pack: { kind: 'finnGear', name: 'Adventure Backpack', icon: 'bag', stats: { hp: 6, armor: 1, backpack: 2 } },
    dog_collar:     { kind: 'jakeGear', name: 'Dog Collar',        icon: 'collar', stats: { hp: 14, armor: 2 } },
    sweater_vest:   { kind: 'jakeGear', name: 'Knit Sweater Vest', icon: 'shield', stats: { hp: 18, armor: 3 } },
    spiked_collar:  { kind: 'jakeGear', name: 'Spiked Collar',     icon: 'collar', stats: { hp: 10, armor: 5 } },
    fanny_pack:     { kind: 'jakeGear', name: 'Fanny Pack',        icon: 'bag', stats: { hp: 10, armor: 1, backpack: 2 } },
    candy_charm:    { kind: 'trinket', name: 'Candy Charm',  icon: 'star',  pstats: { luck: 0.06 } },
    lucky_sock:     { kind: 'trinket', name: 'Lucky Sock',   icon: 'star',  pstats: { crit: 0.03 } },
    gem_ring:       { kind: 'trinket', name: 'Gem Ring',     icon: 'gem',   pstats: { dmg: 0.05 } },
    tiny_bell:      { kind: 'trinket', name: 'Tiny Bell',    icon: 'music', pstats: { speed: 0.04 } },
    bone_charm:     { kind: 'trinket', name: 'Bone Charm',   icon: 'skull', stats: { hp: 10 } },
    cloud_puff:     { kind: 'trinket', name: 'Cloud Puff',   icon: 'wind',  pstats: { cdr: 0.04 } },
  };

  const ALL = ['sword', 'knuckles', 'finnGear', 'jakeGear', 'trinket'];
  const WPN = ['sword', 'knuckles'];
  const GEAR = ['finnGear', 'jakeGear', 'trinket'];
  D.AFFIXES = {
    hp:        { stat: 'hp',          range: [8, 16],      type: 'flat', pre: 'Hearty',  slots: ALL },
    armor:     { stat: 'armor',       range: [1, 3],       type: 'flat', pre: 'Sturdy',  slots: GEAR },
    dmg:       { stat: 'dmg',         range: [0.06, 0.12], type: 'pct',  pre: 'Brutal',  slots: WPN.concat('trinket') },
    dmgFlat:   { stat: 'dmgFlat',     range: [1, 3],       type: 'flat', pre: 'Spiky',   slots: WPN },
    crit:      { stat: 'crit',        range: [0.03, 0.06], type: 'pct',  pre: 'Lucky',   slots: WPN.concat('trinket') },
    critDmg:   { stat: 'critDmg',     range: [0.1, 0.25],  type: 'pct',  pre: 'Savage',  slots: WPN },
    atkSpd:    { stat: 'atkSpd',      range: [0.05, 0.1],  type: 'pct',  pre: 'Zippy',   slots: WPN.concat('trinket') },
    speed:     { stat: 'speed',       range: [0.03, 0.07], type: 'pct',  suf: 'of Zoom',        slots: GEAR },
    cdr:       { stat: 'cdr',         range: [0.04, 0.08], type: 'pct',  suf: 'of Brainpower',  slots: GEAR },
    lifesteal: { stat: 'lifesteal',   range: [0.02, 0.04], type: 'pct',  suf: 'of Vampires',    slots: WPN },
    luck:      { stat: 'luck',        range: [0.05, 0.1],  type: 'pct',  suf: 'of Treasure',    slots: GEAR },
    dodge:     { stat: 'dodge',       range: [0.02, 0.05], type: 'pct',  suf: 'of Wiggling',    slots: GEAR },
    meter:     { stat: 'meterGain',   range: [0.08, 0.15], type: 'pct',  suf: 'of Math',        slots: WPN.concat('trinket') },
    reach:     { stat: 'reach',       range: [0.06, 0.12], type: 'pct',  suf: 'of Stretching',  slots: ['knuckles'] },
    burn:      { stat: 'burnChance',  range: [0.06, 0.12], type: 'pct',  suf: 'of Flames',      slots: WPN },
    chill:     { stat: 'chillChance', range: [0.06, 0.12], type: 'pct',  suf: 'of Frost',       slots: WPN },
    gold:      { stat: 'goldFind',    range: [0.08, 0.15], type: 'pct',  suf: 'of Riches',      slots: GEAR },
    xp:        { stat: 'xp',          range: [0.05, 0.1],  type: 'pct',  suf: 'of Learning',    slots: ['trinket'] },
  };

  /* Minor powers roll on Mathematical gear. `hook` names are handled in game/combat.js. */
  D.POWERS = {
    flaming: { name: 'Flaming', desc: 'Hits have a 20% chance to set enemies on fire.', stats: { burnChance: 0.2 } },
    frosty:  { name: 'Frosty',  desc: 'Hits have a 20% chance to chill enemies.', stats: { chillChance: 0.2 } },
    zappy:   { name: 'Zappy',   desc: 'Critical hits zap another nearby enemy for 60% damage.', hook: 'zapOnCrit' },
    vampy:   { name: 'Vampy',   desc: '+5% Lifesteal.', stats: { lifesteal: 0.05 } },
    bouncy:  { name: 'Bouncy',  desc: 'Hits knock enemies back much further.', stats: { knockback: 0.6 } },
    lucky:   { name: 'Lucky',   desc: '+15% Luck.', stats: { luck: 0.15 } },
    speedy:  { name: 'Speedy',  desc: '+10% Move Speed.', stats: { speed: 0.1 } },
    sturdy:  { name: 'Sturdy',  desc: '+6 Armor.', stats: { armor: 6 } },
    healing: { name: 'Healing', desc: 'Heal 4% of max HP whenever you defeat an enemy.', hook: 'healOnKill' },
    mathy:   { name: 'Mathy',   desc: '+30% Super meter gain.', stats: { meterGain: 0.3 } },
  };

  D.CONSUMABLES = {
    bacon_pancakes: { name: 'Bacon Pancakes',      icon: 'pancake', value: 14, rarity: 0, desc: 'Heal the active hero for 35% of max HP. Makin’ bacon pancakes!' },
    burrito:        { name: 'Everything Burrito',  icon: 'heart',   value: 30, rarity: 2, desc: 'Heal both heroes for 50% and wake up a knocked-out buddy.' },
    candy:          { name: 'Candy Kingdom Candy', icon: 'star',    value: 12, rarity: 0, desc: '+35% move speed for 8 seconds.' },
    ice_cream:      { name: 'Ice Cream Sandwich',  icon: 'snow',    value: 18, rarity: 1, desc: 'Freeze every nearby enemy for 2.5 seconds.' },
    science_potion: { name: "PB's Science Potion", icon: 'potion',  value: 22, rarity: 1, desc: '+40% damage for 10 seconds.' },
    gunter_bomb:    { name: 'Gunter Bomb',         icon: 'bomb',    value: 18, rarity: 1, desc: 'Lob a penguin-shaped bomb where you aim. Big boom.' },
    hot_cocoa:      { name: 'Hot Cocoa',           icon: 'cup',     value: 24, rarity: 1, desc: 'Warm up: the blizzard meter drops by 15%.' },
    rainbow_flare:  { name: 'Rainicorn Flare',     icon: 'rainbow', value: 40, rarity: 2, desc: 'Call Lady Rainicorn. Stay near the flare for 6 seconds to fly off the train from anywhere.' },
    skeleton_key:   { name: 'Skeleton Key',        icon: 'key',     value: 30, rarity: 1, desc: 'Opens a locked vault door or treasure chest. Used automatically.' },
  };
  D.STACK_MAX = 5;

  D.VALUABLES = {
    ruby:           { name: 'Ruby',                        icon: 'gem',     rarity: 0, value: 18 },
    sapphire:       { name: 'Sapphire',                    icon: 'gem',     rarity: 0, value: 22 },
    gold_bar:       { name: 'Gold Bar',                    icon: 'coin',    rarity: 1, value: 45 },
    golden_toaster: { name: 'Golden Toaster',              icon: 'cup',     rarity: 1, value: 55 },
    emerald:        { name: 'Huge Emerald',                icon: 'gem',     rarity: 1, value: 60 },
    candy_scepter:  { name: 'Candy Scepter',               icon: 'star',    rarity: 2, value: 95 },
    princess_tiara: { name: 'Spare Princess Tiara',        icon: 'crown',   rarity: 2, value: 120 },
    magic_jar:      { name: 'Jar of Bottled Magic',        icon: 'potion',  rarity: 2, value: 110 },
    mushroom_relic: { name: 'Mushroom War Relic',          icon: 'skull',   rarity: 3, value: 260 },
    guardian_eye:   { name: "Gumball Guardian's Eye",      icon: 'eye',     rarity: 3, value: 300 },
    owl_dust:       { name: 'Cosmic Owl Dream Dust',       icon: 'dust',    rarity: 3, value: 320 },
    crystal_heart:  { name: 'Crystal Dimension Heart',     icon: 'crystal', rarity: 4, value: 900,  minTier: 5 },
    royal_hoard:    { name: "The Ice King's Secret Hoard", icon: 'crown',   rarity: 4, value: 1400, minTier: 6 },
  };
})();
