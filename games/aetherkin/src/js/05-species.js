/* ============================================================================
   SPECIES.  fam = which Growth Lattice it reads. Every kin in a family shares
   one lattice; the branch it evolved down decides which half of it opens.
   ========================================================================== */
const SPECIES = {};
const S = (id, o) => { o.id = id; SPECIES[id] = o; return o; };
const b = (hp, frc, grd, arc, wrd, swf) => ({ hp, frc, grd, arc, wrd, swf });

/* --- I. Emberkit ------------------------------------------------------- */
S('emberkit', { n: 'Emberkit', t: ['ember'], fam: 'emberkit', stage: 1, base: b(50, 58, 42, 56, 44, 60),
  innate: 'ember_fang', catch: 42, xp: 64, art: { form: 'quad', a: '#F2683C', b: '#FFC46B', crest: 'flame', eyes: 2, seed: 11 },
  dex: 'Sleeps curled around its own heat. A content Emberkit smells faintly of woodsmoke; an angry one does not smell of anything at all, which is worse.' });
S('pyrelisk', { n: 'Pyrelisk', t: ['ember', 'iron'], fam: 'emberkit', stage: 2, branch: 'A', from: 'emberkit', base: b(78, 88, 82, 70, 72, 58),
  innate: 'ember_fang', catch: 14, xp: 168, art: { form: 'bulk', a: '#E0532C', b: '#B98A5C', crest: 'horn', eyes: 2, seed: 12 },
  dex: 'Slag cooled over living muscle. It walks into fires to shed the outer layer and comes out a slightly different shape each time.' });
S('cinderfox', { n: 'Cinderfox', t: ['ember', 'umbra'], fam: 'emberkit', stage: 2, branch: 'B', from: 'emberkit', base: b(62, 72, 56, 100, 62, 96),
  innate: 'ember_fang', catch: 14, xp: 168, art: { form: 'quad', a: '#FF7A4A', b: '#9B77D6', crest: 'plume', eyes: 2, seed: 13, w: 0.95 },
  dex: 'Burns cold. Where it has been sitting, the ground is scorched in a ring but perfectly cool to the touch.' });

/* --- II. Brookling ----------------------------------------------------- */
S('brookling', { n: 'Brookling', t: ['tide'], fam: 'brookling', stage: 1, base: b(58, 48, 54, 58, 56, 46),
  innate: 'brine_jet', catch: 45, xp: 64, art: { form: 'blob', a: '#3FA9DE', b: '#A6E3E0', crest: 'fin', eyes: 2, seed: 21 },
  dex: 'Holds about a bucket of river inside itself and is very particular about which river.' });
S('tidewarden', { n: 'Tidewarden', t: ['tide', 'stone'], fam: 'brookling', stage: 2, branch: 'A', from: 'brookling', base: b(92, 70, 96, 72, 88, 44),
  innate: 'brine_jet', catch: 14, xp: 172, art: { form: 'bulk', a: '#2E86B8', b: '#B98A5C', crest: 'fin', eyes: 2, seed: 22 },
  dex: 'Stands in the ford and does not move. Binders have used the same Tidewarden as a bridge for three generations.' });
S('maelstrix', { n: 'Maelstrix', t: ['tide', 'storm'], fam: 'brookling', stage: 2, branch: 'B', from: 'brookling', base: b(64, 66, 58, 96, 66, 100),
  innate: 'brine_jet', catch: 14, xp: 172, art: { form: 'serpent', a: '#3FA9DE', b: '#F0C33C', crest: 'fin', eyes: 2, seed: 23 },
  dex: 'A length of storm-front that learned to swim. It arrives roughly nine seconds before the weather does.' });

/* --- III. Mosskit ------------------------------------------------------ */
S('mosskit', { n: 'Mosskit', t: ['verdant'], fam: 'mosskit', stage: 1, base: b(60, 52, 56, 52, 54, 44),
  innate: 'seed_lash', catch: 45, xp: 64, art: { form: 'quad', a: '#5FBF6A', b: '#C9E08A', crest: 'plume', eyes: 2, seed: 31 },
  dex: 'Grows whatever it last slept on. A Mosskit raised in a library comes out papery and quiet.' });
S('thornmane', { n: 'Thornmane', t: ['verdant', 'iron'], fam: 'mosskit', stage: 2, branch: 'A', from: 'mosskit', base: b(86, 96, 88, 58, 70, 56),
  innate: 'seed_lash', catch: 14, xp: 172, art: { form: 'bulk', a: '#4A9A56', b: '#9AA7B8', crest: 'horn', eyes: 2, seed: 32 },
  dex: 'Its mane is heartwood grown through with iron it pulled up out of the soil. It sheds a full set of thorns each spring and buries them.' });
S('bloomwisp', { n: 'Bloomwisp', t: ['verdant', 'lumen'], fam: 'mosskit', stage: 2, branch: 'B', from: 'mosskit', base: b(74, 52, 66, 98, 92, 66),
  innate: 'seed_lash', catch: 14, xp: 172, art: { form: 'wisp', a: '#7FD48A', b: '#FFD98A', crest: 'plume', eyes: 3, seed: 33 },
  dex: 'Opens at first light and stays open. Fields where one has settled run about two weeks ahead of the season.' });

