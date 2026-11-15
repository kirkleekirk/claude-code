// Greedy bot: plays the pure sim through the same action API the UI uses. Used by tools/sim.js
// (balance) and the browser smoke test. Action-mode steps use their abstract (delegated) versions.
import { STRAINS, PACKS } from '../data/strains.js';
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { FACILITIES, PERKS } from '../data/progress.js';
import { BUSINESSES } from '../data/businesses.js';
import { BP, BLUEPRINTS } from '../data/guns.js';
import { rank, hour, dirtyTotal, earn, D } from './state.js';
import { count } from './inventory.js';
import { plant, water, feed, harvest, packBud, ready, isPlot, breed, facCount, strainData } from './grow.js';
import { enqueue, addStanding, gunName } from './craft.js';
import { sellPacks, weedPrice, buyItem, buyPrice, sellGun, gunSalePrice, tradeAllowed, buyBlueprint, BLUEPRINT_SHOP, sellLoot, shineSell } from './economy.js';
import { layLow, bribe, bribeCost } from './heat.js';
import { active, onJob, hire, assign, effSkill, autoAssign, promote, crewCap, giveRaise, vet } from './crew.js';
import { buyBusiness, setWashPlan, washCapacity, shellAvailable, upgradeCost, buyUpgrade, lotOwner, startProtection } from './business.js';
import { diplomacy } from './rivals.js';
import { resolveEvent, autoChoice } from './events.js';
import { delegate, delegateChance, scavengeAbstract, raidChance, resolveRaid, newPlan, raidTargets, ruinReady, needMet, occupy, canOccupy, holds } from './jobs.js';
import { buyPerk, perkState } from './progress.js';
import { build, cellUnlocked, upgradeBench, benchUpgradeInfo, buyHollowUpgrade, upgradeInfo, buyVehicle, takeMagsLoan, brokeCheck } from './hollow.js';
import { tutorialStep, skipTutorial } from './tutorial.js';
import { declareCrown, crownReady, councilAssaultReady, assaultCouncilAbstract, buySeat, legalize, ledgerReady } from './endgame.js';
import { LOOT_ITEMS } from '../data/items.js';

const VISIT_ORDER = ['millbrook', 'crossroads', 'coppergate', 'harbor9', 'foundry', 'stverity', 'newhaven'];
const LOTS = { millbrook: 2, coppergate: 3, harbor9: 3, stverity: 3, foundry: 4, newhaven: 5 };

export function botHour(S, B = {}) {
  const h = hour(S);
  B.lotOf = B.lotOf || ((town, k) => k);
  for (const t of VISIT_ORDER) if (tradeAllowed(S, t)) S.visited[t] = true;
  if (S.events.pending.length) resolveEvent(S, 0, autoChoice(S, 0));
  if (h === 7 || h === 15 || h === 22) tendPlots(S);
  if (h === 8) tutorialActions(S, B);
  if (h === 10) { sellTrip(S); }
  if (h === 12) { investments(S, B); crewing(S); }
  if (h === 14) { crafting(S); sellGuns(S); }
  if (h === 18) { jobs(S, B); heatControl(S); }
  if (h === 20) { perks(S); endgame(S); if (brokeCheck(S)) takeMagsLoan(S); }
}

function tendPlots(S) {
  const cells = S.hollow.cells;
  for (let i = 0; i < 36; i++) {
    const c = cells[i];
    if (!isPlot(c)) continue;
    if (c.plant && c.plant.dead) { c.plant = null; }
    if (c.plant && ready(S, c.plant)) harvest(S, i);
    if (!c.plant) {
      const s = bestSeed(S);
      if (s) plant(S, i, s);
    }
    if (c.plant) {
      if (c.plant.water < 70) water(S, i);
      if (c.plant.nutr < 50 && count(S, 'compost') > 0) feed(S, i);
      else if (c.plant.nutr < 50) buyItem(S, 'millbrook', 'compost', 3) && feed(S, i);
    }
  }
  // Pack: baggies for the street; bricks once bulk channels exist.
  for (const k of Object.keys(S.inv).filter((x) => x.startsWith('bud:'))) {
    const [, st, q] = k.split(':');
    const units = count(S, k);
    if (rank(S) >= 2 && units >= 48) packBud(S, st, +q, 'brick', Math.floor((units - 24) / 24));
    const left = count(S, k);
    if (rank(S) >= 1 && left >= 8) packBud(S, st, +q, 'jar', Math.floor(left / 8));
    packBud(S, st, +q, 'baggie', count(S, k));
  }
}

