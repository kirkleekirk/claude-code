// Paints every block texture into one contact sheet: tools/out/textures.png
import { paintTexture, TEX_SIZE } from '../src/gfx/blockTextures.js';
import { TEXTURES } from '../src/world/blocks.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const N = TEX_SIZE, scale = 2, cols = 8, rows = Math.ceil(TEXTURES.length / cols);
const W = cols * N * scale, H = rows * N * scale;
const px = new Uint8Array(W * H * 3).fill(40);
TEXTURES.forEach((name, i) => {
  const t = paintTexture(name);
  const ox = (i % cols) * N * scale, oy = Math.floor(i / cols) * N * scale;
  for (let y = 0; y < N * scale; y++) for (let x = 0; x < N * scale; x++) {
    const s = (Math.floor(y / scale) * N + Math.floor(x / scale)) * 4;
    const a = t[s + 3] / 255;
    const bg = ((x >> 3) + (y >> 3)) % 2 ? 90 : 60;
    const o = ((oy + y) * W + ox + x) * 3;
    for (let k = 0; k < 3; k++) px[o + k] = t[s + k] * a + bg * (1 - a);
  }
});
mkdirSync('tools/out', { recursive: true });
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync('tools/out/textures.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote tools/out/textures.png', TEXTURES.join(' '));
