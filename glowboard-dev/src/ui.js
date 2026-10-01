/* UI */
// Match screen: event director (animations from per-event snapshots), HUD, hand, input, targeting,
// previews, undo, log, emotes, AI driver and pass-and-play. Also shared card/modal helpers.
var UI = (function () {
'use strict';
const E = Engine, R = Render;
const $ = s => document.querySelector(s);
const LANDC = R.LANDC;
const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
  emote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 5h16v11H9l-5 4z"/><circle cx="9" cy="10.5" r=".8" fill="currentColor"/><circle cx="15" cy="10.5" r=".8" fill="currentColor"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="5" width="11" height="15" rx="2" opacity=".55"/><rect x="9" y="3" width="11" height="15" rx="2"/></svg>',
  deck: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8" stroke="#1b1424" stroke-width="2"/></svg>',
  grave: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 21V10a6 6 0 0112 0v11z"/><path d="M12 9v6M9.5 11.5h5" stroke="#1b1424" stroke-width="2"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="#ffcf3a"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="#8ff0ff"><path d="M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z"/></svg>'
};

// ------------------------------------------------------------------ shared helpers
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmtText(t) {
  return esc(t).replace(/\b(FLOOP(?: \(\d Actions?\))?|Guard|Flying|Ranged|Siege \d|Lifesteal|Shield \d|Burn \d|Chill(?:ed)?|Freeze|Frozen|Rot(?:s)?|Stuck|Ripen|Immortal|Trap|Muddy)\b/g, '<b>$1</b>');
}
function lvlStats(cd, lvl) {
  lvl = lvl || 1;
  if (cd.type === 'creature') return { atk: cd.atk + (lvl >= 3 ? 1 : 0), def: cd.def + (lvl >= 2 ? 1 : 0) + (lvl >= 4 ? 1 : 0) };
  if (cd.type === 'building') return { def: cd.def + Math.max(0, lvl - 1) };
  return {};
}
function typeLine(cd) {
  const t = cd.type === 'creature' ? 'Creature' : cd.type === 'building' ? (cd.kw.trap ? 'Building - Trap' : 'Building') : 'Spell';
  return t + ' • ' + E.LANDS[cd.land].name + (cd.r === 'L' ? ' • Champion' : '');
}
function cardEl(id, o) {
  o = o || {};
  const cd = E.CARDS[id] || E.CARDS['?'];
  const el = document.createElement('div');
  el.className = 'card r-' + cd.r + (o.mini ? ' mini' : '') + (o.big ? ' big' : '') + (o.dim ? ' dim' : '') + (o.locked ? ' locked' : '');
  if (id === '?' || o.back) { el.className = 'card back' + (o.mini ? ' mini' : ''); return el; }
  el.style.setProperty('--fc', LANDC[cd.land]);
  const s = lvlStats(cd, o.lvl);
  const cost = o.cost != null ? o.cost : cd.cost;
  const art = Art.cardArtURL(cd.art, LANDC[cd.land], 132, 104);
  const nmCls = cd.name.length > 17 ? 'nm xl' : cd.name.length > 11 ? 'nm long' : 'nm';
  let h = '<div class="in"><div class="art" style="background-image:url(' + art + ')"></div><div class="' + nmCls + '">' + esc(cd.name) + '</div>' +
    '<div class="ty">' + esc(typeLine(cd)) + '</div><div class="tx">' + fmtText(cd.text || '') + '</div></div>' +
    '<div class="cost"><span>' + cost + '</span></div><div class="rar"></div>';
  if (cd.land !== 'rainbow' && cd.req > 0) { h += '<div class="req">'; for (let i = 0; i < cd.req; i++) h += '<i></i>'; h += '</div>'; }
  if (cd.type === 'creature') h += '<div class="st a">' + s.atk + '</div><div class="st d">' + s.def + '</div>';
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
  const txt = (cd.text || '') + ' ' + Object.keys(cd.kw).join(' ');
  for (const k in E.KEYWORDS) if (new RegExp('\\b' + k, 'i').test(txt) || (k === 'floop' && cd.floop)) kws.push('<div><b>' + k[0].toUpperCase() + k.slice(1) + '</b> — ' + esc(E.KEYWORDS[k].replace(/^[^:]+: /, '')) + '</div>');
  if (cd.type === 'creature' && cd.land !== 'rainbow') kws.push('<div><b>Home Advantage</b> on ' + E.LANDS[cd.land].name + ' — ' + esc(E.LANDS[cd.land].home) + '</div>');
  if (cd.flavor) kws.push('<div style="opacity:.75;font-style:italic;margin-top:.4rem">' + esc(cd.flavor) + '</div>');
  d.querySelector('#kws').innerHTML = kws.join('');
  return d;
}

// ------------------------------------------------------------------ match state
const M = {
  on: false, st: null, disp: null, seats: null, viewer: 0, mode: 'ai', cfg: null,
  sel: null, undo: null, log: [], aiPlan: null, aiGuard: 0, timer: null, timeLeft: 0,
  stats: null, onEnd: null, tutorial: null, waitingPass: false, ended: false, lastTouch: false, emoteCd: 0
};
const settings = { speed: 1, haptics: true, reduceMotion: false, timer: false, confirmTouch: true };

// ------------------------------------------------------------------ director
const D = { q: [], cur: null, speed: 1, ff: false };
function dur(ev) {
  const T = {
    turn: 950, draw: 110, cast: 620, summon: 640, build: 640, replace: 180, floop: 430, ready: 260, move: 400, attack: 420, damage: 170, bdamage: 150,
    hero: 330, heal: 220, heroHeal: 260, death: 430, bdeath: 460, status: 150, buff: 150, land: 680, steal: 700, trap: 650, spirit: 760,
    reveal: 1500, stealCard: 800, study: 320, zap: 360, crash: 260, say: 950, volcano: 1300, immortal: 420, immune: 300, fightPhase: 420,
    endTurn: 120, overtime: 800, reshuffle: 450, handFull: 300, buyDraw: 60, mulligan: 0, setup: 0, gameOver: 200, pending: 0, actions: 0, _sync: 0
  };
  let d = T[ev.t] != null ? T[ev.t] : 120;
  if (ev.t === 'turn' && ev.side !== M.viewer && M.seats[ev.side].kind !== 'human') d = 650;
  if (ev.t === 'draw' && (ev.silent || ev.side !== M.viewer)) d = 40;
  if (ev.t === 'fightPhase' && !anyAttacker(ev)) d = 0;
  if (ev.t === 'say' && !ev.text) d = 0;
  if (ev.t === '_pause') d = ev.ms || 0;
  if (ev.t === 'reveal' && ev.to === M.viewer && M.st.pending && M.st.pending.side === M.viewer) d = 250;
  return d;
}
function anyAttacker(ev) { const st = ev.snap; if (!st) return false; for (let l = 0; l < 4; l++) if (E.canAttack(st, ev.side, l)) return true; return false; }
function pushEvents(evs) { for (const e of evs) D.q.push(e); }
function directorIdle() { return !D.cur && !D.q.length; }
function directorUpdate(dt) {
  let budget = dt * 1000 * D.speed * (D.ff ? 5 : 1);
  let guard = 0;
  while (budget > 0 && guard++ < 400) {
    if (!D.cur) {
      if (!D.q.length) break;
      D.cur = D.q.shift();
      if (D.cur.snap) { M.disp = D.cur.snap; R.setState(M.disp, M.viewer); }
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
function headOf(side, lane, slot) { return R.headPos(side, lane, slot || 'c'); }
function teamOf(side) { return R.colors[side]; }
function heroPoint(side) {
  const el = side === M.viewer ? $('#me .pf') : $('#opp .pf');
  if (!el) return R.edgePos(side);
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: 60 };
}
function uidAt(st, side, lane, slot) { const L = st.players[side].lanes[lane]; const o = slot === 'b' ? L.building : L.creature; return o ? o.uid : null; }
function startEvent(ev) {
  const st = ev.snap || M.disp;
  const vib = ms => { if (settings.haptics) Sound.vibrate(ms); };
  switch (ev.t) {
    case 'turn': {
      M.sel = null; hideInfo(); updateHL();
      const mine = ev.side === M.viewer && M.seats[ev.side].kind === 'human';
      showBanner(mine ? 'YOUR TURN' : (pname(ev.side) + '’S TURN').toUpperCase(), 'Round ' + ev.round, teamOf(ev.side));
      Sound.play(mine ? 'turn' : 'oppTurn');
      document.querySelectorAll('.gems .gem').forEach(g => { g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop'); });
      logLine('— ' + pname(ev.side) + ' • round ' + ev.round + ' —', 'sys');
      break;
    }
    case 'draw': if (ev.side === M.viewer && !ev.silent) Sound.play('draw'); break;
    case 'cast': {
      Sound.play('whoosh');
      flyCardToCenter(ev.id, ev.side);
      logLine(pname(ev.side) + ' casts ' + cname(ev.id), 't' + ev.side);
      for (const tg of ev.targets || []) if (tg.lane != null) { const p = headOf(tg.side, tg.lane, 'c'); R.burst(p.x, p.y, LANDC[(E.CARDS[ev.id] || {}).land] || '#fff', 10, { speed: 80 }); }
      break;
    }
    case 'summon': {
      R.anim(ev.uid, 'spawn', ev.token ? 0.4 : 0.62, { delay: ev.token ? 0 : 0.2 }); if (!ev.token) R.anim(ev.uid, 'place', 0.55);
      const p = R.slotPos(ev.side, ev.lane, 'c');
      R.burst(p.x, p.y, teamOf(ev.side), ev.token ? 6 : 16, { speed: 70, up: 120, g: 60, life: 0.6 });
      Sound.play(ev.token ? 'holo' : 'place'); if (!ev.token) setTimeout(() => Sound.play('holo'), 120);
      if (!ev.token && ev.how === 'play') R.text(p.x, p.y - p.s * 0.2, 'FLOOP!', teamOf(ev.side), { size: 16, life: 0.6 });
      if (ev.how === 'raise') R.text(p.x, p.y - p.s * 0.9, 'RISES!', '#b9ff9f', { size: 18 });
      logLine(pname(ev.side) + (ev.token ? ' gets ' : ' plays ') + cname(ev.id), 't' + ev.side);
      break;
    }
    case 'build': {
      R.anim(ev.uid, 'spawn', 0.62, { delay: 0.2 }); R.anim(ev.uid, 'place', 0.55); R.clearRubble(ev.side, ev.lane);
      const p = R.slotPos(ev.side, ev.lane, 'b'); R.burst(p.x, p.y, teamOf(ev.side), 14, { speed: 60, up: 90, g: 80 });
      Sound.play('build');
      logLine(pname(ev.side) + ' builds ' + (ev.hidden && ev.side !== M.viewer ? 'a face-down building' : cname(ev.id)), 't' + ev.side);
      break;
    }
    case 'replace': R.addDying(ev.side, ev.lane, ev.id, ev.side, ev.slot); break;
    case 'floop': {
      R.anim(ev.uid, 'flooprot', 0.32, { from: 0, to: Math.PI / 2 }); R.anim(ev.uid, 'floopflash', 0.45);
      const p = headOf(ev.side, ev.lane, ev.slot); R.text(p.x, p.y - 10, 'FLOOP!', teamOf(ev.side), { size: 22 });
      R.burst(p.x, p.y + 10, teamOf(ev.side), 12, { speed: 90 });
      Sound.play('floop'); vib(15);
      logLine(pname(ev.side) + ' floops ' + cname(ev.id), 't' + ev.side);
      if (ev.side !== M.viewer) R.sel = { side: ev.side, lane: ev.lane, slot: ev.slot };
      break;
    }
    case 'ready': { const u = uidAt(st, ev.side, ev.lane, 'c'); if (u) R.anim(u, 'flooprot', 0.3, { from: Math.PI / 2, to: 0 }); const p = headOf(ev.side, ev.lane); R.text(p.x, p.y, 'READY!', '#fff3a0', { size: 16 }); Sound.play('select'); break; }
    case 'move': {
      R.anim(ev.uid, 'move', 0.36, { fx: R.laneX(ev.from), fz: R.rowZ(ev.side, 'c') });
      const other = ev.swap ? uidAt(st, ev.side, ev.from, 'c') : null;
      if (other) R.anim(other, 'move', 0.36, { fx: R.laneX(ev.to), fz: R.rowZ(ev.side, 'c') });
      Sound.play('whoosh');
      if (!ev.forced) logLine(pname(ev.side) + ' moves a creature', 't' + ev.side);
      break;
    }
    case 'attack': {
      const A = st.players[ev.side].lanes[ev.lane].creature; if (!A) break;
      let tz = ev.kind === 'hero' ? R.rowZ(ev.toSide, 'b') + (ev.toSide === M.viewer ? -0.5 : 0.5) : R.rowZ(ev.toSide, ev.kind === 'building' ? 'b' : 'c');
      const tx = R.laneX(ev.toLane);
      const melee = !ev.ranged;
      R.anim(A.uid, 'lunge', 0.4, { tx, tz, amt: melee ? 0.72 : 0.12, fly: !!ev.flying });
      if (!melee || ev.flying) {
        const from = headOf(ev.side, ev.lane), to = ev.kind === 'hero' ? R.edgePos(ev.toSide) : headOf(ev.toSide, ev.toLane, ev.kind === 'building' ? 'b' : 'c');
        R.projectile(from, to, teamOf(ev.side), 0.28, { arc: 30, size: 6 });
        Sound.play('arrow');
      } else Sound.play('whoosh');
      break;
    }
    case 'damage': {
      const p = headOf(ev.side, ev.lane);
      const u = uidAt(st, ev.side, ev.lane, 'c'); if (u) R.flash(u);
      if (ev.n > 0) {
        R.text(p.x + (Math.random() - 0.5) * 16, p.y + 6, '-' + ev.n, ev.kind === 'burn' ? '#ffb070' : ev.kind === 'rot' ? '#a8ff7a' : '#ff5a6a', { size: 18 + Math.min(14, ev.n * 2.5) });
        R.burst(p.x, p.y + p.s * 0.3, ev.kind === 'burn' ? '#ff8a3d' : ev.kind === 'rot' ? '#8ae05a' : '#ffffff', 6 + ev.n * 3, { speed: 120 });
        Sound.play(ev.kind === 'burn' ? 'burn' : ev.kind === 'rot' ? 'rot' : 'hit', ev.n);
        if (ev.n >= 4) { R.shake(5 + ev.n, 0.25); R.hitstop(70); vib(30); } else vib(12);
      }
      if (ev.absorbed) R.text(p.x + 22, p.y - 14, '⛨' + ev.absorbed, '#9fd0ff', { size: 15 });
      break;
    }
    case 'bdamage': {
      const p = headOf(ev.side, ev.lane, 'b'); const u = uidAt(st, ev.side, ev.lane, 'b'); if (u) R.flash(u);
      R.text(p.x, p.y, '-' + ev.n, '#c9d4ff', { size: 18 }); R.burst(p.x, p.y + p.s * 0.3, '#a99fc8', 10, { speed: 90, square: true, add: false });
      Sound.play('hit', ev.n);
      break;
    }
    case 'hero': {
      const hp = heroPoint(ev.side);
      R.text(hp.x, hp.y + 34, '-' + ev.n, '#ff5a6a', { size: 26, vy: -30 });
      const seatEl = ev.side === M.viewer ? $('#me') : $('#opp');
      seatEl.classList.remove('shake'); void seatEl.offsetWidth; seatEl.classList.add('shake');
      const ep = R.edgePos(ev.side); R.burst(ep.x, ep.y, '#ff6a6a', 14, { speed: 140 });
      if (ev.n >= 3) R.shake(4 + ev.n, 0.3);
      Sound.play('hero'); vib(35);
      if (M.stats) { if (ev.side === M.viewer) M.stats.taken += ev.n; else M.stats.dealt += ev.n; }
      break;
    }
    case 'heal': { const p = headOf(ev.side, ev.lane); R.text(p.x, p.y, '+' + ev.n, '#7dff9a', { size: 18 }); R.burst(p.x, p.y + 10, '#7dff9a', 8, { speed: 50, up: 80, g: -20, square: false }); Sound.play('heal'); break; }
    case 'heroHeal': { const hp = heroPoint(ev.side); R.text(hp.x, hp.y + 34, '+' + ev.n, '#7dff9a', { size: 22 }); Sound.play('heal'); break; }
    case 'death': {
      const team = ev.side;
      R.addDying(ev.side, ev.lane, ev.id, team, 'c');
      const p = headOf(ev.side, ev.lane);
      R.burst(p.x, p.y + p.s * 0.3, teamOf(team), 34, { speed: 160, up: 80, size: 5, life: 0.9 });
      Sound.play('death'); vib(25);
      if (ev.cause === 'volcano') R.burst(p.x, p.y + p.s * 0.4, '#ff6b3d', 18, { speed: 140 });
      logLine(cname(ev.id) + ' is destroyed', 't' + ev.side);
      if (M.stats) { if (ev.side === M.viewer) M.stats.lost++; else M.stats.killed++; }
      break;
    }
    case 'bdeath': {
      const p = R.slotPos(ev.side, ev.lane, 'b');
      if (ev.spent) { R.burst(p.x, p.y, '#d9cff7', 12, { speed: 60 }); }
      else { R.addRubble(ev.side, ev.lane); R.addDying(ev.side, ev.lane, ev.id, ev.side, 'b'); R.burst(p.x, p.y, '#8a83a8', 22, { speed: 140, up: 120, square: true, add: false, size: 6 }); Sound.play('collapse'); R.shake(4, 0.25); logLine(cname(ev.id) + ' collapses', 't' + ev.side); }
      break;
    }
    case 'status': {
      const p = headOf(ev.side, ev.lane);
      const L = { burn: ['BURN ' + ev.n, '#ff9a4a', 'burn'], chill: ev.n ? ['CHILL', '#bff3ff', 'freeze'] : null, freeze: ['FROZEN!', '#7fe3ff', 'freeze'], rot: ['ROT', '#a8ff7a', 'rot'], stuck: ['STUCK!', '#d9a066', 'rot'], shield: ['SHIELD ' + ev.n, '#9fd0ff', 'shield'], thaw: ['THAW', '#dff', null] }[ev.s];
      if (L) { R.text(p.x, p.y - 20 - (ev.lane % 2) * 12, L[0], L[1], { size: 13, life: 0.85 }); if (L[2]) Sound.play(L[2]); }
      if (ev.s === 'freeze') R.burst(p.x, p.y + 20, '#bff3ff', 14, { speed: 70, square: false });
      break;
    }
    case 'buff': {
      const p = headOf(ev.side, ev.lane);
      const parts = []; if (ev.atk) parts.push((ev.atk > 0 ? '+' : '') + ev.atk + ' ATK'); if (ev.def) parts.push((ev.def > 0 ? '+' : '') + ev.def + ' DEF');
      R.text(p.x, p.y - 18 - (ev.lane % 2) * 12, ev.ripen ? '+1/+1' : parts.join(' '), (ev.atk || 0) < 0 ? '#9fd6ff' : '#fff3a0', { size: 13, life: 0.85 });
      break;
    }
    case 'land': {
      const p = R.P(R.laneX(ev.lane), 0, (ev.side === M.viewer ? -1 : 1) * 1.6);
      if (ev.cause === 'eat') { R.text(p.x, p.y, 'CHOMP!', '#ffd2a6', { size: 24 }); R.burst(p.x, p.y, '#c9a15a', 26, { speed: 150, square: true, add: false }); Sound.play('eat'); R.shake(3, 0.2); logLine('The Pig eats a ' + E.LANDS[ev.type].name + '!', 'sys'); }
      else if (ev.cause === 'convert') { R.text(p.x, p.y, E.LANDS[ev.type].name.toUpperCase() + '!', LANDC[ev.type], { size: 18 }); R.burst(p.x, p.y, LANDC[ev.type], 26, { speed: 120 }); Sound.play('holo'); }
      else { R.burst(p.x, p.y, LANDC[ev.type], 16, { speed: 80, up: 100 }); Sound.play('heal'); }
      break;
    }
    case 'steal': {
      R.anim(ev.uid, 'move', 0.6, { fx: R.laneX(ev.lane), fz: R.rowZ(ev.from, 'c') });
      const p = headOf(ev.to, ev.toLane); R.text(p.x, p.y - 20, 'STOLEN!', teamOf(ev.to), { size: 20 });
      Sound.play('steal'); vib(30);
      logLine(pname(ev.to) + ' takes control of ' + cname(ev.id) + '!', 'sys');
      break;
    }
    case 'trap': { const p = R.slotPos(ev.side, ev.lane, 'b'); R.text(p.x, p.y - 30, 'TRAP! ' + cname(ev.id), '#ffe27a', { size: 17 }); R.burst(p.x, p.y, '#ffe27a', 20, { speed: 130 }); Sound.play('trap'); vib(30); logLine(cname(ev.id) + ' springs!', 'sys'); break; }
    case 'spirit': { const a = R.slotPos(ev.side, ev.lane, 'b'), b = headOf(1 - ev.side, ev.lane); R.addBeam({ x: a.x, y: a.y - a.s * 0.6 }, b, '#d9b8ff', 0.7); R.text(b.x, b.y - 20, 'POSSESSED!', '#d9b8ff', { size: 20 }); Sound.play('zap'); break; }
    case 'reveal': {
      if (ev.to === M.viewer && M.seats[ev.to].kind === 'human') { if (!(M.st.pending && M.st.pending.side === M.viewer)) showReveal(ev.cards, ev.traps); }
      else if (ev.side === M.viewer) toast(pname(ev.to) + ' peeks at your hand with the Silo of Truth!');
      Sound.play('zap');
      break;
    }
    case 'stealCard': { toast((ev.to === M.viewer ? 'You steal ' : pname(ev.to) + ' steals ') + cname(ev.id) + '!'); Sound.play('steal'); logLine(pname(ev.to) + ' steals ' + cname(ev.id), 'sys'); break; }
    case 'study': { const p = headOf(ev.side, ev.lane); R.text(p.x, p.y - 20, 'STUDY ' + Math.min(3, ev.n) + '/3', '#ffe27a', { size: 15 }); break; }
    case 'zap': {
      const from = ev.from.slot === 'b' ? R.slotPos(ev.from.side, ev.from.lane, 'b') : headOf(ev.from.side, ev.from.lane);
      const to = ev.to.slot === 'hero' ? R.edgePos(ev.to.side) : headOf(ev.to.side, ev.to.lane, ev.to.slot === 'b' ? 'b' : 'c');
      const col = { ice: '#bff3ff', science: '#ff9fd0', fire: '#ff7a3d', cannon: '#ff9a3d', arrow: '#ffffff' }[ev.kind] || '#fff';
      if (ev.kind === 'science') R.addBeam({ x: from.x, y: from.y - 20 }, to, col, 0.4); else R.projectile({ x: from.x, y: from.y - 18 }, to, col, 0.3, { arc: ev.kind === 'cannon' || ev.kind === 'arrow' ? 50 : 20, size: ev.kind === 'cannon' ? 9 : 6 });
      Sound.play(ev.kind === 'arrow' ? 'arrow' : 'zap');
      break;
    }
    case 'crash': { const p = headOf(ev.side, ev.to); R.text(p.x, p.y - 20, 'CRASH!', '#bff3ff', { size: 20 }); R.shake(4, 0.2); break; }
    case 'say': speak(ev.side, ev.text); break;
    case 'volcano': {
      R.shake(12, 1.0); Sound.play('volcano'); vib(80);
      for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) { const p = R.slotPos(side, l, 'c'); R.burst(p.x, p.y, '#ff6b3d', 14, { speed: 180, up: 220 }); }
      speak(ev.side, 'I floop the Volcano!');
      break;
    }
    case 'immortal': toast(cname(ev.id) + ' is Immortal — back to hand!'); break;
    case 'immune': { const p = headOf(ev.side, ev.lane); R.text(p.x, p.y - 20, 'Zzz (safe)', '#d9cff7', { size: 15 }); break; }
    case 'fightPhase': if (anyAttacker(ev)) { stamp('FIGHT!', teamOf(ev.side)); Sound.play('fight'); } break;
    case 'overtime': showBanner('OVERTIME', 'The board overheats: -' + ev.n + ' HP', '#ff6a6a'); break;
    case 'reshuffle': if (ev.side === M.viewer) toast('Your discard pile is shuffled back into your deck'); break;
    case 'handFull': if (ev.side === M.viewer) toast('Hand full!'); break;
    case 'gameOver': break;
  }
}
function stamp(txt, color) {
  const r = R.rect; R.text(r.x + r.w / 2, r.y + r.h / 2, txt, color || '#fff', { size: 46, life: 0.7, vy: 0 });
}
function showBanner(txt, sub, color) {
  const b = $('#banner'); b.classList.remove('on'); void b.offsetWidth;
  b.innerHTML = '<div style="--bc:' + (color || '#3fc8ff') + '">' + esc(txt) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  b.classList.add('on');
  clearTimeout(showBanner.t); showBanner.t = setTimeout(() => b.classList.remove('on'), 1300 / D.speed);
}
function flyCardToCenter(id, side) {
  const el = cardEl(id, {}); el.style.position = 'fixed'; el.style.zIndex = 60; el.style.pointerEvents = 'none'; el.style.fontSize = '1.6rem';
  const r = R.rect, from = side === M.viewer ? $('#hand').getBoundingClientRect() : $('#opp').getBoundingClientRect();
  el.style.left = (from.left + from.width / 2) + 'px'; el.style.top = (from.top + from.height / 2) + 'px';
  el.style.transform = 'translate(-50%,-50%) scale(.4)'; el.style.transition = 'all .35s cubic-bezier(.2,.8,.2,1)';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.left = (r.x + r.w / 2) + 'px'; el.style.top = (r.y + r.h * 0.45) + 'px'; el.style.transform = 'translate(-50%,-50%) scale(1) rotate(-3deg)'; });
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translate(-50%,-50%) scale(1.25)'; }, 450 / D.speed);
  setTimeout(() => el.remove(), 900 / D.speed);
}
function showReveal(cards, traps) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:50%;top:26%;transform:translateX(-50%);z-index:70;display:flex;gap:.4rem;padding:.6rem;background:rgba(20,14,34,.94);border-radius:1rem;box-shadow:0 0 0 2px #ffcf3a;pointer-events:none;flex-wrap:wrap;justify-content:center;width:min(94vw,30rem)';
  const t = document.createElement('div'); t.style.cssText = 'width:100%;text-align:center;font-weight:900;font-size:.8rem;color:#ffcf3a'; t.textContent = 'SILO OF TRUTH: their hand' + (traps && traps.length ? ' • traps: ' + traps.map(x => cname(x.id)).join(', ') : '');
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
  b.style.left = '3.6rem'; b.style.top = side === M.viewer ? '-1.8rem' : '3.2rem';
  seat.appendChild(b); setTimeout(() => b.remove(), 2200);
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
  const P = M.st.players[side], hero = P.hero;
  return '<div class="pf" style="--c:' + R.colors[side] + '"><img alt="" src="' + Art.portraitURL(hero, 96) + '"></div>' +
    '<div class="who"><div class="nm">' + esc(P.name) + '<small class="sub"></small></div>' +
    '<div class="hp"><div class="g"></div><div class="f"></div><div class="n"></div></div>' +
    '<div class="chips"><span class="chip" title="Hand">' + ICON.cards + '<b class="hc"></b></span><span class="chip" title="Deck">' + ICON.deck + '<b class="dc"></b></span>' +
    '<span class="chip" title="Discard">' + ICON.grave + '<b class="gc"></b></span><span class="gems"></span></div></div>';
}
function buildHUD() {
  const me = M.viewer, op = 1 - me;
  $('#opp').innerHTML = seatHTML(op);
  $('#me').innerHTML = seatHTML(me) + '<div class="mebtns"><div class="nextcard" title="Next card"><i>NEXT</i></div><button class="btn blue small drawbtn" id="drawBtn"><b>DRAW</b>1⚡</button></div>';
  $('#drawBtn').onclick = () => { Sound.unlock(); humanCmd({ t: 'draw', p: M.viewer }); };
  $('#me .pf').onclick = () => inspectHero(me); $('#opp .pf').onclick = () => inspectHero(op);
}
function inspectHero(side) {
  const P = M.disp.players[side];
  const lands = P.lanes.map(L => E.LANDS[L.land.type].name + (L.land.down ? ' (eaten)' : '')).join(', ');
  modal('<h2>' + esc(P.name) + '</h2><p>HP <b>' + P.hp + '</b> / ' + P.maxHp + '<br>Hand: ' + P.hand.length + ' • Deck: ' + P.deck.length + ' • Discard: ' + P.discard.length + '<br>Landscapes: ' + esc(lands) + '</p>' +
    '<p style="font-size:.75rem;color:#b6a9d6">Discard pile: ' + (P.discard.map(c => esc(cname(c.id))).join(', ') || 'empty') + '</p>');
}
function refreshSeat(el, side) {
  const st = M.disp; if (!st || !el.firstChild) return;
  const P = st.players[side];
  const pct = Math.max(0, P.hp) / P.maxHp * 100;
  el.querySelector('.f').style.width = pct + '%'; el.querySelector('.g').style.width = pct + '%';
  el.querySelector('.n').textContent = Math.max(0, P.hp) + ' / ' + P.maxHp;
  el.querySelector('.hc').textContent = P.hand.length; el.querySelector('.dc').textContent = P.deck.length; el.querySelector('.gc').textContent = P.discard.length;
  const g = el.querySelector('.gems');
  const act = st.active === side && st.phase === 'main';
  const n = act ? P.actions : 0, max = Math.max(2, n);
  if (g.childElementCount !== max) g.innerHTML = Array.from({ length: max }, () => '<i class="gem"></i>').join('');
  g.querySelectorAll('.gem').forEach((x, i) => x.classList.toggle('on', i < n));
  el.classList.toggle('turn', act);
  const sub = el.querySelector('.sub'); if (sub) sub.textContent = act ? (side === M.viewer ? 'your turn' : 'thinking…') : '';
}
function refreshHUD() {
  if (!M.disp) return;
  refreshSeat($('#me'), M.viewer); refreshSeat($('#opp'), 1 - M.viewer);
  renderHand();
  const P = M.disp.players[M.viewer];
  const nc = $('#me .nextcard');
  if (nc) {
    const top = P.deck.length ? P.deck[P.deck.length - 1] : null;
    if (top && M.seats[M.viewer].kind === 'human') { const cd = E.CARDS[top.id]; nc.style.backgroundImage = 'url(' + Art.cardArtURL(cd.art, LANDC[cd.land], 132, 104) + ')'; nc.style.setProperty('--c', LANDC[cd.land]); nc.title = 'Next: ' + cd.name; nc.onclick = () => inspect(top.id, top.lvl); }
    else { nc.style.backgroundImage = ''; nc.onclick = null; }
  }
  const myTurn = isMyTurn();
  const db = $('#drawBtn'); if (db) db.disabled = !myTurn || P.actions < 1 || P.hand.length >= E.HAND_MAX;
  updateFightBtn();
  $('#undoBtn').classList.toggle('off', !(M.undo && myTurn));
}
function isMyTurn() { return M.on && !M.ended && M.st && M.st.phase === 'main' && M.seats[M.st.active].kind === 'human' && M.st.active === M.viewer && directorIdle() && !M.st.pending && !M.waitingPass; }
function updateFightBtn() {
  const b = $('#fightBtn'), small = b.querySelector('small');
  b.classList.remove('ready', 'wait');
  if (!M.st || M.ended) { small.textContent = ''; return; }
  if (!isMyTurn()) { b.classList.add('wait'); small.textContent = M.st.active === M.viewer ? '…' : 'opponent’s turn'; b.disabled = true; return; }
  b.disabled = false;
  const sum = E.actionsLeftSummary(M.st, M.viewer);
  const P = M.st.players[M.viewer];
  if (!sum.total) { b.classList.add('ready'); small.textContent = P.actions > 0 && P.hand.length < E.HAND_MAX && (P.deck.length || P.discard.length) ? 'nothing to play \u2022 draw or fight' : 'nothing left to do'; }
  else small.textContent = sum.cards + sum.floops === 1 ? '1 thing can still act' : (sum.cards + sum.floops) + ' things can still act';
}

// ------------------------------------------------------------------ hand
let handSig = '';
function renderHand() {
  const st = M.disp; if (!st) return;
  if (drag && drag.moved) { handSig = ''; return; }   // never rebuild under a live drag
  const me = M.viewer, P = st.players[me];
  const human = M.seats[me].kind === 'human';
  const hidden = !human || M.waitingPass;
  const sig = P.hand.map(c => c.uid).join(',') + '|' + (M.sel && M.sel.uid) + '|' + P.actions + '|' + isMyTurn() + hidden + document.body.className + window.innerWidth + 'x' + window.innerHeight + countLandsSig(st, me);
  if (sig === handSig) return;
  handSig = sig;
  const h = $('#hand'); h.innerHTML = '';
  const n = P.hand.length; if (!n) return;
  const wide = document.body.classList.contains('wide');
  const box = h.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
  let cw, chh, positions = [];
  if (!wide) {
    cw = 4.9 * fs; chh = 6.9 * fs;
    const maxW = box.width - 12, step = n > 1 ? Math.min(cw * 0.92, (maxW - cw) / (n - 1)) : 0;
    const total = cw + step * (n - 1), x0 = (box.width - total) / 2;
    for (let i = 0; i < n; i++) { const c = i - (n - 1) / 2; positions.push({ x: x0 + i * step, y: box.height - chh - 10 + Math.abs(c) * c * 0 + c * c * 2.2, rot: c * 3.2, fs: 1 }); }
  } else {
    let cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    let wpx = (box.width - (cols - 1) * 8) / cols, hpx = wpx * 6.9 / 4.9;
    if (rows * (hpx + 8) > box.height) { hpx = (box.height - (rows - 1) * 8) / rows; wpx = hpx * 4.9 / 6.9; }
    const sc = wpx / (4.9 * fs);
    cw = wpx; chh = hpx;
    for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), c = i % cols; const rowCount = Math.min(cols, n - r * cols); const off = (box.width - (rowCount * wpx + (rowCount - 1) * 8)) / 2; positions.push({ x: off + c * (wpx + 8), y: r * (hpx + 8), rot: 0, fs: sc }); }
  }
  P.hand.forEach((inst, i) => {
    const why = hidden ? 'hidden' : E.playBlock(st, me, inst.uid);
    const cost = E.spellCost(st, me, E.CARDS[inst.id]);
    const el = hidden ? cardEl('?', { back: true }) : cardEl(inst.id, { lvl: inst.lvl, mini: !wide || positions[i].fs < 1.4, dim: !!why, cost });
    const pos = positions[i];
    el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; el.style.fontSize = pos.fs + 'rem';
    const selected = M.sel && M.sel.uid === inst.uid;
    el.style.transform = selected ? 'translateY(-' + (wide ? 0.4 : 1.6) + 'rem) scale(' + (wide ? 1.04 : 1.12) + ')' : 'rotate(' + pos.rot + 'deg)';
    if (selected) el.classList.add('sel');
    el.dataset.uid = inst.uid;
    if (!hidden) attachCardInput(el, inst);
    h.appendChild(el);
  });
}
function countLandsSig(st, me) { return st.players[me].lanes.map(L => L.land.type[0] + (L.land.down ? 1 : 0)).join(''); }

