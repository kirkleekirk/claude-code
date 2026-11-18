import { signal } from '@preact/signals-core';
import { fail, ok } from '@/core/types';
import type { GameActions } from '@/game/actions';
import type { SaveManager, SlotId } from '@/save';
import { createMemoryPhotoStore, type PhotoStore } from '@/save/photos';
import type { MinimapSource, PhotoModeControls, PhotoModeState, UiApi } from '../api';

/** Lab-only stand-ins for the game runtime. Everything here exists to exercise the UI. */

export interface LabLog {
  entries: string[];
}

export const labLog: LabLog = { entries: [] };

function record(entry: string): void {
  labLog.entries.push(entry);
  if (labLog.entries.length > 200) labLog.entries.shift();
}

/** A sunset gradient image as a data URL (save thumbnails, gallery photos). */
export function sunsetImage(w: number, h: number, hue = 0, type: 'image/png' | 'image/jpeg' = 'image/jpeg'): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `hsl(${255 + hue}, 55%, 22%)`);
  sky.addColorStop(0.45, `hsl(${320 + hue}, 70%, 48%)`);
  sky.addColorStop(0.7, `hsl(${22 + hue}, 95%, 60%)`);
  sky.addColorStop(0.72, `hsl(${255 + hue}, 50%, 25%)`);
  sky.addColorStop(1, `hsl(${255 + hue}, 55%, 10%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,220,140,.95)';
  g.beginPath();
  g.arc(w * 0.66, h * 0.66, h * 0.18, Math.PI, 0);
  g.fill();
  g.fillStyle = '#0B0720';
  for (let i = 0; i < 9; i++) g.fillRect(w * (0.04 + i * 0.06), h * (0.72 - 0.08 - (i % 4) * 0.05), w * 0.045, h);
  return c.toDataURL(type, 0.8);
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function seedSaves(saves: SaveManager, count: number): Promise<void> {
  const base = {
    playtime: 2 * 3600 + 14 * 60, rank: 4, rankTitle: 'Operator', cash: 18420, location: 'Palmetto Flats', day: 6,
    clockHours: 18.67, brand: 'Abuela Gold',
  };
  if (count >= 1) saves.write('auto', { ...base, savedAt: Date.now() - 6 * 60000, thumb: sunsetImage(320, 180, 0) }, { lab: true }, {});
  if (count >= 2) saves.write(1, { ...base, savedAt: Date.now() - 3 * 3600000, rank: 3, rankTitle: 'Hustler', cash: 6240, location: 'Neon Strand', day: 3, clockHours: 21.25, thumb: sunsetImage(320, 180, 30) }, { lab: true }, {});
  if (count >= 3) saves.write(3, { ...base, savedAt: Date.now() - 4 * 86400000, rank: 7, rankTitle: 'Boss', cash: 241800, location: 'Isla Dorada', day: 19, clockHours: 7.5, brand: null, thumb: null }, { lab: true }, {});
}

export async function seedPhotos(store: PhotoStore, count: number): Promise<void> {
  const places = ['The Causeway', 'Neon Strand', 'Pier 9', 'Deco Row', 'The Sawgrass', 'Crown Point'];
  for (let i = 0; i < count; i++) {
    const blob = await dataUrlToBlob(sunsetImage(960, 540, i * 25, 'image/png'));
    await store.add(blob, { width: 960, height: 540, place: places[i % places.length] });
  }
}

export function createLabPhotos(): PhotoStore {
  return createMemoryPhotoStore();
}

export function createLabActions(getUi: () => UiApi | null, saves: SaveManager): GameActions {
  const toast = (title: string) => getUi()?.toast({ kind: 'info', icon: 'info', title });
  return {
    newGame(o) {
      record(`newGame:${o.look}:${o.palette}:${o.difficulty}`);
      toast(`New game · look ${o.look + 1}, outfit ${o.palette + 1}, ${o.difficulty}`);
    },
    continueGame() {
      record('continueGame');
      toast('Continue');
    },
    loadSlot(slot) {
      record(`loadSlot:${slot}`);
      toast(`Load ${slot}`);
    },
    saveSlot(slot) {
      record(`saveSlot:${slot}`);
      const res = saves.write(slot, {
        savedAt: Date.now(), playtime: 1234, rank: 2, rankTitle: 'Greenthumb', cash: 1240, location: 'Palmetto Flats', day: 1,
        clockHours: 18.9, brand: null, thumb: sunsetImage(320, 180, 60),
      }, { lab: true }, {});
      return res.ok ? ok(res.value) : fail(res.error);
    },
    deleteSlot(slot: SlotId) {
      record(`deleteSlot:${slot}`);
      saves.remove(slot);
    },
    exportSlot(slot) {
      record(`exportSlot:${slot}`);
    },
    importSave(text, slot) {
      record(`importSave:${slot}`);
      const r = saves.importText(text, slot);
      return r.ok ? ok(r.value) : fail(r.error);
    },
    quitToMenu() {
      record('quitToMenu');
      const ui = getUi();
      ui?.closeAll();
      ui?.hud.visible.value && (ui.hud.visible.value = false);
      ui?.showFrontend('mainMenu');
    },
    quitGame() {
      record('quitGame');
      getUi()?.showFrontend('goodbye');
    },
    pause() {
      record('pause');
      getUi()?.openPause();
    },
    resume() {
      record('resume');
      getUi()?.closePause();
    },
    retry() {
      record('retry');
    },
    skipCutscene() {
      record('skipCutscene');
    },
    setFullscreen(on) {
      record(`fullscreen:${on}`);
    },
    setWaypoint(t) {
      record(`waypoint:${typeof t === 'string' ? t : t ? 'point' : 'none'}`);
    },
    fastTravel(id) {
      record(`fastTravel:${id}`);
      return ok(undefined);
    },
    callVehicle(id) {
      record(`callVehicle:${id}`);
      return ok(undefined);
    },
    chauffeurTo(t) {
      record(`chauffeur:${t}`);
      return ok(undefined);
    },
    waitUntil(h) {
      record(`waitUntil:${h}`);
      return ok(undefined);
    },
    enterPhotoMode() {
      record('photoMode');
    },
    enterBuildMode() {
      record('buildMode');
      return ok(undefined);
    },
    runBenchmark() {
      record('benchmark');
      return new Promise((r) => setTimeout(() => r('high'), 900));
    },
  };
}

export function createLabPhotoControls(onExit: () => void): PhotoModeControls {
  const state = signal<PhotoModeState>({
    fov: 55, dof: true, focusDistance: 12, aperture: 0.45, exposure: 0, timeOfDay: 18.67, grade: 'golden', hideCharacters: false, watermark: true,
  });
  const mode = signal<'camera' | 'panel'>('panel');
  return {
    state,
    mode,
    set(key, value) {
      state.value = { ...state.peek(), [key]: value };
    },
    setMode(m) {
      mode.value = m;
    },
    async capture() {
      return (await fetch(sunsetImage(1280, 720, 10, 'image/png'))).blob();
    },
    exit() {
      onExit();
    },
  };
}

/** A stylised map for the minimap frame. */
export const labMinimap: MinimapSource = {
  draw(ctx, w, h, dpr) {
    const t = performance.now() / 1000;
    ctx.fillStyle = '#123A5C';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.sin(t * 0.2) * 0.1);
    const s = w / 220;
    const land = (pts: Array<[number, number]>, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
      ctx.closePath();
      ctx.fill();
    };
    land([[-120, -40], [-20, -60], [60, -30], [130, -50], [140, 130], [-120, 130]], '#3B2A6B');
    land([[-40, -10], [40, 0], [50, 70], [-50, 80]], '#4A3784');
    land([[-130, -130], [-60, -120], [-70, -70], [-130, -80]], '#4A3784');
    ctx.strokeStyle = 'rgba(255,244,227,.55)';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    for (let x = -120; x <= 140; x += 40) {
      ctx.moveTo(x * s, -60 * s);
      ctx.lineTo(x * s, 130 * s);
    }
    for (let y = -40; y <= 130; y += 34) {
      ctx.moveTo(-120 * s, y * s);
      ctx.lineTo(140 * s, y * s);
    }
    ctx.stroke();
    ctx.strokeStyle = '#B8F54A';
    ctx.lineWidth = 5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -34 * s);
    ctx.lineTo(80 * s, -34 * s);
    ctx.stroke();
    ctx.fillStyle = '#FF3D8B';
    ctx.beginPath();
    ctx.arc(80 * s, -34 * s, 6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFF4E3';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 9 * dpr);
    ctx.lineTo(w / 2 + 7 * dpr, h / 2 + 7 * dpr);
    ctx.lineTo(w / 2, h / 2 + 3 * dpr);
    ctx.lineTo(w / 2 - 7 * dpr, h / 2 + 7 * dpr);
    ctx.closePath();
    ctx.fill();
  },
};
