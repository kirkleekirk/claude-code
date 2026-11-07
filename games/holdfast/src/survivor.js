// Survivor creation: name, body and colours, traits bought with points (bad
// traits pay points back), then where in the county to start.
import * as THREE from 'three';
import { Character, makeWeaponMeshes } from './characters.js';
import { T } from './world/terrain.js';
import { isTouch } from './platform.js';

export const START_POINTS = 2;

// cost > 0: a strength you pay for; cost < 0: a weakness that pays you.
export const TRAITS = [
  { id: 'athletic', name: 'Athletic', cost: 3, desc: 'More stamina, and you sprint faster.', not: ['outofshape'] },
  { id: 'tough', name: 'Tough', cost: 3, desc: '+30 health.', not: ['frail'] },
  { id: 'slugger', name: 'Slugger', cost: 2, desc: 'Swings hit 25% harder and knock the dead down more often.' },
  { id: 'marksman', name: 'Marksman', cost: 2, desc: 'Steadier aim, shots hit 30% harder.', not: ['badeyes'] },
  { id: 'scavenger', name: 'Scavenger', cost: 2, desc: 'Search 40% faster and turn up more.', not: ['unlucky'] },
  { id: 'quiet', name: 'Light on your feet', cost: 2, desc: 'You make 40% less noise.', not: ['clumsy'] },
  { id: 'handy', name: 'Handy', cost: 2, desc: 'Building costs a quarter less.', not: ['badback'] },
  { id: 'medic', name: 'Field medic', cost: 1, desc: 'Food and meds heal 50% more.', not: ['slowheal'] },
  { id: 'nightowl', name: 'Night owl', cost: 1, desc: 'The dead spot you less easily after dark.' },
  { id: 'prepper', name: 'Prepper', cost: 1, desc: 'Start with extra food, meds and materials.' },
  { id: 'outofshape', name: 'Out of shape', cost: -2, desc: 'Less stamina, and a slower sprint.', not: ['athletic'] },
  { id: 'frail', name: 'Frail', cost: -3, desc: '-30 health.', not: ['tough'] },
  { id: 'clumsy', name: 'Clumsy', cost: -2, desc: 'You make 60% more noise.', not: ['quiet'] },
  { id: 'slowhands', name: 'Slow hands', cost: -1, desc: 'Swings take 20% longer.' },
  { id: 'badeyes', name: 'Poor eyesight', cost: -1, desc: 'Shots stray wider.', not: ['marksman'] },
  { id: 'unlucky', name: 'Unlucky', cost: -2, desc: 'Containers turn up less.', not: ['scavenger'] },
  { id: 'slowheal', name: 'Slow healer', cost: -1, desc: 'Food and meds heal 40% less.', not: ['medic'] },
  { id: 'smoker', name: 'Smoker', cost: -1, desc: 'Stamina comes back 30% slower.' },
  { id: 'badback', name: 'Bad back', cost: -2, desc: 'Building costs a quarter more.', not: ['handy'] },
];
const BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export function pointsLeft(traits) {
  let p = START_POINTS;
  for (const id of traits) p -= (BY_ID[id] || { cost: 0 }).cost;
  return p;
}

// Numbers the rest of the game reads.
export function traitMods(traits) {
  const has = (id) => traits.includes(id);
  return {
    maxHealth: 100 + (has('tough') ? 30 : 0) - (has('frail') ? 30 : 0),
    maxStamina: 100 * (has('athletic') ? 1.3 : 1) * (has('outofshape') ? 0.7 : 1),
    sprint: 6.0 * (has('athletic') ? 1.1 : 1) * (has('outofshape') ? 0.88 : 1),
    staminaRegen: has('smoker') ? 0.7 : 1,
    melee: has('slugger') ? 1.25 : 1,
    knockdown: has('slugger') ? 1.6 : 1,
    swing: has('slowhands') ? 1.2 : 1,
    gun: has('marksman') ? 1.3 : 1,
    spread: (has('marksman') ? 0.6 : 1) * (has('badeyes') ? 1.8 : 1),
    search: (has('scavenger') ? 0.6 : 1),
    loot: (has('scavenger') ? 1.25 : 1) * (has('unlucky') ? 0.7 : 1),
    noise: (has('quiet') ? 0.6 : 1) * (has('clumsy') ? 1.6 : 1),
    build: (has('handy') ? 0.75 : 1) * (has('badback') ? 1.25 : 1),
    heal: (has('medic') ? 1.5 : 1) * (has('slowheal') ? 0.6 : 1),
    nightSight: has('nightowl') ? 0.7 : 1,
  };
}

