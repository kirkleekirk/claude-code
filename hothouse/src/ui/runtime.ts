import { computed, signal, type ReadonlySignal } from '@preact/signals-core';
import type { NowPlaying } from '@/audio/api';
import type { SettingCategory } from '@/save';
import type {
  BustedSpec, ConfirmSpec, DialogueResult, DialogueScript, FrontendScreen, HintSpec, LayerId, MinimapSource,
  NextBestAction, PhoneAppDef, PhotoModeControls, QuickWheelSlot, RankUpSpec, ShiftReportSpec, TitleCardSpec, ToastSpec, UiApi, UiDeps,
} from './api';
import { Ticker } from './core/context';
import type { FocusManager } from './core/focus';
import { HintBook, type HintRecord, type HintRequest } from './core/hints';
import { TipController } from './core/tips';
import { createHudModel, type HudModel } from './hud/model';

/** One entry in the overlay stack. `resolve` settles the promise the caller is awaiting. */
export type LayerEntry =
  | { id: number; kind: 'pause' }
  | { id: number; kind: 'settings'; tab: SettingCategory }
  | { id: number; kind: 'saveLoad'; mode: 'save' | 'load' }
  | { id: number; kind: 'gallery' }
  | { id: number; kind: 'credits' }
  | { id: number; kind: 'confirm'; spec: ConfirmSpec; resolve: (v: boolean) => void }
  | { id: number; kind: 'dialogue'; script: DialogueScript; resolve: (v: DialogueResult) => void }
  | { id: number; kind: 'rankUp'; spec: RankUpSpec; resolve: () => void }
  | { id: number; kind: 'shiftReport'; spec: ShiftReportSpec; resolve: () => void }
  | { id: number; kind: 'busted'; spec: BustedSpec; resolve: () => void }
  | { id: number; kind: 'titleCard'; spec: TitleCardSpec; resolve: () => void }
  | { id: number; kind: 'photoMode'; controls: PhotoModeControls };

type LayerKind = LayerEntry['kind'];

export interface ToastEntry {
  id: number;
  spec: ToastSpec;
  age: number;
  duration: number;
  leaving: boolean;
}

const PAUSING: ReadonlySet<LayerKind> = new Set(['pause', 'settings', 'saveLoad', 'gallery', 'credits', 'confirm', 'rankUp', 'shiftReport', 'busted']);
const MAX_TOASTS = 3;
const TOAST_EXIT = 0.24;
const WHEEL_HOLD = 0.16;
const HINT_KEY = 'hints';
const HINT_TEXT_KEY = 'hintTexts';

export interface SeenHint {
  id: string;
  text: string;
  action?: string;
}

export class UiRuntime implements UiApi {
  readonly hud: HudModel = createHudModel();
  readonly ticker = new Ticker();
  readonly tips = new TipController();

  readonly frontend = signal<FrontendScreen>('none');
  readonly loading = signal({ progress: 0, label: '' });
  readonly started = signal(false);
  readonly layers = signal<readonly LayerEntry[]>([]);
  readonly toasts = signal<readonly ToastEntry[]>([]);
  readonly currentHint = signal<HintRequest | null>(null);
  readonly phoneOpen = signal(false);
  readonly phoneRoute = signal<{ app: string; params: Record<string, unknown> }>({ app: 'home', params: {} });
  readonly apps = signal<readonly PhoneAppDef[]>([]);
  readonly nba = signal<ReadonlySignal<NextBestAction | null> | null>(null);
  readonly wheelSlots = signal<readonly QuickWheelSlot[]>([]);
  readonly wheelOpen = signal(false);
  readonly wheelSelected = signal(-1);
  readonly minimap = signal<MinimapSource | null>(null);
  readonly nowPlaying = signal<{ info: NowPlaying; id: number } | null>(null);
  readonly hotkeys = signal(true);
  readonly fps = signal(0);

