import type { EngineFrame, EngineProfile, SurfaceKind } from '../api';
import { buffers, periodicWave, raspCurve, type SharedBuffers } from '../engine/buffers';
import { clamp01f, clampf, fin, glide } from '../util/params';
import { makeDest, noise, thump, tone } from './kit';

/**
 * RPM-driven engine synthesis. The firing frequency (rpm/60 × cylinders/2 for four-strokes) sets a
 * custom harmonic stack whose half-orders give V8 burble; rasp drives an asymmetric shaper; a
 * low-pass opens with rpm and throttle. The player's car adds intake noise, turbo whine and
 * blow-off, lift-off pops, tire squeal, road and wind noise. Traffic gets a three-node voice.
 */

export interface ListenerState {
  x: number;
  y: number;
  z: number;
}

interface RoadVoice {
  lp: number;
  gain: number;
  crunch: number;
}

const ROAD: Record<SurfaceKind, RoadVoice> = {
  asphalt: { lp: 420, gain: 1, crunch: 0 },
  concrete: { lp: 620, gain: 1.1, crunch: 0 },
  tile: { lp: 700, gain: 1.1, crunch: 0 },
  wood: { lp: 320, gain: 1.4, crunch: 0.2 },
  metal: { lp: 900, gain: 1.2, crunch: 0.1 },
  gravel: { lp: 1600, gain: 1.5, crunch: 1 },
  sand: { lp: 300, gain: 0.8, crunch: 0.4 },
  grass: { lp: 260, gain: 0.9, crunch: 0.3 },
  water: { lp: 800, gain: 1.2, crunch: 0.3 },
};

const HARD: ReadonlySet<SurfaceKind> = new Set(['asphalt', 'concrete', 'tile', 'metal', 'wood']);

function harmonics(p: EngineProfile): number[] {
  const flavor = p.flavor ?? 'piston';
  const rasp = clamp01f(p.rasp, 0.4);
  const bass = clamp01f(p.bass, 0.5);
  const out = [0];
  const halfStrength = flavor === 'bigBlock' ? 0.62 : flavor === 'exotic' ? 0.14 : flavor === 'twoStroke' ? 0 : p.cylinders >= 6 ? 0.34 : 0.16;
  const slope = flavor === 'exotic' ? 0.75 : flavor === 'twoStroke' ? 0.7 : 1.15 - rasp * 0.55;
  for (let k = 1; k < 28; k++) {
    const order = k / 2;
    let a: number;
    if (flavor === 'twoStroke') a = Math.pow(k, -slope);
    else if (k % 2 === 0) a = Math.pow(order, -slope);
    else a = halfStrength * Math.pow(order + 0.5, -1.25);
    if (k <= 2) a *= 1 + bass * 0.9;
    if (flavor === 'exotic' && k >= 8 && k <= 16) a *= 1.6;
    out.push(a);
  }
  return out;
}

/** The full detail layer (player car). Created and destroyed with priority changes. */
class Detail {
  readonly nodes: AudioNode[] = [];
  readonly sources: AudioScheduledSourceNode[] = [];
  readonly intakeBp: BiquadFilterNode;
  readonly intake: GainNode;
  readonly turbo: OscillatorNode;
  readonly turboGain: GainNode;
  readonly squealBp: BiquadFilterNode;
  readonly squeal: GainNode;
  readonly squealTone: OscillatorNode;
  readonly roadLp: BiquadFilterNode;
  readonly road: GainNode;
  readonly crunch: GainNode;
  readonly windBp: BiquadFilterNode;
  readonly wind: GainNode;

