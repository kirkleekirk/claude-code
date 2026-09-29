import * as THREE from 'three';
import { avatarAssets } from './AvatarAssets.js';
import { rng, rag } from './noise.js';

// The blocky dead: a body of boxes on the same rig, clips and pose layer as the avatars.
// Each box is held rigidly by one bone and wears a pixel-art skin painted for the look,
// so a horde of them costs a few hundred vertices apiece instead of thousands.

const PPU = 40; // texture pixels per rig unit
const ATLAS = 128;

// [part, bone, min, max] in the rig's bind pose: a T-pose facing +z
const TRUNK = [
  ['head', 'HEAD__Skeleton', [-0.15, 1.16, -0.16], [0.15, 1.46, 0.14]],
  ['neck', 'SC_NECK__Skeleton', [-0.055, 1.08, -0.08], [0.055, 1.18, 0.03]],
  ['chest', 'SC_BACKB__Skeleton', [-0.16, 0.9, -0.1], [0.16, 1.13, 0.08]],
  ['belly', 'SC_BACKA__Skeleton', [-0.145, 0.76, -0.09], [0.145, 0.92, 0.07]],
  ['hips', 'SC_BASE__Skeleton', [-0.16, 0.64, -0.095], [0.16, 0.78, 0.075]],
];
// the left side (+x); the right mirrors it
const LIMBS = [
  ['upper', 'SC_S', [0.14, 0.985, -0.08], [0.35, 1.085, 0.02]],
  ['fore', 'SC_E', [0.33, 0.99, -0.075], [0.52, 1.075, 0.015]],
  ['hand', 'W', [0.51, 0.99, -0.07], [0.63, 1.065, 0.01]],
  ['thigh', 'SC_H', [0.02, 0.36, -0.07], [0.16, 0.7, 0.07]],
  ['shin', 'SC_K', [0.03, 0.08, -0.065], [0.155, 0.39, 0.065]],
  ['foot', 'A', [0.03, 0, -0.08], [0.16, 0.1, 0.17]],
];
const GEAR = {
  helmet: [['helmet', 'HEAD__Skeleton', [-0.168, 1.33, -0.178], [0.168, 1.495, 0.158]]],
  beanie: [['beanie', 'HEAD__Skeleton', [-0.162, 1.35, -0.172], [0.162, 1.5, 0.152]]],
  cap: [['cap', 'HEAD__Skeleton', [-0.158, 1.37, -0.168], [0.158, 1.48, 0.148]], ['bill', 'HEAD__Skeleton', [-0.12, 1.37, 0.14], [0.12, 1.39, 0.25]]],
  pack: [['pack', 'SC_BACKB__Skeleton', [-0.12, 0.84, -0.2], [0.12, 1.1, -0.1]]],
};

function partsFor(look) {
  const out = TRUNK.map(([part, bone, a, b]) => ({ part, bone, min: a, max: b }));
  for (const [part, bone, a, b] of LIMBS) {
    out.push({ part, bone: `LF_${bone}__Skeleton`, min: a, max: b });
    out.push({ part, bone: `RT_${bone}__Skeleton`, min: [-b[0], a[1], a[2]], max: [-a[0], b[1], b[2]] });
  }
  for (const g of look.gear || []) for (const [part, bone, a, b] of GEAR[g] || []) out.push({ part, bone, min: a, max: b });
  return out;
}

// The six faces of a box as a viewer outside each one sees it: corners top-left, top-right,
// bottom-left, bottom-right.
function faces(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  return [
    ['front', [0, 0, 1], [V(x0, y1, z1), V(x1, y1, z1), V(x0, y0, z1), V(x1, y0, z1)]],
    ['back', [0, 0, -1], [V(x1, y1, z0), V(x0, y1, z0), V(x1, y0, z0), V(x0, y0, z0)]],
    ['left', [1, 0, 0], [V(x1, y1, z1), V(x1, y1, z0), V(x1, y0, z1), V(x1, y0, z0)]],
    ['right', [-1, 0, 0], [V(x0, y1, z0), V(x0, y1, z1), V(x0, y0, z0), V(x0, y0, z1)]],
    ['top', [0, 1, 0], [V(x0, y1, z0), V(x1, y1, z0), V(x0, y1, z1), V(x1, y1, z1)]],
    ['bottom', [0, -1, 0], [V(x0, y0, z1), V(x1, y0, z1), V(x0, y0, z0), V(x1, y0, z0)]],
  ];
}

// ---- the pixel skin ------------------------------------------------------------------------------

// sRGB bytes straight from the hex (the texture is tagged sRGB)
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

