import * as THREE from '../../vendor/three.module.min.js';

// Procedural gun models. Forward is -Z, up is +Y, origin at the trigger.
// Each model reports its muzzle, ejection port, sight height and hand anchors.

let MATS = null;
export function gunMaterials() {
  if (MATS) return MATS;
  const camoCanvas = document.createElement('canvas');
  camoCanvas.width = camoCanvas.height = 256;
  const c = camoCanvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#2a1638');
  g.addColorStop(0.5, '#4a1e46');
  g.addColorStop(1, '#1a1030');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const emis = document.createElement('canvas');
  emis.width = emis.height = 256;
  const e = emis.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, 256, 256);
  // hex-circuit traces in sunset orange / pink
  for (let k = 0; k < 70; k++) {
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    const col = Math.random() < 0.5 ? '#ff8a3a' : '#ff4fa0';
    e.strokeStyle = col;
    c.strokeStyle = col;
    e.lineWidth = c.lineWidth = 1.5;
    e.beginPath();
    c.beginPath();
    e.moveTo(x, y);
    c.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      const a = Math.floor(Math.random() * 6) * (Math.PI / 3);
      x += Math.cos(a) * 18;
      y += Math.sin(a) * 18;
      e.lineTo(x, y);
      c.lineTo(x, y);
    }
    e.stroke();
    c.stroke();
  }
  const camoMap = new THREE.CanvasTexture(camoCanvas);
  camoMap.colorSpace = THREE.SRGBColorSpace;
  camoMap.wrapS = camoMap.wrapT = THREE.RepeatWrapping;
  const camoEmis = new THREE.CanvasTexture(emis);
  camoEmis.colorSpace = THREE.SRGBColorSpace;
  camoEmis.wrapS = camoEmis.wrapT = THREE.RepeatWrapping;
  MATS = {
    // matte finish: smoother metal mirrors the low sun as a white slab on flat tops
    metal: new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.5, roughness: 0.55 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.1, roughness: 0.68 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x8c7b5a, metalness: 0.15, roughness: 0.75 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4b5237, metalness: 0.2, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5c3a22, metalness: 0.0, roughness: 0.55 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0c1824, metalness: 0.9, roughness: 0.08 }),
    dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3) }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.6, 0.5) }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb48a3c, metalness: 1, roughness: 0.32 }),
    camo: new THREE.MeshStandardMaterial({ map: camoMap, emissiveMap: camoEmis, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.35 }),
    camoTex: [camoMap, camoEmis],
  };
  return MATS;
}

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}
function cyl(r1, r2, len, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  g.rotateX(Math.PI / 2); // along Z
  return g;
}

class GunBuilder {
  constructor() {
    this.group = new THREE.Group();
    this.M = gunMaterials();
    this.skinnable = [];
  }
  add(geo, matName, x, y, z, rx = 0, ry = 0, rz = 0, parent = this.group) {
    const m = new THREE.Mesh(geo, this.M[matName]);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    m.userData.mat = matName;
    if (matName === 'metal' || matName === 'polymer' || matName === 'olive' || matName === 'tan') this.skinnable.push(m);
    parent.add(m);
    return m;
  }
  sub(x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.group.add(g);
    return g;
  }
}

function redDot(b, y, z, len = 0.06) {
  b.add(box(0.026, 0.04, len * 0.7), 'metal', 0, y - 0.034, z);
  b.add(box(0.032, 0.012, len), 'polymer', 0, y - 0.012, z);
  b.add(box(0.034, 0.03, 0.006), 'polymer', 0, y + 0.004, z - len / 2);
  b.add(box(0.034, 0.03, 0.006), 'polymer', 0, y + 0.004, z + len / 2);
  b.add(box(0.03, 0.026, 0.004), 'lens', 0, y + 0.004, z - len / 2 + 0.004);
  b.add(box(0.003, 0.003, 0.003), 'dot', 0, y + 0.006, z - len / 2 + 0.006);
}

function scope(b, y, z, len, r) {
  b.add(cyl(r, r, len), 'metal', 0, y, z);
  b.add(cyl(r * 1.35, r, 0.05), 'metal', 0, y, z - len / 2 - 0.02);
  b.add(cyl(r * 1.15, r * 1.15, 0.05), 'metal', 0, y, z + len / 2 + 0.015);
  b.add(cyl(r * 1.2, r * 1.2, 0.004), 'lens', 0, y, z - len / 2 - 0.045);
  b.add(box(0.012, 0.025, 0.02), 'metal', 0, y - r - 0.01, z - len * 0.3);
  b.add(box(0.012, 0.025, 0.02), 'metal', 0, y - r - 0.01, z + len * 0.3);
}

