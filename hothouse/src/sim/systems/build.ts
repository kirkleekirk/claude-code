import { fail, ok } from '@/core/types';
import type { PlaceableId, PropertyId } from '@/content/ids';
import type { Placement, PlacementId, SimResult } from '../api';
import type { SimCtx } from '../ctx';
import { PROPERTY_PREFIX } from '../state';
import { t } from '../strings';
import { cellsOf, potsOf } from './layout';
import { rankLock, unlockLock } from './progression';

/**
 * Build Mode: grid placement with validity reasons, instant refunds for this session's placements,
 * and the Flow Score (how short the crew's walks between stations are).
 */

type Rot = 0 | 1 | 2 | 3;

const key = (x: number, y: number) => `${x},${y}`;

function occupied(ctx: SimCtx, prop: PropertyId, except: PlacementId | null): Set<string> {
  const out = new Set<string>();
  for (const pl of ctx.state.properties[prop].layout) {
    if (pl.id === except) continue;
    for (const [x, y] of cellsOf(ctx, pl)) out.add(key(x, y));
  }
  return out;
}

/** Every placement must stay reachable from the first door through free cells. */
function reachable(ctx: SimCtx, prop: PropertyId, layout: ReadonlyArray<Pick<Placement, 'item' | 'x' | 'y' | 'rot'>>): boolean {
  const def = ctx.content.properties[prop];
  const { w, h } = def.grid;
  const blocked = new Set<string>(def.blocked.map(([x, y]) => key(x, y)));
  for (const pl of layout) for (const [x, y] of cellsOf(ctx, pl)) blocked.add(key(x, y));
  const start = def.doors[0];
  if (!start) return true;
  const seen = new Set<string>([key(start[0], start[1])]);
  const queue: Array<[number, number]> = [[start[0], start[1]]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  for (const [x, y] of def.doors) if (!seen.has(key(x, y))) return false;
  for (const pl of layout) {
    const touches = cellsOf(ctx, pl).some(([x, y]) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key(x + dx!, y + dy!))),
    );
    if (!touches) return false;
  }
  return true;
}

export function canPlace(ctx: SimCtx, prop: PropertyId, item: PlaceableId, x: number, y: number, rot: Rot, except: PlacementId | null = null): SimResult {
  const st = ctx.state.properties[prop];
  const def = ctx.content.placeables[item];
  if (!st || !def) return fail('notFound');
  if (!st.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[prop].name }));
  if (except === null) {
    const r = rankLock(ctx, def.rank);
    if (r.locked) return fail('locked', r.reason ?? undefined);
    if (def.unlock) {
      const u = unlockLock(ctx, def.unlock);
      if (u.locked) return fail('locked', u.reason ?? undefined);
    }
    if (def.max !== undefined && st.layout.filter((p) => p.item === item).length >= def.max) return fail('full', t('maxPlaced', { n: def.max }));
  }
  if (![0, 1, 2, 3].includes(rot) || !Number.isInteger(x) || !Number.isInteger(y)) return fail('invalid');
  const pdef = ctx.content.properties[prop];
  const cells = cellsOf(ctx, { item, x, y, rot });
  const taken = occupied(ctx, prop, except);
  const blocked = new Set(pdef.blocked.map(([bx, by]) => key(bx, by)));
  const doors = new Set(pdef.doors.map(([dx, dy]) => key(dx, dy)));
  for (const [cx, cy] of cells) {
    if (cx < 0 || cy < 0 || cx >= pdef.grid.w || cy >= pdef.grid.h || blocked.has(key(cx, cy))) return fail('blocked', t('outside'));
    if (doors.has(key(cx, cy))) return fail('blocked', t('blocksDoor'));
    if (taken.has(key(cx, cy))) return fail('occupied', t('overlap'));
  }
  const layout = st.layout.filter((p) => p.id !== except).concat([{ id: '_new', item, x, y, rot, placedAt: 0 }]);
  if (!reachable(ctx, prop, layout)) return fail('blocked', t('blocksPath'));
  return ok(undefined);
}

export function beginBuild(ctx: SimCtx, prop: PropertyId): SimResult {
  const st = ctx.state.properties[prop];
  if (!st?.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[prop]?.name ?? '' }));
  st.buildSession = [];
  ctx.bump('properties');
  return ok(undefined);
}

export function endBuild(ctx: SimCtx, prop: PropertyId): SimResult {
  const st = ctx.state.properties[prop];
  if (!st) return fail('notFound');
  st.buildSession = null;
  st.flowScore = flowScore(ctx, prop).score;
  ctx.bump('properties');
  return ok(undefined);
}

export function place(ctx: SimCtx, prop: PropertyId, item: PlaceableId, x: number, y: number, rot: Rot): SimResult<PlacementId> {
  const check = canPlace(ctx, prop, item, x, y, rot);
  if (!check.ok) return check;
  const def = ctx.content.placeables[item];
  const paid = ctx.pay(def.cost, 'any', 'build');
  if (!paid.ok) return paid;
  const st = ctx.state.properties[prop];
  const id = `${PROPERTY_PREFIX[prop]}${st.nextPlacement++}`;
  st.layout.push({ id, item, x, y, rot, placedAt: ctx.now });
  st.buildSession?.push(id);
  st.flowScore = flowScore(ctx, prop).score;
  ctx.emit('sim:built', { property: prop, placement: id, item, change: 'placed' });
  ctx.bump('properties');
  return ok(id);
}

