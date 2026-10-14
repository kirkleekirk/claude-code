import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from '../world/materials.js';

// Procedural weapon models. Forward is -Z, up is +Y, origin near the trigger.
// Big parts are side profiles extruded across the gun with chamfered edges; static parts merge
// into one mesh per material. Each model also reports its muzzle, ejection port, sight line,
// where the hands hold it and how it sits on screen.

let MATS = null;

function canvasTexture(size, draw, repeat = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

function woodTexture() {
  return canvasTexture(256, (c, n) => {
    c.fillStyle = '#6a3c1f';
    c.fillRect(0, 0, n, n);
    const f = (Math.PI * 2) / n;
    for (let i = 0; i < 120; i++) {
      const y0 = Math.random() * n;
      const a = 0.05 + Math.random() * 0.15;
      c.strokeStyle = Math.random() < 0.55 ? `rgba(34,15,6,${a})` : `rgba(164,100,54,${a})`;
      c.lineWidth = 0.6 + Math.random() * 2.4;
      const k = 1 + Math.floor(Math.random() * 3);
      const ph = Math.random() * 6;
      c.beginPath();
      for (let x = 0; x <= n; x += 4) {
        const y = y0 + Math.sin(x * f * k + ph) * 3 + Math.sin(x * f * 5 + i) * 0.7;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }, 7);
}

// White mask, tinted by the material: a soft dot, or a ring around a dot for holographic sights.
function reticleMaterial(ring) {
  const map = canvasTexture(64, (c) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, 64, 64);
    const g = c.createRadialGradient(32, 32, 0, 32, 32, ring ? 6 : 9);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    if (ring) {
      c.strokeStyle = 'rgba(255,255,255,0.92)';
      c.lineWidth = 2.2;
      c.beginPath();
      c.arc(32, 32, 25, 0, Math.PI * 2);
      c.stroke();
    }
  });
  return new THREE.MeshBasicMaterial({ map, color: new THREE.Color(5, 0.45, 0.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
}

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
  camoMap.repeat.set(5, 5);
  const camoEmis = new THREE.CanvasTexture(emis);
  camoEmis.colorSpace = THREE.SRGBColorSpace;
  camoEmis.wrapS = camoEmis.wrapT = THREE.RepeatWrapping;
  camoEmis.repeat.set(5, 5);
  const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  MATS = {
    // matte finishes: smooth metal mirrors the low sun as a white slab on flat tops
    metal: std(0x3b4047, 0.5, 0.55),
    steel: std(0x26292e, 0.65, 0.45),
    polymer: std(0x232528, 0.05, 0.72),
    rubber: std(0x141516, 0, 0.95),
    tan: std(0x8d7a55, 0.05, 0.78),
    olive: std(0x495034, 0.08, 0.76),
    bakelite: std(0x6b2d18, 0.05, 0.5),
    wood: std(0xffffff, 0, 0.62, { map: woodTexture() }),
    glass: std(0xa8dcff, 0.2, 0.04, { transparent: true, opacity: 0.12, depthWrite: false }),
    lens: std(0x0c1b30, 0.85, 0.12),
    // painted / fibre sight dots: bright but not a laser
    dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 0.55, 0.16) }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.6, 0.5) }),
    brass: std(0xb48a3c, 1, 0.32),
    camo: std(0xffffff, 0.6, 0.38, { map: camoMap, emissiveMap: camoEmis, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 2.2 }),
    reticleDot: reticleMaterial(false),
    reticleHolo: reticleMaterial(true),
    camoTex: [camoMap, camoEmis],
  };
  return MATS;
}

// ---- geometry helpers ------------------------------------------------------------------------

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

// Cylinder along Z: rRear at +Z, rFront at -Z.
function tube(rRear, rFront, len, seg = 14) {
  const g = new THREE.CylinderGeometry(rRear, rFront, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

// Outline from [a, b] points; a four-number entry is a quadratic curve [ca, cb, a, b].
function outline(pts, Kind) {
  const s = new Kind();
  pts.forEach((p, i) => {
    if (i === 0) s.moveTo(p[0], p[1]);
    else if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else s.lineTo(p[0], p[1]);
  });
  return s;
}

// Extrude an outline from z = 0 to z = depth with chamfered (or rounded) edges.
function extrude(pts, holes, depth, bevel, curveSegments = 5, bevelSegments = 1) {
  const s = outline(pts, THREE.Shape);
  if (holes) for (const h of holes) s.holes.push(outline(h, THREE.Path));
  const bt = Math.max(0, Math.min(bevel, depth * 0.3));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.0004, depth - 2 * bt),
    steps: 1,
    curveSegments,
    bevelEnabled: bt > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelOffset: -bt,
    bevelSegments,
  });
  g.translate(0, 0, bt);
  return g;
}

// Side profile from [z, y] points, extruded across the gun and centred on x = 0.
function sideGeo(pts, width, bevel = 0.002, holes = null) {
  const g = extrude(pts, holes, width, bevel);
  g.rotateY(-Math.PI / 2); // (a, b, depth) -> (-depth, b, a)
  g.translate(width / 2, 0, 0);
  return g;
}

// Front profile from [x, y] points, extruded backward from z = 0 to z = depth.
function frontGeo(pts, holes, depth, bevel = 0.001) {
  return extrude(pts, holes, depth, bevel, 8);
}

function rrect(x0, y0, x1, y1, r) {
  return [
    [x0 + r, y0], [x1 - r, y0], [x1, y0, x1, y0 + r], [x1, y1 - r], [x1, y1, x1 - r, y1],
    [x0 + r, y1], [x0, y1, x0, y1 - r], [x0, y0 + r], [x0, y0, x0 + r, y0],
  ];
}

function circle(cx, cy, r, n = 20) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// Rounded box centred on the origin (gloves, knuckles).
export function rbox(w, h, d, r) {
  r = Math.max(0.0005, Math.min(r, w / 2 - 0.0004, h / 2 - 0.0004, d / 2 - 0.0004));
  const g = extrude(rrect(-w / 2, -h / 2, w / 2, h / 2, r), null, d, r, 3, 2);
  g.translate(0, 0, -d / 2);
  return g;
}

const SKIN = new Set(['metal', 'steel', 'polymer', 'tan', 'olive', 'bakelite', 'wood']);

