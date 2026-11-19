import { clamp } from '@/core/math';
import type { Input, PadStyle } from '@/input';
import type { Settings } from '@/save';

/**
 * Applies interface-related settings live: rem scale, contrast, motion, fonts, colour-blind
 * palette, glass blur, flashing, HUD scale/opacity, subtitle size, and the controller glyph style.
 * Returns a disposer.
 */
export function applyTheme(root: HTMLElement, settings: Settings, input: Input): () => void {
  const html = document.documentElement;
  const subs: Array<() => void> = [];

  const rescale = () => {
    const scale = settings.peek('a11y.uiScale') / 100;
    const vh = clamp(innerHeight / 1080, 0.9, 2);
    const px = 16 * scale * vh;
    html.style.fontSize = `${Math.round(px * 100) / 100}px`;
    root.style.setProperty('--ui-scale', String(scale));
  };

  subs.push(settings.watch('a11y.uiScale', rescale));
  subs.push(settings.watch('a11y.highContrast', (v) => (root.dataset.contrast = v ? 'high' : 'normal')));
  subs.push(settings.watch('a11y.reducedMotion', (v) => (root.dataset.motion = v ? 'reduced' : 'full')));
  subs.push(settings.watch('a11y.dyslexiaFont', (v) => (root.dataset.font = v ? 'dyslexic' : 'default')));
  subs.push(settings.watch('a11y.colorblind', (v) => (root.dataset.cb = v)));
  subs.push(settings.watch('a11y.reduceFlashing', (v) => (root.dataset.flash = v ? 'reduced' : 'full')));
  subs.push(settings.watch('gfx.uiBlur', (v) => (root.dataset.blur = v ? 'on' : 'off')));
  subs.push(settings.watch('a11y.hudScale', (v) => root.style.setProperty('--hud-scale', String(v / 100))));
  subs.push(settings.watch('a11y.hudOpacity', (v) => root.style.setProperty('--hud-opacity', String(v / 100))));
  subs.push(settings.watch('a11y.subtitleSize', (v) => (root.dataset.subs = v)));
  subs.push(settings.watch('a11y.subtitleBackground', (v) => (root.dataset.subsBg = v ? 'on' : 'off')));
  subs.push(
    settings.watch('controls.glyphs', (v) => {
      input.padStyleOverride = v === 'auto' ? null : (v as PadStyle);
      input.bindingsVersion.value++;
    }),
  );

  addEventListener('resize', rescale);
  subs.push(() => removeEventListener('resize', rescale));
  rescale();

  return () => {
    for (const off of subs) off();
    html.style.fontSize = '';
  };
}
