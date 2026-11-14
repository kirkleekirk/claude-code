// Temporary render harness (replaced by the game shell).
import { buildWorld } from './world/worldgen.js';
import { validateWorld } from './world/validator.js';
import { WorldRenderer } from './render/world-render.js';
import { pickScale, ctx2d } from './render/canvas.js';
import { characterSheet, randomLook } from './render/paperdoll.js';
import { Input } from './input/input.js';
import { drawText } from './render/font.js';
import { RAMPS } from './data/palette.js';
import { drawIcon, ICON_NAMES } from './render/icons.js';

const canvas = document.getElementById('game');
const ctx = ctx2d(canvas);
const W = buildWorld();
const rep = validateWorld(W);
if (rep.errors.length) console.error('layout errors', rep.errors);
const R = new WorldRenderer(W);
const input = new Input(canvas);
const player = { x: 64 * 16 + 8, y: 88 * 16, look: randomLook(Math.random, { top: 'rust', hat: 2, hatC: 'wood' }), dir: 0, t: 0 };
let minute = 600;
let showIcons = false;
window.__ak = { teleport: (x, y) => { player.x = x * 16 + 8; player.y = y * 16 + 8; }, setMinute: (m) => { minute = m; }, icons: (v) => { showIcons = v; }, bake: () => { while (R.terrain.bakeQueue.length) R.terrain.bakeSome(1000); } };

function frame() {
  const dpr = 1;
  if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; }
  const s = pickScale(canvas.width, canvas.height);
  const vw = Math.ceil(canvas.width / s), vh = Math.ceil(canvas.height / s);
  let mx = 0, my = 0;
  if (input.down('left')) mx--; if (input.down('right')) mx++; if (input.down('up')) my--; if (input.down('down')) my++;
  player.x += mx * 2; player.y += my * 2;
  if (mx || my) { player.t += 1 / 60; player.dir = my > 0 ? 0 : my < 0 ? 1 : mx > 0 ? 2 : 3; }
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const camX = player.x - vw / 2, camY = player.y - vh / 2;
  const sheet = characterSheet(player.look);
  const ent = { sy: player.y, draw: (c, cx, cy) => { const f = mx || my ? 2 + Math.floor(player.t * 8) % 4 : 0; const img = sheet.frames[player.dir][f]; c.fillStyle = 'rgba(18,15,14,0.35)'; c.fillRect(Math.round(player.x - cx - 4 + 2), Math.round(player.y - cy - 1), 9, 3); c.drawImage(img, Math.round(player.x - cx - img.width / 2), Math.round(player.y - cy - img.height + 2)); } };
  R.draw(ctx, camX, camY, vw, vh, { minute, focus: player, entities: [ent], timeSec: performance.now() / 1000 });
  drawText(ctx, `Ashfall Kingpin render test  ${Math.floor(player.x / 16)},${Math.floor(player.y / 16)}`, 4, 4, RAMPS.bone[3], { shadow: RAMPS.ink[0] });
  if (showIcons) ICON_NAMES.forEach((n, i) => drawIcon(ctx, n, 6 + (i % 20) * 20, 20 + Math.floor(i / 20) * 16, 'rust'));
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
