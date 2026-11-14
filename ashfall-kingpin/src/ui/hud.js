// HUD: top bar (dirty/clean, heat, REP/rank, clock+speed, alerts), minimap with fog + overlays,
// objective tracker, hotbar, prompts, toasts, subtitles, radio ticker, banners.
import { RAMPS, heatColor } from '../data/palette.js';
import { PLACE, PLACES, SETTLEMENT_IDS, WORLD_W } from '../data/places.js';
import { RANKS } from '../data/progress.js';
import { BP, THROWABLES } from '../data/guns.js';
import { fmtMoney, fmtClock } from '../core/util.js';
import { drawText, measure } from '../render/font.js';
import { rank } from '../sim/state.js';
import { objectives } from '../sim/tutorial.js';
import { heatLevel, HEAT_LEVELS } from '../sim/heat.js';
import { count } from '../sim/inventory.js';
import { gunName } from '../sim/craft.js';
import { priceIndex, tradeAllowed } from '../sim/economy.js';
import { holds } from '../sim/jobs.js';
export const SPEEDS = [0, 1, 2, 4];

const K = RAMPS;
const FOG = 4;

export function hudTick(g, dt) {
  const S = g.S;
  g.money = g.money || { d: S.money.dirty + S.money.carried, c: S.money.clean };
  g.money.d += (S.money.dirty + S.money.carried - g.money.d) * Math.min(1, dt * 6);
  g.money.c += (S.money.clean - g.money.c) * Math.min(1, dt * 6);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  g.radioT = (g.radioT || 0) + dt;
  // Fog of war: reveal 4x4-tile blocks around the player.
  if (!S.fog || S.fog.length !== 1024) S.fog = new Array(1024).fill(0);
  const P = g.act.player;
  const bx = Math.floor(P.x / 16 / FOG), by = Math.floor(P.y / 16 / FOG);
  for (let y = by - 3; y <= by + 3; y++) for (let x = bx - 3; x <= bx + 3; x++) if (x >= 0 && y >= 0 && x < 32 && y < 32) S.fog[y * 32 + x] = 1;
}

