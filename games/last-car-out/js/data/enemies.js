/* Denizens. Base numbers are for a tier-1 car; the engine scales them.
   moves: t = attack | block | buff | debuff | heal | summon | charge | steal | drain | number | mirror
   sprite: body, color, accent, eyes, mouth, extra (drawn by ui/components.js) */
(function () {
  'use strict';
  const D = LCO.data;
  const E = {};
  function en(id, fam, name, hp, moves, sprite, o) { E[id] = Object.assign({ id, fam, name, hp, moves, sprite }, o || {}); }
  const atk = (a, b, w, o) => Object.assign({ t: 'attack', dmg: [a, b], w: w || 1 }, o || {});
  const blk = (v, w) => ({ t: 'block', v, w: w || 1 });
  const buff = (id, n, w, target) => ({ t: 'buff', status: [id, n], target: target || 'self', w: w || 1 });
  const deb = (id, n, w) => ({ t: 'debuff', status: [id, n], w: w || 1 });
  const chg = (a, b, name, w, o) => ({ t: 'charge', w: w || 1, next: Object.assign({ t: 'attack', dmg: [a, b], name }, o || {}) });
  const S = (body, color, accent, eyes, mouth, extra) => ({ body, color, accent, eyes, mouth, extra });

  /* corgi */
  en('corgi_guard', 'corgi', 'Corgi Guard', [16, 20], [atk(3, 5, 3), blk(6, 2)], S('round', '#d9914a', '#f3e2c4', 'two', 'o', 'ears'), { tags: ['peaceful'] });
  en('corgi_knight', 'corgi', 'Corgi Knight', [20, 24], [atk(5, 7, 3), atk(3, 4, 2, { hits: 2 })], S('round', '#c97f3c', '#b9c2c9', 'two', 'teeth', 'visor'));
  en('corgi_herald', 'corgi', 'Corgi Herald', [14, 18], [buff('strength', 1, 2, 'allies'), atk(3, 4, 2)], S('round', '#e0a263', '#7a3f8f', 'two', 'smile', 'hat'), { tags: ['peaceful'] });
  en('hound_captain', 'corgi', 'Royal Hound Captain', [55, 65], [atk(7, 10, 3), blk(10, 1), buff('strength', 2, 1), chg(16, 20, 'Royal Decree', 1)], S('round', '#b86a2b', '#f0b43c', 'two', 'teeth', 'crown'), { elite: true });
  /* ball pit */
  en('ball_gremlin', 'ballpit', 'Ball-Pit Gremlin', [12, 16], [atk(2, 3, 3, { hits: 3 }), blk(4, 1)], S('blob', '#e25c6a', '#5bb5e8', 'many', 'teeth', 'spikes'));
  en('pit_lurker', 'ballpit', 'Pit Lurker', [22, 28], [chg(14, 18, 'Surfacing Bite', 2), atk(4, 6, 2)], S('tall', '#4f7fd1', '#f2d14a', 'slits', 'teeth', 'none'));
  en('ball_king', 'ballpit', 'The Ball King', [60, 70], [{ t: 'summon', id: 'ball_gremlin', w: 1 }, atk(5, 7, 2, { hits: 2 }), chg(18, 22, 'Cannonball', 1)], S('blob', '#f2d14a', '#e25c6a', 'two', 'smile', 'crown'), { elite: true });
  /* unfinished */
  en('wireframe', 'unfinished', 'Wireframe Wanderer', [16, 20], [atk(4, 6, 3), { t: 'drain', v: 2, w: 2 }], S('square', '#cfd6d2', '#7ff0d0', 'one', 'line', 'wire'));
  en('placeholder', 'unfinished', '[DENIZEN NAME]', [18, 22], [atk(3, 8, 3), deb('exposed', 1, 1)], S('square', '#9aa19c', '#e0583c', 'x', 'line', 'number'));
  en('unrendered', 'unfinished', 'Unrendered Beast', [26, 32], [atk(6, 9, 3), blk(8, 1)], S('tri', '#6b7370', '#cfd6d2', 'visor', 'none', 'wire'));
  en('the_draft', 'unfinished', 'The Draft', [70, 80], [atk(8, 11, 2), deb('weak', 2, 1), chg(20, 24, 'Final Render', 1)], S('tall', '#aab2ae', '#7ff0d0', 'many', 'teeth', 'wire'), { elite: true });
  /* desert */
  en('cactus_bandit', 'desert', 'Cactus Bandit', [18, 22], [atk(4, 6, 3, { status: ['bleed', 2] }), blk(5, 1)], S('tall', '#5f9e4f', '#d9a441', 'two', 'line', 'hat'));
  en('tumbleweed', 'desert', 'Tumbleweed', [8, 10], [atk(2, 4, 3)], S('blob', '#b58a52', '#6d5130', 'none', 'none', 'spikes'), { tags: ['peaceful'] });
  en('rattler', 'desert', 'Sheriff Rattler', [20, 24], [deb('weak', 2, 1), atk(5, 7, 3)], S('tall', '#c9a34a', '#e0583c', 'slits', 'line', 'hat'));
  en('dust_devil', 'desert', 'The Dust Devil', [60, 70], [atk(3, 4, 2, { hits: 4 }), deb('exposed', 2, 1), chg(18, 22, 'Sandblast', 1)], S('tri', '#d9b36a', '#8a6a3a', 'slits', 'o', 'horns'), { elite: true });
  /* crystal */
  en('crystal_golem', 'crystal', 'Crystal Golem', [30, 36], [blk(10, 2), atk(7, 10, 2)], S('hex', '#7fd3e6', '#e8f7fb', 'visor', 'none', 'spikes'), { armor: 0.25 });
  en('shard_bat', 'crystal', 'Shard Bat', [12, 14], [atk(3, 5, 3, { hits: 2, status: ['bleed', 1] })], S('tri', '#b98ae8', '#e8f7fb', 'two', 'teeth', 'ears'));
  en('resonator', 'crystal', 'Resonator', [18, 22], [buff('strength', 2, 2, 'allies'), atk(4, 6, 2)], S('orb', '#9ee6d0', '#b98ae8', 'one', 'o', 'antenna'));
  en('prism_warden', 'crystal', 'Prism Warden', [70, 80], [atk(8, 12, 2), blk(14, 1), buff('strength', 3, 1)], S('hex', '#b98ae8', '#7fd3e6', 'visor', 'line', 'crown'), { elite: true, armor: 0.2 });
  /* mirror */
  en('flec', 'mirror', 'Flec', [18, 22], [{ t: 'mirror', w: 1 }, atk(5, 7, 3)], S('tall', '#c3ccd6', '#7a8fa3', 'two', 'smile', 'none'), { mirrored: true });
  en('glass_stalker', 'mirror', 'Glass Stalker', [20, 24], [atk(6, 9, 3), deb('exposed', 1, 1)], S('tri', '#dfe7ee', '#5eb0e8', 'slits', 'teeth', 'spikes'));
  en('your_reflection', 'mirror', 'Your Reflection', [65, 75], [atk(7, 10, 3), { t: 'mirror', w: 1 }, deb('weak', 1, 1)], S('tall', '#9aa7b5', '#efe4c8', 'two', 'line', 'number'), { elite: true, mirrored: true });
  /* chrome */
  en('chrome_hound', 'chrome', 'Chrome Hound', [20, 24], [atk(5, 7, 3, { status: ['chill', 1] }), atk(3, 4, 1, { hits: 2 })], S('round', '#c8d3da', '#5eb0e8', 'two', 'teeth', 'ears'));
  en('frost_porter', 'chrome', 'Frost Porter', [28, 32], [blk(8, 1), atk(6, 8, 2, { status: ['chill', 1] })], S('square', '#a9c6d6', '#efe4c8', 'visor', 'line', 'hat'));
  en('chromed_statue', 'chrome', 'Chromed Statue', [80, 90], [chg(22, 26, 'Frozen Verdict', 2, { status: ['chill', 2] }), blk(12, 1)], S('tall', '#dfe8ee', '#9fb3a8', 'none', 'line', 'halo'), { elite: true, armor: 0.3 });
  /* library */
  en('librarian', 'library', 'Shushing Librarian', [20, 24], [deb('weak', 2, 2), atk(4, 6, 2), { t: 'drain', v: 2, w: 1 }], S('tall', '#8a6a8f', '#efe4c8', 'two', 'line', 'hat'), { tags: ['peaceful'] });
  en('paper_moth', 'library', 'Paper Moth', [8, 10], [atk(2, 4, 3, { status: ['bleed', 1] })], S('tri', '#efe4c8', '#9c7a3c', 'many', 'none', 'antenna'));
  en('ink_wraith', 'library', 'Ink Wraith', [22, 26], [atk(5, 7, 2, { status: ['corrupt', 2] }), blk(5, 1)], S('blob', '#2a2340', '#b98ae8', 'slits', 'o', 'none'));
  en('head_archivist', 'library', 'Head Archivist', [70, 80], [{ t: 'summon', id: 'paper_moth', w: 1 }, deb('weak', 2, 1), atk(7, 10, 2)], S('tall', '#6b4a70', '#f0b43c', 'visor', 'line', 'crown'), { elite: true });
  /* swamp */
  en('bog_leech', 'swamp', 'Bog Leech', [16, 20], [atk(3, 5, 3, { leech: true })], S('blob', '#556b3a', '#a8c46a', 'none', 'teeth', 'none'));
  en('toll_frog', 'swamp', 'Toll Frog', [22, 26], [{ t: 'steal', w: 1 }, atk(4, 6, 3)], S('round', '#6fa24a', '#f2d14a', 'two', 'smile', 'tie'), { tags: ['peaceful'] });
  en('toad_bishop', 'swamp', 'The Toad Bishop', [75, 85], [{ t: 'heal', v: 12, target: 'ally', w: 1 }, atk(7, 9, 2), { t: 'summon', id: 'bog_leech', w: 1 }], S('round', '#4f7d35', '#efe4c8', 'two', 'line', 'crown'), { elite: true });
  /* beach */
  en('crab_sentry', 'beach', 'Crab Sentry', [22, 26], [blk(7, 2), atk(5, 7, 2)], S('shell', '#e0714a', '#f3e2c4', 'two', 'line', 'spikes'), { armor: 0.2 });
  en('gull_thief', 'beach', 'Gull Thief', [12, 14], [{ t: 'steal', w: 2 }, atk(3, 5, 2)], S('round', '#e8eef0', '#f2b33c', 'two', 'beak', 'none'));
  en('tidecaller', 'beach', 'Tidecaller', [18, 22], [deb('exposed', 2, 1), atk(4, 7, 3), { t: 'heal', v: 8, target: 'ally', w: 1 }], S('tall', '#3f8fb0', '#e8eef0', 'one', 'o', 'leaf'));
  en('big_wave', 'beach', 'The Big Wave', [80, 90], [atk(5, 7, 2, { hits: 2 }), chg(20, 24, 'Undertow', 1)], S('blob', '#2f7fae', '#e8eef0', 'many', 'o', 'none'), { elite: true });
  /* accounting */
  en('auditor', 'ledger', 'Auditor', [20, 24], [{ t: 'number', w: 1 }, atk(4, 6, 3)], S('square', '#7d8a78', '#7ff0d0', 'visor', 'line', 'tie'));
  en('clerk', 'ledger', 'Clerk', [12, 14], [atk(3, 4, 3), blk(4, 1)], S('square', '#9aa392', '#efe4c8', 'two', 'line', 'tie'), { tags: ['peaceful'] });
  en('tax_collector', 'ledger', 'Tax Collector', [24, 28], [{ t: 'steal', w: 1 }, atk(5, 7, 3)], S('tall', '#5d6b58', '#d9a441', 'slits', 'smile', 'hat'));
  en('comptroller', 'ledger', 'The Comptroller', [80, 90], [{ t: 'number', w: 1 }, deb('weak', 2, 1), atk(8, 10, 2), { t: 'summon', id: 'clerk', w: 1 }], S('square', '#4e5a4a', '#7ff0d0', 'visor', 'teeth', 'number'), { elite: true });
  /* ghom */
  en('ghom', 'ghom', 'Ghom', [22, 26], [atk(4, 6, 3, { status: ['corrupt', 2] }), blk(6, 1)], S('blob', '#1d1426', '#d9508a', 'many', 'none', 'tape'));
  en('tape_wraith', 'ghom', 'Tape Wraith', [18, 22], [{ t: 'drain', v: 3, w: 2 }, atk(5, 7, 2)], S('tall', '#2e2238', '#efe4c8', 'slits', 'o', 'tape'));
  en('ghom_mother', 'ghom', 'The Ghom Mother', [90, 100], [atk(6, 8, 2, { status: ['corrupt', 3] }), { t: 'summon', id: 'ghom', w: 1 }, { t: 'heal', v: 15, target: 'self', w: 1 }], S('blob', '#140d1c', '#d9508a', 'many', 'teeth', 'crown'), { elite: true });
  /* apex */
  en('apex_raider', 'apex', 'Apex Raider', [24, 28], [{ t: 'steal', w: 1 }, atk(6, 8, 3)], S('round', '#e8d2b0', '#e0583c', 'two', 'smile', 'number'));
  en('apex_brute', 'apex', 'Apex Brute', [34, 40], [chg(18, 22, 'Haymaker', 1), atk(7, 9, 2), buff('strength', 2, 1)], S('square', '#d7b894', '#e0583c', 'slits', 'teeth', 'number'));
  en('apex_slinger', 'apex', 'Apex Slinger', [18, 22], [atk(3, 5, 2, { hits: 3 }), deb('exposed', 1, 1)], S('round', '#f0dcc0', '#e0583c', 'visor', 'smile', 'number'));
  en('apex_ringleader', 'apex', 'Apex Ringleader', [90, 100], [buff('strength', 2, 1, 'allies'), atk(8, 11, 2), { t: 'summon', id: 'apex_raider', w: 1 }, chg(22, 26, 'Big Finish', 1)], S('round', '#e8c79a', '#f0b43c', 'two', 'teeth', 'crown'), { elite: true });
  /* void */
  en('unmade', 'void', 'The Unmade', [26, 30], [atk(6, 10, 3), deb('exposed', 2, 1)], S('blob', '#0b0f10', '#7ff0d0', 'x', 'none', 'wire'));
  en('null_body', 'void', 'Null Body', [30, 36], [blk(10, 1), atk(7, 9, 2), { t: 'drain', v: 3, w: 1 }], S('orb', '#151b1c', '#cfd6d2', 'none', 'line', 'halo'), { armor: 0.15 });
  en('static_thing', 'void', 'Static Thing', [16, 20], [atk(4, 6, 3, { hits: 2, status: ['chill', 1] })], S('hex', '#2b3336', '#cfd6d2', 'many', 'line', 'antenna'));
  en('hole_car', 'void', 'Hole Where a Car Was', [100, 110], [atk(8, 12, 2), deb('weak', 2, 1), chg(24, 28, 'Unmaking', 1)], S('orb', '#050707', '#7ff0d0', 'one', 'o', 'halo'), { elite: true });
  /* wanderers & hunters */
  en('scavenger', 'wander', 'Scavenger', [14, 18], [{ t: 'steal', w: 3 }, atk(3, 5, 2)], S('round', '#8f8a6a', '#d9a441', 'two', 'smile', 'hat'));
  en('steward', 'hunter', 'Steward', [60, 70], [atk(9, 12, 2), chg(20, 26, 'Deletion Beam', 1), blk(12, 1)], S('orb', '#20262a', '#e0583c', 'one', 'none', 'antenna'), { elite: true, armor: 0.2, hunter: true });
  /* bosses (fixed stats: the Engine car only) */
  en('great_steward', 'engine', 'The Great Steward', [950, 950], [atk(30, 38, 3), chg(70, 80, 'Total Deletion', 1), { t: 'summon', id: 'static_thing', w: 1 }, blk(40, 1), deb('exposed', 2, 1)], S('orb', '#161b1e', '#e0583c', 'one', 'teeth', 'antenna'), { boss: true, fixed: true, armor: 0.15, dmgScale: 1 });
  en('conductor_echo', 'engine', "The Conductor's Echo", [1400, 1400], [atk(34, 42, 3), atk(14, 18, 1, { hits: 3 }), buff('strength', 6, 1), deb('weak', 2, 1), chg(80, 95, 'Final Stop', 1)], S('tall', '#1a2a26', '#7ff0d0', 'visor', 'line', 'hat'), { boss: true, fixed: true, armor: 0.1, dmgScale: 1, enrage: 0.5 });

  D.ENEMIES = E;
  D.FAMILIES = {};
  for (const e of Object.values(E)) (D.FAMILIES[e.fam] = D.FAMILIES[e.fam] || []).push(e.id);
})();
