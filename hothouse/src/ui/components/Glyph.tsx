import type { ComponentChildren } from 'preact';
import { Pad, type ActionId, type Glyph as GlyphData } from '@/input';
import { useUi } from '../core/context';

/**
 * Live input glyphs. Re-render automatically when the active device, the pad style or the
 * bindings change (they are signals read during render).
 */

const TRIGGERS: Record<string, true> = { LT: true, RT: true, L2: true, R2: true, ZL: true, ZR: true };
const BUMPERS: Record<string, true> = { LB: true, RB: true, L1: true, R1: true, L: true, R: true };

function padShape(g: GlyphData): 'face' | 'trigger' | 'bumper' | 'dpad' | 'menu' | 'stick' {
  if (g.kind === 'stick') return 'stick';
  const button = Number(g.id.split(':')[2]);
  if (button >= Pad.Up && button <= Pad.Right) return 'dpad';
  if (button === Pad.View || button === Pad.Menu) return 'menu';
  if (button === Pad.L3 || button === Pad.R3) return 'stick';
  if (TRIGGERS[g.label]) return 'trigger';
  if (BUMPERS[g.label]) return 'bumper';
  return 'face';
}

const DPAD_ROT: Record<number, number> = { [Pad.Up]: 0, [Pad.Right]: 90, [Pad.Down]: 180, [Pad.Left]: 270 };

export function GlyphMark({ g, size = 'md' }: { g: GlyphData; size?: 'sm' | 'md' | 'lg' }) {
  if (g.kind === 'key') {
    return (
      <kbd class={`hh-glyph hh-key hh-glyph-${size}${g.label.length > 2 ? ' hh-key-wide' : ''}`} aria-label={g.label}>
        {g.label}
      </kbd>
    );
  }
  if (g.kind === 'mouse') {
    const btn = Number(g.id.split(':')[1]);
    return (
      <span class={`hh-glyph hh-mouse hh-glyph-${size}`} aria-label={g.label} role="img">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="3" width="12" height="18" rx="6" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 3v7.5M6 10.5h12" stroke="currentColor" stroke-width="1.6" fill="none" />
          {btn === 0 && <path d="M12 3.4a5.6 5.6 0 0 0-5.6 5.6v1.1H12z" fill="var(--lime)" />}
          {btn === 2 && <path d="M12 3.4a5.6 5.6 0 0 1 5.6 5.6v1.1H12z" fill="var(--lime)" />}
          {btn === 1 && <rect x="11" y="5" width="2" height="4" rx="1" fill="var(--lime)" />}
        </svg>
      </span>
    );
  }
  const shape = padShape(g);
  if (shape === 'dpad') {
    const button = Number(g.id.split(':')[2]);
    return (
      <span class={`hh-glyph hh-pad hh-pad-dpad hh-glyph-${size}`} aria-label={`D-pad ${['up', 'down', 'left', 'right'][button - Pad.Up]}`} role="img">
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${DPAD_ROT[button] ?? 0}deg)` }}>
          <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="rgba(255,244,227,.16)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
          <path d="M9.6 3.6h4.8v5.6H9.6z" fill="var(--cream)" />
        </svg>
      </span>
    );
  }
  if (shape === 'stick') {
    return (
      <span class={`hh-glyph hh-pad hh-pad-stick hh-glyph-${size}`} aria-label={`${g.label} stick`} role="img">
        {g.label.replace('3', '')}
      </span>
    );
  }
  return (
    <span
      class={`hh-glyph hh-pad hh-pad-${shape} hh-glyph-${size}`}
      style={g.color ? { '--pad-color': g.color } : undefined}
      aria-label={g.label}
      role="img"
    >
      {g.label}
    </span>
  );
}

/** The current binding(s) for an action. `all` shows every alternative (axes show both halves). */
export function Glyph({ action, size = 'md', all = false }: { action: ActionId; size?: 'sm' | 'md' | 'lg'; all?: boolean }) {
  const { deps } = useUi();
  const input = deps.input;
  // Subscribe to everything that changes the art.
  void input.device.value;
  void input.padStyle.value;
  void input.bindingsVersion.value;
  const glyphs = input.glyphs(action);
  if (glyphs.length === 0) return null;
  const shown = all ? glyphs : glyphs.slice(0, 1);
  return (
    <span class="hh-glyphs">
      {shown.map((g) => (
        <GlyphMark key={g.id} g={g} size={size} />
      ))}
    </span>
  );
}

/** Glyph + verb, the standard prompt token: "[E] Harvest". */
export function ActionHint({ action, also, children, size = 'md' }: { action: ActionId; also?: ActionId; children: ComponentChildren; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span class="hh-action-hint">
      <Glyph action={action} size={size} />
      {also && <Glyph action={also} size={size} />}
      <span class="hh-action-hint-label">{children}</span>
    </span>
  );
}
