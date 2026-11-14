// Dynamic 3D models: articulated box characters driven by the same paperdoll "look" parameters as
// the 2D sprites, dogs, vehicles, held guns, Hollow facilities and plants. Local +X is forward.
import { PRIM, PAT } from './glcore.js';
import { PAL, rgb } from './static.js';
import { IDENT, affMul, affT, affRotZ, affRotX, affRotY, affPlace } from './math.js';

const hexCache = new Map();
const hx = (h) => { let c = hexCache.get(h); if (!c) { c = rgb(h); hexCache.set(h, c); } return c; };
const F = PAT.FLAT;
const LEG = 6.5, TORSO = 7, HEAD = 5.6;
const GUN = { sidearm: [5, 1.1, 0], smg: [7, 1.3, 2], shotgun: [10, 1.4, 4], rifle: [12, 1.1, 4.5], silent: [9, 1.1, 3], heavy: [13, 2, 4] };

function gun(b, M, family, handY) {
  const g = GUN[family] || GUN.sidearm;
  const K = PAL;
  // Along the arm's local -Y (the direction the hand points).
  b.add(PRIM.CUBE, M, -g[1] / 2, handY - g[0], -g[1] / 2, g[1], g[0], g[1], K.ink[2], F);
  if (g[2]) b.add(PRIM.CUBE, M, -g[1] / 2 - 0.2, handY - 1 + 0.5, -g[1] / 2 - 0.2, g[1] + 0.4, g[2], g[1] + 0.4, K.wood[2], F);
  if (family === 'silent') b.add(PRIM.CUBE, M, -0.5, handY - 6, -4, 1, 1, 8, K.wood[1], F);
  if (family === 'heavy' || family === 'smg') b.add(PRIM.CUBE, M, 0.4, handY - g[0] * 0.55, -0.6, 2.4, 1.2, 1.2, K.ink[1], F);
}

