// Scripted tutorial (every step is a real game action) + the "What should I do next?" tracker.
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { RANKS } from '../data/progress.js';
import { log, fx, addRep, earn, rank, journal } from './state.js';
import { addHeat } from './heat.js';
import { genRecruit, active } from './crew.js';
import { ready, isPlot } from './grow.js';
import { weedPrice, tradeAllowed } from './economy.js';
import { holds } from './jobs.js';
import { cleanAssets } from './business.js';
import { EVENT } from '../data/events.js';
import { SEATS_NEEDED } from '../data/businesses.js';

export const TUTORIAL = [
  { id: 'plant', title: 'Plant and water', obj: 'Plant Dust Devil seeds in a grow plot, then water it. Walk up and press E.', check: (f) => f.planted && f.watered, rep: 2,
    mags: ["So you're the one who bought the old depot. I'm Mags. I sell what people need and forget what they buy.", 'Out here every dollar is either dirty or clean. Dirty buys guns, seeds and silence. Clean buys deeds, permits and friends in high places.', 'Start small. Those plots by the depot will grow anything. Plant your Dust Devil seeds and water them.'] },
  { id: 'ruin', title: 'Scavenge Ruin I', obj: 'Loot the crates at the Gutted Motel (Ruin I, north-west of the Hollow gate). Feral dogs nest there: aim with the mouse, LMB to fire, R to reload.', check: (f) => f.ruinLooted, rep: 5,
    mags: ['Guns need parts. The Gutted Motel north of here still has some, if the dogs let you take them.', 'Aim with the mouse, click to fire, R to reload. Shift sprints, Space rolls.'] },
  { id: 'craft', title: 'Your first gun', obj: 'Use the Assembly Bench in the Hollow (E, or Ledger > Production) and queue a Pipe Pistol from the parts you found.', check: (f) => f.craftedGun, rep: 5,
    mags: ['Parts are just parts until a bench turns them into a gun. Queue one at your Assembly Bench.', 'The gun you craft is the gun you fight with. Sell them later and someone else fights with them.'] },
  { id: 'harvest', title: 'Harvest, dry, cure, pack', obj: 'Harvest a ripe plant. It dries (6h) and cures (10h) on its own; then pack the cured bud into baggies (Ledger > Production > Pack).', check: (f) => f.packed, rep: 5,
    mags: ['Ripe plants go on the drying line, then into jars to cure. Good curing turns Mid into Prime.', 'Pack cured bud into baggies for the street, jars for regulars, bricks for smugglers.'] },
  { id: 'sell', title: 'Street sales', obj: 'Sell 5 baggies at the Millbrook market stall (plaza). Watch the price fall as you sell: that is saturation.', check: (f, S) => (S.stats.unitsSold || 0) >= 5, rep: 5,
    mags: ["Millbrook's plaza has a market stall. Sell there. Push too much and the price sinks; demand recovers each day.", 'The Markets tab in your Ledger shows every price and why.'] },
  { id: 'heat', title: 'Heat', obj: 'A witness saw your deals. Open the Ledger (Tab) > Rivals & Heat and Lay Low for a day, or pay a bribe.', check: (f) => f.laidLow || f.bribed, rep: 2,
    mags: ['Someone saw you selling. That is heat. Watched, Hunted, Wanted, Crackdown: every step gets uglier.', 'Lay low for a day and heat cools fast. Or grease a palm. Either way, keep it under 40.'] },
  { id: 'hire', title: 'Hire help', obj: "Hire Mags' nephew Pell at the Millbrook tavern (Ledger > Crew > Recruit, or the tavern door) and assign him as a Farmer.", check: (f) => f.hiredNephew && f.nephewOnPlots, rep: 4,
    mags: ["My nephew Pell needs work and you need hands. He's at the Millbrook tavern. Free, this once.", 'Put him on the plots and he will water and feed them while you do the dangerous stuff.'] },
  { id: 'rob', title: 'The grain depot', obj: "Rob Millbrook's Grain Depot: plan it at the Job Board (Ledger > Jobs). Sneak in at night, or go loud. Then get clear of town.", check: (f) => f.robbed, rep: 4,
    mags: ['Time you learned the old trade. Millbrook keeps its harvest money in the Grain Depot vault.', 'Plan it at the Job Board: approach, recon, timing. Night and quiet is easiest. Loud works, but they remember.'] },
  { id: 'front', title: 'A front', obj: "Buy the Canteen on Millbrook's vacant lot with Mags' shell deal (Ledger > Businesses), then set a wash plan of at least $200.", check: (f) => f.boughtFront && f.laundered, rep: 8,
    mags: ['Dirty money is heavy and easy to steal. Wash it through a front. My shell company can buy your first one with dirty cash, for a fee.', 'Set a wash plan. Push more than the front can plausibly earn and the auditors come sniffing.'] },
];

