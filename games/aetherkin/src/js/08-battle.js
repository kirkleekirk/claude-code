/* ============================================================================
   BATTLE — turn resolution, damage, statuses, fields, Focus, and the foe's AI.
   ========================================================================== */
function toFighter(kin, sideKey) {
  const sp = SPECIES[kin.sp], st = statsFor(kin);
  const f = {
    kin, sideKey, sp: kin.sp, name: kinName(kin), types: sp.t.slice(), lv: kin.lv,
    maxhp: st.hp, hp: clamp(kin.hp, 0, st.hp), base: st,
    stages: { frc: 0, grd: 0, arc: 0, wrd: 0, swf: 0, acc: 0, eva: 0, crit: 0 },
    status: null, statusTurns: 0, marks: {}, counters: {}, timers: {}, flags: {},
    moves: kin.moves.slice(), abil: kin.abil.slice(), pass: kin.pass.slice(),
    cds: {}, focusMax: 5, focus: 2, justSwitchedIn: true, tookHitThisTurn: false,
  };
  for (const id of f.pass) { const p = PASSIVES[id]; if (p && p.focusMaxBonus) f.focusMax += p.focusMaxBonus; }
  f.focus = Math.min(f.focusMax, 2);
  f.spd = f.base.swf;
  return f;
}
const isDown = f => !f || f.hp <= 0;
const passOf = f => f.pass.map(id => PASSIVES[id]).filter(Boolean);

function newBattle(playerKin, foeKin, opts) {
  const o = opts || {};
  const bt = {
    you: { key: 'you', party: playerKin.map(k => toFighter(k, 'you')), idx: 0, player: true, label: 'Your kin' },
    foe: { key: 'foe', party: foeKin.map(k => toFighter(k, 'foe')), idx: 0, player: false, label: o.foeLabel || 'Wild kin' },
    field: null, fieldTurns: 0, turn: 0, log: [], over: false, result: null,
    wild: o.wild !== false, warden: o.warden || null, canFlee: o.wild !== false, escapes: 0, pending: null,
  };
  bt.you.idx = bt.you.party.findIndex(f => !isDown(f));
  if (bt.you.idx < 0) bt.you.idx = 0;
  bt.say = (s, tone) => { bt.log.push({ s, tone: tone || 'plain' }); if (bt.log.length > 200) bt.log.shift(); };
  return bt;
}
const active = side => side.party[side.idx];
const sideOf = (bt, f) => (f.sideKey === 'you' ? bt.you : bt.foe);
const oppSide = (bt, f) => (f.sideKey === 'you' ? bt.foe : bt.you);
const oppOf = (bt, f) => active(oppSide(bt, f));

/* ---------------- shared effect context --------------------------------- */
function ctxFor(bt, self, foe, extra) {
  const c = {
    bt, self, foe, atk: self, def: foe,
    log: s => bt.say(s),
    healRaw: (t, n) => healFighter(bt, t, n),
    heal: (t, n) => healFighter(bt, t, n),
    dealTo: (t, n) => damageFighter(bt, t, n),
    hurtSelf: n => damageFighter(bt, self, n),
    hurtFoe: n => damageFighter(bt, foe, n),
    stageTo: (t, d) => applyStages(bt, t, d, self),
    stage: (t, d) => applyStages(bt, t, d, self),
    inflictTo: (t, s) => inflict(bt, t, s, self),
    inflict: (t, s) => inflict(bt, t, s, self),
    mark: (t, m, n) => { t.marks[m] = n || (m === 'bleed' ? 3 : 4); bt.say(t.name + ' is ' + STATUSES[m].name + 'ed.', 'bad'); },
    cure: t => { if (t.status) { bt.say(t.name + ' shakes off ' + STATUSES[t.status].name + '.', 'good'); t.status = null; t.statusTurns = 0; } },
    clearStatus: t => { t.status = null; t.statusTurns = 0; },
    give: (t, k, n) => { t.counters[k] = clamp((t.counters[k] || 0) + n, 0, 8); },
    addCounter: (t, k, n) => { t.counters[k] = clamp((t.counters[k] || 0) + n, 0, 8); },
    setField: id => setField(bt, id),
    wipeStages: () => { for (const s of [active(bt.you), active(bt.foe)]) for (const k in s.stages) s.stages[k] = 0; },
  };
  return Object.assign(c, extra || {});
}
function hookMult(bt, f, name, extra) {
  let m = 1;
  for (const p of passOf(f)) if (p[name]) { const v = p[name](ctxFor(bt, f, oppOf(bt, f), extra)); if (typeof v === 'number') m *= v; }
  return m;
}
function hookAny(bt, f, name, extra) {
  for (const p of passOf(f)) if (p[name] && p[name](ctxFor(bt, f, oppOf(bt, f), extra))) return p;
  return null;
}
function hookRun(bt, f, name, extra) {
  for (const p of passOf(f)) if (p[name]) p[name](ctxFor(bt, f, oppOf(bt, f), extra));
}
function hookSum(bt, f, name, extra) {
  let n = 0;
  for (const p of passOf(f)) if (p[name]) { const v = p[name](ctxFor(bt, f, oppOf(bt, f), extra)); if (typeof v === 'number') n += v; }
  return n;
}

