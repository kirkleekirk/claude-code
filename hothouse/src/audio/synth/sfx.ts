import type { Sfx, SurfaceKind } from '../api';
import type { Dest } from './kit';
import { playActionSfx } from './sfxAction';
import { playWorldSfx } from './sfxWorld';

export interface SfxInfo {
  /** Max simultaneous voices of this sound before the oldest is stolen. */
  readonly limit: number;
  /** Panner reference distance in metres (how big the sound is). */
  readonly ref: number;
  /** Extra world-reverb send. */
  readonly room: number;
}

const I = (limit: number, ref: number, room = 0.08): SfxInfo => ({ limit, ref, room });

/**
 * Loudness calibration (dB) from the offline QA report: core-loop juice (snips, deals) is lifted,
 * guns and big world events are tamed so the limiter never slams.
 */
export const SFX_TRIM_DB: Readonly<Partial<Record<Sfx, number>>> = {
  snip: 7, leafPerk: 6, needPop: 6, plantSeed: 5, bagIt: 8, dropAdditive: 5, shake: 4, handoff: 9, cashFlick: 12, haggleTick: 10,
  footstep: 3, jump: 7, vault: 7, cloth: 5, doorOpen: 11, gearShift: 7, cameraShutter: 13, crowdGasp: 7, buildRemove: 6,
  reload: 6, dryFire: 16, hitMarker: 28, radioSquelch: 12, ricochet: 3,
  gunPistol: -6, gunSmg: -6, gunShotgun: -6, gunRifle: -6, thunder: -5, firework: -4, bell: -6, gatorHiss: -6, horn: -3,
  doorShop: -4, cookDone: -5, impactHeavy: -2, tirePop: -2, pressStamp: -3, reveal: -2,
};

/** Per-sound mixing and voice data. Exhaustive over `Sfx`. */
export const SFX_INFO: Readonly<Record<Sfx, SfxInfo>> = {
  snip: I(4, 2), snipPerfect: I(3, 2), water: I(2, 3), leafPerk: I(4, 2), needPop: I(6, 2), plantSeed: I(3, 2), bagIt: I(2, 2),
  dropAdditive: I(3, 2), shake: I(1, 2), reveal: I(2, 3), cookDone: I(2, 4), pressStamp: I(2, 4),
  handoff: I(2, 2), cashFlick: I(2, 2), haggleTick: I(4, 2), haggleWin: I(2, 3), haggleMiss: I(2, 3), perfectDeal: I(1, 4),
  footstep: I(8, 3, 0.05), jump: I(3, 3), land: I(3, 4), vault: I(2, 3), cloth: I(4, 2), punch: I(4, 5), bodyFall: I(3, 6),
  doorOpen: I(3, 4), doorClose: I(3, 5), ignition: I(2, 5), horn: I(4, 18, 0.15), backfire: I(4, 16, 0.2), turboBlow: I(3, 8),
  gearShift: I(3, 4), impactLight: I(6, 8), impactHeavy: I(5, 14, 0.15), scrape: I(4, 8), glassBreak: I(3, 8), tirePop: I(3, 12, 0.15),
  hydraulic: I(3, 6), boost: I(2, 8), flowFull: I(1, 4), splash: I(4, 8, 0.1), boatSlap: I(4, 8),
  doorShop: I(2, 4), bell: I(3, 20, 0.2), vending: I(2, 4), neonBuzz: I(4, 3), thunder: I(3, 400, 0.3), firework: I(8, 120, 0.25),
  cameraShutter: I(4, 3), crowdCheer: I(2, 25, 0.15), crowdGasp: I(2, 20), gull: I(4, 40, 0.1), gatorHiss: I(2, 6),
  pickup: I(4, 3), dropBox: I(2, 5), buildPlace: I(4, 4), buildRemove: I(4, 4), buildInvalid: I(2, 4),
  sirenChirp: I(4, 40, 0.15), radioSquelch: I(3, 6), heatUp: I(1, 4), heatDown: I(1, 4), busted: I(1, 4), escaped: I(1, 4),
  gunPistol: I(10, 30, 0.35), gunSmg: I(12, 28, 0.3), gunShotgun: I(6, 40, 0.4), gunRifle: I(8, 45, 0.4), reload: I(3, 4),
  dryFire: I(3, 3), ricochet: I(6, 10, 0.15), hitMarker: I(6, 4, 0),
};

export const SFX_IDS = Object.keys(SFX_INFO) as Sfx[];

/** Non-diegetic feedback that should never be spatialized even if a position is passed. */
export const SFX_FLAT: ReadonlySet<Sfx> = new Set<Sfx>(['hitMarker', 'heatUp', 'heatDown', 'busted', 'escaped', 'flowFull', 'perfectDeal']);

export function playSfxRecipe(d: Dest, sound: Sfx, t: number, k: number, surface: SurfaceKind): number {
  const a = playWorldSfx(d, sound, t, k);
  if (a !== null) return a;
  const b = playActionSfx(d, sound, t, k, surface);
  return b ?? t;
}
