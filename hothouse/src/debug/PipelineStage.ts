import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, PlaneGeometry, SphereGeometry, type BufferGeometry, type Material } from 'three';
import type { GameContext, Stage } from '@/game/Game';

/**
 * Rendering regression scene (`?sandbox=pipeline`): a plaza of pastel blocks, chrome, a neon bar
 * and a long avenue for fog. Used by QA to check sky, fog, shadows, bloom and the grade at every
 * time of day without depending on the city.
 */
export class PipelineStage implements Stage {
  private readonly root = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private t = 0;

  constructor(private readonly ctx: GameContext) {
    const kit = ctx.kit;
    const ground = this.mesh(new PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), kit.standard({ color: 0x4a4250, roughness: 0.92, wet: true }));
    ground.receiveShadow = true;
    const pastel = [0xf6d8c2, 0xcfe8d8, 0xf9e7a8, 0xd9d2f0, 0xf4b8a8, 0x8fe3d8, 0xffb3c8];
    for (let i = 0; i < 42; i++) {
      const h = 6 + ((i * 7) % 9) * 3;
      const side = i % 2 === 0 ? -1 : 1;
      const m = this.mesh(new BoxGeometry(14, h, 12), kit.standard({ color: pastel[i % pastel.length]!, roughness: 0.82, wet: true }));
      m.position.set(side * (16 + (i % 3) * 3), h / 2, 20 - Math.floor(i / 2) * 26);
      m.castShadow = true;
      m.receiveShadow = true;
    }
    for (let i = 0; i < 16; i++) {
      const trunk = this.mesh(new CylinderGeometry(0.18, 0.26, 9, 8), kit.standard({ color: 0x8a6a52, roughness: 0.9 }));
      trunk.position.set(i % 2 === 0 ? -7.5 : 7.5, 4.5, 14 - i * 11);
      trunk.castShadow = true;
    }
    const chrome = this.mesh(new SphereGeometry(1.4, 48, 24), kit.physical({ color: 0xffffff, metalness: 1, roughness: 0.12, clearcoat: 1 }));
    chrome.position.set(0, 1.4, 4);
    chrome.castShadow = true;
    const neon = this.mesh(
      new BoxGeometry(6, 0.25, 0.25),
      kit.standard({ color: 0x110511, emissive: new Color(0xff3d8b), emissiveIntensity: 9, nightEmissive: false }),
    );
    neon.position.set(-8.4, 7, -6);
    const neon2 = this.mesh(new BoxGeometry(0.25, 4, 0.25), kit.standard({ color: 0x051111, emissive: new Color(0x17e0c8), emissiveIntensity: 9 }));
    neon2.position.set(8.4, 6, -18);
    ctx.gfx.scene.add(this.root);
  }

  fixed(): void {}

  update(dt: number): void {
    this.t += dt;
    const cam = this.ctx.gfx.camera;
    const a = this.t * 0.05;
    cam.position.set(Math.sin(a) * 6, 3.2, 22 + Math.cos(a) * 3);
    cam.lookAt(0, 4, -60);
  }

  debugState(): Record<string, unknown> {
    return { stage: 'pipeline', objects: this.root.children.length };
  }

  dispose(): void {
    this.ctx.gfx.scene.remove(this.root);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) this.ctx.kit.release(m);
  }

  private mesh(geometry: BufferGeometry, material: Material): Mesh {
    this.geometries.push(geometry);
    this.materials.push(material);
    const m = new Mesh(geometry, material);
    this.root.add(m);
    return m;
  }
}
