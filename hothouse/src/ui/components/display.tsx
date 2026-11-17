import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useFocusable, useSound } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { tc } from '../strings/common';

export type Tone = 'neutral' | 'lime' | 'lagoon' | 'gold' | 'pink' | 'coral' | 'danger';

// ── card ─────────────────────────────────────────────────────────────────────

export interface CardProps {
  children: ComponentChildren;
  /** Interactive cards are focusable and pressable. */
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean | string;
  autofocus?: boolean;
  tone?: Tone;
  class?: string;
  label?: string;
  onDetails?: () => void;
  onSecondary?: () => void;
}

export function Card({ children, onPress, selected, disabled, autofocus, tone, class: cls, label, onDetails, onSecondary }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const play = useSound();
  const interactive = !!onPress;
  useFocusable(ref, { onDetails, onSecondary });
  const classes = ['hh-card', interactive ? 'hh-card-interactive' : '', selected ? 'is-selected' : '', disabled ? 'is-disabled' : '', tone ? `hh-tone-${tone}` : '', cls ?? '']
    .filter(Boolean)
    .join(' ');
  if (!interactive) return <div class={classes}>{children}</div>;
  return (
    <div
      ref={ref}
      class={classes}
      role="button"
      tabIndex={-1}
      data-focusable=""
      data-autofocus={autofocus ? '' : undefined}
      aria-pressed={selected === undefined ? undefined : selected}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={label}
      title={typeof disabled === 'string' ? disabled : undefined}
      onClick={() => {
        if (disabled) {
          play('error');
          return;
        }
        play('confirm');
        onPress?.();
      }}
    >
      {children}
    </div>
  );
}

// ── list row ─────────────────────────────────────────────────────────────────

export interface ListRowProps {
  icon?: IconName;
  /** Custom leading visual (portrait, swatch); replaces `icon`. */
  leading?: ComponentChildren;
  title: ComponentChildren;
  subtitle?: ComponentChildren;
  trailing?: ComponentChildren;
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean | string;
  autofocus?: boolean;
  selected?: boolean;
  class?: string;
  onDetails?: () => void;
  onSecondary?: () => void;
}

