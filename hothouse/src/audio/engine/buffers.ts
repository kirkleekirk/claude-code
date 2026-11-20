import { Rng } from '@/core/rng';

/**
 * Shared, per-context audio buffers and shaping curves. Built once per `BaseAudioContext` and cached
 * so every hi-hat, raindrop and tire squeal reuses the same memory.
 */

export interface SharedBuffers {
  /** 2 s of white noise (stereo-decorrelated). */
  white: AudioBuffer;
  /** 4 s of pink noise (−3 dB/oct), good for surf, rain and wind. */
  pink: AudioBuffer;
  /** 4 s of brown noise (−6 dB/oct), good for rumble and distant traffic. */
  brown: AudioBuffer;
  /** 6 s of sparse vinyl/rain crackle impulses. */
  crackle: AudioBuffer;
}

const cache = new WeakMap<BaseAudioContext, SharedBuffers>();
const curves = new Map<string, Float32Array<ArrayBuffer>>();

function fill(ctx: BaseAudioContext, seconds: number, seed: number, fn: (rng: Rng, ch: number, data: Float32Array) => void): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) fn(new Rng(seed * 31 + ch * 977), ch, buf.getChannelData(ch));
  return buf;
}

/** Fade the loop seam so looping noise never clicks. */
function smoothSeam(data: Float32Array, sampleRate: number): void {
  const n = Math.min(data.length >> 2, Math.floor(sampleRate * 0.02));
  for (let i = 0; i < n; i++) {
    const w = i / n;
    const end = data.length - n + i;
    data[end] = data[end]! * (1 - w) + data[i]! * w;
  }
}

export function buffers(ctx: BaseAudioContext): SharedBuffers {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const white = fill(ctx, 2, 11, (rng, _ch, d) => {
    for (let i = 0; i < d.length; i++) d[i] = rng.next() * 2 - 1;
    smoothSeam(d, sr);
  });
  const pink = fill(ctx, 4, 23, (rng, _ch, d) => {
    // Paul Kellet's economy pink filter.
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rng.next() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    smoothSeam(d, sr);
  });
  const brown = fill(ctx, 4, 37, (rng, _ch, d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (rng.next() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    smoothSeam(d, sr);
  });
  const crackle = fill(ctx, 6, 53, (rng, _ch, d) => {
    d.fill(0);
    const pops = Math.floor(6 * 26);
    for (let p = 0; p < pops; p++) {
      const at = Math.floor(rng.next() * (d.length - 200));
      const amp = (rng.next() < 0.12 ? 0.9 : 0.25) * (rng.next() < 0.5 ? -1 : 1);
      const len = 8 + Math.floor(rng.next() * 60);
      for (let i = 0; i < len; i++) d[at + i] = d[at + i]! + amp * Math.exp(-i / (len * 0.25)) * (rng.next() * 0.6 + 0.4);
    }
  });
  const out = { white, pink, brown, crackle };
  cache.set(ctx, out);
  return out;
}

/** Soft-clip curve (tanh) with `drive` ≥ 1. Cached by drive. */
export function softClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const d = Math.max(1, Math.round(drive * 10) / 10);
  const key = `soft:${d}`;
  let c = curves.get(key);
  if (!c) {
    const n = 2048;
    c = new Float32Array(new ArrayBuffer(n * 4));
    const norm = Math.tanh(d);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * d) / norm;
    }
    curves.set(key, c);
  }
  return c;
}

/** Asymmetric "rasp" curve for engines and overdriven synths: adds even harmonics. */
export function raspCurve(amount: number): Float32Array<ArrayBuffer> {
  const a = Math.round(Math.min(1, Math.max(0, amount)) * 20) / 20;
  const key = `rasp:${a}`;
  let c = curves.get(key);
  if (!c) {
    const n = 2048;
    c = new Float32Array(new ArrayBuffer(n * 4));
    const k = 1 + a * 6;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const y = x >= 0 ? Math.tanh(x * k) : Math.tanh(x * k * (1 - a * 0.45)) * (1 - a * 0.2);
      c[i] = y / Math.tanh(k);
    }
    curves.set(key, c);
  }
  return c;
}

/** Bit-crush-ish stepped curve for radio/telephone voices. */
export function stepCurve(steps: number): Float32Array<ArrayBuffer> {
  const s = Math.max(4, Math.round(steps));
  const key = `step:${s}`;
  let c = curves.get(key);
  if (!c) {
    const n = 2048;
    c = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.round(x * s) / s;
    }
    curves.set(key, c);
  }
  return c;
}

const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/**
 * Cached `PeriodicWave` from harmonic amplitudes (index 0 = DC, 1 = fundamental…). Used for organ,
 * engine and vowel timbres.
 */
export function periodicWave(ctx: BaseAudioContext, key: string, harmonics: readonly number[]): PeriodicWave {
  let byCtx = waves.get(ctx);
  if (!byCtx) waves.set(ctx, (byCtx = new Map()));
  let w = byCtx.get(key);
  if (!w) {
    const real = new Float32Array(harmonics.length);
    const imag = new Float32Array(harmonics.length);
    for (let i = 1; i < harmonics.length; i++) imag[i] = harmonics[i]!;
    w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    byCtx.set(key, w);
  }
  return w;
}
