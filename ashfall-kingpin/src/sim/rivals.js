// Rival gangs: economy, daily AI, diplomacy; Hollow defense resolution (abstract) incl. Operation Daybreak.
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { rnd, rint, rchance, rpick, rweighted } from '../core/rng.js';
import { log, fx, stat, earn, spend, addRep, rank, D, hasPerk, journal } from './state.js';
import { addHeat } from './heat.js';
import { active, onJob, combatPower, quit, injure, killCrew, shortName } from './crew.js';
import { addMarketMod } from './economy.js';
import { isPlot } from './grow.js';

export const STANCES = { neutral: 'Neutral', hostile: 'Hostile', war: 'At war', truce: 'Truce', tribute: 'Tribute', alliance: 'Alliance' };
export const peaceful = (r) => ['truce', 'tribute', 'alliance'].includes(r.stance);

export function rivalPower(S, r) {
  if (!r.alive) return 0;
  return r.strength * (1 + Math.min(0.6, (S.arms[r.id] || 0) / 300)) * D(S).enemy;
}

export function rivalCap(S, r) { return 16 + 9 * rank(S) + (r.id === 'rustjaw' ? 6 : 0); }

export function rivalsDaily(S) {
  for (const r of Object.values(S.rivals)) {
    if (!r.alive) continue;
    const turf = Object.values(r.turf).reduce((a, b) => a + b, 0);
    r.wealth += 60 + turf * 3;
    while (r.wealth > 220 && r.strength < rivalCap(S, r)) { r.wealth -= 160; r.strength += 1; }
    S.arms[r.id] = (S.arms[r.id] || 0) * 0.97;
    if (r.stanceDays > 0) { r.stanceDays--; if (r.stanceDays === 0 && (r.stance === 'truce' || r.stance === 'tribute')) { r.stance = 'neutral'; log(S, `Your ${STANCES[r.stance]} with ${r.name} has lapsed.`, 'warn'); } }
    if (r.stance === 'tribute') {
      if (!spend(S, 'dirty', r.tribute, 'tribute')) { r.stance = 'hostile'; r.attitude -= 20; log(S, `You missed tribute to ${r.name}. They are coming.`, 'bad'); }
      else r.attitude = Math.min(100, r.attitude + 2);
    }
    if (peaceful(r)) r.attitude = Math.min(100, r.attitude + 0.5);
    if (r.stance === 'neutral' && r.attitude < -40) { r.stance = 'hostile'; log(S, `${r.name} now consider you an enemy.`, 'bad'); }
    if (r.stance === 'hostile' && r.attitude < -75 && rchance(S, 0.3)) { r.stance = 'war'; log(S, `${r.leader} has declared WAR on you.`, 'bad'); journal(S, `${r.name} declared war on day ${S.day}.`); }
    if (S.tutorial.on && !S.tutorial.done && S.tutorial.step < 7) continue;
    rivalTurn(S, r);
  }
}

