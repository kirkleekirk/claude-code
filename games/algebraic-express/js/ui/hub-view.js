/* The Tree Fort (hub) and the title screen. */
(function () {
  'use strict';
  const D = AE.data;
  const U = AE.U;
  const M = AE.meta;
  const icon = AE.icon;
  const esc = U.esc;
  const UI = AE.ui;

  UI.renderTitle = (hasSave, glOk) => `
    <section class="title">
      <div class="logo"><span class="l1">Algebraic</span><span class="l2">Express</span></div>
      <p class="pitch">Princesses are vanishing off the trains of Ooo, and something icy is behind it. Grab your sword, grab your bro, and ride the rails: smash through the cars, snag the loot, rescue who you can, and jump off before the blizzard freezes the whole train.</p>
      ${glOk ? '' : '<p class="warnbox">Your browser couldn’t start 3D graphics (WebGL). The game needs it — try another browser or turn on hardware acceleration.</p>'}
      <div class="row">
        ${hasSave ? '<button type="button" class="btn primary big" data-act="continue">Continue</button>' : ''}
        <button type="button" class="btn ${hasSave ? '' : 'primary'} big" data-act="new-game-prompt">${hasSave ? 'New game' : 'Start adventuring'}</button>
        <button type="button" class="btn ghost" data-act="import-prompt">Load a save code</button>
      </div>
      <ul class="how">
        <li>${icon('train')}<span><b>Board a train.</b> Each route runs through a different corner of Ooo — tougher routes, better treasure.</span></li>
        <li>${icon('sword')}<span><b>Fight as Finn and Jake.</b> Swap between them any time; the other one fights by your side.</span></li>
        <li>${icon('snow')}<span><b>Beat the blizzard.</b> The meter fills as you go. Bail out through a glowing door, pull the engine’s brake, or freeze.</span></li>
        <li>${icon('tummy')}<span><b>Get out with the goods.</b> Wipe and you lose what you carried and wore — only Jake’s Tummy keeps things safe.</span></li>
        <li>${icon('princess')}<span><b>Rescue six princesses</b> to face the Ice King on his own train.</span></li>
      </ul>
      <p class="fine">An unofficial, fan-made game inspired by Adventure Time. Progress saves in this browser.</p>
    </section>`;

  const TABS = [
    { id: 'missions', label: 'Missions', icon: 'train' }, { id: 'gear', label: 'Gear', icon: 'sword' }, { id: 'treasure', label: 'Treasure', icon: 'chest' },
    { id: 'skills', label: 'Skills', icon: 'star' }, { id: 'shop', label: 'Choose Goose', icon: 'goose' }, { id: 'bmo', label: 'BMO', icon: 'bmo' }, { id: 'journal', label: 'Journal', icon: 'book' },
  ];

  UI.renderHub = (G) => {
    const S = M.stats.compute(G);
    const need = M.xpToNext(G.level);
    const t = UI.st.tab;
    const badges = { skills: G.sp, treasure: G.overflow.length };
    const princesses = D.PRINCESSES.map((p) => `<span class="pr ${G.princesses[p.id] ? 'saved' : ''}" title="${esc(p.name)}${G.princesses[p.id] ? ' — rescued! ' + esc(p.perk) : ' — still missing'}" style="--pc:${p.color}">${icon('princess')}</span>`).join('');
    const body = { missions: UI.tabMissions, gear: UI.tabGear, treasure: UI.tabTreasure, skills: UI.tabSkills, shop: UI.tabShop, bmo: UI.tabBmo, journal: UI.tabJournal }[t] || UI.tabMissions;
    return `<div class="hub">
      <aside class="fortside">
        <div class="logo small"><span class="l1">Algebraic</span><span class="l2">Express</span></div>
        <div class="lvl"><div class="spread"><b>Level ${G.level}</b><span class="num small">${G.level >= M.MAX_LEVEL ? 'MAX' : U.fmt(G.xp) + ' / ' + U.fmt(need) + ' XP'}</span></div>${UI.meter(G.xp, need, 'xp')}</div>
        ${UI.coins(G)}
        <div class="princesses" aria-label="Princesses rescued">${princesses}<span class="small">${Object.keys(G.princesses).length}/6 rescued</span></div>
        <div class="duo"><div class="duocard">${AE.ui.hud.face('finn')}<span>Finn<br><b class="num">${S.finn.maxHp} HP</b></span></div><div class="duocard">${AE.ui.hud.face('jake')}<span>Jake<br><b class="num">${S.jake.maxHp} HP</b></span></div></div>
      </aside>
      <section class="panel main">
        <nav class="tabs" role="tablist">${TABS.map((x) => `<button type="button" class="tab" role="tab" aria-selected="${x.id === t}" data-act="tab" data-tab="${x.id}">${icon(x.icon)}<span>${x.label}</span>${badges[x.id] ? `<b class="badge">${badges[x.id]}</b>` : ''}</button>`).join('')}</nav>
        <div class="tabbody">${body(G, S)}</div>
      </section>
    </div>`;
  };

  /* ---------- missions ---------- */
  UI.tabMissions = (G, S) => {
    const out = [];
    const r = G.lastResult;
    if (r) out.push(`<div class="lasttrip ${r.outcome}"><div><span class="eyebrow">Last trip</span><b>${r.outcome === 'escaped' ? 'Made it out' : r.frozen ? 'Frozen in the blizzard' : 'Wiped out'} — ${esc(r.routeName)}</b><span class="small muted">+${U.fmt(r.xp)} XP${r.outcome === 'escaped' ? ` · +${U.fmt(r.gold)} gold · ${r.items.length} item${r.items.length === 1 ? '' : 's'}` : ` · ${r.lost.length} item${r.lost.length === 1 ? '' : 's'} lost`}</span></div><button type="button" class="btn small" data-act="show-result">Trip report</button></div>`);
    if (M.hub.needsHandout(G)) out.push(`<div class="callout"><p>No weapons and barely any gold? Choose Goose feels bad for you.</p><button type="button" class="btn primary small" data-act="handout">Take the free starter gear</button></div>`);
    const warn = [];
    if (!G.equip.finnWeapon) warn.push('Finn has no sword — he’ll fight with his fists.');
    if (!G.equip.jakeWeapon) warn.push('Jake has nothing on his fists.');
    if (G.sp) warn.push(`${G.sp} skill point${G.sp === 1 ? '' : 's'} to spend in the Skills tab.`);
    if (!G.belt.some(Boolean)) warn.push('Your snack belt is empty — Bacon Pancakes save lives.');
    if (G.overflow.length) warn.push('Some treasure didn’t fit in your pile. Check the Treasure tab.');
    const top = M.maxTier(G);
    const next = D.ROUTES.find((x) => x.tier === top + 1 && !x.final);
    out.push(`<div class="spread"><h2>Missions</h2><button type="button" class="btn small" data-act="reroll-board" ${G.gold < 20 ? 'disabled' : ''}>${icon('refresh')} New schedule <span class="cost">20g</span></button></div>`);
    if (warn.length) out.push(`<ul class="warns">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`);
    out.push('<div class="missions">' + G.board.map((o) => {
      const route = D.ROUTES.find((x) => x.id === o.route);
      const mod = D.MODS[o.mod];
      const under = G.level < route.rec - 1;
      const pr = D.PRINCESSES.find((p) => p.route === route.id);
      return `<article class="mission ${route.final ? 'final' : ''}" style="--sky:${route.sky[0]};--hill:${route.hills[0]}">
        <div class="mtop"><span class="tierchip">Tier ${route.tier}</span>${o.princess ? `<span class="chip pink">${icon('princess')} ${esc(pr.name)} sighted!</span>` : ''}${o.vault ? `<span class="chip gold">${icon('lock')} Vault car</span>` : ''}${route.final ? `<span class="chip ice">${icon('crown')} Boss: The Ice King</span>` : ''}</div>
        <h3>${esc(route.name)}</h3>
        <p class="blurb">${esc(route.blurb)}</p>
        <p class="small"><b>${o.cars} cars</b> · ${esc(mod.name)}${o.mod !== 'none' ? ` — ${esc(mod.desc)}` : ''}</p>
        <div class="spread"><span class="small ${under ? 'bad' : 'muted'}">Recommended level ${route.rec}${under ? ' — risky!' : ''}</span><button type="button" class="btn ${route.final ? 'danger' : 'primary'}" data-act="board" data-id="${esc(o.id)}">${icon('train')} ${route.final ? 'Face the Ice King' : 'Hop on'}</button></div>
      </article>`;
    }).join('') + '</div>');
    out.push(`<p class="small muted">${next ? `Escape a tier ${top} train ${G.level + 2 < next.rec ? `and reach level ${next.rec - 2} ` : ''}to open the ${esc(next.name)}.` : ''} ${M.allPrincesses(G) ? (G.level < 20 ? 'Every princess is safe — reach level 20 to take on the Ice King.' : '') : `Rescue all six princesses to unlock the Ice King’s train.`}</p>`);
    return out.join('');
  };

  /* ---------- gear ---------- */
  function statRows(S) {
    const rows = [['Max HP', S.maxHp], ['Damage', S.power.toFixed(1)], ['Crit', Math.round(S.crit * 100) + '%'], ['Crit damage', Math.round(S.critDmg * 100) + '%'], ['Attack speed', S.attackRate.toFixed(2) + '×'], ['Armor', Math.round(S.armor)], ['Move speed', S.moveSpeed.toFixed(1)], ['Dodge', Math.round(S.dodge * 100) + '%'], ['Cooldowns', '−' + Math.round(S.cdr * 100) + '%'], ['Lifesteal', Math.round(S.lifesteal * 100) + '%']];
    return `<div class="stats">${rows.map(([k, v]) => `<div><span>${k}</span><b class="num">${esc(v)}</b></div>`).join('')}</div>`;
  }
  UI.barEditor = (G, hero) => {
    const known = M.hub.knownAbilities(G, hero);
    const slots = M.abilitySlots(G);
    const opts = (sel) => '<option value="">— empty —</option>' + known.map((a) => `<option value="${a}" ${a === sel ? 'selected' : ''}>${esc(D.ABILITIES[a].name)}</option>`).join('');
    let h = `<div class="bar-edit">`;
    for (let i = 0; i < slots; i++) h += `<label><span class="eyebrow">Key ${i + 1}</span><select id="bar-${hero}-${i}" data-change="bar" data-hero="${hero}" data-slot="${i}" ${known.length ? '' : 'disabled'}>${opts(G.bars[hero][i])}</select></label>`;
    return h + '</div>' + (known.length ? '' : `<p class="small muted">Learn ${hero === 'finn' ? 'Hero or Adventurer' : 'Stretchy or Shapeshifter'} abilities in Skills.</p>`);
  };
  UI.tabGear = (G, S) => {
    const slot = (id, empty) => G.equip[id] ? UI.itemCard(G.equip[id], { from: 'equip', slot: id }) : UI.itemCard(null, { empty });
    const pouch = [];
    for (let i = 0; i < S.team.tummy; i++) pouch.push(G.tummy[i] ? UI.itemCard(G.tummy[i], { from: 'tummy' }) : UI.itemCard(null, { empty: 'Tummy slot' }));
    const quick = G.stash.filter((i) => i.kind !== 'valuable');
    return `<div class="gearcols">
      <section class="herocol finn"><h3>${AE.ui.hud.face('finn')} Finn</h3>${slot('finnWeapon', 'No sword')}${slot('finnGear', 'No gear')}${statRows(S.finn)}<h4>Abilities</h4>${UI.barEditor(G, 'finn')}</section>
      <section class="herocol jake"><h3>${AE.ui.hud.face('jake')} Jake</h3>${slot('jakeWeapon', 'Bare paws')}${slot('jakeGear', 'No gear')}${statRows(S.jake)}<h4>Abilities</h4>${UI.barEditor(G, 'jake')}</section>
    </div>
    <div class="gearcols">
      <section><h3>${icon('star')} Trinkets <small>both heroes</small></h3><div class="items">${slot('trinket1', 'Trinket slot')}${slot('trinket2', 'Trinket slot')}</div></section>
      <section><h3>${icon('pancake')} Snack belt <small>keys 4–6</small></h3><div class="items">${G.belt.map((b, i) => (b ? UI.itemCard(b, { from: 'belt', slot: i }) : UI.itemCard(null, { empty: 'Snack slot' }))).join('')}</div></section>
    </div>
    <section><h3>${icon('tummy')} Jake’s Tummy <small>whatever’s in here survives a wipe</small></h3><div class="items">${pouch.join('') || '<p class="muted small">No tummy slots.</p>'}</div></section>
    <section><h3>${icon('chest')} From the treasure pile</h3><div class="items">${quick.map((i) => UI.itemCard(i, { from: 'stash' })).join('') || '<p class="muted small">Nothing to equip yet.</p>'}</div></section>`;
  };
})();

