import type { ReadonlySignal } from '@preact/signals-core';
import type { ComponentType } from 'preact';
import type { NowPlaying, UiSound, VoiceProfile } from '@/audio/api';
import type { Appearance } from '@/content/appearance';
import type { GameActions } from '@/game/actions';
import type { ActionId, Input } from '@/input';
import type { SaveManager, SettingCategory, Settings } from '@/save';
import type { PhotoStore } from '@/save/photos';
import type { HudModel } from './hud/model';
import type { IconName } from './icons/names';

/**
 * Contract between the game runtime (main thread) and the interface. The UI never reaches into
 * world, render or sim state: it reads the signals in `HudModel` and the specs passed to the calls
 * below, and talks back through `GameActions` and the provider interfaces in `UiDeps`.
 */

// ── providers the main thread implements ─────────────────────────────────────

/** UI sounds; usually `audio` itself (it satisfies this shape). */
export type UiSoundSink = { ui(sound: UiSound): void };

/** Dialogue babble; usually `audio.blip`. */
export type BlipSink = (voice: VoiceProfile, emphasis?: number) => void;

/** Draws the minimap each frame into the HUD's canvas (already sized for `dpr`). */
export interface MinimapSource {
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number): void;
}

export type PhotoGrade = 'golden' | 'noir' | 'neon' | 'none';

/** Live photo-mode state the panel edits. All values are applied by the main thread immediately. */
export interface PhotoModeState {
  /** Degrees. */
  fov: number;
  dof: boolean;
  /** Metres. */
  focusDistance: number;
  /** 0 (deep focus) … 1 (very shallow). */
  aperture: number;
  /** Stops, −2 … +2. */
  exposure: number;
  /** Clock hours 0–24. */
  timeOfDay: number;
  grade: PhotoGrade;
  hideCharacters: boolean;
  watermark: boolean;
}

export interface PhotoModeControls {
  readonly state: ReadonlySignal<PhotoModeState>;
  set<K extends keyof PhotoModeState>(key: K, value: PhotoModeState[K]): void;
  /** 'camera' = the free camera has input; 'panel' = the settings panel has input. */
  readonly mode: ReadonlySignal<'camera' | 'panel'>;
  setMode(mode: 'camera' | 'panel'): void;
  /** Render the shot without UI (honouring the watermark option) and return a PNG blob. */
  capture(): Promise<Blob | null>;
  /** Leave photo mode (the UI calls this from its Exit button / Back). */
  exit(): void;
}

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface UiDeps {
  input: Input;
  settings: Settings;
  saves: SaveManager;
  actions: GameActions;
  sound?: UiSoundSink | null;
  blip?: BlipSink | null;
  /** Photo gallery storage (see `@/save/photos`). Without it the gallery shows its empty state. */
  photos?: PhotoStore | null;
  /** Write a preset's individual graphics settings (`render/quality.ts` `applyPreset`). */
  applyGraphicsPreset?: (preset: GraphicsPreset) => void;
  /**
   * Called synchronously inside the click / key handler of a user gesture on click-to-start and on
   * menu activations, so the main thread can unlock audio and request fullscreen or pointer lock.
   */
  onUserGesture?: () => void;
  /** Build identifier shown small in the main menu corner. */
  version?: string;
}

// ── front end ────────────────────────────────────────────────────────────────

/** Full-screen front-end states. `none` = gameplay (HUD visible when `hud.visible` is true). */
export type FrontendScreen = 'none' | 'clickToStart' | 'loading' | 'mainMenu' | 'newGame' | 'goodbye';

export interface TitleCardSpec {
  /** Big line, e.g. "Halcyon Bay". */
  title: string;
  /** Small line, e.g. "6:40 PM". */
  subtitle?: string;
  /** Seconds before it dismisses itself (default 2.6). */
  duration?: number;
}

// ── overlays ─────────────────────────────────────────────────────────────────

