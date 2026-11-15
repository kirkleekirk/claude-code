/* =====================================================================
   70-flow: title, briefing, report, HQ, keyboard, boot
   ===================================================================== */

/* ---------- TITLE ---------- */
const Title = { raf: 0, mx: 0.5, bg: null, bgKey: '', t: 0, last: 0 };
function buildTitle() {
  const root = $('#s-title'); root.innerHTML = '';
  const save = loadSave();
  const cv = h('canvas.t-cv'); Title.cv = cv;
  const menu = h('div.t-menu',
    save ? h('button.btn.primary.big.t-btn', { onclick: continueGame, 'data-autofocus': '1' }, h('b', 'Continue'), h('small', save.name + ' · ' + (save.shiftNo > SHIFTS.length ? 'Overtime ' + (save.shiftNo - SHIFTS.length) : 'Shift ' + save.shiftNo) + ' · ' + fmtMoney(save.funds))) : null,
    h('button.btn.big.t-btn' + (save ? '' : '.primary'), { onclick: newGame }, h('b', 'New game'), h('small', save ? 'Starts over' : 'Clock in for your first shift')),
    h('div.t-row', h('button.btn.small', { onclick: () => openHelp() }, icon('help', 16), 'How to play'), h('button.btn.small', { onclick: () => openSettings({ noReset: !save }) }, icon('gear', 16), 'Settings')));
  root.append(cv,
    h('div.t-ui', h('div.logo', h('span.l1', 'SECOND'), h('span.l2', 'SHIFT')), h('div.t-tag', 'A HERO DISPATCH GAME'),
      h('p.t-pitch', 'Read the call. Pick the team. Send them out. Then run the fights yourself.'), menu),
    h('div.t-foot', 'Synthesized audio · no assets · best with sound on'));
  root.onpointermove = e => { Title.mx = e.clientX / window.innerWidth; };
  setTimeout(() => { const f = root.querySelector('[data-autofocus]') || root.querySelector('button'); f && f.focus({ preventScroll: true }); }, 50);
}
function titleFrame(ts) {
  Title.raf = requestAnimationFrame(titleFrame);
  if (G.mode !== 'title') return;
  const cv = Title.cv; if (!cv || !cv.isConnected) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); Title.bg = null; }
  const dt = Math.min(0.05, (ts - (Title.last || ts)) / 1000); Title.last = ts; Title.t += dt;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!Title.bg) { const b = document.createElement('canvas'); b.width = cv.width; b.height = cv.height; const g = b.getContext('2d'); g.scale(dpr, dpr); paintScene(g, r.width, r.height, r.height * 0.6, 'roof', 11); Title.bg = b; }
  c.drawImage(Title.bg, 0, 0, r.width, r.height);
  const W = r.width, H = r.height, n = W < 700 ? 5 : 9, s = Math.min(H * 0.4, W / (n * 0.66));
  const order = ['bulwark', 'cinder', 'anvil', 'skylark', 'velvet', 'fuse', 'slush', 'boomer', 'hush'];
  const ids = W < 700 ? ['anvil', 'skylark', 'velvet', 'fuse', 'cinder'] : order;
  ids.forEach((id, i) => {
    const k = ids.length === 1 ? 0.5 : i / (ids.length - 1), x = W * (0.08 + k * 0.84) + (Title.mx - 0.5) * 18 * (1 - Math.abs(k - 0.5)), y = H * (0.96 - 0.015 * Math.sin(k * Math.PI));
    const mid = Math.abs(k - 0.5), sc = s * (1.0 - mid * 0.22);
    drawFigure(c, HEROES[id].look, { x, y: y + (1 - (1 - mid)) * 6, s: sc, face: k < 0.5 ? 1 : -1, t: Title.t * 0.9 + i * 1.3, pose: 'idle', expr: i % 2 ? 'grin' : 'neutral' });
  });
  const vg = c.createLinearGradient(0, H * 0.45, 0, H); vg.addColorStop(0, 'rgba(6,8,22,0)'); vg.addColorStop(1, 'rgba(6,8,22,.55)'); c.fillStyle = vg; c.fillRect(0, H * 0.45, W, H * 0.55);
}
function startTitle() { stopHubLoop(); show('title'); buildTitle(); cancelAnimationFrame(Title.raf); Title.raf = requestAnimationFrame(titleFrame); }

