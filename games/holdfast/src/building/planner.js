// Floor-plan builder. A building is described as ASCII room maps per level;
// the planner places floors, exterior and partition walls (facing the right
// way), doors between connected rooms, windows, stairs, roofs and furniture.
//
// Plan legend (per level, rows = z from north to south, columns = x west->east):
//   '.'  no floor (outside / open to below)
//   a-z  a room (cells with the same letter form one room)
//   A-Z  the same room as the lowercase letter but without floor (stairwell void)
import { Structure } from './structure.js';
import { DIRS, CELL, STORY, SHAPE_ROWS, shapeGrid, CELL_SOLID } from './defs.js';
import { mulberry32, hashStr } from '../util.js';
import { furnishRoom } from './furnish.js';

export function buildFromPlan(spec) {
  const S = new Structure({ name: spec.name, kind: spec.kind || 'house' });
  const L = spec.levels.length;
  const rng = mulberry32(hashStr(spec.name + (spec.seed || '')));
  const cellRoom = (l, x, z) => {
    const lv = spec.levels[l];
    if (!lv || z < 0 || z >= lv.length || x < 0 || x >= lv[z].length) return null;
    const ch = lv[z][x];
    return ch === '.' || ch === ' ' ? null : ch;
  };
  const roomId = (ch) => (ch ? ch.toLowerCase() : null);
  const isVoid = (ch) => ch && ch !== ch.toLowerCase();
  const roomDef = (id) => spec.rooms[id] || {};

  // ---- floors ----
  for (let l = 0; l < L; l++) {
    const lv = spec.levels[l];
    for (let z = 0; z < lv.length; z++) for (let x = 0; x < lv[z].length; x++) {
      const ch = cellRoom(l, x, z);
      if (!ch || isVoid(ch)) continue;
      const rd = roomDef(roomId(ch));
      S.setFloor(x, z, l, rd.floor || spec.floor || 'wood', spec.found || 'concrete');
    }
  }

  // ---- edges: decide wall type for every edge between differing cells ----
  const doorEdges = new Map(); // edge key -> shape
  const exteriorDoorEdges = new Map();
  const edgeKeyOf = (x, z, side) => {
    // side: 'n' (−Z), 's' (+Z), 'w' (−X), 'e' (+X) of cell (x,z)
    if (side === 'n') return [x, z, 0];
    if (side === 's') return [x, z + 1, 0];
    if (side === 'w') return [x, z, 1];
    return [x + 1, z, 1];
  };
  // shared edges between two rooms on a level
  function sharedEdges(l, ra, rb) {
    const res = [];
    const lv = spec.levels[l];
    for (let z = 0; z < lv.length; z++) for (let x = 0; x < lv[z].length; x++) {
      const a = cellRoom(l, x, z);
      if (roomId(a) !== ra || isVoid(a)) continue;
      for (const [side, dx, dz] of [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]]) {
        const b = cellRoom(l, x + dx, z + dz);
        if (roomId(b) === rb && !isVoid(b)) res.push({ x, z, side, key: edgeKeyOf(x, z, side) });
      }
    }
    return res;
  }
  const stairCellSet = new Set();
  for (const st of spec.stairs || []) {
    const D = DIRS[st.dir];
    stairCellSet.add(`${st.x},${st.z},${st.level}`);
    stairCellSet.add(`${st.x + D[0]},${st.z + D[1]},${st.level}`);
  }
  for (const d of spec.doors || []) {
    const [l, ra, rb, shape, pref] = d;
    const edges = sharedEdges(l, ra, rb).filter((e) => {
      const D = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[e.side];
      return !stairCellSet.has(`${e.x},${e.z},${l}`) && !stairCellSet.has(`${e.x + D[0]},${e.z + D[1]},${l}`);
    });
    if (!edges.length) throw new Error(`${spec.name}: rooms ${ra}/${rb} not adjacent on level ${l}`);
    let e = edges[Math.floor(edges.length / 2)];
    if (typeof pref === 'number') e = edges[Math.min(pref, edges.length - 1)];
    doorEdges.set(`${e.key[0]},${e.key[1]},${l},${e.key[2]}`, shape || 'door');
  }
  for (const ex of spec.exits || []) {
    const k = edgeKeyOf(ex.x, ex.z, ex.side);
    exteriorDoorEdges.set(`${k[0]},${k[1]},${ex.level || 0},${k[2]}`, ex.shape || 'door');
  }

  const stairTop = new Set(); // edges at the top of stairs (keep open)
  const stairCells = new Set();
  for (const st of spec.stairs || []) {
    S.setStair(st.x, st.z, st.level, st.dir, st.color);
    const D = DIRS[st.dir];
    stairCells.add(`${st.x},${st.z},${st.level}`);
    stairCells.add(`${st.x + D[0]},${st.z + D[1]},${st.level}`);
    // top edge: far edge of the second cell, at level+1
    const cx = st.x + D[0], cz = st.z + D[1];
    const side = ['e', 's', 'w', 'n'][st.dir];
    const k = edgeKeyOf(cx, cz, side);
    stairTop.add(`${k[0]},${k[1]},${st.level + 1},${k[2]}`);
  }

  const extStyle = spec.ext || 'white_siding';
  for (let l = 0; l < L; l++) {
    const lv = spec.levels[l];
    const W = Math.max(...lv.map((r) => r.length)), D = lv.length;
    for (let z = -1; z <= D; z++) for (let x = -1; x <= W; x++) {
      for (const a of [0, 1]) {
        // edge a=0 at (x,z): between cell (x,z-1) [north] and (x,z) [south]
        // edge a=1 at (x,z): between cell (x-1,z) [west] and (x,z) [east]
        const c1 = a === 0 ? cellRoom(l, x, z - 1) : cellRoom(l, x - 1, z);
        const c2 = cellRoom(l, x, z);
        if (!c1 && !c2) continue;
        const r1 = roomId(c1), r2 = roomId(c2);
        const v1 = isVoid(c1), v2 = isVoid(c2);
        const ek = `${x},${z},${l},${a}`;
        if (r1 === r2) {
          // same room: railing between floor and void (except at the stair top)
          if (v1 !== v2 && !stairTop.has(ek)) {
            const rd = roomDef(r1);
            S.setWall(x, z, l, a, 'railing', rd.wall || spec.int || 'interior', false);
          }
          continue;
        }
        if (!c1 || !c2) {
          // exterior: outward side is where the null cell is
          const outsideIsNeg = !c1; // null on north/west side -> side A faces -axis -> flip=false
          const flip = !outsideIsNeg;
          const inside = c1 || c2;
          const rd = roomDef(roomId(inside));
          let shape = exteriorDoorEdges.get(ek) || null;
          if (!shape) shape = exteriorShape(spec, rd, x, z, l, a, rng);
          // interior finish follows the room
          const style = rd.wallStyleExt ? rd.wallStyleExt : extStyleFor(spec, extStyle, rd);
          S.setWall(x, z, l, a, shape, style, flip);
          continue;
        }
        // partition between two rooms
        const shape = doorEdges.get(ek) || 'solid';
        const rdA = roomDef(r1), rdB = roomDef(r2);
        // style: side A faces north/west room (flip=false), side B faces the other room
        const style = partitionStyle(rdA, rdB, spec);
        S.setWall(x, z, l, a, shape, style, false);
      }
    }
  }

  // ---- roof ----
  if (spec.roof) addRoof(S, spec, L);
  if (spec.roofs) for (const r of spec.roofs) gableRoof(S, r);

  // ---- furniture ----
  const rooms = collectRooms(spec);
  for (const room of rooms) {
    const rd = roomDef(room.id);
    if (rd.kind) furnishRoom(S, room, rd, rng, stairCells);
  }
  S.plan = spec;
  return S;
}

