// Browser entry: boot the game shell and expose the automation API used by tools/smoke.js.
import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__ak = game.debugApi();
canvas.focus();
game.start();
