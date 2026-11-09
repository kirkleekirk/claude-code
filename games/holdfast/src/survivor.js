// Survivor creation, in four steps: who you were (a background that shapes
// your strengths and what you carry), your group and how hard the county
// is, your strengths (five stats on a pentagon, plus traits, from one pool
// of points), and where to start.
import * as THREE from 'three';
import { Character, makeWeaponMeshes } from './characters.js';
import { T } from './world/terrain.js';
import { isTouch } from './platform.js';
import { STATS, STAT_IDS, radarSVG } from './stats.js';
import { SCARCITY, GUNS } from './items.js';
import { W } from './world/layout.js';

// points to spend on stats and traits; starting with fewer people gives more
export const POOL = 6;
export const COMPANIONS = [
  { n: 0, name: 'Alone', pts: 3, desc: 'Just you. Three more points to spend, and everyone you meet is someone you earned.' },
  { n: 1, name: 'One other', pts: 1, desc: 'Somebody you found on the road. One more point.' },
  { n: 2, name: 'Two others', pts: 0, desc: 'A small group from the first morning.' },
];
export const DEAD = {
  fewer: { name: 'Fewer', mult: 0.65, desc: 'The roads are quieter. Room to breathe.' },
  normal: { name: 'As many as there are', mult: 1, desc: 'The county as it is.' },
  more: { name: 'More', mult: 1.4, desc: 'They\u2019re everywhere, and thicker after dark.' },
};

// who you were before: a head start on two or three stats, a camp role,
// and what you walked out with
export const LEADER_BGS = [
  { id: 'deputy', name: 'Sheriff\u2019s deputy', role: 'guard', bonus: { shoot: 2, charm: 1 }, kit: { gun: '1911', ammo: 16 }, desc: 'Knows a pistol and how to talk a room down.' },
  { id: 'hunter', name: 'Deer hunter', role: 'hunter', bonus: { shoot: 1, endure: 1, scav: 1 }, kit: { gun: 'scout', ammo: 5 }, desc: 'Patient and quiet, with a good eye. Carries a light bolt-action rifle.' },
  { id: 'medic', name: 'Paramedic', role: 'medic', bonus: { endure: 1, charm: 1 }, kit: { res: { meds: 4 } }, skills: { medicine: 3 }, desc: 'Meds go further in your hands, and you walked out with a bag of them.' },
  { id: 'mechanic', name: 'Mechanic', role: 'mechanic', bonus: { fight: 1, endure: 1 }, kit: { res: { metal: 5, fuel: 2 } }, skills: { mechanics: 3, building: 2 }, desc: 'Strong hands. Building costs you less.' },
  { id: 'farmer', name: 'Farmer', role: 'farmer', bonus: { endure: 2 }, kit: { res: { food: 5 }, item: 'seeds' }, skills: { farming: 3 }, desc: 'Long days are nothing new. You brought seed and something to eat.' },
  { id: 'bouncer', name: 'Bar bouncer', role: 'guard', bonus: { fight: 3 }, kit: {}, desc: 'Nobody gets past you up close.' },
  { id: 'pastor', name: 'Pastor', role: 'counselor', bonus: { charm: 3 }, kit: { res: { food: 2 } }, desc: 'People listen when you talk. Strangers come round sooner.' },
  { id: 'drifter', name: 'Drifter', role: 'scavenger', bonus: { scav: 2, endure: 1 }, kit: { pack: 6 }, desc: 'Years out of a backpack. A bigger pack, and you find what others miss.' },
  { id: 'veteran', name: 'Army veteran', role: 'guard', bonus: { fight: 1, shoot: 2, charm: -1 }, kit: { gun: 'm4', ammo: 30 }, desc: 'Came home with a rifle. Some days you\u2019re hard to be around.' },
];
export const BG_BY_ID = Object.fromEntries(LEADER_BGS.map((b) => [b.id, b]));

