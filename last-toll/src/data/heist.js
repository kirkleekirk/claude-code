import { def } from './items.js';
import { weaponStats } from '../game/weapons.js';
import { countOwned } from './story.js';

// The Covenant job. Hale hears about the ship on the Guard's own radio: a freighter
// anchored off Port Lafitte, loading Experimental equipment from the Natchez labs.
// You scout it, gather what an approach needs, put the right kit together, and take
// it one of four ways. Each way in has its own ways out.
//
// Stages: locked → offered (Hale told you; scout the port) → planning (scouted; the
// board is open) → done (the prototype case came home).

export function newHeist() {
  return { stage: 'locked', scouted: false, runs: 0, done: false, last: null };
}

// What an approach needs before the board lets you launch it.
//   check(p) → true when you have it; how: where to get it; optional: nice to have
export const SETUPS = {
  scout: { label: 'Scout the Covenant', how: 'Go to Port Lafitte and glass the ship from the lighthouse gallery or the top of a gantry crane. Then get home.', check: (p) => !!p.heist.scouted },
  dive_gear: { label: 'Dive gear', how: 'The dive locker in the Bayou Blue dive shop, at the east end of the beach in Port Lafitte.', check: (p) => countOwned(p, 'dive_gear') > 0 },
  cutting_torch: { label: 'Cutting torch', how: 'Build one at the Workshop Bench, or take it from the welder\'s chest in the Port Lafitte boat yard.', check: (p) => countOwned(p, 'cutting_torch') > 0 },
  boat_keys: { label: 'Speedboat keys', how: 'The harbor master\'s desk, in the office between the marina and the quay.', check: (p) => countOwned(p, 'boat_keys') > 0 },
  fuel2: { label: 'Fuel ×2', how: 'The fuel store by the tanks at the Port Lafitte depot. Two cans for the speedboat.', check: (p) => countOwned(p, 'fuel_can') >= 2, uses: ['fuel_can', 2] },
  fuel4: { label: 'Fuel ×4', how: 'Four cans of diesel from the Port Lafitte depot. The Magnolia is thirsty.', check: (p) => countOwned(p, 'fuel_can') >= 4, uses: ['fuel_can', 4] },
  plating: { label: 'Hull plating ×2', how: 'Build it at the Workshop Bench: steel, fasteners and scrap.', check: (p) => countOwned(p, 'hull_plate') >= 2, uses: ['hull_plate', 2] },
  crew_arms: { label: 'Guns for the crew', how: 'Two spare guns in your stash. Hale and Remy will carry them over the rail and bring them back.', check: (p) => spareGuns(p) >= 2 },
  manifest: { label: 'The cage code', how: 'Optional. The Covenant\'s manifest is on the harbor master\'s desk. With the code, the cage opens without a torch or a charge.', check: (p) => countOwned(p, 'manifest') > 0, optional: true },
};

// The kit you carry: checked against your loadout when you launch.
export const KITS = {
  silent: {
    label: 'Silent kit',
    how: 'A suppressed gun, a bow or crossbow, or a Guard photon pistol in your holster or on your shoulder. The gunsmith fits suppressors.',
    check: (p) => quietGuns(p.loadout).length > 0,
  },
  loud: {
    label: 'Loud kit',
    how: 'A long gun that means it — military grade, or modded with at least two parts — and a full reload for it in your pack.',
    check: (p) => loudGun(p) !== null,
  },
};

export const ESCAPES = {
  seachest: { label: 'Back through the sea chest', how: 'Drop through the grate in Hold 3 and swim for the skiff on the beach.' },
  speedboat: { label: 'The speedboat', how: 'Back down to the boat and run for open water past the breakwater.' },
  magnolia: { label: 'The Magnolia', how: 'Back down the ladders and tell Odile to cast off.' },
  lifeboat: { label: 'The lifeboat', how: 'Launch the Covenant\'s free-fall lifeboat off the stern and motor out to open water.' },
  overboard: { label: 'Over the side', how: 'Jump and swim for a skiff. Loud, wet and slow.' },
};

