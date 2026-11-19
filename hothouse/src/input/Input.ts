import { signal } from '@preact/signals-core';
import { clamp } from '@/core/math';
import {
  ACTIONS, ACTION_IDS, CONTEXTS, sourcesEqual,
  type ActionGroup, type ActionId, type Binding, type DeviceKind, type InputContext, type PadStyle, type Source,
} from './actions';
import { glyphFor, padStyleFromId, type Glyph } from './glyphs';

interface MutableBinding {
  pos: Source[];
  neg: Source[];
}

export type BindingOverrides = Partial<Record<ActionId, Partial<Record<DeviceKind, { pos: Source[]; neg: Source[] }>>>>;

export interface LookOptions {
  mouseSensitivity: number;
  padSensitivity: number;
  invertY: boolean;
}

const N = ACTION_IDS.length;
const INDEX = Object.fromEntries(ACTION_IDS.map((id, i) => [id, i])) as Record<ActionId, number>;
const STICK_DEADZONE = 0.16;
const TRIGGER_DEADZONE = 0.04;
const PRESS = 0.5;
const REPEAT_DELAY = 0.38;
const REPEAT_RATE = 0.11;
const MOUSE_RADIANS_PER_PIXEL = 0.0022;
const PAD_LOOK_RATE = 2.9;

const cloneBinding = (b: Binding): MutableBinding => ({ pos: [...b.pos], neg: [...(b.neg ?? [])] });

function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/**
 * Device-agnostic input. Sample once per frame with `beginFrame`, read actions anywhere.
 * Gameplay running in the fixed step should use the `*Fixed` edge queries so presses are neither
 * lost nor double-counted when frames and steps do not line up.
 */
export class Input {
  /** Device that produced the most recent meaningful input; drives glyphs and cursor visibility. */
  readonly device = signal<DeviceKind>('kbm');
  readonly padStyle = signal<PadStyle>('xbox');
  readonly padConnected = signal(false);
  readonly pointerLocked = signal(false);
  readonly context = signal<InputContext>('none');
  /** Bumps whenever bindings change so glyph consumers re-render. */
  readonly bindingsVersion = signal(0);
  /** Forces a pad style regardless of the connected device (settings). */
  padStyleOverride: PadStyle | null = null;

  private readonly keys = new Set<string>();
  /** Keys and buttons that went down since the last sample: a tap shorter than a frame still counts. */
  private readonly tappedKeys = new Set<string>();
  private tappedMouse = 0;
  private mouseMask = 0;
  private readonly padButtons = new Float32Array(18);
  private readonly padAxes = new Float32Array(4);
  private readonly curr = new Float32Array(N);
  private readonly prev = new Float32Array(N);
  private readonly held = new Float32Array(N);
  private readonly pressLatch = new Uint8Array(N);
  private readonly releaseLatch = new Uint8Array(N);
  private readonly enabled = new Uint8Array(N);
  private readonly injected = new Map<number, number>();
  private readonly bindings: Record<DeviceKind, MutableBinding[]>;
  private readonly stack: InputContext[] = ['none'];
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelTicks = 0;
  private navX = 0;
  private navY = 0;
  private navHeldX = 0;
  private navHeldY = 0;
  private navTimerX = 0;
  private navTimerY = 0;
  private mouseTravel = 0;
  private captureCb: ((source: Source | null) => void) | null = null;
  private captureDevice: DeviceKind = 'kbm';
  private capturePadArmed = false;
  private target: HTMLElement | null = null;
  private readonly unlisten: Array<() => void> = [];

  constructor() {
    this.bindings = {
      kbm: ACTION_IDS.map((id) => cloneBinding(ACTIONS[id].kbm)),
      gamepad: ACTION_IDS.map((id) => cloneBinding(ACTIONS[id].pad)),
    };
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  /** Start listening. `target` receives pointer-lock requests (the game canvas). */
  attach(target: HTMLElement): void {
    this.target = target;
    const on = <K extends keyof WindowEventMap>(
      el: Window | Document | HTMLElement, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type as string, fn as EventListener, opts);
      this.unlisten.push(() => el.removeEventListener(type as string, fn as EventListener, opts));
    };
    on(window, 'keydown', this.onKeyDown);
    on(window, 'keyup', this.onKeyUp);
    on(window, 'blur', this.releaseAll);
    on(document, 'visibilitychange', () => document.hidden && this.releaseAll());
    on(window, 'mousedown', this.onMouseDown);
    on(window, 'mouseup', this.onMouseUp);
    on(window, 'mousemove', this.onMouseMove);
    on(window, 'wheel', this.onWheel, { passive: true });
    on(target, 'contextmenu', (e: Event) => e.preventDefault());
    on(document, 'pointerlockchange', () => {
      this.pointerLocked.value = document.pointerLockElement === this.target;
    });
    on(window, 'gamepadconnected', () => this.pollPad());
    on(window, 'gamepaddisconnected', () => this.pollPad());
  }