/* ---------------- stats in battle --------------------------------------- */
function statOf(bt, f, key, stageOverride) {
  const stage = stageOverride === undefined ? (f.stages[key] || 0) : stageOverride;
  let v = f.base[key] * stageMult(stage);
  if (key === 'frc' && f.status === 'burn') v *= 0.75;
  if (key === 'swf' && f.status === 'chill') v *= 0.6;
  if (key === 'swf' && f.status === 'shock') v *= 0.85;
  v *= hookMult(bt, f, 'statMult', { stat: key });
  return Math.max(1, v);
}
function refreshSpeed(bt) {
  for (const s of [bt.you, bt.foe]) { const f = active(s); if (f) f.spd = statOf(bt, f, 'swf'); }
}

/* ---------------- health, stages, statuses ------------------------------ */
function damageFighter(bt, f, n) {
  if (isDown(f) || n <= 0) return 0;
  const fullBefore = f.hp >= f.maxhp;
  const dealt = Math.min(f.hp, Math.round(n));
  f.hp -= dealt;
  f.tookHitThisTurn = true;
  if (f.hp <= 0) {
    f.hp = 0;
    for (const p of passOf(f)) {
      if (!p.survive) continue;
      if (p.survive(ctxFor(bt, f, oppOf(bt, f), { fullBefore }))) break;
    }
    if (f.hp < 0) f.hp = 0;
  }
  return dealt;
}
function healFighter(bt, f, n) {
  if (isDown(f) || n <= 0) return 0;
  const before = f.hp;
  f.hp = Math.min(f.maxhp, f.hp + Math.round(n));
  const got = f.hp - before;
  if (got > 0) bt.say(f.name + ' mends ' + got + '.', 'good');
  return got;
}
function applyStages(bt, f, deltas, source) {
  if (isDown(f)) return;
  for (const k in deltas) {
    let d = deltas[k];
    if (d < 0 && source && source !== f) d += hookSum(bt, source, 'deepen', { stat: k, delta: d });
    if (d < 0 && hookAny(bt, f, 'guardStage', { stat: k, delta: d })) { bt.say(f.name + '’s ' + STAGE_NAME[k] + ' will not drop.', 'good'); continue; }
    const before = f.stages[k] || 0;
    f.stages[k] = clamp(before + d, -6, 6);
    const moved = f.stages[k] - before;
    if (moved === 0) { bt.say(f.name + '’s ' + STAGE_NAME[k] + ' can go no ' + (d > 0 ? 'higher' : 'lower') + '.'); continue; }
    const word = Math.abs(moved) >= 2 ? (moved > 0 ? ' rises sharply.' : ' falls sharply.') : (moved > 0 ? ' rises.' : ' falls.');
    bt.say(f.name + '’s ' + STAGE_NAME[k] + word, moved > 0 ? (f.sideKey === 'you' ? 'good' : 'bad') : (f.sideKey === 'you' ? 'bad' : 'good'));
  }
}
let _statusDepth = 0;
function inflict(bt, f, statusId, source) {
  if (isDown(f) || !statusId || _statusDepth > 2) return false;
  const def = STATUSES[statusId];
  if (!def) return false;
  if (def.major) {
    if (f.status) return false;
    if (f.timers.wardStatus > 0) { bt.say(f.name + ' is warded against it.', 'good'); return false; }
    if (statusId === 'burn' && f.types.includes('ember')) return false;
    if (statusId === 'chill' && f.types.includes('frost')) return false;
    if (statusId === 'shock' && f.types.includes('storm')) return false;
    if (statusId === 'poison' && f.types.includes('venom')) return false;
    _statusDepth++;
    const blocked = hookAny(bt, f, 'blockStatus', { status: statusId });
    _statusDepth--;
    if (blocked) { bt.say(f.name + ' shrugs it off.', 'good'); return false; }
    f.status = statusId; f.statusTurns = 0;
    if (statusId === 'poison' && source) { const boost = passOf(source).find(p => p.poisonBoost); f.poisonScale = boost ? boost.poisonBoost : 1; }
    bt.say(f.name + ' is ' + def.name.toLowerCase() + 'ed.', f.sideKey === 'you' ? 'bad' : 'good');
    return true;
  }
  if (def.stacks) { f.marks[statusId] = clamp((f.marks[statusId] || 0) + 1, 0, 6); bt.say(f.name + ' takes another ' + def.name + ' (x' + f.marks[statusId] + ').', f.sideKey === 'you' ? 'bad' : 'good'); return true; }
  f.marks[statusId] = statusId === 'bleed' ? 3 : 4;
  bt.say(f.name + ' is ' + def.name.toLowerCase() + 'ed.', f.sideKey === 'you' ? 'bad' : 'good');
  return true;
}
function setField(bt, id) {
  const fd = FIELDS[id];
  if (!fd) return;
  bt.field = id; bt.fieldTurns = fd.turns;
  bt.say(fd.name + ' rises. ' + fd.blurb, 'sys');
}
function fieldMult(bt, moveType) {
  const fd = FIELDS[bt.field];
  if (!fd) return 1;
  return (fd.boost[moveType] || 1) * (fd.damp[moveType] || 1);
}

