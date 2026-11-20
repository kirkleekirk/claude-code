import { signal } from '@preact/signals-core';
import type { ComponentChildren } from 'preact';

/**
 * One tooltip at a time, anchored to an element. Shown on hover (after a short delay) and on
 * Details (I · Y) for the focused element; hidden when focus moves or the pointer leaves.
 */
export interface TipState {
  id: number;
  anchor: DOMRect;
  content: ComponentChildren;
}

export class TipController {
  readonly state = signal<TipState | null>(null);
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private owner: Element | null = null;

  /** Show now (Details on a pad, or after the hover delay). */
  show(anchor: Element, content: ComponentChildren): void {
    this.cancel();
    this.owner = anchor;
    this.state.value = { id: ++this.seq, anchor: anchor.getBoundingClientRect(), content };
  }

  /** Hover: show after a delay unless the pointer leaves first. */
  hoverIn(anchor: Element, content: ComponentChildren, delayMs = 380): void {
    this.cancel();
    this.timer = setTimeout(() => this.show(anchor, content), delayMs);
  }

  hoverOut(anchor: Element): void {
    this.cancel();
    if (this.owner === anchor) this.hide();
  }

  /** Toggle for Details presses. */
  toggle(anchor: Element, content: ComponentChildren): void {
    if (this.owner === anchor && this.state.peek()) this.hide();
    else this.show(anchor, content);
  }

  hide(): void {
    this.cancel();
    this.owner = null;
    if (this.state.peek()) this.state.value = null;
  }

  private cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/** Place a tooltip of size (w, h) next to `anchor`, preferring above, inside the viewport. */
export function placeTip(anchor: DOMRect, w: number, h: number, vw: number, vh: number, gap = 10, margin = 12): { x: number; y: number; below: boolean } {
  let below = anchor.top - gap - h < margin;
  let y = below ? anchor.bottom + gap : anchor.top - gap - h;
  if (below && y + h > vh - margin) {
    below = false;
    y = Math.max(margin, anchor.top - gap - h);
  }
  const x = Math.min(vw - margin - w, Math.max(margin, anchor.left + anchor.width / 2 - w / 2));
  return { x, y, below };
}
