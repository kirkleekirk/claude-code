import { def, makeItem, SLOT_ORDER } from '../../data/items.js';
import { zoneById } from '../../data/zones.js';
import { countIn, maxHealthFor, saveProfile } from '../../game/Profile.js';
import { HOWTO } from '../howto.js';
import { esc, frame } from './common.js';
import { objective } from '../../data/story.js';

// The smaller stations: the recycler, the captain's log, and the skiff.

export class RecyclerPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.el = frame('Recycler', '', '', { side: 'right' });
    hub.app.uiRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.render();
  }

  get p() { return this.hub.p; }

  _junk() {
    const out = [];
    this.p.stash.forEach((it, i) => { if (def(it.id).yields) out.push(['S', i, it]); });
    this.p.backpack.forEach((it, i) => { if (def(it.id).yields) out.push(['B', i, it]); });
    return out;
  }

  render() {
    const junk = this._junk();
    this.list = junk;
    const rows = junk.map(([w, i, it], k) => {
      const d = def(it.id);
      return `<div class="recipe"><div class="rn">${esc(d.name)}<small>×${it.qty} · ${w === 'S' ? 'trunk' : 'pack'}</small></div><div class="cost">${Object.entries(d.yields).map(([m, v]) => `<span>${v} ${esc(def(m).name)}</span>`).join('')}</div><button class="btn small" data-k="${k}">Scrap one</button></div>`;
    }).join('');
    this.el.querySelector('.st-body').innerHTML = junk.length
      ? `<p class="dd">Crank it and it chews salvage down into parts. The benches do this themselves when you're short, but you can do it by hand.</p>
         <div style="margin:10px 0"><button class="btn small primary" data-x="all">Scrap everything</button></div><div class="recipes">${rows}</div>`
      : '<p class="dd">Nothing to break down. Clocks, radios, belts, whiskey, the Guard\'s dog tags: bring it all back.</p>';
    this.el.querySelector('.st-foot').innerHTML = 'Salvage breaks down into the materials every bench runs on';
  }

  _scrap(list, i, n) {
    const it = list[i];
    const d = def(it.id);
    it.qty -= n;
    if (it.qty <= 0) list.splice(i, 1);
    for (const [k, v] of Object.entries(d.yields)) this.hub.give(makeItem(k, v * n));
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    this.hub.audio.init();
    if (t.dataset.x === 'leave') return this.hub.closeStation();
    if (t.dataset.x === 'all') {
      for (const list of [this.p.stash, this.p.backpack]) {
        for (let i = list.length - 1; i >= 0; i--) if (def(list[i].id).yields) this._scrap(list, i, list[i].qty);
      }
    } else if (t.dataset.k !== undefined) {
      const [w, i] = this.list[+t.dataset.k];
      this._scrap(w === 'S' ? this.p.stash : this.p.backpack, i, 1);
    } else return;
    this.hub.audio.ui('craft');
    this.hub.audio.mech('crank');
    this.hub.save();
    this.render();
  }

  dispose() { this.el.remove(); }
}