function rivalTurn(S, r) {
  const dealers = onJob(S, 'dealer').concat(onJob(S, 'runner'));
  const lowLoyal = active(S).filter((c) => c.loyalty < 40);
  let aggr = r.temper * 0.5 - r.attitude / 200 + (r.stance === 'war' ? 0.5 : r.stance === 'hostile' ? 0.25 : 0) + rank(S) * 0.04;
  if (peaceful(r)) aggr *= 0.08;
  aggr = Math.max(0.02, aggr);
  const acts = [
    { id: 'expand', w: 1 },
    { id: 'undercut', w: r.greed * (dealers.length ? 1 : 0.2) * (r.style === 'smuggler' ? 1.6 : 1) * (peaceful(r) ? 0.2 : 1) },
    { id: 'hit', w: aggr * (dealers.length ? 1.2 : 0) },
    { id: 'raid', w: aggr * 0.35 * (r.strength > 18 ? 1 : 0) * (S.defense ? 0 : 1) * (rank(S) >= 2 ? 1 : 0) },
    { id: 'poach', w: lowLoyal.length ? 0.6 * (r.style === 'smuggler' ? 1.5 : 1) : 0 },
    { id: 'negotiate', w: r.attitude > 5 && !peaceful(r) ? 0.7 : 0.15 },
    { id: 'sabotage', w: r.style === 'cult' ? aggr * 1.3 : aggr * 0.3 },
    { id: 'recruit', w: r.style === 'cult' ? 0.7 : 0.3 },
    { id: 'rest', w: 0.8 },
  ];
  const a = rweighted(S, acts, (x) => x.w) || acts[0];
  r.lastMove = a.id;
  switch (a.id) {
    case 'expand': {
      const t = rpick(S, SETTLEMENT_IDS.filter((x) => !PLACE[x].capital));
      r.turf[t] = Math.min(60, (r.turf[t] || 0) + rint(S, 3, 8));
      if (onJob(S, 'dealer', t).length) r.attitude -= 2;
      break;
    }
    case 'undercut': {
      const t = dealers.length ? rpick(S, dealers).at : rpick(S, SETTLEMENT_IDS);
      if (t && S.markets[t]) { addMarketMod(S, t, 'weed', -0.15, 3, `${r.name} undercutting`); log(S, `${r.name} are flooding ${PLACE[t].name} with cheap product. Prices -15% for 3 days.`, 'warn'); }
      break;
    }
    case 'hit': {
      const c = rpick(S, dealers);
      if (!c) break;
      if (rchance(S, 0.35)) { injure(S, c, rint(S, 2, 4)); log(S, `${r.name} jumped ${shortName(c)} in ${PLACE[c.at] ? PLACE[c.at].name : 'the wastes'}.`, 'bad'); }
      else { const loss = Math.min(S.money.dirty, rint(S, 80, 350)); S.money.dirty -= loss; log(S, `${r.name} robbed one of your runners: -$${loss}.`, 'bad'); }
      r.wealth += 150;
      stat(S, 'rivalHits');
      break;
    }
    case 'raid': planRaid(S, r.id, rivalPower(S, r) * (0.45 + rnd(S) * 0.35)); break;
    case 'poach': {
      const c = rpick(S, lowLoyal);
      if (c && rchance(S, (45 - c.loyalty) / 100 + (c.traits.includes('greedy') ? 0.15 : 0))) { quit(S, c, `was poached by ${r.name}`); r.strength += 1; stat(S, 'poached'); }
      break;
    }
    case 'negotiate': S.events.pending.push({ id: 'rival_offer', ctx: { rival: r.id } }); break;
    case 'sabotage': {
      const plots = S.hollow.cells.filter((c) => isPlot(c) && c.plant && !c.plant.dead);
      if (plots.length && rchance(S, 0.6)) { rpick(S, plots).plant.blight = true; log(S, `Blight in your plots. Ash on the leaves... ${r.name}?`, 'bad'); }
      else if (S.businesses.length) { const b = rpick(S, S.businesses); b.frozen = Math.max(b.frozen, 2); log(S, `Someone smashed up your front in ${PLACE[b.town].name}. Closed 2 days.`, 'bad'); }
      break;
    }
    case 'recruit': r.strength = Math.min(rivalCap(S, r), r.strength + 2); break;
    default: break;
  }
}

// ---------- diplomacy (Boss rank) ----------
export const truceCost = (S, r) => Math.round((300 + r.strength * 30) * (r.stance === 'war' ? 2 : 1) * D(S).cost);
export const tributeCost = (S, r) => Math.round((150 + r.strength * 12) * D(S).cost);

export function diplomacy(S, rid, act) {
  const r = S.rivals[rid];
  if (!r || !r.alive) return { ok: false, msg: 'They are gone.' };
  if (rank(S) < 3) return { ok: false, msg: 'Rival diplomacy unlocks at Boss.' };
  switch (act) {
    case 'truce': {
      const c = truceCost(S, r);
      if (!spend(S, 'dirty', c, 'diplomacy')) return { ok: false, msg: `A truce costs $${c}.` };
      r.stance = 'truce'; r.stanceDays = 7; r.attitude = Math.min(100, r.attitude + 12);
      return { ok: true, msg: `Truce with ${r.name} for 7 days.` };
    }
    case 'tribute': r.stance = 'tribute'; r.tribute = tributeCost(S, r); r.stanceDays = 14; r.attitude += 8; return { ok: true, msg: `Paying ${r.name} $${r.tribute}/day for peace (14 days).` };
    case 'alliance': {
      if (r.attitude < 40) return { ok: false, msg: `${r.leader} doesn't trust you enough (attitude 40+).` };
      if (S.favors < 1) return { ok: false, msg: 'An alliance costs 1 favor.' };
      S.favors -= 1; r.stance = 'alliance'; r.stanceDays = 0;
      stat(S, 'alliances');
      return { ok: true, msg: `Alliance sealed with ${r.name}.` };
    }
    case 'war': r.stance = 'war'; r.attitude = Math.max(-100, r.attitude - 30); journal(S, `You declared war on ${r.name} (day ${S.day}).`); return { ok: true, msg: `You declared war on ${r.name}.` };
    case 'break': r.stance = 'neutral'; r.stanceDays = 0; r.attitude -= 10; return { ok: true, msg: 'Agreement ended.' };
    default: return { ok: false, msg: '?' };
  }
}

// ---------- Hollow raids ----------
export function planRaid(S, by, power, opts = {}) {
  if (S.defense) return;
  const name = by === 'compact' ? 'Warden strike team' : S.rivals[by].name;
  S.defense = { by, power: Math.round(power), day: S.day + (opts.now ? 0 : 1), hour: opts.hour ?? 22, waves: opts.waves || 1, wave: 0, daybreak: !!opts.daybreak, name };
  log(S, `WARNING: ${name} plan to hit the Hollow ${opts.now ? 'tonight' : 'tomorrow night'}. Post guards, build turrets, or be home.`, 'bad');
  fx(S, 'raidwarn', { by });
}

