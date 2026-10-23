import { GeoBuilder, rng } from './geo.js';
import { STYLE_GRID, fac, qseed } from './facade.js';

// Building shells from the layout: setback tiers, cornices, piers and mullions, parapets and roof
// gear, antennas, and damage: tops broken off floor by floor (ragged walls with their insides
// showing, partial floor slabs, bare columns, rubble), sheared towers, collapsed stumps, holes
// smashed through facades, and lobbies carved into ground floors. One merged geometry for the
// facade shader; every quad is oriented by the way it should face.

export const strHash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const UP = [0, 1, 0], DOWN = [0, -1, 0];

/** returns the merged geometry and the colliders: [x0, y0, z0, x1, y1, z1] boxes */
export function buildBuildings(list) {
  const gb = new GeoBuilder({ fac: true });
  const boxes = [];
  for (const b of list) building(gb, b, boxes);
  return { geometry: gb.build(), boxes };
}
/** box minus a ground-floor room [x0, z0, x1, z1, h]: the blocks around it and the floors above */
function carve(bx, cav) {
  const [x0, y0, z0, x1, y1, z1] = bx, [cx0, cz0, cx1, cz1, ch] = cav;
  const out = [];
  if (cx0 > x0) out.push([x0, y0, z0, cx0, y1, z1]);
  if (cx1 < x1) out.push([cx1, y0, z0, x1, y1, z1]);
  if (cz0 > z0) out.push([cx0, y0, z0, cx1, y1, cz0]);
  if (cz1 < z1) out.push([cx0, y0, cz1, cx1, y1, z1]);
  out.push([cx0, ch, cz0, cx1, y1, cz1]);
  return out;
}

/** one wall line: from a to b (x, z), outward normal, and helpers to place points on it */
function edge(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
  const out = [-dz, 0, dx], inn = [dz, 0, -dx], along = [dx, 0, dz];
  // point at distance u along the wall, d outward (negative = inward), height y
  const P = (u, y, d = 0) => [a[0] + dx * u + out[0] * d, y, a[1] + dz * u + out[2] * d];
  return { a, b, len, out, inn, along, back: [-dx, 0, -dz], P };
}

