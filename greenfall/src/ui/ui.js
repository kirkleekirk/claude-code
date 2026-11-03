// Menus & overlays: loading, lobby (play / locker / item shop / career / settings),
// in-match inventory + crafting, full map, pause and results.
import { COSMETICS, BY_ID, RARITIES, TYPE_NAMES, shopForDay, currentDay, msToNextDay, priceOf } from '../data/cosmetics.js';
import { ITEMS, WEAPONS, AMMO, RECIPES, RARITY, RARITY_HEX } from '../data/items.js';
import { PRESETS } from '../game/match.js';
import { QUALITY } from '../game/graphics.js';
import { thumbnail } from './thumbs.js';
import { POIS, WORLD } from '../world/layout.js';
import { formatTime, clamp } from '../core/math.js';
import { DEFAULT_BINDS } from '../core/input.js';
import { CLASSES, CLASS_BY_ID, classBudget } from '../data/classes.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const TIPS = [
  'Gunshots carry for hundreds of meters. Every shot can pull a horde toward you.',
  'Board up windows and doors (hold E) with wood, then stay quiet — hordes may pass you by.',
  'Crouch to move silently. The dead hear footsteps, doors, building and gunfire.',
  'Raw meat and dirty water can make you sick. Cook them at a campfire first.',
  'Bandages stop bleeding. Splints fix fractured legs. Antibiotics cure infection.',
  'The riverboat arrives halfway through the match — it only has room for 3 survivors.',
  'When few survivors remain, an evac helicopter lands. Get there before it leaves.',
  'Kill every other survivor while the helicopter is inbound and it comes for you.',
  'Throw an Alarm Clock to lure the dead away from your hiding spot.',
  'Shooting a car can set off its alarm. Everything within 140m will come running.',
  'At night the sky turns green and the dead get faster. Your flashlight makes you visible.',
  'Valuables (watches, coins, idols) are worth Shards — but only if you extract with them.',
  'Hit trees, rocks and cars with your harvesting tool to gather building materials.',
  'Hordes grow when they see you or hear loud noises, and the big ones migrate fast.',
];

export class UI {
  constructor(G, root) {
    this.G = G;
    this.root = root;
    this.overlay = null;
    this.tab = 'play';
    this.loading = el('div', '', root);
    this.loading.id = 'loading';
    this.loading.innerHTML = `<div class="logo display">Greenfall</div><div class="sub display">Zombie Extraction Royale</div><div class="bar"><div></div></div><div class="step"></div><div class="tip"></div>`;
    this.lobbyEl = el('div', 'hidden', root);
    this.lobbyEl.id = 'lobby';
    this.tipI = Math.floor(Math.random() * TIPS.length);
    this.loading.querySelector('.tip').textContent = TIPS[this.tipI];
    this.tipTimer = setInterval(() => { this.tipI = (this.tipI + 1) % TIPS.length; this.loading.querySelector('.tip').textContent = TIPS[this.tipI]; }, 5200);
  }
  click() { this.G.audio?.play('ui_click', null, { vol: 0.6, bus: 'ui' }); }

  // ---------------- loading ----------------
  setLoading(p, step) {
    this.loading.classList.remove('hidden');
    this.loading.querySelector('.bar > div').style.width = Math.round(p * 100) + '%';
    if (step) this.loading.querySelector('.step').textContent = step;
  }
  hideLoading() { this.loading.classList.add('hidden'); }

