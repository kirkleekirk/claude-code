import type { UiSound } from '../api';
import { midiToHz } from '../util/params';
import { chord, click, fm, noise, thump, tone, type Dest } from './kit';

/**
 * The interface sound family. One timbre ("glass marimba": sine body, a quick 4th-harmonic ping
 * and a soft transient) pitched in F major pentatonic, so every screen sounds like the same phone.
 * Levels are deliberately modest: these play hundreds of times an hour.
 */

const n = midiToHz;

/** The family voice. Returns end time. */
function ping(d: Dest, t: number, midi: number, gain: number, decay = 0.16, pan = 0): number {
  const f = n(midi);
  click(d, t, gain * 0.18, Math.min(9000, f * 3), 0.006, pan);
  tone(d, { t: t + 0.001, freq: f * 4, decay: decay * 0.22, gain: gain * 0.18, pan });
  return tone(d, { t, freq: f, decay, gain, attack: 0.002, pan, send: 0.08 });
}

function whoosh(d: Dest, t: number, up: boolean, gain: number, dur = 0.22): number {
  return noise(d, {
    t, color: 'pink', attack: up ? dur * 0.6 : 0.01, decay: up ? dur * 0.5 : dur, gain,
    filter: { type: 'bandpass', freq: up ? 600 : 2600, to: up ? 2600 : 500, sweep: dur, q: 1.1 },
  });
}

function coins(d: Dest, t: number, count: number, gain: number, spread: number): number {
  let end = t;
  for (let i = 0; i < count; i++) {
    const at = t + (i / Math.max(1, count - 1)) * spread * (0.7 + 0.3 * ((i * 37) % 7) / 7);
    const f = 2800 + ((i * 991) % 7) * 310;
    end = Math.max(end, fm(d, { t: at, freq: f, ratio: 2.76, index: 1.4, indexEnd: 0.2, decay: 0.18, gain: gain * (0.6 + ((i * 13) % 5) / 10), pan: ((i % 5) - 2) * 0.18 }));
  }
  return end;
}

