import { createContext, type RefObject } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { UiSound } from '@/audio/api';
import type { UiDeps } from '../api';
import type { FocusHandlers, FocusManager, Scope, ScopeOptions } from './focus';
import type { TipController } from './tips';
import type { UiRuntime } from '../runtime';

/** Per-frame callbacks driven by `ui.update(dt)`. */
export class Ticker {
  private readonly fns = new Set<(dt: number) => void>();

  add(fn: (dt: number) => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }

  tick(dt: number): void {
    for (const fn of this.fns) fn(dt);
  }

  get size(): number {
    return this.fns.size;
  }
}

/** Portal targets that sit above the screen layers. */
export interface UiLayers {
  readonly modal: HTMLElement;
  readonly tooltip: HTMLElement;
}

/** What every UI component can reach. */
export interface UiEnv {
  readonly deps: UiDeps;
  readonly focus: FocusManager;
  readonly ticker: Ticker;
  readonly layers: UiLayers;
  readonly tips: TipController;
  readonly ui: UiRuntime;
}

export const UiContext = createContext<UiEnv | null>(null);

export function useUi(): UiEnv {
  const env = useContext(UiContext);
  if (!env) throw new Error('UI component rendered outside <UiContext.Provider>');
  return env;
}

/** Play an interface sound (no-op without an audio sink). */
export function useSound(): (sound: UiSound) => void {
  const { deps } = useUi();
  return (sound) => deps.sound?.ui(sound);
}

/** Register `fn` with the UI ticker for the lifetime of the component (always the latest closure). */
export function useTick(fn: (dt: number) => void, active = true): void {
  const { ticker } = useUi();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => (active ? ticker.add((dt) => ref.current(dt)) : undefined), [ticker, active]);
}

/**
 * Make `ref`'s element a focus scope while mounted. Options are read live, so handlers may close
 * over component state.
 */
export function useFocusScope(ref: RefObject<HTMLElement | null>, opts: ScopeOptions, active = true): RefObject<Scope | null> {
  const { focus } = useUi();
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const scopeRef = useRef<Scope | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    el.setAttribute('data-scope', opts.name);
    const live: ScopeOptions = {
      name: opts.name,
      context: opts.context,
      wrap: opts.wrap,
      onBack: () => optsRef.current.onBack?.(),
      onTab: (d) => optsRef.current.onTab?.(d),
      onDetails: () => optsRef.current.onDetails?.(),
      onSecondary: () => optsRef.current.onSecondary?.(),
    };
    const scope = focus.push(el, live);
    scopeRef.current = scope;
    return () => {
      focus.remove(scope);
      scopeRef.current = null;
    };
  }, [focus, active]);
  return scopeRef;
}

/** Register typed focus behaviour for `ref`'s element (which must carry `data-focusable`). */
export function useFocusable(ref: RefObject<HTMLElement | null>, handlers: FocusHandlers): void {
  const { focus } = useUi();
  const hRef = useRef(handlers);
  hRef.current = handlers;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const live: FocusHandlers = {
      get hold() {
        return hRef.current.hold;
      },
      onAdjust: (d) => hRef.current.onAdjust?.(d),
      onDetails: hRef.current.onDetails ? () => hRef.current.onDetails?.() : undefined,
      onSecondary: hRef.current.onSecondary ? () => hRef.current.onSecondary?.() : undefined,
      onHoldProgress: (p) => hRef.current.onHoldProgress?.(p),
      onHoldComplete: () => hRef.current.onHoldComplete?.(),
      onFocus: () => hRef.current.onFocus?.(),
      onBlur: () => hRef.current.onBlur?.(),
    };
    if (!hRef.current.onAdjust) delete live.onAdjust;
    return focus.register(el, live);
  }, [focus, !!handlers.onAdjust, !!handlers.onDetails, !!handlers.onSecondary]);
}
