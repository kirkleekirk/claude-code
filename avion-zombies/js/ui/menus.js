import { settings, QUALITY_PRESETS, loadRecords } from '../settings.js';
import { formatTime } from '../util.js';
import { audio } from '../engine/audio.js';

const $ = (sel, root = document) => root.querySelector(sel);

const OPTIONS = [
  { group: 'Audio' },
  { key: 'masterVolume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'musicVolume', label: 'Music', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'sfxVolume', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'voiceVolume', label: 'Zombie voices', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'announcer', label: 'Facility announcer', type: 'toggle' },
  { group: 'Controls' },
  { key: 'sensitivity', label: 'Look sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05 },
  { key: 'adsSensitivity', label: 'Aim-down-sights sensitivity', type: 'range', min: 0.2, max: 1.5, step: 0.05 },
  { key: 'touchSensitivity', label: 'Touch look sensitivity', type: 'range', min: 0.3, max: 3, step: 0.05 },
  { key: 'invertY', label: 'Invert look', type: 'toggle' },
  { key: 'toggleCrouch', label: 'Toggle crouch (C)', type: 'toggle' },
  { key: 'toggleSprint', label: 'Toggle sprint', type: 'toggle' },
  { key: 'aimAssist', label: 'Aim assist (controller / touch)', type: 'toggle' },
  { group: 'Video' },
  { key: 'quality', label: 'Graphics quality', type: 'select', options: Object.keys(QUALITY_PRESETS) },
  { key: 'fov', label: 'Field of view', type: 'range', min: 65, max: 110, step: 1 },
  { key: 'screenShake', label: 'Screen shake', type: 'range', min: 0, max: 1.5, step: 0.05 },
  { key: 'filmGrain', label: 'Film grain', type: 'toggle' },
  { key: 'showFps', label: 'Show FPS', type: 'toggle' },
];

export class Menus {
  constructor(game) {
    this.game = game;
    this.screens = {};
    for (const el of document.querySelectorAll('.screen')) this.screens[el.dataset.screen] = el;
    this.stack = [];
    this.active = null;
    this.focusIndex = 0;
    this.padPrev = {};
    this.padRepeat = 0;
    this._buildOptions();
    this._bind();
  }

  _bind() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      // ignore the click that completes the tap/press which opened this screen
      if (performance.now() - (this.openedAt || 0) < 350) return;
      e.preventDefault();
      this.action(b.dataset.action, b);
    });
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.mi');
      if (b && this.active && this.screens[this.active].contains(b)) {
        const items = this.items();
        const i = items.indexOf(b);
        if (i >= 0 && i !== this.focusIndex) {
          this.focusIndex = i;
          this.highlight();
          audio.play('ui_hover', { bus: 'ui', volume: 0.6 });
        }
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.active === 'title' || this.active === 'boot') return;
      if (performance.now() - (this.openedAt || 0) < 250) return;
      if (e.code === 'ArrowDown' || e.code === 'KeyS' && this.active !== 'options') this.move(1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW' && this.active !== 'options') this.move(-1);
      else if (e.code === 'Enter' || e.code === 'Space') {
        const it = this.items()[this.focusIndex];
        if (it && document.activeElement && document.activeElement.tagName === 'INPUT' && e.code === 'Space') return;
        if (it) {
          e.preventDefault();
          it.click();
        }
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        if (document.activeElement && document.activeElement.tagName === 'INPUT' && e.code === 'Backspace') return;
        this.back();
      }
    });
  }

  _buildOptions() {
    const wrap = $('#options-list');
    let html = '';
    for (const o of OPTIONS) {
      if (o.group) {
        html += `<h3 class="opt-group">${o.group}</h3>`;
        continue;
      }
      const id = 'opt-' + o.key;
      if (o.type === 'range') {
        html += `<label class="opt mi" for="${id}"><span>${o.label}</span><input id="${id}" type="range" min="${o.min}" max="${o.max}" step="${o.step}" data-key="${o.key}"><output></output></label>`;
      } else if (o.type === 'toggle') {
        html += `<label class="opt mi" for="${id}"><span>${o.label}</span><input id="${id}" type="checkbox" data-key="${o.key}"><i class="sw"></i></label>`;
      } else if (o.type === 'select') {
        html += `<label class="opt mi" for="${id}"><span>${o.label}</span><select id="${id}" data-key="${o.key}">${o.options.map((v) => `<option value="${v}">${v.toUpperCase()}</option>`).join('')}</select></label>`;
      }
    }
    wrap.innerHTML = html;
    wrap.addEventListener('input', (e) => {
      const el = e.target;
      const key = el.dataset.key;
      if (!key) return;
      let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
      settings.set(key, v);
      this._syncOption(el);
    });
    wrap.addEventListener('change', (e) => {
      if (e.target.dataset.key === 'quality') this.game.applyQuality();
    });
  }

  _syncOptions() {
    for (const el of document.querySelectorAll('#options-list [data-key]')) {
      const v = settings.get(el.dataset.key);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
      this._syncOption(el);
    }
  }

  _syncOption(el) {
    const out = el.parentElement.querySelector('output');
    if (out) {
      const k = el.dataset.key;
      const v = parseFloat(el.value);
      out.textContent = k === 'fov' ? Math.round(v) + '°' : /Volume/.test(k) || k === 'screenShake' ? Math.round(v * 100) + '%' : v.toFixed(2);
    }
  }

  items() {
    if (!this.active) return [];
    return [...this.screens[this.active].querySelectorAll('.mi')].filter((e) => e.offsetParent !== null);
  }

  highlight() {
    const items = this.items();
    items.forEach((el, i) => el.classList.toggle('focus', i === this.focusIndex));
    const el = items[this.focusIndex];
    if (el && el.dataset.desc) {
      const d = this.screens[this.active].querySelector('.desc');
      if (d) d.textContent = el.dataset.desc;
    }
    if (el && el.scrollIntoView && this.active === 'options') el.scrollIntoView({ block: 'nearest' });
  }

  move(dir) {
    const items = this.items();
    if (!items.length) return;
    this.focusIndex = (this.focusIndex + dir + items.length) % items.length;
    this.highlight();
    audio.play('ui_hover', { bus: 'ui', volume: 0.6 });
  }

  open(name, push = true) {
    this.openedAt = performance.now();
    if (this.active && push) this.stack.push(this.active);
    for (const [k, el] of Object.entries(this.screens)) el.hidden = k !== name;
    this.active = name;
    this.focusIndex = 0;
    if (name === 'options') this._syncOptions();
    if (name === 'main') this._refreshMain();
    requestAnimationFrame(() => this.highlight());
  }

  closeAll() {
    for (const el of Object.values(this.screens)) el.hidden = true;
    this.active = null;
    this.stack = [];
  }

  back() {
    if (this.active === 'pause') {
      this.action('resume');
      return;
    }
    if (this.active === 'main' || this.active === 'gameover' || this.active === 'intro') return;
    const prev = this.stack.pop();
    audio.play('ui_back', { bus: 'ui', volume: 0.7 });
    if (prev) this.open(prev, false);
  }

  _refreshMain() {
    const r = loadRecords();
    const dawn = r.daybreak ? `  •  DAYBREAK ${Math.floor(r.daybreak / 60)}:${String(r.daybreak % 60).padStart(2, '0')}` : '';
    $('#menu-best').textContent = (r.bestRound ? 'BEST: ROUND ' + r.bestRound : 'NO RECORD YET') + dawn;
  }

  action(name) {
    const game = this.game;
    if (name !== 'back') audio.play('ui_click', { bus: 'ui', volume: 0.7 });
    switch (name) {
      case 'solo':
        this.open('mapselect');
        break;
      case 'start':
        game.startMatch();
        break;
      case 'freeroam':
        game.startMatch(true);
        break;
      case 'options':
        this.open('options');
        break;
      case 'controls':
        this.open('controls');
        break;
      case 'credits':
        this.open('credits');
        break;
      case 'back':
        this.back();
        break;
      case 'resume':
        game.resume();
        break;
      case 'quit':
        game.quitToMenu();
        break;
      case 'retry':
        game.startMatch();
        break;
      case 'reset-settings':
        settings.reset();
        this._syncOptions();
        game.applyQuality();
        break;
      case 'fullscreen':
        try {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen();
        } catch (e) {
          /* not allowed here */
        }
        break;
      default:
        break;
    }
  }

  setBoot(p, text) {
    $('#boot-bar i').style.width = Math.round(p * 100) + '%';
    if (text) $('#boot-status').textContent = text;
  }

  waitForStart() {
    return new Promise((resolve) => {
      const go = (e) => {
        if (e && e.type === 'keydown' && (e.metaKey || e.ctrlKey)) return;
        if (e) {
          // swallow the key so it doesn't also activate the first menu item
          e.stopPropagation();
          e.preventDefault();
        }
        this.openedAt = performance.now();
        window.removeEventListener('keydown', go, true);
        window.removeEventListener('pointerdown', go, true);
        clearInterval(padPoll);
        resolve();
      };
      window.addEventListener('keydown', go, true);
      window.addEventListener('pointerdown', go, true);
      const padPoll = setInterval(() => {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const p of pads) if (p && p.buttons.some((b) => b.pressed)) go();
      }, 100);
    });
  }

  async intro(lines) {
    this.open('intro', false);
    const box = $('#intro-lines');
    box.innerHTML = '';
    let skip = false;
    const onSkip = () => {
      skip = true;
    };
    window.addEventListener('keydown', onSkip, { once: true });
    window.addEventListener('pointerdown', onSkip, { once: true });
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = 'line ' + (line.cls || '');
      box.appendChild(div);
      for (let i = 0; i < line.text.length; i++) {
        if (skip) break;
        div.textContent = line.text.slice(0, i + 1);
        if (i % 2 === 0) audio.play('ui_hover', { bus: 'ui', volume: 0.25, rate: 0.7 + Math.random() * 0.2 });
        await new Promise((r) => setTimeout(r, line.speed || 34));
      }
      div.textContent = line.text;
      if (!skip) await new Promise((r) => setTimeout(r, line.pause ?? 350));
    }
    if (!skip) await new Promise((r) => setTimeout(r, 900));
    window.removeEventListener('keydown', onSkip);
    window.removeEventListener('pointerdown', onSkip);
  }

  gameOver(stats, round, record) {
    $('#go-round').textContent = round === 1 ? 'YOU SURVIVED 1 ROUND' : `YOU SURVIVED ${round} ROUNDS`;
    $('#go-stats').innerHTML = `
      <div><dt>Kills</dt><dd>${stats.kills}</dd></div>
      <div><dt>Headshots</dt><dd>${stats.headshots}</dd></div>
      <div><dt>Points earned</dt><dd>${stats.earned}</dd></div>
      <div><dt>Doors opened</dt><dd>${stats.doors}</dd></div>
      <div><dt>Downs</dt><dd>${stats.downs}</dd></div>
      <div><dt>Time</dt><dd>${formatTime(stats.time)}</dd></div>`;
    $('#go-record').textContent = record ? 'NEW PERSONAL BEST' : '';
    this.open('gameover', false);
  }

  // gamepad + keyboard navigation for whatever screen is open
  update(dt) {
    if (!this.active || this.active === 'boot' || this.active === 'title' || this.active === 'intro') return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads).find((p) => p && p.connected);
    if (!gp) return;
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const ly = gp.axes[1] || 0;
    const lx = gp.axes[0] || 0;
    const down = b(13) || ly > 0.6;
    const up = b(12) || ly < -0.6;
    const left = b(14) || lx < -0.6;
    const right = b(15) || lx > 0.6;
    const now = { down, up, left, right, a: b(0), bk: b(1), start: b(9) };
    const edge = (k) => now[k] && !this.padPrev[k];
    this.padRepeat -= dt;
    if ((down || up) && this.padRepeat <= 0) {
      this.move(down ? 1 : -1);
      this.padRepeat = 0.22;
    }
    if (!down && !up) this.padRepeat = 0;
    const it = this.items()[this.focusIndex];
    if ((left || right) && it && this.padRepeat <= 0) {
      const input = it.querySelector('input,select');
      if (input && input.type === 'range') {
        const step = parseFloat(input.step) * (right ? 1 : -1);
        input.value = Math.min(parseFloat(input.max), Math.max(parseFloat(input.min), parseFloat(input.value) + step));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this.padRepeat = 0.08;
      } else if (input && input.tagName === 'SELECT' && (edge('left') || edge('right'))) {
        input.selectedIndex = (input.selectedIndex + (right ? 1 : -1) + input.options.length) % input.options.length;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (edge('a') && it) {
      const input = it.querySelector('input[type=checkbox]');
      if (input) {
        input.checked = !input.checked;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else it.click();
    }
    if (edge('bk')) this.back();
    if (edge('start') && this.active === 'pause') this.action('resume');
    this.padPrev = now;
  }
}
