// Perks, achievements (30) and the stats page.
import { PERKS } from '../data/progress.js';
import { BLUEPRINTS } from '../data/guns.js';
import { log, fx, stat, addRep, rank } from './state.js';

export const ACHIEVEMENTS = [
  { id: 'first_sale', name: 'First Deal', desc: 'Sell your first unit on the street.', test: (S) => (S.stats.unitsSold || 0) >= 1 },
  { id: 'first_harvest', name: 'Green Thumbs', desc: 'Harvest a plant.', test: (S) => (S.stats.harvests || 0) >= 1 },
  { id: 'first_gun', name: 'Gunsmith', desc: 'Craft your first gun.', test: (S) => (S.stats.gunsCrafted || 0) >= 1 },
  { id: 'hustler', name: 'Hustler', desc: 'Reach the rank of Hustler.', test: (S) => rank(S) >= 1 },
  { id: 'supplier', name: 'Supplier', desc: 'Reach the rank of Supplier.', test: (S) => rank(S) >= 2 },
  { id: 'boss', name: 'Boss', desc: 'Reach the rank of Boss.', test: (S) => rank(S) >= 3 },
  { id: 'warlord', name: 'Warlord', desc: 'Reach the rank of Warlord.', test: (S) => rank(S) >= 4 },
  { id: 'kingpin', name: 'Kingpin', desc: 'Reach the rank of Kingpin.', test: (S) => rank(S) >= 5 },
  { id: 'first_front', name: 'Respectable', desc: 'Own a front business.', test: (S) => (S.stats.fronts || 0) >= 1 },
  { id: 'laundry', name: 'Laundromat', desc: 'Launder $10,000 in total.', test: (S) => (S.stats.laundered || 0) >= 10000 },
  { id: 'clean_hands', name: 'Clean Hands', desc: 'Hold $100,000 in clean money.', test: (S) => S.money.clean >= 100000 },
  { id: 'top_shelf', name: 'Top Shelf', desc: 'Cure a Legendary-quality batch.', test: (S) => (S.stats.legendaryBatches || 0) >= 1 },
  { id: 'botanist', name: 'Mad Botanist', desc: 'Discover a hybrid strain.', test: (S) => (S.stats.hybrids || 0) >= 1 },
  { id: 'codex', name: 'Strain Codex', desc: 'Discover 5 hybrid strains.', test: (S) => (S.stats.hybrids || 0) >= 5 },
  { id: 'masterwork', name: 'Masterwork', desc: 'Craft a Masterwork (or better) gun.', test: (S) => (S.stats.masterworks || 0) >= 1 },
  { id: 'legend_smith', name: 'Legendary Smith', desc: 'Craft a Legendary gun.', test: (S) => (S.stats.legendaryGuns || 0) >= 1 },
  { id: 'arsenal', name: 'Arsenal', desc: 'Know all 12 blueprints.', test: (S) => BLUEPRINTS.every((b) => S.bps[b.id]) },
  { id: 'organization', name: 'Organization', desc: 'Run 10 active crew at once.', test: (S) => S.crew.filter((c) => c.status === 'active').length >= 10 },
  { id: 'delegator', name: 'Delegator', desc: 'Promote a manager.', test: (S) => S.crew.some((c) => c.job === 'manager') },
  { id: 'vault_breaker', name: 'Vault Breaker', desc: 'Rob a settlement vault.', test: (S) => (S.stats.vaults || 0) >= 1 },
  { id: 'ghost', name: 'Ghost', desc: 'Finish a raid without ever being spotted.', test: (S) => (S.stats.ghostRaids || 0) >= 1 },
  { id: 'hold_line', name: 'Hold the Line', desc: 'Repel a raid on the Hollow.', test: (S) => (S.stats.defensesWon || 0) >= 1 },
  { id: 'gang_buster', name: 'Gang Buster', desc: 'Defeat a rival boss.', test: (S) => (S.stats.bossesDown || 0) >= 1 },
  { id: 'last_gang', name: 'Last Gang Standing', desc: 'Defeat all three rival bosses.', test: (S) => (S.stats.bossesDown || 0) >= 3 },
  { id: 'landlord', name: 'Landlord', desc: 'Occupy a settlement.', test: (S) => (S.stats.occupied || 0) >= 1 },
  { id: 'most_wanted', name: 'Most Wanted', desc: 'Trigger a Warden crackdown and live.', test: (S) => (S.stats.crackdowns || 0) >= 1 },
  { id: 'professional', name: 'Professional', desc: 'Complete 25 contracts.', test: (S) => (S.stats.contractsDone || 0) >= 25 },
  { id: 'millionaire', name: 'Dirty Millionaire', desc: 'Earn $1,000,000 dirty in total.', test: (S) => (S.stats.dirtyEarned || 0) >= 1000000 },
  { id: 'the_crown', name: 'The Crown', desc: 'Win the military ending.', test: (S) => S.flags.endCrown },
  { id: 'the_ledger', name: 'The Ledger', desc: 'Win the political ending.', test: (S) => S.flags.endLedger },
];

