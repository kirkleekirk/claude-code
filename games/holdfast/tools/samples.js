// Sample buildings for the sandbox page.
import { buildFromPlan, validateReachability } from '../src/building/planner.js';
import { PLANS, townBlock } from '../src/building/prefabs.js';

export function buildSample(name) {
  if (name === 'block') return finish(townBlock([{ w: 4, d: 8, levels: 2, kind: 'hardware', sign: 'HARDWARE', style: 'red_brick' }, { w: 4, d: 8, levels: 3, kind: 'store', sign: 'MERCANTILE', style: 'tan_brick' }, { w: 4, d: 8, levels: 2, kind: 'diner', sign: 'RIVER DINER', style: 'painted_brick' }, { w: 4, d: 7, levels: 2, kind: 'pharmacy', sign: 'PHARMACY', style: 'dark_brick' }]), name);
  const fn = PLANS[name];
  const S = fn ? fn() : PLANS.foursquare();
  return finish(S, name);
}
function finish(S, name) {
  S.ox = 0; S.oz = 0; S.oy = 0.0;
  const v = validateReachability(S);
  console.log('reachability', name, JSON.stringify(v));
  return S;
}
