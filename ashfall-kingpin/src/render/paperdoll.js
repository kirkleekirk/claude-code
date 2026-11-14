// Layered paperdoll generator: body, outfit, hair, hat; 4 directions; idle/walk/shoot/hurt/KO frames.
// Recruit portraits come from the same parameters. Dogs, vehicles and held guns live here too.
import { RAMPS } from '../data/palette.js';
import { createCanvas, ctx2d, outlineSprite } from './canvas.js';

const K = RAMPS;
const cache = new Map();
export const FRAME_W = 16, FRAME_H = 20;

export const SKINS = [K.sand[3], K.sand[2], K.wood[3], K.wood[2], K.bone[2], K.rust[3]];
export const HAIRS = [K.ink[0], K.wood[0], K.wood[1], K.sand[2], K.bone[1], K.rust[2], K.ink[2]];
export const CLOTH = ['rust', 'wood', 'sand', 'olive', 'teal', 'sea', 'ink', 'bone', 'amber', 'green', 'heat', 'gold'];

// Appearance: { skin, hair, hairStyle 0-5, hat 0-6, hatC, top ramp, top2 ramp, topStyle, pants ramp, boots }
export function randomLook(rand, overrides = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  return {
    skin: pick(SKINS), hair: pick(HAIRS), hairStyle: Math.floor(rand() * 6), hat: rand() < 0.45 ? 1 + Math.floor(rand() * 4) : 0,
    hatC: pick(CLOTH), top: pick(CLOTH), top2: pick(CLOTH), topStyle: pick(['shirt', 'jacket', 'vest', 'shirt', 'apron']),
    pants: pick(['wood', 'ink', 'sea', 'olive', 'sand']), boots: pick([K.ink[1], K.wood[0], K.ink[0]]), ...overrides,
  };
}

export function lookKey(L) { return [L.skin, L.hair, L.hairStyle, L.hat, L.hatC, L.top, L.top2, L.topStyle, L.pants, L.boots].join('|'); }

