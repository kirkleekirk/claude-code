// World generation checks. Runs over the finished world and reports anything
// that would look or play wrong: terrain through roads or floors, roads
// floating or too steep, buildings on streets or inside each other, doors you
// cannot walk through, trees and props inside buildings or on roads.
// Open the game with ?validate=1 to log the report.
import { T, townPlane } from './terrain.js';
import { STREETS, FIELDS, FARMS, FEATURES } from './layout.js';
import { CELL, getStyle } from '../building/defs.js';
import { ribbonY, nearestOn } from './roads.js';

const PLAYER_R = 0.3, STEP = 0.45;

export function validateWorld(world) {
  const issues = [];
  const add = (cat, msg, at) => issues.push({ cat, msg, at: at ? at.map((v) => Math.round(v * 10) / 10) : null });
  const tr = world.terrain, ph = world.physics;
  const ROADS = world.roads || [];

  // ---------- roads ----------
  const roadAt = []; // [x, z, y, half, name]
  for (const r of ROADS) {
    const s = r.samples;
    if (!s) continue;
    const half = r.width / 2;
    let worstGrade = 0, gAt = null;
    for (let i = 1; i < s.length; i++) {
      const d = Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z) || 1;
      const g = Math.abs(s[i].y - s[i - 1].y) / d;
      if (g > worstGrade) { worstGrade = g; gAt = s[i]; }
    }
    if (worstGrade > (r.endGround ? 0.2 : 0.13)) add('road-grade', `${r.name} grade ${(worstGrade * 100).toFixed(0)}%`, [gAt.x, gAt.y, gAt.z]);
    let over = 0, overAt = null, gap = 0, gapAt = null;
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      roadAt.push([p.x, p.z, p.y, half, r.name]);
      if (p.on) continue; // no ribbon here: it lies on the road it joins
      const nx = p.nx || 0, nz = p.nz || 0;
      for (let o = -half; o <= half + 1e-6; o += half / 3) {
        const x = p.x + nx * o, z = p.z + nz * o;
        const surf = ribbonY(r, s, i, o);
        const h = tr.height(x, z);
        if (h - surf > over) { over = h - surf; overAt = [x, h, z]; }
        if (surf - h > gap) { gap = surf - h; gapAt = [x, h, z]; }
      }
    }
    if (over > 0.03) add('terrain-over-road', `${r.name}: ground ${over.toFixed(2)} m above the road surface`, overAt);
    if (gap > 0.4) add('road-floating', `${r.name}: road ${gap.toFixed(2)} m above the ground`, gapAt);
  }
  // road ends that meet the town grid
  for (const r of ROADS) {
    if (!r.samples) continue;
    const ends = [];
    if (r.townStart) ends.push(r.samples[0]);
    if (r.townEnd) ends.push(r.samples[r.samples.length - 1]);
    for (const p of ends) {
      const d = Math.abs(p.y - townPlane(p.x));
      if (d > 0.05) add('road-junction', `${r.name} meets the town ${d.toFixed(2)} m off street level`, [p.x, p.y, p.z]);
    }
  }
  // junctions & crossings: where a road runs onto an earlier (major) road,
  // its surface must meet the major road's surface
  for (let a = 1; a < ROADS.length; a++) {
    const A = ROADS[a];
    if (!A.samples) continue;
    for (let b = 0; b < a; b++) {
      const R = ROADS[b];
      if (!R.samples) continue;
      const reach = R.width / 2 + (R.type === 'paved' ? 1.1 : 0);
      let worst = 0, at = null;
      for (let i = 0; i < A.samples.length; i++) {
        const p = A.samples[i];
        if (p.on) continue;
        const q = nearestOn(R.samples, p.x, p.z);
        if (q.d > reach) continue;
        const o = Math.min(q.d, R.width / 2);
        const want = q.y - 0.07 * (o / (R.width / 2)) ** 2 + 0.04 - 0.03;
        const d = Math.abs(ribbonY(A, A.samples, i, 0) - want);
        if (d > worst) { worst = d; at = [p.x, p.y, p.z]; }
      }
      if (worst > 0.1) add('road-junction', `${A.name} meets ${R.name} with a ${worst.toFixed(2)} m step`, at);
    }
  }
  const roadDist = (x, z) => {
    let best = 1e9;
    for (const [rx, rz, , half] of roadAt) {
      const d = Math.hypot(x - rx, z - rz) - half;
      if (d < best) best = d;
    }
    return best;
  };

  // ---------- town streets ----------
  {
    const seen = new Set();
    const check = (x, z, top, what) => {
      const k = Math.round(x) + ',' + Math.round(z);
      if (seen.has(k)) return;
      seen.add(k);
      const h = tr.height(x, z);
      if (h > top - 0.01) add('terrain-over-street', `ground ${(h - top).toFixed(2)} m over ${what}`, [x, h, z]);
    };
    for (const s of STREETS.ns) for (let z = s.z0 + 0.5; z < s.z1; z += 2) for (let x = s.x0 - s.walk + 0.5; x < s.x1 + s.walk; x += 1) {
      const walk = x < s.x0 || x > s.x1;
      check(x, z, townPlane(x) + (walk ? 0.15 : 0), walk ? 'sidewalk' : s.name);
    }
    for (const s of STREETS.ew) for (let x = s.x0 + 0.5; x < s.x1; x += 2) for (let z = s.z0 - s.walk + 0.5; z < s.z1 + s.walk; z += 1) {
      const walk = z < s.z0 || z > s.z1;
      check(x, z, townPlane(x) + (walk ? 0.15 : 0), walk ? 'sidewalk' : s.name);
    }
    // street ends: the ground just past an open end shouldn't drop away
    const endCheck = (x, z, what) => {
      const h = tr.height(x, z), top = townPlane(x);
      if (top - h > 0.6) add('street-edge-gap', `${what}: ${(top - h).toFixed(2)} m drop past the end of the paving`, [x, h, z]);
      if (h - top > 0.6) add('street-edge-wall', `${what}: ground rises ${(h - top).toFixed(2)} m at the end of the paving`, [x, h, z]);
    };
    for (const s of STREETS.ns) for (let x = s.x0 + 1; x < s.x1; x += 2) { endCheck(x, s.z0 - 1.5, s.name + ' north end'); endCheck(x, s.z1 + 1.5, s.name + ' south end'); }
    for (const s of STREETS.ew) for (let z = s.z0 + 1; z < s.z1; z += 2) endCheck(s.x0 - 1.5, z, s.name + ' west end');
  }

  // ---------- structures ----------
  const S = world.structures;
  const footprints = S.map((s) => {
    const b = s.bounds();
    return { s, b, cells: [...s.footprintCells()].map((k) => k.split(',').map(Number)) };
  });
  const inFootprint = (x, z, pad = 0) => {
    for (const f of footprints) {
      if (x < f.b.wx0 - pad || x > f.b.wx1 + pad || z < f.b.wz0 - pad || z > f.b.wz1 + pad) continue;
      for (const [cx, cz] of f.cells) {
        const x0 = f.s.ox + cx * CELL, z0 = f.s.oz + cz * CELL;
        if (x > x0 - pad && x < x0 + CELL + pad && z > z0 - pad && z < z0 + CELL + pad) return f.s;
      }
    }
    return null;
  };
  for (let i = 0; i < footprints.length; i++) {
    const A = footprints[i];
    for (let j = i + 1; j < footprints.length; j++) {
      const B = footprints[j];
      if (A.b.wx1 <= B.b.wx0 || B.b.wx1 <= A.b.wx0 || A.b.wz1 <= B.b.wz0 || B.b.wz1 <= A.b.wz0) continue;
      add('structure-overlap', `${A.s.name} overlaps ${B.s.name}`, [(A.b.wx0 + A.b.wx1) / 2, A.s.oy, (A.b.wz0 + A.b.wz1) / 2]);
    }
    for (const [cx, cz] of A.cells) {
      const x0 = A.s.ox + cx * CELL, z0 = A.s.oz + cz * CELL;
      let worst = -1;
      for (let u = 0.05; u <= CELL; u += (CELL - 0.1) / 3) for (let v = 0.05; v <= CELL; v += (CELL - 0.1) / 3) {
        worst = Math.max(worst, tr.height(x0 + u, z0 + v) - (A.s.oy - 0.02));
      }
      if (worst > 0) add('terrain-in-floor', `${A.s.name}: ground ${worst.toFixed(2)} m through the floor`, [x0 + 1, A.s.oy, z0 + 1]);
      const cxw = x0 + 1, czw = z0 + 1;
      if (world.onStreet(cxw, czw, -0.95)) add('structure-on-street', `${A.s.name} sits on a street`, [cxw, A.s.oy, czw]);
      const rd = roadDist(cxw, czw);
      if (rd < 1.4) add('structure-on-road', `${A.s.name} is ${rd.toFixed(1)} m from a road edge`, [cxw, A.s.oy, czw]);
    }
  }

  // ---------- ground heaped against outside walls ----------
  for (const f of footprints) {
    const st = f.s, has = (cx, cz) => st.floors.has(`${cx},${cz},0`);
    let worst = 0, at = null;
    for (const [cx, cz] of f.cells) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (has(cx + dx, cz + dz)) continue;
        for (const u of [0.3, 1, 1.7]) {
          const x = st.ox + (dx === 0 ? cx * CELL + u : dx > 0 ? (cx + 1) * CELL + 0.4 : cx * CELL - 0.4);
          const z = st.oz + (dz === 0 ? cz * CELL + u : dz > 0 ? (cz + 1) * CELL + 0.4 : cz * CELL - 0.4);
          const h = tr.height(x, z) - st.oy;
          if (h > worst) { worst = h; at = [x, tr.height(x, z), z]; }
        }
      }
    }
    if (worst > 0.12) add('terrain-against-wall', `${st.name}: ground ${worst.toFixed(2)} m above the floor outside a wall`, at);
  }

  // ---------- doors: can you walk in from outside? ----------
  let doorsChecked = 0;
  for (const s of S) {
    for (const d of s.doors) {
      if (d.def.level !== 0) continue;
      const c = d.center;
      const n = d.def.nAxis;
      // which side is outside?
      let out = null;
      for (const sg of [1, -1]) {
        const px = c[0] + n[0] * sg * 1.2, pz = c[2] + n[2] * sg * 1.2;
        if (!inFootprint(px, pz)) { out = sg; break; }
      }
      if (out == null) continue; // interior door
      doorsChecked++;
      const res = walkThrough(world, s, d, out);
      if (!res.ok) add('door-blocked', `${s.name}: ${res.why}`, res.at);
    }
  }

  // ---------- vegetation ----------
  let treeCount = 0;
  if (world.trees) {
    for (const list of world.trees.items) for (const t of list) {
      if (t.x < T.play.x0 || t.x > T.play.x1 || t.z < T.play.z0 || t.z > T.play.z1) continue;
      treeCount++;
      const h = tr.height(t.x, t.z);
      if (Math.abs(t.y - (h - 0.15)) > 0.25) add('tree-floating', `tree ${(t.y - h).toFixed(2)} m off the ground`, [t.x, t.y, t.z]);
      if (inFootprint(t.x, t.z, 1.2)) add('tree-in-building', 'tree inside or against a building', [t.x, t.y, t.z]);
      else if (t.canopy && inFootprint(t.x, t.z, t.canopy * t.s * 0.75)) add('tree-canopy-clip', 'tree canopy runs into a building', [t.x, t.y, t.z]);
      if (roadDist(t.x, t.z) < 1.0) add('tree-on-road', 'tree on a road', [t.x, t.y, t.z]);
      if (world.onStreet(t.x, t.z, 0.2) || world.inLot(t.x, t.z)) add('tree-on-street', 'tree on a street or sidewalk', [t.x, t.y, t.z]);
    }
  }
  for (const f of FIELDS) {
    if (f.crop !== 'corn' && f.crop !== 'beans') continue;
    for (let x = f.x0; x <= f.x1; x += 2) for (let z = f.z0; z <= f.z1; z += 2) {
      if (roadDist(x, z) < 0.5) { add('field-on-road', `${f.crop} field over a road`, [x, tr.height(x, z), z]); x = f.x1 + 1; break; }
      if (inFootprint(x, z, 1)) { add('field-in-building', `${f.crop} field into a building`, [x, tr.height(x, z), z]); x = f.x1 + 1; break; }
    }
  }

  // ---------- props ----------
  const props = ph.owners.get('props') || [];
  const fences = ph.owners.get('fences') || [];
  let propCount = 0;
  for (const b of [...props, ...fences]) {
    if (b.kind === 'walk') continue;
    propCount++;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const sz = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    if (sz > 20) continue; // floodwall runs
    const what = b.kind === 'fence' ? 'fence post' : b.kind === 'car' ? 'car' : b.kind === 'tree' ? 'pole' : 'prop';
    const host = inFootprint(cx, cz, -0.05);
    if (host) add('prop-in-building', `${what} inside ${host.name}`, [cx, b.min[1], cz]);
    if (b.kind !== 'car' && b.kind !== 'barricade') {
      const rd = roadDist(cx, cz);
      if (rd < 0.2) add('prop-on-road', `${what} on a road`, [cx, b.min[1], cz]);
      if (world.onStreet(cx, cz, -0.05) && !onSidewalk(cx, cz)) add('prop-on-street', `${what} in a street`, [cx, b.min[1], cz]);
    }
    const g = tr.height(cx, cz);
    if (b.min[1] - g > 0.35 && b.kind !== 'walk' && !world.onStreet(cx, cz, 0.5)) add('prop-floating', `${what} ${(b.min[1] - g).toFixed(2)} m above the ground`, [cx, b.min[1], cz]);
    if (g - b.max[1] > 0.1) add('prop-buried', `${what} buried`, [cx, b.min[1], cz]);
  }
  // cars must not overlap lamps, hydrants, benches, poles, bins or fences
  for (const b of props) {
    if (b.kind !== 'car') continue;
    for (const o of ph.query(b.min[0], b.min[2], b.max[0], b.max[2], [])) {
      if (o === b || o.kind === 'walk' || o.kind === 'glass' || o.kind === 'floor' || (o.carId && o.carId === b.carId)) continue;
      if (o.max[1] <= b.min[1] + 0.05 || o.min[1] >= b.max[1]) continue;
      const ix = Math.min(b.max[0], o.max[0]) - Math.max(b.min[0], o.min[0]);
      const iz = Math.min(b.max[2], o.max[2]) - Math.max(b.min[2], o.min[2]);
      if (ix > 0.05 && iz > 0.05) add('prop-overlap', `car overlaps a ${o.kind}${o.owner && o.owner.name ? ' of ' + o.owner.name : ''}`, [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2]);
    }
  }
  // entry steps: the outer step must reach the ground
  for (const st of S) for (const p of st.props) {
    if (p.type !== 'steps') continue;
    const r = ((p.rot || 0) % 4 + 4) % 4, n = Math.max(1, Math.round((p.h || 0.5) / 0.19) - 1);
    const out = n * 0.3 - 0.15;
    const dx = [0, 1, 0, -1][r] * out, dz = [1, 0, -1, 0][r] * out;
    const x = st.ox + p.x + dx, z = st.oz + p.z + dz;
    const bottom = st.oy + p.y - (p.h || 0.5) - 0.25;
    const g = tr.height(x, z);
    if (bottom > g + 0.02) add('steps-floating', `${st.name}: entry steps ${(bottom - g).toFixed(2)} m above the ground`, [x, g, z]);
    const top = st.oy + p.y - n * ((p.h || 0.5) / (n + 1));
    if (g > top + 0.1) add('steps-buried', `${st.name}: entry steps buried ${(g - top).toFixed(2)} m`, [x, g, z]);
  }
  // fences must not cross building fronts or stand in doorways
  for (const b of fences) {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    if (world.fenceBlocked && world.fenceBlocked(cx, cz)) add('fence-blocks-door', 'fence in front of a doorway or against a building', [cx, b.min[1], cz]);
  }
  // ceiling lights need a ceiling
  for (const st of S) for (const p of st.props) {
    if (p.type !== 'ceiling_light') continue;
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL), l = Math.round(p.y / 3);
    if (!st.floors.has(`${cx},${cz},${l + 1}`)) add('light-floating', `${st.name}: ceiling light with no ceiling above`, [st.ox + p.x, st.oy + p.y + 2.7, st.oz + p.z]);
  }
  // walls inside a building show their inside finish on both faces
  for (const st of S) for (const [key, w] of st.walls) {
    if (w.shape !== 'railing') continue;
    // only railings with building on both sides (loft or stairwell edges)
    const [x, z, l, a] = key.split(',').map(Number);
    if (l < 1) continue;
    const c1 = a === 0 ? [x, z - 1] : [x - 1, z];
    if (!st.floors.has(`${c1[0]},${c1[1]},0`) || !st.floors.has(`${x},${z},0`)) continue;
    const sty = getStyle(w.style);
    if (sty.a.mat !== sty.b.mat || sty.a.color !== sty.b.color) add('railing-finish', `${st.name}: railing at ${key} shows an outside finish`, [st.ox, st.oy, st.oz]);
  }
  // fences must leave roads and drives open
  for (const b of fences) {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    if (roadDist(cx, cz) < 0.6) add('fence-across-road', 'fence post blocks a road', [cx, b.min[1], cz]);
  }

  // ---------- terrain ----------
  {
    const hot = [];
    for (let z = T.play.z0; z < T.play.z1; z += 2) for (let x = T.play.x0; x < Math.min(T.play.x1, T.floodwallX + 8); x += 2) {
      const h = tr.height(x, z);
      if (h < T.water + 0.5) continue;
      const s = Math.max(Math.abs(tr.height(x + 2, z) - h), Math.abs(tr.height(x, z + 2) - h)) / 2;
      if (s > 0.95 && !inFootprint(x, z, 1)) hot.push([x, h, z, s]);
    }
    // cluster into 16 m bins
    const bins = new Map();
    for (const p of hot) {
      const k = Math.floor(p[0] / 16) + ',' + Math.floor(p[2] / 16);
      const e = bins.get(k);
      if (!e || e[3] < p[3]) bins.set(k, p);
    }
    for (const p of bins.values()) add('terrain-cliff', `slope ${(p[3] * 100).toFixed(0)}%`, p.slice(0, 3));
  }

  // ---------- spawn ----------
  {
    const [sx, sz] = FEATURES.spawn;
    const blockers = ph.query(sx - 0.5, sz - 0.5, sx + 0.5, sz + 0.5, []).filter((b) => b.kind !== 'walk' && b.max[1] > tr.height(sx, sz) + STEP);
    if (blockers.length) add('spawn-blocked', 'spawn point inside something', [sx, tr.height(sx, sz), sz]);
  }

  // summary
  const byCat = {};
  for (const i of issues) byCat[i.cat] = (byCat[i.cat] || 0) + 1;
  return { issues, byCat, stats: { structures: S.length, doorsChecked, trees: treeCount, props: propCount, roads: ROADS.length, farms: FARMS.length } };
}

