import { signal } from '@preact/signals-core';
import type { NowPlaying, RadioApi, StationId, StationInfo } from '../api';
import { makeDest, noise } from '../synth/kit';
import { clamp01f, glide } from '../util/params';
import { TrackPlayer } from './player';
import { SpotPlayer } from './spots';
import { cycleStation, STATIONS, StationTimeline, type Segment } from './station';

/**
 * The car radio. Every station runs its own timeline on the wall clock; only the tuned station
 * makes sound, and only while audible. `nowPlaying` updates even without an audio context, so the
 * HUD card works in muted/headless runs.
 */

const LOOKAHEAD = 0.35;
const PRESTART = 0.6;

interface Session {
  seg: Segment;
  player: TrackPlayer | SpotPlayer;
}

const wallNow = (): number => (globalThis.performance ? globalThis.performance.now() : Date.now()) / 1000;

export interface RadioGraph {
  ctx: BaseAudioContext;
  music: AudioNode;
  hall: AudioNode;
}

export class Radio implements RadioApi {
  readonly stations: readonly StationInfo[] = STATIONS;
  readonly station = signal<StationId | null>('sunset');
  readonly nowPlaying = signal<NowPlaying | null>(null);

  private readonly timelines: Record<StationId, StationTimeline>;
  private graph: RadioGraph | null = null;
  private input: GainNode | null = null;
  private hp: BiquadFilterNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private level: GainNode | null = null;
  private hallLevel: GainNode | null = null;
  private current: Session | null = null;
  private upcoming: Session | null = null;
  private audible = 0;
  private interior = true;
  private lastKey = '';

  constructor(seed = 0, private readonly clock: () => number = wallNow) {
    const epoch = clock();
    this.timelines = {
      sunset: new StationTimeline('sunset', seed, epoch),
      calle: new StationTimeline('calle', seed, epoch),
      haze: new StationTimeline('haze', seed, epoch),
      bass: new StationTimeline('bass', seed, epoch),
    };
  }

  /** Connect to an audio context (on unlock, or an offline context in QA). */
  attach(graph: RadioGraph): void {
    this.graph = graph;
    const { ctx } = graph;
    this.input = ctx.createGain();
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 60;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 12000;
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.hallLevel = ctx.createGain();
    this.hallLevel.gain.value = 0;
    this.input.connect(this.hp).connect(this.lp).connect(this.level).connect(graph.music);
    this.hallLevel.connect(graph.hall);
    this.applyAudible(ctx.currentTime);
  }

  setStation(id: StationId | null): void {
    if (id === this.station.peek()) return;
    this.endSessions(0.08);
    this.station.value = id;
    this.lastKey = '';
    if (this.graph && this.audible > 0.001) this.tuneStatic();
    this.refreshNowPlaying();
  }

  next(): void {
    this.setStation(cycleStation(this.station.peek(), 1));
  }

  prev(): void {
    this.setStation(cycleStation(this.station.peek(), -1));
  }

  setAudible(level: number, interior: boolean): void {
    const l = clamp01f(level);
    if (Math.abs(l - this.audible) < 0.001 && interior === this.interior) return;
    this.audible = l;
    this.interior = interior;
    if (this.graph) this.applyAudible(this.graph.ctx.currentTime);
    if (l <= 0.001) this.endSessions(0.3);
    this.refreshNowPlaying();
  }

  /** Air a headline on every station after its current segment. */
  pushNews(text: string): void {
    for (const t of Object.values(this.timelines)) t.pushNews(text);
  }

  /** Restart audio at the right timeline position (after the context was suspended). */
  resync(): void {
    this.endSessions(0.05);
  }

  /** Per-frame: keep `nowPlaying` current and schedule audio ahead. */
  update(): void {
    this.refreshNowPlaying();
    const id = this.station.peek();
    const g = this.graph;
    if (!g || id === null || this.audible <= 0.001) return;
    const now = this.clock();
    const ctxNow = g.ctx.currentTime;
    // Wall time → context time is ctxNow + (wall − now); computed inline to stay allocation-free.
    const tl = this.timelines[id];
    const seg = tl.at(now);
    if (!this.current || this.current.seg !== seg) {
      if (this.upcoming && this.upcoming.seg === seg) {
        this.current?.player.stop(ctxNow, 0.2);
        this.current = this.upcoming;
        this.upcoming = null;
      } else {
        this.current?.player.stop(ctxNow, 0.15);
        this.current = this.start(seg, ctxNow + (seg.start - now), id);
      }
    }
    const end = seg.start + seg.dur;
    if (!this.upcoming && end - now < PRESTART) {
      const next = tl.after(seg);
      this.upcoming = this.start(next, ctxNow + (next.start - now), id);
    }
    this.current.player.scheduleUntil(ctxNow + LOOKAHEAD);
    this.upcoming?.player.scheduleUntil(ctxNow + LOOKAHEAD);
  }

  dispose(): void {
    this.endSessions(0.02);
    this.graph = null;
  }

  private start(seg: Segment, t0: number, station: StationId): Session {
    const g = this.graph!;
    if (seg.kind === 'track') {
      const p = new TrackPlayer(g.ctx, { station, output: this.input!, hall: this.hallLevel! });
      p.play(seg.track, t0);
      return { seg, player: p };
    }
    return { seg, player: new SpotPlayer(g.ctx, this.input!, this.hallLevel!, seg, station, t0) };
  }

  private endSessions(fade: number): void {
    const t = this.graph?.ctx.currentTime ?? 0;
    this.current?.player.stop(t, fade);
    this.upcoming?.player.stop(t, fade);
    this.current = null;
    this.upcoming = null;
  }

  private applyAudible(t: number): void {
    if (!this.level || !this.hp || !this.lp || !this.hallLevel) return;
    const l = this.audible * (this.interior ? 1 : 0.7);
    glide(this.level.gain, l, t, 0.12);
    glide(this.hallLevel.gain, l, t, 0.12);
    glide(this.hp.frequency, this.interior ? 55 : 230, t, 0.1);
    glide(this.lp.frequency, this.interior ? 12500 : 2900, t, 0.1);
  }

  private tuneStatic(): void {
    const g = this.graph;
    if (!g || !this.input) return;
    try {
      const d = makeDest(g.ctx, this.input);
      noise(d, { t: g.ctx.currentTime + 0.01, attack: 0.02, decay: 0.22, gain: 0.12, filter: { type: 'bandpass', freq: 3200, to: 900, sweep: 0.22, q: 1.4 } });
    } catch {
      // A closed context cannot make static; switching stations still works.
    }
  }

  private refreshNowPlaying(): void {
    const id = this.station.peek();
    if (id === null || this.audible <= 0.001) {
      if (this.nowPlaying.peek() !== null) this.nowPlaying.value = null;
      this.lastKey = '';
      return;
    }
    const seg = this.timelines[id].at(this.clock());
    const key = `${id}:${seg.n}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const info = STATIONS.find((s) => s.id === id)!;
    switch (seg.kind) {
      case 'track':
        this.nowPlaying.value = { station: id, title: seg.track.title, artist: seg.track.artist, isAd: false, caption: null };
        break;
      case 'ad':
        this.nowPlaying.value = { station: id, title: seg.ad.sponsor, artist: info.name, isAd: true, caption: seg.ad.caption };
        break;
      case 'ident':
        this.nowPlaying.value = { station: id, title: info.name, artist: `${info.frequency} FM`, isAd: true, caption: seg.text };
        break;
      case 'news':
        this.nowPlaying.value = { station: id, title: 'News flash', artist: info.name, isAd: true, caption: seg.text };
        break;
    }
  }
}
