// Loot tables per container type. Weights are relative.
import { makeItem, def } from './items.js';

export const LOOT = {
  kitchen: [['beans', 6], ['crackers', 5], ['soda', 4], ['rice', 3], ['kitchen_knife', 1.2], ['cutlery', 3], ['glue', 2], ['cloth', 2], ['chemicals', 1.2], ['lighter', 1.5], ['whiskey', 1.5], ['jerky', 1.5]],
  dresser: [['cloth', 6], ['blanket', 3], ['jewelry', 2], ['watch', 1.5], ['belt', 2.5], ['battery', 2], ['pills', 2], ['bandage', 2], ['ammo_38', 1], ['ammo_9mm', 1], ['phone', 2], ['clock', 2], ['leather', 1]],
  medcab: [['bandage', 6], ['pills', 4], ['antiseptic', 3], ['chemicals', 2], ['medkit', 0.6], ['adrenaline', 0.4], ['whiskey', 1]],
  toolbox: [['scrap', 6], ['fasteners', 6], ['tape', 5], ['glue', 3], ['hammer', 1], ['screwdriver', 1.5], ['crowbar', 0.6], ['steel', 2], ['toolkit', 1.5], ['battery', 2], ['electronics', 1]],
  locker: [['ammo_9mm', 4], ['ammo_12g', 3], ['ammo_38', 2], ['gunpowder', 3], ['fasteners', 3], ['steel', 2], ['leather', 2], ['pipe', 1], ['bat', 1], ['pistol', 0.45], ['combat_knife', 0.7], ['fireworks', 1], ['bandage', 2], ['battery', 2]],
  fridge: [['soda', 4], ['beans', 1.5], ['jerky', 1], ['chemicals', 0.6]],
  crate: [['scrap', 5], ['fasteners', 4], ['electronics', 3], ['fertilizer', 2], ['chemicals', 3], ['tape', 3], ['steel', 3], ['radio', 2], ['gunpowder', 1.5], ['ammo_12g', 1], ['cloth', 2], ['leather', 1.5]],
  trunk: [['scrap', 4], ['tape', 3], ['toolkit', 2], ['fasteners', 3], ['ammo_9mm', 2], ['jerky', 2], ['bandage', 2], ['pipe', 1], ['bat', 0.8], ['battery', 2], ['ammo_12g', 1], ['crowbar', 0.4]],
  desk: [['electronics', 3], ['battery', 3], ['phone', 3], ['clock', 2], ['pills', 1], ['ammo_9mm', 1], ['tape', 2], ['glue', 2], ['radio', 1], ['watch', 1]],
  shelf: [['beans', 4], ['crackers', 4], ['soda', 3], ['jerky', 3], ['battery', 3], ['tape', 3], ['glue', 3], ['cloth', 2], ['chemicals', 2], ['rice', 2], ['bandage', 1.5]],
  military: [['ammo_308', 4], ['ammo_12g', 4], ['ammo_9mm', 5], ['mre', 4], ['medkit', 2], ['adrenaline', 1.5], ['gunpowder', 3], ['rifle', 0.8], ['shotgun', 1], ['pistol', 1.2], ['suppressor', 0.7], ['combat_knife', 1.2], ['machete', 1], ['bolt', 2], ['crossbow', 0.45], ['axe', 0.5]],
  floor: [['cloth', 3], ['scrap', 3], ['beans', 2], ['bandage', 1.5], ['battery', 1.5], ['tape', 1.5], ['ammo_9mm', 1], ['soda', 2], ['clock', 1], ['phone', 1.5], ['lighter', 1], ['screwdriver', 0.6], ['pipe', 0.4], ['kitchen_knife', 0.6], ['hammer', 0.4]],
  walker: [['cloth', 3], ['phone', 2], ['watch', 1], ['lighter', 1.5], ['bandage', 1], ['ammo_9mm', 0.8], ['pills', 0.8], ['jerky', 0.8], ['belt', 1], ['battery', 0.8]],
};

const AMMO_QTY = { ammo_9mm: [5, 14], ammo_38: [3, 8], ammo_12g: [2, 6], ammo_308: [2, 5], bolt: [2, 4] };

export function rollItem(rng, table, tier = 1) {
  const entries = LOOT[table] || LOOT.floor;
  // Higher tiers push rare entries (weight < 1.5) up a bit.
  const weighted = tier > 1 ? entries.map(([id, w]) => [id, w < 1.5 ? w * (1 + 0.35 * (tier - 1)) : w]) : entries;
  const id = rng.weighted(weighted);
  const d = def(id);
  let qty = 1;
  if (AMMO_QTY[id]) qty = rng.int(AMMO_QTY[id][0], AMMO_QTY[id][1]);
  else if (d.cat === 'mat') qty = rng.chance(0.3) ? 2 : 1;
  const opts = {};
  if (d.cat === 'weapon') {
    opts.dur = Math.round(d.dur * rng.range(0.35, 0.9));
    if (d.kind === 'gun') {
      opts.loaded = rng.int(0, Math.max(1, Math.floor(d.cap / 2)));
      opts.chambered = false;
    }
  }
  return makeItem(id, qty, opts);
}

export function rollContainer(rng, table, tier = 1) {
  const r = rng.next();
  let n = r < 0.14 ? 0 : r < 0.62 ? 1 : r < 0.9 ? 2 : 3;
  if (table === 'military') n += 1;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rollItem(rng, table, tier));
  return out;
}