/* ---------------- damage ------------------------------------------------ */
function movePower(bt, atk, def, move) {
  return move.pw ? move.pw(ctxFor(bt, atk, def, { move })) : (move.p || 0);
}
function critChance(bt, atk, def) {
  return critChanceFor((atk.stages.crit || 0) + hookSum(bt, atk, 'critBonus'));
}
function accuracyOf(bt, atk, def, move) {
  if (!move.a) return 1;
  let acc = move.a / 100;
  acc *= accStageMult((atk.stages.acc || 0) - (def.stages.eva || 0));
  acc *= hookMult(bt, atk, 'accSelf', { move });
  acc *= hookMult(bt, def, 'accMult', { move });
  if (bt.field === 'thunderhead') acc *= 1.15;
  if (atk.timers.sureStrike > 0) return 1;
  if (def.timers.slip > 0) acc *= 0.6;
  return clamp(acc, 0.05, 1);
}
function calcDamage(bt, atk, def, move, crit) {
  const phys = move.c === 'phys';
  const offK = phys ? 'frc' : 'arc', defK = phys ? 'grd' : 'wrd';
  let aStage = atk.stages[offK] || 0, dStage = def.stages[defK] || 0;
  if (crit) { if (aStage < 0) aStage = 0; if (dStage > 0) dStage = 0; }
  if (move.bypass && dStage > 0) dStage = 0;
  const A = statOf(bt, atk, offK, aStage), D = statOf(bt, def, defK, dStage);
  const power = movePower(bt, atk, def, move);
  if (power <= 0) return { dmg: 0, eff: 1, crit: false };
  let dmg = Math.floor(Math.floor(Math.floor(2 * atk.lv / 5 + 2) * power * A / D) / 50) + 2;
  const eff = typeMult(move.t, def.types);
  if (eff === 0) return { dmg: 0, eff: 0, crit: false };
  dmg *= eff;
  if (atk.types.includes(move.t)) dmg *= 1.5;
  if (crit) dmg *= 1.75;
  dmg *= fieldMult(bt, move.t);
  if (bt.field === 'tremor' && phys) dmg *= 1.1;
  dmg *= hookMult(bt, atk, 'dmgOut', { move, dmg });
  dmg *= hookMult(bt, def, 'dmgIn', { move, dmg });
  if (def.timers.precog > 0) dmg *= 0.5;
  dmg *= rf(0.85, 1);
  return { dmg: Math.max(1, Math.round(dmg)), eff, crit };
}

