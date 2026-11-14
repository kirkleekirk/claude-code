// Jobs: contract board (tip-offs), raid targets & planning, delegation (abstract resolution),
// ruin scavenging loot, robbery aftermath, occupation and holds.
import { CONTRACTS, CONTRACT } from '../data/contracts.js';
import { PLACE, PLACES, SETTLEMENT_IDS, RUINS, CAMPS } from '../data/places.js';
import { LOOT_ITEMS, compKey } from '../data/items.js';
import { BLUEPRINTS, COMP_IDS } from '../data/guns.js';
import { rnd, rint, rchance, rpick, rweighted } from '../core/rng.js';
import { log, fx, stat, earn, spend, addRep, rank, D, hasPerk, nextId, journal, makeGun } from './state.js';
import { addHeat, recalcNotoriety } from './heat.js';
import { addItem, takeItem, count } from './inventory.js';
import { active, crewById, combatPower, effSkill, injure, killCrew, shortName, onJob, genRecruit } from './crew.js';
import { rivalPower, bossDefeated } from './rivals.js';
import { tradeAllowed } from './economy.js';

export const RAID_RANK = { millbrook: 0, coppergate: 1, harbor9: 2, stverity: 3, foundry: 3, newhaven: 9 };
export const TOWN_GUARDS = (S, t) => (PLACE[t].guards || 6) * (S.towns[t].status === 'alarmed' ? 1.5 : 1) + (S.heat[t] >= 20 ? 2 : 0);
const VAULT_ITEMS = {
  millbrook: { foodsack: 3, 'seed:ashleaf': 3, grain: 6 }, coppergate: { brass: 8, iron: 6, jewelry: 1 }, harbor9: { polymer: 5, electronics: 2, fuel: 6 },
  stverity: { relic: 2, jewelry: 2, meds: 2 }, foundry: { steel: 8, alloy: 2, spring: 4 }, newhaven: { electronics: 4, jewelry: 3, alloy: 3 },
};

// ---------- contract board ----------
function pickTarget(S, tpl, hint = {}) {
  const t = tpl.target;
  if (t === 'town') {
    const opts = SETTLEMENT_IDS.filter((x) => S.visited[x] && tradeAllowed(S, x) && !PLACE[x].capital);
    const town = hint.town && opts.includes(hint.town) ? hint.town : opts.length ? rpick(S, opts) : 'millbrook';
    return { place: town, town };
  }
  if (t.startsWith('ruin:')) { const tier = +t.split(':')[1]; const opts = RUINS.filter((r) => r.tier <= tier && r.tier >= tier - 1); const r = rpick(S, opts); return { place: r.id, town: null }; }
  if (t === 'camp') { const rs = Object.values(S.rivals).filter((r) => r.alive && (!hint.rival || r.id === hint.rival)); if (!rs.length) return null; const r = rpick(S, rs); return { place: r.camp, rival: r.id }; }
  if (t === 'road') { const a = rpick(S, SETTLEMENT_IDS.filter((x) => !PLACE[x].capital)); let b = rpick(S, SETTLEMENT_IDS); if (a === b) b = 'crossroads'; return { place: 'road', from: a, to: b, rival: tpl.rival ? (hint.rival || (Object.values(S.rivals).find((r) => r.alive) || {}).id) : null }; }
  if (S.rivals[t]) return S.rivals[t].alive ? { place: S.rivals[t].camp, rival: t } : null;
  return { place: t, town: PLACE[t] && PLACE[t].kind === 'settlement' ? t : null };
}

export function addContract(S, tplId, hint = {}) {
  const tpl = CONTRACT[tplId];
  if (!tpl) return null;
  if (tpl.once && S.flags['contract_' + tplId]) return null;
  if (S.contracts.board.length >= 8) S.contracts.board.shift();
  const tg = pickTarget(S, tpl, hint);
  if (!tg) return null;
  const off = { cid: nextId(S), tpl: tplId, ...tg, reward: tpl.reward(S), expires: S.day + rint(S, 3, 5), diff: tpl.diff };
  if (tpl.rival && !off.rival) { const r = Object.values(S.rivals).find((x) => x.alive); if (!r) return null; off.rival = r.id; }
  S.contracts.board.push(off);
  return off;
}

