import { useRef } from 'preact/hooks';
import { useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import { tc } from '../strings/common';

/**
 * Text search. While typing, the game's input ignores keys; Escape clears (or leaves when empty),
 * Enter and the arrow keys leave the field and continue navigation.
 */
export function SearchField({ value, onInput, placeholder, autofocus }: { value: string; onInput: (v: string) => void; placeholder?: string; autofocus?: boolean }) {
  const { focus } = useUi();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label class="hh-search">
      <Icon name="search" class="hh-search-icon" />
      <input
        ref={ref}
        type="search"
        class="hh-search-input"
        data-focusable=""
        data-autofocus={autofocus ? '' : undefined}
        value={value}
        placeholder={placeholder ?? tc('searchPlaceholder')}
        aria-label={tc('search')}
        spellcheck={false}
        autocomplete="off"
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          const el = e.currentTarget as HTMLInputElement;
          if (e.key === 'Escape') {
            e.preventDefault();
            if (el.value) onInput('');
            else el.blur();
          } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            el.blur();
            focus.moveBy(0, 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            el.blur();
            focus.moveBy(0, -1);
          }
        }}
      />
      {value && (
        <button type="button" tabIndex={-1} class="hh-search-clear" aria-label={tc('close')} onClick={() => onInput('')}>
          <Icon name="close" />
        </button>
      )}
    </label>
  );
}
