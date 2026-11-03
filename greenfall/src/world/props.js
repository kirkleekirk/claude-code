// Props & landmarks: cars, hay bales, fences, power poles, silos, water tower, cranes,
// lighthouse, ferris wheel, cemetery... All emitted into a GeoBuilder plus colliders.
import { TEX } from './textures.js';
import { COL } from './buildings.js';
import { RNG } from '../core/rng.js';
import { ROAD_TYPES } from './layout.js';

const OBB = (out, x, y, z, sx, sy, sz, rot, flags = COL.SOLID | COL.BULLET | COL.WALK, ref = null) => {
  out.push({ kind: 0, x, y, z, hx: sx / 2, hy: sy / 2, hz: sz / 2, rot, flags, ref });
};
const CYL = (out, x, y, z, r, h, flags = COL.SOLID | COL.BULLET, ref = null) => {
  out.push({ kind: 2, x, y: y + h / 2, z, hx: r, hy: h / 2, hz: r, rot: 0, flags, ref });
};

function wheel(gb, x, y, z, r, w) {
  gb.push(); gb.translate(x, y, z); gb.rotateX(Math.PI / 2);
  gb.setColor(0x1e1e1e).setLayer(TEX.TAR);
  gb.cylinder(0, -w / 2, 0, r, r, w, 10, 0.5);
  gb.setColor(0x9a9a9a).setLayer(TEX.METAL);
  gb.cylinder(0, -w / 2 - 0.01, 0, r * 0.55, r * 0.55, w + 0.02, 8, 0.5);
  gb.pop();
}

