// Paperdoll appearance parameters (pure data, shared by sim and renderer).
import { RAMPS } from './palette.js';

const K = RAMPS;
export const SKINS = [K.sand[3], K.sand[2], K.wood[3], K.wood[2], K.bone[2], K.rust[3]];
export const HAIRS = [K.ink[0], K.wood[0], K.wood[1], K.sand[2], K.bone[1], K.rust[2], K.ink[2]];
export const CLOTH = ['rust', 'wood', 'sand', 'olive', 'teal', 'sea', 'ink', 'bone', 'amber', 'green', 'heat', 'gold'];

// rand: () => [0,1). Appearance: skin, hair, hairStyle 0-5, hat 0-6, hatC, top, top2, topStyle, pants, boots.
export function randomLook(rand, overrides = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  return {
    skin: pick(SKINS), hair: pick(HAIRS), hairStyle: Math.floor(rand() * 6), hat: rand() < 0.45 ? 1 + Math.floor(rand() * 4) : 0,
    hatC: pick(CLOTH), top: pick(CLOTH), top2: pick(CLOTH), topStyle: pick(['shirt', 'jacket', 'vest', 'shirt', 'apron']),
    pants: pick(['wood', 'ink', 'sea', 'olive', 'sand']), boots: pick([K.ink[1], K.wood[0], K.ink[0]]), ...overrides,
  };
}

// Faction uniforms layered over a random base.
export const FACTION_LOOK = {
  compact: { top: 'teal', top2: 'bone', topStyle: 'jacket', hat: 1, hatC: 'teal', pants: 'ink' },
  warden: { top: 'teal', top2: 'ink', topStyle: 'armor', hat: 3, pants: 'ink' },
  rustjaw: { top: 'rust', top2: 'ink', topStyle: 'vest', hat: 5, hatC: 'heat', pants: 'wood' },
  palehand: { top: 'bone', top2: 'ink', topStyle: 'jacket', hat: 6, hatC: 'bone', pants: 'ink' },
  ashchoir: { top: 'ink', top2: 'heat', topStyle: 'robe', hat: 4, hatC: 'ink', pants: 'ink' },
  scav: { top: 'olive', top2: 'sand', topStyle: 'vest', hat: 5, hatC: 'olive', pants: 'sand' },
  bounty: { top: 'wood', top2: 'ink', topStyle: 'jacket', hat: 2, hatC: 'wood', pants: 'ink' },
  crew: { top2: 'amber' },
};
