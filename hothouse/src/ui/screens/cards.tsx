import { useRef } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import { Button } from '../components/Button';
import { MoneyText } from '../components/MoneyText';
import { Modal } from '../components/Modal';
import { useFocusScope, useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import type { LayerEntry } from '../runtime';
import { tc } from '../strings/common';
import { tCards } from '../strings/menus';

type ConfirmEntry = Extract<LayerEntry, { kind: 'confirm' }>;
type RankEntry = Extract<LayerEntry, { kind: 'rankUp' }>;
type ShiftEntry = Extract<LayerEntry, { kind: 'shiftReport' }>;
type BustedEntry = Extract<LayerEntry, { kind: 'busted' }>;

export function ConfirmDialog({ entry }: { entry: ConfirmEntry }) {
  const { ui } = useUi();
  const s = entry.spec;
  const answer = (v: boolean) => ui.resolveLayer(entry.id, v);
  return (
    <Modal
      title={s.title}
      icon={s.danger ? 'warning' : 'help'}
      tone={s.danger ? 'danger' : 'default'}
      size="sm"
      bare
      onClose={() => answer(false)}
      actions={
        <>
          <Button variant="ghost" sound="back" onPress={() => answer(false)} autofocus={s.danger}>{s.cancel ?? tc('cancel')}</Button>
          {s.danger ? (
            <Button variant="danger" hold glyph="uiConfirm" icon="trash" onPress={() => answer(true)}>{s.confirm}</Button>
          ) : (
            <Button variant="primary" autofocus onPress={() => answer(true)}>{s.confirm}</Button>
          )}
        </>
      }
    >
      {s.body && <p>{s.body}</p>}
    </Modal>
  );
}

/** Celebration card: the rank, its title, up to three unlocks and a line from Ofelia. */
export function RankUpCard({ entry }: { entry: RankEntry }) {
  const { ui } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const s = entry.spec;
  const done = () => ui.resolveLayer(entry.id);
  useFocusScope(ref, { name: 'rank-up', onBack: done });
  return (
    <div class="hh-overlay hh-rankup hh-interactive">
      <div class="hh-scrim" />
      <div class="hh-rankup-rays" aria-hidden="true" />
      <div ref={ref} class="hh-rankup-card hh-glass" role="dialog" aria-modal="true" aria-label={tCards('rank', { n: s.rank })}>
        <div class="hh-rankup-eyebrow hh-label">{tCards('rankUp')}</div>
        <div class="hh-rankup-badge">
          <Icon name="crown" size="1.6rem" />
          <span class="hh-num">{s.rank}</span>
        </div>
        <h1 class="hh-rankup-title hh-title-italic">{s.title}</h1>
        {s.unlocks.length > 0 && (
          <div class="hh-rankup-unlocks hh-stagger">
            {s.unlocks.slice(0, 3).map((u, i) => (
              <div key={u.title} class="hh-unlock" style={{ '--i': String(i) }}>
                <span class="hh-unlock-icon"><Icon name={u.icon} /></span>
                <span class="hh-unlock-text">
                  <span class="hh-unlock-title">{u.title}</span>
                  <span class="hh-unlock-detail">{u.detail}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {s.note && <p class="hh-margin-note hh-hand">{s.note}</p>}
        <Button variant="primary" size="lg" autofocus onPress={done}>{tc('nice')}</Button>
      </div>
    </div>
  );
}

export function ShiftReportCard({ entry }: { entry: ShiftEntry }) {
  const { ui } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const s = entry.spec;
  const done = () => ui.resolveLayer(entry.id);
  useFocusScope(ref, { name: 'shift-report', onBack: done });
  return (
    <div class="hh-overlay hh-shift hh-interactive">
      <div class="hh-scrim" />
      <div ref={ref} class="hh-shift-card hh-glass hh-enter" role="dialog" aria-modal="true" aria-label={s.title}>
        <header>
          <div class="hh-label">{s.span}</div>
          <h1 class="hh-title">{s.title}</h1>
        </header>
        <div class="hh-shift-stats">
          <div class="hh-stat">
            <span class="hh-stat-label">{tCards('shiftEarned')}</span>
            <MoneyText value={s.earnings} class="hh-stat-value hh-money" />
          </div>
          <div class="hh-stat">
            <span class="hh-stat-label">{tCards('shiftDeals')}</span>
            <MoneyText value={s.deals} format="int" class="hh-stat-value" />
          </div>
          <div class="hh-stat">
            <span class="hh-stat-label">{tCards('shiftClose')}</span>
            <MoneyText value={s.closeCalls} format="int" class="hh-stat-value" />
          </div>
        </div>
        {s.lines.length > 0 && (
          <ul class="hh-shift-lines hh-stagger">
            {s.lines.map((l, i) => (
              <li key={i} style={{ '--i': String(i) }}>
                <Icon name={l.icon} />
                <span class="hh-grow">{l.text}</span>
                {l.amount !== undefined && <span class={`hh-num hh-shift-amt${l.amount < 0 ? ' is-loss' : ''}`}>{l.amount < 0 ? `−${fmt.money(-l.amount)}` : `+${fmt.money(l.amount)}`}</span>}
              </li>
            ))}
          </ul>
        )}
        <Button variant="primary" size="lg" autofocus wide icon="cash" onPress={done}>{tc('collect')}</Button>
      </div>
    </div>
  );
}

/** Busted / wasted: brief, stylish, itemized, one press to get back to it. */
export function BustedScreen({ entry }: { entry: BustedEntry }) {
  const { ui } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const s = entry.spec;
  const total = s.costs.reduce((a, c) => a + c.amount, 0);
  const retry = () => ui.resolveLayer(entry.id);
  useFocusScope(ref, { name: 'busted', context: 'menu' });
  return (
    <div ref={ref} class={`hh-overlay hh-busted hh-busted-${s.kind} hh-interactive`} role="alertdialog" aria-modal="true" aria-label={tCards(s.kind)}>
      <div class="hh-busted-wash" aria-hidden="true" />
      <div class="hh-busted-content">
        <h1 class="hh-busted-word hh-wordmark">{tCards(s.kind)}</h1>
        <p class="hh-busted-sub">{s.kind === 'busted' ? tCards('bustedSub') : tCards('wastedSub')}</p>
        <blockquote class="hh-busted-quip">“{s.quip}”<cite>— Sy Pinkerton, Esq.</cite></blockquote>
        <div class="hh-busted-bill hh-glass">
          <div class="hh-label">{tCards('costs')}</div>
          {s.costs.map((c) => (
            <div key={c.label} class="hh-bill-row">
              <span>{c.label}</span>
              <span class="hh-num">−{fmt.money(c.amount)}</span>
            </div>
          ))}
          <div class="hh-bill-row hh-bill-total">
            <span>{tCards('total')}</span>
            <span class="hh-num">−{fmt.money(total)}</span>
          </div>
          <div class="hh-small hh-busted-respawn"><Icon name="pin" /> {tCards('respawn', { place: s.respawn })}</div>
        </div>
        <Button variant="primary" size="lg" autofocus glyph="uiConfirm" onPress={retry}>{tCards('retry')}</Button>
      </div>
    </div>
  );
}