  detach(): void {
    for (const off of this.unlisten) off();
    this.unlisten.length = 0;
    this.releaseAll();
  }

  /** Sample devices and compute this frame's values and edges. Call first thing every frame. */
  beginFrame(dtReal: number): void {
    this.pollPad();
    this.prev.set(this.curr);
    const dev = this.device.value;
    for (let i = 0; i < N; i++) {
      let v = 0;
      if (this.enabled[i]) {
        const k = this.evaluate(this.bindings.kbm[i]!);
        const p = this.evaluate(this.bindings.gamepad[i]!);
        v = Math.abs(p) > Math.abs(k) ? p : k;
        const inj = this.injected.get(i);
        if (inj !== undefined) v = inj;
      }
      this.curr[i] = v;
      const isDown = Math.abs(v) > PRESS;
      const wasDown = Math.abs(this.prev[i]!) > PRESS;
      if (isDown && !wasDown) this.pressLatch[i] = 1;
      if (!isDown && wasDown) this.releaseLatch[i] = 1;
      this.held[i] = isDown ? this.held[i]! + dtReal : 0;
    }
    this.tappedKeys.clear();
    this.tappedMouse = 0;
    this.updateNav(dtReal);
    if (dev === 'kbm' && this.padActive()) this.device.value = 'gamepad';
  }

  /** Clear fixed-step edge latches. Call after every fixed step. */
  endFixedStep(): void {
    this.pressLatch.fill(0);
    this.releaseLatch.fill(0);
  }

