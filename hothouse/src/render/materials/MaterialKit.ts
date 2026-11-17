import {
  MeshPhysicalMaterial, MeshStandardMaterial,
  type IUniform, type Material, type MeshPhysicalMaterialParameters, type MeshStandardMaterialParameters, type WebGLProgramParametersWithUniforms,
} from 'three';
import { ATMOSPHERE_GLSL, SHARED_PARS, type SharedUniforms } from '../shared';
import { FACADE_GLSL, GROUND_GLSL } from './facadeGlsl';

/**
 * Every lit material in the game is created or patched here so they all share one fog model, one
 * wetness model, one wind model and one image-based-lighting balance. Patching is done with
 * `onBeforeCompile` string injection on Three's standard chunks; each distinct option set gets its
 * own program cache key.
 */

export type FogMode = 'normal' | 'additive' | 'none';
export type WindMode = 'none' | 'palm' | 'foliage' | 'grass' | 'cloth';

export interface PatchOptions {
  /** `normal` blends to the sky's horizon colour; `additive` fades emissive-only surfaces to black. */
  fogMode?: FogMode;
  /** Rain darkens and glosses upward-facing surfaces and streaks walls. */
  wet?: boolean;
  /**
   * Vertex wind sway. Geometry must carry a `sway` attribute (0 at the root … 1 at the tip) for
   * `palm`, `foliage` and `grass`; `cloth` uses local height.
   */
  wind?: WindMode;
  /** Soft rim light on silhouettes (characters, vehicles). 0 = off. */
  rim?: number;
  /** Multiplies emissive by the night factor so signs and windows switch on at dusk. */
  nightEmissive?: boolean;
  /**
   * Per-vertex surface from MeshBuilder: `surf` attribute = (roughness, metalness, emissive, flags).
   * Requires `vertexColors: true` on the material.
   */
  surfAttr?: boolean;
  /** Procedural facades from the `win` attribute (implies `surfAttr`). */
  facade?: boolean;
  /** Subtle stucco/grime breakup from the shared noise (world-scale surfaces). */
  weathering?: boolean;
  /** Custom shader code for specialised surfaces (roads, sidewalks, foliage). */
  extend?: ShaderExtension;
}

/**
 * Extra GLSL spliced into a kit material. Every hook runs inside \`main()\`; fragment hooks may
 * read \`hhBaseColor\`, \`vHHWorld\`, \`vHHWorldNormal\` and (with surfAttr) \`vUvM\`/\`vSurf\`.
 */
export interface ShaderExtension {
  /** Unique id; part of the program cache key. */
  readonly key: string;
  readonly uniforms?: Record<string, IUniform>;
  readonly vertexPars?: string;
  /** After the world position varyings are written. */
  readonly vertexMain?: string;
  readonly fragmentPars?: string;
  /** After the base colour is known (modify \`diffuseColor\`). */
  readonly fragmentColor?: string;
  /** After roughness/metalness are set (modify \`roughnessFactor\`, \`metalnessFactor\`). */
  readonly fragmentSurface?: string;
  /** After emissive (modify \`totalEmissiveRadiance\`, \`normal\`). */
  readonly fragmentEmissive?: string;
  /** After lighting, before fog (modify \`gl_FragColor\`). */
  readonly fragmentFinal?: string;
}

export interface KitStandardParams extends MeshStandardMaterialParameters, PatchOptions {}
export interface KitPhysicalParams extends MeshPhysicalMaterialParameters, PatchOptions {}

const PATCH_KEYS: ReadonlyArray<keyof PatchOptions> = ['fogMode', 'wet', 'wind', 'rim', 'nightEmissive', 'surfAttr', 'facade', 'weathering', 'extend'];

function split<T extends PatchOptions>(params: T): [Omit<T, keyof PatchOptions>, PatchOptions] {
  const p: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  const o: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) {
    if (k in p) {
      o[k] = p[k];
      delete p[k];
    }
  }
  return [p as Omit<T, keyof PatchOptions>, o as PatchOptions];
}

const VERT_PARS = /* glsl */ `
varying vec3 vHHWorld;
varying vec3 vHHWorldNormal;
`;

