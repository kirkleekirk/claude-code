import * as THREE from 'three';

// Searchable furniture, built hollow so what's inside is actually inside.
// Local frame for every container: origin at the floor centre of its footprint,
// +Z is the front (the side that opens), width w along X, depth d along Z.
//
//   shellParts(spec)  static body: panels, shelves, plinths (baked into the city mesh)
//   leafParts(spec)   moving parts: doors, lids, the top drawer (animated when opened)
//   slotList(spec)    where loot rests inside, with the space available at each spot
//
// Parts are boxes: [x, y, z, sx, sy, sz, color].

export const T = 0.03;

export const CONTAINER_SPECS = {
  dresser: { w: 1.05, d: 0.5, h: 0.92, color: 0x5a4030, inner: 0x4a3626, label: 'Dresser', style: 'drawer', rows: 3 },
  desk: { w: 0.62, d: 0.58, h: 0.74, color: 0x6a4a34, inner: 0x4c3828, label: 'Desk', style: 'drawer', rows: 2, top: 1.25, footW: 1.3 },
  toolbox: { w: 0.85, d: 0.5, h: 1.0, color: 0x8a2a1e, inner: 0x3c2a22, label: 'Tool Chest', style: 'drawer', rows: 4, sound: 'metal' },
  kitchen: { w: 1.7, d: 0.62, h: 0.88, color: 0xa89e88, inner: 0x6a6252, counter: 0x4a4440, label: 'Kitchen Cabinets', style: 'hinge2', shelves: [0.46], plinth: 0.08 },
  fridge: { w: 0.76, d: 0.7, h: 1.8, color: 0xc9c5b8, inner: 0xd4d6ce, label: 'Refrigerator', style: 'fridge', shelves: [0.5, 0.9, 1.38], sound: 'metal' },
  medcab: { w: 0.56, d: 0.24, h: 0.62, color: 0xc8c6be, inner: 0xa8a69c, label: 'Medicine Cabinet', style: 'hinge', shelves: [0.22, 0.42], mount: 1.3, sound: 'metal' },
  locker: { w: 0.62, d: 0.5, h: 1.9, color: 0x5a6468, inner: 0x444c50, label: 'Locker', style: 'hinge', shelves: [0.62, 1.5], sound: 'metal' },
  crate: { w: 0.95, d: 0.95, h: 0.78, color: 0x7a5c40, inner: 0x5a4430, label: 'Crate', style: 'lid' },
  military: { w: 1.1, d: 0.62, h: 0.56, color: 0x4d5233, inner: 0x3a4028, label: 'Military Crate', style: 'lid', sound: 'metal' },
  trunk: { w: 1.6, d: 0.95, h: 0.34, color: 0x2a2a2a, inner: 0x3a3834, label: 'Car Trunk', style: 'lid', sound: 'metal', flushLid: true },
  guardlocker: { w: 0.8, d: 0.55, h: 1.95, color: 0x2b3035, inner: 0x2a3034, accent: 0x9a1e18, label: 'Guard Weapons Locker', style: 'hinge2', shelves: [0.7, 1.45], sound: 'metal', locked: 'keycard' },
  crypt: { w: 0.95, d: 2.05, h: 0.78, color: 0x9a978c, inner: 0x4a4640, label: 'Burial Vault', style: 'lid', sound: 'stone', heavyLid: true },
};

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const DARK = 0x1c1c1c;

function drawerLayout(spec) {
  const base = 0.06;
  const rowH = (spec.h - base - T) / spec.rows;
  return { base, rowH, topY0: base + (spec.rows - 1) * rowH };
}

