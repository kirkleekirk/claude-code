import type { AdditiveId } from '@/content/additives';
import { EFFECTS, sortEffects, type EffectId } from '@/content/effects';
import type { Tier } from '@/content/ids';
import { HARMONIES, HARMONY_IDS, type HarmonyId } from '@/content/mixRules';
import type { StrainId } from '@/content/strains';
import type { ProductId, ProductState, StackId } from './api';
import { MIX, QUALITY_MULT } from './balance';
import type { SimCtx } from './ctx';

/**
 * Product identity, naming and value. A product is (tier, strain, effect set); quality lives on
 * inventory stacks (`product*stars`) so the same product can be sold at different grades.
 */

const TIER_LETTER: Readonly<Record<Tier, string>> = { bloom: 'b', dew: 'd', halos: 'h' };
const LETTER_TIER: Readonly<Record<string, Tier>> = { b: 'bloom', d: 'dew', h: 'halos' };

export function productId(tier: Tier, strain: StrainId, effects: readonly EffectId[]): ProductId {
  return `${TIER_LETTER[tier]}.${strain}.${sortEffects(effects).join('+')}`;
}

export function parseProduct(id: ProductId): { tier: Tier; strain: StrainId; effects: EffectId[] } | null {
  const parts = id.split('.');
  if (parts.length !== 3) return null;
  const tier = LETTER_TIER[parts[0]!];
  if (!tier) return null;
  const effects = parts[2] ? (parts[2].split('+') as EffectId[]) : [];
  if (effects.some((e) => !(e in EFFECTS))) return null;
  return { tier, strain: parts[1] as StrainId, effects };
}

export function stackId(product: ProductId, stars: number): StackId {
  return `${product}*${Math.min(5, Math.max(1, Math.round(stars)))}`;
}

export function parseStack(stack: StackId): { product: ProductId; stars: number } | null {
  const i = stack.lastIndexOf('*');
  if (i <= 0) return null;
  const stars = Number(stack.slice(i + 1));
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return null;
  return { product: stack.slice(0, i), stars };
}

/** The best harmony the effect set completes, if any. */
export function harmonyOf(effects: readonly EffectId[]): HarmonyId | null {
  let best: HarmonyId | null = null;
  let bestMult = 1;
  const apex = effects.filter((e) => EFFECTS[e].kind === 'apex').length;
  for (const id of HARMONY_IDS) {
    const h = HARMONIES[id];
    const hit = h.apexCount !== undefined ? apex >= h.apexCount : h.effects.every((e) => effects.includes(e));
    if (hit && h.multiplier > bestMult) {
      best = id;
      bestMult = h.multiplier;
    }
  }
  return best;
}

/** Effects ordered by prominence: Apex first, then by value. */
export function dominant(effects: readonly EffectId[]): EffectId[] {
  return [...effects].sort((a, b) => {
    const ka = EFFECTS[a].kind === 'apex' ? 1 : 0;
    const kb = EFFECTS[b].kind === 'apex' ? 1 : 0;
    return kb - ka || EFFECTS[b].value - EFFECTS[a].value || a.localeCompare(b);
  });
}

const WORDS: Readonly<Record<EffectId, readonly [adjective: string, noun: string]>> = {
  chatty: ['Chatty', 'Gossip'], giggles: ['Giggly', 'Giggle'], bold: ['Brassy', 'Brass'], discoFeet: ['Disco', 'Boogie'],
  sunkissed: ['Sunny', 'Sun'], mellowTide: ['Mellow', 'Tide'], couchGravity: ['Lazy', 'Couch'], electric: ['Electric', 'Volt'],
  laserFocus: ['Laser', 'Focus'], dreamy: ['Dreamy', 'Dream'], nightOwl: ['Midnight', 'Owl'], nostalgic: ['Retro', 'Rewind'],
  thirdEye: ['Mystic', 'Eye'], shimmer: ['Glitter', 'Shimmer'], slowMo: ['Slow', 'Drift'], glowtongue: ['Dolphin', 'Glow'],
  mainCharacter: ['Starring', 'Star'], goldenHour: ['Golden', 'Gold'], galaxyBrain: ['Cosmic', 'Galaxy'], mermaidMode: ['Mermaid', 'Siren'],
  heebieJeebies: ['Jittery', 'Jitters'], swampFunk: ['Funky', 'Funk'],
};

const TIER_SUFFIX: Readonly<Record<Tier, string>> = { bloom: '', dew: ' Dew', halos: ' Halos' };

/** A generated, deterministic product name. Players can rename products. */
export function productName(ctx: SimCtx, tier: Tier, strain: StrainId, effects: readonly EffectId[], raw: boolean): string {
  const s = ctx.strain(strain);
  const short = s?.short ?? 'Bloom';
  const suffix = TIER_SUFFIX[tier];
  if (raw && s) return `${s.name}${suffix}`;
  const harmony = harmonyOf(effects);
  if (harmony) return `${HARMONIES[harmony].name} ${short}${suffix}`;
  const d = dominant(effects);
  if (d.length === 0) return `Plain ${short}${suffix}`;
  if (d.length === 1) return `${WORDS[d[0]!][0]} ${short}${suffix}`;
  return `${WORDS[d[0]!][0]} ${short} ${WORDS[d[1]!][1]}${suffix}`;
}

/** Value per unit before any customer adjustments. */
export function productValue(ctx: SimCtx, tier: Tier, strain: StrainId, effects: readonly EffectId[], stars: number): number {
  const s = ctx.strain(strain);
  if (!s) return 0;
  let eff = 0;
  for (const e of effects) eff += EFFECTS[e].value;
  const harmony = harmonyOf(effects);
  const hm = harmony ? HARMONIES[harmony].multiplier : 1;
  const brand = ctx.state.brand;
  const bm = brand ? (1 + brand.hype / 200) * (ctx.content.brand.packaging[brand.packaging]?.value ?? 1) : 1;
  const q = QUALITY_MULT[Math.min(5, Math.max(1, stars))]!;
  return s.value * s.appeal * q * Math.max(0.2, 1 + eff) * hm * MIX.tierValue[tier] * bm;
}

export function stackValue(ctx: SimCtx, stack: StackId): number {
  const st = parseStack(stack);
  if (!st) return 0;
  const p = parseProduct(st.product);
  if (!p) return 0;
  return productValue(ctx, p.tier, p.strain, p.effects, st.stars);
}

/** Register a product the first time it exists. */
export function ensureProduct(
  ctx: SimCtx, tier: Tier, strain: StrainId, effects: readonly EffectId[], base: ProductId | null, additives: readonly AdditiveId[],
): { product: ProductState; isNew: boolean } {
  const id = productId(tier, strain, effects);
  const existing = ctx.state.products[id];
  if (existing) return { product: existing, isNew: false };
  const sorted = sortEffects(effects);
  const raw = base === null && tier === 'bloom';
  const product: ProductState = {
    id, tier, strain, effects: sorted,
    name: productName(ctx, tier, strain, sorted, raw),
    customName: false, base, additives: [...additives], harmony: harmonyOf(sorted),
    discoveredAt: ctx.now, made: 0, sold: 0, favorite: false, page: null,
  };
  ctx.state.products[id] = product;
  ctx.bump('products');
  return { product, isNew: true };
}

export function productOfStack(ctx: SimCtx, stack: StackId): ProductState | null {
  const st = parseStack(stack);
  return st ? (ctx.state.products[st.product] ?? null) : null;
}