// cost > 0: a strength you pay for; cost < 0: a weakness that pays you.
// legacy: from before stats (an older save's leader may still have them)
export const TRAITS = [
  { id: 'quiet', name: 'Light on your feet', cost: 2, desc: 'You make 40% less noise.', not: ['clumsy'] },
  { id: 'handy', name: 'Handy', cost: 2, desc: 'Building costs a quarter less.', not: ['badback'] },
  { id: 'inspiring', name: 'Inspiring', cost: 2, desc: 'Your people tire 15% slower out there.' },
  { id: 'medic', name: 'Field medic', cost: 1, desc: 'Food and meds heal 50% more.', not: ['slowheal'] },
  { id: 'nightowl', name: 'Night owl', cost: 1, desc: 'The dead spot you less easily after dark.' },
  { id: 'prepper', name: 'Prepper', cost: 1, desc: 'Start with extra food, meds and materials.' },
  { id: 'packrat', name: 'Packrat', cost: 1, desc: 'You carry 6 more.' },
  { id: 'gunnut', name: 'Gun nut', cost: 1, desc: 'Reload 25% faster, and start with a spare box for your gun.' },
  { id: 'clumsy', name: 'Clumsy', cost: -2, desc: 'You make 60% more noise.', not: ['quiet'] },
  { id: 'lonewolf', name: 'Lone wolf', cost: -2, desc: 'Strangers don\u2019t warm to your people: recruiting is harder.' },
  { id: 'insomniac', name: 'Insomniac', cost: -1, desc: 'You shake off fatigue 30% slower.' },
  { id: 'slowheal', name: 'Slow healer', cost: -1, desc: 'Food and meds heal 40% less.', not: ['medic'] },
  { id: 'smoker', name: 'Smoker', cost: -1, desc: 'Stamina comes back 30% slower.' },
  { id: 'badback', name: 'Bad back', cost: -2, desc: 'Building costs a quarter more.', not: ['handy'] },
  { id: 'athletic', name: 'Athletic', cost: 3, legacy: true, desc: 'More stamina, and you sprint faster.' },
  { id: 'tough', name: 'Tough', cost: 3, legacy: true, desc: '+30 health.' },
  { id: 'slugger', name: 'Slugger', cost: 2, legacy: true, desc: 'Swings hit harder.' },
  { id: 'marksman', name: 'Marksman', cost: 2, legacy: true, desc: 'Steadier aim.' },
  { id: 'scavenger', name: 'Scavenger', cost: 2, legacy: true, desc: 'Search faster.' },
  { id: 'outofshape', name: 'Out of shape', cost: -2, legacy: true, desc: 'Less stamina.' },
  { id: 'frail', name: 'Frail', cost: -3, legacy: true, desc: '-30 health.' },
  { id: 'slowhands', name: 'Slow hands', cost: -1, legacy: true, desc: 'Swings take longer.' },
  { id: 'badeyes', name: 'Poor eyesight', cost: -1, legacy: true, desc: 'Shots stray wider.' },
  { id: 'unlucky', name: 'Unlucky', cost: -2, legacy: true, desc: 'Containers turn up less.' },
];
const BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));
export const traitName = (id) => (BY_ID[id] ? BY_ID[id].name : id);

// a background's starting stats (4 each, plus its head start)
export function baseStats(bgId) {
  const st = Object.fromEntries(STAT_IDS.map((k) => [k, 4]));
  const bg = BG_BY_ID[bgId];
  if (bg) for (const [k, v] of Object.entries(bg.bonus)) st[k] += v;
  return st;
}
export const STAT_MIN = 1, STAT_CAP = 9;
// points left: the pool, plus what going it alone pays, minus stats raised
// past the background's and strengths taken (weaknesses pay back)
export function pointsLeft(p) {
  if (Array.isArray(p)) p = { traits: p };
  let pts = POOL + (COMPANIONS.find((c) => c.n === (p.companions ?? 2)) || COMPANIONS[2]).pts;
  if (p.stats) { const base = baseStats(p.background); for (const k of STAT_IDS) pts -= (p.stats[k] ?? base[k]) - base[k]; }
  for (const id of p.traits || []) pts -= (BY_ID[id] || { cost: 0 }).cost;
  return pts;
}

// Numbers the rest of the game reads (the leader's traits).
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
    reload: has('gunnut') ? 0.75 : 1,
    rest: has('insomniac') ? 0.7 : 1,
  };
}