// dir: 0 down, 1 up, 2 side (faces right; flip for left). frame: 0-1 idle, 2-5 walk, 6 shoot.
function drawBody(g, L, dir, frame) {
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const top = K[L.top] || K.rust, top2 = K[L.top2] || K.bone, pants = K[L.pants] || K.wood, hat = K[L.hatC] || K.wood;
  const walk = frame >= 2 && frame <= 5 ? frame - 2 : -1;
  const bob = frame === 1 || walk === 1 || walk === 3 ? 1 : 0;
  const y0 = bob;
  const legA = walk === 1 ? -1 : walk === 3 ? 1 : 0, legB = -legA;
  const robe = L.topStyle === 'robe';
  if (dir === 2) {
    // Side view
    if (!robe) {
      r(7 + (walk === 1 ? 2 : walk === 3 ? -2 : 0), 14, 3, 4, pants[1]);
      r(6 + (walk === 1 ? -2 : walk === 3 ? 2 : 0), 14, 3, 4, pants[2]);
      r(6 + (walk === 1 ? -2 : walk === 3 ? 2 : 0), 18, 4, 2, L.boots);
      r(7 + (walk === 1 ? 2 : walk === 3 ? -2 : 0), 18, 4, 2, L.boots);
    } else { r(5, 14, 7, 5, top[1]); r(5, 19, 7, 1, L.boots); }
    r(5, 8 + y0, 7, 7, top[2]); r(5, 8 + y0, 2, 7, top[3]); r(10, 8 + y0, 2, 7, top[1]);
    if (L.topStyle === 'armor') { r(6, 9 + y0, 5, 3, K.ink[3]); }
    r(5, 13 + y0, 7, 1, K.ink[1]);
    const armX = frame === 6 ? 10 : 8;
    r(armX, 9 + y0, 3, frame === 6 ? 2 : 4, top[1]);
    r(armX + (frame === 6 ? 3 : 0), frame === 6 ? 9 + y0 : 13 + y0, 2, 2, L.skin);
    r(6, 2 + y0, 6, 6, L.skin); r(11, 4 + y0, 1, 2, L.skin); r(10, 4 + y0, 1, 1, K.ink[0]);
    drawHair(r, L, 2, y0); drawHat(r, L, 2, y0, hat);
    return;
  }
  // Legs
  if (!robe) {
    r(5, 14 + Math.min(0, legA), 3, 4, pants[1]); r(9, 14 + Math.min(0, legB), 3, 4, pants[1]);
    r(5, 14, 1, 4, pants[2]); r(9, 14, 1, 4, pants[2]);
    r(5, 18 + legA, 3, 2 - Math.max(0, legA), L.boots); r(9, 18 + legB, 3, 2 - Math.max(0, legB), L.boots);
  } else { r(4, 14, 9, 5, top[1]); r(4, 14, 2, 5, top[2]); r(4, 19, 9, 1, L.boots); }
  // Torso
  r(4, 8 + y0, 9, 7, top[2]); r(4, 8 + y0, 2, 7, top[3]); r(11, 8 + y0, 2, 7, top[1]);
  if (dir === 0) {
    if (L.topStyle === 'jacket') { r(7, 8 + y0, 3, 7, top2[2]); r(8, 8 + y0, 1, 7, K.ink[1]); }
    if (L.topStyle === 'vest') { r(4, 8 + y0, 2, 7, L.skin); r(11, 8 + y0, 2, 7, L.skin); r(7, 9 + y0, 3, 5, top2[2]); }
    if (L.topStyle === 'apron') { r(6, 10 + y0, 5, 5, top2[3]); }
    if (L.topStyle === 'armor') { r(5, 9 + y0, 7, 3, K.ink[3]); r(7, 10 + y0, 3, 1, K.teal[3]); }
    if (L.topStyle === 'robe') { r(7, 8 + y0, 3, 2, K.heat[2]); }
  }
  r(4, 13 + y0, 9, 1, K.ink[1]);
  // Arms + hands
  const swing = walk === 0 ? -1 : walk === 2 ? 1 : 0;
  if (frame === 6 && dir === 0) { r(3, 9 + y0, 2, 3, top[1]); r(12, 9 + y0, 2, 5, top[1]); r(12, 14 + y0, 2, 2, L.skin); }
  else {
    r(2, 9 + y0 + swing, 2, 4, top[1]); r(13, 9 + y0 - swing, 2, 4, top[1]);
    r(2, 13 + y0 + swing, 2, 2, L.skin); r(13, 13 + y0 - swing, 2, 2, L.skin);
  }
  // Head
  r(5, 2 + y0, 7, 6, L.skin); r(5, 7 + y0, 7, 1, K.ink[1]);
  if (dir === 0) { r(6, 5 + y0, 1, 1, K.ink[0]); r(10, 5 + y0, 1, 1, K.ink[0]); r(5, 2 + y0, 1, 5, shade(L.skin)); }
  drawHair(r, L, dir, y0);
  drawHat(r, L, dir, y0, hat);
}

function shade(c) { return c === K.sand[3] ? K.sand[2] : c === K.sand[2] ? K.sand[1] : c === K.wood[3] ? K.wood[2] : c === K.wood[2] ? K.wood[1] : c === K.bone[2] ? K.bone[1] : K.rust[2]; }

function drawHair(r, L, dir, y0) {
  const c = L.hair;
  if (L.hat === 4) return;
  const s = L.hairStyle;
  if (s === 3) return;
  if (dir === 1) { r(5, 1 + y0, 7, 6, c); if (s === 4) r(7, 7 + y0, 3, 4, c); if (s === 1) r(4, 3 + y0, 9, 6, c); return; }
  if (dir === 2) { r(6, 1 + y0, 6, 2, c); r(6, 3 + y0, 2, 3, c); if (s === 1) r(5, 3 + y0, 2, 6, c); if (s === 4) r(4, 4 + y0, 2, 4, c); if (s === 2) r(8, 0 + y0, 3, 2, c); return; }
  if (s === 2) { r(7, 0 + y0, 3, 3, c); return; }
  if (s === 5) { r(5, 2 + y0, 7, 1, c); return; }
  r(5, 1 + y0, 7, 2, c); r(5, 3 + y0, 1, 2, c); r(11, 3 + y0, 1, 2, c);
  if (s === 1) { r(4, 3 + y0, 1, 6, c); r(12, 3 + y0, 1, 6, c); }
}

