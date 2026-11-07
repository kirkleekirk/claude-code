// Furniture & props built from boxes and simple primitives, merged into the
// owning structure's geometry. Props use structure-local metres with
// y = floor height and a rotation r in quarter turns (front faces +Z at r=0).
import * as THREE from 'three';
import { rgb, mulc } from '../geom.js';

const FACE_CYCLE = ['pz', 'px', 'nz', 'nx'];
const rotFace = (f, r) => {
  const i = FACE_CYCLE.indexOf(f);
  return i < 0 ? f : FACE_CYCLE[(i + r) % 4];
};

// Context passed to prop builders: transforms prop-space boxes into structure space.
function makeCtx(builder, p, out) {
  const r = ((p.rot || 0) % 4 + 4) % 4;
  const cos = [1, 0, -1, 0][r], sin = [0, 1, 0, -1][r];
  const tx = (x, z) => [p.x + x * cos + z * sin, p.z - x * sin + z * cos];
  const ctx = {
    r,
    world: (x, y, z) => { const [a, b] = tx(x, z); return [a, p.y + y, b]; },
    box(key, x0, y0, z0, x1, y1, z1, color, faces = null, collide = false) {
      const [ax, az] = tx(x0, z0), [bx, bz] = tx(x1, z1);
      const X0 = Math.min(ax, bx), X1 = Math.max(ax, bx), Z0 = Math.min(az, bz), Z1 = Math.max(az, bz);
      let f = null;
      if (faces) {
        f = {};
        for (const k of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) if (faces[k] === false) f[rotFace(k, r)] = false;
      }
      builder.box(key, X0, p.y + y0, Z0, X1, p.y + y1, Z1, Array.isArray(color) ? color : rgb(color), f);
      if (collide) out.boxes.push({ min: [X0, p.y + y0, Z0], max: [X1, p.y + y1, Z1], kind: 'prop' });
    },
    solid(x0, y0, z0, x1, y1, z1) {
      const [ax, az] = tx(x0, z0), [bx, bz] = tx(x1, z1);
      out.boxes.push({ min: [Math.min(ax, bx), p.y + y0, Math.min(az, bz)], max: [Math.max(ax, bx), p.y + y1, Math.max(az, bz)], kind: 'prop' });
    },
    cyl(key, x, y, z, rad, h, color, seg = 12, axis = 'y') {
      const g = new THREE.CylinderGeometry(rad, rad, h, seg);
      const m = new THREE.Matrix4();
      const [wx, wz] = tx(x, z);
      if (axis === 'x' || axis === 'z') {
        // lying cylinder: rotate to lie along prop-space axis then apply prop rotation
        const ang = (axis === 'x' ? Math.PI / 2 : 0) + (r * Math.PI) / 2;
        m.makeRotationY(ang).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      }
      m.setPosition(wx, p.y + y, wz);
      builder.geometry(key, g, m, Array.isArray(color) ? color : rgb(color), 1);
      g.dispose();
    },
    sphere(key, x, y, z, rad, color, sy = 1) {
      const g = new THREE.SphereGeometry(rad, 10, 7);
      const m = new THREE.Matrix4().makeScale(1, sy, 1);
      const [wx, wz] = tx(x, z);
      m.setPosition(wx, p.y + y, wz);
      builder.geometry(key, g, m, Array.isArray(color) ? color : rgb(color), 1);
      g.dispose();
    },
    loot(table, x, y, z, label) {
      const w = ctx.world(x, y, z);
      out.interact.push({ type: 'loot', table, pos: w, label: label || 'Search', prop: p, searched: !!p.searched });
    },
  };
  return ctx;
}

const WOOD = '#b48a5c', DARKWOOD = '#6e4b33', WHITE = '#f2f0ea', STEEL = '#9da3a8';

