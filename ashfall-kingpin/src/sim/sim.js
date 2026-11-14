// Simulation clock: advance(S, minutes) processes hour boundaries and dawn. Pure; no DOM.
import { PACKS } from '../data/strains.js';
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { rnd, rint, rchance, rpick } from '../core/rng.js';
import { log, fx, stat, earn, addRep, rank, hour, newLedgerDay, marketOpen, journal } from './state.js';
import { growHour, growDaily, processHour, labHour, utilitiesHour } from './grow.js';
import { craftHour } from './craft.js';
import { sellPacks, weedPrice, marketsDaily, tradeAllowed, shineSell } from './economy.js';
import { heatDaily } from './heat.js';
import { active, onJob, effSkill, productivity, wagesDaily, crewDaily, refreshCandidates, injure } from './crew.js';
import { businessDaily, racketsDaily } from './business.js';
import { rivalsDaily, resolveDefense } from './rivals.js';
import { eventsDaily } from './events.js';
import { contractsDaily, jobsHour, townsDaily, containerLoot, holds } from './jobs.js';
import { checkAchievements } from './progress.js';
import { tutorialTick } from './tutorial.js';
import { dailyNews, radioLine } from './news.js';
import { debtDaily, brokeCheck } from './hollow.js';
import { addItem } from './inventory.js';

// minutes may be fractional; hooks: { onHourAction(S) -> bool (true if the player handles the defense in action mode) }
export function advance(S, minutes, hooks = {}) {
  let m = minutes;
  while (m > 1e-9) {
    const intoHour = S.min % 60;
    const toNext = 60 - intoHour;
    const step = Math.min(m, toNext);
    S.min += step;
    S.total += step;
    m -= step;
    if (step >= toNext - 1e-9) {
      S.min = Math.round(S.min);
      S.total = Math.round(S.total);
      if (S.min >= 1440) { S.min -= 1440; S.day++; }
      onHour(S, hooks);
    }
  }
}

export function onHour(S, hooks = {}) {
  const h = hour(S);
  utilitiesHour(S);
  growHour(S);
  processHour(S);
  labHour(S);
  craftHour(S);
  dealersHour(S);
  jobsHour(S);
  if (S.defense && S.day >= S.defense.day && h === S.defense.hour) {
    const handled = hooks.onDefense ? hooks.onDefense(S) : false;
    if (!handled) resolveDefense(S, false);
  }
  if (h === 6) dawn(S);
  tutorialTick(S);
  if (h % 2 === 0) fx(S, 'radio', { text: radioLine(S) });
}

export function dealersHour(S) {
  if (S.laylow > 0) return;
  for (const c of onJob(S, 'dealer')) {
    if (c.injured || c.onMission || !c.at || !marketOpen(S, c.at) || !tradeAllowed(S, c.at)) continue;
    const dist = S.businesses.some((b) => b.town === c.at && b.backroom === 'dist') ? 1.2 : 1;
    let units = (1 + effSkill(c, 'hustle') / 3) * productivity(S, c) * dist;
    c.carry = (c.carry || 0) + units;
    while (c.carry >= 1) {
      const key = bestPackFor(S, c.at, effSkill(c, 'hustle'));
      if (!key) { c.carry = 0; break; }
      const form = key.split(':')[3];
      if (c.carry < PACKS[form].units && form !== 'baggie') { c.carry = 0; break; }
      const res = sellPacks(S, c.at, key, 1, { hustle: effSkill(c, 'hustle'), stealth: effSkill(c, 'stealth') + (c.traits.includes('ghost') ? 3 : 0), who: 'crew' }, { toStash: true });
      if (!res.ok) { c.carry = 0; break; }
      c.carry -= PACKS[form].units;
      c.sold = (c.sold || 0) + res.units;
    }
    if (c.traits.includes('hothead') && rchance(S, 0.02)) log(S, `${c.first} got into a scrap in ${PLACE[c.at].name}.`, 'warn');
  }
}