export function buildProp(p, gb, cols, detail = 0) {
  const r = new RNG(Math.floor(p.x * 13 + p.z * 7));
  gb.push();
  gb.translate(p.x, p.y + (p.data?.y || 0), p.z);
  gb.rotateY(p.rot);
  const ref = { type: p.type, prop: p };
  switch (p.type) {
    case 'car': {
      const c = p.data?.color ?? 0xb03a2e;
      const wreck = p.data?.wreck;
      gb.setColor(wreck ? 0x6a4a3a : c).setLayer(TEX.PAINTED);
      gb.box(0, 0.62, 0, 1.8, 0.62, 4.3, 1);
      gb.setColor(wreck ? 0x5a3a2a : c);
      // cabin: trapezoid
      const cy0 = 0.93, cy1 = 1.5;
      gb.quad([-0.82, cy0, 1.0], [0.82, cy0, 1.0], [0.7, cy1, 0.3], [-0.7, cy1, 0.3]);
      gb.quad([0.82, cy0, -1.2], [-0.82, cy0, -1.2], [-0.7, cy1, -0.8], [0.7, cy1, -0.8]);
      gb.quad([-0.7, cy1, 0.3], [0.7, cy1, 0.3], [0.7, cy1, -0.8], [-0.7, cy1, -0.8]);
      gb.setColor(0x3a4a58).setLayer(TEX.WINDOW);
      gb.quad([0.82, cy0, 1.0], [0.82, cy0, -1.2], [0.7, cy1, -0.8], [0.7, cy1, 0.3]);
      gb.quad([-0.82, cy0, -1.2], [-0.82, cy0, 1.0], [-0.7, cy1, 0.3], [-0.7, cy1, -0.8]);
      gb.quad([-0.8, cy0 + 0.02, 1.01], [0.8, cy0 + 0.02, 1.01], [0.68, cy1 - 0.02, 0.31], [-0.68, cy1 - 0.02, 0.31]);
      if (detail === 0) {
        for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) wheel(gb, wx, 0.36, wz, 0.36, 0.25);
        gb.setColor(0xfff4c8).setLayer(TEX.WHITE).setEmit(0.2);
        gb.box(-0.6, 0.7, 2.16, 0.35, 0.16, 0.04, 1); gb.box(0.6, 0.7, 2.16, 0.35, 0.16, 0.04, 1);
        gb.setColor(0xc02020).setEmit(0.1);
        gb.box(-0.65, 0.75, -2.16, 0.3, 0.14, 0.04, 1); gb.box(0.65, 0.75, -2.16, 0.3, 0.14, 0.04, 1);
        gb.setEmit(0);
        gb.setColor(0x2a2a2a).setLayer(TEX.METAL);
        gb.box(0, 0.42, 2.18, 1.8, 0.18, 0.1, 1); gb.box(0, 0.42, -2.18, 1.8, 0.18, 0.1, 1);
      }
      OBB(cols, p.x, p.y + 0.75, p.z, 1.85, 1.5, 4.35, p.rot, COL.SOLID | COL.BULLET | COL.WALK, ref);
      break;
    }
    case 'truck': {
      const c = p.data?.color ?? 0x2e5c8a;
      gb.setColor(c).setLayer(TEX.PAINTED);
      gb.box(0, 0.8, 1.2, 2.0, 0.8, 2.6, 1);
      gb.box(0, 1.55, 0.6, 1.9, 0.75, 1.5, 1);
      gb.setColor(0x3a4a58).setLayer(TEX.WINDOW);
      gb.box(0, 1.6, 1.36, 1.7, 0.5, 0.05, 1);
      gb.box(0.96, 1.6, 0.6, 0.02, 0.45, 1.2, 1); gb.box(-0.96, 1.6, 0.6, 0.02, 0.45, 1.2, 1);
      gb.setColor(c).setLayer(TEX.PAINTED);
      gb.box(0, 0.65, -1.6, 2.0, 0.5, 2.8, 1);
      gb.box(0.95, 1.05, -1.6, 0.1, 0.4, 2.8, 1); gb.box(-0.95, 1.05, -1.6, 0.1, 0.4, 2.8, 1); gb.box(0, 1.05, -2.95, 2.0, 0.4, 0.1, 1);
      if (detail === 0) for (const [wx, wz] of [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.8], [0.95, -1.8]]) wheel(gb, wx, 0.42, wz, 0.42, 0.3);
      OBB(cols, p.x, p.y + 0.95, p.z, 2.05, 1.9, 6.0, p.rot, COL.SOLID | COL.BULLET | COL.WALK, { ...ref, type: 'car' });
      break;
    }
    case 'tractor': {
      const c = p.data?.color ?? 0x2f7d32;
      gb.setColor(c).setLayer(TEX.PAINTED);
      gb.box(0, 1.1, 0.9, 1.0, 0.9, 2.0, 1);
      gb.box(0, 1.3, -0.6, 1.4, 1.2, 1.2, 1);
      gb.setColor(0x2a2a2a).setLayer(TEX.METAL);
      gb.box(0, 2.3, -0.6, 1.3, 0.08, 1.3, 1);
      for (const sx of [-0.6, 0.6]) for (const sz of [-1.2, 0]) gb.box(sx, 2.0, sz - 0.0 - (sz === 0 ? 0.0 : 0), 0.06, 0.8, 0.06, 1);
      gb.box(0.3, 2.2, 1.4, 0.1, 0.8, 0.1, 1);
      wheel(gb, -0.9, 0.85, -0.7, 0.85, 0.45); wheel(gb, 0.9, 0.85, -0.7, 0.85, 0.45);
      wheel(gb, -0.65, 0.45, 1.5, 0.45, 0.25); wheel(gb, 0.65, 0.45, 1.5, 0.45, 0.25);
      OBB(cols, p.x, p.y + 1.1, p.z, 2.2, 2.2, 3.6, p.rot, COL.SOLID | COL.BULLET | COL.WALK, { ...ref, type: 'car' });
      break;
    }
    case 'haybale': {
      gb.setColor(0xd9b866).setLayer(TEX.HAY);
      gb.push(); gb.rotateZ(Math.PI / 2); gb.cylinder(0.75, -0.65, 0, 0.75, 0.75, 1.3, 12, 0.6); gb.pop();
      CYL(cols, p.x, p.y, p.z, 0.8, 1.5, COL.SOLID | COL.BULLET | COL.WALK, ref);
      break;
    }
    case 'mailbox': {
      gb.setColor(0x5a4a3a).setLayer(TEX.PLANKS); gb.box(0, 0.55, 0, 0.1, 1.1, 0.1, 1);
      gb.setColor(r.pick([0x2a2a2a, 0xd8d8d8, 0x2a4a7a, 0xa3302a])).setLayer(TEX.METAL); gb.box(0, 1.15, 0, 0.25, 0.25, 0.5, 1);
      break;
    }
    case 'container': {
      const c = p.data?.color ?? 0xc0392b;
      gb.setColor(c).setLayer(TEX.RIBBED);
      gb.push(); gb.rotateY(Math.PI / 2); gb.box(0, 1.3, 0, 6.1, 2.6, 2.45, 0.35); gb.pop();
      OBB(cols, p.x, p.y + (p.data?.y || 0) + 1.3, p.z, 2.45, 2.6, 6.1, p.rot, COL.SOLID | COL.BULLET | COL.WALK, { ...ref, type: 'metal' });
      break;
    }
    case 'pier': {
      const len = p.data.len, w = p.data.w;
      const lake = p.data.lake;
      const top = lake ? 0 : Math.max(1.6, -p.y + 1.6);
      // pier extends along local +z from its origin
      gb.setColor(0x9a8468).setLayer(TEX.PLANKS);
      gb.push(); gb.rotateY(Math.PI / 2);
      gb.box(len / 2, top - 0.1, 0, len, 0.2, w, 0.5);
      gb.pop();
      gb.setColor(0x5a4a3a).setLayer(TEX.BARK);
      for (let k = 0; k <= len; k += 3) for (const sx of [-1, 1]) gb.cylinder(sx * (w / 2 - 0.2), top - 6, k, 0.15, 0.15, 6.3, 6, 1, false);
      const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
      OBB(cols, p.x + sa * (len / 2), p.y + top - 0.1, p.z + ca * (len / 2), w, 0.2, len, p.rot, COL.SOLID | COL.WALK | COL.BULLET);
      break;
    }
    case 'boardwalk': {
      const len = p.data.len, w = p.data.w;
      const top = Math.max(3.4 - p.y, 0.5);
      gb.setColor(0x8a7458).setLayer(TEX.PLANKS);
      gb.box(0, top - 0.15, 0, w, 0.3, len, 0.5);
      gb.setColor(0x4a3a2a).setLayer(TEX.BARK);
      for (let k = -len / 2; k <= len / 2; k += 4) for (const sx of [-1, 1]) gb.cylinder(sx * (w / 2 - 0.3), top - 8, k, 0.2, 0.2, 8, 6, 1, false);
      gb.setColor(0x1e1e1e).setLayer(TEX.METAL);
      gb.box(w / 2 - 0.1, top + 0.9, 0, 0.08, 0.08, len, 1);
      for (let k = -len / 2; k <= len / 2; k += 2.5) gb.box(w / 2 - 0.1, top + 0.45, k, 0.06, 0.9, 0.06, 1);
      OBB(cols, p.x, p.y + top - 0.15, p.z, w, 0.3, len, p.rot, COL.SOLID | COL.WALK | COL.BULLET);
      break;
    }
    case 'logpile': {
      gb.setColor(0x8a6a48).setLayer(TEX.BARK);
      for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
        gb.push(); gb.translate(-1.5 + k * 0.9 + row * 0.45, 0.45 + row * 0.78, 0); gb.rotateX(Math.PI / 2); gb.cylinder(0, -4, 0, 0.42, 0.42, 8, 8, 0.5); gb.pop();
      }
      OBB(cols, p.x, p.y + 1.2, p.z, 3.8, 2.4, 8, p.rot, COL.SOLID | COL.BULLET | COL.WALK, { ...ref, type: 'wood' });
      break;
    }
    case 'barrel': {
      gb.setColor(r.pick([0x2f5a7a, 0x8a2a2a, 0x3a6a3a, 0x6a6a6a])).setLayer(TEX.METAL);
      gb.cylinder(0, 0, 0, 0.32, 0.32, 0.95, 10, 1);
      CYL(cols, p.x, p.y, p.z, 0.34, 0.95, COL.SOLID | COL.BULLET | COL.WALK, { ...ref, type: 'metal' });
      break;
    }
    case 'crate': {
      gb.setColor(0xb08a5a).setLayer(TEX.PLANKS);
      gb.box(0, 0.5, 0, 1, 1, 1, 1);
      OBB(cols, p.x, p.y + 0.5, p.z, 1, 1, 1, p.rot, COL.SOLID | COL.BULLET | COL.WALK, { ...ref, type: 'wood' });
      break;
    }
    case 'dumpster': {
      gb.setColor(r.pick([0x2f6a3a, 0x2a4a7a, 0x5a5a5a])).setLayer(TEX.METAL);
      gb.box(0, 0.7, 0, 1.8, 1.4, 1.2, 0.8);
      gb.setColor(0x222222); gb.box(0, 1.45, 0, 1.85, 0.1, 1.25, 1);
      OBB(cols, p.x, p.y + 0.75, p.z, 1.85, 1.5, 1.25, p.rot, COL.SOLID | COL.BULLET | COL.WALK, { ...ref, type: 'metal' });
      break;
    }
    case 'lamp': {
      gb.setColor(0x161616).setLayer(TEX.METAL);
      gb.cylinder(0, 0, 0, 0.06, 0.12, 3.4, 6, 1);
      gb.box(0, 3.45, 0, 0.3, 0.06, 0.3, 1);
      gb.setColor(0xffd890).setLayer(TEX.WHITE).setEmit(1.0);
      gb.box(0, 3.75, 0, 0.26, 0.5, 0.26, 1);
      gb.setEmit(0);
      gb.setColor(0x161616).setLayer(TEX.METAL);
      gb.push(); gb.translate(0, 4.0, 0); gb.rotateY(Math.PI / 4); gb.cylinder(0, 0, 0, 0.02, 0.24, 0.3, 4, 1); gb.pop();
      CYL(cols, p.x, p.y, p.z, 0.12, 3.4, COL.SOLID | COL.BULLET);
      break;
    }
    default:
      break;
  }
  gb.pop();
}

