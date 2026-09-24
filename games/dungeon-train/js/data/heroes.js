/* The playable heroes: base stats, gear slots, primary attacks and supers.
   Each hero has a completely different loadout. Add a new hero by adding an entry here,
   a model in game/models.js, a primary in game/combat.js and a tree in data/trees.js. */
(function () {
  'use strict';
  const D = DT.data;

  D.HEROES = {
    finn: {
      id: 'finn', name: 'Finn', title: 'The Human', color: '#3fa9f5',
      hp: 110, hpPerLevel: 12, speed: 6.2, radius: 0.45, dashCd: 1.1, dashName: 'Roll',
      primaryName: 'Sword combo', safeName: 'Hat Stash', safeIcon: 'hat', safeBase: 1, backpackBase: 6, beltBase: 3,
      /* gear slots, in paper-doll order */
      slots: [
        { id: 'weapon', kind: 'sword', label: 'Sword' },
        { id: 'head', kind: 'helmet', label: 'Head' },
        { id: 'body', kind: 'armor', label: 'Body' },
        { id: 'arms', kind: 'gauntlets', label: 'Arms' },
        { id: 'legs', kind: 'boots', label: 'Legs' },
        { id: 'pack', kind: 'pack', label: 'Backpack' },
        { id: 'relic1', kind: 'relic', label: 'Relic' },
        { id: 'relic2', kind: 'relic', label: 'Relic', level: 8 },
        { id: 'relic3', kind: 'relic', label: 'Relic', level: 18 },
        { id: 'relic4', kind: 'relic', label: 'Relic', node: 'f_juggler' },
      ],
      abilityLevels: [1, 1, 5, 12],
      bonusSpEvery: 0,
      style: 'Gear hero. Finn is a human, so he can wear everything: a sword, a full suit of armor, a backpack and up to four relics. He gets strong from the loot he wears.',
      tips: ['Swords change Finn’s whole combo: rapiers stab fast, broadswords slam.', 'A full armor set unlocks set bonuses.', 'His backpack decides how much loot he can carry out.'],
    },
    jake: {
      id: 'jake', name: 'Jake', title: 'The Magic Dog', color: '#f6b42a',
      hp: 140, hpPerLevel: 15, speed: 5.7, radius: 0.6, dashCd: 1.6, dashName: 'Stretch-dash',
      primaryName: 'Stretchy punch', safeName: 'Tummy', safeIcon: 'tummy', safeBase: 2, backpackBase: 8, beltBase: 3,
      slots: [
        { id: 'instrument', kind: 'instrument', label: 'Instrument' },
        { id: 'collar', kind: 'collar', label: 'Collar' },
        { id: 'relic1', kind: 'relic', label: 'Relic' },
        { id: 'relic2', kind: 'relic', label: 'Relic', node: 'j_pockets' },
      ],
      abilityLevels: [1, 1, 5, 12],
      bonusSpEvery: 4,
      /* Jake is magic: he gets stronger every level even without gear */
      levelDmg: 0.012, armorPerLevel: 1,
      style: 'Skill hero. Jake is a magic dog: no weapon and barely any armor. He stretches his fist out to punch, and his instrument changes how that punch works. His skill tree hits much harder than Finn’s, he earns bonus skill points, and his magic makes him hit harder and get tougher every level.',
      tips: ['Hold the attack button to keep a guitar punch in the air and steer it with the mouse.', 'Most of Jake’s power comes from skill tree nodes and abilities.', 'His Tummy keeps two items safe even if you get knocked out.'],
    },
  };
  D.HERO_IDS = Object.keys(D.HEROES);

  /* Finn's swords: the sword type decides the whole combo. */
  D.SWORD_TYPES = {
    short: {
      name: 'Short sword', reach: 2.2,
      desc: 'Quick three-hit combo: slash, slash, then a big spinning slash that knocks enemies back.',
      combo: [{ t: 0.30, mult: 1.0, arc: 110 }, { t: 0.30, mult: 1.1, arc: 110 }, { t: 0.42, mult: 1.6, arc: 180, kb: 8 }],
    },
    great: {
      name: 'Greatsword', reach: 2.7,
      desc: 'Slow, wide swings. The third hit slams the floor and hits everything around Finn.',
      combo: [{ t: 0.46, mult: 1.25, arc: 150 }, { t: 0.50, mult: 1.35, arc: 150 }, { t: 0.66, mult: 2.3, arc: 360, slam: 2.8, kb: 10 }],
    },
    rapier: {
      name: 'Rapier', reach: 3.1,
      desc: 'Very fast stabs straight ahead with a long reach. The third stab lunges forward.',
      combo: [{ t: 0.20, mult: 0.75, arc: 34 }, { t: 0.20, mult: 0.75, arc: 34 }, { t: 0.28, mult: 1.3, arc: 40, lunge: 2.4 }],
    },
    crystal: {
      name: 'Crystal blade', reach: 2.3,
      desc: 'Balanced swings. The third hit throws a crystal wave that flies forward through enemies.',
      combo: [{ t: 0.32, mult: 1.0, arc: 115 }, { t: 0.32, mult: 1.05, arc: 115 }, { t: 0.44, mult: 1.4, arc: 160, wave: 0.8 }],
    },
  };

  /* Jake's instruments: the instrument decides how his stretchy punch behaves. */
  D.PUNCH_FORMS = {
    viola: {
      name: 'Viola', spd: 1.0, mult: 1.0, reach: 3.1, rhythm: 4,
      desc: 'A solid all-round punch. Every 4th punch plays a note that also hits everything in a wide cone.',
    },
    guitar: {
      name: 'Guitar', spd: 0.9, mult: 0.9, reach: 3.3, linger: 0.7, tick: 0.25, tickMult: 0.35,
      desc: 'Hold the attack button: your fist hangs in the air and follows your aim, hitting everything it passes through.',
    },
    drums: {
      name: 'Drums', spd: 0.8, mult: 1.1, reach: 2.9, explode: 0.6, explodeR: 1.9,
      desc: 'Slower punches that explode on impact, hitting everything around the target.',
    },
    bass: {
      name: 'Bass', spd: 0.62, mult: 1.9, reach: 2.8, sweep: 150, stunChance: 0.25, kb: 10,
      desc: 'Very slow, very heavy swinging haymaker that sweeps a wide arc, sends enemies flying and can stun.',
    },
    trumpet: {
      name: 'Trumpet', spd: 0.85, mult: 0.9, reach: 4.4, cone: 64, kb: 8,
      desc: 'A short-range blast that hits everything in a cone in front of Jake and blows enemies back.',
    },
    accordion: {
      name: 'Accordion', spd: 0.9, mult: 0.62, reach: 3.1, split: 3, spread: 0.36,
      desc: 'Every punch squeezes out three fists that fan out.',
    },
    banjo: {
      name: 'Banjo', spd: 1.9, mult: 0.5, reach: 2.7,
      desc: 'Super-fast jabs. Low damage per hit, but a LOT of hits.',
    },
    keytar: {
      name: 'Keytar', spd: 0.95, mult: 0.85, reach: 3.2, chain: 2, chainMult: 0.5,
      desc: 'Punches crackle with electricity that jumps to 2 more enemies nearby.',
    },
    harmonica: {
      name: 'Harmonica', spd: 1.35, mult: 0.7, reach: 3.0, rhythm: 3,
      desc: 'Quick little punches. Every 3rd punch blows a bluesy note that also hits everything in a wide cone.',
    },
    tuba: {
      name: 'Tuba', spd: 0.66, mult: 1.45, reach: 4.8, cone: 90, kb: 12,
      desc: 'OOM-PAH! A slow, huge blast that hits everything in a wide cone and blows enemies way back.',
    },
    theremin: {
      name: 'Theremin', spd: 0.95, mult: 0.8, reach: 3.6, linger: 0.5, tick: 0.2, tickMult: 0.3, chain: 1, chainMult: 0.45,
      desc: 'Spooky wobbly music. Hold attack and your fist floats in the air, hitting everything it passes, and every hit zaps 1 more enemy nearby.',
    },
  };

  /* Each hero's MATHEMATICAL! super (the meter fills as you fight). */
  D.SUPERS = {
    finn: { name: 'Hero Rush', icon: 'sword', desc: 'For 4 seconds Finn zips from enemy to enemy, slashing everything in his path. He can’t be hurt while rushing.' },
    jake: { name: 'Mega Jake', icon: 'fist', desc: 'Jake grows HUGE for 7 seconds: every punch becomes a floor-shaking slam, he takes half damage and stomps enemies as he walks.' },
  };
})();