function painter(look) {
  const sex = look.sex === 'f' ? 'f' : 'm';
  const rand = rng((look.seed || 1) * 7 + 3);
  const dead = look.dead || null;
  const gear = new Set(look.gear || []);
  const skin = hex(look.skin ?? 0xd9a582);
  const top = look.top || { color: 0x8a8a8a };
  const shirt = hex(top.color), pants = hex((look.bottoms && look.bottoms.color) ?? 0x3a4a5a);
  const legs = look.bottoms && look.bottoms.legs != null ? hex(look.bottoms.legs) : null;
  const shoe = hex((look.shoes && look.shoes.color) ?? 0x2a2a2a);
  const hair = hex((look.hair && look.hair.color) ?? 0x3a2a1e);
  const style = (look.hair && look.hair.style) || (sex === 'f' ? 'bob' : 'short');
  const glove = look.gloves != null ? hex(look.gloves) : null;
  const gc = (k, d) => hex((look.gearColor && look.gearColor[k]) ?? d);
  const vest = gc('vest', 0x2a2e33);
  const blood = [74, 8, 6], socket = [21, 16, 12], pale = [224, 220, 184];
  const torn = dead && dead.torn ? 1 - dead.torn * 0.5 : 2;
  const seed = (look.seed || 1) % 997;
  const blots = [];
  if (dead) for (let i = 0; i < 4 + Math.round((dead.blood || 0) * 8); i++) blots.push({ c: new THREE.Vector3((rand() - 0.5) * 0.4, 0.2 + rand() * 1.1, (rand() - 0.3) * 0.3), r: 0.05 + rand() * 0.12 });
  // a face of a few pixels: where the eyes and mouth sit shifts a little per seed
  const mouthW = 3 + Math.floor(rand() * 3), mouthX = Math.floor(rand() * 2);

  const hairAt = (face, c, r, w, h) => {
    if (style === 'bald') return false;
    if (face === 'top') return true;
    if (face === 'bottom') return false;
    const long = style === 'bob' || style === 'pony';
    const buzz = style === 'buzz';
    if (face === 'front') return r < (buzz ? 1 : 2) || (long && r < 7 && (c < 1 || c >= w - 1));
    if (face === 'back') return r < (long ? h - 1 : buzz ? 3 : 6);
    // the sides: long hair falls past the ears; short hair stops short of the temples
    if (long) return r < 9;
    const temple = face === 'left' ? c < 3 : c >= w - 3;
    return r < (buzz ? 2 : 4) && !(temple && r >= 2);
  };

  // what a cloth pixel shows: the cloth, or skin through a tear with a dark frayed edge
  const cloth = (col, p) => {
    if (torn > 1) return col;
    const n = rag(p.x, p.y, p.z, seed);
    if (n > torn) return mul(skin, 0.8);
    if (n > torn - 0.08) return mul(col, 0.55);
    return col;
  };

  return (part, face, p, c, r, w, h) => {
    let col;
    switch (part) {
      case 'head': {
        col = hairAt(face, c, r, w, h) ? hair : skin;
        if (face === 'front') {
          const ey = Math.round(h * 0.42), my = Math.round(h * 0.74);
          const eyes = [2, w - 4];
          for (const ex of eyes) if (r === ey && (c === ex || c === ex + 1)) col = dead ? (c === (ex === 2 ? ex + 1 : ex) ? pale : socket) : c === (ex === 2 ? ex + 1 : ex) ? [30, 24, 20] : [235, 232, 222];
          if (r === ey - 1 && !hairAt(face, c, r, w, h) && eyes.some((ex) => c >= ex - 1 && c <= ex + 2)) col = mul(skin, 0.72);
          if (r === ey + 2 && (c === w / 2 - 1 || c === w / 2)) col = mul(skin, 0.8);
          const m0 = Math.floor((w - mouthW) / 2) + mouthX;
          if (r === my && c >= m0 && c < m0 + mouthW) col = dead ? (c === m0 + 1 ? pale : [42, 8, 6]) : mul(skin, 0.6);
          if (dead && (r === my + 1 || r === my + 2) && c === m0 + mouthW - 1) col = blood;
          if (gear.has('visor') && (r === ey || r === ey - 1)) col = gc('visor', 0xd8281c);
        } else if (gear.has('visor') && (face === 'left' || face === 'right') && (r === Math.round(h * 0.42) || r === Math.round(h * 0.42) - 1)) col = gc('visor', 0xd8281c);
        break;
      }
      case 'neck': col = skin; break;
      case 'chest': case 'belly':
        col = cloth(shirt, p);
        if (part === 'chest' && face === 'front' && r === 0 && Math.abs(c - (w - 1) / 2) < 1.6) col = skin;
        if (gear.has('vest') && face !== 'bottom' && !(face === 'top' && Math.abs(p.x) < 0.07)) {
          col = vest;
          if (part === 'belly' && face === 'front' && r >= 1 && r <= 3 && c % 4 !== 0) col = mul(vest, 1.35);
          if (part === 'chest' && face === 'front' && r === 3 && (c === w - 4 || c === w - 3) && look.gearColor && look.gearColor.patch != null) col = hex(look.gearColor.patch);
        }
        break;
      case 'hips':
        col = (face !== 'bottom' && r === 0) ? [40, 30, 22] : cloth(pants, p);
        break;
      case 'upper':
        col = top.sleeves === 'none' ? skin : top.sleeves === 'long' || Math.abs(p.x) < 0.27 ? cloth(shirt, p) : skin;
        break;
      case 'fore': col = top.sleeves === 'long' ? cloth(shirt, p) : skin; break;
      case 'hand': col = glove || skin; break;
      case 'thigh': case 'shin':
        // her bottoms are shorts: bare legs (or leggings) below them
        col = sex === 'f' && p.y < 0.63 ? (legs || skin) : cloth(pants, p);
        break;
      case 'foot': col = p.y > 0.085 && sex === 'f' ? (legs || skin) : shoe; break;
      case 'helmet': col = gc('helmet', 0x2a2e33); if (face !== 'top' && r >= h - 1) col = mul(col, 0.7); break;
      case 'beanie': col = gc('beanie', 0x3a3f34); if (face !== 'top' && r >= h - 2) col = mul(col, 0.8); break;
      case 'cap': col = gc('cap', 0x6a2a24); break;
      case 'bill': col = mul(gc('cap', 0x6a2a24), 0.75); break;
      case 'pack': col = gc('pack', 0x4d5233); if (face === 'back' && r > h * 0.55 && c > 1 && c < w - 2) col = mul(col, 0.8); break;
      default: col = [255, 0, 255];
    }
    // the dead: rotten skin, blood soaked into everything but hair and gear
    if (dead) {
      if (col === skin || part === 'neck' || part === 'hand') { if (rand() < (dead.rot || 0) * 0.25) col = mix(col, [58, 68, 40], 0.6); }
      for (const b of blots) {
        const d = p.distanceTo(b.c) / b.r;
        if (d < 1 && !['helmet', 'beanie', 'cap', 'bill', 'pack'].includes(part) && col !== hair) col = mix(col, blood, (1 - d) * 0.9);
      }
    }
    // every pixel a shade off its neighbours, as painted by hand
    return mul(col, 0.93 + rand() * 0.14);
  };
}

