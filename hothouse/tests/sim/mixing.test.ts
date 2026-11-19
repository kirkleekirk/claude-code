import { describe, expect, it } from 'vitest';
import { ADDITIVES, ADDITIVE_IDS, type AdditiveId } from '@/content/additives';
import { APEX_EFFECT_IDS, BASE_EFFECT_IDS, EFFECTS, EFFECT_IDS, type EffectId } from '@/content/effects';
import { HARMONIES, HARMONY_IDS, MIX_RULES } from '@/content/mixRules';
import { STRAINS, STRAIN_IDS } from '@/content/strains';
import { harmonyOf } from '@/sim/products';
import { applyAdditive, applyMix } from '@/sim/systems/mixAlgo';

describe('rule table', () => {
  it('has at least 60 rules, unique per additive and effect, all ids valid', () => {
    expect(MIX_RULES.length).toBeGreaterThanOrEqual(60);
    const ids = new Set(MIX_RULES.map((r) => r.id));
    expect(ids.size).toBe(MIX_RULES.length);
    for (const r of MIX_RULES) {
      expect(ADDITIVE_IDS).toContain(r.additive);
      expect(EFFECT_IDS).toContain(r.from);
      if (r.to !== null) expect(EFFECT_IDS).toContain(r.to);
      expect(r.from).not.toBe(r.to);
      // Apex effects are only reachable by fusion.
      expect(APEX_EFFECT_IDS as readonly string[]).not.toContain(r.to);
      expect(APEX_EFFECT_IDS as readonly string[]).not.toContain(r.from);
    }
  });

  it('every additive has rules and adds a base effect', () => {
    for (const a of ADDITIVE_IDS) {
      expect(MIX_RULES.filter((r) => r.additive === a).length).toBeGreaterThanOrEqual(4);
      expect(BASE_EFFECT_IDS as readonly string[]).toContain(ADDITIVES[a].adds);
    }
  });

  it('has the right effect families and counts', () => {
    expect(BASE_EFFECT_IDS.length).toBe(16);
    expect(APEX_EFFECT_IDS.length).toBe(4);
    expect(ADDITIVE_IDS.length).toBe(14);
    for (const e of BASE_EFFECT_IDS) expect(EFFECTS[e].family).not.toBeNull();
  });
});

describe('mixing algorithm', () => {
  const run = (effects: EffectId[], adds: AdditiveId[], cap = 3) => applyMix(effects, adds, cap);

  it('first prologue mix: Abuela’s Blush + honey adds Mellow Tide', () => {
    const r = run(['sunkissed'], ['honey']);
    expect(r.effects).toEqual(['sunkissed', 'mellowTide']);
    expect(r.fused).toBeNull();
  });

  it('Golden Hour: Blush + honey + sea salt fuses', () => {
    const r = run(['sunkissed'], ['honey', 'seaSalt']);
    expect(r.fused).toBe('goldenHour');
    expect(r.effects).toContain('goldenHour');
  });

  it('Main Character: Flamingo Fever + blood orange + key lime', () => {
    const r = run([STRAINS.flamingoFever.effect], ['bloodOrange', 'keyLime']);
    expect(r.fused).toBe('mainCharacter');
  });

  it('Galaxy Brain: Lighthouse Lime + cafecito + volt', () => {
    const r = run([STRAINS.lighthouseLime.effect], ['cafecito', 'volt']);
    expect(r.fused).toBe('galaxyBrain');
  });

  it('Mermaid Mode: Swamp Halo + firefly sugar + mystery bait', () => {
    const r = run([STRAINS.swampHalo.effect], ['fireflySugar', 'mysteryBait']);
    expect(r.fused).toBe('mermaidMode');
  });

  it('briny additives cancel duds', () => {
    expect(applyAdditive(['heebieJeebies', 'giggles'], 'pickleBrine', 3).effects.map((e) => e.effect)).not.toContain('heebieJeebies');
    expect(applyAdditive(['swampFunk', 'giggles'], 'seaSalt', 3).effects.map((e) => e.effect)).not.toContain('swampFunk');
  });

  it('respects the effect cap and never duplicates effects', () => {
    for (const a of ADDITIVE_IDS) {
      for (const b of ADDITIVE_IDS) {
        const r = run(['sunkissed', 'giggles', 'nightOwl'], [a, b], 3);
        expect(r.effects.length).toBeLessThanOrEqual(3);
        expect(new Set(r.effects).size).toBe(r.effects.length);
      }
    }
  });

  it('is deterministic regardless of input order', () => {
    const a = applyAdditive(['giggles', 'chatty', 'bold'], 'keyLime', 4);
    const b = applyAdditive(['bold', 'giggles', 'chatty'], 'keyLime', 4);
    expect(a).toEqual(b);
  });

  it('fuses at most once per additive step', () => {
    for (const a of ADDITIVE_IDS) {
      const r = applyAdditive(BASE_EFFECT_IDS.slice(0, 5) as EffectId[], a, 5);
      expect(r.effects.filter((e) => EFFECTS[e.effect].kind === 'apex').length).toBeLessThanOrEqual(1);
    }
  });

  it('every Apex and every harmony is reachable from a base strain within three additives', () => {
    const reached = new Set<string>();
    const apexes = new Set<string>();
    const seen = new Set<string>();
    const frontier: Array<{ effects: EffectId[]; depth: number }> = STRAIN_IDS.map((s) => ({ effects: [STRAINS[s].effect], depth: 0 }));
    for (const cap of [3, 4, 5]) {
      const queue = frontier.map((f) => ({ ...f }));
      while (queue.length) {
        const cur = queue.shift()!;
        const key = `${cap}|${cur.effects.join('+')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const h = harmonyOf(cur.effects);
        if (h) reached.add(h);
        for (const e of cur.effects) if (EFFECTS[e].kind === 'apex') apexes.add(e);
        if (cur.depth >= 3) continue;
        for (const a of ADDITIVE_IDS) queue.push({ effects: applyAdditive(cur.effects, a, cap).effects.map((x) => x.effect), depth: cur.depth + 1 });
      }
    }
    for (const apex of APEX_EFFECT_IDS) expect(apexes).toContain(apex);
    const missing = HARMONY_IDS.filter((h) => !reached.has(h) && HARMONIES[h].apexCount === undefined);
    expect(missing).toEqual([]);
  });
});
