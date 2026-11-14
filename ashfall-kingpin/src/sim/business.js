// Fronts, laundering, audits, rackets (protection, loans) and business specials.
import { BUSINESSES, BIZ_UPGRADES } from '../data/businesses.js';
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { rnd, rint, rchance, rpick } from '../core/rng.js';
import { log, fx, stat, earn, spend, addRep, hasPerk, rank, D, nextId, canAfford } from './state.js';
import { addHeat } from './heat.js';
import { onJob, effSkill, crewById, shortName, bestOn } from './crew.js';
import { addItem, takeAll } from './inventory.js';
import { FIRST, LAST } from '../data/crew.js';

export const bizById = (S, uid) => S.businesses.find((b) => b.uid === uid);
export const lotsIn = (S, W, town) => W.buildings.filter((b) => b.place === town && b.lot);
export const lotOwner = (S, town, lotIdx) => S.businesses.find((b) => b.town === town && b.lot === lotIdx);

export function staffOf(S, b) { return onJob(S, 'staff', b.uid); }
export function accountantOf(S, b) { return bestOn(S, 'accountant', b.uid); }

export function legitRev(S, b) {
  const T = BUSINESSES[b.type];
  const P = PLACE[b.town];
  const lvl = [1, 1.5, 2][b.up.expand || 0];
  const staff = staffOf(S, b).length;
  const staffF = staff >= T.staff ? 1 : 0.6 + 0.4 * staff / T.staff;
  const traffic = (P.traffic || 1) * (b.up.signage ? 1.2 : 1) * (S.towns[b.town].status === 'devastated' ? 0.6 : 1);
  const hustle = staffOf(S, b).reduce((a, c) => a + effSkill(c, 'hustle'), 0);
  return T.rev * lvl * traffic * staffF * (1 + 0.02 * hustle) * (1 + 0.25 * rank(S)) * (hasPerk(S, 'op_empire') ? 1.12 : 1);
}

export function washCapacity(S, b) {
  const a = accountantOf(S, b);
  return 0.8 * legitRev(S, b) * (1 + 0.1 * (a ? effSkill(a, 'bookkeeping') : 0));
}

export function washFee(S, b) {
  const a = accountantOf(S, b);
  const bk = a ? effSkill(a, 'bookkeeping') : 0;
  return Math.max(0.08, 0.25 - 0.02 * bk - (hasPerk(S, 'op_books') ? 0.03 : 0));
}

export function bizValue(S, b) {
  const T = BUSINESSES[b.type];
  let v = T.cost;
  for (const [k, lvl] of Object.entries(b.up)) { const u = BIZ_UPGRADES[k]; if (!u) continue; for (let i = 0; i < lvl; i++) v += T.cost * u.costMult[i]; }
  return v;
}

export function shellAvailable(S) { return S.businesses.length === 0; }
export function shellPrice(S, type) { return Math.round(BUSINESSES[type].cost * 1.25 * D(S).cost); }

export function buyBusiness(S, type, town, lot, pay = 'clean') {
  const T = BUSINESSES[type];
  if (!T) return { ok: false, msg: 'Unknown business.' };
  if (lotOwner(S, town, lot)) return { ok: false, msg: 'You already own that lot.' };
  if (rank(S) < T.rank && !(type === 'canteen' && pay === 'shell')) return { ok: false, msg: `${T.name} needs a bigger name (rank).` };
  if (type === 'casino' && rank(S) < 3) return { ok: false, msg: 'Casinos unlock at Boss.' };
  if (S.towns[town] && S.towns[town].status === 'devastated') return { ok: false, msg: 'Nobody sells property in a devastated town.' };
  if (pay === 'shell') {
    if (!shellAvailable(S)) return { ok: false, msg: "Mags' shell deal is only for your first front." };
    const c = shellPrice(S, type);
    if (!spend(S, 'dirty', c, 'property')) return { ok: false, msg: `Mags wants $${c} dirty for the paperwork.` };
  } else {
    const c = Math.round(T.cost * D(S).cost);
    if (!spend(S, 'clean', c, 'property')) return { ok: false, msg: `${T.name} costs $${c} CLEAN. Launder first (or use Mags' shell deal for your first front).` };
  }
  const b = { uid: nextId(S), type, town, lot, up: {}, washPlan: 0, washQ: [], risk: 0, frozen: 0, backroom: null, day: S.day, washedTotal: 0 };
  S.businesses.push(b);
  stat(S, 'fronts');
  addRep(S, 15 + T.rank * 10, 'new front', 'fronts');
  S.tutorial.flags.boughtFront = true;
  log(S, `You now own a ${T.name} in ${PLACE[town].name}. Set a wash plan in the Ledger > Businesses.`, 'good');
  fx(S, 'front', { b });
  return { ok: true, msg: `${T.name} purchased.`, b };
}

