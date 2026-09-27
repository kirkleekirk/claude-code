import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// Painted-on detail: graffiti, the X-codes search teams left on doors, Living
// Guard stencils, placards and bloody handprints. Everything lives on one canvas
// atlas and every decal in a level is merged into one mesh.

const COLS = 4, ROWS = 8, SIZE = 1024;
const CW = SIZE / COLS, CH = SIZE / ROWS;

export const DECALS = {};
let _atlas = null;

function spray(g, text, x, y, size, color, rot, r) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `900 ${size}px "Arial Black", Impact, "Helvetica Neue", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // overspray halo
  g.shadowColor = color;
  g.shadowBlur = size * 0.35;
  g.fillStyle = color;
  g.globalAlpha = 0.9;
  g.fillText(text, 0, 0);
  g.shadowBlur = 0;
  // drips
  const w = g.measureText(text).width;
  for (let i = 0; i < 6; i++) {
    const dx = (r() - 0.5) * w, len = size * (0.3 + r() * 1.2);
    g.fillRect(dx, size * 0.2, 2 + r() * 2, len);
  }
  g.restore();
}

function stencil(g, lines, x, y, w, h, bg, fg) {
  g.fillStyle = bg;
  g.fillRect(x + 6, y + 6, w - 12, h - 12);
  g.strokeStyle = fg;
  g.lineWidth = 4;
  g.strokeRect(x + 12, y + 12, w - 24, h - 24);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    const sz = i === 0 ? 30 : 17;
    g.font = `700 ${sz}px "Courier New", monospace`;
    g.fillText(ln, x + w / 2, y + 36 + i * 30 + (lines.length === 1 ? h / 2 - 36 : 0));
  });
}

function xcode(g, x, y, r) {
  // the search mark: a big X with date, team, hazards and the count of the dead
  const cx = x + CW / 2, cy = y + CH / 2;
  g.save();
  g.strokeStyle = r() < 0.5 ? '#d8541e' : '#e8e2d0';
  g.fillStyle = g.strokeStyle;
  g.lineWidth = 7;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.moveTo(cx - 55, cy - 52); g.lineTo(cx + 55, cy + 52);
  g.moveTo(cx + 55, cy - 52); g.lineTo(cx - 55, cy + 52);
  g.stroke();
  g.font = '700 20px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const day = 1 + Math.floor(r() * 28);
  g.fillText(`9-${day}`, cx, cy - 44);
  g.fillText(r() < 0.5 ? 'TLG' : 'NG', cx - 58, cy);
  g.fillText(['NE', 'GAS', 'DOG', 'BIT', '--'][Math.floor(r() * 5)], cx + 62, cy);
  g.fillText(`${Math.floor(r() * 4)} DOA`, cx, cy + 44);
  g.restore();
}

function hand(g, x, y, r) {
  g.save();
  g.fillStyle = 'rgba(92,8,6,0.92)';
  for (let k = 0; k < 2; k++) {
    const hx = x + 70 + k * 110 + (r() - 0.5) * 20, hy = y + 70 + (r() - 0.5) * 10;
    g.beginPath();
    g.ellipse(hx, hy, 22, 26, 0, 0, Math.PI * 2);
    g.fill();
    for (let f = 0; f < 5; f++) {
      const a = -2.4 + f * 0.45;
      g.beginPath();
      g.ellipse(hx + Math.cos(a) * 34, hy + Math.sin(a) * 34, 6, 13, a + Math.PI / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(hx - 12, hy + 20, 5, 30 + r() * 30);
  }
  g.restore();
}

function smear(g, x, y, r) {
  g.save();
  g.strokeStyle = 'rgba(70,6,5,0.85)';
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    g.lineWidth = 8 + r() * 12;
    g.beginPath();
    g.moveTo(x + 20, y + 30 + i * 16);
    g.bezierCurveTo(x + 80, y + 20 + r() * 60, x + 160, y + 40 + r() * 60, x + CW - 20, y + 50 + i * 12);
    g.stroke();
  }
  g.restore();
}

export function decalAtlas() {
  if (_atlas) return _atlas;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const r = mulberry32(4242);
  let slot = 0;
  const cell = (name, draw) => {
    const col = slot % COLS, row = Math.floor(slot / COLS);
    slot++;
    const x = col * CW, y = row * CH;
    g.save();
    g.beginPath();
    g.rect(x, y, CW, CH);
    g.clip();
    draw(x, y);
    g.restore();
    // uv rect (v flipped: canvas y grows down)
    (DECALS[name] = DECALS[name] || []).push({ u0: x / SIZE, v0: 1 - (y + CH) / SIZE, u1: (x + CW) / SIZE, v1: 1 - y / SIZE });
  };
  const graffiti = [
    ['CURFEW 9PM', '#e8e2d0'], ['TLG = DEATH', '#c8261c'], ['THE GUARD LIES', '#e8e2d0'], ['DONT GO TO THE WALLS', '#d8541e'],
    ['DEAD INSIDE', '#c8261c'], ['NO GUARD HERE', '#e8e2d0'], ['THEY TOOK THEM ALL', '#d8541e'], ['HELP 3 INSIDE', '#e8e2d0'],
    ['WE WAIT FOR BOATS', '#8ac0b0'], ['GOD LEFT', '#c8261c'], ['PURGED 9/19', '#e8e2d0'], ['LISTEN FOR THE HORNS', '#d8541e'],
  ];
  for (const [t, col] of graffiti) cell('graffiti', (x, y) => spray(g, t, x + CW / 2, y + CH / 2, t.length > 14 ? 22 : 30, col, (r() - 0.5) * 0.18, r));
  for (let i = 0; i < 4; i++) cell('xcode', (x, y) => xcode(g, x, y, r));
  cell('guardsign', (x, y) => stencil(g, ['LIVING GUARD', 'CURFEW ZONE', 'VIOLATORS WILL BE PURGED'], x, y, CW, CH, '#7a1410', '#efe6d4'));
  cell('guardsign', (x, y) => stencil(g, ['9TH GARRISON', 'RESTRICTED AREA', 'LETHAL FORCE AUTHORIZED'], x, y, CW, CH, '#1e2328', '#d8392a'));
  cell('guardsign', (x, y) => stencil(g, ['LIVING GUARD', 'WE ARE YOUR FUTURE', 'REPORT THE INFECTED'], x, y, CW, CH, '#e6ded0', '#7a1410'));
  cell('placard', (x, y) => stencil(g, ['LOOTER'], x, y, CW, CH, '#d8cdb4', '#141414'));
  cell('placard', (x, y) => stencil(g, ['DESERTER'], x, y, CW, CH, '#d8cdb4', '#141414'));
  cell('placard', (x, y) => stencil(g, ['HID THE BITTEN'], x, y, CW, CH, '#d8cdb4', '#7a1410'));
  for (let i = 0; i < 2; i++) cell('hands', (x, y) => hand(g, x, y, r));
  for (let i = 0; i < 2; i++) cell('smear', (x, y) => smear(g, x, y, r));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _atlas = t;
  return t;
}

// Quads on walls and floors, merged into one mesh.
export class DecalBatch {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
    this.n = 0;
    decalAtlas();
  }

  // Place `kind` centred at (x,y,z) on a surface facing normal (nx,0,nz) or up (floor).
  add(kind, x, y, z, nx, nz, w, h, variant = null, up = false) {
    const list = DECALS[kind];
    if (!list) return;
    const uv = list[variant == null ? Math.floor(Math.random() * list.length) : variant % list.length];
    const n = new THREE.Vector3(nx, up ? 1 : 0, nz).normalize();
    const right = up ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(n.z, 0, -n.x);
    const upv = up ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const c = new THREE.Vector3(x, y, z).addScaledVector(n, 0.012);
    const corners = [[-1, -1, uv.u0, uv.v0], [1, -1, uv.u1, uv.v0], [1, 1, uv.u1, uv.v1], [-1, 1, uv.u0, uv.v1]];
    for (const [sx, sy, u, v] of corners) {
      const p = c.clone().addScaledVector(right, (sx * w) / 2).addScaledVector(upv, (sy * h) / 2);
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(u, v);
    }
    const b = this.n;
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: decalAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    m.renderOrder = 2;
    return m;
  }
}
