import type { StationId } from '../api';
import { buffers } from '../engine/buffers';
import { makeDest, type Dest } from '../synth/kit';
import { clampf, dbToGain, glide } from '../util/params';
import { barEvents, pumped } from './composer';
import { playDrum, type KitFlavor } from './drums';
import { playArp, playBass, playChord, playFx, playLead } from './instruments';
import { STYLES } from './styles';
import { beatSec, type InstId, type Layer, type NoteEvent, type Track } from './types';

/**
 * Plays a `Track` on its own session graph: channel strips with pan and sends, a tempo-synced
 * delay, sidechain pumping from the kick, optional vinyl crackle, and per-layer gains the score
 * uses for intensity. Scheduling is lookahead-based: call `scheduleUntil` often.
 */

export const LAYER_OF: Readonly<Record<InstId, Layer>> = {
  kick: 'drums', snare: 'drums', clap: 'drums', hatC: 'drums', hatO: 'drums', rim: 'drums', tom: 'drums', crash: 'drums', ride: 'drums',
  conga: 'perc', bongo: 'perc', timbale: 'perc', cowbell: 'perc', clave: 'perc', shaker: 'perc', guiro: 'perc',
  bass: 'bass', pad: 'pad', keys: 'comp', stab: 'comp', arp: 'arp', lead: 'lead', riser: 'fx', impact: 'fx',
};

interface StripSpec {
  g: number;
  pan?: number;
  dly?: number;
}

const BASE_MIX: Readonly<Record<InstId, StripSpec>> = {
  kick: { g: 0.95 }, snare: { g: 0.6 }, clap: { g: 0.5 }, hatC: { g: 0.26, pan: 0.22 }, hatO: { g: 0.22, pan: 0.22 },
  rim: { g: 0.4, pan: -0.1 }, tom: { g: 0.5, pan: -0.15 }, crash: { g: 0.3, pan: -0.2 }, ride: { g: 0.22, pan: 0.3 },
  conga: { g: 0.45, pan: -0.35 }, bongo: { g: 0.35, pan: 0.35 }, timbale: { g: 0.35, pan: 0.4 }, cowbell: { g: 0.2, pan: -0.25 },
  clave: { g: 0.28, pan: 0.3 }, shaker: { g: 0.2, pan: -0.3 }, guiro: { g: 0.22, pan: 0.35 },
  bass: { g: 0.62 }, pad: { g: 0.36 }, keys: { g: 0.4, pan: -0.12, dly: 0.08 }, stab: { g: 0.36, pan: 0.1 },
  arp: { g: 0.3, pan: 0.18, dly: 0.32 }, lead: { g: 0.38, pan: 0.04, dly: 0.16 }, riser: { g: 0.3 }, impact: { g: 0.5 },
};

const FLAVOR: Readonly<Record<StationId, KitFlavor>> = { sunset: 'synth', calle: 'latin', haze: 'lofi', bass: 'trap' };

const LAYERS: readonly Layer[] = ['drums', 'perc', 'bass', 'comp', 'pad', 'arp', 'lead', 'fx'];

interface Strip {
  dest: Dest;
}

function hashUnit(a: number, b: number): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export interface PlayerOptions {
  station: StationId;
  output: AudioNode;
  hall: AudioNode;
  /** Wrap around at the end (score loops). */
  loop?: boolean;
  /** Return false to skip a layer's notes (score intensity). */
  allow?: (layer: Layer) => boolean;
}

export class TrackPlayer {
  readonly out: GainNode;
  private readonly mix: GainNode;
  private readonly hallIn: GainNode;
  private readonly delayIn: GainNode;
  private readonly delay: DelayNode;
  private readonly pump: GainNode;
  private readonly layerGain: Record<Layer, GainNode>;
  private readonly strips = new Map<InstId, Strip>();
  private readonly nodes: AudioNode[] = [];
  private vinyl: AudioBufferSourceNode | null = null;
  private track: Track | null = null;
  private t0 = 0;
  private nextBar = 0;
  private barLen = 2;
  private stopped = false;

  constructor(private readonly ctx: BaseAudioContext, private readonly opts: PlayerOptions) {
    const style = STYLES[opts.station];
    this.out = this.gain(dbToGain(style.trimDb));
    this.mix = this.gain(1);
    this.mix.connect(this.out).connect(opts.output);
    this.hallIn = this.gain(1);
    this.hallIn.connect(opts.hall);
    this.pump = this.gain(1);
    this.pump.connect(this.mix);
    this.delayIn = this.gain(1);
    this.delay = ctx.createDelay(2);
    const fb = this.gain(0.34);
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3400;
    const wet = this.gain(0.55);
    this.delayIn.connect(this.delay).connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(wet).connect(this.mix);
    this.nodes.push(this.delay, dlp);
    const lg = {} as Record<Layer, GainNode>;
    for (const l of LAYERS) lg[l] = this.gain(1);
    this.layerGain = lg;
  }

  get current(): Track | null {
    return this.track;
  }

  /** Context time at which the track (or the current loop pass) ends. */
  get endTime(): number {
    return this.track ? this.t0 + this.track.bars * this.barLen : 0;
  }

