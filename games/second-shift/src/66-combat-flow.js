/* =====================================================================
   66-combat-flow: HUD, input, turn loop, tutorial tips, battle end
   ===================================================================== */

function buildCombatDOM() {
  const root = $('#s-combat'); root.innerHTML = '';
  CB.cv = h('canvas.cb-cv'); CB.ctx = CB.cv.getContext('2d');
  const el = CB.el = {};
  el.round = h('div.cb-round', h('b', 'ROUND 1'), h('span', ''));
  el.tl = h('div.cb-tl');
  el.retreat = h('button.btn.small.ghost', { onclick: cbRetreat }, icon('eject', 14), 'Retreat');
  el.speed = h('button.ibtn.small', { title: 'Animation speed', onclick: () => { const o = [1, 1.5, 2]; Settings.combatSpeed = o[(o.indexOf(Settings.combatSpeed) + 1) % 3]; Settings.save(); el.speed.firstChild.textContent = Settings.combatSpeed + '×'; sfx('click'); } }, h('b', Settings.combatSpeed + '×'));
  el.help = h('button.ibtn.small', { title: 'How to play', onclick: () => openHelp('Battles') }, icon('help', 18));
  el.info = h('div.cb-info');
  el.tip = h('div.cb-tip');
  el.panel = h('div.cb-panel');
  el.banner = h('div#cb-banner.cb-banner'); el.cutin = h('div#cb-cutin.cb-cutin');
  el.turn = h('div.cb-turnlabel'); el.rotate = h('div.cb-rotate', icon('turn', 14), 'Rotate your phone for a bigger board');
  root.append(CB.cv, h('div.cb-top', h('div.cb-left', el.retreat, el.round), el.tl, h('div.cb-right', el.speed, el.help)), el.info, el.tip, el.panel, el.banner, el.cutin, el.turn, el.rotate);
  CB.cv.addEventListener('pointermove', cbPointerMove);
  CB.cv.addEventListener('pointerleave', () => { CB.hover = null; CB.prev = cbKeepPrev ? CB.prev : null; cbHoverUnit(null); });
  CB.cv.addEventListener('pointerdown', cbPointerDown);
  CB.cv.addEventListener('contextmenu', e => { e.preventDefault(); cbCancel(); });
}
let cbKeepPrev = false;