// ------------------------------------------------------------------ selection & highlights
function clearSel() { M.sel = null; R.ghost = null; hideTip(); hideInfo(); updateHL(); handSig = ''; renderHand(); }
function updateHL() {
  R.hl = []; R.sel = null; R.idle = null;
  const st = M.st; if (!st || !M.on) return;
  const me = M.viewer, sel = M.sel;
  if (!sel && isMyTurn()) {
    const idle = [];
    for (let l = 0; l < 4; l++) if (!E.floopBlock(st, me, l, 'c') || (E.moveOptions(st, me, l).some(m => m.cost === 0 && !m.swap))) idle.push(l);
    R.idle = idle;
  }
  if (!sel) { R.preview = isMyTurn() ? fightPreview() : null; return; }
  R.preview = null;
  if (sel.kind === 'card') {
    const cd = E.CARDS[sel.id];
    if (cd.type === 'spell') { const opts = targetOptsFor(sel); for (const o of opts) R.hl.push(o); }
    else for (const l of E.playLanes(st, me, sel.uid)) R.hl.push({ side: me, lane: l, slot: cd.type === 'creature' ? 'c' : 'b', kind: 'play', strong: true });
  } else if (sel.kind === 'target') {
    for (const o of targetOptsFor(sel)) R.hl.push(o);
    if (sel.lane != null) R.sel = { side: me, lane: sel.lane, slot: sel.slot };
  } else if (sel.kind === 'creature' || sel.kind === 'building' || sel.kind === 'enemy') {
    R.sel = { side: sel.side, lane: sel.lane, slot: sel.slot };
    if (sel.kind === 'creature' && isMyTurn()) for (const m of E.moveOptions(st, me, sel.lane)) R.hl.push({ side: me, lane: m.to, slot: 'c', kind: 'move', label: m.cost ? '1⚡' : 'free' });
  }
}
function stepKind(src) { const steps = E.targetSteps(M.st, M.viewer, src); return steps; }
function targetOptsFor(sel) {
  const st = M.st, me = M.viewer;
  const src = sel.uid != null && sel.kind !== 'target' ? { uid: sel.uid } : sel.src;
  const chosen = sel.chosen || [];
  const opts = E.targetOptions(st, me, src, chosen) || [];
  const steps = stepKind(src), kind = steps[chosen.length];
  return opts.filter(o => o.uid == null).map(o => ({
    side: o.side, lane: o.lane, slot: o.land ? 'land' : 'c',
    kind: o.land ? 'ability' : (/Lane|Dir/.test(kind) ? (/myOther|emptyLane|myEmpty/.test(kind) ? 'move' : 'ability') : (o.side === me ? 'ally' : 'attack')),
    strong: true, opt: o
  }));
}
const STEP_TEXT = {
  enemyCreature: 'Choose an enemy creature', allyCreature: 'Choose one of your creatures', anyCreature: 'Choose a creature', myFlooped: 'Choose one of your flooped creatures',
  anyMovable: 'Choose a creature to move', emptyLaneSameSide: 'Choose an empty lane for it', myLand: 'Choose one of your landscapes', anyLand: 'Choose a landscape',
  adjEmptyLane: 'Choose an adjacent empty lane', myDiscardCreature: 'Choose a creature from your discard pile', myEmptyLane: 'Choose an empty lane', myMovable: 'Choose one of your creatures',
  myOtherLane: 'Choose where it goes', pushDir: 'Choose which way to push', enemyNearMyBuilding: 'Choose an enemy in a lane with your building'
};

