import type { LoopSound } from '../api';
import { periodicWave, softClipCurve, type SharedBuffers } from '../engine/buffers';
import { clamp01f, clampf, fin, glide } from '../util/params';

/**
 * Sustained sounds. A builder returns a `LoopVoice` whose `output` the engine routes (optionally
 * through a panner). `set(level, param)` is smoothed; `param` meaning is per loop (documented on
 * each builder). Sources start immediately and run until `stop`.
 */

export interface LoopVoice {
  readonly output: GainNode;
  set(level: number, param: number, t: number): void;
  /** Pitch offset in cents (Doppler). */
  setDetune(cents: number, t: number): void;
  stop(t: number): void;
}

type Builder = (ctx: BaseAudioContext, buf: SharedBuffers) => LoopVoice;

class Parts {
  readonly sources: AudioScheduledSourceNode[] = [];
  readonly all: AudioNode[] = [];
  readonly detunable: AudioParam[] = [];

  constructor(readonly ctx: BaseAudioContext, readonly buf: SharedBuffers) {}

  gain(v = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.all.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.all.push(f);
    return f;
  }

  noise(color: 'white' | 'pink' | 'brown' | 'crackle', rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[color];
    s.loop = true;
    s.playbackRate.value = rate;
    this.sources.push(s);
    this.all.push(s);
    this.detunable.push(s.detune);
    return s;
  }

  osc(type: OscillatorType | PeriodicWave, freq: number, detunable = true): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type as OscillatorType;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    this.sources.push(o);
    this.all.push(o);
    if (detunable) this.detunable.push(o.detune);
    return o;
  }

  /** LFO → gain(depth) → target param. */
  lfo(target: AudioParam, rate: number, depth: number, type: OscillatorType | PeriodicWave = 'sine'): { osc: OscillatorNode; depth: GainNode } {
    const o = this.osc(type, rate, false);
    const g = this.gain(depth);
    o.connect(g).connect(target);
    return { osc: o, depth: g };
  }

  start(t: number): void {
    for (const s of this.sources) {
      if (s instanceof AudioBufferSourceNode && s.buffer) s.start(t, (t * 3.7) % Math.max(0.1, s.buffer.duration - 0.2));
      else s.start(t);
    }
  }

  voice(output: GainNode, set: (level: number, param: number, t: number) => void, t: number): LoopVoice {
    this.start(t);
    return {
      output,
      set: (level, param, at) => set(clamp01f(level), clamp01f(param), at),
      setDetune: (cents, at) => {
        const c = clampf(cents, -1200, 1200, 0);
        for (const p of this.detunable) glide(p, c, at, 0.06);
      },
      stop: (at) => {
        for (const s of this.sources) {
          try {
            s.stop(at);
          } catch {
            // Already stopped.
          }
        }
        const last = this.sources[0];
        if (last) {
          last.onended = () => {
            for (const n of this.all) {
              try {
                n.disconnect();
              } catch {
                // Already disconnected.
              }
            }
          };
        }
      },
    };
  }
}

const TAU = 0.08;

const skid: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const bp = p.filter('bandpass', 1300, 5);
  p.noise('white').connect(bp).connect(p.gain(0.5)).connect(out);
  const toneGain = p.gain(0.05);
  const o1 = p.osc('triangle', 980);
  const o2 = p.osc('triangle', 1470);
  p.lfo(o1.detune, 6.3, 28);
  p.lfo(o2.detune, 7.1, 34);
  o1.connect(toneGain);
  o2.connect(toneGain);
  toneGain.connect(out);
  return p.voice(out, (level, slip, t) => {
    glide(out.gain, level * 0.5, t, TAU);
    glide(bp.frequency, 1050 + slip * 700, t, TAU);
    glide(o1.frequency, 900 + slip * 260, t, TAU);
    glide(o2.frequency, 1360 + slip * 380, t, TAU);
    glide(toneGain.gain, 0.03 + slip * 0.05, t, TAU);
  }, ctx.currentTime);
};

const rain: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const hp = p.filter('highpass', 900, 0.5);
  const bed = p.gain(0.3);
  p.noise('pink').connect(hp).connect(bed).connect(out);
  const drops = p.gain(0.5);
  const dropBp = p.filter('bandpass', 3200, 0.9);
  p.noise('crackle', 1.7).connect(dropBp).connect(drops).connect(out);
  return p.voice(out, (level, intensity, t) => {
    glide(out.gain, level * 0.35, t, 0.2);
    glide(bed.gain, 0.15 + intensity * 0.35, t, 0.3);
    glide(drops.gain, 0.6 - intensity * 0.25, t, 0.3);
    glide(hp.frequency, 1200 - intensity * 500, t, 0.3);
  }, ctx.currentTime);
};