export function shellParts(spec) {
  const { w, d, h, color, inner } = spec;
  const p = [];
  const back = [0, h / 2, -d / 2 + T / 2, w, h, T, inner];
  const sideL = [-w / 2 + T / 2, h / 2, 0, T, h, d, color];
  const sideR = [w / 2 - T / 2, h / 2, 0, T, h, d, color];
  if (spec.style === 'lid') {
    p.push([0, T / 2, 0, w, T, d, inner]);
    p.push([0, h / 2, d / 2 - T / 2, w, h, T, color]);
    p.push([0, h / 2, -d / 2 + T / 2, w, h, T, color]);
    p.push([-w / 2 + T / 2, h / 2, 0, T, h, d - 2 * T, color]);
    p.push([w / 2 - T / 2, h / 2, 0, T, h, d - 2 * T, color]);
    // a darker liner so the inside reads as a hollow
    p.push([0, T + 0.002, 0, w - 2 * T, 0.004, d - 2 * T, shade(inner, 0.8)]);
    if (spec.style === 'lid' && !spec.flushLid) {
      const band = shade(color, 0.7);
      p.push([0, h * 0.5, d / 2 + 0.006, w + 0.01, 0.07, 0.012, band]);
      p.push([0, h * 0.5, -d / 2 - 0.006, w + 0.01, 0.07, 0.012, band]);
    }
    return p;
  }
  if (spec.style === 'drawer') {
    const { base, rowH } = drawerLayout(spec);
    p.push(back, sideL, sideR);
    p.push([0, h - T / 2, 0, w, T, d, color]);
    p.push([0, base / 2, 0, w, base, d, shade(color, 0.7)]);
    for (let i = 1; i < spec.rows; i++) p.push([0, base + i * rowH, -T / 2, w - 2 * T, 0.018, d - T, inner]);
    // lower drawer fronts are fixed
    const front = shade(color, 0.85);
    for (let i = 0; i < spec.rows - 1; i++) {
      const cy = base + i * rowH + rowH / 2;
      p.push([0, cy, d / 2 + 0.012, w - 0.03, rowH - 0.012, 0.024, front]);
      p.push([0, cy, d / 2 + 0.035, 0.18, 0.025, 0.025, DARK]);
    }
    if (spec.top) p.push([0, h + 0.02, 0, spec.top, 0.04, d + 0.06, shade(color, 1.1)]);
    return p;
  }
  // cabinets: fridge, locker, medicine cabinet, kitchen, guard locker
  const plinth = spec.plinth || 0;
  p.push(back, sideL, sideR);
  p.push([0, h - T / 2, 0, w, T, d, color]);
  if (plinth) p.push([0, plinth / 2, -0.02, w, plinth, d - 0.04, shade(color, 0.55)]);
  p.push([0, plinth + T / 2, 0, w - 2 * T, T, d - T, inner]);
  for (const y of spec.shelves || []) p.push([0, y, -T / 2, w - 2 * T, 0.02, d - T - 0.03, spec.style === 'fridge' ? 0xb8bcbc : inner]);
  if (spec.style === 'fridge') {
    // freezer compartment divider and a crisper drawer at the bottom
    p.push([0, 1.355, -T / 2, w - 2 * T, 0.04, d - T, color]);
    p.push([0, 0.2, 0.02, w - 2 * T - 0.02, 0.24, d - T - 0.08, 0xa9b3b0]);
  }
  if (spec.counter) p.push([0, h + 0.02, 0.01, w + 0.04, 0.04, d + 0.04, spec.counter]);
  if (spec.accent) p.push([0, h - 0.12, d / 2 + 0.002, w, 0.06, 0.004, spec.accent]);
  return p;
}