function drawHat(r, L, dir, y0, hat) {
  switch (L.hat) {
    case 1: r(5, 0 + y0, 7, 3, hat[2]); r(5, 0 + y0, 7, 1, hat[3]); if (dir === 0) r(4, 3 + y0, 9, 1, hat[1]); if (dir === 2) r(11, 2 + y0, 3, 1, hat[1]); break;
    case 2: r(6, -1 + y0, 5, 3, hat[2]); r(3, 2 + y0, 11, 1, hat[1]); r(6, 1 + y0, 5, 1, K.ink[1]); break;
    case 3: r(4, 0 + y0, 9, 5, K.ink[3]); r(4, 0 + y0, 9, 1, K.bone[0]); if (dir === 0) r(5, 4 + y0, 7, 1, K.ink[0]); break;
    case 4: r(4, 0 + y0, 9, 8, hat[1]); r(4, 0 + y0, 2, 8, hat[2]); if (dir === 0) { r(6, 3 + y0, 5, 4, L.skin); r(7, 5 + y0, 1, 1, K.ink[0]); r(9, 5 + y0, 1, 1, K.ink[0]); } if (dir === 2) r(9, 3 + y0, 3, 4, L.skin); break;
    case 5: r(5, 1 + y0, 7, 2, hat[2]); if (dir !== 0) r(4, 3 + y0, 2, 2, hat[2]); break;
    case 6: r(5, 0 + y0, 7, 3, hat[3]); r(5, 2 + y0, 7, 1, hat[1]); break;
    default: break;
  }
}

// Returns { frames: [dir][frame] canvases (dir 3 = left, mirrored), ko, w, h }.
export function characterSheet(L) {
  const key = 'char:' + lookKey(L);
  if (cache.has(key)) return cache.get(key);
  const frames = [[], [], [], []];
  for (const dir of [0, 1, 2]) {
    for (let f = 0; f < 7; f++) {
      const c = createCanvas(FRAME_W, FRAME_H);
      drawBody(ctx2d(c), L, dir, f);
      frames[dir][f] = outlineSprite(c, K.ink[0]);
      if (dir === 2) {
        const m = createCanvas(frames[2][f].width, frames[2][f].height);
        const mg = ctx2d(m);
        mg.translate(m.width, 0); mg.scale(-1, 1); mg.drawImage(frames[2][f], 0, 0);
        frames[3][f] = m;
      }
    }
  }
  const ko = createCanvas(FRAME_H + 2, FRAME_W + 2);
  const kg = ctx2d(ko);
  kg.translate(ko.width / 2, ko.height / 2); kg.rotate(Math.PI / 2); kg.drawImage(frames[0][0], -frames[0][0].width / 2, -frames[0][0].height / 2);
  const out = { frames, ko, w: FRAME_W + 2, h: FRAME_H + 2 };
  cache.set(key, out);
  return out;
}

export function dogSheet(colorRamp = 'wood') {
  const key = 'dog:' + colorRamp;
  if (cache.has(key)) return cache.get(key);
  const c = K[colorRamp] || K.wood;
  const frames = [[], [], [], []];
  for (const dir of [0, 1, 2]) for (let f = 0; f < 4; f++) {
    const can = createCanvas(16, 14);
    const g = ctx2d(can);
    const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const step = f % 2;
    if (dir === 2) {
      r(2, 5, 10, 5, c[2]); r(2, 5, 10, 1, c[3]); r(11, 2, 4, 5, c[2]); r(14, 4, 2, 2, c[1]); r(12, 3, 1, 1, K.ink[0]); r(11, 1, 2, 2, c[1]);
      r(0, 4, 3, 2, c[1]);
      r(3 + step, 10, 2, 4, c[1]); r(9 - step, 10, 2, 4, c[1]);
    } else {
      r(5, 3, 6, 9, c[2]); r(5, 3, 2, 9, c[3]);
      if (dir === 0) { r(5, 0, 6, 5, c[2]); r(6, 2, 1, 1, K.ink[0]); r(9, 2, 1, 1, K.ink[0]); r(7, 4, 2, 1, K.ink[0]); r(4, 0, 2, 2, c[1]); r(10, 0, 2, 2, c[1]); }
      else { r(7, 11, 2, 3, c[1]); r(4, 1, 2, 2, c[1]); r(10, 1, 2, 2, c[1]); }
      r(5, 11 + step, 2, 3 - step, c[1]); r(9, 11 + (1 - step), 2, 2 + step, c[1]);
    }
    frames[dir][f] = outlineSprite(can, K.ink[0]);
    if (dir === 2) {
      const m = createCanvas(frames[2][f].width, frames[2][f].height);
      const mg = ctx2d(m); mg.translate(m.width, 0); mg.scale(-1, 1); mg.drawImage(frames[2][f], 0, 0);
      frames[3][f] = m;
    }
  }
  const ko = createCanvas(18, 16);
  const kg = ctx2d(ko); kg.translate(9, 8); kg.rotate(Math.PI / 2); kg.drawImage(frames[2][0], -9, -8);
  const out = { frames, ko, w: 18, h: 16 };
  cache.set(key, out);
  return out;
}

