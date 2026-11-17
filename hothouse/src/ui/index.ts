import '@preact/signals';
import { h, render } from 'preact';
import type { BindingOverrides } from '@/input';
import type { UiApi, UiDeps } from './api';
import { App } from './App';
import { BINDINGS_KEY, saveBindings } from './core/bindings';
import { FocusManager } from './core/focus';
import { registerBuiltinApps } from './phone/apps';
import { applyTheme } from './core/theme';
import { UiRuntime } from './runtime';
import { installFonts } from './styles/fonts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/controls.css';
import './styles/screens.css';
import './styles/menus.css';
import './styles/cards.css';
import './styles/hud.css';
import './styles/phone.css';

export type { UiApi, UiDeps } from './api';
export * from './api';
export { createHudModel, showCallout, type HudModel } from './hud/model';
export type { IconName } from './icons/names';
export { Icon } from './icons/Icon';

/**
 * Mount the interface into `root` (the `#ui` element) and return its API.
 *
 * Call `ui.update(dtReal)` once per frame after `input.beginFrame()`. Key bindings saved by the
 * Controls screen are restored here from `settings.blob('bindings')`.
 */
export function createUi(root: HTMLElement, deps: UiDeps): UiApi {
  installFonts();
  root.classList.add('hh-ui');
  root.dataset.input = 'pointer';
  const disposeTheme = applyTheme(root, deps.settings, deps.input);
  deps.input.importBindings(deps.settings.blob<BindingOverrides>(BINDINGS_KEY));

  const app = document.createElement('div');
  app.className = 'hh-app';
  const modal = document.createElement('div');
  modal.className = 'hh-layer hh-layer-modal';
  const tooltip = document.createElement('div');
  tooltip.className = 'hh-layer hh-layer-tooltip';
  root.append(app, modal, tooltip);

  const focus = new FocusManager(deps.input, root, deps.sound ?? null);
  const runtime = new UiRuntime(deps, focus);
  registerBuiltinApps(runtime);
  const env = { deps, focus, ticker: runtime.ticker, layers: { modal, tooltip }, tips: runtime.tips, ui: runtime };
  render(h(App, { env }), app);

  const baseDispose = runtime.dispose.bind(runtime);
  runtime.dispose = () => {
    baseDispose();
    render(null, app);
    app.remove();
    modal.remove();
    tooltip.remove();
    disposeTheme();
    root.classList.remove('hh-ui');
  };
  return runtime;
}

export { saveBindings };
