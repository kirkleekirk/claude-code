// Gun chain: Smelter -> Parts Lathe -> Ammo Press -> Assembly Bench. Worker queues, standing orders,
// auto-chaining, stat computation, grades, repair and study.
import { BP, BLUEPRINTS, MATERIALS, MATERIAL_IDS, COMPONENTS, COMP_IDS, GRADES, MODS, MOD_SLOTS, SLOTS_BY_BENCH, AMMO, AMMO_VARIANTS, THROWABLES, GADGETS, NOISE, FAMILIES } from '../data/guns.js';
import { compKey, ammoKey, itemInfo } from '../data/items.js';
import { rnd, rchance, rint } from '../core/rng.js';
import { count, addItem, takeItem, hasAll, takeAll, missing } from './inventory.js';
import { log, fx, stat, addRep, hasPerk, rank, nextId, makeGun } from './state.js';
import { onJob, effSkill, productivity } from './crew.js';
import { facCount } from './grow.js';
import { compMult } from './economy.js';

export const STATIONS = { smelter: { fac: 'smelter', job: 'smelter', skill: 'salvage', name: 'Smelter' }, lathe: { fac: 'lathe', job: 'machinist', skill: 'crafting', name: 'Parts Lathe' }, press: { fac: 'press', job: 'presser', skill: 'crafting', name: 'Ammo Press' }, bench: { fac: 'bench', job: 'gunsmith', skill: 'crafting', name: 'Assembly Bench' } };

// ---------- recipes ----------
export function orderInputs(S, o) {
  switch (o.kind) {
    case 'iron': return { scrap: 4, fuel: 1 };
    case 'steel': return { iron: 2, fuel: 1 };
    case 'comp': { const c = COMPONENTS[o.type], m = MATERIALS[o.mat]; return { [m.item]: c.ingots * m.per, ...c.extra }; }
    case 'ammo': return { ...AMMO[o.type].recipe, ...AMMO_VARIANTS[o.variant || 'std'].extra };
    case 'gadget': return { ...(THROWABLES[o.id] || GADGETS[o.id]).recipe };
    case 'mod': return { ...MODS[o.id].recipe };
    case 'repair': { const g = S.guns.find((x) => x.id === o.gun); return { scrap: g ? Math.max(1, Math.ceil((g.maxDur - g.dur) / 15)) : 1 }; }
    case 'shine': return { grain: 2, fuel: 1 };
    default: return {};
  }
}

export function orderHours(S, o) {
  switch (o.kind) {
    case 'iron': return 2;
    case 'steel': return 3;
    case 'comp': return COMPONENTS[o.type].hours;
    case 'ammo': return 1;
    case 'gun': return BP[o.bp].hours;
    case 'gadget': return 1;
    case 'mod': return 2;
    case 'repair': return 1;
    case 'study': return 2;
    default: return 1;
  }
}

export function orderLabel(S, o) {
  switch (o.kind) {
    case 'iron': return 'Smelt Iron (x2)';
    case 'steel': return 'Smelt Steel';
    case 'comp': return `${MATERIALS[o.mat].name} ${COMPONENTS[o.type].name}`;
    case 'ammo': return `${AMMO_VARIANTS[o.variant || 'std'].name ? AMMO_VARIANTS[o.variant].name + ' ' : ''}${AMMO[o.type].name} ammo x${AMMO[o.type].per}`;
    case 'gun': return `${BP[o.bp].name}${o.minGrade && o.minGrade !== 'junk' ? ' (' + GRADES.find((g) => g.id === o.minGrade).name + '+)' : ''}`;
    case 'gadget': return (THROWABLES[o.id] || GADGETS[o.id]).name;
    case 'mod': return 'Mod: ' + MODS[o.id].name;
    case 'repair': { const g = S.guns.find((x) => x.id === o.gun); return 'Repair ' + (g ? gunName(g) : 'gun'); }
    case 'study': { const g = S.guns.find((x) => x.id === o.gun); return 'Study ' + (g ? BP[g.bp].name : 'gun'); }
    default: return o.kind;
  }
}

export function stationOf(kind) {
  if (kind === 'iron' || kind === 'steel') return 'smelter';
  if (kind === 'comp') return 'lathe';
  if (kind === 'ammo') return 'press';
  return 'bench';
}