function bestSeed(S) {
  const opts = Object.keys(S.inv).filter((k) => k.startsWith('seed:') && count(S, k) > 0).map((k) => k.slice(5));
  if (!opts.length) {
    for (const t of ['millbrook', 'crossroads']) {
      const pool = Object.keys(STRAINS).filter((s) => buyPrice(S, t, 'seed:' + s) !== null && !STRAINS[s].legendary);
      pool.sort((a, b) => value(S, b) - value(S, a));
      for (const s of pool) if (buyItem(S, t, 'seed:' + s, 4).ok) return s;
    }
    return null;
  }
  opts.sort((a, b) => value(S, b) - value(S, a));
  return opts[0];
}

function value(S, s) { const st = strainData(S, s); return st ? st.yield * (0.6 + st.potency / 100) / st.grow : 0; }

function sellTrip(S) {
  const towns = VISIT_ORDER.filter((t) => tradeAllowed(S, t) && S.laylow === 0 && S.heat[t] < 55 && t !== 'stverity');
  if (!towns.length) return;
  for (const town of towns.slice(0, Math.min(3, 1 + rank(S)))) {
    for (const k of Object.keys(S.inv).filter((x) => x.startsWith('pack:') && !x.endsWith(':brick'))) {
      const [, st, q, form] = k.split(':');
      const start = weedPrice(S, town, st, +q, form, 0).price;
      let guard = 60;
      while (count(S, k) > 0 && guard-- > 0) {
        if (weedPrice(S, town, st, +q, form, 0).price < start * 0.62) break;
        if (!sellPacks(S, town, k, 1, { hustle: 0, stealth: 0, who: 'you' }, { ignoreHours: true }).ok) break;
      }
    }
    if (count(S, 'shine') > 0) shineSell(S, town, Math.min(8, count(S, 'shine')));
    for (const L of LOOT_ITEMS) if (count(S, L) > 0) sellLoot(S, L, count(S, L), town, town === 'coppergate' ? 'fence' : 'market');
  }
  if (rank(S) >= 2) {
    for (const k of Object.keys(S.inv).filter((x) => x.endsWith(':brick'))) while (count(S, k) > 0 && sellPacks(S, 'crossroads', k, 1, { hustle: 0, stealth: 10, who: 'you' }, { bulk: true, ignoreHours: true }).ok);
  }
  S.money.dirty += S.money.carried;
  S.money.carried = 0;
}

const BUILD_PLAN = [
  ['plot', 0], ['plot', 0], ['compost', 0], ['dryrack', 0], ['cureroom', 0], ['lathe', 0], ['smelter', 0], ['plot', 0], ['plot', 0], ['press', 0],
  ['bunks', 1], ['generator', 1], ['watertank', 1], ['growroom', 1], ['watchpost', 1], ['growroom', 1], ['lab', 1], ['safe', 0], ['growroom', 1], ['turret', 2],
  ['dryrack', 1], ['cureroom', 1], ['bench', 1], ['growroom', 2], ['generator', 2], ['growroom', 2], ['turret', 2], ['training', 2], ['still', 2], ['bunks', 2],
  ['lathe', 2], ['watertank', 2], ['growroom', 2], ['growroom', 3], ['turret', 3], ['safe', 3], ['bunks', 3], ['growroom', 3], ['generator', 3], ['growroom', 3],
];

