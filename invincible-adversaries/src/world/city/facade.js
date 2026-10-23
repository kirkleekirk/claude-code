import * as THREE from 'three';
import { FIRE_U, FIRE_GLSL } from './firelight.js';

// One material for every building in the city. Facade geometry carries uv in metres (u along the
// wall, v = height) and aFac = (style + damage * 0.9, seed, floor height, bay width); the shader
// draws the window grid, the glass (reflective, dark, lit, burning or smashed out), storefronts,
// coursing, grime and soot. Roofs (faces pointing up) get tar and gravel.
//   styles: 0 glass curtain wall, 1 black steel (Mies), 2 limestone, 3 brick, 4 terracotta,
//           5 concrete, 6 art deco piers, 7 interior (inside a broken building), 8 bare concrete
export const STYLE_ID = { glass: 0, black: 1, stone: 2, brick: 3, terracotta: 4, concrete: 5, deco: 6, interior: 7, bare: 8, canvas: 9 };
export const STYLE_GRID = { // floor height, bay width
  glass: [3.9, 1.55], black: [3.9, 1.7], stone: [3.7, 3.1], brick: [3.3, 2.7], terracotta: [3.9, 3.2], concrete: [3.5, 2.3], deco: [3.7, 2.1], interior: [3.6, 3], bare: [3.6, 3], canvas: [3.6, 3],
};

const GLSL_COMMON = /* glsl */`
  varying vec4 vFac; varying vec2 vFUv; varying vec3 vWN; varying vec3 vWP;
  uniform float uTime;
  vec3 fEmit; float fRough; float fMetal;
  float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
  float fbm2(vec2 p) { return fn(p) * 0.5 + fn(p * 2.1) * 0.3 + fn(p * 4.3) * 0.2; }
  // soft box mask with antialiasing: inside |q| < hw
  float boxm(vec2 q, vec2 hw, vec2 aa) { vec2 d = hw - abs(q); return smoothstep(-aa.x, aa.x, d.x) * smoothstep(-aa.y, aa.y, d.y); }
`;

