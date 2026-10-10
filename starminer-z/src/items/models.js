// 3D models of the items, built from bevelled parts in code. The hand holds each item at the
// origin; it points down -z with +y up. Units are metres.
//
// itemModel(id) returns { geo, info } where info has the muzzle, the sight line and so on.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ITEMS } from './items.js';
import { paint } from '../gfx/propMaterial.js';

const D = THREE.MathUtils.degToRad;
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S1 = new THREE.Vector3(1, 1, 1);

function place(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  Q.setFromEuler(E.set(rx, ry, rz));
  M.compose(V.set(x, y, z), Q, S1);
  geo.applyMatrix4(M);
  return geo;
}
const strip = (g) => {
  // keep only the attributes every part has, so they merge
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
};
const rbox = (w, h, d, r, color, metal = 0, emi = 0) => paint(strip(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))), color, metal, emi);
const box = (w, h, d, color, metal = 0, emi = 0) => paint(strip(new THREE.BoxGeometry(w, h, d)), color, metal, emi);
const cyl = (r0, r1, len, seg, color, metal = 0, emi = 0) => paint(strip(new THREE.CylinderGeometry(r0, r1, len, seg)), color, metal, emi);
// a cylinder lying along z
const tube = (r, len, seg, color, metal = 0, emi = 0) => place(cyl(r, r, len, seg, color, metal, emi), 0, 0, 0, Math.PI / 2, 0, 0);
function extrude(shape, depth, bevel, color, metal = 0, emi = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return paint(strip(g), color, metal, emi);
}
function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

const WOOD = 0x8a5226, WOOD_D = 0x5e3416, GRIP = 0x2a2a2c, BLACK = 0x1c1d20;
// guns by what they're made of ('space': the laser guns' white shells)
const METAL = { iron: 0x3c3f45, gold: 0xd4a42c, diamond: 0x8fd6e2, bloodstone: 0x7a1414, copper: 0xb06a3a, space: 0xd6dbe1 };
const METALNESS = { iron: 0.75, gold: 0.9, diamond: 0.6, bloodstone: 0.5, copper: 0.85, space: 0.35 };
// tools' heads and blades
const TOOL_COLORS = { wood: 0x8a5a2e, stone: 0x8b877f, copper: 0xc0703e, iron: 0xb9bdc2, gold: 0xf0c443, diamond: 0x9ce6ef, bloodstone: 0x9a1a1a };
const TIERS = Object.fromEntries(Object.entries(TOOL_COLORS).map(([k, color]) => [k, { color }]));

// ---- tools --------------------------------------------------------------------------------

function handle(len, r = 0.016, color = WOOD) {
  const parts = [place(cyl(r * 0.92, r, len, 8, color), 0, len / 2 - 0.06, 0)];
  // grip wrap near the hand
  parts.push(place(cyl(r * 1.12, r * 1.12, 0.1, 8, 0x4a2e18), 0, 0.0, 0));
  return parts;
}

function pickaxe(mat) {
  const t = TIERS[mat];
  const c = t.color, metal = mat === 'stone' ? 0.05 : METALNESS[mat] ?? 0.8;
  const parts = handle(0.56);
  // the head: a curved double-ended pick
  const s = new THREE.Shape();
  s.moveTo(-0.2, -0.02);
  s.quadraticCurveTo(0, 0.07, 0.2, -0.02);
  s.lineTo(0.205, -0.035);
  s.quadraticCurveTo(0, 0.028, -0.205, -0.035);
  s.closePath();
  const head = extrude(s, 0.036, 0.007, c, metal);
  place(head, 0, 0.46, 0, 0, Math.PI / 2, 0);
  parts.push(head);
  // the collar where it meets the handle
  parts.push(place(rbox(0.05, 0.06, 0.05, 0.008, mat === 'stone' ? 0x6a6660 : 0x555a60, 0.6), 0, 0.455, 0));
  return { geo: merge(parts), info: { reach: 0.62, head: new THREE.Vector3(0, 0.46, -0.2) } };
}

function spade(mat) {
  const t = TIERS[mat];
  const metal = mat === 'stone' ? 0.05 : METALNESS[mat] ?? 0.8;
  const parts = handle(0.55);
  const s = new THREE.Shape();
  s.moveTo(-0.07, 0);
  s.lineTo(0.07, 0);
  s.lineTo(0.065, 0.13);
  s.quadraticCurveTo(0, 0.2, -0.065, 0.13);
  s.closePath();
  const blade = extrude(s, 0.01, 0.004, t.color, metal);
  place(blade, 0, 0.5, 0, 0, 0, 0);
  parts.push(blade);
  parts.push(place(rbox(0.03, 0.06, 0.03, 0.006, 0x555a60, 0.6), 0, 0.49, 0));
  // D-grip at the end
  parts.push(place(rbox(0.09, 0.022, 0.024, 0.008, WOOD_D), 0, -0.12, 0));
  return { geo: merge(parts), info: { reach: 0.6 } };
}

