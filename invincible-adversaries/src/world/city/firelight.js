import * as THREE from 'three';

// Fires light the ruins around them: a few warm, flickering point lights computed in the city's own
// shaders (no shadows, no extra scene lights, so no other material recompiles when the map loads).
// The nearest NFIRE fires to the camera are uploaded each frame.
export const NFIRE = 8;
export const FIRE_U = {
  uFires: { value: Array.from({ length: NFIRE }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uFireT: { value: 0 },
};

export const FIRE_GLSL = /* glsl */`
  uniform vec4 uFires[${NFIRE}];
  uniform float uFireT;
  vec3 fireLight(vec3 p, vec3 n) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < ${NFIRE}; i++) {
      vec4 f = uFires[i];
      if (f.w <= 0.0) continue;
      vec3 d = f.xyz - p;
      float r2 = dot(d, d);
      if (r2 > 900.0 * f.w) continue;
      float fl = 0.82 + 0.12 * sin(uFireT * 8.3 + float(i) * 1.7) + 0.08 * sin(uFireT * 21.0 + float(i) * 3.1);
      float ndl = max(dot(n, d * inversesqrt(r2 + 1e-4)), 0.0) * 0.85 + 0.15;
      acc += vec3(1.0, 0.42, 0.12) * f.w * fl * ndl / (1.0 + r2 * 0.05 / f.w) * (1.0 - smoothstep(400.0 * f.w, 900.0 * f.w, r2));
    }
    return acc;
  }
`;

/** pick the fires nearest the camera: list of [x, y, z, size] */
export function updateFireLights(list, cam, time) {
  FIRE_U.uFireT.value = time;
  const c = cam.position;
  const near = list.map((f) => [f, (f[0] - c.x) ** 2 + (f[1] - c.y) ** 2 + (f[2] - c.z) ** 2]).sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < NFIRE; i++) {
    const v = FIRE_U.uFires.value[i];
    if (i < near.length) { const f = near[i][0]; v.set(f[0], f[1] + 0.8 * f[3], f[2], f[3]); } else v.set(0, -999, 0, 0);
  }
}
