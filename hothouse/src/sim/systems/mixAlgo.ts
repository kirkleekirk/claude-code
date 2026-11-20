import { ADDITIVES, type AdditiveId } from '@/content/additives';
import { APEX_OF, EFFECTS, EFFECT_ORDER, sortEffects, type EffectId } from '@/content/effects';
import { ruleFor } from '@/content/mixRules';

/**
 * The mixing algorithm, pure and deterministic (no state, no randomness):
 *
 * 1. Every effect on the product is checked against the additive's rules simultaneously.
 *    Apex effects are stable and never transform.
 * 2. If two effects land on the same base effect, they fuse into that family's Apex — once per
 *    additive step. Later collisions in the same step just merge.
 * 3. If there is room under the cap, the additive's own effect is added.
 */

export type StepSource = 'kept' | 'transformed' | 'added' | 'fused';

export interface StepEffect {
  effect: EffectId;
  source: StepSource;
  /** Original effect for transforms and fusions (first source). */
  from: EffectId | null;
}

export interface StepResult {
  effects: StepEffect[];
  fused: EffectId | null;
  /** `${additive}:${effect}` for every effect the additive met (rule or not). */
  tried: string[];
  /** Rule ids that actually fired. */
  fired: string[];
}

export function applyAdditive(effects: readonly EffectId[], additive: AdditiveId, cap: number): StepResult {
  const input = sortEffects(effects);
  const tried: string[] = [];
  const fired: string[] = [];
  const moves: Array<{ from: EffectId; to: EffectId | null; transformed: boolean }> = [];
  for (const e of input) {
    tried.push(`${additive}:${e}`);
    const rule = EFFECTS[e].kind === 'apex' ? undefined : ruleFor(additive, e);
    if (rule) {
      fired.push(rule.id);
      moves.push({ from: e, to: rule.to, transformed: true });
    } else {
      moves.push({ from: e, to: e, transformed: false });
    }
  }

  // Group by destination in canonical order so resolution never depends on input order.
  const groups = new Map<EffectId, Array<{ from: EffectId; transformed: boolean }>>();
  for (const m of moves) {
    if (!m.to) continue;
    const g = groups.get(m.to);
    if (g) g.push(m);
    else groups.set(m.to, [m]);
  }
  const targets = [...groups.keys()].sort((a, b) => EFFECT_ORDER[a] - EFFECT_ORDER[b]);
  const out: StepEffect[] = [];
  const has = (e: EffectId) => out.some((x) => x.effect === e);
  let fused: EffectId | null = null;
  for (const target of targets) {
    const sources = groups.get(target)!;
    const def = EFFECTS[target];
    if (sources.length >= 2 && fused === null && def.kind === 'base' && def.family) {
      const apex = APEX_OF[def.family];
      if (!input.includes(apex)) {
        fused = apex;
        if (!has(apex)) out.push({ effect: apex, source: 'fused', from: sources[0]!.from });
        continue;
      }
    }
    if (has(target)) continue;
    const moved = sources.find((s) => s.transformed);
    const keptSelf = sources.find((s) => !s.transformed);
    out.push(keptSelf ? { effect: target, source: 'kept', from: null } : { effect: target, source: 'transformed', from: moved!.from });
  }
  const own = ADDITIVES[additive].adds;
  if (!has(own) && out.length < cap) out.push({ effect: own, source: 'added', from: null });
  out.sort((a, b) => EFFECT_ORDER[a.effect] - EFFECT_ORDER[b.effect]);
  return { effects: out, fused, tried, fired };
}

export interface MixRun {
  effects: EffectId[];
  /** First fusion across all steps (the reveal shows it). */
  fused: EffectId | null;
  tried: string[];
  fired: string[];
}

/** Apply additives in order. */
export function applyMix(effects: readonly EffectId[], additives: readonly AdditiveId[], cap: number): MixRun {
  let cur: EffectId[] = sortEffects(effects);
  let fused: EffectId | null = null;
  const tried: string[] = [];
  const fired: string[] = [];
  for (const a of additives) {
    const step = applyAdditive(cur, a, cap);
    cur = step.effects.map((s) => s.effect);
    if (!fused && step.fused) fused = step.fused;
    tried.push(...step.tried);
    fired.push(...step.fired);
  }
  return { effects: cur, fused, tried, fired };
}