export const SPAWNS = [
  { id: 'highway', name: 'Highway 34', at: [14, 2], risk: 'Medium', desc: 'Open road between the farms and town. A middle ground.' },
  { id: 'hollis', name: 'Hollis Farm', at: [-174, -110], risk: 'Low', desc: 'A quiet farmhouse with a barn and machine shed. A long walk to town.' },
  { id: 'price', name: 'Price Farm', at: [-56, -122], risk: 'Low', desc: 'A small cottage at the end of a gravel lane, by the woods.' },
  { id: 'church', name: 'Bethel Church', at: [-118, 44], risk: 'Low', desc: 'A country church on the highway with room around it to build.' },
  { id: 'mainst', name: "Main Street, Harlan's Landing", at: [100, 0], risk: 'High', desc: 'Shops full of supplies. Full of the dead, too.' },
];

const SKINS = ['#e2b9a0', '#d8a888', '#c99a7a', '#a8775a', '#7a5238', '#5a3a28'];
const HAIRS = ['#2a1e16', '#4a3020', '#8a6a3a', '#b0a090', '#1a1a1a', '#7a3a22'];
const SHIRTS = ['#3b5f7a', '#7a3a32', '#5a6a3a', '#c8b88a', '#3a3a3a', '#6a5a8a', '#8a6a3a', '#e0ddd0'];
const PANTS = ['#3a4458', '#4a4a52', '#5a4a3a', '#2e3238', '#6a6a5a'];
const FIRST = { man: ['Cal', 'Dale', 'Wes', 'Earl', 'Ray', 'Hank', 'Luke', 'Dwight', 'Owen', 'Marcus'], woman: ['June', 'Rae', 'Lori', 'Dana', 'Kate', 'Nell', 'Tess', 'Mae', 'Rosa', 'Joy'] };
const LAST = ['Hollis', 'Dekker', 'Price', 'Wagner', 'Boone', 'Kessler', 'Ruiz', 'Talley', 'Burke', 'Lindqvist', 'Moreau', 'Haskins'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function randomProfile() {
  const model = Math.random() < 0.5 ? 'man' : 'woman';
  return {
    name: `${pick(FIRST[model])} ${pick(LAST)}`, model,
    skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick(PANTS),
    traits: [], spawn: 'highway', autoName: true,
  };
}
export function profilePalette(p) { return [p.skin, p.shirt, p.pants, '#2a2420', p.hair, '#2a2018']; }

// ---------------- screens ----------------
export class SurvivorSetup {
  // opts.keepPlace: an older save with no survivor yet: make one, keep the
  // save's position and progress (no start point step)
  constructor(game, onDone, opts = {}) {
    this.game = game;
    this.onDone = onDone;
    this.keepPlace = !!opts.keepPlace;
    this.profile = randomProfile();
    const el = this.el = document.createElement('div');
    el.className = 'overlay setup';
    document.getElementById('ui').appendChild(el);
    this.renderCreate();
  }

  // ---- step 1: who you are ----
  renderCreate() {
    const p = this.profile;
    const sw = (list, key) => list.map((c) => `<button class="swb ${p[key] === c ? 'on' : ''}" data-k="${key}" data-v="${c}" style="--c:${c}" aria-label="${key} colour ${c}"></button>`).join('');
    const pts = pointsLeft(p.traits);
    const tr = (t) => {
      const on = p.traits.includes(t.id);
      const blocked = !on && (t.not || []).some((x) => p.traits.includes(x));
      return `<button class="trait ${on ? 'on' : ''} ${t.cost < 0 ? 'neg' : 'pos'}" data-t="${t.id}" ${blocked ? 'disabled' : ''} aria-pressed="${on}">
        <span class="tn">${t.name}</span><span class="tc">${t.cost > 0 ? '−' + t.cost : '+' + -t.cost}</span><span class="td">${t.desc}</span></button>`;
    };
    this.el.innerHTML = `
      <div class="panel setup-panel">
        <h2>NEW SURVIVOR</h2>
        <p class="sub">Who walks out into Bridger County?</p>
        <div class="setup-grid">
          <div class="setup-look">
            <div class="su-prev" id="su-prev-slot"></div>
            <label class="su-name">Name <input id="su-name" maxlength="28" value="${p.name.replace(/"/g, '&quot;')}"></label>
            <div class="su-row"><span>Body</span><button class="chipbtn ${p.model === 'man' ? 'on' : ''}" data-model="man">Man</button><button class="chipbtn ${p.model === 'woman' ? 'on' : ''}" data-model="woman">Woman</button><button class="chipbtn" id="su-rand">Random</button></div>
            <div class="su-row"><span>Skin</span>${sw(SKINS, 'skin')}</div>
            <div class="su-row"><span>Hair</span>${sw(HAIRS, 'hair')}</div>
            <div class="su-row"><span>Shirt</span>${sw(SHIRTS, 'shirt')}</div>
            <div class="su-row"><span>Pants</span>${sw(PANTS, 'pants')}</div>
          </div>
          <div class="setup-traits">
            <div class="su-points ${pts < 0 ? 'neg' : ''}"><b>${pts}</b> trait point${pts === 1 ? '' : 's'} left</div>
            <p class="note">Strengths cost points. Weaknesses give points back.</p>
            <h3>Strengths</h3>
            <div class="traits">${TRAITS.filter((t) => t.cost > 0).map(tr).join('')}</div>
            <h3>Weaknesses</h3>
            <div class="traits">${TRAITS.filter((t) => t.cost < 0).map(tr).join('')}</div>
          </div>
        </div>
        <div class="setup-actions">
          <span class="note" id="su-why">${pts < 0 ? 'Drop a strength or take a weakness to balance your points.' : ''}</span>
          <button class="primary" id="su-next" ${pts < 0 ? 'disabled' : ''}>${this.keepPlace ? 'Back to your game' : 'Choose where to start'}</button>
        </div>
      </div>`;
    const $ = (id) => this.el.querySelector('#' + id);
    $('su-name').addEventListener('input', (e) => { p.name = e.target.value; p.autoName = false; });
    for (const b of this.el.querySelectorAll('[data-model]')) b.addEventListener('click', () => {
      p.model = b.dataset.model;
      // a name we made up follows the body; one you typed stays
      if (p.autoName !== false) p.name = `${pick(FIRST[p.model])} ${p.name.split(' ').slice(1).join(' ') || pick(LAST)}`;
      this.renderCreate();
    });
    for (const b of this.el.querySelectorAll('.swb')) b.addEventListener('click', () => { p[b.dataset.k] = b.dataset.v; this.renderCreate(); });
    for (const b of this.el.querySelectorAll('[data-t]')) b.addEventListener('click', () => {
      const id = b.dataset.t;
      p.traits = p.traits.includes(id) ? p.traits.filter((x) => x !== id) : [...p.traits, id];
      const keep = this.el.querySelector('.setup-traits').scrollTop;
      this.renderCreate();
      this.el.querySelector('.setup-traits').scrollTop = keep;
    });
    $('su-rand').addEventListener('click', () => { const r = randomProfile(); Object.assign(p, { ...r, traits: p.traits }); this.renderCreate(); });
    $('su-next').addEventListener('click', () => { if (pointsLeft(p.traits) < 0) return; if (this.keepPlace) this.finish(); else this.renderSpawn(); });
    if (!this.prevCanvas) {
      this.prevCanvas = document.createElement('canvas');
      this.prevCanvas.width = 260; this.prevCanvas.height = 320;
      this.prevCanvas.setAttribute('aria-label', 'Preview of your survivor');
    }
    $('su-prev-slot').appendChild(this.prevCanvas);
    this.preview(this.prevCanvas);
  }

  // a small turntable of the survivor holding the bat
  preview(cv) {
    if (!this.pr) {
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xe8eef4, 0x5a4a3a, 1.3));
      const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(2, 4, 3); scene.add(sun);
      const cam = new THREE.PerspectiveCamera(32, cv.width / cv.height, 0.1, 20);
      cam.position.set(0, 1.15, 4.1); cam.lookAt(0, 0.92, 0);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 1 }));
      disc.rotation.x = -Math.PI / 2; scene.add(disc);
      this.pr = { r, scene, cam, cv, key: '' };
      const loop = () => {
        if (!this.pr) return;
        const c = this.pr.char;
        if (c) {
          c.root.rotation.y += 0.008;
          c.animate(1 / 60, { speed: 0, mode: 'idle', weapon: 'bat' });
          c.root.updateMatrixWorld(true);
          this.pr.w.group.position.copy(c.grip.pos).applyMatrix4(c.root.matrixWorld);
          this.pr.w.group.quaternion.copy(c.root.quaternion).multiply(c.grip.quat);
        }
        this.pr.r.render(this.pr.scene, this.pr.cam);
        this.pr.raf = requestAnimationFrame(loop);
      };
      loop();
    }
    const p = this.profile;
    const key = p.model;
    if (this.pr.key !== key) {
      if (this.pr.char) { this.pr.scene.remove(this.pr.char.root); this.pr.scene.remove(this.pr.w.group); }
      const c = new Character(p.model, profilePalette(p));
      c.root.rotation.y = 0.5;
      this.pr.scene.add(c.root);
      const w = makeWeaponMeshes(); w.gun.visible = false; this.pr.scene.add(w.group);
      this.pr.char = c; this.pr.w = w; this.pr.key = key;
    }
    this.pr.char.setPalette(profilePalette(p));
  }

  // ---- step 2: where you start ----
  renderSpawn() {
    const p = this.profile;
    const cards = SPAWNS.map((s) => `<button class="spawn ${p.spawn === s.id ? 'on' : ''}" data-s="${s.id}"><span class="sn">${s.name}</span><span class="sr r-${s.risk.toLowerCase()}">${s.risk} risk</span><span class="sd">${s.desc}</span></button>`).join('');
    this.el.innerHTML = `
      <div class="panel setup-panel">
        <h2>WHERE TO START</h2>
        <p class="sub">${escapeHtml(p.name || 'Your survivor')} · ${p.traits.length ? p.traits.map((t) => BY_ID[t].name).join(', ') : 'no traits'}</p>
        <div class="spawn-grid">
          <canvas id="sp-map" aria-label="Map of Bridger County with start points"></canvas>
          <div class="spawns">${cards}</div>
        </div>
        <div class="setup-actions">
          <button id="sp-back">Back</button>
          <button class="primary" id="sp-go">Start here</button>
        </div>
      </div>`;
    const $ = (id) => this.el.querySelector('#' + id);
    for (const b of this.el.querySelectorAll('[data-s]')) b.addEventListener('click', () => { p.spawn = b.dataset.s; this.renderSpawn(); });
    $('sp-back').addEventListener('click', () => this.renderCreate());
    $('sp-go').addEventListener('click', () => this.finish());
    const cv = $('sp-map');
    this.drawMap(cv);
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (cv.width / r.width), my = (e.clientY - r.top) * (cv.height / r.height);
      let best = null, bd = 30;
      for (const s of SPAWNS) {
        const [x, y] = this.mapXY(cv, s.at);
        const d = Math.hypot(mx - x, my - y);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) { p.spawn = best.id; this.renderSpawn(); }
    });
  }
  mapXY(cv, [x, z]) {
    const P = T.play;
    return [(x - P.x0) / (P.x1 - P.x0) * cv.width, (z - P.z0) / (P.z1 - P.z0) * cv.height];
  }
  drawMap(cv) {
    const map = this.game.map;
    if (!map.base) map.paintBase();
    cv.width = map.base.width; cv.height = map.base.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(map.base, 0, 0);
    for (const s of SPAWNS) {
      const [x, y] = this.mapXY(cv, s.at);
      const on = s.id === this.profile.spawn;
      ctx.beginPath(); ctx.arc(x, y, on ? 11 : 8, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#d9a441' : 'rgba(243,239,228,.9)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1a1a14'; ctx.stroke();
      if (on) {
        ctx.font = '600 16px Oswald, Arial Narrow, sans-serif'; ctx.fillStyle = '#1a1a14';
        ctx.textAlign = x > cv.width * 0.7 ? 'right' : 'left';
        const tx = x + (ctx.textAlign === 'right' ? -16 : 16);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(243,239,228,.85)'; ctx.strokeText(s.name, tx, y + 5);
        ctx.fillText(s.name, tx, y + 5);
      }
    }
  }
  finish() {
    const p = this.profile;
    p.name = (p.name || '').trim() || randomProfile().name;
    if (this.pr) { cancelAnimationFrame(this.pr.raf); this.pr.r.dispose(); this.pr = null; }
    this.el.remove();
    this.onDone(p);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
void isTouch;