/* ---------- new / continue ---------- */
function askName() {
  return new Promise(res => {
    const inp = h('input#name-in', { type: 'text', maxlength: '14', value: Store.get('lastName', 'Dispatcher'), autocomplete: 'off', 'aria-label': 'Your callsign', 'data-autofocus': '1' });
    const go = () => { const v = inp.value.trim() || 'Dispatcher'; Store.set('lastName', v); m.close(v); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const m = openModal(h('div.askname', h('h2', 'Your callsign'), h('p.muted', 'This is how the team will address you over the radio.'), inp, h('div.btnrow', h('button.btn.ghost', { onclick: () => m.close(null) }, 'Back'), h('button.btn.primary.big', { onclick: go }, 'Clock in'))), { cls: 'small', pause: false, onClose: v => res(v) });
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  });
}
async function newGame() {
  const existing = loadSave();
  if (existing && !(await confirmBox('Start a new game?', 'Your current save will be replaced.', 'Start new', 'Cancel'))) return;
  const name = await askName(); if (!name) return;
  G.save = newSave(name); writeSave();
  beginShiftFlow(1);
}
function continueGame() {
  const s = loadSave(); if (!s) return newGame();
  G.save = s;
  if (s.totals.shifts === 0 && s.shiftNo === 1) beginShiftFlow(1); else showHQ();
}

/* ---------- briefing + shift start ---------- */
function showBriefing(sh) {
  return new Promise(res => {
    const def = sh.def, objs = shiftObjectives(sh), fights = sh.sched.filter(e => CALLS[e.tpl] && CALLS[e.tpl].fight).length;
    const endT = fmtClock(def.len);
    const m = openModal(h('div.brief', h('div.bf-no', h('small', 'SHIFT'), h('b', String(def.no))), h('h2', def.name), h('p.bf-tag', def.tag),
      h('div.bf-facts', h('div', icon('clock', 16), h('span', '9:00 AM – ' + endT)), h('div', icon('radio', 16), h('span', sh.total + ' calls expected')), fights ? h('div', icon('fight', 16), h('span', fights + (fights === 1 ? ' fight' : ' fights'))) : null),
      h('h4', 'Goals (earn up to 3 stars)'), h('ul.bf-goals', objs.map(o => h('li', icon('star', 14), o.text))),
      h('h4', 'On duty'), h('div.bf-team', owned().map(id => h('div.bf-h', heroAvatar(id, 46), h('span', HEROES[id].name)))),
      def.heat ? h('p.bf-warn', 'Heat wave: injuries take 50% longer to heal.') : null, def.rival ? h('p.bf-warn', 'Apex is circling. Missed calls go to them.') : null,
      h('div.btnrow', h('button.btn.primary.big', { 'data-autofocus': '1', onclick: () => m.close() }, 'Clock in'))), { cls: 'small', pause: true, dismiss: false, onClose: () => res() });
  });
}
async function beginShiftFlow(no) {
  const def = shiftDef(no);
  if (def.intro && !G.save.flags['intro' + no]) { G.save.flags['intro' + no] = 1; writeSave(); await playScene(def.intro, { title: 'SHIFT ' + no + ' · ' + def.name.toUpperCase() }); }
  startShift(no); buildHub(); show('hub'); renderAll(); renderFeed(); startHubLoop();
  setSpeed(1); Hub.coachIdx = 0; Hub.tutHold = false; coachHide();
  await showBriefing(G.sh);
  sfx('radio');
}

/* ---------- shift report ---------- */
Bus.on('shift:end', sh => {
  if (G.mode !== 'hub') return;
  stopHubLoop(); toast('Shift complete!', 'new'); sfx('great');
  setTimeout(() => showReport(sh), 900);
});
function showReport(sh) {
  const root = $('#s-report'); root.innerHTML = ''; show('report');
  const rp = sh.report, def = sh.def;
  const xpRows = Object.keys(sh.earnedXp).map(id => { const x = xpInfo(id); return h('div.rp-hero', heroAvatar(id, 44), h('div', h('b', HEROES[id].name), h('div.bar', h('i', { style: { width: x.frac * 100 + '%' } }))), h('span', '+' + sh.earnedXp[id] + ' XP'), hsave(id).pts > 0 ? h('em.pill.amber', hsave(id).pts + ' pts to spend') : null); });
  const callsMoney = sh.earnedFunds - rp.bonus;
  const card = h('div.rp', h('div.rp-head', h('small', 'SHIFT ' + def.no + ' COMPLETE'), h('h1', def.name)),
    h('div.rp-grid',
      h('div.rp-grade.g-' + rp.grade, h('div.gr', rp.grade), h('small', 'SHIFT GRADE')),
      h('div.rp-tally', [['flawless', 'Flawless'], ['success', 'Success'], ['scrape', 'Close call'], ['fail', 'Failed'], ['missed', 'Missed']].map(([k, lb]) => h('div.tl-' + k, h('b', sh.tally[k]), h('span', lb)))),
      h('div.rp-obj', h('h4', 'Goals'), rp.objs.map(o => h('div.ob' + (o.done ? '.done' : ''), icon(o.done ? 'star' : 'starO', 18), h('span', o.text), h('em', o.prog)))),
      h('div.rp-pay', h('h4', 'Earnings'), h('div', h('span', 'Calls'), h('b', fmtMoney(callsMoney))), h('div', h('span', 'Grade bonus'), h('b', fmtMoney(rp.gradeBonus))), h('div', h('span', 'Goal stars'), h('b', fmtMoney(rp.starBonus))), h('div.tot', h('span', 'Total'), h('b', fmtMoney(sh.earnedFunds))), h('div.bank', h('span', 'Funds on hand'), h('b', fmtMoney(G.save.funds))))),
    h('div.rp-xp', h('h4', 'Team XP'), xpRows.length ? xpRows : h('p.muted', 'Nobody went out this shift.')),
    sh.no === 1 ? h('div.rp-new', icon('users', 18), h('b', 'New hero: Velvet joins your team!')) : null,
    h('div.btnrow', h('button.btn.ghost', { onclick: retry }, icon('turn', 16), 'Retry shift'), h('button.btn.primary.big', { 'data-autofocus': '1', onclick: cont }, 'Continue')));
  root.appendChild(card);
  setTimeout(() => { sfx('stamp'); const f = root.querySelector('[data-autofocus]'); f && f.focus(); if (rp.grade === 'S' || rp.grade === 'A') confettiBurst(); }, 350);
  async function retry() {
    if (!(await confirmBox('Retry this shift?', 'You will lose everything you earned in it (funds, XP and level-ups) and start the shift fresh.', 'Retry', 'Cancel'))) return;
    retryShift(); beginShiftFlow(def.no);
  }
  async function cont() {
    if (def.outro) await playScene(def.outro);
    if (def.finale && !G.save.flags.endingSeen) { G.save.flags.endingSeen = 1; writeSave(); await showEnding(); }
    showHQ();
  }
}
function showEnding() {
  return new Promise(res => {
    const t = G.save.totals;
    const m = openModal(h('div.ending', h('h1', 'THE LIGHTS ARE ON'), h('p', 'The Static Prince is in custody. Apex Guardians withdrew its bid. Meridian Hero Dispatch keeps the city contract, one very tired dispatcher, and a team that would rather be nowhere else.'),
      h('div.ed-stats', h('div', h('b', t.calls), h('span', 'Calls handled')), h('div', h('b', t.flawless), h('span', 'Flawless')), h('div', h('b', t.missed), h('span', 'Missed')), h('div', h('b', owned().length), h('span', 'Heroes'))),
      h('p.muted', 'Overtime mode is open: endless shifts, tougher calls, same crew.'),
      h('div.btnrow', h('button.btn.primary.big', { 'data-autofocus': '1', onclick: () => m.close() }, 'On to Overtime'))), { cls: 'wide', dismiss: false, pause: false, onClose: () => res() });
    sfx('victory'); confettiBurst();
  });
}

/* ---------- HQ ---------- */
const HQ = { tab: 'team', sel: null };
function showHQ(tab) {
  stopHubLoop(); show('hq');
  const root = $('#s-hq'); root.innerHTML = '';
  const no = G.save.shiftNo, def = shiftDef(no);
  if (tab) HQ.tab = tab;
  const owned0 = owned();
  if (!HQ.sel || !hsave(HQ.sel).own) HQ.sel = owned0.slice().sort((a, b) => hsave(b).pts - hsave(a).pts)[0] || owned0[0];
  const ptsTotal = owned0.reduce((a, id) => a + hsave(id).pts, 0);
  const afford = recruitable().some(id => G.save.funds >= HEROES[id].join.price), facAfford = Object.keys(FACILITIES).some(k => { const c = facCost(k); return c != null && G.save.funds >= c; });
  const funds = h('div.hud-funds', icon('coin', 18), h('b', fmtMoney(G.save.funds)));
  const prog = h('div.hq-prog', Array.from({ length: SHIFTS.length }, (_, i) => { const d = G.save.done[i + 1]; return h('div.pg' + (d ? '.done' : '') + (i + 1 === no ? '.cur' : ''), { title: 'Shift ' + (i + 1) + (d ? ' · grade ' + d.grade : '') }, h('b', String(i + 1)), d ? h('span', d.grade) : null); }), no > SHIFTS.length ? h('div.pg.cur.ot', 'OT') : null);
  const body = h('div.hq-body');
  const tabs = h('div.hq-tabs', [['team', 'users', 'Team', ptsTotal], ['personnel', 'users', 'Personnel', afford ? '!' : 0], ['facilities', 'gear', 'Facilities', facAfford ? '!' : 0]].map(([k, ic, lb, bd]) => h('button' + (HQ.tab === k ? '.on' : ''), { onclick: () => { HQ.tab = k; sfx('click'); showHQ(); } }, icon(ic, 18), lb, bd ? h('em.badge', String(bd)) : null)));
  root.append(h('header.hq-top', h('div.hq-title', h('small', 'MERIDIAN HERO DISPATCH'), h('h1', 'HQ')), funds, h('div.hq-actions', h('button.ibtn', { 'aria-label': 'Help', onclick: () => openHelp() }, icon('help', 20)), h('button.ibtn', { 'aria-label': 'Settings', onclick: () => openSettings({ noReset: false }) }, icon('gear', 20)), h('button.ibtn', { 'aria-label': 'Title screen', title: 'Title screen', onclick: () => startTitle() }, icon('menu', 20)))),
    h('div.hq-next', h('div.hqn-l', h('small', no > SHIFTS.length ? 'OVERTIME' : 'NEXT SHIFT'), h('h2', (no <= SHIFTS.length ? 'Shift ' + no + ' · ' : '') + def.name), h('p', def.tag), prog), h('button.btn.primary.big.hq-go', { 'data-autofocus': '1', onclick: () => beginShiftFlow(no) }, 'Start shift', icon('arrow', 20))),
    tabs, body);
  const redraw = () => showHQ();
  if (HQ.tab === 'team') {
    const list = h('div.hq-list', owned0.map(id => h('button.hq-hero' + (HQ.sel === id ? '.sel' : ''), { onclick: () => { HQ.sel = id; sfx('select'); showHQ(); } }, heroAvatar(id, 56), h('div', h('b', HEROES[id].name), h('span', 'Lv ' + hsave(id).lv + ' · ' + HEROES[id].role)), hsave(id).pts > 0 ? h('em.badge', String(hsave(id).pts)) : null)));
    body.append(list, h('div.hq-sheet', heroSheet(HQ.sel, { upgrade: true, onChange: () => { const b = $('.hq-top .hud-funds b'); if (b) b.textContent = fmtMoney(G.save.funds); $$('.hq-hero', list).forEach((n, i) => { const id = owned0[i]; const e = n.querySelector('.badge'); const p = hsave(id).pts; if (e) { if (p > 0) e.textContent = p; else e.remove(); } else if (p > 0) n.appendChild(h('em.badge', String(p))); }); } })));
  } else if (HQ.tab === 'personnel') {
    const cards = HERO_ORDER.filter(id => !hsave(id).own).map(id => {
      const H = HEROES[id], avail = G.save.shiftNo > H.join.shift, can = avail && G.save.funds >= H.join.price;
      return h('div.rec' + (avail ? '' : '.locked'), h('div.rec-pic', portraitImg(H.look, 150, 180, 'grin')), h('div.rec-b', h('h3', H.name), h('div.real', H.role + ' · ' + H.real), h('div.chips', H.tags.map(t => tagChip(t, true))),
        h('div.rec-stats', STATS.map(s => h('span', { style: { '--c': STAT[s].color } }, statIcon(s, 14), String(H.stats[s])))), h('p.rec-bio', H.quote),
        h('div.btnrow', h('button.btn.small', { onclick: () => openRecruitSheet(id) }, 'Details'), avail ? h('button.btn.primary', { disabled: !can, onclick: () => { if (hire(id)) { toast(H.name + ' joins the team!', 'new'); confettiBurst(); HQ.sel = id; HQ.tab = 'team'; showHQ(); } } }, can ? 'Hire · ' + fmtMoney(H.join.price) : 'Need ' + fmtMoney(H.join.price)) : h('span.lock-note', icon('lock', 14), 'Available after shift ' + H.join.shift))));
    });
    body.append(h('div.rec-grid', cards.length ? cards : h('div.empty', h('b', 'Everyone is on the team.'), h('span', 'Nobody left to hire.'))));
  } else {
    const cards = Object.keys(FACILITIES).map(k => {
      const F = FACILITIES[k], lv = G.save.fac[k], cost = facCost(k);
      return h('div.fac', h('div.fac-ic', icon(F.icon, 26)), h('div.fac-b', h('h3', F.name), h('p', F.desc), h('div.fac-lv', [1, 2, 3].map(i => h('i' + (i <= lv ? '.on' : '')))), h('div.fac-cur', lv ? 'Now: ' + F.lv[lv - 1][1] : 'Not built'), lv < 3 ? h('div.fac-next', 'Next: ' + F.lv[lv][1]) : h('div.fac-next', 'Fully upgraded')),
        lv < 3 ? h('button.btn' + (G.save.funds >= cost ? '.primary' : ''), { disabled: G.save.funds < cost, onclick: () => { if (buyFac(k)) { toast(F.name + ' upgraded!', 'new'); showHQ(); } } }, fmtMoney(cost)) : h('span.maxed', 'MAX'));
    });
    body.append(h('div.fac-grid', cards));
  }
  const f = root.querySelector('.hq-go'); f && setTimeout(() => f.focus({ preventScroll: true }), 40);
}
function openRecruitSheet(id) {
  const sheet = heroSheet(id, {});
  openModal(h('div.sheet-wrap', h('button.x', { 'aria-label': 'Close', onclick: () => topModal().close() }, icon('x', 18)), sheet), { cls: 'wide', pause: false });
}
/* a hero that is not owned yet needs a save slot for sheet rendering */

/* ---------- global keyboard ---------- */
function hubKey(e) {
  if (G.mode !== 'hub' || !G.sh || G.modals > 0 || modalStack.length) return false;
  const sh = G.sh, k = e.key;
  if (k === ' ') { setSpeed(sh.speed === 0 ? (sh.userSpeed || 1) : 0); return true; }
  if (k === '1') { setSpeed(1); return true; } if (k === '2') { setSpeed(2); return true; } if (k === '3') { setSpeed(4); return true; }
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    const open = openCalls().sort((a, b) => a.deadline - b.deadline); if (!open.length) return true;
    let i = open.findIndex(c => c.id === sh.selected); i = k === 'ArrowDown' ? (i + 1) % open.length : (i <= 0 ? open.length - 1 : i - 1);
    sh.selected = null; selectCall(open[i].id); return true;
  }
  if (k === 'Enter') { const b = $('.cp-actions .btn.primary:not([disabled])') || $('.cp-actions .btn:not([disabled])'); if (b) { b.click(); return true; } return false; }
  if (k === 'Escape') { if (sh.selected != null) selectCall(sh.selected); return true; }
  return false;
}
window.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape' && modalStack.length) { if (closeTopModal()) e.preventDefault(); return; }
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (G.mode === 'hub' && hubKey(e)) { e.preventDefault(); return; }
  if (G.mode === 'combat' && cbKey(e)) { e.preventDefault(); return; }
});

/* ---------- boot ---------- */
function boot() {
  G.save = null; startTitle();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Title.bg = null; });
  window.__ss = { G, Hub, CB, show, beginShiftFlow, startTitle, showHQ, tickShift, spawnCall, dispatchTeam, calcChance, simBattle, newSave, startShift, buildHub, renderAll, endShift, cbBegin, startCommand };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
