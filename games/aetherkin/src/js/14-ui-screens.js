/* ============================================================================
   SCREENS — title, camp, routes, party, shop, codex.
   ========================================================================== */
const STARTERS = ['emberkit', 'brookling', 'mosskit', 'zaplet'];

SCREENS.title = () => {
  const showcase = el('div.cols', { style: { justifyContent: 'center', gap: '6px', flexWrap: 'wrap' } },
    ['cinderfox', 'tidewarden', 'voltairn', 'bloomwisp', 'glacianth', 'voidmind'].map(id =>
      el('div.glyph-wrap', { style: { opacity: '.85' } }, glyphEl(id, 74))));
  return el('div.screen.title', null,
    el('div.rows', { style: { gap: '8px', alignItems: 'center' } },
      el('h1', null, 'Aetherkin'),
      el('div.sub', null, 'Bind · Level · Spend Motes · Choose a shape')),
    showcase,
    el('p.lede', { style: { textAlign: 'center', maxWidth: '54ch' } },
      'A creature-binding game where levelling is the whole game. Every level pays out Motes, and every kin has its own Growth Lattice — a chart of moves, passives, abilities and branching evolutions that no other species shares.'),
    el('div.cols', { style: { justifyContent: 'center' } },
      hasSave() ? el('button.btn.primary', { onclick: () => { if (loadGame()) { toast('Welcome back, ' + GAME.binder + '.'); go('camp'); } else toast('That save could not be read.', 'bad'); } }, 'Continue') : null,
      el('button.btn' + (hasSave() ? '' : '.primary'), {
        onclick: () => { if (hasSave()) modal('Start over?', el('p', null, 'This erases the saved binding on this device for good.'), [{ label: 'Keep it' }, { label: 'Start over', primary: true, run: () => { wipeSave(); go('starter'); } }]); else go('starter'); }
      }, hasSave() ? 'New binding' : 'Begin'),
      el('button.btn.ghost', { onclick: () => go('codex', { from: 'title' }) }, 'Codex')),
    el('p.muted', { style: { fontSize: '12.5px', textAlign: 'center' } }, 'Saves to this browser. Nothing leaves your device.'));
};

SCREENS.starter = () => {
  let chosen = null;
  const grid = el('div.starters');
  const confirm = el('button.btn.primary', { disabled: true, onclick: () => start() }, 'Bind it');
  const detail = el('div.panel', null, el('p.muted', { style: { margin: 0 } }, 'Four kin are willing. Read their lattices — that choice matters more than their stats.'));
  for (const id of STARTERS) {
    const sp = SPECIES[id], lat = LATTICES[sp.fam];
    const card = el('button.starter', { type: 'button', onclick: () => {
      chosen = id;
      for (const c of $$('.starter', grid)) c.setAttribute('aria-current', 'false');
      card.setAttribute('aria-current', 'true');
      confirm.disabled = false;
      confirm.textContent = 'Bind ' + sp.n;
      clearNode(detail).append(
        el('div.rows', null,
          el('div.spread', null, el('h3', null, sp.n), typeChips(sp.t)),
          el('p.muted', { style: { margin: 0, fontSize: '13.5px' } }, sp.dex),
          el('hr.rule'),
          el('div.eyebrow', null, 'Growth Lattice — ' + lat.title),
          el('p', { style: { margin: 0, fontSize: '13.5px' } }, lat.blurb),
          el('p.mono.muted', { style: { margin: 0, fontSize: '12px' } },
            lat.nodes.length + ' nodes · becomes ' + lat.nodes.filter(n => n.k === 'evolve').map(n => SPECIES[n.ref].n).join(' or '))));
    } },
      el('div.glyph-wrap', null, glyphEl(id, 104)),
      el('h3', null, sp.n), typeChips(sp.t),
      el('span.mono.muted', { style: { fontSize: '11.5px' } }, lat.title));
    grid.append(card);
  }
  function start() {
    if (!chosen) return;
    GAME.party = []; GAME.box = []; GAME.bag = {}; GAME.gold = 320; GAME.zone = 0; GAME.step = 0;
    GAME.cleared = []; GAME.seen = {}; GAME.bound = {}; GAME.wins = 0; GAME.started = true;
    addItem('bindstone', 6); addItem('salve', 4);
    const kin = makeKin(chosen, 5);
    addKin(kin);
    saveGame();
    go('camp');
    toast(SPECIES[chosen].n + ' is bound to you.', 'good');
  }
  return el('div.screen', null,
    sectionHead('First binding', 'Choose a kin', 'You will be spending Motes into this one for a long time. Every species reads a different lattice, so pick the shape of growth you want, not just the aspect.'),
    grid, detail,
    el('div.cols', null, confirm, el('button.btn.ghost', { onclick: () => go('title') }, 'Back')));
};

