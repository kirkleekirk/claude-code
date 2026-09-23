/* Items: rarities, kinds (each hero wears different kinds), base items, random bonuses (affixes),
   Finn's armor sets, snacks, treasure, and the plain-English text for every stat. */
(function () {
  'use strict';
  const D = DT.data;
  const pc = (v) => Math.round(v * 100) + '%';
  const sg = (v) => (v >= 0 ? '+' : '−');

  /* Low rarities only raise stats. Mathematical adds a Power. Legendary and Glob-Tier are named uniques. */
  D.RARITIES = [
    { id: 0, name: 'Plain',        affixes: 0, powers: 0, value: 1,   color: '#a7adbb', rule: 'Base stats only.' },
    { id: 1, name: 'Radical',      affixes: 1, powers: 0, value: 2.2, color: '#4cc38a', rule: 'Base stats plus 1 random bonus.' },
    { id: 2, name: 'Algebraic',    affixes: 2, powers: 0, value: 4.5, color: '#4d9bff', rule: 'Base stats plus 2 random bonuses.' },
    { id: 3, name: 'Mathematical', affixes: 2, powers: 1, value: 10,  color: '#b76bff', rule: 'Stats, 2 bonuses and a special Power that changes how you fight.' },
    { id: 4, name: 'Legendary',    affixes: 2, powers: 0, value: 28,  color: '#ffae34', rule: 'A one-of-a-kind named item with signature powers. Some come with their own ability.' },
    { id: 5, name: 'Glob-Tier',    affixes: 3, powers: 0, value: 70,  color: '#ff5fb4', rule: 'The rarest loot on the train. Build-changing powers and their own ability.' },
  ];

  D.KINDS = {
    sword:      { label: 'Sword',      hero: 'finn', slots: ['weapon'], icon: 'sword', value: 18, gear: true, weapon: true },
    helmet:     { label: 'Helmet',     hero: 'finn', slots: ['head'], icon: 'helmet', value: 12, gear: true, piece: true },
    armor:      { label: 'Body Armor', hero: 'finn', slots: ['body'], icon: 'armor', value: 14, gear: true, piece: true },
    gauntlets:  { label: 'Gauntlets',  hero: 'finn', slots: ['arms'], icon: 'gauntlet', value: 12, gear: true, piece: true },
    boots:      { label: 'Boots',      hero: 'finn', slots: ['legs'], icon: 'boots', value: 12, gear: true, piece: true },
    pack:       { label: 'Backpack',   hero: 'finn', slots: ['pack'], icon: 'bag', value: 12, gear: true },
    instrument: { label: 'Instrument', hero: 'jake', slots: ['instrument'], icon: 'music', value: 18, gear: true, weapon: true },
    collar:     { label: 'Collar',     hero: 'jake', slots: ['collar'], icon: 'collar', value: 14, gear: true },
    relic:      { label: 'Relic',      hero: 'any',  slots: ['relic1', 'relic2', 'relic3', 'relic4'], icon: 'relic', value: 16, gear: true },
    consumable: { label: 'Snack', icon: 'pancake' },
    valuable:   { label: 'Treasure', icon: 'gem' },
    trophy:     { label: 'Boss Trophy', icon: 'trophy' },
  };
  D.GEAR_KINDS = Object.keys(D.KINDS).filter((k) => D.KINDS[k].gear);

  /* Base items. stats = flat (grow with item tier), pstats = percentages (grow slowly). */
  D.BASES = {
    /* Finn: swords (the sword type decides the combo) */
    wood_sword:    { kind: 'sword', name: 'Wooden Sword', sword: { type: 'short', dmg: 7, spd: 1.12 }, art: 'sword_wood', text: 'Carved from a branch. Light and quick.' },
    iron_sword:    { kind: 'sword', name: 'Iron Sword', sword: { type: 'short', dmg: 9, spd: 1.0 }, art: 'sword_short', text: 'A good, honest sword.' },
    bone_sword:    { kind: 'sword', name: 'Bone Sword', sword: { type: 'short', dmg: 10, spd: 0.95 }, pstats: { bleedChance: 0.08 }, art: 'sword_bone', text: 'Jagged bone. Leaves nasty cuts.' },
    broadsword:    { kind: 'sword', name: 'Broadsword', sword: { type: 'great', dmg: 14, spd: 1.0 }, art: 'sword_great', text: 'Huge and heavy.' },
    rapier:        { kind: 'sword', name: 'Candy Rapier', sword: { type: 'rapier', dmg: 6.5, spd: 1.0 }, pstats: { crit: 0.08 }, art: 'sword_rapier', text: 'Pointy peppermint. Fast and precise.' },
    crystal_blade: { kind: 'sword', name: 'Crystal Blade', sword: { type: 'crystal', dmg: 9, spd: 1.0 }, art: 'sword_crystal', text: 'It hums when you swing it.' },
    storm_sword:   { kind: 'sword', name: 'Storm Sword', sword: { type: 'short', dmg: 9.5, spd: 1.0 }, pstats: { shockChance: 0.1 }, art: 'sword_storm', text: 'A zig-zag blade full of static. Hits can Shock.' },
    claymore:      { kind: 'sword', name: 'Claymore', sword: { type: 'great', dmg: 15.5, spd: 0.95 }, art: 'sword_claymore', text: 'A two-handed sword taller than Finn.' },
    cutlass:       { kind: 'sword', name: 'Cutlass', sword: { type: 'short', dmg: 8, spd: 1.12 }, pstats: { atkSpd: 0.05 }, art: 'sword_cutlass', text: 'A curved pirate blade. Swishy.' },
    candy_cane:    { kind: 'sword', name: 'Candy Cane Sword', sword: { type: 'rapier', dmg: 7, spd: 1.0 }, pstats: { luck: 0.06 }, art: 'sword_candycane', text: 'A peppermint candy cane sharpened to a point. Candy Kingdom approved.' },
    geode_blade:   { kind: 'sword', name: 'Geode Blade', sword: { type: 'crystal', dmg: 9.5, spd: 0.95 }, stats: { armor: 3 }, art: 'sword_geode', text: 'A slab of geode with a crystal edge. Heavy and tough.' },
    /* Finn: armor */
    bear_hat:   { kind: 'helmet', name: 'Bear Hat', stats: { hp: 10, armor: 2 }, art: 'hat', text: 'Cozy. A lot like Finn’s real hat.' },
    iron_helm:  { kind: 'helmet', name: 'Iron Helm', stats: { armor: 5, hp: 4 }, art: 'helm', text: 'Clang-proof.' },
    wizard_hat: { kind: 'helmet', name: 'Wizard Hat', stats: { hp: 6 }, pstats: { cdr: 0.05 }, art: 'wizard_hat', text: 'A pointy thinking cap.' },
    skull_helm: { kind: 'helmet', name: 'Skull Helm', stats: { armor: 3 }, pstats: { crit: 0.03 }, art: 'skull_helm', text: 'Found on a skeleton who didn’t need it anymore.' },
    bucket_helm: { kind: 'helmet', name: 'Bucket Helm', stats: { armor: 6, hp: 6 }, pstats: { speed: -0.02 }, art: 'helm_bucket', text: 'An actual bucket. The Bucket Knights swear by it.' },
    hunter_hood: { kind: 'helmet', name: 'Hunter’s Hood', stats: { hp: 8 }, pstats: { dodge: 0.03, crit: 0.02 }, art: 'hood', text: 'A dark hood for sneaking up on vampires.' },
    hero_tunic:   { kind: 'armor', name: 'Hero Tunic', stats: { hp: 10, armor: 4 }, pstats: { dodge: 0.03 }, art: 'tunic', text: 'Light and easy to roll around in.' },
    chainmail:    { kind: 'armor', name: 'Chainmail', stats: { armor: 8, hp: 6 }, art: 'chainmail', text: 'Jingly but tough.' },
    knight_plate: { kind: 'armor', name: 'Knight Plate', stats: { armor: 13, hp: 14 }, pstats: { speed: -0.05 }, art: 'plate', text: 'Heavy armor. You walk a little slower.' },
    wizard_robe:  { kind: 'armor', name: 'Wizard Robe', stats: { hp: 8, armor: 3 }, pstats: { abilityPower: 0.08 }, art: 'robe', text: 'Stitched with runes that power up abilities.' },
    hunter_coat:  { kind: 'armor', name: 'Hunter’s Coat', stats: { hp: 10, armor: 6 }, pstats: { lifesteal: 0.02 }, art: 'coat_hunter', text: 'A long coat with a stake in every pocket.' },
    bark_armor:   { kind: 'armor', name: 'Treebark Armor', stats: { hp: 12, armor: 10 }, pstats: { thorns: 0.08 }, art: 'armor_bark', text: 'Grown, not forged. Splintery for anyone who hits it.' },
    leather_gloves:   { kind: 'gauntlets', name: 'Leather Gloves', stats: { armor: 2 }, pstats: { atkSpd: 0.05 }, art: 'gloves', text: 'Better grip, faster swings.' },
    iron_gauntlets:   { kind: 'gauntlets', name: 'Iron Gauntlets', stats: { armor: 5, dmgFlat: 1 }, art: 'gauntlets', text: 'Heavy metal knuckles.' },
    spiked_gauntlets: { kind: 'gauntlets', name: 'Spiked Gauntlets', stats: { armor: 3 }, pstats: { bleedChance: 0.06 }, art: 'gauntlets_spiked', text: 'Spiky knuckles.' },
    geode_knuckles:   { kind: 'gauntlets', name: 'Geode Knuckles', stats: { armor: 3, dmgFlat: 2 }, art: 'gauntlets_geode', text: 'Rocky fists with crystals on the knuckles.' },
    sneakers:     { kind: 'boots', name: 'Sneakers', stats: { armor: 1 }, pstats: { speed: 0.05 }, art: 'sneakers', text: 'Zoom.' },
    iron_boots:   { kind: 'boots', name: 'Iron Boots', stats: { armor: 6 }, pstats: { speed: -0.02 }, art: 'boots_iron', text: 'Stompy.' },
    winged_boots: { kind: 'boots', name: 'Winged Boots', stats: { armor: 2 }, pstats: { dashCd: 0.12 }, art: 'boots_winged', text: 'Little wings. Your roll recharges faster.' },
    slime_boots:  { kind: 'boots', name: 'Slime Boots', stats: { armor: 2 }, pstats: { dodge: 0.04, dashCd: 0.06 }, art: 'boots_slime', text: 'Bouncy and a little gross.' },
    /* Finn: backpacks (decide how much loot he carries out) */
    adventure_pack: { kind: 'pack', name: 'Adventure Pack', stats: { backpack: 2 }, art: 'pack', text: 'Just like Finn’s trusty green backpack.' },
    explorer_pack:  { kind: 'pack', name: 'Explorer Pack', stats: { backpack: 4 }, art: 'pack_big', text: 'Tons of pockets.' },
    snack_sack:     { kind: 'pack', name: 'Snack Sack', stats: { backpack: 1, belt: 1 }, art: 'pack_snack', text: 'Has a pocket just for snacks.' },
    treasure_sack:  { kind: 'pack', name: 'Treasure Sack', stats: { backpack: 3 }, pstats: { goldFind: 0.1 }, art: 'pack_treasure', text: 'A big lumpy sack. Coins find their way into it.' },
    /* Jake: instruments (the instrument decides how his punch works) */
    old_viola:     { kind: 'instrument', name: 'Old Viola', punch: { form: 'viola', dmg: 11, spd: 1.0 }, art: 'viola', text: 'Jake’s favorite kind of instrument.' },
    garage_guitar: { kind: 'instrument', name: 'Garage Guitar', punch: { form: 'guitar', dmg: 9, spd: 1.0 }, art: 'guitar', text: 'Three chords and the truth.' },
    bongo_drums:   { kind: 'instrument', name: 'Bongo Drums', punch: { form: 'drums', dmg: 12, spd: 1.0 }, art: 'drums', text: 'Boom-boom-BOOM.' },
    upright_bass:  { kind: 'instrument', name: 'Upright Bass', punch: { form: 'bass', dmg: 16, spd: 1.0 }, art: 'bass', text: 'Deep, slow and heavy.' },
    brass_trumpet: { kind: 'instrument', name: 'Brass Trumpet', punch: { form: 'trumpet', dmg: 10, spd: 1.0 }, art: 'trumpet', text: 'TOOT.' },
    squeezebox:    { kind: 'instrument', name: 'Squeezebox', punch: { form: 'accordion', dmg: 9, spd: 1.0 }, art: 'accordion', text: 'An accordion. Wheeze!' },
    banjo:         { kind: 'instrument', name: 'Banjo', punch: { form: 'banjo', dmg: 6, spd: 1.0 }, art: 'banjo', text: 'Pickin’ and punchin’.' },
    keytar:        { kind: 'instrument', name: 'Keytar', punch: { form: 'keytar', dmg: 10, spd: 1.0 }, art: 'keytar', text: 'Electrifying.' },
    harmonica:     { kind: 'instrument', name: 'Harmonica', punch: { form: 'harmonica', dmg: 8, spd: 1.0 }, art: 'harmonica', text: 'Pocket-sized blues.' },
    tuba:          { kind: 'instrument', name: 'Tuba', punch: { form: 'tuba', dmg: 13, spd: 1.0 }, art: 'tuba', text: 'OOM-PAH. OOM-PAH.' },
    theremin:      { kind: 'instrument', name: 'Theremin', punch: { form: 'theremin', dmg: 10, spd: 1.0 }, art: 'theremin', text: 'You play it without touching it. Wooo-ooo-ooo.' },
    /* Jake: collars (his only armor) */
    dog_collar:    { kind: 'collar', name: 'Dog Collar', stats: { hp: 14, armor: 3 }, art: 'collar', text: 'A classic.' },
    spiked_collar: { kind: 'collar', name: 'Spiked Collar', stats: { armor: 6 }, pstats: { thorns: 0.1 }, art: 'collar_spiked', text: 'Enemies that hit Jake get poked back.' },
    bell_collar:   { kind: 'collar', name: 'Bell Collar', stats: { hp: 8 }, pstats: { cdr: 0.05 }, art: 'collar_bell', text: 'Jingle jingle. Abilities recharge faster.' },
    bow_tie:       { kind: 'collar', name: 'Fancy Bow Tie', stats: { hp: 8 }, pstats: { abilityPower: 0.08 }, art: 'bow_tie', text: 'Very dapper. Abilities hit harder.' },
    bandana:       { kind: 'collar', name: 'Adventure Bandana', stats: { hp: 10 }, pstats: { speed: 0.05, dodge: 0.02 }, art: 'bandana', text: 'Tied around the neck, for adventure reasons.' },
    crystal_collar:{ kind: 'collar', name: 'Crystal Collar', stats: { armor: 5, hp: 6 }, pstats: { crit: 0.03 }, art: 'collar_crystal', text: 'Studded with Crystal Ant crystals.' },
    /* Relics (either hero) */
    lucky_sock:  { kind: 'relic', name: 'Lucky Sock', pstats: { crit: 0.03 }, art: 'sock', text: 'Never washed. Very lucky.' },
    candy_charm: { kind: 'relic', name: 'Candy Charm', pstats: { luck: 0.08 }, art: 'candy', text: 'Better loot, more often.' },
    gem_ring:    { kind: 'relic', name: 'Gem Ring', pstats: { dmg: 0.04 }, art: 'ring', text: 'Shiny and hard-hitting.' },
    tiny_bell:   { kind: 'relic', name: 'Tiny Bell', pstats: { speed: 0.04 }, art: 'bell', text: 'Ring-a-ding.' },
    bone_charm:  { kind: 'relic', name: 'Bone Charm', stats: { hp: 12 }, art: 'bone', text: 'Sturdy.' },
    cloud_puff:  { kind: 'relic', name: 'Cloud Puff', pstats: { cdr: 0.04 }, art: 'cloud', text: 'Fluffy thoughts, faster abilities.' },
    snail_shell: { kind: 'relic', name: 'Snail Shell', pstats: { xp: 0.05 }, art: 'shell', text: 'Someone waved at you from inside.' },
    garlic_bulb: { kind: 'relic', name: 'Garlic Bulb', stats: { hp: 8 }, pstats: { regen: 0.003 }, art: 'garlic', text: 'Vampires hate it. You smell great.' },
    wizard_eye:  { kind: 'relic', name: 'Wizard’s Eye', pstats: { abilityPower: 0.05 }, art: 'eye_wizard', text: 'A glass eye from Wizard City. It blinks sometimes.' },
    geode_chunk: { kind: 'relic', name: 'Geode Chunk', stats: { armor: 4 }, art: 'geode', text: 'Cracked open. Sparkly inside.' },
    lucky_coin:  { kind: 'relic', name: 'Lucky Coin', pstats: { goldFind: 0.08 }, art: 'coin_lucky', text: 'Heads: you win. Tails: you also win.' },
  };

  /* Random bonuses. type: flat values grow with item tier fast, pct values grow slowly. */
  const WPN = ['sword', 'instrument'];
  const DEF = ['helmet', 'armor', 'gauntlets', 'boots', 'collar'];
  D.AFFIXES = {
    hp:          { stat: 'hp',          range: [8, 16],       type: 'flat', pre: 'Hearty',    kinds: DEF.concat('relic') },
    hpPct:       { stat: 'hpPct',       range: [0.03, 0.06],  type: 'pct',  pre: 'Robust',    kinds: ['armor', 'collar', 'relic'] },
    armor:       { stat: 'armor',       range: [1, 3],        type: 'flat', pre: 'Sturdy',    kinds: DEF },
    dmgFlat:     { stat: 'dmgFlat',     range: [1, 3],        type: 'flat', pre: 'Spiky',     kinds: WPN.concat('gauntlets') },
    dmg:         { stat: 'dmg',         range: [0.05, 0.1],   type: 'pct',  pre: 'Brutal',    kinds: WPN.concat('gauntlets', 'relic', 'helmet') },
    primaryDmg:  { stat: 'primaryDmg',  range: [0.06, 0.12],  type: 'pct',  pre: 'Mighty',    kinds: WPN.concat('gauntlets') },
    crit:        { stat: 'crit',        range: [0.02, 0.05],  type: 'pct',  pre: 'Lucky',     kinds: WPN.concat('helmet', 'gauntlets', 'relic') },
    critDmg:     { stat: 'critDmg',     range: [0.1, 0.25],   type: 'pct',  pre: 'Savage',    kinds: WPN.concat('gauntlets') },
    atkSpd:      { stat: 'atkSpd',      range: [0.04, 0.09],  type: 'pct',  pre: 'Zippy',     kinds: WPN.concat('gauntlets', 'relic') },
    abilityPower:{ stat: 'abilityPower',range: [0.06, 0.12],  type: 'pct',  pre: 'Magical',   kinds: ['instrument', 'collar', 'relic', 'helmet'] },
    cdr:         { stat: 'cdr',         range: [0.03, 0.07],  type: 'pct',  suf: 'of Brainpower', kinds: ['helmet', 'collar', 'relic'] },
    speed:       { stat: 'speed',       range: [0.03, 0.06],  type: 'pct',  suf: 'of Zoom',       kinds: ['boots', 'relic', 'pack'] },
    dashCd:      { stat: 'dashCd',      range: [0.06, 0.12],  type: 'pct',  suf: 'of Rolling',    kinds: ['boots'] },
    lifesteal:   { stat: 'lifesteal',   range: [0.02, 0.04],  type: 'pct',  suf: 'of Vampires',   kinds: WPN },
    dodge:       { stat: 'dodge',       range: [0.02, 0.04],  type: 'pct',  suf: 'of Wiggling',   kinds: ['boots', 'armor', 'collar'] },
    regen:       { stat: 'regen',       range: [0.003, 0.006],type: 'pct',  suf: 'of Mending',    kinds: ['armor', 'collar', 'relic'] },
    reach:       { stat: 'reach',       range: [0.06, 0.12],  type: 'pct',  suf: 'of Stretching', kinds: WPN },
    burnChance:  { stat: 'burnChance',  range: [0.05, 0.1],   type: 'pct',  suf: 'of Flames',     kinds: WPN.concat('gauntlets') },
    chillChance: { stat: 'chillChance', range: [0.05, 0.1],   type: 'pct',  suf: 'of Frost',      kinds: WPN.concat('gauntlets') },
    shockChance: { stat: 'shockChance', range: [0.05, 0.09],  type: 'pct',  suf: 'of Sparks',     kinds: WPN },
    bleedChance: { stat: 'bleedChance', range: [0.05, 0.1],   type: 'pct',  suf: 'of Cuts',       kinds: ['sword', 'gauntlets'] },
    stunChance:  { stat: 'stunChance',  range: [0.03, 0.06],  type: 'pct',  suf: 'of Bonking',    kinds: ['instrument'] },
    knockback:   { stat: 'knockback',   range: [0.15, 0.3],   type: 'pct',  suf: 'of Shoving',    kinds: ['instrument', 'gauntlets'] },
    thorns:      { stat: 'thorns',      range: [0.06, 0.12],  type: 'pct',  suf: 'of Spikes',     kinds: ['armor', 'collar'] },
    luck:        { stat: 'luck',        range: [0.05, 0.1],   type: 'pct',  suf: 'of Treasure',   kinds: ['helmet', 'pack', 'relic', 'boots'] },
    goldFind:    { stat: 'goldFind',    range: [0.08, 0.15],  type: 'pct',  suf: 'of Riches',     kinds: ['pack', 'relic'] },
    xp:          { stat: 'xp',          range: [0.04, 0.08],  type: 'pct',  suf: 'of Learning',   kinds: ['relic', 'helmet'] },
    backpack:    { stat: 'backpack',    range: [1, 2],        type: 'fixed', suf: 'of Holding',   kinds: ['pack'] },
    loopSlow:    { stat: 'loopSlow',    range: [0.04, 0.08],  type: 'pct',  suf: 'of Patience',   kinds: ['pack', 'relic'] },
    meterGain:   { stat: 'meterGain',   range: [0.08, 0.15],  type: 'pct',  suf: 'of Math',       kinds: WPN.concat('relic') },
    interactSpeed:{ stat: 'interactSpeed', range: [0.1, 0.2], type: 'pct',  suf: 'of Quick Hands', kinds: ['pack', 'gauntlets'] },
  };

  /* Finn's armor sets. Pieces are normal Algebraic-or-better armor with a set name. */
  D.SETS = {
    candy_knight: {
      name: 'Candy Knight', color: '#ff7ab8',
      pieces: { helmet: ['iron_helm', 'Candy Knight Helm'], armor: ['knight_plate', 'Candy Knight Plate'], gauntlets: ['iron_gauntlets', 'Candy Knight Gauntlets'], boots: ['iron_boots', 'Candy Knight Greaves'] },
      bonus: { 2: { stats: { armorPct: 0.2 }, text: '+20% armor.' }, 4: { mods: { blockEvery: 6 }, text: 'Peppermint Guard: completely block one hit every 6 seconds.' } },
    },
    crystal_guardian: {
      name: 'Crystal Guardian', color: '#a98bff',
      pieces: { helmet: ['skull_helm', 'Crystal Visor'], armor: ['chainmail', 'Crystal Breastplate'], gauntlets: ['leather_gloves', 'Crystal Grips'], boots: ['winged_boots', 'Crystal Boots'] },
      bonus: { 2: { stats: { crit: 0.08 }, text: '+8% crit chance.' }, 4: { mods: { critFreeze: 0.35, shatter: 0.6 }, text: 'Crystal Crits: critical hits have a 35% chance to Freeze, and hitting a Frozen enemy Shatters it for 60% bonus damage to everything nearby.' } },
    },
    flame_knight: {
      name: 'Flame Knight', color: '#ff7a2e',
      pieces: { helmet: ['iron_helm', 'Flame Knight Helm'], armor: ['chainmail', 'Flame Knight Mail'], gauntlets: ['spiked_gauntlets', 'Flame Knight Fists'], boots: ['iron_boots', 'Flame Knight Treads'] },
      bonus: { 2: { stats: { burnChance: 0.12 }, text: '+12% chance on hit to Burn.' }, 4: { mods: { vsBurning: 0.3, burnSpread: 1 }, text: 'Wildfire: +30% damage to Burning enemies, and Burning enemies spread their fire when defeated.' } },
    },
    billy: {
      name: 'Billy’s Battle Garb', color: '#e8b04a',
      pieces: { helmet: ['bear_hat', 'Billy’s Helm'], armor: ['knight_plate', 'Billy’s Chestguard'], gauntlets: ['iron_gauntlets', 'Billy’s Bracers'], boots: ['iron_boots', 'Billy’s Boots'] },
      bonus: { 2: { stats: { hpPct: 0.15 }, text: '+15% max health.' }, 4: { mods: { finisherQuake: 1.0 }, text: 'Hero Smash: the last hit of every sword combo sends out a shockwave that hits everything around you for 100% damage.' } },
    },
    dungeon_delver: {
      name: 'Dungeon Delver', color: '#5fc98a',
      pieces: { helmet: ['wizard_hat', 'Delver’s Lamp Hat'], armor: ['hero_tunic', 'Delver’s Coat'], gauntlets: ['leather_gloves', 'Delver’s Grips'], boots: ['sneakers', 'Delver’s Boots'] },
      bonus: { 2: { stats: { luck: 0.2 }, text: '+20% luck.' }, 4: { mods: { clearHeal: 0.15, chestBonus: 1 }, text: 'Delver’s Instinct: clearing a car heals 15% of your health, and treasure chests drop 1 extra item.' } },
    },
  };

  Object.assign(D.SETS, {
    bucket_knight: {
      name: 'Bucket Knight', color: '#9aa3b0',
      pieces: { helmet: ['bucket_helm', 'Bucket Knight Helm'], armor: ['chainmail', 'Bucket Knight Mail'], gauntlets: ['iron_gauntlets', 'Bucket Knight Gloves'], boots: ['iron_boots', 'Bucket Knight Boots'] },
      bonus: { 2: { stats: { armorPct: 0.15, hp: 20 }, text: '+15% armor and +20 health.' }, 4: { mods: { dashStun: 0.9, kbImmune: 1 }, text: 'Bucket Charge: your dodge roll Stuns every enemy you roll through, and nothing can knock you back.' } },
    },
    vampire_hunter: {
      name: 'Vampire Hunter', color: '#8a1f2b',
      pieces: { helmet: ['hunter_hood', 'Hunter’s Hood'], armor: ['hunter_coat', 'Hunter’s Longcoat'], gauntlets: ['leather_gloves', 'Hunter’s Gloves'], boots: ['sneakers', 'Hunter’s Boots'] },
      bonus: { 2: { stats: { lifesteal: 0.04 }, text: '+4% Lifesteal.' }, 4: { mods: { vsBig: 0.25, executeBelow: 0.12 }, text: 'Stake Through the Heart: +25% damage to elites and bosses, and regular enemies below 12% health are finished off instantly.' } },
    },
    wizard_city: {
      name: 'Wizard City Regalia', color: '#6a3bb8',
      pieces: { helmet: ['wizard_hat', 'Wizard City Hat'], armor: ['wizard_robe', 'Wizard City Robe'], gauntlets: ['leather_gloves', 'Spellcaster Gloves'], boots: ['sneakers', 'Wizard Slippers'] },
      bonus: { 2: { stats: { abilityPower: 0.12 }, text: '+12% ability damage.' }, 4: { stats: { cdr: 0.1 }, mods: { cdOnKill: 0.6 }, text: 'Wizards Only: abilities recharge 10% faster, and every enemy you defeat knocks 0.6s off your ability cooldowns.' } },
    },
  });

  /* Snacks & supplies go on your snack belt (Z, X, C, V in a trip). */
  D.CONSUMABLES = {
    bacon_pancakes: { name: 'Bacon Pancakes',      icon: 'pancake', value: 14, rarity: 0, desc: 'Heal 35% of your max health. Makin’ bacon pancakes!' },
    burrito:        { name: 'Everything Burrito',  icon: 'heart',   value: 34, rarity: 2, desc: 'Heal 60% of your max health. If you get knocked out with this on your belt, you eat it automatically and get back up with half your health.' },
    candy:          { name: 'Candy Kingdom Candy', icon: 'star',    value: 12, rarity: 0, desc: 'Sugar rush: +35% move speed for 8 seconds.' },
    ice_cream:      { name: 'Ice Cream Sandwich',  icon: 'snow',    value: 18, rarity: 1, desc: 'Brain freeze! Every enemy within 6 meters is Frozen for 2.5 seconds.' },
    science_potion: { name: "PB's Science Potion", icon: 'potion',  value: 22, rarity: 1, desc: 'SCIENCE! +40% damage for 10 seconds.' },
    gunter_bomb:    { name: 'Gunter Bomb',         icon: 'bomb',    value: 18, rarity: 1, desc: 'Throw a penguin-shaped bomb at your crosshair. Big boom.' },
    pocket_watch:   { name: 'Cosmic Pocket Watch', icon: 'watch',   value: 24, rarity: 1, desc: 'Wind back time: the Loop meter drops by 15% (or the Loop Tunnel lets you go for now).' },
    rainbow_flare:  { name: 'Rainicorn Flare',     icon: 'rainbow', value: 40, rarity: 2, desc: 'Call Lady Rainicorn. Stay near the flare for 6 seconds to fly off the train from anywhere.' },
    skeleton_key:   { name: 'Skeleton Key',        icon: 'key',     value: 30, rarity: 1, desc: 'Opens a locked vault door or a locked treasure chest. Used automatically.' },
    perfect_sandwich: { name: 'The Perfect Sandwich', icon: 'heart', value: 46, rarity: 2, desc: 'Jake’s masterpiece. Heal 100% of your max health and hit 25% harder for 12 seconds.' },
    garlic_bread:   { name: 'Garlic Bread',        icon: 'shield',  value: 20, rarity: 1, desc: 'Nobody wants to be near you: every enemy within 7 meters runs away in Fear for 3 seconds.' },
    hot_sauce:      { name: 'Flame Kingdom Hot Sauce', icon: 'flame', value: 22, rarity: 1, desc: 'SPICY! For 10 seconds every hit sets enemies on fire (Burn).' },
  };
  D.STACK_MAX = 5;

  D.VALUABLES = {
    ruby:           { name: 'Ruby',                       icon: 'gem',     rarity: 0, value: 18 },
    sapphire:       { name: 'Sapphire',                   icon: 'gem',     rarity: 0, value: 22 },
    old_coin_purse: { name: 'Dusty Coin Purse',           icon: 'coin',    rarity: 0, value: 20 },
    gold_bar:       { name: 'Gold Bar',                   icon: 'coin',    rarity: 1, value: 45 },
    golden_goblet:  { name: 'Golden Goblet',              icon: 'trophy',  rarity: 1, value: 55 },
    emerald:        { name: 'Huge Emerald',               icon: 'gem',     rarity: 1, value: 60 },
    candy_scepter:  { name: 'Candy Scepter',              icon: 'star',    rarity: 2, value: 95 },
    dungeon_map:    { name: 'Map of the Dungeon Train',   icon: 'book',    rarity: 2, value: 110 },
    magic_jar:      { name: 'Jar of Bottled Magic',       icon: 'potion',  rarity: 2, value: 110 },
    crystal_skull:  { name: 'Crystal Skull',              icon: 'skull',   rarity: 3, value: 260 },
    guardian_eye:   { name: "Gumball Guardian's Eye",     icon: 'eye',     rarity: 3, value: 300 },
    owl_dust:       { name: 'Cosmic Owl Dream Dust',      icon: 'dust',    rarity: 3, value: 320 },
    crystal_heart:  { name: 'Crystal Dimension Heart',    icon: 'crystal', rarity: 4, value: 900, minTier: 5 },
    ant_crystal:    { name: 'Crystal Ant Shard',          icon: 'crystal', rarity: 1, value: 50 },
    wizard_bubble:  { name: 'Wizard City Snow Globe',     icon: 'gem',     rarity: 2, value: 120 },
    vampire_goblet: { name: 'The Vampire King’s Goblet',  icon: 'trophy',  rarity: 3, value: 340, minTier: 5 },
    citadel_key:    { name: 'Crystal Citadel Key',        icon: 'key',     rarity: 4, value: 1100, minTier: 7 },
    golden_ticket:  { name: 'Dungeon Train Golden Ticket', icon: 'star', rarity: 4, value: 1400, minTier: 7 },
  };

  /* Plain-English text for bonus lines (item bonuses, skill nodes, set bonuses). */
  D.STAT_TEXT = {
    hp: (v) => `${sg(v)}${Math.abs(Math.round(v))} max health`,
    hpPct: (v) => `${sg(v)}${pc(Math.abs(v))} max health`,
    armor: (v) => `${sg(v)}${Math.abs(Math.round(v))} armor`,
    armorPct: (v) => `${sg(v)}${pc(Math.abs(v))} armor`,
    dmgFlat: (v) => `${sg(v)}${Math.abs(Math.round(v))} damage per hit`,
    dmg: (v) => `${sg(v)}${pc(Math.abs(v))} damage (everything)`,
    primaryDmg: (v) => `${sg(v)}${pc(Math.abs(v))} attack damage`,
    abilityPower: (v) => `${sg(v)}${pc(Math.abs(v))} ability damage`,
    crit: (v) => `${sg(v)}${pc(Math.abs(v))} crit chance`,
    critDmg: (v) => `${sg(v)}${pc(Math.abs(v))} crit damage`,
    atkSpd: (v) => `${sg(v)}${pc(Math.abs(v))} attack speed`,
    cdr: (v) => v >= 0 ? `Abilities recharge ${pc(v)} faster` : `Abilities recharge ${pc(-v)} slower`,
    speed: (v) => `${sg(v)}${pc(Math.abs(v))} move speed`,
    dashCd: (v) => `Dodge recharges ${pc(v)} faster`,
    lifesteal: (v) => `Heal ${pc(v)} of attack damage (lifesteal)`,
    dodge: (v) => `${sg(v)}${pc(Math.abs(v))} chance to dodge hits`,
    regen: (v) => `Regenerate ${(v * 100).toFixed(1)}% health per second`,
    reach: (v) => `${sg(v)}${pc(Math.abs(v))} reach`,
    burnChance: (v) => `${pc(v)} chance on hit to Burn`,
    chillChance: (v) => `${pc(v)} chance on hit to Chill`,
    shockChance: (v) => `${pc(v)} chance on hit to Shock`,
    bleedChance: (v) => `${pc(v)} chance on hit to cause Bleeding`,
    stunChance: (v) => `${pc(v)} chance on hit to Stun`,
    rootChance: (v) => `${pc(v)} chance on hit to Root`,
    freezeChance: (v) => `${pc(v)} chance on hit to Freeze`,
    knockback: (v) => `${sg(v)}${pc(Math.abs(v))} knockback`,
    thorns: (v) => `Attackers take ${pc(v)} of their damage back`,
    luck: (v) => `${sg(v)}${pc(Math.abs(v))} luck (better loot)`,
    goldFind: (v) => `${sg(v)}${pc(Math.abs(v))} gold found`,
    xp: (v) => `${sg(v)}${pc(Math.abs(v))} experience`,
    backpack: (v) => `${sg(v)}${Math.abs(v)} backpack ${Math.abs(v) === 1 ? 'slot' : 'slots'}`,
    belt: (v) => `${sg(v)}${Math.abs(v)} snack belt ${Math.abs(v) === 1 ? 'slot' : 'slots'}`,
    safe: (v) => `${sg(v)}${Math.abs(v)} safe pocket ${Math.abs(v) === 1 ? 'slot' : 'slots'}`,
    loopSlow: (v) => `The Loop closes ${pc(v)} slower`,
    meterGain: (v) => `Super meter fills ${pc(v)} faster`,
    interactSpeed: (v) => `Open chests and doors ${pc(v)} faster`,
    healPower: (v) => `Snacks heal ${pc(v)} more`,
    killHeal: (v) => `Heal ${(v * 100).toFixed(0)}% health when you defeat an enemy`,
    buyDiscount: (v) => `Buy things ${pc(v)} cheaper`,
    sellBonus: (v) => `Sell things for ${pc(v)} more`,
    finisherDmg: (v) => `The last hit of your combo deals ${pc(v)} more damage`,
  };
})();
