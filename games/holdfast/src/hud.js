// HUD and on-screen controls (DOM). Keeps gameplay state display, prompts,
// toasts, the pause/help menu and the phone touch controls.
import { isTouch } from './platform.js';
import { GUNS, AMMO } from './items.js';
import { INJURIES, fatigueWord } from './condition.js';

export class HUD {
  constructor(game) {
    this.game = game;
    const ui = this.root = document.getElementById('ui');
    ui.innerHTML = `
      <div class="hud-top-left"><div class="hud-time"><span id="hud-clock">9:00</span><span id="hud-weather">Clear</span></div><div id="hud-claim"></div></div>
      <div class="hud-toasts" id="hud-toasts"></div>
      <div class="hud-loot" id="hud-loot"></div>
      <div class="scope-mask" id="scope-mask"></div>
      <div class="crosshair" id="crosshair"></div>
      <div class="prompt" id="prompt" hidden><span class="key" id="prompt-key">E</span><span id="prompt-text"></span><div class="prompt-bar" id="prompt-bar"></div></div>
      <div class="hud-bars">
        <div class="who"><b id="hud-name"></b><span id="hud-cond"></span></div>
        <div class="bar-row"><div class="hbar hp-bar"><div id="hp-fill" class="fill hp"></div><div id="hp-lost" class="lost"></div></div></div>
        <div class="bar-row"><div class="hbar thin"><div id="st-fill" class="fill st"></div></div></div>
        <div class="weapon" id="hud-weapon"></div>
      </div>
      <div class="vignette" id="vignette"></div>
      <div class="hint" id="hud-hint"></div>
      <button class="menu-btn" id="menu-btn" aria-label="Menu">II</button>
      <div class="overlay" id="pause" hidden>
        <div class="panel">
          <h2>HOLDFAST</h2>
          <p class="sub">Bridger County · Day <span id="pause-day">1</span></p>
          <div class="menu-actions">
            <button id="btn-resume" class="primary">Resume</button>
            <button id="btn-save">Save game</button>
            <button id="btn-help">Controls &amp; how to play</button>
            <button id="btn-settings">Settings</button>
            <button id="btn-new">New game</button>
          </div>
          <div id="pause-body"></div>
        </div>
      </div>
      <div class="dead" id="dead" hidden><h2>You didn't make it</h2><p id="dead-text"></p><button id="btn-respawn" class="primary">Wake up at your claim</button></div>
      <div class="touch" id="touch" hidden>
        <div class="stick" id="stick"><div class="knob" id="knob"></div></div>
        <div class="tbtns">
          <button data-act="attack" class="tb big">Hit</button>
          <button data-act="interact" class="tb">Use</button>
          <button data-act="jump" class="tb">Jump</button>
          <button data-act="sprint" class="tb toggle">Run</button>
          <button data-act="crouch" class="tb toggle">Crouch</button>
          <button data-act="aim" class="tb toggle">Aim</button>
          <button data-act="reload" class="tb" id="tb-reload" hidden>Reload</button>
        </div>
        <div class="tbtns-top">
          <button data-act="view" class="tb small">Top view</button>
          <button data-act="weapon" class="tb small" id="tb-weapon">Swap</button>
          <button data-act="eat" class="tb small">Heal</button>
          <button data-act="light" class="tb small">Light</button>
          <button data-act="more" class="tb small" id="tb-more" aria-label="More">More</button>
          <div class="tb-more" id="tb-more-menu" hidden>
            <button data-act="inv" class="tb small">Pack</button>
            <button data-act="camp" class="tb small">Camp</button>
            <button data-act="map" class="tb small">Map</button>
            <button data-act="claim" class="tb small">Claim</button>
            <button data-act="build" class="tb small">Build</button>
          </div>
        </div>
      </div>`;
    this.$ = (id) => document.getElementById(id);
    // phones: who you are, the plan and what you just found stack under the
    // clock in one column, so nothing ends up on top of anything else
    if (isTouch) { const tl = ui.querySelector('.hud-top-left'); tl.appendChild(ui.querySelector('.hud-bars')); tl.appendChild(this.$('hud-loot')); }
    this.toastsEl = this.$('hud-toasts');
    this.lootEl = this.$('hud-loot');
    this.lastRes = '';
    this.$('menu-btn').addEventListener('click', () => this.togglePause());
    this.$('btn-resume').addEventListener('click', () => this.togglePause(false));
    this.$('btn-help').addEventListener('click', () => this.showHelp());
    this.$('btn-settings').addEventListener('click', () => this.showSettings());
    this.$('btn-save').addEventListener('click', () => { game.save && game.save(); this.toast('Game saved', 2); });
    this.$('btn-new').addEventListener('click', () => this.confirmNew());
    this.$('btn-respawn').addEventListener('click', () => game.respawn && game.respawn());
    if (isTouch) this.setupTouch();
    this.paused = false;
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    const b = p.body;
    // health as a share of a full body: injuries take a piece off the end
    const full = b ? b.baseHealth || 100 : p.maxHealth;
    this.$('hp-fill').style.width = (100 * Math.max(0, p.health) / full).toFixed(1) + '%';
    this.$('hp-lost').style.width = (100 * Math.max(0, full - p.maxHealth) / full).toFixed(1) + '%';
    this.$('st-fill').style.width = (100 * p.stamina / Math.max(1, p.maxStamina)).toFixed(1) + '%';
    if (b) {
      const cond = [];
      if ((b.fatigue || 0) > 30) cond.push(`<i class="cond-chip ${b.fatigue >= 100 ? 'bad' : b.fatigue > 60 ? 'warn' : ''}">${fatigueWord(b.fatigue)}</i>`);
      for (const i of b.injuries) if (INJURIES[i.id]) cond.push(`<i class="cond-chip bad">${INJURIES[i.id].name}</i>`);
      const key = b.person.name + cond.join('');
      if (key !== this.condKey) { this.condKey = key; this.$('hud-name').textContent = b.person.name; this.$('hud-cond').innerHTML = cond.join(''); }
    }
    const h = Math.floor(g.sky.time), m = Math.floor((g.sky.time - h) * 60);
    const ampm = h < 12 ? 'AM' : 'PM';
    this.$('hud-clock').textContent = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
    const wn = { clear: 'Clear', cloudy: 'Cloudy', overcast: 'Overcast', storm: 'Storm warning' }[g.sky.weather];
    this.$('hud-weather').textContent = wn;
    this.$('hud-weather').classList.toggle('warn', g.sky.weather === 'storm');
    // the gun in hand: what's loaded, what's spare, reloading
    const gun = p.gun, gd = gun && GUNS[gun.id];
    const wkey = gd ? `${gun.id}|${gun.mag}|${b.pack.count('ammo', gd.ammo)}|${p.reloadT > 0 ? 1 : 0}` : p.weapon.name;
    if (wkey !== this.wKey) {
      this.wKey = wkey;
      this.$('hud-weapon').innerHTML = gd
        ? `<span class="wname">${gd.name}</span><span class="wmag ${gun.mag === 0 ? 'empty' : ''}">${p.reloadT > 0 ? 'Reloading' : gun.mag}</span><span class="wres">/ ${b.pack.count('ammo', gd.ammo)} ${AMMO[gd.ammo].short || AMMO[gd.ammo].name}</span>`
        : `<span class="wname">${p.weapon.name}</span>`;
      const rl = this.$('tb-reload');
      if (rl) rl.hidden = !gd;
    }
    const claim = g.claims && g.claims.at(p.pos.x, p.pos.z);
    this.$('hud-claim').textContent = claim ? (isTouch ? 'Inside your claim · tap Build' : 'Inside your claim · B to build') : '';
    const wb = this.$('tb-weapon');
    // the swap pill says what you'd switch to
    if (wb) { const t = p.weapon.kind === 'gun' ? '\u21c4 Bat' : b && b.gear.gun ? '\u21c4 ' + GUNS[b.gear.gun.id].name.split(' ')[0] : 'No gun'; if (wb.textContent !== t) { wb.textContent = t; wb.disabled = t === 'No gun'; } }
    for (const b of this.root.querySelectorAll('.tbtns-top [data-act=light]')) b.classList.toggle('on', !!p.flashlightOn);
    this.$('vignette').style.opacity = Math.max(p.hurtFlash * 2.2, p.health < 30 ? 0.35 + 0.15 * Math.sin(performance.now() / 300) : 0).toFixed(2);
    this.$('crosshair').classList.toggle('aim', p.aiming);
  }
  setPrompt(text, key = 'E', progress = null) {
    const el = this.$('prompt');
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    this.$('prompt-key').textContent = isTouch ? 'Use' : key;
    this.$('prompt-text').textContent = text;
    const bar = this.$('prompt-bar');
    bar.style.width = progress == null ? '0' : (progress * 100).toFixed(0) + '%';
  }
  // what you just picked up, briefly, bottom left
  loot(text, secs = 3.5) {
    // in the top view the feed's hidden: say it as a toast
    if (this.game.command && this.game.command.active) { this.toast(text, secs); return; }
    const d = document.createElement('div');
    d.className = 'loot-line';
    d.textContent = text;
    this.lootEl.appendChild(d);
    while (this.lootEl.children.length > 4) this.lootEl.firstChild.remove();
    setTimeout(() => d.classList.add('out'), secs * 1000);
    setTimeout(() => d.remove(), secs * 1000 + 600);
  }
  toast(text, secs = 3) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    this.toastsEl.appendChild(d);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => d.classList.add('out'), secs * 1000);
    setTimeout(() => d.remove(), secs * 1000 + 600);
  }
  hint(text) { this.$('hud-hint').textContent = text || ''; }
  hurt() { /* vignette driven by player.hurtFlash */ }
  showDeath(text) { this.$('dead').hidden = false; this.$('dead-text').textContent = text; this.game.input.exitLock(); }
  hideDeath() { this.$('dead').hidden = true; }
  setVisible(v) { this.root.classList.toggle('hud-hidden', !v); }

  // ---------------- pause / help ----------------
  togglePause(v) {
    this.paused = v == null ? !this.paused : v;
    this.$('pause').hidden = !this.paused;
    this.$('pause-day').textContent = this.game.day || 1;
    this.$('pause-body').innerHTML = '';
    this.game.input.uiCapture = this.paused || !!this.game.modalOpen;
    if (this.paused) this.game.input.exitLock();
  }
  showHelp() {
    this.$('pause-body').innerHTML = `
      <div class="help">
        <h3>Survive</h3>
        <p>The dead walk Bridger County. Scavenge houses, barns and the shops of Harlan's Landing for supplies. Noise draws them: running, fighting and gunfire carry.</p>
        <h3>Claim land</h3>
        <p>Plant a <b>claim flag</b> anywhere (press <b>G</b>). It marks out a build area around the flag. Inside it you can build on a 2&nbsp;m grid, take over an existing house, or tear it apart and rebuild it your way.</p>
        <h3>Build</h3>
        <p>Inside your claim press <b>B</b>. Pick a piece, click to place, right-click or <b>X</b> to remove. Walls are made from shapes you can design yourself in the <b>Wall designer</b>. Pieces cost wood, metal and stone.</p>
        <h3>People</h3>
        <p>You're not alone out here. Walk up to someone and press <b>E</b> to talk. Your people have their own personalities and pasts, and they'll tell you more as they come to trust you. At camp they keep their own hours: cooking, working, eating together, arguing, telling stories by the fire. Give them jobs that suit them, take one or two along on runs, and listen when they have a plan. <b>J</b> opens the camp: who's who, the journal, what you've overheard, and your plans.</p>
        <p>Strangers camp out on the roads. Some will join you if you earn it; some only know things. Raider crews set up after a while and grow. Rob them carefully: your people have ideas about how.</p>
        <h3>Controls</h3>
        <table class="keys">
          <tr><td>W A S D</td><td>Move</td></tr><tr><td>Mouse</td><td>Look (click the game to capture the mouse)</td></tr>
          <tr><td>Shift</td><td>Run</td></tr><tr><td>Space</td><td>Jump / vault fences</td></tr><tr><td>C</td><td>Crouch (quieter)</td></tr>
          <tr><td>Left click</td><td>Attack / shoot (hold for automatics)</td></tr><tr><td>Right click</td><td>Aim (scoped rifles zoom)</td></tr><tr><td>R</td><td>Reload</td></tr><tr><td>Q</td><td>Bat / gun</td></tr><tr><td>I or Tab</td><td>Pack and camp storage</td></tr>
          <tr><td>E</td><td>Open doors, search, pick up (hold to search)</td></tr><tr><td>F</td><td>Flashlight</td></tr>
          <tr><td>G</td><td>Plant claim flag</td></tr><tr><td>B</td><td>Build mode</td></tr><tr><td>H</td><td>Patch up (meds treat wounds)</td></tr>
          <tr><td>M</td><td>Map</td></tr><tr><td>J</td><td>Camp: people, journal, plans</td></tr><tr><td>V</td><td>Top view: manage your group, take control of anyone</td></tr><tr><td>1-9</td><td>Pick a line when talking</td></tr><tr><td>Esc</td><td>Menu</td></tr>
        </table>
        <h3>On a phone</h3>
        <p><b>Top view</b> shows your whole group from above while everyone carries on by themselves. Tap people (or their cards) to pick them, then tap the ground to send them there, tap the dead or raiders to send them in, or use the orders: send on a job (scavenge a building, fetch a plan's cache, raid a crew, a supply run), go home, rest, get patched up, hold. <b>Take control</b> drops you into anyone. Drag to look around, pinch to zoom, twist two fingers to turn.</p>
        <p>In third person the left side of the screen moves and the right side looks. The round buttons hit, use, jump, aim, crouch, run and reload. The pills at the top go to the top view, swap weapons, patch you up and turn on the light; <b>More</b> has your pack, the camp, the map, the claim flag and building.</p>
        <h3>Credits</h3>
        <p class="note">Character models, both CC BY 4.0, rigged and animated in-game:
          “<a href="https://sketchfab.com/3d-models/proportional-low-poly-man-free-download-0bfd0e2b49a348a4b64b20cc8196e3b3" target="_blank" rel="noopener">Proportional Low Poly Man</a>” by Robin Butler;
          “<a href="https://sketchfab.com/3d-models/female-9a0c634d1a2249d18afbbaecf6305706" target="_blank" rel="noopener">FEMALE</a>” by staxegolo.
          Licence: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">creativecommons.org/licenses/by/4.0</a>.</p>
      </div>`;
  }
  showSettings() {
    const g = this.game;
    this.$('pause-body').innerHTML = `
      <div class="settings">
        <label>Graphics <select id="set-q"><option value="low">Low (phones)</option><option value="high">High</option></select></label>
        <label>Look sensitivity <input id="set-sens" type="range" min="0.5" max="2.5" step="0.1" value="${(g.tpc.sens / 0.0024).toFixed(1)}"></label>
        <label><input id="set-inv" type="checkbox" ${g.tpc.invertY ? 'checked' : ''}> Invert look</label>
        <p class="note">Graphics changes apply after reloading the page.</p>
      </div>`;
    const q = this.$('set-q');
    q.value = g.quality.level;
    q.addEventListener('change', () => { try { localStorage.setItem('holdfast.quality', q.value); } catch (e) { /* ignore */ } this.toast('Reload the page to apply graphics settings', 3); });
    this.$('set-sens').addEventListener('input', (e) => { g.tpc.sens = 0.0024 * +e.target.value; g.tpc.touchSens = 0.0065 * +e.target.value; });
    this.$('set-inv').addEventListener('change', (e) => { g.tpc.invertY = e.target.checked; });
  }
  confirmNew() {
    this.$('pause-body').innerHTML = `<div class="confirm"><p>Start over? Your claims and buildings will be lost.</p><button id="btn-new-yes" class="danger">Start a new game</button></div>`;
    this.$('btn-new-yes').addEventListener('click', () => { this.game.newGame && this.game.newGame(); });
  }

  // ---------------- touch controls ----------------
  setupTouch() {
    const inp = this.game.input;
    const t = this.$('touch');
    t.hidden = false;
    document.body.classList.add('is-touch');
    const stick = this.$('stick'), knob = this.$('knob');
    let stickId = null, sx = 0, sy = 0;
    let lookId = null, lx = 0, ly = 0;
    const R = 56;
    const cv = this.game.renderer.domElement;
    const cmd = () => this.game.command && this.game.command.active;
    const onStart = (e) => {
      if (cmd()) return; // the command view has its own gestures
      for (const tc of e.changedTouches) {
        const x = tc.clientX, y = tc.clientY;
        if (stickId === null && x < innerWidth * 0.42 && y > innerHeight * 0.35) {
          stickId = tc.identifier; sx = x; sy = y;
          stick.style.left = (x - 70) + 'px'; stick.style.top = (y - 70) + 'px'; stick.classList.add('active');
        } else if (lookId === null) { lookId = tc.identifier; lx = x; ly = y; inp.touch.active = true; }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      if (cmd()) { stickId = null; lookId = null; return; }
      for (const tc of e.changedTouches) {
        if (tc.identifier === stickId) {
          let dx = tc.clientX - sx, dy = tc.clientY - sy;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          inp.touch.move.x = dx / R; inp.touch.move.y = -dy / R;
          // push past the edge to run
          inp.actionsDown[l > R * 1.25 ? 'add' : 'delete']('sprint-stick');
        } else if (tc.identifier === lookId) {
          inp.touch.lookDX += tc.clientX - lx; inp.touch.lookDY += tc.clientY - ly;
          lx = tc.clientX; ly = tc.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === stickId) { stickId = null; inp.touch.move.x = 0; inp.touch.move.y = 0; knob.style.transform = ''; stick.classList.remove('active'); inp.actionsDown.delete('sprint-stick'); }
        if (tc.identifier === lookId) { lookId = null; inp.touch.active = false; }
      }
    };
    cv.addEventListener('touchstart', (e) => { const m = this.$('tb-more-menu'); if (m && !m.hidden) { m.hidden = true; this.$('tb-more').classList.remove('on'); } }, { passive: true });
    cv.addEventListener('touchstart', onStart, { passive: false });
    cv.addEventListener('touchmove', onMove, { passive: false });
    cv.addEventListener('touchend', onEnd);
    cv.addEventListener('touchcancel', onEnd);
    for (const b of t.querySelectorAll('button[data-act]')) {
      const act = b.dataset.act;
      const toggle = b.classList.contains('toggle');
      const inMore = !!b.closest('.tb-more');
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        const more = this.$('tb-more-menu');
        if (act === 'more') { more.hidden = !more.hidden; this.$('tb-more').classList.toggle('on', !more.hidden); return; }
        if (inMore) { more.hidden = true; this.$('tb-more').classList.remove('on'); }
        if (toggle) { const on = !inp.actionsDown.has(act); inp.actionsDown[on ? 'add' : 'delete'](act); b.classList.toggle('on', on); if (act === 'crouch') inp.pressedSet.add('KeyC'); return; }
        inp.actionsDown.add(act + '-hold');
        const map = { attack: 'TouchAttack', interact: 'KeyE', jump: 'Space', build: 'KeyB', inv: 'KeyI', map: 'KeyM', camp: 'KeyJ', claim: 'KeyG', eat: 'KeyH', light: 'KeyF', weapon: 'KeyQ', view: 'KeyV', reload: 'KeyR' };
        if (map[act]) { inp.pressedSet.add(map[act]); inp.keys.add(map[act]); }
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        inp.actionsDown.delete(act + '-hold');
        const map = { attack: 'TouchAttack', interact: 'KeyE', jump: 'Space', build: 'KeyB', inv: 'KeyI', map: 'KeyM', camp: 'KeyJ', claim: 'KeyG', eat: 'KeyH', light: 'KeyF', weapon: 'KeyQ', view: 'KeyV', reload: 'KeyR' };
        if (map[act]) inp.keys.delete(map[act]);
      });
    }
  }
}
