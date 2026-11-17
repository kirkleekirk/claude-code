import type { DistrictId } from '@/content/places';
import { area, cleanPoly, lineIntersectT, offsetPolyline, polylineLength, type P2, type Poly } from '../geom';

/**
 * The street network as a planar graph. Junction shapes, curb corners, road ribbons, sidewalks
 * and city blocks are all derived from it, so they always meet exactly. Traffic lanes and GPS
 * routing (later) read the same graph.
 */

export type RoadKind = 'boulevard' | 'avenue' | 'street' | 'alley' | 'highway' | 'bridge' | 'rural';

export interface RoadProfile {
  readonly kind: RoadKind;
  readonly lanesEach: number;
  readonly laneWidth: number;
  /** Parking lane width each side (0 = none). */
  readonly parking: number;
  /** Planted median width (0 = painted centre line). */
  readonly median: number;
  /** Paved shoulder each side (rural, highway). */
  readonly shoulder: number;
  /** Sidewalk width on block edges facing this road. */
  readonly sidewalk: number;
  /** Curb radius at corners. */
  readonly curbRadius: number;
  /** Speed limit, m/s. */
  readonly speed: number;
  /** Numeric id passed to the road shader. */
  readonly shaderId: number;
}

export const PROFILES: Readonly<Record<RoadKind, RoadProfile>> = {
  boulevard: { kind: 'boulevard', lanesEach: 2, laneWidth: 3.4, parking: 2.4, median: 3.2, shoulder: 0, sidewalk: 4.6, curbRadius: 7, speed: 17.9, shaderId: 1 },
  avenue: { kind: 'avenue', lanesEach: 2, laneWidth: 3.3, parking: 2.3, median: 0, shoulder: 0, sidewalk: 3.8, curbRadius: 6, speed: 15.6, shaderId: 2 },
  street: { kind: 'street', lanesEach: 1, laneWidth: 3.3, parking: 2.2, median: 0, shoulder: 0, sidewalk: 3.0, curbRadius: 5, speed: 13.4, shaderId: 3 },
  alley: { kind: 'alley', lanesEach: 1, laneWidth: 2.8, parking: 0, median: 0, shoulder: 0, sidewalk: 0.6, curbRadius: 2, speed: 8.9, shaderId: 4 },
  highway: { kind: 'highway', lanesEach: 3, laneWidth: 3.6, parking: 0, median: 1.6, shoulder: 2.4, sidewalk: 1.0, curbRadius: 10, speed: 29, shaderId: 5 },
  bridge: { kind: 'bridge', lanesEach: 2, laneWidth: 3.5, parking: 0, median: 0.8, shoulder: 1.2, sidewalk: 1.8, curbRadius: 8, speed: 22.4, shaderId: 6 },
  rural: { kind: 'rural', lanesEach: 1, laneWidth: 3.4, parking: 0, median: 0, shoulder: 1.4, sidewalk: 0.0, curbRadius: 9, speed: 20.1, shaderId: 7 },
};

/** Curb-to-curb width. */
export function carriageWidth(p: RoadProfile): number {
  return 2 * (p.lanesEach * p.laneWidth + p.parking + p.shoulder) + p.median;
}

export interface RoadNode {
  readonly id: number;
  x: number;
  z: number;
  /** Incident edge ids. */
  readonly edges: number[];
  /** Traffic signal at this junction (set by the planner for busy crossings). */
  signal: boolean;
  /** Round cul-de-sac bulb for dead ends. */
  culdesac: boolean;
}

export interface RoadEdge {
  readonly id: number;
  readonly a: number;
  readonly b: number;
  readonly kind: RoadKind;
  /** Full centreline from node a to node b (first and last points are the node positions). */
  points: P2[];
  readonly name: string;
  readonly district: DistrictId;
  /** Deck height above ground for bridges (0 = at grade). */
  readonly elevated: number;
}

/** One road's attachment to a junction, with derived geometry. */
export interface EdgeEnd {
  readonly edge: number;
  /** True if the junction is the edge's `a` node. */
  readonly atStart: boolean;
  /** Unit direction away from the node along the road. */
  dx: number;
  dz: number;
  /** Half carriageway width. */
  hw: number;
  angle: number;
  /** Distance from the node where the road ribbon begins. */
  trim: number;
}

export interface Junction {
  readonly node: number;
  /** Ends sorted counter-clockwise (math orientation). */
  readonly ends: EdgeEnd[];
  /** Paved area of the junction. */
  polygon: Poly;
  /**
   * Curb arc between end k (its left side) and end k+1 (its right side), from the left-side
   * tangent point to the right-side tangent point.
   */
  arcs: Poly[];
  /** Crossing has crosswalks (3+ ways, not a bend). */
  crosswalks: boolean;
}