export function drawHud(g) {
  const ui = g.ui, S = g.S;
  const W = ui.W, H = ui.H;
  // ---- top bar ----
  ui.rect(0, 0, W, 14, 'rgba(18,15,14,0.85)');
  ui.rect(0, 14, W, 1, K.ink[2]);
  let x = 4;
  ui.icon('cash', x, 2, 'amber'); x += 12;
  const dTxt = fmtMoney(g.money ? g.money.d : 0, true);
  ui.text(dTxt, x, 4, g.sem.dirty);
  ui.tipArea(x - 12, 0, measure(dTxt) + 14, 14, `!aDirty money\nStash: ${fmtMoney(S.money.dirty)}\nCarried: ${fmtMoney(S.money.carried)}\n!dCarried cash is lost (15%) if you go down. It is stashed when you return to the Hollow.${S.money.debt ? `\n!rOwed to Mags: ${fmtMoney(S.money.debt)} (day ${S.money.debtDue})` : ''}`);
  x += measure(dTxt) + 8;
  ui.icon('cash', x, 2, 'green'); x += 12;
  const cTxt = fmtMoney(g.money ? g.money.c : 0, true);
  ui.text(cTxt, x, 4, g.sem.clean);
  ui.tipArea(x - 12, 0, measure(cTxt) + 14, 14, `!cClean money\nIn front accounts: ${fmtMoney(S.money.clean)}${S.money.frozen ? `\n!rFrozen by audits: ${fmtMoney(S.money.frozen)} (${S.money.frozenDays}d)` : ''}\n!dBuys fronts, permits, tribute, council seats.`);
  x += measure(cTxt) + 10;
  // Heat: local town (or notoriety).
  const here = g.act.placeAt(g.act.player.x, g.act.player.y);
  const town = here && S.heat[here.id] !== undefined && here.kind === 'settlement' ? here.id : null;
  const h = town ? S.heat[town] : S.notoriety;
  ui.icon('heat', x, 2); x += 12;
  ui.bar(x, 4, 46, 6, h / 100, heatColor(h, g.sem));
  ui.tipArea(x - 12, 0, 60, 14, () => `!h${town ? PLACE[town].name + ' heat' : 'Notoriety'}: ${Math.round(h)} (${HEAT_LEVELS[heatLevel(h)].name})\n${HEAT_LEVELS[heatLevel(h)].desc}\nNotoriety (global): ${S.notoriety}\n${SETTLEMENT_IDS.filter((t) => S.heat[t] >= 1).map((t) => `${PLACE[t].name}: ${Math.round(S.heat[t])}`).join('\n')}${S.laylow ? `\n!gLaying low: ${S.laylow} day(s)` : ''}`);
  x += 50;
  ui.text(HEAT_LEVELS[heatLevel(h)].name, x, 4, heatColor(h, g.sem));
  x += 52;
  // REP / rank.
  const r = rank(S);
  const next = RANKS[r + 1];
  ui.icon('rep', x, 2); x += 12;
  ui.text(RANKS[r].name, x, 4, g.sem.rep);
  x += measure(RANKS[r].name) + 4;
  ui.bar(x, 5, 40, 5, next ? (S.rep - RANKS[r].rep) / (next.rep - RANKS[r].rep) : 1, g.sem.rep);
  ui.tipArea(x - 60, 0, 104, 14, `!yREP ${Math.floor(S.rep)}${next ? ' / ' + next.rep + ' for ' + next.name : ' (max rank)'}\nLevel ${S.level}${S.perkPts ? `, ${S.perkPts} perk point(s) to spend` : ''}\n${next ? '!dNext unlocks: ' + next.unlocks.join(', ') : ''}`);
  // Clock + speed (right side).
  let rx = W - 4;
  const clock = `Day ${S.day}  ${fmtClock(S.min)}`;
  const cw = measure(clock);
  const spW = 4 * 13;
  rx -= spW;
  SPEEDS.forEach((sp, i) => {
    const label = sp === 0 ? '||' : '▶'.repeat(Math.min(3, i));
    if (ui.button('hud:speed:' + sp, rx + i * 13, 1, 12, 12, label, { active: S.speed === sp, tip: sp === 0 ? 'Pause time (P)' : `${sp}x speed (, and .)` })) S.speed = sp;
  });
  rx -= cw + 6;
  ui.text(clock, rx, 4, g.sem.text);
  // Alerts.
  const alerts = S.events.pending.length + (S.defense ? 1 : 0);
  if (alerts) {
    rx -= 26;
    if (ui.button('hud:alerts', rx, 1, 22, 12, String(alerts), { icon: 'warn', color: g.sem.warn, tip: S.defense ? `${S.defense.name} attacks the Hollow ${S.defense.day === S.day ? 'tonight' : 'tomorrow'} at ${S.defense.hour}:00.` : 'Events need your decision.' })) {
      if (S.events.pending.length) g.overlay = 'event'; else g.openLedger(6);
    }
  }
  if (rx > x + 50 && ui.button('hud:ledger', rx - 50, 1, 46, 12, 'Ledger', { tip: 'Open the Ledger (Tab)', key: null })) g.openLedger();
  // ---- minimap ----
  drawMinimap(g, W - 80, 18);
  // ---- objectives ----
  drawObjectives(g);
  // ---- toasts ----
  let ty = 104;
  for (const t of g.toasts.slice(-5)) {
    const w = Math.min(220, measure(t.text) + 10);
    const a = Math.min(1, t.t * 2);
    ui.ctx.globalAlpha = a;
    ui.rect(W - w - 4, ty, w, 11, 'rgba(18,15,14,0.82)');
    ui.rect(W - w - 4, ty, 2, 11, t.kind === 'bad' ? g.sem.bad : t.kind === 'good' || t.kind === 'rank' ? g.sem.good : t.kind === 'mission' ? g.sem.warn : K.ink[3]);
    ui.text(t.text, W - w + 1, ty + 2, g.sem.text, { maxW: w - 8 });
    ui.ctx.globalAlpha = 1;
    ty += 12;
  }
  drawHotbar(g);
  // Context prompt.
  const f = g.act.focus;
  if (f && !g.overlay && !g.mini) {
    const label = promptText(g, f);
    if (label) {
      const t = `${keyName(g, 'interact')}: ${label}`;
      const w = measure(t) + 10;
      ui.rect(W / 2 - w / 2, H - 58, w, 12, 'rgba(18,15,14,0.85)');
      ui.bevel(W / 2 - w / 2, H - 58, w, 12, g.sem.lootHi, K.ink[0]);
      ui.text(t, W / 2, H - 56, g.sem.text, { align: 'center' });
    }
  }
  // Subtitles.
  g.subs.forEach((s, i) => ui.text(`[${s.text}]`, W / 2, H - 72 - i * 10, K.bone[2], { align: 'center', shadow: K.ink[0] }));
  // Radio ticker.
  if (g.radio) {
    const off = Math.floor((g.radioT || 0) * 24);
    const txt = g.radio + '    ';
    const w = 200;
    ui.rect(2, H - 12, w, 10, 'rgba(18,15,14,0.7)');
    ui.ctx.save(); ui.ctx.beginPath(); ui.ctx.rect(2, H - 12, w, 10); ui.ctx.clip();
    const tw = measure(txt);
    ui.text(txt, 4 + w - (off % (tw + w)), H - 11, K.sand[3]);
    ui.ctx.restore();
  }
  if (g.banner) {
    const a = Math.min(1, g.banner.t);
    ui.ctx.globalAlpha = a;
    const w = measure(g.banner.text) * 2 + 20;
    ui.rect(W / 2 - w / 2, 40, w, 24, 'rgba(18,15,14,0.9)');
    ui.bevel(W / 2 - w / 2, 40, w, 24, g.sem.rep, K.ink[0]);
    drawText(ui.ctx, g.banner.text, W / 2, 45, g.sem.rep, { align: 'center', scale: 2, shadow: K.ink[0] });
    ui.ctx.globalAlpha = 1;
  }
  if (S.mission) {
    const m = S.mission;
    const t = `${m.title}${m.phase === 'extract' ? ' - GET OUT' : ''}`;
    ui.text(t, W / 2, 18, m.phase === 'extract' ? g.sem.warn : g.sem.accent, { align: 'center', shadow: K.ink[0] });
    if (m.deadline) { const left = Math.max(0, m.deadline - S.total); ui.text(`${Math.floor(left / 60)}h ${Math.floor(left % 60)}m left`, W / 2, 28, g.sem.textDim, { align: 'center', shadow: K.ink[0] }); }
  }
}