// --------------------------------------------------------------------------------
export function buildLandmark(l, gb, cols, signs, detail = 0) {
  const r = new RNG(Math.floor(l.x * 3 + l.z * 11));
  gb.push();
  gb.translate(l.x, l.y, l.z);
  if (l.rot) gb.rotateY(l.rot);
  const ca = Math.cos(l.rot || 0), sa = Math.sin(l.rot || 0);
  const W = (lx, lz) => [l.x + lx * ca + lz * sa, l.z - lx * sa + lz * ca];
  switch (l.type) {
    case 'silo': {
      gb.setColor(l.color).setLayer(TEX.RIBBED);
      gb.cylinder(0, 0, 0, l.r, l.r, l.h, 16, 0.4, false, true);
      gb.setColor(0x9aa0a6).setLayer(TEX.METAL);
      if (l.dome) {
        gb.push(); gb.translate(0, l.h, 0); gb.scale(1, 0.55, 1);
        gb.blob(0, 0, 0, l.r, l.r, l.r, 1, 0, 3);
        gb.pop();
      } else gb.cylinder(0, l.h, 0, 0.3, l.r + 0.2, l.r * 0.5, 16, 0.4);
      gb.setColor(0x5a5a5a);
      for (let k = 0; k < l.h; k += 0.5) gb.box(l.r + 0.12, k + 0.25, 0, 0.04, 0.04, 0.5, 1);
      CYL(cols, l.x, l.y, l.z, l.r + 0.1, l.h + l.r * 0.5);
      break;
    }
    case 'watertower': {
      gb.setColor(0xa8b0b8).setLayer(TEX.METAL);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        gb.beam(sx * 4.5, 0, sz * 4.5, sx * 3.2, 16, sz * 3.2, 0.35);
        CYL(cols, l.x + sx * 4, l.y, l.z + sz * 4, 0.3, 16);
      }
      for (const h of [5, 10]) {
        gb.beam(-4, h, -4, 4, h, -4, 0.15); gb.beam(-4, h, 4, 4, h, 4, 0.15);
        gb.beam(-4, h, -4, -4, h, 4, 0.15); gb.beam(4, h, -4, 4, h, 4, 0.15);
      }
      gb.setColor(0xd8dde2);
      gb.cylinder(0, 16, 0, 5.5, 5.5, 7, 20, 0.3);
      gb.cylinder(0, 23, 0, 0.4, 5.8, 2.6, 20, 0.3);
      gb.setColor(0x6a6a6a); gb.cylinder(0, 15.6, 0, 5.8, 5.8, 0.4, 20, 0.3);
      gb.pop(); gb.push(); gb.translate(l.x, l.y, l.z);
      if (signs) for (let k = 0; k < 2; k++) signs.push({ text: l.label, world: true, x: l.x + Math.sin(k * Math.PI) * 5.55, y: l.y + 19.5, z: l.z + Math.cos(k * Math.PI) * 5.55, w: 6.5, h: 1.6, yaw: k * Math.PI, colors: ['#2a3a5a', 'rgba(0,0,0,0)'] });
      CYL(cols, l.x, l.y + 15.6, l.z, 5.8, 10, COL.SOLID | COL.BULLET | COL.WALK);
      break;
    }
    case 'gazebo': {
      gb.setColor(0xf4f1ea).setLayer(TEX.PLANKS);
      gb.cylinder(0, 0, 0, 4.2, 4.2, 0.5, 8, 0.5);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; gb.box(Math.cos(a) * 3.8, 1.8, Math.sin(a) * 3.8, 0.18, 2.6, 0.18, 1); CYL(cols, l.x + Math.cos(a) * 3.8, l.y, l.z + Math.sin(a) * 3.8, 0.12, 3); }
      gb.setColor(0x5a6a7a).setLayer(TEX.SHINGLE);
      gb.cylinder(0, 3.1, 0, 0.1, 4.8, 2.0, 8, 0.5);
      OBB(cols, l.x, l.y + 0.25, l.z, 8, 0.5, 8, 0, COL.SOLID | COL.WALK);
      break;
    }
    case 'canopy': {
      gb.setColor(0xe8e8e8).setLayer(TEX.PAINTED);
      gb.box(0, 5.2, 0, 20, 0.7, 11, 0.5);
      gb.setColor(0xc0392b); gb.box(0, 5.2, 5.52, 20.1, 0.5, 0.05, 1); gb.box(0, 5.2, -5.52, 20.1, 0.5, 0.05, 1);
      gb.setColor(0xfff4dc).setLayer(TEX.WHITE).setEmit(0.8);
      for (const sx of [-6, 0, 6]) gb.box(sx, 4.83, 0, 1.6, 0.04, 1.6, 1);
      gb.setEmit(0);
      for (const sx of [-6, 6]) {
        gb.setColor(0xd8d8d8).setLayer(TEX.PAINTED); gb.box(sx, 2.5, 0, 0.5, 5, 0.5, 1);
        CYL(cols, ...W(sx, 0).slice(0, 1), l.y, W(sx, 0)[1], 0.35, 5);
        gb.setColor(0x3a3a3a).setLayer(TEX.CONCRETE); gb.box(sx, 0.15, 0, 1.4, 0.3, 4.5, 0.5);
        gb.setColor(0xc0392b).setLayer(TEX.PAINTED); gb.box(sx, 1.0, 1.4, 0.7, 1.5, 0.5, 1); gb.box(sx, 1.0, -1.4, 0.7, 1.5, 0.5, 1);
        for (const sz of [1.4, -1.4]) { const [wx, wz] = W(sx, sz); OBB(cols, wx, l.y + 0.9, wz, 0.75, 1.8, 0.55, l.rot || 0); }
      }
      OBB(cols, l.x, l.y + 5.2, l.z, 20, 0.7, 11, l.rot || 0, COL.SOLID | COL.WALK | COL.BULLET);
      if (signs) signs.push({ text: 'GAS & GO', world: true, x: l.x, y: l.y + 5.2, z: l.z + 5.56, w: 6, h: 0.5, yaw: 0, colors: ['#ffffff', '#c0392b'] });
      break;
    }
    case 'crane': {
      const yc = 0x2b2b2b, y1 = 0xe0b020;
      gb.setColor(y1).setLayer(TEX.METAL);
      for (const sx of [-6, 6]) for (const sz of [-5, 5]) {
        gb.box(sx, 14, sz, 1.0, 28, 1.0, 0.5);
        const [wx, wz] = W(sx, sz); CYL(cols, wx, l.y, wz, 0.7, 28);
      }
      gb.box(0, 28.5, 0, 14, 1.5, 12, 0.5);
      gb.box(0, 29.5, -14, 2.2, 1.8, 46, 0.5);
      gb.setColor(yc); gb.box(0, 30.5, 3, 5, 3, 5, 0.5);
      gb.setColor(0xc0392b).setLayer(TEX.PAINTED); gb.box(0, 32.4, 3, 5.2, 0.4, 5.2, 1);
      for (let k = 0; k < 4; k++) { gb.setColor(y1).setLayer(TEX.METAL); gb.beam(-6, 3 + k * 6, -5, -6, 9 + k * 6, 5, 0.25); gb.beam(6, 3 + k * 6, 5, 6, 9 + k * 6, -5, 0.25); }
      gb.setColor(0x333333); gb.box(0, 18, -30, 0.08, 22, 0.08, 1);
      gb.setColor(0xd85a20).setLayer(TEX.PAINTED); gb.box(0, 6.6, -30, 3, 0.4, 2.4, 1);
      break;
    }
    case 'lighthouse': {
      for (let k = 0; k < 6; k++) {
        gb.setColor(k % 2 ? 0xc0392b : 0xf4f1ea).setLayer(TEX.PAINTED);
        const r0 = 4.2 - k * 0.42, r1 = 4.2 - (k + 1) * 0.42;
        gb.cylinder(0, k * 4.5, 0, r1, r0, 4.5, 16, 0.4, false, true);
      }
      gb.setColor(0x222222).setLayer(TEX.METAL);
      gb.cylinder(0, 27, 0, 2.6, 2.6, 0.4, 16, 1);
      gb.setColor(0xfff2b0).setLayer(TEX.WHITE).setEmit(2.0);
      gb.cylinder(0, 27.4, 0, 1.4, 1.4, 2.4, 12, 1);
      gb.setEmit(0);
      gb.setColor(0x222222).setLayer(TEX.METAL);
      gb.cylinder(0, 29.8, 0, 0.2, 2.0, 1.6, 12, 1);
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; gb.box(Math.cos(a) * 2.5, 27.9, Math.sin(a) * 2.5, 0.05, 1.0, 0.05, 1); }
      CYL(cols, l.x, l.y, l.z, 4.0, 30);
      break;
    }
    case 'tank': {
      gb.setColor(0xe8ecee).setLayer(TEX.RIBBED);
      gb.cylinder(0, 0, 0, 13, 13, 10, 24, 0.25, false, true);
      gb.setColor(0xb8bcc0).setLayer(TEX.METAL);
      gb.cylinder(0, 10, 0, 0.5, 13.2, 1.5, 24, 0.3);
      gb.setColor(0x5a5a5a); for (let k = 0; k < 10; k += 0.6) gb.box(12.95 * Math.cos(0.4), k, 12.95 * Math.sin(0.4), 0.05, 0.05, 1.2, 1);
      CYL(cols, l.x, l.y, l.z, 13.1, 11.5, COL.SOLID | COL.BULLET | COL.WALK, { type: 'metal' });
      break;
    }
    case 'statue': {
      gb.setColor(0xd8d0c0).setLayer(TEX.STONEWALL);
      gb.box(0, 1.2, 0, 3, 2.4, 3, 0.5);
      gb.setColor(0x5a7a5a).setLayer(TEX.METAL);
      gb.box(0, 3.3, 0, 1.6, 1.8, 2.6, 1);
      gb.blob(0, 4.7, 0.8, 0.6, 0.9, 1.2, 1, 0.1, 5);
      gb.blob(0, 5.6, 0.2, 0.45, 0.6, 0.45, 1, 0.1, 6);
      gb.box(0, 5.0, -0.5, 0.25, 2.2, 0.25, 1);
      OBB(cols, l.x, l.y + 2, l.z, 3.1, 4, 3.1, 0);
      if (detail === 0) for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        gb.push(); gb.translate(Math.cos(a) * 9, 0, Math.sin(a) * 9); gb.rotateY(-a);
        gb.setColor(0x4a3a2a).setLayer(TEX.PLANKS); gb.box(0, 0.45, 0, 0.5, 0.08, 1.8, 1); gb.box(-0.22, 0.75, 0, 0.06, 0.5, 1.8, 1);
        gb.setColor(0x161616).setLayer(TEX.METAL); gb.box(0, 0.22, 0.8, 0.5, 0.44, 0.06, 1); gb.box(0, 0.22, -0.8, 0.5, 0.44, 0.06, 1);
        gb.pop();
      }
      break;
    }
    case 'cemetery': {
      const w = l.w, d = l.d;
      gb.setColor(0xb8b0a0).setLayer(TEX.STONEWALL);
      const wall = (cx, cz, sx, sz) => { gb.box(cx, 0.9, cz, sx, 1.8, sz, 0.5); OBB(cols, l.x + cx, l.y + 0.9, l.z + cz, sx, 1.8, sz, 0); };
      wall(0, -d / 2, w, 0.5); wall(-w / 2, 0, 0.5, d); wall(w / 2, 0, 0.5, d);
      wall(-w / 4 - 2, d / 2, w / 2 - 4, 0.5); wall(w / 4 + 2, d / 2, w / 2 - 4, 0.5);
      gb.setColor(0x161616).setLayer(TEX.METAL);
      for (const sx of [-4, 4]) gb.box(sx, 1.6, d / 2, 0.4, 3.2, 0.4, 1);
      gb.box(0, 3.1, d / 2, 8.4, 0.15, 0.15, 1);
      for (let gx = -w / 2 + 6; gx < w / 2 - 4; gx += 5.5) {
        for (let gz = -d / 2 + 6; gz < d / 2 - 6; gz += 7) {
          if (Math.abs(gx) < 4) continue;
          const kind = r.next();
          gb.push(); gb.translate(gx + r.range(-0.5, 0.5), 0, gz);
          if (kind < 0.55) {
            // above-ground tomb (Bellerose style)
            const th = r.range(1.6, 2.6);
            gb.setColor(r.pick([0xf2efe8, 0xe0dbd0, 0xd0cabc])).setLayer(TEX.STUCCO);
            gb.box(0, th / 2, 0, 2.2, th, 3.0, 0.5);
            gb.box(0, th + 0.15, 0, 2.5, 0.3, 3.3, 0.5);
            gb.quad([-1.25, th + 0.3, 1.65], [1.25, th + 0.3, 1.65], [0, th + 0.9, 1.65], [0, th + 0.9, 1.65]);
            gb.quad([1.25, th + 0.3, -1.65], [-1.25, th + 0.3, -1.65], [0, th + 0.9, -1.65], [0, th + 0.9, -1.65]);
            gb.quad([-1.25, th + 0.3, -1.65], [-1.25, th + 0.3, 1.65], [0, th + 0.9, 1.65], [0, th + 0.9, -1.65]);
            gb.quad([1.25, th + 0.3, 1.65], [1.25, th + 0.3, -1.65], [0, th + 0.9, -1.65], [0, th + 0.9, 1.65]);
            gb.setColor(0x6a6a6a).setLayer(TEX.CONCRETE); gb.box(0, th * 0.45, 1.52, 1.2, th * 0.6, 0.05, 1);
            OBB(cols, l.x + gx, l.y + th / 2 + 0.3, l.z + gz, 2.5, th + 0.6, 3.3, 0, COL.SOLID | COL.BULLET | COL.WALK);
          } else if (kind < 0.85) {
            gb.setColor(0x9a968e).setLayer(TEX.STONEWALL);
            gb.box(0, 0.55, 0, 0.9, 1.1, 0.25, 1);
            gb.blob(0, 1.1, 0, 0.45, 0.3, 0.13, 0, 0, 2);
          } else {
            gb.setColor(0xe0dbd0).setLayer(TEX.STUCCO);
            gb.box(0, 1.0, 0, 0.2, 2.0, 0.2, 1); gb.box(0, 1.45, 0, 0.9, 0.2, 0.2, 1);
          }
          gb.pop();
        }
      }
      // mausoleum
      gb.setColor(0xd8d2c4).setLayer(TEX.STONEWALL);
      gb.box(0, 2.5, -d / 2 + 10, 8, 5, 8, 0.5);
      gb.setColor(0x6a6a6a).setLayer(TEX.SHINGLE);
      gb.quad([-4.5, 5, -d / 2 + 14.5], [4.5, 5, -d / 2 + 14.5], [0, 7.5, -d / 2 + 14.5], [0, 7.5, -d / 2 + 14.5]);
      gb.quad([-4.5, 5, -d / 2 + 5.5], [-4.5, 5, -d / 2 + 14.5], [0, 7.5, -d / 2 + 14.5], [0, 7.5, -d / 2 + 5.5]);
      gb.quad([4.5, 5, -d / 2 + 14.5], [4.5, 5, -d / 2 + 5.5], [0, 7.5, -d / 2 + 5.5], [0, 7.5, -d / 2 + 14.5]);
      OBB(cols, l.x, l.y + 2.5, l.z - d / 2 + 10, 8, 5, 8, 0);
      break;
    }
    case 'radiotower': {
      gb.setColor(0xc0392b).setLayer(TEX.PAINTED);
      const H = 62;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        gb.beam(Math.cos(a) * 3, 0, Math.sin(a) * 3, Math.cos(a) * 0.6, H, Math.sin(a) * 0.6, 0.28);
      }
      for (let h = 4; h < H; h += 4) {
        const rr = 3 - (h / H) * 2.4;
        gb.setColor(Math.floor(h / 8) % 2 ? 0xf4f1ea : 0xc0392b);
        for (let k = 0; k < 3; k++) {
          const a0 = (k / 3) * Math.PI * 2, a1 = ((k + 1) / 3) * Math.PI * 2;
          gb.beam(Math.cos(a0) * rr, h, Math.sin(a0) * rr, Math.cos(a1) * rr, h, Math.sin(a1) * rr, 0.12);
        }
      }
      gb.setColor(0xff2020).setLayer(TEX.WHITE).setEmit(3.0); gb.box(0, H + 0.4, 0, 0.6, 0.6, 0.6, 1); gb.setEmit(0);
      CYL(cols, l.x, l.y, l.z, 3, 60);
      gb.setColor(0xb8b0a0).setLayer(TEX.CONCRETE); gb.box(6, 1.3, 6, 4, 2.6, 3, 0.5);
      OBB(cols, l.x + 6, l.y + 1.3, l.z + 6, 4, 2.6, 3, 0);
      break;
    }
    case 'ferris': {
      const R = 18, cy = R + 3;
      gb.setColor(0xe8e0d0).setLayer(TEX.METAL);
      for (const sz of [-1.8, 1.8]) {
        gb.beam(-9, 0, sz, 0, cy, sz, 0.6); gb.beam(9, 0, sz, 0, cy, sz, 0.6);
        for (const sx of [-9, 9]) { const [wx, wz] = W(sx, sz); CYL(cols, wx, l.y, wz, 0.5, 3); }
      }
      for (const sz of [-1.5, 1.5]) {
        const n = 24;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          gb.setColor(0xd9473a);
          gb.beam(Math.cos(a0) * R, cy + Math.sin(a0) * R, sz, Math.cos(a1) * R, cy + Math.sin(a1) * R, sz, 0.35);
          if (k % 2 === 0) { gb.setColor(0xe8e0d0); gb.beam(0, cy, sz, Math.cos(a0) * R, cy + Math.sin(a0) * R, sz, 0.12); }
        }
      }
      gb.setColor(0x9a9a9a); gb.push(); gb.translate(0, cy, 0); gb.rotateX(Math.PI / 2); gb.cylinder(0, -2, 0, 0.8, 0.8, 4, 8); gb.pop();
      const cols2 = [0xe6b422, 0x2f6fb5, 0x3a9a5b, 0xd9473a];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        gb.setColor(cols2[k % 4]).setLayer(TEX.PAINTED);
        gb.box(Math.cos(a) * R, cy + Math.sin(a) * R - 1.6, 0, 1.6, 1.5, 2.4, 1);
        gb.setColor(0xffe8a0).setLayer(TEX.WHITE).setEmit(1.2);
        gb.box(Math.cos(a) * R, cy + Math.sin(a) * R, 1.7, 0.3, 0.3, 0.3, 1);
        gb.setEmit(0);
      }
      break;
    }
    case 'grandstand': {
      gb.setColor(0xb8b0a0).setLayer(TEX.CONCRETE);
      for (let k = 0; k < 6; k++) {
        gb.box(0, 0.4 + k * 0.8, -k * 1.2, 36, 0.8 + k * 0 , 1.2 + 0.0, 0.5);
        gb.setColor(k % 2 ? 0x2f6fb5 : 0xe8e0d0).setLayer(TEX.PAINTED);
        gb.box(0, 0.85 + k * 0.8, -k * 1.2 + 0.2, 35, 0.1, 0.4, 1);
        gb.setColor(0xb8b0a0).setLayer(TEX.CONCRETE);
        const [wx, wz] = W(0, -k * 1.2);
        OBB(cols, wx, l.y + 0.4 + k * 0.8, wz, 36, 0.8, 1.2, l.rot || 0, COL.SOLID | COL.WALK | COL.BULLET);
      }
      gb.setColor(0x7a8088).setLayer(TEX.METAL);
      gb.box(0, 8.5, -3, 38, 0.3, 9, 0.5);
      for (const sx of [-17, 0, 17]) { gb.box(sx, 4.3, -6.5, 0.3, 8.5, 0.3, 1); const [wx, wz] = W(sx, -6.5); CYL(cols, wx, l.y, wz, 0.25, 8.5); }
      break;
    }
    case 'tent': {
      gb.setColor(l.color).setLayer(TEX.FABRIC);
      gb.cylinder(0, 0, 0, 4, 4, 2.4, 10, 0.5, false, true);
      gb.setColor(0xf4f1ea);
      gb.cylinder(0, 2.4, 0, 0.1, 4.4, 2.6, 10, 0.5);
      gb.setColor(l.color); gb.box(0, 5.3, 0, 0.08, 1, 0.08, 1);
      CYL(cols, l.x, l.y, l.z, 4, 2.4);
      break;
    }
    case 'elevator': {
      gb.setColor(0xd8d2c4).setLayer(TEX.CONCRETE);
      for (let k = 0; k < 5; k++) {
        gb.cylinder(-8 + k * 4, 0, 0, 2.1, 2.1, 26, 14, 0.3, true);
        const [wx, wz] = W(-8 + k * 4, 0); CYL(cols, wx, l.y, wz, 2.1, 26);
      }
      gb.box(0, 29, 0, 22, 6, 5, 0.4);
      gb.box(10, 33, 0, 4, 4, 4, 0.4);
      gb.setColor(0x7a8088).setLayer(TEX.METAL);
      gb.beam(12, 30, 0, 22, 4, 0, 0.6);
      if (signs) signs.push({ text: 'HOLLOW CREEK CO-OP', world: true, x: W(0, 2.52)[0], y: l.y + 29, z: W(0, 2.52)[1], w: 16, h: 2.2, yaw: l.rot || 0, colors: ['#3a2a1a', 'rgba(0,0,0,0)'] });
      break;
    }
    case 'windmill': {
      gb.setColor(0x9aa0a6).setLayer(TEX.METAL);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.beam(sx * 1.6, 0, sz * 1.6, sx * 0.3, 11, sz * 0.3, 0.12);
      for (let h = 2; h < 11; h += 3) { const rr = 1.6 - (h / 11) * 1.3; gb.beam(-rr, h, -rr, rr, h, rr, 0.06); gb.beam(rr, h, -rr, -rr, h, rr, 0.06); }
      gb.setColor(0xc8ccd0);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        gb.push(); gb.translate(0, 11.3, 0.4); gb.rotateZ(a); gb.box(0, 1.5, 0, 0.35, 2.4, 0.03, 1); gb.pop();
      }
      gb.box(0, 11.3, -1.2, 0.08, 0.6, 2.4, 1);
      gb.setColor(0xa3302a).setLayer(TEX.PAINTED); gb.box(0, 11.3, -2.4, 0.03, 1.2, 1.4, 1);
      CYL(cols, l.x, l.y, l.z, 1.4, 4);
      break;
    }
    default: break;
  }
  gb.pop();
}

