import { useMemo, useRef, useState } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import { SLOTS, type SaveMeta, type SlotId } from '@/save';
import { Button, IconButton } from '../components/Button';
import { ContextMenu, type MenuItem } from '../components/Modal';
import { ActionHint } from '../components/Glyph';
import { EmptyState, ScrollArea } from '../components/display';
import { useFocusScope, useFocusable, useSound, useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import type { LayerEntry } from '../runtime';
import { tc } from '../strings/common';
import { tMenu } from '../strings/menus';
import { savedWhen } from './MainMenu';

type Entry = Extract<LayerEntry, { kind: 'saveLoad' }>;

const slotName = (slot: SlotId) => (slot === 'auto' ? tMenu('autosave') : tMenu('slot', { n: slot }));

function SlotCard({ slot, meta, mode, onPress, onMore, autofocus }: { slot: SlotId; meta: SaveMeta | null; mode: 'save' | 'load'; onPress: () => void; onMore: (anchor: DOMRect) => void; autofocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const play = useSound();
  const disabled = (mode === 'load' && !meta) || (mode === 'save' && slot === 'auto') ? (slot === 'auto' && mode === 'save' ? tMenu('autosaveReadOnly') : tMenu('emptySlot')) : undefined;
  useFocusable(ref, { onSecondary: meta ? () => ref.current && onMore(ref.current.getBoundingClientRect()) : undefined });
  return (
    <div
      ref={ref}
      class={`hh-slot${meta ? '' : ' is-empty'}${disabled ? ' is-disabled' : ''}`}
      role="button"
      tabIndex={-1}
      data-focusable=""
      data-autofocus={autofocus ? '' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      title={disabled}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.hh-slot-more')) return;
        if (disabled) {
          play('error');
          return;
        }
        play('confirm');
        onPress();
      }}
    >
      <div class="hh-slot-thumb">
        {meta?.thumb ? <img src={meta.thumb} alt="" /> : <Icon name={meta ? 'image' : mode === 'save' && slot !== 'auto' ? 'plus' : 'image'} size="1.75rem" />}
      </div>
      <div class="hh-slot-text">
        <div class="hh-slot-name">
          <span>{slotName(slot)}</span>
          {slot === 'auto' && <Icon name="refresh" class="hh-slot-auto" />}
        </div>
        {meta ? (
          <>
            <div class="hh-slot-rank">{tMenu('rankLine', { rank: meta.rank, title: meta.rankTitle })}{meta.brand ? ` · ${meta.brand}` : ''}</div>
            <div class="hh-slot-meta">
              <span class="hh-money">{fmt.money(meta.cash)}</span>
              <span>{meta.location}</span>
              <span>{tMenu('dayClock', { day: meta.day, clock: fmt.clock(meta.clockHours) })}</span>
            </div>
            <div class="hh-slot-sub">{tMenu('playtime', { time: fmt.duration(meta.playtime) })} · {tMenu('savedAgo', { when: savedWhen(meta.savedAt) })}</div>
          </>
        ) : (
          <div class="hh-slot-sub">{mode === 'save' && slot !== 'auto' ? tMenu('emptySlotSave') : tMenu('emptySlot')}</div>
        )}
      </div>
      {meta && (
        <span class="hh-slot-more">
          <IconButton icon="more" label={tc('more')} size="sm" onPress={() => ref.current && onMore(ref.current.getBoundingClientRect())} />
        </span>
      )}
    </div>
  );
}

export function SaveLoad({ entry }: { entry: Entry }) {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rev, setRev] = useState(0);
  const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null);
  const [importSlot, setImportSlot] = useState<SlotId>(1);
  const list = useMemo(() => deps.saves.list(), [rev]);
  const mode = entry.mode;
  const close = () => ui.close(entry.id);
  useFocusScope(ref, { name: 'save-load', onBack: close });
  const any = SLOTS.some((s) => list[String(s)]);

  const doSave = async (slot: SlotId) => {
    const existing = list[String(slot)];
    if (existing) {
      const ok = await ui.confirm({
        title: tMenu('overwriteTitle', { n: String(slot) }),
        body: tMenu('overwriteBody', { when: savedWhen(existing.savedAt) }),
        confirm: tMenu('overwrite'),
      });
      if (!ok) return;
    }
    const res = deps.actions.saveSlot(slot);
    if (res.ok) {
      ui.toast({ kind: 'success', icon: 'check', title: tMenu('saved', { n: String(slot) }) });
      setRev((r) => r + 1);
    } else {
      ui.toast({ kind: 'danger', icon: 'warning', title: res.error === 'quota' ? tMenu('saveFailedQuota') : res.error === 'unsafe' ? tMenu('saveUnsafe') : tMenu('saveFailedVerify'), duration: 7 });
    }
  };

  const doDelete = async (slot: SlotId) => {
    const ok = await ui.confirm({ title: `${tMenu('deleteSlot')} · ${slotName(slot)}`, body: tMenu('holdToDelete'), confirm: tMenu('deleteSlot'), danger: true });
    if (!ok) return;
    deps.actions.deleteSlot(slot);
    ui.toast({ kind: 'info', icon: 'trash', title: tMenu('deleted') });
    setRev((r) => r + 1);
  };

  const openMore = (slot: SlotId, anchor: DOMRect) => {
    setMenu({
      anchor,
      items: [
        { id: 'export', label: tMenu('exportSlot'), icon: 'download', run: () => deps.actions.exportSlot(slot) },
        { id: 'delete', label: tMenu('deleteSlot'), icon: 'trash', danger: true, run: () => void doDelete(slot) },
      ],
    });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = deps.actions.importSave(text, importSlot);
    if (res.ok) {
      ui.toast({ kind: 'success', icon: 'upload', title: tMenu('imported', { n: String(importSlot) }) });
      setRev((r) => r + 1);
    } else {
      ui.toast({ kind: 'danger', icon: 'warning', title: tMenu('importFailed'), duration: 6 });
    }
  };

  const chooseImport = (anchor: DOMRect) => {
    setMenu({
      anchor,
      items: ([1, 2, 3] as const).map((n) => ({
        id: `import-${n}`, label: tMenu('importTo', { n }), icon: 'upload',
        run: () => {
          setImportSlot(n);
          fileRef.current?.click();
        },
      })),
    });
  };

  const firstFilled = SLOTS.find((s) => list[String(s)]) ?? 1;
  return (
    <div class="hh-overlay hh-saveload hh-interactive">
      <div class="hh-scrim" onClick={close} />
      <div ref={ref} class="hh-panel hh-glass hh-enter" role="dialog" aria-modal="true" aria-label={mode === 'save' ? tMenu('saveTitle') : tMenu('loadTitle')}>
        <header class="hh-panel-head">
          <h1 class="hh-title">{mode === 'save' ? tMenu('saveTitle') : tMenu('loadTitle')}</h1>
          <IconButton icon="close" label={tc('close')} onPress={close} sound="back" />
        </header>
        {mode === 'load' && !any ? (
          <EmptyState icon="download" title={tMenu('noSaves')} body={tMenu('noSavesBody')} />
        ) : (
          <ScrollArea class="hh-slot-list">
            {SLOTS.map((slot) => (
              <SlotCard
                key={`${slot}-${rev}`}
                slot={slot}
                meta={list[String(slot)] ?? null}
                mode={mode}
                autofocus={mode === 'load' ? slot === firstFilled : slot === 1}
                onPress={() => (mode === 'save' ? void doSave(slot) : deps.actions.loadSlot(slot))}
                onMore={(anchor) => openMore(slot, anchor)}
              />
            ))}
          </ScrollArea>
        )}
        <footer class="hh-panel-foot">
          <div class="hh-panel-hints">
            <ActionHint action="uiSecondary" size="sm">{tc('more')}</ActionHint>
            <ActionHint action="uiBack" size="sm">{tc('back')}</ActionHint>
          </div>
          <Button variant="secondary" size="sm" icon="upload" onPress={() => chooseImport((ref.current?.querySelector('.hh-panel-foot') as HTMLElement).getBoundingClientRect())}>
            {tMenu('importSlot')}
          </Button>
        </footer>
        <input ref={fileRef} type="file" accept=".hothouse,application/json,.json" class="hh-sr-only" tabIndex={-1} onChange={(e) => void onFile((e.currentTarget as HTMLInputElement).files?.[0])} />
      </div>
      {menu && <ContextMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