function building(gb, b, boxes) {
  const [X0, Z0, X1, Z1] = b.box;
  const R = rng(strHash(b.id));
  const seed = R();
  const [FH, BW] = STYLE_GRID[b.style];
  const top = b.top || 'intact';
  const damage = top === 'intact' ? 0.06 + R() * 0.08 : top === 'collapsed' ? 0.85 : 0.3 + R() * 0.25;
  const F = (style, d = damage) => { gb.curFac = fac(style, seed, d); };
  let H = b.h;
  if (top === 'collapsed') H = Math.round((b.h * (0.34 + R() * 0.12)) / FH) * FH;
  const tiers = [];
  {
    let y = 0, inset = 0;
    const sb = b.setbacks || [];
    for (let i = 0; i <= sb.length; i++) {
      const y1 = i < sb.length ? Math.min(sb[i][0], H) : H;
      if (y1 <= y + 0.5) break;
      tiers.push({ y0: y, y1, x0: X0 + inset, z0: Z0 + inset, x1: X1 - inset, z1: Z1 - inset });
      y = y1;
      if (i < sb.length) inset += sb[i][1];
    }
  }
  const last = tiers[tiers.length - 1];
  const zone = top === 'broken' ? 9 + R() * 14 : top === 'sheared' ? Math.min(last.y1 - last.y0 - 4, 26 + R() * 16) : top === 'collapsed' ? 7 + R() * 7 : 0;
  const yb = zone > 0 ? Math.max(last.y0 + 2, Math.floor((H - zone) / FH) * FH) : H;
  const shear = { axis: R() < 0.5 ? 'x' : 'z', dir: R() < 0.5 ? 1 : -1 };
  const cav = b.cavity; // [x0, z0, x1, z1, h]
  const edges = (t) => [
    { id: 'N', ...edge([t.x1, t.z0], [t.x0, t.z0]) },
    { id: 'W', ...edge([t.x0, t.z0], [t.x0, t.z1]) },
    { id: 'S', ...edge([t.x0, t.z1], [t.x1, t.z1]) },
    { id: 'E', ...edge([t.x1, t.z1], [t.x1, t.z0]) },
  ];
  const uOf = (e, x, z) => Math.hypot(x - e.a[0], z - e.a[1]);
  let U0 = 0;
  for (let ti = 0; ti < tiers.length; ti++) {
    const t = tiers[ti], isLast = ti === tiers.length - 1, broken = isLast && zone > 0;
    const wallTop = broken ? yb : t.y1;
    for (const e of edges(t)) {
      const cuts = [], holes = [];
      if (cav && ti === 0) {
        const [cx0, cz0, cx1, cz1, ch] = cav;
        const on = (e.id === 'S' && Math.abs(cz1 - t.z1) < 0.01) || (e.id === 'N' && Math.abs(cz0 - t.z0) < 0.01) || (e.id === 'W' && Math.abs(cx0 - t.x0) < 0.01) || (e.id === 'E' && Math.abs(cx1 - t.x1) < 0.01);
        if (on) {
          const ua = e.id === 'S' || e.id === 'N' ? uOf(e, cx0, e.a[1]) : uOf(e, e.a[0], cz0);
          const ub = e.id === 'S' || e.id === 'N' ? uOf(e, cx1, e.a[1]) : uOf(e, e.a[0], cz1);
          cuts.push([Math.min(ua, ub), Math.max(ua, ub), 0, ch]);
        }
      }
      for (const [hx, hz, hy, hr] of b.holes || []) {
        const d = e.id === 'N' ? Math.abs(hz - t.z0) : e.id === 'S' ? Math.abs(hz - t.z1) : e.id === 'W' ? Math.abs(hx - t.x0) : Math.abs(hx - t.x1);
        if (d < 1 && hy > t.y0 && hy < wallTop) holes.push([uOf(e, hx, hz), hy, hr]);
      }
      F(b.style);
      facadeWall(gb, e, t.y0, wallTop, U0, cuts, holes, FH, BW, R, F, b.style);
      if (!broken) facadeWall(gb, e, wallTop, wallTop + 1.1, U0, [], [], FH, BW, R, F, b.style);
      else brokenWall(gb, e, yb, H, U0, FH, BW, R, F, b.style, damage, top, shear, t, boxes);
      if (b.style === 'deco' || b.style === 'black') relief(gb, e, t.y0 + (b.style === 'black' ? FH * 1.2 : 0), wallTop, BW, b.style, F, cuts);
      U0 += e.len;
    }
    F(b.style);
    gb.cap([[t.x0, t.z0], [t.x1, t.z0], [t.x1, t.z1], [t.x0, t.z1]], wallTop);
    // colliders: the tier up to its roof (or the last whole floor), carved for a lobby, parapets
    const tb = [t.x0, t.y0, t.z0, t.x1, wallTop, t.z1];
    if (cav && ti === 0) boxes.push(...carve(tb, cav)); else boxes.push(tb);
    if (!broken) {
      const p = 0.35, Y = t.y1, Y1 = t.y1 + 1.1;
      boxes.push([t.x0, Y, t.z0, t.x1, Y1, t.z0 + p], [t.x0, Y, t.z1 - p, t.x1, Y1, t.z1], [t.x0, Y, t.z0, t.x0 + p, Y1, t.z1], [t.x1 - p, Y, t.z0, t.x1, Y1, t.z1]);
      parapet(gb, t, t.y1, 1.1, 0.35);
      if (b.style === 'stone' || b.style === 'terracotta' || b.style === 'deco' || b.style === 'brick') band(gb, t, t.y1 - 0.7, 0.6, 0.5);
    }
  }
  if (b.style !== 'glass' && b.style !== 'black' && !cav) { F(b.style); band(gb, tiers[0], FH * 1.25 - 0.3, 0.32, 0.25); }
  if (!cav && (b.style === 'stone' || b.style === 'brick' || b.style === 'terracotta')) awnings(gb, tiers[0], R);
  if (zone === 0) { F('bare', 0.1); rooftop(gb, last, H, R, b); }
  else {
    F('bare', 0.6);
    for (let k = 0; k < 5 + R() * 6; k++) {
      const w = 1 + R() * 3, d = 1 + R() * 3, h = 0.5 + R() * 1.6;
      const x = last.x0 + 1 + R() * Math.max(0.1, last.x1 - last.x0 - 2 - w), z = last.z0 + 1 + R() * Math.max(0.1, last.z1 - last.z0 - 2 - d);
      gb.box(x, yb, z, x + w, yb + h, z + d, 'xXzZY');
    }
    for (let x = last.x0 + BW * 2; x < last.x1 - 1; x += BW * (2 + Math.floor(R() * 3))) for (let z = last.z0 + 2; z < last.z1 - 1; z += 6 + R() * 6) {
      if (R() < 0.45) gb.box(x - 0.3, yb, z - 0.3, x + 0.3, Math.min(H, yb + FH * (1 + Math.floor(R() * 3))), z + 0.3, 'xXzZY');
    }
  }
  if (cav) lobby(gb, cav, b.box, F, R, boxes);
}