/* ---------- treasure, shop, BMO, journal, modals ---------- */
(function () {
  'use strict';
  const D = AE.data;
  const U = AE.U;
  const M = AE.meta;
  const icon = AE.icon;
  const esc = U.esc;
  const UI = AE.ui;

  const FILTERS = [['all', 'All'], ['finn', 'Finn'], ['jake', 'Jake'], ['trinket', 'Trinkets'], ['consumable', 'Snacks'], ['valuable', 'Treasure'], ['legend', 'Legendary+']];
  UI.tabTreasure = (G, S) => {
    const f = UI.st.filter;
    const match = (i) => f === 'all' || (f === 'finn' ? M.loot.heroFor(i) === 'finn' : f === 'jake' ? M.loot.heroFor(i) === 'jake' : f === 'legend' ? i.rarity >= 4 : i.kind === f);
    const list = G.stash.filter(match).sort((a, b) => b.rarity - a.rarity || (a.kind > b.kind ? 1 : -1));
    const val = U.sum(G.stash.filter((i) => i.kind === 'valuable'), (i) => M.loot.sellPrice(i, S.team));
    const upc = M.hub.upgradeStashCost(G);
    const over = G.overflow.length ? `<section class="overflow"><h3 class="bad">No room in the pile!</h3><p class="small">Sell, salvage, equip or toss these.</p><div class="items">${G.overflow.map((i) => UI.itemCard(i, { from: 'overflow' })).join('')}</div></section>` : '';
    return `${over}<div class="spread"><h2>Treasure Pile <span class="num small ${G.stash.length >= G.stashCap ? 'bad' : 'muted'}">${G.stash.length}/${G.stashCap}</span></h2>
      <div class="row"><button type="button" class="btn small" data-act="sell-valuables" ${val ? '' : 'disabled'}>${icon('coin')} Sell all treasure <span class="cost">+${U.fmt(val)}g</span></button>${upc != null ? `<button type="button" class="btn small" data-act="stash-upgrade" ${G.gold < upc ? 'disabled' : ''}>${icon('plus')} +10 space <span class="cost">${U.fmt(upc)}g</span></button>` : ''}</div></div>
      <div class="row filters">${FILTERS.map(([id, l]) => `<button type="button" class="chipbtn ${f === id ? 'on' : ''}" data-act="filter" data-filter="${id}" aria-pressed="${f === id}">${l}</button>`).join('')}</div>
      <div class="items">${list.map((i) => UI.itemCard(i, { from: 'stash' })).join('') || '<p class="muted">Nothing here yet. Go get some loot!</p>'}</div>`;
  };

  UI.tabShop = (G, S) => {
    const rc = M.hub.respecCost(G);
    const spent = Object.values(G.skills).reduce((a, b) => a + b, 0);
    const upc = M.hub.upgradeStashCost(G);
    return `<div class="shophead">${icon('goose')}<div><h2>Choose Goose’s Shop</h2><p class="muted">“Choose goose, choose! Everything’s for sale — except the goose.” Stock changes after every trip.</p></div></div>
      <div class="items">${G.market.stock.map((i) => UI.itemCard(i, { from: 'market', price: M.loot.buyPrice(i, S.team) })).join('') || '<p class="muted">Sold out!</p>'}</div>
      <section class="services"><h3>Services</h3>
        <div class="spread"><span>Restock the shelves</span><button type="button" class="btn small" data-act="refresh-market" ${G.gold < 30 ? 'disabled' : ''}>Restock <span class="cost">30g</span></button></div>
        <div class="spread"><span>Forget every skill, get the points back</span><button type="button" class="btn small" data-act="respec" ${G.gold < rc || !spent ? 'disabled' : ''}>Respec <span class="cost">${U.fmt(rc)}g</span></button></div>
        ${upc != null ? `<div class="spread"><span>Make the treasure pile bigger</span><button type="button" class="btn small" data-act="stash-upgrade" ${G.gold < upc ? 'disabled' : ''}>+10 space <span class="cost">${U.fmt(upc)}g</span></button></div>` : ''}
        <div class="spread"><span>Sell every treasure in the pile</span><button type="button" class="btn small" data-act="sell-valuables">Sell treasure</button></div>
      </section>`;
  };

  UI.tabBmo = (G, S) => {
    const gear = [];
    for (const s of D.SLOTS) if (G.equip[s.id]) gear.push({ it: G.equip[s.id], eq: true });
    for (const it of G.stash) if (D.GEAR_KINDS.includes(it.kind)) gear.push({ it, eq: false });
    const sel = gear.find((g) => g.it.uid === UI.st.work) || gear[0];
    let detail = '<p class="muted">No gear to tinker with.</p>';
    if (sel) {
      const it = sel.it;
      const uc = M.hub.upgradeCost(it), rc = M.hub.rerollCost(it), sy = M.loot.salvageYield(it);
      const can = (c) => c && G.dust >= c.dust && G.shards >= c.shards;
      detail = `${UI.itemDetail(G, it)}<div class="svc">
        <div class="spread"><span>${uc ? `Upgrade to +${it.upg + 1}` : 'Fully upgraded!'}</span><button type="button" class="btn small primary" data-act="upgrade" data-uid="${esc(it.uid)}" ${can(uc) ? '' : 'disabled'}>${icon('bmo')} Upgrade ${uc ? `<span class="cost">${uc.dust} dust${uc.shards ? ' · ' + uc.shards + ' shards' : ''}</span>` : ''}</button></div>
        ${rc ? `<div class="spread"><span>Reroll its random bonuses</span><button type="button" class="btn small" data-act="reroll" data-uid="${esc(it.uid)}" ${can(rc) ? '' : 'disabled'}>${icon('refresh')} Reroll <span class="cost">${rc.dust} dust · ${rc.shards} shard${rc.shards === 1 ? '' : 's'}</span></button></div>` : ''}
        ${sel.eq ? '<p class="small muted">Unequip it to salvage it.</p>' : `<div class="spread"><span>Break it into parts</span><button type="button" class="btn small danger" data-act="salvage" data-uid="${esc(it.uid)}">Salvage <span class="cost">+${sy.dust} dust${sy.shards ? ' +' + sy.shards + ' shards' : ''}</span></button></div>`}
      </div>`;
    }
    return `<div class="shophead">${icon('bmo')}<div><h2>BMO’s Workshop</h2><p class="muted">“I can make it better! I am very good at computers.” Salvage gear into Magic Dust; Mathematical and better gear also gives Crystal Shards.</p></div></div>
      <div class="bmocols"><div class="items tight">${gear.map((g) => UI.itemCard(g.it, { act: 'work-select', selected: sel && g.it.uid === sel.it.uid })).join('')}</div><div class="card">${detail}</div></div>`;
  };

  UI.tabJournal = (G) => {
    const st = G.stats;
    const kv = [['Trips', st.trips], ['Escapes', st.escapes], ['Wipes', st.wipes], ['Baddies beaten', st.kills], ['Elites beaten', st.elites], ['Chests opened', st.chests], ['Supers', st.supers], ['Best haul', U.fmt(st.bestHaul) + 'g'],
      ['Legendaries found', Object.keys(G.codex.relics).filter((k) => D.RELICS[k]).length + ' / ' + Object.keys(D.RELICS).length], ['Journey', G.journey + 1]];
    const pr = D.PRINCESSES.map((p) => `<li class="${G.princesses[p.id] ? '' : 'muted'}"><span class="pdot" style="--pc:${p.color}"></span><b>${esc(p.name)}</b> — ${G.princesses[p.id] ? esc(p.perk) : 'missing on the ' + esc(D.ROUTES.find((r) => r.id === p.route).name)}</li>`).join('');
    const codex = Object.keys(D.RELICS).map((id) => { const r = D.RELICS[id]; return G.codex.relics[id] ? `<div class="cx"><b class="rtext r${r.rarity}">${esc(r.name)}</b><span class="small muted">${esc(r.desc)}</span></div>` : `<div class="cx unknown">??? <span class="rtext r${r.rarity}">${r.rarity === 5 ? 'Glob-Tier' : 'Legendary'}</span> · tier ${r.minTier}+</div>`; }).join('');
    const perks = (G.perks || []).map((k) => `<li><b>${esc(D.JOURNEY_PERKS[k].name)}</b> — ${esc(D.JOURNEY_PERKS[k].desc)}</li>`).join('');
    const s = AE.sfx.settings;
    return `<h2>Journal</h2><div class="kv">${kv.map(([k, v]) => `<div><b class="num">${esc(v)}</b><span>${k}</span></div>`).join('')}</div>
      <section><h3>${icon('princess')} Princesses</h3><ul class="plist">${pr}</ul></section>
      ${perks ? `<section><h3>${icon('heart')} Carried from past journeys</h3><ul class="lines">${perks}</ul></section>` : ''}
      <section><h3>${icon('book')} Legendary codex</h3><div class="codex">${codex}</div></section>
      <section class="settings"><h3>Settings & save</h3>
        <label class="spread"><span>Sound volume</span><input type="range" id="vol" min="0" max="1" step="0.05" value="${s.volume}" data-change="volume"></label>
        <div class="row"><button type="button" class="btn small" data-act="toggle-mute">${icon(s.muted ? 'mute' : 'volume')} Sound ${s.muted ? 'off' : 'on'}</button><button type="button" class="btn small" data-act="toggle-shake">Screen shake: ${s.shake !== false ? 'on' : 'off'}</button></div>
        <div class="row"><button type="button" class="btn small" data-act="export-save">${icon('save')} Get save code</button><button type="button" class="btn small" data-act="import-prompt">Load save code</button><button type="button" class="btn small danger" data-act="new-game-prompt">Start over</button></div>
      </section>`;
  };

  /* ---------- inspect ---------- */
  UI.inspect = (G, uid, from) => {
    let it = null;
    if (from === 'market') it = G.market.stock.find((i) => i.uid === uid);
    else { const f = M.hub.findAnywhere(G, uid); it = f && f.item; }
    if (!it) return null;
    const S = M.stats.compute(G);
    const u = esc(it.uid);
    const btn = (act, label, extra, cls) => `<button type="button" class="btn small ${cls || ''}" data-act="${act}" data-uid="${u}" ${extra || ''}>${label}</button>`;
    const gear = D.GEAR_KINDS.includes(it.kind);
    const a = [];
    let compare = null;
    if (gear && from !== 'equip') { const slot = { sword: 'finnWeapon', finnGear: 'finnGear', knuckles: 'jakeWeapon', jakeGear: 'jakeGear', trinket: 'trinket1' }[it.kind]; compare = G.equip[slot] || (it.kind === 'trinket' ? G.equip.trinket2 : null); }
    if (from === 'stash' || from === 'overflow') {
      if (it.kind === 'trinket') a.push(btn('equip', 'Equip in slot 1', 'data-slot="trinket1"', 'primary'), btn('equip', 'Equip in slot 2', 'data-slot="trinket2"'));
      else if (gear) a.push(btn('equip', `Give to ${UI.forWho(it)}`, '', 'primary'));
      if (it.kind === 'consumable') a.push(btn('belt-add', 'Put on snack belt', '', 'primary'));
      if (G.tummy.length < S.team.tummy) a.push(btn('tummy-add', `${icon('tummy')} Jake’s Tummy`));
      a.push(btn('sell', `Sell <span class="cost">+${U.fmt(M.loot.sellPrice(it, S.team))}g</span>`));
      if (gear) { const y = M.loot.salvageYield(it); a.push(btn('salvage', `Salvage <span class="cost">+${y.dust} dust</span>`)); }
      a.push(btn('discard', 'Toss it', '', 'danger'));
    } else if (from === 'equip') a.push(`<button type="button" class="btn small" data-act="unequip" data-slot="${esc(UI.st.inspectSlot || '')}">Unequip</button>`, btn('goto-bmo', `${icon('bmo')} Take to BMO`));
    else if (from === 'belt') a.push(`<button type="button" class="btn small" data-act="belt-remove" data-slot="${esc(UI.st.inspectSlot || '')}">Back to the pile</button>`);
    else if (from === 'tummy') a.push(btn('tummy-remove', 'Back to the pile'));
    else if (from === 'market') { const p = M.loot.buyPrice(it, S.team); a.push(btn('buy', `Buy <span class="cost">${U.fmt(p)}g</span>`, G.gold < p ? 'disabled' : '', 'primary')); }
    return `${UI.modalHead('Inspect')}${UI.itemDetail(G, it, { compare })}<div class="actions">${a.join('')}</div>`;
  };

  /* ---------- trip report & ending ---------- */
  UI.resultModal = (G) => {
    const r = G.lastResult;
    if (!r) return '';
    const cards = (list) => `<div class="items tight">${list.map((i) => UI.itemCard(i, { act: 'noop' })).join('')}</div>`;
    const lv = r.levels && r.levels.length ? `<p class="lvup">${icon('star')} Level up! You’re level ${r.levels[r.levels.length - 1].level} — +${U.sum(r.levels, (l) => l.sp)} skill point${U.sum(r.levels, (l) => l.sp) === 1 ? '' : 's'}.</p>` : '';
    if (r.outcome === 'wiped') {
      return `${UI.modalHead(r.frozen ? 'Frozen solid' : 'Wiped out', `${esc(r.routeName)} — ${r.frozen ? 'the blizzard caught you.' : 'Finn and Jake both went down.'}`)}
        <div class="kv"><div><b class="num">+${U.fmt(r.xp)}</b><span>XP kept</span></div><div><b class="num">${r.lost.length}</b><span>Items lost</span></div><div><b class="num">${U.fmt(r.goldLost)}</b><span>Gold dropped</span></div><div><b class="num">${r.kills}</b><span>Baddies beaten</span></div></div>${lv}
        ${r.lost.length ? `<h3>Left on the train</h3>${cards(r.lost)}` : ''}
        ${r.tummy && r.tummy.length ? `<h3 class="good">Safe in Jake’s Tummy</h3>${cards(r.tummy)}` : ''}
        <div class="actions"><button type="button" class="btn primary" data-act="close-modal">Back to the Tree Fort</button></div>`;
    }
    const how = { bailout: 'jumped off through a bail-out door', brake: 'pulled the emergency brake', flare: 'flew off with Lady Rainicorn' }[r.how] || 'got out';
    const pr = r.princess ? D.PRINCESSES.find((p) => p.id === r.princess) : null;
    return `${UI.modalHead('Mathematical! You made it out', `${esc(r.routeName)} — you ${how}.`)}
      ${pr ? `<div class="rescue" style="--pc:${pr.color}">${icon('princess')}<div><b>${esc(pr.name)} is safe!</b><span>${esc(pr.perk)}</span></div></div>` : ''}
      <div class="kv"><div><b class="num">+${U.fmt(r.xp)}</b><span>XP</span></div><div><b class="num">+${U.fmt(r.gold)}</b><span>Gold</span></div><div><b class="num">${U.fmt(r.haul)}</b><span>Haul value</span></div><div><b class="num">${r.kills}</b><span>Baddies beaten</span></div><div><b class="num">${r.chests}</b><span>Chests</span></div></div>${lv}
      ${r.items.length ? `<h3>Brought home</h3>${cards(r.items)}` : '<p class="muted">Empty-handed, but alive!</p>'}
      ${r.overflow ? `<p class="warn">${r.overflow} item${r.overflow === 1 ? '' : 's'} didn’t fit in the treasure pile — check the Treasure tab.</p>` : ''}
      <div class="actions"><button type="button" class="btn primary" data-act="close-modal">Back to the Tree Fort</button></div>`;
  };
  UI.endingModal = (G) => {
    const owned = new Set(G.perks || []);
    const perks = Object.keys(D.JOURNEY_PERKS).filter((k) => !owned.has(k));
    const keeps = [...Object.values(G.equip).filter(Boolean), ...G.stash.filter((i) => D.GEAR_KINDS.includes(i.kind))].sort((a, b) => b.rarity - a.rarity);
    return `${UI.modalHead('The Ice King is beaten!')}
      <p>The train grinds to a halt in the snow. The Ice King sulks on the roof — “I just wanted some friends to ride trains with…” — and six princesses are home safe. Ooo owes you big.</p>
      <p>You can keep riding with everything you’ve got, or start a brand-new journey and carry a permanent bonus with you.</p>
      <h3>New journey bonus</h3>${perks.map((k, i) => `<label class="perk"><input type="radio" name="perk" value="${k}" ${i === 0 ? 'checked' : ''}> <span><b>${esc(D.JOURNEY_PERKS[k].name)}</b> — ${esc(D.JOURNEY_PERKS[k].desc)}</span></label>`).join('') || '<p class="muted">You already have every bonus.</p>'}
      <label class="field"><span class="eyebrow">Bring one keepsake along</span><select id="keepsake"><option value="">Nothing</option>${keeps.map((i) => `<option value="${esc(i.uid)}">${esc(i.name)}</option>`).join('')}</select></label>
      <div class="actions"><button type="button" class="btn primary" data-act="new-journey">Start a new journey</button><button type="button" class="btn" data-act="close-modal">Keep riding</button></div>`;
  };
  UI.newGameModal = (hasSave) => `${UI.modalHead(hasSave ? 'Start over?' : 'Ready for adventure?')}
    ${hasSave ? '<p class="warn">This replaces the save in this browser. Grab a save code from the Journal first if you want to keep it.</p>' : '<p>Finn and Jake are packing snacks. You’ll start with a wooden sword, some boxing mitts, and a stack of Bacon Pancakes.</p>'}
    <div class="actions"><button type="button" class="btn primary" data-act="new-game">Let’s go!</button><button type="button" class="btn" data-act="close-modal">Cancel</button></div>`;
  UI.importModal = () => `${UI.modalHead('Load a save code')}<label class="field"><span class="eyebrow">Paste a code that starts with AE1:</span><textarea id="savecode" spellcheck="false"></textarea></label><div class="actions"><button type="button" class="btn primary" data-act="import-save">Load</button><button type="button" class="btn" data-act="close-modal">Cancel</button></div>`;
  UI.exportModal = (code) => `${UI.modalHead('Your save code', 'Paste it into “Load save code” on any device.')}<label class="field"><span class="eyebrow">Save code</span><textarea id="savecode-out" readonly spellcheck="false">${esc(code)}</textarea></label><div class="actions"><button type="button" class="btn primary" data-act="copy-save">Copy</button><button type="button" class="btn" data-act="close-modal">Done</button></div>`;
})();
