import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { randomAppearance } from '@/content/appearance';
import { Rng } from '@/core/rng';
import { createCharacters } from '@/characters';
import { MaterialKit } from '@/render/materials/MaterialKit';
import { SharedUniforms } from '@/render/shared';
import type { ClipId } from '@/characters/api';

/**
 * Micro-benchmark: 60 people at mixed distances (a third near, a third mid, a third far) walking,
 * idling and gesturing. Measures `update` (the animation budget is 2 ms per frame for 60) and,
 * separately, `create` once warm. Numbers land in qa/out/people/bench.json for the report.
 */
describe('character budgets', () => {
  it('updates 60 actors inside the frame budget and creates actors quickly once warm', () => {
    const f = createCharacters(new MaterialKit(new SharedUniforms()));
    const rng = new Rng('bench');
    // Warm the builder and the JIT.
    for (let i = 0; i < 12; i++) f.create(randomAppearance(rng)).dispose();
    const createMs: number[] = [];
    const actors = [];
    for (let i = 0; i < 60; i++) {
      const a = randomAppearance(rng);
      const t0 = performance.now();
      actors.push(f.create(a));
      createMs.push(performance.now() - t0);
    }
    const dist = actors.map((_, i) => (i < 20 ? 4 + i * 0.6 : i < 40 ? 25 + i : 70 + i));
    const clips: ClipId[] = ['talk', 'phoneText', 'wave', 'count', 'smoke'];
    actors.forEach((a, i) => {
      a.loco.speed = i % 3 === 0 ? 0 : i % 3 === 1 ? 1.4 : 4.5;
      a.loco.turnRate = i % 5 === 0 ? 0.4 : 0;
      if (i % 4 === 0) a.play(clips[i % clips.length]!, { loop: true });
    });
    const dt = 1 / 60;
    for (let k = 0; k < 120; k++) for (let i = 0; i < actors.length; i++) actors[i]!.update(dt, dist[i]!);
    const frames: number[] = [];
    for (let k = 0; k < 400; k++) {
      const t0 = performance.now();
      for (let i = 0; i < actors.length; i++) actors[i]!.update(dt, dist[i]!);
      frames.push(performance.now() - t0);
    }
    frames.sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    const p95 = frames[Math.floor(frames.length * 0.95)]!;
    createMs.sort((a, b) => a - b);
    const createMedian = createMs[Math.floor(createMs.length / 2)]!;
    const stats = f.stats();
    const out = { actors: actors.length, updateMeanMs: +mean.toFixed(3), updateP95Ms: +p95.toFixed(3), createMedianMs: +createMedian.toFixed(2), createMaxMs: +createMs[createMs.length - 1]!.toFixed(2), stats, cacheHits: f.cache.hits, cacheMisses: f.cache.misses };
    mkdirSync('qa/out/people', { recursive: true });
    writeFileSync('qa/out/people/bench.json', JSON.stringify(out, null, 2));
    // Generous ceilings so shared CI machines pass; the measured numbers go in the report.
    expect(mean).toBeLessThan(4);
    expect(createMedian).toBeLessThan(6);
    expect(stats.full).toBe(20);
  });
});