function showTip(html) { const t = $('#tip'); t.innerHTML = html; t.classList.add('on'); }
function hideTip() { $('#tip').classList.remove('on'); }
function cardTip(inst) {
  const cd = E.CARDS[inst.id], why = E.playBlock(M.st, M.viewer, inst.uid);
  const s = lvlStats(cd, inst.lvl);
  let h = '<h4>' + esc(cd.name) + ' <span style="opacity:.7;font-size:.7rem">' + esc(typeLine(cd)) + '</span></h4>';
  if (cd.type === 'creature') h += '<span class="kw">' + s.atk + ' ATK / ' + s.def + ' DEF</span> • ';
  if (cd.type === 'building') h += '<span class="kw">' + s.def + ' DEF</span> • ';
  h += fmtText(cd.text || '');
  if (why) h += '<div class="warn">' + esc(why) + '</div>';
  else h += '<div style="opacity:.7;margin-top:.15rem">' + (cd.type === 'spell' ? (E.targetSteps(M.st, M.viewer, { uid: inst.uid }).length ? 'Tap or drag onto a target.' : 'Tap the board or drag it up to cast.') : 'Drag onto a glowing slot, or tap a slot.') + ' Hold for details.</div>';
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
  const reveals = r.events.some(e => e.rng || e.info || e.t === 'draw' || e.t === 'trap' || e.t === 'reveal' || e.t === 'turn' || e.t === 'stealCard');
  if (who === 'human') M.undo = reveals || cmd.t === 'end' ? null : { state: M.st, log: M.log.length };
  else M.undo = null;
  M.st = r.state;
  pushEvents(r.events);
  if (M.tutorial && M.tutorial.onCmd) M.tutorial.onCmd(cmd, r);
  return r;
}
function humanCmd(cmd) {
  if (!isMyTurn()) return false;
  if (M.tutorial && M.tutorial.allow && !M.tutorial.allow(cmd)) { Sound.play('error'); return false; }
  const r = exec(cmd, 'human');
  if (r.error) { Sound.play('error'); toast(r.error); return false; }
  if (cmd.t === 'end') Sound.play('click');
  clearSel();
  return true;
}
function doUndo() {
  if (!M.undo || !isMyTurn()) return;
  M.st = M.undo.state; M.log.length = Math.min(M.log.length, M.undo.log); M.undo = null;
  M.disp = M.st; R.setState(M.st, M.viewer); R.clearFx();
  clearSel(); refreshHUD(); updateHL();
  Sound.play('select'); toast('Undone');
}