function extStyleFor(spec, extStyle, rd) {
  // exterior walls take the building's exterior finish; the inside face uses the room's wall finish
  return rd.ext || extStyle;
}
function partitionStyle(rdA, rdB, spec) {
  return rdA.wall || rdB.wall || spec.int || 'interior';
}
function exteriorShape(spec, rd, x, z, l, a, rng) {
  const ov = spec.windowAt && spec.windowAt(x, z, l, a, rd);
  if (ov) return ov;
  if (rd.windows === false) return 'solid';
  const w = rd.window || spec.window || 'window';
  // leave some panels solid for rhythm on long walls
  if (spec.windowEvery && ((a === 0 ? x : z) % spec.windowEvery) !== (spec.windowPhase || 0)) return 'solid';
  return w;
}

function collectRooms(spec) {
  const rooms = new Map();
  spec.levels.forEach((lv, l) => {
    for (let z = 0; z < lv.length; z++) for (let x = 0; x < lv[z].length; x++) {
      const ch = lv[z][x];
      if (ch === '.' || ch === ' ') continue;
      const id = ch.toLowerCase();
      const key = l + ':' + id;
      if (!rooms.has(key)) rooms.set(key, { id, level: l, cells: [], voids: [] });
      if (ch === id) rooms.get(key).cells.push([x, z]); else rooms.get(key).voids.push([x, z]);
    }
  });
  return [...rooms.values()];
}

