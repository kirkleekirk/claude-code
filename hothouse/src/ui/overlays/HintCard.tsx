import type { ActionId } from '@/input';
import { Glyph } from '../components/Glyph';
import { useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import { tc } from '../strings/common';

/** Ofelia's margin note: one hint at a time on a slip of notebook paper. */
export function HintCard() {
  const { ui } = useUi();
  const hint = ui.currentHint.value;
  if (!hint) return null;
  return (
    <div class="hh-hint hh-interactive" key={hint.id} role="note">
      <div class="hh-hint-paper">
        <p class="hh-hint-text">
          {hint.action && (
            <span class="hh-hint-glyph"><Glyph action={hint.action as ActionId} size="sm" /></span>
          )}
          {hint.text}
        </p>
        <span class="hh-hint-sign">— O.</span>
        <button type="button" class="hh-hint-close" aria-label={tc('dismiss')} title={tc('dismiss')} onClick={() => ui.dismissHint()}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
