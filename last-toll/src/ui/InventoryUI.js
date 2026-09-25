import { def, SLOT_NAMES, SLOT_ORDER, CAT_LABEL } from '../data/items.js';
import { icon } from './icons.js';

// Item grid + detail panel used both in the field (backpack) and in the hub.

export function slotHTML(it, { sel = false, slotName = null, idx = '' } = {}) {
  if (!it) {
    return `<button class="slot empty" data-idx="${idx}" ${slotName ? '' : 'disabled'}>${slotName ? `<span class="slotname">${slotName}</span>` : ''}<span></span><span class="nm" style="color:var(--muted)">${slotName ? 'Empty' : ''}</span></button>`;
  }
  const d = def(it.id);
  const qty = it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : d.kind === 'gun' && it.gun ? `<span class="qty">${it.gun.loaded + (it.gun.chamber === 'live' ? 1 : 0)}/${d.cap}</span>` : '';
  let dur = '';
  if (it.dur !== undefined && d.dur) {
    const k = it.dur / d.dur;
    dur = `<span class="dur${k < 0.25 ? ' low' : ''}"><span style="width:${Math.round(k * 100)}%"></span></span>`;
  }
  return `<button class="slot${sel ? ' sel' : ''}" data-cat="${d.cat}" data-idx="${idx}" title="${d.name}">
    ${slotName ? `<span class="slotname">${slotName}</span>` : ''}
    ${icon(d.cat, d.kind)}${qty}
    <span class="nm">${d.name}${it.sup ? ' · Sup.' : ''}</span>${dur}</button>`;
}

export function detailHTML(it, actions) {
  if (!it) return `<div class="detail"><div class="dd">Select an item to see what it does.</div></div>`;
  const d = def(it.id);
  const rows = [];
  rows.push(['Type', CAT_LABEL[d.cat] || d.cat]);
  if (d.cat === 'weapon') {
    rows.push(['Carried on', SLOT_NAMES[d.slot]]);
    if (d.dur) rows.push(['Condition', `${it.dur}/${d.dur}`]);
    if (d.kind === 'melee') {
      rows.push(['Style', { stab: 'Stab', blunt: 'Blunt', chop: 'Chop' }[d.type]]);
      rows.push(['Reach', `${d.reach.toFixed(2)} m`]);
      rows.push(['Stamina / swing', String(d.stamina)]);
    } else {
      rows.push(['Ammo', def(d.ammo).name]);
      rows.push(['Capacity', String(d.cap)]);
      rows.push(['Heard from', `${it.sup ? 9 : d.noise} m`]);
      if (it.gun) rows.push(['Loaded', `${it.gun.loaded}${it.gun.chamber === 'live' ? ' + 1' : ''}`]);
      if (it.sup) rows.push(['Suppressor', `${it.sup} shots left`]);
    }
  }
  if (d.nourish) rows.push(['Nourishment', `+${d.nourish}`]);
  if (d.heal) rows.push(['Heals', `+${d.heal}`]);
  if (d.yields) rows.push(['Scraps into', Object.entries(d.yields).map(([k, v]) => `${def(k).name} ×${v}`).join(', ')]);
  const acts = actions.map((a) => `<button class="btn small${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}" data-act="${a.id}" ${a.disabled ? 'disabled' : ''}>${a.label}</button>`).join('');
  return `<div class="detail">
    <div class="dn">${d.name}${it.qty > 1 ? ` <span class="num" style="color:var(--muted);font-size:16px">×${it.qty}</span>` : ''}</div>
    <div class="dd">${d.desc || ''}</div>
    <dl class="stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="acts">${acts}</div></div>`;
}

export class InventoryUI {
  constructor(root, handlers) {
    this.handlers = handlers;
    const o = document.createElement('div');
    o.className = 'overlay';
    o.style.display = 'none';
    o.innerHTML = `<div class="sheet" role="dialog" aria-label="Backpack">
      <div class="sheet-head"><div><h2>Backpack</h2><p class="sub">The dead don't wait while you rummage. <span class="key">Tab</span> to close.</p></div><div class="label cap"></div></div>
      <div class="inv-layout"><div><h3>Holsters</h3><div class="loadout"></div><h3>Pack</h3><div class="grid pack"></div></div><div class="side"></div></div></div>`;
    root.appendChild(o);
    this.el = o;
    this.loadoutEl = o.querySelector('.loadout');
    this.packEl = o.querySelector('.pack');
    this.sideEl = o.querySelector('.side');
    this.capEl = o.querySelector('.cap');
    this.sel = null;
    o.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) {
        this.handlers.onAction(act.dataset.act, this.sel);
        this.render();
        return;
      }
      const slot = e.target.closest('.slot');
      if (slot && slot.dataset.idx !== '') {
        this.sel = slot.dataset.idx;
        this.handlers.onClick?.();
        this.render();
      }
      if (e.target === o) this.handlers.onClose();
    });
  }

  get open() { return this.el.style.display !== 'none'; }

  show(inv) {
    this.inv = inv;
    this.el.style.display = '';
    this.render();
  }

  hide() {
    this.el.style.display = 'none';
    this.sel = null;
  }

  selectedItem() {
    if (!this.sel || !this.inv) return null;
    if (this.sel.startsWith('L:')) return this.inv.loadout[this.sel.slice(2)] || null;
    return this.inv.backpack[+this.sel.slice(2)] || null;
  }

  render() {
    if (!this.open) return;
    const inv = this.inv;
    this.loadoutEl.innerHTML = SLOT_ORDER.map((s) => slotHTML(inv.loadout[s], { sel: this.sel === 'L:' + s, slotName: SLOT_NAMES[s], idx: 'L:' + s })).join('');
    const cells = [];
    for (let i = 0; i < inv.cap; i++) cells.push(slotHTML(inv.backpack[i], { sel: this.sel === 'B:' + i, idx: inv.backpack[i] ? 'B:' + i : '' }));
    this.packEl.innerHTML = cells.join('');
    this.capEl.textContent = `${inv.backpack.length} / ${inv.cap} slots`;
    const it = this.selectedItem();
    if (!it) this.sel = null;
    this.sideEl.innerHTML = detailHTML(it, it ? this.handlers.actionsFor(this.sel, it) : []);
  }
}
