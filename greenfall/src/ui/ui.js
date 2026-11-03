// Menus & overlays: loading, lobby (play / locker / item shop / career / settings),
// in-match inventory + crafting, full map, pause and results.
import { COSMETICS, BY_ID, RARITIES, TYPE_NAMES, shopForDay, currentDay, msToNextDay, priceOf, lastSeen } from '../data/cosmetics.js';
import { ITEMS, WEAPONS, AMMO, RECIPES, RARITY, RARITY_HEX } from '../data/items.js';
import { PRESETS } from '../game/match.js';
import { QUALITY } from '../game/graphics.js';
import { thumbnail, gunThumb, turntable } from './thumbs.js';
import { POIS, WORLD } from '../world/layout.js';
import { formatTime, clamp } from '../core/math.js';
import { DEFAULT_BINDS } from '../core/input.js';
import { CLASSES, CLASS_BY_ID, classBudget } from '../data/classes.js';
import { MultiplayerUI } from './mp.js';
import { gunStats, MODS, modsFor, slotsFor, modLines, canMod, canAfford, costText, installMod, removeMod, knowsMod, costFor, BLUEPRINT_MODS } from '../data/gunmods.js';

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
  'You start with bare hands. Find an axe, pickaxe or machete to chop trees, break rocks and strip cars for materials.',
  'Hordes grow when they see you or hear loud noises, and the big ones migrate fast.',
];

