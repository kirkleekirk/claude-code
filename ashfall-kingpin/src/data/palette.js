// Global 48-colour palette: 12 hues x 4-step ramps (dark -> light). "Dust and dusk":
// warm browns/rust with desaturated teal shadows. All generated art samples from here.

export const RAMPS = {
  ink:   ['#120f0e', '#2a2420', '#4a403a', '#6e625a'],
  bone:  ['#8c8070', '#b5a690', '#d8cab0', '#f4ead6'],
  rust:  ['#3e1a12', '#6e2c1a', '#a2472a', '#cf7444'],
  wood:  ['#34231a', '#563923', '#7d5733', '#a8804e'],
  sand:  ['#6a5434', '#957948', '#c0a064', '#e2c98f'],
  olive: ['#2f3420', '#4b5230', '#6d7344', '#959962'],
  teal:  ['#16272a', '#24403f', '#3b625c', '#62897d'],
  sea:   ['#10202e', '#1b3548', '#2e5468', '#50808f'],
  amber: ['#5c1a0e', '#9e2f15', '#dc5425', '#ff8f4a'],
  green: ['#17311c', '#275232', '#3f7f45', '#7cbf62'],
  heat:  ['#5a0e10', '#a3161b', '#e2452a', '#ffa53c'],
  gold:  ['#7a5a12', '#b8901e', '#ecc838', '#fff1a8'],
};

export const PALETTE = Object.values(RAMPS).flat();

// Semantic colours, used identically in HUD, world markers and icons.
export const SEM = {
  dirty: RAMPS.amber[3], dirtyDark: RAMPS.amber[1],
  clean: RAMPS.green[3], cleanDark: RAMPS.green[1],
  heat: [RAMPS.heat[3], RAMPS.heat[2], RAMPS.heat[1], RAMPS.heat[0]],
  enemy: RAMPS.heat[2], friendly: RAMPS.teal[3], loot: RAMPS.gold[2], lootHi: RAMPS.gold[3],
  text: RAMPS.bone[3], textDim: RAMPS.bone[1], textMute: RAMPS.ink[3],
  panel: RAMPS.ink[1], panelDark: RAMPS.ink[0], panelEdge: RAMPS.ink[3], accent: RAMPS.rust[3],
  good: RAMPS.green[3], bad: RAMPS.heat[2], warn: RAMPS.gold[2], rep: RAMPS.gold[2], outline: RAMPS.ink[0],
  neutral: RAMPS.bone[1],
};

// Colourblind-safe alternates (deuteranopia-friendly: blue/orange contrast instead of red/green).
export const SEM_CB = {
  ...SEM,
  clean: RAMPS.sea[3], cleanDark: RAMPS.sea[1], good: RAMPS.sea[3], enemy: RAMPS.amber[3], bad: RAMPS.amber[3],
  heat: [RAMPS.gold[3], RAMPS.amber[3], RAMPS.amber[2], RAMPS.amber[1]],
};

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

// Heat level colour (0..100) on the semantic heat ramp.
export function heatColor(h, sem = SEM) {
  if (h >= 80) return sem.heat[3];
  if (h >= 60) return sem.heat[2];
  if (h >= 40) return sem.heat[1];
  if (h >= 20) return sem.heat[0];
  return RAMPS.bone[1];
}