// o: { x, z, y0, face, look, moving, anim, sneak, roll(0..1|null), down, flash, gun, aim, shield, scale, time, id }
export function emitCharacter(b, o) {
  const L = o.look;
  const fl = o.flash > 0 ? Math.min(1, o.flash * 6) : 0;
  const fc = (c) => (fl ? [c[0] + (1 - c[0]) * fl, c[1] + (1 - c[1]) * fl, c[2] + (1 - c[2]) * fl] : c);
  const skin = fc(hx(L.skin)), hair = fc(hx(L.hair)), boots = fc(hx(L.boots));
  const top = PAL[L.top] || PAL.rust, top2 = PAL[L.top2] || PAL.bone, pants = PAL[L.pants] || PAL.wood, hat = PAL[L.hatC] || PAL.wood;
  const tC = fc(top[2]), tD = fc(top[1]), pC = fc(pants[1]);
  let M = affPlace(o.x, o.y0 || 0, o.z, o.face);
  const s = o.scale || 1;
  if (s !== 1) M = [M[0] * s, M[1] * s, M[2] * s, M[3], M[4] * s, M[5] * s, M[6] * s, M[7], M[8] * s, M[9] * s, M[10] * s, M[11]];
  if (o.down) M = affMul(M, affMul(affT(0, 2.2, 0), affRotZ(Math.PI / 2)));
  else if (o.roll !== null && o.roll !== undefined) M = affMul(M, affMul(affT(0, 8, 0), affMul(affRotZ(-o.roll * Math.PI * 2), affT(0, -8, 0))));
  const crouch = o.sneak && !o.down ? 2.2 : 0;
  const swing = o.moving && !o.down ? Math.sin(o.anim * 1.25) * 0.8 : 0;
  const bob = o.down ? 0 : o.moving ? Math.abs(Math.sin(o.anim * 1.25)) * 0.7 : Math.sin((o.time || 0) * 2 + (o.id || 0)) * 0.25;
  const hip = LEG - crouch + bob * 0.3;
  const robe = L.topStyle === 'robe';
  const add = (MM, x, y, z, w, h, d, c, em = 0) => b.add(PRIM.CUBE, MM, x, y, z, w, h, d, c, F, em);
  // Legs (or a robe skirt).
  if (robe) add(M, -2.4, 0.4, -3.7, 4.8, hip, 7.4, tD);
  else for (const [side, ph] of [[-1.8, 1], [1.8, -1]]) {
    const Ml = affMul(M, affMul(affT(0, hip, side), affRotZ(swing * ph)));
    add(Ml, -1.3, -hip + 1.6, -1.3, 2.6, hip - 1.6, 2.6, pC);
    add(Ml, -1.4, -hip, -1.4, 3.3, 1.8, 2.8, boots);
  }
  // Torso (leans forward when sneaking or sprinting).
  const lean = o.sneak ? -0.3 : o.sprint ? -0.18 : 0;
  const Mt = lean ? affMul(M, affMul(affT(0, hip, 0), affMul(affRotZ(lean), affT(0, -hip, 0)))) : M;
  add(Mt, -2, hip, -3.5, 4, TORSO, 7, tC);
  add(Mt, -2.1, hip, -3.6, 4.2, 1, 7.2, fc(PAL.ink[1]));
  if (L.topStyle === 'jacket') { add(Mt, 2, hip + 1, -3.5, 0.35, TORSO - 1, 2.3, fc(top2[2])); add(Mt, 2, hip + 1, 1.2, 0.35, TORSO - 1, 2.3, fc(top2[2])); }
  else if (L.topStyle === 'apron') add(Mt, 2, hip - 1.5, -2.5, 0.35, TORSO, 5, fc(top2[3]));
  else if (L.topStyle === 'armor') { add(Mt, -2.3, hip + 2.4, -3.8, 4.6, 4.2, 7.6, fc(PAL.ink[3])); add(Mt, 2.3, hip + 4, -1.5, 0.25, 1, 3, PAL.teal[3], 0.6); }
  else if (robe) add(Mt, 2, hip + 3.5, -1.2, 0.35, 2.4, 2.4, PAL.heat[2], 0.3);
  // Arms: the right arm raises the gun when aiming.
  const sh = hip + TORSO - 0.8;
  const armCol = L.topStyle === 'vest' ? skin : tD;
  const aimR = o.gun && o.aim ? Math.PI / 2 - 0.06 : -swing * 0.9;
  const aimL = o.gun && o.aim && o.gun !== 'sidearm' ? 1.15 : swing * 0.9;
  for (const [side, ang] of [[4.6, aimR], [-4.6, aimL]]) {
    const Ma = affMul(Mt, affMul(affT(0, sh, side), affRotZ(ang)));
    add(Ma, -1.1, -4.6, -1.1, 2.2, 4.6, 2.2, armCol);
    add(Ma, -1, -6.5, -1, 2, 2, 2, skin);
    if (L.topStyle === 'armor') add(Ma, -1.4, -1.6, -1.4, 2.8, 2, 2.8, fc(PAL.ink[3]));
    if (side > 0 && o.gun) gun(b, Ma, o.gun, -6.2);
  }
  // Head, face, hair, hat.
  const hb = hip + TORSO;
  add(Mt, -2.8, hb, -2.8, HEAD, HEAD, HEAD, skin);
  add(Mt, 2.8, hb + 3, -1.8, 0.25, 1.1, 1.1, PAL.ink[0]); add(Mt, 2.8, hb + 3, 0.7, 0.25, 1.1, 1.1, PAL.ink[0]);
  const hs = L.hairStyle;
  if (L.hat !== 4 && hs !== 3) {
    if (hs === 2) add(Mt, -2.5, hb + HEAD, -0.7, 5, 2, 1.4, hair);
    else if (hs === 5) add(Mt, -2.9, hb + HEAD - 0.6, -2.9, 5.8, 0.9, 5.8, hair);
    else {
      add(Mt, -2.95, hb + HEAD - 0.4, -2.95, 5.9, 1.5, 5.9, hair);
      add(Mt, -3.05, hb + 1.6, -2.95, 1.3, 4, 5.9, hair);
      if (hs === 1) { add(Mt, -3.05, hb - 2, -2.95, 1.6, 4, 5.9, hair); }
      if (hs === 4) add(Mt, -4.4, hb + 1, -0.8, 1.6, 3.6, 1.6, hair);
    }
  }
  const hC = fc(hat[2]), hD = fc(hat[1]);
  switch (L.hat) {
    case 1: add(Mt, -3, hb + HEAD, -3, 6, 1.7, 6, hC); add(Mt, 2.6, hb + HEAD, -2.5, 2.6, 0.6, 5, hD); break;
    case 2: add(Mt, -4.6, hb + HEAD + 0.1, -4.6, 9.2, 0.7, 9.2, hD); add(Mt, -2.5, hb + HEAD + 0.8, -2.5, 5, 2.6, 5, hC); break;
    case 3: add(Mt, -3.1, hb + HEAD - 2.2, -3.1, 6.2, 3.4, 6.2, fc(PAL.ink[3])); add(Mt, -3.3, hb + HEAD - 2.6, -3.3, 6.6, 0.8, 6.6, fc(PAL.ink[1])); break;
    case 4: add(Mt, -3.3, hb - 0.4, -3.3, 3.8, HEAD + 1.2, 6.6, hD); add(Mt, -3.3, hb + HEAD - 0.2, -3.3, 6.6, 1.3, 6.6, hD); break;
    case 5: add(Mt, -2.95, hb + HEAD - 1.9, -2.95, 5.9, 1.5, 5.9, hC); break;
    case 6: add(Mt, -3, hb + HEAD - 0.2, -3, 6, 2.2, 6, fc(hat[3])); add(Mt, -3.05, hb + HEAD - 0.8, -3.05, 6.1, 0.8, 6.1, hD); break;
    default: break;
  }
  if (o.shield && !o.down) { add(M, 3.4, 2, -4.5, 1.2, 13, 9, fc(PAL.ink[3])); add(M, 4.6, 8, -3, 0.3, 2, 6, PAL.teal[2]); }
}