/* ---------------- performing a move ------------------------------------- */
function useMove(bt, atk, def, moveId) {
  const move = MOVES[moveId];
  if (!move) return;
  bt.say(atk.name + ' uses ' + move.n + '.', 'act');
  if (move.cd) atk.cds[moveId] = move.cd + 1;

  if (move.c !== 'stat' && hookAny(bt, def, 'dodge', { move })) { bt.say('It passes straight through ' + def.name + '.', 'weak'); return; }
  if (!chance(accuracyOf(bt, atk, def, move))) { bt.say(atk.name + ' misses.', 'weak'); return; }
  if (atk.timers.sureStrike > 0) atk.timers.sureStrike = 0;

  let total = 0, eff = 1, anyCrit = false;
  if (move.c === 'stat') {
    eff = typeMult(move.t, def.types);
  } else {
    const shots = move.hits ? ri(move.hits[0], move.hits[1]) : 1;
    for (let i = 0; i < shots; i++) {
      if (isDown(def)) break;
      const crit = chance(critChance(bt, atk, def));
      const r = calcDamage(bt, atk, def, move, crit);
      eff = r.eff;
      if (r.eff === 0) { bt.say(effLabel(0).text, 'weak'); return; }
      anyCrit = anyCrit || crit;
      const dealt = damageFighter(bt, def, r.dmg);
      total += dealt;
      (bt.hits || (bt.hits = [])).push({ target: def.sideKey, amount: dealt, crit, eff: r.eff });
    }
    if (shots > 1) bt.say('It lands ' + shots + ' times.', 'plain');
    if (anyCrit) bt.say('A clean strike!', 'crit');
    const lab = effLabel(eff);
    if (lab.text) bt.say(lab.text, lab.tone === 'super' ? 'crit' : 'weak');
  }

  /* riders */
  if (total > 0 || move.c === 'stat') {
    if (move.drain) healFighter(bt, atk, Math.round(total * move.drain));
    if (move.recoil) { const r = Math.round(total * move.recoil); if (r > 0) { damageFighter(bt, atk, r); bt.say(atk.name + ' takes ' + r + ' in backlash.', 'bad'); } }
    if (move.heal) healFighter(bt, atk, Math.round(atk.maxhp * move.heal));
    if (move.self) applyStages(bt, atk, move.self, atk);
    if (move.foe && !isDown(def)) applyStages(bt, def, move.foe, atk);
    if (move.st && chance(move.st[1])) inflict(bt, def, move.st[0], atk);
    if (move.mk && chance(move.mk[1])) inflict(bt, def, move.mk[0], atk);
    if (move.fld) setField(bt, move.fld);
    if (move.onHit) move.onHit(ctxFor(bt, atk, def, { move, dmg: total }));
  }
  if (total > 0) {
    hookRun(bt, atk, 'afterDeal', { move, dmg: total });
    if (!isDown(def)) hookRun(bt, def, 'afterTake', { move, dmg: total, foe: atk });
    if (def.timers.shroud > 0 && move.c === 'arc') {
      const back = Math.max(1, Math.round(total / 3));
      damageFighter(bt, atk, back);
      bt.say('The shroud throws ' + back + ' back at ' + atk.name + '.', 'good');
    }
    if (def.timers.answer > 0) { const back = Math.max(1, Math.round(total * 0.25)); damageFighter(bt, atk, back); bt.say(def.name + ' answers for ' + back + '.', 'good'); }
    if (def.timers.frostcoat > 0 && move.c === 'phys') inflict(bt, atk, 'chill', def);
  }
}

