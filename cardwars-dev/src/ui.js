/* UI */
// Match screen on the 3D table: event director (animations from per-event snapshots), HUD, hand, phase prompts
// (kingdom setup, "discard a card and pick up a new one", battle, "what'll you use to defend?"), input,
// targeting, previews, undo, log, emotes, AI driver and pass-and-play. Also shared card/modal helpers.
var UI = (function () {
'use strict';
const E = Engine, S3 = Scene;
const $ = s => document.querySelector(s);
const LANDC = S3.LANDC;
const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
  emote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 5h16v11H9l-5 4z"/><circle cx="9" cy="10.5" r=".8" fill="currentColor"/><circle cx="15" cy="10.5" r=".8" fill="currentColor"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="5" width="11" height="15" rx="2" opacity=".55"/><rect x="9" y="3" width="11" height="15" rx="2"/></svg>',
  deck: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8" stroke="#1b1424" stroke-width="2"/></svg>',
  grave: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 21V10a6 6 0 0112 0v11z"/><path d="M12 9v6M9.5 11.5h5" stroke="#1b1424" stroke-width="2"/></svg>',
  castle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 21V9h2V6h2v3h2V6h2v3h2V6h2v3h2V6h2v3h2v12h-7v-5a2 2 0 00-4 0v5z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="#ffcf3a"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="#8ff0ff"><path d="M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z"/></svg>'
};

// ------------------------------------------------------------------ shared helpers
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmtText(t) {
  return esc(t).replace(/\b(FLOOP(?: \([^)]*\))?|ACTIVATE|Guard|Flying|Ranged|Siege \d|Vampiric|Shield \d|Burn \d|Chill(?:ed)?|Freeze|Frozen|Rot(?:s)?|Stuck|Ripen|Immortal|Trap|Study|Raise the Dead|Extra cost)\b/g, '<b>$1</b>');
}
function lvlStats(cd, lvl) {
  lvl = lvl || 1;
  if (cd.type === 'creature') return { atk: cd.atk + (lvl >= 3 ? 1 : 0), def: cd.def + (lvl >= 2 ? 1 : 0) + (lvl >= 4 ? 1 : 0) };
  if (cd.type === 'building') return { def: cd.def + Math.max(0, lvl - 1) };
  return {};
}
function typeLine(cd) {
  const t = cd.type === 'creature' ? 'Creature' : cd.type === 'building' ? (cd.kw.trap ? 'Building - Trap' : cd.r === 'K' ? 'Kingdom Landmark' : 'Building') : 'Spell';
  return E.LANDS[cd.land].name + ' ' + t + (cd.r === 'L' ? ' • Legendary' : '');
}
let artPending = false;
function cardEl(id, o) {
  o = o || {};
  const cd = E.CARDS[id] || E.CARDS['?'];
  const el = document.createElement('div');
  el.className = 'card r-' + cd.r + (o.mini ? ' mini' : '') + (o.big ? ' big' : '') + (o.dim ? ' dim' : '') + (o.locked ? ' locked' : '');
  if (id === '?' || o.back) { el.className = 'card back' + (o.mini ? ' mini' : ''); return el; }
  el.style.setProperty('--fc', LANDC[cd.land]);
  const s = lvlStats(cd, o.lvl);
  const cost = o.cost != null ? o.cost : cd.cost;
  const art = S3.cardArtURL(id);
  if (!art) artPending = true;
  const nmCls = cd.name.length > 17 ? 'nm xl' : cd.name.length > 11 ? 'nm long' : 'nm';
  let h = '<div class="in"><div class="art" style="' + (art ? 'background-image:url(' + art + ')' : '') + '"></div><div class="' + nmCls + '">' + esc(cd.name) + '</div>' +
    '<div class="ty">' + esc(typeLine(cd)) + '</div><div class="tx">' + fmtText(cd.text || '') + '</div></div>' +
    (cd.r !== 'K' ? '<div class="cost"><span>' + cost + '</span></div>' : '') + '<div class="rar"></div>';
  if (cd.land !== 'rainbow' && cd.req > 0) { h += '<div class="req">'; for (let i = 0; i < cd.req; i++) h += '<i></i>'; h += '</div>'; }
  if (cd.type === 'creature') h += '<div class="st c">' + s.atk + '/' + s.def + '</div>';
  else if (cd.type === 'building') h += '<div class="st b">' + s.def + '</div>';
  if (o.lvl > 1) h += '<div class="lvl">LV ' + o.lvl + '</div>';
  if (o.count != null) h += '<div class="cnt">x' + o.count + '</div>';
  el.innerHTML = h;
  return el;
}
function toast(msg) {
  const t = document.createElement('div'); t.textContent = msg; $('#toast').appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
let modalClose = null;
function modal(html, opts) {
  opts = opts || {};
  const m = $('#modal');
  m.innerHTML = '<div class="dlg' + (opts.wide ? ' wide' : '') + '">' + (opts.noClose ? '' : '<button class="x" data-close>✕</button>') + html + '</div>';
  m.classList.add('on');
  modalClose = opts.onClose || null;
  m.onclick = e => {
    if (e.target === m && !opts.noClose) closeModal();
    const c = e.target.closest('[data-close]'); if (c) closeModal();
  };
  return m.firstChild;
}
function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; const f = modalClose; modalClose = null; if (f) f(); }
function inspect(id, lvl, extra) {
  const cd = E.CARDS[id]; if (!cd) return;
  const d = modal('<div class="center" id="insp"></div><div class="kwlist" id="kws"></div>' + (extra || ''));
  const c = cardEl(id, { big: true, lvl }); d.querySelector('#insp').appendChild(c);
  const kws = [];
  if (cd.text) kws.push('<div class="full">' + fmtText(cd.text) + '</div>');
  const txt = (cd.text || '') + ' ' + Object.keys(cd.kw).join(' ');
  for (const k in E.KEYWORDS) {
    if (!(new RegExp('\\b' + k, 'i').test(txt) || (k === 'floop' && cd.floop) || (k === 'activate' && cd.type === 'creature'))) continue;
    const full = E.KEYWORDS[k], i = full.indexOf(': ');
    kws.push('<div><b>' + esc(i > 0 ? full.slice(0, i) : k) + '</b> — ' + esc(i > 0 ? full.slice(i + 2) : full) + '</div>');
  }
  if (cd.type === 'creature' && cd.land !== 'rainbow') kws.push('<div><b>Home Advantage</b> on ' + E.LANDS[cd.land].name + ' — ' + esc(E.LANDS[cd.land].home) + '</div>');
  if (cd.flavor) kws.push('<div style="opacity:.75;font-style:italic;margin-top:.4rem">' + esc(cd.flavor) + '</div>');
  d.querySelector('#kws').innerHTML = kws.join('');
  return d;
}

// ------------------------------------------------------------------ match state
const M = {
  on: false, st: null, disp: null, seats: null, viewer: 0, mode: 'ai', cfg: null,
  sel: null, undo: null, log: [], ai: [{}, {}], timer: null, timeLeft: 0,
  stats: null, onEnd: null, tutorial: null, waitingPass: false, ended: false, lastTouch: false, emoteCd: 0, choosing: false, promptKey: ''
};
const settings = { speed: 1, haptics: true, reduceMotion: false, timer: false, confirmTouch: true };

// ------------------------------------------------------------------ director
const D = { q: [], cur: null, speed: 1, ff: false };
function dur(ev) {
  const T = {
    turn: 900, draw: 90, discard: 380, cast: 700, summon: 600, build: 700, replace: 160, floop: 520, ready: 240, move: 520, activate: 260, deactivate: 120,
    attack: 520, damage: 160, bdamage: 160, heal: 200, death: 520, bdeath: 600, status: 120, buff: 120, land: 520, eat: 900, steal: 900, trap: 600,
    spirit: 900, reap: 600, reveal: 1500, stealCard: 700, study: 700, zap: 380, crash: 260, say: 1100, volcano: 2200, immortal: 380, immune: 280,
    fightPhase: 520, battleCall: 420, block: 380, unblock: 120, defended: 120, fizzle: 420, scare: 700, stormHit: 260, storm: 1300, nightmares: 1200,
    coldNose: 1100, wander: 400, endTurn: 120, overtime: 900, judges: 1600, handFull: 260, deckEmpty: 200, buyDraw: 60, mulligan: 0, setup: 0,
    setupPhase: 0, setupDone: 0, kingdom: 2600, gameOver: 300, pending: 0, actions: 0, _pause: 0
  };
  let d = T[ev.t] != null ? T[ev.t] : 120;
  if (ev.t === 'turn' && ev.side !== M.viewer && M.seats[ev.side].kind !== 'human') d = 600;
  if (ev.t === 'draw' && (ev.silent || ev.side !== M.viewer)) d = 30;
  if (ev.t === 'fightPhase' && !ev.n) d = 0;
  if (ev.t === 'say' && !ev.text) d = 0;
  if (ev.t === '_pause') d = ev.ms || 0;
  if (ev.t === 'reveal' && ev.to === M.viewer && M.st.pending && M.st.pending.side === M.viewer) d = 300;
  if (ev.t === 'kingdom' && settings.reduceMotion) d = 600;
  if (ev.t === 'summon' && ev.how === 'setup') d = 60;
  if (ev.t === 'build' && ev.setup) d = 60;
  return d;
}
function pushEvents(evs) { for (const e of evs) D.q.push(e); }
function directorIdle() { return !D.cur && !D.q.length; }
function directorUpdate(dt) {
  let budget = dt * 1000 * D.speed * (D.ff ? 5 : 1);
  let guard = 0;
  while (budget > 0 && guard++ < 400) {
    if (!D.cur) {
      if (!D.q.length) break;
      D.cur = D.q.shift();
      if (D.cur.snap) { M.disp = D.cur.snap; S3.setState(M.disp); }
      D.cur.rem = dur(D.cur);
      try { startEvent(D.cur); } catch (e) { console.error(e); }
      refreshHUD();
    }
    if (D.cur.rem > budget) { D.cur.rem -= budget; budget = 0; }
    else { budget -= D.cur.rem; D.cur = null; }
  }
  if (directorIdle() && M.on) onIdle();
}