export function ListRow(p: ListRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const play = useSound();
  useFocusable(ref, { onDetails: p.onDetails, onSecondary: p.onSecondary });
  const interactive = !!p.onPress;
  return (
    <div
      ref={ref}
      class={`hh-row-item${interactive ? ' is-interactive' : ''}${p.selected ? ' is-selected' : ''}${p.disabled ? ' is-disabled' : ''}${p.class ? ` ${p.class}` : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? -1 : undefined}
      data-focusable={interactive ? '' : undefined}
      data-autofocus={p.autofocus ? '' : undefined}
      aria-disabled={p.disabled ? 'true' : undefined}
      onClick={interactive ? () => {
        if (p.disabled) {
          play('error');
          return;
        }
        play('confirm');
        p.onPress?.();
      } : undefined}
    >
      {p.leading ?? (p.icon && <span class="hh-row-icon"><Icon name={p.icon} /></span>)}
      <span class="hh-row-text">
        <span class="hh-row-title">{p.title}</span>
        {p.subtitle && <span class="hh-row-sub">{typeof p.disabled === 'string' ? p.disabled : p.subtitle}</span>}
      </span>
      {p.trailing && <span class="hh-row-trailing">{p.trailing}</span>}
      {p.chevron && <Icon name="chevronRight" class="hh-row-chevron" />}
    </div>
  );
}

// ── chip, badge ──────────────────────────────────────────────────────────────

export function Chip({ children, tone = 'neutral', icon, onPress, selected, class: cls }: { children: ComponentChildren; tone?: Tone; icon?: IconName; onPress?: () => void; selected?: boolean; class?: string }) {
  const play = useSound();
  const body = (
    <>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </>
  );
  if (!onPress) return <span class={`hh-chip hh-tone-${tone}${cls ? ` ${cls}` : ''}`}>{body}</span>;
  return (
    <button
      type="button"
      class={`hh-chip hh-chip-button hh-tone-${tone}${selected ? ' is-selected' : ''}${cls ? ` ${cls}` : ''}`}
      data-focusable=""
      aria-pressed={selected}
      onClick={() => {
        play('confirm');
        onPress();
      }}
    >
      {body}
    </button>
  );
}

export function Badge({ children, tone = 'pink' }: { children: ComponentChildren; tone?: Tone }) {
  return <span class={`hh-badge hh-tone-${tone}`}>{children}</span>;
}

// ── meters ───────────────────────────────────────────────────────────────────

export function Meter({ value, max = 1, tone = 'lime', segments, label, valueLabel, class: cls }: { value: number; max?: number; tone?: Tone; segments?: number; label?: ComponentChildren; valueLabel?: ComponentChildren; class?: string }) {
  const t = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div class={`hh-meter hh-tone-${tone}${cls ? ` ${cls}` : ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      {(label || valueLabel) && (
        <div class="hh-meter-head">
          <span class="hh-meter-label">{label}</span>
          <span class="hh-meter-value hh-num">{valueLabel}</span>
        </div>
      )}
      <div class="hh-meter-track">
        <div class="hh-meter-fill" style={{ width: `${t * 100}%` }} />
        {segments && segments > 1 && (
          <div class="hh-meter-ticks" aria-hidden="true">
            {Array.from({ length: segments - 1 }, (_, i) => <i key={i} style={{ left: `${((i + 1) / segments) * 100}%` }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export function RadialProgress({ value, size = 48, stroke = 4, tone = 'lime', children }: { value: number; size?: number; stroke?: number; tone?: Tone; children?: ComponentChildren }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const t = Math.min(1, Math.max(0, value));
  return (
    <span class={`hh-radial hh-tone-${tone}`} style={{ width: `${size}px`, height: `${size}px` }} role="progressbar" aria-valuenow={Math.round(t * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round"
          stroke-dasharray={`${c * t} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <span class="hh-radial-inner">{children}</span>}
    </span>
  );
}

const STAR = 'M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.7l-5.6 3.1 1.3-6.2L3 9.3l6.3-.7z';

/** 0–5 stars with halves, drawn in gold. */
export function Stars({ value, max = 5, size = '1em' }: { value: number; max?: number; size?: string }) {
  const v = Math.round(value * 2) / 2;
  return (
    <span class="hh-stars" role="img" aria-label={tc.n('stars', v)}>
      {Array.from({ length: max }, (_, i) => {
        const fill = v >= i + 1 ? 1 : v >= i + 0.5 ? 0.5 : 0;
        return (
          <svg key={i} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <defs>
              <clipPath id={`hh-star-half-${i}`}><rect x="0" y="0" width="12" height="24" /></clipPath>
            </defs>
            <path d={STAR} fill="rgba(255,209,102,.18)" stroke="rgba(255,209,102,.5)" stroke-width="1.2" stroke-linejoin="round" />
            {fill > 0 && <path d={STAR} fill="var(--sun-gold)" clip-path={fill < 1 ? `url(#hh-star-half-${i})` : undefined} />}
          </svg>
        );
      })}
    </span>
  );
}

export function Spinner({ size = '1.25em' }: { size?: string }) {
  return <span class="hh-spinner" style={{ width: size, height: size }} role="progressbar" aria-label={tc('loading')} />;
}

// ── empty and locked states ──────────────────────────────────────────────────

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: ComponentChildren; body?: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="hh-empty">
      <span class="hh-empty-icon"><Icon name={icon} size="2.25rem" /></span>
      <div class="hh-empty-title">{title}</div>
      {body && <p class="hh-empty-body">{body}</p>}
      {action && <div class="hh-empty-action">{action}</div>}
    </div>
  );
}

/** "Unlocks at Rank 4 · Sells to Deco Row". */
export function LockedState({ rank, reason, detail }: { rank?: number; reason?: string; detail?: ComponentChildren }) {
  return (
    <div class="hh-locked">
      <span class="hh-locked-icon"><Icon name="lock" /></span>
      <span class="hh-locked-text">
        <span class="hh-locked-title">{reason ?? (rank !== undefined ? tc('unlocksAt', { rank }) : tc('locked'))}</span>
        {detail && <span class="hh-locked-detail">{detail}</span>}
      </span>
    </div>
  );
}

// ── scroll area ──────────────────────────────────────────────────────────────

/** Scrolling region with soft fade edges that appear only when there is more to see. */
export function ScrollArea({ children, class: cls, maxHeight }: { children: ComponentChildren; class?: string; maxHeight?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
  };
  useLayoutEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      class={`hh-scroll hh-scrollarea${edges.top ? ' fade-top' : ''}${edges.bottom ? ' fade-bottom' : ''}${cls ? ` ${cls}` : ''}`}
      style={maxHeight ? { maxHeight } : undefined}
      onScroll={update}
    >
      <div class="hh-scrollarea-inner">{children}</div>
    </div>
  );
}
