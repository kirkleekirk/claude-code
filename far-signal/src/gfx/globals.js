import * as THREE from 'three';

// Uniform objects shared by reference across every material, so a single
// update per frame relights the whole world.
const v3 = (x = 0, y = 0, z = 0) => ({ value: new THREE.Vector3(x, y, z) });
const col = (hex = 0) => ({ value: new THREE.Color(hex) });

export const G = {
  uSunDir: v3(0, 1, 0),        // key light direction (toward the light)
  uSunColor: col(0xffffff),    // key light radiance
  uSkySun: v3(0, 1, 0),        // true sun direction (sky glow, planet phases)
  uAmbSky: col(0x404858),
  uAmbGround: col(0x201820),
  uZenith: col(0x103060),
  uHorizon: col(0x80a0c0),
  uSunGlow: col(0xffa060),
  uFog: { value: new THREE.Vector4(0.002, 0.02, 0, 0.95) },
  uTime: { value: 0 },
  uWorld: { value: new THREE.Vector4(768, 1 / 1536, 0, 0) },
  uShadowTex: { value: null },
  uClipY: { value: -1e5 },
  uLights: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uLightCols: { value: [new THREE.Color(0), new THREE.Color(0), new THREE.Color(0), new THREE.Color(0)] },
  uInterior: { value: 0 },
  uNoise: { value: null },
  uWind: { value: new THREE.Vector4(1, 0, 1, 0) },
  uPlayer: { value: new THREE.Vector4(0, 0, 0, 0) },
  uNight: { value: 0 },
};

export function commonUniforms(extra = {}) {
  return {
    uSunDir: G.uSunDir, uSunColor: G.uSunColor, uSkySun: G.uSkySun,
    uAmbSky: G.uAmbSky, uAmbGround: G.uAmbGround,
    uZenith: G.uZenith, uHorizon: G.uHorizon, uSunGlow: G.uSunGlow,
    uFog: G.uFog, uTime: G.uTime, uWorld: G.uWorld, uShadowTex: G.uShadowTex,
    uClipY: G.uClipY, uLights: G.uLights, uLightCols: G.uLightCols,
    uInterior: G.uInterior, uNoise: G.uNoise, uWind: G.uWind, uPlayer: G.uPlayer, uNight: G.uNight,
    ...extra,
  };
}

// Up to four dynamic point lights (muzzle flashes, glyph lamps, suit core).
const lightSlots = [];
export function resetLights() { lightSlots.length = 0; }
export function addLight(x, y, z, radius, r, g, b, priority = 0) {
  lightSlots.push({ x, y, z, radius, r, g, b, priority });
}
export function commitLights(cx, cy, cz) {
  for (const l of lightSlots) {
    const dx = l.x - cx, dy = l.y - cy, dz = l.z - cz;
    l.score = Math.sqrt(dx * dx + dy * dy + dz * dz) - l.priority * 1000 - l.radius;
  }
  lightSlots.sort((a, b) => a.score - b.score);
  for (let i = 0; i < 4; i++) {
    const l = lightSlots[i];
    if (l) {
      G.uLights.value[i].set(l.x, l.y, l.z, l.radius);
      G.uLightCols.value[i].setRGB(l.r, l.g, l.b);
    } else {
      G.uLights.value[i].set(0, -9999, 0, 1);
      G.uLightCols.value[i].setRGB(0, 0, 0);
    }
  }
}
