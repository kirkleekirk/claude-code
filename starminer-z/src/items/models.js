// 3D models of the items, built from bevelled parts in code. The hand holds each item at the
// origin; it points down -z with +y up. Units are metres.
//
// itemModel(id) returns { geo, info } where info has the muzzle, the sight line and so on.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ITEMS, TIERS } from './items.js';
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
const tube = (r, len, seg, color, metal = 0) => place(cyl(r, r, len, seg, color, metal), 0, 0, 0, Math.PI / 2, 0, 0);
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
const METAL = { iron: 0x3c3f45, gold: 0xd4a42c, diamond: 0x8fd6e2 };
const METALNESS = { iron: 0.75, gold: 0.9, diamond: 0.6 };

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
  const c = mat === 'iron' ? 0xc8ccd2 : TIERS[mat].color;
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

// ---- small things ----------------------------------------------------------------------------

function lump(color, metal, seed, size = 0.05, rough = 0.3) {
  const g = new THREE.IcosahedronGeometry(size, 1).toNonIndexed();
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
  const g = new THREE.OctahedronGeometry(0.045, 0).toNonIndexed();
  g.scale(1, 1.25, 1);
  g.computeVertexNormals();
  return { geo: merge([paint(g, 0xa8f0f8, 0.95, 0.15)]), info: {} };
}

function bullets() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.022;
    parts.push(place(cyl(0.008, 0.008, 0.05, 10, 0xc89a3a, 0.9), x, 0.025, 0));
    parts.push(place(cyl(0.002, 0.008, 0.02, 10, 0xb06030, 0.9), x, 0.06, 0));
  }
  return { geo: merge(parts), info: {} };
}

function stick() {
  return { geo: merge([place(cyl(0.012, 0.012, 0.3, 6, 0x7a5430), 0, 0.1, 0, 0, 0, D(10))]), info: {} };
}

// ---- the lookup -------------------------------------------------------------------------------

const cache = new Map();
export function itemModel(id) {
  if (cache.has(id)) return cache.get(id);
  const it = ITEMS[id];
  let r = null;
  if (!it) r = null;
  else if (it.kind === 'tool' && it.tool === 'pick') r = pickaxe(it.mat);
  else if (it.kind === 'tool' && it.tool === 'spade') r = spade(it.mat);
  else if (it.kind === 'tool' && it.tool === 'axe') r = axe(it.mat);
  else if (it.kind === 'tool' && it.tool === 'compass') { r = compass(); r.needle = needle(); }
  else if (it.kind === 'melee') r = knife(it.mat);
  else if (it.kind === 'gun') r = ({ pistol, assault, smg, shotgun, rifle })[it.gun](it.mat);
  else if (id === 'torch') r = torch();
  else if (id === 'stick') r = stick();
  else if (id === 'coal') r = { geo: merge([lump(0x1a1a1c, 0.35, 3)]), info: {} };
  else if (id === 'copper') r = ingot(0xc87444, 0.9);
  else if (id === 'iron') r = ingot(0xc4c8cc, 0.9);
  else if (id === 'gold') r = ingot(0xf2c443, 0.95);
  else if (id === 'diamond') r = gem();
  else if (id === 'bullets') r = bullets();
  cache.set(id, r);
  return r;
}
