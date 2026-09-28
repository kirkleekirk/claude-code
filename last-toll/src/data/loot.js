// Loot tables per container type. Weights are relative.
import { makeItem, def } from './items.js';

export const LOOT = {
  kitchen: [['beans', 6], ['crackers', 5], ['soda', 4], ['rice', 3], ['kitchen_knife', 1.2], ['cutlery', 3], ['glue', 2], ['cloth', 2], ['chemicals', 1.2], ['lighter', 1.5], ['whiskey', 1.5], ['jerky', 1.5]],
  dresser: [['cloth', 6], ['blanket', 3], ['jewelry', 2], ['watch', 1.5], ['belt', 2.5], ['battery', 2], ['pills', 2], ['bandage', 2], ['ammo_38', 1], ['ammo_9mm', 1], ['ammo_45', 0.5], ['phone', 2], ['clock', 2], ['leather', 1], ['revolver', 0.18], ['m1911', 0.08]],
  medcab: [['bandage', 6], ['pills', 4], ['antiseptic', 3], ['chemicals', 2], ['medkit', 0.6], ['adrenaline', 0.4], ['whiskey', 1]],
  toolbox: [['scrap', 6], ['fasteners', 6], ['tape', 5], ['glue', 3], ['hammer', 1], ['screwdriver', 1.5], ['crowbar', 0.6], ['steel', 2], ['toolkit', 1.5], ['battery', 2], ['electronics', 1]],
  locker: [['ammo_9mm', 4], ['ammo_12g', 3], ['ammo_38', 2], ['ammo_45', 1.5], ['arrow', 1.5], ['gunpowder', 3], ['fasteners', 3], ['steel', 2], ['leather', 2], ['pipe', 1], ['bat', 1], ['pistol', 0.45], ['m1911', 0.3], ['sawed_off', 0.35], ['old_rifle', 0.3], ['hunting_bow', 0.25], ['lever_rifle', 0.25], ['shotgun', 0.25], ['combat_knife', 0.7], ['fireworks', 1], ['bandage', 2], ['battery', 2]],
  fridge: [['soda', 4], ['beans', 1.5], ['jerky', 1], ['chemicals', 0.6]],
  crate: [['scrap', 5], ['fasteners', 4], ['electronics', 3], ['fertilizer', 2], ['chemicals', 3], ['tape', 3], ['steel', 3], ['radio', 2], ['gunpowder', 1.5], ['ammo_12g', 1], ['arrow', 0.8], ['cloth', 2], ['leather', 1.5], ['pipe_shotgun', 0.2], ['zip_pistol', 0.2]],
  trunk: [['scrap', 4], ['tape', 3], ['toolkit', 2], ['fasteners', 3], ['ammo_9mm', 2], ['ammo_38', 1], ['jerky', 2], ['bandage', 2], ['pipe', 1], ['bat', 0.8], ['battery', 2], ['ammo_12g', 1], ['crowbar', 0.4], ['revolver', 0.12], ['sawed_off', 0.12]],
  desk: [['electronics', 3], ['battery', 3], ['phone', 3], ['clock', 2], ['pills', 1], ['ammo_9mm', 1], ['tape', 2], ['glue', 2], ['radio', 1], ['watch', 1]],
  shelf: [['beans', 4], ['crackers', 4], ['soda', 3], ['jerky', 3], ['battery', 3], ['tape', 3], ['glue', 3], ['cloth', 2], ['chemicals', 2], ['rice', 2], ['bandage', 1.5]],
  guard: [['ecell', 5], ['nano_injector', 3], ['tlg_ration', 3], ['keycard', 1], ['ammo_308', 2], ['ammo_556', 2], ['ammo_9mm', 2], ['arc_carbine', 0.45], ['photon_pistol', 0.7], ['scatter_emitter', 0.3], ['beam_lance', 0.18], ['herder_horn', 0.25], ['thermal_knife', 0.35], ['shock_baton', 1], ['electronics', 3], ['medkit', 1.2], ['dogtags', 1.5], ['suppressor', 0.5]],
  guardDrop: [['ecell', 5], ['tlg_ration', 2.5], ['nano_injector', 1.6], ['keycard', 2], ['dogtags', 3], ['electronics', 1.5], ['shock_baton', 0.4], ['photon_pistol', 0.3]],
  crypt: [['jewelry', 3], ['watch', 2], ['rosary', 3], ['candles', 3], ['cloth', 2], ['whiskey', 1], ['ammo_38', 1], ['revolver', 0.25], ['m1911', 0.08], ['bandage', 1]],
  stilt: [['catfish', 4], ['whiskey', 2], ['chemicals', 3], ['leather', 3], ['fasteners', 2], ['cloth', 2], ['lighter', 2], ['ammo_12g', 1.5], ['ammo_38', 1], ['arrow', 1.5], ['bolt', 1.5], ['candles', 2], ['rosary', 1], ['machete', 0.5], ['shotgun', 0.25], ['sawed_off', 0.3], ['hunting_bow', 0.3], ['lever_rifle', 0.2], ['bandage', 1.5]],
  military: [['ecell', 1], ['nano_injector', 0.8], ['shock_baton', 0.5], ['ammo_308', 3], ['ammo_556', 4], ['ammo_12g', 4], ['ammo_9mm', 5], ['ammo_45', 2], ['mre', 4], ['medkit', 2], ['adrenaline', 1.5], ['gunpowder', 3], ['rifle', 0.6], ['shotgun', 0.8], ['pistol', 1], ['smg', 0.6], ['m17', 0.6], ['ar15', 0.45], ['m4', 0.3], ['combat_shotgun', 0.35], ['dmr', 0.25], ['tomahawk', 0.5], ['suppressor', 0.7], ['combat_knife', 1.2], ['machete', 1], ['bolt', 2], ['axe', 0.5]],
  floor: [['cloth', 3], ['scrap', 3], ['beans', 2], ['bandage', 1.5], ['battery', 1.5], ['tape', 1.5], ['ammo_9mm', 1], ['ammo_38', 0.6], ['soda', 2], ['clock', 1], ['phone', 1.5], ['lighter', 1], ['screwdriver', 0.6], ['pipe', 0.4], ['kitchen_knife', 0.6], ['hammer', 0.4], ['zip_pistol', 0.12], ['scrap_bow', 0.1]],
  walker: [['cloth', 3], ['phone', 2], ['watch', 1], ['lighter', 1.5], ['bandage', 1], ['ammo_9mm', 0.8], ['pills', 0.8], ['jerky', 0.8], ['belt', 1], ['battery', 0.8]],
};

