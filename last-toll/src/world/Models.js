import * as THREE from 'three';
import { def } from '../data/items.js';
import { modDef } from '../data/mods.js';

// Procedural models for weapons (used both in-hand and dropped in the world)
// and loot items. Conventions:
//   guns / knives: grip at origin, pointing down -Z, sights on +Y.
//   blunt / chop melee: grip at origin, shaft up +Y, striking face toward -Z.

const M = {};
function mat(key, color, opts = {}) {
  if (!M[key]) M[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return M[key];
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);

function box(parent, x, y, z, sx, sy, sz, material, name) {
  const m = new THREE.Mesh(BOX, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (name) m.name = name;
  parent.add(m);
  return m;
}
// Cylinder along an axis ('x' | 'y' | 'z').
function cyl(parent, x, y, z, r, len, axis, material, segs6 = false) {
  const m = new THREE.Mesh(segs6 ? CYL6 : CYL, material);
  m.position.set(x, y, z);
  m.scale.set(r, len, r);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  parent.add(m);
  return m;
}

export const MAT = {
  get gun() { return mat('gun', 0x26282a); },
  get gunLight() { return mat('gunLight', 0x3a3d40); },
  get steel() { return mat('steel', 0x9a9ea3); },
  get blade() { return mat('blade', 0xc4c8cc, { emissive: 0x111111 }); },
  get wood() { return mat('wood', 0x6b4a2b); },
  get woodDark() { return mat('woodDark', 0x4a3220); },
  get rubber() { return mat('rubber', 0x171717); },
  get rust() { return mat('rust', 0x7a4a2a); },
  get tape() { return mat('tape', 0x85857d); },
  get leather() { return mat('leather', 0x5a3b24); },
  get brass() { return mat('brass', 0xb08d3a, { emissive: 0x1a1200 }); },
  get red() { return mat('red', 0x8a2a20); },
  get yellow() { return mat('yellow', 0xc9a227); },
  get skin() { return mat('skin', 0xb08a70); },
  get glove() { return mat('glove', 0x6b5842); },
  get sleeve() { return mat('sleeve', 0x4f5a43); },
  get cuff() { return mat('cuff', 0x39402f); },
  get white() { return mat('white', 0xd8d4c8); },
  get orange() { return mat('orange', 0xc2641f); },
  get green() { return mat('green', 0x3f6a3a); },
  get blue() { return mat('blue', 0x2f5f86); },
  get paper() { return mat('paper', 0xb9ab86); },
  get cloth() { return mat('cloth', 0x7b6f5c); },
  get black() { return mat('black', 0x121212); },
  get olive() { return mat('olive', 0x4d5233); },
  get string() { return mat('string', 0xcfc6a8); },
  get guard() { return mat('guard', 0x2b3035); },
  get guardDark() { return mat('guardDark', 0x181b1f); },
  get glow() { return mat('glow', 0xff3a24, { emissive: 0xff2a14, emissiveIntensity: 1.4 }); },
  get cellGlow() { return mat('cellGlow', 0xff6a3a, { emissive: 0xff4a1a, emissiveIntensity: 1.1 }); },
  get arc() { return mat('arc', 0x9ad8ff, { emissive: 0x5ab8ff, emissiveIntensity: 1.6 }); },
  get pipe() { return mat('pipe', 0x6f6a62); },
  get galv() { return mat('galv', 0x8d9296); },
  get walnut() { return mat('walnut', 0x5a3418); },
  get tan() { return mat('tan', 0x8a7a58); },
  get polymer() { return mat('polymer', 0x1d1f21); },
  get bottle() { return mat('bottle', 0x3a7a4a, { transparent: true, opacity: 0.75 }); },
  get fire() { return mat('fire', 0xff7a2a, { emissive: 0xff5a10, emissiveIntensity: 1.3 }); },
  get lensGlow() { return mat('lensGlow', 0x7ad0ff, { emissive: 0x3a90ff, emissiveIntensity: 1.2 }); },
  get dot() { return mat('dot', 0xff3a2a, { emissive: 0xff2a14, emissiveIntensity: 2 }); },
  get tritium() { return mat('tritium', 0x7aff8a, { emissive: 0x3aff5a, emissiveIntensity: 1.5 }); },
  get cord() { return mat('cord', 0x3a5a3a); },
};

// ---- Weapons -----------------------------------------------------------------

function muzzleAt(g, x, y, z) {
  const m = new THREE.Object3D();
  m.position.set(x, y, z);
  m.name = 'muzzle';
  g.add(m);
  return m;
}
// Where mods attach, in the gun's own space: [x, y, z].
function anchors(g, a) {
  g.userData.anchors = a;
}

const BUILDERS = {
  screwdriver(g) {
    cyl(g, 0, 0, 0.02, 0.018, 0.12, 'z', MAT.yellow);
    cyl(g, 0, 0, 0.02, 0.019, 0.02, 'z', MAT.black);
    cyl(g, 0, 0, -0.12, 0.004, 0.17, 'z', MAT.steel);
    box(g, 0, 0, -0.21, 0.012, 0.002, 0.012, MAT.steel);
    g.userData.tip = new THREE.Vector3(0, 0, -0.22);
  },
  kitchen_knife(g) {
    box(g, 0, 0, 0.03, 0.022, 0.028, 0.12, MAT.woodDark);
    box(g, 0, 0.004, -0.11, 0.004, 0.036, 0.18, MAT.blade);
    g.userData.tip = new THREE.Vector3(0, 0, -0.2);
  },
  shiv(g) {
    box(g, 0, 0, 0.03, 0.026, 0.03, 0.12, MAT.tape);
    const b = box(g, 0, 0, -0.1, 0.006, 0.03, 0.16, MAT.rust);
    b.rotation.z = 0.1;
    g.userData.tip = new THREE.Vector3(0, 0, -0.18);
  },
  combat_knife(g) {
    box(g, 0, 0, 0.035, 0.026, 0.032, 0.12, MAT.rubber);
    box(g, 0, 0, -0.03, 0.05, 0.012, 0.012, MAT.gun);
    box(g, 0, 0.004, -0.13, 0.006, 0.04, 0.19, MAT.blade);
    box(g, 0, 0.022, -0.1, 0.004, 0.006, 0.12, MAT.gun);
    g.userData.tip = new THREE.Vector3(0, 0, -0.23);
  },
  hammer(g) {
    cyl(g, 0, 0.14, 0, 0.016, 0.34, 'y', MAT.wood);
    box(g, 0, 0.32, -0.02, 0.036, 0.036, 0.1, MAT.gun);
    box(g, 0, 0.32, 0.07, 0.03, 0.02, 0.08, MAT.gun).rotation.x = 0.3;
    g.userData.tip = new THREE.Vector3(0, 0.32, -0.07);
  },
  pipe(g) {
    cyl(g, 0, 0.26, 0, 0.022, 0.62, 'y', MAT.gunLight);
    cyl(g, 0, 0.55, 0, 0.03, 0.06, 'y', MAT.rust);
    box(g, 0, 0.0, 0, 0.05, 0.1, 0.05, MAT.tape);
    g.userData.tip = new THREE.Vector3(0, 0.55, 0);
  },
  bat(g) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.016, 0.8, 10), MAT.wood);
    s.position.y = 0.33;
    g.add(s);
    cyl(g, 0, -0.07, 0, 0.022, 0.02, 'y', MAT.woodDark);
    for (let i = 0; i < 5; i++) {
      const n = box(g, (i % 2 ? 1 : -1) * 0.03, 0.5 + i * 0.05, 0, 0.05, 0.004, 0.004, MAT.steel);
      n.rotation.y = i * 1.2;
    }
    g.userData.tip = new THREE.Vector3(0, 0.68, 0);
  },
  crowbar(g) {
    cyl(g, 0, 0.26, 0, 0.012, 0.56, 'y', MAT.red, true);
    const hook = cyl(g, 0, 0.56, -0.04, 0.012, 0.1, 'z', MAT.red, true);
    hook.rotation.x = Math.PI / 2 + 0.6;
    box(g, 0, -0.03, 0.02, 0.018, 0.06, 0.012, MAT.red).rotation.x = 0.5;
    g.userData.tip = new THREE.Vector3(0, 0.58, -0.08);
  },
  machete(g) {
    box(g, 0, 0.04, 0, 0.026, 0.12, 0.03, MAT.rubber);
    const b = box(g, 0, 0.34, -0.012, 0.005, 0.48, 0.055, MAT.blade);
    b.rotation.x = 0.05;
    box(g, 0, 0.1, 0, 0.03, 0.01, 0.06, MAT.gun);
    g.userData.tip = new THREE.Vector3(0, 0.56, -0.03);
  },
  axe(g) {
    cyl(g, 0, 0.3, 0, 0.02, 0.8, 'y', MAT.wood);
    box(g, 0, 0.64, -0.06, 0.02, 0.12, 0.14, MAT.red);
    box(g, 0, 0.64, -0.14, 0.008, 0.16, 0.04, MAT.blade);
    const spike = box(g, 0, 0.64, 0.06, 0.02, 0.04, 0.1, MAT.red);
    spike.rotation.x = -0.2;
    g.userData.tip = new THREE.Vector3(0, 0.64, -0.16);
  },
  pistol(g) {
    const grip = box(g, 0, -0.05, 0.02, 0.028, 0.1, 0.045, MAT.rubber);
    grip.rotation.x = -0.25;
    box(g, 0, 0.02, -0.02, 0.026, 0.02, 0.1, MAT.gun); // frame
    const slide = box(g, 0, 0.042, -0.035, 0.028, 0.028, 0.19, MAT.gunLight, 'slide');
    box(slide, 0, 0.62, 0.4, 0.2, 0.25, 0.04, MAT.black);
    box(slide, 0, 0.62, -0.44, 0.12, 0.3, 0.03, MAT.black);
    const mag = box(g, 0, -0.07, 0.025, 0.022, 0.1, 0.035, MAT.gun, 'mag');
    mag.rotation.x = -0.25;
    box(g, 0, -0.01, -0.02, 0.008, 0.012, 0.03, MAT.gun); // trigger guard-ish
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.042, -0.135);
    muzzle.name = 'muzzle';
    g.add(muzzle);
    const sup = new THREE.Group();
    sup.name = 'sup';
    cyl(sup, 0, 0.042, -0.2, 0.017, 0.14, 'z', MAT.black);
    sup.visible = false;
    g.add(sup);
    g.userData.sightY = 0.062;
  },
  revolver(g) {
    const grip = box(g, 0, -0.045, 0.03, 0.03, 0.09, 0.04, MAT.wood);
    grip.rotation.x = -0.35;
    box(g, 0, 0.025, -0.005, 0.026, 0.03, 0.05, MAT.gun);
    const cylg = new THREE.Group();
    cylg.name = 'cylinder';
    cylg.position.set(0, 0.03, -0.035);
    cyl(cylg, 0, 0, 0, 0.022, 0.045, 'z', MAT.gunLight, true);
    g.add(cylg);
    cyl(g, 0, 0.042, -0.12, 0.009, 0.13, 'z', MAT.gun);
    box(g, 0, 0.03, -0.12, 0.012, 0.012, 0.12, MAT.gun);
    box(g, 0, 0.056, -0.175, 0.004, 0.01, 0.01, MAT.gun);
    box(g, 0, 0.05, 0.015, 0.01, 0.008, 0.01, MAT.gun);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.042, -0.19);
    muzzle.name = 'muzzle';
    g.add(muzzle);
    g.userData.sightY = 0.058;
  },
  shotgun(g) {
    box(g, 0, -0.02, 0.2, 0.04, 0.07, 0.26, MAT.wood).rotation.x = 0.12;
    box(g, 0, 0.012, 0.02, 0.036, 0.05, 0.16, MAT.gun);
    box(g, 0, -0.03, 0.05, 0.02, 0.06, 0.03, MAT.gun).rotation.x = -0.3;
    cyl(g, 0, 0.03, -0.32, 0.013, 0.62, 'z', MAT.gun);
    cyl(g, 0, 0.004, -0.26, 0.012, 0.46, 'z', MAT.gunLight);
    const pump = new THREE.Group();
    pump.name = 'pump';
    pump.position.set(0, 0.004, -0.2);
    box(pump, 0, 0, 0, 0.038, 0.036, 0.14, MAT.woodDark);
    g.add(pump);
    box(g, 0, 0.045, -0.62, 0.006, 0.01, 0.006, MAT.brass);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.03, -0.64);
    muzzle.name = 'muzzle';
    g.add(muzzle);
    g.userData.sightY = 0.05;
  },
  rifle(g) {
    box(g, 0, -0.02, 0.2, 0.038, 0.075, 0.3, MAT.wood).rotation.x = 0.1;
    box(g, 0, 0.0, -0.12, 0.036, 0.04, 0.38, MAT.wood);
    box(g, 0, 0.02, 0.02, 0.032, 0.03, 0.14, MAT.gun);
    cyl(g, 0, 0.03, -0.45, 0.011, 0.56, 'z', MAT.gun);
    const bolt = new THREE.Group();
    bolt.name = 'bolt';
    bolt.position.set(0.025, 0.03, 0.05);
    cyl(bolt, 0.02, 0, 0, 0.006, 0.04, 'x', MAT.steel);
    box(bolt, 0.04, 0, 0, 0.014, 0.014, 0.014, MAT.steel);
    g.add(bolt);
    const scope = new THREE.Group();
    scope.name = 'scope';
    cyl(scope, 0, 0.075, -0.02, 0.016, 0.26, 'z', MAT.black);
    cyl(scope, 0, 0.075, -0.15, 0.022, 0.05, 'z', MAT.black);
    cyl(scope, 0, 0.075, 0.1, 0.019, 0.04, 'z', MAT.black);
    box(scope, 0, 0.055, -0.02, 0.012, 0.02, 0.02, MAT.gun);
    box(scope, 0, 0.055, 0.05, 0.012, 0.02, 0.02, MAT.gun);
    g.add(scope);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.03, -0.74);
    muzzle.name = 'muzzle';
    g.add(muzzle);
    g.userData.sightY = 0.075;
  },
  crossbow(g) {
    box(g, 0, -0.02, 0.18, 0.036, 0.06, 0.22, MAT.olive).rotation.x = 0.1;
    box(g, 0, 0.01, -0.12, 0.03, 0.03, 0.46, MAT.olive);
    box(g, 0, -0.04, 0.03, 0.022, 0.06, 0.03, MAT.rubber).rotation.x = -0.3;
    const limbL = box(g, -0.16, 0.012, -0.33, 0.32, 0.02, 0.03, MAT.black);
    limbL.rotation.y = -0.2;
    const limbR = box(g, 0.16, 0.012, -0.33, 0.32, 0.02, 0.03, MAT.black);
    limbR.rotation.y = 0.2;
    const str = new THREE.Group();
    str.name = 'string';
    box(str, 0, 0, 0, 0.6, 0.004, 0.004, MAT.string);
    str.position.set(0, 0.03, -0.26);
    g.add(str);
    const bolt = new THREE.Group();
    bolt.name = 'boltAmmo';
    cyl(bolt, 0, 0.035, -0.35, 0.005, 0.38, 'z', MAT.steel);
    box(bolt, 0, 0.042, -0.18, 0.002, 0.016, 0.04, MAT.red);
    g.add(bolt);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.035, -0.55);
    muzzle.name = 'muzzle';
    g.add(muzzle);
    g.userData.sightY = 0.055;
  },
};