// Held gun silhouettes per family, drawn pointing right; rotated at render time around (gx, gy).
const GUNS = {
  sidearm: [10, 5, (r) => { r(0, 0, 9, 2, K.ink[2]); r(0, 0, 9, 1, K.ink[3]); r(1, 2, 3, 3, K.wood[1]); }],
  shotgun: [15, 5, (r) => { r(0, 0, 15, 2, K.ink[2]); r(0, 0, 15, 1, K.ink[3]); r(0, 2, 5, 3, K.wood[2]); r(7, 2, 4, 1, K.wood[1]); }],
  rifle: [17, 5, (r) => { r(0, 1, 17, 1, K.ink[2]); r(3, 0, 10, 2, K.ink[3]); r(0, 2, 5, 3, K.wood[2]); r(8, 2, 2, 2, K.ink[1]); }],
  smg: [12, 6, (r) => { r(0, 0, 12, 3, K.ink[2]); r(0, 0, 12, 1, K.ink[3]); r(5, 3, 2, 3, K.ink[1]); r(1, 3, 2, 2, K.ink[1]); }],
  silent: [13, 7, (r) => { r(0, 3, 12, 2, K.wood[2]); r(9, 0, 2, 7, K.wood[1]); r(8, 3, 5, 1, K.bone[2]); r(0, 4, 4, 3, K.wood[1]); }],
  heavy: [18, 7, (r) => { r(0, 1, 18, 3, K.ink[2]); r(0, 1, 18, 1, K.ink[3]); r(4, 4, 5, 3, K.ink[1]); r(0, 3, 4, 3, K.ink[1]); r(14, 0, 2, 1, K.ink[3]); }],
};

