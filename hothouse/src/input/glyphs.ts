import { Pad, type PadStyle, type Source } from './actions';

/** What the UI needs to draw a binding: a keycap, a mouse button or a pad button. */
export interface Glyph {
  readonly kind: 'key' | 'mouse' | 'pad' | 'stick';
  /** Short text for keycaps and accessibility ("E", "Space", "LT"). */
  readonly label: string;
  /** Stable id for icon lookup: `key:KeyE`, `mouse:0`, `pad:xbox:0`, `stick:L`. */
  readonly id: string;
  /** Face-button tint, when the platform has one. */
  readonly color?: string;
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: '⌫', Delete: 'Del',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', PageUp: 'PgUp', PageDown: 'PgDn',
  CapsLock: 'Caps', Home: 'Home', End: 'End', Insert: 'Ins',
};

export function keyLabel(code: string): string {
  const known = KEY_LABELS[code];
  if (known) return known;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

const MOUSE_LABELS = ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'];

type PadNames = Record<number, { label: string; color?: string }>;

const XBOX: PadNames = {
  [Pad.A]: { label: 'A', color: '#7CD64A' }, [Pad.B]: { label: 'B', color: '#FF5A4D' },
  [Pad.X]: { label: 'X', color: '#4DA3FF' }, [Pad.Y]: { label: 'Y', color: '#FFD166' },
  [Pad.LB]: { label: 'LB' }, [Pad.RB]: { label: 'RB' }, [Pad.LT]: { label: 'LT' }, [Pad.RT]: { label: 'RT' },
  [Pad.View]: { label: 'View' }, [Pad.Menu]: { label: 'Menu' }, [Pad.L3]: { label: 'L3' }, [Pad.R3]: { label: 'R3' },
  [Pad.Up]: { label: 'D↑' }, [Pad.Down]: { label: 'D↓' }, [Pad.Left]: { label: 'D←' }, [Pad.Right]: { label: 'D→' },
};

const PLAYSTATION: PadNames = {
  ...XBOX,
  [Pad.A]: { label: '✕', color: '#7FA8FF' }, [Pad.B]: { label: '○', color: '#FF6B7F' },
  [Pad.X]: { label: '□', color: '#F29BD8' }, [Pad.Y]: { label: '△', color: '#5FE0B8' },
  [Pad.LB]: { label: 'L1' }, [Pad.RB]: { label: 'R1' }, [Pad.LT]: { label: 'L2' }, [Pad.RT]: { label: 'R2' },
  [Pad.View]: { label: 'Create' }, [Pad.Menu]: { label: 'Options' },
};

const SWITCH: PadNames = {
  ...XBOX,
  [Pad.A]: { label: 'B' }, [Pad.B]: { label: 'A' }, [Pad.X]: { label: 'Y' }, [Pad.Y]: { label: 'X' },
  [Pad.LB]: { label: 'L' }, [Pad.RB]: { label: 'R' }, [Pad.LT]: { label: 'ZL' }, [Pad.RT]: { label: 'ZR' },
  [Pad.View]: { label: '−' }, [Pad.Menu]: { label: '+' },
};

const PAD_SETS: Record<PadStyle, PadNames> = { xbox: XBOX, playstation: PLAYSTATION, switch: SWITCH };

export function glyphFor(source: Source, style: PadStyle): Glyph {
  switch (source.k) {
    case 'key':
      return { kind: 'key', label: keyLabel(source.code), id: `key:${source.code}` };
    case 'mouse':
      return { kind: 'mouse', label: MOUSE_LABELS[source.button] ?? `Mouse ${source.button + 1}`, id: `mouse:${source.button}` };
    case 'pad': {
      const entry = PAD_SETS[style][source.button] ?? { label: `B${source.button}` };
      const g: Glyph = { kind: 'pad', label: entry.label, id: `pad:${style}:${source.button}` };
      return entry.color ? { ...g, color: entry.color } : g;
    }
    case 'axis': {
      const left = source.axis < 2;
      return { kind: 'stick', label: left ? 'L' : 'R', id: `stick:${left ? 'L' : 'R'}` };
    }
  }
}

/** Guess the button art from the browser's gamepad id string. */
export function padStyleFromId(id: string): PadStyle {
  const s = id.toLowerCase();
  if (s.includes('054c') || s.includes('dualsense') || s.includes('dualshock') || s.includes('playstation')) {
    return 'playstation';
  }
  if (s.includes('057e') || s.includes('nintendo') || s.includes('switch') || s.includes('joy-con')) return 'switch';
  return 'xbox';
}