export function tutorialStep(S) { return S.tutorial.on && !S.tutorial.done ? TUTORIAL[S.tutorial.step] : null; }

export function tutorialTick(S) {
  const t = S.tutorial;
  if (!t.on || t.done) return;
  const step = TUTORIAL[t.step];
  if (!t.shown[step.id]) { t.shown[step.id] = true; startStep(S, step); }
  if (step.check(t.flags, S)) {
    addRep(S, step.rep, 'tutorial');
    log(S, `Tutorial: "${step.title}" complete.`, 'good');
    t.step++;
    if (t.step >= TUTORIAL.length) finishTutorial(S);
  }
}

function startStep(S, step) {
  fx(S, 'dialog', { who: 'mags', lines: step.mags, title: step.title });
  if (step.id === 'heat') { addHeat(S, 'millbrook', 22, 'witness'); fx(S, 'witness'); }
  if (step.id === 'hire') placeNephew(S);
  if (step.id === 'front') S.unlocks = { ...(S.unlocks || {}), businesses: true };
}

export function placeNephew(S) {
  const list = S.candidates.millbrook || (S.candidates.millbrook = []);
  if (list.some((c) => c.special === 'nephew') || S.crew.some((c) => c.special === 'nephew')) return;
  const c = genRecruit(S, 'millbrook', { bg: 'farmhand', name: ['Pell', 'Kettle', ''], extra: { special: 'nephew', loyalty: 75 } });
  c.skills.farming = Math.max(c.skills.farming, 5);
  c.traits = ['green_thumb', 'loyal'];
  c.hidden = [false, false];
  c.vetted = true;
  c.wage = 18;
  list.unshift(c);
}

function finishTutorial(S) {
  S.tutorial.done = true;
  log(S, 'The Ledger is fully open. Use "What next?" in the tracker when unsure.', 'rank');
  journal(S, `Finished Mags' lessons on day ${S.day}.`);
  fx(S, 'dialog', { who: 'mags', title: 'On your own', lines: ["That's everything I can teach you for free. The Ledger has it all: crew, fronts, rivals, jobs.", 'Grow the empire. Mind the heat. And when you are big enough, come see me about New Haven.'] });
}

export function skipTutorial(S) {
  S.tutorial.done = true;
  S.tutorial.on = false;
  earn(S, 'dirty', 300, 'tutorial');
  placeNephew(S);
  log(S, "Tutorial skipped. Mags left you $300 and her nephew Pell is waiting at the Millbrook tavern.", 'info');
}

// Ledger tabs unlock progressively during the tutorial.
export function tabUnlocked(S, tab) {
  if (!S.tutorial.on || S.tutorial.done) return true;
  const s = S.tutorial.step;
  const need = { overview: 0, production: 0, inventory: 0, map: 0, journal: 0, perks: 0, markets: 0, heat: 4, crew: 6, jobs: 7, businesses: 8 }[tab];
  return s >= (need ?? 0);
}