export function emitDog(b, o) {
  const c = PAL[o.ramp || 'wood'];
  const fl = o.flash > 0 ? 1 : 0;
  const c2 = fl ? [1, 1, 1] : c[2], c1 = fl ? [1, 1, 1] : c[1];
  let M = affPlace(o.x, 0, o.z, o.face);
  if (o.down) M = affMul(M, affMul(affT(0, 1.9, 0), affRotX(Math.PI / 2)));
  const add = (MM, x, y, z, w, h, d, col) => b.add(PRIM.CUBE, MM, x, y, z, w, h, d, col, F);
  add(M, -5, 3.5, -1.8, 10, 4, 3.6, c2);
  add(M, 4, 5, -1.8, 4.2, 3.8, 3.6, c2);
  add(M, 8, 5, -1, 2, 2, 2, c1);
  add(M, 4.6, 8.8, -1.8, 1.2, 1.5, 1.2, c1); add(M, 4.6, 8.8, 0.6, 1.2, 1.5, 1.2, c1);
  add(M, -6.6, 6.4, -0.5, 2, 1, 1, c1);
  add(M, 8.4, 6.6, -1.2, 0.2, 0.7, 0.7, PAL.ink[0]); add(M, 8.4, 6.6, 0.5, 0.2, 0.7, 0.7, PAL.ink[0]);
  const sw = o.moving && !o.down ? Math.sin(o.anim * 1.6) * 0.9 : 0;
  for (const [lx, lz, ph] of [[3.4, -1.2, 1], [3.4, 1.2, -1], [-3.6, -1.2, -1], [-3.6, 1.2, 1]]) {
    const Ml = affMul(M, affMul(affT(lx, 3.6, lz), affRotZ(sw * ph)));
    add(Ml, -0.7, -3.6, -0.7, 1.4, 3.6, 1.4, c1);
  }
}

