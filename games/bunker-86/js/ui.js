/* BUNKER '86 — HUD, panels, cards, toasts. */
(function (BK) {
  'use strict';

  const UI = BK.UI = {};
  let ST = null;                    // current state (set by main)
  let openPanel = null;
  let selectedCrew = null;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  UI.bind = function (st) { ST = st; };

  UI.init = function () {
    $('panel-close').addEventListener('click', () => UI.closePanel());
    document.querySelectorAll('#tabs button').forEach(b => {
      b.addEventListener('click', () => {
        BK.Audio.sfx('click');
        const p = b.dataset.panel;
        if (openPanel === p) UI.closePanel(); else UI.openPanel(p);
      });
    });
    $('btn-speed').addEventListener('click', () => {
      const order = [1, 2, 4];
      ST.speed = order[(order.indexOf(ST.speed) + 1) % order.length];
      BK.Audio.sfx('click');
      UI.updateHUD(ST);
    });
    $('placer-cancel').addEventListener('click', () => UI.exitBuild());
    $('placer-ok').addEventListener('click', () => UI.confirmBuild());
  };

  // =============================================================== HUD =====
  let lastRes = '';
  UI.updateHUD = function (st) {
    if (!st || st.gameOver) return;
    const p = st.player;
    $('hud-day').textContent = 'DAY ' + st.day;
    $('hud-time').textContent = BK.fmtClock(st.time.minutes);
    $('hud-place').textContent = BK.zoneAt(st.maps[st.mapId], p.x, p.y);
    $('btn-speed').textContent = (st.paused ? '❚❚ ' : '▶ ') + st.speed + '×';

    // resources
    const caps = BK.caps(st);
    const key = BK.RESOURCES.map(r => Math.floor(st.res[r.key])).join(',');
    if (key !== lastRes) {
      lastRes = key;
      const wrap = $('hud-res');
      wrap.innerHTML = '';
      for (const r of BK.RESOURCES) {
        const v = Math.floor(st.res[r.key] || 0);
        const low = v <= Math.max(3, caps[r.key] * 0.08);
        const n = el('div', 'res' + (low ? ' low' : ''));
        n.innerHTML = r.icon + ' ' + v + '<em>/' + caps[r.key] + '</em>';
        wrap.appendChild(n);
      }
    }

    // power + dread
    const pw = st.power || { supply: 0, demand: 0 };
    const ratio = pw.demand > 0 ? BK.clamp(pw.supply / pw.demand, 0, 1) : 1;
    const mp = $('m-power');
    mp.style.width = (ratio * 100).toFixed(0) + '%';
    mp.parentElement.classList.toggle('warn', ratio < 1);
    $('m-dread').style.width = st.dread.toFixed(0) + '%';

    // active survivor
    $('act-name').textContent = p.first.toUpperCase() + (p.auto ? '' : ' ·');
    $('act-state').textContent = stateLabel(st, p);
    const nw = $('act-needs');
    if (nw.children.length !== BK.NEEDS.length) {
      nw.innerHTML = '';
      for (const n of BK.NEEDS) { const d = el('div', 'nd'); d.appendChild(el('i')); d.title = n.label; nw.appendChild(d); }
    }
    BK.NEEDS.forEach((n, i) => {
      const v = p.needs[n.key];
      const d = nw.children[i];
      d.className = 'nd' + (v < 20 ? ' low' : v < 45 ? ' mid' : '');
      d.firstChild.style.width = v + '%';
    });
    $('v-hp').style.width = (p.health / p.maxHealth * 100) + '%';
    $('v-rad').style.width = p.rads + '%';
    $('v-san').style.width = p.sanity + '%';

    // action button context
    const f = st.focusProp;
    $('act-label').textContent = f ? actionVerb(f) : (p.pack.length ? 'DROP PACK' : '·');
    $('btn-torch').classList.toggle('on', p.flashlight && p.battery > 0);

    // damage vignette
    $('damage-vig').style.opacity = p.health < BK.effMaxHealth(p) * 0.4
      ? (0.35 + Math.sin(st.tSec * 4) * 0.12).toFixed(2) : 0;
  };

  function stateLabel(st, p) {
    if (!p.alive) return 'DEAD';
    if (p.breakdown > 0) return 'NOT RESPONDING';
    if (p.act) {
      const o = st.objects.find(x => x.id === p.act.objId);
      const def = o && BK.OBJECTS[o.type];
      const a = p.act.def;
      return (a.label || 'busy').toUpperCase() + (def ? ' — ' + def.name : '');
    }
    if (p.path) return 'MOVING';
    return p.auto ? 'FREE WILL' : 'AWAITING ORDERS';
  }

  function actionVerb(p) {
    if (p.kind === 'door') return p.open ? 'CLOSE' : 'OPEN';
    if (p.kind === 'hatch') return 'CLIMB';
    if (p.kind === 'rubble') return 'CLEAR';
    if (p.kind === 'note') return 'READ';
    if (p.kind === 'container') return p.looted ? 'EMPTY' : 'SEARCH';
    if (p.kind === 'furniture') return 'USE';
    return 'LOOK';
  }

  // ============================================================= panels ====
  UI.openPanel = function (name) {
    openPanel = name;
    $('panel').classList.remove('hidden');
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    const body = $('panel-body');
    body.scrollTop = 0;
    body.innerHTML = '';
    if (name === 'crew') { $('panel-title').textContent = 'CREW'; renderCrew(body); }
    else if (name === 'build') { $('panel-title').textContent = 'BUILD'; renderBuild(body); }
    else if (name === 'log') { $('panel-title').textContent = 'RADIO LOG'; renderLog(body); }
    else if (name === 'menu') { $('panel-title').textContent = 'SHELTER'; renderMenu(body); }
  };

  UI.closePanel = function () {
    openPanel = null;
    $('panel').classList.add('hidden');
    document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('active'));
  };

  UI.refreshPanel = function () { if (openPanel) UI.openPanel(openPanel); };

  // ------------------------------------------------------------- crew -----
  function faceFor(c) {
    if (!c.sheet) c.sheet = BK.makeCharSheet(c.look);
    const src = c.sheet[0][0];
    const out = BK.mk(30, 34, (g) => {
      g.imageSmoothingEnabled = false;
      g.drawImage(src, 5, 2, 30, 34, 0, 0, 30, 34);
    });
    return out.toDataURL();
  }

  function moodOf(c) {
    const avg = BK.NEEDS.reduce((a, n) => a + c.needs[n.key], 0) / BK.NEEDS.length;
    const m = avg * 0.6 + c.sanity * 0.4;
    if (!c.alive) return { t: '☠ GONE', c: 'var(--ink-dim)' };
    if (c.breakdown > 0) return { t: '☹ BROKEN', c: 'var(--red)' };
    if (m > 72) return { t: '☺ HOLDING UP', c: 'var(--green)' };
    if (m > 48) return { t: '· COPING', c: 'var(--ink)' };
    if (m > 26) return { t: '☹ FRAYING', c: 'var(--amber)' };
    return { t: '☹ COMING APART', c: 'var(--red)' };
  }

  function renderCrew(body) {
    const st = ST;
    for (const c of st.crew) {
      const card = el('div', 'crew-card' + (c === st.player ? ' active' : '') + (c.alive ? '' : ' dead'));
      const mood = moodOf(c);

      const top = el('div', 'crew-top');
      const img = new Image(); img.src = faceFor(c); img.className = 'face';
      top.appendChild(img);
      const nm = el('div', 'nm');
      nm.innerHTML = c.name + '<div style="font-size:9px;color:var(--ink-dim)">' + stateLabel(st, c) + '</div>';
      top.appendChild(nm);
      top.appendChild(el('div', 'mood', '<span style="color:' + mood.c + '">' + mood.t + '</span>'));
      card.appendChild(top);

      if (c.alive) {
        const grid = el('div', 'needs-grid');
        for (const n of BK.NEEDS) {
          const v = c.needs[n.key];
          const row = el('div', 'need');
          row.innerHTML = '<span>' + n.icon + ' ' + n.label + '</span>' +
            '<div class="bar' + (v < 22 ? ' warn' : '') + '"><i style="width:' + v + '%"></i></div>';
          grid.appendChild(row);
        }
        card.appendChild(grid);

        const vit = el('div', 'needs-grid');
        vit.innerHTML =
          '<div class="need"><span>❤ HEALTH</span><div class="bar hp"><i style="width:' + (c.health / c.maxHealth * 100) + '%"></i></div></div>' +
          '<div class="need"><span>☢ RADS</span><div class="bar rad"><i style="width:' + c.rads + '%"></i></div></div>' +
          '<div class="need"><span>◔ SANITY</span><div class="bar san"><i style="width:' + c.sanity + '%"></i></div></div>' +
          '<div class="need"><span>🎒 PACK</span><div class="bar"><i style="width:' + (c.pack.length / c.packCap * 100) + '%"></i></div></div>';
        card.appendChild(vit);

        const chips = el('div', 'chips');
        for (const t of c.traits) {
          const d = BK.TRAITS.find(x => x.key === t);
          if (d) { const ch = el('span', 'trait-chip', d.name); ch.title = d.desc; chips.appendChild(ch); }
        }
        card.appendChild(chips);

        const sk = el('div', 'skills');
        sk.innerHTML = BK.SKILLS.map(s => s.icon + ' ' + s.label + ' <b>' + (c.skills[s.key] || 0) + '</b>').join('');
        card.appendChild(sk);

        // relationships worth mentioning
        const rels = Object.keys(c.rel)
          .map(id => ({ o: st.crew.find(x => x.id === +id), v: c.rel[id] }))
          .filter(r => r.o && r.o.alive && Math.abs(r.v) > 25)
          .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 2);
        for (const r of rels) {
          card.appendChild(el('div', 'rel-line',
            (r.v > 0 ? '♥ ' : '✖ ') + r.o.first + ' — ' + (r.v > 60 ? 'inseparable' : r.v > 0 ? 'friendly' : 'cannot stand them')));
        }

        const btns = el('div', 'crew-btns');
        if (c !== st.player) {
          const b = el('button', 'btn small primary', 'TAKE CONTROL');
          b.onclick = () => {
            if (st.player) { st.player.auto = true; st.player.input = null; st.player.sprint = false; }
            st.player = c; st.mapId = c.map; c.auto = false; c.path = null;
            BK.Audio.sfx('click'); UI.refreshPanel();
          };
          btns.appendChild(b);
        }
        const ab = el('button', 'btn small', c.auto ? 'FREE WILL: ON' : 'FREE WILL: OFF');
        ab.onclick = () => { c.auto = !c.auto; if (c.auto) { c.input = null; } BK.Audio.sfx('click'); UI.refreshPanel(); };
        btns.appendChild(ab);
        if (c.pack.length) {
          const sb = el('button', 'btn small', 'STASH ' + c.pack.length + ' FINDS');
          sb.onclick = () => {
            if (c.map !== 'bunker') { BK.log(st, 'Has to be back inside to stash that.', 'warn'); BK.Audio.sfx('deny'); }
            else BK.stash(st, c);
            UI.refreshPanel();
          };
          btns.appendChild(sb);
        }
        card.appendChild(btns);
      }
      body.appendChild(card);
    }
  }

  // ------------------------------------------------------------ build -----
  function renderBuild(body) {
    const st = ST;
    if (st.mapId !== 'bunker') {
      body.appendChild(el('div', 'help-body', 'You can only build inside the shelter. Climb back down the hatch.'));
      return;
    }
    body.appendChild(el('div', 'sect-title', 'BOLT IT DOWN — COSTS SCRAP'));
    const grid = el('div', 'build-grid');
    for (const key of BK.BUY_ORDER) {
      const def = BK.OBJECTS[key];
      const can = st.res.scrap >= def.cost;
      const b = el('button', 'build-item');
      b.disabled = !can;
      b.innerHTML =
        '<div class="bn">' + def.name + '</div>' +
        '<div class="bc">🔩 ' + def.cost + (def.power ? '</div><div class="bp">' + (def.power < 0 ? '+' + (-def.power) + ' power' : def.power + ' power') : '') + '</div>' +
        '<div class="bd">' + def.blurb + '</div>';
      b.onclick = () => UI.enterBuild(key);
      grid.appendChild(b);
    }
    body.appendChild(grid);

    body.appendChild(el('div', 'sect-title', 'INSTALLED — TAP TO STRIP FOR PARTS'));
    if (!st.objects.length) body.appendChild(el('div', 'help-body', 'Nothing bolted down yet.'));
    for (const o of st.objects) {
      const def = BK.OBJECTS[o.type];
      const row = el('div', 'mrow');
      row.innerHTML = '<span class="lbl">' + def.name + (o.broken ? ' <b style="color:var(--red)">BROKEN</b>' : o.lit === false && def.power > 0 ? ' <b style="color:var(--amber)">NO POWER</b>' : '') + '</span>';
      const b = el('button', 'btn small danger', '+' + Math.floor(def.cost * 0.6) + ' 🔩');
      b.onclick = () => { BK.sellObject(st, o); UI.refreshPanel(); };
      row.appendChild(b);
      body.appendChild(row);
    }
  }

  UI.enterBuild = function (type) {
    const st = ST;
    const def = BK.OBJECTS[type];
    if (st.res.scrap < def.cost) { BK.Audio.sfx('deny'); return; }
    UI.closePanel();
    const c = BK.Render.cam;
    st.buildGhost = { type: type, x: Math.round(c.x), y: Math.round(c.y), valid: false };
    UI.updateGhost();
    $('placer').classList.remove('hidden');
    $('placer-name').textContent = def.name + '  ·  🔩 ' + def.cost;
    BK.Audio.sfx('click');
  };

  UI.updateGhost = function () {
    const st = ST;
    if (!st || !st.buildGhost) return;
    const g = st.buildGhost;
    g.valid = BK.canPlace(st, g.type, g.x, g.y);
    $('placer-ok').disabled = !g.valid;
  };

  UI.confirmBuild = function () {
    const st = ST, g = st.buildGhost;
    if (!g || !g.valid) { BK.Audio.sfx('deny'); return; }
    const def = BK.OBJECTS[g.type];
    if (!BK.spend(st, { scrap: def.cost })) { BK.Audio.sfx('deny'); return; }
    BK.placeObject(st, g.type, g.x, g.y);
    BK.log(st, 'Installed the ' + def.name.toLowerCase() + '.', 'good');
    UI.exitBuild();
  };

  UI.exitBuild = function () {
    if (ST) ST.buildGhost = null;
    $('placer').classList.add('hidden');
  };

  UI.inBuildMode = () => !!(ST && ST.buildGhost);

  // -------------------------------------------------------------- log -----
  function renderLog(body) {
    const st = ST;
    for (let i = st.log.length - 1; i >= 0; i--) {
      const L = st.log[i];
      const d = el('div', 'log-line ' + (L.tone || ''));
      d.innerHTML = '<span class="ts">D' + (Math.floor(L.t / 1440) + 1) + ' ' + BK.fmtClock(L.t) + '</span>' + L.text;
      body.appendChild(d);
    }
  }

  // ------------------------------------------------------------- menu -----
  function renderMenu(body) {
    const st = ST;
    const row = (label, btnText, fn, cls) => {
      const r = el('div', 'mrow');
      r.appendChild(el('span', 'lbl', label));
      const b = el('button', 'btn small ' + (cls || ''), btnText);
      b.onclick = () => { fn(b); };
      r.appendChild(b);
      body.appendChild(r);
      return b;
    };

    row('SOUND', BK.Audio.muted ? 'OFF' : 'ON', (b) => {
      BK.Audio.setMuted(!BK.Audio.muted);
      b.textContent = BK.Audio.muted ? 'OFF' : 'ON';
    });
    row('MUSIC', BK.Audio.musicOn ? 'ON' : 'OFF', (b) => {
      BK.Audio.setMusic(!BK.Audio.musicOn);
      b.textContent = BK.Audio.musicOn ? 'ON' : 'OFF';
    });
    row('CRT SCANLINES', st.crt ? 'ON' : 'OFF', (b) => {
      st.crt = !st.crt; b.textContent = st.crt ? 'ON' : 'OFF';
    });
    row('ZOOM', (st.zoom || 1).toFixed(1) + '×', (b) => {
      const z = [0.8, 1, 1.3, 1.6];
      st.zoom = z[(z.indexOf(st.zoom) + 1) % z.length];
      b.textContent = st.zoom.toFixed(1) + '×';
    });
    row('SAVE NOW', 'SAVE', () => {
      BK.save(st) ? BK.log(st, 'Saved.', 'ok') : BK.log(st, 'Could not save.', 'bad');
      BK.Audio.sfx('click');
    });
    row('HOW TO PLAY', 'OPEN', () => UI.showHelp());
    row('ABANDON SHELTER', 'NEW GAME', () => {
      UI.confirm('ABANDON THE SHELTER?', 'Everything here is lost. A new shelter, new people, new town.', 'START OVER', () => {
        BK.clearSave();
        location.reload();
      });
    }, 'danger');

    const stats = el('div', 'help-body');
    stats.innerHTML = '<h4>RECORD</h4>' +
      'Days survived: <b>' + (st.day - 1) + '</b><br>' +
      'Finds recovered: <b>' + st.stats.looted + '</b><br>' +
      'Notes read: <b>' + st.stats.notesRead + '</b><br>' +
      'Dead: <b>' + st.stats.deaths + '</b><br>' +
      'Times it was seen: <b>' + st.stats.watcherSeen + '</b>';
    body.appendChild(stats);
  }

  // ============================================================= modals ====
  function openModal(kicker, title, bodyHTML, choices, cls) {
    $('modal-kicker').textContent = kicker;
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = bodyHTML;
    $('modal').className = cls || '';
    const wrap = $('modal-choices');
    wrap.innerHTML = '';
    for (const c of choices) {
      const b = el('button', 'choice');
      b.innerHTML = '<div class="cl">' + c.label + '</div>' + (c.desc ? '<div class="cd">' + c.desc + '</div>' : '');
      b.onclick = () => { BK.Audio.sfx('click'); c.fn(); };
      wrap.appendChild(b);
    }
    $('modal-wrap').classList.remove('hidden');
  }
  UI.openModal = openModal;

  function closeModal() { $('modal-wrap').classList.add('hidden'); }
  UI.closeModal = closeModal;

  UI.showEvent = function (ev) {
    BK.Audio.sfx('radio');
    openModal('▮ INCIDENT — ' + BK.fmtClock(ST.time.minutes), ev.title, ev.body,
      ev.choices.map((c, i) => ({
        label: c.label, desc: c.desc,
        fn: () => { closeModal(); BK.resolveEvent(ST, ev, i); }
      })));
  };

  UI.showNote = function (note) {
    BK.Audio.sfx('back');
    openModal('▮ FOUND PAPER', note.title, note.body, [{ label: 'PUT IT BACK', fn: closeModal }]);
  };

  UI.showObjectMenu = function (prop) {
    const st = ST;
    const def = BK.OBJECTS[prop.type];
    if (!def) return;
    const choices = [];
    if (def.acts) {
      for (const a of def.acts) {
        const blocked = a.needPower && !prop.lit;
        choices.push({
          label: a.label + (blocked ? ' — NO POWER' : ''),
          desc: describeAct(a),
          fn: () => { closeModal(); if (!blocked) BK.useObject(st, st.player, prop, a.id); else BK.Audio.sfx('deny'); }
        });
      }
    }
    if (!choices.length) choices.push({ label: 'NOTHING TO DO HERE', desc: def.blurb, fn: closeModal });
    choices.push({ label: 'STRIP FOR PARTS', desc: 'Recover ' + Math.floor(def.cost * 0.6) + ' scrap.', fn: () => { closeModal(); BK.sellObject(st, prop); } });
    choices.push({ label: 'BACK', fn: closeModal });
    openModal('▮ ' + (prop.broken ? 'BROKEN' : 'INSTALLED'), def.name, def.blurb, choices);
  };

  function describeAct(a) {
    const bits = [];
    if (a.gain) for (const k in a.gain) if (a.gain[k] > 0) bits.push('+' + k);
    if (a.make) for (const k in a.make) bits.push('makes ' + k);
    if (a.use) for (const k in a.use) bits.push('uses ' + k);
    if (a.skill) bits.push('trains ' + a.skill);
    return bits.join(' · ');
  }

  UI.confirm = function (title, body, okLabel, fn) {
    openModal('▮ CONFIRM', title, body, [
      { label: okLabel, fn: () => { closeModal(); fn(); } },
      { label: 'NEVER MIND', fn: closeModal }
    ]);
  };

  UI.showHelp = function () {
    openModal('▮ FIELD MANUAL', 'HOW TO PLAY',
      '<div class="help-body">' +
      '<h4>MOVING</h4>Left thumb drives the <b>stick</b>. Tap anywhere in the world to walk there instead. The big round button <b>uses whatever you are standing next to</b> — its label tells you what.' +
      '<h4>YOUR CREW</h4>Everyone has needs, traits, skills and opinions about each other. On <b>FREE WILL</b> they look after themselves. Open <b>CREW</b> to take control of anyone, any time.' +
      '<h4>KEEPING THE LIGHTS ON</h4>The generator burns <b>fuel</b> and everything else burns <b>power</b>. Overdraw it and the shelter browns out — lamps first, then everything. Dark rooms eat sanity.' +
      '<h4>TOPSIDE</h4>Climb the ladder to loot the town. Fill your pack, come back, and it goes into stores. You take <b>rads</b> out there, more near the craters, and the dark is not empty.' +
      '<h4>THE OTHER THING</h4>The meter marked <b>???</b> is how much attention you have attracted. Light, daylight, company and a calm crew bring it down. It only moves when nobody is looking at it.' +
      '</div>',
      [{ label: 'UNDERSTOOD', fn: closeModal }]);
  };

  UI.showGameOver = function (st) {
    const s = st.stats;
    openModal('▮ END OF TAPE', 'THE SHELTER IS SILENT',
      'Nobody came down the ladder tonight. The generator ran until the fuel was gone and then Rad Springs was quiet for the first time since October.' +
      '<div class="stat-grid">' +
      '<span class="k">DAYS SURVIVED</span><span>' + (st.day - 1) + '</span>' +
      '<span class="k">FINDS RECOVERED</span><span>' + s.looted + '</span>' +
      '<span class="k">NOTES READ</span><span>' + s.notesRead + '</span>' +
      '<span class="k">TIMES IT WAS SEEN</span><span>' + s.watcherSeen + '</span>' +
      '</div>',
      [{ label: 'START AGAIN', fn: () => { BK.clearSave(); location.reload(); } }], 'gameover');
    BK.Audio.sting(1.2);
  };

  // ============================================================= toasts ====
  UI.onLog = function (entry) {
    if (entry.tone === 'tip') return;
    const wrap = $('toast-wrap');
    const t = el('div', 'toast ' + (entry.tone || ''), entry.text);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 4900);
    while (wrap.children.length > 4) wrap.firstChild.remove();
    if (openPanel === 'log') UI.refreshPanel();
  };
})(window.BK = window.BK || {});