// --------------------------------------------------------------------------------
export function buildFence(f, gb, cols, world, detail = 0) {
  const dx = f.x2 - f.x1, dz = f.z2 - f.z1;
  const L = Math.hypot(dx, dz);
  if (L < 0.5) return;
  const ux = dx / L, uz = dz / L;
  const yaw = Math.atan2(-dz, dx);
  const kind = f.kind;
  const spacing = kind === 'picket' ? 2.0 : kind === 'wire' ? 4 : 2.6;
  const H = kind === 'picket' ? 1.0 : kind === 'wire' ? 1.2 : kind === 'rail-white' ? 1.35 : 1.25;
  const postC = kind === 'rail-white' || kind === 'picket' ? 0xf4f1ea : kind === 'wire' ? 0x6a5a48 : 0x4a3a2c;
  const gap0 = f.gap ? L * 0.5 - 2.2 : 1e9, gap1 = f.gap ? L * 0.5 + 2.2 : -1e9;
  const n = Math.max(1, Math.round(L / spacing));
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * L;
    const x = f.x1 + ux * t, z = f.z1 + uz * t;
    const y = world.heightAt(x, z);
    const inGap = t > gap0 && t < gap1;
    if (!inGap) {
      gb.setColor(postC).setLayer(kind === 'rail' ? TEX.BARK : TEX.PAINTED);
      gb.push(); gb.translate(x, y, z); gb.rotateY(yaw);
      gb.box(0, H / 2 + 0.05, 0, kind === 'wire' ? 0.1 : 0.16, H + 0.1, kind === 'wire' ? 0.1 : 0.16, 1);
      gb.pop();
    }
    if (prev && !inGap && !(prev.t > gap0 && prev.t < gap1) && !(prev.t < gap0 && t > gap1)) {
      const rails = kind === 'picket' ? [0.3, 0.8] : kind === 'wire' ? [0.4, 0.75, 1.1] : kind === 'rail-white' ? [0.3, 0.65, 1.0, 1.3] : [0.35, 0.75, 1.15];
      gb.setColor(postC).setLayer(kind === 'rail' ? TEX.PLANKS : TEX.PAINTED);
      for (const ry of rails) {
        const th = kind === 'wire' ? 0.025 : kind === 'picket' ? 0.06 : 0.09;
        gb.beam(prev.x, prev.y + ry, prev.z, x, y + ry, z, th, 1);
      }
      if (kind === 'picket' && detail === 0) {
        const seg = Math.hypot(x - prev.x, z - prev.z);
        for (let p = 0.15; p < seg; p += 0.15) {
          const px = prev.x + ux * p, pz = prev.z + uz * p, py = prev.y + (y - prev.y) * (p / seg);
          gb.push(); gb.translate(px, py, pz); gb.rotateY(yaw); gb.box(0, 0.5, 0.04, 0.08, 1.0, 0.03, 1); gb.pop();
        }
      }
      // collider per segment
      const mx = (prev.x + x) / 2, mz = (prev.z + z) / 2, my = Math.max(prev.y, y);
      cols.push({ kind: 0, x: mx, y: my + H / 2, z: mz, hx: Math.hypot(x - prev.x, z - prev.z) / 2, hy: H / 2 + 0.1, hz: 0.08, rot: yaw, flags: COL.SOLID | COL.THIN, ref: { type: 'fence' } });
    }
    prev = { x, y, z, t };
  }
}