export function emitVehicle(b, v) {
  const M = affPlace(v.x, 0, v.y, v.angle);
  const K = PAL;
  const add = (x, y, z, w, h, d, c, pat = F, em = 0, al = 1) => b.add(PRIM.CUBE, M, x, y, z, w, h, d, c, pat, em, al);
  const wheels = (list, r = 6.4, t = 3) => { for (const [wx, wz] of list) add(wx - r / 2, 0, wz - t / 2, r, r, t, K.ink[0]); };
  if (v.type === 'handcart') {
    add(-6, 4, -4.5, 11, 4, 9, K.wood[2], PAT.PLANK); add(-6, 8, -4.5, 11, 1, 1, K.wood[1]); add(-6, 8, 3.5, 11, 1, 1, K.wood[1]);
    wheels([[-1, -5.4], [-1, 5.4]], 5, 1.6); add(5, 6, -3.5, 6, 1, 1, K.wood[1]); add(5, 6, 2.5, 6, 1, 1, K.wood[1]);
  } else if (v.type === 'buggy') {
    add(-12, 3, -7, 24, 4, 14, K.rust[2]); add(6, 7, -5, 6, 2.5, 10, K.rust[1]); add(-5, 7, -3.5, 5, 5, 7, K.ink[1]);
    for (const [px, pz] of [[-7, -7], [-7, 5.8], [3, -7], [3, 5.8]]) add(px, 7, pz, 1.2, 9, 1.2, K.ink[2]);
    add(-7, 16, -7, 11.2, 1.2, 14, K.ink[2]);
    wheels([[-8, -8], [-8, 8], [8, -8], [8, 8]]);
    add(11.7, 4.5, -5.5, 0.6, 1.8, 2.6, K.gold[2], F, 1); add(11.7, 4.5, 2.9, 0.6, 1.8, 2.6, K.gold[2], F, 1);
  } else {
    const teal = v.type === 'convoy';
    add(-17, 4, -9, 24, 13, 18, teal ? K.sand[1] : K.olive[1], PAT.CORR); add(-17.5, 16.5, -9.5, 25, 1.4, 19, teal ? K.sand[2] : K.olive[0]);
    add(7, 4, -8.5, 10, 11, 17, teal ? K.teal[2] : K.ink[3]); add(16.8, 9, -7, 0.5, 5, 14, K.sea[1]);
    add(17.2, 3, -9, 1.6, 5, 18, K.ink[1]);
    wheels([[-12, -9.5], [-12, 9.5], [-3, -9.5], [-3, 9.5], [11, -9.5], [11, 9.5]], 7, 3.4);
    add(17.4, 6.5, -7.5, 0.5, 1.8, 2.6, K.gold[2], F, 1); add(17.4, 6.5, 4.9, 0.5, 1.8, 2.6, K.gold[2], F, 1);
    if (v.hp !== undefined && v.maxHp && v.hp <= 0) add(-10, 17, -5, 14, 5, 10, K.ink[0], F, 0, 0.5);
  }
}

