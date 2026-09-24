/* The in-trip HUD for PC: the Loop meter (or a place's threat meter), the train map or a minimap, the boss
   bar, health, abilities, the snack belt, interaction prompts, damage numbers and the loot feed, plus the
   trip's title card, the pause menu (with settings and key bindings) and the backpack screen. */
(function () {
  'use strict';
  const D = DT.data;
  const U = DT.U;
  const M = DT.meta;
  const UI = DT.ui;
  const GF = DT.game.gfx;
  const IN = DT.game.input;
  const esc = U.esc;
  const icon = DT.icon;
  const HUD = {};
  let E = null, cur = null, menu = null, sig = '', objT = 0, bannerT = 0, noteT = 0, hurtT = 0;
  const pops = [];
  const feed = [];
  HUD.isMenuOpen = () => !!menu;
  HUD.menu = () => menu;

  const BUFFS = {
    cry: ['volume', 'Battle Cry'], candy: ['star', 'Sugar rush'], copter: ['wind', 'Helicopter Arms'], mega: ['fist', 'Mega Jake'], giant: ['arrowUp', 'Giant'],
    potion: ['potion', 'Science!'], pancakeBuff: ['pancake', 'Pancake Party'], snack: ['heart', 'Snack power'], parry: ['shield', 'Parry'], storm: ['sparkle', 'Sword Storm'],
    invuln: ['crystal', 'Invincible'], ball: ['ball', 'Bouncy Ball'], sandwich: ['heart', 'Perfect Sandwich'], hotsauce: ['flame', 'Hot sauce'],
  };

  function build(r) {
    const h = r.local;
    const H = D.HEROES[h.id];
    const root = document.getElementById('hud');
    root.innerHTML = `
      <div class="h-top">
        <div class="h-route${r.train.site ? ' site' : ''}"><div class="h-line">${icon(r.train.site ? 'map' : 'train')} <b>${esc(r.train.line.name)}</b><span>${esc(D.MODS[r.offer.mod] ? D.MODS[r.offer.mod].name : '')}</span></div><div class="h-map" id="h-map"></div><div class="h-obj" id="h-obj"></div></div>
        <div class="h-loop" id="h-loop"><div class="h-loop-l">${icon(r.train.site ? 'alert' : 'loop')} <b id="h-loop-t">${esc(threatName(r))}</b><span id="h-loop-s"></span></div><div class="h-loop-bar"><i id="h-loop-f"></i><em></em></div></div>
        <div class="h-carry"><span id="h-bag">${icon('bag')} 0/0</span><span id="h-gold">${icon('coin')} 0</span><span id="h-trophy" hidden>${icon('trophy')} Trophy!</span></div>
      </div>
      <div class="h-boss" id="h-boss" hidden><div class="h-boss-n"><b id="h-boss-name"></b><span id="h-boss-ph"></span></div><div class="h-boss-bar"><i id="h-boss-f"></i><em id="h-boss-l"></em></div></div>
      <div class="h-feed" id="h-feed"></div>
      <div class="h-banner" id="h-banner"></div>
      <div class="h-note" id="h-note"></div>
      <div class="h-cross" id="h-cross"><i></i><i></i><i></i><i></i></div>
      <div class="h-prompt" id="h-prompt" hidden><span class="h-ring" id="h-ring"></span><kbd>${esc(IN.label('interact'))}</kbd><span id="h-prompt-t"></span></div>
      <div class="h-card" id="h-card"></div>
      <div class="h-bottom">
        <div class="h-hero">
          <div class="h-portrait" style="--c:${H.color}">${UI.art.portrait(h.id)}<span id="h-lvl">${r.G.chars[h.id].level}</span></div>
          <div class="h-vitals"><div class="h-name">${esc(H.name)} <small>${esc(H.title)}</small></div>
            <div class="h-hp"><i id="h-hp-f"></i><b id="h-hp-s"></b><em id="h-hp-t"></em></div>
            <div class="h-sub"><span class="h-dash" id="h-dash" title="${esc(H.dashName)} (${esc(IN.labels('dash').join(' / '))})"></span><span class="h-buffs" id="h-buffs"></span></div>
          </div>
        </div>
        <div class="h-abil" id="h-abil"></div>
        <div class="h-belt" id="h-belt"></div>
      </div>
      <div class="h-vig" id="h-vig"></div>
      <div class="h-over" id="h-over"></div>`;
    E = {};
    for (const id of ['h-map', 'h-obj', 'h-loop', 'h-loop-t', 'h-loop-s', 'h-loop-f', 'h-bag', 'h-gold', 'h-trophy', 'h-boss', 'h-boss-name', 'h-boss-ph', 'h-boss-f', 'h-boss-l', 'h-feed', 'h-banner', 'h-note', 'h-cross', 'h-prompt', 'h-ring', 'h-prompt-t', 'h-lvl', 'h-hp-f', 'h-hp-s', 'h-hp-t', 'h-dash', 'h-buffs', 'h-abil', 'h-belt', 'h-vig', 'h-over', 'h-card']) E[id.slice(2)] = document.getElementById(id);
    E.root = root;
    buildMap(r);
    buildBars(r);
  }
  const threatName = (r) => (r.train.site ? r.train.site.threat.name : 'THE LOOP');
  function buildMap(r) {
    if (r.train.site) { buildSiteMap(r); return; }
    const T = r.train;
    const total = T.maxX - T.minX;
    E.map.innerHTML = T.cars.map((c) => {
      const w = ((c.x1 - c.x0) / total) * 100, l = ((c.x0 - T.minX) / total) * 100;
      const marks = [];
      if (c.type === 'boss') marks.push(icon('skull'));
      else if (c.type === 'engine') marks.push(icon('train'));
      else if (c.type === 'vault') marks.push(icon('gem'));
      if (c.bailout) marks.push(`<span class="exit">${icon('door')}</span>`);
      if (T.chests.some((ch) => ch.car === c.i)) marks.push(`<span class="ch" data-car="${c.i}">${icon('chest')}</span>`);
      return `<div class="h-car t-${c.type}" data-i="${c.i}" style="left:${l}%;width:${w}%">${marks.join('')}</div>`;
    }).join('') + '<div class="h-me" id="h-me"></div>';
    E.me = document.getElementById('h-me');
    E.cars = [...E.map.querySelectorAll('.h-car')];
  }
  /* Off the train: a little map of the rooms you've found (and the ones next to them), drawn in world
     units so the hero arrow can move on it directly. The boss room is always marked. */
  function buildSiteMap(r) {
    const T = r.train, pad = 3;
    const w = T.maxX - T.minX + pad * 2, h = T.maxZ - T.minZ + pad * 2;
    let x = `<svg class="h-mini" viewBox="${(T.minX - pad).toFixed(1)} ${(T.minZ - pad).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet">`;
    for (const L of T.links) {
      const R = T.walk[L.rect];
      x += `<rect class="mm-hall" data-a="${L.a}" data-b="${L.b}" x="${R.x0.toFixed(1)}" y="${R.z0.toFixed(1)}" width="${(R.x1 - R.x0).toFixed(1)}" height="${(R.z1 - R.z0).toFixed(1)}"/>`;
    }
    for (const c of T.cars) {
      x += `<rect class="mm-room t-${c.type}" data-i="${c.i}" x="${c.x0.toFixed(1)}" y="${c.z0.toFixed(1)}" width="${(c.x1 - c.x0).toFixed(1)}" height="${(c.z1 - c.z0).toFixed(1)}" rx="1.2"/>`;
    }
    const mark = (c, cls, glyph, dx) => `<text class="mm-mark ${cls}" data-i="${c.i}" x="${(c.cx + (dx || 0)).toFixed(1)}" y="${(c.cz + 1.8).toFixed(1)}">${glyph}</text>`;
    for (const c of T.cars) {
      if (c.type === 'boss') x += mark(c, 'boss', '☠');
      else if (c.type === 'vault') x += mark(c, 'vault', '◆');
      else if (c.type === 'entrance') x += mark(c, 'ent', '★');
      if (c.bailout) { const p = DT.game.world.doorPoint(c, c.bailout); x += `<circle class="mm-exit" data-i="${c.i}" cx="${(p.x + p.nx * 1.5).toFixed(1)}" cy="${(p.z + p.nz * 1.5).toFixed(1)}" r="1.6"/>`; }
    }
    x += `<g id="h-me" class="mm-me"><circle r="2.2"/><path d="M0 4.6L2.4 0.6H-2.4Z"/></g></svg>`;
    E.map.innerHTML = x;
    E.me = document.getElementById('h-me');
    E.rooms = [...E.map.querySelectorAll('.mm-room')];
    E.halls = [...E.map.querySelectorAll('.mm-hall')];
    E.marks = [...E.map.querySelectorAll('.mm-mark, .mm-exit')];
  }
  function buildBars(r) {
    const h = r.local, G = r.G, C = G.chars[h.id], S = h.S;
    let a = `<div class="h-slot prim" title="Primary attack (hold)"><span class="h-ico">${icon(h.id === 'finn' ? 'sword' : 'fist')}</span><kbd>${esc(IN.label('attack'))}</kbd></div>`;
    for (let i = 0; i < 4; i++) {
      const id = C.bars[i];
      const locked = i >= S.abilitySlots;
      a += `<div class="h-slot${locked ? ' locked' : id ? '' : ' empty'}" data-i="${i}" title="${id ? esc(D.ABILITIES[id].name) : locked ? 'Locked' : 'Empty — bind an ability in Loadout'}"><span class="h-ico">${locked ? icon('lock') : id ? icon(D.ABILITIES[id].icon) : ''}</span><span class="h-cd"></span><b class="h-cdt"></b><kbd>${esc(IN.label('ab' + i))}</kbd></div>`;
    }
    a += `<div class="h-slot super" id="h-super" title="${esc(D.SUPERS[h.id].name)}"><span class="h-fill"></span><span class="h-ico">${icon(D.SUPERS[h.id].icon)}</span><kbd>${esc(IN.label('super'))}</kbd></div>`;
    E.abil.innerHTML = a;
    E.slots = [...E.abil.querySelectorAll('.h-slot[data-i]')];
    E.super = document.getElementById('h-super');
    buildBelt(r);
  }
  function beltSig(r) { const C = r.G.chars[r.heroId]; return C.belt.map((b) => (b ? b.base + ':' + b.qty : '-')).join('|') + '/' + r.local.S.belt; }
  function buildBelt(r) {
    const C = r.G.chars[r.heroId], S = r.local.S;
    let b = '';
    for (let i = 0; i < S.belt; i++) {
      const it = C.belt[i];
      b += `<div class="h-snack${it ? ' r' + it.rarity : ' empty'}" title="${it ? esc(it.name) : 'Empty'}">${it ? UI.art.art(it) : ''}${it && it.qty > 1 ? `<b>${it.qty}</b>` : ''}<kbd>${esc(IN.label('belt' + i))}</kbd></div>`;
    }
    E.belt.innerHTML = b;
    sig = beltSig(r);
  }

  HUD.show = function (r) {
    cur = r;
    menu = null;
    feed.length = 0;
    for (const p of pops) p.el.remove();
    pops.length = 0;
    build(r);
    const root = document.getElementById('hud');
    root.hidden = false;
    document.body.classList.add('in-raid');
    HUD.refresh(r);
  };
  HUD.hide = function () {
    const root = document.getElementById('hud');
    root.hidden = true;
    root.innerHTML = '';
    for (const p of pops) p.el.remove();
    pops.length = 0;
    document.body.classList.remove('in-raid');
    E = null; cur = null; menu = null;
    UI.tipHide();
  };
  /* Rebuild the parts that only change when gear/bars change. */
  HUD.refresh = function (r) {
    if (!E || !r) return;
    buildBars(r);
    E.lvl.textContent = r.G.chars[r.heroId].level;
    const k = E.prompt.querySelector('kbd');
    if (k) k.textContent = IN.label('interact');
    renderOverlay(r);
  };

  /* ---------- messages ---------- */
  HUD.popup = function (x, y, z, text, cls) {
    if (!E) return;
    if (pops.length > 44) { const o = pops.shift(); o.el.remove(); }
    const el = document.createElement('div');
    el.className = 'pop ' + (cls || '');
    el.textContent = text;
    document.getElementById('dmg-layer').appendChild(el);
    pops.push({ el, x, y, z, t: 0, dur: cls === 'crit' || /^r\d/.test(cls || '') ? 1.2 : 0.85, dx: (Math.random() - 0.5) * 30 });
  };
  HUD.banner = function (text, cls) {
    if (!E) return;
    E.banner.className = 'h-banner on ' + (cls || '');
    E.banner.textContent = text;
    bannerT = cls === 'route' ? 2.2 : 3;
    void E.banner.offsetWidth;
  };
  HUD.note = function (text, secs) {
    if (!E) return;
    E.note.textContent = text;
    E.note.classList.add('on');
    noteT = secs || 3;
  };
  HUD.hurt = function () { hurtT = 0.35; };
  HUD.loot = function (it) {
    if (!E) return;
    const el = document.createElement('div');
    el.className = 'lf r' + it.rarity;
    el.innerHTML = `${UI.art.art(it)}<div><b>${esc(it.name)}</b><small>${esc(it.kind === 'consumable' ? 'Snack' : it.kind === 'valuable' ? 'Treasure' : it.kind === 'trophy' ? 'Boss trophy' : UI.rarity(it.rarity).name + ' ' + D.KINDS[it.kind].label)}</small></div>`;
    E.feed.prepend(el);
    feed.unshift({ el, t: 0 });
    while (feed.length > 5) feed.pop().el.remove();
  };

  /* ---------- per-frame ---------- */
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function objective(r) {
    const T = r.train, site = T.site;
    const car = T.cars[r.carIdx];
    const inRoom = car && DT.game.world.inRoom(T, car, r.local.x, r.local.z, 0);
    if (r.tunnel != null) return { t: site ? `${site.threat.end}! Get out: a green exit${r.bossDown ? ', the way home' : ''} or a Rainicorn flare.` : 'GET OFF THE TRAIN! Find a green jump-off door or use a Rainicorn flare.', cls: 'bad' };
    if (r.trophy) return { t: site ? 'You have the trophy! Get out: the way home in the boss room, a green exit, or a Rainicorn flare.' : 'You have the trophy! Escape: a green jump-off door, the engine brake, or a Rainicorn flare.', cls: 'good' };
    if (r.boss && !r.boss.dead) return { t: `Defeat ${r.boss.name}!`, cls: 'bad' };
    if (site && r.bossDown) return { t: 'Take the way home in the boss room (hold E) for bonus loot and XP!', cls: 'good' };
    if (car && car.type === 'engine') return T.line.final && !r.bossDown ? { t: `${D.ENEMIES[T.line.boss].name} waits in the boss car.` } : { t: 'Pull the emergency brake (hold E) for bonus loot and XP!', cls: 'good' };
    if (car && car.lock && !car.lock.open) return { t: 'Locked vault: smash the gate or use a Skeleton Key.' };
    const left = inRoom ? r.enemies.filter((e) => !e.dead && e.car === r.carIdx).length : 0;
    if (left) return { t: `Defeat ${U.plural(left, 'monster')} in this ${site ? 'room' : 'car'} to unlock its chest.` };
    const chest = inRoom && T.chests.find((c) => c.car === r.carIdx && !c.opened);
    if (chest) return { t: chest.keyLocked ? 'This chest needs a Skeleton Key.' : 'Open the chest (hold E)!', cls: 'good' };
    if (r.loop > 0.75) return { t: site ? `${site.threat.name}: think about getting out!` : 'The Loop is closing — think about getting off!', cls: 'bad' };
    return { t: site ? site.goal : 'Head to the next car. Get off at a green door or the engine before the Loop closes.' };
  }
  function updateSiteMap(r) {
    const T = r.train;
    const seen = new Set();
    for (const c of T.cars) if (c.entered || c.type === 'boss') seen.add(c.i);
    /* rooms next to one you've been in show up as outlines */
    const near = new Set(seen);
    for (const L of T.links) { if (T.cars[L.a].entered) near.add(L.b); if (T.cars[L.b].entered) near.add(L.a); }
    for (const el of E.rooms) {
      const c = T.cars[+el.dataset.i];
      el.classList.toggle('cur', c.i === r.carIdx);
      el.classList.toggle('seen', seen.has(c.i));
      el.classList.toggle('near', near.has(c.i) && !seen.has(c.i));
      el.classList.toggle('done', !!c.cleared && c.entered);
      el.classList.toggle('chest', T.chests.some((ch) => ch.car === c.i && !ch.opened && !ch.locked));
    }
    for (const el of E.halls) el.classList.toggle('seen', T.cars[+el.dataset.a].entered || T.cars[+el.dataset.b].entered);
    for (const el of E.marks) el.classList.toggle('on', near.has(+el.dataset.i));
  }
  /* The trip opens on an episode-style title card: an aged-paper frame and the place's name in big
     cartoon letters, like the show's title cards. */
  HUD.titleCard = function (r) {
    if (!E) return;
    const line = r.train.line, site = r.train.site;
    const boss = D.ENEMIES[line.boss];
    E.card.innerHTML = `<div class="tcard"><div class="tc-paper"><small>${site ? 'Off the train' : 'The Dungeon Train'} · Tier ${line.tier}${line.branch ? ' · side trip' : line.post ? ' · post-game' : ''}</small><h1>${esc(line.name)}</h1><p>${esc(site ? site.intro : 'Somewhere up ahead: ' + boss.name + '.')}</p></div></div>`;
    E.card.classList.remove('on');
    void E.card.offsetWidth;
    E.card.classList.add('on');
    clearTimeout(HUD.cardT);
    HUD.cardT = setTimeout(() => { if (E && E.card) E.card.classList.remove('on'); }, 3600);
  };
  HUD.update = function (r, dt) {
    if (!E) return;
    const h = r.local, S = h.S, C = r.G.chars[h.id];
    /* health */
    const hpF = U.clamp(h.hp / h.maxHp, 0, 1);
    E['hp-f'].style.width = (hpF * 100).toFixed(1) + '%';
    const sh = h.buffs.shield ? U.clamp(h.buffs.shield.hp / h.maxHp, 0, 1) : 0;
    E['hp-s'].style.width = (sh * 100).toFixed(1) + '%';
    E['hp-t'].textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
    E['hp-f'].parentNode.classList.toggle('low', hpF < 0.3);
    /* dash pips */
    let pips = '';
    for (let i = 0; i < S.dashCharges; i++) pips += `<i class="${i < h.dashCharges ? 'on' : ''}" style="--p:${i === h.dashCharges ? (h.dashT / S.dashCdFinal) * 100 : 0}%"></i>`;
    if (E.dash.dataset.v !== pips) { E.dash.innerHTML = pips; E.dash.dataset.v = pips; }
    /* buffs */
    let bf = '';
    for (const k in BUFFS) { const v = h.buffs[k]; if (typeof v === 'number' && v > 0.05) bf += `<span title="${BUFFS[k][1]}">${icon(BUFFS[k][0])}<b>${Math.ceil(v)}</b></span>`; }
    if (h.buffs.shield) bf += `<span title="Shield">${icon('shield')}<b>${Math.ceil(h.buffs.shield.hp)}</b></span>`;
    if (h.st.chill > 0) bf += `<span class="bad" title="Chilled">${icon('snow')}</span>`;
    if (h.st.burn > 0) bf += `<span class="bad" title="Burning">${icon('flame')}</span>`;
    if (h.st.stun > 0 || h.st.freeze > 0) bf += `<span class="bad" title="Stunned">${icon('star')}</span>`;
    if (h.st.root > 0) bf += `<span class="bad" title="Rooted">${icon('vine')}</span>`;
    if (E.buffs.dataset.v !== bf) { E.buffs.innerHTML = bf; E.buffs.dataset.v = bf; }
    /* abilities */
    for (const el of E.slots) {
      const i = +el.dataset.i, id = C.bars[i];
      if (!id) continue;
      const cd = h.cds[id] || 0, max = (h.cdMax && h.cdMax[id]) || D.ABILITIES[id].cd;
      el.style.setProperty('--cd', cd > 0 ? ((cd / max) * 360).toFixed(0) + 'deg' : '0deg');
      el.classList.toggle('cooling', cd > 0);
      el.querySelector('.h-cdt').textContent = cd > 0 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
    }
    const m = r.superAct || h.buffs.mega > 0 ? 100 : r.meter;
    E.super.style.setProperty('--m', m.toFixed(1) + '%');
    E.super.classList.toggle('ready', r.meter >= 100 && !r.superAct);
    E.super.classList.toggle('active', !!r.superAct || h.buffs.mega > 0);
    if (beltSig(r) !== sig) buildBelt(r);
    /* carry */
    E.bag.innerHTML = `${icon('bag')} ${r.backpack.length}/${S.backpack}`;
    E.bag.classList.toggle('full', r.backpack.length >= S.backpack);
    E.gold.innerHTML = `${icon('coin')} ${U.fmt(r.gold)}`;
    E.trophy.hidden = !r.trophy;
    /* loop */
    if (r.tunnel != null) {
      E.loop.classList.add('tunnel');
      E['loop-t'].textContent = r.train.site ? 'GET OUT!' : 'LOOP TUNNEL';
      E['loop-s'].textContent = fmtTime(r.tunnel);
      E['loop-f'].style.width = ((r.tunnel / 25) * 100).toFixed(1) + '%';
    } else {
      E.loop.classList.remove('tunnel');
      E['loop-t'].textContent = threatName(r);
      E['loop-s'].textContent = fmtTime(r.loopMax - r.loopT) + ' left';
      E['loop-f'].style.width = (r.loop * 100).toFixed(1) + '%';
      E.loop.classList.toggle('warn', r.loop > 0.75);
    }
    /* boss */
    const b = r.boss && !r.boss.dead ? r.boss : null;
    E.boss.hidden = !b;
    if (b) {
      E['boss-name'].textContent = b.name;
      E['boss-f'].style.width = ((b.hp / b.maxHp) * 100).toFixed(1) + '%';
      E['boss-l'].textContent = `${U.fmt(Math.max(0, b.hp))} / ${U.fmt(b.maxHp)}`;
      E['boss-ph'].innerHTML = [0, 1, 2].map((i) => `<i class="${i <= (b.phase || 0) ? 'on' : ''}"></i>`).join('');
    }
    /* map */
    const T = r.train;
    if (T.site) E.me.setAttribute('transform', `translate(${h.x.toFixed(2)} ${h.z.toFixed(2)}) rotate(${((-h.facing * 180) / Math.PI).toFixed(1)})`);
    else E.me.style.left = (((h.x - T.minX) / (T.maxX - T.minX)) * 100).toFixed(2) + '%';
    if ((objT -= dt) <= 0) {
      objT = 0.25;
      if (T.site) updateSiteMap(r);
      else {
        for (const el of E.cars) {
          const c = T.cars[+el.dataset.i];
          el.classList.toggle('cur', c.i === r.carIdx);
          el.classList.toggle('done', !!c.cleared && c.entered);
          el.classList.toggle('seen', !!c.entered);
        }
        for (const el of E.map.querySelectorAll('.ch')) { const ci = +el.dataset.car; el.classList.toggle('open', T.chests.filter((c) => c.car === ci).every((c) => c.opened)); el.classList.toggle('ready', T.chests.some((c) => c.car === ci && !c.opened && !c.locked)); }
      }
      const o = objective(r);
      E.obj.textContent = o.t;
      E.obj.className = 'h-obj ' + (o.cls || '');
    }
    /* prompt */
    const I = r.interact;
    if (I.target && !h.ko && !r.pendingOver) {
      E.prompt.hidden = false;
      E['prompt-t'].textContent = I.target.label || '';
      E.prompt.classList.toggle('no', !I.target.ready);
      E.ring.style.setProperty('--p', ((I.p / I.target.time) * 100).toFixed(1) + '%');
    } else E.prompt.hidden = true;
    /* crosshair (red over a monster) */
    E.cross.hidden = !!menu || h.ko;
    E.cross.classList.toggle('hot', !!(h.aim && h.aim.target && !h.aim.target.dead));
    /* timers */
    if (bannerT > 0 && (bannerT -= dt) <= 0) E.banner.classList.remove('on');
    if (noteT > 0 && (noteT -= dt) <= 0) E.note.classList.remove('on');
    hurtT = Math.max(0, hurtT - dt);
    const low = hpF < 0.3 && !h.ko ? 0.35 + Math.sin(r.time * 6) * 0.15 : 0;
    E.vig.style.opacity = Math.max(hurtT * 2, low, r.tunnel != null ? 0.55 : 0).toFixed(2);
    E.vig.classList.toggle('tunnel', r.tunnel != null);
    for (let i = feed.length - 1; i >= 0; i--) { const f = feed[i]; f.t += dt; if (f.t > 4.5) { f.el.remove(); feed.splice(i, 1); } else if (f.t > 3.8) f.el.classList.add('out'); }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      if (p.t >= p.dur) { p.el.remove(); pops.splice(i, 1); continue; }
      const s = GF.toScreen(p.x, p.y + p.t * 1.1, p.z);
      if (s.behind) { p.el.style.opacity = 0; continue; }
      const k = p.t / p.dur;
      p.el.style.transform = `translate(${(s.x + p.dx * k).toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -50%) scale(${k < 0.12 ? 0.6 + k * 4 : 1})`;
      p.el.style.opacity = k > 0.7 ? ((1 - k) / 0.3).toFixed(2) : 1;
    }
    /* "click to play" when the mouse isn't captured */
    const needClick = IN.mode === 'lock' && !IN.locked && !menu && !r.pendingOver;
    if (needClick !== !!E.over.dataset.click) renderOverlay(r);
  };

  /* ---------- overlays: click-to-play, pause, backpack ---------- */
  const lab = (a) => IN.labels(a).join(' · ') || '—';
  HUD.controlsHtml = () => {
    const rows = [
      [['up', 'left', 'down', 'right'].map((a) => IN.label(a)).join(' '), 'Move (you always face where you look)'], ['Mouse', DT.settings.dragLook ? 'Hold the right button to look around' : 'Look around and aim'],
      [lab('attack'), 'Attack (hold)'], [lab('dash'), 'Dodge roll'], [[0, 1, 2, 3].map((i) => IN.label('ab' + i)).join(' '), 'Abilities'], [lab('super'), 'MATHEMATICAL! super'],
      [lab('interact') + ' (hold)', 'Open chests, doors, the brake'], [[0, 1, 2, 3, 4].map((i) => IN.label('belt' + i)).join(' '), 'Snacks'], [lab('inventory'), 'Backpack'], ['Esc · ' + lab('pause'), 'Pause'], ['Mouse wheel', 'Camera distance'],
    ];
    return `<div class="controls">${rows.map(([k, v]) => `<div><kbd>${esc(k)}</kbd><span>${esc(v)}</span></div>`).join('')}</div>`;
  };
  /* Key bindings: up to three keys (or mouse buttons, side buttons included) per action. */
  function bindRow(a) {
    const list = IN.binds()[a.id] || [];
    let x = `<span class="bind-name">${esc(a.label)}</span>`;
    for (let i = 0; i < IN.SLOTS; i++) {
      const code = list[i];
      const wait = capture && capture.action === a.id && capture.slot === Math.min(i, list.length);
      if (!code && i > list.length) { x += '<span class="bind-key none"></span>'; continue; }
      x += `<button class="bind-key${code ? '' : ' add'}${wait ? ' wait' : ''}" data-act="bind" data-action="${a.id}" data-slot="${i}" title="${code ? 'Click to change · right-click to clear' : 'Add a key'}">${wait ? 'Press a key…' : code ? esc(IN.codeLabel(code)) : '+'}</button>`;
    }
    return x;
  }
  let capture = null;
  HUD.keybindsHtml = function () {
    let x = '<div class="binds">';
    let group = null;
    for (const a of IN.ACTIONS) {
      if (a.group !== group) { if (group) x += '</div>'; group = a.group; x += `<div class="bind-group"><h5>${esc(group)}</h5>`; }
      x += `<div class="bind-row" data-action="${a.id}">${bindRow(a)}</div>`;
    }
    x += `</div><div class="bind-foot"><button class="btn small ghost" data-act="bind-reset">${icon('refresh')} Reset to defaults</button><span class="muted small">Click a key, then press any key or mouse button (the side buttons work too). Right-click a key to clear it. Esc cancels.</span></div></div>`;
    return x;
  };
  function refreshBinds() {
    document.querySelectorAll('.bind-row').forEach((el) => { const a = IN.ACTIONS.find((q) => q.id === el.dataset.action); if (a) el.innerHTML = bindRow(a); });
    document.querySelectorAll('.controls').forEach((el) => { el.outerHTML = HUD.controlsHtml(); });
    if (cur && E) { buildBars(cur); HUD.refresh(cur); }
  }
  HUD.startBind = function (action, slot) {
    const list = IN.binds()[action] || [];
    capture = { action, slot: Math.min(slot, list.length) };
    refreshBinds();
    IN.capture((code) => {
      const c = capture;
      capture = null;
      if (code && c) IN.bind(c.action, c.slot, code);
      refreshBinds();
    });
  };
  HUD.clearBind = function (action, slot) { if (IN.binds()[action] && IN.binds()[action][slot]) { IN.unbind(action, slot); refreshBinds(); } };
  HUD.resetBinds = function () { IN.resetBinds(); refreshBinds(); };
  function settingsHtml() {
    const s = DT.settings;
    const cd = s.camDist || 5.8;
    return `<div class="settings">
      <label><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume"><output>${Math.round(s.volume * 100)}%</output></label>
      <label><span>Mouse sensitivity</span><input type="range" min="0.2" max="3" step="0.05" value="${s.sens}" data-set="sens"><output>${(+s.sens).toFixed(2)}</output></label>
      <label><span>Camera distance</span><input type="range" min="2.6" max="8" step="0.1" value="${cd}" data-set="camDist"><output>${(+cd).toFixed(1)} m</output></label>
      <label><span>Field of view</span><input type="range" min="55" max="100" step="1" value="${s.fov}" data-set="fov"><output>${s.fov}°</output></label>
      <label class="chk"><input type="checkbox" data-set="invertY" ${s.invertY ? 'checked' : ''}><span>Invert mouse Y</span></label>
      <label class="chk"><input type="checkbox" data-set="dragLook" ${s.dragLook ? 'checked' : ''}><span>Hold the right mouse button to look (instead of capturing the mouse)</span></label>
      <label class="chk"><input type="checkbox" data-set="shake" ${s.shake !== false ? 'checked' : ''}><span>Screen shake</span></label>
      <label class="chk"><input type="checkbox" data-set="numbers" ${s.numbers !== false ? 'checked' : ''}><span>Damage numbers</span></label>
      <label class="chk"><input type="checkbox" data-set="invPause" ${s.invPause !== false ? 'checked' : ''}><span>Pause while the backpack is open</span></label>
      <label class="chk"><input type="checkbox" data-set="muted" ${s.muted ? 'checked' : ''}><span>Mute</span></label>
    </div>`;
  }
  HUD.settingsHtml = settingsHtml;
  function renderOverlay(r) {
    if (!E) return;
    const o = E.over;
    delete o.dataset.click;
    if (menu === 'pause') {
      o.className = 'h-over on dim';
      o.innerHTML = `<div class="pause panel"><h2>${icon('pause')} Paused</h2><div class="pause-cols"><div><button class="btn primary big" data-act="h-resume">${icon('play')} Resume</button><button class="btn ghost" data-act="h-inv">${icon('bag')} Backpack</button><button class="btn danger ghost" data-act="h-abandon">${icon('x')} Give up this trip</button><p class="muted small">Giving up counts as being knocked out: you lose what you’re wearing and carrying, except your ${esc(D.HEROES[r.heroId].safeName)}.</p><h4>Controls</h4>${HUD.controlsHtml()}</div><div><h4>Settings</h4>${settingsHtml()}</div><div class="pause-binds"><h4>Keys and buttons</h4>${HUD.keybindsHtml()}</div></div></div>`;
    } else if (menu === 'inventory') {
      o.className = 'h-over on dim inv-on';
      o.innerHTML = UI.loadout.renderRaid(r);
    } else if (IN.mode === 'lock' && !IN.locked && !r.pendingOver) {
      o.className = 'h-over on click';
      o.dataset.click = '1';
      o.innerHTML = `<button class="clickplay" data-act="h-lock"><b>${icon('mouse')} Click to play</b><span>Your mouse turns the camera, and your hero faces wherever you look. Press Esc any time to pause.</span></button>`;
    } else { o.className = 'h-over'; o.innerHTML = ''; }
  }
  HUD.render = renderOverlay;
  HUD.togglePause = function (r, force) {
    if (!E || r.pendingOver) return;
    const want = force != null ? force : menu !== 'pause';
    if (want) { menu = 'pause'; r.paused = true; IN.releaseLock(); IN.reset(); }
    else { menu = null; r.paused = false; IN.reset(); IN.capturing = null; capture = null; IN.requestLock(); }
    UI.tipHide();
    renderOverlay(r);
  };
  HUD.toggleInventory = function (r) {
    if (!E || r.pendingOver) return;
    if (menu === 'inventory') { HUD.closeMenus(r); return; }
    menu = 'inventory';
    UI.loadout.state.sel = null;
    r.paused = DT.settings.invPause !== false;
    IN.releaseLock();
    IN.held.clear();
    renderOverlay(r);
  };
  HUD.closeMenus = function (r) {
    menu = null;
    r.paused = false;
    IN.reset();
    UI.tipHide();
    IN.requestLock();
    renderOverlay(r);
  };

  /* Buttons inside the HUD overlays. Returns true if handled. */
  HUD.act = function (act, el) {
    const r = cur;
    if (!r) return false;
    const RA = DT.game.raid;
    switch (act) {
      case 'h-resume': HUD.togglePause(r, false); return true;
      case 'h-lock': IN.requestLock(); return true;
      case 'h-inv': menu = null; HUD.toggleInventory(r); return true;
      case 'inv-close': HUD.closeMenus(r); return true;
      case 'h-abandon': UI.confirm('Give up this trip?', `You’ll be treated as knocked out: everything ${esc(D.HEROES[r.heroId].name)} is wearing and carrying is lost, except the ${esc(D.HEROES[r.heroId].safeName)}.`, 'Give up', () => { menu = null; RA.abandon(); renderOverlay(r); }, { danger: true }); return true;
      case 'sel': case 'r-sel': {
        const uid = el.dataset.uid;
        UI.loadout.state.sel = uid;
        const box = document.getElementById('inv-card');
        if (box) box.innerHTML = UI.loadout.raidCard(r, uid);
        document.querySelectorAll('.inv .tile.sel').forEach((t) => t.classList.remove('sel'));
        el.classList.add('sel');
        return true;
      }
      case 'r-equip': { const res = RA.equipFromPack(el.dataset.uid); if (res !== 'ok') UI.toast(res, 'bad'); else { DT.sfx.play('equip'); UI.toast('Equipped!', 'good'); } UI.loadout.state.sel = null; renderOverlay(r); return true; }
      case 'r-drop': RA.dropFromPack(el.dataset.uid); UI.loadout.state.sel = null; renderOverlay(r); return true;
      case 'r-safe': { const res = RA.packToSafe(el.dataset.uid); if (res === 'full') UI.toast(`Your ${D.HEROES[r.heroId].safeName} is full.`, 'bad'); renderOverlay(r); return true; }
      case 'r-unsafe': { const res = RA.safeToPack(el.dataset.uid); if (res === 'full') UI.toast('Your backpack is full.', 'bad'); renderOverlay(r); return true; }
      default: return false;
    }
  };

  DT.ui.hud = HUD;
})();
