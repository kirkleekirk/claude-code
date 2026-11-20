/**
 * Safe AudioParam helpers. Every value that reaches Web Audio passes through `fin` so a NaN or
 * Infinity from gameplay code can never throw or silence the graph.
 */

export function fin(x: number, fallback = 0): number {
  return Number.isFinite(x) ? x : fallback;
}

export function clampf(x: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(x)) return fallback;
  return x < min ? min : x > max ? max : x;
}

export const clamp01f = (x: number, fallback = 0): number => clampf(x, 0, 1, fallback);

/** Linear gain for decibels. */
export function dbToGain(db: number): number {
  return Math.pow(10, fin(db, -120) / 20);
}

export function gainToDb(g: number): number {
  return g <= 1e-9 ? -180 : 20 * Math.log10(g);
}

/** MIDI note number to frequency in Hz. */
export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (fin(note, 69) - 69) / 12);
}

/** Perceptual taper for 0–1 volume sliders. */
export function sliderToGain(v: number): number {
  const x = clamp01f(v, 1);
  return x * x;
}

/** Set immediately (cancelling automation). */
export function setNow(param: AudioParam, value: number, t: number): void {
  const v = fin(value, param.defaultValue);
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

/** Smoothly approach `value` with time constant `tau` seconds. */
export function glide(param: AudioParam, value: number, t: number, tau = 0.05): void {
  const v = fin(value, param.value);
  param.cancelScheduledValues(t);
  param.setTargetAtTime(v, t, Math.max(0.001, tau));
}

/** Attack/decay envelope on a gain param: 0 → peak → floor, exponential decay. Returns end time. */
export function envAD(param: AudioParam, t: number, attack: number, decay: number, peak: number): number {
  const p = Math.max(0, fin(peak));
  const a = Math.max(0.0005, fin(attack, 0.001));
  const d = Math.max(0.005, fin(decay, 0.1));
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(p, t + a);
  param.setTargetAtTime(0, t + a, d / 4.6);
  return t + a + d;
}

/** ADSR with explicit sustain length. Returns end time. */
export function envADSR(
  param: AudioParam, t: number, attack: number, decay: number, sustain: number, hold: number, release: number, peak: number,
): number {
  const p = Math.max(0, fin(peak));
  const a = Math.max(0.001, fin(attack, 0.005));
  const d = Math.max(0.001, fin(decay, 0.05));
  const s = Math.max(0, fin(sustain, 0.7)) * p;
  const h = Math.max(0, fin(hold, 0));
  const r = Math.max(0.005, fin(release, 0.1));
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(p, t + a);
  param.setTargetAtTime(s, t + a, d / 3);
  // A later setTarget event starts from wherever the previous one has reached.
  const relStart = Math.max(t + a, t + h);
  param.setTargetAtTime(0, relStart, r / 4.6);
  return relStart + r;
}

/** Exponential frequency sweep that never touches zero. */
export function sweep(param: AudioParam, t: number, from: number, to: number, duration: number): void {
  const f0 = Math.max(1, fin(from, 440));
  const f1 = Math.max(1, fin(to, 440));
  param.setValueAtTime(f0, t);
  param.exponentialRampToValueAtTime(f1, t + Math.max(0.002, fin(duration, 0.1)));
}
