/* =====================================================================
   30-model: save data, progression, call math, shift simulation
   (no DOM in here; the UI listens to Bus events)
   ===================================================================== */

const XP_TABLE = [0, 60, 150, 270, 420, 600, 820, 1080, 1380, 1720];
const MAX_LV = 10, MAX_STAT = 10, PERK_COST = 2, STAT_COST = 1;
const SPEED_BASE = 1.6;        // game-minutes per real second at 1x
const SAFE_AT = 0.8;           // at or above this chance a call cannot fail (shown honestly in the UI)
const OUTCOME = {
  flawless: { label: 'FLAWLESS', pts: 100, pay: 1.35, xp: 1.4, color: '#ffc53d' },
  success: { label: 'SUCCESS', pts: 70, pay: 1.0, xp: 1.0, color: '#5ee08a' },
  scrape: { label: 'CLOSE CALL', pts: 35, pay: 0.45, xp: 0.55, color: '#ff9a3d' },
  fail: { label: 'FAILED', pts: 0, pay: 0, xp: 0.25, color: '#ff5252' },
};

const G = { save: null, sh: null, modals: 0, snapshot: null, mode: 'title' };

/* ---------- save ---------- */
function newSave(name) {
  const heroes = {};
  HERO_ORDER.forEach(id => { heroes[id] = { own: false, lv: 1, xp: 0, pts: 0, spent: { combat: 0, vigor: 0, mobility: 0, charisma: 0, intellect: 0 }, perks: [] }; });
  ['anvil', 'skylark', 'fuse'].forEach(id => { heroes[id].own = true; });
  return { v: 1, name: name || 'Dispatcher', shiftNo: 1, funds: 0, heroes, fac: { comms: 0, medbay: 0, training: 0, lounge: 0, garage: 0 }, done: {}, totals: { calls: 0, flawless: 0, missed: 0, wins: 0, shifts: 0 }, flags: {}, finished: false };
}
function writeSave() { if (G.save) Store.set('save', G.save); }
function loadSave() {
  const s = Store.get('save', null);
  if (!s || s.v !== 1 || !s.heroes) return null;
  HERO_ORDER.forEach(id => { if (!s.heroes[id]) s.heroes[id] = { own: false, lv: 1, xp: 0, pts: 0, spent: { combat: 0, vigor: 0, mobility: 0, charisma: 0, intellect: 0 }, perks: [] }; });
  return s;
}
const hsave = id => G.save.heroes[id];
const owned = () => HERO_ORDER.filter(id => hsave(id).own);

/* ---------- hero numbers ---------- */
function lvFromXp(xp) { let lv = 1; for (let i = 1; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) lv = i + 1; return lv; }
function xpInfo(id) {
  const hs = hsave(id), lv = hs.lv, cur = hs.xp - XP_TABLE[lv - 1], need = lv >= MAX_LV ? 1 : XP_TABLE[lv] - XP_TABLE[lv - 1];
  return { lv, cur: lv >= MAX_LV ? need : cur, need, frac: lv >= MAX_LV ? 1 : clamp(cur / need, 0, 1) };
}
function grantXp(id, amount) {
  const hs = hsave(id); const before = hs.lv;
  hs.xp += Math.round(amount); const lv = Math.min(MAX_LV, lvFromXp(hs.xp));
  if (lv > before) { hs.pts += lv - before; hs.lv = lv; sfx('levelup'); Bus.emit('levelup', id, lv); return lv - before; }
  return 0;
}
const baseStat = (id, s) => HEROES[id].stats[s] + hsave(id).spent[s];
function heroStatus(id) {
  const sh = G.sh; if (!sh) return 'ready';
  const x = sh.hs[id]; if (!x) return 'ready';
  if (x.downUntil > sh.t) return x.out ? 'out' : 'down';
  if (x.out) return 'out';
  if (x.hurtUntil > sh.t) return 'hurt';
  return 'ready';
}
const isHurt = id => { const sh = G.sh; return !!(sh && sh.hs[id] && (sh.hs[id].hurtUntil > sh.t || sh.hs[id].downUntil > sh.t)); };
const isDown = id => { const sh = G.sh; return !!(sh && sh.hs[id] && sh.hs[id].downUntil > sh.t); };
const effStat = (id, s) => Math.max(0, baseStat(id, s) - (isHurt(id) ? 1 : 0));
const _modCache = {};
function mods(id) {
  const perks = hsave(id).perks.join(','), key = id + ':' + perks;
  if (_modCache[key]) return _modCache[key];
  const m = {};
  HEROES[id].perks.forEach(p => { if (hsave(id).perks.includes(p.id)) for (const k in p.m) m[k] = (m[k] || 0) + p.m[k]; });
  return (_modCache[key] = m);
}
const powerOf = id => 6 + 1.35 * baseStat(id, HEROES[id].power);

