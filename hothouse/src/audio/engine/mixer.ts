import type { BusId } from '../api';
import { clamp01f, clampf, fin, glide, sliderToGain } from '../util/params';
import { buildImpulse, IR_HALL, IR_ROOM } from './reverb';

/** Internal balance applied under the player's bus sliders (sets the default mix). */
const BUS_TRIM: Record<BusId, number> = { master: 1, music: 0.78, sfx: 1, ambience: 0.72, ui: 0.55, barks: 0.85 };
const CHILD_BUSES = ['music', 'sfx', 'ambience', 'ui', 'barks'] as const;
const ALL_BUSES: readonly BusId[] = ['master', ...CHILD_BUSES];
type ChildBus = (typeof CHILD_BUSES)[number];

interface Duck {
  amount: number;
  until: number;
}

/** Output safety: linear to 0.8, then a soft knee that never exceeds ±0.98. */
function safetyCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/**
 * The bus graph:
 *
 * ```
 * music    → duck → vol ┐
 * sfx      → slow-mo LP → duck → vol ┤
 * ambience → indoor LP → slow-mo LP → duck → vol ┤→ master vol → glue comp → limiter → safety clip → out
 * ui       → duck → vol ┤
 * barks    → duck → vol ┘
 * room reverb (world sends) returns into sfx; hall reverb (music sends) returns into music.
 * ```
 */
export class Mixer {
  /** Connect sources here. */
  readonly input: Record<ChildBus, GainNode>;
  /** World reverb send (spatial SFX, footsteps indoors, thunder). */
  readonly roomSend: GainNode;
  /** Music reverb send (instruments, stingers, DJ). */
  readonly hallSend: GainNode;
  readonly master: GainNode;
  /** Post-limiter output, for analysers in the lab. */
  readonly output: GainNode;

  private readonly duckNodes: Record<BusId, GainNode>;
  private readonly volNodes: Record<BusId, GainNode>;
  private readonly ducks: Record<BusId, Duck[]>;
  private readonly duckLevel: Record<BusId, number>;
  private readonly slowmo: BiquadFilterNode[];
  private readonly indoorLP: BiquadFilterNode;
  private readonly nodes: AudioNode[] = [];
  private timeScale = 1;

  constructor(readonly ctx: BaseAudioContext, destination: AudioNode) {
    const g = (gain = 1): GainNode => {
      const n = ctx.createGain();
      n.gain.value = gain;
      this.nodes.push(n);
      return n;
    };
    this.master = g(1);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 2.6;
    glue.attack.value = 0.008;
    glue.release.value = 0.24;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.09;
    const safety = ctx.createWaveShaper();
    safety.curve = safetyCurve();
    safety.oversample = '2x';
    this.output = g(1);
    this.master.connect(glue).connect(limiter).connect(safety).connect(this.output).connect(destination);
    this.nodes.push(glue, limiter, safety);

    const duckNodes = {} as Record<BusId, GainNode>;
    const volNodes = {} as Record<BusId, GainNode>;
    const input = {} as Record<ChildBus, GainNode>;
    duckNodes.master = g(1);
    volNodes.master = this.master;
    this.slowmo = [];
    this.indoorLP = ctx.createBiquadFilter();
    this.indoorLP.type = 'lowpass';
    this.indoorLP.frequency.value = 20000;
    this.indoorLP.Q.value = 0.5;
    this.nodes.push(this.indoorLP);
    const masterIn = g(1);
    masterIn.connect(duckNodes.master).connect(this.master);

    for (const bus of CHILD_BUSES) {
      const inp = g(1);
      const duck = g(1);
      const vol = g(sliderToGain(0.8) * BUS_TRIM[bus]);
      let head: AudioNode = inp;
      if (bus === 'ambience') {
        head.connect(this.indoorLP);
        head = this.indoorLP;
      }
      if (bus === 'sfx' || bus === 'ambience') {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 22000;
        lp.Q.value = 0.6;
        this.slowmo.push(lp);
        this.nodes.push(lp);
        head.connect(lp);
        head = lp;
      }
      head.connect(duck).connect(vol).connect(masterIn);
      input[bus] = inp;
      duckNodes[bus] = duck;
      volNodes[bus] = vol;
    }
    this.input = input;
    this.duckNodes = duckNodes;
    this.volNodes = volNodes;
    this.ducks = { master: [], music: [], sfx: [], ambience: [], ui: [], barks: [] };
    this.duckLevel = { master: 1, music: 1, sfx: 1, ambience: 1, ui: 1, barks: 1 };

    // Reverbs.
    this.roomSend = g(1);
    const room = ctx.createConvolver();
    room.normalize = false;
    room.buffer = buildImpulse(ctx, IR_ROOM);
    const roomHp = ctx.createBiquadFilter();
    roomHp.type = 'highpass';
    roomHp.frequency.value = 180;
    this.roomSend.connect(roomHp).connect(room).connect(g(0.55)).connect(input.sfx);
    this.hallSend = g(1);
    const hall = ctx.createConvolver();
    hall.normalize = false;
    hall.buffer = buildImpulse(ctx, IR_HALL);
    const hallHp = ctx.createBiquadFilter();
    hallHp.type = 'highpass';
    hallHp.frequency.value = 220;
    this.hallSend.connect(hallHp).connect(hall).connect(g(0.5)).connect(input.music);
    this.nodes.push(room, hall, roomHp, hallHp);
  }