export function contractsDaily(S) {
  S.contracts.board = S.contracts.board.filter((o) => o.expires >= S.day);
  const r = rank(S);
  const tips = S.tips.splice(0, S.tips.length);
  const pool = CONTRACTS.filter((c) => c.rank <= r && !(c.once && S.flags['contract_' + c.id]) && !(c.rival && !Object.values(S.rivals).some((x) => x.alive)) && !(c.id === 'liberate_town' && r < 4));
  const n = Math.min(3, 1 + tips.length) + (S.contracts.board.length < 2 ? 1 : 0);
  for (let i = 0; i < n && pool.length; i++) {
    const tip = tips[i];
    const tpl = rweighted(S, pool, (c) => 1 + (tip && c.target === 'town' ? 1 : 0) + (c.rank === r ? 0.5 : 0));
    addContract(S, tpl.id, tip ? { town: tip.town } : {});
  }
}

export function placeLabel(S, o) {
  if (o.place === 'road') return `the road (${PLACE[o.from].name} - ${PLACE[o.to].name})`;
  return PLACE[o.place] ? PLACE[o.place].name : o.place;
}

export function contractText(S, o) {
  const tpl = CONTRACT[o.tpl];
  return tpl.text.replace(/\{place\}/g, placeLabel(S, o)).replace(/\{rival\}/g, o.rival ? S.rivals[o.rival].name : 'a rival');
}

export function needMet(S, o) {
  const need = CONTRACT[o.tpl].need;
  if (!need) return true;
  if (need.guns && S.guns.filter((g) => !S.player.loadout.includes(g.id) && !S.crew.some((c) => c.gun === g.id)).length < need.guns) return false;
  if (need.bricks && Object.keys(S.inv).filter((k) => k.endsWith(':brick')).reduce((a, k) => a + count(S, k), 0) < need.bricks) return false;
  return true;
}

function payNeed(S, o) {
  const need = CONTRACT[o.tpl].need;
  if (!need) return;
  if (need.guns) { const gs = S.guns.filter((g) => !S.player.loadout.includes(g.id) && !S.crew.some((c) => c.gun === g.id)).slice(0, need.guns); for (const g of gs) S.guns.splice(S.guns.indexOf(g), 1); }
  if (need.bricks) { let n = need.bricks; for (const k of Object.keys(S.inv).filter((x) => x.endsWith(':brick'))) { while (n > 0 && takeItem(S, k, 1)) n--; } }
}

// ---------- delegation ----------
export function jobDifficulty(S, o) {
  const diff = o.diff || 3;
  let d = diff * 7 * D(S).enemy;
  if (o.town && S.towns[o.town]) d *= S.towns[o.town].status === 'alarmed' ? 1.4 : 1;
  if (o.rival && S.rivals[o.rival]) d *= 0.7 + rivalPower(S, S.rivals[o.rival]) / 60;
  if (o.town && !o.rival) d *= 1 + (S.arms.compact || 0) / 600;
  return d;
}

export function delegateChance(S, o, ids, extra = {}) {
  const crew = ids.map((id) => crewById(S, id)).filter(Boolean);
  if (!crew.length && !extra.withPlayer) return 0;
  const tpl = CONTRACT[o.tpl] || { skills: ['gunplay'] };
  let power = crew.reduce((a, c) => a + combatPower(S, c) * 0.6 + tpl.skills.reduce((s, sk) => s + effSkill(c, sk), 0) * 1.6, 0);
  power += (extra.recon || 0) * 6 + (extra.inside ? 18 : 0) + (extra.vehicle ? 6 : 0) + (extra.withPlayer ? 16 + S.level * 2.2 : 0);
  if (crew.some((c) => c.traits.includes('lucky'))) power *= 1.08;
  const d = jobDifficulty(S, o);
  return Math.max(0.05, Math.min(0.94, 0.25 + 0.5 * (power - d) / Math.max(10, d) + 0.25));
}