function investments(S, B) {
  const r = rank(S);
  const reserve = 150 + r * 400;
  // Workshop tier.
  const bu = benchUpgradeInfo(S);
  if (bu && r >= bu.rank && dirtyTotal(S) > bu.cost + reserve) upgradeBench(S);
  // Grid build plan.
  for (const [f, needRank] of BUILD_PLAN) {
    if (r < Math.max(needRank, FACILITIES[f].rank)) continue;
    const want = BUILD_PLAN.filter(([g, nr]) => g === f && r >= Math.max(nr, FACILITIES[g].rank)).length;
    if (facCount(S, f) >= want) continue;
    if (dirtyTotal(S) < FACILITIES[f].cost + reserve) break;
    const i = S.hollow.cells.findIndex((c, k) => !c && cellUnlocked(S, k));
    if (i < 0) break;
    build(S, i, f);
  }
  if (facCount(S, 'generator') && count(S, 'fuel') < 12) buyItem(S, tradeAllowed(S, 'foundry') ? 'foundry' : 'millbrook', 'fuel', 12);
  for (const k of ['security', 'storage', 'power', 'tunnel']) { const u = upgradeInfo(S, k); if (u && r >= u.rank && dirtyTotal(S) > u.cost * 3 + reserve) buyHollowUpgrade(S, k); }
  for (const v of ['handcart', 'buggy', 'hauler']) if (!S.vehicles.owned[v] && dirtyTotal(S) > 3 * (v === 'handcart' ? 900 : v === 'buggy' ? 6500 : 22000)) buyVehicle(S, v);
  // Blueprints.
  for (const [id, p] of Object.entries(BLUEPRINT_SHOP)) if (!S.bps[id] && BP[id].bench <= S.hollow.bench && dirtyTotal(S) > p * 2.5 + reserve) buyBlueprint(S, id);
  // Fronts: shell first, then clean purchases.
  if (shellAvailable(S) && (S.tutorial.done || (S.tutorial.on && tutorialStep(S) && tutorialStep(S).id === 'front'))) {
    if (dirtyTotal(S) > 600) buyBusiness(S, 'canteen', 'millbrook', B.lotOf('millbrook', 0), 'shell');
  } else if (S.businesses.length) {
    const order = ['canteen', 'garage', 'pawn', 'waterco', 'bathhouse', 'clinic', 'tradepost', 'brewery', 'fightpit', 'radio', 'casino'];
    for (const type of order) {
      const T = BUSINESSES[type];
      if (r < T.rank || S.money.clean < T.cost * 1.1) continue;
      const town = SETTLEMENT_IDS.find((t) => tradeAllowed(S, t) && S.towns[t].status !== 'devastated' && S.businesses.filter((b) => b.town === t).length < LOTS[t] && !S.businesses.some((b) => b.town === t && b.type === type));
      if (!town) continue;
      let lot = 0;
      while (lotOwner(S, town, B.lotOf(town, lot))) lot++;
      if (lot >= LOTS[town]) continue;
      buyBusiness(S, type, town, B.lotOf(town, lot), 'clean');
      break;
    }
    for (const b of S.businesses) {
      for (const up of ['books', 'expand', 'signage']) { const c = upgradeCost(S, b, up); if (c !== null && S.money.clean > c * 2.2) buyUpgrade(S, b, up); }
    }
  }
  // Wash at ~95% of capacity with whatever dirty cash is left above the reserve.
  let pool = Math.max(0, S.money.dirty - reserve);
  for (const b of S.businesses) { const cap = Math.floor(washCapacity(S, b) * 0.95); const amt = Math.min(cap, pool); setWashPlan(S, b, amt); pool -= amt; }
}

