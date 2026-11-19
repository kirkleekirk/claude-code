import { Vector3 } from 'three';
import { smoothstep } from '@/core/math';
import type { World } from '@/world/World';
import type { GameContext, Stage } from './Game';

interface Shot {
  /** Camera start and end (a slow dolly), and the point it looks at. */
  from: [number, number, number];
  to: [number, number, number];
  look: [number, number, number];
  fov: number;
}

/** Golden-hour views of Halcyon Bay behind the main menu. Each holds for SHOT_SECONDS. */
const SHOTS: readonly Shot[] = [
  { from: [-752, 2.6, -40], to: [-768, 3.4, -82], look: [-940, 6, -112], fov: 58 },
  { from: [-880, 3.4, 52], to: [-905, 4.2, 30], look: [-1150, 26, 0], fov: 54 },
  { from: [-728, 15, -800], to: [-700, 18, -790], look: [0, 30, -480], fov: 46 },
  { from: [-770, 3.0, 170], to: [-762, 3.6, 120], look: [-772, 6, -60], fov: 60 },
  { from: [-300, 9.0, -828], to: [-360, 11, -820], look: [-660, 10, -812], fov: 48 },
];
const SHOT_SECONDS = 14;

const _pos = new Vector3();
const _look = new Vector3();

/**
 * The attract camera behind the front end: slow dollies across the Strand, the pier, the skyline
 * and the Causeway while the clock rolls through the golden hour.
 */
export class MenuStage implements Stage {
  private t = 0;

  constructor(private readonly ctx: GameContext, private readonly world: World) {}

  fixed(): void {}

  update(dt: number, _alpha: number, dtReal: number): void {
    this.world.update(dt);
    this.t += dtReal;
    const i = Math.floor(this.t / SHOT_SECONDS) % SHOTS.length;
    const k = smoothstep(0, 1, (this.t % SHOT_SECONDS) / SHOT_SECONDS);
    const s = SHOTS[i]!;
    _pos.set(s.from[0] + (s.to[0] - s.from[0]) * k, s.from[1] + (s.to[1] - s.from[1]) * k, s.from[2] + (s.to[2] - s.from[2]) * k);
    _look.set(s.look[0], s.look[1], s.look[2]);
    const cam = this.ctx.gfx.camera;
    cam.position.copy(_pos);
    cam.lookAt(_look);
    if (cam.fov !== s.fov) {
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
    }
  }

  debugState(): Record<string, unknown> {
    return { stage: 'menu', shot: Math.floor(this.t / SHOT_SECONDS) % SHOTS.length };
  }

  dispose(): void {
    // The world belongs to boot and outlives stages.
  }
}