export function upgradeCost(S, b, up) {
  const T = BUSINESSES[b.type];
  const u = BIZ_UPGRADES[up];
  const lvl = b.up[up] || 0;
  if (lvl >= u.max) return null;
  return Math.round(T.cost * u.costMult[lvl] * D(S).cost);
}

export function buyUpgrade(S, b, up, choice) {
  const c = upgradeCost(S, b, up);
  if (c === null) return { ok: false, msg: 'Maxed.' };
  if (up === 'backroom' && !choice) return { ok: false, msg: 'Pick a back-room use.' };
  if (!spend(S, 'clean', c, 'property')) return { ok: false, msg: `Needs $${c} clean.` };
  b.up[up] = (b.up[up] || 0) + 1;
  if (up === 'backroom') b.backroom = choice;
  stat(S, 'bizUpgrades');
  return { ok: true, msg: `${BIZ_UPGRADES[up].name} done.` };
}

export function setWashPlan(S, b, amt) {
  b.washPlan = Math.max(0, Math.round(amt));
  if (b.washPlan >= 200) S.tutorial.flags.laundered = true;
}

export function sellBusiness(S, b) {
  const v = Math.round(bizValue(S, b) * 0.6);
  for (const q of b.washQ) earn(S, 'clean', q.amt * (1 - washFee(S, b)), 'laundered');
  for (const c of staffOf(S, b)) { c.job = 'idle'; c.at = null; }
  S.businesses = S.businesses.filter((x) => x !== b);
  earn(S, 'clean', v, 'property');
  return { ok: true, msg: `Sold for $${v} clean.` };
}

// ---------- daily ----------
export function businessDaily(S) {
  for (const b of S.businesses) {
    const T = BUSINESSES[b.type];
    const rev = legitRev(S, b);
    // Legit profit is clean money.
    const profit = rev * (1 - T.upkeep);
    if (b.frozen > 0) b.frozen--;
    else earn(S, 'clean', profit, 'fronts');
    // Wash intake from the dirty stash.
    const cap = washCapacity(S, b);
    let amt = Math.min(b.washPlan, S.money.dirty);
    if (amt > 0 && b.frozen === 0) {
      S.money.dirty -= amt;
      b.washQ.push({ amt, days: T.wash });
      const excess = Math.max(0, amt - cap);
      let gain = (excess / Math.max(1, rev)) * 15 * T.audit;
      if (b.up.books) gain *= 0.6;
      if (hasPerk(S, 'op_books')) gain *= 0.8;
      if (staffOf(S, b).some((c) => c.onBooks)) gain *= 0.85;
      const mgr = S.crew.find((c) => c.status === 'active' && c.manages === b.uid);
      if (mgr) gain *= 0.8;
      b.risk = Math.min(100, b.risk + gain);
      if (excess <= 0) b.risk = Math.max(0, b.risk - (b.up.books ? 8 : 5));
    } else b.risk = Math.max(0, b.risk - (b.up.books ? 8 : 5));
    // Wash completes after 1-3 days.
    for (const q of b.washQ) q.days--;
    const doneQ = b.washQ.filter((q) => q.days <= 0);
    b.washQ = b.washQ.filter((q) => q.days > 0);
    for (const q of doneQ) {
      const fee = washFee(S, b);
      const clean = q.amt * (1 - fee);
      earn(S, 'clean', clean, 'laundered');
      S.today.exp.laundryFees = (S.today.exp.laundryFees || 0) + q.amt * fee;
      b.washedTotal += clean;
      stat(S, 'laundered', clean);
      S.tutorial.flags.cleanArrived = true;
    }
    // Audits: risk-driven, plus inspections when the town is Hunted.
    const inspect = S.heat[b.town] >= 40 ? 0.03 : 0;
    const chance = Math.max(0, b.risk - 5) / 100 * 0.6 + inspect;
    if (chance > 0 && rchance(S, chance)) audit(S, b);
    specialDaily(S, b, rev);
  }
}

