// The front end, in the Xbox original's style: the world turning slowly behind, the logo, and a
// plain list of white words with the chosen one in red. Works the same with a pad (stick or
// d-pad, A and B), the keyboard (arrows or WASD, Enter and Esc), the mouse and touch.

import { logoSVG } from './logo.js';
import { AWARDS } from '../game/awards.js';
import { PRESETS, SKIN_TONES, HAIR_COLORS, SHIRT_TINTS } from '../entities/avatar/looks.js';

export const MENU_CSS = /* css */ `
.menu { position: absolute; inset: 0; display: none; pointer-events: auto; z-index: 5; }
.menu.on { display: block; }
.menu .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 42%, rgba(0,0,0,0) 70%); }
.menu.dim .shade { background: rgba(0,0,0,0.55); }
.menu .logo { position: absolute; left: 4.5%; top: 6%; width: 30em; max-width: 64vw; height: auto; filter: drop-shadow(0 0.3em 0.6em rgba(0,0,0,0.5)); }
.menu.small-logo .logo { width: 19em; top: 4%; }
.menu .screen { position: absolute; left: 7%; top: 40%; right: 6%; bottom: 10%; }
.menu.small-logo .screen { top: 27%; }
.menu .title { font-size: 1.55em; font-weight: 800; margin-bottom: 0.5em; }
.menu .sub { font-size: 0.95em; font-weight: 600; color: var(--ink-dim); margin: -0.3em 0 0.9em; max-width: 30em; }
.menu .items { display: flex; flex-direction: column; align-items: flex-start; gap: 0.12em; }
.menu .item { position: relative; font-size: 1.45em; font-weight: 800; padding: 0.06em 0.2em 0.06em 0; cursor: pointer; transition: color 0.08s, transform 0.08s; transform-origin: left center; display: flex; gap: 1.2em; align-items: baseline; white-space: nowrap; }
.menu .item.sel { color: var(--menu-hi); transform: scale(1.06); }
.menu .item.off { color: rgba(255,255,255,0.38); }
.menu .item .val { font-size: 0.8em; color: var(--ink); min-width: 6em; display: inline-flex; gap: 0.5em; align-items: baseline; }
.menu .item .val .ar { opacity: 0; color: var(--menu-hi); padding: 0 0.15em; }
.menu .item.sel .val .ar { opacity: 1; }
.menu .item small { font-size: 0.55em; font-weight: 700; color: var(--ink-dim); }
.menu .rows .item { font-size: 1.12em; width: 100%; max-width: 26em; justify-content: space-between; }
.menu .press { position: absolute; left: 0; top: 0.4em; font-size: 1.5em; font-weight: 800; animation: pulse 1.6s ease-in-out infinite; display: flex; gap: 0.35em; align-items: center; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.menu .hints { position: absolute; right: 4%; bottom: 4.5%; display: flex; gap: 1.4em; font-size: 0.85em; font-weight: 700; align-items: center; }
.menu .hints span { display: inline-flex; gap: 0.35em; align-items: center; }
.menu .panel { background: rgba(10, 12, 14, 0.62); border: 0.06em solid rgba(255,255,255,0.18); padding: 0.9em 1.1em; max-width: 40em; max-height: 100%; overflow-y: auto; scrollbar-width: thin; }
.menu .panel h3 { margin: 0.6em 0 0.25em; font-size: 0.95em; font-weight: 800; color: var(--menu-hi); }
.menu .panel h3:first-child { margin-top: 0; }
.menu .panel p, .menu .panel li { margin: 0.15em 0; font-size: 0.82em; font-weight: 600; line-height: 1.45; }
.menu .panel ul { margin: 0; padding-left: 1.1em; }
.menu .grid { display: grid; grid-template-columns: max-content 1fr; gap: 0.15em 1.2em; font-size: 0.82em; font-weight: 600; }
.menu .grid b { font-weight: 800; }
.menu .awards { display: grid; grid-template-columns: repeat(auto-fill, minmax(17em, 1fr)); gap: 0.5em; }
.menu .award { display: flex; gap: 0.6em; align-items: center; padding: 0.4em 0.5em; background: rgba(255,255,255,0.05); border: 0.06em solid rgba(255,255,255,0.1); }
.menu .award .ic { flex: none; width: 2.1em; height: 2.1em; border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #222; background: radial-gradient(circle at 35% 30%, #555, #2a2a2a); color: #777; }
.menu .award.got .ic { background: radial-gradient(circle at 35% 30%, #fff 0, #ffd36a 35%, #b07a10 100%); color: #3a2400; }
.menu .award .t { font-size: 0.8em; font-weight: 800; }
.menu .award .d { font-size: 0.7em; font-weight: 600; color: var(--ink-dim); }
.menu .award .bar { height: 0.25em; margin-top: 0.25em; background: rgba(255,255,255,0.12); }
.menu .award .bar b { display: block; height: 100%; background: var(--menu-hi); }
.menu .award.got .bar b { background: #ffd36a; }
.menu .loading { position: absolute; left: 0; top: 0.6em; width: min(30em, 80vw); }
.menu .loading .lbl { font-size: 1.25em; font-weight: 800; margin-bottom: 0.25em; }
.menu .loading .bar { height: 1.15em; background: #000; border: 0.08em solid rgba(255,255,255,0.75); box-shadow: 0 0.15em 0.5em rgba(0,0,0,0.6); }
.menu .loading .bar b { display: block; height: 100%; width: 0; background: linear-gradient(180deg, #ffffff 0%, #e2e5e8 45%, #a8adb3 55%, #d7dadd 100%); transition: width 0.25s; }
.menu .note { position: absolute; left: 4.5%; bottom: 3.2%; font-size: 0.62em; font-weight: 600; color: rgba(255,255,255,0.55); max-width: 46em; }
`;

