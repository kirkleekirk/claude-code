import type { Appearance } from '@/content/appearance';
import type { MaterialKit } from '@/render/materials/MaterialKit';
import { ActorImpl, FrameStats, type ActorOptions } from './Actor';
import type { CharacterFactory, CharacterStats } from './api';
import { appearanceKey, buildPerson, type PersonGeometry } from './geometry/build';

interface Entry {
  geo: PersonGeometry;
  refs: number;
  idleSince: number;
}

/** Unreferenced geometries kept for reuse before the oldest is freed. */
const MAX_IDLE = 48;

/**
 * Shape-keyed geometry cache: actors that share build, face, hair, outfit cut and accessories
 * share one BufferGeometry. Released geometries linger (LRU) so a crowd that streams in and out
 * rarely rebuilds.
 */
export class GeometryCache {
  private readonly map = new Map<string, Entry>();
  private clock = 0;
  hits = 0;
  misses = 0;

  acquire(a: Appearance): PersonGeometry {
    const key = appearanceKey(a);
    let e = this.map.get(key);
    if (e) {
      this.hits++;
    } else {
      this.misses++;
      e = { geo: buildPerson(a), refs: 0, idleSince: 0 };
      this.map.set(key, e);
    }
    e.refs++;
    return e.geo;
  }

  release(key: string): void {
    const e = this.map.get(key);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    if (e.refs === 0) {
      e.idleSince = ++this.clock;
      this.trim();
    }
  }

  private trim(): void {
    let idle = 0;
    for (const e of this.map.values()) if (e.refs === 0) idle++;
    while (idle > MAX_IDLE) {
      let oldestKey = '';
      let oldest = Infinity;
      for (const [k, e] of this.map) {
        if (e.refs === 0 && e.idleSince < oldest) {
          oldest = e.idleSince;
          oldestKey = k;
        }
      }
      const e = this.map.get(oldestKey);
      if (!e) break;
      e.geo.geometry.dispose();
      this.map.delete(oldestKey);
      idle--;
    }
  }

  get size(): number {
    return this.map.size;
  }

  /** Geometries currently referenced by live actors. */
  get inUse(): number {
    let n = 0;
    for (const e of this.map.values()) if (e.refs > 0) n++;
    return n;
  }

  clear(): void {
    for (const e of this.map.values()) e.geo.geometry.dispose();
    this.map.clear();
  }
}

export interface CharacterFactoryImpl extends CharacterFactory {
  readonly cache: GeometryCache;
  readonly live: ReadonlySet<ActorImpl>;
  create(appearance: Appearance, opts?: ActorOptions): ActorImpl;
}

/** The people of Halcyon Bay: create actors from appearances; one draw call each. */
export function createCharacters(kit: MaterialKit): CharacterFactoryImpl {
  const cache = new GeometryCache();
  const frame = new FrameStats();
  const live = new Set<ActorImpl>();
  let serial = 0;
  const onRelease = (actor: ActorImpl) => {
    live.delete(actor);
    cache.release(actor.geo.key);
  };
  return {
    cache,
    live,
    create(appearance, opts = {}) {
      const geo = cache.acquire(appearance);
      const actor = new ActorImpl(kit, appearance, geo, frame, serial++, opts, onRelease);
      live.add(actor);
      return actor;
    },
    stats(): CharacterStats {
      return {
        actors: live.size,
        full: frame.lastFull,
        reduced: frame.lastReduced,
        culled: frame.lastCulled,
        geometries: cache.size,
        updateMs: frame.lastMs,
      };
    },
    dispose() {
      for (const a of [...live]) a.dispose();
      cache.clear();
    },
  };
}