function axe(mat) {
  const t = TIERS[mat];
  const metal = mat === 'stone' ? 0.05 : METALNESS[mat] ?? 0.8;
  const parts = handle(0.56);
  const s = new THREE.Shape();
  s.moveTo(0, -0.03);
  s.lineTo(0.06, -0.035);
  s.quadraticCurveTo(0.14, -0.09, 0.16, -0.1);
  s.quadraticCurveTo(0.19, 0.0, 0.16, 0.1);
  s.quadraticCurveTo(0.12, 0.06, 0.06, 0.035);
  s.lineTo(0, 0.03);
  s.closePath();
  const blade = extrude(s, 0.03, 0.006, t.color, metal);
  place(blade, 0, 0.47, 0, 0, Math.PI / 2, 0);
  parts.push(blade);
  parts.push(place(rbox(0.05, 0.07, 0.045, 0.008, 0x555a60, 0.6), 0, 0.47, 0));
  return { geo: merge(parts), info: { reach: 0.6 } };
}

function knife(mat) {
  const c = mat === 'iron' ? 0xc8ccd2 : TOOL_COLORS[mat];
  const parts = [];
  const s = new THREE.Shape();
  s.moveTo(0, -0.012);
  s.lineTo(0.17, -0.01);
  s.quadraticCurveTo(0.235, 0.0, 0.25, 0.018);
  s.quadraticCurveTo(0.18, 0.02, 0.0, 0.016);
  s.closePath();
  const blade = extrude(s, 0.004, 0.002, c, 0.9);
  place(blade, 0, 0.0, -0.04, 0, Math.PI / 2, 0);
  parts.push(blade);
  parts.push(place(rbox(0.05, 0.016, 0.018, 0.004, 0x3a3a3a, 0.7), 0, 0.0, -0.035));
  parts.push(place(rbox(0.026, 0.03, 0.11, 0.008, GRIP), 0, -0.002, 0.03));
  parts.push(place(cyl(0.012, 0.012, 0.012, 8, 0x5a5a5a, 0.8), 0, 0, 0.088, Math.PI / 2, 0, 0));
  return { geo: merge(parts), info: { reach: 0.4 } };
}

function compass() {
  const parts = [];
  parts.push(place(cyl(0.05, 0.05, 0.018, 24, 0x8a6a2a, 0.85), 0, 0, 0));
  parts.push(place(cyl(0.044, 0.044, 0.004, 24, 0xe8e2d0), 0, 0.009, 0));
  parts.push(place(cyl(0.012, 0.012, 0.012, 10, 0x8a6a2a, 0.85), 0, 0, -0.056, Math.PI / 2, 0, 0));
  // marks around the face
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(place(box(0.004, 0.002, i % 2 ? 0.006 : 0.012, 0x222222), Math.sin(a) * 0.036, 0.012, -Math.cos(a) * 0.036, 0, -a, 0));
  }
  return { geo: merge(parts), info: { needle: true } };
}

function needle() {
  const parts = [];
  const s = new THREE.Shape();
  s.moveTo(0, -0.034); s.lineTo(0.006, 0); s.lineTo(-0.006, 0); s.closePath();
  parts.push(place(extrude(s, 0.002, 0, 0xd02020, 0.2), 0, 0, 0, -Math.PI / 2, 0, 0));
  const s2 = new THREE.Shape();
  s2.moveTo(0, 0.034); s2.lineTo(0.006, 0); s2.lineTo(-0.006, 0); s2.closePath();
  parts.push(place(extrude(s2, 0.002, 0, 0xf0f0f0, 0.2), 0, 0, 0, -Math.PI / 2, 0, 0));
  return merge(parts);
}

function torch() {
  const parts = [place(cyl(0.013, 0.011, 0.36, 8, 0x6e4a26), 0, 0.12, 0)];
  parts.push(place(cyl(0.018, 0.016, 0.05, 8, 0x2a2018), 0, 0.31, 0));
  parts.push(place(cyl(0.016, 0.018, 0.03, 8, 0xffb040, 0, 1.4), 0, 0.345, 0));
  return { geo: merge(parts), info: { flame: new THREE.Vector3(0, 0.38, 0) } };
}

// ---- guns ---------------------------------------------------------------------------------

