import { CircleGeometry, Color, Mesh, MeshBasicMaterial, PMREMGenerator, Scene, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { mod } from '@/core/math';
import type { EnvState } from '../api';
import type { SkyDome } from '../sky/SkyDome';

/**
 * Image-based lighting from the live sky. Renders the sky dome (with a dimmed sun disc) and a dark
 * ground disc into a PMREM whenever the time of day or weather has moved enough, so chrome, paint
 * and glass always reflect the sky that is actually overhead.
 */
export class SkyProbe {
  private readonly pmrem: PMREMGenerator;
  private readonly scene = new Scene();
  private readonly groundMat = new MeshBasicMaterial({ color: 0x222222 });
  private readonly ground: Mesh;
  private target: WebGLRenderTarget | null = null;
  private lastHours = -100;
  private lastCloud = -1;
  private lastRain = -1;
  private lastNight = -1;
  private cooldown = 0;
  private readonly tmp = new Color();
  /** Number of refreshes performed (diagnostics). */
  refreshes = 0;

  constructor(private readonly renderer: WebGLRenderer, private readonly sky: SkyDome) {
    this.pmrem = new PMREMGenerator(renderer);
    const probeSky = new Mesh(sky.mesh.geometry, sky.material);
    probeSky.frustumCulled = false;
    this.scene.add(probeSky);
    this.ground = new Mesh(new CircleGeometry(60, 32).rotateX(-Math.PI / 2), this.groundMat);
    this.ground.position.y = -1.2;
    this.scene.add(this.ground);
  }

  get texture(): Texture | null {
    return this.target?.texture ?? null;
  }

  /** Refresh when needed. Returns true if a new environment texture was produced. */
  update(env: EnvState, dtReal: number, force = false): boolean {
    this.cooldown -= dtReal;
    const dh = Math.abs(mod(env.hours - this.lastHours + 12, 24) - 12);
    const changed = dh > 0.12 || Math.abs(env.cloud - this.lastCloud) > 0.05 || Math.abs(env.rain - this.lastRain) > 0.05 || Math.abs(env.night - this.lastNight) > 0.04;
    if (!force && (!changed || this.cooldown > 0)) return false;
    this.cooldown = 1.2;
    this.lastHours = env.hours;
    this.lastCloud = env.cloud;
    this.lastRain = env.rain;
    this.lastNight = env.night;

    // Ground: asphalt and sand lit by the sky, darker at night.
    this.tmp.copy(env.cloudDark).lerp(env.keyColor, 0.25).multiplyScalar(0.14 + 0.18 * (1 - env.night));
    this.groundMat.color.copy(this.tmp);

    const sunScale = this.sky.uSunScale.value;
    this.sky.uSunScale.value = 0.3;
    const prevTarget = this.renderer.getRenderTarget();
    const shadowAuto = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    const next = this.pmrem.fromScene(this.scene, 0, 0.1, 200, { size: 256 });
    this.renderer.shadowMap.autoUpdate = shadowAuto;
    this.renderer.setRenderTarget(prevTarget);
    this.sky.uSunScale.value = sunScale;
    this.target?.dispose();
    this.target = next;
    this.refreshes++;
    return true;
  }

  dispose(): void {
    this.target?.dispose();
    this.pmrem.dispose();
    this.ground.geometry.dispose();
    this.groundMat.dispose();
  }
}
