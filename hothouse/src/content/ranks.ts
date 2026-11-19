/**
 * Empire Rank 1–10. XP thresholds are cumulative and tuned by the headless economy simulator
 * (see BALANCE.md) for: Rank 2 ≈ 10 min, Rank 3 ≈ 25 min, Rank 6 ≈ 90 min, finale-ready 2–3 h.
 *
 * Unlock ids are strings checked with `isUnlocked`: `app:*` phone apps, `feature:*` systems,
 * `property:*`, `station:*`, `front:*`. Items with their own `rank` field (strains, additives,
 * upgrades, placeables) unlock by rank directly and only appear here when worth a rank-up card.
 */

export interface RankUnlock {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly icon: string;
}

export interface RankDef {
  readonly rank: number;
  readonly title: string;
  readonly xp: number;
  /** Ofelia's line on the rank-up card. */
  readonly note: string;
  readonly unlocks: readonly RankUnlock[];
}

const u = (id: string, label: string, detail: string, icon: string): RankUnlock => ({ id, label, detail, icon });

export const RANKS: readonly RankDef[] = [
  { rank: 1, title: 'Seedling', xp: 0, note: 'Everybody starts in the dirt, mija. The good ones stay there a while.', unlocks: [
    u('app:messages', 'Messages', 'Customers text you. Tap a chip to answer.', 'chat'),
    u('station:workbench', 'Workbench', 'Mix additives into your harvest.', 'bowl'),
  ] },
  { rank: 2, title: 'Greenthumb', xp: 250, note: 'Look at you, keeping things alive. Your mother owes me five dollars.', unlocks: [
    u('app:upgrades', 'Upgrades', 'Drip irrigation and friends. Never refill again.', 'wrench'),
    u('app:market', 'Market', 'Order supplies to your drop box from the phone.', 'cart'),
    u('feature:moreStrains', 'New seeds', 'Neon Nana, Swamp Halo and Causeway Coral at Sod Almighty.', 'seed'),
  ] },
  { rank: 3, title: 'Hustler', xp: 900, note: 'You cannot do it all yourself. I tried. I had a lot of very tired Tuesdays.', unlocks: [
    u('feature:crew', 'First hire', 'Pilar wants in. Growers tend and harvest for you.', 'crew'),
    u('feature:samples', 'Free samples', 'Hand a sample to a stranger. Some become regulars.', 'gift'),
    u('feature:autoRestock', 'Auto-restock', 'Subscribe to seeds and additives so you never stall.', 'repeat'),
  ] },
  { rank: 4, title: 'Operator', xp: 1800, note: 'Two addresses now? Fancy. Remember which one has the good scissors.', unlocks: [
    u('property:palmettoGarage', 'Palmetto Garage', 'A second property with room to grow.', 'garage'),
    u('station:coldStill', 'Cold Still', 'Condense three Bloom into one Dew. Tier 2.', 'still'),
    u('feature:dealers', 'Dealers and turf', 'Put a dealer on a corner. They serve regulars for you.', 'map'),
  ] },
  { rank: 5, title: 'Supplier', xp: 2600, note: 'People are asking for you by name. Make sure it is a good name.', unlocks: [
    u('feature:fronts', 'Fronts', 'Buy a business to turn dirty cash clean.', 'bank'),
    u('station:breedingCabinet', 'Breeding Cabinet', 'Cross two strains and name the result.', 'dna'),
    u('feature:chauffeur', 'Chauffeur', 'Have a driver take you anywhere you own.', 'car'),
  ] },
  { rank: 6, title: 'Wholesaler', xp: 3600, note: 'Volume is a kind of love. A loud kind.', unlocks: [
    u('property:harborWarehouse', 'Harbor Warehouse 7', 'Big floor, loud neighbors, nobody looks twice.', 'warehouse'),
    u('station:sunPress', 'Sun Press', 'Press one Dew into six Halos for the VIP crowd.', 'press'),
    u('feature:wholesale', 'Dock wholesale', 'Bulk additives cheap at the fish market, mornings only.', 'crate'),
  ] },
  { rank: 7, title: 'Boss', xp: 5100, note: 'Boss. Hm. I preferred “that nice grandkid”, but fine.', unlocks: [
    u('property:stiltHouse', 'Sawgrass Stilt House', 'Off the grid, over the water.', 'house'),
    u('feature:guards', 'Guards', 'Hire muscle for raids and rival trouble.', 'shield'),
    u('upgrade:secretPage', 'The Secret Page', 'Room for a fifth effect. My best work is on it.', 'page'),
  ] },
  { rank: 8, title: 'Mogul', xp: 6400, note: 'Billboards with your name on them. I hope you picked a good font.', unlocks: [
    u('front:clubAftersun', 'Club Aftersun', 'The hottest door in Deco Row, once it is yours.', 'disco'),
    u('feature:billboards', 'Billboards', 'Buy the sky over the Causeway. Hype goes up.', 'billboard'),
    u('feature:yachtVips', 'Yacht VIPs', 'Isla Dorada wants Halos, delivered by boat.', 'boat'),
  ] },
  { rank: 9, title: 'Kingpin', xp: 7800, note: 'The weather man keeps saying my name. Well, a storm’s name. Same energy.', unlocks: [
    u('property:penthouse', 'Dorada Penthouse', 'Glass, gold and a view of everything you own.', 'tower'),
    u('feature:hurricaneWatch', 'Hurricane Watch', 'A storm is coming. So is Zen Montrose.', 'storm'),
  ] },
  { rank: 10, title: 'Coast Royalty', xp: 9800, note: 'You did it. Water twice, worry never. Now go to bed.', unlocks: [
    u('feature:ending', 'The morning after', 'Go legit or take the crown. The coast is yours either way.', 'crown'),
  ] },
];

export const MAX_RANK = RANKS.length;

export function rankDef(rank: number): RankDef {
  return RANKS[Math.min(MAX_RANK, Math.max(1, rank)) - 1]!;
}

/** Rank reached with `xp` total XP. */
export function rankForXp(xp: number): number {
  let r = 1;
  for (const d of RANKS) if (xp >= d.xp) r = d.rank;
  return r;
}

/** Every unlock id granted at or below a rank. */
export function unlocksUpTo(rank: number): string[] {
  return RANKS.filter((d) => d.rank <= rank).flatMap((d) => d.unlocks.map((x) => x.id));
}

/** The rank that grants an unlock id, if any. */
export function rankOfUnlock(id: string): number | null {
  for (const d of RANKS) if (d.unlocks.some((x) => x.id === id)) return d.rank;
  return null;
}