// ------------------------------------------------------------------ event visuals
const cname = id => (E.CARDS[id] || {}).name || 'card';
const pname = side => M.st ? M.st.players[side].name : 'Player';
const teamOf = side => S3.TEAMHEX[side];
function startEvent(ev) {
  const st = ev.snap || M.disp;
  const vib = ms => { if (settings.haptics) Sound.vibrate(ms); };
  const fx = S3.fx;
  switch (ev.t) {
    case 'setupPhase': break;
    case 'kingdom': {
      showBanner('FLOOP YOUR LAND CARDS!', pname(st.first) + ' goes first', '#ffcf3a');
      S3.setSetup(false);
      fx.intro();
      Sound.play('floop'); setTimeout(() => Sound.play('holo'), 500); setTimeout(() => Sound.play('build'), 1100);
      logLine('Both kingdoms are set up. ' + pname(st.first) + ' goes first.', 'sys');
      break;
    }
    case 'turn': {
      M.sel = null; hideInfo(); updateHL();
      const mine = ev.side === M.viewer && M.seats[ev.side].kind === 'human';
      showBanner(mine ? 'YOUR TURN' : (pname(ev.side) + '’S TURN').toUpperCase(), 'Round ' + ev.round, teamOf(ev.side));
      Sound.play(mine ? 'turn' : 'oppTurn');
      logLine('— ' + pname(ev.side) + ' • round ' + ev.round + ' —', 'sys');
      break;
    }
    case 'draw': if (ev.side === M.viewer && !ev.silent) Sound.play('draw'); break;
    case 'discard': {
      Sound.play('discard');
      if (!ev.extra) logLine(pname(ev.side) + ' discards ' + (ev.side === M.viewer || M.mode === 'pvp' ? cname(ev.id) : 'a card') + ' and picks up a new one', 't' + ev.side);
      else logLine(pname(ev.side) + ' discards ' + cname(ev.id), 't' + ev.side);
      break;
    }
    case 'cast': {
      Sound.play('whoosh');
      flyCardToCenter(ev.id, ev.side);
      logLine(pname(ev.side) + ' casts ' + cname(ev.id), 't' + ev.side);
      if (ev.side !== M.viewer) oppSays(ev.side, 'I cast ' + cname(ev.id) + '!');
      break;
    }
    case 'summon': {
      if (ev.how === 'setup') break;
      fx.summon(ev.side, ev.lane, ev.uid);
      Sound.play(ev.token ? 'holo' : 'place'); if (!ev.token) setTimeout(() => Sound.play('holo'), 140);
      if (ev.how === 'raise') fx.text(ev.side, ev.lane, 'c', 'RAISED!', '#b9ff9f', true);
      else if (!ev.token) fx.text(ev.side, ev.lane, 'c', 'FLOOP!', teamOf(ev.side));
      logLine(pname(ev.side) + (ev.token ? ' gets ' : ev.how === 'raise' ? ' raises ' : ' floops ') + cname(ev.id) + (ev.token ? '' : ' onto the board'), 't' + ev.side);
      if (ev.side !== M.viewer && !ev.token && ev.how === 'play') oppSays(ev.side, 'I floop ' + cname(ev.id) + '!');
      break;
    }
    case 'build': {
      if (ev.setup) break;
      fx.build(ev.side, ev.lane, ev.uid);
      Sound.play('build');
      logLine(pname(ev.side) + ' builds ' + (ev.hidden && ev.side !== M.viewer ? 'a face-down building' : cname(ev.id)), 't' + ev.side);
      if (ev.side !== M.viewer && !ev.hidden && !ev.twin) oppSays(ev.side, 'I floop the ' + cname(ev.id) + '!');
      break;
    }
    case 'floop': {
      fx.floopCard(ev.side, ev.lane, ev.slot);
      fx.text(ev.side, ev.lane, ev.slot, ev.defense ? 'FLOOP! (defense)' : 'FLOOP!', teamOf(ev.side), true);
      Sound.play('floop'); vib(15);
      logLine(pname(ev.side) + ' floops ' + cname(ev.id) + (ev.defense ? ' to defend' : ''), 't' + ev.side);
      if (ev.side !== M.viewer) oppSays(ev.side, 'I floop the ' + cname(ev.id) + '!');
      break;
    }
    case 'ready': fx.text(ev.side, ev.lane, 'c', 'READY!', '#fff3a0'); Sound.play('select'); break;
    case 'activate': {
      fx.text(ev.side, ev.lane, 'c', 'ACTIVATE!', teamOf(ev.side));
      Sound.play('activate');
      const A = st.players[ev.side].lanes[ev.lane].creature;
      logLine(pname(ev.side) + ' activates ' + cname(A ? A.id : '') + ' to attack', 't' + ev.side);
      break;
    }
    case 'deactivate': Sound.play('click'); break;
    case 'study': fx.study(ev.side, ev.lane); fx.text(ev.side, ev.lane, 'b', 'STUDYING…', '#ffe27a', true); Sound.play('study'); logLine('The Ancient Scholar enters the Schoolhouse to study', 't' + ev.side); break;
    case 'move': if (!ev.forced) { Sound.play('whoosh'); logLine(pname(ev.side) + ' moves a creature', 't' + ev.side); } else Sound.play('whoosh'); break;
    case 'battleCall': {
      if (ev.attacks && ev.attacks.length) { showBanner('BATTLE PHASE!', ev.attacks.length + ' attacking', teamOf(ev.side)); Sound.play('fight'); }
      break;
    }
    case 'pending': break;
    case 'block': fx.text(ev.side, ev.lane, 'c', 'BLOCK!', teamOf(ev.side), true); Sound.play('block'); logLine(pname(ev.side) + ' steps in to block', 't' + ev.side); break;
    case 'unblock': Sound.play('click'); break;
    case 'defended': break;
    case 'fightPhase': if (ev.n) { stamp('FIGHT!', teamOf(ev.side)); } break;
    case 'attack': {
      const kind = ev.ranged ? 'ranged' : ev.flying && ev.kind === 'building' ? 'flying' : 'melee';
      fx.attack(ev.side, ev.lane, ev.toSide, ev.toLane, ev.kind === 'building' ? 'b' : 'c', kind);
      Sound.play(kind === 'melee' ? 'whoosh' : 'arrow');
      if (ev.storm) fx.text(ev.side, ev.lane, 'c', 'STORM THE KINGDOM!', teamOf(ev.side));
      break;
    }
    case 'fizzle': fx.text(ev.side, ev.lane, 'c', ev.why === 'collapse' ? 'COLLAPSED!' : 'NO TARGET', '#ffb07a', true); if (ev.why === 'collapse') { Sound.play('collapse'); react(ev.side, ['My Husker Knights draw energy from corn!', 'NOOO! My knights!', 'You just wiped out my entire attack!!']); } break;
    case 'scare': fx.scare(ev.side, ev.lane); fx.text(ev.side, ev.lane, 'c', 'SCARED TO DEATH!', '#c79bff', true); Sound.play('scare'); break;
    case 'stormHit': fx.hit(ev.side, ev.lane, 'c', 2, 'storm'); break;
    case 'storm': fx.storm(); showBanner('CEREBRAL BLOODSTORM', 'Every creature that fights this battle takes 2', '#ff5ac0'); Sound.play('storm'); break;
    case 'nightmares': fx.nightmares(); showBanner('FIELD OF NIGHTMARES', 'No floops or blocks for ' + pname(1 - ev.side), '#9a6aff'); Sound.play('scare'); break;
    case 'coldNose': fx.coldNose(); showBanner('COLD NOSE!', 'Ice covers every battlefield', '#9ae8ff'); Sound.play('freeze'); break;
    case 'damage': {
      fx.hit(ev.side, ev.lane, 'c', ev.n, ev.kind);
      if (ev.n > 0) {
        fx.text(ev.side, ev.lane, 'c', '-' + ev.n, ev.kind === 'burn' ? '#ffb070' : ev.kind === 'rot' ? '#a8ff7a' : ev.kind === 'storm' ? '#ff6ac8' : '#ff5a6a', ev.n >= 4);
        Sound.play(ev.kind === 'burn' ? 'burn' : ev.kind === 'rot' ? 'rot' : 'hit', ev.n);
        if (ev.n >= 4) { fx.shake(0.6); fx.hitstop(70); vib(30); } else vib(12);
      }
      if (ev.absorbed) fx.text(ev.side, ev.lane, 'c', '⛨' + ev.absorbed, '#9fd0ff');
      if (M.stats && ev.kind === 'fight') { if (ev.side === M.viewer) M.stats.taken += ev.n; else M.stats.dealt += ev.n; }
      break;
    }
    case 'bdamage': {
      fx.hit(ev.side, ev.lane, 'b', ev.n, ev.kind);
      fx.text(ev.side, ev.lane, 'b', '-' + ev.n, '#c9d4ff', ev.n >= 4);
      Sound.play('hit', ev.n);
      if (ev.n >= 4) fx.shake(0.5);
      if (M.stats && ev.kind === 'fight') { if (ev.side === M.viewer) M.stats.taken += ev.n; else M.stats.dealt += ev.n; }
      break;
    }
    case 'heal': fx.heal(ev.side, ev.lane); fx.text(ev.side, ev.lane, 'c', '+' + ev.n, '#7dff9a'); Sound.play('heal'); break;
    case 'death': {
      fx.death(ev.side, ev.lane, ev.uid, 'c');
      Sound.play('death'); vib(25);
      logLine(cname(ev.id) + ' is destroyed' + (ev.cause === 'volcano' ? ' by the lava' : ev.cause === 'scared' ? ' (scared to death)' : ''), 't' + ev.side);
      if (M.stats) { if (ev.side === M.viewer) M.stats.lost++; else M.stats.killed++; }
      break;
    }
    case 'bdeath': {
      fx.death(ev.side, ev.lane, ev.uid, 'b');
      if (!ev.spent) { Sound.play('collapse'); fx.shake(0.7); logLine(cname(ev.id) + (ev.cause === 'arrow' ? ' is destroyed by a corn-arrow' : ' falls'), 't' + ev.side); }
      break;
    }
    case 'status': {
      const L = { burn: ['BURN ' + ev.n, '#ff9a4a', 'burn'], chill: ev.n ? ['CHILL', '#bff3ff', 'freeze'] : null, freeze: ['FROZEN!', '#7fe3ff', 'freeze'], rot: ['ROT', '#a8ff7a', 'rot'], stuck: ['STUCK IN THE MUD!', '#d9a066', 'rot'], shield: ['SHIELD ' + ev.n, '#9fd0ff', 'shield'], thaw: ['THAW', '#dff', null], nap: ['Zzz… NAP', '#d9cff7', 'heal'] }[ev.s];
      if (L) { fx.text(ev.side, ev.lane, 'c', L[0], L[1]); if (L[2]) Sound.play(L[2]); }
      break;
    }
    case 'buff': {
      const parts = []; if (ev.atk) parts.push((ev.atk > 0 ? '+' : '') + ev.atk + ' ATK'); if (ev.def) parts.push((ev.def > 0 ? '+' : '') + ev.def + ' DEF');
      fx.text(ev.side, ev.lane, 'c', ev.mohawk ? 'MOHAWK! +' + ev.atk : ev.ripen ? '+1/+1' : ev.shy ? 'EMBARRASSED!' : parts.join(' '), (ev.atk || 0) < 0 ? '#9fd6ff' : '#fff3a0');
      break;
    }
    case 'eat': {
      const pig = st.players[ev.side].lanes[ev.lane].creature;
      fx.text(ev.side, ev.lane, 'c', 'CHOMP CHOMP!', '#ffd2a6', true);
      if (pig) S3.fx.visit(pig.uid, 1 - ev.side);
      Sound.play('eat'); fx.shake(0.4);
      break;
    }
    case 'land': {
      fx.land(ev.side, ev.lane, ev.cause);
      if (ev.cause === 'eat') { if (ev.type === 'corn') react(ev.side, ['NOOOO! He’s eating all my cornfields!', 'Pigs EAT corn?!', 'CORNFIELDS ARE AWESOME!']); logLine('The Pig eats a ' + E.LANDS[ev.type].name + '!', 'sys'); }
      else if (ev.cause === 'convert') { Sound.play('holo'); }
      else if (ev.cause === 'reclaim') Sound.play('heal');
      break;
    }
    case 'steal': {
      fx.steal(ev.from, ev.lane, ev.to, ev.toLane, ev.uid);
      fx.text(ev.to, ev.toLane, 'c', 'STOLEN!', teamOf(ev.to), true);
      react(ev.from, ['You ganked my creature!', 'AAAAGH!!!', 'That’s not fair!']);
      Sound.play('steal'); vib(30);
      logLine(pname(ev.to) + ' takes control of ' + cname(ev.id) + '!', 'sys');
      break;
    }
    case 'spirit': fx.steal(1 - ev.side, ev.lane, ev.side, ev.lane, ev.uid, 'spirit'); fx.text(ev.side, ev.lane, 'b', 'POSSESSED!', '#bfe8ff', true); Sound.play('zap'); if (ev.side === M.viewer) setTimeout(() => S3.fx.say(ev.side, ev.lane, 'b', 'Look! My Tower’s doin’ a thing!'), 200); break;
    case 'reap': Sound.play('steal'); break;
    case 'trap': fx.text(ev.side, ev.lane, 'b', 'TRAP! ' + cname(ev.id), '#ffe27a', true); fx.ring(ev.side, ev.lane, 'b', [1, 0.9, 0.4]); Sound.play('trap'); vib(30); logLine(cname(ev.id) + ' springs!', 'sys'); break;
    case 'reveal': {
      const silo = (() => { for (let l = 0; l < 4; l++) { const b = st.players[ev.to].lanes[l].building; if (b && b.id === 'c_silo') return l; } return -1; })();
      if (silo >= 0) fx.silo(ev.to, silo);
      if (ev.to === M.viewer && M.seats[ev.to].kind === 'human') { if (!(M.st.pending && M.st.pending.side === M.viewer)) showReveal(ev.cards, ev.traps); }
      else if (ev.side === M.viewer) toast('The Silo of Truth reveals your hand!');
      Sound.play('zap');
      break;
    }
    case 'stealCard': { toast((ev.to === M.viewer ? 'You take ' : pname(ev.to) + ' takes ') + cname(ev.id) + '!'); Sound.play('steal'); logLine(pname(ev.to) + ' takes ' + cname(ev.id) + ' from the other hand', 'sys'); if (ev.to !== M.viewer) oppSays(ev.to, 'Pfff, you got really lame cards. I’ll take the ' + cname(ev.id) + ', though.'); break; }
    case 'zap': fx.zap(ev.from.side, ev.from.lane, ev.from.slot, ev.to.side, ev.to.lane, ev.to.slot === 'hero' ? 'b' : ev.to.slot, ev.kind); Sound.play(ev.kind === 'arrow' ? 'arrow' : 'zap'); break;
    case 'crash': fx.text(ev.side, ev.to, 'c', 'CRASH!', '#bff3ff'); fx.shake(0.4); break;
    case 'say': if (ev.text) speak(ev.side, ev.text); break;
    case 'volcano': {
      fx.volcano(ev.side, ev.lane); Sound.play('volcano'); vib(80);
      showBanner('VOLCANO!', 'Lava destroys everything on the board', '#ff6b3d');
      if (ev.side !== M.viewer) oppSays(ev.side, 'Heh heh heh... I floop the Volcano!');
      break;
    }
    case 'wander': break;
    case 'immortal': toast(cname(ev.id) + ' is Immortal — back to hand!'); break;
    case 'immune': fx.text(ev.side, ev.lane, 'c', ev.cool ? 'Too cool!' : ev.volcano ? 'Safe!' : 'Can’t touch it!', ev.cool ? '#9fe8ff' : '#d9cff7'); break;
    case 'overtime': showBanner('OVERTIME', 'The kingdoms crumble: -' + ev.n + ' to everything', '#ff6a6a'); break;
    case 'judges': showBanner('TIME!', 'Tourney rules: the bigger kingdom wins', '#ffcf3a'); break;
    case 'handFull': if (ev.side === M.viewer) toast('Hand full!'); break;
    case 'deckEmpty': if (ev.side === M.viewer && !ev.silent) toast('Your deck is empty'); break;
    case 'gameOver': S3.oppReact(ev.winner === 1 - M.viewer ? 'win' : 'lose'); break;
  }
}
// Opponent reactions to big moments (AI seats only, rate-limited).
let reactAt = 0;
function react(side, lines) {
  if (!M.seats || !M.seats[side] || M.seats[side].kind !== 'ai') return;
  const now = performance.now(); if (now - reactAt < 5000) return;
  reactAt = now; speak(side, lines[Math.floor(Math.random() * lines.length)]);
  S3.oppReact('hit');
}
let oppSayAt = 0;
function oppSays(side, text) {
  if (!M.seats || M.seats[side].kind !== 'ai') return;
  const now = performance.now(); if (now - oppSayAt < 1600) return;
  oppSayAt = now; speak(side, text);
}
function stamp(txt, color) { showBanner(txt, '', color, true); }
function showBanner(txt, sub, color, quick) {
  const b = $('#banner'); b.classList.remove('on'); void b.offsetWidth;
  b.innerHTML = '<div style="--bc:' + (color || '#3fc8ff') + '">' + esc(txt) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  b.classList.add('on');
  clearTimeout(showBanner.t); showBanner.t = setTimeout(() => b.classList.remove('on'), (quick ? 900 : 1300) / D.speed);
}
function flyCardToCenter(id, side) {
  const el = cardEl(id, {}); el.style.position = 'fixed'; el.style.zIndex = 60; el.style.pointerEvents = 'none'; el.style.fontSize = '1.7rem';
  const from = side === M.viewer ? $('#hand').getBoundingClientRect() : $('#opp').getBoundingClientRect();
  el.style.left = (from.left + from.width / 2) + 'px'; el.style.top = (from.top + from.height / 2) + 'px';
  el.style.transform = 'translate(-50%,-50%) scale(.4)'; el.style.transition = 'all .35s cubic-bezier(.2,.8,.2,1)';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.left = (window.innerWidth / 2) + 'px'; el.style.top = (window.innerHeight * 0.42) + 'px'; el.style.transform = 'translate(-50%,-50%) scale(1) rotate(-3deg)'; });
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translate(-50%,-50%) scale(1.25)'; }, 560 / D.speed);
  setTimeout(() => el.remove(), 1000 / D.speed);
}
function showReveal(cards, traps) {
  const wrap = document.createElement('div');
  wrap.className = 'reveal';
  const t = document.createElement('div'); t.className = 'rt'; t.textContent = 'SILO OF TRUTH: their hand' + (traps && traps.length ? ' • face-down: ' + traps.map(x => cname(x.id)).join(', ') : '');
  wrap.appendChild(t);
  for (const id of cards) { const c = cardEl(id, { mini: true }); c.style.fontSize = '1.1rem'; wrap.appendChild(c); }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2600 / D.speed);
}
function speak(side, text) {
  if (!text) return;
  const seat = side === M.viewer ? $('#me') : $('#opp');
  const old = seat.querySelector('.bubble'); if (old) old.remove();
  const b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
  seat.appendChild(b); setTimeout(() => b.remove(), 2600);
}

