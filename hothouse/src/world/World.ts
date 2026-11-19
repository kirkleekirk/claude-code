import { Group, type Material } from 'three';
import { damp } from '@/core/math';
import { log } from '@/core/log';
import type { TimeSlicer } from '@/core/slicer';
import { Collide, RAPIER, type PhysicsWorld } from '@/physics';
import type { Gfx, MaterialKit } from '@/render';
import { ChunkGrid, TrimeshAccumulator } from './ChunkGrid';
import { planBuildings, type Lot } from './buildings/lots';
import type { SignRequest } from './buildings/kit';
import { buildBuilding } from './buildings/styles';
import { PLATEAU } from './plan/coast';
import { buildCityGraph } from './plan/cityPlan';
import type { RoadGraph } from './roads/RoadGraph';
import { meshBlocks, meshRoads, ROAD_Y, type Block, type MedianLine } from './roads/RoadMesher';
import { createRoadMaterial } from './roads/roadMaterial';
import { Heightfield } from './terrain/Heightfield';
import { placePalms, Vegetation } from './vegetation/Vegetation';
import { Signs } from './signs/Signs';
import { buildLightPools, buildSignalLenses } from './props/LightCards';
import { placeStreetProps } from './props/streetProps';
import { buildBeachfront } from './landmarks/Beachfront';
import { buildPier, FerrisWheel } from './landmarks/Pier';
import { buildCauseway } from './landmarks/Causeway';
import { buildTerrain, rapierHeights } from './terrain/TerrainMesh';
import { Water } from './water/Water';

export interface WorldBuildDeps {
  gfx: Gfx;
  kit: MaterialKit;
  physics: PhysicsWorld;
  slicer: TimeSlicer;
  /** Overall progress 0–1 and a short label for the loading screen. */
  progress: (fraction: number, label: string) => void;
}

export interface WorldStats {
  palms: number;
  buildings: number;
  blocks: number;
  lots: number;
  signs: number;
  chunks: number;
  vertices: number;
  triangles: number;
  colliders: number;
  buildMs: number;
}

/**
 * Halcyon Bay, built deterministically at load: ground, water, streets, blocks and buildings,
 * with their colliders. Owns every static mesh and keeps per-frame world rendering state
 * (water follow, mirror height) up to date.
 */
export class World {
  readonly root = new Group();
  hf!: Heightfield;
  graph!: RoadGraph;
  blocks: Block[] = [];
  lots: Lot[] = [];
  medians: MedianLine[] = [];
  signs: SignRequest[] = [];
  water!: Water;
  vegetation!: Vegetation;
  signage!: Signs;
  wheel!: FerrisWheel;
  stats!: WorldStats;
  private readonly materials: Material[] = [];
  /** Materials not owned by the kit (custom shaders), disposed directly. */
  private readonly ownMaterials: Material[] = [];
  private mirrorY = ROAD_Y;

  private constructor(private readonly deps: Omit<WorldBuildDeps, 'progress' | 'slicer'>) {
    this.root.name = 'world';
  }