/* --- IV. Zaplet -------------------------------------------------------- */
S('zaplet', { n: 'Zaplet', t: ['storm'], fam: 'zaplet', stage: 1, base: b(46, 50, 42, 62, 46, 68),
  innate: 'spark_dart', catch: 45, xp: 64, art: { form: 'wisp', a: '#F0C33C', b: '#FFF0B0', crest: 'antenna', eyes: 2, seed: 41 },
  dex: 'Cannot hold still and cannot be held. Binders keep them in glass because Zaplets find glass boring and stay put out of spite.' });
S('voltairn', { n: 'Voltairn', t: ['storm', 'gale'], fam: 'zaplet', stage: 2, branch: 'A', from: 'zaplet', base: b(62, 70, 56, 92, 62, 110),
  innate: 'spark_dart', catch: 14, xp: 172, art: { form: 'winged', a: '#F0C33C', b: '#A6E3C4', crest: 'antenna', eyes: 2, seed: 42 },
  dex: 'Outruns the sound of itself. What you hear when a Voltairn passes is where it was.' });
S('arcforge', { n: 'Arcforge', t: ['storm', 'iron'], fam: 'zaplet', stage: 2, branch: 'B', from: 'zaplet', base: b(80, 92, 86, 80, 68, 50),
  innate: 'spark_dart', catch: 14, xp: 172, art: { form: 'bulk', a: '#E0A82C', b: '#9AA7B8', crest: 'crystal', eyes: 1, seed: 43 },
  dex: 'Stores its charge in a lattice of iron it grows internally, then walks around as a loaded weapon and knows it.' });

/* --- V. Glimmoth ------------------------------------------------------- */
S('glimmoth', { n: 'Glimmoth', t: ['lumen'], fam: 'glimmoth', stage: 1, base: b(48, 44, 46, 64, 58, 62),
  innate: 'radiant_beam', catch: 45, xp: 64, art: { form: 'insect', a: '#FFD98A', b: '#FFF4D6', crest: 'antenna', eyes: 3, seed: 51 },
  dex: 'Its dust holds light for about four hours after dark. Binders' + "'" + ' children collect it and are told not to.' });
S('solmoth', { n: 'Solmoth', t: ['lumen', 'gale'], fam: 'glimmoth', stage: 2, branch: 'A', from: 'glimmoth', base: b(66, 56, 60, 104, 80, 86),
  innate: 'radiant_beam', catch: 14, xp: 172, art: { form: 'insect', a: '#FFD05A', b: '#FFF9E8', crest: 'plume', eyes: 3, seed: 52, w: 1.15 },
  dex: 'Flies at the sun in the way a moth flies at a lamp, and has been doing so for some time without any sign of discouragement.' });
S('duskmoth', { n: 'Duskmoth', t: ['umbra', 'gale'], fam: 'glimmoth', stage: 2, branch: 'B', from: 'glimmoth', base: b(64, 88, 56, 78, 64, 98),
  innate: 'radiant_beam', catch: 14, xp: 172, art: { form: 'insect', a: '#9B77D6', b: '#3A2E58', crest: 'antenna', eyes: 3, seed: 53, w: 1.1 },
  dex: 'Ate its own light. What is left is very fast and does not reflect a lamp held directly at it.' });

/* --- VI. Gravelump ----------------------------------------------------- */
S('gravelump', { n: 'Gravelump', t: ['stone'], fam: 'gravelump', stage: 1, base: b(66, 56, 66, 38, 48, 32),
  innate: 'pebble_slam', catch: 48, xp: 64, art: { form: 'bulk', a: '#B98A5C', b: '#8A6A48', crest: 'crystal', eyes: 2, seed: 61, w: 1.1 },
  dex: 'Indistinguishable from a rock until it is standing on your foot.' });
S('bastionox', { n: 'Bastionox', t: ['stone', 'iron'], fam: 'gravelump', stage: 2, branch: 'A', from: 'gravelump', base: b(104, 82, 112, 48, 80, 34),
  innate: 'pebble_slam', catch: 14, xp: 172, art: { form: 'bulk', a: '#A87C50', b: '#9AA7B8', crest: 'horn', eyes: 2, seed: 62, w: 1.25 },
  dex: 'Border forts are built against Bastionox, not with them. They tend to lean on the wall and improve it.' });
S('quakemaw', { n: 'Quakemaw', t: ['stone', 'venom'], fam: 'gravelump', stage: 2, branch: 'B', from: 'gravelump', base: b(92, 104, 84, 60, 60, 56),
  innate: 'pebble_slam', catch: 14, xp: 172, art: { form: 'quad', a: '#9E7448', b: '#C062A8', crest: 'horn', eyes: 2, seed: 63, w: 1.15 },
  dex: 'Chews sulphur rock for the taste. Its bite is not venomous so much as geologically unpleasant.' });

