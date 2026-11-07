// Structural mesher: converts a Structure's grid pieces into merged geometry,
// collision boxes, door definitions and glass panes.
//
// Joint rules (these keep every junction gap-free and free of z-fighting):
//  * Walls span the middle 1.8 m of their 2 m edge; a 0.2 x 0.2 post fills each
//    vertex that any wall touches, row by row (only rows where some touching
//    wall is not open), so wide openings across several panels stay open.
//  * Floor slabs are inset 0.1 m on edges carrying a wall above or below, and
//    lose their corner square where a post stands, so slabs never overlap walls.
//  * Walls with nothing below sit on a beam (or a foundation stem at level 0).
//  * Roof slopes chain automatically: each piece starts where its downhill
//    neighbour ends; gable ends are filled above the wall below; ridges get a cap.
import {
  CELL, STORY, HALF_T, SLAB_T, SHAPE_COLS, SHAPE_ROWS, SUB, ROOF_TV, EAVE_OV, RAKE_OV,
  STAIR_STEPS, CELL_SOLID, CELL_WINDOW, CELL_DOOR, CELL_OPEN, DIRS,
  shapeGrid, getStyle, FLOOR_STYLES, FOUNDATIONS, ROOF_STYLES,
} from './defs.js';
import { rgb, mulc } from '../geom.js';
import { buildProps } from './furniture.js';

const EPS = 1e-4;

// ---------- AO helpers (baked into vertex colours) ----------
function aoInt(y) { // y = height above this level's floor
  return 1 - 0.3 * Math.exp(-y / 0.16) - 0.14 * Math.exp(-(STORY - SLAB_T - y) / 0.22);
}
function aoExt(y, level) {
  return level === 0 ? 1 - 0.28 * Math.exp(-Math.max(0, y) / 0.18) : 1;
}
const INTERIOR_MATS = new Set(['plaster', 'wallpaper', 'tileWhite']);

// Split points used to give wall faces vertical AO gradients.
const Y_BANDS = [0, 1, 2, 11, 12]; // row boundaries: [0,1),[1,2),[2,11),[11,12)
const BAND_SPLIT = new Set([1, 2, 11]);