export function canOrder(S, o) {
  const st = stationOf(o.kind);
  if (!facCount(S, STATIONS[st].fac)) return `Build a ${STATIONS[st].name} first.`;
  const bench = S.hollow.bench;
  if (o.kind === 'steel' && bench < 2) return 'Steel smelting needs workshop tier II.';
  if (o.kind === 'comp' && MATERIALS[o.mat].bench > bench) return `${MATERIALS[o.mat].name} parts need Bench ${['', 'I', 'II', 'III', 'IV'][MATERIALS[o.mat].bench]}.`;
  if (o.kind === 'ammo' && (o.variant || 'std') !== 'std' && bench < 2) return 'Special ammo needs workshop tier II.';
  if (o.kind === 'gun') { if (!S.bps[o.bp]) return 'Blueprint unknown.'; if (BP[o.bp].bench > bench) return `Needs Bench ${['', 'I', 'II', 'III', 'IV'][BP[o.bp].bench]}.`; }
  if (o.kind === 'mod' && MODS[o.id].bench > bench) return `Needs Bench ${['', 'I', 'II', 'III', 'IV'][MODS[o.id].bench]}.`;
  return null;
}

export function enqueue(S, o) {
  const why = canOrder(S, o);
  if (why) return { ok: false, msg: why };
  const st = stationOf(o.kind);
  if (S.queues[st].length >= 12) return { ok: false, msg: 'Queue is full (12 orders).' };
  S.queues[st].push({ id: nextId(S), count: 1, done: 0, prog: 0, active: false, wait: '', ...o });
  return { ok: true, msg: `Queued: ${orderLabel(S, o)}${o.count > 1 ? ' x' + o.count : ''}` };
}

export function cancelOrder(S, st, id) {
  const q = S.queues[st];
  const i = q.findIndex((o) => o.id === id);
  if (i < 0) return;
  const o = q[i];
  if (o.active) refundUnit(S, o);
  q.splice(i, 1);
}

function refundUnit(S, o) {
  if (o.kind === 'gun' && o.res) { for (const k of o.res) addItem(S, k, 1); o.res = null; return; }
  if (o.kind === 'study' || o.kind === 'repair') return;
  for (const [k, n] of Object.entries(orderInputs(S, o))) addItem(S, k, n);
}

// ---------- component selection for assembly ----------
export function pickComponents(S, o) {
  const allowed = o.mat && o.mat !== 'best' ? [o.mat] : MATERIAL_IDS.filter((m) => MATERIALS[m].bench <= S.hollow.bench);
  const picks = {};
  for (const t of COMP_IDS) {
    let best = null;
    for (const k of Object.keys(S.inv)) {
      if (!k.startsWith('comp:' + t + ':')) continue;
      const [, , mat, stars] = k.split(':');
      if (!allowed.includes(mat)) continue;
      const score = MATERIALS[mat].mult * (1 + 0.08 * (+stars - 3));
      if (!best || score > best.score) best = { k, score };
    }
    if (best) picks[t] = best.k;
  }
  return picks;
}

function startUnit(S, o) {
  if (o.kind === 'gun') {
    const picks = pickComponents(S, o);
    const miss = COMP_IDS.filter((t) => !picks[t]);
    const modMiss = (o.mods || []).filter((m) => count(S, 'mod:' + m) < 1);
    if (miss.length || modMiss.length) {
      o.wait = miss.length ? 'needs ' + miss.map((t) => COMPONENTS[t].name).join(', ') : 'needs mods';
      if (S.autoChain && miss.length) chainComponents(S, o, miss);
      return false;
    }
    o.res = Object.values(picks);
    for (const k of o.res) takeItem(S, k, 1);
    for (const m of o.mods || []) takeItem(S, 'mod:' + m, 1);
    o.wait = '';
    return true;
  }
  if (o.kind === 'study') { const g = S.guns.find((x) => x.id === o.gun); if (!g) { o.done = o.count; return false; } return true; }
  const need = orderInputs(S, o);
  if (!hasAll(S, need)) {
    const m = missing(S, need);
    o.wait = 'needs ' + Object.entries(m).map(([k, n]) => `${n} ${itemInfo(k).name}`).join(', ');
    if (S.autoChain && o.kind === 'comp' && m.iron && facCount(S, 'smelter') && !S.queues.smelter.some((x) => x.kind === 'iron' && x.auto)) enqueue(S, { kind: 'iron', count: Math.ceil(m.iron / 2), auto: true });
    if (S.autoChain && o.kind === 'comp' && m.steel && facCount(S, 'smelter') && S.hollow.bench >= 2 && !S.queues.smelter.some((x) => x.kind === 'steel' && x.auto)) enqueue(S, { kind: 'steel', count: m.steel, auto: true });
    return false;
  }
  takeAll(S, need);
  o.wait = '';
  return true;
}