/** a wall face from y0 to y1 minus rectangular cuts [u0, u1, y0, y1] and ragged holes [u, y, r] */
function facadeWall(gb, e, y0, y1, U0, cuts, holes, FH, BW, R, F, style) {
  if (y1 <= y0 + 0.01) return;
  const { P, len, out } = e;
  const q = (ua, ub, ya, yb) => {
    ua = Math.max(0, ua); ub = Math.min(len, ub);
    if (ub - ua < 0.01 || yb - ya < 0.01) return;
    gb.face(out, P(ua, ya), P(ub, ya), P(ub, yb), P(ua, yb), [U0 + ua, ya], [U0 + ub, ya], [U0 + ub, yb], [U0 + ua, yb]);
  };
  if (!cuts.length && !holes.length) { q(0, len, y0, y1); return; }
  let rects = [[0, len, y0, y1]];
  const sub = (r, c) => {
    const [a0, a1, b0, b1] = r, [c0, c1, d0, d1] = c;
    if (c1 <= a0 || c0 >= a1 || d1 <= b0 || d0 >= b1) return [r];
    const o = [];
    if (c0 > a0) o.push([a0, c0, b0, b1]);
    if (c1 < a1) o.push([c1, a1, b0, b1]);
    const m0 = Math.max(a0, c0), m1 = Math.min(a1, c1);
    if (d1 < b1) o.push([m0, m1, d1, b1]);
    if (d0 > b0) o.push([m0, m1, b0, d0]);
    return o;
  };
  const boxes = holes.map(([u, y, r]) => [u - r - BW, u + r + BW, Math.max(y0, y - r - FH), Math.min(y1, y + r + FH)]);
  for (const c of [...cuts, ...boxes]) rects = rects.flatMap((r) => sub(r, c));
  for (const r of rects) q(...r);
  holes.forEach(([hu, hy, hr], hi) => {
    const [bu0, bu1, by0, by1] = boxes[hi];
    const cw = BW * 0.5, chh = FH * 0.5;
    for (let u = bu0; u < bu1 - 0.01; u += cw) for (let y = by0; y < by1 - 0.01; y += chh) {
      const rr = Math.hypot(u + cw / 2 - hu, (y + chh / 2 - hy) * 1.1) / hr + (R() - 0.5) * 0.35;
      if (rr > 1) q(u, u + cw, y, Math.min(by1, y + chh));
    }
    // the rooms behind: a dark back wall, floor slabs reaching out of the hole
    const ua = hu - hr, ub = hu + hr, ya = Math.max(y0, hy - hr), yb = Math.min(y1, hy + hr);
    F('interior');
    gb.face(out, P(ua, ya, -6), P(ub, ya, -6), P(ub, yb, -6), P(ua, yb, -6), [0, ya], [1, ya], [1, yb], [0, yb]);
    for (const [a, bb] of [[ua, ub]]) {
      gb.face(e.along, P(a, ya, -6), P(a, ya, 0), P(a, yb, 0), P(a, yb, -6));
      gb.face(e.back, P(bb, ya, 0), P(bb, ya, -6), P(bb, yb, -6), P(bb, yb, 0));
    }
    F('bare', 0.7);
    for (let y = Math.ceil(ya / FH) * FH; y < yb; y += FH) {
      const reach = 0.3 + R() * 1.4, w0 = ua + R() * hr * 0.3, w1 = ub - R() * hr * 0.3;
      gb.face(UP, P(w0, y, -6), P(w1, y, -6), P(w1, y, reach), P(w0, y, reach));
      gb.face(DOWN, P(w0, y - 0.4, -6), P(w1, y - 0.4, -6), P(w1, y - 0.4, reach), P(w0, y - 0.4, reach));
      gb.face(out, P(w0, y - 0.4, reach), P(w1, y - 0.4, reach), P(w1, y, reach), P(w0, y, reach));
    }
    F(style);
  });
}