/* ---------- HUD refresh ---------- */
function cbRefreshTimeline(orderOverride) {
  const B = CB.B, order = orderOverride || timelineOrder(B, 9), tl = CB.el.tl;
  const old = new Map(); $$('.tli', tl).forEach(n => old.set(n.dataset.k, n.getBoundingClientRect().left));
  const seen = {}; tl.innerHTML = '';
  order.forEach((u, i) => {
    seen[u.uid] = (seen[u.uid] || 0) + 1; const k = u.uid + '#' + seen[u.uid];
    const n = h('div.tli.' + u.team + (i === 0 ? '.first' : '') + (CB.prev && orderOverride && CB.prevOrderMoved && CB.prevOrderMoved.has(u.uid) ? '.moved' : ''), { 'data-k': k, 'data-uid': u.uid, title: u.name + ' (' + Math.max(0, Math.round(u.hp)) + '/' + u.maxHp + ' HP)', onpointerenter: () => { CB.hoverUid = u.uid; cbHoverUnit(u); }, onpointerleave: () => { CB.hoverUid = null; cbHoverUnit(null); } },
      portraitImg(u.look, 44, 44, 'neutral', 'tl-img'), h('i.tl-hp', h('b', { style: { width: clamp(u.hp / u.maxHp, 0, 1) * 100 + '%' } })), u.st.frozen ? h('em.tl-fz', '❄') : null);
    tl.appendChild(n);
    if (old.has(k) && !prefersReducedMotion()) { const dx = old.get(k) - n.getBoundingClientRect().left; if (Math.abs(dx) > 1) { n.style.transform = 'translateX(' + dx + 'px)'; requestAnimationFrame(() => { n.style.transition = 'transform .35s cubic-bezier(.2,.9,.3,1)'; n.style.transform = ''; }); } }
  });
}
function cbHoverUnit(u) {
  const info = CB.el.info; info.innerHTML = ''; CB.threat = null;
  CB.overlayBase = CB.overlayBase || [];
  if (!u || !u.alive) { info.classList.remove('show'); cbRebuildOverlay(); return; }
  const B = CB.B, abil = u.kit.filter(a => !a.ult || u.team === 'hero');
  info.append(h('div.ci-head', portraitImg(u.look, 52, 52, 'neutral', 'ci-p'), h('div', h('b', u.name), h('span', u.team === 'hero' ? 'Hero' : (u.boss ? 'Boss' : 'Enemy')))),
    h('div.ci-hp', h('i', { style: { width: clamp(u.hp / u.maxHp, 0, 1) * 100 + '%' } }), h('span', Math.round(u.hp) + ' / ' + u.maxHp + (u.shield ? ' +' + u.shield : ''))),
    h('div.ci-stats', h('span', 'Move ', h('b', u.move)), h('span', 'Speed ', h('b', Math.round(u.speed))), u.armor ? h('span', 'Armor ', h('b', u.armor)) : null, u.team === 'hero' ? h('span', 'Hype ', h('b', Math.round(u.hype))) : null),
    h('div.ci-ab', abil.map(a => h('div', h('b', a.name), ' ', h('span', describeAbility(a))))));
  info.classList.add('show');
  if (u.team === 'foe' && CB.mode !== 'aim') { CB.threat = u; }
  cbRebuildOverlay();
}
function cbRefreshPanel() {
  const u = CB.cur, p = CB.el.panel; p.innerHTML = '';
  const hero = u && u.team === 'hero' && CB.mode !== 'enemy' && CB.mode !== 'over';
  p.classList.toggle('enemy', !hero); p.classList.toggle('busy', CB.mode === 'busy');
  CB.el.retreat.disabled = !hero || CB.mode === 'busy';
  if (!hero) {
    p.append(h('div.pn-enemy', u && u.team === 'foe' ? [h('div.pn-eh', 'ENEMY TURN'), h('b', u.name)] : [h('div.pn-eh', CB.mode === 'over' ? 'BATTLE OVER' : '…')]));
    return;
  }
  const B = CB.B;
  const unit = h('div.pn-unit', heroAvatar(u.id, 62), h('div.pn-id', h('b', u.name), h('div.pn-hp', h('i', { style: { width: clamp(u.hp / u.maxHp, 0, 1) * 100 + '%' } }), h('span', Math.round(u.hp) + '/' + u.maxHp)), h('div.pn-hype' + (u.hype >= 100 ? '.full' : ''), h('i', { style: { width: clamp(u.hype, 0, 100) + '%' } }), h('span', u.hype >= 100 ? 'ULTIMATE READY' : 'HYPE ' + Math.round(u.hype)))));
  const hasMove = CB.reach && CB.reach.dist.size > 1;
  const moveBtn = h('button.abtn.move' + (CB.mode === 'move' ? '.on' : ''), { disabled: CB.moved || CB.mode === 'busy' || (!CB.moved && !hasMove && CB.reach), onclick: () => cbSetMode('move'), title: 'Move up to ' + u.move + ' tiles (M)' }, h('kbd', 'M'), icon('boot', 20), h('b', 'Move'), h('small', u.move + ' tiles'));
  const abs = u.kit.map((ab, i) => {
    const cd = u.cd[ab.id] || 0, need = ab.ult && u.hype < 100, dis = CB.acted || CB.mode === 'busy' || cd > 0 || need;
    return h('button.abtn' + (ab.ult ? '.ult' : '') + (CB.aimAb === ab && CB.mode === 'aim' ? '.on' : ''), { disabled: dis, onclick: () => cbSelectAbility(ab), title: ab.name + ': ' + describeAbility(ab) + (ab.flavor ? '\n' + ab.flavor : '') },
      h('kbd', String(i + 1)), h('b', ab.name), h('small', ab.ult ? (u.hype >= 100 ? 'READY' : 'Hype ' + Math.round(u.hype) + '%') : describeAbility(ab).split(' · ').slice(0, 2).join(' · ')), cd > 0 ? h('em.cd', cd) : null);
  });
  const end = h('button.btn.primary.endturn', { disabled: CB.mode === 'busy', onclick: () => cbEndTurn(), title: 'End turn (E or Space)' }, 'End turn', h('kbd', 'E'));
  const radio = h('button.btn.small.radio', { disabled: B.radioUsed || CB.mode === 'busy', onclick: cbRadio, title: 'Once per battle: call HQ for support (R)' }, icon('radio', 14), B.radioUsed ? 'Radio used' : 'Radio (R)');
  p.append(unit, h('div.pn-abs', moveBtn, abs), h('div.pn-end', end, radio));
}
function cbUpdateRound() {
  const B = CB.B, r = roundOf(B); CB.el.round.firstChild.textContent = 'ROUND ' + r;
  CB.el.round.lastChild.textContent = ' · par ' + B.par;
  if (r !== CB.lastRound) { CB.lastRound = r; if (r > 1) cbBanner('ROUND ' + r, 700, 'small'); }
}

