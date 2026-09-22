/* The Vestibule (hub) and the title screen. */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;
  const ENG = LCO.engine;
  const icon = LCO.icon;
  const esc = U.esc;
  const UI = LCO.ui;

  UI.recLevel = (tier) => ENG.levelForTier(tier);
  const pips = (t) => `<span class="tierpips" aria-label="Tier ${t}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < t ? 'on' : ''}"></i>`).join('')}</span>`;

  UI.renderTitle = (hasSave) => `
    <div class="windows" aria-hidden="true"></div>
    <section class="title-screen">
      <div class="stack" style="gap:18px">
        <p class="eyebrow">An extraction RPG aboard an endless train</p>
        <h1>Last Car<br>Out</h1>
        <p class="pitch">You woke up on a train that never stops. Every car is its own little world — a kingdom of corgis, a desert under a bolted-on sun, a library whose ceiling is very far away. There is a glowing number on your palm. Get it to zero, and a door home opens.</p>
        <div class="row">
          ${hasSave ? '<button type="button" class="btn primary" data-act="continue">Continue your trip</button>' : ''}
          <button type="button" class="btn ${hasSave ? '' : 'primary'}" data-act="new-game-prompt">${hasSave ? 'Start over' : 'Board the train'}</button>
          <button type="button" class="btn ghost" data-act="import-prompt">Load a save code</button>
        </div>
        <p class="small muted">A fan-made game inspired by <i>Infinity Train</i>. Progress saves in this browser.</p>
      </div>
      <div class="panel inset">
        <h3 class="eyebrow">How a trip works</h3>
        <ul class="how">
          <li>${icon('train')}<span><b>Board a car.</b> Pick a departure. Higher tiers pay better and bite harder.</span></li>
          <li>${icon('chest')}<span><b>Loot and fight.</b> Explore compartments for gear, valuables and Relics with real powers.</span></li>
          <li>${icon('clock')}<span><b>Watch the Instability.</b> Every step shakes the car apart. At 150% it unmakes itself — with you inside.</span></li>
          <li>${icon('door')}<span><b>Get out alive.</b> Reach an exit to keep everything. Fall, and you lose what you carried and wore. Only the Secure Pouch is safe.</span></li>
          <li>${icon('star')}<span><b>Grow.</b> Level up, spend points across 85 skills in five branches, and lower your Number.</span></li>
        </ul>
      </div>
    </section>`;

  const TABS = [
    { id: 'departures', label: 'Departures', icon: 'train' },
    { id: 'loadout', label: 'Loadout', icon: 'bag' },
    { id: 'stash', label: 'Stash', icon: 'chest' },
    { id: 'skills', label: 'Skills', icon: 'star' },
    { id: 'market', label: 'Market', icon: 'cart' },
    { id: 'workbench', label: 'Workbench', icon: 'anvil' },
    { id: 'journal', label: 'Journal', icon: 'book' },
  ];

  UI.header = (G, S) => {
    const need = ENG.xpToNext(G.level);
    return `<header class="topbar">
      <div class="brand"><span class="brand-name">Last Car Out</span><span class="brand-sub">${G.raid ? 'Aboard Car ' + esc(G.raid.car.num) : 'The Vestibule'}${G.ascension ? ` · Journey ${G.ascension + 1}` : ''}</span></div>
      <div class="vitals">
        <div class="levelbox"><div class="lv"><b>Level ${G.level}</b><span class="num">${G.level >= ENG.MAX_LEVEL ? 'MAX' : `${U.fmt(G.xp)} / ${U.fmt(need)} XP`}</span></div>${UI.meter(G.xp, need, 'xp')}</div>
        ${UI.coins(G)}
        ${UI.palm(G.number)}
      </div>
    </header>`;
  };

  UI.renderHub = (G) => {
    const S = ENG.stats.compute(G);
    const t = UI.st.tab;
    const badge = { skills: G.sp, stash: G.overflow.length };
    const tabs = TABS.map((x) => `<button type="button" class="tab" role="tab" aria-selected="${x.id === t}" data-act="tab" data-tab="${x.id}">${icon(x.icon)}${x.label}${badge[x.id] ? `<span class="badge">${badge[x.id]}</span>` : ''}</button>`).join('');
    const body = {
      departures: UI.tabDepartures, loadout: UI.tabLoadout, stash: UI.tabStash, skills: UI.tabSkills,
      market: UI.tabMarket, workbench: UI.tabWorkbench, journal: UI.tabJournal,
    }[t] || UI.tabDepartures;
    return `<div class="windows" aria-hidden="true"></div>${UI.header(G, S)}<nav class="tabs" role="tablist">${tabs}</nav><section class="tabpanel" role="tabpanel">${body(G, S)}</section>`;
  };

  /* ---------- departures ---------- */
  UI.tabDepartures = (G, S) => {
    const parts = [];
    const r = G.lastResult;
    if (r) {
      const outcome = r.outcome === 'died' ? `Lost in Car ${esc(r.car.num)}` : r.outcome === 'home' ? 'You went home' : `Made it out of Car ${esc(r.car.num)}`;
      const nd = r.numberDelta || 0;
      parts.push(`<div class="panel inset lastrun"><div class="spread"><div class="stack" style="gap:4px"><span class="eyebrow">Last trip</span><strong>${outcome}</strong>
        <span class="small muted">${esc(r.car.name)} · +${U.fmt(r.xp)} XP · Number <span class="${nd <= 0 ? 'glow' : 'bad'}">${nd > 0 ? '+' : ''}${nd}</span></span></div>
        <button type="button" class="btn small" data-act="show-result">Trip report</button></div></div>`);
    }
    if (ENG.hub.needsHandout(G)) {
      parts.push(`<div class="panel inset"><div class="spread"><p>You have no weapon and not much money. A sleek cat on a luggage rack looks at you with something like pity.</p><button type="button" class="btn glowing" data-act="handout">Accept the Cat’s charity</button></div></div>`);
    }
    const warn = [];
    if (!G.equip.weapon) warn.push('No weapon equipped — you will fight with bare hands.');
    if (!G.belt.some(Boolean)) warn.push('Your belt is empty. Bandages save lives.');
    if (G.overflow.length) warn.push(`${G.overflow.length} item${G.overflow.length === 1 ? '' : 's'} could not fit in your stash. Sort them out in the Stash tab.`);
    if (G.sp) warn.push(`You have ${G.sp} unspent skill point${G.sp === 1 ? '' : 's'}.`);
    const offers = G.board.map((o) => {
      const car = D.CARS[o.theme];
      const mod = D.MODIFIERS[o.mod];
      const les = D.LESSONS[o.lesson];
      const rumor = D.RUMORS.find((x) => x.id === o.rumor);
      const rec = o.theme === 'engine' ? 30 : UI.recLevel(o.tier);
      const under = G.level < rec - 3;
      return `<article class="dep${o.theme === 'engine' ? ' engine' : ''}">
        <div class="carno"><small>CAR</small>${esc(o.num)}</div>
        <div class="dest"><h3>${esc(car.name)}</h3><p class="blurb">${esc(car.blurb)}</p>
          <div class="row"><span class="chip tier">${pips(o.tier)} T${o.tier}</span>
          <span class="chip rule" title="${esc(mod.desc)}">${icon('lock')}${esc(mod.name)}</span>
          <span class="chip lesson" title="${esc(les.desc)}">${icon('hash')}Lesson: ${esc(les.name)}</span></div>
          <p class="small muted">${esc(mod.desc)} · <span class="glow">${esc(les.desc)}</span>${rumor && rumor.id !== 'none' ? ` · <i>${esc(rumor.text)}</i>` : ''}</p>
        </div>
        <div class="go"><span class="small ${under ? 'bad' : 'muted'}">Recommended: Lv ${rec}${under ? ' — dangerous' : ''}</span>
          <button type="button" class="btn ${o.theme === 'engine' ? 'danger' : 'primary'}" data-act="board" data-id="${esc(o.id)}">${o.theme === 'engine' ? 'Walk to the front' : 'Board'}</button></div>
      </article>`;
    }).join('');
    parts.push(`<div class="sect-title"><h2>Departures</h2><div class="row"><span class="small muted">Tiers open: 1–${ENG.maxTier(G)}${ENG.maxTier(G) < 10 ? (G.unlockedTier > ENG.maxTier(G) ? ` · tier ${ENG.maxTier(G) + 1} at Lv ${ENG.levelForTier(ENG.maxTier(G) + 1)}` : ` · extract from a tier ${ENG.maxTier(G)} car to open tier ${ENG.maxTier(G) + 1}`) : ''}</span><button type="button" class="btn small" data-act="reroll-board" ${G.tickets < 15 ? 'disabled' : ''}>${icon('refresh')}New board <span class="cost">15 tix</span></button></div></div>`);
    if (warn.length) parts.push(`<ul class="lines">${warn.map((w) => `<li class="warn">${esc(w)}</li>`).join('')}</ul>`);
    parts.push(`<div class="board">${offers}</div>`);
    if (G.number > 30 && !G.engineCleared) parts.push(`<p class="small muted">The Engine at the front of the train only lets you in once your Number is 30 or lower.</p>`);
    return parts.join('');
  };

  /* ---------- loadout ---------- */
  UI.statTable = (S) => {
    const W = S.weapon;
    const rows = [
      ['Max HP', S.maxHp], ['Armor', `${S.armor} (${Math.round(ENG.stats.armorReduction(S.armor) * 100)}%)`], ['Weapon', `${W.min}–${W.max}${W.hits > 1 ? ' ×' + W.hits : ''}`],
      ['Weapon Damage', U.signed(Math.round(S.dmgPct * 100)) + '%'], ['Crit Chance', Math.round(S.critChance * 100) + '%'], ['Crit Damage', Math.round(S.critDmg * 100) + '%'],
      ['Dodge', Math.round(S.dodge * 100) + '%'], ['AP per turn', S.ap], ['Focus', `${S.maxFocus} (+${S.focusRegen}/turn)`], ['Ability Power', U.signed(Math.round(S.abilityPower * 100)) + '%'],
      ['Lifesteal', Math.round(S.lifesteal * 100) + '%'], ['Thorns', S.thorns], ['Status Resist', Math.round(S.statusResist * 100) + '%'], ['Loot Find', U.signed(Math.round(S.lootFind * 100)) + '%'],
      ['Backpack', S.backpack + ' slots'], ['Secure Pouch', S.pouch + ' slots'], ['Sight', S.sight + ' rooms'], ['Instability', `−${Math.round(S.instabilitySlow * 100)}%`], ['Experience', U.signed(Math.round(S.xpGain * 100)) + '%'],
    ];
    return `<div class="statgrid">${rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
  };

  UI.abilityBarEditor = (G) => {
    const known = ENG.hub.knownAbilities(G);
    const slots = ENG.abilitySlots(G);
    if (!known.length) return '<p class="small muted">Learn an active skill in the Skills tab to fill your ability bar.</p>';
    const opts = (sel) => `<option value="">— empty —</option>` + known.map((a) => `<option value="${a}" ${a === sel ? 'selected' : ''}>${esc(D.ABILITIES[a].name)}</option>`).join('');
    const cells = [];
    for (let i = 0; i < slots; i++) cells.push(`<label class="aslot"><span class="eyebrow">Slot ${i + 1}</span><select id="bar-${i}" data-change="bar-set" data-slot="${i}">${opts(G.bar[i])}</select></label>`);
    return `<div class="abar">${cells.join('')}</div><p class="small muted">${slots} slots now · more open at levels 10 and 20.</p>`;
  };

  UI.tabLoadout = (G, S) => {
    const eq = D.SLOTS.map((s) => `<div class="slot"><span class="eyebrow">${s.name}</span>${G.equip[s.id] ? UI.itemCard(G.equip[s.id], { from: 'equip', slot: s.id }) : UI.itemCard(null, { emptyLabel: 'Nothing equipped' })}</div>`).join('');
    const belt = G.belt.map((b, i) => (b ? UI.itemCard(b, { from: 'belt', slot: i }) : UI.itemCard(null, { emptyLabel: 'Empty belt slot' }))).join('');
    const pouch = [];
    for (let i = 0; i < S.pouch; i++) pouch.push(G.pouch[i] ? UI.itemCard(G.pouch[i], { from: 'pouch' }) : UI.itemCard(null, { emptyLabel: 'Secure slot' }));
    const quick = G.stash.filter((i) => i.kind !== 'valuable');
    return `<div class="split">
      <div class="stack" style="gap:18px">
        <div class="stack"><div class="sect-title"><h2>Equipped</h2><span class="small muted">Lost if you die in a car</span></div><div class="slots">${eq}</div></div>
        <div class="stack"><div class="sect-title"><h3>Belt</h3><span class="small muted">Usable in fights · lost on death</span></div><div class="items tight">${belt}</div></div>
        <div class="stack"><div class="sect-title"><h3>Secure Pouch</h3><span class="small muted">Survives death — put your best find here</span></div><div class="items tight">${pouch.join('') || '<p class="small muted">No pouch slots.</p>'}</div></div>
        <div class="stack"><div class="sect-title"><h3>Ability Bar</h3></div>${UI.abilityBarEditor(G)}</div>
      </div>
      <div class="stack" style="gap:18px">
        <div class="panel inset"><div class="sect-title"><h3>Your stats</h3></div>${UI.statTable(S)}${S.setActive ? `<p class="small glow">Set active: ${S.setActive.map((s) => esc(D.SETS[s].name)).join(', ')}</p>` : ''}</div>
        <div class="stack"><div class="sect-title"><h3>From your stash</h3><span class="small muted">Tap to inspect & equip</span></div><div class="items tight">${quick.map((i) => UI.itemCard(i, { from: 'stash' })).join('') || '<p class="small muted">Nothing to equip.</p>'}</div></div>
      </div>
    </div>`;
  };

  /* ---------- stash ---------- */
  const FILTERS = [['all', 'All'], ['gear', 'Gear'], ['consumable', 'Consumables'], ['valuable', 'Valuables'], ['relic', 'Relics']];
  UI.tabStash = (G, S) => {
    const f = UI.st.filter;
    const match = (i) => f === 'all' || (f === 'gear' ? ENG.loot.GEAR.includes(i.kind) : f === 'relic' ? i.rarity >= 4 : i.kind === f);
    const list = G.stash.filter(match).slice().sort((a, b) => b.rarity - a.rarity || (a.kind > b.kind ? 1 : -1));
    const valTotal = U.sum(G.stash.filter((i) => i.kind === 'valuable'), (i) => ENG.loot.sellPrice(i, S));
    const upc = ENG.hub.upgradeStashCost(G);
    const over = G.overflow.length ? `<div class="panel" style="border-color:var(--signal)"><div class="sect-title"><h3 class="bad">No room in the stash</h3><span class="small muted">Sell, salvage, equip or discard these</span></div><div class="items">${G.overflow.map((i) => UI.itemCard(i, { from: 'overflow' })).join('')}</div></div>` : '';
    return `${over}<div class="sect-title"><h2>Stash</h2><span class="cap ${G.stash.length >= G.stashCap ? 'full' : ''}">${G.stash.length} / ${G.stashCap}</span></div>
      <div class="spread"><div class="row">${FILTERS.map(([id, l]) => `<button type="button" class="btn small ${f === id ? 'glowing' : 'ghost'}" data-act="filter" data-filter="${id}" aria-pressed="${f === id}">${l}</button>`).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-act="sell-valuables" ${valTotal ? '' : 'disabled'}>${icon('ticket')}Sell all valuables <span class="cost">+${U.fmt(valTotal)}</span></button>
      ${upc != null ? `<button type="button" class="btn small" data-act="stash-upgrade" ${G.tickets < upc ? 'disabled' : ''}>${icon('plus')}+10 slots <span class="cost">${U.fmt(upc)} tix</span></button>` : ''}</div></div>
      <div class="items">${list.map((i) => UI.itemCard(i, { from: 'stash' })).join('') || '<p class="muted">Nothing here yet. Bring something home.</p>'}</div>`;
  };
})();