/** the ragged top of a broken tower: wall strips snapped to half floors, inner faces, slabs */
function brokenWall(gb, e, yb, H, U0, FH, BW, R, F, style, damage, top, shear, t, boxes) {
  const { P, len, out, inn, along, back } = e;
  const th = 0.35, span = H - yb;
  let u = 0, run = 0, level = 0;
  while (u < len - 0.01) {
    const w = Math.min(BW * (1 + Math.floor(R() * 2)), len - u);
    if (run <= 0) { run = 1 + Math.floor(R() * 4); const k = R(); level = k < 0.25 ? 1 : k < 0.55 ? 0.15 + R() * 0.3 : 0.4 + R() * 0.5; }
    run--;
    let frac = level;
    if (top === 'sheared') {
      const g = P(u + w / 2, 0);
      const s = shear.axis === 'x' ? (g[0] - t.x0) / (t.x1 - t.x0) : (g[2] - t.z0) / (t.z1 - t.z0);
      frac = Math.min(1, Math.max(0.05, (shear.dir > 0 ? s : 1 - s) * 0.9 + 0.1 - R() * 0.15));
    }
    const yt = Math.max(yb + 0.5, Math.min(H, yb + Math.round((span * frac) / (FH * 0.5)) * FH * 0.5));
    F(style, Math.min(1, damage + 0.3));
    gb.face(out, P(u, yb), P(u + w, yb), P(u + w, yt), P(u, yt), [U0 + u, yb], [U0 + u + w, yb], [U0 + u + w, yt], [U0 + u, yt]);
    F('interior');
    gb.face(inn, P(u, yb, -th), P(u + w, yb, -th), P(u + w, yt, -th), P(u, yt, -th), [0, yb], [w, yb], [w, yt], [0, yt]);
    F('bare', 0.8);
    gb.face(UP, P(u, yt), P(u + w, yt), P(u + w, yt, -th), P(u, yt, -th));
    gb.face(back, P(u, yb), P(u, yb, -th), P(u, yt, -th), P(u, yt));
    gb.face(along, P(u + w, yb), P(u + w, yb, -th), P(u + w, yt, -th), P(u + w, yt));
    // (each strip is a thin collider, so a hero can land among the ruins without walking through them)
    const c0 = P(u, yb, 0), c1 = P(u + w, yt, -th * 1.6);
    boxes.push([Math.min(c0[0], c1[0]), yb, Math.min(c0[2], c1[2]), Math.max(c0[0], c1[0]), yt, Math.max(c0[2], c1[2])]);
    u += w;
  }
  // floor slabs hanging on in the broken zone
  F('bare', 0.8);
  const deep = Math.min(9, (Math.abs(t.x1 - t.x0) + Math.abs(t.z1 - t.z0)) * 0.15);
  for (let y = yb + FH; y < H - 0.5; y += FH) {
    if (R() < 0.35) continue;
    const ua = R() * len * 0.5, ub = Math.min(len, ua + len * (0.2 + R() * 0.6)), d = 2 + R() * deep;
    gb.face(UP, P(ua, y, -th), P(ub, y, -th), P(ub, y, -d), P(ua, y, -d));
    gb.face(DOWN, P(ua, y - 0.35, -th), P(ub, y - 0.35, -th), P(ub, y - 0.35, -d), P(ua, y - 0.35, -d));
    gb.face(inn, P(ua, y - 0.35, -d), P(ub, y - 0.35, -d), P(ub, y, -d), P(ua, y, -d));
  }
}