export function defensePower(S, playerHome = false) {
  const guards = onJob(S, 'guard').concat(onJob(S, 'squad'));
  const posts = S.hollow.cells.filter((c) => c && c.fac === 'watchpost').length;
  let p = guards.reduce((a, c, i) => a + combatPower(S, c) * (i < posts ? 2 : 1), 0);
  p += S.hollow.cells.filter((c) => c && c.fac === 'turret').length * 14;
  p += S.hollow.cells.filter((c) => c && c.fac === 'traps').length * 6;
  p += 15 + (S.hollow.up.security || 0) * 10 + (S.flags.defenseBonus || 0);
  for (const r of Object.values(S.rivals)) if (r.alive && r.stance === 'alliance') p += rivalPower(S, r) * 0.2;
  if (playerHome) p += 12 + S.level * 1.5;
  return Math.round(p);
}

export function stashProtected(S) {
  const safes = S.hollow.cells.filter((c) => c && c.fac === 'safe').length;
  return safes * 6000 + (S.hollow.up.storage || 0) * 4000 + S.businesses.filter((b) => b.backroom === 'storage').length * 5000;
}

// Abstract resolution (used when you are away, when delegating, and by the headless sim).
export function resolveDefense(S, playerHome = false, forced = null) {
  const d = S.defense;
  if (!d) return null;
  const def = defensePower(S, playerHome);
  const win = forced !== null ? forced : def * (0.8 + rnd(S) * 0.4) >= d.power;
  const r = d.by !== 'compact' ? S.rivals[d.by] : null;
  let msg;
  if (win) {
    addRep(S, 15 + d.power / 4, 'defended the Hollow', 'defense');
    if (r) { r.strength = Math.max(5, Math.round(r.strength * 0.8)); r.attitude -= 5; }
    stat(S, 'defensesWon');
    msg = `The Hollow held against ${d.name}.`;
  } else {
    const exposed = Math.max(0, S.money.dirty - stashProtected(S));
    let loss = exposed * Math.min(0.6, 0.2 + 0.25 * (d.power - def) / Math.max(1, d.power));
    if (S.hollow.up.tunnel) loss *= 0.5;
    loss = Math.round(loss);
    S.money.dirty -= loss;
    let trampled = 0;
    for (const c of S.hollow.cells) if (c && c.fac === 'plot' && c.plant && rchance(S, 0.5)) { c.plant = null; trampled++; }
    for (const g of onJob(S, 'guard')) if (rchance(S, 0.4)) injure(S, g, rint(S, 2, 4));
    for (const c of active(S)) c.morale = Math.max(0, c.morale - 8);
    if (r) { r.wealth += loss; r.attitude += 5; }
    stat(S, 'defensesLost');
    msg = `${d.name} broke into the Hollow: stash -$${loss}${trampled ? `, ${trampled} plot(s) trampled` : ''}.`;
  }
  log(S, msg, win ? 'good' : 'bad');
  const daybreak = d.daybreak;
  if (daybreak && win && d.wave + 1 < d.waves) { d.wave++; d.power = Math.round(d.power * 1.3); d.day = S.day; d.hour = (d.hour + 2) % 24; log(S, `Operation Daybreak: wave ${d.wave + 1} of ${d.waves} incoming!`, 'bad'); return { win, msg, next: true }; }
  S.defense = null;
  if (daybreak) {
    if (win) { S.compact.daybreak = 'repelled'; journal(S, `Operation Daybreak repelled on day ${S.day}.`); stat(S, 'daybreak'); log(S, 'OPERATION DAYBREAK REPELLED. The Council Hall is exposed.', 'rank'); }
    else { S.compact.daybreak = 'failed'; S.compact.daybreakRetry = S.day + 5; log(S, 'Daybreak broke you this time. Regroup: the Compact will try again in 5 days.', 'bad'); }
  }
  return { win, msg };
}

export function bossDefeated(S, rid) {
  const r = S.rivals[rid];
  if (!r || !r.alive) return;
  r.alive = false;
  r.bossDown = true;
  r.turf = {};
  const loot = Math.round(r.wealth + 800 + r.strength * 40);
  earn(S, 'carried', loot, 'jobs');
  addRep(S, 300, `${r.leader} defeated`, 'raids');
  stat(S, 'bossesDown');
  journal(S, `${r.leader} fell on day ${S.day}. ${r.name} are finished.`);
  log(S, `${r.leader} is down. ${r.name} are finished. Took $${loot} from their coffers.`, 'rank');
  fx(S, 'boss', { rid });
}
