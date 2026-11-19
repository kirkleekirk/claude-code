import { fmt } from '@/core/i18n';
import { fail, ok } from '@/core/types';
import type { StuntId } from '@/content/brand';
import type { BrandLogo, SimResult } from '../api';
import { BRAND, XP } from '../balance';
import type { SimCtx } from '../ctx';
import { t } from '../strings';
import { addNotoriety } from './notoriety';
import { addXp, rankLock, unlockLock } from './progression';

/** The player's brand: name, logo, packaging and Brand Hype. */

function validLogo(ctx: SimCtx, logo: BrandLogo): boolean {
  const b = ctx.content.brand;
  const inRange = (v: number, n: number) => Number.isInteger(v) && v >= 0 && v < n;
  return inRange(logo.shape, b.shapes.length) && inRange(logo.icon, b.icons.length) && inRange(logo.palette, b.palettes.length) && inRange(logo.type, b.types.length);
}

function cleanName(name: string): string | null {
  const s = name.replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 24 ? s : null;
}

export function createBrand(ctx: SimCtx, name: string, logo: BrandLogo, packaging: number): SimResult {
  const clean = cleanName(name);
  if (!clean) return fail('invalid', t('invalidName'));
  if (!validLogo(ctx, logo) || !ctx.content.brand.packaging[packaging]) return fail('invalid');
  const first = ctx.state.brand === null;
  ctx.state.brand = {
    name: clean, logo: { ...logo }, packaging,
    hype: first ? BRAND.startHype : ctx.state.brand!.hype,
    createdAt: first ? ctx.now : ctx.state.brand!.createdAt,
    stuntCooldowns: first ? {} : ctx.state.brand!.stuntCooldowns,
  };
  if (first) addXp(ctx, XP.brand, 'brand');
  ctx.bump('brand', 'products');
  ctx.beat('brandNamed');
  return ok(undefined);
}

export function updateBrand(ctx: SimCtx, patch: Partial<{ name: string; logo: BrandLogo; packaging: number }>): SimResult {
  const b = ctx.state.brand;
  if (!b) return fail('notReady', t('brandFirst'));
  if (patch.name !== undefined) {
    const clean = cleanName(patch.name);
    if (!clean) return fail('invalid', t('invalidName'));
    b.name = clean;
  }
  if (patch.logo) {
    if (!validLogo(ctx, patch.logo)) return fail('invalid');
    b.logo = { ...patch.logo };
  }
  if (patch.packaging !== undefined) {
    if (!ctx.content.brand.packaging[patch.packaging]) return fail('invalid');
    b.packaging = patch.packaging;
  }
  ctx.bump('brand', 'products');
  return ok(undefined);
}

export function stunt(ctx: SimCtx, kind: StuntId): SimResult<{ hype: number; cost: number }> {
  const def = ctx.content.brand.stunts[kind];
  if (!def) return fail('notFound');
  const b = ctx.state.brand;
  if (!b) return fail('notReady', t('brandFirst'));
  const rank = rankLock(ctx, def.rank);
  if (rank.locked) return fail('locked', rank.reason ?? undefined);
  if (def.unlock) {
    const l = unlockLock(ctx, def.unlock);
    if (l.locked) return fail('locked', l.reason ?? undefined);
  }
  const ready = b.stuntCooldowns[kind] ?? 0;
  if (ready > ctx.now) return fail('cooldown', t('cooldown', { time: fmt.duration(ready - ctx.now) }));
  const paid = ctx.pay(def.cost, 'any', 'stunt');
  if (!paid.ok) return paid;
  b.hype = Math.min(100, b.hype + def.hype);
  b.stuntCooldowns[kind] = ctx.now + def.cooldown;
  if (def.notoriety) addNotoriety(ctx, def.notoriety);
  if (kind === 'influencer') ctx.state.rivals.zenith.pressure = Math.min(100, ctx.state.rivals.zenith.pressure + 6);
  addXp(ctx, 15 + Math.round(def.hype), 'stunt');
  ctx.bump('brand');
  return ok({ hype: b.hype, cost: def.cost });
}

/** Hype drifts down toward a floor unless quality and stunts keep it up. */
export function tickBrand(ctx: SimCtx, dt: number): void {
  const b = ctx.state.brand;
  if (!b || b.hype <= BRAND.floor) return;
  const before = Math.floor(b.hype);
  b.hype = Math.max(BRAND.floor, b.hype - (BRAND.decayPerMinute * dt) / 60);
  if (Math.floor(b.hype) !== before) ctx.bump('brand');
}

export function addHype(ctx: SimCtx, n: number): void {
  const b = ctx.state.brand;
  if (!b) return;
  b.hype = Math.min(100, Math.max(0, b.hype + n));
  ctx.bump('brand');
}