/** deco piers / Mies mullions: fins up the face every bay */
function relief(gb, e, y0, y1, BW, style, F, cuts) {
  if (y1 <= y0 + 1) return;
  const { P, len, out, along, back } = e;
  const w = style === 'deco' ? 0.42 : 0.14, d = style === 'deco' ? 0.38 : 0.26;
  F(style, 0.05);
  for (let u = BW; u < len - 0.3; u += BW) {
    if (cuts.some((c) => u > c[0] - 0.5 && u < c[1] + 0.5 && y0 < c[3])) continue;
    const a = u - w / 2, b = u + w / 2;
    gb.face(out, P(a, y0, d), P(b, y0, d), P(b, y1, d), P(a, y1, d), [a, y0], [b, y0], [b, y1], [a, y1]);
    gb.face(back, P(a, y0, 0), P(a, y0, d), P(a, y1, d), P(a, y1, 0), [0, y0], [d, y0], [d, y1], [0, y1]);
    gb.face(along, P(b, y0, 0), P(b, y0, d), P(b, y1, d), P(b, y1, 0), [0, y0], [d, y0], [d, y1], [0, y1]);
  }
}

function parapet(gb, t, y, h, th) {
  const x0 = t.x0 + th, x1 = t.x1 - th, z0 = t.z0 + th, z1 = t.z1 - th;
  gb.face([0, 0, 1], [x0, y, z0], [x1, y, z0], [x1, y + h, z0], [x0, y + h, z0]);
  gb.face([0, 0, -1], [x0, y, z1], [x1, y, z1], [x1, y + h, z1], [x0, y + h, z1]);
  gb.face([1, 0, 0], [x0, y, z0], [x0, y, z1], [x0, y + h, z1], [x0, y + h, z0]);
  gb.face([-1, 0, 0], [x1, y, z0], [x1, y, z1], [x1, y + h, z1], [x1, y + h, z0]);
  const Y = y + h;
  gb.face(UP, [t.x0, Y, t.z0], [t.x1, Y, t.z0], [x1, Y, z0], [x0, Y, z0]);
  gb.face(UP, [t.x0, Y, t.z1], [t.x1, Y, t.z1], [x1, Y, z1], [x0, Y, z1]);
  gb.face(UP, [t.x0, Y, t.z0], [x0, Y, z0], [x0, Y, z1], [t.x0, Y, t.z1]);
  gb.face(UP, [t.x1, Y, t.z0], [x1, Y, z0], [x1, Y, z1], [t.x1, Y, t.z1]);
}

/** a moulding band around a tier */
function band(gb, t, y, h, o) {
  gb.box(t.x0 - o, y, t.z0 - o, t.x1 + o, y + h, t.z1 + o, 'xXzZyY');
}

