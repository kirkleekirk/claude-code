import { useEffect, useState } from 'preact/hooks';
import { ACTIONS, ACTION_IDS, glyphFor, type ActionGroup, type ActionId, type BindingOverrides, type DeviceKind, type Source } from '@/input';
import { Button } from '../../components/Button';
import { Field, SegmentedView, type Option } from '../../components/controls';
import { GlyphMark } from '../../components/Glyph';
import { Modal } from '../../components/Modal';
import { saveBindings } from '../../core/bindings';
import { useSound, useTick, useUi } from '../../core/context';
import { tActions, tBind } from '../../strings/common';

/**
 * Rebinding for keyboard/mouse and controller. Each action shows its primary and secondary
 * binding; pick one, press the new key or button, and resolve conflicts with a swap.
 */

type Slot = 'pos' | 'neg';
const GROUP_ORDER: readonly ActionGroup[] = ['foot', 'vehicle', 'system', 'phone', 'mg', 'build', 'photo'];
const DEVICES: readonly Option<DeviceKind>[] = [
  { value: 'kbm', label: tBind('kbm') },
  { value: 'gamepad', label: tBind('pad') },
];
const CAPTURE_TIMEOUT = 8;

interface Row {
  action: ActionId;
  slot: Slot;
  label: string;
}

function rowsFor(group: ActionGroup): Row[] {
  const rows: Row[] = [];
  for (const id of ACTION_IDS) {
    const def = ACTIONS[id];
    if (def.group !== group || ('fixed' in def && def.fixed)) continue;
    const hasNeg = 'neg' in def.kbm || 'neg' in def.pad;
    if (hasNeg) {
      rows.push({ action: id, slot: 'pos', label: tActions.has(`${id}.pos`) ? tActions(`${id}.pos` as never) : id });
      rows.push({ action: id, slot: 'neg', label: tActions.has(`${id}.neg`) ? tActions(`${id}.neg` as never) : id });
    } else {
      rows.push({ action: id, slot: 'pos', label: tActions.has(id) ? tActions(id as never) : id });
    }
  }
  return rows;
}

/** The live binding list for an action: defaults overridden by saved changes. */
function currentSources(overrides: BindingOverrides, action: ActionId, device: DeviceKind, slot: Slot): Source[] {
  const o = overrides[action]?.[device];
  if (o) return [...o[slot]];
  const def = ACTIONS[action][device === 'kbm' ? 'kbm' : 'pad'];
  return [...((slot === 'neg' ? ('neg' in def ? def.neg : undefined) : def.pos) ?? [])];
}

const same = (a: Source, b: Source) => JSON.stringify(a) === JSON.stringify(b);

function BindingChip({ source, onPress, onClear, empty }: { source: Source | null; onPress: () => void; onClear?: () => void; empty: string }) {
  const { deps } = useUi();
  const play = useSound();
  const style = deps.input.padStyleOverride ?? deps.input.padStyle.value;
  return (
    <button
      type="button"
      class={`hh-bind${source ? '' : ' is-empty'}`}
      data-focusable=""
      onClick={() => {
        play('confirm');
        onPress();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClear?.();
      }}
      title={onClear ? tBind('clearHint') : undefined}
    >
      {source ? <GlyphMark g={glyphFor(source, style)} size="sm" /> : <span class="hh-bind-empty">{empty}</span>}
    </button>
  );
}

