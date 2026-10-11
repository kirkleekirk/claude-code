// The front end, in the Xbox original's style: the world turning slowly behind, the logo, and a
// plain list of white words with the chosen one in red. Works the same with a pad (stick or
// d-pad, A and B), the keyboard (arrows or WASD, Enter and Esc), the mouse and touch.

import { logoSVG } from './logo.js';
import { AWARDS } from '../game/awards.js';
import { PRESETS, SKIN_TONES, HAIR_COLORS, SHIRT_TINTS } from '../entities/avatar/looks.js';
import { ALPHABET, CODE_LENGTH, cleanCode } from '../net/link.js';

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
.menu .note { position: absolute; left: 4.5%; bottom: 3.2%; font-size: 0.62em; font-weight: 600; color: rgba(255,255,255,0.55); max-width: 46em; white-space: pre-line; }
.menu .item .val.text { gap: 0.18em; min-width: 0; }
.menu .val.text .cb { display: inline-grid; place-items: center; width: 1.25em; height: 1.45em; border: 0.08em solid rgba(255,255,255,0.45); background: rgba(0,0,0,0.35); font-weight: 800; }
.menu .item.sel .val.text .cb.at { border-color: var(--menu-hi); }
.menu .val.text .cb.ed { background: var(--menu-hi); border-color: #fff; color: #fff; }
.menu .val.text .free { min-width: 6em; padding: 0 0.25em; border-bottom: 0.08em solid rgba(255,255,255,0.45); }
.menu .item.sel .val.text .free::after { content: ''; display: inline-block; width: 0.08em; height: 1em; margin-left: 0.06em; vertical-align: -0.12em; background: var(--menu-hi); animation: pulse 1s steps(2) infinite; }
.menu .val.text .free .ed { background: var(--menu-hi); }
.menu .bigcode { display: flex; gap: 0.25em; font-size: 2.6em; font-weight: 800; letter-spacing: 0.02em; margin: 0.1em 0 0.35em; }
.menu .bigcode b { display: inline-grid; place-items: center; width: 1.2em; height: 1.4em; background: rgba(0,0,0,0.45); border: 0.05em solid rgba(255,255,255,0.6); }
.menu .who { font-size: 0.85em; font-weight: 700; color: var(--ink-dim); margin-bottom: 0.9em; }
`;

// what a name may be made of, and the order a pad steps through it
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
const nameChar = (c) => (/^[\p{L}\p{N} _'.-]$/u.test(c) ? c : '');

const yes = (b) => (b ? 'On' : 'Off');
// text from elsewhere (a friend's name, an error), shown as text
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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
    // the code being typed on the Join screen, and a text row a pad is changing ({ it, pos })
    this.joinCode = '';
    this.edit = null;
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
            { label: 'Host Online Game', on: () => this.open('host') },
            { label: 'Join Online Game', on: () => this.open('join') },
            { label: 'Back', on: () => this.back() },
          ].filter(Boolean),
        };
      }
      case 'host': {
        const m = app.saveInfo();
        return {
          id, title: 'Host Online Game',
          sub: "Play your world with friends. Once it's loaded you'll get a code to give them, and they join with it. Online, the game doesn't stop for the pause menu.",
          items: [
            m ? { label: 'Continue Game', small: `Day ${m.days ?? m.day} · ${m.maxDistance ?? 0} m`, on: () => app.continueGame({ host: true }) } : null,
            { label: 'New World', on: () => (m ? this.open('confirmNew', { host: true }) : app.newWorld({ host: true })) },
            { label: 'Back', on: () => this.back() },
          ].filter(Boolean),
        };
      }
      case 'join': return {
        id, title: 'Join Online Game', typing: true,
        sub: 'Type the code from your friend\'s screen (it\'s under Invite Friends in their pause menu).',
        items: [
          { label: 'Code', kind: 'text', fixed: true, max: CODE_LENGTH, cycle: ALPHABET, filter: cleanCode, get: () => this.joinCode, set: (v) => { this.joinCode = v; }, enter: () => app.joinOnline(this.joinCode) },
          { label: 'Your Name', kind: 'text', max: 16, cycle: NAME_CHARS, filter: nameChar, get: () => app.profile.name ?? app.netName(), set: (v) => app.setName(v), enter: () => app.joinOnline(this.joinCode) },
          { label: 'Join', on: () => app.joinOnline(this.joinCode) },
          { label: 'Back', on: () => this.back() },
        ],
      };
      case 'confirmNew': return {
        id, title: 'Start A New World?', sub: 'Your current world and everything in it will be lost.',
        items: [{ label: 'No', on: () => this.back() }, { label: 'Yes', on: () => app.newWorld({ host: !!arg?.host }) }],
      };
      case 'pause': {
        const o = app.game?.online, guest = o && !o.host, others = o ? o.players.size : 0;
        return {
          id, dim: true, small: true,
          sub: o ? (guest ? `Online · ${o.count} players` : `Online · Code ${o.code} · ${o.count} player${o.count === 1 ? '' : 's'}`) : '',
          items: [
            { label: 'Return To Game', on: () => app.resume() },
            guest ? null : { label: 'Invite Friends', small: o ? `Code ${o.code}` : '', on: () => { app.hostOnline(); this.open('invite'); } },
            others ? { label: 'Teleport To Player', on: () => this.open('teleport') } : null,
            { label: 'Options', on: () => this.open('options') },
            { label: 'Choose Avatar', on: () => this.open('avatar') },
            { label: 'Awards', on: () => this.open('awards') },
            { label: 'Help & Controls', on: () => this.open('help') },
            guest ? { label: 'Leave Game', on: () => app.leaveOnline() }
              : { label: 'Save And Quit', on: () => (others ? this.open('confirmEnd') : app.quitToMenu()) },
          ].filter(Boolean),
          back: () => app.resume(),
        };
      }
      case 'invite': {
        const o = app.game?.online;
        const names = o ? [`${o.myName} (you)`, ...[...o.players.values()].map((p) => p.name)].join(', ') : '';
        const html = o
          ? `<div><div class="bigcode txt">${[...o.code].map((c) => `<b>${c}</b>`).join('')}</div><div class="who txt">Here now: ${esc(names)}</div></div>`
          : '';
        return {
          id, title: 'Invite Friends', small: true, dim: true, html,
          sub: o ? 'Your friends open StarMiner Z, choose Play Game, then Join Online Game, and type this code. Up to seven can join.'
            : app.hosting ? 'Opening your game to friends...'
              : app.hostError ? `Couldn't open your game online. ${app.hostError}` : '',
          items: [
            !o && !app.hosting && app.hostError ? { label: 'Try Again', on: () => { app.hostOnline(); this.refresh(); } } : null,
            { label: 'Back', on: () => this.back() },
          ].filter(Boolean),
        };
      }
      case 'teleport': {
        const o = app.game?.online;
        const list = o ? [...o.players.values()] : [];
        return {
          id, title: 'Teleport To Player', small: true, dim: true,
          sub: list.length ? '' : 'No one else is here.',
          items: [
            ...list.map((p) => ({ label: esc(p.name), small: p.dead ? 'dead' : '', off: p.dead, on: () => { if (app.game.teleportTo(p.id)) app.resume(); } })),
            { label: 'Back', on: () => this.back() },
          ],
        };
      }
      case 'name': {
        // the original's on-screen keyboard over the game (a locator's name)
        const q = app.nameAsk || { value: '', max: 10 };
        const done = () => { const v = (q.value || '').trim(); app.resume(); if (v) q.done?.(v); };
        return {
          id, title: q.title || 'Name', small: true, dim: true, typing: true, sub: q.sub || '',
          items: [
            { label: 'Name', kind: 'text', max: q.max || 10, cycle: NAME_CHARS, filter: nameChar, get: () => q.value, set: (v) => { q.value = v; }, enter: done },
            { label: 'Done', on: done },
            { label: 'Cancel', on: () => app.resume() },
          ],
          back: () => app.resume(),
        };
      }
      case 'confirmEnd': return {
        id, title: 'End The Game?', small: true, dim: true,
        sub: 'Your friends will go back to their menus. Your world is saved, with what they have, for next time.',
        items: [{ label: 'No', on: () => this.back() }, { label: 'Yes', on: () => app.quitToMenu() }],
      };
      case 'notice': return {
        id, title: arg?.title || '', sub: arg?.sub || '',
        items: [{ label: 'OK', on: () => { this.reset('main'); if (arg?.then) this.open(arg.then); } }],
        back: () => { this.reset('main'); if (arg?.then) this.open(arg.then); },
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
          <p>Out past the first hills, things have come down from the sky: craters with an asteroid of space rock in them, glowing Space Goo in the rock. Aliens live round them, and noise brings more of them, quicker: digging the rock, or shooting inside it. Deep underground and far out lives the Felguard, a demon of the Underworld; once you've met one, it can turn up anywhere.</p>
          <p>Dragons fly over the world: Fire, Forest, Sand, Ice and Undead, each tougher than the last. One comes the first time you get 100, 500, 1000, 2600 and 4000 meters out, and stay too long in one place and they come for you there. Out under the sky they'll see you, and gunfire draws them; under a roof or in a cave they can't. Their fireballs break blocks (the Ice Dragon's freeze them); shoot one down and it leaves explosive powder and ore. The Anti Dragon Guided Missile locks on when you aim at a dragon at the shoulder (the box goes from green to red) and fires only once it has.</p>
          <h3>Keyboard & Mouse</h3>
          <div class="grid"><b>Move</b><span>W A S D</span><b>Look</b><span>Mouse</span><b>Jump</b><span>Space</span><b>Sprint</b><span>Shift</span><b>Crouch</b><span>C or Ctrl</span>
          <b>Use (dig, shoot, place)</b><span>Left click</span><b>Aim / Open, light</b><span>Right click</span><b>Reload</b><span>R</span><b>Items</b><span>1-8 or the wheel</span>
          <b>Inventory</b><span>E or Tab</span><b>Drop</b><span>Q</span><b>Camera</b><span>V</span><b>Pause</b><span>Esc</span></div>
          <h3>Xbox Controller</h3>
          <div class="grid"><b>Move / Look</b><span>Left / right stick</span><b>Jump</b><span>A</span><b>Use (dig, shoot, place)</b><span>Right trigger</span><b>Aim / Place</b><span>Left trigger</span>
          <b>Open, light</b><span>B, looking at a door, a crate or TNT</span><b>Reload</b><span>X</span><b>Inventory</b><span>Y</span><b>Items</b><span>Bumpers, d-pad left and right</span>
          <b>Sprint</b><span>Left stick click</span><b>Camera</b><span>D-pad up, or Back</span><b>Pause</b><span>Start (or B)</span></div>
          <h3>Touch</h3>
          <p>Left thumb moves, right thumb looks. Hold the use button to dig, fire or build; tap place to build, aim, or open a door or a crate. Tap the hotbar to switch items.</p>
          <h3>Things To Use</h3>
          <p>A block in hand goes down with either trigger (either mouse button), and doesn't dig: take out a pick or a spade for that. TNT and C4 go off four seconds after they're lit, with B (right click) or a swing of anything but a spade (a spade digs them up); a bullet sets them off at once. Grenades cook while you hold the trigger and are thrown when you let go: cook too long and they go off sooner. A rocket launcher fires its one rocket. Laser guns knock out the block their bolt stops in, and bounce off bedrock, bloodstone and diamond walls.</p>
          <p>Doors go in a gap with room for both halves; B (right click) opens and shuts them. A crate holds 32 stacks and keeps them with the world; B (right click) opens it, and breaking it spills what's in it. The locator marks the block you aim it at and points the way there; reload names it. The teleporter marks one too, and its left trigger takes you there, once. The clock tells the time.</p>
          <h3>Inventory and Crafting</h3>
          <p>On the inventory screen, click or tap something in the backpack or the hotbar to pick it up, then a slot to put it there, or drag it. Shift-click sends a stack across, backpack to hotbar or back; right-click picks up half a stack, or puts down one. Q, or letting go of it outside the panel, drops it. With a controller, the d-pad or the stick moves the selector: A picks up and puts down, the right stick splits, X drops.</p>
          <p>Y (or E) goes to crafting. The recipes you know are down the left, the ones you can make first: you learn one once you carry what it makes, one of the things it takes, or a gun it makes the bullets for. Up and down choose a recipe, left and right its components; A makes it, or on a component goes to that component's recipe. Shift-click makes as many as you can. Y, E or B goes back.</p>
          <p>In a crate, its slots are at the top: things move between it and your backpack as they do on the inventory screen, and Y (shift-click) sends a stack across. Online, the slot a friend is on is theirs until they move off it.</p>
          <p>When you die, what's in your backpack falls where you fell. The hotbar stays with you.</p>
          <h3>Playing Online</h3>
          <p>To host, choose Play Game, then Host Online Game (or Invite Friends from the pause menu of a game you're in). You get a five-letter code: your friends choose Join Online Game and type it. Up to eight can play. Everyone plays in the host's world, saved on the host's machine, and what each friend carries is kept with it for when they come back. Each player's dead come for that player, and anyone can shoot them. Online, the game goes on while the pause menu is up, and Teleport To Player there takes you to a friend.</p>
          <p>Keep the game in front: a browser stops running a page whose tab is hidden. Online play needs an internet connection, and doesn't work inside the Claude artifact viewer.</p>
          <h3>On an Xbox</h3>
          <p>In Microsoft Edge, hold the Menu button and choose Use game controls, so the controller plays the game instead of moving a pointer. B pauses (unless you're looking at a door, a crate or TNT) and the d-pad's up changes the camera, because Edge keeps the View button for itself (if the controller stops answering, press the Xbox button twice). If it runs slowly, turn off Edge's "Apps can add a border" setting (Settings, System) and lower View Distance in Options.</p>
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
          <p>three.js and PeerJS (MIT). Fonts: Archivo Black and Open Sans (SIL Open Font License).</p>
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
    if (app.cmzBodies) have.push('its zombies, skeletons, the Felguard, the aliens and the dragons');
    if (app.cmzPlayer) have.push('its avatar animations and the models of what you hold');
    if (document.documentElement.classList.contains('cmz-ui')) have.push('its inventory and crafting screens');
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
    if (this.cur) this.stack.push([this.cur.id, this.cur.arg]);
    this.show(id, arg);
  }

  replace(id, arg) { this.show(id, arg); }

  back() {
    const prev = this.stack.pop();
    if (prev) this.show(prev[0], prev[1]);
    else if (this.cur?.back) this.cur.back();
  }

  reset(id, arg) { this.stack = []; this.show(id, arg); }

  // a message with an OK (then: a screen to go on to from the main menu)
  notice(title, sub, then = null) { this.reset('notice', { title, sub, then }); }

  show(id, arg) {
    const s = this.build(id, arg);
    if (!s) return;
    s.sel = 0;
    s.arg = arg;
    this.cur = s;
    this.edit = null;
    this.visible = true;
    this.el.classList.add('on');
    this.el.classList.toggle('dim', !!s.dim);
    this.el.classList.toggle('small-logo', !!s.small);
    this.typing(s);
    this.render();
    this.app.onMenuScreen?.(s);
  }

  hide() {
    this.visible = false;
    this.cur = null;
    this.stack = [];
    this.edit = null;
    this.typing(null);
    this.el.classList.remove('on');
  }

  refresh() {
    if (!this.cur) return;
    const sel = this.cur.sel, s = this.build(this.cur.id, this.cur.arg);
    if (!s) return;
    s.sel = Math.min(sel, (s.items || []).length - 1);
    s.arg = this.cur.arg;
    this.cur = s;
    if (this.edit) this.edit.it = s.items.find((x) => x.label === this.edit.it.label) || null;
    if (!this.edit?.it) this.edit = null;
    this.render();
  }

  // ---- typing (the Join screen) ---------------------------------------------------------------

  // a screen with text on it takes the keys you type (arrows, Enter and Esc still steer)
  typing(s) {
    const input = this.app.input;
    if (input) input.textSink = s?.typing ? (ch) => this.type(ch) : null;
  }

  // the text row a key goes to: the one chosen, or the first
  textItem() {
    const s = this.cur, it = s?.items?.[s.sel];
    return it?.kind === 'text' ? it : s?.items?.find((x) => x.kind === 'text') || null;
  }

  type(ch) {
    const it = this.textItem();
    if (!it) return;
    let v = it.get() || '';
    if (ch === '\b') v = v.trimEnd().slice(0, -1);
    else {
      const c = it.filter ? it.filter(ch) : ch;
      if (!c) return;
      v = v.trimEnd();
      if (v.length >= it.max) return;
      v += c;
    }
    it.set(v);
    this.edit = null;
    this.refresh();
  }

  // A pad changes text a letter at a time: up and down step through the letters, left and right
  // move along, X rubs one out, A or B is done.
  editText(it, ax, ay, del) {
    const E = this.edit;
    let v = it.get() || '';
    const last = it.fixed ? it.max - 1 : Math.min(it.max - 1, v.length);
    if (ax) E.pos = Math.max(0, Math.min(last, E.pos + ax));
    if (ay || del) {
      const chars = [...v.padEnd(E.pos + 1, ' ')];
      if (del) chars[E.pos] = ' ';
      else {
        const cy = it.cycle, k = cy.indexOf(chars[E.pos]);
        chars[E.pos] = cy[((k < 0 ? (ay > 0 ? -1 : 0) : k) + ay + cy.length) % cy.length];
      }
      v = chars.join('');
      if (!it.fixed) v = v.trimEnd();
      it.set(it.fixed ? v.slice(0, it.max) : v);
    }
    this.app.audio?.ui?.('move');
    this.refresh();
  }

  // a text row: boxes for a code, a line for a name
  textHTML(it) {
    const v = it.get() || '';
    const E = this.edit?.it === it ? this.edit : null;
    if (it.fixed) {
      const at = E ? E.pos : Math.min(v.trimEnd().length, it.max - 1);
      let h = '';
      for (let i = 0; i < it.max; i++) {
        const c = (v[i] || ' ').trim();
        h += `<span class="cb${E && i === at ? ' ed' : !E && i === at ? ' at' : ''}">${esc(c) || '&nbsp;'}</span>`;
      }
      return `<span class="val text">${h}</span>`;
    }
    let h = '';
    [...v].forEach((c, i) => { h += E && i === E.pos ? `<span class="ed">${esc(c) === ' ' ? '&nbsp;' : esc(c)}</span>` : esc(c); });
    if (E && E.pos >= v.length) h += '<span class="ed">&nbsp;</span>';
    return `<span class="val text"><span class="free">${h || '&nbsp;'}</span></span>`;
  }

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
        const val = it.kind === 'choice' ? `<span class="val"><span class="ar">◀</span><span>${it.fmt(it.get())}</span><span class="ar">▶</span></span>`
          : it.kind === 'text' ? this.textHTML(it) : '';
        const small = it.small ? `<small>${it.small}</small>` : '';
        h += `<div class="item${i === s.sel ? ' sel' : ''}${it.off ? ' off' : ''}" data-i="${i}"><span>${it.label}</span>${small}${val}</div>`;
      });
      h += '</div>';
    }
    this.screenEl.innerHTML = h;
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
        } else if (it.kind === 'text') this.pointText(it, e);
        else this.activate(i);
      });
    });
    if (s.press) this.screenEl.querySelector('.press')?.addEventListener('pointerdown', () => this.pressStart());
    this.hintKey = '';
    this.renderHints();
  }

  renderHints() {
    const s = this.cur, app = this.app, dev = app.input?.lastDevice;
    // on an Xbox, until the controller is heard from: how to give it to the game
    const xbox = app.isXbox && !app.input?.padActive && (s?.id === 'title' || s?.id === 'main');
    const key = `${s?.id}|${dev}|${!!this.edit}|${xbox}`;
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.noteEl.textContent = [
      s?.note ? 'StarMiner Z is a fan remake inspired by CastleMiner Z (DigitalDNA Games). Not affiliated with DigitalDNA Games or Microsoft.' : '',
      xbox ? 'On an Xbox: hold the Menu button on the controller and choose "Use game controls" to play with it.' : '',
    ].filter(Boolean).join('\n');
    if (!s || s.press || s.loading || app.isTouch) { this.hintsEl.innerHTML = ''; return; }
    if (this.edit) {
      this.hintsEl.innerHTML = '<span>Up / Down Letter</span><span>Left / Right Move</span><span><span class="btn x">X</span> Delete</span><span><span class="btn a">A</span> Done</span>';
      return;
    }
    this.hintsEl.innerHTML = dev === 'pad'
      ? '<span><span class="btn a">A</span> Select</span><span><span class="btn b">B</span> Back</span>'
      : `${s.typing ? '<span>Type To Fill In</span>' : ''}<span><span class="key">Enter</span> Select</span><span><span class="key">Esc</span> Back</span>`;
  }

  // a tap on a text row brings up the device's keyboard (a mouse just picks the row: type away)
  pointText(it, e) {
    if (e.pointerType === 'mouse') return;
    let v = null;
    try { v = window.prompt(it.label, (it.get() || '').trim()); } catch { v = null; }
    if (v == null) return;
    it.set([...v].map((c) => (it.filter ? it.filter(c) : c)).join('').slice(0, it.max));
    this.refresh();
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
    else if (it.kind === 'text') this.activateText(it);
    else it.on?.();
  }

  // A on a text row: change it a letter at a time; Enter: on with what it's for
  activateText(it) {
    const dev = this.app.input?.lastDevice;
    if (dev === 'pad') {
      const v = (it.get() || '').trimEnd();
      this.edit = { it, pos: Math.min(v.length, it.max - 1) };
      this.render();
    } else if (dev === 'touch') this.pointText(it, { pointerType: 'touch' });
    else it.enter?.();
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
    if (this.edit) {
      const del = input.consume('reload');
      if (accept || backBtn) { this.edit = null; this.app.audio?.ui?.('select'); this.render(); return; }
      if (ax || ay || del) this.editText(this.edit.it, ax, ay, del);
      return;
    }
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