export class UI {
  constructor(G, root) {
    this.G = G;
    this.root = root;
    this.mp = new MultiplayerUI(this);
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
    if (this.G.profile.data.refundNotice) { const n = this.G.profile.data.refundNotice; delete this.G.profile.data.refundNotice; this.G.profile.save(); el('div', 'toast', page, `Harvesting tools were retired — you were refunded ${n} Shards.`).style.cssText = 'position:absolute;top:58px;left:50%;transform:translateX(-50%);opacity:1'; }
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
    const play = el('button', 'btn yellow playbtn display', panel, 'Play solo');
    play.onclick = () => { this.click(); this.G.startMatch(P.settings.matchLength); };
    const mpb = el('button', 'btn mpbtn display', panel, 'Multiplayer');
    mpb.onclick = () => { this.click(); this.mp.openBrowser(); };
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
      ['Hands / Slots', '1 – 6, Wheel'], ['Trowel: wall ↔ window wall', 'R'], ['Quick heal', 'H'], ['Quick eat / drink', 'X'], ['Inventory & crafting', 'Tab'],
      ['Map', 'M'], ['Flashlight', 'L'], ['Drop item', 'T'], ['Emote', 'B'], ['Pause', 'Esc / P']];
    return rows.map(([a, k]) => `<div><span>${a}</span><kbd>${k}</kbd></div>`).join('');
  }

  // ---------------- item shop ----------------
  renderShop(page) {
    const P = this.G.profile;
    const wrap = el('div', 'shop', page);
    const head = el('div', 'shop-head', wrap);
    el('h1', '', head, 'Item Shop');
    const day = currentDay();
    const timer = el('div', 'timer', head);
    const upd = () => { timer.textContent = 'NEW ITEMS IN ' + formatTime(msToNextDay() / 1000); if (currentDay() !== day) this.renderLobby(); };
    upd();
    clearInterval(this.shopTimer);
    this.shopTimer = setInterval(() => { if (!document.body.contains(timer)) { clearInterval(this.shopTimer); return; } upd(); }, 1000);
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
    const seen = lastSeen(item.id, currentDay());
    el('div', 'tag', c, seen === null ? 'NEW!' : seen <= 1 ? '' : `Last seen ${seen}d ago`).classList.toggle('new', seen === null);
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
    const art = el('canvas', 'art', box); // turning 3D preview, like the OG shop's item inspect
    turntable(item, art, P.data.equipped.outfit);
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
    for (const t of ['outfit', 'backbling', 'paint', 'emote', 'wrap']) {
      const it = BY_ID[P.data.equipped[t]];
      const s = el('div', 'lslot' + (this.lockerType === t ? ' sel' : ''), slots);
      const img = el('img', '', s); img.src = thumbnail(it, P.data.equipped.outfit);
      el('div', 'lbl', s, TYPE_NAMES[t]);
      el('div', 'nm', s, it.name);
      s.onclick = () => { this.click(); this.lockerType = t; this.renderLobby(); if (t === 'emote') this.G.lobby.playEmote(BY_ID[P.data.equipped.emote].anim); if (t === 'wrap') this.G.lobby.showWeapon(BY_ID[P.data.equipped.wrap].wrap); };
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
    this.G.paused = !this.G.net; // multiplayer matches keep running
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
    const bpText = p.mods.has('blueprints') ? 'You know every gun mod blueprint (Engineer).' : p.blueprints.size ? `Blueprints learned: ${[...p.blueprints].map((id) => MODS[id].name).join(', ')} (${p.blueprints.size}/${BLUEPRINT_MODS.length})` : `No gun mod blueprints yet (0/${BLUEPRINT_MODS.length}). Find them in gun shops, crates and supply drops.`;
    el('div', 'desc', right, `<br>📐 ${bpText}`);
    el('div', 'desc', right, `<br>Carried loot value: <b style="color:#ffd23f">${p.lootValue()}</b> — extract to cash it in as Shards.`);
  }
  // ---------------- weapon workbench ----------------
  openWorkbench(bench) {
    const o = this.openOverlay();
    this.overlayKind = 'bench';
    this.bench = bench;
    this.benchPreview = null;
    const p = this.G.player;
    const guns = this.benchGuns();
    const held = p.activeWeapon();
    this.benchSel = guns.find((g) => g.s === held && canMod(g.s.id)) || guns.find((g) => canMod(g.s.id)) || guns[0] || null;
    this.benchBox = el('div', 'bench', o);
    this.renderWorkbench();
    o.onclick = (e) => { if (e.target === o) this.closeOverlay(); };
  }
  benchGuns() {
    const p = this.G.player, out = [];
    for (const list of [p.inv.slots, p.inv.pack]) for (let i = 0; i < list.length; i++) { const s = list[i]; if (s && WEAPONS[s.id] && !WEAPONS[s.id].melee) out.push({ list, i, s }); }
    return out;
  }
  renderWorkbench() {
    const G = this.G, p = G.player, box = this.benchBox;
    if (!box) return;
    box.innerHTML = '';
    const top = el('div', 'bench-top', box);
    el('h1', 'display', top, 'Workbench');
    el('div', 'bench-mats', top, `<span>Wood <b>${p.inv.mats.wood}</b></span><span>Metal <b>${p.inv.mats.metal}</b></span>`);
    const close = el('button', 'btn ghost', top, 'Close'); close.onclick = () => { this.click(); this.closeOverlay(); };
    const guns = this.benchGuns();
    if (!guns.length) { el('div', 'desc', box, 'You have no guns to work on. Find one and come back — benches stay where they are.'); return; }
    if (this.benchSel && this.benchSel.list[this.benchSel.i] !== this.benchSel.s) this.benchSel = guns[0];
    const tabs = el('div', 'bench-guns', box);
    for (const gref of guns) {
      const def = WEAPONS[gref.s.id], n = Object.keys(gref.s.mods || {}).length;
      const t = el('button', 'bench-gun' + (this.benchSel?.s === gref.s ? ' sel' : ''), tabs, `<b>${def.name}</b><small>${RARITY[gref.s.r]}${canMod(gref.s.id) ? (n ? ` · ${n} mod${n > 1 ? 's' : ''}` : '') : ' · can\'t be modded'}</small>`);
      t.style.setProperty('--rc', RARITY_HEX[gref.s.r]);
      t.onclick = () => { this.click(); this.benchSel = gref; this.benchPreview = null; this.renderWorkbench(); };
    }
    const s = this.benchSel.s, def = WEAPONS[s.id];
    const main = el('div', 'bench-main', box);
    const L = el('div', 'bench-left', main), R = el('div', 'bench-right', main);
    const pic = el('div', 'bench-pic', L);
    pic.style.setProperty('--rc', RARITY_HEX[s.r]);
    const img = el('img', '', pic); img.src = gunThumb(s.id, def.model, s.r, s.mods); img.alt = def.name;
    el('div', 'bench-name', L, `<span style="color:${RARITY_HEX[s.r]}">${RARITY[s.r]}</span> ${def.name} <small>${AMMO[def.ammo].name}</small>`);
    this.benchStatsEl = el('div', 'bench-stats', L);
    this.renderBenchStats();
    if (!canMod(s.id)) { el('div', 'desc', R, `The ${def.name} can't be modified.`); return; }
    el('div', 'desc bench-help', R, 'Every mod has a trade-off. Installing replaces what\'s in that slot. Working here is noisy.');
    // advanced mods stay hidden until you have their blueprint
    const locked = Object.values(MODS).filter((m) => m.guns.includes(s.id) && !knowsMod(p, m)).length;
    if (locked) el('div', 'bench-locked', R, `📐 <b>${locked} more mod${locked > 1 ? 's' : ''}</b> for this gun need${locked > 1 ? '' : 's'} a blueprint. Find blueprints in gun shops, crates and supply drops — or play as the Engineer, who knows them all.`);
    for (const [k, label] of slotsFor(s.id)) {
      const cur = s.mods?.[k];
      const options = modsFor(s.id, k).filter((m) => knowsMod(p, m) || m.id === cur);
      if (!options.length) continue;
      const row = el('div', 'bench-slot', R);
      const head = el('div', 'bench-slot-h', row, `<b>${label}</b><span>${cur ? MODS[cur].name : 'Standard'}</span>`);
      if (cur) {
        const rm = el('button', 'btn ghost small', head, 'Remove');
        rm.onclick = () => { this.click(); removeMod(p, s, k); p.refreshModel(); G.audio?.play('reload', null, { vol: 0.4 }); this.renderWorkbench(); };
      }
      const opts = el('div', 'bench-opts', row);
      for (const m of options) {
        const cost = costFor(p, m), on = cur === m.id, afford = canAfford(p, cost);
        const c = el('div', 'modcard' + (on ? ' on' : ''), opts);
        c.innerHTML = `<div class="mc-name">${m.name}</div><ul>${modLines(m).map((l) => `<li class="${l.good ? 'up' : 'down'}">${l.good ? '▲' : '▼'} ${l.text}</li>`).join('')}</ul><div class="mc-cost${afford || on ? '' : ' short'}">${costText(cost)}</div>`;
        const b = el('button', 'btn small' + (on ? ' ghost' : afford ? ' lime' : ''), c, on ? 'Installed' : afford ? 'Install' : 'Need materials');
        b.disabled = on || !afford || !knowsMod(p, m);
        b.onclick = (e) => {
          e.stopPropagation();
          if (!installMod(p, s, m.id)) return;
          this.click();
          G.audio?.play('hammer', null, { vol: 0.55 });
          G.emitNoise(p.pos.x, p.pos.z, 30, p, 'craft');
          G.hud.toast(true, `${m.name} installed on your ${def.name}`);
          p.refreshModel();
          this.benchPreview = null;
          this.renderWorkbench();
        };
        c.onmouseenter = () => { this.benchPreview = on ? null : m.id; this.renderBenchStats(); };
        c.onmouseleave = () => { this.benchPreview = null; this.renderBenchStats(); };
      }
    }
  }
  renderBenchStats() {
    const s = this.benchSel?.s, host = this.benchStatsEl;
    if (!s || !host) return;
    const st = gunStats(s);
    let pv = null;
    if (this.benchPreview) { const m = MODS[this.benchPreview]; pv = gunStats({ id: s.id, r: s.r, mods: { ...(s.mods || {}), [m.slot]: m.id } }); }
    const accScore = (sp, ref) => Math.round(100 * (1 - Math.min(1, Math.sqrt(sp / ref))));
    const rows = [
      [st.pellets ? 'Damage (all pellets)' : 'Damage', (x) => x.dmg * (x.pellets || 1), (v) => Math.round(v), 130],
      ['Fire rate', (x) => x.rate * x.hipRate, (v, x) => v.toFixed(1) + '/s' + (x.hipRate > 1 ? ` hip · ${x.rate.toFixed(1)} aimed` : ''), 13],
      ['Aimed accuracy', (x) => accScore(x.adsSpread, 0.07), (v) => v, 100],
      ['Hip accuracy', (x) => accScore(x.spread, 0.12), (v) => v, 100],
      ['Range', (x) => x.range, (v) => Math.round(v) + ' m', 900],
      ['Magazine', (x) => x.mag, (v) => v, 75],
      ['Reload', (x) => 4 - x.reload, (v, x) => x.reload.toFixed(1) + ' s', 3.6],
      ['Recoil control', (x) => 100 - Math.min(100, x.recoil * 1300), (v) => Math.round(v), 100],
      ['Quietness', (x) => 300 - x.noise, (v, x) => `heard ${Math.round(x.noise)} m`, 300],
      ['Move speed', (x) => x.move * 100, (v) => Math.round(v) + '%', 110],
    ];
    host.innerHTML = rows.map(([label, f, fmt, max]) => {
      const v = f(st), w = Math.max(2, Math.min(100, (v / max) * 100));
      let delta = '';
      if (pv) { const v2 = f(pv); if (Math.abs(v2 - v) > 1e-6) { const w2 = Math.max(2, Math.min(100, (v2 / max) * 100)); delta = `<i class="${v2 > v ? 'up' : 'down'}" style="left:${Math.min(w, w2)}%;width:${Math.abs(w2 - w)}%"></i>`; } }
      const txt = pv && Math.abs(f(pv) - v) > 1e-6 ? `${fmt(v, st)} → <b class="${f(pv) > v ? 'up' : 'down'}">${fmt(f(pv), pv)}</b>` : fmt(v, st);
      return `<div class="bs-row"><span>${label}</span><div class="bs-bar"><em style="width:${w}%"></em>${delta}</div><span class="bs-val">${txt}</span></div>`;
    }).join('');
  }
  describe(def, s) {
    if (def.type === 'trowel') return 'Hold it to lay a brick wall where you stand (30 stone), or a wall with a window to see and shoot through (25 stone). R switches. Click to lay bricks — it takes a few seconds and it\'s loud.';
    if (def.type === 'blueprint') return 'Learn it to build this mod at any weapon workbench.';
    if (def.type === 'weapon') {
      if (def.melee) return `Melee · ${def.dmg[s.r]} damage · silent<br><small>${def.blurb || ''}</small>`;
      const st = gunStats(s);
      const rate = st.hipRate > 1 ? `${(st.rate * st.hipRate).toFixed(1)}/s hip · ${st.rate.toFixed(1)}/s aimed` : `${st.rate.toFixed(1)}/s`;
      const modNames = Object.values(s.mods || {}).map((id) => MODS[id]?.name).filter(Boolean);
      return `${Math.round(st.dmg)}${st.pellets ? '×' + st.pellets : ''} dmg · ${rate} · mag ${st.mag} · ${AMMO[st.ammo].name}${st.suppressed ? ' · <b style="color:#9bff57">Quiet</b>' : ` · heard ${Math.round(st.noise)}m away`}`
        + (modNames.length ? `<br><b style="color:#ffd23f">Mods:</b> ${modNames.join(', ')}` : '') + `<br><small>${def.blurb || ''}</small>`;
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
    el('div', 'maplegend', box, '<span style="color:#9bff57">●</span> Horde &nbsp; <span style="color:#ffd23f">●</span> Riverboat &nbsp; <span style="color:#ff4d4d">●</span> Evac &nbsp; <span style="color:#4fb3ff">●</span> Supply drop &nbsp; <span style="color:#ff8a3a">●</span> Your marker &nbsp; <span style="color:#f0a020">■</span> Workbench<br>Click to place a marker · M / Esc to close');
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
      for (const b of G.hud.benches()) { const [bx, by] = toS(b.x, b.z); G.hud.drawBench(x, bx, by, 1.4); }
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
    if (this.G.net?.isHost && !this.G.net.closed) el('div', 'toast', box, 'Other players are still in your match. Leaving this screen closes the server for everyone.').style.cssText = 'position:static;opacity:1;margin-bottom:10px';
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