export class JournalPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.confirm = false;
    this.el = frame('Captain\'s Log', '', '', { side: 'right', wide: true });
    hub.app.uiRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('input', (e) => this._input(e));
    this.render();
  }

  get p() { return this.hub.p; }

  render() {
    const p = this.p, s = p.stats, st = p.settings;
    const o = objective(p);
    const log = (p.story.log || []).slice().reverse();
    this.el.querySelector('.st-body').innerHTML = `
      <h4>The story so far</h4>
      ${o ? `<div class="lead now"><span>${esc(o.chapter)}</span><b>${esc(o.text)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>` : '<div class="lead now"><span>Deaf and Angry</span><b>The relay is down and Command is on its way. The parish is yours to work.</b></div>'}
      ${log.length ? `<ol class="storylog">${log.map((l) => `<li><span class="num">Day ${l.day}</span><p>${esc(l.text)}</p></li>`).join('')}</ol>` : '<p class="fine">Nothing written yet. There\'s a man on the aft deck in a Guard coat.</p>'}
      <div class="summary"><div class="facts">
        <div><span class="label">Days</span><b>${p.day}</b></div>
        <div><span class="label">Trips</span><b>${s.raids}</b></div>
        <div><span class="label">Made it back</span><b>${s.extracted}</b></div>
        <div><span class="label">Died</span><b>${s.deaths}</b></div>
        <div><span class="label">Put down</span><b>${s.kills}</b></div>
        <div><span class="label">Blade kills</span><b>${s.stabKills}</b></div>
      </div></div>
      <h4>Settings</h4>
      <div class="settings">
        <label for="set-sens">Mouse sensitivity<input id="set-sens" type="range" min="0.3" max="2.5" step="0.05" value="${st.sens}" data-set="sens"><span class="num">${st.sens.toFixed(2)}</span></label>
        <label for="set-vol">Volume<input id="set-vol" type="range" min="0" max="1" step="0.05" value="${st.volume}" data-set="volume"><span class="num">${Math.round(st.volume * 100)}</span></label>
        <label for="set-fov">Field of view<input id="set-fov" type="range" min="60" max="100" step="1" value="${st.fov}" data-set="fov"><span class="num">${st.fov}</span></label>
        <label for="set-voices">Crew voices<input id="set-voices" type="checkbox" ${st.voices !== false ? 'checked' : ''} data-set="voices"><span class="fine">Read lines aloud</span></label>
        <label for="set-walkers">The dead<select id="set-walkers" data-set="walkers"><option value="avatar" ${st.walkers !== 'blocky' ? 'selected' : ''}>Like the living</option><option value="blocky" ${st.walkers === 'blocky' ? 'selected' : ''}>Blocky</option></select><span class="fine">From the next trip</span></label>
      </div>
      <h4>How it works</h4>
      ${HOWTO}
      <div style="margin-top:22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn danger" data-x="reset">${this.confirm ? 'Click again to erase everything' : 'Start over'}</button>
        ${this.confirm ? '<button class="btn" data-x="keep">Keep my save</button>' : ''}
      </div>`;
    this.el.querySelector('.st-foot').innerHTML = 'Your progress saves itself';
  }

  _input(e) {
    const k = e.target.dataset.set;
    if (!k) return;
    if (e.target.tagName === 'SELECT') {
      this.p.settings[k] = e.target.value;
      this.hub.app.applySettings();
      saveProfile(this.p);
      return;
    }
    if (e.target.type === 'checkbox') {
      this.p.settings[k] = e.target.checked;
      if (!e.target.checked) this.hub.audio.hush();
      saveProfile(this.p);
      return;
    }
    const v = parseFloat(e.target.value);
    this.p.settings[k] = v;
    this.hub.app.applySettings();
    const out = e.target.nextElementSibling;
    if (out) out.textContent = k === 'volume' ? Math.round(v * 100) : k === 'sens' ? v.toFixed(2) : String(v);
    saveProfile(this.p);
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.x === 'leave') return this.hub.closeStation();
    if (t.dataset.x === 'reset') {
      if (!this.confirm) { this.confirm = true; this.render(); return; }
      this.hub.app.resetGame();
      return;
    }
    if (t.dataset.x === 'keep') { this.confirm = false; this.render(); }
  }

  dispose() { this.el.remove(); }
}

export class SkiffPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.el = frame('Your Skiff', '', '', { side: 'right' });
    hub.app.uiRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.render();
  }

  render() {
    const p = this.hub.p, z = zoneById(p.lastZone || 'cypress');
    const kit = SLOT_ORDER.map((s) => p.loadout[s]).filter(Boolean);
    const warn = [];
    if (!p.loadout.knife && !p.loadout.melee) warn.push('No blade or melee weapon.');
    if (p.nourishment < 30) warn.push('You are starving.');
    if (p.health < maxHealthFor(p.nourishment) * 0.5) warn.push('You are badly hurt.');
    for (const it of kit) if (it.gun && it.gun.loaded === 0 && countIn([p.backpack], def(it.id).ammo) === 0) warn.push(`No ammunition for the ${def(it.id).name}.`);
    this.el.querySelector('.st-body').innerHTML = `
      <h3>${esc(z.name)}</h3>
      <p class="dd">${esc(z.blurb)}</p>
      <div class="kit"><span class="label">Carrying</span>${kit.map((it) => `<span>${esc(def(it.id).name)}</span>`).join('') || '<span>Nothing holstered</span>'}<span>Pack ${p.backpack.length} items</span></div>
      ${warn.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
      <div class="zp-acts"><button class="btn primary go" data-x="go">Cast off</button></div>
      <p class="fine">Change the destination at the bulletin board.</p>`;
    this.el.querySelector('.st-foot').innerHTML = `Sweep in ${z.sweepMinutes}:00 once you land`;
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    this.hub.audio.init();
    if (t.dataset.x === 'leave') return this.hub.closeStation();
    if (t.dataset.x === 'go') this.hub.deploy(this.hub.p.lastZone || 'cypress');
  }

  dispose() { this.el.remove(); }
}