function crewing(S) {
  const r = rank(S);
  if (r < 1 && !S.candidates.millbrook?.some((c) => c.special)) return;
  const want = Math.min(crewCap(S), [1, 5, 10, 16, 24, 30][r]);
  let guard = 6;
  while (active(S).length < want && guard-- > 0) {
    let best = null;
    const needGun = onJob(S, 'squad').length < [1, 1, 2, 4, 4, 4][r];
    for (const t of Object.keys(S.candidates)) for (const c of S.candidates[t]) { const sc = Math.max(...Object.values(c.skills)) + (needGun ? c.skills.gunplay : 0) + (c.special ? 10 : 0) - c.wage / 15; if (!best || sc > best.sc) best = { c, t, sc }; }
    if (!best) break;
    if (!best.c.special && dirtyTotal(S) < best.c.wage * 8 + 200) break;
    if (!best.c.vetted && dirtyTotal(S) > 1500) vet(S, best.c);
    if (best.c.traits.some((t, i) => ['loose_lips', 'sticky_fingers', 'addict'].includes(t) && !best.c.hidden[i]) && !best.c.special) { S.candidates[best.t] = S.candidates[best.t].filter((x) => x !== best.c); continue; }
    const res = hire(S, best.c.id, best.t);
    if (!res.ok) break;
    if (best.c.special === 'nephew') assign(S, best.c.id, 'farmer');
  }
  // Squad & guards before auto-assign takes everyone.
  const idle = active(S).filter((c) => c.job === 'idle' && !c.injured).sort((a, b) => effSkill(b, 'gunplay') - effSkill(a, 'gunplay'));
  const squadCap = [1, 1, 2, 4, 4, 4][r];
  for (const c of idle) {
    if (r >= 1 && onJob(S, 'squad').length < squadCap && effSkill(c, 'gunplay') >= 4) { assign(S, c.id, 'squad'); continue; }
    if (r >= 2 && onJob(S, 'runner').length < 1 + Math.floor(r / 2) && effSkill(c, 'driving') >= 3) { assign(S, c.id, 'runner'); continue; }
    if (r >= 2 && S.businesses.length && onJob(S, 'accountant').length < Math.min(S.businesses.length, 3) && effSkill(c, 'bookkeeping') >= 3) { assign(S, c.id, 'accountant', S.businesses[onJob(S, 'accountant').length].uid); continue; }
  }
  autoAssign(S, ['production', 'sales', 'security']);
  for (const c of active(S)) {
    if (c.job === 'idle' && !c.injured) { assign(S, c.id, 'dealer', SETTLEMENT_IDS.filter((t) => tradeAllowed(S, t) && t !== 'stverity')[active(S).indexOf(c) % 3] || 'millbrook'); }
    if (c.loyalty < 30 && dirtyTotal(S) > c.wage * 20) giveRaise(S, c);
    if (r >= 4 && c.job === 'squad' === false && !c.gun) { const g = S.guns.find((x) => !S.player.loadout.includes(x.id) && !S.crew.some((m) => m.gun === x.id)); if (g && (c.job === 'squad' || c.job === 'guard' || c.job === 'garrison')) c.gun = g.id; }
    if ((c.job === 'squad' || c.job === 'guard' || c.job === 'garrison') && !c.gun) { const g = S.guns.find((x) => !S.player.loadout.includes(x.id) && !S.crew.some((m) => m.gun === x.id)); if (g) c.gun = g.id; }
  }
  if (r >= 2 && !S.crew.some((c) => c.manages === 'hollow')) { const c = active(S).filter((x) => x.job !== 'squad').sort((a, b) => effSkill(b, 'leadership') - effSkill(a, 'leadership'))[0]; if (c && effSkill(c, 'leadership') >= 3) promote(S, c, 'hollow'); }
  if (r >= 2) for (const t of SETTLEMENT_IDS) if (!S.protection[t] && onJob(S, 'enforcer', t).length) startProtection(S, t);
}

