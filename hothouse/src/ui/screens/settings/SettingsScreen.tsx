import { useMemo, useRef, useState } from 'preact/hooks';
import { SETTINGS, SETTING_CATEGORIES, settingsText, type SettingCategory, type SettingId } from '@/save';
import { Button, IconButton } from '../../components/Button';
import { adjustSlider, CyclerView, Field, SegmentedView, SliderView, stepOption, ToggleView } from '../../components/controls';
import { ScrollArea } from '../../components/display';
import { ActionHint } from '../../components/Glyph';
import { cycleTab, Tabs, type TabDef } from '../../components/Tabs';
import { useFocusScope, useUi } from '../../core/context';
import { createTabHost, TabHostContext, useTabHost } from '../../core/tabhost';
import type { IconName } from '../../icons/names';
import type { LayerEntry } from '../../runtime';
import { tc } from '../../strings/common';
import { tMenu } from '../../strings/menus';
import { Bindings } from './Bindings';
import { formatSetting, PRESET_DRIVEN, presetOptions, rowsFor, type SettingRow } from './rows';

type Entry = Extract<LayerEntry, { kind: 'settings' }>;

const ICONS: Record<SettingCategory, IconName> = {
  graphics: 'display', audio: 'volume', controls: 'gamepad', gameplay: 'sliders', accessibility: 'accessibility',
};

const TABS: readonly TabDef<SettingCategory>[] = SETTING_CATEGORIES.map((c) => ({ id: c, label: settingsText(`category.${c}`), icon: ICONS[c] }));

function SettingField({ row, autofocus, onBusy }: { row: SettingRow; autofocus?: boolean; onBusy: (b: boolean) => void }) {
  const { deps } = useUi();
  const settings = deps.settings;
  const id = row.id;
  const value = settings.get(id) as boolean | number | string;
  const modified = !settings.isDefault(id);
  const [running, setRunning] = useState(false);

  const set = (v: boolean | number | string) => {
    if (v === value) return;
    if (id === 'gfx.preset') {
      if (v === 'auto') {
        setRunning(true);
        onBusy(true);
        void deps.actions.runBenchmark().finally(() => {
          setRunning(false);
          onBusy(false);
        });
        settings.set('gfx.preset', 'auto');
        return;
      }
      if (v !== 'custom') deps.applyGraphicsPreset?.(v as 'low' | 'medium' | 'high' | 'ultra');
      settings.set('gfx.preset', v as never);
      return;
    }
    settings.set(id, v as never);
    if (PRESET_DRIVEN.has(id) && settings.peek('gfx.preset') !== 'custom') settings.set('gfx.preset', 'custom');
    if (id === 'gfx.fullscreen') deps.actions.setFullscreen(!!v);
  };

  const desc = running ? tc('loading') : row.desc;
  switch (row.kind) {
    case 'toggle':
      return (
        <Field label={row.label} desc={desc} modified={modified} autofocus={autofocus} onActivate={() => set(!value)} onAdjust={(d) => set(d > 0)}>
          <ToggleView checked={!!value} onChange={set} />
        </Field>
      );
    case 'slider':
      return (
        <Field label={row.label} desc={desc} modified={modified} autofocus={autofocus} onAdjust={(d) => set(adjustSlider(value as number, d, row.min!, row.max!, row.step!))}>
          <SliderView value={value as number} min={row.min!} max={row.max!} step={row.step!} onChange={set} format={(v) => formatSetting(row, v)} />
        </Field>
      );
    case 'segmented':
      return (
        <Field label={row.label} desc={desc} modified={modified} autofocus={autofocus} onAdjust={(d) => set(stepOption(row.options!, value as string, d, false))} onActivate={() => set(stepOption(row.options!, value as string, 1, true))}>
          <SegmentedView options={row.options!} value={value as string} onChange={set} />
        </Field>
      );
    case 'cycler': {
      const options = id === 'gfx.preset' ? presetOptions(value as string) : row.options!;
      return (
        <Field label={row.label} desc={desc} modified={modified} autofocus={autofocus} onAdjust={(d) => set(stepOption(options, value as string, d, true))} onActivate={() => set(stepOption(options, value as string, 1, true))}>
          <CyclerView options={options} value={value as string} onChange={set} />
        </Field>
      );
    }
  }
}

/**
 * Tabs, rows and the reset footer. Used by the Settings overlay and by the phone's Settings app;
 * it claims Q/E from whichever container owns the focus scope.
 */
export function SettingsBody({ initialTab = 'graphics', compact = false }: { initialTab?: SettingCategory; compact?: boolean }) {
  const { deps } = useUi();
  const [tab, setTab] = useState<SettingCategory>(initialTab);
  const [busy, setBusy] = useState(false);
  useTabHost((d) => setTab((t) => cycleTab(TABS, t, d)));
  const rows = rowsFor(tab);
  const anyModified = rows.some((r) => !deps.settings.isDefault(r.id as SettingId));
  return (
    <div class={`hh-settings-content${compact ? ' is-compact' : ''}`}>
      <Tabs tabs={TABS} value={tab} onChange={setTab} compact={compact} />
      <ScrollArea class="hh-settings-body" key={tab}>
        <div class="hh-settings-rows hh-stagger">
          {rows.map((r, i) => (
            <div key={r.id} style={{ '--i': String(Math.min(i, 12)) }}>
              <SettingField row={r} autofocus={i === 0} onBusy={setBusy} />
            </div>
          ))}
        </div>
        {tab === 'controls' && <Bindings />}
      </ScrollArea>
      <footer class="hh-panel-foot">
        <div class="hh-panel-hints">
          <ActionHint action="uiTabPrev" size="sm">{tc('tabsHint')}</ActionHint>
          <ActionHint action="uiBack" size="sm">{tc('back')}</ActionHint>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          disabled={!anyModified || busy}
          onPress={() => {
            deps.settings.reset(tab);
            if (tab === 'graphics') deps.applyGraphicsPreset?.('high');
          }}
        >
          {tc('resetCategory', { category: settingsText(`category.${tab}`) })}
        </Button>
      </footer>
    </div>
  );
}

export function SettingsScreen({ entry }: { entry: Entry }) {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const host = useMemo(() => createTabHost(), []);
  const close = () => {
    deps.settings.flush();
    ui.close(entry.id);
  };
  useFocusScope(ref, { name: 'settings', onBack: close, onTab: (d) => host.current?.(d) });
  return (
    <div class="hh-overlay hh-settings hh-interactive">
      <div class="hh-scrim" onClick={close} />
      <div ref={ref} class="hh-panel hh-panel-settings hh-glass hh-enter" role="dialog" aria-modal="true" aria-label={tMenu('settings')}>
        <header class="hh-panel-head">
          <h1 class="hh-title">{tMenu('settings')}</h1>
          <span class="hh-spacer" />
          <IconButton icon="close" label={tc('close')} onPress={close} sound="back" />
        </header>
        <TabHostContext.Provider value={host}>
          <SettingsBody initialTab={entry.tab} />
        </TabHostContext.Provider>
      </div>
    </div>
  );
}

/** Every setting id is reachable from exactly one tab (used by tests). */
export function allSettingIds(): SettingId[] {
  return SETTING_CATEGORIES.flatMap((c) => rowsFor(c).map((r) => r.id)).filter((id) => id in SETTINGS);
}
