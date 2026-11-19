import { useMemo, useRef, useState } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import type { SaveMeta } from '@/save';
import { useFocusScope, useSound, useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { tMenu } from '../strings/menus';
import { Wordmark } from './ClickToStart';

/** "2 hours ago", for save cards. */
export function savedWhen(savedAt: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - savedAt) / 60000));
  if (min < 1) return tMenu('justNow');
  if (min < 60) return tMenu.n('minutesAgo', min);
  const h = Math.round(min / 60);
  if (h < 24) return tMenu.n('hoursAgo', h);
  return tMenu.n('daysAgo', Math.round(h / 24));
}

function MenuItem({ label, icon, onPress, autofocus, disabled, detail }: { label: string; icon: IconName; onPress: () => void; autofocus?: boolean; disabled?: string; detail?: string }) {
  const play = useSound();
  return (
    <button
      type="button"
      class={`hh-menu-item${disabled ? ' is-disabled' : ''}`}
      data-focusable=""
      data-autofocus={autofocus ? '' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      title={disabled}
      onClick={() => {
        if (disabled) {
          play('error');
          return;
        }
        play('confirm');
        onPress();
      }}
    >
      <span class="hh-menu-bar" aria-hidden="true" />
      <Icon name={icon} class="hh-menu-icon" />
      <span class="hh-menu-label">{label}</span>
      {detail && <span class="hh-menu-detail">{detail}</span>}
    </button>
  );
}

function ContinueCard({ meta, onPress }: { meta: SaveMeta; onPress: () => void }) {
  const play = useSound();
  return (
    <button
      type="button"
      class="hh-continue"
      data-focusable=""
      data-autofocus=""
      onClick={() => {
        play('confirm');
        onPress();
      }}
    >
      <span class="hh-continue-thumb">
        {meta.thumb ? <img src={meta.thumb} alt="" /> : <Icon name="image" size="2rem" />}
      </span>
      <span class="hh-continue-text">
        <span class="hh-continue-label">
          <Icon name="play" />
          {tMenu('continue')}
        </span>
        <span class="hh-continue-line">{tMenu('rankLine', { rank: meta.rank, title: meta.rankTitle })}</span>
        <span class="hh-continue-meta">
          <span class="hh-money">{fmt.money(meta.cash)}</span>
          <span>{tMenu('continueMeta', { place: meta.location, time: fmt.clock(meta.clockHours) })}</span>
        </span>
        <span class="hh-continue-sub">{tMenu('playtime', { time: fmt.duration(meta.playtime) })} · {tMenu('savedAgo', { when: savedWhen(meta.savedAt) })}</span>
      </span>
    </button>
  );
}

export function MainMenu() {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  // Re-read saves whenever an overlay (Load, Settings) closes over the menu.
  const layerCount = ui.layers.value.length;
  const latest = useMemo(() => deps.saves.latest(), [layerCount]);
  const anySave = latest !== null;
  const reduced = deps.settings.get('a11y.reducedMotion');
  useFocusScope(ref, { name: 'main-menu' });

  return (
    <div
      ref={ref}
      class="hh-screen hh-mainmenu hh-interactive"
      onPointerMove={(e) => {
        if (reduced) return;
        setTilt({ x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 });
      }}
      style={{ '--px': String(tilt.x), '--py': String(tilt.y) }}
    >
      <div class="hh-mainmenu-scrim" aria-hidden="true" />
      <div class="hh-mainmenu-col">
        <div class="hh-mainmenu-brand hh-enter-left">
          <Wordmark size="lg" />
          <p class="hh-mainmenu-tagline">{tMenu('tagline')}</p>
        </div>
        <nav class="hh-mainmenu-nav hh-stagger" aria-label="Main menu">
          {latest && (
            <div style={{ '--i': '0' }}>
              <ContinueCard meta={latest} onPress={() => deps.actions.continueGame()} />
            </div>
          )}
          {(
            [
              ['newGame', 'plus', () => ui.showFrontend('newGame'), undefined],
              ['load', 'download', () => ui.openSaveLoad('load'), anySave ? undefined : tMenu('noSaves')],
              ['gallery', 'image', () => ui.openGallery(), undefined],
              ['settings', 'settings', () => ui.openSettings('graphics'), undefined],
              ['credits', 'star', () => ui.openCredits(), undefined],
              ['quit', 'back', () => deps.actions.quitGame(), undefined],
            ] as const
          ).map(([key, icon, run, disabled], i) => (
            <div key={key} style={{ '--i': String(i + 1) }}>
              <MenuItem label={tMenu(key)} icon={icon} onPress={run} disabled={disabled} autofocus={!latest && key === 'newGame'} />
            </div>
          ))}
        </nav>
      </div>
      {deps.version && <div class="hh-mainmenu-version hh-num">{tMenu('version', { version: deps.version })}</div>}
    </div>
  );
}