// Plants: four per cell, stage 0 seed .. 4 harvest, 5 dead.
function plants(b, x, z, stage, tint, blight, scale = 1) {
  const K = PAL;
  const leaf = blight ? K.bone[0] : K.olive[2], leaf2 = blight ? K.ink[3] : K.olive[3];
  const t = PAL[tint] || PAL.olive;
  const add = (px, py, pz, w, h, d, c, em = 0) => b.add(PRIM.CUBE, IDENT, px, py, pz, w, h, d, c, F, em);
  for (const [ox, oz] of [[8, 8], [24, 8], [8, 24], [24, 24]]) {
    const px = x + 16 + (ox - 16) * scale, pz = z + 16 + (oz - 16) * scale, y0 = 2.5;
    if (stage === 5) { add(px - 0.5, y0, pz - 0.5, 1, 4, 1, K.wood[1]); add(px - 2.5, y0 + 2, pz - 0.5, 3, 0.8, 1, K.wood[2]); continue; }
    if (stage === 0) { add(px - 1.2, y0, pz - 1.2, 2.4, 0.9, 2.4, K.wood[2]); continue; }
    const h = [0, 3.5, 7.5, 11, 13][stage] * scale;
    add(px - 0.5, y0, pz - 0.5, 1, h, 1, K.olive[1]);
    add(px - 2.6, y0 + h * 0.45, pz - 0.6, 5.2, 0.9, 1.2, leaf); add(px - 0.6, y0 + h * 0.6, pz - 2.6, 1.2, 0.9, 5.2, leaf2);
    if (stage >= 2) { add(px - 3.4, y0 + h * 0.2, pz - 0.6, 6.8, 0.9, 1.2, leaf2); add(px - 0.6, y0 + h * 0.3, pz - 3.4, 1.2, 0.9, 6.8, leaf); }
    if (stage >= 3) add(px - 1.3, y0 + h - 1, pz - 1.3, 2.6, 3, 2.6, t[2]);
    if (stage >= 4) { add(px - 1.7, y0 + h + 0.6, pz - 1.7, 3.4, 3.2, 3.4, t[3]); add(px + 1, y0 + h * 0.62, pz - 0.9, 1.8, 2, 1.8, t[2]); add(px - 2.8, y0 + h * 0.5, pz - 0.9, 1.8, 2, 1.8, t[2]); }
  }
}