class GunBuilder {
  constructor() {
    this.group = new THREE.Group();
    this.M = gunMaterials();
    this.statics = new Map();
    this.skinnable = [];
    this.o = new THREE.Object3D();
  }
  // Static parts merge per material; parts on a moving sub-group stay separate meshes.
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = null) {
    if (parent) {
      const m = new THREE.Mesh(geo, this.M[mat]);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.userData.mat = mat;
      if (SKIN.has(mat)) this.skinnable.push(m);
      parent.add(m);
      return m;
    }
    const o = this.o;
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.updateMatrix();
    if (!this.statics.has(mat)) this.statics.set(mat, []);
    this.statics.get(mat).push({ geometry: geo, matrix: o.matrix.clone() });
    return null;
  }
  box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = null) {
    return this.add(box(w, h, d), mat, x, y, z, rx, ry, rz, parent);
  }
  side(pts, width, mat, opts = {}) {
    return this.add(sideGeo(pts, width, opts.bevel ?? 0.002, opts.holes || null), mat, opts.x || 0, 0, 0, 0, 0, 0, opts.parent || null);
  }
  tube(rRear, rFront, zRear, zFront, y, mat, opts = {}) {
    return this.add(tube(rRear, rFront, zRear - zFront, opts.seg || 14), mat, opts.x || 0, y, (zRear + zFront) / 2, 0, 0, 0, opts.parent || null);
  }
  // Picatinny rail sitting on y, from zRear to zFront. Returns its top.
  rail(y, zRear, zFront, w = 0.021, mat = 'metal') {
    const len = zRear - zFront;
    this.box(w * 0.72, 0.0045, len, mat, 0, y + 0.00225, (zRear + zFront) / 2);
    const n = Math.max(1, Math.floor((len - 0.0052) / 0.01) + 1);
    for (let i = 0; i < n; i++) this.box(w, 0.0035, 0.0052, mat, 0, y + 0.0045 + 0.00175, zRear - 0.0026 - i * 0.01);
    return y + 0.008;
  }
  trigger(z, yTop, mat = 'steel') {
    this.side([[z + 0.003, yTop], [z - 0.003, yTop - 0.011], [z - 0.002, yTop - 0.022], [z + 0.003, yTop - 0.024], [z + 0.002, yTop - 0.012], [z + 0.007, yTop]], 0.005, mat, { bevel: 0.0008 });
  }
  part(x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.group.add(g);
    return g;
  }
  finish() {
    for (const [mat, list] of this.statics) {
      const m = new THREE.Mesh(mergeGeometries(list), this.M[mat]);
      m.userData.mat = mat;
      if (SKIN.has(mat)) this.skinnable.push(m);
      this.group.add(m);
      for (const p of list) p.geometry.dispose();
    }
    this.statics.clear();
  }
}

// ---- optics ----------------------------------------------------------------------------------

// Compact reflex sight: open hood at the front, low body behind. Centred along the rail at z.
function reflexSight(b, railTop, z) {
  b.box(0.024, 0.008, 0.046, 'metal', 0, railTop + 0.004, z);
  b.add(tube(0.0042, 0.0042, 0.007, 10), 'metal', 0.0145, railTop + 0.004, z + 0.006, 0, Math.PI / 2, 0);
  const h0 = railTop + 0.008;
  const hf = z - 0.017;
  const outer = [[-0.016, h0], [0.016, h0], [0.0135, h0 + 0.024], [0.009, h0 + 0.029], [-0.009, h0 + 0.029], [-0.0135, h0 + 0.024]];
  const win = [[-0.0116, h0 + 0.0035], [0.0116, h0 + 0.0035], [0.0099, h0 + 0.0215], [0.0068, h0 + 0.025], [-0.0068, h0 + 0.025], [-0.0099, h0 + 0.0215]];
  b.add(frontGeo(outer, [win], 0.009, 0.0012), 'metal', 0, 0, hf);
  b.side([[z + 0.022, h0], [z + 0.022, h0 + 0.004], [z + 0.016, h0 + 0.007], [hf + 0.009, h0 + 0.007], [hf + 0.009, h0]], 0.03, 'metal', { bevel: 0.0012 });
  b.box(0.004, 0.003, 0.007, 'polymer', 0.0152, h0 + 0.004, z + 0.01);
  const sy = h0 + 0.01425;
  b.box(0.022, 0.02, 0.001, 'glass', 0, sy, hf + 0.004);
  b.add(new THREE.PlaneGeometry(0.008, 0.008), 'reticleDot', 0, sy, hf + 0.0055);
  return { sightY: sy, eyeZ: z + 0.022, reticle: 'reticleDot' };
}

// Holographic sight: a rectangular hood you look straight through, battery body underneath.
function holoSight(b, railTop, z) {
  b.side([[z + 0.04, railTop], [z + 0.04, railTop + 0.011], [z + 0.033, railTop + 0.016], [z - 0.034, railTop + 0.016], [z - 0.038, railTop]], 0.034, 'polymer', { bevel: 0.002 });
  b.add(tube(0.005, 0.005, 0.009, 10), 'metal', 0.0195, railTop + 0.006, z + 0.008, 0, Math.PI / 2, 0);
  for (let i = 0; i < 2; i++) b.box(0.006, 0.0025, 0.005, 'rubber', 0, railTop + 0.0128 + 0.002, z + 0.026 + i * 0.008, -0.6);
  const h0 = railTop + 0.016;
  const hf = z - 0.036;
  const outer = [[-0.02, h0], [0.02, h0], [0.02, h0 + 0.026], [0.015, h0 + 0.032], [-0.015, h0 + 0.032], [-0.02, h0 + 0.026]];
  const win = [[-0.0166, h0 + 0.002], [0.0166, h0 + 0.002], [0.0166, h0 + 0.024], [0.0126, h0 + 0.0285], [-0.0126, h0 + 0.0285], [-0.0166, h0 + 0.024]];
  b.add(frontGeo(outer, [win], 0.05, 0.0015), 'polymer', 0, 0, hf);
  const sy = h0 + 0.01525;
  b.box(0.032, 0.026, 0.001, 'glass', 0, sy, hf + 0.006);
  b.box(0.032, 0.026, 0.001, 'glass', 0, sy, hf + 0.044);
  b.add(new THREE.PlaneGeometry(0.016, 0.016), 'reticleHolo', 0, sy, hf + 0.0072);
  return { sightY: sy, eyeZ: hf + 0.05, reticle: 'reticleHolo' };
}

// Rifle scope on two rings. Looking through it switches to the full-screen scope view.
function scopeSight(b, railTop, z, len, r, objR) {
  const y = railTop + objR + 0.009;
  const zr = z + len / 2;
  const zf = z - len / 2;
  const er = r * 1.3;
  b.tube(r, r, zr, zf, y, 'steel', { seg: 18 });
  b.tube(r, objR, zf, zf - 0.028, y, 'steel', { seg: 18 });
  b.tube(objR, objR, zf - 0.028, zf - 0.072, y, 'steel', { seg: 18 });
  b.tube(objR * 1.05, objR * 1.05, zf - 0.064, zf - 0.076, y, 'polymer', { seg: 18 });
  b.tube(er, r, zr + 0.026, zr, y, 'steel', { seg: 18 });
  b.tube(er, er, zr + 0.072, zr + 0.026, y, 'steel', { seg: 18 });
  b.tube(er * 1.06, er * 1.06, zr + 0.056, zr + 0.04, y, 'rubber', { seg: 18 });
  b.add(new THREE.CylinderGeometry(objR * 0.92, objR * 0.92, 0.002, 18), 'lens', 0, y, zf - 0.074, Math.PI / 2, 0, 0);
  b.add(new THREE.CylinderGeometry(er * 0.84, er * 0.84, 0.002, 18), 'lens', 0, y, zr + 0.071, Math.PI / 2, 0, 0);
  b.add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.014, 14), 'steel', 0, y + r + 0.006, z + 0.008);
  b.add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.014, 14), 'steel', r + 0.006, y, z + 0.008, 0, 0, Math.PI / 2);
  b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 12), 'steel', -r - 0.004, y, z + 0.008, 0, 0, Math.PI / 2);
  for (const rz of [z - len * 0.28, z + len * 0.3]) {
    b.add(frontGeo(circle(0, y, r + 0.0042), [circle(0, y, r + 0.0002)], 0.012, 0.0008), 'metal', 0, 0, rz - 0.006);
    const h = y - r - railTop + 0.002;
    b.box(0.018, h, 0.012, 'metal', 0, railTop + h / 2 - 0.001, rz);
  }
  return { sightY: y, eyeZ: zr + 0.072, reticle: null };
}

