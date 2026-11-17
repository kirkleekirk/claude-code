import { signal } from '@preact/signals-core';
import { useState } from 'preact/hooks';
import { defineStrings } from '@/core/i18n';
import type { ActionId } from '@/input';
import type { PhoneAppProps, PhoneSearchResult } from '../api';
import { Button } from '../components/Button';
import { ListRow, ScrollArea } from '../components/display';
import { useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import type { UiRuntime } from '../runtime';
import { GalleryBody } from '../screens/Gallery';
import { SettingsBody } from '../screens/settings/SettingsScreen';
import { GLOSSARY, tHelp } from '../strings/menus';

export const tApps = defineStrings('ui.apps', {
  settings: 'Settings',
  photos: 'Photos',
  help: 'Help',
});

function SettingsApp() {
  return <SettingsBody compact />;
}

function PhotosApp() {
  return <GalleryBody compact />;
}

/** Help: glossary, the hints you've seen (replayable), and a shortcut to the controls. */
function HelpApp({ params }: PhoneAppProps) {
  const { ui } = useUi();
  const [open, setOpen] = useState<string | null>(typeof params.term === 'string' ? params.term : null);
  const learned = ui.learnedHints();
  return (
    <ScrollArea class="hh-help">
      <section class="hh-help-section">
        <h2 class="hh-label">{tHelp('glossary')}</h2>
        {GLOSSARY.map((g, i) => (
          <div key={g.term} class={`hh-help-term${open === g.term ? ' is-open' : ''}`}>
            <ListRow
              icon={g.icon as IconName}
              title={g.term}
              subtitle={open === g.term ? undefined : g.body}
              autofocus={open ? open === g.term : i === 0}
              onPress={() => setOpen(open === g.term ? null : g.term)}
              trailing={<Icon name={open === g.term ? 'chevronUp' : 'chevronDown'} />}
            />
            {open === g.term && <p class="hh-help-body">{g.body}</p>}
          </div>
        ))}
      </section>
      <section class="hh-help-section">
        <h2 class="hh-label">{tHelp('hints')}</h2>
        {learned.length === 0 ? (
          <p class="hh-small">{tHelp('noHints')}</p>
        ) : (
          learned.map((h) => (
            <ListRow
              key={h.id}
              icon="notebook"
              title={h.text}
              trailing={<span class="hh-small">{tHelp('replay')}</span>}
              onPress={() => {
                ui.closePhone();
                ui.replayHint(h.action ? { id: h.id, text: h.text, action: h.action as ActionId } : { id: h.id, text: h.text });
              }}
            />
          ))
        )}
      </section>
      <section class="hh-help-section">
        <h2 class="hh-label">{tHelp('controls')}</h2>
        <Button variant="secondary" icon="gamepad" onPress={() => ui.openSettings('controls')}>{tHelp('openControls')}</Button>
      </section>
    </ScrollArea>
  );
}

function helpSearch(query: string): PhoneSearchResult[] {
  const q = query.toLowerCase();
  return GLOSSARY.filter((g) => g.term.toLowerCase().includes(q)).map((g) => ({
    id: `help-${g.term}`, title: g.term, detail: g.body, icon: g.icon as IconName, appId: 'help', params: { term: g.term },
  }));
}

/** Register the generic apps the UI owns; the game registers Messages, Map, Empire and the rest. */
export function registerBuiltinApps(ui: UiRuntime): void {
  ui.registerPhoneApp({ id: 'settings', title: tApps('settings'), icon: 'settings', color: '#8E86D8', order: 900, component: SettingsApp });
  ui.registerPhoneApp({ id: 'photos', title: tApps('photos'), icon: 'camera', color: '#FF6B5E', order: 800, component: PhotosApp, badge: signal(0) });
  ui.registerPhoneApp({ id: 'help', title: tApps('help'), icon: 'help', color: '#17E0C8', order: 950, component: HelpApp, search: helpSearch });
}