// Living Guard tech: slate bodies, red coils.
BUILDERS.photon_pistol = (g) => {
  const grip = box(g, 0, -0.05, 0.03, 0.03, 0.1, 0.045, MAT.guardDark);
  grip.rotation.x = -0.2;
  const slide = box(g, 0, 0.035, -0.04, 0.034, 0.04, 0.2, MAT.guard, 'slide');
  box(slide, 0, 0.55, 0.2, 0.3, 0.2, 0.25, MAT.guardDark);
  for (let i = 0; i < 3; i++) box(g, 0, 0.035, -0.06 - i * 0.035, 0.036, 0.012, 0.012, MAT.glow);
  const mag = box(g, 0, -0.06, 0.03, 0.024, 0.08, 0.036, MAT.cellGlow, 'mag');
  mag.rotation.x = -0.2;
  cyl(g, 0, 0.035, -0.15, 0.012, 0.03, 'z', MAT.glow);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.035, -0.17);
  muzzle.name = 'muzzle';
  g.add(muzzle);
  g.userData.sightY = 0.062;
};
BUILDERS.arc_carbine = (g) => {
  box(g, 0, -0.01, 0.2, 0.04, 0.07, 0.24, MAT.guardDark).rotation.x = 0.08;
  box(g, 0, 0.02, -0.08, 0.05, 0.06, 0.42, MAT.guard);
  box(g, 0, -0.035, 0.05, 0.024, 0.07, 0.03, MAT.guardDark).rotation.x = -0.3;
  const mag = box(g, 0, -0.03, -0.06, 0.03, 0.07, 0.05, MAT.cellGlow, 'mag');
  mag.userData.cell = true;
  for (let i = 0; i < 5; i++) box(g, 0, 0.02, -0.18 - i * 0.045, 0.056, 0.018, 0.014, MAT.glow);
  cyl(g, 0, 0.022, -0.44, 0.016, 0.2, 'z', MAT.guardDark);
  box(g, 0, 0.06, -0.05, 0.02, 0.018, 0.16, MAT.guardDark);
  box(g, 0, 0.074, -0.1, 0.012, 0.012, 0.012, MAT.glow);
  const slide = box(g, 0.03, 0.035, 0.02, 0.012, 0.018, 0.05, MAT.steel, 'slide');
  slide.userData.charge = true;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.022, -0.55);
  muzzle.name = 'muzzle';
  g.add(muzzle);
  g.userData.sightY = 0.08;
};
BUILDERS.shock_baton = (g) => {
  cyl(g, 0, 0.05, 0, 0.018, 0.16, 'y', MAT.rubber);
  cyl(g, 0, 0.3, 0, 0.014, 0.36, 'y', MAT.guardDark);
  cyl(g, 0, 0.5, 0, 0.018, 0.05, 'y', MAT.arc);
  box(g, 0, 0.13, 0.02, 0.024, 0.03, 0.01, MAT.glow);
  g.userData.tip = new THREE.Vector3(0, 0.52, 0);
};


