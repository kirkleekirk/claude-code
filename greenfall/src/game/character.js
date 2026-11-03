// Stylized character rig built from primitives, with procedural animation and
// cosmetic customization (outfit, back bling, harvest tool, glider, weapon wraps).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, plaidTexture } from '../world/textures.js';
import { clamp, lerp } from '../core/math.js';

const matCache = new Map();
export function M(color, opts = {}) {
  const key = color + '|' + (opts.rough ?? 0.75) + '|' + (opts.metal ?? 0) + '|' + (opts.emissive ?? 0) + '|' + (opts.map ? opts.map.uuid : '');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0, map: opts.map || null });
  if (opts.emissive) { m.emissive = new THREE.Color(color); m.emissiveIntensity = opts.emissive; }
  matCache.set(key, m);
  return m;
}
const G = {
  rbox: (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)),
  cap: (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10),
  sph: (r, ws = 16, hs = 12, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest),
  cyl: (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
};
const geoCache = new Map();
export function torsoGeo(b = 1) {
  const pts = [[0.15, 0], [0.175, 0.06], [0.2, 0.2], [0.225, 0.34], [0.232, 0.42], [0.2, 0.5], [0.12, 0.55], [0.0, 0.56]].map(([r, y]) => new THREE.Vector2(r * b, y));
  const g = new THREE.LatheGeometry(pts, 18);
  g.scale(1, 1, 0.62);
  return g;
}
export function pelvisGeo() {
  const pts = [[0.0, -0.13], [0.12, -0.12], [0.17, -0.06], [0.18, 0.04], [0.16, 0.12], [0.0, 0.13]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 16);
  g.scale(1, 1, 0.7);
  return g;
}
function cg(key, fn) { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); }