// ---- building -------------------------------------------------------------------------------------

const texCache = new Map();

export function buildBlocky(look) {
  const A = avatarAssets();
  const parts = partsFor(look);
  // lay every face out in the atlas, in shelves, with a pixel of gutter all round
  const rects = [];
  for (const q of parts) for (const [face, n, [tl, tr, bl, br]] of faces(q.min, q.max)) {
    const w = Math.max(1, Math.round(tl.distanceTo(tr) * PPU)), h = Math.max(1, Math.round(tl.distanceTo(bl) * PPU));
    rects.push({ q, face, n, tl, tr, bl, br, w, h });
  }
  const order = rects.slice().sort((a, b) => b.h - a.h);
  let x = 0, y = 0, shelf = 0;
  for (const r of order) {
    if (x + r.w + 2 > ATLAS) { x = 0; y += shelf; shelf = 0; }
    r.x = x; r.y = y;
    x += r.w + 2; shelf = Math.max(shelf, r.h + 2);
  }
  const H = Math.max(16, 2 ** Math.ceil(Math.log2(y + shelf)));

  const key = JSON.stringify(look);
  let material = texCache.get(key);
  if (!material) {
    const paint = painter(look);
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(ATLAS, H);
    const put = (px, py, c) => { const i = (py * ATLAS + px) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; };
    const p = new THREE.Vector3(), du = new THREE.Vector3(), dv = new THREE.Vector3();
    for (const r of rects) {
      du.subVectors(r.tr, r.tl); dv.subVectors(r.bl, r.tl);
      const px = [];
      for (let j = 0; j < r.h; j++) {
        px.push([]);
        for (let i = 0; i < r.w; i++) {
          p.copy(r.tl).addScaledVector(du, (i + 0.5) / r.w).addScaledVector(dv, (j + 0.5) / r.h);
          px[j].push(paint(r.q.part, r.face, p, i, j, r.w, r.h));
        }
      }
      // the face, and its edge pixels repeated into the gutter so mipmaps don't bleed
      for (let j = -1; j <= r.h; j++) for (let i = -1; i <= r.w; i++) {
        const c = px[Math.min(r.h - 1, Math.max(0, j))][Math.min(r.w - 1, Math.max(0, i))];
        put(r.x + 1 + i, r.y + 1 + j, c);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    material = new THREE.MeshLambertMaterial({ map: tex });
    texCache.set(key, material);
  }

  const n = rects.length * 4;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const index = [];
  rects.forEach((r, k) => {
    const bi = A.index.get(r.q.bone) ?? 0;
    const corners = [r.tl, r.tr, r.bl, r.br];
    const uvs = [[r.x + 1, r.y + 1], [r.x + 1 + r.w, r.y + 1], [r.x + 1, r.y + 1 + r.h], [r.x + 1 + r.w, r.y + 1 + r.h]];
    for (let c = 0; c < 4; c++) {
      const v = k * 4 + c;
      pos.set([corners[c].x, corners[c].y, corners[c].z], v * 3);
      nor.set(r.n, v * 3);
      uv[v * 2] = uvs[c][0] / ATLAS; uv[v * 2 + 1] = uvs[c][1] / H;
      si[v * 4] = bi; sw[v * 4] = 1;
    }
    const b = k * 4;
    index.push(b, b + 2, b + 3, b, b + 3, b + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return { geo, material };
}