function chainComponents(S, o, miss) {
  for (const t of miss) {
    if (S.queues.lathe.some((x) => x.kind === 'comp' && x.type === t && x.auto)) continue;
    let mat = o.mat && o.mat !== 'best' ? o.mat : null;
    if (!mat) {
      const opts = MATERIAL_IDS.filter((m) => MATERIALS[m].bench <= S.hollow.bench).reverse();
      mat = opts.find((m) => count(S, MATERIALS[m].item) >= COMPONENTS[t].ingots * MATERIALS[m].per) || (S.hollow.bench >= 1 ? 'iron' : 'scrap');
      if (!count(S, 'iron') && count(S, 'scrap') >= COMPONENTS[t].ingots * 2) mat = 'scrap';
    }
    if (facCount(S, 'lathe')) enqueue(S, { kind: 'comp', type: t, mat, count: 1, auto: true });
  }
}

// ---------- completion ----------
function rollStars(S, skill) {
  let base = 2 + skill * 0.25 + (S.hollow.bench - 1) * 0.25 + (hasPerk(S, 'gun_smith') ? 0.5 : 0);
  return Math.max(1, Math.min(5, Math.round(base + (rnd(S) * 2 - 1))));
}

function finishUnit(S, o, worker) {
  const skill = worker ? effSkill(worker, STATIONS[stationOf(o.kind)].skill) : 3;
  switch (o.kind) {
    case 'iron': { const extra = rchance(S, Math.min(0.5, skill * 0.05)) ? 1 : 0; addItem(S, 'iron', 2 + extra); stat(S, 'smelted', 2 + extra); break; }
    case 'steel': addItem(S, 'steel', 1); stat(S, 'smelted', 1); break;
    case 'comp': { const s = rollStars(S, skill); addItem(S, compKey(o.type, o.mat, s), 1); stat(S, 'components'); break; }
    case 'ammo': addItem(S, ammoKey(o.type, o.variant || 'std'), AMMO[o.type].per + (skill >= 7 ? 2 : 0)); stat(S, 'ammoPressed', AMMO[o.type].per); break;
    case 'gadget': { const d = THROWABLES[o.id] || GADGETS[o.id]; addItem(S, o.id, d.makes || 1); break; }
    case 'mod': addItem(S, 'mod:' + o.id, 1); stat(S, 'modsMade'); break;
    case 'repair': { const g = S.guns.find((x) => x.id === o.gun); if (g) { g.dur = g.maxDur; log(S, `${gunName(g)} repaired.`, 'good'); } break; }
    case 'study': return studyGun(S, o, skill);
    case 'gun': return assembleGun(S, o, skill, worker);
    default: break;
  }
  return true;
}

function assembleGun(S, o, skill, worker) {
  const comps = {};
  for (const k of o.res) { const [, t, mat, stars] = k.split(':'); comps[t] = [mat, +stars]; }
  o.res = null;
  const avg = Object.values(comps).reduce((a, [, s]) => a + s, 0) / 5;
  let score = avg + (skill - 4) * 0.12 + (rnd(S) * 1.2 - 0.6) + (hasPerk(S, 'gun_smith') ? 0.3 : 0);
  let gi = score < 1.8 ? 0 : score < 2.9 ? 1 : score < 3.7 ? 2 : score < 4.5 ? 3 : 4;
  if (skill >= 8 && gi < 3 && rchance(S, (skill - 7) * 0.08)) gi = 3;
  const steady = worker && worker.traits.includes('steady_hands');
  const unreliable = !steady && skill <= 3 && rchance(S, Math.max(0.03, 0.3 - skill * 0.07));
  const mods = {};
  for (const m of o.mods || []) mods[MODS[m].slot] = m;
  const g = makeGun(S, o.bp, comps, GRADES[gi].id, unreliable, mods);
  stat(S, 'gunsCrafted');
  const first = !S.flags['crafted_' + o.bp];
  S.flags['crafted_' + o.bp] = true;
  addRep(S, first ? 6 : 1, first ? 'first ' + BP[o.bp].name : null, 'crafting');
  if (gi >= 3) stat(S, 'masterworks');
  if (gi === 4) stat(S, 'legendaryGuns');
  S.tutorial.flags.craftedGun = true;
  log(S, `Crafted: ${GRADES[gi].name} ${BP[o.bp].name}${unreliable ? ' [Unreliable]' : ''}`, gi >= 3 ? 'good' : 'info');
  fx(S, 'sfx', { name: 'craft' });
  const okGrade = !o.minGrade || gi >= GRADES.findIndex((x) => x.id === o.minGrade);
  return okGrade;
}