const faceCache = new Map();
export function faceTexture(style = 'default', eye = '#2a1a10') {
  const key = style + eye;
  if (faceCache.has(key)) return faceCache.get(key);
  const t = canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h);
    const cx = w * 0.25, cy = h * 0.53;
    if (style === 'sack') {
      c.fillStyle = '#c8a870'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(cx - 50, cy - 18); c.lineTo(cx - 22, cy - 18); c.moveTo(cx + 22, cy - 18); c.lineTo(cx + 50, cy - 18); c.stroke();
      c.beginPath(); for (let i = -45; i <= 45; i += 10) { c.moveTo(cx + i, cy + 30); c.lineTo(cx + i + 5, cy + 40); } c.stroke();
      c.beginPath(); c.moveTo(cx - 48, cy + 34); c.lineTo(cx + 48, cy + 34); c.stroke();
      return;
    }
    if (style === 'pumpkin') {
      c.fillStyle = '#e07a1a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd040';
      c.beginPath(); c.moveTo(cx - 45, cy - 5); c.lineTo(cx - 25, cy - 35); c.lineTo(cx - 10, cy - 5); c.fill();
      c.beginPath(); c.moveTo(cx + 45, cy - 5); c.lineTo(cx + 25, cy - 35); c.lineTo(cx + 10, cy - 5); c.fill();
      c.beginPath(); c.moveTo(cx - 50, cy + 15); c.lineTo(cx + 50, cy + 15); c.lineTo(cx + 30, cy + 45); c.lineTo(cx - 30, cy + 45); c.fill();
      return;
    }
    // eyes
    for (const s of [-1, 1]) {
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(cx + s * 26, cy - 8, 13, 16, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = eye;
      c.beginPath(); c.ellipse(cx + s * 26 + s * 1, cy - 6, 8, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(cx + s * 26 + 3, cy - 10, 3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2a1a10'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx + s * 14, cy - 32 + (style === 'angry' ? s * -4 : 0)); c.lineTo(cx + s * 40, cy - 34 - (style === 'angry' ? s * -6 : 0)); c.stroke();
    }
    c.strokeStyle = '#6a2a20'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath();
    if (style === 'grin') c.arc(cx, cy + 18, 18, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (style === 'angry') { c.moveTo(cx - 12, cy + 30); c.lineTo(cx + 12, cy + 28); }
    else c.arc(cx, cy + 14, 13, 0.2 * Math.PI, 0.8 * Math.PI);
    c.stroke();
    if (style === 'beard') { c.fillStyle = 'rgba(70,40,20,0.85)'; c.beginPath(); c.ellipse(cx, cy + 40, 46, 30, 0, 0, Math.PI); c.fill(); }
  });
  faceCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Weapon / tool models (shared between player, bots, loot pickups)
// ---------------------------------------------------------------------------
export const RARITY_COLORS = [0xb0b4b8, 0x5fcf3a, 0x3a9ae8, 0xb54ae8, 0xf0a020, 0xf2d24a];
export function buildWeaponModel(kind, rarity = 0, wrap = null) {
  const g = new THREE.Group();
  const body = M(wrap ? wrap.base : 0x3a3d42, { rough: 0.5, metal: 0.4 });
  const accent = M(wrap ? wrap.accent : RARITY_COLORS[rarity] ?? 0xb0b4b8, { rough: 0.45, metal: 0.2, emissive: wrap?.glow ? 0.4 : 0 });
  const wood = M(0x7a4a2a, { rough: 0.8 });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  switch (kind) {
    case 'ar': {
      add(G.box(0.07, 0.11, 0.55), body, 0, 0, 0.12);
      add(G.box(0.05, 0.05, 0.4), body, 0, 0.02, 0.55);
      add(G.box(0.06, 0.16, 0.08), accent, 0, -0.1, 0.18, 0.25);
      add(G.box(0.06, 0.12, 0.06), body, 0, -0.08, 0.0, -0.2);
      add(G.box(0.06, 0.1, 0.25), accent, 0, -0.01, -0.22);
      add(G.box(0.03, 0.05, 0.12), body, 0, 0.09, 0.15);
      break;
    }
    case 'smg': {
      add(G.box(0.07, 0.1, 0.38), body, 0, 0, 0.1);
      add(G.box(0.04, 0.04, 0.18), body, 0, 0.02, 0.36);
      add(G.box(0.05, 0.2, 0.06), accent, 0, -0.13, 0.12);
      add(G.box(0.05, 0.1, 0.05), body, 0, -0.07, -0.02, -0.2);
      add(G.box(0.05, 0.06, 0.14), accent, 0, 0.0, -0.14);
      break;
    }
    case 'shotgun': {
      add(G.box(0.07, 0.09, 0.45), body, 0, 0, 0.18);
      add(G.cyl(0.03, 0.03, 0.55, 8), body, 0, 0.02, 0.5, Math.PI / 2);
      add(G.box(0.08, 0.07, 0.18), wood, 0, -0.04, 0.45);
      add(G.box(0.06, 0.12, 0.3), accent, 0, -0.05, -0.18, 0.15);
      break;
    }
    case 'sniper': {
      add(G.box(0.06, 0.09, 0.6), body, 0, 0, 0.18);
      add(G.cyl(0.022, 0.022, 0.6, 8), body, 0, 0.01, 0.75, Math.PI / 2);
      add(G.cyl(0.04, 0.04, 0.32, 10), M(0x1a1a1a, { rough: 0.3, metal: 0.6 }), 0, 0.1, 0.2, Math.PI / 2);
      add(G.box(0.06, 0.13, 0.32), accent, 0, -0.05, -0.2, 0.12);
      break;
    }
    case 'pistol': {
      add(G.box(0.05, 0.08, 0.22), body, 0, 0.02, 0.06);
      add(G.box(0.045, 0.14, 0.06), accent, 0, -0.07, -0.02, 0.25);
      break;
    }
    case 'revolver': {
      add(G.box(0.05, 0.07, 0.26), body, 0, 0.03, 0.1);
      add(G.cyl(0.04, 0.04, 0.07, 8), body, 0, 0.02, 0.0, Math.PI / 2);
      add(G.box(0.045, 0.14, 0.06), wood, 0, -0.07, -0.05, 0.3);
      add(G.box(0.02, 0.02, 0.05), accent, 0, 0.07, 0.2);
      break;
    }
    case 'crossbow': {
      add(G.box(0.06, 0.08, 0.6), wood, 0, 0, 0.1);
      add(G.box(0.7, 0.04, 0.04), accent, 0, 0.03, 0.38);
      add(G.box(0.05, 0.12, 0.06), body, 0, -0.08, 0.0, 0.2);
      break;
    }
    case 'grenade': add(G.sph(0.07, 10, 8), M(0x3a5a2a), 0, 0, 0); add(G.box(0.03, 0.05, 0.03), body, 0, 0.08, 0); break;
    case 'molotov': add(G.cyl(0.04, 0.05, 0.18, 8), M(0x8a5a2a, { rough: 0.2 }), 0, 0, 0); add(G.box(0.03, 0.08, 0.03), M(0xe8e0d0), 0, 0.12, 0); break;
    case 'noisemaker': add(G.cyl(0.07, 0.07, 0.06, 12), M(0xc0392b), 0, 0, 0, Math.PI / 2); add(G.sph(0.03), M(0xd4b04a, { metal: 0.6 }), -0.04, 0.07, 0); add(G.sph(0.03), M(0xd4b04a, { metal: 0.6 }), 0.04, 0.07, 0); break;
    case 'machete': add(G.box(0.02, 0.06, 0.5), M(0xc8ccd0, { metal: 0.8, rough: 0.3 }), 0, 0, 0.3); add(G.box(0.04, 0.05, 0.13), accent, 0, 0, -0.02); break;
    default: add(G.box(0.08, 0.08, 0.2), accent, 0, 0, 0);
  }
  return g;
}

export function buildPickaxeModel(style = 'shovel') {
  const g = new THREE.Group();
  const handle = M(0x7a5232, { rough: 0.8 });
  const metal = M(0x9aa0a8, { rough: 0.35, metal: 0.7 });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
  switch (style) {
    case 'pitchfork':
      add(G.cyl(0.025, 0.025, 1.2, 6), handle, 0, 0.35, 0);
      add(G.box(0.3, 0.04, 0.03), metal, 0, 0.95, 0);
      for (const x of [-0.13, 0, 0.13]) add(G.cyl(0.012, 0.006, 0.32, 5), metal, x, 1.12, 0);
      break;
    case 'axe':
      add(G.cyl(0.028, 0.03, 0.9, 6), handle, 0, 0.25, 0);
      add(G.box(0.05, 0.16, 0.26), M(0xc0392b, { rough: 0.4, metal: 0.3 }), 0, 0.64, 0.1);
      add(G.box(0.02, 0.18, 0.06), metal, 0, 0.64, 0.25);
      break;
    case 'sickle':
      add(G.cyl(0.025, 0.025, 0.4, 6), handle, 0, 0.1, 0);
      add(new THREE.TorusGeometry(0.2, 0.015, 4, 12, Math.PI * 1.2), metal, 0, 0.42, 0.12, 0, 0);
      break;
    case 'anchor':
      add(G.cyl(0.03, 0.03, 0.9, 6), M(0x2a3a4a, { metal: 0.6, rough: 0.4 }), 0, 0.3, 0);
      add(new THREE.TorusGeometry(0.22, 0.03, 6, 12, Math.PI), M(0x2a3a4a, { metal: 0.6, rough: 0.4 }), 0, -0.05, 0, 0, Math.PI);
      add(new THREE.TorusGeometry(0.06, 0.02, 6, 10), M(0x2a3a4a, { metal: 0.6 }), 0, 0.8, 0);
      break;
    case 'oar':
      add(G.cyl(0.025, 0.025, 1.1, 6), M(0xc8a070), 0, 0.3, 0);
      add(G.box(0.03, 0.4, 0.16), M(0x2f6fb5), 0, 0.95, 0);
      break;
    case 'guitar':
      add(G.box(0.05, 0.6, 0.05), M(0x3a2a1a), 0, 0.5, 0);
      add(G.cyl(0.16, 0.16, 0.08, 14), M(0xc0602a, { rough: 0.4 }), 0, 0.0, 0, Math.PI / 2);
      add(G.cyl(0.13, 0.13, 0.08, 14), M(0xc0602a, { rough: 0.4 }), 0, 0.2, 0, Math.PI / 2);
      break;
    case 'scythe':
      add(G.cyl(0.025, 0.025, 1.3, 6), M(0x4a3a2a), 0, 0.4, 0);
      add(G.box(0.02, 0.06, 0.55), M(0x7aff8a, { emissive: 0.6, metal: 0.5 }), 0, 1.02, 0.25);
      break;
    case 'bat':
      add(G.cyl(0.05, 0.022, 0.85, 8), M(0xc8a070), 0, 0.35, 0);
      for (let k = 0; k < 4; k++) add(G.cyl(0.004, 0.004, 0.14, 4), metal, 0.05, 0.55 + k * 0.06, 0, 0, Math.PI / 2);
      break;
    default: // shovel
      add(G.cyl(0.025, 0.028, 0.95, 6), handle, 0, 0.3, 0);
      add(G.box(0.18, 0.04, 0.03), handle, 0, 0.8, 0);
      add(G.box(0.2, 0.26, 0.025), metal, 0, -0.27, 0.0);
  }
  return g;
}

export function buildBackBling(style) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
  switch (style) {
    case 'haybale': add(G.cyl(0.2, 0.2, 0.34, 12), M(0xd9b866), 0, 0, -0.12, 0, Math.PI / 2); break;
    case 'lantern': add(G.box(0.16, 0.24, 0.16), M(0x2a2a2a, { metal: 0.6 }), 0, 0, -0.12); add(G.box(0.1, 0.16, 0.1), M(0xffd070, { emissive: 1.5 }), 0, 0, -0.12); break;
    case 'radio': add(G.rbox(0.32, 0.38, 0.14), M(0x5a6a3a), 0, 0, -0.12); add(G.cyl(0.008, 0.008, 0.5), M(0x222222), 0.1, 0.42, -0.12); break;
    case 'guitar': add(G.cyl(0.16, 0.16, 0.08, 14), M(0x8a4a2a), 0, -0.1, -0.13, Math.PI / 2); add(G.box(0.05, 0.5, 0.04), M(0x3a2a1a), 0, 0.25, -0.13); break;
    case 'beehive': add(G.rbox(0.3, 0.34, 0.2), M(0xf0e0b0), 0, 0, -0.14); add(G.rbox(0.32, 0.06, 0.22), M(0xd4b04a), 0, 0.19, -0.14); break;
    case 'gascan': add(G.rbox(0.24, 0.32, 0.12), M(0xc0392b), 0, 0, -0.1); add(G.cyl(0.03, 0.03, 0.08), M(0xd4b04a), 0.08, 0.2, -0.1); break;
    case 'crate': add(G.box(0.32, 0.32, 0.2), M(0xb08a5a), 0, 0, -0.14); break;
    case 'wings': add(G.box(0.02, 0.4, 0.5), M(0x2a2a2a), 0.18, 0.05, -0.2, 0, -0.5); add(G.box(0.02, 0.4, 0.5), M(0x2a2a2a), -0.18, 0.05, -0.2, 0, 0.5); break;
    case 'skull': add(G.sph(0.14, 12, 10), M(0xe8e0d0), 0, 0.02, -0.15); add(G.sph(0.03), M(0x7aff8a, { emissive: 2 }), 0.05, 0.04, -0.03); add(G.sph(0.03), M(0x7aff8a, { emissive: 2 }), -0.05, 0.04, -0.03); break;
    case 'pack': default: add(G.rbox(0.32, 0.4, 0.16), M(0x5a4a3a), 0, 0, -0.11); add(G.rbox(0.26, 0.14, 0.06), M(0x4a3a2a), 0, -0.1, -0.2); break;
  }
  return g;
}

export function buildGlider(style = 'canvas') {
  const g = new THREE.Group();
  const frame = M(0x3a3a3a, { metal: 0.5 });
  const cols = { canvas: [0xe8e0d0, 0xc0392b], barn: [0xa3302a, 0xf4f1ea], patch: [0x2f6fb5, 0xe6b422], crop: [0xe6b422, 0x2a2a2a], bat: [0x2a2a2a, 0x5a1a1a], toxic: [0x7aff8a, 0x1a3a1a], balloon: [0xd9473a, 0xe6b422] }[style] || [0xe8e0d0, 0xc0392b];
  const wingMat = M(cols[0], { rough: 0.9 });
  wingMat.side = THREE.DoubleSide;
  const wing = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 4, 1, true), wingMat);
  wing.scale.set(1, 0.6, 0.7); wing.rotation.y = Math.PI / 4; wing.position.y = 1.6;
  g.add(wing);
  const stripe = new THREE.Mesh(G.box(0.15, 0.02, 1.5), M(cols[1]));
  stripe.position.y = 1.78; g.add(stripe);
  for (const sx of [-0.35, 0.35]) { const r = new THREE.Mesh(G.cyl(0.015, 0.015, 1.3, 4), frame); r.position.set(sx, 0.95, 0); r.rotation.z = sx * 0.4; g.add(r); }
  const bar = new THREE.Mesh(G.cyl(0.02, 0.02, 0.9, 4), frame); bar.rotation.z = Math.PI / 2; bar.position.y = 0.4; g.add(bar);
  return g;
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
export const DEFAULT_OUTFIT = {
  skin: 0xe0ac80, shirt: 0x3a6aa8, shirtPattern: 'plaid', shirt2: 0x1e3a5a, pants: 0x3a4a6a, boots: 0x5a3a24, gloves: null,
  hair: 'short', hairColor: 0x4a2a14, hat: 'none', hatColor: 0xc0392b, face: 'default', eye: '#3a2a1a', vest: null, overalls: null, bandana: null, build: 1,
};