function pistol(mat) {
  const m = METAL[mat], mm = METALNESS[mat];
  const parts = [];
  // slide, frame, barrel
  parts.push(place(rbox(0.034, 0.042, 0.23, 0.006, m, mm), 0, 0.072, -0.07));
  for (let i = 0; i < 6; i++) parts.push(place(box(0.036, 0.03, 0.004, BLACK, 0.5), 0, 0.072, 0.02 + i * 0.008));
  parts.push(place(rbox(0.03, 0.026, 0.17, 0.005, mat === 'iron' ? 0x2c2e32 : m, mm * 0.8), 0, 0.04, -0.05));
  parts.push(place(tube(0.009, 0.03, 10, 0x18191b, 0.8), 0, 0.07, -0.19));
  // sights and hammer
  parts.push(place(box(0.006, 0.01, 0.01, BLACK), 0, 0.097, -0.175));
  parts.push(place(box(0.02, 0.01, 0.008, BLACK), 0, 0.097, 0.035));
  parts.push(place(rbox(0.012, 0.02, 0.012, 0.003, BLACK, 0.6), 0, 0.075, 0.05, D(-20), 0, 0));
  // trigger guard and trigger
  parts.push(place(box(0.008, 0.006, 0.05, m, mm), 0, 0.012, -0.045));
  parts.push(place(box(0.008, 0.03, 0.006, m, mm), 0, 0.024, -0.072));
  parts.push(place(box(0.005, 0.02, 0.006, BLACK, 0.5), 0, 0.022, -0.042, D(15), 0, 0));
  // grip with panels
  parts.push(place(rbox(0.031, 0.11, 0.046, 0.008, mat === 'iron' ? 0x2a2b2e : m, mm * 0.6), 0, -0.02, 0.0, D(-14), 0, 0));
  parts.push(place(rbox(0.034, 0.08, 0.034, 0.006, GRIP), 0, -0.022, 0.002, D(-14), 0, 0));
  return { geo: merge(parts), info: { muzzle: new THREE.Vector3(0, 0.07, -0.21), sight: new THREE.Vector3(0, 0.104, 0), eject: new THREE.Vector3(0.02, 0.08, -0.02), twoHand: false } };
}

function assault(mat) {
  const m = METAL[mat], mm = METALNESS[mat];
  const wood = mat === 'iron' ? WOOD : mat === 'gold' ? 0x5a2e14 : 0x2a3a40;
  const parts = [];
  // receiver with dust cover
  parts.push(place(rbox(0.046, 0.06, 0.32, 0.006, m, mm), 0, 0.055, -0.03));
  parts.push(place(rbox(0.04, 0.02, 0.28, 0.008, m, mm), 0, 0.09, -0.02));
  for (let i = 0; i < 5; i++) parts.push(place(box(0.042, 0.004, 0.012, BLACK, 0.5), 0, 0.101, -0.1 + i * 0.05));
  // barrel, gas tube, front sight, muzzle brake
  parts.push(place(tube(0.011, 0.42, 10, 0x1d1e21, 0.85), 0, 0.06, -0.37));
  parts.push(place(tube(0.012, 0.2, 10, m, mm), 0, 0.088, -0.27));
  parts.push(place(rbox(0.012, 0.05, 0.016, 0.003, BLACK), 0, 0.09, -0.52));
  parts.push(place(tube(0.016, 0.05, 10, 0x2a2b2e, 0.8), 0, 0.06, -0.585));
  // handguard
  parts.push(place(rbox(0.056, 0.056, 0.2, 0.012, wood), 0, 0.06, -0.27));
  parts.push(place(rbox(0.05, 0.03, 0.17, 0.01, wood), 0, 0.093, -0.27));
  // curved magazine: three segments
  for (let i = 0; i < 4; i++) parts.push(place(rbox(0.03, 0.06, 0.05, 0.005, mat === 'iron' ? 0x2a2a2a : m, mm * 0.7), 0, -0.005 - i * 0.045, -0.115 + i * 0.016, D(-12 - i * 9), 0, 0));
  // pistol grip and trigger guard
  parts.push(place(rbox(0.032, 0.1, 0.045, 0.008, wood), 0, -0.02, 0.07, D(-16), 0, 0));
  parts.push(place(box(0.008, 0.006, 0.07, m, mm), 0, 0.012, 0.02));
  parts.push(place(box(0.005, 0.022, 0.006, BLACK), 0, 0.022, 0.02, D(15), 0, 0));
  // stock
  const s = new THREE.Shape();
  s.moveTo(0, 0.03); s.lineTo(0.26, 0.0); s.lineTo(0.27, -0.09); s.lineTo(0.24, -0.1); s.lineTo(0, -0.02); s.closePath();
  const stock = extrude(s, 0.04, 0.008, wood);
  place(stock, 0, 0.07, 0.13, 0, -Math.PI / 2, 0);
  parts.push(stock);
  parts.push(place(rbox(0.046, 0.1, 0.012, 0.004, BLACK), 0, 0.03, 0.405));
  // rear sight
  parts.push(place(box(0.03, 0.016, 0.02, BLACK), 0, 0.107, -0.13));
  return { geo: merge(parts), info: { muzzle: new THREE.Vector3(0, 0.06, -0.61), sight: new THREE.Vector3(0, 0.113, 0), eject: new THREE.Vector3(0.03, 0.07, -0.05), twoHand: true } };
}