SCREENS.camp = () => {
  const z = ZONES[GAME.zone];
  const freeMotes = GAME.party.reduce((n, k) => n + latticeState(k).free, 0);
  return el('div.screen', null,
    sectionHead('Camp', 'The fire is lit', 'Rest is free here. What costs you is going back out.'),
    freeMotes > 0 ? el('div.panel', { style: { borderColor: 'var(--brass-deep)' } },
      el('div.spread', null,
        el('div.rows', { style: { gap: '2px' } },
          el('b', { style: { color: 'var(--brass-hi)' } }, freeMotes + ' unspent ' + plural(freeMotes, 'Mote')),
          el('span.muted', { style: { fontSize: '13px' } }, 'A Mote sitting in your pocket does nothing.')),
        el('button.btn.primary', { onclick: () => go('party') }, 'Open the lattice'))) : null,
    el('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' } },
      GAME.party.map(k => kinCard(k, { onclick: () => go('kin', { uid: k.uid }) }))),
    el('div.cols', null,
      el('button.btn.primary', { onclick: () => go('zones') }, 'Go out'),
      el('button.btn', { onclick: () => go('party') }, 'Party & Lattices'),
      el('button.btn', { onclick: () => go('shop') }, 'Quartermaster'),
      el('button.btn', { onclick: () => go('codex') }, 'Codex'),
      el('button.btn.ghost', { onclick: () => { restParty(); saveGame(); render(); toast('Every kin is mended.', 'good'); } }, 'Rest'),
      el('button.btn.ghost', { onclick: () => go('title') }, 'Title')),
    z ? el('div.panel', null,
      el('div.eyebrow', null, 'Current route'),
      el('div.spread', { style: { marginTop: '4px' } },
        el('div.rows', { style: { gap: '2px' } }, el('h3', { style: { color: z.hue } }, z.n), el('span.muted', { style: { fontSize: '13px' } }, z.blurb)),
        el('span.mono.muted', null, 'step ' + Math.min(GAME.step, z.steps) + '/' + z.steps))) : null);
};

SCREENS.zones = () => {
  const open = unlockedZones();
  return el('div.screen', null,
    sectionHead('Routes', 'Where to', 'Each route runs a set number of steps and ends at its Warden. Falling in battle sends you back to camp and resets the route.'),
    el('div.rows', null, ZONES.map((z, i) => {
      const unlocked = open.includes(z);
      const done = GAME.cleared.includes(z.id);
      return el('button.kincard', {
        disabled: !unlocked, style: { opacity: unlocked ? 1 : .4, gridTemplateColumns: '1fr' },
        onclick: () => { if (!unlocked) return; if (GAME.zone !== i) { GAME.zone = i; GAME.step = 0; } saveGame(); go('explore'); },
      }, el('div.rows', { style: { gap: '5px' } },
          el('div.spread', null,
            el('h4', { style: { color: z.hue } }, z.n),
            el('span.mono.muted', null, done ? 'cleared' : unlocked ? 'Lv ' + z.lv[0] + '–' + z.lv[1] : 'locked')),
          el('p.muted', { style: { margin: 0, fontSize: '13px' } }, unlocked ? z.blurb : 'Clear ' + ZONES[i - 1].n + ' first.'),
          el('div.chips', null, [...new Set(z.wild.flatMap(([sp]) => SPECIES[sp].t))].map(typeChip))));
    })),
    el('button.btn.ghost', { style: { alignSelf: 'flex-start' }, onclick: () => go('camp') }, 'Back to camp'));
};