/** Wind: three frequencies, phase-shifted by world position so neighbours never sway in unison. */
const WIND_VERTEX = /* glsl */ `
vec3 hhWind(vec3 local, vec3 worldBase, float sway, float stiffness, float flutter) {
  float t = uWind.w;
  float phase = dot(worldBase.xz, vec2(0.071, 0.053));
  float gust = 0.55 + 0.45 * sin(t * 0.37 + phase * 0.6) * sin(t * 0.23 + phase);
  float s = uWind.z * gust;
  float bend = sway * sway * stiffness;
  float primary = sin(t * 1.1 + phase) * 0.6 + sin(t * 1.9 + phase * 1.7) * 0.25;
  vec3 offset = vec3(uWind.x, 0.0, uWind.y) * (0.55 + primary) * s * bend;
  offset.y -= bend * s * 0.18;
  float leaf = sin(t * 6.3 + phase * 9.0 + local.x * 3.1 + local.z * 2.7) * flutter * sway * s;
  offset += vec3(leaf * 0.6, leaf * 0.4, leaf * 0.5);
  return offset;
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vHHWorld;
varying vec3 vHHWorldNormal;
`;

const SURF_VERT_PARS = /* glsl */ `
attribute vec4 surf;
flat varying vec4 vSurf;
varying vec2 vUvM;
`;
const SURF_FRAG_PARS = /* glsl */ `
flat varying vec4 vSurf;
varying vec2 vUvM;
float hhFlag(float flags, float bit) { return mod(floor(flags / bit), 2.0); }
`;
const WIN_VERT_PARS = /* glsl */ `
attribute vec4 win;
flat varying vec4 vWin;
`;
const WIN_FRAG_PARS = /* glsl */ `
flat varying vec4 vWin;
const vec3 HH_ACCENTS[6] = vec3[6](
  vec3(0.02, 0.42, 0.40), vec3(0.95, 0.30, 0.22), vec3(0.06, 0.09, 0.30),
  vec3(0.92, 0.92, 0.88), vec3(0.98, 0.62, 0.70), vec3(0.20, 0.52, 0.36)
);
`;

/** Facade, emissive and surface handling, injected after the emissive chunk. */
const SURF_FRAGMENT = /* glsl */ `
{
  float hhEm = vSurf.z;
  float hhNight = uWeather.z;
  float hhGate = 1.0;
  if (hhFlag(vSurf.w, 1.0) > 0.5) hhGate = smoothstep(0.05, 0.75, hhNight);
  if (hhFlag(vSurf.w, 2.0) > 0.5) {
    // Neon: a faint daytime glow, full at night, and a nervous flicker on some tubes.
    float seed = floor(vHHWorld.x * 0.37) + floor(vHHWorld.z * 0.53);
    float fl = 0.92 + 0.08 * sin(uTime * 31.0 + seed);
    float drop = step(0.985, fract(sin(floor(uTime * 7.0) + seed) * 43758.5)) * step(0.7, fract(seed * 0.618));
    hhGate = mix(0.22, 1.0, smoothstep(0.0, 0.8, hhNight)) * fl * (1.0 - drop * 0.85);
  }
  totalEmissiveRadiance += hhBaseColor * hhEm * hhGate;
  if (hhFlag(vSurf.w, 4.0) > 0.5) {
    diffuseColor.rgb = hhBaseColor * 0.12;
    roughnessFactor = 0.04;
    metalnessFactor = 0.0;
  }
}
`;