function bestPackFor(S, town, hustle) {
  let best = null, bp = 0;
  for (const k of Object.keys(S.inv)) {
    if (!k.startsWith('pack:') || k.endsWith(':brick')) continue;
    const [, strain, q, form] = k.split(':');
    const p = weedPrice(S, town, strain, +q, form, hustle).price / PACKS[form].units;
    if (p > bp) { bp = p; best = k; }
  }
  return best;
}

export function dawn(S) {
  S.hist.push({ day: S.day - 1, dirty: Math.round(S.money.dirty + S.money.carried), clean: Math.round(S.money.clean), inc: S.today.inc, exp: S.today.exp, dIn: Math.round(S.today.dirtyIn), cIn: Math.round(S.today.cleanIn), rep: Math.round(S.today.rep), heat: Math.round(S.today.heat) });
  if (S.hist.length > 120) S.hist.shift();
  S.today = newLedgerDay();
  wagesDaily(S);
  businessDaily(S);
  racketsDaily(S);
  heatDaily(S);
  marketsDaily(S);
  townsDaily(S);
  crewDaily(S);
  rivalsDaily(S);
  eventsDaily(S);
  contractsDaily(S);
  growDaily(S);
  runnersDaily(S);
  scavengersDaily(S);
  debtDaily(S);
  if (S.money.frozenDays > 0) { S.money.frozenDays--; if (S.money.frozenDays === 0 && S.money.frozen > 0) { S.money.clean += S.money.frozen; log(S, `Frozen accounts released: $${Math.round(S.money.frozen)}.`, 'good'); S.money.frozen = 0; } }
  if (S.day - S.candDay >= 2 || !Object.keys(S.candidates).length) refreshCandidates(S);
  const empire = active(S).length * 0.6 + S.businesses.length * 2.5 + holds(S).length * 20 + Object.keys(S.protection).length * 2;
  if (empire > 0) addRep(S, empire * (1 + 0.1 * rank(S)), null, 'empire');
  if (rank(S) >= 5 && !S.compact.councilQuest) { S.compact.councilQuest = 1; fx(S, 'dialog', { who: 'mags', title: 'Two roads', lines: ['Kingpin. Never thought I would say that about anyone.', 'New Haven will not share the wastes. Two roads: break the Council by force and wear The Crown...', '...or buy enough seats that your empire becomes the law. That is The Ledger. Either way, you will need three towns under your thumb.'] }); journal(S, `Became Kingpin on day ${S.day}.`); }
  if (brokeCheck(S)) fx(S, 'broke');
  checkAchievements(S);
  const paper = dailyNews(S);
  fx(S, 'dawn', { day: S.day, paper });
  stat(S, 'days');
}

function runnersDaily(S) {
  if (rank(S) < 2) return;
  for (const c of onJob(S, 'runner')) {
    if (c.injured || c.onMission) continue;
    let n = 2 + Math.floor(effSkill(c, 'driving') / 2);
    const where = S.visited.harbor9 ? 'harbor9' : 'crossroads';
    for (const k of Object.keys(S.inv).filter((x) => x.startsWith('pack:') && (x.endsWith(':brick') || x.endsWith(':jar')))) {
      while (n > 0 && (S.inv[k] || 0) > 0) {
        const res = sellPacks(S, where, k, 1, { hustle: effSkill(c, 'hustle'), stealth: 10, who: 'crew' }, { bulk: true, ignoreHours: true, toStash: true });
        if (!res.ok) { n = 0; break; }
        n--;
      }
    }
    if (rchance(S, 0.04)) injure(S, c, rint(S, 1, 3));
  }
}

function scavengersDaily(S) {
  for (const c of onJob(S, 'scavenger')) {
    if (c.injured || c.onMission) continue;
    const tier = 1 + (effSkill(c, 'salvage') >= 6 ? 1 : 0);
    const L = containerLoot(S, 'scav', tier);
    for (const [k, n] of Object.entries(L.items)) addItem(S, k, n);
    earn(S, 'dirty', L.cash, 'scavenging');
    if (rchance(S, 0.06)) injure(S, c, rint(S, 1, 3));
  }
}

export { SETTLEMENT_IDS };
