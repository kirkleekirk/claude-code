import type { Sfx } from '../api';
import { midiToHz } from '../util/params';
import { chord, click, fm, noise, thump, tone, type Dest } from './kit';

/**
 * Growing, mixing, dealing and world sounds. `k` is the intensity (0–1, default 0.5): louder,
 * bigger, longer. Each recipe returns its end time.
 */

const n = midiToHz;

function droplets(d: Dest, t: number, count: number, span: number, gain: number, seed: number): number {
  let end = t;
  for (let i = 0; i < count; i++) {
    const r = ((seed + i) * 2654435761) % 1000 / 1000;
    const at = t + r * span;
    const f = 1400 + r * 1900;
    end = Math.max(end, tone(d, { t: at, freq: f, to: f * 1.45, glide: 0.03, decay: 0.05, gain: gain * (0.5 + r * 0.5), pan: r * 1.2 - 0.6 }));
  }
  return end;
}

function rustle(d: Dest, t: number, dur: number, gain: number, freq = 2600): number {
  // Several overlapping short bursts give leaves and cloth their grain.
  let end = t;
  const bursts = Math.max(3, Math.round(dur / 0.03));
  for (let i = 0; i < bursts; i++) {
    const at = t + (i / bursts) * dur + ((i * 7) % 3) * 0.004;
    end = noise(d, { t: at, decay: 0.035, gain: gain * (0.5 + ((i * 5) % 4) / 8), filter: { type: 'bandpass', freq: freq * (0.8 + ((i * 3) % 5) / 10), q: 1.2 } });
  }
  return end;
}

