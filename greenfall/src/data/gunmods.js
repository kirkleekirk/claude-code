// Weapon mods, installed at workbenches. Every mod has an upside and a downside, shown as
// ▲/▼ lines on its card, the same way classes are shown. A gun holds one mod per slot.
// Basic mods can be built by anyone. Advanced mods (`bp: true`) need their blueprint:
// Engineers know them all; everyone else learns them from blueprints found as loot.
// `gunStats(slot)` returns the gun's final numbers (rarity + mods); everything that fires,
// reloads or displays a gun reads from it.
import { WEAPONS, ITEMS, LOOT } from './items.js';

export const MOD_SLOTS = [
  ['barrel', 'Barrel'], ['muzzle', 'Muzzle'], ['sight', 'Sight'], ['stock', 'Stock'], ['grip', 'Grip'], ['mag', 'Magazine'],
];
export const SLOT_NAME = Object.fromEntries(MOD_SLOTS);

// percent changes; `lower: true` means a smaller number is better
export const STAT_INFO = {
  damage: { label: 'Damage' },
  rate: { label: 'Fire rate' },
  acc: { label: 'Accuracy' },
  hipAcc: { label: 'Hip-fire accuracy' },
  adsAcc: { label: 'Aimed accuracy' },
  pspread: { label: 'Pellet spread', lower: true },
  pellets: { label: 'Pellets', unit: '' },
  range: { label: 'Range' },
  recoil: { label: 'Recoil', lower: true },
  mag: { label: 'Magazine size' },
  reload: { label: 'Reload speed' },
  noise: { label: 'Gunshot noise', lower: true },
  move: { label: 'Move speed while held' },
};

const RIFLES = ['m4', 'ak'];
export const MODS = {
  // ---- barrel ----
  long: { slot: 'barrel', name: 'Long Barrel', guns: ['pistol', 'mp5', ...RIFLES, 'pump', 'scout'], cost: { metal: 50 }, fx: { range: 30, acc: 15, move: -5 } },
  ext: { bp: true, slot: 'barrel', name: 'Extended Barrel', guns: [...RIFLES, 'scout', 'longrifle', 'longrev', 'pump'], cost: { metal: 90 }, fx: { range: 60, acc: 25, damage: 5, move: -10, hipAcc: -20 } },
  short: { slot: 'barrel', name: 'Short Barrel', guns: ['mp5', ...RIFLES], cost: { metal: 30 }, fx: { move: 6, hipAcc: 20, range: -35, adsAcc: -15 } },
  sawed: { slot: 'barrel', name: 'Sawed-Off Barrel', guns: ['pump'], cost: { metal: 20 }, fx: { damage: 12, move: 6, range: -40, pspread: 35 } },
  // ---- muzzle ----
  suppressor: { bp: true, slot: 'muzzle', name: 'Suppressor', guns: ['pistol', 'mp5', ...RIFLES, 'scout', 'longrifle'], cost: { metal: 70 }, fx: { noise: -80, damage: -8, range: -10 }, flags: { suppressed: true } },
  comp: { slot: 'muzzle', name: 'Compensator', guns: ['pistol', 'mp5', ...RIFLES, 'snub', 'longrev'], cost: { metal: 40 }, fx: { recoil: -35, noise: 15 } },
  fullchoke: { bp: true, slot: 'muzzle', name: 'Full Choke', guns: ['pump'], cost: { metal: 40 }, fx: { pspread: -35, range: 40 }, note: 'Tight pattern: easy to miss up close' },
  spreadchoke: { bp: true, slot: 'muzzle', name: 'Spreader Choke', guns: ['pump'], cost: { metal: 40 }, fx: { pspread: 40, pellets: 2, range: -30 } },
  // ---- sight ----
  reddot: { slot: 'sight', name: 'Red Dot', guns: ['pistol', 'mp5', ...RIFLES, 'longrev', 'pump'], cost: { metal: 40 }, fx: { adsAcc: 25, hipAcc: -5 }, flags: { adsFov: 46 } },
  scope4: { bp: true, slot: 'sight', name: '4× Scope', guns: [...RIFLES, 'longrev'], cost: { metal: 80 }, fx: { adsAcc: 45, hipAcc: -15, move: -4 }, flags: { scope: true, zoom: 24 } },
  // ---- stock ----
  padded: { slot: 'stock', name: 'Padded Stock', guns: ['mp5', ...RIFLES, 'pump', 'scout', 'longrifle'], cost: { wood: 30, metal: 20 }, fx: { recoil: -35, adsAcc: 10, move: -5 } },
  folding: { slot: 'stock', name: 'Folding Stock', guns: ['mp5', ...RIFLES, 'pump'], cost: { metal: 40 }, fx: { move: 7, hipAcc: 10, recoil: 30 } },
  // ---- grip ----
  vgrip: { slot: 'grip', name: 'Vertical Grip', guns: ['mp5', ...RIFLES, 'pump'], cost: { wood: 10, metal: 30 }, fx: { hipAcc: 20, recoil: -15, reload: -10 } },
  agrip: { bp: true, slot: 'grip', name: 'Angled Grip', guns: ['mp5', ...RIFLES], cost: { wood: 10, metal: 30 }, fx: { reload: 15, adsAcc: 10, hipAcc: -10 } },
  rubber: { slot: 'grip', name: 'Rubber Grip', guns: ['pistol', 'snub', 'longrev'], cost: { metal: 20 }, fx: { recoil: -30, hipAcc: 10, reload: -10 } },
  // ---- magazine ----
  extmag: { slot: 'mag', name: 'Extended Mag', guns: ['pistol', 'mp5', ...RIFLES, 'scout'], cost: { metal: 60 }, fx: { mag: 50, reload: -20, move: -3 } },
  drum: { bp: true, slot: 'mag', name: 'Drum Mag', guns: RIFLES, cost: { metal: 120 }, fx: { mag: 150, reload: -45, move: -10 } },
  speedloader: { slot: 'mag', name: 'Speed Loader', guns: ['snub', 'longrev'], cost: { metal: 40 }, fx: { reload: 45, move: -3 } },
  saddle: { slot: 'mag', name: 'Side Saddle', guns: ['pump'], cost: { wood: 10, metal: 30 }, fx: { reload: 30, move: -4 } },
  tube: { bp: true, slot: 'mag', name: 'Tube Extension', guns: ['pump'], cost: { metal: 60 }, fx: { mag: 40, move: -5 } },
};
for (const id in MODS) MODS[id].id = id;