/* ---------- overlays / modes ---------- */
function cbRebuildOverlay() {
  const B = CB.B, ov = [];
  if (CB.cur && CB.mode !== 'over') ov.push({ x: CB.cur.x, y: CB.cur.y, k: 'cur' });
  if (CB.mode === 'move' && CB.reach) CB.reach.dist.forEach((d, k) => { if (d > 0) { const [x, y] = k.split(',').map(Number); ov.push({ x, y, k: 'move' }); } });
  if (CB.mode === 'aim' && CB.aim) CB.aim.tiles.forEach(t => { const ev = CB.aim.eval(t); ov.push({ x: t.x, y: t.y, k: ev.effective ? (CB.aimAb.side === 'ally' ? 'legalAlly' : 'legal') : 'range' }); });
  if (CB.threat && CB.threat.alive && CB.mode !== 'aim') { const u = CB.threat, maxR = Math.max(...u.kit.map(a => (a.r || 1) + ((a.tgt === 'tile') ? (a.ar || 0) : 0)), 1); for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) { const d = Math.abs(x - u.x) + Math.abs(y - u.y); if (d > 0 && d <= u.move + maxR && !(unitAt(B, x, y) && unitAt(B, x, y).team === 'foe')) ov.push({ x, y, k: 'threat' }); } }
  if (CB.telegraph) CB.telegraph.forEach(t => ov.push(t));
  CB.overlay = ov;
}
function cbSetMode(mode, ab) {
  const B = CB.B, u = CB.cur;
  CB.mode = mode; CB.aimAb = ab || null; CB.prev = null; CB.aim = null; CB.touchTile = null; cbKeepPrev = false;
  if (u && u.team === 'hero') {
    if (mode === 'move' || mode === 'aim') CB.reach = reachable(B, u);
    if (mode === 'aim') CB.aim = cbBuildAim(u, ab);
  }
  cbRebuildOverlay(); cbRefreshPanel(); cbRefreshTimeline();
  if (mode === 'aim' && (ab.tgt === 'self' || ab.tgt === 'none')) { cbPreviewAt({ x: u.x, y: u.y }); cbKeepPrev = true; }
}
function cbBuildAim(u, ab) {
  const B = CB.B, tiles = new Map(), cache = new Map();
  const add = (x, y) => { if (inB(x, y) && !(x === u.x && y === u.y)) tiles.set(tk(x, y), { x, y }); };
  const rng = (ab.r || 0) + (['tile', 'ally', 'empty', 'row'].includes(ab.tgt) ? (u.mods.rng || 0) : 0);
  switch (ab.tgt) {
    case 'adj': DIRS.forEach(([dx, dy]) => add(u.x + dx, u.y + dy)); break;
    case 'line': case 'cone': case 'dash': case 'charge': DIRS.forEach(([dx, dy]) => { for (let i = 1; i <= ab.r; i++) add(u.x + dx * i, u.y + dy * i); }); break;
    case 'tile': case 'empty': case 'ally': for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) { const d = Math.abs(x - u.x) + Math.abs(y - u.y); if (d > 0 && d <= rng) add(x, y); } if (ab.tgt === 'ally' && !ab.noSelf) tiles.set(tk(u.x, u.y), { x: u.x, y: u.y }); break;
    case 'row': for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) add(x, y); break;
    case 'self': case 'none': tiles.set(tk(u.x, u.y), { x: u.x, y: u.y }); break;
    default: break;
  }
  const evalT = t => {
    const k = tk(t.x, t.y); if (cache.has(k)) return cache.get(k);
    let r = { legal: false, effective: false };
    const legal = (ab.tgt === 'ally' && t.x === u.x && t.y === u.y && !ab.noSelf) ? true : isLegalTarget(B, u, ab, t);
    if (legal) {
      const C = cloneB(B), cu = C.units.find(q => q.uid === u.uid); const sum = useAbility(C, cu, ab, t, [], true);
      const foeHit = Object.keys(sum.dmg).some(id => { const v = unitById(B, +id); return v && v.team !== u.team; });
      const eff = ab.needFoe === false || foeHit || sum.heal > 0 || sum.buffs > 0 || sum.obs > 0 || (ab.side === 'ally' && sum.hits >= 0 && (ab.fx || []).length > 0) || (ab.move === 'swap');
      const sideCheck = ab.tgt === 'empty' || ab.tgt === 'ally' ? true : true;
      r = { legal: true, effective: !!(eff && sideCheck), sum, C };
    }
    cache.set(k, r); return r;
  };
  return { tiles, eval: evalT, cache };
}
function cbSelectAbility(ab) {
  const u = CB.cur; if (!u || CB.busy || CB.acted) return; if (!canUse(u, ab)) { sfx('error'); return; }
  if (CB.mode === 'aim' && CB.aimAb === ab && (ab.tgt === 'self' || ab.tgt === 'none')) { if (CB.aim && CB.aim.eval({ x: u.x, y: u.y }).effective) cbDoAbility(ab, { x: u.x, y: u.y }); else { sfx('error'); const p = cbCenter(u.x, u.y); cbText(p.x, p.y - 60, 'Nothing in range', '#ffb3b3', 16, { life: 0.8, max: 0.8 }); } return; }
  sfx('select'); cbSetMode('aim', ab);
  cbTip('aim', 'Red tiles can be targeted. Hover one to preview damage, knockback and the new turn order. Click to fire!');
}
function cbCancel() { if (CB.busy) return; if (CB.mode === 'aim') { sfx('back'); cbSetMode(CB.moved ? 'idle' : 'move'); } }

