/* The in-trip HUD: portraits, blizzard, minimap, ability bar, prompts, damage numbers, pause & inventory. */
(function () {
  'use strict';
  const D = AE.data;
  const U = AE.U;
  const esc = U.esc;
  const icon = AE.icon;
  const GF = AE.game.gfx;
  const HUD = {};
  let root = null, els = {}, popups = [], lastBar = '', mmT = 0, notesT = 0;

  const FACE = {
    finn: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="22" r="15" fill="#fff" stroke="#1d2340" stroke-width="2.5"/><circle cx="9" cy="8" r="4" fill="#fff" stroke="#1d2340" stroke-width="2.5"/><circle cx="31" cy="8" r="4" fill="#fff" stroke="#1d2340" stroke-width="2.5"/><ellipse cx="20" cy="24" rx="10.5" ry="9" fill="#ffd9c2"/><circle cx="16" cy="23" r="1.6" fill="#1d2340"/><circle cx="24" cy="23" r="1.6" fill="#1d2340"/><path d="M17 28q3 2.5 6 0" stroke="#1d2340" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
    jake: '<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="7" cy="20" rx="4" ry="9" fill="#dd931c" stroke="#1d2340" stroke-width="2.2"/><ellipse cx="33" cy="20" rx="4" ry="9" fill="#dd931c" stroke="#1d2340" stroke-width="2.2"/><circle cx="20" cy="20" r="14" fill="#f6b42a" stroke="#1d2340" stroke-width="2.5"/><circle cx="15" cy="17" r="3.4" fill="#fff" stroke="#1d2340" stroke-width="1.5"/><circle cx="25" cy="17" r="3.4" fill="#fff" stroke="#1d2340" stroke-width="1.5"/><circle cx="15" cy="17.5" r="1.6" fill="#1d2340"/><circle cx="25" cy="17.5" r="1.6" fill="#1d2340"/><ellipse cx="16" cy="26" rx="4" ry="3" fill="#fcd371"/><ellipse cx="24" cy="26" rx="4" ry="3" fill="#fcd371"/><ellipse cx="20" cy="23" rx="2.4" ry="1.6" fill="#1d2340"/></svg>',
  };
  HUD.face = (id) => FACE[id];

  HUD.show = function (run) {
    root = document.getElementById('hud');
    root.hidden = false;
    root.innerHTML = `
      <div class="hud-top">
        <div class="hcards">${['finn', 'jake'].map((id) => `<div class="hcard ${id}" data-hero="${id}"><span class="face">${FACE[id]}</span><div class="hinfo"><span class="hname">${id === 'finn' ? 'Finn' : 'Jake'}</span><div class="hbar"><i></i><b class="shield"></b></div><span class="hpnum num"></span></div><span class="ko">KO</span></div>`).join('')}</div>
        <div class="trip"><div class="tripline"><b class="route"></b><span class="carname"></span></div><div class="bliz" title="When the blizzard meter fills, the train freezes over"><span class="bl">${icon('snow')}</span><div class="bbar"><i></i></div><span class="bpct num"></span></div></div>
        <canvas class="minimap" width="300" height="56" aria-label="Train map"></canvas>
        <button type="button" class="hbtn pausebtn" data-hud="pause" aria-label="Pause">${icon('pause')}</button>
      </div>
      <div class="hud-bottom">
        <div class="belt"></div>
        <div class="abar"></div>
        <div class="pack"><span class="bp" title="Backpack — lost if you wipe">${icon('bag')}<b class="num"></b></span><span class="gd" title="Gold you're carrying">${icon('coin')}<b class="num"></b></span><span class="tm" title="Jake's Tummy — survives a wipe">${icon('tummy')}<b class="num"></b></span><button type="button" class="hbtn" data-hud="inventory" aria-label="Inventory">${icon('bag')}<span>Inventory <kbd>I</kbd></span></button></div>
      </div>
      <div class="prompt" hidden><svg viewBox="0 0 36 36" class="pring"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg"/></svg><span class="ptext"></span><kbd>E</kbd></div>
      <div class="banners"></div>
      <div class="feed"></div>
      <div class="note" hidden></div>
      <div class="vignette"></div>
      <div class="overlay" hidden></div>`;
    els = {
      cards: { finn: root.querySelector('.hcard.finn'), jake: root.querySelector('.hcard.jake') },
      route: root.querySelector('.route'), carname: root.querySelector('.carname'), bbar: root.querySelector('.bbar i'), bpct: root.querySelector('.bpct'), bliz: root.querySelector('.bliz'),
      mm: root.querySelector('.minimap'), belt: root.querySelector('.belt'), abar: root.querySelector('.abar'), bp: root.querySelector('.bp b'), gd: root.querySelector('.gd b'), tm: root.querySelector('.tm b'),
      prompt: root.querySelector('.prompt'), ptext: root.querySelector('.ptext'), pfg: root.querySelector('.pring .fg'), banners: root.querySelector('.banners'), feed: root.querySelector('.feed'),
      note: root.querySelector('.note'), overlay: root.querySelector('.overlay'), vignette: root.querySelector('.vignette'),
    };
    els.route.textContent = run.train.route.name;
    lastBar = '';
    beltKey = '';
    root.onclick = (e) => {
      const b = e.target.closest('[data-hud]');
      if (!b) return;
      const a = b.dataset.hud;
      if (a === 'pause') HUD.togglePause(run);
      else if (a === 'inventory') HUD.toggleInventory(run);
      else if (a === 'resume') { run.paused = false; els.overlay.hidden = true; }
      else if (a === 'abandon') { if (b.dataset.confirm) { AE.game.raid.abandon(); els.overlay.hidden = true; } else { b.dataset.confirm = '1'; b.textContent = 'Tap again: you lose your backpack and gear'; } }
      else if (a === 'mute') { const m = AE.sfx.toggleMute(); b.innerHTML = `${icon(m ? 'mute' : 'volume')} Sound ${m ? 'off' : 'on'}`; }
      else if (a === 'drop') { AE.game.raid.dropFromPack(b.dataset.uid); HUD.renderInventory(run); }
      else if (a === 'totummy') { const r = AE.game.raid.packToTummy(b.dataset.uid); if (r === 'full') HUD.note('Jake’s tummy is full.'); HUD.renderInventory(run); }
      else if (a === 'topack') { const r = AE.game.raid.tummyToPack(b.dataset.uid); if (r === 'full') HUD.note('Your backpack is full.'); HUD.renderInventory(run); }
      else if (a === 'belt') AE.game.combat.useBelt(run, +b.dataset.i);
      else if (a === 'useb') { AE.game.combat.useBelt(run, +b.dataset.i); HUD.renderInventory(run); }
    };
    AE.game.input.showTouch(true);
  };
  HUD.hide = function () {
    if (root) { root.hidden = true; root.innerHTML = ''; root.onclick = null; }
    for (const p of popups) p.el.remove();
    popups = [];
    AE.game.input.showTouch(false);
  };
  HUD.refresh = function () { lastBar = ''; };

  HUD.popup = function (x, y, z, text, cls) {
    const layer = document.getElementById('dmg-layer');
    if (!layer || popups.length > 60) return;
    const el = document.createElement('div');
    el.className = 'pop ' + (cls || '');
    el.textContent = text;
    layer.appendChild(el);
    popups.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z, t: 0, dur: cls === 'crit' || cls === 'r3' || cls === 'r4' || cls === 'r5' ? 1.1 : 0.8 });
  };
  HUD.banner = function (text, cls) {
    if (!els.banners) return;
    const el = document.createElement('div');
    el.className = 'bnr ' + (cls || '');
    el.textContent = text;
    els.banners.appendChild(el);
    setTimeout(() => el.remove(), cls === 'route' ? 2600 : 2200);
    while (els.banners.children.length > 3) els.banners.firstChild.remove();
  };
  HUD.note = function (text, secs) { if (!els.note) return; els.note.textContent = text; els.note.hidden = false; notesT = secs || 2.5; };
  HUD.carName = function (car) { if (els.carname) els.carname.textContent = ''; };
  HUD.loot = function (it) {
    if (!els.feed) return;
    const el = document.createElement('div');
    el.className = 'fi r' + it.rarity;
    el.innerHTML = `${icon(AE.meta.loot.iconOf(it))}<span>${esc(it.name)}${it.qty > 1 ? ' ×' + it.qty : ''}</span>`;
    els.feed.appendChild(el);
    setTimeout(() => el.remove(), 3200);
    while (els.feed.children.length > 5) els.feed.firstChild.remove();
  };

  function abilityBar(run) {
    const h = run.heroes[run.active];
    const bar = run.G.bars[h.id];
    const slots = AE.meta.abilitySlots(run.G);
    const cells = [];
    cells.push(`<div class="ab atk"><span class="k">${AE.game.input.touch ? '' : 'Click'}</span>${icon(h.id === 'finn' ? 'sword' : 'fist')}<span class="n">Attack</span></div>`);
    cells.push(`<div class="ab" data-cd="dash"><span class="k">Space</span>${icon('dash')}<span class="n">${h.id === 'finn' ? 'Roll' : 'Stretch'}</span><i class="cd"></i></div>`);
    for (let i = 0; i < slots; i++) {
      const id = bar[i];
      const ab = id && D.ABILITIES[id];
      cells.push(ab ? `<div class="ab" data-cd="${id}" title="${esc(ab.name + ': ' + ab.desc)}"><span class="k">${i + 1}</span>${icon(ab.icon)}<span class="n">${esc(ab.name)}</span><i class="cd"></i></div>` : `<div class="ab empty"><span class="k">${i + 1}</span><span class="n">Empty</span></div>`);
    }
    cells.push(`<div class="ab" data-cd="switch"><span class="k">Q</span>${icon('swap')}<span class="n">Tag ${h.id === 'finn' ? 'Jake' : 'Finn'}</span><i class="cd"></i></div>`);
    cells.push(`<div class="ab sup"><span class="k">R</span>${icon('star')}<span class="n">Mathematical!</span><i class="meter"></i></div>`);
    els.abar.innerHTML = cells.join('');
    els.abarCells = Array.from(els.abar.querySelectorAll('[data-cd]'));
    els.meter = els.abar.querySelector('.sup .meter');
    els.sup = els.abar.querySelector('.sup');
  }
  let beltKey = '';
  function beltBar(run) {
    const k = run.G.belt.map((b) => (b ? b.base + b.qty : '-')).join('|');
    if (k === beltKey) return;
    beltKey = k;
    els.belt.innerHTML = run.G.belt.map((b, i) => b ? `<button type="button" class="bslot" data-hud="belt" data-i="${i}" title="${esc(b.name)}" aria-label="Use ${esc(b.name)}"><span class="k">${i + 4}</span>${icon(D.CONSUMABLES[b.base].icon)}<b>${b.qty}</b></button>` : `<div class="bslot empty"><span class="k">${i + 4}</span></div>`).join('');
  }

  HUD.update = function (run, dt) {
    if (!root) return;
    const T = run.S.team;
    for (const id of ['finn', 'jake']) {
      const h = run.heroes[id], c = els.cards[id];
      c.classList.toggle('active', run.active === id);
      c.classList.toggle('down', h.ko);
      c.querySelector('.hbar i').style.width = U.clamp((h.hp / h.maxHp) * 100, 0, 100) + '%';
      const sh = h.buffs.shield ? U.clamp((h.buffs.shield.hp / h.maxHp) * 100, 0, 100) : 0;
      c.querySelector('.hbar .shield').style.width = sh + '%';
      c.querySelector('.hpnum').textContent = h.ko ? (T.autoRevive ? `up in ${Math.max(0, Math.ceil(12 - h.koT))}s` : 'knocked out') : `${Math.ceil(h.hp)} / ${h.maxHp}`;
    }
    const car = run.train.cars[run.carIdx];
    els.carname.textContent = ` · Car ${run.carIdx + 1}/${run.train.cars.length}: ${car ? car.name : ''}`;
    const bz = run.whiteout != null ? 1 : run.blizzard;
    els.bbar.style.width = bz * 100 + '%';
    els.bpct.textContent = run.whiteout != null ? `WHITEOUT ${Math.max(0, Math.ceil(run.whiteout))}s` : Math.floor(run.blizzard * 100) + '%';
    els.bliz.classList.toggle('hot', bz > 0.75);
    els.vignette.style.opacity = run.whiteout != null ? 0.85 : Math.max(0, (run.blizzard - 0.6) * 1.6);
    const h = run.heroes[run.active];
    const key = h.id + '|' + run.G.bars[h.id].join(',') + '|' + AE.meta.abilitySlots(run.G);
    if (key !== lastBar) { lastBar = key; abilityBar(run); }
    for (const cell of els.abarCells) {
      const k = cell.dataset.cd;
      let f = 0;
      if (k === 'dash') f = h.dashCd / (h.S.dashCdFinal || 1);
      else if (k === 'switch') f = run.switchCd / 2;
      else { const ab = D.ABILITIES[k]; f = (h.cds[k] || 0) / (ab.cd * (1 - h.S.cdr)); }
      cell.style.setProperty('--cd', U.clamp(f, 0, 1));
      cell.classList.toggle('ready', f <= 0);
    }
    els.meter.style.height = run.meter + '%';
    els.sup.classList.toggle('full', run.meter >= 100);
    beltBar(run);
    els.bp.textContent = `${run.backpack.length}/${T.backpack}`;
    els.gd.textContent = U.fmt(run.gold);
    els.tm.textContent = `${run.G.tummy.length}/${T.tummy}`;
    const I = run.interact;
    if (I.target) {
      els.prompt.hidden = false;
      els.ptext.textContent = I.target.label || '';
      els.pfg.style.strokeDashoffset = String(94.2 * (1 - U.clamp(I.p / I.target.time, 0, 1)));
    } else els.prompt.hidden = true;
    if (notesT > 0 && (notesT -= dt) <= 0) els.note.hidden = true;
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.t += dt;
      const s = GF.toScreen(p.x, p.y + p.t * 1.2, p.z);
      p.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${p.t < 0.1 ? 0.6 + p.t * 4 : 1})`;
      p.el.style.opacity = String(1 - Math.max(0, (p.t - p.dur * 0.6) / (p.dur * 0.4)));
      if (p.t >= p.dur) { p.el.remove(); popups.splice(i, 1); }
    }
    if ((mmT -= dt) <= 0) { mmT = 0.1; drawMinimap(run); }
  };

  function drawMinimap(run) {
    const cv = els.mm, ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    const tr = run.train, sx = (w - 8) / tr.maxX, cy = h / 2, ch = 30;
    const reveal = !!run.S.team.hooks.revealMap;
    for (const car of tr.cars) {
      const x = 4 + car.x0 * sx, cw = (car.x1 - car.x0) * sx;
      ctx.fillStyle = car.i === run.carIdx ? '#fff4c2' : car.entered ? '#e7d8b5' : '#b7c3d4';
      ctx.strokeStyle = '#1d2340';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, cy - ch / 2, cw, ch, 4) : ctx.rect(x, cy - ch / 2, cw, ch);
      ctx.fill(); ctx.stroke();
      const known = car.entered || reveal;
      if (car.bailout) { ctx.fillStyle = '#22c55e'; ctx.fillRect(4 + car.bailout.x * sx - 3, cy + ch / 2 - 5, 6, 6); }
      if (car.brake) { ctx.fillStyle = '#e0283a'; ctx.beginPath(); ctx.arc(4 + car.brake.x * sx, cy, 3.5, 0, Math.PI * 2); ctx.fill(); }
      if (car.lock && !car.lock.open) { ctx.fillStyle = '#f59e0b'; ctx.fillRect(x + 2, cy - 4, 5, 8); }
      if (known && car.ice && !car.ice.broken) { ctx.fillStyle = '#ff8fc7'; ctx.beginPath(); ctx.arc(4 + car.ice.x * sx, cy + (car.ice.z / 4.5) * 10, 3.5, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const c of tr.chests) if (!c.opened && (tr.cars[c.car].entered || reveal)) { ctx.fillStyle = '#ffcf3d'; ctx.fillRect(4 + c.x * sx - 2, cy + (c.z / 4.5) * 10 - 2, 4, 4); }
    ctx.fillStyle = '#e0283a';
    for (const e of run.enemies) if (!e.dead) ctx.fillRect(4 + e.x * sx - 1.5, cy + (e.z / 4.5) * 10 - 1.5, 3, 3);
    for (const id of ['jake', 'finn']) {
      const hh = run.heroes[id];
      ctx.fillStyle = id === 'finn' ? '#3fa9f5' : '#f6b42a';
      ctx.strokeStyle = '#1d2340';
      ctx.beginPath(); ctx.arc(4 + hh.x * sx, cy + (hh.z / 4.5) * 10, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  /* ---------- pause & inventory ---------- */
  HUD.togglePause = function (run) {
    if (!els.overlay) return;
    if (!els.overlay.hidden) { els.overlay.hidden = true; run.paused = false; return; }
    run.paused = true;
    const m = AE.sfx.settings.muted;
    els.overlay.hidden = false;
    els.overlay.innerHTML = `<div class="ovpanel"><h2>Paused</h2>
      <div class="ovbtns"><button type="button" class="btn primary" data-hud="resume">Keep going</button><button type="button" class="btn" data-hud="inventory">Inventory</button>
      <button type="button" class="btn" data-hud="mute">${icon(m ? 'mute' : 'volume')} Sound ${m ? 'off' : 'on'}</button><button type="button" class="btn danger" data-hud="abandon">Give up this trip</button></div>
      <div class="controls"><h3>Controls</h3><ul>
        <li><kbd>WASD</kbd> move</li><li><kbd>Click</kbd> / <kbd>J</kbd> attack toward the mouse</li><li><kbd>Space</kbd> roll / stretch-dash</li><li><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> abilities</li>
        <li><kbd>Q</kbd> tag-switch Finn and Jake</li><li><kbd>R</kbd> MATHEMATICAL! super</li><li><kbd>E</kbd> hold to open, revive, bail out</li><li><kbd>4</kbd><kbd>5</kbd><kbd>6</kbd> snacks</li><li><kbd>I</kbd> inventory · <kbd>Esc</kbd> pause</li>
      </ul></div></div>`;
  };
  HUD.toggleInventory = function (run) {
    if (!els.overlay) return;
    if (!els.overlay.hidden && els.overlay.dataset.mode === 'inv') { els.overlay.hidden = true; els.overlay.dataset.mode = ''; run.paused = false; return; }
    run.paused = true;
    els.overlay.hidden = false;
    els.overlay.dataset.mode = 'inv';
    HUD.renderInventory(run);
  };
  HUD.renderInventory = function (run) {
    const T = run.S.team;
    const card = (it, acts) => `<div class="icard r${it.rarity}"><span class="ii">${icon(AE.meta.loot.iconOf(it))}</span><span class="in"><b>${esc(it.name)}${it.qty > 1 ? ' ×' + it.qty : ''}</b><small>${esc(D.RARITIES[it.rarity].name)} ${esc(D.KIND_LABEL[it.kind])} · worth ${U.fmt(AE.meta.loot.value(it))}</small></span><span class="ia">${acts}</span></div>`;
    const pack = run.backpack.map((it) => card(it, `<button type="button" class="btn small" data-hud="totummy" data-uid="${esc(it.uid)}" ${run.G.tummy.length >= T.tummy ? 'disabled' : ''}>${icon('tummy')} Tummy</button><button type="button" class="btn small danger" data-hud="drop" data-uid="${esc(it.uid)}">Drop</button>`)).join('') || '<p class="muted">Nothing yet. Smash stuff!</p>';
    const tummy = run.G.tummy.map((it) => card(it, `<button type="button" class="btn small" data-hud="topack" data-uid="${esc(it.uid)}">To backpack</button>`)).join('') || '<p class="muted">Empty. Things in here survive a wipe.</p>';
    const belt = run.G.belt.map((b, i) => (b ? card(b, `<button type="button" class="btn small" data-hud="useb" data-i="${i}">Use</button>`) : '')).join('');
    els.overlay.innerHTML = `<div class="ovpanel wide"><div class="spread"><h2>Inventory</h2><button type="button" class="btn" data-hud="inventory">Close <kbd>I</kbd></button></div>
      <div class="invcols"><section><h3>${icon('bag')} Backpack ${run.backpack.length}/${T.backpack} <small>lost on a wipe</small></h3>${pack}</section>
      <section><h3>${icon('tummy')} Jake’s Tummy ${run.G.tummy.length}/${T.tummy} <small>safe</small></h3>${tummy}${belt ? `<h3>${icon('pancake')} Snack belt</h3>${belt}` : ''}
      <p class="muted small">Carrying ${U.fmt(run.gold)} gold. XP this trip: ${U.fmt(run.xp)}.</p></section></div></div>`;
  };

  AE.ui.hud = HUD;
})();
