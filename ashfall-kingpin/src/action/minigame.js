// Timing minigame for lockpicks and safes: stop the needle inside the sweet spot.
// Skill (Stealth for locks, Crafting for safes), Lockmaster perk and recon widen the window.
import { RAMPS, SEM } from '../data/palette.js';
import { drawText } from '../render/font.js';
import { count, takeItem } from '../sim/inventory.js';
import { hasPerk } from '../sim/state.js';

export function newMinigame(S, kind, data) {
  const picks = count(S, 'lockpick');
  const perk = hasPerk(S, 'fx_locks') ? 1.4 : 1;
  const recon = (data.recon || 0) * 0.12;
  const pins = kind === 'safe' ? 3 : 1;
  const base = kind === 'safe' ? 0.12 : 0.17;
  const width = base * perk * (1 + recon) * (picks > 0 ? 1 : 0.65);
  return { kind, data, pins, done: 0, pos: 0, dir: 1, speed: 0.75, width, at: 0.2 + Math.random() * 0.6, fails: 0, flash: 0, picks: picks > 0, result: null };
}

export function stepMinigame(G, dt, pressed) {
  G.pos += G.dir * G.speed * dt;
  if (G.pos > 1) { G.pos = 1; G.dir = -1; }
  if (G.pos < 0) { G.pos = 0; G.dir = 1; }
  if (G.flash > 0) G.flash -= dt;
  if (!pressed || G.result) return null;
  const hit = Math.abs(G.pos - G.at) <= G.width / 2;
  if (hit) {
    G.done++;
    G.flash = 0.25;
    if (G.done >= G.pins) { G.result = 'ok'; return 'ok'; }
    G.at = 0.15 + Math.random() * 0.7;
    G.speed *= 1.25;
    return 'pin';
  }
  G.fails++;
  G.flash = -0.25;
  if (G.fails >= (G.kind === 'safe' ? 3 : 2)) { G.result = 'fail'; return 'fail'; }
  return 'miss';
}

export function consumePick(S) { takeItem(S, 'lockpick', 1); }

export function drawMinigame(ui, G) {
  const w = 220, h = 70;
  const x = Math.round((ui.W - w) / 2), y = Math.round(ui.H * 0.62);
  ui.panel('mini:panel', x, y, w, h, { title: G.kind === 'safe' ? 'Safecracking' : 'Lockpicking' });
  ui.text(`Pins ${G.done}/${G.pins}   Misses ${G.fails}/${G.kind === 'safe' ? 3 : 2}${G.picks ? '' : '   (no lockpicks: improvising)'}`, x + 8, y + 16, SEM.textDim);
  const bx = x + 10, by = y + 32, bw = w - 20;
  ui.rect(bx, by, bw, 12, RAMPS.ink[0]);
  ui.rect(bx + Math.round((G.at - G.width / 2) * bw), by + 1, Math.max(2, Math.round(G.width * bw)), 10, G.flash > 0 ? RAMPS.green[3] : RAMPS.green[2]);
  ui.rect(bx + Math.round(G.pos * bw) - 1, by - 3, 3, 18, G.flash < 0 ? SEM.bad : RAMPS.bone[3]);
  drawText(ui.ctx, 'E / Space / Click to set the pin.  Esc to back off.', x + w / 2, y + h - 12, SEM.textMute, { align: 'center' });
}