const wind: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const bp = p.filter('bandpass', 500, 0.7);
  p.noise('pink').connect(bp).connect(out);
  p.lfo(bp.frequency, 0.17, 180);
  const gust = p.gain(1);
  p.lfo(gust.gain, 0.11, 0.35);
  bp.disconnect();
  bp.connect(gust).connect(out);
  return p.voice(out, (level, speed, t) => {
    glide(out.gain, level * 0.4, t, 0.25);
    glide(bp.frequency, 380 + speed * 1300, t, 0.25);
    glide(bp.Q, 0.6 + speed * 0.8, t, 0.25);
  }, ctx.currentTime);
};

const siren: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const o1 = p.osc('square', 1000);
  const o2 = p.osc('sawtooth', 1003);
  const sweep = p.lfo(o1.frequency, 0.42, 380, 'triangle');
  sweep.depth.connect(o2.frequency);
  const bp = p.filter('bandpass', 1150, 0.8);
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(2);
  p.all.push(shaper);
  const mix = p.gain(0.4);
  o1.connect(mix);
  o2.connect(p.gain(0.5)).connect(mix);
  mix.connect(bp).connect(shaper).connect(out);
  return p.voice(out, (level, mode, t) => {
    glide(out.gain, level * 0.18, t, TAU);
    // mode < 0.5 wail, ≥ 0.5 yelp
    glide(sweep.osc.frequency, mode < 0.5 ? 0.42 : 3.3, t, 0.05);
    glide(sweep.depth.gain, mode < 0.5 ? 400 : 330, t, 0.05);
  }, ctx.currentTime);
};

const helicopter: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const lp = p.filter('lowpass', 700, 0.7);
  const chop = p.gain(0.5);
  p.noise('brown').connect(lp).connect(chop).connect(out);
  const blade = periodicWave(ctx, 'heli-blade', [0, 1, 0.6, 0.35, 0.2, 0.12, 0.08]);
  p.lfo(chop.gain, 17.5, 0.48, blade);
  const thud = p.osc('sine', 35);
  const thudGain = p.gain(0.4);
  p.lfo(thudGain.gain, 17.5, 0.4, blade);
  thud.connect(thudGain).connect(out);
  const whine = p.osc('sine', 2650);
  const whineGain = p.gain(0.012);
  whine.connect(whineGain).connect(out);
  return p.voice(out, (level, close, t) => {
    glide(out.gain, level * 0.45, t, 0.15);
    glide(lp.frequency, 500 + close * 1600, t, 0.2);
    glide(whineGain.gain, 0.004 + close * 0.02, t, 0.2);
  }, ctx.currentTime);
};

const sprinkler: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const hp = p.filter('highpass', 3200, 0.7);
  const ticks = p.gain(0);
  p.noise('white').connect(hp).connect(ticks).connect(out);
  const pulse = periodicWave(ctx, 'pulse-narrow', [0, 1, 0.95, 0.9, 0.83, 0.75, 0.66, 0.57, 0.48, 0.4, 0.32, 0.25, 0.19]);
  const tickLfo = p.lfo(ticks.gain, 7, 0.4, pulse);
  const spray = p.gain(0.05);
  p.noise('pink').connect(p.filter('highpass', 4500)).connect(spray).connect(out);
  return p.voice(out, (level, rate, t) => {
    glide(out.gain, level * 0.35, t, 0.1);
    glide(tickLfo.osc.frequency, 5 + rate * 5, t, 0.1);
  }, ctx.currentTime);
};

const growHum: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const hum = p.osc(periodicWave(ctx, 'ballast', [0, 1, 0.55, 0.42, 0.12, 0.2, 0.05, 0.1]), 60);
  const humGain = p.gain(0.25);
  hum.connect(p.filter('lowpass', 900)).connect(humGain).connect(out);
  const fan = p.gain(0.12);
  p.noise('pink').connect(p.filter('lowpass', 1100)).connect(fan).connect(out);
  return p.voice(out, (level, blaze, t) => {
    glide(out.gain, level * 0.22, t, 0.2);
    glide(humGain.gain, 0.15 + blaze * 0.25, t, 0.2);
  }, ctx.currentTime);
};

const boatWake: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const lp = p.filter('lowpass', 900, 0.6);
  const rush = p.gain(1);
  p.noise('pink').connect(lp).connect(rush).connect(out);
  p.lfo(rush.gain, 1.3, 0.3);
  return p.voice(out, (level, speed, t) => {
    glide(out.gain, level * 0.42, t, 0.15);
    glide(lp.frequency, 600 + speed * 2600, t, 0.15);
  }, ctx.currentTime);
};