export function audit(S, b) {
  const T = BUSINESSES[b.type];
  const fine = Math.min(S.money.clean, Math.round(150 + bizValue(S, b) * 0.15 + b.risk * 10));
  S.money.clean -= fine;
  S.today.exp.fines = (S.today.exp.fines || 0) + fine;
  b.frozen = 3 + Math.floor(b.risk / 30);
  const frz = Math.round(S.money.clean * 0.15);
  S.money.clean -= frz; S.money.frozen += frz; S.money.frozenDays = Math.max(S.money.frozenDays, b.frozen);
  addHeat(S, b.town, 10, 'audit');
  stat(S, 'audits');
  const seized = b.risk >= 70 && rchance(S, 0.5);
  if (seized) {
    S.businesses = S.businesses.filter((x) => x !== b);
    for (const c of staffOf(S, b)) { c.job = 'idle'; c.at = null; }
    log(S, `AUDIT: Compact auditors SEIZED your ${T.name} in ${PLACE[b.town].name}. Fine $${fine}.`, 'bad');
    stat(S, 'seized');
  } else {
    b.risk = 30;
    log(S, `AUDIT at your ${T.name} (${PLACE[b.town].name}): fined $${fine}, accounts frozen ${b.frozen} days, $${frz} of clean money tied up.`, 'bad');
  }
  fx(S, 'audit', { b });
}

export function bribeAuditorCost(S, b) { return Math.round((120 + b.risk * 12) * (hasPerk(S, 'fx_bribe') ? 0.75 : 1) * D(S).cost); }
export function bribeAuditor(S, b) {
  const c = bribeAuditorCost(S, b);
  if (!spend(S, 'dirty', c, 'bribes')) return { ok: false, msg: `Needs $${c} dirty.` };
  b.risk = Math.max(0, b.risk - 30);
  return { ok: true, msg: `Auditor paid off. Risk -30.` };
}

function specialDaily(S, b, rev) {
  switch (b.type) {
    case 'bathhouse': if (S.day % 2 === 0) { S.tips.push({ day: S.day, town: b.town, src: 'bathhouse' }); } break;
    case 'brewery': if (takeAll(S, { grain: 3, fuel: 1 }) || rchance(S, 0.5)) { addItem(S, 'shine', 4 + (b.up.expand || 0) * 2); stat(S, 'shineMade', 4); } break;
    case 'clinic': if (S.heat[b.town] > 0) S.heat[b.town] = Math.max(0, S.heat[b.town] - 1); break;
    case 'fightpit': { const take = rev * 0.35 * (0.7 + rnd(S) * 0.6); earn(S, 'dirty', take, 'gambling'); addRep(S, 4 + (b.up.expand || 0) * 2, null, 'fronts'); break; }
    case 'radio': S.goodwill = Math.min(100, S.goodwill + 0.5); break;
    case 'casino': { const take = rev * 0.2 * (0.6 + rnd(S) * 0.8); earn(S, 'dirty', take, 'gambling'); addRep(S, 6, null, 'fronts'); break; }
    default: break;
  }
}