  readonly wantsInput: ReadonlySignal<boolean>;
  readonly top: ReadonlySignal<LayerId | null>;
  readonly pausesWorld: ReadonlySignal<boolean>;

  private readonly hintBook: HintBook;
  private readonly hintTexts: Map<string, SeenHint>;
  private seq = 0;
  private startWaiters: Array<() => void> = [];
  private phoneHistory: Array<{ app: string; params: Record<string, unknown> }> = [];
  private wheelHeld = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(readonly deps: UiDeps, readonly focus: FocusManager) {
    this.hintBook = new HintBook(deps.settings.blob<HintRecord>(HINT_KEY));
    const texts = deps.settings.blob<Record<string, SeenHint>>(HINT_TEXT_KEY);
    this.hintTexts = new Map(texts && typeof texts === 'object' ? Object.entries(texts).filter(([, v]) => v && typeof v.text === 'string') : []);
    this.wantsInput = computed(() => {
      void this.focus.version.value;
      return this.focus.capturing || this.wheelOpen.value || this.frontend.value !== 'none';
    });
    this.top = computed<LayerId | null>(() => {
      const layers = this.layers.value;
      if (layers.length) return layers[layers.length - 1]!.kind;
      if (this.phoneOpen.value) return 'phone';
      if (this.wheelOpen.value) return 'quickWheel';
      const f = this.frontend.value;
      return f === 'none' ? null : f;
    });
    this.pausesWorld = computed(() => this.layers.value.some((l) => PAUSING.has(l.kind)));
  }

  // ── front end ────────────────────────────────────────────────────────────

  showFrontend(screen: FrontendScreen): void {
    this.frontend.value = screen;
    if (screen !== 'none') this.closePhone();
  }

  setLoading(progress: number, label?: string): void {
    const p = Math.max(0, Math.min(1, progress));
    this.loading.value = { progress: p, label: label ?? this.loading.peek().label };
    this.flushStart();
  }

  waitForStart(): Promise<void> {
    if (this.started.peek() && this.loading.peek().progress >= 1) return Promise.resolve();
    return new Promise((resolve) => this.startWaiters.push(resolve));
  }

  /** Called by the click-to-start screen on the player's gesture. */
  markStarted(): void {
    if (!this.started.peek()) {
      this.deps.onUserGesture?.();
      this.started.value = true;
    }
    this.flushStart();
  }

  titleCard(spec: TitleCardSpec): Promise<void> {
    return new Promise((resolve) => this.push({ id: ++this.seq, kind: 'titleCard', spec, resolve }));
  }

  // ── overlays ─────────────────────────────────────────────────────────────

  openPause(): void {
    if (this.has('pause')) return;
    this.closePhone();
    this.wheelOpen.value = false;
    this.push({ id: ++this.seq, kind: 'pause' });
  }

  closePause(): void {
    const i = this.layers.peek().findIndex((l) => l.kind === 'pause');
    if (i >= 0) this.truncate(i);
  }

  openSettings(tab: SettingCategory = 'graphics'): void {
    this.push({ id: ++this.seq, kind: 'settings', tab });
  }

  openSaveLoad(mode: 'save' | 'load'): void {
    this.push({ id: ++this.seq, kind: 'saveLoad', mode });
  }

  openGallery(): void {
    this.push({ id: ++this.seq, kind: 'gallery' });
  }

  openCredits(): void {
    this.push({ id: ++this.seq, kind: 'credits' });
  }

  closeAll(): void {
    this.truncate(0);
    this.closePhone();
    this.wheelOpen.value = false;
  }

  /** Close one overlay entry (and settle its promise with the default answer). */
  close(id: number): void {
    const list = this.layers.peek();
    const entry = list.find((l) => l.id === id);
    if (!entry) return;
    this.layers.value = list.filter((l) => l.id !== id);
    this.settle(entry);
    this.tips.hide();
  }