/* ---------- market, workbench, journal, inspect, reports ---------- */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;
  const ENG = LCO.engine;
  const icon = LCO.icon;
  const esc = U.esc;
  const UI = LCO.ui;
  const GEAR = ENG.loot.GEAR;

  UI.tabMarket = (G, S) => {
    const stock = G.market.stock.map((i) => UI.itemCard(i, { from: 'market', price: ENG.loot.buyPrice(i, S) })).join('');
    const rc = ENG.hub.respecCost(G);
    const upc = ENG.hub.upgradeStashCost(G);
    const spent = Object.values(G.skills).reduce((a, b) => a + b, 0);
    return `<div class="split">
      <div class="stack"><div class="sect-title"><h2>The Cat’s Market</h2><button type="button" class="btn small" data-act="refresh-market" ${G.tickets < 25 ? 'disabled' : ''}>${icon('refresh')}New stock <span class="cost">25 tix</span></button></div>
        <p class="small muted">“Everything is for sale,” says the Cat, “except me.” Stock changes after every trip.</p>
        <div class="items">${stock || '<p class="muted">Sold out.</p>'}</div></div>
      <div class="stack"><div class="panel inset"><div class="sect-title"><h3>Services</h3></div>
        <div class="stack">
          <div class="spread"><span>Forget every skill and get the points back</span><button type="button" class="btn small" data-act="respec" ${G.tickets < rc || !spent ? 'disabled' : ''}>Respec <span class="cost">${U.fmt(rc)} tix</span></button></div>
          ${upc != null ? `<div class="spread"><span>Rent 10 more stash slots</span><button type="button" class="btn small" data-act="stash-upgrade" ${G.tickets < upc ? 'disabled' : ''}>Expand <span class="cost">${U.fmt(upc)} tix</span></button></div>` : ''}
          <div class="spread"><span>Sell every valuable in your stash</span><button type="button" class="btn small" data-act="sell-valuables">Sell</button></div>
        </div></div>
        <p class="small muted">To sell a single item, open it from your stash.</p></div>
    </div>`;
  };

  UI.tabWorkbench = (G, S) => {
    const gear = [];
    for (const s of D.SLOTS) if (G.equip[s.id]) gear.push({ it: G.equip[s.id], eq: true });
    for (const it of G.stash) if (GEAR.includes(it.kind)) gear.push({ it, eq: false });
    const sel = gear.find((g) => g.it.uid === UI.st.workItem) || gear[0];
    let detail = '<p class="muted">No gear to work on.</p>';
    if (sel) {
      const it = sel.it;
      const uc = ENG.hub.upgradeCost(it);
      const rc = ENG.hub.rerollCost(it);
      const sy = ENG.loot.salvageYield(it, S);
      const can = (c) => c && G.scrap >= c.scrap && G.glimmer >= c.glimmer;
      detail = `${UI.itemDetail(it, null)}<div class="stack">
        <div class="spread"><span>${uc ? `Upgrade to +${it.upg + 1} <span class="small muted">(+10% base stats, +5% affixes)</span>` : 'Fully upgraded'}</span>
          <button type="button" class="btn small primary" data-act="upgrade" data-uid="${esc(it.uid)}" ${can(uc) ? '' : 'disabled'}>${icon('anvil')}Upgrade ${uc ? `<span class="cost">${uc.scrap} scrap${uc.glimmer ? ' · ' + uc.glimmer + ' glimmer' : ''}</span>` : ''}</button></div>
        ${rc ? `<div class="spread"><span>Reroll its random affixes</span><button type="button" class="btn small" data-act="reroll" data-uid="${esc(it.uid)}" ${can(rc) ? '' : 'disabled'}>${icon('refresh')}Reroll <span class="cost">${rc.scrap} scrap · ${rc.glimmer} glimmer</span></button></div>` : ''}
        ${sel.eq ? '<p class="small muted">Unequip it to salvage.</p>' : `<div class="spread"><span>Break it down</span><button type="button" class="btn small danger" data-act="salvage" data-uid="${esc(it.uid)}">Salvage <span class="cost">+${sy.scrap} scrap${sy.glimmer ? ' · +' + sy.glimmer + ' glimmer' : ''}</span></button></div>`}
      </div>`;
    }
    return `<div class="split">
      <div class="stack"><div class="sect-title"><h2>Workbench</h2>${UI.coins({ tickets: G.tickets, scrap: G.scrap, glimmer: G.glimmer })}</div>
        <p class="small muted">Salvage gear into Scrap. Exquisite and better gear also yields Glimmer.</p>
        <div class="items tight">${gear.map((g) => UI.itemCard(g.it, { act: 'work-select', selected: sel && g.it.uid === sel.it.uid })).join('')}</div></div>
      <div class="panel inset">${detail}</div>
    </div>`;
  };

  UI.tabJournal = (G, S) => {
    const st = G.stats;
    const kv = [['Trips', st.raids], ['Made it out', st.extracts], ['Lost', st.deaths], ['Denizens beaten', st.kills], ['Elites beaten', st.elites], ['Lessons learned', st.lessons],
      ['Relics found', Object.keys(G.codex.relics).filter((k) => D.RELICS[k]).length + ' / ' + Object.keys(D.RELICS).length], ['Best haul', U.fmt(st.bestHaul) + ' tix'], ['Deepest tier', st.deepest || '—'], ['Lowest Number', G.numberLow]];
    const hist = G.history.slice().reverse().map((h) => `<li><span class="d num ${h.d < 0 ? 'down' : 'up'}">${h.d > 0 ? '+' : ''}${h.d}</span><span>${esc(h.why)}</span><span class="num muted">${h.n}</span></li>`).join('');
    const codex = Object.keys(D.RELICS).map((id) => {
      const r = D.RELICS[id];
      return G.codex.relics[id] ? `<div class="panel inset" style="gap:4px;padding:10px"><b class="rtext r${r.rarity}">${esc(r.name)}</b><span class="small muted">${esc(r.desc)}</span></div>` : `<div class="unknown">??? <span class="rtext r${r.rarity}">${r.rarity === 5 ? 'Engine-Forged' : 'Relic'}</span> · tier ${r.minTier}+</div>`;
    }).join('');
    const mem = (G.memories || []).map((m) => `<li><b>${esc(D.MEMORIES[m].name)}</b> — ${esc(D.MEMORIES[m].desc)}</li>`).join('');
    return `<div class="split">
      <div class="stack" style="gap:18px">
        <div class="sect-title"><h2>Journal</h2><span class="small muted">${esc(G.name)}${G.ascension ? ` · Journey ${G.ascension + 1}` : ''}</span></div>
        <div class="kv">${kv.map(([k, v]) => `<div><b>${esc(v)}</b><span>${k}</span></div>`).join('')}</div>
        <div class="stack"><h3 class="eyebrow">Your Number, over time</h3><ul class="history">${hist || '<li class="muted">Nothing yet.</li>'}</ul></div>
        ${mem ? `<div class="stack"><h3 class="eyebrow">Memories you carried back</h3><ul class="lines">${mem}</ul></div>` : ''}
        <div class="panel inset"><h3 class="eyebrow">Save</h3><p class="small muted">Progress saves in this browser after every action. Copy a save code to move it elsewhere.</p>
          <div class="row"><button type="button" class="btn small" data-act="export-save">${icon('save')}Get save code</button><button type="button" class="btn small" data-act="import-prompt">Load save code</button><button type="button" class="btn small danger" data-act="new-game-prompt">Abandon journey</button></div></div>
      </div>
      <div class="stack"><h3 class="eyebrow">Relic codex</h3><div class="codex">${codex}</div></div>
    </div>`;
  };

  /* ---------- inspect: one modal, actions by context ---------- */
  function locate(G, uid, from, key) {
    const raid = G.raid;
    switch (from) {
      case 'market': return G.market.stock.find((i) => i.uid === uid);
      case 'loot': { const c = raid && ENG.raid.cellByKey(raid, key); return c && c.loot && c.loot.items.find((i) => i.uid === uid); }
      case 'mstock': { const c = raid && ENG.raid.cellByKey(raid, key); return c && c.stock && c.stock.find((i) => i.uid === uid); }
      case 'backpack': return raid && raid.backpack.find((i) => i.uid === uid);
      default: { const f = ENG.hub.findAnywhere(G, uid); return f && f.item; }
    }
  }
  UI.inspect = (G, uid, from, key) => {
    const S = ENG.stats.compute(G);
    const it = locate(G, uid, from, key);
    if (!it) return null;
    const u = esc(it.uid);
    const a = [];
    const gear = GEAR.includes(it.kind);
    const inRaid = !!G.raid;
    let compare = null;
    if (gear && from !== 'equip') compare = it.kind === 'charm' ? G.equip.charm1 || G.equip.charm2 : G.equip[it.kind];
    const btn = (act, label, extra, cls) => `<button type="button" class="btn small ${cls || ''}" data-act="${act}" data-uid="${u}" ${extra || ''}>${label}</button>`;
    if (!inRaid) {
      if (from === 'stash' || from === 'overflow') {
        if (gear && it.kind === 'charm') a.push(btn('equip', 'Equip as Charm 1', 'data-slot="charm1"', 'primary'), btn('equip', 'Equip as Charm 2', 'data-slot="charm2"'));
        else if (gear) a.push(btn('equip', 'Equip', '', 'primary'));
        if (it.kind === 'consumable') a.push(btn('belt-add', 'Put on belt', '', 'primary'));
        if (G.pouch.length < S.pouch) a.push(btn('pouch-add', 'Move to Secure Pouch'));
        a.push(btn('sell', `Sell <span class="cost">+${U.fmt(ENG.loot.sellPrice(it, S))}</span>`));
        if (gear) { const y = ENG.loot.salvageYield(it, S); a.push(btn('salvage', `Salvage <span class="cost">+${y.scrap} scrap${y.glimmer ? ' +' + y.glimmer + ' glimmer' : ''}</span>`)); }
        a.push(btn('discard', 'Throw away', '', 'danger'));
      } else if (from === 'equip') {
        a.push(`<button type="button" class="btn small" data-act="unequip" data-slot="${esc(UI.st.inspectSlot || '')}">Unequip</button>`, `<button type="button" class="btn small" data-act="goto-work" data-uid="${u}">Take to the Workbench</button>`);
      } else if (from === 'belt') {
        a.push(`<button type="button" class="btn small" data-act="belt-remove" data-slot="${esc(UI.st.inspectSlot || '')}">Back to stash</button>`);
      } else if (from === 'pouch') {
        a.push(btn('pouch-remove', 'Back to stash'));
      } else if (from === 'market') {
        const p = ENG.loot.buyPrice(it, S);
        a.push(btn('buy', `Buy <span class="cost">${U.fmt(p)} tix</span>`, G.tickets < p ? 'disabled' : '', 'primary'));
      }
    } else {
      const raid = G.raid;
      const room = raid.backpack.length < S.backpack;
      const mapUse = it.kind === 'consumable' && ['bandage', 'beans', 'stability_coil', 'schematic'].includes(it.base);
      if (from === 'loot') a.push(`<button type="button" class="btn small primary" data-act="take" data-uid="${u}" data-key="${esc(key)}" ${room || it.kind === 'consumable' ? '' : 'disabled'}>${room ? 'Take' : 'Backpack full'}</button>`);
      if (from === 'mstock') { const p = ENG.loot.buyPrice(it, S); a.push(`<button type="button" class="btn small primary" data-act="mbuy" data-uid="${u}" data-key="${esc(key)}" ${raid.carry.tickets + G.tickets < p ? 'disabled' : ''}>Buy <span class="cost">${U.fmt(p)} tix</span></button>`); }
      if (from === 'backpack') {
        if (mapUse) a.push(`<button type="button" class="btn small primary" data-act="use-map" data-where="pack" data-ref="${u}">Use now</button>`);
        if (it.kind === 'consumable') a.push(btn('to-belt', 'Put on belt'));
        if (G.pouch.length < S.pouch) a.push(btn('to-pouch', 'Move to Secure Pouch', '', 'glowing'));
        if (raid.view && raid.view.type === 'merchant') a.push(btn('msell', `Sell to merchant <span class="cost">+${U.fmt(ENG.loot.sellPrice(it, S))}</span>`));
        a.push(btn('drop', 'Drop here', '', 'danger'));
      }
      if (from === 'pouch') a.push(btn('from-pouch', 'Move to backpack', room ? '' : 'disabled'));
      if (from === 'belt' && mapUse) a.push(`<button type="button" class="btn small primary" data-act="use-map" data-where="belt" data-ref="${esc(UI.st.inspectSlot || '')}">Use now</button>`);
    }
    return `${UI.modalHead('Inspect')}${UI.itemDetail(it, S, { compare })}<div class="actions">${a.join('')}</div>`;
  };

  /* ---------- trip report & ending ---------- */
  UI.resultModal = (G) => {
    const r = G.lastResult;
    if (!r) return '';
    const nd = r.numberDelta || 0;
    const delta = `<span class="delta ${nd <= 0 ? 'down' : 'up'}">${nd > 0 ? '+' : ''}${nd}</span>`;
    const les = D.LESSONS[r.lesson.id];
    const lv = r.levels && r.levels.length ? `<p class="glow">Level up! You reached level ${r.levels[r.levels.length - 1].level} and gained ${U.sum(r.levels, (l) => l.sp)} skill point${U.sum(r.levels, (l) => l.sp) === 1 ? '' : 's'}.</p>` : '';
    const cards = (list) => `<div class="items tight">${list.map((i) => UI.itemCard(i, { act: 'noop' })).join('')}</div>`;
    if (r.outcome === 'died') {
      return `${UI.modalHead('Lost in Car ' + esc(r.car.num), esc(r.cause))}
        <div class="result-head">${UI.palm(r.number, true)}<div class="stack" style="gap:4px"><span class="eyebrow">Your Number</span>${delta}</div></div>
        <div class="kv"><div><b>+${U.fmt(r.xp)}</b><span>XP kept</span></div><div><b>${r.lost.length}</b><span>Items lost</span></div><div><b>${U.fmt(r.tickets || 0)}</b><span>Tickets dropped</span></div></div>${lv}
        ${r.lost.length ? `<div class="stack"><h3 class="eyebrow">Left behind in the car</h3>${cards(r.lost)}</div>` : ''}
        ${r.returned && r.returned.length ? `<div class="stack"><h3 class="eyebrow good">Lost & Found returned</h3>${cards(r.returned)}</div>` : ''}
        ${r.pouch && r.pouch.length ? `<div class="stack"><h3 class="eyebrow glow">Safe in your Secure Pouch</h3>${cards(r.pouch)}</div>` : ''}
        <div class="actions"><button type="button" class="btn primary" data-act="close-modal">Back to the Vestibule</button></div>`;
    }
    const how = { far: 'through the Far Door', hatch: 'through an emergency hatch', locked: 'through the locked coupling', toll: 'past the toll gate', cord: 'by pulling the emergency cord', ticket: 'on the Unpunched Ticket', home: 'through the door home' }[r.how] || '';
    return `${UI.modalHead('You made it out', `Car ${esc(r.car.num)}, ${esc(r.car.name)} — ${how}${r.collapse ? ', as the car collapsed' : ''}.`)}
      <div class="result-head">${UI.palm(r.number, true)}<div class="stack" style="gap:4px"><span class="eyebrow">Your Number</span>${delta}</div></div>
      <div class="kv"><div><b>+${U.fmt(r.xp)}</b><span>Experience</span></div><div><b>+${U.fmt(r.tickets)}</b><span>Tickets</span></div><div><b>+${U.fmt(r.scrap)}</b><span>Scrap</span></div><div><b>+${U.fmt(r.glimmer)}</b><span>Glimmer</span></div><div><b>${U.fmt(r.haul)}</b><span>Haul value</span></div></div>
      <p class="${r.lesson.ok ? 'glow' : 'muted'}">${r.lesson.ok ? `Lesson learned: <b>${esc(les.name)}</b>. Your Number fell further.` : `Lesson not learned: ${esc(les.name)} — ${esc(les.desc)}`}</p>${lv}
      ${r.items.length ? `<div class="stack"><h3 class="eyebrow">Brought home</h3>${cards(r.items)}</div>` : '<p class="muted">You came back empty-handed, but you came back.</p>'}
      ${r.lost && r.lost.length ? `<div class="stack"><h3 class="eyebrow bad">Lost in the scramble</h3>${cards(r.lost)}</div>` : ''}
      ${r.overflow ? `<p class="warn">${r.overflow} item${r.overflow === 1 ? '' : 's'} didn’t fit in your stash — see the Stash tab.</p>` : ''}
      <div class="actions"><button type="button" class="btn primary" data-act="close-modal">Back to the Vestibule</button></div>`;
  };

  UI.endingModal = (G) => {
    const owned = new Set(G.memories || []);
    const mems = Object.keys(D.MEMORIES).filter((m) => !owned.has(m));
    const keeps = [...Object.values(G.equip).filter(Boolean), ...G.stash.filter((i) => GEAR.includes(i.kind))].sort((a, b) => b.rarity - a.rarity);
    return `${UI.modalHead('Your Number reads 0')}
      ${UI.palm(0, true)}
      <p>The door opens onto an ordinary hallway. It smells like home. Behind you, the train hums, patient as ever. There are always more cars.</p>
      <div class="stack"><h3 class="eyebrow">Go home — and start a new journey with a Memory</h3>
        ${mems.length ? mems.map((m, i) => `<label class="row"><input type="radio" name="memory" id="mem-${m}" value="${m}" ${i === 0 ? 'checked' : ''}> <span><b>${esc(D.MEMORIES[m].name)}</b> — ${esc(D.MEMORIES[m].desc)}</span></label>`).join('') : '<p class="muted">You already carry every memory.</p>'}
        <label class="field"><span class="eyebrow">One keepsake to carry through</span><select id="keepsake"><option value="">Nothing</option>${keeps.map((i) => `<option value="${esc(i.uid)}">${esc(i.name)}${i.upg ? ' +' + i.upg : ''}</option>`).join('')}</select></label>
      </div>
      <div class="actions"><button type="button" class="btn primary" data-act="go-home">Go home</button><button type="button" class="btn" data-act="close-modal">Stay aboard a while</button></div>`;
  };

  UI.newGameModal = (hasSave) => `${UI.modalHead(hasSave ? 'Start a new journey?' : 'Board the train')}
    ${hasSave ? '<p class="warn">This replaces your current save in this browser. Copy a save code from the Journal first if you want to keep it.</p>' : ''}
    <label class="field"><span class="eyebrow">What should the train call you?</span><input id="pname" maxlength="24" value="Passenger" autocomplete="off"></label>
    <div class="actions"><button type="button" class="btn primary" data-act="new-game">Board</button><button type="button" class="btn" data-act="close-modal">Cancel</button></div>`;
  UI.importModal = () => `${UI.modalHead('Load a save code')}
    <label class="field"><span class="eyebrow">Paste a code that starts with LCO1:</span><textarea id="savecode" spellcheck="false"></textarea></label>
    <div class="actions"><button type="button" class="btn primary" data-act="import-save">Load</button><button type="button" class="btn" data-act="close-modal">Cancel</button></div>`;
  UI.exportModal = (code) => `${UI.modalHead('Your save code', 'Keep it somewhere safe. Paste it into “Load save code” to continue anywhere.')}
    <label class="field"><span class="eyebrow">Save code</span><textarea id="savecode-out" readonly spellcheck="false">${esc(code)}</textarea></label>
    <div class="actions"><button type="button" class="btn primary" data-act="copy-save">Copy</button><button type="button" class="btn" data-act="close-modal">Done</button></div>`;
})();