function keyName(g, a) { const c = g.settings.binds[a] || ''; return c.startsWith('Key') ? c.slice(3) : c; }

export function promptText(g, f) {
  const S = g.S;
  switch (f.kind) {
    case 'cell': { const c = S.hollow.cells[f.i]; if (!c) return 'Build here'; if (c.fac === 'plot' || c.fac === 'growroom') return c.plant ? (c.plant.dead ? 'Clear dead plant' : 'Tend plot') : 'Plant'; return { bench: 'Assembly Bench', lathe: 'Parts Lathe', smelter: 'Smelter', press: 'Ammo Press', lab: 'Breeding Lab' }[c.fac] || 'Inspect ' + c.fac; }
    case 'market': return `Trade (${PLACE[f.place] ? PLACE[f.place].name : ''} market)`;
    case 'vendor': return { mags: 'Talk to Mags', blueprints: 'Blueprint dealer', smuggler: 'Bulk smuggler', armsbroker: 'Arms broker', seeds: 'Seed vendor', materials: 'Scrap trader' }[f.npc] || 'Talk';
    case 'jobs': return 'Job Board';
    case 'loot': return f.locked ? 'Crack the safe' : 'Search the crate';
    case 'vault': return 'Crack the vault';
    case 'stash': return 'Stash';
    case 'production': return 'Drying / curing / packing';
    case 'tavern': return 'Tavern: recruit crew';
    case 'lot': { const b = S.businesses.find((x) => x.town === f.place && x.lot === f.b.id); return b ? 'Manage your front' : 'Vacant lot: buy a front'; }
    case 'clinic': return 'Clinic (heal)';
    case 'gunshop': return 'Gun shop';
    case 'fence': return 'Fence stolen goods';
    case 'smuggler': return 'Bulk smugglers';
    case 'armory': return 'Foundry Exchange';
    case 'store': return 'Store';
    case 'council': return 'Compact Treasury (council)';
    case 'fixer': return 'Fixer';
    case 'chapel': return 'Chapel';
    case 'hqdoor': return g.act.locks.has(f.door.y * WORLD_W + f.door.x) ? 'Pick the lock' : null;
    case 'garage': return 'Vehicle shed';
    case 'depot': return null;
    case 'pickup': return 'Pick up';
    case 'body': return 'Search';
    case 'regular': return 'Talk (regular customer)';
    case 'worker': return 'Talk to crew';
    case 'vehicleEnter': return 'Drive';
    case 'objective': return f.ent.label || 'Use';
    case 'cargo': return 'Grab the cargo';
    case 'drop': return 'Hand over the goods';
    default: return null;
  }
}