// ---- Tiered roster --------------------------------------------------------------------
// Existing guns' mod anchors.
const BASE_ANCHORS = {
  pistol: { sights: [0, 0.058, -0.02], muzzle: [0, 0.042, -0.135], mag: [0, -0.07, 0.025], grip: [0, -0.05, 0.02] },
  revolver: { sights: [0, 0.052, -0.08], muzzle: [0, 0.042, -0.19], barrel: [0, 0.042, -0.12], grip: [0, -0.045, 0.03], special: [0, 0.03, -0.035] },
  shotgun: { sights: [0, 0.045, -0.12], muzzle: [0, 0.03, -0.64], barrel: [0, 0.03, -0.46], stock: [0, -0.02, 0.3] },
  rifle: { muzzle: [0, 0.03, -0.74], barrel: [0, 0.03, -0.5], stock: [0, -0.02, 0.32], mag: [0, -0.025, -0.02] },
  crossbow: { sights: [0, 0.04, -0.05], limbs: [0, 0.012, -0.33], stock: [0, -0.02, 0.27], special: [0, 0.035, -0.54] },
  photon_pistol: { sights: [0, 0.06, -0.02], emitter: [0, 0.035, -0.16], cell: [0, -0.06, 0.03], special: [0.02, 0.035, -0.07] },
  arc_carbine: { sights: [0, 0.075, -0.05], emitter: [0, 0.022, -0.5], cell: [0, -0.03, -0.06], special: [0.03, 0.02, -0.2] },
};

// Tier 0: scrap-built
BUILDERS.zip_pistol = (g) => {
  const grip = box(g, 0, -0.045, 0.02, 0.03, 0.1, 0.045, MAT.woodDark);
  grip.rotation.x = -0.3;
  box(g, 0, 0.012, -0.01, 0.034, 0.03, 0.07, MAT.woodDark);
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 0.035, 0.0);
  cyl(barrels, 0, 0, -0.09, 0.013, 0.18, 'z', MAT.pipe);
  cyl(barrels, 0, 0, 0.012, 0.018, 0.03, 'z', MAT.galv);
  for (const z of [-0.04, -0.12]) cyl(barrels, 0, 0, z, 0.015, 0.012, 'z', MAT.tape);
  g.add(barrels);
  box(g, 0, 0.02, 0.035, 0.006, 0.03, 0.012, MAT.steel).rotation.x = -0.4;
  box(g, 0, -0.012, -0.012, 0.006, 0.02, 0.006, MAT.steel);
  muzzleAt(barrels, 0, 0, -0.18);
  g.userData.sightY = 0.052;
  anchors(g, { sights: [0, 0.05, -0.08], barrel: [0, 0.035, -0.18], grip: [0, -0.045, 0.02], special: [0.018, 0.035, -0.02], muzzle: [0, 0.035, -0.18] });
};
BUILDERS.pipe_shotgun = (g) => {
  box(g, 0, -0.03, 0.22, 0.034, 0.07, 0.28, MAT.woodDark).rotation.x = 0.12;
  box(g, 0, -0.04, 0.04, 0.024, 0.07, 0.03, MAT.tape).rotation.x = -0.3;
  box(g, 0, 0.0, 0.05, 0.03, 0.03, 0.12, MAT.woodDark);
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 0.03, 0.0);
  cyl(barrels, 0, 0, -0.28, 0.019, 0.56, 'z', MAT.pipe);
  cyl(barrels, 0, 0, 0.0, 0.026, 0.05, 'z', MAT.galv);
  cyl(barrels, 0, 0, -0.1, 0.022, 0.03, 'z', MAT.galv);
  for (const z of [-0.2, -0.36, -0.48]) cyl(barrels, 0, -0.016, z, 0.01, 0.04, 'z', MAT.tape);
  box(barrels, 0, -0.03, -0.25, 0.02, 0.018, 0.2, MAT.woodDark);
  g.add(barrels);
  muzzleAt(barrels, 0, 0, -0.56);
  g.userData.sightY = 0.05;
  anchors(g, { sights: [0, 0.052, -0.4], barrel: [0, 0.03, -0.56], stock: [0, -0.03, 0.3], special: [0.024, 0.03, 0.0], muzzle: [0, 0.03, -0.56] });
};
function bowBuilder(g, { riser, limb, compound }) {
  // held vertically: riser at the grip, limbs up and down, string toward the shooter (+Z)
  box(g, 0, 0, 0, 0.03, 0.2, 0.04, riser);
  box(g, 0, 0.0, -0.01, 0.034, 0.08, 0.05, MAT.cloth);
  const tips = [];
  for (const sgn of [1, -1]) {
    const l = new THREE.Group();
    l.position.set(0, sgn * 0.1, 0);
    const seg1 = box(l, 0, sgn * 0.13, 0.02, 0.022, 0.26, 0.016, limb);
    seg1.rotation.x = sgn * 0.18;
    const seg2 = box(l, 0, sgn * 0.33, 0.07, 0.018, 0.18, 0.012, limb);
    seg2.rotation.x = sgn * -0.25;
    if (compound) cyl(l, 0, sgn * 0.42, 0.08, 0.028, 0.012, 'x', MAT.gunLight);
    g.add(l);
    tips.push(new THREE.Vector3(0, sgn * 0.52, compound ? 0.08 : 0.1));
  }
  const nock = new THREE.Vector3(0, 0, 0.1);
  const strA = box(g, 0, 0, 0, 0.004, 1, 0.004, MAT.string);
  const strB = box(g, 0, 0, 0, 0.004, 1, 0.004, MAT.string);
  const arrow = new THREE.Group();
  arrow.name = 'arrowNock';
  cyl(arrow, 0, 0, -0.33, 0.004, 0.72, 'z', MAT.woodDark);
  box(arrow, 0, 0, -0.7, 0.012, 0.012, 0.04, MAT.steel);
  for (const r of [0, 2.1, 4.2]) {
    const f = box(arrow, Math.cos(r) * 0.008, Math.sin(r) * 0.008, 0.0, 0.002, 0.018, 0.05, MAT.red);
    f.rotation.z = r;
  }
  g.add(arrow);
  const set = (k) => {
    nock.z = 0.1 + k * 0.42;
    for (const [s, t] of [[strA, tips[0]], [strB, tips[1]]]) {
      const dy = t.y - nock.y, dz = t.z - nock.z;
      s.position.set(0, (t.y + nock.y) / 2, (t.z + nock.z) / 2);
      s.scale.y = Math.hypot(dy, dz);
      s.rotation.x = Math.atan2(-dz, dy);
    }
    arrow.position.set(0, 0, nock.z);
  };
  set(0);
  g.userData.setDraw = set;
  muzzleAt(arrow, 0, 0, -0.72);
  g.userData.sightY = 0.0;
  g.userData.bow = true;
  anchors(g, { sights: [-0.025, 0.06, -0.01], string: [0, 0.3, 0.09], rest: [-0.02, 0.012, -0.02], special: [0, 0, -0.6] });
}
BUILDERS.scrap_bow = (g) => bowBuilder(g, { riser: MAT.woodDark, limb: MAT.galv, compound: false });
BUILDERS.hunting_bow = (g) => bowBuilder(g, { riser: MAT.olive, limb: MAT.black, compound: true });

