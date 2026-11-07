// Automatic room furnishing. Works on a 0.1 m occupancy grid per room:
// keeps door swings, stair landings and a walkable path between every
// doorway clear, puts tall items only against solid wall, and places low
// items (beds, counters, couches) under windows where needed.
import { CELL, DIRS, CELL_SOLID, CELL_WINDOW, wallGridE, SHAPE_COLS, SHAPE_ROWS, SUB } from './defs.js';

const RES = 0.1;
const PER = Math.round(CELL / RES); // 20 sub-cells per grid cell
const FREE = 1, BLOCK = 0, OCC = 2, CLEAR = 3;

// footprint [x0, x1, z0, z1] in prop space (front = +z), height, flags
const ITEMS = {
  bed: (p) => ({ fp: [-(p.w || 1.5) / 2 - 0.03, (p.w || 1.5) / 2 + 0.03, -1.08, 1.08], h: 1.05, front: 0.7 }),
  nightstand: () => ({ fp: [-0.24, 0.24, -0.2, 0.2], h: 1.0, front: 0 }),
  dresser: (p) => ({ fp: [-(p.w || 1.1) / 2, (p.w || 1.1) / 2, -0.25, 0.25], h: 0.85, front: 0.7 }),
  couch: (p) => ({ fp: [-(p.w || 2) / 2, (p.w || 2) / 2, -0.45, 0.45], h: 0.92, front: 0.8 }),
  armchair: () => ({ fp: [-0.48, 0.48, -0.45, 0.45], h: 0.92, front: 0.6 }),
  tv: () => ({ fp: [-0.6, 0.6, -0.22, 0.22], h: 1.1, front: 1.2, tall: true }),
  bookshelf: (p) => ({ fp: [-(p.w || 0.9) / 2, (p.w || 0.9) / 2, -0.16, 0.16], h: 1.9, front: 0.6, tall: true }),
  floor_lamp: () => ({ fp: [-0.15, 0.15, -0.15, 0.15], h: 1.7, front: 0, tall: true }),
  fireplace: () => ({ fp: [-0.95, 0.95, -0.45, 0.45], h: 2.8, front: 0.9, tall: true, solidOnly: true }),
  counter: (p) => ({ fp: [-(p.w || 2) / 2, (p.w || 2) / 2, -0.31, 0.33], h: 0.9, front: 0.9 }),
  stove: () => ({ fp: [-0.38, 0.38, -0.31, 0.31], h: 1.1, front: 0.9 }),
  fridge: () => ({ fp: [-0.38, 0.38, -0.33, 0.39], h: 1.75, front: 0.9, tall: true }),
  desk: () => ({ fp: [-0.65, 0.65, -0.32, 0.32], h: 0.76, front: 0.8 }),
  toilet: () => ({ fp: [-0.22, 0.22, -0.36, 0.2], h: 0.8, front: 0.5 }),
  tub: () => ({ fp: [-0.85, 0.85, -0.38, 0.38], h: 0.6, front: 0.5 }),
  bath_sink: () => ({ fp: [-0.3, 0.3, -0.27, 0.15], h: 1.85, front: 0.6, tall: true }),
  washer: () => ({ fp: [-0.3, 0.3, -0.3, 0.3], h: 0.9, front: 0.7 }),
  metal_shelf: (p) => ({ fp: [-(p.w || 1.6) / 2, (p.w || 1.6) / 2, -0.27, 0.27], h: 1.85, front: 0.7, tall: true }),
  workbench: (p) => ({ fp: [-(p.w || 1.8) / 2, (p.w || 1.8) / 2, -0.35, 0.35], h: 1.9, front: 0.9, tall: true }),
  toolchest: () => ({ fp: [-0.4, 0.4, -0.25, 0.3], h: 1.0, front: 0.7 }),
  crate: (p) => ({ fp: [-(p.s || 0.8) / 2, (p.s || 0.8) / 2, -(p.s || 0.8) / 2, (p.s || 0.8) / 2], h: p.s || 0.8, front: 0.4 }),
  drum: () => ({ fp: [-0.3, 0.3, -0.3, 0.3], h: 0.9, front: 0.3 }),
  hay_bale: () => ({ fp: [-0.45, 0.45, -0.23, 0.23], h: 0.4, front: 0 }),
  coat_rack: () => ({ fp: [-0.18, 0.18, -0.18, 0.18], h: 1.8, front: 0, tall: true }),
  piano: () => ({ fp: [-0.75, 0.75, -0.3, 0.3], h: 1.3, front: 0.8, tall: true }),
  checkout: () => ({ fp: [-1.02, 1.02, -0.37, 0.37], h: 1.35, front: 0.9 }),
  bar_counter: (p) => ({ fp: [-(p.w || 4) / 2 - 0.05, (p.w || 4) / 2 + 0.05, -0.35, 0.4], h: 1.1, front: 1.0 }),
  booth: () => ({ fp: [-0.6, 0.6, -0.3, 0.3], h: 1.1, front: 0.4 }),
  church_altar: () => ({ fp: [-0.95, 0.95, -0.4, 0.4], h: 1.5, front: 1.0 }),
  tractor: () => ({ fp: [-1.0, 1.0, -1.6, 1.1], h: 1.9, front: 0.5 }),
  pallet: () => ({ fp: [-0.6, 0.6, -0.5, 0.5], h: 1.2, front: 0.4 }),
  upper_cabinet: (p) => ({ fp: [-(p.w || 2) / 2, (p.w || 2) / 2, -0.17, 0.17], h: 2.15, front: 0, hung: true }),
  picture: (p) => ({ fp: [-(p.w || 0.6) / 2, (p.w || 0.6) / 2, 0, 0.04], h: 1.9, front: 0, hung: true }),
};