function studyGun(S, o, skill) {
  const i = S.guns.findIndex((x) => x.id === o.gun);
  if (i < 0) return true;
  const g = S.guns[i];
  S.guns.splice(i, 1);
  const chance = 0.6 + Math.max(0, skill - 5) * 0.08;
  let msg;
  if (!S.bps[g.bp] && rchance(S, chance)) { S.bps[g.bp] = true; stat(S, 'blueprints'); msg = `Studied the ${BP[g.bp].name}: blueprint learned!`; addRep(S, 10, 'blueprint', 'crafting'); }
  else msg = S.bps[g.bp] ? `Stripped the ${BP[g.bp].name} for parts.` : `Couldn't work out the ${BP[g.bp].name}. Salvaged parts.`;
  const parts = COMP_IDS.filter(() => rchance(S, 0.45));
  for (const t of parts) addItem(S, compKey(t, g.comps[t].mat, Math.max(1, g.comps[t].stars - 1)), 1);
  addItem(S, 'scrap', rint(S, 2, 5));
  log(S, msg, 'good');
  return true;
}

// ---------- hourly processing ----------
export function craftHour(S) {
  const chainSpeed = hasPerk(S, 'op_chain') ? 1 / 0.85 : 1;
  for (const [st, def] of Object.entries(STATIONS)) {
    const inst = facCount(S, def.fac);
    const q = S.queues[st];
    if (!inst || !q.length) continue;
    const workers = onJob(S, def.job).filter((c) => c.injured === 0).sort((a, b) => effSkill(b, def.skill) - effSkill(a, def.skill));
    let bossFree = true;
    let slot = 0;
    for (const o of q) {
      if (slot >= inst) break;
      if (o.done >= o.count) continue;
      const w = workers[slot] || null;
      if (!w && !bossFree) break;
      if (!o.active) { if (!startUnit(S, o)) continue; o.active = true; o.prog = 0; }
      slot++;
      if (!w) bossFree = false;
      const skill = w ? effSkill(w, def.skill) : 3;
      const rate = (w ? productivity(S, w) : 0.6) * chainSpeed;
      const need = orderHours(S, o) * (1 - 0.05 * skill);
      o.prog += rate;
      if (o.prog >= need) {
        o.active = false;
        o.prog = 0;
        const counts = finishUnit(S, o, w);
        if (counts !== false) o.done++;
      }
    }
    S.queues[st] = q.filter((o) => o.done < o.count);
  }
  standingOrders(S);
  stillHour(S);
}

function stillHour(S) {
  const n = facCount(S, 'still');
  if (!n) return;
  S.hollow.stillT = (S.hollow.stillT || 0) + 1;
  if (S.hollow.stillT < 6) return;
  S.hollow.stillT = 0;
  for (let k = 0; k < n; k++) if (takeAll(S, { grain: 2, fuel: 1 })) { addItem(S, 'shine', 3); stat(S, 'shineMade', 3); }
}

export function stockOf(S, so) {
  if (so.kind === 'gun') return S.guns.filter((g) => g.bp === so.bp && !S.player.loadout.includes(g.id) && !S.crew.some((c) => c.gun === g.id)).length;
  if (so.kind === 'ammo') return count(S, ammoKey(so.type, so.variant || 'std'));
  if (so.kind === 'comp') return Object.keys(S.inv).filter((k) => k.startsWith(`comp:${so.type}:${so.mat}:`)).reduce((a, k) => a + count(S, k), 0);
  if (so.kind === 'iron' || so.kind === 'steel') return count(S, so.kind);
  if (so.kind === 'gadget') return count(S, so.id);
  if (so.kind === 'mod') return count(S, 'mod:' + so.id);
  return 0;
}

function sameOrder(a, b) { return a.kind === b.kind && a.bp === b.bp && a.type === b.type && a.mat === b.mat && a.id === b.id && (a.variant || 'std') === (b.variant || 'std'); }

export function standingOrders(S) {
  for (const so of S.standing) {
    const st = stationOf(so.kind);
    const queued = S.queues[st].filter((o) => sameOrder(o, so)).reduce((a, o) => a + (o.count - o.done), 0);
    if (stockOf(S, so) + queued < so.keep) enqueue(S, { ...so, count: 1, keep: undefined, standing: true });
  }
}

export function addStanding(S, so) {
  if (S.standing.length >= 10) return { ok: false, msg: 'Max 10 standing orders.' };
  const why = canOrder(S, so);
  if (why) return { ok: false, msg: why };
  S.standing.push({ ...so, sid: nextId(S) });
  return { ok: true, msg: `Standing order: keep ${so.keep} x ${orderLabel(S, so)}` };
}

