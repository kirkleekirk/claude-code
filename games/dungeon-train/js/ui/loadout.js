/* The Loadout screen (inspired by ARC Raiders' inventory): equipment on the left, the hero and their
   stats in the middle, the shared stash (and the ability list) on the right. Drag and drop, right-click
   menus, double-click to equip. Also draws the backpack screen you open with Tab during a trip. */
(function () {
  'use strict';
  const D = DT.data;
  const U = DT.U;
  const M = DT.meta;
  const UI = DT.ui;
  const esc = U.esc;
  const icon = DT.icon;
  const LO = {};
  const st = { filter: 'all', sort: 'rarity', sel: null, rtab: 'stash', stab: 'fight', drag: null, search: '' };
  LO.state = st;

  const KIND_ORDER = ['sword', 'instrument', 'helmet', 'armor', 'gauntlets', 'boots', 'collar', 'pack', 'relic', 'consumable', 'valuable', 'trophy'];
  const FILTERS = [
    ['all', 'All', 'grid'], ['mine', 'Usable', 'user'], ['finn', 'Finn gear', 'sword'], ['jake', 'Jake gear', 'music'],
    ['relic', 'Relics', 'relic'], ['snack', 'Snacks', 'pancake'], ['treasure', 'Treasure', 'gem'], ['new', 'New', 'sparkle'],
  ];
  const SORTS = [['rarity', 'Rarity'], ['new', 'Newest'], ['type', 'Type'], ['tier', 'Tier'], ['value', 'Value']];

  function passes(it, f, hero) {
    const k = D.KINDS[it.kind];
    switch (f) {
      case 'mine': return M.hub.usableBy(it, hero) || it.kind === 'consumable';
      case 'finn': return k && k.hero === 'finn';
      case 'jake': return k && k.hero === 'jake';
      case 'relic': return it.kind === 'relic';
      case 'snack': return it.kind === 'consumable';
      case 'treasure': return it.kind === 'valuable' || it.kind === 'trophy';
      case 'new': return !!it.isNew;
      default: return true;
    }
  }
  function sorted(list, how) {
    const idx = new Map(list.map((it, i) => [it, i]));
    const kind = (it) => KIND_ORDER.indexOf(it.kind);
    const cmp = {
      rarity: (a, b) => b.rarity - a.rarity || kind(a) - kind(b) || b.ilvl - a.ilvl,
      new: (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || idx.get(b) - idx.get(a),
      type: (a, b) => kind(a) - kind(b) || b.rarity - a.rarity,
      tier: (a, b) => (b.ilvl || 0) - (a.ilvl || 0) || b.rarity - a.rarity,
      value: (a, b) => M.loot.value(b) - M.loot.value(a),
    }[how] || (() => 0);
    return list.slice().sort(cmp);
  }

  /* ---------- left: equipment ---------- */
  function slotTile(G, h, s) {
    const C = G.chars[h];
    const lock = M.slotLock(G, h, s);
    const it = C.equip[s.id];
    if (lock) return UI.emptyTile({ slot: s.id, locked: s.level ? `Lv ${s.level}` : 'Skill', tip: 'slotlock', cls: 'slot' });
    if (it) return `<div class="slotwrap" data-drop="equip" data-slot="${s.id}">${UI.tile(it, { src: 'equip', slot: s.id, sel: st.sel === it.uid })}<small class="s-lbl">${esc(s.label)}</small></div>`;
    return `<div class="slotwrap" data-drop="equip" data-slot="${s.id}">${UI.emptyTile({ slot: s.id, drop: 'equip', ghost: UI.art.slotArt(s.kind), tip: 'slot', cls: 'slot' })}<small class="s-lbl">${esc(s.label)}</small></div>`;
  }
  function weaponBlock(G, h, S) {
    const H = D.HEROES[h];
    const s = H.slots[0];
    const it = G.chars[h].equip[s.id];
    const off = M.stats.offense(S);
    const w = S.weapon;
    const form = w.kind === 'sword' ? D.SWORD_TYPES[w.type] : D.PUNCH_FORMS[w.form];
    const tile = it ? UI.tile(it, { src: 'equip', slot: s.id, sel: st.sel === it.uid }) : UI.emptyTile({ slot: s.id, drop: 'equip', ghost: UI.art.slotArt(s.kind), tip: 'slot', cls: 'slot' });
    const name = it ? `<b class="rc r${it.rarity}">${esc(it.name)}</b>` : `<b class="muted">${h === 'finn' ? 'No sword — bare fists!' : 'No instrument — plain paws'}</b>`;
    return `<div class="eq-weapon" data-drop="equip" data-slot="${s.id}">${tile}<div class="w-info"><small class="s-lbl">${esc(s.label)}</small>${name}<span>${esc(form.name)} · ${U.fmt1(off.hit)} per hit · ${U.fmt(off.dps)} DPS</span></div></div>`;
  }
  function abilityBar(G, h, S) {
    const C = G.chars[h];
    const H = D.HEROES[h];
    let out = '';
    for (let i = 0; i < 4; i++) {
      const id = C.bars[i];
      const locked = i >= S.abilitySlots;
      const key = esc(DT.game.input.label('ab' + i));
      if (locked) { out += `<div class="abslot locked" data-tip="ablock" data-idx="${i}"><span class="k">${key}</span>${icon('lock')}<small>Lv ${H.abilityLevels[i]}</small></div>`; continue; }
      if (id) {
        const known = S.abilities.find((a) => a.id === id);
        out += `<div class="abslot${known && known.src === 'item' ? ' from-item r' + known.rarity : ''}" draggable="true" data-act="ab-slot" data-idx="${i}" data-ab="${id}" data-tip="ab" data-drop="bar"><span class="k">${key}</span><span class="ab-ico">${icon(D.ABILITIES[id].icon)}</span><small>${esc(D.ABILITIES[id].name)}</small></div>`;
      } else out += `<div class="abslot empty" data-act="ab-slot" data-idx="${i}" data-drop="bar" data-tip="abempty"><span class="k">${key}</span>${icon('plus')}<small>Empty</small></div>`;
    }
    const sup = D.SUPERS[h];
    out += `<div class="abslot super" data-tip="super"><span class="k">${esc(DT.game.input.label('super'))}</span><span class="ab-ico">${icon(sup.icon)}</span><small>${esc(sup.name)}</small></div>`;
    return out;
  }
  function beltRow(G, h, S) {
    const C = G.chars[h];
    let out = '';
    for (let i = 0; i < 5; i++) {
      const key = esc(DT.game.input.label('belt' + i));
      const it = C.belt[i];
      if (i >= S.belt) { out += `<div class="beltwrap">${UI.emptyTile({ idx: i, locked: 'Locked', tip: 'beltlock', cls: 'small' })}<kbd>${key}</kbd></div>`; continue; }
      out += `<div class="beltwrap" data-drop="belt" data-idx="${i}">${it ? UI.tile(it, { src: 'belt', idx: i, sel: st.sel === it.uid, cls: 'small' }) : UI.emptyTile({ idx: i, drop: 'belt', cls: 'small', tip: 'belt' })}<kbd>${key}</kbd></div>`;
    }
    return out;
  }
  function safeRow(G, h, S) {
    const C = G.chars[h];
    let out = '';
    for (let i = 0; i < Math.max(S.safe, 1); i++) {
      const it = C.safe[i];
      if (i >= S.safe) { out += UI.emptyTile({ locked: 'None', cls: 'small', tip: 'safe' }); continue; }
      out += `<div class="beltwrap" data-drop="safe">${it ? UI.tile(it, { src: 'safe', idx: i, sel: st.sel === it.uid, cls: 'small' }) : UI.emptyTile({ drop: 'safe', cls: 'small', tip: 'safe', ghost: icon(D.HEROES[h].safeIcon) })}</div>`;
    }
    return out;
  }
  function equipPanel(G, h, S) {
    const H = D.HEROES[h];
    const armorSlots = H.slots.filter((s) => s.kind !== 'relic' && s !== H.slots[0]);
    const relics = H.slots.filter((s) => s.kind === 'relic');
    let x = `<header class="p-head"><h3>${icon('user')} Equipment</h3><span class="p-sub">${esc(H.name)} takes this on the train</span></header>`;
    x += weaponBlock(G, h, S);
    x += `<div class="eq-label">${h === 'finn' ? 'Armor &amp; pack' : 'Collar'}</div><div class="eq-grid ${h}">${armorSlots.map((s) => slotTile(G, h, s)).join('')}</div>`;
    if (h === 'jake') x += `<p class="eq-note">${icon('info')} Jake can’t wear armor — he grows strong through his skill tree.</p>`;
    if (S.sets.length) x += `<div class="sets">${S.sets.map((s) => `<span class="setchip" style="--c:${s.color}" data-tip="set" data-set="${s.id}">${esc(s.name)} ${s.count}/4 ${s.bonuses.filter((b) => b.active).length ? icon('check') : ''}</span>`).join('')}</div>`;
    x += `<div class="eq-label">Relics <small>${relics.filter((s) => !M.slotLock(G, h, s)).length}/${relics.length} open</small></div><div class="eq-row">${relics.map((s) => slotTile(G, h, s)).join('')}</div>`;
    x += `<div class="eq-label">Abilities <small>bind skills &amp; item abilities</small></div><div class="eq-row abil">${abilityBar(G, h, S)}</div>`;
    x += `<div class="eq-label">Quick use · snack belt <small>${S.belt}/5 slots</small></div><div class="eq-row">${beltRow(G, h, S)}</div>`;
    x += `<div class="eq-label safe-l">${icon(H.safeIcon)} ${esc(H.safeName)} · safe pocket <small>kept even if you’re knocked out</small></div><div class="eq-row">${safeRow(G, h, S)}</div>`;
    x += `<div class="eq-label">Backpack <small>${S.backpack} slots — fills up with loot during a trip</small></div><div class="bp-preview">${'<i></i>'.repeat(S.backpack)}</div>`;
    return x;
  }

  /* ---------- middle: stats ---------- */
  const TIPS = {
    hit: 'Damage of one normal hit, before crits.',
    dps: 'Roughly how much damage you deal to ONE target each second if you attack nonstop. Area attacks, instrument effects and abilities can hit many more.',
    speed: 'How many attacks you make per second.',
    reach: 'How far your attack reaches.',
    crit: 'Chance for a hit to be critical.',
    critDmg: 'How hard critical hits hit.',
    ap: 'Makes abilities (keys 1–4) hit harder.',
    cdr: 'How much faster abilities recharge.',
    hp: 'How much damage you can take before you’re knocked out.',
    armor: 'Blocks part of every hit. 60 armor blocks half.',
    dodge: 'Chance to completely avoid a hit.',
    move: 'How fast you run.',
    roll: 'Your dodge roll: you can’t be hurt while rolling.',
    regen: 'Health you get back every second when you haven’t been hit for 3 seconds.',
    backpack: 'How many items you can carry off the train.',
    belt: 'Snacks you can use during a trip (Z, X, C, V, B).',
    safe: 'Items here come home even if you get knocked out.',
    luck: 'Better and rarer loot.',
    gold: 'More gold from monsters and chests.',
    xp: 'Level up faster.',
    loop: 'More time before the Loop Tunnel.',
    hands: 'Open chests and doors faster.',
    meter: 'Your MATHEMATICAL! super fills faster.',
    thorns: 'Monsters that hit you take part of that damage back.',
    healPower: 'Snacks heal you more.',
    burnChance: 'Chance for each hit to set the enemy on fire (damage over time).',
    chillChance: 'Chance for each hit to slow the enemy. Chill a Chilled enemy to Freeze it.',
    shockChance: 'Chance for each hit to zap nearby enemies with lightning.',
    bleedChance: 'Chance for each hit to make the enemy bleed (stacks up to 3).',
    stunChance: 'Chance for each hit to Stun the enemy for a moment.',
    freezeChance: 'Chance for each hit to Freeze the enemy solid.',
    lifesteal: 'You heal for part of the damage your attacks deal.',
  };
  LO.TIPS = TIPS;
  function statRows(S, P, tab) {
    const off = M.stats.offense(S), poff = P ? M.stats.offense(P) : null;
    const row = (label, v, pv, fmt, tipKey, better) => {
      let delta = '';
      if (P != null && pv != null) {
        const d = pv - v;
        const tiny = Math.abs(d) < Math.max(1e-6, Math.abs(v) * 0.002);
        if (!tiny) { const good = better === 'low' ? d < 0 : d > 0; delta = `<span class="dlt ${good ? 'up' : 'down'}">${good ? '▲' : '▼'} ${fmt(pv)}</span>`; }
      }
      return `<div class="srow" data-tip="stat" data-stat="${tipKey}"><span>${esc(label)}</span><b>${fmt(v)}</b>${delta}</div>`;
    };
    const pc = (v) => U.pct(v), sp = (v) => U.spct(v);
    const on = (k) => (S[k] || (P && P[k]));
    let r = '';
    if (tab === 'fight') {
      r += row('Hit damage', off.hit, poff && poff.hit, U.fmt1, 'hit');
      r += row('Damage per second', off.dps, poff && poff.dps, U.fmt, 'dps');
      r += row('Attacks per second', off.perSec, poff && poff.perSec, (v) => v.toFixed(2), 'speed');
      r += row('Reach', off.reach, poff && poff.reach, (v) => v.toFixed(1) + ' m', 'reach');
      r += row('Crit chance', S.crit, P && P.crit, pc, 'crit');
      r += row('Crit damage', S.critDmg, P && P.critDmg, pc, 'critDmg');
      r += row('Ability damage', S.abilityPower, P && P.abilityPower, sp, 'ap');
      r += row('Ability recharge', S.cdr, P && P.cdr, (v) => (v >= 0 ? U.pct(v) + ' faster' : U.pct(-v) + ' slower'), 'cdr');
      for (const [k, label] of [['burnChance', 'Burn on hit'], ['chillChance', 'Chill on hit'], ['shockChance', 'Shock on hit'], ['bleedChance', 'Bleed on hit'], ['stunChance', 'Stun on hit'], ['freezeChance', 'Freeze on hit'], ['lifesteal', 'Lifesteal']]) if (on(k)) r += row(label, S[k], P && P[k], pc, k);
    } else if (tab === 'survive') {
      r += row('Health', S.maxHp, P && P.maxHp, U.fmt, 'hp');
      r += row('Armor', S.armor, P && P.armor, (v) => `${U.fmt(v)} (−${U.pct(M.stats.armorReduction(v))})`, 'armor');
      r += row('Dodge chance', S.dodge, P && P.dodge, pc, 'dodge');
      r += row('Move speed', S.moveSpeed, P && P.moveSpeed, (v) => v.toFixed(1) + ' m/s', 'move');
      r += row(D.HEROES[S.id].dashName, S.dashCdFinal, P && P.dashCdFinal, (v) => `${S.dashCharges}× · ${v.toFixed(1)}s`, 'roll', 'low');
      if (on('regen')) r += row('Regeneration', S.regen, P && P.regen, (v) => (v * 100).toFixed(1) + '%/s', 'regen');
      if (on('thorns')) r += row('Thorns', S.thorns, P && P.thorns, pc, 'thorns');
      if (on('healPower')) r += row('Snack healing', S.healPower, P && P.healPower, sp, 'healPower');
    } else if (tab === 'loot') {
      r += row('Backpack', S.backpack, P && P.backpack, (v) => v + ' slots', 'backpack');
      r += row('Snack belt', S.belt, P && P.belt, (v) => v + ' slots', 'belt');
      r += row(D.HEROES[S.id].safeName, S.safe, P && P.safe, (v) => v + ' slots', 'safe');
      r += row('Luck', S.luck, P && P.luck, sp, 'luck');
      r += row('Gold found', S.goldFind, P && P.goldFind, sp, 'gold');
      r += row('Experience', S.xp, P && P.xp, sp, 'xp');
      r += row('Loop slowdown', S.loopSlow, P && P.loopSlow, pc, 'loop');
      r += row('Quick hands', S.interactSpeed, P && P.interactSpeed, sp, 'hands');
      r += row('Super meter', S.meterGain, P && P.meterGain, sp, 'meter');
    }
    return r;
  }
  function powersList(G, h, S) {
    let r = '';
    if (!S.powers.length && !S.sets.length) r += `<p class="empty-note">${icon('sparkle')} No Powers yet. <b>Mathematical</b>, <b>Legendary</b> and <b>Glob-Tier</b> gear comes with Powers that change how you fight.</p>`;
    for (const p of S.powers) r += `<div class="prow r${p.rarity || 3}"><span class="p-ico">${icon(p.icon || 'star')}</span><div><b>${esc(p.name)}</b><small>${esc(p.source || '')}</small><p>${UI.kw(p.text)}</p></div></div>`;
    const T = D.TREES[h];
    const keys = T.list.filter((n) => G.chars[h].tree[n.id] && (n.type === 'keystone' || n.type === 'notable'));
    if (keys.length) r += `<div class="eq-label">From your skill tree</div>` + keys.map((n) => `<div class="prow tree" style="--c:${n.color}"><span class="p-ico">${icon(n.type === 'keystone' ? 'star' : 'plus')}</span><div><b>${esc(n.name)}</b><p>${UI.kw(UI.nodeDesc(n))}</p></div></div>`).join('');
    return r;
  }
  LO.statsBody = function (G, h, P) {
    const S = M.stats.compute(G, h);
    const off = M.stats.offense(S), poff = P ? M.stats.offense(P) : null;
    const big = (label, v, pv, fmt, cls) => {
      let d = '';
      if (P && pv != null && Math.abs(pv - v) > Math.abs(v) * 0.002 + 1e-6) d = `<i class="${pv > v ? 'up' : 'down'}">${pv > v ? '▲' : '▼'}${fmt(Math.abs(pv - v))}</i>`;
      return `<div class="bigstat ${cls}"><small>${label}</small><b>${fmt(v)}</b>${d}</div>`;
    };
    let x = `<div class="bigstats">${big('Health', S.maxHp, P && P.maxHp, U.fmt, 'hp')}${big('Armor', S.armor, P && P.armor, U.fmt, 'ar')}${big('DPS', off.dps, poff && poff.dps, U.fmt, 'dps')}${big('Ability dmg', S.abilityPower * 100, P && P.abilityPower * 100, (v) => Math.round(v) + '%', 'ap')}</div>`;
    x += `<div class="stabs" role="tablist">${[['fight', 'Fight'], ['survive', 'Survive'], ['loot', 'Loot'], ['powers', `Powers <em>${S.powers.length}</em>`]].map(([k, l]) => `<button role="tab" aria-selected="${st.stab === k}" class="${st.stab === k ? 'on' : ''}" data-act="stab" data-tab="${k}">${l}</button>`).join('')}</div>`;
    x += `<div class="srows" data-keep-scroll="stats">${st.stab === 'powers' ? powersList(G, h, S) : statRows(S, P, st.stab)}</div>`;
    return x;
  };
  /* Refresh just the stats (used while hovering items so the numbers show the change). */
  LO.previewStats = function (G, h, it) {
    const box = document.getElementById('lo-stats');
    if (!box) return;
    let P = null;
    if (it && M.hub.usableBy(it, h)) {
      const f = M.hub.find(G, it.uid);
      if (!(f && f.where === 'equip' && f.hero === h)) { const slot = UI.targetSlot(G, h, it); if (slot) P = UI.previewStats(G, h, it, slot); }
    }
    const key = P ? it.uid : '';
    if (box.dataset.preview === key) return;
    box.dataset.preview = key;
    box.innerHTML = LO.statsBody(G, h, P);
    box.classList.toggle('previewing', !!P);
  };

  /* ---------- right: stash & abilities ---------- */
  function stashPanel(G, h) {
    let list = G.stash.filter((it) => passes(it, st.filter, h));
    if (st.search) { const q = st.search.toLowerCase(); list = list.filter((it) => it.name.toLowerCase().includes(q) || (D.KINDS[it.kind] && D.KINDS[it.kind].label.toLowerCase().includes(q))); }
    list = sorted(list, st.sort);
    let x = `<div class="stash-tools"><div class="chips">${FILTERS.map(([k, l, ic]) => `<button class="chip${st.filter === k ? ' on' : ''}" data-act="filter" data-f="${k}">${icon(ic)}${l}${k === 'new' ? ` <em>${G.stash.filter((i) => i.isNew).length}</em>` : ''}</button>`).join('')}</div>`;
    x += `<div class="stash-row2"><label class="search">${icon('search')}<input type="search" id="stash-search" placeholder="Search…" value="${esc(st.search)}" aria-label="Search the stash"></label><label class="sortsel">${icon('filter')}<select data-act="sort" aria-label="Sort">${SORTS.map(([k, l]) => `<option value="${k}"${st.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div></div>`;
    x += `<div class="grid stash-grid" data-drop="stash" data-keep-scroll="stash">`;
    x += list.map((it) => UI.tile(it, { src: 'stash', sel: st.sel === it.uid, dim: D.KINDS[it.kind] && D.KINDS[it.kind].gear && !M.hub.usableBy(it, h), showHero: true })).join('');
    const free = Math.max(0, G.stashCap - G.stash.length);
    if (st.filter === 'all' && !st.search) x += '<div class="tile ghostcell"></div>'.repeat(Math.min(free, 24));
    if (!list.length) x += `<p class="empty-note">${icon('search')} Nothing here${st.filter !== 'all' ? ' with this filter' : ''}.</p>`;
    x += '</div>';
    if (G.overflow.length) x += `<div class="overflow">${icon('info')} <b>${G.overflow.length} item${G.overflow.length > 1 ? 's' : ''} didn’t fit.</b> Sell or salvage something, then click to move them in.<div class="grid">${G.overflow.map((it) => UI.tile(it, { src: 'overflow' })).join('')}</div><button class="btn small" data-act="pull-overflow">${icon('arrowUp')} Move into stash</button></div>`;
    const up = M.hub.upgradeStashCost(G);
    const tv = G.stash.filter((i) => i.kind === 'valuable');
    x += `<footer class="stash-foot"><span>${icon('chest')} ${G.stash.length}/${G.stashCap}</span>${up != null ? `<button class="btn small ghost" data-act="upgrade-stash" title="+10 stash slots">${icon('plus')} Bigger stash · ${icon('coin')}${U.fmt(up)}</button>` : ''}${tv.length ? `<button class="btn small ghost" data-act="sell-treasure">${icon('gem')} Sell ${tv.length} treasure · ${icon('coin')}${U.fmt(U.sum(tv, (i) => M.loot.sellPrice(i, M.stats.compute(G, h))))}</button>` : ''}</footer>`;
    return x;
  }
  function abilityPanel(G, h) {
    const S = M.stats.compute(G, h);
    const C = G.chars[h];
    let x = `<p class="ab-help">${icon('info')} Drag an ability onto a slot (or use the number buttons). Skill-tree abilities stay forever; abilities from gear leave when you take the gear off.</p>`;
    if (!S.abilities.length) x += `<p class="empty-note">${icon('tree')} No abilities yet. Unlock them in the <button class="linkbtn" data-act="tab" data-tab="skills">Skills</button> tab, or find gear that comes with one.</p>`;
    for (const a of S.abilities) {
      const ab = D.ABILITIES[a.id];
      const slot = C.bars.indexOf(a.id);
      x += `<div class="abrow${a.src === 'item' ? ' from-item r' + a.rarity : ''}" draggable="true" data-ab="${a.id}" data-tip="ab" data-src="ablist"><span class="ab-ico">${icon(ab.icon)}</span><div class="ab-txt"><b>${esc(ab.name)}</b><small>${a.src === 'item' ? 'From ' + esc(a.itemName) : 'Skill tree'} · ${UI.abilityCooldown(S, a.id).toFixed(1)}s</small></div><div class="ab-binds">${[0, 1, 2, 3].map((i) => `<button class="kb${slot === i ? ' on' : ''}" data-act="bind" data-ab="${a.id}" data-idx="${i}" ${i >= S.abilitySlots ? 'disabled title="Slot locked"' : ''} aria-label="Bind to ${i + 1}">${i + 1}</button>`).join('')}</div></div>`;
    }
    const T = D.TREES[h];
    const locked = T.list.filter((n) => n.type === 'ability' && !C.tree[n.id]);
    if (locked.length) {
      x += `<div class="eq-label">Still to learn in the skill tree</div>`;
      x += locked.map((n) => `<div class="abrow locked" data-tip="node" data-node="${n.id}"><span class="ab-ico">${icon(D.ABILITIES[n.ability].icon)}</span><div class="ab-txt"><b>${esc(D.ABILITIES[n.ability].name)}</b><small>${esc((T.branches.find((b) => b.id === n.branch) || {}).name || '')} branch</small></div><button class="btn small ghost" data-act="goto-node" data-node="${n.id}">${icon('tree')} Find</button></div>`).join('');
    }
    return x;
  }
  function selectionBar(G, h) {
    if (!st.sel) return '';
    const f = M.hub.find(G, st.sel);
    if (!f) { st.sel = null; return ''; }
    const it = f.item;
    const acts = LO.actionsFor(G, h, it, f);
    return `<div class="selbar r${it.rarity}"><div class="sb-name">${UI.art.art(it)}<div><b>${esc(it.name)}</b><small>${esc(UI.whereText(G, it) || 'In your stash')}</small></div></div><div class="sb-acts">${acts.map((a) => `<button class="btn small ${a.danger ? 'danger' : a.primary ? 'primary' : 'ghost'}" data-act="${a.act}" ${Object.entries(a.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${a.disabled ? 'disabled' : ''} title="${esc(a.note || '')}">${icon(a.icon)}${esc(a.label)}</button>`).join('')}<button class="btn small ghost icon-only" data-act="desel" aria-label="Close">${icon('x')}</button></div></div>`;
  }

  /* Select an item without redrawing the page (so double-click and drag keep working). */
  LO.select = function (G, h, uid) {
    st.sel = uid;
    const root = document.querySelector('.lo');
    if (!root) return false;
    root.querySelectorAll('.tile.sel').forEach((t) => t.classList.remove('sel'));
    if (uid) root.querySelectorAll(`.tile[data-uid="${CSS.escape(uid)}"]`).forEach((t) => { t.classList.add('sel'); const n = t.querySelector('.t-new'); if (n) n.remove(); });
    const panel = root.querySelector('.lo-stash');
    const old = panel.querySelector('.selbar');
    const html = selectionBar(G, h);
    if (old) old.remove();
    if (html) panel.insertAdjacentHTML('beforeend', html);
    return true;
  };

  /* Everything you can do with an item, for buttons and the right-click menu. */
  LO.actionsFor = function (G, h, it, f) {
    f = f || M.hub.find(G, it.uid);
    const out = [];
    const other = h === 'finn' ? 'jake' : 'finn';
    const L = M.loot;
    const S = M.stats.compute(G, h);
    if (L.isGear(it)) {
      if (f.where === 'equip') out.push({ act: 'unequip', label: 'Unequip', icon: 'arrowDown', data: { hero: f.hero, slot: f.slot }, primary: true });
      else {
        const why = M.hub.whyNot(G, h, it);
        out.push({ act: 'equip', label: `Equip on ${UI.heroName(h)}`, icon: 'check', data: { uid: it.uid }, disabled: !!why, note: why || '', primary: !why });
        if (it.kind === 'relic') { const why2 = M.hub.whyNot(G, other, it); out.push({ act: 'equip-other', label: `Give to ${UI.heroName(other)}`, icon: 'swap', data: { uid: it.uid }, disabled: !!why2, note: why2 || '' }); }
      }
    }
    if (it.kind === 'consumable' && f.where !== 'belt') out.push({ act: 'belt', label: 'Put on belt', icon: 'pancake', data: { uid: it.uid }, primary: true });
    if (f.where === 'belt') out.push({ act: 'belt-remove', label: 'Take off belt', icon: 'arrowDown', data: { hero: f.hero, idx: f.index } });
    if (f.where === 'safe') out.push({ act: 'safe-remove', label: 'Take out of pocket', icon: 'arrowDown', data: { hero: f.hero, uid: it.uid } });
    else if (f.where !== 'equip' && it.kind !== 'trophy') out.push({ act: 'safe', label: `Keep in ${D.HEROES[h].safeName}`, icon: D.HEROES[h].safeIcon, data: { uid: it.uid }, disabled: G.chars[h].safe.length >= S.safe, note: G.chars[h].safe.length >= S.safe ? 'Pocket is full' : '' });
    if (f.where !== 'equip' && it.kind !== 'trophy') {
      out.push({ act: 'sell', label: `Sell · ${U.fmt(L.sellPrice(it, S))}g`, icon: 'coin', data: { uid: it.uid } });
      if (L.isGear(it)) out.push({ act: 'salvage', label: 'Salvage', icon: 'recycle', data: { uid: it.uid } });
    }
    if (L.isGear(it)) out.push({ act: 'workshop', label: 'Upgrade at BMO', icon: 'anvil', data: { uid: it.uid } });
    return out;
  };

  /* ---------- the whole page ---------- */
  LO.render = function (G, h) {
    const S = M.stats.compute(G, h);
    const C = G.chars[h];
    const H = D.HEROES[h];
    const nNew = G.stash.filter((i) => i.isNew).length;
    let x = `<div class="lo" data-hero="${h}">`;
    x += `<section class="panel lo-equip" data-keep-scroll="equip">${equipPanel(G, h, S)}</section>`;
    x += `<section class="lo-center"><div class="lo-model" id="lo-model" data-act="spin-model"><div class="lo-plate"><span class="hname" style="--c:${H.color}">${esc(H.name)}</span><span class="htitle">${esc(H.title)} · Level ${C.level}</span></div><div class="lo-style">${esc(H.style)}</div><div class="lo-rot">${icon('refresh')} drag to turn</div></div>`;
    x += `<div class="panel lo-stats" id="lo-stats">${LO.statsBody(G, h, null)}</div></section>`;
    x += `<section class="panel lo-stash"><div class="rtabs" role="tablist"><button role="tab" class="${st.rtab === 'stash' ? 'on' : ''}" data-act="rtab" data-tab="stash">${icon('chest')} Stash <em>${G.stash.length}/${G.stashCap}</em>${nNew ? `<i class="newdot">${nNew}</i>` : ''}</button><button role="tab" class="${st.rtab === 'abilities' ? 'on' : ''}" data-act="rtab" data-tab="abilities">${icon('bolt')} Abilities <em>${S.abilities.length}</em></button></div>`;
    x += `<div class="rbody" data-keep-scroll="rbody-${st.rtab}">${st.rtab === 'stash' ? stashPanel(G, h) : abilityPanel(G, h)}</div>${selectionBar(G, h)}</section>`;
    return x + '</div>';
  };

  /* ---------- the backpack screen during a trip (Tab) ---------- */
  LO.renderRaid = function (r) {
    const G = r.G, h = r.heroId, S = r.local.S, C = G.chars[h], H = D.HEROES[h];
    let x = `<div class="inv"><header class="inv-head"><h2>${icon('bag')} Backpack</h2><span>Everything here comes home if you get off the train. If you’re knocked out, you lose it — except your ${esc(H.safeName)}.</span><button class="btn ghost" data-act="inv-close">${UI.keycap('Tab')} Close</button></header><div class="inv-cols">`;
    x += `<section class="panel"><div class="eq-label">Backpack <small>${r.backpack.length}/${S.backpack}</small></div><div class="grid bp-grid" data-drop="pack">`;
    for (let i = 0; i < S.backpack; i++) x += r.backpack[i] ? UI.tile(r.backpack[i], { src: 'pack', sel: st.sel === r.backpack[i].uid }) : UI.emptyTile({ drop: 'pack' });
    x += `</div><div class="eq-label">${icon(H.safeIcon)} ${esc(H.safeName)} <small>${C.safe.length}/${S.safe} · safe even if you’re knocked out</small></div><div class="grid" data-drop="rsafe">`;
    for (let i = 0; i < S.safe; i++) x += C.safe[i] ? UI.tile(C.safe[i], { src: 'rsafe' }) : UI.emptyTile({ drop: 'rsafe', ghost: icon(H.safeIcon) });
    x += `</div><div class="eq-label">Snack belt</div><div class="eq-row">${C.belt.slice(0, S.belt).map((it, i) => `<div class="beltwrap">${it ? UI.tile(it, { src: 'rbelt', idx: i, cls: 'small', drag: false }) : UI.emptyTile({ cls: 'small' })}<kbd>${esc(DT.game.input.label('belt' + i))}</kbd></div>`).join('')}</div>`;
    x += `<div class="gold-line">${icon('coin')} ${U.fmt(r.gold)} gold picked up this trip</div></section>`;
    x += `<section class="panel"><div class="eq-label">Wearing</div><div class="grid">${H.slots.filter((s) => !M.slotLock(G, h, s)).map((s) => C.equip[s.id] ? UI.tile(C.equip[s.id], { src: 'requip', slot: s.id, drag: false }) : UI.emptyTile({ ghost: UI.art.slotArt(s.kind), label: s.label })).join('')}</div>`;
    x += `<p class="eq-note">${icon('info')} Found something better? Select it and press Equip — your old item goes into the backpack.</p><div id="inv-card" class="inv-card">${st.sel && r.backpack.some((i) => i.uid === st.sel) ? LO.raidCard(r, st.sel) : `<p class="empty-note">Hover or click an item to see what it does.</p>`}</div></section>`;
    return x + '</div></div>';
  };
  LO.raidCard = function (r, uid) {
    const it = r.backpack.find((i) => i.uid === uid) || r.G.chars[r.heroId].safe.find((i) => i.uid === uid);
    if (!it) return '';
    const inPack = r.backpack.includes(it);
    const acts = [];
    if (inPack && M.loot.isGear(it)) { const why = M.hub.whyNot(r.G, r.heroId, it); acts.push(`<button class="btn small primary" data-act="r-equip" data-uid="${it.uid}" ${why ? 'disabled' : ''} title="${esc(why || '')}">${icon('check')} Equip</button>`); }
    if (inPack) acts.push(`<button class="btn small ghost" data-act="r-safe" data-uid="${it.uid}">${icon(D.HEROES[r.heroId].safeIcon)} To ${esc(D.HEROES[r.heroId].safeName)}</button>`, `<button class="btn small danger" data-act="r-drop" data-uid="${it.uid}">${icon('arrowDown')} Drop</button>`);
    else acts.push(`<button class="btn small ghost" data-act="r-unsafe" data-uid="${it.uid}">${icon('bag')} Back to backpack</button>`);
    return UI.itemCard(r.G, it, { hero: r.heroId }) + `<div class="sb-acts">${acts.join('')}</div>`;
  };

  /* ---------- drag and drop ---------- */
  LO.dragStart = function (e) {
    const t = e.target.closest('[draggable="true"]');
    if (!t) return;
    const d = { uid: t.dataset.uid, src: t.dataset.src, slot: t.dataset.slot, idx: t.dataset.idx != null ? +t.dataset.idx : null, ab: t.dataset.ab };
    if (t.classList.contains('abslot')) d.src = 'bar';
    st.drag = d;
    UI.tipHide();
    try { e.dataTransfer.setData('text/plain', d.uid || d.ab || 'x'); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ }
    document.body.classList.add('dragging');
    if (d.uid) document.body.dataset.dragKind = (DT.meta.hub.find(DT.app.G, d.uid) || { item: {} }).item.kind || '';
    if (d.ab) document.body.dataset.dragKind = 'ability';
  };
  LO.dragEnd = function () { st.drag = null; document.body.classList.remove('dragging'); delete document.body.dataset.dragKind; document.querySelectorAll('.drop-hot').forEach((n) => n.classList.remove('drop-hot')); };
  LO.dropTarget = (e) => e.target.closest('[data-drop]');
  LO.dragOver = function (e) {
    if (!st.drag) return;
    const t = LO.dropTarget(e);
    if (!t) return;
    e.preventDefault();
    document.querySelectorAll('.drop-hot').forEach((n) => n !== t && n.classList.remove('drop-hot'));
    t.classList.add('drop-hot');
  };
  /* Returns an [action, data] pair for main.js to run, or null. */
  LO.drop = function (e) {
    const d = st.drag;
    const t = LO.dropTarget(e);
    LO.dragEnd();
    if (!d || !t) return null;
    e.preventDefault();
    const kind = t.dataset.drop;
    if (d.ab || d.src === 'bar') {
      if (kind === 'bar') return ['bind', { ab: d.ab, idx: +t.dataset.idx }];
      if (d.src === 'bar') return ['unbind', { idx: d.idx }];
      return null;
    }
    if (!d.uid) return null;
    if (kind === 'equip') return ['equip', { uid: d.uid, slot: t.dataset.slot }];
    if (kind === 'belt') return ['belt', { uid: d.uid, idx: +t.dataset.idx }];
    if (kind === 'safe') return ['safe', { uid: d.uid }];
    if (kind === 'stash') {
      if (d.src === 'equip') return ['unequip', { slot: d.slot }];
      if (d.src === 'belt') return ['belt-remove', { idx: d.idx }];
      if (d.src === 'safe') return ['safe-remove', { uid: d.uid }];
      return null;
    }
    if (kind === 'sell') return ['sell', { uid: d.uid }];
    if (kind === 'bench') return ['bench', { uid: d.uid }];
    if (kind === 'rsafe' && d.src === 'pack') return ['r-safe', { uid: d.uid }];
    if (kind === 'pack' && d.src === 'rsafe') return ['r-unsafe', { uid: d.uid }];
    return null;
  };

  DT.ui.loadout = LO;
})();
