/* Routes (tiers), car types, enemies, and princesses. */
(function () {
  'use strict';
  const D = AE.data;

  D.ROUTES = [
    { id: 'grasslands',   tier: 1, name: 'Grasslands Local',            rec: 1,  cars: [5, 6], blizzard: 330, fams: ['penguin', 'slime', 'gnome'],
      blurb: 'A sleepy line through the grasslands. The penguins on board are acting weird.', sky: ['#8ed8ff', '#e6f8ff'], ground: '#6cc24a', hills: ['#4fa83a', '#86d266'], scenery: 'trees' },
    { id: 'candy',        tier: 2, name: 'Candy Kingdom Express',       rec: 4,  cars: [6, 7], blizzard: 310, fams: ['zombie', 'bean', 'penguin'],
      blurb: 'Pink hills, gumdrop trees, and candy people who got a little too zombie.', sky: ['#ffc6e6', '#fff2f9'], ground: '#ff9fcf', hills: ['#ff7ab8', '#ffc0df'], scenery: 'candy' },
    { id: 'fire',         tier: 3, name: 'Fire Kingdom Line',           rec: 8,  cars: [6, 7], blizzard: 300, fams: ['fire'],
      blurb: 'Everything is on fire. On purpose. Mostly.', sky: ['#ffb36b', '#ffe6c2'], ground: '#b8412a', hills: ['#e0583c', '#ff9a5a'], scenery: 'lava' },
    { id: 'ice',          tier: 4, name: 'Ice Kingdom Line',            rec: 12, cars: [7, 8], blizzard: 290, fams: ['ice', 'penguin'],
      blurb: 'The Ice King’s back yard. Penguins. So many penguins.', sky: ['#bfe9ff', '#f4fcff'], ground: '#e8f6ff', hills: ['#a8dcf5', '#dff3ff'], scenery: 'ice' },
    { id: 'nightosphere', tier: 5, name: 'Nightosphere Night Train',    rec: 16, cars: [7, 8], blizzard: 280, fams: ['demon', 'skeleton'],
      blurb: 'Chaos, demons, and a smell you won’t forget.', sky: ['#3a0d1d', '#8a2438'], ground: '#2a0f14', hills: ['#5a1422', '#9a2a40'], scenery: 'spikes' },
    { id: 'crystal',      tier: 6, name: 'Crystal Dimension Loop',      rec: 20, cars: [8, 9], blizzard: 270, fams: ['crystal'],
      blurb: 'Everything here is crystal. Including the guards. Especially the guards.', sky: ['#b69cff', '#ece4ff'], ground: '#6e5ab8', hills: ['#8f7ae0', '#cbbcff'], scenery: 'crystals' },
    { id: 'blizzard',     tier: 7, name: "Ice King's Blizzard Express", rec: 24, cars: [8, 9], blizzard: 320, fams: ['ice', 'penguin', 'crystal'], final: true,
      blurb: 'Every princess is safe, and the Ice King is furious. He’s driving this train himself.', sky: ['#7fa9c9', '#e2f1fb'], ground: '#dff1fb', hills: ['#9cc7e2', '#d6ecf9'], scenery: 'ice' },
  ];

  D.CAR_TYPES = {
    caboose:   { name: 'Caboose',       layout: 'caboose', enemies: [0, 0], breakables: [2, 3], chests: [0, 0] },
    passenger: { name: 'Passenger Car', layout: 'seats',   enemies: [3, 5], breakables: [2, 4], chests: [0, 1], weight: 5 },
    dining:    { name: 'Dining Car',    layout: 'tables',  enemies: [3, 5], breakables: [3, 5], chests: [0, 1], weight: 3 },
    cargo:     { name: 'Cargo Car',     layout: 'crates',  enemies: [2, 4], breakables: [6, 9], chests: [1, 1], weight: 4 },
    sleeper:   { name: 'Sleeper Car',   layout: 'bunks',   enemies: [3, 4], breakables: [2, 3], chests: [0, 1], weight: 2 },
    lounge:    { name: 'Lounge Car',    layout: 'lounge',  enemies: [4, 6], breakables: [1, 3], chests: [0, 1], weight: 2 },
    vault:     { name: 'Vault Car',     layout: 'vault',   enemies: [2, 3], breakables: [1, 2], chests: [2, 3], locked: true, elite: true },
    engine:    { name: 'Engine',        layout: 'engine',  enemies: [3, 5], breakables: [1, 2], chests: [1, 1] },
  };

  /* arch: melee | lunger | ranged | bomber | tank | lemongrab | magicman | iceking */
  D.ENEMIES = {
    penguin:       { name: 'Penguin',            fam: 'penguin',  arch: 'melee',  hp: 26,  dmg: 5,  speed: 3.0, r: 0.42, model: 'penguin', xp: 6 },
    bomb_penguin:  { name: 'Bomber Penguin',     fam: 'penguin',  arch: 'bomber', hp: 14,  dmg: 18, speed: 4.2, r: 0.42, model: 'penguin', tint: '#d9412b', xp: 6 },
    slime:         { name: 'Slime',              fam: 'slime',    arch: 'melee',  hp: 34,  dmg: 5,  speed: 2.2, r: 0.55, model: 'slime', color: '#7ed957', xp: 6 },
    gnome:         { name: 'Gnome Wizard',       fam: 'gnome',    arch: 'ranged', hp: 22,  dmg: 6,  speed: 2.4, r: 0.4,  model: 'gnome', xp: 8, shot: { speed: 9, color: '#b061ff' } },
    zombie:        { name: 'Candy Zombie',       fam: 'zombie',   arch: 'melee',  hp: 42,  dmg: 7,  speed: 2.2, r: 0.5,  model: 'zombie', xp: 8 },
    bean:          { name: 'Jelly Bean',         fam: 'bean',     arch: 'lunger', hp: 24,  dmg: 8,  speed: 3.4, r: 0.4,  model: 'bean', xp: 7 },
    fire_wolf:     { name: 'Fire Wolf',          fam: 'fire',     arch: 'lunger', hp: 38,  dmg: 9,  speed: 4.2, r: 0.55, model: 'wolf', color: '#ff7a2e', burn: true, xp: 10 },
    flame_guard:   { name: 'Flame Guard',        fam: 'fire',     arch: 'ranged', hp: 40,  dmg: 8,  speed: 2.4, r: 0.5,  model: 'flameguy', xp: 10, shot: { speed: 10, color: '#ff7a2e', burn: true } },
    snow_golem:    { name: 'Snow Golem',         fam: 'ice',      arch: 'tank',   hp: 110, dmg: 18, speed: 1.7, r: 0.8,  model: 'snowman', chill: true, xp: 18 },
    ice_wolf:      { name: 'Ice Wolf',           fam: 'ice',      arch: 'lunger', hp: 36,  dmg: 9,  speed: 4.2, r: 0.55, model: 'wolf', color: '#9fd8ff', chill: true, xp: 10 },
    imp:           { name: 'Nightosphere Imp',   fam: 'demon',    arch: 'melee',  hp: 32,  dmg: 9,  speed: 3.8, r: 0.42, model: 'imp', xp: 10 },
    chaos_demon:   { name: 'Chaos Demon',        fam: 'demon',    arch: 'tank',   hp: 130, dmg: 20, speed: 1.9, r: 0.85, model: 'demon', xp: 20 },
    skeleton:      { name: 'Skeleton Knight',    fam: 'skeleton', arch: 'melee',  hp: 40,  dmg: 9,  speed: 2.8, r: 0.45, model: 'skeleton', xp: 10 },
    bone_archer:   { name: 'Bone Archer',        fam: 'skeleton', arch: 'ranged', hp: 28,  dmg: 8,  speed: 2.6, r: 0.42, model: 'skeleton', xp: 10, shot: { speed: 13, color: '#f5f0e1' } },
    crystal_guard: { name: 'Crystal Guardian',   fam: 'crystal',  arch: 'tank',   hp: 140, dmg: 20, speed: 1.8, r: 0.8,  model: 'crystal', xp: 22 },
    crystal_bat:   { name: 'Crystal Bat',        fam: 'crystal',  arch: 'lunger', hp: 26,  dmg: 8,  speed: 4.6, r: 0.4,  model: 'bat', flying: true, xp: 9 },
    lemongrab:     { name: 'Earl of Lemongrab',  fam: 'elite',    arch: 'lemongrab', hp: 380, dmg: 14, speed: 2.6, r: 0.6, model: 'lemongrab', elite: true, xp: 90 },
    magic_man:     { name: 'Magic Man',          fam: 'elite',    arch: 'magicman',  hp: 340, dmg: 12, speed: 2.4, r: 0.55, model: 'magicman', elite: true, xp: 90, shot: { speed: 10, color: '#43e0c5' } },
    ice_king:      { name: 'The Ice King',       fam: 'boss',     arch: 'iceking',   hp: 3600, dmg: 26, speed: 2.4, r: 0.9, model: 'iceking', boss: true, fixed: true, xp: 1500, shot: { speed: 12, color: '#9fe3ff', chill: true } },
  };
  D.FAMILIES = {};
  for (const id in D.ENEMIES) { const e = D.ENEMIES[id]; if (!e.elite && !e.boss) (D.FAMILIES[e.fam] = D.FAMILIES[e.fam] || []).push(id); }

  D.PRINCESSES = [
    { id: 'hotdog',    name: 'Hot Dog Princess',     route: 'grasslands',   color: '#e8633a', stats: { hpPct: 0.1 },      perk: '+10% max HP for both heroes.' },
    { id: 'bubblegum', name: 'Princess Bubblegum',   route: 'candy',        color: '#ff8fc7', stats: { xp: 0.15 },        perk: '+15% XP. Science!' },
    { id: 'flame',     name: 'Flame Princess',       route: 'fire',         color: '#ff7a2e', stats: { burnChance: 0.08 }, perk: 'Every hit has an 8% chance to burn.' },
    { id: 'wildberry', name: 'Wildberry Princess',   route: 'ice',          color: '#c9365b', stats: { crit: 0.05 },      perk: '+5% crit chance for both heroes.' },
    { id: 'lsp',       name: 'Lumpy Space Princess', route: 'nightosphere', color: '#b58bff', stats: { backpack: 3 },     perk: '+3 backpack slots. Oh my glob.' },
    { id: 'slime',     name: 'Slime Princess',       route: 'crystal',      color: '#7ed957', stats: { luck: 0.15 },      perk: '+15% luck.' },
  ];

  D.HERO_BASE = {
    finn: { name: 'Finn', hp: 100, hpPerLevel: 12, speed: 6.4, radius: 0.45, dashCd: 1.2, color: '#3fa9f5' },
    jake: { name: 'Jake', hp: 130, hpPerLevel: 15, speed: 5.6, radius: 0.6,  dashCd: 1.8, color: '#f6b42a' },
  };
})();
