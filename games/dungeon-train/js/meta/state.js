/* Save state. One save = one player profile that owns both characters.
   Per character: level, experience, skill points, skill tree, gear, ability bar, snack belt, safe pocket.
   Shared: the treasure stash, gold and materials, boss trophies, the mission board and the shop.
   Trips are transient and never saved mid-run. */
(function () {
  'use strict';
  const D = DT.data;
  const M = DT.meta;
  const MAX_LEVEL = 40;

  const xpToNext = (L) => Math.round(60 + 40 * L + 5 * L * L);

  function newChar(heroId) {
    const H = D.HEROES[heroId];
    const equip = {};
    for (const s of H.slots) equip[s.id] = null;
    const tree = {};
    tree[D.TREES[heroId].start] = true;
    return { level: 1, xp: 0, sp: 1, tree, bars: [null, null, null, null], equip, belt: [null, null, null, null, null], safe: [], trips: 0 };
  }

  function newGame(o) {
    o = o || {};
    const G = {
      v: 2, created: Date.now(),
      chars: { finn: newChar('finn'), jake: newChar('jake') },
      active: 'finn',
      stash: [], stashCap: 60, overflow: [],
      gold: 150, dust: 0, shards: 0,
      trophies: {},
      board: [], market: { stock: [] },
      stats: { trips: 0, escapes: 0, wipes: 0, kills: 0, elites: 0, bosses: 0, chests: 0, bestHaul: 0, supers: 0 },
      codex: { uniques: {}, enemies: {} },
      lastResult: null,
      conductorBeaten: false,
      journey: o.journey || 0,
      perks: o.perks || [],
      flags: {},
    };
    const L = M.loot;
    const F = G.chars.finn, J = G.chars.jake;
    F.equip.weapon = L.makeItem({ base: 'wood_sword', rarity: 0, ilvl: 1 });
    F.equip.head = L.makeItem({ base: 'bear_hat', rarity: 0, ilvl: 1 });
    F.equip.pack = L.makeItem({ base: 'adventure_pack', rarity: 0, ilvl: 1 });
    F.belt[0] = L.makeConsumable('bacon_pancakes', 3);
    F.belt[1] = L.makeConsumable('candy', 1);
    J.equip.instrument = L.makeItem({ base: 'old_viola', rarity: 0, ilvl: 1 });
    J.equip.collar = L.makeItem({ base: 'dog_collar', rarity: 0, ilvl: 1 });
    J.belt[0] = L.makeConsumable('bacon_pancakes', 3);
    J.belt[1] = L.makeConsumable('candy', 1);
    G.stash.push(
      L.makeItem({ base: 'garage_guitar', rarity: 0, ilvl: 1 }),
      L.makeItem({ base: 'leather_gloves', rarity: 1, ilvl: 1 }),
      L.makeConsumable('bacon_pancakes', 2),
    );
    for (const it of G.stash) it.isNew = true;
    if (o.keepsake) G.stash.push(o.keepsake);
    M.hub.genBoard(G);
    M.hub.genMarket(G);
    return G;
  }

  function migrate(G) {
    if (!G || G.v !== 2 || !G.chars) return null;
    const fresh = newGame();
    for (const k of Object.keys(fresh)) if (G[k] === undefined) G[k] = fresh[k];
    for (const k of Object.keys(fresh.stats)) if (G.stats[k] === undefined) G.stats[k] = 0;
    for (const id of D.HERO_IDS) {
      if (!G.chars[id]) G.chars[id] = newChar(id);
      const C = G.chars[id], blank = newChar(id);
      for (const k of Object.keys(blank)) if (C[k] === undefined) C[k] = blank[k];
      for (const s of D.HEROES[id].slots) if (C.equip[s.id] === undefined) C.equip[s.id] = null;
      while (C.belt.length < 5) C.belt.push(null);
      while (C.bars.length < 4) C.bars.push(null);
      C.tree[D.TREES[id].start] = true;
      for (const nid of Object.keys(C.tree)) if (!D.TREES[id].nodes[nid]) delete C.tree[nid];
    }
    if (!Array.isArray(G.overflow)) G.overflow = [];
    if (!D.HEROES[G.active]) G.active = 'finn';
    M.hub.fixBoard(G);
    return G;
  }

  function gainXp(G, heroId, amount) {
    const C = G.chars[heroId];
    const H = D.HEROES[heroId];
    const ups = [];
    C.xp += Math.max(0, Math.round(amount));
    while (C.level < MAX_LEVEL && C.xp >= xpToNext(C.level)) {
      C.xp -= xpToNext(C.level);
      C.level += 1;
      let pts = C.level % 5 === 0 ? 2 : 1;
      if (H.bonusSpEvery && C.level % H.bonusSpEvery === 0) pts += 1;
      C.sp += pts;
      ups.push({ level: C.level, sp: pts });
    }
    if (C.level >= MAX_LEVEL) C.xp = Math.min(C.xp, xpToNext(C.level));
    return ups;
  }

  /* ---------- lines (tiers) ---------- */
  const lineById = (id) => D.LINES.find((l) => l.id === id);
  /* the main line of a tier (branch lines share tiers with it) */
  const lineByTier = (t) => D.LINES.find((l) => l.tier === t && !l.branch && !l.post);
  const MAIN_TROPHIES = () => Object.keys(D.TROPHIES).filter((k) => !D.TROPHIES[k].branch);
  function trophyCount(G) { return MAIN_TROPHIES().filter((k) => G.trophies[k]).length; }
  function finalOpen(G, heroId) { return trophyCount(G) >= MAIN_TROPHIES().length && G.chars[heroId].level >= 24; }
  /* Why a line is closed (or null when it's open) for this hero. */
  function lineLock(G, line, heroId) {
    const lvl = G.chars[heroId].level;
    const need = MAIN_TROPHIES().length;
    if (line.final) {
      if (trophyCount(G) < need) return `Bring home all ${need} main-line boss trophies`;
      if (lvl < 24) return 'Reach level 24';
      return null;
    }
    if (line.post) {
      if (!G.conductorBeaten) return 'Break the Loop first (beat the Engine)';
      if (line.rec > lvl + 3) return `Reach level ${line.rec - 3}`;
      return null;
    }
    if (line.tier === 1) return null;
    const prev = lineByTier(line.tier - 1);
    if (!G.trophies[prev.id]) return `Beat ${D.ENEMIES[prev.boss].name} (${prev.name}) and bring the trophy home`;
    if (line.rec > lvl + 3) return `Reach level ${line.rec - 3}`;
    return null;
  }
  function maxTier(G, heroId) { let t = 1; for (const l of D.LINES) if (!lineLock(G, l, heroId)) t = Math.max(t, l.tier); return t; }

  /* ---------- per-hero unlocks ---------- */
  function abilitySlots(G, heroId) { const lv = G.chars[heroId].level; return D.HEROES[heroId].abilityLevels.filter((l) => lv >= l).length; }
  function slotLock(G, heroId, slot) {
    const C = G.chars[heroId];
    if (slot.level && C.level < slot.level) return `Unlocks at level ${slot.level}`;
    if (slot.node && !C.tree[slot.node]) return `Unlock “${D.TREES[heroId].nodes[slot.node].name}” in the skill tree`;
    return null;
  }

  Object.assign(M, { newGame, newChar, migrate, gainXp, xpToNext, MAX_LEVEL, lineById, lineByTier, lineLock, maxTier, finalOpen, trophyCount, abilitySlots, slotLock });
})();
