import { def, makeItem } from '../../data/items.js';
import { STATIONS, RECIPES, STATION_UPGRADES, PACK_UPGRADES } from '../../data/recipes.js';
import { payWithSalvage, packCapacity, planCost } from '../../game/Profile.js';
import { itemModel } from '../../world/Models.js';
import { ratings, traits } from '../../game/weapons.js';
import { esc, tierBadge, costHTML, barsHTML, frame, BenchPreview } from './common.js';

// Crafting stations, Fallout style: pick a category, pick a recipe, see what it
// makes and what it needs, build. Components you're short on come out of your
// salvage automatically. The station's own upgrades sit at the bottom.

export class CraftPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.st = st;
    this.id = st.id;
    this.def = STATIONS[this.id];
    this.cat = null;
    this.sel = 0;
    this.preview = new BenchPreview(hub.scene, st.anchor);
    this.el = frame(this.def.name, '', '', { side: 'right' });
    hub.app.uiRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('mouseover', (e) => {
      const r = e.target.closest('[data-r]');
      if (r && +r.dataset.r !== this.sel) { this.sel = +r.dataset.r; this.render(); }
    });
    this.render();
  }

  get p() { return this.hub.p; }

  _entries() {
    const lvl = this.p.stations[this.id] || 1;
    const out = RECIPES.filter((r) => r.bench === this.id && (!r.story || this.hub.p.story.step === r.story)).map((r) => ({ kind: 'recipe', r, cat: r.cat, locked: r.level > lvl, level: r.level }));
    // gear: the backpack is sewn at the workshop
    if (this.id === 'workshop') {
      const pl = this.p.packLevel || 0;
      if (PACK_UPGRADES[pl]) out.push({ kind: 'pack', cat: 'Gear', cost: PACK_UPGRADES[pl].cost });
    }
    const next = STATION_UPGRADES[this.id][lvl + 1];
    if (next) out.push({ kind: 'upgrade', cat: 'Bench', cost: next, level: lvl + 1 });
    return out;
  }

  render() {
    const p = this.p, lists = this.hub.lists();
    const lvl = p.stations[this.id] || 1;
    const all = this._entries();
    const cats = [...new Set(all.map((e) => e.cat))];
    // Hale's plans open first while the story needs them
    if (!this.cat && cats.includes('Demolition')) this.cat = 'Demolition';
    if (!this.cat || !cats.includes(this.cat)) this.cat = cats[0];
    const entries = all.filter((e) => e.cat === this.cat);
    this.entries = entries;
    this.sel = Math.max(0, Math.min(this.sel, entries.length - 1));
    const list = entries.map((e, i) => {
      const name = e.kind === 'recipe' ? def(e.r.out[0]).name : e.kind === 'pack' ? 'Bigger backpack' : `Upgrade to level ${e.level}`;
      const qty = e.kind === 'recipe' && e.r.out[1] > 1 ? `<small>×${e.r.out[1]}</small>` : '';
      const ok = !e.locked && planCost(lists, e.kind === 'recipe' ? e.r.cost : e.cost).ok;
      return `<button class="st-row ${i === this.sel ? 'on' : ''} ${e.locked ? 'locked' : ok ? 'can' : 'cant'}" data-r="${i}">
        <span class="rn">${esc(name)}${qty}</span>${e.locked ? `<span class="lk">Level ${e.level}</span>` : ok ? '<span class="ck">●</span>' : ''}</button>`;
    }).join('');
    const e = entries[this.sel];
    let detail = '';
    if (e) {
      const cost = e.kind === 'recipe' ? e.r.cost : e.cost;
      const c = costHTML(lists, cost);
      let title, desc, extra = '';
      if (e.kind === 'recipe') {
        const d = def(e.r.out[0]);
        title = `${esc(d.name)}${e.r.out[1] > 1 ? ` <small>×${e.r.out[1]}</small>` : ''}`;
        desc = d.desc || '';
        extra = tierBadge(e.r.out[0]);
        if (d.kind === 'gun') {
          const s = d;
          extra += barsHTML(ratings(s));
          const tr = traits(s);
          if (tr.length) extra += `<p class="traits">${tr.map(esc).join(' · ')}</p>`;
          extra += `<p class="ammo-note">Takes ${esc(def(d.ammo).name)}</p>`;
        }
        this._show(e.r.out[0]);
      } else if (e.kind === 'pack') {
        title = 'Bigger backpack';
        desc = `Sew on more pockets: ${packCapacity(p)} → ${packCapacity(p) + 2} slots. More of what you find comes home.`;
        this._show('leather');
      } else {
        title = `${esc(this.def.name)}: level ${e.level}`;
        desc = e.level === 2 ? 'Better tools unlock the next row of recipes.' : 'A full shop. Everything on this bench unlocks.';
        this._show('toolkit');
      }
      const verb = e.kind === 'recipe' ? this.def.verb : e.kind === 'pack' ? 'Sew it' : 'Upgrade';
      detail = `<div class="st-detail">
        <h3>${title}</h3>${extra}
        <p class="dd">${esc(desc)}</p>
        <h4>Components</h4>${c.html}
        <button class="btn primary go" data-x="make" ${e.locked || !c.ok ? 'disabled' : ''}>${e.locked ? `Needs level ${e.level}` : `${verb} <span class="key">Enter</span>`}</button>
      </div>`;
    }
    const body = `
      <nav class="st-cats">${cats.map((c) => `<button data-cat="${esc(c)}" class="${c === this.cat ? 'on' : ''}">${esc(c)}</button>`).join('')}</nav>
      <div class="st-split"><div class="st-list" role="listbox">${list}</div>${detail}</div>`;
    this.el.querySelector('.st-lvl')?.remove();
    const head = this.el.querySelector('.st-head div');
    head.insertAdjacentHTML('beforeend', `<span class="st-lvl">Level ${lvl} of ${this.def.max}</span>`);
    this.el.querySelector('.st-body').innerHTML = body;
    this.el.querySelector('.st-foot').innerHTML = `<span class="key">A</span><span class="key">D</span> category <span class="key">W</span><span class="key">S</span> select <span class="key">Enter</span> ${esc(this.def.verb.toLowerCase())}`;
  }

  _show(id) {
    if (this.shown === id) return;
    this.shown = id;
    const d = def(id);
    this.preview.set(itemModel(id), { size: d.cat === 'weapon' ? (d.kind === 'gun' ? 0.62 : d.slot === 'knife' ? 0.3 : 0.5) : 0.22 });
  }

  _make() {
    const e = this.entries[this.sel];
    if (!e || e.locked) return;
    const p = this.p, lists = this.hub.lists();
    const cost = e.kind === 'recipe' ? e.r.cost : e.cost;
    if (!payWithSalvage(lists, cost, (it) => this.hub.give(it))) { this.hub.audio.ui('error'); return; }
    if (e.kind === 'recipe') {
      const [id, n] = e.r.out;
      const d = def(id);
      const ok = this.hub.give(makeItem(id, n, d.kind === 'gun' ? { loaded: 0 } : {}));
      this.hub.audio.ui(ok ? 'craft' : 'error');
      this.flash(ok ? `${d.name}${n > 1 ? ` ×${n}` : ''} → stash` : 'Stash is full');
    } else if (e.kind === 'pack') {
      p.packLevel = (p.packLevel || 0) + 1;
      this.hub.audio.ui('craft');
      this.flash('Backpack enlarged');
    } else {
      p.stations[this.id] = e.level;
      this.hub.audio.ui('craft');
      this.flash(`${this.def.name} is now level ${e.level}`);
    }
    this.hub.save();
    this.hub.refreshStatus();
    this.render();
  }

  flash(text) {
    const f = document.createElement('div');
    f.className = 'st-flash';
    f.textContent = text;
    this.el.appendChild(f);
    setTimeout(() => f.remove(), 1600);
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    this.hub.audio.init();
    if (t.dataset.x === 'leave') return this.hub.closeStation();
    if (t.dataset.x === 'make') return this._make();
    if (t.dataset.cat) { this.cat = t.dataset.cat; this.sel = 0; this.hub.audio.ui(); this.render(); return; }
    if (t.dataset.r) { this.sel = +t.dataset.r; this.hub.audio.ui(); this.render(); }
  }

  onKey(e) {
    const cats = [...new Set(this._entries().map((x) => x.cat))];
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { this.sel = Math.max(0, this.sel - 1); this.render(); }
    else if (e.code === 'KeyS' || e.code === 'ArrowDown') { this.sel = Math.min(this.entries.length - 1, this.sel + 1); this.render(); }
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
      const i = cats.indexOf(this.cat) + (e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : 1);
      this.cat = cats[(i + cats.length) % cats.length];
      this.sel = 0;
      this.render();
    } else if (e.code === 'Enter' || e.code === 'KeyE') this._make();
    else return;
    this.hub.audio.ui();
  }

  update(dt) { this.preview.update(dt); }

  dispose() {
    this.preview.dispose();
    this.el.remove();
  }
}