// ---------- gun stats ----------
export function gunName(g) { return g.name || `${GRADES.find((x) => x.id === g.grade).name} ${BP[g.bp].name}`; }

export function gunStats(S, g) {
  const bp = BP[g.bp];
  const m = {};
  for (const t of COMP_IDS) m[t] = compMult(g.comps[t]);
  const fx = { dmg: 1, acc: 1, range: 1, rpm: 1, mag: 1, reload: 1, noise: 1, recoil: 1, handling: 1, jam: 1, spread: 1, flash: 1, melee: 10, visible: 0 };
  for (const id of Object.values(g.mods || {})) {
    const md = MODS[id];
    if (!md) continue;
    for (const [k, v] of Object.entries(md.fx)) { if (k === 'melee') fx.melee = Math.max(fx.melee, v); else if (k === 'visible') fx.visible = 1; else fx[k] *= v; }
  }
  const gradeF = { junk: 0.92, common: 1, fine: 1.04, masterwork: 1.08, legendary: 1.12 }[g.grade];
  const perkAcc = S && hasPerk(S, 'gun_aim') ? 1.15 : 1;
  const durF = g.dur / g.maxDur;
  const st = {
    family: bp.family, ammo: bp.ammo, pellets: bp.pellets,
    dmg: bp.dmg * Math.sqrt(m.barrel * m.action) * fx.dmg * gradeF,
    acc: Math.min(99, bp.acc * m.barrel * fx.acc * gradeF * perkAcc),
    range: bp.range * m.barrel * fx.range,
    rpm: bp.rpm * m.action * fx.rpm,
    mag: Math.max(1, Math.round(bp.mag * m.mag * fx.mag)),
    reload: bp.reload / m.mag * fx.reload * (S && hasPerk(S, 'gun_reload') ? 0.75 : 1),
    noise: NOISE[bp.noise] * fx.noise,
    handling: FAMILIES[bp.family].handling * m.stock * fx.handling,
    recoil: (bp.dmg * bp.pellets / 40 + bp.rpm / 1200) / m.stock * fx.recoil,
    jam: 0.004 * (2.2 - m.action) * (g.unreliable ? 5 : 1) * fx.jam * (durF < 0.3 ? 3 : durF < 0.6 ? 1.6 : 1),
    spread: fx.spread, flash: fx.flash, melee: fx.melee, visible: fx.visible,
    wear: 100 / (500 * m.frame),
  };
  return st;
}

export function modSlotsFor(S) { return SLOTS_BY_BENCH[S.hollow.bench] || 1; }

export function canFit(S, g, modId) {
  const md = MODS[modId];
  const fam = BP[g.bp].family;
  if (md.only && !md.only.includes(fam)) return `${md.name} only fits ${md.only.join('/')}.`;
  if (md.not && md.not.includes(fam)) return `${md.name} does not fit a ${fam}.`;
  const used = Object.keys(g.mods || {}).filter((s) => s !== md.slot).length;
  if (!g.mods[md.slot] && used >= modSlotsFor(S)) return `Bench tier allows ${modSlotsFor(S)} mod slot(s).`;
  return null;
}

export function installMod(S, gunId, modId) {
  const g = S.guns.find((x) => x.id === gunId);
  if (!g) return { ok: false, msg: 'No gun.' };
  const why = canFit(S, g, modId);
  if (why) return { ok: false, msg: why };
  if (!takeItem(S, 'mod:' + modId, 1)) return { ok: false, msg: 'You have no such mod.' };
  const old = g.mods[MODS[modId].slot];
  if (old) addItem(S, 'mod:' + old, 1);
  g.mods[MODS[modId].slot] = modId;
  return { ok: true, msg: `${MODS[modId].name} fitted to ${gunName(g)}.` };
}

export function removeMod(S, gunId, slot) {
  const g = S.guns.find((x) => x.id === gunId);
  if (!g || !g.mods[slot]) return { ok: false, msg: 'Nothing fitted.' };
  addItem(S, 'mod:' + g.mods[slot], 1);
  delete g.mods[slot];
  return { ok: true, msg: 'Mod removed.' };
}

export function benchUpgradeCost(S) { const next = S.hollow.bench + 1; return next <= 4 ? [0, 0, 600, 1800, 5000][next] : null; }

export const BLUEPRINT_LIST = BLUEPRINTS;
export { MOD_SLOTS };
