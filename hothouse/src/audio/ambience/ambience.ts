import type { AmbienceContext } from '../api';
import { buffers, periodicWave, type SharedBuffers } from '../engine/buffers';
import { fm, makeDest, noise, tone, type Dest } from '../synth/kit';
import { clamp01f, clampf, fin, glide } from '../util/params';

/**
 * The world's background: continuous beds blended by district, time of day, weather, crowd and
 * traffic, plus scattered one-shot events (gulls, clanks, birds, frogs, thunder) placed around the
 * listener. Beds are built lazily and torn down after a long silence to save CPU.
 */

type BedId =
  | 'surf' | 'lap' | 'city' | 'traffic' | 'insects' | 'cicadas' | 'crickets' | 'wind' | 'rain' | 'rumble' | 'crowd' | 'room' | 'music';

type EventId =
  | 'gull' | 'crash' | 'clank' | 'horn' | 'bird' | 'dawnBird' | 'dog' | 'heron' | 'frog' | 'thunder' | 'siren' | 'chime' | 'buoy' | 'mower';

interface Profile {
  beds: Partial<Record<BedId, number>>;
  /** Events per minute at full strength. */
  events: Partial<Record<EventId, number>>;
}

const PROFILES: Record<string, Profile> = {
  flats: { beds: { traffic: 0.35, insects: 0.15 }, events: { bird: 9, dog: 0.8, chime: 1.2, mower: 0.5 } },
  strand: { beds: { surf: 0.9, crowd: 0.35, music: 0.25 }, events: { gull: 7, crash: 5 } },
  deco: { beds: { city: 0.35, traffic: 0.45, surf: 0.25, music: 0.2 }, events: { bird: 3, gull: 2, siren: 0.4 } },
  crown: { beds: { city: 0.75, traffic: 0.7 }, events: { siren: 1, horn: 0.2 } },
  harbor: { beds: { lap: 0.7, city: 0.35, traffic: 0.25 }, events: { clank: 8, horn: 0.8, gull: 5 } },
  sawgrass: { beds: { insects: 0.7, lap: 0.3 }, events: { heron: 2, frog: 10, bird: 4 } },
  isla: { beds: { surf: 0.5, lap: 0.35 }, events: { chime: 4, gull: 3, bird: 4 } },
  keys: { beds: { surf: 0.6, wind: 0.3, lap: 0.4 }, events: { gull: 6, buoy: 3, crash: 3 } },
  default: { beds: { traffic: 0.2 }, events: { bird: 3 } },
};

const BED_IDS: readonly BedId[] = ['surf', 'lap', 'city', 'traffic', 'insects', 'cicadas', 'crickets', 'wind', 'rain', 'rumble', 'crowd', 'room', 'music'];
const EVENT_IDS: readonly EventId[] = ['gull', 'crash', 'clank', 'horn', 'bird', 'dawnBird', 'dog', 'heron', 'frog', 'thunder', 'siren', 'chime', 'buoy', 'mower'];
const BED_SCALE: Record<BedId, number> = {
  surf: 0.36, lap: 0.35, city: 0.4, traffic: 0.32, insects: 0.11, cicadas: 0.07, crickets: 0.07, wind: 0.32,
  rain: 0.5, rumble: 0.4, crowd: 0.3, room: 0.22, music: 0.3,
};

const bump = (x: number, a: number, b: number, c: number, d: number): number =>
  x <= a || x >= d ? 0 : x < b ? (x - a) / (b - a) : x <= c ? 1 : (d - x) / (d - c);

interface Bed {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  silentFor: number;
  level: number;
}

export class Ambience {
  private ctx: BaseAudioContext | null = null;
  private out: AudioNode | null = null;
  private buf: SharedBuffers | null = null;
  private readonly target: Record<BedId, number>;
  private readonly rates: Record<EventId, number>;
  private readonly beds = new Map<BedId, Bed>();
  private readonly state: AmbienceContext = { district: null, hours: 18, rain: 0, storm: 0, wind: 0.3, indoor: 0, water: 0, crowd: 0, traffic: 0 };
  private seed = 1;
  private dirty = true;

  constructor() {
    this.target = Object.fromEntries(BED_IDS.map((b) => [b, 0])) as Record<BedId, number>;
    this.rates = Object.fromEntries(EVENT_IDS.map((e) => [e, 0])) as Record<EventId, number>;
  }

