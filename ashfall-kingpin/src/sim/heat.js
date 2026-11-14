// Heat per settlement (0-100) + global Notoriety. Sources, sinks and level consequences.
import { SETTLEMENT_IDS, PLACE, PLACES } from '../data/places.js';
import { log, fx, stat, statMax, spend, D, hasPerk, addRep } from './state.js';

export const HEAT_LEVELS = [
  { min: 0, name: 'Quiet', desc: 'Nothing to see.' },
  { min: 20, name: 'Watched', desc: 'Extra patrols near your activity.' },
  { min: 40, name: 'Hunted', desc: 'Fronts get inspected; informants appear.' },
  { min: 60, name: 'Wanted', desc: 'Bounty hunters roam; the Hollow may be raided.' },
  { min: 80, name: 'Crackdown', desc: 'Warden strike teams and asset freezes.' },
];
export const heatLevel = (h) => (h >= 80 ? 4 : h >= 60 ? 3 : h >= 40 ? 2 : h >= 20 ? 1 : 0);

// Crimes outside a settlement count against the nearest one at half weight.
const NEAREST = {};
for (const p of PLACES) {
  if (p.kind === 'settlement') { NEAREST[p.id] = [p.id, 1]; continue; }
  let best = null, bd = Infinity;
  for (const s of PLACES) {
    if (s.kind !== 'settlement') continue;
    const d = Math.hypot(s.at[0] + s.w / 2 - (p.at[0] + p.w / 2), s.at[1] + s.h / 2 - (p.at[1] + p.h / 2));
    if (d < bd) { bd = d; best = s.id; }
  }
  NEAREST[p.id] = [best, p.kind === 'market' ? 0 : 0.5];
}
export const heatTown = (placeId) => (NEAREST[placeId] || ['millbrook', 0.5]);

export function addHeat(S, where, amount, why, opts = {}) {
  const [town, w] = S.heat[where] !== undefined && SETTLEMENT_IDS.includes(where) ? [where, 1] : heatTown(where);
  if (!town || !w) return 0;
  let a = amount * w;
  if (a > 0) a *= D(S).heat;
  const before = S.heat[town];
  S.heat[town] = Math.max(0, Math.min(100, before + a));
  if (a > 0) {
    S.today.heat += a;
    S.goodwill = Math.max(0, S.goodwill - a * 0.08);
    if (S.laylow > 0 && a >= 2) { S.laylow = 0; log(S, 'Lay-low broken: you were seen doing crime.', 'bad'); }
    statMax(S, 'maxHeat', S.heat[town]);
  }
  const lb = heatLevel(before), la = heatLevel(S.heat[town]);
  if (la > lb) {
    log(S, `${PLACE[town].name} heat is now ${HEAT_LEVELS[la].name}: ${HEAT_LEVELS[la].desc}`, 'bad');
    fx(S, 'heat', { town, level: la });
  }
  if (!opts.quiet && a >= 3) fx(S, 'heatpop', { town, amount: a, why });
  recalcNotoriety(S);
  return a;
}

export function recalcNotoriety(S) {
  const hs = SETTLEMENT_IDS.map((t) => S.heat[t]);
  const max = Math.max(...hs), avg = hs.reduce((a, b) => a + b, 0) / hs.length;
  S.notoriety = Math.round(Math.min(100, 0.55 * max + 0.45 * avg));
}

export function heatDecayRate(S, town) {
  let d = 4 + (hasPerk(S, 'fx_network') ? 1.5 : 0);
  d *= S.laylow > 0 ? 2.5 : 1;
  d *= 0.75 + S.goodwill / 200;
  if (S.towns[town] && S.towns[town].occupied) d += 2;
  if (S.businesses.some((b) => b.town === town && b.type === 'radio')) d += 1.5;
  return d;
}

