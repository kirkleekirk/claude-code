import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, type Effect, type Pass } from 'postprocessing';
import { HalfFloatType, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { tunables } from '@/core/tunables';
import type { EnvState, QualityProfile } from '../api';
import { GradeEffect } from './GradeEffect';

const cfg = tunables.group('post.look', {
  baseContrast: { value: 1.28, min: 0.6, max: 2, step: 0.01 },
  baseSaturation: { value: 1.3, min: 0, max: 2.5, step: 0.01 },
  vignette: { value: 0.36, min: 0, max: 1, step: 0.01 },
  grain: { value: 0.045, min: 0, max: 0.3, step: 0.005 },
  bloomIntensity: { value: 0.85, min: 0, max: 4, step: 0.01 },
  bloomThreshold: { value: 1.05, min: 0, max: 6, step: 0.01 },
  bloomSmoothing: { value: 0.35, min: 0, max: 1, step: 0.01 },
  bloomRadius: { value: 0.82, min: 0.1, max: 1, step: 0.01 },
});

/**
 * Owns the effect composer. The chain is rebuilt whenever the quality profile changes; between
 * rebuilds every frame only pushes uniforms.
 */
export class PostStack {
  readonly composer: EffectComposer;
  readonly grade = new GradeEffect();
  private bloom: BloomEffect | null = null;
  private renderPass: RenderPass;
  private passes: Pass[] = [];
  private extraEffects: Effect[] = [];
  /** Multiplies exposure on top of the environment (eye adaptation, fades, photo mode). */
  exposureScale = 1;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private quality: QualityProfile,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: quality.msaa });
    this.renderPass = new RenderPass(scene, camera);
    this.build();
  }

  /** Effects contributed by other render systems (flare, god rays, heat haze…), inserted before the grade. */
  setExtraEffects(effects: Effect[]): void {
    this.extraEffects = effects;
    this.build();
  }

  applyQuality(q: QualityProfile): void {
    this.quality = q;
    this.composer.multisampling = q.msaa;
    this.build();
  }

  update(env: EnvState, time: number): void {
    if (this.bloom) {
      this.bloom.intensity = cfg.bloomIntensity * env.grade.bloom;
      this.bloom.luminanceMaterial.threshold = cfg.bloomThreshold;
      this.bloom.luminanceMaterial.smoothing = cfg.bloomSmoothing;
    }
    this.grade.set(
      {
        exposure: env.exposure * this.exposureScale,
        contrast: env.grade.contrast * cfg.baseContrast,
        saturation: env.grade.saturation * cfg.baseSaturation,
        shadowTint: env.grade.shadowTint,
        highTint: env.grade.highTint,
        tint: env.grade.tint,
        vignette: cfg.vignette,
        grain: this.quality.filmGrain ? cfg.grain : 0,
      },
      time,
    );
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  dispose(): void {
    this.composer.dispose();
  }

  private build(): void {
    for (const p of this.passes) {
      this.composer.removePass(p);
      if (p !== this.renderPass) p.dispose();
    }
    this.passes = [];
    this.bloom = null;

    this.add(this.renderPass);
    const effects: Effect[] = [];
    if (this.quality.bloom) {
      this.bloom = new BloomEffect({
        blendFunction: BlendFunction.ADD,
        mipmapBlur: true,
        luminanceThreshold: cfg.bloomThreshold,
        luminanceSmoothing: cfg.bloomSmoothing,
        intensity: cfg.bloomIntensity,
        radius: cfg.bloomRadius,
        levels: 7,
      });
      effects.push(this.bloom);
    }
    effects.push(...this.extraEffects, this.grade);
    const pass = new EffectPass(this.camera, ...effects);
    pass.dithering = true;
    this.add(pass);
  }

  private add(pass: Pass): void {
    this.composer.addPass(pass);
    this.passes.push(pass);
  }
}