// One Hollow grid cell (32x32 world units at x, z).
export function emitFacility(b, cell, x, z, info) {
  const K = PAL;
  const B = (dx, dy, dz, w, h, d, c, pat = F, em = 0, al = 1) => b.add(PRIM.CUBE, IDENT, x + dx, dy, z + dz, w, h, d, c, pat, em, al);
  const C = (dx, dy, dz, w, h, d, c, pat = F, em = 0, al = 1) => b.add(PRIM.CYL, IDENT, x + dx, dy, z + dz, w, h, d, c, pat, em, al);
  const PX = (dx, dy, dz, w, h, d, c, pat = F) => b.add(PRIM.PRISM_X, IDENT, x + dx, dy, z + dz, w, h, d, c, pat);
  switch (cell.fac) {
    case 'plot':
      B(1, 0, 1, 30, 2.5, 30, K.wood[0], PAT.SOIL); B(0, 0, 0, 32, 3.5, 1.5, K.wood[1], PAT.PLANK); B(0, 0, 30.5, 32, 3.5, 1.5, K.wood[1], PAT.PLANK); B(0, 0, 1.5, 1.5, 3.5, 29, K.wood[1], PAT.PLANK); B(30.5, 0, 1.5, 1.5, 3.5, 29, K.wood[1], PAT.PLANK);
      if (cell.plant) plants(b, x, z, info.stage, info.tint, cell.plant.blight);
      break;
    case 'growroom':
      B(1, 0, 1, 30, 3, 30, K.ink[2], PAT.CONCRETE); B(2.5, 3, 2.5, 27, 1, 27, K.wood[0], PAT.SOIL);
      for (const [ax, az] of [[1, 1], [29.5, 1], [1, 29.5], [29.5, 29.5]]) B(ax, 3, az, 1.5, 15, 1.5, K.ink[3]);
      B(1, 18, 1, 30, 1, 30, K.sea[2], F, 0, 0.3); B(1, 3, 1, 30, 15, 0.6, K.sea[2], F, 0, 0.22); B(1, 3, 30.4, 30, 15, 0.6, K.sea[2], F, 0, 0.22); B(1, 3, 1.6, 0.6, 15, 28.8, K.sea[2], F, 0, 0.22); B(30.4, 3, 1.6, 0.6, 15, 28.8, K.sea[2], F, 0, 0.22);
      B(4, 15.5, 14.5, 24, 1.2, 3, info.power ? K.gold[3] : K.ink[1], F, info.power ? 1 : 0);
      if (cell.plant) plants(b, x, z + 0, info.stage, info.tint, cell.plant.blight, 0.8);
      break;
    case 'generator': B(4, 0, 8, 22, 13, 16, K.olive[1], PAT.CORR); B(3.5, 13, 7.5, 23, 1.5, 17, K.olive[3]); C(20, 14, 12, 3, 9, 3, K.ink[2]); C(6, 0, 2, 8, 9, 8, K.rust[1], PAT.CORR); B(7, 5, 24, 5, 3, 0.6, info.power ? K.green[3] : K.heat[2], F, 1); B(15, 4, 24, 8, 5, 0.6, K.ink[1]); break;
    case 'watertank': for (const [ax, az] of [[6, 6], [23, 6], [6, 23], [23, 23]]) B(ax, 0, az, 3, 8, 3, K.ink[2]); C(4, 8, 4, 24, 16, 24, K.sea[1], PAT.CORR); C(3.4, 14, 3.4, 25.2, 1.2, 25.2, K.sea[0]); C(5, 24, 5, 22, 1.5, 22, K.sea[3]); B(15, 0, 28, 2, 10, 2, K.ink[2]); break;
    case 'dryrack': for (const az of [5, 15, 25]) { B(2, 0, az, 2, 16, 2, K.wood[1]); B(28, 0, az, 2, 16, 2, K.wood[1]); B(2, 14.5, az + 0.6, 28, 0.7, 0.7, K.bone[1]); for (let k = 0; k < 5; k++) B(5 + k * 5, 9, az + 0.2, 2.2, 5.5, 1.6, K.olive[2]); } break;
    case 'cureroom': B(2, 0, 20, 28, 17, 8, K.wood[1], PAT.PLANK); for (const hy of [2, 7.5, 13]) for (let k = 0; k < 5; k++) { C(4 + k * 5.2, hy, 17.5, 4, 4, 4, K.sea[2]); C(4 + k * 5.2, hy + 4, 17.5, 4, 0.8, 4, K.bone[2]); } break;
    case 'compost': B(3, 0, 6, 26, 9, 20, K.wood[1], PAT.PLANK); B(5, 8.4, 8, 22, 1.4, 16, K.wood[0], PAT.SOIL); B(8, 9.6, 11, 3, 1, 3, K.olive[2]); B(18, 9.6, 16, 4, 1.2, 3, K.olive[1]); B(13, 9.6, 20, 2, 1, 2, K.sand[2]); break;
    case 'smelter': B(5, 0, 6, 22, 16, 20, K.rust[1], PAT.BRICK); B(4, 16, 5, 24, 2, 22, K.rust[0]); B(10, 3, 25.4, 12, 7, 1, K.ink[0]); B(11, 4, 26, 10, 5, 0.6, K.heat[2], F, 1); B(13, 5, 26.3, 6, 3, 0.5, K.heat[3], F, 1); B(13, 18, 11, 7, 12, 7, K.ink[2], PAT.BRICK); B(12.4, 30, 10.4, 8.2, 1.4, 8.2, K.ink[3]); break;
    case 'lathe': B(2, 7, 10, 28, 2, 12, K.ink[2]); for (const [ax, az] of [[3, 11], [27, 11], [3, 19.5], [27, 19.5]]) B(ax, 0, az, 2, 7, 2, K.ink[1]); B(4, 9, 12, 7, 7, 8, K.ink[1]); C(11, 11, 14.5, 14, 3, 3, K.bone[1]); B(24, 9, 13, 4, 6, 6, K.ink[1]); B(12, 9, 20, 6, 1, 1.4, K.gold[1]); break;
    case 'press': B(8, 0, 10, 16, 3, 14, K.ink[1]); B(9, 3, 11, 3, 20, 3, K.ink[2]); B(20, 3, 11, 3, 20, 3, K.ink[2]); B(8, 22, 10.5, 16, 3, 4, K.ink[3]); B(13, 12, 11.5, 6, 10, 2, K.ink[1]); C(14, 6, 15, 4, 4, 4, K.bone[1]); B(3, 0, 24, 8, 5, 6, K.wood[1], PAT.PLANK); C(4.5, 5, 25, 2, 2.4, 2, K.gold[2]); C(7.5, 5, 26.5, 2, 2.4, 2, K.gold[2]); break;
    case 'bench': B(1, 8, 9, 30, 2, 13, K.wood[2], PAT.PLANK); for (const [ax, az] of [[2, 10], [27.5, 10], [2, 19.5], [27.5, 19.5]]) B(ax, 0, az, 2.5, 8, 2.5, K.wood[1]); B(4, 4, 11, 24, 1, 10, K.wood[0]); B(5, 10, 12, 12, 1.6, 2.2, K.ink[2]); B(5, 10, 14.4, 4, 1.4, 3, K.wood[2]); B(21, 10, 12, 5, 4, 4, K.rust[2]); B(24, 10, 18, 3, 1, 3, K.gold[1]); break;
    case 'lab': B(2, 7, 9, 28, 1.6, 13, K.bone[1]); for (const [ax, az] of [[3, 10], [27, 10], [3, 19.5], [27, 19.5]]) B(ax, 0, az, 2, 7, 2, K.ink[2]); C(5, 8.6, 12, 5, 7, 5, K.sea[2], F, 0, 0.45); C(13, 8.6, 13, 4, 9, 4, K.green[2], F, 0, 0.5); C(21, 8.6, 12, 5, 6, 5, K.olive[2], F, 0, 0.45); B(14.4, 17.6, 14.4, 1.2, 3, 1.2, K.green[3]); B(6.8, 15.6, 13.8, 1.4, 2.5, 1.4, K.olive[3]); break;
    case 'safe': B(5, 0, 6, 22, 24, 20, K.ink[2], PAT.CONCRETE); B(8, 3, 25.6, 16, 18, 1, K.ink[1]); C(12, 8, 26.4, 8, 8, 1, K.ink[3]); B(15.2, 11.2, 27.2, 1.6, 1.6, 0.6, K.gold[2], F, 0.5); B(22, 9, 26.4, 1.6, 6, 1, K.gold[1]); break;
    case 'bunks': for (const ax of [2, 17]) { for (const [px, pz] of [[ax, 3], [ax + 11.5, 3], [ax, 27.5], [ax + 11.5, 27.5]]) B(px, 0, pz, 1.5, 16, 1.5, K.wood[1]); B(ax, 4, 3, 13, 2, 26, ax < 10 ? K.rust[2] : K.teal[2]); B(ax, 12, 3, 13, 2, 26, ax < 10 ? K.teal[2] : K.rust[2]); B(ax + 1, 6, 4, 11, 1.2, 5, K.bone[2]); B(ax + 1, 14, 4, 11, 1.2, 5, K.bone[2]); } break;
    case 'training': B(1, 0, 1, 30, 0.6, 30, K.sand[1]); C(6.5, 0, 6.5, 2, 12, 2, K.wood[1]); B(3.5, 9, 5.5, 8, 7, 4, K.sand[2]); B(4.5, 16, 4.5, 6, 6, 6, K.sand[3]); B(0.5, 13, 6.5, 14, 2, 2, K.wood[1]); B(22, 0, 22, 2, 14, 2, K.wood[1]); C(18, 8, 21.6, 10, 10, 1.4, K.bone[3]); C(20, 10, 21.2, 6, 6, 1.4, K.heat[2]); C(22, 12, 20.8, 2, 2, 1.4, K.bone[3]); break;
    case 'turret': C(6, 0, 6, 20, 6, 20, K.ink[2], PAT.CONCRETE); { const Mt = affMul(affT(x + 16, 6, z + 16), affRotY(-(info.aim || 0))); b.add(PRIM.CUBE, Mt, -6, 0, -6, 12, 9, 12, K.olive[1], PAT.CORR); b.add(PRIM.CUBE, Mt, 5, 4, -1.2, 13, 2.4, 2.4, K.ink[1], F); b.add(PRIM.CUBE, Mt, -3, 9, -3, 6, 2, 6, K.olive[3], F); b.add(PRIM.CUBE, Mt, 17.5, 4.4, -0.8, 0.8, 1.6, 1.6, K.gold[2], F, info.firing ? 1 : 0); } break;
    case 'watchpost': for (const [ax, az] of [[4, 4], [26, 4], [4, 26], [26, 26]]) B(ax, 0, az, 2.2, 22, 2.2, K.wood[1]); B(2, 12, 2, 28, 1.6, 28, K.wood[2], PAT.PLANK); B(2, 13.6, 2, 28, 4, 1.2, K.sand[1]); B(2, 13.6, 28.8, 28, 4, 1.2, K.sand[1]); B(2, 13.6, 3.2, 1.2, 4, 25.6, K.sand[1]); B(28.8, 13.6, 3.2, 1.2, 4, 25.6, K.sand[1]); PX(0, 22, 0, 32, 6, 32, K.rust[1], PAT.CORR); B(15, 28, 15, 1, 8, 1, K.ink[2]); B(16, 32, 15.2, 6, 4, 0.5, K.amber[2]); break;
    case 'traps': B(1, 0, 1, 30, 0.5, 30, K.wood[0], PAT.SOIL); for (let k = 0; k < 14; k++) { const ax = 3 + (k * 7.3) % 25, az = 3 + (k * 11.7) % 25; B(ax, 0.5, az, 0.9, 3 + (k % 3), 0.9, K.ink[3]); } B(1, 4, 15.6, 30, 0.4, 0.4, K.bone[0]); B(1, 0, 15, 1.2, 5, 1.2, K.wood[1]); B(29.8, 0, 15, 1.2, 5, 1.2, K.wood[1]); break;
    case 'still': C(4, 0, 8, 15, 16, 15, K.rust[2], PAT.CORR); C(7, 16, 11, 9, 5, 9, K.rust[3]); C(10, 21, 14, 3, 6, 3, K.rust[1]); B(11, 25.5, 14.6, 13, 1.6, 1.6, K.rust[1]); C(22, 8, 12, 4, 19, 4, K.rust[1]); C(20, 0, 10, 9, 9, 9, K.wood[1], PAT.PLANK); B(6, 0, 22.6, 11, 3, 1, K.heat[2], F, 1); break;
    default: B(4, 0, 4, 24, 10, 24, K.wood[1], PAT.PLANK);
  }
}

