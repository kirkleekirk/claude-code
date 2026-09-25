import * as THREE from 'three';
import { def } from '../data/items.js';

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
};

// ---- Weapons -----------------------------------------------------------------

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

export function weaponModel(id) {
  const g = new THREE.Group();
  const b = BUILDERS[id];
  if (b) b(g);
  else box(g, 0, 0, 0, 0.05, 0.05, 0.2, MAT.gun);
  g.userData.id = id;
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
  beans: ['can', 0x9a3a22], crackers: ['box', 0xd0b070], jerky: ['flat', 0x6a3a1a], soda: ['can', 0xb02a2a], mre: ['flat', 0x7a6a4a],
  rice: ['sack', 0xe0dcc8], beansrice: ['bowl', 0x7a2a1a], gumbo: ['bowl', 0x5a3a1a],
  bandage: ['roll', 0xe8e4da], antiseptic: ['bottle', 0x6a4a2a], pills: ['pills', 0xd0741f], medkit: ['medkit', 0xb02a2a], adrenaline: ['syringe', 0xd8d4c8],
  ammo_9mm: ['ammo', 0x9a7a2a], ammo_38: ['ammo', 0x6a5a3a], ammo_12g: ['ammo', 0xa02a20], ammo_308: ['ammo', 0x4d5233], bolt: ['bolts', 0x9a9ea3],
  battery: ['battery', 0x2a2a2a], suppressor: ['suppressor', 0x151515],
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
    default: box(g, 0, 0.05, 0, 0.1, 0.1, 0.1, m);
  }
  g.scale.setScalar(1.35);
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