SCREENS.explore = () => {
  const z = ZONES[GAME.zone];
  const feed = UI.ctx.feed || (UI.ctx.feed = []);
  const atWarden = GAME.step >= z.steps;
  const push = (text, tone) => { feed.push({ text, tone }); if (feed.length > 12) feed.shift(); };

  function press() {
    if (!partyAlive()) { toast('Your kin cannot stand. Rest at camp.', 'bad'); return; }
    const ev = exploreStep(z);
    if (ev.kind === 'wild') {
      const kin = ev.kin;
      beginBattle([kin], { wild: true, foeLabel: 'Wild kin', opening: 'A wild ' + kinName(kin) + ' steps out of cover.' },
        () => { UI.ctx = { feed }; go('explore'); });
      return;
    }
    if (ev.kind === 'warden') { challengeWarden(); return; }
    if (ev.kind === 'gold') push('You turn up ' + ev.gold + ' aur in an old cache.', 'good');
    else if (ev.kind === 'item') push('You find a ' + ITEMS[ev.item].n + '.', 'good');
    else push(pick(QUIET_LINES));
    saveGame(); render();
  }
  function patrol() {
    if (!partyAlive()) { toast('Your kin cannot stand. Rest at camp.', 'bad'); return; }
    const kin = rollEncounter(z);
    beginBattle([kin], { wild: true, foeLabel: 'Wild kin', opening: 'You double back, and a ' + kinName(kin) + ' obliges.' },
      () => { UI.ctx = { feed }; go('explore'); });
  }
  function challengeWarden() {
    const w = WARDENS[z.warden];
    modal(w.n,
      el('div.rows', null,
        el('div.eyebrow', null, w.title),
        el('p', { style: { margin: 0, fontStyle: 'italic', color: 'var(--vellum-2)' } }, w.intro),
        el('p.mono.muted', { style: { margin: 0, fontSize: '12.5px' } }, w.team.length + ' kin, levels ' + w.team[0].lv + '–' + w.team[w.team.length - 1].lv + ' · no withdrawal · stones will not bind them')),
      [{ label: 'Not yet' }, { label: 'Face them', primary: true, run: () => {
        beginBattle(wardenTeam(z.warden), { wild: false, warden: z.warden, foeLabel: w.n, opening: w.n + ' steps onto the path.' }, () => afterWarden());
      } }]);
  }
  function afterWarden() {
    const w = WARDENS[z.warden];
    if (!GAME.cleared.includes(z.id)) {
      GAME.cleared.push(z.id);
      addItem(w.prize);
      const next = ZONES[ZONES.indexOf(z) + 1];
      if (next) { GAME.zone = ZONES.indexOf(next); GAME.step = 0; }
      saveGame();
      modal(z.n + ' is yours.',
        el('div.rows', null,
          el('p', { style: { margin: 0, fontStyle: 'italic', color: 'var(--vellum-2)' } }, w.beat),
          el('p', { style: { margin: 0 } }, 'You take a ' + ITEMS[w.prize].n + ' for it.'),
          next ? el('p', { style: { margin: 0 } }, next.n + ' is open.') : el('p', { style: { margin: 0, color: 'var(--brass-hi)' } }, 'That was the last Warden on the stair. The Spire is quiet. Your kin are still growing — the lattices go to level 50.')),
        [{ label: 'Back to camp', primary: true, run: () => go('camp') }]);
    } else go('camp');
  }

  return el('div.screen', null,
    el('div.spread', null,
      sectionHead(z.n, atWarden ? 'The Warden waits' : 'On the route',
        atWarden ? z.blurb + ' The route is walked. The Warden is ahead whenever you are ready — patrol if you want more levels first.' : z.blurb),
      el('span.mono.muted', null, 'step ' + Math.min(GAME.step, z.steps) + '/' + z.steps)),
    el('div.panel', null,
      el('div.rows', { style: { gap: '6px' } },
        feed.length ? feed.slice().reverse().map(f => el('p', { style: { margin: 0, color: f.tone === 'good' ? 'var(--ok)' : 'var(--vellum-2)' } }, f.text))
          : el('p.muted', { style: { margin: 0 } }, 'The route is ahead of you. Press on.'))),
    el('div.cols', null,
      el('button.btn.primary', { onclick: press, disabled: !partyAlive() }, atWarden ? 'Face the Warden' : 'Press on'),
      atWarden ? el('button.btn', { onclick: patrol, disabled: !partyAlive() }, 'Patrol for kin') : null,
      el('button.btn', { onclick: () => go('party') }, 'Party'),
      el('button.btn.ghost', { onclick: () => go('camp') }, 'Back to camp')),
    el('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' } },
      GAME.party.map(k => kinCard(k, { onclick: () => go('kin', { uid: k.uid, back: 'explore' }) }))));
};

