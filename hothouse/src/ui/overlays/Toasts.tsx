import { fmt } from '@/core/i18n';
import type { ToastKind } from '../api';
import { formatDelta } from '../core/countup';
import { useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { Portrait } from '../portrait/Portrait';

const KIND_ICON: Record<ToastKind, IconName> = {
  info: 'info', money: 'cash', message: 'messages', event: 'calendar', success: 'check', warning: 'warning', danger: 'siren', xp: 'xp',
};

/** Max three, newest on top, top-left under the objective banner. */
export function Toasts() {
  const { ui } = useUi();
  const toasts = ui.toasts.value;
  if (toasts.length === 0) return null;
  return (
    <div class="hh-toasts" role="status" aria-live="polite">
      {toasts.slice(0, 4).map((t) => {
        const kind = t.spec.kind ?? 'info';
        return (
          <div key={t.id} class={`hh-toast hh-toast-${kind}${t.leaving ? ' is-leaving' : ''}`}>
            {t.spec.portrait ? (
              <Portrait appearance={t.spec.portrait} framing="head" shape="circle" size="2.75rem" blink={false} />
            ) : (
              <span class="hh-toast-icon"><Icon name={t.spec.icon ?? KIND_ICON[kind]} /></span>
            )}
            <span class="hh-toast-text">
              <span class="hh-toast-title">
                <span class="hh-toast-title-text">{t.spec.title}</span>
                {t.spec.deltas?.map((d) => (
                  <span key={d.label} class={`hh-toast-delta ${d.value >= 0 ? 'is-gain' : 'is-loss'}`}>
                    {d.format === 'money' ? formatDelta(d.value, (a) => fmt.money(a)) : formatDelta(d.value, (a) => fmt.int(a))} {d.label}
                  </span>
                ))}
              </span>
              {t.spec.body && <span class="hh-toast-body">{t.spec.body}</span>}
            </span>
            {t.spec.action && (
              <button
                type="button"
                class="hh-toast-action hh-interactive"
                onClick={() => {
                  t.spec.action!.run();
                  ui.dismissToast(t.id);
                }}
              >
                {t.spec.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