function onSidewalk(x, z) {
  for (const s of STREETS.ns) if (z > s.z0 && z < s.z1 && ((x > s.x0 - s.walk && x < s.x0) || (x > s.x1 && x < s.x1 + s.walk))) return true;
  for (const s of STREETS.ew) if (x > s.x0 && x < s.x1 && ((z > s.z0 - s.walk && z < s.z0) || (z > s.z1 && z < s.z1 + s.walk))) return true;
  return false;
}

// Walk a capsule from 2.6 m outside a door straight through it to 1 m inside.
function walkThrough(world, S, door, outSign) {
  const ph = world.physics;
  const c = door.center, n = door.def.nAxis;
  const dirx = -n[0] * outSign, dirz = -n[2] * outSign;
  let x = c[0] - dirx * 2.6, z = c[2] - dirz * 2.6;
  let y = ph.groundAt(x, z, S.oy + 3, PLAYER_R);
  if (y > S.oy + 0.3) {
    // start point may be on something tall; take the terrain
    y = world.terrain.height(x, z);
  }
  const startY = y;
  const ignore = (b) => b.kind === 'door' || b.door;
  for (let t = 0; t <= 3.6; t += 0.1) {
    const tx = c[0] - dirx * (2.6 - t), tz = c[2] - dirz * (2.6 - t);
    const g = groundFiltered(ph, tx, tz, y + STEP, ignore);
    if (g < y - 1.2 && t < 2.4) return { ok: false, why: `drop of ${(y - g).toFixed(2)} m in front of the door`, at: [tx, g, tz] };
    const ny = g;
    // collide
    const [rx, rz] = collideFiltered(ph, tx, tz, PLAYER_R, ny, ny + 1.7, ignore);
    if (Math.hypot(rx - tx, rz - tz) > 0.08) {
      const hit = blockerAt(ph, tx, tz, ny, ignore);
      return { ok: false, why: `path blocked ${t < 2.6 ? 'outside' : 'inside'} the door by ${hit}`, at: [tx, ny, tz] };
    }
    x = tx; z = tz; y = ny;
  }
  if (Math.abs(y - S.oy) > 0.3) return { ok: false, why: `walked in but ended ${(y - S.oy).toFixed(2)} m off the floor (start ${startY.toFixed(2)})`, at: [x, y, z] };
  return { ok: true };
}