const GLSL_FACADE = /* glsl */`
  {
    // (the seed is snapped to its bin: interpolation jitter in a varying, amplified by the hashes,
    // would otherwise speckle every window)
    float sty = floor(vFac.x + 0.001), dmg = fract(vFac.x) / 0.9, seed = (floor(vFac.y * 256.0) + 0.5) / 256.0, FH = vFac.z, BW = vFac.w;
    vec2 uv = vFUv;
    vec3 col; fRough = 0.85; fMetal = 0.0; fEmit = vec3(0.0);
    bool roof = vWN.y > 0.7, under = vWN.y < -0.7;
    if (sty > 8.5) {
      // shop awnings: faded canvas in one of a few colours, some striped, singed
      vec3 pal[5]; pal[0] = vec3(0.45, 0.06, 0.05); pal[1] = vec3(0.05, 0.22, 0.12); pal[2] = vec3(0.06, 0.08, 0.2); pal[3] = vec3(0.3, 0.07, 0.12); pal[4] = vec3(0.5, 0.36, 0.12);
      int ci = int(floor(seed * 4.99));
      vec3 c = pal[0]; if (ci == 1) c = pal[1]; if (ci == 2) c = pal[2]; if (ci == 3) c = pal[3]; if (ci == 4) c = pal[4];
      if (fract(seed * 7.0) > 0.5) c = mix(c, vec3(0.62, 0.6, 0.55), step(0.5, fract(vFUv.x * 1.1)));
      col = c * (0.75 + 0.35 * fn(vWP.xz * 3.0)) * (1.0 - 0.5 * smoothstep(0.55, 0.85, fbm2(vWP.xz * 0.9 + seed * 20.0)));
      fRough = 0.95;
    } else if (roof || under) {
      // tar and gravel, darker patches, a few vents' stains
      float g = fbm2(vWP.xz * 1.7) * 0.6 + fn(vWP.xz * 9.0) * 0.4;
      col = mix(vec3(0.16, 0.155, 0.15), vec3(0.3, 0.29, 0.27), g);
      col *= 0.8 + 0.2 * smoothstep(0.3, 0.7, fn(vWP.xz * 0.15 + seed * 9.0));
      if (sty > 6.5) col = vec3(0.32, 0.31, 0.29) * (0.7 + 0.3 * g); // slabs inside wrecks: raw concrete
      fRough = 0.95;
    } else if (sty > 6.5) {
      // interior of a wreck (or bare concrete): dark rooms, slab edges, scorch
      float slab = smoothstep(0.92, 0.97, fract(uv.y / FH));
      float soot = fbm2(uv * vec2(0.3, 0.2) + seed * 7.0);
      col = sty > 7.5 ? vec3(0.36, 0.35, 0.33) * (0.75 + 0.35 * soot) : mix(vec3(0.035, 0.032, 0.03), vec3(0.16, 0.15, 0.14), slab) * (0.6 + 0.5 * soot);
      fRough = 1.0;
    } else {
      vec2 cellF = vec2(uv.x / BW, uv.y / FH);
      vec2 cell = floor(cellF), f = fract(cellF);
      vec2 aa = fwidth(cellF) * 1.5 + 0.002;
      float far = smoothstep(0.12, 0.4, max(aa.x, aa.y));
      float r = fh(cell + seed * 73.1), r2 = fh(cell * 1.7 + seed * 11.3 + 4.1);
      bool ground = uv.y < FH * 1.25;
      // style table
      vec3 wall; vec2 win; vec3 glass; float frameDark;
      if (sty < 0.5) { wall = vec3(0.15, 0.18, 0.2); win = vec2(0.96, 0.8); glass = vec3(0.06, 0.085, 0.1); frameDark = 0.2; }
      else if (sty < 1.5) { wall = vec3(0.03, 0.03, 0.034); win = vec2(0.84, 0.76); glass = vec3(0.07, 0.062, 0.052); frameDark = 0.4; }
      else if (sty < 2.5) { wall = vec3(0.4, 0.37, 0.32); win = vec2(0.42, 0.56); glass = vec3(0.04, 0.045, 0.05); frameDark = 0.55; }
      else if (sty < 3.5) { wall = vec3(0.28, 0.12, 0.08); win = vec2(0.46, 0.52); glass = vec3(0.035, 0.04, 0.045); frameDark = 0.5; }
      else if (sty < 4.5) { wall = vec3(0.5, 0.45, 0.36); win = vec2(0.8, 0.62); glass = vec3(0.045, 0.055, 0.06); frameDark = 0.45; }
      else if (sty < 5.5) { wall = vec3(0.33, 0.32, 0.3); win = vec2(0.62, 0.5); glass = vec3(0.04, 0.045, 0.05); frameDark = 0.5; }
      else { wall = vec3(0.43, 0.39, 0.32); win = vec2(0.36, 0.72); glass = vec3(0.04, 0.045, 0.05); frameDark = 0.55; }
      // building-to-building colour variation
      wall *= 0.86 + 0.28 * fh(vec2(seed * 91.7, 3.3));
      // masonry texture
      if (sty > 1.5 && sty < 3.5) {
        vec2 bq = vec2(uv.x * (sty > 2.5 ? 4.4 : 1.1), uv.y * (sty > 2.5 ? 13.0 : 1.7));
        bq.x += floor(bq.y) * 0.5;
        // (bricks smaller than a few pixels fade to their average instead of sparkling)
        vec2 bw = fwidth(bq);
        float bfar = smoothstep(0.18, 0.5, max(bw.x, bw.y));
        float mortar = (1.0 - boxm(fract(bq) - 0.5, vec2(0.46, sty > 2.5 ? 0.38 : 0.47), bw + 0.01));
        mortar = mix(mortar, sty > 2.5 ? 0.3 : 0.1, bfar);
        wall = mix(wall * (0.92 + 0.16 * mix(fh(floor(bq) + seed), 0.5, bfar)), wall * (sty > 2.5 ? 1.55 : 0.82), mortar * 0.6);
      }
      if (sty > 3.5 && sty < 4.5) wall *= 0.94 + 0.12 * smoothstep(0.4, 0.6, fract(uv.y * 1.6)); // glazed courses
      // the window opening (Chicago window on terracotta: a wide pane between two narrow ones)
      vec2 q = f - vec2(0.5, 0.52);
      vec2 hw = win * 0.5;
      if (ground) { hw = vec2(0.47, 0.36); q.y = f.y - 0.42; } // storefronts
      float inWin = boxm(q, hw, aa);
      float frame = boxm(q, hw + 0.035, aa) - inWin;
      // grime: streaks down from sills, dirt near the street
      float streak = fn(vec2(uv.x * 2.3, uv.y * 0.12 + seed * 5.0));
      float dirt = smoothstep(4.0, 0.0, uv.y) * 0.35 + streak * 0.18 + (fbm2(uv * 0.07 + seed) - 0.5) * 0.3;
      // smashed and burning windows (more of them the more damaged the building)
      bool broken = r < 0.05 + dmg * 0.38, fire = broken && r2 < 0.12 + dmg * 0.25, lit = !broken && r2 < 0.035;
      // soot rising from a broken window into the two floors above it
      float sootUp = 0.0;
      for (int k = 1; k <= 2; k++) {
        vec2 cb = cell - vec2(0.0, float(k));
        if (fh(cb + seed * 73.1) < 0.05 + dmg * 0.38) sootUp = max(sootUp, (1.0 - f.y * 0.6) * (k == 1 ? 1.0 : 0.45) * smoothstep(0.5, 0.0, abs(f.x - 0.5) - 0.05));
      }
      vec3 wallC = wall * (1.0 - dirt * 0.45) * (1.0 - sootUp * 0.75 * (0.5 + dmg));
      wallC = mix(wallC, wall * 0.35, frame * frameDark);
      // glass
      vec3 g = glass * (0.65 + 0.7 * r2);
      float blind = step(0.55, r) * smoothstep(0.62, 0.66, f.y) * 0.5; // blinds half down
      g = mix(g, vec3(0.42, 0.4, 0.36) * 0.5, blind);
      if (broken) {
        // jagged shard edge around a black hole
        float jag = fn(f * 9.0 + cell) * 0.2;
        float hole = boxm(q, hw - 0.04 - jag * 0.5, aa);
        g = mix(g, vec3(0.006, 0.005, 0.005), hole);
        if (fire) fEmit = vec3(3.2, 1.25, 0.32) * hole * (0.55 + 0.45 * fn(vec2(uTime * 3.0, r * 40.0)) + 0.3 * sin(uTime * 13.0 + r * 60.0)) * (1.0 - f.y * 0.5);
      } else if (lit) {
        fEmit = vec3(1.1, 0.82, 0.5) * 0.45 * inWin;
      }
      if (ground) g = mix(g, vec3(0.03, 0.03, 0.035), 0.5);
      col = mix(wallC, g, inWin);
      // glass reflects; walls don't
      fRough = mix(sty < 1.5 ? 0.35 : 0.85, broken ? 0.95 : 0.12, inWin);
      // (glass is dielectric: dark straight on, the sky in it at a glancing angle; coated curtain walls a bit more)
      fMetal = inWin * (broken ? 0.0 : (sty < 0.5 ? 0.3 : sty < 1.5 ? 0.22 : 0.05));
      // far away the grid melts into its average
      vec3 avg = mix(wall * 0.9, glass, win.x * win.y * 0.9);
      col = mix(col, avg, far);
      fRough = mix(fRough, sty < 1.5 ? 0.25 : 0.6, far); fMetal = mix(fMetal, sty < 1.5 ? 0.25 : 0.04, far);
      fEmit *= 1.0 - far * 0.6;
    }
    diffuseColor.rgb = col;
  }
`;

export function makeFacadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  const U = { uTime: { value: 0 } };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, FIRE_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFac; varying vec4 vFac; varying vec2 vFUv; varying vec3 vWN; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vFac = aFac; vFUv = uv;
        vWN = normalize(mat3(modelMatrix) * objectNormal);
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + FIRE_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + GLSL_FACADE)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmit + diffuseColor.rgb * fireLight(vWP, vWN);');
  };
  mat.customProgramCacheKey = () => 'city-facade-v1';
  return mat;
}

/** a seed in [0, 1) moved to the middle of one of 256 bins (the shader snaps it back exactly) */
export const qseed = (s) => (Math.floor((s - Math.floor(s)) * 256) + 0.5) / 256;
/** the aFac vector for a style */
export function fac(style, seed, damage = 0) {
  const g = STYLE_GRID[style];
  return [STYLE_ID[style] + Math.min(1, Math.max(0, damage)) * 0.9, qseed(seed), g[0], g[1]];
}