export function delegate(S, cid, ids, opts = {}) {
  const i = S.contracts.board.findIndex((o) => o.cid === cid);
  if (i < 0) return { ok: false, msg: 'Job is gone.' };
  const o = S.contracts.board[i];
  if (!ids.length && !opts.withPlayer) return { ok: false, msg: 'Pick at least one crew member.' };
  if (!needMet(S, o)) return { ok: false, msg: 'You don\'t have what this job needs.' };
  if (ids.some((id) => { const c = crewById(S, id); return !c || c.injured > 0 || c.onMission; })) return { ok: false, msg: 'Someone picked is unavailable.' };
  const p = delegateChance(S, o, ids, { withPlayer: !!opts.withPlayer });
  payNeed(S, o);
  S.contracts.board.splice(i, 1);
  const tpl = CONTRACT[o.tpl];
  for (const id of ids) crewById(S, id).onMission = o.cid;
  S.contracts.active.push({ ...o, crew: ids, p, eta: S.total + tpl.hours * 60, mode: 'delegated', withPlayer: !!opts.withPlayer });
  stat(S, 'delegated');
  return { ok: true, msg: `${ids.length} crew sent on "${tpl.name}" (${Math.round(p * 100)}% odds). Back in ${tpl.hours}h.` };
}

export function jobsHour(S) {
  for (const j of [...S.contracts.active]) {
    if (j.mode !== 'delegated' || S.total < j.eta) continue;
    S.contracts.active = S.contracts.active.filter((x) => x !== j);
    const ok = rchance(S, j.p);
    for (const id of j.crew) { const c = crewById(S, id); if (c) c.onMission = null; }
    finishContract(S, j, ok, { delegated: !j.withPlayer });
  }
}

// Shared by delegated jobs and played missions.
export function finishContract(S, o, success, opts = {}) {
  const tpl = CONTRACT[o.tpl];
  const crew = (o.crew || []).map((id) => crewById(S, id)).filter(Boolean);
  const where = o.town || o.place;
  if (success) {
    const r = o.reward;
    const mult = opts.delegated ? 0.85 : 1;
    if (r.dirty) earn(S, opts.delegated ? 'dirty' : 'carried', r.dirty * mult, 'jobs');
    if (r.items) for (const [k, n] of Object.entries(r.items)) addItem(S, k, Math.max(1, Math.round(n * mult)));
    if (r.favors) S.favors += r.favors;
    if (r.rep) addRep(S, r.rep * (0.8 + 0.3 * rank(S)), tpl.name, 'contracts');
    if (r.heatCut && o.town) S.heat[o.town] = Math.max(0, S.heat[o.town] - r.heatCut);
    if (r.heatCutAll) for (const t of SETTLEMENT_IDS) S.heat[t] = Math.max(0, S.heat[t] - r.heatCutAll);
    if (r.rivalStr && o.rival) S.rivals[o.rival].strength = Math.max(4, S.rivals[o.rival].strength + r.rivalStr);
    if (r.rivalAtt && o.rival) S.rivals[o.rival].attitude = Math.max(-100, S.rivals[o.rival].attitude + r.rivalAtt);
    if (r.rivalWealth && o.rival) S.rivals[o.rival].wealth = Math.max(0, S.rivals[o.rival].wealth + r.rivalWealth);
    if (r.goodwillHit) S.goodwill = Math.max(0, S.goodwill - r.goodwillHit);
    if (r.recruit) { const t = o.town || 'crossroads'; const rc = genRecruit(S, t); rc.loyalty = 80; rc.special = 'rescued'; rc.wage = Math.round(rc.wage * 0.8); (S.candidates[t] = S.candidates[t] || []).push(rc); S.visited[t] = true; log(S, `${rc.first} ${rc.last} owes you their freedom. They're waiting at the ${PLACE[t].name} tavern (free to hire).`, 'good'); }
    if (r.veil) { addItem(S, 'seed:widows_veil', 3); S.strains.known.widows_veil = true; stat(S, 'veil'); }
    if (r.randomGun) for (let i = 0; i < r.randomGun; i++) lootGun(S, 2 + rint(S, 0, 1));
    if (r.devastate && o.town) { S.towns[o.town].devast = Math.min(100, S.towns[o.town].devast + r.devastate); townStatus(S, o.town); }
    if (r.occupyReady && o.town) S.towns[o.town].occupyReady = true;
    if (r.blightImmune) S.flags.blightImmune = S.day + r.blightImmune;
    if (tpl.heat) addHeat(S, where, tpl.heat * (opts.stealthy ? 0.5 : 1), tpl.name);
    for (const c of crew) { c.gxp = (c.gxp || 0) + 10 + tpl.diff * 3; while (c.gxp >= 30 + c.level * 20) { c.gxp -= 30 + c.level * 20; c.level++; c.skills.gunplay = Math.min(10, c.skills.gunplay + 1); log(S, `${shortName(c)} reached level ${c.level}.`, 'good'); } c.morale = Math.min(100, c.morale + 6); }
    if (tpl.once) S.flags['contract_' + tpl.id] = true;
    stat(S, 'contractsDone');
    if (tpl.kind === 'convoy') stat(S, 'convoys');
    log(S, `JOB DONE: ${tpl.name}${opts.delegated ? ' (crew)' : ''}. ${r.dirty ? '$' + Math.round(r.dirty * mult) + ' ' : ''}+${r.rep || 0} REP.`, 'good');
  } else {
    if (tpl.heat) addHeat(S, where, tpl.heat * 0.6 + 4, tpl.name + ' (botched)');
    for (const c of crew) {
      const roll = rnd(S);
      if (roll < 0.08 + tpl.diff * 0.012 && !c.traits.includes('lucky')) killCrew(S, c, `died on the "${tpl.name}" job`);
      else if (roll < 0.45) injure(S, c, rint(S, 2, 4));
      c.morale = Math.max(0, c.morale - 8);
    }
    stat(S, 'contractsFailed');
    log(S, `JOB FAILED: ${tpl.name}.`, 'bad');
  }
  fx(S, 'job', { ok: success, name: tpl.name });
}

