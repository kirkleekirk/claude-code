import { signal } from '@preact/signals-core';
import type { Input, InputContext } from '@/input';
import type { UiSoundSink } from '../api';
import { dirFrom, pickFirst, pickNext, type Rect } from './nav';

/**
 * One focus system for mouse, keyboard and gamepad.
 *
 * - Scopes stack (screen → modal → menu). Only the top scope receives navigation; closing it
 *   restores focus to where it was in the scope below. Each scope may push an input context.
 * - Focusable elements carry `data-focusable`; the manager finds them in the DOM on demand.
 *   Components register typed behaviour (adjust, details, secondary, hold) with `register`.
 * - Activation calls `el.click()`, so mouse and pad share one code path in components.
 * - The ring is drawn by CSS for `[data-focused]` when the root says the last input was keyboard
 *   or gamepad; hovering never steals focus.
 */

export interface FocusHandlers {
  /** Left/right on a focused control (sliders, toggles, cyclers). */
  onAdjust?(dx: -1 | 1): void;
  /** Details / tooltip (I · Y). */
  onDetails?(): void;
  /** Secondary action (R · X). */
  onSecondary?(): void;
  /** Requires a hold to activate (destructive actions). */
  hold?: boolean;
  onHoldProgress?(progress: number): void;
  onHoldComplete?(): void;
  onFocus?(): void;
  onBlur?(): void;
}

export interface ScopeOptions {
  name: string;
  /** Input context to push while open; null for scopes that must not take gameplay input. */
  context?: InputContext | null;
  onBack?(): void;
  onTab?(dir: -1 | 1): void;
  onDetails?(): void;
  onSecondary?(): void;
  /** Wrap vertical/horizontal navigation at the edges. */
  wrap?: boolean;
}

export interface Scope {
  readonly el: HTMLElement;
  opts: ScopeOptions;
  focused: HTMLElement | null;
  pop: (() => void) | null;
  needsAutofocus: boolean;
}

export type InputMode = 'pointer' | 'keyboard' | 'gamepad';

export const HOLD_SECONDS = 0.6;
const SCROLL_SPEED = 900;

function visible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.closest('[data-inert]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function scrollParent(el: HTMLElement, stop: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== stop.parentElement) {
    if (p.classList.contains('hh-scroll')) return p;
    p = p.parentElement;
  }
  return null;
}

export class FocusManager {
  readonly scopes: Scope[] = [];
  /** Bumps whenever the stack changes (for components that render scope-dependent hints). */
  readonly version = signal(0);
  readonly mode = signal<InputMode>('pointer');
  /** Tap instead of hold (settings: game.holdToToggle). */
  holdToToggle = false;

  private readonly handlers = new WeakMap<HTMLElement, FocusHandlers>();
  private holdEl: HTMLElement | null = null;
  private holdT = 0;
  private readonly unlisten: Array<() => void> = [];