  confirm(spec: ConfirmSpec): Promise<boolean> {
    return new Promise((resolve) => this.push({ id: ++this.seq, kind: 'confirm', spec, resolve }));
  }

  dialogue(script: DialogueScript): Promise<DialogueResult> {
    return new Promise((resolve) => this.push({ id: ++this.seq, kind: 'dialogue', script, resolve }));
  }

  rankUp(spec: RankUpSpec): Promise<void> {
    return new Promise((resolve) => this.push({ id: ++this.seq, kind: 'rankUp', spec, resolve }));
  }

  shiftReport(spec: ShiftReportSpec): Promise<void> {
    return new Promise((resolve) => this.push({ id: ++this.seq, kind: 'shiftReport', spec, resolve }));
  }

  busted(spec: BustedSpec): Promise<void> {
    this.closePhone();
    return new Promise((resolve) => this.push({ id: ++this.seq, kind: 'busted', spec, resolve }));
  }

  /** Resolve a promise-backed entry with a value and remove it. */
  resolveLayer<K extends LayerKind>(id: number, value?: unknown): void {
    const list = this.layers.peek();
    const entry = list.find((l) => l.id === id) as Extract<LayerEntry, { kind: K }> | undefined;
    if (!entry) return;
    this.layers.value = list.filter((l) => l.id !== id);
    this.tips.hide();
    if ('resolve' in entry) (entry.resolve as (v: unknown) => void)(value);
  }

  // ── phone ────────────────────────────────────────────────────────────────

  openPhone(appId?: string, params: Record<string, unknown> = {}): void {
    if (this.frontend.peek() !== 'none') return;
    const target = appId && (appId === 'home' || this.apps.peek().some((a) => a.id === appId)) ? appId : null;
    if (!this.phoneOpen.peek()) {
      this.phoneOpen.value = true;
      this.deps.sound?.ui('phoneOpen');
      if (!target) return; // reopen where the player left it
    }
    if (target) this.navigatePhone(target, params);
  }

  closePhone(): void {
    if (!this.phoneOpen.peek()) return;
    this.phoneOpen.value = false;
    this.deps.sound?.ui('phoneClose');
    this.tips.hide();
  }

  togglePhone(): void {
    if (this.phoneOpen.peek()) this.closePhone();
    else this.openPhone();
  }

  navigatePhone(app: string, params: Record<string, unknown> = {}): void {
    const cur = this.phoneRoute.peek();
    if (cur.app === app && JSON.stringify(cur.params) === JSON.stringify(params)) return;
    this.phoneHistory.push(cur);
    if (this.phoneHistory.length > 20) this.phoneHistory.shift();
    this.phoneRoute.value = { app, params };
  }

  /** Back inside the phone: previous screen, then home, then close. */
  phoneBack(): void {
    const prev = this.phoneHistory.pop();
    if (prev && !(prev.app === this.phoneRoute.peek().app && prev.app === 'home')) {
      this.phoneRoute.value = prev;
      return;
    }
    if (this.phoneRoute.peek().app !== 'home') {
      this.phoneRoute.value = { app: 'home', params: {} };
      return;
    }
    this.closePhone();
  }

  registerPhoneApp(app: PhoneAppDef): () => void {
    this.apps.value = [...this.apps.peek().filter((a) => a.id !== app.id), app].sort((a, b) => a.order - b.order);
    return () => {
      this.apps.value = this.apps.peek().filter((a) => a !== app);
      if (this.phoneRoute.peek().app === app.id) this.phoneRoute.value = { app: 'home', params: {} };
    };
  }

  setNextBestAction(action: ReadonlySignal<NextBestAction | null> | null): void {
    this.nba.value = action;
  }

  // ── feedback ─────────────────────────────────────────────────────────────