// Room programmes: ordered lists of what to place.
const PROGRAMS = {
  kitchen: [
    { t: 'counter', p: { sink: true, w: 2 }, wall: true, prefer: 'window' },
    { t: 'stove', wall: true, near: 'counter' },
    { t: 'fridge', wall: true },
    { t: 'counter', p: { w: 1.5 }, wall: true, near: 'stove' },
    { t: 'counter', p: { w: 1.0 }, wall: true, optional: true },
    { t: 'table_set', p: { w: 1.2, d: 0.8, chairs: 2 }, center: true, optional: true, minArea: 12 },
  ],
  dining: [
    { t: 'table_set', p: { w: 1.6, d: 0.9, chairs: 4 }, center: true },
    { t: 'bookshelf', p: { w: 1.2, color: '#6e4b33' }, wall: true, optional: true },
    { t: 'picture', p: { w: 0.8, h: 0.55 }, wall: true, hung: true, optional: true },
  ],
  living: [
    { t: 'couch', p: { w: 2.0 }, wall: true, prefer: 'window' },
    { t: 'tv', wall: true, facing: 'couch' },
    { t: 'armchair', wall: true, optional: true },
    { t: 'bookshelf', wall: true, optional: true },
    { t: 'floor_lamp', wall: true, corner: true, optional: true },
    { t: 'rug', center: true, decor: true, p: { w: 2.2, d: 1.5 } },
    { t: 'picture', p: { w: 0.9, h: 0.6 }, wall: true, hung: true, optional: true },
    { t: 'picture', p: { w: 0.5, h: 0.4 }, wall: true, hung: true, optional: true },
  ],
  parlor: [
    { t: 'fireplace', wall: true, solidOnly: true, optional: true },
    { t: 'couch', p: { w: 2.0 }, wall: true },
    { t: 'armchair', wall: true },
    { t: 'piano', wall: true, optional: true },
    { t: 'rug', center: true, decor: true, p: { w: 2.2, d: 1.6, color: '#7a3a2e' } },
    { t: 'picture', p: { w: 0.8, h: 0.6 }, wall: true, hung: true, optional: true },
  ],
  bedroom: [
    { t: 'bed', wall: true, solidBehind: true, prefer: 'opposite-door' },
    { t: 'nightstand', wall: true, near: 'bed', optional: true },
    { t: 'dresser', wall: true, optional: true },
    { t: 'rug', center: true, decor: true, p: { w: 1.6, d: 1.0, color: '#5a6a7a' }, optional: true },
    { t: 'picture', p: { w: 0.6, h: 0.45 }, wall: true, hung: true, optional: true },
  ],
  kidroom: [
    { t: 'bed', p: { w: 1.0, color: '#9a4a3a' }, wall: true, solidBehind: true },
    { t: 'dresser', p: { w: 0.9, color: '#c8a070' }, wall: true, optional: true },
    { t: 'desk', wall: true, optional: true },
  ],
  bath: [
    { t: 'tub', wall: true, prefer: 'opposite-door' },
    { t: 'toilet', wall: true },
    { t: 'bath_sink', wall: true },
  ],
  laundry: [
    { t: 'washer', wall: true },
    { t: 'washer', wall: true, near: 'washer' },
    { t: 'metal_shelf', p: { w: 1.2 }, wall: true, optional: true },
  ],
  hall: [
    { t: 'coat_rack', wall: true, corner: true, optional: true },
    { t: 'picture', p: { w: 0.5, h: 0.6 }, wall: true, hung: true, optional: true },
  ],
  office: [
    { t: 'desk_set', wall: true },
    { t: 'bookshelf', wall: true, optional: true },
    { t: 'metal_shelf', p: { w: 1.2, loot: 'office' }, wall: true, optional: true },
  ],
  store: [
    { t: 'checkout', wall: false, nearDoor: true },
    { t: 'store_rows', center: true },
    { t: 'metal_shelf', p: { w: 1.6, loot: 'store' }, wall: true, optional: true, repeat: 3 },
  ],
  pharmacy: [
    { t: 'checkout', nearDoor: true, p: { loot: 'meds' } },
    { t: 'store_rows', center: true, p: { loot: 'meds' } },
    { t: 'metal_shelf', p: { w: 1.6, loot: 'meds' }, wall: true, optional: true, repeat: 3 },
  ],
  hardware: [
    { t: 'checkout', nearDoor: true },
    { t: 'store_rows', center: true, p: { loot: 'hardware' } },
    { t: 'metal_shelf', p: { w: 1.6, loot: 'hardware' }, wall: true, optional: true, repeat: 4 },
  ],
  diner: [
    { t: 'bar_counter', p: { w: 3.6 }, wall: true, gap: 1.2 },
    { t: 'booth_row', wall: true },
    { t: 'table_set', p: { w: 0.9, d: 0.9, chairs: 2, color: '#d8d0c0' }, center: true, optional: true, repeat: 2 },
  ],
  bar: [
    { t: 'bar_counter', p: { w: 3.6 }, wall: true, gap: 1.2 },
    { t: 'table_set', p: { w: 0.9, d: 0.9, chairs: 2 }, center: true, repeat: 2, optional: true },
    { t: 'metal_shelf', p: { w: 1.2, loot: 'bar' }, wall: true, optional: true },
  ],
  garage: [
    { t: 'workbench', wall: true },
    { t: 'metal_shelf', wall: true },
    { t: 'toolchest', wall: true, optional: true },
    { t: 'drum', wall: true, p: { color: '#b33a2a', loot: 'fuel' }, optional: true },
    { t: 'drum', wall: true, p: { color: '#2f5a8a' }, optional: true },
  ],
  barn: [
    { t: 'tractor', center: true, optional: true },
    { t: 'workbench', wall: true, optional: true },
    { t: 'hay_stack', wall: true, optional: true, repeat: 3 },
    { t: 'crate', wall: true, optional: true, repeat: 2 },
    { t: 'drum', wall: true, p: { color: '#b33a2a', loot: 'fuel' }, optional: true },
  ],
  loft: [
    { t: 'hay_stack', wall: true, repeat: 5, optional: true },
    { t: 'crate', wall: true, optional: true },
  ],
  storage: [
    { t: 'metal_shelf', wall: true, repeat: 2, optional: true },
    { t: 'crate', wall: true, repeat: 3, optional: true },
    { t: 'pallet', p: { load: 0.9 }, center: true, optional: true },
  ],
  church: [
    { t: 'church_altar', wall: true, prefer: 'opposite-door' },
    { t: 'pew_rows', center: true },
  ],
  apartment: [
    { t: 'bed', wall: true, solidBehind: true },
    { t: 'couch', p: { w: 1.8 }, wall: true, optional: true },
    { t: 'counter', p: { sink: true, w: 1.5 }, wall: true },
    { t: 'stove', wall: true, near: 'counter' },
    { t: 'fridge', wall: true, optional: true },
    { t: 'table_set', p: { w: 1.0, d: 0.8, chairs: 2 }, center: true, optional: true },
    { t: 'dresser', wall: true, optional: true },
  ],
  empty: [],
};

