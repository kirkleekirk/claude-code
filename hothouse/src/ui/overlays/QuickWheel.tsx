import { useRef } from 'preact/hooks';
import { useTick, useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import { tActions } from '../strings/common';
import { tCards } from '../strings/menus';

const RADIUS = 9.5; // rem, slot ring radius
const DEADZONE = 0.35;
const MOUSE_SCALE = 1 / 90;

/**
 * Hold Q / LB to open, point with the mouse or either stick, release to choose. Selection is an
 * angle sector, so it works with flicks as well as careful aiming.
 */
export function QuickWheel() {
  const { ui, deps } = useUi();
  const open = ui.wheelOpen.value;
  const slots = ui.wheelSlots.value;
  const selected = ui.wheelSelected.value;
  const cursor = useRef({ x: 0, y: 0 });
  const tmp = useRef({ x: 0, y: 0 });

  useTick(() => {
    if (!ui.wheelOpen.peek()) {
      cursor.current.x = 0;
      cursor.current.y = 0;
      return;
    }
    const input = deps.input;
    const c = cursor.current;
    input.mouseDelta(tmp.current);
    c.x = Math.max(-1.5, Math.min(1.5, c.x + tmp.current.x * MOUSE_SCALE));
    c.y = Math.max(-1.5, Math.min(1.5, c.y + tmp.current.y * MOUSE_SCALE));
    const sx = input.value('lookX') || input.value('moveX');
    const sy = input.value('lookY') || -input.value('moveY');
    if (Math.hypot(sx, sy) > DEADZONE) {
      c.x = sx;
      c.y = sy;
    }
    const n = ui.wheelSlots.peek().length;
    let pick = -1;
    if (n > 0 && Math.hypot(c.x, c.y) > DEADZONE) {
      // Slot 0 sits at the top; angles run clockwise.
      const a = Math.atan2(c.x, -c.y);
      pick = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / n)) % n;
    }
    if (pick !== ui.wheelSelected.peek()) {
      ui.wheelSelected.value = pick;
      if (pick >= 0) deps.sound?.ui('wheelTick');
    }
  });

  if (!open || slots.length === 0) return null;
  const sel = selected >= 0 ? slots[selected] : undefined;
  return (
    <div class="hh-wheel" role="menu" aria-label={tActions('quickWheel')}>
      <div class="hh-wheel-ring" data-backdrop="" />
      {slots.map((s, i) => {
        const a = (i / slots.length) * Math.PI * 2;
        const x = Math.sin(a) * RADIUS;
        const y = -Math.cos(a) * RADIUS;
        return (
          <div
            key={s.id}
            class={`hh-wheel-slot${i === selected ? ' is-selected' : ''}${s.disabledReason ? ' is-disabled' : ''}`}
            style={{ transform: `translate(${x}rem, ${y}rem)` }}
            role="menuitem"
            aria-disabled={s.disabledReason ? 'true' : undefined}
          >
            <Icon name={s.icon} size="1.6rem" />
            <span>{s.label}</span>
          </div>
        );
      })}
      <div class="hh-wheel-center">
        {sel ? (
          <>
            <span class="hh-wheel-label">{sel.label}</span>
            {sel.disabledReason && <span class="hh-wheel-reason">{sel.disabledReason}</span>}
          </>
        ) : (
          <span class="hh-wheel-hint">{tCards('wheelHint')}</span>
        )}
      </div>
    </div>
  );
}
