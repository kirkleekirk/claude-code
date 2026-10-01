/* TUTORIAL */
// Scripted first match: BMO coaches you against Jake. Teaches playing cards, Actions, flying,
// fighting, flooping (the Pig eats a Cornfield), free Blue Plains moves and buildings.
var Tutorial = (function () {
'use strict';
const E = Engine, K = Engine.kit;
let step = 0, on = false, waitTurn = 0;
const $ = s => document.querySelector(s);
const idOf = (st, uid) => { const c = st.players[0].hand.find(x => x.uid === uid); return c ? c.id : null; };

const STEPS = [
  { say: 'Welcome to <b>Card Wars</b>! This holo-board has 4 lanes. Your <b>Blue Plains</b> are the felt patches at the bottom, Jake’s Cornfields are at the top.<br>Drag <b>Cool Dog</b> onto the glowing slot in <b>lane 2</b>.', point: { hand: 'b_cooldog' }, allow: (c, st) => c.t === 'play' && idOf(st, c.uid) === 'b_cooldog' && c.lane === 1 },
  { say: 'Mathematical! Placing a card flips it sideways and its hologram springs up. Cards cost <b>Actions</b> (the gems): you get 2 a turn.<br>Now drag <b>Sky Pup</b> into <b>lane 3</b>. It has <b>Flying</b>: it soars over ground blockers.', point: { hand: 'b_skypup' }, allow: (c, st) => c.t === 'play' && idOf(st, c.uid) === 'b_skypup' && c.lane === 2 },
  { say: 'Out of Actions! Tap <b>FIGHT!</b> to end your turn. (Whoever goes first can’t fight on turn 1.)', point: { btn: '#fightBtn' }, allow: c => c.t === 'end' },
  { wait: true, say: 'Jake’s turn. When a turn ends, every ready creature attacks <b>across its lane</b>. Watch!' },
  { say: 'Jake’s Husker Knight crashed into Cool Dog: <b>both creatures hit at the same time</b>. His Scarecrow is a <b>Guard</b> that protects the lanes beside it.<br>Drag <b>The Pig</b> into <b>lane 1</b>, across from the Scarecrow.', point: { hand: 'b_pig' }, allow: (c, st) => c.t === 'play' && idOf(st, c.uid) === 'b_pig' && c.lane === 0 },
  { say: 'Now tap <b>your Pig</b> and press <b>FLOOP</b>. Flooping turns the card sideways to use its power!', point: { cell: [0, 0, 'c'] }, allow: c => c.t === 'floop' && c.lane === 0 && c.slot === 'c' },
  { say: 'CHOMP! <b>The Pig ate a Cornfield.</b> Face-down landscapes don’t count when Jake pays for cards. A flooped creature skips its attack but still defends.<br>Tap <b>FIGHT!</b>', point: { btn: '#fightBtn' }, allow: c => c.t === 'end' },
  { wait: true, say: 'Jake strikes back…' },
  { say: 'Blue Plains creatures move for <b>free</b> on Blue Plains (that’s their Home Advantage). Tap <b>Sky Pup</b>, then tap a <b>blue lane</b> to move it.', point: { cell: [0, 2, 'c'] }, allow: c => c.t === 'move' },
  { say: '<b>Buildings</b> stand behind your creatures. Drag the <b>Cave of Solitude</b> behind the Pig (lane 1). A flooped creature naps inside, safe from attacks.', point: { hand: 'b_cave' }, allow: (c, st) => c.t === 'play' && idOf(st, c.uid) === 'b_cave' && c.lane === 0 },
  { done: true, say: 'You’ve got it! Floop the Pig again to eat more corn, then FIGHT. From now on Jake plays for real. Knock him from <b>25 HP to 0</b> and you’re the Cool Guy!' }
];

function plan(st, me) {
  if (!on) return null;
  const h = id => st.players[me].hand.find(c => c.id === id), empty = l => !st.players[me].lanes[l].creature;
  if (st.turn === 2) {
    if (h('c_husker') && empty(1)) return [{ t: 'play', p: me, uid: h('c_husker').uid, lane: 1 }];
    if (h('c_scarecrow') && empty(0)) return [{ t: 'play', p: me, uid: h('c_scarecrow').uid, lane: 0 }];
    return [{ t: 'end', p: me }];
  }
  if (st.turn === 4) {
    if (h('c_cornball') && empty(3)) return [{ t: 'play', p: me, uid: h('c_cornball').uid, lane: 3 }];
    return [{ t: 'end', p: me }];
  }
  return null;
}

function start() {
  on = true; step = 0;
  const p0 = { lands: ['blue', 'blue', 'blue', 'blue'], cards: E.STARTERS.blue.cards };
  const p1 = { lands: ['corn', 'corn', 'swamp', 'corn'], cards: E.STARTERS.corn.cards };
  const S = Meta.S;
  UI.start({
    seed: 'tutorial', mode: 'tutorial', noMulligan: true, first: 0,
    seats: [{ kind: 'human', name: S.name || 'Finn', hero: 'finn', deck: p0 },
      { kind: 'ai', name: 'Jake', hero: 'jake', deck: p1, difficulty: 'easy', personality: 'aggro', lines: ['Cornfields are awesome!', 'You’re a babe in the woods!', 'FOR THE GLORY!'], plan }],
    setup: st => {
      K.hand(st, 0, ['b_cooldog', 'b_skypup', 'b_pig', 'b_cave', 'r_teleport']);
      K.deck(st, 0, ['b_ranger', 'b_hotdog', 'b_adv', 'b_school', 'b_cooldog', 'r_poundcake', 'b_ranger', 'b_hotdog', 'b_skypup', 'b_math', 'r_pancakes', 'b_ride', 'b_math', 'b_spirit', 'b_scholar']);
      K.hand(st, 1, ['c_husker', 'c_scarecrow', 'c_cornball', 'r_baldman', 'c_bloodstorm']);
      K.deck(st, 1, ['c_husker', 'c_cornball', 'c_worm', 'r_teleport', 'c_dome', 'c_plant', 'r_dan', 'c_ronin', 'c_worm', 'c_cornucopia', 'c_nightmares', 'r_reclaim', 'c_scarecrow', 'c_silo', 'c_maize']);
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
  setTimeout(show, 1400);
}
function allow(cmd) {
  if (!on) return true;
  const s = STEPS[step]; if (!s || s.done) return true;
  if (s.wait) return false;
  const ok = s.allow ? s.allow(cmd, UI.M.st) : true;
  if (!ok) { UI.toast('Follow BMO’s tip!'); bubbleShake(); }
  return ok;
}
function onCmd(cmd) {
  // humanCmd only runs commands that allow() accepted, so any human command here completes the step
  if (!on || cmd.p !== 0 || cmd.t === 'choose') return;
  const s = STEPS[step];
  if (s && !s.wait && !s.done) next();
}
function next() {
  step++;
  const s = STEPS[step];
  if (s && s.wait) waitTurn = UI.M.st.turn;
  setTimeout(show, 450);
}
function onIdle() {
  if (!on) return;
  const s = STEPS[step];
  if (s && s.wait && UI.M.st.active === 0) { step++; show(); }
  else show();
}
function bubbleShake() { const b = $('#coach .say'); if (b) b.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 }); }
function show() {
  if (!on || UI.screen !== 'match') return;
  const s = STEPS[step]; const c = $('#coach');
  if (!s) { hide(); return; }
  c.innerHTML = '<div class="say"><img src="' + Art.portraitURL('bmo', 96) + '" style="width:2.6rem;height:2.6rem;flex:none"><div><b>BMO:</b> ' + s.say + (s.done ? '<div style="margin-top:.4rem"><button class="btn small" id="coachOk">Let’s go!</button></div>' : '') + '</div></div><div class="arrow"><svg viewBox="0 0 24 24"><path d="M12 22L3 10h6V2h6v8h6z" fill="#ffcf3a" stroke="#1b1424" stroke-width="1.5"/></svg></div>';
  c.classList.add('on');
  const say = c.querySelector('.say'), arrow = c.querySelector('.arrow');
  const ba = $('#board-area').getBoundingClientRect();
  const wide = document.body.classList.contains('wide');
  say.style.left = (wide ? ba.left + ba.width / 2 : window.innerWidth / 2) + 'px'; say.style.transform = 'translateX(-50%)';
  say.style.top = (wide ? 8 : 4) + 'px';
  let tgt = null;
  if (s.point && s.point.hand) { const st = UI.M.disp || UI.M.st; const inst = st.players[0].hand.find(x => x.id === s.point.hand); const el = inst && document.querySelector('#hand .card[data-uid="' + inst.uid + '"]'); if (el) { const r = el.getBoundingClientRect(); tgt = { x: r.left + r.width / 2, y: r.top }; } }
  else if (s.point && s.point.btn) { const r = $(s.point.btn).getBoundingClientRect(); tgt = { x: r.left + r.width / 2, y: r.top }; }
  else if (s.point && s.point.cell) { const p = Render.headPos(s.point.cell[0], s.point.cell[1], s.point.cell[2]); tgt = { x: p.x, y: p.y - 20 }; }
  if (tgt && !s.wait) { arrow.style.display = 'block'; arrow.style.left = (tgt.x - 24) + 'px'; arrow.style.top = (tgt.y - 50) + 'px'; } else arrow.style.display = 'none';
  const ok = c.querySelector('#coachOk');
  if (ok) ok.onclick = () => { hide(); finishScript(); };
}
function finishScript() { on = false; const seat = UI.M.seats[1]; delete seat.plan; UI.toast('Beat Jake to finish the tutorial!'); }
function hide() { const c = $('#coach'); c.classList.remove('on'); c.innerHTML = ''; }
function skip() {
  on = false; hide();
  Meta.S.tutorialDone = true; Meta.save();
  UI.quit(); Meta.home();
}
window.addEventListener('resize', () => { if (on) setTimeout(show, 50); });
return { start, skip, get active() { return on; } };
})();
/* END TUTORIAL */
