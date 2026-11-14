// Building in the Hollow (6x6 grid), workshop tiers, Hollow upgrades, vehicles, Mags' safety-net loan.
import { FACILITIES, BENCH_UPGRADE, HOLLOW_UPGRADES, GRID_SIZE_BY_RANK, VEHICLES } from '../data/progress.js';
import { log, fx, stat, spend, earn, rank, D, addRep } from './state.js';
import { isPlot } from './grow.js';

export const cellUnlocked = (S, i) => { const n = Math.max(S.hollow.size, GRID_SIZE_BY_RANK[rank(S)]); return i % 6 < n && Math.floor(i / 6) < n; };
export const gridSize = (S) => Math.max(S.hollow.size, GRID_SIZE_BY_RANK[rank(S)]);
export const facCost = (S, f) => Math.round(FACILITIES[f].cost * D(S).cost);

export function build(S, i, f) {
  const F = FACILITIES[f];
  if (!F) return { ok: false, msg: 'Unknown facility.' };
  if (!cellUnlocked(S, i)) return { ok: false, msg: `Cell locked. The yard grows with rank (${gridSize(S)}x${gridSize(S)} now).` };
  if (S.hollow.cells[i]) return { ok: false, msg: 'Cell occupied. Demolish first.' };
  if (rank(S) < F.rank) return { ok: false, msg: `${F.name} needs rank ${F.rank}.` };
  const c = facCost(S, f);
  if (!spend(S, 'dirty', c, 'construction')) return { ok: false, msg: `${F.name} costs $${c}.` };
  S.hollow.cells[i] = f === 'plot' || f === 'growroom' ? { fac: f, plant: null } : { fac: f };
  stat(S, 'built');
  addRep(S, 2, null, 'building');
  fx(S, 'build', { i, f });
  return { ok: true, msg: `Built: ${F.name}.` };
}

export function demolish(S, i) {
  const c = S.hollow.cells[i];
  if (!c) return { ok: false, msg: 'Empty.' };
  if (c.fac === 'bench' && S.hollow.cells.filter((x) => x && x.fac === 'bench').length === 1 && (S.queues.bench.length)) return { ok: false, msg: 'Finish or cancel bench orders first.' };
  const refund = Math.round(FACILITIES[c.fac].cost * 0.4);
  S.hollow.cells[i] = null;
  earn(S, 'dirty', refund, 'construction');
  fx(S, 'build', { i, f: null });
  return { ok: true, msg: `Demolished (+$${refund} salvage).` };
}

export function benchUpgradeInfo(S) {
  const next = S.hollow.bench + 1;
  const u = BENCH_UPGRADE[next];
  if (!u) return null;
  return { tier: next, cost: Math.round(u.cost * D(S).cost), rank: u.rank };
}

export function upgradeBench(S) {
  const u = benchUpgradeInfo(S);
  if (!u) return { ok: false, msg: 'Workshop is at tier IV.' };
  if (rank(S) < u.rank) return { ok: false, msg: `Workshop tier ${u.tier} needs rank ${u.rank}.` };
  if (!spend(S, 'dirty', u.cost, 'construction')) return { ok: false, msg: `Costs $${u.cost}.` };
  S.hollow.bench = u.tier;
  log(S, `Workshop upgraded to tier ${['', 'I', 'II', 'III', 'IV'][u.tier]}: new blueprints, materials and mod slots.`, 'good');
  stat(S, 'benchUps');
  return { ok: true, msg: 'Workshop upgraded.' };
}

export function upgradeInfo(S, k) {
  const U = HOLLOW_UPGRADES[k];
  const lvl = S.hollow.up[k] || 0;
  if (lvl >= U.max) return null;
  return { lvl: lvl + 1, cost: Math.round(U.cost[lvl] * D(S).cost), rank: U.rank[lvl] };
}

export function buyHollowUpgrade(S, k) {
  const u = upgradeInfo(S, k);
  if (!u) return { ok: false, msg: 'Maxed.' };
  if (rank(S) < u.rank) return { ok: false, msg: `Needs rank ${u.rank}.` };
  if (!spend(S, 'dirty', u.cost, 'construction')) return { ok: false, msg: `Costs $${u.cost}.` };
  S.hollow.up[k] = u.lvl;
  log(S, `${HOLLOW_UPGRADES[k].name} upgraded to level ${u.lvl}.`, 'good');
  return { ok: true, msg: 'Upgraded.' };
}

export function buyVehicle(S, id) {
  const V = VEHICLES[id];
  if (S.vehicles.owned[id]) return { ok: false, msg: 'Already in the shed.' };
  if (rank(S) < V.rank) return { ok: false, msg: `${V.name} unlocks at rank ${V.rank}.` };
  const c = Math.round(V.price * D(S).cost);
  if (!spend(S, 'dirty', c, 'vehicles')) return { ok: false, msg: `${V.name} costs $${c}.` };
  S.vehicles.owned[id] = { hp: V.hp };
  S.vehicles.active = id;
  stat(S, 'vehicles');
  log(S, `New ride: ${V.name}. It waits in the Hollow vehicle shed.`, 'good');
  return { ok: true, msg: `${V.name} bought.` };
}

export const carryCap = (S) => 30 + (S.vehicles.active ? VEHICLES[S.vehicles.active].carry : 0);
export const travelSpeed = (S) => (S.vehicles.active ? VEHICLES[S.vehicles.active].speed : 1);

// Safety net: if you are broke with nothing to sell, Mags lends $200 at 20%.
export function brokeCheck(S) {
  const assets = S.money.dirty + S.money.carried + S.money.clean + Object.keys(S.inv).filter((k) => k.startsWith('pack:') || k.startsWith('bud:')).length * 40;
  const growing = S.hollow.cells.some((c) => isPlot(c) && c.plant && !c.plant.dead);
  const seeds = Object.keys(S.inv).some((k) => k.startsWith('seed:'));
  return assets < 40 && !growing && !S.money.debt && (!seeds || S.money.dirty + S.money.carried < 10);
}

export function takeMagsLoan(S) {
  if (S.money.debt > 0) return { ok: false, msg: 'Pay back the last one first, sweetheart.' };
  earn(S, 'dirty', 200, 'loans');
  S.money.debt = 240;
  S.money.debtDue = S.day + 7;
  stat(S, 'magsLoans');
  log(S, "Mags lent you $200. She wants $240 back within a week.", 'warn');
  return { ok: true, msg: 'Mags lends you $200 at 20%.' };
}

export function repayMags(S, amt) {
  amt = Math.min(amt, S.money.debt);
  if (!spend(S, 'dirty', amt, 'loans')) return { ok: false, msg: 'Not enough cash.' };
  S.money.debt -= amt;
  if (S.money.debt <= 0.5) { S.money.debt = 0; log(S, 'Debt to Mags cleared. She smiles, which is rare.', 'good'); }
  return { ok: true, msg: `Repaid $${Math.round(amt)}.` };
}

export function debtDaily(S) {
  if (S.money.debt <= 0 || S.day < S.money.debtDue) return;
  const paid = Math.min(S.money.debt, S.money.dirty + S.money.carried);
  if (paid > 0) repayMags(S, paid);
  if (S.money.debt > 0) { S.money.debt = Math.round(S.money.debt * 1.1); S.money.debtDue = S.day + 3; log(S, `Mags extended your loan: now $${S.money.debt}, due in 3 days.`, 'warn'); }
}