function smg(mat) {
  const m = METAL[mat], mm = METALNESS[mat];
  const parts = [];
  parts.push(place(rbox(0.045, 0.065, 0.26, 0.008, m, mm), 0, 0.055, -0.06));
  parts.push(place(tube(0.016, 0.12, 12, 0x1d1e21, 0.8), 0, 0.055, -0.24));
  parts.push(place(tube(0.022, 0.06, 12, 0x2a2b2e, 0.6), 0, 0.055, -0.28));
  parts.push(place(rbox(0.03, 0.14, 0.04, 0.005, 0x262626, 0.6), 0, -0.04, -0.13, D(-4), 0, 0));
  parts.push(place(rbox(0.032, 0.1, 0.044, 0.008, GRIP), 0, -0.02, 0.04, D(-14), 0, 0));
  parts.push(place(box(0.008, 0.006, 0.06, m, mm), 0, 0.012, -0.01));
  // folding wire stock
  parts.push(place(box(0.008, 0.008, 0.2, BLACK, 0.7), 0.02, 0.06, 0.16));
  parts.push(place(box(0.008, 0.008, 0.2, BLACK, 0.7), -0.02, 0.06, 0.16));
  parts.push(place(box(0.05, 0.07, 0.01, BLACK, 0.7), 0, 0.04, 0.26));
  parts.push(place(rbox(0.03, 0.018, 0.04, 0.004, BLACK), 0, 0.095, 0.0));
  parts.push(place(box(0.008, 0.02, 0.01, BLACK), 0, 0.095, -0.17));
  return { geo: merge(parts), info: { muzzle: new THREE.Vector3(0, 0.055, -0.31), sight: new THREE.Vector3(0, 0.108, 0), eject: new THREE.Vector3(0.03, 0.07, -0.06), twoHand: true } };
}

function shotgun(mat) {
  const m = METAL[mat], mm = METALNESS[mat];
  const wood = mat === 'iron' ? WOOD : mat === 'gold' ? 0x5a2e14 : 0x2a3a40;
  const parts = [];
  parts.push(place(rbox(0.048, 0.07, 0.22, 0.008, m, mm), 0, 0.055, -0.02));
  parts.push(place(tube(0.014, 0.6, 12, 0x1d1e21, 0.85), 0, 0.075, -0.42));
  parts.push(place(tube(0.012, 0.5, 12, m, mm), 0, 0.045, -0.37));
  // pump
  parts.push(place(rbox(0.05, 0.045, 0.16, 0.014, wood), 0, 0.045, -0.32));
  for (let i = 0; i < 5; i++) parts.push(place(box(0.052, 0.04, 0.006, WOOD_D), 0, 0.045, -0.38 + i * 0.03));
  parts.push(place(box(0.008, 0.008, 0.008, 0xd0d0d0, 0.9), 0, 0.09, -0.71));
  parts.push(place(rbox(0.034, 0.1, 0.046, 0.008, wood), 0, -0.02, 0.08, D(-20), 0, 0));
  parts.push(place(box(0.008, 0.006, 0.07, m, mm), 0, 0.012, 0.03));
  const s = new THREE.Shape();
  s.moveTo(0, 0.025); s.lineTo(0.28, 0.0); s.lineTo(0.29, -0.1); s.lineTo(0.25, -0.11); s.lineTo(0, -0.03); s.closePath();
  const stock = extrude(s, 0.042, 0.01, wood);
  place(stock, 0, 0.07, 0.1, 0, -Math.PI / 2, 0);
  parts.push(stock);
  parts.push(place(rbox(0.046, 0.11, 0.014, 0.005, 0x1a1a1a), 0, 0.02, 0.395));
  return { geo: merge(parts), info: { muzzle: new THREE.Vector3(0, 0.075, -0.72), sight: new THREE.Vector3(0, 0.1, 0), eject: new THREE.Vector3(0.03, 0.07, -0.02), twoHand: true, pump: true } };
}

