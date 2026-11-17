import type { ScoreApi } from '../api';
import { chord, fm, makeDest, noise, thump, tone } from '../synth/kit';
import { midiToHz } from './theory';

/** Short musical punctuation over whatever is playing. Returns the stinger's length in seconds. */

export type StingerKind = Parameters<ScoreApi['stinger']>[0];

const n = midiToHz;

export function playStinger(ctx: BaseAudioContext, out: AudioNode, hall: AudioNode, kind: StingerKind, t: number): number {
  const d = makeDest(ctx, out, hall);
  const brass = (at: number, notes: number[], dur: number, gain = 0.06) =>
    chord(d, at, notes.map(n), 0, {
      attack: 0.03, hold: dur * 0.5, decay: dur * 0.5, gain, type: 'sawtooth',
      filter: { type: 'lowpass', freq: 900, to: 3600, sweep: 0.12, q: 1.1 }, send: 0.35,
    });
  switch (kind) {
    case 'logo': {
      const notes = [60, 64, 67, 71, 74, 79, 83];
      notes.forEach((m, i) => tone(d, { t: t + i * 0.07, freq: n(m), decay: 0.6, gain: 0.07, type: 'square', filter: { type: 'lowpass', freq: 3200 }, send: 0.4 }));
      chord(d, t + 0.1, [n(48), n(55), n(64), n(71)], 0, { attack: 0.6, hold: 0.6, decay: 1.2, gain: 0.05, type: 'sawtooth', filter: { type: 'lowpass', freq: 1800 }, send: 0.5 });
      noise(d, { t: t + 0.3, attack: 0.5, decay: 1.2, gain: 0.03, filter: { type: 'highpass', freq: 7000 }, send: 0.4 });
      return 2.6;
    }
    case 'title':
      noise(d, { t, attack: 0.45, decay: 0.6, gain: 0.08, filter: { type: 'bandpass', freq: 400, to: 6000, sweep: 0.9, q: 0.9 }, send: 0.4 });
      chord(d, t + 0.4, [n(53), n(57), n(60), n(64), n(67)], 0.04, { attack: 0.25, hold: 0.6, decay: 1.4, gain: 0.05, type: 'triangle', send: 0.5 });
      fm(d, { t: t + 0.55, freq: n(84), ratio: 3, index: 1.2, indexEnd: 0.05, decay: 1.6, gain: 0.05, send: 0.5 });
      return 2.6;
    case 'rankUp':
      brass(t, [67], 0.18);
      brass(t + 0.16, [72], 0.18);
      brass(t + 0.32, [76], 0.18);
      brass(t + 0.5, [60, 64, 67, 72, 79], 1.1, 0.045);
      noise(d, { t: t + 0.2, attack: 0.3, decay: 1, gain: 0.04, filter: { type: 'highpass', freq: 5000 }, send: 0.4 });
      return 1.9;
    case 'discovery':
      [72, 74, 76, 79, 81, 84].forEach((m, i) => fm(d, { t: t + i * 0.08, freq: n(m), ratio: 3, index: 1.3, indexEnd: 0.05, decay: 1.1, gain: 0.05, send: 0.5, pan: (i - 2.5) * 0.15 }));
      noise(d, { t, attack: 0.4, decay: 0.8, gain: 0.03, filter: { type: 'bandpass', freq: 2000, to: 9000, sweep: 1, q: 0.8 } });
      return 1.6;
    case 'busted':
      tone(d, { t, freq: 650, to: 1300, glide: 0.18, decay: 0.3, gain: 0.05, type: 'square', filter: { type: 'lowpass', freq: 2400 } });
      [70, 69, 68].forEach((m, i) => brass(t + 0.35 + i * 0.28, [m - 12, m], 0.26, 0.05));
      brass(t + 1.2, [55, 67], 0.8, 0.05);
      thump(d, t + 0.35, 0.3, 90, 40, 0.6);
      return 2.2;
    case 'escaped':
      noise(d, { t, attack: 0.3, decay: 0.4, gain: 0.06, filter: { type: 'bandpass', freq: 500, to: 4000, sweep: 0.6, q: 0.9 } });
      chord(d, t + 0.3, [n(62), n(67), n(69)], 0, { attack: 0.08, hold: 0.3, decay: 0.4, gain: 0.05, type: 'triangle', send: 0.4 });
      chord(d, t + 0.75, [n(62), n(66), n(69), n(74)], 0, { attack: 0.05, hold: 0.4, decay: 1, gain: 0.05, type: 'triangle', send: 0.45 });
      return 1.9;
    case 'missionPassed':
      [0, 0.2, 0.4].forEach((o) => brass(t + o, [60, 64, 67], 0.15, 0.05));
      [67, 72, 76, 79, 84].forEach((m, i) => tone(d, { t: t + 0.7 + i * 0.14, freq: n(m), decay: 0.5, gain: 0.07, type: 'sawtooth', filter: { type: 'lowpass', freq: 3000 }, vibrato: 6, vibratoDepth: 10, send: 0.4 }));
      brass(t + 1.45, [48, 60, 64, 67, 72], 1.4, 0.05);
      noise(d, { t: t + 1.45, decay: 1.6, gain: 0.08, filter: { type: 'highpass', freq: 4000 }, send: 0.4 });
      thump(d, t + 1.45, 0.4, 120, 45, 0.5);
      return 3.2;
    case 'missionFailed':
      [62, 60, 58, 57].forEach((m, i) => tone(d, { t: t + i * 0.32, freq: n(m), decay: 0.4, gain: 0.07, type: 'square', filter: { type: 'lowpass', freq: 1200 }, send: 0.3 }));
      tone(d, { t, freq: n(38), attack: 0.3, hold: 1, decay: 0.9, gain: 0.09, type: 'sawtooth', filter: { type: 'lowpass', freq: 400 } });
      return 2.4;
    case 'perfect':
      [76, 79, 83, 86, 91].forEach((m, i) => tone(d, { t: t + i * 0.045, freq: n(m), decay: 0.4, gain: 0.06, type: 'triangle', send: 0.4 }));
      noise(d, { t: t + 0.1, attack: 0.05, decay: 0.5, gain: 0.03, filter: { type: 'highpass', freq: 8000 } });
      return 1.0;
  }
}
