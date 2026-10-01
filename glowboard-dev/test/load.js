// Extracts the delimited ENGINE (and AI) blocks from the single-file game and evaluates them in Node.
// Usage: const { Engine, AI } = require('./load')({ from: 'html' | 'src' });
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, '..', 'glowboard.html');

function block(text, name) {
  const open = '/* ' + name + ' */', close = '/* END ' + name + ' */';
  // the real block is the last opening marker before the closing one (the header notes mention the markers)
  const b = text.lastIndexOf(close), a = text.lastIndexOf(open, b);
  if (a < 0 || b < 0 || b < a) throw new Error('Block ' + name + ' not found');
  return text.slice(a, b + close.length);
}

module.exports = function load(opts) {
  opts = opts || {};
  let text;
  const from = opts.from || (fs.existsSync(HTML) ? 'html' : 'src');
  if (from === 'html') text = fs.readFileSync(opts.file || HTML, 'utf8');
  else text = ['engine.js', 'ai.js'].map(f => path.join(ROOT, 'src', f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  let code = block(text, 'ENGINE');
  let hasAI = text.indexOf('/* AI */') >= 0;
  if (hasAI) code += '\n' + block(text, 'AI');
  code += '\nreturn { Engine: Engine, AI: ' + (hasAI ? 'AI' : 'null') + ' };';
  // eslint-disable-next-line no-new-func
  return new Function(code)();
};
module.exports.block = block;
