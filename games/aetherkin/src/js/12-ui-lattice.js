/* ============================================================================
   THE GROWTH LATTICE, drawn as a constellation chart.
   ========================================================================== */
const COL_W = 96, ROW_H = 102, PAD_X = 54, PAD_Y = 58, GUTTER = 126;

function latticeView(kin, rerender) {
  const lat = kinLattice(kin), fam = SPECIES[kin.sp].fam;
  const cs = lat.nodes.map(n => n.c);
  const minC = Math.min(...cs), maxC = Math.max(...cs);
  const rows = Math.max(...lat.nodes.map(n => n.r)) + 1;
  const W = (maxC - minC) * COL_W + PAD_X * 2 + GUTTER * 2;
  const H = (rows - 1) * ROW_H + PAD_Y * 2;
  const at = n => ({ x: GUTTER + PAD_X + (n.c - minC) * COL_W, y: PAD_Y + n.r * ROW_H });

  const state = latticeState(kin);
  const stateOf = n => {
    if (state.owned.has(n.id)) return 'owned';
    const c = canBuy(kin, n.id);
    if (c.ok) return 'open';
    if (c.sealed) return 'sealed';
    if (c.poor) return 'short';
    if (c.early) return 'early';
    return 'locked';
  };

  const field = el('div.latticefield', { style: { width: W + 'px', height: H + 'px' } });

  /* connectors */
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const n of lat.nodes) {
    const a = at(n);
    for (const rid of (n.req || [])) {
      const p = lat.nodes.find(x => x.id === rid);
      if (!p) continue;
      const b = at(p);
      const line = document.createElementNS(NS, 'path');
      const midY = (a.y + b.y) / 2;
      line.setAttribute('d', `M${b.x} ${b.y} C ${b.x} ${midY}, ${a.x} ${midY}, ${a.x} ${a.y}`);
      line.setAttribute('fill', 'none');
      const st = stateOf(n), parentOwned = state.owned.has(rid);
      if (st === 'owned') { line.setAttribute('stroke', nodeHue(kin, n)); line.setAttribute('stroke-width', '2'); line.setAttribute('opacity', '.6'); }
      else if (parentOwned && st === 'open') { line.setAttribute('stroke', '#D9A441'); line.setAttribute('stroke-width', '1.6'); line.setAttribute('stroke-dasharray', '4 4'); line.setAttribute('opacity', '.75'); }
      else if (st === 'sealed') { line.setAttribute('stroke', '#2C3450'); line.setAttribute('stroke-width', '1'); line.setAttribute('opacity', '.35'); }
      else { line.setAttribute('stroke', '#2C3450'); line.setAttribute('stroke-width', '1.2'); }
      svg.append(line);
    }
  }
  field.append(svg);

  /* ring labels */
  for (let r = 0; r < rows; r++) {
    const cost = nodeCost(fam, { r }), lv = nodeLevel(fam, { r });
    field.append(el('div.ringlabel', { style: { top: (PAD_Y + r * ROW_H) + 'px', width: (GUTTER - 22) + 'px' } },
      el('b', null, r === 0 ? 'Root' : 'Ring ' + r),
      el('span', null, r === 0 ? 'free' : 'Lv ' + lv + ' · ' + cost + ' motes')));
  }

  /* nodes */
  const sheet = el('div.panel.nodesheet');
  let selected = null;
  const buttons = {};
  for (const n of lat.nodes) {
    const p = at(n);
    const st = stateOf(n);
    const hue = nodeHue(kin, n);
    const extra = n.k === 'evolve' ? '.evo' : (n.r >= (lat.solo ? 4 : 5) ? '.cap' : '');
    const btn = el('button.lnode' + extra, {
      type: 'button', 'data-state': st, title: nodeLabel(n),
      'aria-label': nodeLabel(n) + ' — ' + (st === 'owned' ? 'lit' : st),
      style: { left: p.x + 'px', top: p.y + 'px',
        borderColor: st === 'owned' ? hue : undefined,
        background: st === 'owned' ? 'color-mix(in srgb, ' + hue + ' 24%, var(--ink-2))' : undefined,
        boxShadow: st === 'owned' ? '0 0 14px -2px ' + hue : undefined },
      onclick: () => select(n),
    }, nodeSigil(n.k, st === 'owned' ? hue : 'currentColor'));
    buttons[n.id] = btn;
    field.append(btn);
  }

  function select(n) {
    selected = n;
    for (const id in buttons) buttons[id].setAttribute('aria-current', id === n.id ? 'true' : 'false');
    paintSheet();
  }
  function paintSheet() {
    clearNode(sheet);
    if (!selected) {
      sheet.append(
        el('div.eyebrow', null, lat.title),
        el('p.lede', { style: { margin: '6px 0 0' } }, lat.blurb),
        el('p.muted', { style: { margin: '10px 0 0', fontSize: '13px' } },
          'Pick any node on the chart to read it. Rings open as the kin levels; the two diamonds are evolutions, and taking one closes the other for good.'));
      return;
    }
    const n = selected, st = stateOf(n), c = canBuy(kin, n.id);
    const kindWord = { core: 'Root', move: 'Move', passive: 'Passive', ability: 'Ability', stat: 'Growth', evolve: 'Evolution' }[n.k];
    const cost = nodeCost(fam, n);
    const extras = [];
    if (n.k === 'move' && MOVES[n.ref]) extras.push(el('div.cols', { style: { gap: '7px', alignItems: 'center' } }, typeChip(MOVES[n.ref].t), el('span.mono.muted', { style: { fontSize: '11.5px' } }, moveMeta(MOVES[n.ref]))));
    if (n.k === 'core' && MOVES[n.ref]) extras.push(el('div.cols', { style: { gap: '7px', alignItems: 'center' } }, typeChip(MOVES[n.ref].t), el('span.mono.muted', { style: { fontSize: '11.5px' } }, moveMeta(MOVES[n.ref]))));
    if (n.k === 'ability') extras.push(el('span.mono.muted', { style: { fontSize: '11.5px' } }, 'Costs ' + ABILITIES[n.ref].cost + ' Focus · ' + ABILITIES[n.ref].cd + '-turn cooldown'));
    if (n.k === 'evolve') { const s2 = SPECIES[n.ref]; extras.push(el('div.cols', { style: { gap: '7px', alignItems: 'center' } }, typeChips(s2.t), el('span.mono.muted', { style: { fontSize: '11.5px' } }, 'Stat total ' + bst(s2)))); }

    sheet.append(
      el('div.spread', null,
        el('div.rows', { style: { gap: '3px' } },
          el('div.eyebrow', null, kindWord + (n.r === 0 ? '' : ' · Ring ' + n.r)),
          el('h3', { style: { fontSize: '19px' } }, nodeLabel(n))),
        el('span.costtag', null, st === 'owned' ? 'Lit' : cost + ' ' + plural(cost, 'Mote'))),
      extras,
      el('p', { style: { margin: '2px 0', color: 'var(--vellum-2)' } }, nodeBlurb(n)),
      st === 'owned'
        ? el('p.muted.why', { style: { margin: 0 } }, 'Already part of this kin.')
        : c.ok
          ? el('button.btn.primary', { style: { alignSelf: 'flex-start' }, onclick: () => light(n) }, 'Light it — ' + cost + ' ' + plural(cost, 'Mote'))
          : el('p.why', { style: { margin: 0, color: c.sealed ? 'var(--crit)' : 'var(--vellum-3)' } }, c.why));
  }
  function light(n) {
    if (n.k === 'evolve') {
      const s2 = SPECIES[n.ref];
      const other = lat.nodes.find(x => x.k === 'evolve' && x.id !== n.id);
      modal('Take a new shape?',
        el('div.rows', null,
          el('div.cols', { style: { alignItems: 'center', gap: '16px' } },
            el('div.glyph-wrap', null, glyphEl(n.ref, 108)),
            el('div.rows', { style: { gap: '6px' } }, el('h3', null, s2.n), typeChips(s2.t), el('p.muted', { style: { margin: 0, fontSize: '13px' } }, s2.dex))),
          el('p', { style: { margin: 0 } }, kinName(kin) + ' becomes ' + s2.n + ', gains a third passive slot, and opens the ' + (s2.branch === 'A' ? 'left' : 'right') + ' limb of the lattice.'),
          other ? el('p', { style: { margin: 0, color: 'var(--crit)' } }, 'This closes ' + nodeLabel(other) + ' and everything below it. There is no way back except a full Reforge.') : null),
        [{ label: 'Not yet' }, { label: 'Become ' + s2.n, primary: true, run: () => commit(n) }]);
      return;
    }
    commit(n);
  }
  function commit(n) {
    const res = buyNode(kin, n.id);
    if (!res.ok) { toast(res.why || 'Cannot light that node.', 'bad'); return; }
    for (const ev of res.events) {
      if (ev.kind === 'evolve') toast(kinName(kin) + ' is now ' + SPECIES[ev.ref].n + '.', 'good');
      else if (ev.kind === 'move') toast('Learned ' + MOVES[ev.ref].n + '.', 'good');
      else if (ev.kind === 'ability') toast('Learned ' + ABILITIES[ev.ref].n + '.', 'good');
      else if (ev.kind === 'passive') toast('Gained ' + PASSIVES[ev.ref].n + '.', 'good');
      else if (ev.kind === 'stat') toast(ev.ref + ' takes hold.', 'good');
    }
    saveGame();
    rerender(n.id);
  }

  const box = el('div.latticebox', { style: { maxHeight: 'min(68vh, 600px)' } }, field);
  requestAnimationFrame(() => { box.scrollLeft = Math.max(0, (W - box.clientWidth) / 2); box.scrollTop = 0; });
  /* drag to pan */
  let drag = null;
  box.addEventListener('pointerdown', e => {
    if (e.target.closest('.lnode')) return;
    drag = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop };
    box.setPointerCapture(e.pointerId); box.style.cursor = 'grabbing';
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return;
    box.scrollLeft = drag.l - (e.clientX - drag.x);
    box.scrollTop = drag.t - (e.clientY - drag.y);
  });
  const stop = () => { drag = null; box.style.cursor = ''; };
  box.addEventListener('pointerup', stop); box.addEventListener('pointercancel', stop);

  paintSheet();
  return { box, sheet, select, buttons };
}

