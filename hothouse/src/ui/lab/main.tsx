import '@preact/signals';
import { signal } from '@preact/signals-core';
import { h, render } from 'preact';
import { Input } from '@/input';
import { MemoryStore, SaveManager, Settings, type SettingId } from '@/save';
import type { UiDeps } from '../api';
import { App } from '../App';
import { FocusManager } from '../core/focus';
import { applyTheme } from '../core/theme';
import { UiContext, type UiEnv } from '../core/context';
import { registerBuiltinApps } from '../phone/apps';
import { UiRuntime } from '../runtime';
import { SunsetArt } from '../screens/SunsetArt';
import { installFonts, fontsReady } from '../styles/fonts';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/controls.css';
import '../styles/screens.css';
import '../styles/menus.css';
import '../styles/cards.css';
import '../styles/hud.css';
import '../styles/phone.css';
import './lab.css';
import { createLabActions, createLabPhotos, labLog } from './mocks';
import { openScreen, SCREENS, type LabContext, type ScreenId } from './scenarios';
import { Showcase } from './Showcase';

/**
 * UI lab (dev only): mounts the real interface with mock providers and opens any screen by URL:
 * `ui-lab.html?screen=mainMenu&scale=150&input=gamepad&bg=bright&qa=1`.
 * QA scripts drive it through `window.__UILAB__`.
 */

const params = new URLSearchParams(location.search);
const qa = params.has('qa');

const stage = document.getElementById('stage')!;
const root = document.getElementById('ui')!;
const store = new MemoryStore();
const settings = new Settings(store);
const scale = Number(params.get('scale'));
if (Number.isFinite(scale) && scale >= 80 && scale <= 150) settings.set('a11y.uiScale', scale);
for (const [k, v] of params) {
  if (k.startsWith('set.')) {
    const id = k.slice(4) as SettingId;
    settings.set(id, (v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v) as never);
  }
}
const saves = new SaveManager(store);
const input = new Input();
input.attach(stage);
const photos = createLabPhotos();
let runtimeRef: UiRuntime | null = null;
const actions = createLabActions(() => runtimeRef, saves);
const deps: UiDeps = {
  input, settings, saves, actions, photos, version: 'lab',
  sound: { ui: (s) => labLog.entries.push(`sound:${s}`) },
  blip: () => undefined,
  applyGraphicsPreset: (p) => labLog.entries.push(`preset:${p}`),
  onUserGesture: () => labLog.entries.push('gesture'),
};

installFonts();
root.classList.add('hh-ui');
root.dataset.input = 'pointer';
applyTheme(root, settings, input);
const app = document.createElement('div');
const modal = document.createElement('div');
modal.className = 'hh-layer hh-layer-modal';
const tooltip = document.createElement('div');
tooltip.className = 'hh-layer hh-layer-tooltip';
const showcaseHost = document.createElement('div');
showcaseHost.className = 'hh-layer hh-layer-screen';
root.append(app, showcaseHost, modal, tooltip);

const focus = new FocusManager(input, root, deps.sound ?? null);
const ui = new UiRuntime(deps, focus);
runtimeRef = ui;
registerBuiltinApps(ui);
const env: UiEnv = { deps, focus, ticker: ui.ticker, layers: { modal, tooltip }, tips: ui.tips, ui };
render(h(App, { env }), app);

const showcase = signal<'components' | 'portraits' | null>(null);
function ShowcaseLayer() {
  const kind = showcase.value;
  return kind ? h(Showcase, { kind }) : null;
}
render(h(UiContext.Provider, { value: env }, h(ShowcaseLayer, {})), showcaseHost);

const bg = params.get('bg') ?? 'art';
stage.dataset.bg = bg;
if (bg === 'art') render(h(SunsetArt, { dim: 0 }), stage);

const ctx: LabContext = { ui, input, saves, photos, showcase };
const forced = params.get('input');
if (forced === 'gamepad') {
  input.device.value = 'gamepad';
  root.dataset.input = 'gamepad';
} else if (forced === 'keyboard') {
  root.dataset.input = 'keyboard';
}

// Frame loop: the lab stands in for the game loop.
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.beginFrame(dt);
  ui.update(dt);
  input.endFixedStep();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

async function open(id: ScreenId): Promise<void> {
  await openScreen(ctx, id);
  if (forced === 'gamepad') root.dataset.input = 'gamepad';
}

const lab = {
  ready: false,
  screens: SCREENS,
  ui,
  input,
  settings,
  saves,
  focus,
  log: labLog.entries,
  open,
  /** Simulate a press: hold an action for a couple of frames, then release. */
  async press(action: Parameters<Input['inject']>[0], value = 1, frames = 2): Promise<void> {
    input.inject(action, value);
    for (let i = 0; i < frames; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
    input.inject(action, null);
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  },
  /** Hold an action for `ms` (hold-to-confirm). */
  async hold(action: Parameters<Input['inject']>[0], ms: number): Promise<void> {
    input.inject(action, 1);
    await new Promise((r) => setTimeout(r, ms));
    input.inject(action, null);
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  },
  focusedText(): string {
    const el = document.querySelector('[data-focused]');
    return el ? (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  },
};
(window as unknown as { __UILAB__: typeof lab }).__UILAB__ = lab;

// Dev picker (hidden in QA runs).
if (!qa) {
  const picker = document.createElement('select');
  picker.className = 'lab-picker';
  for (const s of SCREENS) picker.add(new Option(s, s));
  picker.addEventListener('change', () => void open(picker.value as ScreenId));
  document.body.appendChild(picker);
  const initial = (params.get('screen') as ScreenId) || 'mainMenu';
  picker.value = initial;
}

void (async () => {
  await fontsReady();
  const initial = (params.get('screen') as ScreenId | null) ?? 'mainMenu';
  await open(SCREENS.includes(initial) ? initial : 'mainMenu');
  lab.ready = true;
})();