export function gunSprite(family) {
  const key = 'gun:' + family;
  if (cache.has(key)) return cache.get(key);
  const [w, h, draw] = GUNS[family] || GUNS.sidearm;
  const c = createCanvas(w, h);
  const g = ctx2d(c);
  draw((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
  const out = outlineSprite(c, K.ink[0]);
  cache.set(key, out);
  return out;
}

export function portrait(L, bg = K.ink[2]) {
  const key = 'por:' + lookKey(L) + bg;
  if (cache.has(key)) return cache.get(key);
  const c = createCanvas(32, 32);
  const g = ctx2d(c);
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const top = K[L.top] || K.rust, top2 = K[L.top2] || K.bone, hat = K[L.hatC] || K.wood;
  r(0, 0, 32, 32, bg); r(0, 0, 32, 1, K.ink[3]);
  r(4, 24, 24, 8, top[2]); r(4, 24, 5, 8, top[3]); r(23, 24, 5, 8, top[1]);
  if (L.topStyle === 'jacket') { r(13, 24, 6, 8, top2[2]); r(15, 24, 2, 8, K.ink[1]); }
  if (L.topStyle === 'armor') { r(8, 26, 16, 4, K.ink[3]); }
  if (L.topStyle === 'robe') { r(4, 22, 24, 10, top[1]); }
  r(13, 20, 6, 5, shade(L.skin));
  r(9, 7, 14, 15, L.skin); r(9, 7, 2, 15, shade(L.skin)); r(9, 21, 14, 1, K.ink[1]);
  r(12, 13, 3, 2, K.bone[3]); r(18, 13, 3, 2, K.bone[3]); r(13, 13, 2, 2, K.ink[0]); r(19, 13, 2, 2, K.ink[0]);
  r(12, 11, 3, 1, L.hair); r(18, 11, 3, 1, L.hair);
  r(16, 14, 1, 4, shade(L.skin)); r(14, 18, 5, 1, K.rust[1]);
  const s = L.hairStyle;
  if (L.hat !== 4 && s !== 3) {
    if (s === 2) r(14, 2, 4, 7, L.hair);
    else if (s === 5) r(9, 6, 14, 2, L.hair);
    else { r(8, 4, 16, 4, L.hair); r(8, 8, 2, 6, L.hair); r(22, 8, 2, 6, L.hair); if (s === 1) { r(7, 8, 3, 14, L.hair); r(22, 8, 3, 14, L.hair); } if (s === 4) r(22, 10, 4, 8, L.hair); }
  }
  switch (L.hat) {
    case 1: r(8, 3, 16, 5, hat[2]); r(8, 3, 16, 1, hat[3]); r(6, 8, 20, 2, hat[1]); break;
    case 2: r(11, 0, 10, 6, hat[2]); r(4, 6, 24, 2, hat[1]); r(11, 4, 10, 1, K.ink[1]); break;
    case 3: r(8, 2, 16, 9, K.ink[3]); r(8, 2, 16, 1, K.bone[0]); r(9, 10, 14, 2, K.ink[0]); break;
    case 4: r(6, 2, 20, 22, hat[1]); r(6, 2, 4, 22, hat[2]); r(11, 9, 10, 12, L.skin); r(13, 13, 2, 2, K.ink[0]); r(18, 13, 2, 2, K.ink[0]); break;
    case 5: r(8, 4, 16, 4, hat[2]); r(22, 6, 4, 4, hat[2]); break;
    case 6: r(8, 2, 16, 6, hat[3]); r(8, 6, 16, 2, hat[1]); break;
    default: break;
  }
  r(0, 31, 32, 1, K.ink[0]); r(31, 0, 1, 32, K.ink[0]);
  cache.set(key, c);
  return c;
}

// Vehicles: drawn facing right; renderer rotates by heading.
const VEH = {
  handcart: [16, 12, (r) => { r(1, 2, 12, 7, K.wood[2]); r(1, 2, 12, 1, K.wood[3]); r(3, 9, 3, 3, K.ink[1]); r(9, 9, 3, 3, K.ink[1]); r(12, 4, 4, 1, K.wood[1]); }],
  buggy: [28, 18, (r) => { r(2, 3, 24, 12, K.rust[2]); r(2, 3, 24, 2, K.rust[3]); r(9, 5, 9, 8, K.ink[1]); r(10, 6, 7, 6, K.sea[1]); r(0, 0, 7, 4, K.ink[0]); r(0, 14, 7, 4, K.ink[0]); r(20, 0, 7, 4, K.ink[0]); r(20, 14, 7, 4, K.ink[0]); r(24, 7, 4, 4, K.gold[2]); }],
  hauler: [36, 22, (r) => { r(1, 2, 34, 18, K.ink[3]); r(1, 2, 34, 2, K.bone[0]); r(24, 4, 10, 14, K.ink[2]); r(26, 6, 6, 10, K.sea[1]); r(3, 5, 19, 12, K.olive[1]); for (let x = 5; x < 22; x += 4) r(x, 5, 1, 12, K.olive[0]); r(2, 0, 8, 3, K.ink[0]); r(2, 19, 8, 3, K.ink[0]); r(25, 0, 8, 3, K.ink[0]); r(25, 19, 8, 3, K.ink[0]); r(34, 7, 2, 8, K.gold[2]); }],
  convoy: [36, 22, (r) => { r(1, 2, 34, 18, K.teal[2]); r(1, 2, 34, 2, K.teal[3]); r(24, 4, 10, 14, K.teal[1]); r(26, 6, 6, 10, K.sea[1]); r(3, 5, 19, 12, K.sand[1]); r(2, 0, 8, 3, K.ink[0]); r(2, 19, 8, 3, K.ink[0]); r(25, 0, 8, 3, K.ink[0]); r(25, 19, 8, 3, K.ink[0]); }],
};

export function vehicleSprite(type) {
  const key = 'veh:' + type;
  if (cache.has(key)) return cache.get(key);
  const [w, h, draw] = VEH[type] || VEH.buggy;
  const c = createCanvas(w, h);
  const g = ctx2d(c);
  draw((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
  const out = outlineSprite(c, K.ink[0]);
  cache.set(key, out);
  return out;
}