function addRoof(S, spec, L) {
  const r = spec.roof;
  const top = spec.levels[L - 1];
  const D = top.length, W = Math.max(...top.map((row) => row.length));
  const has = (x, z) => z >= 0 && z < D && x >= 0 && x < top[z].length && top[z][x] !== '.' && top[z][x] !== ' ';
  if (r.type === 'flat') {
    // a roof slab over every cell that has nothing above it (handles mixed heights)
    const cellAt = (l, x, z) => { const lv = spec.levels[l]; if (!lv || z < 0 || z >= lv.length || x < 0 || x >= lv[z].length) return false; const c = lv[z][x]; return c !== '.' && c !== ' '; };
    for (let l = 0; l < L; l++) {
      const lv = spec.levels[l];
      const Wl = Math.max(...lv.map((row) => row.length));
      const roofAt = (x, z) => cellAt(l, x, z) && !cellAt(l + 1, x, z);
      for (let z = 0; z < lv.length; z++) for (let x = 0; x < Wl; x++) if (roofAt(x, z)) S.setFloor(x, z, l + 1, 'tar', spec.found);
      for (let z = -1; z <= lv.length; z++) for (let x = -1; x <= Wl; x++) {
        for (const a of [0, 1]) {
          const c1 = a === 0 ? roofAt(x, z - 1) : roofAt(x - 1, z);
          const c2 = roofAt(x, z);
          if (c1 === c2) continue;
          // skip where a taller part's wall already stands on this edge
          if (S.walls.has(`${x},${z},${l + 1},${a}`)) continue;
          const other = c1 ? (a === 0 ? [x, z] : [x, z]) : (a === 0 ? [x, z - 1] : [x - 1, z]);
          if (cellAt(l + 1, other[0], other[1])) continue;
          const style = (spec.parapetStyleAt && spec.parapetStyleAt(x, z, a)) || r.parapetStyle || spec.ext;
          S.setWall(x, z, l + 1, a, r.parapet || 'half_wall', style, c1);
        }
      }
    }
    return;
  }
  // gable: ridge along axis; footprint assumed rectangular (bounding box of top level)
  let x0 = Infinity, x1 = -1, z0 = Infinity, z1 = -1;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (has(x, z)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const pitch = r.pitch || 1.5;
  const pitches = r.pitches; // optional per-cell pitch from eave inward (gambrel)
  const style = r.style || 'black_shingle';
  // attic floor
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) S.setFloor(x, z, L, r.atticFloor || 'attic', spec.found);
  if (r.axis === 'x') {
    const depth = z1 - z0 + 1;
    const half = depth / 2;
    if (depth % 2) throw new Error(spec.name + ': gable depth must be even');
    for (let x = x0; x <= x1; x++) for (let i = 0; i < half; i++) {
      const p = pitches ? pitches[i] : pitch;
      S.setRoof(x, z0 + i, L, 3, p, style);          // north slope, downhill -Z
      S.setRoof(x, z1 - i, L, 1, p, style);          // south slope, downhill +Z
    }
  } else {
    const width = x1 - x0 + 1;
    const half = width / 2;
    if (width % 2) throw new Error(spec.name + ': gable width must be even');
    for (let z = z0; z <= z1; z++) for (let i = 0; i < half; i++) {
      const p = pitches ? pitches[i] : pitch;
      S.setRoof(x0 + i, z, L, 2, p, style);
      S.setRoof(x1 - i, z, L, 0, p, style);
    }
  }
}

