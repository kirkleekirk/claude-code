import { Color, Vector3, type BufferGeometry } from 'three';
import { Rng } from '@/core/rng';
import { MeshBuilder, WinStyle } from '@/render/geo/MeshBuilder';

export type PalmSpecies = 'coconut' | 'royal' | 'sabal' | 'date' | 'foxtail' | 'areca';
export const PALM_SPECIES: readonly PalmSpecies[] = ['coconut', 'royal', 'sabal', 'date', 'foxtail', 'areca'];
export const PALM_VARIANTS = 3;
export const PALM_LODS = 3;

interface Shape {
  height: [number, number];
  lean: number;
  trunkR: [number, number];
  trunk: string;
  pattern: number;
  cell: [number, number];
  shaft?: { len: number; color: string; r: number };
  fronds: number;
  frondLen: [number, number];
  /** Initial elevation of fronds (radians) and how far they droop by the tip. */
  rise: number;
  droop: number;
  width: number;
  leaf: string;
  tip: string;
  fan?: boolean;
  stems?: number;
  coconuts?: boolean;
}

const SHAPES: Record<PalmSpecies, Shape> = {
  coconut: {
    height: [7.5, 11.5], lean: 1.6, trunkR: [0.24, 0.15], trunk: '#8C7B68', pattern: WinStyle.SHINGLE, cell: [0.9, 0.3],
    fronds: 13, frondLen: [3.6, 4.6], rise: 0.55, droop: 1.75, width: 0.95, leaf: '#3F8640', tip: '#B9C25A', coconuts: true,
  },
  royal: {
    height: [12, 17], lean: 0.12, trunkR: [0.36, 0.26], trunk: '#C9C3B8', pattern: WinStyle.PLAIN, cell: [1, 1],
    shaft: { len: 2.4, color: '#5E9A48', r: 0.27 },
    fronds: 12, frondLen: [3.8, 4.8], rise: 0.95, droop: 2.0, width: 0.9, leaf: '#3C7F3C', tip: '#A6C060',
  },
  sabal: {
    height: [6, 9.5], lean: 0.2, trunkR: [0.25, 0.22], trunk: '#6B5845', pattern: WinStyle.BRICK, cell: [0.22, 0.18],
    fronds: 26, frondLen: [1.1, 1.5], rise: 0.4, droop: 0.9, width: 1.25, leaf: '#4C7F3F', tip: '#9CB860', fan: true,
  },
  date: {
    height: [5, 8.5], lean: 0.25, trunkR: [0.42, 0.36], trunk: '#9A6A44', pattern: WinStyle.BRICK, cell: [0.32, 0.26],
    fronds: 20, frondLen: [3.0, 3.8], rise: 0.85, droop: 1.15, width: 0.6, leaf: '#5E8C6A', tip: '#B7C98F',
  },
  foxtail: {
    height: [7, 10], lean: 0.18, trunkR: [0.28, 0.2], trunk: '#BDB6AA', pattern: WinStyle.SHINGLE, cell: [1, 0.55],
    shaft: { len: 1.4, color: '#6FA250', r: 0.2 },
    fronds: 11, frondLen: [3.0, 3.7], rise: 0.75, droop: 1.6, width: 1.25, leaf: '#4E8F3E', tip: '#B5CC62',
  },
  areca: {
    height: [3.2, 5], lean: 0.5, trunkR: [0.08, 0.06], trunk: '#9FA35C', pattern: WinStyle.SHINGLE, cell: [0.4, 0.25],
    fronds: 7, frondLen: [1.8, 2.4], rise: 1.0, droop: 1.3, width: 0.75, leaf: '#66A84A', tip: '#C9D46A', stems: 5,
  },
};

const _c = new Color();
const _base = new Color();
const _tipC = new Color();

