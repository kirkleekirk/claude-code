import * as THREE from '../../vendor/three.module.min.js';

// Height fog with a sun-tinted colour. Patches every material we create so the forest
// melts into lavender haze away from the sun and glows peach toward it.
export const fogUniforms = {
  uFogSunDir: { value: new THREE.Vector3(-1, 0.1, 0).normalize() },
  uFogSunColor: { value: new THREE.Color(0xf2a27a) },
  uFogBaseHeight: { value: -2.0 },
  uFogHeightFalloff: { value: 0.07 },
  uFogDistDensity: { value: 0.0045 },
  uFogMax: { value: 1.0 },
};

// Backlit needles glow when you look toward the sunset (fed by the sky each frame).
export const foliageUniforms = {
  uSunDirW: { value: new THREE.Vector3(-1, 0.1, 0) },
  uSunCol: { value: new THREE.Color(1, 0.7, 0.5) },
};

const parsVert = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogViewPos;
#endif
`;
const vert = /* glsl */ `
#ifdef USE_FOG
  vFogViewPos = mvPosition.xyz;
#endif
`;
const parsFrag = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform vec3 uFogSunDir;
  uniform vec3 uFogSunColor;
  uniform float uFogBaseHeight;
  uniform float uFogHeightFalloff;
  uniform float uFogDistDensity;
  uniform float uFogMax;
  varying vec3 vFogViewPos;
#endif
`;
export const fogFragChunk = /* glsl */ `
#ifdef USE_FOG
  {
    float fogDist = length(vFogViewPos);
    vec3 fogDirW = normalize((vec4(vFogViewPos, 0.0) * viewMatrix).xyz);
    float camH = cameraPosition.y - uFogBaseHeight;
    float k = uFogHeightFalloff;
    float dy = fogDirW.y * fogDist;
    float hInt = abs(dy) > 0.05 ? (exp(-k * camH) - exp(-k * (camH + dy))) / (k * dy) : exp(-k * camH);
    float fogAmt = 1.0 - exp(-fogDensity * fogDist * max(hInt, 0.0));
    fogAmt = max(fogAmt, 1.0 - exp(-uFogDistDensity * fogDist));
    float sunAmt = pow(max(dot(fogDirW, uFogSunDir), 0.0), 5.0);
    vec3 fogCol = mix(fogColor, uFogSunColor, sunAmt);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogAmt, 0.0, uFogMax));
  }
#endif
`;

function onBeforeCompile(shader) {
  Object.assign(shader.uniforms, fogUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <fog_pars_vertex>', parsVert)
    .replace('#include <fog_vertex>', vert);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', parsFrag)
    .replace('#include <fog_fragment>', fogFragChunk);
}

export function patchFog(material) {
  if (material.fog === false) return material;
  const prev = material.onBeforeCompile;
  if (prev && prev !== onBeforeCompile && prev.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) {
    material.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      onBeforeCompile(shader);
    };
    const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
    material.customProgramCacheKey = () => key + '|fog';
  } else {
    material.onBeforeCompile = onBeforeCompile;
  }
  return material;
}

// GLSL snippet for custom ShaderMaterials (particles, beams) to match the world fog.
export const fogGLSL = {
  pars: parsFrag.replace('#ifdef USE_FOG', '').replace('#endif', '').replace('varying vec3 vFogViewPos;', ''),
  uniforms: () => ({ fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.0 }, ...fogUniforms }),
  // returns fog amount for a view-space position
  func: /* glsl */ `
float worldFog(vec3 viewPos, out vec3 fogCol) {
  float fogDist = length(viewPos);
  vec3 fogDirW = normalize((vec4(viewPos, 0.0) * viewMatrix).xyz);
  float camH = cameraPosition.y - uFogBaseHeight;
  float k = uFogHeightFalloff;
  float dy = fogDirW.y * fogDist;
  float hInt = abs(dy) > 0.05 ? (exp(-k * camH) - exp(-k * (camH + dy))) / (k * dy) : exp(-k * camH);
  float fogAmt = 1.0 - exp(-fogDensity * fogDist * max(hInt, 0.0));
  fogAmt = max(fogAmt, 1.0 - exp(-uFogDistDensity * fogDist));
  float sunAmt = pow(max(dot(fogDirW, uFogSunDir), 0.0), 5.0);
  fogCol = mix(fogColor, uFogSunColor, sunAmt);
  return clamp(fogAmt, 0.0, uFogMax);
}
`,
};
