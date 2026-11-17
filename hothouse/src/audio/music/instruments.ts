import type { StationId } from '../api';
import { softClipCurve } from '../engine/buffers';
import { clampf, fin } from '../util/params';
import { fm, noise, tone, type Dest } from '../synth/kit';
import { midiToHz } from './theory';
import type { NoteEvent } from './types';

/**
 * Pitched instruments. Each station has its own patch family; `patch` picks a variation per track.
 * All voices schedule at absolute time `t` for `dur` seconds and clean up after themselves.
 */

const hz = midiToHz;

function cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  };
}

interface PolyOpts {
  waves: readonly OscillatorType[];
  detunes: readonly number[];
  cutoff: number;
  /** Filter opens to cutoff × env at the attack peak, then settles. */
  env?: number;
  q?: number;
  attack: number;
  release: number;
  gain: number;
  send?: number;
  octaveUp?: boolean;
}

/** Polyphonic analog-style voice: stacked detuned oscillators per note through one filter. */
function poly(d: Dest, notes: readonly number[], t: number, dur: number, vel: number, o: PolyOpts): void {
  const { ctx } = d;
  const end = t + dur + o.release;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = o.q ?? 0.7;
  const cutoff = clampf(o.cutoff * (0.75 + vel * 0.5), 80, 16000, 1500);
  if (o.env) {
    f.frequency.setValueAtTime(cutoff * 0.5, t);
    f.frequency.exponentialRampToValueAtTime(Math.min(16000, cutoff * o.env), t + Math.max(0.01, o.attack));
    f.frequency.setTargetAtTime(cutoff, t + o.attack, Math.max(0.05, dur * 0.3));
  } else {
    f.frequency.value = cutoff;
  }
  const g = ctx.createGain();
  const peak = clampf(o.gain * vel / Math.sqrt(Math.max(1, notes.length)), 0, 2, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + o.attack);
  g.gain.setValueAtTime(peak, t + Math.max(o.attack, dur));
  g.gain.setTargetAtTime(0, t + Math.max(o.attack, dur), o.release / 4);
  f.connect(g).connect(d.out);
  const nodes: AudioNode[] = [f, g];
  if (d.send && o.send) {
    const s = ctx.createGain();
    s.gain.value = o.send;
    g.connect(s).connect(d.send);
    nodes.push(s);
  }
  let first: OscillatorNode | null = null;
  for (const n of notes) {
    for (let i = 0; i < o.waves.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = o.waves[i]!;
      osc.frequency.value = hz(n + (o.octaveUp && i === o.waves.length - 1 ? 12 : 0));
      osc.detune.value = o.detunes[i] ?? 0;
      osc.connect(f);
      osc.start(t);
      osc.stop(end + 0.05);
      nodes.push(osc);
      first ??= osc;
    }
  }
  if (first) cleanup(first, nodes);
}

/** Monophonic synth voice with optional glide, filter envelope, vibrato and drive. */
interface MonoOpts {
  waves: readonly OscillatorType[];
  detunes?: readonly number[];
  cutoff: number;
  env?: number;
  envDecay?: number;
  q?: number;
  attack: number;
  release: number;
  gain: number;
  glide?: number;
  vibrato?: number;
  drive?: number;
  send?: number;
  sub?: number;
}

