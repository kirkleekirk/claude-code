import * as THREE from 'three';
import { FIRE_U, FIRE_GLSL } from './firelight.js';

// The material for everything in the city that isn't a facade or the ground: the station's
// interiors, the L's steelwork, cars, rubble, benches, lamps. Geometry carries a vertex colour and
// aFac = (roughness, metalness, emissive, pattern + grime * 0.9); the pattern adds surface detail
// from uv (in metres) and world position, so one draw call covers all of it.
export const PAT = { plain: 0, ashlar: 1, wood: 2, skylight: 3, steel: 4, rubble: 5, burnt: 6, glass: 7, lamp: 8, marble: 9 };

/** the colour and aFac for a surface: GeoBuilder takes them as curCol and curFac */
export function sol(gb, color, { rough = 0.8, metal = 0, emit = 0, pat = 'plain', grime = 0.3 } = {}) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  gb.curCol = [c.r, c.g, c.b];
  gb.curFac = [rough, metal, emit, PAT[pat] + Math.min(1, grime) * 0.9];
}

const GLSL = /* glsl */`
  varying vec4 vSFac; varying vec2 vSUv; varying vec3 vWN; varying vec3 vWP;
  uniform float uTime; uniform vec3 uSkyCol;
  float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
  float sfbm(vec2 p) { return sn(p) * 0.5 + sn(p * 2.07) * 0.3 + sn(p * 4.3) * 0.2; }
  float sbox(vec2 q, vec2 hw, vec2 aa) { vec2 d = hw - abs(q); return smoothstep(-aa.x, aa.x, d.x) * smoothstep(-aa.y, aa.y, d.y); }
  float sRough; float sMetal; vec3 sEmit;
` + FIRE_GLSL;

const BODY = /* glsl */`
  {
    float pat = floor(vSFac.w + 0.001), grime = fract(vSFac.w) / 0.9;
    vec3 col = diffuseColor.rgb;
    sRough = vSFac.x; sMetal = vSFac.y; sEmit = col * vSFac.z;
    vec2 uv = vSUv;
    vec2 wq = vWP.xz + vec2(vWP.y * 0.71, -vWP.y * 0.53);
    float n1 = sfbm(wq * 0.6), n2 = sn(wq * 4.0 + 3.7);
    if (pat > 0.5 && pat < 1.5) {
      // ashlar: courses of dressed stone with fine joints
      vec2 b = vec2(uv.x / 1.2, uv.y / 0.6); b.x += floor(b.y) * 0.5;
      vec2 bw = fwidth(b);
      float bfar = smoothstep(0.2, 0.55, max(bw.x, bw.y));
      float j = mix(1.0 - sbox(fract(b) - 0.5, vec2(0.485, 0.47), bw * 1.2 + 0.004), 0.06, bfar);
      col *= (0.92 + 0.12 * mix(sh(floor(b) + 0.3), 0.5, bfar)) * (1.0 - j * 0.35);
    } else if (pat > 1.5 && pat < 2.5) {
      // planks along u, with grain
      float pl = floor(uv.y / 0.16);
      col *= 0.8 + 0.25 * sh(vec2(pl, 1.0)) + 0.12 * sn(vec2(uv.x * 0.8, pl * 7.0 + uv.y * 30.0));
      col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.08, abs(fract(uv.y / 0.16) - 0.5) * 2.0 - 0.9));
    } else if (pat > 2.5 && pat < 3.5) {
      // skylight panes in a steel grid: from below they glow with the sky, from above they reflect
      vec2 c = vec2(uv.x / 1.5, uv.y / 1.0);
      float pane = sbox(fract(c) - 0.5, vec2(0.44, 0.42), fwidth(c) * 1.2 + 0.004);
      float r = sh(floor(c) + 9.1);
      float broken = step(r, 0.08), grimy = 0.55 + 0.45 * sn(floor(c) * 0.37);
      if (vWN.y < 0.0) {
        sEmit = uSkyCol * pane * (1.0 - broken) * grimy * 0.9;
        col = mix(col * 0.4, vec3(0.04), pane);
        sRough = 0.6;
      } else {
        col = mix(col, vec3(0.08, 0.1, 0.11) * (0.7 + 0.5 * r), pane * (1.0 - broken));
        sRough = mix(sRough, 0.14, pane); sMetal = mix(sMetal, 0.5, pane * (1.0 - broken));
      }
    } else if (pat > 3.5 && pat < 4.5) {
      // painted steel: chipped paint, rust running down
      float rust = smoothstep(0.55, 0.8, sfbm(vec2(uv.x * 0.7, uv.y * 0.15) + n1));
      col = mix(col, vec3(0.22, 0.1, 0.05), rust * 0.8);
      sRough = mix(sRough, 0.95, rust);
    } else if (pat > 4.5 && pat < 5.5) {
      // broken concrete and masonry: chunky light/dark lumps, exposed rebar specks
      float k = sfbm(wq * 1.3 + uv * 0.4);
      col *= 0.65 + 0.6 * k;
      col = mix(col, vec3(0.35, 0.16, 0.1), smoothstep(0.7, 0.85, sn(wq * 0.5 + 9.0)) * 0.6);
    } else if (pat > 5.5 && pat < 6.5) {
      // burnt out: black soot over orange-brown rust, ash dust on top
      float rust = smoothstep(0.35, 0.75, sfbm(wq * 1.1 + uv * 0.9));
      col = mix(vec3(0.03, 0.028, 0.026), vec3(0.3, 0.13, 0.06), rust);
      col = mix(col, vec3(0.32, 0.31, 0.3), smoothstep(0.6, 0.95, vWN.y) * 0.55);
      sRough = 0.95; sMetal = 0.2 * (1.0 - rust);
    } else if (pat > 6.5 && pat < 7.5) {
      // glass: dark, glossy, a few cracks
      col = col * (0.6 + 0.4 * n2);
      sRough = 0.12 + smoothstep(0.7, 0.9, n1) * 0.5;
    } else if (pat > 8.5) {
      // polished marble: soft veins
      float v = abs(sin(dot(wq, vec2(0.7, 0.4)) * 2.0 + sfbm(wq * 0.8) * 6.0));
      col *= 0.88 + 0.12 * smoothstep(0.0, 0.15, v);
    }
    // grime: blotches, streaks, darker toward the ground and in the soot of the fires
    float g = (sfbm(wq * 0.25 + 4.0) - 0.45) * 0.7 + (n2 - 0.5) * 0.2;
    float low = smoothstep(2.5, 0.0, vWP.y) * 0.25;
    col *= 1.0 - clamp(g + low, 0.0, 0.8) * grime;
    diffuseColor.rgb = col;
  }
`;

export function makeSolidMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, vertexColors: true });
  const U = { uTime: { value: 0 }, uSkyCol: { value: new THREE.Color(1.6, 1.55, 1.45) } };
  mat.userData.U = U;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U, FIRE_U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFac; varying vec4 vSFac; varying vec2 vSUv; varying vec3 vWN; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSFac = aFac; vSUv = uv;
        vWN = normalize(mat3(modelMatrix) * objectNormal);
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + BODY)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = sMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sEmit + diffuseColor.rgb * fireLight(vWP, vWN);');
  };
  mat.customProgramCacheKey = () => 'city-solid-v1';
  return mat;
}