export function meshStructure(S, builders, ground) {
  let builder = builders.get(0);
  const use = (l) => { builder = builders.get(l); };
  const out = { boxes: [], doors: [], glass: [], interact: [] };
  const box = (x0, y0, z0, x1, y1, z1, kind = 'solid') => {
    if (x1 - x0 < EPS || y1 - y0 < EPS || z1 - z0 < EPS) return;
    out.boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], kind });
  };

  // Emit quad ensuring its front faces along normal n.
  const quadN = (key, a, b, c, d, n, col) => {
    const [cx, cy, cz] = newell(a, b, c, d);
    const cols = Array.isArray(col[0]) ? col : [col, col, col, col];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) builder.quad(key, a, d, c, b, [cols[0], cols[3], cols[2], cols[1]], null, n);
    else builder.quad(key, a, b, c, d, cols, null, n);
  };

  const yOf = (l) => l * STORY;

  // ---------------- accessors ----------------
  const W = (x, z, l, a) => S.walls.get(`${x},${z},${l},${a}`);
  const F = (x, z, l) => S.floors.get(`${x},${z},${l}`);
  const R = (x, z, l) => S.roofs.get(`${x},${z},${l}`);
  const C = (x, z, l) => S.columns.get(`${x},${z},${l}`);

  // Wall grid in e-order (k increases with the edge's coordinate axis).
  const gridCache = new Map();
  function wallGrid(key, w, a) {
    let g = gridCache.get(key);
    if (g) return g;
    const src = shapeGrid(w.shape);
    let eInc = a === 0 ? !!w.flip : !w.flip;
    if (w.mirror) eInc = !eInc;
    g = [];
    for (let r = 0; r < SHAPE_ROWS; r++) {
      const row = [];
      for (let k = 0; k < SHAPE_COLS; k++) row.push(src[r][eInc ? k : SHAPE_COLS - 1 - k]);
      g.push(row);
    }
    gridCache.set(key, g);
    return g;
  }
  const cellAt = (x, z, l, a, r, k) => {
    const w = W(x, z, l, a);
    if (!w) return null;
    return wallGrid(`${x},${z},${l},${a}`, w, a)[r][k];
  };
  // sign of side A's outward normal along the wall's normal axis (+Z for a=0, +X for a=1)
  const sideASign = (w, a) => (a === 0 ? (w.flip ? 1 : -1) : (w.flip ? 1 : -1));
  // finish of the wall face whose outward normal has sign s
  const faceFinish = (w, a, s) => {
    const st = getStyle(w.style);
    return s === sideASign(w, a) ? st.a : st.b;
  };

  // Walls touching a vertex, each with the e-slot adjacent to the vertex.
  function vertexWalls(vx, vz, l) {
    const res = [];
    let w;
    if ((w = W(vx, vz, l, 0))) res.push({ w, x: vx, z: vz, a: 0, dir: 0, k: 0 });                // +X
    if ((w = W(vx - 1, vz, l, 0))) res.push({ w, x: vx - 1, z: vz, a: 0, dir: 2, k: SHAPE_COLS - 1 }); // -X
    if ((w = W(vx, vz, l, 1))) res.push({ w, x: vx, z: vz, a: 1, dir: 1, k: 0 });                // +Z
    if ((w = W(vx, vz - 1, l, 1))) res.push({ w, x: vx, z: vz - 1, a: 1, dir: 3, k: SHAPE_COLS - 1 }); // -Z
    return res;
  }
  const posted = (vx, vz, l) => !!C(vx, vz, l) || vertexWalls(vx, vz, l).length > 0;

  // ---------------- roofs: chain heights ----------------
  const roofBase = new Map(); // key -> underside height at q=0
  function rise(r) { return r.pitch; }
  function roofHb(x, z, l) {
    const key = `${x},${z},${l}`;
    if (roofBase.has(key)) return roofBase.get(key);
    const r = R(x, z, l);
    const [dx, dz] = DIRS[r.dir];
    const down = R(x + dx, z + dz, l);
    let hb;
    roofBase.set(key, NaN); // cycle guard
    if (down && down.dir === r.dir) {
      const hbd = roofHb(x + dx, z + dz, l);
      hb = Number.isNaN(hbd) ? yOf(l) + 0.1 * rise(r) / CELL : hbd + rise(down);
    } else {
      hb = yOf(l) + 0.1 * rise(r) / CELL; // underside passes through (outer wall face, wall top)
    }
    roofBase.set(key, hb);
    return hb;
  }
  const isEave = (x, z, l, r) => {
    const [dx, dz] = DIRS[r.dir];
    const d = R(x + dx, z + dz, l);
    return !(d && d.dir === r.dir);
  };
  // edge (as wall key) lying under the downhill edge of a roof cell
  function downhillEdge(x, z, d) {
    if (d === 0) return [x + 1, z, 1];
    if (d === 1) return [x, z + 1, 0];
    if (d === 2) return [x, z, 1];
    return [x, z, 0];
  }
  function uphillEdge(x, z, d) { return downhillEdge(x, z, (d + 2) % 4); }
  // Does a roof eave sit on this wall edge (level l walls -> roof at l+1)?
  function eaveOver(x, z, a, l) {
    // candidates: cells on either side of the edge whose downhill edge is this one
    const cands = a === 0 ? [[x, z - 1, 1], [x, z, 3]] : [[x - 1, z, 0], [x, z, 2]];
    for (const [cx, cz, d] of cands) {
      const r = R(cx, cz, l + 1);
      if (r && r.dir === d && isEave(cx, cz, l + 1, r)) return { r, cx, cz };
    }
    return null;
  }
  // Is there a gable fill above this wall edge (wall at level l, roof at l+1)?
  function gableOver(x, z, a, l) {
    const cands = a === 0 ? [[x, z - 1], [x, z]] : [[x - 1, z], [x, z]];
    for (const [cx, cz] of cands) {
      const r = R(cx, cz, l + 1);
      if (!r) continue;
      if ((a === 0 && (r.dir === 0 || r.dir === 2)) || (a === 1 && (r.dir === 1 || r.dir === 3))) return true;
    }
    return false;
  }

  // A wall reaches the full story height if its top row is solid across.
  function fullTop(w, key, a) {
    const g = wallGrid(key, w, a);
    return g[SHAPE_ROWS - 1].every((c) => c === CELL_SOLID);
  }

  // =====================================================================
  // WALLS
  // =====================================================================
  for (const [key, w] of S.walls) {
    const [x, z, l, a] = key.split(',').map(Number);
    use(l);
    const g = wallGrid(key, w, a);
    const st = getStyle(w.style);
    const y0 = yOf(l);
    const sA = sideASign(w, a);
    const trimC = rgb(st.trim);
    // wall-local -> structure-local
    const Xs = x * CELL, Zs = z * CELL;
    const P = a === 0
      ? (e, y, n) => [Xs + e, y0 + y, Zs + n]
      : (e, y, n) => [Xs + n, y0 + y, Zs + e];
    const nAxis = a === 0 ? [0, 0, 1] : [1, 0, 0];
    const eAxis = a === 0 ? [1, 0, 0] : [0, 0, 1];
    const neg = (v) => [-v[0], -v[1], -v[2]];
    const eLo = (k) => Math.max(HALF_T, k * SUB);
    const eHi = (k) => Math.min(CELL - HALF_T, (k + 1) * SUB);
    const isSolid = (r, k) => r >= 0 && r < SHAPE_ROWS && k >= 0 && k < SHAPE_COLS && g[r][k] === CELL_SOLID;

    // --- side faces of the solid region, banded for AO ---
    for (let s of [-1, 1]) {
      const fin = s === sA ? st.a : st.b;
      const tint = rgb(fin.color);
      const interior = INTERIOR_MATS.has(fin.mat);
      const n = s > 0 ? nAxis : neg(nAxis);
      for (let bi = 0; bi < Y_BANDS.length - 1; bi++) {
        const r0 = Y_BANDS[bi], r1 = Y_BANDS[bi + 1] - 1;
        // greedy over columns: within the band, a column counts if all its band rows are solid
        // (otherwise fall back to per-row rectangles)
        for (let r = r0; r <= r1; r++) {
          let k = 0;
          while (k < SHAPE_COLS) {
            if (!isSolid(r, k)) { k++; continue; }
            // can this row-run be merged across the whole band?
            let k1 = k;
            while (k1 + 1 < SHAPE_COLS && isSolid(r, k1 + 1)) k1++;
            // try extend down rows within band (only from first row of the band)
            let rTop = r;
            if (r === r0 || !rowRunSame(g, r - 1, k, k1, r0)) {
              while (rTop + 1 <= r1 && rowRunEquals(g, rTop + 1, k, k1)) rTop++;
              emitRect(k, k1, r, rTop);
            }
            k = k1 + 1;
          }
        }
      }
      function emitRect(k0, k1, ra, rb) {
        const e0 = eLo(k0), e1 = eHi(k1);
        const ya = ra * SUB, yb = (rb + 1) * SUB;
        const off = s * HALF_T;
        const ao = (y) => (interior ? aoInt(y) : aoExt(y, l));
        const ca = mulc(tint, ao(ya)), cb = mulc(tint, ao(yb));
        quadN(fin.mat, P(e0, ya, off), P(e1, ya, off), P(e1, yb, off), P(e0, yb, off), n, [ca, ca, cb, cb]);
      }
    }

    // --- reveals inside the panel (solid next to non-solid) ---
    const revealKey = 'trim';
    // vertical reveals between columns k and k+1
    for (let k = 0; k < SHAPE_COLS - 1; k++) {
      let r = 0;
      while (r < SHAPE_ROWS) {
        const sl = isSolid(r, k), sr = isSolid(r, k + 1);
        if (sl === sr) { r++; continue; }
        const dirSign = sl ? 1 : -1; // normal points from solid into opening
        let r1 = r;
        while (r1 + 1 < SHAPE_ROWS && isSolid(r1 + 1, k) === sl && isSolid(r1 + 1, k + 1) === sr) r1++;
        const e = (k + 1) * SUB;
        const n = dirSign > 0 ? eAxis : neg(eAxis);
        quadN(revealKey, P(e, r * SUB, -HALF_T), P(e, r * SUB, HALF_T), P(e, (r1 + 1) * SUB, HALF_T), P(e, (r1 + 1) * SUB, -HALF_T), n, trimC);
        r = r1 + 1;
      }
    }
    // horizontal reveals between rows r and r+1
    for (let r = 0; r < SHAPE_ROWS - 1; r++) {
      let k = 0;
      while (k < SHAPE_COLS) {
        const sb = isSolid(r, k), sa = isSolid(r + 1, k);
        if (sb === sa) { k++; continue; }
        let k1 = k;
        while (k1 + 1 < SHAPE_COLS && isSolid(r, k1 + 1) === sb && isSolid(r + 1, k1 + 1) === sa) k1++;
        const y = (r + 1) * SUB;
        const n = sb ? [0, 1, 0] : [0, -1, 0];
        const e0 = eLo(k), e1 = eHi(k1);
        quadN(revealKey, P(e0, y, -HALF_T), P(e1, y, -HALF_T), P(e1, y, HALF_T), P(e0, y, HALF_T), n, trimC);
        k = k1 + 1;
      }
    }

    // --- top faces ---
    const up = W(x, z, l + 1, a);
    const covered = up || eaveOver(x, z, a, l) || gableOver(x, z, a, l);
    {
      const saved = builder;
      if (covered) builder = builders.cap(l);
      // a floor above continues across the wall top (no stripe in the floor)
      const cellsAbove = a === 0 ? [[x, z - 1], [x, z]] : [[x - 1, z], [x, z]];
      let topMat = st.a.mat, topCol = rgb(st.a.color);
      for (const [cx, cz] of cellsAbove) {
        const f = F(cx, cz, l + 1);
        if (f) { const fs = FLOOR_STYLES[f.style] || FLOOR_STYLES.wood; topMat = fs.top.mat; topCol = rgb(fs.top.color); break; }
      }
      let k = 0;
      while (k < SHAPE_COLS) {
        if (!isSolid(SHAPE_ROWS - 1, k)) { k++; continue; }
        let k1 = k;
        while (k1 + 1 < SHAPE_COLS && isSolid(SHAPE_ROWS - 1, k1 + 1)) k1++;
        const e0 = eLo(k), e1 = eHi(k1), y = STORY;
        quadN(topMat, P(e0, y, -HALF_T), P(e1, y, -HALF_T), P(e1, y, HALF_T), P(e0, y, HALF_T), [0, 1, 0], topCol);
        k = k1 + 1;
      }
      builder = saved;
    }
    // --- bottom faces where the wall below is open at its top row ---
    const below = l > 0 ? W(x, z, l - 1, a) : null;
    if (below) {
      const gb = wallGrid(`${x},${z},${l - 1},${a}`, below, a);
      let k = 0;
      while (k < SHAPE_COLS) {
        if (!(isSolid(0, k) && gb[SHAPE_ROWS - 1][k] !== CELL_SOLID)) { k++; continue; }
        let k1 = k;
        while (k1 + 1 < SHAPE_COLS && isSolid(0, k1 + 1) && gb[SHAPE_ROWS - 1][k1 + 1] !== CELL_SOLID) k1++;
        quadN(revealKey, P(eLo(k), 0, -HALF_T), P(eHi(k1), 0, -HALF_T), P(eHi(k1), 0, HALF_T), P(eLo(k), 0, HALF_T), [0, -1, 0], trimC);
        k = k1 + 1;
      }
    }
    // --- thresholds: bottom-row openings ---
    {
      let k = 0;
      while (k < SHAPE_COLS) {
        if (isSolid(0, k)) { k++; continue; }
        let k1 = k;
        while (k1 + 1 < SHAPE_COLS && !isSolid(0, k1 + 1)) k1++;
        const thr = [0.62, 0.5, 0.38];
        quadN('woodFurn', P(eLo(k), 0.004, -HALF_T), P(eHi(k1), 0.004, -HALF_T), P(eHi(k1), 0.004, HALF_T), P(eLo(k), 0.004, HALF_T), [0, 1, 0], thr);
        k = k1 + 1;
      }
    }

    // --- collision: solid rectangles (full rows), windows ---
    greedyRects(g, (c) => c === CELL_SOLID, (k0, k1, r0, r1) => {
      const e0 = eLo(k0), e1 = eHi(k1);
      const p0 = P(e0, r0 * SUB, -HALF_T), p1 = P(e1, (r1 + 1) * SUB, HALF_T);
      box(Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2]));
    });

    // --- openings: windows (glass + frames + casings), doors ---
    greedyRects(g, (c) => c === CELL_WINDOW, (k0, k1, r0, r1) => {
      const e0 = eLo(k0), e1 = eHi(k1), ya = r0 * SUB, yb = (r1 + 1) * SUB;
      const pa = P(e0, ya, -0.03), pb = P(e1, yb, 0.03);
      box(Math.min(pa[0], pb[0]), pa[1], Math.min(pa[2], pb[2]), Math.max(pa[0], pb[0]), pb[1], Math.max(pa[2], pb[2]), 'glass');
      out.glass.push({ a: P(e0, ya, 0), b: P(e1, ya, 0), c: P(e1, yb, 0), d: P(e0, yb, 0) });
      builder.quad('glass', P(e0, ya, 0), P(e1, ya, 0), P(e1, yb, 0), P(e0, yb, 0), [1, 1, 1], null, nAxis);
      windowFrame(builder, P, e0, e1, ya, yb, trimC, nAxis, eAxis);
      casings(g, k0, k1, r0, r1, true);
    });
    greedyRects(g, (c) => c === CELL_DOOR, (k0, k1, r0, r1) => {
      const e0 = eLo(k0), e1 = eHi(k1), ya = r0 * SUB, yb = (r1 + 1) * SUB;
      // hinge side: normally the low-e side; the right half of a double door hinges high
      let hingeLow = true;
      if (k0 === 0) {
        const nb = a === 0 ? W(x - 1, z, l, 0) : W(x, z - 1, l, 1);
        if (nb) {
          const gnb = wallGrid(a === 0 ? `${x - 1},${z},${l},0` : `${x},${z - 1},${l},1`, nb, a);
          if (gnb[r0][SHAPE_COLS - 1] === CELL_DOOR) hingeLow = false;
        }
      }
      const barn = st.a.mat === 'boardBatten' || st.a.mat === 'metal';
      // barn doors swing out (toward side A), house doors swing in (toward side B)
      const swing = barn ? sA : -sA;
      out.doors.push({
        wallKey: key, a, level: l,
        hinge: P(hingeLow ? e0 : e1, ya, 0),
        width: e1 - e0, height: yb - ya, hingeLow, swing,
        eAxis, nAxis, style: w.style, barn,
        glass: g.some((row) => row.includes(CELL_WINDOW)) && st.a.mat !== 'siding' && st.a.mat !== 'boardBatten',
        color: w.doorColor || null,
      });
      casings(g, k0, k1, r0, r1, false);
    });

    function casings(gg, k0, k1, r0, r1, isWindow) {
      const cw = 0.085, cd = 0.022;
      const solidAt = (r, k) => (k < 0 || k >= SHAPE_COLS) ? true : (r >= SHAPE_ROWS ? true : r < 0 ? false : gg[r][k] === CELL_SOLID);
      const e0 = eLo(k0), e1 = eHi(k1), ya = r0 * SUB, yb = (r1 + 1) * SUB;
      for (const s of [-1, 1]) {
        const base = s * HALF_T;
        const outer = s * (HALF_T + cd);
        const leftOk = Array.from({ length: r1 - r0 + 1 }, (_, i) => solidAt(r0 + i, k0 - 1)).every(Boolean);
        const rightOk = Array.from({ length: r1 - r0 + 1 }, (_, i) => solidAt(r0 + i, k1 + 1)).every(Boolean);
        const topOk = Array.from({ length: k1 - k0 + 1 }, (_, i) => solidAt(r1 + 1, k0 + i)).every(Boolean);
        const botOk = isWindow && Array.from({ length: k1 - k0 + 1 }, (_, i) => solidAt(r0 - 1, k0 + i)).every(Boolean);
        const ext = s === sA;
        const yBot = ya;
        if (leftOk) prism(P, e0 - cw, e0, yBot, yb, base, outer, trimC, s, nAxis, eAxis);
        if (rightOk) prism(P, e1, e1 + cw, yBot, yb, base, outer, trimC, s, nAxis, eAxis);
        if (topOk) {
          const hw = ext ? cw + 0.03 : cw;
          prism(P, e0 - (leftOk ? hw : 0), e1 + (rightOk ? hw : 0), yb, yb + (ext ? 0.13 : cw), base, s * (HALF_T + cd + (ext ? 0.012 : 0)), trimC, s, nAxis, eAxis);
        }
        if (botOk) {
          const sillOut = s * (HALF_T + (ext ? 0.06 : 0.035));
          prism(P, e0 - cw - 0.03, e1 + cw + 0.03, ya - 0.05, ya, base, sillOut, trimC, s, nAxis, eAxis);
          if (ext) prism(P, e0 - 0.02, e1 + 0.02, ya - 0.12, ya - 0.05, base, s * (HALF_T + cd), trimC, s, nAxis, eAxis);
        }
      }
    }
  }

  // Box protruding from a wall face (in wall-local coords) — 5 visible faces.
  function prism(P, e0, e1, ya, yb, n0, n1, color, s, nAxis, eAxis) {
    const key = 'plain:paint';
    const nOut = s > 0 ? nAxis : [-nAxis[0], -nAxis[1], -nAxis[2]];
    const ne = [-eAxis[0], -eAxis[1], -eAxis[2]];
    // front
    quadN(key, P(e0, ya, n1), P(e1, ya, n1), P(e1, yb, n1), P(e0, yb, n1), nOut, color);
    // top / bottom
    quadN(key, P(e0, yb, n0), P(e1, yb, n0), P(e1, yb, n1), P(e0, yb, n1), [0, 1, 0], mulc(color, 1.0));
    quadN(key, P(e0, ya, n0), P(e1, ya, n0), P(e1, ya, n1), P(e0, ya, n1), [0, -1, 0], mulc(color, 0.8));
    // ends
    quadN(key, P(e0, ya, n0), P(e0, ya, n1), P(e0, yb, n1), P(e0, yb, n0), ne, mulc(color, 0.9));
    quadN(key, P(e1, ya, n0), P(e1, ya, n1), P(e1, yb, n1), P(e1, yb, n0), eAxis, mulc(color, 0.9));
  }

  function windowFrame(b, P, e0, e1, ya, yb, color, nAxis, eAxis) {
    const fw = 0.05, fd = 0.035;
    const bar = (ea, eb, y0, y1) => {
      // centred box at the glass plane
      const p0 = P(ea, y0, -fd), p1 = P(eb, y1, fd);
      b.box('plain:paint', Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2]),
        Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2]), color);
    };
    bar(e0, e1, ya, ya + fw);
    bar(e0, e1, yb - fw, yb);
    bar(e0, e0 + fw, ya + fw, yb - fw);
    bar(e1 - fw, e1, ya + fw, yb - fw);
    const h = yb - ya, w = e1 - e0;
    if (h >= 0.7 && h < 1.9) { // double-hung meeting rail
      const ym = ya + h * 0.5;
      bar(e0 + fw, e1 - fw, ym - 0.03, ym + 0.03);
    }
    if (w >= 1.2) { // muntins
      const n = Math.round(w / 0.7);
      for (let i = 1; i < n; i++) {
        const em = e0 + (w * i) / n;
        bar(em - 0.025, em + 0.025, ya + fw, yb - fw);
      }
    }
  }

  // =====================================================================
  // POSTS (and columns)
  // =====================================================================
  const vertSet = new Set();
  for (const key of S.walls.keys()) {
    const [x, z, l, a] = key.split(',').map(Number);
    vertSet.add(`${x},${z},${l}`);
    if (a === 0) vertSet.add(`${x + 1},${z},${l}`); else vertSet.add(`${x},${z + 1},${l}`);
  }
  for (const key of S.columns.keys()) vertSet.add(key);

  for (const vk of vertSet) {
    const [vx, vz, l] = vk.split(',').map(Number);
    use(l);
    const vw = vertexWalls(vx, vz, l);
    const col = C(vx, vz, l);
    const X = vx * CELL, Z = vz * CELL, y0 = yOf(l);
    // which rows does the post occupy?
    const rows = new Array(SHAPE_ROWS).fill(false);
    if (col) rows.fill(true);
    for (const t of vw) {
      const gg = wallGrid(`${t.x},${t.z},${l},${t.a}`, t.w, t.a);
      for (let r = 0; r < SHAPE_ROWS; r++) if (gg[r][t.k] !== CELL_OPEN) rows[r] = true;
    }
    if (!rows.some(Boolean)) continue;
    const byDir = [null, null, null, null];
    for (const t of vw) byDir[t.dir] = t;
    // material for the face pointing in world direction d (0:+X,1:+Z,2:-X,3:-Z)
    const faceMat = (d, r) => {
      const t = byDir[d];
      if (t) {
        const gg = wallGrid(`${t.x},${t.z},${l},${t.a}`, t.w, t.a);
        const c = gg[r][t.k];
        if (c === CELL_SOLID) return null; // hidden by the abutting wall
        return { mat: 'trim', color: getStyle(t.w.style).trim, trim: true };
      }
      // perpendicular walls share this face's plane
      const s = d === 0 || d === 1 ? 1 : -1;
      const perp = d === 0 || d === 2 ? [byDir[1], byDir[3]] : [byDir[0], byDir[2]];
      for (const p of perp) if (p) return faceFinish(p.w, p.a, s);
      // free end: use the opposite wall's exterior
      const opp = byDir[(d + 2) % 4];
      if (opp) {
        const st = getStyle(opp.w.style);
        return { mat: 'trim', color: st.trim, trim: true };
      }
      return { mat: 'trim', color: '#eeeeee', trim: true };
    };
    const corners = {
      0: [[X + HALF_T, Z + HALF_T], [X + HALF_T, Z - HALF_T]],
      1: [[X - HALF_T, Z + HALF_T], [X + HALF_T, Z + HALF_T]],
      2: [[X - HALF_T, Z - HALF_T], [X - HALF_T, Z + HALF_T]],
      3: [[X + HALF_T, Z - HALF_T], [X - HALF_T, Z - HALF_T]],
    };
    const normals = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
    for (let d = 0; d < 4; d++) {
      let r = 0;
      while (r < SHAPE_ROWS) {
        if (!rows[r]) { r++; continue; }
        const m = faceMat(d, r);
        if (!m) { r++; continue; }
        let r1 = r;
        while (r1 + 1 < SHAPE_ROWS && rows[r1 + 1] && !BAND_SPLIT.has(r1 + 1)) {
          const m2 = faceMat(d, r1 + 1);
          if (!m2 || m2.mat !== m.mat || m2.color !== m.color) break;
          r1++;
        }
        const [p, q] = corners[d];
        const ya = r * SUB, yb = (r1 + 1) * SUB;
        const tint = rgb(m.color);
        const interior = INTERIOR_MATS.has(m.mat);
        const ao = (y) => (m.trim ? 1 : interior ? aoInt(y) : aoExt(y, l));
        const ca = mulc(tint, ao(ya)), cb = mulc(tint, ao(yb));
        const key = m.trim ? 'trim' : m.mat;
        quadN(key, [p[0], y0 + ya, p[1]], [q[0], y0 + ya, q[1]], [q[0], y0 + yb, q[1]], [p[0], y0 + yb, p[1]], normals[d], [ca, ca, cb, cb]);
        r = r1 + 1;
      }
    }
    // top cap
    let top = SHAPE_ROWS - 1;
    while (top >= 0 && !rows[top]) top--;
    const abovePosted = posted(vx, vz, l + 1);
    {
      const yt = y0 + (top + 1) * SUB;
      const m = byDir.find(Boolean);
      let capC = m ? rgb(getStyle(m.w.style).a.color) : [0.9, 0.9, 0.9];
      let capKey = m ? getStyle(m.w.style).a.mat : 'trim';
      if (top === SHAPE_ROWS - 1) {
        for (const [cx, cz] of [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]]) {
          const f = F(cx, cz, l + 1);
          if (f) { const fs = FLOOR_STYLES[f.style] || FLOOR_STYLES.wood; capKey = fs.top.mat; capC = rgb(fs.top.color); break; }
        }
      }
      (top === SHAPE_ROWS - 1 && abovePosted ? builders.cap(l) : builder).quad(capKey, [X - HALF_T, yt, Z + HALF_T], [X + HALF_T, yt, Z + HALF_T], [X + HALF_T, yt, Z - HALF_T], [X - HALF_T, yt, Z - HALF_T], capC, null, [0, 1, 0]);
    }
    // collision per contiguous run
    {
      let r = 0;
      while (r < SHAPE_ROWS) {
        if (!rows[r]) { r++; continue; }
        let r1 = r;
        while (r1 + 1 < SHAPE_ROWS && rows[r1 + 1]) r1++;
        box(X - HALF_T, y0 + r * SUB, Z - HALF_T, X + HALF_T, y0 + (r1 + 1) * SUB, Z + HALF_T);
        r = r1 + 1;
      }
    }
    // decorative column trim (base and capital rings)
    if (col) {
      const cc = rgb(col.color || '#f4f2ec');
      builder.box('plain:paint', X - 0.13, y0, Z - 0.13, X + 0.13, y0 + 0.18, Z + 0.13, mulc(cc, 0.95), { ny: false });
      builder.box('plain:paint', X - 0.12, y0 + STORY - 0.42, Z - 0.12, X + 0.12, y0 + STORY - 0.32, Z + 0.12, cc);
    }
  }

  // =====================================================================
  // BEAMS under walls with nothing below (foundation stems at level 0)
  // =====================================================================
  const foundationOf = (x, z) => {
    const f = F(x, z, 0);
    return FOUNDATIONS[(f && f.found) || 'concrete'] || FOUNDATIONS.concrete;
  };
  const footing = (lx0, lz0, lx1, lz1) => {
    // lowest terrain under a footprint, minus margin (local y)
    let m = Infinity;
    for (const [px, pz] of [[lx0, lz0], [lx1, lz0], [lx0, lz1], [lx1, lz1], [(lx0 + lx1) / 2, (lz0 + lz1) / 2]]) m = Math.min(m, ground(px, pz));
    return Math.min(m - 0.35, -0.3);
  };
  for (const [key, w] of S.walls) {
    const [x, z, l, a] = key.split(',').map(Number);
    use(l);
    if (l > 0 && W(x, z, l - 1, a)) continue;
    const st = getStyle(w.style);
    const Xs = x * CELL, Zs = z * CELL, y1 = yOf(l);
    let x0, x1, z0, z1;
    if (a === 0) { x0 = Xs + HALF_T; x1 = Xs + CELL - HALF_T; z0 = Zs - HALF_T; z1 = Zs + HALF_T; }
    else { x0 = Xs - HALF_T; x1 = Xs + HALF_T; z0 = Zs + HALF_T; z1 = Zs + CELL - HALF_T; }
    let yb, keyA, keyB, cA, cB;
    if (l === 0) {
      const cells = a === 0 ? [[x, z - 1], [x, z]] : [[x - 1, z], [x, z]];
      const fd = foundationOf(...(F(...cells[1], 0) ? cells[1] : cells[0]));
      yb = footing(x0, z0, x1, z1);
      keyA = keyB = fd.mat; cA = cB = rgb(fd.color);
    } else {
      yb = y1 - SLAB_T;
      const sA = sideASign(w, a);
      const fp = faceFinish(w, a, 1), fm = faceFinish(w, a, -1);
      keyA = fp.mat; cA = rgb(fp.color); keyB = fm.mat; cB = rgb(fm.color);
      void sA;
    }
    const faces = a === 0
      ? { pz: true, nz: true, ny: l > 0, py: false, px: false, nx: false }
      : { px: true, nx: true, ny: l > 0, py: false, pz: false, nz: false };
    const keys = a === 0 ? { pz: keyA, nz: keyB, ny: 'trim' } : { px: keyA, nx: keyB, ny: 'trim' };
    builder.box(keyA, x0, yb, z0, x1, y1, z1, (f) => (f === 'pz' || f === 'px' ? cA : f === 'ny' ? rgb(st.trim) : cB), faces, keys);
    box(x0, yb, z0, x1, y1, z1);
  }
  // post beams
  for (const vk of vertSet) {
    const [vx, vz, l] = vk.split(',').map(Number);
    use(l);
    if (l > 0 && posted(vx, vz, l - 1)) continue;
    const X = vx * CELL, Z = vz * CELL, y1 = yOf(l);
    const vw = vertexWalls(vx, vz, l);
    if (!vw.length && !C(vx, vz, l)) continue;
    let yb, mat, c;
    if (l === 0) {
      yb = footing(X - HALF_T, Z - HALF_T, X + HALF_T, Z + HALF_T);
      const fd = foundationOf(vx - (F(vx, vz, 0) ? 0 : 1), vz - (F(vx, vz, 0) ? 0 : 1));
      mat = fd.mat; c = rgb(fd.color);
    } else {
      yb = y1 - SLAB_T;
      const t = vw[0];
      if (t) { const f = getStyle(t.w.style).a; mat = f.mat; c = rgb(f.color); }
      else { mat = 'trim'; c = [0.9, 0.9, 0.9]; }
    }
    // hide faces abutting wall beams in that direction
    const has = (d) => vw.some((t) => t.dir === d) || (l > 0 && vertexWalls(vx, vz, l - 1).some((t) => t.dir === d));
    builder.box(mat, X - HALF_T, yb, Z - HALF_T, X + HALF_T, y1, Z + HALF_T, c,
      { px: !has(0), pz: !has(1), nx: !has(2), nz: !has(3), py: false, ny: l > 0 });
    box(X - HALF_T, yb, Z - HALF_T, X + HALF_T, y1, Z + HALF_T);
  }

  // =====================================================================
  // FLOORS / FOUNDATIONS
  // =====================================================================
  for (const [key, f] of S.floors) {
    const [x, z, l] = key.split(',').map(Number);
    use(l);
    const fs = FLOOR_STYLES[f.style] || FLOOR_STYLES.wood;
    const X0 = x * CELL, X1 = X0 + CELL, Z0 = z * CELL, Z1 = Z0 + CELL;
    const y = yOf(l);
    const wallOn = (wx, wz, a) => !!(W(wx, wz, l, a) || (l > 0 && W(wx, wz, l - 1, a)));
    const inset = {
      nx: wallOn(x, z, 1), px: wallOn(x + 1, z, 1),
      nz: wallOn(x, z, 0), pz: wallOn(x, z + 1, 0),
    };
    const postAt = (vx, vz) => posted(vx, vz, l) || (l > 0 && posted(vx, vz, l - 1));
    const xs = [X0, X0 + HALF_T, X1 - HALF_T, X1];
    const zs = [Z0, Z0 + HALF_T, Z1 - HALF_T, Z1];
    const inc = (i, j) => {
      if (i === 1 && j === 1) return true;
      if (i === 0 && j === 1) return !inset.nx;
      if (i === 2 && j === 1) return !inset.px;
      if (j === 0 && i === 1) return !inset.nz;
      if (j === 2 && i === 1) return !inset.pz;
      const vx = i === 0 ? x : x + 1, vz = j === 0 ? z : z + 1;
      const ex = i === 0 ? !inset.nx : !inset.px;
      const ez = j === 0 ? !inset.nz : !inset.pz;
      return ex && ez && !postAt(vx, vz);
    };
    // AO from walls standing on this floor (top) / hanging over the ceiling (bottom)
    const wallsTop = { nx: !!W(x, z, l, 1), px: !!W(x + 1, z, l, 1), nz: !!W(x, z, l, 0), pz: !!W(x, z + 1, l, 0) };
    const wallsBot = l > 0 ? { nx: !!W(x, z, l - 1, 1), px: !!W(x + 1, z, l - 1, 1), nz: !!W(x, z, l - 1, 0), pz: !!W(x, z + 1, l - 1, 0) } : null;
    const aoAt = (px, pz, walls, strength) => {
      if (!walls) return 1;
      let k = 1;
      const f = (d) => 1 - strength * Math.exp(-Math.max(0, d) / 0.28);
      if (walls.nx) k *= f(px - (X0 + HALF_T));
      if (walls.px) k *= f(X1 - HALF_T - px);
      if (walls.nz) k *= f(pz - (Z0 + HALF_T));
      if (walls.pz) k *= f(Z1 - HALF_T - pz);
      return k;
    };
    const topTint = rgb(fs.top.color), botTint = rgb(fs.bottom.color);
    // subdivide the centre for smoother AO
    const sx = [xs[1], X0 + 0.7, X1 - 0.7, xs[2]], sz = [zs[1], Z0 + 0.7, Z1 - 0.7, zs[2]];
    const emitTop = (ax, bx, az, bz) => {
      const c = (px, pz) => mulc(topTint, aoAt(px, pz, wallsTop, 0.32));
      builder.quad(fs.top.mat, [ax, y, bz], [bx, y, bz], [bx, y, az], [ax, y, az], [c(ax, bz), c(bx, bz), c(bx, az), c(ax, az)], null, [0, 1, 0]);
    };
    const emitBot = (ax, bx, az, bz) => {
      const yb = y - SLAB_T;
      const c = (px, pz) => mulc(botTint, aoAt(px, pz, wallsBot, 0.22));
      builder.quad(fs.bottom.mat, [ax, yb, az], [bx, yb, az], [bx, yb, bz], [ax, yb, bz], [c(ax, az), c(bx, az), c(bx, bz), c(ax, bz)], null, [0, -1, 0]);
    };
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (!inc(i, j)) continue;
      if (i === 1 && j === 1) {
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          emitTop(sx[a], sx[a + 1], sz[b], sz[b + 1]);
          if (l > 0) emitBot(sx[a], sx[a + 1], sz[b], sz[b + 1]);
        }
      } else {
        emitTop(xs[i], xs[i + 1], zs[j], zs[j + 1]);
        if (l > 0) emitBot(xs[i], xs[i + 1], zs[j], zs[j + 1]);
      }
    }
    // edge faces where there is no neighbouring floor
    const fd = FOUNDATIONS[f.found || 'concrete'] || FOUNDATIONS.concrete;
    const edgeKey = l === 0 ? fd.mat : fs.bottom.mat;
    const edgeC = l === 0 ? rgb(fd.color) : mulc(botTint, 0.95);
    const yBottom = l === 0 ? footing(X0, Z0, X1, Z1) : y - SLAB_T;
    const edge = (side) => {
      // side: nx, px, nz, pz
      const nb = { nx: [x - 1, z], px: [x + 1, z], nz: [x, z - 1], pz: [x, z + 1] }[side];
      if (F(nb[0], nb[1], l) || inset[side]) return;
      const n = { nx: [-1, 0, 0], px: [1, 0, 0], nz: [0, 0, -1], pz: [0, 0, 1] }[side];
      // span along the edge: include strip ends depending on corners
      if (side === 'nx' || side === 'px') {
        const xx = side === 'nx' ? X0 : X1;
        const i = side === 'nx' ? 0 : 2;
        const za = inc(i, 0) ? Z0 : zs[1], zb = inc(i, 2) ? Z1 : zs[2];
        quadN(edgeKey, [xx, yBottom, za], [xx, yBottom, zb], [xx, y, zb], [xx, y, za], n, edgeC);
      } else {
        const zz = side === 'nz' ? Z0 : Z1;
        const j = side === 'nz' ? 0 : 2;
        const xa = inc(0, j) ? X0 : xs[1], xb = inc(2, j) ? X1 : xs[2];
        quadN(edgeKey, [xa, yBottom, zz], [xb, yBottom, zz], [xb, y, zz], [xa, y, zz], n, edgeC);
      }
    };
    edge('nx'); edge('px'); edge('nz'); edge('pz');
    box(X0, l === 0 ? yBottom : y - SLAB_T, Z0, X1, y, Z1, 'floor');
  }

  // =====================================================================
  // ROOFS
  // =====================================================================
  for (const [key, r] of S.roofs) {
    const [x, z, l] = key.split(',').map(Number);
    use(l);
    const rs = ROOF_STYLES[r.style] || ROOF_STYLES.black_shingle;
    const d = r.dir;
    const k = rise(r) / CELL;
    const hb = roofHb(x, z, l);
    const H = (q) => hb + k * q;
    const X0 = x * CELL, X1 = X0 + CELL, Z0 = z * CELL, Z1 = Z0 + CELL;
    const toL = (q, t, y) => {
      if (d === 0) return [X1 - q, y, t];
      if (d === 1) return [t, y, Z1 - q];
      if (d === 2) return [X0 + q, y, t];
      return [t, y, Z0 + q];
    };
    const [T0, T1] = d === 0 || d === 2 ? [Z0, Z1] : [X0, X1];
    const perp = d === 0 || d === 2 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    const sameChain = (cx, cz) => {
      const o = R(cx, cz, l);
      return o && o.dir === d && Math.abs(roofHb(cx, cz, l) - hb) < 0.01 && Math.abs(o.pitch - r.pitch) < 0.01;
    };
    const nLo = sameChain(x + perp[0][0], z + perp[0][1]);
    const nHi = sameChain(x + perp[1][0], z + perp[1][1]);
    const eave = isEave(x, z, l, r);
    const qa = eave ? -EAVE_OV : 0, qb = CELL;
    const ta = nLo ? T0 : T0 - RAKE_OV, tb = nHi ? T1 : T1 + RAKE_OV;
    const slopeLen = Math.sqrt(1 + k * k);
    const topC = rgb(rs.top.color), underC = rgb(rs.under.color), fasciaC = rgb(rs.fascia);
    const D = DIRS[d];
    const vAbs = (q) => (-(x * CELL * D[0] + z * CELL * D[1]) + q) * slopeLen; // along-slope coordinate
    const tSign = d === 0 || d === 3 ? -1 : 1; // keep textures unmirrored
    // uphill direction (horizontal) and normal of the top surface
    const upH = [-D[0], 0, -D[1]];
    const nTop = norm([upH[0] * -k, 1, upH[2] * -k]);
    const nUnder = [-nTop[0], -nTop[1], -nTop[2]];
    // top
    builder.quad(rs.top.mat, toL(qa, ta, H(qa) + ROOF_TV), toL(qa, tb, H(qa) + ROOF_TV), toL(qb, tb, H(qb) + ROOF_TV), toL(qb, ta, H(qb) + ROOF_TV),
      topC, [[ta * tSign, vAbs(qa)], [tb * tSign, vAbs(qa)], [tb * tSign, vAbs(qb)], [ta * tSign, vAbs(qb)]], null);
    fixWinding(builder, rs.top.mat, nTop);
    // underside
    builder.quad(rs.under.mat, toL(qa, ta, H(qa)), toL(qb, ta, H(qb)), toL(qb, tb, H(qb)), toL(qa, tb, H(qa)),
      underC, [[ta, vAbs(qa)], [ta, vAbs(qb)], [tb, vAbs(qb)], [tb, vAbs(qa)]], null);
    fixWinding(builder, rs.under.mat, nUnder);
    // fascia at the eave
    if (eave) {
      quadN('plain:paint', toL(qa, ta, H(qa) - 0.04), toL(qa, tb, H(qa) - 0.04), toL(qa, tb, H(qa) + ROOF_TV), toL(qa, ta, H(qa) + ROOF_TV), [D[0], 0, D[1]], fasciaC);
      // fascia bottom lip
      quadN('plain:paint', toL(qa, ta, H(qa) - 0.04), toL(qa + 0.03, ta, H(qa) - 0.04), toL(qa + 0.03, tb, H(qa) - 0.04), toL(qa, tb, H(qa) - 0.04), [0, -1, 0], mulc(fasciaC, 0.85));
    }
    // rake ends
    const rake = (t, sgn) => {
      const n = d === 0 || d === 2 ? [0, 0, sgn] : [sgn, 0, 0];
      quadN('plain:paint', toL(qa, t, H(qa) - 0.04), toL(qb, t, H(qb) - 0.04), toL(qb, t, H(qb) + ROOF_TV), toL(qa, t, H(qa) + ROOF_TV), n, fasciaC);
    };
    if (!nLo) rake(ta, -1);
    if (!nHi) rake(tb, 1);
    // ridge partner / high end
    const ux = x - D[0], uz = z - D[1];
    const partner = R(ux, uz, l);
    const ridge = partner && partner.dir === (d + 2) % 4 && Math.abs(roofHb(ux, uz, l) + rise(partner) - (hb + rise(r))) < 0.02;
    const [hex, hez, hea] = uphillEdge(x, z, d);
    const abutWall = W(hex, hez, l, hea) || W(hex, hez, l + 1, hea);
    if (!ridge && !abutWall) {
      quadN('plain:paint', toL(qb, ta, H(qb)), toL(qb, tb, H(qb)), toL(qb, tb, H(qb) + ROOF_TV), toL(qb, ta, H(qb) + ROOF_TV), [-D[0], 0, -D[1]], fasciaC);
    }
    if (ridge && d < 2) {
      const yt = H(qb) + ROOF_TV;
      const capC = mulc(topC, 0.8);
      const c0 = toL(qb - 0.14, ta, 0), c1 = toL(qb + 0.14, tb, 0);
      builder.box(rs.top.mat, Math.min(c0[0], c1[0]), yt - 0.05, Math.min(c0[2], c1[2]), Math.max(c0[0], c1[0]), yt + 0.07, Math.max(c0[2], c1[2]), capC);
    }
    // eave: wedge above the wall below, or a header beam if open below
    if (eave) {
      const [ex, ez, ea] = downhillEdge(x, z, d);
      const wb0 = W(ex, ez, l - 1, ea);
      const wb = wb0 && fullTop(wb0, `${ex},${ez},${l - 1},${ea}`, ea) ? wb0 : null;
      const yl = yOf(l);
      if (wb) {
        // inner face of the wedge, finish of the wall's uphill-facing side
        const s = ea === 0 ? -D[1] : -D[0];
        const fin = faceFinish(wb, ea, s);
        quadN(fin.mat, toL(HALF_T, T0, yl), toL(HALF_T, T1, yl), toL(HALF_T, T1, H(HALF_T)), toL(HALF_T, T0, H(HALF_T)), upH, rgb(fin.color));
      } else if (l > 0) {
        const bt0 = posted(...edgeVertex(ex, ez, ea, 0), l - 1) ? T0 + HALF_T : T0;
        const bt1 = posted(...edgeVertex(ex, ez, ea, 1), l - 1) ? T1 - HALF_T : T1;
        const p0 = toL(-HALF_T, bt0, 0), p1 = toL(HALF_T, bt1, 0);
        const bx0 = Math.min(p0[0], p1[0]), bx1 = Math.max(p0[0], p1[0]), bz0 = Math.min(p0[2], p1[2]), bz1 = Math.max(p0[2], p1[2]);
        builder.box('plain:paint', bx0, yl - SLAB_T, bz0, bx1, yl, bz1, fasciaC, { py: false });
        quadN('plain:paint', toL(HALF_T, bt0, yl), toL(HALF_T, bt1, yl), toL(HALF_T, bt1, H(HALF_T)), toL(HALF_T, bt0, H(HALF_T)), upH, fasciaC);
        box(bx0, yl - SLAB_T, bz0, bx1, yl, bz1);
      }
    }
    // gable fills above walls on the rake sides
    for (const [side, t, sgn] of [[0, T0, -1], [1, T1, 1]]) {
      if (side === 0 ? nLo : nHi) continue;
      // wall edge under this side: runs along q
      let wx, wz, wa;
      if (d === 0 || d === 2) { wa = 0; wx = x; wz = side === 0 ? z : z + 1; }
      else { wa = 1; wz = z; wx = side === 0 ? x : x + 1; }
      const wb = W(wx, wz, l - 1, wa);
      if (!wb || !fullTop(wb, `${wx},${wz},${l - 1},${wa}`, wa)) continue;
      // a taller part of the building already has walls here (e.g. a tower)
      if (W(wx, wz, l, wa) || W(wx, wz, l + 1, wa)) continue;
      const yl = yOf(l);
      const q0 = eave ? -HALF_T : 0;
      const n = d === 0 || d === 2 ? [0, 0, 1] : [1, 0, 0];
      for (const s of [-1, 1]) {
        const fin = faceFinish(wb, wa, s);
        const off = t + s * HALF_T;
        const tint = rgb(fin.color);
        quadN(fin.mat, toL(q0, off, yl), toL(qb, off, yl), toL(qb, off, H(qb)), toL(q0, off, H(q0)), s > 0 ? n : [-n[0], 0, -n[2]], tint);
      }
      // high end cap when nothing continues past the top
      if (!ridge && !abutWall) {
        quadN('trim', toL(qb, t - HALF_T, yl), toL(qb, t + HALF_T, yl), toL(qb, t + HALF_T, H(qb)), toL(qb, t - HALF_T, H(qb)), [-D[0], 0, -D[1]], rgb(getStyle(wb.style).trim));
      }
      // collision
      for (let i = 0; i < 4; i++) {
        const qm = (i + 0.5) * 0.5;
        const pa = toL(i * 0.5, t - HALF_T, 0), pb = toL((i + 1) * 0.5, t + HALF_T, 0);
        box(Math.min(pa[0], pb[0]), yl, Math.min(pa[2], pb[2]), Math.max(pa[0], pb[0]), H(qm), Math.max(pa[2], pb[2]));
      }
    }
    // roof collision (stepped)
    for (let i = 0; i < 4; i++) {
      const qa2 = i * 0.5, qb2 = (i + 1) * 0.5;
      const pa = toL(qa2, T0, 0), pb = toL(qb2, T1, 0);
      box(Math.min(pa[0], pb[0]), H(qa2), Math.min(pa[2], pb[2]), Math.max(pa[0], pb[0]), H(qb2) + ROOF_TV, Math.max(pa[2], pb[2]), 'roof');
    }
  }

  function edgeVertex(x, z, a, end) {
    if (end === 0) return [x, z];
    return a === 0 ? [x + 1, z] : [x, z + 1];
  }

  // =====================================================================
  // STAIRS
  // =====================================================================
  for (const [key, s] of S.stairs) {
    const [x, z, l] = key.split(',').map(Number);
    use(l);
    const d = s.dir;
    const D = DIRS[d];
    const y0 = yOf(l);
    const X0 = x * CELL, Z0 = z * CELL;
    // run origin at the start edge of the first cell
    const run = CELL * 2;
    const toL = (q, t, y) => {
      // q along run (0..4), t across (0..2)
      if (d === 0) return [X0 + q, y, Z0 + t];
      if (d === 1) return [X0 + t, y, Z0 + q];
      if (d === 2) return [X0 + CELL - q, y, Z0 + t];
      return [X0 + t, y, Z0 + CELL - q];
    };
    // side walls present? (walls on the long edges of both cells)
    const cells = [[x, z], [x + D[0], z + D[1]]];
    const sideWall = (side) => cells.every(([cx, cz]) => {
      if (d === 0 || d === 2) return !!W(cx, cz + side, l, 0);
      return !!W(cx + side, cz, l, 1);
    });
    // t=0 side corresponds to lower coordinate
    const wall0 = sideWall(0), wall1 = sideWall(1);
    const t0 = HALF_T + 0.0, t1 = CELL - HALF_T;
    const h = STORY / STAIR_STEPS, rr = run / STAIR_STEPS;
    const treadC = rgb(s.color || '#ffffff');
    const sideC = rgb(s.side || '#efeae0');
    const flip = d === 2 || d === 3;
    for (let i = 0; i < STAIR_STEPS; i++) {
      const qa = i * rr, qb = (i + 1) * rr, yt = y0 + (i + 1) * h, ybot = y0 + i * h;
      const pa = toL(qa, t0, 0), pb = toL(qb, t1, 0);
      const bx0 = Math.min(pa[0], pb[0]), bx1 = Math.max(pa[0], pb[0]), bz0 = Math.min(pa[2], pb[2]), bz1 = Math.max(pa[2], pb[2]);
      // tread (slight nosing)
      const pn = toL(qa - 0.025, t0, 0);
      const tx0 = Math.min(pn[0], pb[0]), tx1 = Math.max(pn[0], pb[0]), tz0 = Math.min(pn[2], pb[2]), tz1 = Math.max(pn[2], pb[2]);
      builder.box('woodFloor', tx0, yt - 0.035, tz0, tx1, yt, tz1, treadC, { ny: true });
      // riser
      const nRise = [-D[0], 0, -D[1]];
      quadN('plain:paint', toL(qa, t0, ybot), toL(qa, t1, ybot), toL(qa, t1, yt - 0.035), toL(qa, t0, yt - 0.035), nRise, sideC);
      // sides (stringers): from floor to step top
      const nS0 = d === 0 || d === 2 ? [0, 0, -1] : [-1, 0, 0];
      const nS1 = [-nS0[0], 0, -nS0[2]];
      if (!wall0) quadN('plain:paint', toL(qa, t0, y0), toL(qb, t0, y0), toL(qb, t0, yt - 0.035), toL(qa, t0, yt - 0.035), nS0, sideC);
      if (!wall1) quadN('plain:paint', toL(qa, t1, y0), toL(qb, t1, y0), toL(qb, t1, yt - 0.035), toL(qa, t1, yt - 0.035), nS1, sideC);
      box(bx0, y0, bz0, bx1, yt, bz1, 'stair');
      void flip;
    }
    // back face
    quadN('plain:paint', toL(run, t0, y0), toL(run, t1, y0), toL(run, t1, y0 + STORY - 0.035), toL(run, t0, y0 + STORY - 0.035), [D[0], 0, D[1]], sideC);
    // handrails on open sides
    for (const [open, t] of [[!wall0, t0 + 0.05], [!wall1, t1 - 0.05]]) {
      if (!open) continue;
      const railC = rgb('#6b4a32');
      const rh = 0.9;
      // balusters
      for (let i = 0; i < STAIR_STEPS; i += 2) {
        const q = (i + 0.5) * rr, yt = y0 + (i + 1) * h;
        const p = toL(q, t, 0);
        builder.box('plain:paint', p[0] - 0.02, yt, p[2] - 0.02, p[0] + 0.02, yt + rh, p[2] + 0.02, rgb('#f2efe8'));
      }
      // newel posts
      for (const [q, yy] of [[0.12, y0], [run - 0.12, y0 + STORY]]) {
        const p = toL(q, t, 0);
        builder.box('plain:paint', p[0] - 0.05, yy, p[2] - 0.05, p[0] + 0.05, yy + rh + 0.15, p[2] + 0.05, railC);
      }
      // sloped rail (4-sided prism)
      const ra = toL(0.12, t, y0 + rh + 0.1), rb = toL(run - 0.12, t, y0 + STORY + rh + 0.05);
      slopedBar(builder, ra, rb, 0.035, railC, d);
    }
  }

  // =====================================================================
  // PROPS / FURNITURE
  // =====================================================================
  buildProps(S, (p) => builders.get(Math.max(0, Math.floor((p.y + 0.01) / STORY))), out);

  return out;
}

