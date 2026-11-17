import type { ScoreApi, ScoreMood } from '../api';
import { clamp01f } from '../util/params';
import { TrackPlayer } from './player';
import { energyFor, MOODS, type MoodDef } from './scoreMoods';
import { playStinger, type StingerKind } from './stingers';
import { beatSec, type Layer, type Section, type Track } from './types';

/**
 * The dynamic score. One mood plays at a time; switching waits for the next bar of the current
 * mood and crossfades over a bar. Intensity raises section energy and opens layers.
 */

const LOOKAHEAD = 0.35;
const LAYERS: readonly Layer[] = ['drums', 'perc', 'bass', 'comp', 'pad', 'arp', 'lead', 'fx'];

interface Running {
  mood: ScoreMood;
  def: MoodDef;
  track: Track;
  player: TrackPlayer;
  t0: number;
  enabled: Set<Layer>;
}

export interface ScoreGraph {
  ctx: BaseAudioContext;
  music: AudioNode;
  hall: AudioNode;
  /** Ducks the music bus under stingers. */
  duck: (amount: number, seconds: number) => void;
}

export class Score implements ScoreApi {
  private graph: ScoreGraph | null = null;
  private mood: ScoreMood = 'silent';
  private intensity = 0.5;
  private running: Running | null = null;
  private fading: TrackPlayer[] = [];
  private pendingStingers: StingerKind[] = [];

  get currentMood(): ScoreMood {
    return this.mood;
  }

  attach(graph: ScoreGraph): void {
    this.graph = graph;
    const m = this.mood;
    this.mood = 'silent';
    this.setMood(m);
  }

  setMood(mood: ScoreMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    const g = this.graph;
    if (!g) return;
    const now = g.ctx.currentTime;
    const old = this.running;
    let at = now + 0.06;
    let fade = 1.2;
    if (old) {
      // Switch on the old mood's next bar line; fade over one bar.
      const barLen = 4 * beatSec(old.track.bpm);
      const bars = Math.ceil((now + 0.05 - old.t0) / barLen);
      at = old.t0 + bars * barLen;
      fade = Math.min(2.4, barLen);
      old.player.stop(at, fade);
      this.fading.push(old.player);
    }
    this.running = null;
    if (mood === 'silent') return;
    const def = MOODS[mood];
    if (old === null || old === undefined) this.intensity = def.intensity;
    const track: Track = { ...def.track, sections: def.track.sections.map((s: Section) => ({ ...s })) };
    const enabled = new Set<Layer>();
    const player = new TrackPlayer(g.ctx, { station: def.kit, output: g.music, hall: g.hall, loop: true, allow: (l) => enabled.has(l) });
    player.out.gain.setValueAtTime(0, now);
    player.out.gain.setValueAtTime(0, at);
    player.out.gain.linearRampToValueAtTime(1, at + fade);
    this.running = { mood, def, track, player, t0: at, enabled };
    this.applyIntensity(true);
    player.play(track, at);
  }

  setIntensity(level: number): void {
    const l = clamp01f(level, 0.5);
    if (Math.abs(l - this.intensity) < 0.01) return;
    this.intensity = l;
    this.applyIntensity(false);
  }

  stinger(kind: StingerKind): void {
    const g = this.graph;
    if (!g) {
      if (this.pendingStingers.length < 2) this.pendingStingers.push(kind);
      return;
    }
    const len = playStinger(g.ctx, g.music, g.hall, kind, g.ctx.currentTime + 0.02);
    g.duck(kind === 'busted' || kind === 'missionFailed' ? 0.6 : 0.35, len);
  }

  update(): void {
    const g = this.graph;
    if (!g) return;
    if (this.pendingStingers.length) {
      const k = this.pendingStingers.shift()!;
      this.stinger(k);
    }
    const now = g.ctx.currentTime;
    this.running?.player.scheduleUntil(now + LOOKAHEAD);
    if (this.fading.length) this.fading = this.fading.filter((p) => !p.isStopped);
  }

  dispose(): void {
    const t = this.graph?.ctx.currentTime ?? 0;
    this.running?.player.stop(t, 0.05);
    this.running = null;
    this.graph = null;
  }

  private applyIntensity(initial: boolean): void {
    const r = this.running;
    const g = this.graph;
    if (!r || !g) return;
    r.track.sections[0]!.energy = energyFor(this.intensity);
    const now = g.ctx.currentTime;
    const barLen = 4 * beatSec(r.track.bpm);
    for (const layer of LAYERS) {
      const min = r.def.layers[layer];
      const on = min !== undefined && this.intensity >= min;
      if (on) r.enabled.add(layer);
      else r.enabled.delete(layer);
      r.player.setLayerLevel(layer, on ? 1 : 0, initial ? now : now + 0.02, initial ? 0.01 : barLen / 3);
    }
  }
}