SCREENS.party = () => el('div.screen', null,
  sectionHead('Party', 'Your bound kin', 'Four travel with you. The rest wait at camp — swap freely, they keep everything they have learned.'),
  el('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' } },
    GAME.party.map(k => kinCard(k, { onclick: () => go('kin', { uid: k.uid }) }))),
  GAME.box.length ? el('div.rows', null,
    el('div.eyebrow', null, 'At camp'),
    el('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' } },
      GAME.box.map(k => kinCard(k, { onclick: () => go('kin', { uid: k.uid }) })))) : null,
  el('button.btn.ghost', { style: { alignSelf: 'flex-start' }, onclick: () => go('camp') }, 'Back to camp'));

SCREENS.kin = () => {
  const uid = UI.ctx.uid;
  const kin = GAME.party.concat(GAME.box).find(k => k.uid === uid);
  if (!kin) return el('div.screen', null, el('p', null, 'That kin is not here.'), el('button.btn', { onclick: () => go('party') }, 'Back'));
  const sp = SPECIES[kin.sp], st = statsFor(kin), lstate = latticeState(kin);
  const inParty = GAME.party.includes(kin);
  const body = el('div.rows');

  const paint = (focusNode) => {
    clearNode(body);
    if (UI.tab === 'lattice') {
      const view = latticeView(kin, (litId) => { UI.tab = 'lattice'; go('kin', UI.ctx); if (litId) setTimeout(() => { const b = $('.lnode[aria-current="true"]'); if (b) b.classList.add('justlit'); }, 30); });
      body.append(
        el('div.spread', null,
          el('div.eyebrow', null, kinLattice(kin).title),
          el('span.costtag', null, lstate.free + ' free · ' + lstate.spent + ' spent · ' + lstate.total + ' earned')),
        view.box, view.sheet);
      if (focusNode) view.select(focusNode);
    } else if (UI.tab === 'loadout') {
      body.append(loadoutView(kin, () => { UI.tab = 'loadout'; go('kin', UI.ctx); }));
    } else {
      body.append(
        el('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' } },
          el('div.panel', null,
            el('div.eyebrow', { style: { marginBottom: '8px' } }, 'Stats at level ' + kin.lv),
            statBlock(kin),
            el('hr.rule'),
            el('div.statrow', null, el('em', null, 'HP'), el('span.mono', null, kin.hp + ' / ' + st.hp), el('b', null, '')),
            el('div.statrow', null, el('em', null, 'RES'), el('span.mono', null, resonance(kin) + '% resonance'), el('b', null, ''))),
          el('div.panel', null,
            el('div.eyebrow', { style: { marginBottom: '8px' } }, 'Carrying'),
            el('div.rows', { style: { gap: '6px' } },
              el('p.mono', { style: { margin: 0, fontSize: '12.5px' } }, kin.moves.map(m => MOVES[m].n).join(' · ')),
              kin.abil.length ? el('p.mono', { style: { margin: 0, fontSize: '12.5px', color: '#4FA8DE' } }, kin.abil.map(a => ABILITIES[a].n).join(' · ')) : null,
              kin.pass.length ? el('p.mono', { style: { margin: 0, fontSize: '12.5px', color: '#9B77D6' } }, kin.pass.map(p => PASSIVES[p].n).join(' · ')) : null,
              el('p.muted', { style: { margin: '4px 0 0', fontSize: '13px' } }, sp.dex)))),
        el('div.cols', null,
          el('button.btn', { onclick: () => {
            const input = el('input', { value: kinName(kin), maxlength: 18, style: { width: '100%', padding: '8px 10px', background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--vellum)', borderRadius: '2px', font: 'inherit' } });
            modal('Name this kin', el('div.rows', null, el('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Leave it blank to go back to ' + sp.n + '.'), input),
              [{ label: 'Cancel' }, { label: 'Set name', primary: true, run: () => { kin.nick = input.value.trim() || null; saveGame(); go('kin', UI.ctx); } }]);
          } }, 'Rename'),
          inParty && GAME.party.length > 1 ? el('button.btn', { onclick: () => { GAME.party.splice(GAME.party.indexOf(kin), 1); GAME.box.push(kin); saveGame(); go('party'); toast(kinName(kin) + ' waits at camp.'); } }, 'Leave at camp')
            : (!inParty ? el('button.btn', { disabled: GAME.party.length >= 4, onclick: () => { GAME.box.splice(GAME.box.indexOf(kin), 1); GAME.party.push(kin); saveGame(); go('party'); toast(kinName(kin) + ' joins the party.'); } }, GAME.party.length >= 4 ? 'Party is full' : 'Take along') : null),
          el('button.btn.danger.ghost', { onclick: () => {
            const cost = 200 + 40 * kin.lv;
            modal('Reforge ' + kinName(kin) + '?',
              el('div.rows', null,
                el('p', { style: { margin: 0 } }, 'Every Mote comes back and the whole lattice goes dark. If it has evolved it returns to its first shape, so the other branch opens again.'),
                el('p.mono', { style: { margin: 0, color: 'var(--brass-hi)' } }, 'Costs ' + cost.toLocaleString() + ' aur. You have ' + GAME.gold.toLocaleString() + '.')),
              [{ label: 'Leave it' }, { label: 'Reforge', primary: true, run: () => {
                if (GAME.gold < cost) { toast('Not enough aur.', 'bad'); return; }
                GAME.gold -= cost; reforge(kin); saveGame(); UI.tab = 'lattice'; go('kin', UI.ctx); toast('The lattice is dark again.', 'good');
              } }]);
          } }, 'Reforge')));
    }
  };

  const tabs = el('div.tabs', { style: { padding: 0, background: 'transparent', borderBottom: 'var(--edge)' } },
    [['overview', 'Overview'], ['lattice', 'Lattice'], ['loadout', 'Loadout']].map(([id, label]) =>
      el('button.tab', { role: 'tab', 'aria-selected': UI.tab === id ? 'true' : 'false', onclick: () => { UI.tab = id; go('kin', UI.ctx); } },
        label + (id === 'lattice' && lstate.free > 0 ? ' · ' + lstate.free : ''))));

  paint();
  return el('div.screen', null,
    el('div.spread', null,
      el('div.cols', { style: { alignItems: 'center', gap: '14px' } },
        el('div.glyph-wrap.float', null, glyphEl(kin.sp, 96)),
        el('div.rows', { style: { gap: '4px' } },
          el('div.cols', { style: { alignItems: 'baseline', gap: '9px' } }, el('h2', { style: { fontSize: '25px' } }, kinName(kin)), el('span.lv', null, 'Lv ' + kin.lv)),
          el('div.cols', { style: { alignItems: 'center', gap: '8px' } }, typeChips(sp.t), kin.nick ? el('span.muted', { style: { fontSize: '12.5px' } }, sp.n) : null),
          el('div', { style: { width: '190px' } }, el('div.bar.xp', null, el('i', { style: { width: (xpProgress(kin) * 100) + '%' } }))),
          el('span.mono.muted', { style: { fontSize: '11.5px' } }, kin.lv >= LV_CAP ? 'at the cap' : (totalXpFor(kin.lv + 1) - kin.xp).toLocaleString() + ' xp to level ' + (kin.lv + 1)))),
      el('button.btn.ghost', { onclick: () => go(UI.ctx.back || 'party') }, 'Back')),
    tabs, body);
};

