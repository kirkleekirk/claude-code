/* =====================================================================
   45-hub: the dispatch desk — clock, map, call queue, roster, call panel
   ===================================================================== */

const Hub = { built: false, raf: 0, last: 0, tokens: new Map(), pins: new Map(), pending: [], showing: false, tutHold: false, coach: null, lastMin: -1, slow: 0, el: {} };
const selectedCall = () => (G.sh && G.sh.selected != null) ? callById(G.sh.selected) : null;
const draftOf = c => (G.sh.draft[c.id] = G.sh.draft[c.id] || []);
const CAT_ICON = { rescue: 'rescue', crime: 'crime', disaster: 'disaster', social: 'social', chase: 'chase', tech: 'tech', fight: 'fight' };
const SPEEDS = [[0, 'pause', 'Pause (Space)'], [1, 'play', 'Normal speed (1)'], [2, 'fast', 'Fast (2)'], [4, 'fast3', 'Fastest (3)']];

function pinPos(c) { const d = DISTRICTS[c.d], s = d.slots[c.slot || 0]; return { x: d.x + s[0], y: d.y + s[1] }; }

/* ---------- build the static skeleton ---------- */
function buildHub() {
  const root = $('#s-hub'); root.innerHTML = '';
  const el = Hub.el = {};
  el.clockT = h('div.clock-t', '9:00 AM'); el.clockBar = h('div.clock-bar', h('i')); el.clockNote = h('div.clock-n', '');
  el.speed = h('div.hud-speed', SPEEDS.map(([v, ic, tt]) => h('button.spd', { 'data-v': v, title: tt, 'aria-label': tt, onclick: () => setSpeed(v) }, icon(ic, 16))));
  el.funds = h('div.hud-funds', icon('coin', 18), h('b', '$0'));
  el.tally = h('div.hud-tally', { title: 'Calls handled this shift' }, icon('check', 16), h('b', '0/0'));
  el.rival = h('div.hud-rival', { title: 'Calls Apex Guardians took' }, 'APEX 0');
  const hud = h('header.hud',
    h('div.hud-left', h('div.shift-badge', h('small', 'SHIFT'), h('b', String(G.sh.no))), h('div.shift-name', h('b', G.sh.def.name), h('span', G.sh.def.tag))),
    h('div.hud-clock', el.clockT, el.clockBar, el.clockNote),
    el.speed,
    h('div.hud-right', el.rival, el.tally, el.funds,
      h('button.ibtn', { title: 'How to play', 'aria-label': 'Help', onclick: () => openHelp() }, icon('help', 20)),
      h('button.ibtn', { title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings({ noReset: true }) }, icon('gear', 20))));
  el.roster = h('div.roster-list');
  el.queue = h('div.queue'); el.active = h('div.active-list'); el.panel = h('div.callpanel');
  el.mapWrap = h('div.map-wrap'); el.canvas = h('canvas.map-cv'); el.pins = h('div.pins'); el.routes = h('svg.routes', { viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
  el.hq = h('div.hq', { style: { left: HQ_POS.x * 100 + '%', top: HQ_POS.y * 100 + '%' } }, h('div.hq-dot'), h('span', 'DISPATCH HQ'));
  el.feed = h('div.feed');
  el.mapWrap.append(el.canvas, el.routes, el.hq, el.pins);
  const grid = el.grid = h('main.hub-grid', { 'data-tab': 'calls' },
    h('aside.col-roster', h('h3.col-h', icon('users', 16), 'Team'), el.roster),
    h('section.col-map', el.mapWrap, el.feed),
    h('aside.col-calls', h('h3.col-h', icon('radio', 16), 'Incoming calls', h('span.count', '')), el.queue, el.active, el.panel));
  const tabs = h('nav.tabs-m', [['calls', 'list', 'Calls'], ['map', 'map', 'Map'], ['team', 'users', 'Team']].map(([k, ic, lb]) =>
    h('button' + (k === 'calls' ? '.on' : ''), { 'data-tab': k, onclick: () => setTab(k) }, icon(ic, 20), h('span', lb), h('em.badge', { 'data-badge': k }))));
  el.coachSlot = h('div.coach-slot');
  root.append(hud, grid, tabs, el.coachSlot);
  Hub.tokens.clear(); Hub.pins.clear();
  if (!Hub.ro) { Hub.ro = new ResizeObserver(() => paintMap()); }
  Hub.ro.disconnect(); Hub.ro.observe(el.mapWrap);
  Hub.built = true;
  setTimeout(paintMap, 30);
}
function setTab(k) { Hub.el.grid.dataset.tab = k; $$('.tabs-m button').forEach(b => b.classList.toggle('on', b.dataset.tab === k)); if (k === 'map') paintMap(); sfx('click'); }
function paintMap() {
  const el = Hub.el; if (!el || !el.mapWrap) return;
  const r = el.mapWrap.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  el.canvas.width = Math.round(r.width * dpr); el.canvas.height = Math.round(r.height * dpr);
  const c = el.canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintCityMap(c, r.width, r.height);
}
function setSpeed(v) {
  const sh = G.sh; if (!sh) return; sh.speed = v; if (v) sh.userSpeed = v; sfx('click');
  $$('.spd', Hub.el.speed).forEach(b => b.classList.toggle('on', +b.dataset.v === v));
}

/* ---------- roster ---------- */
function statusText(id) {
  const sh = G.sh, st = heroStatus(id);
  if (st === 'ready') return ['Ready', null];
  if (st === 'hurt') return ['Injured · heals in', sh.hs[id].hurtUntil];
  if (st === 'down') return ['Down · back in', sh.hs[id].downUntil];
  return ['On call · back in', returnTime(id)];
}
function previewDelta(call, id) {
  const d = draftOf(call); if (d.includes(id) || d.length >= call.slots) return null;
  const a = d.length ? calcChance(call, d).chance : 0, b = calcChance(call, d.concat(id)).chance;
  return { delta: b - a, to: b };
}
function renderRoster() {
  const el = Hub.el, call = selectedCall(); el.roster.innerHTML = '';
  const order = owned().sort((a, b) => ({ ready: 0, hurt: 1, out: 2, down: 3 }[heroStatus(a)] - { ready: 0, hurt: 1, out: 2, down: 3 }[heroStatus(b)]) || HERO_ORDER.indexOf(a) - HERO_ORDER.indexOf(b));
  order.forEach(id => {
    const st = heroStatus(id), avail = st === 'ready' || st === 'hurt', H = HEROES[id];
    const inDraft = call && draftOf(call).includes(id);
    const [stTxt, until] = statusText(id), pd = call && avail ? previewDelta(call, id) : null;
    const relevant = call ? Object.keys(call.req) : [];
    const card = h('button.hcard.st-' + st + (inDraft ? '.assigned' : '') + (call && avail && !inDraft ? '.can' : ''), { 'data-hero': id, onclick: () => onHeroClick(id), 'aria-label': H.name + ', ' + stTxt },
      heroAvatar(id, 52),
      h('div.hc-main',
        h('div.hc-top', h('b', H.name), h('span.lv', 'Lv ' + hsave(id).lv), hsave(id).pts > 0 ? h('span.lvup', { title: 'Unspent points' }, '+') : null),
        h('div.hc-stats', STATS.map(s => h('span.ms' + (relevant.includes(s) ? '.rel' : '') + (isHurt(id) ? '.hurt' : ''), { style: { '--c': STAT[s].color }, title: STAT[s].label + ' ' + effStat(id, s) + (isHurt(id) ? ' (injured −1)' : '') }, statIcon(s, 11), String(effStat(id, s))))),
        h('div.hc-st', stTxt, until ? h('b', { 'data-until': until }, ' ' + fmtDur(until - G.sh.t)) : null),
        h('div.hc-tags', H.tags.map(t => h('span' + (call && call.bonus.includes(t) ? '.hit' : ''), { title: TAGS[t].label }, icon(t, 12))))),
      inDraft ? h('div.hc-badge.in', icon('check', 14), 'ON TEAM') : (pd && Math.abs(pd.delta) >= 0.005 ? h('div.hc-badge.delta' + (pd.delta > 0 ? '.up' : '.down'), (pd.delta >= 0 ? '+' : '') + Math.round(pd.delta * 100) + '%') : null));
    el.roster.appendChild(card);
  });
  const badge = $('[data-badge=team]'); if (badge) { const n = readyHeroes().length; badge.textContent = n || ''; badge.style.display = n ? '' : 'none'; }
}
function onHeroClick(id) {
  const call = selectedCall(), st = heroStatus(id);
  if (!call || !(st === 'ready' || st === 'hurt')) { openHeroSheet(id); sfx('click'); return; }
  toggleHero(call, id);
}
function toggleHero(call, id) {
  const d = draftOf(call), i = d.indexOf(id);
  if (i >= 0) { d.splice(i, 1); sfx('back'); }
  else if (d.length >= call.slots) { toast(call.slots === 1 ? 'This call takes one hero.' : 'Team is full. Remove a hero first.'); sfx('error'); return; }
  else { d.push(id); sfx('select'); }
  refreshAssign();
}
function refreshAssign() { renderRoster(); renderCallPanel(); updateQueueSelection(); Bus.emit('draft'); }

/* ---------- queue ---------- */
const RING_C = 2 * Math.PI * 15;
function ringEl(cls) { return h('svg.ring' + (cls ? '.' + cls : ''), { viewBox: '0 0 36 36' }, h('circle.bg', { cx: 18, cy: 18, r: 15 }), h('circle.fg', { cx: 18, cy: 18, r: 15, 'stroke-dasharray': RING_C, 'stroke-dashoffset': 0 })); }
function reqChips(c) { return h('span.rqs', Object.keys(c.req).map(s => h('span.rq', { style: { '--c': STAT[s].color }, title: STAT[s].label + ' ' + c.req[s] }, statIcon(s, 12), String(c.req[s])))); }
function callCard(c) {
  const sel = G.sh.selected === c.id;
  return h('button.qcard.tier-' + c.tier + (sel ? '.sel' : '') + (c.fresh ? '.fresh' : '') + (c.fight ? '.fight' : '') + (c.crisis ? '.crisis' : ''), { 'data-call': c.id, onclick: () => selectCall(c.id), 'aria-label': c.title },
    h('div.qc-ico', icon(CAT_ICON[c.cat] || 'fight', 22)),
    h('div.qc-main', h('div.qc-t', c.title), h('div.qc-s', h('span', DISTRICTS[c.d].name), c.fight ? h('em.pill.red', 'FIGHT') : null, c.crisis ? h('em.pill.amber', 'CRISIS') : null, reqChips(c))),
    h('div.qc-timer', ringEl(), h('b', { 'data-dl': c.id }, fmtDur(c.deadline - G.sh.t))));
}
function renderQueue() {
  const el = Hub.el, sh = G.sh, open = openCalls().sort((a, b) => a.deadline - b.deadline), act = activeCalls();
  el.queue.innerHTML = '';
  if (!open.length) el.queue.appendChild(h('div.empty', h('b', 'All quiet.'), h('span', sh.sched.some(e => !e.spawned) ? 'Waiting for the next call…' : 'No open calls.')));
  open.forEach(c => el.queue.appendChild(callCard(c)));
  const cnt = $('.col-h .count', el.grid); if (cnt) cnt.textContent = open.length ? open.length : '';
  el.active.innerHTML = '';
  if (act.length) {
    el.active.appendChild(h('h4.sub', 'In progress'));
    act.forEach(c => el.active.appendChild(h('div.acard', { 'data-act': c.id }, h('div.ac-t', h('b', c.title), h('span', DISTRICTS[c.d].name)), h('div.ac-team', c.team.map(id => heroAvatar(id, 26))), h('div.ac-bar', h('i')), h('div.ac-eta', { 'data-eta': c.id }, 'back in ' + fmtDur(returnEta(c))))));
  }
  const b = $('[data-badge=calls]'); if (b) { b.textContent = open.length || ''; b.style.display = open.length ? '' : 'none'; }
  setTimeout(() => open.forEach(c => { c.fresh = false; }), 1200);
}
const returnEta = c => Math.max(0, (c.mode === 'auto' ? c.endT : 0) - G.sh.t);
function updateQueueSelection() { $$('.qcard', Hub.el.queue).forEach(e => e.classList.toggle('sel', +e.dataset.call === G.sh.selected)); $$('.pin', Hub.el.pins).forEach(e => e.classList.toggle('sel', +e.dataset.call === G.sh.selected)); }
function selectCall(id) {
  const sh = G.sh; sh.selected = (sh.selected === id) ? null : id; sfx(sh.selected ? 'select' : 'back');
  const c = selectedCall();
  if (c && Hub.el.grid.dataset.tab === 'map') { /* keep map tab but show panel as overlay */ }
  renderRoster(); renderCallPanel(); updateQueueSelection();
  if (c) { if (window.innerWidth < 1000) { setTab('calls'); } maybeHint(c); }
  Bus.emit('select', c);
}

/* ---------- map pins & tokens ---------- */
function renderPins() {
  const el = Hub.el, sh = G.sh; el.pins.innerHTML = ''; el.routes.innerHTML = '';
  sh.calls.filter(c => c.status === 'open' || c.status === 'active').forEach(c => {
    const p = pinPos(c);
    const pin = h('button.pin.tier-' + c.tier + '.cat-' + c.cat + (c.status === 'active' ? '.active' : '') + (sh.selected === c.id ? '.sel' : '') + (c.fresh ? '.fresh' : ''), { 'data-call': c.id, style: { left: p.x * 100 + '%', top: p.y * 100 + '%' }, 'aria-label': c.title, onclick: () => { if (c.status === 'open') selectCall(c.id); } },
      ringEl('pin-ring'), h('span.pin-ic', icon(CAT_ICON[c.cat] || 'fight', 18)), h('span.pin-lb', c.title));
    el.pins.appendChild(pin);
    if (c.status === 'active') el.routes.appendChild(h('line', { x1: HQ_POS.x * 100, y1: HQ_POS.y * 100, x2: p.x * 100, y2: p.y * 100 }));
  });
  Hub.tokens.forEach(t => t.el.remove()); Hub.tokens.clear();
}
function tokenPos(call) {
  const sh = G.sh, p = pinPos(call), H0 = HQ_POS; let k, phase;
  const total = call.endT - call.startT, trip = call.trip;
  const e = sh.t - call.startT;
  if (e < trip) { k = e / trip; phase = 'out'; } else if (e < total - trip) { k = 1; phase = 'on'; } else { k = 1 - (e - (total - trip)) / trip; phase = 'back'; }
  k = clamp(k, 0, 1);
  return { x: lerp(H0.x, p.x, k), y: lerp(H0.y, p.y, k), phase };
}
function updateTokens() {
  const sh = G.sh, el = Hub.el, live = new Set();
  activeCalls().forEach(c => {
    live.add('c' + c.id); let tk = Hub.tokens.get('c' + c.id);
    if (!tk) { tk = { el: h('div.token', heroAvatar(c.team[0], 34), c.team.length > 1 ? h('em', '+' + (c.team.length - 1)) : null) }; el.mapWrap.appendChild(tk.el); Hub.tokens.set('c' + c.id, tk); }
    let pos;
    if (c.mode === 'auto') pos = tokenPos(c);
    else { const p = pinPos(c); pos = { x: p.x, y: p.y, phase: 'on' }; }
    tk.el.style.left = pos.x * 100 + '%'; tk.el.style.top = pos.y * 100 + '%'; tk.el.dataset.phase = pos.phase;
  });
  sh.returns.forEach(r => {
    const key = 'r' + r.call.id; live.add(key); let tk = Hub.tokens.get(key);
    if (!tk) { tk = { el: h('div.token', heroAvatar(r.ids[0], 34), r.ids.length > 1 ? h('em', '+' + (r.ids.length - 1)) : null) }; el.mapWrap.appendChild(tk.el); Hub.tokens.set(key, tk); }
    const p = pinPos(r.call), k = clamp((sh.t - r.start) / Math.max(1, r.at - r.start), 0, 1);
    tk.el.style.left = lerp(p.x, HQ_POS.x, k) * 100 + '%'; tk.el.style.top = lerp(p.y, HQ_POS.y, k) * 100 + '%'; tk.el.dataset.phase = 'back';
  });
  Hub.tokens.forEach((t, k) => { if (!live.has(k)) { t.el.remove(); Hub.tokens.delete(k); } });
}

/* ---------- call panel ---------- */
function reqRow(call, s, team) {
  const r = call.req[s], tv = team[s], segs = clamp(Math.max(r, tv), 1, 16), bar = h('div.bar-seg');
  for (let i = 0; i < segs; i++) bar.appendChild(h('i' + (i < Math.min(tv, r) ? '.on' : (i >= r && i < tv ? '.over' : '')) + (i === r - 1 ? '.mark' : ''), { style: { '--c': STAT[s].color } }));
  return h('div.rrow' + (tv >= r ? '.met' : ''), statIcon(s, 18), h('span.nm', STAT[s].label), bar, h('b', tv + '/' + r));
}
function slotEl(call, i, ids) {
  const id = ids[i];
  if (id) return h('button.slot.full', { title: 'Remove ' + HEROES[id].name, onclick: () => toggleHero(call, id) }, heroAvatar(id, 38), h('div.sl-n', h('b', HEROES[id].name)), h('span.sl-x', icon('x', 14)));
  return h('button.slot.empty', { onclick: () => openPicker(call) }, h('span.sl-plus', '+'), h('span', 'Assign hero'));
}
function openPicker(call) {
  const d = draftOf(call), avail = owned().filter(id => ['ready', 'hurt'].includes(heroStatus(id)) && !d.includes(id));
  const list = h('div.picker-list');
  if (!avail.length) list.appendChild(h('div.empty', h('b', 'Nobody is free.'), h('span', 'Heroes who are on a call or down cannot be sent.')));
  avail.sort((a, b) => calcChance(call, d.concat(b)).chance - calcChance(call, d.concat(a)).chance).forEach(id => {
    const pd = previewDelta(call, id), H = HEROES[id];
    list.appendChild(h('button.pick', { onclick: () => { m.close(); toggleHero(call, id); } }, heroAvatar(id, 46), h('div.pk-main', h('b', H.name), h('span', H.role + (isHurt(id) ? ' · injured' : '')), h('div.hc-stats', STATS.map(s => h('span.ms' + (call.req[s] ? '.rel' : ''), { style: { '--c': STAT[s].color } }, statIcon(s, 11), String(effStat(id, s)))))), h('div.hc-badge.delta' + (pd && pd.delta > 0.005 ? '.up' : ''), pd ? ((pd.delta >= 0 ? '+' : '') + Math.round(pd.delta * 100) + '%') : '')));
  });
  const m = openModal(h('div.picker', h('h3', 'Assign a hero'), h('p.muted', call.title), list, h('div.btnrow', h('button.btn.ghost', { onclick: () => m.close() }, 'Cancel'))), { cls: 'small', pause: false });
}
function renderCallPanel() {
  const el = Hub.el, call = selectedCall(), panel = el.panel; panel.innerHTML = '';
  panel.classList.toggle('has', !!call);
  if (!call || call.status !== 'open') {
    panel.append(h('div.cp-empty', h('div.big', icon('pin', 36)), h('b', 'Select a call'), h('span', 'Pick one from the list or tap a pin on the map. Then choose who to send.')));
    return;
  }
  const ids = draftOf(call), ch = calcChance(call, ids), e = eta(call, ids), pay = payFor(call, 'success', ids);
  const pct = Math.round(ch.chance * 100);
  const slots = h('div.cp-slots', Array.from({ length: call.slots }, (_, i) => slotEl(call, i, ids)));
  const reqs = h('div.cp-reqs', Object.keys(call.req).map(s => reqRow(call, s, ch.team)));
  const tagRow = call.bonus.length ? h('div.cp-tags', h('span.lbl', 'Bonus tags'), call.bonus.map(t => h('span.tag' + (ch.tagsHit.includes(t) ? '.lit' : ''), { title: TAGS[t].hint }, icon(t, 14), TAGS[t].label, ch.tagsHit.includes(t) ? h('i', '+6%') : null))) : null;
  const chemRow = ch.chems.length ? h('div.cp-chem', ch.chems.map(c => h('span.chem-chip' + (c.v > 0 ? '.good' : '.bad'), { title: c.line }, h('b', c.name), (c.v > 0 ? ' +' : ' ') + Math.round(c.v * 100) + '%'))) : null;
  const od = ch.odds, odds = ids.length ? (ch.safe ? 'Cannot fail. Only the quality of the result is left to chance.' : ['Flawless ' + Math.round(od.flawless * 100) + '%', 'Success ' + Math.round(od.success * 100) + '%', 'Close call ' + Math.round(od.scrape * 100) + '%', 'Fail ' + Math.round(od.fail * 100) + '%'].join(' · ')) : 'Assign a hero to see the odds.';
  const gauge = h('div.gauge' + (ch.safe ? '.safe' : pct >= 55 ? '.mid' : '.low'),
    h('div.g-top', h('div.g-num' + (ids.length ? '' : '.none'), ids.length ? pct + '%' : '0%'), h('div.g-lbl', h('b', 'SUCCESS CHANCE'), ch.safe && ids.length ? h('em.safe-pill', icon('check', 12), 'SAFE') : null),
      h('div.cp-info', h('span', { title: 'Round trip plus time on site' }, icon('clock', 14), ids.length ? '~' + fmtDur(e.total) : call.onsite + 'm on site'), h('span', icon('coin', 14), '$' + pay.funds), h('span', icon('star', 14), pay.xp + ' XP'))),
    h('div.g-bar', h('i', { style: { width: (ids.length ? pct : 0) + '%' } }), h('u', { style: { left: SAFE_AT * 100 + '%' }, title: 'At 80% a call cannot fail' }, h('span', '80% SAFE'))),
    h('div.g-odds', odds));
  const why = ids.length ? h('details.g-why', h('summary', 'Why this number?'), ch.parts.map(p => h('div.why', h('span', p.label), h('b' + (p.v < 0 ? '.neg' : ''), (p.kind === 'base' ? '' : (p.v >= 0 ? '+' : '')) + Math.round(p.v * 100) + '%')))) : null;
  const canGo = ids.length > 0, cmdOnly = call.boss;
  const actions = call.fight ? h('div.cp-actions',
    cmdOnly ? null : h('button.btn.big.btn-dispatch', { disabled: !canGo, onclick: () => doDispatch(call, 'auto') }, icon('radio', 18), 'Auto-resolve', h('small', '−8% chance')),
    h('button.btn.primary.big.btn-command', { disabled: !canGo, onclick: () => doDispatch(call, 'command') }, icon('fight', 18), 'Take command', h('small', '+25% rewards · play the battle')))
    : h('div.cp-actions', h('button.btn.primary.big.btn-dispatch', { disabled: !canGo, onclick: () => doDispatch(call, 'auto') }, icon('radio', 18), 'Dispatch', h('small', 'Enter')));
  panel.append(
    h('div.cp-body',
      h('div.cp-head', h('div.cp-ico', icon(CAT_ICON[call.cat] || 'fight', 28)), h('div', h('h2', call.title), h('div.cp-sub', DISTRICTS[call.d].name, stars(Math.min(call.tier, 5), Math.min(call.tier, 5)), h('span.cp-exp', { title: 'Time left before the call expires' }, icon('clock', 12), h('b', { 'data-dl2': call.id }, fmtDur(call.deadline - G.sh.t))), call.fight ? h('em.pill.red', 'FIGHT: ' + ENCOUNTERS[call.fight].en.length + ' enemies') : null)), h('button.x', { 'aria-label': 'Deselect call', onclick: () => selectCall(call.id) }, icon('x', 16))),
      h('p.cp-blurb', { title: call.blurb }, call.blurb),
      reqs, slots, tagRow || '', chemRow || '', why || ''),
    h('div.cp-foot', gauge, actions));
}
async function doDispatch(call, mode) {
  const ids = draftOf(call).slice();
  if (mode === 'command' && !(await preBattleCheck(call, ids))) return;
  const err = dispatchTeam(call, ids, mode);
  if (err) { toast(err); sfx('error'); return; }
  sfx('dispatch');
  const sh = G.sh; sh.selected = null;
  const next = openCalls().sort((a, b) => a.deadline - b.deadline)[0];
  if (next && mode !== 'command') sh.selected = next.id;
  renderAll();
  if (mode === 'command') startCommand(call, ids);
}
async function preBattleCheck(call, ids) {
  if (ids.length >= 2) return true;
  return await confirmBox('Fight with one hero?', 'Battles are much easier with a full team of up to ' + call.slots + '. You can still go in alone.', 'Fight anyway', 'Add heroes');
}

function renderAll() { renderRoster(); renderQueue(); renderCallPanel(); renderPins(); updateHud(); }

/* ---------- HUD + feed ---------- */
function updateHud() {
  const sh = G.sh, el = Hub.el; if (!sh || !el.clockT) return;
  el.clockT.textContent = fmtClock(sh.t);
  const f = clamp(sh.t / sh.def.len, 0, 1); el.clockBar.firstChild.style.width = f * 100 + '%';
  el.clockBar.classList.toggle('over', sh.t > sh.def.len);
  const skipping = sh.idleSkip && sh.speed > 0;
  el.clockNote.textContent = sh.t > sh.def.len ? 'OVERTIME' : skipping ? 'Waiting for the next call…' : sh.speed === 0 ? 'PAUSED' : '';
  el.clockNote.className = 'clock-n' + (sh.speed === 0 ? ' paused' : '') + (sh.t > sh.def.len ? ' ot' : '');
  $$('.spd', el.speed).forEach(b => b.classList.toggle('on', +b.dataset.v === sh.speed));
  el.funds.lastChild.textContent = fmtMoney(G.save.funds);
  const done = sh.tally.flawless + sh.tally.success + sh.tally.scrape + sh.tally.fail + sh.tally.missed;
  el.tally.lastChild.textContent = done + '/' + sh.total;
  el.rival.style.display = sh.def.rival ? '' : 'none'; el.rival.textContent = 'APEX ' + sh.rivalScore;
}
function renderFeed() {
  const el = Hub.el, sh = G.sh; if (!el.feed) return; el.feed.innerHTML = '';
  sh.log.slice(-4).forEach((l, i, a) => el.feed.appendChild(h('div.fl.' + (l.kind || 'x'), { style: { opacity: 0.45 + 0.55 * (i + 1) / a.length } }, l.text)));
}
function updateTimers() {
  const sh = G.sh, el = Hub.el, t = sh.t;
  $$('[data-dl]', el.queue).forEach(n => { const c = callById(+n.dataset.dl); if (c) n.textContent = fmtDur(c.deadline - t); });
  $$('.qcard', el.queue).forEach(card => {
    const c = callById(+card.dataset.call); if (!c) return; const win = c.deadline - c.spawnT, left = c.deadline - t, k = clamp(left / win, 0, 1);
    const fg = card.querySelector('.fg'); if (fg) fg.setAttribute('stroke-dashoffset', String(RING_C * (1 - k)));
    card.classList.toggle('urgent', left < 25 || k < 0.2);
  });
  $$('.pin', el.pins).forEach(pin => {
    const c = callById(+pin.dataset.call); if (!c) return;
    if (c.status === 'open') { const win = c.deadline - c.spawnT, k = clamp((c.deadline - t) / win, 0, 1); const fg = pin.querySelector('.fg'); if (fg) fg.setAttribute('stroke-dashoffset', String(RING_C * (1 - k))); pin.classList.toggle('urgent', (c.deadline - t) < 25 || k < 0.2); }
    else { const fg = pin.querySelector('.fg'); if (fg) fg.setAttribute('stroke-dashoffset', String(RING_C * (1 - clamp((t - c.startT) / (c.endT - c.startT), 0, 1)))); }
  });
  const sel = selectedCall(); const d2 = $('[data-dl2]', el.panel); if (d2 && sel) d2.textContent = fmtDur(sel.deadline - t);
  $$('.acard', el.active).forEach(a => { const c = callById(+a.dataset.act); if (!c) return; const k = clamp((t - c.startT) / (c.endT - c.startT), 0, 1); a.querySelector('.ac-bar i').style.width = k * 100 + '%'; a.querySelector('[data-eta]').textContent = 'back in ' + fmtDur(c.endT - t); });
  $$('[data-until]', el.roster).forEach(n => { n.textContent = ' ' + fmtDur(+n.dataset.until - t); });
}

/* ---------- the frame loop ---------- */
function hubFrame(ts) {
  Hub.raf = requestAnimationFrame(hubFrame);
  const dt = Math.min(0.1, (ts - (Hub.last || ts)) / 1000); Hub.last = ts;
  const sh = G.sh; if (!sh || G.mode !== 'hub' || sh.ended) return;
  const paused = sh.speed === 0 || G.modals > 0 || Hub.tutHold;
  if (!paused) {
    const nOpen = openCalls().length;
    sh.idleSkip = nOpen === 0 && nextEventIn() > 4 && !sh.noSkip;
    const mult = sh.idleSkip ? Math.max(sh.speed, 5) : sh.speed;
    const before = Math.floor(sh.t / 5);
    tickShift(clamp(dt * SPEED_BASE * mult, 0, 3));
    if (Math.floor(sh.t / 5) !== before) { renderRoster(); }   // refresh heal states & deltas every few game-minutes
  }
  updateHud(); updateTimers(); updateTokens();
  Hub.slow = (Hub.slow || 0) + dt; if (Hub.slow > 0.25) { Hub.slow = 0; coachTick(); }
}
function startHubLoop() { cancelAnimationFrame(Hub.raf); Hub.last = 0; Hub.raf = requestAnimationFrame(hubFrame); }
function stopHubLoop() { cancelAnimationFrame(Hub.raf); }

/* ---------- events -> UI ---------- */
Bus.on('call:new', c => {
  if (G.mode !== 'hub' || !Hub.built) return;
  renderQueue(); renderPins(); renderRoster();
  sfx('ring'); toast('New call: ' + c.title, 'new');
  const sh = G.sh; if (!sh.selected && openCalls().length === 1 && !(sh.no === 1 && !G.save.flags.tutDone)) { sh.selected = c.id; renderCallPanel(); renderRoster(); updateQueueSelection(); maybeHint(c); }
  if (Settings.autopause) setSpeed(0);
  if (window.innerWidth < 1000) { const b = $('[data-badge=calls]'); if (b) b.classList.add('ping'); setTimeout(() => b && b.classList.remove('ping'), 900); }
});
Bus.on('call:missed', (c, msg) => {
  if (G.mode !== 'hub' || !Hub.built) return;
  if (G.sh.selected === c.id) G.sh.selected = null;
  delete G.sh.draft[c.id];
  renderQueue(); renderPins(); renderCallPanel(); renderRoster(); toast('Missed: ' + c.title, 'bad'); sfx('bad');
});
Bus.on('mission:start', () => { if (G.mode === 'hub') { renderAll(); } });
Bus.on('heroes:changed', () => { if (G.mode === 'hub' && Hub.built) { renderRoster(); renderQueue(); renderPins(); } });
Bus.on('log', () => { if (G.mode === 'hub' && Hub.built) renderFeed(); });
Bus.on('mission:result', res => { if (G.mode !== 'hub') return; queueModal(async () => { await showResult(res); if (res.injuries.length) showHint('injured'); }); });
Bus.on('mission:check', c => { if (G.mode !== 'hub') return; queueModal(() => showCheck(c)); });

/* modal queue: holds the clock (G.modals) while results are waiting so the shift can't end underneath them */
function queueModal(fn) { G.modals++; Hub.pending.push(fn); pumpModals(); }
async function pumpModals() {
  if (Hub.showing) return; Hub.showing = true;
  while (Hub.pending.length) {
    const fn = Hub.pending.shift();
    try { await fn(); } catch (e) { console.error(e); }
    G.modals = Math.max(0, G.modals - 1);
    if (G.mode === 'hub' && Hub.built) { renderAll(); }
  }
  Hub.showing = false;
}

/* ---------- mission result modal ---------- */
function showResult(res) {
  return new Promise(resolve => {
    const O = OUTCOME[res.outcome], call = res.call;
    sfx(res.outcome === 'flawless' ? 'great' : res.outcome === 'success' ? 'ok' : res.outcome === 'scrape' ? 'meh' : 'bad');
    const heroes = h('div.rs-heroes', res.team.map(id => { const inj = res.injuries.find(x => x.id === id), lv = res.levels.find(x => x.id === id); return h('div.rs-hero' + (inj ? '.inj' : ''), heroAvatar(id, 56), h('b', HEROES[id].name), inj ? h('em.pill.red', inj.kind === 'down' ? 'DOWN' : 'INJURED') : null, lv ? h('em.pill.amber', 'LEVEL ' + lv.lv + '!') : null); }));
    const extra = res.cmd ? h('div.rs-cmd', h('span', 'Rounds ', h('b', res.cmd.rounds)), h('span', 'KOs ', h('b', res.cmd.kos)), h('span', 'Rank ', h('b', res.cmd.rank))) : null;
    const m = openModal(h('div.result.o-' + res.outcome, { style: { '--c': O.color } },
      h('div.rs-stamp', O.label),
      h('h3', call.title),
      h('p.rs-text', res.text),
      extra, heroes,
      h('div.rs-pay', h('span', icon('coin', 16), h('b', '+' + fmtMoney(res.pay.funds))), h('span', icon('star', 16), h('b', '+' + res.pay.xp + ' XP'))),
      res.levels.length ? h('div.rs-lv', icon('star', 14), 'Points to spend between shifts!') : null,
      h('div.btnrow', h('button.btn.primary.big', { 'data-autofocus': '1', onclick: () => m.close() }, 'Continue'))), { cls: 'small', pause: false, dismiss: false, onClose: () => resolve() });
    setTimeout(() => sfx('stamp'), 120);
    if (res.outcome === 'flawless') confettiBurst();
  });
}
function confettiBurst() {
  if (prefersReducedMotion()) return;
  const w = h('div.confetti'); document.body.appendChild(w);
  const cols = ['#ffc53d', '#ff4d8d', '#3de0ff', '#7dff6b', '#a98bff'];
  for (let i = 0; i < 46; i++) w.appendChild(h('i', { style: { left: (30 + Math.random() * 40) + '%', background: cols[i % 5], animationDelay: (Math.random() * 0.25) + 's', '--dx': (Math.random() * 600 - 300) + 'px', '--r': (Math.random() * 720 - 360) + 'deg' } }));
  setTimeout(() => w.remove(), 2200);
}

/* ---------- radio check modal ---------- */
function showCheck(call) {
  return new Promise(resolve => {
    const lead = R.pick(call.team), H = HEROES[lead], tpl = R.pick(CHECKS);
    const opts = R.shuffle([H.likes, H.dislikes, Object.keys(TEMPERS).find(t => t !== H.likes && t !== H.dislikes && t !== H.temper) || 'calm']);
    const lim = Settings.relaxed ? 0 : 12; let left = lim, timer = null, done = false;
    const bar = h('div.ck-bar', h('i'));
    const choose = (t, auto) => {
      if (done) return; done = true; clearInterval(timer);
      let v = t === H.likes ? 0.12 : t === H.dislikes ? -0.08 : 0.03; if (auto) v = -0.03;
      call.checkBonus = v;
      const msg = auto ? 'No answer. The line crackled.' : v > 0.1 ? H.name + ' loved that.' : v > 0 ? H.name + ' shrugged and carried on.' : H.name + ' did not love that.';
      logLine(fmtClock(G.sh.t) + '  Radio: ' + msg, v > 0 ? 'great' : v < 0 ? 'bad' : 'x'); sfx(v > 0.05 ? 'great' : v < 0 ? 'error' : 'click');
      body.classList.add('answered');
      body.querySelector('.ck-res').textContent = (v >= 0 ? '+' : '') + Math.round(v * 100) + '% — ' + msg;
      body.querySelectorAll('.ck-opt').forEach(b => { b.disabled = true; if (b.dataset.t === H.likes) b.classList.add('like'); if (b.dataset.t === H.dislikes) b.classList.add('dis'); });
      setTimeout(() => m.close(), 1200);
    };
    const body = h('div.check', h('div.ck-h', icon('radio', 18), 'RADIO CHECK'), h('div.ck-who', heroAvatar(lead, 64), h('div', h('b', H.name), h('span', 'on ' + call.title))), h('p.ck-q', fillLine(tpl.q, [lead], call)),
      h('div.ck-opts', opts.map(t => h('button.ck-opt', { 'data-t': t, onclick: () => choose(t) }, h('b', TEMPERS[t].label), h('span', tpl.r[t])))),
      lim ? bar : null, h('div.ck-res'));
    const m = openModal(body, { cls: 'small', pause: false, dismiss: false, onClose: () => resolve() });
    sfx('radio');
    if (lim) {
      const t0 = performance.now();
      timer = setInterval(() => { left = lim - (performance.now() - t0) / 1000; bar.firstChild.style.width = clamp(left / lim, 0, 1) * 100 + '%'; if (left <= 0) choose(null, true); }, 80);
    }
  });
}

/* =====================================================================
   COACH — gentle tutorial for the first shifts
   ===================================================================== */
const HINTS = {
  fight: { text: "That's a fight call. Auto-resolve rolls the dice. Take Command lets you fight it out on the grid for 25% more pay. Try it!", who: 'marlowe' },
  chem: { text: "See the green chip? Those two work well together. Red chips mean a bad pairing. Mind the chemistry!", who: 'marlowe' },
  crisis: { text: "Crisis calls are the big ones. They stay open longer and pay more, and many need three heroes. Bring your best.", who: 'marlowe' },
  injured: { text: "Injured heroes can still go, but lose 1 on every stat. Hurt again and they're Down. Watch the roster.", who: 'marlowe' },
};
function showHint(key) {
  if (G.save.flags['hint_' + key]) return; G.save.flags['hint_' + key] = 1; writeSave();
  const H0 = HINTS[key]; if (!H0) return; coachShow(H0.text, null, true);
}
function maybeHint(c) {
  if (G.sh.no === 1) return;
  if (c.fight) showHint('fight'); else if (c.crisis) showHint('crisis');
}
Bus.on('draft', () => { const c = selectedCall(); if (c && G.sh.no >= 2 && chemistryList(draftOf(c)).length) showHint('chem'); });
const COACH_STEPS = [
  { id: 'select', hold: true, text: 'A call just came in! Click it in the list (or tap the pin on the map) to see what it needs.', target: '.qcard', done: () => G.sh.selected != null },
  { id: 'assign', hold: true, text: 'Each bar is a stat the call needs. Click a hero on the left to add them. The chip on each hero shows how much they help.', target: '.hcard.can', done: () => { const c = selectedCall(); return !c || draftOf(c).length > 0; } },
  { id: 'send', hold: true, text: 'Nice pick. At 80% or higher the call is SAFE and cannot fail. Press DISPATCH (or Enter).', target: '.btn-dispatch', done: () => G.sh.calls.some(c => c.status !== 'open') },
  { id: 'speed', hold: false, text: 'They are on the way. Use the speed buttons to fast-forward, or Space to pause. Time skips ahead on its own when nothing needs you.', target: '.hud-speed', done: () => G.sh.results.length > 0 || performance.now() - (Hub.coachStart || 0) > 9000 },
];
function coachShow(text, target, auto) {
  coachHide();
  const el = h('div.coach', h('div.co-pic', npcPortrait('marlowe', 64, 64, 'neutral')), h('div.co-b', h('b', 'Chief Marlowe'), h('p', text)), h('button.btn.small', { onclick: coachHide }, 'Got it'));
  Hub.el.coachSlot.appendChild(el); Hub.coach = { el, target };
  if (target) $$(target).forEach(t => t.classList.add('coach-glow'));
  if (auto) setTimeout(() => { if (Hub.coach && Hub.coach.el === el) coachHide(); }, 14000);
}
function coachHide() { if (Hub.coach) { Hub.coach.el.remove(); if (Hub.coach.target) $$('.coach-glow').forEach(t => t.classList.remove('coach-glow')); Hub.coach = null; } }
function coachTick() {
  if (!G.sh || G.sh.no !== 1 || G.save.flags.tutDone) { Hub.tutHold = false; return; }
  const idx = Hub.coachIdx || 0;
  if (idx >= COACH_STEPS.length) { Hub.tutHold = false; if (Hub.coach) coachHide(); G.save.flags.tutDone = 1; return; }
  const st = COACH_STEPS[idx];
  const have = st.id === 'select' ? openCalls().length > 0 : true;
  if (!have) { Hub.tutHold = false; return; }
  if (!Hub.coach || Hub.coach.step !== st.id) { coachShow(st.text, st.target); Hub.coach.step = st.id; Hub.coachStart = performance.now(); }
  else if (st.target) $$(st.target).forEach(t => t.classList.add('coach-glow'));
  Hub.tutHold = st.hold;
  if (st.done()) { Hub.coachIdx = idx + 1; coachHide(); sfx('ok'); }
}