const airboatFan: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const saw = p.osc('sawtooth', 45);
  const lp = p.filter('lowpass', 420, 1.2);
  saw.connect(lp).connect(p.gain(0.5)).connect(out);
  const air = p.gain(0.4);
  const bp = p.filter('bandpass', 320, 0.8);
  p.noise('pink').connect(bp).connect(air).connect(out);
  const am = p.lfo(air.gain, 45, 0.3);
  return p.voice(out, (level, rpm, t) => {
    const rate = 30 + rpm * 70;
    glide(out.gain, level * 0.4, t, 0.1);
    glide(saw.frequency, rate, t, 0.1);
    glide(am.osc.frequency, rate, t, 0.1);
    glide(lp.frequency, 300 + rpm * 700, t, 0.1);
  }, ctx.currentTime);
};

const crowd: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const rates = [3.1, 4.3, 5.2, 6.7];
  const centres = [420, 820, 1500, 2400];
  const streams: GainNode[] = [];
  for (let i = 0; i < 4; i++) {
    const g = p.gain(0.5);
    p.noise('pink', 0.9 + i * 0.07).connect(p.filter('bandpass', centres[i]!, 2.2)).connect(g).connect(out);
    p.lfo(g.gain, rates[i]!, 0.45);
    streams.push(g);
  }
  return p.voice(out, (level, excite, t) => {
    glide(out.gain, level * 0.32, t, 0.3);
    glide(streams[3]!.gain, 0.3 + excite * 0.5, t, 0.3);
  }, ctx.currentTime);
};

const neonHum: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  p.osc('sawtooth', 120).connect(p.filter('bandpass', 520, 3)).connect(p.gain(0.3)).connect(out);
  const crackle = p.gain(0);
  p.noise('crackle', 2.2).connect(p.filter('highpass', 3500)).connect(crackle).connect(out);
  return p.voice(out, (level, flicker, t) => {
    glide(out.gain, level * 0.14, t, 0.1);
    glide(crackle.gain, flicker * 0.9, t, 0.1);
  }, ctx.currentTime);
};

const alarm: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const o = p.osc('square', 800);
  const two = p.lfo(o.frequency, 1.2, 110, 'square');
  o.connect(p.filter('lowpass', 2600)).connect(p.gain(0.4)).connect(out);
  return p.voice(out, (level, urgency, t) => {
    glide(out.gain, level * 0.14, t, 0.05);
    glide(two.osc.frequency, 1 + urgency * 3, t, 0.05);
  }, ctx.currentTime);
};

const searchTension: Builder = (ctx, buf) => {
  const p = new Parts(ctx, buf);
  const out = p.gain(0);
  const lp = p.filter('lowpass', 380, 2);
  const a = p.osc('sawtooth', 55);
  const b = p.osc('sawtooth', 58.27);
  a.connect(lp);
  b.connect(lp);
  const pulse = p.gain(0.6);
  lp.connect(pulse).connect(out);
  const throb = p.lfo(pulse.gain, 2, 0.35);
  const shimmer = p.osc('sine', 1760);
  const sh = p.gain(0.01);
  p.lfo(sh.gain, 5.5, 0.008);
  shimmer.connect(sh).connect(out);
  return p.voice(out, (level, intensity, t) => {
    glide(out.gain, level * 0.17, t, 0.4);
    glide(lp.frequency, 260 + intensity * 900, t, 0.4);
    glide(throb.osc.frequency, 1.5 + intensity * 2.5, t, 0.4);
  }, ctx.currentTime);
};

export const LOOP_BUILDERS: Readonly<Record<LoopSound, Builder>> = {
  skid, rain, wind, siren, helicopter, sprinkler, growHum, boatWake, airboatFan, crowd, neonHum, alarm, searchTension,
};

export const LOOP_IDS = Object.keys(LOOP_BUILDERS) as LoopSound[];

/** Loudness calibration per loop (dB), from the offline QA report. */
export const LOOP_TRIM_DB: Readonly<Partial<Record<LoopSound, number>>> = {
  skid: 4, rain: 2, wind: -2, siren: -2, helicopter: 1, sprinkler: -3, boatWake: -4, airboatFan: -2, neonHum: 6, alarm: 1, searchTension: -2,
};

/** Default panner size per loop (metres). */
export const LOOP_REF: Readonly<Record<LoopSound, number>> = {
  skid: 8, rain: 6, wind: 10, siren: 45, helicopter: 90, sprinkler: 4, growHum: 3, boatWake: 10, airboatFan: 25,
  crowd: 15, neonHum: 2, alarm: 25, searchTension: 10,
};

export function finiteOr(v: number, f: number): number {
  return fin(v, f);
}