function lootGun(S, tierBias) {
  const opts = BLUEPRINTS.filter((b) => b.bench <= tierBias + 1);
  const bp = rpick(S, opts);
  const mats = ['scrap', 'iron', 'iron', 'steel'];
  const comps = {};
  for (const t of COMP_IDS) comps[t] = [rpick(S, mats.slice(0, 1 + tierBias)), rint(S, 2, 4)];
  makeGun(S, bp.id, comps, rpick(S, ['common', 'common', 'fine']), false, {});
}

// ---------- ruins & containers ----------
export function containerLoot(S, placeId, tier = 1, opts = {}) {
  const items = {};
  const add = (k, n) => { if (n > 0) items[k] = (items[k] || 0) + n; };
  if (placeId === 'ruin_motel' && !S.flags.motelParts) {
    S.flags.motelParts = true;
    for (const t of COMP_IDS) add(compKey(t, 'scrap', 3), 1);
    add('scrap', 6); add('ammo:light', 10);
    return { items, cash: 15 };
  }
  add('scrap', rint(S, 2, 5) + tier);
  if (rchance(S, 0.5)) add('timber', rint(S, 1, 3));
  if (rchance(S, 0.3 + tier * 0.1)) add('spring', rint(S, 1, 2));
  if (rchance(S, 0.3 + tier * 0.1)) add('brass', rint(S, 1, 4));
  if (tier >= 2 && rchance(S, 0.4)) add('propellant', rint(S, 1, 3));
  if (tier >= 2 && rchance(S, 0.35)) add('polymer', rint(S, 1, 2));
  if (tier >= 2 && rchance(S, 0.25)) add(rpick(S, ['electronics', 'meds', 'jewelry']), 1);
  if (tier >= 3 && rchance(S, 0.4)) add('steel', rint(S, 1, 3));
  if (tier >= 3 && rchance(S, 0.3)) add('relic', 1);
  if (tier >= 4 && rchance(S, 0.6)) add('alloy', rint(S, 1, 3));
  if (rchance(S, 0.25)) add(compKey(rpick(S, COMP_IDS), tier >= 3 ? 'steel' : tier >= 2 ? 'iron' : 'scrap', rint(S, 2, 4)), 1);
  if (rchance(S, 0.35)) add(rpick(S, ['ammo:light', 'ammo:medium', 'ammo:shell']), rint(S, 6, 16));
  if (rchance(S, 0.12 + tier * 0.05)) add('documents', 1);
  return { items, cash: rint(S, 5, 30) * tier };
}

export function ruinReady(S, id) { return !S.flags['ruin_' + id] || S.day - S.flags['ruin_' + id] >= 3; }