/* ---------- calls ---------- */
function pairKey(a, b) { return CHEMISTRY.find(c => (c.a === a && c.b === b) || (c.a === b && c.b === a)); }
function chemistryList(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const c = pairKey(ids[i], ids[j]); if (c) out.push(c); }
  return out;
}
function makeReqs(T, no) {
  const sum = Object.values(T.w).reduce((a, b) => a + b, 0), out = {}, infl = 1 + Math.max(0, (no || 1) - 3) * 0.03;
  for (const s in T.w) out[s] = Math.max(1, Math.round(T.w[s] / sum * TIER_BUDGET[T.tier] * infl));
  return out;
}
function teamTotals(ids) { const t = {}; STATS.forEach(s => { t[s] = ids.reduce((a, id) => a + effStat(id, s), 0); }); return t; }

function calcChance(call, ids, extra) {
  extra = extra || 0;
  const req = call.req, team = teamTotals(ids), parts = [];
  const reqSum = Object.values(req).reduce((a, b) => a + b, 0);
  let got = 0, over = 0;
  for (const s in req) { got += Math.min(team[s], req[s]); over += Math.max(0, team[s] - req[s]); }
  const f = ids.length ? got / reqSum : 0;
  const base = 0.92 * Math.pow(f, 1.5);
  parts.push({ label: 'Stat match', v: base, kind: 'base' });
  let tagB = 0; const tagsHit = [];
  (call.bonus || []).forEach(t => { if (ids.some(id => HEROES[id].tags.includes(t))) { tagB += 0.06; tagsHit.push(t); } });
  if (tagB) parts.push({ label: 'Tag bonus', v: tagB });
  let perkTag = 0;
  ids.forEach(id => (call.bonus || []).forEach(t => { perkTag += mods(id)['tag_' + t] || 0; }));
  perkTag = Math.min(perkTag, 0.2); if (perkTag) parts.push({ label: 'Perks', v: perkTag });
  let chem = 0; const chems = chemistryList(ids);
  chems.forEach(c => { const mult = 1 + Math.max(...ids.map(id => mods(id).chem || 0)); chem += c.v > 0 ? c.v * mult : c.v; });
  if (chem) parts.push({ label: 'Chemistry', v: chem });
  const perkSucc = ids.reduce((a, id) => a + (mods(id).success || 0), 0);
  if (perkSucc) parts.push({ label: 'Team spirit', v: perkSucc });
  const lounge = G.save.fac.lounge * 0.02; if (lounge) parts.push({ label: 'Break Room', v: lounge });
  const ov = Math.min(0.06, (over / reqSum) * 0.12); if (ov > 0.004) parts.push({ label: 'Overkill', v: ov });
  if (extra) parts.push({ label: 'Radio check', v: extra });
  let chance = base + tagB + perkTag + chem + perkSucc + lounge + ov + extra;
  if (call.autoPenalty) { parts.push({ label: 'Auto-resolve', v: -0.08 }); chance -= 0.08; }
  chance = clamp(chance, ids.length ? 0.02 : 0, 0.99);
  const fb = ids.reduce((a, id) => a + (mods(id).flawless || 0), 0);
  return { chance, team, f, parts, tagsHit, chems, safe: chance >= SAFE_AT, odds: outcomeOdds(chance, fb), fb };
}
function outcomeOdds(chance, fb) {
  const pFl = clamp(0.6 * chance * chance - 0.1 + (fb || 0), 0.06, 0.9);
  if (chance >= SAFE_AT) return { flawless: pFl, success: 1 - pFl, scrape: 0, fail: 0 };
  return { flawless: chance * pFl, success: chance * (1 - pFl), scrape: (1 - chance) * 0.55, fail: (1 - chance) * 0.45 };
}
function rollOutcome(odds) {
  const r = R(); let a = odds.flawless; if (r < a) return 'flawless';
  a += odds.success; if (r < a) return 'success';
  a += odds.scrape; if (r < a) return 'scrape';
  return 'fail';
}

