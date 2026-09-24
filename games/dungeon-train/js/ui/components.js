/* Shared UI pieces: item tiles, the plain-English item card, ability and skill cards, keyword help,
   the floating tooltip, context menu, modals and toasts. Views build HTML strings from these. */
(function () {
  'use strict';
  const D = DT.data;
  const U = DT.U;
  const M = DT.meta;
  const UI = (DT.ui = DT.ui || {});
  const esc = U.esc;
  const icon = DT.icon;
  const art = () => UI.art;

  UI.rarity = (r) => D.RARITIES[r] || D.RARITIES[0];
  UI.heroName = (h) => (D.HEROES[h] ? D.HEROES[h].name : h);

  /* ---------- keywords ---------- */
  const KW = Object.keys(D.GLOSSARY).sort((a, b) => b.length - a.length);
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const KW_RE = new RegExp('(?<![A-Za-z])(' + KW.map(reEsc).join('|') + ')(?![A-Za-z])', 'g');
  /* Escape text and underline known keywords (hover them for a definition). */
  UI.kw = (text) => esc(text).replace(KW_RE, (m) => `<span class="kw" data-kw="${esc(m)}">${m}</span>`);
  UI.kwFound = function (texts) {
    const seen = new Map();
    for (const t of texts) { if (!t) continue; for (const m of String(t).matchAll(KW_RE)) { const def = D.GLOSSARY[m[1]]; const key = def; if (!seen.has(key)) seen.set(key, m[1]); } }
    return [...seen.entries()].map(([def, word]) => ({ word, def }));
  };
  UI.glossary = function (texts) {
    const found = UI.kwFound(texts);
    if (!found.length) return '';
    return `<div class="gloss">${found.map((k) => `<p><b>${esc(k.word)}:</b> ${esc(k.def)}</p>`).join('')}</div>`;
  };
  UI.statText = (k, v) => (D.STAT_TEXT[k] ? D.STAT_TEXT[k](v) : `${k} ${v}`);

  /* ---------- tiles ---------- */
  UI.tile = function (it, o) {
    o = o || {};
    const L = M.loot;
    const cls = ['tile', 'r' + (it.rarity || 0)];
    if (o.cls) cls.push(o.cls);
    if (o.sel) cls.push('sel');
    if (o.dim) cls.push('dim');
    if (it.unique) cls.push('uniq');
    const b = [];
    if (L.isGear(it)) b.push(`<span class="t-lvl">T${it.ilvl}${it.upg ? `<b>+${it.upg}</b>` : ''}</span>`);
    if ((it.qty || 1) > 1) b.push(`<span class="t-qty">×${it.qty}</span>`);
    if (it.isNew && o.src !== 'equip') b.push('<span class="t-new" aria-label="New"></span>');
    if (o.worn) b.push(`<span class="t-worn">${esc(o.worn)}</span>`);
    if (it.set) b.push(`<span class="t-set" style="--c:${D.SETS[it.set].color}" title="${esc(D.SETS[it.set].name)} set"></span>`);
    const hero = L.heroFor(it);
    if (o.showHero && hero && hero !== 'any') b.push(`<span class="t-hero h-${hero}">${hero === 'finn' ? 'F' : 'J'}</span>`);
    if (o.price != null) b.push(`<span class="t-price">${icon('coin')}${U.fmt(o.price)}</span>`);
    const data = [`data-uid="${esc(it.uid)}"`, `data-src="${o.src || ''}"`, 'data-tip="item"'];
    if (o.slot) data.push(`data-slot="${o.slot}"`);
    if (o.idx != null) data.push(`data-idx="${o.idx}"`);
    if (o.act) data.push(`data-act="${o.act}"`);
    return `<div class="${cls.join(' ')}" ${data.join(' ')} draggable="${o.drag === false ? 'false' : 'true'}">${art().art(it)}${b.join('')}</div>`;
  };
  UI.emptyTile = function (o) {
    o = o || {};
    const data = [];
    if (o.slot) data.push(`data-slot="${o.slot}"`);
    if (o.idx != null) data.push(`data-idx="${o.idx}"`);
    if (o.drop) data.push(`data-drop="${o.drop}"`);
    if (o.tip) data.push(`data-tip="${o.tip}"`);
    if (o.act) data.push(`data-act="${o.act}"`);
    const inner = o.locked ? `<span class="lock">${icon('lock')}<small>${esc(o.locked)}</small></span>` : (o.ghost || '') + (o.label ? `<small class="e-lbl">${esc(o.label)}</small>` : '');
    return `<div class="tile empty${o.locked ? ' locked' : ''}${o.cls ? ' ' + o.cls : ''}" ${data.join(' ')}>${inner}</div>`;
  };

  /* ---------- what an item does, split up so the card can explain each part ---------- */
  function diffStats(a, b) { const out = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = (a[k] || 0) - (b[k] || 0); if (Math.abs(d) > 1e-6) out[k] = d; } return out; }
  UI.itemParts = function (it, scale) {
    const L = M.loot;
    const bare = Object.assign({}, it, { affixes: [], power: null, unique: null });
    const baseEf = L.effects(bare, scale);
    const full = L.effects(it, scale);
    const bonuses = (it.affixes || []).map((a) => {
      const one = L.effects(Object.assign({}, bare, { affixes: [a] }), scale).stats;
      const d = diffStats(one, baseEf.stats);
      const k = Object.keys(d)[0] || D.AFFIXES[a.id].stat;
      return { k, v: d[k] || 0 };
    });
    let uniqueStats = {}, powerStats = {};
    if (it.unique) uniqueStats = diffStats(full.stats, L.effects(Object.assign({}, it, { unique: null }), scale).stats);
    if (it.power) powerStats = diffStats(full.stats, L.effects(Object.assign({}, it, { power: null }), scale).stats);
    return { base: baseEf.stats, weapon: full.weapon, bonuses, uniqueStats, powerStats, powers: full.powers, grants: full.grants };
  };

  const statList = (obj, cls) => Object.keys(obj).filter((k) => Math.abs(obj[k]) > 1e-6).map((k) => `<li class="${cls || ''}">${UI.kw(UI.statText(k, obj[k]))}</li>`).join('');

  /* Where an item currently lives, in words. */
  function whereText(G, it) {
    const f = M.hub.find(G, it.uid);
    if (!f) return '';
    if (f.where === 'equip') return `Equipped by ${UI.heroName(f.hero)}`;
    if (f.where === 'belt') return `On ${UI.heroName(f.hero)}’s snack belt`;
    if (f.where === 'safe') return `In ${UI.heroName(f.hero)}’s ${D.HEROES[f.hero].safeName}`;
    if (f.where === 'overflow') return 'Overflow — make room in your stash';
    return '';
  }
  UI.whereText = whereText;

  /* Which slot an item would go into for this hero (for comparisons). */
  UI.targetSlot = function (G, heroId, it, pref) {
    if (pref) return pref;
    const slots = M.hub.slotsFor(heroId, it).filter((s) => !M.slotLock(G, heroId, s));
    if (!slots.length) return null;
    const C = G.chars[heroId];
    const empty = slots.find((s) => !C.equip[s.id]);
    return (empty || slots[0]).id;
  };
  /* Stats as if `it` were worn in `slot` (used for green/red comparisons). */
  UI.previewStats = function (G, heroId, it, slot) {
    const C = G.chars[heroId];
    const equip = Object.assign({}, C.equip);
    for (const k in equip) if (equip[k] && equip[k].uid === it.uid) equip[k] = null;
    equip[slot] = it;
    return M.stats.compute(G, heroId, { equip });
  };
  const KEY_STATS = [
    ['maxHp', 'Health', (v) => U.fmt(v)],
    ['armor', 'Armor', (v) => U.fmt(v)],
    ['hit', 'Hit damage', (v) => U.fmt1(v)],
    ['dps', 'Damage per second', (v) => U.fmt(v)],
    ['crit', 'Crit chance', (v) => U.pct(v)],
    ['attackRate', 'Attack speed', (v) => '×' + v.toFixed(2)],
    ['abilityPower', 'Ability damage', (v) => U.spct(v)],
    ['cdr', 'Ability recharge', (v) => U.spct(v)],
    ['moveSpeed', 'Move speed', (v) => v.toFixed(1) + ' m/s'],
    ['dodge', 'Dodge chance', (v) => U.pct(v)],
    ['backpack', 'Backpack slots', (v) => String(v)],
    ['belt', 'Snack belt slots', (v) => String(v)],
    ['safe', 'Safe pocket slots', (v) => String(v)],
    ['luck', 'Luck', (v) => U.spct(v)],
  ];
  UI.flatStats = function (S) {
    const o = M.stats.offense(S);
    return Object.assign({}, S, { hit: o.hit, dps: o.dps, reach: o.reach });
  };
  UI.statDeltas = function (before, after) {
    const a = UI.flatStats(before), b = UI.flatStats(after);
    const out = [];
    for (const [k, label, fmt] of KEY_STATS) {
      const d = (b[k] || 0) - (a[k] || 0);
      if (Math.abs(d) < (k === 'crit' || k === 'dodge' || k === 'abilityPower' || k === 'cdr' || k === 'luck' ? 0.004 : k === 'attackRate' ? 0.01 : k === 'moveSpeed' ? 0.05 : 0.5)) continue;
      out.push({ k, label, from: fmt(a[k] || 0), to: fmt(b[k] || 0), up: d > 0 });
    }
    return out;
  };

  /* ---------- the item card (tooltip + inspector) ---------- */
  UI.itemCard = function (G, it, o) {
    o = o || {};
    const L = M.loot;
    const heroId = o.hero || G.active;
    const R = UI.rarity(it.rarity);
    const kind = D.KINDS[it.kind] || { label: 'Item' };
    const texts = [];
    const tags = [];
    const owner = L.heroFor(it);
    if (L.isGear(it)) {
      tags.push(owner === 'any' ? '<span class="tag">Finn or Jake</span>' : `<span class="tag h-${owner}">${UI.heroName(owner)} only</span>`);
      tags.push(`<span class="tag">Tier ${it.ilvl}</span>`);
      const need = L.reqLevel(it);
      const user = owner === 'any' ? heroId : owner;
      if (need > 1) tags.push(`<span class="tag${G.chars[user] && G.chars[user].level < need ? ' bad' : ''}">Needs level ${need}</span>`);
      if (it.upg) tags.push(`<span class="tag good">Upgraded +${it.upg}</span>`);
    }
    const where = whereText(G, it);
    if (where) tags.push(`<span class="tag where">${esc(where)}</span>`);
    let h = `<div class="icard r${it.rarity}${it.unique ? ' uniq' : ''}">`;
    h += `<header class="ic-head"><div class="ic-art">${art().art(it)}</div><div class="ic-title"><div class="ic-rar">${esc(R.name)} ${esc(kind.label)}</div><div class="ic-name">${esc(it.name)}</div><div class="ic-tags">${tags.join('')}</div></div></header>`;
    h += '<div class="ic-body">';
    const summary = L.summaryOf(it);
    texts.push(summary);

    if (L.isGear(it)) {
      const scale = heroId && G.chars[heroId] ? M.stats.compute(G, heroId).mods.powerScale || 0 : 0;
      const P = UI.itemParts(it, scale);
      /* what it is / how it attacks */
      if (P.weapon) {
        const w = P.weapon;
        if (w.kind === 'sword') {
          const T = D.SWORD_TYPES[w.type];
          h += `<section class="ic-sec"><h5>${icon('sword')} ${esc(T.name)} — how Finn swings it</h5><p>${UI.kw(T.desc)}</p>`;
          h += `<div class="wstats"><div><b>${U.fmt1(w.dmg)}</b><span>damage per hit</span></div><div><b>×${w.spd.toFixed(2)}</b><span>swing speed</span></div><div><b>${T.reach.toFixed(1)} m</b><span>reach</span></div></div></section>`;
        } else {
          const F = D.PUNCH_FORMS[w.form];
          h += `<section class="ic-sec"><h5>${icon('fist')} ${esc(F.name)} — how Jake punches with it</h5><p>${UI.kw(F.desc)}</p>`;
          h += `<div class="wstats"><div><b>${U.fmt1(w.dmg * F.mult)}</b><span>damage per punch</span></div><div><b>×${(w.spd * F.spd).toFixed(2)}</b><span>punch speed</span></div><div><b>${F.reach.toFixed(1)} m</b><span>reach</span></div></div></section>`;
        }
        texts.push(D.BASES[it.base].text);
        h += `<p class="ic-flavor">${esc(D.BASES[it.base].text)}</p>`;
      } else {
        h += `<p class="ic-sum">${UI.kw(summary)}</p>`;
      }
      /* stats */
      const baseLines = statList(P.base);
      const bonusLines = P.bonuses.map((b) => `<li class="bonus">${UI.kw(UI.statText(b.k, b.v))}</li>`).join('');
      const uniqueLines = statList(P.uniqueStats, 'bonus');
      if (baseLines || bonusLines || uniqueLines) {
        h += `<section class="ic-sec"><h5>${icon('grid')} Stats</h5><ul class="stat-lines">${baseLines}${uniqueLines}${bonusLines}</ul>`;
        if (P.bonuses.length) h += `<p class="ic-note">${icon('dice')} Lines with a dot are random bonuses (${D.RARITIES[it.rarity].name} items roll ${D.RARITIES[it.rarity].affixes}).</p>`;
        h += '</section>';
      }
      /* powers & signature effects */
      for (const p of P.powers) {
        texts.push(p.text);
        const title = p.kind === 'unique' ? 'Signature power' : 'Power';
        h += `<section class="ic-sec power"><h5>${icon(p.icon || 'star')} ${title}: ${esc(p.name)}</h5><p>${UI.kw(p.text)}</p>`;
        if (p.kind === 'power' && Object.keys(P.powerStats).length) h += `<ul class="stat-lines">${statList(P.powerStats, 'bonus')}</ul>`;
        h += '</section>';
      }
      if (P.grants) {
        const ab = D.ABILITIES[P.grants];
        texts.push(ab.desc);
        h += `<section class="ic-sec grant"><h5>${icon(ab.icon)} Gives an ability: ${esc(ab.name)}</h5><p>${UI.kw(ab.desc)}</p><p class="ic-note">${icon('info')} Recharge ${ab.cd}s. While you wear this, bind it to a key (1–4) in the Abilities panel. It leaves your bar when you take the item off.</p></section>`;
      }
      /* armor sets */
      if (it.set) {
        const set = D.SETS[it.set];
        const S = M.stats.compute(G, 'finn');
        const worn = S.sets.find((s) => s.id === it.set);
        const count = worn ? worn.count : 0;
        h += `<section class="ic-sec set" style="--c:${set.color}"><h5>${icon('armor')} ${esc(set.name)} set — Finn is wearing ${count}/4</h5><ul class="set-lines">`;
        for (const need of [2, 4]) {
          const b = set.bonus[need];
          const active = worn ? worn.bonuses[need === 2 ? 0 : 1].active : false;
          const eff = worn ? worn.bonuses[need === 2 ? 0 : 1].need : need;
          texts.push(b.text);
          h += `<li class="${active ? 'on' : ''}"><b>${eff} pieces:</b> ${UI.kw(b.text)}</li>`;
        }
        h += `</ul><p class="ic-note">Pieces: ${Object.values(set.pieces).map((p) => esc(p[1])).join(', ')}.</p></section>`;
      }
      if (it.unique && D.UNIQUES[it.unique].lore) h += `<p class="ic-lore">“${esc(D.UNIQUES[it.unique].lore)}”</p>`;
      /* comparison with what the hero is wearing */
      if (o.compare !== false && heroId && M.hub.usableBy(it, heroId)) {
        const f = M.hub.find(G, it.uid);
        const wornBy = f && f.where === 'equip' && f.hero === heroId;
        if (!wornBy) {
          const slot = UI.targetSlot(G, heroId, it, o.slot);
          if (slot) {
            const cur = G.chars[heroId].equip[slot];
            const before = M.stats.compute(G, heroId);
            const after = UI.previewStats(G, heroId, it, slot);
            const deltas = UI.statDeltas(before, after);
            h += `<section class="ic-sec cmp"><h5>${icon('swap')} If ${UI.heroName(heroId)} equips this${cur ? ` (replacing ${esc(cur.name)})` : ''}</h5>`;
            if (cur && P.weapon) {
              const cw = L.effects(cur).weapon;
              if (cw && (cw.type || cw.form) !== (P.weapon.type || P.weapon.form)) h += `<p class="ic-warn">${icon('info')} This changes how you attack: ${esc(cw.type ? D.SWORD_TYPES[cw.type].name : D.PUNCH_FORMS[cw.form].name)} → ${esc(P.weapon.type ? D.SWORD_TYPES[P.weapon.type].name : D.PUNCH_FORMS[P.weapon.form].name)}.</p>`;
            }
            h += deltas.length ? `<ul class="deltas">${deltas.map((d) => `<li class="${d.up ? 'up' : 'down'}"><span>${esc(d.label)}</span><span>${d.from} → <b>${d.to}</b></span></li>`).join('')}</ul>` : '<p class="ic-note">No change to your main numbers — but check its Powers above.</p>';
            h += '</section>';
          }
        }
      } else if (heroId && !M.hub.usableBy(it, heroId) && owner && owner !== 'any') {
        h += `<p class="ic-warn">${icon('info')} ${esc(M.hub.whyNot(G, heroId, it))}</p>`;
      }
    } else if (it.kind === 'consumable') {
      const c = D.CONSUMABLES[it.base];
      h += `<p class="ic-sum">${UI.kw(c.desc)}</p><p class="ic-note">${icon('pancake')} Snacks go on your snack belt and are used with Z, X, C, V, B during a trip. Stacks up to ${D.STACK_MAX}.</p>`;
    } else if (it.kind === 'valuable') {
      h += `<p class="ic-sum">Treasure! It doesn’t do anything — sell it to Choose Goose for gold.</p>`;
    } else if (it.kind === 'trophy') {
      const t = D.TROPHIES[it.base];
      h += `<p class="ic-sum">${UI.kw(summaryOrEmpty(it))}</p><p class="ic-note">${icon('trophy')} Get off the train with it to claim it forever: ${esc(t.perk)} It also opens the next train line.</p>`;
    }
    h += UI.glossary(texts);
    /* footer */
    const S = G.chars[heroId] ? M.stats.compute(G, heroId) : null;
    const foot = [];
    if (it.kind !== 'trophy') foot.push(`<span>${icon('coin')} Sells for ${U.fmt(L.sellPrice(it, S))}g</span>`);
    const sy = L.salvageYield(it);
    if (sy) foot.push(`<span>${icon('recycle')} Salvage: ${sy.dust} dust${sy.shards ? ` + ${sy.shards} shard${sy.shards > 1 ? 's' : ''}` : ''}</span>`);
    if (o.hint) foot.push(`<span class="hint">${o.hint}</span>`);
    h += `</div><footer class="ic-foot">${foot.join('')}</footer></div>`;
    return h;
  };
  function summaryOrEmpty(it) { try { return M.loot.summaryOf(it); } catch (e) { return ''; } }

  /* ---------- abilities ---------- */
  UI.abilityCooldown = function (S, id) {
    const ab = D.ABILITIES[id];
    const am = (S.abMods && S.abMods[id]) || {};
    return ab.cd * Math.max(0.25, 1 - S.cdr) * Math.max(0.2, 1 + (am.cdMult || 0));
  };
  UI.abilityCard = function (G, heroId, id, o) {
    o = o || {};
    const ab = D.ABILITIES[id];
    const S = o.S || M.stats.compute(G, heroId);
    const known = S.abilities.find((a) => a.id === id);
    const src = known && known.src === 'item' ? `<span class="tag r${known.rarity}">From ${esc(known.itemName)}</span>` : '<span class="tag">Skill tree</span>';
    const cd = UI.abilityCooldown(S, id);
    const nums = [];
    if (ab.dmg) nums.push(`<div><b>${U.fmt(S.power * ab.dmg * (1 + S.abilityPower))}</b><span>damage${ab.count ? ' each' : ''}</span></div>`);
    nums.push(`<div><b>${cd.toFixed(1)}s</b><span>recharge</span></div>`);
    if (ab.dur) nums.push(`<div><b>${ab.dur}s</b><span>lasts</span></div>`);
    if (ab.radius) nums.push(`<div><b>${ab.radius} m</b><span>area</span></div>`);
    else if (ab.range) nums.push(`<div><b>${ab.range} m</b><span>range</span></div>`);
    const T = D.TREES[heroId];
    const upgrades = T.list.filter((n) => n.type === 'mod' && n.abMods && n.abMods[id]);
    const own = G.chars[heroId].tree;
    let h = `<div class="acard"><header><span class="ab-ico">${icon(ab.icon)}</span><div><div class="ac-name">${esc(ab.name)}</div><div class="ic-tags">${src}<span class="tag">${ab.target === 'aim' ? 'Aimed where you point' : ab.target === 'dir' ? 'Fires where you face' : 'Around you'}</span></div></div></header>`;
    h += `<p>${UI.kw(ab.desc)}</p><div class="wstats">${nums.join('')}</div>`;
    if (upgrades.length) h += `<ul class="upg">${upgrades.map((n) => `<li class="${own[n.id] ? 'on' : ''}">${icon(own[n.id] ? 'check' : 'lock')} <b>${esc(n.name)}</b> — ${UI.kw(n.desc || '')}</li>`).join('')}</ul>`;
    if (known && known.src === 'item') h += `<p class="ic-note">${icon('info')} This ability comes from your ${esc(known.itemName)}. Take the item off and the ability leaves your bar.</p>`;
    h += UI.glossary([ab.desc].concat(upgrades.map((n) => n.desc)));
    return h + '</div>';
  };

  /* ---------- skill tree nodes ---------- */
  const NODE_TYPE = { start: 'Start', minor: 'Small bonus', notable: 'Notable', ability: 'New ability', mod: 'Ability upgrade', keystone: 'Keystone', slot: 'Gear slot' };
  UI.nodeTypeName = (t) => NODE_TYPE[t] || t;
  UI.nodeDesc = function (n) {
    if (n.desc) return n.desc;
    if (n.stats) return Object.keys(n.stats).map((k) => UI.statText(k, n.stats[k])).join('. ') + '.';
    return '';
  };
  UI.nodeCard = function (G, heroId, n, o) {
    o = o || {};
    const T = D.TREES[heroId];
    const st = M.tree.state(G, heroId, n.id);
    const br = T.branches.find((b) => b.id === n.branch);
    let h = `<div class="ncard t-${n.type}" style="--c:${n.color}"><header><span class="n-type">${UI.nodeTypeName(n.type)}</span>${br ? `<span class="n-br">${esc(br.name)}</span>` : n.branch === 'bridge' ? '<span class="n-br">Bridge</span>' : ''}</header><div class="n-name">${esc(n.name)}</div>`;
    if (n.type === 'ability') h += UI.abilityCard(G, heroId, n.ability, {});
    else {
      const d = UI.nodeDesc(n);
      h += `<p>${UI.kw(d)}</p>`;
      if (n.desc && n.stats && n.type !== 'keystone') h += `<ul class="stat-lines">${statList(n.stats)}</ul>`;
      if (n.type === 'keystone') h += `<p class="ic-note">${icon('info')} Keystones change your build in a big way — with a catch.</p>`;
      if (n.type === 'mod') { const ab = Object.keys(n.abMods)[0]; h += `<p class="ic-note">${icon('info')} Upgrades ${esc(D.ABILITIES[ab].name)}. You need that ability first.</p>`; }
      h += UI.glossary([d]);
    }
    const state = st.owned ? `<span class="good">${icon('check')} ${esc(st.reason)}</span>` : st.ok ? `<span class="good">${icon('unlock')} Click to unlock (1 point)</span>` : `<span class="bad">${icon('lock')} ${esc(st.reason)}</span>`;
    if (o.state !== false) h += `<footer>${state}</footer>`;
    return h + '</div>';
  };

  /* ---------- floating tooltip ---------- */
  const tip = { el: null, key: null };
  function tipEl() {
    if (!tip.el) { tip.el = document.createElement('div'); tip.el.id = 'tooltip'; tip.el.setAttribute('role', 'tooltip'); document.body.appendChild(tip.el); }
    return tip.el;
  }
  UI.tipShow = function (html, x, y, key) {
    const el = tipEl();
    if (tip.key !== key || !el.classList.contains('on')) { el.innerHTML = html; tip.key = key; }
    el.classList.add('on');
    UI.tipMove(x, y);
  };
  UI.tipMove = function (x, y) {
    const el = tip.el;
    if (!el || !el.classList.contains('on')) return;
    const w = el.offsetWidth, h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    let left = x + 18, top = y + 14;
    if (left + w > W - 8) left = x - w - 18;
    if (left < 8) left = 8;
    if (top + h > H - 8) top = Math.max(8, H - h - 8);
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };
  UI.tipHide = function () { if (tip.el) { tip.el.classList.remove('on'); tip.key = null; } };

  /* ---------- context menu (right-click) ---------- */
  let menuEl = null;
  UI.menuOpen = function (x, y, items) {
    UI.menuClose();
    UI.tipHide();
    menuEl = document.createElement('div');
    menuEl.className = 'ctx';
    menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = items.map((it) => it.sep ? '<hr>' : `<button role="menuitem" data-act="${it.act}" ${Object.entries(it.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${it.disabled ? 'disabled' : ''} class="${it.danger ? 'danger' : ''}">${icon(it.icon || 'check')}<span>${esc(it.label)}</span>${it.note ? `<small>${esc(it.note)}</small>` : ''}</button>`).join('');
    document.body.appendChild(menuEl);
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
    menuEl.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
    const first = menuEl.querySelector('button:not([disabled])');
    if (first) first.focus();
  };
  UI.menuClose = function () { if (menuEl) { menuEl.remove(); menuEl = null; } };
  UI.menuIsOpen = () => !!menuEl;

  /* ---------- modals ---------- */
  let lastFocus = null;
  UI.openModal = function (html, cls) {
    const root = document.getElementById('modal-root');
    lastFocus = document.activeElement;
    root.innerHTML = `<div class="modal-back" data-act="modal-close-back"><div class="modal ${cls || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    root.classList.add('on');
    const f = root.querySelector('[autofocus], .modal button, .modal input');
    if (f) f.focus();
  };
  UI.closeModal = function () {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    root.classList.remove('on');
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  };
  UI.modalOpen = () => document.getElementById('modal-root').classList.contains('on');
  let confirmCb = null;
  UI.confirm = function (title, text, yesLabel, cb, o) {
    o = o || {};
    confirmCb = cb;
    UI.openModal(`<h2>${esc(title)}</h2><p class="m-text">${text}</p><div class="m-actions"><button class="btn ghost" data-act="modal-close">${esc(o.no || 'Cancel')}</button><button class="btn ${o.danger ? 'danger' : 'primary'}" data-act="confirm-yes" autofocus>${esc(yesLabel)}</button></div>`, 'small');
  };
  UI.runConfirm = function () { const cb = confirmCb; confirmCb = null; UI.closeModal(); if (cb) cb(); };

  /* ---------- toasts ---------- */
  UI.toast = function (msg, kind) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.innerHTML = `${icon(kind === 'bad' ? 'x' : kind === 'good' ? 'check' : 'info')}<span>${esc(msg)}</span>`;
    root.appendChild(t);
    while (root.children.length > 4) root.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 2600);
  };

  /* ---------- small bits ---------- */
  UI.bar = (v, max, cls) => `<div class="bar ${cls || ''}"><i style="width:${U.clamp((v / Math.max(1e-6, max)) * 100, 0, 100).toFixed(1)}%"></i></div>`;
  UI.money = (G) => `<span class="cur gold" title="Gold — spend it at Choose Goose’s shop">${icon('coin')}${U.fmt(G.gold)}</span><span class="cur dust" title="Magic dust — from salvaging gear. BMO uses it to upgrade items">${icon('dust')}${U.fmt(G.dust)}</span><span class="cur shards" title="Crystal shards — from salvaging rare gear. For the fanciest upgrades">${icon('crystal')}${U.fmt(G.shards)}</span>`;
  UI.cost = (c) => (c ? [c.dust ? `${icon('dust')}${c.dust}` : '', c.shards ? `${icon('crystal')}${c.shards}` : '', c.gold ? `${icon('coin')}${c.gold}` : ''].filter(Boolean).join(' ') : '');
  UI.keycap = (k) => `<kbd>${esc(k)}</kbd>`;
})();