// Leaves are the moving parts. motion: 'hingeY' (door), 'hingeX' (lid), 'slide' (drawer).
export function leafParts(spec) {
  const { w, d, h, color } = spec;
  const col = shade(color, 0.92);
  if (spec.style === 'lid') {
    const lid = [[0, 0.022, d / 2, w + 0.02, 0.044, d + 0.02, spec.flushLid ? color : shade(color, 0.85)]];
    if (!spec.flushLid) lid.push([0, 0.05, d / 2, w * 0.2, 0.012, d * 0.9, shade(color, 0.65)]);
    return [{ pivot: [0, h, -d / 2], motion: 'hingeX', open: spec.heavyLid ? -0.75 : -1.9, parts: lid }];
  }
  if (spec.style === 'drawer') {
    const { rowH, topY0 } = drawerLayout(spec);
    const trayW = w - 2 * T - 0.02, trayD = d - T - 0.04, inner = spec.inner;
    return [{
      pivot: [0, topY0, d / 2],
      motion: 'slide',
      open: d * 0.62,
      parts: [
        [0, rowH / 2, 0.012, w - 0.03, rowH - 0.012, 0.024, col],
        [0, rowH / 2, 0.035, 0.18, 0.025, 0.025, DARK],
        [0, 0.012, -trayD / 2, trayW, 0.014, trayD, inner],
        [0, rowH * 0.35, -trayD, trayW, rowH * 0.6, 0.012, inner],
        [-trayW / 2, rowH * 0.35, -trayD / 2, 0.012, rowH * 0.6, trayD, inner],
        [trayW / 2, rowH * 0.35, -trayD / 2, 0.012, rowH * 0.6, trayD, inner],
      ],
    }];
  }
  const plinth = spec.plinth || 0;
  const door = (x0, x1, y0, y1, hingeLeft) => {
    const dw = x1 - x0, dh = y1 - y0;
    const pivotX = hingeLeft ? x0 : x1;
    const cx = hingeLeft ? dw / 2 : -dw / 2;
    const hx = hingeLeft ? dw - 0.06 : -dw + 0.06;
    const parts = [[cx, y0 + dh / 2, 0.012, dw - 0.006, dh - 0.006, 0.024, col], [hx, y0 + dh * (dh > 1 ? 0.55 : 0.5), 0.035, 0.025, Math.min(0.22, dh * 0.3), 0.025, DARK]];
    if (spec.accent) parts.push([cx, y0 + dh - 0.1, 0.026, dw * 0.8, 0.03, 0.004, spec.accent]);
    return { pivot: [pivotX, 0, d / 2], motion: 'hingeY', open: hingeLeft ? -1.95 : 1.95, parts };
  };
  if (spec.style === 'hinge2') return [door(-w / 2, 0, plinth, h - 0.004, true), door(0, w / 2, plinth, h - 0.004, false)];
  if (spec.style === 'fridge') return [door(-w / 2, w / 2, 0.02, 1.34, true), door(-w / 2, w / 2, 1.38, h - 0.004, true)];
  return [door(-w / 2, w / 2, plinth + 0.004, h - 0.004, true)];
}

// Resting spots for loot. p is in container space, or in the leaf's space when leaf is set.
// max is the free space [along x, height, along z].
export function slotList(spec) {
  const { w, d, h } = spec;
  if (spec.style === 'lid') {
    const out = [];
    for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
      out.push({ p: [sx * w / 4, T, sz * d / 4], max: [w / 2 - 0.08, h - T - 0.05, d / 2 - 0.08] });
    }
    return out;
  }
  if (spec.style === 'drawer') {
    const { rowH } = drawerLayout(spec);
    const trayW = w - 2 * T - 0.02, trayD = d - T - 0.04;
    const n = trayW > 0.7 ? 3 : 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ p: [(i - (n - 1) / 2) * (trayW / n), 0.02, -trayD / 2], max: [trayW / n - 0.03, rowH - 0.06, trayD - 0.05], leaf: 0 });
    }
    return out;
  }
  const plinth = spec.plinth || 0;
  const levels = [plinth + T, ...(spec.shelves || []).map((y) => y + 0.01)];
  if (spec.style === 'fridge') levels.splice(0, 1, 0.33); // on top of the crisper
  const ceil = [...(spec.shelves || []), h - T];
  const out = [];
  const inner = w - 2 * T;
  const n = inner > 0.9 ? 3 : inner > 0.45 ? 2 : 1;
  // middle shelves first: that's where your eye (and hand) goes
  const order = levels.map((y, i) => i).sort((a, b) => Math.abs(a - (levels.length - 1) / 2) - Math.abs(b - (levels.length - 1) / 2));
  for (const li of order) {
    const y = levels[li];
    let top = ceil[li] ?? h - T;
    if (spec.style === 'fridge' && y < 1.36 && top > 1.36) top = 1.34;
    const gap = top - y;
    if (gap < 0.1) continue;
    for (let i = 0; i < n; i++) {
      out.push({ p: [(i - (n - 1) / 2) * (inner / n), y, -0.01], max: [inner / n - 0.04, gap - 0.03, d - T - 0.06] });
    }
  }
  return out;
}

export function containerHeight(spec) {
  return spec.h + (spec.counter || spec.top ? 0.04 : 0);
}