export function playUi(d: Dest, sound: UiSound, t: number): number {
  switch (sound) {
    case 'focus':
      click(d, t, 0.05, 4200, 0.005);
      return tone(d, { t, freq: 2350, to: 2050, glide: 0.03, decay: 0.035, gain: 0.05 });
    case 'wheelTick':
      return click(d, t, 0.07, 3600, 0.008);
    case 'slider':
      return tone(d, { t, freq: 1700, decay: 0.022, gain: 0.05 });
    case 'type':
      click(d, t, 0.035, 2600, 0.006);
      return tone(d, { t, freq: 820, decay: 0.018, gain: 0.02 });
    case 'tab':
      click(d, t, 0.08, 2400, 0.01);
      return ping(d, t, 84, 0.06, 0.06);
    case 'confirm':
      ping(d, t, 77, 0.13, 0.14);
      return ping(d, t + 0.055, 84, 0.12, 0.2);
    case 'back':
      ping(d, t, 79, 0.1, 0.1);
      return ping(d, t + 0.05, 72, 0.09, 0.16);
    case 'toggleOn':
      click(d, t, 0.08, 2800, 0.008);
      return tone(d, { t, freq: n(76), to: n(83), glide: 0.06, decay: 0.12, gain: 0.1 });
    case 'toggleOff':
      click(d, t, 0.07, 2200, 0.008);
      return tone(d, { t, freq: n(79), to: n(72), glide: 0.06, decay: 0.1, gain: 0.08 });
    case 'error':
      tone(d, { t, freq: 220, decay: 0.16, gain: 0.07, type: 'square', filter: { type: 'lowpass', freq: 900, q: 0.7 } });
      return tone(d, { t, freq: 233, decay: 0.16, gain: 0.07, type: 'square', filter: { type: 'lowpass', freq: 900, q: 0.7 } });
    case 'locked':
      thump(d, t, 0.16, 170, 110, 0.12);
      return noise(d, { t, decay: 0.05, gain: 0.08, filter: { type: 'bandpass', freq: 900, q: 2.5 } });
    case 'open':
      whoosh(d, t, true, 0.05, 0.18);
      return ping(d, t + 0.05, 81, 0.07, 0.14);
    case 'close':
      whoosh(d, t, false, 0.045, 0.16);
      return ping(d, t, 74, 0.05, 0.1);
    case 'phoneOpen':
      whoosh(d, t, true, 0.07, 0.2);
      ping(d, t + 0.06, 72, 0.08, 0.12);
      ping(d, t + 0.1, 76, 0.08, 0.12);
      return ping(d, t + 0.14, 79, 0.09, 0.2);
    case 'phoneClose':
      whoosh(d, t, false, 0.06, 0.18);
      ping(d, t, 79, 0.07, 0.1);
      return ping(d, t + 0.05, 72, 0.07, 0.14);
    case 'toast':
      return fm(d, { t, freq: n(84), ratio: 2, index: 0.8, indexEnd: 0.05, decay: 0.32, gain: 0.07, send: 0.15 });
    case 'message':
      fm(d, { t, freq: n(81), ratio: 1, index: 0.6, indexEnd: 0.05, decay: 0.16, gain: 0.11 });
      return fm(d, { t: t + 0.09, freq: n(88), ratio: 1, index: 0.6, indexEnd: 0.05, decay: 0.3, gain: 0.1, send: 0.12 });
    case 'cash':
      thump(d, t, 0.12, 95, 60, 0.12);
      click(d, t, 0.1, 2000, 0.01);
      fm(d, { t: t + 0.03, freq: 1975, ratio: 3.51, index: 2.2, indexEnd: 0.1, decay: 0.45, gain: 0.08, send: 0.1 });
      return coins(d, t + 0.05, 4, 0.03, 0.12);
    case 'cashBig':
      thump(d, t, 0.18, 90, 50, 0.2);
      fm(d, { t: t + 0.02, freq: 1568, ratio: 3.51, index: 2.6, indexEnd: 0.1, decay: 0.7, gain: 0.08, send: 0.18 });
      fm(d, { t: t + 0.06, freq: 2093, ratio: 3.51, index: 2.2, indexEnd: 0.1, decay: 0.7, gain: 0.07, send: 0.18 });
      return coins(d, t + 0.05, 10, 0.03, 0.4);
    case 'buy':
      click(d, t, 0.12, 1600, 0.012);
      thump(d, t, 0.12, 150, 80, 0.09);
      ping(d, t + 0.04, 84, 0.1, 0.18);
      return fm(d, { t: t + 0.07, freq: n(91), ratio: 2, index: 0.7, indexEnd: 0.05, decay: 0.3, gain: 0.05 });
    case 'rankUp': {
      // A short brass-and-sparkle fanfare in F: 1-3-5-8, then a held major chord.
      const brass = { decay: 0.5, gain: 0.07, type: 'sawtooth' as const, attack: 0.02, filter: { type: 'lowpass' as const, freq: 900, to: 3200, sweep: 0.12, q: 1.2 }, send: 0.25 };
      chord(d, t, [n(65), n(69), n(72)], 0.09, brass);
      tone(d, { ...brass, t: t + 0.3, freq: n(77), decay: 0.9, hold: 0.25 });
      tone(d, { ...brass, t: t + 0.3, freq: n(72), decay: 0.9, hold: 0.25, gain: 0.05 });
      tone(d, { ...brass, t: t + 0.3, freq: n(69), decay: 0.9, hold: 0.25, gain: 0.05 });
      noise(d, { t: t + 0.2, color: 'white', attack: 0.4, decay: 0.8, gain: 0.03, filter: { type: 'highpass', freq: 6000 } });
      return chord(d, t + 0.32, [n(96), n(100), n(103), n(108)], 0.05, { decay: 0.6, gain: 0.03, send: 0.3 });
    }
    case 'discover': {
      const notes = [72, 76, 79, 84, 88];
      let end = t;
      notes.forEach((m, i) => {
        end = fm(d, { t: t + i * 0.07, freq: n(m), ratio: 3, index: 1.2, indexEnd: 0.05, decay: 0.9, gain: 0.06, send: 0.4, pan: (i - 2) * 0.2 });
      });
      noise(d, { t, attack: 0.3, decay: 0.6, gain: 0.025, filter: { type: 'bandpass', freq: 3000, to: 9000, sweep: 0.7, q: 0.8 } });
      return end;
    }
    case 'stamp':
      thump(d, t, 0.22, 140, 55, 0.16);
      noise(d, { t, decay: 0.07, gain: 0.12, filter: { type: 'bandpass', freq: 1200, q: 0.9 } });
      return noise(d, { t: t + 0.05, color: 'pink', decay: 0.12, gain: 0.04, filter: { type: 'highpass', freq: 3000 } });
    case 'perfect':
      chord(d, t, [n(84), n(88), n(91), n(95), n(96)], 0.035, { decay: 0.35, gain: 0.06, send: 0.3 });
      return noise(d, { t: t + 0.05, attack: 0.05, decay: 0.4, gain: 0.03, filter: { type: 'highpass', freq: 7000 } });
    case 'hold':
      return tone(d, { t, freq: 420, to: 860, glide: 0.6, attack: 0.05, hold: 0.45, decay: 0.12, gain: 0.04, type: 'triangle', vibrato: 9, vibratoDepth: 18, vibratoDelay: 0 });
    case 'holdDone':
      click(d, t, 0.1, 3000, 0.01);
      chord(d, t, [n(77), n(81), n(84)], 0.03, { decay: 0.25, gain: 0.07, send: 0.12 });
      return ping(d, t + 0.09, 89, 0.08, 0.22);
    case 'photo':
      click(d, t, 0.16, 2600, 0.01);
      noise(d, { t: t + 0.02, decay: 0.05, gain: 0.08, filter: { type: 'bandpass', freq: 1500, q: 1.5 } });
      return click(d, t + 0.09, 0.12, 2000, 0.012);
    case 'hint':
      // Pencil scribble plus a soft harp pair: Ofelia's margin notes.
      noise(d, { t, attack: 0.02, decay: 0.12, gain: 0.025, filter: { type: 'bandpass', freq: 3800, q: 2 } });
      fm(d, { t: t + 0.04, freq: n(77), ratio: 1, index: 0.3, indexEnd: 0.02, decay: 0.5, gain: 0.06, send: 0.2 });
      return fm(d, { t: t + 0.13, freq: n(84), ratio: 1, index: 0.3, indexEnd: 0.02, decay: 0.6, gain: 0.05, send: 0.2 });
    case 'objective':
      ping(d, t, 79, 0.1, 0.16);
      ping(d, t + 0.09, 84, 0.1, 0.16);
      ping(d, t + 0.18, 88, 0.11, 0.35);
      return noise(d, { t: t + 0.1, attack: 0.2, decay: 0.4, gain: 0.02, filter: { type: 'highpass', freq: 5000 } });
  }
}

/**
 * Loudness calibration (dB) applied on top of each recipe, measured with the offline QA report:
 * ticks sit around -30 dBFS peak, everyday sounds -22, celebrations -6 to -10.
 */
export const UI_TRIM_DB: Readonly<Partial<Record<UiSound, number>>> = {
  focus: 19, slider: 19, type: 26, wheelTick: 25, tab: 7, toggleOn: 17, toggleOff: 19, error: 15, locked: 15, stamp: 13,
  hold: 12, photo: 18, close: 8, open: 6, back: 2, phoneClose: 3, buy: 2, cashBig: -2, rankUp: -3, discover: -4, perfect: -4,
};

export const UI_SOUNDS: readonly UiSound[] = [
  'focus', 'confirm', 'back', 'tab', 'toggleOn', 'toggleOff', 'slider', 'error', 'locked', 'open', 'close', 'phoneOpen',
  'phoneClose', 'toast', 'message', 'type', 'cash', 'cashBig', 'buy', 'rankUp', 'discover', 'stamp', 'perfect', 'hold',
  'holdDone', 'photo', 'hint', 'objective', 'wheelTick',
];
