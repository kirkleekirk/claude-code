/* The Tree Fort: inventory and loadouts (per hero), ability bars, Choose Goose's shop, BMO's workshop,
   the train board, and new journeys. Every function returns 'ok' or a short reason the UI can show. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const M = DT.meta;
  const S_ = (G, h) => M.stats.compute(G, h || G.active);
  const heroName = (h) => D.HEROES[h].name;
  const HB = {};

  /* ---------- finding things ---------- */
  HB.find = function (G, uid) {
    for (const where of ['stash', 'overflow']) { const i = G[where].findIndex((x) => x && x.uid === uid); if (i >= 0) return { where, index: i, item: G[where][i] }; }
    for (const h of D.HERO_IDS) {
      const C = G.chars[h];
      for (const k in C.equip) if (C.equip[k] && C.equip[k].uid === uid) return { where: 'equip', hero: h, slot: k, item: C.equip[k] };
      for (let i = 0; i < C.belt.length; i++) if (C.belt[i] && C.belt[i].uid === uid) return { where: 'belt', hero: h, index: i, item: C.belt[i] };
      const j = C.safe.findIndex((x) => x && x.uid === uid);
      if (j >= 0) return { where: 'safe', hero: h, index: j, item: C.safe[j] };
    }
    return null;
  };
  HB.remove = function (G, uid) {
    const f = HB.find(G, uid);
    if (!f) return null;
    if (f.where === 'equip') G.chars[f.hero].equip[f.slot] = null;
    else if (f.where === 'belt') G.chars[f.hero].belt[f.index] = null;
    else if (f.where === 'safe') G.chars[f.hero].safe.splice(f.index, 1);
    else G[f.where].splice(f.index, 1);
    return f.item;
  };
  HB.addToStash = function (G, it) {
    if (it.kind === 'consumable') {
      for (const s of G.stash) if (s.kind === 'consumable' && s.base === it.base && s.qty < D.STACK_MAX) {
        const m = Math.min(D.STACK_MAX - s.qty, it.qty); s.qty += m; it.qty -= m; if (it.qty <= 0) return 'stash';
      }
    }
    if (G.stash.length < G.stashCap) { G.stash.push(it); return 'stash'; }
    G.overflow.push(it);
    return 'overflow';
  };
  HB.stashSpace = (G) => G.stashCap - G.stash.length;
  HB.upgradeStashCost = (G) => (G.stashCap >= 150 ? null : 200 + (G.stashCap - 60) * 25);
  HB.upgradeStash = function (G) {
    const c = HB.upgradeStashCost(G);
    if (c == null) return 'max';
    if (G.gold < c) return 'poor';
    G.gold -= c; G.stashCap += 10;
    while (G.overflow.length && G.stash.length < G.stashCap) G.stash.push(G.overflow.shift());
    return 'ok';
  };

  /* ---------- equipment ---------- */
  HB.usableBy = (it, h) => { const k = D.KINDS[it.kind]; return !!(k && k.gear && (k.hero === h || k.hero === 'any')); };
  HB.slotsFor = (h, it) => D.HEROES[h].slots.filter((s) => s.kind === it.kind);
  HB.whyNot = function (G, h, it, slotId) {
    if (!D.KINDS[it.kind] || !D.KINDS[it.kind].gear) return 'That isn’t gear.';
    if (!HB.usableBy(it, h)) {
      const k = D.KINDS[it.kind];
      if (h === 'jake' && k.weapon) return 'Jake doesn’t use swords — he punches! Give it to Finn.';
      if (h === 'jake') return `Jake can’t wear ${k.label.toLowerCase()} — that’s Finn gear.`;
      return `Finn can’t use ${k.label.toLowerCase()}s — that’s Jake gear.`;
    }
    const need = M.loot.reqLevel(it);
    if (G.chars[h].level < need) return `${heroName(h)} needs to be level ${need} to use this.`;
    if (slotId) {
      const s = D.HEROES[h].slots.find((x) => x.id === slotId);
      if (!s || s.kind !== it.kind) return 'That doesn’t go in that slot.';
      const lock = M.slotLock(G, h, s);
      if (lock) return `That slot is locked. ${lock}.`;
    } else if (!HB.slotsFor(h, it).some((s) => !M.slotLock(G, h, s))) return 'No unlocked slot for that yet.';
    return null;
  };
  function pickSlot(G, h, it, pref) {
    if (pref) return pref;
    const open = HB.slotsFor(h, it).filter((s) => !M.slotLock(G, h, s));
    const empty = open.find((s) => !G.chars[h].equip[s.id]);
    return (empty || open[0]).id;
  }
  HB.equip = function (G, h, uid, slotId) {
    const f = HB.find(G, uid);
    if (!f) return 'none';
    const it = f.item;
    const why = HB.whyNot(G, h, it, slotId);
    if (why) return why;
    const slot = pickSlot(G, h, it, slotId);
    const C = G.chars[h];
    if (f.where === 'equip' && f.hero === h && f.slot === slot) return 'none';
    const cur = C.equip[slot];
    if (cur && f.where !== 'equip' && f.where !== 'stash' && HB.stashSpace(G) <= 0) return 'Your stash is full.';
    HB.remove(G, uid);
    C.equip[slot] = it;
    it.isNew = false;
    if (cur) {
      /* swapping two equipped items (e.g. relic slots, or a relic between heroes) */
      if (f.where === 'equip' && !HB.whyNot(G, f.hero, cur, f.slot)) G.chars[f.hero].equip[f.slot] = cur;
      else if (f.where === 'stash') G.stash.splice(Math.min(f.index, G.stash.length), 0, cur);
      else HB.addToStash(G, cur);
    }
    HB.fixChar(G, h);
    if (f.where === 'equip' && f.hero !== h) HB.fixChar(G, f.hero);
    const ef = M.loot.effects(it);
    if (ef.grants) HB.autoBind(G, h, ef.grants);
    return 'ok';
  };
  HB.unequip = function (G, h, slotId) {
    const C = G.chars[h];
    const it = C.equip[slotId];
    if (!it) return 'none';
    if (HB.stashSpace(G) <= 0) return 'Your stash is full.';
    C.equip[slotId] = null;
    G.stash.push(it);
    HB.fixChar(G, h);
    return 'ok';
  };

  /* ---------- snack belt & safe pocket ---------- */
  HB.beltAdd = function (G, h, uid, index) {
    const f = HB.find(G, uid);
    if (!f || f.item.kind !== 'consumable') return 'Only snacks and supplies go on the belt.';
    const C = G.chars[h], it = f.item, cap = S_(G, h).belt;
    if (f.where === 'belt' && f.hero === h && (index == null || index === f.index)) return 'none';
    const same = C.belt.findIndex((b, i) => i < cap && b && b.base === it.base && b.qty < D.STACK_MAX && b !== it);
    if (same >= 0 && index == null) {
      const m = Math.min(D.STACK_MAX - C.belt[same].qty, it.qty);
      C.belt[same].qty += m; it.qty -= m;
      if (it.qty <= 0) HB.remove(G, uid);
      return 'ok';
    }
    let slot = index != null ? index : C.belt.findIndex((b, i) => i < cap && !b);
    if (slot < 0 || slot >= cap) return `${heroName(h)}’s snack belt is full.`;
    const cur = C.belt[slot];
    HB.remove(G, uid);
    C.belt[slot] = it;
    if (cur) { if (f.where === 'belt') G.chars[f.hero].belt[f.index] = cur; else HB.addToStash(G, cur); }
    return 'ok';
  };
  HB.beltRemove = function (G, h, i) { const C = G.chars[h]; const it = C.belt[i]; if (!it) return 'none'; C.belt[i] = null; HB.addToStash(G, it); return 'ok'; };
  HB.safeAdd = function (G, h, uid) {
    const f = HB.find(G, uid);
    if (!f) return 'none';
    if (f.where === 'equip') return 'Unequip it first.';
    if (f.where === 'safe' && f.hero === h) return 'none';
    const C = G.chars[h];
    if (C.safe.length >= S_(G, h).safe) return `${heroName(h)}’s ${D.HEROES[h].safeName} is full.`;
    HB.remove(G, uid);
    C.safe.push(f.item);
    return 'ok';
  };
  HB.safeRemove = function (G, h, uid) { const C = G.chars[h]; const i = C.safe.findIndex((x) => x.uid === uid); if (i < 0) return 'none'; HB.addToStash(G, C.safe.splice(i, 1)[0]); return 'ok'; };

  /* After any change: kick items out of locked slots, trim belt/safe to size, drop unknown abilities. */
  HB.fixChar = function (G, h) {
    const C = G.chars[h];
    for (const s of D.HEROES[h].slots) if (C.equip[s.id] && M.slotLock(G, h, s)) { HB.addToStash(G, C.equip[s.id]); C.equip[s.id] = null; }
    const S = S_(G, h);
    for (let i = S.belt; i < C.belt.length; i++) if (C.belt[i]) { HB.addToStash(G, C.belt[i]); C.belt[i] = null; }
    while (C.safe.length > S.safe) HB.addToStash(G, C.safe.pop());
    const known = new Set(S.abilities.map((a) => a.id));
    for (let i = 0; i < C.bars.length; i++) if (C.bars[i] && (!known.has(C.bars[i]) || i >= S.abilitySlots)) C.bars[i] = null;
  };

  /* ---------- ability bar ---------- */
  HB.setBar = function (G, h, slot, ab) {
    const S = S_(G, h);
    if (slot < 0 || slot >= S.abilitySlots) return 'That ability slot is locked.';
    if (ab && !S.abilities.some((a) => a.id === ab)) return `${heroName(h)} doesn’t know that ability.`;
    const bar = G.chars[h].bars;
    const ex = ab ? bar.indexOf(ab) : -1;
    if (ex >= 0) bar[ex] = bar[slot];
    bar[slot] = ab || null;
    return 'ok';
  };
  HB.autoBind = function (G, h, ab) {
    const bar = G.chars[h].bars;
    if (bar.includes(ab)) return bar.indexOf(ab);
    const n = M.abilitySlots(G, h);
    for (let i = 0; i < n; i++) if (!bar[i]) { bar[i] = ab; return i; }
    return -1;
  };

  /* ---------- Choose Goose's shop ---------- */
  HB.genMarket = function (G) {
    const tier = Math.max(1, ...D.HERO_IDS.map((h) => M.maxTier(G, h)));
    const L = M.loot;
    /* the shop never sells anything better than Radical on the first line and Algebraic after that;
       a Mathematical item shows up now and then from the Dungeon Cars on, a Legendary only rarely */
    const cap = tier >= 2 ? 2 : 1;
    const stock = [L.makeConsumable('bacon_pancakes', 2), L.makeConsumable('candy', 1), L.makeConsumable('pocket_watch', 1), L.rollConsumable(), L.rollConsumable(), L.makeConsumable('skeleton_key', 1)];
    for (const hero of ['finn', 'finn', 'jake', 'jake']) stock.push(L.rollGear(tier, { hero, rarity: Math.min(cap, L.rollRarity(tier, 0)) }));
    stock.push(L.makeItem({ base: R.pick(Object.keys(D.BASES).filter((b) => D.BASES[b].kind === 'relic')), rarity: Math.min(cap, R.weighted([[3, 0], [3, 1], [2, 2]])), ilvl: tier }));
    if (tier >= 3 && R.chance(0.5)) { const k = R.pick(D.GEAR_KINDS); stock.push(L.makeItem({ base: R.pick(Object.keys(D.BASES).filter((b) => D.BASES[b].kind === k)), rarity: 3, ilvl: tier })); }
    if (tier >= 4 && R.chance(0.1)) { const u = L.rollGear(tier, { rarity: 4 }); if (u.unique) stock.push(u); }
    G.market = { stock };
  };
  HB.refreshMarket = function (G) { if (G.gold < 30) return 'poor'; G.gold -= 30; HB.genMarket(G); return 'ok'; };
  HB.buy = function (G, uid) {
    const i = G.market.stock.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    const it = G.market.stock[i];
    const price = M.loot.buyPrice(it, S_(G));
    if (G.gold < price) return 'poor';
    if (HB.stashSpace(G) <= 0) return 'Your stash is full.';
    G.gold -= price; G.market.stock.splice(i, 1); it.isNew = true; HB.addToStash(G, it);
    return 'ok';
  };
  HB.sell = function (G, uid) {
    const f = HB.find(G, uid);
    if (!f || f.where === 'equip' || f.item.kind === 'trophy') return 0;
    const p = M.loot.sellPrice(f.item, S_(G));
    HB.remove(G, uid); G.gold += p;
    return p;
  };
  HB.sellValuables = function (G) {
    const S = S_(G);
    let total = 0;
    for (const list of [G.stash, G.overflow]) for (const it of list.filter((x) => x.kind === 'valuable')) { total += M.loot.sellPrice(it, S); list.splice(list.indexOf(it), 1); }
    G.gold += total;
    return total;
  };

  /* ---------- BMO's workshop ---------- */
  const workable = (G, uid) => { const f = HB.find(G, uid); return f && M.loot.isGear(f.item) ? f : null; };
  HB.salvage = function (G, uid) {
    const f = workable(G, uid);
    if (!f || f.where === 'equip') return null;
    const y = M.loot.salvageYield(f.item);
    HB.remove(G, uid); G.dust += y.dust; G.shards += y.shards;
    return y;
  };
  HB.upgradeCost = (it) => (M.loot.isGear(it) && it.upg < 5 ? { dust: Math.round(10 * (it.upg + 1) * (1 + it.ilvl * 0.4) * (1 + it.rarity * 0.5)), shards: it.rarity >= 3 ? Math.max(it.rarity >= 4 ? 1 : 0, it.upg) : 0 } : null);
  HB.rerollCost = (it) => (M.loot.isGear(it) && it.affixes.length ? { dust: 12 * it.ilvl, shards: it.rarity >= 4 ? 3 : 1 } : null);
  HB.powerCost = (it) => (M.loot.isGear(it) && it.rarity === 3 && it.power && !it.unique ? { dust: 20 * it.ilvl, shards: 2 } : null);
  HB.imbueCost = (it) => (M.loot.isGear(it) && it.rarity === 2 && !it.unique ? { dust: 30 * it.ilvl, shards: 4 } : null);
  const pay = (G, c) => { if (!c) return 'none'; if (G.dust < c.dust || G.shards < c.shards) return 'poor'; G.dust -= c.dust; G.shards -= c.shards; return 'ok'; };
  HB.upgrade = function (G, uid) { const f = workable(G, uid); if (!f) return 'none'; const r = pay(G, HB.upgradeCost(f.item)); if (r !== 'ok') return r === 'none' ? 'max' : r; f.item.upg += 1; return 'ok'; };
  HB.reroll = function (G, uid) { const f = workable(G, uid); if (!f) return 'none'; const r = pay(G, HB.rerollCost(f.item)); if (r !== 'ok') return r; f.item.affixes = M.loot.rollAffixes(f.item.kind, f.item.affixes.length, f.item.ilvl); f.item.name = M.loot.nameOf(f.item); return 'ok'; };
  HB.rerollPower = function (G, uid) { const f = workable(G, uid); if (!f) return 'none'; const r = pay(G, HB.powerCost(f.item)); if (r !== 'ok') return r; f.item.power = M.loot.rollPower(f.item.kind, f.item.power) || f.item.power; f.item.name = M.loot.nameOf(f.item); if (f.where === 'equip') HB.fixChar(G, f.hero); return 'ok'; };
  HB.imbue = function (G, uid) { const f = workable(G, uid); if (!f) return 'none'; const r = pay(G, HB.imbueCost(f.item)); if (r !== 'ok') return r; f.item.rarity = 3; f.item.power = M.loot.rollPower(f.item.kind); f.item.name = M.loot.nameOf(f.item); if (f.where === 'equip') HB.fixChar(G, f.hero); return 'ok'; };

  /* ---------- the train board ---------- */
  const offerFor = (line) => ({
    id: U.uid('m'), line: line.id, tier: line.tier, cars: R.int(line.cars[0], line.cars[1]),
    vault: line.tier >= 2 && R.chance(0.5), mod: line.final ? 'none' : R.weighted([[5, 'none'], [1.5, 'crowded'], [1.5, 'express'], [1.5, 'treasure'], [1, 'elites']]),
  });
  HB.genBoard = function (G) { G.board = D.LINES.map(offerFor); };
  /* Saves from before new lines existed: add the missing trips, drop trips for lines that are gone. */
  HB.fixBoard = function (G) {
    if (!Array.isArray(G.board)) { HB.genBoard(G); return; }
    G.board = G.board.filter((o) => D.LINES.some((l) => l.id === o.line));
    for (const line of D.LINES) if (!G.board.some((o) => o.line === line.id)) G.board.push(offerFor(line));
    G.board.sort((a, b) => D.LINES.findIndex((l) => l.id === a.line) - D.LINES.findIndex((l) => l.id === b.line));
  };
  HB.rerollBoard = function (G) { if (G.gold < 20) return 'poor'; G.gold -= 20; HB.genBoard(G); return 'ok'; };
  HB.afterRaid = function (G) { HB.genBoard(G); HB.genMarket(G); for (const h of D.HERO_IDS) HB.fixChar(G, h); };

  /* ---------- charity & new journeys ---------- */
  HB.needsHandout = function (G, h) {
    const C = G.chars[h];
    const wslot = h === 'finn' ? 'weapon' : 'instrument';
    const kind = h === 'finn' ? 'sword' : 'instrument';
    return !C.equip[wslot] && !G.stash.some((i) => i.kind === kind) && !G.overflow.some((i) => i.kind === kind);
  };
  HB.handout = function (G, h) {
    if (!HB.needsHandout(G, h)) return 'none';
    const t = Math.max(1, M.maxTier(G, h) - 1);
    if (h === 'finn') G.chars.finn.equip.weapon = M.loot.makeItem({ base: 'iron_sword', rarity: 0, ilvl: t });
    else G.chars.jake.equip.instrument = M.loot.makeItem({ base: 'old_viola', rarity: 0, ilvl: t });
    HB.addToStash(G, M.loot.makeConsumable('bacon_pancakes', 3));
    return 'ok';
  };
  HB.newJourney = function (G, perk, keepUid) {
    const keep = keepUid ? HB.remove(G, keepUid) : null;
    const perks = (G.perks || []).concat(perk && D.JOURNEY_PERKS[perk] ? [perk] : []);
    const next = M.newGame({ journey: (G.journey || 0) + 1, perks, keepsake: keep });
    next.codex = G.codex;
    return next;
  };

  M.hub = HB;
})();
