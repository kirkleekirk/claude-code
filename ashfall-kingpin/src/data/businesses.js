// Front businesses. cost = clean $. rev = base legit revenue per day. upkeep = share of revenue
// spent on legit costs. wash = days a laundering batch takes. audit = audit-risk multiplier.

export const BUSINESSES = {
  canteen: { name: 'Canteen', cost: 450, rev: 150, upkeep: 0.55, wash: 1, audit: 0.7, rank: 0, staff: 1, icon: 'sack', special: 'Reliable, low-risk laundering. Good first front.' },
  waterco: { name: 'Water Co.', cost: 2600, rev: 260, upkeep: 0.45, wash: 3, audit: 0.3, rank: 1, staff: 1, icon: 'drop', special: 'Slow, steady, very low audit risk.' },
  garage: { name: 'Garage', cost: 1900, rev: 230, upkeep: 0.5, wash: 2, audit: 0.9, rank: 1, staff: 2, icon: 'gear', special: 'Repairs vehicles, hides cargo: street-sale heat in this town -30%.' },
  pawn: { name: 'Pawn Shop', cost: 1600, rev: 210, upkeep: 0.5, wash: 2, audit: 1.1, rank: 1, staff: 1, icon: 'ring', special: 'Fences loot from the Ledger at 85% value.' },
  bathhouse: { name: 'Bathhouse', cost: 3200, rev: 380, upkeep: 0.5, wash: 2, audit: 1.0, rank: 2, staff: 2, icon: 'drop', special: 'High foot traffic. Informants: a free tip-off every 2 days.' },
  brewery: { name: 'Brewery', cost: 4200, rev: 300, upkeep: 0.5, wash: 2, audit: 1.3, rank: 2, staff: 2, icon: 'jug', special: 'Brews moonshine daily (grain + fuel). High margin, big heat.' },
  clinic: { name: 'Clinic', cost: 5200, rev: 420, upkeep: 0.55, wash: 2, audit: 0.8, rank: 2, staff: 2, icon: 'meds', special: 'Injured crew heal 3x faster; pays to bury witness reports (-heat).' },
  tradepost: { name: 'Trading Post', cost: 6000, rev: 520, upkeep: 0.5, wash: 2, audit: 1.0, rank: 2, staff: 2, icon: 'case', special: 'Extra market: bulk sales here at -15% with no heat.' },
  fightpit: { name: 'Fight Pit', cost: 7800, rev: 620, upkeep: 0.45, wash: 1, audit: 1.4, rank: 3, staff: 2, icon: 'fist', special: 'Gambling take (dirty) + spectators boost REP daily.' },
  radio: { name: 'Radio Station', cost: 9500, rev: 500, upkeep: 0.5, wash: 3, audit: 0.6, rank: 3, staff: 2, icon: 'speaker', special: 'Broadcasts sway attitudes: -1.5 heat/day in its town, +goodwill.' },
  casino: { name: 'Casino', cost: 50000, rev: 6000, upkeep: 0.5, wash: 1, audit: 1.8, rank: 3, staff: 4, icon: 'dice', special: 'Massive laundering capacity and massive audit risk.' },
};
export const BUSINESS_IDS = Object.keys(BUSINESSES);

// Upgrades every front can take. cost = multiple of the business cost.
export const BIZ_UPGRADES = {
  expand: { name: 'Expand', costMult: [1.0, 2.0], max: 2, desc: 'Size level +1: revenue x1.5 / x2.0.' },
  books: { name: 'Clean Books', costMult: [0.5], max: 1, desc: 'Audit risk grows 40% slower and decays faster.' },
  backroom: { name: 'Hidden Back Room', costMult: [0.6], max: 1, desc: 'Choose: +$5,000 safe storage, +2 hidden grow slots, or a distribution point (dealers here +20% volume, -20% heat).' },
  signage: { name: 'Neon Signage', costMult: [0.3], max: 1, desc: 'Foot traffic +20%. Glows at night.' },
};

export const RACKETS = {
  protection: { name: 'Protection', rank: 2, desc: 'Weekly tribute from small businesses. Needs an enforcer in town. +heat.' },
  loans: { name: 'Loan Sharking', rank: 2, desc: 'Lend clean cash at interest; enforcers collect.' },
};

export const COUNCIL_SEATS = 12;
export const SEATS_NEEDED = 7;
export const SEAT_COST = (n) => ({ clean: 30000 + n * 12000, favors: 1 + Math.floor(n / 2) });
