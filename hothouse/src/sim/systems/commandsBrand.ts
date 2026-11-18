import type { SimCommands } from '../api';
import type { SimCtx } from '../ctx';
import { createBrand, stunt, updateBrand } from './brand';

/** Brand commands, grouped so `Sim.ts` stays readable. */
export function brandCommands(ctx: SimCtx): Pick<SimCommands, 'createBrand' | 'updateBrand' | 'stunt'> {
  return {
    createBrand: (name, logo, packaging) => createBrand(ctx, name, logo, packaging),
    updateBrand: (patch) => updateBrand(ctx, patch),
    stunt: (kind) => {
      const r = stunt(ctx, kind);
      if (r.ok) ctx.onAction('stunt', kind);
      return r;
    },
  };
}