function mono(d: Dest, e: NoteEvent, t: number, dur: number, o: MonoOpts): void {
  const { ctx } = d;
  const target = hz(e.note);
  const end = t + dur + o.release;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = o.q ?? 0.8;
  const cutoff = clampf(o.cutoff * (0.7 + e.vel * 0.6), 60, 16000, 1200);
  if (o.env) {
    f.frequency.setValueAtTime(Math.min(16000, cutoff * o.env), t);
    f.frequency.setTargetAtTime(cutoff, t + 0.005, Math.max(0.01, o.envDecay ?? 0.08));
  } else {
    f.frequency.value = cutoff;
  }
  const g = ctx.createGain();
  const peak = clampf(o.gain * e.vel, 0, 2, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + o.attack);
  g.gain.setValueAtTime(peak, t + Math.max(o.attack, dur));
  g.gain.setTargetAtTime(0, t + Math.max(o.attack, dur), o.release / 4);
  const nodes: AudioNode[] = [f, g];
  let tail: AudioNode = f;
  if (o.drive) {
    const ws = ctx.createWaveShaper();
    ws.curve = softClipCurve(1 + o.drive * 5);
    f.connect(ws);
    tail = ws;
    nodes.push(ws);
  }
  tail.connect(g).connect(d.out);
  if (d.send && o.send) {
    const s = ctx.createGain();
    s.gain.value = o.send;
    g.connect(s).connect(d.send);
    nodes.push(s);
  }
  const from = e.from !== undefined && o.glide ? hz(e.from) : target;
  let lfoGain: GainNode | null = null;
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.4;
    lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, t);
    lfoGain.gain.linearRampToValueAtTime(o.vibrato, t + Math.min(0.35, dur * 0.6) + 0.05);
    lfo.connect(lfoGain);
    lfo.start(t);
    lfo.stop(end + 0.05);
    nodes.push(lfo, lfoGain);
  }
  let first: OscillatorNode | null = null;
  const waves = o.sub ? [...o.waves, 'sine' as OscillatorType] : o.waves;
  for (let i = 0; i < waves.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = waves[i]!;
    const isSub = o.sub && i === waves.length - 1;
    const mult = isSub ? 0.5 : 1;
    osc.frequency.setValueAtTime(from * mult, t);
    if (from !== target) osc.frequency.exponentialRampToValueAtTime(target * mult, t + (o.glide ?? 0.05));
    osc.detune.value = o.detunes?.[i] ?? 0;
    if (lfoGain) lfoGain.connect(osc.detune);
    let src: AudioNode = osc;
    if (isSub) {
      const sg = ctx.createGain();
      sg.gain.value = o.sub!;
      osc.connect(sg);
      src = sg;
      nodes.push(sg);
    }
    src.connect(f);
    osc.start(t);
    osc.stop(end + 0.05);
    nodes.push(osc);
    first ??= osc;
  }
  if (first) cleanup(first, nodes);
}

