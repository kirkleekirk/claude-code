import { useEffect, useRef, useState } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import { CountUp, formatDelta } from '../core/countup';
import { useTick, useUi } from '../core/context';

export type NumberFormat = 'money' | 'moneyCompact' | 'int';

export function formatNumber(v: number, format: NumberFormat): string {
  if (format === 'money') return fmt.money(v);
  if (format === 'moneyCompact') return fmt.moneyCompact(v);
  return fmt.int(v);
}

interface Popup {
  id: number;
  delta: number;
  /** UI time (seconds) when it appeared; CSS animates it, the ticker removes it. */
  born: number;
}

const POPUP_LIFE = 1.6;
let popupIds = 0;

/**
 * A number that counts toward its new value, with optional floating "+$420" deltas in lime
 * (gains) or coral (losses). Tabular numerals keep the width steady while counting.
 */
export function MoneyText({ value, format = 'money', popups = false, class: cls }: { value: number; format?: NumberFormat; popups?: boolean; class?: string }) {
  const { deps } = useUi();
  const reduced = deps.settings.get('a11y.reducedMotion');
  const cu = useRef<CountUp | null>(null);
  if (!cu.current) cu.current = new CountUp(value);
  const [display, setDisplay] = useState(Math.round(value));
  const [pops, setPops] = useState<Popup[]>([]);
  const clock = useRef(0);

  useEffect(() => {
    const c = cu.current!;
    const delta = value - c.value;
    if (delta === 0) return;
    c.set(value, reduced);
    setDisplay(c.display);
    if (popups) setPops((p) => [...p.slice(-2), { id: ++popupIds, delta, born: clock.current }]);
  }, [value]);

  useTick((dt) => {
    clock.current += dt;
    const c = cu.current!;
    if (c.step(dt)) setDisplay(c.display);
    if (pops.length && pops[0]!.born + POPUP_LIFE < clock.current) {
      setPops((p) => p.filter((x) => x.born + POPUP_LIFE >= clock.current));
    }
  });

  return (
    <span class={`hh-moneytext hh-num${cls ? ` ${cls}` : ''}`}>
      <span class="hh-moneytext-value">{formatNumber(display, format)}</span>
      {pops.map((p) => (
        <span key={p.id} class={`hh-moneytext-pop ${p.delta >= 0 ? 'is-gain' : 'is-loss'}`} aria-hidden="true">
          {formatDelta(p.delta, (a) => formatNumber(a, format === 'moneyCompact' ? 'money' : format))}
        </span>
      ))}
    </span>
  );
}
