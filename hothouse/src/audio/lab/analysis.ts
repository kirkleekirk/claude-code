/**
 * Measurements for rendered audio: level, crest factor, broken samples, BS.1770-style loudness and
 * a dominant-frequency estimate. Used by the audio lab's QA report (no listening required).
 */

export interface Stats {
  seconds: number;
  peak: number;
  peakDb: number;
  rmsDb: number;
  crestDb: number;
  /** Integrated loudness (gated) for ≥ 1 s, otherwise ungated. LUFS-like. */
  lufs: number;
  nan: number;
  clipped: number;
  /** Seconds above −50 dBFS. */
  active: number;
}

const db = (x: number): number => (x <= 1e-12 ? -240 : 20 * Math.log10(x));

interface Biquad {
  b0: number; b1: number; b2: number; a1: number; a2: number;
}

function kWeighting(fs: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, hp];
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const o = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o;
    y[i] = o;
  }
  return y;
}

/** Analyse `buffer` from `from` seconds (to skip attack or warm-up). */
export function analyze(buffer: AudioBuffer, from = 0): Stats {
  const fs = buffer.sampleRate;
  const start = Math.min(buffer.length, Math.floor(from * fs));
  const chans: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c).subarray(start));
  const n = chans[0]!.length;
  let peak = 0, sum = 0, nan = 0, clipped = 0, activeSamples = 0;
  for (let i = 0; i < n; i++) {
    let frameMax = 0;
    for (const ch of chans) {
      const v = ch[i]!;
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += v * v;
      if (a > frameMax) frameMax = a;
    }
    if (frameMax > 0.00316) activeSamples++;
  }
  const rms = Math.sqrt(sum / Math.max(1, n * chans.length));
  // K-weighted loudness.
  const [shelf, hp] = kWeighting(fs);
  const weighted = chans.map((ch) => filter(filter(ch, shelf), hp));
  const blockLen = Math.floor(0.4 * fs);
  const hop = Math.floor(0.1 * fs);
  let lufs: number;
  if (n >= fs && n >= blockLen) {
    const blocks: number[] = [];
    for (let s = 0; s + blockLen <= n; s += hop) {
      let z = 0;
      for (const w of weighted) {
        let acc = 0;
        for (let i = s; i < s + blockLen; i++) acc += w[i]! * w[i]!;
        z += acc / blockLen;
      }
      blocks.push(z);
    }
    const loud = (z: number) => -0.691 + 10 * Math.log10(Math.max(1e-12, z));
    const abs = blocks.filter((z) => loud(z) > -70);
    const meanAbs = abs.reduce((a, b) => a + b, 0) / Math.max(1, abs.length);
    const rel = abs.filter((z) => loud(z) > loud(meanAbs) - 10);
    lufs = rel.length ? loud(rel.reduce((a, b) => a + b, 0) / rel.length) : -70;
  } else {
    let z = 0;
    for (const w of weighted) {
      let acc = 0;
      let count = 0;
      // Only the audible part: short sounds should not be penalized for their tail.
      for (let i = 0; i < w.length; i++) {
        if (Math.abs(chans[0]![i]!) > 0.00316) {
          acc += w[i]! * w[i]!;
          count++;
        }
      }
      z += count ? acc / count : 0;
    }
    lufs = -0.691 + 10 * Math.log10(Math.max(1e-12, z));
  }
  return {
    seconds: n / fs, peak, peakDb: db(peak), rmsDb: db(rms), crestDb: db(peak) - db(rms), lufs: Math.round(lufs * 10) / 10,
    nan, clipped, active: activeSamples / fs,
  };
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k]!, ai = im[i + k]!;
        const br = re[i + k + len / 2]! * cr - im[i + k + len / 2]! * ci;
        const bi = re[i + k + len / 2]! * ci + im[i + k + len / 2]! * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Strongest frequency between `minHz` and `maxHz` in a Hann-windowed block starting at `from`. */
export function dominantHz(buffer: AudioBuffer, from: number, minHz: number, maxHz: number, size = 16384): number {
  const fs = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const start = Math.min(Math.max(0, data.length - size), Math.floor(from * fs));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = (data[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  fft(re, im);
  const lo = Math.max(1, Math.floor((minHz * size) / fs));
  const hi = Math.min(size / 2 - 2, Math.ceil((maxHz * size) / fs));
  let best = lo;
  let bestMag = -1;
  const mag = (k: number) => Math.hypot(re[k]!, im[k]!);
  for (let k = lo; k <= hi; k++) {
    const m = mag(k);
    if (m > bestMag) {
      bestMag = m;
      best = k;
    }
  }
  const a = mag(best - 1), b = mag(best), c = mag(best + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return ((best + (Number.isFinite(shift) ? shift : 0)) * fs) / size;
}

/** 16-bit PCM WAV, base64-encoded. */
export function wavBase64(buffer: AudioBuffer, maxSeconds = 12): string {
  const fs = buffer.sampleRate;
  const n = Math.min(buffer.length, Math.floor(maxSeconds * fs));
  const ch = Math.min(2, buffer.numberOfChannels);
  const bytes = new Uint8Array(44 + n * ch * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, fs, true);
  v.setUint32(28, fs * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const datas = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, datas[c]![i] ?? 0));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