export function heatDaily(S) {
  for (const t of SETTLEMENT_IDS) S.heat[t] = Math.max(0, S.heat[t] - heatDecayRate(S, t));
  if (S.laylow > 0) { S.laylow--; if (S.laylow === 0) log(S, 'Lay-low period over. Back to business.', 'info'); }
  recalcNotoriety(S);
  if (S.compact.crackdownDays > 0) S.compact.crackdownDays--;
  if (S.notoriety >= 80 && S.compact.crackdownDays === 0) {
    S.compact.crackdownDays = 4;
    const frz = Math.round(S.money.clean * 0.25);
    if (frz > 0) { S.money.clean -= frz; S.money.frozen += frz; S.money.frozenDays = Math.max(S.money.frozenDays, 4); }
    log(S, `CRACKDOWN: Warden strike teams deployed. $${frz} of clean assets frozen for 4 days.`, 'bad');
    fx(S, 'crackdown');
    stat(S, 'crackdowns');
  }
}

export function layLow(S, days = 2) {
  S.laylow = Math.max(S.laylow, days);
  log(S, `Laying low for ${days} day${days > 1 ? 's' : ''}: dealers pause, heat decays 2.5x faster.`, 'info');
  S.tutorial.flags.laidLow = true;
  stat(S, 'layLows');
}

export function bribeCost(S, town) {
  const p = PLACE[town];
  let c = 40 + S.heat[town] * 10 * (1 + (p.wealth || 100) / 250);
  if (hasPerk(S, 'fx_bribe')) c *= 0.75;
  if (S.crew.some((m) => m.job === 'staff' && m.traits.includes('smooth_talker'))) c *= 0.9;
  return Math.round(c * D(S).cost);
}

export function bribe(S, town) {
  if (S.heat[town] < 1) return { ok: false, msg: 'Nobody here is looking for you.' };
  const c = bribeCost(S, town);
  if (!spend(S, 'dirty', c, 'bribes')) return { ok: false, msg: `Bribe needs $${c} dirty.` };
  S.heat[town] = Math.max(0, S.heat[town] - 15);
  recalcNotoriety(S);
  stat(S, 'bribes');
  S.tutorial.flags.bribed = true;
  return { ok: true, msg: `Paid $${c}. ${PLACE[town].name} heat -15.` };
}

export function payTribute(S, amount) {
  amount = Math.round(amount * (hasPerk(S, 'fx_bribe') ? 0.75 : 1));
  if (!spend(S, 'clean', amount, 'tribute')) return { ok: false, msg: 'Tribute must be paid in clean money.' };
  S.goodwill = Math.min(100, S.goodwill + amount / 120);
  for (const t of SETTLEMENT_IDS) S.heat[t] = Math.max(0, S.heat[t] - amount / 900);
  recalcNotoriety(S);
  stat(S, 'tributePaid', amount);
  return { ok: true, msg: `Tribute of $${amount} paid. Compact goodwill ${Math.round(S.goodwill)}.` };
}

export function scapegoatCost(S, town) { return Math.round((300 + S.heat[town] * 12) * (hasPerk(S, 'fx_scape') ? 0.5 : 1) * D(S).cost); }

export function scapegoat(S, town, rid) {
  const r = S.rivals[rid];
  if (!r || !r.alive) return { ok: false, msg: 'Pick a living rival to frame.' };
  const c = scapegoatCost(S, town);
  if (!spend(S, 'dirty', c, 'bribes')) return { ok: false, msg: `Need $${c} dirty.` };
  const cut = 25 * (hasPerk(S, 'fx_scape') ? 1.5 : 1);
  S.heat[town] = Math.max(0, S.heat[town] - cut);
  r.attitude = Math.max(-100, r.attitude - 20);
  r.strength = Math.max(5, r.strength - 3);
  recalcNotoriety(S);
  stat(S, 'scapegoats');
  log(S, `${r.name} took the fall for your ${PLACE[town].name} trouble. They know who did it.`, 'warn');
  return { ok: true, msg: `Heat -${Math.round(cut)} in ${PLACE[town].name}. ${r.leader} is furious.` };
}

// Killing a witness: no report, but the crew sees what you are.
export function witnessKilled(S) {
  for (const c of S.crew) if (c.status === 'active') c.loyalty = Math.max(0, c.loyalty - 2);
  addRep(S, -2);
  stat(S, 'witnessesSilenced');
}
