import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { clamp } from '@/core/math';
import { useFocusable, useSound } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { tc } from '../strings/common';

/**
 * Form controls. A `Field` is the focusable row (label, description, control); it owns keyboard and
 * gamepad behaviour (left/right adjusts, confirm activates). The control views inside are
 * pointer-interactive but not separately focusable, so a pad user moves row by row.
 */

export interface FieldProps {
  label: ComponentChildren;
  desc?: ComponentChildren;
  icon?: IconName;
  children: ComponentChildren;
  onAdjust?: (dx: -1 | 1) => void;
  onActivate?: () => void;
  onFocus?: () => void;
  onDetails?: () => void;
  onSecondary?: () => void;
  disabled?: string | boolean;
  autofocus?: boolean;
  /** Stack the control under the label (wide sliders). */
  stacked?: boolean;
  /** Mark the value as changed from its default (a small dot). */
  modified?: boolean;
  class?: string;
}

export function Field(p: FieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const play = useSound();
  const disabled = !!p.disabled;
  useFocusable(ref, {
    onAdjust: p.onAdjust && !disabled ? p.onAdjust : undefined,
    onFocus: p.onFocus,
    onDetails: p.onDetails,
    onSecondary: p.onSecondary,
  });
  return (
    <div
      ref={ref}
      class={`hh-field${p.stacked ? ' hh-field-stacked' : ''}${disabled ? ' is-disabled' : ''}${p.class ? ` ${p.class}` : ''}`}
      data-focusable=""
      data-autofocus={p.autofocus ? '' : undefined}
      tabIndex={-1}
      role="group"
      aria-disabled={disabled ? 'true' : undefined}
      onClick={(e) => {
        // Clicks on the control itself are handled by the control.
        if ((e.target as HTMLElement).closest('.hh-ctl')) return;
        if (disabled) {
          play('error');
          return;
        }
        p.onActivate?.();
      }}
    >
      <div class="hh-field-text">
        <div class="hh-field-label">
          {p.icon && <Icon name={p.icon} class="hh-field-icon" />}
          <span>{p.label}</span>
          {p.modified && <span class="hh-field-mod" aria-label="changed" />}
        </div>
        {p.desc && <div class="hh-field-desc">{typeof p.disabled === 'string' ? p.disabled : p.desc}</div>}
      </div>
      <div class="hh-field-control">{p.children}</div>
    </div>
  );
}

// ── toggle ───────────────────────────────────────────────────────────────────

export function ToggleView({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const play = useSound();
  return (
    <button
      type="button"
      class={`hh-ctl hh-toggle${checked ? ' is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      tabIndex={-1}
      onClick={() => {
        play(checked ? 'toggleOff' : 'toggleOn');
        onChange(!checked);
      }}
    >
      <span class="hh-toggle-knob" />
      <span class="hh-toggle-text">{checked ? tc('on') : tc('off')}</span>
    </button>
  );
}

// ── slider ───────────────────────────────────────────────────────────────────

export interface SliderViewProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Show the numeric value beside the track (default true). */
  showValue?: boolean;
}

export function snapTo(v: number, min: number, max: number, step: number): number {
  const s = Math.round((v - min) / step) * step + min;
  return clamp(Math.round(s * 1e6) / 1e6, min, max);
}

export function SliderView({ value, min, max, step, onChange, format, showValue = true }: SliderViewProps) {
  const play = useSound();
  const track = useRef<HTMLDivElement>(null);
  const t = max > min ? (value - min) / (max - min) : 0;
  const fromPointer = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = snapTo(min + ((clientX - r.left) / r.width) * (max - min), min, max, step);
    if (v !== value) {
      play('slider');
      onChange(v);
    }
  };
  return (
    <div class="hh-ctl hh-slider">
      <div
        ref={track}
        class="hh-slider-track"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format ? format(value) : String(value)}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) fromPointer(e.clientX);
        }}
      >
        <div class="hh-slider-rail" />
        <div class="hh-slider-fill" style={{ width: `${t * 100}%` }} />
        <div class="hh-slider-thumb" style={{ left: `${t * 100}%` }} />
      </div>
      {showValue && <span class="hh-slider-value hh-num">{format ? format(value) : value}</span>}
    </div>
  );
}

/** Keyboard/pad adjustment for a slider row: one step per press, faster on held repeat. */
export function adjustSlider(value: number, dx: -1 | 1, min: number, max: number, step: number): number {
  return snapTo(value + dx * step, min, max, step);
}

// ── stepper ──────────────────────────────────────────────────────────────────

export function StepperView({ value, min, max, onChange, format }: { value: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const play = useSound();
  const set = (v: number) => {
    const c = clamp(v, min, max);
    if (c === value) {
      play('error');
      return;
    }
    play('slider');
    onChange(c);
  };
  return (
    <div class="hh-ctl hh-stepper">
      <button type="button" tabIndex={-1} class="hh-stepper-btn" aria-label="Decrease" disabled={value <= min} onClick={() => set(value - 1)}>
        <Icon name="minus" />
      </button>
      <span class="hh-stepper-value hh-num">{format ? format(value) : value}</span>
      <button type="button" tabIndex={-1} class="hh-stepper-btn" aria-label="Increase" disabled={value >= max} onClick={() => set(value + 1)}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

// ── segmented and cycler ─────────────────────────────────────────────────────

export interface Option<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export function SegmentedView<T extends string>({ options, value, onChange }: { options: readonly Option<T>[]; value: T; onChange: (v: T) => void }) {
  const play = useSound();
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div class="hh-ctl hh-segmented" role="radiogroup" style={{ '--seg-n': String(options.length), '--seg-i': String(idx) }}>
      <span class="hh-segmented-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          tabIndex={-1}
          role="radio"
          aria-checked={o.value === value}
          class={`hh-segmented-opt${o.value === value ? ' is-on' : ''}`}
          onClick={() => {
            if (o.value === value) return;
            play('tab');
            onChange(o.value);
          }}
        >
          {o.icon && <Icon name={o.icon} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function CyclerView<T extends string>({ options, value, onChange }: { options: readonly Option<T>[]; value: T; onChange: (v: T) => void }) {
  const play = useSound();
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const go = (d: -1 | 1) => {
    const next = options[(idx + d + options.length) % options.length]!;
    play('slider');
    onChange(next.value);
  };
  return (
    <div class="hh-ctl hh-cycler">
      <button type="button" tabIndex={-1} class="hh-cycler-btn" aria-label="Previous" onClick={() => go(-1)}>
        <Icon name="chevronLeft" />
      </button>
      <span class="hh-cycler-value">{options[idx]?.label}</span>
      <span class="hh-cycler-dots" aria-hidden="true">
        {options.map((o, i) => <i key={o.value} class={i === idx ? 'is-on' : ''} />)}
      </span>
      <button type="button" tabIndex={-1} class="hh-cycler-btn" aria-label="Next" onClick={() => go(1)}>
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

/** Move through options with wrap (cycler) or clamp (segmented). */
export function stepOption<T extends string>(options: readonly Option<T>[], value: T, dx: -1 | 1, wrap: boolean): T {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  const j = wrap ? (i + dx + n) % n : clamp(i + dx, 0, n - 1);
  return options[j]!.value;
}