/* ---------- shift defs & scheduling ---------- */
function shiftDef(no) {
  if (no <= SHIFTS.length) return Object.assign({ no }, SHIFTS[no - 1]);
  const k = no - SHIFTS.length;
  const crisisPool = ['bridge', 'blimp', 'mecha_rampage'];
  return Object.assign({}, OVERTIME_BASE, { no, name: 'Overtime ' + k, n: Math.min(17, 12 + Math.floor(k / 2)), winMul: Math.max(0.65, 0.8 - k * 0.015), crises: [[200 + (k % 3) * 20, crisisPool[k % crisisPool.length]]] });
}
function buildSchedule(no) {
  const def = shiftDef(no), rng = makeRng(hashStr('secondshift' + no));
  if (def.calls) return def.calls.map(([t, id]) => ({ t, tpl: id }));
  const n = def.n, span = Math.min(def.len - 100, def.len * 0.78), times = [];
  for (let i = 0; i < n; i++) times.push(Math.round(span * (i + rng() * 0.7) / n));
  times[0] = 0;
  for (let k = 0; k < (def.cluster || 0); k++) { const i = rng.int(2, n - 1); times[i] = times[i - 1] + rng.int(2, 6); }
  times.sort((a, b) => a - b);
  const slots = times.map(t => ({ t, tpl: null })), used = new Set();
  // fights spread across the shift
  const F = (def.fights || []).slice(0, Math.max(1, Math.floor(n / 3)));
  F.forEach((id, k) => { let idx = Math.floor(((k + 1) / (F.length + 1)) * n); while (idx < n - 1 && slots[idx].tpl) idx++; slots[idx].tpl = id; used.add(id); });
  const pool = Object.keys(CALLS).filter(k => !CALLS[k].fight && (CALLS[k].slots || 2) < 3 && def.tiers.includes(CALLS[k].tier));
  let bag = rng.shuffle(pool);
  slots.forEach(sl => { if (sl.tpl) return; if (!bag.length) bag = rng.shuffle(pool); sl.tpl = bag.pop(); });
  (def.crises || []).forEach(([t, id]) => slots.push({ t, tpl: id, crisis: true }));
  slots.sort((a, b) => a.t - b.t);
  return slots;
}

