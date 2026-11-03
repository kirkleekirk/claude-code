// Builds release/greenfall.html: the whole game in one file that runs when double-clicked
// (no web server needed). Run after `vite build`:  npm run package:single
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const asset = (p) => path.join(dist, p.replace(/^\.\//, ''));

// stylesheet, with fonts embedded (woff2 only; every current browser supports it)
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (_, href) => {
  let css = fs.readFileSync(asset(href), 'utf8');
  css = css.replace(/url\((?:\.\/)?([^)]+?\.woff2)\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(dist, 'assets', path.basename(f))).toString('base64')})`);
  css = css.replace(/,\s*url\([^)]+?\.woff\)\s*format\(["']woff["']\)/g, '');
  return `<style>${css}</style>`; // returned from a function, so $ patterns stay literal
});
// script, moved to the end of <body> so the page elements exist when it runs
let js = '';
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_, src) => { js = fs.readFileSync(asset(src), 'utf8'); return ''; });
js = js.replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`); // function form: the code contains $ patterns

fs.mkdirSync(path.join(root, 'release'), { recursive: true });
const out = path.join(root, 'release', 'greenfall.html');
fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(2)} MB). Double-click it to play.`);
