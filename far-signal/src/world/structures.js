import * as THREE from 'three';
import { Geo, M, tubeGeo, bladeGeo, temp } from '../gfx/geo.js';
import { litMaterial } from '../gfx/materials.js';
import { COMMON } from '../gfx/shaderlib.js';
import { commonUniforms } from '../gfx/globals.js';
import { mulberry32 } from '../core/noise.js';
import { crystalCluster, boulder } from './models.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, t) => a + (b - a) * t;
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const flat = (c, glow = 0) => (p, n, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = glow; };
function box(g, w, h, d, x, y, z, c, glow = 0, ry = 0, rx = 0, rz = 0) {
  g.add(temp(new THREE.BoxGeometry(w, h, d)), M.trs(x, y, z, rx, ry, rz), flat(c, glow), true);
}
function cyl(g, rt, rb, h, x, y, z, c, glow = 0, sides = 10, rx = 0, rz = 0, open = false) {
  g.add(temp(new THREE.CylinderGeometry(rt, rb, h, sides, 1, open)), M.trs(x, y, z, rx, 0, rz), flat(c, glow), sides <= 8);
}

const STEEL = [0.34, 0.37, 0.43], DARK = [0.09, 0.1, 0.13], BRONZE = [0.55, 0.36, 0.2], CYAN = [0.3, 0.95, 1.0], AMBER = [1.0, 0.55, 0.15];
const GREEN = [0.4, 1.0, 0.55], PINK = [1.0, 0.4, 0.8], WHITE = [0.85, 0.88, 0.92], ORANGE = [1.0, 0.42, 0.1];

export const metalMat = () => litMaterial({ metal: 0.55, spec: 0.9, shin: 60, wrap: 0.15, glow: 1.6, nightBoost: 0.3 });
export const stoneMat = () => litMaterial({ wrap: 0.12, spec: 0.12, shin: 20, glow: 1.5, nightBoost: 0.5 });