function groundFiltered(ph, x, z, maxY, ignore) {
  let g = ph.terrain.height(x, z);
  const r = PLAYER_R;
  for (const b of ph.query(x - r, z - r, x + r, z + r, [])) {
    if (b.kind === 'glass' || b.noGround || ignore(b)) continue;
    if (b.max[1] > maxY) continue;
    if (x + r < b.min[0] || x - r > b.max[0] || z + r < b.min[2] || z - r > b.max[2]) continue;
    if (b.max[1] > g) g = b.max[1];
  }
  return g;
}
function collideFiltered(ph, x, z, r, y0, y1, ignore) {
  for (const b of ph.query(x - r, z - r, x + r, z + r, [])) {
    if (ignore(b)) continue;
    if (b.max[1] <= y0 + STEP || b.min[1] >= y1) continue;
    const cx = Math.max(b.min[0], Math.min(x, b.max[0]));
    const cz = Math.max(b.min[2], Math.min(z, b.max[2]));
    const d = Math.hypot(x - cx, z - cz);
    if (d < r - 0.02) return [x + 1, z];
  }
  return [x, z];
}
function blockerAt(ph, x, z, y, ignore) {
  const r = PLAYER_R;
  for (const b of ph.query(x - r, z - r, x + r, z + r, [])) {
    if (ignore(b)) continue;
    if (b.max[1] <= y + STEP || b.min[1] >= y + 1.7) continue;
    const cx = Math.max(b.min[0], Math.min(x, b.max[0]));
    const cz = Math.max(b.min[2], Math.min(z, b.max[2]));
    if (Math.hypot(x - cx, z - cz) < r - 0.02) return `${b.kind}${b.owner && b.owner.name ? ' of ' + b.owner.name : ''}`;
  }
  return '?';
}