  // ---------------- lobby ----------------
  showLobby() {
    this.lobbyEl.classList.remove('hidden');
    this.renderLobby();
  }
  hideLobby() { this.lobbyEl.classList.add('hidden'); }
  renderLobby() {
    const P = this.G.profile.data;
    const L = this.lobbyEl;
    L.innerHTML = '';
    const top = el('div', 'topbar', L);
    el('div', 'brand', top, 'GREENFALL');
    for (const [k, label] of [['play', 'Play'], ['locker', 'Locker'], ['shop', 'Item Shop'], ['career', 'Career'], ['settings', 'Settings']]) {
      const b = el('button', 'tab' + (this.tab === k ? ' active' : ''), top, label);
      b.onclick = () => { this.click(); this.tab = k; this.renderLobby(); };
      b.onmouseenter = () => this.G.audio?.play('ui_hover', null, { vol: 0.3, bus: 'ui' });
    }
    el('div', 'spacer', top);
    el('div', 'levelbadge', top, `<span class="lv">LV ${P.level}</span>`);
    if (document.fullscreenEnabled && !document.fullscreenElement) { const fs = el('button', 'btn ghost fullscreen-btn', top, '⛶'); fs.title = 'Fullscreen'; fs.onclick = () => { this.click(); this.G.goFullscreen(); }; }
    const cur = el('div', 'currency', top, `<span class="shard"></span>${P.shards.toLocaleString()}`);
    if (this.G.wallet.online) { const g = el('button', 'btn yellow getshards', top, '+'); g.title = 'Get Shards'; g.onclick = () => { this.click(); this.showGetShards(); }; }
    void cur;
    const page = el('div', 'page', L);
    if (this.tab === 'play') this.renderPlay(page);
    else if (this.tab === 'shop') this.renderShop(page);
    else if (this.tab === 'locker') this.renderLocker(page);
    else if (this.tab === 'career') this.renderCareer(page);
    else if (this.tab === 'settings') this.renderSettings(page);
    this.G.lobbyVisible3D = this.tab === 'play' || this.tab === 'locker';
  }
  renderPlay(page) {
    const P = this.G.profile.data;
    el('div', 'nameplate', page, P.name);
    if (this.G.profile.data.tampered) el('div', 'toast', page, 'Your save was edited outside the game, so your Shards were reset.').style.cssText = 'position:absolute;top:58px;left:50%;transform:translateX(-50%);opacity:1';
    const left = el('div', 'lobby-left', page);
    left.innerHTML = `<div class="season">SEASON 1 · THE GREENFALL</div><div class="lobby-title">The dead rise<br>with the green sky.</div>
      <div class="newsbox"><b>Greenfall County</b> fell overnight. Loot the farms, towns and the old coastal quarter of Bellerose, keep yourself fed, patched up and quiet — and get out alive.<br><br>
      <b>Halfway:</b> the riverboat <i>Magnolia</i> docks for 3 survivors.<br><b>Endgame:</b> one evac helicopter. It will not wait.</div>`;
    const how = el('button', 'btn ghost howto', left, 'How to play');
    how.onclick = () => { this.click(); this.showHelp(); };
    const panel = el('div', 'playpanel', page);
    const cls = CLASS_BY_ID[P.settings.classId] || CLASS_BY_ID.survivor;
    const cc = el('div', 'modecard classcard', panel);
    cc.innerHTML = `<div class="cc-row"><span class="cc-icon" style="color:${cls.color}">${cls.icon}</span><div><h3>${cls.name}</h3><div class="cc-tag">${cls.tagline}</div></div></div>`;
    const ch = el('button', 'btn ghost cc-btn', cc, 'Change class');
    ch.onclick = () => { this.click(); this.showClassPicker(); };
    const mode = el('div', 'modecard', panel);
    mode.innerHTML = '<h3>Solo · Extraction Royale</h3>';
    const lens = el('div', 'lengths', mode);
    for (const k of Object.keys(PRESETS)) {
      const pr = PRESETS[k];
      const b = el('button', P.settings.matchLength === k ? 'sel' : '', lens, `${pr.label}<small>${pr.desc}</small>`);
      b.onclick = () => { this.click(); P.settings.matchLength = k; this.G.profile.save(); this.renderLobby(); };
    }
    const play = el('button', 'btn yellow playbtn display', panel, 'Play');
    play.onclick = () => { this.click(); this.G.startMatch(P.settings.matchLength); };
  }
  classCard(parent, c, selected) {
    const b = classBudget(c);
    const d = el('div', 'clscard' + (selected ? ' sel' : ''), parent);
    d.style.setProperty('--cc', c.color);
    const kit = (c.kit || []).map(([id, n]) => `${n > 1 ? n + '× ' : ''}${(ITEMS[id] || AMMO[id] || { name: id[0].toUpperCase() + id.slice(1) }).name}`).join(', ');
    const lines = b.lines.map((l) => `<li class="${l.good ? 'up' : 'down'}">${l.good ? '▲' : '▼'} ${l.special ? l.text : l.text}</li>`).join('') || '<li class="eq">● No bonuses or drawbacks</li>';
    const max = 60;
    d.innerHTML = `<div class="cl-head"><span class="cl-icon">${c.icon}</span><div><div class="cl-name">${c.name}</div><div class="cl-tag">${c.tagline}</div></div></div>
      <ul class="cl-lines">${lines}</ul>
      <div class="cl-bals"><div class="cl-bal"><span>Bonus</span><div class="cl-bar"><div class="up" style="width:${(b.buff / max) * 100}%"></div></div></div>
      <div class="cl-bal"><span>Drawback</span><div class="cl-bar"><div class="down" style="width:${(b.nerf / max) * 100}%"></div></div></div></div>
      <div class="cl-kit">Starts with: ${kit || '—'}</div>`;
    return d;
  }
  showClassPicker() {
    const P = this.G.profile.data;
    const o = this.openOverlay();
    this.overlayKind = 'classes';
    const box = el('div', 'clspicker', o);
    const top = el('div', 'cls-top', box);
    el('h1', 'display', top, 'Choose your class');
    const close = el('button', 'btn ghost', top, 'Close');
    close.onclick = () => { this.click(); this.closeOverlay(); };
    el('div', 'desc', box, 'Every bonus is paid for with a drawback of the same size — the bars always match. Survivor is perfectly even.');
    const grid = el('div', 'clsgrid', box);
    for (const c of CLASSES) {
      const card = this.classCard(grid, c, (P.settings.classId || 'survivor') === c.id);
      card.onclick = () => { this.click(); P.settings.classId = c.id; this.G.profile.save(); this.closeOverlay(); this.renderLobby(); };
    }
    o.onclick = (e) => { if (e.target === o) this.closeOverlay(); };
  }
  showGetShards() {
    const W = this.G.wallet;
    const m = el('div', 'modal', this.root);
    const box = el('div', 'modal-box', m);
    box.style.flexDirection = 'column';
    el('h2', '', box, 'Get Shards');
    el('div', 'desc', box, 'Buy a Shard pack on itch.io, then paste the purchase code you receive below. Shards are cosmetic only.');
    const packs = el('div', 'packs', box);
    for (const p of W.store || []) { const a = el('a', 'btn yellow', packs, `<span class="shard" style="width:16px;height:16px;vertical-align:-2px"></span> ${p.shards.toLocaleString()} · ${p.label}`); a.href = p.url; a.target = '_blank'; a.rel = 'noopener'; }
    if (!(W.store || []).length) el('div', 'desc', packs, 'No packs are on sale right now.');
    const row = el('div', 'redeem', box);
    const inp = el('input', '', row); inp.placeholder = 'Purchase or gift code';
    inp.onfocus = () => { this.G.input.textFocus = true; }; inp.onblur = () => { this.G.input.textFocus = false; };
    const go = el('button', 'btn lime', row, 'Redeem');
    const msg = el('div', 'desc', box);
    go.onclick = async () => { go.disabled = true; const r = await W.redeem(inp.value); go.disabled = false; msg.innerHTML = r.ok ? `<span style="color:#9be070">+${r.added.toLocaleString()} Shards added!</span>` : `<span style="color:#ff8a7a">${r.error}</span>`; if (r.ok) { this.G.audio?.play('ui_buy', null, { bus: 'ui' }); this.renderLobby(); } };
    const close = el('button', 'btn ghost', box, 'Close'); close.onclick = () => m.remove();
    m.onclick = (e) => { if (e.target === m) m.remove(); };
  }
  showHelp() {
    const o = this.openOverlay();
    const box = el('div', 'results', o);
    box.style.textAlign = 'left';
    box.innerHTML = `<h1 class="display" style="margin:0 0 8px;font-size:40px">How to play</h1>
      <p class="desc"><b>Drop</b> from the plane over Greenfall County. <b>Loot</b> weapons, food, water and medicine. <b>Survive</b> — hunger and thirst drain, wounds bleed, falls break bones. <b>Extract</b> on the riverboat (halfway, 3 seats) or the final helicopter. Kill every other survivor while the helicopter is out and it picks you up.</p>
      <p class="desc"><b>Hordes</b> replace the storm. They rise out of the ground inside the green zones, grow when they see you or hear noise, drift toward sound and can migrate fast. Stay quiet. Board up a house and wait them out.</p>
      <div class="keys">${this.keyList()}</div>`;
    const c = el('button', 'btn yellow', box, 'Got it'); c.style.marginTop = '14px';
    c.onclick = () => { this.click(); this.closeOverlay(); };
  }
  keyList() {
    const rows = [['Move', 'W A S D'], ['Sprint', 'Shift'], ['Jump / Vault window', 'Space'], ['Crouch (quiet)', 'C / Ctrl'], ['Fire / Use', 'Left Mouse'], ['Aim', 'Right Mouse'], ['Reload', 'R'], ['Interact / Hold to board', 'E'],
      ['Harvest tool / Slots', '1 – 6, Wheel'], ['Build mode', 'Q'], ['Wall / Floor / Ramp / Roof', 'Z X V F'], ['Material / Rotate', 'G / R'], ['Quick heal', 'H'], ['Quick eat / drink', 'X'], ['Inventory & crafting', 'Tab'],
      ['Map', 'M'], ['Flashlight', 'L'], ['Drop item', 'T'], ['Emote', 'B'], ['Pause', 'Esc / P']];
    return rows.map(([a, k]) => `<div><span>${a}</span><kbd>${k}</kbd></div>`).join('');
  }

