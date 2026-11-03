// Zips dist/ into release/greenfall-web.zip, ready to upload to itch.io as an HTML5 game.
// Uses only Node built-ins (store-only zip, no compression dependency needed).
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'release');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('dist/index.html not found — run `npm run build` first.'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(dist);

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

const chunks = [], central = [];
let offset = 0;
for (const file of files) {
  const name = path.relative(dist, file).split(path.sep).join('/');
  const data = fs.readFileSync(file);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const crc = crc32(data);
  const nameBuf = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, body);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
  cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);
  offset += local.length + nameBuf.length + body.length;
}
const cenSize = central.reduce((a, b) => a + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...chunks, ...central, end]);
const out = path.join(outDir, 'greenfall-web.zip');
fs.writeFileSync(out, zip);
console.log(`Wrote ${out} (${(zip.length / 1024 / 1024).toFixed(2)} MB, ${files.length} files). Upload it to itch.io as an HTML game.`);
