/* Game state: creation, migration, experience, tiers. Raids are transient and never saved mid-run. */
(function () {
  'use strict';
  const D = AE.data;
  const M = AE.meta;
  const MAX_LEVEL = 40;

  const xpToNext = (L) => Math.round(60 + 40 * L + 5 * L * L);

  D.JOURNEY_PERKS = {
    heart:   { name: 'Bigger Heart',     desc: '+10% max HP for both heroes.', stats: { hpPct: 0.1 } },
    swagger: { name: 'Hero Swagger',     desc: '+10% damage for both heroes.', stats: { dmg: 0.1 } },
    nose:    { name: 'Treasure Sense',   desc: '+15% luck.',                    stats: { luck: 0.15 } },
    pockets: { name: 'Extra Pockets',    desc: '+1 Tummy slot and +2 backpack slots.', stats: { tummy: 1, backpack: 2 } },
    brains:  { name: 'Big Brain Energy', desc: '+15% XP and 10% faster cooldowns.', stats: { xp: 0.15, cdr: 0.1 } },
  };

  function newGame(o) {
    o = o || {};
    const G = {
      v: 1, created: Date.now(),
      level: 1, xp: 0, sp: 1,
      skills: {},
      bars: { finn: [null, null, null], jake: [null, null, null] },
      equip: { finnWeapon: null, finnGear: null, jakeWeapon: null, jakeGear: null, trinket1: null, trinket2: null },
      belt: [null, null, null],
      tummy: [],
      stash: [], stashCap: 40, overflow: [],
      gold: 150, dust: 0, shards: 0,
      princesses: {},
      unlockedTier: 1,
      board: [], market: { stock: [] },
      stats: { trips: 0, escapes: 0, wipes: 0, kills: 0, elites: 0, chests: 0, bestHaul: 0, deepest: 0, supers: 0 },
      codex: { relics: {}, enemies: {} },
      lastResult: null,
      iceKingBeaten: false,
      journey: o.journey || 0,
      perks: o.perks || [],
      heroes: { finn: true, jake: true },
      flags: {},
    };
    const L = M.loot;
    G.equip.finnWeapon = L.makeItem({ base: 'wood_sword', rarity: 0, ilvl: 1 });
    G.equip.jakeWeapon = L.makeItem({ base: 'mitts', rarity: 0, ilvl: 1 });
    G.equip.finnGear = L.makeItem({ base: 'bear_hat', rarity: 0, ilvl: 1 });
    G.belt[0] = L.makeConsumable('bacon_pancakes', 3);
    G.belt[1] = L.makeConsumable('candy', 1);
    G.stash.push(L.makeItem({ base: 'dog_collar', rarity: 0, ilvl: 1 }), L.makeConsumable('bacon_pancakes', 2));
    if (o.keepsake) G.stash.push(o.keepsake);
    M.hub.genBoard(G);
    M.hub.genMarket(G);
    return G;
  }

  function migrate(G) {
    const fresh = newGame();
    for (const k of Object.keys(fresh)) if (G[k] === undefined) G[k] = fresh[k];
    for (const k of Object.keys(fresh.stats)) if (G.stats[k] === undefined) G.stats[k] = 0;
    for (const k of Object.keys(fresh.equip)) if (G.equip[k] === undefined) G.equip[k] = null;
    if (!G.bars || !G.bars.finn || !G.bars.jake) G.bars = fresh.bars;
    if (!Array.isArray(G.overflow)) G.overflow = [];
    return G;
  }

  function gainXp(G, amount) {
    const ups = [];
    G.xp += Math.max(0, Math.round(amount));
    while (G.level < MAX_LEVEL && G.xp >= xpToNext(G.level)) {
      G.xp -= xpToNext(G.level);
      G.level += 1;
      const pts = G.level % 5 === 0 ? 2 : 1;
      G.sp += pts;
      ups.push({ level: G.level, sp: pts });
    }
    if (G.level >= MAX_LEVEL) G.xp = Math.min(G.xp, xpToNext(G.level));
    return ups;
  }

  /* Highest route tier the heroes may board: unlocked by escaping, capped by level. */
  function tierCap(level) {
    let t = 1;
    for (const r of D.ROUTES) if (!r.final && r.rec <= level + 2) t = Math.max(t, r.tier);
    return t;
  }
  function maxTier(G) { return Math.min(G.unlockedTier, tierCap(G.level)); }
  function allPrincesses(G) { return D.PRINCESSES.every((p) => G.princesses[p.id]); }
  function finalOpen(G) { return allPrincesses(G) && G.level >= 20; }
  function slotsFor(G) { return 2 + (G.level >= 8 ? 1 : 0); }

  Object.assign(M, { newGame, migrate, gainXp, xpToNext, tierCap, maxTier, allPrincesses, finalOpen, abilitySlots: slotsFor, MAX_LEVEL });
})();
