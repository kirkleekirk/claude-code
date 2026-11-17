import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { UiSound } from '@/audio/api';
import type { ActionId } from '@/input';
import { useFocusable, useSound, useTick, useUi } from '../core/context';
import { HOLD_SECONDS } from '../core/focus';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { Glyph } from './Glyph';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  /** Show this action's live glyph inside the button (e.g. the hold key). */
  glyph?: ActionId;
  children?: ComponentChildren;
  onPress?: () => void;
  /** `true` or a reason string ("Unlocks at Rank 4"); the reason becomes the tooltip. */
  disabled?: boolean | string;
  loading?: boolean;
  autofocus?: boolean;
  /** Destructive: hold for 0.6 s (or tap with the Tap-instead-of-hold setting). */
  hold?: boolean;
  /** Sound on press; null for silent. */
  sound?: UiSound | null;
  wide?: boolean;
  class?: string;
  label?: string;
  onDetails?: () => void;
  onSecondary?: () => void;
}

/** SVG progress ring for hold actions. */
export function HoldRing({ progress, size = 28 }: { progress: number; size?: number }) {
  const r = 10;
  const c = 2 * Math.PI * r;
  return (
    <svg class="hh-holdring" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2.5" />
      <circle
        cx="12" cy="12" r={r} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
        stroke-dasharray={`${c * progress} ${c}`} transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

export function Button(props: ButtonProps) {
  const {
    variant = 'secondary', size = 'md', icon, iconRight, glyph, children, onPress, disabled, loading, autofocus,
    hold = false, sound = 'confirm', wide, class: cls, label, onDetails, onSecondary,
  } = props;
  const { deps, focus } = useUi();
  const play = useSound();
  const ref = useRef<HTMLButtonElement>(null);
  const [progress, setProgressState] = useState(0);
  const progRef = useRef(0);
  const setProgress = (p: number) => {
    progRef.current = p;
    setProgressState(p);
  };
  const pointerHold = useRef(false);
  const isDisabled = !!disabled || !!loading;
  const holdToToggle = deps.settings.get('game.holdToToggle');

  const fire = () => {
    if (isDisabled) {
      play(loading ? 'locked' : 'error');
      return;
    }
    if (sound) play(sound);
    onPress?.();
  };

  useFocusable(ref, {
    hold: hold && !isDisabled,
    onHoldProgress: (p) => setProgress(p),
    onHoldComplete: () => {
      setProgress(0);
      fire();
    },
    onDetails,
    onSecondary,
  });

  // Mouse / touch hold.
  useTick((dt) => {
    if (!pointerHold.current) return;
    const next = Math.min(1, progRef.current + dt / HOLD_SECONDS);
    if (next >= 1) {
      pointerHold.current = false;
      setProgress(0);
      fire();
    } else {
      setProgress(next);
    }
  }, hold);

  const onClick = () => {
    if (hold && !holdToToggle && !isDisabled) return; // holds complete through progress, not clicks
    fire();
  };

  const classes = [
    'hh-btn', `hh-btn-${variant}`, `hh-btn-${size}`, wide ? 'hh-btn-wide' : '', hold ? 'hh-btn-hold' : '',
    isDisabled ? 'is-disabled' : '', loading ? 'is-loading' : '', progress > 0 ? 'is-holding' : '', cls ?? '',
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type="button"
      class={classes}
      data-focusable=""
      data-autofocus={autofocus ? '' : undefined}
      aria-disabled={isDisabled ? 'true' : undefined}
      aria-busy={loading ? 'true' : undefined}
      aria-label={label}
      title={typeof disabled === 'string' ? disabled : undefined}
      onClick={onClick}
      onPointerDown={hold && !holdToToggle && !isDisabled ? (e) => {
        if (e.button !== 0) return;
        pointerHold.current = true;
        focus.focus(e.currentTarget as HTMLElement);
      } : undefined}
      onPointerUp={hold ? () => { pointerHold.current = false; setProgress(0); } : undefined}
      onPointerLeave={hold ? () => { pointerHold.current = false; setProgress(0); } : undefined}
      style={hold ? { '--hold': String(progress) } : undefined}
    >
      {hold && <span class="hh-btn-holdfill" aria-hidden="true" />}
      {loading ? <span class="hh-spinner" aria-hidden="true" /> : icon && <Icon name={icon} class="hh-btn-icon" />}
      {children !== undefined && <span class="hh-btn-label">{children}</span>}
      {iconRight && <Icon name={iconRight} class="hh-btn-icon" />}
      {glyph && (hold && !holdToToggle ? (
        <span class="hh-btn-glyph"><HoldRing progress={progress} size={22} /><Glyph action={glyph} size="sm" /></span>
      ) : (
        <span class="hh-btn-glyph"><Glyph action={glyph} size="sm" /></span>
      ))}
    </button>
  );
}

export interface IconButtonProps {
  icon: IconName;
  /** Required accessible name; also the tooltip. */
  label: string;
  onPress?: () => void;
  variant?: 'ghost' | 'glass' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  badge?: number;
  autofocus?: boolean;
  sound?: UiSound | null;
  class?: string;
}

export function IconButton({ icon, label, onPress, variant = 'ghost', size = 'md', disabled, badge, autofocus, sound = 'confirm', class: cls }: IconButtonProps) {
  const play = useSound();
  return (
    <button
      type="button"
      class={`hh-iconbtn hh-iconbtn-${variant} hh-iconbtn-${size}${disabled ? ' is-disabled' : ''}${cls ? ` ${cls}` : ''}`}
      data-focusable=""
      data-autofocus={autofocus ? '' : undefined}
      aria-label={label}
      title={label}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => {
        if (disabled) {
          play('error');
          return;
        }
        if (sound) play(sound);
        onPress?.();
      }}
    >
      <Icon name={icon} />
      {badge !== undefined && badge > 0 && <span class="hh-badge hh-badge-dot">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}