export function scavengeAbstract(S, ruinId, ids = []) {
  const ruin = PLACE[ruinId];
  if (!ruinReady(S, ruinId)) return { ok: false, msg: 'Already stripped. Give it a few days.' };
  const crew = ids.map((id) => crewById(S, id)).filter(Boolean);
  const power = crew.reduce((a, c) => a + combatPower(S, c) + effSkill(c, 'salvage') * 2, 0) + (ids.length ? 0 : 14);
  const p = Math.max(0.15, Math.min(0.95, 0.4 + (power - ruin.tier * 9) / 40));
  S.flags['ruin_' + ruinId] = S.day;
  if (!rchance(S, p)) {
    for (const c of crew) if (rchance(S, 0.4)) injure(S, c, rint(S, 1, 3));
    return { ok: false, msg: `The scavenging run at ${ruin.name} went wrong.` };
  }
  let n = 0;
  for (let k = 0; k < 2 + ruin.tier; k++) { const L = containerLoot(S, ruinId, ruin.tier); for (const [key, q] of Object.entries(L.items)) { addItem(S, key, q); n += q; } earn(S, 'dirty', L.cash, 'scavenging'); }
  stat(S, 'scavenges');
  addRep(S, 1 + ruin.tier * 2, null, 'scavenge');
  if (ruinId === 'ruin_motel') S.tutorial.flags.ruinLooted = true;
  return { ok: true, msg: `Scavenged ${ruin.name}: ${n} items.` };
}

// ---------- settlement vault raids ----------
export function raidTargets(S) {
  const out = [];
  for (const t of SETTLEMENT_IDS) {
    const T = S.towns[t];
    const need = RAID_RANK[t];
    out.push({ id: t, place: t, name: `${PLACE[t].hq.name} (${PLACE[t].name})`, kind: 'vault', locked: rank(S) < need ? (t === 'newhaven' ? 'Endgame only' : `Needs rank ${need}`) : T.lootReady < 0.3 ? 'Recovering from the last hit' : null, loot: vaultLoot(S, t, true) });
  }
  for (const c of CAMPS) {
    const r = Object.values(S.rivals).find((x) => x.camp === c.id);
    out.push({ id: c.id, place: c.id, name: `${c.name} (${r.name})`, kind: 'camp', rival: r.id, locked: !r.alive ? 'Destroyed' : rank(S) < 3 && r.stance !== 'war' ? 'Boss rank or war' : r.stance === 'alliance' ? 'Allied' : null, loot: { dirty: Math.round(r.wealth * 0.6 + 400), items: {} } });
  }
  return out;
}

export function vaultLoot(S, town, estimate = false) {
  const T = S.towns[town];
  const cash = PLACE[town].wealth * (6 + 6 * rank(S)) * (estimate ? Math.max(0.3, T.lootReady) : T.lootReady);
  return { dirty: Math.round(cash), items: { ...VAULT_ITEMS[town] } };
}

export const reconCost = (S, place) => Math.round((60 + (PLACE[place].wealth || 80) * 0.8) * D(S).cost);
export function buyRecon(S, place) {
  if ((S.recon[place] || 0) >= 3) return { ok: false, msg: 'You know everything a lookout can tell you.' };
  const c = reconCost(S, place);
  if (!spend(S, 'dirty', c, 'recon')) return { ok: false, msg: `Lookouts want $${c}.` };
  S.recon[place] = (S.recon[place] || 0) + 1;
  S.reconDay = S.reconDay || {};
  S.reconDay[place] = S.day;
  return { ok: true, msg: `Recon on ${PLACE[place].name}: ${['', 'guard count', 'patrol routes', 'vault layout'][S.recon[place]]} known.` };
}
export const insideCost = (S, place) => Math.round(vaultLoot(S, place, true).dirty * 0.15 + 120);

export function newPlan(S, target) {
  return { target, approach: 'stealth', crew: [], timing: 'night', vehicle: null, inside: false, recon: (S.recon[target] || 0) + (hasPerk(S, 'fx_inside') ? 1 : 0) };
}