  static async build(d: WorldBuildDeps): Promise<World> {
    const t0 = performance.now();
    const w = new World(d);
    const { gfx, kit, physics, slicer, progress } = d;
    const stage = (from: number, to: number, label: string) => (f: number) => progress(from + (to - from) * f, label);

    // Ground and water.
    w.hf = new Heightfield(4);
    await w.hf.build(slicer, stage(0, 0.35, 'Pouring the bay'));
    const r1 = w.hf.res + 1;
    physics.addHeightfield(0, 0, w.hf.res, w.hf.res, rapierHeights(w.hf), w.hf.size, w.hf.size);
    const terrainMat = kit.uber();
    w.materials.push(terrainMat);
    const terrain = await buildTerrain(w.hf, terrainMat, slicer);
    w.root.add(terrain);
    progress(0.42, 'Raking the beach');
    void r1;

    // Streets and blocks.
    w.graph = buildCityGraph();
    const grid = new ChunkGrid(192);
    const col = new TrimeshAccumulator();
    w.medians = await meshRoads(w.graph, grid, col, slicer);
    progress(0.5, 'Painting the lanes');
    w.blocks = await meshBlocks(w.graph, grid, col, slicer);
    progress(0.56, 'Laying the sidewalks');
    const beach: Array<[[number, number], [number, number]]> = [[[-850, -312], [-850, -24]], [[-850, 24], [-850, 432]]];
    const palms = placePalms(w.medians, w.blocks, grid, beach, 0x50414c4d);
    w.vegetation = new Vegetation(kit, palms);
    w.materials.push(w.vegetation.material);
    w.root.add(w.vegetation.group);
    progress(0.58, 'Planting the palms');
    const props = placeStreetProps(w.graph, w.blocks, grid, 0x50524f50);
    const beachfront = buildBeachfront(grid, col, w.hf, 0x42454143);
    const pier = buildPier(grid, col, 0x50494552);
    const causeway = buildCauseway(w.graph, grid, col);
    w.signs.push(...beachfront.signs, ...pier.signs);
    props.glows.push(...beachfront.glows, ...pier.glows, ...causeway.glows);
    w.wheel = new FerrisWheel(kit, gfx.shared, grid);
    w.root.add(w.wheel.group);
    progress(0.6, 'Building the pier');

    // Buildings.
    const { specs, lots } = planBuildings(w.blocks, 0x48414c43);
    w.lots = lots;
    let built = 0;
    for (const spec of specs) {
      const b = grid.at(spec.x, spec.z, 'city');
      const res = buildBuilding(b, { ...spec, y: ROAD_Y + 0.15 });
      for (const box of res.boxes) {
        // Local box → world: rotate the centre by yaw about the building origin.
        const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw);
        const wx = spec.x + box.cx * c + box.cz * s;
        const wz = spec.z - box.cx * s + box.cz * c;
        physics.addStaticBox(wx, ROAD_Y + 0.15 + box.cy, wz, box.hx, box.hy, box.hz, spec.yaw);
      }
      w.signs.push(...res.signs);
      built++;
      if (built % 6 === 0) {
        progress(0.58 + 0.3 * (built / specs.length), 'Raising the hotels');
        await slicer.breathe();
      }
    }

    const cityMat = kit.uber({ facade: true });
    const roadMat = createRoadMaterial(kit, gfx.reflection);
    w.materials.push(cityMat, roadMat);
    const gstats = grid.stats();
    w.root.add(grid.finish({ city: cityMat, road: roadMat, cityMain: cityMat }));
    if (col.triangleCount > 0) {
      physics.addStaticTrimesh(new Float32Array(col.vertices), new Uint32Array(col.indices), Collide.static);
    }
    for (const mesh of [buildLightPools(props.glows, gfx.shared), buildSignalLenses(props.lenses, gfx.shared)]) {
      if (!mesh) continue;
      w.root.add(mesh);
      w.ownMaterials.push(mesh.material as Material);
    }
    progress(0.9, 'Bending the neon');
    w.signage = await Signs.build(w.signs, kit, gfx.shared, slicer);
    w.root.add(w.signage.group);
    progress(0.94, 'Filling the bay');

    w.water = new Water(w.hf, gfx.shared, gfx.reflection);
    w.root.add(w.water.mesh);
    gfx.scene.add(w.root);
    progress(1, 'Ready');
    w.stats = {
      palms: w.vegetation.instances.length,
      buildings: built, blocks: w.blocks.length, lots: lots.length, signs: w.signs.length, chunks: gstats.chunks,
      vertices: gstats.vertices, triangles: gstats.triangles, colliders: physics.world.colliders.len(),
      buildMs: Math.round(performance.now() - t0),
    };
    log.info('world', `built in ${w.stats.buildMs} ms`, w.stats);
    void RAPIER;
    return w;
  }

  /** Ground height including sidewalks (for spawning and cameras). */
  groundAt(x: number, z: number): number {
    return Math.max(this.hf.heightAt(x, z), this.hf.heightAt(x, z) >= PLATEAU - 0.01 ? ROAD_Y : -Infinity);
  }

  update(dt: number): void {
    const gfx = this.deps.gfx;
    const cam = gfx.camera.position;
    this.water.update(gfx.env, gfx.camera);
    this.vegetation.update(gfx.camera, dt);
    this.wheel.update(dt);
    // The mirror sits at street level over land and at sea level over water.
    const overLand = this.hf.heightAt(cam.x, cam.z) > 0.25;
    const target = overLand ? ROAD_Y : 0;
    this.mirrorY = dt > 0 ? damp(this.mirrorY, target, 2.5, dt) : target;
    gfx.reflection.height = this.mirrorY;
  }

  dispose(): void {
    this.deps.gfx.scene.remove(this.root);
    this.root.traverse((o) => {
      const g = (o as { geometry?: { dispose(): void } }).geometry;
      g?.dispose();
    });
    this.water.dispose();
    this.vegetation.dispose();
    this.signage.dispose(this.deps.kit);
    this.wheel.dispose(this.deps.kit);
    for (const m of this.ownMaterials) m.dispose();
    for (const m of this.materials) this.deps.kit.release(m);
  }
}