const FACADE_FRAGMENT = /* glsl */ `
if (vWin.z > 19.5) {
  float gTone, gSeam, gRough, gPaintMask;
  vec3 gPaint;
  hhGround(vUvM, vWin, gTone, gSeam, gRough, gPaint, gPaintMask);
  diffuseColor.rgb *= gTone;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, gSeam);
  diffuseColor.rgb = mix(diffuseColor.rgb, gPaint, gPaintMask);
  roughnessFactor = clamp(roughnessFactor + gRough + gSeam * 0.1, 0.03, 1.0);
} else if (vWin.z > 0.5) {
  vec2 g = vUvM / max(vWin.xy, vec2(0.05));
  vec2 cellId = floor(g);
  vec2 f = fract(g);
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 aa = fw * 0.85;
  float detail = 1.0 - smoothstep(0.1, 0.38, max(fw.x, fw.y));
  if (vWin.z > 8.5) {
    // Corrugated metal: ribs every 15 cm, faded out with distance.
    float ph = vUvM.x * 41.9;
    float rib = sin(ph) * detail;
    diffuseColor.rgb *= 1.0 + rib * 0.1;
    vec3 tW = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(vHHWorldNormal)));
    vec3 tV = (viewMatrix * vec4(tW, 0.0)).xyz;
    normal = normalize(normal + tV * cos(ph) * 0.45 * detail);
  } else {
    float glass, frame, sill, shutter, avg;
    vec2 gUv, gSize;
    hhWindows(f, aa, vWin.z, vWin.w, cellId, glass, frame, sill, shutter, gUv, gSize, avg);
    glass = mix(avg, glass, detail);
    frame *= detail;
    sill *= detail;
    shutter *= detail;
    float hsh = hhHash12(cellId + vWin.w * 17.0);
    float slow = floor(uTime / 40.0 + hsh * 7.0);
    float flick = hhHash12(cellId + slow * 1.7 + vWin.w);
    float officeLike = step(3.5, vWin.z) * step(vWin.z, 4.5);
    float litChance = uWeather.z * mix(0.34 + 0.3 * hhHash12(vec2(vWin.w, 3.3)), 0.62, officeLike);
    float lightOn = step(flick * 0.12 + hsh * 0.88, litChance);
    vec3 Vw = normalize(vHHWorld - cameraPosition);
    vec3 Nw = normalize(vHHWorldNormal);
    vec3 Tw = normalize(cross(vec3(0.0, 1.0, 0.0), Nw));
    vec2 gm = max(gSize * vWin.xy, vec2(0.2));
    vec3 rayT = vec3(dot(Vw, Tw) / gm.x, Vw.y / gm.y, dot(Vw, -Nw) / mix(3.2, 6.0, officeLike));
    float em;
    vec3 room = hhInterior(gUv, rayT, vWin.w, cellId, lightOn, em);
    vec3 avgRoom = lightOn * hhRoomColor(fract(hsh * 13.37), 1.0) * 0.55;
    room = mix(avgRoom, room, detail);
    vec3 trim = mix(hhBaseColor, vec3(0.92, 0.9, 0.86), 0.72);
    vec3 accent = HH_ACCENTS[int(mod(floor(vWin.w), 6.0))];
    diffuseColor.rgb = mix(diffuseColor.rgb, trim, clamp(max(frame, sill), 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, accent, clamp(shutter, 0.0, 1.0));
    vec3 glassTint = mix(vec3(0.018, 0.03, 0.036), vec3(0.03, 0.05, 0.07), officeLike);
    diffuseColor.rgb = mix(diffuseColor.rgb, glassTint + room * (1.0 - em) * 0.6, glass);
    roughnessFactor = mix(roughnessFactor, 0.05, glass);
    metalnessFactor = mix(metalnessFactor, 0.0, glass);
    totalEmissiveRadiance += room * glass * em * 2.4;
  }
}
`;

const WEATHERING_FRAGMENT = /* glsl */ `
{
  // Large-scale tonal breakup and a grime gradient at the foot of walls.
  float hhN = texture2D(uNoise, vHHWorld.xz * 0.019 + vHHWorld.y * 0.011).g;
  float hhN2 = texture2D(uNoise, vec2(vHHWorld.x + vHHWorld.z, vHHWorld.y) * 0.21).b;
  float hhWall = 1.0 - abs(normalize(vHHWorldNormal).y);
  float hhFoot = mix(0.8, 1.0, smoothstep(0.0, 1.1, vUvM.y)) ;
  diffuseColor.rgb *= (0.93 + 0.12 * hhN) * mix(1.0, (0.95 + 0.08 * hhN2) * hhFoot, hhWall);
}
`;

export class MaterialKit {
  /** Materials created by the kit, for bulk updates (quality changes) and disposal. */
  private readonly owned = new Set<Material>();

  constructor(private readonly shared: SharedUniforms) {}

  standard(params: KitStandardParams = {}): MeshStandardMaterial {
    const [mp, opts] = split(params);
    const m = new MeshStandardMaterial(mp);
    this.patch(m, opts);
    return m;
  }

  physical(params: KitPhysicalParams = {}): MeshPhysicalMaterial {
    const [mp, opts] = split(params);
    const m = new MeshPhysicalMaterial(mp);
    this.patch(m, opts);
    return m;
  }

  /** The city's main material: vertex colours, per-vertex surface, facades, wetness, weathering. */
  uber(extra: Partial<PatchOptions> = {}): MeshStandardMaterial {
    return this.standard({ vertexColors: true, roughness: 1, metalness: 1, surfAttr: true, wet: true, weathering: true, ...extra });
  }

