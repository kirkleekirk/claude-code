// Regenerates the "Card list" section of DESIGN.md from the engine's card table. node tools/designdoc.js
'use strict';
const fs = require('fs'), path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8') + ';global.Engine = Engine;');
const E = global.Engine;
const R = { C: '', R: 'Rare, ', E: 'Epic, ', L: 'Legendary, ', K: 'Kingdom landmark, ', T: 'Token, ' };
let out = '## Card list (generated from the engine data table)\nCost = Actions to play = face-up landscapes of its type you need. B = building toughness.\n';
for (const land of E.LAND_TYPES.concat(['rainbow'])) {
  const L = E.LANDS[land];
  out += '\n**' + L.name + '**' + (L.sig ? ' (' + L.sig + ')' : '') + '\n';
  const ids = Object.keys(E.CARDS).filter(id => E.CARDS[id].land === land && E.CARDS[id].type !== 'unknown' && id[0] !== '?')
    .sort((a, b) => (E.CARDS[a].r === 'K' ? -1 : 0) - (E.CARDS[b].r === 'K' ? -1 : 0) || ({ creature: 0, building: 1, spell: 2 }[E.CARDS[a].type] - { creature: 0, building: 1, spell: 2 }[E.CARDS[b].type]) || E.CARDS[a].cost - E.CARDS[b].cost);
  for (const id of ids) {
    const c = E.CARDS[id];
    const req = c.req !== c.cost && land !== 'rainbow' ? ' (needs ' + c.req + ')' : '';
    const st = c.type === 'creature' ? ' ' + c.atk + '/' + c.def : c.type === 'building' ? ' B' + c.def : '';
    out += '- ' + c.name + ' — ' + R[c.r] + (c.r === 'K' ? '' : 'cost ' + c.cost + req) + st + ' — ' + (c.text || '') + '\n';
  }
}
const p = path.join(__dirname, '..', 'DESIGN.md');
const doc = fs.readFileSync(p, 'utf8');
const a = doc.indexOf('## Card list'), b = doc.indexOf('\n## ', a + 5);
fs.writeFileSync(p, doc.slice(0, a) + out + (b >= 0 ? doc.slice(b) : ''));
console.log('card list:', Object.keys(E.CARDS).length, 'cards');