// Tier 1
BUILDERS.sawed_off = (g) => {
  const grip = box(g, 0, -0.05, 0.05, 0.034, 0.1, 0.05, MAT.walnut);
  grip.rotation.x = -0.45;
  box(g, 0, 0.005, 0.02, 0.05, 0.04, 0.09, MAT.gunLight);
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 0.022, -0.02);
  for (const x of [-0.014, 0.014]) cyl(barrels, x, 0.004, -0.17, 0.014, 0.33, 'z', MAT.gun);
  box(barrels, 0, -0.016, -0.12, 0.04, 0.02, 0.18, MAT.walnut);
  g.add(barrels);
  box(g, 0, 0.028, 0.05, 0.01, 0.02, 0.04, MAT.steel);
  muzzleAt(barrels, 0, 0.004, -0.34);
  g.userData.sightY = 0.05;
  anchors(g, { sights: [0, 0.048, -0.3], barrel: [0, 0.026, -0.36], stock: [0, -0.06, 0.1], special: [0.03, 0.02, 0.02], muzzle: [0, 0.026, -0.36] });
};
BUILDERS.old_rifle = (g) => {
  box(g, 0, -0.02, 0.2, 0.038, 0.075, 0.3, MAT.walnut).rotation.x = 0.1;
  box(g, 0, 0.0, -0.14, 0.034, 0.04, 0.42, MAT.walnut);
  box(g, 0, 0.02, 0.02, 0.03, 0.03, 0.14, MAT.rust);
  cyl(g, 0, 0.03, -0.46, 0.011, 0.58, 'z', MAT.rust);
  box(g, 0, 0.046, -0.72, 0.004, 0.014, 0.008, MAT.gun);
  box(g, 0, 0.048, -0.08, 0.016, 0.01, 0.01, MAT.gun);
  const bolt = new THREE.Group();
  bolt.name = 'bolt';
  bolt.position.set(0.025, 0.03, 0.05);
  cyl(bolt, 0.02, 0, 0, 0.006, 0.04, 'x', MAT.rust);
  box(bolt, 0.04, 0, 0, 0.014, 0.014, 0.014, MAT.rust);
  g.add(bolt);
  muzzleAt(g, 0, 0.03, -0.75);
  g.userData.sightY = 0.052;
  anchors(g, { sights: [0, 0.05, -0.06], barrel: [0, 0.03, -0.75], stock: [0, -0.02, 0.34], special: [0.02, 0.02, -0.02], muzzle: [0, 0.03, -0.75] });
};

// Tier 2
BUILDERS.m1911 = (g) => {
  const grip = box(g, 0, -0.05, 0.022, 0.026, 0.1, 0.045, MAT.walnut);
  grip.rotation.x = -0.22;
  box(g, 0, 0.02, -0.02, 0.024, 0.02, 0.1, MAT.gun);
  const slide = box(g, 0, 0.042, -0.04, 0.026, 0.028, 0.2, MAT.steel, 'slide');
  box(slide, 0, 0.62, 0.4, 0.2, 0.25, 0.04, MAT.black);
  box(slide, 0, 0.62, -0.44, 0.12, 0.3, 0.03, MAT.black);
  const mag = box(g, 0, -0.07, 0.027, 0.02, 0.1, 0.034, MAT.gun, 'mag');
  mag.rotation.x = -0.22;
  box(g, 0, 0.0, 0.05, 0.02, 0.015, 0.02, MAT.gun);
  muzzleAt(g, 0, 0.042, -0.14);
  g.userData.sightY = 0.062;
  anchors(g, { sights: [0, 0.058, -0.02], muzzle: [0, 0.042, -0.14], mag: [0, -0.07, 0.027], grip: [0, -0.05, 0.022] });
};
BUILDERS.lever_rifle = (g) => {
  box(g, 0, -0.025, 0.2, 0.036, 0.072, 0.28, MAT.walnut).rotation.x = 0.12;
  box(g, 0, 0.015, 0.02, 0.034, 0.05, 0.14, MAT.brass);
  box(g, 0, -0.002, -0.2, 0.036, 0.032, 0.24, MAT.walnut);
  cyl(g, 0, 0.034, -0.38, 0.01, 0.56, 'z', MAT.gun);
  cyl(g, 0, 0.012, -0.34, 0.008, 0.46, 'z', MAT.gunLight);
  box(g, 0, 0.048, -0.64, 0.004, 0.012, 0.008, MAT.brass);
  const lever = new THREE.Group();
  lever.name = 'lever';
  lever.position.set(0, -0.012, 0.05);
  box(lever, 0, -0.03, 0.02, 0.01, 0.012, 0.09, MAT.gun);
  box(lever, 0, -0.045, 0.06, 0.01, 0.03, 0.012, MAT.gun);
  g.add(lever);
  muzzleAt(g, 0, 0.034, -0.66);
  g.userData.sightY = 0.056;
  anchors(g, { sights: [0, 0.05, -0.02], muzzle: [0, 0.034, -0.66], barrel: [0, 0.034, -0.5], stock: [0, -0.025, 0.32] });
};
BUILDERS.smg = (g) => {
  const grip = box(g, 0, -0.05, 0.05, 0.028, 0.09, 0.04, MAT.polymer);
  grip.rotation.x = -0.25;
  box(g, 0, 0.02, -0.02, 0.042, 0.055, 0.24, MAT.polymer);
  cyl(g, 0, 0.028, -0.18, 0.011, 0.1, 'z', MAT.gun);
  const mag = box(g, 0, -0.07, -0.07, 0.022, 0.13, 0.03, MAT.gun, 'mag');
  mag.rotation.x = 0.1;
  box(g, 0, 0.058, -0.02, 0.014, 0.012, 0.16, MAT.gun);
  box(g, 0, 0.02, 0.18, 0.012, 0.03, 0.2, MAT.gun);
  box(g, 0, -0.01, 0.28, 0.02, 0.07, 0.02, MAT.rubber);
  box(g, 0.025, 0.04, 0.03, 0.01, 0.012, 0.03, MAT.steel, 'slide');
  muzzleAt(g, 0, 0.028, -0.23);
  g.userData.sightY = 0.07;
  anchors(g, { sights: [0, 0.068, -0.02], muzzle: [0, 0.028, -0.23], mag: [0, -0.07, -0.07], stock: [0, 0.0, 0.26] });
};

