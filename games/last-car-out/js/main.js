/* Boot, rendering, input, and autosave. */
(function () {
  'use strict';
  const U = LCO.U;
  const ENG = LCO.engine;
  const UI = LCO.ui;
  const store = LCO.store;
  let G = null;
  let lastScreen = '';

  const $ = (id) => document.getElementById(id);
  const save = () => { if (G) store.save(G); };
  const toast = (m, k) => UI.toast(m, k);

  function screenKey() { return !G ? 'title' : G.raid ? (G.raid.combat ? 'combat' : 'raid') : 'hub:' + UI.st.tab; }

  function render() {
    const root = $('app');
    if (!root) return;
    const focusSel = focusKey(document.activeElement);
    root.innerHTML = !G ? UI.renderTitle(!!store.load()) : G.raid ? UI.renderRaid(G) : UI.renderHub(G);
    const key = screenKey();
    if (key !== lastScreen) { window.scrollTo(0, 0); lastScreen = key; }
    const log = root.querySelector('.clog');
    if (log) log.scrollTop = log.scrollHeight;
    if (focusSel && !$('modal-root').children.length) { const el = root.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
  }
  function focusKey(el) {
    if (!el || !el.dataset || !el.dataset.act) return null;
    const d = el.dataset;
    let s = `[data-act="${d.act}"]`;
    for (const k of ['uid', 'id', 'slot', 'x', 'y', 'tab', 'branch', 'key', 'idx']) if (d[k] != null) s += `[data-${k}="${CSS.escape(d[k])}"]`;
    return s;
  }

  function showReport() {
    if (!G || !G.lastResult) return;
    if (G.lastResult.outcome === 'home') UI.openModal(UI.endingModal(G), 'wide');
    else UI.openModal(UI.resultModal(G), 'wide');
  }
  const say = (r, ok, msgs) => {
    const m = Object.assign({ poor: 'You can’t afford that.', full: 'No room for that.', none: 'Nothing happened.', max: 'Already at its best.' }, msgs || {});
    if (r === 'ok' || r === true) { if (ok) toast(ok, 'good'); } else if (m[r]) toast(m[r], 'warn');
  };
  /* Two-tap confirmation for destructive actions. */
  function confirmTwice(key, label) {
    const now = Date.now();
    if (UI.st.confirm && UI.st.confirm.key === key && now - UI.st.confirm.at < 4000) { UI.st.confirm = null; return true; }
    UI.st.confirm = { key, at: now };
    toast(label || 'Tap again to confirm.', 'warn');
    return false;
  }

  const ACT = {
    noop() {},
    'close-modal'() { UI.closeModal(); },
    continue() { const s = store.load(); if (s) G = ENG.migrate(s); },
    'new-game-prompt'() { UI.openModal(UI.newGameModal(!!(G || store.load()))); },
    'new-game'() {
      const name = (($('pname') && $('pname').value) || '').trim().slice(0, 24) || 'Passenger';
      G = ENG.newGame({ name });
      UI.st.tab = 'departures';
      UI.closeModal();
      toast(`Welcome aboard, ${name}. Your Number is ${G.number}.`, 'good');
    },
    'import-prompt'() { UI.openModal(UI.importModal()); },
    'import-save'() {
      try { G = ENG.migrate(store.importCode($('savecode').value)); UI.closeModal(); UI.st.tab = 'departures'; toast('Save loaded.', 'good'); }
      catch (e) { toast(e.message || 'That code could not be read.', 'bad'); }
    },
    'export-save'() { UI.openModal(UI.exportModal(store.exportCode(G))); },
    'copy-save'() {
      const ta = $('savecode-out');
      if (!ta) return;
      ta.select();
      const done = () => toast('Save code copied.', 'good');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    },

    /* hub */
    tab(d) { UI.st.tab = d.tab; },
    filter(d) { UI.st.filter = d.filter; },
    board(d) {
      const offer = G.board.find((o) => o.id === d.id);
      if (!offer) return;
      if (!G.equip.weapon && !confirmTwice('board-' + d.id, 'You have no weapon. Tap Board again to go anyway.')) return;
      if (ENG.hub.board(G, d.id)) { UI.st.target = null; toast(`Boarding Car ${offer.num}…`); }
    },
    'reroll-board'() { say(ENG.hub.rerollBoard(G), 'New departures posted.'); },
    handout() { say(ENG.hub.handout(G), 'The Cat leaves you a weapon, a coat, and bandages. She does not wait to be thanked.'); },
    'show-result'() { showReport(); },
    inspect(d) { UI.st.inspectSlot = d.slot; const html = UI.inspect(G, d.uid, d.from, d.key); if (html) UI.openModal(html); },
    equip(d) { say(ENG.hub.equip(G, d.uid, d.slot), 'Equipped.', { full: 'Your stash is full — make room for the item you’re swapping out.' }); },
    unequip(d) { say(ENG.hub.unequip(G, d.slot), 'Moved to your stash.', { full: 'Your stash is full.' }); },
    'belt-add'(d) { say(ENG.hub.beltAdd(G, d.uid), 'Added to your belt.', { full: 'Your belt is full.' }); },
    'belt-remove'(d) { say(ENG.hub.beltRemove(G, +d.slot), 'Moved to your stash.'); },
    'pouch-add'(d) { say(ENG.hub.pouchAdd(G, d.uid), 'Secured in your pouch.', { full: 'Your Secure Pouch is full.' }); },
    'pouch-remove'(d) { say(ENG.hub.pouchRemove(G, d.uid), 'Moved to your stash.'); },
    sell(d) { const p = ENG.hub.sell(G, d.uid); if (p) toast(`Sold for ${U.fmt(p)} Tickets.`, 'good'); },
    salvage(d) { const r = ENG.hub.salvage(G, d.uid); if (r) toast(`Salvaged: +${r.scrap} Scrap${r.glimmer ? `, +${r.glimmer} Glimmer` : ''}.`, 'good'); },
    discard(d) { if (confirmTwice('discard-' + d.uid, 'Tap “Throw away” again to confirm.')) { ENG.hub.discard(G, d.uid); toast('Thrown away.'); } else return 'keep-modal'; },
    buy(d) { say(ENG.hub.buy(G, d.uid), 'Bought. It’s in your stash.', { full: 'Your stash is full.' }); },
    'refresh-market'() { say(ENG.hub.refreshMarket(G), 'Fresh stock.'); },
    respec() { if (!confirmTwice('respec', 'Tap Respec again to forget every skill.')) return; say(ENG.hub.respec(G), 'Your skills are forgotten. Points refunded.'); },
    'stash-upgrade'() { say(ENG.hub.upgradeStash(G), 'Stash expanded by 10 slots.'); },
    'sell-valuables'() { const t = ENG.hub.sellValuables(G); toast(t ? `Sold every valuable for ${U.fmt(t)} Tickets.` : 'No valuables to sell.', t ? 'good' : 'warn'); },
    upgrade(d) { say(ENG.hub.upgrade(G, d.uid), 'Upgraded.', { poor: 'Not enough Scrap or Glimmer.' }); },
    reroll(d) { say(ENG.hub.reroll(G, d.uid), 'Affixes rerolled.', { poor: 'Not enough Scrap or Glimmer.' }); },
    'work-select'(d) { UI.st.workItem = d.uid; },
    'goto-work'(d) { UI.st.workItem = d.uid; UI.st.tab = 'workbench'; },
    branch(d) { UI.st.branch = d.branch; UI.st.node = null; },
    node(d) { UI.st.node = d.id; },
    learn(d) {
      const r = ENG.hub.learn(G, d.id);
      if (r === 'ok') { const n = LCO.data.SKILLS[d.id]; toast(n.ability && G.skills[d.id] === 1 ? `Learned ${n.name}. It’s on your ability bar.` : `${n.name} — rank ${G.skills[d.id]}.`, 'good'); }
      else toast(r, 'warn');
    },
    'go-home'() {
      const m = document.querySelector('input[name="memory"]:checked');
      const k = $('keepsake');
      G = ENG.hub.goHome(G, m && m.value, k && k.value);
      UI.st.tab = 'departures';
      UI.closeModal();
      toast('You step through. And then — somehow — you wake up on a train again.', 'good');
    },

    /* raid */
    move(d) { ENG.raid.move(G, +d.x, +d.y); },
    'view-room'() { ENG.raid.enter(G, ENG.raid.here(G.raid)); },
    take(d) { const r = ENG.raid.takeItem(G, d.key, d.uid); if (r === 'full') toast('Your backpack is full. Drop something first.', 'warn'); },
    'take-all'(d) { const left = ENG.raid.takeAll(G, d.key); toast(left ? `${left} item${left === 1 ? '' : 's'} didn’t fit.` : 'You take everything.', left ? 'warn' : 'good'); },
    drop(d) { ENG.raid.dropItem(G, d.uid); },
    'to-pouch'(d) { say(ENG.raid.toPouch(G, d.uid), 'Secured. It will survive even if you don’t.', { full: 'Your Secure Pouch is full.' }); },
    'from-pouch'(d) { say(ENG.raid.fromPouch(G, d.uid), 'Moved to your backpack.', { full: 'Your backpack is full.' }); },
    'to-belt'(d) { say(ENG.raid.toBelt(G, d.uid), 'On your belt.', { full: 'Your belt is full.' }); },
    'use-map'(d) { const r = ENG.raid.useMapItem(G, d.where, d.where === 'belt' ? +d.ref : d.ref); if (r === 'combat') toast('That only works in a fight.', 'warn'); },
    'event-choice'(d) { ENG.raid.chooseEvent(G, d.key, +d.idx); },
    'close-view'() { ENG.raid.closeView(G); },
    rest(d) { ENG.raid.rest(G, d.key); },
    vault(d) { ENG.raid.vault(G, d.key, d.method); },
    mbuy(d) { say(ENG.raid.merchantBuy(G, d.key, d.uid), 'Bought.', { poor: 'Not enough Tickets.', full: 'Your backpack is full.' }); },
    msell(d) { const p = ENG.raid.merchantSell(G, d.uid); if (p) toast(`Sold for ${U.fmt(p)} carried Tickets.`, 'good'); },
    exit(d) { const r = ENG.raid.useExit(G, d.key); if (r === 'failed') toast('The lock resists. Try again — the car is getting worse.', 'warn'); },
    emergency(d) { if (!confirmTwice('em-' + d.id, 'Tap again to leave the car right now.')) return; ENG.raid.emergency(G, d.id); },

    /* combat */
    'c-target'(d) { UI.st.target = d.uid; },
    'c-strike'() { ENG.combat.actions.strike(G, UI.st.target); },
    'c-brace'() { ENG.combat.actions.brace(G); },
    'c-ability'(d) { ENG.combat.actions.ability(G, d.id, UI.st.target); },
    'c-item'(d) { ENG.combat.actions.item(G, +d.slot, UI.st.target); },
    'c-flee'() { ENG.combat.actions.flee(G); },
    'c-spare'() { ENG.combat.actions.spare(G); },
    'c-end'() { ENG.combat.actions.endTurn(G); },
    'c-continue'() { ENG.raid.finishCombat(G); },
  };
  const KEEP_MODAL = new Set(['inspect', 'copy-save', 'export-save', 'import-prompt', 'new-game-prompt', 'show-result', 'noop']);

  function run(act, data, fromModal) {
    const fn = ACT[act];
    if (!fn) return;
    const wasRaid = !!(G && G.raid);
    let res;
    try { res = fn(data || {}); }
    catch (e) { console.error(e); toast('Something went wrong: ' + (e && e.message ? e.message : e), 'bad'); }
    if (fromModal && !KEEP_MODAL.has(act) && res !== 'keep-modal' && act !== 'go-home') UI.closeModal();
    save();
    render();
    if (wasRaid && G && !G.raid && G.lastResult) showReport();
  }

  document.addEventListener('click', (ev) => {
    const back = ev.target.closest('[data-backdrop]');
    if (back && ev.target === back) { UI.closeModal(); return; }
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    run(el.dataset.act, Object.assign({}, el.dataset), !!el.closest('#modal-root'));
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change]');
    if (!el || !G) return;
    if (el.dataset.change === 'bar-set') { ENG.hub.setBar(G, +el.dataset.slot, el.value || null); save(); render(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('modal-root').children.length) { UI.closeModal(); return; }
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[data-act][role="button"]')) { ev.preventDefault(); ev.target.click(); return; }
    if (!G || !G.raid || $('modal-root').children.length) return;
    const k = ev.key.toLowerCase();
    const cb = G.raid.combat;
    if (cb) {
      if (cb.over) { if (k === 'enter' || k === ' ') { ev.preventDefault(); run('c-continue'); } return; }
      const map = { q: 'c-strike', b: 'c-brace', e: 'c-end', f: 'c-flee' };
      if (map[k]) { ev.preventDefault(); run(map[k]); return; }
      if (/^[1-6]$/.test(k)) { const id = G.bar[+k - 1]; if (id) { ev.preventDefault(); run('c-ability', { id }); } }
      return;
    }
    const dir = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
    if (dir) {
      const x = G.raid.pos.x + dir[0], y = G.raid.pos.y + dir[1];
      if (ENG.raid.canMoveTo(G.raid, x, y)) { ev.preventDefault(); run('move', { x, y }); }
    }
  });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

  function boot(data) {
    const snap = data && data.G;
    try {
      if (snap) G = ENG.migrate(snap);
      else { const s = store.load(); G = s ? ENG.migrate(s) : null; }
    } catch (e) { console.error('Save could not be loaded', e); G = null; }
    if (data && data.ui) Object.assign(UI.st, data.ui, { modal: null });
    render();
    if (G && G.lastResult && G.lastResult.outcome === 'home' && !G.flags.endingSeen) { G.flags.endingSeen = true; showReport(); }
  }
  LCO.debug = { get G() { return G; }, render };
  try {
    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ G, ui: Object.assign({}, UI.st) }));
    if (hot && typeof hot.ready === 'function') hot.ready(boot);
    else boot((hot && hot.data) || {});
  } catch (e) { boot({}); }
})();
