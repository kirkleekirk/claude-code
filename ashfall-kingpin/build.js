#!/usr/bin/env node
// Zero-dependency bundler: ES modules in /src -> one self-contained dist/ashfall-kingpin.html.
// Supported module syntax (enforced): `import { a, b as c } from './x.js'`, `import * as X from './x.js'`,
// `export function|class|const`, `export { a, b }`. No default exports, no `export let`, no cycles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'ashfall-kingpin.html');
const MAX_BYTES = 3 * 1024 * 1024;

const IMPORT_RE = /^[ \t]*import\s+(?:\{([\s\S]*?)\}|\*\s+as\s+([A-Za-z_$][\w$]*))\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(?:function\*?|class|const|var)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

function fail(msg) { console.error('BUILD FAILED: ' + msg); process.exit(1); }

function parseModule(abs) {
  const id = path.relative(SRC, abs).split(path.sep).join('/');
  let code = fs.readFileSync(abs, 'utf8');
  if (/^export\s+let\s/m.test(code)) fail(`${id}: 'export let' is not supported (live bindings)`);
  if (/^export\s+default/m.test(code)) fail(`${id}: default exports are not supported`);
  const imports = [];
  code = code.replace(IMPORT_RE, (_, names, star, from) => {
    const dep = path.resolve(path.dirname(abs), from);
    imports.push({ dep, names, star });
    return `/*import:${imports.length - 1}*/`;
  });
  if (/^\s*import\s/m.test(code)) fail(`${id}: unsupported import syntax`);
  const exports = [];
  code = code.replace(EXPORT_LIST_RE, (_, list) => {
    for (const n of list.split(',').map(s => s.trim()).filter(Boolean)) exports.push(n);
    return '';
  });
  code = code.replace(EXPORT_DECL_RE, (m, name) => { exports.push(name); return m.replace(/^export\s+/, ''); });
  if (/^export\s/m.test(code)) fail(`${id}: unsupported export syntax`);
  return { id, abs, code, imports, exports };
}

function collect(entry) {
  const mods = new Map();
  const order = [];
  const visiting = new Set();
  function visit(abs, chain) {
    if (mods.has(abs)) return;
    if (visiting.has(abs)) fail('circular import: ' + [...chain, abs].map(p => path.relative(SRC, p)).join(' -> '));
    if (!fs.existsSync(abs)) fail('missing module ' + path.relative(ROOT, abs) + ' (from ' + path.relative(SRC, chain[chain.length - 1] || '') + ')');
    visiting.add(abs);
    const m = parseModule(abs);
    for (const im of m.imports) visit(im.dep, [...chain, abs]);
    visiting.delete(abs);
    mods.set(abs, m);
    order.push(m);
  }
  visit(entry, []);
  return { mods, order };
}

function stripComments(code) {
  // Only whole-line // comments and blank lines; inline content is left untouched for safety.
  return code.split('\n').filter(l => !/^\s*\/\/(?!#)/.test(l) && l.trim() !== '').join('\n');
}

export function bundle() {
  const { mods, order } = collect(path.join(SRC, 'main.js'));
  const index = new Map(order.map((m, i) => [m.abs, i]));
  const parts = order.map((m, i) => {
    let body = m.code.replace(/\/\*import:(\d+)\*\//g, (_, k) => {
      const im = m.imports[+k];
      const dep = mods.get(im.dep);
      const ref = `__m${index.get(im.dep)}`;
      if (im.star) return `const ${im.star} = ${ref};`;
      const names = im.names.split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const [a, b] = s.split(/\s+as\s+/);
        if (!dep.exports.includes(a)) fail(`${m.id}: '${a}' is not exported by ${dep.id}`);
        return b ? `${a}: ${b}` : a;
      });
      return `const { ${names.join(', ')} } = ${ref};`;
    });
    body = stripComments(body);
    return `// --- ${m.id}\nconst __m${i} = (() => {\n${body}\nreturn { ${m.exports.join(', ')} };\n})();`;
  });
  return { js: parts.join('\n'), count: order.length };
}

const HTML = (js) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ashfall Kingpin</title>
<style>
html,body{margin:0;height:100%;background:#120f0e;overflow:hidden}
canvas{display:block;width:100vw;height:100vh;image-rendering:pixelated;cursor:none;outline:none}
#ak-text{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(80vw,720px);height:30vh;display:none;
background:#2a2420;color:#f4ead6;border:2px solid #cf7444;font:12px monospace;padding:8px;z-index:5}
</style></head>
<body><canvas id="game" tabindex="0"></canvas><textarea id="ak-text" spellcheck="false"></textarea>
<script>
"use strict";
${js}
</script></body></html>`;

async function main() {
  const t0 = Date.now();
  // Layout validation is part of the build: a failing master plan fails the build.
  const { validateWorld } = await import('./src/world/validator.js');
  const { buildWorld } = await import('./src/world/worldgen.js');
  const report = validateWorld(buildWorld());
  if (report.errors.length) {
    for (const e of report.errors.slice(0, 40)) console.error('  layout: ' + e);
    fail(`layout validator: ${report.errors.length} error(s)`);
  }
  const { js, count } = bundle();
  const html = HTML(js);
  const bytes = Buffer.byteLength(html);
  if (bytes > MAX_BYTES) fail(`output is ${bytes} bytes (> ${MAX_BYTES})`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`layout OK (${report.checks} checks) | ${count} modules | ${(bytes / 1024).toFixed(0)} KB -> ${path.relative(ROOT, OUT)} in ${Date.now() - t0} ms`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
