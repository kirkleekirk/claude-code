import { hash2, hashString, Rng } from '@/core/rng';
import type { StationId, StationInfo } from '../api';
import { composeTrack } from './composer';
import { names, type AdSpot } from './names';
import { trackSeconds, type Track } from './types';

/**
 * A station's running timeline, in wall-clock seconds. Segments (tracks, idents, ad breaks, news)
 * are generated lazily and deterministically, so a station "keeps playing" while nobody listens
 * and tuning back in lands mid-song. Pure logic: no Web Audio here.
 */

export const STATIONS: readonly StationInfo[] = [
  { id: 'sunset', name: 'Sunset FM', tagline: 'Golden hour, all hour.', frequency: '101.9', color: '#FF7A45' },
  { id: 'calle', name: 'Calle Ocho Static', tagline: 'Más calor, menos aire.', frequency: '97.3', color: '#FF3D8B' },
  { id: 'haze', name: 'Palm Haze', tagline: 'Low tide, low stress.', frequency: '88.5', color: '#17E0C8' },
  { id: 'bass', name: 'Gulf Bass', tagline: 'Check your trunk.', frequency: '104.7', color: '#B8F54A' },
];

export type Segment =
  | { readonly kind: 'track'; readonly start: number; readonly dur: number; readonly track: Track; readonly n: number }
  | { readonly kind: 'ad'; readonly start: number; readonly dur: number; readonly ad: AdSpot; readonly n: number }
  | { readonly kind: 'ident'; readonly start: number; readonly dur: number; readonly text: string; readonly n: number }
  | { readonly kind: 'news'; readonly start: number; readonly dur: number; readonly text: string; readonly n: number };

export const AD_SECONDS = 13;
export const IDENT_SECONDS = 5.5;
export const NEWS_SECONDS = 9;

export class StationTimeline {
  private readonly segments: Segment[] = [];
  private readonly news: string[] = [];
  private cursor: number;
  private n = 0;
  private trackIndex: number;
  private sinceBreak = 0;

  constructor(readonly id: StationId, readonly seed: number, epoch: number) {
    const rng = new Rng(hash2(hashString(id), seed, 0x52414449));
    // Each station starts at a different point of its playlist.
    this.trackIndex = rng.int(0, 40);
    this.cursor = epoch - rng.range(20, 240);
  }

  /** Queue a headline; it airs right after the current segment. */
  pushNews(text: string): void {
    const t = text.trim();
    if (!t) return;
    if (this.news.length >= 4) this.news.shift();
    this.news.push(t);
  }

  /** The segment playing at `time`. */
  at(time: number): Segment {
    while (this.cursor <= time || this.segments.length === 0) this.generate();
    // Drop history we will never need again.
    while (this.segments.length > 6 && this.segments[1]!.start + this.segments[1]!.dur < time - 30) this.segments.shift();
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i]!;
      if (time >= s.start) return s;
    }
    return this.segments[0]!;
  }

  /** The segment after `seg` (generating it if needed). */
  after(seg: Segment): Segment {
    const end = seg.start + seg.dur;
    while (this.cursor <= end + 0.001) this.generate();
    return this.at(end + 0.001);
  }

  private generate(): void {
    const rng = new Rng(hash2(hashString(this.id), this.seed + this.n, 0x5345474d));
    const n = this.n++;
    const start = this.cursor;
    let seg: Segment;
    if (this.news.length && this.lastKind() === 'track') {
      seg = { kind: 'news', start, dur: NEWS_SECONDS, text: names.news(this.news.shift()!), n };
    } else if (this.lastKind() === 'track' && this.sinceBreak >= 2 && rng.chance(0.75)) {
      this.sinceBreak = 0;
      seg = { kind: 'ad', start, dur: AD_SECONDS, ad: names.ad(rng), n };
    } else if (this.lastKind() === 'ad' && rng.chance(0.45)) {
      seg = { kind: 'ad', start, dur: AD_SECONDS, ad: names.ad(rng), n };
    } else if (this.lastKind() !== 'ident' && this.lastKind() !== 'none' && rng.chance(0.35)) {
      seg = { kind: 'ident', start, dur: IDENT_SECONDS, text: names.ident(this.id, rng), n };
    } else {
      const track = composeTrack(this.id, this.trackIndex++, this.seed);
      this.sinceBreak++;
      seg = { kind: 'track', start, dur: trackSeconds(track) + 0.6, track, n };
    }
    this.segments.push(seg);
    this.cursor = start + seg.dur;
  }

  private lastKind(): Segment['kind'] | 'none' {
    return this.segments.length ? this.segments[this.segments.length - 1]!.kind : 'none';
  }
}

/** Next station in the dial order, with "off" between the last and the first. */
export function cycleStation(current: StationId | null, dir: 1 | -1): StationId | null {
  const order: Array<StationId | null> = [...STATIONS.map((s) => s.id), null];
  const i = order.indexOf(current);
  return order[(i + dir + order.length) % order.length]!;
}