function rifle(mat) {
  const m = METAL[mat], mm = METALNESS[mat];
  const wood = mat === 'iron' ? 0x7a4420 : mat === 'gold' ? 0x5a2e14 : 0x2a3a40;
  const parts = [];
  // long wooden stock running under the barrel
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.02); s.lineTo(0.12, 0.02); s.lineTo(0.42, 0.0); s.lineTo(0.43, -0.1); s.lineTo(0.38, -0.11); s.lineTo(0.1, -0.035); s.lineTo(0.02, -0.06); s.lineTo(-0.02, -0.02); s.lineTo(-0.5, -0.01); s.closePath();
  const stock = extrude(s, 0.042, 0.008, wood);
  place(stock, 0, 0.05, -0.02, 0, -Math.PI / 2, 0);
  parts.push(stock);
  parts.push(place(rbox(0.04, 0.045, 0.2, 0.006, m, mm), 0, 0.085, -0.05));
  parts.push(place(tube(0.011, 0.6, 10, 0x1d1e21, 0.85), 0, 0.085, -0.42));
  // bolt handle
  parts.push(place(cyl(0.005, 0.005, 0.06, 6, m, mm), 0.035, 0.09, 0.02, 0, 0, D(80)));
  parts.push(place(new THREE.SphereGeometry(0.01, 8, 6).toNonIndexed(), 0.065, 0.085, 0.02));
  paint(parts[parts.length - 1], m, mm);
  // scope with lenses
  parts.push(place(tube(0.019, 0.26, 16, 0x1a1b1d, 0.7), 0, 0.14, -0.06));
  parts.push(place(tube(0.024, 0.05, 16, 0x1a1b1d, 0.7), 0, 0.14, -0.2));
  parts.push(place(tube(0.022, 0.04, 16, 0x1a1b1d, 0.7), 0, 0.14, 0.07));
  parts.push(place(tube(0.02, 0.002, 16, 0x6a9ac8, 0.95, 0.15), 0, 0.14, -0.226));
  parts.push(place(rbox(0.016, 0.03, 0.02, 0.004, BLACK), 0, 0.112, -0.12));
  parts.push(place(rbox(0.016, 0.03, 0.02, 0.004, BLACK), 0, 0.112, 0.0));
  parts.push(place(box(0.008, 0.006, 0.06, m, mm), 0, 0.03, 0.0));
  return { geo: merge(parts), info: { muzzle: new THREE.Vector3(0, 0.085, -0.73), sight: new THREE.Vector3(0, 0.14, 0), eject: new THREE.Vector3(0.03, 0.09, 0.0), twoHand: true, scope: true } };
}

function lmg(mat) {
  const m = METAL[mat], mm = METALNESS[mat];
  const dark = mat === 'iron' ? 0x2a2b2e : m;
  const parts = [];
  // a long receiver, a heavy barrel in a perforated shroud, a box magazine, a bipod
  parts.push(place(rbox(0.06, 0.075, 0.36, 0.008, m, mm), 0, 0.06, -0.02));
  parts.push(place(rbox(0.05, 0.02, 0.3, 0.006, dark, mm * 0.8), 0, 0.105, -0.02));
  parts.push(place(tube(0.024, 0.34, 12, 0x2c2e32, 0.7), 0, 0.065, -0.36));
  for (let i = 0; i < 6; i++) parts.push(place(tube(0.026, 0.012, 12, BLACK, 0.6), 0, 0.065, -0.24 - i * 0.045));
  parts.push(place(tube(0.012, 0.22, 10, 0x1d1e21, 0.85), 0, 0.065, -0.62));
  parts.push(place(tube(0.018, 0.05, 10, 0x2a2b2e, 0.8), 0, 0.065, -0.74));
  parts.push(place(rbox(0.08, 0.1, 0.11, 0.008, 0x3a3d33, 0.3), 0.01, -0.02, -0.06));
  parts.push(place(box(0.008, 0.16, 0.008, BLACK, 0.7), 0.03, -0.03, -0.55, D(20), 0, D(-15)));
  parts.push(place(box(0.008, 0.16, 0.008, BLACK, 0.7), -0.03, -0.03, -0.55, D(20), 0, D(15)));
  // carry handle, grip, stock
  parts.push(place(rbox(0.012, 0.03, 0.12, 0.004, BLACK), 0, 0.13, -0.15));
  parts.push(place(rbox(0.034, 0.1, 0.046, 0.008, GRIP), 0, -0.02, 0.08, D(-16), 0, 0));
  parts.push(place(box(0.008, 0.006, 0.07, m, mm), 0, 0.012, 0.03));
  const s = new THREE.Shape();
  s.moveTo(0, 0.035); s.lineTo(0.26, 0.01); s.lineTo(0.27, -0.09); s.lineTo(0.22, -0.1); s.lineTo(0, -0.03); s.closePath();
  const stock = extrude(s, 0.05, 0.008, dark, mm * 0.5);
  place(stock, 0, 0.07, 0.16, 0, -Math.PI / 2, 0);
  parts.push(stock);
  return { geo: merge(parts), info: { muzzle: new THREE.Vector3(0, 0.065, -0.77), sight: new THREE.Vector3(0, 0.13, 0), eject: new THREE.Vector3(0.035, 0.07, -0.05), twoHand: true } };
}