// ------------------------------------------------------------------ idle / AI / turn flow
let aiTimer = 0;
function onIdle() {
  if (!M.on) return;
  M.disp = M.st; R.setState(M.st, M.viewer);
  if (M.st.winner != null && !M.ended) { M.ended = true; R.preview = null; R.hl = []; setTimeout(() => finish(), 700); refreshHUD(); return; }
  if (M.ended) return;
  const st = M.st;
  if (st.phase !== 'main') return;
  if (st.pending) {
    const pd = st.pending;
    if (M.seats[pd.side].kind === 'human') { if (!M.choosing) humanChooseSteal(pd); }
    else if (aiTimer <= 0) { aiTimer = 0.4; exec({ t: 'choose', p: pd.side, uid: AI.chooseSteal(st, pd.side) }, 'ai'); }
    return;
  }
  const seat = M.seats[st.active];
  if (seat.kind === 'ai') {
    if (aiTimer > 0) return;
    aiStep();
    return;
  }
  // human seat to act
  if (M.mode === 'pvp' && st.active !== M.viewer && !M.waitingPass) { passDevice(st.active); return; }
  if (!M.idleShown && isMyTurn()) { M.idleShown = true; updateHL(); refreshHUD(); startTimer(); if (M.tutorial && M.tutorial.onIdle) M.tutorial.onIdle(); }
}
function aiStep() {
  const st = M.st, me = st.active, seat = M.seats[me];
  if (!M.aiPlan || !M.aiPlan.length) {
    const scripted = seat.plan ? seat.plan(st, me) : null;
    M.aiPlan = scripted || AI.planTurn(st, me, { difficulty: seat.difficulty, personality: seat.personality, seed: (E.hashSeed(M.cfg.seed) + st.turn * 977 + M.aiGuard) >>> 0 });
    if (!M.aiPlan.length) M.aiPlan = [{ t: 'end', p: me }];
  }
  const cmd = M.aiPlan.shift();
  const r = exec(cmd, 'ai');
  M.aiGuard++;
  if (r.error) { M.aiPlan = []; if (M.aiGuard > 60) exec({ t: 'end', p: me }, 'ai'); aiTimer = 0.05; return; }
  if (cmd.t === 'end') { M.aiPlan = null; M.aiGuard = 0; aiTimer = 0.2; maybeAITaunt(me); return; }
  if (r.events.some(e => e.rng || e.t === 'draw' || e.t === 'trap' || e.t === 'reveal' || e.t === 'pending')) M.aiPlan = [];
  aiTimer = 0.35 / D.speed;
  if (cmd.lane != null) R.sel = { side: me, lane: cmd.lane, slot: cmd.slot || 'c' };
}
function maybeAITaunt(side) {
  const seat = M.seats[side]; if (!seat.lines || Math.random() > 0.35) return;
  speak(side, seat.lines[Math.floor(Math.random() * seat.lines.length)]);
}
function passDevice(next) {
  M.waitingPass = true; handSig = ''; renderHand(); stopTimer();
  const P = M.st.players[next];
  modal('<h2>Pass to ' + esc(P.name) + '</h2><p class="center">No peeking at their hand! Hand the device over, then tap ready.</p><div class="row"><button class="btn" data-ready>I’m ' + esc(P.name) + ' — ready!</button></div>', { noClose: true });
  $('#modal [data-ready]').onclick = () => {
    closeModal(); M.waitingPass = false; M.viewer = next; R.setState(M.st, next); R.invalidate(); R.resetView();
    buildHUD(); handSig = ''; M.idleShown = false; refreshHUD(); updateHL();
  };
}
function humanChooseSteal(pd) {
  M.choosing = true;
  const O = M.st.players[pd.from];
  const d = modal('<h2>Silo of Truth</h2><p class="center">You see ' + esc(O.name) + '\u2019s whole hand. Tap a <b>Spell</b> to steal it:</p><div class="row" id="stealRow"></div><div class="row"><button class="btn ghost small" data-skip>Take nothing</button></div>', { noClose: true, wide: true });
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

// ------------------------------------------------------------------ fight preview
function fightPreview() {
  const st = M.st, me = M.viewer; if (!st || st.active !== me || st.turn === 1) return null;
  const red = E.redact(st, me);
  const pv = E.previewFights(red); if (!pv.state) return null;
  const items = [], arrows = [];
  const o = 1 - me;
  for (let l = 0; l < 4; l++) {
    for (const side of [o, me]) {
      const a = st.players[side].lanes[l].creature, b = pv.state.players[side].lanes[l].creature;
      if (!a) continue;
      if (!b || b.uid !== a.uid) items.push({ side, lane: l, dmg: E.cStats(st, side, l).hp, lethal: true });
      else if (b.dmg > a.dmg && side === o) items.push({ side, lane: l, dmg: b.dmg - a.dmg, lethal: false });
    }
    const ba = st.players[o].lanes[l].building, bb = pv.state.players[o].lanes[l].building;
    if (ba && (!bb || bb.dmg > ba.dmg)) items.push({ side: o, lane: l, slot: 'b', dmg: bb ? bb.dmg - ba.dmg : E.bDef(ba) - ba.dmg, lethal: !bb });
  }
  const dh = st.players[o].hp - pv.state.players[o].hp;
  if (dh > 0) items.push({ hero: true, side: o, dmg: dh, lethal: pv.state.players[o].hp <= 0 });
  for (const e of pv.events) if (e.t === 'attack') arrows.push({ side: e.side, lane: e.lane, toSide: e.toSide, toLane: e.toLane, toSlot: e.kind === 'building' ? 'b' : 'c', hero: e.kind === 'hero' });
  return { items, arrows };
}
// preview of an action (spell / floop) on a redacted copy
function actionPreview(cmd) {
  const st = M.st, me = M.viewer;
  const red = E.redact(st, me);
  const r = E.apply(red, cmd); if (r.error) return null;
  const items = [];
  for (let side = 0; side < 2; side++) for (let l = 0; l < 4; l++) {
    const a = st.players[side].lanes[l].creature, b = r.state.players[side].lanes[l].creature;
    if (a && (!b || b.uid !== a.uid)) { if (!r.events.some(e => e.t === 'steal' && e.uid === a.uid) && !r.events.some(e => e.t === 'move' && e.uid === a.uid)) items.push({ side, lane: l, dmg: E.cStats(st, side, l).hp, lethal: true }); }
    else if (a && b && b.dmg > a.dmg) items.push({ side, lane: l, dmg: b.dmg - a.dmg, lethal: false });
  }
  return { items, arrows: [] };
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
      if (!isMyTurn() || E.playBlock(M.st, M.viewer, inst.uid)) { const why = isMyTurn() ? E.playBlock(M.st, M.viewer, inst.uid) : 'Not your turn'; toast(why); Sound.play('error'); drag = null; return; }
      selectCard(inst, true);
      const g = cardEl(inst.id, { lvl: inst.lvl, mini: true }); g.classList.add('dragghost'); g.style.fontSize = '1.05rem'; document.body.appendChild(g); drag.ghost = g;
      el.classList.add('drag');
    }
    if (drag && drag.moved) {
      drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
      const cell = cellAt(e.clientX, e.clientY);
      const ok = cell && R.hl.some(h => matchCell(h, cell));
      R.ghost = { id: inst.id, x: e.clientX, y: e.clientY, cell: ok ? normCell(cell) : null };
      drag.ghost.style.opacity = ok ? '0.35' : '0.92';
      if (ok && E.CARDS[inst.id].type === 'spell') { const h = R.hl.find(q => matchCell(q, cell)); if (h) R.preview = h.opt ? actionPreview({ t: 'play', p: M.viewer, uid: inst.uid, targets: (M.sel.chosen || []).concat([h.opt]) }) : null; }
    }
  };
  el.onpointerup = e => {
    if (!drag || drag.inst !== inst) return;
    clearTimeout(drag.long);
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    el.classList.remove('drag'); handSig = '';
    if (!d.moved) { // tap
      if (M.sel && M.sel.uid === inst.uid) { clearSel(); return; }
      selectCard(inst, false); return;
    }
    R.ghost = null;
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
  el.onpointercancel = () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; R.ghost = null; el.classList.remove('drag'); };
}
function selectCard(inst, viaDrag) {
  if (!isMyTurn()) { showTip(cardTip(inst)); M.sel = { kind: 'peek', uid: inst.uid }; handSig = ''; renderHand(); return; }
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
function matchCell(h, cell) {
  if (h.slot === 'land') return h.side === cell.side && h.lane === cell.lane;
  return h.side === cell.side && h.lane === cell.lane && (h.slot === cell.slot || (h.slot === 'c' && cell.slot === 'b' && h.kind !== 'play') || (h.slot === 'b' && h.kind === 'play' && cell.slot === 'c' && false));
}
function normCell(c) { return { side: c.side, lane: c.lane, slot: c.slot }; }
function cellAt(x, y) {
  const m = R.hitMini(x, y); if (m) return m;
  return R.hit(x, y);
}

// ------------------------------------------------------------------ input: board
const ptrs = new Map();
let pinch = null, panning = null, lastTap = 0, pendingConfirm = null;
function boardDown(e) {
  Sound.unlock();
  M.lastTouch = e.pointerType !== 'mouse';
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; panning = null; }
  else if (ptrs.size === 1 && R.cam.zoom > 1.01) panning = { x: e.clientX, y: e.clientY, moved: false };
}
function boardMove(e) {
  const p = ptrs.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.d > 0) R.zoomBy(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.d = d; return;
  }
  if (panning && p && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) { R.panBy(e.clientX - panning.x, e.clientY - panning.y); panning.x = e.clientX; panning.y = e.clientY; panning.moved = true; return; }
  if (!M.lastTouch && M.on && isMyTurn()) {
    const cell = cellAt(e.clientX, e.clientY);
    R.hover = cell;
    if (M.sel && (M.sel.kind === 'target' || (M.sel.kind === 'card' && E.CARDS[M.sel.id].type === 'spell'))) {
      const h = cell && R.hl.find(q => matchCell(q, cell));
      R.preview = h && h.opt ? actionPreview(cmdFor(M.sel, h.opt)) : null;
    }
  }
}
function boardUp(e) {
  const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; return; }
  if (panning && panning.moved) { panning = null; return; }
  panning = null;
  if (!p || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 12) return;
  const now = performance.now();
  if (now - lastTap < 300 && !M.sel) { R.resetView(); lastTap = 0; return; }
  lastTap = now;
  if (!M.on) return;
  if (!directorIdle() && M.seats[M.st.active].kind === 'ai') { D.ff = true; return; }
  boardTap(e.clientX, e.clientY);
}
function boardTap(x, y) {
  const cell = cellAt(x, y);
  closePanels();
  if (M.sel && (M.sel.kind === 'card' || M.sel.kind === 'target')) {
    if (cell && tapCellWhileSelected(cell, false)) return;
    if (M.sel.kind === 'card' && E.CARDS[M.sel.id].type === 'spell' && !E.targetSteps(M.st, M.viewer, { uid: M.sel.uid }).length && isMyTurn()) {
      humanCmd({ t: 'play', p: M.viewer, uid: M.sel.uid, targets: [] }); return;
    }
    clearSel(); return;
  }
  if (M.sel && M.sel.kind === 'creature' && cell && isMyTurn()) {
    const mv = E.moveOptions(M.st, M.viewer, M.sel.lane).find(m => m.to === cell.lane && cell.side === M.viewer);
    if (mv) { humanCmd({ t: 'move', p: M.viewer, from: M.sel.lane, to: mv.to }); return; }
  }
  if (!cell) { clearSel(); return; }
  const st = M.disp, L = st.players[cell.side].lanes[cell.lane];
  let obj = cell.slot === 'b' ? L.building : L.creature;
  let slot = cell.slot;
  if (!obj) { const other = cell.slot === 'b' ? L.creature : L.building; if (other) { obj = other; slot = cell.slot === 'b' ? 'c' : 'b'; } }
  if (!obj) { clearSel(); return; }
  if (obj.hidden && cell.side !== M.viewer) { toast('A face-down building. Could be a trap…'); return; }
  selectBoardObj(cell.side, cell.lane, slot);
}
function cmdFor(sel, opt) {
  const chosen = (sel.chosen || []).concat([opt]);
  if (sel.kind === 'card' || (sel.kind === 'target' && sel.uid != null)) return { t: 'play', p: M.viewer, uid: sel.uid, targets: chosen };
  return { t: 'floop', p: M.viewer, lane: sel.lane, slot: sel.slot, targets: chosen };
}
function tapCellWhileSelected(cell, viaDrop) {
  const sel = M.sel; if (!sel || !isMyTurn()) return false;
  const h = R.hl.find(q => matchCell(q, cell));
  if (!h) return false;
  if (sel.kind === 'card' && h.kind === 'play') { humanCmd({ t: 'play', p: M.viewer, uid: sel.uid, lane: h.lane }); return true; }
  if (!h.opt) return false;
  const src = sel.kind === 'card' ? { uid: sel.uid } : sel.src;
  const steps = E.targetSteps(M.st, M.viewer, src);
  const chosen = (sel.chosen || []).concat([h.opt]);
  if (chosen.length < steps.length) {
    M.sel = Object.assign({}, sel, { kind: 'target', src, chosen });
    afterTargetStep(); return true;
  }
  const cmd = cmdFor(sel, h.opt);
  const needConfirm = M.lastTouch && settings.confirmTouch && !viaDrop && harmful(cmd);
  if (needConfirm && !(pendingConfirm && pendingConfirm.key === JSON.stringify(cmd))) {
    pendingConfirm = { key: JSON.stringify(cmd) };
    R.preview = actionPreview(cmd);
    const pv = R.preview && R.preview.items.find(it => it.side === h.side && it.lane === h.lane);
    showTip((pv ? '<b>' + pv.dmg + (pv.lethal ? ' → KO!' : ' damage') + '</b> • ' : '') + 'Tap again to confirm.');
    return true;
  }
  pendingConfirm = null;
  humanCmd(cmd);
  return true;
}
function harmful(cmd) { const pv = actionPreview(cmd); return !!(pv && pv.items.length); }
function afterTargetStep() {
  const sel = M.sel;
  const steps = E.targetSteps(M.st, M.viewer, sel.src);
  const kind = steps[sel.chosen.length];
  if (kind === 'myDiscardCreature') { chooseFromDiscard(sel); return; }
  showTip('<b>' + esc(STEP_TEXT[kind] || 'Choose a target') + '</b> <span style="opacity:.7">(tap empty space to cancel)</span>');
  updateHL();
}
function chooseFromDiscard(sel) {
  const opts = E.targetOptions(M.st, M.viewer, sel.src, sel.chosen) || [];
  const d = modal('<h2>Choose a creature</h2><div class="row" id="disc"></div>', { onClose: () => { if (M.sel === sel) clearSel(); } });
  const row = d.querySelector('#disc');
  if (!opts.length) row.innerHTML = '<p>No creatures in your discard pile.</p>';
  for (const o of opts) {
    const el = cardEl(o.id, { mini: true }); el.style.fontSize = '1.2rem'; el.style.cursor = 'pointer';
    el.onclick = () => { modalClose = null; closeModal(); M.sel = Object.assign({}, sel, { chosen: sel.chosen.concat([o]) }); const steps = E.targetSteps(M.st, M.viewer, sel.src); if (M.sel.chosen.length >= steps.length) humanCmd(cmdFor(Object.assign({}, sel, { chosen: sel.chosen }), o)); else afterTargetStep(); };
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
function showInfo(side, lane, slot, obj) {
  const st = M.disp, me = M.viewer, cd = E.CARDS[obj.id];
  const el = $('#info');
  const pills = [];
  if (slot === 'c') {
    const s = E.cStats(st, side, lane);
    pills.push(s.atk + ' ATK', s.hp + '/' + s.def + ' HP');
    if (s.home) pills.push('Home Advantage');
    if (obj.flooped) pills.push(E.napping(st, side, lane) ? 'Napping (safe)' : 'Flooped');
    if (obj.frozen) pills.push('Frozen'); if (obj.chill) pills.push('Chill ' + obj.chill); if (obj.burn) pills.push('Burn ' + obj.burn);
    if (obj.rot) pills.push('Rotting'); if (obj.shield) pills.push('Shield ' + obj.shield); if (obj.stuck) pills.push('Stuck');
    if (obj.study) pills.push('Study ' + obj.study + '/3'); if (obj.ripen) pills.push('Ripened'); if (obj.forge) pills.push('Forged +' + obj.forge);
    if (obj.owner !== side) pills.push('Stolen!');
    if (cd.kw.collapse && st.players[side].lanes[lane].land.down) pills.push('Collapsed');
  } else pills.push((E.bDef(obj) - obj.dmg) + '/' + E.bDef(obj) + ' DEF');
  let acts = '';
  if (side === me && isMyTurn() && cd.floop) {
    const why = E.floopBlock(M.st, me, lane, slot);
    acts += '<button class="btn small" id="floopBtn" ' + (why ? 'disabled' : '') + '>FLOOP' + (cd.floop.cost ? ' (' + cd.floop.cost + '⚡)' : '') + '</button>';
    if (why) acts += '<span class="pill" style="align-self:center">' + esc(why) + '</span>';
  }
  if (side === me && slot === 'c' && isMyTurn()) {
    const mv = E.moveOptions(M.st, me, lane);
    acts += mv.length ? '<span class="pill" style="align-self:center">Tap a blue lane to move (' + (mv.some(m => m.cost === 0) ? 'free on Blue Plains' : '1⚡') + ')</span>' : '';
  }
  acts += '<button class="btn ghost small" id="moreBtn">Details</button>';
  el.innerHTML = '<button class="x" id="infoX">✕</button><div class="row"><div id="infoCard"></div><div class="desc"><h3>' + esc(cd.name) + '</h3>' +
    '<div class="stats">' + pills.map(p => '<span class="pill">' + esc(p) + '</span>').join('') + '</div>' + fmtText(cd.text || '') + '</div></div><div class="acts">' + acts + '</div>';
  const c = cardEl(obj.id, { lvl: obj.lvl, mini: true }); el.querySelector('#infoCard').appendChild(c);
  el.classList.add('on');
  el.querySelector('#infoX').onclick = () => clearSel();
  el.querySelector('#moreBtn').onclick = () => inspect(obj.id, obj.lvl);
  const fb = el.querySelector('#floopBtn');
  if (fb) fb.onclick = () => {
    const src = { lane, slot };
    const steps = E.targetSteps(M.st, me, src);
    if (!steps.length) { humanCmd({ t: 'floop', p: me, lane, slot, targets: [] }); return; }
    hideInfo();
    M.sel = { kind: 'target', src, lane, slot, chosen: [] };
    afterTargetStep();
  };
}
function hideInfo() { $('#info').classList.remove('on'); }
function closePanels() { $('#logDrawer').classList.remove('on'); $('#emotes').classList.remove('on'); }

// ------------------------------------------------------------------ emotes
const EMOTES = [['Mathematical!', 'finn'], ['Oh my glob!', 'lsp'], ['Dweeb!', 'jake'], ['For the glory!', 'jake'], ['Algebraic!', 'finn'], ['Wenk.', 'gunter']];
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
    if (M.timeLeft <= 0) { stopTimer(); toast('Time! Turn ended.'); clearSel(); humanCmd({ t: 'end', p: M.viewer }); }
  }, 1000);
  t.textContent = '⏱ 45';
}
function stopTimer() { if (M.timer) clearInterval(M.timer); M.timer = null; $('#timer').classList.remove('on', 'low'); }