// Tier 3
BUILDERS.m17 = (g) => {
  const grip = box(g, 0, -0.05, 0.02, 0.03, 0.1, 0.046, MAT.tan);
  grip.rotation.x = -0.25;
  box(g, 0, 0.02, -0.02, 0.028, 0.022, 0.11, MAT.tan);
  const slide = box(g, 0, 0.044, -0.035, 0.029, 0.03, 0.2, MAT.polymer, 'slide');
  box(slide, 0, 0.62, 0.4, 0.2, 0.25, 0.04, MAT.tritium);
  box(slide, 0, 0.62, -0.44, 0.12, 0.3, 0.03, MAT.tritium);
  const mag = box(g, 0, -0.075, 0.025, 0.024, 0.11, 0.036, MAT.polymer, 'mag');
  mag.rotation.x = -0.25;
  muzzleAt(g, 0, 0.044, -0.14);
  g.userData.sightY = 0.064;
  anchors(g, { sights: [0, 0.06, -0.02], muzzle: [0, 0.044, -0.14], mag: [0, -0.075, 0.025], grip: [0, -0.05, 0.02] });
};
function arBuilder(g, { furniture, handguard, stockLen }) {
  const grip = box(g, 0, -0.05, 0.06, 0.028, 0.09, 0.036, furniture);
  grip.rotation.x = -0.35;
  box(g, 0, 0.018, 0.02, 0.036, 0.05, 0.2, MAT.gun);
  box(g, 0, 0.052, 0.0, 0.022, 0.012, 0.22, MAT.gunLight);
  box(g, 0, 0.022, -0.2, 0.044, 0.048, 0.24, handguard);
  cyl(g, 0, 0.026, -0.42, 0.009, 0.2, 'z', MAT.gun);
  box(g, 0, 0.044, -0.5, 0.006, 0.03, 0.01, MAT.gun);
  const mag = box(g, 0, -0.07, -0.04, 0.026, 0.13, 0.05, MAT.gun, 'mag');
  mag.rotation.x = 0.2;
  cyl(g, 0, 0.022, 0.18, 0.014, 0.12, 'z', MAT.gun);
  box(g, 0, -0.005, 0.2 + stockLen / 2, 0.036, 0.075, stockLen, furniture);
  box(g, 0.022, 0.035, 0.07, 0.012, 0.012, 0.03, MAT.steel, 'slide');
  muzzleAt(g, 0, 0.026, -0.52);
  g.userData.sightY = 0.066;
  anchors(g, { sights: [0, 0.062, -0.02], muzzle: [0, 0.026, -0.52], mag: [0, -0.07, -0.04], stock: [0, -0.005, 0.2 + stockLen], receiver: [0.022, 0.018, 0.02] });
}
BUILDERS.ar15 = (g) => arBuilder(g, { furniture: MAT.polymer, handguard: MAT.polymer, stockLen: 0.2 });
BUILDERS.m4 = (g) => arBuilder(g, { furniture: MAT.olive, handguard: MAT.olive, stockLen: 0.16 });
BUILDERS.combat_shotgun = (g) => {
  const grip = box(g, 0, -0.05, 0.08, 0.03, 0.09, 0.036, MAT.polymer);
  grip.rotation.x = -0.3;
  box(g, 0, 0.02, -0.02, 0.046, 0.06, 0.28, MAT.polymer);
  cyl(g, 0, 0.04, -0.34, 0.015, 0.4, 'z', MAT.gun);
  box(g, 0, 0.012, -0.28, 0.044, 0.04, 0.18, MAT.polymer);
  const mag = box(g, 0, -0.06, -0.06, 0.034, 0.1, 0.07, MAT.gun, 'mag');
  mag.rotation.x = 0.05;
  box(g, 0, 0.0, 0.25, 0.034, 0.07, 0.22, MAT.polymer);
  box(g, 0, 0.06, -0.02, 0.014, 0.01, 0.2, MAT.gun);
  box(g, 0.026, 0.035, 0.02, 0.012, 0.014, 0.03, MAT.steel, 'slide');
  muzzleAt(g, 0, 0.04, -0.54);
  g.userData.sightY = 0.068;
  anchors(g, { sights: [0, 0.066, -0.02], muzzle: [0, 0.04, -0.54], mag: [0, -0.06, -0.06], stock: [0, 0.0, 0.37] });
};
BUILDERS.dmr = (g) => {
  const grip = box(g, 0, -0.05, 0.08, 0.028, 0.09, 0.036, MAT.polymer);
  grip.rotation.x = -0.3;
  box(g, 0, 0.018, 0.02, 0.038, 0.055, 0.24, MAT.olive);
  box(g, 0, 0.022, -0.24, 0.046, 0.05, 0.3, MAT.olive);
  cyl(g, 0, 0.026, -0.56, 0.011, 0.34, 'z', MAT.gun);
  const mag = box(g, 0, -0.06, -0.03, 0.03, 0.09, 0.07, MAT.gun, 'mag');
  mag.rotation.x = 0.12;
  box(g, 0, 0.0, 0.26, 0.038, 0.08, 0.24, MAT.olive);
  const scope = new THREE.Group();
  cyl(scope, 0, 0.09, -0.04, 0.018, 0.3, 'z', MAT.black);
  cyl(scope, 0, 0.09, -0.19, 0.025, 0.05, 'z', MAT.black);
  cyl(scope, 0, 0.09, 0.13, 0.021, 0.04, 'z', MAT.black);
  box(scope, 0, 0.065, -0.06, 0.014, 0.03, 0.02, MAT.gun);
  box(scope, 0, 0.065, 0.04, 0.014, 0.03, 0.02, MAT.gun);
  g.add(scope);
  muzzleAt(g, 0, 0.026, -0.73);
  g.userData.sightY = 0.09;
  anchors(g, { muzzle: [0, 0.026, -0.73], barrel: [0, 0.026, -0.56], mag: [0, -0.06, -0.03], stock: [0, 0.0, 0.38] });
};

// Experimental
BUILDERS.scatter_emitter = (g) => {
  box(g, 0, -0.01, 0.2, 0.04, 0.07, 0.24, MAT.guardDark).rotation.x = 0.08;
  box(g, 0, 0.02, -0.08, 0.06, 0.07, 0.36, MAT.guard);
  box(g, 0, -0.035, 0.05, 0.024, 0.07, 0.03, MAT.guardDark).rotation.x = -0.3;
  const mag = box(g, 0, -0.035, -0.08, 0.034, 0.07, 0.06, MAT.cellGlow, 'mag');
  mag.userData.cell = true;
  box(g, 0, 0.02, -0.3, 0.12, 0.05, 0.08, MAT.guardDark);
  for (let i = 0; i < 5; i++) box(g, -0.048 + i * 0.024, 0.02, -0.345, 0.014, 0.03, 0.01, MAT.glow);
  box(g, 0, 0.064, -0.05, 0.02, 0.018, 0.16, MAT.guardDark);
  muzzleAt(g, 0, 0.02, -0.35);
  g.userData.sightY = 0.08;
  anchors(g, { sights: [0, 0.075, -0.05], emitter: [0, 0.02, -0.34], cell: [0, -0.035, -0.08] });
};
BUILDERS.beam_lance = (g) => {
  box(g, 0, -0.01, 0.22, 0.04, 0.07, 0.26, MAT.guardDark).rotation.x = 0.08;
  box(g, 0, 0.02, -0.12, 0.05, 0.06, 0.5, MAT.guard);
  box(g, 0, -0.035, 0.05, 0.024, 0.07, 0.03, MAT.guardDark).rotation.x = -0.3;
  const mag = box(g, 0, -0.035, -0.1, 0.03, 0.07, 0.05, MAT.cellGlow, 'mag');
  mag.userData.cell = true;
  cyl(g, 0, 0.022, -0.56, 0.02, 0.4, 'z', MAT.guardDark);
  for (let i = 0; i < 6; i++) cyl(g, 0, 0.022, -0.42 - i * 0.05, 0.024, 0.012, 'z', MAT.glow);
  const coil = new THREE.Group();
  coil.name = 'coil';
  cyl(coil, 0, 0.022, -0.77, 0.014, 0.03, 'z', MAT.glow);
  g.add(coil);
  const scope = new THREE.Group();
  cyl(scope, 0, 0.09, -0.06, 0.017, 0.26, 'z', MAT.guardDark);
  cyl(scope, 0, 0.09, -0.19, 0.022, 0.04, 'z', MAT.guardDark);
  box(scope, 0, 0.065, -0.06, 0.014, 0.03, 0.02, MAT.guard);
  box(scope, 0, 0.09, -0.21, 0.02, 0.02, 0.004, MAT.glow);
  g.add(scope);
  muzzleAt(g, 0, 0.022, -0.78);
  g.userData.sightY = 0.09;
  anchors(g, { emitter: [0, 0.022, -0.76], cell: [0, -0.035, -0.1] });
};
BUILDERS.herder_horn = (g) => {
  const grip = box(g, 0, -0.05, 0.03, 0.032, 0.1, 0.045, MAT.guardDark);
  grip.rotation.x = -0.2;
  box(g, 0, 0.03, -0.04, 0.05, 0.05, 0.14, MAT.guard);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.022, 0.14, 12, 1, true), MAT.guardDark);
  bell.material = bell.material.clone();
  bell.material.side = THREE.DoubleSide;
  bell.rotation.x = -Math.PI / 2;
  bell.position.set(0, 0.03, -0.18);
  g.add(bell);
  const mag = box(g, 0, -0.06, 0.03, 0.026, 0.08, 0.036, MAT.cellGlow, 'mag');
  mag.rotation.x = -0.2;
  for (let i = 0; i < 3; i++) box(g, 0, 0.058, -0.02 - i * 0.03, 0.03, 0.006, 0.012, MAT.glow);
  muzzleAt(g, 0, 0.03, -0.25);
  g.userData.sightY = 0.06;
  anchors(g, { emitter: [0, 0.03, -0.22], cell: [0, -0.06, 0.03] });
};
BUILDERS.tomahawk = (g) => {
  cyl(g, 0, 0.2, 0, 0.016, 0.52, 'y', MAT.polymer);
  box(g, 0, 0.44, -0.05, 0.012, 0.07, 0.11, MAT.gun);
  box(g, 0, 0.44, -0.11, 0.006, 0.1, 0.03, MAT.blade);
  const spike = box(g, 0, 0.44, 0.05, 0.012, 0.03, 0.08, MAT.gun);
  spike.rotation.x = -0.25;
  box(g, 0, 0.02, 0, 0.024, 0.12, 0.028, MAT.rubber);
  g.userData.tip = new THREE.Vector3(0, 0.44, -0.12);
};
BUILDERS.thermal_knife = (g) => {
  box(g, 0, 0, 0.035, 0.026, 0.032, 0.12, MAT.guardDark);
  box(g, 0, 0, -0.03, 0.05, 0.012, 0.012, MAT.guard);
  box(g, 0, 0.004, -0.13, 0.006, 0.036, 0.19, MAT.fire);
  box(g, 0, 0.0, 0.02, 0.028, 0.008, 0.03, MAT.glow);
  g.userData.tip = new THREE.Vector3(0, 0, -0.23);
};