  toast(spec: ToastSpec): void {
    const duration = spec.duration ?? (spec.kind === 'message' ? 6 : 4.5);
    let list = [...this.toasts.peek()];
    if (spec.key) list = list.filter((t) => t.spec.key !== spec.key);
    list.unshift({ id: ++this.seq, spec, age: 0, duration, leaving: false });
    // Older toasts beyond the limit leave early.
    list = list.map((t, i) => (i >= MAX_TOASTS && !t.leaving ? { ...t, leaving: true, age: Math.max(t.age, t.duration) } : t));
    this.toasts.value = list;
    this.deps.sound?.ui(spec.kind === 'message' ? 'message' : spec.kind === 'money' ? 'cash' : 'toast');
  }

  dismissToast(id: number): void {
    this.toasts.value = this.toasts.peek().map((t) => (t.id === id ? { ...t, leaving: true, age: Math.max(t.age, t.duration) } : t));
  }

  hint(spec: HintSpec): void {
    if (this.hintTexts.get(spec.id)?.text !== spec.text) {
      this.hintTexts.set(spec.id, spec.action ? { id: spec.id, text: spec.text, action: spec.action } : { id: spec.id, text: spec.text });
      this.deps.settings.setBlob(HINT_TEXT_KEY, Object.fromEntries(this.hintTexts));
    }
    this.hintBook.request({
      id: spec.id, text: spec.text, action: spec.action, priority: spec.priority ?? 0, duration: spec.duration ?? 14,
    });
  }

  learnHint(id: string): void {
    if (this.hintBook.learn(id)) this.persistHints();
    if (this.currentHint.peek()?.id === id) this.currentHint.value = null;
  }

  dismissHint(): void {
    if (this.hintBook.dismiss()) this.persistHints();
    this.currentHint.value = null;
  }

  /** Learned hints whose text is known, for Help → replay. */
  learnedHints(): SeenHint[] {
    return this.hintBook.learnedIds().map((id) => this.hintTexts.get(id)).filter((h): h is SeenHint => !!h);
  }

  /** Help → replay: forget and show again now. */
  replayHint(spec: HintSpec): void {
    this.hintBook.unlearn(spec.id);
    this.persistHints();
    this.hint(spec);
  }

  // ── gameplay helpers ─────────────────────────────────────────────────────

  setQuickWheel(slots: readonly QuickWheelSlot[]): void {
    this.wheelSlots.value = slots;
  }

  openPhotoMode(controls: PhotoModeControls): void {
    this.closePhone();
    if (!this.has('photoMode')) this.push({ id: ++this.seq, kind: 'photoMode', controls });
  }

  closePhotoMode(): void {
    const e = this.layers.peek().find((l) => l.kind === 'photoMode');
    if (e) this.close(e.id);
  }

  setMinimap(source: MinimapSource | null): void {
    this.minimap.value = source;
  }

  showNowPlaying(info: NowPlaying | null): void {
    this.nowPlaying.value = info ? { info, id: ++this.seq } : null;
  }

  /** Disable the pause / phone / map / wheel hotkeys (cutscenes, scripted moments). */
  setHotkeysEnabled(on: boolean): void {
    this.hotkeys.value = on;
  }

  // ── per frame ────────────────────────────────────────────────────────────