  attach(ctx: BaseAudioContext, out: AudioNode): void {
    this.ctx = ctx;
    this.out = out;
    this.buf = buffers(ctx);
    this.dirty = true;
  }

  set(c: AmbienceContext): void {
    const s = this.state;
    s.district = c.district;
    s.hours = ((fin(c.hours, 18) % 24) + 24) % 24;
    s.rain = clamp01f(c.rain);
    s.storm = clamp01f(c.storm);
    s.wind = clampf(c.wind, 0, 1.5, 0.3);
    s.indoor = clamp01f(c.indoor);
    s.water = clamp01f(c.water);
    s.crowd = clamp01f(c.crowd);
    s.traffic = clamp01f(c.traffic);
    this.dirty = true;
  }

  get indoor(): number {
    return this.state.indoor;
  }

  /** Per-frame: refresh targets, smooth bed levels, roll for events. */
  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    if (this.dirty) {
      this.computeTargets();
      this.dirty = false;
    }
    const t = ctx.currentTime;
    for (let i = 0; i < BED_IDS.length; i++) {
      const id = BED_IDS[i]!;
      const want = this.target[id] * BED_SCALE[id];
      let bed = this.beds.get(id);
      if (!bed) {
        if (want < 0.004) continue;
        bed = this.build(id);
        this.beds.set(id, bed);
      }
      if (Math.abs(bed.level - want) > 0.002) {
        bed.level = want;
        glide(bed.gain.gain, want, t, 1.2);
      }
      if (want < 0.004) {
        bed.silentFor += dt;
        if (bed.silentFor > 8) this.destroy(id, bed);
      } else {
        bed.silentFor = 0;
      }
    }
    const step = Math.min(0.25, Math.max(0, dt));
    for (let i = 0; i < EVENT_IDS.length; i++) {
      const id = EVENT_IDS[i]!;
      const perSec = this.rates[id] / 60;
      if (perSec <= 0) continue;
      if (this.rand() < perSec * step) this.event(id, t + 0.02 + this.rand() * 0.2);
    }
  }

  dispose(): void {
    for (const [id, bed] of this.beds) this.destroy(id, bed);
    this.ctx = null;
  }

  private computeTargets(): void {
    const s = this.state;
    const h = s.hours;
    const profile = PROFILES[s.district ?? 'default'] ?? PROFILES.default!;
    const day = bump(h, 5.5, 7.5, 18.5, 20.5);
    const night = 1 - day;
    const dawn = bump(h, 5.25, 6.25, 7.25, 8.5);
    const dusk = bump(h, 17.5, 19, 20, 21.5);
    const hot = bump(h, 11, 13, 15.5, 17.5);
    const wet = 1 - s.rain * 0.8;
    const outside = 1 - s.indoor;
    for (const id of BED_IDS) this.target[id] = 0;
    for (const [k, v] of Object.entries(profile.beds) as Array<[BedId, number]>) this.target[k] = v;
    this.target.surf *= 0.35 + s.water * 0.65 + s.storm * 0.4;
    this.target.lap *= 0.3 + s.water * 0.7;
    this.target.traffic = Math.max(this.target.traffic, s.traffic) * (0.55 + day * 0.45);
    this.target.city *= 0.7 + night * 0.3;
    this.target.insects *= wet * (0.5 + day * 0.5);
    this.target.cicadas = (dusk * 0.9 + hot * 0.5) * wet * (s.district === 'crown' ? 0.2 : 1);
    this.target.crickets = night * (1 - dawn) * wet * (s.district === 'crown' || s.district === 'harbor' ? 0.25 : 1);
    this.target.wind = Math.max(this.target.wind, s.wind * 0.7 + s.storm * 0.4);
    this.target.rain = s.rain;
    this.target.rumble = s.storm * 0.8;
    this.target.crowd = Math.max(this.target.crowd * (0.4 + dusk * 0.4 + night * 0.2), s.crowd);
    this.target.music *= night * 0.8 + dusk * 0.6;
    for (const id of BED_IDS) this.target[id] *= outside;
    this.target.room = s.indoor;

    for (const id of EVENT_IDS) this.rates[id] = 0;
    for (const [k, v] of Object.entries(profile.events) as Array<[EventId, number]>) this.rates[k] = v;
    const quiet = outside * (1 - s.storm * 0.6);
    this.rates.gull *= day * wet * quiet;
    this.rates.crash *= (0.5 + s.water * 0.5) * outside;
    this.rates.clank *= (0.4 + day * 0.6) * quiet;
    this.rates.horn *= quiet;
    this.rates.bird *= day * wet * quiet;
    this.rates.dawnBird = dawn * 30 * wet * quiet * (s.district === 'crown' ? 0.3 : 1);
    this.rates.dog *= quiet;
    this.rates.heron *= wet * quiet;
    this.rates.frog = (this.rates.frog + (s.district === 'flats' ? 3 : 0)) * night * quiet * (0.6 + s.rain * 0.8);
    this.rates.thunder = s.storm * 2.5;
    this.rates.siren *= (0.4 + night * 0.6) * quiet;
    this.rates.chime *= (0.5 + s.wind * 0.8) * quiet;
    this.rates.buoy *= quiet;
    this.rates.mower *= day * (1 - dawn) * wet * quiet;
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** A destination placed somewhere around the listener. */
  private around(near = 0.4): Dest {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rand() * 1.6 - 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.35 + (1 - near) * 0.1 + this.rand() * 0.4 * near;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2500 + this.rand() * 9000 * near;
    g.connect(lp).connect(pan).connect(this.out!);
    const nodes = [g, lp, pan];
    if (typeof setTimeout !== 'undefined') setTimeout(() => nodes.forEach((n) => n.disconnect()), 9000);
    return makeDest(ctx, g);
  }

  private event(id: EventId, t: number): void {
    const r = this.rand();
    switch (id) {
      case 'gull': {
        const d = this.around(0.5);
        const calls = 1 + Math.floor(r * 3);
        for (let i = 0; i < calls; i++) {
          tone(d, { t: t + i * 0.3, freq: 1450 + r * 300, to: 2250 + r * 200, glide: 0.08, decay: 0.24, gain: 0.05, type: 'sawtooth', filter: { type: 'bandpass', freq: 2100, q: 3 }, vibrato: 14, vibratoDepth: 35, vibratoDelay: 0 });
        }
        break;
      }
      case 'crash':
        noise(this.around(0.3), { t, color: 'pink', attack: 0.6 + r * 0.6, decay: 1.6 + r, gain: 0.12, filter: { type: 'lowpass', freq: 900, to: 2600, sweep: 0.9 } });
        break;
      case 'clank':
        fm(this.around(0.4), { t, freq: 300 + r * 500, ratio: 2.31 + r, index: 3, indexEnd: 0.3, decay: 0.6 + r * 0.6, gain: 0.04 });
        break;
      case 'horn': {
        const d = this.around(0.1);
        for (const f of [73.4, 92.5, 110]) tone(d, { t, freq: f, attack: 0.3, hold: 1.6, decay: 1.2, gain: 0.05, type: 'sawtooth', filter: { type: 'lowpass', freq: 380 } });
        break;
      }
      case 'bird':
      case 'dawnBird': {
        const d = this.around(0.6);
        const chirps = 2 + Math.floor(r * 4);
        const base = 2600 + r * 2200;
        for (let i = 0; i < chirps; i++) tone(d, { t: t + i * (0.07 + r * 0.05), freq: base * (1 + (i % 2) * 0.12), to: base * (1.3 - (i % 3) * 0.15), glide: 0.04, decay: 0.06, gain: id === 'dawnBird' ? 0.025 : 0.02 });
        break;
      }
      case 'dog': {
        const d = this.around(0.2);
        for (let i = 0; i < 2; i++) noise(d, { t: t + i * 0.32, attack: 0.01, decay: 0.12, gain: 0.08, filter: { type: 'bandpass', freq: 700 + r * 300, q: 3 } });
        break;
      }
      case 'heron':
        tone(this.around(0.3), { t, freq: 520, to: 380, glide: 0.25, decay: 0.32, gain: 0.04, type: 'sawtooth', filter: { type: 'bandpass', freq: 1100, q: 4 } });
        break;
      case 'frog': {
        const d = this.around(0.5);
        const f = 180 + r * 260;
        for (let i = 0; i < 2 + Math.floor(r * 3); i++) tone(d, { t: t + i * 0.16, freq: f, to: f * 0.85, glide: 0.08, decay: 0.09, gain: 0.05, type: 'square', filter: { type: 'lowpass', freq: 900 } });
        break;
      }
      case 'thunder': {
        const k = 0.3 + r * 0.7;
        const d = this.around(0.2);
        noise(d, { t: t + (1 - k) * 1.2, color: 'brown', attack: 0.2, decay: 2.5 + (1 - k) * 2, gain: 0.5 * k, filter: { type: 'lowpass', freq: 350 - (1 - k) * 150, to: 150, sweep: 3 } });
        break;
      }
      case 'siren':
        tone(this.around(0.05), { t, freq: 700, to: 1300, glide: 1.4, attack: 0.5, hold: 1.2, decay: 1, gain: 0.015, type: 'square', filter: { type: 'lowpass', freq: 1200 } });
        break;
      case 'chime': {
        const d = this.around(0.6);
        const notes = [72, 74, 76, 79, 81];
        for (let i = 0; i < 3; i++) {
          const m = notes[Math.floor(this.rand() * notes.length)]!;
          fm(d, { t: t + i * (0.15 + r * 0.2), freq: 440 * Math.pow(2, (m - 69) / 12), ratio: 3.01, index: 1.2, indexEnd: 0.05, decay: 1.6, gain: 0.025 });
        }
        break;
      }
      case 'buoy':
        fm(this.around(0.2), { t, freq: 310, ratio: 2.76, index: 2.2, indexEnd: 0.2, decay: 2.4, gain: 0.04 });
        break;
      case 'mower':
        tone(this.around(0.1), { t, freq: 92, attack: 1.5, hold: 3, decay: 2, gain: 0.03, type: 'sawtooth', filter: { type: 'lowpass', freq: 600 }, vibrato: 3, vibratoDepth: 40, vibratoDelay: 0 });
        break;
    }
  }

  private build(id: BedId): Bed {
    const ctx = this.ctx!;
    const b = this.buf!;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.out!);
    nodes.push(gain);
    const src = (buffer: AudioBuffer, rate = 1): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.playbackRate.value = rate;
      sources.push(s);
      nodes.push(s);
      return s;
    };
    const filt = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const x = ctx.createBiquadFilter();
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q;
      nodes.push(x);
      return x;
    };
    const g = (v: number): GainNode => {
      const x = ctx.createGain();
      x.gain.value = v;
      nodes.push(x);
      return x;
    };
    const lfo = (target: AudioParam, rate: number, depth: number, wave: OscillatorType | PeriodicWave = 'sine'): void => {
      const o = ctx.createOscillator();
      if (typeof wave === 'string') o.type = wave as OscillatorType;
      else o.setPeriodicWave(wave);
      o.frequency.value = rate;
      const dg = g(depth);
      o.connect(dg).connect(target);
      sources.push(o);
      nodes.push(o);
    };
    switch (id) {
      case 'surf': {
        const swell = g(0.6);
        src(b.pink, 0.8).connect(filt('lowpass', 700)).connect(swell).connect(gain);
        lfo(swell.gain, 0.13, 0.35);
        lfo(swell.gain, 0.071, 0.2);
        break;
      }
      case 'lap': {
        const am = g(0.6);
        src(b.brown, 1.3).connect(filt('bandpass', 520, 1.2)).connect(am).connect(gain);
        lfo(am.gain, 1.7, 0.35);
        lfo(am.gain, 0.6, 0.2);
        break;
      }
      case 'city': {
        src(b.brown, 0.7).connect(filt('lowpass', 260)).connect(g(0.8)).connect(gain);
        const hum = ctx.createOscillator();
        hum.frequency.value = 55;
        sources.push(hum);
        nodes.push(hum);
        hum.connect(g(0.05)).connect(gain);
        break;
      }
      case 'traffic': {
        const sw = g(0.6);
        src(b.pink, 0.9).connect(filt('lowpass', 750)).connect(sw).connect(gain);
        lfo(sw.gain, 0.09, 0.3);
        lfo(sw.gain, 0.23, 0.15);
        break;
      }
      case 'insects': {
        const am = g(0.5);
        src(b.white, 1).connect(filt('bandpass', 5600, 4)).connect(am).connect(gain);
        lfo(am.gain, 27, 0.4);
        break;
      }
      case 'cicadas': {
        const am = g(0.5);
        const swell = g(0.6);
        src(b.white, 1).connect(filt('bandpass', 4700, 6)).connect(am).connect(swell).connect(gain);
        lfo(am.gain, 42, 0.45);
        lfo(swell.gain, 0.21, 0.4);
        break;
      }
      case 'crickets': {
        const chirp = periodicWave(ctx, 'cricket-gate', [0, 1, 0, 0.33, 0, 0.2, 0, 0.14]);
        const o = ctx.createOscillator();
        o.frequency.value = 4400;
        sources.push(o);
        nodes.push(o);
        const am = g(0);
        const gate = g(0);
        o.connect(am).connect(gate).connect(gain);
        lfo(am.gain, 18, 0.5);
        lfo(gate.gain, 1.6, 0.6, chirp);
        break;
      }
      case 'wind': {
        const bp = filt('bandpass', 500, 0.6);
        const gust = g(0.6);
        src(b.pink, 1.05).connect(bp).connect(gust).connect(gain);
        lfo(bp.frequency, 0.13, 220);
        lfo(gust.gain, 0.08, 0.35);
        break;
      }
      case 'rain':
        src(b.pink, 1).connect(filt('highpass', 900, 0.5)).connect(g(0.7)).connect(gain);
        src(b.crackle, 1.9).connect(filt('bandpass', 3400, 0.8)).connect(g(0.5)).connect(gain);
        break;
      case 'rumble': {
        const sw = g(0.6);
        src(b.brown, 0.6).connect(filt('lowpass', 300)).connect(sw).connect(gain);
        lfo(sw.gain, 0.05, 0.35);
        break;
      }
      case 'crowd': {
        const centres = [430, 820, 1450, 2300];
        const rates = [3.3, 4.1, 5.3, 6.4];
        for (let i = 0; i < 4; i++) {
          const am = g(0.45);
          src(b.pink, 0.9 + i * 0.05).connect(filt('bandpass', centres[i]!, 2.2)).connect(am).connect(gain);
          lfo(am.gain, rates[i]!, 0.4);
        }
        break;
      }
      case 'room': {
        src(b.brown, 0.5).connect(filt('lowpass', 200)).connect(g(0.7)).connect(gain);
        const ac = ctx.createOscillator();
        ac.frequency.value = 120;
        sources.push(ac);
        nodes.push(ac);
        ac.connect(g(0.03)).connect(gain);
        break;
      }
      case 'music': {
        // A party down the boardwalk: a muffled kick and bass pulse at 122 BPM.
        const kick = ctx.createOscillator();
        kick.frequency.value = 52;
        sources.push(kick);
        nodes.push(kick);
        const pulse = g(0);
        kick.connect(pulse).connect(filt('lowpass', 180)).connect(gain);
        lfo(pulse.gain, 122 / 60, 0.8, periodicWave(ctx, 'kick-pulse', [0, 1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12]));
        const bass = ctx.createOscillator();
        bass.type = 'triangle';
        bass.frequency.value = 110;
        sources.push(bass);
        nodes.push(bass);
        const bg = g(0);
        bass.connect(bg).connect(filt('lowpass', 320)).connect(gain);
        lfo(bg.gain, 122 / 30, 0.25, 'square');
        break;
      }
    }
    const t = ctx.currentTime;
    for (const s of sources) {
      if (s instanceof AudioBufferSourceNode && s.buffer) s.start(t, this.rand() * (s.buffer.duration - 0.2));
      else s.start(t);
    }
    return { gain, sources, nodes, silentFor: 0, level: 0 };
  }

  private destroy(id: BedId, bed: Bed): void {
    const t = this.ctx?.currentTime ?? 0;
    for (const s of bed.sources) {
      try {
        s.stop(t + 0.05);
      } catch {
        // Already stopped.
      }
    }
    const nodes = bed.nodes;
    const first = bed.sources[0];
    if (first) first.onended = () => nodes.forEach((n) => n.disconnect());
    this.beds.delete(id);
  }
}