  // ---------------- item shop ----------------
  renderShop(page) {
    const P = this.G.profile;
    const wrap = el('div', 'shop', page);
    const head = el('div', 'shop-head', wrap);
    el('h1', '', head, 'Item Shop');
    const timer = el('div', 'timer', head);
    const upd = () => { timer.textContent = 'NEW ITEMS IN ' + formatTime(msToNextDay() / 1000); };
    upd();
    clearInterval(this.shopTimer);
    this.shopTimer = setInterval(() => { if (!document.body.contains(timer)) { clearInterval(this.shopTimer); return; } upd(); }, 1000);
    const day = currentDay();
    const shop = shopForDay(day);
    const secs = el('div', 'shop-sections', wrap);
    for (const [title, list, cls] of [['Featured', shop.featured, 'featured'], ['Daily', shop.daily, 'daily']]) {
      const sec = el('div', 'shop-sec ' + cls, secs);
      el('h2', '', sec, title);
      const cards = el('div', 'cards', sec);
      for (const item of list) this.card(cards, item, P);
    }
    el('p', 'desc', wrap, this.G.wallet.online ? 'Shards are earned by playing (extracting with valuables pays best) or added with the + button. Every item is cosmetic only — no pay-to-win.' : 'Shards are earned by playing: extracting with valuables pays best. Every item is cosmetic only — no pay-to-win.').style.marginTop = '18px';
  }
  card(parent, item, P) {
    const owned = P.owns(item.id);
    const c = el('div', 'card', parent);
    const img = el('img', 'art', c);
    img.alt = item.name;
    img.src = thumbnail(item, P.data.equipped.outfit);
    const price = priceOf(item);
    el('div', 'info', c, `<div class="name">${item.name}</div><div class="type">${TYPE_NAMES[item.type]}</div>${owned ? '<div class="owned">OWNED</div>' : `<div class="price"><span class="shard"></span>${price.toLocaleString()}</div>`}`);
    el('div', 'rarity-strip', c).style.background = RARITIES[item.rarity].color;
    c.onclick = () => { this.click(); this.itemModal(item); };
  }
  itemModal(item) {
    const P = this.G.profile;
    const owned = P.owns(item.id);
    const price = priceOf(item);
    const m = el('div', 'modal', this.root);
    const box = el('div', 'modal-box', m);
    const img = el('img', 'art', box); img.src = thumbnail(item, P.data.equipped.outfit);
    const meta = el('div', 'meta', box);
    meta.innerHTML = `<span class="rarity-tag" style="background:${RARITIES[item.rarity].color}">${RARITIES[item.rarity].name} ${TYPE_NAMES[item.type]}</span><h2>${item.name}</h2><div class="desc">${item.desc || ''}</div>${item.set ? `<div class="desc" style="color:#9bff57">Part of the ${item.set} set.</div>` : ''}`;
    el('div', 'spacer', meta);
    const row = el('div', '', meta); row.style.display = 'flex'; row.style.gap = '8px'; row.style.flexWrap = 'wrap';
    if (owned) {
      const eq = el('button', 'btn lime', row, P.data.equipped[item.type] === item.id ? 'Equipped' : 'Equip');
      eq.onclick = () => { this.G.wallet.equip(item.type, item.id); this.G.onCosmeticsChanged(); this.click(); m.remove(); this.renderLobby(); };
    } else {
      const buy = el('button', 'btn yellow', row, `<span class="shard" style="width:18px;height:18px;vertical-align:-3px"></span> Purchase ${price.toLocaleString()}`);
      if (P.data.shards < price) { buy.disabled = true; buy.title = 'Not enough Shards'; el('div', 'desc', meta, `You need ${(price - P.data.shards).toLocaleString()} more Shards. Play matches and extract with valuables to earn more.`); }
      buy.onclick = async () => {
        buy.disabled = true;
        const r = await this.G.wallet.buy(item);
        if (r.ok) { this.G.audio?.play('ui_buy', null, { vol: 0.8, bus: 'ui' }); this.G.wallet.equip(item.type, item.id); this.G.onCosmeticsChanged(); m.remove(); this.renderLobby(); }
        else { buy.disabled = false; this.G.audio?.play('ui_error', null, { bus: 'ui' }); el('div', 'desc', meta, `<span style="color:#ff8a7a">${r.error}</span>`); }
      };
    }
    const close = el('button', 'btn ghost', row, 'Close');
    close.onclick = () => { this.click(); m.remove(); };
    m.onclick = (e) => { if (e.target === m) m.remove(); };
  }

