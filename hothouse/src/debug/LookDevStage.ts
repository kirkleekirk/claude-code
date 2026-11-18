import { Vector3 } from 'three';
import { damp } from '@/core/math';
import type { GameContext, Stage } from '@/game/Game';
import type { World } from '@/world/World';
import { extendHarness } from './harness';

/** Named camera framings for hero shots and look-dev review. */
export const LOOKDEV_SHOTS: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  causeway: { pos: [-260, 16, -806], look: [-700, 4, -838], fov: 55 },
  causewayLow: { pos: [-330, 9.5, -826], look: [-640, 10, -812], fov: 48 },
  strand: { pos: [-768, 3.2, 150], look: [-772, 6, -60], fov: 62 },
  bayshoreSunset: { pos: [-760, 2.4, -60], look: [-940, 6, -110], fov: 60 },
  deco: { pos: [-454, 2.8, 70], look: [-446, 10, -150], fov: 64 },
  beach: { pos: [-868, 1.9, -40], look: [-835, 9, -330], fov: 58 },
  bayfront: { pos: [-520, 3.6, -342], look: [-420, 8, -820], fov: 60 },
  skyline: { pos: [-735, 14, -810], look: [0, 30, -480], fov: 48 },
  crown: { pos: [-60, 3, -300], look: [120, 45, -560], fov: 66 },
  aerial: { pos: [-1050, 160, 260], look: [-450, 0, -300], fov: 50 },
};

/**
 * Free look-dev camera over the generated world: slow cinematic drift around a named shot, or a
 * pinned camera via the harness. Used for M1 review and the hero-shot QA script.
 */
export class LookDevStage implements Stage {
  private shot = 'causeway';
  private t = 0;
  private readonly pos = new Vector3();
  private readonly look = new Vector3();
  private drift = true;

  constructor(private readonly ctx: GameContext, private readonly world: World) {
    extendHarness({
      lookdev: (name: string, drift = false) => {
        if (!LOOKDEV_SHOTS[name]) throw new Error(`unknown shot "${name}"; expected ${Object.keys(LOOKDEV_SHOTS).join(', ')}`);
        this.shot = name;
        this.drift = drift;
        this.t = 0;
      },
      worldStats: () => this.world.stats,
    });
  }

  fixed(): void {}

  update(dt: number): void {
    this.t += dt;
    this.world.update(dt);
    const s = LOOKDEV_SHOTS[this.shot]!;
    const sway = this.drift ? Math.sin(this.t * 0.07) * 6 : 0;
    this.pos.set(s.pos[0] + sway, s.pos[1], s.pos[2]);
    this.look.set(s.look[0], s.look[1], s.look[2]);
    const cam = this.ctx.gfx.camera;
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = dt > 0 ? damp(cam.fov, s.fov, 4, dt) : s.fov;
      if (Math.abs(cam.fov - s.fov) < 0.05) cam.fov = s.fov;
      cam.updateProjectionMatrix();
    }
  }

  debugState(): Record<string, unknown> {
    return { stage: 'lookdev', shot: this.shot, world: this.world.stats };
  }

  dispose(): void {
    this.world.dispose();
  }
}
