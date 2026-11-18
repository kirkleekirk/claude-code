import { AdditiveBlending, Mesh, ShaderMaterial, type IUniform } from 'three';
import { LAYER_MAIN_ONLY, LAYER_REFLECTED } from '@/render/layers';
import { MeshBuilder } from '@/render/geo/MeshBuilder';
import { ATMOSPHERE_GLSL, SHARED_PARS, type SharedUniforms } from '@/render/shared';
import { WALK_Y } from '../roads/RoadMesher';
import { SIGNAL_AMBER, SIGNAL_CYCLE, SIGNAL_GREEN, signalOffset, type GlowCard, type SignalLens } from './streetProps';

const POOL_VERT = /* glsl */ `
attribute vec4 surf;
varying vec2 vUv;
varying vec3 vColor;
varying float vStrength;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vColor = color;
  vStrength = surf.z;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const POOL_FRAG = /* glsl */ `
${SHARED_PARS}
${ATMOSPHERE_GLSL}
varying vec2 vUv;
varying vec3 vColor;
varying float vStrength;
varying vec3 vWorld;
void main() {
  float r = length(vUv);
  float fall = pow(clamp(1.0 - r, 0.0, 1.0), 1.7);
  // A slightly brighter core directly under the lamp.
  fall += pow(clamp(1.0 - r * 2.4, 0.0, 1.0), 2.0) * 0.6;
  float night = smoothstep(0.15, 0.85, uWeather.z);
  float wetBoost = 1.0 + uWeather.x * 0.5;
  vec3 col = vColor * fall * vStrength * night * wetBoost;
  col *= 1.0 - hhFogAmount(cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

const LENS_VERT = /* glsl */ `
attribute vec4 surf;
varying vec2 vUv;
varying vec4 vLens;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vLens = surf; // x slot, y axis, z phase offset
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const LENS_FRAG = /* glsl */ `
${SHARED_PARS}
${ATMOSPHERE_GLSL}
varying vec2 vUv;
varying vec4 vLens;
varying vec3 vWorld;
const float CYCLE = ${SIGNAL_CYCLE.toFixed(1)};
const float GREEN = ${SIGNAL_GREEN.toFixed(1)};
const float AMBER = ${SIGNAL_AMBER.toFixed(1)};
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float c = mod(uTime + vLens.z, CYCLE);
  float local = vLens.y < 0.5 ? c : mod(c + CYCLE * 0.5, CYCLE);
  float state = local < GREEN ? 2.0 : (local < GREEN + AMBER ? 1.0 : 0.0);
  float on = 1.0 - step(0.5, abs(state - vLens.x));
  vec3 lens = vLens.x < 0.5 ? vec3(1.0, 0.12, 0.1) : (vLens.x < 1.5 ? vec3(1.0, 0.62, 0.08) : vec3(0.12, 1.0, 0.55));
  float rim = smoothstep(1.0, 0.75, d);
  vec3 col = lens * rim * (on * 9.0 + 0.04);
  col *= 1.0 - hhFogAmount(cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Ground light pools under every street lamp, in one additive draw call. */
export function buildLightPools(glows: readonly GlowCard[], shared: SharedUniforms): Mesh | null {
  if (glows.length === 0) return null;
  const b = new MeshBuilder();
  for (const g of glows) {
    b.surface(g.color, 1, 0, g.intensity, 0);
    const y = WALK_Y + 0.02;
    const r = g.radius;
    b.quad([g.x + r, y, g.z - r], [g.x - r, y, g.z - r], [g.x - r, y, g.z + r], [g.x + r, y, g.z + r], [1, -1, -1, 1]);
  }
  const uniforms: Record<string, IUniform> = {};
  shared.attach(uniforms);
  const mat = new ShaderMaterial({
    name: 'hh-light-pools', uniforms, vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, vertexColors: true,
    blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mesh = new Mesh(b.build(), mat);
  mesh.name = 'light-pools';
  mesh.renderOrder = 4;
  mesh.layers.set(LAYER_MAIN_ONLY);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Traffic-signal lenses; each knows its junction, axis and colour and lights itself in sync. */
export function buildSignalLenses(lenses: readonly SignalLens[], shared: SharedUniforms): Mesh | null {
  if (lenses.length === 0) return null;
  const b = new MeshBuilder();
  for (const l of lenses) {
    b.color.setRGB(1, 1, 1);
    b.rough = l.slot;
    b.metal = l.axis;
    b.emissive = signalOffset(l.junction);
    b.flags = 0;
    b.pushTRS(l.x, l.y, l.z, Math.atan2(-l.fx, -l.fz));
    const r = 0.13;
    b.quad([r, -r, 0], [-r, -r, 0], [-r, r, 0], [r, r, 0], [1, -1, -1, 1]);
    b.pop();
  }
  const uniforms: Record<string, IUniform> = {};
  shared.attach(uniforms);
  const mat = new ShaderMaterial({
    name: 'hh-signal-lenses', uniforms, vertexShader: LENS_VERT, fragmentShader: LENS_FRAG, fog: false,
  });
  const mesh = new Mesh(b.build(), mat);
  mesh.name = 'signal-lenses';
  mesh.layers.set(LAYER_REFLECTED);
  mesh.matrixAutoUpdate = false;
  return mesh;
}
