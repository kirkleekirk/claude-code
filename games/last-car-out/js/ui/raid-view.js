/* Inside a car: HUD, the carriage map, the current room, and your pack. */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;
  const ENG = LCO.engine;
  const icon = LCO.icon;
  const esc = U.esc;
  const UI = LCO.ui;
  const RA = () => ENG.raid;

  function instabilityBlock(raid, S) {
    const v = raid.instability;
    const pct = U.clamp((v / 150) * 100, 0, 100);
    let state = 'Stable';
    let cls = 'muted';
    if (v >= 100) { state = S.flags.lastCarOut ? 'Collapse — Last Car Out: +1 AP, +40% damage' : 'Collapse — every step costs 10% HP'; cls = 'bad'; }
    else if (v >= 75) { state = 'Tremors — enemies hit 15% harder'; cls = 'warn'; }
    const tick = (x) => `<span class="tick" style="left:${(x / 150) * 100}%"></span>`;
    return `<div class="instab"><div class="meterline"><span>Instability</span><span class="${cls}">${Math.round(v)}% · ${state}</span></div>
      <div class="meter" style="--pct:${Math.max(1, pct)}"><i style="width:${pct}%"></i>${tick(75)}${tick(100)}</div>
      <div class="marks"><span style="left:${(75 / 150) * 100}%">75</span><span style="left:${(100 / 150) * 100}%">100</span><span style="left:98%">150</span></div>
      <span class="small muted">Next step: +${RA().moveCost(raid, S)}% (known rooms cost less). At 150% the car unmakes itself.</span></div>`;
  }

  function cellHtml(G, raid, S, c) {
    const R2 = RA();
    const here = c.x === raid.pos.x && c.y === raid.pos.y;
    if (c.type === 'wall') return `<div class="cell wall" title="Collapsed compartment"></div>`;
    const info = D.ROOMS[c.type] || D.ROOMS.empty;
    const exit = R2.isExit(c.type);
    const danger = ['fight', 'elite', 'hunter', 'boss'].includes(c.type) && !c.done;
    const lootLeft = c.loot && R2.hasLoot(c.loot);
    const loot = (c.type === 'cache' && !c.loot) || (c.type === 'vault' && !c.opened) || lootLeft;
    const can = R2.canMoveTo(raid, c.x, c.y);
    const cls = ['cell', c.seen ? 'seen' : 'unseen', c.visited ? 'visited' : '', c.done && !exit ? 'done' : '', here ? 'here' : '', exit ? 'exit' : '', danger ? 'danger' : '', loot ? 'loot' : '', can ? 'move' : ''].filter(Boolean).join(' ');
    const label = here ? 'You' : c.seen ? info.short : '';
    const ic = here ? 'hand' : c.seen ? (c.type === 'boss' && c.done ? 'crown' : info.icon) : 'question';
    const title = c.seen ? `${info.name}${c.done && !exit ? ' (cleared)' : ''}` : 'Unknown compartment';
    const attrs = can ? `data-act="move" data-x="${c.x}" data-y="${c.y}" role="button" tabindex="0"` : here ? 'data-act="view-room" role="button" tabindex="0"' : '';
    return `<div class="${cls}" ${attrs} title="${esc(title)}" aria-label="${esc(title)}">${icon(ic)}${label ? `<span class="cl">${esc(label)}</span>` : ''}${lootLeft && !here ? '<span class="dot"></span>' : ''}</div>`;
  }

  function roomPanel(G, raid, S) {
    const v = raid.view;
    const cell = RA().here(raid);
    const info = D.ROOMS[cell.type] || D.ROOMS.empty;
    const feed = `<ul class="feed">${raid.log.slice(-10).reverse().map((l) => `<li class="${l.cls}">${esc(l.t)}</li>`).join('')}</ul>`;
    if (!v) {
      return `<div class="panel room"><div class="sect-title"><h3>${icon(info.icon)} ${esc(info.name)}</h3>${cell.loot && RA().hasLoot(cell.loot) ? '<button type="button" class="btn small" data-act="view-room">Search</button>' : ''}</div>
        <p class="small muted">Step into a compartment next to you — they glow brass. Arrow keys or WASD work too.</p>${feed}</div>`;
    }
    const close = (label) => `<button type="button" class="btn" data-act="close-view">${label || 'Move on'}</button>`;
    switch (v.type) {
      case 'container': {
        const c = RA().cellByKey(raid, v.key);
        const l = c.loot || { items: [], tickets: 0, scrap: 0, glimmer: 0 };
        const cur = [l.tickets ? `${U.fmt(l.tickets)} Tickets` : '', l.scrap ? `${l.scrap} Scrap` : '', l.glimmer ? `${l.glimmer} Glimmer` : ''].filter(Boolean).join(' · ');
        return `<div class="panel room"><div class="sect-title"><h3>${icon('chest')} ${esc(v.title || 'Loot')}</h3><span class="cap ${raid.backpack.length >= S.backpack ? 'full' : ''}">Pack ${raid.backpack.length}/${S.backpack}</span></div>
          ${cur ? `<p class="brass-line">${icon('ticket')} ${cur}</p>` : ''}
          <div class="items tight">${l.items.map((i) => UI.itemCard(i, { from: 'loot', key: v.key })).join('') || '<p class="muted small">Nothing left.</p>'}</div>
          <div class="actions"><button type="button" class="btn primary" data-act="take-all" data-key="${esc(v.key)}" ${l.items.length || cur ? '' : 'disabled'}>Take everything that fits</button>${close('Done')}</div>
          <p class="small muted">Full pack? Drop something from your backpack below to make room.</p></div>`;
      }
      case 'event': {
        const c = RA().cellByKey(raid, v.key);
        const ev = D.EVENTS[c.event];
        const X = RA().eventApi(G);
        const choices = ev.choices.map((ch, i) => {
          const why = ch.req ? ch.req(X) : null;
          return `<button type="button" class="btn choice" data-act="event-choice" data-key="${esc(v.key)}" data-idx="${i}" ${why ? 'disabled' : ''}>${esc(ch.label)}<span class="hint">${esc(why || ch.hint || '')}</span></button>`;
        }).join('');
        return `<div class="panel room"><div class="sect-title"><h3>${icon('question')} ${esc(ev.title)}</h3></div><p class="text">${esc(ev.text)}</p><div class="choices">${choices}</div></div>`;
      }
      case 'result':
        return `<div class="panel room"><div class="sect-title"><h3>${esc(v.title)}</h3></div><p class="text">${esc(v.text)}</p>${(v.notes || []).map((n) => `<p class="small warn">${esc(n)}</p>`).join('')}
          <div class="actions"><button type="button" class="btn ${v.fight ? 'danger' : 'primary'}" data-act="close-view">${v.fight ? icon('swords') + ' Fight!' : 'Continue'}</button></div></div>`;
      case 'rest': {
        const c = RA().cellByKey(raid, v.key);
        return `<div class="panel room"><div class="sect-title"><h3>${icon('bed')} A quiet nook</h3></div>
          <p class="text">${c.done ? 'You already rested here. The cushions remember you.' : 'A bench, a blanket, a window full of passing stars. You could close your eyes for a while — but the car will not wait.'}</p>
          <div class="actions">${c.done ? '' : `<button type="button" class="btn primary" data-act="rest" data-key="${esc(v.key)}">Rest <span class="cost">+35% HP · Instability +10</span></button>`}${close()}</div></div>`;
      }
      case 'vault': {
        const X = RA().eventApi(G);
        const pick = Math.min(1, S.flags.lockpick || 0);
        return `<div class="panel room"><div class="sect-title"><h3>${icon('vault')} A vault</h3></div>
          <p class="text">A heavy door with a coupling-shaped lock. Somebody wanted whatever is inside kept very safe.</p>
          <div class="choices">
            <button type="button" class="btn choice" data-act="vault" data-key="${esc(v.key)}" data-method="key" ${X.hasItem('coupling_key') ? '' : 'disabled'}>Use a Coupling Key<span class="hint">${X.hasItem('coupling_key') ? 'Opens it cleanly' : 'You have no key'}</span></button>
            <button type="button" class="btn choice" data-act="vault" data-key="${esc(v.key)}" data-method="pick" ${pick ? '' : 'disabled'}>Pick the lock<span class="hint">${pick ? `${Math.round(pick * 100)}% chance · failure sounds an alarm` : 'Needs a Tool Roll or Lockwork'}</span></button>
            <button type="button" class="btn choice" data-act="vault" data-key="${esc(v.key)}" data-method="force">Force it open<span class="hint">Lose 20% HP · Instability +10</span></button>
            ${close('Leave it sealed')}
          </div>${D.CARS && raid.car.lesson === 'honesty' ? '<p class="small glow">Lesson: Honesty — this car wants the vault left sealed.</p>' : ''}</div>`;
      }
      case 'merchant': {
        const c = RA().cellByKey(raid, v.key);
        return `<div class="panel room"><div class="sect-title"><h3>${icon('cart')} Wandering merchant</h3><span class="small muted">Pays in carried Tickets</span></div>
          <p class="text">A denizen with a cart of odds and ends tips its hat. “Buying or selling?” Tap something in your backpack to sell it.</p>
          <div class="items tight">${(c.stock || []).map((i) => UI.itemCard(i, { from: 'mstock', key: v.key, price: ENG.loot.buyPrice(i, S) })).join('') || '<p class="muted small">Sold out.</p>'}</div>
          <div class="actions">${close('Done')}</div></div>`;
      }
      case 'exit': {
        const c = RA().cellByKey(raid, v.key);
        const st = RA().exitState(G, c);
        const nfo = D.ROOMS[c.type];
        return `<div class="panel room"><div class="sect-title"><h3>${icon(nfo.icon)} ${esc(nfo.name)}</h3></div>
          <p class="text">${esc(st.note || '')}</p>
          <p class="small muted">Leaving keeps your backpack, carried Tickets, Scrap and Glimmer.${raid.car.lesson ? ` Lesson: <span class="glow">${esc(D.LESSONS[raid.car.lesson].name)}</span> — ${RA().lessonMet(G, raid, c.type === 'far' || c.type === 'home' || !!S.flags.allExitsFar) ? '<span class="good">met</span>' : '<span class="warn">not met yet</span>'}.` : ''}</p>
          <div class="actions"><button type="button" class="btn ${c.type === 'home' ? 'glowing' : 'primary'}" data-act="exit" data-key="${esc(v.key)}" ${st.ok ? '' : 'disabled'}>${icon('door')} ${esc(st.label)}</button>${close('Not yet')}</div></div>`;
      }
      default:
        return `<div class="panel room">${feed}<div class="actions">${close()}</div></div>`;
    }
  }

  function packPanel(G, raid, S) {
    const bp = raid.backpack.map((i) => UI.itemCard(i, { from: 'backpack' })).join('') || '<p class="small muted">Empty. Go find something.</p>';
    const pouch = [];
    for (let i = 0; i < S.pouch; i++) pouch.push(G.pouch[i] ? UI.itemCard(G.pouch[i], { from: 'pouch' }) : UI.itemCard(null, { emptyLabel: 'Secure slot' }));
    const belt = G.belt.map((b, i) => (b ? UI.itemCard(b, { from: 'belt', slot: i }) : UI.itemCard(null, { emptyLabel: 'Belt' }))).join('');
    const em = RA().emergencyOptions(G).map((o) => `<button type="button" class="btn danger" data-act="emergency" data-id="${o.id}" title="${esc(o.note)}">${icon('hatch')}${esc(o.label)}</button>`).join('');
    return `<div class="grid2">
      <div class="panel"><div class="pack-head"><h3 class="eyebrow">Backpack — lost if you fall</h3><span class="cap ${raid.backpack.length >= S.backpack ? 'full' : ''}">${raid.backpack.length}/${S.backpack} · worth ${U.fmt(U.sum(raid.backpack, (i) => ENG.loot.value(i)))}</span></div><div class="items tight">${bp}</div></div>
      <div class="stack">
        <div class="panel"><div class="pack-head"><h3 class="eyebrow glow">Secure Pouch — survives death</h3><span class="cap">${G.pouch.length}/${S.pouch}</span></div><div class="items tight">${pouch.join('') || '<p class="small muted">No pouch slots.</p>'}</div></div>
        <div class="panel"><div class="pack-head"><h3 class="eyebrow">Belt</h3></div><div class="items tight">${belt}</div></div>
        ${em ? `<div class="row">${em}</div>` : ''}
      </div></div>`;
  }

  UI.renderRaid = (G) => {
    const raid = G.raid;
    const S = ENG.stats.compute(G);
    const head = UI.header(G, S);
    if (raid.combat) return head + UI.renderCombat(G);
    const car = D.CARS[raid.car.theme];
    const mod = D.MODIFIERS[raid.car.mod];
    const les = D.LESSONS[raid.car.lesson];
    const lessonNow = RA().lessonMet(G, raid, false);
    const cells = raid.cells.map((c) => cellHtml(G, raid, S, c)).join('');
    return `${head}
      <section class="hud panel">
        <div class="carhead"><span class="carno">Car ${esc(raid.car.num)} <small>${esc(car.name)}</small></span>
          <div class="row"><span class="chip tier">Tier ${raid.car.tier}</span><span class="chip rule" title="${esc(mod.desc)}">${icon('lock')}${esc(mod.name)}</span>
          <span class="chip lesson ${lessonNow && raid.car.lesson !== 'long_way' ? 'done' : ''}" title="${esc(les.desc)}">${icon('hash')}${esc(les.name)}</span></div>
          <p class="small muted">${esc(mod.desc)} · <span class="glow">${esc(les.desc)}</span></p></div>
        <div class="vit">
          <div><div class="meterline"><span>HP</span><span>${Math.round(raid.hp)} / ${S.maxHp}</span></div>${UI.hpMeter(raid.hp, S.maxHp)}</div>
          ${instabilityBlock(raid, S)}
          <div class="spread"><span class="small muted">Carried (lost if you fall)</span>${UI.coins(G, raid.carry)}</div>
        </div>
      </section>
      <section class="raid-main">
        <div class="stack">
          <div class="carriage-scroll"><div class="carriage" style="--w:${raid.w}"><div class="cells">${cells}</div></div></div>
          <div class="legend"><span>${icon('door')}Exit</span><span>${icon('swords')}Fight</span><span>${icon('crown')}Elite</span><span>${icon('chest')}Cache</span><span>${icon('question')}Unknown / event</span><span>${icon('bed')}Rest</span><span>${icon('vault')}Vault</span></div>
        </div>
        ${roomPanel(G, raid, S)}
      </section>
      ${packPanel(G, raid, S)}`;
  };
})();