/* ---------- previews ---------- */
function cbPreviewAt(t) {
  const u = CB.cur, ab = CB.aimAb, B = CB.B; if (!ab) return;
  const ev = CB.aim.eval(t); if (!ev.effective) { CB.prev = null; cbRefreshTimeline(); return; }
  const fp = footprint(B, u, ab, t), C = ev.C, sum = ev.sum;
  const units = [];
  const uids = new Set(Object.keys(sum.dmg).map(Number));
  C.units.forEach(cu => { const b0 = unitById(B, cu.uid); if (b0 && cu.alive && cu.hp > b0.hp) uids.add(cu.uid); });
  uids.forEach(uid => {
    const b0 = unitById(B, uid), c1 = C.units.find(x => x.uid === uid); if (!b0 || !c1) return;
    const dmg = Math.round(sum.dmg[uid] || 0), heal = Math.max(0, c1.hp - b0.hp);
    units.push({ uid, dmg: dmg - (heal ? 0 : 0), heal: heal && !dmg ? Math.round(heal) : 0, kill: sum.kills.includes(uid), ally: b0.team === u.team && dmg > 0, to: sum.push[uid] && (sum.push[uid].x !== b0.x || sum.push[uid].y !== b0.y) ? sum.push[uid] : null, flank: (sum.flank || []).includes(uid) });
  });
  const mv = new Set(); C.units.forEach(cu => { const b0 = unitById(B, cu.uid); if (b0 && cu.alive && Math.abs(cu.nextAct - b0.nextAct) > 0.01) mv.add(cu.uid); });
  CB.prevOrderMoved = mv;
  CB.prev = { tiles: fp.tiles.filter(x => x.w !== 0), color: ab.side === 'ally' ? '#5ee08a' : '#ff6a6a', units, path: null };
  cbRefreshTimeline(timelineOrder(C, 9));
}
function cbMovePreview(t) {
  const u = CB.cur; if (!CB.reach || !CB.reach.dist.has(tk(t.x, t.y)) || (t.x === u.x && t.y === u.y)) { CB.prev = null; return; }
  const path = pathTo(CB.reach, u, t.x, t.y); CB.prev = { tiles: [], units: [], color: '#fff', path: [{ x: u.x, y: u.y }].concat(path) };
}

