/* Boot, screens (title / Tree Fort hub / trip), the render loop, actions, drag and drop, tooltips,
   right-click menus, and the two 3D backdrops: the Tree Fort and the loadout "showroom". */
(function () {
  'use strict';
  const D = DT.data;
  const U = DT.U;
  const M = DT.meta;
  const GF = DT.game.gfx;
  const MD = DT.game.models;
  const IN = DT.game.input;
  const UI = DT.ui;
  const LO = UI.loadout;
  const TV = UI.tree;
  const HV = UI.hub;
  const HUD = UI.hud;
  const store = DT.store;
  const $ = (id) => document.getElementById(id);
  let G = null;
  let screen = 'title';
  let tab = 'board';
  let glOk = false;
  let last = 0;

  const save = () => { if (G) store.save(G); };
  const toast = (m, k) => UI.toast(m, k);
  const hero = () => (G ? G.active : 'finn');
  DT.app = { get G() { return G; }, hero, render: () => render(), save, toast, get screen() { return screen; }, get tab() { return tab; } };

  /* ---------- 3D backdrops ---------- */
  const B3 = { fort: null, fortSig: '', show: null, showSig: '', showHero: null, t: 0, yaw: 0, spinDrag: null, mode: null, rect: null };
  const sigOf = (h) => Object.entries(G ? G.chars[h].equip : {}).map(([k, it]) => (it ? it.uid + '.' + it.upg : '-')).join(',');
  function buildFort() {
    if (B3.fort) GF.scene.remove(B3.fort);
    const g = new THREE.Group();
    g.add(MD.treeFort());
    const finn = MD.finn(G ? G.chars.finn.equip : {});
    const jake = MD.jake(G ? G.chars.jake.equip : {});
    finn.position.set(-1.35, 0, 5.3); finn.rotation.y = 0.3;
    jake.position.set(1.45, 0, 5.4); jake.rotation.y = -0.3;
    const ring = new THREE.Mesh(GF.geo('ring', 0.75, 0.95, 40), GF.basic('#ffe27a', { opacity: 0.8, add: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    g.add(finn, jake, ring);
    g.userData = { finn, jake, ring, clouds: [] };
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) c.add(GF.part(GF.geo('sphere', 1 + (k % 2) * 0.5, 14, 10), '#ffffff', [k * 1.3, (k % 2) * 0.4, 0], { ink: false }));
      c.position.set(-36 + i * 13, 13 + (i % 3) * 3, -20 - (i % 2) * 8);
      g.add(c);
      g.userData.clouds.push(c);
    }
    B3.fort = g;
    B3.fortSig = G ? sigOf('finn') + '|' + sigOf('jake') : '';
  }
  function buildShow(h) {
    if (B3.show) GF.scene.remove(B3.show);
    const H = D.HEROES[h];
    const g = new THREE.Group();
    const base = GF.part(GF.geo('cyl', 1.25, 1.35, 0.22, 48), '#1b2438', [0, -0.11, 0], { ink: false });
    const rim = new THREE.Mesh(GF.geo('torus', 1.28, 0.035, 64), GF.basic(H.color, { add: true }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.01;
    const glow = new THREE.Mesh(GF.geo('circle', 1.2, 48), GF.basic(H.color, { opacity: 0.12, add: true }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.012;
    const back = new THREE.Mesh(GF.geo('circle', 3.2, 48), GF.basic(H.color, { opacity: 0.07, add: true }));
    back.position.set(0, 1.3, -2.2);
    const model = MD.hero(h, G.chars[h].equip);
    g.add(base, rim, glow, back, model);
    g.userData = { model, rim };
    B3.show = g;
    B3.showHero = h;
    B3.showSig = sigOf(h);
  }
  function want3d() {
    if (!glOk) return null;
    if (screen === 'title') return 'title';
    if (screen === 'hub' && tab === 'board') return 'fort';
    if (screen === 'hub' && tab === 'loadout') return 'show';
    return null;
  }
  function setup3d() {
    const mode = want3d();
    if (!glOk) return;
    if (B3.fort && (mode === 'show' || !mode)) GF.scene.remove(B3.fort);
    if (B3.show && mode !== 'show') GF.scene.remove(B3.show);
    if (mode === 'title' || mode === 'fort') {
      if (!B3.fort || (G && B3.fortSig !== sigOf('finn') + '|' + sigOf('jake'))) buildFort();
      GF.scene.add(B3.fort);
      GF.scene.background = new THREE.Color('#9fdcff');
      GF.setMood({ light: 1, fog: ['#bfe8ff', 40, 120], sun: [-6, 14, 10] });
    } else if (mode === 'show') {
      if (!B3.show || B3.showHero !== hero() || B3.showSig !== sigOf(hero())) buildShow(hero());
      GF.scene.add(B3.show);
      GF.scene.background = new THREE.Color('#10172a');
      GF.setMood({ light: 1.05, fog: null, sun: [-5, 12, 10] });
    }
    B3.mode = mode;
    measure();
  }
  function measure() {
    const el = B3.mode === 'show' ? $('lo-model') : B3.mode === 'fort' ? document.querySelector('.board-stage') : null;
    B3.rect = el ? el.getBoundingClientRect() : null;
  }
  window.addEventListener('resize', () => setTimeout(measure, 30));
  /* Center the 3D picture on a part of the screen (the loadout's middle column, the board's stage). */
  function aimView() {
    const W = window.innerWidth, H = window.innerHeight;
    const r = B3.rect;
    if (!r || !r.width) { GF.camera.clearViewOffset(); return; }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    GF.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
  }
  function update3d(dt) {
    B3.t += dt;
    const t = B3.t, cam = GF.camera;
    if (B3.mode === 'show' && B3.show) {
      const u = B3.show.userData, m = u.model, p = m.userData.parts;
      m.rotation.y = B3.yaw + (B3.spinDrag ? 0 : Math.sin(t * 0.5) * 0.35);
      const h = B3.showHero;
      if (h === 'finn') { p.swingL.rotation.x = Math.sin(t * 1.6) * 0.12; p.swingR.rotation.x = -0.35 + Math.sin(t * 1.6 + 1) * 0.08; p.head.rotation.y = Math.sin(t * 0.7) * 0.15; }
      else { p.body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.05; p.body.scale.set(1 + Math.sin(t * 2.2) * 0.02, 1 - Math.sin(t * 2.2) * 0.02, 1); }
      u.rim.material.opacity = 0.7 + Math.sin(t * 2) * 0.2;
      const r = B3.rect;
      const tall = r ? r.height / window.innerHeight : 0.5;
      const dist = 3.1 / Math.max(0.35, tall) * 0.62 + 1.6;
      cam.position.set(0, 1.25, dist);
      cam.lookAt(0, 0.95, 0);
      aimView();
    } else if ((B3.mode === 'fort' || B3.mode === 'title') && B3.fort) {
      const u = B3.fort.userData;
      const sway = Math.sin(t * 0.15) * 2.2;
      if (B3.mode === 'title') { cam.position.set(sway, 7.8, 22); cam.lookAt(0, 5.4, 0); GF.camera.clearViewOffset(); }
      else { cam.position.set(-1.5 + sway * 0.6, 3.6, 13.5); cam.lookAt(0, 2.6, 3); aimView(); }
      u.finn.position.y = Math.abs(Math.sin(t * 2.2)) * 0.1;
      u.jake.position.y = Math.abs(Math.sin(t * 2.2 + 1.2)) * 0.08;
      const fp = u.finn.userData.parts;
      fp.swingR.rotation.x = -0.6 + Math.sin(t * 3) * 0.2;
      const act = G ? G.active : null;
      const who = act === 'jake' ? u.jake : u.finn;
      u.ring.visible = !!act;
      u.ring.position.x = who.position.x; u.ring.position.z = who.position.z;
      u.ring.scale.setScalar(act === 'jake' ? 1.2 : 1);
      u.ring.material.opacity = 0.6 + Math.sin(t * 3) * 0.25;
      for (const c of u.clouds) { c.position.x += dt * 0.8; if (c.position.x > 44) c.position.x = -44; }
    }
    GF.updateFx(dt);
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    try {
      if (screen === 'raid') { DT.game.raid.update(dt); GF.render(); }
      else if (B3.mode) { update3d(dt); GF.render(); }
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }

  /* ---------- rendering the menus ---------- */
  function page() {
    switch (tab) {
      case 'loadout': return LO.render(G, hero());
      case 'skills': return TV.render(G, hero());
      case 'shop': return HV.shop(G);
      case 'workshop': return HV.workshop(G);
      case 'journal': return HV.journal(G);
      default: return HV.board(G);
    }
  }
  function render() {
    const appEl = $('app');
    document.body.dataset.screen = screen;
    document.body.dataset.tab = tab;
    UI.tipHide();
    UI.menuClose();
    if (screen === 'raid') { appEl.hidden = true; appEl.innerHTML = ''; return; }
    appEl.hidden = false;
    const keep = {};
    appEl.querySelectorAll('[data-keep-scroll]').forEach((el) => { keep[el.dataset.keepScroll] = el.scrollTop; });
    const ae = document.activeElement;
    const focus = ae && ae.id && appEl.contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
    appEl.innerHTML = screen === 'title' ? HV.title(!!store.load(), glOk) : HV.topbar(G, tab) + `<main class="page page-${tab}" data-hero="${hero()}">${page()}</main>`;
    appEl.querySelectorAll('[data-keep-scroll]').forEach((el) => { const v = keep[el.dataset.keepScroll]; if (v) el.scrollTop = v; });
    if (focus) { const el = $(focus.id); if (el) { el.focus(); try { el.setSelectionRange(focus.s, focus.e); } catch (e) { /* not a text field */ } } }
    if (screen === 'hub' && tab === 'skills') TV.mount(G, hero(), onTreeNode);
    fillPortraits(appEl);
    setup3d();
  }
  /* Bestiary portraits are drawn on demand (a few per frame) and cached. */
  function fillPortraits(root) {
    const imgs = [...root.querySelectorAll('img.bp[data-enemy]:not([src])')];
    if (!imgs.length || !glOk) return;
    let i = 0;
    const step = () => {
      for (let n = 0; n < 4 && i < imgs.length; n++, i++) {
        const img = imgs[i], id = img.dataset.enemy, def = D.ENEMIES[id];
        if (!def || !img.isConnected) continue;
        const url = GF.portrait('enemy:' + id, () => MD.enemy(def), { yaw: def.boss ? 0.35 : 0.5 });
        if (url) img.src = url;
      }
      if (i < imgs.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- trips ---------- */
  function startTrip(offerId) {
    if (!glOk) { toast('3D graphics aren’t available in this browser, so the train can’t leave.', 'bad'); return; }
    const offer = G.board.find((o) => o.id === offerId);
    if (!offer) return;
    const lock = M.lineLock(G, M.lineById(offer.line), hero());
    if (lock) { toast(lock, 'bad'); return; }
    DT.sfx.unlock();
    save();
    UI.closeModal();
    if (B3.fort) GF.scene.remove(B3.fort);
    if (B3.show) GF.scene.remove(B3.show);
    B3.mode = null;
    GF.camera.clearViewOffset();
    screen = 'raid';
    render();
    const first = G.stats.trips === 0;
    const r = DT.game.raid.start(G, offerId, hero(), { onEnd: onTripEnd });
    if (!r) { screen = 'hub'; render(); toast('The train wouldn’t start. Try again.', 'bad'); return; }
    IN.requestLock();
    if (first) setTimeout(() => HUD.note('WASD move · mouse aims · hold left click to attack · Space dodges · 1–4 abilities · hold E to open chests and doors', 9), 2600);
  }
  function onTripEnd(result) {
    screen = 'hub';
    tab = 'board';
    LO.state.sel = null;
    /* never leave a hero without a weapon: Choose Goose hands over a basic one */
    for (const h of D.HERO_IDS) if (M.hub.needsHandout(G, h) && M.hub.handout(G, h) === 'ok') setTimeout(() => toast(`Choose Goose felt sorry for ${D.HEROES[h].name} and handed over a basic ${h === 'finn' ? 'sword' : 'viola'} (and some pancakes).`, 'good'), 900);
    save();
    render();
    UI.openModal(result.ending ? HV.ending() : HV.result(G), 'wide');
    DT.sfx.play(result.outcome === 'escaped' ? 'extract' : 'ko');
  }

  /* ---------- finding items anywhere (for tooltips) ---------- */
  function findItem(uid) {
    const r = DT.game.raid.current();
    if (r) { const it = r.backpack.find((i) => i.uid === uid); if (it) return it; }
    if (!G) return null;
    const f = M.hub.find(G, uid);
    if (f) return f.item;
    const m = G.market.stock.find((i) => i.uid === uid);
    if (m) return m;
    const lr = G.lastResult;
    if (lr) for (const k of ['items', 'lost', 'safe']) { const it = (lr[k] || []).find((i) => i.uid === uid); if (it) return it; }
    return null;
  }

  /* ---------- actions ---------- */
  const result = (res, okMsg, o) => {
    o = o || {};
    if (res === 'ok') { if (okMsg) toast(okMsg, 'good'); if (o.sfx !== false) DT.sfx.play(o.sfx || 'equip'); return true; }
    const msg = { poor: 'Not enough gold.', none: null, max: 'Already maxed out.', full: 'No room for that.' }[res];
    if (msg === undefined) toast(res, 'bad'); else if (msg) toast(msg, 'bad');
    DT.sfx.play('error');
    return false;
  };
  function sellItem(uid) {
    const it = findItem(uid);
    if (!it) return;
    const doIt = () => { const p = M.hub.sell(G, uid); if (p) { toast(`Sold ${it.name} for ${U.fmt(p)} gold.`, 'good'); DT.sfx.play('coin'); } if (LO.state.sel === uid) LO.state.sel = null; save(); render(); };
    if (M.loot.isGear(it) && it.rarity >= 2) UI.confirm('Sell this?', `Sell <b class="rc r${it.rarity}">${U.esc(it.name)}</b> for ${U.fmt(M.loot.sellPrice(it, M.stats.compute(G, hero())))} gold? You can’t buy it back.`, 'Sell', doIt);
    else doIt();
  }
  function salvageItem(uid) {
    const it = findItem(uid);
    if (!it) return;
    const y = M.loot.salvageYield(it);
    UI.confirm('Salvage this?', `BMO will break <b class="rc r${it.rarity}">${U.esc(it.name)}</b> down into ${y.dust} magic dust${y.shards ? ` and ${y.shards} crystal shards` : ''}. It’s gone for good.`, 'Salvage', () => {
      const r = M.hub.salvage(G, uid);
      if (r) { toast(`Salvaged: +${r.dust} dust${r.shards ? `, +${r.shards} shards` : ''}.`, 'good'); DT.sfx.play('break'); }
      if (LO.state.sel === uid) LO.state.sel = null;
      if (HV.state.benchSel === uid) HV.state.benchSel = null;
      save(); render();
    }, { danger: true });
  }
  function abilityMenu(el) {
    const i = +el.dataset.idx;
    const S = M.stats.compute(G, hero());
    const r = el.getBoundingClientRect();
    const items = S.abilities.map((a) => ({ act: 'bind', label: D.ABILITIES[a.id].name, note: a.src === 'item' ? 'from ' + a.itemName : 'skill', icon: D.ABILITIES[a.id].icon, data: { ab: a.id, idx: i } }));
    if (!items.length) items.push({ act: 'tab', label: 'Learn abilities in Skills', icon: 'tree', data: { tab: 'skills' } });
    if (G.chars[hero()].bars[i]) items.push({ sep: true }, { act: 'unbind', label: 'Clear this key', icon: 'x', data: { idx: i } });
    UI.menuOpen(r.left, r.bottom + 6, items);
  }
  function onTreeNode(id, ev, dbl) {
    const h = hero();
    TV.state.sel[h] = id;
    document.querySelectorAll('#sk-svg .node.sel').forEach((n) => n.classList.remove('sel'));
    if (id) { const el = document.querySelector(`#sk-svg .node[data-node="${id}"]`); if (el) el.classList.add('sel'); }
    if (dbl && id) { const s = M.tree.state(G, h, id); if (s.ok) { ACT['tree-buy']({ dataset: { node: id } }); return; } }
    const box = $('sk-detail');
    if (box) box.innerHTML = TV.detail(G, h);
    DT.sfx.play('click');
  }

  const ACT = {
    /* title & save */
    continue() { const s = store.load(); const g = s ? M.migrate(s) : null; if (!g) { toast('That save is from an older version and can’t be loaded. Start a new game!', 'bad'); return; } G = g; screen = 'hub'; tab = 'board'; DT.sfx.unlock(); },
    'new-game'() {
      const go = () => { G = M.newGame(); screen = 'hub'; tab = 'board'; save(); DT.sfx.unlock(); UI.closeModal(); render(); toast('Adventure time! Check your Loadout, then pick a train.', 'good'); };
      if (store.load()) UI.confirm('Start a new game?', 'This deletes your current save (both heroes, the stash, everything).', 'Start over', go, { danger: true });
      else go();
      return 'keep';
    },
    'import-open'() { UI.openModal(HV.importBox()); return 'keep'; },
    import() { try { const g = M.migrate(store.importCode($('import-box').value)); if (!g) throw new Error('That save can’t be loaded.'); G = g; screen = 'hub'; tab = 'board'; UI.closeModal(); save(); toast('Save loaded!', 'good'); } catch (e) { toast(e.message || 'That code didn’t work.', 'bad'); return 'keep'; } },
    export() { const box = $('export-box'); box.hidden = false; box.value = store.exportCode(G); box.select(); const done = () => toast('Save code copied!', 'good'); try { if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(done, () => toast('Select the code and copy it.', '')); else { document.execCommand('copy'); done(); } } catch (e) { /* ignore */ } return 'keep'; },
    reset() { UI.confirm('Delete your save?', 'Everything is gone for good: both heroes, the stash, trophies.', 'Delete', () => { store.clear(); G = null; screen = 'title'; B3.fort = null; render(); }, { danger: true }); return 'keep'; },
    settings() { UI.openModal(HV.settings(), 'wide'); return 'keep'; },
    'modal-close'() { UI.closeModal(); return 'keep'; },
    'modal-close-back'(el, ev) { if (ev.target === el) UI.closeModal(); return 'keep'; },
    'confirm-yes'() { UI.runConfirm(); return 'keep'; },
    'goto-loadout'() { UI.closeModal(); tab = 'loadout'; },
    /* navigation */
    tab(el) { tab = el.dataset.tab; UI.closeModal(); if (tab === 'skills') setTimeout(() => { const n = TV.state.sel[hero()]; if (n) TV.centerOn(hero(), n); }, 0); },
    hero(el) { G.active = el.dataset.hero; LO.state.sel = null; },
    /* board */
    line(el) { HV.state.line = el.dataset.offer; },
    'reroll-board'() { result(M.hub.rerollBoard(G), 'New trips on the board!', { sfx: 'coin' }); },
    board(el) {
      const h = hero(), C = G.chars[h];
      const wslot = D.HEROES[h].slots[0].id;
      if (!C.equip[wslot]) { UI.confirm('No weapon!', `${U.esc(D.HEROES[h].name)} has nothing in the ${U.esc(D.HEROES[h].slots[0].label)} slot. Board anyway?`, 'Board anyway', () => startTrip(el.dataset.offer)); return 'keep'; }
      startTrip(el.dataset.offer);
      return 'keep';
    },
    /* loadout */
    sel(el) {
      const uid = LO.state.sel === el.dataset.uid ? null : el.dataset.uid;
      const it = uid && findItem(uid);
      if (it && it.isNew) { it.isNew = false; save(); }
      if (tab === 'loadout' && LO.select(G, hero(), uid)) return 'keep';
      LO.state.sel = uid;
    },
    desel() { LO.state.sel = null; },
    equip(el) { const h = hero(); const uid = el.dataset.uid; const it = findItem(uid); if (result(M.hub.equip(G, h, uid, el.dataset.slot), null)) { const g = it && M.loot.effects(it).grants; toast(g ? `Equipped! ${D.ABILITIES[g].name} is on your ability keys.` : 'Equipped!', 'good'); } },
    'equip-other'(el) { const o = hero() === 'finn' ? 'jake' : 'finn'; result(M.hub.equip(G, o, el.dataset.uid), `Given to ${D.HEROES[o].name}.`); },
    unequip(el) { const h = el.dataset.hero || hero(); result(M.hub.unequip(G, h, el.dataset.slot), 'Back in the stash.'); },
    belt(el) { result(M.hub.beltAdd(G, hero(), el.dataset.uid, el.dataset.idx != null ? +el.dataset.idx : null), 'On the snack belt.'); },
    'belt-remove'(el) { result(M.hub.beltRemove(G, el.dataset.hero || hero(), +el.dataset.idx), null); },
    safe(el) { result(M.hub.safeAdd(G, hero(), el.dataset.uid), `In the ${D.HEROES[hero()].safeName}. It’s safe even if you’re knocked out.`); },
    'safe-remove'(el) { result(M.hub.safeRemove(G, el.dataset.hero || hero(), el.dataset.uid), null); },
    sell(el) { sellItem(el.dataset.uid); return 'keep'; },
    salvage(el) { salvageItem(el.dataset.uid); return 'keep'; },
    workshop(el) { HV.state.benchSel = el.dataset.uid; tab = 'workshop'; },
    filter(el) { LO.state.filter = el.dataset.f; },
    rtab(el) { LO.state.rtab = el.dataset.tab; },
    stab(el) { LO.state.stab = el.dataset.tab; const box = $('lo-stats'); if (box) { box.dataset.preview = 'x'; box.innerHTML = LO.statsBody(G, hero(), null); } return 'norender'; },
    bind(el) { result(M.hub.setBar(G, hero(), +el.dataset.idx, el.dataset.ab), null, { sfx: 'click' }); },
    unbind(el) { M.hub.setBar(G, hero(), +el.dataset.idx, null); },
    'ab-slot'(el) { abilityMenu(el); return 'keep'; },
    'goto-node'(el) { const h = hero(); TV.state.sel[h] = el.dataset.node; tab = 'skills'; setTimeout(() => TV.centerOn(h, el.dataset.node, 1), 0); },
    'upgrade-stash'() { result(M.hub.upgradeStash(G), 'Your stash got 10 slots bigger!', { sfx: 'coin' }); },
    'sell-treasure'() { const t = M.hub.sellValuables(G); if (t) { toast(`Sold all treasure for ${U.fmt(t)} gold.`, 'good'); DT.sfx.play('coin'); } },
    'pull-overflow'() { let n = 0; while (G.overflow.length && G.stash.length < G.stashCap) { G.stash.push(G.overflow.shift()); n++; } toast(n ? `Moved ${n} into the stash.` : 'The stash is still full.', n ? 'good' : 'bad'); },
    'spin-model'() { return 'keep'; },
    /* skills */
    'tree-buy'(el) { const h = hero(), id = el.dataset.node; const r = M.tree.allocate(G, h, id); if (r === 'ok') { const n = D.TREES[h].nodes[id]; DT.sfx.play('levelup'); toast(n.type === 'ability' ? `Learned ${n.name}! It’s on your ability keys.` : `Unlocked ${n.name}.`, 'good'); } else toast(r, 'bad'); },
    'tree-path'(el) { const h = hero(); const r = M.tree.allocatePath(G, h, el.dataset.node); if (r === 'ok') { DT.sfx.play('levelup'); toast('Path unlocked!', 'good'); } else toast(r, 'bad'); },
    'tree-refund'(el) { const h = hero(), id = el.dataset.node; UI.confirm('Refund this node?', `Get 1 skill point back for ${U.fmt(M.tree.refundCost(G, h))} gold.`, 'Refund', () => { const r = M.tree.refund(G, h, id); if (r === 'ok') toast('Refunded.', 'good'); else toast(r, 'bad'); save(); render(); }); return 'keep'; },
    'tree-respec'() { const h = hero(); UI.confirm('Reset the whole tree?', `Every point ${U.esc(D.HEROES[h].name)} spent comes back, for ${U.fmt(M.tree.respecCost(G, h))} gold.`, 'Reset tree', () => { const r = M.tree.respec(G, h); if (r === 'ok') toast('Tree reset. Spend your points again!', 'good'); else toast(r === 'poor' ? 'Not enough gold.' : 'Nothing to reset.', 'bad'); save(); render(); }, { danger: true }); return 'keep'; },
    'tree-desel'() { TV.state.sel[hero()] = null; },
    'tree-zoom'(el) { TV.zoom(hero(), +el.dataset.z); return 'norender'; },
    'tree-fit'() { TV.fit(hero()); return 'norender'; },
    'tree-branch'(el) { TV.centerBranch(hero(), el.dataset.branch); return 'norender'; },
    /* shop */
    'shop-sel'(el) { HV.state.shopSel = el.dataset.uid; },
    buy(el) { const it = G.market.stock.find((i) => i.uid === el.dataset.uid); if (result(M.hub.buy(G, el.dataset.uid), it ? `Bought ${it.name}! It’s in your stash.` : 'Bought!', { sfx: 'coin' })) HV.state.shopSel = null; },
    'shop-refresh'() { result(M.hub.refreshMarket(G), 'Fresh stock!', { sfx: 'coin' }); },
    /* workshop */
    'bench-sel'(el) { HV.state.benchSel = el.dataset.uid; },
    'ws-upgrade'(el) { if (result(M.hub.upgrade(G, el.dataset.uid), 'BMO upgraded it!', { sfx: 'levelup' })) M.hub.fixChar(G, hero()); },
    'ws-reroll'(el) { result(M.hub.reroll(G, el.dataset.uid), 'New bonuses!', { sfx: 'rare' }); },
    'ws-imbue'(el) { result(M.hub.imbue(G, el.dataset.uid), 'It’s Mathematical now!', { sfx: 'rare' }); },
    'ws-power'(el) { result(M.hub.rerollPower(G, el.dataset.uid), 'A new Power!', { sfx: 'rare' }); },
    /* journal */
    journal(el) { HV.state.journal = el.dataset.sec; },
    'new-journey'() {
      const p = document.querySelector('input[name="perk"]:checked');
      const k = $('keep-item');
      UI.confirm('Start a New Journey?', 'Both heroes start over at level 1 with a permanent perk. Your legendary collection is kept.', 'Begin!', () => { G = M.hub.newJourney(G, p && p.value, k && k.value); tab = 'board'; B3.fort = null; save(); render(); toast('A brand-new journey begins!', 'good'); });
      return 'keep';
    },
  };

  function run(act, el, ev) {
    if (screen === 'raid' || (DT.game.raid.current() && el.closest('#hud'))) { if (HUD.act(act, el)) return; }
    const fn = ACT[act];
    if (!fn) return;
    DT.sfx.unlock();
    let res;
    try { res = fn(el, ev); } catch (e) { console.error(e); toast('Something went wrong: ' + (e.message || e), 'bad'); }
    UI.menuClose();
    if (res === 'keep' || res === 'norender') return;
    save();
    if (screen !== 'raid') render();
  }

  /* ---------- input: clicks, menus, keys ---------- */
  document.addEventListener('click', (ev) => {
    if (UI.menuIsOpen() && !ev.target.closest('.ctx')) UI.menuClose();
    const el = ev.target.closest('[data-act]');
    const tile = ev.target.closest('.tile[data-uid]');
    if (el && !el.disabled && !(tile && el.contains(tile) && el !== tile)) {
      if (el.tagName === 'SELECT') return;
      DT.sfx.play('click');
      run(el.dataset.act, el, ev);
      return;
    }
    if (tile) {
      if (screen === 'raid') { HUD.act('r-sel', tile); return; }
      if (tile.dataset.src === 'result') return;
      run('sel', tile, ev);
    }
  });
  document.addEventListener('dblclick', (ev) => {
    const tile = ev.target.closest('.tile[data-uid]');
    if (!tile || screen !== 'hub' || tab !== 'loadout') return;
    const it = findItem(tile.dataset.uid);
    if (!it) return;
    const f = M.hub.find(G, it.uid);
    if (f && f.where === 'equip') run('unequip', { dataset: { hero: f.hero, slot: f.slot } });
    else if (f && f.where === 'belt') run('belt-remove', { dataset: { hero: f.hero, idx: f.index } });
    else if (it.kind === 'consumable') run('belt', { dataset: { uid: it.uid } });
    else if (M.loot.isGear(it)) run('equip', { dataset: { uid: it.uid } });
  });
  document.addEventListener('contextmenu', (ev) => {
    if (screen === 'raid' && !ev.target.closest('#hud .h-over')) return;
    const tile = ev.target.closest('.tile[data-uid]');
    const node = ev.target.closest('#sk-svg .node');
    const abs = ev.target.closest('.abslot[data-idx]');
    if (tile) {
      ev.preventDefault();
      if (screen === 'raid') {
        const r = DT.game.raid.current();
        const inPack = r && r.backpack.some((i) => i.uid === tile.dataset.uid);
        const items = inPack ? [{ act: 'r-equip', label: 'Equip', icon: 'check', data: { uid: tile.dataset.uid } }, { act: 'r-safe', label: 'To safe pocket', icon: 'lock', data: { uid: tile.dataset.uid } }, { sep: true }, { act: 'r-drop', label: 'Drop', icon: 'arrowDown', danger: true, data: { uid: tile.dataset.uid } }] : tile.dataset.src === 'rsafe' ? [{ act: 'r-unsafe', label: 'Back to backpack', icon: 'bag', data: { uid: tile.dataset.uid } }] : [];
        if (items.length) UI.menuOpen(ev.clientX, ev.clientY, items);
        return;
      }
      const it = findItem(tile.dataset.uid);
      if (!it || tile.dataset.src === 'result') return;
      if (tile.dataset.src === 'shop') { UI.menuOpen(ev.clientX, ev.clientY, [{ act: 'buy', label: `Buy · ${U.fmt(M.loot.buyPrice(it, M.stats.compute(G, hero())))}g`, icon: 'coin', data: { uid: it.uid } }]); return; }
      const acts = LO.actionsFor(G, hero(), it);
      UI.menuOpen(ev.clientX, ev.clientY, acts.map((a, i) => (a.danger && i ? [{ sep: true }, a] : [a])).flat());
      return;
    }
    if (node) {
      ev.preventDefault();
      const h = hero(), id = node.dataset.node;
      const s = M.tree.state(G, h, id);
      const items = [];
      if (s.owned) { const why = M.tree.canRefund(G, h, id); items.push({ act: 'tree-refund', label: `Refund · ${M.tree.refundCost(G, h)}g`, icon: 'refresh', data: { node: id }, disabled: !!why, note: why || '' }); }
      else if (s.ok) items.push({ act: 'tree-buy', label: 'Unlock · 1 point', icon: 'unlock', data: { node: id } });
      else { const ps = M.tree.pathState(G, h, id); items.push({ act: 'tree-path', label: `Unlock path · ${ps.path ? ps.path.length : '?'} points`, icon: 'unlock', data: { node: id }, disabled: !ps.ok, note: ps.reason || '' }); }
      UI.menuOpen(ev.clientX, ev.clientY, items);
      return;
    }
    if (abs && screen === 'hub') { ev.preventDefault(); abilityMenu(abs); }
  });
  document.addEventListener('keydown', (ev) => {
    const typing = /input|textarea|select/i.test((ev.target && ev.target.tagName) || '');
    if (ev.key === 'Escape') {
      if (UI.menuIsOpen()) { UI.menuClose(); return; }
      if (UI.modalOpen()) { UI.closeModal(); return; }
      if (screen === 'hub' && LO.state.sel) { LO.state.sel = null; render(); }
      return;
    }
    if (typing || screen !== 'hub' || UI.modalOpen()) return;
    const n = +ev.key;
    if (n >= 1 && n <= HV.TABS.length && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { tab = HV.TABS[n - 1][0]; render(); }
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'stash-search') { LO.state.search = t.value; render(); return; }
    if (t.id === 'tree-search') { TV.search(t.value); return; }
    if (t.dataset && t.dataset.set && t.type === 'range') { const out = t.parentNode.querySelector('output'); const k = t.dataset.set; if (out) out.textContent = k === 'fov' ? t.value + '°' : k === 'volume' ? Math.round(t.value * 100) + '%' : (+t.value).toFixed(2); applySetting(k, +t.value); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'tree-search') { const id = TV.search(ev.target.value); if (id) { TV.state.sel[hero()] = id; TV.centerOn(hero(), id, 1); const box = $('sk-detail'); if (box) box.innerHTML = TV.detail(G, hero()); } } });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('select[data-act="sort"]')) { LO.state.sort = t.value; render(); return; }
    if (t.dataset && t.dataset.set && t.type === 'checkbox') applySetting(t.dataset.set, t.checked);
  });
  function applySetting(k, v) {
    const s = DT.settings;
    if (k === 'volume') { DT.sfx.setVolume(v); return; }
    if (k === 'muted') { if (!!s.muted !== v) DT.sfx.toggleMute(); return; }
    s[k] = v;
    if (k === 'fov') GF.setFov(v);
    if (k === 'cursorAim') { IN.setMode(v ? 'cursor' : 'lock'); document.body.classList.toggle('cursor-aim', IN.mode === 'cursor'); }
    DT.saveSettings();
  }

  /* ---------- tooltips ---------- */
  const TIP_TEXT = {
    slot: (el) => { const h = hero(); const s = D.HEROES[h].slots.find((x) => x.id === el.dataset.slot); return s ? `<div class="tipbox"><b>${U.esc(s.label)} slot</b><p>Empty. Drag ${U.esc(D.KINDS[s.kind].label.toLowerCase())} gear here from your stash, or double-click an item.</p></div>` : ''; },
    slotlock: (el) => { const h = hero(); const s = D.HEROES[h].slots.find((x) => x.id === el.dataset.slot); return s ? `<div class="tipbox"><b>Locked slot</b><p>${U.esc(M.slotLock(G, h, s) || '')}.</p></div>` : ''; },
    belt: () => '<div class="tipbox"><b>Snack belt</b><p>Drag snacks here. During a trip press Z, X, C, V or B to use them.</p></div>',
    beltlock: () => `<div class="tipbox"><b>Locked belt slot</b><p>${hero() === 'finn' ? 'A Snack Sack backpack or some skills and legendary items add belt slots.' : 'Some skills and legendary items add belt slots.'}</p></div>`,
    safe: () => `<div class="tipbox"><b>${U.esc(D.HEROES[hero()].safeName)} (safe pocket)</b><p>${U.esc(D.GLOSSARY[D.HEROES[hero()].safeName] || '')} Drag an item here to protect it.</p></div>`,
    super: () => { const s = D.SUPERS[hero()]; return `<div class="tipbox"><b>${U.esc(s.name)} — your MATHEMATICAL! super (Q)</b><p>${U.esc(s.desc)}</p><p class="muted">The meter fills as you hit monsters.</p></div>`; },
    ablock: (el) => `<div class="tipbox"><b>Locked ability key</b><p>Opens at level ${D.HEROES[hero()].abilityLevels[+el.dataset.idx]}.</p></div>`,
    abempty: () => '<div class="tipbox"><b>Empty ability key</b><p>Click to pick an ability, or drag one here from the Abilities tab. Abilities come from the skill tree and from some legendary gear.</p></div>',
    ab: (el) => UI.abilityCard(G, hero(), el.dataset.ab),
    node: (el) => TV.tip(G, hero(), el.dataset.node),
    stat: (el) => `<div class="tipbox"><p>${U.esc((LO.TIPS && LO.TIPS[el.dataset.stat]) || '')}</p></div>`,
    set: (el) => { const s = D.SETS[el.dataset.set]; const S = M.stats.compute(G, 'finn'); const w = S.sets.find((x) => x.id === el.dataset.set); return `<div class="tipbox"><b style="color:${s.color}">${U.esc(s.name)} set (${w ? w.count : 0}/4)</b>${[2, 4].map((n, i) => `<p class="${w && w.bonuses[i].active ? 'good' : 'muted'}">${w ? w.bonuses[i].need : n} pieces: ${UI.kw(s.bonus[n].text)}</p>`).join('')}</div>`; },
    codex: (el) => { const u = D.UNIQUES[el.dataset.u]; return UI.itemCard(G, { uid: 'codex', kind: u.kind, base: u.base, unique: el.dataset.u, rarity: u.rarity, ilvl: Math.max(1, u.minTier), upg: 0, affixes: [], name: u.name, qty: 1 }, { compare: false }); },
    item: (el) => {
      const it = findItem(el.dataset.uid); if (!it) return '';
      const f = G ? M.hub.find(G, it.uid) : null;
      const owner = M.loot.heroFor(it);
      const ctx = screen === 'raid' ? DT.game.raid.current().heroId : tab === 'loadout' || !owner || owner === 'any' ? hero() : owner; const hint = screen === 'raid' ? 'Click to select · right-click for options' : el.dataset.src === 'shop' ? 'Click to select · right-click to buy' : f && f.where === 'equip' ? 'Double-click to unequip · right-click for options' : 'Double-click to equip · right-click for options'; return UI.itemCard(G, it, { hero: ctx, hint, slot: el.dataset.slot });
    },
  };
  document.addEventListener('mouseover', (ev) => {
    if (document.body.classList.contains('dragging') || UI.menuIsOpen()) return;
    const kw = ev.target.closest('.kw');
    if (kw && !ev.target.closest('#tooltip')) { UI.tipShow(`<div class="tipbox"><b>${U.esc(kw.dataset.kw)}</b><p>${U.esc(D.GLOSSARY[kw.dataset.kw] || '')}</p></div>`, ev.clientX, ev.clientY, 'kw:' + kw.dataset.kw); return; }
    const el = ev.target.closest('[data-tip]');
    if (!el) { UI.tipHide(); if (screen === 'hub' && tab === 'loadout') LO.previewStats(G, hero(), null); return; }
    const type = el.dataset.tip;
    const key = type + ':' + (el.dataset.uid || el.dataset.ab || el.dataset.node || el.dataset.stat || el.dataset.slot || el.dataset.set || el.dataset.u || el.dataset.idx || '');
    const fn = TIP_TEXT[type];
    const html = fn ? fn(el) : '';
    if (html) UI.tipShow(html, ev.clientX, ev.clientY, key); else UI.tipHide();
    if (screen === 'hub' && tab === 'loadout') LO.previewStats(G, hero(), type === 'item' ? findItem(el.dataset.uid) : null);
    if (screen === 'raid' && type === 'item') { const box = $('inv-card'); const r = DT.game.raid.current(); if (box && r && !LO.state.sel && r.backpack.some((i) => i.uid === el.dataset.uid)) box.innerHTML = LO.raidCard(r, el.dataset.uid); }
  });
  document.addEventListener('mousemove', (ev) => UI.tipMove(ev.clientX, ev.clientY));
  document.addEventListener('scroll', () => UI.tipHide(), true);

  /* ---------- drag and drop ---------- */
  document.addEventListener('dragstart', (ev) => { if (screen === 'hub' || screen === 'raid') LO.dragStart(ev); });
  document.addEventListener('dragover', (ev) => LO.dragOver(ev));
  document.addEventListener('dragleave', (ev) => { const t = ev.target.closest && ev.target.closest('[data-drop]'); if (t && !t.contains(ev.relatedTarget)) t.classList.remove('drop-hot'); });
  document.addEventListener('dragend', () => LO.dragEnd());
  document.addEventListener('drop', (ev) => {
    const a = LO.drop(ev);
    if (!a) return;
    const [act, data] = a;
    const fake = { dataset: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v == null ? undefined : String(v)])), closest: () => null };
    if (screen === 'raid') { HUD.act(act, fake); return; }
    if (act === 'bench') { HV.state.benchSel = data.uid; render(); return; }
    run(act, fake, ev);
  });

  /* spin the hero in the loadout by dragging */
  document.addEventListener('pointerdown', (ev) => { if (ev.button === 0 && ev.target.closest && ev.target.closest('#lo-model') && !ev.target.closest('.lo-plate')) B3.spinDrag = { x: ev.clientX, yaw: B3.yaw }; });
  document.addEventListener('pointermove', (ev) => { if (B3.spinDrag) B3.yaw = B3.spinDrag.yaw + (ev.clientX - B3.spinDrag.x) * 0.012; });
  document.addEventListener('pointerup', () => { B3.spinDrag = null; });

  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    save();
    const r = DT.game.raid.current();
    if (r && !r.paused && !r.over && !r.pendingOver) HUD.togglePause(r, true);
  });

  /* ---------- boot ---------- */
  function boot() {
    glOk = GF.init($('scene'));
    try { const s = store.load(); G = s ? M.migrate(s) : null; } catch (e) { console.error('Save could not be loaded', e); G = null; }
    screen = 'title';
    LO.TIPS = LO.TIPS || {};
    render();
    requestAnimationFrame(loop);
  }
  DT.debug = { get G() { return G; }, set G(v) { G = v; }, get screen() { return screen; }, get tab() { return tab; }, startTrip, render, go(t) { tab = t; screen = 'hub'; render(); } };
  boot();
})();