/** 808: sine with an attack pitch drop, glide from the previous note, saturation and long decay. */
function bass808(d: Dest, e: NoteEvent, t: number, dur: number, distorted: boolean): void {
  const { ctx } = d;
  const target = hz(e.note);
  const from = e.from !== undefined ? hz(e.from) : target * 1.5;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(target, t + (e.from !== undefined ? 0.07 : 0.035));
  const ws = ctx.createWaveShaper();
  ws.curve = softClipCurve(distorted ? 5 : 2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = distorted ? 1400 : 700;
  const g = ctx.createGain();
  const len = Math.max(0.15, dur);
  const peak = clampf(0.75 * e.vel, 0, 1.5, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(peak * 0.7, t + 0.01, len * 0.6);
  g.gain.setTargetAtTime(0, t + len, 0.04);
  osc.connect(ws).connect(lp).connect(g).connect(d.out);
  osc.start(t);
  osc.stop(t + len + 0.3);
  cleanup(osc, [osc, ws, lp, g]);
}

export function playBass(d: Dest, e: NoteEvent, t: number, dur: number, station: StationId, patch: number): void {
  const p = patch % 3;
  switch (station) {
    case 'sunset':
      if (p === 0) mono(d, e, t, dur, { waves: ['sawtooth'], cutoff: 520, env: 4, envDecay: 0.09, q: 2, attack: 0.004, release: 0.06, gain: 0.5, sub: 0.6 });
      else if (p === 1) mono(d, e, t, dur, { waves: ['square'], cutoff: 450, env: 3, envDecay: 0.12, q: 1.5, attack: 0.004, release: 0.06, gain: 0.42, sub: 0.7 });
      else mono(d, e, t, dur, { waves: ['sawtooth', 'sawtooth'], detunes: [-7, 7], cutoff: 600, env: 3.5, envDecay: 0.1, q: 1.2, attack: 0.004, release: 0.05, gain: 0.4, sub: 0.5 });
      break;
    case 'calle':
      if (p === 0) mono(d, e, t, dur, { waves: ['triangle'], cutoff: 1100, attack: 0.006, release: 0.08, gain: 0.7, sub: 0.6 });
      else if (p === 1) mono(d, e, t, dur, { waves: ['sawtooth'], cutoff: 700, env: 3, envDecay: 0.07, q: 1.4, attack: 0.003, release: 0.06, gain: 0.45, sub: 0.6 });
      else mono(d, e, t, dur, { waves: ['sine'], cutoff: 900, attack: 0.005, release: 0.08, gain: 0.8, drive: 0.3 });
      break;
    case 'haze':
      if (p === 0) mono(d, e, t, dur, { waves: ['sine', 'triangle'], cutoff: 700, attack: 0.012, release: 0.12, gain: 0.55 });
      else if (p === 1) mono(d, e, t, dur, { waves: ['triangle'], cutoff: 900, env: 2, envDecay: 0.2, attack: 0.006, release: 0.1, gain: 0.6, sub: 0.4 });
      else mono(d, e, t, dur, { waves: ['sawtooth'], cutoff: 380, attack: 0.02, release: 0.15, gain: 0.45, sub: 0.8 });
      break;
    case 'bass':
      if (p === 1) mono(d, e, t, dur, { waves: ['sawtooth', 'sawtooth'], detunes: [-14, 14], cutoff: 500, q: 2, attack: 0.01, release: 0.08, gain: 0.4, sub: 0.8 });
      else bass808(d, e, t, dur, p === 2);
      break;
  }
}

export function playChord(d: Dest, e: NoteEvent, t: number, dur: number, station: StationId, patch: number, kind: 'pad' | 'keys' | 'stab'): void {
  const notes = e.notes ?? [e.note];
  const v = e.vel;
  const p = patch % 3;
  if (kind === 'pad') {
    const attack = Math.min(dur * 0.5, station === 'haze' ? 0.9 : station === 'bass' ? 0.5 : 0.35);
    if (station === 'sunset') {
      if (p === 0) poly(d, notes, t, dur, v, { waves: ['sawtooth', 'sawtooth', 'sawtooth'], detunes: [-11, 0, 11], cutoff: 2200, q: 0.6, attack, release: 0.9, gain: 0.22, send: 0.35 });
      else if (p === 1) poly(d, notes, t, dur, v, { waves: ['sawtooth', 'triangle'], detunes: [-6, 6], cutoff: 1400, attack, release: 1, gain: 0.26, send: 0.4 });
      else poly(d, notes, t, dur, v, { waves: ['square', 'sine'], detunes: [-5, 5], cutoff: 2800, attack: attack * 1.5, release: 1.2, gain: 0.2, send: 0.45, octaveUp: true });
    } else if (station === 'haze') {
      poly(d, notes, t, dur, v, { waves: ['triangle', 'sine'], detunes: [-4, 4], cutoff: 1300, attack, release: 1.4, gain: 0.26, send: 0.5 });
    } else if (station === 'calle') {
      poly(d, notes, t, dur, v, { waves: ['sawtooth', 'sawtooth'], detunes: [-8, 8], cutoff: 1700, attack, release: 0.7, gain: 0.18, send: 0.35 });
    } else {
      poly(d, notes, t, dur, v, { waves: ['sawtooth', 'sawtooth'], detunes: [-16, 16], cutoff: 950, q: 1.2, attack, release: 1, gain: 0.22, send: 0.45 });
    }
    return;
  }
  if (kind === 'stab') {
    if (station === 'calle') {
      // Brass section: bright saw stack with a fast filter swell.
      poly(d, notes, t, dur, v, { waves: ['sawtooth', 'sawtooth'], detunes: [-5, 5], cutoff: 1500, env: 2.4, q: 1.1, attack: 0.025, release: 0.12, gain: 0.32, send: 0.25 });
    } else {
      poly(d, notes, t, dur, v, { waves: ['sawtooth', 'square'], detunes: [-9, 9], cutoff: 1800, env: 2.6, q: 2, attack: 0.004, release: 0.1, gain: 0.26, send: 0.2 });
    }
    return;
  }
  // Keys.
  for (const n of notes) {
    const f = hz(n);
    if (station === 'haze') {
      // Electric piano: FM tine plus a soft bell partial.
      fm(d, { t, freq: f, ratio: 1, index: 1.6 - p * 0.3, indexEnd: 0.25, decay: Math.max(0.6, dur + 0.4), hold: dur * 0.4, gain: 0.16 * v / Math.sqrt(notes.length) * 2, send: 0.3 });
      tone(d, { t, freq: f * 4, decay: 0.12, gain: 0.02 * v });
    } else if (station === 'calle') {
      fm(d, { t, freq: f, ratio: 2, index: 0.8, indexEnd: 0.1, decay: Math.max(0.35, dur + 0.25), gain: 0.13 * v, send: 0.15 });
      tone(d, { t, freq: f, decay: Math.max(0.3, dur), gain: 0.06 * v, type: 'triangle' });
    } else {
      tone(d, { t, freq: f, decay: Math.max(0.2, dur + 0.15), gain: 0.12 * v, type: p === 1 ? 'square' : 'sawtooth', filter: { type: 'lowpass', freq: 3200, to: 700, sweep: 0.2, q: 1.5 }, send: 0.2 });
    }
  }
}

export function playArp(d: Dest, e: NoteEvent, t: number, dur: number, station: StationId, patch: number): void {
  const f = hz(e.note);
  const v = e.vel;
  const p = patch % 3;
  if (station === 'calle') {
    // Marimba.
    tone(d, { t, freq: f, decay: 0.32, gain: 0.22 * v, send: 0.15 });
    tone(d, { t, freq: f * 4, decay: 0.05, gain: 0.05 * v });
    return;
  }
  if (station === 'haze') {
    fm(d, { t, freq: f, ratio: 4, index: 0.6, indexEnd: 0.05, decay: 0.7, gain: 0.12 * v, send: 0.4 });
    return;
  }
  if (station === 'bass') {
    fm(d, { t, freq: f, ratio: 3.5, index: 1.4, indexEnd: 0.1, decay: 0.35, gain: 0.13 * v, send: 0.25 });
    return;
  }
  const wave: OscillatorType = p === 0 ? 'sawtooth' : p === 1 ? 'square' : 'triangle';
  tone(d, { t, freq: f, decay: Math.max(0.12, dur * 1.6), gain: 0.14 * v, type: wave, filter: { type: 'lowpass', freq: 4200, to: 900, sweep: 0.14, q: 2.5 }, send: 0.2 });
}

export function playLead(d: Dest, e: NoteEvent, t: number, dur: number, station: StationId, patch: number): void {
  const p = patch % 4;
  switch (station) {
    case 'sunset':
      if (p === 0) mono(d, e, t, dur, { waves: ['sawtooth', 'sawtooth'], detunes: [-8, 8], cutoff: 2800, q: 1, attack: 0.012, release: 0.18, gain: 0.32, glide: 0.06, vibrato: 14, send: 0.35 });
      else if (p === 1) mono(d, e, t, dur, { waves: ['square'], cutoff: 2200, q: 1, attack: 0.01, release: 0.2, gain: 0.3, glide: 0.05, vibrato: 12, send: 0.35 });
      else if (p === 2) mono(d, e, t, dur, { waves: ['sawtooth'], cutoff: 1500, env: 2, envDecay: 0.15, q: 3.5, attack: 0.03, release: 0.2, gain: 0.34, glide: 0.07, vibrato: 18, send: 0.3 });
      else fm(d, { t, freq: hz(e.note), ratio: 2, index: 2.2, indexEnd: 0.6, decay: Math.max(0.3, dur + 0.2), hold: dur * 0.5, gain: 0.16 * e.vel, send: 0.35 });
      break;
    case 'calle':
      if (p === 0 || p === 3) {
        tone(d, { t, freq: hz(e.note), decay: Math.max(0.35, dur), gain: 0.24 * e.vel, send: 0.2 });
        tone(d, { t, freq: hz(e.note) * 4, decay: 0.06, gain: 0.06 * e.vel });
      } else if (p === 1) {
        mono(d, e, t, dur, { waves: ['sawtooth', 'sawtooth'], detunes: [-5, 5], cutoff: 1600, env: 2.2, envDecay: 0.12, q: 1, attack: 0.03, release: 0.12, gain: 0.3, vibrato: 10, send: 0.25 });
      } else {
        mono(d, e, t, dur, { waves: ['sine', 'triangle'], cutoff: 3000, attack: 0.04, release: 0.15, gain: 0.3, glide: 0.04, vibrato: 16, send: 0.3 });
        noise(d, { t, attack: 0.03, decay: Math.max(0.1, dur * 0.6), gain: 0.02 * e.vel, filter: { type: 'bandpass', freq: hz(e.note) * 2, q: 3 } });
      }
      break;
    case 'haze':
      if (p === 2) fm(d, { t, freq: hz(e.note), ratio: 4, index: 0.8, indexEnd: 0.05, decay: Math.max(0.8, dur + 0.5), gain: 0.18 * e.vel, send: 0.45 });
      else {
        mono(d, e, t, dur, { waves: p === 3 ? ['square'] : ['sine', 'triangle'], cutoff: p === 3 ? 1400 : 2600, attack: 0.06, release: 0.3, gain: 0.26, glide: 0.08, vibrato: 10, send: 0.45 });
        if (p === 0) noise(d, { t, attack: 0.05, decay: Math.max(0.12, dur * 0.7), gain: 0.015 * e.vel, filter: { type: 'bandpass', freq: hz(e.note) * 2, q: 4 } });
      }
      break;
    case 'bass':
      if (p === 0 || p === 2) fm(d, { t, freq: hz(e.note), ratio: 3.5, index: 2.4, indexEnd: 0.15, decay: Math.max(0.5, dur + 0.4), gain: 0.15 * e.vel, send: 0.35 });
      else mono(d, e, t, dur, { waves: ['sawtooth', 'square'], detunes: [-6, 6], cutoff: 2400, env: 2, envDecay: 0.1, q: 2, attack: 0.005, release: 0.12, gain: 0.26, send: 0.3 });
      break;
  }
}

export function playFx(d: Dest, kind: 'riser' | 'impact', note: number, t: number, dur: number, vel: number): void {
  if (kind === 'riser') {
    noise(d, { t, attack: dur * 0.9, decay: 0.08, gain: 0.18 * vel, filter: { type: 'bandpass', freq: 300, to: 7000, sweep: dur, q: 1.6 }, send: 0.4 });
    tone(d, { t, freq: hz(note), to: hz(note + 24), glide: dur, attack: dur * 0.8, decay: 0.1, gain: 0.04 * vel, type: 'sawtooth', filter: { type: 'lowpass', freq: 600, to: 6000, sweep: dur } });
  } else {
    tone(d, { t, freq: Math.max(35, hz(fin(note, 36))), to: 30, glide: 0.6, decay: 0.9, gain: 0.5 * vel, send: 0.6 });
    noise(d, { t, color: 'brown', decay: 0.7, gain: 0.25 * vel, filter: { type: 'lowpass', freq: 400 }, send: 0.6 });
  }
}
