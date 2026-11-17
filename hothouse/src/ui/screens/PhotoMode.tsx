import { useRef, useState } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import { clamp } from '@/core/math';
import type { PhotoGrade } from '../api';
import { Button } from '../components/Button';
import { adjustSlider, Field, SegmentedView, SliderView, stepOption, ToggleView, type Option } from '../components/controls';
import { ActionHint } from '../components/Glyph';
import { useFocusScope, useTick, useUi } from '../core/context';
import type { LayerEntry } from '../runtime';
import { tCards } from '../strings/menus';

type Entry = Extract<LayerEntry, { kind: 'photoMode' }>;

const GRADES: readonly Option<PhotoGrade>[] = [
  { value: 'golden', label: tCards('grade.golden') },
  { value: 'noir', label: tCards('grade.noir') },
  { value: 'neon', label: tCards('grade.neon') },
  { value: 'none', label: tCards('grade.none') },
];

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    if (typeof createImageBitmap !== 'function') return { width: 0, height: 0 };
    const b = await createImageBitmap(blob);
    const s = { width: b.width, height: b.height };
    b.close();
    return s;
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * Photo Mode. In camera mode the main thread's free camera has input and this shows a slim hint
 * bar; Y opens the settings panel (menu input), Back returns to the camera. The UI handles the
 * capture, hide and exit buttons; the main thread renders and applies every setting.
 */
export function PhotoModePanel({ entry }: { entry: Entry }) {
  const { ui, deps } = useUi();
  const c = entry.controls;
  const state = c.state.value;
  const mode = c.mode.value;
  const ref = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const idle = useRef(0);
  const [barVisible, setBarVisible] = useState(true);

  useFocusScope(ref, { name: 'photo-panel', onBack: () => c.setMode('camera') }, mode === 'panel');

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    deps.sound?.ui('photo');
    setFlash((f) => f + 1);
    try {
      const blob = await c.capture();
      if (!blob) throw new Error('empty capture');
      const store = deps.photos;
      if (!store) throw new Error('no photo store');
      const res = await store.add(blob, { ...(await imageSize(blob)), place: ui.hud.area.peek() ?? undefined });
      if (!res.ok) throw new Error(res.error);
      ui.toast({ kind: 'success', icon: 'camera', title: store.persistent ? tCards('photoSaved') : tCards('photoSavedSession') });
    } catch {
      ui.toast({ kind: 'danger', icon: 'warning', title: tCards('photoFailed') });
    } finally {
      setBusy(false);
    }
  };

  useTick((dt) => {
    const input = deps.input;
    if (mode === 'camera') {
      if (input.pressed('photoCapture')) void capture();
      else if (input.pressed('photoHideUi')) c.setMode('panel');
      else if (input.pressed('photoExit')) c.exit();
      const moving = Math.abs(input.value('photoX')) + Math.abs(input.value('photoY')) + Math.abs(input.value('photoRise')) > 0.1;
      idle.current = moving ? 0 : idle.current + dt;
      const show = idle.current > 1.2;
      if (show !== barVisible) setBarVisible(show);
    }
  });

  return (
    <div class={`hh-photo hh-photo-${mode}`}>
      {flash > 0 && <div key={flash} class="hh-photo-flash" aria-hidden="true" />}
      {mode === 'camera' ? (
        <div class={`hh-photo-bar hh-chip-glass${barVisible ? '' : ' is-faded'}`}>
          <ActionHint action="photoCapture" size="sm">{tCards('capture')}</ActionHint>
          <ActionHint action="photoHideUi" size="sm">{tCards('editPanel')}</ActionHint>
          <ActionHint action="photoExit" size="sm">{tCards('exitPhoto')}</ActionHint>
          <button type="button" class="hh-photo-edit hh-interactive" onClick={() => c.setMode('panel')}>{tCards('editPanel')}</button>
        </div>
      ) : (
        <div ref={ref} class="hh-photo-panel hh-glass hh-enter-right hh-interactive" role="dialog" aria-label={tCards('photoMode')}>
          <header class="hh-photo-head">
            <h1 class="hh-h2">{tCards('photoMode')}</h1>
          </header>
          <div class="hh-photo-fields hh-scroll">
            <Field label={tCards('fov')} onAdjust={(d) => c.set('fov', adjustSlider(state.fov, d, 20, 110, 1))} stacked>
              <SliderView value={state.fov} min={20} max={110} step={1} onChange={(v) => c.set('fov', v)} format={(v) => `${v}°`} />
            </Field>
            <Field label={tCards('dof')} onActivate={() => c.set('dof', !state.dof)} onAdjust={(d) => c.set('dof', d > 0)}>
              <ToggleView checked={state.dof} onChange={(v) => c.set('dof', v)} />
            </Field>
            <Field label={tCards('focus')} disabled={!state.dof} onAdjust={(d) => c.set('focusDistance', adjustSlider(state.focusDistance, d, 0.5, 120, 0.5))} stacked>
              <SliderView value={state.focusDistance} min={0.5} max={120} step={0.5} onChange={(v) => c.set('focusDistance', v)} format={(v) => `${fmt.decimal(v)} m`} />
            </Field>
            <Field label={tCards('aperture')} disabled={!state.dof} onAdjust={(d) => c.set('aperture', adjustSlider(state.aperture, d, 0, 1, 0.05))} stacked>
              <SliderView value={state.aperture} min={0} max={1} step={0.05} onChange={(v) => c.set('aperture', v)} format={(v) => fmt.percent(v)} />
            </Field>
            <Field label={tCards('exposure')} onAdjust={(d) => c.set('exposure', adjustSlider(state.exposure, d, -2, 2, 0.1))} stacked>
              <SliderView value={state.exposure} min={-2} max={2} step={0.1} onChange={(v) => c.set('exposure', v)} format={(v) => `${v > 0 ? '+' : ''}${fmt.decimal(v)}`} />
            </Field>
            <Field label={tCards('timeOfDay')} onAdjust={(d) => c.set('timeOfDay', (state.timeOfDay + d * 0.25 + 24) % 24)} stacked>
              <SliderView value={state.timeOfDay} min={0} max={23.75} step={0.25} onChange={(v) => c.set('timeOfDay', clamp(v, 0, 23.75))} format={(v) => fmt.clock(v)} />
            </Field>
            <Field label={tCards('grade')} onAdjust={(d) => c.set('grade', stepOption(GRADES, state.grade, d, false))} stacked>
              <SegmentedView options={GRADES} value={state.grade} onChange={(v) => c.set('grade', v)} />
            </Field>
            <Field label={tCards('hideCharacters')} onActivate={() => c.set('hideCharacters', !state.hideCharacters)} onAdjust={(d) => c.set('hideCharacters', d > 0)}>
              <ToggleView checked={state.hideCharacters} onChange={(v) => c.set('hideCharacters', v)} />
            </Field>
            <Field label={tCards('watermark')} onActivate={() => c.set('watermark', !state.watermark)} onAdjust={(d) => c.set('watermark', d > 0)}>
              <ToggleView checked={state.watermark} onChange={(v) => c.set('watermark', v)} />
            </Field>
          </div>
          <footer class="hh-photo-actions">
            <Button variant="primary" icon="camera" autofocus loading={busy} onPress={() => void capture()} wide>{tCards('capture')}</Button>
            <div class="hh-row">
              <Button variant="secondary" size="sm" icon="compass" onPress={() => c.setMode('camera')}>{tCards('moveCamera')}</Button>
              <Button variant="ghost" size="sm" icon="close" sound="back" onPress={() => c.exit()}>{tCards('exitPhoto')}</Button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