// ---- Mod visuals ----------------------------------------------------------------------
// Each look builds a small piece of hardware around (0,0,0); it's placed at the
// gun's anchor for that slot. Muzzle devices push the muzzle point forward.
const LOOKS = {
  notch: (m) => box(m, 0, 0.004, 0.0, 0.02, 0.012, 0.006, MAT.rust),
  scrap_reflex: (m) => { box(m, 0, 0.012, 0, 0.03, 0.004, 0.03, MAT.rust); box(m, 0, 0.03, -0.01, 0.03, 0.034, 0.003, MAT.lensGlow); box(m, 0, 0.03, -0.012, 0.004, 0.004, 0.002, MAT.dot); },
  long_pipe: (m) => { cyl(m, 0, 0, -0.08, 0.013, 0.16, 'z', MAT.pipe); cyl(m, 0, 0, 0.0, 0.016, 0.02, 'z', MAT.tape); return 0.16; },
  bottle: (m) => { cyl(m, 0, 0, -0.1, 0.03, 0.18, 'z', MAT.bottle); cyl(m, 0, 0, 0.0, 0.016, 0.03, 'z', MAT.tape); return 0.2; },
  long_barrel: (m) => { cyl(m, 0, 0, -0.06, 0.011, 0.12, 'z', MAT.gun); return 0.12; },
  tape_grip: (m) => box(m, 0, 0, 0, 0.034, 0.08, 0.05, MAT.tape),
  wood_grip: (m) => box(m, 0, 0, 0, 0.034, 0.085, 0.048, MAT.walnut),
  incendiary: (m) => { cyl(m, 0, 0, 0, 0.025, 0.05, 'z', MAT.fire, true); },
  rebar: (m) => { cyl(m, 0, 0, 0, 0.012, 0.06, 'z', MAT.rust); box(m, 0.012, 0, 0, 0.008, 0.02, 0.05, MAT.red); },
  bead: (m) => box(m, 0, 0.004, 0, 0.006, 0.008, 0.006, MAT.brass),
  choke: (m) => { cyl(m, 0, 0, -0.02, 0.026, 0.04, 'z', MAT.galv); return 0.04; },
  pipe_stock: (m) => { cyl(m, 0, 0, 0.08, 0.012, 0.18, 'z', MAT.pipe); box(m, 0, -0.02, 0.17, 0.02, 0.08, 0.02, MAT.pipe); },
  rag_stock: (m) => box(m, 0, 0, 0.02, 0.05, 0.08, 0.08, MAT.cloth),
  twin: (m) => { box(m, 0, -0.02, 0, 0.02, 0.02, 0.03, MAT.red); box(m, 0.012, -0.03, 0.01, 0.006, 0.03, 0.006, MAT.steel); },
  peep: (m) => { box(m, 0, 0.012, 0, 0.02, 0.024, 0.004, MAT.gun); box(m, 0, 0.018, 0.0, 0.006, 0.006, 0.006, MAT.black); },
  pipe_scope: (m) => { cyl(m, 0, 0.035, 0, 0.018, 0.22, 'z', MAT.pipe); for (const z of [-0.06, 0.06]) box(m, 0, 0.015, z, 0.02, 0.03, 0.012, MAT.tape); },
  oil_filter: (m) => { cyl(m, 0, 0, -0.05, 0.03, 0.1, 'z', MAT.orange); return 0.1; },
  ap: (m) => { box(m, 0, 0, 0, 0.01, 0.03, 0.06, MAT.brass); box(m, 0.006, 0, 0, 0.002, 0.012, 0.03, MAT.fire); },
  pin: (m) => { box(m, -0.01, 0, 0, 0.004, 0.06, 0.03, MAT.gun); for (let i = 0; i < 3; i++) box(m, 0, -0.015 + i * 0.015, 0, 0.02, 0.003, 0.003, MAT.tritium); },
  string: (m) => box(m, 0, 0, 0, 0.012, 0.03, 0.012, MAT.yellow),
  cable: (m) => box(m, 0, 0, 0, 0.012, 0.03, 0.012, MAT.steel),
  rest: (m) => box(m, 0, 0, 0, 0.012, 0.02, 0.03, MAT.black),
  fire_arrow: (m) => { cyl(m, 0, 0, 0, 0.012, 0.04, 'z', MAT.fire); },
  broadhead: (m) => { box(m, 0, 0, 0, 0.03, 0.03, 0.04, MAT.blade); },
  limbs: (m) => { box(m, -0.16, 0.012, 0.02, 0.32, 0.03, 0.035, MAT.galv).rotation.y = -0.2; box(m, 0.16, 0.012, 0.02, 0.32, 0.03, 0.035, MAT.galv).rotation.y = 0.2; },
  bomb_tip: (m) => { cyl(m, 0, 0, 0, 0.016, 0.05, 'z', MAT.red); box(m, 0, 0.012, 0.01, 0.004, 0.012, 0.004, MAT.steel); },
  night_sights: (m) => { box(m, -0.007, 0.004, 0.04, 0.004, 0.004, 0.004, MAT.tritium); box(m, 0.007, 0.004, 0.04, 0.004, 0.004, 0.004, MAT.tritium); box(m, 0, 0.004, -0.08, 0.004, 0.004, 0.004, MAT.tritium); },
  mini_dot: (m) => { box(m, 0, 0.008, 0, 0.024, 0.012, 0.03, MAT.black); box(m, 0, 0.022, -0.01, 0.022, 0.018, 0.003, MAT.lensGlow); box(m, 0, 0.022, -0.012, 0.003, 0.003, 0.002, MAT.dot); },
  suppressor: (m) => { cyl(m, 0, 0, -0.07, 0.017, 0.14, 'z', MAT.black); return 0.14; },
  suppressor_long: (m) => { cyl(m, 0, 0, -0.1, 0.02, 0.2, 'z', MAT.black); return 0.2; },
  comp: (m) => { box(m, 0, 0, -0.02, 0.028, 0.028, 0.04, MAT.gunLight); box(m, 0, 0.014, -0.02, 0.012, 0.003, 0.02, MAT.black); return 0.04; },
  ext_mag: (m) => box(m, 0, -0.06, 0, 0.022, 0.06, 0.032, MAT.gun),
  rubber_grip: (m) => box(m, 0, 0, 0, 0.032, 0.08, 0.05, MAT.rubber),
  holo: (m) => { box(m, 0, 0.01, 0, 0.03, 0.02, 0.05, MAT.black); box(m, 0, 0.03, -0.02, 0.03, 0.026, 0.004, MAT.lensGlow); box(m, 0, 0.03, -0.022, 0.006, 0.006, 0.002, MAT.dot); },
  breacher: (m) => { cyl(m, 0, 0, -0.025, 0.02, 0.05, 'z', MAT.gunLight, true); return 0.05; },
  recoil_pad: (m) => box(m, 0, 0, 0.0, 0.04, 0.08, 0.03, MAT.rubber),
  drum: (m) => { cyl(m, 0, -0.07, 0, 0.05, 0.05, 'x', MAT.gun); },
  frag_mag: (m) => { box(m, 0, -0.06, 0, 0.036, 0.1, 0.07, MAT.olive); box(m, 0.019, -0.06, 0, 0.002, 0.06, 0.05, MAT.yellow); },
  scout_scope: (m) => { cyl(m, 0, 0.03, -0.05, 0.014, 0.16, 'z', MAT.black); box(m, 0, 0.012, -0.05, 0.012, 0.02, 0.02, MAT.gun); },
  brake: (m) => { box(m, 0, 0, -0.03, 0.024, 0.024, 0.06, MAT.gunLight); return 0.06; },
  adj_stock: (m) => { box(m, 0, 0, 0.02, 0.036, 0.075, 0.08, MAT.polymer); box(m, 0, 0.042, 0.0, 0.02, 0.012, 0.06, MAT.polymer); },
  red_dot: (m) => { cyl(m, 0, 0.022, 0, 0.016, 0.05, 'z', MAT.black); box(m, 0, 0.004, 0, 0.018, 0.01, 0.03, MAT.gun); box(m, 0, 0.022, -0.026, 0.004, 0.004, 0.002, MAT.dot); },
  acog: (m) => { cyl(m, 0, 0.028, 0, 0.018, 0.13, 'z', MAT.tan); cyl(m, 0, 0.028, -0.07, 0.022, 0.03, 'z', MAT.tan); box(m, 0, 0.008, 0, 0.018, 0.012, 0.05, MAT.gun); },
  flash: (m) => { cyl(m, 0, 0, -0.025, 0.012, 0.05, 'z', MAT.gun, true); return 0.05; },
  sear: (m) => box(m, 0, 0, 0, 0.006, 0.02, 0.03, MAT.brass),
  trigger: (m) => box(m, 0, -0.03, 0.02, 0.006, 0.02, 0.006, MAT.red),
  guard_optic: (m) => { box(m, 0, 0.014, 0, 0.026, 0.026, 0.07, MAT.guardDark); box(m, 0, 0.018, -0.036, 0.02, 0.016, 0.004, MAT.glow); },
  lens: (m) => { cyl(m, 0, 0, -0.012, 0.022, 0.024, 'z', MAT.lensGlow); return 0.024; },
  prism: (m) => { for (const x of [-0.016, 0, 0.016]) cyl(m, x, 0, -0.01, 0.008, 0.02, 'z', MAT.glow); return 0.02; },
  cap_bank: (m) => { box(m, 0.03, 0, 0, 0.012, 0.05, 0.05, MAT.guardDark); box(m, 0.037, 0, 0, 0.002, 0.03, 0.03, MAT.cellGlow); },
  overcharge: (m) => { for (let i = 0; i < 3; i++) cyl(m, 0, 0, -i * 0.03, 0.026, 0.01, 'z', MAT.fire); },
  bell: (m) => { cyl(m, 0, 0, -0.03, 0.08, 0.04, 'z', MAT.guardDark); return 0.03; },
};