  constructor(ctx: BaseAudioContext, buf: SharedBuffers, out: AudioNode) {
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      this.nodes.push(g);
      return g;
    };
    const filt = (type: BiquadFilterType, f: number, q: number) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      this.nodes.push(b);
      return b;
    };
    const src = (b: AudioBuffer, rate = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.playbackRate.value = rate;
      this.nodes.push(s);
      this.sources.push(s);
      return s;
    };
    this.intakeBp = filt('bandpass', 400, 1.6);
    this.intake = gain(0);
    src(buf.pink).connect(this.intakeBp).connect(this.intake).connect(out);

    this.turbo = ctx.createOscillator();
    this.turbo.frequency.value = 2000;
    this.turboGain = gain(0);
    this.turbo.connect(this.turboGain).connect(out);
    this.nodes.push(this.turbo);
    this.sources.push(this.turbo);

    this.squealBp = filt('bandpass', 1150, 5);
    this.squeal = gain(0);
    src(buf.white).connect(this.squealBp).connect(this.squeal).connect(out);
    this.squealTone = ctx.createOscillator();
    this.squealTone.type = 'triangle';
    this.squealTone.frequency.value = 1040;
    const sqVib = ctx.createOscillator();
    sqVib.frequency.value = 6.7;
    const sqVibDepth = gain(26);
    sqVib.connect(sqVibDepth).connect(this.squealTone.detune);
    const sqToneGain = gain(0.12);
    this.squealTone.connect(sqToneGain).connect(this.squeal);
    this.nodes.push(this.squealTone, sqVib);
    this.sources.push(this.squealTone, sqVib);

    this.roadLp = filt('lowpass', 420, 0.6);
    this.road = gain(0);
    src(buf.brown).connect(this.roadLp).connect(this.road).connect(out);
    this.crunch = gain(0);
    src(buf.crackle, 1.6).connect(filt('bandpass', 1800, 0.8)).connect(this.crunch).connect(out);

    this.windBp = filt('bandpass', 700, 0.6);
    this.wind = gain(0);
    src(buf.pink, 1.1).connect(this.windBp).connect(this.wind).connect(out);
  }

  start(t: number): void {
    for (const s of this.sources) {
      if (s instanceof AudioBufferSourceNode && s.buffer) s.start(t, (t * 1.37) % (s.buffer.duration - 0.2));
      else s.start(t);
    }
  }

  dispose(t: number): void {
    for (const s of this.sources) {
      try {
        s.stop(t + 0.1);
      } catch {
        // Already stopped.
      }
    }
    const first = this.sources[0];
    const nodes = this.nodes;
    if (first) first.onended = () => nodes.forEach((n) => n.disconnect());
  }
}

