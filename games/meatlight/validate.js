#!/usr/bin/env node
/* Runs the placement validator over the level data outside the browser.
   Exits non-zero on any error so the build refuses to ship a broken plant. */
var fs = require('fs'), path = require('path'), vm = require('vm');
var src = path.join(__dirname, 'src');
var files = ['10-core.js', '35-props.js', '40-level.js', '50-validate.js'];
var code = files.map(function (f) { return fs.readFileSync(path.join(src, f), 'utf8'); }).join('\n');

var ctx = { console: console, Math: Math, Object: Object, document: undefined };
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'meatlight-level' });

console.log('MEATLIGHT level check');
console.log('  rooms %d  doors %d  props %d  fittings %d  cameras %d',
  Object.keys(ctx.ROOMS).length, ctx.DOORS.length, ctx.PROPS.length,
  ctx.WALLPROPS.length, ctx.CAMS.length);
var rep = ctx.validateLevel(function (s) { console.log(s); });
if (!rep.ok) { console.log('\nFAILED: %d error(s)', rep.errors.length); process.exit(1); }
console.log('  %d warning(s)', rep.warns.length);
console.log('PASS -- every prop, fitting, doorway and camera is where it claims to be.');
