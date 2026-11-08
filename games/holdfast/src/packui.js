// The pack screen: what the survivor you're playing carries (gun in hand,
// pack by weight) and, at camp, the camp's storage beside it, with take,
// store and equip in both directions.
import { RES, AMMO, GUNS, ITEMS, ICONS, GUN_ORDER } from './items.js';
import { injuryList, fatigueWord } from './condition.js';
import { isTouch } from './platform.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const icon = (k) => `<svg viewBox="0 0 24 24" class="ico">${ICONS[k] || ICONS.item}</svg>`;

export class PackScreen {
  constructor(game) {
    this.game = game;
    const el = this.el = document.createElement('div');
    el.className = 'overlay pack-screen';
    el.hidden = true;
    el.innerHTML = `<div class="sheet"><div class="sheet-top"><div><h2 id="pk-title">Pack</h2><span id="pk-sub"></span></div><button id="pk-close" class="ghost">${isTouch ? 'Close' : 'Close (I)'}</button></div><div class="pk-cols" id="pk-body"></div></div>`;
    document.getElementById('ui').appendChild(el);
    el.querySelector('#pk-close').addEventListener('click', () => this.toggle(false));
    el.addEventListener('click', (e) => { if (e.target === el) this.toggle(false); });
    el.querySelector('#pk-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-do]');
      if (b) { this.act(b.dataset.do, b.dataset.kind, b.dataset.id, +(b.dataset.n || 1)); this.render(); }
    });
  }
  toggle(v) {
    const g = this.game;
    const open = v == null ? this.el.hidden : v;
    this.el.hidden = !open;
    g.modalOpen = open;
    g.input.uiCapture = open;
    if (open) { g.input.exitLock(); this.render(); }
  }
  atCamp() { const p = this.game.player.pos; return !!this.game.claims.at(p.x, p.z); }
  act(what, kind, id, n) {
    const g = this.game, b = g.player.body, st = g.storage, pk = b.pack;
    if (what === 'store') {
      if (kind === 'gun') { const gun = pk.take('gun', id); if (gun) st.put('gun', id, 1, { mag: gun.mag }); }
      else { const t = pk.take(kind, id, n); st.put(kind, id, t); }
    } else if (what === 'take') {
      if (kind === 'gun') {
        const gun = st.take('gun', id);
        if (gun && !pk.add('gun', id, 1, { mag: gun.mag })) { st.put('gun', id, 1, { mag: gun.mag }); g.hud.toast('No room in the pack.', 1.5); }
      } else {
        const t = st.take(kind, id, n);
        const fit = pk.add(kind, id, t);
        if (fit < t) { st.put(kind, id, t - fit); g.hud.toast('No room for all of it.', 1.5); }
      }
    } else if (what === 'equip') {
      // from the pack, or straight from storage at camp
      const src = kind === 'stored' ? st.take('gun', id) : pk.take('gun', id);
      if (!src) return;
      const cur = b.gear.gun;
      if (cur) { if (!pk.add('gun', cur.id, 1, { mag: cur.mag })) st.put('gun', cur.id, 1, { mag: cur.mag }); }
      b.gear.gun = { id, mag: src.mag || 0 };
      // bring ammo for it if camp has some and the pack has none
      const def = GUNS[id];
      if (this.atCamp() && pk.count('ammo', def.ammo) < def.mag * 2) { const t = st.take('ammo', def.ammo, def.mag * 3); const fit = pk.add('ammo', def.ammo, t); if (fit < t) st.put('ammo', def.ammo, t - fit); }
      g.setWeapon('gun');
    } else if (what === 'unequip') {
      const cur = b.gear.gun;
      if (!cur) return;
      if (pk.add('gun', cur.id, 1, { mag: cur.mag })) { b.gear.gun = null; g.setWeapon('bat'); }
      else if (this.atCamp()) { st.put('gun', cur.id, 1, { mag: cur.mag }); b.gear.gun = null; g.setWeapon('bat'); }
      else g.hud.toast('No room in the pack for it.', 1.5);
    } else if (what === 'drop') {
      if (kind === 'gun') pk.take('gun', id); else pk.take(kind, id, n);
    } else if (what === 'unload') g.unload(b);
    else if (what === 'heal') g.patchUp();
    g.markDirty();
  }
  render() {
    const g = this.game, b = g.player.body;
    if (!b) return;
    const pk = b.pack, st = g.storage, camp = this.atCamp();
    this.el.querySelector('#pk-title').textContent = b.person.name;
    const inj = injuryList(b);
    this.el.querySelector('#pk-sub').textContent = `${fatigueWord(b.fatigue)}${inj.length ? ' · ' + inj.join(', ') : ''}`;
    const w = pk.weight(), cap = pk.cap;
    const row = (k, name, n, actions) => `<div class="pk-row">${icon(k)}<span class="pk-n">${esc(name)}</span><b>${n}</b><span class="pk-acts">${actions}</span></div>`;
    const btn = (label, d, kind, id, n = 1, cls = '') => `<button class="mini ${cls}" data-do="${d}" data-kind="${kind}" data-id="${esc(id)}" data-n="${n}">${label}</button>`;
    // ---- you ----
    const gun = b.gear.gun, gdef = gun && GUNS[gun.id];
    let h = `<section class="pk-col"><h3>On you</h3>`;
    h += `<div class="pk-gun">${gdef ? `${icon('gun')}<div><b>${esc(gdef.full)}</b><span>${gun.mag}/${gdef.mag} loaded · ${pk.count('ammo', gdef.ammo)} ${esc(AMMO[gdef.ammo].short || AMMO[gdef.ammo].name)} spare</span></div>${btn('Put away', 'unequip', 'gun', gun.id)}` : `${icon('gun')}<div><b>No gun</b><span>Bat in hand. Equip a gun from your pack${camp ? ' or storage' : ''}.</span></div>`}</div>`;
    h += `<div class="pk-weight"><div class="pk-bar"><span style="width:${Math.min(100, (w / cap) * 100).toFixed(0)}%" class="${w > cap * 0.9 ? 'full' : ''}"></span></div><small>${w.toFixed(1)} / ${cap} carried</small></div>`;
    const rows = [];
    for (const k of Object.keys(RES)) if (pk.res[k]) rows.push(row(k, RES[k].name, pk.res[k], camp ? btn('Store', 'store', 'res', k, pk.res[k]) : btn('Drop', 'drop', 'res', k, 1, 'quiet')));
    for (const k of Object.keys(AMMO)) if (pk.ammo[k]) rows.push(row('ammo', AMMO[k].name, pk.ammo[k], camp ? btn('Store', 'store', 'ammo', k, pk.ammo[k]) : btn('Drop', 'drop', 'ammo', k, pk.ammo[k], 'quiet')));
    pk.guns.forEach((x) => rows.push(row('gun', GUNS[x.id].name, `${x.mag}/${GUNS[x.id].mag}`, btn('Equip', 'equip', 'pack', x.id) + (camp ? btn('Store', 'store', 'gun', x.id) : btn('Drop', 'drop', 'gun', x.id, 1, 'quiet')))));
    for (const k of Object.keys(pk.items)) if (pk.items[k]) rows.push(row('item', ITEMS[k] ? ITEMS[k].name : k, pk.items[k], camp ? btn('Store', 'store', 'item', k, pk.items[k]) : ''));
    h += rows.length ? `<div class="pk-list">${rows.join('')}</div>` : '<p class="note">Your pack is empty.</p>';
    h += `<div class="pk-foot">${btn('Patch up / eat', 'heal', '', '')}${camp && rows.length ? btn('Store everything', 'unload', '', '', 1, 'primary') : ''}</div></section>`;
    // ---- camp ----
    h += `<section class="pk-col camp"><h3>Camp storage</h3>`;
    if (!g.claims.list.length) h += '<p class="note">No camp yet. Plant a claim flag and what you bring back is stored there.</p>';
    else {
      if (!camp) h += '<p class="note">You can take things out when you’re back at camp.</p>';
      const t = (kind, id, n) => (camp ? btn('Take', 'take', kind, id, n) : '');
      const srows = [];
      for (const k of Object.keys(RES)) if (st.res[k] > 0) srows.push(row(k, RES[k].name, st.res[k], t('res', k, k === 'food' || k === 'meds' ? 1 : 5)));
      for (const k of Object.keys(AMMO)) if (st.ammo[k] > 0) { const m = Math.min(st.ammo[k], Object.values(GUNS).find((x) => x.ammo === k).mag); srows.push(row('ammo', AMMO[k].name, st.ammo[k], t('ammo', k, m))); }
      for (const id of GUN_ORDER) { const n = st.count('gun', id); if (n) srows.push(row('gun', GUNS[id].name, n, camp ? btn('Equip', 'equip', 'stored', id) + btn('Take', 'take', 'gun', id) : '')); }
      for (const k of Object.keys(st.items)) if (st.items[k] > 0) srows.push(row('item', ITEMS[k] ? ITEMS[k].name : k, st.items[k], ''));
      srows.push(row('item', 'Claim kits', st.claimKits, ''));
      h += `<div class="pk-list">${srows.join('')}</div>`;
    }
    h += '</section>';
    this.el.querySelector('#pk-body').innerHTML = h;
  }
}
