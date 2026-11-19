import { Vector3 } from 'three';
import { SurfFlag, WinStyle } from '@/render/geo/MeshBuilder';
import type { ChunkGrid, TrimeshAccumulator } from '../ChunkGrid';
import { polylineLength, samplePolyline } from '../geom';
import { causewayDeckY } from '../plan/cityPlan';
import { carriageWidth, clipPolyline, PROFILES, type RoadGraph } from '../roads/RoadGraph';
import { meshRibbon, ROAD_Y } from '../roads/RoadMesher';
import type { GlowCard } from '../props/streetProps';

/**
 * The Causeway: an elevated deck from Harbor Road to Isla Dorada with a white tied arch over the
 * central span. The arch carries a neon tube so it reads from anywhere on the bay at night.
 */
export function buildCauseway(graph: RoadGraph, grid: ChunkGrid, col: TrimeshAccumulator): { glows: GlowCard[] } {
  const glows: GlowCard[] = [];
  const edge = graph.edges.find((e) => e.kind === 'bridge');
  if (!edge) return { glows };
  const len = polylineLength(edge.points);
  const deckY = (s: number) => causewayDeckY(s, len, ROAD_Y);
  meshRibbon(graph, edge, grid, ROAD_Y, deckY);
  const prof = PROFILES.bridge;
  const hw = carriageWidth(prof) / 2;
  const [ta, tb] = graph.trims(edge);
  const centre = clipPolyline(edge.points, ta, len - tb);
  const step = 6;
  const L = polylineLength(centre);
  const walkW = 1.8;
  for (let s = 0; s < L - 0.01; s += step) {
    const s1 = Math.min(L, s + step);
    const a = samplePolyline(centre, s), c = samplePolyline(centre, s1);
    const ya = deckY(s + ta), yc = deckY(s1 + ta);
    const nx = -a.dz, nz = a.dx; // left normal (math), the −hw side is the other
    const b = grid.at((a.x + c.x) / 2, (a.z + c.z) / 2, 'city');
    // Deck slab sides and soffit below the road surface.
    for (const side of [-1, 1] as const) {
      const ex0 = a.x + nx * (hw + walkW) * side, ez0 = a.z + nz * (hw + walkW) * side;
      const ex1 = c.x + nx * (hw + walkW) * side, ez1 = c.z + nz * (hw + walkW) * side;
      b.surface('#EEE9E1', 0.8, 0, 0, SurfFlag.WET).noWindows();
      // Walls face right of travel; n is the right of the deck's direction, so the right fascia runs
      // forward and the left one backward to both face outward.
      const [p0, p1] = side > 0 ? [[ex0, ez0], [ex1, ez1]] : [[ex1, ez1], [ex0, ez0]];
      const y0 = side > 0 ? ya : yc, y1 = side > 0 ? yc : ya;
      b.quad([p0[0]!, y0 - 1.4, p0[1]!], [p1[0]!, y1 - 1.4, p1[1]!], [p1[0]!, y1 + 0.02, p1[1]!], [p0[0]!, y0 + 0.02, p0[1]!]);
      // Teal accent stripe along the fascia.
      b.surface('#17B8A8', 0.6, 0, 0, SurfFlag.WET);
      b.quad([p0[0]!, y0 - 0.5, p0[1]!], [p1[0]!, y1 - 0.5, p1[1]!], [p1[0]!, y1 - 0.28, p1[1]!], [p0[0]!, y0 - 0.28, p0[1]!]);
      // Walkway outside the barrier.
      const wx0 = a.x + nx * hw * side, wz0 = a.z + nz * hw * side, wx1 = c.x + nx * hw * side, wz1 = c.z + nz * hw * side;
      b.surface('#D8D0C4', 0.85, 0, 0, SurfFlag.WET).windows(1.2, 1.2, WinStyle.CONCRETE, 3);
      const q: [number, number, number][] = side > 0
        ? [[wx0, ya + 0.15, wz0], [ex0, ya + 0.15, ez0], [ex1, yc + 0.15, ez1], [wx1, yc + 0.15, wz1]]
        : [[ex0, ya + 0.15, ez0], [wx0, ya + 0.15, wz0], [wx1, yc + 0.15, wz1], [ex1, yc + 0.15, ez1]];
      b.quad(q[0]!, q[1]!, q[2]!, q[3]!);
      b.noWindows();
      // Jersey barrier at the carriageway edge.
      b.surface('#E6E1D8', 0.85, 0, 0, SurfFlag.WET);
      const bx0 = a.x + nx * (hw + 0.15) * side, bz0 = a.z + nz * (hw + 0.15) * side;
      const bx1 = c.x + nx * (hw + 0.15) * side, bz1 = c.z + nz * (hw + 0.15) * side;
      b.pushTRS((bx0 + bx1) / 2, (ya + yc) / 2, (bz0 + bz1) / 2, Math.atan2(-(c.x - a.x), -(c.z - a.z)));
      b.box(0, 0.42, 0, 0.32, 0.85, Math.hypot(c.x - a.x, c.z - a.z) + 0.02);
      b.pop();
      // Outer rail.
      b.surface('#FFFFFF', 0.5, 0.4, 0, SurfFlag.WET);
      b.box((ex0 + ex1) / 2, (ya + yc) / 2 + 1.1, (ez0 + ez1) / 2, Math.abs(ex1 - ex0) + 0.06, 0.06, Math.abs(ez1 - ez0) + 0.06);
      col.addQuad([bx0, ya - 0.2, bz0], [bx1, yc - 0.2, bz1], [bx1, yc + 1.0, bz1], [bx0, ya + 1.0, bz0]);
    }
    // Soffit.
    b.surface('#B9B2A8', 0.9, 0, 0, 0);
    const lx0 = a.x - nx * (hw + walkW), lz0 = a.z - nz * (hw + walkW), rx0 = a.x + nx * (hw + walkW), rz0 = a.z + nz * (hw + walkW);
    const lx1 = c.x - nx * (hw + walkW), lz1 = c.z - nz * (hw + walkW), rx1 = c.x + nx * (hw + walkW), rz1 = c.z + nz * (hw + walkW);
    b.quad([lx0, ya - 1.4, lz0], [lx1, yc - 1.4, lz1], [rx1, yc - 1.4, rz1], [rx0, ya - 1.4, rz0]);
    // Drivable deck collider.
    col.addQuad([a.x - nx * hw, ya, a.z - nz * hw], [a.x + nx * hw, ya, a.z + nz * hw], [c.x + nx * hw, yc, c.z + nz * hw], [c.x - nx * hw, yc, c.z - nz * hw]);
  }
  // Piers every 40 m where the deck is over water.
  for (let s = 60; s < L - 50; s += 40) {
    const p = samplePolyline(centre, s);
    const y = deckY(s + ta);
    const nx = -p.dz, nz = p.dx;
    const b = grid.at(p.x, p.z, 'city');
    b.surface('#E1DBD1', 0.85, 0, 0, SurfFlag.WET);
    for (const side of [-1, 1]) b.cylinder(p.x + nx * (hw - 2) * side, -8, p.z + nz * (hw - 2) * side, 0.9, 0.8, y - 1.4 + 8, 12, false);
    b.pushTRS(p.x, y - 1.9, p.z, Math.atan2(-p.dx, -p.dz));
    b.box(0, 0, 0, (hw + walkW) * 2, 1.0, 2.2);
    b.pop();
  }
  // Lamps both sides; light pools on the deck.
  for (let s = 20; s < L - 10; s += 30) {
    const p = samplePolyline(centre, s);
    const y = deckY(s + ta);
    const nx = -p.dz, nz = p.dx;
    for (const side of [-1, 1]) {
      const lx = p.x + nx * (hw + 0.5) * side, lz = p.z + nz * (hw + 0.5) * side;
      const b = grid.at(lx, lz, 'city');
      b.surface('#C9CDD2', 0.45, 0.7, 0, SurfFlag.WET);
      b.cylinder(lx, y + 0.15, lz, 0.12, 0.08, 8.2, 8, true);
      const hx = lx - nx * side * 2.2, hz = lz - nz * side * 2.2;
      b.tube([new Vector3(lx, y + 8.2, lz), new Vector3(hx, y + 8.4, hz)], 0.05, 6);
      b.surface('#E8F0FF', 0.2, 0, 6, SurfFlag.NIGHT);
      b.box(hx, y + 8.3, hz, 0.5, 0.12, 0.5);
      glows.push({ x: hx, y: y, z: hz, radius: 10, color: '#DDE8FF', intensity: 0.45 });
    }
  }
  // The tied arch over the central span, with hangers and a neon spine.
  const s0 = L * 0.32, s1 = L * 0.68;
  for (const side of [-1, 1]) {
    const arch: Vector3[] = [];
    const neonPts: Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const s = s0 + (s1 - s0) * t;
      const p = samplePolyline(centre, s);
      const nx = -p.dz, nz = p.dx;
      const y = deckY(s + ta) + 1.2 + Math.sin(Math.PI * t) * 24;
      const x = p.x + nx * (hw + walkW + 0.4) * side, z = p.z + nz * (hw + walkW + 0.4) * side;
      arch.push(new Vector3(x, y, z));
      neonPts.push(new Vector3(x - nx * side * 0.55, y - 0.2, z - nz * side * 0.55));
    }
    const mid = arch[20]!;
    const b = grid.at(mid.x, mid.z, 'city');
    b.surface('#FBF8F2', 0.35, 0.2, 0, SurfFlag.WET);
    b.tube(arch, (t) => 0.75 - 0.25 * Math.sin(Math.PI * t), 10);
    b.surface('#FF3D8B', 0.3, 0, 6.5, SurfFlag.FLICKER);
    b.tube(neonPts, 0.07, 6);
    b.surface('#EDEFF2', 0.4, 0.6, 0, SurfFlag.WET);
    for (let i = 2; i < 40; i += 2) {
      const top = arch[i]!;
      const s = s0 + ((s1 - s0) * i) / 40;
      b.tube([top.clone(), new Vector3(top.x, deckY(s + ta) + 0.2, top.z)], 0.06, 4);
    }
  }
  // Cross braces between the two arches near the crown.
  {
    const b = grid.at(samplePolyline(centre, (s0 + s1) / 2).x, samplePolyline(centre, (s0 + s1) / 2).z, 'city');
    b.surface('#FBF8F2', 0.35, 0.2, 0, SurfFlag.WET);
    for (let k = 14; k <= 26; k += 4) {
      const s = s0 + ((s1 - s0) * k) / 40;
      const p = samplePolyline(centre, s);
      const nx = -p.dz, nz = p.dx;
      const y = deckY(s + ta) + 1.2 + Math.sin(Math.PI * (k / 40)) * 24;
      const off = hw + walkW + 0.4;
      b.tube([new Vector3(p.x - nx * off, y, p.z - nz * off), new Vector3(p.x + nx * off, y, p.z + nz * off)], 0.3, 6);
    }
  }
  return { glows };
}