export const PROPS = {
  bed(c, p) {
    const w = p.w || 1.5, L = 2.05;
    const blanket = p.color || '#7d8fa8';
    c.box('woodFurn', -w / 2, 0, -L / 2, w / 2, 0.32, L / 2, DARKWOOD, null, true);
    c.box('fabric', -w / 2 + 0.03, 0.32, -L / 2 + 0.05, w / 2 - 0.03, 0.52, L / 2 - 0.03, '#ece8de');
    c.box('fabric', -w / 2 + 0.01, 0.42, -L / 2 + 0.55, w / 2 - 0.01, 0.56, L / 2 - 0.0, blanket);
    c.box('fabric', -w / 2 + 0.01, 0.12, L / 2 - 0.02, w / 2 - 0.01, 0.42, L / 2 + 0.01, mulc(rgb(blanket), 0.9), { ny: false });
    const pw = w > 1.2 ? (w - 0.3) / 2 : w - 0.2;
    for (let i = 0; i < (w > 1.2 ? 2 : 1); i++) {
      const x0 = -w / 2 + 0.1 + i * (pw + 0.1);
      c.box('fabric', x0, 0.52, -L / 2 + 0.1, x0 + pw, 0.64, -L / 2 + 0.48, '#f6f4ee');
    }
    c.box('woodFurn', -w / 2 - 0.03, 0, -L / 2 - 0.05, w / 2 + 0.03, 1.05, -L / 2 + 0.02, DARKWOOD, null, true);
    c.box('woodFurn', -w / 2 - 0.03, 0, L / 2, w / 2 + 0.03, 0.6, L / 2 + 0.05, DARKWOOD);
  },
  couch(c, p) {
    const w = p.w || 2.0, d = 0.9, col = p.color || '#7a6a58';
    const cc = rgb(col);
    c.box('fabric', -w / 2, 0.08, -d / 2, w / 2, 0.42, d / 2, cc, null, true);
    c.box('fabric', -w / 2, 0.42, -d / 2, w / 2, 0.92, -d / 2 + 0.22, mulc(cc, 0.95), null, true);
    c.box('fabric', -w / 2, 0.42, -d / 2 + 0.22, -w / 2 + 0.2, 0.66, d / 2, mulc(cc, 0.93));
    c.box('fabric', w / 2 - 0.2, 0.42, -d / 2 + 0.22, w / 2, 0.66, d / 2, mulc(cc, 0.93));
    const n = Math.max(2, Math.round((w - 0.4) / 0.6));
    const cw = (w - 0.4) / n;
    for (let i = 0; i < n; i++) c.box('fabric', -w / 2 + 0.2 + i * cw + 0.01, 0.42, -d / 2 + 0.24, -w / 2 + 0.2 + (i + 1) * cw - 0.01, 0.52, d / 2 - 0.02, mulc(cc, 1.05));
    for (const x of [-w / 2 + 0.06, w / 2 - 0.1]) for (const z of [-d / 2 + 0.05, d / 2 - 0.09]) c.box('woodFurn', x, 0, z, x + 0.04, 0.08, z + 0.04, DARKWOOD);
  },
  armchair(c, p) { PROPS.couch(c, { ...p, w: 0.95 }); },
  table(c, p) {
    const w = p.w || 1.6, d = p.d || 0.9, h = 0.76;
    c.box('woodFurn', -w / 2, h - 0.04, -d / 2, w / 2, h, d / 2, p.color || WOOD, null, true);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.11]) for (const z of [-d / 2 + 0.05, d / 2 - 0.11]) c.box('woodFurn', x, 0, z, x + 0.06, h - 0.04, z + 0.06, p.color || WOOD);
    c.solid(-w / 2, 0, -d / 2, w / 2, h, d / 2);
  },
  chair(c, p) {
    const col = p.color || WOOD;
    c.box('woodFurn', -0.22, 0.43, -0.22, 0.22, 0.47, 0.22, col);
    for (const x of [-0.21, 0.17]) for (const z of [-0.21, 0.17]) c.box('woodFurn', x, 0, z, x + 0.04, 0.43, z + 0.04, col);
    c.box('woodFurn', -0.22, 0.47, -0.22, 0.22, 0.95, -0.19, col);
    c.solid(-0.22, 0, -0.22, 0.22, 0.6, 0.22);
  },
  counter(c, p) {
    const w = p.w || 2.0, d = 0.62, h = 0.9;
    const cab = p.color || '#e9e4d8';
    c.box('woodFurn', -w / 2, 0.1, -d / 2, w / 2, h - 0.04, d / 2 - 0.02, cab, null, true);
    c.box('plain:matte', -w / 2, 0, -d / 2, w / 2, 0.1, d / 2 - 0.08, '#3a3530');
    c.box('plain:plastic', -w / 2 - 0.01, h - 0.04, -d / 2, w / 2 + 0.01, h, d / 2 + 0.02, p.top || '#c9b99a');
    const n = Math.max(1, Math.round(w / 0.5));
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + (w * i) / n + 0.02, x1 = -w / 2 + (w * (i + 1)) / n - 0.02;
      c.box('woodFurn', x0, 0.14, d / 2 - 0.02, x1, 0.68, d / 2 + 0.005, mulc(rgb(cab), 0.95));
      c.box('woodFurn', x0, 0.7, d / 2 - 0.02, x1, h - 0.07, d / 2 + 0.005, mulc(rgb(cab), 0.95));
      c.box('plain:chrome', (x0 + x1) / 2 - 0.05, 0.62, d / 2 + 0.005, (x0 + x1) / 2 + 0.05, 0.635, d / 2 + 0.025, '#c8c8c8');
    }
    if (p.sink) {
      c.box('plain:chrome', -0.35, h - 0.005, -0.2, 0.35, h + 0.005, 0.2, '#b8bcc0');
      c.box('plain:chrome', -0.03, h, -d / 2 + 0.04, 0.03, h + 0.3, -d / 2 + 0.1, '#c8c8c8');
      c.box('plain:chrome', -0.03, h + 0.24, -d / 2 + 0.04, 0.03, h + 0.3, -d / 2 + 0.25, '#c8c8c8');
    }
    c.loot(p.loot || 'kitchen', 0, 0.8, d / 2, 'Search cabinets');
  },
  upper_cabinet(c, p) {
    const w = p.w || 2.0, d = 0.34;
    const cab = p.color || '#e9e4d8';
    c.box('woodFurn', -w / 2, 1.45, -d / 2, w / 2, 2.15, d / 2, cab, null, true);
    const n = Math.max(1, Math.round(w / 0.5));
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + (w * i) / n + 0.02, x1 = -w / 2 + (w * (i + 1)) / n - 0.02;
      c.box('woodFurn', x0, 1.48, d / 2, x1, 2.12, d / 2 + 0.02, mulc(rgb(cab), 0.95));
    }
  },
  fridge(c, p) {
    const col = p.color || '#ecebe6';
    c.box('plain:plastic', -0.38, 0, -0.33, 0.38, 1.72, 0.33, col, null, true);
    c.box('plain:plastic', -0.37, 1.12, 0.33, 0.37, 1.7, 0.35, mulc(rgb(col), 0.97));
    c.box('plain:plastic', -0.37, 0.05, 0.33, 0.37, 1.1, 0.35, mulc(rgb(col), 0.97));
    c.box('plain:chrome', 0.28, 1.2, 0.35, 0.31, 1.5, 0.39, '#bfbfbf');
    c.box('plain:chrome', 0.28, 0.75, 0.35, 0.31, 1.05, 0.39, '#bfbfbf');
    c.loot('fridge', 0, 1.0, 0.33, 'Search fridge');
  },
  stove(c, p) {
    const col = p.color || '#efeee9';
    c.box('plain:plastic', -0.38, 0, -0.31, 0.38, 0.9, 0.31, col, null, true);
    c.box('plain:matte', -0.37, 0.9, -0.3, 0.37, 0.91, 0.3, '#2a2a2a');
    for (const x of [-0.18, 0.18]) for (const z of [-0.13, 0.13]) c.cyl('plain:metal', x, 0.915, z, 0.09, 0.01, '#3b3b3b', 12);
    c.box('plain:plastic', -0.38, 0.9, -0.31, 0.38, 1.1, -0.25, col);
    c.box('plain:matte', -0.32, 0.15, 0.31, 0.32, 0.65, 0.32, '#202020');
    c.box('plain:chrome', -0.3, 0.7, 0.32, 0.3, 0.72, 0.36, '#c0c0c0');
  },
  bookshelf(c, p) {
    const w = p.w || 0.9, h = 1.9, d = 0.32;
    const col = p.color || DARKWOOD;
    c.box('woodFurn', -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.02, col, null, true);
    c.box('woodFurn', -w / 2, 0, -d / 2, -w / 2 + 0.02, h, d / 2, col);
    c.box('woodFurn', w / 2 - 0.02, 0, -d / 2, w / 2, h, d / 2, col);
    const shelves = 5;
    const bookCols = ['#7a2d26', '#2e4a6b', '#3b5d3a', '#a88a3c', '#5a3a5c', '#c9c2b0', '#24303e'];
    let seed = Math.floor(Math.abs(p.x * 13 + p.z * 7)) + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i <= shelves; i++) {
      const y = (i * (h - 0.04)) / shelves;
      c.box('woodFurn', -w / 2 + 0.02, y, -d / 2 + 0.02, w / 2 - 0.02, y + 0.03, d / 2, col);
      if (i < shelves) {
        let x = -w / 2 + 0.04;
        while (x < w / 2 - 0.08) {
          const bw = 0.03 + rnd() * 0.04, bh = 0.2 + rnd() * 0.12;
          if (rnd() < 0.12) { x += 0.06; continue; }
          c.box('plain:matte', x, y + 0.03, -d / 2 + 0.04, Math.min(x + bw, w / 2 - 0.04), y + 0.03 + bh, d / 2 - 0.03, bookCols[Math.floor(rnd() * bookCols.length)]);
          x += bw + 0.003;
        }
      }
    }
  },
  dresser(c, p) {
    const w = p.w || 1.1, d = 0.5, h = 0.85;
    const col = p.color || '#8a5f3e';
    c.box('woodFurn', -w / 2, 0.05, -d / 2, w / 2, h, d / 2, col, null, true);
    for (let i = 0; i < 3; i++) {
      const y0 = 0.1 + i * 0.25;
      c.box('woodFurn', -w / 2 + 0.03, y0, d / 2, w / 2 - 0.03, y0 + 0.22, d / 2 + 0.015, mulc(rgb(col), 1.08));
      for (const x of [-w / 4, w / 4]) c.box('plain:chrome', x - 0.04, y0 + 0.1, d / 2 + 0.015, x + 0.04, y0 + 0.12, d / 2 + 0.035, '#c9b27a');
    }
    c.loot(p.loot || 'bedroom', 0, 0.6, d / 2, 'Search dresser');
  },
  nightstand(c, p) {
    const col = p.color || '#8a5f3e';
    c.box('woodFurn', -0.24, 0.05, -0.2, 0.24, 0.6, 0.2, col, null, true);
    c.box('woodFurn', -0.21, 0.35, 0.2, 0.21, 0.55, 0.215, mulc(rgb(col), 1.08));
    c.cyl('plain:plastic', 0.0, 0.7, -0.02, 0.06, 0.2, '#d8c9a8', 10);
    c.cyl('fabric', 0.0, 0.9, -0.02, 0.13, 0.2, '#efe6cf', 12);
    c.loot('meds', 0, 0.5, 0.2, 'Search nightstand');
  },
  tv(c, p) {
    c.box('woodFurn', -0.6, 0, -0.22, 0.6, 0.5, 0.22, DARKWOOD, null, true);
    c.box('plain:plastic', -0.38, 0.5, -0.2, 0.38, 1.04, 0.18, '#2b2b2b');
    c.box('plain:matte', -0.32, 0.56, 0.18, 0.28, 0.98, 0.19, '#141820');
  },
  desk(c, p) {
    const col = p.color || WOOD;
    c.box('woodFurn', -0.65, 0.72, -0.32, 0.65, 0.76, 0.32, col, null, true);
    c.box('woodFurn', -0.65, 0, -0.32, -0.25, 0.72, 0.3, col, null, true);
    c.box('woodFurn', 0.6, 0, -0.32, 0.64, 0.72, 0.3, col);
    for (let i = 0; i < 3; i++) c.box('woodFurn', -0.63, 0.06 + i * 0.22, 0.3, -0.27, 0.25 + i * 0.22, 0.31, mulc(rgb(col), 1.1));
    c.loot(p.loot || 'office', -0.4, 0.6, 0.3, 'Search desk');
  },
  toilet(c, p) {
    c.box('plain:plastic', -0.19, 0, -0.32, 0.19, 0.42, 0.12, WHITE, null, true);
    c.box('plain:plastic', -0.21, 0.42, -0.32, 0.21, 0.45, 0.2, WHITE);
    c.box('plain:plastic', -0.22, 0.42, -0.36, 0.22, 0.8, -0.18, WHITE, null, true);
  },
  tub(c, p) {
    // long axis along x, back against the wall at -z
    c.box('plain:plastic', -0.85, 0, -0.38, 0.85, 0.55, 0.38, WHITE, { py: false }, true);
    c.box('plain:plastic', -0.85, 0.55, -0.38, -0.79, 0.56, 0.38, WHITE);
    c.box('plain:plastic', 0.79, 0.55, -0.38, 0.85, 0.56, 0.38, WHITE);
    c.box('plain:plastic', -0.79, 0.55, -0.38, 0.79, 0.56, -0.32, WHITE);
    c.box('plain:plastic', -0.79, 0.55, 0.32, 0.79, 0.56, 0.38, WHITE);
    c.box('plain:plastic', -0.79, 0.2, -0.32, 0.79, 0.21, 0.32, '#e4e8ea');
    c.box('plain:chrome', -0.8, 0.62, -0.05, -0.7, 0.66, 0.05, '#c8c8c8');
  },
  bath_sink(c, p) {
    c.box('plain:plastic', -0.08, 0, -0.25, 0.08, 0.78, -0.12, WHITE, null, true);
    c.box('plain:plastic', -0.3, 0.78, -0.27, 0.3, 0.88, 0.15, WHITE);
    c.box('plain:chrome', -0.02, 0.88, -0.24, 0.02, 1.0, -0.12, '#c8c8c8');
    // medicine cabinet with mirror
    c.box('woodFurn', -0.3, 1.25, -0.27, 0.3, 1.85, -0.17, WHITE);
    c.box('plain:chrome', -0.27, 1.28, -0.17, 0.27, 1.82, -0.165, '#c6d0d6');
    c.loot('meds', 0, 1.4, -0.15, 'Search medicine cabinet');
  },
  rug(c, p) {
    const w = p.w || 2.0, d = p.d || 1.4;
    c.box('carpet', -w / 2, 0, -d / 2, w / 2, 0.012, d / 2, p.color || '#8a4b3a', { ny: false });
    c.box('carpet', -w / 2 + 0.12, 0.012, -d / 2 + 0.12, w / 2 - 0.12, 0.014, d / 2 - 0.12, mulc(rgb(p.color || '#8a4b3a'), 1.3), { ny: false });
  },
  floor_lamp(c, p) {
    c.cyl('plain:metal', 0, 0.02, 0, 0.15, 0.04, '#3a3a3a', 14);
    c.cyl('plain:metal', 0, 0.8, 0, 0.015, 1.55, '#3a3a3a', 6);
    c.cyl('fabric', 0, 1.58, 0, 0.2, 0.25, '#efe4c8', 14);
    c.solid(-0.15, 0, -0.15, 0.15, 1.7, 0.15);
  },
  store_shelf(c, p) {
    const w = p.w || 1.8, d = 0.9, h = 1.6;
    c.box('plain:metal', -w / 2, 0, -0.04, w / 2, h, 0.04, '#d8d8d4', null, true);
    c.box('plain:metal', -w / 2, 0, -d / 2, -w / 2 + 0.03, h, d / 2, '#c8c8c4', null, true);
    c.box('plain:metal', w / 2 - 0.03, 0, -d / 2, w / 2, h, d / 2, '#c8c8c4', null, true);
    const goods = ['#c43c2a', '#e0b33a', '#3a6db0', '#4a8a4a', '#e8e2d0', '#7a4a8a', '#d86a2a'];
    let seed = Math.floor(Math.abs(p.x * 31 + p.z * 17)) + 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const y = 0.12 + i * 0.4;
        const z0 = s > 0 ? 0.04 : -d / 2, z1 = s > 0 ? d / 2 : -0.04;
        c.box('plain:metal', -w / 2 + 0.03, y, z0, w / 2 - 0.03, y + 0.025, z1, '#cfcfcb');
        let x = -w / 2 + 0.06;
        while (x < w / 2 - 0.15) {
          const bw = 0.08 + rnd() * 0.12, bh = 0.12 + rnd() * 0.18;
          if (rnd() < 0.3) { x += bw + 0.05; continue; }
          const zz0 = s > 0 ? 0.08 : -d / 2 + 0.06, zz1 = s > 0 ? d / 2 - 0.06 : -0.08;
          c.box('plain:matte', x, y + 0.025, zz0, x + bw, y + 0.025 + bh, zz1, goods[Math.floor(rnd() * goods.length)]);
          x += bw + 0.02;
        }
      }
    }
    c.loot(p.loot || 'store', 0, 1.0, d / 2, 'Search shelves');
  },
  checkout(c, p) {
    c.box('woodFurn', -1.0, 0, -0.35, 1.0, 0.95, 0.35, '#7a5a3a', null, true);
    c.box('plain:plastic', -1.02, 0.95, -0.37, 1.02, 0.99, 0.37, '#d9cfb8');
    c.box('plain:plastic', 0.3, 0.99, -0.25, 0.75, 1.2, 0.15, '#4a4a48');
    c.box('plain:plastic', 0.35, 1.2, -0.2, 0.7, 1.35, -0.05, '#3a3a38');
    c.loot(p.loot || 'register', 0.5, 1.0, -0.35, 'Search register');
  },
  workbench(c, p) {
    const w = p.w || 1.8;
    c.box('woodFurn', -w / 2, 0.86, -0.35, w / 2, 0.92, 0.35, '#a07a50', null, true);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.12]) for (const z of [-0.3, 0.23]) c.box('woodFurn', x, 0, z, x + 0.07, 0.86, z + 0.07, '#8a6a46');
    c.box('woodFurn', -w / 2 + 0.05, 0.25, -0.3, w / 2 - 0.05, 0.28, 0.3, '#8a6a46');
    c.box('plain:matte', -w / 2, 0.92, -0.35, w / 2, 1.9, -0.32, '#b8a27e');
    // tools on pegboard
    const tools = [['#8a2a22', 0.25, 0.08], ['#3a3a3a', 0.4, 0.05], ['#c8a03a', 0.2, 0.12], ['#3a5a8a', 0.3, 0.06]];
    tools.forEach(([col, h, wd], i) => {
      const x = -w / 2 + 0.25 + i * (w - 0.5) / 3;
      c.box('plain:paint', x, 1.3, -0.32, x + wd, 1.3 + h, -0.29, col);
    });
    c.box('plain:paint', 0.3, 0.92, -0.1, 0.62, 1.04, 0.12, '#b33a2a');
    c.loot('workshop', 0, 1.0, 0.35, 'Search workbench');
    c.solid(-w / 2, 0, -0.35, w / 2, 0.92, 0.35);
  },
  metal_shelf(c, p) {
    const w = p.w || 1.6;
    for (const x of [-w / 2, w / 2 - 0.04]) for (const z of [-0.25, 0.21]) c.box('plain:metal', x, 0, z, x + 0.04, 1.85, z + 0.04, '#5a6066');
    const boxCols = ['#b08a5a', '#a07a4a', '#c09a6a', '#6a6a6a', '#2a5a8a', '#8a2a22'];
    for (let i = 0; i < 4; i++) {
      const y = 0.15 + i * 0.55;
      c.box('plain:metal', -w / 2, y, -0.25, w / 2, y + 0.03, 0.25, '#7a8086');
      if (i < 3) {
        for (let j = 0; j < 3; j++) {
          const x0 = -w / 2 + 0.06 + j * (w - 0.12) / 3;
          if ((i + j + Math.floor(p.x)) % 3 === 0) continue;
          c.box('plain:matte', x0, y + 0.03, -0.2, x0 + (w - 0.12) / 3 - 0.06, y + 0.03 + 0.3, 0.2, boxCols[(i * 3 + j) % boxCols.length]);
        }
      }
    }
    c.solid(-w / 2, 0, -0.27, w / 2, 1.85, 0.27);
    c.loot(p.loot || 'garage', 0, 1.0, 0.25, 'Search shelves');
  },
  crate(c, p) {
    const s = p.s || 0.8;
    c.box('planks', -s / 2, 0, -s / 2, s / 2, s, s / 2, '#c8a878', null, true);
    for (const y of [0.05, s - 0.1]) c.box('planks', -s / 2 - 0.01, y, -s / 2 - 0.01, s / 2 + 0.01, y + 0.05, s / 2 + 0.01, '#a8885a');
    if (p.loot !== false) c.loot(p.loot || 'crate', 0, s * 0.6, 0, 'Search crate');
  },
  hay_bale(c, p) {
    c.box('hay', -0.45, 0, -0.23, 0.45, 0.4, 0.23, '#ffffff', null, true);
  },
  round_bale(c, p) {
    c.cyl('hay', 0, 0.75, 0, 0.75, 1.2, '#ffffff', 16, 'x');
    c.solid(-0.6, 0, -0.7, 0.6, 1.5, 0.7);
  },
  drum(c, p) {
    const col = p.color || '#2f5a8a';
    c.cyl('plain:metal', 0, 0.45, 0, 0.29, 0.9, col, 14);
    c.cyl('plain:metal', 0, 0.3, 0, 0.295, 0.03, mulc(rgb(col), 0.8), 14);
    c.cyl('plain:metal', 0, 0.6, 0, 0.295, 0.03, mulc(rgb(col), 0.8), 14);
    c.solid(-0.29, 0, -0.29, 0.29, 0.9, 0.29);
    if (p.loot) c.loot(p.loot, 0, 0.9, 0, 'Check drum');
  },
  toolchest(c, p) {
    c.box('plain:paint', -0.4, 0.06, -0.25, 0.4, 1.0, 0.25, '#a32a22', null, true);
    for (let i = 0; i < 6; i++) c.box('plain:chrome', -0.32, 0.18 + i * 0.13, 0.25, 0.32, 0.2 + i * 0.13, 0.27, '#cfcfcf');
    for (const x of [-0.33, 0.27]) for (const z of [-0.2, 0.14]) c.cyl('plain:matte', x + 0.03, 0.03, z + 0.03, 0.03, 0.06, '#222', 8);
    c.loot('workshop', 0, 0.8, 0.25, 'Search tool chest');
  },
  fireplace(c, p) {
    c.box('brick', -0.8, 0, -0.45, 0.8, 1.2, 0.05, '#ffffff', null, true);
    c.box('brick', -0.5, 1.2, -0.45, 0.5, 2.8, -0.05, '#ffffff', null, true);
    c.box('plain:matte', -0.45, 0.1, -0.1, 0.45, 0.8, 0.06, '#151210');
    c.box('woodFurn', -0.95, 1.2, -0.45, 0.95, 1.27, 0.15, DARKWOOD);
    c.box('stone', -0.9, 0, 0.05, 0.9, 0.06, 0.45, '#ffffff');
  },
  picture(c, p) {
    // small framed landscape: sky, distant hills, field
    const w = p.w || 0.6, h = p.h || 0.45;
    const pal = [
      ['#9cb8cf', '#5f7f58', '#c9a85a'], ['#d9a87a', '#6a5a7a', '#8a6a3a'], ['#b8c8d0', '#7a8a6a', '#d8c88a'],
      ['#6a8aa8', '#2f4a3a', '#a8b870'], ['#e8d8b8', '#9a8a6a', '#6a7a4a'],
    ][Math.abs(Math.floor(p.x * 7 + p.z * 13)) % 5];
    c.box('woodFurn', -w / 2, 1.4, 0, w / 2, 1.4 + h, 0.03, p.frame || '#5a3a24', { nz: false });
    const x0 = -w / 2 + 0.04, x1 = w / 2 - 0.04, y0 = 1.44, y1 = 1.36 + h, H = y1 - y0;
    c.box('plain:matte', x0, y0 + H * 0.55, 0.03, x1, y1, 0.036, pal[0], { nz: false });
    c.box('plain:matte', x0, y0 + H * 0.35, 0.03, x1, y0 + H * 0.55, 0.036, pal[1], { nz: false });
    c.box('plain:matte', x0, y0, 0.03, x1, y0 + H * 0.35, 0.036, pal[2], { nz: false });
  },
  ceiling_light(c, p) {
    c.cyl('plain:plastic', 0, 2.74, 0, 0.18, 0.06, '#f4efe0', 14);
  },
  washer(c, p) {
    c.box('plain:plastic', -0.3, 0, -0.3, 0.3, 0.9, 0.3, WHITE, null, true);
    c.cyl('plain:chrome', 0, 0.5, 0.3, 0.17, 0.02, '#9aa4ac', 16, 'z');
    c.loot('laundry', 0, 0.8, 0.3, 'Search');
  },
  bar_counter(c, p) {
    const w = p.w || 4;
    c.box('woodFurn', -w / 2, 0, -0.3, w / 2, 1.05, 0.3, '#5a3a24', null, true);
    c.box('woodFurn', -w / 2 - 0.05, 1.05, -0.35, w / 2 + 0.05, 1.1, 0.4, '#7a4a2a');
    c.box('plain:chrome', -w / 2, 0.15, 0.3, w / 2, 0.19, 0.36, '#b8a060');
    c.loot('bar', 0, 1.0, -0.3, 'Search behind bar');
  },
  stool(c, p) {
    c.cyl('plain:metal', 0, 0.38, 0, 0.025, 0.75, '#3a3a3a', 6);
    c.cyl('fabric', 0, 0.76, 0, 0.18, 0.06, p.color || '#8a2a22', 12);
    c.cyl('plain:metal', 0, 0.02, 0, 0.16, 0.03, '#3a3a3a', 12);
    c.solid(-0.18, 0, -0.18, 0.18, 0.8, 0.18);
  },
  booth(c, p) {
    const col = p.color || '#a3322a';
    c.box('fabric', -0.6, 0, -0.3, 0.6, 0.45, 0.3, col, null, true);
    c.box('fabric', -0.6, 0.45, -0.3, 0.6, 1.1, -0.15, mulc(rgb(col), 0.9), null, true);
  },
  pew(c, p) {
    const w = p.w || 3;
    c.box('woodFurn', -w / 2, 0.42, -0.25, w / 2, 0.47, 0.2, '#7a5034', null, true);
    c.box('woodFurn', -w / 2, 0.47, -0.25, w / 2, 0.95, -0.2, '#7a5034', null, true);
    for (const x of [-w / 2, w / 2 - 0.06]) c.box('woodFurn', x, 0, -0.28, x + 0.06, 0.95, 0.25, '#6a4428');
  },
  pallet(c, p) {
    c.box('planks', -0.6, 0, -0.5, 0.6, 0.14, 0.5, '#c8b088', null, true);
    if (p.load) c.box('plain:matte', -0.55, 0.14, -0.45, 0.55, 0.14 + p.load, 0.45, p.color || '#b08a5a', null, true);
  },
  tractor(c, p) {
    const col = p.color || '#3f7a3a';
    c.box('plain:paint', -0.45, 0.65, -1.4, 0.45, 1.35, 0.6, col, null, true);
    c.box('plain:paint', -0.42, 0.9, -1.45, 0.42, 1.3, -1.38, '#e0c040');
    c.cyl('plain:matte', -0.75, 0.85, 0.65, 0.85, 0.38, '#2a2a2a', 18, 'x');
    c.cyl('plain:matte', 0.75, 0.85, 0.65, 0.85, 0.38, '#2a2a2a', 18, 'x');
    c.cyl('plain:paint', -0.75, 0.85, 0.65, 0.5, 0.4, '#e0c040', 14, 'x');
    c.cyl('plain:paint', 0.75, 0.85, 0.65, 0.5, 0.4, '#e0c040', 14, 'x');
    c.cyl('plain:matte', -0.55, 0.45, -1.15, 0.45, 0.25, '#2a2a2a', 14, 'x');
    c.cyl('plain:matte', 0.55, 0.45, -1.15, 0.45, 0.25, '#2a2a2a', 14, 'x');
    c.box('plain:matte', -0.25, 1.35, 0.3, 0.25, 1.45, 0.8, '#222');
    c.box('plain:matte', -0.25, 1.45, 0.75, 0.25, 1.85, 0.82, '#222');
    c.cyl('plain:metal', 0, 1.6, -1.0, 0.03, 0.9, '#2a2a2a', 6);
    c.cyl('plain:matte', 0, 1.65, 0.15, 0.2, 0.04, '#222', 12);
    c.solid(-1.0, 0, -1.6, 1.0, 1.8, 1.1);
  },
  car_lift: () => {},
  church_altar(c, p) {
    c.box('woodFurn', -0.9, 0, -0.35, 0.9, 1.0, 0.35, '#6a4428', null, true);
    c.box('fabric', -0.95, 1.0, -0.4, 0.95, 1.03, 0.4, '#efe8d8');
    c.box('plain:chrome', -0.03, 1.03, -0.03, 0.03, 1.5, 0.03, '#c9a64a');
    c.box('plain:chrome', -0.15, 1.33, -0.03, 0.15, 1.38, 0.03, '#c9a64a');
  },
  piano(c, p) {
    c.box('woodFurn', -0.75, 0, -0.3, 0.75, 1.3, 0.05, '#2a1a12', null, true);
    c.box('woodFurn', -0.75, 0.65, 0.05, 0.75, 0.75, 0.3, '#2a1a12', null, true);
    c.box('plain:plastic', -0.7, 0.75, 0.1, 0.7, 0.77, 0.28, '#f4f2ea');
  },
  // Steps descending away from a floor edge (front = +z). p.h = total drop, p.w = width.
  steps(c, p) {
    const h = p.h || 0.5, w = p.w || 1.6;
    const n = Math.max(1, Math.round(h / 0.19) - 1);
    const rise = h / (n + 1), run = 0.3;
    const col = p.color || '#cfcbc2';
    const mat = p.mat || 'concrete';
    for (let i = 0; i < n; i++) {
      const top = -(i + 1) * rise;
      c.box(mat, -w / 2, -h - 0.25, i * run, w / 2, top, (i + 1) * run, col, { nz: i === 0 }, true);
    }
  },
  coat_rack: (c) => {
    c.cyl('woodFurn', 0, 0.9, 0, 0.025, 1.8, DARKWOOD, 6);
    c.cyl('woodFurn', 0, 0.02, 0, 0.18, 0.04, DARKWOOD, 10);
    c.box('fabric', -0.12, 1.1, -0.1, 0.12, 1.7, 0.1, '#5a4a3a');
    c.solid(-0.15, 0, -0.15, 0.15, 1.8, 0.15);
  },
};