  /** Clear per-frame accumulators. Call last thing every frame. */
  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelTicks = 0;
  }

  // ── queries ────────────────────────────────────────────────────────────────

  /** Analog value: buttons 0…1, axes −1…1. */
  value(action: ActionId): number {
    return this.curr[INDEX[action]]!;
  }

  down(action: ActionId): boolean {
    return Math.abs(this.curr[INDEX[action]]!) > PRESS;
  }

  /** True on the frame the action went down. */
  pressed(action: ActionId): boolean {
    const i = INDEX[action];
    return Math.abs(this.curr[i]!) > PRESS && Math.abs(this.prev[i]!) <= PRESS;
  }

  released(action: ActionId): boolean {
    const i = INDEX[action];
    return Math.abs(this.curr[i]!) <= PRESS && Math.abs(this.prev[i]!) > PRESS;
  }

  /** Press edge that survives until the next fixed step consumes it. */
  pressedFixed(action: ActionId): boolean {
    return this.pressLatch[INDEX[action]] === 1;
  }

  releasedFixed(action: ActionId): boolean {
    return this.releaseLatch[INDEX[action]] === 1;
  }

  /** Seconds the action has been held (0 when up). */
  heldFor(action: ActionId): number {
    return this.held[INDEX[action]]!;
  }

  /** Menu navigation with key-repeat: each component is −1, 0 or 1 on frames where a move fires. */
  nav(): { readonly x: number; readonly y: number } {
    return NAV.set(this.navX, this.navY);
  }

  /** Camera look delta in radians for this frame (mouse while pointer-locked, plus right stick). */
  look(out: { x: number; y: number }, dtReal: number, opts: LookOptions): void {
    let x = 0;
    let y = 0;
    if (this.pointerLocked.value) {
      x += this.mouseDX * MOUSE_RADIANS_PER_PIXEL * opts.mouseSensitivity;
      y += this.mouseDY * MOUSE_RADIANS_PER_PIXEL * opts.mouseSensitivity;
    }
    const sx = this.curr[INDEX.lookX]!;
    const sy = this.curr[INDEX.lookY]!;
    // Response curve: precise near centre, fast at the rim.
    x += Math.sign(sx) * Math.abs(sx) ** 1.7 * PAD_LOOK_RATE * opts.padSensitivity * dtReal;
    y += Math.sign(sy) * Math.abs(sy) ** 1.7 * PAD_LOOK_RATE * 0.7 * opts.padSensitivity * dtReal;
    out.x = x;
    out.y = opts.invertY ? -y : y;
  }

  /** Raw mouse movement this frame in pixels (photo mode, build cursor). */
  mouseDelta(out: { x: number; y: number }): void {
    out.x = this.mouseDX;
    out.y = this.mouseDY;
  }

  /** Wheel notches this frame; positive scrolls down / zooms out. */
  wheel(): number {
    return this.wheelTicks;
  }

  // ── contexts ───────────────────────────────────────────────────────────────

  /** Push an input context; the returned function pops it (safe to call out of order). */
  pushContext(ctx: InputContext): () => void {
    this.stack.push(ctx);
    this.applyContext();
    let popped = false;
    return () => {
      if (popped) return;
      popped = true;
      const i = this.stack.lastIndexOf(ctx);
      if (i > 0) this.stack.splice(i, 1);
      this.applyContext();
    };
  }

  /** Replace the base context (below anything pushed). */
  setBaseContext(ctx: InputContext): void {
    this.stack[0] = ctx;
    this.applyContext();
  }

  // ── simulated input (tests, bots, tutorials) ───────────────────────────────

  /** Force an action's value until cleared with `null`. */
  inject(action: ActionId, value: number | null): void {
    if (value === null) this.injected.delete(INDEX[action]);
    else this.injected.set(INDEX[action], clamp(value, -1, 1));
  }

  clearInjected(): void {
    this.injected.clear();
  }

  // ── glyphs and rebinding ───────────────────────────────────────────────────

  /** The primary glyph for an action on the active device (falls back to the other device). */
  glyph(action: ActionId): Glyph | null {
    const list = this.glyphs(action);
    return list[0] ?? null;
  }

  /** All glyphs for an action on the active device: positive sources, then negative ones. */
  glyphs(action: ActionId, device: DeviceKind = this.device.value): Glyph[] {
    const style = this.padStyleOverride ?? this.padStyle.value;
    const b = this.bindings[device][INDEX[action]]!;
    const sources = [...b.neg, ...b.pos];
    if (sources.length === 0 && device === 'gamepad') return this.glyphs(action, 'kbm');
    // Collapse stick half-axes into a single stick glyph.
    const out: Glyph[] = [];
    for (const s of sources) {
      const g = glyphFor(s, style);
      if (!out.some((o) => o.id === g.id)) out.push(g);
    }
    return out;
  }

  /** Listen for the next key / button on `device` and report it (null = cancelled with Esc). */
  capture(device: DeviceKind, done: (source: Source | null) => void): void {
    this.captureCb = done;
    this.captureDevice = device;
    this.capturePadArmed = false;
  }

  cancelCapture(): void {
    const cb = this.captureCb;
    this.captureCb = null;
    cb?.(null);
  }

  /** Actions that share `source` with `action` in a context where both are live. */
  conflicts(action: ActionId, device: DeviceKind, source: Source): ActionId[] {
    const groups = groupsLiveWith(ACTIONS[action].group);
    const out: ActionId[] = [];
    for (const other of ACTION_IDS) {
      if (other === action || !groups.has(ACTIONS[other].group)) continue;
      const b = this.bindings[device][INDEX[other]]!;
      if (b.pos.some((s) => sourcesEqual(s, source)) || b.neg.some((s) => sourcesEqual(s, source))) out.push(other);
    }
    return out;
  }

  /** Replace one binding slot. `slot` picks the positive or negative side; `index` the alternative. */
  rebind(action: ActionId, device: DeviceKind, slot: 'pos' | 'neg', index: number, source: Source | null): void {
    const list = this.bindings[device][INDEX[action]]![slot];
    if (source === null) list.splice(index, 1);
    else list[index] = source;
    this.bindingsVersion.value++;
  }

  resetBindings(action?: ActionId): void {
    for (const id of action ? [action] : ACTION_IDS) {
      this.bindings.kbm[INDEX[id]] = cloneBinding(ACTIONS[id].kbm);
      this.bindings.gamepad[INDEX[id]] = cloneBinding(ACTIONS[id].pad);
    }
    this.bindingsVersion.value++;
  }

  /** Only bindings that differ from defaults, for persistence. */
  exportBindings(): BindingOverrides {
    const out: BindingOverrides = {};
    for (const id of ACTION_IDS) {
      for (const device of ['kbm', 'gamepad'] as const) {
        const cur = this.bindings[device][INDEX[id]]!;
        const def = cloneBinding(device === 'kbm' ? ACTIONS[id].kbm : ACTIONS[id].pad);
        if (JSON.stringify(cur) !== JSON.stringify(def)) {
          (out[id] ??= {})[device] = { pos: [...cur.pos], neg: [...cur.neg] };
        }
      }
    }
    return out;
  }

  importBindings(overrides: BindingOverrides | null | undefined): void {
    this.resetBindings();
    if (!overrides) return;
    for (const id of ACTION_IDS) {
      const o = overrides[id];
      if (!o) continue;
      for (const device of ['kbm', 'gamepad'] as const) {
        const b = o[device];
        if (b && Array.isArray(b.pos) && Array.isArray(b.neg)) {
          this.bindings[device][INDEX[id]] = { pos: [...b.pos], neg: [...b.neg] };
        }
      }
    }
    this.bindingsVersion.value++;
  }

  // ── device services ────────────────────────────────────────────────────────

  rumble(strong: number, weak: number, ms: number): void {
    const pad = this.activePad();
    const act = pad?.vibrationActuator as
      | { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> }
      | undefined;
    act?.playEffect?.('dual-rumble', {
      duration: ms, startDelay: 0, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1),
    })?.catch(() => undefined);
  }

  /** Ask for mouse capture. Must be called from a user gesture; failures are silent by design. */
  requestPointerLock(): void {
    const el = this.target;
    if (!el || document.pointerLockElement === el) return;
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      // Browsers throw if called outside a gesture or during the post-Esc cooldown; play continues without capture.
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Drop every held key and button (window blur, tab hide, context switch). */
  readonly releaseAll = (): void => {
    this.keys.clear();
    this.tappedKeys.clear();
    this.tappedMouse = 0;
    this.mouseMask = 0;
    this.padButtons.fill(0);
    this.padAxes.fill(0);
  };

  // ── internals ──────────────────────────────────────────────────────────────

  private applyContext(): void {
    const ctx = this.stack[this.stack.length - 1]!;
    const groups = new Set<ActionGroup>(CONTEXTS[ctx]);
    for (let i = 0; i < N; i++) this.enabled[i] = groups.has(ACTIONS[ACTION_IDS[i]!].group) ? 1 : 0;
    if (this.context.value !== ctx) this.context.value = ctx;
  }

  private evaluate(b: MutableBinding): number {
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < b.pos.length; i++) pos = Math.max(pos, this.read(b.pos[i]!));
    for (let i = 0; i < b.neg.length; i++) neg = Math.max(neg, this.read(b.neg[i]!));
    return pos - neg;
  }

  private read(s: Source): number {
    switch (s.k) {
      case 'key':
        return this.keys.has(s.code) || this.tappedKeys.has(s.code) ? 1 : 0;
      case 'mouse':
        return (this.mouseMask | this.tappedMouse) & (1 << s.button) ? 1 : 0;
      case 'pad':
        return this.padButtons[s.button] ?? 0;
      case 'axis':
        return Math.max(0, (this.padAxes[s.axis] ?? 0) * s.dir);
    }
  }

  private updateNav(dt: number): void {
    const step = (value: number, heldDir: number, timer: number): [fire: number, held: number, timer: number] => {
      const dir = value > PRESS ? 1 : value < -PRESS ? -1 : 0;
      if (dir === 0) return [0, 0, 0];
      if (dir !== heldDir) return [dir, dir, REPEAT_DELAY];
      const t = timer - dt;
      return t <= 0 ? [dir, dir, REPEAT_RATE] : [0, dir, t];
    };
    [this.navX, this.navHeldX, this.navTimerX] = step(this.curr[INDEX.uiX]!, this.navHeldX, this.navTimerX);
    [this.navY, this.navHeldY, this.navTimerY] = step(this.curr[INDEX.uiY]!, this.navHeldY, this.navTimerY);
  }

  private activePad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  private pollPad(): void {
    const pad = this.activePad();
    if (this.padConnected.value !== !!pad) this.padConnected.value = !!pad;
    if (!pad) {
      this.padButtons.fill(0);
      this.padAxes.fill(0);
      return;
    }
    const style = padStyleFromId(pad.id);
    if (this.padStyle.value !== style) this.padStyle.value = style;
    const nb = Math.min(pad.buttons.length, this.padButtons.length);
    for (let i = 0; i < nb; i++) {
      const b = pad.buttons[i]!;
      const v = b.value || (b.pressed ? 1 : 0);
      this.padButtons[i] = v > TRIGGER_DEADZONE ? v : 0;
    }
    // Radial deadzone per stick, rescaled so motion starts at zero.
    for (let s = 0; s < 2; s++) {
      const x = pad.axes[s * 2] ?? 0;
      const y = pad.axes[s * 2 + 1] ?? 0;
      const m = Math.hypot(x, y);
      if (m < STICK_DEADZONE) {
        this.padAxes[s * 2] = 0;
        this.padAxes[s * 2 + 1] = 0;
      } else {
        const k = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
        this.padAxes[s * 2] = x * k;
        this.padAxes[s * 2 + 1] = y * k;
      }
    }
    if (this.captureCb && this.captureDevice === 'gamepad') this.capturePad();
  }

  private padActive(): boolean {
    for (let i = 0; i < this.padButtons.length; i++) if (this.padButtons[i]! > PRESS) return true;
    for (let i = 0; i < 4; i++) if (Math.abs(this.padAxes[i]!) > PRESS) return true;
    return false;
  }

  private capturePad(): void {
    // Wait for a neutral pad first so the press that opened the dialog is not captured.
    if (!this.capturePadArmed) {
      this.capturePadArmed = !this.padActive();
      return;
    }
    for (let i = 0; i < this.padButtons.length; i++) {
      if (this.padButtons[i]! > PRESS) return this.finishCapture({ k: 'pad', button: i });
    }
    for (let a = 0; a < 4; a++) {
      const v = this.padAxes[a]!;
      if (Math.abs(v) > 0.7) return this.finishCapture({ k: 'axis', axis: a, dir: v > 0 ? 1 : -1 });
    }
  }

  private finishCapture(source: Source | null): void {
    const cb = this.captureCb;
    this.captureCb = null;
    cb?.(source);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTextTarget(e.target)) return;
    if (this.captureCb && this.captureDevice === 'kbm') {
      e.preventDefault();
      this.finishCapture(e.code === 'Escape' ? null : { k: 'key', code: e.code });
      return;
    }
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F2' || e.code === 'Backspace') {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    this.tappedKeys.add(e.code);
    if (this.device.value !== 'kbm') this.device.value = 'kbm';
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (this.captureCb && this.captureDevice === 'kbm') {
      e.preventDefault();
      this.finishCapture({ k: 'mouse', button: e.button });
      return;
    }
    // Clicks on UI controls are theirs alone; only the game surface feeds gameplay buttons.
    if (e.target === this.target || this.pointerLocked.value) {
      this.mouseMask |= 1 << e.button;
      this.tappedMouse |= 1 << e.button;
    }
    if (this.device.value !== 'kbm') this.device.value = 'kbm';
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.mouseMask &= ~(1 << e.button);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
    if (this.device.value !== 'kbm') {
      this.mouseTravel += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (this.mouseTravel > 24) {
        this.mouseTravel = 0;
        this.device.value = 'kbm';
      }
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    this.wheelTicks += Math.sign(e.deltaY);
  };
}

const NAV = {
  x: 0,
  y: 0,
  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  },
};

/** Groups that can be live at the same time as `group` in at least one context. */
function groupsLiveWith(group: ActionGroup): Set<ActionGroup> {
  const out = new Set<ActionGroup>();
  for (const groups of Object.values(CONTEXTS) as ReadonlyArray<readonly ActionGroup[]>) {
    if (groups.includes(group)) for (const g of groups) out.add(g);
  }
  return out;
}