  update(dtReal: number): void {
    const dt = Math.min(0.1, Math.max(0, dtReal));
    const { input, settings } = this.deps;
    this.focus.holdToToggle = settings.get('game.holdToToggle');
    this.focus.update(dt);

    // Gameplay hotkeys: only during play, with nothing else taking input.
    const playing = this.hotkeys.peek() && this.hud.visible.peek() && this.frontend.peek() === 'none' && this.layers.peek().length === 0;
    if (playing && !this.phoneOpen.peek()) {
      if (input.pressed('pause')) this.openPause();
      else if (input.pressed('phone')) this.openPhone();
      else if (input.pressed('map') && this.apps.peek().some((a) => a.id === 'map')) this.openPhone('map');
      this.updateWheel(dt, playing);
    } else if (this.wheelOpen.peek()) {
      this.wheelOpen.value = false;
    }
    if (this.phoneOpen.peek() && this.layers.peek().length === 0) {
      if (input.pressed('uiPhone')) this.closePhone();
      else if (input.pressed('uiMap') && this.apps.peek().some((a) => a.id === 'map')) this.navigatePhone('map');
    }

    this.ticker.tick(dt);
    this.updateToasts(dt);
    // Hints are for play: they wait while anything sits on top (menus, phone, wheel, dialogue, front end).
    if (this.hintBook.tick(dt, settings.get('game.hints') && this.hud.visible.peek() && this.top.peek() === null)) {
      this.currentHint.value = this.hintBook.current;
    }
    this.fpsAcc += dtReal;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps.value = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  dispose(): void {
    this.closeAll();
    this.focus.dispose();
    this.tips.hide();
  }

  // ── internals ────────────────────────────────────────────────────────────

  private has(kind: LayerKind): boolean {
    return this.layers.peek().some((l) => l.kind === kind);
  }

  private push(entry: LayerEntry): void {
    this.layers.value = [...this.layers.peek(), entry];
    this.tips.hide();
  }

  /** Remove entries from index `i` upward, settling their promises. */
  private truncate(i: number): void {
    const list = this.layers.peek();
    if (i >= list.length) return;
    const removed = list.slice(i);
    this.layers.value = list.slice(0, i);
    for (let j = removed.length - 1; j >= 0; j--) this.settle(removed[j]!);
    this.tips.hide();
  }

  private settle(entry: LayerEntry): void {
    switch (entry.kind) {
      case 'confirm':
        entry.resolve(false);
        break;
      case 'dialogue':
        entry.resolve({ choice: null, skipped: true });
        break;
      case 'rankUp':
      case 'shiftReport':
      case 'busted':
      case 'titleCard':
        entry.resolve();
        break;
      case 'photoMode':
        entry.controls.exit();
        break;
      default:
        break;
    }
  }

  private flushStart(): void {
    if (!this.started.peek() || this.loading.peek().progress < 1) return;
    const waiters = this.startWaiters;
    this.startWaiters = [];
    for (const w of waiters) w();
  }

  private persistHints(): void {
    this.deps.settings.setBlob(HINT_KEY, this.hintBook.serialize());
  }

  private updateToasts(dt: number): void {
    const list = this.toasts.peek();
    if (list.length === 0) return;
    let changed = false;
    const next: ToastEntry[] = [];
    for (const t of list) {
      const age = t.age + dt;
      if (age >= t.duration + TOAST_EXIT) {
        changed = true;
        continue;
      }
      const leaving = t.leaving || age >= t.duration;
      if (leaving !== t.leaving) changed = true;
      next.push({ ...t, age, leaving });
    }
    // Ages advance silently; only re-render on structural change.
    if (changed) this.toasts.value = next;
    else for (let i = 0; i < list.length; i++) (list[i] as ToastEntry).age = next[i]!.age;
  }

  private updateWheel(dt: number, playing: boolean): void {
    const input = this.deps.input;
    const slots = this.wheelSlots.peek();
    if (!playing || slots.length === 0) {
      this.wheelHeld = 0;
      if (this.wheelOpen.peek()) this.wheelOpen.value = false;
      return;
    }
    if (input.down('quickWheel')) {
      this.wheelHeld += dt;
      if (!this.wheelOpen.peek() && this.wheelHeld >= WHEEL_HOLD) {
        this.wheelOpen.value = true;
        this.wheelSelected.value = -1;
        this.deps.sound?.ui('open');
      }
      return;
    }
    if (this.wheelOpen.peek()) {
      const i = this.wheelSelected.peek();
      this.wheelOpen.value = false;
      const slot = i >= 0 ? slots[i] : undefined;
      if (slot && !slot.disabledReason) {
        this.deps.sound?.ui('confirm');
        slot.run();
      } else {
        this.deps.sound?.ui('close');
      }
    }
    this.wheelHeld = 0;
  }
}