// --- The Lattice Gate ------------------------------------------------------------
const PORTAL_FRAG = /* glsl */`
${COMMON}
uniform float uOn; uniform vec3 uColA; uniform vec3 uColB;
varying vec2 vUv2; varying vec3 vWp;
void main(){
  vec2 p = vUv2 * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float sw = texture2D(uNoise, vec2(a * 0.159 + r * 0.6 - uTime * 0.12, r * 0.9 - uTime * 0.25)).r;
  float sw2 = texture2D(uNoise, vec2(a * 0.318 - uTime * 0.07, r * 2.0 + uTime * 0.4)).g;
  float rings = sin(r * 26.0 - uTime * 5.0 + sw * 6.0) * 0.5 + 0.5;
  float core = smoothstep(0.9, 0.0, r);
  vec3 col = mix(uColA, uColB, sw) * (0.5 + 1.6 * sw2 * rings) + vec3(1.0) * pow(core, 4.0) * 1.2;
  float edge = smoothstep(1.0, 0.82, r);
  gl_FragColor = vec4(col * edge * uOn * 2.2, edge * uOn * (0.55 + 0.45 * sw));
}`;
const PORTAL_VERT = /* glsl */`
varying vec2 vUv2; varying vec3 vWp;
void main(){ vUv2 = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

export function portalMaterial(colA = 0x35f0ff, colB = 0x7a5cff) {
  return new THREE.ShaderMaterial({
    vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG,
    uniforms: commonUniforms({ uOn: { value: 0 }, uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) } }),
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

export function buildGate() {
  const group = new THREE.Group();
  const g = new Geo();
  cyl(g, 3.3, 3.6, 0.5, 0, 0.25, 0, DARK, 0, 8);
  cyl(g, 2.9, 3.1, 0.16, 0, 0.56, 0, STEEL, 0, 8);
  cyl(g, 3.05, 3.05, 0.06, 0, 0.52, 0, CYAN, 0.9, 8);
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    box(g, 0.7, 1.5, 1.3, sx * 2.5, 1.2, 0, STEEL, 0, 0, 0, sx * -0.12);
    box(g, 0.5, 0.9, 0.9, sx * 2.3, 2.3, 0, BRONZE, 0, 0, 0, sx * -0.2);
    box(g, 0.12, 0.7, 0.5, sx * 2.72, 1.3, 0.68, CYAN, 0.9);
    g.add(tubeGeo([V(sx * 3.0, 0.6, 1.2), V(sx * 3.3, 1.3, 0.9), V(sx * 2.8, 2.0, 0.5)], [0.07, 0.07, 0.07], 5, false), null, flat(DARK));
  }
  const ringMat = M.trs(0, 3.25, 0);
  g.add(temp(new THREE.TorusGeometry(2.55, 0.3, 8, 44)), ringMat, (p, n, o) => {
    const a = Math.atan2(p.y, p.x);
    const seg = Math.abs(Math.sin(a * 11)) > 0.93;
    o[0] = seg ? DARK[0] : STEEL[0] * 1.1; o[1] = seg ? DARK[1] : STEEL[1] * 1.1; o[2] = seg ? DARK[2] : STEEL[2] * 1.1;
  });
  g.add(temp(new THREE.TorusGeometry(2.2, 0.07, 6, 60)), ringMat, flat(CYAN, 1));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    box(g, 0.5, 0.8, 0.86, Math.cos(a) * 2.6, 3.25 + Math.sin(a) * 2.6, 0, BRONZE, 0, 0, 0, a - Math.PI / 2);
    box(g, 0.2, 0.3, 0.92, Math.cos(a) * 2.55, 3.25 + Math.sin(a) * 2.55, 0, AMBER, 0.8, 0, 0, a - Math.PI / 2);
  }
  const body = new THREE.Mesh(g.build(), metalMat());
  body.layers.enable(1);
  group.add(body);
  const lattice = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.035, 5, 6), litMaterial({ glow: 2.2, metal: 0.3 }));
  const lg = lattice.geometry;
  const n = lg.attributes.position.count;
  lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.6), 3));
  lg.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(n * 2).fill(1), 2));
  lattice.position.y = 3.25;
  group.add(lattice);
  const lattice2 = lattice.clone();
  lattice2.scale.setScalar(0.72);
  group.add(lattice2);
  const portal = new THREE.Mesh(new THREE.CircleGeometry(2.25, 48), portalMaterial());
  portal.position.y = 3.25;
  portal.renderOrder = 8;
  group.add(portal);
  group.userData = { body, lattice, lattice2, portal };
  return group;
}

// --- Camp stations -----------------------------------------------------------------
export function buildStation(id) {
  const g = new Geo();
  if (id === 'still') {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; g.add(tubeGeo([V(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0), V(Math.cos(a) * 0.6, 0.9, Math.sin(a) * 0.6)], [0.07, 0.06], 5, false), null, flat(DARK)); }
    cyl(g, 0.72, 0.72, 1.7, 0, 1.7, 0, WHITE, 0, 12);
    cyl(g, 0.74, 0.74, 0.14, 0, 1.25, 0, GREEN, 0.9, 12);
    cyl(g, 0.74, 0.74, 0.06, 0, 2.2, 0, STEEL, 0, 12);
    cyl(g, 0.45, 0.72, 0.4, 0, 2.75, 0, STEEL, 0, 12);
    cyl(g, 0.5, 0.5, 0.08, 0, 3.0, 0, DARK, 0, 12);
    for (let i = 0; i < 4; i++) box(g, 0.9, 0.03, 0.14, 0, 3.06, 0, STEEL, 0, (i / 4) * Math.PI);
    for (let i = 0; i < 3; i++) { cyl(g, 0.14, 0.14, 0.6, 1.1, 0.42, -0.35 + i * 0.35, GREEN, 0.5, 8); cyl(g, 0.15, 0.15, 0.08, 1.1, 0.76, -0.35 + i * 0.35, STEEL, 0, 8); }
    box(g, 0.4, 0.14, 1.2, 1.1, 0.07, 0, DARK);
    g.add(tubeGeo([V(0.7, 1.0, 0), V(1.0, 1.0, 0), V(1.1, 0.8, 0)], [0.05, 0.05, 0.05], 5, false), null, flat(DARK));
  } else if (id === 'fabricator') {
    box(g, 2.4, 0.9, 1.2, 0, 0.45, 0, STEEL);
    box(g, 2.5, 0.08, 1.3, 0, 0.94, 0, DARK);
    box(g, 2.0, 0.03, 0.9, 0, 0.99, 0, CYAN, 0.55);
    box(g, 0.14, 1.5, 0.14, -1.1, 1.7, -0.5, STEEL); box(g, 0.14, 1.5, 0.14, 1.1, 1.7, -0.5, STEEL);
    box(g, 2.34, 0.14, 0.14, 0, 2.45, -0.5, STEEL);
    box(g, 0.3, 0.26, 0.5, 0.2, 2.3, -0.3, BRONZE);
    cyl(g, 0.02, 0.1, 0.45, 0.2, 1.98, -0.1, CYAN, 1, 6);
    g.add(tubeGeo([V(-0.9, 0.98, 0.3), V(-0.9, 1.6, 0.3), V(-0.4, 1.9, 0.15), V(-0.1, 1.5, 0.0)], [0.07, 0.06, 0.05, 0.03], 5, true), null, flat(BRONZE));
    box(g, 0.5, 0.36, 0.06, 0.85, 1.2, 0.45, DARK, 0, -0.3); box(g, 0.42, 0.28, 0.02, 0.86, 1.2, 0.49, CYAN, 0.8, -0.3);
    box(g, 0.5, 0.5, 0.5, -1.5, 0.25, 0.5, DARK); box(g, 0.4, 0.3, 0.4, 1.55, 0.15, -0.3, BRONZE);
  } else if (id === 'biolab') {
    cyl(g, 1.4, 1.5, 0.35, 0, 0.18, 0, STEEL, 0, 8);
    g.add(temp(new THREE.SphereGeometry(1.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)), M.trs(0, 0.35, 0), (p, n, o) => {
      const rib = Math.abs(Math.sin(Math.atan2(p.z, p.x) * 4)) > 0.96 || Math.abs(p.y - 0.62) < 0.03;
      o[0] = rib ? 0.3 : 0.1; o[1] = rib ? 0.33 : 0.42; o[2] = rib ? 0.38 : 0.4; o[3] = rib ? 0 : 0.28;
    }, true);
    cyl(g, 0.2, 0.2, 0.3, 0, 1.75, 0, STEEL, 0, 8);
    cyl(g, 0.08, 0.08, 0.5, 0, 2.1, 0, GREEN, 1, 6);
    for (let i = 0; i < 5; i++) { const c = i % 2 ? PINK : GREEN; cyl(g, 0.07, 0.07, 0.36, 1.7, 0.75, -0.5 + i * 0.25, c, 0.9, 6); }
    box(g, 0.3, 0.55, 1.4, 1.7, 0.28, 0, DARK);
    box(g, 0.7, 1.0, 0.1, 0, 0.85, 1.32, DARK); box(g, 0.5, 0.7, 0.04, 0, 0.9, 1.38, GREEN, 0.5);
  } else if (id === 'refinery') {
    box(g, 1.8, 1.7, 1.8, 0, 0.85, 0, DARK);
    box(g, 1.9, 0.14, 1.9, 0, 1.75, 0, STEEL);
    box(g, 1.0, 0.5, 0.06, 0, 0.7, 0.91, ORANGE, 1);
    box(g, 1.2, 0.08, 0.1, 0, 1.0, 0.93, STEEL); box(g, 1.2, 0.08, 0.1, 0, 0.42, 0.93, STEEL);
    cyl(g, 0.3, 0.38, 2.4, -0.5, 2.9, -0.45, STEEL, 0, 8);
    cyl(g, 0.34, 0.34, 0.12, -0.5, 4.1, -0.45, ORANGE, 0.7, 8);
    cyl(g, 0.7, 0.25, 0.8, 0.45, 2.2, 0.2, BRONZE, 0, 8);
    for (let i = 0; i < 3; i++) box(g, 0.5, 0.14, 0.24, 1.4, 0.08 + i * 0.15, 0.3 - i * 0.04, [0.75, 0.8, 0.88], 0, 0.1 * i);
    box(g, 0.5, 0.14, 0.24, 1.42, 0.08, 0.62, [0.75, 0.8, 0.88]);
    g.add(tubeGeo([V(0.9, 1.3, -0.4), V(1.3, 1.3, -0.5), V(1.3, 0.2, -0.5)], [0.08, 0.08, 0.08], 5, false), null, flat(STEEL));
  } else if (id === 'forge') {
    cyl(g, 1.7, 1.8, 0.2, 0, 0.1, 0, DARK, 0, 10);
    g.add(temp(new THREE.TorusGeometry(1.35, 0.05, 5, 32).rotateX(Math.PI / 2)), M.trs(0, 0.22, 0), flat([0.4, 0.7, 1.0], 1));
    box(g, 0.28, 3.4, 0.28, -1.5, 1.9, -0.4, STEEL); box(g, 0.28, 3.4, 0.28, 1.5, 1.9, -0.4, STEEL);
    box(g, 3.3, 0.3, 0.3, 0, 3.6, -0.4, STEEL);
    box(g, 0.5, 0.2, 0.34, 0, 3.6, -0.4, [0.4, 0.7, 1.0], 0.9);
    for (const sx of [-1, 1]) {
      g.add(tubeGeo([V(sx * 1.5, 2.6, -0.3), V(sx * 1.0, 2.9, 0.2), V(sx * 0.55, 2.2, 0.25)], [0.09, 0.07, 0.04], 5, true), null, flat(BRONZE));
      g.add(tubeGeo([V(sx * 1.5, 1.3, -0.3), V(sx * 1.05, 1.0, 0.3), V(sx * 0.5, 1.2, 0.2)], [0.09, 0.07, 0.04], 5, true), null, flat(BRONZE));
    }
    // empty frame on the cradle
    box(g, 0.5, 0.62, 0.3, 0, 1.75, 0, DARK); box(g, 0.34, 0.3, 0.26, 0, 1.3, 0, DARK);
    cyl(g, 0.1, 0.1, 0.05, 0, 1.82, 0.16, [0.4, 0.7, 1.0], 1, 10, Math.PI / 2);
    g.add(temp(new THREE.SphereGeometry(0.17, 8, 6)), M.trs(0, 2.24, 0), flat(DARK));
    box(g, 0.16, 0.7, 0.18, -0.4, 1.7, 0, DARK); box(g, 0.16, 0.7, 0.18, 0.4, 1.7, 0, DARK);
    box(g, 0.18, 0.9, 0.2, -0.14, 0.65, 0, DARK); box(g, 0.18, 0.9, 0.2, 0.14, 0.65, 0, DARK);
  }
  g.groundAO(0.4, 0.4);
  const mesh = new THREE.Mesh(g.build(), metalMat());
  mesh.layers.enable(1);
  return mesh;
}

// --- Ancient architecture -------------------------------------------------------------
const STONE = [0.13, 0.13, 0.17], STONE2 = [0.19, 0.19, 0.24];
function stoneFn(seed, glowCol, bands = 0) {
  return (p, n, o) => {
    const v = 0.75 + 0.35 * Math.sin(p.x * 1.7 + p.y * 2.3 + seed) * Math.cos(p.z * 1.9 + p.y * 0.7);
    o[0] = STONE[0] * v; o[1] = STONE[1] * v; o[2] = STONE[2] * v;
    if (bands > 0) {
      const line = Math.abs(((p.y * bands) % 1 + 1) % 1 - 0.5) < 0.06;
      if (line) { o[0] = glowCol[0]; o[1] = glowCol[1]; o[2] = glowCol[2]; o[3] = 0.9; }
    }
  };
}
function sbox(g, w, h, d, x, y, z, seed, glowCol = CYAN, bands = 0, ry = 0, rx = 0, rz = 0) {
  g.add(temp(new THREE.BoxGeometry(w, h, d, 1, Math.max(1, Math.round(h / 1.2)), 1)), M.trs(x, y, z, rx, ry, rz), stoneFn(seed, glowCol, bands), true);
}

const GLYPH_FRAG = /* glsl */`
${COMMON}
uniform vec3 uCol; uniform float uOpen; uniform float uLocked;
varying vec2 vUv2; varying vec3 vWp;
void main(){
  vec2 p = vUv2 * 2.0 - 1.0; p.x *= 0.62;
  float r = length(p); float a = atan(p.y, p.x);
  float ring = smoothstep(0.03, 0.0, abs(r - 0.5)) + smoothstep(0.02, 0.0, abs(r - 0.36)) * step(0.0, sin(a * 6.0 + uTime * 0.6));
  float spokes = smoothstep(0.03, 0.0, abs(sin(a * 3.0 - uTime * 0.25))) * step(r, 0.5) * step(0.14, r);
  float dots = smoothstep(0.05, 0.02, length(vec2(fract(a * 1.909 + 0.5) - 0.5, (r - 0.62) * 3.0)));
  float core = smoothstep(0.13, 0.0, r);
  float n = texture2D(uNoise, vUv2 * 1.5 + vec2(0.0, uTime * 0.05)).r;
  float g = ring + spokes * 0.7 + dots + core;
  vec3 col = uCol * g * (1.2 + 0.6 * sin(uTime * 2.0)) * mix(1.0, 0.25, uLocked);
  col += uCol * 0.06 * n;
  col += uCol * uOpen * (0.6 + n) * 1.5;
  col += vec3(0.012, 0.012, 0.018);
  gl_FragColor = vec4(applyFog(col, vWp), 1.0);
}`;
export function glyphMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: PORTAL_VERT, fragmentShader: GLYPH_FRAG,
    uniforms: commonUniforms({ uCol: { value: new THREE.Color(color) }, uOpen: { value: 0 }, uLocked: { value: 1 } }),
  });
}

// Megalithic doorway on a dais. `rise` lifts the dais (the Embers vault needs a double jump).
export function buildVaultEntrance(color, rise = 0.9, seed = 1) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const gc = [c.r * 1.2, c.g * 1.2, c.b * 1.2];
  const g = new Geo();
  sbox(g, 16, rise + 3, 14, 0, (rise - 3) / 2, 0, seed, gc, 0);
  sbox(g, 16.3, 0.25, 14.3, 0, rise - 0.5, 0, seed + 1, gc, 2);
  sbox(g, 2.2, 8, 2.4, -3.3, rise + 4, -3.2, seed + 2, gc, 0.35);
  sbox(g, 2.2, 8, 2.4, 3.3, rise + 4, -3.2, seed + 3, gc, 0.35);
  sbox(g, 10.2, 1.9, 2.8, 0, rise + 8.9, -3.2, seed + 4, gc, 0.5);
  sbox(g, 4.5, 8, 0.8, 0, rise + 4, -4.0, seed + 5, gc, 0);
  for (const sx of [-1, 1]) {
    g.add(temp(new THREE.CylinderGeometry(0.35, 0.95, 11, 4, 6)), M.trs(sx * 6.4, rise + 5.5, 4.6, 0, Math.PI / 4, 0), stoneFn(seed + 6, gc, 0.4), true);
    g.add(temp(new THREE.OctahedronGeometry(0.55)), M.trs(sx * 6.4, rise + 11.9, 4.6), flat(gc, 1), true);
  }
  const r = mulberry32(seed * 77);
  for (let i = 0; i < 7; i++) {
    const a = -0.5 + (i / 6) * (Math.PI + 1.0), R = 12.5 + r() * 1.5, h = 2 + r() * 4.5;
    g.add(temp(new THREE.BoxGeometry(1.5, h, 1.1, 1, 3, 1)), M.trs(Math.cos(a) * R, h / 2 - 1.2, Math.sin(a) * R * 0.9 + 1, (r() - 0.5) * 0.3, a, (r() - 0.5) * 0.3), stoneFn(seed + i, gc, r() < 0.5 ? 0.6 : 0), true);
  }
  const mesh = new THREE.Mesh(g.build(), stoneMat());
  mesh.layers.enable(1);
  group.add(mesh);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7.6), glyphMaterial(color));
  door.position.set(0, rise + 3.9, -3.58);
  group.add(door);
  group.userData = { door, rise };
  return group;
}

// The Spire: a stepped base and a shaft that runs out of sight.
export function buildSpire(seed = 5) {
  const group = new THREE.Group();
  const gc = [0.45, 1.0, 1.0];
  const g = new Geo();
  const tier = (r, y0, h, s) => g.add(temp(new THREE.CylinderGeometry(r, r + 1.2, h, 8, 2)), M.trs(0, y0 + h / 2, 0, 0, Math.PI / 8, 0), stoneFn(s, gc, 0.34), true);
  tier(42, -6, 8.7, seed); tier(28, 2.7, 2.7, seed + 1);
  // stair run on the south face (+z)
  for (let i = 0; i < 12; i++) {
    const y = (i + 1) * 0.45;
    const z = (i < 6 ? 44.5 - i * 1.0 : 31.5 - (i - 6) * 1.0);
    sbox(g, 9, 0.45, 1.05, 0, y - 0.225, z, seed + i, gc, 0);
  }
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
    g.add(temp(new THREE.CylinderGeometry(0.4, 1.0, 9, 4, 4)), M.trs(sx * 5.6, (k ? 2.7 : 0) + 4.5, k ? 27.5 : 41, 0, Math.PI / 4, 0), stoneFn(seed + 9, gc, 0.5), true);
  }
  // shaft
  g.add(temp(new THREE.CylinderGeometry(3.4, 6.4, 520, 12, 60, true)), M.trs(0, 5.4 + 260, 0), (p, n, o) => {
    const a = Math.atan2(p.z, p.x);
    const rib = Math.abs(Math.sin(a * 6)) > 0.965;
    const band = Math.abs(((p.y / 26) % 1 + 1) % 1 - 0.5) < 0.035;
    const v = 0.8 + 0.3 * Math.sin(p.y * 0.37 + a * 3.0);
    o[0] = STONE2[0] * v; o[1] = STONE2[1] * v; o[2] = STONE2[2] * v;
    if (rib || band) { o[0] = gc[0]; o[1] = gc[1]; o[2] = gc[2]; o[3] = 1; }
  });
  g.add(temp(new THREE.CylinderGeometry(1.6, 3.4, 2600, 10, 40, true)), M.trs(0, 525 + 1300, 0), (p, n, o) => {
    const a = Math.atan2(p.z, p.x);
    const rib = Math.abs(Math.sin(a * 5)) > 0.94;
    o[0] = STONE2[0]; o[1] = STONE2[1]; o[2] = STONE2[2];
    if (rib) { o[0] = gc[0]; o[1] = gc[1]; o[2] = gc[2]; o[3] = 1; }
  });
  for (let i = 0; i < 9; i++) {
    const y = 40 + i * 58, R = 9.5 - i * 0.5;
    g.add(temp(new THREE.TorusGeometry(R, 0.9, 6, 28).rotateX(Math.PI / 2)), M.trs(0, y, 0), stoneFn(seed + 20 + i, gc, 0), true);
    g.add(temp(new THREE.TorusGeometry(R + 0.95, 0.12, 5, 40).rotateX(Math.PI / 2)), M.trs(0, y, 0), flat(gc, 1));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * 6.283 + i; g.add(temp(new THREE.BoxGeometry(0.5, 0.5, R - 4)), M.trs(Math.cos(a) * (R + 4) * 0.5, y, Math.sin(a) * (R + 4) * 0.5, 0, -a + Math.PI / 2, 0), stoneFn(seed, gc, 0), true); }
  }
  const mat = stoneMat();
  mat.uniforms.uMat2.value.x = 0.25;      // dormant until the keystones are set
  const mesh = new THREE.Mesh(g.build(), mat);
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  group.add(mesh);
  // keystone terminal
  const t = new Geo();
  sbox(t, 3.4, 1.3, 1.4, 0, 0.65, 0, seed + 40, gc, 1.2);
  for (let i = 0; i < 3; i++) t.add(temp(new THREE.OctahedronGeometry(0.3)), M.trs(-1.05 + i * 1.05, 1.75, 0, 0, 0.6, 0, 1, 1.5, 1), flat([1.0, 0.95, 0.6], 1), true);
  const term = new THREE.Mesh(t.build(), stoneMat());
  term.position.set(0, 5.4, 11);
  term.userData.sockets = true;
  group.add(term);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4000, 8, 1, true), new THREE.ShaderMaterial({
    vertexShader: PORTAL_VERT,
    fragmentShader: `uniform float uOn; uniform float uTime; varying vec2 vUv2; void main(){ float f = 0.6 + 0.4 * sin(vUv2.y * 900.0 - uTime * 9.0); gl_FragColor = vec4(vec3(0.5, 1.0, 1.0) * uOn * f * 2.5, 1.0); }`,
    uniforms: { uOn: { value: 0 }, uTime: commonUniforms().uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beam.position.y = 2000;
  beam.frustumCulled = false;
  beam.visible = false;
  group.add(beam);
  group.userData = { mesh, mat, term, beam };
  return group;
}

// Scorch-marked hull fragments strewn around the landing site (decoration).
export function buildWreckage(seed = 3) {
  const r = mulberry32(seed), g = new Geo();
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.283, d = 5 + r() * 15;
    const w = 0.6 + r() * 1.8, h = 0.05 + r() * 0.12, dp = 0.5 + r() * 1.3;
    const c = r() < 0.5 ? [0.12, 0.11, 0.11] : [0.3, 0.26, 0.22];
    g.add(temp(new THREE.BoxGeometry(w, h, dp)), M.trs(Math.cos(a) * d, 0.08 + r() * 0.3, Math.sin(a) * d, (r() - 0.5) * 1.1, r() * 3, (r() - 0.5) * 0.9), (p, n, o) => {
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
      if (p.x > w * 0.42) { o[0] = 1; o[1] = 0.35; o[2] = 0.08; o[3] = 0.5; }
    }, true);
  }
  return new THREE.Mesh(g.build(), metalMat());
}

// --- Harvestable resource nodes -----------------------------------------------------------
export function nodeGeometry(kind) {
  const g = new Geo();
  const r = mulberry32(kind.length * 131 + kind.charCodeAt(0));
  switch (kind) {
    case 'scrap': {
      for (let i = 0; i < 5; i++) {
        const w = 0.35 + r() * 0.5, d = 0.3 + r() * 0.4;
        g.add(temp(new THREE.BoxGeometry(w, 0.06, d)), M.trs((r() - 0.5) * 0.6, 0.1 + i * 0.09, (r() - 0.5) * 0.6, (r() - 0.5) * 0.9, r() * 3, (r() - 0.5) * 0.9), (p, n, o) => {
          const v = 0.7 + r() * 0.3;
          o[0] = 0.46 * v; o[1] = 0.4 * v; o[2] = 0.34 * v;
          if (p.x > w * 0.38) { o[0] = 1; o[1] = 0.45; o[2] = 0.1; o[3] = 0.9; }
        }, true);
      }
      g.add(temp(new THREE.TorusGeometry(0.22, 0.05, 5, 10)), M.trs(0.1, 0.25, 0.1, 1.2, 0.4, 0.3), flat([0.7, 0.45, 0.2], 0.2));
      break;
    }
    case 'ferrite': {
      const b = boulder(17, 1);
      g.add(b, M.trs(0, 0, 0, 0, 0, 0, 0.85), (p, n, o) => {
        const streak = Math.sin(p.x * 6 + p.y * 9) * Math.cos(p.z * 7 - p.y * 4);
        if (streak > 0.25) { o[0] = 0.62; o[1] = 0.25; o[2] = 0.1; }
        else if (streak < -0.55) { o[0] = 0.75; o[1] = 0.72; o[2] = 0.7; o[3] = 0.12; }
        else { o[0] = 0.22; o[1] = 0.17; o[2] = 0.16; }
      }, true);
      b.dispose();
      break;
    }
    case 'lumen': {
      const c = crystalCluster(57, { count: 6, fat: 1.25 });
      g.add(c, M.trs(0, 0, 0, 0, 0, 0, 1.25), (p, n, o) => {
        const t = sat(p.y);
        o[0] = mix(0.3, 0.9, t); o[1] = mix(0.9, 1.0, t); o[2] = mix(0.95, 1.0, t); o[3] = 0.55 + 0.45 * t;
      }, true);
      c.dispose();
      break;
    }
    case 'pod': {
      g.add(tubeGeo([V(0, -0.1, 0), V(0.05, 0.3, 0.02), V(0, 0.55, 0)], [0.09, 0.07, 0.06], 6, false), null, flat([0.1, 0.22, 0.14]));
      g.add(temp(new THREE.SphereGeometry(0.42, 12, 9)), M.trs(0, 0.92, 0, 0, 0, 0, 1, 1.15, 1), (p, n, o) => {
        const vein = Math.abs(Math.sin(Math.atan2(p.z, p.x) * 5 + p.y * 3)) > 0.9;
        o[0] = vein ? 0.2 : 0.62; o[1] = vein ? 0.6 : 1.0; o[2] = vein ? 0.4 : 0.8; o[3] = vein ? 0.2 : 0.55; o[4] = 0.5;
      });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; g.add(bladeGeo(V(0, 0, 0), V(Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35), V(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75), 0.3, 3), null, (p, n, o) => { o[0] = 0.06; o[1] = 0.26; o[2] = 0.16; o[4] = 0.4; }); }
      break;
    }
    case 'bloom': {
      g.add(tubeGeo([V(0, -0.05, 0), V(0.04, 0.35, 0), V(0, 0.7, 0.03)], [0.035, 0.03, 0.025], 5, false), null, flat([0.14, 0.1, 0.2]));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; g.add(bladeGeo(V(0, 0.7, 0), V(Math.cos(a) * 0.22, 0.95, Math.sin(a) * 0.22), V(Math.cos(a) * 0.5, 0.82, Math.sin(a) * 0.5), 0.26, 3), null, (p, n, o) => { const t = sat(Math.hypot(p.x, p.z) * 2); o[0] = 1.0; o[1] = mix(0.25, 0.6, t); o[2] = mix(0.75, 0.95, t); o[3] = 0.5 + 0.5 * t; o[4] = 0.6; }); }
      g.add(temp(new THREE.SphereGeometry(0.09, 8, 6)), M.trs(0, 0.78, 0), flat([1, 0.95, 0.6], 1));
      for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283 + 0.5; g.add(bladeGeo(V(0, 0, 0), V(Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2), V(Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5), 0.2, 2), null, (p, n, o) => { o[0] = 0.16; o[1] = 0.1; o[2] = 0.28; }); }
      break;
    }
    case 'reed': {
      for (let i = 0; i < 9; i++) {
        const a = r() * 6.283, d = r() * 0.25, h = 1.1 + r() * 0.9, lean = 0.1 + r() * 0.35;
        const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
        g.add(bladeGeo(V(bx, -0.05, bz), V(bx + Math.cos(a) * lean * 0.3, h * 0.6, bz + Math.sin(a) * lean * 0.3), V(bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean), 0.12, 4), null, (p, n, o) => {
          const t = sat(p.y / h);
          o[0] = mix(0.1, 0.5, t); o[1] = mix(0.28, 0.85, t); o[2] = mix(0.1, 0.3, t); o[3] = t * t * 0.25; o[4] = t * t;
        });
      }
      break;
    }
    case 'emberglass': {
      const c = crystalCluster(71, { count: 5, fat: 1.6 });
      g.add(c, M.trs(0, 0, 0, 0, 0, 0, 1.0), (p, n, o) => {
        const t = sat(p.y);
        o[0] = mix(1.0, 0.07, t); o[1] = mix(0.4, 0.05, t); o[2] = mix(0.08, 0.06, t); o[3] = (1 - t) * 0.9 + 0.05;
      }, true);
      c.dispose();
      break;
    }
    case 'korrite': {
      const b = boulder(29, 1);
      g.add(b, M.trs(0, 0, 0, 0, 0, 0, 1.0, 1.15, 1.0), (p, n, o) => {
        const streak = Math.sin(p.x * 5 - p.y * 8) * Math.cos(p.z * 6 + p.y * 3);
        if (streak > 0.1) { o[0] = 0.55; o[1] = 0.66; o[2] = 0.85; o[3] = 0.1; }
        else { o[0] = 0.13; o[1] = 0.13; o[2] = 0.16; }
      }, true);
      b.dispose();
      break;
    }
    case 'voltite': {
      const c = crystalCluster(83, { count: 7, fat: 0.9 });
      g.add(c, M.trs(0, 0, 0, 0, 0, 0, 1.3), (p, n, o) => {
        const t = sat(p.y);
        o[0] = mix(0.1, 0.55, t); o[1] = mix(0.25, 0.75, t); o[2] = 1.0; o[3] = 0.5 + 0.5 * t;
      }, true);
      c.dispose();
      break;
    }
    case 'heliox': {
      const src = new THREE.IcosahedronGeometry(0.6, 1);
      g.add(temp(src), M.trs(0, 0.45, 0), (p, n, o) => {
        const open = p.y > 0.12 && p.x + p.z > -0.1;
        if (open) { o[0] = 1; o[1] = 0.82; o[2] = 0.3; o[3] = 1; }
        else { o[0] = 0.16; o[1] = 0.13; o[2] = 0.1; }
      }, true);
      for (let i = 0; i < 4; i++) g.add(temp(new THREE.OctahedronGeometry(0.14)), M.trs((r() - 0.5) * 0.5, 0.75 + r() * 0.25, (r() - 0.5) * 0.5, r(), r(), r(), 1, 1.8, 1), flat([1, 0.85, 0.35], 1), true);
      break;
    }
    default:
      box(g, 0.5, 0.5, 0.5, 0, 0.25, 0, WHITE);
  }
  return g.build();
}