SCREENS.shop = () => {
  const rows = SHOP_STOCK.map(id => {
    const it = ITEMS[id];
    return el('div.itemrow', null,
      el('div.rows', { style: { gap: '2px' } },
        el('div.cols', { style: { gap: '8px', alignItems: 'baseline' } }, el('b', null, it.n), el('span.mono.muted', { style: { fontSize: '11.5px' } }, 'held ' + bagCount(id))),
        el('span.muted', { style: { fontSize: '13px' } }, it.d)),
      el('div.cols', { style: { alignItems: 'center', gap: '8px' } },
        el('span.mono', { style: { color: 'var(--brass-hi)' } }, it.cost.toLocaleString()),
        el('button.btn.small', { disabled: GAME.gold < it.cost, onclick: () => {
          if (GAME.gold < it.cost) return;
          GAME.gold -= it.cost;
          if (it.kind === 'mote') { pickMoteTarget(); return; }
          addItem(id); saveGame(); render(); toast(it.n + ' bought.', 'good');
        } }, 'Buy')));
  });
  function pickMoteTarget() {
    modal('Give the Mote Shard to which kin?',
      el('div.rows', null, GAME.party.concat(GAME.box).map(k =>
        el('button.movebtn', { style: { borderLeftColor: typeHue(SPECIES[k.sp].t[0]) }, onclick: () => {
          closeModal(); k.bonusMotes = (k.bonusMotes || 0) + 1; saveGame(); render();
          toast(kinName(k) + ' gains a permanent Mote.', 'good');
        } }, el('b', null, kinName(k)), el('span.meta', null, 'Lv ' + k.lv, latticeState(k).free + ' free')))),
      [{ label: 'Cancel', run: () => { GAME.gold += ITEMS.mote_shard.cost; render(); } }]);
  }
  return el('div.screen', null,
    el('div.spread', null,
      sectionHead('Quartermaster', 'Stones, salves, and one luxury', 'Mote Shards are the only thing here that changes a lattice. They are priced accordingly.'),
      el('span.mono', { style: { color: 'var(--brass-hi)' } }, GAME.gold.toLocaleString() + ' aur')),
    el('div.panel', null, rows),
    el('button.btn.ghost', { style: { alignSelf: 'flex-start' }, onclick: () => go('camp') }, 'Back to camp'));
};

