/**
 * The action map: every input the game understands, its group, and its default bindings.
 * Gameplay code asks for actions, never for keys, so everything is rebindable and device-agnostic.
 */

/** Standard-mapping gamepad button indices. */
export const Pad = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, View: 8, Menu: 9, L3: 10, R3: 11,
  Up: 12, Down: 13, Left: 14, Right: 15,
} as const;

/** Standard-mapping axes. */
export const Axis = { LX: 0, LY: 1, RX: 2, RY: 3 } as const;

export type Source =
  | { readonly k: 'key'; readonly code: string }
  | { readonly k: 'mouse'; readonly button: number }
  | { readonly k: 'pad'; readonly button: number }
  | { readonly k: 'axis'; readonly axis: number; readonly dir: 1 | -1 };

/** `value = max(pos) − max(neg)`. Buttons only use `pos`. */
export interface Binding {
  readonly pos: readonly Source[];
  readonly neg?: readonly Source[];
}

export type ActionGroup = 'system' | 'phone' | 'foot' | 'vehicle' | 'look' | 'ui' | 'mg' | 'build' | 'photo';

export interface ActionDef {
  readonly group: ActionGroup;
  readonly kbm: Binding;
  readonly pad: Binding;
  /** Hidden from the rebinding screen (structural actions such as menu navigation). */
  readonly fixed?: boolean;
}

const key = (code: string): Source => ({ k: 'key', code });
const mouse = (button: number): Source => ({ k: 'mouse', button });
const pad = (button: number): Source => ({ k: 'pad', button });
const axis = (a: number, dir: 1 | -1): Source => ({ k: 'axis', axis: a, dir });
const btn = (...pos: Source[]): Binding => ({ pos });
const ax = (pos: Source[], neg: Source[]): Binding => ({ pos, neg });
const none: Binding = { pos: [] };