export function raidChance(S, plan) {
  const t = plan.target;
  const isCamp = !S.towns[t];
  const o = isCamp ? { diff: 7, rival: Object.values(S.rivals).find((r) => r.camp === t).id, tpl: null } : { diff: Math.round(TOWN_GUARDS(S, t) / 2) + 1, town: t, tpl: null };
  const crew = plan.crew.map((id) => crewById(S, id)).filter(Boolean);
  let power = crew.reduce((a, c) => a + combatPower(S, c) + (plan.approach === 'stealth' ? effSkill(c, 'stealth') * 2 : effSkill(c, 'gunplay') * 1.2), 0);
  power += plan.recon * 7 + (plan.inside ? 18 : 0) + (plan.vehicle ? 8 : 0) + (plan.timing === 'night' && plan.approach === 'stealth' ? 10 : 0);
  if (plan.approach === 'assault') power *= 1.1;
  let d = (o.diff || 4) * 8 * D(S).enemy;
  if (isCamp) d *= 0.6 + rivalPower(S, S.rivals[o.rival]) / 50;
  else d *= 1 + (S.arms.compact || 0) / 600;
  return Math.max(0.05, Math.min(0.92, 0.5 + 0.5 * (power - d) / Math.max(10, d)));
}

export function payPlanCosts(S, plan) {
  if (plan.inside && !spend(S, 'dirty', insideCost(S, plan.target), 'bribes')) return 'Not enough cash for the inside man.';
  return null;
}

// Abstract raid (delegated or headless bot). Same aftermath as a played raid.
export function resolveRaid(S, plan) {
  const why = payPlanCosts(S, plan);
  if (why) return { ok: false, msg: why };
  const p = raidChance(S, plan);
  const ok = rchance(S, p);
  const crew = plan.crew.map((id) => crewById(S, id)).filter(Boolean);
  const isCamp = !S.towns[plan.target];
  if (ok) {
    if (isCamp) campHit(S, plan.target, plan.approach === 'assault' && rchance(S, 0.45), 0.85);
    else { const L = vaultLoot(S, plan.target); earn(S, 'dirty', L.dirty * 0.85, 'raids'); for (const [k, n] of Object.entries(L.items)) addItem(S, k, n); raidAftermath(S, plan.target, plan.approach); }
  } else {
    addHeat(S, plan.target, 14, 'botched raid');
    for (const c of crew) { if (rchance(S, 0.12)) killCrew(S, c, 'died in a botched raid'); else if (rchance(S, 0.5)) injure(S, c, rint(S, 2, 5)); }
  }
  stat(S, ok ? 'raidsWon' : 'raidsLost');
  for (const c of crew) c.morale = Math.max(0, Math.min(100, c.morale + (ok ? 8 : -10)));
  return { ok, msg: ok ? 'The raid was a success.' : 'The raid failed.' };
}

export function raidAftermath(S, town, approach = 'stealth', kills = 0) {
  const T = S.towns[town];
  T.status = 'alarmed';
  T.alarm = 4;
  T.devast = Math.min(100, T.devast + (approach === 'assault' ? 35 : 22));
  T.lootReady = 0;
  T.lastHit = S.day;
  T.hits++;
  addHeat(S, town, 25 + kills * 8, 'vault robbery');
  addRep(S, (8 + PLACE[town].wealth / 6) * (1 + 0.3 * rank(S)), `${PLACE[town].hq.name} robbed`, 'raids');
  if (approach === 'assault') T.occupyReady = true;
  townStatus(S, town);
  stat(S, 'vaults');
  if (town === 'millbrook') S.tutorial.flags.robbed = true;
  journal(S, `Robbed the ${PLACE[town].hq.name} in ${PLACE[town].name} (day ${S.day}).`);
}

export function campHit(S, camp, bossKilled, mult = 1) {
  const r = Object.values(S.rivals).find((x) => x.camp === camp);
  const cash = Math.round((r.wealth * 0.6 + 400) * mult);
  earn(S, 'dirty', cash, 'raids');
  r.wealth = Math.max(0, r.wealth - cash);
  r.strength = Math.max(4, Math.round(r.strength * 0.6));
  r.attitude = Math.max(-100, r.attitude - 30);
  if (r.stance !== 'war') r.stance = 'war';
  addRep(S, 60, `${r.name} camp hit`, 'raids');
  stat(S, 'campsHit');
  if (bossKilled) bossDefeated(S, r.id);
}

export function townStatus(S, t) {
  const T = S.towns[t];
  if (T.devast >= 60 && T.status !== 'devastated') { T.status = 'devastated'; T.wealth = Math.round(T.wealth * 0.8); log(S, `${PLACE[t].name} is DEVASTATED. Its market has collapsed.`, 'bad'); stat(S, 'devastated'); }
}

