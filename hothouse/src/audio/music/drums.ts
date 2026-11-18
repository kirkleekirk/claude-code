import { click, fm, noise, tone, type Dest } from '../synth/kit';
import type { InstId } from './types';

/**
 * Drum synthesis. `flavor` picks the kit character per station: punchy synth with gated snare,
 * crisp Latin percussion, dusty lo-fi, or trap/Miami 808.
 */

export type KitFlavor = 'synth' | 'latin' | 'lofi' | 'trap';

function kick(d: Dest, t: number, v: number, flavor: KitFlavor): void {
  switch (flavor) {
    case 'synth':
      tone(d, { t, freq: 155, to: 47, glide: 0.075, decay: 0.42, gain: 0.95 * v });
      click(d, t, 0.25 * v, 3500, 0.006);
      break;
    case 'latin':
      tone(d, { t, freq: 128, to: 52, glide: 0.05, decay: 0.3, gain: 0.9 * v });
      click(d, t, 0.2 * v, 2800, 0.005);
      break;
    case 'lofi':
      tone(d, { t, freq: 105, to: 46, glide: 0.06, decay: 0.34, gain: 0.85 * v, filter: { type: 'lowpass', freq: 900 } });
      break;
    case 'trap':
      tone(d, { t, freq: 170, to: 55, glide: 0.04, decay: 0.26, gain: 0.95 * v });
      click(d, t, 0.22 * v, 4200, 0.004);
      break;
  }
}

function snare(d: Dest, t: number, v: number, flavor: KitFlavor, variant: number): void {
  const roll = variant === 1;
  switch (flavor) {
    case 'synth':
      // Gated 80s snare: a held burst that cuts off hard, with a big reverb send.
      tone(d, { t, freq: 195, to: 165, glide: 0.05, decay: 0.12, gain: 0.45 * v });
      noise(d, { t, attack: 0.001, hold: roll ? 0.02 : 0.17, decay: roll ? 0.06 : 0.035, gain: 0.42 * v, filter: { type: 'highpass', freq: 900 }, filter2: { type: 'peaking', freq: 2400, q: 0.8, gain: 4 }, send: roll ? 0.15 : 0.55 });
      break;
    case 'latin':
      tone(d, { t, freq: 240, decay: 0.07, gain: 0.35 * v });
      noise(d, { t, decay: roll ? 0.06 : 0.12, gain: 0.4 * v, filter: { type: 'bandpass', freq: 3600, q: 0.9 }, send: 0.15 });
      break;
    case 'lofi':
      tone(d, { t, freq: 182, decay: 0.08, gain: 0.25 * v, filter: { type: 'lowpass', freq: 1800 } });
      noise(d, { t, color: 'pink', decay: 0.17, gain: 0.35 * v, filter: { type: 'bandpass', freq: 2200, q: 0.7 }, filter2: { type: 'lowpass', freq: 5200 }, send: 0.2 });
      break;
    case 'trap':
      tone(d, { t, freq: 220, to: 180, glide: 0.04, decay: 0.09, gain: 0.35 * v });
      noise(d, { t, decay: roll ? 0.05 : 0.16, gain: 0.45 * v, filter: { type: 'highpass', freq: 1500 }, send: 0.18 });
      break;
  }
}

function clap(d: Dest, t: number, v: number): void {
  for (let i = 0; i < 3; i++) noise(d, { t: t + i * 0.011, decay: 0.012, gain: 0.32 * v, filter: { type: 'bandpass', freq: 1250, q: 1.3 } });
  noise(d, { t: t + 0.03, decay: 0.18, gain: 0.3 * v, filter: { type: 'bandpass', freq: 1150, q: 1 }, send: 0.3 });
}

function hat(d: Dest, t: number, v: number, open: boolean, flavor: KitFlavor): void {
  const dusty = flavor === 'lofi';
  noise(d, {
    t, attack: 0.001, decay: open ? 0.3 : dusty ? 0.05 : 0.038, gain: (open ? 0.28 : 0.3) * v,
    filter: { type: 'highpass', freq: dusty ? 5200 : 7200 }, filter2: { type: dusty ? 'lowpass' : 'peaking', freq: dusty ? 9000 : 10500, q: 0.8, gain: 3 },
  });
}