export type LayerId =
  | 'clickToStart' | 'loading' | 'mainMenu' | 'newGame' | 'goodbye' | 'titleCard'
  | 'pause' | 'settings' | 'saveLoad' | 'gallery' | 'credits' | 'confirm'
  | 'phone' | 'dialogue' | 'rankUp' | 'shiftReport' | 'busted' | 'quickWheel' | 'photoMode' | 'custom';

export type ToastKind = 'info' | 'money' | 'message' | 'event' | 'success' | 'warning' | 'danger' | 'xp';

export interface ToastSpec {
  kind?: ToastKind;
  /** Main line, e.g. "+$420 · Heat +1" or a text preview. */
  title: string;
  /** Second line. */
  body?: string;
  icon?: IconName;
  /** Money and stat deltas rendered as coloured chips after the title. */
  deltas?: ReadonlyArray<{ label: string; value: number; format?: 'money' | 'int' }>;
  /** Sender portrait for messages. */
  portrait?: Appearance;
  /** Seconds on screen (default 4.5; messages 6). */
  duration?: number;
  /** Optional single action (Undo, Open). Clickable; on a pad it is offered while the phone is closed via `uiDetails`-free glyph-less text. */
  action?: { label: string; run: () => void };
  /** Identical keys replace each other instead of stacking (e.g. "cash"). */
  key?: string;
}

export interface HintSpec {
  /** Stable id; a learned hint never shows again. */
  id: string;
  /** Ofelia's margin note. Keep it short. */
  text: string;
  /** Show this action's live glyph before the text. */
  action?: ActionId;
  /** Higher shows first when several are queued. */
  priority?: number;
  /** Seconds before it tucks itself away (it can come back later until learned). Default 14. */
  duration?: number;
}

export type Expression = 'neutral' | 'happy' | 'annoyed' | 'surprised' | 'smug' | 'worried';

export interface DialogueLine {
  speaker: string;
  /** Portrait; omitted for narration. */
  appearance?: Appearance;
  expression?: Expression;
  text: string;
  voice?: VoiceProfile;
  /** Choice chips; the dialogue resolves with the chosen index when present on the last line. */
  choices?: readonly string[];
}

export interface DialogueScript {
  lines: readonly DialogueLine[];
  /** Blocking dialogue takes input (cutscene context); non-blocking renders as subtitles. Default true. */
  blocking?: boolean;
  /** Allow Skip (default true). */
  skippable?: boolean;
}

export interface DialogueResult {
  /** Index into the last line's choices, or null when there were none or it was skipped. */
  choice: number | null;
  skipped: boolean;
}

export interface RankUpSpec {
  rank: number;
  title: string;
  /** Up to three unlock cards. */
  unlocks: ReadonlyArray<{ icon: IconName; title: string; detail: string }>;
  /** Ofelia's line in the margin. */
  note?: string;
}

export interface ShiftReportSpec {
  /** "Overnight", "While you were out"… */
  title: string;
  /** e.g. "11:40 PM → 7:10 AM". */
  span: string;
  earnings: number;
  deals: number;
  closeCalls: number;
  lines: ReadonlyArray<{ icon: IconName; text: string; amount?: number }>;
}

export interface BustedSpec {
  kind: 'busted' | 'wasted';
  /** Itemized cost lines. */
  costs: ReadonlyArray<{ label: string; amount: number }>;
  /** Sy Pinkerton's quip. */
  quip: string;
  /** Where you wake up, e.g. "Outside Pinkerton Law". */
  respawn: string;
}

export interface ConfirmSpec {
  title: string;
  body?: string;
  confirm: string;
  cancel?: string;
  /** Destructive confirms use the danger style and a hold. */
  danger?: boolean;
}

export interface QuickWheelSlot {
  id: string;
  label: string;
  icon: IconName;
  /** Greyed out with this reason when not available right now. */
  disabledReason?: string;
  run(): void;
}