// Thin emissive bar between two 3D points (lasers, tracers).
export function emitSegment(b, a, c, thick, col, em = 1, alpha = 1) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const X = [dx / len, dy / len, dz / len];
  let U = Math.abs(X[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const Z = [X[1] * U[2] - X[2] * U[1], X[2] * U[0] - X[0] * U[2], X[0] * U[1] - X[1] * U[0]];
  const zl = Math.hypot(Z[0], Z[1], Z[2]) || 1;
  Z[0] /= zl; Z[1] /= zl; Z[2] /= zl;
  U = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  const M = [X[0], U[0], Z[0], a[0], X[1], U[1], Z[1], a[1], X[2], U[2], Z[2], a[2]];
  b.add(PRIM.CUBE, M, 0, -thick / 2, -thick / 2, len, thick, thick, col, F, em, alpha);
}

// Spinning diamond marker above a point of interest.
export function emitDiamond(b, x, y, z, size, col, time, em = 1) {
  const M = affMul(affT(x, y + Math.sin(time * 4) * 1.5, z), affMul(affRotY(time * 2.5), affMul(affRotZ(Math.PI / 4), affRotX(Math.PI / 4))));
  b.add(PRIM.CUBE, M, -size / 2, -size / 2, -size / 2, size, size, size, col, F, em);
}

export { hx, IDENT };
