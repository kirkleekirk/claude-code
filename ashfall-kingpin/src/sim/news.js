// The Ash Courier (daily broadsheet) and radio ticker: market news, rumours, flavour, hints.
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { CONTRACT } from '../data/contracts.js';
import { rpick, rint, rchance } from '../core/rng.js';
import { weedPrice, sat, tradeAllowed } from './economy.js';
import { heatLevel, HEAT_LEVELS } from './heat.js';

const FLAVOR = [
  'Millbrook goat wins third straight "Least Bitey" ribbon.',
  'Foundry announces Tuesday is now officially Tuesday again.',
  'Saint Verity bans whistling after dark, citing "tone".',
  'Harbor Nine fishermen report fish. Experts baffled.',
  'Local man trades rifle for radio, regrets nothing, owns no rifle.',
  'New Haven Council debates whether ash counts as weather.',
  'Copper Gate miners strike gold; turns out to be brass; morale unaffected.',
  'Dust storm cancels outdoor choir. Ash Choir unavailable for comment.',
  'Crossroads trader sells umbrella in a drought. Is arrested for optimism.',
  'Water tower in the south leaning "on purpose", says owner.',
  'Rail spur rumoured to carry trains again. Rumour is rusty.',
  'Feral dog pack elects new leader. Old leader declines comment.',
  'Saint Verity pilgrims walk 40 miles to see a slightly cleaner wall.',
  'Compact Wardens to receive new boots. Old boots reportedly furious.',
  'Mags of Crossroads denies existence of Mags of Crossroads.',
  'Survey: 9 in 10 wastelanders prefer "not dying" to "dying".',
  'Foundry smelter declared "too hot" by man who touched it.',
  'Harbor Nine customs seizes crate of crates.',
  'Bandit apologises for robbing wrong caravan, robs right one.',
  'Ash fall gives sunset "a very nice brown", says painter.',
];

const RUMOR_CONTRACT = (S) => {
  const o = S.contracts.board[0];
  if (!o) return null;
  return `Word on the street: someone wants a "${CONTRACT[o.tpl].name}" job done. Check the Job Board.`;
};

export function marketHeadline(S) {
  const towns = SETTLEMENT_IDS.concat(['crossroads']).filter((t) => S.visited[t]);
  if (!towns.length) return null;
  const prices = towns.map((t) => [t, weedPrice(S, t, 'ashleaf', 1, 'baggie', 0).price, sat(S, t, 'weed')]);
  prices.sort((a, b) => b[1] - a[1]);
  const hi = prices[0], lo = prices[prices.length - 1];
  if (lo[2] > 0.4) return `MARKETS: ${PLACE[lo[0]].name} is drowning in product (saturation ${Math.round(lo[2] * 100)}%). Buyers in ${PLACE[hi[0]].name} pay best.`;
  return `MARKETS: Best street price in ${PLACE[hi[0]].name} ($${hi[1].toFixed(0)} a Mid baggie). Cheapest in ${PLACE[lo[0]].name}.`;
}

export function dailyNews(S) {
  const items = [];
  const mh = marketHeadline(S);
  if (mh) items.push(mh);
  const hot = SETTLEMENT_IDS.slice().sort((a, b) => S.heat[b] - S.heat[a])[0];
  if (S.heat[hot] >= 20) items.push(`LAW: Wardens report "${HEAT_LEVELS[heatLevel(S.heat[hot])].name.toLowerCase()}" activity in ${PLACE[hot].name}. Patrols doubled.`);
  const r = Object.values(S.rivals).filter((x) => x.alive).sort((a, b) => b.strength - a.strength)[0];
  if (r) items.push(`GANGS: ${r.name} grow bolder; ${r.leader} ${r.lastMove === 'expand' ? 'moves into new turf' : r.lastMove === 'undercut' ? 'is selling cheap' : r.lastMove === 'raid' ? 'was seen sharpening knives' : 'holds court'}.`);
  const rum = RUMOR_CONTRACT(S);
  if (rum) items.push(rum);
  for (const t of SETTLEMENT_IDS) if (S.towns[t].status === 'devastated') { items.push(`${PLACE[t].name.toUpperCase()} IN RUINS after repeated robberies. Trade collapses.`); break; }
  items.push('ODDITIES: ' + rpick(S, FLAVOR));
  const paper = { day: S.day, items: items.slice(0, 5) };
  S.news.push(paper);
  if (S.news.length > 30) S.news.shift();
  return paper;
}

export function radioLine(S) {
  const roll = rint(S, 0, 5);
  if (roll === 0) return marketHeadline(S) || rpick(S, FLAVOR);
  if (roll === 1 && S.contracts.board.length) return RUMOR_CONTRACT(S);
  if (roll === 2) { const t = rpick(S, SETTLEMENT_IDS); return `RADIO ASH: ${PLACE[t].name} weather: ${rpick(S, ['dusty', 'ashy', 'grey', 'windy', 'oddly pleasant'])}. Heat level: ${HEAT_LEVELS[heatLevel(S.heat[t])].name}.`; }
  if (roll === 3 && rchance(S, 0.5)) return `RADIO ASH: The Compact reminds citizens that crime is "frowned upon".`;
  return 'RADIO ASH: ' + rpick(S, FLAVOR);
}
