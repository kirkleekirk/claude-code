import { Game } from './game.js';

const fill = document.getElementById('load-fill');
const msg = document.getElementById('load-msg');

function fatal(err) {
  console.error(err);
  const f = document.getElementById('fatal');
  f.classList.remove('hidden');
  const hint = location.protocol === 'file:'
    ? 'Browsers block ES modules and model loading from file:// — run <code>npm start</code> (or <code>python3 -m http.server</code>) in the game folder and open the printed http:// address.'
    : 'WebGL2 is required. Try an up-to-date Chrome, Edge or Firefox with hardware acceleration enabled.';
  f.innerHTML = `<b>Couldn't start Invincible Adversaries.</b><p>${hint}</p><pre>${String(err && err.stack || err)}</pre>`;
}

try {
  const game = new Game();
  await game.boot((p, text) => {
    fill.style.width = Math.round(p * 100) + '%';
    if (text) msg.textContent = text;
  });
} catch (e) { fatal(e); }
