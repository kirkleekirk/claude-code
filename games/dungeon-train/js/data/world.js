/* The Dungeon Train: an endless train looping around Ooo. Every car is a dungeon room with monsters and
   a treasure chest that unlocks once the car is cleared. The train is split into "lines" (tiers); each
   line ends in a boss car. Beat a line's boss and carry its trophy home to open the next line. */
(function () {
  'use strict';
  const D = DT.data;

  /* Main lines run tier 1 → 8; beat a line's boss and bring its trophy home to open the next tier.
     Branch lines sit beside a main line (same tier, own boss and trophy, never required).
     The post-game line opens after you break the Loop. rooms = which dungeon cars show up more. */
  D.LINES = [
    { id: 'grass', tier: 1, name: 'Grassland Cars', rec: 1, cars: [5, 6], loop: 330, fams: ['slime', 'gnome', 'penguin'], boss: 'king_slime',
      blurb: 'The friendliest end of the Dungeon Train. Slimes, gnomes, and one very large slime.', sky: ['#8ed8ff', '#e6f8ff'], ground: '#6cc24a', hills: ['#4fa83a', '#86d266'], scenery: 'trees',
      wall: '#8a7a5c', trim: '#5c4a32', floor: '#9c7a52', accent: '#7ed957' },
    { id: 'candy', tier: 2, name: 'Candy Cars', rec: 4, cars: [5, 7], loop: 320, fams: ['zombie', 'bean', 'penguin'], boss: 'lemongrab_boss', elites: ['lemongrab'],
      blurb: 'Candy people who went a bit zombie, and a lemon earl who finds all of this UNACCEPTABLE.', sky: ['#ffc6e6', '#fff2f9'], ground: '#ff9fcf', hills: ['#ff7ab8', '#ffc0df'], scenery: 'candy',
      wall: '#c77ba6', trim: '#8a3f6a', floor: '#e2a6c4', accent: '#ff8fc7' },
    /* branch line beside the Candy Cars (tier 2) */
    { id: 'classic', tier: 2, branch: true, name: 'Classic Dungeon Cars', rec: 5, cars: [6, 7], loop: 320, fams: ['ant', 'geode', 'mud', 'hairape'], boss: 'flesh_beast', elites: ['dungeon_warrior'], rooms: { mine: 5, crypt: 1, armory: 2, prison: 1 },
      blurb: 'The cars from Finn and Jake’s first ride: Crystal Ants, Geode Warriors, Mud Monsters and Hair Apes. At the end, a big flesh-type creature. Boss battle!', sky: ['#9fd6a0', '#e8f7e0'], ground: '#7aa35a', hills: ['#5f8a45', '#9cc47a'], scenery: 'rocks',
      wall: '#7a6a58', trim: '#4a3c30', floor: '#8c7458', accent: '#ffd84a' },
    { id: 'crypt', tier: 3, name: 'Dungeon Cars', rec: 8, cars: [6, 7], loop: 315, fams: ['skeleton', 'knight', 'ghost'], boss: 'demon_cat', elites: ['guardian_angel', 'magic_man'], rooms: { crypt: 4, prison: 3, armory: 2 },
      blurb: 'Straight out of Finn’s first real dungeon: bucket knights, skeletons, a suspiciously nice angel, and a big teal cat with approximate knowledge of many things.', sky: ['#6d7fa3', '#c7d2e8'], ground: '#5c6b58', hills: ['#48563f', '#6c7c62'], scenery: 'graves',
      wall: '#5d6070', trim: '#34364a', floor: '#6b6b74', accent: '#b9c8ff' },
    { id: 'lava', tier: 4, name: 'Lava Cars', rec: 12, cars: [6, 7], loop: 310, fams: ['fire'], boss: 'flame_king',
      blurb: 'The floor is literally lava in places. The Flame King rides at the front.', sky: ['#ffb36b', '#ffe6c2'], ground: '#b8412a', hills: ['#e0583c', '#ff9a5a'], scenery: 'lava',
      wall: '#7a3a2a', trim: '#3f1c14', floor: '#8a4a36', accent: '#ff7a2e' },
    /* branch line beside the Lava Cars (tier 4) */
    { id: 'wizard', tier: 4, branch: true, name: 'Wizard City Cars', rec: 13, cars: [6, 8], loop: 310, fams: ['wizard'], boss: 'grand_master_wizard', elites: ['bufo', 'magic_man'], rooms: { lab: 5, library: 3, garden: 1 },
      blurb: 'The train detours through Wizard City. Wizards only, fools! Laser wizards, forest wizards, a toad full of tadpoles, and the Grand Master Wizard on his giant bubble.', sky: ['#9b8cff', '#e4dcff'], ground: '#5a4a9a', hills: ['#6f5fc0', '#a898ff'], scenery: 'towers',
      wall: '#4f4a86', trim: '#2a2656', floor: '#6a5fa8', accent: '#b88cff' },
    { id: 'ice', tier: 5, name: 'Ice Cars', rec: 16, cars: [7, 8], loop: 305, fams: ['ice', 'penguin'], boss: 'ice_king',
      blurb: 'Frozen cars full of penguins. Someone with a beard keeps yelling about princesses.', sky: ['#bfe9ff', '#f4fcff'], ground: '#e8f6ff', hills: ['#a8dcf5', '#dff3ff'], scenery: 'ice',
      wall: '#7fa6c7', trim: '#3b5f86', floor: '#c9e2f2', accent: '#9fe3ff' },
    { id: 'night', tier: 6, name: 'Nightmare Cars', rec: 20, cars: [7, 8], loop: 300, fams: ['demon', 'skeleton', 'ghost'], boss: 'hunson',
      blurb: 'The train dipped into the Nightosphere. Chaos, demons, and Marceline’s dad.', sky: ['#3a0d1d', '#8a2438'], ground: '#2a0f14', hills: ['#5a1422', '#9a2a40'], scenery: 'spikes',
      wall: '#4a1a26', trim: '#1f0a10', floor: '#3a1a22', accent: '#ff4d6d' },
    /* branch line beside the Nightmare Cars (tier 6) */
    { id: 'vampire', tier: 6, branch: true, name: 'Vampire Cars', rec: 21, cars: [7, 8], loop: 300, fams: ['vampire'], boss: 'vampire_king', elites: ['the_empress', 'the_hierophant', 'the_moon', 'the_fool'], rooms: { ballroom: 5, crypt: 2, prison: 1 },
      blurb: 'The Vampire King’s court came back from the dust. The Fool, the Empress, the Hierophant and the Moon all ride here — and the King himself waits at the front. Bring stakes.', sky: ['#4a1a3a', '#a04a6a'], ground: '#2a1020', hills: ['#4a1830', '#7a2a4a'], scenery: 'castle',
      wall: '#3a1a2e', trim: '#1d0a18', floor: '#4a2436', accent: '#ff5f8f' },
    { id: 'crystal', tier: 7, name: 'Crystal Cars', rec: 24, cars: [8, 9], loop: 300, fams: ['crystal'], boss: 'citadel_guardian',
      blurb: 'Everything in here is crystal, including the guards. At the front, a Citadel Guardian — the kind that locks up cosmic criminals — is looking for someone to arrest.', sky: ['#b69cff', '#ece4ff'], ground: '#6e5ab8', hills: ['#8f7ae0', '#cbbcff'], scenery: 'crystals',
      wall: '#6a58a8', trim: '#3a2c6e', floor: '#8a7ad0', accent: '#7fe3ff' },
    { id: 'engine', tier: 8, name: 'The Engine', rec: 28, cars: [8, 9], loop: 340, fams: ['ant', 'skeleton', 'crystal', 'demon'], boss: 'future_finn', final: true,
      blurb: 'The front of the Dungeon Train. An old warrior in dented armor has been riding it for a hundred years, fighting Crystal Ants forever. He looks a lot like you. Beat him and pull the brake.', sky: ['#1d2340', '#4a5170'], ground: '#2a2e38', hills: ['#3a3f4b', '#4a5170'], scenery: 'tunnel',
      wall: '#3f3a4a', trim: '#1d1a26', floor: '#4a4454', accent: '#ffcf3d' },
    /* opens after you break the Loop */
    { id: 'lich', tier: 9, post: true, name: 'The Lich’s Well', rec: 30, cars: [9, 10], loop: 300, fams: ['lich', 'ghost', 'skeleton'], boss: 'lich', elites: ['guardian_angel', 'the_hierophant', 'dungeon_warrior'], rooms: { crypt: 4, prison: 2, library: 2, ballroom: 1 },
      blurb: 'Breaking the Loop woke something at the bottom of the tracks. Snails with glowing green eyes, and the Lich, who wants every living thing to STOP.', sky: ['#0e1a12', '#2e4a2a'], ground: '#10180e', hills: ['#1a2a18', '#2e4a2a'], scenery: 'well',
      wall: '#2a3326', trim: '#121a10', floor: '#2e3a2a', accent: '#7dff5a' },
  ];

  /* Dungeon rooms. Every car except the caboose, boss car and engine has one treasure chest that
     unlocks when every monster in the car is defeated. */
  D.CAR_TYPES = {
    caboose: { name: 'Caboose',           layout: 'caboose', enemies: [0, 0], breakables: [2, 3], chest: false },
    crypt:   { name: 'Crypt Car',         layout: 'crypt',   enemies: [3, 5], breakables: [2, 4], chest: true, weight: 4 },
    library: { name: 'Library Car',       layout: 'library', enemies: [3, 5], breakables: [2, 3], chest: true, weight: 3 },
    armory:  { name: 'Armory Car',        layout: 'armory',  enemies: [3, 4], breakables: [4, 7], chest: true, weight: 3 },
    dining:  { name: 'Banquet Car',       layout: 'dining',  enemies: [3, 5], breakables: [3, 5], chest: true, weight: 3 },
    prison:  { name: 'Prison Car',        layout: 'prison',  enemies: [3, 5], breakables: [2, 3], chest: true, weight: 2 },
    garden:  { name: 'Mushroom Car',      layout: 'garden',  enemies: [4, 6], breakables: [1, 3], chest: true, weight: 2 },
    mine:    { name: 'Mine Car',          layout: 'mine',    enemies: [4, 6], breakables: [2, 4], chest: true, weight: 0 },
    lab:     { name: 'Wizard Lab Car',    layout: 'lab',     enemies: [3, 5], breakables: [3, 5], chest: true, weight: 0 },
    ballroom:{ name: 'Ballroom Car',      layout: 'ballroom',enemies: [3, 5], breakables: [2, 3], chest: true, weight: 0 },
    vault:   { name: 'Treasure Vault',    layout: 'vault',   enemies: [2, 3], breakables: [1, 2], chest: true, chests: 3, locked: true, elite: true },
    boss:    { name: 'Boss Car',          layout: 'boss',    enemies: [0, 0], breakables: [0, 0], chest: false },
    engine:  { name: 'Engine Car',        layout: 'engine',  enemies: [3, 4], breakables: [1, 2], chest: false },
  };

  /* arch (how it fights): melee | lunger (winds up and leaps) | ranged | zapper (charges a lightning or laser
     line) | bomber | tank (floor slam) | lemongrab | magicman | angel | bufo | fool | hypno | shifter | moon | boss.
     group = spawns in a pack. drain = heals itself for part of the damage it deals. */
  D.ENEMIES = {
    penguin:       { name: 'Penguin',          fam: 'penguin',  arch: 'melee',  hp: 26,  dmg: 5,  speed: 3.0, r: 0.42, model: 'penguin', xp: 6 },
    bomb_penguin:  { name: 'Bomber Penguin',   fam: 'penguin',  arch: 'bomber', hp: 14,  dmg: 18, speed: 4.2, r: 0.42, model: 'penguin', tint: '#e0423a', xp: 6 },
    slime:         { name: 'Slime',            fam: 'slime',    arch: 'melee',  hp: 34,  dmg: 5,  speed: 2.2, r: 0.55, model: 'slime', color: '#7ed957', xp: 6 },
    gnome:         { name: 'Gnome Wizard',     fam: 'gnome',    arch: 'ranged', hp: 22,  dmg: 6,  speed: 2.4, r: 0.4,  model: 'gnome', xp: 8, shot: { speed: 9, color: '#b061ff' } },
    zombie:        { name: 'Candy Zombie',     fam: 'zombie',   arch: 'melee',  hp: 42,  dmg: 7,  speed: 2.2, r: 0.5,  model: 'zombie', xp: 8 },
    bean:          { name: 'Jelly Bean',       fam: 'bean',     arch: 'lunger', hp: 24,  dmg: 8,  speed: 3.4, r: 0.4,  model: 'bean', xp: 7 },
    fire_wolf:     { name: 'Fire Wolf',        fam: 'fire',     arch: 'lunger', hp: 38,  dmg: 9,  speed: 4.2, r: 0.55, model: 'wolf', color: '#ff7a2e', burn: true, xp: 10 },
    flame_guard:   { name: 'Flame Guard',      fam: 'fire',     arch: 'ranged', hp: 40,  dmg: 8,  speed: 2.4, r: 0.5,  model: 'flameguy', xp: 10, shot: { speed: 10, color: '#ff7a2e', burn: true } },
    snow_golem:    { name: 'Snow Golem',       fam: 'ice',      arch: 'tank',   hp: 110, dmg: 18, speed: 1.7, r: 0.8,  model: 'snowman', chill: true, xp: 18 },
    ice_wolf:      { name: 'Ice Wolf',         fam: 'ice',      arch: 'lunger', hp: 36,  dmg: 9,  speed: 4.2, r: 0.55, model: 'wolf', color: '#9fd8ff', chill: true, xp: 10 },
    imp:           { name: 'Nightosphere Imp', fam: 'demon',    arch: 'melee',  hp: 32,  dmg: 9,  speed: 3.8, r: 0.42, model: 'imp', xp: 10 },
    chaos_demon:   { name: 'Chaos Demon',      fam: 'demon',    arch: 'tank',   hp: 130, dmg: 20, speed: 1.9, r: 0.85, model: 'demon', xp: 20 },
    skeleton:      { name: 'Skeleton Knight',  fam: 'skeleton', arch: 'melee',  hp: 40,  dmg: 9,  speed: 2.8, r: 0.45, model: 'skeleton', xp: 10 },
    bone_archer:   { name: 'Bone Archer',      fam: 'skeleton', arch: 'ranged', hp: 28,  dmg: 8,  speed: 2.6, r: 0.42, model: 'skeleton', xp: 10, shot: { speed: 13, color: '#f5f0e1' } },
    crystal_guard: { name: 'Crystal Guardian', fam: 'crystal',  arch: 'tank',   hp: 140, dmg: 20, speed: 1.8, r: 0.8,  model: 'crystal', xp: 22 },
    crystal_bat:   { name: 'Crystal Bat',      fam: 'crystal',  arch: 'lunger', hp: 26,  dmg: 8,  speed: 4.6, r: 0.4,  model: 'bat', flying: true, xp: 9 },
    /* the Dungeon Train's own monsters ("Dungeon Train", season 5) */
    crystal_ant:   { name: 'Crystal Ant',      fam: 'ant',      arch: 'melee',  hp: 16,  dmg: 5,  speed: 4.4, r: 0.36, model: 'ant', group: 3, xp: 4 },
    geode_warrior: { name: 'Geode Warrior',    fam: 'geode',    arch: 'tank',   hp: 120, dmg: 18, speed: 1.7, r: 0.8,  model: 'geode', xp: 18 },
    mud_monster:   { name: 'Mud Monster',      fam: 'mud',      arch: 'ranged', hp: 40,  dmg: 7,  speed: 2.0, r: 0.62, model: 'mud', xp: 9, shot: { speed: 8, color: '#8a5a30', el: 'slow', size: 0.38 } },
    hair_ape:      { name: 'Hair Ape',         fam: 'hairape',  arch: 'zapper', hp: 50,  dmg: 11, speed: 2.6, r: 0.66, model: 'hairape', xp: 12, zap: { color: '#7fdcff', el: 'shock', len: 11, wind: 0.8, text: '*bzzzt*' } },
    /* "Dungeon" (season 1) */
    bucket_knight: { name: 'Bucket Knight',    fam: 'knight',   arch: 'lunger', hp: 44,  dmg: 10, speed: 3.0, r: 0.5,  model: 'bucket', xp: 10 },
    ghost:         { name: 'Ghost',            fam: 'ghost',    arch: 'lunger', hp: 26,  dmg: 8,  speed: 3.6, r: 0.45, model: 'ghost', xp: 8 },
    /* Wizard City */
    wizard:        { name: 'Wizard',           fam: 'wizard',   arch: 'ranged', hp: 30,  dmg: 9,  speed: 2.4, r: 0.45, model: 'wizard', xp: 10, shot: { speed: 10, color: '#b061ff' } },
    laser_wizard:  { name: 'Laser Wizard',     fam: 'wizard',   arch: 'zapper', hp: 28,  dmg: 12, speed: 2.4, r: 0.45, model: 'wizard', color: '#e0428a', glow: '#ff5fb4', xp: 11, zap: { color: '#ff5fb4', len: 12, wind: 0.75, text: 'LASER!' } },
    forest_wizard: { name: 'Forest Wizard',    fam: 'wizard',   arch: 'ranged', hp: 34,  dmg: 8,  speed: 2.4, r: 0.45, model: 'wizard', color: '#3f8a3a', glow: '#8cff6a', xp: 10, shot: { speed: 9, color: '#5fd06a', el: 'root' } },
    /* Vampires ("Stakes") */
    vampire:       { name: 'Vampire',          fam: 'vampire',  arch: 'melee',  hp: 60,  dmg: 12, speed: 3.4, r: 0.5,  model: 'vampire', drain: 0.4, xp: 13 },
    vampire_bat:   { name: 'Vampire Bat',      fam: 'vampire',  arch: 'lunger', hp: 26,  dmg: 9,  speed: 4.8, r: 0.4,  model: 'bat', flying: true, color: '#4a2a5a', color2: '#7a3a6a', eye: '#ffd0d0', drain: 0.3, xp: 8 },
    /* the Lich's Well */
    lich_snail:    { name: 'Possessed Snail',  fam: 'lich',     arch: 'ranged', hp: 45,  dmg: 12, speed: 1.8, r: 0.45, model: 'snail', xp: 14, shot: { speed: 9, color: '#7dff5a', el: 'fire' } },
    /* elites (middle cars) */
    lemongrab:        { name: 'Earl of Lemongrab', fam: 'elite', arch: 'lemongrab', hp: 380, dmg: 14, speed: 2.6, r: 0.6, model: 'lemongrab', elite: true, xp: 90 },
    magic_man:        { name: 'Magic Man',         fam: 'elite', arch: 'magicman',  hp: 340, dmg: 12, speed: 2.4, r: 0.55, model: 'magicman', elite: true, xp: 90, shot: { speed: 10, color: '#43e0c5' } },
    dungeon_warrior:  { name: 'Dungeon Warrior',   fam: 'elite', arch: 'melee',     hp: 420, dmg: 15, speed: 2.8, r: 0.6, model: 'dwarrior', elite: true, xp: 95, swordBeam: true, shot: { speed: 14, color: '#6fd3ff' } },
    guardian_angel:   { name: 'Guardian Angel',    fam: 'elite', arch: 'angel',     hp: 360, dmg: 16, speed: 2.6, r: 0.55, model: 'angel', elite: true, xp: 95, shot: { speed: 10, color: '#ffe066' } },
    bufo:             { name: 'Bufo',              fam: 'elite', arch: 'bufo',      hp: 400, dmg: 13, speed: 2.6, r: 0.7, model: 'bufo', elite: true, xp: 100, shot: { speed: 10, color: '#43e0c5' } },
    the_fool:         { name: 'The Fool',          fam: 'elite', arch: 'fool',      hp: 330, dmg: 13, speed: 4.2, r: 0.5, model: 'fool', elite: true, drain: 0.3, xp: 100 },
    the_empress:      { name: 'The Empress',       fam: 'elite', arch: 'hypno',     hp: 380, dmg: 14, speed: 2.4, r: 0.55, model: 'empress', elite: true, drain: 0.2, xp: 105, shot: { speed: 10, color: '#ff4d6d' } },
    the_hierophant:   { name: 'The Hierophant',    fam: 'elite', arch: 'shifter',   hp: 450, dmg: 15, speed: 2.5, r: 0.6, model: 'hierophant', elite: true, drain: 0.2, xp: 110 },
    the_moon:         { name: 'The Moon',          fam: 'elite', arch: 'moon',      hp: 420, dmg: 13, speed: 2.2, r: 0.7, model: 'moon', elite: true, drain: 0.2, xp: 105, shot: { speed: 9, color: '#fffdf0', el: 'stun' } },
    /* line bosses (fixed stats — each is tuned for its line) */
    king_slime:          { name: 'King Slime',           fam: 'boss', arch: 'boss', hp: 800,   dmg: 12, speed: 2.4, r: 1.35, model: 'king_slime', boss: true, xp: 220,  brain: 'king_slime' },
    lemongrab_boss:      { name: 'Earl of Lemongrab',    fam: 'boss', arch: 'boss', hp: 1400,  dmg: 16, speed: 3.0, r: 0.95, model: 'lemongrab_boss', boss: true, xp: 380, brain: 'lemongrab' },
    flesh_beast:         { name: 'The Flesh Beast',      fam: 'boss', arch: 'boss', hp: 1550,  dmg: 17, speed: 2.2, r: 1.5,  model: 'flesh', boss: true, xp: 420, brain: 'flesh_beast', shot: { speed: 9, color: '#c9607a', el: 'slow' } },
    demon_cat:           { name: 'The Demon Cat',        fam: 'boss', arch: 'boss', hp: 2100,  dmg: 22, speed: 3.0, r: 1.1,  model: 'demoncat', boss: true, xp: 560, brain: 'demon_cat', shot: { speed: 13, color: '#ff4d6d' } },
    flame_king:          { name: 'The Flame King',       fam: 'boss', arch: 'boss', hp: 2900,  dmg: 28, speed: 2.4, r: 1.1,  model: 'flame_king', boss: true, xp: 780, brain: 'flame_king', shot: { speed: 11, color: '#ff7a2e', el: 'fire' } },
    grand_master_wizard: { name: 'The Grand Master Wizard', fam: 'boss', arch: 'boss', hp: 3100, dmg: 29, speed: 2.4, r: 1.3, model: 'gmw', boss: true, xp: 820, brain: 'grand_master_wizard', shot: { speed: 11, color: '#b061ff' } },
    ice_king:            { name: 'The Ice King',         fam: 'boss', arch: 'boss', hp: 3800,  dmg: 34, speed: 2.4, r: 1.1,  model: 'iceking', boss: true, xp: 1050, brain: 'ice_king', shot: { speed: 12, color: '#9fe3ff', el: 'ice' } },
    hunson:              { name: 'Hunson Abadeer',       fam: 'boss', arch: 'boss', hp: 4800,  dmg: 40, speed: 2.6, r: 1.0,  model: 'hunson', boss: true, xp: 1350, brain: 'hunson', shot: { speed: 12, color: '#ff4d6d', el: 'fire' } },
    vampire_king:        { name: 'The Vampire King',     fam: 'boss', arch: 'boss', hp: 5000,  dmg: 41, speed: 2.8, r: 1.1,  model: 'vking', boss: true, xp: 1400, brain: 'vampire_king', drain: 0.15, shot: { speed: 12, color: '#ff4d6d' } },
    citadel_guardian:    { name: 'The Citadel Guardian', fam: 'boss', arch: 'boss', hp: 6200,  dmg: 48, speed: 2.0, r: 1.3,  model: 'citadel', boss: true, xp: 1700, brain: 'citadel_guardian', shot: { speed: 13, color: '#ff9fcf' } },
    future_finn:         { name: 'Future Finn',          fam: 'boss', arch: 'boss', hp: 9000,  dmg: 56, speed: 3.0, r: 1.0,  model: 'futurefinn', boss: true, xp: 2600, brain: 'future_finn', shot: { speed: 14, color: '#9fe3ff' } },
    lich:                { name: 'The Lich',             fam: 'boss', arch: 'boss', hp: 12500, dmg: 64, speed: 2.4, r: 1.2,  model: 'lich', boss: true, xp: 3400, brain: 'lich', shot: { speed: 11, color: '#7dff5a', el: 'fire' } },
  };
  /* Bestiary notes (Journal → Bestiary): who they are, and a tip for fighting them. */
  D.BESTIARY = {
    penguin: 'One of Gunter’s cousins. Waddles right up and pecks you. Wenk.',
    bomb_penguin: 'A penguin holding a lit bomb over its head. Take it out before it waddles into you — it explodes.',
    slime: 'A wobbly blob from the Slime Kingdom. Slow, bouncy and a bit sticky.',
    gnome: 'A tiny wizard with a big beard. Keeps its distance and flings purple magic.',
    zombie: 'A Candy Person who caught the zombie sickness from “Slumber Party Panic.” Gumdrops, peppermints, candy corn — they all shamble.',
    bean: 'A jelly bean with legs. It crouches, then leaps at you. Watch for the red circle.',
    fire_wolf: 'A Fire Kingdom wolf with a mane of flames. Its leap sets you on fire.',
    flame_guard: 'A Flame Kingdom guard with a spear. Throws fireballs from a distance.',
    snow_golem: 'A big snowman in a top hat. Winds up a heavy slam that chills everyone nearby.',
    ice_wolf: 'A frosty wolf. Its leap chills you and can freeze you for a moment.',
    imp: 'A little Nightosphere demon with bat wings. Fast and bitey.',
    chaos_demon: 'A hulking three-eyed demon with a mouth full of teeth. Its slam shoves you back.',
    skeleton: 'A dungeon skeleton with a sword. Rattles when it walks.',
    bone_archer: 'A skeleton with a bow. Stays back and shoots — close the gap fast.',
    crystal_guard: 'A floating crystal with orbiting shards. Tough, slow, and it hits like a truck.',
    crystal_bat: 'A crystal bat. Flutters in fast and dives at you.',
    crystal_ant: 'Straight from the “Dungeon Train” episode. Crystal Ants come in packs of three — and in Finn’s future, he’s still fighting them.',
    geode_warrior: 'A rock that cracked open to show glowing crystals inside — and fists. Slow, heavy slams.',
    mud_monster: 'A grumpy mound of mud. Lobs mud balls that slow you down.',
    hair_ape: 'An ape that’s mostly hair. It rubs its hands together to build up static, then zaps a line of blue lightning. Step out of the blue line!',
    bucket_knight: 'A knight with a bucket for a helmet, from Finn’s first real dungeon. Charges at you with a sword and shield.',
    ghost: 'A spooky sheet ghost that floats around and swoops at you.',
    wizard: 'A Wizard City wizard. Casts magic missiles. Wizards only, fools!',
    laser_wizard: 'A wizard who only knows one spell: LASER. It marks a line on the floor first — dodge sideways.',
    forest_wizard: 'A wizard who talks to trees. Its green bolts root you in place for a second.',
    vampire: 'One of the Vampire King’s thralls. Fast, fanged, and it heals itself by biting you.',
    vampire_bat: 'A vampire in bat form. Dives at you and drinks a little health.',
    lich_snail: 'A snail with glowing green eyes — possessed by the Lich. Shoots green fire. It used to wave.',
    lemongrab: 'The Earl of Lemongrab. His scream stuns everyone nearby. UNACCEPTABLE!',
    magic_man: 'Magic Man. Teleports around and throws three bolts at a time. Kind of a jerk.',
    dungeon_warrior: 'A dungeon champion in dark armor with a glowing magic sword. Every third swing sends a sword beam.',
    guardian_angel: 'Looks like a sweet guardian angel and heals the other monsters… Hit it hard enough and you’ll see what it really is.',
    bufo: 'A toad in a purple robe and two wizard hats — really a bunch of wizard tadpoles living inside a frog. Hops at you or spits tadpole bolts.',
    the_fool: 'A snakey little vampire from the Vampire King’s court. Flies in zigzags so you can never tell where it’ll strike.',
    the_empress: 'Blindfolded, one ruby eye, a snake around her neck. Her stare hypnotizes (stuns) anyone close by.',
    the_hierophant: 'A very traditional vampire. At half health he changes shape — bigger, stronger, and his arm turns into a snake.',
    the_moon: 'A huge, moon-faced vampire. Throws pearls that paralyze you for a moment.',
    king_slime: 'The biggest, crowned-est slime on the train. Slams the floor and calls in more slimes.',
    lemongrab_boss: 'The Earl of Lemongrab on his home turf. Screams, charges and summons candy zombies.',
    flesh_beast: 'The big flesh-type creature at the end of Finn and Jake’s first Dungeon Train ride. Lots of eyes. Lots of teeth. Boss battle!',
    demon_cat: 'A big teal cat-demon with approximate knowledge of many things (he called Finn “Frank”). Pounces and slashes. He is terrified of dogs — bring Jake.',
    flame_king: 'Flame Princess’s dad. Fire waves, fire circles, fire wolves. So much fire.',
    grand_master_wizard: 'The head of Wizard City, floating on a giant bubble with a watering can and a staff buzzing with flies. Pop the bubble and he gets mad.',
    ice_king: 'The Ice King. Ice bolts, penguin reinforcements, and a lot of yelling about princesses.',
    hunson: 'Marceline’s dad, the Lord of Evil. Sucks you in, sets things on fire and teleports.',
    vampire_king: 'The Vampire King — part man, part lion, with lizard hands and bird feet. Teleports, pulls you in with his mind, and hurls rings of water.',
    citadel_guardian: 'A pink crystal warden of the Crystal Citadel, where cosmic criminals get locked up. Fires a white laser from its head — get out of the line!',
    future_finn: 'What Finn becomes if he never gets off the train: an old warrior in dented armor, still fighting forever. Sword charges, sword waves and Crystal Ants.',
    lich: 'The Lich. Ancient, evil, and he wants every living thing to STOP. Green fire, a stunning shout, possessed snails and the pull of the Well.',
  };
  D.FAMILIES = {};
  for (const id in D.ENEMIES) { const e = D.ENEMIES[id]; if (!e.elite && !e.boss) (D.FAMILIES[e.fam] = D.FAMILIES[e.fam] || []).push(id); }

  /* Boss attack patterns per phase (phase 2 at 66% health, phase 3 at 33%).
     keep = distance the boss likes to keep (0 = chases you). Every pattern has a timer in seconds.
     Patterns: spread, ring, slam, circles, line, charge, summon, scream (text/color), pull, blink, beam. */
  D.BOSS_BRAINS = {
    king_slime: { keep: 0, intro: 'King Slime oozes out of the floor!', taunts: ['Blorp.', 'BLORP!', 'BLOOORP!!'], phases: [
      { speed: 1, slam: { every: 4.5, r: 3.2, mult: 1.3 }, summon: { every: 10, ids: ['slime'], n: 2, max: 5 } },
      { speed: 1.1, slam: { every: 3.8, r: 3.6, mult: 1.4 }, summon: { every: 8, ids: ['slime'], n: 3, max: 6 }, charge: { every: 7, mult: 1.2 } },
      { speed: 1.25, slam: { every: 3.0, r: 4.0, mult: 1.5 }, summon: { every: 7, ids: ['slime'], n: 3, max: 7 }, charge: { every: 5, mult: 1.3 }, circles: { every: 6, n: 3, r: 1.8, mult: 1.0, el: 'slow' } },
    ] },
    lemongrab: { keep: 0, intro: 'The Earl of Lemongrab blocks the way!', taunts: ['UNACCEPTABLE!', 'Three hours dungeon!', 'UNACCEPTABLE CONDITION!!!'], phases: [
      { speed: 1, scream: { every: 6.5, r: 5.2, mult: 1.1, stun: 0.6 }, charge: { every: 8, mult: 1.2 } },
      { speed: 1.1, scream: { every: 5.5, r: 5.6, mult: 1.2, stun: 0.7 }, charge: { every: 6, mult: 1.3 }, summon: { every: 11, ids: ['zombie', 'bean'], n: 2, max: 5 } },
      { speed: 1.3, scream: { every: 4.5, r: 6.2, mult: 1.3, stun: 0.8 }, charge: { every: 4.5, mult: 1.4 }, summon: { every: 9, ids: ['zombie', 'bean'], n: 3, max: 6 }, circles: { every: 5, n: 4, r: 1.6, mult: 1.0, el: 'slow' } },
    ] },
    flesh_beast: { keep: 0, intro: 'A big flesh-type creature squelches up through the floor. BOSS BATTLE!', taunts: ['*gurgle*', '*SQUELCH!*', '*HORRIBLE SCREECHING*'], phases: [
      { speed: 1, slam: { every: 4.2, r: 3.2, mult: 1.3 }, circles: { every: 6, n: 2, r: 1.9, mult: 1.0, el: 'slow' } },
      { speed: 1.1, slam: { every: 3.6, r: 3.6, mult: 1.4 }, circles: { every: 5, n: 3, r: 2.0, mult: 1.0, el: 'slow' }, summon: { every: 9, ids: ['crystal_ant', 'mud_monster'], n: 2, max: 6 }, charge: { every: 7, mult: 1.2 } },
      { speed: 1.25, slam: { every: 3.0, r: 4.0, mult: 1.5 }, ring: { every: 5, n: 14, mult: 0.8, el: 'slow' }, summon: { every: 8, ids: ['crystal_ant', 'hair_ape'], n: 2, max: 6 }, charge: { every: 5, mult: 1.3 } },
    ] },
    demon_cat: { keep: 2, fearsDogs: true, intro: 'The Demon Cat slinks out of the dark. “I have approximate knowledge of many things.”', taunts: ['I have approximate knowledge of many things.', 'You are a human. Named… Frank.', 'Hsss! Why does it smell like DOG in here?!'], phases: [
      { speed: 1, charge: { every: 5.5, mult: 1.2 }, spread: { every: 3.2, n: 3, arc: 0.5, mult: 0.9 } },
      { speed: 1.15, charge: { every: 4.5, mult: 1.3 }, spread: { every: 2.8, n: 5, arc: 0.7, mult: 0.9 }, summon: { every: 10, ids: ['ghost', 'skeleton'], n: 2, max: 5 }, circles: { every: 7, n: 2, r: 1.8, mult: 1.1 } },
      { speed: 1.3, charge: { every: 3.6, mult: 1.4 }, spread: { every: 2.2, n: 7, arc: 0.9, mult: 0.9 }, summon: { every: 9, ids: ['ghost', 'bucket_knight'], n: 2, max: 6 }, circles: { every: 5, n: 3, r: 1.9, mult: 1.2 }, blink: { every: 7 } },
    ] },
    flame_king: { keep: 5, intro: 'The Flame King is ON FIRE (more than usual)!', taunts: ['Burn, little heroes!', 'You dare?!', 'FLAAAAMES!'], phases: [
      { speed: 1, spread: { every: 2.4, n: 5, arc: 0.6, mult: 0.9, el: 'fire' }, circles: { every: 5.5, n: 2, r: 1.9, mult: 1.2, el: 'fire' } },
      { speed: 1.1, spread: { every: 2.0, n: 7, arc: 0.8, mult: 0.9, el: 'fire' }, circles: { every: 4.5, n: 3, r: 2.0, mult: 1.2, el: 'fire' }, summon: { every: 10, ids: ['fire_wolf'], n: 2, max: 5 } },
      { speed: 1.2, ring: { every: 4, n: 16, mult: 0.8, el: 'fire' }, spread: { every: 2.2, n: 7, arc: 0.8, mult: 0.9, el: 'fire' }, circles: { every: 4, n: 4, r: 2.0, mult: 1.3, el: 'fire' }, summon: { every: 9, ids: ['fire_wolf', 'flame_guard'], n: 2, max: 6 } },
    ] },
    grand_master_wizard: { keep: 6, intro: 'The Grand Master Wizard floats in on his giant bubble. “Wizards only, fools!”', taunts: ['You dare disturb the Grand Master Wizard?', 'Wizards only, FOOLS!', 'MY BUBBLE! You popped my BUBBLE!'], phases: [
      { speed: 1, spread: { every: 2.4, n: 5, arc: 0.7, mult: 0.9 }, circles: { every: 5.5, n: 2, r: 1.8, mult: 1.1, el: 'shock' } },
      { speed: 1.1, spread: { every: 2.1, n: 7, arc: 0.9, mult: 0.9 }, circles: { every: 4.8, n: 3, r: 1.9, mult: 1.1, el: 'shock' }, summon: { every: 10, ids: ['wizard', 'laser_wizard', 'forest_wizard'], n: 2, max: 5 }, line: { every: 7, n: 8, gap: 1.3, r: 1.0, mult: 1.0, el: 'slow' } },
      { speed: 1.35, keep: 3, ring: { every: 4, n: 16, mult: 0.8 }, spread: { every: 1.8, n: 7, arc: 0.9, mult: 0.9 }, circles: { every: 4, n: 3, r: 2.0, mult: 1.2, el: 'shock' }, blink: { every: 6 }, summon: { every: 9, ids: ['laser_wizard', 'forest_wizard'], n: 2, max: 6 } },
    ] },
    ice_king: { keep: 6, intro: 'THE ICE KING!', taunts: ['I’m the Ice King! This is MY train now!', 'GUNTER! GET THEM!', 'Why won’t anybody LOVE ME?!'], phases: [
      { speed: 1, spread: { every: 2.4, n: 5, arc: 0.64, mult: 0.9, el: 'ice' } },
      { speed: 1.05, spread: { every: 2.0, n: 5, arc: 0.64, mult: 0.9, el: 'ice' }, summon: { every: 11, ids: ['penguin', 'penguin', 'bomb_penguin'], n: 3, max: 6 }, circles: { every: 7, n: 1, r: 1.8, mult: 1.2, el: 'ice' } },
      { speed: 1.3, spread: { every: 1.5, n: 7, arc: 0.96, mult: 0.9, el: 'ice' }, summon: { every: 10, ids: ['penguin', 'bomb_penguin'], n: 3, max: 6 }, circles: { every: 6, n: 2, r: 1.8, mult: 1.2, el: 'ice' }, line: { every: 5, n: 7, gap: 1.4, r: 1.0, mult: 0.9, el: 'shock' } },
    ] },
    hunson: { keep: 4, intro: 'Hunson Abadeer, Lord of Evil, would like a word.', taunts: ['I’m going to suck out your soul.', 'Chaos is so much FUN!', 'Where is my AMULET?!'], phases: [
      { speed: 1, spread: { every: 2.6, n: 5, arc: 0.7, mult: 0.9, el: 'fire' }, pull: { every: 9, dur: 1.6, str: 5 }, circles: { every: 6, n: 2, r: 2.0, mult: 1.2, el: 'fire' } },
      { speed: 1.1, spread: { every: 2.2, n: 7, arc: 0.9, mult: 0.9, el: 'fire' }, pull: { every: 8, dur: 1.8, str: 6 }, circles: { every: 5, n: 3, r: 2.0, mult: 1.2, el: 'fire' }, summon: { every: 10, ids: ['imp'], n: 3, max: 6 }, blink: { every: 7 } },
      { speed: 1.25, ring: { every: 4.5, n: 18, mult: 0.8, el: 'fire' }, spread: { every: 2.0, n: 7, arc: 0.9, mult: 0.9, el: 'fire' }, pull: { every: 7, dur: 2, str: 7 }, circles: { every: 4, n: 4, r: 2.1, mult: 1.3, el: 'fire' }, summon: { every: 9, ids: ['imp', 'chaos_demon'], n: 2, max: 6 }, blink: { every: 5 } },
    ] },
    vampire_king: { keep: 3, intro: 'The Vampire King rises from the dust. “I am the Vampire King. And this is MY train now.”', taunts: ['I am the Vampire King.', 'You can’t stake what you can’t catch.', 'I will drink this whole train DRY!'], phases: [
      { speed: 1, spread: { every: 2.6, n: 5, arc: 0.7, mult: 0.9 }, blink: { every: 6 }, pull: { every: 9, dur: 1.5, str: 5 } },
      { speed: 1.15, spread: { every: 2.2, n: 5, arc: 0.7, mult: 0.9 }, blink: { every: 5 }, pull: { every: 8, dur: 1.7, str: 6 }, ring: { every: 6, n: 14, mult: 0.8, el: 'slow', color: '#5ec8ff' }, summon: { every: 10, ids: ['vampire_bat', 'vampire'], n: 3, max: 6 } },
      { speed: 1.3, spread: { every: 1.8, n: 7, arc: 0.9, mult: 0.9 }, blink: { every: 4 }, pull: { every: 7, dur: 2, str: 7 }, ring: { every: 4.5, n: 18, mult: 0.8, el: 'slow', color: '#5ec8ff' }, summon: { every: 9, ids: ['vampire_bat', 'vampire'], n: 3, max: 7 }, charge: { every: 6, mult: 1.4 } },
    ] },
    citadel_guardian: { keep: 4, intro: 'A Citadel Guardian steps out of the crystal. Its head starts to glow.', taunts: ['…', 'COSMIC CRIMINAL.', 'OBLITERATE.'], phases: [
      { speed: 1, beam: { every: 4.5, len: 16, w: 1.3, mult: 1.4, wind: 1.1 }, slam: { every: 6, r: 3.6, mult: 1.3 } },
      { speed: 1.1, beam: { every: 3.8, len: 16, w: 1.4, mult: 1.5, wind: 1.0 }, slam: { every: 5, r: 4.0, mult: 1.4 }, ring: { every: 5, n: 14, mult: 0.8 }, summon: { every: 9, ids: ['crystal_bat'], n: 3, max: 6 } },
      { speed: 1.25, beam: { every: 3.0, len: 18, w: 1.5, mult: 1.6, wind: 0.9 }, slam: { every: 4, r: 4.4, mult: 1.5 }, ring: { every: 4, n: 18, mult: 0.8 }, summon: { every: 8, ids: ['crystal_bat', 'crystal_guard'], n: 2, max: 6 } },
    ] },
    future_finn: { keep: 0, intro: 'An old warrior in dented armor blocks the engine. …It’s you. From the future.', taunts: ['Another adventurer? Heh. Just like me.', 'I never got off, kid. Not once. Not EVER.', 'LEVEL UP! LEVEL UP! LEEEEVEL UUUP!'], phases: [
      { speed: 1, charge: { every: 5, mult: 1.3 }, spread: { every: 3, n: 3, arc: 0.5, mult: 1.0 }, slam: { every: 6.5, r: 3.4, mult: 1.3 } },
      { speed: 1.15, charge: { every: 4.2, mult: 1.4 }, beam: { every: 5.5, len: 15, w: 1.2, mult: 1.3, wind: 0.8, color: '#9fe3ff' }, slam: { every: 5.5, r: 3.8, mult: 1.4 }, summon: { every: 10, ids: ['crystal_ant'], n: 4, max: 8 } },
      { speed: 1.35, charge: { every: 3.4, mult: 1.5 }, beam: { every: 4.2, len: 16, w: 1.3, mult: 1.4, wind: 0.7, color: '#9fe3ff' }, spread: { every: 2.2, n: 7, arc: 0.9, mult: 0.9 }, slam: { every: 4.5, r: 4.2, mult: 1.5 }, summon: { every: 8, ids: ['crystal_ant', 'geode_warrior'], n: 3, max: 8 }, blink: { every: 7 } },
    ] },
    lich: { keep: 5, intro: 'The Lich rises out of the Well. “STOP.”', taunts: ['STOP.', 'All life must end.', 'I will be the last thing you ever see.'], phases: [
      { speed: 1, spread: { every: 2.4, n: 5, arc: 0.7, mult: 0.9, el: 'fire' }, scream: { every: 8, r: 6, mult: 0.9, stun: 1.0, text: 'STOP.', color: '#7dff5a' }, circles: { every: 5.5, n: 2, r: 2.0, mult: 1.2, el: 'fire' } },
      { speed: 1.1, spread: { every: 2.0, n: 7, arc: 0.9, mult: 0.9, el: 'fire' }, scream: { every: 7, r: 6.5, mult: 1.0, stun: 1.1, text: 'STOP.', color: '#7dff5a' }, circles: { every: 4.5, n: 3, r: 2.1, mult: 1.2, el: 'fire' }, summon: { every: 9, ids: ['lich_snail', 'ghost'], n: 3, max: 7 }, pull: { every: 10, dur: 1.8, str: 6 } },
      { speed: 1.25, ring: { every: 4, n: 20, mult: 0.8, el: 'fire' }, spread: { every: 1.8, n: 9, arc: 1.1, mult: 0.9, el: 'fire' }, scream: { every: 6, r: 7, mult: 1.1, stun: 1.2, text: 'STOP.', color: '#7dff5a' }, circles: { every: 4, n: 4, r: 2.1, mult: 1.3, el: 'fire' }, summon: { every: 8, ids: ['lich_snail', 'skeleton', 'ghost'], n: 3, max: 8 }, pull: { every: 8, dur: 2, str: 7 }, beam: { every: 6, len: 16, w: 1.4, mult: 1.3, wind: 1.0, color: '#7dff5a', el: 'fire' } },
    ] },
  };

  /* Trophies: beat a line's boss and get its trophy out alive for a permanent bonus (both heroes).
     Main-line trophies open the next tier; all seven open the Engine. Branch trophies are extra power. */
  D.TROPHIES = {
    grass:   { name: 'King Slime’s Crown',         boss: 'king_slime',          stats: { hpPct: 0.08 },            perk: '+8% max health for both heroes.' },
    candy:   { name: 'Lemongrab’s Sour Lemon',     boss: 'lemongrab_boss',      stats: { xp: 0.12 },               perk: '+12% experience for both heroes.' },
    crypt:   { name: 'Demon Cat’s Whisker',        boss: 'demon_cat',           stats: { crit: 0.04 },             perk: '+4% crit chance for both heroes.' },
    lava:    { name: 'Flame King’s Ember',         boss: 'flame_king',          stats: { burnChance: 0.06 },       perk: 'Every hit has a 6% chance to Burn, for both heroes.' },
    ice:     { name: 'Ice King’s Beard Hair',      boss: 'ice_king',            stats: { chillChance: 0.06 },      perk: 'Every hit has a 6% chance to Chill, for both heroes.' },
    night:   { name: 'Hunson’s Cufflink',          boss: 'hunson',              stats: { lifesteal: 0.03 },        perk: '+3% Lifesteal for both heroes.' },
    crystal: { name: 'Citadel Guardian’s Core',    boss: 'citadel_guardian',    stats: { backpack: 2, safe: 1 },   perk: '+2 backpack slots and +1 safe pocket slot for both heroes.' },
    classic: { name: 'Flesh Beast’s Big Tooth',    boss: 'flesh_beast',         stats: { dmg: 0.05 },              perk: '+5% damage for both heroes.', branch: true },
    wizard:  { name: 'Grand Master’s Watering Can', boss: 'grand_master_wizard', stats: { cdr: 0.06, abilityPower: 0.06 }, perk: 'Abilities recharge 6% faster and hit 6% harder, for both heroes.', branch: true },
    vampire: { name: 'Vampire King’s Crown',       boss: 'vampire_king',        stats: { lifesteal: 0.02, speed: 0.04 }, perk: '+2% Lifesteal and +4% move speed for both heroes.', branch: true },
    lich:    { name: 'The Lich’s Horn',            boss: 'lich',                stats: { dmg: 0.08, hpPct: 0.08 }, perk: '+8% damage and +8% max health for both heroes.', branch: true },
  };

  /* Trip modifiers on the mission board. */
  D.MODS = {
    none:     { name: 'Regular Service', desc: 'Nothing special. Probably.' },
    crowded:  { name: 'Rush Hour',       desc: '40% more monsters, +25% luck.' },
    express:  { name: 'Express Loop',    desc: 'The Loop closes 25% faster. +30% experience.' },
    treasure: { name: 'Treasure Train',  desc: 'Chests drop an extra item. Monsters hit 10% harder.' },
    elites:   { name: 'Elite Patrol',    desc: 'An extra elite rides this train. +40% luck.' },
  };

  D.JOURNEY_PERKS = {
    heart:   { name: 'Bigger Heart',     desc: '+10% max health for both heroes.', stats: { hpPct: 0.1 } },
    swagger: { name: 'Hero Swagger',     desc: '+10% damage for both heroes.', stats: { dmg: 0.1 } },
    nose:    { name: 'Treasure Sense',   desc: '+15% luck for both heroes.', stats: { luck: 0.15 } },
    pockets: { name: 'Extra Pockets',    desc: '+1 safe pocket slot and +2 backpack slots.', stats: { safe: 1, backpack: 2 } },
    brains:  { name: 'Big Brain Energy', desc: '+15% experience and abilities recharge 10% faster.', stats: { xp: 0.15, cdr: 0.1 } },
  };
})();
