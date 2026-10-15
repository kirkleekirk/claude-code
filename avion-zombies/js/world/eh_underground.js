import { caveKit } from './eh_cavekit.js';
import { buildShowCave } from './eh_showcave.js';
import { buildAvion } from './eh_avion.js';
import { buildDeep } from './eh_deep.js';
import { buildReactor } from './eh_reactor.js';
import { ehMaterials } from './eh_textures.js';

// Ember Hollow under the mountain: the show cave, Avion's decline, the grotto and the river,
// and the CALDERA. Everything down here runs on the reactor's power.
export function buildUnderground(B, ctx, fx) {
  const M = ctx.materials;
  const X = ehMaterials(M);
  const S = { B, M, X, fx, ctx, H: (x, z) => ctx.terrain.heightAt(x, z) };
  const K = caveKit(S);
  buildShowCave(S, K);
  buildAvion(S, K);
  buildDeep(S, K);
  buildReactor(S, K);
  return K;
}
