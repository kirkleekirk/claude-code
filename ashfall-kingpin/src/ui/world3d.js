// 2D overlay for the 3D view: nameplates for gates/HQs/shops/lots, faction ticks, HP bars,
// alert marks and floating combat text, projected from world space onto the UI canvas.
import { RAMPS } from '../data/palette.js';
import { BUSINESSES } from '../data/businesses.js';
import { drawText, measure } from '../render/font.js';
import { TOWER_TOP } from '../render3d/static.js';

const K = RAMPS;
const RANGE = { place: 1150, hq: 460, shop: 300, lot: 280 };

function plate(ctx, text, x, y, col, alpha, big) {
  const w = measure(text) + 6;
  ctx.globalAlpha = alpha * 0.72;
  ctx.fillStyle = K.ink[0];
  ctx.fillRect(Math.round(x - w / 2), y - 2, w, 11);
  if (big) { ctx.fillStyle = col; ctx.fillRect(Math.round(x - w / 2), y + 9, w, 1); }
  ctx.globalAlpha = alpha;
  drawText(ctx, text, x, y, col, { align: 'center' });
  ctx.globalAlpha = 1;
}

export function drawWorldOverlay3D(g, ctx, us) {
  const r3 = g.r3, A = g.act, S = g.S;
  if (!r3 || !A || !S) return;
  const P = A.player;
  ctx.setTransform(us, 0, 0, us, 0, 0);
  const sw = g.canvas.width / us, sh = g.canvas.height / us;
  const pr = (x, h, y) => { const p = r3.project(x, h, y); return p && p.x > -40 * us && p.y > -20 * us && p.x < g.canvas.width + 40 * us && p.y < g.canvas.height + 20 * us ? { x: Math.round(p.x / us), y: Math.round(p.y / us) } : null; };
  void sw; void sh;

  // Nameplates.
  for (const L of r3.labels) {
    const max = RANGE[L.kind] || 300;
    const d = Math.hypot(L.x - P.x, L.z - P.y);
    if (d > max) continue;
    let text = L.text, col = K.bone[3];
    if (L.kind === 'lot') {
      const own = S.businesses.find((b) => b.lot === L.b.id && b.town === L.b.place);
      text = own ? BUSINESSES[own.type].name.toUpperCase() : 'FOR SALE';
      col = own ? K.amber[3] : K.bone[1];
    } else if (L.kind === 'hq') col = K.gold[3];
    else if (L.kind === 'shop') col = K.sand[3];
    if (!text) continue;
    const p = pr(L.x, L.y, L.z);
    if (!p) continue;
    plate(ctx, text, p.x, p.y - 5, col, Math.max(0, Math.min(1, (max - d) / (max * 0.22))), L.kind === 'place');
  }

  // Entity markers.
  for (const e of A.ents) {
    if (!e.alive || e.turret) continue;
    if (Math.abs(e.x - P.x) > 560 || Math.abs(e.y - P.y) > 560) continue;
    const top = (e.elevated ? TOWER_TOP : 0) + (e.dog ? 13 : e.prop ? 22 : e.boss ? 30 : 25);
    const p = pr(e.x, top, e.y);
    if (!p) continue;
    if (e.prop) {
      if (e.maxHp > 1) { ctx.fillStyle = K.ink[0]; ctx.fillRect(p.x - 8, p.y - 4, 16, 3); ctx.fillStyle = g.sem.enemy; ctx.fillRect(p.x - 7, p.y - 3, Math.round(14 * Math.max(0, e.hp / e.maxHp)), 1); }
      continue;
    }
    if (!e.civilian) {
      const crew = e.faction === 'crew';
      const hostile = !crew && A.hostileTo(e, P);
      const col = crew ? g.sem.friendly : g.sem.enemy;
      if (crew || hostile || e.boss) { ctx.fillStyle = K.ink[0]; ctx.fillRect(p.x - 2, p.y - 4, 5, 4); ctx.fillStyle = col; ctx.fillRect(p.x - 1, p.y - 3, 3, 2); }
      if (e.hp < e.maxHp || e.boss) {
        const w = e.boss ? 30 : 14;
        ctx.fillStyle = K.ink[0]; ctx.fillRect(p.x - w / 2 - 1, p.y - 9, w + 2, 4);
        ctx.fillStyle = col; ctx.fillRect(p.x - w / 2, p.y - 8, Math.round(w * Math.max(0, e.hp / e.maxHp)), 2);
      }
      if (e.boss) drawText(ctx, e.name || 'BOSS', p.x, p.y - 20, K.gold[3], { align: 'center', shadow: K.ink[0] });
      if (e.ai && e.ai.state === 'suspicious') drawText(ctx, '?', p.x, p.y - 20, K.gold[3], { align: 'center', shadow: K.ink[0] });
    }
    if (e.witness) drawText(ctx, '!', p.x, p.y - 20, g.sem.bad, { align: 'center', shadow: K.ink[0] });
  }

  // Floating combat / money text (starts at its height above the ground and rises).
  for (const t of g.R.fx.texts) {
    const p = pr(t.x, t.h, t.y);
    if (!p) continue;
    ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2);
    drawText(ctx, t.str, p.x, p.y, t.color, { align: 'center', shadow: K.ink[0] });
  }
  ctx.globalAlpha = 1;
}