export function move(ctx: SimCtx, prop: PropertyId, placement: PlacementId, x: number, y: number, rot: Rot): SimResult {
  const st = ctx.state.properties[prop];
  const pl = st?.layout.find((p) => p.id === placement);
  if (!st || !pl) return fail('notFound');
  const check = canPlace(ctx, prop, pl.item, x, y, rot, placement);
  if (!check.ok) return check;
  pl.x = x;
  pl.y = y;
  pl.rot = rot;
  st.flowScore = flowScore(ctx, prop).score;
  ctx.emit('sim:built', { property: prop, placement, item: pl.item, change: 'moved' });
  ctx.bump('properties');
  return ok(undefined);
}

export function remove(ctx: SimCtx, prop: PropertyId, placement: PlacementId): SimResult<{ refund: number }> {
  const st = ctx.state.properties[prop];
  const i = st?.layout.findIndex((p) => p.id === placement) ?? -1;
  if (!st || i < 0) return fail('notFound');
  const pl = st.layout[i]!;
  const pots = new Set(potsOf(ctx, prop).filter((p) => p.startsWith(`${placement}:`)));
  if (Object.values(ctx.state.plants).some((p) => pots.has(p.pot))) return fail('occupied', t('clearPlantsFirst'));
  const station = ctx.content.placeables[pl.item].effects.station;
  if (station && ctx.state.jobs.some((j) => j.property === prop && j.station === station)) {
    const others = st.layout.filter((p) => p.id !== placement && ctx.content.placeables[p.item].effects.station === station).length;
    if (others === 0) return fail('busy', t('finishJobsFirst'));
  }
  st.layout.splice(i, 1);
  const def = ctx.content.placeables[pl.item];
  const fresh = st.buildSession?.includes(placement) ?? false;
  const refund = Math.round(def.cost * (fresh ? 1 : 0.5));
  if (refund > 0) ctx.earn(refund, 'dirty', 'refund');
  if (st.buildSession) st.buildSession = st.buildSession.filter((p) => p !== placement);
  st.flowScore = flowScore(ctx, prop).score;
  ctx.emit('sim:built', { property: prop, placement, item: pl.item, change: 'removed' });
  ctx.bump('properties');
  return ok({ refund });
}

// ── Flow Score ──────────────────────────────────────────────────────────────

/** Walking distance (grid steps) between two placements through free cells; Infinity if blocked. */
function walk(ctx: SimCtx, prop: PropertyId, a: Placement, b: Placement): number {
  const def = ctx.content.properties[prop];
  const st = ctx.state.properties[prop];
  const blocked = new Set<string>(def.blocked.map(([x, y]) => key(x, y)));
  for (const pl of st.layout) for (const [x, y] of cellsOf(ctx, pl)) blocked.add(key(x, y));
  const starts = cellsOf(ctx, a);
  const goals = new Set(cellsOf(ctx, b).map(([x, y]) => key(x, y)));
  const dist = new Map<string, number>();
  const queue: Array<[number, number]> = [];
  for (const [x, y] of starts) {
    dist.set(key(x, y), 0);
    queue.push([x, y]);
  }
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const d = dist.get(key(x, y))!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (goals.has(k)) return d + 1;
      if (nx < 0 || ny < 0 || nx >= def.grid.w || ny >= def.grid.h || dist.has(k) || blocked.has(k)) continue;
      dist.set(k, d + 1);
      queue.push([nx, ny]);
    }
  }
  return Infinity;
}

export function flowScore(ctx: SimCtx, prop: PropertyId): { score: number; hint: string | null } {
  const st = ctx.state.properties[prop];
  const items = (pred: (pl: Placement) => boolean) => st.layout.filter(pred);
  const fx = (pl: Placement) => ctx.content.placeables[pl.item].effects;
  const planters = items((pl) => (fx(pl).pots ?? 0) > 0);
  const feed = items((pl) => fx(pl).station === 'feed')[0];
  const bench = items((pl) => fx(pl).station === 'workbench')[0];
  const storage = items((pl) => (fx(pl).stash ?? 0) > 0)[0];
  const pairs: Array<[Placement, Placement, number]> = [];
  if (feed) for (const p of planters) pairs.push([feed, p, 1]);
  if (bench) for (const p of planters) pairs.push([p, bench, 0.6]);
  if (bench && storage) pairs.push([bench, storage, 1]);
  if (pairs.length === 0) return { score: 70, hint: null };
  let total = 0;
  let weight = 0;
  let worst: { a: Placement; b: Placement; d: number } | null = null;
  for (const [a, b, w] of pairs) {
    const d = walk(ctx, prop, a, b);
    const dd = Number.isFinite(d) ? d : 30;
    total += dd * w;
    weight += w;
    if (!worst || dd > worst.d) worst = { a, b, d: dd };
  }
  const avg = total / weight;
  const score = Math.round(Math.max(0, Math.min(100, 112 - avg * 9)));
  let hint: string | null = null;
  if (worst && worst.d > 4) {
    const gain = Math.min(20, Math.round((worst.d - 3) * 3));
    hint = t('flowHint', { a: ctx.content.placeables[worst.a.item].name, b: ctx.content.placeables[worst.b.item].name, n: gain });
  }
  return { score, hint };
}
