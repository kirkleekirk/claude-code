/* The Tree Fort: missions, Choose Goose's shop, treasure pile, gear, BMO's workshop, skills, new journeys. */
(function () {
  'use strict';
  const D = AE.data;
  const R = AE.R;
  const U = AE.U;
  const M = AE.meta;
  const T_ = (G) => M.stats.compute(G).team;

  D.MODS = {
    none:     { name: 'Regular Service', desc: 'Nothing special. Probably.' },
    crowded:  { name: 'Rush Hour',       desc: '40% more enemies, 25% more luck.' },
    express:  { name: 'Express Run',     desc: 'The blizzard comes 25% faster. +30% XP.' },
    treasure: { name: 'Treasure Train',  desc: 'An extra chest in most cars. Enemies hit 10% harder.' },
  };

  /* ---------- missions ---------- */
  function genBoard(G) {
    const top = M.maxTier(G);
    const offers = [];
    for (const r of D.ROUTES) {
      if (r.final) continue;
      if (r.tier > top) continue;
      const princess = D.PRINCESSES.find((p) => p.route === r.id);
      offers.push({
        id: U.uid('m'), route: r.id, tier: r.tier, cars: R.int(r.cars[0], r.cars[1]), vault: R.chance(0.55),
        princess: !!(princess && !G.princesses[princess.id] && R.chance(0.7)),
        mod: R.weighted([[4, 'none'], [1.5, 'crowded'], [1.5, 'express'], [1.5, 'treasure']]),
      });
    }
    if (M.finalOpen(G)) { const r = D.ROUTES.find((x) => x.final); offers.push({ id: U.uid('m'), route: r.id, tier: r.tier, cars: 9, vault: true, princess: false, mod: 'none', final: true }); }
    G.board = offers.reverse();
  }
  function rerollBoard(G) { if (G.gold < 20) return 'poor'; G.gold -= 20; genBoard(G); return 'ok'; }

  function afterRaid(G) { genBoard(G); genMarket(G); fixTummy(G); }

  /* ---------- treasure pile (stash) ---------- */
  function addToStash(G, it) {
    if (it.kind === 'consumable') {
      for (const s of G.stash) if (s.kind === 'consumable' && s.base === it.base && s.qty < D.STACK_MAX) {
        const m = Math.min(D.STACK_MAX - s.qty, it.qty); s.qty += m; it.qty -= m; if (it.qty <= 0) return 'stash';
      }
    }
    if (G.stash.length < G.stashCap) { G.stash.push(it); return 'stash'; }
    G.overflow.push(it);
    return 'overflow';
  }
  const takeFrom = (list, uid) => { const i = list.findIndex((x) => x && x.uid === uid); return i < 0 ? null : list.splice(i, 1)[0]; };
  function findAnywhere(G, uid) {
    for (const [where, list] of [['stash', G.stash], ['overflow', G.overflow], ['tummy', G.tummy]]) { const it = list.find((x) => x && x.uid === uid); if (it) return { where, item: it }; }
    for (const k in G.equip) if (G.equip[k] && G.equip[k].uid === uid) return { where: 'equip', slot: k, item: G.equip[k] };
    for (let i = 0; i < G.belt.length; i++) if (G.belt[i] && G.belt[i].uid === uid) return { where: 'belt', slot: i, item: G.belt[i] };
    return null;
  }
  function removeAnywhere(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f) return null;
    if (f.where === 'equip') G.equip[f.slot] = null;
    else if (f.where === 'belt') G.belt[f.slot] = null;
    else takeFrom(G[f.where], uid);
    return f.item;
  }
  const stashSpace = (G) => G.stashCap - G.stash.length;
  const upgradeStashCost = (G) => (G.stashCap >= 120 ? null : 200 + (G.stashCap - 40) * 25);
  function upgradeStash(G) {
    const c = upgradeStashCost(G);
    if (c == null || G.gold < c) return 'poor';
    G.gold -= c; G.stashCap += 10;
    while (G.overflow.length && G.stash.length < G.stashCap) G.stash.push(G.overflow.shift());
    return 'ok';
  }

  /* ---------- equipment ---------- */
  function slotFor(G, it, pref) {
    if (it.kind === 'trinket') return pref === 'trinket1' || pref === 'trinket2' ? pref : !G.equip.trinket1 ? 'trinket1' : !G.equip.trinket2 ? 'trinket2' : 'trinket1';
    return { sword: 'finnWeapon', finnGear: 'finnGear', knuckles: 'jakeWeapon', jakeGear: 'jakeGear' }[it.kind];
  }
  function equip(G, uid, pref) {
    const f = findAnywhere(G, uid);
    if (!f || !D.GEAR_KINDS.includes(f.item.kind) || f.where === 'equip') return 'none';
    const slot = slotFor(G, f.item, pref);
    const cur = G.equip[slot];
    if (cur && f.where !== 'stash' && stashSpace(G) <= 0) return 'full';
    removeAnywhere(G, uid);
    G.equip[slot] = f.item;
    if (cur) { if (f.where === 'stash') G.stash.push(cur); else addToStash(G, cur); }
    fixTummy(G);
    return 'ok';
  }
  function unequip(G, slot) {
    const it = G.equip[slot];
    if (!it) return 'none';
    if (stashSpace(G) <= 0) return 'full';
    G.equip[slot] = null; G.stash.push(it); fixTummy(G);
    return 'ok';
  }
  function beltAdd(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f || f.item.kind !== 'consumable' || f.where === 'belt') return 'none';
    const it = f.item;
    const same = G.belt.findIndex((b) => b && b.base === it.base && b.qty < D.STACK_MAX);
    if (same >= 0) { const m = Math.min(D.STACK_MAX - G.belt[same].qty, it.qty); G.belt[same].qty += m; it.qty -= m; if (it.qty <= 0) removeAnywhere(G, uid); return 'ok'; }
    const e = G.belt.findIndex((b) => !b);
    if (e < 0) return 'full';
    removeAnywhere(G, uid); G.belt[e] = it;
    return 'ok';
  }
  function beltRemove(G, i) { const it = G.belt[i]; if (!it) return 'none'; G.belt[i] = null; addToStash(G, it); return 'ok'; }
  function tummyAdd(G, uid) {
    if (G.tummy.length >= T_(G).tummy) return 'full';
    const f = findAnywhere(G, uid);
    if (!f || f.where === 'tummy' || f.where === 'equip' || f.where === 'belt') return 'none';
    takeFrom(G[f.where], uid); G.tummy.push(f.item);
    return 'ok';
  }
  function tummyRemove(G, uid) { const it = takeFrom(G.tummy, uid); if (!it) return 'none'; addToStash(G, it); return 'ok'; }
  function fixTummy(G) { const cap = T_(G).tummy; while (G.tummy.length > cap) addToStash(G, G.tummy.pop()); }

  /* ---------- Choose Goose's shop ---------- */
  function genMarket(G) {
    const tier = Math.max(1, M.maxTier(G));
    const L = M.loot;
    const stock = [L.makeConsumable('bacon_pancakes', 2), L.makeConsumable('candy', 1), L.makeConsumable('hot_cocoa', 1), L.rollConsumable(), L.rollConsumable(), L.makeConsumable('skeleton_key', 1)];
    const kinds = R.shuffle(['sword', 'knuckles', 'finnGear', 'jakeGear', 'trinket']);
    for (let i = 0; i < 3; i++) { const bases = Object.keys(D.BASES).filter((b) => D.BASES[b].kind === kinds[i]); stock.push(L.makeItem({ base: R.pick(bases), rarity: R.weighted([[4, 0], [4, 1], [2, 2]]), ilvl: tier })); }
    const special = L.makeItem({ base: R.pick(Object.keys(D.BASES)), rarity: 3, ilvl: tier });
    stock.push(special);
    G.market = { stock };
  }
  function refreshMarket(G) { if (G.gold < 30) return 'poor'; G.gold -= 30; genMarket(G); return 'ok'; }
  function buy(G, uid) {
    const i = G.market.stock.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    const it = G.market.stock[i];
    const price = M.loot.buyPrice(it, T_(G));
    if (G.gold < price) return 'poor';
    if (stashSpace(G) <= 0) return 'full';
    G.gold -= price; G.market.stock.splice(i, 1); addToStash(G, it);
    return 'ok';
  }
  function sell(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f || f.where === 'equip') return 0;
    const p = M.loot.sellPrice(f.item, T_(G));
    removeAnywhere(G, uid); G.gold += p;
    return p;
  }
  function sellValuables(G) {
    const T = T_(G);
    let total = 0;
    for (const list of [G.stash, G.overflow]) for (const it of list.filter((x) => x.kind === 'valuable')) { total += M.loot.sellPrice(it, T); takeFrom(list, it.uid); }
    G.gold += total;
    return total;
  }

  /* ---------- BMO's workshop ---------- */
  function salvage(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f || f.where === 'equip' || !D.GEAR_KINDS.includes(f.item.kind)) return null;
    const y = M.loot.salvageYield(f.item);
    removeAnywhere(G, uid); G.dust += y.dust; G.shards += y.shards;
    return y;
  }
  function upgradeCost(it) {
    if (!D.GEAR_KINDS.includes(it.kind) || it.upg >= 5) return null;
    return { dust: Math.round(10 * (it.upg + 1) * (1 + it.ilvl * 0.4) * (1 + it.rarity * 0.5)), shards: it.rarity >= 3 ? Math.max(it.rarity >= 4 ? 1 : 0, it.upg) : 0 };
  }
  function upgrade(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f) return 'none';
    const c = upgradeCost(f.item);
    if (!c) return 'max';
    if (G.dust < c.dust || G.shards < c.shards) return 'poor';
    G.dust -= c.dust; G.shards -= c.shards; f.item.upg += 1;
    return 'ok';
  }
  function rerollCost(it) { return D.GEAR_KINDS.includes(it.kind) && it.affixes.length ? { dust: 12 * it.ilvl, shards: it.rarity >= 4 ? 3 : 1 } : null; }
  function reroll(G, uid) {
    const f = findAnywhere(G, uid);
    if (!f) return 'none';
    const c = rerollCost(f.item);
    if (!c) return 'none';
    if (G.dust < c.dust || G.shards < c.shards) return 'poor';
    G.dust -= c.dust; G.shards -= c.shards;
    f.item.affixes = M.loot.rollAffixes(f.item.kind, f.item.affixes.length, f.item.ilvl);
    f.item.name = M.loot.nameOf(f.item);
    return 'ok';
  }

  /* ---------- skills ---------- */
  function pointsIn(G, branch) { let n = 0; for (const id in G.skills) if (D.SKILLS[id] && D.SKILLS[id].branch === branch) n += G.skills[id]; return n; }
  function skillState(G, id) {
    const n = D.SKILLS[id];
    const rank = G.skills[id] || 0;
    if (rank >= n.max) return { ok: false, reason: 'Maxed out', rank };
    const need = D.TIER_REQ[n.tier], have = pointsIn(G, n.branch);
    if (have < need) return { ok: false, reason: `Put ${need - have} more ${need - have === 1 ? 'point' : 'points'} in ${D.BRANCHES.find((b) => b.id === n.branch).name}`, rank, locked: true };
    if (n.req && !(G.skills[n.req] > 0)) return { ok: false, reason: `Needs ${D.SKILLS[n.req].name}`, rank, locked: true };
    if (G.sp < 1) return { ok: false, reason: 'No skill points', rank };
    return { ok: true, rank };
  }
  function knownAbilities(G, hero) {
    return D.SKILL_LIST.filter((n) => n.ability && G.skills[n.id] > 0).map((n) => n.ability).filter((a) => { const h = D.ABILITIES[a].hero; return h === hero || h === 'both'; });
  }
  function learn(G, id) {
    const st = skillState(G, id);
    if (!st.ok) return st.reason;
    G.skills[id] = (G.skills[id] || 0) + 1;
    G.sp -= 1;
    const n = D.SKILLS[id];
    if (n.ability && G.skills[id] === 1) {
      const h = D.ABILITIES[n.ability].hero;
      for (const hero of h === 'both' ? ['finn', 'jake'] : [h]) {
        const bar = G.bars[hero];
        const slots = M.abilitySlots(G);
        for (let i = 0; i < slots; i++) if (!bar[i]) { bar[i] = n.ability; break; }
      }
    }
    fixTummy(G);
    return 'ok';
  }
  function setBar(G, hero, slot, ab) {
    if (slot < 0 || slot >= M.abilitySlots(G)) return 'none';
    if (ab && !knownAbilities(G, hero).includes(ab)) return 'none';
    const bar = G.bars[hero];
    const ex = bar.indexOf(ab);
    if (ab && ex >= 0) bar[ex] = bar[slot];
    bar[slot] = ab || null;
    return 'ok';
  }
  const respecCost = (G) => 50 * G.level;
  function respec(G) {
    const c = respecCost(G);
    let pts = 0;
    for (const id in G.skills) pts += G.skills[id];
    if (!pts) return 'none';
    if (G.gold < c) return 'poor';
    G.gold -= c; G.sp += pts; G.skills = {}; G.bars = { finn: [null, null, null], jake: [null, null, null] };
    fixTummy(G);
    return 'ok';
  }

  /* ---------- charity & new journeys ---------- */
  const needsHandout = (G) => !G.equip.finnWeapon && !G.equip.jakeWeapon && !G.stash.some((i) => i.kind === 'sword' || i.kind === 'knuckles') && G.gold < 80;
  function handout(G) {
    if (!needsHandout(G)) return 'none';
    const t = Math.max(1, M.maxTier(G) - 1);
    G.equip.finnWeapon = M.loot.makeItem({ base: 'iron_sword', rarity: 0, ilvl: t });
    G.equip.jakeWeapon = M.loot.makeItem({ base: 'mitts', rarity: 0, ilvl: t });
    addToStash(G, M.loot.makeConsumable('bacon_pancakes', 3));
    return 'ok';
  }
  function newJourney(G, perk, keepUid) {
    const keep = keepUid ? removeAnywhere(G, keepUid) : null;
    const perks = (G.perks || []).concat(perk && D.JOURNEY_PERKS[perk] ? [perk] : []);
    const next = M.newGame({ journey: (G.journey || 0) + 1, perks, keepsake: keep });
    next.codex = G.codex;
    return next;
  }

  M.hub = { genBoard, rerollBoard, afterRaid, addToStash, findAnywhere, removeAnywhere, stashSpace, upgradeStashCost, upgradeStash, equip, unequip, beltAdd, beltRemove,
    tummyAdd, tummyRemove, fixTummy, genMarket, refreshMarket, buy, sell, sellValuables, salvage, upgradeCost, upgrade, rerollCost, reroll, pointsIn, skillState,
    knownAbilities, learn, setBar, respecCost, respec, needsHandout, handout, newJourney };
})();
