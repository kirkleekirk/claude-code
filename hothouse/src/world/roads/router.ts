import { PROFILES, type RoadGraph } from './RoadGraph';

export type RoutePoint = readonly [number, number];

export interface Route {
  /** Polyline along road centrelines from the start's snap point to the goal's. */
  readonly points: RoutePoint[];
  /** Metres along the route. */
  readonly length: number;
  /** Estimated seconds at each road's design speed. */
  readonly seconds: number;
}

interface Snap {
  edge: number;
  /** Segment index within the edge polyline and the parameter along it. */
  seg: number;
  t: number;
  x: number;
  z: number;
  /** Metres from the edge's node a to the snap point, and the edge's total length. */
  along: number;
  length: number;
  dist: number;
}

/**
 * GPS routing over the street graph: A* on junctions with travel time as cost (so boulevards and
 * the highway are preferred), with the start and goal snapped onto the nearest road. Results are
 * plain polylines for the ground line, the minimap and the phone map.
 */
export class Router {
  private readonly lengths: Float64Array;
  private readonly speed: Float64Array;

  constructor(private readonly graph: RoadGraph) {
    const n = graph.edges.length;
    this.lengths = new Float64Array(n);
    this.speed = new Float64Array(n);
    for (const e of graph.edges) {
      let len = 0;
      for (let i = 1; i < e.points.length; i++) len += Math.hypot(e.points[i]![0] - e.points[i - 1]![0], e.points[i]![1] - e.points[i - 1]![1]);
      this.lengths[e.id] = len;
      this.speed[e.id] = PROFILES[e.kind].speed;
    }
  }

  /** Nearest point on any road to (x, z). */
  snap(x: number, z: number): Snap | null {
    let best: Snap | null = null;
    for (const e of this.graph.edges) {
      let along = 0;
      for (let i = 1; i < e.points.length; i++) {
        const [ax, az] = e.points[i - 1]!, [bx, bz] = e.points[i]!;
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        const segLen = Math.sqrt(l2);
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
        const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (!best || d < best.dist) {
          best = { edge: e.id, seg: i - 1, t, x: px, z: pz, along: along + segLen * t, length: this.lengths[e.id]!, dist: d };
        }
        along += segLen;
      }
    }
    return best;
  }

  route(fromX: number, fromZ: number, toX: number, toZ: number): Route | null {
    const s = this.snap(fromX, fromZ), g = this.snap(toX, toZ);
    if (!s || !g) return null;
    const graph = this.graph;
    // Same edge: walk straight along it.
    if (s.edge === g.edge) {
      const pts = this.slice(s.edge, s, g);
      return this.finish(pts, Math.abs(g.along - s.along) / this.speed[s.edge]!);
    }
    const se = graph.edges[s.edge]!, ge = graph.edges[g.edge]!;
    const sv = this.speed[s.edge]!, gv = this.speed[g.edge]!;
    // Virtual start: reach either end of the start edge; virtual goal: arrive from either end.
    const nNodes = graph.nodes.length;
    const cost = new Float64Array(nNodes).fill(Infinity);
    const prev = new Int32Array(nNodes).fill(-1);
    const prevEdge = new Int32Array(nNodes).fill(-1);
    const open: number[] = [];
    const fastest = 29;
    const h = (n: number) => Math.hypot(graph.nodes[n]!.x - g.x, graph.nodes[n]!.z - g.z) / fastest;
    const push = (n: number, c: number, from: number, via: number) => {
      if (c >= cost[n]!) return;
      cost[n] = c;
      prev[n] = from;
      prevEdge[n] = via;
      open.push(n);
    };
    push(se.a, s.along / sv, -1, s.edge);
    push(se.b, (s.length - s.along) / sv, -1, s.edge);
    const goalA = ge.a, goalB = ge.b;
    let bestEnd = -1;
    let bestCost = Infinity;
    const closed = new Uint8Array(nNodes);
    while (open.length) {
      // Small graphs (a few hundred junctions): a linear scan beats a heap's bookkeeping.
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (cost[open[i]!]! + h(open[i]!) < cost[open[bi]!]! + h(open[bi]!)) bi = i;
      const n = open[bi]!;
      open[bi] = open[open.length - 1]!;
      open.pop();
      if (closed[n]) continue;
      closed[n] = 1;
      if (cost[n]! + h(n) >= bestCost) break;
      if (n === goalA || n === goalB) {
        const tail = n === goalA ? g.along / gv : (g.length - g.along) / gv;
        if (cost[n]! + tail < bestCost) {
          bestCost = cost[n]! + tail;
          bestEnd = n;
        }
      }
      for (const eid of graph.nodes[n]!.edges) {
        const e = graph.edges[eid]!;
        const m = e.a === n ? e.b : e.a;
        if (closed[m]) continue;
        push(m, cost[n]! + this.lengths[eid]! / this.speed[eid]!, n, eid);
      }
    }
    if (bestEnd < 0) return null;
    // Walk back from the goal end to the start edge.
    const nodes: number[] = [];
    const edges: number[] = [];
    for (let n = bestEnd; n >= 0; n = prev[n]!) {
      nodes.push(n);
      edges.push(prevEdge[n]!);
    }
    nodes.reverse();
    edges.reverse();
    const pts: RoutePoint[] = [];
    // Start: from the snap point along the start edge to the first node.
    const first = nodes[0]!;
    pts.push(...this.slice(s.edge, s, first === se.a ? 'a' : 'b'));
    for (let i = 1; i < nodes.length; i++) {
      const e = graph.edges[edges[i]!]!;
      const forward = e.a === nodes[i - 1];
      const line = forward ? e.points : [...e.points].reverse();
      for (let k = 1; k < line.length; k++) pts.push([line[k]![0], line[k]![1]]);
    }
    // Goal: from the last node along the goal edge to the snap point.
    const tail = this.slice(g.edge, bestEnd === ge.a ? 'a' : 'b', g);
    for (let k = 1; k < tail.length; k++) pts.push(tail[k]!);
    return this.finish(pts, bestCost);
  }

  /** Points along an edge between two positions (a snap or an end node), in travel order. */
  private slice(edgeId: number, from: Snap | 'a' | 'b', to: Snap | 'a' | 'b'): RoutePoint[] {
    const e = this.graph.edges[edgeId]!;
    const last = e.points.length - 1;
    const pos = (p: Snap | 'a' | 'b'): number => (p === 'a' ? 0 : p === 'b' ? last : p.seg + p.t);
    const pt = (p: Snap | 'a' | 'b'): RoutePoint => (p === 'a' ? e.points[0]! : p === 'b' ? e.points[last]! : [p.x, p.z]);
    const a = pos(from), b = pos(to);
    const out: RoutePoint[] = [pt(from)];
    if (a <= b) {
      for (let k = Math.floor(a) + 1; k < b; k++) out.push(e.points[k]!);
    } else {
      for (let k = Math.ceil(a) - 1; k > b; k--) out.push(e.points[k]!);
    }
    out.push(pt(to));
    return out;
  }

  private finish(pts: RoutePoint[], seconds: number): Route {
    // Drop consecutive duplicates (node joins).
    const clean: RoutePoint[] = [];
    for (const p of pts) {
      const q = clean[clean.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) clean.push(p);
    }
    let length = 0;
    for (let i = 1; i < clean.length; i++) length += Math.hypot(clean[i]![0] - clean[i - 1]![0], clean[i]![1] - clean[i - 1]![1]);
    return { points: clean, length, seconds };
  }
}
