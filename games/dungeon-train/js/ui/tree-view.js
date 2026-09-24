/* The skill tree screen: a big node web you can pan (drag) and zoom (mouse wheel). Click a node to see
   what it does; unlock it (or the whole path to it) with skill points; right-click to refund. */
(function () {
  'use strict';
  const D = DT.data;
  const U = DT.U;
  const M = DT.meta;
  const UI = DT.ui;
  const esc = U.esc;
  const icon = DT.icon;
  const TV = {};
  const PX = 58;
  const views = {};
  const st = { sel: {}, q: '', hoverPath: null };
  TV.state = st;

  const SIZE = { start: 34, minor: 12, notable: 18, ability: 25, mod: 16, keystone: 29, slot: 20 };
  /* The data lays branches out from the top; turning it 30° makes it wider than tall, which fits a PC screen. */
  const ROT = Math.PI / 6, CR = Math.cos(ROT), SR = Math.sin(ROT);
  const px = (n) => [+((n.x * CR - n.y * SR) * PX).toFixed(1), +((n.x * SR + n.y * CR) * PX).toFixed(1)];
  const iconAt = (name, cx, cy, size, cls) => icon(name).replace('<svg class="ico"', `<svg class="ico${cls ? ' ' + cls : ''}" x="${(cx - size / 2).toFixed(1)}" y="${(cy - size / 2).toFixed(1)}" width="${size}" height="${size}"`);
  function poly(n, r, cx, cy, rot) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (rot || 0) + (i / n) * Math.PI * 2; pts.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1)); }
    return pts.join(' ');
  }
  function shape(n, x, y) {
    const r = SIZE[n.type] || 10;
    switch (n.type) {
      case 'ability': return `<polygon class="nshape" points="${poly(6, r, x, y, Math.PI / 6)}"/>`;
      case 'mod': return `<polygon class="nshape" points="${poly(4, r, x, y, 0)}"/>`;
      case 'keystone': return `<polygon class="nshape" points="${poly(8, r, x, y, Math.PI / 8)}"/>`;
      case 'slot': return `<rect class="nshape" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="4"/>`;
      default: return `<circle class="nshape" cx="${x}" cy="${y}" r="${r}"/>${n.type === 'notable' ? `<circle class="nring" cx="${x}" cy="${y}" r="${r + 4}"/>` : ''}`;
    }
  }
  function nodeIcon(h, n) {
    if (n.type === 'ability') return D.ABILITIES[n.ability].icon;
    if (n.type === 'mod') return D.ABILITIES[Object.keys(n.abMods)[0]].icon;
    if (n.type === 'keystone') return 'star';
    if (n.type === 'slot') return 'relic';
    if (n.type === 'start') return h === 'finn' ? 'sword' : 'fist';
    return null;
  }

  function svg(G, h) {
    const T = D.TREES[h];
    const own = G.chars[h].tree;
    const sel = st.sel[h];
    const states = {};
    for (const n of T.list) states[n.id] = M.tree.state(G, h, n.id);
    let links = '', nodes = '', labels = '';
    const done = new Set();
    for (const n of T.list) for (const l of n.links) {
      const key = n.id < l ? n.id + '|' + l : l + '|' + n.id;
      if (done.has(key)) continue;
      done.add(key);
      const m = T.nodes[l];
      const a = own[n.id], b = own[l];
      const cls = a && b ? 'own' : a || b ? 'edge' : 'off';
      const color = a && b ? (n.type === 'start' ? m.color : m.type === 'start' ? n.color : n.branch === 'bridge' ? m.color : n.color) : '';
      const [x1, y1] = px(n), [x2, y2] = px(m);
      links += `<line class="lk ${cls}" data-a="${n.id}" data-b="${l}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${color ? ` style="stroke:${color}"` : ''}/>`;
    }
    for (const n of T.list) {
      const [x, y] = px(n);
      const s = states[n.id];
      const cls = ['node', 't-' + n.type, s.owned ? 'own' : s.ok ? 'ok' : s.adjacent ? 'adj' : 'far'];
      if (s.levelLock && !s.owned) cls.push('lvl');
      if (s.rankUp) cls.push('more');
      if (sel === n.id) cls.push('sel');
      if (st.q && matches(n, st.q)) cls.push('match');
      const ic = nodeIcon(h, n);
      const R = SIZE[n.type] || 10;
      /* small nodes that can be bought more than once show their rank; nodes you can't reach yet by
         level show the level they need */
      const badge = n.maxRank > 1 && (s.owned || s.adjacent) ? `<text class="nrank" x="${x}" y="${y + 4}" text-anchor="middle">${s.rank || 0}/${n.maxRank}</text>` : '';
      const lvl = !s.owned && n.req > 1 && G.chars[h].level < n.req ? `<text class="nlvl" x="${x + R * 0.8}" y="${y - R * 0.8}" text-anchor="middle">${n.req}</text>` : '';
      nodes += `<g class="${cls.join(' ')}" data-node="${n.id}" data-tip="node" style="--c:${n.color}">${shape(n, x, y)}${ic ? iconAt(ic, x, y, Math.round(R * 1.05)) : ''}${badge}${lvl}</g>`;
      if (n.type !== 'minor') labels += `<text class="nlabel${s.owned ? ' own' : ''}${n.type === 'notable' || n.type === 'mod' || n.type === 'slot' ? ' small' : ''}" x="${x}" y="${y + (SIZE[n.type] || 10) + 17}" text-anchor="middle">${esc(n.name)}</text>`;
    }
    let brs = '';
    for (const b of T.branches) {
      const a = (b.angle * Math.PI) / 180 + ROT, R = 8.6 * 1.3 * PX;
      const c = Math.cos(a);
      const side = c > 0.5 ? 'start' : c < -0.5 ? 'end' : 'middle';
      const x = c * R + (side === 'start' ? -30 : side === 'end' ? 30 : 0), y = Math.sin(a) * R;
      const ix = side === 'start' ? x + 16 : side === 'end' ? x - 16 : x;
      const owned = T.list.filter((n) => n.branch === b.id && own[n.id]).length, total = T.list.filter((n) => n.branch === b.id).length;
      brs += `<g class="brlabel" style="--c:${b.color}" data-act="tree-branch" data-branch="${b.id}">${iconAt(b.icon, ix, y - 18, 32)}<text x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" text-anchor="${side}">${esc(b.name.toUpperCase())}</text><text class="brcount" x="${x.toFixed(1)}" y="${(y + 38).toFixed(1)}" text-anchor="${side}">${owned}/${total}</text></g>`;
    }
    return `<svg id="sk-svg" class="sk-svg" role="img" aria-label="${esc(D.HEROES[h].name)}’s skill tree"><defs><radialGradient id="sk-glow"><stop offset="0" stop-color="#ffffff" stop-opacity=".12"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><g id="sk-view"><circle cx="0" cy="0" r="${9.5 * 1.3 * PX}" fill="url(#sk-glow)"/>${[2, 4, 6].map((r) => `<circle class="ringguide" cx="0" cy="0" r="${r * 1.3 * PX}"/>`).join('')}${links}${nodes}${labels}${brs}</g></svg>`;
  }
  const matches = (n, q) => { q = q.toLowerCase(); return n.name.toLowerCase().includes(q) || UI.nodeDesc(n).toLowerCase().includes(q) || (n.type === 'ability' && D.ABILITIES[n.ability].desc.toLowerCase().includes(q)); };

  function detail(G, h) {
    const T = D.TREES[h];
    const C = G.chars[h];
    const id = st.sel[h];
    const n = id && T.nodes[id];
    if (!n) {
      let x = `<header class="p-head"><h3>${icon('tree')} ${esc(D.HEROES[h].name)}’s skill tree</h3></header><p class="sk-intro">${h === 'finn' ? 'Finn’s tree is smaller: he gets most of his power from gear. It makes his armor, sets and Powers even better.' : 'Jake’s tree is huge and powerful: this is where Jake gets strong. He earns a bonus point every 4 levels.'}</p>`;
      x += `<ul class="sk-rules"><li>${icon('plus')} Each node costs 1 skill point. You get points when you level up (2 every 5th level).</li><li>${icon('arrowUp')} A node must connect to one you already have.</li><li>${icon('lock')} The farther out a node is, the higher the level it needs (the little number on it). Small nodes get stronger the farther out they are.</li><li>${icon('refresh')} Small nodes near the middle can be bought up to 3 times (each rank adds its bonus again), so early points spent close to home pay off.</li><li>${icon('bolt')} <b>Hexagons</b> unlock abilities. <b>Diamonds</b> upgrade them.</li><li>${icon('star')} <b>Octagons</b> are keystones: huge, but with a catch.</li><li>${icon('refresh')} Right-click an owned node to refund it (one rank at a time).</li></ul>`;
      x += '<div class="sk-branches">' + T.branches.map((b) => { const owned = T.list.filter((m) => m.branch === b.id && C.tree[m.id]).length, total = T.list.filter((m) => m.branch === b.id).length; return `<button class="brcard" style="--c:${b.color}" data-act="tree-branch" data-branch="${b.id}">${icon(b.icon)}<div><b>${esc(b.name)}</b><small>${esc(b.blurb)}</small>${UI.bar(owned, total)}</div></button>`; }).join('') + '</div>';
      return x;
    }
    const s = M.tree.state(G, h, id);
    let x = UI.nodeCard(G, h, n, { state: false });
    x += '<div class="sk-actions">';
    if (s.owned) {
      if (n.type !== 'start') {
        const why = M.tree.canRefund(G, h, id);
        x += `<p class="sk-state good">${icon('check')} ${s.max > 1 ? `Rank ${s.rank} of ${s.max}.` : 'You have this.'}</p>`;
        if (s.rankUp) x += `<button class="btn primary big" data-act="tree-buy" data-node="${id}">${icon('arrowUp')} Rank ${s.rank + 1} · 1 point</button>`;
        else if (s.rank < s.max) x += `<p class="sk-state">${icon('lock')} ${esc(s.reason)}</p>`;
        x += `<button class="btn ghost" data-act="tree-refund" data-node="${id}" ${why ? 'disabled' : ''} title="${esc(why || '')}">${icon('refresh')} ${s.rank > 1 ? 'Refund a rank' : 'Refund'} · ${icon('coin')}${M.tree.refundCost(G, h)}</button>${why ? `<small class="muted">${esc(why)}</small>` : ''}`;
      }
    } else if (s.ok) x += `<button class="btn primary big" data-act="tree-buy" data-node="${id}">${icon('unlock')} Unlock · 1 point</button>`;
    else {
      const ps = M.tree.pathState(G, h, id);
      if (!s.adjacent && ps.path && ps.path.length) {
        x += `<p class="sk-state">${icon('info')} Not connected yet. The shortest path needs <b>${ps.path.length} points</b>.</p><button class="btn ${ps.ok ? 'primary' : 'ghost'}" data-act="tree-path" data-node="${id}" ${ps.ok ? '' : 'disabled'}>${icon('unlock')} Unlock path · ${ps.path.length} points</button>${ps.ok ? '' : `<small class="muted">${esc(ps.reason || '')}</small>`}`;
      } else x += `<p class="sk-state bad">${icon('lock')} ${esc(s.reason)}</p>`;
    }
    x += `<button class="btn ghost small" data-act="tree-desel">${icon('x')} Close</button></div>`;
    return x;
  }

  TV.render = function (G, h) {
    const C = G.chars[h];
    const T = D.TREES[h];
    const spent = M.tree.spent(G, h);
    let x = `<div class="skills" data-hero="${h}"><header class="sk-head panel">`;
    x += `<div class="sk-pts${C.sp ? ' has' : ''}"><b>${C.sp}</b><span>skill point${C.sp === 1 ? '' : 's'}<small>${spent} spent · level ${C.level}</small></span></div>`;
    x += `<label class="search">${icon('search')}<input type="search" id="tree-search" placeholder="Find a node (try “freeze”)" value="${esc(st.q)}" aria-label="Search the skill tree"></label>`;
    x += `<div class="sk-legend">${[['minor', 'Small bonus'], ['notable', 'Notable'], ['ability', 'Ability'], ['mod', 'Upgrade'], ['keystone', 'Keystone']].map(([t, l]) => `<span class="lg t-${t}"><i></i>${l}</span>`).join('')}</div>`;
    x += `<div class="sk-tools"><button class="btn small ghost icon-only" data-act="tree-zoom" data-z="1.25" aria-label="Zoom in">${icon('plus')}</button><button class="btn small ghost icon-only" data-act="tree-zoom" data-z="0.8" aria-label="Zoom out">${icon('minus')}</button><button class="btn small ghost" data-act="tree-fit">${icon('target')} Fit</button><button class="btn small ghost" data-act="tree-respec" ${spent ? '' : 'disabled'}>${icon('refresh')} Reset all · ${icon('coin')}${U.fmt(M.tree.respecCost(G, h))}</button></div></header>`;
    x += `<div class="sk-body"><div class="sk-canvas" id="sk-canvas">${svg(G, h)}<div class="sk-hint">${icon('mouse')} Drag to move · Wheel to zoom · Click a node</div></div><aside class="panel sk-detail" id="sk-detail">${detail(G, h)}</aside></div></div>`;
    return x;
  };

  /* ---------- pan & zoom ---------- */
  function apply(h) {
    const g = document.getElementById('sk-view');
    const v = views[h];
    if (g && v) { g.setAttribute('transform', `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${v.k.toFixed(3)})`); g.ownerSVGElement.classList.toggle('z2', v.k >= 0.85); }
  }
  function fit(h) {
    const c = document.getElementById('sk-canvas');
    if (!c) return;
    const T = D.TREES[h];
    const xs = T.list.map((n) => px(n)[0]), ys = T.list.map((n) => px(n)[1]);
    const pad = 95;
    let minX = Math.min(...xs) - pad * 1.9, maxX = Math.max(...xs) + pad * 1.9, minY = Math.min(...ys) - pad * 1.25, maxY = Math.max(...ys) + pad * 1.25;
    /* the branch names sit outside the last ring: keep them in view too */
    for (const b of T.branches) {
      const a = (b.angle * Math.PI) / 180 + ROT, R = 8.6 * 1.3 * PX;
      const by = Math.sin(a) * R;
      minY = Math.min(minY, by - 44); maxY = Math.max(maxY, by + 84);
    }
    const w = c.clientWidth || 800, hh = c.clientHeight || 600;
    const k = Math.min(w / (maxX - minX), hh / (maxY - minY), 1.4);
    views[h] = { k, x: w / 2 - k * (minX + maxX) / 2, y: hh / 2 - k * (minY + maxY) / 2 };
    apply(h);
  }
  TV.fit = fit;
  TV.zoom = function (h, f, cx, cy) {
    const c = document.getElementById('sk-canvas');
    const v = views[h];
    if (!c || !v) return;
    if (cx == null) { cx = c.clientWidth / 2; cy = c.clientHeight / 2; }
    const k = U.clamp(v.k * f, 0.25, 2.6);
    v.x = cx - (cx - v.x) * (k / v.k);
    v.y = cy - (cy - v.y) * (k / v.k);
    v.k = k;
    apply(h);
  };
  TV.centerOn = function (h, id, zoom) {
    const c = document.getElementById('sk-canvas');
    const n = D.TREES[h].nodes[id];
    if (!c || !n) return;
    if (!views[h]) fit(h);
    const v = views[h];
    if (zoom) v.k = Math.max(v.k, zoom);
    const [nx, ny] = px(n);
    v.x = c.clientWidth / 2 - nx * v.k;
    v.y = c.clientHeight / 2 - ny * v.k;
    apply(h);
  };
  TV.centerBranch = function (h, bid) {
    const T = D.TREES[h];
    const ns = T.list.filter((n) => n.branch === bid);
    if (!ns.length) return;
    const c = document.getElementById('sk-canvas');
    const v = views[h] || (fit(h), views[h]);
    const mx = U.sum(ns, (n) => px(n)[0]) / ns.length, my = U.sum(ns, (n) => px(n)[1]) / ns.length;
    v.k = Math.max(v.k, 0.9);
    v.x = c.clientWidth / 2 - mx * v.k;
    v.y = c.clientHeight / 2 - my * v.k;
    apply(h);
  };

  /* Wire up pan/zoom and path highlighting after the tree is drawn. */
  TV.mount = function (G, h, onNode) {
    const c = document.getElementById('sk-canvas');
    if (!c) return;
    if (!views[h]) fit(h); else apply(h);
    let drag = null;
    c.addEventListener('wheel', (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); TV.zoom(h, e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, vx: views[h].x, vy: views[h].y, moved: false, node: e.target.closest('.node') };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; c.classList.add('panning'); UI.tipHide(); }
      if (drag.moved) { views[h].x = drag.vx + dx; views[h].y = drag.vy + dy; apply(h); }
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      c.classList.remove('panning');
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!d.moved && d.node && onNode) onNode(d.node.dataset.node, e);
      else if (!d.moved && !d.node && onNode) onNode(null, e);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => { drag = null; c.classList.remove('panning'); });
    c.addEventListener('dblclick', (e) => { const n = e.target.closest('.node'); if (n && onNode) onNode(n.dataset.node, e, true); });
    c.addEventListener('mouseover', (e) => { const n = e.target.closest('.node'); highlightPath(G, h, n ? n.dataset.node : null); });
    c.addEventListener('mouseleave', () => highlightPath(G, h, null));
  };
  function highlightPath(G, h, id) {
    document.querySelectorAll('#sk-svg .onpath').forEach((n) => n.classList.remove('onpath'));
    if (!id || G.chars[h].tree[id]) return;
    const path = M.tree.pathTo(G, h, id);
    if (!path || path.length < 2) return;
    const set = new Set(path);
    for (const pid of path) { const el = document.querySelector(`#sk-svg .node[data-node="${pid}"]`); if (el) el.classList.add('onpath'); }
    document.querySelectorAll('#sk-svg .lk').forEach((l) => { const a = l.dataset.a, b = l.dataset.b; if ((set.has(a) || G.chars[h].tree[a]) && (set.has(b) || G.chars[h].tree[b]) && (set.has(a) || set.has(b))) l.classList.add('onpath'); });
  }
  TV.search = function (q) {
    st.q = q;
    const h = DT.app.hero();
    const T = D.TREES[h];
    let first = null;
    document.querySelectorAll('#sk-svg .node').forEach((el) => { const m = !!q && matches(T.nodes[el.dataset.node], q); el.classList.toggle('match', m); if (m && !first) first = el.dataset.node; });
    return first;
  };
  /* Tooltip text for hovering a node. */
  TV.tip = function (G, h, id) {
    const n = D.TREES[h].nodes[id];
    if (!n) return '';
    let x = UI.nodeCard(G, h, n);
    const s = M.tree.state(G, h, id);
    if (!s.owned && !s.adjacent) { const ps = M.tree.pathState(G, h, id); if (ps.path && ps.path.length) x += `<p class="tip-foot">${icon('info')} ${ps.path.length} points to get here (highlighted). Click it, then “Unlock path”.</p>`; }
    return x;
  };
  TV.detail = detail;

  DT.ui.tree = TV;
})();