  /** Start `track` so that bar 0 falls at context time `t0` (may be in the past). */
  play(track: Track, t0: number): void {
    this.track = track;
    this.t0 = t0;
    this.barLen = 4 * beatSec(track.bpm);
    this.delay.delayTime.value = clampf(0.75 * beatSec(track.bpm), 0.05, 1.9, 0.4);
    const now = this.ctx.currentTime;
    this.nextBar = Math.max(0, Math.floor((now - t0) / this.barLen));
    if (STYLES[this.opts.station].vinyl && !this.vinyl) this.startVinyl(now);
  }

  setLayerLevel(layer: Layer, level: number, at: number, tau = 0.4): void {
    glide(this.layerGain[layer].gain, clampf(level, 0, 1.5, 1), at, tau);
  }

  /** Schedule every note starting before `until` (context seconds). */
  scheduleUntil(until: number): void {
    const track = this.track;
    if (!track || this.stopped) return;
    const now = this.ctx.currentTime;
    for (let guard = 0; guard < 64; guard++) {
      const bar = this.nextBar;
      if (!this.opts.loop && bar >= track.bars) return;
      const barStart = this.t0 + bar * this.barLen;
      if (barStart >= until) return;
      this.scheduleBar(track, bar, barStart, now);
      this.nextBar++;
    }
  }

  /** Fade out and release everything after `fade` seconds. */
  stop(at: number, fade = 0.35): void {
    if (this.stopped) return;
    this.stopped = true;
    glide(this.out.gain, 0, at, fade / 4);
    glide(this.hallIn.gain, 0, at, fade / 4);
    this.vinyl?.stop(at + fade + 0.1);
    const nodes = this.nodes;
    const release = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // Already disconnected.
        }
      }
    };
    const offline = typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext;
    if (offline || typeof setTimeout === 'undefined') return;
    setTimeout(release, (fade + 1.5) * 1000);
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  private scheduleBar(track: Track, bar: number, barStart: number, now: number): void {
    const evs = barEvents(track, this.opts.loop ? bar % track.bars : bar);
    const spb = beatSec(track.bpm);
    const pumpDepth = STYLES[this.opts.station].pump;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i]!;
      const layer = LAYER_OF[e.inst];
      if (this.opts.allow && !this.opts.allow(layer)) continue;
      let beat = e.beat;
      // Swing the off-beat sixteenths.
      const sixteenth = Math.round(beat * 4);
      if (Math.abs(beat * 4 - sixteenth) < 1e-3 && sixteenth % 2 === 1) beat += track.swing * 0.25;
      let t = barStart + beat * spb;
      if (layer === 'drums' || layer === 'perc') t += (hashUnit(bar, i) - 0.5) * 0.006;
      let dur = e.len * spb;
      if (t < now + 0.005) {
        // Joining mid-track: sustained notes resume, short ones are skipped.
        const remaining = t + dur - now;
        if (e.len < 1 || remaining < 0.25) continue;
        dur = remaining - 0.03;
        t = now + 0.03;
      }
      this.playEvent(e, t, dur, track);
      if (e.inst === 'kick' && pumpDepth > 0) {
        this.pump.gain.setValueAtTime(1 - pumpDepth * e.vel, t);
        this.pump.gain.setTargetAtTime(1, t + 0.015, 0.09);
      }
    }
  }

  private playEvent(e: NoteEvent, t: number, dur: number, track: Track): void {
    const station = this.opts.station;
    const d = this.strip(e.inst).dest;
    switch (e.inst) {
      case 'bass':
        playBass(d, e, t, dur, station, track.patch.bass);
        return;
      case 'pad':
        playChord(d, e, t, dur, station, track.patch.pad, 'pad');
        return;
      case 'keys':
        playChord(d, e, t, dur, station, track.patch.keys, 'keys');
        return;
      case 'stab':
        playChord(d, e, t, dur, station, track.patch.stab, 'stab');
        return;
      case 'arp':
        playArp(d, e, t, dur, station, track.patch.arp);
        return;
      case 'lead':
        playLead(d, e, t, dur, station, track.patch.lead);
        return;
      case 'riser':
      case 'impact':
        playFx(d, e.inst, e.note, t, dur, e.vel);
        return;
      default:
        playDrum(d, e.inst, t, e.vel, e.note, dur, FLAVOR[station]);
    }
  }

  private strip(inst: InstId): Strip {
    let s = this.strips.get(inst);
    if (s) return s;
    const spec = BASE_MIX[inst];
    const input = this.gain(spec.g);
    let tail: AudioNode = input;
    if (spec.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = spec.pan;
      tail.connect(p);
      tail = p;
      this.nodes.push(p);
    }
    tail.connect(this.layerGain[LAYER_OF[inst]]).connect(pumped(inst) ? this.pump : this.mix);
    if (spec.dly) {
      const send = this.gain(spec.dly);
      input.connect(send).connect(this.delayIn);
    }
    s = { dest: makeDest(this.ctx, input, this.hallIn) };
    this.strips.set(inst, s);
    return s;
  }

  private startVinyl(t: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buffers(this.ctx).crackle;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.5;
    const g = this.gain(0.09);
    src.connect(bp).connect(g).connect(this.mix);
    src.start(t);
    this.vinyl = src;
    this.nodes.push(src, bp);
  }

  private gain(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }
}
