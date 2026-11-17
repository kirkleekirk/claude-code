import { AgXToneMapping, NoToneMapping, PCFShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { log } from '@/core/log';
import type { EnvState, QualityProfile, RenderStats } from './api';
import { Environment } from './env/Environment';
import { SkyProbe } from './env/SkyProbe';
import { LAYER_MAIN_ONLY } from './layers';
import { PostStack } from './post/PostStack';
import { PlanarReflection } from './reflection/PlanarReflection';
import { SharedUniforms } from './shared';
import { SkyDome } from './sky/SkyDome';
import { createNoiseTexture } from './tex/noiseTex';

export { LAYER_MAIN_ONLY, LAYER_REFLECTED } from './layers';

export class GfxUnsupportedError extends Error {}

/** True if this browser can run the game at all. */
export function webgl2Supported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Owns the renderer, the scene, the main camera, the environment and the post stack.
 * Everything visual hangs off this object; nothing here knows about gameplay.
 */
export class Gfx {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly shared = new SharedUniforms();
  readonly environment: Environment;
  readonly sky: SkyDome;
  readonly probe: SkyProbe;
  readonly reflection: PlanarReflection;
  readonly post: PostStack;
  quality: QualityProfile;
  /** Seconds of render time (drives shader animation). */
  time = 0;
  /** Set while the WebGL context is lost; rendering is skipped. */
  contextLost = false;
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  /** Dynamic-resolution multiplier, 0.6–1. */
  private dynamicScale = 1;
  private readonly observer: ResizeObserver;
  private frameHooks: Array<(dt: number) => void> = [];

  constructor(readonly canvas: HTMLCanvasElement, quality: QualityProfile) {
    if (!webgl2Supported()) throw new GfxUnsupportedError('WebGL2 is not available');
    this.quality = quality;
    this.renderer = new WebGLRenderer({
      canvas, antialias: !quality.post, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Shadows render once per frame in the main pass, never again for reflections or probes.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = quality.post ? NoToneMapping : AgXToneMapping;

    this.camera = new PerspectiveCamera(68, 16 / 9, 0.3, 4200);
    this.camera.layers.enable(LAYER_MAIN_ONLY);
    this.scene.add(this.camera);

    this.shared.uNoise.value = createNoiseTexture();
    this.environment = new Environment(this.scene, this.shared);
    this.environment.applyQuality(quality);
    this.sky = new SkyDome(this.shared);
    this.scene.add(this.sky.mesh);
    this.probe = new SkyProbe(this.renderer, this.sky);
    this.reflection = new PlanarReflection(this.renderer);
    this.reflection.setScale(quality.reflectionScale);
    this.post = new PostStack(this.renderer, this.scene, this.camera, quality);

    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  get env(): EnvState {
    return this.environment.state;
  }

  /** Register a per-frame render-side update (particles, glow cards, water…). */
  onFrame(fn: (dt: number) => void): () => void {
    this.frameHooks.push(fn);
    return () => {
      this.frameHooks = this.frameHooks.filter((f) => f !== fn);
    };
  }

  applyQuality(q: QualityProfile): void {
    const postChanged = q.post !== this.quality.post;
    this.quality = q;
    this.renderer.toneMapping = q.post ? NoToneMapping : AgXToneMapping;
    this.environment.applyQuality(q);
    this.reflection.setScale(q.reflectionScale);
    this.reflection.everyOther = q.tier === 'low' || q.tier === 'medium';
    this.post.applyQuality(q);
    if (postChanged) this.scene.traverse((o) => {
      const m = (o as { material?: { needsUpdate: boolean } | Array<{ needsUpdate: boolean }> }).material;
      if (Array.isArray(m)) for (const mm of m) mm.needsUpdate = true;
      else if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  /** Nudge the internal resolution to hold frame time (called by the frame-time governor). */
  setDynamicScale(scale: number): void {
    const s = Math.min(1, Math.max(0.6, Math.round(scale * 10) / 10));
    if (s === this.dynamicScale) return;
    this.dynamicScale = s;
    this.resize();
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, Math.floor(parent ? parent.clientWidth : innerWidth));
    const h = Math.max(1, Math.floor(parent ? parent.clientHeight : innerHeight));
    const dpr = Math.min(globalThis.devicePixelRatio || 1, this.quality.maxPixelRatio);
    const ratio = Math.max(0.25, dpr * this.quality.resolutionScale * this.dynamicScale);
    if (w === this.width && h === this.height && ratio === this.pixelRatio) return;
    this.width = w;
    this.height = h;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.reflection.setSize(Math.round(w * ratio), Math.round(h * ratio));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Advance render-side animation. `dt` is scaled game time; shader time follows it. */
  update(dt: number): void {
    this.time += dt;
    this.shared.uTime.value = this.time;
    this.environment.update(dt);
    this.sky.update(this.environment.state, dt);
    this.post.update(this.environment.state, this.time);
    for (let i = 0; i < this.frameHooks.length; i++) this.frameHooks[i]!(dt);
  }

  render(dtReal: number): void {
    if (this.contextLost) return;
    this.renderer.info.reset();
    if (this.probe.update(this.environment.state, dtReal)) this.scene.environment = this.probe.texture;
    this.renderer.shadowMap.needsUpdate = true;
    this.reflection.render(this.scene, this.camera);
    if (this.quality.post) this.post.render(dtReal);
    else this.renderer.render(this.scene, this.camera);
  }

  stats(): RenderStats {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      width: Math.round(this.width * this.pixelRatio),
      height: Math.round(this.height * this.pixelRatio),
      pixelRatio: this.pixelRatio,
    };
  }

  /** Render one frame and return it as a data URL (screenshots, save thumbnails, photo mode). */
  capture(type: 'image/png' | 'image/jpeg' = 'image/png', quality = 0.92): string {
    this.render(0);
    return this.canvas.toDataURL(type, quality);
  }

  /** Compile every material in the scene ahead of time so first use never hitches. */
  async prewarm(): Promise<void> {
    try {
      // Without the parallel-compile extension Three warns and compiles synchronously anyway.
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        this.renderer.compile(this.scene, this.camera);
      }
    } catch (err) {
      log.warn('gfx', `shader prewarm failed: ${String(err)}`);
    }
  }

  dispose(): void {
    this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    this.sky.dispose();
    this.probe.dispose();
    this.reflection.dispose();
    this.post.dispose();
    this.shared.uNoise.value?.dispose();
    this.renderer.dispose();
  }

  private readonly handleLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.onContextLost?.();
  };

  private readonly handleRestored = (): void => {
    this.contextLost = false;
    this.onContextRestored?.();
  };
}