function crafting(S) {
  if (!facCount(S, 'bench')) return;
  const r = rank(S);
  for (const k of ['scrap', 'timber', 'spring', 'fuel']) {
    const want = k === 'scrap' ? 30 + r * 20 : k === 'spring' ? 6 + r * 4 : 10 + r * 6;
    if (count(S, k) < want / 2) for (const t of ['foundry', 'coppergate', 'millbrook', 'crossroads']) if (tradeAllowed(S, t) && buyPrice(S, t, k) !== null && dirtyTotal(S) > 800) { buyItem(S, t, k, want); break; }
  }
  if (S.queues.bench.length < 2) {
    const known = BLUEPRINTS.filter((b) => S.bps[b.id] && b.bench <= S.hollow.bench).sort((a, b) => b.value - a.value);
    if (known.length && (S.tutorial.done || S.tutorial.step >= 2)) enqueue(S, { kind: 'gun', bp: known[0].id, mat: 'best', count: 1 + Math.floor(r / 2) });
  }
  if (facCount(S, 'press') && S.queues.press.length < 1 && count(S, 'brass') >= 2 && count(S, 'propellant') >= 2) enqueue(S, { kind: 'ammo', type: 'medium', count: 2 });
  else if (facCount(S, 'press') && r >= 1 && dirtyTotal(S) > 1500) { buyItem(S, tradeAllowed(S, 'coppergate') ? 'coppergate' : 'crossroads', 'brass', 4); buyItem(S, tradeAllowed(S, 'coppergate') ? 'coppergate' : 'crossroads', 'propellant', 4); }
}

function sellGuns(S) {
  const town = tradeAllowed(S, 'coppergate') ? 'coppergate' : 'millbrook';
  const keep = 2 + onJob(S, 'squad').length + onJob(S, 'guard').length + onJob(S, 'garrison').length;
  const spare = S.guns.filter((g) => !S.player.loadout.includes(g.id) && !S.crew.some((c) => c.gun === g.id));
  spare.sort((a, b) => gunSalePrice(S, b, town).price - gunSalePrice(S, a, town).price);
  for (const g of spare.slice(0, Math.max(0, spare.length - Math.max(0, keep - (S.guns.length - spare.length))))) sellGun(S, g.id, town, 'compact');
  S.money.dirty += S.money.carried;
  S.money.carried = 0;
}

function jobs(S, B) {
  const squad = onJob(S, 'squad').filter((c) => !c.injured && !c.onMission).map((c) => c.id);
  const guards = onJob(S, 'guard').filter((c) => !c.injured && !c.onMission).map((c) => c.id);
  const team = squad.length ? squad : guards.slice(0, 2);
  // Contracts.
  let personal = !S.contracts.active.some((j) => j.withPlayer) && S.day % 2 === 0;
  for (const o of [...S.contracts.board]) {
    if (!needMet(S, o)) continue;
    if (personal) { const ids = team.slice(0, 2); if (delegateChance(S, o, ids, { withPlayer: true }) >= 0.6) { delegate(S, o.cid, ids, { withPlayer: true }); personal = false; continue; } }
    const rest = team.filter((id) => !S.crew.find((c) => c.id === id).onMission);
    if (rest.length && delegateChance(S, o, rest) >= 0.65) { delegate(S, o.cid, rest); break; }
  }
  // Ruins: solo scavenging (the bot plays them itself).
  for (const ruin of ['ruin_motel', 'ruin_silo', 'ruin_busdepot', 'ruin_chapel']) if (ruinReady(S, ruin) && (ruin.endsWith('motel') || ruin.endsWith('silo') || rank(S) >= 1)) { scavengeAbstract(S, ruin, team); break; }
  // Vault raids every few days when odds are good.
  if ((S.flags.lastRaid || -99) + 4 <= S.day && S.laylow === 0) {
    const targets = raidTargets(S).filter((t) => !t.locked && t.kind === 'vault' && S.heat[t.place] < 50);
    targets.sort((a, b) => b.loot.dirty - a.loot.dirty);
    for (const t of targets) {
      const plan = newPlan(S, t.place);
      plan.crew = team.slice(0, 4);
      plan.inside = dirtyTotal(S) > 3000;
      const p = raidChance(S, plan);
      if (p >= 0.6 || (t.place === 'millbrook' && p >= 0.35)) { resolveRaid(S, plan); S.flags.lastRaid = S.day; break; }
    }
  }
  // Occupation at Warlord.
  if (rank(S) >= 4) {
    for (const t of SETTLEMENT_IDS) {
      if (S.towns[t].occupied || PLACE[t].capital) continue;
      if (S.towns[t].occupyReady || S.towns[t].status === 'devastated') {
        const spare = active(S).filter((c) => (c.job === 'dealer' || c.job === 'idle') && !c.injured).slice(0, 2);
        if (onJob(S, 'garrison', t).length < 2) for (const c of spare) assign(S, c.id, 'garrison', t);
        if (!canOccupy(S, t)) occupy(S, t);
      } else if (holds(S).length < 3 && (S.flags['lib_' + t] || -99) + 3 <= S.day) {
        const plan = newPlan(S, t); plan.approach = 'assault'; plan.crew = team.slice(0, 4); plan.inside = true;
        if (raidChance(S, plan) >= 0.55 && !S.towns[t].occupied) { resolveRaid(S, plan); S.flags['lib_' + t] = S.day; }
      }
    }
  }
}