function percussion(d: Dest, inst: InstId, t: number, v: number, variant: number, dur: number): void {
  switch (inst) {
    case 'rim':
      tone(d, { t, freq: 1700, decay: 0.028, gain: 0.25 * v });
      tone(d, { t, freq: 520, decay: 0.04, gain: 0.2 * v, type: 'triangle' });
      click(d, t, 0.15 * v, 3000, 0.004);
      break;
    case 'tom': {
      const f = [230, 185, 145, 110][Math.min(3, Math.max(0, variant))]!;
      tone(d, { t, freq: f * 1.6, to: f, glide: 0.08, decay: 0.38, gain: 0.55 * v, send: 0.25 });
      noise(d, { t, decay: 0.06, gain: 0.08 * v, filter: { type: 'bandpass', freq: f * 4, q: 1 } });
      break;
    }
    case 'crash':
      noise(d, { t, attack: 0.002, decay: 1.9, gain: 0.22 * v, filter: { type: 'highpass', freq: 3800 }, filter2: { type: 'peaking', freq: 7000, q: 0.6, gain: 5 }, send: 0.35 });
      fm(d, { t, freq: 540, ratio: 2.31, index: 3, indexEnd: 0.5, decay: 1.2, gain: 0.04 * v });
      break;
    case 'ride':
      fm(d, { t, freq: 620, ratio: 2.41, index: 2.2, indexEnd: 0.3, decay: 0.8, gain: 0.08 * v });
      noise(d, { t, decay: 0.25, gain: 0.05 * v, filter: { type: 'highpass', freq: 8000 } });
      break;
    case 'conga': {
      const freqs = [205, 290, 330, 250];
      const f = freqs[Math.min(3, Math.max(0, variant))]!;
      tone(d, { t, freq: f * 1.12, to: f, glide: 0.03, decay: variant === 3 ? 0.08 : 0.26, gain: 0.5 * v, type: 'triangle' });
      if (variant === 2) noise(d, { t, decay: 0.045, gain: 0.3 * v, filter: { type: 'bandpass', freq: 2600, q: 1.1 } });
      else click(d, t, 0.08 * v, 1800, 0.006);
      break;
    }
    case 'bongo': {
      const f = variant % 2 ? 520 : 410;
      tone(d, { t, freq: f * 1.1, to: f, glide: 0.02, decay: 0.12, gain: 0.35 * v, type: 'triangle' });
      click(d, t, 0.08 * v, 2600, 0.005);
      break;
    }
    case 'timbale':
      if (variant === 0) {
        noise(d, { t, decay: 0.03, gain: 0.25 * v, filter: { type: 'bandpass', freq: 2500, q: 2 } });
        tone(d, { t, freq: 1320, decay: 0.03, gain: 0.08 * v });
      } else {
        tone(d, { t, freq: 790, decay: 0.24, gain: 0.22 * v });
        tone(d, { t, freq: 1245, decay: 0.18, gain: 0.12 * v });
        noise(d, { t, decay: 0.08, gain: 0.15 * v, filter: { type: 'bandpass', freq: 3000, q: 1 }, send: 0.2 });
      }
      break;
    case 'cowbell':
      tone(d, { t, freq: 540, decay: 0.28, gain: 0.12 * v, type: 'square', filter: { type: 'bandpass', freq: 900, q: 2.2 } });
      tone(d, { t, freq: 800, decay: 0.22, gain: 0.12 * v, type: 'square', filter: { type: 'bandpass', freq: 900, q: 2.2 } });
      break;
    case 'clave':
      tone(d, { t, freq: 2480, decay: 0.065, gain: 0.3 * v });
      click(d, t, 0.1 * v, 3500, 0.003);
      break;
    case 'shaker':
      noise(d, { t, attack: 0.012, decay: 0.06, gain: 0.22 * v, filter: { type: 'bandpass', freq: 6500, q: 1 } });
      break;
    case 'guiro': {
      const scrapes = 7;
      const len = Math.min(0.25, Math.max(0.06, dur * 0.8));
      for (let i = 0; i < scrapes; i++) noise(d, { t: t + (i / scrapes) * len, decay: 0.012, gain: 0.16 * v, filter: { type: 'bandpass', freq: 3200 + (i % 2) * 400, q: 2 } });
      break;
    }
    default:
      break;
  }
}

/** Play one drum hit. Returns false if `inst` is not a drum. */
export function playDrum(d: Dest, inst: InstId, t: number, vel: number, variant: number, dur: number, flavor: KitFlavor): boolean {
  switch (inst) {
    case 'kick':
      kick(d, t, vel, flavor);
      return true;
    case 'snare':
      snare(d, t, vel, flavor, variant);
      return true;
    case 'clap':
      clap(d, t, vel);
      return true;
    case 'hatC':
      hat(d, t, vel, false, flavor);
      return true;
    case 'hatO':
      hat(d, t, vel, true, flavor);
      return true;
    case 'rim': case 'tom': case 'crash': case 'ride': case 'conga': case 'bongo': case 'timbale': case 'cowbell': case 'clave': case 'shaker': case 'guiro':
      percussion(d, inst, t, vel, variant, dur);
      return true;
    default:
      return false;
  }
}