export function furnishRoom(S, room, rd, rng, stairCells) {
  const prog = PROGRAMS[rd.kind];
  if (!prog || !room.cells.length) return;
  const l = room.level;
  const inRoom = new Set(room.cells.map(([x, z]) => `${x},${z}`));
  let cx0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cz1 = -Infinity;
  for (const [x, z] of room.cells) { cx0 = Math.min(cx0, x); cz0 = Math.min(cz0, z); cx1 = Math.max(cx1, x); cz1 = Math.max(cz1, z); }
  const X0 = cx0 * CELL, Z0 = cz0 * CELL;
  const nx = (cx1 - cx0 + 1) * PER, nz = (cz1 - cz0 + 1) * PER;
  const grid = new Uint8Array(nx * nz);
  const idx = (i, j) => j * nx + i;
  const gx = (x) => Math.floor((x - X0) / RES + 1e-6), gz = (z) => Math.floor((z - Z0) / RES + 1e-6);
  // free room cells
  for (const [x, z] of room.cells) {
    for (let j = 0; j < PER; j++) for (let i = 0; i < PER; i++) grid[idx((x - cx0) * PER + i, (z - cz0) * PER + j)] = FREE;
  }
  // boundary edges: block the inset strip; record wall info per boundary edge
  const edges = []; // {x,z,a, side(normal into room as dir index), wall, grid}
  for (const [x, z] of room.cells) {
    for (const [dx, dz, ex, ez, a, inDir] of [[0, -1, x, z, 0, 1], [0, 1, x, z + 1, 0, 3], [-1, 0, x, z, 1, 0], [1, 0, x + 1, z, 1, 2]]) {
      if (inRoom.has(`${x + dx},${z + dz}`)) continue;
      const w = S.walls.get(`${ex},${ez},${l},${a}`);
      edges.push({ x: ex, z: ez, a, inDir, w, g: w ? wallGridE(w, a) : null, cell: [x, z] });
      // block 0.1 strip along this edge (cell side)
      for (let t = 0; t < PER; t++) {
        let i, j;
        if (a === 0) { i = (x - cx0) * PER + t; j = (z - cz0) * PER + (dz < 0 ? 0 : PER - 1); }
        else { j = (z - cz0) * PER + t; i = (x - cx0) * PER + (dx < 0 ? 0 : PER - 1); }
        grid[idx(i, j)] = BLOCK;
      }
    }
  }
  // clearance zones: doors / openings
  const doorZones = [];
  for (const e of edges) {
    if (!e.g) {
      // no wall: open edge (e.g. porch, or open to void) — keep a strip clear
      continue;
    }
    // find passable column runs (rows 0..7 not solid/window); one zone per run
    const passCol = (k) => { for (let r = 0; r < 8; r++) if (e.g[r][k] === CELL_SOLID || e.g[r][k] === CELL_WINDOW) return false; return true; };
    let k = 0;
    while (k < SHAPE_COLS) {
      if (!passCol(k)) { k++; continue; }
      let k1 = k;
      while (k1 + 1 < SHAPE_COLS && passCol(k1 + 1)) k1++;
      const e0 = Math.max(0.1, k * SUB), e1 = Math.min(1.9, (k1 + 1) * SUB);
      zoneAlong(e, e0 - 0.1, e1 + 0.1, 0.9, CLEAR, true);
      k = k1 + 1;
    }
  }
  // stairs: block stair cells on this level and clear their landings
  for (const [k, st] of S.stairs) {
    const [sx, sz, sl] = k.split(',').map(Number);
    const D = DIRS[st.dir];
    if (sl === l) {
      for (const [cx, cz] of [[sx, sz], [sx + D[0], sz + D[1]]]) markCell(cx, cz, BLOCK);
      // bottom landing: 1.2 m in front of the first step
      const bx = sx - D[0], bz = sz - D[1];
      markCellPart(bx, bz, st.dir, 1.2, CLEAR, true);
    }
    if (sl + 1 === l) {
      const tx = sx + 2 * D[0], tz = sz + 2 * D[1];
      markCellPart(tx, tz, (st.dir + 2) % 4, 1.2, CLEAR, true);
    }
  }
  function markCell(cx, cz, v) {
    if (!inRoom.has(`${cx},${cz}`)) return;
    for (let j = 0; j < PER; j++) for (let i = 0; i < PER; i++) grid[idx((cx - cx0) * PER + i, (cz - cz0) * PER + j)] = v;
  }
  // mark part of a cell adjacent to its edge facing direction `dir` (the side toward dir), depth metres
  function markCellPart(cx, cz, dir, depth, v, zone) {
    if (!inRoom.has(`${cx},${cz}`)) return;
    const n = Math.round(depth / RES);
    const pts = [];
    for (let j = 0; j < PER; j++) for (let i = 0; i < PER; i++) {
      let inside = false;
      if (dir === 0) inside = i >= PER - n; else if (dir === 2) inside = i < n;
      else if (dir === 1) inside = j >= PER - n; else inside = j < n;
      if (!inside) continue;
      const id = idx((cx - cx0) * PER + i, (cz - cz0) * PER + j);
      if (grid[id] === FREE) grid[id] = v;
      pts.push(id);
    }
    if (zone) doorZones.push(pts);
  }
  function zoneAlong(e, e0, e1, depth, v, zone) {
    const pts = [];
    const n = Math.round(depth / RES);
    for (let t = Math.floor(e0 / RES); t < Math.ceil(e1 / RES); t++) {
      for (let s = 0; s < n; s++) {
        let x, z;
        const along = (t + 0.5) * RES;
        const off = (s + 0.5) * RES;
        if (e.a === 0) { x = e.x * CELL + along; z = e.z * CELL + (e.inDir === 1 ? off : -off); }
        else { z = e.z * CELL + along; x = e.x * CELL + (e.inDir === 0 ? off : -off); }
        const i = gx(x), j = gz(z);
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const id = idx(i, j);
        if (grid[id] === FREE) grid[id] = v;
        if (grid[id] !== BLOCK) pts.push(id);
      }
    }
    if (zone && pts.length) doorZones.push(pts);
  }

  // ---------- placement helpers ----------
  const placed = [];
  // world-ish rect of a footprint for an item placed at (px,pz) with rot r
  const rectOf = (fp, px, pz, r) => {
    const [x0, x1, z0, z1] = fp;
    const pts = [[x0, z0], [x1, z1]].map(([x, z]) => {
      const c = [1, 0, -1, 0][r], s = [0, 1, 0, -1][r];
      return [px + x * c + z * s, pz - x * s + z * c];
    });
    return [Math.min(pts[0][0], pts[1][0]), Math.max(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][1], pts[1][1])];
  };
  const rectFree = (rx0, rx1, rz0, rz1, allowClear = false) => {
    // small tolerance so 0.1 m cell rounding does not reject snug fits
    const i0 = gx(rx0 + 0.035), i1 = gx(rx1 - 0.035), j0 = gz(rz0 + 0.035), j1 = gz(rz1 - 0.035);
    if (i0 < 0 || j0 < 0 || i1 >= nx || j1 >= nz) return false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = grid[idx(i, j)];
      if (v === FREE) continue;
      if (allowClear && v === CLEAR) continue;
      return false;
    }
    return true;
  };
  const fillRect = (rx0, rx1, rz0, rz1, v, onlyFree = false) => {
    const i0 = Math.max(0, gx(rx0 + 0.035)), i1 = Math.min(nx - 1, gx(rx1 - 0.035)), j0 = Math.max(0, gz(rz0 + 0.035)), j1 = Math.min(nz - 1, gz(rz1 - 0.035));
    const prev = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const id = idx(i, j);
      if (onlyFree && grid[id] !== FREE) continue;
      prev.push([id, grid[id]]);
      grid[id] = v;
    }
    return prev;
  };
  const restore = (prev) => { for (let i = prev.length - 1; i >= 0; i--) grid[prev[i][0]] = prev[i][1]; };

  // walkable connectivity between door zones with ~0.3 m clearance
  function connected() {
    if (doorZones.length < 2) return true;
    const blocked = new Uint8Array(nx * nz);
    for (let i = 0; i < nx * nz; i++) blocked[i] = grid[i] === BLOCK || grid[i] === OCC ? 1 : 0;
    // dilate by 3 cells (separable)
    const R = 3;
    const tmp = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let b = 0;
      for (let d = -R; d <= R && !b; d++) { const ii = i + d; if (ii >= 0 && ii < nx && blocked[idx(ii, j)]) b = 1; }
      tmp[idx(i, j)] = b;
    }
    const dil = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let b = 0;
      for (let d = -R; d <= R && !b; d++) { const jj = j + d; if (jj >= 0 && jj < nz && tmp[idx(i, jj)]) b = 1; }
      dil[idx(i, j)] = b;
    }
    const seeds = doorZones.map((z) => z.filter((id) => !dil[id]));
    if (globalThis.__CONN_DEBUG) {
      globalThis.__CONN_DEBUG = false;
      let out = '';
      const zmark = new Uint8Array(nx * nz);
      doorZones.forEach((zz, zi) => zz.forEach((id) => { zmark[id] = zi + 1; }));
      for (let j = 0; j < nz; j += 2) { let row = ''; for (let i = 0; i < nx; i += 2) { const id = idx(i, j); row += dil[id] ? (grid[id] === OCC ? 'O' : '#') : zmark[id] ? String.fromCharCode(64 + zmark[id]) : '.'; } out += row + '\n'; }
      console.log('conn ' + rd.kind + ' zones=' + doorZones.length + ' seedsEmpty=' + seeds.map((s) => s.length).join(',') + '\n' + out);
    }
    if (seeds.some((s) => !s.length)) return false;
    const seen = new Uint8Array(nx * nz);
    const q = [...seeds[0]];
    for (const s of q) seen[s] = 1;
    while (q.length) {
      const id = q.pop();
      const i = id % nx, j = (id / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = idx(ii, jj);
        if (seen[n] || dil[n]) continue;
        seen[n] = 1; q.push(n);
      }
    }
    return seeds.every((s) => s.some((id) => seen[id]));
  }

  // wall placements: candidate positions along every boundary edge with a wall
  function wallCandidates(spec, opts = {}) {
    const res = [];
    for (const e of edges) {
      if (!e.w) continue;
      if (e.w.shape === 'railing' && (spec.tall || opts.solidBehind)) continue;
      const r = { 1: 0, 3: 2, 0: 1, 2: 3 }[e.inDir]; // facing into the room
      // the item's back lies 0.1 inside the edge line
      for (let t = 0; t <= 20; t++) {
        const along = e.a === 0 ? e.x * CELL + t * RES : e.z * CELL + t * RES;
        let px, pz;
        const back = -spec.fp[2]; // distance from origin to back
        if (e.a === 0) { px = along; pz = e.z * CELL + (e.inDir === 1 ? 0.1 + back : -0.1 - back); }
        else { pz = along; px = e.x * CELL + (e.inDir === 0 ? 0.1 + back : -0.1 - back); }
        res.push({ px, pz, r, e });
      }
    }
    return res;
  }
  // does the wall behind an item (along its back) satisfy window/solid constraints?
  function wallOk(rect, cand, spec, opts) {
    // collect all boundary edges collinear with cand.e and on the same side; check columns covered
    const e = cand.e;
    const lo = e.a === 0 ? rect[0] : rect[2], hi = e.a === 0 ? rect[1] : rect[3];
    for (const f of edges) {
      if (f.a !== e.a || f.inDir !== e.inDir) continue;
      if ((e.a === 0 ? f.z !== e.z : f.x !== e.x)) continue;
      const fs = e.a === 0 ? f.x * CELL : f.z * CELL;
      if (fs + CELL <= lo + 1e-6 || fs >= hi - 1e-6) continue;
      if (!f.w) return false; // no wall behind
      if (f.w.shape === 'railing' && (spec.tall || opts.solidBehind)) return false;
      for (let k = 0; k < SHAPE_COLS; k++) {
        const c0 = fs + k * SUB, c1 = c0 + SUB;
        if (c1 <= lo + 1e-6 || c0 >= hi - 1e-6) continue;
        for (let row = 0; row < SHAPE_ROWS; row++) {
          const ch = f.g[row][k];
          const y0 = row * SUB;
          if (ch === CELL_SOLID) continue;
          if (ch === CELL_WINDOW) {
            if (spec.tall || opts.solidBehind || spec.solidOnly) { if (y0 < spec.h) return false; }
            else if (y0 < spec.h - 0.02) return false;
            continue;
          }
          // door/open behind: never back onto it
          if (y0 < spec.h) return false;
        }
      }
    }
    return true;
  }
  const doorCenters = edges.filter((e) => e.g && e.g.some((row, ri) => ri < 8 && row.some((c) => c !== CELL_SOLID && c !== CELL_WINDOW)))
    .map((e) => e.a === 0 ? [e.x * CELL + 1, e.z * CELL] : [e.x * CELL, e.z * CELL + 1]);

  function tryPlace(type, params, opts) {
    const spec = ITEMS[type](params || {});
    const cands = opts.center ? centerCandidates(spec) : wallCandidates(spec, opts);
    // score candidates
    const scored = cands.map((c) => {
      let s = rng() * 0.5;
      if (opts.prefer === 'opposite-door' && doorCenters.length) {
        const d = Math.min(...doorCenters.map(([x, z]) => Math.hypot(x - c.px, z - c.pz)));
        s += d;
      }
      if (opts.prefer === 'window' && c.e && c.e.g && c.e.g.some((row) => row.includes(CELL_WINDOW))) s += 2;
      if (opts.near) {
        const ref = placed.filter((p) => p.type === opts.near);
        if (ref.length) s -= Math.min(...ref.map((p) => Math.hypot(p.x - c.px, p.z - c.pz))) * 0.8;
      }
      if (opts.facing) {
        const ref = placed.find((p) => p.type === opts.facing);
        if (ref) {
          // prefer rotation opposite to the reference item's rotation
          if (((ref.rot + 2) % 4) === c.r) s += 3;
          s += Math.hypot(ref.x - c.px, ref.z - c.pz) * 0.2;
        }
      }
      if (opts.corner && c.e) {
        // prefer near the ends of the room's bounding box
        const cxm = (cx0 + cx1 + 1) * CELL / 2, czm = (cz0 + cz1 + 1) * CELL / 2;
        s += Math.hypot(c.px - cxm, c.pz - czm) * 0.6;
      }
      if (opts.center) {
        const cxm = (cx0 + cx1 + 1) * CELL / 2, czm = (cz0 + cz1 + 1) * CELL / 2;
        s -= Math.hypot(c.px - cxm, c.pz - czm) * 2;
      }
      if (opts.nearDoor && doorCenters.length) s -= Math.min(...doorCenters.map(([x, z]) => Math.hypot(x - c.px, z - c.pz))) * 1.5;
      return { c, s };
    }).sort((a, b) => b.s - a.s);
    const why = { free: 0, wall: 0, front: 0, conn: 0 };
    const dbg = globalThis.__FURNISH_DEBUG;
    for (const { c } of scored) {
      const rect = rectOf(spec.fp, c.px, c.pz, c.r);
      if (spec.hung) {
        if (!wallOk(rect, c, { ...spec, h: 2.2, tall: true }, opts)) continue;
        // keep hung items from overlapping each other
        if (placed.some((p) => p.hung && overlap(p.rect, rect, 0.2))) continue;
        if (type === 'picture' && placed.some((p) => !p.hung && p.spec.h > 1.35 && overlap(p.rect, rectOf([spec.fp[0], spec.fp[1], 0, 0.6], c.px, c.pz, c.r), 0))) continue;
        const prop = S.addProp(type, c.px, l * 3, c.pz, c.r, params || {});
        placed.push({ type, x: c.px, z: c.pz, rot: c.r, rect, hung: true, spec, prop });
        return prop;
      }
      if (!rectFree(...rect)) {
        why.free++;
        if (dbg === 'cand:' + type) {
          const i0 = gx(rect[0] + 0.001), i1 = gx(rect[1] - 0.001), j0 = gz(rect[2] + 0.001), j1 = gz(rect[3] - 0.001);
          const bad = [];
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = (i < 0 || j < 0 || i >= nx || j >= nz) ? -1 : grid[idx(i, j)]; if (v !== FREE) bad.push(i + ',' + j + ':' + v); }
          console.log('cand', c.px.toFixed(2), c.pz.toFixed(2), c.r, rect.map((v) => v.toFixed(2)).join(' '), bad.slice(0, 4).join(' '), bad.length);
        }
        continue;
      }
      if (!opts.center && !wallOk(rect, c, spec, opts)) { why.wall++; continue; }
      let fr = null;
      if (spec.front > 0) {
        fr = rectOf([spec.fp[0], spec.fp[1], spec.fp[3], spec.fp[3] + spec.front], c.px, c.pz, c.r);
        // front clearance must not already be furniture or wall
        if (!rectFreeLoose(fr)) { why.front++; continue; }
      }
      const prev = fillRect(...rect, OCC);
      const prevFront = fr ? fillRect(...fr, CLEAR, true) : [];
      if (!connected()) { restore(prevFront); restore(prev); why.conn++; continue; }
      const prop = S.addProp(type, c.px, l * 3, c.pz, c.r, params || {});
      placed.push({ type, x: c.px, z: c.pz, rot: c.r, rect, spec, prop });
      return prop;
    }
    if (dbg) console.log('furnish fail', S.name, rd.kind, type, JSON.stringify(why), scored.length);
    return null;
  }
  function rectFreeLoose(r) {
    const i0 = Math.max(0, gx(r[0] + 0.001)), i1 = Math.min(nx - 1, gx(r[1] - 0.001)), j0 = Math.max(0, gz(r[2] + 0.001)), j1 = Math.min(nz - 1, gz(r[3] - 0.001));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (grid[idx(i, j)] === OCC) return false;
    return true;
  }
  function centerCandidates(spec) {
    const res = [];
    for (const [x, z] of room.cells) {
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        for (const r of [0, 1]) res.push({ px: x * CELL + 0.25 + a * 0.5, pz: z * CELL + 0.25 + b * 0.5, r });
      }
      for (const r of [0, 1]) res.push({ px: x * CELL + 1, pz: z * CELL + 1, r }, { px: x * CELL + 2, pz: z * CELL + 1, r }, { px: x * CELL + 1, pz: z * CELL + 2, r }, { px: x * CELL + 2, pz: z * CELL + 2, r });
    }
    return res;
  }

  // composite placements
  function tableSet(p, opts) {
    const w = p.w || 1.6, d = p.d || 0.9, n = p.chairs || 4;
    const spec = { fp: [-w / 2 - 0.55, w / 2 + 0.55, -d / 2 - 0.55, d / 2 + 0.55], h: 0.95, front: 0 };
    ITEMS.__tmp = () => spec;
    const ok = tryPlace('__tmp', {}, { ...opts, center: true });
    delete ITEMS.__tmp;
    if (!ok) return null;
    // replace the temp prop with the table & chairs
    S.props.splice(S.props.indexOf(ok), 1);
    const r = ok.rot;
    const cx = ok.x, cz = ok.z;
    const loc = (x, z) => { const c = [1, 0, -1, 0][r], s = [0, 1, 0, -1][r]; return [cx + x * c + z * s, cz - x * s + z * c]; };
    S.addProp('table', cx, l * 3, cz, r, { w, d, color: p.color });
    const chairs = [];
    if (n >= 2) { chairs.push([0, -d / 2 - 0.3, 0], [0, d / 2 + 0.3, 2]); }
    if (n >= 4) { chairs.push([-w / 2 - 0.3, 0, 1], [w / 2 + 0.3, 0, 3]); }
    if (n === 4 && w >= 1.5) { chairs.length = 0; chairs.push([-w / 4, -d / 2 - 0.3, 0], [w / 4, -d / 2 - 0.3, 0], [-w / 4, d / 2 + 0.3, 2], [w / 4, d / 2 + 0.3, 2]); }
    for (const [x, z, cr] of chairs) {
      const [px, pz] = loc(x, z);
      S.addProp('chair', px, l * 3, pz, (cr + r) % 4, { color: p.color });
    }
    return true;
  }
  function deskSet() {
    const prop = tryPlace('desk', {}, { wall: true });
    if (!prop) return;
    const r = prop.rot;
    const c = [1, 0, -1, 0][r], s = [0, 1, 0, -1][r];
    const x = 0.2, z = 0.55;
    S.addProp('chair', prop.x + x * c + z * s, l * 3, prop.z - x * s + z * c, (r + 2) % 4, {});
  }
  function storeRows(p) {
    // parallel double-sided shelves with 1.4 m aisles
    const w = (cx1 - cx0 + 1) * CELL, d = (cz1 - cz0 + 1) * CELL;
    const alongX = w >= d;
    const len = (alongX ? w : d) - 3.4;
    if (len < 1.5) return;
    const across = alongX ? d : w;
    const count = Math.max(1, Math.floor((across - 2.2) / 2.4));
    for (let i = 0; i < count; i++) {
      const off = -((count - 1) * 2.4) / 2 + i * 2.4;
      const cxm = (cx0 + cx1 + 1) * CELL / 2, czm = (cz0 + cz1 + 1) * CELL / 2;
      const segs = Math.max(1, Math.round(len / 1.8));
      const segW = Math.min(1.8, len / segs);
      for (let s = 0; s < segs; s++) {
        const a = -((segs - 1) * segW) / 2 + s * segW;
        const px = alongX ? cxm + a : cxm + off, pz = alongX ? czm + off : czm + a;
        const spec = { fp: [-segW / 2, segW / 2, -0.45, 0.45], h: 1.6, front: 0 };
        const rect = rectOf(spec.fp, px, pz, alongX ? 0 : 1);
        if (!rectFree(...rect)) continue;
        const prev = fillRect(...rect, OCC);
        if (!connected()) { restore(prev); continue; }
        S.addProp('store_shelf', px, l * 3, pz, alongX ? 0 : 1, { w: segW - 0.02, loot: p && p.loot });
      }
    }
  }
  function pewRows() {
    const w = (cx1 - cx0 + 1) * CELL, d = (cz1 - cz0 + 1) * CELL;
    const alongZ = d >= w;
    const cxm = (cx0 + cx1 + 1) * CELL / 2, czm = (cz0 + cz1 + 1) * CELL / 2;
    const rows = Math.floor(((alongZ ? d : w) - 4.5) / 1.1);
    const pw = Math.min(3, ((alongZ ? w : d) - 1.6) / 2 - 0.4);
    for (let i = 0; i < rows; i++) {
      for (const side of [-1, 1]) {
        const a = -((rows - 1) * 1.1) / 2 + i * 1.1 + 0.8;
        const b = side * (pw / 2 + 0.6);
        const px = alongZ ? cxm + b : cxm + a, pz = alongZ ? czm + a : czm + b;
        const altar = placed.find((p) => p.type === 'church_altar');
        // pews face the altar
        let r = 0;
        if (altar) {
          if (alongZ) r = altar.z < czm ? 2 : 0; else r = altar.x < cxm ? 3 : 1;
        }
        const spec = { fp: [-pw / 2, pw / 2, -0.3, 0.3], h: 1, front: 0 };
        const rect = rectOf(spec.fp, px, pz, r);
        if (!rectFree(...rect)) continue;
        const prev = fillRect(...rect, OCC);
        if (!connected()) { restore(prev); continue; }
        S.addProp('pew', px, l * 3, pz, r, { w: pw });
      }
    }
  }

  if (globalThis.__FURNISH_DEBUG === rd.kind) {
    let out = '';
    for (let j = 0; j < nz; j += 2) { let row = ''; for (let i = 0; i < nx; i += 2) row += '#.OC'[grid[idx(i, j)]]; out += row + '\n'; }
    console.log('grid ' + rd.kind + '\n' + out);
  }
  for (const item of prog) {
    const reps = item.repeat || 1;
    for (let rep = 0; rep < reps; rep++) {
      if (item.minArea && room.cells.length * 4 < item.minArea) continue;
      if (item.t === 'table_set') { tableSet(item.p || {}, item); continue; }
      if (item.t === 'desk_set') { deskSet(); continue; }
      if (item.t === 'store_rows') { storeRows(item.p); continue; }
      if (item.t === 'pew_rows') { pewRows(); continue; }
      if (item.t === 'booth_row') {
        for (let i = 0; i < 3; i++) tryPlace('booth', { color: '#a3322a' }, { wall: true });
        continue;
      }
      if (item.t === 'hay_stack') {
        const p = tryPlace('hay_bale', {}, { wall: true });
        if (p) {
          S.addProp('hay_bale', p.x, l * 3 + 0.4, p.z, p.rot, {});
          if (rng() < 0.6) S.addProp('hay_bale', p.x, l * 3 + 0.8, p.z, p.rot, {});
        }
        continue;
      }
      if (item.decor) {
        if (item.t === 'rug') {
          const cxm = (cx0 + cx1 + 1) * CELL / 2, czm = (cz0 + cz1 + 1) * CELL / 2;
          const p = item.p || {};
          const w = Math.min(p.w || 2, (cx1 - cx0 + 1) * CELL - 1), d = Math.min(p.d || 1.4, (cz1 - cz0 + 1) * CELL - 1);
          // only if the whole rug lies inside room cells
          const inside = [[cxm - w / 2, czm - d / 2], [cxm + w / 2, czm + d / 2], [cxm - w / 2, czm + d / 2], [cxm + w / 2, czm - d / 2]]
            .every(([x, z]) => inRoom.has(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`));
          if (inside && w > 0.8 && d > 0.6) S.addProp('rug', cxm, l * 3, czm, 0, { ...p, w, d });
        }
        continue;
      }
      const p = item.p ? { ...item.p } : {};
      tryPlace(item.t, p, item);
      if (item.t === 'counter' && placed.length) {
        const last = placed[placed.length - 1];
        if (last.type === 'counter' && !last.upper) {
          last.upper = true;
          // upper cabinets only where the wall is solid up high
          const spec = ITEMS.upper_cabinet({ w: p.w || 2 });
          const back = -spec.fp[2];
          const c = [1, 0, -1, 0][last.rot], s = [0, 1, 0, -1][last.rot];
          const dz = -0.31 + back; // shift from counter origin to cabinet origin (both backs on wall)
          const ux = last.x + dz * s, uz = last.z + dz * c;
          const rect = rectOf(spec.fp, ux, uz, last.rot);
          const e = edges.find((ed) => ed.w && ({ 1: 0, 3: 2, 0: 1, 2: 3 }[ed.inDir]) === last.rot);
          if (e && wallOk(rect, { e }, { ...spec, h: 2.2, tall: true }, {}) && !p.sink) S.addProp('upper_cabinet', ux, l * 3, uz, last.rot, { w: p.w || 2 });
        }
      }
      if (item.t === 'bed' && placed.length) {
        const bed = placed[placed.length - 1];
        if (bed.type === 'bed') {
          // nightstands either side of the headboard
          const w = (bed.prop.w || 1.5);
          const c = [1, 0, -1, 0][bed.rot], s = [0, 1, 0, -1][bed.rot];
          for (const side of [-1, 1]) {
            const x = side * (w / 2 + 0.3), z = -1.08 + 0.2;
            const px = bed.x + x * c + z * s, pz = bed.z - x * s + z * c;
            const spec = ITEMS.nightstand();
            const rect = rectOf(spec.fp, px, pz, bed.rot);
            if (!rectFree(...rect)) continue;
            const prev = fillRect(...rect, OCC);
            if (!connected()) { restore(prev); continue; }
            S.addProp('nightstand', px, l * 3, pz, bed.rot, {});
            if (rng() < 0.5) break;
          }
        }
      }
    }
  }
  // ceiling light in the middle of the room's largest cell group
  if (rd.kind !== 'barn' && rd.kind !== 'loft') {
    const cxm = room.cells.reduce((a, c) => a + c[0], 0) / room.cells.length;
    const czm = room.cells.reduce((a, c) => a + c[1], 0) / room.cells.length;
    let best = null, bd = Infinity;
    for (const c of room.cells) {
      if (stairCells && stairCells.has(`${c[0]},${c[1]},${l}`)) continue;
      const d = Math.hypot(c[0] - cxm, c[1] - czm);
      if (d < bd) { bd = d; best = c; }
    }
    if (best)
      S.addProp('ceiling_light', best[0] * CELL + 1, l * 3, best[1] * CELL + 1, 0, {});
  }
}

function overlap(a, b, m) {
  return a[0] < b[1] + m && a[1] > b[0] - m && a[2] < b[3] + m && a[3] > b[2] - m;
}