// blueprint loot items, one per advanced mod
export const BLUEPRINT_MODS = Object.values(MODS).filter((m) => m.bp);
for (const m of BLUEPRINT_MODS) ITEMS['bp_' + m.id] = { type: 'blueprint', name: `${m.name} Blueprint`, mod: m.id, stack: 1, icon: '📐', color: '#5ab0ff', value: 25 };
LOOT.blueprint = BLUEPRINT_MODS.map((m) => ['bp_' + m.id, m.id === 'suppressor' || m.id === 'drum' ? 6 : 10]);

// can this survivor build this mod?
export const knowsMod = (s, m) => !m.bp || !!s.mods?.has?.('blueprints') || !!s.blueprints?.has(m.id);
// what a mod costs this survivor (Engineers pay less)
export function costFor(s, m) {
  const k = s.mods?.get ? s.mods.get('modCost') : 1;
  return Object.fromEntries(Object.entries(m.cost).map(([mat, v]) => [mat, Math.max(1, Math.round(v * k))]));
}

export const canMod = (gunId) => Object.values(MODS).some((m) => m.guns.includes(gunId));
export function modsFor(gunId, slot = null) { return Object.values(MODS).filter((m) => m.guns.includes(gunId) && (!slot || m.slot === slot)); }
export function slotsFor(gunId) { return MOD_SLOTS.filter(([k]) => modsFor(gunId, k).length); }

// ▲/▼ lines for a mod card
export function modLines(m) {
  const out = [];
  for (const [k, v] of Object.entries(m.fx)) {
    const info = STAT_INFO[k];
    const good = info.lower ? v < 0 : v > 0;
    const text = k === 'pellets' ? `${v > 0 ? '+' : ''}${v} pellets` : `${v > 0 ? '+' : ''}${v}% ${info.label.toLowerCase()}`;
    out.push({ good, text });
  }
  if (m.flags?.suppressed) out.push({ good: true, text: 'Zombies barely hear it' });
  if (m.flags?.scope) out.push({ good: true, text: 'Scope view when aiming' });
  if (m.note) out.push({ good: false, text: m.note });
  return out.sort((a, b) => b.good - a.good);
}