  setVolume(bus: BusId, volume: number): void {
    const target = sliderToGain(clamp01f(volume, 0.8)) * BUS_TRIM[bus];
    glide(this.volNodes[bus].gain, target, this.ctx.currentTime, 0.04);
  }

  /** Lower a bus by `amount` (0–1) for `seconds`; overlapping ducks take the deepest. */
  duck(bus: BusId, amount: number, seconds: number): void {
    const a = clampf(amount, 0, 1, 0);
    const s = clampf(seconds, 0, 120, 0);
    if (a <= 0 || s <= 0) return;
    const list = this.ducks[bus];
    if (list.length > 16) list.shift();
    list.push({ amount: a, until: this.ctx.currentTime + s });
  }

  /** 1 = normal; lower values muffle and soften the world buses (phone slow-mo, busted). */
  setTimeScale(scale: number): void {
    const s = clampf(scale, 0.05, 1, 1);
    if (Math.abs(s - this.timeScale) < 0.001) return;
    this.timeScale = s;
    const cutoff = s >= 0.999 ? 22000 : 700 + 9000 * s * s;
    for (const f of this.slowmo) glide(f.frequency, cutoff, this.ctx.currentTime, 0.12);
  }

  get pitchScale(): number {
    return 0.62 + 0.38 * this.timeScale;
  }

  /** 0 outdoors … 1 inside: muffles the ambience bed. */
  setIndoor(indoor: number): void {
    const x = clamp01f(indoor);
    const cutoff = 20000 * Math.pow(500 / 20000, x);
    glide(this.indoorLP.frequency, cutoff, this.ctx.currentTime, 0.25);
  }

  /** Apply duck envelopes; call every frame. Allocation-free. */
  update(now: number): void {
    for (let b = 0; b < ALL_BUSES.length; b++) {
      const bus = ALL_BUSES[b]!;
      const list = this.ducks[bus];
      let deepest = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i]!;
        if (d.until <= now) list.splice(i, 1);
        else if (d.amount > deepest) deepest = d.amount;
      }
      const target = 1 - deepest;
      if (Math.abs(target - this.duckLevel[bus]) > 0.001) {
        const attack = target < this.duckLevel[bus];
        this.duckLevel[bus] = target;
        glide(this.duckNodes[bus].gain, fin(target, 1), now, attack ? 0.05 : 0.35);
      }
    }
  }

  dispose(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.nodes.length = 0;
  }
}