// a laser gun: the shape of its kind in a white shell, with a glowing strip of its colour along
// the barrel
function laserGun(gun, color) {
  const base = ({ pistol, assault, smg, shotgun, rifle })[gun]('space');
  const mz = base.info.muzzle;
  const len = -mz.z - 0.06;
  const strip = place(box(0.012, 0.008, len, color, 0, 1.3), 0, mz.y + 0.022, mz.z + len / 2 + 0.02);
  const ring = place(tube(0.02, 0.012, 12, color, 0, 1.3), 0, mz.y, mz.z + 0.01);
  return { geo: merge([base.geo, strip, ring]), info: { ...base.info, glow: color } };
}

// a laser sword: a ribbed metal hilt and its beam, down the hand's -z
function saber(color) {
  const parts = [];
  parts.push(place(tube(0.018, 0.2, 14, 0x9ea4ab, 0.85), 0, 0, 0.02));
  for (let i = 0; i < 5; i++) parts.push(place(tube(0.02, 0.012, 14, BLACK, 0.4), 0, 0, 0.07 - i * 0.025));
  parts.push(place(tube(0.024, 0.04, 14, 0x5a5f66, 0.8), 0, 0, -0.09));
  parts.push(place(box(0.01, 0.014, 0.03, 0xd02020, 0.2, 0.6), 0, 0.02, -0.02));
  parts.push(place(tube(0.012, 0.8, 12, color, 0, 1.6), 0, 0, -0.51));
  parts.push(place(tube(0.02, 0.76, 12, color, 0, 0.7), 0, 0, -0.5));
  return { geo: merge(parts), info: { reach: 0.9 } };
}

// a rocket launcher: a tube over the shoulder with a rocket's nose at the front (the guided one
// grey, with its tracking box)
function launcher(guided) {
  const body = guided ? 0x6e7268 : 0x4a5a3a, dark = 0x22241f;
  const parts = [];
  parts.push(place(tube(0.045, 0.92, 16, body, 0.3), 0, 0.07, -0.12));
  parts.push(place(tube(0.05, 0.08, 16, dark, 0.4), 0, 0.07, 0.32));
  parts.push(place(tube(0.05, 0.06, 16, dark, 0.4), 0, 0.07, -0.56));
  // the rocket's nose in the muzzle
  parts.push(place(cyl(0.0, 0.04, 0.12, 14, 0x5a5e58, 0.5), 0, 0.07, -0.65, -Math.PI / 2, 0, 0));
  parts.push(place(rbox(0.032, 0.1, 0.044, 0.008, GRIP), 0, -0.02, 0.0, D(-12), 0, 0));
  parts.push(place(rbox(0.032, 0.09, 0.04, 0.008, GRIP), 0, -0.015, -0.25, D(-6), 0, 0));
  parts.push(place(box(0.008, 0.006, 0.06, dark, 0.6), 0, 0.012, -0.04));
  parts.push(place(rbox(0.03, 0.05, 0.08, 0.006, dark, 0.5), -0.06, 0.1, -0.12));
  if (guided) parts.push(place(rbox(0.06, 0.06, 0.12, 0.008, 0x3a3d40, 0.6), 0, 0.15, -0.2), place(tube(0.022, 0.004, 14, 0xd02020, 0.2, 0.8), 0, 0.15, -0.262));
  return { geo: merge(parts), info: { muzzle: new THREE.Vector3(0, 0.07, -0.72), sight: new THREE.Vector3(0, 0.13, 0), twoHand: true } };
}

function grenade() {
  const parts = [];
  const g = new THREE.SphereGeometry(0.035, 12, 10).toNonIndexed();
  g.scale(1, 1.25, 1);
  parts.push(paint(strip(g), 0x3d4a2a, 0.2));
  for (let i = 0; i < 4; i++) parts.push(place(cyl(0.0362, 0.0362, 0.004, 12, 0x2c351e, 0.2), 0, -0.03 + i * 0.02, 0));
  parts.push(place(cyl(0.014, 0.016, 0.02, 10, 0x6a6d70, 0.8), 0, 0.05, 0));
  parts.push(place(box(0.012, 0.07, 0.006, 0x8a8d90, 0.8), 0.02, 0.03, 0, 0, 0, D(-12)));
  parts.push(place(paint(strip(new THREE.TorusGeometry(0.012, 0.0025, 6, 14)), 0xb8bcc0, 0.9), -0.02, 0.064, 0, 0, Math.PI / 2, 0));
  return { geo: merge(parts), info: {} };
}

