import * as THREE from 'three';

// Cel-shaded hero material: patches MeshStandardMaterial with a toon light ramp,
// rim light, hit flash, energy glow and a noise dissolve (death / revive).

const TOON_RAMP = /* glsl */`
float toonNL(float x) {
  float a = smoothstep(-0.05, 0.05, x);
  float b = smoothstep(0.42, 0.52, x);
  return clamp(a * 0.6 + b * 0.4, 0.0, 1.0) * 0.82 + clamp(x, 0.0, 1.0) * 0.18;
}
`;
const NOISE = /* glsl */`
float hsh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hsh(i + vec3(0,0,0)), hsh(i + vec3(1,0,0)), f.x), mix(hsh(i + vec3(0,1,0)), hsh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hsh(i + vec3(0,0,1)), hsh(i + vec3(1,0,1)), f.x), mix(hsh(i + vec3(0,1,1)), hsh(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1) * 0.3 + vnoise(p * 4.3) * 0.15; }
`;

export function makeHeroUniforms(teamColor) {
  return {
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uRim: { value: new THREE.Color(teamColor) },
    uRimStr: { value: 0.55 },
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color(1, 0.3, 0.8) },
    uDissolve: { value: 0 },
    uDissolveColor: { value: new THREE.Color(1, 0.35, 0.85) },
    uDissolveScale: { value: 7.0 },
    uTime: { value: 0 },
    uSat: { value: 1.0 },
    uBright: { value: 1.0 },
  };
}

// Toon ramp drives the diffuse term only; specular keeps the physical N.L so the
// GGX visibility term (which blows up at grazing angles) stays cancelled out.
const lightsChunk = THREE.ShaderChunk.lights_physical_pars_fragment
  .replace(
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
    'float dotNLraw = dot( geometryNormal, directLight.direction );\n\tfloat dotNL = saturate( dotNLraw );\n\tvec3 toonIrradiance = toonNL( dotNLraw ) * directLight.color;',
  )
  .replace(
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
    'reflectedLight.directDiffuse += toonIrradiance * BRDF_Lambert( material.diffuseColor );',
  );
if (!lightsChunk.includes('toonIrradiance * BRDF_Lambert')) console.warn('toon lighting patch did not apply');

export function patchHeroMaterial(mat, U, opts = {}) {
  // per-material share of the team rim light (thin cloth is seen edge-on across every fold,
  // where a full fresnel rim would wash it in the team colour)
  const rimMul = { value: opts.rimMul ?? 1 };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uRimMul: rimMul });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvObjPos = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos;
        uniform float uFlash, uRimStr, uRimMul, uGlow, uDissolve, uDissolveScale, uTime, uSat, uBright;
        uniform vec3 uFlashColor, uRim, uGlowColor, uDissolveColor;
        ${TOON_RAMP}
        ${NOISE}`)
      .replace('#include <lights_physical_pars_fragment>', lightsChunk)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = max(mix(vec3(l), diffuseColor.rgb, uSat) * uBright, 0.0);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 Vv = normalize(vViewPosition);
          float fres = pow(1.0 - saturate(dot(normal, Vv)), 3.0);
          outgoingLight += uRim * fres * uRimStr * uRimMul;
          outgoingLight += uGlowColor * uGlow * (0.25 + fres * 2.2);
          outgoingLight = mix(outgoingLight, uFlashColor, clamp(uFlash, 0.0, 1.0) * 0.5);
          if (uDissolve > 0.0) {
            float n = fbm3(vObjPos * uDissolveScale + vec3(0.0, uTime * 0.6, 0.0));
            float th = uDissolve * 1.08 - 0.04;
            if (n < th) discard;
            float edge = 1.0 - smoothstep(th, th + 0.07, n);
            outgoingLight = mix(outgoingLight, uDissolveColor * 7.0, edge);
          }
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'hero-toon-v6';
  mat.needsUpdate = true;
  return mat;
}

/** Inverted-hull outline that shares the skinned geometry & skeleton (or a plain mesh's geometry). */
export function makeOutlineMaterial(color, U, width = 2.6) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const ou = { uOutline: { value: width }, uResY: { value: 1080 } };
  m.userData.outlineUniforms = ou;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ou, { uDissolve: U.uDissolve, uDissolveScale: U.uDissolveScale, uTime: U.uTime });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline, uResY;\nvarying vec3 vObjPos;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvObjPos = transformed;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          // the basic material only declares objectNormal for skinned meshes
          #ifdef USE_SKINNING
          vec3 nv = normalize(normalMatrix * objectNormal);
          #else
          vec3 nv = normalize(normalMatrix * normal);
          #endif
          vec4 nc = projectionMatrix * vec4(nv, 0.0);
          vec2 nd = nc.xy; float nl = length(nd);
          if (nl > 1e-5) nd /= nl;
          float px = uOutline * mix(1.0, 0.45, smoothstep(4.0, 45.0, gl_Position.w));
          gl_Position.xy += nd * (px * 2.0 / uResY) * gl_Position.w;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObjPos;\nuniform float uDissolve, uDissolveScale, uTime;\n${NOISE}`)
      .replace('#include <opaque_fragment>', `
        if (uDissolve > 0.0) {
          float n = fbm3(vObjPos * uDissolveScale + vec3(0.0, uTime * 0.6, 0.0));
          if (n < uDissolve * 1.08 - 0.04 + 0.02) discard;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'hero-outline-v3';
  return m;
}

/**
 * Prepare a hero model instance: toon materials, outlines, shadows.
 * Returns { uniforms, outlineMats, meshes }.
 */
export function dressHero(scene, key, team, opts = {}) {
  const teamColor = team === 0 ? 0x4fb4ff : 0xff3b4a;
  const U = makeHeroUniforms(teamColor);
  U.uRimStr.value = team === 0 ? 0.35 : 0.55;
  const tune = {
    invincible: { sat: 1.12, bright: 1.0, rough: 0.78 },
    eve: { sat: 1.08, bright: 1.05, rough: 0.6 },
    omniman: { sat: 1.32, bright: 1.12, rough: 0.62 },
    robot: { sat: 0.9, bright: 1.04, rough: 0.42 },
  }[key];
  U.uSat.value = tune.sat; U.uBright.value = tune.bright;
  const outlineColor = team === 0 ? 0x06080f : 0x2a0006;
  const outlineMats = [];
  const meshes = [];
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  for (const o of skinned) {
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.name === 'Outlines' || (o.material && o.material.name === 'Outline')) {
      // Invincible ships with a hand-made hull outline; we replace it with our shader outline for consistency.
      o.visible = false; o.castShadow = false;
      continue;
    }
    const m = o.material;
    if (m.isMeshStandardMaterial) {
      const cloth = /cape/i.test(o.name) || /cape/i.test(m.name);
      m.roughness = tune.rough; m.metalness = 0;
      m.envMapIntensity = cloth ? 0.25 : 0.6;
      patchHeroMaterial(m, U, { rimMul: cloth ? 0.2 : 1 });
    }
    meshes.push(o);
    if (opts.outline !== false) {
      const om = makeOutlineMaterial(outlineColor, U, key === 'omniman' ? 2.2 : 2.6);
      const ol = new THREE.SkinnedMesh(o.geometry, om);
      ol.bind(o.skeleton, o.bindMatrix);
      ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
      ol.frustumCulled = false; ol.castShadow = false; ol.receiveShadow = false;
      ol.name = o.name + '_outline';
      ol.renderOrder = 1;
      o.parent.add(ol);
      outlineMats.push(om);
    }
  }
  return { uniforms: U, outlineMats, meshes };
}