/* ---------------- loadout editor ---------------------------------------- */
function loadoutView(kin, rerender) {
  const pool = loadoutOf(kin);
  const wrap = el('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'start' } });

  const group = (title, note, items, kind, equipped, cap) => {
    const rows = items.map(ref => {
      const on = equipped.includes(ref);
      const info = kind === 'move' ? MOVES[ref] : kind === 'ability' ? ABILITIES[ref] : PASSIVES[ref];
      if (!info) return null;
      return el('div.slotrow' + (on ? '.on' : ''), null,
        el('div.rows', { style: { gap: '2px' } },
          el('div.cols', { style: { gap: '7px', alignItems: 'center' } },
            el('b.slottitle', { style: { fontSize: '13.5px' } }, info.n),
            kind === 'move' ? typeChip(info.t) : null,
            kind === 'ability' ? el('span.mono.muted', { style: { fontSize: '10.5px' } }, info.cost + ' Focus') : null),
          el('span.muted', { style: { fontSize: '12px', lineHeight: 1.4 } }, kind === 'move' ? moveMeta(info) : info.d)),
        el('button.btn.small' + (on ? '' : '.ghost'), {
          onclick: () => {
            if (!equip(kin, kind, ref)) { toast(on ? 'A kin must keep at least one move.' : 'No free slot — take something out first.', 'bad'); return; }
            saveGame(); rerender();
          }
        }, on ? 'Remove' : 'Equip'));
    }).filter(Boolean);
    return el('div.rows', null,
      el('div.spread', null, el('div.eyebrow', null, title), el('span.mono.muted', { style: { fontSize: '11px' } }, equipped.length + '/' + cap)),
      note ? el('p.muted', { style: { margin: '0 0 2px', fontSize: '12.5px' } }, note) : null,
      rows.length ? rows : el('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Nothing learned yet. Light nodes on the lattice.'));
  };

  wrap.append(
    group('Moves', 'Four slots. Universal moves are always available.', pool.moves, 'move', kin.moves, MOVE_SLOTS),
    group('Abilities', 'Two slots. Using one takes the turn and spends Focus.', pool.abil, 'ability', kin.abil, ABIL_SLOTS),
    group('Passives', 'Always on — but the lattice will always teach more than a kin can wear.', pool.pass, 'passive', kin.pass, passiveSlots(kin)));
  return wrap;
}