export function checkAchievements(S) {
  for (const a of ACHIEVEMENTS) {
    if (S.ach[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(S); } catch (e) { ok = false; }
    if (ok) {
      S.ach[a.id] = S.day;
      log(S, `ACHIEVEMENT: ${a.name} - ${a.desc}`, 'ach');
      fx(S, 'achievement', { id: a.id });
      addRep(S, 3, null, 'achievements');
    }
  }
}

// Perk tiers: tier t needs level >= 2 + 4t and t perks already taken in that tree.
export function perkState(S, id) {
  const p = PERKS[id];
  if (S.perks[id]) return 'owned';
  const inTree = Object.keys(S.perks).filter((k) => PERKS[k].tree === p.tree).length;
  if (S.level < 2 + 4 * p.tier) return `Level ${2 + 4 * p.tier}`;
  if (inTree < p.tier) return `${p.tier} ${p.tree} perk${p.tier > 1 ? 's' : ''} first`;
  if (S.perkPts < 1) return 'No points';
  return 'ok';
}

export function buyPerk(S, id) {
  const st = perkState(S, id);
  if (st !== 'ok') return { ok: false, msg: st === 'owned' ? 'Already owned.' : `Locked: ${st}.` };
  S.perkPts--;
  S.perks[id] = S.day;
  if (id === 'gun_hp') { S.player.maxHp += 25; S.player.hp += 25; }
  stat(S, 'perks');
  log(S, `Perk learned: ${PERKS[id].name}.`, 'good');
  return { ok: true, msg: `${PERKS[id].name} learned.` };
}

export const STAT_LABELS = [
  ['dirtyEarned', 'Dirty money earned', '$'], ['laundered', 'Money laundered', '$'], ['unitsSold', 'Units sold', ''], ['weedRevenue', 'Weed revenue', '$'],
  ['harvests', 'Harvests', ''], ['unitsGrown', 'Units grown', ''], ['hybrids', 'Hybrids discovered', ''], ['gunsCrafted', 'Guns crafted', ''],
  ['gunsSold', 'Guns sold', ''], ['masterworks', 'Masterworks', ''], ['components', 'Components machined', ''], ['ammoPressed', 'Rounds pressed', ''],
  ['contractsDone', 'Contracts done', ''], ['contractsFailed', 'Contracts failed', ''], ['vaults', 'Vaults robbed', ''], ['campsHit', 'Rival camps hit', ''],
  ['kills', 'Enemies downed', ''], ['kos', 'Silent takedowns', ''], ['deaths', 'Times downed', ''], ['shotsFired', 'Shots fired', ''],
  ['defensesWon', 'Hollow defenses won', ''], ['defensesLost', 'Hollow defenses lost', ''], ['bossesDown', 'Bosses defeated', ''], ['occupied', 'Settlements occupied', ''],
  ['hired', 'Crew hired', ''], ['crewLost', 'Crew lost', ''], ['audits', 'Audits suffered', ''], ['bribes', 'Bribes paid', ''],
  ['maxHeat', 'Highest heat', ''], ['eventsResolved', 'Events resolved', ''],
];
