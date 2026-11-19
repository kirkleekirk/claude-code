import { createPortal, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { InputContext } from '@/input';
import { useFocusScope, useSound, useUi } from '../core/context';
import { placeTip } from '../core/tips';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { tc } from '../strings/common';
import { IconButton } from './Button';

let ids = 0;

export interface ModalProps {
  title: ComponentChildren;
  icon?: IconName;
  children?: ComponentChildren;
  /** Footer buttons, primary last (it sits on the right). */
  actions?: ComponentChildren;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'danger';
  /** Hide the corner close button (the actions handle closing). */
  bare?: boolean;
  context?: InputContext | null;
}

/** Centred glass dialog over a scrim, rendered in the modal layer. Back closes it. */
export function Modal({ title, icon, children, actions, onClose, size = 'md', tone = 'default', bare, context }: ModalProps) {
  const { layers } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useRef(`hh-modal-${++ids}`);
  useFocusScope(ref, { name: 'modal', onBack: onClose, context: context ?? 'menu' });
  return createPortal(
    <div class="hh-modal-root hh-interactive">
      <div class="hh-scrim" onClick={onClose} />
      <div ref={ref} class={`hh-modal hh-glass hh-modal-${size} hh-modal-${tone}`} role="dialog" aria-modal="true" aria-labelledby={titleId.current}>
        <header class="hh-modal-head">
          {icon && <span class="hh-modal-icon"><Icon name={icon} /></span>}
          <h2 id={titleId.current} class="hh-modal-title">{title}</h2>
          {!bare && <IconButton icon="close" label={tc('close')} onPress={onClose} sound="back" size="sm" />}
        </header>
        {children !== undefined && <div class="hh-modal-body">{children}</div>}
        {actions && <footer class="hh-modal-actions">{actions}</footer>}
      </div>
    </div>,
    layers.modal,
  );
}

/** Side panel sliding in from the right, for details and secondary flows. */
export function Drawer({ title, children, actions, onClose, width = '28rem' }: { title: ComponentChildren; children: ComponentChildren; actions?: ComponentChildren; onClose: () => void; width?: string }) {
  const { layers } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  useFocusScope(ref, { name: 'drawer', onBack: onClose });
  return createPortal(
    <div class="hh-modal-root hh-interactive">
      <div class="hh-scrim" onClick={onClose} />
      <div ref={ref} class="hh-drawer hh-glass" style={{ width }} role="dialog" aria-modal="true">
        <header class="hh-modal-head">
          <h2 class="hh-modal-title">{title}</h2>
          <IconButton icon="close" label={tc('close')} onPress={onClose} sound="back" size="sm" />
        </header>
        <div class="hh-drawer-body hh-scroll">{children}</div>
        {actions && <footer class="hh-modal-actions">{actions}</footer>}
      </div>
    </div>,
    layers.modal,
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: string;
  run: () => void;
}

/** Small anchored action menu (e.g. a save slot's More button). */
export function ContextMenu({ anchor, items, onClose }: { anchor: DOMRect; items: readonly MenuItem[]; onClose: () => void }) {
  const { layers } = useUi();
  const play = useSound();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useFocusScope(ref, { name: 'context-menu', onBack: onClose, wrap: true });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = placeTip(anchor, r.width, r.height, innerWidth, innerHeight, 8);
    setPos({ x: p.x, y: p.y });
  }, [anchor]);
  return createPortal(
    <div class="hh-modal-root hh-interactive" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        class="hh-ctxmenu hh-glass"
        role="menu"
        style={pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : { visibility: 'hidden' }}
      >
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            class={`hh-ctxmenu-item${it.danger ? ' is-danger' : ''}${it.disabled ? ' is-disabled' : ''}`}
            data-focusable=""
            aria-disabled={it.disabled ? 'true' : undefined}
            title={it.disabled}
            onClick={() => {
              if (it.disabled) {
                play('error');
                return;
              }
              play('confirm');
              onClose();
              it.run();
            }}
          >
            {it.icon && <Icon name={it.icon} />}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </div>,
    layers.modal,
  );
}

/** Renders the single active tooltip; mounted once by the UI root. */
export function TooltipLayer() {
  const { tips, layers } = useUi();
  const tip = tips.state.value;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!tip || !ref.current) {
      setPos(null);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    setPos(placeTip(tip.anchor, r.width, r.height, innerWidth, innerHeight));
  }, [tip?.id]);
  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      class={`hh-tooltip${pos?.below ? ' is-below' : ''}`}
      role="tooltip"
      style={pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : { visibility: 'hidden', left: '0px', top: '0px' }}
    >
      {tip.content}
    </div>,
    layers.tooltip,
  );
}

/** Wrap an element so hovering it shows a tooltip. */
export function Tip({ content, children }: { content: ComponentChildren; children: ComponentChildren }) {
  const { tips } = useUi();
  return (
    <span
      class="hh-tip-anchor"
      onMouseEnter={(e) => tips.hoverIn(e.currentTarget as Element, content)}
      onMouseLeave={(e) => tips.hoverOut(e.currentTarget as Element)}
    >
      {children}
    </span>
  );
}