export class Character {
  constructor(outfit = DEFAULT_OUTFIT, opts = {}) {
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.root.rotation.order = 'YXZ';
    this.parts = {};
    this.anim = { phase: 0, speed: 0, crouch: 0, air: 0, aimPitch: 0, weapon: 'none', action: null, actionT: 0, emote: null, emoteT: 0, state: 'ground', dead: 0, lean: 0, swim: 0 };
    this.shadow = opts.shadow ?? true;
    this.build(outfit);
  }
  dispose() {
    this.root.traverse((o) => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
  }
  mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = this.shadow; m.receiveShadow = false;
    parent.add(m);
    return m;
  }
  build(o) {
    this.outfit = { ...DEFAULT_OUTFIT, ...o };
    o = this.outfit;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    const P = this.parts;
    const skin = M(o.skin, { rough: 0.6 });
    const shirtMap = o.shirtPattern === 'plaid' ? plaidTexture('#' + o.shirt.toString(16).padStart(6, '0'), '#' + (o.shirt2 ?? 0x222222).toString(16).padStart(6, '0'), '#f0f0f0') : null;
    const shirt = shirtMap ? M(0xffffff, { map: shirtMap, rough: 0.85 }) : M(o.shirt, { rough: 0.85 });
    const pants = M(o.pants, { rough: 0.9 });
    const boots = M(o.boots, { rough: 0.6 });
    const gloves = o.gloves ? M(o.gloves) : skin;
    const b = o.build || 1;
    P.hips = new THREE.Group(); P.hips.position.y = 0.95; this.root.add(P.hips);
    this.mesh(cg('pelvisL', pelvisGeo), o.overalls ? M(o.overalls) : pants, P.hips, 0, 0, 0);
    P.spine = new THREE.Group(); P.spine.position.y = 0.1; P.hips.add(P.spine);
    this.mesh(cg('torsoL' + b, () => torsoGeo(b)), shirt, P.spine, 0, -0.02, 0);
    if (o.overalls) {
      const om = M(o.overalls);
      this.mesh(cg('bib', () => G.rbox(0.3, 0.3, 0.29, 0.05)), om, P.spine, 0, 0.17, 0);
      for (const sx of [-0.12, 0.12]) this.mesh(cg('strap', () => G.box(0.05, 0.38, 0.29)), om, P.spine, sx, 0.34, 0);
    }
    if (o.vest) this.mesh(cg('vest' + b, () => G.rbox(0.46 * b, 0.42, 0.3, 0.08)), M(o.vest), P.spine, 0, 0.28, 0);
    P.chest = new THREE.Group(); P.chest.position.y = 0.48; P.spine.add(P.chest);
    P.neck = new THREE.Group(); P.neck.position.y = 0.06; P.chest.add(P.neck);
    this.mesh(cg('neck', () => G.cyl(0.06, 0.07, 0.1, 8)), skin, P.neck, 0, 0.02, 0);
    if (o.bandana) this.mesh(cg('bandana', () => G.cyl(0.085, 0.1, 0.07, 10)), M(o.bandana), P.neck, 0, 0.0, 0);
    P.head = new THREE.Group(); P.head.position.y = 0.2; P.neck.add(P.head);
    const headGeo = cg('head', () => { const g = G.sph(0.155, 20, 16); g.scale(1, 1.08, 1.05); return g; });
    const headMat = o.face === 'sack' || o.face === 'pumpkin' ? M(0xffffff, { map: faceTexture(o.face), rough: 0.9 }) : skin;
    this.mesh(headGeo, headMat, P.head, 0, 0, 0);
    if (o.face !== 'sack' && o.face !== 'pumpkin') {
      const fm = new THREE.MeshStandardMaterial({ map: faceTexture(o.face, o.eye), transparent: true, roughness: 0.6, depthWrite: false });
      const face = this.mesh(cg('faceGeo', () => { const g = G.sph(0.157, 20, 16); g.scale(1, 1.08, 1.05); return g; }), fm, P.head, 0, 0, 0);
      face.castShadow = false;
      this.mesh(cg('nose', () => G.sph(0.025, 8, 6)), skin, P.head, 0, -0.01, 0.158);
      for (const sx of [-1, 1]) this.mesh(cg('ear', () => G.sph(0.035, 8, 6)), skin, P.head, sx * 0.152, 0, 0);
    }
    this.buildHair(o);
    // arms
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = new THREE.Group(); sh.position.set(sx * 0.28 * b, 0.0, 0); P.chest.add(sh); P['sh' + side] = sh;
      this.mesh(cg('shoulder' + b, () => G.sph(0.085 * b, 10, 8)), shirt, sh, 0, 0, 0);
      this.mesh(cg('uarm', () => G.cap(0.072, 0.2)), shirt, sh, 0, -0.15, 0);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el); P['el' + side] = el;
      this.mesh(cg('elbow', () => G.sph(0.07, 10, 8)), shirt, el, 0, 0, 0);
      this.mesh(cg('farm', () => G.cap(0.064, 0.19)), o.sleeves === 'short' ? skin : shirt, el, 0, -0.13, 0);
      const hand = new THREE.Group(); hand.position.y = -0.28; el.add(hand); P['hand' + side] = hand;
      this.mesh(cg('hand', () => G.rbox(0.1, 0.11, 0.075, 0.035)), gloves, hand, 0, -0.03, 0.0);
    }
    // legs
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const hip = new THREE.Group(); hip.position.set(sx * 0.1, -0.06, 0); P.hips.add(hip); P['hip' + side] = hip;
      this.mesh(cg('thigh', () => G.cap(0.098, 0.28)), o.overalls ? M(o.overalls) : pants, hip, 0, -0.2, 0);
      const kn = new THREE.Group(); kn.position.y = -0.43; hip.add(kn); P['kn' + side] = kn;
      this.mesh(cg('knee', () => G.sph(0.088, 10, 8)), o.overalls ? M(o.overalls) : pants, kn, 0, 0, 0);
      this.mesh(cg('shin', () => G.cap(0.082, 0.26)), o.overalls ? M(o.overalls) : pants, kn, 0, -0.2, 0);
      const ft = new THREE.Group(); ft.position.y = -0.42; kn.add(ft); P['ft' + side] = ft;
      this.mesh(cg('boot', () => G.rbox(0.14, 0.13, 0.28, 0.05)), boots, ft, 0, -0.02, 0.05);
    }
    // attach points
    P.back = new THREE.Group(); P.back.position.set(0, 0.25, -0.13); P.spine.add(P.back);
    P.weaponR = new THREE.Group(); P.weaponR.position.set(0, -0.05, 0.02); P.handR.add(P.weaponR);
    P.toolR = new THREE.Group(); P.toolR.position.set(0, -0.04, 0.0); P.handR.add(P.toolR);
    P.gliderMount = new THREE.Group(); P.gliderMount.position.set(0, 0.3, 0); this.root.add(P.gliderMount);
    if (this.backBlingStyle) this.setBackBling(this.backBlingStyle);
    if (this.pickaxeStyle) this.setPickaxe(this.pickaxeStyle);
  }
  buildHair(o) {
    const P = this.parts;
    const hm = M(o.hairColor ?? 0x4a2a14, { rough: 0.9 });
    const hc = M(o.hatColor ?? 0xc0392b, { rough: 0.7 });
    const hairOn = o.hat !== 'helmet' && o.hat !== 'hood' && o.face !== 'pumpkin' && o.face !== 'sack' && o.hat !== 'gasmask';
    if (hairOn) {
      if (o.hair === 'short') this.mesh(cg('hairShort', () => { const g = G.sph(0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); return g; }), hm, P.head, 0, 0.025, -0.01);
      else if (o.hair === 'long') { this.mesh(cg('hairFull', () => G.sph(0.165, 16, 10)), hm, P.head, 0, 0.025, -0.012); this.mesh(cg('hairLong', () => G.rbox(0.3, 0.32, 0.12, 0.05)), hm, P.head, 0, -0.12, -0.1); }
      else if (o.hair === 'ponytail') { this.mesh(cg('hairFull', () => G.sph(0.165, 16, 10)), hm, P.head, 0, 0.025, -0.012); this.mesh(cg('pony', () => G.cap(0.05, 0.18)), hm, P.head, 0, -0.08, -0.19).rotation.x = 0.4; }
      else if (o.hair === 'mohawk') this.mesh(cg('mohawk', () => G.rbox(0.05, 0.12, 0.3, 0.02)), hm, P.head, 0, 0.16, -0.02);
      else if (o.hair === 'curly') for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; this.mesh(cg('curl', () => G.sph(0.07, 8, 6)), hm, P.head, Math.cos(a) * 0.11, 0.1 + Math.sin(k) * 0.02, Math.sin(a) * 0.11 - 0.02); }
    }
    switch (o.hat) {
      case 'cap': this.mesh(cg('capTop', () => G.sph(0.168, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hc, P.head, 0, 0.03, 0); this.mesh(cg('capBrim', () => G.box(0.22, 0.02, 0.14)), hc, P.head, 0, 0.04, 0.18); break;
      case 'cowboy': case 'straw': {
        const m = o.hat === 'straw' ? M(0xe0c070, { rough: 0.95 }) : hc;
        this.mesh(cg('cbBrim', () => G.cyl(0.32, 0.32, 0.02, 20)), m, P.head, 0, 0.09, 0);
        this.mesh(cg('cbTop', () => G.cyl(0.13, 0.16, 0.17, 14)), m, P.head, 0, 0.17, 0);
        this.mesh(cg('cbBand', () => G.cyl(0.162, 0.162, 0.035, 14)), M(0x3a2a1a), P.head, 0, 0.11, 0);
        break;
      }
      case 'beanie': this.mesh(cg('beanie', () => G.sph(0.175, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hc, P.head, 0, 0.03, 0); this.mesh(cg('pompom', () => G.sph(0.045, 8, 6)), M(0xf0f0f0), P.head, 0, 0.2, 0); break;
      case 'helmet': this.mesh(cg('helm', () => G.sph(0.185, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6)), hc, P.head, 0, 0.02, 0); this.mesh(cg('visor', () => G.box(0.26, 0.09, 0.05)), M(0x2a3a4a, { rough: 0.2, metal: 0.4 }), P.head, 0, 0.02, 0.165); break;
      case 'bucket': this.mesh(cg('bucket', () => G.cyl(0.16, 0.21, 0.14, 14)), hc, P.head, 0, 0.12, 0); break;
      case 'hood': this.mesh(cg('hood', () => G.sph(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7)), hc, P.head, 0, 0.0, -0.03); break;
      case 'crown': for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const c = this.mesh(cg('cob', () => G.cap(0.03, 0.09)), M(0xf2c832, { rough: 0.5, emissive: 0.15 }), P.head, Math.cos(a) * 0.14, 0.17, Math.sin(a) * 0.14); c.rotation.z = -Math.cos(a) * 0.3; c.rotation.x = Math.sin(a) * 0.3; } break;
      case 'gasmask': this.mesh(cg('gmHead', () => G.sph(0.165, 14, 10)), M(0x2a2a2a), P.head, 0, 0, 0); this.mesh(cg('gmFace', () => G.rbox(0.18, 0.12, 0.08, 0.03)), M(0x3a4a3a), P.head, 0, -0.04, 0.15); for (const sx of [-0.06, 0.06]) this.mesh(cg('gmEye', () => G.cyl(0.035, 0.035, 0.02, 10)), M(0x9aff9a, { emissive: 0.8 }), P.head, sx, 0.03, 0.155).rotation.x = Math.PI / 2; this.mesh(cg('gmFilter', () => G.cyl(0.045, 0.045, 0.07, 10)), M(0x5a5a5a), P.head, 0, -0.08, 0.2).rotation.x = Math.PI / 2; break;
      case 'plague': this.mesh(cg('pdHat', () => G.cyl(0.14, 0.15, 0.16, 14)), M(0x1a1a1a), P.head, 0, 0.17, 0); this.mesh(cg('pdBrim', () => G.cyl(0.28, 0.28, 0.02, 16)), M(0x1a1a1a), P.head, 0, 0.09, 0); this.mesh(cg('beak', () => new THREE.ConeGeometry(0.05, 0.22, 8)), M(0xe8dcc0), P.head, 0, -0.03, 0.24).rotation.x = Math.PI / 2; break;
      case 'veil': this.mesh(cg('cbBrim', () => G.cyl(0.32, 0.32, 0.02, 20)), M(0xf0ece0), P.head, 0, 0.09, 0); { const vm = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.35 }); this.mesh(cg('veilNet', () => G.cyl(0.3, 0.24, 0.3, 16)), vm, P.head, 0, -0.06, 0); } break;
      case 'antlers': for (const sx of [-1, 1]) { const a = this.mesh(cg('antler', () => G.cyl(0.015, 0.025, 0.25, 6)), M(0xd8c8a0), P.head, sx * 0.1, 0.22, 0); a.rotation.z = -sx * 0.5; } break;
      default: break;
    }
    if (o.glasses) this.mesh(cg('glasses', () => G.box(0.24, 0.05, 0.03)), M(0x111111, { rough: 0.2 }), P.head, 0, 0.02, 0.16);
  }
  setBackBling(style) {
    this.backBlingStyle = style;
    if (this.backBling) this.parts.back.remove(this.backBling);
    this.backBling = style && style !== 'none' ? buildBackBling(style) : null;
    if (this.backBling) { this.backBling.traverse((o) => { if (o.isMesh) o.castShadow = this.shadow; }); this.parts.back.add(this.backBling); }
  }
  setPickaxe(style) {
    this.pickaxeStyle = style;
    if (this.pickaxe) this.parts.toolR.remove(this.pickaxe);
    this.pickaxe = buildPickaxeModel(style);
    this.pickaxe.rotation.x = Math.PI / 2;
    this.pickaxe.position.set(0, 0, 0.05);
    this.pickaxe.visible = false;
    this.parts.toolR.add(this.pickaxe);
  }
  setGlider(style) {
    if (this.glider) this.parts.gliderMount.remove(this.glider);
    this.glider = buildGlider(style);
    this.glider.visible = false;
    this.parts.gliderMount.add(this.glider);
  }
  setWeapon(kind, rarity = 0, wrap = null) {
    if (this.weaponModel) this.parts.weaponR.remove(this.weaponModel);
    this.weaponModel = null;
    this.anim.weapon = kind || 'none';
    if (this.pickaxe) this.pickaxe.visible = kind === 'pickaxe';
    if (!kind || kind === 'pickaxe' || kind === 'none' || kind === 'item') return;
    this.weaponModel = buildWeaponModel(kind, rarity, wrap);
    this.weaponModel.traverse((o) => { if (o.isMesh) o.castShadow = this.shadow; });
    this.parts.weaponR.add(this.weaponModel);
  }
  playAction(name, dur = 0.45) { this.anim.action = name; this.anim.actionT = 0; this.anim.actionDur = dur; }
  playEmote(name) { this.anim.emote = name; this.anim.emoteT = 0; }

  // ------------------------------------------------------------------
  update(dt) {
    const a = this.anim, P = this.parts;
    const t = (this._t = (this._t || 0) + dt);
    // reset rotations
    for (const k of ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR', 'ftL', 'ftR', 'handL', 'handR']) P[k].rotation.set(0, 0, 0);
    P.hips.position.set(0, 0.95, 0);
    this.root.rotation.x = 0; this.root.rotation.z = 0;
    if (this.glider) this.glider.visible = false;
    if (a.dead > 0) { this.poseDead(a.dead); return; }
    const sp = a.speed;
    const moving = sp > 0.3;
    a.phase += dt * (moving ? 2.2 + sp * 1.05 : 0);
    const ph = a.phase;
    const run = clamp(sp / 6, 0, 1.2);
    if (a.state === 'skydive') return this.poseSkydive(t);
    if (a.state === 'glide') return this.poseGlide(t);
    if (a.state === 'vault') return this.poseVault(a.vaultT || 0);
    if (a.emote && !moving) { a.emoteT += dt; return this.poseEmote(a.emote, a.emoteT); }
    if (moving) a.emote = null;
    // legs
    const legAmp = (0.25 + run * 0.6) * (moving ? 1 : 0);
    const cr = a.crouch;
    P.hipL.rotation.x = Math.sin(ph) * legAmp - cr * 0.9;
    P.hipR.rotation.x = -Math.sin(ph) * legAmp - cr * 0.9;
    P.knL.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * (0.4 + run * 0.9) * (moving ? 1 : 0) + cr * 1.5;
    P.knR.rotation.x = Math.max(0, Math.sin(ph + 0.6)) * (0.4 + run * 0.9) * (moving ? 1 : 0) + cr * 1.5;
    P.ftL.rotation.x = -cr * 0.6; P.ftR.rotation.x = -cr * 0.6;
    P.hips.position.y = 0.95 - cr * 0.33 + (moving ? Math.abs(Math.sin(ph)) * 0.05 * (0.4 + run) : Math.sin(t * 1.6) * 0.008);
    P.spine.rotation.x = run * 0.18 + cr * 0.35;
    P.hips.rotation.y = moving ? Math.sin(ph) * 0.08 : 0;
    P.spine.rotation.y = -P.hips.rotation.y * 1.4;
    if (a.air > 0.1) {
      P.hipL.rotation.x = -0.6; P.hipR.rotation.x = 0.2; P.knL.rotation.x = 1.0; P.knR.rotation.x = 0.5;
    }
    // arms by weapon
    const aimP = clamp(a.aimPitch, -1.2, 1.2);
    const w = a.weapon;
    if (w === 'none' || w === 'item') {
      const armAmp = (0.2 + run * 0.9) * (moving ? 1 : 0);
      P.shL.rotation.x = -Math.sin(ph) * armAmp; P.shR.rotation.x = Math.sin(ph) * armAmp;
      P.shL.rotation.z = 0.12; P.shR.rotation.z = -0.12;
      P.elL.rotation.x = -0.3 - run * 0.6; P.elR.rotation.x = -0.3 - run * 0.6;
      if (w === 'item') { P.shR.rotation.x = -0.7; P.elR.rotation.x = -0.9; }
    } else if (w === 'pickaxe' || w === 'machete') {
      const armAmp = (0.2 + run * 0.6) * (moving ? 1 : 0);
      P.shL.rotation.x = -Math.sin(ph) * armAmp; P.shL.rotation.z = 0.15; P.elL.rotation.x = -0.4;
      P.shR.rotation.x = -0.35 + Math.sin(ph) * armAmp * 0.4; P.shR.rotation.z = -0.15; P.elR.rotation.x = -0.9;
    } else {
      // two-handed aim pose (pistols use one hand plus support)
      const oneHand = w === 'pistol' || w === 'revolver';
      const lean = P.spine.rotation.x;
      P.chest.rotation.x = -aimP * 0.5;
      P.spine.rotation.x = lean - aimP * 0.25;
      P.head.rotation.x = -aimP * 0.25;
      P.shR.rotation.x = -1.45 - aimP * 0.25; P.shR.rotation.y = 0.25; P.shR.rotation.z = 0.05;
      P.elR.rotation.x = oneHand ? -0.1 : -0.35;
      P.shL.rotation.x = -1.35 - aimP * 0.25; P.shL.rotation.z = oneHand ? -0.5 : -0.8; P.shL.rotation.y = -0.45;
      P.elL.rotation.x = oneHand ? -0.6 : -0.7;
      P.handR.rotation.x = (oneHand ? 1.55 : 1.8) - lean;
      if (w === 'grenade' || w === 'molotov' || w === 'noisemaker') { P.shR.rotation.x = -2.4; P.elR.rotation.x = -1.2; P.chest.rotation.y = 0; P.shL.rotation.x = -0.6; P.shL.rotation.z = 0.3; P.handR.rotation.x = 0; }
    }
    // actions
    if (a.action) {
      a.actionT += dt;
      const k = a.actionT / (a.actionDur || 0.45);
      if (k >= 1) a.action = null;
      else this.poseAction(a.action, k);
    }
  }
  poseAction(name, k) {
    const P = this.parts;
    const s = Math.sin(k * Math.PI);
    switch (name) {
      case 'swing': {
        // overhead arc
        const arc = k < 0.35 ? -2.6 * (k / 0.35) : -2.6 + 3.2 * ((k - 0.35) / 0.65);
        P.shR.rotation.x = arc; P.elR.rotation.x = -0.5; P.chest.rotation.y = 0.4 - k * 0.8; P.spine.rotation.x = 0.15 + s * 0.2;
        break;
      }
      case 'recoil': P.shR.rotation.x -= 0.12 * (1 - k); P.shL.rotation.x -= 0.12 * (1 - k); P.chest.rotation.x -= 0.06 * (1 - k); break;
      case 'reload': P.shL.rotation.x = -0.9 + Math.sin(k * Math.PI * 2) * 0.3; P.elL.rotation.x = -1.2; P.handR.rotation.z = s * 0.5; break;
      case 'consume': P.shR.rotation.x = -1.9 * s; P.elR.rotation.x = -1.6 * s; P.head.rotation.x = -0.25 * s; break;
      case 'bandage': P.shR.rotation.x = -0.9; P.elR.rotation.x = -1.0 - Math.sin(k * 20) * 0.3; P.shL.rotation.x = -0.6; P.elL.rotation.x = -1.2; break;
      case 'hammer': P.shR.rotation.x = -1.6 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.8; P.elR.rotation.x = -0.8; break;
      case 'throw': P.shR.rotation.x = -2.6 + k * 3.6; P.elR.rotation.x = -0.4; P.chest.rotation.y = 0.5 - k; break;
      case 'search': P.shR.rotation.x = -1.2 + Math.sin(k * 18) * 0.2; P.shL.rotation.x = -1.1 + Math.cos(k * 18) * 0.2; P.spine.rotation.x = 0.35; break;
      case 'hit': P.spine.rotation.x = -0.25 * s; P.head.rotation.x = -0.3 * s; break;
      default: break;
    }
  }
  poseDead(k) {
    const P = this.parts;
    const t = clamp(k, 0, 1);
    this.root.rotation.x = -t * 1.45;
    P.hips.position.y = lerp(0.95, 0.2, t);
    P.shL.rotation.z = 1.2 * t; P.shR.rotation.z = -1.2 * t;
    P.hipL.rotation.x = 0.3 * t; P.knR.rotation.x = 0.5 * t;
    P.head.rotation.y = 0.5 * t;
  }
  poseSkydive(t) {
    const P = this.parts;
    this.root.rotation.x = 1.25;
    P.shL.rotation.z = 1.6; P.shR.rotation.z = -1.6; P.shL.rotation.x = -0.3; P.shR.rotation.x = -0.3;
    P.elL.rotation.x = -0.5; P.elR.rotation.x = -0.5;
    P.hipL.rotation.z = 0.35; P.hipR.rotation.z = -0.35; P.knL.rotation.x = 0.7; P.knR.rotation.x = 0.7;
    P.head.rotation.x = -0.8;
    P.shL.rotation.z += Math.sin(t * 9) * 0.06; P.shR.rotation.z -= Math.cos(t * 8) * 0.06;
  }
  poseGlide(t) {
    const P = this.parts;
    if (this.glider) this.glider.visible = true;
    P.shL.rotation.z = 2.8; P.shR.rotation.z = -2.8; P.elL.rotation.z = 0.3; P.elR.rotation.z = -0.3;
    P.hipL.rotation.x = 0.15 + Math.sin(t * 2) * 0.1; P.hipR.rotation.x = -0.1 - Math.sin(t * 2) * 0.1;
    P.knL.rotation.x = 0.3; P.knR.rotation.x = 0.4;
  }
  poseVault(k) {
    const P = this.parts;
    P.spine.rotation.x = 0.6 * Math.sin(k * Math.PI);
    P.hipL.rotation.x = -1.2 * Math.sin(k * Math.PI); P.hipR.rotation.x = -0.6 * Math.sin(k * Math.PI);
    P.knL.rotation.x = 1.4 * Math.sin(k * Math.PI); P.knR.rotation.x = 1.0 * Math.sin(k * Math.PI);
    P.shL.rotation.x = -1.5; P.shR.rotation.x = -1.5;
  }
  poseEmote(name, t) {
    const P = this.parts;
    const b = Math.sin(t * 8);
    switch (name) {
      case 'hoedown':
        P.hips.position.y = 0.95 + Math.abs(b) * 0.08;
        P.hipL.rotation.x = Math.max(0, b) * -1.2; P.knL.rotation.x = Math.max(0, b) * 1.5;
        P.hipR.rotation.x = Math.max(0, -b) * -1.2; P.knR.rotation.x = Math.max(0, -b) * 1.5;
        P.shL.rotation.z = 0.4; P.shR.rotation.z = -0.4; P.elL.rotation.x = -1.6; P.elR.rotation.x = -1.6;
        P.shL.rotation.x = -0.3; P.shR.rotation.x = -0.3;
        P.hips.rotation.y = Math.sin(t * 4) * 0.3;
        break;
      case 'twostep':
        this.root.rotation.z = Math.sin(t * 4) * 0.08;
        P.hips.position.y = 0.95 + Math.abs(Math.sin(t * 4)) * 0.04;
        P.hipL.rotation.x = Math.sin(t * 4) * 0.5; P.hipR.rotation.x = -Math.sin(t * 4) * 0.5;
        P.shL.rotation.x = -0.8; P.elL.rotation.x = -1.4; P.shR.rotation.x = -0.4 + Math.sin(t * 4) * 0.3; P.shR.rotation.z = -0.6;
        break;
      case 'fiddle':
        P.shL.rotation.x = -1.4; P.shL.rotation.z = -0.4; P.elL.rotation.x = -1.6; P.head.rotation.z = 0.4; P.head.rotation.x = 0.2;
        P.shR.rotation.x = -1.2; P.elR.rotation.x = -0.6 + Math.sin(t * 10) * 0.5; P.shR.rotation.z = Math.sin(t * 10) * 0.4;
        P.hips.position.y = 0.95 + Math.abs(Math.sin(t * 5)) * 0.03;
        break;
      case 'chicken':
        P.shL.rotation.z = 0.6 + Math.abs(b) * 0.6; P.shR.rotation.z = -0.6 - Math.abs(b) * 0.6; P.elL.rotation.x = -2.2; P.elR.rotation.x = -2.2;
        P.spine.rotation.x = 0.3; P.neck.rotation.x = Math.sin(t * 12) * 0.3;
        P.hipL.rotation.x = -0.4; P.hipR.rotation.x = -0.4; P.knL.rotation.x = 0.8; P.knR.rotation.x = 0.8; P.hips.position.y = 0.8;
        break;
      case 'salute':
        P.shR.rotation.x = -2.4; P.shR.rotation.z = -0.9; P.elR.rotation.x = -1.9; P.spine.rotation.x = -0.05;
        break;
      case 'lasso':
        P.shR.rotation.x = -3.0; P.shR.rotation.y = Math.sin(t * 9) * 0.6; P.elR.rotation.x = -0.2; P.shL.rotation.x = -0.3;
        P.hips.rotation.y = Math.sin(t * 2) * 0.2;
        break;
      case 'robot':
        P.shL.rotation.x = -1.57 * (Math.floor(t * 2) % 2); P.shR.rotation.x = -1.57 * ((Math.floor(t * 2) + 1) % 2);
        P.elL.rotation.x = -1.57; P.elR.rotation.x = -1.57; P.head.rotation.y = (Math.floor(t * 2) % 2 ? 1 : -1) * 0.5;
        P.hips.position.y = 0.95 - (Math.floor(t * 4) % 2) * 0.05;
        break;
      case 'wave': default:
        P.shR.rotation.x = -0.4; P.shR.rotation.z = -2.6; P.elR.rotation.z = Math.sin(t * 9) * 0.5;
        break;
    }
  }
}
