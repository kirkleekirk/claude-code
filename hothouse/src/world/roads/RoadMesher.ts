import { Color } from 'three';
import type { DistrictId } from '@/content/places';
import type { TimeSlicer } from '@/core/slicer';
import { triangulate, WinStyle, type MeshBuilder } from '@/render/geo/MeshBuilder';
import type { ChunkGrid, TrimeshAccumulator } from '../ChunkGrid';
import { area, centroid, insetPoly, offsetPolyline, polylineLength, type P2, type Poly } from '../geom';
import { PLATEAU } from '../plan/coast';
import { carriageWidth, clipPolyline, PROFILES, type RoadEdge, type RoadGraph } from './RoadGraph';

export const ROAD_Y = PLATEAU + 0.012;
export const CURB_H = 0.15;
export const WALK_Y = ROAD_Y + CURB_H;

/** Sidewalk and curb looks per district (sRGB). */
const WALK_STYLE: Record<DistrictId, { walk: string; curb: string; lot: string; pattern: number; cell: number }> = {
  strand: { walk: '#E7C9A8', curb: '#F07C68', lot: '#D9C3A2', pattern: WinStyle.PAVERS, cell: 0.6 },
  deco: { walk: '#E8DDD0', curb: '#D9CFC4', lot: '#CFC3B4', pattern: WinStyle.PAVERS, cell: 0.75 },
  flats: { walk: '#D8D1C4', curb: '#C9C1B4', lot: '#9EA86A', pattern: WinStyle.CONCRETE, cell: 1.5 },
  crown: { walk: '#CFCBC6', curb: '#BDB8B2', lot: '#C2BDB6', pattern: WinStyle.CONCRETE, cell: 1.8 },
  harbor: { walk: '#BDB6AA', curb: '#B0A99D', lot: '#9F988C', pattern: WinStyle.CONCRETE, cell: 2.4 },
  sawgrass: { walk: '#C4B79E', curb: '#B2A68C', lot: '#8E9A5E', pattern: WinStyle.CONCRETE, cell: 1.5 },
  isla: { walk: '#F2E6D6', curb: '#E6DBCB', lot: '#94B06A', pattern: WinStyle.PAVERS, cell: 0.9 },
  keys: { walk: '#D8CCB2', curb: '#C8BCA2', lot: '#C9B990', pattern: WinStyle.CONCRETE, cell: 1.5 },
};

export interface Block {
  readonly id: number;
  readonly curb: Poly;
  /** Lot area inside the sidewalk. */
  readonly inner: Poly;
  readonly district: DistrictId;
  readonly edges: number[];
}

export interface MedianLine {
  readonly points: P2[];
  readonly width: number;
  readonly district: DistrictId;
}

const _c = new Color();

/** Road ribbons and junction fills (road class) plus medians (city class). */
export async function meshRoads(graph: RoadGraph, grid: ChunkGrid, col: TrimeshAccumulator, slicer: TimeSlicer): Promise<MedianLine[]> {
  const medians: MedianLine[] = [];
  for (const e of graph.edges) {
    if (e.elevated > 0) continue;
    meshRibbon(graph, e, grid, ROAD_Y);
    const prof = PROFILES[e.kind];
    if (prof.median > 0 && e.kind !== 'bridge') {
      const m = meshMedian(graph, e, grid, col);
      if (m) medians.push(m);
    }
    await slicer.breathe();
  }
  for (const j of graph.junctions.values()) {
    if (j.polygon.length < 3) continue;
    const [cx, cz] = centroid(j.polygon);
    const b = grid.at(cx, cz, 'road');
    b.windows(0, 0, 0, 4);
    b.cap(j.polygon, ROAD_Y, 1);
  }
  return medians;
}

