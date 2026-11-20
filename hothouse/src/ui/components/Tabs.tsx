import { useSound } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { tc } from '../strings/common';
import { Glyph } from './Glyph';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
  badge?: number;
}

/**
 * Tab strip. Q/E (LB/RB) switch tabs through the owning scope's `onTab`; mouse users click.
 * Tabs are not separately focusable, so up/down always moves through the content.
 */
export function Tabs<T extends string>({ tabs, value, onChange, compact }: { tabs: readonly TabDef<T>[]; value: T; onChange: (id: T) => void; compact?: boolean }) {
  const play = useSound();
  return (
    <div class={`hh-tabs${compact ? ' hh-tabs-compact' : ''}`}>
      <span class="hh-tabs-glyph" aria-hidden="true"><Glyph action="uiTabPrev" size="sm" /></span>
      <div class="hh-tabs-list" role="tablist" aria-label={tc('tabsHint')}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            tabIndex={-1}
            aria-selected={t.id === value}
            class={`hh-tab${t.id === value ? ' is-on' : ''}`}
            onClick={() => {
              if (t.id === value) return;
              play('tab');
              onChange(t.id);
            }}
          >
            {t.icon && <Icon name={t.icon} />}
            <span>{t.label}</span>
            {t.badge ? <span class="hh-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      <span class="hh-tabs-glyph" aria-hidden="true"><Glyph action="uiTabNext" size="sm" /></span>
    </div>
  );
}

/** Next tab id with wrap; for scope `onTab` handlers. */
export function cycleTab<T extends string>(tabs: readonly TabDef<T>[], value: T, dir: -1 | 1): T {
  const i = Math.max(0, tabs.findIndex((t) => t.id === value));
  return tabs[(i + dir + tabs.length) % tabs.length]!.id;
}