/* ---------- shift runtime ---------- */
function healTime(kind) {
  const base = kind === 'down' ? 150 : 90, med = G.save.fac.medbay * 0.25, heat = (G.sh && G.sh.def.heat) ? 1.5 : 1;
  return Math.round(base * (1 - med) * heat);
}
function startShift(no) {
  G.snapshot = JSON.stringify(G.save);
  const def = shiftDef(no), sched = buildSchedule(no);
  const hs = {}; owned().forEach(id => { hs[id] = { out: null, hurtUntil: 0, downUntil: 0 }; });
  G.sh = {
    no, def, t: 0, speed: 1, userSpeed: 1, sched: sched.map(s => Object.assign({ spawned: false }, s)), calls: [], hs, nextId: 1,
    log: [], pts: 0, tally: { flawless: 0, success: 0, scrape: 0, fail: 0, missed: 0 }, earnedFunds: 0, earnedXp: {}, injuries: 0, wins: 0, battles: 0, ko: 0,
    selected: null, draft: {}, ended: false, results: [], returns: [], rivalScore: 0, idleSkip: false, started: performance.now(),
  };
  G.sh.total = sched.length;
  G.mode = 'shift';
  Bus.emit('shift:start', G.sh);
  return G.sh;
}
const openCalls = () => G.sh.calls.filter(c => c.status === 'open');
const activeCalls = () => G.sh.calls.filter(c => c.status === 'active');
const callById = id => G.sh.calls.find(c => c.id === id);
const readyHeroes = () => owned().filter(id => heroStatus(id) === 'ready' || heroStatus(id) === 'hurt');
function districtFree(d) { const used = G.sh.calls.filter(c => c.d === d && (c.status === 'open' || c.status === 'active')).map(c => c.slot); for (let i = 0; i < 3; i++) if (!used.includes(i)) return i; return 0; }