// ------------------------------------------------------------------ start / finish
function start(cfg) {
  // cfg: { seed, mode, seats:[{kind, name, hero, deck, levels, difficulty, personality, lines, hp}], first, tutorial, onEnd, overtime }
  M.cfg = cfg; M.mode = cfg.mode || 'ai'; M.seats = cfg.seats; M.onEnd = cfg.onEnd; M.tutorial = cfg.tutorial || null;
  M.on = true; M.ended = false; M.sel = null; M.undo = null; M.log = []; M.aiPlan = null; M.aiGuard = 0; M.waitingPass = false; M.idleShown = false; M.choosing = false;
  M.stats = { dealt: 0, taken: 0, killed: 0, lost: 0 };
  D.q = []; D.cur = null; D.ff = false;
  const g = E.newGame({ seed: cfg.seed, first: cfg.first, overtime: cfg.overtime, noMulligan: !!cfg.noMulligan, players: cfg.seats.map(s => ({ name: s.name, hero: s.hero, deck: s.deck, levels: s.levels, hp: s.hp, startBuildings: s.startBuildings, bonusActions: s.bonusActions })) });
  M.st = g.state;
  if (cfg.setup) cfg.setup(M.st);
  M.viewer = cfg.seats[0].kind === 'human' || cfg.seats[1].kind !== 'human' ? 0 : 1;
  if (M.mode === 'pvp') M.viewer = M.st.first;
  R.colors = M.mode === 'pvp' ? [R.TEAM[0], R.TEAM[1]] : (M.viewer === 0 ? [R.TEAM[0], R.TEAM[1]] : [R.TEAM[1], R.TEAM[0]]);
  M.disp = M.st;
  R.mode = 'match'; R.clearFx(); R.dying.length = 0; R.invalidate(); R.resetView();
  R.intro = settings.reduceMotion ? null : { t: 0 }; let pops = 0;
  R.onIntroPop = () => { if (pops++ % 2 === 0) Sound.play('floop'); };
  R.setState(M.st, M.viewer);
  showScreen('match');
  buildHUD(); buildEmotes(); handSig = ''; refreshHUD(); layout();
  if (M.st.phase === 'mulligan') doMulligans(); else afterSetup();
}
function doMulligans() {
  for (let p = 0; p < 2; p++) if (M.seats[p].kind === 'ai') M.st = E.apply(M.st, AI.decide(M.st, p, {})).state;
  const humans = [0, 1].filter(p => M.seats[p].kind === 'human' && M.st.players[p].mulled == null);
  const next = () => {
    const p = humans.shift();
    if (p == null) { afterSetup(); return; }
    if (M.mode === 'pvp') M.viewer = p;
    const P = M.st.players[p];
    const d = modal('<h2>' + esc(P.name) + ': opening hand</h2><p class="center">Keep these 5 cards, or shuffle them back and draw 5 new ones (once).<br><small>Tip: you want at least two creatures you can play.</small></p><div class="row" id="mullRow"></div><div class="row"><button class="btn" data-keep>Keep</button><button class="btn blue" data-mull>Mulligan</button></div>', { noClose: true });
    const row = d.querySelector('#mullRow');
    for (const c of P.hand) { const el = cardEl(c.id, { lvl: c.lvl, mini: true }); el.style.fontSize = '1.05rem'; el.onclick = () => {}; row.appendChild(el); }
    d.querySelector('[data-keep]').onclick = () => { closeModal(); M.st = E.apply(M.st, { t: 'mulligan', p, redraw: false }).state; next(); };
    d.querySelector('[data-mull]').onclick = () => { closeModal(); M.st = E.apply(M.st, { t: 'mulligan', p, redraw: true }).state; Sound.play('whoosh'); next(); };
  };
  next();
}
function afterSetup() {
  if (M.mode === 'pvp') { M.viewer = M.st.first; R.colors = [R.TEAM[0], R.TEAM[1]]; R.setState(M.st, M.viewer); R.invalidate(); buildHUD(); }
  M.disp = M.st; R.setState(M.st, M.viewer);
  const firstName = M.st.players[M.st.first].name;
  logLine(firstName + ' goes first (no floop or fight on the very first turn).', 'sys');
  // opening: everyone floops their land cards, then the first turn banner
  if (R.intro) { R.intro.t = 0; showBanner('FLOOP YOUR LAND CARDS!', firstName + ' goes first', '#ffcf3a'); }
  pushEvents([{ t: '_pause', ms: R.intro ? 1500 : 0 }, { t: 'turn', side: M.st.active, turn: M.st.turn, round: M.st.round, snap: E.clone(M.st) }]);
  refreshHUD();
}
function finish() {
  stopTimer(); clearSel();
  const st = M.st;
  const res = { winner: st.winner, viewer: M.viewer, mode: M.mode, reason: st.reason, rounds: st.round, stats: M.stats, hp: [st.players[0].hp, st.players[1].hp], names: [st.players[0].name, st.players[1].name] };
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
  R.mode = name === 'match' ? 'match' : 'home';
  R.homeLive = name === 'home';
  R.invalidate();
}
function layout() {
  const W = window.innerWidth, H = window.innerHeight;
  const wide = W / H > 0.95;
  document.body.classList.toggle('wide', wide); document.body.classList.toggle('portrait', !wide);
  const s = wide ? Math.max(0.72, Math.min(1.9, Math.min(W / 844, H / 390))) : Math.max(0.78, Math.min(1.5, Math.min(W / 390, H / 760)));
  document.documentElement.style.setProperty('--s', s.toFixed(3));
  R.resize();
  const ba = $('#board-area').getBoundingClientRect();
  if (ba.width > 0) R.setRect({ x: ba.left, y: ba.top, w: ba.width, h: ba.height });
  else R.setRect({ x: 0, y: H * 0.1, w: W, h: H * 0.6 });
  handSig = ''; if (M.on || current === 'match') renderHand();
}

