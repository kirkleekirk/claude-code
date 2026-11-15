// Layout validator: runs at build time (build fails on errors) and at dev boot.
// Asserts: anchors within +/-4, tile alignment, no overlaps, every lot fronts a street,
// every door reachable from its gate (A*), every vault has two independent approach routes,
// and every place is reachable from the Hollow.
import { WORLD_W, WORLD_H, PLACES } from '../data/places.js';
import { astar, floodReach } from './pathfind.js';
import { outside } from './layout.js';
import { SOLID } from './tiles.js';

const ix = (x, y) => y * WORLD_W + x;

export function validateWorld(W) {
  const errors = [];
  let checks = 0;
  const check = (ok, msg) => { checks++; if (!ok) errors.push(msg); };
  const walk = (x, y) => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H && W.solid[ix(x, y)] === SOLID.FREE;

  // Anchors and footprints.
  for (const p of PLACES) {
    const cx = p.at[0] + Math.floor(p.w / 2), cy = p.at[1] + Math.floor(p.h / 2);
    check(Math.abs(cx - p.anchor[0]) <= 4 && Math.abs(cy - p.anchor[1]) <= 4, `${p.id}: centre (${cx},${cy}) is more than 4 tiles from anchor (${p.anchor})`);
    check(p.at[0] >= 0 && p.at[1] >= 0 && p.at[0] + p.w <= WORLD_W && p.at[1] + p.h <= WORLD_H, `${p.id}: footprint leaves the world`);
    for (const v of [...p.at, p.w, p.h]) check(Number.isInteger(v), `${p.id}: non-integer footprint`);
  }
  for (let a = 0; a < PLACES.length; a++) for (let b = a + 1; b < PLACES.length; b++) {
    const A = PLACES[a], B = PLACES[b];
    const ov = A.at[0] < B.at[0] + B.w && B.at[0] < A.at[0] + A.w && A.at[1] < B.at[1] + B.h && B.at[1] < A.at[1] + A.h;
    check(!ov, `places overlap: ${A.id} / ${B.id}`);
  }
  // Roads never cut through a footprint.
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    if (!W.road[ix(x, y)]) continue;
    const z = W.zone[ix(x, y)];
    if (z) check(false, `road tile (${x},${y}) inside ${W.places[z - 1].id}`);
  }
  // Buildings: alignment, overlap, frontage, doors.
  const owner = new Int16Array(WORLD_W * WORLD_H).fill(-1);
  for (const b of W.buildings) {
    for (const v of [b.x, b.y, b.w, b.h]) check(Number.isInteger(v), `${b.place}/${b.name}: non-integer`);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const k = ix(x, y);
      check(owner[k] === -1, `${b.place}: buildings overlap at (${x},${y})`);
      owner[k] = b.id;
    }
    check(b.doors.length > 0, `${b.place}/${b.name}: no door`);
    for (const d of b.doors) {
      const [ox, oy] = outside(d);
      const front = W.street[ix(ox, oy)] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => W.street[ix(ox + dx, oy + dy)]);
      if (!b.ruined) check(front, `${b.place}/${b.name}: door (${d.x},${d.y}) does not front a street`);
      check(walk(ox, oy), `${b.place}/${b.name}: door (${d.x},${d.y}) is blocked outside`);
    }
  }
  for (const pr of W.props) check(Number.isInteger(pr.x) && Number.isInteger(pr.y), `prop ${pr.type} off-grid`);
  // Reachability from each gate (A*), vault double approach.
  for (const p of PLACES) {
    const L = W.layouts[p.id];
    const start = L.gate ? [L.gate.x, L.gate.y] : L.spawns.entrance ? [L.spawns.entrance.x, L.spawns.entrance.y] : null;
    if (!start) { check(false, `${p.id}: no gate/entrance`); continue; }
    check(walk(start[0], start[1]), `${p.id}: gate tile blocked`);
    for (const b of L.buildings) {
      const bb = W.buildings.find((x) => x.place === p.id && x.idx === b.idx);
      for (const d of bb.doors) {
        const path = astar(WORLD_W, WORLD_H, start[0], start[1], d.x, d.y, walk);
        check(!!path, `${p.id}/${bb.name}: door (${d.x},${d.y}) unreachable from gate`);
      }
      if (bb.hq) {
        check(bb.doors.length >= 2, `${p.id}: vault has fewer than two approach routes`);
        if (bb.doors.length >= 2) {
          for (let k = 0; k < 2; k++) {
            const blocked = bb.doors[k], target = bb.doors[1 - k];
            const [bx, by] = outside(blocked);
            const walk2 = (x, y) => walk(x, y) && !(x === blocked.x && y === blocked.y) && !(x === bx && y === by) && W.bldg[ix(x, y)] !== bb.id;
            const [tx, ty] = outside(target);
            check(!!astar(WORLD_W, WORLD_H, start[0], start[1], tx, ty, walk2), `${p.id}: vault route via door ${1 - k} depends on door ${k}`);
          }
        }
      }
    }
    if (L.spawns.loot) for (const l of L.spawns.loot) {
      const reach = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => astar(WORLD_W, WORLD_H, start[0], start[1], l.x + dx, l.y + dy, walk, 6000));
      check(reach, `${p.id}: loot at (${l.x},${l.y}) unreachable`);
    }
  }
  // World connectivity: every gate reachable from the Hollow gate.
  const hg = W.layouts.hollow.gate;
  const reach = floodReach(WORLD_W, WORLD_H, hg.x, hg.y, walk);
  for (const p of PLACES) {
    const L = W.layouts[p.id];
    const g = L.gate || L.spawns.entrance;
    check(!!g && reach[ix(g.x, g.y)] === 1, `${p.id}: not reachable from the Hollow`);
  }
  return { errors, checks };
}
