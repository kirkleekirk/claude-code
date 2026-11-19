import { useEffect, useRef, useState } from 'preact/hooks';
import type { PhotoMeta } from '@/save/photos';
import { Button, IconButton } from '../components/Button';
import { ActionHint } from '../components/Glyph';
import { EmptyState, ScrollArea, Spinner } from '../components/display';
import { useFocusScope, useSound, useUi } from '../core/context';
import type { LayerEntry } from '../runtime';
import { tc } from '../strings/common';
import { tCards } from '../strings/menus';

type Entry = Extract<LayerEntry, { kind: 'gallery' }>;

function useObjectUrl(load: () => Promise<Blob | null>, key: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void load().then((b) => {
      if (!alive || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);
  return url;
}

function Thumb({ meta, onOpen, autofocus }: { meta: PhotoMeta; onOpen: () => void; autofocus?: boolean }) {
  const { deps } = useUi();
  const play = useSound();
  const url = useObjectUrl(() => deps.photos?.thumb(meta.id) ?? Promise.resolve(null), meta.id);
  return (
    <button
      type="button"
      class="hh-gallery-thumb"
      data-focusable=""
      data-autofocus={autofocus ? '' : undefined}
      onClick={() => {
        play('confirm');
        onOpen();
      }}
    >
      {url ? <img src={url} alt={meta.place ?? ''} /> : <Spinner />}
    </button>
  );
}

function dateLabel(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms);
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function Viewer({ meta, onClose, onDeleted }: { meta: PhotoMeta; onClose: () => void; onDeleted: () => void }) {
  const { deps, ui } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const url = useObjectUrl(() => deps.photos?.get(meta.id) ?? Promise.resolve(null), meta.id);
  useFocusScope(ref, { name: 'photo-viewer', onBack: onClose });
  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `hothouse-${new Date(meta.createdAt).toISOString().replace(/[:.]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const del = async () => {
    await deps.photos?.remove(meta.id);
    ui.toast({ kind: 'info', icon: 'trash', title: tCards('deletePhoto') });
    onDeleted();
  };
  return (
    <div ref={ref} class="hh-viewer hh-interactive" role="dialog" aria-modal="true">
      <div class="hh-viewer-image">{url ? <img src={url} alt={meta.place ?? ''} /> : <Spinner size="2.5rem" />}</div>
      <div class="hh-viewer-bar hh-glass">
        <span class="hh-viewer-caption">{tCards('takenAt', { date: dateLabel(meta.createdAt), place: meta.place ?? 'Halcyon Bay' })}</span>
        <Button variant="secondary" size="sm" icon="download" autofocus onPress={download}>{tCards('download')}</Button>
        <Button variant="secondary" size="sm" icon="trash" hold glyph="uiConfirm" onPress={() => void del()}>{tCards('holdToDeletePhoto')}</Button>
        <IconButton icon="close" label={tc('close')} onPress={onClose} sound="back" />
      </div>
    </div>
  );
}

/** Grid, empty state and viewer; used by the gallery overlay and the phone's Photos app. */
export function GalleryBody({ compact = false, onCount }: { compact?: boolean; onCount?: (n: number) => void }) {
  const { deps } = useUi();
  const [photos, setPhotos] = useState<PhotoMeta[] | null>(null);
  const [open, setOpen] = useState<PhotoMeta | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let alive = true;
    void (deps.photos?.list() ?? Promise.resolve([])).then((list) => {
      if (!alive) return;
      setPhotos(list);
      onCount?.(list.length);
    });
    return () => {
      alive = false;
    };
  }, [rev]);
  const persistent = deps.photos?.persistent ?? true;
  return (
    <div class={`hh-gallery-body${compact ? ' is-compact' : ''}`}>
      {!persistent && <p class="hh-small hh-gallery-note">{tCards('gallerySession')}</p>}
      {photos === null ? (
        <div class="hh-center"><Spinner size="2rem" /></div>
      ) : photos.length === 0 ? (
        <EmptyState icon="camera" title={tCards('galleryEmpty')} body={tCards('galleryEmptyBody')} action={<ActionHint action="photoMode">{tCards('photoMode')}</ActionHint>} />
      ) : (
        <ScrollArea class="hh-gallery-scroll">
          <div class="hh-gallery-grid">
            {photos.map((p, i) => <Thumb key={p.id} meta={p} autofocus={i === 0} onOpen={() => setOpen(p)} />)}
          </div>
        </ScrollArea>
      )}
      {open && (
        <Viewer
          meta={open}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            setRev((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}

export function Gallery({ entry }: { entry: Entry }) {
  const { ui } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const close = () => ui.close(entry.id);
  useFocusScope(ref, { name: 'gallery', onBack: close });
  return (
    <div class="hh-overlay hh-gallery hh-interactive">
      <div class="hh-scrim" onClick={close} />
      <div ref={ref} class="hh-panel hh-panel-wide hh-glass hh-enter" role="dialog" aria-modal="true" aria-label={tCards('galleryTitle')}>
        <header class="hh-panel-head">
          <h1 class="hh-title">{tCards('galleryTitle')}</h1>
          {count > 0 && <span class="hh-chip hh-tone-neutral">{tCards.n('photoCount', count)}</span>}
          <span class="hh-spacer" />
          <IconButton icon="close" label={tc('close')} onPress={close} sound="back" />
        </header>
        <GalleryBody onCount={setCount} />
      </div>
    </div>
  );
}
