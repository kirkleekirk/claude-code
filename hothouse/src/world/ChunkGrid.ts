import { Group, Mesh, type Material } from 'three';
import { LAYER_MAIN_ONLY, LAYER_REFLECTED } from '@/render/layers';
import { MeshBuilder } from '@/render/geo/MeshBuilder';

/** Material classes for static city geometry. Each class becomes one draw call per chunk. */
export type ChunkClass = 'city' | 'road' | 'cityMain';

const OPTIONS: Record<ChunkClass, { windows: boolean; sway: boolean; layer: number; shadows: boolean }> = {
  // Buildings, sidewalks, props: facade-capable uber material, visible in reflections, cast shadows.
  city: { windows: true, sway: false, layer: LAYER_REFLECTED, shadows: true },
  // Road ribbons and junctions: their own material, main view only (they are the mirror).
  road: { windows: true, sway: false, layer: LAYER_MAIN_ONLY, shadows: false },
  // Small ground clutter that should not appear in reflections (lot caps, curbs).
  cityMain: { windows: true, sway: false, layer: LAYER_MAIN_ONLY, shadows: false },
};

/**
 * Accumulates procedural geometry into square chunks. Generators call `at(x, z, cls)` to get the
 * builder for the chunk containing a point; `finish()` turns every builder into a mesh.
 */
export class ChunkGrid {
  private readonly builders = new Map<string, MeshBuilder>();
  readonly chunkCenters = new Map<string, [number, number]>();

  constructor(readonly cell = 192) {}

  key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  at(x: number, z: number, cls: ChunkClass): MeshBuilder {
    const k = `${this.key(x, z)}|${cls}`;
    let b = this.builders.get(k);
    if (!b) {
      const o = OPTIONS[cls];
      b = new MeshBuilder({ windows: o.windows, sway: o.sway });
      this.builders.set(k, b);
      const cx = (Math.floor(x / this.cell) + 0.5) * this.cell;
      const cz = (Math.floor(z / this.cell) + 0.5) * this.cell;
      this.chunkCenters.set(this.key(x, z), [cx, cz]);
    }
    return b;
  }

  /** Build meshes for every non-empty builder. */
  finish(materials: Record<ChunkClass, Material>): Group {
    const group = new Group();
    group.name = 'city-chunks';
    for (const [k, b] of this.builders) {
      if (b.isEmpty()) continue;
      const cls = k.split('|')[1] as ChunkClass;
      const o = OPTIONS[cls];
      const mesh = new Mesh(b.build(), materials[cls]);
      mesh.name = `chunk-${k}`;
      mesh.castShadow = o.shadows;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.layers.set(o.layer);
      group.add(mesh);
    }
    this.builders.clear();
    return group;
  }

  stats(): { chunks: number; vertices: number; triangles: number } {
    let vertices = 0, triangles = 0;
    for (const b of this.builders.values()) {
      vertices += b.vertices;
      triangles += b.triangles;
    }
    return { chunks: this.builders.size, vertices, triangles };
  }
}

/** Static triangle soup for Rapier trimesh colliders (sidewalks, medians, decks, ramps). */
export class TrimeshAccumulator {
  readonly vertices: number[] = [];
  readonly indices: number[] = [];

  addQuad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
    const base = this.vertices.length / 3;
    this.vertices.push(...a, ...b, ...c, ...d);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addTriangle(a: readonly number[], b: readonly number[], c: readonly number[]): void {
    const base = this.vertices.length / 3;
    this.vertices.push(...a, ...b, ...c);
    this.indices.push(base, base + 1, base + 2);
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }
}