function awnings(gb, t, R) {
  const sides = [
    { a: [t.x0, t.z1], b: [t.x1, t.z1] }, { a: [t.x1, t.z0], b: [t.x0, t.z0] },
    { a: [t.x0, t.z0], b: [t.x0, t.z1] }, { a: [t.x1, t.z1], b: [t.x1, t.z0] },
  ];
  for (const s of sides) {
    const e = edge(s.a, s.b);
    for (let u = 2; u < e.len - 5; u += 7 + R() * 6) {
      if (R() < 0.45) continue;
      const w = 3.5 + R() * 2.5;
      gb.curFac = [9, qseed(R()), 3.6, 3]; // canvas

      const y = 3.4, dep = 1.6, drop = 0.55;
      const A = e.P(u, y), B = e.P(u + w, y), C = e.P(u + w, y - drop, dep), D = e.P(u, y - drop, dep);
      gb.face([e.out[0], 1, e.out[2]], A, B, C, D);
      gb.face([-e.out[0], -1, -e.out[2]], A, B, C, D);
    }
  }
}

function rooftop(gb, t, H, R, b) {
  const W = t.x1 - t.x0, D = t.z1 - t.z0;
  const n = 2 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const w = 2 + R() * Math.min(8, W * 0.3), d = 2 + R() * Math.min(8, D * 0.3), h = 1.5 + R() * (i === 0 ? 5 : 2);
    const x = t.x0 + 1.5 + R() * Math.max(0.1, W - 3 - w), z = t.z0 + 1.5 + R() * Math.max(0.1, D - 3 - d);
    gb.box(x, H, z, x + w, H + h, z + d, 'xXzZY');
  }
  if ((b.style === 'brick' || b.style === 'stone') && R() < 0.7) {
    const x = t.x0 + 3 + R() * (W - 6), z = t.z0 + 3 + R() * (D - 6);
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) gb.box(x + ox - 0.12, H, z + oz - 0.12, x + ox + 0.12, H + 3, z + oz + 0.12, 'xXzZ');
    gb.cyl(x, z, 2.2, 2.2, H + 3, H + 7, 14);
    gb.cyl(x, z, 2.3, 0.2, H + 7, H + 8.6, 14, false);
  }
  if (b.crown === 'antenna') {
    const x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2;
    gb.box(x - 4, H, z - 4, x + 4, H + 4, z + 4, 'xXzZY');
    gb.cyl(x - 2, z, 0.7, 0.35, H + 4, H + 46, 8);
    gb.cyl(x + 2.2, z + 1, 0.6, 0.3, H + 4, H + 38, 8);
  } else if (b.crown === 'spire') {
    const x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2;
    gb.cyl(x, z, Math.min(W, D) * 0.22, 0.25, H, H + 34, 8, false);
  }
}

/** a lobby carved into the ground floor (open on the building's edge): walls, ceiling, columns */
function lobby(gb, cav, box, F, R, boxes) {
  const [x0, z0, x1, z1, h] = cav;
  F('bare', 0.15);
  if (Math.abs(z0 - box[1]) > 0.01) gb.face([0, 0, 1], [x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], [x0, 0], [x1, 0], [x1, h], [x0, h]);
  if (Math.abs(z1 - box[3]) > 0.01) gb.face([0, 0, -1], [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [x0, 0], [x1, 0], [x1, h], [x0, h]);
  if (Math.abs(x0 - box[0]) > 0.01) gb.face([1, 0, 0], [x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [z0, 0], [z1, 0], [z1, h], [z0, h]);
  if (Math.abs(x1 - box[2]) > 0.01) gb.face([-1, 0, 0], [x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], [z0, 0], [z1, 0], [z1, h], [z0, h]);
  gb.face(DOWN, [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]);
  F('stone', 0.1);
  for (let x = x0 + 4; x < x1 - 2; x += 6) for (let z = z0 + 4; z < z1 - 2; z += 6) if (R() < 0.8) { gb.box(x - 0.35, 0, z - 0.35, x + 0.35, h, z + 0.35, 'xXzZ'); boxes.push([x - 0.35, 0, z - 0.35, x + 0.35, h, z + 0.35]); }
}
