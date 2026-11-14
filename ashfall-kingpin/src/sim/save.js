// Versioned JSON saves (3 slots + autosave) with export/import strings. Storage is injected so the
// same code runs headless (in-memory) and in the browser (localStorage).
import { SAVE_VERSION, newGame } from './state.js';
import { hasNaN } from '../core/util.js';

const PREFIX = 'AKSAVE1:';
export const SLOTS = ['slot1', 'slot2', 'slot3', 'auto'];

export function serialize(S) {
  return JSON.stringify(S, (k, v) => (k && k[0] === '_' ? undefined : v));
}

export function migrate(S) {
  const base = newGame(S.seed || 1, S.diff || 'normal', { tutorial: false });
  // Fill any keys added by later versions with defaults, recursively for plain objects.
  const fill = (dst, src) => {
    for (const [k, v] of Object.entries(src)) {
      if (k[0] === '_') continue;
      if (!(k in dst)) dst[k] = JSON.parse(JSON.stringify(v));
      else if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) && !['inv', 'perks', 'ach', 'stats', 'flags', 'heat', 'sat', 'candidates', 'protection', 'recon', 'hybrids', 'known', 'bps', 'owned', 'arms', 'visited', 'cooldown', 'seen', 'turf', 'up', 'unlocks'].includes(k)) fill(dst[k], v);
    }
  };
  fill(S, base);
  S.v = SAVE_VERSION;
  S._fx = [];
  return S;
}

export function deserialize(str) {
  const S = JSON.parse(str);
  if (!S || typeof S !== 'object' || !S.money || !S.hollow) throw new Error('Not an Ashfall Kingpin save.');
  if ((S.v || 0) > SAVE_VERSION) throw new Error('Save is from a newer version.');
  return migrate(S);
}

export function validate(S) {
  const errs = [];
  const nan = hasNaN(S);
  if (nan.length) errs.push('NaN at ' + nan.slice(0, 5).join(', '));
  for (const [k, n] of Object.entries(S.inv)) if (!(n >= 0)) errs.push(`negative inventory ${k}=${n}`);
  if (S.money.dirty < -0.01 || S.money.carried < -0.01 || S.money.clean < -0.01) errs.push('negative money');
  return errs;
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportString(S) { return PREFIX + b64encode(serialize(S)); }
export function importString(s) {
  s = String(s).trim();
  if (!s.startsWith(PREFIX)) throw new Error('That is not an export string (should start with AKSAVE1:).');
  return deserialize(b64decode(s.slice(PREFIX.length)));
}

export function summary(S) {
  return { day: S.day, rep: Math.floor(S.rep), dirty: Math.round(S.money.dirty + S.money.carried), clean: Math.round(S.money.clean), diff: S.diff, ending: S.ending, at: Date.now() };
}

// store: { get(key) -> string|null, set(key, string), remove(key) }
export function saveTo(store, slot, S) {
  const data = serialize(S);
  store.set('ak.' + slot, data);
  store.set('ak.' + slot + '.meta', JSON.stringify(summary(S)));
  return data.length;
}
export function loadFrom(store, slot) {
  const data = store.get('ak.' + slot);
  return data ? deserialize(data) : null;
}
export function metaOf(store, slot) {
  try { const m = store.get('ak.' + slot + '.meta'); return m ? JSON.parse(m) : null; } catch (e) { return null; }
}

export function memoryStore() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
}