// ------------------------------------------------------------------ log
function logLine(txt, cls) { M.log.push({ txt, cls }); if (M.log.length > 300) M.log.shift(); if ($('#logDrawer').classList.contains('on')) renderLog(); }
function renderLog() {
  const d = $('#logDrawer');
  d.innerHTML = '<b>Battle log</b>' + M.log.slice(-120).map(l => '<div class="l ' + (l.cls || '') + '">' + esc(l.txt) + '</div>').join('');
  d.scrollTop = d.scrollHeight;
}

// ------------------------------------------------------------------ HUD
function seatHTML(side) {
  const P = M.st.players[side];
  return '<div class="pf" style="--c:' + teamOf(side) + '"><img alt="" src="' + Art.portraitURL(P.hero, 96) + '"></div>' +
    '<div class="who"><div class="nm"><span class="nmt">' + esc(P.name) + '<small class="sub"></small></span><span class="gems" title="Actions"></span></div>' +
    '<div class="kd" title="Kingdom: creatures + buildings. Empty at the end of a turn = you lose.">' + ICON.castle + '<b class="kn"></b><span class="kl">kingdom</span></div>' +
    '<div class="chips"><span class="chip" title="Hand">' + ICON.cards + '<b class="hc"></b></span><span class="chip" title="Deck">' + ICON.deck + '<b class="dc"></b></span>' +
    '<span class="chip" title="Discard pile">' + ICON.grave + '<b class="gc"></b></span></div></div>';
}
function buildHUD() {
  const me = M.viewer, op = 1 - me;
  $('#opp').innerHTML = seatHTML(op);
  $('#me').innerHTML = seatHTML(me) + '<div class="mebtns"><button class="btn blue small drawbtn" id="drawBtn"><b>PICK UP</b>1⚡</button></div>';
  $('#drawBtn').onclick = () => { Sound.unlock(); humanCmd({ t: 'draw', p: M.viewer }); };
  $('#me .pf').onclick = () => inspectSeat(me); $('#opp .pf').onclick = () => inspectSeat(op);
  S3.setOpponent(M.st.players[op].hero);
}
function inspectSeat(side) {
  const st = M.disp || M.st, P = st.players[side];
  const lands = P.lanes.map(L => E.LANDS[L.land.type].name + (L.land.down ? (L.land.scorch ? ' (scorched)' : ' (eaten)') : '')).join(', ');
  const pieces = []; P.lanes.forEach(L => { if (L.creature) pieces.push(cname(L.creature.id)); if (L.building) pieces.push(L.building.hidden && side !== M.viewer ? 'a face-down building' : cname(L.building.id)); });
  modal('<h2>' + esc(P.name) + '</h2><p><b>Kingdom:</b> ' + E.kingdomSize(st, side) + ' (' + esc(pieces.join(', ') || 'empty!') + ')<br>Hand: ' + P.hand.length + ' • Deck: ' + P.deck.length + ' • Discard: ' + P.discard.length + '<br>Landscapes: ' + esc(lands) + '</p>' +
    '<p style="font-size:.75rem;color:#b6a9d6">Discard pile: ' + (P.discard.map(c => esc(cname(c.id))).join(', ') || 'empty') + '</p>');
}
function refreshSeat(el, side) {
  const st = M.disp; if (!st || !el.firstChild) return;
  const P = st.players[side];
  const k = E.kingdomSize(st, side);
  const kn = el.querySelector('.kn'); if (kn) { if (kn.textContent !== String(k)) { kn.textContent = k; const kd = el.querySelector('.kd'); kd.classList.remove('pop'); void kd.offsetWidth; kd.classList.add('pop'); } }
  el.querySelector('.kd').classList.toggle('danger', k <= 2 && st.phase === 'main');
  el.querySelector('.hc').textContent = P.hand.length; el.querySelector('.dc').textContent = P.deck.length; el.querySelector('.gc').textContent = P.discard.length;
  const g = el.querySelector('.gems');
  const setup = st.phase === 'setup' && !P.ready && M.seats[side].kind === 'human';
  const act = (st.active === side && st.phase === 'main') || setup;
  const n = act ? P.actions : 0, max = Math.max(2, n);
  if (g.childElementCount !== max) g.innerHTML = Array.from({ length: max }, () => '<i class="gem"></i>').join('');
  g.querySelectorAll('.gem').forEach((x, i) => x.classList.toggle('on', i < n));
  el.classList.toggle('turn', st.active === side && st.phase === 'main');
  const sub = el.querySelector('.sub');
  if (sub) sub.textContent = st.phase === 'setup' ? (P.ready ? 'ready' : 'setting up…') : st.pending && st.pending.side === side && st.pending.kind === 'defend' ? 'defending' : st.active === side && st.phase === 'main' ? (side === M.viewer && M.seats[side].kind === 'human' ? 'your turn' : 'thinking…') : '';
}
function refreshHUD() {
  if (!M.disp || !M.st) return;
  refreshSeat($('#me'), M.viewer); refreshSeat($('#opp'), 1 - M.viewer);
  renderHand();
  const P = M.disp.players[M.viewer];
  const myTurn = isMyTurn();
  const db = $('#drawBtn'); if (db) db.disabled = !myTurn || P.actions < 1 || P.hand.length >= E.HAND_MAX || !P.deck.length;
  updateFightBtn();
  updatePrompt();
  $('#undoBtn').classList.toggle('off', !(M.undo && (myTurn || mySetup())));
}
function humanSeat(side) { return M.seats && M.seats[side] && M.seats[side].kind === 'human'; }
function isMyTurn() { return M.on && !M.ended && M.st && M.st.phase === 'main' && humanSeat(M.st.active) && M.st.active === M.viewer && directorIdle() && !M.st.pending && !M.waitingPass; }
function mySetup() { return M.on && !M.ended && M.st && M.st.phase === 'setup' && humanSeat(M.viewer) && !M.st.players[M.viewer].ready && directorIdle() && !M.waitingPass; }
function myPending(kind) { const pd = M.st && M.st.pending; return M.on && !M.ended && pd && pd.side === M.viewer && humanSeat(M.viewer) && (!kind || pd.kind === kind) && directorIdle() && !M.waitingPass; }
function canAct() { return isMyTurn() || mySetup(); }
function updateFightBtn() {
  const b = $('#fightBtn'), t = b.querySelector('.t'), small = b.querySelector('small');
  b.classList.remove('ready', 'wait', 'land', 'def');
  if (!M.st || M.ended) { small.textContent = ''; return; }
  b.disabled = false;
  if (mySetup()) { b.classList.add('land'); t.textContent = 'FLOOP LAND CARDS!'; const n = M.st.players[M.viewer].actions; small.textContent = n ? n + ' setup Action' + (n > 1 ? 's' : '') + ' left' : 'kingdom ready'; if (!n) b.classList.add('ready'); return; }
  if (myPending('defend')) {
    b.classList.add('def'); t.textContent = 'DONE DEFENDING';
    const nb = Object.keys(M.st.blocks || {}).length;
    small.textContent = nb ? nb + ' block' + (nb > 1 ? 's' : '') + ' set' : 'no defense'; return;
  }
  t.textContent = 'BATTLE!';
  if (!isMyTurn()) { b.classList.add('wait'); b.disabled = true; small.textContent = M.st.phase === 'setup' ? 'setting up' : M.st.pending && M.st.pending.side === M.viewer && M.st.pending.kind === 'discard' ? 'discard first' : M.st.active === M.viewer ? '…' : 'opponent’s turn'; return; }
  const P = M.st.players[M.viewer];
  const n = P.attacks.length;
  const sum = E.actionsLeftSummary(M.st, M.viewer);
  small.textContent = n ? n + ' attacking' + (sum.attacks ? ' • ' + sum.attacks + ' more can' : '') : (sum.attacks ? 'no attacks yet • ' + sum.attacks + ' can attack' : 'no attacks');
  if (!sum.cards && !sum.floops && !sum.attacks) b.classList.add('ready');
}
// The prompt bar: what the show's players say out loud at each step.
function updatePrompt() {
  const p = $('#prompt');
  let html = '', key = '';
  if (!M.on || M.ended || !M.st) { p.classList.remove('on'); return; }
  const st = M.st;
  if (mySetup()) { key = 'setup'; html = '<b>Set up your kingdom!</b> Floop creatures and buildings onto your lands (2 setup Actions). Your opponent can’t see them yet.'; }
  else if (myPending('discard')) { key = 'discard' + (M.sel && M.sel.kind === 'discard' ? M.sel.uid : ''); html = '<b>Discard a card and pick up a new one.</b> Tap the card to discard' + (M.sel && M.sel.kind === 'discard' ? ': <button class="btn small red" id="discardOk">Discard ' + esc(cname(M.sel.id)) + '</button>' : '.'); }
  else if (myPending('defend')) { const n = st.players[st.active].attacks.length; key = 'defend' + n; html = '<b>' + esc(pname(st.active)) + ' attacks' + (n ? ' with ' + n : '') + '!</b> What’ll you use to defend? Tap a glowing creature to floop or block.'; }
  else if (myPending('steal')) { key = 'steal'; html = '<b>Silo of Truth:</b> take a card.'; }
  if (!html) { p.classList.remove('on'); M.promptKey = ''; return; }
  if (key !== M.promptKey) { p.innerHTML = html; M.promptKey = key; const ok = $('#discardOk'); if (ok) ok.onclick = () => { const s = M.sel; clearSel(); humanCmd({ t: 'discard', p: M.viewer, uid: s.uid }); }; }
  p.classList.add('on');
}