/* ---------- input ---------- */
function cbPointer(e) { const r = CB.cv.getBoundingClientRect(); return cbTileAt(e.clientX - r.left, e.clientY - r.top); }
function cbPointerMove(e) {
  const t = cbPointer(e); CB.hover = t;
  const u = t ? unitAt(CB.B, t.x, t.y) : null;
  if (u !== CB.hoverU) { CB.hoverU = u; if (!CB.hoverUid) cbHoverUnit(u); }
  if (CB.busy || !t) return;
  if (CB.mode === 'move') cbMovePreview(t);
  else if (CB.mode === 'aim' && CB.aim && !(CB.aimAb.tgt === 'self' || CB.aimAb.tgt === 'none')) { if (CB.aim.tiles.has(tk(t.x, t.y))) cbPreviewAt(t); else { CB.prev = null; cbRefreshTimelineSoon(); } }
}
let _tlSoon = 0;
function cbRefreshTimelineSoon() { if (_tlSoon) return; _tlSoon = setTimeout(() => { _tlSoon = 0; cbRefreshTimeline(); }, 60); }
function cbPointerDown(e) {
  if (e.button === 2) return;
  const t = cbPointer(e); if (!t || CB.busy) return; Snd.unlock();
  const u = CB.cur; if (!u || u.team !== 'hero') return;
  if (e.pointerType === 'touch' && !(CB.touchTile && CB.touchTile.x === t.x && CB.touchTile.y === t.y)) { CB.touchTile = t; CB.hover = t; if (CB.mode === 'move') cbMovePreview(t); else if (CB.mode === 'aim' && CB.aim) { if (CB.aim.tiles.has(tk(t.x, t.y))) cbPreviewAt(t); } return; }
  if (CB.mode === 'move') { if (CB.reach && CB.reach.dist.has(tk(t.x, t.y)) && !(t.x === u.x && t.y === u.y)) cbDoMove(t); else sfx('error'); }
  else if (CB.mode === 'aim' && CB.aim) {
    const ab = CB.aimAb;
    if (!CB.aim.tiles.has(tk(t.x, t.y))) { sfx('error'); return; }
    const ev = CB.aim.eval(t);
    if (ev.effective) cbDoAbility(ab, t); else { sfx('error'); const p = cbCenter(t.x, t.y); cbText(p.x, p.y - 10, ev.legal ? 'No effect' : 'Out of range', '#ffb3b3', 16, { life: 0.7, max: 0.7 }); }
  }
}
function cbKey(e) {
  if (G.mode !== 'combat' || !CB.B || G.modals > 0) return false;
  const k = e.key.toLowerCase(), u = CB.cur;
  if (k === 'escape') { cbCancel(); return true; }
  if (!u || u.team !== 'hero' || CB.busy) return false;
  if (k >= '1' && k <= '4') { const ab = u.kit[+k - 1]; if (ab) cbSelectAbility(ab); return true; }
  if (k === 'm') { if (!CB.moved) { sfx('select'); cbSetMode('move'); } return true; }
  if (k === 'e' || k === ' ') { cbEndTurn(); return true; }
  if (k === 'enter') { const ab = CB.aimAb; if (CB.mode === 'aim' && ab && (ab.tgt === 'self' || ab.tgt === 'none')) cbSelectAbility(ab); else cbEndTurn(); return true; }
  if (k === 'r') { cbRadio(); return true; }
  return false;
}

