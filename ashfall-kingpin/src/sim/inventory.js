// Inventory helpers. Quantities never go negative; take* returns false instead.
import { itemInfo } from '../data/items.js';

export const count = (S, k) => S.inv[k] || 0;

export function addItem(S, k, n = 1) {
  if (!(n > 0)) return;
  S.inv[k] = Math.round(((S.inv[k] || 0) + n) * 1000) / 1000;
}

export function takeItem(S, k, n = 1) {
  if (!(n > 0)) return true;
  if ((S.inv[k] || 0) + 1e-9 < n) return false;
  S.inv[k] = Math.round((S.inv[k] - n) * 1000) / 1000;
  if (S.inv[k] <= 1e-9) delete S.inv[k];
  return true;
}

export function hasAll(S, recipe, times = 1) {
  for (const [k, n] of Object.entries(recipe)) if (count(S, k) + 1e-9 < n * times) return false;
  return true;
}

export function takeAll(S, recipe, times = 1) {
  if (!hasAll(S, recipe, times)) return false;
  for (const [k, n] of Object.entries(recipe)) takeItem(S, k, n * times);
  return true;
}

export function missing(S, recipe, times = 1) {
  const out = {};
  for (const [k, n] of Object.entries(recipe)) { const need = n * times - count(S, k); if (need > 1e-9) out[k] = Math.ceil(need); }
  return out;
}

export function invList(S, filter) {
  return Object.entries(S.inv)
    .filter(([k, n]) => n > 0 && (!filter || filter(k, itemInfo(k, S.strains.hybrids))))
    .map(([k, n]) => ({ key: k, n, info: itemInfo(k, S.strains.hybrids) }));
}

export function invWeight(S) {
  let w = 0;
  for (const [k, n] of Object.entries(S.inv)) w += itemInfo(k, S.strains.hybrids).w * n;
  return w;
}

export function carryWeight(S) {
  let w = 0;
  for (const [k, n] of Object.entries(S.player.carry || {})) w += itemInfo(k, S.strains.hybrids).w * n;
  return w;
}

export function recipeText(recipe, times = 1) {
  return Object.entries(recipe).map(([k, n]) => `${n * times} ${itemInfo(k).name}`).join(', ');
}