export function buildPole(p, gb, cols) {
  gb.push(); gb.translate(p.x, p.y, p.z); gb.rotateY(p.rot);
  gb.setColor(0x6a5440).setLayer(TEX.BARK);
  gb.cylinder(0, 0, 0, 0.13, 0.17, 9.2, 6, 0.6);
  gb.setColor(0x5a4636).setLayer(TEX.PLANKS);
  gb.box(0, 8.6, 0, 2.4, 0.14, 0.14, 1);
  gb.setColor(0x3a5a6a).setLayer(TEX.WHITE);
  for (const sx of [-1, 0, 1]) gb.box(sx * 1.05, 8.78, 0, 0.08, 0.2, 0.08, 1);
  gb.pop();
  cols.push({ kind: 2, x: p.x, y: p.y + 4.5, z: p.z, hx: 0.18, hy: 4.5, hz: 0.18, rot: 0, flags: COL.SOLID | COL.BULLET, ref: { type: 'wood' } });
}
// wire attach points for a pole (world)
export function poleAttach(p) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [-1, 0, 1].map((k) => [p.x + k * 1.05 * c, p.y + 8.9, p.z - k * 1.05 * s]);
}

// --------------------------------------------------------------------------------
// Road ribbons for one cell window. A segment belongs to the cell containing its midpoint.
export function buildRoads(world, x0, z0, x1, z1, gb, linesGb) {
  const cross = (r, k, across, zoff) => {
    const f = world.roadFrame(r, k);
    const pts = [];
    for (let a = 0; a <= across; a++) {
      const t = -r.width / 2 + (a / across) * r.width;
      const px = r.xs[k] + f.nx * t, pz = r.zs[k] + f.nz * t;
      pts.push([px, world.heightAt(px, pz) + zoff, pz]);
    }
    return { pts, f };
  };
  const nearOther = (r, x, z) => {
    const cand = world.roadIndex.get(((x / 64) | 0) + ',' + ((z / 64) | 0));
    if (!cand) return false;
    for (let q = 0; q < cand.length; q += 2) {
      const o = world.roads[cand[q]];
      if (o === r) continue;
      const s = cand[q + 1];
      if (Math.hypot(o.xs[s] - x, o.zs[s] - z) < o.width / 2 + r.width / 2 + 3) return true;
    }
    return false;
  };
  for (const r of world.roads) {
    const rt = ROAD_TYPES[r.type];
    const hw = r.width / 2;
    const layer = TEX[rt.layer];
    const zoff = rt.z + (r.id % 7) * 0.006;
    const across = r.type === 'highway' ? 4 : 2;
    let dist = 0;
    let prev = null;
    for (let k = 1; k < r.n; k++) {
      const seg = Math.hypot(r.xs[k] - r.xs[k - 1], r.zs[k] - r.zs[k - 1]);
      const mx = (r.xs[k] + r.xs[k - 1]) / 2, mz = (r.zs[k] + r.zs[k - 1]) / 2;
      const d0 = dist;
      dist += seg;
      if (!(mx >= x0 && mx < x1 && mz >= z0 && mz < z1)) { prev = null; continue; }
      const a = prev || cross(r, k - 1, across, zoff);
      const b = cross(r, k, across, zoff);
      prev = b;
      const sc = r.type === 'dirt' ? 6 : 8;
      const v0 = d0 / sc, v1 = dist / sc;
      gb.setColor(rt.color).setLayer(layer);
      const us = layer === TEX.DIRTROAD ? 1 : r.width / 8;
      for (let q = 0; q < across; q++) {
        const u0 = (q / across) * us, u1 = ((q + 1) / across) * us;
        gb.quad(a.pts[q], a.pts[q + 1], b.pts[q + 1], b.pts[q], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
      if (!rt.lines || !linesGb || nearOther(r, mx, mz)) continue;
      const lineQuad = (t, w, color) => {
        const p0x = r.xs[k - 1] + a.f.nx * t, p0z = r.zs[k - 1] + a.f.nz * t;
        const p1x = r.xs[k] + b.f.nx * t, p1z = r.zs[k] + b.f.nz * t;
        const y0 = world.heightAt(p0x, p0z) + zoff + 0.015, y1 = world.heightAt(p1x, p1z) + zoff + 0.015;
        linesGb.setColor(color).setLayer(TEX.PAINTED);
        linesGb.quad([p0x - a.f.nx * w, y0, p0z - a.f.nz * w], [p0x + a.f.nx * w, y0, p0z + a.f.nz * w], [p1x + b.f.nx * w, y1, p1z + b.f.nz * w], [p1x - b.f.nx * w, y1, p1z - b.f.nz * w]);
      };
      const yellow = 0xe8c032, white = 0xf2f2ea;
      if (rt.lines === 'highway') { lineQuad(-0.12, 0.06, yellow); lineQuad(0.12, 0.06, yellow); lineQuad(-hw + 0.35, 0.07, white); lineQuad(hw - 0.35, 0.07, white); }
      else if (rt.lines === 'country') { if (k % 3 !== 0) lineQuad(0, 0.07, yellow); lineQuad(-hw + 0.3, 0.06, white); lineQuad(hw - 0.3, 0.06, white); }
      else if (rt.lines === 'street') { if (k % 2 === 0) lineQuad(0, 0.06, white); }
    }
  }
}