export function buildProps(S, getBuilder, out) {
  for (const p of S.props) {
    const fn = PROPS[p.type];
    if (!fn) continue;
    const ctx = makeCtx(getBuilder(p), p, out);
    fn(ctx, p);
  }
}

// Catalogue for the build menu (player-placeable items).
export const FURNITURE_CATALOG = [
  { type: 'bed', name: 'Bed', cost: { wood: 6 } },
  { type: 'couch', name: 'Couch', cost: { wood: 5 } },
  { type: 'armchair', name: 'Armchair', cost: { wood: 3 } },
  { type: 'table', name: 'Table', cost: { wood: 4 } },
  { type: 'chair', name: 'Chair', cost: { wood: 1 } },
  { type: 'counter', name: 'Kitchen counter', cost: { wood: 4, stone: 1 } },
  { type: 'stove', name: 'Stove', cost: { metal: 4 } },
  { type: 'fridge', name: 'Fridge', cost: { metal: 5 } },
  { type: 'bookshelf', name: 'Bookshelf', cost: { wood: 4 } },
  { type: 'dresser', name: 'Dresser', cost: { wood: 3 } },
  { type: 'workbench', name: 'Workbench', cost: { wood: 6, metal: 2 } },
  { type: 'metal_shelf', name: 'Storage shelf', cost: { metal: 4 } },
  { type: 'crate', name: 'Storage crate', cost: { wood: 2 } },
  { type: 'rug', name: 'Rug', cost: { wood: 1 } },
  { type: 'floor_lamp', name: 'Floor lamp', cost: { metal: 1 } },
  { type: 'toolchest', name: 'Tool chest', cost: { metal: 3 } },
  { type: 'drum', name: 'Fuel drum', cost: { metal: 2 } },
  { type: 'hay_bale', name: 'Hay bale', cost: { wood: 1 } },
];