// ── phone ────────────────────────────────────────────────────────────────────

export interface PhoneAppProps {
  /** Navigate inside the phone. */
  open(appId: string, params?: Record<string, unknown>): void;
  back(): void;
  close(): void;
  params: Readonly<Record<string, unknown>>;
}

export interface PhoneSearchResult {
  id: string;
  title: string;
  detail?: string;
  icon: IconName;
  appId: string;
  params?: Record<string, unknown>;
}

export interface PhoneAppDef {
  id: string;
  title: string;
  icon: IconName;
  /** Tile accent (CSS colour). */
  color: string;
  /** Lower sorts first on the home grid. */
  order: number;
  /** Pin to the bottom nav (Home is always first; at most four apps). */
  nav?: boolean;
  /** Unread / attention count. */
  badge?: ReadonlySignal<number>;
  /** Landscape apps (the map) turn the phone sideways and grow it. */
  layout?: 'portrait' | 'landscape';
  component: ComponentType<PhoneAppProps>;
  search?(query: string): PhoneSearchResult[];
}

export interface NextBestAction {
  icon: IconName;
  title: string;
  detail?: string;
  /** Label for the button, e.g. "Set route". */
  cta?: string;
  run?(): void;
}

// ── the API ──────────────────────────────────────────────────────────────────

export interface UiApi {
  readonly hud: HudModel;
  /** True while any layer that consumes input is open (menus, phone, dialogue, wheel, photo panel). */
  readonly wantsInput: ReadonlySignal<boolean>;
  /** Topmost open layer, or null during plain gameplay. */
  readonly top: ReadonlySignal<LayerId | null>;
  /** True while a modal layer that should pause the world is open (pause menu, settings over gameplay…). */
  readonly pausesWorld: ReadonlySignal<boolean>;

  // front end
  showFrontend(screen: FrontendScreen): void;
  /** 0–1 plus a short label ("Paving the Causeway…"). */
  setLoading(progress: number, label?: string): void;
  /** Resolves on the first click / key / button on click-to-start (after `onUserGesture`). */
  waitForStart(): Promise<void>;
  titleCard(spec: TitleCardSpec): Promise<void>;

  // menus and overlays
  openPause(): void;
  closePause(): void;
  openSettings(tab?: SettingCategory): void;
  openSaveLoad(mode: 'save' | 'load'): void;
  openGallery(): void;
  openCredits(): void;
  /** Close every overlay (not the HUD or front-end screen). */
  closeAll(): void;
  confirm(spec: ConfirmSpec): Promise<boolean>;

  // phone
  openPhone(appId?: string, params?: Record<string, unknown>): void;
  closePhone(): void;
  togglePhone(): void;
  registerPhoneApp(app: PhoneAppDef): () => void;
  setNextBestAction(action: ReadonlySignal<NextBestAction | null> | null): void;

  // feedback
  toast(spec: ToastSpec): void;
  hint(spec: HintSpec): void;
  /** Mark a hint learned (the player did the thing): it hides now and never returns. */
  learnHint(id: string): void;
  dialogue(script: DialogueScript): Promise<DialogueResult>;
  rankUp(spec: RankUpSpec): Promise<void>;
  shiftReport(spec: ShiftReportSpec): Promise<void>;
  /** Resolves when the player presses Retry. */
  busted(spec: BustedSpec): Promise<void>;

  // gameplay helpers
  setQuickWheel(slots: readonly QuickWheelSlot[]): void;
  openPhotoMode(controls: PhotoModeControls): void;
  closePhotoMode(): void;
  setMinimap(source: MinimapSource | null): void;
  /** Re-show the current Now Playing card (radio changed, entering a vehicle). */
  showNowPlaying(info: NowPlaying | null): void;

  /** Per-frame: navigation, typewriters, count-ups, HUD animation, minimap. `dtReal` in seconds. */
  update(dtReal: number): void;
  dispose(): void;
}