// Gable roof over a rectangle of cells at a level. r = {x0,z0,x1,z1,level,axis,pitch|pitches,style,attic}
export function gableRoof(S, r) {
  const style = r.style || 'black_shingle';
  if (r.attic) for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) S.setFloor(x, z, r.level, r.attic === true ? 'attic' : r.attic, 'concrete');
  if (r.axis === 'x') {
    const depth = r.z1 - r.z0 + 1, half = depth / 2;
    for (let x = r.x0; x <= r.x1; x++) for (let i = 0; i < half; i++) {
      const p = r.pitches ? r.pitches[i] : r.pitch;
      S.setRoof(x, r.z0 + i, r.level, 3, p, style);
      S.setRoof(x, r.z1 - i, r.level, 1, p, style);
    }
  } else {
    const width = r.x1 - r.x0 + 1, half = width / 2;
    for (let z = r.z0; z <= r.z1; z++) for (let i = 0; i < half; i++) {
      const p = r.pitches ? r.pitches[i] : r.pitch;
      S.setRoof(r.x0 + i, z, r.level, 2, p, style);
      S.setRoof(r.x1 - i, z, r.level, 0, p, style);
    }
  }
}

// ------------------------------------------------------------------
// Rotation of a whole structure by quarter turns (about local origin).
// Matches three.js rotation.y: (x, z) -> (z, -x) for one turn.
// ------------------------------------------------------------------
export function rotateStructure(S, turns) {
  turns = ((turns % 4) + 4) % 4;
  for (let t = 0; t < turns; t++) {
    const floors = new Map(), walls = new Map(), roofs = new Map(), stairs = new Map(), columns = new Map();
    for (const [k, v] of S.floors) { const [x, z, l] = k.split(',').map(Number); floors.set(`${z},${-x - 1},${l}`, v); }
    for (const [k, v] of S.columns) { const [x, z, l] = k.split(',').map(Number); columns.set(`${z},${-x},${l}`, v); }
    for (const [k, v] of S.roofs) { const [x, z, l] = k.split(',').map(Number); roofs.set(`${z},${-x - 1},${l}`, { ...v, dir: (v.dir + 3) % 4 }); }
    for (const [k, v] of S.stairs) { const [x, z, l] = k.split(',').map(Number); stairs.set(`${z},${-x - 1},${l}`, { ...v, dir: (v.dir + 3) % 4 }); }
    for (const [k, v] of S.walls) {
      const [x, z, l, a] = k.split(',').map(Number);
      if (a === 0) walls.set(`${z},${-x - 1},${l},1`, { ...v });
      else walls.set(`${z},${-x},${l},0`, { ...v, flip: !v.flip });
    }
    for (const p of S.props) {
      const nx = p.z, nz = -p.x;
      p.x = nx; p.z = nz; p.rot = ((p.rot || 0) + 1) % 4;
    }
    Object.assign(S, { floors, walls, roofs, stairs, columns });
  }
  // normalise so the minimum cell is at (0,0)
  let mx = Infinity, mz = Infinity;
  for (const m of [S.floors, S.roofs]) for (const k of m.keys()) { const [x, z] = k.split(',').map(Number); mx = Math.min(mx, x); mz = Math.min(mz, z); }
  if (mx !== Infinity) translateStructure(S, -mx, -mz);
  S.dirty = true;
  return S;
}

export function translateStructure(S, dx, dz) {
  const mv = (m, fn) => { const n = new Map(); for (const [k, v] of m) n.set(fn(k.split(',').map(Number)), v); return n; };
  S.floors = mv(S.floors, ([x, z, l]) => `${x + dx},${z + dz},${l}`);
  S.roofs = mv(S.roofs, ([x, z, l]) => `${x + dx},${z + dz},${l}`);
  S.stairs = mv(S.stairs, ([x, z, l]) => `${x + dx},${z + dz},${l}`);
  S.columns = mv(S.columns, ([x, z, l]) => `${x + dx},${z + dz},${l}`);
  S.walls = mv(S.walls, ([x, z, l, a]) => `${x + dx},${z + dz},${l},${a}`);
  for (const p of S.props) { p.x += dx * CELL; p.z += dz * CELL; }
}