  constructor(
    private readonly input: Input,
    private readonly root: HTMLElement,
    private readonly sound: UiSoundSink | null,
  ) {
    const on = (type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, opts);
      this.unlisten.push(() => window.removeEventListener(type, fn, opts));
    };
    on('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'Shift' && k !== 'Control' && k !== 'Alt' && k !== 'Meta') this.setMode('keyboard');
      // Our system handles activation; stop native Enter/Space clicks on focused buttons.
      const t = e.target as HTMLElement | null;
      if ((k === 'Enter' || k === ' ') && t && this.root.contains(t) && !this.isTextField(t)) e.preventDefault();
    }, { capture: true });
    on('pointerdown', () => this.setMode('pointer'), { capture: true });
    on('pointermove', (e) => {
      const p = e as PointerEvent;
      if (Math.abs(p.movementX) + Math.abs(p.movementY) > 2) this.setMode('pointer');
    }, { passive: true });
    // Mouse clicks move logical focus too, so arrows continue from what was clicked.
    this.root.addEventListener('focusin', this.onFocusIn);
    this.unlisten.push(() => this.root.removeEventListener('focusin', this.onFocusIn));
    this.unlisten.push(input.device.subscribe((d) => d === 'gamepad' && this.setMode('gamepad')));
  }

  // ── registration ─────────────────────────────────────────────────────────

  register(el: HTMLElement, handlers: FocusHandlers): () => void {
    this.handlers.set(el, handlers);
    return () => {
      if (this.handlers.get(el) === handlers) this.handlers.delete(el);
      if (this.holdEl === el) this.cancelHold();
    };
  }

  push(el: HTMLElement, opts: ScopeOptions): Scope {
    const ctx = opts.context === undefined ? 'menu' : opts.context;
    const scope: Scope = { el, opts, focused: null, pop: ctx ? this.input.pushContext(ctx) : null, needsAutofocus: true };
    this.scopes.push(scope);
    this.cancelHold();
    this.version.value++;
    return scope;
  }

  remove(scope: Scope): void {
    const i = this.scopes.indexOf(scope);
    if (i < 0) return;
    this.scopes.splice(i, 1);
    scope.pop?.();
    scope.pop = null;
    if (scope.focused) this.clearFocusMark(scope.focused);
    this.cancelHold();
    const top = this.top;
    if (top && i === this.scopes.length) {
      // Returning to the scope below: restore its focus on the next update.
      top.needsAutofocus = !top.focused || !top.focused.isConnected;
      if (top.focused?.isConnected) this.applyFocus(top, top.focused, false);
    }
    this.version.value++;
  }

  get top(): Scope | null {
    return this.scopes[this.scopes.length - 1] ?? null;
  }

  /** True if any scope that takes input is open. */
  get capturing(): boolean {
    return this.scopes.some((s) => s.opts.context !== null);
  }

  focusables(scope: Scope): HTMLElement[] {
    const nodes = scope.el.querySelectorAll<HTMLElement>('[data-focusable]');
    const out: HTMLElement[] = [];
    nodes.forEach((n) => {
      // Skip elements that belong to a nested scope rendered inside this one.
      if (n.closest('[data-scope]') !== scope.el) return;
      if (visible(n)) out.push(n);
    });
    return out;
  }

  /** Move focus in the top scope as if the player pressed a direction. */
  moveBy(dx: number, dy: number): void {
    const scope = this.top;
    if (scope) this.move(scope, dx, dy);
  }

  /** Focus an element programmatically (e.g. after a list reorders). */
  focus(el: HTMLElement, withSound = false): void {
    const scope = this.scopes.find((s) => s.el.contains(el));
    if (scope) this.applyFocus(scope, el, withSound);
  }

  // ── per frame ────────────────────────────────────────────────────────────

  update(dt: number): void {
    const scope = this.top;
    if (!scope) return;
    if (scope.needsAutofocus) this.autofocus(scope);
    else if (scope.focused && !scope.focused.isConnected) this.autofocus(scope);

    const input = this.input;
    const focused = scope.focused;
    const h = focused ? this.handlers.get(focused) : undefined;

    // Hold-to-confirm in progress.
    if (this.holdEl) {
      if (this.holdEl !== focused || !input.down('uiConfirm')) {
        this.cancelHold();
      } else {
        this.holdT += dt;
        const p = Math.min(1, this.holdT / HOLD_SECONDS);
        this.handlers.get(this.holdEl)?.onHoldProgress?.(p);
        if (p >= 1) {
          const done = this.handlers.get(this.holdEl);
          this.holdEl = null;
          this.holdT = 0;
          done?.onHoldProgress?.(0);
          done?.onHoldComplete?.();
        }
      }
    }

    const nav = input.nav();
    if (nav.x !== 0 && focused && h?.onAdjust) {
      h.onAdjust(nav.x > 0 ? 1 : -1);
    } else if (nav.x !== 0 || nav.y !== 0) {
      this.move(scope, nav.x, nav.y);
    }

    if (input.pressed('uiConfirm') && focused) {
      if (h?.hold && !this.holdToToggle) {
        this.holdEl = focused;
        this.holdT = 0;
        h.onHoldProgress?.(0.001);
      } else if (h?.hold) {
        h.onHoldComplete?.();
      } else {
        focused.click();
      }
    }
    if (input.pressed('uiBack') && scope.opts.onBack) {
      this.sound?.ui('back');
      scope.opts.onBack();
      return;
    }
    if (input.pressed('uiTabPrev') && scope.opts.onTab) scope.opts.onTab(-1);
    if (input.pressed('uiTabNext') && scope.opts.onTab) scope.opts.onTab(1);
    if (input.pressed('uiDetails')) (h?.onDetails ?? scope.opts.onDetails)?.();
    if (input.pressed('uiSecondary')) (h?.onSecondary ?? scope.opts.onSecondary)?.();

    const scroll = input.value('uiScroll');
    if (Math.abs(scroll) > 0.15) {
      const target = (focused && scrollParent(focused, scope.el)) ?? scope.el.querySelector<HTMLElement>('.hh-scroll');
      if (target) target.scrollTop += scroll * SCROLL_SPEED * dt;
    }
  }

  dispose(): void {
    for (const off of this.unlisten) off();
    this.unlisten.length = 0;
    while (this.scopes.length) this.remove(this.scopes[this.scopes.length - 1]!);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private setMode(mode: InputMode): void {
    if (this.mode.peek() !== mode) {
      this.mode.value = mode;
      this.root.dataset.input = mode;
    }
  }

  private isTextField(el: HTMLElement): boolean {
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  }

  private autofocus(scope: Scope): void {
    const items = this.focusables(scope);
    if (items.length === 0) return; // content not rendered yet; try again next frame
    scope.needsAutofocus = false;
    const remembered = scope.focused && scope.focused.isConnected && items.includes(scope.focused) ? scope.focused : null;
    const preferred = remembered ?? items.find((el) => el.hasAttribute('data-autofocus')) ?? items[pickFirst(items.map(rectOf))]!;
    this.applyFocus(scope, preferred, false);
  }

  private move(scope: Scope, dx: number, dy: number): void {
    const items = this.focusables(scope);
    if (items.length === 0) return;
    const current = scope.focused && items.includes(scope.focused) ? scope.focused : null;
    if (!current) {
      this.applyFocus(scope, items[pickFirst(items.map(rectOf))]!, true);
      return;
    }
    const dir = dirFrom(dx, dy);
    if (!dir) return;
    const candidates = items.filter((el) => el !== current);
    const i = pickNext(rectOf(current), candidates.map(rectOf), dir, scope.opts.wrap ?? false);
    if (i >= 0) this.applyFocus(scope, candidates[i]!, true);
  }

  private applyFocus(scope: Scope, el: HTMLElement, withSound: boolean): void {
    const prev = scope.focused;
    if (prev && prev !== el) {
      this.clearFocusMark(prev);
      this.handlers.get(prev)?.onBlur?.();
    }
    scope.focused = el;
    el.setAttribute('data-focused', '');
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    this.scrollIntoView(scope, el);
    if (prev !== el) {
      this.handlers.get(el)?.onFocus?.();
      if (withSound) this.sound?.ui('focus');
      this.cancelHold();
    }
  }

  private clearFocusMark(el: HTMLElement): void {
    el.removeAttribute('data-focused');
  }

  private scrollIntoView(scope: Scope, el: HTMLElement): void {
    const sp = scrollParent(el, scope.el);
    if (!sp) return;
    const er = el.getBoundingClientRect();
    const pr = sp.getBoundingClientRect();
    const pad = 16;
    if (er.top < pr.top + pad) sp.scrollTop -= pr.top + pad - er.top;
    else if (er.bottom > pr.bottom - pad) sp.scrollTop += er.bottom - (pr.bottom - pad);
  }

  private cancelHold(): void {
    if (!this.holdEl) return;
    this.handlers.get(this.holdEl)?.onHoldProgress?.(0);
    this.holdEl = null;
    this.holdT = 0;
  }

  private readonly onFocusIn = (e: FocusEvent): void => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-focusable]');
    if (!el) return;
    const scope = this.top;
    if (!scope || !scope.el.contains(el) || scope.focused === el) return;
    if (el.closest('[data-scope]') !== scope.el) return;
    this.applyFocus(scope, el, false);
  };
}
