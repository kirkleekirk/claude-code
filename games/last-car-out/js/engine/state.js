/* Game state: creation, migration, persistence, experience and the Number. */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;
  const ENG = LCO.engine;

  const START_NUMBER = 108;
  const MAX_LEVEL = 50;

  function xpToNext(L) { return Math.round(50 + 35 * L + 6 * L * L); }

  D.MEMORIES = {
    voice:   { name: "A Voice from Home",  desc: '+10% Max HP.',                    stats: { maxHpPct: 0.1 } },
    table:   { name: 'The Kitchen Table',  desc: 'Start with 3 extra skill points.', startSp: 3 },
    friend:  { name: "A Friend's Name",    desc: '+15% Experience.',                stats: { xpGain: 0.15 } },
    walk:    { name: 'The Walk Home',      desc: '+1 Secure Pouch slot.',           stats: { pouch: 1 } },
    savings: { name: 'A Jar of Savings',   desc: 'Start with 500 Tickets.',         startTickets: 500 },
    scar:    { name: 'An Old Scar',        desc: '+5 Armor.',                       stats: { armor: 5 } },
  };

  function newGame(opts) {
    opts = opts || {};
    const memories = opts.memories || [];
    const G = {
      v: 1,
      created: Date.now(),
      name: opts.name || 'Passenger',
      level: 1, xp: 0, sp: 1,
      skills: {},
      bar: [null, null, null, null, null, null],
      number: START_NUMBER + (opts.ascension || 0) * 12,
      numberLow: START_NUMBER,
      history: [],
      equip: { weapon: null, offhand: null, armor: null, charm1: null, charm2: null },
      belt: [null, null, null, null],
      pouch: [],
      stash: [],
      stashCap: 40,
      overflow: [],
      tickets: 120, scrap: 0, glimmer: 0,
      unlockedTier: 1,
      board: [],
      market: { stock: [], refreshedAt: -1 },
      stats: { raids: 0, extracts: 0, deaths: 0, kills: 0, bestHaul: 0, relics: 0, elites: 0, lessons: 0, deepest: 0 },
      codex: { relics: {}, enemies: {} },
      raid: null,
      lastResult: null,
      engineCleared: false,
      ascension: opts.ascension || 0,
      memories,
      flags: { intro: false },
    };
    for (const m of memories) {
      const def = D.MEMORIES[m];
      if (def && def.startSp) G.sp += def.startSp;
      if (def && def.startTickets) G.tickets += def.startTickets;
    }
    const L = ENG.loot;
    G.equip.weapon = L.makeItem({ base: 'lead_pipe', rarity: 0, ilvl: 1 });
    G.equip.armor = L.makeItem({ base: 'travel_coat', rarity: 0, ilvl: 1 });
    G.belt[0] = L.makeConsumable('bandage', 2);
    G.belt[1] = L.makeConsumable('beans', 1);
    G.stash.push(L.makeItem({ base: 'carving_knife', rarity: 0, ilvl: 1 }));
    G.stash.push(L.makeConsumable('tonic', 1));
    if (opts.keepsake) G.stash.push(opts.keepsake);
    ENG.hub.genBoard(G);
    ENG.hub.genMarket(G);
    return G;
  }

  /* Fill anything an older save is missing. */
  function migrate(G) {
    const fresh = newGame({ name: G.name });
    for (const k of Object.keys(fresh)) if (G[k] === undefined) G[k] = fresh[k];
    for (const k of Object.keys(fresh.stats)) if (G.stats[k] === undefined) G.stats[k] = 0;
    for (const k of Object.keys(fresh.equip)) if (G.equip[k] === undefined) G.equip[k] = null;
    while (G.bar.length < 6) G.bar.push(null);
    if (!G.codex) G.codex = { relics: {}, enemies: {} };
    if (!Array.isArray(G.overflow)) G.overflow = [];
    return G;
  }

  function persist(G) { return LCO.store.save(G); }

  function gainXp(G, amount) {
    const out = [];
    amount = Math.max(0, Math.round(amount));
    G.xp += amount;
    while (G.level < MAX_LEVEL && G.xp >= xpToNext(G.level)) {
      G.xp -= xpToNext(G.level);
      G.level += 1;
      const pts = G.level % 5 === 0 ? 2 : 1;
      G.sp += pts;
      out.push({ level: G.level, sp: pts });
    }
    if (G.level >= MAX_LEVEL) G.xp = Math.min(G.xp, xpToNext(G.level));
    return out;
  }

  /* Every Number change goes through here so relics, skills and car rules apply.
     Returns the delta actually applied. */
  function changeNumber(G, delta, why, S) {
    if (!delta) return 0;
    S = S || ENG.stats.compute(G);
    const raid = G.raid;
    let d = delta;
    if (d > 0) {
      if (S.flags.numberLock && raid) return 0;
      if (S.flags.numberGainHalf) d = Math.ceil(d / 2);
      if (S.flags.numberGainReduce) d = Math.max(1, d - S.flags.numberGainReduce);
    } else {
      if (S.flags.numberDropBonus) d = Math.floor(d * (1 + S.flags.numberDropBonus));
    }
    if (raid && raid.car.mod === 'audited') d *= 2;
    const floor = G.engineCleared ? 0 : 1;
    const before = G.number;
    G.number = U.clamp(G.number + d, floor, 400);
    const applied = G.number - before;
    if (applied) {
      G.numberLow = Math.min(G.numberLow, G.number);
      G.history.push({ t: Date.now(), d: applied, why: why || '', n: G.number });
      if (G.history.length > 40) G.history.shift();
      if (raid) raid.numberDelta = (raid.numberDelta || 0) + applied;
    }
    return applied;
  }

  function abilitySlots(G) { return 4 + (G.level >= 10 ? 1 : 0) + (G.level >= 20 ? 1 : 0); }

  /* Car tiers open with experience: tier N needs level 4N-6 (tier 10 at level 34). */
  function tierCap(level) { return Math.min(10, 1 + Math.floor((level + 2) / 4)); }
  function levelForTier(t) { return Math.max(1, 4 * t - 6); }
  function maxTier(G) { return Math.min(G.unlockedTier, tierCap(G.level)); }

  Object.assign(ENG, { newGame, migrate, persist, gainXp, xpToNext, changeNumber, abilitySlots, tierCap, levelForTier, maxTier, START_NUMBER, MAX_LEVEL });
})();
