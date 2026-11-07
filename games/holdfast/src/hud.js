// HUD and on-screen controls (DOM). Keeps gameplay state display, prompts,
// toasts, the pause/help menu and the phone touch controls.
import { isTouch } from './platform.js';

const RES_ORDER = [['wood', 'Wood'], ['metal', 'Metal'], ['stone', 'Stone'], ['food', 'Food'], ['meds', 'Meds'], ['ammo', 'Ammo'], ['fuel', 'Fuel']];

export class HUD {
  constructor(game) {
    this.game = game;
    const ui = this.root = document.getElementById('ui');
    ui.innerHTML = `
      <div class="hud-top-left"><div id="hud-clock">9:00</div><div id="hud-weather">Clear</div><div id="hud-claim"></div></div>
      <div class="hud-res" id="hud-res"></div>
      <div class="hud-toasts" id="hud-toasts"></div>
      <div class="crosshair" id="crosshair"></div>
      <div class="prompt" id="prompt" hidden><span class="key" id="prompt-key">E</span><span id="prompt-text"></span><div class="prompt-bar" id="prompt-bar"></div></div>
      <div class="hud-bars">
        <div class="bar-row"><span class="bar-label">Health</span><div class="hbar"><div id="hp-fill" class="fill hp"></div></div></div>
        <div class="bar-row"><span class="bar-label">Stamina</span><div class="hbar"><div id="st-fill" class="fill st"></div></div></div>
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
        </div>
        <div class="tbtns-top">
          <button data-act="build" class="tb small">Build</button>
          <button data-act="inv" class="tb small">Pack</button>
          <button data-act="map" class="tb small">Map</button>
        </div>
      </div>`;
    this.$ = (id) => document.getElementById(id);
    this.toastsEl = this.$('hud-toasts');
    this.resEl = this.$('hud-res');
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
    this.$('hp-fill').style.width = (100 * p.health / p.maxHealth).toFixed(1) + '%';
    this.$('st-fill').style.width = (100 * p.stamina / p.maxStamina).toFixed(1) + '%';
    const h = Math.floor(g.sky.time), m = Math.floor((g.sky.time - h) * 60);
    const ampm = h < 12 ? 'AM' : 'PM';
    this.$('hud-clock').textContent = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
    const wn = { clear: 'Clear', cloudy: 'Cloudy', overcast: 'Overcast', storm: 'Storm warning' }[g.sky.weather];
    this.$('hud-weather').textContent = wn;
    this.$('hud-weather').classList.toggle('warn', g.sky.weather === 'storm');
    const inv = g.inventory;
    if (inv) {
      const key = RES_ORDER.map(([k]) => inv.res[k]).join(',') + '|' + inv.claimKits;
      if (key !== this.lastRes) {
        this.lastRes = key;
        this.resEl.innerHTML = RES_ORDER.map(([k, n]) => `<div class="res"><span class="res-n">${inv.res[k]}</span><span class="res-l">${n}</span></div>`).join('') +
          `<div class="res kit"><span class="res-n">${inv.claimKits}</span><span class="res-l">Claim kits</span></div>`;
      }
      this.$('hud-weapon').textContent = p.weapon.name + (p.weapon.kind === 'gun' ? ` · ${inv.res.ammo} rounds` : '');
    }
    const claim = g.claims && g.claims.at(p.pos.x, p.pos.z);
    this.$('hud-claim').textContent = claim ? 'Inside your claim · B to build' : '';
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
        <h3>Controls</h3>
        <table class="keys">
          <tr><td>W A S D</td><td>Move</td></tr><tr><td>Mouse</td><td>Look (click the game to capture the mouse)</td></tr>
          <tr><td>Shift</td><td>Run</td></tr><tr><td>Space</td><td>Jump / vault fences</td></tr><tr><td>C</td><td>Crouch (quieter)</td></tr>
          <tr><td>Left click</td><td>Attack / shoot</td></tr><tr><td>Right click</td><td>Aim</td></tr><tr><td>Q</td><td>Switch weapon</td></tr>
          <tr><td>E</td><td>Open doors, search, pick up (hold to search)</td></tr><tr><td>F</td><td>Flashlight</td></tr>
          <tr><td>G</td><td>Plant claim flag</td></tr><tr><td>B</td><td>Build mode</td></tr><tr><td>H</td><td>Eat / use meds</td></tr>
          <tr><td>M</td><td>Map</td></tr><tr><td>Esc</td><td>Menu</td></tr>
        </table>
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
    const onStart = (e) => {
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
    cv.addEventListener('touchstart', onStart, { passive: false });
    cv.addEventListener('touchmove', onMove, { passive: false });
    cv.addEventListener('touchend', onEnd);
    cv.addEventListener('touchcancel', onEnd);
    for (const b of t.querySelectorAll('button[data-act]')) {
      const act = b.dataset.act;
      const toggle = b.classList.contains('toggle');
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (toggle) { const on = !inp.actionsDown.has(act); inp.actionsDown[on ? 'add' : 'delete'](act); b.classList.toggle('on', on); if (act === 'crouch') inp.pressedSet.add('KeyC'); return; }
        inp.actionsDown.add(act + '-hold');
        const map = { attack: 'TouchAttack', interact: 'KeyE', jump: 'Space', build: 'KeyB', inv: 'KeyI', map: 'KeyM' };
        if (map[act]) { inp.pressedSet.add(map[act]); inp.keys.add(map[act]); }
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        inp.actionsDown.delete(act + '-hold');
        const map = { attack: 'TouchAttack', interact: 'KeyE', jump: 'Space', build: 'KeyB', inv: 'KeyI', map: 'KeyM' };
        if (map[act]) inp.keys.delete(map[act]);
      });
    }
  }
}
