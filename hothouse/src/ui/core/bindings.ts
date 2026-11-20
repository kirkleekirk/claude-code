import type { Input } from '@/input';
import type { Settings } from '@/save';

export const BINDINGS_KEY = 'bindings';

/** Persist the current bindings (called by the Controls screen after every change). */
export function saveBindings(input: Input, settings: Settings): void {
  settings.setBlob(BINDINGS_KEY, input.exportBindings());
}