  // ---------------- locker ----------------
  renderLocker(page) {
    const P = this.G.profile;
    this.lockerType = this.lockerType || 'outfit';
    const wrap = el('div', 'locker', page);
    const slots = el('div', 'locker-slots', wrap);
    for (const t of ['outfit', 'backbling', 'pickaxe', 'paint', 'emote', 'wrap']) {
      const it = BY_ID[P.data.equipped[t]];
      const s = el('div', 'lslot' + (this.lockerType === t ? ' sel' : ''), slots);
      const img = el('img', '', s); img.src = thumbnail(it, P.data.equipped.outfit);
      el('div', 'lbl', s, TYPE_NAMES[t]);
      el('div', 'nm', s, it.name);
      s.onclick = () => { this.click(); this.lockerType = t; this.renderLobby(); if (t === 'emote') this.G.lobby.playEmote(BY_ID[P.data.equipped.emote].anim); if (t === 'pickaxe') this.G.lobby.showPickaxe(true); if (t === 'wrap') this.G.lobby.showWeapon(BY_ID[P.data.equipped.wrap].wrap); };
    }
    const grid = el('div', 'locker-grid', wrap);
    el('h2', '', grid, TYPE_NAMES[this.lockerType]);
    const g = el('div', 'lgrid', grid);
    const items = COSMETICS.filter((c) => c.type === this.lockerType).sort((a, b) => (P.owns(b.id) - P.owns(a.id)));
    for (const it of items) {
      const owned = P.owns(it.id);
      const d = el('div', 'litem' + (P.data.equipped[it.type] === it.id ? ' eq' : '') + (owned ? '' : ' locked'), g);
      const img = el('img', '', d); img.src = thumbnail(it, P.data.equipped.outfit);
      el('div', 'nm', d, owned ? it.name : '🔒 ' + it.name);
      d.style.borderBottom = `4px solid ${RARITIES[it.rarity].color}`;
      d.onclick = () => {
        this.click();
        if (!owned) { this.tab = 'shop'; this.itemModal(it); return; }
        this.G.wallet.equip(it.type, it.id); this.G.onCosmeticsChanged(); this.renderLobby();
        if (it.type === 'emote') this.G.lobby.playEmote(it.anim);
        if (it.type === 'pickaxe') this.G.lobby.showPickaxe(true);
        if (it.type === 'wrap') this.G.lobby.showWeapon(it.wrap);
      };
    }
  }

  // ---------------- career ----------------
  renderCareer(page) {
    const P = this.G.profile, d = P.data, s = d.stats;
    const wrap = el('div', 'panelpage', page);
    el('h1', '', wrap, 'Career');
    el('div', 'display', wrap, `Level ${d.level} · ${d.xp} / ${P.xpForLevel(d.level)} XP`);
    el('div', 'xpbar', wrap, `<div style="width:${(d.xp / P.xpForLevel(d.level)) * 100}%"></div>`);
    const g = el('div', 'statgrid', wrap);
    const stat = (k, v) => el('div', 'stat', g, `<div class="v">${v}</div><div class="k">${k}</div>`);
    stat('Matches', s.matches); stat('Extractions', s.extractions); stat('Extract rate', s.matches ? Math.round((s.extractions / s.matches) * 100) + '%' : '—');
    stat('Riverboat escapes', s.boatEscapes); stat('Helicopter escapes', s.heliEscapes); stat('Survivor eliminations', s.kills); stat('Zombies put down', s.zombieKills);
    stat('Time survived', formatTime(s.timePlayed)); stat('Longest run', formatTime(s.bestTime)); stat('Loot value extracted', s.lootExtracted.toLocaleString());
    const h = el('div', 'history', wrap);
    el('h2', 'display', h, 'Recent matches').style.fontWeight = 400;
    if (!d.history.length) el('div', 'desc', h, 'No matches yet. Drop in!');
    for (const m of d.history.slice(0, 12)) {
      el('div', 'hrow', h, `<span class="res" style="color:${m.outcome === 'extracted' ? '#ffd23f' : '#ff6060'}">${m.outcome === 'extracted' ? 'EXTRACTED' : m.outcome === 'left' ? 'LEFT BEHIND' : 'ELIMINATED'}</span><span>#${m.placement}/${m.total}</span><span>${m.kills} kills</span><span>${m.zombieKills} zombies</span><span>${formatTime(m.time)}</span><span style="margin-left:auto">+${m.shards} ◆</span>`);
    }
  }