/* ---------- actions ---------- */
async function cbDoMove(t) {
  const B = CB.B, u = CB.cur; if (CB.busy) return;
  const path = pathTo(CB.reach, u, t.x, t.y); if (!path.length) return;
  CB.busy = true; CB.prev = null; CB.overlay = CB.overlay.filter(o => o.k === 'cur'); cbSetBusy();
  const ev = []; moveUnitLogic(B, u, path, ev); await cbPlay(ev);
  CB.moved = true; CB.busy = false;
  if (checkOver(B)) return cbEndTurn(true);
  if (!u.alive) return cbEndTurn(true);
  cbTip('moved', 'Now pick an attack below (or press 1–4). Standing opposite an ally of the target gives a FLANK bonus.');
  cbAfterAction();
}
async function cbDoAbility(ab, t) {
  const B = CB.B, u = CB.cur; if (CB.busy || CB.acted) return;
  CB.busy = true; CB.prev = null; CB.aim = null; CB.overlay = []; cbSetBusy();
  const ev = []; useAbility(B, u, ab, t, ev, false);
  cbRefreshTimeline();
  await cbPlay(ev);
  CB.acted = true; CB.busy = false; CB.aimAb = null;
  cbTip('acted', 'Enemies shoved into other units or obstacles take SLAM damage. Barrels explode! The timeline up top shows who acts next.');
  if (checkOver(B) || !u.alive) return cbEndTurn(true);
  cbAfterAction();
}
function cbSetBusy() { CB.mode = 'busy'; cbRebuildOverlay(); cbRefreshPanel(); }
function cbAfterAction() {
  const u = CB.cur, B = CB.B;
  const reach = reachable(B, u); const canMove = !CB.moved && reach.dist.size > 1;
  CB.reach = reach;
  if (CB.moved && CB.acted) { cbSetMode('idle'); setTimeout(() => cbEndTurn(true), cbMs(380)); return; }
  if (CB.acted && !canMove) { cbSetMode('idle'); setTimeout(() => cbEndTurn(true), cbMs(450)); return; }
  if (!CB.acted) { const basic = u.kit[0]; cbSetMode('aim', basic); } else cbSetMode(canMove ? 'move' : 'idle');
}
function cbEndTurn(force) {
  if (CB.busy && !force) return; const r = CB.endResolve; if (!r) return;
  CB.endResolve = null; CB.overlay = []; CB.prev = null; CB.aim = null; CB.mode = 'idle';
  r();
}
async function cbRadio() {
  const B = CB.B; if (B.radioUsed || CB.busy || !CB.cur || CB.cur.team !== 'hero') return;
  const pick = await new Promise(res => {
    const m = openModal(h('div.radio-pick', h('h3', 'Radio HQ'), h('p.muted', 'One call per battle. Does not use your turn.'),
      h('button.btn.big', { onclick: () => m.close('medevac') }, h('b', 'Medevac'), h('small', 'Heal the most wounded hero for 45%')),
      h('button.btn.big', { onclick: () => m.close('pep') }, h('b', 'Pep talk'), h('small', 'Every hero gains 35 Hype')),
      h('button.btn.big', { onclick: () => m.close('block') }, h('b', 'Roadblock'), h('small', 'Every enemy loses time. Their turns come later')),
      h('div.btnrow', h('button.btn.ghost', { onclick: () => m.close(null) }, 'Cancel'))), { cls: 'small', pause: false, onClose: v => res(v) });
  });
  if (!pick) return;
  const heroes = B.units.filter(u => u.alive && u.team === 'hero').sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  CB.busy = true; cbSetBusy();
  const ev = []; radioSupport(B, pick, heroes[0] ? heroes[0].uid : null, ev); await cbPlay(ev);
  CB.busy = false; cbRefreshTimeline(); cbSetMode(CB.acted ? (CB.moved ? 'idle' : 'move') : (CB.moved ? 'idle' : 'move'));
}
async function cbRetreat() {
  if (CB.busy || !CB.cur || CB.cur.team !== 'hero') return;
  const ok = await confirmBox('Retreat?', 'The call is lost and downed heroes are injured. Heroes who are still standing walk away unhurt.', 'Retreat', 'Keep fighting');
  if (!ok || !CB.B || CB.B.over) return;
  CB.retreat = true; CB.B.over = true; CB.B.result = 'loss'; cbEndTurn(true);
}