// AR-pattern trigger guard (between the magazine well and the grip).
function arGuard(b, zRear, zFront, yTop, depth = 0.022) {
  b.side([[zRear, yTop + 0.002], [zFront, yTop + 0.002], [zFront, yTop - depth], [zRear, yTop - depth]], 0.009, 'metal', {
    bevel: 0.001,
    holes: [[[zRear - 0.004, yTop], [zFront + 0.004, yTop], [zFront + 0.004, yTop - depth + 0.004], [zRear - 0.004, yTop - depth + 0.004]]],
  });
}

// Raked pistol grip: top edge from zFront to zRear at yTop, bottom `drop` lower and `rake` further back.
function pistolGrip(b, zFront, zRear, yTop, drop, rake, mat = 'polymer', width = 0.028) {
  const yb = yTop - drop;
  b.side([
    [zFront, yTop], [zRear, yTop], [zRear + 0.006, yTop - 0.008], [zRear + rake + 0.004, yb + 0.012], [zRear + rake, yb + 0.002],
    [zFront + rake + 0.008, yb], [zFront + rake + 0.002, yb + 0.008], [zFront + 0.004, yTop - 0.018],
  ], width, mat, { bevel: 0.0035 });
  // centre of the grip and its lean, for the hand
  return { p: [0, yTop - drop * 0.5, (zFront + zRear) / 2 + rake * 0.5 + 0.004], rake: Math.atan2(rake, drop) };
}

// ---- the guns --------------------------------------------------------------------------------

