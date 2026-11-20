import { createContext } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';

/**
 * Lets nested content claim the Q/E (LB/RB) tab buttons from the container that owns the focus
 * scope: the Settings body inside the phone switches settings tabs instead of phone apps.
 */
export interface TabHost {
  set(handler: ((dir: -1 | 1) => void) | null): void;
}

export const TabHostContext = createContext<TabHost | null>(null);

export function useTabHost(handler: (dir: -1 | 1) => void): void {
  const host = useContext(TabHostContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!host) return;
    host.set((d) => ref.current(d));
    return () => host.set(null);
  }, [host]);
}

/** A host backed by a ref; the container calls `current?.(dir)` from its scope's onTab. */
export function createTabHost(): TabHost & { current: ((dir: -1 | 1) => void) | null } {
  const host = {
    current: null as ((dir: -1 | 1) => void) | null,
    set(h: ((dir: -1 | 1) => void) | null) {
      host.current = h;
    },
  };
  return host;
}