function slopedBar(b, A, B, r, color, d) {
  // square bar between A and B; cross-section aligned to world up and the stair's side axis
  const side = d === 0 || d === 2 ? [0, 0, 1] : [1, 0, 0];
  const corners = [[-r, -r], [r, -r], [r, r], [-r, r]];
  const P = (base, c) => [base[0] + side[0] * c[0], base[1] + c[1], base[2] + side[2] * c[0]];
  for (let i = 0; i < 4; i++) {
    const c0 = corners[i], c1 = corners[(i + 1) % 4];
    const a0 = P(A, c0), a1 = P(A, c1), b1 = P(B, c1), b0 = P(B, c0);
    b.quad('plain:paint', a0, a1, b1, b0, color);
    // ensure outward winding: compute normal and flip if pointing inward
    const B_ = b.bucket('plain:paint');
    const n = B_.nor.length;
    const nx = B_.nor[n - 3], ny = B_.nor[n - 2], nz = B_.nor[n - 1];
    const mid = [(a0[0] + b1[0]) / 2 - (A[0] + B[0]) / 2, (a0[1] + b1[1]) / 2 - (A[1] + B[1]) / 2, (a0[2] + b1[2]) / 2 - (A[2] + B[2]) / 2];
    if (nx * mid[0] + ny * mid[1] + nz * mid[2] < 0) flipLastQuad(B_);
  }
}