/* ---------- tips (first battle only) ---------- */
function cbTip(key, text) {
  if (!CB.tutorial || G.save.flags['tip_' + key]) return;
  G.save.flags['tip_' + key] = 1;
  const t = CB.el.tip; t.innerHTML = ''; t.append(npcPortrait('marlowe', 40, 40, 'smug'), h('p', text)); t.classList.add('show');
  clearTimeout(cbTip.t); cbTip.t = setTimeout(() => t.classList.remove('show'), 9000);
}

/* ---------- enemy turn ---------- */
async function cbEnemyTurn(u) {
  const B = CB.B; CB.mode = 'enemy'; CB.cur = u; cbRefreshPanel(); cbRebuildOverlay();
  CB.el.turn.textContent = u.name; CB.el.turn.className = 'cb-turnlabel show foe'; setTimeout(() => CB.el.turn.classList.remove('show'), cbMs(900));
  await cbWait(380);
  let plan = aiChoose(B, u);
  if (plan && plan.ab) {
    const C = cloneB(B), cu = C.units.find(q => q.uid === u.uid); cu.x = plan.x; cu.y = plan.y;
    const fp = footprint(C, cu, plan.ab, plan.tgt);
    CB.telegraph = plan.path.map(p => ({ x: p.x, y: p.y, k: 'path' })).concat(fp.tiles.filter(t => t.w !== 0).map(t => ({ x: t.x, y: t.y, k: 'tele' })));
    cbRebuildOverlay(); await cbWait(plan.path.length ? 520 : 460);
    CB.telegraph = null; cbRebuildOverlay();
    const ev = []; moveUnitLogic(B, u, plan.path, ev); useAbility(B, u, plan.ab, plan.tgt, ev, false);
    await cbPlay(ev);
  } else {
    const adv = aiAdvance(B, u);
    if (adv) { CB.telegraph = adv.path.map(p => ({ x: p.x, y: p.y, k: 'path' })); cbRebuildOverlay(); await cbWait(300); CB.telegraph = null; const ev = []; moveUnitLogic(B, u, adv.path, ev); await cbPlay(ev); }
    else await cbWait(250);
  }
  CB.telegraph = null; cbRebuildOverlay();
  await cbWait(220);
}
async function cbPlayerTurn(u) {
  const B = CB.B;
  return new Promise(resolve => {
    CB.endResolve = resolve; CB.cur = u; CB.moved = false; CB.acted = false; CB.busy = false; CB.hoverU = null;
    CB.el.turn.textContent = u.name + "'s turn"; CB.el.turn.className = 'cb-turnlabel show hero'; setTimeout(() => CB.el.turn.classList.remove('show'), cbMs(900));
    sfx('turn'); cbSetMode('move');
    cbTip('turn', "Your turn! Blue tiles show where you can move. Click one, then choose an attack below. You can also attack first.");
    if (u.hype >= 100) cbTip('ult', 'ULTIMATE ready! Press 4 to unleash it. Dealing and taking damage fills Hype.');
  });
}

/* ---------- main loop ---------- */
async function cbRun() {
  const B = CB.B; CB.lastRound = 0;
  try {
    while (!B.over) {
      const u = nextUnit(B); if (!u) break;
      const ev = []; const st = beginTurn(B, u, ev); CB.cur = u; cbUpdateRound(); cbRefreshTimeline();
      if (ev.length) await cbPlay(ev);
      if (checkOver(B)) break;
      if (st === 'dead') continue;
      if (st === 'ok') { if (u.team === 'hero') await cbPlayerTurn(u); else await cbEnemyTurn(u); }
      if (B.over) break;
      endTurn(B, u); CB.cur = null;
      if (checkOver(B)) break;
    }
  } catch (err) { console.error('[battle]', err); }
  await cbFinish();
}

