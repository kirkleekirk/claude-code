// Builds the game as one HTML file to download and open straight from disk (double-click it):
// dist-download/starminer-z.html. Everything is inside it, three.js and the world workers too,
// so it runs offline (only the fonts come from the web). A page opened from disk can't fetch the
// files beside it, so whatever has been ripped into local-assets/ is packed in as well; that file
// is then yours alone, like local-assets/ itself, and isn't for passing round.
//
//   npm run build:download

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('npx vite build --mode download', { cwd: root, stdio: 'inherit' });

const out = join(root, 'dist-download');
const assets = join(out, 'assets');
const files = readdirSync(assets);
const jsFiles = files.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`expected one JS bundle, got ${jsFiles.join(', ')}`);
const css = files.find((f) => f.endsWith('.css'));
const code = readFileSync(join(assets, jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = css ? readFileSync(join(assets, css), 'utf8') : '';

// the ripped files, as the game would fetch them: local-assets/<path>
const TYPES = { '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png' };
const packed = {};
let bytes = 0;
const la = join(root, 'local-assets');
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const t = TYPES[extname(f)];
    if (!t) continue;
    const key = relative(root, p).split('\\').join('/');
    const data = readFileSync(p);
    bytes += data.length;
    packed[key] = t === 'application/json' ? { t, s: data.toString('utf8') } : { t, b: data.toString('base64') };
  }
};
if (existsSync(la)) walk(la);
// a script's text can't hold '</script', and is safest with no '<' at all
const pack = JSON.stringify(packed).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>StarMiner Z</title>
<meta name="description" content="A voxel survival game in the spirit of CastleMiner Z, on an alien moon under a giant planet.">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Open+Sans:wght@500;600;700;800&family=Saira+Semi+Condensed:wght@500;600;700&display=swap">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}${style}</style>
</head>
<body>
<div id="app"></div>
<script>window.__SMZ_FILES__ = ${pack};</script>
<script type="module">${code}</script>
</body>
</html>
`;

writeFileSync(join(out, 'starminer-z.html'), html);
console.log(`wrote dist-download/starminer-z.html (${(html.length / 1048576).toFixed(1)} MB; ${Object.keys(packed).length} ripped files packed, ${(bytes / 1048576).toFixed(1)} MB of them)`);