export function playWorldSfx(d: Dest, sound: Sfx, t: number, k: number): number | null {
  switch (sound) {
    // ── growing and mixing ────────────────────────────────────────────────
    case 'snip':
      click(d, t, 0.22, 4800, 0.006);
      click(d, t + 0.024, 0.28, 5600, 0.007);
      return tone(d, { t: t + 0.024, freq: 3150, decay: 0.09, gain: 0.04 });
    case 'snipPerfect':
      click(d, t, 0.22, 4800, 0.006);
      click(d, t + 0.024, 0.28, 5600, 0.007);
      fm(d, { t: t + 0.03, freq: n(93), ratio: 3, index: 1.5, indexEnd: 0.05, decay: 0.5, gain: 0.07, send: 0.25 });
      return noise(d, { t: t + 0.03, attack: 0.03, decay: 0.3, gain: 0.03, filter: { type: 'highpass', freq: 8000 } });
    case 'water': {
      const dur = 0.45 + k * 0.4;
      noise(d, { t, color: 'pink', attack: 0.05, hold: dur * 0.5, decay: dur * 0.5, gain: 0.12, filter: { type: 'bandpass', freq: 1500, to: 2400, sweep: dur, q: 0.8 }, filter2: { type: 'lowpass', freq: 5000 } });
      return droplets(d, t + 0.08, 7, dur, 0.035, 11);
    }
    case 'leafPerk':
      rustle(d, t, 0.12, 0.05, 3200);
      return tone(d, { t: t + 0.03, freq: 300, to: 540, glide: 0.08, decay: 0.12, gain: 0.05, type: 'triangle' });
    case 'needPop':
      click(d, t + 0.03, 0.08, 2600, 0.006);
      return tone(d, { t, freq: 620, to: 1500, glide: 0.035, decay: 0.05, gain: 0.08 });
    case 'plantSeed':
      noise(d, { t, color: 'brown', decay: 0.16, gain: 0.25, filter: { type: 'lowpass', freq: 420 } });
      return tone(d, { t: t + 0.05, freq: 520, to: 900, glide: 0.04, decay: 0.06, gain: 0.05 });
    case 'bagIt':
      rustle(d, t, 0.22, 0.06, 4200);
      return noise(d, { t: t + 0.18, attack: 0.02, decay: 0.12, gain: 0.07, filter: { type: 'bandpass', freq: 2200, to: 6500, sweep: 0.12, q: 2 } });
    case 'dropAdditive':
      tone(d, { t, freq: 1250, to: 2600, glide: 0.04, decay: 0.07, gain: 0.08 });
      noise(d, { t: t + 0.01, decay: 0.12, gain: 0.07, filter: { type: 'bandpass', freq: 1800, to: 800, sweep: 0.1, q: 1.2 } });
      return droplets(d, t + 0.04, 3, 0.2, 0.025, 5);
    case 'shake': {
      let end = t;
      for (let i = 0; i < 7; i++) {
        end = noise(d, { t: t + i * 0.11, attack: 0.01, decay: 0.07, gain: 0.09, filter: { type: 'bandpass', freq: 3600 + (i % 2) * 900, q: 1.5 }, pan: i % 2 ? 0.25 : -0.25 });
        click(d, t + i * 0.11 + 0.02, 0.06, 5200, 0.005);
      }
      return end;
    }
    case 'reveal':
      noise(d, { t, attack: 0.3, decay: 0.3, gain: 0.06, filter: { type: 'bandpass', freq: 500, to: 5000, sweep: 0.5, q: 1 } });
      return chord(d, t + 0.32, [n(84), n(88), n(91), n(96)], 0.04, { decay: 0.7, gain: 0.05, send: 0.35 });
    case 'cookDone':
      fm(d, { t, freq: 2217, ratio: 2.4, index: 1.6, indexEnd: 0.1, decay: 0.35, gain: 0.08 });
      return fm(d, { t: t + 0.2, freq: 2217, ratio: 2.4, index: 1.6, indexEnd: 0.1, decay: 0.6, gain: 0.08, send: 0.2 });
    case 'pressStamp':
      thump(d, t, 0.4, 110, 42, 0.35);
      click(d, t, 0.15, 900, 0.02);
      return noise(d, { t: t + 0.06, attack: 0.04, decay: 0.55, gain: 0.07, filter: { type: 'highpass', freq: 3200 } });
    // ── deals and money ───────────────────────────────────────────────────
    case 'handoff':
      rustle(d, t, 0.14, 0.05, 2200);
      return noise(d, { t: t + 0.1, attack: 0.02, decay: 0.12, gain: 0.05, filter: { type: 'bandpass', freq: 1800, to: 3600, sweep: 0.1, q: 1.4 } });
    case 'cashFlick': {
      let end = t;
      for (let i = 0; i < 9; i++) end = click(d, t + i * 0.028, 0.09 - i * 0.006, 3000 + (i % 3) * 400, 0.01);
      return end;
    }
    case 'haggleTick':
      return tone(d, { t, freq: 1250, decay: 0.03, gain: 0.05 });
    case 'haggleWin':
      fm(d, { t, freq: n(76), ratio: 1, index: 0.5, indexEnd: 0.05, decay: 0.18, gain: 0.09 });
      return fm(d, { t: t + 0.08, freq: n(83), ratio: 1, index: 0.5, indexEnd: 0.05, decay: 0.3, gain: 0.09, send: 0.1 });
    case 'haggleMiss':
      tone(d, { t, freq: n(67), decay: 0.12, gain: 0.07, type: 'triangle', filter: { type: 'lowpass', freq: 1400 } });
      return tone(d, { t: t + 0.1, freq: n(63), decay: 0.22, gain: 0.07, type: 'triangle', filter: { type: 'lowpass', freq: 1100 } });
    case 'perfectDeal': {
      noise(d, { t, attack: 0.15, decay: 0.25, gain: 0.05, filter: { type: 'bandpass', freq: 700, to: 4000, sweep: 0.35, q: 0.9 } });
      chord(d, t + 0.15, [n(79), n(83), n(86), n(91)], 0.04, { decay: 0.6, gain: 0.06, send: 0.3, type: 'triangle' });
      let end = t;
      for (let i = 0; i < 8; i++) end = fm(d, { t: t + 0.2 + i * 0.04, freq: 2600 + (i % 4) * 330, ratio: 2.76, index: 1.2, indexEnd: 0.1, decay: 0.2, gain: 0.025 });
      return end;
    }
    // ── world ─────────────────────────────────────────────────────────────
    case 'doorShop':
      thump(d, t, 0.18, 120, 60, 0.16);
      fm(d, { t: t + 0.05, freq: 2637, ratio: 2.4, index: 1.5, indexEnd: 0.05, decay: 0.6, gain: 0.07, send: 0.2 });
      return fm(d, { t: t + 0.16, freq: 2349, ratio: 2.4, index: 1.5, indexEnd: 0.05, decay: 0.7, gain: 0.06, send: 0.2 });
    case 'bell':
      return fm(d, { t, freq: 880, ratio: 3.5, index: 2.5, indexEnd: 0.05, decay: 1.6, gain: 0.1, send: 0.3 });
    case 'vending':
      tone(d, { t, freq: 62, attack: 0.05, hold: 0.45, decay: 0.15, gain: 0.08, type: 'sawtooth', filter: { type: 'lowpass', freq: 400 } });
      thump(d, t + 0.62, 0.3, 160, 70, 0.15);
      return click(d, t + 0.62, 0.15, 1100, 0.03);
    case 'neonBuzz':
      tone(d, { t, freq: 120, attack: 0.005, hold: 0.08 + k * 0.2, decay: 0.05, gain: 0.05, type: 'sawtooth', filter: { type: 'bandpass', freq: 600, q: 2 } });
      return click(d, t + 0.04, 0.08, 6000, 0.008);
    case 'thunder': {
      const dist = 1 - k;
      if (k > 0.6) noise(d, { t, decay: 0.25, gain: 0.35 * k, filter: { type: 'lowpass', freq: 3500 }, send: 0.6 });
      const len = 2.2 + dist * 2.4;
      return noise(d, { t: t + dist * 0.6, color: 'brown', attack: 0.15 + dist * 0.3, decay: len, gain: 0.55 * (0.5 + k * 0.5), filter: { type: 'lowpass', freq: 380 - dist * 200, to: 160, sweep: len, q: 0.5 }, send: 0.5 });
    }
    case 'firework': {
      tone(d, { t, freq: 900, to: 2600, glide: 0.9, decay: 0.95, gain: 0.03, attack: 0.05 });
      const bang = t + 1.0;
      noise(d, { t: bang, decay: 0.35, gain: 0.3, filter: { type: 'lowpass', freq: 2400 }, send: 0.5 });
      thump(d, bang, 0.3, 90, 35, 0.6);
      let end = bang;
      for (let i = 0; i < 18; i++) end = click(d, bang + 0.25 + (i * 0.061) % 1.1, 0.05, 3500 + (i % 5) * 700, 0.01, ((i % 7) - 3) / 4);
      return end;
    }
    case 'cameraShutter':
      click(d, t, 0.14, 2400, 0.012);
      return click(d, t + 0.07, 0.11, 1900, 0.014);
    case 'crowdCheer': {
      const dur = 1.2 + k;
      for (let i = 0; i < 5; i++) {
        noise(d, { t: t + i * 0.04, color: 'pink', attack: 0.15, hold: dur * 0.4, decay: dur * 0.6, gain: 0.05, filter: { type: 'bandpass', freq: 500 + i * 330, q: 3 }, pan: (i - 2) * 0.3 });
      }
      tone(d, { t: t + 0.2, freq: 2100, to: 2900, glide: 0.25, decay: 0.3, gain: 0.025, pan: 0.5 });
      return tone(d, { t: t + 0.5, freq: 2400, to: 3200, glide: 0.2, decay: 0.25, gain: 0.02, pan: -0.4 });
    }
    case 'crowdGasp':
      return noise(d, { t, color: 'pink', attack: 0.18, decay: 0.45, gain: 0.08, filter: { type: 'bandpass', freq: 1100, to: 700, sweep: 0.5, q: 1.6 } });
    case 'gull': {
      let end = t;
      const calls = 2 + Math.round(k * 2);
      for (let i = 0; i < calls; i++) {
        const at = t + i * 0.32;
        end = tone(d, { t: at, freq: 1500, to: 2300, glide: 0.08, decay: 0.24, gain: 0.05, type: 'sawtooth', filter: { type: 'bandpass', freq: 2100, q: 3 }, vibrato: 14, vibratoDepth: 35, vibratoDelay: 0 });
      }
      return end;
    }
    case 'gatorHiss':
      tone(d, { t, freq: 58, attack: 0.2, hold: 0.4, decay: 0.4, gain: 0.08, type: 'sawtooth', filter: { type: 'lowpass', freq: 240 } });
      return noise(d, { t, attack: 0.25, hold: 0.5, decay: 0.5, gain: 0.08, filter: { type: 'highpass', freq: 2200 } });
    case 'pickup':
      tone(d, { t, freq: n(76), decay: 0.08, gain: 0.07, type: 'triangle' });
      return tone(d, { t: t + 0.06, freq: n(84), decay: 0.14, gain: 0.07, type: 'triangle' });
    case 'dropBox':
      thump(d, t, 0.35, 140, 60, 0.18);
      return noise(d, { t, decay: 0.1, gain: 0.1, filter: { type: 'bandpass', freq: 700, q: 1.2 } });
    case 'buildPlace':
      thump(d, t, 0.22, 200, 90, 0.1);
      click(d, t, 0.14, 1600, 0.015);
      return tone(d, { t: t + 0.03, freq: n(79), decay: 0.12, gain: 0.04, type: 'triangle' });
    case 'buildRemove':
      noise(d, { t, attack: 0.08, decay: 0.05, gain: 0.06, filter: { type: 'bandpass', freq: 3000, to: 800, sweep: 0.12, q: 1.4 } });
      return tone(d, { t: t + 0.1, freq: 900, to: 1500, glide: 0.03, decay: 0.05, gain: 0.05 });
    case 'buildInvalid':
      return tone(d, { t, freq: 140, decay: 0.16, gain: 0.08, type: 'square', filter: { type: 'lowpass', freq: 700 } });
    default:
      return null;
  }
}