// ------------------------------------------------------------------ hand
let handSig = '';
function renderHand() {
  const st = M.disp; if (!st) return;
  if (drag && drag.moved) { handSig = ''; return; }
  const me = M.viewer, P = st.players[me];
  const human = humanSeat(me);
  const hidden = !human || M.waitingPass || (M.mode === 'pvp' && st.pending && st.pending.kind === 'defend');
  const discarding = myPending('discard');
  const sig = P.hand.map(c => c.uid).join(',') + '|' + (M.sel && (M.sel.uid || M.sel.kind)) + '|' + P.actions + '|' + canAct() + discarding + hidden + document.body.className + window.innerWidth + 'x' + window.innerHeight + landsSig(st, me) + (artPending ? 'a' + S3.artVersion : '');
  if (sig === handSig) return;
  handSig = sig; artPending = false;
  const h = $('#hand'); h.innerHTML = '';
  const n = P.hand.length; if (!n) return;
  const wide = document.body.classList.contains('wide');
  const box = h.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
  let positions = [];
  if (!wide) {
    const cw = 4.9 * fs, chh = 6.9 * fs;
    const maxW = box.width - 12, step = n > 1 ? Math.min(cw * 0.92, (maxW - cw) / (n - 1)) : 0;
    const total = cw + step * (n - 1), x0 = (box.width - total) / 2;
    for (let i = 0; i < n; i++) { const c = i - (n - 1) / 2; positions.push({ x: x0 + i * step, y: box.height - chh - 8 + c * c * 2.2, rot: c * 3.2, fs: 1 }); }
  } else {
    const cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    let wpx = (box.width - (cols - 1) * 8) / cols, hpx = wpx * 6.9 / 4.9;
    if (rows * (hpx + 8) > box.height) { hpx = (box.height - (rows - 1) * 8) / rows; wpx = hpx * 4.9 / 6.9; }
    const sc = wpx / (4.9 * fs);
    for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), c = i % cols; const rowCount = Math.min(cols, n - r * cols); const off = (box.width - (rowCount * wpx + (rowCount - 1) * 8)) / 2; positions.push({ x: off + c * (wpx + 8), y: r * (hpx + 8), rot: 0, fs: sc }); }
  }
  P.hand.forEach((inst, i) => {
    const why = hidden ? 'hidden' : discarding ? '' : E.playBlock(st, me, inst.uid);
    const cost = E.spellCost(st, me, E.CARDS[inst.id]);
    const el = hidden ? cardEl('?', { back: true }) : cardEl(inst.id, { lvl: inst.lvl, mini: !wide || positions[i].fs < 1.4, dim: !!why && canAct(), cost });
    const pos = positions[i];
    el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; el.style.fontSize = pos.fs + 'rem';
    const selected = M.sel && M.sel.uid === inst.uid;
    el.style.transform = selected ? 'translateY(-' + (wide ? 0.4 : 1.6) + 'rem) scale(' + (wide ? 1.04 : 1.12) + ')' : 'rotate(' + pos.rot + 'deg)';
    if (selected) el.classList.add('sel');
    if (discarding) el.classList.add('discardable');
    el.dataset.uid = inst.uid;
    if (!hidden) attachCardInput(el, inst);
    h.appendChild(el);
  });
}
function landsSig(st, me) { return st.players[me].lanes.map(L => L.land.type[0] + (L.land.down ? 1 : 0)).join(''); }

// ------------------------------------------------------------------ selection, highlights and arrows
function clearSel() { M.sel = null; S3.setGhost(null); hideTip(); hideInfo(); updateHL(); handSig = ''; renderHand(); updatePrompt(); }
function attackArrows(st) {
  const out = [];
  if (!st || st.phase !== 'main') return out;
  const a = st.active, P = st.players[a];
  for (const uid of P.attacks) {
    const f = E.findCreature(st, uid); if (!f || f.side !== a) continue;
    const bu = st.blocks ? st.blocks[uid] : null;
    if (bu != null) { const b = E.findCreature(st, bu); if (b) { out.push({ side: a, lane: f.lane, toSide: b.side, toLane: b.lane, toSlot: 'c', col: [1, 1, 1] }); continue; } }
    const t = E.attackTarget(st, a, f.lane);
    if (t) out.push({ side: a, lane: f.lane, toSide: t.side, toLane: t.lane, toSlot: t.slot });
  }
  return out;
}
function updateHL() {
  const hl = [];
  S3.setSelection(null);
  const st = M.st;
  if (!st || !M.on) { S3.setHighlights([]); S3.setArrows([]); S3.setPreview(null); return; }
  S3.setArrows(directorIdle() ? attackArrows(st) : attackArrows(M.disp));
  const me = M.viewer, sel = M.sel;
  if (myPending('defend')) {
    for (const o of E.defenseOptions(st, me)) if (o.t === 'floop') hl.push({ side: me, lane: o.lane, slot: o.slot, kind: 'ok' });
    for (const o of E.blockOptions(st, me)) hl.push({ side: me, lane: o.lane, slot: 'c', kind: 'ok' });
    if (sel && sel.kind === 'block') { for (const o of E.blockOptions(st, me).filter(x => x.lane === sel.lane)) { const f = E.findCreature(st, o.at); if (f) hl.push({ side: f.side, lane: f.lane, slot: 'c', kind: 'tgt' }); } }
    if (sel && sel.lane != null) S3.setSelection({ side: sel.side == null ? me : sel.side, lane: sel.lane, slot: sel.slot || 'c' });
    S3.setHighlights(dedupeHL(hl)); S3.setPreview(null);
    return;
  }
  if (!sel) { S3.setHighlights([]); S3.setPreview(isMyTurn() ? battlePreview() : null); return; }
  S3.setPreview(null);
  if (sel.kind === 'card') {
    const cd = E.CARDS[sel.id];
    if (cd.type === 'spell') { for (const o of targetOptsFor(sel)) hl.push(o); }
    else for (const l of E.playLanes(st, me, sel.uid)) hl.push({ side: me, lane: l, slot: cd.type === 'creature' ? 'c' : 'b', kind: 'ok', play: true });
  } else if (sel.kind === 'target') {
    for (const o of targetOptsFor(sel)) hl.push(o);
    if (sel.lane != null) S3.setSelection({ side: me, lane: sel.lane, slot: sel.slot });
  } else if (sel.kind === 'creature' || sel.kind === 'building' || sel.kind === 'enemy') {
    S3.setSelection({ side: sel.side, lane: sel.lane, slot: sel.slot });
    if (sel.kind === 'creature' && isMyTurn()) for (const m of E.moveOptions(st, me, sel.lane)) hl.push({ side: me, lane: m.to, slot: 'c', kind: 'ok', move: true, cost: m.cost });
    if (sel.kind === 'creature' && isMyTurn()) { const t = E.attackTarget(st, me, sel.lane); if (t) hl.push({ side: t.side, lane: t.lane, slot: t.slot, kind: 'atk' }); }
  }
  S3.setHighlights(dedupeHL(hl));
}
function dedupeHL(a) { const seen = {}; return a.filter(h => { const k = h.side + ':' + h.lane + ':' + h.slot; if (seen[k]) return false; seen[k] = 1; return true; }); }
function targetOptsFor(sel) {
  const st = M.st, me = M.viewer;
  const src = sel.uid != null && sel.kind !== 'target' ? { uid: sel.uid } : sel.src;
  const chosen = sel.chosen || [];
  if (!src) return [];
  const opts = E.targetOptions(st, me, src, chosen) || [];
  return opts.filter(o => o.uid == null).map(o => ({ side: o.side, lane: o.lane, slot: o.land ? 'land' : 'c', kind: o.side === me ? 'ok' : 'tgt', opt: o }));
}
const STEP_TEXT = {
  enemyCreature: 'Choose an enemy creature', enemyDamaged: 'Choose a damaged enemy creature', allyCreature: 'Choose one of your creatures', anyCreature: 'Choose a creature',
  myFlooped: 'Choose one of your flooped creatures', myOtherFlooped: 'Choose another of your flooped creatures', anyMovable: 'Choose a creature to move', emptyLaneSameSide: 'Choose an empty lane for it',
  myLand: 'Choose one of your landscapes', anyLand: 'Choose a landscape', adjEmptyLane: 'Choose an adjacent empty lane', myDiscardCreature: 'Choose a creature from your discard pile',
  myEmptyLane: 'Choose an empty lane', myMovable: 'Choose one of your creatures', pushDir: 'Choose which way to push', enemyNearMyBuilding: 'Choose an enemy in a lane with your building',
  myHandOther: 'Choose a card to discard'
};
function showTip(html) { const t = $('#tip'); t.innerHTML = html; t.classList.add('on'); }
function hideTip() { $('#tip').classList.remove('on'); }
function cardTip(inst) {
  const cd = E.CARDS[inst.id], why = E.playBlock(M.st, M.viewer, inst.uid);
  const s = lvlStats(cd, inst.lvl);
  let h = '<h4>' + esc(cd.name) + ' <span style="opacity:.7;font-size:.7rem">' + esc(typeLine(cd)) + '</span></h4>';
  if (cd.type === 'creature') h += '<span class="kw">' + s.atk + '/' + s.def + '</span> • ';
  if (cd.type === 'building') h += '<span class="kw">' + s.def + ' DEF</span> • ';
  h += fmtText(cd.text || '');
  if (why) h += '<div class="warn">' + esc(why) + '</div>';
  else h += '<div style="opacity:.7;margin-top:.15rem">' + (cd.type === 'spell' ? (E.targetSteps(M.st, M.viewer, { uid: inst.uid }).length ? 'Tap or drag onto a target.' : 'Tap the board or drag it up to cast.') : 'Drag it onto a glowing spot, or tap a spot.') + ' Hold for details.</div>';
  return h;
}