function useAbility(bt, self, foe, abilId) {
  const ab = ABILITIES[abilId];
  if (!ab) return;
  self.focus -= ab.cost;
  if (ab.cd) self.cds['@' + abilId] = ab.cd + 1;
  bt.say(self.name + ' calls ' + ab.n + '.', 'act');
  ab.use(ctxFor(bt, self, foe, { ability: ab }));
}

/* ---------------- turn ordering & resolution ---------------------------- */
const actionPriority = (bt, f, a) => {
  if (!a) return -99;
  if (a.type === 'flee') return 8;
  if (a.type === 'item' || a.type === 'switch') return 6;
  if (a.type === 'move') { const m = MOVES[a.id]; return m ? (m.pri || 0) : 0; }
  return 0;
};
function canAct(bt, f) {
  if (f.timers.asleep > 0) { bt.say(f.name + ' is deep asleep.', 'weak'); return false; }
  if (f.status === 'chill' && chance(0.15)) { bt.say(f.name + ' is frozen stiff.', 'weak'); return false; }
  if (f.status === 'shock' && chance(0.25)) { bt.say(f.name + ' locks up mid-motion.', 'weak'); return false; }
  if (f.status === 'daze' && chance(0.33)) {
    const self = Math.max(1, Math.round(f.maxhp * 0.08));
    damageFighter(bt, f, self);
    bt.say(f.name + ' is too muddled and strikes itself for ' + self + '.', 'bad');
    return false;
  }
  return true;
}
function performAction(bt, side, act) {
  const f = active(side), foe = active(oppSide(bt, f));
  if (isDown(f) || bt.over) return;
  if (act.type === 'switch') { switchIn(bt, side, act.idx); return; }
  if (act.type === 'item') { useItemInBattle(bt, act.id, act.targetIdx); return; }
  if (act.type === 'flee') { attemptFlee(bt); return; }
  if (!canAct(bt, f)) return;
  if (act.type === 'ability') { useAbility(bt, f, foe, act.id); return; }
  if (act.type === 'move') {
    if (isDown(foe)) return;
    useMove(bt, f, foe, act.id);
  }
}
function switchIn(bt, side, idx) {
  const nextF = side.party[idx];
  if (!nextF || isDown(nextF) || idx === side.idx) return false;
  const cur = active(side);
  if (cur && !isDown(cur)) {
    if (cur.marks.root) { bt.say(cur.name + ' is rooted and cannot be recalled.', 'weak'); return false; }
    bt.say(cur.name + ' is recalled.', 'sys');
    cur.stages = { frc: 0, grd: 0, arc: 0, wrd: 0, swf: 0, acc: 0, eva: 0, crit: 0 };
    cur.counters = {}; cur.timers = {};
  }
  side.idx = idx;
  nextF.justSwitchedIn = true;
  bt.say(nextF.name + ' takes the field.', 'sys');
  hookRun(bt, nextF, 'onEnter');
  refreshSpeed(bt);
  return true;
}
function attemptFlee(bt) {
  const you = active(bt.you), foe = active(bt.foe);
  if (!bt.canFlee) { bt.say('The warden blocks the way.', 'weak'); return; }
  const odds = clamp(0.4 + (you.spd - foe.spd) / Math.max(1, foe.spd) * 0.5 + bt.escapes * 0.15, 0.2, 0.95);
  bt.escapes++;
  if (chance(odds)) { bt.over = true; bt.result = 'fled'; bt.say('You break away.', 'sys'); }
  else bt.say('It cuts off the retreat.', 'weak');
}