const AMMO_QTY = { ammo_9mm: [5, 14], ammo_38: [3, 8], ammo_45: [3, 8], ammo_12g: [2, 6], ammo_556: [6, 18], ammo_308: [2, 5], arrow: [2, 5], bolt: [2, 4], ecell: [1, 2] };

// The best weapon tier a zone's loot can hold (Experimental only comes from the Guard).
function tierCap(table, zoneTier) {
  if (table === 'guard' || table === 'guardDrop') return 4;
  if (table === 'military') return Math.min(3, zoneTier + 1);
  return Math.min(3, zoneTier);
}

export function rollItem(rng, table, tier = 1) {
  const entries = LOOT[table] || LOOT.floor;
  // Higher tiers push rare entries (weight < 1.5) up a bit.
  const cap = tierCap(table, tier);
  const allowed = entries.filter(([id]) => (def(id).tier ?? 0) <= cap || def(id).cat !== 'weapon');
  const weighted = tier > 1 ? allowed.map(([id, w]) => [id, w < 1.5 ? w * (1 + 0.35 * (tier - 1)) : w]) : allowed;
  const id = rng.weighted(weighted);
  const d = def(id);
  let qty = 1;
  if (AMMO_QTY[id]) qty = rng.int(AMMO_QTY[id][0], AMMO_QTY[id][1]);
  else if (d.cat === 'mat') qty = rng.chance(0.3) ? 2 : 1;
  const opts = {};
  if (d.cat === 'weapon') {
    opts.dur = Math.round(d.dur * rng.range(0.35, 0.9));
    if (d.kind === 'gun') {
      opts.loaded = d.energy ? rng.int(0, d.cap) : rng.int(0, Math.max(1, Math.floor(d.cap / 2)));
      opts.chambered = false;
    }
  }
  return makeItem(id, qty, opts);
}

export function rollContainer(rng, table, tier = 1) {
  const r = rng.next();
  let n = r < 0.14 ? 0 : r < 0.62 ? 1 : r < 0.9 ? 2 : 3;
  if (table === 'military' || table === 'guard') n += 1;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rollItem(rng, table, tier));
  return out;
}