const BUILDERS = {
  pistol(b) {
    const slide = b.add(box(0.032, 0.034, 0.19), 'metal', 0, 0.055, -0.065);
    b.add(box(0.03, 0.024, 0.16), 'polymer', 0, 0.028, -0.055);
    b.add(box(0.03, 0.115, 0.046), 'polymer', 0, -0.03, 0.028, -0.26);
    b.add(box(0.006, 0.006, 0.006), 'dot', 0, 0.075, 0.025);
    b.add(box(0.006, 0.008, 0.008), 'metal', 0, 0.075, -0.15);
    b.add(cyl(0.008, 0.008, 0.02), 'metal', 0, 0.05, -0.165);
    const mag = b.add(box(0.026, 0.03, 0.04), 'polymer', 0, -0.085, 0.045, -0.26);
    return { slide, mag, muzzle: [0, 0.052, -0.18], eject: [0.018, 0.068, -0.04], sightY: 0.078, left: [-0.012, -0.035, 0.02], right: [0, -0.03, 0.03], len: 0.2 };
  },
  revolver(b) {
    b.add(box(0.03, 0.05, 0.1), 'metal', 0, 0.035, -0.02);
    b.add(cyl(0.011, 0.011, 0.2), 'metal', 0, 0.05, -0.17);
    b.add(box(0.012, 0.016, 0.2), 'metal', 0, 0.064, -0.17);
    const drum = b.add(cyl(0.024, 0.024, 0.048, 8), 'metal', 0, 0.035, -0.04);
    b.add(box(0.032, 0.11, 0.05), 'wood', 0, -0.035, 0.04, -0.3);
    b.add(box(0.008, 0.02, 0.012), 'metal', 0, 0.07, 0.03, 0.4);
    b.add(box(0.006, 0.01, 0.006), 'dot', 0, 0.078, -0.26);
    return { mag: drum, drum, muzzle: [0, 0.05, -0.28], eject: null, sightY: 0.078, left: [-0.012, -0.04, 0.03], right: [0, -0.035, 0.04], len: 0.3 };
  },
  smg(b) {
    b.add(box(0.044, 0.06, 0.28), 'polymer', 0, 0.035, -0.09);
    b.add(box(0.03, 0.03, 0.2), 'metal', 0, 0.075, -0.09);
    b.add(cyl(0.011, 0.011, 0.12), 'metal', 0, 0.04, -0.29);
    b.add(cyl(0.021, 0.021, 0.16), 'metal', 0, 0.04, -0.38);
    b.add(box(0.03, 0.1, 0.04), 'polymer', 0, -0.03, 0.02, -0.25);
    b.add(box(0.026, 0.07, 0.03), 'polymer', 0, -0.025, -0.2);
    b.add(box(0.012, 0.012, 0.2), 'metal', 0.016, 0.04, 0.14);
    b.add(box(0.012, 0.012, 0.2), 'metal', -0.016, 0.04, 0.14);
    b.add(box(0.044, 0.05, 0.016), 'polymer', 0, 0.03, 0.24);
    const mag = b.add(box(0.026, 0.16, 0.034), 'metal', 0, -0.07, -0.08, 0.08);
    redDot(b, 0.105, -0.06);
    return { mag, muzzle: [0, 0.04, -0.47], eject: [0.024, 0.05, -0.06], sightY: 0.111, left: [0, -0.04, -0.2], right: [0, -0.03, 0.02], len: 0.5 };
  },
  pdw(b) {
    b.add(box(0.05, 0.075, 0.36), 'olive', 0, 0.02, -0.05);
    b.add(cyl(0.01, 0.01, 0.12), 'metal', 0, 0.035, -0.29);
    b.add(box(0.03, 0.1, 0.04), 'polymer', 0, -0.045, -0.02, -0.2);
    b.add(box(0.05, 0.06, 0.12), 'polymer', 0, 0.0, 0.18);
    const mag = b.add(box(0.034, 0.028, 0.24), 'polymer', 0, 0.072, -0.06);
    redDot(b, 0.112, -0.02, 0.05);
    return { mag, muzzle: [0, 0.035, -0.36], eject: [0, -0.02, 0.06], sightY: 0.118, left: [0, -0.02, -0.18], right: [0, -0.045, -0.02], len: 0.45 };
  },
  ar(b) {
    b.add(box(0.05, 0.07, 0.3), 'polymer', 0, 0.035, -0.05);
    b.add(box(0.055, 0.058, 0.3), 'tan', 0, 0.04, -0.34);
    b.add(box(0.016, 0.01, 0.6), 'metal', 0, 0.075, -0.2);
    b.add(cyl(0.01, 0.01, 0.16), 'metal', 0, 0.04, -0.56);
    b.add(cyl(0.016, 0.016, 0.05), 'metal', 0, 0.04, -0.66);
    b.add(box(0.032, 0.105, 0.045), 'polymer', 0, -0.035, 0.03, -0.3);
    b.add(box(0.046, 0.075, 0.2), 'tan', 0, 0.02, 0.22);
    b.add(box(0.046, 0.11, 0.03), 'polymer', 0, 0.0, 0.32);
    const mag = new THREE.Group();
    mag.position.set(0, -0.03, -0.11);
    b.group.add(mag);
    b.add(box(0.028, 0.09, 0.06), 'metal', 0, -0.03, 0, 0.12, 0, 0, mag);
    b.add(box(0.028, 0.08, 0.058), 'metal', 0, -0.11, -0.015, 0.3, 0, 0, mag);
    b.add(box(0.034, 0.02, 0.012), 'metal', 0, 0.075, 0.08);
    redDot(b, 0.112, -0.04, 0.07);
    return { mag, muzzle: [0, 0.04, -0.7], eject: [0.026, 0.05, -0.02], sightY: 0.118, left: [0, -0.005, -0.34], right: [0, -0.03, 0.03], len: 0.75 };
  },
  ak(b) {
    b.add(box(0.048, 0.07, 0.32), 'metal', 0, 0.035, -0.05);
    b.add(box(0.054, 0.05, 0.24), 'wood', 0, 0.03, -0.33);
    b.add(cyl(0.012, 0.012, 0.22), 'metal', 0, 0.075, -0.33);
    b.add(cyl(0.01, 0.01, 0.2), 'metal', 0, 0.035, -0.55);
    b.add(cyl(0.015, 0.015, 0.06), 'metal', 0, 0.035, -0.67);
    b.add(box(0.03, 0.1, 0.045), 'wood', 0, -0.035, 0.03, -0.32);
    b.add(box(0.044, 0.07, 0.26), 'wood', 0, 0.0, 0.24, 0.1);
    const mag = new THREE.Group();
    mag.position.set(0, -0.025, -0.12);
    b.group.add(mag);
    for (let k = 0; k < 3; k++) b.add(box(0.028, 0.065, 0.058), 'olive', 0, -0.03 - k * 0.055, -0.012 * k * k, 0.15 + k * 0.17, 0, 0, mag);
    b.add(box(0.016, 0.01, 0.22), 'metal', 0, 0.075, -0.02);
    redDot(b, 0.11, -0.03, 0.06);
    return { mag, muzzle: [0, 0.035, -0.71], eject: [0.026, 0.05, -0.03], sightY: 0.116, left: [0, -0.01, -0.33], right: [0, -0.03, 0.03], len: 0.78 };
  },
  dmr(b) {
    b.add(box(0.05, 0.07, 0.32), 'olive', 0, 0.035, -0.05);
    b.add(box(0.052, 0.055, 0.36), 'polymer', 0, 0.04, -0.38);
    b.add(cyl(0.011, 0.011, 0.24), 'metal', 0, 0.04, -0.66);
    b.add(cyl(0.017, 0.017, 0.06), 'metal', 0, 0.04, -0.8);
    b.add(box(0.032, 0.1, 0.045), 'polymer', 0, -0.035, 0.03, -0.3);
    b.add(box(0.046, 0.08, 0.24), 'olive', 0, 0.02, 0.24);
    const mag = b.add(box(0.03, 0.08, 0.07), 'metal', 0, -0.04, -0.1, 0.05);
    scope(b, 0.125, -0.06, 0.2, 0.019);
    return { mag, muzzle: [0, 0.04, -0.84], eject: [0.026, 0.05, -0.02], sightY: 0.125, left: [0, -0.005, -0.38], right: [0, -0.03, 0.03], len: 0.9 };
  },
  sniper(b) {
    b.add(box(0.045, 0.06, 0.28), 'metal', 0, 0.045, -0.04);
    b.add(box(0.06, 0.07, 0.52), 'wood', 0, 0.01, -0.2);
    b.add(cyl(0.013, 0.011, 0.46), 'metal', 0, 0.045, -0.66);
    b.add(cyl(0.02, 0.02, 0.07), 'metal', 0, 0.045, -0.92);
    b.add(box(0.05, 0.1, 0.3), 'wood', 0, -0.0, 0.24, 0.08);
    b.add(box(0.032, 0.08, 0.04), 'wood', 0, -0.05, 0.05, -0.4);
    const bolt = b.sub(0.03, 0.06, 0.04);
    b.add(cyl(0.006, 0.006, 0.05), 'metal', 0.02, 0, 0, 0, Math.PI / 2, 0, bolt);
    b.add(new THREE.SphereGeometry(0.011, 8, 6), 'metal', 0.046, 0, 0, 0, 0, 0, bolt);
    const mag = b.add(box(0.03, 0.04, 0.06), 'metal', 0, -0.03, -0.08);
    scope(b, 0.13, -0.04, 0.3, 0.024);
    for (const s of [-1, 1]) b.add(box(0.008, 0.008, 0.2), 'metal', s * 0.02, -0.02, -0.5, 0.1);
    return { mag, bolt, muzzle: [0, 0.045, -0.96], eject: [0.03, 0.06, 0.0], sightY: 0.13, left: [0, -0.03, -0.36], right: [0, -0.04, 0.05], len: 1.0 };
  },
  shotgun(b) {
    b.add(box(0.05, 0.07, 0.24), 'metal', 0, 0.035, -0.04);
    b.add(cyl(0.013, 0.013, 0.56), 'metal', 0, 0.055, -0.44);
    b.add(cyl(0.012, 0.012, 0.48), 'metal', 0, 0.02, -0.4);
    const pump = b.add(box(0.05, 0.045, 0.16), 'polymer', 0, 0.022, -0.32);
    b.add(box(0.032, 0.1, 0.045), 'polymer', 0, -0.035, 0.03, -0.3);
    b.add(box(0.046, 0.08, 0.26), 'polymer', 0, 0.015, 0.24, 0.08);
    b.add(box(0.006, 0.006, 0.006), 'dot', 0, 0.072, -0.71);
    return { pump, mag: null, muzzle: [0, 0.055, -0.73], eject: [0.026, 0.05, -0.03], sightY: 0.075, left: [0, -0.005, -0.32], right: [0, -0.03, 0.03], len: 0.75 };
  },
  lever(b) {
    b.add(box(0.04, 0.06, 0.16), 'metal', 0, 0.035, -0.02);
    b.add(cyl(0.011, 0.011, 0.56), 'metal', 0, 0.055, -0.38);
    b.add(cyl(0.009, 0.009, 0.46), 'metal', 0, 0.03, -0.33);
    b.add(box(0.046, 0.04, 0.22), 'wood', 0, 0.035, -0.22);
    b.add(box(0.044, 0.085, 0.3), 'wood', 0, -0.005, 0.2, 0.12);
    const lever = b.sub(0, 0.0, 0.0);
    b.add(box(0.008, 0.008, 0.11), 'metal', 0, -0.03, 0.04, 0, 0, 0, lever);
    b.add(box(0.008, 0.045, 0.008), 'metal', 0, -0.012, 0.095, 0, 0, 0, lever);
    b.add(box(0.008, 0.045, 0.008), 'metal', 0, -0.012, -0.012, 0, 0, 0, lever);
    b.add(box(0.006, 0.008, 0.006), 'dot', 0, 0.072, -0.64);
    return { lever, mag: null, muzzle: [0, 0.055, -0.67], eject: [0, 0.07, -0.02], sightY: 0.074, left: [0, -0.0, -0.24], right: [0, -0.035, 0.06], len: 0.75 };
  },
  lmg(b) {
    b.add(box(0.07, 0.09, 0.36), 'polymer', 0, 0.035, -0.06);
    b.add(box(0.065, 0.025, 0.26), 'metal', 0, 0.092, -0.07);
    b.add(box(0.06, 0.06, 0.3), 'olive', 0, 0.035, -0.4);
    b.add(cyl(0.014, 0.014, 0.3), 'metal', 0, 0.04, -0.68);
    b.add(cyl(0.02, 0.02, 0.07), 'metal', 0, 0.04, -0.84);
    b.add(box(0.034, 0.1, 0.045), 'polymer', 0, -0.04, 0.04, -0.3);
    b.add(box(0.05, 0.09, 0.26), 'polymer', 0, 0.02, 0.26);
    b.add(box(0.012, 0.05, 0.1), 'metal', 0, 0.13, -0.2);
    const mag = b.add(box(0.09, 0.1, 0.13), 'olive', -0.02, -0.06, -0.08);
    for (const s of [-1, 1]) b.add(box(0.008, 0.008, 0.22), 'metal', s * 0.025, -0.0, -0.62, 0.12);
    redDot(b, 0.128, 0.0, 0.06);
    return { mag, muzzle: [0, 0.04, -0.88], eject: [0.04, 0.05, -0.05], sightY: 0.134, left: [0, -0.01, -0.4], right: [0, -0.04, 0.04], len: 0.9 };
  },
  helios(b) {
    b.add(box(0.085, 0.095, 0.32), 'metal', 0, 0.035, -0.08);
    b.add(box(0.07, 0.02, 0.26), 'glow', 0, 0.086, -0.08);
    for (const s of [-1, 1]) b.add(box(0.004, 0.05, 0.2), 'glow', s * 0.044, 0.035, -0.1);
    const dish = new THREE.CylinderGeometry(0.09, 0.03, 0.08, 16, 1, true);
    dish.rotateX(-Math.PI / 2);
    b.add(dish, 'metal', 0, 0.04, -0.3);
    for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(0.045 - k * 0.006, 0.006, 6, 18), 'glow', 0, 0.04, -0.27 + k * 0.03);
    b.add(cyl(0.012, 0.012, 0.12), 'metal', 0, 0.04, -0.27);
    b.add(box(0.034, 0.1, 0.045), 'polymer', 0, -0.04, 0.03, -0.25);
    b.add(box(0.03, 0.03, 0.18), 'polymer', 0, 0.115, -0.06);
    const mag = b.add(cyl(0.028, 0.028, 0.12), 'olive', 0.06, 0.02, 0.06);
    return { mag, muzzle: [0, 0.04, -0.36], eject: null, sightY: 0.14, left: [0, -0.02, -0.18], right: [0, -0.04, 0.03], len: 0.45 };
  },
};