const pct = (v) => 1 + v / 100;
export function gunStats(slot) {
  const def = WEAPONS[slot.id];
  const mods = slot.mods || {};
  const key = slot.id + '|' + slot.r + '|' + Object.values(mods).join(',');
  if (slot._st && slot._k === key) return slot._st;
  const r = slot.r ?? 0;
  const st = {
    id: slot.id, name: def.name, model: def.model, ammo: def.ammo, melee: !!def.melee, auto: !!def.auto, perShell: !!def.perShell, projectile: !!def.projectile,
    dmg: def.dmg[r] ?? def.dmg[def.dmg.length - 1], head: def.head, rate: def.rate, hipRate: def.hipRate || 1,
    spread: def.spread ?? 0, adsSpread: def.adsSpread ?? 0, bloom: def.bloom ?? 0, recoil: def.recoil ?? 0, range: def.range, falloff: !def.pellets && def.range < 160,
    mag: def.mag ?? 0, reload: def.reload ? (def.reload[r] ?? def.reload[0]) : 0, noise: def.noise ?? 0, suppressed: !!def.suppressed,
    scope: !!def.scope, zoom: def.zoom || 16, adsFov: 52, pellets: def.pellets || 0, move: 1, speed: def.speed, drop: def.drop, sound: def.sound || def.model,
  };
  for (const sl in mods) {
    const m = MODS[mods[sl]];
    if (!m || !m.guns.includes(slot.id)) continue;
    for (const [k, v] of Object.entries(m.fx)) {
      switch (k) {
        case 'damage': st.dmg *= pct(v); break;
        case 'rate': st.rate *= pct(v); break;
        case 'acc': st.spread /= pct(v); st.adsSpread /= pct(v); break;
        case 'hipAcc': st.spread /= pct(v); break;
        case 'adsAcc': st.adsSpread /= pct(v); break;
        case 'pspread': st.spread *= pct(v); st.adsSpread *= pct(v); break;
        case 'pellets': st.pellets += v; break;
        case 'range': st.range *= pct(v); break;
        case 'recoil': st.recoil *= pct(v); st.bloom *= pct(v); break;
        case 'mag': st.mag = Math.max(1, Math.round(st.mag * pct(v))); break;
        case 'reload': st.reload /= pct(v); break;
        case 'noise': st.noise *= pct(v); break;
        case 'move': st.move *= pct(v); break;
      }
    }
    const f = m.flags || {};
    if (f.suppressed) { st.suppressed = true; st.sound = 'suppressed'; }
    if (f.scope) { st.scope = true; st.zoom = f.zoom; }
    if (f.adsFov) st.adsFov = f.adsFov;
  }
  st.dmg = Math.round(st.dmg * 10) / 10;
  slot._st = st; slot._k = key;
  return st;
}

export function canAfford(s, cost) { return Object.entries(cost).every(([k, v]) => (s.inv.mats[k] ?? 0) >= v); }
export function costText(cost) { return Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(' + '); }

// install / remove. Keeps the loaded rounds legal when the magazine size changes.
export function installMod(s, slot, modId) {
  const m = MODS[modId];
  if (!m || !m.guns.includes(slot.id) || !knowsMod(s, m)) return false;
  const cost = costFor(s, m);
  if (!canAfford(s, cost)) return false;
  for (const [k, v] of Object.entries(cost)) s.inv.mats[k] -= v;
  slot.mods = { ...(slot.mods || {}), [m.slot]: modId };
  clampMag(s, slot);
  return true;
}
export function removeMod(s, slot, slotName) {
  if (!slot.mods?.[slotName]) return false;
  const m = { ...slot.mods }; delete m[slotName];
  slot.mods = m;
  clampMag(s, slot);
  return true;
}
function clampMag(s, slot) {
  const st = gunStats(slot);
  if (slot.mag > st.mag) { const extra = slot.mag - st.mag; slot.mag = st.mag; if (st.ammo && s.inv.ammo[st.ammo] !== undefined) s.inv.ammo[st.ammo] += extra; }
}

// a few random mods for AI loadouts and rare floor loot
export function randomMods(gunId, rng, n) {
  const out = {};
  const slots = slotsFor(gunId).map(([k]) => k);
  for (let i = 0; i < n && slots.length; i++) {
    const k = slots.splice(Math.floor(rng.next() * slots.length), 1)[0];
    const opts = modsFor(gunId, k);
    out[k] = opts[Math.floor(rng.next() * opts.length)].id;
  }
  return out;
}
