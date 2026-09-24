/* Skill tree rules: buying nodes (one at a time or a whole path) and extra ranks of small nodes, level
   requirements, refunding (one rank at a time; a node only if the rest of your tree stays connected),
   and full respecs. Each hero has their own tree and points. A node you own is stored as its rank. */
(function () {
  'use strict';
  const D = DT.data;
  const M = DT.meta;
  const TR = {};

  const tree = (heroId) => D.TREES[heroId];
  const owned = (G, heroId) => G.chars[heroId].tree;
  const abilityNodeOf = (heroId, ab) => tree(heroId).list.find((n) => n.type === 'ability' && n.ability === ab);
  const rankOf = (own, id) => (own[id] === true ? 1 : +own[id] || 0);
  TR.rank = (G, heroId, id) => rankOf(owned(G, heroId), id);
  /* the level a rank needs: the node's level, +2 for each rank after the first */
  TR.reqFor = (n, rank) => (n.req || 1) + Math.max(0, rank - 1) * 2;

  /* A mod node needs its ability node. */
  function requirement(heroId, n) {
    if (n.type !== 'mod' || !n.abMods) return null;
    const ab = Object.keys(n.abMods)[0];
    const an = abilityNodeOf(heroId, ab);
    return an ? an.id : null;
  }
  function adjacent(G, heroId, id) { const own = owned(G, heroId); return tree(heroId).nodes[id].links.some((l) => own[l]); }

  TR.state = function (G, heroId, id) {
    const n = tree(heroId).nodes[id];
    const C = G.chars[heroId];
    const own = C.tree;
    const rank = rankOf(own, id), max = n.maxRank || 1;
    if (n.type === 'start') return { owned: true, ok: false, rank: 1, max: 1, reason: 'Starting point' };
    if (rank) {
      if (rank >= max) return { owned: true, ok: false, rank, max, reason: max > 1 ? `Maxed out (rank ${rank}/${max})` : 'Unlocked' };
      const need = TR.reqFor(n, rank + 1);
      if (C.level < need) return { owned: true, ok: false, rank, max, levelLock: need, reason: `Rank ${rank + 1} needs level ${need}` };
      if (C.sp < 1) return { owned: true, ok: false, rank, max, reason: 'No skill points' };
      return { owned: true, ok: true, rank, max, rankUp: true };
    }
    const req = requirement(heroId, n);
    if (req && !own[req]) return { owned: false, ok: false, rank, max, adjacent: adjacent(G, heroId, id), reason: `Needs ${tree(heroId).nodes[req].name} first`, req };
    if (!adjacent(G, heroId, id)) return { owned: false, ok: false, rank, max, adjacent: false, reason: 'Not connected yet', levelLock: C.level < (n.req || 1) ? n.req : null };
    if (C.level < (n.req || 1)) return { owned: false, ok: false, rank, max, adjacent: true, levelLock: n.req, reason: `Needs level ${n.req}` };
    if (C.sp < 1) return { owned: false, ok: false, rank, max, adjacent: true, reason: 'No skill points' };
    return { owned: false, ok: true, rank, max, adjacent: true };
  };

  /* Cheapest chain of locked nodes from what you own to `id` (inclusive). */
  TR.pathTo = function (G, heroId, id) {
    const T = tree(heroId), own = owned(G, heroId);
    if (own[id]) return [];
    const prev = {}, queue = [];
    for (const k in own) if (own[k]) { prev[k] = null; queue.push(k); }
    while (queue.length) {
      const cur = queue.shift();
      if (cur === id) break;
      for (const nb of T.nodes[cur].links) if (!(nb in prev)) { prev[nb] = cur; queue.push(nb); }
    }
    if (!(id in prev)) return null;
    const path = [];
    for (let c = id; c && !own[c]; c = prev[c]) path.unshift(c);
    return path;
  };
  /* Is it legal to buy this whole path in order? */
  TR.pathState = function (G, heroId, id) {
    const path = TR.pathTo(G, heroId, id);
    if (!path || !path.length) return { path: path || [], ok: false };
    const own = Object.assign({}, owned(G, heroId));
    const lvl = G.chars[heroId].level;
    for (const nid of path) {
      const n = tree(heroId).nodes[nid];
      const req = requirement(heroId, n);
      if (req && !own[req]) return { path, ok: false, reason: `Needs ${tree(heroId).nodes[req].name}` };
      if (lvl < (n.req || 1)) return { path, ok: false, reason: `${n.name} needs level ${n.req}` };
      own[nid] = 1;
    }
    const sp = G.chars[heroId].sp;
    return { path, cost: path.length, ok: sp >= path.length, reason: sp >= path.length ? null : `Needs ${path.length} points (you have ${sp})` };
  };

  function onGained(G, heroId, n) {
    if (n.type === 'ability') M.hub.autoBind(G, heroId, n.ability);
  }
  TR.allocate = function (G, heroId, id) {
    const st = TR.state(G, heroId, id);
    if (!st.ok) return st.reason;
    const C = G.chars[heroId];
    C.tree[id] = rankOf(C.tree, id) + 1;
    C.sp -= 1;
    onGained(G, heroId, tree(heroId).nodes[id]);
    M.hub.fixChar(G, heroId);
    return 'ok';
  };
  TR.allocatePath = function (G, heroId, id) {
    const ps = TR.pathState(G, heroId, id);
    if (!ps.ok) return ps.reason || 'Can’t reach that node';
    for (const nid of ps.path) { const r = TR.allocate(G, heroId, nid); if (r !== 'ok') return r; }
    return 'ok';
  };

  /* ---------- refunds ---------- */
  TR.refundCost = (G, heroId) => 10 + 4 * G.chars[heroId].level;
  TR.respecCost = (G, heroId) => 30 * G.chars[heroId].level;
  TR.spent = (G, heroId) => { const own = owned(G, heroId); let n = 0; for (const k in own) if (tree(heroId).nodes[k] && tree(heroId).nodes[k].type !== 'start') n += rankOf(own, k); return n; };
  TR.canRefund = function (G, heroId, id) {
    const T = tree(heroId), own = owned(G, heroId), n = T.nodes[id];
    if (!own[id]) return 'You don’t have it';
    if (n.type === 'start') return 'That’s where you start';
    if (rankOf(own, id) > 1) return G.gold < TR.refundCost(G, heroId) ? 'Not enough gold' : null;
    if (n.type === 'ability' && T.list.some((m) => own[m.id] && requirement(heroId, m) === id)) return 'Refund its upgrades first';
    /* everything left must still connect to the start node */
    const rest = Object.keys(own).filter((k) => own[k] && k !== id);
    const seen = new Set([T.start]);
    const stack = [T.start];
    while (stack.length) { const c = stack.pop(); for (const nb of T.nodes[c].links) if (nb !== id && own[nb] && !seen.has(nb)) { seen.add(nb); stack.push(nb); } }
    if (rest.some((k) => !seen.has(k))) return 'Other nodes depend on it';
    if (G.gold < TR.refundCost(G, heroId)) return 'Not enough gold';
    return null;
  };
  TR.refund = function (G, heroId, id) {
    const why = TR.canRefund(G, heroId, id);
    if (why) return why;
    G.gold -= TR.refundCost(G, heroId);
    const own = G.chars[heroId].tree, rank = rankOf(own, id);
    if (rank > 1) own[id] = rank - 1; else delete own[id];
    G.chars[heroId].sp += 1;
    M.hub.fixChar(G, heroId);
    return 'ok';
  };
  TR.respec = function (G, heroId) {
    const n = TR.spent(G, heroId);
    if (!n) return 'none';
    if (G.gold < TR.respecCost(G, heroId)) return 'poor';
    G.gold -= TR.respecCost(G, heroId);
    const C = G.chars[heroId];
    C.tree = { [tree(heroId).start]: true };
    C.sp += n;
    M.hub.fixChar(G, heroId);
    return 'ok';
  };

  M.tree = TR;
})();
