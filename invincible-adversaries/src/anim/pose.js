// Rig-independent pose representation: a flat array of named animation channels.
// Angles are degrees. Arm/leg directions are unit vectors in "mirrored" space
// (x = outward from the body for either side, y = up, z = forward).

export const CH = {};
let n = 0;
const def = (name) => { CH[name] = n++; };
['rootX', 'rootY', 'rootZ', 'rootPitch', 'rootYaw', 'rootRoll',
  'spinePitch', 'spineYaw', 'spineRoll',
  'neckPitch', 'neckYaw', 'neckRoll', 'headPitch', 'headYaw', 'headRoll', 'jaw', 'browAnger'].forEach(def);
for (const s of ['L', 'R']) {
  ['clavLift', 'clavFwd',
    'armX', 'armY', 'armZ', 'armTwist', 'elbow', 'foreTwist',
    'handFlex', 'handDev', 'handRoll', 'fist', 'spread',
    'ikW', 'ikX', 'ikY', 'ikZ', 'poleX', 'poleY', 'poleZ',
    'legX', 'legY', 'legZ', 'legTwist', 'knee', 'footPitch', 'footRoll', 'footYaw', 'toe', 'footGround',
    'legIkW', 'legIkX', 'legIkY', 'legIkZ'].forEach((c) => def(s + c));
}
export const NCH = n;

export class Pose {
  constructor() { this.v = new Float32Array(NCH); this.reset(); }
  reset() {
    const v = this.v;
    v.fill(0);
    for (const s of ['L', 'R']) {
      v[CH[s + 'armX']] = 0.12; v[CH[s + 'armY']] = -1; v[CH[s + 'armZ']] = 0.02;
      v[CH[s + 'legY']] = -1;
      v[CH[s + 'elbow']] = 12;
      v[CH[s + 'poleX']] = 0.5; v[CH[s + 'poleY']] = -0.4; v[CH[s + 'poleZ']] = -0.7;
      v[CH[s + 'footGround']] = 0;
    }
    return this;
  }
  copy(o) { this.v.set(o.v); return this; }
  clone() { return new Pose().copy(this); }
  get(name) { return this.v[CH[name]]; }
  set(name, val) { this.v[CH[name]] = val; return this; }
  add(name, val) { this.v[CH[name]] += val; return this; }
  /** Blend toward `o` by t. If `mask` (Float32Array weights per channel) given, multiplies t. */
  lerp(o, t, mask) {
    const a = this.v, b = o.v;
    if (mask) { for (let i = 0; i < NCH; i++) { const w = t * mask[i]; if (w !== 0) a[i] += (b[i] - a[i]) * w; } }
    else for (let i = 0; i < NCH; i++) a[i] += (b[i] - a[i]) * t;
    return this;
  }
  /** Set channels from a plain object {name: value}; supports shorthand 'L*'/'R*' & 'B*' (both sides, mirrored). */
  assign(obj) {
    for (const k in obj) setChannel(this.v, k, obj[k]);
    return this;
  }
}

/** Shorthands: 'arm' -> [x,y,z], 'Barm' applies to both sides. */
export function setChannel(v, k, val) {
  if (k[0] === 'B' && k.length > 1 && k[1] === k[1].toLowerCase()) {
    setChannel(v, 'L' + k.slice(1), val); setChannel(v, 'R' + k.slice(1), val); return;
  }
  if (Array.isArray(val)) {
    const base = k; // e.g. 'Larm' -> LarmX/Y/Z, 'Lik' -> LikX..., 'Lpole' -> LpoleX...
    v[CH[base + 'X']] = val[0]; v[CH[base + 'Y']] = val[1]; v[CH[base + 'Z']] = val[2];
    return;
  }
  const i = CH[k];
  if (i === undefined) { console.warn('unknown pose channel', k); return; }
  v[i] = val;
}

/** Build a channel mask from groups. */
export function makeMask(groups, weight = 1) {
  const m = new Float32Array(NCH);
  const add = (name, w) => { if (CH[name] !== undefined) m[CH[name]] = w; };
  for (const g of groups) {
    const w = typeof g === 'object' ? g.w : weight;
    const name = typeof g === 'object' ? g.g : g;
    for (const k in CH) {
      if (matchesGroup(k, name)) add(k, w);
    }
  }
  return m;
}

function matchesGroup(k, g) {
  switch (g) {
    case 'all': return true;
    case 'root': return k.startsWith('root');
    case 'spine': return k.startsWith('spine');
    case 'head': return k.startsWith('neck') || k.startsWith('head') || k === 'jaw' || k === 'browAnger';
    case 'armL': return /^L(clav|arm|elbow|fore|hand|fist|spread|ik|pole)/.test(k);
    case 'armR': return /^R(clav|arm|elbow|fore|hand|fist|spread|ik|pole)/.test(k);
    case 'arms': return /^[LR](clav|arm|elbow|fore|hand|fist|spread|ik|pole)/.test(k);
    case 'legs': return /^[LR](leg|knee|foot|toe)/.test(k);
    case 'upper': return k.startsWith('spine') || matchesGroup(k, 'head') || matchesGroup(k, 'arms');
    default: return k === g;
  }
}

export const MASK_ALL = makeMask(['all']);
export const MASK_UPPER = makeMask(['upper']);
export const MASK_ARMS = makeMask(['arms']);
export const MASK_ARM_R = makeMask(['armR']);
export const MASK_ARM_L = makeMask(['armL']);
export const MASK_LEGS_ROOT = makeMask(['legs', 'root']);