/* ---------- finish ---------- */
async function cbFinish() {
  const B = CB.B, retreat = !!CB.retreat; const sum = battleSummary(B, retreat);
  CB.mode = 'over'; CB.overlay = []; CB.prev = null; CB.cur = null; CB.telegraph = null; cbRefreshPanel(); cbRefreshTimeline(); CB.el.info.classList.remove('show');
  if (sum.win) { cbBanner('VICTORY!', 1800, 'win'); sfx('victory'); B.units.filter(u => u.alive && u.team === 'hero').forEach(u => { u.vis.pose = 'cheer'; }); confettiBurst(); }
  else { cbBanner(retreat ? 'RETREAT' : 'DEFEAT', 1800, 'lose'); sfx('defeat'); }
  await sleep(1700);
  const tutLoss = !sum.win && !retreat && CB.tutorial && !G.save.flags.tutBattleDone;
  if (sum.win) G.save.flags.tutBattleDone = 1;
  const O = OUTCOME[sum.outcome];
  const again = await new Promise(res => {
    const m = openModal(h('div.battle-end.r-' + sum.rank, { style: { '--c': O.color } },
      h('div.be-rank', sum.rank), h('h3', sum.win ? 'Battle won' : (retreat ? 'You pulled out' : 'The team went down')),
      h('div.be-stats', h('div', h('span', 'Rounds'), h('b', sum.rounds + ' / par ' + sum.par)), h('div', h('span', 'Heroes down'), h('b', sum.kos)), h('div', h('span', 'Slams'), h('b', sum.slams)), h('div', h('span', 'Damage'), h('b', Math.round(sum.dmg)))),
      h('p.be-note', sum.win ? (sum.rank === 'S' ? 'Perfect: nobody down, and under par. That is a Flawless result.' : sum.rank === 'A' ? 'Clean win. Beat par for a Flawless result next time.' : sum.rank === 'B' ? 'A win, but someone went down.' : 'A close one. Most of the team went down.') : (tutLoss ? "Training rules: no penalty this time. Try again?" : 'The call is lost. Downed heroes are injured.')),
      h('div.btnrow', tutLoss ? h('button.btn.ghost', { onclick: () => m.close('leave') }, 'Leave') : null, h('button.btn.primary.big', { 'data-autofocus': '1', onclick: () => m.close(tutLoss ? 'again' : 'leave') }, tutLoss ? 'Try again' : 'Continue'))), { cls: 'small', pause: false, dismiss: false, onClose: v => res(v) });
  });
  if (again === 'again') { return cbBegin(CB.call, CB.ids, true); }
  cbExit(sum);
}
function cbExit(sum) {
  cancelAnimationFrame(CB.raf); CB.raf = 0;
  const call = CB.call, B = CB.B;
  show('hub'); startHubLoop(); if (Hub.built) { Hub.ro && Hub.ro.disconnect(); Hub.ro && Hub.ro.observe(Hub.el.mapWrap); setTimeout(paintMap, 20); }
  const res = finishMission(call, sum.outcome, { ko: sum.koIds, returning: call.trip, cmd: { rounds: sum.rounds, kos: sum.kos, rank: sum.rank } });
  Bus.emit('battle:end', sum);
  renderAll();
  CB.B = null;
}

/* ---------- begin ---------- */
async function cbBegin(call, ids, retry) {
  show('combat'); buildCombatDOM(); CB.call = call; CB.ids = ids.slice(); CB.retreat = false;
  CB.tutorial = !G.save.flags.tutBattleDone;
  CB.B = newBattle(call, ids); cbInitVis(); CB.mode = 'busy'; CB.cur = null; CB.overlay = []; CB.prev = null; CB.telegraph = null; CB.hoverU = null;
  CB.lastRound = 0;
  cbLayout(); cbRefreshPanel(); cbRefreshTimeline();
  cancelAnimationFrame(CB.raf); CB.last = 0; CB.raf = requestAnimationFrame(cbFrame);
  // intro: units drop in
  CB.B.units.forEach((u, i) => { u.vis.alpha = 0; u.vis.lift = 1.4; cbTween(380, k => { const kk = ease.out(k); u.vis.alpha = Math.min(1, k * 3); u.vis.lift = 1.4 * (1 - kk); }); });
  sfx('whoosh');
  cbBanner(call.fight && ENCOUNTERS[call.fight].name.toUpperCase(), 1500, 'intro');
  await cbWait(1500); cbSyncVis();
  cbRun();
}
function startCommand(call, ids) { cbBegin(call, ids, false); }
window.addEventListener('resize', () => { if (G.mode === 'combat' && CB.cv) { cbLayout(); } });
