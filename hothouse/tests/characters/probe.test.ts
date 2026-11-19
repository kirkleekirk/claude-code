import { describe, expect, it } from 'vitest';
import { HAIR_STYLES, OUTFITS, randomAppearance } from '@/content/appearance';
import { Rng } from '@/core/rng';
import { buildPerson } from '@/characters/geometry/build';

describe('person geometry', () => {
  it('builds every hair style and outfit without NaN and within the vertex budget', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 120; i++) {
      const a = randomAppearance(rng);
      a.hair = i % HAIR_STYLES.length;
      a.outfit = (i * 7) % OUTFITS.length;
      const g = buildPerson(a);
      const pos = g.geometry.getAttribute('position').array as Float32Array;
      const nrm = g.geometry.getAttribute('normal').array as Float32Array;
      for (let k = 0; k < pos.length; k++) expect(Number.isFinite(pos[k]!)).toBe(true);
      for (let k = 0; k < nrm.length; k++) expect(Number.isFinite(nrm[k]!)).toBe(true);
      expect(g.vertices).toBeLessThan(6500);
    }
  });
});