// The ways in. time: the hour you go; mood: the light.
export const APPROACHES = [
  {
    id: 'dive', name: 'Silent Running', vehicle: 'Dive gear', style: 'Stealth',
    setups: ['scout', 'dive_gear', 'cutting_torch'], kit: 'silent', escapes: ['seachest', 'lifeboat', 'overboard'],
    entry: 'Wade in off the beach after dark, dive under the Covenant\'s hull and cut the sea chest grate. You come up inside Hold 3, right beside the cage. Nobody on deck ever knows you were there.',
    start: 'beach', time: 21.4, mood: 'night',
  },
  {
    id: 'speed_quiet', name: 'Running Dark', vehicle: 'Speedboat', style: 'Stealth',
    setups: ['scout', 'boat_keys', 'fuel2'], kit: 'silent', escapes: ['speedboat', 'lifeboat', 'overboard'],
    entry: 'Take Ray\'s speedboat from the marina with the engine barely ticking over, idle round to the Covenant\'s seaward side and go up the pilot ladder. Sentries on deck, a cage in Hold 3.',
    start: 'boat', time: 21.2, mood: 'night',
  },
  {
    id: 'speed_loud', name: 'Hot Run', vehicle: 'Speedboat', style: 'Aggressive',
    setups: ['scout', 'boat_keys', 'fuel2'], kit: 'loud', escapes: ['speedboat', 'lifeboat', 'overboard'],
    entry: 'Throttle wide open across the harbor at sundown. Tie up at the gangway landing, fight up the ladder and down into Hold 3. They will hear you coming, so be faster than they are.',
    start: 'boat', time: 18.2, mood: 'dusk',
  },
  {
    id: 'magnolia', name: 'All Hands', vehicle: 'The Magnolia', style: 'Full assault',
    setups: ['scout', 'fuel4', 'plating', 'crew_arms'], kit: 'loud', escapes: ['magnolia', 'lifeboat'],
    entry: 'Fuel her, plate her, and Remy brings the Magnolia alongside with Hale and the crew. Up the boarding ladders together and take the ship deck by deck.',
    start: 'magnolia', time: 18.1, mood: 'dusk',
  },
];

export const approachById = (id) => APPROACHES.find((a) => a.id === id) || null;

// ---- kit checks -----------------------------------------------------------------------

export function isQuiet(it) {
  if (!it) return false;
  const d = def(it.id);
  if (d.kind !== 'gun') return false;
  if (d.action === 'bow') return true;
  const s = weaponStats(it);
  return (s.noise ?? 99) <= 24;
}

export function quietGuns(loadout) {
  return ['sidearm', 'long'].map((k) => loadout[k]).filter((it) => isQuiet(it));
}

export function loudGun(p) {
  const it = p.loadout.long;
  if (!it) return null;
  const d = def(it.id);
  if (d.kind !== 'gun' || d.action === 'bow') return null;
  const mods = Object.keys(it.mods || {}).length;
  if (!((d.tier ?? 0) >= 3 || mods >= 2)) return null;
  const s = weaponStats(it);
  const ammo = p.backpack.filter((x) => x.id === d.ammo).reduce((n, x) => n + (x.qty || 1), 0);
  return ammo >= Math.min(s.cap, 30) ? it : null;
}

function spareGuns(p) {
  return p.stash.filter((it) => def(it.id).kind === 'gun').length;
}

// Where an approach stands: each setup and the kit, ✓ or not.
export function readiness(p, a) {
  const setups = a.setups.map((id) => ({ id, ...SETUPS[id], ok: SETUPS[id].check(p) }));
  const kit = { id: a.kit, ...KITS[a.kit], ok: KITS[a.kit].check(p) };
  const ready = setups.every((s) => s.ok) && kit.ok;
  return { setups, kit, ready };
}