// Validation: every floor cell reachable from an exterior door (BFS over cells,
// crossing edges without walls, through door/opening walls, and stairs).
export function validateReachability(S) {
  const passable = (x, z, l, a) => {
    const w = S.walls.get(`${x},${z},${l},${a}`);
    if (!w) return true;
    const g = shapeGrid(w.shape);
    // passable if the bottom 8 rows of some 4 adjacent columns are non-solid & not window
    for (let k = 0; k <= 4; k++) {
      let ok = true;
      for (let r = 0; r < 8 && ok; r++) for (let c = k; c < k + 4 && ok; c++) {
        const ch = g[r][c];
        if (ch === CELL_SOLID || ch === 'w') ok = false;
      }
      if (ok) return true;
    }
    return false;
  };
  const start = [];
  for (const [k] of S.walls) {
    const [x, z, l, a] = k.split(',').map(Number);
    if (l !== 0) continue;
    const c1 = a === 0 ? S.floors.has(`${x},${z - 1},0`) : S.floors.has(`${x - 1},${z},0`);
    const c2 = S.floors.has(`${x},${z},0`);
    if (c1 !== c2 && passable(x, z, 0, a)) start.push(c2 ? [x, z, 0] : a === 0 ? [x, z - 1, 0] : [x - 1, z, 0]);
  }
  // open floor edges (porches) count as entries too
  for (const k of S.floors.keys()) {
    const [x, z, l] = k.split(',').map(Number);
    if (l !== 0) continue;
    for (const [dx, dz, ex, ez, a] of [[0, -1, x, z, 0], [0, 1, x, z + 1, 0], [-1, 0, x, z, 1], [1, 0, x + 1, z, 1]]) {
      if (!S.floors.has(`${x + dx},${z + dz},0`) && !S.walls.has(`${ex},${ez},0,${a}`)) start.push([x, z, 0]);
    }
  }
  const seen = new Set();
  const q = [...start];
  for (const s of start) seen.add(s.join(','));
  const stairByCell = new Map();
  for (const [k, st] of S.stairs) {
    const [x, z, l] = k.split(',').map(Number);
    const D = DIRS[st.dir];
    const info = { top: [x + 2 * D[0], z + 2 * D[1], l + 1] };
    stairByCell.set(`${x},${z},${l}`, info);
    stairByCell.set(`${x + D[0]},${z + D[1]},${l}`, info);
  }
  while (q.length) {
    const [x, z, l] = q.shift();
    const nbs = [[x, z - 1, x, z, 0], [x, z + 1, x, z + 1, 0], [x - 1, z, x, z, 1], [x + 1, z, x + 1, z, 1]];
    for (const [nx, nz, ex, ez, a] of nbs) {
      const k = `${nx},${nz},${l}`;
      if (seen.has(k)) continue;
      if (!S.floors.has(k) && !isStairCell(S, nx, nz, l)) continue;
      if (!passable(ex, ez, l, a)) continue;
      seen.add(k); q.push([nx, nz, l]);
    }
    const st = stairByCell.get(`${x},${z},${l}`);
    if (st) {
      const k = st.top.join(',');
      if (!seen.has(k) && S.floors.has(k)) { seen.add(k); q.push(st.top); }
    }
  }
  const unreachable = [];
  for (const [k, f] of S.floors) {
    if (f.style === 'tar' || f.style === 'attic') continue; // roofs & attics aren't meant to be walked
    if (!seen.has(k)) unreachable.push(k);
  }
  return { ok: unreachable.length === 0, unreachable };
}
function isStairCell(S, x, z, l) {
  for (const [k, st] of S.stairs) {
    const [sx, sz, sl] = k.split(',').map(Number);
    if (sl !== l) continue;
    const D = DIRS[st.dir];
    if ((sx === x && sz === z) || (sx + D[0] === x && sz + D[1] === z)) return true;
  }
  return false;
}
void STORY; void SHAPE_ROWS;
