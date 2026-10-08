// World generator and mesher checks that run in Node: timings, sanity of the lighting and
// meshes, and a top-down map of the biome rings written to tools/out/rings.png.
//
//   node tools/test-world.mjs

import { WorldGen, BIOMES } from '../src/world/gen.js';
import { Mesher } from '../src/world/mesher.js';
import { B, HEIGHT, OPAQUE, BLOCKS } from '../src/world/blocks.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

const gen = new WorldGen(1337);

// ---- generation timing ----
const cols = new Map();
const key = (x, z) => `${x},${z}`;
let t0 = performance.now();
for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) cols.set(key(cx, cz), gen.generateColumn(cx, cz));
const genMs = (performance.now() - t0) / 49;
console.log(`generate: ${genMs.toFixed(1)} ms per column`);
check(genMs < 60, 'column generation under 60 ms');

// the tower stands at the origin and the spawn point is clear
const sp = gen.spawnPoint();
const c0 = cols.get(key(0, 0));
const at = (x, y, z) => {
  const c = cols.get(key(Math.floor(x / 16), Math.floor(z / 16)));
  return c[(x & 15) | ((z & 15) << 4) | (y << 8)];
};
check(at(0, gen.towerBase() + 10, 0) === B.TOWER_STONE, 'tower at the origin');
check(at(Math.floor(sp.x), sp.y, Math.floor(sp.z)) === B.AIR && at(Math.floor(sp.x), sp.y + 1, Math.floor(sp.z)) === B.AIR, `spawn point is clear (y=${sp.y})`);
check(OPAQUE[at(Math.floor(sp.x), sp.y - 1, Math.floor(sp.z))] === 1, 'spawn point stands on ground');
void c0;

// ---- meshing ----
const mesher = new Mesher();
let quads = 0, ms = 0, n = 0;
for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
  const nine = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nine.push(cols.get(key(cx + dx, cz + dz)));
  const t = performance.now();
  const r = mesher.build(nine);
  ms += performance.now() - t; n++;
  quads += (r.opaque.count + r.cutout.count) / 4;
  if (cx === 0 && cz === 0) {
    // light: open sky is fully lit, deep rock is dark
    const top = r.heights[0];
    check(top > 40, `heightmap reads ground (${top})`);
    check((r.light[(top + 2) << 8] >> 4) === 15, 'sky light 15 above the ground');
    check(r.opaque.index.length === (r.opaque.count / 4) * 6, 'index count matches quads');
  }
}
console.log(`mesh: ${(ms / n).toFixed(1)} ms per column, ${(quads / n).toFixed(0)} quads per column`);
check(ms / n < 80, 'meshing under 80 ms per column');

// ---- lighting near a lantern in a sealed box ----
{
  const solid = new Uint8Array(16 * 16 * HEIGHT).fill(B.ROCK);
  const box = solid.slice();
  for (let y = 40; y < 46; y++) for (let z = 4; z < 12; z++) for (let x = 4; x < 12; x++) box[x | (z << 4) | (y << 8)] = B.AIR;
  box[8 | (8 << 4) | (40 << 8)] = B.LANTERN;
  const nine = [solid, solid, solid, solid, box, solid, solid, solid, solid];
  const r = mesher.build(nine);
  const L = (x, y, z) => r.light[x | (z << 4) | (y << 8)];
  check((L(8, 41, 8) & 15) === 14, `lantern lights the cell above it (${L(8, 41, 8) & 15})`);
  check((L(8, 43, 8) >> 4) === 0, 'no sky light in a sealed box');
  check((L(4, 41, 4) & 15) === 14 - 8, `light falls off with distance (${L(4, 41, 4) & 15})`);
}

// ---- the rings ----
{
  const order = [];
  for (let d = 0; d < 4600; d += 25) {
    const best = gen.biomeAt(d * 0.7071, d * 0.7071);
    if (order[order.length - 1] !== BIOMES[best]) order.push(BIOMES[best]);
  }
  console.log('rings walking out:', order.join(' > '));
  check(order.slice(0, 7).join() === BIOMES.join(), 'biome rings in CastleMiner Z order');
}

// top-down map: colour by surface block, shaded by height
{
  const S = 512, span = 9200, step = span / S;
  const px = new Uint8Array(S * S * 3);
  const colour = {
    [B.GRASS]: [86, 140, 50], [B.SAND]: [214, 196, 140], [B.ROCK]: [120, 116, 108], [B.SNOW]: [236, 240, 246],
    [B.ICE]: [160, 200, 230], [B.BLOODSTONE]: [140, 20, 20], [B.DIRT]: [110, 80, 50],
  };
  const w = new Float32Array(7);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = (i - S / 2) * step, z = (j - S / 2) * step;
    const h = gen.heightAt(x, z);
    const b = gen.weights(x, z, w);
    const surf = [B.GRASS, B.GRASS, B.SAND, h > 106 ? B.SNOW : h < 69 ? B.SAND : B.ROCK, B.SNOW, B.SAND, B.BLOODSTONE][b];
    const c = colour[surf] || [255, 0, 255];
    const k = 0.55 + (h - 30) / 160;
    const o = (j * S + i) * 3;
    px[o] = Math.min(255, c[0] * k); px[o + 1] = Math.min(255, c[1] * k); px[o + 2] = Math.min(255, c[2] * k);
  }
  writeFileSync(join(out, 'rings.png'), png(S, S, px));
  console.log('wrote tools/out/rings.png');
}

void BLOCKS;
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