const STRAIN_FROM = 24;
function endOfTurn(bt) {
  /* The rift will not hold a binding open forever. Past a couple of dozen
     turns it starts closing on both sides, harder every turn. */
  const strain = Math.max(0, bt.turn - STRAIN_FROM);
  if (strain === 1) bt.say('The rift begins to close. It is taking a toll on both sides.', 'sys');
  for (const side of [bt.you, bt.foe]) {
    const f = active(side);
    if (!f || isDown(f)) continue;
    if (strain > 0) {
      const n = Math.max(1, Math.round(f.maxhp * (0.02 + 0.015 * strain)));
      f.hp = Math.max(0, f.hp - n);
      bt.say(f.name + ' is worn by the closing rift for ' + n + '.', 'bad');
      if (f.hp <= 0) continue;
    }
    /* field */
    if (bt.field === 'bloom') healFighter(bt, f, Math.round(f.maxhp * 0.04));
    /* status */
    if (f.status === 'burn') {
      let n = Math.round(f.maxhp * (bt.field === 'emberstorm' ? 0.09 : 0.06));
      const wick = oppOf(bt, f) && passOf(oppOf(bt, f)).some(p => p.id === 'wickburn');
      if (wick) n *= 2;
      damageFighter(bt, f, n); bt.say(f.name + ' burns for ' + n + '.', 'bad');
    } else if (f.status === 'poison') {
      f.statusTurns++;
      let rate = Math.min(0.15, 0.05 + 0.02 * (f.statusTurns - 1)) * (f.poisonScale || 1);
      if (f.timers.venomBloom > 0) rate *= 2;
      const n = Math.round(f.maxhp * rate);
      damageFighter(bt, f, n); bt.say(f.name + ' is eaten from within for ' + n + '.', 'bad');
    }
    if (f.marks.root > 0) f.marks.root--;
    if (f.marks.bleed > 0) { const n = Math.round(f.maxhp * 0.07); damageFighter(bt, f, n); bt.say(f.name + ' bleeds for ' + n + '.', 'bad'); f.marks.bleed--; }
    if (f.marks.smolder > 0) { const n = Math.round(f.maxhp * 0.03 * f.marks.smolder); damageFighter(bt, f, n); bt.say(f.name + ' smoulders for ' + n + '.', 'bad'); }
    if (f.timers.seedbank === 1) { healFighter(bt, f, Math.round(f.maxhp * 0.6)); bt.say('The seed bursts open.', 'good'); }
    hookRun(bt, f, 'onTurnEnd');
    /* focus, cooldowns, timers */
    f.focus = Math.min(f.focusMax, f.focus + 1 + hookSum(bt, f, 'focusRegen') + (f.timers.overclock > 0 ? 1 : 0));
    for (const k in f.cds) if (f.cds[k] > 0) f.cds[k]--;
    for (const k in f.timers) if (f.timers[k] > 0) f.timers[k]--;
    f.justSwitchedIn = false;
    f.tookHitThisTurn = false;
  }
  if (bt.field && --bt.fieldTurns <= 0) { bt.say(FIELDS[bt.field].name + ' fades.', 'sys'); bt.field = null; }
  refreshSpeed(bt);
}

function checkFaints(bt) {
  for (const side of [bt.you, bt.foe]) {
    const f = active(side);
    if (f && f.hp <= 0 && !f.down) {
      f.down = true;
      hookRun(bt, f, 'onFaint');
      bt.say(f.name + ' is unbound.', side.player ? 'bad' : 'good');
      const winner = active(oppSide(bt, f));
      if (winner && !isDown(winner)) hookRun(bt, winner, 'onKO');
    }
  }
  for (const side of [bt.you, bt.foe]) {
    if (side.party.every(isDown)) { bt.over = true; bt.result = side.player ? 'lost' : 'won'; return; }
  }
  const foeF = active(bt.foe);
  if (isDown(foeF)) { const nxt = bt.foe.party.findIndex(f => !isDown(f)); if (nxt >= 0) { bt.foe.idx = nxt; active(bt.foe).justSwitchedIn = true; bt.say(active(bt.foe).name + ' takes the field.', 'sys'); hookRun(bt, active(bt.foe), 'onEnter'); } }
  const youF = active(bt.you);
  if (isDown(youF) && !bt.over) bt.pending = 'replace';
}

