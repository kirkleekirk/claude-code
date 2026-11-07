// Sample buildings for the sandbox page.
import { buildFromPlan, validateReachability } from '../src/building/planner.js';
import { PLANS } from '../src/building/prefabs.js';

export function buildSample(name) {
  const fn = PLANS[name];
  const S = fn ? fn() : PLANS.foursquare();
  S.ox = 0; S.oz = 0; S.oy = 0.0;
  const v = validateReachability(S);
  console.log('reachability', name, JSON.stringify(v));
  return S;
}