// Hang each installed mod's hardware on the gun. Returns the gun.
export function applyModLooks(g, id, mods, modDefs) {
  const a = g.userData.anchors || BASE_ANCHORS[id] || {};
  g.userData.anchors = a;
  g.userData.modParts = {};
  for (const [slot, modId] of Object.entries(mods || {})) {
    const md = modDefs(modId);
    if (!md) continue;
    const look = LOOKS[md.look];
    const at = a[slot] || a.muzzle || [0, 0, 0];
    if (!look) continue;
    const m = new THREE.Group();
    m.position.set(at[0], at[1], at[2]);
    m.name = 'mod_' + slot;
    const extend = look(m);
    g.add(m);
    g.userData.modParts[slot] = m;
    // muzzle devices and longer barrels move the muzzle point to their far end
    if (typeof extend === 'number' && (slot === 'muzzle' || slot === 'barrel' || slot === 'emitter')) {
      const mz = g.getObjectByName('muzzle');
      if (mz) mz.position.z -= extend;
    }
    // bigger magazines and swapped grips hide the stock part they replace
    if (slot === 'mag' && (md.look === 'drum' || md.look === 'frag_mag')) { const mg = g.getObjectByName('mag'); if (mg) mg.visible = false; }
  }
  return g;
}

export function weaponModel(id, mods = null) {
  const g = new THREE.Group();
  const b = BUILDERS[id];
  if (b) b(g);
  else box(g, 0, 0, 0, 0.05, 0.05, 0.2, MAT.gun);
  g.userData.id = id;
  if (!g.userData.anchors && BASE_ANCHORS[id]) g.userData.anchors = BASE_ANCHORS[id];
  if (mods && Object.keys(mods).length) applyModLooks(g, id, mods, modDef);
  return g;
}

// ---- Loot items ---------------------------------------------------------------

const SHAPES = {
  cloth: ['folded', 0x7b6f5c], scrap: ['scrap', 0x6f6a62], tape: ['roll', 0x8a8a84], glue: ['tube', 0xd8c050],
  fasteners: ['jar', 0x9a9ea3], chemicals: ['jug', 0x2f5f86], electronics: ['board', 0x2f6a3a], gunpowder: ['tin', 0x3a3a38],
  steel: ['bar', 0xa4a8ad], leather: ['folded', 0x5a3b24],
  clock: ['clock', 0xb0402a], radio: ['radio', 0x6b4a2b], whiskey: ['bottle', 0x8a5a22], jewelry: ['smallbox', 0x6a1e3a],
  watch: ['disc', 0xc9a227], toolkit: ['toolbox', 0x9a2a1e], lighter: ['smallbox', 0xc8c8c8], cutlery: ['bar', 0xb8bcc0],
  belt: ['strip', 0x4a2e1a], fertilizer: ['sack', 0xa89a6a], fireworks: ['bundle', 0xb03030], phone: ['phone', 0x151515], blanket: ['folded', 0x5a6a7a],
  codebook: ['book', 0x2b3035], ledger: ['book', 0x4a2a1a], demo_charge: ['charge', 0x6a5a3a],
  dive_gear: ['jug', 0xd8b43a], cutting_torch: ['tin', 0x3a6a4a], boat_keys: ['smallbox', 0xe06a1a], fuel_can: ['jug', 0x9a1e18],
  hull_plate: ['bar', 0x6a6e70], manifest: ['book', 0x9a1e18], prototype_case: ['toolbox', 0x3d444a],
  beans: ['can', 0x9a3a22], crackers: ['box', 0xd0b070], jerky: ['flat', 0x6a3a1a], soda: ['can', 0xb02a2a], mre: ['flat', 0x7a6a4a],
  rice: ['sack', 0xe0dcc8], beansrice: ['bowl', 0x7a2a1a], gumbo: ['bowl', 0x5a3a1a],
  bandage: ['roll', 0xe8e4da], antiseptic: ['bottle', 0x6a4a2a], pills: ['pills', 0xd0741f], medkit: ['medkit', 0xb02a2a], adrenaline: ['syringe', 0xd8d4c8],
  ammo_9mm: ['ammo', 0x9a7a2a], ammo_38: ['ammo', 0x6a5a3a], ammo_12g: ['ammo', 0xa02a20], ammo_308: ['ammo', 0x4d5233], bolt: ['bolts', 0x9a9ea3],
  battery: ['battery', 0x2a2a2a], suppressor: ['suppressor', 0x151515],
  ecell: ['cell', 0xd8542e], tlg_ration: ['flat', 0x7a7c78], catfish: ['fish', 0x6a4a2a], nano_injector: ['syringe', 0xc02a20],
  keycard: ['card', 0x2b3035], dogtags: ['disc', 0x9aa0a4], rosary: ['smallbox', 0x5a3a24], candles: ['bundle', 0xd8ccb0],
  arrow: ['bolts', 0x6b4a2b], ammo_45: ['ammo', 0x5a4a6a], ammo_556: ['ammo', 0x3a5a3a],
};

const ITEM_MATS = {};
function itemMat(hex) {
  if (!ITEM_MATS[hex]) ITEM_MATS[hex] = new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.12 });
  return ITEM_MATS[hex];
}

