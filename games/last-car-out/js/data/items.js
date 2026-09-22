/* Item data: rarities, bases, affixes, consumables, valuables. */
(function () {
  'use strict';
  const D = LCO.data;

  D.RARITIES = [
    { id: 0, key: 'worn',      name: 'Worn',          affixes: 0, value: 1 },
    { id: 1, key: 'sturdy',    name: 'Sturdy',        affixes: 1, value: 2.2 },
    { id: 2, key: 'fine',      name: 'Fine',          affixes: 2, value: 4.5 },
    { id: 3, key: 'exquisite', name: 'Exquisite',     affixes: 3, value: 10 },
    { id: 4, key: 'relic',     name: 'Relic',         affixes: 2, value: 28 },
    { id: 5, key: 'engine',    name: 'Engine-Forged', affixes: 3, value: 70 },
  ];

  D.SLOTS = [
    { id: 'weapon',  name: 'Weapon',  kind: 'weapon' },
    { id: 'offhand', name: 'Off-hand', kind: 'offhand' },
    { id: 'armor',   name: 'Armor',   kind: 'armor' },
    { id: 'charm1',  name: 'Charm',   kind: 'charm' },
    { id: 'charm2',  name: 'Charm',   kind: 'charm' },
  ];

  /* stats: flat values at item level 1 (scale with level & upgrades).
     pstats: percentage values (scale gently).
     props: fixed behaviours of the base. */
  D.BASES = {
    /* weapons */
    lead_pipe:      { kind: 'weapon', name: 'Lead Pipe',          icon: 'club',     dmg: [5, 9],   ap: 1, hits: 1, props: { stunChance: 0.1 },                     text: '10% chance to Stun on hit.' },
    carving_knife:  { kind: 'weapon', name: 'Carving Knife',      icon: 'blade',    dmg: [4, 7],   ap: 1, hits: 1, pstats: { critChance: 0.08 }, props: { bleedChance: 0.25 }, text: '25% chance to cause 2 Bleed.' },
    umbrella_spear: { kind: 'weapon', name: 'Umbrella Spear',     icon: 'spear',    dmg: [5, 8],   ap: 1, hits: 1, props: { firstStrike: 0.5 },                    text: 'Your first Strike each fight deals +50% damage.' },
    slingshot:      { kind: 'weapon', name: 'Slingshot',          icon: 'sling',    dmg: [3, 7],   ap: 1, hits: 1, pstats: { dodge: 0.08 }, props: { ignoreBlock: true }, text: 'Strikes ignore Block.' },
    brass_knuckles: { kind: 'weapon', name: 'Brass Knuckles',     icon: 'gauntlet', dmg: [2, 4],   ap: 1, hits: 2, props: {},                                      text: 'Strikes hit twice.' },
    baton:          { kind: 'weapon', name: "Conductor's Baton",  icon: 'baton',    dmg: [3, 5],   ap: 1, hits: 1, stats: { maxFocus: 3 }, pstats: { abilityPower: 0.2 }, props: {}, text: 'Built for abilities, not brawls.' },
    fire_axe:       { kind: 'weapon', name: 'Fire Axe',           icon: 'axe',      dmg: [11, 17], ap: 2, hits: 1, props: { cleave: 0.5 },                         text: 'Strikes cost 2 AP and splash 50% damage onto other foes.' },
    tape_whip:      { kind: 'weapon', name: 'Tape-Reel Whip',     icon: 'tape',     dmg: [3, 6],   ap: 1, hits: 1, pstats: { lifesteal: 0.05 }, props: { corruptOnHit: 1 }, text: 'Strikes apply 1 Corruption.' },
    /* off-hands */
    luggage_lid:    { kind: 'offhand', name: 'Luggage Lid',       icon: 'shield',   stats: { armor: 3 }, props: { braceBonus: 0.3 },                         text: 'Brace grants 30% more Guard.' },
    rail_lantern:   { kind: 'offhand', name: 'Railway Lantern',   icon: 'lantern',  pstats: { lootFind: 0.1 }, props: { sight: 1 },                           text: 'See one room further through the car.' },
    tool_roll:      { kind: 'offhand', name: 'Tool Roll',         icon: 'tool',     props: { lockpick: 0.35, scrapBonus: 0.25 },                               text: '35% chance to pick a vault lock. +25% Scrap from salvage.' },
    tape_deck:      { kind: 'offhand', name: 'Tape Deck',         icon: 'tape',     stats: { maxFocus: 4 }, props: {},                                         text: 'Hums with somebody else’s memories.' },
    pocket_mirror:  { kind: 'offhand', name: 'Pocket Mirror',     icon: 'mirror',   pstats: { dodge: 0.05, critChance: 0.05 }, props: {},                     text: 'Something on the other side is paying attention.' },
    /* armor */
    travel_coat:    { kind: 'armor', name: 'Traveling Coat',      icon: 'coat',     stats: { armor: 2 }, pstats: { dodge: 0.06 }, props: {}, text: 'Light and quick.' },
    porter_vest:    { kind: 'armor', name: "Porter's Vest",       icon: 'vest',     stats: { armor: 5, maxHp: 10 }, props: {},                 text: 'Pockets on the pockets.' },
    boiler_plate:   { kind: 'armor', name: 'Boiler Plate',        icon: 'plate',    stats: { armor: 9, maxHp: 20 }, pstats: { dodge: -0.05 }, props: {}, text: 'Heavy. Very heavy.' },
    knit_sweater:   { kind: 'armor', name: 'Knit Sweater',        icon: 'sweater',  stats: { armor: 1, maxFocus: 4 }, pstats: { statusResist: 0.1 }, props: {}, text: 'Somebody made this for somebody.' },
    /* charms */
    ticket_stub:    { kind: 'charm', name: 'Ticket Stub',         icon: 'ticket',   pstats: { lootFind: 0.06 } },
    brass_button:   { kind: 'charm', name: 'Brass Button',        icon: 'coin',     stats: { armor: 2 } },
    glass_eye:      { kind: 'charm', name: 'Glass Eye',           icon: 'eye',      pstats: { critChance: 0.04 } },
    lucky_coin:     { kind: 'charm', name: 'Lucky Coin',          icon: 'coin',     pstats: { dodge: 0.03, lootFind: 0.03 } },
    pocket_watch:   { kind: 'charm', name: 'Pocket Watch',        icon: 'watch',    stats: { maxFocus: 3 } },
    name_tag:       { kind: 'charm', name: 'Name Tag',            icon: 'badge',    stats: { maxHp: 8 } },
    tooth_pendant:  { kind: 'charm', name: 'Tooth Pendant',       icon: 'fang',     pstats: { dmgPct: 0.05 } },
    feather_pin:    { kind: 'charm', name: 'Feather Pin',         icon: 'feather',  pstats: { dodge: 0.04 } },
    signet_ring:    { kind: 'charm', name: 'Signet Ring',         icon: 'ring',     pstats: { abilityPower: 0.06 } },
  };

  D.BASE_VALUE = { weapon: 16, offhand: 13, armor: 15, charm: 11 };

  /* Affixes. type: flat (scales hard), pct (scales gently), fixed (never scales). */
  D.AFFIXES = {
    hp:        { stat: 'maxHp',           range: [6, 12],      type: 'flat',  pre: 'Hale',       slots: ['armor', 'charm', 'offhand', 'weapon'] },
    armor:     { stat: 'armor',           range: [1, 3],       type: 'flat',  pre: 'Riveted',    slots: ['armor', 'offhand', 'charm'] },
    dmgPct:    { stat: 'dmgPct',          range: [0.06, 0.12], type: 'pct',   pre: 'Brutal',     slots: ['weapon', 'charm'] },
    dmgFlat:   { stat: 'dmgFlat',         range: [1, 2],       type: 'flat',  pre: 'Jagged',     slots: ['weapon'] },
    crit:      { stat: 'critChance',      range: [0.03, 0.06], type: 'pct',   pre: 'Keen',       slots: ['weapon', 'charm', 'offhand'] },
    critDmg:   { stat: 'critDmg',         range: [0.1, 0.2],   type: 'pct',   pre: 'Vicious',    slots: ['weapon', 'charm'] },
    dodge:     { stat: 'dodge',           range: [0.02, 0.04], type: 'pct',   pre: 'Nimble',     slots: ['armor', 'charm', 'offhand'] },
    focus:     { stat: 'maxFocus',        range: [2, 4],       type: 'flat',  pre: 'Lucid',      slots: ['offhand', 'charm', 'armor', 'weapon'] },
    focusRegen:{ stat: 'focusRegen',      range: [1, 1],       type: 'fixed', suf: 'of Clarity', slots: ['offhand', 'charm'], minIlvl: 3 },
    power:     { stat: 'abilityPower',    range: [0.06, 0.12], type: 'pct',   suf: 'of the Engine', slots: ['weapon', 'offhand', 'charm'] },
    loot:      { stat: 'lootFind',        range: [0.05, 0.1],  type: 'pct',   suf: 'of Plenty',  slots: ['charm', 'offhand', 'armor'] },
    lifesteal: { stat: 'lifesteal',       range: [0.02, 0.04], type: 'pct',   suf: 'of Hunger',  slots: ['weapon', 'charm'] },
    thorns:    { stat: 'thorns',          range: [2, 4],       type: 'flat',  suf: 'of Brambles', slots: ['armor', 'offhand'] },
    bleed:     { stat: 'bleedChance',     range: [0.1, 0.2],   type: 'pct',   suf: 'of Wounds',  slots: ['weapon'] },
    resist:    { stat: 'statusResist',    range: [0.05, 0.1],  type: 'pct',   suf: 'of Resolve', slots: ['armor', 'charm'] },
    pack:      { stat: 'backpack',        range: [1, 2],       type: 'fixed', suf: 'of the Porter', slots: ['armor'] },
    xp:        { stat: 'xpGain',          range: [0.05, 0.1],  type: 'pct',   suf: 'of Lessons', slots: ['charm'] },
    calm:      { stat: 'instabilitySlow', range: [0.04, 0.08], type: 'pct',   suf: 'of Stillness', slots: ['charm', 'armor'] },
    heal:      { stat: 'healBonus',       range: [0.08, 0.15], type: 'pct',   suf: 'of Mending', slots: ['armor', 'charm', 'offhand'] },
  };

  /* Consumables: `use` says where they can be used. Effects live in the engine. */
  D.CONSUMABLES = {
    bandage:        { name: 'Bandage Roll',    icon: 'bandage', value: 12, rarity: 0, use: 'both',   desc: 'Heal 30% of max HP and stop Bleeding.' },
    beans:          { name: 'Tin of Beans',    icon: 'can',     value: 10, rarity: 0, use: 'both',   desc: 'Heal 12% of max HP now, plus Regen.' },
    tonic:          { name: 'Fizzy Tonic',     icon: 'flask',   value: 14, rarity: 0, use: 'combat', desc: 'Restore 6 Focus.' },
    salts:          { name: 'Smelling Salts',  icon: 'flask',   value: 18, rarity: 1, use: 'combat', desc: 'Remove every debuff and gain 1 AP.' },
    firecracker:    { name: 'Firecracker',     icon: 'bomb',    value: 16, rarity: 1, use: 'combat', desc: 'Deal 14 damage (grows with car tier) to every enemy.' },
    chrome_dust:    { name: 'Chrome Dust',     icon: 'snow',    value: 16, rarity: 1, use: 'combat', desc: 'Apply 3 Chill to the target — enough to freeze it solid.' },
    flare:          { name: 'Emergency Flare', icon: 'spark',   value: 20, rarity: 1, use: 'combat', desc: 'Escape the current fight. Always works.' },
    mirror_tonic:   { name: 'Mirror Tonic',    icon: 'copy',    value: 22, rarity: 2, use: 'combat', desc: 'Gain 2 Mirror Images.' },
    stability_coil: { name: 'Stability Coil',  icon: 'gear',    value: 30, rarity: 2, use: 'map',    desc: 'Lower the car’s Instability by 20.' },
    schematic:      { name: 'Car Schematic',   icon: 'map',     value: 25, rarity: 1, use: 'map',    desc: 'Reveal every room in the car.' },
    coupling_key:   { name: 'Coupling Key',    icon: 'key',     value: 35, rarity: 2, use: 'key',    desc: 'Opens a Locked Coupling exit or a vault. Used up when turned.' },
  };
  D.STACK_MAX = 5;

  /* Valuables exist to be carried home and sold. */
  D.VALUABLES = {
    old_photo:        { name: 'Photograph of Nobody',      icon: 'book',    rarity: 0, value: 15 },
    button_jar:       { name: 'Jar of Buttons',            icon: 'jar',     rarity: 0, value: 18 },
    silver_spoon:     { name: 'Silver Spoon',              icon: 'cup',     rarity: 0, value: 22 },
    teacup:           { name: 'Gilded Teacup',             icon: 'cup',     rarity: 1, value: 40 },
    snowglobe:        { name: 'Snow Globe of Car 88',      icon: 'globe',   rarity: 1, value: 55 },
    frog_crown:       { name: 'Tiny Frog Crown',           icon: 'crown',   rarity: 1, value: 60 },
    corgi_figurine:   { name: 'Porcelain Corgi',           icon: 'crown',   rarity: 2, value: 110 },
    music_box:        { name: 'Music Box (Plays Backward)', icon: 'tape',   rarity: 2, value: 120 },
    bottled_sunset:   { name: 'Bottled Sunset',            icon: 'jar',     rarity: 2, value: 130 },
    star_chart:       { name: 'Star Chart of the Void',    icon: 'map',     rarity: 2, value: 140 },
    conductor_whistle:{ name: "Conductor's Whistle",       icon: 'bolt',    rarity: 3, value: 240 },
    golden_rivet:     { name: 'Golden Rivet',              icon: 'gear',    rarity: 3, value: 260 },
    chrome_egg:       { name: 'Chrome Egg',                icon: 'crystal', rarity: 3, value: 280 },
    crystal_heart:    { name: 'Crystal Car Heart',         icon: 'crystal', rarity: 3, value: 320 },
    first_ticket:     { name: 'The First Ticket',          icon: 'ticket',  rarity: 4, value: 900, minTier: 4 },
    engine_ember:     { name: 'Ember from the Engine',     icon: 'flame',   rarity: 4, value: 1200, minTier: 7 },
  };
})();