function heatControl(S) {
  const hot = SETTLEMENT_IDS.filter((t) => S.heat[t] >= 45).sort((a, b) => S.heat[b] - S.heat[a]);
  for (const t of hot) { if (dirtyTotal(S) > bribeCost(S, t) * 3) bribe(S, t); }
  if (SETTLEMENT_IDS.some((t) => S.heat[t] >= 62) && S.laylow === 0) layLow(S, 1);
  if (rank(S) >= 3) for (const r of Object.values(S.rivals)) if (r.alive && (r.stance === 'hostile' || r.stance === 'war') && r.strength > 30) diplomacy(S, r.id, 'truce');
}

function perks(S) {
  const pref = ['op_green', 'op_market', 'op_tongue', 'op_books', 'fx_network', 'op_bulk', 'op_wages', 'gun_squad', 'op_chain', 'op_empire', 'fx_bribe', 'gun_smith', 'fx_snitch', 'gun_aim', 'gun_hp', 'fx_inside', 'fx_scape', 'gun_reload', 'gun_dodge', 'fx_feet', 'fx_locks', 'fx_ghost', 'gun_exec', 'gun_will'];
  for (const id of pref) if (S.perkPts > 0 && perkState(S, id) === 'ok') buyPerk(S, id);
}

function tutorialActions(S, B) {
  const st = tutorialStep(S);
  if (!st) return;
  if (B.skipTutorial) { skipTutorial(S); return; }
  switch (st.id) {
    case 'ruin': scavengeAbstract(S, 'ruin_motel', []); break;
    case 'craft': if (!S.queues.bench.length) enqueue(S, { kind: 'gun', bp: 'pipe_pistol', mat: 'best', count: 1 }); break;
    case 'heat': layLow(S, 1); break;
    case 'hire': { const c = (S.candidates.millbrook || []).find((x) => x.special === 'nephew'); if (c) { hire(S, c.id, 'millbrook'); assign(S, c.id, 'farmer'); } else { const m = S.crew.find((x) => x.special === 'nephew'); if (m) assign(S, m.id, 'farmer'); } break; }
    case 'rob': { const plan = newPlan(S, 'millbrook'); plan.crew = S.crew.filter((c) => c.status === 'active').map((c) => c.id).slice(0, 1); resolveRaid(S, plan); break; }
    case 'front': if (shellAvailable(S) && dirtyTotal(S) >= 600) buyBusiness(S, 'canteen', 'millbrook', B.lotOf('millbrook', 0), 'shell'); if (S.businesses[0]) setWashPlan(S, S.businesses[0], Math.max(200, S.businesses[0].washPlan)); break;
    default: break;
  }
}

function endgame(S) {
  if (rank(S) < 5 || S.ending) return;
  if (councilAssaultReady(S)) { assaultCouncilAbstract(S, onJob(S, 'squad').map((c) => c.id)); return; }
  if (!ledgerReady(S)) { legalize(S); return; }
  while (S.compact.seats < 7 && buySeat(S).ok);
  if (holds(S).length >= 3 && !crownReady(S) && S.compact.daybreak !== 'pending' && S.money.clean < 600000) declareCrown(S);
}

export { gunName, PACKS, D, earn };
