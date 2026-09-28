import { def } from '../data/items.js';
import { modDef, SLOT_LABEL } from '../data/mods.js';

// A weapon's effective stats: its base definition with every installed mod applied.
// Combat, the HUD and the gunsmith bench all read stats through here.

const cache = new WeakMap();

function sig(item) {
  const m = item.mods;
  if (!m) return '';
  return Object.keys(m).sort().map((k) => `${k}=${m[k]}`).join(',');
}

export function applyMods(base, mods) {
  const s = { ...base };
  for (const id of Object.values(mods || {})) {
    const m = modDef(id);
    if (!m) continue;
    const fx = m.fx;
    if (fx.mul) for (const [k, v] of Object.entries(fx.mul)) s[k] = (s[k] ?? (k === 'reloadMul' ? 1 : 0)) * v;
    if (fx.add) for (const [k, v] of Object.entries(fx.add)) s[k] = (s[k] ?? 0) + v;
    if (fx.set) for (const [k, v] of Object.entries(fx.set)) s[k] = v;
  }
  s.cap = Math.max(1, Math.round(s.cap || 1));
  s.pellets = Math.max(1, Math.round(s.pellets || 1));
  return s;
}

// Stats for an item instance, cached until its mods change.
export function weaponStats(item) {
  if (!item) return null;
  const d = def(item.id);
  if (d.kind !== 'gun') return d;
  const key = sig(item);
  const c = cache.get(item);
  if (c && c.key === key) return c.stats;
  const stats = applyMods(d, item.mods);
  stats.id = item.id;
  cache.set(item, { key, stats });
  return stats;
}

// Keep a gun's loaded state valid after its magazine size changes.
export function clampLoaded(item) {
  const s = weaponStats(item);
  if (item.gun && item.gun.loaded > s.cap) item.gun.loaded = s.cap;
}

export function modList(item) {
  return Object.entries(item.mods || {}).map(([slot, id]) => ({ slot, label: SLOT_LABEL[slot], mod: modDef(id) })).filter((x) => x.mod);
}

// Ratings on a 0..100 scale for the bench's comparison bars.
export function ratings(s) {
  if (s.kind !== 'gun') return null;
  if (s.sonic) {
    return [
      ['Knockdown range', Math.min(100, (s.sonicRange || 9) * 8)],
      ['Spread', Math.min(100, (1 - (s.sonicArc || 0.78)) * 250)],
      ['Blasts per cell', Math.min(100, s.cap * 18)],
      ['Stealth', Math.max(0, 100 - s.noise)],
    ];
  }
  const dmg = s.bodyDmg * s.pellets * (s.dual ? 2 : 1) + s.headDmg * 0.15;
  const acc = 100 - Math.min(100, (s.spreadAds + (s.pelletSpread || 0) * 0.35) * 55);
  const rate = s.auto ? 100 : Math.min(100, 30 / (s.rate + (s.draw || 0) + (s.chargeTime || 0)) * 1.2);
  return [
    ['Damage', Math.min(100, dmg / 2.4)],
    ['Accuracy', Math.max(4, acc)],
    ['Handling', Math.max(4, 100 - s.recoil * 11)],
    ['Fire rate', Math.max(4, rate)],
    ['Capacity', Math.min(100, s.cap * 3.2 + 6)],
    ['Stealth', Math.max(3, 100 - s.noise)],
  ];
}

// Plain-language traits for a set of stats.
export function traits(s) {
  const t = [];
  if (s.incendiary) t.push('Sets the dead on fire');
  if (s.explosive) t.push('Explosive hits');
  if (s.armorPierce) t.push('Pierces helmets');
  if ((s.penetrate || 1) > 1) t.push(`Goes through ${s.penetrate}`);
  if (s.knockdown) t.push('Knocks them down');
  if (s.dual) t.push('Fires both barrels');
  if (s.auto) t.push('Full auto');
  if (s.scope) t.push('Scoped');
  if (s.retrievable) t.push('Recover the ammo');
  if (s.sonic) t.push('Knocks down a crowd');
  if (s.noise <= 20 && !s.sonic) t.push('Quiet');
  return t;
}
