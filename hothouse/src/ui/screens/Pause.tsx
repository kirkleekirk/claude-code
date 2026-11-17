import { useRef } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import { ActionHint } from '../components/Glyph';
import { useFocusScope, useSound, useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import type { LayerEntry } from '../runtime';
import { tc } from '../strings/common';
import { tMenu } from '../strings/menus';

type Entry = Extract<LayerEntry, { kind: 'pause' }>;

function PauseItem({ icon, label, onPress, autofocus }: { icon: IconName; label: string; onPress: () => void; autofocus?: boolean }) {
  const play = useSound();
  return (
    <button
      type="button"
      class="hh-pause-item"
      data-focusable=""
      data-autofocus={autofocus ? '' : undefined}
      onClick={() => {
        play('confirm');
        onPress();
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

export function PauseMenu({ entry }: { entry: Entry }) {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const hasMap = ui.apps.value.some((a) => a.id === 'map');
  const resume = () => ui.close(entry.id);
  useFocusScope(ref, { name: 'pause', onBack: resume });

  const quit = async () => {
    const auto = deps.saves.list()['auto'];
    const ok = await ui.confirm({
      title: tMenu('quitConfirmTitle'),
      body: auto ? tMenu('quitConfirmBody', { time: fmt.clock(auto.clockHours) }) : tMenu('quitConfirmBodyNoSave'),
      confirm: tMenu('quitConfirm'),
      cancel: tMenu('stay'),
    });
    if (ok) deps.actions.quitToMenu();
  };

  return (
    <div class="hh-overlay hh-pause hh-interactive">
      <div class="hh-scrim" onClick={resume} />
      <div ref={ref} class="hh-pause-panel hh-glass hh-enter-left" role="dialog" aria-modal="true" aria-label={tMenu('paused')}>
        <h1 class="hh-pause-title hh-title-italic">{tMenu('paused')}</h1>
        <nav class="hh-pause-list hh-stagger">
          {[
            <PauseItem key="resume" icon="play" label={tMenu('resume')} onPress={resume} autofocus />,
            hasMap && <PauseItem key="map" icon="map" label={tMenu('map')} onPress={() => { ui.close(entry.id); ui.openPhone('map'); }} />,
            <PauseItem key="phone" icon="phone" label={tMenu('phone')} onPress={() => { ui.close(entry.id); ui.openPhone(); }} />,
            <PauseItem key="save" icon="download" label={tMenu('save')} onPress={() => ui.openSaveLoad('save')} />,
            <PauseItem key="settings" icon="settings" label={tMenu('settings')} onPress={() => ui.openSettings('graphics')} />,
            <PauseItem key="controls" icon="gamepad" label={tMenu('controls')} onPress={() => ui.openSettings('controls')} />,
            <PauseItem key="quit" icon="back" label={tMenu('quitToMenu')} onPress={quit} />,
          ]
            .filter(Boolean)
            .map((el, i) => <div key={i} style={{ '--i': String(i) }}>{el}</div>)}
        </nav>
        <div class="hh-pause-foot">
          <ActionHint action="uiBack" size="sm">{tMenu('resume')}</ActionHint>
          <ActionHint action="uiConfirm" size="sm">{tc('confirm')}</ActionHint>
        </div>
      </div>
    </div>
  );
}
