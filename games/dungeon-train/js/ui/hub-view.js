/* The Tree Fort (the hub between trips): title screen, the top bar, the train board, Choose Goose's shop,
   BMO's workshop, the journal, and the result screens after a trip. */
(function () {
  'use strict';
  const D = DT.data;
  const U = DT.U;
  const M = DT.meta;
  const UI = DT.ui;
  const esc = U.esc;
  const icon = DT.icon;
  const HV = {};
  const st = { line: null, shopSel: null, benchSel: null, benchFilter: 'all', journal: 'trophies' };
  HV.state = st;

  const TABS = [['board', 'Board', 'train'], ['loadout', 'Loadout', 'user'], ['skills', 'Skills', 'tree'], ['shop', 'Shop', 'goose'], ['workshop', 'Workshop', 'bmo'], ['journal', 'Journal', 'book']];
  HV.TABS = TABS;

  /* ---------- title ---------- */
  HV.title = function (hasSave, glOk) {
    return `<div class="title-screen"><div class="title-card">
      <div class="logo"><span class="l1">Adventure Time</span><span class="l2">DUNGEON TRAIN</span><span class="l3">an extraction RPG</span></div>
      <p class="tagline">Ride the Dungeon Train with Finn and Jake. Clear cars, crack chests, beat the boss — and get off before the Loop takes it all.</p>
      <div class="title-btns">
        ${hasSave ? `<button class="btn primary big" data-act="continue" autofocus>${icon('play')} Continue</button>` : ''}
        <button class="btn ${hasSave ? 'ghost' : 'primary big'}" data-act="new-game" ${hasSave ? '' : 'autofocus'}>${icon('plus')} New game</button>
        <button class="btn ghost" data-act="import-open">${icon('save')} Load a save code</button>
        <button class="btn ghost" data-act="settings">${icon('gear')} Settings &amp; controls</button>
      </div>
      ${glOk ? '' : `<p class="warn">${icon('info')} Your browser couldn’t start 3D graphics (WebGL), so trips can’t run here. Menus still work.</p>`}
      <p class="pc-note">${icon('keyboard')} Made for PC — mouse and keyboard.</p>
    </div></div>`;
  };

  /* ---------- top bar ---------- */
  function heroChip(G, h) {
    const C = G.chars[h], H = D.HEROES[h];
    const on = G.active === h;
    const need = M.xpToNext(C.level);
    return `<button class="herochip${on ? ' on' : ''}" data-act="hero" data-hero="${h}" style="--c:${H.color}" aria-pressed="${on}" title="Play as ${esc(H.name)} · ${U.fmt(C.xp)} / ${U.fmt(need)} XP to level ${C.level + 1}">${UI.art.portrait(h)}<span><b>${esc(H.name)}</b><small>Lv ${C.level}</small></span>${C.sp ? `<i class="sp" title="${C.sp} skill points to spend">${C.sp}</i>` : ''}<span class="hxp"><i style="width:${U.clamp((C.xp / need) * 100, 0, 100).toFixed(1)}%"></i></span></button>`;
  }
  HV.topbar = function (G, tab) {
    const C = G.chars[G.active];
    return `<nav class="topbar"><div class="brand">${icon('train')}<span>Dungeon Train</span></div>
      <div class="tabs" role="tablist">${TABS.map(([k, l, ic], i) => `<button role="tab" class="tab${tab === k ? ' on' : ''}" aria-selected="${tab === k}" data-act="tab" data-tab="${k}" title="${l} (${i + 1})">${icon(ic)}<span>${l}</span><kbd>${i + 1}</kbd>${k === 'skills' && C.sp ? `<i class="dotn">${C.sp}</i>` : ''}${k === 'loadout' && G.stash.some((i2) => i2.isNew) ? '<i class="dotn new"></i>' : ''}</button>`).join('')}</div>
      <div class="tb-right"><div class="heroes">${D.HERO_IDS.map((h) => heroChip(G, h)).join('')}</div><div class="money">${UI.money(G)}</div><button class="btn ghost icon-only" data-act="settings" aria-label="Settings">${icon('gear')}</button></div></nav>`;
  };

  /* ---------- the train board ---------- */
  function lineCard(G, h, o) {
    const line = M.lineById(o.line);
    const lock = M.lineLock(G, line, h);
    const boss = D.ENEMIES[line.boss];
    const got = line.final ? G.conductorBeaten : G.trophies[line.id];
    const sel = st.line === o.id;
    return `<button class="linecard${lock ? ' locked' : ''}${sel ? ' sel' : ''}" data-act="line" data-offer="${o.id}" style="--c:${line.accent};--sky:${line.sky[0]}">
      <span class="lc-tier">${line.final ? icon('crown') : 'T' + line.tier}</span>
      <span class="lc-main"><b>${esc(line.name)}${line.branch ? ' <i class="lc-tag">branch</i>' : line.post ? ' <i class="lc-tag post">post-game</i>' : ''}</b><small>${lock ? `${icon('lock')} ${esc(lock)}` : `Level ${line.rec}+ · ${o.cars} cars${o.vault ? ' · vault' : ''}`}</small></span>
      <span class="lc-side">${o.mod !== 'none' ? `<em class="mod">${esc(D.MODS[o.mod].name)}</em>` : ''}<span class="lc-boss${got ? ' got' : ''}" title="${got ? 'Trophy claimed' : 'Boss: ' + esc(boss.name)}">${icon(got ? 'trophy' : 'skull')}</span></span></button>`;
  }
  function checklist(G, h, line) {
    const C = G.chars[h], S = M.stats.compute(G, h), H = D.HEROES[h];
    const items = [];
    const wslot = H.slots[0];
    const w = C.equip[wslot.id];
    items.push(w ? { ok: true, t: `${wslot.label}: ${w.name}` } : { ok: false, t: h === 'finn' ? 'No sword! Finn will fight with bare fists.' : 'No instrument — Jake’s punches are weak.' });
    const snacks = C.belt.slice(0, S.belt).filter(Boolean);
    items.push(snacks.length ? { ok: true, t: `${U.sum(snacks, (s) => s.qty)} snacks on the belt` } : { ok: false, t: 'No snacks on your belt — bring Bacon Pancakes to heal.' });
    items.push({ ok: C.level >= line.rec, t: C.level >= line.rec ? `Level ${C.level} (recommended ${line.rec})` : `Level ${C.level} — this line is tuned for level ${line.rec}` });
    const bound = C.bars.filter(Boolean).length;
    items.push({ ok: bound > 0 || !S.abilities.length, t: S.abilities.length ? `${bound} of ${S.abilitySlots} ability keys bound` : 'No abilities yet — unlock some in Skills' });
    const atRisk = Object.values(C.equip).filter(Boolean).concat(C.belt.filter(Boolean));
    const risk = U.sum(atRisk, (i) => M.loot.value(i));
    items.push({ ok: true, info: true, t: `At risk if knocked out: ${atRisk.length} items (worth about ${U.fmt(risk)}g). ${C.safe.length ? `${C.safe.length} safe in your ${H.safeName}.` : `Your ${H.safeName} is empty.`}` });
    return `<ul class="check">${items.map((i) => `<li class="${i.info ? 'info' : i.ok ? 'ok' : 'no'}">${icon(i.info ? 'info' : i.ok ? 'check' : 'x')}<span>${esc(i.t)}</span></li>`).join('')}</ul>`;
  }
  HV.board = function (G) {
    const h = G.active;
    if (!st.line || !G.board.some((o) => o.id === st.line)) st.line = (G.board.find((o) => !M.lineLock(G, M.lineById(o.line), h) && M.lineById(o.line).tier === M.maxTier(G, h)) || G.board[0]).id;
    const o = G.board.find((x) => x.id === st.line);
    const line = M.lineById(o.line);
    const lock = M.lineLock(G, line, h);
    const boss = D.ENEMIES[line.boss];
    const fams = [...new Set(line.fams.flatMap((f) => (D.FAMILIES[f] || []).map((id) => D.ENEMIES[id].name)))];
    let x = `<div class="board"><div class="board-stage"><div class="stage-cap"><b>${esc(D.HEROES[h].name)}</b> is getting ready. <span>Pick a train line, then board.</span></div></div>`;
    x += `<section class="panel board-list"><header class="p-head"><h3>${icon('train')} The Dungeon Train</h3><button class="btn small ghost" data-act="reroll-board" title="New trips (different cars, vaults and modifiers)">${icon('dice')} New trips · ${icon('coin')}20</button></header><div class="lines" data-keep-scroll="lines">${G.board.map((b) => lineCard(G, h, b)).join('')}</div></section>`;
    x += `<section class="panel board-detail" style="--c:${line.accent}"><div class="bd-banner" style="background:linear-gradient(135deg, ${line.sky[0]}, ${line.sky[1]})"><span class="bd-tier">${line.final ? 'FINAL' : line.post ? 'AFTER THE LOOP · TIER ' + line.tier : line.branch ? 'BRANCH LINE · TIER ' + line.tier : 'TIER ' + line.tier}</span><h2>${esc(line.name)}</h2></div>`;
    x += `<p class="bd-blurb">${esc(line.blurb)}</p><div class="bd-facts"><div>${icon('train')}<b>${o.cars}</b><small>cars</small></div><div>${icon('clock')}<b>${Math.floor(line.loop / 60)}:${String(line.loop % 60).padStart(2, '0')}</b><small>until the Loop</small></div><div>${icon('skull')}<b>${esc(boss.name)}</b><small>boss</small></div><div>${icon(o.vault ? 'gem' : 'chest')}<b>${o.vault ? 'Yes' : 'No'}</b><small>treasure vault</small></div></div>`;
    if (o.mod !== 'none') x += `<div class="bd-mod">${icon('sparkle')}<b>${esc(D.MODS[o.mod].name)}:</b> ${esc(D.MODS[o.mod].desc)}</div>`;
    x += `<p class="bd-enemies"><b>Monsters:</b> ${esc(fams.join(', '))}</p>`;
    if (!line.final) x += `<p class="bd-trophy">${icon('trophy')} <b>${esc(D.TROPHIES[line.id].name)}</b> — ${G.trophies[line.id] ? '<span class="good">claimed!</span>' : esc('Beat the boss and get off the train with it: ' + D.TROPHIES[line.id].perk)}</p>`;
    x += `<h4>${esc(D.HEROES[h].name)}’s checklist</h4>${checklist(G, h, line)}`;
    x += lock ? `<button class="btn big" disabled>${icon('lock')} ${esc(lock)}</button>` : `<button class="btn primary big board-go" data-act="board" data-offer="${o.id}">${icon('train')} Board as ${esc(D.HEROES[h].name)}</button>`;
    x += `<p class="bd-rules">${icon('info')} Get off through a green jump-off door, the engine’s brake, or with a Rainicorn flare. If you’re knocked out — or the Loop gets you — you lose everything except your ${esc(D.HEROES[h].safeName)}.</p></section></div>`;
    return x;
  };

  /* ---------- Choose Goose's shop ---------- */
  HV.shop = function (G) {
    const h = G.active;
    const S = M.stats.compute(G, h);
    const stock = G.market.stock;
    const sel = stock.find((i) => i.uid === st.shopSel) || null;
    let x = `<div class="shop"><section class="panel shop-stock"><header class="p-head"><h3>${icon('goose')} Choose Goose’s Shop</h3><span class="p-sub">“Choose Goose has it all! Mostly.”</span><button class="btn small ghost" data-act="shop-refresh">${icon('refresh')} New stock · ${icon('coin')}30</button></header>`;
    x += `<div class="grid shop-grid">${stock.map((it) => UI.tile(it, { src: 'shop', price: M.loot.buyPrice(it, S), sel: sel && sel.uid === it.uid, drag: false, showHero: true, act: 'shop-sel' })).join('')}${stock.length ? '' : `<p class="empty-note">Sold out! Come back after your next trip.</p>`}</div>`;
    x += sel ? `<div class="shop-buy">${UI.itemCard(G, sel, { hero: h })}<button class="btn primary big" data-act="buy" data-uid="${sel.uid}" ${G.gold < M.loot.buyPrice(sel, S) ? 'disabled' : ''}>${icon('coin')} Buy for ${U.fmt(M.loot.buyPrice(sel, S))}g</button></div>` : `<p class="empty-note">${icon('mouse')} Click an item to see what it does and buy it.</p>`;
    x += '</section>';
    const sellable = G.stash.filter((i) => i.kind !== 'trophy');
    const tv = G.stash.filter((i) => i.kind === 'valuable');
    x += `<section class="panel shop-sell" data-drop="sell"><header class="p-head"><h3>${icon('coin')} Sell</h3><span class="p-sub">Drag items here, or right-click → Sell</span></header>`;
    x += tv.length ? `<button class="btn primary" data-act="sell-treasure">${icon('gem')} Sell all ${tv.length} treasure · ${icon('coin')}${U.fmt(U.sum(tv, (i) => M.loot.sellPrice(i, S)))}</button>` : `<p class="muted">${icon('gem')} No treasure to sell. Treasure only exists to be sold!</p>`;
    x += `<div class="grid" data-keep-scroll="sell">${sellable.map((it) => UI.tile(it, { src: 'stash', showHero: true })).join('')}</div></section></div>`;
    return x;
  };

  /* ---------- BMO's workshop ---------- */
  HV.workshop = function (G) {
    const gear = [];
    for (const h of D.HERO_IDS) for (const k in G.chars[h].equip) { const it = G.chars[h].equip[k]; if (it) gear.push({ it, worn: D.HEROES[h].name[0] }); }
    for (const it of G.stash) if (M.loot.isGear(it)) gear.push({ it });
    const f = M.hub.find(G, st.benchSel);
    const it = f && M.loot.isGear(f.item) ? f.item : null;
    let x = `<div class="workshop"><section class="panel ws-pick"><header class="p-head"><h3>${icon('bmo')} BMO’s Workshop</h3><span class="p-sub">“Let’s make your stuff MORE stuff!”</span></header><p class="ws-res">${UI.money(G)}</p>`;
    x += `<div class="grid" data-keep-scroll="ws">${gear.map((g) => UI.tile(g.it, { src: g.worn ? 'equip' : 'stash', worn: g.worn, sel: it && it.uid === g.it.uid, act: 'bench-sel', showHero: true })).join('')}</div></section>`;
    x += `<section class="panel ws-bench" data-drop="bench">`;
    if (!it) x += `<div class="bench-empty">${UI.art.portrait ? '' : ''}${icon('anvil')}<p>Pick a piece of gear (or drag it here).</p><ul class="ws-help"><li>${icon('arrowUp')} <b>Upgrade</b>: +1 level (up to +5). Every level makes the stats, damage and Powers stronger.</li><li>${icon('dice')} <b>Reroll bonuses</b>: new random bonuses.</li><li>${icon('sparkle')} <b>Imbue</b>: turn an Algebraic item into a Mathematical one with a random Power.</li><li>${icon('refresh')} <b>New Power</b>: swap a Mathematical item’s Power for a different one.</li><li>${icon('recycle')} <b>Salvage</b>: break it down into magic dust and crystal shards.</li></ul></div>`;
    else {
      x += UI.itemCard(G, it, { hero: M.loot.heroFor(it) === 'any' ? G.active : M.loot.heroFor(it), compare: false });
      const ops = [
        ['ws-upgrade', 'arrowUp', `Upgrade to +${(it.upg || 0) + 1}`, M.hub.upgradeCost(it), it.upg >= 5 ? 'Already +5 (max)' : ''],
        ['ws-reroll', 'dice', 'Reroll bonuses', M.hub.rerollCost(it), it.affixes && it.affixes.length ? '' : 'No random bonuses'],
        ['ws-imbue', 'sparkle', 'Imbue a Power', M.hub.imbueCost(it), it.rarity === 2 && !it.unique ? '' : 'Only Algebraic items'],
        ['ws-power', 'refresh', 'Swap the Power', M.hub.powerCost(it), it.rarity === 3 && it.power && !it.unique ? '' : 'Only Mathematical items'],
      ];
      x += `<div class="ws-ops">${ops.map(([act, ic, label, cost, why]) => { const poor = cost && (G.dust < cost.dust || G.shards < cost.shards); return `<button class="btn ${why ? 'ghost' : 'primary'}" data-act="${act}" data-uid="${it.uid}" ${why || poor || !cost ? 'disabled' : ''} title="${esc(why || (poor ? 'Not enough materials' : ''))}">${icon(ic)}<span>${esc(label)}</span><small>${why ? esc(why) : UI.cost(cost)}</small></button>`; }).join('')}`;
      const y = M.loot.salvageYield(it);
      x += `<button class="btn danger ghost" data-act="salvage" data-uid="${it.uid}" ${f.where === 'equip' ? 'disabled title="Unequip it first"' : ''}>${icon('recycle')}<span>Salvage</span><small>${f.where === 'equip' ? 'Unequip it first' : `+${y.dust} dust${y.shards ? ` +${y.shards} shards` : ''}`}</small></button></div>`;
    }
    return x + '</section></div>';
  };

  /* ---------- journal ---------- */
  HV.journal = function (G) {
    const sec = st.journal;
    const secs = [['trophies', 'Trophies', 'trophy'], ['bestiary', 'Bestiary', 'skull'], ['legends', 'Legendary loot', 'star'], ['stats', 'Stats', 'grid'], ['help', 'How to play', 'question'], ['glossary', 'Words', 'book'], ['save', 'Save', 'save']];
    let x = `<div class="journal"><nav class="panel j-nav">${secs.map(([k, l, ic]) => `<button class="${sec === k ? 'on' : ''}" data-act="journal" data-sec="${k}">${icon(ic)}${l}</button>`).join('')}${G.conductorBeaten ? `<button class="${sec === 'journey' ? 'on' : ''} gold" data-act="journal" data-sec="journey">${icon('loop')}New Journey</button>` : ''}</nav><section class="panel j-body" data-keep-scroll="journal">`;
    if (sec === 'trophies') {
      x += `<h3>${icon('trophy')} Boss trophies</h3><p class="muted">Beat a line’s boss, pick up its trophy and get off the train with it. Every trophy powers up both heroes. Main-line trophies open the next tier; branch-line trophies are extra power.</p><div class="trophies">`;
      for (const line of D.LINES) {
        if (line.final) { x += `<div class="trophy${G.conductorBeaten ? ' got' : ''}">${icon('crown')}<b>Break the Loop</b><small>${G.conductorBeaten ? 'You beat Future Finn and stopped the train!' : 'Beat Future Finn in the Engine and pull the brake.'}</small></div>`; continue; }
        const t = D.TROPHIES[line.id];
        const got = G.trophies[line.id];
        x += `<div class="trophy${got ? ' got' : ''}${line.branch || line.post ? ' side' : ''}">${UI.art.art({ kind: 'trophy', base: line.id, rarity: 4 })}<b>${esc(t.name)}</b><small>${esc(D.ENEMIES[t.boss].name)} · ${esc(line.name)}${line.branch ? ' · branch line' : line.post ? ' · after the Loop' : ''}</small><p>${esc(t.perk)}</p></div>`;
      }
      x += '</div>';
    } else if (sec === 'bestiary') {
      const seen = (id) => (G.codex.enemies[id] || 0) > 0;
      const ids = Object.keys(D.ENEMIES);
      const where = (id) => {
        const e = D.ENEMIES[id];
        const ls = D.LINES.filter((l) => l.boss === id || l.fams.includes(e.fam) || (e.elite && (l.elites ? l.elites.includes(id) : l.tier >= 2 && (id === 'lemongrab' || id === 'magic_man'))));
        return ls.length ? ls.map((l) => l.name).join(', ') : 'Called in by bosses';
      };
      x += `<h3>${icon('skull')} Bestiary <small>${ids.filter(seen).length}/${ids.length} defeated</small></h3><p class="muted">Every monster you beat gets a page here, with a tip for fighting it.</p>`;
      for (const [label, list] of [['Monsters', ids.filter((id) => !D.ENEMIES[id].elite && !D.ENEMIES[id].boss)], ['Elites', ids.filter((id) => D.ENEMIES[id].elite)], ['Bosses', ids.filter((id) => D.ENEMIES[id].boss)]]) {
        x += `<h4 class="b-group">${label} <small>${list.filter(seen).length}/${list.length}</small></h4><div class="bestiary">`;
        for (const id of list) {
          const e = D.ENEMIES[id], got = seen(id);
          x += `<div class="beast${got ? ' got' : ''}${e.boss ? ' boss' : e.elite ? ' elite' : ''}"><img class="bp" data-enemy="${id}" alt="${got ? esc(e.name) : 'Unknown monster'}"><div class="bt"><b>${got ? esc(e.name) : '???'}</b><small>${esc(where(id))}</small>${got ? `<p>${esc(D.BESTIARY[id] || '')}</p><em>${U.fmt(G.codex.enemies[id])} defeated</em>` : '<p class="muted">Defeat one to learn about it.</p>'}</div></div>`;
        }
        x += '</div>';
      }
    } else if (sec === 'legends') {
      const ids = Object.keys(D.UNIQUES);
      const found = ids.filter((id) => G.codex.uniques[id]).length;
      x += `<h3>${icon('star')} Legendary &amp; Glob-Tier loot <small>${found}/${ids.length} found</small></h3><div class="codex">`;
      for (const id of ids) {
        const u = D.UNIQUES[id];
        const got = G.codex.uniques[id];
        const fake = { uid: 'codex_' + id, kind: u.kind, base: u.base, unique: id, rarity: u.rarity, ilvl: Math.max(1, u.minTier), upg: 0, affixes: [], name: u.name, qty: 1 };
        x += got ? `<div class="cx got r${u.rarity}" data-tip="codex" data-u="${id}">${UI.art.art(fake)}<b>${esc(u.name)}</b><small>${esc(D.KINDS[u.kind].label)}</small></div>` : `<div class="cx r${u.rarity}">${UI.art.art(fake, 'silhouette')}<b>???</b><small>${esc(D.KINDS[u.kind].label)} · Tier ${u.minTier}+</small></div>`;
      }
      x += '</div>';
    } else if (sec === 'stats') {
      const s = G.stats;
      const rows = [['Trips', s.trips], ['Escapes', s.escapes], ['Knocked out', s.wipes], ['Monsters defeated', s.kills], ['Elites defeated', s.elites], ['Bosses defeated', s.bosses], ['Chests opened', s.chests], ['Supers used', s.supers], ['Best haul', U.fmt(s.bestHaul) + 'g']];
      x += `<h3>${icon('grid')} Stats</h3><div class="jstats">${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
      x += `<div class="jstats">${D.HERO_IDS.map((h) => `<div><small>${esc(D.HEROES[h].name)}</small><b>Level ${G.chars[h].level}</b><small>${G.chars[h].trips} trips · ${M.tree.spent(G, h)} skill nodes</small></div>`).join('')}${G.journey ? `<div><small>Journey</small><b>#${G.journey + 1}</b><small>${(G.perks || []).map((p) => D.JOURNEY_PERKS[p].name).join(', ')}</small></div>` : ''}</div>`;
    } else if (sec === 'help') {
      x += `<h3>${icon('question')} How to play</h3><div class="help">
        <p><b>The goal:</b> ride the Dungeon Train, grab loot, and get off before the Loop closes. Everything you carry off becomes yours.</p>
        <p><b>Cars:</b> every car has monsters and a treasure chest. The chest unlocks when the car is clear. Smash crates and urns for extra loot.</p>
        <p><b>Getting off:</b> green <b>jump-off doors</b> (hold E), the <b>engine brake</b> (hold E — bonus rewards!), or a <b>Rainicorn flare</b> from your snack belt.</p>
        <p><b>The Loop:</b> the meter at the top fills up. When it’s full the train enters the Loop Tunnel: it gets dark, it hurts, and after 25 seconds you’re Looped — you lose your gear.</p>
        <p><b>Knocked out?</b> You lose everything you wore and carried, except what’s in your safe pocket (Finn’s Hat Stash, Jake’s Tummy).</p>
        <p><b>Two heroes:</b> Finn is a gear hero — swords, full armor, packs and up to 4 relics. Jake is a skill hero — no weapon or armor, but a huge skill tree, and his instrument changes how his stretchy punch works. Each hero has their own level, skill tree and ability keys. The stash is shared.</p>
        <p><b>Loot:</b> most finds are Plain or Radical — good gear is rare, so bring it home! Bosses always drop a prize, and it gets better on harder lines. BMO’s workshop can upgrade and improve what you have.</p>
        <p><b>Rarities:</b> ${D.RARITIES.map((r) => `<span class="rc r${r.id}">${esc(r.name)}</span> ${esc(r.rule)}`).join(' ')}</p></div>
        <h3>${icon('keyboard')} Controls</h3>${UI.hud.controlsHtml()}`;
    } else if (sec === 'glossary') {
      x += `<h3>${icon('book')} Words you’ll see</h3><dl class="gloss-list">${Object.entries(D.GLOSSARY).filter(([k], i, arr) => arr.findIndex(([, v]) => v === D.GLOSSARY[k]) === i).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    } else if (sec === 'save') {
      x += `<h3>${icon('save')} Save</h3><p class="muted">The game saves by itself after every change. Copy a save code to move your game to another browser.</p><div class="save-btns"><button class="btn primary" data-act="export">${icon('save')} Copy save code</button><button class="btn ghost" data-act="import-open">${icon('arrowDown')} Load a save code</button><button class="btn danger ghost" data-act="reset">${icon('x')} Delete save</button></div><textarea id="export-box" class="codebox" readonly hidden></textarea>`;
    } else if (sec === 'journey') {
      x += `<h3>${icon('loop')} A New Journey</h3><p>You broke the Loop! Start over from the caboose with a permanent perk for both heroes, and bring one item with you. Your legendary collection is kept.</p><div class="perks">${Object.entries(D.JOURNEY_PERKS).map(([k, p]) => `<label class="perk"><input type="radio" name="perk" value="${k}" ${k === 'heart' ? 'checked' : ''}><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></label>`).join('')}</div><label class="keep">Keep one item: <select id="keep-item"><option value="">Nothing</option>${[...G.stash, ...D.HERO_IDS.flatMap((h) => Object.values(G.chars[h].equip).filter(Boolean))].filter((i) => M.loot.isGear(i)).sort((a, b) => b.rarity - a.rarity).map((i) => `<option value="${i.uid}">${esc(i.name)} (${esc(UI.rarity(i.rarity).name)})</option>`).join('')}</select></label><button class="btn primary big" data-act="new-journey">${icon('loop')} Start a New Journey</button>`;
    }
    return x + '</section></div>';
  };

  /* ---------- after a trip ---------- */
  HV.result = function (G) {
    const r = G.lastResult;
    if (!r) return '';
    const H = D.HEROES[r.hero];
    const esc2 = (a) => (a || []).map((it) => UI.tile(it, { drag: false, src: 'result' })).join('');
    const how = { bailout: 'You jumped off the train!', brake: 'You pulled the brake and stopped the train!', flare: 'Lady Rainicorn flew you home!' }[r.how] || 'You got off the train!';
    let x = `<div class="result ${r.outcome}"><div class="res-head">${UI.art.portrait(r.hero)}<div><h2>${r.outcome === 'escaped' ? esc(how) : r.looped ? 'Looped!' : 'Knocked out!'}</h2><p>${esc(H.name)} · ${esc(r.lineName)} · ${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')}</p></div></div>`;
    x += `<div class="res-stats"><div>${icon('skull')}<b>${r.kills}</b><small>monsters</small></div><div>${icon('chest')}<b>${r.chests}</b><small>chests</small></div><div>${icon('coin')}<b>${U.fmt(r.gold)}</b><small>gold${r.goldLost ? ` (lost ${U.fmt(r.goldLost)})` : ''}</small></div><div>${icon('sparkle')}<b>${U.fmt(r.xp)}</b><small>experience${r.outcome === 'escaped' ? '' : ' (60%)'}</small></div></div>`;
    if (r.levels && r.levels.length) x += `<div class="res-level">${icon('arrowUp')} <b>${esc(H.name)} reached level ${r.levels[r.levels.length - 1].level}!</b> +${U.sum(r.levels, (l) => l.sp)} skill point${U.sum(r.levels, (l) => l.sp) > 1 ? 's' : ''} to spend in Skills.</div>`;
    if (r.trophy) x += `<div class="res-trophy">${UI.art.art({ kind: 'trophy', base: r.trophy, rarity: 4 })}<div><b>Trophy claimed: ${esc(D.TROPHIES[r.trophy].name)}</b><p>${esc(D.TROPHIES[r.trophy].perk)} The next line is open!</p></div></div>`;
    if (r.outcome === 'escaped') {
      x += `<h4>Brought home (${(r.items || []).length})</h4><div class="grid">${esc2(r.items) || '<p class="muted">Nothing this time.</p>'}</div>`;
      if (r.overflow) x += `<p class="warn">${icon('info')} Your stash was full: ${r.overflow} item${r.overflow > 1 ? 's are' : ' is'} waiting in the overflow. Make room in Loadout.</p>`;
    } else {
      x += `<h4>Lost (${(r.lost || []).length})</h4><div class="grid lost">${esc2(r.lost) || '<p class="muted">Nothing — you had nothing to lose!</p>'}</div>`;
      x += `<h4>${icon(H.safeIcon)} Saved by the ${esc(H.safeName)}</h4><div class="grid">${esc2(r.safe) || `<p class="muted">Nothing was in it. Tip: put your favorite item in the ${esc(H.safeName)} before a trip.</p>`}</div>`;
    }
    x += `<div class="m-actions"><button class="btn ghost" data-act="modal-close">${icon('train')} Back to the board</button><button class="btn primary" data-act="goto-loadout">${icon('user')} Open loadout</button></div></div>`;
    return x;
  };
  HV.ending = function () {
    return `<div class="ending"><h2>You broke the Loop!</h2><p>Future Finn — the you who never got off the train — is beaten, the brake is pulled, and the Dungeon Train finally stops. Finn and Jake step off onto the grass of Ooo. Algebraic!</p><p>But something woke up at the bottom of the tracks: <b>The Lich’s Well</b> is now on the Train Board. You can also open the Journal to start a <b>New Journey</b> with a permanent perk.</p><div class="m-actions"><button class="btn primary big" data-act="modal-close">${icon('check')} Mathematical!</button></div></div>`;
  };
  HV.settings = function () {
    return `<h2>${icon('gear')} Settings</h2>${UI.hud.settingsHtml()}<h3>${icon('keyboard')} Controls</h3>${UI.hud.controlsHtml()}<div class="m-actions"><button class="btn primary" data-act="modal-close">Done</button></div>`;
  };
  HV.importBox = function () {
    return `<h2>${icon('save')} Load a save code</h2><p class="m-text">Paste a code that starts with <b>DT1:</b>. This replaces your current game.</p><textarea id="import-box" class="codebox" placeholder="DT1:..." autofocus></textarea><div class="m-actions"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="import">Load</button></div>`;
  };

  DT.ui.hub = HV;
})();