export function townsDaily(S) {
  for (const t of SETTLEMENT_IDS) {
    const T = S.towns[t];
    T.lootReady = Math.min(1, T.lootReady + 0.2);
    T.devast = Math.max(0, T.devast - 3);
    if (T.alarm > 0) T.alarm--;
    if (T.status === 'alarmed' && T.alarm === 0) T.status = 'normal';
    if (T.status === 'devastated' && T.devast < 35) { T.status = 'normal'; log(S, `${PLACE[t].name} has recovered.`, 'info'); }
    T.wealth += (PLACE[t].wealth - T.wealth) * 0.03;
    if (S.reconDay && S.reconDay[t] && S.day - S.reconDay[t] > 6) { S.recon[t] = 0; delete S.reconDay[t]; }
    // Political control: fronts + racket + low heat + goodwill.
    const fronts = S.businesses.filter((b) => b.town === t).length;
    T.controlled = !T.occupied && fronts >= 2 && !!S.protection[t] && S.heat[t] < 40 && S.goodwill >= 50;
  }
  occupationDaily(S);
}

// ---------- occupation ----------
export function canOccupy(S, t) {
  const T = S.towns[t];
  if (rank(S) < 4) return 'Occupation unlocks at Warlord.';
  if (PLACE[t].capital) return 'New Haven cannot be occupied.';
  if (T.occupied) return 'Already yours.';
  if (!(T.occupyReady || T.status === 'devastated')) return 'Break the garrison first (assault raid or "Break the Garrison" job).';
  if (onJob(S, 'garrison', t).length < 2) return 'Assign at least 2 garrison crew to this town.';
  return null;
}

export function occupy(S, t) {
  const why = canOccupy(S, t);
  if (why) return { ok: false, msg: why };
  const T = S.towns[t];
  T.occupied = true;
  T.occupyReady = false;
  T.since = S.day;
  S.heat[t] = 0;
  S.goodwill = Math.max(0, S.goodwill - 10);
  addRep(S, 120, `${PLACE[t].name} occupied`, 'holds');
  stat(S, 'occupied');
  recalcNotoriety(S);
  journal(S, `Occupied ${PLACE[t].name} on day ${S.day}.`);
  log(S, `${PLACE[t].name} is yours. Weekly tribute will flow. Keep the garrison strong.`, 'rank');
  return { ok: true, msg: `${PLACE[t].name} occupied.` };
}

export function occupationDaily(S) {
  for (const t of SETTLEMENT_IDS) {
    const T = S.towns[t];
    if (!T.occupied) continue;
    const gar = onJob(S, 'garrison', t);
    { const amt = T.wealth * 8 * (1 + 0.2 * rank(S)); earn(S, 'dirty', amt, 'tribute'); stat(S, 'tributeTaken', amt); if (S.day % 7 === (T.since || 0) % 7) log(S, `${PLACE[t].name} paid $${Math.round(amt * 7)} in tribute this week.`, 'good'); }
    const rivalTurf = Math.max(0, ...Object.values(S.rivals).filter((r) => r.alive).map((r) => r.turf[t] || 0));
    const chance = 0.03 + S.notoriety / 100 * 0.05 + rivalTurf / 600;
    if (!rchance(S, chance)) continue;
    const attack = (18 + S.notoriety / 2 + rank(S) * 4) * D(S).enemy * (0.7 + rnd(S) * 0.6);
    const defend = gar.reduce((a, c) => a + combatPower(S, c), 0) + 10;
    if (defend >= attack) { addRep(S, 12, null, 'holds'); log(S, `Your garrison held ${PLACE[t].name} against a counter-attack.`, 'good'); stat(S, 'holdsDefended'); }
    else {
      T.occupied = false;
      for (const c of gar) { if (rchance(S, 0.2)) killCrew(S, c, `fell defending ${PLACE[t].name}`); else injure(S, c, rint(S, 2, 5)); c.job = 'idle'; }
      log(S, `You LOST ${PLACE[t].name}: the garrison was overrun.`, 'bad');
      stat(S, 'holdsLost');
    }
  }
}

export function holds(S) { return SETTLEMENT_IDS.filter((t) => S.towns[t].occupied || S.towns[t].controlled); }
export { PLACES };
