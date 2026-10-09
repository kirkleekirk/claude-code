// Builds the game as one self-contained HTML page (dist-artifact/starminer-z.html): the game's
// JS and CSS inlined (the world workers and the avatar data are inlined in the bundle too),
// with three.js loaded from jsDelivr through an import map and the fonts from Google Fonts.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('npx vite build --mode artifact', { cwd: root, stdio: 'inherit' });

const out = join(root, 'dist-artifact');
const assets = join(out, 'assets');
const files = readdirSync(assets);
const jsFiles = files.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`expected one JS bundle, got ${jsFiles.join(', ')}`);
const css = files.find((f) => f.endsWith('.css'));
const threeVersion = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')).version;

const code = readFileSync(join(assets, jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = css ? readFileSync(join(assets, css), 'utf8') : '';

const html = `<title>StarMiner Z</title>
<meta name="description" content="A voxel survival game in the spirit of CastleMiner Z, on an alien moon under a giant planet.">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Open+Sans:wght@500;600;700;800&family=Saira+Semi+Condensed:wght@500;600;700&display=swap">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}${style}</style>
<div id="app"></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js"}}</script>
<script type="module">${code}</script>
`;

writeFileSync(join(out, 'starminer-z.html'), html);
console.log(`wrote dist-artifact/starminer-z.html (${(html.length / 1024).toFixed(0)} KB, three@${threeVersion} from CDN)`);
