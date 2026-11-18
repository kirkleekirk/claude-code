import { buffers, softClipCurve, type SharedBuffers } from '../engine/buffers';
import { clampf, fin } from '../util/params';

/**
 * Synthesis building blocks. Every function schedules nodes at absolute context time `t`,
 * connects them to `dest`, cleans them up when they finish, and returns the time the sound ends.
 */

export interface Dest {
  readonly ctx: BaseAudioContext;
  readonly out: AudioNode;
  readonly buf: SharedBuffers;
  /** Optional reverb send; recipes pass a send level per layer. */
  readonly send?: AudioNode;
  /** Pitch multiplier (slow-mo, per-call pitch). */
  readonly pitch: number;
}

export function makeDest(ctx: BaseAudioContext, out: AudioNode, send?: AudioNode, pitch = 1): Dest {
  return send ? { ctx, out, buf: buffers(ctx), send, pitch } : { ctx, out, buf: buffers(ctx), pitch };
}

export function withOut(d: Dest, out: AudioNode, pitch = d.pitch): Dest {
  return d.send ? { ctx: d.ctx, out, buf: d.buf, send: d.send, pitch } : { ctx: d.ctx, out, buf: d.buf, pitch };
}

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  /** End frequency for an exponential sweep over `sweep` seconds. */
  to?: number;
  sweep?: number;
  q?: number;
  gain?: number;
}

export interface ToneSpec {
  t: number;
  freq: number;
  /** Exponential glide target and duration. */
  to?: number;
  glide?: number;
  type?: OscillatorType;
  wave?: PeriodicWave;
  attack?: number;
  decay: number;
  /** Holds at peak this long before decaying (sustained notes). */
  hold?: number;
  gain: number;
  detune?: number;
  filter?: FilterSpec;
  /** −1 … 1 stereo position. */
  pan?: number;
  /** Vibrato rate (Hz) and depth (cents), starting after `vibratoDelay`. */
  vibrato?: number;
  vibratoDepth?: number;
  vibratoDelay?: number;
  /** Reverb send level. */
  send?: number;
  /** Overrides the destination node. */
  out?: AudioNode;
}

export interface NoiseSpec {
  t: number;
  color?: 'white' | 'pink' | 'brown';
  attack?: number;
  decay: number;
  hold?: number;
  gain: number;
  rate?: number;
  filter?: FilterSpec;
  filter2?: FilterSpec;
  pan?: number;
  send?: number;
  out?: AudioNode;
}

const STOP_PAD = 0.05;

function after(node: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  node.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  };
}

function makeFilter(ctx: BaseAudioContext, f: FilterSpec, t: number, pitch: number): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = f.type;
  const f0 = clampf(f.freq * pitch, 10, 22000, 1000);
  node.frequency.setValueAtTime(f0, t);
  if (f.to !== undefined) {
    const f1 = clampf(f.to * pitch, 10, 22000, f0);
    node.frequency.exponentialRampToValueAtTime(f1, t + Math.max(0.003, fin(f.sweep ?? 0.1, 0.1)));
  }
  node.Q.value = clampf(f.q ?? 0.7, 0.0001, 40, 0.7);
  if (f.gain !== undefined) node.gain.value = clampf(f.gain, -40, 40, 0);
  return node;
}

/** Connect `node` to the destination (with optional pan and send). Returns the extra nodes made. */
function route(d: Dest, node: AudioNode, pan: number | undefined, send: number | undefined, out?: AudioNode): AudioNode[] {
  const made: AudioNode[] = [];
  let tail = node;
  if (pan !== undefined && pan !== 0) {
    const p = d.ctx.createStereoPanner();
    p.pan.value = clampf(pan, -1, 1, 0);
    tail.connect(p);
    tail = p;
    made.push(p);
  }
  tail.connect(out ?? d.out);
  if (d.send && send && send > 0) {
    const s = d.ctx.createGain();
    s.gain.value = clampf(send, 0, 2, 0);
    tail.connect(s).connect(d.send);
    made.push(s);
  }
  return made;
}

/** Oscillator with an attack/hold/decay envelope, optional glide, filter, vibrato and pan. */
export function tone(d: Dest, s: ToneSpec): number {
  const { ctx } = d;
  const t = fin(s.t, ctx.currentTime);
  const attack = Math.max(0.001, fin(s.attack ?? 0.004, 0.004));
  const hold = Math.max(0, fin(s.hold ?? 0, 0));
  const decay = Math.max(0.01, fin(s.decay, 0.2));
  const end = t + attack + hold + decay;
  const o = ctx.createOscillator();
  if (s.wave) o.setPeriodicWave(s.wave);
  else o.type = s.type ?? 'sine';
  const f0 = clampf(s.freq * d.pitch, 1, 20000, 440);
  o.frequency.setValueAtTime(f0, t);
  if (s.to !== undefined) o.frequency.exponentialRampToValueAtTime(clampf(s.to * d.pitch, 1, 20000, f0), t + Math.max(0.003, fin(s.glide ?? decay, decay)));
  if (s.detune) o.detune.value = clampf(s.detune, -2400, 2400, 0);
  const nodes: AudioNode[] = [o];
  if (s.vibrato && s.vibratoDepth) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = clampf(s.vibrato, 0.1, 40, 5);
    const depth = ctx.createGain();
    const delay = Math.max(0, fin(s.vibratoDelay ?? 0.15, 0.15));
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(clampf(s.vibratoDepth, 0, 1200, 0), t + delay + 0.2);
    lfo.connect(depth).connect(o.detune);
    lfo.start(t);
    lfo.stop(end + STOP_PAD);
    nodes.push(lfo, depth);
  }
  const g = ctx.createGain();
  const peak = clampf(s.gain, 0, 4, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.setTargetAtTime(0, t + attack + hold, decay / 5);
  nodes.push(g);
  let head: AudioNode = o;
  if (s.filter) {
    const f = makeFilter(ctx, s.filter, t, d.pitch);
    head.connect(f);
    head = f;
    nodes.push(f);
  }
  head.connect(g);
  nodes.push(...route(d, g, s.pan, s.send, s.out));
  o.start(t);
  o.stop(end + STOP_PAD);
  after(o, nodes);
  return end;
}