SCREENS.codex = () => {
  const cells = SPECIES_IDS.map(id => {
    const sp = SPECIES[id], seen = GAME.seen[id] || GAME.bound[id];
    return el('button.dexcell' + (seen ? '' : '.unknown'), { onclick: () => seen ? showDex(id) : toast('Not yet encountered.', 'bad') },
      el('div.glyph-wrap', null, glyphEl(id, 78, seen ? {} : { silhouette: true })),
      el('b', { style: { fontSize: '13.5px' } }, seen ? sp.n : '— — —'),
      seen ? typeChips(sp.t) : el('span.muted', { style: { fontSize: '11px' } }, 'unrecorded'));
  });
  function showDex(id) {
    const sp = SPECIES[id], lat = LATTICES[sp.fam];
    modal(sp.n,
      el('div.rows', null,
        el('div.cols', { style: { alignItems: 'center', gap: '16px' } },
          el('div.glyph-wrap', null, glyphEl(id, 118)),
          el('div.rows', { style: { gap: '6px' } }, typeChips(sp.t),
            el('span.mono.muted', { style: { fontSize: '12px' } }, 'Stat total ' + bst(sp) + (sp.from ? ' · from ' + SPECIES[sp.from].n : '') + (sp.solo ? ' · never changes shape' : '')))),
        el('p', { style: { margin: 0, color: 'var(--vellum-2)' } }, sp.dex),
        el('hr.rule'),
        el('div.eyebrow', null, 'Reads the lattice — ' + lat.title),
        el('p', { style: { margin: 0, fontSize: '13.5px' } }, lat.blurb),
        el('div.statgrid', { style: { marginTop: '6px' } }, STATS.map(k =>
          el('div.statrow', null, el('em', null, STAT_SHORT[k]),
            el('div.bar', null, el('i', { style: { width: (sp.base[k] / 112 * 100) + '%', background: typeHue(sp.t[0]) } })),
            el('b', null, sp.base[k]))))),
      [{ label: 'Close' }]);
  }
  const known = SPECIES_IDS.filter(id => GAME.seen[id] || GAME.bound[id]).length;
  return el('div.screen', null,
    el('div.spread', null,
      sectionHead('Codex', 'Kin recorded', 'Twenty-eight shapes across twelve lattices. Evolutions only appear once you have seen one.'),
      el('span.mono.muted', null, known + '/' + SPECIES_IDS.length)),
    el('div.dexgrid', null, cells),
    el('button.btn.ghost', { style: { alignSelf: 'flex-start' }, onclick: () => go(GAME.started ? 'camp' : 'title') }, 'Back'));
};