// the clock, the locator and the teleporter: in a case like the compass's, each with its face,
// and a hand that turns (the needle): the clock's goes round its 24-hour face once a day, the
// sun at the top and the moon at the bottom; the locator's points the way to where it's set
function gadget(kind) {
  const face = { clock: 0xf0ead8, locator: 0x2a6a3a, teleporter: 0x5a2a8a }[kind];
  const rim = { clock: 0x8a6a2a, locator: 0x4a4e54, teleporter: 0x3a3d44 }[kind];
  const parts = [];
  parts.push(place(cyl(0.05, 0.05, 0.018, 24, rim, 0.85), 0, 0, 0));
  parts.push(place(cyl(0.044, 0.044, 0.004, 24, face, 0.1, kind === 'clock' ? 0 : 0.6), 0, 0.009, 0));
  parts.push(place(cyl(0.012, 0.012, 0.012, 10, rim, 0.85), 0, 0, -0.056, Math.PI / 2, 0, 0));
  const hand = [];
  if (kind === 'clock') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push(place(box(0.003, 0.002, i % 3 ? 0.005 : 0.01, 0x222222), Math.sin(a) * 0.037, 0.012, -Math.cos(a) * 0.037, 0, -a, 0));
    }
    parts.push(place(cyl(0.007, 0.007, 0.002, 12, 0xf0c030, 0, 0.8), 0, 0.012, -0.024), place(cyl(0.006, 0.006, 0.002, 12, 0x8090c0, 0, 0.4), 0, 0.012, 0.024));
    hand.push(place(box(0.003, 0.002, 0.032, 0x222222), 0, 0, -0.014), place(cyl(0.004, 0.004, 0.003, 10, 0x222222), 0, 0, 0));
  } else {
    // a cross of gridlines, and the pointer
    parts.push(place(box(0.07, 0.002, 0.002, 0xa0f0b0, 0, 0.8), 0, 0.012, 0), place(box(0.002, 0.002, 0.07, 0xa0f0b0, 0, 0.8), 0, 0.012, 0));
    const s = new THREE.Shape();
    s.moveTo(0, -0.03); s.lineTo(0.007, -0.012); s.lineTo(-0.007, -0.012); s.closePath();
    hand.push(place(extrude(s, 0.002, 0, kind === 'locator' ? 0xff4040 : 0xf0c0ff, 0.2, 1.2), 0, 0, 0, -Math.PI / 2, 0, 0));
  }
  return { geo: merge(parts), info: { needle: true }, needle: merge(hand) };
}

function door() {
  const parts = [place(rbox(0.36, 0.72, 0.05, 0.01, 0x8a6438), 0, 0.36, 0)];
  parts.push(place(box(0.3, 0.02, 0.054, 0x5e4224), 0, 0.2, 0), place(box(0.3, 0.02, 0.054, 0x5e4224), 0, 0.52, 0));
  parts.push(place(cyl(0.012, 0.012, 0.03, 8, 0x888888, 0.9), 0.13, 0.36, 0.03, Math.PI / 2, 0, 0));
  return { geo: merge(parts), info: {} };
}

// ---- small things ----------------------------------------------------------------------------

function lump(color, metal, seed, size = 0.05, rough = 0.3) {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position;
  let h = seed * 9301 + 49297;
  const rnd = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
  const offs = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!offs.has(k)) offs.set(k, 1 + (rnd() - 0.5) * rough);
    const f = offs.get(k);
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return paint(g, color, metal);
}

function ingot(color, metal) {
  const s = new THREE.Shape();
  s.moveTo(-0.06, 0); s.lineTo(0.06, 0); s.lineTo(0.045, 0.035); s.lineTo(-0.045, 0.035); s.closePath();
  const g = extrude(s, 0.05, 0.004, color, metal);
  return { geo: merge([g]), info: {} };
}

function gem() {
  const g = new THREE.OctahedronGeometry(0.045, 0);
  g.scale(1, 1.25, 1);
  g.computeVertexNormals();
  return { geo: merge([paint(g, 0xa8f0f8, 0.95, 0.15)]), info: {} };
}

// three rounds: their heads (null: casings, no heads) and their cases
function bullets(head = 0xb06030, cases = 0xc89a3a, emi = 0) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.022;
    parts.push(place(cyl(0.008, 0.008, 0.05, 10, cases, 0.9), x, 0.025, 0));
    if (head != null) parts.push(place(cyl(0.002, 0.008, 0.02, 10, head, 0.9, emi), x, 0.06, 0));
  }
  return { geo: merge(parts), info: {} };
}