// ------------------------------------------------------------------ commands
function snapApply(st, cmd) {
  const s = E.clone(st), ev = [];
  ev.push = function (e) { e.snap = E.clone(s); return Array.prototype.push.call(this, e); };
  const r = E.apply(s, cmd, { inPlace: true, events: ev });
  return { state: s, events: ev, error: r.error };
}
function exec(cmd, who) {
  const r = snapApply(M.st, cmd);
  if (r.error) return r;
  const reveals = r.events.some(e => e.rng || e.info || e.t === 'draw' || e.t === 'trap' || e.t === 'reveal' || e.t === 'turn' || e.t === 'stealCard' || e.t === 'pending');
  if (who === 'human') M.undo = M.mode === 'tutorial' || reveals || cmd.t === 'battle' || cmd.t === 'ready' || cmd.t === 'discard' || cmd.t === 'defend' || (M.st.pending && M.st.pending.kind === 'defend') ? null : { state: M.st, log: M.log.length };
  else M.undo = null;
  M.st = r.state;
  pushEvents(r.events);
  if (M.tutorial && M.tutorial.onCmd) M.tutorial.onCmd(cmd, r);
  return r;
}
function humanCmd(cmd) {
  const allowed = isMyTurn() || (mySetup() && (cmd.t === 'play' || cmd.t === 'ready')) || (myPending('defend') && /floop|block|defend/.test(cmd.t)) || (myPending('discard') && cmd.t === 'discard');
  if (!allowed) return false;
  if (M.tutorial && M.tutorial.allow && !M.tutorial.allow(cmd)) { Sound.play('error'); return false; }
  const r = exec(cmd, 'human');
  if (r.error) { Sound.play('error'); toast(r.error); return false; }
  if (cmd.t === 'battle' || cmd.t === 'ready' || cmd.t === 'defend' || cmd.t === 'discard') Sound.play('click');
  clearSel();
  return true;
}
function doUndo() {
  if (!M.undo || !(isMyTurn() || mySetup())) return;
  M.st = M.undo.state; M.log.length = Math.min(M.log.length, M.undo.log); M.undo = null;
  M.disp = M.st; S3.clearFx(); S3.setState(M.st, { instant: true });
  clearSel(); refreshHUD(); updateHL();
  Sound.play('select'); toast('Undone');
}

// ------------------------------------------------------------------ idle / AI / turn flow
let aiTimer = 0;
function onIdle() {
  if (!M.on) return;
  M.disp = M.st; S3.setState(M.st);
  if (M.st.winner != null && !M.ended) { M.ended = true; S3.setPreview(null); S3.setHighlights([]); S3.setArrows([]); setTimeout(() => finish(), 1100); refreshHUD(); return; }
  if (M.ended) return;
  const st = M.st;
  if (st.phase === 'mulligan') return;
  const who = uiActor(st);
  if (who < 0) return;
  const seat = M.seats[who];
  if (seat.kind === 'ai') { if (aiTimer > 0) return; aiStep(who); return; }
  // a human seat has to act
  if (M.mode === 'pvp' && who !== M.viewer && !M.waitingPass) { passDevice(who); return; }
  if (st.pending && st.pending.side === who) {
    if (st.pending.kind === 'steal' && !M.choosing) humanChooseSteal(st.pending);
    if (st.pending.kind === 'defend' && M.idleKey !== 'def' + st.turn) { M.idleKey = 'def' + st.turn; updateHL(); refreshHUD(); if (M.tutorial && M.tutorial.onIdle) M.tutorial.onIdle(); }
    if (st.pending.kind === 'discard' && M.idleKey !== 'dis' + st.turn) { M.idleKey = 'dis' + st.turn; refreshHUD(); if (M.tutorial && M.tutorial.onIdle) M.tutorial.onIdle(); }
    return;
  }
  if (st.phase === 'setup') { if (M.idleKey !== 'setup' + who) { M.idleKey = 'setup' + who; refreshHUD(); updateHL(); if (M.tutorial && M.tutorial.onIdle) M.tutorial.onIdle(); } return; }
  if (M.idleKey !== 'turn' + st.turn) { M.idleKey = 'turn' + st.turn; updateHL(); refreshHUD(); startTimer(); if (M.tutorial && M.tutorial.onIdle) M.tutorial.onIdle(); }
}
// Who acts next. During kingdom setup the AI seats set up first, so a human never waits on them.
function uiActor(st) {
  if (st.phase === 'setup') {
    const order = [st.first, 1 - st.first];
    for (const p of order) if (!st.players[p].ready && M.seats[p].kind === 'ai') return p;
    for (const p of order) if (!st.players[p].ready) return p;
    return -1;
  }
  return AI.actor(st);
}
function aiStep(me) {
  const st = M.st, seat = M.seats[me], ctx = M.ai[me];
  let cmd = seat.plan ? seat.plan(st, me) : null;
  if (!cmd) cmd = AI.decide(st, me, { difficulty: seat.difficulty, personality: seat.personality, seed: (E.hashSeed(M.cfg.seed) + st.turn * 977 + (M.aiN = (M.aiN || 0) + 1)) >>> 0 }, ctx);
  if (!cmd) { aiTimer = 0.2; return; }
  let r = exec(cmd, 'ai');
  if (r.error) {
    ctx.plan = null;
    const fb = st.phase === 'setup' ? { t: 'ready', p: me } : st.pending && st.pending.kind === 'defend' ? { t: 'defend', p: me } : st.pending && st.pending.kind === 'discard' ? { t: 'discard', p: me, uid: st.players[me].hand[0] && st.players[me].hand[0].uid } : { t: 'battle', p: me };
    r = exec(fb, 'ai');
    if (r.error) { aiTimer = 0.5; return; }
  }
  AI.observe(ctx, r.events);
  aiTimer = (st.phase === 'setup' ? 0.02 : cmd.t === 'activate' ? 0.18 : 0.32) / D.speed;
  if (cmd.t === 'battle' && Math.random() < 0.3) maybeAITaunt(me);
  if (cmd.lane != null && st.phase === 'main') S3.setSelection({ side: me, lane: cmd.lane, slot: cmd.slot || 'c' });
}
function maybeAITaunt(side) {
  const seat = M.seats[side]; if (!seat.lines || Math.random() > 0.5) return;
  speak(side, seat.lines[Math.floor(Math.random() * seat.lines.length)]);
}
function passDevice(next) {
  M.waitingPass = true; handSig = ''; renderHand(); stopTimer();
  const P = M.st.players[next];
  const why = M.st.pending && M.st.pending.kind === 'defend' ? '<b>' + esc(pname(M.st.active)) + ' is attacking!</b> ' : M.st.phase === 'setup' ? 'Set up your kingdom in secret. ' : '';
  modal('<h2>Pass to ' + esc(P.name) + '</h2><p class="center">' + why + 'No peeking at their hand! Hand the device over, then tap ready.</p><div class="row"><button class="btn" data-ready>I’m ' + esc(P.name) + ' — ready!</button></div>', { noClose: true });
  $('#modal [data-ready]').onclick = () => {
    closeModal(); M.waitingPass = false; M.viewer = next; S3.setViewer(next); S3.setState(M.st, { instant: true }); S3.resetView();
    buildHUD(); handSig = ''; M.idleKey = ''; refreshHUD(); updateHL(); layout();
  };
}
function humanChooseSteal(pd) {
  M.choosing = true;
  const O = M.st.players[pd.from];
  const d = modal('<h2>Silo of Truth</h2><p class="center">You see ' + esc(O.name) + '’s whole hand. Take one card:</p><div class="row" id="stealRow"></div><div class="row"><button class="btn ghost small" data-skip>Take nothing</button></div>', { noClose: true, wide: true });
  const row = d.querySelector('#stealRow');
  const traps = []; for (let l = 0; l < 4; l++) { const b = O.lanes[l].building; if (b && b.hidden) traps.push(cname(b.id) + ' (lane ' + (l + 1) + ')'); }
  if (traps.length) row.insertAdjacentHTML('beforebegin', '<p class="center" style="color:#ffe27a;font-size:.8rem">Face-down: ' + esc(traps.join(', ')) + '</p>');
  for (const c of O.hand) {
    const ok = pd.options.includes(c.uid);
    const el = cardEl(c.id, { lvl: c.lvl, dim: !ok }); el.style.fontSize = '1.15rem'; el.style.cursor = ok ? 'pointer' : 'default';
    if (ok) el.onclick = () => { closeModal(); M.choosing = false; exec({ t: 'choose', p: pd.side, uid: c.uid }, 'human'); };
    row.appendChild(el);
  }
  d.querySelector('[data-skip]').onclick = () => { closeModal(); M.choosing = false; exec({ t: 'choose', p: pd.side, uid: null }, 'human'); };
}

// ------------------------------------------------------------------ battle preview (what the declared attacks would do)
function battlePreview() {
  const st = M.st, me = M.viewer; if (!st || st.active !== me || !st.players[me].attacks.length) return null;
  const red = E.redact(st, me);
  const pv = E.previewBattle(red); if (!pv.state) return null;
  const out = [];
  const o = 1 - me;
  for (let l = 0; l < 4; l++) {
    for (const side of [o, me]) {
      const a = st.players[side].lanes[l].creature, b = pv.state.players[side].lanes[l].creature;
      if (!a) continue;
      if (!b || b.uid !== a.uid) out.push({ side, lane: l, slot: 'c', txt: 'KO', col: side === o ? '#7dff9a' : '#ff6a6a' });
      else if (b.dmg > a.dmg) out.push({ side, lane: l, slot: 'c', txt: '-' + (b.dmg - a.dmg), col: side === o ? '#ffd24a' : '#ff9a9a' });
    }
    const ba = st.players[o].lanes[l].building, bb = pv.state.players[o].lanes[l].building;
    if (ba && (!bb || bb.dmg > ba.dmg)) out.push({ side: o, lane: l, slot: 'b', txt: bb ? '-' + (bb.dmg - ba.dmg) : 'KO', col: '#ffd24a' });
  }
  return out;
}
function actionPreview(cmd) {
  const st = M.st, me = M.viewer;
  const red = E.redact(st, me);
  const r = E.apply(red, cmd); if (r.error) return null;
  const out = [];
  for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) {
    const a = st.players[side].lanes[l].creature, b = r.state.players[side].lanes[l].creature;
    if (a && (!b || b.uid !== a.uid)) { if (!r.events.some(e => (e.t === 'steal' || e.t === 'move') && e.uid === a.uid)) out.push({ side, lane: l, slot: 'c', txt: 'KO', col: '#7dff9a' }); }
    else if (a && b && b.dmg > a.dmg) out.push({ side, lane: l, slot: 'c', txt: '-' + (b.dmg - a.dmg), col: '#ffd24a' });
  }
  return out;
}