const yes = (b) => (b ? 'On' : 'Off');

export class Menus {
  constructor(app) {
    this.app = app;
    const el = document.createElement('div');
    el.className = 'menu ui';
    el.innerHTML = `<div class="shade"></div>${logoSVG()}<div class="screen txt"></div><div class="hints txt"></div><div class="note"></div>`;
    app.uiRoot.appendChild(el);
    this.el = el;
    this.screenEl = el.querySelector('.screen');
    this.hintsEl = el.querySelector('.hints');
    this.noteEl = el.querySelector('.note');
    this.stack = [];
    this.cur = null;
    this.repeat = 0;
    this.lastAxis = 0;
    this.visible = false;
    this.hintKey = '';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get id() { return this.cur?.id; }

  // ---- screens -------------------------------------------------------------------------------

  build(id, arg) {
    const app = this.app, S = app.settings;
    switch (id) {
      case 'title': return { id, press: true, note: true };
      case 'main': return {
        id, note: true,
        items: [
          { label: 'Play Game', on: () => this.playGame() },
          { label: 'Choose Avatar', on: () => this.open('avatar') },
          { label: 'Awards', on: () => this.open('awards') },
          { label: 'Options', on: () => this.open('options') },
          { label: 'Help & Controls', on: () => this.open('help') },
          { label: 'Credits', on: () => this.open('credits') },
        ],
        back: () => this.replace('title'),
      };
      case 'play': {
        const m = app.saveInfo();
        return {
          id, title: 'Endurance',
          sub: 'Get as far from the start tower as you can. The dead come out at night, and more of them the further you go.',
          items: [
            m ? { label: 'Continue Game', small: `Day ${m.days ?? m.day} · ${m.maxDistance ?? 0} m`, on: () => app.continueGame() } : null,
            { label: 'New World', on: () => (m ? this.open('confirmNew') : app.newWorld()) },
            { label: 'Back', on: () => this.back() },
          ].filter(Boolean),
        };
      }
      case 'confirmNew': return {
        id, title: 'Start A New World?', sub: 'Your current world and everything in it will be lost.',
        items: [{ label: 'No', on: () => this.back() }, { label: 'Yes', on: () => app.newWorld() }],
      };
      case 'pause': return {
        id, dim: true, small: true,
        items: [
          { label: 'Return To Game', on: () => app.resume() },
          { label: 'Options', on: () => this.open('options') },
          { label: 'Choose Avatar', on: () => this.open('avatar') },
          { label: 'Awards', on: () => this.open('awards') },
          { label: 'Help & Controls', on: () => this.open('help') },
          { label: 'Save And Quit', on: () => app.quitToMenu() },
        ],
        back: () => app.resume(),
      };
      case 'options': return {
        id, title: 'Options', rows: true, small: true, dim: app.state === 'paused',
        items: [
          this.choice('Graphics', ['low', 'medium', 'high', 'ultra'], () => S.quality, (v) => app.setSetting('quality', v), (v) => v[0].toUpperCase() + v.slice(1)),
          this.range('View Distance', 4, 32, 2, () => S.renderDistance, (v) => app.setSetting('renderDistance', v), (v) => `${v * 16} m`),
          this.range('Field Of View', 60, 100, 2, () => S.fov, (v) => app.setSetting('fov', v), (v) => `${v}°`),
          this.choice('Shadows', [true, false], () => S.shadows, (v) => app.setSetting('shadows', v), yes),
          this.range('Look Sensitivity', 0.3, 2.5, 0.1, () => S.sensitivity, (v) => app.setSetting('sensitivity', v), (v) => v.toFixed(1)),
          this.choice('Invert Look', [false, true], () => S.invertY, (v) => app.setSetting('invertY', v), yes),
          this.choice('Auto Climb', [true, false], () => S.autoClimb, (v) => app.setSetting('autoClimb', v), yes),
          this.choice('View Bob', [true, false], () => S.viewBob, (v) => app.setSetting('viewBob', v), yes),
          this.range('Sound Volume', 0, 1, 0.1, () => S.sound, (v) => app.setSetting('sound', v), (v) => `${Math.round(v * 10)}`),
          this.range('Music Volume', 0, 1, 0.1, () => S.music, (v) => app.setSetting('music', v), (v) => `${Math.round(v * 10)}`),
          this.choice('Show FPS', [false, true], () => S.showFps, (v) => app.setSetting('showFps', v), yes),
          { label: 'Back', on: () => this.back() },
        ],
      };
      case 'avatar': {
        const P = app.profile;
        const hex = (n) => `<i style="display:inline-block;width:1.3em;height:0.8em;vertical-align:-0.05em;border:0.08em solid rgba(255,255,255,0.7);background:#${n.toString(16).padStart(6, '0')}"></i>`;
        return {
          id, title: 'Choose Avatar', rows: true, small: true, avatar: true, dim: false,
          items: [
            this.choice('Avatar', PRESETS.map((_, i) => i), () => P.preset, (v) => app.setProfile({ preset: v, skin: null, hair: null, shirt: null }), (v) => PRESETS[v].name),
            this.choice('Skin', SKIN_TONES, () => P.skin ?? PRESETS[P.preset].skin, (v) => app.setProfile({ skin: v }), hex),
            this.choice('Hair', HAIR_COLORS, () => P.hair ?? PRESETS[P.preset].hair.color, (v) => app.setProfile({ hair: v }), hex),
            this.choice('Shirt', SHIRT_TINTS, () => P.shirt ?? PRESETS[P.preset].top.tint, (v) => app.setProfile({ shirt: v }), hex),
            { label: 'Done', on: () => this.back() },
          ],
        };
      }
      case 'awards': {
        const A = app.awards;
        const list = AWARDS.map((a) => {
          const got = A.isUnlocked(a);
          const f = Math.min(1, A.value(a) / a.goal);
          return `<div class="award${got ? ' got' : ''}"><div class="ic">${got ? '★' : '?'}</div><div style="flex:1;min-width:0"><div class="t">${a.name}</div><div class="d">${a.desc}</div><div class="bar"><b style="width:${(f * 100).toFixed(0)}%"></b></div></div></div>`;
        }).join('');
        return {
          id, title: `Awards  ${A.count} / ${AWARDS.length}`, small: true, dim: app.state === 'paused',
          html: `<div class="panel" style="max-width:56em"><div class="awards">${list}</div></div>`,
          items: [{ label: 'Back', on: () => this.back() }],
        };
      }
      case 'help': return {
        id, title: 'Help & Controls', small: true, dim: app.state === 'paused',
        html: `<div class="panel">
          <h3>Endurance</h3>
          <p>You start at the tower. Every meter you get from it counts: your best is the Max. Dig for coal, copper, iron and gold, craft tools, guns and walls, and keep moving. At night the dead come for you; underground, in the dark, so do skeletons. The further out you go, the harder it gets.</p>
          <h3>Keyboard & Mouse</h3>
          <div class="grid"><b>Move</b><span>W A S D</span><b>Look</b><span>Mouse</span><b>Jump</b><span>Space</span><b>Sprint</b><span>Shift</span><b>Crouch</b><span>C or Ctrl</span>
          <b>Dig / Shoot</b><span>Left click</span><b>Place / Aim</b><span>Right click</span><b>Reload</b><span>R</span><b>Items</b><span>1-8 or the wheel</span>
          <b>Crafting</b><span>E or Tab</span><b>Camera</b><span>V</span><b>Pause</b><span>Esc</span></div>
          <h3>Xbox Controller</h3>
          <div class="grid"><b>Move / Look</b><span>Left / right stick</span><b>Jump</b><span>A</span><b>Dig / Shoot</b><span>Right trigger</span><b>Place / Aim</b><span>Left trigger</span>
          <b>Reload</b><span>X</span><b>Crafting</b><span>Y</span><b>Items</b><span>Bumpers, d-pad</span><b>Sprint</b><span>Left stick click</span><b>Pause</b><span>Start</span></div>
          <h3>Touch</h3>
          <p>Left thumb moves, right thumb looks. Hold the dig button to dig or fire; tap place to build or aim. Tap the hotbar to switch items.</p>
          <h3>Inventory</h3>
          <p>On the crafting screen, click or tap something in the backpack or the hotbar to pick it up, then a slot to put it there, or drag it. Shift-click sends a stack across, backpack to hotbar or back; right-click picks up half a stack, or puts down one. With a controller, go right into the backpack (the hotbar is under it): A picks up and puts down, the right stick splits.</p>
        </div>`,
        items: [{ label: 'Back', on: () => this.back() }],
      };
      case 'credits': return {
        id, title: 'Credits', small: true,
        html: `<div class="panel">
          <h3>StarMiner Z</h3>
          <p>A fan remake in the spirit of CastleMiner Z (DigitalDNA Games, 2011), on an alien moon under the giant planet Ember. Not affiliated with or endorsed by DigitalDNA Games or Microsoft.</p>
          <h3>Avatars</h3>
          <p>Character rig, avatar meshes, clothing, faces and animations from the Avatar Animation Pack for XNA Game Studio 4.0 by Microsoft Corporation, used under the Microsoft Permissive License (Ms-PL).</p>
          <h3>From your copy of CastleMiner Z</h3>
          <p>${this.ripped()}</p>
          <h3>Built with</h3>
          <p>three.js (MIT). Fonts: Archivo Black and Open Sans (SIL Open Font License).</p>
        </div>`,
        items: [{ label: 'Back', on: () => this.back() }],
      };
      case 'loading': return { id, loading: arg || 'Please Wait...', small: false };
      default: return null;
    }
  }

  // which of the original's own files this copy found (they come from the player's own game)
  ripped() {
    const app = this.app, have = [];
    if (app.audio?.cues) have.push('its sound and music');
    if (app.cmzBodies) have.push('its zombies and skeletons');
    if (app.cmzPlayer) have.push('its avatar animations and the models of what you hold');
    if (!have.length) return 'None found, so the game is silent, the dead are built on the avatar rig and what you hold is drawn from parts.';
    return `In use: ${have.join('; ')}.`;
  }

  choice(label, values, get, set, fmt = String) {
    return { label, kind: 'choice', values, get, set, fmt };
  }

  range(label, min, max, step, get, set, fmt = String) {
    const values = [];
    for (let v = min; v <= max + 1e-6; v += step) values.push(Math.round(v / step) * step);
    return { label, kind: 'choice', values, get, set, fmt, near: true };
  }

  // ---- navigation ------------------------------------------------------------------------------

  open(id, arg) {
    if (this.cur) this.stack.push(this.cur.id);
    this.show(id, arg);
  }

  replace(id, arg) { this.show(id, arg); }

  back() {
    const prev = this.stack.pop();
    if (prev) this.show(prev);
    else if (this.cur?.back) this.cur.back();
  }

  reset(id, arg) { this.stack = []; this.show(id, arg); }

  show(id, arg) {
    const s = this.build(id, arg);
    if (!s) return;
    s.sel = 0;
    this.cur = s;
    this.visible = true;
    this.el.classList.add('on');
    this.el.classList.toggle('dim', !!s.dim);
    this.el.classList.toggle('small-logo', !!s.small);
    this.render();
    this.app.onMenuScreen?.(s);
  }

  hide() {
    this.visible = false;
    this.cur = null;
    this.stack = [];
    this.el.classList.remove('on');
  }

  refresh() { if (this.cur) { const sel = this.cur.sel; const s = this.build(this.cur.id); if (s) { s.sel = Math.min(sel, (s.items || []).length - 1); this.cur = s; this.render(); } } }

  setLoading(f, label) {
    const b = this.screenEl.querySelector('.loading .bar b');
    if (b) b.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
    if (label) { const l = this.screenEl.querySelector('.loading .lbl'); if (l) l.textContent = label; }
  }

  render() {
    const s = this.cur, app = this.app;
    let h = '';
    if (s.press) {
      const dev = app.input?.lastDevice;
      const p = app.isTouch ? 'Tap To Start' : dev === 'pad' ? 'Press <span class="btn a">A</span> To Start' : 'Press Start';
      h = `<div class="press">${p}</div>`;
    } else if (s.loading) {
      h = `<div class="loading"><div class="lbl">${s.loading}</div><div class="bar"><b></b></div></div>`;
    } else {
      if (s.title) h += `<div class="title">${s.title}</div>`;
      if (s.sub) h += `<div class="sub">${s.sub}</div>`;
      if (s.html) h += `<div style="margin-bottom:0.8em;max-height:58vh;display:flex">${s.html}</div>`;
      h += `<div class="items${s.rows ? ' rows' : ''}">`;
      (s.items || []).forEach((it, i) => {
        const val = it.kind === 'choice' ? `<span class="val"><span class="ar">◀</span><span>${it.fmt(it.get())}</span><span class="ar">▶</span></span>` : '';
        const small = it.small ? `<small>${it.small}</small>` : '';
        h += `<div class="item${i === s.sel ? ' sel' : ''}${it.off ? ' off' : ''}" data-i="${i}"><span>${it.label}</span>${small}${val}</div>`;
      });
      h += '</div>';
    }
    this.screenEl.innerHTML = h;
    this.noteEl.textContent = s.note ? 'StarMiner Z is a fan remake inspired by CastleMiner Z (DigitalDNA Games). Not affiliated with DigitalDNA Games or Microsoft.' : '';
    this.screenEl.querySelectorAll('.item').forEach((d) => {
      const i = +d.dataset.i;
      d.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.select(i); });
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.select(i);
        const it = s.items[i];
        if (it.kind === 'choice') {
          // the left third steps back, anywhere else forward
          const r = d.getBoundingClientRect();
          this.step(it, e.clientX < r.left + r.width * 0.33 && r.width > 200 ? -1 : 1);
        } else this.activate(i);
      });
    });
    if (s.press) this.screenEl.querySelector('.press')?.addEventListener('pointerdown', () => this.pressStart());
    this.renderHints();
  }

  renderHints() {
    const s = this.cur, dev = this.app.input?.lastDevice;
    const key = `${s?.id}|${dev}`;
    if (key === this.hintKey) return;
    this.hintKey = key;
    if (!s || s.press || s.loading || this.app.isTouch) { this.hintsEl.innerHTML = ''; return; }
    this.hintsEl.innerHTML = dev === 'pad'
      ? '<span><span class="btn a">A</span> Select</span><span><span class="btn b">B</span> Back</span>'
      : '<span><span class="key">Enter</span> Select</span><span><span class="key">Esc</span> Back</span>';
  }

  select(i) {
    const s = this.cur;
    if (!s?.items || i === s.sel) return;
    s.sel = i;
    this.screenEl.querySelectorAll('.item').forEach((d, k) => d.classList.toggle('sel', k === i));
    this.app.audio?.ui?.('move');
  }

  move(d) {
    const s = this.cur;
    if (!s?.items?.length) return;
    let i = s.sel;
    for (let k = 0; k < s.items.length; k++) {
      i = (i + d + s.items.length) % s.items.length;
      if (!s.items[i].off) break;
    }
    this.select(i);
  }

  step(it, d) {
    const cur = it.get();
    let i = it.values.findIndex((v) => v === cur);
    if (i < 0 && it.near) {
      let bd = Infinity;
      it.values.forEach((v, k) => { const dd = Math.abs(v - cur); if (dd < bd) { bd = dd; i = k; } });
    }
    i = ((i < 0 ? 0 : i) + d + it.values.length) % it.values.length;
    it.set(it.values[i]);
    this.app.audio?.ui?.('move');
    const sel = this.cur.sel;
    this.refresh();
    this.cur.sel = sel;
  }

  activate(i) {
    const it = this.cur?.items?.[i];
    if (!it || it.off) return;
    this.app.audio?.ui?.('select');
    if (it.kind === 'choice') this.step(it, 1);
    else it.on?.();
  }

  pressStart() {
    this.app.audio?.unlock?.();
    this.app.audio?.ui?.('select');
    this.reset('main');
  }

  playGame() { this.open('play'); }

  // Pad, keyboard: called every frame while the menus are up.
  update(dt, input) {
    if (!this.visible || !this.cur) return;
    this.renderHints();
    const s = this.cur;
    if (s.loading) return;
    const accept = input.consume('accept') || input.consume('jump');
    const backBtn = input.consume('back_btn') || input.consume('pause');
    if (s.press) {
      if (accept || backBtn || input.consume('primary') || input.consume('inventory')) this.pressStart();
      return;
    }
    // the stick and held keys repeat
    let ay = 0, ax = 0;
    if (input.consume('fwd') || input.consume('up')) ay = 1;
    if (input.consume('back') || input.consume('down')) ay = -1;
    if (input.consume('left') || input.consume('leftpad')) ax = -1;
    if (input.consume('right') || input.consume('rightpad')) ax = 1;
    const sx = input.move.x, sy = input.move.y;
    const stick = Math.abs(sy) > 0.6 ? Math.sign(sy) * 2 : Math.abs(sx) > 0.6 ? Math.sign(sx) * 3 : 0;
    if (!ay && !ax && stick) {
      if (stick !== this.lastAxis) this.repeat = 0;
      this.repeat -= dt;
      if (this.repeat <= 0) {
        this.repeat = stick === this.lastAxis ? 0.13 : 0.38;
        if (Math.abs(stick) === 2) ay = Math.sign(stick); else ax = Math.sign(stick);
      }
    }
    this.lastAxis = stick;
    if (ay) this.move(-ay);
    const it = s.items?.[s.sel];
    if (ax && it?.kind === 'choice') this.step(it, ax);
    if (accept) this.activate(s.sel);
    else if (backBtn) {
      this.app.audio?.ui?.('back');
      this.back();
    }
  }
}