  // ---------------- settings ----------------
  renderSettings(page, inMatch = false) {
    const P = this.G.profile, S = P.data.settings;
    const wrap = el('div', 'panelpage', page);
    el('h1', '', wrap, 'Settings');
    const g = el('div', 'settings-grid', wrap);
    const seg = (label, opts, cur, fn) => {
      el('label', '', g, label);
      const s = el('div', 'seg', g);
      for (const [v, t] of opts) { const b = el('button', cur === v ? 'sel' : '', s, t); b.onclick = () => { this.click(); fn(v); P.save(); this.rerenderSettings(page, inMatch); }; }
    };
    const range = (label, min, max, step, cur, fn, fmt = (v) => v) => {
      el('label', '', g, `${label}: <b class="rv">${fmt(cur)}</b>`);
      const r = el('input', '', g); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = cur;
      const lbl = g.lastChild.previousSibling.querySelector('.rv');
      r.oninput = () => { fn(+r.value); lbl.textContent = fmt(+r.value); };
      r.onchange = () => P.save();
    };
    seg('Graphics quality', Object.keys(QUALITY).map((k) => [k, QUALITY[k].label]), S.quality || this.G.gfx.qualityKey, (v) => { S.quality = v; this.G.setQuality(v); });
    range('Mouse sensitivity', 0.2, 3, 0.05, S.sens, (v) => { S.sens = v; this.G.input.sensitivity = v; }, (v) => v.toFixed(2));
    range('Field of view', 60, 100, 1, S.fov, (v) => { S.fov = v; this.G.settings.fov = v; });
    range('Master volume', 0, 1, 0.01, S.master, (v) => { S.master = v; this.G.applyAudio(); }, (v) => Math.round(v * 100) + '%');
    range('Effects volume', 0, 1, 0.01, S.sfx, (v) => { S.sfx = v; this.G.applyAudio(); }, (v) => Math.round(v * 100) + '%');
    range('Music volume', 0, 1, 0.01, S.music, (v) => { S.music = v; this.G.applyAudio(); }, (v) => Math.round(v * 100) + '%');
    range('Ambience volume', 0, 1, 0.01, S.ambient, (v) => { S.ambient = v; this.G.applyAudio(); }, (v) => Math.round(v * 100) + '%');
    seg('Invert mouse Y', [[false, 'Off'], [true, 'On']], S.invertY, (v) => { S.invertY = v; this.G.input.invertY = v; });
    seg('Show FPS', [[false, 'Off'], [true, 'On']], S.showFps, (v) => { S.showFps = v; this.G.settings.showFps = v; });
    seg('Touch controls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], S.touch, (v) => { S.touch = v; this.G.applyTouch(); });
    el('label', '', g, 'Display name');
    const nm = el('input', '', g); nm.value = P.data.name; nm.maxLength = 16; nm.style.cssText = 'font:16px Rubik;padding:6px 10px;background:rgba(0,0,0,.3);color:#fff;border:2px solid rgba(255,255,255,.2);max-width:260px';
    nm.onfocus = () => { this.G.input.textFocus = true; }; nm.onblur = () => { this.G.input.textFocus = false; P.data.name = nm.value.trim().slice(0, 16) || P.data.name; P.save(); };
    el('h2', 'display', wrap, 'Controls').style.cssText = 'font-weight:400;margin-top:22px';
    el('div', 'keys', wrap, this.keyList());
    if (!inMatch) {
      const reset = el('button', 'btn red', wrap, 'Reset all progress'); reset.style.marginTop = '22px';
      reset.onclick = () => { if (confirm('Reset your level, Shards, items and stats?')) { localStorage.removeItem('greenfall.profile.v1'); location.reload(); } };
    }
    el('p', 'desc', wrap, 'Greenfall is an independent game. All characters, places and cosmetics are original.').style.marginTop = '22px';
  }
  rerenderSettings(page, inMatch) { page.innerHTML = ''; this.renderSettings(page, inMatch); if (inMatch) this.addBack(page); }
  addBack(page) { const b = el('button', 'btn yellow', page.querySelector('.panelpage'), 'Back'); b.style.marginTop = '16px'; b.onclick = () => { this.click(); this.openPause(); }; }

  // ---------------- overlays ----------------
  openOverlay() {
    this.closeOverlay();
    this.overlay = el('div', 'overlay', this.root);
    this.G.input.exitLock();
    return this.overlay;
  }
  closeOverlay() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; this.overlayKind = null; }
    if (this.G.inMatch && !this.G.paused && this.G.player?.alive && !this.G.touchMode) this.G.input.requestLock();
  }
  isOpen() { return !!this.overlay; }
  openPause() {
    const o = this.openOverlay();
    this.overlayKind = 'pause';
    this.G.paused = true;
    const box = el('div', 'pause', o);
    el('h1', '', box, 'Paused');
    const b1 = el('button', 'btn yellow', box, 'Resume'); b1.onclick = () => { this.click(); this.G.paused = false; this.closeOverlay(); };
    const b2 = el('button', 'btn', box, 'Settings'); b2.onclick = () => { this.click(); this.overlay.innerHTML = ''; const page = el('div', 'page', this.overlay); page.style.cssText = 'position:fixed;inset:0'; this.renderSettings(page, true); this.addBack(page); };
    const b3 = el('button', 'btn', box, 'Controls'); b3.onclick = () => { this.click(); this.overlay.innerHTML = ''; const page = el('div', 'results', this.overlay); page.innerHTML = `<h1 class="display" style="margin:0 0 10px">Controls</h1><div class="keys" style="text-align:left">${this.keyList()}</div>`; const bk = el('button', 'btn yellow', page, 'Back'); bk.style.marginTop = '14px'; bk.onclick = () => { this.click(); this.openPause(); }; };
    if (document.fullscreenEnabled) { const bf = el('button', 'btn', box, document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'); bf.onclick = () => { this.click(); if (document.fullscreenElement) document.exitFullscreen(); else this.G.goFullscreen(); this.openPause(); }; }
    const b4 = el('button', 'btn red', box, 'Leave match'); b4.onclick = () => { this.click(); if (confirm('Leave this match? You will not earn extraction rewards.')) { this.G.paused = false; this.closeOverlay(); this.G.match.finish('eliminated'); } };
  }
  togglePause() { if (this.overlayKind === 'pause') { this.G.paused = false; this.closeOverlay(); } else if (!this.overlay) this.openPause(); else { this.closeOverlay(); } }

  // ---------------- inventory ----------------
  toggleInventory() { if (this.overlayKind === 'inv') this.closeOverlay(); else this.openInventory(); }
  openInventory() {
    const o = this.openOverlay();
    this.overlayKind = 'inv';
    this.invSel = null;
    const box = el('div', 'inv', o);
    this.invBox = box;
    this.renderInventory();
    o.onclick = (e) => { if (e.target === o) this.closeOverlay(); };
  }
  renderInventory() {
    const G = this.G, p = G.player, box = this.invBox;
    if (!box) return;
    box.innerHTML = '';
    const left = el('div', '', box), right = el('div', '', box);
    el('h2', '', left, 'Hotbar');
    const hs = el('div', 'islots', left);
    const cell = (parent, list, i, label) => {
      const s = list[i];
      const sel = this.invSel && this.invSel.list === list && this.invSel.i === i;
      const c = el('div', 'icell' + (sel ? ' sel' : ''), parent);
      if (s) {
        const def = ITEMS[s.id];
        const isW = def.type === 'weapon';
        c.style.background = isW ? `linear-gradient(180deg, ${RARITY_HEX[s.r]}aa, ${RARITY_HEX[s.r]}33)` : def.type === 'valuable' ? 'linear-gradient(180deg,#f0a020aa,#f0a02033)' : '';
        c.innerHTML = `<span class="ico" style="color:${isW ? '#fff' : def.color}">${isW ? def.slotIcon : def.icon}</span><span class="n">${def.name}</span><span class="c">${isW ? (def.melee ? '' : s.mag) : s.n > 1 ? s.n : ''}</span>`;
      } else c.innerHTML = `<span class="n" style="opacity:.4">${label}</span>`;
      c.onclick = () => {
        this.click();
        if (this.invSel && (this.invSel.list !== list || this.invSel.i !== i)) {
          const a = this.invSel.list[this.invSel.i];
          this.invSel.list[this.invSel.i] = list[i];
          list[i] = a;
          this.invSel = null;
          p.refreshModel();
        } else this.invSel = s ? { list, i } : null;
        this.renderInventory();
      };
    };
    for (let i = 0; i < p.inv.slots.length; i++) cell(hs, p.inv.slots, i, `Slot ${i + 2}`);
    el('h2', '', left, 'Backpack').style.marginTop = '12px';
    const ps = el('div', 'ipack', left);
    for (let i = 0; i < p.inv.pack.length; i++) cell(ps, p.inv.pack, i, 'Empty');
    const det = el('div', 'idetail', left);
    if (this.invSel) {
      const s = this.invSel.list[this.invSel.i];
      const def = ITEMS[s.id];
      det.innerHTML = `<h3 style="color:${def.type === 'weapon' ? RARITY_HEX[s.r] : '#fff'}">${def.type === 'weapon' ? RARITY[s.r] + ' ' : ''}${def.name}</h3><div class="desc">${this.describe(def, s)}</div>`;
      const btns = el('div', 'btns', det);
      if (def.type === 'heal' || def.type === 'food') { const u = el('button', 'btn lime', btns, 'Use'); u.onclick = () => { this.click(); p.useItem({ list: this.invSel.list, i: this.invSel.i, slot: s }); this.closeOverlay(); }; }
      if (def.type === 'tool') { const u = el('button', 'btn lime', btns, 'Use on vehicle'); u.onclick = () => { this.click(); this.closeOverlay(); this.G.rides.useItemOn(p, { list: this.invSel.list, i: this.invSel.i, slot: s }); }; }
      const d = el('button', 'btn red', btns, 'Drop');
      d.onclick = () => { this.click(); G.inter.dropItem({ ...s }, p.pos.x, p.pos.y + 0.5, p.pos.z); this.invSel.list[this.invSel.i] = null; this.invSel = null; p.refreshModel(); this.renderInventory(); };
      el('div', 'desc', det, '<small>Tip: click another slot to move/swap.</small>');
    } else det.innerHTML = '<div class="desc">Select an item to see details. Click two slots to swap them between your hotbar and backpack.</div>';
    // right: crafting + status
    el('h2', '', right, 'Crafting');
    const cr = el('div', 'craft', right);
    for (const rc of RECIPES) {
      const can = Object.entries(rc.cost).every(([k, v]) => (k in p.inv.mats ? p.inv.mats[k] : p.countItem(k)) >= v);
      const r = el('div', 'recipe', cr);
      const def = ITEMS[rc.out];
      r.innerHTML = `<span style="font-size:22px;color:${def.color}">${def.icon}</span><div><div class="nm">${def.name}</div><div class="cost">${Object.entries(rc.cost).map(([k, v]) => `${v} ${k}`).join(' · ')} — ${rc.desc}</div></div>`;
      const b = el('button', 'btn' + (can ? ' lime' : ''), r, 'Craft');
      b.disabled = !can;
      b.onclick = () => {
        if (!p.freeSlotFor(rc.out)) { G.hud.toast(true, 'Inventory full'); return; }
        for (const [k, v] of Object.entries(rc.cost)) { if (k in p.inv.mats) p.inv.mats[k] -= v; else p.takeItem(k, v); }
        p.addItem(rc.out, rc.n);
        G.audio?.play('hammer', null, { vol: 0.5 });
        G.emitNoise(p.pos.x, p.pos.z, 12, p, 'craft');
        this.renderInventory();
      };
    }
    el('h2', '', right, 'Condition').style.marginTop = '12px';
    const sum = el('div', 'survival-sum', right);
    sum.innerHTML = `<div>❤ Health ${Math.ceil(p.health)}</div><div>⛨ Armor ${Math.ceil(p.armor)}</div><div>🍖 Food ${Math.round(p.hunger)}%</div><div>💧 Water ${Math.round(p.thirst)}%</div>
      <div>${p.bleed ? '🩸 Bleeding — bandage!' : '✔ Not bleeding'}</div><div>${p.fracture ? '🦴 Fractured leg — splint' : '✔ Legs OK'}</div><div>${p.infection > 0 ? `☣ Infection ${Math.floor(p.infection)}% — antibiotics` : '✔ No infection'}</div><div>${p.sick > 0 ? '🤢 Food poisoning' : '✔ Stomach OK'}</div>`;
    const al = el('div', 'ammo-list', right);
    al.innerHTML = Object.keys(AMMO).map((k) => `<span style="border-left:3px solid ${AMMO[k].color}">${AMMO[k].name}: ${p.inv.ammo[k]}</span>`).join('') + `<span>Wood ${p.inv.mats.wood}</span><span>Stone ${p.inv.mats.stone}</span><span>Metal ${p.inv.mats.metal}</span>`;
    el('div', 'desc', right, `<br>Carried loot value: <b style="color:#ffd23f">${p.lootValue()}</b> — extract to cash it in as Shards.`);
  }
  describe(def, s) {
    if (def.type === 'weapon') {
      if (def.melee) return `Melee · ${def.dmg[s.r]} damage · silent`;
      return `${def.dmg[s.r]}${def.pellets ? '×' + def.pellets : ''} dmg · ${def.rate}/s · mag ${def.mag} · ${AMMO[def.ammo].name}${def.suppressed ? ' · <b style="color:#9bff57">Quiet</b>' : ` · heard ${def.noise}m away`}`;
    }
    const parts = [];
    if (def.heal) parts.push(`Heals ${def.heal}${def.healCap < 100 ? ` (up to ${def.healCap})` : ''}`);
    if (def.stopBleed) parts.push('stops bleeding');
    if (def.fixFracture) parts.push('fixes fractures');
    if (def.cureInfection) parts.push('cures infection & sickness');
    if (def.painkill) parts.push('numbs fractures for 2 min');
    if (def.armor) parts.push(`+${def.armor} armor`);
    if (def.food) parts.push(`+${def.food} food`);
    if (def.water) parts.push(`${def.water > 0 ? '+' : ''}${def.water} water`);
    if (def.sick) parts.push(`<b style="color:#ff8a6a">may cause food poisoning</b>`);
    if (def.cooks) parts.push(`cook at a campfire → ${ITEMS[def.cooks].name}`);
    if (def.type === 'valuable') parts.push(`Worth ${def.value} Shards if you extract with it`);
    if (def.type === 'throw') parts.push(def.lure ? 'Rings loudly for 26s — lures the dead' : def.fireRadius ? 'Sets an area on fire' : `Explodes for ${def.dmg} damage`);
    if (s.id === 'gascan') parts.push('Refuels a dirt bike by 60% or a truck by 30%. Siphon more from abandoned cars.');
    if (s.id === 'repairkit') parts.push('Repairs a vehicle by 45%. Mechanics repair twice as much.');
    if (def.type === 'deploy') parts.push('Place it, then cook food and boil water. Its light draws the dead at night.');
    if (def.type === 'craft') parts.push('Crafting material');
    if (def.time) parts.push(`${def.time}s to use`);
    return parts.join(' · ');
  }

  // ---------------- map ----------------
  toggleMap() { if (this.overlayKind === 'map') this.closeOverlay(); else this.openMap(); }
  openMap() {
    const G = this.G;
    const o = this.openOverlay();
    this.overlayKind = 'map';
    const box = el('div', 'bigmap', o);
    const c = el('canvas', '', box);
    c.width = 1600; c.height = 1000;
    el('div', 'maptitle', box, 'Greenfall County');
    el('div', 'maplegend', box, '<span style="color:#9bff57">●</span> Horde &nbsp; <span style="color:#ffd23f">●</span> Riverboat &nbsp; <span style="color:#ff4d4d">●</span> Evac &nbsp; <span style="color:#4fb3ff">●</span> Supply drop &nbsp; <span style="color:#ff8a3a">●</span> Your marker<br>Click to place a marker · M / Esc to close');
    const draw = () => {
      if (!document.body.contains(c)) return;
      const x = c.getContext('2d');
      const sx = c.width / WORLD.W, sz = c.height / WORLD.H;
      x.fillStyle = '#1e6a90'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(G.hud.mapCanvas, 0, 0, c.width, c.height);
      const toS = (wx, wz) => [wx * sx, wz * sz];
      for (const h of G.hordes.list) {
        const [hx, hy] = toS(h.x, h.z);
        x.fillStyle = 'rgba(70,190,30,0.32)'; x.strokeStyle = 'rgba(170,255,90,0.95)'; x.lineWidth = 3;
        x.beginPath(); x.ellipse(hx, hy, h.r * sx, h.r * sz, 0, 0, Math.PI * 2); x.fill(); x.stroke();
        if (h.migrating > 0 || Math.hypot(h.tx - h.x, h.tz - h.z) > 20) { const [tx, ty] = toS(h.tx, h.tz); x.strokeStyle = 'rgba(200,255,120,.8)'; x.setLineDash([8, 6]); x.beginPath(); x.moveTo(hx, hy); x.lineTo(tx, ty); x.stroke(); x.setLineDash([]); }
        x.font = '18px "Lilita One"'; x.fillStyle = '#e8ffd0'; x.textAlign = 'center'; x.fillText('☠', hx, hy + 6);
      }
      x.textAlign = 'center';
      for (const p of POIS) {
        const [px, py] = toS(p.x, p.z);
        x.font = `${p.major ? 22 : 15}px "Lilita One", sans-serif`;
        x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.75)'; x.fillStyle = p.major ? '#fff' : '#e8f0e0';
        x.strokeText(p.name.toUpperCase(), px, py); x.fillText(p.name.toUpperCase(), px, py);
      }
      G.hud.drawMarkers(x, toS, 1.6);
      const P = G.player;
      const [ppx, ppy] = toS(P.pos.x, P.pos.z);
      x.save(); x.translate(ppx, ppy); x.rotate(-P.camYaw + Math.PI);
      x.fillStyle = '#ffd23f'; x.strokeStyle = '#000'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, 14); x.lineTo(9, -9); x.lineTo(0, -4); x.lineTo(-9, -9); x.closePath(); x.fill(); x.stroke();
      x.restore();
      requestAnimationFrame(draw);
    };
    draw();
    c.onclick = (e) => {
      const r = c.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * WORLD.W, wz = ((e.clientY - r.top) / r.height) * WORLD.H;
      G.player.marker = G.player.marker && Math.hypot(G.player.marker.x - wx, G.player.marker.z - wz) < 60 ? null : { x: wx, z: wz };
      this.click();
    };
    o.onclick = (e) => { if (e.target === o) this.closeOverlay(); };
  }

  // ---------------- results ----------------
  showResults(r, levelUps) {
    const o = this.openOverlay();
    this.overlayKind = 'results';
    const box = el('div', 'results', o);
    const win = r.outcome === 'extracted';
    const title = win ? 'EXTRACTED!' : r.outcome === 'left' ? 'LEFT BEHIND' : 'ELIMINATED';
    el('div', 'big ' + (win ? 'win' : 'lose'), box, title);
    el('div', 'place', box, win ? `Escaped by ${r.how === 'boat' ? 'riverboat' : 'helicopter'}${r.auto ? ' · last one standing' : ''} · ${r.preset}` : `#${r.placement} of ${r.total}${r.killer ? ` · eliminated by ${r.killer}` : ''} · ${r.preset}`);
    const g = el('div', 'statgrid', box);
    const stat = (k, v) => el('div', 'stat', g, `<div class="v">${v}</div><div class="k">${k}</div>`);
    stat('Time survived', formatTime(r.time)); stat('Eliminations', r.kills); stat('Zombies', r.zombieKills); stat('Damage dealt', r.damage); stat('Pieces built', r.built); stat('Windows boarded', r.boarded);
    if (win) stat('Loot extracted', r.loot);
    const rw = el('div', 'rewards', box);
    const sh = el('div', '', rw, `<span class="shard"></span><span class="cnt">0</span>`);
    el('div', '', rw, `<span style="color:#6ad0ff">+${r.xp} XP</span>`);
    if (levelUps) el('div', '', rw, `<span style="color:#9bff57">LEVEL UP ×${levelUps}! +${levelUps * 100}</span>`);
    let n = 0;
    const cnt = sh.querySelector('.cnt');
    const tick = setInterval(() => { n = Math.min(r.shards, n + Math.max(1, Math.ceil(r.shards / 40))); cnt.textContent = '+' + n; if (n >= r.shards) clearInterval(tick); }, 30);
    const b = el('button', 'btn yellow', box, 'Return to lobby'); b.style.marginTop = '8px';
    b.onclick = () => { this.click(); this.closeOverlay(); this.G.returnToLobby(); };
  }
}
