import { describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_IDS, CONTEXTS, type ActionGroup, type Source } from '@/input';

const sourceKey = (s: Source): string => {
  switch (s.k) {
    case 'key':
      return `key:${s.code}`;
    case 'mouse':
      return `mouse:${s.button}`;
    case 'pad':
      return `pad:${s.button}`;
    case 'axis':
      return `axis:${s.axis}:${s.dir}`;
  }
};

/** Pairs of actions that intentionally share a binding inside one context. */
const ALLOWED_SHARED = new Set<string>([
  // Movement and steering read the same keys; they are never live together (foot vs vehicle) but
  // `look` is live in both and uses the right stick only.
]);

describe('action map', () => {
  it('every action has at least one binding per device or is pad-free by design', () => {
    for (const id of ACTION_IDS) {
      const a = ACTIONS[id];
      const kbm = a.kbm.pos.length + (('neg' in a.kbm && a.kbm.neg?.length) || 0);
      const pad = a.pad.pos.length + (('neg' in a.pad && a.pad.neg?.length) || 0);
      expect(kbm + pad, id).toBeGreaterThan(0);
    }
  });

  it('no two actions live in the same context share a binding on the same device', () => {
    const problems: string[] = [];
    for (const [ctx, groups] of Object.entries(CONTEXTS) as Array<[string, readonly ActionGroup[]]>) {
      for (const device of ['kbm', 'pad'] as const) {
        const owners = new Map<string, string>();
        for (const id of ACTION_IDS) {
          const a = ACTIONS[id];
          if (!groups.includes(a.group)) continue;
          const b = a[device];
          const sources = [...b.pos, ...(('neg' in b && b.neg) || [])];
          for (const s of new Set(sources.map(sourceKey))) {
            const prev = owners.get(s);
            if (prev && !ALLOWED_SHARED.has(`${prev}|${id}`)) problems.push(`${ctx}/${device}: ${s} → ${prev} and ${id}`);
            owners.set(s, id);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
