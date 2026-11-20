import { describe, expect, it } from 'vitest';
import { PLACE_IDS, PLACES } from '@/content/places';
import { districtAt } from '@/world/plan/districts';
import { PLACE_SPOTS, placeAt } from '@/world/places';

describe('place spots', () => {
  it('every place has a spot inside its own district', () => {
    const wrong: string[] = [];
    for (const id of PLACE_IDS) {
      const s = PLACE_SPOTS[id];
      const d = districtAt(s.x, s.z);
      if (d !== PLACES[id].district) wrong.push(`${id}: spot is in ${d}, place says ${PLACES[id].district}`);
    }
    expect(wrong).toEqual([]);
  });

  it('spots do not overlap, so placeAt is unambiguous at every centre', () => {
    for (const id of PLACE_IDS) {
      const s = PLACE_SPOTS[id];
      expect(placeAt(s.x, s.z)).toBe(id);
    }
  });

  it('placeAt returns null between places', () => {
    expect(placeAt(2000, 2000)).toBeNull();
  });
});
