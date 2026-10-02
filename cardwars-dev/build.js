// Builds the single-file game: ../cardwars.html (repo root). node build.js
'use strict';
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const order = ['engine.js', 'ai.js', 'gl.js', 'models.js', 'scene.js', 'art.js', 'audio.js', 'ui.js', 'meta.js', 'tutorial.js', 'main.js'];
const notes = fs.readFileSync(path.join(__dirname, 'NOTES.txt'), 'utf8');
let html = src('shell.html');
html = html.replace('<!--@@NOTES@@-->', () => '<!--\n' + notes.replace(/--/g, '—') + '\n-->');
html = html.replace('/*@@CSS@@*/', () => src('style.css'));
html = html.replace('/*@@JS@@*/', () => order.map(src).join('\n'));
const out = path.join(__dirname, '..', 'cardwars.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(1) + ' KB');
