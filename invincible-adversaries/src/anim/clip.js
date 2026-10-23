import { CH, NCH, makeMask, setChannel } from './pose.js';
import { ease as EASE } from '../engine/math.js';

/**
 * A keyframed action clip over pose channels.
 * keys: [{ t, p: {channel: value | [x,y,z]}, e: easeName }]
 *   - channels not mentioned in a key inherit the previous key's value
 *   - channels first mentioned later start from the live base pose
 * events: [{ t, e: 'name', ...data }]
 */
export class Clip {
  constructor(def) {
    this.name = def.name;
    this.duration = def.duration ?? def.keys[def.keys.length - 1].t;
    this.loop = !!def.loop;
    this.fadeIn = def.fadeIn ?? 0.06;
    this.fadeOut = def.fadeOut ?? 0.14;
    this.events = (def.events || []).slice().sort((a, b) => a.t - b.t);
    this.mask = def.mask instanceof Float32Array ? def.mask : makeMask(def.mask || ['upper']);
    this.aimIK = def.aimIK !== false;
    this.lockLegs = !!def.lockLegs;
    this.speedScale = def.speedScale ?? 1;
    this.tags = def.tags || {};
    // compile
    const keys = def.keys;
    this.times = new Float32Array(keys.length);
    this.eases = keys.map((k) => EASE[k.e || 'inout'] || EASE.inout);
    this.table = new Float32Array(keys.length * NCH).fill(NaN);
    const used = new Uint8Array(NCH);
    const tmp = new Float32Array(NCH).fill(NaN);
    for (let i = 0; i < keys.length; i++) {
      this.times[i] = keys[i].t;
      // inherit
      if (i > 0) this.table.copyWithin(i * NCH, (i - 1) * NCH, i * NCH);
      tmp.fill(NaN);
      for (const k in keys[i].p) setChannel(tmp, k, keys[i].p[k]);
      for (let c = 0; c < NCH; c++) if (!Number.isNaN(tmp[c])) { this.table[i * NCH + c] = tmp[c]; used[c] = 1; }
    }
    this.used = [];
    for (let c = 0; c < NCH; c++) if (used[c]) this.used.push(c);
    // channels the clip defines are fully overridden; others pass through (mask 0)
    const m = new Float32Array(NCH);
    for (const c of this.used) m[c] = this.mask[c] || 0;
    this.effMask = m;
  }

  /** Write sampled channels into out.v (only used channels), using base for unset values. */
  sample(t, base, out) {
    const n = this.times.length;
    const T = this.times;
    if (this.loop) t = ((t % this.duration) + this.duration) % this.duration;
    let i = 0;
    while (i < n - 1 && t >= T[i + 1]) i++;
    const j = Math.min(i + 1, n - 1);
    let u = 0;
    if (j !== i) u = (t - T[i]) / Math.max(1e-6, T[j] - T[i]);
    u = Math.min(1, Math.max(0, u));
    u = this.eases[j](u);
    const tb = this.table, bv = base.v, ov = out.v;
    for (const c of this.used) {
      let a = tb[i * NCH + c], b = tb[j * NCH + c];
      if (Number.isNaN(a)) a = bv[c];
      if (Number.isNaN(b)) b = bv[c];
      ov[c] = a + (b - a) * u;
    }
  }
}

/** the same clip for the other hand: L/R channels swapped, turns and leans flipped */
const FLIP = new Set(['rootX', 'rootYaw', 'rootRoll', 'spineYaw', 'spineRoll', 'neckYaw', 'neckRoll', 'headYaw', 'headRoll']);
export function mirrorClip(def) {
  const swap = (k) => (k[0] === 'L' ? 'R' + k.slice(1) : k[0] === 'R' ? 'L' + k.slice(1) : k);
  const keys = def.keys.map((key) => {
    const p = {};
    for (const k in key.p) p[FLIP.has(k) ? k : swap(k)] = FLIP.has(k) ? -key.p[k] : key.p[k];
    return { ...key, p };
  });
  return { ...def, keys };
}

export function clips(defs) {
  const out = {};
  for (const k in defs) out[k] = new Clip({ name: k, ...defs[k] });
  return out;
}

export { CH };