  /** Patch an existing standard/physical material in place. */
  patch<M extends MeshStandardMaterial>(material: M, opts: PatchOptions = {}): M {
    const fog: FogMode = opts.fogMode ?? 'normal';
    const wet = opts.wet ?? false;
    const wind: WindMode = opts.wind ?? 'none';
    const rim = opts.rim ?? 0;
    const nightEmissive = opts.nightEmissive ?? false;
    const facade = opts.facade ?? false;
    const surf = (opts.surfAttr ?? false) || facade;
    const weathering = (opts.weathering ?? false) && surf;
    const ext = opts.extend;
    const shared = this.shared;
    material.fog = false; // our fog replaces Three's
    const key = `hh|${fog}|${+wet}|${wind}|${rim}|${+nightEmissive}|${+surf}|${+facade}|${+weathering}|${ext?.key ?? ''}`;
    const base = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `${base()}|${key}`;

    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shared.attach(shader.uniforms);
      shader.uniforms.uRim = { value: rim };
      if (ext?.uniforms) Object.assign(shader.uniforms, ext.uniforms);

      // ── vertex ──────────────────────────────────────────────────────────
      let vs = shader.vertexShader;
      const swayAttr = wind === 'palm' || wind === 'foliage' || wind === 'grass';
      vs = vs.replace(
        '#include <common>',
        `#include <common>\n${SHARED_PARS}\n${VERT_PARS}\n${wind !== 'none' ? WIND_VERTEX : ''}\n${swayAttr ? 'attribute float sway;' : ''}\n${surf ? SURF_VERT_PARS : ''}\n${facade ? WIN_VERT_PARS : ''}\n${ext?.vertexPars ?? ''}`,
      );
      if (wind !== 'none') {
        const stiffness = wind === 'palm' ? '1.25' : wind === 'grass' ? '0.35' : wind === 'cloth' ? '0.25' : '0.45';
        const flutter = wind === 'palm' ? '0.09' : wind === 'grass' ? '0.04' : wind === 'cloth' ? '0.05' : '0.06';
        const swayExpr = wind === 'cloth' ? 'clamp(position.y * 0.5, 0.0, 1.0)' : 'sway';
        vs = vs.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            vec4 hhBase = vec4(0.0, 0.0, 0.0, 1.0);
            #ifdef USE_INSTANCING
              hhBase = instanceMatrix * hhBase;
            #endif
            hhBase = modelMatrix * hhBase;
            vec3 hhOff = hhWind(transformed, hhBase.xyz, ${swayExpr}, ${stiffness}, ${flutter});
            mat3 hhToLocal = mat3(modelMatrix);
            #ifdef USE_INSTANCING
              hhToLocal = hhToLocal * mat3(instanceMatrix);
            #endif
            transformed += inverse(hhToLocal) * hhOff;
          }`,
        );
      }
      vs = vs.replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        {
          vec4 hhW = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            hhW = batchingMatrix * hhW;
          #endif
          #ifdef USE_INSTANCING
            hhW = instanceMatrix * hhW;
          #endif
          hhW = modelMatrix * hhW;
          vHHWorld = hhW.xyz;
          vec3 hhN = objectNormal;
          #ifdef USE_INSTANCING
            hhN = mat3(instanceMatrix) * hhN;
          #endif
          vHHWorldNormal = normalize(mat3(modelMatrix) * hhN);
          ${surf ? 'vSurf = surf; vUvM = uv;' : ''}
          ${facade ? 'vWin = win;' : ''}
        }
        ${ext?.vertexMain ?? ''}`,
      );
      shader.vertexShader = vs;

      // ── fragment ────────────────────────────────────────────────────────
      let fs = shader.fragmentShader;
      fs = fs.replace(
        '#include <common>',
        `#include <common>\n${SHARED_PARS}\n${FRAG_PARS}\nuniform float uRim;\n${ATMOSPHERE_GLSL}\n${surf ? SURF_FRAG_PARS : ''}\n${facade ? WIN_FRAG_PARS + FACADE_GLSL + GROUND_GLSL : ''}\n${ext?.fragmentPars ?? ''}`,
      );
      // Base colour snapshot (emissive surfaces glow in their own colour).
      let colorChunk = '#include <color_fragment>\nvec3 hhBaseColor = diffuseColor.rgb;';
      if (surf) colorChunk += '\ndiffuseColor.rgb *= 1.0 - clamp(vSurf.z, 0.0, 1.0) * 0.7;';
      if (weathering) colorChunk += `\n${WEATHERING_FRAGMENT}`;
      if (wet) {
        colorChunk += /* glsl */ `
        {
          float hhUp2 = smoothstep(0.55, 0.95, vHHWorldNormal.y);
          diffuseColor.rgb *= 1.0 - uWeather.x * (0.38 * hhUp2 + 0.18);
        }`;
      }
      if (ext?.fragmentColor) colorChunk += `\n{\n${ext.fragmentColor}\n}`;
      fs = fs.replace('#include <color_fragment>', colorChunk);