export class RoadGraph {
  readonly nodes: RoadNode[] = [];
  readonly edges: RoadEdge[] = [];
  readonly junctions = new Map<number, Junction>();

  addNode(x: number, z: number): number {
    const id = this.nodes.length;
    this.nodes.push({ id, x, z, edges: [], signal: false, culdesac: false });
    return id;
  }

  /** Find a node within `eps` metres or create one. */
  nodeAt(x: number, z: number, eps = 0.5): number {
    for (const n of this.nodes) if (Math.abs(n.x - x) < eps && Math.abs(n.z - z) < eps) return n.id;
    return this.addNode(x, z);
  }

  addEdge(a: number, b: number, kind: RoadKind, name: string, district: DistrictId, via: P2[] = [], elevated = 0): number {
    const na = this.nodes[a]!, nb = this.nodes[b]!;
    const id = this.edges.length;
    this.edges.push({ id, a, b, kind, name, district, elevated, points: [[na.x, na.z], ...via.map((p): P2 => [p[0], p[1]]), [nb.x, nb.z]] });
    na.edges.push(id);
    nb.edges.push(id);
    return id;
  }

  /** Convenience: a road along a list of points, creating/joining nodes at each point. */
  addRoad(points: P2[], kind: RoadKind, name: string, district: DistrictId, elevated = 0): number[] {
    const ids: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = this.nodeAt(points[i]![0], points[i]![1]);
      const b = this.nodeAt(points[i + 1]![0], points[i + 1]![1]);
      ids.push(this.addEdge(a, b, kind, name, district, [], elevated));
    }
    return ids;
  }

  /**
   * Split every pair of edges that cross into a proper junction. Call once after authoring.
   * Straight edges only (curved edges are authored with explicit nodes at crossings).
   */
  splitCrossings(): void {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 2000) {
      changed = false;
      outer: for (let i = 0; i < this.edges.length; i++) {
        for (let j = i + 1; j < this.edges.length; j++) {
          const e = this.edges[i]!, f = this.edges[j]!;
          if (e.points.length !== 2 || f.points.length !== 2) continue;
          if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
          if (e.elevated > 0 || f.elevated > 0) continue;
          const [p0, p1] = e.points as [P2, P2];
          const [q0, q1] = f.points as [P2, P2];
          const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
          const ex = q1[0] - q0[0], ez = q1[1] - q0[1];
          const t = lineIntersectT(p0[0], p0[1], dx, dz, q0[0], q0[1], ex, ez);
          const s = lineIntersectT(q0[0], q0[1], ex, ez, p0[0], p0[1], dx, dz);
          if (t === null || s === null || t <= 0.001 || t >= 0.999 || s <= 0.001 || s >= 0.999) continue;
          const x = p0[0] + dx * t, z = p0[1] + dz * t;
          const n = this.nodeAt(x, z, 0.5);
          this.splitEdge(e.id, n);
          this.splitEdge(f.id, n);
          changed = true;
          break outer;
        }
      }
    }
  }

  /** Split a straight edge at node `n` (which lies on it). */
  private splitEdge(edgeId: number, n: number): void {
    const e = this.edges[edgeId]!;
    if (e.a === n || e.b === n) return;
    const nb = this.nodes[e.b]!;
    const nn = this.nodes[n]!;
    // Re-point the existing edge to end at n, then add n→b.
    nb.edges.splice(nb.edges.indexOf(edgeId), 1);
    (e as { b: number }).b = n;
    e.points = [e.points[0]!, [nn.x, nn.z]];
    nn.edges.push(edgeId);
    this.addEdge(n, nb.id, e.kind, e.name, e.district, [], e.elevated);
  }

  edgeLength(e: RoadEdge): number {
    return polylineLength(e.points);
  }

  /** Compute junction geometry for every node. Must run before meshing or block extraction. */
  build(): void {
    this.junctions.clear();
    for (const node of this.nodes) {
      if (node.edges.length === 0) continue;
      const ends: EdgeEnd[] = node.edges.map((eid) => {
        const e = this.edges[eid]!;
        const atStart = e.a === node.id;
        const pts = e.points;
        const p0 = atStart ? pts[0]! : pts[pts.length - 1]!;
        const p1 = atStart ? pts[1]! : pts[pts.length - 2]!;
        let dx = p1[0] - p0[0], dz = p1[1] - p0[1];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        return { edge: eid, atStart, dx, dz, hw: carriageWidth(PROFILES[e.kind]) / 2, angle: Math.atan2(dz, dx), trim: 0 };
      });
      ends.sort((u, v) => u.angle - v.angle);
      const j: Junction = { node: node.id, ends, polygon: [], arcs: [], crosswalks: ends.length >= 3 };
      this.computeJunction(node, j);
      this.junctions.set(node.id, j);
    }
  }

  private computeJunction(node: RoadNode, j: Junction): void {
    const ends = j.ends;
    const n = ends.length;
    const cx = node.x, cz = node.z;
    if (n === 1) {
      const e = ends[0]!;
      e.trim = 0;
      j.arcs = [];
      if (node.culdesac) {
        const r = e.hw + 5;
        const poly: Poly = [];
        for (let k = 0; k <= 24; k++) {
          const a = e.angle + Math.PI / 2 + (k / 24) * Math.PI;
          poly.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
        }
        j.polygon = poly;
      } else {
        j.polygon = [];
      }
      return;
    }
    const tangentL: P2[] = new Array(n);
    const tangentR: P2[] = new Array(n);
    const tL = new Array<number>(n).fill(0);
    const tR = new Array<number>(n).fill(0);
    const arcs: Poly[] = [];
    for (let k = 0; k < n; k++) {
      const A = ends[k]!;
      const B = ends[(k + 1) % n]!;
      const prof = PROFILES[this.edges[A.edge]!.kind];
      const profB = PROFILES[this.edges[B.edge]!.kind];
      const radius = Math.min(prof.curbRadius, profB.curbRadius);
      // Left side of A and right side of B.
      const ax = cx - A.dz * A.hw, az = cz + A.dx * A.hw;
      const bx = cx + B.dz * B.hw, bz = cz - B.dx * B.hw;
      let wedge = B.angle - A.angle;
      while (wedge <= 0) wedge += Math.PI * 2;
      const t = lineIntersectT(ax, az, A.dx, A.dz, bx, bz, B.dx, B.dz);
      if (t === null || wedge > Math.PI * 0.94) {
        // Nearly straight: no curb corner, minimal trim.
        const s = Math.max(A.hw, B.hw) * 0.15;
        tangentL[k] = [ax + A.dx * s, az + A.dz * s];
        tangentR[(k + 1) % n] = [bx + B.dx * s, bz + B.dz * s];
        tL[k] = s;
        tR[(k + 1) % n] = s;
        arcs.push([tangentL[k]!, tangentR[(k + 1) % n]!]);
        continue;
      }
      const s = lineIntersectT(bx, bz, B.dx, B.dz, ax, az, A.dx, A.dz) ?? 0;
      const corner: P2 = [ax + A.dx * t, az + A.dz * t];
      const tanDist = radius / Math.tan(wedge / 2);
      const tA = Math.max(t + tanDist, 0.5);
      const tB = Math.max(s + tanDist, 0.5);
      tangentL[k] = [ax + A.dx * tA, az + A.dz * tA];
      tangentR[(k + 1) % n] = [bx + B.dx * tB, bz + B.dz * tB];
      tL[k] = tA;
      tR[(k + 1) % n] = tB;
      // Fillet arc centred on the bisector of the wedge, outside the junction.
      const bisx = A.dx + B.dx, bisz = A.dz + B.dz;
      const bl = Math.hypot(bisx, bisz) || 1;
      const centreDist = radius / Math.sin(wedge / 2);
      const ocx = corner[0] + (bisx / bl) * centreDist, ocz = corner[1] + (bisz / bl) * centreDist;
      const a0 = Math.atan2(tangentL[k]![1] - ocz, tangentL[k]![0] - ocx);
      const a1 = Math.atan2(tangentR[(k + 1) % n]![1] - ocz, tangentR[(k + 1) % n]![0] - ocx);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const seg = Math.max(3, Math.ceil(Math.abs(da) / 0.2));
      const arc: Poly = [];
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (da * i) / seg;
        arc.push([ocx + Math.cos(a) * radius, ocz + Math.sin(a) * radius]);
      }
      arcs.push(arc);
    }
    // Each road starts where both of its curb tangents are behind it.
    for (let k = 0; k < n; k++) ends[k]!.trim = Math.min(Math.max(tL[k]!, tR[k]!), 60);
    // Junction polygon: right mouth corner, left mouth corner, back along the left side to the
    // tangent point, the arc, then out along the next road's right side.
    const poly: Poly = [];
    for (let k = 0; k < n; k++) {
      const E = ends[k]!;
      const rx = cx + E.dz * E.hw, rz = cz - E.dx * E.hw;
      const lx = cx - E.dz * E.hw, lz = cz + E.dx * E.hw;
      poly.push([rx + E.dx * E.trim, rz + E.dz * E.trim]);
      poly.push([lx + E.dx * E.trim, lz + E.dz * E.trim]);
      for (const p of arcs[k]!) poly.push([p[0], p[1]]);
      const N = ends[(k + 1) % n]!;
      const nrx = cx + N.dz * N.hw, nrz = cz - N.dx * N.hw;
      poly.push([nrx + N.dx * N.trim, nrz + N.dz * N.trim]);
    }
    j.polygon = cleanPoly(poly, 0.02);
    j.arcs = arcs;
  }

  /** The end record for `edge` at `node`. */
  endOf(node: number, edge: number): EdgeEnd | undefined {
    return this.junctions.get(node)?.ends.find((e) => e.edge === edge);
  }

  /** Trim distances at both ends of an edge. */
  trims(edge: RoadEdge): [number, number] {
    return [this.endOf(edge.a, edge.id)?.trim ?? 0, this.endOf(edge.b, edge.id)?.trim ?? 0];
  }

  /**
   * One side of an edge's carriageway between its trims. `side` +1 = left of travel a→b (math
   * orientation), −1 = right.
   */
  edgeSide(edge: RoadEdge, side: 1 | -1): Poly {
    const hw = carriageWidth(PROFILES[edge.kind]) / 2;
    const off = offsetPolyline(edge.points, hw * side);
    const [ta, tb] = this.trims(edge);
    return clipPolyline(off, ta, polylineLength(off) - tb);
  }

  /**
   * Curb outlines of every bounded face (city block). Faces with negative area (the outside)
   * or implausible size are dropped.
   */
  blocks(maxArea = 160000, minArea = 150): Array<{ curb: Poly; edges: number[] }> {
    const used = new Set<string>();
    const out: Array<{ curb: Poly; edges: number[] }> = [];
    for (const e of this.edges) {
      for (const forward of [true, false]) {
        const key = `${e.id}:${forward ? 1 : 0}`;
        if (used.has(key)) continue;
        const loop: Array<{ edge: number; forward: boolean }> = [];
        let cur = { edge: e.id, forward };
        let guard = 0;
        while (guard++ < 400) {
          const k = `${cur.edge}:${cur.forward ? 1 : 0}`;
          if (used.has(k)) break;
          used.add(k);
          loop.push(cur);
          const ce = this.edges[cur.edge]!;
          const at = cur.forward ? ce.b : ce.a;
          const j = this.junctions.get(at);
          if (!j) break;
          const i = j.ends.findIndex((x) => x.edge === cur.edge && x.atStart === !cur.forward);
          const idx = i >= 0 ? i : j.ends.findIndex((x) => x.edge === cur.edge);
          // Keep the face on the left: take the next end clockwise from the arriving one.
          const nextEnd = j.ends[(idx - 1 + j.ends.length) % j.ends.length]!;
          cur = { edge: nextEnd.edge, forward: nextEnd.atStart };
          if (cur.edge === e.id && cur.forward === forward) break;
        }
        if (loop.length < 3) continue;
        const curb: Poly = [];
        for (const step of loop) {
          const ce = this.edges[step.edge]!;
          // Left of travel along the loop direction.
          const side = this.edgeSide(ce, step.forward ? 1 : -1);
          const pts = step.forward ? side : side.slice().reverse();
          for (const p of pts) curb.push(p);
          const at = step.forward ? ce.b : ce.a;
          const j = this.junctions.get(at)!;
          const i = j.ends.findIndex((x) => x.edge === step.edge && x.atStart === !step.forward);
          const k = (i - 1 + j.ends.length) % j.ends.length;
          // Arc k runs from end k's left side to end k+1's right side; we travel it backwards.
          const arc = j.arcs[k];
          if (arc) for (let q = arc.length - 1; q >= 0; q--) curb.push(arc[q]!);
        }
        const clean = cleanPoly(curb, 0.05);
        const a = area(clean);
        if (a < minArea || a > maxArea) continue;
        out.push({ curb: clean, edges: loop.map((s) => s.edge) });
      }
    }
    return out;
  }
}

/** Sub-polyline between arc lengths s0 and s1. */
export function clipPolyline(line: ReadonlyArray<readonly [number, number]>, s0: number, s1: number): Poly {
  const out: Poly = [];
  if (s1 <= s0) return out;
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!, b = line[i + 1]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const segStart = acc, segEnd = acc + l;
    if (segEnd >= s0 && segStart <= s1 && l > 0) {
      const t0 = Math.max(0, (s0 - segStart) / l);
      const t1 = Math.min(1, (s1 - segStart) / l);
      if (out.length === 0) out.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
      out.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
    }
    acc = segEnd;
  }
  return out;
}
