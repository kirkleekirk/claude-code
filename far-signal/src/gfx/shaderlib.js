// GLSL shared by every world material: atmosphere gradient, analytic height fog,
// baked terrain shadows, hemisphere ambient and local point lights.

export const COMMON = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkySun;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec4 uFog;
uniform float uTime;
uniform vec4 uWorld;
uniform sampler2D uShadowTex;
uniform float uClipY;
uniform vec4 uLights[4];
uniform vec3 uLightCols[4];
uniform float uInterior;
uniform sampler2D uNoise;
uniform float uNight;
uniform vec4 uWind;
uniform vec4 uPlayer;

vec3 skyGradient(vec3 d){
  float h = max(d.y, 0.0);
  float t = pow(1.0 - h, 4.0);
  vec3 c = mix(uZenith, uHorizon, t);
  float sd = max(dot(d, uSkySun), 0.0);
  float s2 = sd * sd; float s8 = s2 * s2; s8 *= s8;
  float s64 = s8 * s8; s64 *= s64; s64 *= s64;
  c += uSunGlow * (s8 * (0.05 + 0.2 * t) + s64 * 0.28 + s64 * s64 * s64 * s64 * 0.7);
  return c;
}

vec3 applyFog(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  vec3 d = v / max(dist, 1e-3);
  float b = uFog.y;
  float y0 = max(cameraPosition.y - uFog.z, -40.0);
  float y1 = max(wp.y - uFog.z, -40.0);
  float dy = y1 - y0;
  float e0 = exp(-b * y0);
  float avg = abs(dy) > 0.05 ? (e0 - exp(-b * y1)) / (b * dy) : e0;
  float f = 1.0 - exp(-dist * uFog.x * avg);
  f = min(f, uFog.w);
  vec3 fd = normalize(vec3(d.x, max(d.y, 0.0) * 0.35 + 0.02, d.z));
  vec3 fc = mix(skyGradient(fd), uHorizon * 0.12, uInterior);
  return mix(col, fc, f);
}

float keyShadow(vec3 wp){
  if (uWorld.w < 0.5) return 1.0;
  vec2 uv = wp.xz * uWorld.y + 0.5;
  vec2 s = texture2D(uShadowTex, uv).rg;
  float w = clamp(s.g * 0.03, 0.4, 5.0);
  return smoothstep(-w, w, wp.y - s.r + w * 0.6);
}

vec3 hemiAmbient(vec3 N){
  return mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
}

vec3 pointLights(vec3 wp, vec3 N){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++){
    vec3 L = uLights[i].xyz - wp;
    float d2 = dot(L, L);
    float r = uLights[i].w;
    float att = max(1.0 - d2 / (r * r), 0.0);
    att *= att;
    float ndl = max(dot(N, L * inversesqrt(d2 + 1e-4)), 0.0) * 0.8 + 0.2;
    acc += uLightCols[i] * att * ndl;
  }
  return acc;
}
`;

// Fullscreen triangle vertex shader for post passes.
export const FS_VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