/** A road ribbon between trims at height `y` (bridges pass their own profile via `yAt`). */
export function meshRibbon(graph: RoadGraph, e: RoadEdge, grid: ChunkGrid, y: number, yAt?: (s: number) => number): void {
  const prof = PROFILES[e.kind];
  const hw = carriageWidth(prof) / 2;
  const len = polylineLength(e.points);
  const [ta, tb] = graph.trims(e);
  if (len - ta - tb < 0.5) return;
  const centre = clipPolyline(e.points, ta, len - tb);
  // Subdivide long straight runs so per-vertex data interpolates well on bridges.
  const pts: P2[] = [];
  for (let i = 0; i < centre.length - 1; i++) {
    const a = centre[i]!, c = centre[i + 1]!;
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const steps = Math.max(1, Math.ceil(l / (yAt ? 6 : 40)));
    for (let k = 0; k < steps; k++) pts.push([a[0] + ((c[0] - a[0]) * k) / steps, a[1] + ((c[1] - a[1]) * k) / steps]);
  }
  pts.push(centre[centre.length - 1]!);
  const left = offsetPolyline(pts, -hw);
  const right = offsetPolyline(pts, hw);
  const ja = graph.junctions.get(e.a), jb = graph.junctions.get(e.b);
  const flags = (ja?.crosswalks ? 1 : 0) + (jb?.crosswalks ? 2 : 0);
  const [mx, mz] = pts[Math.floor(pts.length / 2)]!;
  const b = grid.at(mx, mz, 'road');
  b.windows(prof.shaderId, hw, len, flags);
  let s = ta;
  let prevL = -1, prevR = -1;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    const yy = yAt ? yAt(s) : y;
    const l = left[i]!, r = right[i]!;
    const il = b.vertex(l[0], yy, l[1], 0, 1, 0, -hw, s);
    const ir = b.vertex(r[0], yy, r[1], 0, 1, 0, hw, s);
    // Ribbons face up (+Y): left is the −hw side, so wind left→right→next right→next left.
    if (i > 0) b.quadIdx(prevL, prevR, ir, il);
    prevL = il;
    prevR = ir;
  }
}

/** Raised, planted median down the middle of boulevards. */
function meshMedian(graph: RoadGraph, e: RoadEdge, grid: ChunkGrid, col: TrimeshAccumulator): MedianLine | null {
  const prof = PROFILES[e.kind];
  const len = polylineLength(e.points);
  const [ta, tb] = graph.trims(e);
  const s0 = ta + 4.5, s1 = len - tb - 4.5;
  if (s1 - s0 < 6) return null;
  const centre = clipPolyline(e.points, s0, s1);
  const w = prof.median / 2 - 0.12;
  const l = offsetPolyline(centre, -w);
  const r = offsetPolyline(centre, w);
  // Rounded noses: close the polygon with the two ends.
  const outline: Poly = [...l, ...r.slice().reverse()];
  const [cx, cz] = centroid(outline);
  const b = grid.at(cx, cz, 'city');
  const top = WALK_Y + 0.05;
  b.noWindows();
  // Curb faces (concrete), walls facing out.
  b.surface('#D9D2C6', 0.85, 0, 0, 8);
  const ring = area(outline) > 0 ? outline.slice().reverse() : outline;
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, c = ring[(i + 1) % ring.length]!;
    b.wall(a[0], a[1], c[0], c[1], ROAD_Y - 0.05, top, u, ROAD_Y);
    u += Math.hypot(c[0] - a[0], c[1] - a[1]);
    col.addQuad([a[0], ROAD_Y - 0.05, a[1]], [c[0], ROAD_Y - 0.05, c[1]], [c[0], top, c[1]], [a[0], top, a[1]]);
  }
  // Planted top: mown turf.
  b.surface('#7FA552', 0.95, 0, 0, 8).windows(1.6, 1.6, WinStyle.LAWN, 3);
  b.cap(outline, top, 1);
  addCapCollider(col, outline, top);
  return { points: centre, width: prof.median, district: e.district };
}

/**
 * Sidewalks, curbs and lot caps for every block. Returns blocks with their lot polygons for the
 * building and vegetation passes.
 */