      let roughChunk = '#include <roughnessmap_fragment>';
      if (surf) roughChunk += '\nroughnessFactor = vSurf.x;';
      if (wet) {
        roughChunk += /* glsl */ `
          float hhUp = smoothstep(0.55, 0.95, vHHWorldNormal.y);
          float hhVert = 1.0 - smoothstep(0.2, 0.6, abs(vHHWorldNormal.y));
          float hhPuddle = texture2D(uNoise, vHHWorld.xz * 0.045).r;
          float hhStreak = texture2D(uNoise, vec2(vHHWorld.x * 0.11 + vHHWorld.z * 0.11, vHHWorld.y * 0.02 - uTime * 0.05)).b;
          float hhWet = uWeather.x * (hhUp * (0.55 + 0.45 * smoothstep(0.35, 0.65, hhPuddle)) + hhVert * 0.35 * hhStreak);
          roughnessFactor = mix(roughnessFactor, 0.06 + 0.12 * (1.0 - hhPuddle), hhWet);`;
      }
      fs = fs.replace('#include <roughnessmap_fragment>', roughChunk);
      let metalChunk = '#include <metalnessmap_fragment>';
      if (surf) metalChunk += '\nmetalnessFactor = vSurf.y;';
      if (ext?.fragmentSurface) metalChunk += `\n{\n${ext.fragmentSurface}\n}`;
      fs = fs.replace('#include <metalnessmap_fragment>', metalChunk);

      let emissiveChunk = '#include <emissivemap_fragment>';
      if (nightEmissive) emissiveChunk += '\n totalEmissiveRadiance *= smoothstep(0.05, 0.75, uWeather.z);';
      if (surf) emissiveChunk += `\n${SURF_FRAGMENT}`;
      if (facade) emissiveChunk += `\n${FACADE_FRAGMENT}`;
      if (ext?.fragmentEmissive) emissiveChunk += `\n{\n${ext.fragmentEmissive}\n}`;
      fs = fs.replace('#include <emissivemap_fragment>', emissiveChunk);

      // Art-directed image-based lighting balance.
      fs = fs.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', 'iblIrradiance += getIBLIrradiance( geometryNormal ) * uIbl.x;');
      fs = fs.replace('radiance += iblRadiance;', 'radiance += iblRadiance * uIbl.y;');

      if (rim > 0) {
        fs = fs.replace(
          '#include <lights_fragment_end>',
          /* glsl */ `#include <lights_fragment_end>
          {
            vec3 hhView = normalize(cameraPosition - vHHWorld);
            float hhFres = pow(1.0 - clamp(dot(normalize(vHHWorldNormal), hhView), 0.0, 1.0), 3.0);
            float hhSunSide = clamp(dot(normalize(vHHWorldNormal), uSunDir) * 0.5 + 0.6, 0.0, 1.0);
            reflectedLight.indirectDiffuse += uSunGlow * hhFres * hhSunSide * uRim + uZenith * hhFres * uRim * 0.25;
          }`,
        );
      }
      if (ext?.fragmentFinal) fs = fs.replace('#include <fog_fragment>', `{\n${ext.fragmentFinal}\n}\n#include <fog_fragment>`);
      if (fog !== 'none') {
        const apply = fog === 'additive'
          ? 'gl_FragColor.rgb *= 1.0 - hhFog;'
          : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, hhFogColor(normalize(vHHWorld - cameraPosition)), hhFog);';
        fs = fs.replace('#include <fog_fragment>', `{ float hhFog = hhFogAmount(cameraPosition, vHHWorld); ${apply} }`);
      }
      shader.fragmentShader = fs;
    };
    material.needsUpdate = true;
    this.owned.add(material);
    return material;
  }

  /** Release a kit material (the GPU program is shared and freed by Three when unused). */
  release(material: Material): void {
    this.owned.delete(material);
    material.dispose();
  }

  get count(): number {
    return this.owned.size;
  }

  dispose(): void {
    for (const m of this.owned) m.dispose();
    this.owned.clear();
  }
}

/**
 * Fog for custom `ShaderMaterial`s: include in the fragment shader after `SHARED_PARS` and
 * `ATMOSPHERE_GLSL`, with a world-position varying. Returns colour with fog applied.
 */
export const FOG_APPLY_GLSL = /* glsl */ `
vec3 hhApplyFog(vec3 color, vec3 worldPos) {
  float f = hhFogAmount(cameraPosition, worldPos);
  return mix(color, hhFogColor(normalize(worldPos - cameraPosition)), f);
}
vec3 hhApplyFogAdditive(vec3 color, vec3 worldPos) {
  return color * (1.0 - hhFogAmount(cameraPosition, worldPos));
}
`;
