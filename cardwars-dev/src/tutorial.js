/* TUTORIAL */
// "Now lemme explain the rules." A scripted first game against Jake that replays the episode: set up your kingdom,
// floop your land cards, the Silo of Truth, "discard a card and pick up a new one", the Pig eating Jake's
// Cornfields, "you don't floop a creature to make it fight, you ACTIVATE it", BATTLE, and defending.
var Tutorial = (function () {
'use strict';
const E = Engine, K = Engine.kit;
let step = 0, on = false;
const $ = s => document.querySelector(s);
const idOf = (st, uid) => { const c = st.players[0].hand.find(x => x.uid === uid); return c ? c.id : null; };
const setupNow = st => st.phase === 'setup' && !st.players[0].ready;
const myPending = (st, kind) => st.pending && st.pending.side === 0 && st.pending.kind === kind;
const myMain = st => st.phase === 'main' && st.active === 0 && !st.pending;

// Steps either wait for one allowed command from you, or (wait: true) for the game to reach a state.
const STEPS = [
  { say: 'Now lemme explain the rules. Those are your land cards: four <b>Blue Plains</b>, one for each lane. Your kingdom, the <b>Schoolhouse</b> and the <b>Astral Fortress</b>, comes with them.<br>First set up your creatures. Drag <b>Cool Dog</b> onto <b>lane 2</b>.',
    point: { hand: 'b_cooldog' }, allow: (c, st) => c.t === 'play' && idOf(st, c.uid) === 'b_cooldog' && c.lane === 1 },
  { say: 'Now put your <b>Ancient Scholar</b> in front of the Schoolhouse, in <b>lane 1</b>.', point: { hand: 'b_scholar' }, allow: (c, st) => c.t === 'play' && idOf(st, c.uid) === 'b_scholar' && c.lane === 0 },
  { say: 'Keep those honeys hidden, or I’ll get a strategic advantage! You’ve got an Action left, but that’s plenty.<br>Now… <b>floop your land cards!</b>', point: { btn: '#fightBtn' }, allow: c => c.t === 'ready' },
  { wait: true, say: 'Okay, I go first. <b>I floop the Silo of Truth!</b>', until: st => myPending(st, 'discard') || myMain(st) },
  { say: 'Your turn! You’re supposed to <b>discard a card and pick up a new one</b> first. Tap a card, then tap the red button.', point: { prompt: 1 }, skipIf: st => !myPending(st, 'discard'), allow: c => c.t === 'discard' },
  { say: 'Look at you. You’re a babe in the woods. Go on, play <b>The Pig</b> in <b>lane 4</b>.', point: { hand: 'r_pig' }, allow: (c, st) => c.t === 'play' && idOf(st, c.uid) === 'r_pig' && c.lane === 3 },
  { say: 'Heh. And now what, you <b>floop</b> the Pig? Go ahead: tap <b>The Pig</b> and press <b>FLOOP</b>.', point: { cell: [0, 3, 'c'] }, allow: c => c.t === 'floop' && c.lane === 3 && c.slot === 'c' },
  { say: 'NOOOO! It’s eating all my Cornfields! My Husker Knights draw energy from corn!<br>Okay, okay… you don’t floop a creature to make it fight. You <b>ACTIVATE</b> it. Tap <b>Cool Dog</b> and press <b>ACTIVATE</b>.', point: { cell: [0, 1, 'c'] }, allow: c => c.t === 'activate' && c.lane === 1 },
  { say: 'Cool Dog turned right: that means he’s attacking the lane across. Now call <b>BATTLE!</b>', point: { btn: '#fightBtn' }, allow: c => c.t === 'battle' },
  { wait: true, say: 'Hmph. My turn. I discard, pick up… and attack!', until: st => myPending(st, 'defend') || myMain(st) },
  { say: 'I’m attacking your Cool Dog! <b>What’ll you use to defend?</b> You can floop cards or activate a ready creature to block. Or just tap <b>DONE DEFENDING</b> and take it.', point: { btn: '#fightBtn' }, skipIf: st => !myPending(st, 'defend'),
    allow: c => c.t === 'block' || c.t === 'floop' || c.t === 'defend', advance: c => c.t === 'defend' },
  { wait: true, say: 'Watch the battle…', until: st => myPending(st, 'discard') || myMain(st) || st.winner != null },
  { done: true, say: 'That’s Card Wars, man! Wipe out my whole kingdom (every creature and every building) and you’re the <b>cool guy</b>. If your side is ever empty, you’re the dweeb. Now we play for real!' }
];

// Jake's moves while the script runs (one command at a time; anything else falls back to the normal AI).
function plan(st, me) {
  if (!on) return null;
  const P = st.players[me], h = id => P.hand.find(c => c.id === id), empty = l => !P.lanes[l].creature;
  if (st.phase === 'setup') {
    if (h('c_husker') && empty(0)) return { t: 'play', p: me, uid: h('c_husker').uid, lane: 0 };
    if (h('c_husker') && empty(1)) return { t: 'play', p: me, uid: h('c_husker').uid, lane: 1 };
    return { t: 'ready', p: me };
  }
  const pd = st.pending;
  if (pd && pd.side === me) {
    if (pd.kind === 'steal') { const want = st.players[pd.from].hand.find(c => c.id === 'r_bloodstorm'); return { t: 'choose', p: me, uid: want && pd.options.includes(want.uid) ? want.uid : null }; }
    if (pd.kind === 'discard') { const d = h('c_cornball') || P.hand[0]; return { t: 'discard', p: me, uid: d.uid }; }
    if (pd.kind === 'defend') return { t: 'defend', p: me };
  }
  if (st.active !== me || st.phase !== 'main') return null;
  if (st.turn === 1) {
    if (h('c_silo') && !P.lanes[3].building) return { t: 'play', p: me, uid: h('c_silo').uid, lane: 3 };
    return { t: 'battle', p: me };
  }
  if (st.turn === 3) {
    if (h('r_hotdog') && empty(1)) return { t: 'play', p: me, uid: h('r_hotdog').uid, lane: 1 };
    const c = P.lanes[1].creature;
    if (c && !c.act && !E.activateBlock(st, me, 1)) return { t: 'activate', p: me, lane: 1 };
    return { t: 'battle', p: me };
  }
  return null;
}

function start() {
  on = true; step = 0;
  const p0 = { lands: ['blue', 'blue', 'blue', 'blue'], cards: E.STARTERS.blue.cards };
  const p1 = { lands: ['corn', 'corn', 'corn', 'swamp'], cards: E.STARTERS.corn.cards };
  const S = Meta.S;
  UI.start({
    seed: 'tutorial', mode: 'tutorial', noMulligan: true, first: 1,
    seats: [{ kind: 'human', name: S.name || 'Finn', hero: 'finn', deck: p0 },
      { kind: 'ai', name: 'Jake', hero: 'jake', deck: p1, difficulty: 'easy', personality: 'aggro', lines: ['Cornfields are AWESOME!', 'Look at you. You’re a babe in the woods.', 'For the glory of Jakoria!'], plan }],
    setup: st => {
      K.hand(st, 0, ['b_cooldog', 'b_scholar', 'r_pig', 'r_bloodstorm', 'b_skypup', 'b_cave']);
      K.deck(st, 0, ['b_marauder', 'r_hotdog', 'b_math', 'b_cooldog', 'b_spirit', 'b_skypup', 'b_bard', 'b_soldier', 'b_ranger', 'r_teleport', 'b_chief', 'b_scholar', 'b_marauder', 'r_hotdog']);
      K.hand(st, 1, ['c_husker', 'c_husker', 'c_silo', 'r_hotdog', 'c_cornball']);
      K.deck(st, 1, ['r_baldman', 'c_earlings', 'r_reclaim', 'c_scarecrow', 'c_earlings', 'c_feedman', 'c_plant', 'r_teleport', 'c_nightmares', 'c_maize', 'r_reclaim', 'r_baldman', 'c_reaper', 'c_henge', 'c_archer']);
    },
    tutorial: { allow, onCmd, onIdle },
    onEnd: res => {
      on = false; hide();
      const S2 = Meta.S, first = !S2.tutorialDone;
      S2.tutorialDone = true;
      if (first && res.winner === 0) { S2.sparks += 40; }
      Meta.save();
      Meta.results(res, null, { tutorial: true, pvp: false });
    }
  });
  setTimeout(show, 600);
}
function cur() { return STEPS[step]; }
function allow(cmd) {
  if (!on) return true;
  const s = cur(); if (!s || s.done) return true;
  if (s.wait) return false;
  const ok = s.allow ? s.allow(cmd, UI.M.st) : true;
  if (!ok) { UI.toast('Do what Jake says!'); bubbleShake(); }
  return ok;
}
function onCmd(cmd) {
  // humanCmd only runs commands that allow() accepted
  if (!on || cmd.p !== 0) return;
  const s = cur();
  if (s && !s.wait && !s.done && (!s.advance || s.advance(cmd))) { step++; settle(); setTimeout(show, 350); }
  else setTimeout(show, 50);
}
// Skip ahead over wait steps whose condition is met and over steps that don't apply (e.g. Jake didn't attack).
function settle() {
  const st = UI.M.st;
  for (let guard = 0; guard < STEPS.length; guard++) {
    const s = cur(); if (!s || s.done) return;
    if (s.wait && s.until(st)) { step++; continue; }
    if (!s.wait && s.skipIf && s.skipIf(st)) { step++; continue; }
    return;
  }
}
function onIdle() { if (!on) return; settle(); show(); }
function bubbleShake() { const b = $('#coach .say'); if (b) b.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 }); }
function show() {
  if (!on || UI.screen !== 'match') return;
  const s = cur(); const c = $('#coach');
  if (!s) { hide(); return; }
  c.innerHTML = '<div class="say"><img src="' + Art.portraitURL('jake', 96) + '" style="width:2.6rem;height:2.6rem;flex:none;border-radius:50%"><div><b>Jake:</b> ' + s.say +
    (s.done ? '<div style="margin-top:.4rem"><button class="btn small" id="coachOk">Bring it!</button></div>' : '') + '</div></div><div class="arrow"><svg viewBox="0 0 24 24"><path d="M12 22L3 10h6V2h6v8h6z" fill="#ffcf3a" stroke="#1b1424" stroke-width="1.5"/></svg></div>';
  c.classList.add('on');
  const say = c.querySelector('.say'), arrow = c.querySelector('.arrow');
  const wide = document.body.classList.contains('wide');
  const opp = $('#opp').getBoundingClientRect(), hand = $('#hand').getBoundingClientRect();
  say.style.left = (wide ? (opp.right + hand.left) / 2 : window.innerWidth / 2) + 'px'; say.style.transform = 'translateX(-50%)';
  say.style.top = (wide ? 8 : opp.bottom + 4) + 'px';
  let tgt = null;
  const pt = s.point || {};
  if (pt.hand) { const st = UI.M.disp || UI.M.st; const inst = st.players[0].hand.find(x => x.id === pt.hand); const el = inst && document.querySelector('#hand .card[data-uid="' + inst.uid + '"]'); if (el) { const r = el.getBoundingClientRect(); tgt = { x: r.left + r.width / 2, y: r.top }; } }
  else if (pt.btn) { const r = $(pt.btn).getBoundingClientRect(); tgt = { x: r.left + r.width / 2, y: r.top }; }
  else if (pt.prompt) { const r = $('#prompt').getBoundingClientRect(); if (r.width) tgt = { x: r.left + r.width / 2, y: r.top }; }
  else if (pt.cell) { const p = Scene.headPos(pt.cell[0], pt.cell[1], pt.cell[2]); tgt = { x: p.x, y: p.y - 10 }; }
  if (tgt && !s.wait) { arrow.style.display = 'block'; arrow.style.left = (tgt.x - 24) + 'px'; arrow.style.top = (tgt.y - 50) + 'px'; } else arrow.style.display = 'none';
  const ok = c.querySelector('#coachOk');
  if (ok) ok.onclick = () => { hide(); finishScript(); };
}
function finishScript() { on = false; const seat = UI.M.seats[1]; delete seat.plan; UI.toast('Wipe out Jake’s kingdom to finish the tutorial!'); }
function hide() { const c = $('#coach'); c.classList.remove('on'); c.innerHTML = ''; }
function skip() {
  on = false; hide();
  Meta.S.tutorialDone = true; Meta.save();
  UI.quit(); Meta.home();
}
window.addEventListener('resize', () => { if (on) setTimeout(show, 80); });
return { start, skip, get active() { return on; }, get step() { return step; } };
})();
/* END TUTORIAL */
