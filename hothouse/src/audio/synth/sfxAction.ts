import type { Sfx, SurfaceKind } from '../api';
import { midiToHz } from '../util/params';
import { chord, click, fm, noise, thump, tone, type Dest } from './kit';

/**
 * Character, vehicle, law and combat sounds. `k` is intensity (0–1).
 */

const n = midiToHz;

interface StepVoice {
  freq: number;
  q: number;
  decay: number;
  body: number;
  bodyGain: number;
  color: 'white' | 'pink' | 'brown';
  grit: number;
}

const STEPS: Record<SurfaceKind, StepVoice> = {
  asphalt: { freq: 1900, q: 0.9, decay: 0.05, body: 85, bodyGain: 0.12, color: 'white', grit: 0 },
  concrete: { freq: 2300, q: 1.1, decay: 0.045, body: 95, bodyGain: 0.12, color: 'white', grit: 0 },
  tile: { freq: 3400, q: 1.6, decay: 0.035, body: 140, bodyGain: 0.08, color: 'white', grit: 0 },
  sand: { freq: 900, q: 0.6, decay: 0.12, body: 60, bodyGain: 0.04, color: 'pink', grit: 2 },
  grass: { freq: 3000, q: 0.7, decay: 0.08, body: 70, bodyGain: 0.05, color: 'pink', grit: 3 },
  gravel: { freq: 2600, q: 0.8, decay: 0.07, body: 80, bodyGain: 0.07, color: 'white', grit: 5 },
  wood: { freq: 900, q: 1.4, decay: 0.07, body: 175, bodyGain: 0.16, color: 'pink', grit: 0 },
  metal: { freq: 2800, q: 4, decay: 0.09, body: 240, bodyGain: 0.08, color: 'white', grit: 0 },
  water: { freq: 1400, q: 0.8, decay: 0.12, body: 70, bodyGain: 0.04, color: 'pink', grit: 3 },
};

function footstep(d: Dest, t: number, k: number, surface: SurfaceKind): number {
  const v = STEPS[surface];
  const g = 0.55 + k * 0.6;
  thump(d, t, v.bodyGain * g, v.body * 1.4, v.body, 0.06);
  let end = noise(d, { t, color: v.color, attack: 0.002, decay: v.decay, gain: 0.12 * g, filter: { type: 'bandpass', freq: v.freq, q: v.q } });
  for (let i = 0; i < v.grit; i++) end = click(d, t + 0.008 + i * 0.011, 0.05 * g, v.freq * (1.2 + (i % 3) * 0.3), 0.008);
  if (surface === 'metal') fm(d, { t, freq: 610, ratio: 2.31, index: 1.2, indexEnd: 0.05, decay: 0.12, gain: 0.025 * g });
  if (surface === 'water') noise(d, { t: t + 0.02, decay: 0.15, gain: 0.05 * g, filter: { type: 'bandpass', freq: 900, to: 2400, sweep: 0.1, q: 1 } });
  return end;
}

function gunshot(d: Dest, t: number, k: number, body: number, crack: number, tail: number, gain: number): number {
  const g = gain * (0.75 + k * 0.25);
  // Crack: bright but low-passed so it is punchy, not harsh.
  noise(d, { t, attack: 0.0008, decay: 0.07 * crack, gain: 0.5 * g, filter: { type: 'highpass', freq: 900 }, filter2: { type: 'lowpass', freq: 7000 }, send: 0.4 });
  thump(d, t, 0.55 * g, body * 2.2, body * 0.6, 0.14 + tail * 0.08);
  noise(d, { t, color: 'pink', attack: 0.002, decay: 0.12, gain: 0.25 * g, filter: { type: 'bandpass', freq: 600, q: 0.8 } });
  return noise(d, { t: t + 0.01, color: 'pink', attack: 0.02, decay: 0.35 * tail, gain: 0.1 * g, filter: { type: 'lowpass', freq: 1800 }, send: 0.8 });
}

