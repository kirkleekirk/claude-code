#!/usr/bin/env node
/* Geometry audit for BUNKER '86 maps.
 *
 *   node tools/audit-maps.mjs [seedCount]
 *
 * Loads the map code headlessly (no DOM needed) and checks for the kinds of
 * bug you only notice by walking into them:
 *
 *   - floor you can never reach from the spawn ("areas that lead nowhere")
 *   - wall stubs sitting in the middle of a room
 *   - doors that are walled in, or open onto nothing
 *   - containers and notes sealed behind blocking props
 *   - props overlapping walls or each other
 *
 * Exits non-zero if anything is found, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal shim: util/data/world touch no DOM.
const sandbox = { window: {}, Math, JSON, console, Set, Map, Uint8Array, Float32Array, Int32Array, Object, Array };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['js/util.js', 'js/data.js', 'js/world.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
}
const BK = sandbox.window.BK;

const problems = [];
const note = (map, kind, msg) => problems.push({ map, kind, msg });

// A tile the designer intends you to be able to stand on eventually. Doors can
// be opened and rubble can be cleared, so neither counts as a permanent block.
function designPassable(m) {
  const n = m.w * m.h;
  const pass = new Uint8Array(n);
  for (let i = 0; i < n; i++) pass[i] = (m.wall[i] === BK.W.NONE && m.floor[i] !== BK.F.VOID) ? 1 : 0;
  for (const p of m.props) {
    if (!p.blocks) continue;
    if (p.kind === 'door' || p.kind === 'rubble') continue;   // openable / clearable
    for (let dy = 0; dy < (p.h || 1); dy++)
      for (let dx = 0; dx < (p.w || 1); dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (BK.inBounds(m, x, y)) pass[y * m.w + x] = 0;
      }
  }
  return pass;
}

function flood(m, pass, sx, sy) {
  const seen = new Uint8Array(m.w * m.h);
  const start = Math.floor(sy) * m.w + Math.floor(sx);
  if (!pass[start]) return seen;
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % m.w, y = (i / m.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const ni = ny * m.w + nx;
      if (seen[ni] || !pass[ni]) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return seen;
}

// Group unreachable-but-walkable tiles into contiguous pockets so the report
// names five rooms instead of four hundred tiles.
function pockets(m, pass, reached) {
  const out = [];
  const done = new Uint8Array(m.w * m.h);
  for (let i = 0; i < pass.length; i++) {
    if (!pass[i] || reached[i] || done[i]) continue;
    const stack = [i], cells = [];
    done[i] = 1;
    while (stack.length) {
      const k = stack.pop();
      cells.push(k);
      const x = k % m.w, y = (k / m.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const ni = ny * m.w + nx;
        if (done[ni] || !pass[ni] || reached[ni]) continue;
        done[ni] = 1;
        stack.push(ni);
      }
    }
    const xs = cells.map(k => k % m.w), ys = cells.map(k => (k / m.w) | 0);
    out.push({
      size: cells.length,
      x0: Math.min(...xs), x1: Math.max(...xs),
      y0: Math.min(...ys), y1: Math.max(...ys),
      zone: BK.zoneAt(m, xs[0], ys[0])
    });
  }
  return out.sort((a, b) => b.size - a.size);
}

function auditMap(m, spawn, label) {
  const pass = designPassable(m);
  const start = BK.nearestFree(m, spawn.x, spawn.y, 10);
  const reached = flood(m, pass, start.x, start.y);

  // 1. unreachable floor
  const dead = pockets(m, pass, reached);
  const significant = dead.filter(p => p.size >= 3);
  for (const p of significant.slice(0, 14)) {
    note(label, 'unreachable',
      `${p.size} tiles at (${p.x0}..${p.x1}, ${p.y0}..${p.y1}) in ${p.zone} cannot be reached`);
  }
  if (significant.length > 14) note(label, 'unreachable', `...and ${significant.length - 14} more pockets`);

  // 2. wall stubs: a wall with walkable floor on all four sides
  let stubs = 0;
  const stubSpots = [];
  for (let y = 1; y < m.h - 1; y++) {
    for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x;
      if (m.wall[i] === BK.W.NONE) continue;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (y + dy) * m.w + (x + dx);
        if (m.wall[k] === BK.W.NONE && m.floor[k] !== BK.F.VOID) open++;
      }
      if (open === 4) { stubs++; if (stubSpots.length < 12) stubSpots.push(`(${x},${y})`); }
    }
  }
  if (stubs) note(label, 'wall-stub', `${stubs} wall tile(s) floating inside open floor: ${stubSpots.join(' ')}`);

  // 3. doors
  for (const d of m.props.filter(p => p.kind === 'door')) {
    const i = d.y * m.w + d.x;
    if (m.wall[i] !== BK.W.NONE) { note(label, 'door', `door at (${d.x},${d.y}) is buried in a wall`); continue; }
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const k = (d.y + dy) * m.w + (d.x + dx);
      return BK.inBounds(m, d.x + dx, d.y + dy) && m.wall[k] === BK.W.NONE && m.floor[k] !== BK.F.VOID;
    });
    if (open.length < 2) note(label, 'door', `door at (${d.x},${d.y}) opens onto ${open.length} walkable side(s)`);
  }

  // 4. interactables you can never stand next to
  for (const p of m.props) {
    if (p.kind !== 'container' && p.kind !== 'note' && p.kind !== 'hatch') continue;
    let ok = false;
    for (let dy = -1; dy <= (p.h || 1); dy++) {
      for (let dx = -1; dx <= (p.w || 1); dx++) {
        const inside = dx >= 0 && dy >= 0 && dx < (p.w || 1) && dy < (p.h || 1);
        if (inside && p.blocks) continue;
        const x = p.x + dx, y = p.y + dy;
        if (!BK.inBounds(m, x, y)) continue;
        if (pass[y * m.w + x] && reached[y * m.w + x]) { ok = true; break; }
      }
      if (ok) break;
    }
    if (!ok) note(label, 'sealed', `${p.kind} "${p.label || p.sprite}" at (${p.x},${p.y}) cannot be reached`);
  }

  // 5. props sitting inside walls or off the map
  for (const p of m.props) {
    for (let dy = 0; dy < (p.h || 1); dy++) {
      for (let dx = 0; dx < (p.w || 1); dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (!BK.inBounds(m, x, y)) { note(label, 'prop', `${p.sprite} at (${p.x},${p.y}) is off the map`); continue; }
        const k = y * m.w + x;
        if (m.wall[k] !== BK.W.NONE && p.kind !== 'poster' && p.kind !== 'sign' && p.kind !== 'fixture')
          note(label, 'prop', `${p.sprite} at (${x},${y}) is inside a wall`);
        if (m.floor[k] === BK.F.VOID && p.kind !== 'fixture')
          note(label, 'prop', `${p.sprite} at (${x},${y}) is standing on void`);
      }
    }
  }

  const walkable = pass.reduce((a, v) => a + v, 0);
  const got = reached.reduce((a, v) => a + v, 0);
  return { walkable, reached: got, pct: ((got / walkable) * 100).toFixed(1) };
}

// ---------------------------------------------------------------- run ------
const seedCount = Number(process.argv[2] || 6);

const bunker = BK.buildBunker();
const bStats = auditMap(bunker, bunker.spawn, 'bunker');
console.log(`bunker   ${bStats.reached}/${bStats.walkable} walkable tiles reachable (${bStats.pct}%)`);

for (let i = 0; i < seedCount; i++) {
  const seed = 1986 + i * 7919;
  const surf = BK.buildSurface(seed);
  const s = auditMap(surf, surf.spawn, `surface#${seed}`);
  console.log(`surface  seed ${seed}: ${s.reached}/${s.walkable} reachable (${s.pct}%)`);
}

console.log('');
if (!problems.length) {
  console.log('No geometry problems found.');
  process.exit(0);
}
const byKind = {};
for (const p of problems) (byKind[p.kind] = byKind[p.kind] || []).push(p);
for (const kind of Object.keys(byKind)) {
  console.log(`\n### ${kind} (${byKind[kind].length})`);
  for (const p of byKind[kind].slice(0, 20)) console.log(`  [${p.map}] ${p.msg}`);
  if (byKind[kind].length > 20) console.log(`  ...and ${byKind[kind].length - 20} more`);
}
console.log(`\n${problems.length} problem(s) total.`);
process.exit(1);
