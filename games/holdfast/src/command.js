// The top view: your whole group from above, hands off. Everyone gets on
// with their own day; from here you look in on anyone, anywhere, send people
// places and on jobs (fetch a cache, scavenge a building, raid a crew, a
// supply run), call them home to rest or get patched up, point them at a
// fight and watch it play out, or take control of one of them and play.
// Drag to pan, pinch to zoom, twist to turn; mouse, wheel and WASD on a
// desktop.
import * as THREE from 'three';
import { NavGrid } from './npc/nav.js';
import { STORY } from './building/defs.js';
import { CLAIM_HALF } from './claims.js';
import { GUNS } from './items.js';
import { fatigueWord, exhausted, injuryList } from './condition.js';
import { ROLES } from './npc/people.js';
import { isTouch } from './platform.js';

const v = new THREE.Vector3();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class CommandView {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.cam = { x: 0, y: 0, z: 0, dist: 34, yaw: 0, pitch: 0.95, follow: true };
    this.sel = new Set();
    this.ptrs = new Map();
    this.buildUI();
    this.bind();
    this.rings = [];
  }
  get soc() { return this.game.society; }
  people() { return this.soc ? this.soc.camp.members.filter((m) => !m.dead) : []; }

  // ---------------- on / off ----------------
  toggle(on) {
    on = on == null ? !this.active : on;
    if (on === this.active) return;
    if (on) this.enter(); else this.exit();
  }
  enter() {
    const g = this.game;
    this.active = true;
    g.input.wantLock = false; g.input.exitLock(); g.input.keys.clear();
    g.input.touch.move.x = 0; g.input.touch.move.y = 0; g.input.touch.active = false;
    const p = g.player.pos;
    Object.assign(this.cam, { x: p.x, y: p.y, z: p.z, yaw: g.tpc.yaw, follow: true });
    this.focusOn = g.player.body || null;
    this.sel = new Set(g.player.body ? [g.player.body] : []);
    this.releaseBody();
    this.camInit = false;
    document.getElementById('ui').classList.add('cmd-mode');
    g.hud.setPrompt(null);
    this.el.hidden = false;
    this.render(true);
    if (!this.hinted) { this.hinted = true; this.hint(isTouch ? 'Everyone carries on by themselves. Tap people to pick them, tap the ground to send them.' : 'Everyone carries on by themselves. Click people to pick them, click the ground to send them.', 6); }
  }
  // the one you were playing carries on by themselves
  releaseBody() {
    const g = this.game, pl = g.player, b = pl.body;
    if (!b || pl.released) return;
    b.controlled = false;
    b.facing = pl.facing; b.visualY = pl.visualY; b.stamina = pl.stamina; b.vel.set(0, 0, 0);
    const home = g.claims.list[0];
    const inCamp = home && g.claims.at(b.pos.x, b.pos.z) === home;
    if (b.mode === 'controlled') { b.mode = inCamp ? 'camp' : 'wait'; b.waitAt = { x: b.pos.x, y: b.pos.y, z: b.pos.z }; }
    b.task = null;
    pl.released = true;
    pl.weaponMesh.visible = false;
  }
  exit(to = null) {
    const g = this.game;
    to = to || g.player.body;
    if (to && (to.dead || to.downed)) to = this.people().find((m) => m.leader && !m.downed) || this.people().find((m) => !m.downed);
    this.active = false;
    g.input.wantLock = !g.quality.mobile;
    document.getElementById('ui').classList.remove('cmd-mode');
    this.el.hidden = true;
    this.closeMenu();
    this.setPlantMode(false);
    this.pickMode = null;
    if (this.cutS) { this.cutS.setCutaway(null); this.cutS = null; }
    if (g.world.trees) g.world.trees.setHidden(null);
    if (g.world.grass) for (const m of g.world.grass.meshes) m.visible = true;
    for (const r of this.rings) r.visible = false;
    for (const t of this.tags || []) t.el.hidden = true;
    g.tpc.yaw = this.cam.yaw;
    g.camera.fov = 62; g.camera.updateProjectionMatrix();
    g.hud.setPrompt(null);
    if (to) {
      const pl = g.player;
      if (pl.released && pl.body === to) { pl.released = false; pl.body = null; }
      pl.released = false;
      if (pl.body !== to) { const was = pl.body; pl.body = was && was.controlled ? was : null; }
      g.switchTo(to, true);
      this.hint(`You're ${to.person.name}.`, 2);
    }
  }
  sync() {
    const g = this.game;
    const show = this.active && !g.buildMode.active && !g.setupOpen && !(g.society && g.society.ui.talking);
    if (this.el.hidden === show) this.el.hidden = !show;
  }
  hint(text, secs = 3) { this.game.hud.toast(text, secs); }

  // ---------------- UI ----------------
  buildUI() {
    const el = this.el = document.createElement('div');
    el.className = 'cmd-ui';
    el.hidden = true;
    el.innerHTML = `
      <div class="cmd-roster" id="cmd-roster"></div>
      <div class="cmd-info" id="cmd-info"></div>
      <div class="cmd-acts">
        <button data-a="play" class="primary">Play</button><button data-a="claim">Claim</button>
        <button data-a="build">Build</button><button data-a="camp">Camp</button>
        <button data-a="map">Map</button><button data-a="pack">Storage</button>
      </div>
      <div class="cmd-tags" id="cmd-tags"></div>
      <div class="cmd-menu" id="cmd-menu" hidden></div>
      <div class="cmd-plant" id="cmd-plant" hidden><span id="cmd-plant-text">Tap where your camp should go.</span><button id="cmd-plant-ok" class="primary" hidden>Plant here</button><button id="cmd-plant-x">Cancel</button></div>`;
    document.getElementById('ui').appendChild(el);
    this.$ = (id) => el.querySelector('#' + id);
    for (const b of el.querySelectorAll('[data-a]')) b.addEventListener('click', (e) => { e.stopPropagation(); this.action(b.dataset.a); });
    this.$('cmd-plant-x').addEventListener('click', () => { this.setPlantMode(false); this.pickMode = null; });
    this.$('cmd-plant-ok').addEventListener('click', () => this.confirmPlant());
    this.$('cmd-roster').addEventListener('click', (e) => {
      const c = e.target.closest('[data-id]');
      if (!c) return;
      e.stopPropagation();
      const m = this.people().find((x) => x.person.id === c.dataset.id);
      if (!m) return;
      // tap: pick them (tap again to look at them); hold the team with the + button
      if (c.dataset.add) { if (this.sel.has(m)) this.sel.delete(m); else this.sel.add(m); }
      else if (this.sel.size === 1 && this.sel.has(m)) { this.focusOn = m; this.cam.follow = true; }
      else { this.sel = new Set([m]); this.focusOn = m; this.cam.follow = true; }
      this.render(true);
    });
    this.$('cmd-info').addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (b) { e.stopPropagation(); this.order(b.dataset.o); } });
  }
  action(a) {
    const g = this.game, inp = g.input;
    this.closeMenu();
    if (a === 'play') {
      const one = [...this.sel][0];
      const to = this.sel.size === 1 && !one.downed && one.mode !== 'away' ? one : g.player.body;
      if (to && to !== g.player.body && exhausted(to)) { this.hint(`${to.first} is exhausted. Let them sleep.`, 2.5); return; }
      this.exit(to);
    } else if (a === 'claim') this.setPlantMode(!this.planting);
    else if (a === 'build') g.openBuild();
    else if (a === 'camp') inp.pressedSet.add('KeyJ');
    else if (a === 'map') inp.pressedSet.add('KeyM');
    else if (a === 'pack') g.packScreen.toggle(true);
  }
  status(m) {
    const g = this.game;
    if (m.downed) return 'Down! Needs help';
    if (m === g.player.body && !g.player.released) return 'You';
    if (m.mode === 'mission') return this.soc.jobs.status(m);
    if (m.mode === 'wait') return m.path ? 'On the way' : m.combatTarget ? 'Fighting' : 'Holding';
    if (m.mode === 'follow') return m.combatTarget ? 'Fighting' : 'Tagging along';
    if (m.restOrder && m.mode === 'travel') return 'Going home to rest';
    return this.soc.camp.activity(m);
  }
  render(force) {
    const g = this.game;
    const ppl = this.people();
    for (const m of [...this.sel]) if (!ppl.includes(m)) this.sel.delete(m);
    const card = (m) => {
      const hp = Math.max(0, m.health / (m.baseHealth || 100)) * 100, lost = Math.max(0, (m.baseHealth || 100) - m.maxHealth);
      const f = m.fatigue || 0;
      return `<div class="cmd-card ${this.sel.has(m) ? 'on' : ''} ${m.downed ? 'down' : ''}" data-id="${m.person.id}">
        <b>${esc(m.first)}${m.leader ? ' <i class="lead">★</i>' : ''}</b>
        <span class="hbar"><span class="fill hp" style="width:${hp.toFixed(0)}%"></span><span class="lost" style="width:${lost.toFixed(0)}%"></span></span>
        <span class="fat ${f >= 100 ? 'bad' : f > 60 ? 'warn' : ''}" style="--f:${f.toFixed(0)}%"></span>
        <small>${esc(this.status(m))}</small>
        <button class="add" data-id="${m.person.id}" data-add="1" aria-label="Add to team">${this.sel.has(m) ? '−' : '+'}</button></div>`;
    };
    const key = ppl.map((m) => m.person.id + (this.sel.has(m) ? '*' : '') + Math.round(m.health / 5) + Math.round(m.fatigue / 10) + this.status(m)).join('|');
    if (force || key !== this.rKey) {
      this.rKey = key;
      this.$('cmd-roster').innerHTML = ppl.map(card).join('');
      this.renderInfo();
    }
  }
  renderInfo() {
    const g = this.game, sel = [...this.sel];
    const info = this.$('cmd-info');
    if (!sel.length) { info.innerHTML = `<p class="cmd-hint">${isTouch ? 'Tap' : 'Click'} someone to give orders, or ${isTouch ? 'tap' : 'click'} Play to carry on.</p>`; return; }
    const one = sel.length === 1 ? sel[0] : null;
    let h = '<button class="ci-x" data-o="clear" aria-label="Done">\u00d7</button>';
    if (one) {
      const gun = one.gear.gun ? GUNS[one.gear.gun.id] : null;
      const inj = injuryList(one);
      h += `<div class="ci-head"><b>${esc(one.person.name)}</b><span>${esc(ROLES[one.role] ? ROLES[one.role].name : '')} · ${fatigueWord(one.fatigue)}${inj.length ? ' · ' + esc(inj.join(', ')) : ''}</span>
        <span>${gun ? esc(gun.name) + ` ${one.gear.gun.mag}/${gun.mag}` : 'Bat'} · carrying ${one.pack.weight().toFixed(0)}/${one.pack.cap}</span></div>`;
    } else h += `<div class="ci-head"><b>${sel.length} people</b><span>${esc(sel.map((m) => m.first).join(', '))}</span></div>`;
    const can = (m) => !m.downed && m.mode !== 'away' && !m.dead;
    const ok = sel.filter(can);
    const btn = (o, label, on = true, cls = '') => `<button data-o="${o}" class="${cls}" ${on ? '' : 'disabled'}>${label}</button>`;
    h += '<div class="ci-acts">';
    if (one) h += btn('play', one === g.player.body ? 'Play as them' : 'Take control', can(one) && (!exhausted(one) || one === g.player.body), 'primary');
    h += btn('job', 'Send on a job…', ok.length > 0 && ok.some((m) => !exhausted(m)));
    h += btn('home', 'Go home', !!g.claims.list.length && ok.length > 0);
    h += btn('rest', 'Rest', !!g.claims.list.length && ok.length > 0);
    h += btn('heal', 'Get patched up', !!g.claims.list.length && ok.some((m) => m.injuries.length || m.health < m.maxHealth));
    h += btn('hold', 'Hold here', ok.length > 0);
    h += `</div><p class="cmd-hint">${isTouch ? 'Tap the ground to send them there. Tap the dead or raiders to fight.' : 'Click the ground to send them there. Click the dead or raiders to fight.'}</p>`;
    info.innerHTML = h;
  }
  order(o) {
    const g = this.game, soc = this.soc;
    const sel = [...this.sel].filter((m) => !m.dead && !m.downed && m.mode !== 'away');
    const say = (m, lines) => { if (Math.random() < 0.7) m.say(lines[Math.floor(Math.random() * lines.length)]); };
    if (o === 'clear') { this.sel.clear(); this.render(true); return; }
    if (o === 'play') return this.action('play');
    if (o === 'job') return this.jobMenu(sel);
    for (const m of sel) {
      if (m.job) soc.jobs.cancel(m);
      m.orderTarget = null; m.restOrder = false; m.healOrder = false;
      if (o === 'home' || o === 'rest' || o === 'heal') {
        m.mode = 'travel'; m.task = null; m.setAct(null);
        if (o === 'rest') m.restOrder = true;
        if (o === 'heal') m.healOrder = true;
        say(m, o === 'rest' ? ['I could sleep for a week.', 'Thank God.', 'Heading back.'] : ['Heading home.', 'Back to camp.']);
      } else if (o === 'hold') {
        m.mode = 'wait'; m.waitAt = { x: m.pos.x, y: m.pos.y, z: m.pos.z }; m.stop();
        say(m, ['Holding.', 'Here? Okay.', 'Staying put.']);
      }
    }
    this.render(true);
  }
  // jobs the team could go do
  jobMenu(team) {
    const soc = this.soc, opts = [];
    for (const ms of soc.missions.active) {
      if (ms.kind === 'cache' && ms.at) opts.push([`Fetch: ${ms.title}`, () => this.sendJob(team, 'cache', { mission: ms.id, where: ms.title, title: `Fetching ${ms.title.replace(/^[A-Z]/, (c) => c.toLowerCase())}`, focus: ms.at })]);
    }
    for (const c of soc.raiders.active) if (c.known && !c.stashLooted) opts.push([`Raid ${c.name} (${soc.jobs.raidOdds(team, c).word})`, () => this.sendJob(team, 'raid', { camp: c.id, where: c.name, title: `Raiding ${c.name}`, focus: c })]);
    opts.push(['Scavenge a building…', () => { this.pickMode = { kind: 'scavenge', team }; this.showPick('Tap a building to scavenge.'); }]);
    opts.push(['Go somewhere and hold…', () => { this.pickMode = { kind: 'goto', team }; this.showPick('Tap where they should go.'); }]);
    opts.push(['Supply run (a few hours)', () => this.sendJob(team, 'run', {})]);
    const r = this.$('cmd-info').getBoundingClientRect();
    this.openMenu(r.left + r.width / 2, r.top, `Send ${team.length > 1 ? team.length + ' people' : team[0].first}`, opts);
  }
  sendJob(team, kind, opts) {
    const job = this.soc.jobs.send(team, kind, opts);
    if (!job) { this.hint('Nobody here can go right now.', 2); return; }
    if (opts.focus) { this.cam.follow = false; this.cam.x = opts.focus.x; this.cam.z = opts.focus.z; }
    this.render(true);
  }
  showPick(text) {
    this.$('cmd-plant').hidden = false;
    this.$('cmd-plant-text').textContent = text;
    this.$('cmd-plant-ok').hidden = true;
  }

  // ---------------- picking ----------------
  ray(sx, sy) {
    const cam = this.game.camera;
    v.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1, 0.5).unproject(cam);
    const d = v.clone().sub(cam.position).normalize();
    return { o: cam.position.clone(), d };
  }
  groundAt(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    const cutY = this.cutS ? this.cutS.oy + (this.cutL + 1) * STORY - 0.2 : Infinity;
    const hit = this.game.physics.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 600, { skipGlass: true,
      filter: (b) => b.kind !== 'roof' && b.kind !== 'tree' && b.kind !== 'glass' && b.kind !== 'door' && b.min[1] < cutY });
    if (hit.dist >= 599) return null;
    const x = o.x + d.x * hit.dist, z = o.z + d.z * hit.dist, hy = o.y + d.y * hit.dist;
    const ph = this.game.physics;
    let y = ph.groundAt(x, z, hy + 0.3);
    const ref = this.cam.y;
    if (y > ref + 2.2) { const same = ph.groundAt(x, z, ref + 1.7); if (same > ph.terrain.height(x, z) - 1.5) y = same; }
    return { x, y, z, box: hit.box };
  }
  project(x, y, z) {
    v.set(x, y, z).project(this.game.camera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }
  pickUnit(sx, sy) {
    const g = this.game, s = g.society;
    const r = isTouch ? 34 : 24;
    let best = null, bd = r;
    const consider = (u, kind, x, y, z) => {
      const p = this.project(x, y + 0.9, z);
      if (!p) return;
      const d = Math.hypot(p[0] - sx, p[1] - sy);
      if (d < bd) { bd = d; best = { u, kind }; }
    };
    if (s) for (const n of s.npcs) if (!n.dead && n.char.root.visible) consider(n, n.faction, n.pos.x, n.anim.lie ? n.anim.lieY - 0.6 : n.pos.y, n.pos.z);
    for (const z of g.zombies.list) if (!z.dead) consider(z, 'zombie', z.pos.x, z.pos.y, z.pos.z);
    return best;
  }
  structureAt(p) {
    for (const S of this.game.world.structures) {
      const b = S._bb || (S._bb = S.bounds());
      if (b && p.x > b.wx0 - 0.5 && p.x < b.wx1 + 0.5 && p.z > b.wz0 - 0.5 && p.z < b.wz1 + 0.5 && S.interact.length) return S;
    }
    return null;
  }

  // ---------------- input ----------------
  bind() {
    const cv = this.game.renderer.domElement;
    const P = this.ptrs;
    const busy = () => !this.active || this.game.buildMode.active || this.game.modalOpen || (this.game.society && this.game.society.ui.talking);
    cv.addEventListener('pointerdown', (e) => {
      if (busy()) return;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      P.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, moved: false });
      if (P.size === 2) { this.gesture = this.twoFinger(); this.panFrom = null; }
      else if (e.button === 0) this.panFrom = true;
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = P.get(e.pointerId);
      if (!this.active || !p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > (e.pointerType === 'touch' ? 10 : 6)) p.moved = true;
      if (P.size === 2) {
        const gnow = this.twoFinger();
        if (this.gesture) {
          this.cam.dist = Math.max(12, Math.min(260, this.cam.dist * this.gesture.d / gnow.d));
          let da = gnow.a - this.gesture.a;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          this.cam.yaw -= da;
        }
        this.gesture = gnow;
        return;
      }
      if (p.button === 2) { this.cam.yaw -= dx * 0.006; this.cam.pitch = Math.max(0.55, Math.min(1.4, this.cam.pitch + dy * 0.004)); return; }
      if (p.moved && this.panFrom) {
        const was = this.planePoint(e.clientX - dx, e.clientY - dy), now = this.planePoint(e.clientX, e.clientY);
        if (was && now) { this.cam.x += was.x - now.x; this.cam.z += was.z - now.z; this.cam.follow = false; }
      }
    });
    const up = (e) => {
      const p = P.get(e.pointerId);
      if (!p) return;
      P.delete(e.pointerId);
      if (P.size < 2) this.gesture = null;
      if (busy()) return;
      if (!p.moved && p.button === 0 && performance.now() - p.t < 600 && !this.wasTwo) this.tap(p.sx, p.sy);
      if (P.size === 0) this.wasTwo = false;
      if (P.size === 1) this.wasTwo = true;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { P.delete(e.pointerId); this.gesture = null; });
    cv.addEventListener('wheel', (e) => { if (this.active && !this.game.buildMode.active) this.cam.dist = Math.max(12, Math.min(260, this.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: true });
  }
  twoFinger() {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), a: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  planePoint(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    if (d.y > -0.02) return null;
    const t = (this.cam.y - o.y) / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  // ---------------- taps ----------------
  tap(sx, sy) {
    if (!this.$('cmd-menu').hidden) { this.closeMenu(); return; }
    const soc = this.soc;
    if (this.planting) { const p = this.groundAt(sx, sy); if (p) this.previewPlant(p); return; }
    if (this.pickMode) {
      const p = this.groundAt(sx, sy);
      if (!p) return;
      const pm = this.pickMode;
      if (pm.kind === 'goto') { this.pickMode = null; this.$('cmd-plant').hidden = true; this.sendJob(pm.team, 'goto', { at: p, title: 'Holding a position' }); this.marker(p, 0xf3efe4); return; }
      const S = this.structureAt(p);
      if (!S) { this.hint('Tap a building with something to search.', 2); return; }
      const left = S.interact.filter((it) => !it.searched).length;
      if (!left) { this.hint('That place has been picked clean.', 2); return; }
      this.pickMode = null; this.$('cmd-plant').hidden = true;
      const name = (S.name || 'that building').replace(/ @.*/, '');
      this.sendJob(pm.team, 'scavenge', { structure: S, where: name, title: `Scavenging ${name}` });
      this.marker(p, 0xd9a441);
      return;
    }
    const hit = this.pickUnit(sx, sy);
    if (hit) {
      const { u, kind } = hit;
      // the dead or hostile people: whoever's picked goes for them
      if (kind === 'zombie' || kind === 'raider' || u.angry) {
        const team = [...this.sel].filter((m) => !m.downed && m.mode !== 'away');
        if (!team.length) { this.hint('Pick someone first.', 1.5); return; }
        for (const m of team) { m.orderTarget = u; if (m.mode === 'camp' || m.mode === 'travel') { m.mode = 'wait'; m.waitAt = { x: m.pos.x, y: m.pos.y, z: m.pos.z }; } }
        this.targetMark = u;
        return;
      }
      if (u.faction === 'camp') {
        if (u.downed) {
          // someone close goes to help
          const helper = this.people().filter((m) => m !== u && !m.downed && m.mode !== 'away').sort((a, b) => Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) - Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z))[0];
          if (helper) { helper.rescue = u; helper.say(`${u.first}! Coming!`); }
          return;
        }
        if (this.sel.size === 1 && this.sel.has(u)) { this.focusOn = u; this.cam.follow = true; }
        else this.sel = new Set([u]);
        this.render(true);
        return;
      }
      if (u.faction === 'stranger') { this.openMenu(sx, sy, `${u.person.name} · stranger`, [['Play and go talk to them', () => { this.exit(this.game.player.body); this.hint(`Walk over to ${u.first} to talk.`, 3); }]]); return; }
    }
    const p = this.groundAt(sx, sy);
    if (!p) return;
    const team = [...this.sel].filter((m) => !m.downed && m.mode !== 'away');
    if (!team.length) { this.cam.follow = false; this.cam.x = p.x; this.cam.z = p.z; return; }
    this.sendJob(team, 'goto', { at: p, title: 'Holding a position' });
    this.marker(p, 0xf3efe4);
  }
  openMenu(sx, sy, title, opts) {
    const m = this.$('cmd-menu');
    m.innerHTML = `<div class="cmd-menu-t">${esc(title)}</div>` + opts.map((o, i) => `<button data-i="${i}">${esc(o[0])}</button>`).join('');
    m.hidden = false;
    const w = Math.min(260, innerWidth - 16), h = 44 + opts.length * 46;
    m.style.width = w + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, sx - w / 2)) + 'px';
    m.style.top = Math.max(8, Math.min(innerHeight - h - 8, sy - h - 10)) + 'px';
    for (const b of m.querySelectorAll('button')) b.addEventListener('click', (e) => { e.stopPropagation(); this.closeMenu(); opts[+b.dataset.i][1](); });
  }
  closeMenu() { const m = this.$('cmd-menu'); if (m) m.hidden = true; }

  // ---------------- paths (used by survivors' jobs too) ----------------
  plan(a, b) {
    const ph = this.game.physics;
    if (Math.abs(a.y - b.y) < 0.8 && this.clearLine(a, b)) return [{ x: b.x, y: b.y, z: b.z }];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    let tx = b.x, tz = b.z, ty = b.y;
    if (d > 60) { tx = a.x + (b.x - a.x) / d * 55; tz = a.z + (b.z - a.z) / d * 55; ty = ph.groundAt(tx, tz, Math.max(a.y, b.y) + 3); }
    const m = 9;
    const g = new NavGrid(ph, Math.min(a.x, tx) - m, Math.min(a.z, tz) - m, Math.max(a.x, tx) + m, Math.max(a.z, tz) + m);
    const path = g.path(a.x, a.y, a.z, tx, ty, tz);
    if (path && (tx !== b.x || tz !== b.z)) path.push({ x: b.x, y: b.y, z: b.z });
    return path;
  }
  clearLine(a, b) {
    const ph = this.game.physics;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return true;
    for (const h of [0.55, 1.3]) for (const off of [-0.3, 0.3]) {
      const ox = a.x - dz / d * off, oz = a.z + dx / d * off;
      const hit = ph.raycast(ox, a.y + h, oz, dx / d, 0, dz / d, d, { noTerrain: true, filter: (bx) => bx.kind !== 'walk' && bx.kind !== 'door' && bx.kind !== 'tree' });
      if (hit.dist < d - 0.4) return false;
    }
    return true;
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game;
    this.updateCamera(dt);
    this.updateCutaway();
    this.updateRings(dt);
    this.updateTags();
    if (g.world.grass) for (const m of g.world.grass.meshes) if (m.visible) m.visible = false;
    this.rT = (this.rT || 0) - dt;
    if (this.rT <= 0) { this.rT = 0.5; this.render(false); }
    // zombies and the world come to life where you're looking
    g.focus = { x: this.cam.x, y: this.cam.y, z: this.cam.z };
  }
  get focusPoint() { return { x: this.cam.x, y: this.cam.y, z: this.cam.z }; }
  updateCamera(dt) {
    const g = this.game, c = this.cam;
    const fo = this.focusOn && !this.focusOn.dead && this.focusOn.mode !== 'away' ? this.focusOn.pos : g.player.pos;
    if (c.follow) {
      const k = this.camInit ? Math.min(1, dt * 4) : 1;
      c.x += (fo.x - c.x) * k; c.z += (fo.z - c.z) * k;
    }
    c.y += (g.physics.groundAt(c.x, c.z, (c.follow ? fo.y : g.world.terrain.height(c.x, c.z)) + 2.5) - c.y) * (this.camInit ? Math.min(1, dt * 3) : 1);
    const inp = g.input, sp = c.dist * 0.9 * dt;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    let px = 0, pz = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) { px += fx; pz += fz; }
    if (inp.down('KeyS') || inp.down('ArrowDown')) { px -= fx; pz -= fz; }
    if (inp.down('KeyD') || inp.down('ArrowRight')) { px += rx; pz += rz; }
    if (inp.down('KeyA') || inp.down('ArrowLeft')) { px -= rx; pz -= rz; }
    if (px || pz) { c.x += px * sp; c.z += pz * sp; c.follow = false; }
    const cp = Math.cos(c.pitch);
    const want = new THREE.Vector3(c.x + Math.sin(c.yaw) * cp * c.dist, c.y + 1 + Math.sin(c.pitch) * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    const cam = g.camera;
    if (!this.camInit) { cam.position.copy(want); this.camInit = true; } else cam.position.lerp(want, Math.min(1, dt * 8));
    cam.lookAt(c.x, c.y + 1, c.z);
    if (Math.abs(cam.fov - 50) > 0.1) { cam.fov = 50; cam.updateProjectionMatrix(); }
    const tr = g.world.trees;
    if (tr && c.dist < 80 && (!this.treeAt || Math.hypot(this.treeAt.x - c.x, this.treeAt.z - c.z) > 3)) {
      this.treeAt = { x: c.x, z: c.z };
      tr.setHidden([c.x - 12, c.z - 12, c.x + 12, c.z + 12]);
    } else if (tr && c.dist >= 80 && this.treeAt) { this.treeAt = null; tr.setHidden(null); }
  }
  // looking into a building: lift off the roof and the floors above
  updateCutaway() {
    const g = this.game, c = this.cam;
    const fo = this.focusOn && this.cam.follow ? this.focusOn.pos : { x: c.x, y: c.y, z: c.z };
    let found = null, lvl = 0;
    if (c.dist < 60) for (const S of g.world.structures) {
      const b = S._bb || (S._bb = S.bounds());
      if (!b || fo.x < b.wx0 - 0.3 || fo.x > b.wx1 + 0.3 || fo.z < b.wz0 - 0.3 || fo.z > b.wz1 + 0.3) continue;
      if (fo.y < S.oy - 1.5) continue;
      found = S; lvl = Math.max(0, Math.round((fo.y - S.oy) / STORY - 0.2)); break;
    }
    if (found !== this.cutS || lvl !== this.cutL) {
      if (this.cutS && this.cutS !== found) this.cutS.setCutaway(null);
      this.cutS = found; this.cutL = lvl;
      if (found) found.setCutaway(lvl);
    }
  }

  // ---------------- markers ----------------
  ring(color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.54, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 10; m.visible = false;
    this.game.scene.add(m);
    return m;
  }
  marker(p, color) {
    if (!this.dest) this.dest = this.ring(0xf3efe4);
    this.dest.position.set(p.x, p.y + 0.06, p.z); this.dest.material.color.setHex(color); this.destT = 1.4;
  }
  updateRings(dt) {
    const sel = [...this.sel].filter((m) => !m.dead && m.char.root.visible);
    while (this.rings.length < sel.length + 1) this.rings.push(this.ring(0xd9a441));
    this.rings.forEach((r, i) => {
      const m = sel[i];
      if (!m) { r.visible = false; return; }
      r.visible = true; r.material.color.setHex(0xd9a441);
      r.position.set(m.pos.x, (m.anim.lie ? m.anim.lieY : m.visualY) + 0.05, m.pos.z);
    });
    const t = this.targetMark;
    const tr = this.rings[sel.length];
    if (t && !t.dead && tr) { tr.visible = true; tr.material.color.setHex(0xe0583a); tr.position.set(t.pos.x, (t.visualY ?? t.pos.y) + 0.05, t.pos.z); }
    else if (t && t.dead) this.targetMark = null;
    if (this.dest) {
      this.destT -= dt;
      this.dest.visible = this.destT > 0;
      if (this.dest.visible) { const k = 1 + (1.4 - this.destT) * 0.5; this.dest.scale.set(k, k, k); this.dest.material.opacity = Math.min(0.9, this.destT); }
    }
  }
  // name tags over your people (and a few others) when zoomed in enough
  updateTags() {
    const g = this.game, wrap = this.$('cmd-tags');
    this.tags = this.tags || [];
    const show = [];
    if (this.cam.dist < 140) {
      for (const m of this.people()) if (m.char.root.visible || m === g.player.body) show.push(m);
      for (const c of this.soc.raiders.active) if (c.known) show.push({ crew: c });
    }
    while (this.tags.length < show.length) { const el = document.createElement('div'); el.className = 'cmd-tag'; wrap.appendChild(el); this.tags.push({ el }); }
    this.tags.forEach((t, i) => {
      const s = show[i];
      if (!s) { t.el.hidden = true; return; }
      const pos = s.crew ? { x: s.crew.x, y: s.crew.y + 3, z: s.crew.z } : { x: s.pos.x, y: (s.anim.lie ? s.anim.lieY : s.visualY) + 2.2, z: s.pos.z };
      const p = this.project(pos.x, pos.y, pos.z);
      if (!p || p[0] < -40 || p[1] < -20 || p[0] > innerWidth + 40 || p[1] > innerHeight + 20) { t.el.hidden = true; return; }
      const text = s.crew ? `${s.crew.name}` : s.first;
      const cls = s.crew ? 'crew' : `${this.sel.has(s) ? 'on' : ''} ${s.downed ? 'down' : ''} ${s.combatTarget ? 'fight' : ''}`;
      if (t.text !== text || t.cls !== cls) { t.text = text; t.cls = cls; t.el.textContent = text; t.el.className = 'cmd-tag ' + cls; }
      t.el.hidden = false;
      t.el.style.transform = `translate(${p[0].toFixed(0)}px, ${p[1].toFixed(0)}px) translate(-50%, -100%)`;
    });
  }

  // ---------------- planting a claim ----------------
  setPlantMode(on) {
    if (on && !this.planting) this.distBefore = this.cam.dist;
    if (!on && this.planting && this.distBefore) { this.cam.dist = this.distBefore; this.cam.follow = true; }
    this.planting = on;
    this.$('cmd-plant').hidden = !on;
    this.$('cmd-plant-ok').hidden = true;
    this.$('cmd-plant-text').textContent = this.game.inventory.claimKits > 0 ? 'Tap where your camp should go.' : 'You need a claim kit. Search houses and sheds for one.';
    if (!on && this.plantLines) { this.game.scene.remove(this.plantLines); this.plantLines.geometry.dispose(); this.plantLines = null; }
    this.plantAt = null;
  }
  previewPlant(p) {
    const g = this.game;
    const r = g.claims.check(p.x, p.z);
    if (this.plantLines) { g.scene.remove(this.plantLines); this.plantLines.geometry.dispose(); this.plantLines = null; }
    const x0 = r.x0 ?? (Math.round(p.x / 2) - CLAIM_HALF) * 2, x1 = r.x1 ?? (Math.round(p.x / 2) + CLAIM_HALF) * 2;
    const z0 = r.z0 ?? (Math.round(p.z / 2) - CLAIM_HALF) * 2, z1 = r.z1 ?? (Math.round(p.z / 2) + CLAIM_HALF) * 2;
    const pts = [];
    const tr = g.world.terrain;
    const edge = (ax, az, bx, bz) => { for (let i = 0; i <= 20; i++) { const x = ax + (bx - ax) * i / 20, z = az + (bz - az) * i / 20; pts.push(new THREE.Vector3(x, tr.height(x, z) + 0.25, z)); } };
    edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
    this.plantLines = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.ok ? 0x8fd06a : 0xe0583a, depthTest: false }));
    this.plantLines.renderOrder = 11;
    g.scene.add(this.plantLines);
    this.plantAt = r.ok ? p : null;
    this.cam.follow = false;
    this.cam.x = (x0 + x1) / 2; this.cam.z = (z0 + z1) / 2;
    this.cam.dist = Math.max(this.cam.dist, innerHeight > innerWidth ? 78 : 52);
    this.$('cmd-plant-text').textContent = r.ok ? 'Your camp would cover this square.' : r.why;
    this.$('cmd-plant-ok').hidden = !r.ok;
  }
  confirmPlant() {
    const p = this.plantAt;
    this.setPlantMode(false);
    if (!p) return;
    const c = this.game.claims.plant(p.x, p.z, false, p.y);
    if (c) this.hint('Your camp has a home. Your people will head there.', 4);
    for (const m of this.people()) if (!m.dead && !m.downed && m.mode !== 'away' && m.mode !== 'mission') { m.mode = 'travel'; m.task = null; }
  }
}
