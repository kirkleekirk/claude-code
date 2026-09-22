/* The Vestibule: departures board, market, stash, equipment, skills, workbench, and going home. */
(function () {
  'use strict';
  const D = LCO.data;
  const R = LCO.R;
  const U = LCO.U;
  const ENG = LCO.engine;
  const S_ = (G) => ENG.stats.compute(G);
  const GEAR = ['weapon', 'offhand', 'armor', 'charm'];

  /* ---------- departures ---------- */
  function makeOffer(G, tier) {
    const themes = D.CAR_ORDER.filter((t) => D.CARS[t].tiers[0] <= tier && tier <= D.CARS[t].tiers[1]);
    const theme = R.pick(themes.length ? themes : ['corgi']);
    const mods = Object.keys(D.MODIFIERS).filter((m) => (D.MODIFIERS[m].minTier || 1) <= tier);
    const mod = R.weighted(mods.map((m) => [m === 'ordinary' ? 3 : 1, m]));
    const lessons = Object.keys(D.LESSONS).filter((l) => ENG.raid.lessonFits(theme, l));
    const rumor = R.weighted([[tier >= 2 ? 1 : 0, 'relic'], [2, 'rich'], [1.5, 'quiet'], [1.5, 'merchant'], [3, 'none']]);
    return { id: U.uid('o'), theme, tier, mod, lesson: R.pick(lessons), rumor, num: U.carNumber() };
  }
  function genBoard(G) {
    const top = ENG.maxTier(G);
    const tiers = [top, Math.max(1, top - 1), R.int(1, top)];
    G.board = tiers.map((t) => makeOffer(G, t));
    if (G.number <= 30 || G.engineCleared) G.board.push({ id: U.uid('o'), theme: 'engine', tier: 10, mod: 'ordinary', lesson: 'long_way', rumor: 'none', num: '1' });
  }
  function rerollBoard(G) {
    if (G.tickets < 15) return 'poor';
    G.tickets -= 15;
    genBoard(G);
    return 'ok';
  }
  function board(G, offerId) {
    const offer = G.board.find((o) => o.id === offerId);
    if (!offer || G.raid) return null;
    fixPouch(G);
    G.raid = ENG.raid.genCar(G, offer);
    G.lastResult = null;
    ENG.raid.log(G.raid, `You step into Car ${offer.num}: ${D.CARS[offer.theme].name}. The door seals behind you.`, 'head');
    return G.raid;
  }

  function afterRaid(G) {
    genBoard(G);
    genMarket(G);
    fixPouch(G);
  }

  /* ---------- stash ---------- */
  function addToStash(G, item) {
    if (item.kind === 'consumable') {
      for (const s of G.stash) {
        if (s.kind === 'consumable' && s.base === item.base && s.qty < D.STACK_MAX) {
          const moved = Math.min(D.STACK_MAX - s.qty, item.qty);
          s.qty += moved;
          item.qty -= moved;
          if (item.qty <= 0) return 'stash';
        }
      }
    }
    if (G.stash.length < G.stashCap) { G.stash.push(item); return 'stash'; }
    G.overflow.push(item);
    return 'overflow';
  }
  function takeFrom(list, uid) {
    const i = list.findIndex((x) => x && x.uid === uid);
    return i < 0 ? null : list.splice(i, 1)[0];
  }
  function findAnywhere(G, uid) {
    for (const [where, list] of [['stash', G.stash], ['overflow', G.overflow], ['pouch', G.pouch]]) {
      const it = list.find((x) => x && x.uid === uid);
      if (it) return { where, item: it };
    }
    for (const k in G.equip) if (G.equip[k] && G.equip[k].uid === uid) return { where: 'equip', slot: k, item: G.equip[k] };
    for (let i = 0; i < G.belt.length; i++) if (G.belt[i] && G.belt[i].uid === uid) return { where: 'belt', slot: i, item: G.belt[i] };
    return null;
  }
  function removeAnywhere(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f) return null;
    if (f.where === 'equip') { G.equip[f.slot] = null; fixPouch(G); }
    else if (f.where === 'belt') G.belt[f.slot] = null;
    else takeFrom(G[f.where], uid);
    return f.item;
  }
  function stashSpace(G) { return G.stashCap - G.stash.length; }
  function upgradeStashCost(G) { return G.stashCap >= 120 ? null : 150 * (1 + (G.stashCap - 40) / 10); }
  function upgradeStash(G) {
    const c = upgradeStashCost(G);
    if (c == null || G.tickets < c) return 'poor';
    G.tickets -= c;
    G.stashCap += 10;
    while (G.overflow.length && G.stash.length < G.stashCap) G.stash.push(G.overflow.shift());
    return 'ok';
  }
  function discard(G, uid) { return !!removeAnywhere(G, uid); }

  /* ---------- equipment, belt, pouch ---------- */
  function slotFor(G, item, pref) {
    if (item.kind === 'charm') return pref === 'charm1' || pref === 'charm2' ? pref : !G.equip.charm1 ? 'charm1' : !G.equip.charm2 ? 'charm2' : 'charm1';
    return item.kind;
  }
  function equip(G, uid, pref) {
    const f = findAnywhere(G, uid);
    if (!f || !GEAR.includes(f.item.kind) || f.where === 'equip') return 'none';
    const slot = slotFor(G, f.item, pref);
    const current = G.equip[slot];
    if (current && f.where !== 'stash' && f.where !== 'overflow' && stashSpace(G) <= 0) return 'full';
    removeAnywhere(G, uid);
    G.equip[slot] = f.item;
    if (current) {
      if (f.where === 'stash') G.stash.push(current);
      else addToStash(G, current);
    }
    fixPouch(G);
    return 'ok';
  }
  function unequip(G, slot) {
    const it = G.equip[slot];
    if (!it) return 'none';
    if (stashSpace(G) <= 0) return 'full';
    G.equip[slot] = null;
    G.stash.push(it);
    fixPouch(G);
    return 'ok';
  }
  function beltAdd(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f || f.item.kind !== 'consumable' || f.where === 'belt') return 'none';
    const it = f.item;
    const same = G.belt.findIndex((b) => b && b.base === it.base && b.qty < D.STACK_MAX);
    if (same >= 0) {
      const moved = Math.min(D.STACK_MAX - G.belt[same].qty, it.qty);
      G.belt[same].qty += moved;
      it.qty -= moved;
      if (it.qty <= 0) removeAnywhere(G, uid);
      return 'ok';
    }
    const empty = G.belt.findIndex((b) => !b);
    if (empty < 0) return 'full';
    removeAnywhere(G, uid);
    G.belt[empty] = it;
    return 'ok';
  }
  function beltRemove(G, idx) {
    const it = G.belt[idx];
    if (!it) return 'none';
    G.belt[idx] = null;
    addToStash(G, it);
    return 'ok';
  }
  function pouchAdd(G, uid) {
    const S = S_(G);
    if (G.pouch.length >= S.pouch) return 'full';
    const f = findAnywhere(G, uid);
    if (!f || f.where === 'pouch' || f.where === 'equip' || f.where === 'belt') return 'none';
    takeFrom(G[f.where], uid);
    G.pouch.push(f.item);
    return 'ok';
  }
  function pouchRemove(G, uid) {
    const it = takeFrom(G.pouch, uid);
    if (!it) return 'none';
    addToStash(G, it);
    return 'ok';
  }
  function fixPouch(G) {
    const S = S_(G);
    while (G.pouch.length > S.pouch) addToStash(G, G.pouch.pop());
  }

  /* ---------- market ---------- */
  function genMarket(G) {
    const tier = Math.max(1, G.unlockedTier);
    const L = ENG.loot;
    const stock = [L.makeConsumable('bandage', 1), L.makeConsumable('beans', 1), L.makeConsumable('tonic', 1)];
    for (let i = 0; i < 3; i++) stock.push(L.rollConsumable());
    if (tier >= 2) stock.push(L.makeConsumable('coupling_key', 1));
    const kinds = R.shuffle(['weapon', 'armor', 'offhand', 'charm']);
    for (let i = 0; i < 3; i++) {
      const bases = Object.keys(D.BASES).filter((b) => D.BASES[b].kind === kinds[i]);
      stock.push(L.makeItem({ base: R.pick(bases), rarity: R.weighted([[4, 0], [4, 1], [2, 2]]), ilvl: tier }));
    }
    stock.push(L.rollGear(tier, { minRarity: 3 }));
    for (const it of stock) if (it.rarity > 3) { it.rarity = 3; }
    G.market = { stock: stock.filter((it) => !it.relic), refreshedAt: G.stats.raids };
  }
  function refreshMarket(G) {
    if (G.tickets < 25) return 'poor';
    G.tickets -= 25;
    genMarket(G);
    return 'ok';
  }
  function buy(G, uid) {
    const i = G.market.stock.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    const it = G.market.stock[i];
    const price = ENG.loot.buyPrice(it, S_(G));
    if (G.tickets < price) return 'poor';
    if (stashSpace(G) <= 0 && it.kind !== 'consumable') return 'full';
    G.tickets -= price;
    G.market.stock.splice(i, 1);
    addToStash(G, it);
    return 'ok';
  }
  function sell(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f || f.where === 'equip') return 0;
    const price = ENG.loot.sellPrice(f.item, S_(G));
    removeAnywhere(G, uid);
    G.tickets += price;
    return price;
  }
  function sellValuables(G) {
    const S = S_(G);
    let total = 0;
    for (const it of G.stash.filter((x) => x.kind === 'valuable')) { total += ENG.loot.sellPrice(it, S); takeFrom(G.stash, it.uid); }
    for (const it of G.overflow.filter((x) => x.kind === 'valuable')) { total += ENG.loot.sellPrice(it, S); takeFrom(G.overflow, it.uid); }
    G.tickets += total;
    return total;
  }
  function salvage(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f || f.where === 'equip' || !GEAR.includes(f.item.kind)) return null;
    const y = ENG.loot.salvageYield(f.item, S_(G));
    let glimmer = y.glimmer + (y.bonusGlimmerChance && R.chance(y.bonusGlimmerChance) ? 1 : 0);
    removeAnywhere(G, uid);
    G.scrap += y.scrap;
    G.glimmer += glimmer;
    return { scrap: y.scrap, glimmer };
  }

  /* ---------- workbench ---------- */
  function upgradeCost(item) {
    if (!GEAR.includes(item.kind) || item.upg >= 5) return null;
    return {
      scrap: Math.round(8 * (item.upg + 1) * (1 + item.ilvl * 0.4) * (1 + item.rarity * 0.5)),
      glimmer: item.rarity >= 3 ? Math.max(item.rarity >= 4 ? 1 : 0, item.upg) : 0,
    };
  }
  function upgrade(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f) return 'none';
    const c = upgradeCost(f.item);
    if (!c) return 'max';
    if (G.scrap < c.scrap || G.glimmer < c.glimmer) return 'poor';
    G.scrap -= c.scrap;
    G.glimmer -= c.glimmer;
    f.item.upg += 1;
    return 'ok';
  }
  function rerollCost(item) {
    if (!GEAR.includes(item.kind) || !item.affixes.length) return null;
    return { scrap: 10 * item.ilvl, glimmer: item.rarity >= 4 ? 3 : 1 };
  }
  function reroll(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f) return 'none';
    const c = rerollCost(f.item);
    if (!c) return 'none';
    if (G.scrap < c.scrap || G.glimmer < c.glimmer) return 'poor';
    G.scrap -= c.scrap;
    G.glimmer -= c.glimmer;
    f.item.affixes = ENG.loot.rollAffixes(f.item.kind, f.item.affixes.length, f.item.ilvl);
    f.item.name = ENG.loot.nameOf(f.item);
    return 'ok';
  }

  /* ---------- skills ---------- */
  function pointsIn(G, branch) {
    let n = 0;
    for (const id in G.skills) if (D.SKILLS[id] && D.SKILLS[id].branch === branch) n += G.skills[id];
    return n;
  }
  function skillState(G, id) {
    const node = D.SKILLS[id];
    const rank = G.skills[id] || 0;
    if (rank >= node.max) return { ok: false, reason: 'Mastered', rank };
    const need = D.TIER_REQ[node.tier];
    const have = pointsIn(G, node.branch);
    if (have < need) return { ok: false, reason: `Spend ${need - have} more in ${node.branch[0].toUpperCase() + node.branch.slice(1)}`, rank, locked: true };
    if (node.req && !(G.skills[node.req] > 0)) return { ok: false, reason: `Requires ${D.SKILLS[node.req].name}`, rank, locked: true };
    if (G.sp < 1) return { ok: false, reason: 'No skill points', rank };
    return { ok: true, rank };
  }
  function learn(G, id) {
    const st = skillState(G, id);
    if (!st.ok) return st.reason;
    G.skills[id] = (G.skills[id] || 0) + 1;
    G.sp -= 1;
    const node = D.SKILLS[id];
    if (node.ability && G.skills[id] === 1) {
      const slots = ENG.abilitySlots(G);
      for (let i = 0; i < slots; i++) if (!G.bar[i]) { G.bar[i] = node.ability; break; }
    }
    fixPouch(G);
    return 'ok';
  }
  function knownAbilities(G) { return D.SKILL_LIST.filter((n) => n.ability && G.skills[n.id] > 0).map((n) => n.ability); }
  function setBar(G, slot, abilityId) {
    if (slot < 0 || slot >= ENG.abilitySlots(G)) return 'none';
    if (abilityId && !knownAbilities(G).includes(abilityId)) return 'none';
    const existing = G.bar.indexOf(abilityId);
    if (abilityId && existing >= 0) G.bar[existing] = G.bar[slot];
    G.bar[slot] = abilityId || null;
    return 'ok';
  }
  const respecCost = (G) => 40 * G.level;
  function respec(G) {
    const c = respecCost(G);
    if (G.tickets < c) return 'poor';
    let pts = 0;
    for (const id in G.skills) pts += G.skills[id];
    if (!pts) return 'none';
    G.tickets -= c;
    G.sp += pts;
    G.skills = {};
    G.bar = G.bar.map(() => null);
    fixPouch(G);
    return 'ok';
  }

  /* ---------- charity & ending ---------- */
  function needsHandout(G) { return !G.equip.weapon && !G.stash.some((i) => i.kind === 'weapon') && G.tickets < 60; }
  function handout(G) {
    if (!needsHandout(G)) return 'none';
    const L = ENG.loot;
    const weapons = Object.keys(D.BASES).filter((b) => D.BASES[b].kind === 'weapon' && b !== 'fire_axe');
    G.equip.weapon = L.makeItem({ base: R.pick(weapons), rarity: 0, ilvl: Math.max(1, G.unlockedTier - 1) });
    if (!G.equip.armor) G.equip.armor = L.makeItem({ base: 'travel_coat', rarity: 0, ilvl: Math.max(1, G.unlockedTier - 1) });
    addToStash(G, L.makeConsumable('bandage', 2));
    G.flags.handouts = (G.flags.handouts || 0) + 1;
    return 'ok';
  }
  function goHome(G, memory, keepsakeUid) {
    const keep = keepsakeUid ? removeAnywhere(G, keepsakeUid) : null;
    const memories = (G.memories || []).concat(memory && D.MEMORIES[memory] ? [memory] : []);
    const next = ENG.newGame({ name: G.name, memories, ascension: (G.ascension || 0) + 1, keepsake: keep });
    next.codex = G.codex;
    return next;
  }

  ENG.hub = {
    genBoard, rerollBoard, board, afterRaid, addToStash, findAnywhere, removeAnywhere, stashSpace, upgradeStashCost, upgradeStash, discard,
    equip, unequip, beltAdd, beltRemove, pouchAdd, pouchRemove, fixPouch, genMarket, refreshMarket, buy, sell, sellValuables, salvage,
    upgradeCost, upgrade, rerollCost, reroll, pointsIn, skillState, learn, knownAbilities, setBar, respecCost, respec, needsHandout, handout, goHome,
  };
})();
