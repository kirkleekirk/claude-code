import type { PropertyId, StationKind } from '@/content/ids';
import { footprint, type PlaceableEffects } from '@/content/placeables';
import type { Placement, PlantState, PotId } from '../api';
import { GROW } from '../balance';
import type { SimCtx } from '../ctx';

/**
 * Derived facts about a property's layout: pots, stations, capacities and the summed effects of
 * placeables and upgrade tracks. Pure reads over state; cheap enough to call per command.
 */

export function placements(ctx: SimCtx, prop: PropertyId): readonly Placement[] {
  return ctx.state.properties[prop].layout;
}

export function potsOf(ctx: SimCtx, prop: PropertyId): PotId[] {
  const out: PotId[] = [];
  for (const pl of placements(ctx, prop)) {
    const pots = ctx.content.placeables[pl.item].effects.pots ?? 0;
    for (let i = 0; i < pots; i++) out.push(`${pl.id}:${i}`);
  }
  return out;
}

export function plantAt(ctx: SimCtx, pot: PotId): PlantState | null {
  for (const id in ctx.state.plants) {
    const p = ctx.state.plants[id]!;
    if (p.pot === pot) return p;
  }
  return null;
}

export function plantsAt(ctx: SimCtx, prop: PropertyId): PlantState[] {
  const out: PlantState[] = [];
  for (const id in ctx.state.plants) {
    const p = ctx.state.plants[id]!;
    if (p.property === prop) out.push(p);
  }
  return out;
}

export function emptyPots(ctx: SimCtx, prop: PropertyId): PotId[] {
  const taken = new Set(plantsAt(ctx, prop).map((p) => p.pot));
  return potsOf(ctx, prop).filter((pot) => !taken.has(pot));
}

export function stationsOf(ctx: SimCtx, prop: PropertyId): StationKind[] {
  const out = new Set<StationKind>();
  for (const pl of placements(ctx, prop)) {
    const st = ctx.content.placeables[pl.item].effects.station;
    if (st) out.add(st);
  }
  return [...out];
}

export function stationCount(ctx: SimCtx, prop: PropertyId, kind: StationKind): number {
  let n = 0;
  for (const pl of placements(ctx, prop)) if (ctx.content.placeables[pl.item].effects.station === kind) n++;
  return n;
}

export function hasStation(ctx: SimCtx, prop: PropertyId, kind: StationKind): boolean {
  return stationCount(ctx, prop, kind) > 0;
}

export function stationPlacement(ctx: SimCtx, prop: PropertyId, kind: StationKind): Placement | null {
  return placements(ctx, prop).find((pl) => ctx.content.placeables[pl.item].effects.station === kind) ?? null;
}

type NumericEffect = Exclude<keyof PlaceableEffects, 'station'>;

export function sumEffect(ctx: SimCtx, prop: PropertyId, key: NumericEffect): number {
  let n = 0;
  for (const pl of placements(ctx, prop)) n += ctx.content.placeables[pl.item].effects[key] ?? 0;
  return n;
}

export function stashCapacity(ctx: SimCtx, prop: PropertyId): number {
  const st = ctx.state.properties[prop];
  return ctx.content.properties[prop].stash + sumEffect(ctx, prop, 'stash') + st.tracks.capacity * 50;
}

export function crewSlots(ctx: SimCtx, prop: PropertyId): number {
  return ctx.content.properties[prop].crew + ctx.state.properties[prop].tracks.capacity;
}

/** Growth speed multiplier from climate (placeables + track) and power. */
export function growthSpeed(ctx: SimCtx, prop: PropertyId): number {
  const st = ctx.state.properties[prop];
  const climate = Math.min(GROW.climateCap, sumEffect(ctx, prop, 'climate') + st.tracks.climate * 3);
  return (1 + climate * GROW.climatePerPoint) * (1 + st.tracks.power * GROW.powerPerLevel);
}

export function qualityBonus(ctx: SimCtx, prop: PropertyId): number {
  const st = ctx.state.properties[prop];
  return Math.min(GROW.placeableQualityCap, sumEffect(ctx, prop, 'quality')) + st.tracks.climate * GROW.climateTrackPerLevel + ctx.upgradeMods().quality;
}

export function yieldBonus(ctx: SimCtx, prop: PropertyId): number {
  return Math.min(GROW.placeableYieldCap, sumEffect(ctx, prop, 'yield'));
}

/** Station speed multiplier from power and placeables like the espresso machine. */
export function workSpeed(ctx: SimCtx, prop: PropertyId): number {
  const st = ctx.state.properties[prop];
  let mult = 1 + st.tracks.power * GROW.powerPerLevel;
  for (const pl of placements(ctx, prop)) mult *= ctx.content.placeables[pl.item].effects.mixSpeed ?? 1;
  return mult;
}

export function moraleBonus(ctx: SimCtx, prop: PropertyId): number {
  const raw = sumEffect(ctx, prop, 'morale') + ctx.state.properties[prop].tracks.style * 3;
  // Diminishing returns past 30 so a room full of couches is not mandatory.
  return raw <= 30 ? raw : 30 + (raw - 30) * 0.4;
}

export function stylePoints(ctx: SimCtx, prop: PropertyId): number {
  return sumEffect(ctx, prop, 'style') + ctx.state.properties[prop].tracks.style * 10;
}

/** 0 ramshackle · 1 tidy · 2 gleaming */
export function visualState(ctx: SimCtx, prop: PropertyId): 0 | 1 | 2 {
  const s = stylePoints(ctx, prop);
  return s >= 30 ? 2 : s >= 10 ? 1 : 0;
}

/** Cells covered by a placement. */
export function cellsOf(ctx: SimCtx, pl: Pick<Placement, 'item' | 'x' | 'y' | 'rot'>): Array<[number, number]> {
  const def = ctx.content.placeables[pl.item];
  const { w, h } = footprint(def, pl.rot);
  const out: Array<[number, number]> = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push([pl.x + dx, pl.y + dy]);
  return out;
}
