import type { DistrictId } from '@/content/places';
import type { P2 } from '../geom';
import { RoadGraph, type RoadKind } from '../roads/RoadGraph';

/**
 * Authored street network. Arterials carry the city's identity (the sunset drives west along
 * Halcyon Boulevard and over the Causeway); grids fill the districts. Every crossing shares an
 * exact point so the graph forms clean junctions.
 */

export const CAUSEWAY_Z = -820;
export const CAUSEWAY_EAST = -125;
export const CAUSEWAY_WEST = -712;
/** Isla Dorada's loop road (an ellipse inside the island). */
export const ISLA = { x: -1035, z: -820, rx: 196, rz: 140 };

interface Line {
  pts: P2[];
  kind: RoadKind;
  name: string;
  district: DistrictId;
}

const xsStrandDeco = [-775, -615, -450, -290, -125];
const zsStrandDeco = [-330, -240, -120, 0, 120, 240, 360];
const xsCrown = [-125, 25, 175, 325];
const zsCrown = [-700, -580, -455, -330, -240];

function run(xs: number[], z: number): P2[] {
  return xs.map((x): P2 => [x, z]);
}
function col(zs: number[], x: number): P2[] {
  return zs.map((z): P2 => [x, z]);
}

function lines(): Line[] {
  const L: Line[] = [];
  // ── Neon Strand & Deco Row ────────────────────────────────────────────────
  L.push({ pts: col(zsStrandDeco, -775), kind: 'boulevard', name: 'Bayshore Drive', district: 'strand' });
  L.push({ pts: col(zsStrandDeco, -615), kind: 'street', name: 'Seagrape Avenue', district: 'strand' });
  L.push({ pts: col(zsStrandDeco, -450), kind: 'avenue', name: 'Flamingo Avenue', district: 'deco' });
  L.push({ pts: col(zsStrandDeco, -290), kind: 'street', name: 'Jacaranda Street', district: 'deco' });
  L.push({ pts: [...col([360, 240, 120, 0, -120, -240, -330, -455, -580, -700], -125), [-125, CAUSEWAY_Z], [-125, -1000], [-125, -1140]], kind: 'avenue', name: 'Harbor Road', district: 'harbor' });
  const ewNames: Record<number, [string, RoadKind, DistrictId]> = {
    [-330]: ['Bayfront Drive', 'avenue', 'deco'],
    [-240]: ['Pelican Street', 'street', 'deco'],
    [-120]: ['Conch Street', 'street', 'deco'],
    [0]: ['Halcyon Boulevard', 'boulevard', 'deco'],
    [120]: ['Marlin Street', 'street', 'strand'],
    [240]: ['Sandpiper Street', 'street', 'strand'],
    [360]: ['Tarpon Street', 'street', 'strand'],
  };
  for (const z of zsStrandDeco) {
    const [name, kind, district] = ewNames[z]!;
    const xs = z === -330 || z === -240 || z === 0 ? [...xsStrandDeco, ...xsCrown.slice(1)] : xsStrandDeco;
    L.push({ pts: run(xs, z), kind, name, district });
  }
  // ── Crown Point ───────────────────────────────────────────────────────────
  L.push({ pts: run(xsCrown, -700), kind: 'street', name: 'Commerce Street', district: 'crown' });
  L.push({ pts: run(xsCrown, -580), kind: 'avenue', name: 'Crown Avenue', district: 'crown' });
  L.push({ pts: run(xsCrown, -455), kind: 'street', name: 'Bank Street', district: 'crown' });
  L.push({ pts: col(zsCrown, 25), kind: 'street', name: 'Tower Lane', district: 'crown' });
  L.push({ pts: col([...zsCrown, -120, 0], 175), kind: 'avenue', name: 'Monarch Avenue', district: 'crown' });
  L.push({ pts: col(zsCrown, 325), kind: 'street', name: 'Lantern Street', district: 'crown' });
  return L;
}

export function buildCityGraph(): RoadGraph {
  const g = new RoadGraph();
  for (const l of lines()) g.addRoad(l.pts, l.kind, l.name, l.district);
  // The Causeway: a bridge from Harbor Road west to Isla Dorada.
  const east = g.nodeAt(CAUSEWAY_EAST, CAUSEWAY_Z);
  const west = g.nodeAt(CAUSEWAY_WEST - 40, CAUSEWAY_Z);
  g.addEdge(east, west, 'bridge', 'The Causeway', 'harbor', [], 1);
  // Isla Dorada: a loop road around the island's heart, joined to the Causeway.
  const loop: P2[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    loop.push([Math.round(ISLA.x + Math.cos(a) * ISLA.rx), Math.round(ISLA.z + Math.sin(a) * ISLA.rz)]);
  }
  g.addRoad([...loop, loop[0]!], 'street', 'Dorada Loop', 'isla');
  g.addRoad([[CAUSEWAY_WEST - 40, CAUSEWAY_Z], loop[0]!], 'street', 'Causeway Landing', 'isla');
  g.splitCrossings();
  for (const n of g.nodes) n.signal = n.edges.length >= 4 && n.edges.some((e) => g.edges[e]!.kind !== 'street');
  g.build();
  return g;
}

/** Height of the Causeway deck along its length (s = metres from the east landing). */
export function causewayDeckY(s: number, len: number, ground: number): number {
  const t = s / len;
  const ramp = 70 / len;
  const rise = t < ramp ? smooth(t / ramp) : t > 1 - ramp ? smooth((1 - t) / ramp) : 1;
  const arch = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.32) / 0.36))) * 6;
  return ground + rise * 7.5 + arch;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
