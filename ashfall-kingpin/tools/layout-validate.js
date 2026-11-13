#!/usr/bin/env node
// Runs the layout validator headless. `--ascii` prints the world map; `--place <id>` zooms in.
import { buildWorld } from '../src/world/worldgen.js';
import { validateWorld } from '../src/world/validator.js';
import { T, ST, F, SOLID } from '../src/world/tiles.js';
import { WORLD_W, WORLD_H } from '../src/data/places.js';

const W = buildWorld();
const t0 = Date.now();
const rep = validateWorld(W);
const args = process.argv.slice(2);

function glyph(x, y) {
  const i = y * WORLD_W + x;
  const st = W.struct[i];
  if (st === ST.WALL) return '#';
  if (st === ST.TOWER) return 'T';
  if (st === ST.GATE) return 'G';
  if (st === ST.BWALL) return W.buildings[W.bldg[i]].hq ? 'H' : 'B';
  if (st === ST.DOOR) return 'D';
  if (st === ST.FENCE) return 'f';
  if (st === ST.BROKEN) return 'b';
  if (W.solid[i] === SOLID.LOW || W.solid[i] === SOLID.FULL) return 'o';
  if (W.road[i] === 1) return '=';
  if (W.road[i] === 2) return ':';
  if (W.floor[i] === F.RAIL) return 'r';
  if (W.bldg[i] >= 0) return '_';
  if (W.street[i]) return '.';
  const g = W.ground[i];
  return g === T.WATER ? '~' : g === T.CLIFF ? '^' : g === T.FIELD ? '"' : ' ';
}

if (args.includes('--ascii')) {
  const pi = args.indexOf('--place');
  let x0 = 0, y0 = 0, x1 = WORLD_W, y1 = WORLD_H;
  if (pi >= 0) { const L = W.layouts[args[pi + 1]]; x0 = L.box.x - 2; y0 = L.box.y - 2; x1 = L.box.x + L.box.w + 2; y1 = L.box.y + L.box.h + 2; }
  for (let y = Math.max(0, y0); y < Math.min(WORLD_H, y1); y++) {
    let row = String(y).padStart(3) + ' ';
    for (let x = Math.max(0, x0); x < Math.min(WORLD_W, x1); x++) row += glyph(x, y);
    console.log(row);
  }
}

const counts = {};
for (const b of W.buildings) counts[b.place] = (counts[b.place] || 0) + 1;
console.log('buildings per place:', JSON.stringify(counts));
if (rep.errors.length) {
  console.log(`LAYOUT INVALID: ${rep.errors.length} error(s) in ${rep.checks} checks`);
  for (const e of rep.errors.slice(0, 60)) console.log('  - ' + e);
  process.exit(1);
}
console.log(`Layout OK: ${rep.checks} checks passed in ${Date.now() - t0} ms`);
