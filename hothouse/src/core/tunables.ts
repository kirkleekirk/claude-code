/**
 * Live-tunable configuration. Systems declare a group once and read plain fields from the returned
 * object in hot paths; the debug tuning panel enumerates every group and edits values in place.
 *
 * ```ts
 * const cfg = tunables.group('camera.chase', {
 *   distance: { value: 6.2, min: 3, max: 12, step: 0.1 },
 *   lookAhead: 0.35,          // shorthand: range is inferred
 *   shake: true,
 *   tint: '#FF9A3C',
 * });
 * camera.position.z = cfg.distance;
 * ```
 */

export interface NumberSpec {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

export type TunableSpec = number | boolean | string | NumberSpec;

export type TunableValues<T extends Record<string, TunableSpec>> = {
  -readonly [K in keyof T]: T[K] extends NumberSpec
    ? number
    : T[K] extends number
      ? number
      : T[K] extends boolean
        ? boolean
        : string;
};

export interface TunableField {
  readonly key: string;
  readonly kind: 'number' | 'boolean' | 'color' | 'text';
  readonly initial: number | boolean | string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label: string;
}

export interface TunableGroup {
  readonly name: string;
  readonly fields: readonly TunableField[];
  readonly values: Record<string, number | boolean | string>;
}

type Listener = (group: string, key: string, value: number | boolean | string) => void;

const groups = new Map<string, TunableGroup>();
const listeners = new Set<Listener>();

function inferRange(v: number): { min: number; max: number; step: number } {
  if (v === 0) return { min: -1, max: 1, step: 0.01 };
  const mag = Math.abs(v);
  const max = mag * 3;
  const step = mag >= 100 ? 1 : mag >= 10 ? 0.1 : mag >= 1 ? 0.01 : 0.001;
  return { min: v < 0 ? -max : 0, max: v < 0 ? 0 : max, step };
}

const isNumberSpec = (s: TunableSpec): s is NumberSpec => typeof s === 'object';

export const tunables = {
  group<const T extends Record<string, TunableSpec>>(name: string, spec: T): TunableValues<T> {
    const existing = groups.get(name);
    if (existing) return existing.values as TunableValues<T>;
    const fields: TunableField[] = [];
    const values: Record<string, number | boolean | string> = {};
    for (const [key, raw] of Object.entries(spec)) {
      if (typeof raw === 'boolean') {
        fields.push({ key, kind: 'boolean', initial: raw, min: 0, max: 1, step: 1, label: key });
        values[key] = raw;
      } else if (typeof raw === 'string') {
        const kind = /^#[0-9a-f]{6}$/i.test(raw) ? 'color' : 'text';
        fields.push({ key, kind, initial: raw, min: 0, max: 0, step: 0, label: key });
        values[key] = raw;
      } else {
        const value = isNumberSpec(raw) ? raw.value : raw;
        const inferred = inferRange(value);
        fields.push({
          key,
          kind: 'number',
          initial: value,
          min: isNumberSpec(raw) && raw.min !== undefined ? raw.min : inferred.min,
          max: isNumberSpec(raw) && raw.max !== undefined ? raw.max : inferred.max,
          step: isNumberSpec(raw) && raw.step !== undefined ? raw.step : inferred.step,
          label: (isNumberSpec(raw) && raw.label) || key,
        });
        values[key] = value;
      }
    }
    groups.set(name, { name, fields, values });
    return values as TunableValues<T>;
  },

  groups(): TunableGroup[] {
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  },

  set(group: string, key: string, value: number | boolean | string): boolean {
    const g = groups.get(group);
    if (!g || !(key in g.values)) return false;
    g.values[key] = value;
    for (const l of listeners) l(group, key, value);
    return true;
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Values that differ from their declared defaults, for pasting back into config. */
  exportChanged(): Record<string, Record<string, number | boolean | string>> {
    const out: Record<string, Record<string, number | boolean | string>> = {};
    for (const g of groups.values()) {
      for (const f of g.fields) {
        const v = g.values[f.key]!;
        if (v !== f.initial) (out[g.name] ??= {})[f.key] = v;
      }
    }
    return out;
  },

  apply(data: Record<string, Record<string, number | boolean | string>>): void {
    for (const [group, kv] of Object.entries(data)) {
      for (const [key, value] of Object.entries(kv)) this.set(group, key, value);
    }
  },

  reset(group?: string): void {
    for (const g of groups.values()) {
      if (group && g.name !== group) continue;
      for (const f of g.fields) this.set(g.name, f.key, f.initial);
    }
  },
};
