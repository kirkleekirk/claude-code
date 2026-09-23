/* The Dungeon Train: an endless train looping around Ooo. Every car is a dungeon room with monsters and
   a treasure chest that unlocks once the car is cleared. The train is split into "lines" (tiers); each
   line ends in a boss car. Beat a line's boss and carry its trophy home to open the next line. */
(function () {
  'use strict';
  const D = DT.data;

  D.LINES = [
    { id: 'grass', tier: 1, name: 'Grassland Cars', rec: 1, cars: [5, 6], loop: 330, fams: ['slime', 'gnome', 'penguin'], boss: 'king_slime',
      blurb: 'The friendliest end of the Dungeon Train. Slimes, gnomes, and one very large slime.', sky: ['#8ed8ff', '#e6f8ff'], ground: '#6cc24a', hills: ['#4fa83a', '#86d266'], scenery: 'trees',
      wall: '#8a7a5c', trim: '#5c4a32', floor: '#9c7a52', accent: '#7ed957' },
    { id: 'candy', tier: 2, name: 'Candy Cars', rec: 4, cars: [5, 7], loop: 320, fams: ['zombie', 'bean', 'penguin'], boss: 'lemongrab_boss',
      blurb: 'Candy people who went a bit zombie, and a lemon earl who finds all of this UNACCEPTABLE.', sky: ['#ffc6e6', '#fff2f9'], ground: '#ff9fcf', hills: ['#ff7ab8', '#ffc0df'], scenery: 'candy',
      wall: '#c77ba6', trim: '#8a3f6a', floor: '#e2a6c4', accent: '#ff8fc7' },
    { id: 'crypt', tier: 3, name: 'Crypt Cars', rec: 8, cars: [6, 7], loop: 315, fams: ['skeleton', 'zombie'], boss: 'bone_baron',
      blurb: 'Coffins, cobwebs and a skeleton aristocrat. Bring a sword. Bring two.', sky: ['#6d7fa3', '#c7d2e8'], ground: '#5c6b58', hills: ['#48563f', '#6c7c62'], scenery: 'graves',
      wall: '#5d6070', trim: '#34364a', floor: '#6b6b74', accent: '#b9c8ff' },
    { id: 'lava', tier: 4, name: 'Lava Cars', rec: 12, cars: [6, 7], loop: 310, fams: ['fire'], boss: 'flame_king',
      blurb: 'The floor is literally lava in places. The Flame King rides at the front.', sky: ['#ffb36b', '#ffe6c2'], ground: '#b8412a', hills: ['#e0583c', '#ff9a5a'], scenery: 'lava',
      wall: '#7a3a2a', trim: '#3f1c14', floor: '#8a4a36', accent: '#ff7a2e' },
    { id: 'ice', tier: 5, name: 'Ice Cars', rec: 16, cars: [7, 8], loop: 305, fams: ['ice', 'penguin'], boss: 'ice_king',
      blurb: 'Frozen cars full of penguins. Someone with a beard keeps yelling about princesses.', sky: ['#bfe9ff', '#f4fcff'], ground: '#e8f6ff', hills: ['#a8dcf5', '#dff3ff'], scenery: 'ice',
      wall: '#7fa6c7', trim: '#3b5f86', floor: '#c9e2f2', accent: '#9fe3ff' },
    { id: 'night', tier: 6, name: 'Nightmare Cars', rec: 20, cars: [7, 8], loop: 300, fams: ['demon', 'skeleton'], boss: 'hunson',
      blurb: 'The train dipped into the Nightosphere. Chaos, demons, and Marceline’s dad.', sky: ['#3a0d1d', '#8a2438'], ground: '#2a0f14', hills: ['#5a1422', '#9a2a40'], scenery: 'spikes',
      wall: '#4a1a26', trim: '#1f0a10', floor: '#3a1a22', accent: '#ff4d6d' },
    { id: 'crystal', tier: 7, name: 'Crystal Cars', rec: 24, cars: [8, 9], loop: 300, fams: ['crystal'], boss: 'crystal_colossus',
      blurb: 'Everything in here is crystal. Including the guards. Especially the giant guard.', sky: ['#b69cff', '#ece4ff'], ground: '#6e5ab8', hills: ['#8f7ae0', '#cbbcff'], scenery: 'crystals',
      wall: '#6a58a8', trim: '#3a2c6e', floor: '#8a7ad0', accent: '#7fe3ff' },
    { id: 'engine', tier: 8, name: 'The Engine', rec: 28, cars: [8, 9], loop: 340, fams: ['skeleton', 'crystal', 'demon'], boss: 'conductor', final: true,
      blurb: 'The front of the Dungeon Train. The Conductor keeps it looping forever. Stop him and the loop breaks.', sky: ['#1d2340', '#4a5170'], ground: '#2a2e38', hills: ['#3a3f4b', '#4a5170'], scenery: 'tunnel',
      wall: '#3f3a4a', trim: '#1d1a26', floor: '#4a4454', accent: '#ffcf3d' },
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
    vault:   { name: 'Treasure Vault',    layout: 'vault',   enemies: [2, 3], breakables: [1, 2], chest: true, chests: 3, locked: true, elite: true },
    boss:    { name: 'Boss Car',          layout: 'boss',    enemies: [0, 0], breakables: [0, 0], chest: false },
    engine:  { name: 'Engine Car',        layout: 'engine',  enemies: [3, 4], breakables: [1, 2], chest: false },
  };

  /* arch: melee | lunger | ranged | bomber | tank | lemongrab | magicman | boss */
  D.ENEMIES = {
    penguin:       { name: 'Penguin',          fam: 'penguin',  arch: 'melee',  hp: 26,  dmg: 5,  speed: 3.0, r: 0.42, model: 'penguin', xp: 6 },
    bomb_penguin:  { name: 'Bomber Penguin',   fam: 'penguin',  arch: 'bomber', hp: 14,  dmg: 18, speed: 4.2, r: 0.42, model: 'penguin', tint: '#d9412b', xp: 6 },
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
    /* elites (middle cars) */
    lemongrab:     { name: 'Earl of Lemongrab', fam: 'elite', arch: 'lemongrab', hp: 380, dmg: 14, speed: 2.6, r: 0.6, model: 'lemongrab', elite: true, xp: 90 },
    magic_man:     { name: 'Magic Man',         fam: 'elite', arch: 'magicman',  hp: 340, dmg: 12, speed: 2.4, r: 0.55, model: 'magicman', elite: true, xp: 90, shot: { speed: 10, color: '#43e0c5' } },
    /* line bosses (fixed stats — each is tuned for its line) */
    king_slime:       { name: 'King Slime',         fam: 'boss', arch: 'boss', hp: 800,  dmg: 12, speed: 2.4, r: 1.35, model: 'king_slime', boss: true, xp: 220,  brain: 'king_slime' },
    lemongrab_boss:   { name: 'Earl of Lemongrab',  fam: 'boss', arch: 'boss', hp: 1400, dmg: 16, speed: 3.0, r: 0.95, model: 'lemongrab_boss', boss: true, xp: 380, brain: 'lemongrab' },
    bone_baron:       { name: 'The Bone Baron',     fam: 'boss', arch: 'boss', hp: 2100, dmg: 22, speed: 2.6, r: 1.0,  model: 'bone_baron', boss: true, xp: 560, brain: 'bone_baron', shot: { speed: 14, color: '#f5f0e1' } },
    flame_king:       { name: 'The Flame King',     fam: 'boss', arch: 'boss', hp: 2900, dmg: 28, speed: 2.4, r: 1.1,  model: 'flame_king', boss: true, xp: 780, brain: 'flame_king', shot: { speed: 11, color: '#ff7a2e', el: 'fire' } },
    ice_king:         { name: 'The Ice King',       fam: 'boss', arch: 'boss', hp: 3800, dmg: 34, speed: 2.4, r: 1.1,  model: 'iceking', boss: true, xp: 1050, brain: 'ice_king', shot: { speed: 12, color: '#9fe3ff', el: 'ice' } },
    hunson:           { name: 'Hunson Abadeer',     fam: 'boss', arch: 'boss', hp: 4800, dmg: 40, speed: 2.6, r: 1.0,  model: 'hunson', boss: true, xp: 1350, brain: 'hunson', shot: { speed: 12, color: '#ff4d6d', el: 'fire' } },
    crystal_colossus: { name: 'The Crystal Colossus', fam: 'boss', arch: 'boss', hp: 6200, dmg: 48, speed: 2.0, r: 1.6, model: 'colossus', boss: true, xp: 1700, brain: 'colossus', shot: { speed: 13, color: '#7fe3ff' } },
    conductor:        { name: 'The Conductor',      fam: 'boss', arch: 'boss', hp: 9000, dmg: 56, speed: 2.8, r: 1.0,  model: 'conductor', boss: true, xp: 2600, brain: 'conductor', shot: { speed: 13, color: '#ffcf3d' } },
  };
  D.FAMILIES = {};
  for (const id in D.ENEMIES) { const e = D.ENEMIES[id]; if (!e.elite && !e.boss) (D.FAMILIES[e.fam] = D.FAMILIES[e.fam] || []).push(id); }

  /* Boss attack patterns per phase (phase 2 at 66% health, phase 3 at 33%).
     keep = distance the boss likes to keep (0 = chases you). Every pattern has a timer in seconds. */
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
    bone_baron: { keep: 3, intro: 'The Bone Baron rises from his coffin!', taunts: ['Rattle rattle.', 'Your bones will make fine furniture!', 'I have SO many bones!'], phases: [
      { speed: 1, spread: { every: 2.6, n: 5, arc: 0.7, mult: 0.8 }, summon: { every: 11, ids: ['skeleton'], n: 2, max: 5 } },
      { speed: 1.1, spread: { every: 2.2, n: 7, arc: 0.9, mult: 0.8 }, summon: { every: 9, ids: ['skeleton', 'bone_archer'], n: 2, max: 6 }, line: { every: 6, n: 7, gap: 1.4, r: 1.0, mult: 1.1 } },
      { speed: 1.25, spread: { every: 1.8, n: 9, arc: 1.1, mult: 0.8 }, summon: { every: 8, ids: ['skeleton', 'bone_archer'], n: 3, max: 7 }, line: { every: 4.5, n: 8, gap: 1.3, r: 1.0, mult: 1.2 }, charge: { every: 6, mult: 1.3 } },
    ] },
    flame_king: { keep: 5, intro: 'The Flame King is ON FIRE (more than usual)!', taunts: ['Burn, little heroes!', 'You dare?!', 'FLAAAAMES!'], phases: [
      { speed: 1, spread: { every: 2.4, n: 5, arc: 0.6, mult: 0.9, el: 'fire' }, circles: { every: 5.5, n: 2, r: 1.9, mult: 1.2, el: 'fire' } },
      { speed: 1.1, spread: { every: 2.0, n: 7, arc: 0.8, mult: 0.9, el: 'fire' }, circles: { every: 4.5, n: 3, r: 2.0, mult: 1.2, el: 'fire' }, summon: { every: 10, ids: ['fire_wolf'], n: 2, max: 5 } },
      { speed: 1.2, ring: { every: 4, n: 16, mult: 0.8, el: 'fire' }, spread: { every: 2.2, n: 7, arc: 0.8, mult: 0.9, el: 'fire' }, circles: { every: 4, n: 4, r: 2.0, mult: 1.3, el: 'fire' }, summon: { every: 9, ids: ['fire_wolf', 'flame_guard'], n: 2, max: 6 } },
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
    colossus: { keep: 0, intro: 'The Crystal Colossus wakes up. The whole car hums.', taunts: ['…', 'INTRUDERS.', 'SHATTER.'], phases: [
      { speed: 1, slam: { every: 4, r: 3.6, mult: 1.3 }, ring: { every: 5.5, n: 12, mult: 0.8 } },
      { speed: 1.1, slam: { every: 3.5, r: 4.0, mult: 1.4 }, ring: { every: 4.5, n: 14, mult: 0.8 }, summon: { every: 9, ids: ['crystal_bat'], n: 3, max: 6 }, line: { every: 6, n: 8, gap: 1.4, r: 1.1, mult: 1.1 } },
      { speed: 1.25, slam: { every: 3.0, r: 4.4, mult: 1.5 }, ring: { every: 3.8, n: 18, mult: 0.8 }, summon: { every: 8, ids: ['crystal_bat', 'crystal_guard'], n: 2, max: 6 }, line: { every: 4.5, n: 9, gap: 1.3, r: 1.1, mult: 1.2 }, charge: { every: 6, mult: 1.4 } },
    ] },
    conductor: { keep: 5, intro: 'The Conductor punches his ticket machine. “LAST STOP.”', taunts: ['Tickets, please.', 'This train NEVER stops.', 'LAST STOP! EVERYBODY OFF!'], phases: [
      { speed: 1, spread: { every: 2.2, n: 5, arc: 0.7, mult: 0.9 }, ring: { every: 6, n: 14, mult: 0.8 }, summon: { every: 11, ids: ['skeleton', 'bone_archer'], n: 2, max: 5 } },
      { speed: 1.15, spread: { every: 1.9, n: 7, arc: 0.9, mult: 0.9 }, ring: { every: 5, n: 16, mult: 0.8 }, summon: { every: 9, ids: ['skeleton', 'imp', 'crystal_bat'], n: 3, max: 6 }, charge: { every: 7, mult: 1.4 }, line: { every: 6, n: 9, gap: 1.3, r: 1.0, mult: 1.1, el: 'shock' } },
      { speed: 1.35, spread: { every: 1.5, n: 9, arc: 1.1, mult: 0.9 }, ring: { every: 3.6, n: 20, mult: 0.8 }, summon: { every: 8, ids: ['skeleton', 'imp', 'crystal_bat', 'bone_archer'], n: 3, max: 7 }, charge: { every: 5, mult: 1.5 }, line: { every: 4.2, n: 10, gap: 1.2, r: 1.0, mult: 1.2, el: 'shock' }, circles: { every: 5, n: 3, r: 1.9, mult: 1.2, el: 'fire' }, blink: { every: 6 } },
    ] },
  };

  /* Trophies: beat a line's boss and get its trophy out alive for a permanent bonus (both heroes). */
  D.TROPHIES = {
    grass:   { name: 'King Slime’s Crown',     boss: 'king_slime',       stats: { hpPct: 0.08 },           perk: '+8% max health for both heroes.' },
    candy:   { name: 'Lemongrab’s Sour Lemon', boss: 'lemongrab_boss',   stats: { xp: 0.12 },              perk: '+12% experience for both heroes.' },
    crypt:   { name: 'The Baron’s Jawbone',    boss: 'bone_baron',       stats: { crit: 0.04 },            perk: '+4% crit chance for both heroes.' },
    lava:    { name: 'Flame King’s Ember',     boss: 'flame_king',       stats: { burnChance: 0.06 },      perk: 'Every hit has a 6% chance to Burn, for both heroes.' },
    ice:     { name: 'Ice King’s Beard Hair',  boss: 'ice_king',         stats: { chillChance: 0.06 },     perk: 'Every hit has a 6% chance to Chill, for both heroes.' },
    night:   { name: 'Hunson’s Cufflink',      boss: 'hunson',           stats: { lifesteal: 0.03 },       perk: '+3% Lifesteal for both heroes.' },
    crystal: { name: 'Colossus Core',          boss: 'crystal_colossus', stats: { backpack: 2, safe: 1 },  perk: '+2 backpack slots and +1 safe pocket slot for both heroes.' },
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