// Newell's method: robust polygon normal (handles collapsed corners).
export function newell(...pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    x += (p[1] - q[1]) * (p[2] + q[2]);
    y += (p[2] - q[2]) * (p[0] + q[0]);
    z += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return [x, y, z];
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

// Make the last quad in bucket face along n (flip winding + normals if needed).
function fixWinding(builder, key, n) {
  const B = builder.bucket(key);
  const vi = B.pos.length / 3 - 4;
  const p = (i) => [B.pos[(vi + i) * 3], B.pos[(vi + i) * 3 + 1], B.pos[(vi + i) * 3 + 2]];
  const c = newell(p(0), p(1), p(2), p(3));
  const flip = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] < 0;
  if (flip) {
    const ii = B.idx.length - 6;
    B.idx[ii + 1] = vi + 2; B.idx[ii + 2] = vi + 1;
    B.idx[ii + 4] = vi + 3; B.idx[ii + 5] = vi + 2;
  }
  for (let i = 0; i < 4; i++) {
    B.nor[(vi + i) * 3] = n[0]; B.nor[(vi + i) * 3 + 1] = n[1]; B.nor[(vi + i) * 3 + 2] = n[2];
  }
}
function flipLastQuad(B) {
  const vi = B.pos.length / 3 - 4;
  const ii = B.idx.length - 6;
  B.idx[ii + 1] = vi + 2; B.idx[ii + 2] = vi + 1;
  B.idx[ii + 4] = vi + 3; B.idx[ii + 5] = vi + 2;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.nor[(vi + i) * 3 + j] *= -1;
}