function resolveTurn(bt, playerAction) {
  if (bt.over) return;
  bt.turn++;
  bt.hits = [];
  refreshSpeed(bt);
  const foeAction = aiChoose(bt);
  const entries = [
    { side: bt.you, act: playerAction, f: active(bt.you) },
    { side: bt.foe, act: foeAction, f: active(bt.foe) },
  ].filter(e => e.act && e.f);
  entries.sort((a, b) => {
    const pa = actionPriority(bt, a.f, a.act), pb = actionPriority(bt, b.f, b.act);
    if (pa !== pb) return pb - pa;
    if (a.f.spd !== b.f.spd) return b.f.spd - a.f.spd;
    return chance(0.5) ? -1 : 1;
  });
  for (const e of entries) {
    if (bt.over) break;
    if (isDown(active(e.side))) continue;
    performAction(bt, e.side, e.act);
    checkFaints(bt);
    if (bt.over || bt.pending) break;
  }
  if (!bt.over && !bt.pending) { endOfTurn(bt); checkFaints(bt); }
  return bt;
}

/* ---------------- the foe's judgement ----------------------------------- */
function estimate(bt, atk, def, move) {
  if (move.c === 'stat') {
    let v = 12;
    if (move.st && !def.status) v += 34 * move.st[1];
    if (move.foe) v += 16 * Object.values(move.foe).reduce((n, x) => n + Math.abs(x), 0);
    if (move.self) v += 13 * Object.values(move.self).reduce((n, x) => n + x, 0);
    if (move.heal) v += (1 - def.hp / def.maxhp) * 5 + (atk.maxhp - atk.hp) / atk.maxhp * 55;
    if (move.fld && bt.field !== move.fld) v += 10;
    return v * (0.85 + rnd() * 0.3);
  }
  const r = calcDamage(bt, atk, def, move, false);
  let v = Math.min(r.dmg, def.hp) / def.maxhp * 100;
  if (r.dmg >= def.hp) v += 60;
  if (move.hits) v *= (move.hits[0] + move.hits[1]) / 2;
  if (move.st && !def.status) v += 18 * move.st[1];
  if (move.drain) v += r.dmg * move.drain / atk.maxhp * 30;
  if (move.recoil) v -= r.dmg * move.recoil / atk.maxhp * 25;
  v *= (move.a ? clamp(move.a / 100, 0.5, 1) : 1.05);
  return v * (0.88 + rnd() * 0.24);
}
function aiChoose(bt) {
  const f = active(bt.foe), foe = active(bt.you);
  if (!f || isDown(f) || !foe) return null;

  /* wardens rotate out of a losing matchup */
  if (bt.warden && f.hp < f.maxhp * 0.32 && !f.marks.root) {
    const bench = bt.foe.party.map((k, i) => ({ k, i })).filter(x => !isDown(x.k) && x.i !== bt.foe.idx);
    if (bench.length && chance(0.45)) {
      const best = bench.map(x => {
        const off = Math.max(...x.k.moves.map(m => MOVES[m] ? typeMult(MOVES[m].t, foe.types) : 1));
        const def = Math.max(...foe.moves.map(m => MOVES[m] ? typeMult(MOVES[m].t, x.k.types) : 1));
        return { i: x.i, score: off - def };
      }).sort((a, b) => b.score - a.score)[0];
      if (best.score > 0.6) return { type: 'switch', idx: best.i };
    }
  }
  /* abilities, when they are worth the Focus */
  const usable = f.abil.filter(id => { const a = ABILITIES[id]; return a && f.focus >= a.cost && !(f.cds['@' + id] > 0); });
  if (usable.length && chance(bt.warden ? 0.42 : 0.22)) {
    const id = pick(usable), a = ABILITIES[id];
    const healy = /mends|heal/i.test(a.d);
    if (!healy || f.hp < f.maxhp * 0.6) return { type: 'ability', id };
  }
  const ready = f.moves.filter(id => MOVES[id] && !(f.cds[id] > 0));
  const pool = ready.length ? ready : ['rend'];
  const scored = pool.map(id => ({ id, v: estimate(bt, f, foe, MOVES[id]) })).sort((a, b) => b.v - a.v);
  const top = bt.warden ? scored[0] : (chance(0.78) ? scored[0] : pick(scored.slice(0, Math.min(3, scored.length))));
  return { type: 'move', id: top.id };
}
