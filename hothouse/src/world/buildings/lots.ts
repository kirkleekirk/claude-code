import type { DistrictId } from '@/content/places';
import { yawOf } from '@/core/math';
import { Rng } from '@/core/rng';
import { area, distToPolyEdge, obb, pointInPoly, splitPoly, type Poly } from '../geom';
import type { Block } from '../roads/RoadMesher';
import type { BuildingSpec, BuildingStyle } from './styles';

/** Per-district urban form. */
interface DistrictForm {
  lotArea: [number, number];
  front: [number, number];
  side: number;
  back: number;
  maxDepth: number;
  floors: [number, number];
  styles: Partial<Record<BuildingStyle, number>>;
}

const FORMS: Partial<Record<DistrictId, DistrictForm>> = {
  strand: {
    lotArea: [650, 1150], front: [0.2, 1.5], side: 0.6, back: 3, maxDepth: 34, floors: [2, 7],
    styles: { decoHotel: 3, shopRow: 2.5, shack: 1.5, medRevival: 1, decoSmall: 1.2 },
  },
  deco: {
    lotArea: [750, 1350], front: [0.2, 1.2], side: 0.6, back: 3, maxDepth: 36, floors: [3, 9],
    styles: { decoHotel: 4, decoSmall: 2, medRevival: 2, apartment: 1.2, motel: 0.5, shopRow: 1 },
  },
  crown: {
    lotArea: [1700, 3200], front: [1.5, 4], side: 1.5, back: 3, maxDepth: 48, floors: [12, 38],
    styles: { tower: 6, apartment: 0.8, shopRow: 0.4 },
  },
  harbor: {
    lotArea: [1500, 3000], front: [2, 6], side: 2, back: 4, maxDepth: 50, floors: [1, 2],
    styles: { shopRow: 1 },
  },
};

const MIN_SIZE: Record<BuildingStyle, [number, number]> = {
  decoHotel: [15, 13], decoSmall: [11, 10], medRevival: [12, 11], motel: [26, 24], shack: [8, 7],
  shopRow: [10, 9], tower: [24, 24], apartment: [14, 11],
};

export interface Lot {
  readonly poly: Poly;
  readonly block: number;
  readonly district: DistrictId;
  /** Has street frontage (buildings face it); interior lots become courtyards. */
  readonly frontage: boolean;
}

/** Split blocks into lots and place a building on each street-facing lot. */
export function planBuildings(blocks: readonly Block[], seed: number): { specs: BuildingSpec[]; lots: Lot[] } {
  const specs: BuildingSpec[] = [];
  const lots: Lot[] = [];
  for (const block of blocks) {
    const form = FORMS[block.district];
    if (!form) continue;
    const rng = new Rng(seed ^ (block.id * 7919 + 17));
    const target = rng.range(form.lotArea[0], form.lotArea[1]);
    const parts = subdivide(block.inner, target, rng, 0);
    for (const poly of parts) {
      const spec = placeOnLot(poly, block, form, rng);
      lots.push({ poly, block: block.id, district: block.district, frontage: spec !== null });
      if (spec) specs.push(spec);
    }
  }
  return { specs, lots };
}

function subdivide(poly: Poly, target: number, rng: Rng, depth: number): Poly[] {
  const a = Math.abs(area(poly));
  if (a <= target * 1.5 || depth > 8) return [poly];
  const box = obb(poly);
  // Split across the long axis.
  const t = rng.range(0.42, 0.58);
  const px = box.cx + box.ux * (t - 0.5) * 2 * box.hu;
  const pz = box.cz + box.uz * (t - 0.5) * 2 * box.hu;
  const [l, r] = splitPoly(poly, px, pz, -box.uz, box.ux);
  if (l.length < 3 || r.length < 3) return [poly];
  return [...subdivide(l, target, rng, depth + 1), ...subdivide(r, target, rng, depth + 1)];
}