// ------------------------------------------------------------------ wiring
function init() {
  $('#menuBtn').innerHTML = ICON.menu; $('#logBtn').innerHTML = ICON.log; $('#emoteBtn').innerHTML = ICON.emote; $('#undoBtn').innerHTML = ICON.undo;
  $('#fightBtn').onclick = () => { Sound.unlock(); if (isMyTurn()) { clearSel(); humanCmd({ t: 'end', p: M.viewer }); } };
  $('#undoBtn').onclick = doUndo;
  $('#logBtn').onclick = () => { const d = $('#logDrawer'); const on = !d.classList.contains('on'); closePanels(); if (on) { d.classList.add('on'); renderLog(); } };
  $('#emoteBtn').onclick = () => { const d = $('#emotes'); const on = !d.classList.contains('on'); closePanels(); if (on) d.classList.add('on'); };
  $('#speedBtn').onclick = () => { settings.speed = settings.speed === 1 ? 2 : 1; D.speed = settings.speed; $('#speedBtn').textContent = settings.speed + 'x'; if (UI.onSettings) UI.onSettings(); };
  $('#menuBtn').onclick = () => { if (UI.onMenu) UI.onMenu(); };
  const cv = $('#cv');
  cv.addEventListener('pointerdown', boardDown);
  window.addEventListener('pointermove', boardMove);
  window.addEventListener('pointerup', e => { if (e.target === cv || ptrs.has(e.pointerId)) boardUp(e); });
  window.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = null; panning = null; });
  cv.addEventListener('wheel', e => { if (current !== 'match') return; e.preventDefault(); R.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (current !== 'match') return;
    if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) closeModal(); else clearSel(); }
    if ((e.key === 'Enter' || e.key === ' ') && isMyTurn() && !$('#modal').classList.contains('on')) { e.preventDefault(); clearSel(); humanCmd({ t: 'end', p: M.viewer }); }
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) doUndo();
  });
}
function tick(dt) {
  if (M.emoteCd > 0) M.emoteCd -= dt;
  if (aiTimer > 0) aiTimer -= dt * D.speed * (D.ff ? 5 : 1);
  if (M.on || D.q.length || D.cur) directorUpdate(dt);
  const idle = directorIdle();
  if (idle) { D.ff = false; if (D.wasBusy) { D.wasBusy = false; if (M.on) { refreshHUD(); updateHL(); } } } else D.wasBusy = true;
  if (M.on && M.st && M.st.active !== M.viewer) M.idleShown = false;
  if (M.on && isMyTurn() && !M.idleShown) { M.idleShown = true; updateHL(); refreshHUD(); startTimer(); if (M.tutorial && M.tutorial.onIdle) M.tutorial.onIdle(); }
}

return {
  init, start, quit, concede, tick, layout, showScreen, cardEl, modal, closeModal, toast, inspect, esc, fmtText, typeLine, lvlStats, ICON,
  settings, D, M, refreshHUD, updateHL, humanCmd, isMyTurn, clearSel, speak, showBanner, exec,
  get screen() { return current; }
};
})();
/* END UI */