// ------------------------------------------------------------------ input: hand cards
let drag = null;
function attachCardInput(el, inst) {
  el.onpointerdown = e => {
    if (e.button > 0) return;
    Sound.unlock();
    M.lastTouch = e.pointerType !== 'mouse';
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, t: performance.now() };
    drag = { inst, el, start, moved: false, ghost: null, pid: e.pointerId, long: null };
    drag.long = setTimeout(() => { if (drag && !drag.moved) { const d = drag; drag = null; inspect(d.inst.id, d.inst.lvl); } }, 480);
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };
  el.onpointermove = e => {
    if (!drag || drag.inst !== inst) return;
    const dx = e.clientX - drag.start.x, dy = e.clientY - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) > 9) {
      drag.moved = true; clearTimeout(drag.long);
      if (myPending('discard')) { drag = null; return; }
      if (!canAct() || E.playBlock(M.st, M.viewer, inst.uid)) { const why = canAct() ? E.playBlock(M.st, M.viewer, inst.uid) : 'Not your turn'; toast(why); Sound.play('error'); drag = null; return; }
      selectCard(inst, true);
      const g = cardEl(inst.id, { lvl: inst.lvl, mini: true }); g.classList.add('dragghost'); g.style.fontSize = '1.05rem'; document.body.appendChild(g); drag.ghost = g;
      el.classList.add('drag');
    }
    if (drag && drag.moved) {
      drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
      const cell = cellAt(e.clientX, e.clientY);
      const h = cell && hlFor(cell);
      S3.setGhost({ x: e.clientX, y: e.clientY, ok: !!h });
      S3.setHover(h ? { side: h.side, lane: h.lane, slot: h.slot === 'land' ? 'c' : h.slot } : null);
      drag.ghost.style.opacity = h ? '0.35' : '0.92';
      if (h && E.CARDS[inst.id].type === 'spell' && h.opt) S3.setPreview(actionPreview({ t: 'play', p: M.viewer, uid: inst.uid, targets: (M.sel.chosen || []).concat([h.opt]) }));
    }
  };
  el.onpointerup = e => {
    if (!drag || drag.inst !== inst) return;
    clearTimeout(drag.long);
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    el.classList.remove('drag'); handSig = '';
    S3.setGhost(null); S3.setHover(null);
    if (!d.moved) { // tap
      if (myPending('discard')) { M.sel = { kind: 'discard', uid: inst.uid, id: inst.id }; Sound.play('select'); handSig = ''; renderHand(); updatePrompt(); return; }
      if (M.sel && M.sel.uid === inst.uid) { clearSel(); return; }
      selectCard(inst, false); return;
    }
    const cell = cellAt(e.clientX, e.clientY);
    const cd = E.CARDS[inst.id];
    if (cd.type === 'spell' && !E.targetSteps(M.st, M.viewer, { uid: inst.uid }).length) {
      const r = $('#hand').getBoundingClientRect();
      if (e.clientY < r.top - 10 || document.body.classList.contains('wide')) { humanCmd({ t: 'play', p: M.viewer, uid: inst.uid, targets: [] }); return; }
      clearSel(); return;
    }
    if (cell) { if (tapCellWhileSelected(cell, true)) return; }
    clearSel();
  };
  el.onpointercancel = () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; S3.setGhost(null); el.classList.remove('drag'); };
}
function selectCard(inst, viaDrag) {
  if (!canAct()) { showTip(cardTip(inst)); M.sel = { kind: 'peek', uid: inst.uid }; handSig = ''; renderHand(); return; }
  const cd = E.CARDS[inst.id];
  hideInfo();
  M.sel = { kind: 'card', uid: inst.uid, id: inst.id, chosen: [] };
  if (cd.type === 'spell') M.sel.src = { uid: inst.uid };
  Sound.play('select');
  showTip(cardTip(inst));
  updateHL();
  if (!viaDrag) { handSig = ''; renderHand(); }
  if (cd.type === 'spell' && !E.playBlock(M.st, M.viewer, inst.uid) && E.targetSteps(M.st, M.viewer, { uid: inst.uid })[0] === 'myDiscardCreature') { chooseFromDiscard(M.sel); return; }
  if (!viaDrag && cd.type === 'spell' && !E.playBlock(M.st, M.viewer, inst.uid) && !E.targetSteps(M.st, M.viewer, { uid: inst.uid }).length) {
    showTip(cardTip(inst) + '<div style="margin-top:.3rem;color:#7dff9a;font-weight:900">Tap the board to cast it.</div>');
  }
}
function hlFor(cell) {
  const sel = M.sel; if (!sel || (sel.kind !== 'card' && sel.kind !== 'target')) return null;
  const list = sel.kind === 'card' && E.CARDS[sel.id].type !== 'spell'
    ? E.playLanes(M.st, M.viewer, sel.uid).map(l => ({ side: M.viewer, lane: l, slot: E.CARDS[sel.id].type === 'creature' ? 'c' : 'b', play: true }))
    : targetOptsFor(sel);
  return list.find(h => h.side === cell.side && h.lane === cell.lane && (h.slot === 'land' || h.play || h.slot === cell.slot || cell.kind === 'tile')) || null;
}
function cellAt(x, y) {
  const p = S3.pick(x, y);
  if (!p) return null;
  if (p.kind === 'deck' || p.kind === 'discard') return null;
  return { side: p.side, lane: p.lane, slot: p.slot || 'c', kind: p.kind };
}