/** Geometry for one species / variant / LOD. Base at the origin, trunk along +Y. */
export function palmGeometry(species: PalmSpecies, variant: number, lod: number): BufferGeometry {
  const shape = SHAPES[species];
  const rng = new Rng(`palm-${species}-${variant}`);
  const b = new MeshBuilder({ windows: true, sway: true });
  const stems = shape.stems ?? 1;
  for (let st = 0; st < stems; st++) {
    const srng = stems > 1 ? rng.fork(st) : rng;
    const height = srng.range(shape.height[0], shape.height[1]) * (stems > 1 ? srng.range(0.65, 1) : 1);
    const leanAz = srng.range(0, Math.PI * 2);
    const lean = shape.lean * srng.range(0.5, 1) * (stems > 1 ? 1.4 : 1);
    const offX = stems > 1 ? Math.cos((st / stems) * Math.PI * 2) * 0.35 : 0;
    const offZ = stems > 1 ? Math.sin((st / stems) * Math.PI * 2) * 0.35 : 0;
    const top = trunk(b, shape, height, leanAz, lean, offX, offZ, lod);
    crown(b, shape, srng, top, lod, height);
  }
  return b.build();
}

/** Curved, tapered trunk. Returns the crown position. */
function trunk(b: MeshBuilder, s: Shape, height: number, leanAz: number, lean: number, ox: number, oz: number, lod: number): Vector3 {
  const segs = lod === 0 ? 12 : lod === 1 ? 6 : 3;
  const pts: Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // Curve away near the base, then straighten up: the classic coconut sweep.
    const bend = lean * (t * t * 0.7 + Math.sin(t * Math.PI * 0.5) * 0.3);
    pts.push(new Vector3(ox + Math.cos(leanAz) * bend, t * height, oz + Math.sin(leanAz) * bend));
  }
  b.surface(s.trunk, 0.92, 0, 0, 8).windows(s.cell[0], s.cell[1], s.pattern, 3);
  b.tube(pts, (t) => s.trunkR[0] + (s.trunkR[1] - s.trunkR[0]) * t, lod === 0 ? 8 : lod === 1 ? 6 : 4, (t) => t * t * 0.32);
  b.noWindows();
  const top = pts[pts.length - 1]!.clone();
  if (s.shaft) {
    b.surface(s.shaft.color, 0.55, 0, 0, 8);
    b.sway = 0.32;
    const sh = [top.clone(), top.clone().add(new Vector3(0, s.shaft.len, 0))];
    b.tube(sh, (t) => s.shaft!.r * (1.06 - t * 0.2), lod === 0 ? 8 : 5);
    top.y += s.shaft.len;
  }
  return top;
}

function crown(b: MeshBuilder, s: Shape, rng: Rng, top: Vector3, lod: number, height: number): void {
  const count = Math.max(4, Math.round(s.fronds * (lod === 0 ? 1 : lod === 1 ? 0.72 : 0.5)));
  _base.set(s.leaf);
  _tipC.set(s.tip);
  if (s.coconuts && lod < 2) {
    b.surface('#6E5233', 0.7, 0, 0, 8);
    b.sway = 0.33;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng.range(0, 0.6);
      b.sphere(top.x + Math.cos(a) * 0.32, top.y - 0.35, top.z + Math.sin(a) * 0.32, 0.17, lod === 0 ? 6 : 4, lod === 0 ? 4 : 3);
    }
  }
  for (let f = 0; f < count; f++) {
    const az = (f / count) * Math.PI * 2 + rng.range(-0.18, 0.18);
    // Lower fronds hang more; upper ones stand up.
    const tier = (f % 3) / 2;
    const len = rng.range(s.frondLen[0], s.frondLen[1]) * (0.85 + 0.15 * tier) * (height < 6 ? 0.85 : 1);
    const rise = s.rise * (0.55 + 0.6 * tier) + rng.range(-0.1, 0.1);
    if (s.fan) fan(b, top, az, rise, len, s, rng, lod);
    else feather(b, top, az, rise, len, s, lod);
  }
}

