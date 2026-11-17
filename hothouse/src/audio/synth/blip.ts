import type { VoiceProfile } from '../api';
import { periodicWave } from '../engine/buffers';
import { clamp01f, clampf, fin } from '../util/params';

/**
 * Dialogue babble: one tonal syllable per call. A soft buzz source runs through two band-pass
 * "formants" chosen from five vowels, with a short pitch contour, so lines sound like speech
 * without words. Kept gentle and low-passed: it plays under every line of dialogue.
 */

const VOWELS: ReadonlyArray<readonly [number, number]> = [
  [800, 1200], // a
  [500, 1850], // e
  [320, 2250], // i
  [520, 900], // o
  [360, 820], // u
];

/** Pitch steps (semitones) a syllable may take relative to the voice's base pitch. */
const STEPS = [0, 2, -2, 3, 5, -3, 0, 7];

let counter = 0;

function hashUnit(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function playBlip(ctx: BaseAudioContext, out: AudioNode, voice: VoiceProfile, emphasis: number, t: number): number {
  const i = counter++;
  const r1 = hashUnit(i * 3 + 1);
  const r2 = hashUnit(i * 3 + 2);
  const r3 = hashUnit(i * 3 + 3);
  const pitch = clampf(voice.pitch, 70, 420, 180);
  const bright = clamp01f(voice.brightness, 0.5);
  const expr = clamp01f(voice.expressiveness, 0.5);
  const emph = clamp01f(fin(emphasis, 0));

  const step = STEPS[Math.floor(r1 * STEPS.length)]! * (0.35 + expr * 0.65);
  const f0 = pitch * Math.pow(2, (step + emph * 3) / 12);
  const len = 0.055 + r2 * 0.05 + emph * 0.03;
  const vowel = VOWELS[Math.floor(r3 * VOWELS.length)]!;
  const formantScale = 0.85 + bright * 0.35 + (pitch - 180) / 900;

  const src = ctx.createOscillator();
  src.setPeriodicWave(periodicWave(ctx, 'blip-buzz', [0, 1, 0.7, 0.5, 0.36, 0.26, 0.18, 0.13, 0.09, 0.06, 0.04]));
  src.frequency.setValueAtTime(f0, t);
  // Contour: questions rise, statements fall, emphasis pops up then settles.
  const contour = (r1 - 0.5) * 2 * expr * 0.06 + emph * 0.04;
  src.frequency.linearRampToValueAtTime(f0 * (1 + contour), t + len);

  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = clampf(vowel[0] * formantScale, 150, 3000, 600);
  f1.Q.value = 5;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = clampf(vowel[1] * formantScale, 400, 5000, 1500);
  f2.Q.value = 7 + bright * 5;
  const f2Gain = ctx.createGain();
  f2Gain.gain.value = 0.45 + bright * 0.45;
  const body = ctx.createGain();
  body.gain.value = 0.35;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 3600 + bright * 1800;
  const env = ctx.createGain();
  const peak = 0.36 * (0.7 + emph * 0.4);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.008);
  env.gain.setValueAtTime(peak, t + len * 0.6);
  env.gain.linearRampToValueAtTime(0, t + len);

  src.connect(f1).connect(env);
  src.connect(f2).connect(f2Gain).connect(env);
  src.connect(body).connect(soft).connect(env);
  env.connect(out);
  src.start(t);
  src.stop(t + len + 0.02);
  const nodes: AudioNode[] = [src, f1, f2, f2Gain, body, soft, env];
  src.onended = () => nodes.forEach((n) => n.disconnect());
  return t + len;
}