export async function meshBlocks(graph: RoadGraph, grid: ChunkGrid, col: TrimeshAccumulator, slicer: TimeSlicer): Promise<Block[]> {
  const out: Block[] = [];
  let id = 0;
  for (const raw of graph.blocks()) {
    const curb = raw.curb;
    const districts = raw.edges.map((eid) => graph.edges[eid]!.district);
    const district = mode(districts);
    const widths = raw.edges.map((eid) => PROFILES[graph.edges[eid]!.kind].sidewalk);
    const w = widths.reduce((a, b) => a + b, 0) / widths.length;
    const inner = insetPoly(curb, w);
    if (area(inner) < 80 || !sameOrientation(curb, inner)) continue;
    const style = WALK_STYLE[district];
    const [cx, cz] = centroid(curb);
    const b = grid.at(cx, cz, 'city');
    meshSidewalkRing(b, curb, inner, w, style);
    // Lot ground (under buildings, lawns and parking).
    b.surface(style.lot, 0.92, 0, 0, 8).windows(1, 1, WinStyle.PLAIN, id);
    b.cap(inner, WALK_Y, 1);
    // Colliders: curb faces, ring top, lot cap.
    const ring = area(curb) > 0 ? curb.slice().reverse() : curb;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, c = ring[(i + 1) % ring.length]!;
      col.addQuad([a[0], ROAD_Y - 0.05, a[1]], [c[0], ROAD_Y - 0.05, c[1]], [c[0], WALK_Y, c[1]], [a[0], WALK_Y, a[1]]);
    }
    addCapCollider(col, curb, WALK_Y);
    out.push({ id: id++, curb, inner, district, edges: raw.edges });
    await slicer.breathe();
  }
  return out;
}

function meshSidewalkRing(b: MeshBuilder, curb: Poly, inner: Poly, w: number, style: { walk: string; curb: string; pattern: number; cell: number }): void {
  const n = curb.length;
  // Curb face: vertical, facing the road (walls face right of travel, so walk the reversed loop).
  b.noWindows();
  b.surface(style.curb, 0.8, 0, 0, 8);
  const rev = area(curb) > 0;
  let u = 0;
  for (let k = 0; k < n; k++) {
    const i = rev ? (n - k) % n : k;
    const j = rev ? (n - k - 1 + n) % n : (k + 1) % n;
    const a = curb[i]!, c = curb[j]!;
    b.wall(a[0], a[1], c[0], c[1], ROAD_Y - 0.05, WALK_Y, u, ROAD_Y);
    u += Math.hypot(c[0] - a[0], c[1] - a[1]);
  }
  // Curb lip (lighter strip) and the walk itself, as quad strips with along/across UVs.
  const lip = insetPoly(curb, 0.28);
  _c.set(style.curb).lerp(new Color('#FFF4E3'), 0.35);
  b.surfaceLinear(_c, 0.75, 0, 0, 8).noWindows();
  strip(b, curb, lip, 0, 0.28);
  b.surface(style.walk, 0.86, 0, 0, 8).windows(style.cell * 2.4, w, style.pattern, 7);
  strip(b, lip, inner, 0.28, w);
}

/** Quad strip between two matching polygons (same vertex count) at walk height. */
function strip(b: MeshBuilder, outer: Poly, inner: Poly, t0: number, t1: number): void {
  const n = outer.length;
  const up = area(outer) > 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a0 = outer[i]!, a1 = outer[(i + 1) % n]!;
    const b0 = inner[i]!, b1 = inner[(i + 1) % n]!;
    const segLen = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    const v0 = b.vertex(a0[0], WALK_Y, a0[1], 0, 1, 0, s, t0);
    const v1 = b.vertex(a1[0], WALK_Y, a1[1], 0, 1, 0, s + segLen, t0);
    const v2 = b.vertex(b1[0], WALK_Y, b1[1], 0, 1, 0, s + segLen, t1);
    const v3 = b.vertex(b0[0], WALK_Y, b0[1], 0, 1, 0, s, t1);
    // Faces up whichever way the loop runs.
    if (up) b.quadIdx(v0, v3, v2, v1);
    else b.quadIdx(v0, v1, v2, v3);
    s += segLen;
  }
}

export function addCapCollider(col: TrimeshAccumulator, poly: Poly, y: number): void {
  const tris = triangulate(poly);
  for (let i = 0; i < tris.length; i += 3) {
    const a = poly[tris[i]!]!, b = poly[tris[i + 1]!]!, c = poly[tris[i + 2]!]!;
    col.addTriangle([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]]);
  }
}

function sameOrientation(a: Poly, b: Poly): boolean {
  return Math.sign(area(a)) === Math.sign(area(b));
}

function mode<T>(xs: readonly T[]): T {
  const counts = new Map<T, number>();
  let best = xs[0] as T;
  let bc = 0;
  for (const x of xs) {
    const c = (counts.get(x) ?? 0) + 1;
    counts.set(x, c);
    if (c > bc) {
      bc = c;
      best = x;
    }
  }
  return best;
}
