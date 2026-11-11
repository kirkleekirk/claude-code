import { Game } from './game/game.js';

function fail(e) {
  console.error(e);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;inset:0;margin:0;background:#05060f;color:#ff9aa8;padding:24px;white-space:pre-wrap;font:13px/1.5 monospace;z-index:99;overflow:auto';
  d.textContent = 'Far Signal could not start.\n\n' + (e && e.stack ? e.stack : e) + '\n\nThis game needs WebGL 2. Try a current version of Chrome, Edge, Firefox or Safari.';
  document.body.appendChild(d);
}

function start(snapshot) {
  try {
    const game = new Game(document.getElementById('view'), document.getElementById('ui'));
    window.FS = game;
    game.init().then(() => game.start()).catch(fail);
    // keep progress across a live page update when hosted in a viewer that supports it
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
      try { window.claude.hot.snapshot(() => { game.save(); return {}; }); } catch (e) { /* optional */ }
    }
  } catch (e) { fail(e); }
}

if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
else start({});