const BUILDERS = {
  pistol(b) {
    const slide = b.part(0, 0, 0);
    b.side([[0.046, 0.031], [0.046, 0.06], [0.04, 0.066], [-0.141, 0.066], [-0.149, 0.06], [-0.149, 0.031]], 0.027, 'metal', { parent: slide, bevel: 0.0022 });
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) b.box(0.0012, 0.022, 0.0016, 'steel', s * 0.0136, 0.047, 0.036 - i * 0.0042, 0, 0, 0, slide);
    b.box(0.0012, 0.011, 0.032, 'steel', 0.0136, 0.056, -0.022, 0, 0, 0, slide);
    // front post and a notched rear sight: the sight line runs over the post
    b.box(0.0034, 0.0068, 0.005, 'steel', 0, 0.0694, -0.137, 0, 0, 0, slide);
    b.box(0.0018, 0.0018, 0.0006, 'dot', 0, 0.0706, -0.1343, 0, 0, 0, slide);
    for (const s of [-1, 1]) {
      b.box(0.0085, 0.0072, 0.007, 'steel', s * 0.0073, 0.0696, 0.036, 0, 0, 0, slide);
      b.box(0.0018, 0.0018, 0.0006, 'dot', s * 0.0062, 0.07, 0.0397, 0, 0, 0, slide);
    }
    b.side([[0.046, 0.031], [0.046, 0.018], [-0.146, 0.018], [-0.146, 0.031]], 0.025, 'polymer', { bevel: 0.0015 });
    b.side([[0.016, 0.019], [-0.035, 0.019], [-0.035, 0.012], [-0.03, -0.018], [-0.022, -0.023], [0.006, -0.023], [0.022, -0.004], [0.022, 0.019]], 0.011, 'polymer', {
      bevel: 0.0012,
      holes: [[[0.012, 0.016], [-0.029, 0.016], [-0.025, -0.014], [-0.019, -0.018], [0.004, -0.018], [0.014, -0.006], [0.014, 0.016]]],
    });
    b.trigger(0.0, 0.016);
    b.side([[0.014, 0.019], [0.05, 0.019], [0.058, 0.012], [0.06, 0.004], [0.085, -0.083], [0.08, -0.09], [0.046, -0.09], [0.041, -0.083], [0.018, -0.004]], 0.03, 'polymer', { bevel: 0.0035 });
    b.tube(0.0062, 0.0062, -0.146, -0.151, 0.048, 'steel', { seg: 12 });
    b.tube(0.0038, 0.0038, -0.149, -0.1514, 0.048, 'rubber', { seg: 10 });
    const mag = b.part(0, -0.035, 0.047);
    b.box(0.02, 0.1, 0.026, 'steel', 0, 0, 0, -0.27, 0, 0, mag);
    b.box(0.03, 0.008, 0.039, 'polymer', 0, -0.059, 0.0165, 0, 0, 0, mag);
    return {
      parts: { slide, mag },
      muzzle: [0, 0.048, -0.153], eject: [0.015, 0.058, -0.022], sightY: 0.073,
      hands: { right: { type: 'fist', p: [0, -0.034, 0.048], rake: 0.27 }, left: { type: 'support', p: [-0.003, -0.046, 0.04], rake: 0.27 } },
      vm: { hip: [0.11, -0.125, -0.36], eye: 0.04, relief: 0.27 },
    };
  },

  revolver(b) {
    b.side([[0.034, 0.074], [-0.064, 0.074], [-0.067, 0.068], [-0.067, 0.024], [-0.034, 0.02], [-0.03, 0.014], [0.02, 0.014], [0.03, 0.028], [0.036, 0.05]], 0.03, 'steel', {
      bevel: 0.002,
      holes: [[[-0.004, 0.07], [-0.058, 0.07], [-0.058, 0.028], [-0.004, 0.028]]],
    });
    const drum = b.part(0, 0.049, -0.031);
    b.add(tube(0.0205, 0.0205, 0.05, 18), 'steel', 0, 0, 0, 0, 0, 0, drum);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + Math.PI / 6;
      b.add(box(0.0035, 0.0035, 0.03), 'rubber', Math.cos(a) * 0.0196, Math.sin(a) * 0.0196, -0.004, 0, 0, a, drum);
    }
    b.tube(0.0105, 0.0105, -0.066, -0.215, 0.052, 'steel', { seg: 16 });
    b.side([[-0.066, 0.046], [-0.212, 0.046], [-0.215, 0.04], [-0.212, 0.032], [-0.075, 0.03], [-0.066, 0.032]], 0.017, 'steel', { bevel: 0.0015 });
    b.box(0.0085, 0.006, 0.149, 'steel', 0, 0.0645, -0.1405);
    b.side([[-0.198, 0.067], [-0.2, 0.0776], [-0.207, 0.0776], [-0.212, 0.067]], 0.0034, 'steel', { bevel: 0 });
    b.box(0.0036, 0.0026, 0.002, 'dot', 0, 0.0756, -0.1995);
    for (const s of [-1, 1]) b.box(0.0075, 0.0038, 0.008, 'steel', s * 0.0066, 0.0759, 0.026);
    b.side([[0.034, 0.066], [0.046, 0.083], [0.054, 0.082], [0.046, 0.066], [0.04, 0.056]], 0.007, 'steel', { bevel: 0.001 });
    b.side([[0.022, 0.016], [-0.03, 0.016], [-0.028, -0.008], [-0.018, -0.016], [0.006, -0.016], [0.022, -0.002]], 0.009, 'steel', {
      bevel: 0.001,
      holes: [[[0.016, 0.013], [-0.024, 0.013], [-0.022, -0.006], [-0.015, -0.011], [0.004, -0.011], [0.016, -0.001]]],
    });
    b.trigger(-0.002, 0.014);
    b.side([[0.026, 0.026], [0.036, 0.05], [0.05, 0.05], [0.064, 0.036], [0.068, 0.0, 0.08, -0.062], [0.075, -0.07], [0.046, -0.07], [0.038, -0.064], [0.032, -0.02, 0.016, 0.012]], 0.033, 'wood', { bevel: 0.004 });
    return {
      parts: { mag: drum, drum },
      muzzle: [0, 0.052, -0.217], eject: null, sightY: 0.0777,
      hands: { right: { type: 'fist', p: [0, -0.018, 0.05], rake: 0.3 }, left: { type: 'support', p: [-0.003, -0.03, 0.042], rake: 0.3 } },
      vm: { hip: [0.11, -0.125, -0.36], eye: 0.03, relief: 0.27 },
    };
  },

  pdw(b) {
    b.side([[0.074, 0.068], [-0.166, 0.068], [-0.174, 0.06], [-0.174, 0.018], [-0.046, 0.016], [-0.04, 0.004], [0.028, 0.004], [0.062, 0.018], [0.074, 0.03]], 0.042, 'olive', { bevel: 0.004 });
    const railTop = b.rail(0.066, 0.064, -0.16, 0.02);
    const grip = pistolGrip(b, -0.028, 0.026, 0.006, 0.124, 0.018, 'polymer', 0.033);
    b.side([[-0.03, 0.006], [-0.074, 0.006], [-0.072, -0.03], [-0.064, -0.038], [-0.014, -0.038], [-0.012, -0.02]], 0.012, 'polymer', {
      bevel: 0.0012,
      holes: [[[-0.035, 0.002], [-0.068, 0.002], [-0.066, -0.026], [-0.06, -0.032], [-0.02, -0.032], [-0.019, -0.022], [-0.024, 0.002]]],
    });
    b.trigger(-0.042, 0.002);
    // folding vertical foregrip
    b.side([[-0.112, 0.018], [-0.146, 0.018], [-0.146, 0.006], [-0.142, -0.076], [-0.136, -0.082], [-0.122, -0.082], [-0.116, -0.076], [-0.112, 0.006]], 0.026, 'polymer', { bevel: 0.003 });
    b.tube(0.0085, 0.0085, -0.174, -0.212, 0.04, 'steel');
    b.tube(0.0115, 0.0115, -0.212, -0.248, 0.04, 'steel', { seg: 8 });
    for (const s of [-1, 1]) b.box(0.006, 0.008, 0.124, 'steel', s * 0.016, 0.03, 0.135);
    b.side([[0.19, 0.058], [0.206, 0.058], [0.21, 0.05], [0.21, -0.03], [0.204, -0.036], [0.192, -0.036], [0.19, -0.03]], 0.042, 'polymer', { bevel: 0.003 });
    b.box(0.036, 0.006, 0.01, 'polymer', 0, 0.058, 0.078);
    const mag = b.part(0, -0.05, 0.007);
    b.box(0.021, 0.16, 0.026, 'steel', 0, -0.02, 0, -0.15, 0, 0, mag);
    b.box(0.026, 0.008, 0.032, 'polymer', 0, -0.102, 0.014, -0.15, 0, 0, mag);
    const sight = reflexSight(b, railTop, -0.03);
    return {
      parts: { mag },
      muzzle: [0, 0.04, -0.25], eject: [0.022, 0.05, -0.04], sightY: sight.sightY, reticle: sight.reticle,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'fist', mirror: true, p: [0, -0.034, -0.129], rake: 0.04 } },
      vm: { hip: [0.15, -0.13, -0.32], eye: sight.eyeZ, relief: 0.11 },
    };
  },

  smg(b) {
    b.side([[0.074, 0.068], [-0.16, 0.068], [-0.166, 0.062], [-0.166, 0.018], [-0.1, 0.018], [-0.098, -0.016], [-0.052, -0.016], [-0.05, 0.018], [0.06, 0.018], [0.074, 0.03]], 0.036, 'metal', { bevel: 0.0025 });
    for (const s of [-1, 1]) b.box(0.0015, 0.004, 0.2, 'steel', s * 0.0182, 0.055, -0.045);
    const railTop = b.rail(0.068, 0.05, -0.12, 0.02);
    b.side([[-0.046, 0.018], [0.026, 0.018], [0.03, -0.028], [-0.036, -0.028], [-0.046, -0.01]], 0.026, 'polymer', {
      bevel: 0.002,
      holes: [[[-0.034, 0.012], [0.02, 0.012], [0.022, -0.022], [-0.028, -0.022]]],
    });
    const grip = pistolGrip(b, 0.024, 0.062, 0.018, 0.114, 0.022);
    b.trigger(0.002, 0.012);
    b.side([[-0.166, 0.06], [-0.272, 0.058], [-0.278, 0.05], [-0.278, 0.014], [-0.272, 0.01], [-0.166, 0.012]], 0.042, 'polymer', { bevel: 0.006 });
    b.box(0.012, 0.008, 0.014, 'metal', -0.024, 0.056, -0.205);
    b.tube(0.0205, 0.0205, -0.27, -0.44, 0.042, 'steel', { seg: 18 });
    b.tube(0.0175, 0.0175, -0.44, -0.446, 0.042, 'steel', { seg: 18 });
    for (const s of [-1, 1]) b.box(0.005, 0.009, 0.132, 'steel', s * 0.017, 0.036, 0.138);
    b.side([[0.198, 0.062], [0.212, 0.062], [0.216, 0.054], [0.216, -0.036], [0.21, -0.044], [0.2, -0.044], [0.198, -0.036]], 0.046, 'rubber', { bevel: 0.003 });
    const mag = b.part(0, -0.012, -0.075);
    b.side([[0.021, 0.004], [-0.021, 0.004], [-0.026, -0.1, -0.046, -0.19], [-0.008, -0.196], [0.01, -0.1, 0.021, 0.004]], 0.02, 'steel', { parent: mag, bevel: 0.002 });
    const sight = reflexSight(b, railTop, -0.035);
    return {
      parts: { mag },
      muzzle: [0, 0.042, -0.447], eject: [0.019, 0.05, -0.04], sightY: sight.sightY, reticle: sight.reticle,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'cup', p: [0, 0.035, -0.222], r: 0.023 } },
      vm: { hip: [0.15, -0.135, -0.33], eye: sight.eyeZ, relief: 0.11 },
    };
  },


  shotgun(b) {
    b.side([[0.064, 0.072], [-0.142, 0.072], [-0.148, 0.066], [-0.148, 0.014], [0.064, 0.014], [0.072, 0.03], [0.072, 0.062]], 0.038, 'metal', { bevel: 0.003 });
    b.box(0.0015, 0.014, 0.05, 'steel', 0.0193, 0.05, -0.03);
    b.side([[0.05, 0.016], [-0.034, 0.016], [-0.032, -0.022], [-0.022, -0.03], [0.028, -0.03], [0.05, -0.008]], 0.014, 'polymer', {
      bevel: 0.0015,
      holes: [[[0.04, 0.012], [-0.028, 0.012], [-0.026, -0.018], [-0.018, -0.024], [0.026, -0.024], [0.04, -0.008]]],
    });
    b.trigger(0.004, 0.014);
    const grip = pistolGrip(b, 0.044, 0.078, 0.016, 0.118, 0.032);
    b.tube(0.0118, 0.0118, -0.148, -0.6, 0.055, 'steel', { seg: 16 });
    b.box(0.0075, 0.004, 0.45, 'steel', 0, 0.0688, -0.373);
    for (let i = 0; i < 14; i++) b.box(0.004, 0.003, 0.004, 'steel', 0, 0.0655, -0.17 - i * 0.031);
    // ghost-ring sights: aperture on the receiver, protected post on the muzzle
    const gs = 0.094;
    b.box(0.03, 0.008, 0.03, 'metal', 0, 0.076, 0.03);
    for (const sx of [-1, 1]) b.side([[0.042, 0.08], [0.042, 0.1], [0.036, 0.104], [0.022, 0.104], [0.018, 0.08]], 0.004, 'metal', { x: sx * 0.0125, bevel: 0.0006 });
    b.add(frontGeo(circle(0, gs, 0.0068), [circle(0, gs, 0.0044)], 0.004, 0.0006), 'steel', 0, 0, 0.028);
    b.box(0.004, gs - 0.0068 - 0.08 + 0.001, 0.004, 'steel', 0, (gs - 0.0068 + 0.08) / 2, 0.03);
    b.box(0.012, 0.01, 0.03, 'metal', 0, 0.0718, -0.585);
    b.box(0.003, gs - 0.0768, 0.004, 'steel', 0, (gs + 0.0768) / 2, -0.585);
    b.box(0.0032, 0.0028, 0.0008, 'dot', 0, gs - 0.002, -0.5826);
    for (const sx of [-1, 1]) b.box(0.003, 0.024, 0.016, 'metal', sx * 0.0085, 0.0868, -0.585);
    b.tube(0.0105, 0.0105, -0.148, -0.55, 0.027, 'steel', { seg: 14 });
    b.tube(0.0122, 0.0122, -0.55, -0.566, 0.027, 'steel', { seg: 14 });
    b.side([[-0.5, 0.068], [-0.52, 0.068], [-0.52, 0.016], [-0.5, 0.016]], 0.03, 'metal', { bevel: 0.002 });
    const pump = b.part(0, 0, 0);
    b.side([[-0.196, 0.044], [-0.362, 0.044], [-0.368, 0.038], [-0.368, 0.012], [-0.362, 0.004], [-0.196, 0.004], [-0.19, 0.012], [-0.19, 0.038]], 0.048, 'polymer', { parent: pump, bevel: 0.004 });
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) b.box(0.0012, 0.03, 0.006, 'rubber', s * 0.0242, 0.024, -0.215 - i * 0.019, 0, 0, 0, pump);
    b.side([[0.072, 0.068], [0.32, 0.058], [0.332, 0.064], [0.338, 0.06], [0.338, -0.064], [0.322, -0.07], [0.2, -0.026], [0.12, -0.002], [0.072, 0.014]], 0.04, 'polymer', { bevel: 0.004 });
    b.side([[0.336, 0.062], [0.352, 0.062], [0.356, 0.054], [0.356, -0.062], [0.35, -0.07], [0.336, -0.066]], 0.044, 'rubber', { bevel: 0.003 });
    return {
      parts: { pump },
      muzzle: [0, 0.055, -0.602], eject: [0.02, 0.05, -0.03], sightY: 0.094,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'cup', p: [0, 0.024, -0.282], r: 0.023, on: 'pump' } },
      vm: { hip: [0.15, -0.14, -0.34], eye: 0.044, relief: 0.11 },
    };
  },

  ar(b) {
    b.side([[0.074, 0.06], [-0.128, 0.06], [-0.128, 0.016], [0.074, 0.012]], 0.032, 'metal', { bevel: 0.002 });
    b.box(0.0012, 0.012, 0.042, 'steel', 0.0166, 0.04, -0.008);
    b.add(tube(0.006, 0.006, 0.014, 10), 'metal', 0.019, 0.047, 0.05, 0.35, 0, 0);
    const railTop = b.rail(0.06, 0.07, -0.128, 0.021);
    b.side([[0.07, 0.012], [0.07, -0.002], [0.052, -0.016], [-0.026, -0.016], [-0.03, -0.044], [-0.1, -0.044], [-0.104, -0.008], [-0.122, 0.004], [-0.122, 0.012]], 0.03, 'metal', { bevel: 0.002 });
    arGuard(b, 0.036, -0.026, -0.016);
    b.trigger(0.004, -0.016);
    const grip = pistolGrip(b, 0.034, 0.066, -0.012, 0.114, 0.036);
    b.side([[-0.122, 0.06], [-0.37, 0.06], [-0.374, 0.054], [-0.374, 0.016], [-0.37, 0.01], [-0.122, 0.01]], 0.046, 'tan', { bevel: 0.006 });
    b.rail(0.06, -0.13, -0.368, 0.021, 'tan');
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.box(0.0012, 0.008, 0.026, 'polymer', s * 0.0231, 0.035, -0.16 - i * 0.052);
    b.tube(0.0085, 0.0085, -0.374, -0.5, 0.036, 'steel');
    b.tube(0.0112, 0.0112, -0.5, -0.548, 0.036, 'steel', { seg: 8 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      b.box(0.0022, 0.003, 0.03, 'rubber', Math.cos(a) * 0.0108, 0.036 + Math.sin(a) * 0.0108, -0.53, 0, 0, a);
    }
    b.tube(0.0145, 0.0145, 0.24, 0.07, 0.036, 'metal', { seg: 14 });
    b.side([[0.128, 0.06], [0.256, 0.06], [0.262, 0.066], [0.268, 0.062], [0.268, -0.058], [0.256, -0.062], [0.24, -0.06], [0.156, 0.0], [0.132, 0.018], [0.128, 0.04]], 0.038, 'tan', { bevel: 0.004 });
    b.side([[0.266, 0.064], [0.278, 0.064], [0.282, 0.056], [0.282, -0.056], [0.276, -0.064], [0.266, -0.062]], 0.04, 'rubber', { bevel: 0.003 });
    b.box(0.04, 0.006, 0.012, 'metal', 0, 0.056, 0.078);
    const mag = b.part(0, -0.032, -0.065);
    b.side([[0.031, 0.006], [-0.031, 0.006], [-0.034, -0.09, -0.05, -0.17], [-0.052, -0.178], [0.012, -0.178], [0.014, -0.17], [0.03, -0.09, 0.031, 0.006]], 0.024, 'polymer', { parent: mag, bevel: 0.002 });
    b.box(0.028, 0.007, 0.07, 'polymer', 0, -0.181, -0.02, 0, 0, 0, mag);
    const sight = holoSight(b, railTop, -0.03);
    return {
      parts: { mag },
      muzzle: [0, 0.036, -0.55], eject: [0.018, 0.042, -0.006], sightY: sight.sightY, reticle: sight.reticle,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'cup', p: [0, 0.035, -0.27], r: 0.025 } },
      vm: { hip: [0.15, -0.14, -0.33], eye: sight.eyeZ, relief: 0.11 },
    };
  },

  ak(b) {
    b.side([[0.074, 0.058], [-0.156, 0.058], [-0.16, 0.052], [-0.16, 0.014], [-0.1, 0.012], [-0.1, -0.004], [-0.032, -0.004], [-0.03, 0.012], [0.074, 0.016]], 0.031, 'metal', { bevel: 0.0018 });
    const railTop = b.rail(0.058, 0.07, -0.15, 0.021);
    b.box(0.0012, 0.005, 0.11, 'steel', 0.0161, 0.028, -0.04);
    b.box(0.012, 0.008, 0.01, 'steel', 0.022, 0.048, -0.108);
    b.side([[0.02, 0.05], [-0.07, 0.044], [-0.074, 0.036], [0.018, 0.04]], 0.002, 'steel', { x: 0.0165, bevel: 0 });
    b.side([[0.03, 0.012], [-0.032, 0.012], [-0.03, -0.026], [-0.022, -0.03], [0.024, -0.03], [0.03, -0.012]], 0.011, 'metal', {
      bevel: 0.001,
      holes: [[[0.025, 0.006], [-0.026, 0.006], [-0.024, -0.022], [-0.019, -0.025], [0.02, -0.025], [0.025, -0.012]]],
    });
    b.trigger(0.0, 0.008);
    const grip = pistolGrip(b, 0.032, 0.064, 0.014, 0.12, 0.026);
    b.side([[-0.16, 0.058], [-0.334, 0.058], [-0.34, 0.05], [-0.336, 0.004], [-0.16, 0.004]], 0.05, 'wood', { bevel: 0.006 });
    b.side([[-0.17, 0.082], [-0.322, 0.082], [-0.328, 0.064], [-0.17, 0.062]], 0.034, 'wood', { bevel: 0.005 });
    b.tube(0.0095, 0.0095, -0.16, -0.334, 0.07, 'metal', { seg: 12 });
    b.side([[-0.334, 0.08], [-0.352, 0.08], [-0.352, 0.024], [-0.334, 0.024]], 0.024, 'steel', { bevel: 0.002 });
    b.tube(0.0085, 0.0085, -0.334, -0.47, 0.036, 'steel');
    b.side([[-0.43, 0.048], [-0.448, 0.048], [-0.448, 0.022], [-0.43, 0.022]], 0.022, 'steel', { bevel: 0.0015 });
    b.side([[-0.436, 0.048], [-0.44, 0.072], [-0.444, 0.072], [-0.446, 0.048]], 0.003, 'steel', { bevel: 0 });
    b.tube(0.0128, 0.0128, -0.47, -0.512, 0.036, 'steel', { seg: 10 });
    for (const s of [-1, 1]) b.box(0.002, 0.008, 0.024, 'rubber', s * 0.0122, 0.036, -0.49);
    b.side([[0.074, 0.054], [0.1, 0.05], [0.326, 0.02], [0.336, 0.026], [0.34, 0.02], [0.34, -0.086], [0.326, -0.092], [0.2, -0.05, 0.074, -0.006]], 0.038, 'wood', { bevel: 0.005 });
    b.side([[0.338, 0.024], [0.346, 0.024], [0.346, -0.088], [0.338, -0.09]], 0.04, 'steel', { bevel: 0.001 });
    const mag = b.part(0, -0.002, -0.066);
    b.side([[0.034, 0.008], [-0.034, 0.008], [-0.05, -0.11, -0.112, -0.196], [-0.104, -0.21], [-0.064, -0.222], [-0.054, -0.212], [0.0, -0.12, 0.034, 0.008]], 0.026, 'bakelite', { parent: mag, bevel: 0.0025 });
    const sight = reflexSight(b, railTop, -0.03);
    return {
      parts: { mag },
      muzzle: [0, 0.036, -0.514], eject: [0.019, 0.044, -0.04], sightY: sight.sightY, reticle: sight.reticle,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'cup', p: [0, 0.024, -0.255], r: 0.025 } },
      vm: { hip: [0.15, -0.14, -0.33], eye: sight.eyeZ, relief: 0.11 },
    };
  },

  dmr(b) {
    b.side([[0.078, 0.062], [-0.14, 0.062], [-0.14, 0.016], [0.078, 0.012]], 0.034, 'metal', { bevel: 0.002 });
    b.box(0.0012, 0.013, 0.05, 'steel', 0.0176, 0.041, -0.01);
    const railTop = b.rail(0.062, 0.074, -0.14, 0.021);
    b.side([[0.074, 0.012], [0.074, -0.002], [0.056, -0.018], [-0.028, -0.018], [-0.032, -0.048], [-0.108, -0.048], [-0.112, -0.01], [-0.132, 0.004], [-0.132, 0.012]], 0.032, 'metal', { bevel: 0.002 });
    arGuard(b, 0.038, -0.028, -0.018);
    b.trigger(0.004, -0.018);
    const grip = pistolGrip(b, 0.036, 0.068, -0.014, 0.114, 0.036);
    b.side([[-0.134, 0.062], [-0.44, 0.062], [-0.444, 0.056], [-0.444, 0.014], [-0.44, 0.008], [-0.134, 0.008]], 0.05, 'olive', { bevel: 0.007 });
    b.rail(0.062, -0.142, -0.44, 0.021, 'olive');
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.box(0.0012, 0.009, 0.03, 'polymer', s * 0.0251, 0.035, -0.17 - i * 0.055);
    b.tube(0.0095, 0.0095, -0.444, -0.62, 0.036, 'steel');
    b.tube(0.0135, 0.0135, -0.62, -0.676, 0.036, 'steel', { seg: 10 });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.box(0.002, 0.009, 0.008, 'rubber', s * 0.0128, 0.036, -0.632 - k * 0.015);
    b.tube(0.0145, 0.0145, 0.24, 0.074, 0.036, 'metal', { seg: 14 });
    b.side([[0.12, 0.072], [0.27, 0.072], [0.278, 0.066], [0.282, 0.066], [0.282, -0.066], [0.268, -0.072], [0.25, -0.07], [0.19, -0.03], [0.15, -0.006], [0.12, 0.02]], 0.04, 'olive', { bevel: 0.004 });
    b.side([[0.28, 0.068], [0.292, 0.068], [0.296, 0.06], [0.296, -0.062], [0.29, -0.07], [0.28, -0.068]], 0.042, 'rubber', { bevel: 0.003 });
    b.box(0.04, 0.006, 0.012, 'metal', 0, 0.058, 0.082);
    const mag = b.part(0, -0.036, -0.07);
    b.side([[0.036, 0.006], [-0.036, 0.006], [-0.04, -0.105], [-0.036, -0.112], [0.034, -0.112], [0.038, -0.105]], 0.026, 'polymer', { parent: mag, bevel: 0.002 });
    const sight = scopeSight(b, railTop, -0.035, 0.2, 0.0155, 0.024);
    return {
      parts: { mag },
      muzzle: [0, 0.036, -0.678], eject: [0.018, 0.044, -0.01], sightY: sight.sightY, scope: true,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'cup', p: [0, 0.035, -0.3], r: 0.027 } },
      vm: { hip: [0.155, -0.145, -0.34], eye: sight.eyeZ, relief: 0.08 },
    };
  },

  sniper(b) {
    b.side([
      [-0.37, 0.046], [-0.06, 0.046], [0.02, 0.042], [0.06, 0.034], [0.1, 0.05], [0.33, 0.054], [0.342, 0.06], [0.348, 0.056], [0.348, -0.076], [0.336, -0.082],
      [0.22, -0.056, 0.14, -0.06], [0.124, -0.104], [0.096, -0.106], [0.086, -0.098], [0.046, -0.034], [0.02, -0.03], [-0.04, -0.024], [-0.37, 0.014],
    ], 0.044, 'wood', { bevel: 0.005, holes: [[[-0.026, 0.01], [0.022, 0.01], [0.026, -0.006], [0.02, -0.018], [-0.022, -0.016]]] });
    b.trigger(0.004, 0.012);
    b.tube(0.0165, 0.0165, 0.075, -0.13, 0.05, 'steel', { seg: 16 });
    b.tube(0.011, 0.011, 0.1, 0.075, 0.05, 'steel', { seg: 12 });
    b.tube(0.0135, 0.0105, -0.13, -0.62, 0.05, 'steel', { seg: 16 });
    b.tube(0.0145, 0.0145, -0.62, -0.672, 0.05, 'steel', { seg: 10 });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.box(0.002, 0.01, 0.008, 'rubber', s * 0.0138, 0.05, -0.632 - k * 0.014);
    // bipod folded flat under the barrel
    b.box(0.026, 0.012, 0.03, 'steel', 0, 0.016, -0.33);
    for (const s of [-1, 1]) b.box(0.006, 0.006, 0.2, 'steel', s * 0.01, 0.026, -0.44);
    const railTop = b.rail(0.0645, 0.07, -0.12, 0.018);
    const bolt = b.part(0, 0.05, 0.052);
    const shaft = tube(0.004, 0.004, 0.038, 8);
    shaft.rotateY(Math.PI / 2);
    shaft.rotateZ(-0.3);
    b.add(shaft, 'steel', 0.0182, -0.0056, 0, 0, 0, 0, bolt);
    b.add(new THREE.SphereGeometry(0.0085, 12, 8), 'steel', 0.039, -0.013, 0, 0, 0, 0, bolt);
    const mag = b.part(0, 0.012, -0.06);
    b.side([[0.03, 0.004], [-0.03, 0.004], [-0.03, -0.054], [-0.026, -0.06], [0.026, -0.06], [0.03, -0.054]], 0.03, 'steel', { parent: mag, bevel: 0.002 });
    const sight = scopeSight(b, railTop, -0.03, 0.3, 0.016, 0.027);
    return {
      parts: { mag, bolt },
      muzzle: [0, 0.05, -0.674], eject: [0.03, 0.06, 0.0], sightY: sight.sightY, scope: true,
      hands: { right: { type: 'fist', p: [0, -0.066, 0.1], rake: 0.27 }, left: { type: 'cup', p: [0, 0.03, -0.25], r: 0.022 } },
      vm: { hip: [0.16, -0.15, -0.36], eye: sight.eyeZ, relief: 0.08 },
    };
  },

  lever(b) {
    b.side([[0.05, 0.068], [-0.118, 0.068], [-0.124, 0.062], [-0.124, 0.012], [-0.02, 0.008], [0.04, 0.008], [0.05, 0.028]], 0.036, 'steel', { bevel: 0.0025 });
    b.box(0.0012, 0.016, 0.04, 'metal', 0.0185, 0.03, -0.07);
    b.side([[0.044, 0.06], [0.052, 0.072], [0.06, 0.073], [0.056, 0.062], [0.05, 0.052]], 0.007, 'steel', { bevel: 0.001 });
    b.tube(0.0115, 0.0105, -0.124, -0.6, 0.054, 'steel', { seg: 8 });
    b.tube(0.0095, 0.0095, -0.124, -0.55, 0.03, 'steel', { seg: 12 });
    b.side([[-0.53, 0.068], [-0.546, 0.068], [-0.546, 0.019], [-0.53, 0.019]], 0.026, 'steel', { bevel: 0.002 });
    b.side([[-0.586, 0.064], [-0.59, 0.082], [-0.596, 0.082], [-0.6, 0.064]], 0.003, 'steel', { bevel: 0 });
    b.add(new THREE.SphereGeometry(0.0017, 8, 6), 'dot', 0, 0.0806, -0.5895);
    b.box(0.022, 0.004, 0.008, 'steel', 0, 0.0665, -0.24);
    for (const s of [-1, 1]) b.side([[-0.237, 0.066], [-0.237, 0.084], [-0.243, 0.084], [-0.243, 0.066]], 0.0075, 'steel', { x: s * 0.0066, bevel: 0.0006 });
    b.side([[-0.124, 0.046], [-0.36, 0.046], [-0.366, 0.04], [-0.366, 0.016], [-0.36, 0.01], [-0.124, 0.01]], 0.042, 'wood', { bevel: 0.006 });
    b.side([[0.05, 0.064], [0.11, 0.052], [0.33, 0.034], [0.338, 0.04], [0.344, 0.034], [0.344, -0.092], [0.332, -0.098], [0.16, -0.04, 0.06, 0.0], [0.05, 0.01]], 0.038, 'wood', { bevel: 0.005 });
    b.side([[0.342, 0.038], [0.35, 0.038], [0.35, -0.094], [0.342, -0.096]], 0.04, 'steel', { bevel: 0.001 });
    b.trigger(0.036, 0.008);
    // lever loop: swings down and forward from its front pivot when cycling
    const lever = b.part(0, 0.006, -0.016);
    b.side([[0.0, 0.003], [0.062, 0.003], [0.074, -0.006], [0.098, -0.03], [0.1, -0.046], [0.09, -0.056], [0.07, -0.056], [0.05, -0.04], [0.03, -0.02], [0.0, -0.008], [-0.006, -0.003]], 0.007, 'steel', {
      parent: lever,
      bevel: 0.0012,
      holes: [[[0.058, -0.012], [0.084, -0.032], [0.086, -0.042], [0.078, -0.047], [0.064, -0.045], [0.048, -0.03], [0.044, -0.016]]],
    });
    return {
      parts: { lever },
      muzzle: [0, 0.054, -0.602], eject: [0, 0.07, -0.03], sightY: 0.083,
      hands: { right: { type: 'fist', p: [0, -0.004, 0.09], rake: 0.55 }, left: { type: 'cup', p: [0, 0.028, -0.25], r: 0.021 } },
      vm: { hip: [0.15, -0.14, -0.34], eye: 0.05, relief: 0.1 },
    };
  },

  lmg(b) {
    b.side([[0.09, 0.076], [-0.172, 0.076], [-0.18, 0.068], [-0.18, 0.012], [0.09, 0.012]], 0.058, 'metal', { bevel: 0.003 });
    b.side([[0.068, 0.09], [-0.118, 0.09], [-0.128, 0.076], [0.074, 0.076]], 0.054, 'polymer', { bevel: 0.003 });
    const railTop = b.rail(0.09, 0.064, -0.11, 0.021);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      b.tube(0.0042, 0.0042, -0.045, -0.08, 0.058 - t * 0.064, 'brass', { x: -0.031 - t * 0.026, seg: 8 });
    }
    b.side([[0.046, 0.014], [-0.03, 0.014], [-0.028, -0.024], [-0.02, -0.03], [0.04, -0.03], [0.046, -0.012]], 0.012, 'metal', {
      bevel: 0.0012,
      holes: [[[0.04, 0.008], [-0.024, 0.008], [-0.022, -0.02], [-0.016, -0.024], [0.034, -0.024], [0.04, -0.012]]],
    });
    b.trigger(0.004, 0.01);
    const grip = pistolGrip(b, 0.044, 0.078, 0.014, 0.116, 0.034);
    b.side([[-0.18, 0.068], [-0.39, 0.066], [-0.396, 0.06], [-0.396, 0.016], [-0.39, 0.012], [-0.18, 0.012]], 0.052, 'olive', { bevel: 0.006 });
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.box(0.0012, 0.03, 0.014, 'rubber', s * 0.0261, 0.04, -0.2 - i * 0.038);
    b.tube(0.012, 0.012, -0.396, -0.6, 0.04, 'steel');
    b.tube(0.0155, 0.0155, -0.6, -0.642, 0.04, 'steel', { seg: 8 });
    b.side([[-0.2, 0.066], [-0.21, 0.098], [-0.29, 0.098], [-0.3, 0.066]], 0.012, 'polymer', {
      bevel: 0.002,
      holes: [[[-0.214, 0.069], [-0.222, 0.09], [-0.278, 0.09], [-0.286, 0.069]]],
    });
    b.box(0.03, 0.012, 0.03, 'steel', 0, 0.006, -0.37);
    for (const s of [-1, 1]) b.box(0.006, 0.006, 0.2, 'steel', s * 0.012, 0.02, -0.48);
    b.side([[0.09, 0.072], [0.31, 0.06], [0.322, 0.066], [0.326, 0.06], [0.326, -0.07], [0.312, -0.076], [0.2, -0.026], [0.13, 0.0], [0.09, 0.012]], 0.04, 'polymer', {
      bevel: 0.004,
      holes: [[[0.13, 0.058], [0.29, 0.05], [0.29, -0.042], [0.22, -0.012], [0.15, 0.012], [0.13, 0.03]]],
    });
    const mag = b.part(-0.012, -0.012, -0.065);
    b.side([[0.056, 0.0], [-0.056, 0.0], [-0.056, -0.104], [-0.05, -0.11], [0.05, -0.11], [0.056, -0.104]], 0.074, 'olive', { parent: mag, bevel: 0.004 });
    b.box(0.076, 0.004, 0.08, 'polymer', 0, -0.05, 0, 0, 0, 0, mag);
    const sight = holoSight(b, railTop, -0.02);
    return {
      parts: { mag },
      muzzle: [0, 0.04, -0.644], eject: [0.03, 0.02, -0.02], sightY: sight.sightY, reticle: sight.reticle,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'cup', p: [0, 0.04, -0.29], r: 0.027 } },
      vm: { hip: [0.16, -0.155, -0.36], eye: sight.eyeZ, relief: 0.11 },
    };
  },

  helios(b) {
    b.side([[0.09, 0.08], [0.02, 0.098], [-0.15, 0.098], [-0.2, 0.084], [-0.25, 0.06], [-0.25, 0.012], [-0.14, 0.0], [-0.03, -0.006], [0.0, 0.004], [0.06, 0.0], [0.09, 0.02]], 0.07, 'metal', { bevel: 0.006 });
    for (const s of [-1, 1]) b.side([[0.05, 0.07], [-0.14, 0.078], [-0.2, 0.062], [-0.2, 0.056], [-0.14, 0.07], [0.05, 0.064]], 0.002, 'glow', { x: s * 0.0355, bevel: 0 });
    b.box(0.03, 0.004, 0.14, 'glow', 0, 0.0995, -0.06);
    const dish = new THREE.LatheGeometry([[0.024, 0.006], [0.028, 0.0], [0.08, 0.066], [0.076, 0.072], [0.022, 0.01]].map(([r, h]) => new THREE.Vector2(r, h)), 24);
    dish.rotateX(-Math.PI / 2);
    b.add(dish, 'metal', 0, 0.038, -0.25);
    for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(0.04 - k * 0.006, 0.005, 8, 24), 'glow', 0, 0.038, -0.262 - k * 0.018);
    b.tube(0.012, 0.012, -0.24, -0.33, 0.038, 'steel');
    b.side([[0.042, 0.004], [-0.03, 0.004], [-0.028, -0.024], [-0.02, -0.03], [0.036, -0.03], [0.042, -0.01]], 0.012, 'metal', {
      bevel: 0.0012,
      holes: [[[0.036, -0.002], [-0.024, -0.002], [-0.022, -0.02], [-0.016, -0.024], [0.03, -0.024], [0.036, -0.012]]],
    });
    b.trigger(0.004, -0.002);
    const grip = pistolGrip(b, 0.04, 0.074, 0.002, 0.11, 0.03);
    const mag = b.part(0.05, 0.03, 0.03);
    b.add(tube(0.026, 0.026, 0.11, 16), 'olive', 0, 0, 0, 0, 0, 0, mag);
    b.add(tube(0.0265, 0.0265, 0.03, 16), 'glow', 0, 0, 0, 0, 0, 0, mag);
    b.box(0.012, 0.022, 0.012, 'metal', 0, 0.108, -0.04);
    const sy = 0.1285;
    b.add(new THREE.TorusGeometry(0.0175, 0.0016, 6, 36), 'glow', 0, sy, -0.04);
    return {
      parts: { mag },
      muzzle: [0, 0.038, -0.33], eject: null, sightY: sy,
      hands: { right: { type: 'fist', ...grip }, left: { type: 'cup', p: [0, 0.03, -0.17], r: 0.034 } },
      vm: { hip: [0.16, -0.15, -0.34], eye: -0.04, relief: 0.16 },
    };
  },
};

export function buildGun(modelName) {
  const b = new GunBuilder();
  const info = BUILDERS[modelName](b);
  b.finish();
  const parts = info.parts || {};
  const box3 = new THREE.Box3().setFromObject(b.group);
  const out = {
    group: b.group,
    skinnable: b.skinnable,
    muzzle: new THREE.Vector3(...info.muzzle),
    eject: info.eject ? new THREE.Vector3(...info.eject) : null,
    sightY: info.sightY,
    reticle: info.reticle || null,
    scope: !!info.scope,
    hands: info.hands,
    vm: info.vm,
    len: box3.max.z - box3.min.z,
    center: (box3.max.z + box3.min.z) / 2,
    mag: parts.mag || null, slide: parts.slide || null, bolt: parts.bolt || null, pump: parts.pump || null, lever: parts.lever || null, drum: parts.drum || null,
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