// Greedy rectangle decomposition of cells matching pred. cb(k0,k1,r0,r1)
export function greedyRects(g, pred, cb) {
  const used = g.map((row) => row.map(() => false));
  for (let r = 0; r < SHAPE_ROWS; r++) {
    for (let k = 0; k < SHAPE_COLS; k++) {
      if (used[r][k] || !pred(g[r][k])) continue;
      let k1 = k;
      while (k1 + 1 < SHAPE_COLS && !used[r][k1 + 1] && pred(g[r][k1 + 1])) k1++;
      let r1 = r;
      outer: while (r1 + 1 < SHAPE_ROWS) {
        for (let kk = k; kk <= k1; kk++) if (used[r1 + 1][kk] || !pred(g[r1 + 1][kk])) break outer;
        r1++;
      }
      for (let rr = r; rr <= r1; rr++) for (let kk = k; kk <= k1; kk++) used[rr][kk] = true;
      cb(k, k1, r, r1);
    }
  }
}

function rowRunEquals(g, r, k0, k1) {
  if (g[r][k0] !== CELL_SOLID) return false;
  for (let k = k0; k <= k1; k++) if (g[r][k] !== CELL_SOLID) return false;
  if (k0 > 0 && g[r][k0 - 1] === CELL_SOLID) return false;
  if (k1 < SHAPE_COLS - 1 && g[r][k1 + 1] === CELL_SOLID) return false;
  return true;
}
// true if row r has exactly the same maximal run [k0..k1] (meaning it was merged from above)
function rowRunSame(g, r, k0, k1, rMin) {
  if (r < rMin) return false;
  return rowRunEquals(g, r, k0, k1);
}
