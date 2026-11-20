import {
  HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Matrix4, PerspectiveCamera, Plane, Vector3, Vector4, WebGLRenderTarget,
  type IUniform, type Scene, type Texture, type WebGLRenderer,
} from 'three';
import { LAYER_REFLECTED } from '../layers';

const _normal = new Vector3(0, 1, 0);
const _planePos = new Vector3();
const _camPos = new Vector3();
const _view = new Vector3();
const _look = new Vector3();
const _target = new Vector3();
const _rot = new Matrix4();
const _plane = new Plane();
const _clip = new Vector4();
const _q = new Vector4();

/**
 * One horizontal mirror shared by water and wet roads. Renders the reflected-layer objects from a
 * mirrored camera with an oblique near plane at the given height into a half-resolution HDR target
 * with mipmaps (rough surfaces sample blurrier mips). Materials read `uReflection` and project with
 * `uReflectionMatrix`.
 */
export class PlanarReflection {
  readonly camera = new PerspectiveCamera();
  readonly uReflection: IUniform<Texture | null> = { value: null };
  /** World → reflection-texture projection. */
  readonly uReflectionMatrix: IUniform<Matrix4> = { value: new Matrix4() };
  /** x: enabled (0/1), y: plane height, z: mip count. */
  readonly uReflectionInfo: IUniform<Vector4> = { value: new Vector4(0, 0, 1, 0) };
  private target: WebGLRenderTarget | null = null;
  private scale = 0.5;
  height = 0.3;
  enabled = true;
  /** Skip every other frame on lower tiers (the mirror lags by a frame; rarely visible on water). */
  everyOther = false;
  private frame = 0;

  constructor(private readonly renderer: WebGLRenderer) {
    this.camera.layers.set(LAYER_REFLECTED);
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.enabled = scale > 0;
    this.uReflectionInfo.value.x = this.enabled ? 1 : 0;
    if (!this.enabled) {
      this.target?.dispose();
      this.target = null;
      this.uReflection.value = null;
    }
  }

  setSize(width: number, height: number): void {
    if (!this.enabled) return;
    const w = Math.max(64, Math.floor(width * this.scale));
    const h = Math.max(64, Math.floor(height * this.scale));
    if (this.target && this.target.width === w && this.target.height === h) return;
    this.target?.dispose();
    this.target = new WebGLRenderTarget(w, h, {
      type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearMipmapLinearFilter, generateMipmaps: true, depthBuffer: true,
    });
    this.target.texture.name = 'hh-reflection';
    this.uReflection.value = this.target.texture;
    this.uReflectionInfo.value.z = Math.floor(Math.log2(Math.max(w, h)));
  }

  /** Render the mirror for `camera`. Hidden objects (water, roads) must be on the main-only layer. */
  render(scene: Scene, camera: PerspectiveCamera): void {
    if (!this.enabled || !this.target) return;
    this.frame++;
    if (this.everyOther && this.frame % 2 === 1) return;
    this.uReflectionInfo.value.y = this.height;

    _planePos.set(0, this.height, 0);
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    // A camera below the mirror sees nothing useful; keep the last texture.
    if (_camPos.y < this.height + 0.05) return;

    _rot.extractRotation(camera.matrixWorld);
    _view.subVectors(_planePos, _camPos);
    _view.y = _planePos.y - _camPos.y;
    // Mirror the camera position across the plane.
    const rc = this.camera;
    rc.position.set(_camPos.x, 2 * this.height - _camPos.y, _camPos.z);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.set(_look.x, 2 * this.height - _look.y, _look.z);
    rc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    rc.lookAt(_target);
    rc.far = camera.far;
    rc.near = camera.near;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    rc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    // Texture matrix (before the oblique clip modifies the projection).
    const tm = this.uReflectionMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    // Oblique near plane so nothing below the mirror is drawn (Lengyel).
    _plane.setFromNormalAndCoplanarPoint(_normal, _planePos).applyMatrix4(rc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const p = rc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + p[8]!) / p[0]!;
    _q.y = (Math.sign(_clip.y) + p[9]!) / p[5]!;
    _q.z = -1;
    _q.w = (1 + p[10]!) / p[14]!;
    _clip.multiplyScalar(2 / _clip.dot(_q));
    p[2] = _clip.x;
    p[6] = _clip.y;
    p[10] = _clip.z + 1 - 0.003;
    p[14] = _clip.w;

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const shadowAuto = r.shadowMap.autoUpdate;
    const shadowNeeds = r.shadowMap.needsUpdate;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = false;
    r.setRenderTarget(this.target);
    r.state.buffers.depth.setMask(true);
    if (r.autoClear === false) r.clear();
    r.render(scene, rc);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = shadowAuto;
    r.shadowMap.needsUpdate = shadowNeeds;
  }

  dispose(): void {
    this.target?.dispose();
  }
}

/**
 * GLSL helpers for materials that sample the mirror. Declare the uniforms and call
 * `hhReflect(worldPos, normalOffset, roughness)`; returns HDR colour and writes availability to `.a`.
 */
export const REFLECTION_GLSL = /* glsl */ `
uniform sampler2D uReflection;
uniform mat4 uReflectionMatrix;
uniform vec4 uReflectionInfo;
vec4 hhReflect(vec3 worldPos, vec2 offset, float roughness) {
  if (uReflectionInfo.x < 0.5) return vec4(0.0);
  vec4 p = uReflectionMatrix * vec4(worldPos.x, uReflectionInfo.y, worldPos.z, 1.0);
  vec2 uv = p.xy / p.w + offset;
  float edge = smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y);
  float lod = roughness * uReflectionInfo.z * 0.7;
  vec3 c = textureLod(uReflection, uv, lod).rgb;
  return vec4(c, edge);
}
`;
