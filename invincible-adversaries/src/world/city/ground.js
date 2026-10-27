import * as THREE from 'three';
import { BOUNDS, CRATER, STATION } from './layout.js';
import { HALF } from './terrain.js';
import { FIRE_U, FIRE_GLSL } from './firelight.js';

// The streets and the crater. A canvas holds the street plan (asphalt, lane lines, crosswalks,
// sidewalks, the station's marble floor, plazas); one shader paints both the flat street meshes
// and the crater mesh, so they meet without a seam: in the bowl it turns to ash, earth and rock
// strata, scorched near the pit, with rays of ejecta across the rim.

export const PLAN = { x0: -170, z0: -110, w: 350, d: 260, ppm: 6 }; // canvas extent (m) and pixels per metre

function planTexture() {
  const { x0, z0, w, d, ppm } = PLAN;
  const c = document.createElement('canvas');
  c.width = Math.round(w * ppm); c.height = Math.round(d * ppm);
  const g = c.getContext('2d');
  const X = (x) => (x - x0) * ppm, Z = (z) => (z - z0) * ppm;
  const rect = (xa, za, xb, zb, col) => { g.fillStyle = col; g.fillRect(X(xa), Z(za), (xb - xa) * ppm, (zb - za) * ppm); };
  // everything starts as pavement (plazas, building plots), then the streets go down
  rect(x0, z0, x0 + w, z0 + d, '#5e5a54');
  const ASPH = '#2f3032', WALK = '#6f6b64', CURB = '#8d897f';
  const street = (xa, za, xb, zb) => rect(xa, za, xb, zb, ASPH);
  // State Street, Adams Street, the alley behind the theatre block
  rect(-109.6, -52, -83.6, 108, WALK); street(-105.6, -48, -87.6, 108);
  rect(-109.6, -50, -70, -34.6, WALK); street(-109.6, -47, -70, -36.4);
  street(-74, -34.6, -70, 100);
  // Lake Street under the north L, Wabash under the east L
  rect(-30, -54, 108, -26, WALK); street(-30, -50, 106, -30);
  rect(78, -54, 108, 104, WALK); street(81, -54, 104, 104);
  // streets running out of the map (seen from the air)
  street(-170, -47, -109.6, -36.4); street(104, -50, 180, -30); street(-105.6, -110, -87.6, -52); street(81, -110, 104, -54); street(81, 100, 104, 150);
  street(-170, 54, -109.6, 66); street(126, 40, 180, 52);
  // curbs
  g.strokeStyle = CURB; g.lineWidth = 0.3 * ppm;
  for (const [xa, za, xb, zb] of [[-105.6, -48, -87.6, 108], [-109.6, -47, -70, -36.4], [-30, -50, 106, -30], [81, -54, 104, 104]]) g.strokeRect(X(xa), Z(za), (xb - xa) * ppm, (zb - za) * ppm);
  // lane lines: dashed white between lanes, double yellow in the middle
  const dash = (xa, za, xb, zb, col, on = 3, off = 6, wid = 0.15) => {
    g.strokeStyle = col; g.lineWidth = wid * ppm; g.setLineDash([on * ppm, off * ppm]);
    g.beginPath(); g.moveTo(X(xa), Z(za)); g.lineTo(X(xb), Z(zb)); g.stroke(); g.setLineDash([]);
  };
  const solid = (xa, za, xb, zb, col, wid = 0.15) => dash(xa, za, xb, zb, col, 1000, 0, wid);
  for (const x of [-101.1, -92.1]) dash(x, -46, x, 104, '#d8d6cf');
  solid(-96.85, -46, -96.85, 104, '#d8a92a'); solid(-96.35, -46, -96.35, 104, '#d8a92a');
  dash(-108, -41.7, -72, -41.7, '#d8d6cf');
  for (const z of [-45, -35]) dash(-28, z, 104, z, '#d8d6cf');
  solid(-28, -40.2, 80, -40.2, '#d8a92a'); solid(-28, -39.7, 80, -39.7, '#d8a92a');
  for (const x of [86.5, 98.5]) dash(x, -52, x, 104, '#d8d6cf');
  solid(92.3, -28, 92.3, 104, '#d8a92a'); solid(92.8, -28, 92.8, 104, '#d8a92a');
  // crosswalks (Chicago's wide white bars)
  const zebra = (xa, za, xb, zb, along) => {
    g.fillStyle = '#d9d7d0';
    if (along === 'x') for (let x = xa; x < xb; x += 1.2) g.fillRect(X(x), Z(za), 0.6 * ppm, (zb - za) * ppm);
    else for (let z = za; z < zb; z += 1.2) g.fillRect(X(xa), Z(z), (xb - xa) * ppm, 0.6 * ppm);
  };
  zebra(-105.4, -34.2, -87.8, -31, 'x'); zebra(-105.4, -51.5, -87.8, -48.3, 'x'); zebra(-87.4, -46.8, -84, -36.6, 'z');
  zebra(81.2, -28.5, 103.8, -25.3, 'x'); zebra(77, -49.8, 80.8, -30.2, 'z');
  // the station: marble floor in a border, the Great Hall's inlay
  const { box: sb, hall } = STATION;
  rect(sb[0], sb[1], sb[2], sb[3], '#a39a8b');
  for (let x = sb[0]; x < sb[2]; x += 1.5) for (let z = sb[1]; z < sb[3]; z += 1.5) if (((Math.floor(x / 1.5) + Math.floor(z / 1.5)) & 1) === 0) rect(x, z, x + 1.5, z + 1.5, '#8a8172');
  g.strokeStyle = '#7d6f5e'; g.lineWidth = 0.5 * ppm; g.strokeRect(X(hall.x0 + 2), Z(hall.z0 + 2), (hall.x1 - hall.x0 - 4) * ppm, (hall.z1 - hall.z0 - 4) * ppm);
  g.beginPath(); g.arc(X((hall.x0 + hall.x1) / 2), Z((hall.z0 + hall.z1) / 2), 6 * ppm, 0, Math.PI * 2); g.stroke();
  // manholes, patched asphalt, oil stains
  const rnd = mulberry(7);
  for (let i = 0; i < 70; i++) {
    const x = x0 + rnd() * w, z = z0 + rnd() * d;
    g.fillStyle = `rgba(${rnd() < 0.5 ? '20,20,22' : '90,88,82'},${0.08 + rnd() * 0.12})`;
    g.fillRect(X(x), Z(z), (2 + rnd() * 8) * ppm, (2 + rnd() * 6) * ppm);
  }
  for (const [x, z] of [[-96.6, 20], [-92, -12], [-100, 60], [-60, -41], [92, -10], [88, 70], [30, -40]]) { g.fillStyle = '#2a2826'; g.beginPath(); g.arc(X(x), Z(z), 0.45 * ppm, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.flipY = false; // (canvas row 0 is z0, as the shader samples it)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
function mulberry(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const GLSL = /* glsl */`
  varying vec3 vWP; varying vec3 vWN;
  uniform sampler2D uPlan; uniform vec4 uPlanRect; uniform vec4 uCrater; uniform vec3 uPit; uniform float uTime;
  float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
  float gfbm(vec2 p) { return gn(p) * 0.5 + gn(p * 2.03) * 0.28 + gn(p * 4.1) * 0.14 + gn(p * 8.3) * 0.08; }
  // cracks: thin dark lines along a cellular pattern
  float cracks(vec2 p) {
    vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(x, y); vec2 r = o + vec2(gh(i + o), gh(i + o + 17.0)) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return 1.0 - smoothstep(0.0, 0.035, sqrt(d2) - sqrt(d1));
  }
`;

export function makeGroundMaterial() {
  const tex = planTexture();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const U = {
    uPlan: { value: tex }, uPlanRect: { value: new THREE.Vector4(PLAN.x0, PLAN.z0, PLAN.w, PLAN.d) },
    uCrater: { value: new THREE.Vector4(CRATER.x, CRATER.z, CRATER.R, CRATER.depth) }, uPit: { value: new THREE.Vector3(CRATER.pit.x, CRATER.pit.z, CRATER.pit.r) },
    uTime: { value: 0 },
  };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, FIRE_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL + FIRE_GLSL + '\nfloat gRough; vec3 gEmit; vec3 gBumpN; float gBump;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 puv = (vWP.xz - uPlanRect.xy) / uPlanRect.zw;
        vec3 plan = texture2D(uPlan, clamp(puv, 0.0, 1.0)).rgb;
        // past the plan: the rest of the city's grid, streets every 100 m
        if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) {
          vec2 gq = abs(fract(vWP.xz / 100.0 + 0.5) - 0.5) * 100.0;
          plan = min(gq.x, gq.y) < 10.0 ? vec3(0.23, 0.23, 0.24) : vec3(0.44, 0.42, 0.39);
        }
        float n1 = gfbm(vWP.xz * 0.35), n2 = gn(vWP.xz * 3.1), n3 = gn(vWP.xz * 11.0);
        float asph = 1.0 - smoothstep(0.1, 0.2, plan.r);
        vec3 col = plan * (0.8 + 0.3 * n1) * (0.93 + 0.12 * n2);
        col *= mix(1.0, 0.88 + 0.22 * n3, asph); // grit
        // pavement: 1.5 m slabs, a few sunk or cracked darker
        vec2 jq = vWP.xz / 1.5, jw = fwidth(jq);
        float jfar = smoothstep(0.25, 0.6, max(jw.x, jw.y));
        vec2 jd = abs(fract(jq) - 0.5);
        float joint = (1.0 - smoothstep(0.47 - jw.x, 0.47 + jw.x, jd.x) * smoothstep(0.47 - jw.y, 0.47 + jw.y, jd.y));
        joint = mix(1.0 - joint, 0.1, jfar);
        float slabV = mix(gh(floor(jq)), 0.5, jfar);
        col *= mix(1.0, (1.0 - joint * 0.45) * (0.9 + 0.18 * slabV), 1.0 - asph);
        // cracks and dust over everything; scorch blotches; debris dust toward the crater
        float ck = cracks(vWP.xz * 0.18) * smoothstep(0.35, 0.7, gn(vWP.xz * 0.05 + 3.0));
        col *= 1.0 - ck * 0.5;
        float scorch = smoothstep(0.6, 0.82, gfbm(vWP.xz * 0.045 + 11.0));
        col *= 1.0 - scorch * 0.6;
        float rc = length(vWP.xz - uCrater.xy) / uCrater.z;
        float ang = atan(vWP.z - uCrater.y, vWP.x - uCrater.x);
        // ejecta: rays of pale dust thrown out across the streets around the crater
        float rays = smoothstep(0.5, 0.85, gn(vec2(ang * 11.0, 0.5))) * smoothstep(2.1, 1.05, rc) * smoothstep(0.95, 1.1, rc);
        float dust = smoothstep(1.9, 1.0, rc) * 0.3 + smoothstep(0.55, 0.85, gfbm(vWP.xz * 0.06 + 5.0)) * 0.22 + rays * 0.35;
        col = mix(col, vec3(0.2, 0.185, 0.165) * (0.85 + 0.3 * n2), clamp(dust, 0.0, 0.75));
        gRough = mix(0.8, 0.95, asph * 0.5 + n3 * 0.3);
        gEmit = vec3(0.0);
        gBump = smoothstep(1.4, 1.0, rc) * 0.35;
        // the crater: broken asphalt and ash at the lip, raw earth and banded rock down the slopes,
        // a scorched floor, and the pit black and glowing where the blow landed
        float depth = -vWP.y;
        float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
        float inBowl = smoothstep(1.08, 0.97, rc);
        if (inBowl > 0.001) {
          vec3 ash = vec3(0.16, 0.155, 0.148) * (0.75 + 0.45 * n1);
          vec3 earth = mix(vec3(0.1, 0.078, 0.06), vec3(0.17, 0.135, 0.1), gn(vWP.xz * 0.7));
          // big patches of grey concrete dust and dark churned soil break up the bowl
          float patchK = gfbm(vWP.xz * 0.07 + 13.0);
          earth = mix(earth, vec3(0.2, 0.19, 0.175), smoothstep(0.5, 0.7, patchK) * 0.7);
          earth = mix(earth, vec3(0.06, 0.05, 0.042), smoothstep(0.42, 0.25, patchK) * 0.6);
          float strata = 0.5 + 0.5 * sin(vWP.y * 2.6 + n1 * 2.5);
          vec3 rock = mix(vec3(0.12, 0.11, 0.1), vec3(0.27, 0.24, 0.2), strata) * (0.78 + 0.35 * n3);
          vec3 burnt = vec3(0.055, 0.048, 0.043) * (0.7 + 0.6 * n2);
          vec3 c = mix(ash, earth, smoothstep(0.8, 4.0, depth) * 0.75);
          c = mix(c, rock, smoothstep(0.18, 0.45, slope));
          c = mix(c, burnt, smoothstep(0.55, 0.2, rc) * 0.7);
          c = mix(c, ash * 1.1, smoothstep(0.55, 0.9, gn(vec2(ang * 9.0, rc * 2.0))) * smoothstep(0.5, 0.95, rc) * 0.5);
          // broken asphalt slabs survive in patches near the rim
          c = mix(c, col * 0.9, smoothstep(0.75, 0.97, rc) * smoothstep(0.5, 0.7, gn(vWP.xz * 0.12 + 7.0)) * 0.8);
          float pd = length(vWP.xz - uPit.xy) / uPit.z;
          float pit = smoothstep(1.3, 0.55, pd);
          c = mix(c, vec3(0.045, 0.04, 0.036) * (0.6 + 0.7 * n2), pit * 0.9);
          // glowing seams in the pit floor
          // a few seams still glowing at the very bottom
          float seam = cracks(vWP.xz * 0.32 + vec2(n1 * 0.8)) * smoothstep(0.75, 0.25, pd) * smoothstep(12.0, 18.0, depth) * smoothstep(0.45, 0.7, gn(vWP.xz * 0.15 + 3.0));
          float ember = max(seam, smoothstep(0.6, 0.2, pd) * smoothstep(0.8, 0.95, gfbm(vWP.xz * 0.8 + vec2(0.0, uTime * 0.05))) * smoothstep(10.0, 16.0, depth));
          gEmit = vec3(2.8, 0.8, 0.18) * ember * (0.65 + 0.35 * sin(uTime * 1.7 + n1 * 20.0));
          col = mix(col, c, inBowl);
          gRough = mix(gRough, 0.96, inBowl);
          gBump = mix(gBump, 1.0, inBowl);
        }
        // a rough, lumpy surface: tilt the normal by the slope of a noise field
        {
          float e = 0.35;
          vec2 q = vWP.xz;
          float hx = gfbm((q + vec2(e, 0.0)) * 0.9) + gn((q + vec2(e, 0.0)) * 3.3) * 0.3;
          float hx0 = gfbm((q - vec2(e, 0.0)) * 0.9) + gn((q - vec2(e, 0.0)) * 3.3) * 0.3;
          float hz = gfbm((q + vec2(0.0, e)) * 0.9) + gn((q + vec2(0.0, e)) * 3.3) * 0.3;
          float hz0 = gfbm((q - vec2(0.0, e)) * 0.9) + gn((q - vec2(0.0, e)) * 3.3) * 0.3;
          gBumpN = normalize(vWN + vec3(hx0 - hx, 0.0, hz0 - hz) * 0.9 * gBump);
        }
        diffuseColor.rgb = col;
      }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gBumpN, 0.0)).xyz);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmit + diffuseColor.rgb * fireLight(vWP, vWN);');
  };
  mat.customProgramCacheKey = () => 'city-ground-v2';
  return mat;
}

/** the street plane around the crater square, and the crater grid itself (both with this material) */
export function makeGround(mat, terrain) {
  const group = new THREE.Group();
  const cx0 = CRATER.x - HALF, cz0 = CRATER.z - HALF, cx1 = CRATER.x + HALF, cz1 = CRATER.z + HALF;
  const E = 2600; // far edge
  const quads = [[-E, -E, E, cz0], [-E, cz1, E, E], [-E, cz0, cx0, cz1], [cx1, cz0, E, cz1]];
  for (const [xa, za, xb, zb] of quads) {
    const g = new THREE.PlaneGeometry(xb - xa, zb - za, Math.max(1, Math.round((xb - xa) / 40)), Math.max(1, Math.round((zb - za) / 40)));
    g.rotateX(-Math.PI / 2); g.translate((xa + xb) / 2, 0, (za + zb) / 2);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'street'; group.add(m);
  }
  // the crater: 1 m grid over the terrain square, normals from the height grid
  const seg = HALF * 2;
  const g = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg);
  g.rotateX(-Math.PI / 2); g.translate(CRATER.x, 0, CRATER.z);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrain.sample(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'crater'; group.add(m);
  void BOUNDS;
  return group;
}
