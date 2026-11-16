import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { tunables, type TunableField, type TunableGroup } from '@/core/tunables';
import type { Game } from '@/game/Game';

/**
 * Developer tuning panel (debug builds only, toggled with the backquote key). Lists every
 * `tunables.group()` live, plus a small performance readout. Not part of the player-facing UI.
 */

const CSS = `
.hh-dbg{position:fixed;top:12px;right:12px;bottom:12px;width:340px;z-index:9000;display:flex;flex-direction:column;
  font:500 12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#FFF4E3;background:rgba(11,7,32,.92);
  border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.5);overflow:hidden}
.hh-dbg header{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1)}
.hh-dbg header b{flex:1;font-size:13px;color:#B8F54A}
.hh-dbg input[type=search]{width:100%;box-sizing:border-box;margin:8px 12px 4px;width:calc(100% - 24px);padding:6px 8px;border-radius:8px;
  border:1px solid rgba(255,255,255,.15);background:#140B33;color:#FFF4E3;font:inherit}
.hh-dbg .scroll{overflow:auto;flex:1;padding:4px 0 12px}
.hh-dbg .scroll::-webkit-scrollbar{width:8px}.hh-dbg .scroll::-webkit-scrollbar-thumb{background:#3A2A7A;border-radius:8px}
.hh-dbg details{border-bottom:1px solid rgba(255,255,255,.06)}
.hh-dbg summary{cursor:pointer;padding:7px 12px;color:#17E0C8;list-style:none}
.hh-dbg summary::before{content:'▸ ';color:#FFD166}.hh-dbg details[open] summary::before{content:'▾ '}
.hh-dbg .row{display:grid;grid-template-columns:118px 1fr 58px;gap:6px;align-items:center;padding:2px 12px}
.hh-dbg .row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}
.hh-dbg .row input[type=range]{width:100%;accent-color:#B8F54A}
.hh-dbg .row input[type=number],.hh-dbg .row input[type=text]{width:100%;box-sizing:border-box;background:#140B33;color:#FFF4E3;
  border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:2px 4px;font:inherit}
.hh-dbg button{background:#2B1D66;color:#FFF4E3;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:4px 8px;font:inherit;cursor:pointer}
.hh-dbg button:hover{background:#3A2A7A}
.hh-dbg .perf{padding:8px 12px;border-top:1px solid rgba(255,255,255,.1);color:#FFD166;white-space:pre}
.hh-dbg .changed span{color:#B8F54A}
`;

function Field({ group, field, version }: { group: TunableGroup; field: TunableField; version: number }) {
  const value = group.values[field.key]!;
  const set = (v: number | boolean | string) => tunables.set(group.name, field.key, v);
  const changed = value !== field.initial;
  void version;
  if (field.kind === 'boolean') {
    return (
      <label class={`row${changed ? ' changed' : ''}`}>
        <span title={field.key}>{field.label}</span>
        <input type="checkbox" checked={value as boolean} onChange={(e) => set((e.currentTarget as HTMLInputElement).checked)} />
        <span />
      </label>
    );
  }
  if (field.kind === 'color' || field.kind === 'text') {
    return (
      <label class={`row${changed ? ' changed' : ''}`}>
        <span title={field.key}>{field.label}</span>
        {field.kind === 'color'
          ? <input type="color" value={value as string} onInput={(e) => set((e.currentTarget as HTMLInputElement).value)} />
          : <input type="text" value={value as string} onInput={(e) => set((e.currentTarget as HTMLInputElement).value)} />}
        <span />
      </label>
    );
  }
  return (
    <label class={`row${changed ? ' changed' : ''}`}>
      <span title={`${field.key} (default ${String(field.initial)})`}>{field.label}</span>
      <input type="range" min={field.min} max={field.max} step={field.step} value={value as number}
        onInput={(e) => set(Number((e.currentTarget as HTMLInputElement).value))} />
      <input type="number" step={field.step} value={value as number}
        onChange={(e) => set(Number((e.currentTarget as HTMLInputElement).value))} />
    </label>
  );
}

function Panel({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [version, setVersion] = useState(0);
  const [perf, setPerf] = useState('');

  useEffect(() => tunables.onChange(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote') setOpen((o) => !o);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const s = game.loop?.stats();
      const r = game.ctx.gfx.stats();
      const ms = s?.frameMs ?? [];
      const avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
      setPerf(
        `${avg ? (1000 / avg).toFixed(0) : '–'} fps  ${avg.toFixed(1)} ms\n` +
          `cpu  fixed ${s?.fixedMs.toFixed(2)}  upd ${s?.updateMs.toFixed(2)}  rnd ${s?.renderMs.toFixed(2)}\n` +
          `draws ${r.drawCalls}  tris ${(r.triangles / 1000).toFixed(0)}k  geo ${r.geometries}  tex ${r.textures}\n` +
          `${r.width}×${r.height} @${r.pixelRatio.toFixed(2)}  ${game.ctx.gfx.quality.tier}`,
      );
    }, 250);
    return () => clearInterval(id);
  }, [open, game]);

  const groups = useMemo(() => tunables.groups(), [version, open]);
  if (!open) return null;
  const f = filter.trim().toLowerCase();
  const shown = groups.filter((g) => !f || g.name.includes(f) || g.fields.some((x) => x.key.toLowerCase().includes(f)));

  const exportJson = () => {
    const text = JSON.stringify(tunables.exportChanged(), null, 2);
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  return (
    <div class="hh-dbg">
      <header>
        <b>Tuning</b>
        <button onClick={exportJson} title="Copy changed values as JSON">Copy</button>
        <button onClick={() => tunables.reset()}>Reset</button>
        <button onClick={() => setOpen(false)}>✕</button>
      </header>
      <input type="search" placeholder="Filter groups and fields" value={filter} onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} />
      <div class="scroll">
        {shown.map((g) => (
          <details key={g.name} open={!!f}>
            <summary>{g.name}</summary>
            {g.fields
              .filter((x) => !f || g.name.includes(f) || x.key.toLowerCase().includes(f))
              .map((x) => <Field key={x.key} group={g} field={x} version={version} />)}
          </details>
        ))}
      </div>
      <div class="perf">{perf}</div>
    </div>
  );
}

export function mountTuningPanel(game: Game): () => void {
  const host = document.createElement('div');
  host.id = 'hh-debug';
  const style = document.createElement('style');
  style.textContent = CSS;
  host.appendChild(style);
  const mountPoint = document.createElement('div');
  host.appendChild(mountPoint);
  document.body.appendChild(host);
  render(<Panel game={game} />, mountPoint);
  return () => {
    render(null, mountPoint);
    host.remove();
  };
}
