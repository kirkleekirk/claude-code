/* Skill trees: one big node web per hero. Every node costs 1 point and must connect to a node you
   already own (the start node is free). Node types:
     minor    small stat bump            notable  a named, bigger effect
     ability  unlocks an active ability  mod      upgrades an ability (needs that ability)
     keystone build-defining, with a catch  slot  unlocks a gear slot
   Layout: six branches radiate from the centre; "bridge" nodes link neighbouring branches.
   Jake's nodes are much stronger than Finn's — he scales with skills, Finn scales with gear. */
(function () {
  'use strict';
  const D = DT.data;
  const RING = 1.3, LAT = 1.05;

  function build(hero, def) {
    const nodes = {};
    const link = (a, b) => {
      if (!nodes[a] || !nodes[b]) throw new Error(`Tree ${hero}: bad link ${a} - ${b}`);
      if (!nodes[a].links.includes(b)) nodes[a].links.push(b);
      if (!nodes[b].links.includes(a)) nodes[b].links.push(a);
    };
    nodes[def.start.id] = { id: def.start.id, hero, type: 'start', name: def.start.name, desc: def.start.desc, branch: 'start', color: '#fdf3dc', x: 0, y: 0, links: [] };
    for (const br of def.branches) {
      const a = (br.angle * Math.PI) / 180;
      const dir = [Math.cos(a), Math.sin(a)], perp = [-Math.sin(a), Math.cos(a)];
      let prev = def.start.id;
      for (const n of br.nodes) {
        const lat = n.lat || 0;
        const node = Object.assign({ hero, branch: br.id, color: br.color, links: [] }, n);
        node.x = dir[0] * n.r * RING + perp[0] * lat * LAT;
        node.y = dir[1] * n.r * RING + perp[1] * lat * LAT;
        nodes[n.id] = node;
        for (const p of [].concat(n.from || prev)) link(p, n.id);
        if (!lat) prev = n.id;
      }
    }
    for (const b of def.bridges) {
      const a = (b.angle * Math.PI) / 180;
      nodes[b.id] = Object.assign({ hero, branch: 'bridge', color: '#cfc6ae', links: [], type: 'minor' }, b, { x: Math.cos(a) * 4.35 * RING, y: Math.sin(a) * 4.35 * RING });
      for (const p of b.from) link(p, b.id);
    }
    for (const id in nodes) {
      const n = nodes[id];
      if (n.type === 'ability') n.name = n.name || D.ABILITIES[n.ability].name;
      if (!n.name) n.name = autoName(n);
    }
    return { hero, start: def.start.id, nodes, list: Object.values(nodes), branches: def.branches.map((b) => ({ id: b.id, name: b.name, color: b.color, icon: b.icon, angle: b.angle, blurb: b.blurb })) };
  }

  const NAMES = { dmg: 'Power', primaryDmg: 'Force', atkSpd: 'Quickness', crit: 'Precision', critDmg: 'Ferocity', reach: 'Reach', armor: 'Toughness', hp: 'Vitality',
    hpPct: 'Vitality', luck: 'Luck', speed: 'Swiftness', cdr: 'Focus', abilityPower: 'Magic', regen: 'Recovery', lifesteal: 'Leech', dodge: 'Agility', meterGain: 'Math',
    xp: 'Wisdom', goldFind: 'Greed', interactSpeed: 'Nimble Fingers', backpack: 'Pockets', chillChance: 'Frost', burnChance: 'Flame', shockChance: 'Spark', killHeal: 'Hunger',
    healPower: 'Appetite' };
  function autoName(n) { const k = Object.keys(n.stats || {})[0]; return NAMES[k] || 'Training'; }

  /* ---------------------------------------------------------------- Finn */
  D.TREES = {};
  D.TREES.finn = build('finn', {
    start: { id: 'f_start', name: 'Finn the Human', desc: 'Every hero starts here. Each point you spend must connect to a node you already own.' },
    branches: [
      { id: 'blade', name: 'Blade', angle: -90, color: '#4d9bff', icon: 'sword', blurb: 'Sword skills: combos, crits and the classic Sword Beam.', nodes: [
        { id: 'f_b1', r: 1, type: 'minor', stats: { dmg: 0.03 } },
        { id: 'f_b2', r: 2, type: 'minor', stats: { atkSpd: 0.03 } },
        { id: 'f_b3', r: 3, type: 'notable', name: 'Combo Master', stats: { finisherDmg: 0.25 }, desc: 'The last hit of your sword combo deals 25% more damage.' },
        { id: 'f_b3a', r: 3, lat: -1, from: 'f_b2', type: 'ability', ability: 'sword_spin' },
        { id: 'f_b4', r: 4, type: 'minor', stats: { crit: 0.02 } },
        { id: 'f_b4a', r: 4, lat: -1, from: 'f_b3a', type: 'minor', stats: { dmg: 0.03 } },
        { id: 'f_b4b', r: 4, lat: 1, from: 'f_b3', type: 'minor', stats: { reach: 0.06 } },
        { id: 'f_b5', r: 5, type: 'ability', ability: 'sword_beam' },
        { id: 'f_b5a', r: 5, lat: -1, from: 'f_b4a', type: 'mod', name: 'Spin Cycle', abMods: { sword_spin: { twice: 1 } }, desc: 'Sword Spin spins twice. The second spin deals 70% damage.' },
        { id: 'f_b5b', r: 5, lat: 1, from: 'f_b4b', type: 'minor', stats: { critDmg: 0.1 } },
        { id: 'f_b6', r: 6, type: 'mod', name: 'Triple Beam', abMods: { sword_beam: { count: 2 } }, desc: 'Sword Beam fires 3 beams in a fan instead of 1.' },
        { id: 'f_b6a', r: 6, lat: -1, from: 'f_b5a', type: 'mod', name: 'Whirlpool', abMods: { sword_spin: { pull: 1 } }, desc: 'Sword Spin drags enemies in toward you before it hits.' },
        { id: 'f_b6b', r: 6, lat: 1, from: 'f_b5b', type: 'notable', name: 'Keen Edge', stats: { crit: 0.06, critDmg: 0.2 }, desc: '+6% crit chance and +20% crit damage.' },
        { id: 'f_b7', r: 7, type: 'keystone', name: 'Glass Blade', stats: { primaryDmg: 0.4, armorPct: -0.25 }, desc: 'Your sword combo deals 40% more damage, but you have 25% less armor.' },
      ] },
      { id: 'knight', name: 'Knight', angle: -30, color: '#8fa3c7', icon: 'shield', blurb: 'Armor, sets and blocking. Makes Finn’s armor even better.', nodes: [
        { id: 'f_k1', r: 1, type: 'minor', stats: { armor: 3 } },
        { id: 'f_k2', r: 2, type: 'minor', stats: { hpPct: 0.03 } },
        { id: 'f_k3', r: 3, type: 'ability', ability: 'shield_bash' },
        { id: 'f_k3b', r: 3, lat: 1, from: 'f_k2', type: 'notable', name: 'Full Plate', mods: { armorPerPiece: 0.08 }, desc: '+8% armor for every armor piece you wear (up to +32%).' },
        { id: 'f_k4', r: 4, type: 'mod', name: 'Bash Harder', abMods: { shield_bash: { stun: 0.5, wide: 1 } }, desc: 'Shield Bash Stuns 50% longer and hits a wider area.' },
        { id: 'f_k4a', r: 4, lat: -1, from: 'f_k3', type: 'minor', stats: { armor: 3 } },
        { id: 'f_k4b', r: 4, lat: 1, from: 'f_k3b', type: 'minor', stats: { hp: 15 } },
        { id: 'f_k5', r: 5, type: 'notable', name: 'Set Collector', mods: { setReduce: 1 }, desc: 'Armor set bonuses need one fewer piece: 1 piece for the first bonus, 3 for the big one.' },
        { id: 'f_k5b', r: 5, lat: 1, from: 'f_k4b', type: 'ability', ability: 'parry' },
        { id: 'f_k6', r: 6, type: 'minor', stats: { hpPct: 0.04 } },
        { id: 'f_k6b', r: 6, lat: 1, from: 'f_k5b', type: 'mod', name: 'Riposte', abMods: { parry: { dmg: 1.0, heal: 0.1 } }, desc: 'Perfect Parry’s counterattack deals 100% more damage and heals you for 10%.' },
        { id: 'f_k7', r: 7, type: 'keystone', name: 'Juggernaut', stats: { armorPct: 0.5, speed: -0.12 }, mods: { kbImmune: 1 }, desc: '+50% armor and nothing can knock you back, but you move 12% slower.' },
      ] },
      { id: 'adventurer', name: 'Adventurer', angle: 30, color: '#4cc38a', icon: 'bag', blurb: 'Loot, pockets and gadgets. Carry out more treasure.', nodes: [
        { id: 'f_a1', r: 1, type: 'minor', stats: { luck: 0.05 } },
        { id: 'f_a2', r: 2, type: 'minor', stats: { speed: 0.03 } },
        { id: 'f_a3', r: 3, type: 'ability', ability: 'grapple' },
        { id: 'f_a3b', r: 3, lat: 1, from: 'f_a2', type: 'notable', name: 'Deep Pockets', stats: { backpack: 2 }, desc: '+2 backpack slots.' },
        { id: 'f_a4', r: 4, type: 'mod', name: 'Zip Line', abMods: { grapple: { cdMult: -0.4 } }, desc: 'Grappling Hook recharges 40% faster.' },
        { id: 'f_a4a', r: 4, lat: -1, from: 'f_a3', type: 'minor', stats: { interactSpeed: 0.2 } },
        { id: 'f_a4b', r: 4, lat: 1, from: 'f_a3b', type: 'minor', stats: { goldFind: 0.08 } },
        { id: 'f_a5', r: 5, type: 'notable', name: 'Secret Stash', stats: { safe: 1 }, desc: '+1 Hat Stash slot. Items in your Hat Stash are safe even if you get knocked out.' },
        { id: 'f_a5b', r: 5, lat: 1, from: 'f_a4b', type: 'ability', ability: 'hero_trap' },
        { id: 'f_a6', r: 6, type: 'minor', stats: { luck: 0.06 } },
        { id: 'f_a6b', r: 6, lat: 1, from: 'f_a5b', type: 'mod', name: 'Trap Master', abMods: { hero_trap: { max: 2, explode: 1 } }, desc: 'Place up to 5 traps, and traps explode when triggered, hitting everything nearby.' },
        { id: 'f_a7', r: 7, type: 'keystone', name: 'Treasure Hunter', stats: { luck: 0.4, dmg: -0.1 }, mods: { chestBonus: 1 }, desc: '+40% luck and treasure chests drop 1 extra item, but you deal 10% less damage.' },
      ] },
      { id: 'hero', name: 'Hero', angle: 90, color: '#ffcf3d', icon: 'star', blurb: 'Heroic abilities: leaps, battle cries and pancakes.', nodes: [
        { id: 'f_h1', r: 1, type: 'minor', stats: { cdr: 0.03 } },
        { id: 'f_h2', r: 2, type: 'minor', stats: { abilityPower: 0.05 } },
        { id: 'f_h3', r: 3, type: 'ability', ability: 'heros_leap' },
        { id: 'f_h3b', r: 3, lat: 1, from: 'f_h2', type: 'ability', ability: 'battle_cry' },
        { id: 'f_h4', r: 4, type: 'mod', name: 'Earthshaker Leap', abMods: { heros_leap: { radius: 0.4, fire: 1 } }, desc: 'Hero’s Leap hits a 40% bigger area and sets the floor on fire.' },
        { id: 'f_h4a', r: 4, lat: -1, from: 'f_h3', type: 'minor', stats: { abilityPower: 0.05 } },
        { id: 'f_h4b', r: 4, lat: 1, from: 'f_h3b', type: 'minor', stats: { cdr: 0.03 } },
        { id: 'f_h5', r: 5, type: 'notable', name: 'Heroic Spirit', stats: { abilityPower: 0.1, cdr: 0.08 }, desc: '+10% ability damage, and abilities recharge 8% faster.' },
        { id: 'f_h5b', r: 5, lat: 1, from: 'f_h4b', type: 'mod', name: 'Rallying Cry', abMods: { battle_cry: { dur: 3, heal: 0.2 } }, desc: 'Battle Cry lasts 3 seconds longer and heals you for 20%.' },
        { id: 'f_h6', r: 6, type: 'ability', ability: 'pancake_toss' },
        { id: 'f_h6b', r: 6, lat: 1, from: 'f_h5b', type: 'minor', stats: { abilityPower: 0.05 } },
        { id: 'f_h7a', r: 7, lat: -1, from: 'f_h6', type: 'mod', name: 'Pancake Party', abMods: { pancake_toss: { radius: 0.6, buff: 0.2 } }, desc: 'Bacon Pancakes covers a 60% bigger area and gives +20% damage while you stand near it.' },
        { id: 'f_h7', r: 7, type: 'keystone', name: 'Chosen One', stats: { cdr: 0.3, primaryDmg: -0.15 }, desc: 'Abilities recharge 30% faster, but your sword combo deals 15% less damage.' },
      ] },
      { id: 'relic', name: 'Relic Hunter', angle: 150, color: '#b76bff', icon: 'relic', blurb: 'Makes the Powers on Finn’s gear stronger. Unlocks a 4th relic slot.', nodes: [
        { id: 'f_r1', r: 1, type: 'minor', stats: { meterGain: 0.08 } },
        { id: 'f_r2', r: 2, type: 'minor', stats: { xp: 0.05 } },
        { id: 'f_r3', r: 3, type: 'notable', name: 'Relic Lore', mods: { powerScale: 0.15 }, desc: 'Powers on your gear are 15% stronger.' },
        { id: 'f_r4', r: 4, type: 'minor', stats: { luck: 0.05 } },
        { id: 'f_r4a', r: 4, lat: -1, from: 'f_r3', type: 'minor', stats: { crit: 0.02 } },
        { id: 'f_r4b', r: 4, lat: 1, from: 'f_r3', type: 'minor', stats: { dmg: 0.03 } },
        { id: 'f_r5', r: 5, type: 'notable', name: 'Legend Seeker', mods: { legendDmg: 0.05 }, desc: '+5% damage for every Legendary or Glob-Tier item you wear.' },
        { id: 'f_r5b', r: 5, lat: 1, from: 'f_r4b', type: 'notable', name: 'Mathematical Mind', stats: { meterGain: 0.25 }, desc: 'Your MATHEMATICAL! super meter fills 25% faster.' },
        { id: 'f_juggler', r: 6, type: 'slot', name: 'Relic Juggler', slot: 'relic4', desc: 'Unlocks a 4th relic slot.' },
        { id: 'f_r6b', r: 6, lat: 1, from: 'f_r5b', type: 'minor', stats: { meterGain: 0.1 } },
        { id: 'f_r7', r: 7, type: 'keystone', name: 'Collector', mods: { powerScale: 0.35 }, stats: { xp: -0.2 }, desc: 'Powers on your gear are 35% stronger, but you earn 20% less experience.' },
      ] },
      { id: 'grit', name: 'Grit', angle: 210, color: '#ef6b5b', icon: 'heart', blurb: 'Human toughness: second winds, lifesteal and fighting back from low health.', nodes: [
        { id: 'f_g1', r: 1, type: 'minor', stats: { hp: 15 } },
        { id: 'f_g2', r: 2, type: 'minor', stats: { regen: 0.003 } },
        { id: 'f_g3', r: 3, type: 'notable', name: 'Second Wind', mods: { secondWind: 0.4 }, desc: 'Once per trip, when you would be knocked out, you pop back up with 40% health.' },
        { id: 'f_g4', r: 4, type: 'minor', stats: { lifesteal: 0.02 } },
        { id: 'f_g4a', r: 4, lat: -1, from: 'f_g3', type: 'minor', stats: { hpPct: 0.03 } },
        { id: 'f_g4b', r: 4, lat: 1, from: 'f_g3', type: 'minor', stats: { dodge: 0.03 } },
        { id: 'f_g5', r: 5, type: 'notable', name: 'Never Give Up', mods: { lowHpDmg: 0.3, lowHpSpeed: 0.2 }, desc: 'While below 35% health you deal 30% more damage and move 20% faster.' },
        { id: 'f_g5b', r: 5, lat: 1, from: 'f_g4b', type: 'notable', name: 'Tuck and Roll', stats: { dashCd: 0.3 }, mods: { dashIframes: 0.12 }, desc: 'Your roll recharges 30% faster and keeps you safe from hits a little longer.' },
        { id: 'f_g6', r: 6, type: 'minor', stats: { hpPct: 0.04 } },
        { id: 'f_g7', r: 7, type: 'keystone', name: 'Last Stand', stats: { hpPct: -0.2 }, mods: { lowHpDmg: 0.5, lowHpLifesteal: 0.1 }, desc: 'While below 35% health you deal 50% more damage and heal for 10% of it, but you have 20% less max health.' },
      ] },
    ],
    bridges: [
      { id: 'f_x1', angle: -60, from: ['f_b4b', 'f_k4a'], stats: { dmg: 0.02 } },
      { id: 'f_x2', angle: 0, from: ['f_k4b', 'f_a4a'], stats: { hp: 12 } },
      { id: 'f_x3', angle: 60, from: ['f_a4b', 'f_h4a'], stats: { speed: 0.02 } },
      { id: 'f_x4', angle: 120, from: ['f_h4b', 'f_r4a'], stats: { cdr: 0.02 } },
      { id: 'f_x5', angle: 180, from: ['f_r4b', 'f_g4a'], stats: { crit: 0.02 } },
      { id: 'f_x6', angle: 240, from: ['f_g4b', 'f_b4a'], stats: { dodge: 0.02 } },
    ],
  });

  /* ---------------------------------------------------------------- Jake */
  D.TREES.jake = build('jake', {
    start: { id: 'j_start', name: 'Jake the Dog', desc: 'Every hero starts here. Each point you spend must connect to a node you already own. Jake earns a bonus point every 4 levels.' },
    branches: [
      { id: 'stretchy', name: 'Stretchy', angle: -90, color: '#f6b42a', icon: 'fist', blurb: 'Longer, harder punches that go through enemies.', nodes: [
        { id: 'j_s1', r: 1, type: 'minor', stats: { primaryDmg: 0.1 } },
        { id: 'j_s2', r: 2, type: 'minor', stats: { reach: 0.1, dmg: 0.05 } },
        { id: 'j_s3', r: 3, type: 'ability', ability: 'stretch_grab' },
        { id: 'j_s3b', r: 3, lat: 1, from: 'j_s2', type: 'notable', name: 'Rubber Knuckles', stats: { primaryDmg: 0.2 }, mods: { pierce: 1 }, desc: 'Punches go through 1 extra enemy and deal 20% more damage.' },
        { id: 'j_s4', r: 4, type: 'mod', name: 'Grab Bag', abMods: { stretch_grab: { multi: 1 } }, desc: 'Stretch Grab grabs up to 3 enemies and smashes them together for extra damage around them.' },
        { id: 'j_s4a', r: 4, lat: -1, from: 'j_s3', type: 'minor', stats: { atkSpd: 0.1 } },
        { id: 'j_s4b', r: 4, lat: 1, from: 'j_s3b', type: 'minor', stats: { primaryDmg: 0.1 } },
        { id: 'j_s5', r: 5, type: 'notable', name: 'Long Arm of the Law', stats: { reach: 0.3 }, mods: { distDmg: 0.6 }, desc: '+30% reach. The farther your fist flies, the harder it hits: up to +60% damage at full stretch.' },
        { id: 'j_s5b', r: 5, lat: 1, from: 'j_s4b', type: 'ability', ability: 'stretchy_lasso' },
        { id: 'j_s6', r: 6, type: 'minor', stats: { primaryDmg: 0.12 } },
        { id: 'j_s6a', r: 6, lat: -1, from: 'j_s5', type: 'minor', stats: { critDmg: 0.35, crit: 0.04 } },
        { id: 'j_s6b', r: 6, lat: 1, from: 'j_s5b', type: 'mod', name: 'Hog-Tie', abMods: { stretchy_lasso: { stun: 1 } }, desc: 'Stretchy Lasso Stuns for 1 second longer.' },
        { id: 'j_s7', r: 7, type: 'keystone', name: 'Noodle Arms', stats: { reach: 0.8, primaryDmg: -0.15 }, mods: { pierce: 5 }, desc: '+80% reach and punches go through basically everything, but they deal 15% less damage.' },
      ] },
      { id: 'shapeshifter', name: 'Shapeshifter', angle: -30, color: '#ff8fc7', icon: 'ball', blurb: 'Big magical body tricks. Jake’s strongest abilities live here.', nodes: [
        { id: 'j_m1', r: 1, type: 'minor', stats: { abilityPower: 0.15 } },
        { id: 'j_m2', r: 2, type: 'ability', ability: 'stretchy_slam' },
        { id: 'j_m3', r: 3, type: 'mod', name: 'Aftershock', abMods: { stretchy_slam: { after: 1 } }, desc: 'Stretchy Slam hits a second time half a second later, in a bigger circle, for 60% damage.' },
        { id: 'j_m3a', r: 3, lat: -1, from: 'j_m2', type: 'mod', name: 'Wide Slam', abMods: { stretchy_slam: { radius: 0.4 } }, desc: 'Stretchy Slam hits a 40% bigger area.' },
        { id: 'j_m3b', r: 3, lat: 1, from: 'j_m2', type: 'ability', ability: 'bouncy_ball' },
        { id: 'j_m4', r: 4, type: 'minor', stats: { cdr: 0.06, abilityPower: 0.06 } },
        { id: 'j_m4a', r: 4, lat: -1, from: 'j_m3a', type: 'minor', stats: { abilityPower: 0.12 } },
        { id: 'j_m4b', r: 4, lat: 1, from: 'j_m3b', type: 'minor', stats: { abilityPower: 0.12 } },
        { id: 'j_m5', r: 5, type: 'ability', ability: 'giant_jake' },
        { id: 'j_m5b', r: 5, lat: 1, from: 'j_m4b', type: 'mod', name: 'Super Bounce', abMods: { bouncy_ball: { bounces: 2 } }, desc: 'Bouncy Ball bounces 2 more times, slamming the floor around each bounce.' },
        { id: 'j_m6', r: 6, type: 'mod', name: 'Stompy', abMods: { giant_jake: { stomp: 1 } }, desc: 'While Giant, your footsteps shake the floor, hitting everything around you for 40% damage every half second.' },
        { id: 'j_m6a', r: 6, lat: -1, from: 'j_m5', type: 'mod', name: 'Big Time', abMods: { giant_jake: { dur: 4 } }, desc: 'Giant Jake lasts 4 seconds longer.' },
        { id: 'j_m6b', r: 6, lat: 1, from: 'j_m5b', type: 'minor', stats: { cdr: 0.06, abilityPower: 0.08 } },
        { id: 'j_m7', r: 7, type: 'keystone', name: 'Shape Master', stats: { abilityPower: 0.75, primaryDmg: -0.25 }, desc: 'Abilities deal 75% more damage, but punches deal 25% less.' },
      ] },
      { id: 'music', name: 'Music', angle: 30, color: '#b76bff', icon: 'music', blurb: 'Instrument mastery: stronger instrument effects, rhythm and encores.', nodes: [
        { id: 'j_u1', r: 1, type: 'minor', stats: { atkSpd: 0.08 } },
        { id: 'j_u2', r: 2, type: 'notable', name: 'In Tune', stats: { primaryDmg: 0.1 }, mods: { formBoost: 0.4 }, desc: 'Punches deal 10% more damage and your instrument’s special effect is 40% stronger (longer guitar holds, bigger drum blasts, more keytar zaps…).' },
        { id: 'j_u3', r: 3, type: 'minor', stats: { primaryDmg: 0.12 } },
        { id: 'j_u4', r: 4, type: 'notable', name: 'Rhythm', mods: { rhythmEvery: 4, rhythmMult: 0.8 }, desc: 'With any instrument, every 4th punch also hits everything in a wide cone for 80% more damage.' },
        { id: 'j_u4a', r: 4, lat: -1, from: 'j_u3', type: 'minor', stats: { atkSpd: 0.08 } },
        { id: 'j_u4b', r: 4, lat: 1, from: 'j_u3', type: 'minor', stats: { meterGain: 0.15 } },
        { id: 'j_u5', r: 5, type: 'notable', name: 'Encore', stats: { dmg: 0.1 }, mods: { echoAbility: 0.25 }, desc: '+10% damage, and a 25% chance for an ability to happen a second time for free.' },
        { id: 'j_u5b', r: 5, lat: 1, from: 'j_u4b', type: 'ability', ability: 'fist_rain' },
        { id: 'j_u6', r: 6, type: 'minor', stats: { abilityPower: 0.15 } },
        { id: 'j_u6b', r: 6, lat: 1, from: 'j_u5b', type: 'mod', name: 'Downpour', abMods: { fist_rain: { count: 8 } }, desc: 'Fist Rain drops twice as many fists.' },
        { id: 'j_u7', r: 7, type: 'keystone', name: 'Virtuoso', mods: { formBoost: 1.0 }, stats: { cdr: -0.25 }, desc: 'Your instrument’s special effect is TWICE as strong, but abilities recharge 25% slower.' },
      ] },
      { id: 'bigdog', name: 'Big Dog', angle: 90, color: '#d98b4a', icon: 'shield', blurb: 'Huge health, armor and shields.', nodes: [
        { id: 'j_d1', r: 1, type: 'minor', stats: { hpPct: 0.1 } },
        { id: 'j_d2', r: 2, type: 'minor', stats: { armor: 10 } },
        { id: 'j_d3', r: 3, type: 'ability', ability: 'shape_shield' },
        { id: 'j_d4', r: 4, type: 'mod', name: 'Mirror Shield', abMods: { shape_shield: { reflect: 1 } }, desc: 'Shape Shield bounces enemy projectiles back at them.' },
        { id: 'j_d4a', r: 4, lat: -1, from: 'j_d3', type: 'minor', stats: { hpPct: 0.08 } },
        { id: 'j_d4b', r: 4, lat: 1, from: 'j_d3', type: 'minor', stats: { armor: 10 } },
        { id: 'j_d5', r: 5, type: 'notable', name: 'Bulldog', stats: { hpPct: 0.25, armor: 20 }, desc: '+25% max health and +20 armor.' },
        { id: 'j_d5b', r: 5, lat: 1, from: 'j_d4b', type: 'mod', name: 'Snack Shield', abMods: { shape_shield: { healEnd: 1 } }, desc: 'When Shape Shield ends, you heal for whatever shield was left.' },
        { id: 'j_d6', r: 6, type: 'notable', name: 'Thick Fur', stats: { thorns: 0.25 }, mods: { kbImmune: 1 }, desc: 'Enemies that hit you take 25% of the damage back, and nothing can knock you around.' },
        { id: 'j_d6b', r: 6, lat: 1, from: 'j_d5b', type: 'minor', stats: { regen: 0.005 } },
        { id: 'j_d7', r: 7, type: 'keystone', name: 'Big Boy', stats: { hpPct: 0.5, reach: 0.2, speed: -0.15 }, mods: { bigBoy: 1 }, desc: 'You grow bigger: +50% max health and +20% reach, but you move 15% slower.' },
      ] },
      { id: 'magic', name: 'Magic Dog', angle: 150, color: '#43c6e0', icon: 'sparkle', blurb: 'Elements, cooldowns and a second relic slot.', nodes: [
        { id: 'j_g1', r: 1, type: 'minor', stats: { cdr: 0.06, abilityPower: 0.05 } },
        { id: 'j_g2', r: 2, type: 'minor', stats: { chillChance: 0.08 } },
        { id: 'j_g3', r: 3, type: 'ability', ability: 'copter_arms' },
        { id: 'j_g4', r: 4, type: 'mod', name: 'Tornado', abMods: { copter_arms: { pull: 1, dur: 1 } }, desc: 'Helicopter Arms sucks enemies in and lasts 1 second longer.' },
        { id: 'j_g4a', r: 4, lat: -1, from: 'j_g3', type: 'minor', stats: { shockChance: 0.08 } },
        { id: 'j_g4b', r: 4, lat: 1, from: 'j_g3', type: 'minor', stats: { burnChance: 0.08 } },
        { id: 'j_g5', r: 5, type: 'notable', name: 'Frosty Paws', stats: { chillChance: 0.25, dmg: 0.1 }, mods: { vsCold: 0.2 }, desc: '+10% damage. Hits have a 25% chance to Chill, and Chilled or Frozen enemies take 20% more damage.' },
        { id: 'j_g5a', r: 5, lat: -1, from: 'j_g4a', type: 'notable', name: 'Static Fur', stats: { shockChance: 0.2, dmg: 0.1 }, mods: { shockDmg: 0.3 }, desc: '+10% damage. Hits have a 20% chance to Shock, and Shock lightning hits 30% harder.' },
        { id: 'j_g5b', r: 5, lat: 1, from: 'j_g4b', type: 'notable', name: 'Hot Dog', stats: { burnChance: 0.2, dmg: 0.1 }, mods: { vsBurning: 0.2 }, desc: '+10% damage. Hits have a 20% chance to Burn, and Burning enemies take 20% more damage.' },
        { id: 'j_pockets', r: 6, type: 'slot', name: 'Magic Pockets', slot: 'relic2', desc: 'Unlocks Jake’s second relic slot.' },
        { id: 'j_g7', r: 7, type: 'keystone', name: 'Wild Magic', stats: { cdr: 0.2, hpPct: -0.1 }, mods: { wildMagic: 1 }, desc: 'Every ability also sets off a random fire, ice or lightning blast around you, and abilities recharge 20% faster — but you have 10% less max health.' },
      ] },
      { id: 'tummy', name: 'Tummy', angle: 210, color: '#7ed957', icon: 'tummy', blurb: 'A bigger Tummy to keep loot safe, plus healing and snacks.', nodes: [
        { id: 'j_t1', r: 1, type: 'minor', stats: { healPower: 0.15 } },
        { id: 'j_t2', r: 2, type: 'notable', name: 'Big Tummy', stats: { safe: 1 }, desc: '+1 Tummy slot. Items in your Tummy are safe even if you get knocked out.' },
        { id: 'j_t3', r: 3, type: 'minor', stats: { regen: 0.004 } },
        { id: 'j_t4', r: 4, type: 'ability', ability: 'doggy_howl' },
        { id: 'j_t4a', r: 4, lat: -1, from: 'j_t3', type: 'minor', stats: { killHeal: 0.01 } },
        { id: 'j_t4b', r: 4, lat: 1, from: 'j_t3', type: 'minor', stats: { backpack: 1 } },
        { id: 'j_t5', r: 5, type: 'notable', name: 'Bottomless Belly', stats: { safe: 1, backpack: 2 }, desc: '+1 Tummy slot and +2 backpack slots.' },
        { id: 'j_t5a', r: 5, lat: -1, from: 'j_t4a', type: 'mod', name: 'Scary Dog', abMods: { doggy_howl: { amp: 0.25, dur: 1 } }, desc: 'Doggy Howl lasts 1 second longer, and scared enemies take 50% more damage instead of 25%.' },
        { id: 'j_t6', r: 6, type: 'notable', name: 'Snack Attack', stats: { belt: 1 }, mods: { snackDamage: 1 }, desc: '+1 snack belt slot. Eating a snack also gives +30% damage for 6 seconds.' },
        { id: 'j_t7', r: 7, type: 'keystone', name: 'Everything Stew', stats: { killHeal: 0.03, safe: 2, backpack: -3 }, desc: 'Heal 3% whenever you defeat an enemy and +2 Tummy slots, but 3 fewer backpack slots.' },
      ] },
    ],
    bridges: [
      { id: 'j_x1', angle: -60, from: ['j_s4b', 'j_m4a'], stats: { dmg: 0.08 } },
      { id: 'j_x2', angle: 0, from: ['j_m4b', 'j_u4a'], stats: { abilityPower: 0.1 } },
      { id: 'j_x3', angle: 60, from: ['j_u4b', 'j_d4a'], stats: { hpPct: 0.06, dmg: 0.04 } },
      { id: 'j_x4', angle: 120, from: ['j_d4b', 'j_g4a'], stats: { armor: 8 } },
      { id: 'j_x5', angle: 180, from: ['j_g4b', 'j_t4a'], stats: { cdr: 0.05, dmg: 0.04 } },
      { id: 'j_x6', angle: 240, from: ['j_t4b', 'j_s4a'], stats: { atkSpd: 0.06, dmg: 0.04 } },
    ],
  });
})();
