// Builds a single self-contained HTML page (dist-artifact/last-toll.html) with the
// game's JS and CSS inlined and three.js loaded from jsDelivr through an import map.
// Useful for hosting the game as one file.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('npx vite build --mode artifact', { cwd: root, stdio: 'inherit' });

const out = join(root, 'dist-artifact');
const assets = join(out, 'assets');
const files = readdirSync(assets);
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
const threeVersion = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')).version;

const code = readFileSync(join(assets, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = css ? readFileSync(join(assets, css), 'utf8') : '';

const html = `<title>Last Toll</title>
<meta name="description" content="A zombie extraction survival game in the spirit of The Walking Dead: Saints & Sinners.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Barlow+Condensed:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${style}</style>
<div id="app"></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js"}}</script>
<script type="module">${code}</script>
`;

writeFileSync(join(out, 'last-toll.html'), html);
console.log(`wrote dist-artifact/last-toll.html (${(html.length / 1024).toFixed(0)} KB, three@${threeVersion} from CDN)`);
