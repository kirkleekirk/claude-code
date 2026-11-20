import type { StationId, VoiceProfile } from '../api';
import { stepCurve } from '../engine/buffers';
import { playBlip } from '../synth/blip';
import { chord, fm, makeDest, noise, tone, type Dest } from '../synth/kit';
import { midiToHz } from './theory';
import type { Segment } from './station';

/**
 * Non-music radio segments: station idents, ad breaks and news flashes. Each gets a short jingle
 * and announcer babble through a band-limited "radio voice" EQ; the words themselves appear on
 * screen as the caption.
 */

const n = midiToHz;

export const DJ_VOICE: Readonly<Record<StationId, VoiceProfile>> = {
  sunset: { pitch: 118, brightness: 0.45, expressiveness: 0.45 },
  calle: { pitch: 205, brightness: 0.7, expressiveness: 0.85 },
  haze: { pitch: 158, brightness: 0.3, expressiveness: 0.25 },
  bass: { pitch: 96, brightness: 0.75, expressiveness: 0.95 },
};

const ANNOUNCER: VoiceProfile = { pitch: 138, brightness: 0.62, expressiveness: 0.7 };

function hashUnit(i: number): number {
  let h = Math.imul(i ^ 0x7f4a7c15, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** One spot in flight: owns its voice EQ chain and schedules babble ahead in time. */
export class SpotPlayer {
  private readonly out: GainNode;
  private readonly voiceIn: GainNode;
  private readonly nodes: AudioNode[] = [];
  private babbleAt: number;
  private babbleEnd: number;
  private syllable = 0;
  private stopped = false;
  private readonly voice: VoiceProfile;

  constructor(private readonly ctx: BaseAudioContext, output: AudioNode, hall: AudioNode, readonly seg: Segment, station: StationId, t0: number) {
    this.out = ctx.createGain();
    this.out.gain.value = seg.kind === 'ad' ? 0.76 : seg.kind === 'ident' ? 0.76 : 0.8;
    this.out.connect(output);
    // Radio voice: band-limited, lightly crushed, compressed.
    this.voiceIn = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    const crush = ctx.createWaveShaper();
    crush.curve = stepCurve(48);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 4;
    const vg = ctx.createGain();
    vg.gain.value = 1.4;
    this.voiceIn.connect(hp).connect(lp).connect(crush).connect(comp).connect(vg).connect(this.out);
    this.nodes.push(this.out, this.voiceIn, hp, lp, crush, comp, vg);
    this.voice = seg.kind === 'ad' ? ANNOUNCER : DJ_VOICE[station];
    const d = makeDest(ctx, this.out, hall);
    const jingleEnd = this.jingle(d, seg, station, Math.max(t0, ctx.currentTime + 0.02));
    this.babbleAt = Math.max(jingleEnd - 0.6, t0 + 0.4);
    this.babbleEnd = t0 + seg.dur - (seg.kind === 'ad' ? 2.4 : 0.6);
    if (seg.kind === 'ad') this.outro(d, seg, t0 + seg.dur - 2.2);
  }

  scheduleUntil(until: number): void {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    while (this.babbleAt < until && this.babbleAt < this.babbleEnd) {
      const i = this.syllable++;
      const at = Math.max(this.babbleAt, now + 0.01);
      const emphasis = hashUnit(i * 7 + this.seg.n) > 0.8 ? 0.8 : 0.2;
      const len = playBlip(this.ctx, this.voiceIn, this.voice, emphasis, at) - at;
      const wordBreak = hashUnit(i * 13 + 1) < 0.22;
      this.babbleAt = at + len + (wordBreak ? 0.12 + hashUnit(i) * 0.18 : 0.012);
    }
  }

  stop(at: number, fade = 0.15): void {
    if (this.stopped) return;
    this.stopped = true;
    this.out.gain.setTargetAtTime(0, at, Math.max(0.01, fade / 4));
    const nodes = this.nodes;
    if (typeof setTimeout !== 'undefined') setTimeout(() => nodes.forEach((x) => x.disconnect()), 2500);
  }

  private jingle(d: Dest, seg: Segment, station: StationId, t: number): number {
    if (seg.kind === 'news') {
      // Urgent newsroom sting: staccato fifths over a ticking hat.
      for (let i = 0; i < 6; i++) tone(d, { t: t + i * 0.16, freq: n(i % 2 ? 72 : 67), decay: 0.12, gain: 0.12, type: 'square', filter: { type: 'lowpass', freq: 2400 } });
      for (let i = 0; i < 12; i++) noise(d, { t: t + i * 0.08, decay: 0.02, gain: 0.05, filter: { type: 'highpass', freq: 7000 } });
      return t + 1.1;
    }
    if (seg.kind === 'ident') return this.ident(d, station, t);
    if (seg.kind !== 'ad') return t;
    switch (seg.ad.jingle) {
      case 'bright':
        chord(d, t, [n(72), n(76), n(79), n(84)], 0.09, { decay: 0.35, gain: 0.12, send: 0.2 });
        chord(d, t + 0.45, [n(79), n(84), n(88)], 0, { decay: 0.6, gain: 0.08, type: 'triangle', send: 0.25 });
        return t + 1.1;
      case 'smooth':
        for (const [i, m] of [62, 69, 72, 76].entries()) fm(d, { t: t + i * 0.05, freq: n(m), ratio: 1, index: 1.4, indexEnd: 0.2, decay: 1.4, gain: 0.07, send: 0.35 });
        return t + 1.2;
      case 'urgent':
        for (let i = 0; i < 3; i++) chord(d, t + i * 0.18, [n(67), n(71), n(74)], 0, { decay: 0.12, gain: 0.07, type: 'sawtooth', filter: { type: 'lowpass', freq: 2600 } });
        chord(d, t + 0.6, [n(65), n(69), n(72), n(77)], 0, { decay: 0.7, gain: 0.06, type: 'sawtooth', filter: { type: 'lowpass', freq: 3000 }, send: 0.2 });
        return t + 1.2;
      case 'spooky':
        tone(d, { t, freq: n(76), to: n(71), glide: 1.1, attack: 0.15, decay: 1.2, gain: 0.08, vibrato: 6, vibratoDepth: 40, vibratoDelay: 0, send: 0.5 });
        chord(d, t, [n(52), n(55), n(59)], 0, { attack: 0.2, decay: 1.4, gain: 0.05, type: 'square', filter: { type: 'lowpass', freq: 900 }, send: 0.4 });
        return t + 1.3;
    }
  }

  private ident(d: Dest, station: StationId, t: number): number {
    switch (station) {
      case 'sunset':
        chord(d, t, [n(62), n(65), n(69), n(74)], 0.06, { attack: 0.02, decay: 1.2, gain: 0.08, type: 'sawtooth', filter: { type: 'lowpass', freq: 2600 }, send: 0.4 });
        tone(d, { t: t + 0.3, freq: n(81), decay: 0.9, gain: 0.08, type: 'square', vibrato: 6, vibratoDepth: 14, send: 0.4 });
        return t + 1.2;
      case 'calle':
        for (const [i, m] of [69, 72, 76, 81].entries()) tone(d, { t: t + i * 0.1, freq: n(m), decay: 0.3, gain: 0.12, send: 0.2 });
        chord(d, t + 0.45, [n(69), n(73), n(76)], 0, { decay: 0.25, gain: 0.08, type: 'sawtooth', filter: { type: 'lowpass', freq: 2200 } });
        return t + 0.9;
      case 'haze':
        for (const [i, m] of [64, 71, 74, 78].entries()) fm(d, { t: t + i * 0.18, freq: n(m), ratio: 4, index: 0.5, indexEnd: 0.05, decay: 1.2, gain: 0.07, send: 0.5 });
        return t + 1.3;
      case 'bass':
        tone(d, { t, freq: n(49) * 1.5, to: n(37), glide: 0.08, decay: 0.9, gain: 0.35 });
        fm(d, { t: t + 0.25, freq: n(73), ratio: 3.5, index: 2, indexEnd: 0.1, decay: 0.6, gain: 0.08, send: 0.3 });
        return t + 1.0;
    }
  }

  private outro(d: Dest, seg: Segment, t: number): void {
    if (seg.kind !== 'ad') return;
    const tagNotes = seg.ad.jingle === 'spooky' ? [64, 67, 63] : seg.ad.jingle === 'smooth' ? [69, 74, 76] : [72, 76, 79];
    for (const [i, m] of tagNotes.entries()) tone(d, { t: t + i * 0.14, freq: n(m), decay: 0.4, gain: 0.09, type: 'triangle', send: 0.25 });
  }
}