export function itemModel(id) {
  const d = def(id);
  if (d.cat === 'weapon') {
    const w = weaponModel(id);
    const g = new THREE.Group();
    // Lay weapons flat on their side.
    if (d.kind === 'gun' || d.slot === 'knife') w.rotation.z = Math.PI / 2;
    else w.rotation.x = Math.PI / 2;
    g.add(w);
    return g;
  }
  const [shape, hex] = SHAPES[id] || ['box', 0x888888];
  const m = itemMat(hex);
  const g = new THREE.Group();
  switch (shape) {
    case 'can': cyl(g, 0, 0.055, 0, 0.04, 0.11, 'y', m); cyl(g, 0, 0.112, 0, 0.038, 0.004, 'y', MAT.steel); break;
    case 'box': box(g, 0, 0.07, 0, 0.12, 0.14, 0.05, m); break;
    case 'book': box(g, 0, 0.02, 0, 0.17, 0.04, 0.23, m); box(g, 0.004, 0.02, 0, 0.16, 0.034, 0.222, MAT.white); box(g, -0.08, 0.02, 0, 0.012, 0.042, 0.232, m); if (id === 'codebook') box(g, 0.02, 0.041, 0.05, 0.1, 0.002, 0.02, MAT.red); break;
    case 'charge': cyl(g, 0, 0.08, 0, 0.065, 0.16, 'y', m); box(g, 0, 0.11, 0.07, 0.07, 0.05, 0.03, MAT.white); box(g, 0, 0.1, 0.086, 0.02, 0.012, 0.004, MAT.red); for (const a of [-0.03, 0.03]) cyl(g, a, 0.18, 0.02, 0.004, 0.06, 'y', MAT.red); box(g, 0, 0.08, 0, 0.14, 0.03, 0.14, itemMat(0x8a8a84)); break;
    case 'flat': box(g, 0, 0.02, 0, 0.16, 0.04, 0.1, m); break;
    case 'folded': box(g, 0, 0.04, 0, 0.22, 0.08, 0.16, m); break;
    case 'scrap': box(g, 0, 0.02, 0, 0.2, 0.02, 0.14, m).rotation.z = 0.2; box(g, 0.04, 0.05, 0.02, 0.12, 0.02, 0.1, m).rotation.x = 0.5; break;
    case 'roll': cyl(g, 0, 0.04, 0, 0.055, 0.08, 'y', m); break;
    case 'tube': cyl(g, 0, 0.02, 0, 0.018, 0.12, 'x', m); break;
    case 'jar': cyl(g, 0, 0.05, 0, 0.04, 0.1, 'y', m); cyl(g, 0, 0.105, 0, 0.042, 0.02, 'y', MAT.red); break;
    case 'jug': box(g, 0, 0.1, 0, 0.1, 0.2, 0.07, m); box(g, 0.02, 0.22, 0, 0.03, 0.04, 0.03, MAT.white); break;
    case 'board': box(g, 0, 0.01, 0, 0.14, 0.015, 0.1, m); box(g, 0.02, 0.025, 0, 0.03, 0.015, 0.03, MAT.black); break;
    case 'tin': cyl(g, 0, 0.05, 0, 0.05, 0.1, 'y', m); break;
    case 'bar': box(g, 0, 0.02, 0, 0.3, 0.035, 0.04, m); break;
    case 'clock': box(g, 0, 0.06, 0, 0.12, 0.12, 0.06, m); cyl(g, 0, 0.06, -0.031, 0.045, 0.004, 'z', MAT.white); break;
    case 'radio': box(g, 0, 0.07, 0, 0.2, 0.13, 0.07, m); box(g, -0.05, 0.07, -0.036, 0.07, 0.07, 0.004, MAT.black); break;
    case 'bottle': cyl(g, 0, 0.09, 0, 0.04, 0.18, 'y', m); cyl(g, 0, 0.2, 0, 0.014, 0.05, 'y', m); break;
    case 'smallbox': box(g, 0, 0.03, 0, 0.08, 0.06, 0.06, m); break;
    case 'disc': cyl(g, 0, 0.01, 0, 0.035, 0.02, 'y', m); break;
    case 'toolbox': box(g, 0, 0.08, 0, 0.36, 0.16, 0.16, m); box(g, 0, 0.18, 0, 0.14, 0.02, 0.02, MAT.black); break;
    case 'strip': box(g, 0, 0.01, 0, 0.36, 0.01, 0.04, m); box(g, 0.17, 0.012, 0, 0.04, 0.012, 0.05, MAT.brass); break;
    case 'sack': box(g, 0, 0.1, 0, 0.22, 0.2, 0.14, m); break;
    case 'bundle': for (let i = 0; i < 4; i++) cyl(g, (i % 2) * 0.04 - 0.02, 0.07, Math.floor(i / 2) * 0.04 - 0.02, 0.018, 0.14, 'y', m); break;
    case 'phone': box(g, 0, 0.006, 0, 0.07, 0.012, 0.14, m); break;
    case 'bowl': cyl(g, 0, 0.03, 0, 0.07, 0.06, 'y', MAT.white); cyl(g, 0, 0.061, 0, 0.062, 0.004, 'y', m); break;
    case 'pills': cyl(g, 0, 0.04, 0, 0.022, 0.08, 'y', m); cyl(g, 0, 0.085, 0, 0.024, 0.014, 'y', MAT.white); break;
    case 'medkit': box(g, 0, 0.06, 0, 0.22, 0.12, 0.08, m); box(g, 0, 0.06, -0.041, 0.07, 0.02, 0.004, MAT.white); box(g, 0, 0.06, -0.041, 0.02, 0.07, 0.004, MAT.white); break;
    case 'syringe': cyl(g, 0, 0.012, 0, 0.012, 0.14, 'x', m); cyl(g, 0.09, 0.012, 0, 0.002, 0.05, 'x', MAT.steel); box(g, -0.02, 0.012, 0, 0.04, 0.014, 0.014, MAT.yellow); break;
    case 'ammo': box(g, 0, 0.035, 0, 0.12, 0.07, 0.08, m); box(g, 0, 0.071, 0, 0.1, 0.004, 0.06, MAT.paper); break;
    case 'bolts': for (let i = 0; i < 3; i++) cyl(g, 0, 0.01 + i * 0.012, (i - 1) * 0.015, 0.005, 0.36, 'x', m); break;
    case 'battery': cyl(g, 0, 0.03, 0, 0.016, 0.06, 'y', m); cyl(g, 0, 0.062, 0, 0.006, 0.006, 'y', MAT.brass); break;
    case 'suppressor': cyl(g, 0, 0.02, 0, 0.02, 0.16, 'x', m); break;
    case 'cell': box(g, 0, 0.04, 0, 0.05, 0.08, 0.035, MAT.guardDark); box(g, 0, 0.04, 0.018, 0.04, 0.05, 0.004, m); break;
    case 'fish': box(g, 0, 0.02, 0, 0.26, 0.04, 0.08, m); box(g, 0.14, 0.02, 0, 0.05, 0.03, 0.1, m).rotation.y = 0.5; break;
    case 'card': box(g, 0, 0.003, 0, 0.085, 0.005, 0.055, m); box(g, 0.02, 0.006, 0, 0.02, 0.002, 0.02, MAT.glow); break;
    default: box(g, 0, 0.05, 0, 0.1, 0.1, 0.1, m);
  }
  return g;
}

// First-person hand + forearm. The palm sits at the origin, fingers toward -Z;
// the forearm angles down and outward toward an off-screen elbow.
export function handModel(left = false) {
  const g = new THREE.Group();
  const palm = box(g, 0, 0, 0, 0.075, 0.035, 0.09, MAT.glove);
  palm.name = 'palm';
  const fingers = new THREE.Group();
  fingers.name = 'fingers';
  fingers.position.set(0, -0.005, -0.045);
  box(fingers, 0, -0.018, -0.02, 0.07, 0.03, 0.045, MAT.glove);
  g.add(fingers);
  const thumb = box(g, left ? 0.04 : -0.04, 0.008, -0.02, 0.022, 0.022, 0.05, MAT.glove);
  thumb.rotation.y = left ? -0.5 : 0.5;
  const arm = new THREE.Group();
  arm.position.set(0, -0.005, 0.05);
  arm.rotation.set(0.55, left ? -0.35 : 0.35, 0);
  box(arm, 0, 0, 0.05, 0.07, 0.06, 0.1, MAT.cuff);
  const sleeve = box(arm, 0, -0.005, 0.2, 0.085, 0.085, 0.22, MAT.sleeve);
  sleeve.name = 'sleeve';
  g.add(arm);
  return g;
}
