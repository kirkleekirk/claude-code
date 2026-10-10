// The original's interface art, from your own copy of the game (tools/cmz/rip_ui.py writes it to
// local-assets/ui; never committed). Each sprite becomes a CSS class, `sp-<Name>`, that draws it
// at the original's size: the interface is laid out on CastleMiner Z's 1280 x 720 screen, 16 of
// its pixels to the em. While it's there the document has the class `cmz-ui`; without it the
// screens draw a look-alike of their own.

import { fileFetch, fileUrl } from '../core/files.js';

const BASE = 'local-assets/ui/';
let LOADED = null;

// The sprites, once ({ w, h, sprites: name -> [x, y, w, h] }); false if they aren't there.
export function loadUiSheet() {
  if (!LOADED) LOADED = load();
  return LOADED;
}

const em = (v) => `${v / 16}em`;

async function load() {
  try {
    const r = await fileFetch(BASE + 'sprites.json');
    if (!r.ok) return false;
    const d = await r.json();
    const img = await fileFetch(BASE + 'sheet.png');
    if (!img.ok) return false;
    const url = fileUrl(BASE + 'sheet.png');
    let css = '';
    for (const [name, [x, y, w, h]] of Object.entries(d.sprites)) {
      css += `.sp-${name} { background: url("${url}") no-repeat ${em(-x)} ${em(-y)} / ${em(d.w)} ${em(d.h)}; }\n`;
      css += `.sp-${name}.sz { width: ${em(w)}; height: ${em(h)}; }\n`;
    }
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
    document.documentElement.classList.add('cmz-ui');
    return d;
  } catch {
    return false;
  }
}
