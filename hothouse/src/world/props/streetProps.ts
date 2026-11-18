import { Vector3 } from 'three';
import type { DistrictId } from '@/content/places';
import { Rng } from '@/core/rng';
import { SurfFlag, type MeshBuilder } from '@/render/geo/MeshBuilder';
import type { ChunkGrid } from '../ChunkGrid';
import { area } from '../geom';
import type { RoadGraph } from '../roads/RoadGraph';
import { WALK_Y, type Block } from '../roads/RoadMesher';

/** A pool of light on the ground under a lamp (additive card, night only). */
export interface GlowCard {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  intensity: number;
}

/** One lens of a traffic signal; its state is computed in the shader from the shared timing. */
export interface SignalLens {
  x: number;
  y: number;
  z: number;
  /** Direction the lens faces (unit, ground plane). */
  fx: number;
  fz: number;
  /** 0 red, 1 amber, 2 green. */
  slot: number;
  junction: number;
  axis: number;
}

/** Shared signal timing (seconds): the shader and traffic AI use the same numbers. */
export const SIGNAL_CYCLE = 36;
export const SIGNAL_GREEN = 15;
export const SIGNAL_AMBER = 3;

/** Phase offset per junction so neighbouring lights do not change in lockstep. */
export function signalOffset(junction: number): number {
  return ((junction * 7.31) % 1) * SIGNAL_CYCLE;
}