function placeOnLot(lot: Poly, block: Block, form: DistrictForm, rng: Rng): BuildingSpec | null {
  // Frontage: lot edges lying on the block's inner boundary.
  const n = lot.length;
  const fronts: Array<{ i: number; len: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = lot[i]!, b = lot[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 3) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (distToPolyEdge(mx, mz, block.inner) < 0.3 && distToPolyEdge(a[0], a[1], block.inner) < 0.3 && distToPolyEdge(b[0], b[1], block.inner) < 0.3) {
      fronts.push({ i, len });
    }
  }
  if (fronts.length === 0) return null;
  fronts.sort((p, q) => q.len - p.len);
  const fi = fronts[0]!.i;
  const a = lot[fi]!, b = lot[(fi + 1) % n]!;
  const tx = (b[0] - a[0]) / fronts[0]!.len, tz = (b[1] - a[1]) / fronts[0]!.len;
  // Outward normal: away from the lot's interior.
  let nx = -tz, nz = tx;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  if (pointInPoly(mx + nx * 0.5, mz + nz * 0.5, lot)) {
    nx = -nx;
    nz = -nz;
  }
  const yaw = yawOf(nx, nz);
  // Local axes: X = right when facing the street from inside… i.e. (cos yaw, −sin yaw); Z = −n (into the lot).
  const Xx = Math.cos(yaw), Xz = -Math.sin(yaw);
  const Zx = -nx, Zz = -nz;
  let x0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of lot) {
    const dx = p[0] - mx, dz = p[1] - mz;
    const u = dx * Xx + dz * Xz;
    const w = dx * Zx + dz * Zz;
    if (u < x0) x0 = u;
    if (u > x1) x1 = u;
    if (w > z1) z1 = w;
  }
  const front = rng.range(form.front[0], form.front[1]);
  let W = x1 - x0 - 2 * form.side;
  let D = Math.min(z1 - form.back - front, form.maxDepth);
  const xc = (x0 + x1) / 2;
  // Shrink until the footprint sits inside the lot (rounded block corners).
  for (let k = 0; k < 12; k++) {
    if (fits(lot, mx, mz, Xx, Xz, Zx, Zz, xc, front, W, D)) break;
    W -= 1;
    D -= 0.6;
  }
  if (W < 7 || D < 6) return null;
  // Street corner side.
  let corner: 'left' | 'right' | null = null;
  for (const f of fronts.slice(1)) {
    const p = lot[f.i]!, q = lot[(f.i + 1) % n]!;
    const ex = (p[0] + q[0]) / 2 - mx, ez = (p[1] + q[1]) / 2 - mz;
    const dot = Math.abs((q[0] - p[0]) * tx + (q[1] - p[1]) * tz) / f.len;
    if (dot < 0.5) corner = ex * Xx + ez * Xz > 0 ? 'right' : 'left';
  }
  const style = chooseStyle(form, W, D, rng);
  if (!style) return null;
  if (style === 'shack') {
    W = Math.min(W, rng.range(9, 13.5));
    D = Math.min(D, rng.range(8, 10.5));
  }
  if (style === 'decoSmall' || style === 'medRevival') W = Math.min(W, rng.range(16, 26));
  const floors = rng.int(form.floors[0], form.floors[1]);
  const ox = mx + Xx * xc + Zx * front;
  const oz = mz + Xz * xc + Zz * front;
  return {
    style, w: W, d: D, floors: style === 'shack' ? 1 : style === 'motel' ? 2 : floors, seed: rng.int(1, 1 << 30), corner,
    x: ox, y: 0, z: oz, yaw,
  };
}

function fits(lot: Poly, mx: number, mz: number, Xx: number, Xz: number, Zx: number, Zz: number, xc: number, front: number, W: number, D: number): boolean {
  for (const [u, w] of [[-W / 2, 0.3], [W / 2, 0.3], [-W / 2, D], [W / 2, D]] as const) {
    const x = mx + Xx * (xc + u) + Zx * (front + w);
    const z = mz + Xz * (xc + u) + Zz * (front + w);
    if (!pointInPoly(x, z, lot) && distToPolyEdge(x, z, lot) > 0.4) return false;
  }
  return true;
}

function chooseStyle(form: DistrictForm, W: number, D: number, rng: Rng): BuildingStyle | null {
  const options = (Object.entries(form.styles) as Array<[BuildingStyle, number]>).filter(([s]) => W >= MIN_SIZE[s][0] && D >= MIN_SIZE[s][1]);
  if (options.length === 0) return W >= 8 && D >= 7 ? 'shack' : null;
  return rng.weighted(options, ([, w]) => w)?.[0] ?? null;
}