function drawMinimap(g, x, y) {
  const ui = g.ui, S = g.S, A = g.act;
  const size = 76, tiles = 50, s = size / tiles;
  const P = A.player;
  const cx = P.x / 16 - tiles / 2, cy = P.y / 16 - tiles / 2;
  ui.panel('hud:minimap', x - 2, y - 2, size + 4, size + 4, { bg: K.ink[0] });
  const c = ui.ctx;
  c.save();
  c.beginPath(); c.rect(x, y, size, size); c.clip();
  c.imageSmoothingEnabled = false;
  c.drawImage(g.minimap, cx, cy, tiles, tiles, x, y, size, size);
  // Fog.
  c.fillStyle = K.ink[0];
  for (let by = Math.floor(cy / FOG); by <= Math.floor((cy + tiles) / FOG); by++) for (let bx = Math.floor(cx / FOG); bx <= Math.floor((cx + tiles) / FOG); bx++) {
    if (bx >= 0 && by >= 0 && bx < 32 && by < 32 && S.fog && S.fog[by * 32 + bx]) continue;
    c.fillRect(x + (bx * FOG - cx) * s, y + (by * FOG - cy) * s, FOG * s + 1, FOG * s + 1);
  }
  overlayPlaces(g, (p) => ({ x: x + (p.at[0] - cx) * s, y: y + (p.at[1] - cy) * s, w: p.w * s, h: p.h * s }));
  const dot = (wx, wy, col, r = 1) => { const px = x + (wx / 16 - cx) * s, py = y + (wy / 16 - cy) * s; c.fillStyle = col; c.fillRect(Math.round(px) - r, Math.round(py) - r, r * 2 + 1, r * 2 + 1); };
  const recon = S.mission ? S.mission.recon || 0 : 0;
  for (const e of A.ents) {
    if (!e.alive) continue;
    if (e.faction === 'crew') dot(e.x, e.y, g.sem.friendly);
    else if (!e.civilian && (A.hostileTo(e, P) || (recon >= 2 && e.place === S.mission.place)) && Math.hypot(e.x - P.x, e.y - P.y) < 22 * 16) dot(e.x, e.y, g.sem.enemy);
    else if (e.markTarget || e.objective) dot(e.x, e.y, g.sem.loot, 1);
  }
  for (const o of A.missions.objects()) dot(o.x, o.y, g.sem.loot, 1);
  if (S.mission && S.mission.phase !== 'extract' && PLACE[S.mission.place]) { const p = PLACE[S.mission.place]; dot((p.at[0] + p.w / 2) * 16, (p.at[1] + p.h / 2) * 16, g.sem.loot, 1); }
  c.restore();
  dot(P.x, P.y, K.bone[3], 1);
  const labels = ['', 'Turf', 'Heat', 'Prices'];
  ['Map', 'Turf', 'Heat', '$'].forEach((l, i) => { if (ui.button('hud:mm:' + i, x - 2 + i * 20, y + size + 3, 19, 10, l, { active: (g.mapOverlay || 0) === i, tip: i ? `${labels[i]} overlay (O)` : 'Plain minimap (O)' })) g.mapOverlay = i; });
  ui.area('hud:mmopen', x, y, size, size, { tip: 'Open the full map (M)', silent: true }) === 'click' && g.openLedger(4);
}