// ------------------------------------------------------------------ input: board (tap, orbit, pinch, pan)
const ptrs = new Map();
let pinch = null, orbiting = null, lastTap = 0, pendingConfirm = null;
function boardDown(e) {
  Sound.unlock();
  M.lastTouch = e.pointerType !== 'mouse';
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), btn: e.button });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; orbiting = null; }
  else if (ptrs.size === 1) orbiting = { x: e.clientX, y: e.clientY, moved: false, pan: e.button === 2 || e.shiftKey };
}
function boardMove(e) {
  const p = ptrs.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (pinch.d > 0) S3.zoomBy(pinch.d / d);
    S3.panBy(-(cx - pinch.cx) * 0.02, -(cy - pinch.cy) * 0.02);
    pinch.d = d; pinch.cx = cx; pinch.cy = cy; return;
  }
  if (orbiting && p && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 10) {
    const dx = e.clientX - orbiting.x, dy = e.clientY - orbiting.y;
    if (orbiting.pan) S3.panBy(-dx * 0.02, -dy * 0.02); else S3.orbitBy(-dx * 0.005, dy * 0.004);
    orbiting.x = e.clientX; orbiting.y = e.clientY; orbiting.moved = true; return;
  }
  if (!M.lastTouch && M.on && (canAct() || myPending('defend'))) {
    const cell = cellAt(e.clientX, e.clientY);
    const h = cell && M.sel ? hlFor(cell) : null;
    S3.setHover(cell ? { side: cell.side, lane: cell.lane, slot: cell.slot } : null);
    if (M.sel && (M.sel.kind === 'target' || (M.sel.kind === 'card' && E.CARDS[M.sel.id].type === 'spell'))) S3.setPreview(h && h.opt ? actionPreview(cmdFor(M.sel, h.opt)) : null);
  }
}
function boardUp(e) {
  const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; return; }
  if (orbiting && orbiting.moved) { orbiting = null; return; }
  orbiting = null;
  if (!p || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 12) return;
  const now = performance.now();
  if (now - lastTap < 300 && !M.sel) { S3.resetView(); lastTap = 0; return; }
  lastTap = now;
  if (!M.on) return;
  if (!directorIdle() && M.seats[M.st.active].kind === 'ai') { D.ff = true; return; }
  boardTap(e.clientX, e.clientY);
}
function boardTap(x, y) {
  const pk = S3.pick(x, y);
  closePanels();
  if (pk && (pk.kind === 'discard' || pk.kind === 'deck')) { if (pk.kind === 'discard') showDiscard(pk.side); return; }
  const cell = pk ? { side: pk.side, lane: pk.lane, slot: pk.slot || 'c', kind: pk.kind } : null;
  if (myPending('defend')) { defendTap(cell); return; }
  if (M.sel && (M.sel.kind === 'card' || M.sel.kind === 'target')) {
    if (cell && tapCellWhileSelected(cell, false)) return;
    if (M.sel.kind === 'card' && E.CARDS[M.sel.id].type === 'spell' && !E.targetSteps(M.st, M.viewer, { uid: M.sel.uid }).length && isMyTurn()) {
      humanCmd({ t: 'play', p: M.viewer, uid: M.sel.uid, targets: [] }); return;
    }
    clearSel(); return;
  }
  if (M.sel && M.sel.kind === 'creature' && cell && isMyTurn() && cell.side === M.viewer) {
    const mv = E.moveOptions(M.st, M.viewer, M.sel.lane).find(m => m.to === cell.lane);
    if (mv && !M.st.players[M.viewer].lanes[cell.lane].creature) { humanCmd({ t: 'move', p: M.viewer, from: M.sel.lane, to: mv.to }); return; }
  }
  if (!cell) { clearSel(); return; }
  const st = M.disp, L = st.players[cell.side].lanes[cell.lane];
  let obj = cell.slot === 'b' ? L.building : L.creature, slot = cell.slot;
  if (!obj) { const other = cell.slot === 'b' ? L.creature : L.building; if (other) { obj = other; slot = cell.slot === 'b' ? 'c' : 'b'; } }
  if (!obj) { clearSel(); return; }
  if (obj.hidden && cell.side !== M.viewer) { toast('A face-down building. Could be a trap…'); return; }
  selectBoardObj(cell.side, cell.lane, slot);
}
function showDiscard(side) {
  const P = M.disp.players[side];
  const d = modal('<h2>' + esc(P.name) + '’s discard pile</h2><div class="row" id="dpile"></div>', { wide: true });
  const row = d.querySelector('#dpile');
  if (!P.discard.length) row.innerHTML = '<p>Empty.</p>';
  for (const c of P.discard.slice().reverse()) { const el = cardEl(c.id, { lvl: c.lvl, mini: true }); el.style.fontSize = '1rem'; el.onclick = () => inspect(c.id, c.lvl); row.appendChild(el); }
}
function cmdFor(sel, opt) {
  const chosen = (sel.chosen || []).concat([opt]);
  if (sel.kind === 'card' || (sel.kind === 'target' && sel.uid != null)) return { t: 'play', p: M.viewer, uid: sel.uid, lane: sel.lane, targets: chosen };
  return { t: 'floop', p: M.viewer, lane: sel.lane, slot: sel.slot, targets: chosen };
}
function tapCellWhileSelected(cell, viaDrop) {
  const sel = M.sel; if (!sel || !canAct()) return false;
  const h = hlFor(cell);
  if (!h) return false;
  if (sel.kind === 'card' && h.play) {
    const cd = E.CARDS[sel.id];
    if (cd.extra && cd.extra.discard && !mySetup()) {      // Field Reaper: pick a card to discard as the extra cost
      M.sel = { kind: 'target', uid: sel.uid, id: sel.id, src: { uid: sel.uid }, lane: h.lane, chosen: [] };
      chooseFromHand(M.sel); return true;
    }
    humanCmd({ t: 'play', p: M.viewer, uid: sel.uid, lane: h.lane }); return true;
  }
  if (!h.opt) return false;
  const src = sel.kind === 'card' ? { uid: sel.uid } : sel.src;
  const steps = E.targetSteps(M.st, M.viewer, src);
  const chosen = (sel.chosen || []).concat([h.opt]);
  if (chosen.length < steps.length) {
    M.sel = Object.assign({}, sel, { kind: 'target', src, chosen });
    afterTargetStep(); return true;
  }
  const cmd = cmdFor(sel, h.opt);
  const pv = actionPreview(cmd);
  const needConfirm = M.lastTouch && settings.confirmTouch && !viaDrop && pv && pv.length;
  if (needConfirm && !(pendingConfirm && pendingConfirm.key === JSON.stringify(cmd))) {
    pendingConfirm = { key: JSON.stringify(cmd) };
    S3.setPreview(pv);
    showTip('<b>' + esc(pv.map(x => x.txt).join(', ')) + '</b> • Tap again to confirm.');
    return true;
  }
  pendingConfirm = null;
  humanCmd(cmd);
  return true;
}
function afterTargetStep() {
  const sel = M.sel;
  const steps = E.targetSteps(M.st, M.viewer, sel.src);
  const kind = steps[sel.chosen.length];
  if (kind === 'myDiscardCreature') { chooseFromDiscard(sel); return; }
  if (kind === 'myHandOther') { chooseFromHand(sel); return; }
  showTip('<b>' + esc(STEP_TEXT[kind] || 'Choose a target') + '</b> <span style="opacity:.7">(tap empty space to cancel)</span>');
  updateHL();
}
function finishChoice(sel, o) {
  const steps = E.targetSteps(M.st, M.viewer, sel.src);
  const chosen = sel.chosen.concat([o]);
  if (chosen.length >= steps.length) humanCmd(cmdFor(Object.assign({}, sel, { chosen: sel.chosen }), o));
  else { M.sel = Object.assign({}, sel, { chosen }); afterTargetStep(); }
}
function chooseFromDiscard(sel) {
  const opts = E.targetOptions(M.st, M.viewer, sel.src, sel.chosen) || [];
  const d = modal('<h2>Choose a creature</h2><div class="row" id="disc"></div>', { onClose: () => { if (M.sel === sel) clearSel(); } });
  const row = d.querySelector('#disc');
  if (!opts.length) row.innerHTML = '<p>No creatures in your discard pile.</p>';
  for (const o of opts) {
    const el = cardEl(o.id, { mini: true }); el.style.fontSize = '1.2rem'; el.style.cursor = 'pointer';
    el.onclick = () => { modalClose = null; closeModal(); finishChoice(sel, o); };
    row.appendChild(el);
  }
}
function chooseFromHand(sel) {
  const opts = E.targetOptions(M.st, M.viewer, sel.src, sel.chosen) || [];
  const d = modal('<h2>Extra cost: discard a card</h2><div class="row" id="disc"></div>', { onClose: () => { if (M.sel === sel) clearSel(); } });
  const row = d.querySelector('#disc');
  for (const o of opts) {
    const el = cardEl(o.id, { mini: true }); el.style.fontSize = '1.2rem'; el.style.cursor = 'pointer';
    el.onclick = () => { modalClose = null; closeModal(); humanCmd({ t: 'play', p: M.viewer, uid: sel.uid, lane: sel.lane, targets: [o] }); };
    row.appendChild(el);
  }
}
function selectBoardObj(side, lane, slot) {
  const st = M.disp, me = M.viewer;
  const obj = slot === 'b' ? st.players[side].lanes[lane].building : st.players[side].lanes[lane].creature;
  M.sel = { kind: side === me ? (slot === 'b' ? 'building' : 'creature') : 'enemy', side, lane, slot };
  Sound.play('select');
  showInfo(side, lane, slot, obj);
  updateHL();
}
// The info panel: the card, its live stats, and what it can do right now (ACTIVATE / FLOOP / BLOCK).
function showInfo(side, lane, slot, obj, defending) {
  const st = M.disp, me = M.viewer, cd = E.CARDS[obj.id];
  const el = $('#info');
  const pills = [];
  if (slot === 'c') {
    const s = E.cStats(st, side, lane);
    pills.push(s.atk + '/' + Math.max(0, s.hp) + (obj.dmg ? ' (' + obj.dmg + ' dmg)' : ''));
    if (s.home) pills.push('Home Advantage');
    if (obj.act) pills.push(obj.inside ? 'Studying' : 'Activated'); if (obj.fl) pills.push('Flooped');
    if (obj.nap) pills.push('Napping (safe)'); if (obj.frozen) pills.push('Frozen'); if (obj.chill) pills.push('Chill ' + obj.chill); if (obj.burn) pills.push('Burn ' + obj.burn);
    if (obj.rot) pills.push('Rotting'); if (obj.shield) pills.push('Shield ' + obj.shield); if (obj.stuck) pills.push('Stuck');
    if (obj.study) pills.push('Knows Raise the Dead'); if (obj.ripen) pills.push('Ripened'); if (obj.forge) pills.push('Forged +' + obj.forge);
    if (obj.owner !== side) pills.push('Stolen!');
  } else pills.push((E.bDef(obj) - obj.dmg) + '/' + E.bDef(obj) + ' DEF' + (obj.kingdom ? ' • Landmark' : ''));
  let acts = '';
  const mine = side === me;
  if (mine && isMyTurn() && slot === 'c') {
    const why = E.activateBlock(M.st, me, lane);
    const studying = cd.kw.scholar && (() => { const b = M.st.players[me].lanes[lane].building; return b && !b.hidden && E.CARDS[b.id].kw.school; })();
    if (obj.act && !obj.inside) acts += '<button class="btn small ghost" id="actBtn">CANCEL ATTACK</button>';
    else if (!obj.act) acts += '<button class="btn small red" id="actBtn" ' + (why ? 'disabled' : '') + '>' + (studying ? 'ACTIVATE: STUDY' : 'ACTIVATE ⚔') + '</button>' + (why ? '<span class="pill">' + esc(why) + '</span>' : '');
  }
  if (mine && cd.floop && (isMyTurn() || myPending('defend'))) {
    const why = E.floopBlock(M.st, me, lane, slot);
    acts += '<button class="btn small" id="floopBtn" ' + (why ? 'disabled' : '') + '>FLOOP' + (cd.floop.cost ? ' (' + cd.floop.cost + '⚡)' : '') + '</button>';
    if (why) acts += '<span class="pill">' + esc(why) + '</span>';
  }
  if (mine && slot === 'c' && myPending('defend')) {
    const bo = E.blockOptions(M.st, me).filter(o => o.lane === lane);
    const blocking = Object.keys(M.st.blocks || {}).find(k => M.st.blocks[k] === obj.uid);
    if (blocking) acts += '<button class="btn small ghost" id="blockBtn">CANCEL BLOCK</button>';
    else if (bo.length) acts += '<button class="btn small blue" id="blockBtn">ACTIVATE: BLOCK</button>';
  }
  if (mine && slot === 'c' && isMyTurn()) {
    const mv = E.moveOptions(M.st, me, lane);
    if (mv.length) acts += '<span class="pill">Tap a glowing lane to move (' + (mv.some(m => m.cost === 0) ? 'free on Blue Plains' : '1⚡') + ')</span>';
  }
  acts += '<button class="btn ghost small" id="moreBtn">Details</button>';
  el.innerHTML = '<button class="x" id="infoX">✕</button><div class="row"><div id="infoCard"></div><div class="desc"><h3>' + esc(cd.name) + '</h3>' +
    '<div class="stats">' + pills.map(p => '<span class="pill">' + esc(p) + '</span>').join('') + '</div>' + fmtText(cd.text || '') + '</div></div><div class="acts">' + acts + '</div>';
  const c = cardEl(obj.id, { lvl: obj.lvl, mini: true }); el.querySelector('#infoCard').appendChild(c);
  el.classList.add('on');
  el.querySelector('#infoX').onclick = () => clearSel();
  el.querySelector('#moreBtn').onclick = () => inspect(obj.id, obj.lvl);
  const ab = el.querySelector('#actBtn'); if (ab) ab.onclick = () => humanCmd({ t: 'activate', p: me, lane });
  const fb = el.querySelector('#floopBtn');
  if (fb) fb.onclick = () => {
    const src = { lane, slot };
    const steps = E.targetSteps(M.st, me, src);
    if (!steps.length) { humanCmd({ t: 'floop', p: me, lane, slot, targets: [] }); return; }
    hideInfo();
    M.sel = { kind: 'target', src, lane, slot, chosen: [] };
    afterTargetStep();
  };
  const bb = el.querySelector('#blockBtn');
  if (bb) bb.onclick = () => {
    const blocking = Object.keys(M.st.blocks || {}).find(k => M.st.blocks[k] === obj.uid);
    if (blocking) { humanCmd({ t: 'block', p: me, lane, at: +blocking }); return; }
    const bo = E.blockOptions(M.st, me).filter(o => o.lane === lane);
    if (bo.length === 1) { humanCmd(bo[0]); return; }
    hideInfo(); M.sel = { kind: 'block', side: me, lane, slot: 'c' };
    showTip('<b>Choose which attacker to block</b>'); updateHL();
  };
  void defending;
}
function defendTap(cell) {
  const me = M.viewer, sel = M.sel;
  if (sel && sel.kind === 'block' && cell) {
    const o = E.blockOptions(M.st, me).find(x => x.lane === sel.lane && (() => { const f = E.findCreature(M.st, x.at); return f && f.side === cell.side && f.lane === cell.lane; })());
    if (o) { humanCmd(o); return; }
  }
  if (sel && sel.kind === 'target' && cell) { if (tapDefTarget(cell)) return; }
  if (!cell) { clearSel(); return; }
  const L = M.disp.players[cell.side].lanes[cell.lane];
  let obj = cell.slot === 'b' ? L.building : L.creature, slot = cell.slot;
  if (!obj) { const other = cell.slot === 'b' ? L.creature : L.building; if (other) { obj = other; slot = cell.slot === 'b' ? 'c' : 'b'; } }
  if (!obj) { clearSel(); return; }
  selectBoardObj(cell.side, cell.lane, slot);
}
function tapDefTarget(cell) {
  const sel = M.sel;
  const h = targetOptsFor(sel).find(q => q.side === cell.side && q.lane === cell.lane);
  if (!h) return false;
  const steps = E.targetSteps(M.st, M.viewer, sel.src);
  const chosen = sel.chosen.concat([h.opt]);
  if (chosen.length < steps.length) { M.sel = Object.assign({}, sel, { chosen }); afterTargetStep(); return true; }
  humanCmd({ t: 'floop', p: M.viewer, lane: sel.lane, slot: sel.slot, targets: chosen });
  return true;
}
function hideInfo() { $('#info').classList.remove('on'); }
function closePanels() { $('#logDrawer').classList.remove('on'); $('#emotes').classList.remove('on'); }