export function Bindings() {
  const { deps, ui } = useUi();
  const input = deps.input;
  const [device, setDevice] = useState<DeviceKind>(input.device.peek());
  const [capture, setCapture] = useState<{ row: Row; index: number; t: number } | null>(null);
  void input.bindingsVersion.value;
  const overrides = input.exportBindings();

  const persist = () => saveBindings(input, deps.settings);

  const apply = (row: Row, index: number, source: Source) => {
    const before = currentSources(overrides, row.action, device, row.slot);
    const old = before[index] ?? null;
    if (old && same(old, source)) return;
    const conflicts = input.conflicts(row.action, device, source);
    const finish = () => {
      input.rebind(row.action, device, row.slot, Math.min(index, before.length), source);
      persist();
    };
    if (conflicts.length === 0) {
      finish();
      return;
    }
    const other = conflicts[0]!;
    void ui.confirm({
      title: tBind('takenTitle', { key: glyphFor(source, input.padStyle.peek()).label }),
      body: tBind('takenBody', { action: tActions.has(other) ? tActions(other as never) : other }),
      confirm: tBind('swap'),
    }).then((ok) => {
      if (!ok) return;
      // Give the other action our old binding (or remove it there).
      for (const slot of ['pos', 'neg'] as const) {
        const list = currentSources(input.exportBindings(), other, device, slot);
        const i = list.findIndex((s) => same(s, source));
        if (i >= 0) input.rebind(other, device, slot, i, old);
      }
      finish();
    });
  };

  useEffect(() => {
    if (!capture) return;
    input.capture(device, (source) => {
      setCapture(null);
      if (source) apply(capture.row, capture.index, source);
    });
    return () => input.cancelCapture();
  }, [capture?.row.action, capture?.row.slot, capture?.index]);

  useTick((dt) => {
    if (!capture) return;
    const t = capture.t + dt;
    if (t > CAPTURE_TIMEOUT) {
      input.cancelCapture();
      setCapture(null);
    } else if (Math.floor(t) !== Math.floor(capture.t)) {
      setCapture({ ...capture, t });
    } else {
      capture.t = t;
    }
  });

  return (
    <section class="hh-bindings">
      <h2 class="hh-h3 hh-bindings-title">{tBind('title')}</h2>
      <Field label={tBind('device')} desc={tBind('deviceDesc')} onAdjust={(d) => setDevice(d > 0 ? 'gamepad' : 'kbm')} stacked>
        <SegmentedView options={DEVICES} value={device} onChange={setDevice} />
      </Field>
      {GROUP_ORDER.map((group) => {
        const rows = rowsFor(group);
        if (rows.length === 0) return null;
        return (
          <div key={group} class="hh-bind-group">
            <h3 class="hh-label">{tActions(`group.${group}`)}</h3>
            {rows.map((row) => {
              const sources = currentSources(overrides, row.action, device, row.slot);
              return (
                <div key={`${row.action}.${row.slot}`} class="hh-bind-row">
                  <span class="hh-bind-label">{row.label}</span>
                  <BindingChip source={sources[0] ?? null} empty={tBind('set')} onPress={() => setCapture({ row, index: 0, t: 0 })} />
                  <BindingChip
                    source={sources[1] ?? null}
                    empty={tBind('add')}
                    onPress={() => setCapture({ row, index: sources.length >= 1 ? 1 : 0, t: 0 })}
                    onClear={sources[1] ? () => {
                      input.rebind(row.action, device, row.slot, 1, null);
                      persist();
                    } : undefined}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
      <div class="hh-bindings-foot">
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          onPress={() => {
            input.resetBindings();
            persist();
          }}
        >
          {tBind('resetAll')}
        </Button>
      </div>
      {capture && (
        <Modal
          title={device === 'kbm' ? tBind('pressKey', { action: capture.row.label }) : tBind('pressButton', { action: capture.row.label })}
          icon={device === 'kbm' ? 'keyboard' : 'gamepad'}
          size="sm"
          bare
          onClose={() => {
            input.cancelCapture();
            setCapture(null);
          }}
        >
          <p>{device === 'kbm' ? tBind('keyHelp') : tBind('padHelp')}</p>
          <p class="hh-small">{tBind('cancelsIn', { n: Math.max(0, Math.ceil(CAPTURE_TIMEOUT - capture.t)) })}</p>
        </Modal>
      )}
    </section>
  );
}