// Shared by the minimap and the Ledger map: overlay colours per place.
export function overlayPlaces(g, rectOf, forceMode) {
  const S = g.S, c = g.ui.ctx;
  const mode = forceMode ?? (g.mapOverlay || 0);
  if (!mode) return;
  for (const p of PLACES) {
    if (p.kind !== 'settlement' && p.kind !== 'camp') continue;
    const r = rectOf(p);
    let col = null;
    if (mode === 1) {
      if (p.kind === 'camp') { const rv = Object.values(S.rivals).find((x) => x.camp === p.id); col = rv && rv.alive ? RAMPS[rv.color][2] : null; }
      else if (S.towns[p.id].occupied || S.towns[p.id].controlled) col = g.sem.friendly;
      else { const top = Object.values(S.rivals).filter((x) => x.alive).sort((a, b) => (b.turf[p.id] || 0) - (a.turf[p.id] || 0))[0]; col = top && (top.turf[p.id] || 0) > 25 ? RAMPS[top.color][2] : RAMPS.teal[1]; }
    } else if (mode === 2 && S.heat[p.id] !== undefined) col = heatColor(S.heat[p.id], g.sem);
    else if (mode === 3 && p.kind === 'settlement') col = tradeAllowed(S, p.id) ? (priceIndex(S, p.id) > 13 ? g.sem.good : priceIndex(S, p.id) > 10 ? g.sem.warn : g.sem.bad) : RAMPS.ink[2];
    if (!col) continue;
    c.globalAlpha = 0.55;
    c.fillStyle = col;
    c.fillRect(r.x, r.y, r.w, r.h);
    c.globalAlpha = 1;
  }
}

function drawObjectives(g) {
  const ui = g.ui, S = g.S;
  const list = objectives(S);
  if (S.mission && S.mission.objective) list.unshift({ text: S.mission.objective, kind: 'mission' });
  if (!list.length) return;
  let y = 19;
  const w = 190;
  ui.rect(2, y, w, 10, 'rgba(18,15,14,0.7)');
  ui.text(S.tutorial.on && !S.tutorial.done ? `Tutorial ${S.tutorial.step + 1}/9` : 'What next?', 6, y + 1, g.sem.accent);
  y += 11;
  for (const o of list.slice(0, 4)) {
    const lines = wrapLines(o.text, w - 10);
    ui.rect(2, y, w, lines.length * 9 + 2, 'rgba(18,15,14,0.55)');
    lines.forEach((l, i) => ui.text((i === 0 ? '• ' : '  ') + l, 5, y + 1 + i * 9, o.kind === 'urgent' ? g.sem.bad : o.kind === 'tutorial' || o.kind === 'mission' ? g.sem.warn : g.sem.text));
    y += lines.length * 9 + 3;
  }
}

function wrapLines(t, w) {
  const out = [];
  let line = '';
  for (const word of t.split(' ')) { const tt = line ? line + ' ' + word : word; if (measure(tt) > w && line) { out.push(line); line = word; } else line = tt; }
  if (line) out.push(line);
  return out.slice(0, 3);
}