/** A pinnate frond: a drooping spine with serrated leaflet ribbons on both sides. */
function feather(b: MeshBuilder, top: Vector3, az: number, rise: number, len: number, s: Shape, lod: number): void {
  const n = lod === 0 ? 12 : lod === 1 ? 6 : 3;
  const step = len / n;
  const spine: Vector3[] = [top.clone().add(new Vector3(Math.cos(az) * 0.12, 0, Math.sin(az) * 0.12))];
  const dirs: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const el = rise - s.droop * t * t;
    const d = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    dirs.push(d);
    spine.push(spine[i]!.clone().addScaledVector(d, step));
  }
  dirs.push(dirs[dirs.length - 1]!.clone());
  const side = new Vector3(-Math.sin(az), 0, Math.cos(az));
  for (const sgn of [1, -1]) {
    let prevIn = -1, prevOut = -1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = spine[i]!;
      const d = dirs[i]!;
      // V-fold: leaflets angle down and out; serrated edge alternates long and short.
      const wProfile = Math.sin(Math.PI * Math.pow(Math.max(t, 0.02), 0.8));
      const serr = lod === 0 ? (i % 2 === 0 ? 1 : 0.5) : 1;
      const w = s.width * wProfile * serr;
      const out = p.clone().addScaledVector(side, w * sgn).add(new Vector3(0, -w * 0.38, 0)).addScaledVector(d, w * 0.25);
      const nrm = new Vector3().crossVectors(d, side).multiplyScalar(sgn).normalize();
      if (nrm.y < 0) nrm.negate();
      _c.copy(_base).lerp(_tipC, t * 0.75);
      b.surfaceLinear(_c, 0.62, 0, 0, 8);
      b.sway = 0.34 + 0.66 * t;
      const iIn = b.vertex(p.x, p.y, p.z, nrm.x, nrm.y, nrm.z, 0, t * len);
      _c.copy(_base).lerp(_tipC, Math.min(1, t * 0.75 + 0.25));
      b.surfaceLinear(_c, 0.62, 0, 0, 8);
      b.sway = 0.4 + 0.6 * t;
      const iOut = b.vertex(out.x, out.y, out.z, nrm.x, nrm.y, nrm.z, w, t * len);
      if (i > 0) {
        if (sgn > 0) b.quadIdx(prevIn, prevOut, iOut, iIn);
        else b.quadIdx(prevIn, iIn, iOut, prevOut);
      }
      prevIn = iIn;
      prevOut = iOut;
    }
  }
}

/** A palmate fan leaf on a short stalk (sabal). */
function fan(b: MeshBuilder, top: Vector3, az: number, rise: number, len: number, s: Shape, rng: Rng, lod: number): void {
  const el = rise + rng.range(-0.6, 0.9);
  const dir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const stalkEnd = top.clone().addScaledVector(dir, len * 0.55);
  b.surface('#6E7F48', 0.8, 0, 0, 8);
  b.sway = 0.4;
  if (lod === 0) b.tube([top.clone(), stalkEnd.clone()], 0.025, 4);
  // Fan plane: perpendicular-ish to the stalk, tilted to face out and up.
  const right = new Vector3(-Math.sin(az), 0, Math.cos(az));
  const up = new Vector3().crossVectors(right, dir).normalize();
  const r = len * 0.9;
  const pleats = lod === 0 ? 14 : lod === 1 ? 8 : 5;
  const spread = 2.3;
  _c.copy(_base);
  b.surfaceLinear(_c, 0.65, 0, 0, 8);
  b.sway = 0.55;
  const nrm = new Vector3().crossVectors(right, up).normalize();
  if (nrm.dot(dir) < 0) nrm.negate();
  const centre = b.vertex(stalkEnd.x, stalkEnd.y, stalkEnd.z, nrm.x, nrm.y, nrm.z, 0, 0);
  const first = b.vertex(stalkEnd.x, stalkEnd.y, stalkEnd.z, nrm.x, nrm.y, nrm.z, 0, 0);
  void first;
  for (let i = 0; i <= pleats; i++) {
    const a = -spread / 2 + (i / pleats) * spread;
    const rr = r * (i % 2 === 0 ? 1 : 0.86);
    const p = stalkEnd.clone().addScaledVector(right, Math.sin(a) * rr).addScaledVector(up, Math.cos(a) * rr * 0.8).addScaledVector(dir, -Math.abs(Math.sin(a)) * rr * 0.25);
    _c.copy(_base).lerp(_tipC, 0.55 + (i % 2) * 0.2);
    b.surfaceLinear(_c, 0.65, 0, 0, 8);
    b.sway = 1;
    const v = b.vertex(p.x, p.y, p.z, nrm.x, nrm.y, nrm.z, i, 1);
    if (i > 0) b.triangle(centre, v - 1, v);
  }
}
