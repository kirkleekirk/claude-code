import { def, makeItem, SLOT_NAMES, SLOT_ORDER, MATS } from '../data/items.js';
import { ZONES, zoneById } from '../data/zones.js';
import { BENCHES, RECIPES, BENCH_UPGRADES, PACK_UPGRADES, repairCost } from '../data/recipes.js';
import {
  STASH_CAP, packCapacity, maxHealthFor, addToList, canFit, countIn, hasCost, payCost, saveProfile, ensureContracts,
} from '../game/Profile.js';
import { slotHTML, detailHTML } from './InventoryUI.js';

// Menus aboard the Magnolia: deploy, stash, workbenches, contracts, journal.

const TABS = [
  ['deploy', 'Set Out'],
  ['stash', 'Stash'],
  ['bench', 'Workbench'],
  ['contracts', 'Contracts'],
  ['journal', 'Journal'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class HubUI {
  constructor(root, app) {
    this.app = app;
    const el = document.createElement('div');
    el.id = 'hub';
    el.className = 'layer interactive';
    el.innerHTML = `<aside class="hub-side"></aside><main class="hub-main"></main>`;
    root.appendChild(el);
    this.el = el;
    this.side = el.querySelector('.hub-side');
    this.main = el.querySelector('.hub-main');
    this.tab = 'deploy';
    this.bench = 'weapon';
    this.sel = null;
    this.zone = app.profile.lastZone || 'cypress';
    this.confirmReset = false;
    el.addEventListener('click', (e) => this._click(e));
    el.addEventListener('input', (e) => this._input(e));
    this.render();
  }

  get p() { return this.app.profile; }

  save() { saveProfile(this.p); }

  lists() { return [this.p.stash, this.p.backpack]; }

  dispose() { this.el.remove(); }

  render() {
    ensureContracts(this.p);
    this._renderSide();
    this._renderMain();
  }

  _renderSide() {
    const p = this.p;
    const maxH = maxHealthFor(p.nourishment);
    const ready = p.contracts.filter((c) => !c.done && c.progress >= c.target).length;
    this.side.innerHTML = `
      <div><div class="day">Day ${p.day}</div><h1 class="boat">The Magnolia</h1></div>
      <nav class="hub-nav" aria-label="Hub">${TABS.map(([id, label]) => `<button data-tab="${id}" class="${this.tab === id ? 'on' : ''}">${label}${id === 'contracts' && ready ? ` <span class="num" style="color:var(--brass);font-size:14px">● ${ready}</span>` : ''}</button>`).join('')}</nav>
      <div class="hub-status">
        <div class="row"><span class="label">Health</span><div class="bar hp"><em style="left:${maxH}%;right:0"></em><span style="width:${p.health}%"></span></div><span class="v">${Math.ceil(p.health)}/${maxH}</span></div>
        <div class="row"><span class="label">Nourished</span><div class="bar st"><span style="width:${p.nourishment}%"></span></div><span class="v">${Math.round(p.nourishment)}</span></div>
        <div class="label" style="text-transform:none;letter-spacing:0.02em;font-size:14px;font-weight:400;color:var(--bone-dim)">Hunger caps your health. Eat from the stash before you go.</div>
      </div>`;
  }

  _renderMain() {
    const fn = { deploy: this._deploy, stash: this._stash, bench: this._bench, contracts: this._contracts, journal: this._journal }[this.tab];
    this.main.innerHTML = `<div class="hub-card">${fn.call(this)}</div>`;
  }

  // ---- deploy -------------------------------------------------------------------

  _deploy() {
    const p = this.p;
    const z = zoneById(this.zone);
    const kit = SLOT_ORDER.map((s) => p.loadout[s]).filter(Boolean).map((it) => {
      const d = def(it.id);
      return `<span>${esc(d.name)}${it.gun ? ` · ${it.gun.loaded + (it.gun.chamber === 'live' ? 1 : 0)}/${d.cap}` : ''}</span>`;
    });
    const packN = p.backpack.length;
    const warn = [];
    if (!p.loadout.knife && !p.loadout.melee) warn.push('No blade or melee weapon — you\'ll scrounge a rusty screwdriver from the skiff.');
    if (p.nourishment < 30) warn.push('You are starving. Your health is capped low — eat something.');
    if (p.health < maxHealthFor(p.nourishment) * 0.5) warn.push('You are badly hurt. Bandage up first.');
    const ammoFor = SLOT_ORDER.map((s) => p.loadout[s]).filter((it) => it && it.gun).map((it) => def(it.id).ammo);
    for (const a of ammoFor) if (countIn([p.backpack], a) === 0) warn.push(`No spare ${def(a).name} in your pack.`);
    return `
      <h2>Where to tonight?</h2>
      <p class="lede">The skiff drops you at the edge of the flood at five o'clock. When the bell in the old tower tolls, every dead thing in the parish starts walking. Be back on the water before then.</p>
      <div class="zones">${ZONES.map((zz) => `
        <button class="zone ${zz.id === this.zone ? 'on' : ''}" data-zone="${zz.id}">
          <span class="zn">${zz.name}</span>
          <span class="threat" aria-label="Threat ${zz.threat} of 3">${[1, 2, 3].map((i) => `<i class="${i <= zz.threat ? 'on' : ''}"></i>`).join('')}<span class="label" style="margin-left:6px">Threat</span></span>
          <p>${zz.blurb}</p>
          <span class="meta"><span>${zz.focus}</span><span class="num">Toll in ${zz.tollMinutes}:00</span></span>
        </button>`).join('')}</div>
      <div class="deploy-foot">
        <div>
          <div class="label" style="margin-bottom:6px">Carrying</div>
          <div class="kit">${kit.join('') || '<span>Nothing holstered</span>'}<span>Pack ${packN}/${packCapacity(p)}</span></div>
          ${warn.map((w) => `<div style="color:#e39a90;font-size:15px;margin-top:8px">${esc(w)}</div>`).join('')}
        </div>
        <button class="btn primary go" data-act="deploy">Take the skiff to ${esc(z.name)}</button>
      </div>`;
  }

  // ---- stash ----------------------------------------------------------------------

  _selItem() {
    const s = this.sel;
    if (!s) return null;
    const p = this.p;
    if (s.w === 'S') return p.stash[s.k] || null;
    if (s.w === 'B') return p.backpack[s.k] || null;
    if (s.w === 'L') return p.loadout[s.k] || null;
    return null;
  }

  _actionsFor(it) {
    const p = this.p, s = this.sel;
    const d = def(it.id);
    const a = [];
    if (s.w === 'S') a.push({ id: 'toPack', label: 'To pack', primary: true, disabled: !canFit(p.backpack, packCapacity(p), it) });
    if (s.w === 'B') a.push({ id: 'toStash', label: 'To stash', primary: true, disabled: !canFit(p.stash, STASH_CAP, it) });
    if (s.w === 'L') {
      a.push({ id: 'toStash', label: 'To stash', primary: true, disabled: !canFit(p.stash, STASH_CAP, it) });
      a.push({ id: 'toPack', label: 'To pack', disabled: !canFit(p.backpack, packCapacity(p), it) });
    }
    if (d.cat === 'weapon' && s.w !== 'L') a.push({ id: 'equip', label: `Holster (${SLOT_NAMES[d.slot].toLowerCase()})` });
    if (d.cat === 'food' && !d.raw) a.push({ id: 'eat', label: `Eat (+${d.nourish})` });
    if (d.cat === 'med' && d.heal) a.push({ id: 'use', label: `Use (+${d.heal} hp)` });
    if (d.cat === 'junk') a.push({ id: 'scrap', label: 'Scrap it' });
    if (it.id === 'suppressor') {
      const pistol = p.loadout.sidearm;
      a.push({ id: 'fit', label: 'Fit to pistol', disabled: !(pistol && pistol.id === 'pistol' && !pistol.sup) });
    }
    if (d.cat === 'weapon' && it.dur < d.dur) {
      const cost = repairCost(d);
      const ok = hasCost(this.lists(), cost) && (d.kind !== 'gun' || p.benches.weapon >= 2);
      a.push({ id: 'repair', label: `Repair (${Object.entries(cost).map(([k, v]) => `${v} ${def(k).name}`).join(', ')})`, disabled: !ok });
    }
    a.push({ id: 'discard', label: 'Throw away', danger: true });
    return a;
  }

  _stash() {
    const p = this.p;
    const stash = [];
    for (let i = 0; i < STASH_CAP; i++) {
      const it = p.stash[i];
      stash.push(slotHTML(it, { sel: this.sel && this.sel.w === 'S' && this.sel.k === i, idx: it ? `S:${i}` : '' }));
    }
    const lo = SLOT_ORDER.map((s) => slotHTML(p.loadout[s], { sel: this.sel && this.sel.w === 'L' && this.sel.k === s, slotName: SLOT_NAMES[s], idx: `L:${s}` })).join('');
    const pack = [];
    const cap = packCapacity(p);
    for (let i = 0; i < cap; i++) {
      const it = p.backpack[i];
      pack.push(slotHTML(it, { sel: this.sel && this.sel.w === 'B' && this.sel.k === i, idx: it ? `B:${i}` : '' }));
    }
    const it = this._selItem();
    return `
      <h2>Stash</h2>
      <p class="lede">What's in your pack and holsters goes with you, and is lost if you die out there. The stash stays aboard.</p>
      <div class="stash-layout">
        <div><h3>Stash <span class="num" style="letter-spacing:0">${p.stash.length}/${STASH_CAP}</span></h3><div class="grid">${stash.join('')}</div></div>
        <div><h3>Holsters</h3><div class="loadout">${lo}</div>
          <h3 style="display:flex;justify-content:space-between;align-items:center">Pack <span class="num" style="letter-spacing:0">${p.backpack.length}/${cap}</span></h3><div class="grid">${pack.join('')}</div>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" data-act="stowAll">Empty pack into stash</button></div></div>
        ${detailHTML(it, it ? this._actionsFor(it) : [])}
      </div>`;
  }

  _stashAction(act) {
    const p = this.p;
    const s = this.sel;
    const it = this._selItem();
    if (!it) return;
    const d = def(it.id);
    const audio = this.app.audio;
    const removeSel = () => {
      if (s.w === 'S') p.stash.splice(s.k, 1);
      else if (s.w === 'B') p.backpack.splice(s.k, 1);
      else p.loadout[s.k] = null;
      this.sel = null;
    };
    const consumeOne = () => {
      it.qty -= 1;
      if (it.qty <= 0) removeSel();
    };
    switch (act) {
      case 'toPack':
        if (canFit(p.backpack, packCapacity(p), it)) { removeSel(); addToList(p.backpack, packCapacity(p), it); }
        break;
      case 'toStash':
        if (canFit(p.stash, STASH_CAP, it)) { removeSel(); addToList(p.stash, STASH_CAP, it); }
        break;
      case 'equip': {
        const slot = d.slot === 'knife' && p.loadout.knife && !p.loadout.melee ? 'melee' : d.slot;
        const prev = p.loadout[slot];
        removeSel();
        p.loadout[slot] = it;
        if (prev) {
          if (s.w === 'B') p.backpack.push(prev);
          else addToList(p.stash, STASH_CAP + 1, prev);
        }
        this.sel = { w: 'L', k: slot };
        audio.mech('holster');
        break;
      }
      case 'eat':
        p.nourishment = Math.min(100, p.nourishment + d.nourish);
        p.health = Math.min(maxHealthFor(p.nourishment), p.health + (d.heal || 0));
        consumeOne();
        audio.eat();
        break;
      case 'use':
        p.health = Math.min(maxHealthFor(p.nourishment), p.health + d.heal);
        consumeOne();
        audio.bandage();
        break;
      case 'scrap': {
        const yields = d.yields;
        consumeOne();
        for (const [k, v] of Object.entries(yields)) this._give(makeItem(k, v));
        audio.ui('craft');
        break;
      }
      case 'fit': {
        const pistol = p.loadout.sidearm;
        if (pistol && pistol.id === 'pistol' && !pistol.sup) {
          pistol.sup = it.dur ?? 40;
          removeSel();
          audio.mech('magIn');
        }
        break;
      }
      case 'repair': {
        const cost = repairCost(d);
        if (!hasCost(this.lists(), cost)) break;
        payCost(this.lists(), cost);
        it.dur = d.dur;
        audio.ui('craft');
        break;
      }
      case 'discard':
        removeSel();
        audio.ui('error');
        break;
    }
    this.save();
  }

  // Put crafted/claimed items in the stash, spilling into the pack.
  _give(item) {
    const p = this.p;
    let left = addToList(p.stash, STASH_CAP, item);
    if (left > 0) left = addToList(p.backpack, packCapacity(p), { ...item, qty: left });
    return left === 0;
  }

  // ---- workbench --------------------------------------------------------------------

  _bench() {
    const p = this.p;
    const lists = this.lists();
    const mats = MATS.map((m) => `<span>${def(m).name}<b>${countIn(lists, m)}</b></span>`).join('');
    const tabs = [...BENCHES.map((b) => [b.id, `${b.name} <span class="num">L${p.benches[b.id]}</span>`]), ['recycle', 'Recycler'], ['upgrade', 'Upgrades']];
    let body = '';
    if (this.bench === 'recycle') body = this._recycler();
    else if (this.bench === 'upgrade') body = this._upgrades();
    else {
      const b = BENCHES.find((x) => x.id === this.bench);
      const lvl = p.benches[b.id];
      const rows = RECIPES.filter((r) => r.bench === b.id).map((r) => {
        const locked = r.level > lvl;
        const cost = Object.entries(r.cost).map(([k, v]) => `<span class="${countIn(lists, k) < v ? 'miss' : ''}">${v} ${def(k).name}</span>`).join('');
        const ok = !locked && hasCost(lists, r.cost);
        const out = def(r.out[0]);
        return `<div class="recipe ${locked ? 'locked' : ''}"><div class="rn">${out.name}<small>×${r.out[1]}</small><div style="font-size:13px;font-weight:400;color:var(--muted)">${locked ? `Needs bench level ${r.level}` : esc(out.desc || '')}</div></div><div class="cost">${cost}</div><button class="btn small ${ok ? 'primary' : ''}" data-craft="${r.id}" ${ok ? '' : 'disabled'}>Craft</button></div>`;
      }).join('');
      let repairs = '';
      if (b.id === 'weapon') {
        const all = [...SLOT_ORDER.map((s) => p.loadout[s]), ...p.stash, ...p.backpack].filter((it) => it && def(it.id).cat === 'weapon' && it.dur < def(it.id).dur);
        repairs = `<h3 style="margin-top:18px">Repairs</h3>${all.length ? '' : '<p style="color:var(--muted);margin:0">Nothing needs mending.</p>'}<div class="recipes">${all.map((it, i) => {
          const d = def(it.id);
          const cost = repairCost(d);
          const needBench = d.kind === 'gun' && lvl < 2;
          const ok = hasCost(lists, cost) && !needBench;
          return `<div class="recipe"><div class="rn">${d.name}<small>${it.dur}/${d.dur}</small>${needBench ? '<div style="font-size:13px;font-weight:400;color:var(--muted)">Guns need bench level 2</div>' : ''}</div><div class="cost">${Object.entries(cost).map(([k, v]) => `<span class="${countIn(lists, k) < v ? 'miss' : ''}">${v} ${def(k).name}</span>`).join('')}</div><button class="btn small" data-repair="${i}" ${ok ? '' : 'disabled'}>Repair</button></div>`;
        }).join('')}</div>`;
        this._repairList = all;
      }
      body = `<p class="lede" style="margin-bottom:12px">${b.blurb}</p><div class="recipes">${rows}</div>${repairs}`;
    }
    return `<h2>Workbench</h2>
      <div class="mats" aria-label="Materials on hand">${mats}</div>
      <div class="bench-tabs">${tabs.map(([id, label]) => `<button data-bench="${id}" class="${this.bench === id ? 'on' : ''}">${label}</button>`).join('')}</div>
      ${body}`;
  }

  _recycler() {
    const p = this.p;
    const junk = [];
    p.stash.forEach((it, i) => { if (def(it.id).cat === 'junk') junk.push(['S', i, it]); });
    p.backpack.forEach((it, i) => { if (def(it.id).cat === 'junk') junk.push(['B', i, it]); });
    if (!junk.length) return '<p class="lede">No salvage to break down. Clocks, radios, belts, whiskey — bring it all back.</p>';
    return `<p class="lede" style="margin-bottom:12px">Break salvage down into materials.</p>
      <div style="margin-bottom:10px"><button class="btn small primary" data-act="scrapAll">Scrap everything</button></div>
      <div class="recipes">${junk.map(([w, i, it]) => {
        const d = def(it.id);
        return `<div class="recipe"><div class="rn">${d.name}<small>×${it.qty}</small></div><div class="cost">${Object.entries(d.yields).map(([k, v]) => `<span>${v} ${def(k).name}</span>`).join('')}</div><button class="btn small" data-scrap="${w}:${i}">Scrap one</button></div>`;
      }).join('')}</div>`;
  }

  _upgrades() {
    const p = this.p;
    const lists = this.lists();
    const rows = BENCHES.map((b) => {
      const lvl = p.benches[b.id];
      const next = BENCH_UPGRADES[b.id][lvl + 1];
      if (!next) return `<div class="recipe"><div class="rn">${b.name}<small>L${lvl}</small></div><div class="cost"><span>Fully upgraded</span></div><span></span></div>`;
      const ok = hasCost(lists, next);
      return `<div class="recipe"><div class="rn">${b.name}<small>L${lvl} → L${lvl + 1}</small></div><div class="cost">${Object.entries(next).map(([k, v]) => `<span class="${countIn(lists, k) < v ? 'miss' : ''}">${v} ${def(k).name}</span>`).join('')}</div><button class="btn small ${ok ? 'primary' : ''}" data-upgrade="${b.id}" ${ok ? '' : 'disabled'}>Upgrade</button></div>`;
    });
    const pl = p.packLevel || 0;
    const pu = PACK_UPGRADES[pl];
    rows.push(pu
      ? `<div class="recipe"><div class="rn">Backpack<small>${packCapacity(p)} → ${packCapacity(p) + 2} slots</small></div><div class="cost">${Object.entries(pu.cost).map(([k, v]) => `<span class="${countIn(lists, k) < v ? 'miss' : ''}">${v} ${def(k).name}</span>`).join('')}</div><button class="btn small ${hasCost(lists, pu.cost) ? 'primary' : ''}" data-upgrade="pack" ${hasCost(lists, pu.cost) ? '' : 'disabled'}>Sew it</button></div>`
      : `<div class="recipe"><div class="rn">Backpack<small>${packCapacity(p)} slots</small></div><div class="cost"><span>As big as it gets</span></div><span></span></div>`);
    return `<p class="lede" style="margin-bottom:12px">Better benches unlock new recipes. A bigger pack means more comes home.</p><div class="recipes">${rows.join('')}</div>`;
  }

  // ---- contracts ----------------------------------------------------------------------

  _contracts() {
    const p = this.p;
    const rows = p.contracts.map((c, i) => {
      const reward = Object.entries(c.reward).map(([k, v]) => `${v} ${def(k).name}`).join(', ');
      let right = '';
      let prog = c.progress / c.target;
      if (c.kind === 'deliver') {
        const have = countIn(this.lists(), c.item);
        prog = Math.min(1, have / c.target);
        right = c.done ? '<span class="label">Done</span>' : `<button class="btn small ${have >= c.target ? 'primary' : ''}" data-deliver="${i}" ${have >= c.target ? '' : 'disabled'}>Deliver ${Math.min(have, c.target)}/${c.target}</button>`;
      } else {
        right = c.done ? '<span class="label">Done</span>' : c.progress >= c.target ? `<button class="btn small primary" data-claim="${i}">Claim</button>` : `<span class="num" style="color:var(--bone-dim)">${c.progress}/${c.target}</span>`;
      }
      return `<div class="contract ${c.done ? 'done' : ''}"><div><div class="ct">${esc(c.text)}</div><div class="cr">Reward: ${reward}</div><div class="bar"><span style="width:${Math.round(prog * 100)}%"></span></div></div>${right}</div>`;
    }).join('');
    return `<h2>Contracts</h2><p class="lede">Old Remy keeps a list on the galley door. Kills only count if you make it back to the boat. New list every morning.</p><div class="contracts">${rows}</div>`;
  }

  // ---- journal ----------------------------------------------------------------------

  _journal() {
    const p = this.p, s = p.stats, st = p.settings;
    return `<h2>Journal</h2>
      <div class="summary"><div class="facts">
        <div><span class="label">Days</span><b>${p.day}</b></div>
        <div><span class="label">Trips</span><b>${s.raids}</b></div>
        <div><span class="label">Made it back</span><b>${s.extracted}</b></div>
        <div><span class="label">Died</span><b>${s.deaths}</b></div>
        <div><span class="label">Put down</span><b>${s.kills}</b></div>
        <div><span class="label">Blade kills</span><b>${s.stabKills}</b></div>
      </div></div>
      <h3>Settings</h3>
      <div class="settings">
        <label for="set-sens">Mouse sensitivity<input id="set-sens" type="range" min="0.3" max="2.5" step="0.05" value="${st.sens}" data-set="sens"><span class="num">${st.sens.toFixed(2)}</span></label>
        <label for="set-vol">Volume<input id="set-vol" type="range" min="0" max="1" step="0.05" value="${st.volume}" data-set="volume"><span class="num">${Math.round(st.volume * 100)}</span></label>
        <label for="set-fov">Field of view<input id="set-fov" type="range" min="60" max="100" step="1" value="${st.fov}" data-set="fov"><span class="num">${st.fov}</span></label>
      </div>
      <h3>How it works</h3>
      ${HOWTO}
      <div style="margin-top:22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn danger" data-act="reset">${this.confirmReset ? 'Click again to erase everything' : 'Start over'}</button>
        ${this.confirmReset ? '<button class="btn" data-act="cancelReset">Keep my save</button>' : ''}
      </div>`;
  }

  // ---- events -------------------------------------------------------------------------

  _input(e) {
    const k = e.target.dataset.set;
    if (!k) return;
    const v = parseFloat(e.target.value);
    this.p.settings[k] = v;
    this.app.applySettings();
    const out = e.target.nextElementSibling;
    if (out) out.textContent = k === 'volume' ? Math.round(v * 100) : k === 'sens' ? v.toFixed(2) : String(v);
    this.save();
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const audio = this.app.audio;
    audio.init();
    const ds = t.dataset;
    const p = this.p;
    if (ds.tab) {
      this.tab = ds.tab;
      this.sel = null;
      this.confirmReset = false;
      audio.ui();
    } else if (ds.zone) {
      this.zone = ds.zone;
      p.lastZone = ds.zone;
      audio.ui();
    } else if (ds.bench) {
      this.bench = ds.bench;
      audio.ui();
    } else if (ds.idx !== undefined && t.classList.contains('slot')) {
      if (!ds.idx) return;
      const [w, k] = ds.idx.split(':');
      this.sel = { w, k: w === 'L' ? k : +k };
      audio.ui();
    } else if (ds.act) {
      switch (ds.act) {
        case 'deploy':
          this.save();
          this.app.startRaid(this.zone);
          return;
        case 'stowAll': {
          const keep = [];
          for (const it of p.backpack) if (addToList(p.stash, STASH_CAP, it) > 0) keep.push(it);
          p.backpack = keep;
          this.sel = null;
          audio.ui();
          this.save();
          break;
        }
        case 'scrapAll': {
          for (const list of [p.stash, p.backpack]) {
            for (let i = list.length - 1; i >= 0; i--) {
              const it = list[i];
              const d = def(it.id);
              if (d.cat !== 'junk') continue;
              list.splice(i, 1);
              for (const [k, v] of Object.entries(d.yields)) this._give(makeItem(k, v * it.qty));
            }
          }
          audio.ui('craft');
          this.save();
          break;
        }
        case 'reset':
          if (!this.confirmReset) { this.confirmReset = true; break; }
          this.app.resetGame();
          return;
        case 'cancelReset':
          this.confirmReset = false;
          break;
        default:
          this._stashAction(ds.act);
      }
    } else if (ds.craft) {
      const r = RECIPES.find((x) => x.id === ds.craft);
      if (r && hasCost(this.lists(), r.cost)) {
        payCost(this.lists(), r.cost);
        const ok = this._give(makeItem(r.out[0], r.out[1]));
        audio.ui(ok ? 'craft' : 'error');
        this.save();
      }
    } else if (ds.repair !== undefined) {
      const it = this._repairList && this._repairList[+ds.repair];
      if (it) {
        const d = def(it.id);
        const cost = repairCost(d);
        if (hasCost(this.lists(), cost)) {
          payCost(this.lists(), cost);
          it.dur = d.dur;
          audio.ui('craft');
          this.save();
        }
      }
    } else if (ds.scrap) {
      const [w, i] = ds.scrap.split(':');
      const list = w === 'S' ? p.stash : p.backpack;
      const it = list[+i];
      if (it) {
        const d = def(it.id);
        it.qty -= 1;
        if (it.qty <= 0) list.splice(+i, 1);
        for (const [k, v] of Object.entries(d.yields)) this._give(makeItem(k, v));
        audio.ui('craft');
        this.save();
      }
    } else if (ds.upgrade) {
      const lists = this.lists();
      if (ds.upgrade === 'pack') {
        const pu = PACK_UPGRADES[p.packLevel || 0];
        if (pu && hasCost(lists, pu.cost)) { payCost(lists, pu.cost); p.packLevel = (p.packLevel || 0) + 1; audio.ui('craft'); }
      } else {
        const lvl = p.benches[ds.upgrade];
        const cost = BENCH_UPGRADES[ds.upgrade][lvl + 1];
        if (cost && hasCost(lists, cost)) { payCost(lists, cost); p.benches[ds.upgrade] = lvl + 1; audio.ui('craft'); }
      }
      this.save();
    } else if (ds.deliver !== undefined) {
      const c = p.contracts[+ds.deliver];
      if (c && !c.done && countIn(this.lists(), c.item) >= c.target) {
        payCost(this.lists(), { [c.item]: c.target });
        this._claim(c);
      }
    } else if (ds.claim !== undefined) {
      const c = p.contracts[+ds.claim];
      if (c && !c.done && c.progress >= c.target) this._claim(c);
    }
    this.render();
  }

  _claim(c) {
    c.done = true;
    for (const [k, v] of Object.entries(c.reward)) this._give(makeItem(k, v));
    this.app.audio.ui('craft');
    this.save();
  }
}

export const HOWTO = `<div class="howto">
  <section><h3>The trip</h3>
    <p>You land at dusk with what's on your back. Search cabinets, lockers, car trunks and shelves. Carry it back to a skiff before the bell tolls, or fight through the dead who come when it does.</p>
    <p>Die and everything you carried stays in the parish. Your stash on the boat is safe.</p></section>
  <section><h3>Killing the dead</h3>
    <p>Only the brain stops them. Hold the mouse to wind up a swing; a weak stab glances off the skull. Blades sometimes stick — hold click and drag the mouse down to wrench them free.</p>
    <p>Grab one by the collar with <span class="key">Q</span> and stab up under its chin. That's the only way through a riot helmet short of a rifle or an axe.</p></section>
  <section><h3>Guns</h3>
    <p>Every gunshot is heard for fifty meters or more. Reload by hand with <span class="key">R</span>, one step at a time: drop the mag, seat a new one, rack the slide. Hold <span class="key">R</span> to run the whole sequence.</p></section>
  <section><h3>Controls</h3>
    <div class="keys-list">
      <span class="key">WASD</span><span>Move · <span class="key">Shift</span> sprint · <span class="key">C</span> crouch</span>
      <span class="key">Mouse L</span><span>Swing / stab (hold to wind up) · fire</span>
      <span class="key">Mouse R</span><span>Aim down sights · grab (melee)</span>
      <span class="key">Q</span><span>Grab a walker · release to shove away</span>
      <span class="key">V</span><span>Shove · break free when grabbed</span>
      <span class="key">R</span><span>Reload step · pump · rack</span>
      <span class="key">E</span><span>Take · search · retrieve</span>
      <span class="key">1-4</span><span>Sheath · hip · holster · shoulder</span>
      <span class="key">F</span><span>Flashlight · <span class="key">H</span> quick heal</span>
      <span class="key">Tab</span><span>Backpack · <span class="key">M</span> map · <span class="key">Esc</span> pause</span>
    </div></section>
</div>`;