// ------------------------------------------------------------------ emotes
const EMOTES = [['Mathematical!', 'finn'], ['Oh my glob!', 'lsp'], ['Dweeb!', 'jake'], ['For the glory!', 'jake'], ['I’m the cool guy.', 'finn'], ['Wenk.', 'gunter']];
function buildEmotes() {
  const d = $('#emotes'); d.innerHTML = '';
  for (const [txt, who] of EMOTES) {
    const b = document.createElement('button'); b.innerHTML = '<img src="' + Art.portraitURL(who, 48) + '" style="width:1.6rem;height:1.6rem;border-radius:50%">' + esc(txt);
    b.onclick = () => { if (M.emoteCd > 0) return; M.emoteCd = 2; speak(M.viewer, txt); Sound.play('emote'); d.classList.remove('on'); setTimeout(() => { if (M.on && M.seats[1 - M.viewer].kind === 'ai' && Math.random() < 0.5) { const s = M.seats[1 - M.viewer]; speak(1 - M.viewer, (s.lines && s.lines[Math.floor(Math.random() * s.lines.length)]) || 'Hmph.'); } }, 900); };
    d.appendChild(b);
  }
}

// ------------------------------------------------------------------ timer
function startTimer() {
  stopTimer(); if (!settings.timer || M.mode === 'tutorial') return;
  M.timeLeft = 45; const t = $('#timer'); t.classList.add('on');
  M.timer = setInterval(() => {
    if (!isMyTurn()) return;
    M.timeLeft--; t.textContent = '⏱ ' + M.timeLeft; t.classList.toggle('low', M.timeLeft <= 10);
    if (M.timeLeft <= 0) { stopTimer(); toast('Time! Battle!'); clearSel(); humanCmd({ t: 'battle', p: M.viewer }); }
  }, 1000);
  t.textContent = '⏱ 45';
}
function stopTimer() { if (M.timer) clearInterval(M.timer); M.timer = null; $('#timer').classList.remove('on', 'low'); }

// ------------------------------------------------------------------ start / finish
function start(cfg) {
  // cfg: { seed, mode, seats:[{kind, name, hero, deck, levels, difficulty, personality, lines, plan}], first, tutorial, onEnd, noMulligan, noSetup, setup }
  M.cfg = cfg; M.mode = cfg.mode || 'ai'; M.seats = cfg.seats; M.onEnd = cfg.onEnd; M.tutorial = cfg.tutorial || null;
  M.on = true; M.ended = false; M.sel = null; M.undo = null; M.log = []; M.ai = [{}, {}]; M.aiN = 0; M.waitingPass = false; M.idleKey = ''; M.choosing = false; M.promptKey = '';
  M.stats = { dealt: 0, taken: 0, killed: 0, lost: 0 };
  D.q = []; D.cur = null; D.ff = false;
  const g = E.newGame({ seed: cfg.seed, first: cfg.first, noMulligan: !!cfg.noMulligan, noSetup: !!cfg.noSetup, noDiscard: !!cfg.noDiscard, overtime: cfg.overtime,
    players: cfg.seats.map(s => ({ name: s.name, hero: s.hero, deck: s.deck, levels: s.levels, kingdom: s.kingdom, bonusActions: s.bonusActions })) });
  M.st = g.state;
  if (cfg.setup) cfg.setup(M.st);
  M.viewer = cfg.seats[0].kind === 'human' || cfg.seats[1].kind !== 'human' ? 0 : 1;
  M.disp = M.st;
  S3.reset(); S3.setMode('match'); S3.setViewer(M.viewer); S3.resetView();
  S3.setSetup(M.st.phase !== 'main');
  S3.setState(M.st, { instant: true });
  showScreen('match');
  buildHUD(); buildEmotes(); handSig = ''; layout(); refreshHUD();
  if (M.st.phase === 'mulligan') doMulligans(); else afterMulligans();
}
function doMulligans() {
  for (let p = 0; p < 2; p++) if (M.seats[p].kind === 'ai') exec(AI.decide(M.st, p, {}), 'ai');
  const humans = [0, 1].filter(p => M.seats[p].kind === 'human' && M.st.players[p].mulled == null);
  const next = () => {
    const p = humans.shift();
    if (p == null) { afterMulligans(); return; }
    if (M.mode === 'pvp' && p !== M.viewer) { M.viewer = p; S3.setViewer(p); buildHUD(); }
    const P = M.st.players[p];
    const d = modal('<h2>' + esc(P.name) + ': opening hand</h2><p class="center">Keep these cards, or shuffle them back and pick up new ones (once).<br><small>Tip: you want creatures you can floop onto your lands.</small></p><div class="row" id="mullRow"></div><div class="row"><button class="btn" data-keep>Keep</button><button class="btn blue" data-mull>Mulligan</button></div>', { noClose: true, wide: true });
    const row = d.querySelector('#mullRow');
    for (const c of P.hand) { const el = cardEl(c.id, { lvl: c.lvl, mini: true }); el.style.fontSize = '1.05rem'; row.appendChild(el); }
    d.querySelector('[data-keep]').onclick = () => { closeModal(); exec({ t: 'mulligan', p, redraw: false }, 'ai'); next(); };
    d.querySelector('[data-mull]').onclick = () => { closeModal(); exec({ t: 'mulligan', p, redraw: true }, 'ai'); Sound.play('whoosh'); next(); };
  };
  next();
}
function afterMulligans() {
  if (M.st.phase === 'setup') logLine('Set up your kingdoms! Then floop your land cards.', 'sys');
  refreshHUD(); layout();
}
function finish() {
  stopTimer(); clearSel();
  const st = M.st;
  const res = { winner: st.winner, viewer: M.viewer, mode: M.mode, reason: st.reason, rounds: st.round, stats: M.stats, kingdom: [E.kingdomSize(st, 0), E.kingdomSize(st, 1)], names: [st.players[0].name, st.players[1].name] };
  Sound.play(st.winner === M.viewer || (M.mode === 'pvp' && st.winner >= 0) ? 'win' : 'lose');
  M.on = false;
  if (M.onEnd) M.onEnd(res);
}
function quit() { M.on = false; M.ended = true; stopTimer(); D.q = []; D.cur = null; closeModal(); clearSel(); }
function concede() { if (!M.on || M.ended) return; const r = exec({ t: 'concede', p: M.viewer }, 'human'); if (r.error) toast(r.error); }

// ------------------------------------------------------------------ screens / layout
let current = 'home';
function showScreen(name) {
  current = name;
  $('#match').classList.toggle('on', name === 'match');
  document.querySelectorAll('#screens > .screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name));
  S3.setMode(name === 'match' ? 'match' : 'home');
  if (name !== 'match') layout();
  if (name !== 'match') { S3.setHighlights([]); S3.setArrows([]); S3.setPreview(null); S3.setSelection(null); }
}
// Three layouts: portrait phones (hand along the bottom), short landscape screens (hand in a side column) and
// big landscape screens ("desk": hand along the bottom, so the arena gets the whole width).
function layout() {
  const W = window.innerWidth, H = window.innerHeight;
  const land = W / H > 0.95, desk = land && H >= 560 && W >= 900, wide = land && !desk;
  const bc = document.body.classList;
  bc.toggle('wide', wide); bc.toggle('desk', desk); bc.toggle('land', land); bc.toggle('portrait', !land);
  const s = desk ? Math.max(0.85, Math.min(1.35, Math.min(W / 1180, H / 760)))
    : wide ? Math.max(0.72, Math.min(1.9, Math.min(W / 844, H / 390))) : Math.max(0.78, Math.min(1.5, Math.min(W / 390, H / 760)));
  document.documentElement.style.setProperty('--s', s.toFixed(3));
  S3.resize(W, H, window.devicePixelRatio || 1);
  if (current === 'match') {
    if (wide) {
      const l = $('#opp').getBoundingClientRect(), r = $('#hand').getBoundingClientRect();
      S3.setInsets({ top: 8, bottom: 8, left: l.right + 8, right: W - r.left + 8 });
    } else if (desk) {
      const t = $('#opp').getBoundingClientRect(), b = Math.min(...['#hand', '#me', '#fightWrap'].map(q => $(q).getBoundingClientRect().top));
      S3.setInsets({ top: t.bottom + 4, bottom: H - b + 2, left: 0, right: 0 });
    } else {
      const t = $('#opp').getBoundingClientRect(), b = $('#me').getBoundingClientRect();
      S3.setInsets({ top: t.bottom + 4, bottom: H - b.top + 2, left: 0, right: 0 });
    }
  } else if (current === 'home') S3.setInsets(land ? { top: H * 0.4, bottom: 0, left: 0, right: W * 0.48 } : { top: H * 0.56, bottom: 0, left: 0, right: 0 });
  else S3.setInsets({ top: 0, bottom: 0, left: 0, right: 0 });
  handSig = ''; if (M.on || current === 'match') renderHand();
}

// ------------------------------------------------------------------ wiring
function init() {
  $('#menuBtn').innerHTML = ICON.menu; $('#logBtn').innerHTML = ICON.log; $('#emoteBtn').innerHTML = ICON.emote; $('#undoBtn').innerHTML = ICON.undo; $('#camBtn').innerHTML = ICON.cam;
  $('#fightBtn').onclick = () => {
    Sound.unlock();
    if (mySetup()) { clearSel(); humanCmd({ t: 'ready', p: M.viewer }); return; }
    if (myPending('defend')) { clearSel(); humanCmd({ t: 'defend', p: M.viewer }); return; }
    if (isMyTurn()) { clearSel(); humanCmd({ t: 'battle', p: M.viewer }); }
  };
  $('#undoBtn').onclick = doUndo;
  $('#camBtn').onclick = () => { S3.resetView(); Sound.play('click'); };
  $('#logBtn').onclick = () => { const d = $('#logDrawer'); const on = !d.classList.contains('on'); closePanels(); if (on) { d.classList.add('on'); renderLog(); } };
  $('#emoteBtn').onclick = () => { const d = $('#emotes'); const on = !d.classList.contains('on'); closePanels(); if (on) d.classList.add('on'); };
  $('#speedBtn').onclick = () => { settings.speed = settings.speed === 1 ? 2 : 1; D.speed = settings.speed; $('#speedBtn').textContent = settings.speed + 'x'; if (UI.onSettings) UI.onSettings(); };
  $('#menuBtn').onclick = () => { if (UI.onMenu) UI.onMenu(); };
  const cv = $('#cv');
  cv.addEventListener('pointerdown', boardDown);
  window.addEventListener('pointermove', boardMove);
  window.addEventListener('pointerup', e => { if (e.target === cv || ptrs.has(e.pointerId)) boardUp(e); });
  window.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = null; orbiting = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); S3.zoomBy(e.deltaY < 0 ? 1 / 1.1 : 1.1); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (current !== 'match') return;
    if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) closeModal(); else clearSel(); }
    if ((e.key === 'Enter' || e.key === ' ') && !$('#modal').classList.contains('on')) { e.preventDefault(); $('#fightBtn').click(); }
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) doUndo();
  });
  S3.onArt(() => { if (artPending) { handSig = ''; if (M.on || current === 'match') renderHand(); } if (UI.onArt) UI.onArt(); });
}
function tick(dt) {
  if (M.emoteCd > 0) M.emoteCd -= dt;
  if (aiTimer > 0) aiTimer -= dt * D.speed * (D.ff ? 5 : 1);
  if (M.on || D.q.length || D.cur) directorUpdate(dt);
  const idle = directorIdle();
  if (idle) { D.ff = false; if (D.wasBusy) { D.wasBusy = false; if (M.on) { refreshHUD(); updateHL(); } } } else { D.wasBusy = true; if (M.on) S3.setArrows(attackArrows(M.disp)); }
}

return {
  init, start, quit, concede, tick, layout, showScreen, cardEl, modal, closeModal, toast, inspect, esc, fmtText, typeLine, lvlStats, ICON,
  settings, D, M, refreshHUD, updateHL, humanCmd, isMyTurn, mySetup, myPending, clearSel, speak, showBanner, exec,
  get screen() { return current; }
};
})();
/* END UI */