function drawHotbar(g) {
  const ui = g.ui, S = g.S, A = g.act, P = A.player;
  const W = ui.W, H = ui.H;
  const sw = 54, total = sw * 4 + 6;
  const x0 = Math.round(W / 2 - total / 2), y0 = H - 30;
  // HP + stamina.
  ui.bar(x0, y0 - 9, total, 6, P.hp / P.maxHp, P.hp / P.maxHp < 0.3 ? g.sem.bad : RAMPS.green[2]);
  ui.text(`${Math.ceil(P.hp)}/${P.maxHp}`, x0 + total / 2, y0 - 9, g.sem.text, { align: 'center' });
  ui.bar(x0, y0 - 3, total, 2, P.stamina, RAMPS.gold[1], K.ink[1]);
  for (let i = 0; i < 3; i++) {
    const w = P.weapons[i];
    const sel = P.wsel === i;
    const x = x0 + i * (sw + 2);
    if (ui.button('hud:slot' + i, x, y0, sw, 26, '', { active: sel, tip: w ? `${gunName(w.gun)}\nDmg ${w.st.dmg.toFixed(0)}${w.st.pellets > 1 ? 'x' + w.st.pellets : ''}  RPM ${w.st.rpm.toFixed(0)}  Acc ${w.st.acc.toFixed(0)}\nRange ${w.st.range.toFixed(0)}  Mag ${w.st.mag}  Noise ${w.st.noise.toFixed(0)}\nDurability ${Math.round(w.gun.dur)}/${w.gun.maxDur}${w.gun.unreliable ? '\n!rUnreliable: jams more' : ''}` : 'Empty slot: equip a gun in Ledger > Inventory.' }) && w) P.wsel = i;
    ui.text(String(i + 1), x + 2, y0 + 2, g.sem.textMute);
    if (!w) { ui.text('empty', x + sw / 2, y0 + 10, g.sem.textMute, { align: 'center' }); continue; }
    ui.icon(BP[w.gun.bp] ? { sidearm: 'g_sidearm', shotgun: 'g_shotgun', rifle: 'g_rifle', smg: 'g_smg', silent: 'g_silent', heavy: 'g_heavy' }[w.st.family] : 'g_sidearm', x + 6, y0 + 4);
    const reserve = A.ammoCount(w);
    ui.text(w.jammed ? 'JAM' : w.reloadT > 0 ? '...' : `${w.loaded}/${reserve}`, x + sw - 3, y0 + 16, w.jammed ? g.sem.bad : w.loaded === 0 ? g.sem.warn : g.sem.text, { align: 'right' });
    if (w.reloadT > 0) ui.bar(x + 2, y0 + 23, sw - 4, 2, 1 - w.reloadT / w.st.reload, g.sem.warn);
  }
  const tx = x0 + 3 * (sw + 2);
  const t = S.player.throwSel;
  if (ui.button('hud:throw', tx, y0, sw, 26, '', { tip: `${THROWABLES[t].name}: ${THROWABLES[t].desc}\nG to throw at the cursor, 4 to cycle.` })) { import_cycle(g); }
  ui.text('4', tx + 2, y0 + 2, g.sem.textMute);
  ui.icon(THROWABLES[t].icon, tx + 6, y0 + 8);
  ui.text(`x${count(S, t)}`, tx + sw - 3, y0 + 16, g.sem.text, { align: 'right' });
  if (P.sneaking) ui.text('SNEAKING', x0 + total / 2, y0 - 19, g.sem.friendly, { align: 'center', shadow: K.ink[0] });
  if (A.carryLoad() > 0) ui.text(`Carry ${A.carryLoad().toFixed(0)}/${A.carryCap()}`, x0 + total + 6, y0 + 16, A.carryLoad() > A.carryCap() ? g.sem.bad : g.sem.textDim);
  const hold = holds(S).length;
  if (rank(S) >= 4) ui.text(`Holds ${hold}/3`, x0 - 6, y0 + 16, g.sem.textDim, { align: 'right' });
}

function import_cycle(g) {
  const opts = Object.keys(THROWABLES);
  const S = g.S;
  S.player.throwSel = opts[(opts.indexOf(S.player.throwSel) + 1) % opts.length];
}