// ---------- "What should I do next?" ----------
export function objectives(S) {
  const out = [];
  const step = tutorialStep(S);
  if (step) out.push({ text: step.obj, kind: 'tutorial' });
  if (S.defense) out.push({ text: `${S.defense.name} will hit the Hollow ${S.defense.day === S.day ? 'tonight' : 'tomorrow'} at ${S.defense.hour}:00!`, kind: 'urgent' });
  if (S.events.pending.length) out.push({ text: `Decide: ${EVENT[S.events.pending[0].id].title} (Ledger or the card)`, kind: 'event' });
  if (S.ending === null && rank(S) >= 5) out.push({ text: endgameHint(S), kind: 'endgame' });
  const cells = S.hollow.cells.filter(isPlot);
  const ripe = cells.filter((c) => c.plant && ready(S, c.plant)).length;
  if (ripe) out.push({ text: `Harvest ${ripe} ripe plant${ripe > 1 ? 's' : ''} at the Hollow.`, kind: 'farm' });
  const thirsty = cells.filter((c) => c.plant && !c.plant.dead && (c.plant.water < 25 || c.plant.nutr < 15)).length;
  if (thirsty && !S.crew.some((c) => c.job === 'farmer')) out.push({ text: `${thirsty} plant${thirsty > 1 ? 's need' : ' needs'} water or compost.`, kind: 'farm' });
  const empty = cells.filter((c) => !c.plant).length;
  const seeds = Object.keys(S.inv).filter((k) => k.startsWith('seed:')).length;
  if (empty && seeds) out.push({ text: `Plant ${empty} empty plot${empty > 1 ? 's' : ''}.`, kind: 'farm' });
  if (Object.keys(S.inv).some((k) => k.startsWith('bud:'))) out.push({ text: 'Pack your cured bud (Production > Pack).', kind: 'farm' });
  const packs = Object.keys(S.inv).filter((k) => k.startsWith('pack:'));
  if (packs.length) {
    const best = SETTLEMENT_IDS.concat(['crossroads']).filter((t) => tradeAllowed(S, t) && S.visited[t]).map((t) => [t, weedPrice(S, t, 'ashleaf', 1, 'baggie', 0).price]).sort((a, b) => b[1] - a[1])[0];
    if (best) out.push({ text: `Sell product: best street price in ${PLACE[best[0]].name} ($${best[1].toFixed(0)}/Mid baggie).`, kind: 'sell' });
  }
  const hot = SETTLEMENT_IDS.filter((t) => S.heat[t] >= 55);
  if (hot.length) out.push({ text: `Cool down ${PLACE[hot[0]].name} (heat ${Math.round(S.heat[hot[0]])}): lay low, bribe or tribute.`, kind: 'heat' });
  const idle = active(S).filter((c) => c.job === 'idle' && c.injured === 0).length;
  if (idle) out.push({ text: `${idle} crew idle: assign them (Crew > Auto-assign).`, kind: 'crew' });
  if (S.perkPts) out.push({ text: `Spend ${S.perkPts} perk point${S.perkPts > 1 ? 's' : ''} (Ledger > Perks).`, kind: 'perk' });
  if (S.businesses.some((b) => !b.washPlan) && S.money.dirty > 300) out.push({ text: 'Set a wash plan at your front.', kind: 'biz' });
  const r = rank(S);
  if (r < 5) out.push({ text: `Reach ${RANKS[r + 1].name}: ${Math.floor(S.rep)}/${RANKS[r + 1].rep} REP.`, kind: 'rank' });
  return out.slice(0, 4);
}

export function endgameHint(S) {
  const h = holds(S).length;
  if (S.compact.daybreak === 'repelled') return 'Storm the Council Hall in New Haven (Jobs) for The Crown.';
  if (S.defense && S.defense.daybreak) return 'Survive Operation Daybreak at the Hollow!';
  if (h < 3) return `Endgame: hold 3 settlements (now ${h}) by occupation or political control.`;
  const assets = cleanAssets(S);
  return `Endgame: The Crown (declare war on the Council) or The Ledger ($${Math.round(assets / 1000)}k/$2,000k clean assets, ${S.compact.seats}/${SEATS_NEEDED} seats).`;
}
