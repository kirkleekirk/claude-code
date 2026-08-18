/* BUNKER '86 — static content: needs, furniture, traits, events, loot, horror text. */
(function (BK) {
  'use strict';

  // ---------------------------------------------------------------- needs --
  // decay = points lost per game-hour while awake.
  BK.NEEDS = [
    { key: 'hunger',  label: 'HUNGER',  icon: '🥫', decay: 6.0 },
    { key: 'thirst',  label: 'THIRST',  icon: '💧', decay: 8.0 },
    { key: 'energy',  label: 'ENERGY',  icon: '⚡', decay: 5.0 },
    { key: 'bladder', label: 'BLADDER', icon: '🚽', decay: 10.0 },
    { key: 'hygiene', label: 'HYGIENE', icon: '🧼', decay: 3.5 },
    { key: 'fun',     label: 'FUN',     icon: '📼', decay: 4.5 },
    { key: 'social',  label: 'SOCIAL',  icon: '💬', decay: 3.0 }
  ];

  BK.RESOURCES = [
    { key: 'food',  label: 'FOOD',  icon: '🥫', base: 60 },
    { key: 'water', label: 'WATER', icon: '💧', base: 60 },
    { key: 'fuel',  label: 'FUEL',  icon: '🛢', base: 40 },
    { key: 'meds',  label: 'MEDS',  icon: '💊', base: 20 },
    { key: 'scrap', label: 'SCRAP', icon: '🔩', base: 90 }
  ];

  BK.SKILLS = [
    { key: 'repair',     label: 'REPAIR',   icon: '🔧' },
    { key: 'cooking',    label: 'COOKING',  icon: '🍳' },
    { key: 'medicine',   label: 'MEDICINE', icon: '⚕' },
    { key: 'farming',    label: 'FARMING',  icon: '🌱' },
    { key: 'scavenging', label: 'SCAVENGE', icon: '🎒' },
    { key: 'nerve',      label: 'NERVE',    icon: '🕯' }
  ];

  // ------------------------------------------------------------ furniture --
  // Buy-mode objects placed on bunker tiles.
  //   w/h      footprint in tiles
  //   power    draw while active (negative = generates)
  //   light    light radius when powered
  //   acts     interactions: gain (need pts/hr), use/make (units/hr), skill
  BK.OBJECTS = {
    cot: {
      name: 'ARMY COT', cost: 8, w: 1, h: 1, power: 0, sprite: 'cot',
      blurb: 'Canvas and steel tube. Smells like a footlocker.',
      acts: [{ id: 'sleep', label: 'Sleep', gain: { energy: 20, hygiene: -1 }, sleep: true, dur: 6 }]
    },
    hotplate: {
      name: 'HOT PLATE', cost: 16, w: 1, h: 1, power: 3, sprite: 'hotplate',
      blurb: 'One coil, two settings: off and house fire.',
      acts: [{ id: 'eat', label: 'Heat a ration', gain: { hunger: 45, fun: 3 }, use: { food: 1.4 }, skill: 'cooking', needPower: true }]
    },
    filter: {
      name: 'WATER RECLAIMER', cost: 22, w: 2, h: 1, power: 4, sprite: 'filter',
      blurb: 'Charcoal, sand and prayer. Tastes like a municipal pool.',
      passive: { make: { water: 1.4 }, needPower: true },
      acts: [
        { id: 'drink', label: 'Drink', gain: { thirst: 60 }, use: { water: 0.9 } },
        { id: 'purify', label: 'Run the filters', gain: { fun: -3 }, make: { water: 2.4 }, skill: 'repair', work: true, needPower: true }
      ]
    },
    latrine: {
      name: 'CHEMICAL TOILET', cost: 10, w: 1, h: 1, power: 0, sprite: 'latrine',
      blurb: 'A curtain on a track. The whole bunker respects the curtain.',
      acts: [{ id: 'relieve', label: 'Use the head', gain: { bladder: 130, hygiene: -3 }, use: { water: 0.2 } }]
    },
    shower: {
      name: 'DRUM SHOWER', cost: 14, w: 1, h: 1, power: 1, sprite: 'shower',
      blurb: 'Fifty gallon drum, a shower head, and thirty seconds of warm.',
      acts: [{ id: 'shower', label: 'Shower', gain: { hygiene: 80, fun: 5 }, use: { water: 1.1 } }]
    },
    arcade: {
      name: 'ARCADE CABINET', cost: 26, w: 1, h: 1, power: 3, sprite: 'arcade', glow: '#ff3ea5',
      blurb: 'ASTRO SIEGE II. High score belongs to somebody who is not here anymore.',
      light: 3.2,
      acts: [{ id: 'play', label: 'Play ASTRO SIEGE', gain: { fun: 38, energy: -3 }, needPower: true }]
    },
    boombox: {
      name: 'BOOMBOX', cost: 12, w: 1, h: 1, power: 1, sprite: 'boombox',
      blurb: 'Twin cassette deck. Six D batteries. Non-negotiable.',
      acts: [{ id: 'music', label: 'Crank a tape', gain: { fun: 24, social: 18 }, needPower: true, social: true }]
    },
    tv: {
      name: 'TV & VCR', cost: 20, w: 1, h: 1, power: 2, sprite: 'tv', glow: '#7ee8ff',
      blurb: 'Nothing on every channel. The tapes still work.',
      light: 3.4,
      acts: [
        { id: 'watch', label: 'Watch a tape', gain: { fun: 30, social: 8 }, needPower: true, social: true },
        { id: 'static', label: 'Watch the static', gain: { fun: -6, sanity: -8 }, needPower: true, creepy: true }
      ]
    },
    medstation: {
      name: 'MED STATION', cost: 32, w: 2, h: 1, power: 3, sprite: 'medstation',
      blurb: 'Iodine, sutures, and a chart of a body with the labels worn off.',
      acts: [
        { id: 'treat', label: 'Patch up', gain: { health: 20 }, use: { meds: 0.6 }, needPower: true },
        { id: 'scrub', label: 'Rad scrub', gain: { rads: -12, hygiene: 6 }, use: { meds: 0.5, water: 0.5 }, needPower: true },
        { id: 'sedate', label: 'Sedatives', gain: { sanity: 26, energy: -8 }, use: { meds: 0.8 } }
      ]
    },
    workbench: {
      name: 'WORKBENCH', cost: 24, w: 2, h: 1, power: 2, sprite: 'workbench',
      blurb: 'Duct tape is load-bearing here.',
      acts: [{ id: 'strip', label: 'Strip scrap', gain: { hygiene: -5, fun: -2 }, make: { scrap: 1.8 }, skill: 'repair', work: true }]
    },
    growtray: {
      name: 'GROW TRAY', cost: 30, w: 2, h: 1, power: 5, sprite: 'growtray', glow: '#b6ff5a',
      blurb: 'Hydroponics under sodium lamps. Tomatoes that have never seen the sun.',
      light: 4.2,
      passive: { make: { food: 0.55 }, use: { water: 0.3 }, needPower: true },
      acts: [{ id: 'tend', label: 'Tend the trays', gain: { fun: 6, sanity: 4 }, make: { food: 1.9 }, use: { water: 0.5 }, skill: 'farming', work: true, needPower: true }]
    },
    generator: {
      name: 'DIESEL GENERATOR', cost: 28, w: 2, h: 2, power: -16, sprite: 'generator', glow: '#ffb347',
      blurb: 'Pulled from a school bus. It coughs. You cough back.',
      light: 3.4,
      passive: { use: { fuel: 0.4 } },
      acts: [{ id: 'tune', label: 'Tune the genny', gain: { hygiene: -7 }, boostPower: 8, skill: 'repair', work: true }]
    },
    radiorig: {
      name: 'RADIO RIG', cost: 26, w: 2, h: 1, power: 2, sprite: 'radiorig', glow: '#63f7c1',
      blurb: 'Ham set, a wall of tape decks, and the last DJ in the county.',
      light: 3.0,
      acts: [
        { id: 'broadcast', label: 'Work the airwaves', gain: { social: 20, fun: 10, sanity: 5 }, skill: 'nerve', work: true, morale: true, needPower: true },
        { id: 'scan', label: 'Scan the bands', gain: { fun: 3, sanity: -6 }, work: true, intel: true, needPower: true, creepy: true }
      ]
    },
    shelf: {
      name: 'STEEL SHELVING', cost: 12, w: 2, h: 1, power: 0, sprite: 'shelf',
      blurb: 'Crates, cans, and one box marked XMAS that everybody avoids.',
      capBonus: { food: 40, water: 40, fuel: 20, meds: 12, scrap: 40 }
    },
    lamp: {
      name: 'WORK LAMP', cost: 6, w: 1, h: 1, power: 1, sprite: 'lamp', glow: '#ffd489',
      blurb: 'A caged bulb on a stand. The dark in here is not normal dark.',
      light: 7.0
    },
    heater: {
      name: 'SPACE HEATER', cost: 14, w: 1, h: 1, power: 4, sprite: 'heater', glow: '#ff7a3d',
      blurb: 'Orange coils. Everyone gathers around it without admitting to it.',
      light: 3.6,
      passive: { comfort: 6, needPower: true }
    }
  };

  BK.BUY_ORDER = ['cot', 'lamp', 'hotplate', 'latrine', 'shower', 'filter', 'boombox', 'arcade', 'tv',
    'workbench', 'shelf', 'heater', 'medstation', 'growtray', 'generator', 'radiorig'];

  // Which object + act best serves a need (free-will lookup).
  BK.NEED_SOURCES = {
    energy:  [['cot', 'sleep']],
    hunger:  [['hotplate', 'eat']],
    thirst:  [['filter', 'drink']],
    bladder: [['latrine', 'relieve']],
    hygiene: [['shower', 'shower']],
    fun:     [['arcade', 'play'], ['tv', 'watch'], ['boombox', 'music']],
    social:  [['boombox', 'music'], ['tv', 'watch'], ['radiorig', 'broadcast']]
  };

  // --------------------------------------------------------------- traits --
  BK.TRAITS = [
    { key: 'boombox',    name: 'Boombox Fiend',  desc: 'Fun drains slower.',                    fx: { decay: { fun: 0.6 } } },
    { key: 'iron',       name: 'Iron Stomach',   desc: 'Hunger drains slower.',                 fx: { decay: { hunger: 0.7 } } },
    { key: 'glowing',    name: 'Glows a Little', desc: 'Takes 40% less radiation.',             fx: { radMult: 0.6 } },
    { key: 'nightowl',   name: 'Night Owl',      desc: 'Keeps it together after dark.',         fx: { nightOwl: true } },
    { key: 'handy',      name: 'Handy',          desc: 'Repair work 50% faster.',               fx: { skillBoost: { repair: 1.5 } } },
    { key: 'greenthumb', name: 'Green Thumb',    desc: 'Grows 50% more food.',                  fx: { skillBoost: { farming: 1.5 } } },
    { key: 'packrat',    name: 'Pack Rat',       desc: 'Carries 4 more items.',                 fx: { carry: 4 } },
    { key: 'loner',      name: 'Loner',          desc: 'Social drains slower, bonds crawl.',    fx: { decay: { social: 0.5 }, relMult: 0.5 } },
    { key: 'party',      name: 'Party Animal',   desc: 'Bonds fast, bores fast.',               fx: { relMult: 1.6, decay: { fun: 1.3 } } },
    { key: 'clean',      name: 'Neat Freak',     desc: 'Hygiene drains slower.',                fx: { decay: { hygiene: 0.6 } } },
    { key: 'steady',     name: 'Steady Hands',   desc: 'Sanity erodes 35% slower.',             fx: { sanityMult: 0.65 } },
    { key: 'jumpy',      name: 'Jumpy',          desc: 'Fast on their feet, easy to spook.',    fx: { speed: 1.12, sanityMult: 1.4 } },
    { key: 'tough',      name: 'Tough as Nails', desc: '+25 max health.',                       fx: { maxHealth: 25 } },
    { key: 'darkeyes',   name: 'Dark-Adapted',   desc: 'Sees further without a light.',         fx: { vision: 3.5 } },
    { key: 'believer',   name: 'Believer',       desc: 'Holds the crew together.',              fx: { auraSanity: 3 } },
    { key: 'cook',       name: 'Line Cook',      desc: 'Stretches rations further.',            fx: { skillBoost: { cooking: 1.5 }, foodEfficiency: 0.7 } }
  ];

  // ---------------------------------------------------------------- names --
  BK.FIRST_NAMES = ['Kurt', 'Tina', 'Deon', 'Misty', 'Rhonda', 'Dale', 'Vinnie', 'Joleen', 'Rusty', 'Trish',
    'Duane', 'Cyndi', 'Marlon', 'Sheena', 'Donna', 'Lyle', 'Roxanne', 'Wade', 'Bobbi', 'Stu',
    'Yolanda', 'Randy', 'Peggy', 'Hector', 'Junie', 'Cliff', 'Darla', 'Manny', 'Suzette', 'Gary',
    'Lorna', 'Boyd', 'Charmaine', 'Ozzie', 'Nadine', 'Terrence', 'Vicki', 'Sal', 'Brenda', 'Kip'];
  BK.LAST_NAMES = ['Delgado', 'Kowalski', 'Brandt', 'Vasquez', 'Nakamura', 'Rourke', 'Ferraro', 'Boone',
    'Whitaker', 'Ostrowski', 'Mancuso', 'Doyle', 'Ibarra', 'Pruitt', 'Zelinski', 'Hobbs',
    'Castellano', 'Byrd', 'Okafor', 'Lindqvist', 'Salazar', 'Tran', 'Marchetti', 'Culp'];

  // ----------------------------------------------------------- containers --
  // Surface loot. weight = relative frequency inside a container.
  BK.LOOT = [
    { key: 'food',  label: 'canned peaches',     min: 1, max: 4, weight: 24 },
    { key: 'food',  label: 'a box of TV dinners', min: 2, max: 5, weight: 12 },
    { key: 'water', label: 'sealed jugs',        min: 1, max: 4, weight: 22 },
    { key: 'scrap', label: 'copper wire',        min: 2, max: 6, weight: 26 },
    { key: 'scrap', label: 'a busted toaster',   min: 1, max: 3, weight: 14 },
    { key: 'fuel',  label: 'siphoned diesel',    min: 1, max: 4, weight: 15 },
    { key: 'meds',  label: 'a pharmacy drawer',  min: 1, max: 3, weight: 11 },
    { key: 'meds',  label: 'iodine tablets',     min: 1, max: 2, weight: 9 }
  ];

  BK.CONTAINERS = [
    { key: 'fridge',  name: 'REFRIGERATOR', bias: { food: 3, water: 2 } },
    { key: 'cabinet', name: 'CABINET',      bias: { food: 2, meds: 2 } },
    { key: 'locker',  name: 'LOCKER',       bias: { scrap: 2, meds: 1 } },
    { key: 'crate',   name: 'CRATE',        bias: { scrap: 3, fuel: 2 } },
    { key: 'car',     name: 'CAR TRUNK',    bias: { fuel: 4, scrap: 2 } },
    { key: 'register',name: 'REGISTER',     bias: { scrap: 2, food: 1 } },
    { key: 'corpse',  name: 'A BODY',       bias: { meds: 3, food: 1 }, creepy: true }
  ];

  // ---------------------------------------------------------- horror text --
  BK.WHISPERS = [
    'you left the hatch open',
    'they are still in the parking lot',
    'count them again',
    'it is wearing her coat',
    'nine minutes was not enough',
    'do not look at the ceiling',
    'the third one never came back',
    'we can hear the generator',
    'stop taping over us',
    'somebody is on the ladder'
  ];

  BK.HALLUCINATIONS = [
    'The corridor lamp goes out. When it comes back, everything is where it was. Almost.',
    'You hear a boombox playing two rooms over. Nobody is in there.',
    'For a second there is one more shadow on the wall than there are people.',
    'Something drags across the ceiling, slow, from the vent to the ladder.',
    'The radio picks up your own voice, six seconds behind you.',
    'A child laughs somewhere under the floor and then apologizes.',
    'You catch someone standing in the dark, facing the wall. They turn around and it is nobody you know.',
    'Every clock in the bunker reads 3:33. The clocks do not have batteries.'
  ];

  BK.NOTES = [
    { title: 'TAPED TO A FRIDGE', body: 'Gone to my sisters in Fallon. If you are reading this the roads are open. If the roads are not open I am sorry about the smell.' },
    { title: 'SPIRAL NOTEBOOK', body: 'Day 4. The Hendersons went to the shelter under the school. Day 6. The shelter under the school is not answering. Day 8. Something knocked politely.' },
    { title: 'CIVIL DEFENSE PAMPHLET', body: 'IN THE EVENT OF ATTACK: remain indoors 14 days. Do not consume open water. Do not approach persons exhibiting confusion or excessive calm.' },
    { title: 'ON THE BACK OF A RECEIPT', body: 'it comes at the same time every night and it does not knock anymore it just stands there where the streetlight was' },
    { title: 'A KID\'S DRAWING', body: 'Crayon. A house, a sun with a face, and a tall figure in the corner drawn in black and then scribbled out very hard.' },
    { title: 'HAM LOG BOOK', body: '0200 — contact, station WQ7. 0215 — WQ7 repeating our callsign back to us. 0230 — WQ7 asking to be let in. We never gave them a location.' },
    { title: 'MOTEL BIBLE', body: 'Somebody has crossed out every instance of the word LIGHT and written a different word above it. The word is not in English.' },
    { title: 'GROCERY LIST', body: 'milk, batteries D, tuna, dog food, the tall one in the yard again, bread' }
  ];

  BK.NUMBERS_STATION = [
    'seven … seven … four … nine … repeat … seven … seven … four … nine',
    'this is a message for GROUND SPARROW … the field is clear … the field is not clear',
    'all stations, all stations, this is the last one, we are going to stop transmitting now',
    'do not answer if it uses your name'
  ];

  // -------------------------------------------------------------- events ---
  // VHS-card interruptions. api is supplied by sim.js.
  BK.EVENTS = [
    {
      id: 'fallout_storm', weight: 14, minDay: 1,
      title: 'FALLOUT STORM',
      body: 'The barometer drops through the floor. Grey snow starts coming down sideways and the vent fans are pulling it straight in.',
      choices: [
        { label: 'SEAL THE VENTS', desc: 'Burn 4 fuel on the scrubbers.',
          fx: (s, api) => api.spend({ fuel: 4 }) ? api.log('Vents sealed. Stuffy and loud, but clean.', 'good')
            : (api.radsAll(9), api.log('No fuel for the scrubbers. Everyone takes a dose.', 'bad')) },
        { label: 'RIDE IT OUT', desc: 'Free. Everyone eats rads.',
          fx: (s, api) => { api.radsAll(12); api.sanityAll(-6); api.log('You tape the vents with garbage bags. Geigers click all night.', 'bad'); } }
      ]
    },
    {
      id: 'raiders', weight: 11, minDay: 4,
      title: 'BANGING ON THE BLAST DOOR',
      body: 'Four of them, engine idling, one holding a length of rebar. They want food and they are willing to negotiate about how they get it.',
      choices: [
        { label: 'PAY THEM OFF', desc: 'Hand over 8 food.',
          fx: (s, api) => api.spend({ food: 8 }) ? api.log('They take the crate and go. One of them waves.', 'warn')
            : (api.hurtRandom(24), api.log('You have nothing to give. They take it out on whoever answered.', 'bad')) },
        { label: 'HOLD THE DOOR', desc: 'Depends on who is home.',
          fx: (s, api) => {
            const def = api.crewAlive().reduce((a, c) => a + 8 + c.skills.repair * 2, 0);
            if (Math.random() * 100 < Math.min(85, def + 25)) { api.log('You brace the door with the workbench and wait them out.', 'good'); api.gain({ scrap: 5 }); }
            else { api.hurtRandom(30); api.take({ food: 6, scrap: 4 }); api.log('The hinge gives. It is over fast and it costs you.', 'bad'); }
          } }
      ]
    },
    {
      id: 'wanderer', weight: 13, minDay: 2,
      title: 'SOMEBODY IS AT THE HATCH',
      body: 'One person, no weapon, a duffel bag and a bad cough. They say they walked from the county line.',
      cond: (s) => s.crew.filter(c => c.alive).length < 7,
      choices: [
        { label: 'LET THEM IN', desc: 'Another pair of hands. Another mouth.',
          fx: (s, api) => { const c = api.addSurvivor(); api.log(`${c.name} climbs down the ladder and apologizes for the smell.`, 'good'); } },
        { label: 'PASS SUPPLIES OUT', desc: 'Give 3 food, keep the door shut.',
          fx: (s, api) => { api.spend({ food: 3 }); api.sanityAll(-4); api.log('You push cans through the slot. Nobody talks at dinner.', 'warn'); } },
        { label: 'STAY SILENT', desc: 'Pretend the bunker is empty.',
          fx: (s, api) => { api.sanityAll(-10); api.log('The knocking stops after twenty minutes. Everyone heard it stop.', 'bad'); } }
      ]
    },
    {
      id: 'ebs', weight: 10, minDay: 1,
      title: 'EMERGENCY BROADCAST',
      body: 'The tone cuts in at 3 a.m. A tired voice reads coordinates for a relief column, then reads them again, then stops mid-word.',
      choices: [
        { label: 'GATHER EVERYONE', desc: 'Listen together.',
          fx: (s, api) => { api.sanityAll(12); api.log('You sit in the dark until the carrier drops. It helps, somehow.', 'good'); } },
        { label: 'TAPE IT AND SLEEP', desc: 'Deal with it in the morning.',
          fx: (s, api) => { api.gain({ scrap: 2 }); api.log('The tape catches the coordinates. Might be worth something.', 'ok'); } }
      ]
    },
    {
      id: 'rats', weight: 11, minDay: 3,
      title: 'SOMETHING IN THE STORES',
      body: 'The food crates have been opened from the inside. There are droppings the size of your thumb.',
      choices: [
        { label: 'HUNT THEM', desc: 'Somebody may get bitten.',
          fx: (s, api) => { if (Math.random() < 0.4) { api.hurtRandom(12); api.log('Bites and swearing, but the nest is gone.', 'warn'); } else { api.gain({ food: 3 }); api.log('Cleared the nest. Nobody asks what the stew is.', 'good'); } } },
        { label: 'SEAL THE CRATES', desc: 'Spend 6 scrap on tin sheeting.',
          fx: (s, api) => api.spend({ scrap: 6 }) ? api.log('Everything goes in tin now. The scratching moves on.', 'good')
            : (api.take({ food: 7 }), api.log('No scrap to spare. They eat well tonight and you do not.', 'bad')) }
      ]
    },
    {
      id: 'genfire', weight: 9, minDay: 5,
      title: 'THE GENNY IS ON FIRE',
      body: 'A fuel line lets go and the housing catches. Black smoke fills the corridor.',
      cond: (s) => s.objects.some(o => o.type === 'generator' && !o.broken),
      choices: [
        { label: 'FIGHT THE FIRE', desc: 'Water and blankets. Someone may get burned.',
          fx: (s, api) => { api.spend({ water: 5 }); if (Math.random() < 0.45) api.hurtRandom(20); api.log('You beat it out with wet blankets. The generator lives.', 'warn'); } },
        { label: 'CUT FUEL AND RUN', desc: 'Save the crew, lose the genny.',
          fx: (s, api) => { api.take({ fuel: 10 }); api.breakObject('generator'); api.log('You dump the tank and shut the corridor. The genny is scrap until somebody fixes it.', 'bad'); } }
      ]
    },
    {
      id: 'tapes', weight: 9, minDay: 2,
      title: 'A BOX OF TAPES',
      body: 'Somebody finds a milk crate of mixtapes behind the water heater. Every one is hand-labeled in ballpoint.',
      choices: [
        { label: 'ROLLER DISCO NIGHT', desc: 'Spend 2 fuel. Lift everybody.',
          fx: (s, api) => { api.spend({ fuel: 2 }); api.funAll(30); api.sanityAll(12); api.log('The corridor becomes a rink. Somebody falls. Everybody laughs.', 'good'); } },
        { label: 'RATION THEM', desc: 'One tape a week. Keep it special.',
          fx: (s, api) => { s.flags.tapeStash = (s.flags.tapeStash || 0) + 6; api.log('The tapes go in the safe. Six weeks of Fridays, banked.', 'ok'); } }
      ]
    },
    {
      id: 'contam', weight: 9, minDay: 6,
      title: 'THE WATER TASTES WRONG',
      body: 'Metallic, then sweet. The reclaimer intake has been packed with grey silt for who knows how long.',
      cond: (s) => s.objects.some(o => o.type === 'filter'),
      choices: [
        { label: 'DUMP AND REBUILD', desc: 'Lose the tank, save the crew.',
          fx: (s, api) => { api.take({ water: 12 }); api.spend({ scrap: 4 }); api.log('You pour it out and repack the filter with fresh charcoal.', 'warn'); } },
        { label: 'KEEP DRINKING', desc: 'You need water more than health.',
          fx: (s, api) => { api.radsAll(10); api.sanityAll(-5); api.log('Everyone drinks. Everyone knows. Nobody says it.', 'bad'); } }
      ]
    },
    {
      id: 'visitor', weight: 10, minDay: 6,
      title: 'IT IS STANDING IN THE LOT',
      body: 'Tall, still, facing the hatch. It has been there four hours. It has not moved and it has not blinked and the dosimeter by the door is climbing.',
      choices: [
        { label: 'KILL THE LIGHTS', desc: 'Go dark and wait.',
          fx: (s, api) => { s.flags.dread = Math.max(0, (s.flags.dread || 0) - 12); api.sanityAll(-8); api.log('You sit in the black for an hour. When you look again the lot is empty.', 'warn'); } },
        { label: 'HAIL IT ON THE PA', desc: 'Somebody has to say something.',
          fx: (s, api) => { api.sanityAll(-16); s.flags.dread = (s.flags.dread || 0) + 14; api.log('It answers. It uses the right names. It gets one of them slightly wrong.', 'bad'); } },
        { label: 'FLOODLIGHTS ON IT', desc: 'Burn 3 fuel. See it properly.',
          fx: (s, api) => { if (api.spend({ fuel: 3 })) { api.sanityAll(-22); s.flags.dread = (s.flags.dread || 0) + 6; api.log('For one second the lot is bright as noon. Everybody who looked has stopped talking.', 'bad'); } else api.log('The floods are dry. You watch it in the dark instead.', 'warn'); } }
      ]
    },
    {
      id: 'dog', weight: 7, minDay: 8,
      title: 'A DOG AT THE VENT',
      body: 'Skinny, filthy, one ear gone, and it will not stop wagging.',
      cond: (s) => !s.flags.dog,
      choices: [
        { label: 'KEEP HER', desc: 'Costs food. Everyone perks up.',
          fx: (s, api) => { s.flags.dog = true; api.sanityAll(18); api.funAll(20); api.log('Her name is Cinder now. She hates the generator and loves the vent.', 'good'); } },
        { label: 'FEED AND SHOO', desc: 'You cannot afford another mouth.',
          fx: (s, api) => { api.spend({ food: 1 }); api.sanityAll(-6); api.log('She waits at the vent for two days.', 'bad'); } }
      ]
    },
    {
      id: 'convoy', weight: 8, minDay: 10,
      title: 'A CONVOY ON THE INTERSTATE',
      body: 'Three trucks with a working radio. They will trade, but they only want scrap and fuel.',
      choices: [
        { label: 'SCRAP FOR FOOD', desc: '12 scrap → 14 food.',
          fx: (s, api) => api.spend({ scrap: 12 }) ? (api.gain({ food: 14 }), api.log('Good trade. Their driver throws in a bag of coffee.', 'good')) : api.log('You have nothing they want.', 'warn') },
        { label: 'FUEL FOR MEDS', desc: '8 fuel → 7 meds.',
          fx: (s, api) => api.spend({ fuel: 8 }) ? (api.gain({ meds: 7 }), api.log('Sealed field kits, still in date.', 'good')) : api.log('The tank is dry. They roll on.', 'warn') },
        { label: 'ASK FOR NEWS', desc: 'Free.',
          fx: (s, api) => { api.sanityAll(10); api.log('There is a relief camp past the reservoir. They have seen it. That is enough for tonight.', 'good'); } }
      ]
    }
  ];

  BK.INTRO = [
    'OCTOBER 1986',
    'The sirens ran for nine minutes and then the power went out for good.',
    'Three days later you unbolted the hatch under the Rad Springs strip mall and found the sky the color of a dead television.',
    'You have a generator, a boombox, and people counting on you.',
    'Something out there has started counting too.'
  ];

  BK.TIPS = [
    'The crew looks after itself on AUTO. Take the wheel when it matters.',
    'Brownouts kill every powered object. Watch the POWER bar.',
    'Darkness eats sanity. Build lamps before you build luxuries.',
    'Rads cap a survivor\'s max health. Only the med station brings them down.',
    'Loot the surface by day. What walks at night does not loot.',
    'If it is standing still and facing you, it has already seen you.'
  ];
})(window.BK = window.BK || {});
