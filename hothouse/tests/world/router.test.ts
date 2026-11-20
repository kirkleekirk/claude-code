import { describe, expect, it } from 'vitest';
import { buildCityGraph } from '@/world/plan/cityPlan';
import { PLACE_SPOTS } from '@/world/places';
import { Router } from '@/world/roads/router';

const graph = buildCityGraph();
const router = new Router(graph);

describe('Router', () => {
  it('finds the sunset drive from Ofelia’s to the Boardwalk along real roads', () => {
    const a = PLACE_SPOTS.ofelias, b = PLACE_SPOTS.boardwalk;
    const r = router.route(a.x, a.z, b.x, b.z);
    expect(r).not.toBeNull();
    const route = r!;
    const [sx, sz] = route.points[0]!;
    const [ex, ez] = route.points[route.points.length - 1]!;
    // Starts and ends on the roads nearest the two places.
    expect(Math.hypot(sx - a.x, sz - a.z)).toBeLessThan(20);
    expect(Math.hypot(ex - b.x, ez - b.z)).toBeLessThan(60);
    // Roughly the straight-line distance plus a few blocks, never a wild detour.
    const crow = Math.hypot(b.x - a.x, b.z - a.z);
    expect(route.length).toBeGreaterThan(crow * 0.99);
    expect(route.length).toBeLessThan(crow * 1.5);
    expect(route.seconds).toBeGreaterThan(60);
    expect(route.seconds).toBeLessThan(240);
    // Every vertex lies on the road network.
    for (const [x, z] of route.points) expect(router.snap(x, z)!.dist).toBeLessThan(0.05);
  });

  it('routes between every pair of mainland places in the first ten minutes', () => {
    const ids = ['ofelias', 'boardwalk', 'sodAlmighty', 'palmettoPlaza', 'theLot', 'mamaYolis'] as const;
    for (const from of ids) {
      for (const to of ids) {
        if (from === to) continue;
        const a = PLACE_SPOTS[from], b = PLACE_SPOTS[to];
        expect(router.route(a.x, a.z, b.x, b.z), `${from} → ${to}`).not.toBeNull();
      }
    }
  });

  it('a route along one street stays on it', () => {
    const r = router.route(600, 469, 700, 471)!;
    expect(r.points.length).toBe(2);
    expect(r.length).toBeCloseTo(100, 0);
  });
});