export const ACTIONS = {
  // ── system ────────────────────────────────────────────────────────────────
  pause: { group: 'system', kbm: btn(key('Escape')), pad: btn(pad(Pad.Menu)) },
  quickWheel: { group: 'system', kbm: btn(key('KeyQ')), pad: btn(pad(Pad.LB)) },
  photoMode: { group: 'system', kbm: btn(key('F2')), pad: none },
  // ── phone (opening; inside the phone the ui group's uiPhone / uiMap / uiBack take over) ──
  phone: { group: 'phone', kbm: btn(key('Tab')), pad: btn(pad(Pad.Up)) },
  map: { group: 'phone', kbm: btn(key('KeyM')), pad: btn(pad(Pad.View)) },
  // ── on foot ───────────────────────────────────────────────────────────────
  moveX: { group: 'foot', kbm: ax([key('KeyD')], [key('KeyA')]), pad: ax([axis(Axis.LX, 1)], [axis(Axis.LX, -1)]) },
  moveY: { group: 'foot', kbm: ax([key('KeyW')], [key('KeyS')]), pad: ax([axis(Axis.LY, -1)], [axis(Axis.LY, 1)]) },
  sprint: { group: 'foot', kbm: btn(key('ShiftLeft')), pad: btn(pad(Pad.L3)) },
  jump: { group: 'foot', kbm: btn(key('Space')), pad: btn(pad(Pad.A)) },
  crouch: { group: 'foot', kbm: btn(key('KeyC')), pad: btn(pad(Pad.B)) },
  interact: { group: 'foot', kbm: btn(key('KeyE')), pad: btn(pad(Pad.X)) },
  enterVehicle: { group: 'foot', kbm: btn(key('KeyF')), pad: btn(pad(Pad.Y)) },
  aim: { group: 'foot', kbm: btn(mouse(2)), pad: btn(pad(Pad.LT)) },
  fire: { group: 'foot', kbm: btn(mouse(0)), pad: btn(pad(Pad.RT)) },
  reload: { group: 'foot', kbm: btn(key('KeyR')), pad: btn(pad(Pad.RB)) },
  recenter: { group: 'foot', kbm: btn(key('KeyV')), pad: btn(pad(Pad.R3)) },
  buildMode: { group: 'foot', kbm: btn(key('KeyB')), pad: btn(pad(Pad.Down)) },
  // ── vehicle ───────────────────────────────────────────────────────────────
  throttle: { group: 'vehicle', kbm: btn(key('KeyW'), key('ArrowUp')), pad: btn(pad(Pad.RT)) },
  brake: { group: 'vehicle', kbm: btn(key('KeyS'), key('ArrowDown')), pad: btn(pad(Pad.LT)) },
  steer: {
    group: 'vehicle',
    kbm: ax([key('KeyD'), key('ArrowRight')], [key('KeyA'), key('ArrowLeft')]),
    pad: ax([axis(Axis.LX, 1)], [axis(Axis.LX, -1)]),
  },
  handbrake: { group: 'vehicle', kbm: btn(key('Space')), pad: btn(pad(Pad.A)) },
  boost: { group: 'vehicle', kbm: btn(key('ShiftLeft')), pad: btn(pad(Pad.X)) },
  horn: { group: 'vehicle', kbm: btn(key('KeyH')), pad: btn(pad(Pad.L3)) },
  exitVehicle: { group: 'vehicle', kbm: btn(key('KeyF'), key('KeyE')), pad: btn(pad(Pad.Y)) },
  radioNext: { group: 'vehicle', kbm: btn(key('Period')), pad: btn(pad(Pad.Right)) },
  radioPrev: { group: 'vehicle', kbm: btn(key('Comma')), pad: btn(pad(Pad.Left)) },
  cameraCycle: { group: 'vehicle', kbm: btn(key('KeyV')), pad: btn(pad(Pad.Down)) },
  lookBack: { group: 'vehicle', kbm: btn(key('KeyC')), pad: btn(pad(Pad.R3)) },
  vehicleSpecial: { group: 'vehicle', kbm: btn(key('KeyX')), pad: btn(pad(Pad.B)) },
  // ── camera look (gamepad stick; mouse look is read separately) ────────────
  lookX: { group: 'look', kbm: none, pad: ax([axis(Axis.RX, 1)], [axis(Axis.RX, -1)]), fixed: true },
  lookY: { group: 'look', kbm: none, pad: ax([axis(Axis.RY, 1)], [axis(Axis.RY, -1)]), fixed: true },
  // ── menus ─────────────────────────────────────────────────────────────────
  uiX: {
    group: 'ui', fixed: true,
    kbm: ax([key('ArrowRight'), key('KeyD')], [key('ArrowLeft'), key('KeyA')]),
    pad: ax([pad(Pad.Right), axis(Axis.LX, 1)], [pad(Pad.Left), axis(Axis.LX, -1)]),
  },
  uiY: {
    group: 'ui', fixed: true,
    kbm: ax([key('ArrowDown'), key('KeyS')], [key('ArrowUp'), key('KeyW')]),
    pad: ax([pad(Pad.Down), axis(Axis.LY, 1)], [pad(Pad.Up), axis(Axis.LY, -1)]),
  },
  uiConfirm: { group: 'ui', fixed: true, kbm: btn(key('Enter'), key('Space')), pad: btn(pad(Pad.A)) },
  uiBack: { group: 'ui', fixed: true, kbm: btn(key('Escape'), key('Backspace')), pad: btn(pad(Pad.B)) },
  uiTabPrev: { group: 'ui', fixed: true, kbm: btn(key('KeyQ')), pad: btn(pad(Pad.LB)) },
  uiTabNext: { group: 'ui', fixed: true, kbm: btn(key('KeyE')), pad: btn(pad(Pad.RB)) },
  uiDetails: { group: 'ui', fixed: true, kbm: btn(key('KeyI')), pad: btn(pad(Pad.Y)) },
  uiSecondary: { group: 'ui', fixed: true, kbm: btn(key('KeyR')), pad: btn(pad(Pad.X)) },
  /** Close the phone from inside it (keyboard). On a pad, Back at the phone's home closes it. */
  uiPhone: { group: 'ui', fixed: true, kbm: btn(key('Tab')), pad: none },
  uiMap: { group: 'ui', fixed: true, kbm: btn(key('KeyM')), pad: btn(pad(Pad.View)) },
  uiScroll: {
    group: 'ui', fixed: true,
    kbm: ax([key('PageDown')], [key('PageUp')]),
    pad: ax([axis(Axis.RY, 1)], [axis(Axis.RY, -1)]),
  },
  // ── mini-games (snip chain, haggle, shake) ────────────────────────────────
  mgPrimary: { group: 'mg', kbm: btn(key('KeyE'), key('Space'), key('Enter'), mouse(0)), pad: btn(pad(Pad.A), pad(Pad.X)) },
  mgSecondary: { group: 'mg', kbm: btn(key('KeyR'), mouse(2)), pad: btn(pad(Pad.Y)) },
  mgCancel: { group: 'mg', fixed: true, kbm: btn(key('Escape'), key('Backspace')), pad: btn(pad(Pad.B)) },
  mgX: {
    group: 'mg', fixed: true,
    kbm: ax([key('KeyD'), key('ArrowRight')], [key('KeyA'), key('ArrowLeft')]),
    pad: ax([axis(Axis.LX, 1), pad(Pad.Right)], [axis(Axis.LX, -1), pad(Pad.Left)]),
  },
  mgY: {
    group: 'mg', fixed: true,
    kbm: ax([key('KeyW'), key('ArrowUp')], [key('KeyS'), key('ArrowDown')]),
    pad: ax([axis(Axis.LY, -1), pad(Pad.Up)], [axis(Axis.LY, 1), pad(Pad.Down)]),
  },
  // ── build mode ────────────────────────────────────────────────────────────
  buildX: { group: 'build', fixed: true, kbm: ax([key('KeyD')], [key('KeyA')]), pad: ax([axis(Axis.LX, 1)], [axis(Axis.LX, -1)]) },
  buildY: { group: 'build', fixed: true, kbm: ax([key('KeyW')], [key('KeyS')]), pad: ax([axis(Axis.LY, -1)], [axis(Axis.LY, 1)]) },
  buildPlace: { group: 'build', kbm: btn(mouse(0), key('Enter')), pad: btn(pad(Pad.A)) },
  buildRemove: { group: 'build', kbm: btn(mouse(2), key('Delete')), pad: btn(pad(Pad.X)) },
  buildRotate: { group: 'build', kbm: btn(key('KeyR')), pad: btn(pad(Pad.Y)) },
  buildUndo: { group: 'build', kbm: btn(key('KeyZ')), pad: btn(pad(Pad.LB)) },
  buildRedo: { group: 'build', kbm: btn(key('KeyY')), pad: btn(pad(Pad.RB)) },
  buildExit: { group: 'build', fixed: true, kbm: btn(key('Escape'), key('KeyB')), pad: btn(pad(Pad.B)) },
  // ── photo mode ────────────────────────────────────────────────────────────
  photoX: { group: 'photo', fixed: true, kbm: ax([key('KeyD')], [key('KeyA')]), pad: ax([axis(Axis.LX, 1)], [axis(Axis.LX, -1)]) },
  photoY: { group: 'photo', fixed: true, kbm: ax([key('KeyW')], [key('KeyS')]), pad: ax([axis(Axis.LY, -1)], [axis(Axis.LY, 1)]) },
  photoRise: { group: 'photo', fixed: true, kbm: ax([key('KeyE')], [key('KeyQ')]), pad: ax([pad(Pad.RT)], [pad(Pad.LT)]) },
  photoCapture: { group: 'photo', kbm: btn(key('Space'), key('Enter')), pad: btn(pad(Pad.A)) },
  photoHideUi: { group: 'photo', kbm: btn(key('KeyH')), pad: btn(pad(Pad.Y)) },
  photoExit: { group: 'photo', fixed: true, kbm: btn(key('Escape'), key('F2')), pad: btn(pad(Pad.B)) },
} as const satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;
export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

/** Which action groups are live in each input context. */
export const CONTEXTS = {
  none: [],
  foot: ['system', 'phone', 'foot', 'look'],
  vehicle: ['system', 'phone', 'vehicle', 'look'],
  menu: ['ui'],
  phone: ['ui'],
  minigame: ['mg'],
  build: ['build', 'look'],
  photo: ['photo', 'look'],
  cutscene: ['ui'],
} as const satisfies Record<string, readonly ActionGroup[]>;

export type InputContext = keyof typeof CONTEXTS;

export type DeviceKind = 'kbm' | 'gamepad';
export type PadStyle = 'xbox' | 'playstation' | 'switch';

export function sourcesEqual(a: Source, b: Source): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'key':
      return a.code === (b as typeof a).code;
    case 'mouse':
    case 'pad':
      return a.button === (b as typeof a).button;
    case 'axis':
      return a.axis === (b as typeof a).axis && a.dir === (b as typeof a).dir;
  }
}