function crunch(d: Dest, t: number, k: number, dur: number): number {
  let end = t;
  const hits = 4 + Math.round(k * 6);
  for (let i = 0; i < hits; i++) {
    end = noise(d, { t: t + (i / hits) * dur + ((i * 13) % 5) * 0.004, decay: 0.05, gain: (0.12 + k * 0.12) * (1 - i / hits * 0.5), filter: { type: 'bandpass', freq: 1200 + ((i * 7) % 5) * 380, q: 2.2 } });
  }
  return end;
}

function glassShatter(d: Dest, t: number, k: number): number {
  noise(d, { t, decay: 0.2, gain: 0.25 * (0.5 + k), filter: { type: 'highpass', freq: 3800 } });
  let end = t;
  const shards = 10 + Math.round(k * 12);
  for (let i = 0; i < shards; i++) {
    const at = t + 0.01 + ((i * 0.0377) % 0.55);
    end = fm(d, { t: at, freq: 3200 + ((i * 523) % 4800), ratio: 1.41, index: 0.8, indexEnd: 0.05, decay: 0.08 + (i % 3) * 0.03, gain: 0.03, pan: ((i % 9) - 4) / 5 });
  }
  return end;
}

export function playActionSfx(d: Dest, sound: Sfx, t: number, k: number, surface: SurfaceKind): number | null {
  switch (sound) {
    // ── character ─────────────────────────────────────────────────────────
    case 'footstep':
      return footstep(d, t, k, surface);
    case 'jump':
      return noise(d, { t, attack: 0.03, decay: 0.12, gain: 0.07, filter: { type: 'bandpass', freq: 700, to: 2200, sweep: 0.12, q: 1 } });
    case 'land':
      footstep(d, t, 0.7 + k * 0.3, surface);
      return thump(d, t, 0.18 + k * 0.2, 110, 45, 0.16);
    case 'vault':
      noise(d, { t, decay: 0.04, gain: 0.1, filter: { type: 'bandpass', freq: 1500, q: 1.2 } });
      return noise(d, { t: t + 0.03, attack: 0.04, decay: 0.15, gain: 0.06, filter: { type: 'bandpass', freq: 800, to: 2600, sweep: 0.15, q: 0.9 } });
    case 'cloth': {
      let end = t;
      for (let i = 0; i < 5; i++) end = noise(d, { t: t + i * 0.03, decay: 0.04, gain: 0.04, filter: { type: 'bandpass', freq: 2000 + (i % 3) * 500, q: 1.1 } });
      return end;
    }
    case 'punch':
      thump(d, t, 0.45, 140, 50, 0.16);
      noise(d, { t, decay: 0.06, gain: 0.25, filter: { type: 'bandpass', freq: 1800, q: 1.2 } });
      return click(d, t, 0.2, 3000, 0.01);
    case 'bodyFall':
      thump(d, t, 0.5, 100, 38, 0.35);
      noise(d, { t: t + 0.02, color: 'pink', decay: 0.2, gain: 0.1, filter: { type: 'lowpass', freq: 900 } });
      return footstep(d, t + 0.18, 0.4, surface);
    // ── vehicles ──────────────────────────────────────────────────────────
    case 'doorOpen':
      click(d, t, 0.18, 1500, 0.02);
      tone(d, { t: t + 0.03, freq: 380, to: 300, glide: 0.25, decay: 0.25, gain: 0.015, type: 'sawtooth', filter: { type: 'bandpass', freq: 900, q: 6 } });
      return noise(d, { t: t + 0.05, attack: 0.08, decay: 0.2, gain: 0.04, filter: { type: 'bandpass', freq: 500, q: 0.8 } });
    case 'doorClose':
      thump(d, t, 0.5, 95, 55, 0.18);
      noise(d, { t, color: 'brown', decay: 0.14, gain: 0.25, filter: { type: 'lowpass', freq: 700 } });
      return click(d, t + 0.01, 0.2, 2000, 0.015);
    case 'ignition': {
      let end = t;
      for (let i = 0; i < 8; i++) end = tone(d, { t: t + i * 0.065, freq: 38 + i * 3, decay: 0.07, gain: 0.12, type: 'sawtooth', filter: { type: 'lowpass', freq: 500 } });
      noise(d, { t, color: 'brown', attack: 0.05, hold: 0.4, decay: 0.15, gain: 0.08, filter: { type: 'lowpass', freq: 600 } });
      return end;
    }
    case 'horn': {
      const hold = 0.22 + k * 0.5;
      const spec = { t, attack: 0.012, hold, decay: 0.06, gain: 0.07, type: 'sawtooth' as const, filter: { type: 'bandpass' as const, freq: 1100, q: 1.3 } };
      tone(d, { ...spec, freq: 412 });
      return tone(d, { ...spec, freq: 517 });
    }
    case 'backfire':
      noise(d, { t, attack: 0.001, decay: 0.09, gain: 0.45, filter: { type: 'lowpass', freq: 1400 }, send: 0.3 });
      return thump(d, t, 0.4, 85, 40, 0.12);
    case 'turboBlow':
      noise(d, { t, attack: 0.005, decay: 0.38, gain: 0.12, filter: { type: 'highpass', freq: 2600 } });
      return tone(d, { t, freq: 3600, to: 1500, glide: 0.3, decay: 0.3, gain: 0.02 });
    case 'gearShift':
      click(d, t, 0.12, 1300, 0.02);
      return tone(d, { t: t + 0.02, freq: 1400, to: 1100, glide: 0.05, decay: 0.06, gain: 0.02, type: 'triangle' });
    case 'impactLight':
      thump(d, t, 0.25 + k * 0.2, 160, 70, 0.1);
      return noise(d, { t, decay: 0.08, gain: 0.12 + k * 0.1, filter: { type: 'bandpass', freq: 1300, q: 1.1 } });
    case 'impactHeavy':
      thump(d, t, 0.55 + k * 0.3, 85, 30, 0.5);
      noise(d, { t, color: 'brown', decay: 0.4, gain: 0.3, filter: { type: 'lowpass', freq: 600 }, send: 0.4 });
      crunch(d, t + 0.005, k, 0.25 + k * 0.2);
      return k > 0.55 ? glassShatter(d, t + 0.03, k * 0.6) : t + 0.5;
    case 'scrape':
      return noise(d, { t, attack: 0.02, hold: 0.15 + k * 0.4, decay: 0.15, gain: 0.08 + k * 0.08, filter: { type: 'bandpass', freq: 2600, to: 1900, sweep: 0.5, q: 3 }, filter2: { type: 'peaking', freq: 3800, q: 4, gain: 8 } });
    case 'glassBreak':
      return glassShatter(d, t, k);
    case 'tirePop':
      noise(d, { t, attack: 0.001, decay: 0.12, gain: 0.5, filter: { type: 'lowpass', freq: 3000 }, send: 0.4 });
      thump(d, t, 0.45, 90, 35, 0.2);
      return noise(d, { t: t + 0.05, attack: 0.02, decay: 0.8, gain: 0.07, filter: { type: 'highpass', freq: 2500 } });
    case 'hydraulic':
      noise(d, { t, attack: 0.04, decay: 0.25, gain: 0.08, filter: { type: 'bandpass', freq: 1500, q: 1.4 } });
      thump(d, t + 0.18, 0.3, 120, 60, 0.15);
      return tone(d, { t: t + 0.2, freq: 180, decay: 0.35, gain: 0.04, type: 'triangle', vibrato: 11, vibratoDepth: 120, vibratoDelay: 0 });
    case 'boost':
      noise(d, { t, attack: 0.05, decay: 0.6, gain: 0.12, filter: { type: 'bandpass', freq: 400, to: 3000, sweep: 0.5, q: 0.8 } });
      tone(d, { t, freq: 180, to: 760, glide: 0.45, decay: 0.55, gain: 0.05, type: 'sawtooth', filter: { type: 'lowpass', freq: 600, to: 4000, sweep: 0.45, q: 3 } });
      return thump(d, t, 0.25, 70, 40, 0.4);
    case 'flowFull':
      chord(d, t, [n(79), n(83), n(86), n(91)], 0.03, { decay: 0.45, gain: 0.05, send: 0.3 });
      return noise(d, { t, attack: 0.1, decay: 0.4, gain: 0.03, filter: { type: 'highpass', freq: 6000 } });
    case 'splash':
      noise(d, { t, attack: 0.005, decay: 0.3 + k * 0.4, gain: 0.2 + k * 0.15, filter: { type: 'lowpass', freq: 2500, to: 900, sweep: 0.4 }, send: 0.3 });
      return noise(d, { t: t + 0.05, attack: 0.02, decay: 0.4, gain: 0.08, filter: { type: 'highpass', freq: 3000 } });
    case 'boatSlap':
      thump(d, t, 0.3 + k * 0.2, 100, 50, 0.14);
      return noise(d, { t, decay: 0.18, gain: 0.12, filter: { type: 'bandpass', freq: 900, to: 400, sweep: 0.15, q: 1 } });
    // ── law ───────────────────────────────────────────────────────────────
    case 'sirenChirp':
      return tone(d, { t, freq: 620, to: 1400, glide: 0.18, decay: 0.32, gain: 0.08, type: 'square', filter: { type: 'lowpass', freq: 2600 } });
    case 'radioSquelch':
      click(d, t, 0.12, 1800, 0.01);
      return noise(d, { t: t + 0.01, attack: 0.005, decay: 0.18, gain: 0.07, filter: { type: 'bandpass', freq: 1800, q: 1.8 } });
    case 'heatUp':
      thump(d, t, 0.3, 70, 40, 0.5);
      noise(d, { t, attack: 0.35, decay: 0.2, gain: 0.08, filter: { type: 'bandpass', freq: 300, to: 2400, sweep: 0.5, q: 1 } });
      return tone(d, { t: t + 0.05, freq: n(50), decay: 0.6, gain: 0.05, type: 'sawtooth', filter: { type: 'lowpass', freq: 700 } });
    case 'heatDown':
      noise(d, { t, attack: 0.05, decay: 0.5, gain: 0.06, filter: { type: 'bandpass', freq: 2400, to: 400, sweep: 0.5, q: 1 } });
      return chord(d, t + 0.1, [n(65), n(69), n(72)], 0.05, { decay: 0.7, gain: 0.04, type: 'triangle', send: 0.3 });
    case 'busted':
      click(d, t, 0.3, 2400, 0.02);
      click(d, t + 0.12, 0.3, 2600, 0.02);
      return thump(d, t + 0.2, 0.3, 100, 45, 0.3);
    case 'escaped':
      noise(d, { t, attack: 0.1, decay: 0.6, gain: 0.07, filter: { type: 'bandpass', freq: 600, to: 3000, sweep: 0.6, q: 0.8 } });
      return chord(d, t + 0.15, [n(67), n(71), n(74), n(79)], 0.04, { decay: 0.9, gain: 0.045, type: 'triangle', send: 0.35 });
    // ── combat ────────────────────────────────────────────────────────────
    case 'gunPistol':
      return gunshot(d, t, k, 120, 1, 1, 1);
    case 'gunSmg':
      return gunshot(d, t, k, 140, 0.7, 0.6, 0.7);
    case 'gunShotgun':
      gunshot(d, t, k, 80, 1.4, 1.8, 1.1);
      return noise(d, { t: t + 0.01, color: 'brown', decay: 0.4, gain: 0.25, filter: { type: 'lowpass', freq: 500 } });
    case 'gunRifle':
      return gunshot(d, t, k, 100, 1.2, 1.4, 1.05);
    case 'reload':
      click(d, t, 0.15, 1900, 0.015);
      noise(d, { t: t + 0.12, attack: 0.02, decay: 0.08, gain: 0.05, filter: { type: 'bandpass', freq: 2500, q: 1.5 } });
      click(d, t + 0.28, 0.2, 1500, 0.02);
      return click(d, t + 0.42, 0.18, 2400, 0.015);
    case 'dryFire':
      return click(d, t, 0.12, 2800, 0.01);
    case 'ricochet':
      noise(d, { t, decay: 0.05, gain: 0.08, filter: { type: 'highpass', freq: 3000 } });
      return tone(d, { t, freq: 3400, to: 1100, glide: 0.25, decay: 0.28, gain: 0.04, type: 'sawtooth', filter: { type: 'bandpass', freq: 2500, q: 2 } });
    case 'hitMarker':
      click(d, t, 0.12, 5200, 0.006);
      return tone(d, { t, freq: 2900, decay: 0.045, gain: 0.05 });
    default:
      return null;
  }
}
