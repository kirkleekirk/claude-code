import * as THREE from 'three';
import { def, SLOT_ORDER, TIERS } from '../../data/items.js';
import { modsFor, modDef, SLOT_LABEL, QUALITY } from '../../data/mods.js';
import { repairCost } from '../../data/recipes.js';
import { payWithSalvage, planCost } from '../../game/Profile.js';
import { weaponStats, applyMods, ratings, traits, clampLoaded } from '../../game/weapons.js';
import { weaponModel } from '../../world/Models.js';
import { esc, tierBadge, costHTML, barsHTML, frame, BenchPreview } from './common.js';

// The weapon workbench. Your gun lies on the mat; each part you can change has a
// marker on the gun itself: point at the barrel to see barrels. Hovering a mod
// bolts it on so you can see it and compare the numbers before you commit.
// Mods you take off go in the parts drawer and cost nothing to put back.

const _v = new THREE.Vector3();

export class GunsmithPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.st = st;
    this.preview = new BenchPreview(hub.scene, st.anchor);
    this.el = frame('Weapon Workbench', '', '', { side: 'right', wide: true });
    hub.app.uiRoot.appendChild(this.el);
    this.hs = document.createElement('div');
    this.hs.className = 'hotspots';
    hub.app.uiRoot.appendChild(this.hs);
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('mouseover', (e) => this._hover(e));
    this.el.addEventListener('mouseleave', () => { if (this.hoverMod !== undefined) { this.hoverMod = undefined; this._rebuild(); this.render(); } });
    this.hs.addEventListener('click', (e) => {
      const d = e.target.closest('[data-slot]');
      if (d) { this.slot = d.dataset.slot; this.hub.audio.ui(); this.render(); }
    });
    this.weapons = this._weapons();
    this.pick = this.weapons[0] || null;
    this.slot = null;
    this.hoverMod = undefined;
    this._rebuild();
    this.render();
  }

  get p() { return this.hub.p; }

  _weapons() {
    const p = this.p, out = [];
    for (const s of SLOT_ORDER) if (p.loadout[s]) out.push({ it: p.loadout[s], where: 'Holstered' });
    p.backpack.forEach((it) => { if (def(it.id).cat === 'weapon') out.push({ it, where: 'Pack' }); });
    p.stash.forEach((it) => { if (def(it.id).cat === 'weapon') out.push({ it, where: 'Stash' }); });
    // guns first, best tier first
    return out.sort((a, b) => (def(b.it.id).kind === 'gun') - (def(a.it.id).kind === 'gun') || (def(b.it.id).tier ?? 0) - (def(a.it.id).tier ?? 0));
  }

  _mods(slotOverride) {
    const it = this.pick.it;
    const mods = { ...(it.mods || {}) };
    if (slotOverride !== undefined && this.slot) {
      if (slotOverride) mods[this.slot] = slotOverride;
      else delete mods[this.slot];
    }
    return mods;
  }

  // Put the (possibly previewed) gun on the mat.
  _rebuild() {
    if (!this.pick) { this.preview.set(null); return; }
    const it = this.pick.it, d = def(it.id);
    const mods = d.kind === 'gun' ? this._mods(this.hoverMod) : {};
    let m = weaponModel(it.id, mods);
    this.gun = m;
    if (m.userData.bow || d.kind === 'melee') {
      const w = new THREE.Group();
      if (m.userData.bow) m.rotation.x = Math.PI / 2;
      else m.rotation.set(Math.PI / 2, 0, 0);
      w.add(m);
      m = w;
    }
    this.preview.set(m, { size: d.slot === 'sidearm' ? 0.42 : 0.66, spin: false });
  }

  render() {
    const p = this.p, lists = this.hub.lists();
    const lvl = p.stations.gunsmith || 1;
    const head = this.el.querySelector('.st-head div');
    this.el.querySelector('.st-lvl')?.remove();
    head.insertAdjacentHTML('beforeend', `<span class="st-lvl">Level ${lvl} of 3</span>`);
    if (!this.pick) {
      this.el.querySelector('.st-body').innerHTML = '<p class="dd">No weapons aboard. Bring one back, or build one at the workshop.</p>';
      this.hs.innerHTML = '';
      return;
    }
    const it = this.pick.it, d = def(it.id);
    const chips = this.weapons.map((w, i) => {
      const wd = def(w.it.id), t = TIERS[wd.tier ?? 0];
      const n = w.it.mods ? Object.keys(w.it.mods).length : 0;
      return `<button class="wchip ${w === this.pick ? 'on' : ''}" data-w="${i}" style="--tc:${t.color}"><span class="tp">${wd.tier === 4 ? 'X' : wd.tier ?? ''}</span><span class="wn">${esc(wd.name)}${n ? `<b>+${n}</b>` : ''}</span><small>${w.where}</small></button>`;
    }).join('');
    const stats = weaponStats(it);
    const cond = `${Math.round(it.dur)}/${d.dur}`;
    const rc = repairCost(d);
    const rcost = costHTML(lists, rc);
    const repair = it.dur < d.dur ? `<div class="repair"><span>Condition <b class="num">${cond}</b></span>${rcost.html}<button class="btn small" data-x="repair" ${rcost.ok ? '' : 'disabled'}>Repair</button></div>` : `<div class="repair ok"><span>Condition <b class="num">${cond}</b> — good as it gets</span></div>`;
    let modsHTML = '';
    if (d.kind === 'gun') {
      const slots = d.mods || [];
      if (!this.slot || !slots.includes(this.slot)) this.slot = slots[0];
      const tabs = slots.map((s) => {
        const cur = it.mods && it.mods[s] ? modDef(it.mods[s]) : null;
        return `<button class="slot-tab ${s === this.slot ? 'on' : ''}" data-slot="${s}"><span>${SLOT_LABEL[s]}</span><small>${cur ? esc(cur.name) : 'Stock'}</small></button>`;
      }).join('');
      const list = modsFor(it.id, this.slot, d);
      const curId = it.mods ? it.mods[this.slot] : null;
      const rows = [{ id: '', name: 'Stock', quality: null }, ...list].map((m) => {
        const md = m.id ? m : null;
        const q = md ? QUALITY[md.quality] : null;
        const locked = md && q.bench > lvl;
        const drawer = md ? p.parts[md.id] || 0 : 0;
        const on = (curId || '') === m.id;
        const sel = this.sel === m.id;
        return `<button class="mod-row ${on ? 'cur' : ''} ${sel ? 'on' : ''} ${locked ? 'locked' : ''}" data-mod="${m.id}">
          <span class="mn">${esc(m.name)}</span>${q ? `<span class="q" style="--qc:${q.color}">${q.label}</span>` : ''}
          ${on ? '<span class="tag">Installed</span>' : locked ? `<span class="tag">Bench ${q.bench}</span>` : drawer ? `<span class="tag">In drawer ×${drawer}</span>` : ''}</button>`;
      }).join('');
      // the mod being looked at: hovered, else selected, else installed
      const focus = this.hoverMod !== undefined ? this.hoverMod : this.sel !== undefined ? this.sel : curId || '';
      const fm = focus ? modDef(focus) : null;
      const cmpStats = applyMods(def(it.id), this._mods(focus || null));
      const bars = barsHTML(ratings(stats), (focus || '') !== (curId || '') ? ratings(cmpStats) : null);
      let act = '';
      if ((focus || '') === (curId || '')) {
        act = curId ? '<button class="btn" data-x="remove">Take it off <small>(to the parts drawer)</small></button>' : '<p class="dd">This is how it came.</p>';
      } else if (!fm) {
        act = '<button class="btn primary go" data-x="install">Strip back to stock</button>';
      } else {
        const q = QUALITY[fm.quality];
        const locked = q.bench > lvl;
        const drawer = p.parts[fm.id] || 0;
        const useAlt = fm.alt && planCost(lists, fm.alt).ok;
        const c = drawer ? { html: '<p class="dd">You have one in the parts drawer. Free to fit.</p>', ok: true } : costHTML(lists, useAlt ? fm.alt : fm.cost);
        act = `<h4>Components</h4>${c.html}<button class="btn primary go" data-x="install" ${locked || !c.ok ? 'disabled' : ''}>${locked ? `Needs bench level ${q.bench}` : 'Install <span class="key">Enter</span>'}</button>`;
      }
      const tr = traits(focus !== undefined ? cmpStats : stats);
      modsHTML = `
        <div class="slot-tabs">${tabs}</div>
        <div class="st-split">
          <div class="st-list">${rows}</div>
          <div class="st-detail">
            <h3>${fm ? esc(fm.name) : `${SLOT_LABEL[this.slot]}: stock`}</h3>
            ${fm ? `<p class="dd">${esc(fm.desc)}</p>` : ''}
            ${bars}
            ${tr.length ? `<p class="traits">${tr.map(esc).join(' · ')}</p>` : ''}
            ${act}
          </div>
        </div>`;
    } else {
      modsHTML = `<p class="dd">${esc(d.desc)}</p><p class="dd">Blades and blunt weapons don't take mods, but the bench can put an edge back on them.</p>`;
    }
    this.el.querySelector('.st-body').innerHTML = `
      <div class="wchips">${chips}</div>
      <div class="wsel"><h3>${esc(d.name)}</h3>${tierBadge(it.id)}</div>
      ${repair}
      ${modsHTML}`;
    this.el.querySelector('.st-foot').innerHTML = `Point at a part of the gun to see what fits there · <span class="key">W</span><span class="key">S</span> browse <span class="key">Enter</span> install`;
    this._hotspots();
  }

  _hotspots() {
    const it = this.pick && this.pick.it;
    const d = it && def(it.id);
    if (!d || d.kind !== 'gun') { this.hs.innerHTML = ''; this.spots = []; return; }
    this.hs.innerHTML = (d.mods || []).map((s) => `<button class="hotspot ${s === this.slot ? 'on' : ''}" data-slot="${s}" aria-label="${SLOT_LABEL[s]}"><i></i><span>${SLOT_LABEL[s]}</span></button>`).join('');
    this.spots = [...this.hs.querySelectorAll('.hotspot')];
  }

  update(dt) {
    this.preview.update(dt);
    // keep the markers pinned to the gun's parts
    if (!this.spots || !this.spots.length || !this.gun) return;
    const a = this.gun.userData.anchors || {};
    const cam = this.hub.camera;
    const w = window.innerWidth, h = window.innerHeight;
    this.gun.updateWorldMatrix(true, false);
    for (const el of this.spots) {
      const at = a[el.dataset.slot] || a.muzzle || [0, 0, 0];
      this.gun.localToWorld(_v.set(at[0], at[1], at[2]));
      _v.project(cam);
      el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px)`;
    }
  }

  _hover(e) {
    const m = e.target.closest('[data-mod]');
    if (!m) return;
    const id = m.dataset.mod;
    if (this.hoverMod === id) return;
    this.hoverMod = id;
    this._rebuild();
    this.render();
  }

  _install() {
    const p = this.p, it = this.pick.it, lists = this.hub.lists();
    const focus = this.hoverMod !== undefined ? this.hoverMod : this.sel;
    if (focus === undefined) return;
    const cur = it.mods ? it.mods[this.slot] : null;
    if ((focus || '') === (cur || '')) return;
    if (focus) {
      const md = modDef(focus);
      if (QUALITY[md.quality].bench > (p.stations.gunsmith || 1)) return;
      if (p.parts[focus]) { if (--p.parts[focus] <= 0) delete p.parts[focus]; }
      else {
        const useAlt = md.alt && planCost(lists, md.alt).ok;
        if (!payWithSalvage(lists, useAlt ? md.alt : md.cost, (x) => this.hub.give(x))) { this.hub.audio.ui('error'); return; }
      }
    }
    it.mods = it.mods || {};
    if (cur) p.parts[cur] = (p.parts[cur] || 0) + 1;
    if (focus) it.mods[this.slot] = focus;
    else delete it.mods[this.slot];
    clampLoaded(it);
    this.hub.audio.mech('magIn');
    this.hub.audio.ui('craft');
    this.hub.save();
    this.sel = undefined;
    this.hoverMod = undefined;
    this._rebuild();
    this.render();
  }

  _remove() {
    const p = this.p, it = this.pick.it;
    const cur = it.mods && it.mods[this.slot];
    if (!cur) return;
    p.parts[cur] = (p.parts[cur] || 0) + 1;
    delete it.mods[this.slot];
    clampLoaded(it);
    this.hub.audio.mech('magOut');
    this.hub.save();
    this._rebuild();
    this.render();
  }

  _repair() {
    const it = this.pick.it, d = def(it.id);
    if (!payWithSalvage(this.hub.lists(), repairCost(d), (x) => this.hub.give(x))) return;
    it.dur = d.dur;
    this.hub.audio.ui('craft');
    this.hub.save();
    this.render();
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    this.hub.audio.init();
    const x = t.dataset.x;
    if (x === 'leave') return this.hub.closeStation();
    if (x === 'install') return this._install();
    if (x === 'remove') return this._remove();
    if (x === 'repair') return this._repair();
    if (t.dataset.w !== undefined) {
      this.pick = this.weapons[+t.dataset.w];
      this.slot = null;
      this.sel = undefined;
      this.hoverMod = undefined;
      this._rebuild();
    } else if (t.dataset.slot) {
      this.slot = t.dataset.slot;
      this.sel = undefined;
      this.hoverMod = undefined;
      this._rebuild();
    } else if (t.dataset.mod !== undefined) {
      this.sel = t.dataset.mod;
      this.hoverMod = this.sel;
    }
    this.hub.audio.ui();
    this.render();
  }

  onKey(e) {
    if (!this.pick || def(this.pick.it.id).kind !== 'gun') return;
    const d = def(this.pick.it.id);
    const ids = ['', ...modsFor(this.pick.it.id, this.slot, d).map((m) => m.id)];
    const cur = this.hoverMod !== undefined ? this.hoverMod : this.sel !== undefined ? this.sel : (this.pick.it.mods || {})[this.slot] || '';
    let i = ids.indexOf(cur);
    if (e.code === 'KeyW' || e.code === 'ArrowUp') i = Math.max(0, i - 1);
    else if (e.code === 'KeyS' || e.code === 'ArrowDown') i = Math.min(ids.length - 1, i + 1);
    else if (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const slots = d.mods || [];
      const k = slots.indexOf(this.slot) + (e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : 1);
      this.slot = slots[(k + slots.length) % slots.length];
      this.sel = undefined;
      this.hoverMod = undefined;
      this._rebuild();
      this.render();
      this.hub.audio.ui();
      return;
    } else if (e.code === 'Enter') { this._install(); return; }
    else return;
    this.sel = ids[i];
    this.hoverMod = ids[i];
    this._rebuild();
    this.render();
    this.hub.audio.ui();
  }

  dispose() {
    this.preview.dispose();
    this.el.remove();
    this.hs.remove();
  }
}
