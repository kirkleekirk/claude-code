// In-game HUD: minimap, compass, vitals & survival meters, hotbar, resources, crosshair,
// damage numbers, kill feed, announcements, prompts, horde warnings.
import * as THREE from 'three';
import { ITEMS, WEAPONS, AMMO, RARITY_HEX } from '../data/items.js';
import { SURF } from '../world/worldgen.js';
import { GW, GH, WORLD, POIS } from '../world/layout.js';
import { formatTime, clamp } from '../core/math.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const SLOT_ICONS = { ar: '▬', scar: '▬', smg: '▭', ssmg: '▭', pump: '═', sniper: '━', bolt: '━', pistol: '┐', spistol: '┐', revolver: '┐', crossbow: '✢', machete: '/' };

// Pre-render a stylized island map from world data
export function buildMapCanvas(world) {
  const S = 1;
  const w = Math.floor(GW / S), h = Math.floor(GH / S);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const cols = {
    [SURF.GRASS]: [118, 176, 74], [SURF.DRYGRASS]: [160, 170, 88], [SURF.FOREST]: [62, 118, 54], [SURF.DIRT]: [164, 132, 90], [SURF.SAND]: [232, 214, 160],
    [SURF.ROCK]: [146, 140, 132], [SURF.LAWN]: [128, 188, 80], [SURF.PAVE]: [110, 110, 116], [SURF.COBBLE]: [170, 158, 140], [SURF.SOIL]: [138, 104, 70],
    [SURF.WHEAT]: [226, 196, 96], [SURF.CORN]: [150, 176, 68], [SURF.PASTURE]: [132, 186, 80], [SURF.GRAVEL]: [184, 172, 150], [SURF.MUD]: [110, 96, 70],
    [SURF.SEABED]: [60, 140, 190], [SURF.DIRTROAD]: [196, 160, 110], [SURF.ASPHALT]: [70, 70, 76],
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = x * S, gz = y * S;
    const i = gz * GW + gx;
    const H = world.height[i];
    let col = cols[world.surf[i]] || [255, 0, 255];
    const hl = world.height[Math.max(0, i - GW - 1)];
    let shade = 1 + clamp((H - hl) * 0.06, -0.25, 0.25);
    if (world.isWater(gx * 4, gz * 4)) {
      const lvl = world.waterLevelAt(gx * 4, gz * 4);
      const d = clamp((lvl - H) / 20, 0, 1);
      col = [70 - d * 40, 170 - d * 70, 210 - d * 40];
      shade = 1;
    } else shade *= 0.92 + clamp(H / 90, 0, 0.25);
    const o = (y * w + x) * 4;
    img.data[o] = col[0] * shade; img.data[o + 1] = col[1] * shade; img.data[o + 2] = col[2] * shade; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const k = w / WORLD.W;
  // roads
  for (const r of world.roads) {
    ctx.strokeStyle = r.type === 'highway' ? '#f4f0e0' : r.type === 'dirt' || r.type === 'gravel' ? '#d8c09a' : '#e8e4d8';
    ctx.lineWidth = r.type === 'highway' ? 2.4 : r.type === 'dirt' ? 1 : 1.5;
    ctx.beginPath();
    for (let i = 0; i < r.n; i += 2) { const x = r.xs[i] * k, y = r.zs[i] * k; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // buildings
  ctx.fillStyle = 'rgba(250,246,236,0.95)';
  for (const b of world.buildings) {
    ctx.save(); ctx.translate(b.x * k, b.z * k); ctx.rotate(-b.rot);
    ctx.fillStyle = b.kind === 'barn' ? '#c0443a' : 'rgba(250,246,236,0.95)';
    ctx.fillRect(-b.w * k / 2, -b.d * k / 2, Math.max(1, b.w * k), Math.max(1, b.d * k));
    ctx.restore();
  }
  return c;
}

export class HUD {
  constructor(G, root) {
    this.G = G;
    this.root = el('div', '', root);
    this.root.id = 'hud';
    const r = this.root;
    this.mm = el('div', 'minimap', r); this.mmC = el('canvas', '', this.mm); this.mmC.width = 220; this.mmC.height = 220;
    this.info = el('div', 'mapinfo', r);
    this.objective = el('div', 'objective', r);
    this.compass = el('div', 'compass', r); this.compC = el('canvas', '', this.compass); this.compC.width = 560; this.compC.height = 34;
    this.hordeW = el('div', 'hordewarn hidden', r);
    this.killfeed = el('div', 'killfeed', r);
    this.vitals = el('div', 'vitals', r);
    this.classBadge = el('div', 'classbadge', this.vitals);
    this.statuses = el('div', 'statuses', this.vitals);
    this.vehEl = el('div', 'vehpanel hidden', r, '<div class="vspd"><b>0</b><small>km/h</small></div><div class="vbars"><div class="vrow"><span>⛽</span><div class="vb"><div class="fuel"></div></div></div><div class="vrow"><span>🔧</span><div class="vb"><div class="cond"></div></div></div></div><div class="vhint"></div>');
    this.arBar = el('div', 'vbar ar', this.vitals, '<div class="fill"></div><div class="num"></div>');
    this.hpBar = el('div', 'vbar hp', this.vitals, '<div class="fill"></div><div class="num"></div>');
    this.meters = el('div', 'meters', this.vitals);
    this.mFood = el('div', 'meter', this.meters, '<span class="ic">🍖</span><div class="mb"><div style="background:#f0a040"></div></div>');
    this.mWater = el('div', 'meter', this.meters, '<span class="ic">💧</span><div class="mb"><div style="background:#5ac8f0"></div></div>');
    this.mStam = el('div', 'meter', this.meters, '<span class="ic">⚡</span><div class="mb"><div style="background:#f0e060"></div></div>');
    this.hotbar = el('div', 'hotbar', r);
    this.slots = [];
    for (let i = 0; i < 6; i++) {
      const s = el('div', 'hslot', this.hotbar, `<span class="key">${i + 1}</span><span class="ico"></span><span class="cnt"></span><span class="lbl"></span>`);
      // tap a slot to equip it (touch) / click (desktop when unlocked)
      const pick = (e) => { e.preventDefault(); e.stopPropagation(); const P = this.G.player; if (P && P.alive && !P.buildMode) P.equip(i); };
      s.addEventListener('touchstart', pick, { passive: false });
      s.addEventListener('mousedown', (e) => { if (!this.G.input.locked) pick(e); });
      this.slots.push(s);
    }
    this.res = el('div', 'resources', r);
    this.buildbar = el('div', 'buildbar hidden', this.res);
    const svg = { wall: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" fill="none" stroke="#fff" stroke-width="2"/></svg>', floor: '<svg viewBox="0 0 24 24"><path d="M2 16 L12 10 L22 16 L12 22 Z" fill="none" stroke="#fff" stroke-width="2"/></svg>', ramp: '<svg viewBox="0 0 24 24"><path d="M3 20 L21 6 L21 20 Z" fill="none" stroke="#fff" stroke-width="2"/></svg>', cone: '<svg viewBox="0 0 24 24"><path d="M3 18 L12 6 L21 18 Z" fill="none" stroke="#fff" stroke-width="2"/></svg>' };
    this.bpieces = {};
    const keys = { wall: 'Z', floor: 'X', ramp: 'V', cone: 'F' };
    for (const p of ['wall', 'floor', 'ramp', 'cone']) this.bpieces[p] = el('div', 'bpiece', this.buildbar, svg[p] + `<span>${keys[p]}</span>`);
    this.ammo = el('div', 'ammo', this.res);
    this.matsEl = el('div', 'mats', this.res);
    this.matEls = {};
    for (const [m, c] of [['wood', '#c08a54'], ['stone', '#a8a39a'], ['metal', '#9aa2aa']]) this.matEls[m] = el('div', 'mat', this.matsEl, `<i style="background:${c}"></i><span>0</span>`);
    this.cross = el('div', 'crosshair', r);
    this.crossLines = [];
    for (let i = 0; i < 4; i++) this.crossLines.push(el('i', '', this.cross));
    el('i', 'dot', this.cross);
    this.hitmark = el('div', 'hitmark', r);
    for (let i = 0; i < 4; i++) { const l = el('i', '', this.hitmark); const a = (i / 4) * Math.PI * 2 + Math.PI / 4; l.style.left = 15 + Math.cos(a) * 9 - 5 + 'px'; l.style.top = 15 + Math.sin(a) * 9 - 1 + 'px'; l.style.transform = `rotate(${a}rad)`; }
    this.prompt = el('div', 'prompt hidden', r);
    this.hold = el('div', 'holdring hidden', r, '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="7"/><circle class="arc" cx="32" cy="32" r="26" fill="none" stroke="#ffd23f" stroke-width="7" stroke-dasharray="163.4" stroke-dashoffset="163.4" transform="rotate(-90 32 32)"/></svg>');
    this.announceEl = el('div', 'announce', r); this.announceEl.style.opacity = 0;
    this.toastEl = el('div', 'toast', r); this.toastEl.style.opacity = 0;
    this.hintEl = el('div', 'hint hidden', r);
    this.pickupsEl = el('div', 'pickups', r);
    this.dmgDir = el('canvas', 'dmgdir', r); this.dmgDir.width = 260; this.dmgDir.height = 260;
    this.fpsEl = el('div', 'fps hidden', r);
    this.scopeEl = el('div', 'scope hidden', r);
    this.numbers = [];
    this.dmgDirs = [];
    this.annT = 0; this.toastT = 0; this.hintT = 0; this.hitT = 0;
    this.mapCanvas = null;
    this.v3 = new THREE.Vector3();
  }
  setMap(c) { this.mapCanvas = c; }
  show(v) { this.root.classList.toggle('hidden', !v); }

  // ---------- events ----------
  announce(text, color = 'yellow', dur = 4) { this.announceEl.textContent = text; this.announceEl.className = 'announce ' + color; this.announceEl.style.opacity = 1; this.annT = dur; }
  toast(isPlayer, text) { if (isPlayer === false) return; this.toastEl.textContent = text; this.toastEl.style.opacity = 1; this.toastT = 2.4; }
  toastNear(pos, text) { const p = this.G.player; if (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < 120) this.toast(true, text); }
  hint(text, dur = 7) { this.hintEl.textContent = text; this.hintEl.classList.remove('hidden'); this.hintT = dur; }
  setObjective(text) { this.objText = text; }
  killfeedSystem(msg) { this.kf(msg, true); }
  kf(html, sys = false) {
    const e = el('div', 'kf' + (sys ? ' sys' : ''), this.killfeed, html);
    setTimeout(() => e.remove(), sys ? 9000 : 7000);
    while (this.killfeed.children.length > 7) this.killfeed.firstChild.remove();
  }
  kill(victim, killer, opts) {
    const name = (s) => s ? `<span class="${s.isPlayer ? 'me' : ''}">${s.name}</span>` : '';
    let msg;
    if (killer && killer !== victim) msg = `${name(killer)} eliminated ${name(victim)}${opts?.head ? ' 🎯' : ''}`;
    else if (opts?.type === 'zombie') msg = `${name(victim)} was overrun by the dead`;
    else if (opts?.type === 'fall') msg = `${name(victim)} fell to their death`;
    else if (opts?.type === 'starve') msg = `${name(victim)} didn't make it`;
    else if (opts?.type === 'bleed') msg = `${name(victim)} bled out`;
    else if (opts?.type === 'left') msg = `${name(victim)} was left behind`;
    else if (opts?.type === 'fire') msg = `${name(victim)} burned`;
    else msg = `${name(victim)} was eliminated`;
    this.kf(msg);
    if (killer && killer.isPlayer && victim !== killer) { this.announce(`ELIMINATED ${victim.name}`, 'yellow', 2); this.G.audio?.play('kill', null, { vol: 0.6, bus: 'ui' }); }
  }
  hit(x, y, z, dmg, head, armor) {
    this.hitT = 0.18;
    this.hitmark.style.opacity = 1;
    this.hitmark.querySelectorAll('i').forEach((i) => (i.style.background = head ? '#ffd23f' : '#fff'));
    this.G.audio?.play(head ? 'headshot' : 'hitmarker', null, { vol: 0.5, bus: 'ui' });
    let n = this.numbers.find((d) => d.t <= 0);
    if (!n) { if (this.numbers.length > 24) return; n = { e: el('div', 'dmgnum', this.root), t: 0 }; this.numbers.push(n); }
    n.e.className = 'dmgnum' + (head ? ' head' : armor ? ' armor' : '');
    n.e.textContent = dmg;
    n.pos = new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, y + 0.3, z + (Math.random() - 0.5) * 0.4);
    n.t = 1.0;
    n.e.style.display = 'block';
  }
  zombieKill(head) { if (head) this.toast(true, 'Headshot!'); }
  damageFrom(pos) { this.dmgDirs.push({ x: pos.x, z: pos.z, t: 1.2 }); this.flashDamage = 0.5; }
  pickup(id, n, r) {
    const def = ITEMS[id];
    const name = AMMO[id] ? AMMO[id].name : def ? def.name : id[0].toUpperCase() + id.slice(1);
    const e = el('div', 'pk', this.pickupsEl, `+${n} ${name}`);
    e.style.borderRightColor = def?.type === 'weapon' ? RARITY_HEX[r] : def?.type === 'valuable' ? '#f0a020' : '#fff';
    setTimeout(() => e.remove(), 2600);
    while (this.pickupsEl.children.length > 5) this.pickupsEl.firstChild.remove();
  }
  matGain(m, n) { this.pickup(m, n, 0); }

  // ---------- per frame ----------
  update(dt) {
    const G = this.G, P = G.player;
    this.annT -= dt; if (this.annT <= 0) this.announceEl.style.opacity = 0;
    this.toastT -= dt; if (this.toastT <= 0) this.toastEl.style.opacity = 0;
    this.hintT -= dt; if (this.hintT <= 0) this.hintEl.classList.add('hidden');
    this.hitT -= dt; if (this.hitT <= 0) this.hitmark.style.opacity = 0;
    const onFoot = P.mode === 'ground' || P.mode === 'vault';
    if (this._cls !== P.cls) { this._cls = P.cls; this.classBadge.innerHTML = `<span style="color:${P.cls.color}">${P.cls.icon}</span> ${P.cls.name}`; }
    // vitals
    const hp = Math.ceil(P.health), ar = Math.ceil(P.armor);
    this.hpBar.querySelector('.fill').style.width = (P.health / P.maxHealth) * 100 + '%';
    this.hpBar.querySelector('.num').textContent = hp;
    this.hpBar.classList.toggle('low', P.hpFrac < 0.3);
    this.arBar.querySelector('.fill').style.width = ar + '%';
    this.arBar.querySelector('.num').textContent = ar;
    this.arBar.style.display = ar > 0 ? '' : 'none';
    const setM = (m, v) => { m.querySelector('.mb > div').style.width = clamp(v, 0, 100) + '%'; m.classList.toggle('warn', v < 15); };
    setM(this.mFood, P.hunger); setM(this.mWater, P.thirst); setM(this.mStam, P.stamina);
    let st = '';
    if (P.bleed) st += `<span class="status">🩸 ${P.bleed === 2 ? 'Heavy ' : ''}Bleeding</span>`;
    if (P.fracture) st += `<span class="status ${P.painkill > 0 ? 'warn' : ''}">🦴 Fracture${P.painkill > 0 ? ' (numbed)' : ''}</span>`;
    if (P.infection > 0) st += `<span class="status">☣ Infected ${Math.floor(P.infection)}%</span>`;
    if (P.sick > 0) st += `<span class="status warn">🤢 Sick</span>`;
    if (P.hunger < 15) st += `<span class="status warn">Starving</span>`;
    if (P.thirst < 15) st += `<span class="status warn">Dehydrated</span>`;
    if (P.boost > 0) st += `<span class="status good">⚡ Energized</span>`;

    if (this._st !== st) { this.statuses.innerHTML = st; this._st = st; }
    // hotbar
    for (let i = 0; i < 6; i++) {
      const s = this.slots[i];
      const item = i === 0 ? null : P.inv.slots[i - 1];
      s.classList.toggle('active', P.inv.active === i && !P.buildMode);
      let ico = '', cnt = '', lbl = '', bg = 'rgba(0,0,0,.45)';
      if (i === 0) { ico = '⛏'; lbl = 'Harvest Tool'; }
      else if (item) {
        const def = ITEMS[item.id];
        if (def.type === 'weapon') { ico = `<span style="font-size:13px">${def.slotIcon}</span>`; cnt = def.melee ? '' : item.mag; bg = `linear-gradient(180deg, ${RARITY_HEX[item.r]}cc, ${RARITY_HEX[item.r]}55)`; }
        else { ico = `<span style="color:${def.color}">${def.icon}</span>`; cnt = item.n > 1 ? item.n : ''; if (def.type === 'valuable') bg = 'linear-gradient(180deg,#f0a020aa,#f0a02040)'; }
        lbl = def.name;
      }
      const key = ico + cnt + lbl + bg;
      if (s._k !== key) { s._k = key; s.querySelector('.ico').innerHTML = ico; s.querySelector('.cnt').textContent = cnt; s.querySelector('.lbl').textContent = lbl; s.style.background = bg; }
    }
    this.hotbar.classList.toggle('hidden', !onFoot);
    // vehicle panel
    const v = P.vehicle;
    this.vehEl.classList.toggle('hidden', !v);
    if (v) {
      this.vehEl.querySelector('.vspd b').textContent = Math.round(Math.abs(v.speed) * 3.6);
      const fuel = this.vehEl.querySelector('.fuel'), cond = this.vehEl.querySelector('.cond');
      fuel.style.width = v.fuel * 100 + '%'; fuel.style.background = v.fuel < 0.15 ? '#ff5a4a' : '#f0c040';
      cond.style.width = v.hp * 100 + '%'; cond.style.background = v.hp < 0.3 ? '#ff5a4a' : v.hp < 0.6 ? '#f0a020' : '#7fd85a';
      const hint = this.G.touchMode ? 'USE exit · JUMP brake · HEAL horn' : `${this.G.input.keyName('interact')} exit · Space brake · H horn · L lights`;
      const k = (v.engineOn ? '' : 'ENGINE OFF · ') + hint;
      if (this._vh !== k) { this._vh = k; this.vehEl.querySelector('.vhint').textContent = k; }
    }
    // resources
    for (const m of ['wood', 'stone', 'metal']) { const e = this.matEls[m]; e.querySelector('span').textContent = P.inv.mats[m]; e.classList.toggle('sel', P.buildMode && P.buildMat === m); }
    this.buildbar.classList.toggle('hidden', !P.buildMode);
    for (const p in this.bpieces) this.bpieces[p].classList.toggle('sel', P.buildPiece === p);
    const w = P.activeWeapon();
    const wdef = w && WEAPONS[w.id];
    this.ammo.innerHTML = wdef && !wdef.melee && !P.buildMode ? `${w.mag}<small> / ${P.inv.ammo[wdef.ammo]}</small>${P.ws.reload > 0 ? ' <small style="color:#ffd23f">RELOADING</small>' : ''}` : '';
    this.res.classList.toggle('hidden', !onFoot);
    if (this.G.touch) this.G.touch.setMode(v ? 'drive' : 'foot');
    // crosshair
    const spread = wdef && !wdef.melee ? ((P.ads ? wdef.adsSpread : wdef.spread) + P.ws.bloom) * (Math.hypot(P.vel.x, P.vel.z) > 1 ? 1.5 : 1) * (P.onGround ? 1 : 2) : 0.01;
    const px = clamp(spread * window.innerHeight * 0.9, 4, 80);
    const L = [[-1, -px - 8, 2, 8], [-1, px, 2, 8], [-px - 8, -1, 8, 2], [px, -1, 8, 2]];
    this.crossLines.forEach((l, i) => { const q = L[i]; l.style.left = q[0] + 'px'; l.style.top = q[1] + 'px'; l.style.width = q[2] + 'px'; l.style.height = q[3] + 'px'; });
    this.cross.classList.toggle('hidden', !onFoot || P.scoped);
    this.scopeEl.classList.toggle('hidden', !P.scoped);
    // prompt / hold ring
    const boarding = G.match?.checkBoarding(P);
    const it = boarding ? { prompt: boarding === 'boat' ? 'Board THE MAGNOLIA' : 'Board the HELICOPTER', hold: 2 } : P.interaction;
    if (onFoot && it && !G.ui.isOpen()) { this.prompt.innerHTML = `<kbd>${G.touchMode ? '✋' : G.input.keyName('interact')}</kbd> ${it.hold ? 'Hold to ' : ''}${it.prompt}`; this.prompt.classList.remove('hidden'); }
    else this.prompt.classList.add('hidden');
    if (P.action && P.action.dur > 0.2) {
      this.hold.classList.remove('hidden');
      this.hold.querySelector('.arc').setAttribute('stroke-dashoffset', 163.4 * (1 - clamp(P.action.t / P.action.dur, 0, 1)));
    } else this.hold.classList.add('hidden');
    // horde warning
    const z = G.hordes.zoneAt(P.pos.x, P.pos.z);
    if (z.horde && z.edge < 0) { this.hordeW.className = 'hordewarn inside'; this.hordeW.textContent = '☠ INSIDE THE HORDE — GET OUT'; }
    else if (z.horde && z.edge < 120) { this.hordeW.className = 'hordewarn'; this.hordeW.textContent = `Horde ${Math.round(z.edge)}m`; }
    else this.hordeW.className = 'hordewarn hidden';
    if (P.mode === 'plane' || P.mode === 'skydive' || P.mode === 'glide') this.hordeW.classList.add('hidden');
    // info row
    const alive = G.match.aliveCount;
    const hour = G.dayNight.hour;
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    const icon = G.dayNight.isNight ? '☾' : '☀';
    const infoK = `${alive}|${P.stats.kills}|${P.stats.zombieKills}|${hh}:${mm}`;
    if (this._info !== infoK) { this._info = infoK; this.info.innerHTML = `<span>👤 ${alive}</span><span>✖ ${P.stats.kills}</span><span>☠ ${P.stats.zombieKills}</span><span>${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span>`; }
    const ot = G.match.objectiveText();
    const objHtml = `${ot ? `<b>${ot}</b><br>` : ''}${this.objText || ''}`;
    if (this._obj !== objHtml) { this._obj = objHtml; this.objective.innerHTML = objHtml; }
    // damage numbers
    const cam = G.camera;
    for (const n of this.numbers) {
      if (n.t <= 0) continue;
      n.t -= dt;
      n.pos.y += dt * 0.8;
      this.v3.copy(n.pos).project(cam);
      if (n.t <= 0 || this.v3.z > 1) { n.e.style.display = 'none'; continue; }
      n.e.style.left = (this.v3.x * 0.5 + 0.5) * window.innerWidth + 'px';
      n.e.style.top = (-this.v3.y * 0.5 + 0.5) * window.innerHeight + 'px';
      n.e.style.opacity = Math.min(1, n.t * 2.5);
      n.e.style.transform = `translate(-50%,-50%) scale(${1 + Math.max(0, n.t - 0.8) * 2})`;
    }
    this.drawDamageDirs(dt);
    this.drawMinimap();
    this.drawCompass();
    if (G.settings?.showFps) { this.fpsEl.classList.remove('hidden'); this.fpsEl.textContent = `${G.fps.toFixed(0)} fps · ${G.renderer.info.render.calls} calls · ${(G.renderer.info.render.triangles / 1000).toFixed(0)}k tris · Z ${G.zombies.count}`; }
    else this.fpsEl.classList.add('hidden');
  }
  drawDamageDirs(dt) {
    const c = this.dmgDir.getContext('2d');
    c.clearRect(0, 0, 260, 260);
    const P = this.G.player;
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const d = this.dmgDirs[i];
      d.t -= dt;
      if (d.t <= 0) { this.dmgDirs.splice(i, 1); continue; }
      const ang = Math.atan2(d.x - P.pos.x, d.z - P.pos.z);
      const rel = -(ang - (P.camYaw + Math.PI)) - Math.PI / 2;
      c.strokeStyle = `rgba(255,40,40,${Math.min(0.85, d.t)})`;
      c.lineWidth = 10;
      c.beginPath(); c.arc(130, 130, 110, rel - 0.35, rel + 0.35); c.stroke();
    }
  }
  drawMinimap() {
    const G = this.G, P = G.player;
    const c = this.mmC.getContext('2d');
    const S = 220;
    c.fillStyle = '#2a6a90'; c.fillRect(0, 0, S, S);
    if (!this.mapCanvas) return;
    const mk = this.mapCanvas.width / WORLD.W;
    const range = P.mode === 'ground' || P.mode === 'vault' ? 380 : 900; // meters across
    const scale = S / range;
    c.save();
    c.translate(S / 2, S / 2);
    c.scale(scale / mk, scale / mk);
    c.translate(-P.pos.x * mk, -P.pos.z * mk);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.mapCanvas, 0, 0);
    c.restore();
    // hordes
    const toS = (x, z) => [S / 2 + (x - P.pos.x) * scale, S / 2 + (z - P.pos.z) * scale];
    for (const h of G.hordes.list) {
      const [x, y] = toS(h.x, h.z);
      c.fillStyle = 'rgba(80,200,40,0.28)'; c.strokeStyle = 'rgba(160,255,80,0.9)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, h.r * scale, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    this.drawMarkers(c, toS, 1);
    // nearby vehicles
    if (G.rides) for (const v of G.rides.list) {
      if (v.driver || v.wrecked) continue;
      if (Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z) > 130) continue;
      const [vx, vy] = toS(v.pos.x, v.pos.z);
      c.fillStyle = v.fuel > 0 && v.hp >= 0.15 ? '#f0c040' : '#a08a5a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.rect(vx - 4, vy - 3, 8, 6); c.fill(); c.stroke();
    }
    // player arrow
    c.save(); c.translate(S / 2, S / 2); c.rotate(-P.camYaw + Math.PI);
    c.fillStyle = '#ffd23f'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, 9); c.lineTo(6, -6); c.lineTo(0, -3); c.lineTo(-6, -6); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  drawMarkers(c, toS, sz) {
    const G = this.G, M = G.match;
    const dot = (x, z, color, label, r = 6) => { const [sx, sy] = toS(x, z); c.fillStyle = color; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, r * sz, 0, Math.PI * 2); c.fill(); c.stroke(); if (label) { c.font = `${11 * sz}px Rubik, sans-serif`; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 3; c.strokeText(label, sx + 8 * sz, sy + 4 * sz); c.fillText(label, sx + 8 * sz, sy + 4 * sz); } };
    if (M.boat && (M.boatState === 'inbound' || M.boatState === 'docked')) dot(M.dock.x, M.dock.z, '#ffd23f', 'Riverboat', 7);
    if (M.heli && M.heliState !== 'gone') dot(M.lz.x, M.lz.z, '#ff4d4d', 'Evac', 7);
    for (const a of M.airdrops) if (!a.landed || G.inter.crates.find((cc) => cc.kind === 'airdrop' && !cc.opened && cc.x === a.x)) dot(a.x, a.z, '#4fb3ff', 'Drop', 5);
    if (M.plane) { const [x0, y0] = toS(M.plane.from.x, M.plane.from.z), [x1, y1] = toS(M.plane.to.x, M.plane.to.z); c.strokeStyle = 'rgba(255,255,255,.7)'; c.setLineDash([6, 6]); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]); dot(M.plane.pos.x, M.plane.pos.z, '#fff', null, 4); }
    if (G.player.marker) dot(G.player.marker.x, G.player.marker.z, '#ff8a3a', 'Marker', 5);
  }
  drawCompass() {
    const G = this.G, P = G.player;
    const c = this.compC.getContext('2d');
    const W = 560, H = 34;
    c.clearRect(0, 0, W, H);
    const yaw = P.camYaw; // facing = -z rotated
    const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360; // 0 = north (-z)
    c.font = '15px "Lilita One", sans-serif'; c.textAlign = 'center';
    for (let deg = Math.ceil((heading - 90) / 5) * 5; deg <= heading + 90; deg += 5) {
      const d = ((deg % 360) + 360) % 360;
      const x = W / 2 + (deg - heading) * (W / 180);
      if (d % 45 === 0) {
        const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d];
        c.fillStyle = d % 90 === 0 ? '#ffd23f' : '#fff'; c.fillText(lbl, x, 22);
      } else if (d % 15 === 0) { c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(x - 1, 8, 2, 10); c.font = '10px Rubik'; c.fillText(d, x, 31); c.font = '15px "Lilita One", sans-serif'; }
      else { c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x - 0.5, 12, 1, 6); }
    }
    const markerAt = (x, z, color) => {
      const ang = Math.atan2(x - P.pos.x, -(z - P.pos.z)) * 180 / Math.PI;
      let rel = ((ang - heading + 540) % 360) - 180;
      if (Math.abs(rel) > 90) rel = Math.sign(rel) * 90;
      const sx = W / 2 + rel * (W / 180);
      c.fillStyle = color; c.beginPath(); c.moveTo(sx, 2); c.lineTo(sx - 6, 10); c.lineTo(sx + 6, 10); c.fill();
    };
    const M = G.match;
    if (M.boat && (M.boatState === 'inbound' || M.boatState === 'docked')) markerAt(M.dock.x, M.dock.z, '#ffd23f');
    if (M.heli && M.heliState !== 'gone') markerAt(M.lz.x, M.lz.z, '#ff4d4d');
    if (P.marker) markerAt(P.marker.x, P.marker.z, '#ff8a3a');
    c.fillStyle = '#fff'; c.fillRect(W / 2 - 1, 0, 2, 6);
  }
}
export { POIS };
