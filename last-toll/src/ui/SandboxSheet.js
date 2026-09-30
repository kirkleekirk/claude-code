import { def, makeItem, TIERS } from '../data/items.js';
import { ZONES } from '../data/zones.js';
import { APPROACHES } from '../data/heist.js';
import { SANDBOX_HOURS, RACKS, rackItems, equipFromRack, restock, newSandboxProfile } from '../game/Sandbox.js';
import { saveProfile, addToList, packCapacity, countIn, maxHealthFor } from '../game/Profile.js';

// The sandbox's own sheet: the rules, the armory rack, and (aboard) a trip to anywhere.
// Opened from the Esc menu on deck, or from the pause card on a trip.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Ammo for a gun you just took off the rack, if the pack is short of it.
function ammoFor(id, have, add) {
  const d = def(id);
  if (d.kind !== 'gun' || !d.ammo) return;
  const stack = def(d.ammo).stack || 1;
  if (have(d.ammo) < stack) add(makeItem(d.ammo, stack));
}

export function showSandbox(app, mode, back) {
  const raid = mode === 'raid' ? app.raid : null;
  let confirmReset = false;
  const o = app._overlay('<div class="sheet sandbox"></div>');
  const sheet = o.querySelector('.sandbox');

  const render = () => {
    const p = app.profile, sb = p.sandbox;
    const lo = raid ? raid.inv.loadout : p.loadout;
    const chip = (on, attrs, label, extra = '') => `<button class="sb-chip ${on ? 'on' : ''}" ${attrs}>${label}${extra}</button>`;
    const rules = [
      ['god', 'Can\'t be hurt', 'Bites, bullets, falls and drowning do nothing.'],
      ['ammo', 'Ammo never runs out', 'Your pack keeps refilling for the guns you carry. You still reload.'],
      ['sweep', 'The Sweep comes', 'Off: the clock stops and the Guard never sweeps.'],
    ].map(([k, label, hint]) => chip(sb[k], `data-rule="${k}" title="${esc(hint)}"`, `<i></i>${label}`)).join('');
    const hours = SANDBOX_HOURS.map((t) => chip(sb.hour === t.h, `data-hour="${t.h === null ? '' : t.h}"`, t.label)).join('');
    const racks = RACKS.map((r) => `
      <div class="sb-rack"><h4>${r.label}</h4><div class="sb-chips">${rackItems(r).map((id) => {
        const d = def(id), t = TIERS[d.tier ?? 0];
        const held = lo[d.slot] && lo[d.slot].id === id;
        return `<button class="sb-gun ${held ? 'on' : ''}" data-gun="${id}" style="--tc:${t.color}">${esc(d.name)}${held ? '<small>held</small>' : ''}</button>`;
      }).join('')}</div></div>`).join('');
    const holsters = ['knife', 'melee', 'sidearm', 'long'].map((s) => `<span><small>${{ knife: 'Sheath', melee: 'Hip', sidearm: 'Holster', long: 'Shoulder' }[s]}</small>${lo[s] ? esc(def(lo[s].id).name) : '—'}</span>`).join('');
    const go = raid ? '' : `
      <section><h3>Go</h3>
        <div class="sb-chips">${ZONES.map((z) => `<button class="sb-go" data-zone="${z.id}"><b>${esc(z.name)}</b><small>Threat ${z.threat} · ${z.night ? 'after dark' : 'dusk'}</small></button>`).join('')}</div>
        <h4>The Covenant job, straight to it (no setups needed)</h4>
        <div class="sb-chips">${APPROACHES.map((a) => `<button class="sb-go heist" data-approach="${a.id}"><b>${esc(a.name)}</b><small>${esc(a.vehicle)} · ${esc(a.style)}</small></button>`).join('')}</div>
      </section>`;
    const keys = raid ? `
      <section><h3>Keys on this trip</h3>
        <p class="sb-keys"><span class="key">N</span> a walker in front of you <span class="key">J</span> a Guardsman <span class="key">K</span> put down every walker near you <span class="key">T</span> an hour later</p>
      </section>` : '';
    sheet.innerHTML = `
      <div class="sheet-head"><div><h2>Sandbox</h2><p class="sub">A separate save for trying things out. Your own game isn't touched.</p></div><button class="btn" data-sb="back">Back</button></div>
      <section><h3>Rules</h3>
        <div class="sb-chips">${rules}</div>
        <h4>Time of day${raid ? (raid.swept ? ' <small>(from the next trip: the Sweep is on)</small>' : '') : ' for the next trip'}</h4>
        <div class="sb-chips">${hours}</div>
      </section>
      <section><h3>Armory</h3>
        <p class="sub">Click a weapon to put it in its holster, loaded, with ammo in your pack. Mods go on at the weapon workbench aboard; every mod is in its parts drawer.</p>
        <div class="sb-held">${holsters}</div>
        ${racks}
      </section>
      ${go}${keys}
      <div class="sb-foot">
        <button class="btn small" data-sb="restock">Restock everything</button>
        ${raid ? '' : `<button class="btn small" data-sb="reset">${confirmReset ? 'Click again to reset' : 'Reset the sandbox'}</button>`}
        ${raid ? '' : '<button class="btn small" data-sb="leave">Leave the sandbox</button>'}
      </div>`;
  };

  o.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    app.audio.init();
    app.audio.ui();
    const p = app.profile, sb = p.sandbox;
    if (b.dataset.sb === 'back') { back(); return; }
    if (b.dataset.sb === 'leave') { app.leaveSandbox(); return; }
    if (b.dataset.sb === 'reset') {
      if (!confirmReset) { confirmReset = true; render(); return; }
      app.profile = newSandboxProfile(p.settings);
      saveProfile(app.profile);
      app.hub.refreshStatus?.();
      confirmReset = false;
    } else if (b.dataset.sb === 'restock') {
      if (raid) {
        raid.player.health = raid.player.maxHealth;
        for (const it of Object.values(raid.inv.loadout)) if (it) ammoFor(it.id, (a) => raid.inv.count(a), (x) => raid.inv.add(x));
        raid.inv.add(makeItem('bandage', 4));
        raid.hud.toast('Restocked');
      } else {
        restock(p);
        p.nourishment = 100;
        p.health = maxHealthFor(p.nourishment);
      }
    } else if (b.dataset.rule) {
      const k = b.dataset.rule;
      sb[k] = !sb[k];
      if (raid) raid.applySandbox();
    } else if (b.dataset.hour !== undefined) {
      sb.hour = b.dataset.hour === '' ? null : +b.dataset.hour;
      if (raid && sb.hour !== null) raid.setHour(sb.hour);
    } else if (b.dataset.gun) {
      const id = b.dataset.gun;
      if (raid) {
        const slot = equipFromRack(raid.inv.loadout, id);
        ammoFor(id, (a) => raid.inv.count(a), (x) => raid.inv.add(x));
        raid.inv.changed();
        raid.combat.refresh();
        raid.combat.equipSlot(slot);
      } else {
        equipFromRack(p.loadout, id);
        ammoFor(id, (a) => countIn([p.backpack], a), (x) => addToList(p.backpack, packCapacity(p), x));
      }
    } else if (b.dataset.zone) {
      saveProfile(p);
      app.startRaid(b.dataset.zone);
      return;
    } else if (b.dataset.approach) {
      const a = APPROACHES.find((x) => x.id === b.dataset.approach);
      saveProfile(p);
      app.startRaid('harbor', undefined, { approach: a.id, time: a.time, gear: { dive_gear: true, cutting_torch: true, boat_keys: true, manifest: false } });
      return;
    }
    saveProfile(app.profile);
    render();
  });
  render();
  return o;
}
