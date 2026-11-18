import type { SimCtx } from '../ctx';

/**
 * Notoriety bookkeeping shared by deals, stunts, busts and properties. The raid logic that reacts
 * to thresholds lives in `heat.ts`.
 */
export function addNotoriety(ctx: SimCtx, amount: number): void {
  if (amount === 0) return;
  const h = ctx.state.heat;
  const scaled = amount > 0 ? amount * ctx.diff.notorietyGain * ctx.mods.notoriety : amount;
  const before = h.notoriety;
  h.notoriety = Math.min(100, Math.max(0, h.notoriety + scaled));
  const delta = h.notoriety - before;
  if (Math.abs(delta) < 1e-9) return;
  if (Math.floor(before) !== Math.floor(h.notoriety)) ctx.emit('sim:notoriety', { value: h.notoriety, delta });
  ctx.bump('heat');
}