export function buildGun(modelName) {
  const b = new GunBuilder();
  const info = BUILDERS[modelName](b);
  const out = {
    group: b.group, skinnable: b.skinnable,
    muzzle: new THREE.Vector3(...info.muzzle), eject: info.eject ? new THREE.Vector3(...info.eject) : null,
    sightY: info.sightY, left: new THREE.Vector3(...info.left), right: new THREE.Vector3(...info.right), len: info.len,
    mag: info.mag || null, slide: info.slide || null, bolt: info.bolt || null, pump: info.pump || null, lever: info.lever || null, drum: info.drum || null,
  };
  for (const k of ['mag', 'slide', 'bolt', 'pump', 'lever', 'drum']) {
    if (out[k]) {
      out[k].userData.home = out[k].position.clone();
      out[k].userData.homeRot = out[k].rotation.clone();
    }
  }
  return out;
}

export function setCamo(gun, on) {
  const M = gunMaterials();
  for (const m of gun.skinnable) m.material = on ? M.camo : M[m.userData.mat];
}

// Translucent hologram copy for wall-buys and the 3D printer.
const holoVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}
`;
const holoFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float scan = 0.65 + 0.35 * sin(vW.y * 140.0 - uTime * 6.0);
  float a = (0.18 + pow(f, 2.0) * 0.9) * scan * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}
`;
export function hologramMaterial(color = 0xffb060) {
  return new THREE.ShaderMaterial({
    vertexShader: holoVert, fragmentShader: holoFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(2.2) }, uTime: { value: 0 }, uOpacity: { value: 1 } },
  });
}

export function buildHologram(modelName, material) {
  const gun = buildGun(modelName);
  gun.group.traverse((o) => {
    if (o.isMesh) o.material = material;
  });
  return gun;
}
