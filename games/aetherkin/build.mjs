#!/usr/bin/env node
// Concatenates src/ into two self-contained outputs:
//   dist/aetherkin.html          - full standalone document (open in any browser)
//   dist/aetherkin.artifact.html - body fragment for the Claude Artifact host
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');

const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Eczar:wght@500;600;700&family=Sometype+Mono:wght@400;500;700&display=swap';
const TITLE = 'Aetherkin';

const css = readFileSync(join(src, 'styles.css'), 'utf8');
const markup = readFileSync(join(src, 'markup.html'), 'utf8');

const jsFiles = readdirSync(join(src, 'js')).filter(f => f.endsWith('.js')).sort();
const js = jsFiles.map(f => `\n/* ==== ${f} ${'='.repeat(Math.max(0, 60 - f.length))} */\n` + readFileSync(join(src, 'js', f), 'utf8')).join('\n');
const bundle = `(function(){\n"use strict";\n${js}\n})();`;

const head = `<title>${TITLE}</title>\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${FONTS}">\n<style>\n${css}\n</style>`;
const body = `${markup}\n<script>\n${bundle}\n<\/script>`;

writeFileSync(join(root, 'dist', 'aetherkin.artifact.html'), `${head}\n${body}\n`);
writeFileSync(join(root, 'dist', 'aetherkin.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`);

const bytes = Buffer.byteLength(body, 'utf8');
console.log(`built ${jsFiles.length} modules -> ${(bytes / 1024).toFixed(1)} KB`);
