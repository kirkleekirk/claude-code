import {
  MeshPhysicalMaterial, MeshStandardMaterial,
  type Material, type MeshPhysicalMaterialParameters, type MeshStandardMaterialParameters, type WebGLProgramParametersWithUniforms,
} from 'three';
import { ATMOSPHERE_GLSL, SHARED_PARS, type SharedUniforms } from '../shared';

/**
 * Every lit material in the game is created or patched here so they all share one fog model, one
 * wetness model and one wind model. Patching is done with `onBeforeCompile` string injection on
 * Three's standard chunks; each distinct option set gets its own program cache key.
 */

export type FogMode = 'normal' | 'additive' | 'none';
export type WindMode = 'none' | 'palm' | 'foliage' | 'grass' | 'cloth';

export interface PatchOptions {
  /** `normal` blends to the sky's horizon colour; `additive` fades emissive-only surfaces to black. */
  fogMode?: FogMode;
  /** Rain darkens and glosses upward-facing surfaces. */
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
}

export interface KitStandardParams extends MeshStandardMaterialParameters, PatchOptions {}
export interface KitPhysicalParams extends MeshPhysicalMaterialParameters, PatchOptions {}

const PATCH_KEYS: ReadonlyArray<keyof PatchOptions> = ['fogMode', 'wet', 'wind', 'rim', 'nightEmissive'];

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

  /** Patch an existing standard/physical material in place. */
  patch<M extends MeshStandardMaterial>(material: M, opts: PatchOptions = {}): M {
    const fog: FogMode = opts.fogMode ?? 'normal';
    const wet = opts.wet ?? false;
    const wind: WindMode = opts.wind ?? 'none';
    const rim = opts.rim ?? 0;
    const nightEmissive = opts.nightEmissive ?? false;
    const shared = this.shared;
    material.fog = false; // our fog replaces Three's
    const key = `hh|${fog}|${wet ? 1 : 0}|${wind}|${rim}|${nightEmissive ? 1 : 0}`;
    const base = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `${base()}|${key}`;

    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shared.attach(shader.uniforms);
      shader.uniforms.uRim = { value: rim };

      // ── vertex ──────────────────────────────────────────────────────────
      let vs = shader.vertexShader;
      vs = vs.replace('#include <common>', `#include <common>\n${SHARED_PARS}\n${VERT_PARS}\n${wind !== 'none' ? WIND_VERTEX : ''}\n${wind === 'palm' || wind === 'foliage' || wind === 'grass' ? 'attribute float sway;' : ''}`);
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
            // Offsets are authored in world space; bring them into the object's frame.
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
        }`,
      );
      shader.vertexShader = vs;

      // ── fragment ────────────────────────────────────────────────────────
      let fs = shader.fragmentShader;
      fs = fs.replace('#include <common>', `#include <common>\n${SHARED_PARS}\n${FRAG_PARS}\nuniform float uRim;\n${ATMOSPHERE_GLSL}`);
      if (wet) {
        // Wetness: horizontal surfaces darken and turn glossy; streaks follow the noise texture.
        fs = fs.replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `#include <roughnessmap_fragment>
          float hhUp = smoothstep(0.55, 0.95, vHHWorldNormal.y);
          float hhVert = 1.0 - smoothstep(0.2, 0.6, abs(vHHWorldNormal.y));
          float hhPuddle = texture2D(uNoise, vHHWorld.xz * 0.045).r;
          float hhStreak = texture2D(uNoise, vec2(vHHWorld.x * 0.11 + vHHWorld.z * 0.11, vHHWorld.y * 0.02 - uTime * 0.05)).b;
          float hhWet = uWeather.x * (hhUp * (0.55 + 0.45 * smoothstep(0.35, 0.65, hhPuddle)) + hhVert * 0.35 * hhStreak);
          roughnessFactor = mix(roughnessFactor, 0.06 + 0.12 * (1.0 - hhPuddle), hhWet);`,
        );
        fs = fs.replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            float hhUp2 = smoothstep(0.55, 0.95, vHHWorldNormal.y);
            diffuseColor.rgb *= 1.0 - uWeather.x * (0.38 * hhUp2 + 0.18);
          }`,
        );
      }
      if (nightEmissive) {
        fs = fs.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n totalEmissiveRadiance *= smoothstep(0.05, 0.75, uWeather.z);`,
        );
      }
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
      if (fog !== 'none') {
        const apply = fog === 'additive'
          ? 'gl_FragColor.rgb *= 1.0 - hhFog;'
          : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, hhFogColor(normalize(vHHWorld - cameraPosition)), hhFog);';
        fs = fs.replace(
          '#include <fog_fragment>',
          `{ float hhFog = hhFogAmount(cameraPosition, vHHWorld); ${apply} }`,
        );
      }
      shader.fragmentShader = fs;
    };
    material.needsUpdate = true;
    this.owned.add(material);
    return material;
  }

  /** Release a kit material (GPU program is shared and freed by Three when unused). */
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
 * `ATMOSPHERE_GLSL`, with a `vWorld` varying. Returns colour with fog applied.
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
