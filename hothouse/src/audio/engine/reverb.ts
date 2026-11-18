import { Rng } from '@/core/rng';

/**
 * Generated impulse responses: a warm plate-ish room for the world and a long, darker hall for
 * music and stingers. Built from decorrelated decaying noise with early reflections and a
 * frequency-dependent decay (high frequencies die first), so nothing sounds metallic.
 */

export interface IrSpec {
  seconds: number;
  /** RT-ish decay in seconds (to −60 dB). */
  decay: number;
  /** Pre-delay in seconds. */
  preDelay: number;
  /** 0 = bright, 1 = very dark tail. */
  damping: number;
  /** Number of discrete early reflections. */
  early: number;
  seed: number;
}

export const IR_ROOM: IrSpec = { seconds: 1.6, decay: 1.25, preDelay: 0.008, damping: 0.55, early: 9, seed: 7 };
export const IR_HALL: IrSpec = { seconds: 3.4, decay: 2.9, preDelay: 0.022, damping: 0.42, early: 14, seed: 19 };

export function buildImpulse(ctx: BaseAudioContext, spec: IrSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * spec.seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(spec.preDelay * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rng = new Rng(spec.seed * 101 + ch * 13);
    // One-pole low-pass whose coefficient grows over time: the tail darkens as it decays.
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / spec.decay);
      const k = Math.min(0.98, 0.15 + spec.damping * (t / spec.seconds) * 1.6 + spec.damping * 0.3);
      const w = rng.next() * 2 - 1;
      lp = lp * k + w * (1 - k);
      // Fade the first 6 ms in so the tail never starts with a click.
      const fadeIn = Math.min(1, t / 0.006);
      d[i] = lp * env * fadeIn * 1.4;
    }
    for (let e = 0; e < spec.early; e++) {
      const at = pre + Math.floor((0.004 + rng.next() * 0.07) * sr);
      if (at >= len) continue;
      const amp = (0.55 - e * (0.4 / spec.early)) * (rng.next() < 0.5 ? -1 : 1);
      d[at] = d[at]! + amp;
    }
  }
  // Normalize to unit energy per channel: convolving broadband sound then keeps its level, so the
  // wet level is set by the send and return gains alone.
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) energy += d[i]! * d[i]!;
  }
  const norm = 0.8 / Math.sqrt(Math.max(1e-9, energy / 2));
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = d[i]! * norm;
  }
  return buf;
}