/* --- VII. Frostnip ----------------------------------------------------- */
S('frostnip', { n: 'Frostnip', t: ['frost'], fam: 'frostnip', stage: 1, base: b(52, 54, 48, 56, 52, 56),
  innate: 'frost_nip', catch: 45, xp: 64, art: { form: 'quad', a: '#8FD9E0', b: '#E8FBFF', crest: 'crystal', eyes: 2, seed: 71 },
  dex: 'Small, affectionate, and thirty degrees colder than it looks. Frostbite from a friendly one is a known hazard of the trade.' });
S('rimeclaw', { n: 'Rimeclaw', t: ['frost', 'stone'], fam: 'frostnip', stage: 2, branch: 'A', from: 'frostnip', base: b(88, 98, 88, 56, 64, 62),
  innate: 'frost_nip', catch: 14, xp: 172, art: { form: 'bulk', a: '#6FC6D2', b: '#B98A5C', crest: 'crystal', eyes: 2, seed: 72 },
  dex: 'Grows its claws fresh every morning out of whatever water is nearby, which makes river-fed ones far worse to meet than well-fed ones.' });
S('glacianth', { n: 'Glacianth', t: ['frost', 'mind'], fam: 'frostnip', stage: 2, branch: 'B', from: 'frostnip', base: b(70, 50, 64, 102, 88, 74),
  innate: 'frost_nip', catch: 14, xp: 172, art: { form: 'wisp', a: '#8FD9E0', b: '#E86A8A', crest: 'crystal', eyes: 3, seed: 73 },
  dex: 'Thinks slowly and enormously, the way a glacier does. Standing near one makes decisions feel less urgent.' });

/* --- VIII. Nullwisp ---------------------------------------------------- */
S('nullwisp', { n: 'Nullwisp', t: ['mind'], fam: 'nullwisp', stage: 1, base: b(48, 40, 46, 68, 62, 58),
  innate: 'mind_spike', catch: 42, xp: 64, art: { form: 'wisp', a: '#E86A8A', b: '#F6C6D2', crest: 'none', eyes: 1, seed: 81 },
  dex: 'Answers questions a moment before they are asked, which makes conversation with one strangely restful.' });
S('oracline', { n: 'Oracline', t: ['mind', 'lumen'], fam: 'nullwisp', stage: 2, branch: 'A', from: 'nullwisp', base: b(70, 48, 66, 108, 94, 66),
  innate: 'mind_spike', catch: 14, xp: 172, art: { form: 'wisp', a: '#E86A8A', b: '#FFD98A', crest: 'crystal', eyes: 3, seed: 82 },
  dex: 'Sees the shape of the next hour clearly and the next year not at all, and has stopped finding this frustrating.' });
S('voidmind', { n: 'Voidmind', t: ['mind', 'umbra'], fam: 'nullwisp', stage: 2, branch: 'B', from: 'nullwisp', base: b(66, 64, 58, 104, 70, 88),
  innate: 'mind_spike', catch: 14, xp: 172, art: { form: 'wisp', a: '#C4527A', b: '#9B77D6', crest: 'horn', eyes: 1, seed: 83 },
  dex: 'Removed something from itself on purpose. It will not say what, and the omission is load-bearing.' });

/* --- IX-XII. kin that never change shape ------------------------------- */
S('gustling', { n: 'Gustling', t: ['gale'], fam: 'gustling', stage: 1, solo: true, base: b(60, 70, 52, 62, 54, 96),
  innate: 'gust_cut', catch: 40, xp: 118, art: { form: 'winged', a: '#A6E3C4', b: '#DFF6EA', crest: 'plume', eyes: 2, seed: 91 },
  dex: 'Never lands. Sleeps in the updraft off a warm rock and considers this an entirely normal way to live.' });
S('venomite', { n: 'Venomite', t: ['venom'], fam: 'venomite', stage: 1, solo: true, base: b(72, 66, 64, 78, 62, 58),
  innate: 'toxin_fang', catch: 40, xp: 118, art: { form: 'insect', a: '#C062A8', b: '#6E2E5C', crest: 'antenna', eyes: 3, seed: 92 },
  dex: 'Patient to a fault. It will follow something for a week rather than bite it twice.' });
S('scrapjaw', { n: 'Scrapjaw', t: ['iron'], fam: 'scrapjaw', stage: 1, solo: true, base: b(82, 84, 92, 44, 58, 40),
  innate: 'scrap_bite', catch: 38, xp: 118, art: { form: 'quad', a: '#9AA7B8', b: '#5E6B7C', crest: 'horn', eyes: 1, seed: 93, w: 1.1 },
  dex: 'Wears its findings. An old Scrapjaw is a walking record of everything that has been dropped in its valley.' });
S('shadeling', { n: 'Shadeling', t: ['umbra'], fam: 'shadeling', stage: 1, solo: true, base: b(62, 80, 54, 74, 56, 86),
  innate: 'shade_claw', catch: 38, xp: 118, art: { form: 'biped', a: '#9B77D6', b: '#2A2140', crest: 'none', eyes: 2, seed: 94 },
  dex: 'Casts no shadow, being one. Extremely polite, in the manner of something that does not want to be looked at closely.' });

const SPECIES_IDS = Object.keys(SPECIES);
const bst = sp => STATS.reduce((n, k) => n + sp.base[k], 0);