export const SPAWNS = [
  { id: 'crossing', name: "Carver's Crossing", at: [-460, 30], risk: 'Medium', desc: 'A crossroads hamlet halfway between the farms and town: a store, a few houses and the co-op elevator.' },
  { id: 'hollis', name: 'Hollis Farm', at: [W(-174), -110], risk: 'Low', desc: 'A quiet farmhouse with a barn and machine shed, far out in the farm country.' },
  { id: 'price', name: 'Price Farm', at: [W(-56), -122], risk: 'Low', desc: 'A small cottage at the end of a gravel lane, by the woods.' },
  { id: 'church', name: 'Bethel Church', at: [W(-118), 44], risk: 'Low', desc: 'A country church on the highway with room around it to build.' },
  { id: 'highway', name: 'Highway 34, by the Gas & Go', at: [14, 2], risk: 'High', desc: 'The highway just outside town. Close to supplies, close to trouble.' },
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
    traits: [], spawn: 'crossing', autoName: true,
    background: 'deputy', stats: baseStats('deputy'), companions: 2, world: { supplies: 'scarce', dead: 'normal' },
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

  // the step header: where you are in the four
  steps(n) {
    const names = this.keepPlace ? ['Who you are', 'Strengths'] : ['Who you are', 'Group & world', 'Strengths', 'Where to start'];
    const at = this.keepPlace ? (n === 3 ? 1 : 0) : n - 1;
    return `<div class="su-steps">${names.map((x, k) => `<span class="${k === at ? 'on' : k < at ? 'done' : ''}"><i>${k + 1}</i>${x}</span>`).join('')}</div>`;
  }
  pointsBar() {
    const pts = pointsLeft(this.profile);
    return `<div class="su-points ${pts < 0 ? 'neg' : ''}"><b>${pts}</b> point${pts === 1 ? '' : 's'} left</div>`;
  }

  // ---- step 1: who you are ----
  renderCreate() {
    const p = this.profile;
    const sw = (list, key) => list.map((c) => `<button class="swb ${p[key] === c ? 'on' : ''}" data-k="${key}" data-v="${c}" style="--c:${c}" aria-label="${key} colour ${c}"></button>`).join('');
    const bonus = (b) => Object.entries(b.bonus).map(([k, v]) => `<i class="${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v} ${STATS.find((x) => x.id === k).name}</i>`).join('');
    const kit = (b) => [b.kit.gun ? `${GUNS[b.kit.gun].name} + ${b.kit.ammo} rounds` : '', b.kit.res ? Object.entries(b.kit.res).map(([k, n]) => `${n} ${k}`).join(', ') : '', b.kit.item ? 'seeds' : '', b.kit.pack ? 'bigger pack' : ''].filter(Boolean).join(', ') || 'just a bat';
    this.el.innerHTML = `
      <div class="panel setup-panel">
        ${this.steps(1)}
        <h2>NEW SURVIVOR</h2>
        <p class="sub">Who walks out into Bridger County, and who were they before?</p>
        <div class="setup-grid">
          <div class="setup-look">
            <div class="su-prev" id="su-prev-slot"></div>
            <label class="su-name">Name <input id="su-name" maxlength="28" value="${escapeHtml(p.name)}"></label>
            <div class="su-row"><span>Body</span><button class="chipbtn ${p.model === 'man' ? 'on' : ''}" data-model="man">Man</button><button class="chipbtn ${p.model === 'woman' ? 'on' : ''}" data-model="woman">Woman</button><button class="chipbtn" id="su-rand">Random</button></div>
            <div class="su-row"><span>Skin</span>${sw(SKINS, 'skin')}</div>
            <div class="su-row"><span>Hair</span>${sw(HAIRS, 'hair')}</div>
            <div class="su-row"><span>Shirt</span>${sw(SHIRTS, 'shirt')}</div>
            <div class="su-row"><span>Pants</span>${sw(PANTS, 'pants')}</div>
          </div>
          <div class="setup-traits">
            <h3>Before all this</h3>
            <div class="bg-grid">${LEADER_BGS.map((b) => `<button class="bg-card ${p.background === b.id ? 'on' : ''}" data-bg="${b.id}" aria-pressed="${p.background === b.id}">
              <span class="bn">${b.name}</span><span class="bb">${bonus(b)}</span><span class="bd">${b.desc}</span><span class="bk">Carrying: ${kit(b)}</span></button>`).join('')}</div>
          </div>
        </div>
        <div class="setup-actions">
          <span class="note"></span>
          <button class="primary" id="su-next">${this.keepPlace ? 'Your strengths' : 'Your group'}</button>
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
    for (const b of this.el.querySelectorAll('[data-bg]')) b.addEventListener('click', () => {
      // keep what you'd already moved around, on the new background's base
      const was = baseStats(p.background), now = baseStats(b.dataset.bg);
      p.stats = Object.fromEntries(STAT_IDS.map((k) => [k, Math.max(STAT_MIN, Math.min(STAT_CAP, now[k] + ((p.stats[k] ?? was[k]) - was[k])))]));
      p.background = b.dataset.bg;
      const keep = this.el.querySelector('.setup-traits').scrollTop;
      this.renderCreate();
      this.el.querySelector('.setup-traits').scrollTop = keep;
    });
    $('su-rand').addEventListener('click', () => { const r = randomProfile(); Object.assign(p, { name: r.name, model: r.model, skin: r.skin, hair: r.hair, shirt: r.shirt, pants: r.pants, autoName: true }); this.renderCreate(); });
    $('su-next').addEventListener('click', () => (this.keepPlace ? this.renderStrengths() : this.renderGroup()));
    if (!this.prevCanvas) {
      this.prevCanvas = document.createElement('canvas');
      this.prevCanvas.width = 260; this.prevCanvas.height = 320;
      this.prevCanvas.setAttribute('aria-label', 'Preview of your survivor');
    }
    $('su-prev-slot').appendChild(this.prevCanvas);
    this.preview(this.prevCanvas);
  }

  // ---- step 2: your group, and how hard the county is ----
  renderGroup() {
    const p = this.profile, w = p.world || (p.world = { supplies: 'scarce', dead: 'normal' });
    const card = (on, attr, val, name, desc, extra = '') => `<button class="opt-card ${on ? 'on' : ''}" data-${attr}="${val}" aria-pressed="${on}"><span class="on-n">${name}${extra}</span><span class="on-d">${desc}</span></button>`;
    this.el.innerHTML = `
      <div class="panel setup-panel">
        ${this.steps(2)}
        <h2>YOUR GROUP &amp; THE COUNTY</h2>
        <p class="sub">Who\u2019s with you, and how hard it\u2019s going to be.</p>
        <div class="opt-section"><h3>Who\u2019s with you</h3><div class="opt-grid">${COMPANIONS.map((c) => card((p.companions ?? 2) === c.n, 'comp', c.n, c.name, c.desc, c.pts ? ` <i class="pts">+${c.pts} pts</i>` : '')).join('')}</div></div>
        <div class="opt-section"><h3>Supplies</h3><div class="opt-grid">${Object.entries(SCARCITY).map(([k, v]) => card(w.supplies === k, 'sup', k, v.name + (k === 'scarce' ? ' <i class="pts">usual</i>' : ''), v.desc)).join('')}</div></div>
        <div class="opt-section"><h3>The dead</h3><div class="opt-grid">${Object.entries(DEAD).map(([k, v]) => card(w.dead === k, 'dead', k, v.name, v.desc)).join('')}</div></div>
        <div class="setup-actions">
          <button id="su-back">Back</button>
          <button class="primary" id="su-next">Your strengths</button>
        </div>
      </div>`;
    const $ = (id) => this.el.querySelector('#' + id);
    for (const b of this.el.querySelectorAll('[data-comp]')) b.addEventListener('click', () => { p.companions = +b.dataset.comp; this.renderGroup(); });
    for (const b of this.el.querySelectorAll('[data-sup]')) b.addEventListener('click', () => { w.supplies = b.dataset.sup; this.renderGroup(); });
    for (const b of this.el.querySelectorAll('[data-dead]')) b.addEventListener('click', () => { w.dead = b.dataset.dead; this.renderGroup(); });
    $('su-back').addEventListener('click', () => this.renderCreate());
    $('su-next').addEventListener('click', () => this.renderStrengths());
  }

  // ---- step 3: strengths: the pentagon and traits, from one pool ----
  renderStrengths() {
    const p = this.profile, base = baseStats(p.background), pts = pointsLeft(p);
    const tr = (t) => {
      const on = p.traits.includes(t.id);
      const blocked = !on && (t.not || []).some((x) => p.traits.includes(x));
      return `<button class="trait ${on ? 'on' : ''} ${t.cost < 0 ? 'neg' : 'pos'}" data-t="${t.id}" ${blocked ? 'disabled' : ''} aria-pressed="${on}">
        <span class="tn">${t.name}</span><span class="tc">${t.cost > 0 ? '\u2212' + t.cost : '+' + -t.cost}</span><span class="td">${t.desc}</span></button>`;
    };
    const row = (st) => {
      const v = p.stats[st.id], b = base[st.id];
      return `<div class="alloc"><span class="an">${st.name}${v !== b ? ` <i>${v > b ? '+' : ''}${v - b}</i>` : ''}</span>
        <button class="chipbtn" data-dec="${st.id}" ${v <= STAT_MIN ? 'disabled' : ''} aria-label="Lower ${st.name}">\u2212</button><b>${v}</b><button class="chipbtn" data-inc="${st.id}" ${v >= STAT_CAP || pts <= 0 ? 'disabled' : ''} aria-label="Raise ${st.name}">+</button>
        <span class="ad">${st.desc}</span></div>`;
    };
    const traits = TRAITS.filter((t) => !t.legacy);
    this.el.innerHTML = `
      <div class="panel setup-panel">
        ${this.steps(3)}
        <h2>YOUR STRENGTHS</h2>
        <p class="sub">${escapeHtml(BG_BY_ID[p.background] ? BG_BY_ID[p.background].name : '')}. Raise what you\u2019re good at, lower what you\u2019re not. Strengths cost points; weaknesses give them back.</p>
        <div class="setup-grid strengths">
          <div class="setup-look">
            <div class="su-radar">${radarSVG(p.stats, { size: 250, compare: base })}</div>
            ${this.pointsBar()}
            <div class="allocs">${STATS.map(row).join('')}</div>
            <p class="note">Dashed: where your background puts you. Stats grow as you use them.</p>
          </div>
          <div class="setup-traits">
            <h3>Strengths</h3>
            <div class="traits">${traits.filter((t) => t.cost > 0).map(tr).join('')}</div>
            <h3>Weaknesses</h3>
            <div class="traits">${traits.filter((t) => t.cost < 0).map(tr).join('')}</div>
          </div>
        </div>
        <div class="setup-actions">
          <button id="su-back">Back</button>
          <span class="note" id="su-why">${pts < 0 ? 'Lower a stat, drop a strength or take a weakness to balance your points.' : ''}</span>
          <button class="primary" id="su-next" ${pts < 0 ? 'disabled' : ''}>${this.keepPlace ? 'Back to your game' : 'Choose where to start'}</button>
        </div>
      </div>`;
    const $ = (id) => this.el.querySelector('#' + id);
    const again = () => { const keep = this.el.querySelector('.setup-traits').scrollTop; this.renderStrengths(); this.el.querySelector('.setup-traits').scrollTop = keep; };
    for (const b of this.el.querySelectorAll('[data-inc]')) b.addEventListener('click', () => { const k = b.dataset.inc; if (pointsLeft(p) > 0 && p.stats[k] < STAT_CAP) { p.stats[k]++; again(); } });
    for (const b of this.el.querySelectorAll('[data-dec]')) b.addEventListener('click', () => { const k = b.dataset.dec; if (p.stats[k] > STAT_MIN) { p.stats[k]--; again(); } });
    for (const b of this.el.querySelectorAll('[data-t]')) b.addEventListener('click', () => {
      const id = b.dataset.t;
      p.traits = p.traits.includes(id) ? p.traits.filter((x) => x !== id) : [...p.traits, id];
      again();
    });
    $('su-back').addEventListener('click', () => (this.keepPlace ? this.renderCreate() : this.renderGroup()));
    $('su-next').addEventListener('click', () => { if (pointsLeft(p) < 0) return; if (this.keepPlace) this.finish(); else this.renderSpawn(); });
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
        ${this.steps(4)}
        <h2>WHERE TO START</h2>
        <p class="sub">${escapeHtml(p.name || 'Your survivor')} · ${escapeHtml(BG_BY_ID[p.background] ? BG_BY_ID[p.background].name : '')} · ${(COMPANIONS.find((c) => c.n === (p.companions ?? 2)) || COMPANIONS[2]).name.toLowerCase()} · ${(SCARCITY[(p.world || {}).supplies] || SCARCITY.scarce).name.toLowerCase()} supplies${p.traits.length ? ' · ' + p.traits.map((t) => BY_ID[t].name).join(', ') : ''}</p>
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
    $('sp-back').addEventListener('click', () => this.renderStrengths());
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