/** Noise burst from the shared buffers with envelope and up to two filters. */
export function noise(d: Dest, s: NoiseSpec): number {
  const { ctx } = d;
  const t = fin(s.t, ctx.currentTime);
  const attack = Math.max(0.0005, fin(s.attack ?? 0.002, 0.002));
  const hold = Math.max(0, fin(s.hold ?? 0, 0));
  const decay = Math.max(0.005, fin(s.decay, 0.1));
  const end = t + attack + hold + decay;
  const src = ctx.createBufferSource();
  const buf = s.color === 'pink' ? d.buf.pink : s.color === 'brown' ? d.buf.brown : d.buf.white;
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = clampf((s.rate ?? 1) * d.pitch, 0.05, 8, 1);
  const g = ctx.createGain();
  const peak = clampf(s.gain, 0, 4, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.setTargetAtTime(0, t + attack + hold, decay / 5);
  const nodes: AudioNode[] = [src, g];
  let head: AudioNode = src;
  for (const spec of [s.filter, s.filter2]) {
    if (!spec) continue;
    const f = makeFilter(ctx, spec, t, d.pitch);
    head.connect(f);
    head = f;
    nodes.push(f);
  }
  head.connect(g);
  nodes.push(...route(d, g, s.pan, s.send, s.out));
  // Random start offset so repeated bursts never sound identical.
  const offset = ((t * 7919.3) % 1) * (buf.duration - 0.5);
  src.start(t, Math.max(0, offset));
  src.stop(end + STOP_PAD);
  after(src, nodes);
  return end;
}

export interface FmSpec {
  t: number;
  freq: number;
  /** Modulator frequency ratio (inharmonic ratios give bells and metal). */
  ratio: number;
  /** Modulation index at the start and at the end of the note. */
  index: number;
  indexEnd?: number;
  attack?: number;
  decay: number;
  hold?: number;
  gain: number;
  pan?: number;
  send?: number;
  out?: AudioNode;
  type?: OscillatorType;
}

/** Two-operator FM: bells, keys, metal, plucks. */
export function fm(d: Dest, s: FmSpec): number {
  const { ctx } = d;
  const t = fin(s.t, ctx.currentTime);
  const attack = Math.max(0.001, fin(s.attack ?? 0.002, 0.002));
  const hold = Math.max(0, fin(s.hold ?? 0, 0));
  const decay = Math.max(0.01, fin(s.decay, 0.5));
  const end = t + attack + hold + decay;
  const f = clampf(s.freq * d.pitch, 1, 16000, 440);
  const car = ctx.createOscillator();
  car.type = s.type ?? 'sine';
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = clampf(f * s.ratio, 0.1, 20000, f);
  const modGain = ctx.createGain();
  const i0 = clampf(s.index, 0, 50, 1) * f;
  const i1 = clampf(s.indexEnd ?? s.index * 0.1, 0, 50, 0.1) * f;
  modGain.gain.setValueAtTime(i0, t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, i1), t + attack + hold + decay * 0.7);
  mod.connect(modGain).connect(car.frequency);
  const g = ctx.createGain();
  const peak = clampf(s.gain, 0, 4, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.setTargetAtTime(0, t + attack + hold, decay / 5);
  car.connect(g);
  const nodes: AudioNode[] = [car, mod, modGain, g, ...route(d, g, s.pan, s.send, s.out)];
  car.start(t);
  mod.start(t);
  car.stop(end + STOP_PAD);
  mod.stop(end + STOP_PAD);
  after(car, nodes);
  return end;
}

/** A very short transient: the "tick" in clicks, latches and mallets. */
export function click(d: Dest, t: number, gain: number, freq = 3200, decay = 0.012, pan?: number, out?: AudioNode): number {
  return noise(d, {
    t, decay, gain, attack: 0.0005,
    filter: { type: 'bandpass', freq, q: 1.4 },
    ...(pan !== undefined ? { pan } : {}),
    ...(out ? { out } : {}),
  });
}

/** Low body thump (impacts, kicks, doors). */
export function thump(d: Dest, t: number, gain: number, from = 120, to = 45, decay = 0.25, out?: AudioNode): number {
  return tone(d, { t, freq: from, to, glide: decay * 0.6, decay, gain, attack: 0.002, ...(out ? { out } : {}) });
}

/** A chord or arpeggio of tones; `spread` seconds between notes (0 = block chord). */
export function chord(d: Dest, t: number, freqs: readonly number[], spread: number, base: Omit<ToneSpec, 't' | 'freq'>): number {
  let end = t;
  for (let i = 0; i < freqs.length; i++) {
    end = Math.max(end, tone(d, { ...base, t: t + i * spread, freq: freqs[i]! }));
  }
  return end;
}

/** Soft saturation stage for gritty layers. Caller connects and disconnects. */
export function drive(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  ws.curve = softClipCurve(1 + Math.max(0, amount) * 6);
  ws.oversample = '2x';
  return ws;
}

/** Note frequency helper for recipes: semitones from A4. */
export const hz = (semisFromA4: number): number => 440 * Math.pow(2, semisFromA4 / 12);