/** 0 red, 1 amber, 2 green for an approach axis at time t. */
export function signalState(junction: number, axis: number, t: number): 0 | 1 | 2 {
  const c = (((t + signalOffset(junction)) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const local = axis === 0 ? c : (c + SIGNAL_CYCLE / 2) % SIGNAL_CYCLE;
  if (local < SIGNAL_GREEN) return 2;
  if (local < SIGNAL_GREEN + SIGNAL_AMBER) return 1;
  return 0;
}

type LampStyle = 'globe' | 'deco' | 'cobra';
const LAMP: Record<LampStyle, { spacing: number; color: string; pool: number; intensity: number }> = {
  globe: { spacing: 24, color: '#FFD9A0', pool: 6.5, intensity: 0.55 },
  deco: { spacing: 28, color: '#FFC27A', pool: 8.5, intensity: 0.6 },
  cobra: { spacing: 32, color: '#DDE8FF', pool: 11, intensity: 0.5 },
};
const STYLE_BY_DISTRICT: Partial<Record<DistrictId, LampStyle>> = { strand: 'globe', deco: 'deco', crown: 'cobra', harbor: 'cobra', flats: 'cobra', isla: 'globe' };

export interface StreetPropsResult {
  glows: GlowCard[];
  lenses: SignalLens[];
  lamps: number;
}

export function placeStreetProps(graph: RoadGraph, blocks: readonly Block[], grid: ChunkGrid, seed: number): StreetPropsResult {
  const rng = new Rng(seed);
  const glows: GlowCard[] = [];
  const lenses: SignalLens[] = [];
  let lamps = 0;
  for (const block of blocks) {
    const style = STYLE_BY_DISTRICT[block.district] ?? 'cobra';
    const cfg = LAMP[style];
    const curb = block.curb;
    const n = curb.length;
    const sign = area(curb) >= 0 ? 1 : -1;
    let carry = rng.range(4, cfg.spacing);
    let furniture = rng.range(10, 40);
    for (let i = 0; i < n; i++) {
      const a = curb[i]!, c = curb[(i + 1) % n]!;
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const l = Math.hypot(dx, dz);
      if (l < 6) {
        carry = Math.max(carry, 6);
        continue;
      }
      const ux = dx / l, uz = dz / l;
      const nx = -uz * sign, nz = ux * sign; // into the block
      for (let s = carry; s < l - 4; s += cfg.spacing) {
        if (s < 4) continue;
        const px = a[0] + ux * s + nx * 0.55, pz = a[1] + uz * s + nz * 0.55;
        const b = grid.at(px, pz, 'city');
        // The lamp head reaches out over the road (outward = −n).
        const head = lamp(b, style, px, pz, -nx, -nz);
        glows.push({ x: head.x, y: 0, z: head.z, radius: cfg.pool, color: cfg.color, intensity: cfg.intensity });
        lamps++;
        carry = 0;
      }
      carry = Math.max(0, carry - l);
      // Furniture at a slower rhythm, set back from the curb.
      for (let s = furniture; s < l - 4; s += rng.range(32, 70)) {
        const fx = a[0] + ux * s + nx * 2.0, fz = a[1] + uz * s + nz * 2.0;
        const b = grid.at(fx, fz, 'city');
        const yaw = Math.atan2(-(-nx), -(-nz));
        furnitureAt(b, rng, block.district, fx, fz, yaw);
        furniture = 0;
      }
      furniture = Math.max(0, furniture - l);
    }
  }
  // Traffic signals on mast arms at signalized junctions; stop signs elsewhere.
  for (const [nodeId, j] of graph.junctions) {
    const node = graph.nodes[nodeId]!;
    if (j.ends.length < 3) continue;
    const e0 = j.ends[0]!;
    for (const end of j.ends) {
      const axis = Math.abs(end.dx * e0.dx + end.dz * e0.dz) > 0.7 ? 0 : 1;
      // Approaching traffic drives along −d on its right: the (dz, −dx) side.
      const rx = end.dz, rz = -end.dx;
      const px = node.x + end.dx * (end.trim + 1.2) + rx * (end.hw + 1.3);
      const pz = node.z + end.dz * (end.trim + 1.2) + rz * (end.hw + 1.3);
      const b = grid.at(px, pz, 'city');
      if (node.signal) {
        mastArm(b, px, pz, -rx, -rz, end.hw, end.dx, end.dz, lenses, nodeId, axis);
      } else {
        stopSign(b, px, pz, end.dx, end.dz);
      }
    }
  }
  return { glows, lenses, lamps };
}

/** Builds a lamp; returns the head position (for its light pool). */
function lamp(b: MeshBuilder, style: LampStyle, x: number, z: number, ox: number, oz: number): Vector3 {
  const y = WALK_Y;
  if (style === 'globe') {
    b.surface('#F2EFE8', 0.45, 0.5, 0, SurfFlag.WET);
    b.cylinder(x, y, z, 0.2, 0.14, 0.55, 10, true);
    b.cylinder(x, y + 0.55, z, 0.07, 0.06, 3.6, 8, false);
    b.surface('#FFE7C2', 0.2, 0, 5, SurfFlag.NIGHT);
    b.sphere(x, y + 4.42, z, 0.3, 12, 8);
    b.surface('#2E7D7A', 0.5, 0.4, 0, SurfFlag.WET);
    b.cylinder(x, y + 4.68, z, 0.22, 0.04, 0.22, 10, true);
    return new Vector3(x, y + 4.4, z);
  }
  if (style === 'deco') {
    b.surface('#1F2A2A', 0.5, 0.6, 0, SurfFlag.WET);
    b.cylinder(x, y, z, 0.18, 0.12, 0.7, 8, true);
    b.cylinder(x, y + 0.7, z, 0.08, 0.065, 5.9, 8, false);
    const arm = [new Vector3(x, y + 6.4, z), new Vector3(x + ox * 0.6, y + 6.9, z + oz * 0.6), new Vector3(x + ox * 1.4, y + 6.8, z + oz * 1.4)];
    b.tube(arm, 0.05, 6);
    const hx = x + ox * 1.45, hz = z + oz * 1.45;
    b.cylinder(hx, y + 6.45, hz, 0.24, 0.12, 0.32, 10, true);
    b.surface('#FFD39A', 0.2, 0, 6, SurfFlag.NIGHT);
    b.cylinder(hx, y + 6.35, hz, 0.2, 0.2, 0.1, 10, true);
    return new Vector3(hx, y + 6.3, hz);
  }
  // Cobra head on a tall pole with a straight arm.
  b.surface('#9AA0A8', 0.45, 0.7, 0, SurfFlag.WET);
  b.cylinder(x, y, z, 0.16, 0.1, 8.6, 8, true);
  const arm = [new Vector3(x, y + 8.4, z), new Vector3(x + ox * 2.4, y + 8.6, z + oz * 2.4)];
  b.tube(arm, 0.05, 6);
  const hx = x + ox * 2.7, hz = z + oz * 2.7;
  b.pushTRS(hx, y + 8.5, hz, Math.atan2(-ox, -oz));
  b.box(0, 0, 0, 0.42, 0.16, 0.9);
  b.surface('#E8F0FF', 0.2, 0, 6, SurfFlag.NIGHT);
  b.box(0, -0.09, 0, 0.32, 0.03, 0.7);
  b.pop();
  return new Vector3(hx, y + 8.4, hz);
}

/** Signal pole with a mast arm over the approach lanes and heads facing approaching drivers. */
function mastArm(b: MeshBuilder, x: number, z: number, ax: number, az: number, hw: number, fx: number, fz: number, lenses: SignalLens[], junction: number, axis: number): void {
  const y = WALK_Y;
  b.surface('#C9CDD2', 0.5, 0.7, 0, SurfFlag.WET);
  b.cylinder(x, y, z, 0.22, 0.16, 6.4, 10, true);
  const reach = Math.min(hw * 0.95 + 1.3, 11);
  b.tube([new Vector3(x, y + 6.0, z), new Vector3(x + ax * reach, y + 6.25, z + az * reach)], 0.09, 8);
  const heads = reach > 6 ? [reach * 0.5, reach * 0.92] : [reach * 0.85];
  for (const d of heads) {
    const hx = x + ax * d, hz = z + az * d;
    const yaw = Math.atan2(-fx, -fz);
    b.surface('#1A1C22', 0.6, 0.3, 0, SurfFlag.WET);
    b.pushTRS(hx, y + 5.3, hz, yaw);
    b.box(0, 0, 0, 0.42, 1.18, 0.32);
    // Visors.
    for (let k = 0; k < 3; k++) b.box(0, 0.36 - k * 0.36 + 0.12, -0.22, 0.34, 0.03, 0.14);
    b.pop();
    for (let slot = 0; slot < 3; slot++) {
      // Lenses sit on the front face, looking at approaching drivers (along +d). Top red, amber, green.
      lenses.push({ x: hx + fx * 0.17, y: y + 5.3 + 0.36 - slot * 0.36, z: hz + fz * 0.17, fx, fz, slot, junction, axis });
    }
  }
  // Pedestrian signal and push button on the pole.
  b.surface('#1A1C22', 0.6, 0.3, 0, SurfFlag.WET);
  b.box(x + fx * 0.25, y + 2.6, z + fz * 0.25, 0.32, 0.32, 0.2);
  b.surface('#FFB15A', 0.3, 0, 2.5, SurfFlag.NIGHT);
  b.box(x + fx * 0.36, y + 2.6, z + fz * 0.36, 0.22, 0.22, 0.02);
}

function stopSign(b: MeshBuilder, x: number, z: number, fx: number, fz: number): void {
  const y = WALK_Y;
  b.surface('#B9BEC4', 0.45, 0.7, 0, SurfFlag.WET);
  b.cylinder(x, y, z, 0.04, 0.04, 2.3, 6, true);
  b.pushTRS(x, y + 2.3, z, Math.atan2(-fx, -fz));
  b.surface('#C8202E', 0.5, 0, 0.1, SurfFlag.WET);
  b.cylinder(0, -0.02, 0, 0.38, 0.38, 0.04, 8, true, false);
  b.pop();
}

function furnitureAt(b: MeshBuilder, rng: Rng, district: DistrictId, x: number, z: number, yaw: number): void {
  const y = WALK_Y;
  const pick = rng.next();
  b.pushTRS(x, y, z, yaw);
  if (pick < 0.38) {
    // Bench: slatted wood on cast legs.
    b.surface('#2B2F33', 0.5, 0.6, 0, SurfFlag.WET);
    b.boxOn(-0.75, 0, 0, 0.08, 0.45, 0.55);
    b.boxOn(0.75, 0, 0, 0.08, 0.45, 0.55);
    b.surface(district === 'strand' ? '#2CC7B8' : '#A0724C', 0.75, 0, 0, SurfFlag.WET);
    for (let k = 0; k < 4; k++) b.box(0, 0.45, -0.2 + k * 0.13, 1.7, 0.04, 0.1);
    for (let k = 0; k < 3; k++) b.box(0, 0.62 + k * 0.13, 0.28, 1.7, 0.09, 0.04);
  } else if (pick < 0.62) {
    // Trash and recycling.
    b.surface(district === 'strand' ? '#FF6B5E' : '#2E4A3E', 0.6, 0.3, 0, SurfFlag.WET);
    b.cylinder(-0.35, 0, 0, 0.3, 0.3, 0.95, 12, true);
    b.surface('#2E6FA8', 0.6, 0.3, 0, SurfFlag.WET);
    b.cylinder(0.35, 0, 0, 0.3, 0.3, 0.95, 12, true);
  } else if (pick < 0.78) {
    // Fire hydrant.
    b.surface('#E8B23A', 0.5, 0.2, 0, SurfFlag.WET);
    b.cylinder(0, 0, 0, 0.13, 0.13, 0.62, 10, true);
    b.sphere(0, 0.66, 0, 0.13, 10, 6);
    b.cylinder(0, 0.4, -0.12, 0.05, 0.05, 0.12, 6, true);
  } else if (pick < 0.9) {
    // Newspaper boxes.
    const cols = ['#2E86C1', '#FF6B5E', '#F2B33D', '#FFFFFF'];
    for (let k = 0; k < 3; k++) {
      b.surface(cols[(k + Math.floor(x)) % cols.length]!, 0.5, 0.2, 0, SurfFlag.WET);
      b.boxOn(-0.55 + k * 0.55, 0, 0, 0.48, 1.05, 0.45);
    }
  } else {
    // Bus shelter with a glowing ad panel.
    b.surface('#C9CDD2', 0.4, 0.7, 0, SurfFlag.WET);
    for (const sx of [-1.8, 1.8]) b.boxOn(sx, 0, 0.6, 0.08, 2.5, 0.08);
    b.box(0, 2.55, 0.2, 4, 0.1, 1.6);
    b.surface('#5E8FA8', 0.05, 0, 0, SurfFlag.GLASS);
    b.boxOn(0, 0.15, 0.62, 3.5, 2.2, 0.03);
    b.surface('#FFE7C2', 0.4, 0, 1.8, SurfFlag.NIGHT);
    b.boxOn(1.6, 0.3, 0.2, 0.04, 1.7, 1.1);
    b.surface('#2B2F33', 0.6, 0.4, 0, SurfFlag.WET);
    b.box(0, 0.48, 0.4, 2.6, 0.06, 0.4);
  }
  b.pop();
}
