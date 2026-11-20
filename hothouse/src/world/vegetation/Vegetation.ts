import { DoubleSide, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Material, type PerspectiveCamera } from 'three';
import type { DistrictId } from '@/content/places';
import { Rng } from '@/core/rng';
import { LAYER_REFLECTED } from '@/render/layers';
import { WinStyle } from '@/render/geo/MeshBuilder';
import type { MaterialKit } from '@/render/materials/MaterialKit';
import type { ChunkGrid } from '../ChunkGrid';
import { area, samplePolyline, type P2 } from '../geom';
import type { Block, MedianLine } from '../roads/RoadMesher';
import { WALK_Y } from '../roads/RoadMesher';
import { PALM_LODS, PALM_SPECIES, PALM_VARIANTS, palmGeometry, type PalmSpecies } from './palms';

export interface PalmInstance {
  species: PalmSpecies;
  variant: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

const MIX: Partial<Record<DistrictId, Partial<Record<PalmSpecies, number>>>> = {
  strand: { coconut: 0.45, foxtail: 0.2, sabal: 0.25, date: 0.1 },
  deco: { royal: 0.3, foxtail: 0.3, sabal: 0.2, coconut: 0.2 },
  crown: { royal: 0.6, foxtail: 0.4 },
  harbor: { sabal: 0.5, coconut: 0.5 },
  flats: { sabal: 0.35, coconut: 0.25, areca: 0.2, date: 0.2 },
  isla: { royal: 0.4, date: 0.3, coconut: 0.3 },
};
const SPACING: Partial<Record<DistrictId, number>> = { strand: 13, deco: 15, crown: 19, harbor: 32, flats: 17, isla: 14 };

/** Choose palm sites along medians, curbs and the beach. Adds tree pits to the city geometry. */
export function placePalms(medians: readonly MedianLine[], blocks: readonly Block[], grid: ChunkGrid, beach: ReadonlyArray<readonly [P2, P2]>, seed: number): PalmInstance[] {
  const out: PalmInstance[] = [];
  const rng = new Rng(seed);
  const add = (species: PalmSpecies, x: number, y: number, z: number, scale = rng.range(0.85, 1.12)) => {
    out.push({ species, variant: rng.int(0, PALM_VARIANTS - 1), x, y, z, yaw: rng.range(0, Math.PI * 2), scale });
  };
  // Royal palms march down every planted median.
  for (const m of medians) {
    const len = polyLen(m.points);
    for (let s = 5; s < len - 4; s += 11) {
      const p = samplePolyline(m.points, s);
      add(m.district === 'harbor' ? 'sabal' : 'royal', p.x, WALK_Y + 0.05, p.z, rng.range(0.92, 1.08));
    }
  }
  // Curbside palms in tree pits.
  for (const block of blocks) {
    const mix = MIX[block.district];
    if (!mix) continue;
    const spacing = SPACING[block.district] ?? 16;
    const curb = block.curb;
    const n = curb.length;
    const sign = area(curb) >= 0 ? 1 : -1;
    let carry = rng.range(2, spacing);
    for (let i = 0; i < n; i++) {
      const a = curb[i]!, c = curb[(i + 1) % n]!;
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const l = Math.hypot(dx, dz);
      // Arcs (short segments at corners) stay clear: crossings, ramps and sightlines.
      if (l < 6) {
        carry = Math.max(carry, 7);
        continue;
      }
      const ux = dx / l, uz = dz / l;
      const nx = -uz * sign, nz = ux * sign;
      for (let s = carry; s < l - 5; s += spacing * rng.range(0.85, 1.15)) {
        if (s < 5) continue;
        const x = a[0] + ux * s + nx * 1.15, z = a[1] + uz * s + nz * 1.15;
        const species = pick(mix, rng);
        add(species, x, WALK_Y, z);
        treePit(grid, x, z, Math.atan2(uz, ux));
        carry = 0;
      }
      carry = Math.max(0, carry - l);
    }
  }
  // Coconut groves on the upper beach.
  for (const [p0, p1] of beach) {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    for (let s = 6; s < len; s += rng.range(10, 26)) {
      const t = s / len;
      const bx = p0[0] + (p1[0] - p0[0]) * t, bz = p0[1] + (p1[1] - p0[1]) * t;
      const clump = rng.int(1, 3);
      for (let k = 0; k < clump; k++) add('coconut', bx + rng.range(-5, 5), 0, bz + rng.range(-4, 4), rng.range(0.8, 1.15));
    }
  }
  return out;
}

function pick(mix: Partial<Record<PalmSpecies, number>>, rng: Rng): PalmSpecies {
  const entries = Object.entries(mix) as Array<[PalmSpecies, number]>;
  return rng.weighted(entries, ([, w]) => w)![0];
}

function polyLen(p: readonly P2[]): number {
  let l = 0;
  for (let i = 0; i < p.length - 1; i++) l += Math.hypot(p[i + 1]![0] - p[i]![0], p[i + 1]![1] - p[i]![1]);
  return l;
}

/** A 1.3 m square of mulch with a steel grate edge, flush with the sidewalk. */
function treePit(grid: ChunkGrid, x: number, z: number, angle: number): void {
  const b = grid.at(x, z, 'city');
  b.pushTRS(x, WALK_Y + 0.006, z, -angle);
  b.surface('#3B2F27', 0.95, 0, 0, 8).windows(0.18, 0.18, WinStyle.PAVERS, 9);
  b.quad([0.65, 0, -0.65], [-0.65, 0, -0.65], [-0.65, 0, 0.65], [0.65, 0, 0.65]);
  b.noWindows();
  b.pop();
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _up = new Vector3(0, 1, 0);
const _fwd = new Vector3();

/**
 * Instanced palms in three levels of detail. Instances are re-bucketed when the camera moves:
 * near palms get full fronds and cast shadows, far ones are a handful of triangles, and anything
 * well behind the camera is skipped.
 */
export class Vegetation {
  readonly group = new Group();
  readonly material: Material;
  private readonly meshes: InstancedMesh[][][] = [];
  private readonly lastCam = new Vector3(Infinity, 0, 0);
  private lastYaw = Infinity;
  private timer = 0;
  /** Distance thresholds for LOD 0/1/2 (metres); beyond the last, palms are not drawn. */
  lod = [95, 290, 950];

  constructor(kit: MaterialKit, readonly instances: readonly PalmInstance[]) {
    this.group.name = 'palms';
    this.material = kit.standard({ vertexColors: true, surfAttr: true, facade: true, wind: 'palm', rim: 0.4, side: DoubleSide, roughness: 1, metalness: 0 });
    const counts = new Map<string, number>();
    for (const p of instances) counts.set(`${p.species}|${p.variant}`, (counts.get(`${p.species}|${p.variant}`) ?? 0) + 1);
    PALM_SPECIES.forEach((species, si) => {
      this.meshes[si] = [];
      for (let v = 0; v < PALM_VARIANTS; v++) {
        this.meshes[si]![v] = [];
        const cap = counts.get(`${species}|${v}`) ?? 0;
        for (let l = 0; l < PALM_LODS; l++) {
          if (cap === 0) continue;
          const mesh = new InstancedMesh(palmGeometry(species, v, l), this.material, cap);
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.castShadow = l < 2;
          mesh.receiveShadow = l === 0;
          mesh.layers.set(LAYER_REFLECTED);
          mesh.name = `palm-${species}-${v}-${l}`;
          this.meshes[si]![v]![l] = mesh;
          this.group.add(mesh);
        }
      }
    });
  }

  update(camera: PerspectiveCamera, dtReal: number, force = false): void {
    this.timer += dtReal;
    camera.getWorldDirection(_fwd);
    const yaw = Math.atan2(_fwd.x, _fwd.z);
    const moved = camera.position.distanceToSquared(this.lastCam) > 144;
    const turned = Math.abs(yaw - this.lastYaw) > 0.35;
    if (!force && !moved && !turned && this.timer < 0.75) return;
    this.timer = 0;
    this.lastCam.copy(camera.position);
    this.lastYaw = yaw;
    for (const bySpecies of this.meshes) for (const byVar of bySpecies) for (const m of byVar) if (m) m.count = 0;
    const cx = camera.position.x, cz = camera.position.z;
    const [l0, l1, l2] = this.lod as [number, number, number];
    for (const p of this.instances) {
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > l2) continue;
      // Behind the camera (with room for long sunset shadows) → skip.
      if (d > 60 && (dx * _fwd.x + dz * _fwd.z) / d < -0.25) continue;
      const lod = d < l0 ? 0 : d < l1 ? 1 : 2;
      const mesh = this.meshes[PALM_SPECIES.indexOf(p.species)]![p.variant]![lod];
      if (!mesh) continue;
      _q.setFromAxisAngle(_up, p.yaw);
      _s.setScalar(p.scale);
      _p.set(p.x, p.y, p.z);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(mesh.count++, _m);
    }
    for (const bySpecies of this.meshes) {
      for (const byVar of bySpecies) {
        for (const m of byVar) {
          if (m && m.count > 0) m.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  dispose(): void {
    for (const bySpecies of this.meshes) for (const byVar of bySpecies) for (const m of byVar) m?.geometry.dispose();
  }
}
