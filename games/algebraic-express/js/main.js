/* Boot, screens (title / Tree Fort / train), the render loop, hub input, autosave. */
(function () {
  'use strict';
  const D = AE.data;
  const U = AE.U;
  const M = AE.meta;
  const GF = AE.game.gfx;
  const MD = AE.game.models;
  const UI = AE.ui;
  const store = AE.store;
  let G = null;
  let screen = 'title';
  let glOk = false;
  let fort = null, fortT = 0, last = 0;
  const $ = (id) => document.getElementById(id);
  const save = () => { if (G) store.save(G); };
  const toast = (m, k) => UI.toast(m, k);

  /* ---------- the Tree Fort diorama ---------- */
  function buildFort() {
    fort = new THREE.Group();
    fort.add(MD.treeFort());
    const finn = MD.finn(); finn.position.set(-1.3, 0, 5.2); finn.rotation.y = 0.35;
    const jake = MD.jake(); jake.position.set(1.4, 0, 5.3); jake.rotation.y = -0.35;
    fort.add(finn, jake);
    fort.userData = { finn, jake, clouds: [] };
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) c.add(GF.part(GF.geo('sphere', 1 + (k % 2) * 0.5, 14, 10), '#ffffff', [k * 1.3, (k % 2) * 0.4, 0], { ink: false }));
      c.position.set(-30 + i * 14, 14 + (i % 3) * 3, -18 - (i % 2) * 8);
      fort.add(c);
      fort.userData.clouds.push(c);
    }
  }
  function showFort() {
    if (!glOk) return;
    if (!fort) buildFort();
    GF.scene.add(fort);
    GF.scene.background = new THREE.Color('#9fdcff');
    GF.scene.fog = null;
  }
  function hideFort() { if (fort) GF.scene.remove(fort); }
  function updateFort(dt) {
    fortT += dt;
    const narrow = window.innerWidth < 900;
    const cam = GF.camera;
    const sway = Math.sin(fortT * 0.15) * 2.5;
    if (narrow) { cam.position.set(sway, 9, 24); cam.lookAt(0, 5.5, 0); }
    else { cam.position.set(-4 + sway, 7.5, 21); cam.lookAt(5.5, 5, 0); }
    const u = fort.userData;
    u.finn.position.y = Math.abs(Math.sin(fortT * 2.2)) * 0.12;
    u.jake.position.y = Math.abs(Math.sin(fortT * 2.2 + 1.2)) * 0.1;
    const p = u.finn.userData.parts;
    p.swingL.rotation.z = -2.4 + Math.sin(fortT * 5) * 0.35;
    for (const c of u.clouds) { c.position.x += dt * 0.8; if (c.position.x > 40) c.position.x = -40; }
    GF.updateFx(dt);
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    try {
      if (screen === 'raid') AE.game.raid.update(dt);
      else if (fort) updateFort(dt);
      GF.render();
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }

  /* ---------- screens ---------- */
  function render() {
    const app = $('app');
    document.body.dataset.screen = screen;
    if (screen === 'raid') { app.hidden = true; return; }
    app.hidden = false;
    app.innerHTML = G ? UI.renderHub(G) : UI.renderTitle(!!store.load(), glOk);
  }
  function showReport() {
    if (!G || !G.lastResult) return;
    UI.openModal(G.lastResult.ending ? UI.endingModal(G) : UI.resultModal(G), 'wide');
  }
  function startRaid(offerId) {
    if (!glOk) { toast('3D graphics aren’t available in this browser, so the train can’t leave the station.', 'bad'); return; }
    const offer = G.board.find((o) => o.id === offerId);
    if (!offer) return;
    AE.sfx.unlock();
    save();
    hideFort();
    UI.closeModal();
    screen = 'raid';
    render();
    const firstTrip = G.stats.trips === 0;
    const run = AE.game.raid.start(G, offerId, {
      onEnd: () => {
        screen = 'hub';
        UI.st.tab = 'missions';
        save();
        showFort();
        render();
        showReport();
      },
    });
    if (!run) { screen = 'hub'; showFort(); render(); toast('The train wouldn’t start. Try again.', 'bad'); return; }
    if (firstTrip) setTimeout(() => AE.ui.hud.note(AE.game.input.touch
      ? 'Drag the left side to move · yellow button attacks · dash button dodges · swap button tags in Jake · hold the hand button to open chests and bail out'
      : 'WASD to move · click to attack · Space to dodge · Q to switch to Jake · hold E to open chests and bail out', 8), 2600);
  }
  function confirmTwice(key, label) {
    const now = Date.now();
    if (UI.st.confirm && UI.st.confirm.key === key && now - UI.st.confirm.at < 4000) { UI.st.confirm = null; return true; }
    UI.st.confirm = { key, at: now };
    toast(label, 'warn');
    return false;
  }
  const say = (r, ok, msgs) => {
    const m = Object.assign({ poor: 'Not enough gold (or materials).', full: 'No room for that.', none: 'Nothing happened.', max: 'Already maxed out.' }, msgs || {});
    if (r === 'ok') { if (ok) toast(ok, 'good'); } else if (m[r]) toast(m[r], 'warn');
  };

  const ACT = {
    noop() {},
    'close-modal'() { UI.closeModal(); },
    continue() { const s = store.load(); if (s) { G = M.migrate(s); screen = 'hub'; } },
    'new-game-prompt'() { UI.openModal(UI.newGameModal(!!(G || store.load()))); },
    'new-game'() { G = M.newGame(); screen = 'hub'; UI.st.tab = 'missions'; UI.closeModal(); AE.sfx.unlock(); toast('Adventure time! Pick a train to hop on.', 'good'); },
    'import-prompt'() { UI.openModal(UI.importModal()); },
    'import-save'() { try { G = M.migrate(store.importCode($('savecode').value)); screen = 'hub'; UI.closeModal(); toast('Save loaded.', 'good'); } catch (e) { toast(e.message, 'bad'); } },
    'export-save'() { UI.openModal(UI.exportModal(store.exportCode(G))); },
    'copy-save'() { const ta = $('savecode-out'); if (!ta) return; ta.select(); const done = () => toast('Copied!', 'good'); if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); } },
    tab(d) { UI.st.tab = d.tab; },
    filter(d) { UI.st.filter = d.filter; },
    board(d) {
      if (!G.equip.finnWeapon && !G.equip.jakeWeapon && !confirmTwice('board', 'Nobody has a weapon! Tap again to go anyway.')) return;
      startRaid(d.id);
    },
    'reroll-board'() { say(M.hub.rerollBoard(G), 'New schedule posted.'); },
    handout() { say(M.hub.handout(G), 'Choose Goose hands over a sword, some mitts, and pancakes.'); },
    'show-result'() { showReport(); },
    inspect(d) { UI.st.inspectSlot = d.slot; const h = UI.inspect(G, d.uid, d.from); if (h) UI.openModal(h); },
    equip(d) { say(M.hub.equip(G, d.uid, d.slot), 'Equipped!', { full: 'Your treasure pile is full.' }); },
    unequip(d) { say(M.hub.unequip(G, d.slot), 'Back in the pile.', { full: 'Your treasure pile is full.' }); },
    'belt-add'(d) { say(M.hub.beltAdd(G, d.uid), 'On the snack belt.', { full: 'The snack belt is full.' }); },
    'belt-remove'(d) { say(M.hub.beltRemove(G, +d.slot), 'Back in the pile.'); },
    'tummy-add'(d) { say(M.hub.tummyAdd(G, d.uid), 'Jake swallows it. Safe!', { full: 'Jake’s tummy is full.' }); },
    'tummy-remove'(d) { say(M.hub.tummyRemove(G, d.uid), 'Jake spits it out. Gross.'); },
    sell(d) { const p = M.hub.sell(G, d.uid); if (p) toast(`Sold for ${U.fmt(p)} gold.`, 'good'); },
    salvage(d) { const r = M.hub.salvage(G, d.uid); if (r) toast(`BMO salvaged it: +${r.dust} dust${r.shards ? `, +${r.shards} shards` : ''}.`, 'good'); },
    discard(d) { if (!confirmTwice('toss-' + d.uid, 'Tap “Toss it” again to throw it away.')) return 'keep'; M.hub.removeAnywhere(G, d.uid); toast('Tossed.'); },
    buy(d) { say(M.hub.buy(G, d.uid), 'Bought! It’s in your treasure pile.', { full: 'Your treasure pile is full.' }); },
    'refresh-market'() { say(M.hub.refreshMarket(G), 'Fresh stock!'); },
    respec() { if (!confirmTwice('respec', 'Tap Respec again to forget every skill.')) return; say(M.hub.respec(G), 'Skills forgotten. Points refunded.'); },
    'stash-upgrade'() { say(M.hub.upgradeStash(G), 'The treasure pile got bigger.'); },
    'sell-valuables'() { const t = M.hub.sellValuables(G); toast(t ? `Sold all treasure for ${U.fmt(t)} gold.` : 'No treasure to sell.', t ? 'good' : 'warn'); },
    upgrade(d) { say(M.hub.upgrade(G, d.uid), 'BMO upgraded it!'); },
    reroll(d) { say(M.hub.reroll(G, d.uid), 'New bonuses rolled.'); },
    'work-select'(d) { UI.st.work = d.uid; },
    'goto-bmo'(d) { UI.st.work = d.uid; UI.st.tab = 'bmo'; },
    branch(d) { UI.st.branch = d.branch; UI.st.node = null; },
    node(d) { UI.st.node = d.id; },
    learn(d) { const r = M.hub.learn(G, d.id); if (r === 'ok') { const n = D.SKILLS[d.id]; toast(n.ability && G.skills[d.id] === 1 ? `Learned ${n.name}! It’s on the ability keys.` : `${n.name} — rank ${G.skills[d.id]}.`, 'good'); AE.sfx.play('levelup'); } else toast(r, 'warn'); },
    'new-journey'() { const p = document.querySelector('input[name="perk"]:checked'); const k = $('keepsake'); G = M.hub.newJourney(G, p && p.value, k && k.value); UI.st.tab = 'missions'; UI.closeModal(); toast('A brand-new journey begins!', 'good'); },
    'toggle-mute'() { const m = AE.sfx.toggleMute(); toast(m ? 'Sound off.' : 'Sound on.'); },
    'toggle-shake'() { const s = AE.sfx.settings; s.shake = s.shake === false; store.saveSettings(s); },
  };
  const KEEP_MODAL = new Set(['inspect', 'copy-save', 'export-save', 'import-prompt', 'new-game-prompt', 'show-result', 'noop']);

  function run(act, data, fromModal) {
    const fn = ACT[act];
    if (!fn) return;
    AE.sfx.unlock();
    let res;
    try { res = fn(data || {}); } catch (e) { console.error(e); toast('Something went wrong: ' + (e.message || e), 'bad'); }
    if (fromModal && !KEEP_MODAL.has(act) && res !== 'keep') UI.closeModal();
    save();
    if (screen !== 'raid') render();
  }
  document.addEventListener('click', (ev) => {
    const back = ev.target.closest('[data-backdrop]');
    if (back && ev.target === back) { UI.closeModal(); return; }
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    AE.sfx.play('click');
    run(el.dataset.act, Object.assign({}, el.dataset), !!el.closest('#modal-root'));
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change]');
    if (!el || !G) return;
    if (el.dataset.change === 'bar') { M.hub.setBar(G, el.dataset.hero, +el.dataset.slot, el.value || null); save(); render(); }
    if (el.dataset.change === 'volume') AE.sfx.setVolume(+el.value);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('modal-root').children.length) UI.closeModal(); });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { save(); const r = AE.game.raid.current(); if (r && !r.paused && !r.over) AE.ui.hud.togglePause(r); }
  });

  function boot(data) {
    glOk = GF.init($('scene'));
    try {
      if (data && data.G) G = M.migrate(data.G);
      else { const s = store.load(); G = s ? M.migrate(s) : null; }
    } catch (e) { console.error('Save could not be loaded', e); G = null; }
    screen = G ? 'hub' : 'title';
    if (data && data.ui) Object.assign(UI.st, data.ui, { confirm: null });
    showFort();
    render();
    requestAnimationFrame(loop);
  }
  AE.debug = { get G() { return G; }, get screen() { return screen; }, startRaid, render };
  try {
    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ G, ui: Object.assign({}, UI.st) }));
    if (hot && typeof hot.ready === 'function') hot.ready(boot); else boot((hot && hot.data) || {});
  } catch (e) { boot({}); }
})();