function spawnCall(entry) {
  const sh = G.sh, T = CALLS[entry.tpl]; if (!T) return null;
  const winBase = TIER_WINDOW[T.tier] * sh.def.winMul * (1 + G.save.fac.comms * 0.12) * (entry.crisis || T.boss ? 1.35 : 1);
  const c = {
    id: sh.nextId++, tpl: entry.tpl, title: T.title, d: T.d, cat: T.cat, tier: T.tier, req: makeReqs(T, sh.no), bonus: T.bonus || [], slots: T.slots || 2,
    onsite: 0, fight: T.fight || null, boss: !!T.boss, blurb: T.blurb, status: 'open', spawnT: sh.t, deadline: Math.round(sh.t + winBase), team: [], slot: districtFree(T.d),
    crisis: !!(entry.crisis || T.tier >= 5), fresh: true,
  };
  c.onsite = Math.round(lerp(T.on[0], T.on[1], R()) * (1 + Math.min(0.35, Math.max(0, sh.no - 2) * 0.04)));
  c.pay = TIER_PAY[T.tier];
  c.xp = TIER_XP[T.tier];
  c.dist = Math.hypot(DISTRICTS[T.d].x - HQ_POS.x, DISTRICTS[T.d].y - HQ_POS.y);
  c.autoPenalty = !!c.fight;
  sh.calls.push(c); sh.total = Math.max(sh.total, sh.calls.length);
  logLine(fmtClock(sh.t) + '  New call: ' + c.title + ' (' + DISTRICTS[c.d].name + ')', 'new');
  Bus.emit('call:new', c);
  return c;
}
function tripTime(call, ids) {
  const base = lerp(7, 20, clamp(call.dist / 0.5, 0, 1));
  const garage = [1, 0.8, 0.65, 0.5][G.save.fac.garage];
  const perk = ids.length ? ids.reduce((a, id) => a + (mods(id).trip || 0), 0) / ids.length : 0;
  return Math.max(4, Math.round(base * garage * (1 + perk)));
}
function eta(call, ids) { const tr = tripTime(call, ids); return { trip: tr, total: tr * 2 + call.onsite }; }
function logLine(text, kind) { const sh = G.sh; if (!sh) return; sh.log.push({ t: sh.t, text, kind: kind || '' }); if (sh.log.length > 80) sh.log.shift(); Bus.emit('log', sh.log[sh.log.length - 1]); }
const heroNames = ids => { const n = ids.map(id => HEROES[id].name); return n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
const fillLine = (line, ids, call) => line.replace(/\{h1\}/g, HEROES[ids[0]].name).replace(/\{h\}/g, heroNames(ids)).replace(/\{place\}/g, call ? DISTRICTS[call.d].name : '').replace(/\{you\}/g, 'You');

function canSend(call, ids) {
  if (!call || call.status !== 'open') return 'Call is no longer open.';
  if (!ids.length) return 'Assign at least one hero.';
  if (ids.length > call.slots) return 'Too many heroes.';
  if (ids.some(id => !['ready', 'hurt'].includes(heroStatus(id)))) return 'A hero is unavailable.';
  return null;
}
function dispatchTeam(call, ids, mode) {
  const err = canSend(call, ids); if (err) return err;
  const sh = G.sh, e = eta(call, ids);
  call.status = 'active'; call.team = ids.slice(); call.startT = sh.t; call.trip = e.trip; call.endT = sh.t + e.total; call.mode = mode || 'auto';
  call.checkAt = null; call.checkBonus = 0; call.checkDone = false;
  if (sh.def.comms && call.mode === 'auto' && R() < 0.6) call.checkAt = sh.t + call.trip + call.onsite * 0.45;
  ids.forEach(id => { sh.hs[id].out = call.id; });
  sh.draft[call.id] = [];
  const lead = ids[0];
  logLine(fmtClock(sh.t) + '  ' + fillLine(R.pick(RADIO.dispatch), ids, call).replace('You', 'Dispatch'), 'dispatch');
  logLine('   ' + HEROES[lead].name + ': ' + R.pick(RADIO.reply[HEROES[lead].temper]), 'reply');
  Bus.emit('mission:start', call);
  return null;
}
function missionChance(call) { return calcChance(call, call.team, call.checkBonus || 0); }

function injuryRisk(id, outcome) {
  const base = { flawless: 0, success: 0.1, scrape: 0.6, fail: 0.92 }[outcome];
  const vig = clamp(1 - baseStat(id, 'vigor') * 0.045, 0.45, 1);
  return clamp(base * vig * (1 + (mods(id).injury || 0)), 0, 0.98);
}
function injure(id, force) {
  const sh = G.sh, x = sh.hs[id];
  if (x.hurtUntil > sh.t || x.downUntil > sh.t || force === 'down') { x.downUntil = sh.t + healTime('down'); x.hurtUntil = x.downUntil; return 'down'; }
  x.hurtUntil = sh.t + healTime('hurt'); return 'hurt';
}
function payFor(call, outcome, ids) {
  const fundsMod = 1 + Math.min(0.5, ids.reduce((a, id) => a + (mods(id).funds || 0), 0));
  const xpMod = 1 + G.save.fac.training * 0.15 + Math.min(0.4, ids.reduce((a, id) => a + (mods(id).xp || 0), 0)) + (G.save.fac.training === 3 ? 0.05 : 0);
  const cmd = call.mode === 'command' ? 1.25 : 1;
  return { funds: Math.round(call.pay * OUTCOME[outcome].pay * fundsMod * cmd), xp: Math.round(call.xp * OUTCOME[outcome].xp * xpMod * cmd) };
}
/* apply the result of a mission (auto-roll or finished battle) */
function finishMission(call, outcome, opts) {
  const sh = G.sh; opts = opts || {};
  call.status = 'done'; call.outcome = outcome;
  const ids = call.team.slice();
  const pay = payFor(call, outcome, ids);
  const injuries = [];
  ids.forEach(id => {
    sh.hs[id].out = null;
    let inj = null;
    if (opts.ko && opts.ko.includes(id)) inj = injure(id);
    else if (!opts.ko && R() < injuryRisk(id, outcome)) inj = injure(id);
    else if (opts.ko && outcome !== 'flawless' && R() < injuryRisk(id, outcome) * 0.4) inj = injure(id);
    if (inj) { injuries.push({ id, kind: inj }); sh.injuries++; }
  });
  if (opts.returning) { ids.forEach(id => { sh.hs[id].out = call.id; }); sh.returns.push({ call, ids: ids.slice(), at: sh.t + opts.returning, start: sh.t }); }
  sh.earnedFunds += pay.funds; G.save.funds += pay.funds;
  const levels = [];
  ids.forEach(id => { const gain = grantXp(id, pay.xp); sh.earnedXp[id] = (sh.earnedXp[id] || 0) + pay.xp; if (gain) levels.push({ id, lv: hsave(id).lv }); });
  sh.tally[outcome]++; sh.pts += OUTCOME[outcome].pts;
  G.save.totals.calls++; if (outcome === 'flawless') G.save.totals.flawless++;
  const T = CALLS[call.tpl];
  const line = outcome === 'flawless' ? T.great : outcome === 'success' ? T.ok : outcome === 'scrape' ? T.ok : T.bad;
  const text = fillLine(line, ids, call) + (outcome === 'scrape' ? ' It got hairy. Everyone made it.' : '');
  const res = { call, outcome, text, pay, injuries, levels, team: ids, cmd: opts.cmd || null, t: sh.t };
  sh.results.push(res);
  logLine(fmtClock(sh.t) + '  ' + call.title + ': ' + OUTCOME[outcome].label, outcome);
  Bus.emit('mission:result', res);
  writeSave();
  return res;
}
function resolveAuto(call) {
  const ch = missionChance(call), outcome = rollOutcome(ch.odds);
  return finishMission(call, outcome, {});
}
function expireCall(call) {
  const sh = G.sh; call.status = 'missed'; sh.tally.missed++; sh.pts -= 15; G.save.totals.missed++;
  if (sh.def.rival) sh.rivalScore++;
  const msg = sh.def.rival ? 'Apex Guardians took the call.' : R.pick(RADIO.miss);
  logLine(fmtClock(sh.t) + '  MISSED: ' + call.title + '. ' + msg, 'missed');
  Bus.emit('call:missed', call, msg);
}

/* advance the shift clock by dt game-minutes */
function tickShift(dt) {
  const sh = G.sh; if (!sh || sh.ended) return;
  sh.t += dt;
  for (const e of sh.sched) if (!e.spawned && e.t <= sh.t) { e.spawned = true; spawnCall(e); }
  for (const c of sh.calls) {
    if (c.status === 'open' && sh.t >= c.deadline) expireCall(c);
    else if (c.status === 'active') {
      if (c.checkAt != null && !c.checkDone && sh.t >= c.checkAt) { c.checkDone = true; Bus.emit('mission:check', c); }
      if (c.mode === 'auto' && sh.t >= c.endT) resolveAuto(c);
    }
  }
  // heroes finishing a post-battle return trip
  for (let i = sh.returns.length - 1; i >= 0; i--) {
    const r = sh.returns[i];
    if (sh.t >= r.at) { r.ids.forEach(id => { if (sh.hs[id].out === r.call.id) sh.hs[id].out = null; }); sh.returns.splice(i, 1); Bus.emit('heroes:changed'); }
  }
  const allSpawned = sh.sched.every(e => e.spawned);
  if (allSpawned && sh.calls.every(c => c.status === 'done' || c.status === 'missed') && !sh.returns.length && !G.modals) { endShift(); }
}
/* when does an away hero come back? */
function returnTime(id) {
  const sh = G.sh; if (!sh) return 0;
  const c = sh.calls.find(c => c.status === 'active' && c.team.includes(id)); if (c) return c.endT;
  const r = sh.returns.find(r => r.ids.includes(id)); return r ? r.at : 0;
}
function nextEventIn() {   // minutes until something the player might care about
  const sh = G.sh; let m = 1e9;
  sh.returns.forEach(r => { m = Math.min(m, r.at - sh.t); });
  sh.sched.forEach(e => { if (!e.spawned) m = Math.min(m, e.t - sh.t); });
  sh.calls.forEach(c => { if (c.status === 'active') m = Math.min(m, (c.checkAt != null && !c.checkDone ? c.checkAt : c.endT) - sh.t); });
  return m;
}

/* ---------- shift end ---------- */
function gradeFor(sh) {
  const n = sh.total, ratio = n ? sh.pts / (n * 85) : 0;
  return ratio >= 0.97 ? 'S' : ratio >= 0.82 ? 'A' : ratio >= 0.62 ? 'B' : ratio >= 0.4 ? 'C' : 'D';
}
function shiftObjectives(sh) {
  const n = sh.total, need = Math.max(2, Math.ceil(n * 0.7)), fl = Math.max(1, Math.floor(n * 0.25));
  const ok = sh.tally.success + sh.tally.flawless;
  return [
    { text: 'Succeed at ' + need + ' ' + plural(need, 'call'), done: ok >= need, prog: ok + '/' + need },
    { text: 'Miss no calls', done: sh.tally.missed === 0, prog: sh.tally.missed + ' missed' },
    { text: 'Get ' + fl + ' Flawless ' + plural(fl, 'result'), done: sh.tally.flawless >= fl, prog: sh.tally.flawless + '/' + fl },
  ];
}
function endShift() {
  const sh = G.sh; if (sh.ended) return; sh.ended = true;
  const grade = gradeFor(sh), objs = shiftObjectives(sh), stars = objs.filter(o => o.done).length;
  const gradeBonus = { S: 300, A: 200, B: 120, C: 50, D: 0 }[grade] * (0.6 + 0.08 * sh.no);
  const starBonus = stars * (50 + 18 * sh.no);
  const bonus = Math.round(gradeBonus + starBonus);
  sh.earnedFunds += bonus; G.save.funds += bonus;
  const prev = G.save.done[sh.no]; const order = 'DCBAS';
  G.save.done[sh.no] = { grade: (prev && order.indexOf(prev.grade) > order.indexOf(grade)) ? prev.grade : grade, stars: Math.max(prev ? prev.stars : 0, stars) };
  if (sh.no >= G.save.shiftNo) G.save.shiftNo = sh.no + 1;
  G.save.totals.shifts++;
  if (sh.no === 1) { G.save.heroes.velvet.own = true; }
  if (sh.no === SHIFTS.length) G.save.finished = true;
  sh.report = { grade, objs, stars, bonus, gradeBonus: Math.round(gradeBonus), starBonus };
  writeSave();
  Bus.emit('shift:end', sh);
}
function retryShift() { if (G.snapshot) { G.save = JSON.parse(G.snapshot); writeSave(); } }

/* ---------- upgrades ---------- */
function canRaise(id, s) { const hs = hsave(id); return hs.pts >= STAT_COST && hs.spent[s] + HEROES[id].stats[s] < MAX_STAT; }
function raiseStat(id, s) { if (!canRaise(id, s)) return false; const hs = hsave(id); hs.spent[s]++; hs.pts -= STAT_COST; writeSave(); sfx('select'); return true; }
function canPerk(id, perkId) { const hs = hsave(id); return !hs.perks.includes(perkId) && hs.pts >= PERK_COST; }
function takePerk(id, perkId) { if (!canPerk(id, perkId)) return false; const hs = hsave(id); hs.perks.push(perkId); hs.pts -= PERK_COST; writeSave(); sfx('levelup'); return true; }
function facCost(k) { const lv = G.save.fac[k]; return lv >= 3 ? null : FACILITIES[k].lv[lv][0]; }
function buyFac(k) { const c = facCost(k); if (c == null || G.save.funds < c) return false; G.save.funds -= c; G.save.fac[k]++; writeSave(); sfx('coin'); return true; }
function recruitable() { return HERO_ORDER.filter(id => !hsave(id).own && HEROES[id].join.price > 0 && G.save.shiftNo > HEROES[id].join.shift); }
function hire(id) { const h = HEROES[id]; if (hsave(id).own || G.save.funds < h.join.price) return false; G.save.funds -= h.join.price; hsave(id).own = true; writeSave(); sfx('coin'); return true; }
