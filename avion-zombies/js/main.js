import { Game } from './game/game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__game = game;
game.boot().catch((err) => {
  console.error(err);
  const s = document.getElementById('boot-status');
  if (s) s.textContent = 'Failed to start: ' + (err && err.message ? err.message : err);
  const b = document.querySelector('[data-screen="boot"]');
  if (b) b.classList.add('error');
});