export class SynthEngineVoice {
  private readonly main: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly shaper: WaveShaperNode;
  private readonly lp: BiquadFilterNode;
  private readonly mainGain: GainNode;
  private readonly subGain: GainNode;
  private readonly bus: GainNode;
  private readonly cabin: BiquadFilterNode;
  private readonly panner: PannerNode;
  private readonly buf: SharedBuffers;
  private detail: Detail | null = null;
  private readonly fireDiv: number;
  private lastThrottle = 0;
  private lastRpm = 0;
  private lastT = 0;
  private boost = 0;
  private dopplerRatio = 1;
  private lastDist = -1;
  private frameCount = 0;
  private disposed = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly profile: EngineProfile,
    out: AudioNode,
    private readonly listener: ListenerState,
    private isPlayer: boolean,
  ) {
    this.buf = buffers(ctx);
    const flavor = profile.flavor ?? 'piston';
    // Firing events per revolution: four-strokes fire every other turn per cylinder.
    this.fireDiv = flavor === 'twoStroke' ? Math.max(1, profile.cylinders) : Math.max(1, profile.cylinders) / 2;
    this.main = ctx.createOscillator();
    this.main.setPeriodicWave(periodicWave(ctx, `eng:${profile.cylinders}:${profile.rasp}:${profile.bass}:${flavor}`, harmonics(profile)));
    this.sub = ctx.createOscillator();
    this.sub.type = 'sine';
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = raspCurve(clamp01f(profile.rasp, 0.4) * 0.8);
    this.shaper.oversample = '2x';
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.9;
    this.mainGain = ctx.createGain();
    this.mainGain.gain.value = 0;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.bus = ctx.createGain();
    this.cabin = ctx.createBiquadFilter();
    this.cabin.type = 'lowpass';
    this.cabin.frequency.value = 14000;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 6;
    this.panner.rolloffFactor = 1;
    this.panner.maxDistance = 600;

    this.main.connect(this.shaper).connect(this.lp).connect(this.mainGain).connect(this.bus);
    this.sub.connect(this.subGain).connect(this.bus);
    this.bus.connect(this.cabin).connect(this.panner).connect(out);
    const t = ctx.currentTime;
    this.main.frequency.value = 30;
    this.sub.frequency.value = 15;
    this.main.start(t);
    this.sub.start(t);
    if (isPlayer) this.makeDetail();
  }

  setPriority(isPlayer: boolean): void {
    if (this.disposed || isPlayer === this.isPlayer) return;
    this.isPlayer = isPlayer;
    if (isPlayer) this.makeDetail();
    else if (this.detail) {
      this.detail.dispose(this.ctx.currentTime);
      this.detail = null;
    }
  }

  update(f: EngineFrame): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const p = this.profile;
    this.frameCount++;
    // Traffic voices update at a third of the frame rate.
    if (!this.isPlayer && this.frameCount % 3 !== 0) return;

    const idle = Math.max(300, fin(p.idleRpm, 800));
    const red = Math.max(idle + 500, fin(p.redlineRpm, 6500));
    const rpm = clampf(f.rpm, idle * 0.6, red * 1.08, idle);
    const throttle = clamp01f(f.throttle);
    const load = clamp01f(f.load);
    const speed = Math.max(0, fin(f.speed));
    const rpmN = (rpm - idle) / (red - idle);

    // Position and Doppler (relative speed along the line of sight).
    const x = fin(f.x), y = fin(f.y), z = fin(f.z);
    this.setPannerPos(x, y, z, t);
    const dx = x - this.listener.x, dy = y - this.listener.y, dz = z - this.listener.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const dt = this.lastT > 0 ? t - this.lastT : 0;
    if (!this.isPlayer && dt > 0.001 && this.lastDist >= 0) {
      const vRel = clampf((dist - this.lastDist) / dt, -120, 120, 0);
      const target = clampf(343 / (343 + vRel), 0.75, 1.3, 1);
      this.dopplerRatio += (target - this.dopplerRatio) * 0.35;
    } else if (this.isPlayer) {
      this.dopplerRatio = 1;
    }
    this.lastDist = dist;

    const firing = (rpm / 60) * this.fireDiv * this.dopplerRatio;
    const base = (p.flavor ?? 'piston') === 'twoStroke' ? firing : firing / 2;
    glide(this.main.frequency, base, t, 0.025);
    glide(this.sub.frequency, base * ((p.flavor ?? 'piston') === 'bigBlock' ? 0.5 : 1), t, 0.03);
    const bright = 280 + rpmN * 2600 * (0.45 + throttle * 0.8) + clamp01f(p.rasp) * 1400;
    glide(this.lp.frequency, Math.min(9000, bright), t, 0.04);
    // Calibrated (offline QA) so a cruising player car sits under the in-car radio.
    const level = (0.07 + load * 0.11 + throttle * 0.04 + rpmN * 0.03) * 0.55;
    glide(this.mainGain.gain, level * (this.isPlayer ? 1 : 0.85), t, 0.04);
    glide(this.subGain.gain, (0.05 + clamp01f(p.bass) * 0.1) * (0.6 + load * 0.4) * 0.55, t, 0.05);
    glide(this.cabin.frequency, f.interior && this.isPlayer ? 2400 : 14000, t, 0.15);

    if (this.detail) this.updateDetail(f, rpm, rpmN, throttle, load, speed, t);
    this.lastThrottle = throttle;
    this.lastRpm = rpm;
    this.lastT = t;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    glide(this.bus.gain, 0, t, 0.05);
    this.main.stop(t + 0.3);
    this.sub.stop(t + 0.3);
    this.detail?.dispose(t);
    this.detail = null;
    const nodes: AudioNode[] = [this.main, this.sub, this.shaper, this.lp, this.mainGain, this.subGain, this.bus, this.cabin, this.panner];
    this.main.onended = () => nodes.forEach((n) => n.disconnect());
  }

  private makeDetail(): void {
    this.detail = new Detail(this.ctx, this.buf, this.bus);
    this.detail.start(this.ctx.currentTime);
  }

  private updateDetail(f: EngineFrame, rpm: number, rpmN: number, throttle: number, load: number, speed: number, t: number): void {
    const d = this.detail!;
    const p = this.profile;
    const firing = (rpm / 60) * this.fireDiv;
    glide(d.intakeBp.frequency, Math.min(6000, firing * 3.2 + 200), t, 0.04);
    glide(d.intake.gain, 0.02 + throttle * load * 0.07, t, 0.05);

    // Turbo: spools with throttle under load above ~35 % rpm, whistles, and blows off on lift.
    const turbo = clamp01f(p.turbo);
    if (turbo > 0) {
      const target = rpmN > 0.35 && throttle > 0.5 ? Math.min(1, load * 1.2) : 0;
      const prev = this.boost;
      this.boost += (target - this.boost) * (target > this.boost ? 0.04 : 0.15);
      glide(d.turbo.frequency, 1700 + this.boost * 5200, t, 0.05);
      glide(d.turboGain.gain, this.boost * turbo * 0.028, t, 0.05);
      if (prev > 0.55 && this.lastThrottle > 0.6 && throttle < 0.2) this.blowOff(t, prev * turbo);
    }

    // Lift-off pops at high rpm.
    if (this.lastThrottle > 0.6 && throttle < 0.15 && rpmN > 0.5 && p.pops > 0) this.pops(t, clamp01f(p.pops));

    // Gear shift: sharp rpm drop under power.
    if (this.lastRpm > 0 && rpm < this.lastRpm * 0.8 && throttle > 0.3) this.shift(t);

    // Tires.
    const slip = clamp01f(f.slip);
    const hard = HARD.has(f.surface);
    const sq = Math.max(0, slip - 0.12) / 0.88;
    glide(d.squeal.gain, hard ? sq * 0.22 * Math.min(1, speed / 6) : 0, t, 0.05);
    glide(d.squealBp.frequency, 980 + slip * 520, t, 0.05);
    glide(d.squealTone.frequency, 950 + slip * 300, t, 0.05);

    const road = ROAD[f.surface] ?? ROAD.asphalt;
    const sp = Math.min(1, speed / 45);
    glide(d.roadLp.frequency, road.lp * (0.7 + sp * 0.8), t, 0.1);
    glide(d.road.gain, sp * 0.16 * road.gain * (f.interior ? 0.7 : 1), t, 0.1);
    glide(d.crunch.gain, road.crunch * Math.min(1, speed / 10) * (0.15 + (hard ? 0 : sq) * 0.25), t, 0.08);

    const w = Math.min(1, (speed / 55) ** 2);
    glide(d.wind.gain, w * (f.interior ? 0.05 : 0.14), t, 0.15);
    glide(d.windBp.frequency, 500 + w * 900, t, 0.15);
  }

  private blowOff(t: number, k: number): void {
    const d = makeDest(this.ctx, this.bus);
    noise(d, { t, attack: 0.004, decay: 0.32, gain: 0.08 * k, filter: { type: 'highpass', freq: 2400 } });
    tone(d, { t, freq: 3400, to: 1500, glide: 0.25, decay: 0.25, gain: 0.015 * k });
  }

  private pops(t: number, chance: number): void {
    const d = makeDest(this.ctx, this.bus);
    const count = Math.round(1 + chance * 5);
    for (let i = 0; i < count; i++) {
      const at = t + 0.05 + i * (0.07 + ((i * 37) % 5) * 0.025);
      const k = 0.6 + ((i * 13) % 4) / 10;
      noise(d, { t: at, attack: 0.001, decay: 0.05, gain: 0.22 * k * chance, filter: { type: 'lowpass', freq: 1600 } });
      thump(d, at, 0.12 * k * chance, 90, 45, 0.06);
    }
  }

  private shift(t: number): void {
    const d = makeDest(this.ctx, this.bus);
    noise(d, { t, decay: 0.015, gain: 0.05, filter: { type: 'bandpass', freq: 1300, q: 1.5 } });
    if (this.profile.turbo > 0.3) noise(d, { t, attack: 0.003, decay: 0.16, gain: 0.04, filter: { type: 'highpass', freq: 3000 } });
  }

  private setPannerPos(x: number, y: number, z: number, t: number): void {
    const pn = this.panner;
    if (pn.positionX) {
      glide(pn.positionX, x, t, 0.02);
      glide(pn.positionY, y, t, 0.02);
      glide(pn.positionZ, z, t, 0.02);
    } else {
      pn.setPosition(x, y, z);
    }
  }
}