// the ore: a lump of rock with the metal showing in it
function ore(color, seed) {
  const parts = [lump(0x6e6a64, 0.1, seed, 0.05, 0.3)];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + seed;
    parts.push(place(lump(color, 0.7, seed + i + 1, 0.016, 0.4), Math.cos(a) * 0.036, 0.008 + (i % 2) * 0.012, Math.sin(a) * 0.036));
  }
  return { geo: merge(parts), info: {} };
}

function powder(color) {
  const parts = [place(cyl(0.006, 0.055, 0.04, 14, color, 0.05), 0, 0.02, 0)];
  for (let i = 0; i < 5; i++) parts.push(place(lump(color, 0.05, i + 2, 0.012, 0.5), Math.cos(i * 1.3) * 0.045, 0.004, Math.sin(i * 1.3) * 0.045));
  return { geo: merge(parts), info: {} };
}

function rocketShell() {
  const parts = [place(cyl(0.022, 0.022, 0.14, 12, 0x5a5e58, 0.5), 0, 0.07, 0)];
  parts.push(place(cyl(0.0, 0.022, 0.06, 12, 0x6a6e68, 0.5), 0, 0.17, 0));
  parts.push(place(cyl(0.023, 0.023, 0.012, 12, 0xc89a3a, 0.9), 0, 0.12, 0));
  for (let i = 0; i < 4; i++) parts.push(place(box(0.004, 0.04, 0.03, 0x3a3d38, 0.4), Math.cos(i * Math.PI / 2) * 0.026, 0.02, Math.sin(i * Math.PI / 2) * 0.026, 0, -i * Math.PI / 2, 0));
  return { geo: merge(parts), info: {} };
}

function stick() {
  return { geo: merge([place(cyl(0.012, 0.012, 0.3, 6, 0x7a5430), 0, 0.1, 0, 0, 0, D(10))]), info: {} };
}

// ---- the lookup -------------------------------------------------------------------------------

// rounds: [head, case] (a casing has no head)
const ROUNDS = {
  bullets: [0xb06030, 0xc89a3a], bullets_iron: [0xc8ccd0, 0xc89a3a], bullets_gold: [0xf2c443, 0xb9bdc2], bullets_diamond: [0x9ce6ef, 0xf2c443],
  bullets_bloodstone: [0x9a1a1a, 0x9ce6ef], bullets_laser: [0x40ff60, 0x6a6a6a, 1.2], casing_brass: [null, 0xc89a3a], casing_iron: [null, 0xb9bdc2],
  casing_gold: [null, 0xf2c443], casing_diamond: [null, 0x9ce6ef],
};
const ORE_FLECKS = { copper_ore: [0x4f9a7a, 1], iron_ore: [0xb7612e, 2], gold_ore: [0xf2c443, 4] };

const cache = new Map();
export function itemModel(id) {
  if (cache.has(id)) return cache.get(id);
  const it = ITEMS[id];
  let r = null;
  if (!it) r = null;
  else if (it.kind === 'tool' && it.laser) r = saber(it.beam);
  else if (it.kind === 'tool' && it.tool === 'pick') r = pickaxe(it.mat);
  else if (it.kind === 'tool' && it.tool === 'spade') r = spade(it.mat);
  else if (it.kind === 'tool' && it.tool === 'axe') r = axe(it.mat);
  else if (it.kind === 'tool' && it.tool === 'compass') { r = compass(); r.needle = needle(); }
  else if (it.kind === 'tool') r = gadget(it.tool);
  else if (it.kind === 'melee') r = knife(it.mat);
  else if (it.kind === 'gun' && it.gun === 'rocket') r = launcher(!!it.guided);
  else if (it.kind === 'gun' && it.laser) r = laserGun(it.gun, it.color);
  else if (it.kind === 'gun') r = ({ pistol, assault, smg, shotgun, rifle, lmg })[it.gun](it.mat);
  else if (it.kind === 'grenade') r = grenade();
  else if (it.door) r = door();
  else if (id === 'torch') r = torch();
  else if (id === 'stick') r = stick();
  else if (id === 'coal') r = { geo: merge([lump(0x1a1a1c, 0.35, 3)]), info: {} };
  else if (ORE_FLECKS[id]) r = ore(...ORE_FLECKS[id]);
  else if (id === 'copper') r = ingot(0xc87444, 0.9);
  else if (id === 'iron') r = ingot(0xc4c8cc, 0.9);
  else if (id === 'gold') r = ingot(0xf2c443, 0.95);
  else if (id === 'diamond') r = gem();
  else if (ROUNDS[id]) r = bullets(...ROUNDS[id]);
  else if (id === 'rockets') r = rocketShell();
  else if (id === 'gunpowder') r = powder(0x4a4a4e);
  else if (id === 'explosive_powder') r = powder(0xc02818);
  cache.set(id, r);
  return r;
}