// ---------- rackets ----------
export function protectionActive(S, town) { return !!S.protection[town] && onJob(S, 'enforcer', town).length > 0; }
export function startProtection(S, town) {
  if (rank(S) < 2) return { ok: false, msg: 'Rackets unlock at Supplier.' };
  if (!onJob(S, 'enforcer', town).length) return { ok: false, msg: 'Assign an enforcer to this town first.' };
  S.protection[town] = { since: S.day, last: S.day };
  log(S, `Protection racket running in ${PLACE[town].name}.`, 'warn');
  return { ok: true, msg: 'Protection racket started.' };
}
export function stopProtection(S, town) { delete S.protection[town]; return { ok: true, msg: 'Racket stopped.' }; }

export function racketsDaily(S) {
  for (const town of Object.keys(S.protection)) {
    const p = S.protection[town];
    if (!onJob(S, 'enforcer', town).length) continue;
    const enf = onJob(S, 'enforcer', town).reduce((a, c) => a + effSkill(c, 'gunplay'), 0);
    const amt = S.towns[town].wealth * 1.2 * (1 + 0.04 * enf) * (1 + 0.2 * rank(S)) * (S.towns[town].status === 'devastated' ? 0.4 : 1);
    earn(S, 'dirty', amt, 'protection');
    addHeat(S, town, 0.45, 'protection', { quiet: true });
    stat(S, 'protectionTake', amt);
    if (S.day - p.last >= 7) { p.last = S.day; log(S, `Protection rackets in ${PLACE[town].name} paid $${Math.round(amt * 7)} this week.`, 'good'); }
  }
  // Loans: weekly offers and repayments.
  if (rank(S) >= 2 && (S.day % 7 === 1 || !S.loanOffers.length)) {
    S.loanOffers = [];
    for (let i = 0; i < 3; i++) {
      const town = rpick(S, SETTLEMENT_IDS.filter((t) => S.visited[t]));
      S.loanOffers.push({ id: nextId(S), name: `${rpick(S, FIRST)} ${rpick(S, LAST)}`, town, amt: rint(S, 3, 30) * 100, rate: [0.15, 0.2, 0.25, 0.3][rint(S, 0, 3)], risk: rnd(S) * 0.4 });
    }
  }
  for (const L of [...S.loans]) {
    if (S.day < L.due) continue;
    const enf = onJob(S, 'enforcer', L.town).length;
    const def = L.risk * (enf ? 0.4 : 1);
    S.loans = S.loans.filter((x) => x !== L);
    if (rchance(S, def)) {
      S.events.pending.push({ id: 'loan_default', ctx: { loanAmt: L.amt, debtor: L.name, town: L.town } });
      stat(S, 'loanDefaults');
    } else {
      earn(S, 'clean', L.amt, 'loans');
      earn(S, 'dirty', L.amt * L.rate, 'loans');
      stat(S, 'loanInterest', L.amt * L.rate);
      log(S, `${L.name} repaid $${L.amt} + $${Math.round(L.amt * L.rate)} interest.`, 'good');
    }
  }
}

export function makeLoan(S, offerId) {
  const o = S.loanOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, msg: 'Offer gone.' };
  if (rank(S) < 2) return { ok: false, msg: 'Loan sharking unlocks at Supplier.' };
  if (!spend(S, 'clean', o.amt, 'loans')) return { ok: false, msg: `Need $${o.amt} clean to lend.` };
  S.loanOffers = S.loanOffers.filter((x) => x !== o);
  S.loans.push({ ...o, due: S.day + 7 });
  stat(S, 'loansMade');
  return { ok: true, msg: `Lent $${o.amt} to ${o.name} at ${Math.round(o.rate * 100)}%/week.` };
}

export function cleanAssets(S) { return S.money.clean + S.money.frozen + S.businesses.reduce((a, b) => a + bizValue(S, b), 0) + S.loans.reduce((a, l) => a + l.amt, 0); }
export { canAfford, crewById, shortName };
