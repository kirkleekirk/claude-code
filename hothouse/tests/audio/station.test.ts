import { describe, expect, it } from 'vitest';
import { MOODS, energyFor } from '@/audio/music/scoreMoods';
import { barEvents } from '@/audio/music/composer';
import { cycleStation, StationTimeline, STATIONS } from '@/audio/music/station';
import { clampf, clamp01f, dbToGain, fin, midiToHz, sliderToGain } from '@/audio/util/params';

describe('station timeline', () => {
  it('is deterministic and contiguous', () => {
    const a = new StationTimeline('sunset', 1, 1000);
    const b = new StationTimeline('sunset', 1, 1000);
    let t = 1000;
    let prevEnd = -1;
    for (let i = 0; i < 40; i++) {
      const sa = a.at(t);
      const sb = b.at(t);
      expect(sa.n).toBe(sb.n);
      expect(sa.kind).toBe(sb.kind);
      expect(t).toBeGreaterThanOrEqual(sa.start);
      expect(t).toBeLessThan(sa.start + sa.dur);
      if (prevEnd >= 0 && sa.start !== prevEnd) expect(sa.start).toBeGreaterThan(prevEnd - 1e-6);
      prevEnd = sa.start + sa.dur;
      t = prevEnd + 0.01;
    }
  });

  it('starts each station mid-playlist and mixes tracks, ads and idents', () => {
    const tl = new StationTimeline('calle', 7, 5000);
    const first = tl.at(5000);
    expect(first.start).toBeLessThan(5000);
    const kinds = new Set<string>();
    let t = 5000;
    for (let i = 0; i < 60; i++) {
      const s = tl.at(t);
      kinds.add(s.kind);
      t = s.start + s.dur + 0.01;
    }
    expect(kinds.has('track')).toBe(true);
    expect(kinds.has('ad')).toBe(true);
    expect(kinds.has('ident')).toBe(true);
  });

  it('airs pushed news right after the current track', () => {
    const tl = new StationTimeline('haze', 3, 0);
    let t = 0;
    let s = tl.at(t);
    while (s.kind !== 'track') {
      t = s.start + s.dur + 0.01;
      s = tl.at(t);
    }
    tl.pushNews('Local nursery’s mysterious boom baffles economists');
    const next = tl.after(s);
    expect(next.kind).toBe('news');
    expect(next.kind === 'news' && next.text).toContain('baffles economists');
  });

  it('cycles the dial with an off position', () => {
    expect(cycleStation('sunset', 1)).toBe('calle');
    expect(cycleStation('bass', 1)).toBeNull();
    expect(cycleStation(null, 1)).toBe('sunset');
    expect(cycleStation('sunset', -1)).toBeNull();
    expect(STATIONS.map((s) => s.id)).toEqual(['sunset', 'calle', 'haze', 'bass']);
  });
});

describe('score moods', () => {
  it('every mood loops with notes in every bar at its default intensity', () => {
    for (const [mood, def] of Object.entries(MOODS)) {
      const track = { ...def.track, sections: def.track.sections.map((s) => ({ ...s, energy: energyFor(def.intensity) })) };
      for (let bar = 0; bar < track.bars; bar++) {
        const ev = barEvents(track, bar);
        expect(ev.length, `${mood} bar ${bar}`).toBeGreaterThan(0);
      }
      expect(Object.keys(def.layers).length).toBeGreaterThan(1);
    }
  });
});

describe('param safety', () => {
  it('never lets non-finite values through', () => {
    expect(fin(NaN, 3)).toBe(3);
    expect(fin(Infinity, 2)).toBe(2);
    expect(clampf(NaN, 0, 1, 0.5)).toBe(0.5);
    expect(clampf(5, 0, 1)).toBe(1);
    expect(clamp01f(-Infinity)).toBe(0);
    expect(dbToGain(NaN)).toBeGreaterThanOrEqual(0);
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(NaN)).toBeCloseTo(440, 6);
    expect(sliderToGain(0.5)).toBeCloseTo(0.25, 6);
    expect(sliderToGain(NaN)).toBe(1);
  });
});
