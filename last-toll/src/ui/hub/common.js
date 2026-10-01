import * as THREE from 'three';
import { def, TIERS } from '../../data/items.js';
import { countIn, planCost } from '../../game/Profile.js';

// Shared pieces for the station panels aboard the Magnolia.

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function tierBadge(id) {
  const d = def(id);
  if (d.tier == null) return '';
  const t = TIERS[d.tier];
  return `<span class="tier" style="--tc:${t.color}">${t.name}<small>${t.label}</small></span>`;
}

// Components for a cost: have / need, with what salvage would cover.
export function costHTML(lists, cost) {
  const plan = planCost(lists, cost);
  const rows = Object.entries(cost).map(([id, n]) => {
    const have = countIn(lists, id);
    const salv = plan.fromSalvage[id] || 0;
    const short = plan.short[id] || 0;
    const cls = short ? 'miss' : salv ? 'salv' : 'ok';
    return `<li class="${cls}"><span class="cn">${esc(def(id).name)}</span><span class="cq num">${Math.min(have, 999)}<i>/</i>${n}</span>${salv ? `<span class="cs">+${salv} from salvage</span>` : ''}</li>`;
  }).join('');
  const scrapped = Object.entries(plan.scrap).map(([j, n]) => `${n}× ${def(j).name}`).join(', ');
  return { html: `<ul class="comps">${rows}</ul>${scrapped ? `<p class="scrapnote">Breaks down ${esc(scrapped)} for parts.</p>` : ''}`, ok: plan.ok };
}

// Rating bars, optionally against a comparison (for previewing a mod).
export function barsHTML(base, cmp = null) {
  if (!base) return '';
  return `<div class="bars">${base.map(([k, v], i) => {
    const c = cmp ? cmp[i][1] : v;
    const lo = Math.min(v, c), hi = Math.max(v, c);
    const up = c > v + 0.5, down = c < v - 0.5;
    return `<div class="bar-row"><span class="bl">${k}</span><span class="bt"><span class="bb" style="width:${lo}%"></span>${up ? `<span class="bu" style="left:${lo}%;width:${hi - lo}%"></span>` : ''}${down ? `<span class="bd" style="left:${lo}%;width:${hi - lo}%"></span>` : ''}</span></div>`;
  }).join('')}</div>`;
}

// The frame every station panel lives in.
export function frame(title, level, body, { side = 'right', wide = false, foot = '' } = {}) {
  const el = document.createElement('div');
  el.className = `station-ui ${side}${wide ? ' wide' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <header class="st-head">
      <div><h2>${esc(title)}</h2>${level ? `<span class="st-lvl">${esc(level)}</span>` : ''}</div>
      <button class="btn small" data-x="leave">Leave <span class="key">Esc</span></button>
    </header>
    <div class="st-body">${body}</div>
    <footer class="st-foot">${foot}</footer>`;
  return el;
}

// A slowly turning 3D model on the bench.
export class BenchPreview {
  constructor(scene, anchor) {
    this.scene = scene;
    this.anchor = anchor;
    this.group = new THREE.Group();
    if (anchor) this.group.position.copy(anchor.pos);
    scene.add(this.group);
    this.obj = null;
    this.spin = 0;
  }

  set(obj, { size = 0.4, spin = true, rotY = 0 } = {}) {
    if (this.obj) this.group.remove(this.obj);
    this.obj = obj;
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    const dim = box.getSize(new THREE.Vector3());
    const k = Math.max(0.6, Math.min(3.2, size / Math.max(dim.x, dim.y, dim.z, 0.01)));
    obj.scale.setScalar(k);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    obj.position.set(-c.x, -box.min.y * k, -c.z);
    const holder = new THREE.Group();
    holder.add(obj);
    this.group.add(holder);
    this.obj = holder;
    this.doSpin = spin;
    this.group.rotation.y = rotY + (this.anchor ? this.anchor.rotY || 0 : 0);
    this.spin = 0;
  }

  update(dt) {
    if (!this.obj) return;
    this.spin += dt;
    if (this.doSpin) this.obj.rotation.y = this.spin * 0.45;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
