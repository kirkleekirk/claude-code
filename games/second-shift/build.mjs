// Concatenates src/*.js + style.css into a single self-contained index.html
// Usage: node build.mjs            -> index.html (standalone)
//        node build.mjs --artifact  -> index.artifact.html (no doctype/html/head/body wrapper)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const css = readFileSync(join(src, 'style.css'), 'utf8');
const body = readFileSync(join(src, 'body.html'), 'utf8');
const js = readdirSync(src).filter(f => /^\d\d-.*\.js$/.test(f)).sort()
  .map(f => `/* ===== ${f} ===== */\n` + readFileSync(join(src, f), 'utf8')).join('\n');

const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bangers&family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600;700&display=swap">';
const title = 'Second Shift';
const artifact = process.argv.includes('--artifact');

let out;
if (artifact) {
  out = `<title>${title}</title>\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`;
  writeFileSync(join(root, 'index.artifact.html'), out);
  console.log('index.artifact.html', (out.length / 1024).toFixed(0) + 'KB');
} else {
  out = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>${title}</title>\n${fonts}\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n<script>\n${js}\n</script>\n</body>\n</html>\n`;
  writeFileSync(join(root, 'index.html'), out);
  console.log('index.html', (out.length / 1024).toFixed(0) + 'KB');
}
