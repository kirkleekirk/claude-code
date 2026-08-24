/* =========================================================================
   MEATLIGHT :: 40-level.js
   VOSK & SONS RENDERING CO. -- PLANT 2, BELL COUNTY
   Single storey. All measurements in metres. Origin is the south-west
   corner of the office block; +X runs east, +Z runs north, +Y is up.

                z=42  +----------+
                      |   COLD   |
                      |  STORAGE |
                z=34  +----------+--------------+---------------+
                      |                         |    COOKER     |
                      |   KILL FLOOR / LINE 3   |    HOUSE      |
                z=30  |                         +---------------+
                      |                         |               |
                z=20  +--------+-----+----------+---------------+
                      | RENDER |CORR |  UTILITY / PUMP HOUSE    |
                      |  PIT   |  B  |                          | INTAKE
                z=9   +--------+-----+--------------------------+  BAY
                      |        CORRIDOR A                       |
                z=6   +-------+--------+-------+----------------+
                      |  SEC  | BREAK  |LOCKER | FRONT OFFICE   |
                z=0   +-------+--------+-------+----------------+
                     x=0                                      x=30      x=42
   ========================================================================= */

var ROOMS = {
  SEC:  { name: 'SECURITY OFFICE', x0: 0,  x1: 7,  z0: 0,  z1: 6,  h: 3.0 },
  BRK:  { name: 'BREAK ROOM',      x0: 7,  x1: 15, z0: 0,  z1: 6,  h: 3.0 },
  LOK:  { name: 'LOCKER ROOM',     x0: 15, x1: 22, z0: 0,  z1: 6,  h: 3.0 },
  OFF:  { name: 'FRONT OFFICE',    x0: 22, x1: 30, z0: 0,  z1: 6,  h: 3.0 },
  CORA: { name: 'CORRIDOR A',      x0: 0,  x1: 30, z0: 6,  z1: 9,  h: 3.2 },
  REN:  { name: 'RENDER PIT',      x0: 0,  x1: 12, z0: 9,  z1: 20, h: 5.0 },
  CORB: { name: 'CORRIDOR B',      x0: 12, x1: 15, z0: 9,  z1: 20, h: 3.2 },
  UTL:  { name: 'PUMP HOUSE',      x0: 15, x1: 30, z0: 9,  z1: 20, h: 4.0 },
  INT:  { name: 'INTAKE BAY 2',    x0: 30, x1: 42, z0: 6,  z1: 20, h: 6.0 },
  KIL:  { name: 'KILL FLOOR',      x0: 0,  x1: 20, z0: 20, z1: 34, h: 7.0 },
  COO:  { name: 'COOKER HOUSE',    x0: 20, x1: 34, z0: 20, z1: 30, h: 7.0 },
  CLD:  { name: 'COLD STORAGE',    x0: 0,  x1: 10, z0: 34, z1: 42, h: 4.5 }
};

/* materials + baked ambient, applied when each room's mesh is built */
var ROOM_STYLE = {
  SEC:  { floor: 'CARPET',       wall: 'PANEL',      ceil: 'CEIL_TILE', amb: [0.207, 0.223, 0.270] },
  BRK:  { floor: 'TILE',         wall: 'PANEL',      ceil: 'CEIL_TILE', amb: [0.207, 0.223, 0.239] },
  LOK:  { floor: 'CONCRETE',     wall: 'CINDER',     ceil: 'CEIL_TILE', amb: [0.175, 0.191, 0.207] },
  OFF:  { floor: 'CARPET',       wall: 'PANEL',      ceil: 'CEIL_TILE', amb: [0.191, 0.191, 0.223] },
  CORA: { floor: 'CONCRETE',     wall: 'CINDER',     ceil: 'CEIL_TILE', amb: [0.160, 0.175, 0.191] },
  REN:  { floor: 'CONCRETE_WET', wall: 'CINDER',     ceil: 'CEIL_DECK', amb: [0.099, 0.099, 0.110] },
  CORB: { floor: 'CONCRETE',     wall: 'CINDER',     ceil: 'CEIL_DECK', amb: [0.099, 0.110, 0.121] },
  UTL:  { floor: 'CONCRETE',     wall: 'CINDER',     ceil: 'CEIL_DECK', amb: [0.099, 0.110, 0.110] },
  INT:  { floor: 'CONCRETE',     wall: 'PANEL_RUST', ceil: 'CEIL_DECK', amb: [0.088, 0.099, 0.121] },
  KIL:  { floor: 'CONCRETE_WET', wall: 'TILE_BLOOD', ceil: 'CEIL_DECK', amb: [0.110, 0.099, 0.099] },
  COO:  { floor: 'CONCRETE_WET', wall: 'CINDER',     ceil: 'CEIL_DECK', amb: [0.121, 0.099, 0.088] },
  CLD:  { floor: 'CONCRETE',     wall: 'TILE',       ceil: 'CEIL_DECK', amb: [0.132, 0.154, 0.186] }
};

/* -------------------------------------------------------------- doorways --
   The single source of truth. Both rooms on a boundary read the same entry,
   so an opening can never exist on one face of a wall and not the other.
   axis 'z' -> wall lies at constant z, span measured along x (and vice versa).
   'OUT' means the far side is outdoors.                                    */
var DOORS = [
  { id: 'D_FRONT', a: 'CORA', b: 'OUT',  axis: 'x', at: 0,  s0: 6.8,  s1: 8.0,  h: 2.30, kind: 'door',   locked: true,  open: false },
  { id: 'D_SEC',   a: 'SEC',  b: 'CORA', axis: 'z', at: 6,  s0: 2.3,  s1: 3.7,  h: 2.15, kind: 'door',   locked: false, open: false },
  { id: 'D_BRK',   a: 'BRK',  b: 'CORA', axis: 'z', at: 6,  s0: 9.6,  s1: 10.7, h: 2.15, kind: 'door',   locked: false, open: true  },
  { id: 'D_LOK',   a: 'LOK',  b: 'CORA', axis: 'z', at: 6,  s0: 17.4, s1: 18.5, h: 2.15, kind: 'door',   locked: false, open: false },
  { id: 'D_OFF',   a: 'OFF',  b: 'CORA', axis: 'z', at: 6,  s0: 25.2, s1: 26.3, h: 2.15, kind: 'wood',   locked: true,  open: false },
  { id: 'D_REN',   a: 'CORA', b: 'REN',  axis: 'z', at: 9,  s0: 4.2,  s1: 5.6,  h: 2.30, kind: 'door',   locked: false, open: false },
  { id: 'D_CORB',  a: 'CORA', b: 'CORB', axis: 'z', at: 9,  s0: 12.4, s1: 14.6, h: 2.60, kind: 'open',   locked: false, open: true  },
  { id: 'D_UTL',   a: 'CORA', b: 'UTL',  axis: 'z', at: 9,  s0: 21.0, s1: 22.4, h: 2.30, kind: 'door',   locked: false, open: false },
  { id: 'D_INT',   a: 'CORA', b: 'INT',  axis: 'x', at: 30, s0: 6.6,  s1: 8.2,  h: 2.40, kind: 'door',   locked: false, open: false },
  { id: 'D_RENB',  a: 'REN',  b: 'CORB', axis: 'x', at: 12, s0: 13.0, s1: 14.4, h: 2.30, kind: 'door',   locked: false, open: false },
  { id: 'D_UTLB',  a: 'CORB', b: 'UTL',  axis: 'x', at: 15, s0: 11.0, s1: 12.4, h: 2.30, kind: 'door',   locked: false, open: false },
  { id: 'D_UTLI',  a: 'UTL',  b: 'INT',  axis: 'x', at: 30, s0: 14.0, s1: 16.0, h: 3.00, kind: 'open',   locked: false, open: true  },
  { id: 'D_KILB',  a: 'CORB', b: 'KIL',  axis: 'z', at: 20, s0: 12.4, s1: 14.6, h: 2.80, kind: 'open',   locked: false, open: true  },
  { id: 'D_RENK',  a: 'REN',  b: 'KIL',  axis: 'z', at: 20, s0: 5.0,  s1: 7.0,  h: 3.00, kind: 'open',   locked: false, open: true  },
  { id: 'D_UTLK',  a: 'UTL',  b: 'KIL',  axis: 'z', at: 20, s0: 16.2, s1: 18.8, h: 2.80, kind: 'door',   locked: false, open: false },
  { id: 'D_UTLC',  a: 'UTL',  b: 'COO',  axis: 'z', at: 20, s0: 24.0, s1: 26.4, h: 3.00, kind: 'open',   locked: false, open: true  },
  { id: 'D_KILC',  a: 'KIL',  b: 'COO',  axis: 'x', at: 20, s0: 24.0, s1: 27.0, h: 3.20, kind: 'open',   locked: false, open: true  },
  { id: 'D_CLD',   a: 'KIL',  b: 'CLD',  axis: 'z', at: 34, s0: 3.0,  s1: 4.6,  h: 2.40, kind: 'door',   locked: false, open: false },
  { id: 'D_DOCK',  a: 'INT',  b: 'COO',  axis: 'z', at: 20, s0: 30.6, s1: 33.4, h: 3.60, kind: 'rollup', locked: true,  open: false },
  { id: 'D_BAY',   a: 'INT',  b: 'OUT',  axis: 'x', at: 42, s0: 11.0, s1: 15.0, h: 4.20, kind: 'rollup', locked: true,  open: false }
];

var DOOR_BY_ID = {};
for (var _di = 0; _di < DOORS.length; _di++) DOOR_BY_ID[DOORS[_di].id] = DOORS[_di];

/* ----------------------------------------------------------------- props --
   t: prop type, x/z: centre in plan, yaw: radians (solid props: 90deg steps)  */
var PROPS = [
  /* -- SECURITY OFFICE ------------------------------------------------- */
  { room: 'SEC', t: 'console', x: 1.00, z: 3.00, yaw: Math.PI / 2 },
  { room: 'SEC', t: 'chair',   x: 2.40, z: 3.00, yaw: -Math.PI / 2 },
  { room: 'SEC', t: 'desk',    x: 5.40, z: 1.20, yaw: 0 },
  { room: 'SEC', t: 'filecab', x: 6.60, z: 0.50, yaw: 0 },
  { room: 'SEC', t: 'trash',   x: 6.50, z: 5.20, yaw: 0 },
  { room: 'SEC', t: 'lamp',    x: 3.50, z: 3.00, yaw: 0, y: 2.72, light: [0.62, 0.66, 0.72, 9.5, 2.0] },
  { room: 'SEC', t: 'lamp',    x: 5.00, z: 5.00, yaw: 0, y: 2.72, light: [0.55, 0.58, 0.64, 8.0, 1.5] },

  /* -- BREAK ROOM ------------------------------------------------------ */
  { room: 'BRK', t: 'table',   x: 9.50,  z: 2.20, yaw: 0 },
  { room: 'BRK', t: 'stool',   x: 8.40,  z: 2.20, yaw: 0 },
  { room: 'BRK', t: 'stool',   x: 10.60, z: 2.20, yaw: 0 },
  { room: 'BRK', t: 'stool',   x: 9.50,  z: 1.20, yaw: 0 },
  { room: 'BRK', t: 'table',   x: 13.00, z: 2.20, yaw: 0 },
  { room: 'BRK', t: 'stool',   x: 11.90, z: 2.20, yaw: 0 },
  { room: 'BRK', t: 'stool',   x: 14.10, z: 2.20, yaw: 0 },
  { room: 'BRK', t: 'vending', x: 8.00,  z: 5.50, yaw: Math.PI },
  { room: 'BRK', t: 'sink',    x: 12.60, z: 5.60, yaw: Math.PI },
  { room: 'BRK', t: 'fridge',  x: 14.40, z: 5.50, yaw: Math.PI },
  { room: 'BRK', t: 'trash',   x: 7.50,  z: 3.60, yaw: 0 },
  { room: 'BRK', t: 'lamp',    x: 11.00, z: 3.00, yaw: 0, y: 2.72, light: [0.60, 0.64, 0.60, 9.5, 1.9] },
  { room: 'BRK', t: 'lamp',    x: 13.60, z: 4.60, yaw: 0, y: 2.72, light: [0.52, 0.56, 0.52, 7.5, 1.3] },

  /* -- LOCKER ROOM ----------------------------------------------------- */
  { room: 'LOK', t: 'lockers', x: 16.60, z: 0.35, yaw: 0 },
  { room: 'LOK', t: 'lockers', x: 19.80, z: 0.35, yaw: 0 },
  { room: 'LOK', t: 'lockers', x: 15.30, z: 3.00, yaw: Math.PI / 2 },
  { room: 'LOK', t: 'bench',   x: 17.40, z: 1.60, yaw: 0 },
  { room: 'LOK', t: 'bench',   x: 20.20, z: 1.60, yaw: 0 },
  { room: 'LOK', t: 'sink',    x: 21.30, z: 4.60, yaw: -Math.PI / 2 },
  { room: 'LOK', t: 'mopbucket', x: 16.00, z: 5.40, yaw: 0 },
  { room: 'LOK', t: 'lamp',    x: 18.50, z: 3.00, yaw: 0, y: 2.72, light: [0.50, 0.54, 0.50, 9.5, 1.8] },

  /* -- FRONT OFFICE ---------------------------------------------------- */
  { room: 'OFF', t: 'desk',    x: 26.00, z: 2.00, yaw: 0 },
  { room: 'OFF', t: 'chair',   x: 26.00, z: 1.00, yaw: 0 },
  { room: 'OFF', t: 'chair',   x: 25.00, z: 3.20, yaw: Math.PI },
  { room: 'OFF', t: 'chair',   x: 27.00, z: 3.20, yaw: Math.PI },
  { room: 'OFF', t: 'filecab', x: 22.40, z: 0.50, yaw: 0 },
  { room: 'OFF', t: 'filecab', x: 22.40, z: 1.45, yaw: 0 },
  { room: 'OFF', t: 'shelf',   x: 29.30, z: 2.00, yaw: -Math.PI / 2 },
  { room: 'OFF', t: 'trash',   x: 24.00, z: 1.00, yaw: 0 },
  { room: 'OFF', t: 'lamp',    x: 26.00, z: 3.00, yaw: 0, y: 2.72, light: [0.58, 0.58, 0.62, 9.5, 1.9] },

  /* -- CORRIDOR A ------------------------------------------------------ */
  { room: 'CORA', t: 'trash',  x: 1.50,  z: 8.60, yaw: 0 },
  { room: 'CORA', t: 'crate',  x: 8.00,  z: 8.40, yaw: 0 },
  { room: 'CORA', t: 'pallet', x: 19.50, z: 8.40, yaw: 0 },
  { room: 'CORA', t: 'lamp',   x: 3.00,  z: 7.50, yaw: 0, y: 2.95, light: [0.46, 0.50, 0.52, 8.5, 1.5] },
  { room: 'CORA', t: 'lamp',   x: 10.00, z: 7.50, yaw: 0, y: 2.95, light: [0.46, 0.50, 0.52, 8.5, 1.5] },
  { room: 'CORA', t: 'lamp',   x: 17.00, z: 7.50, yaw: 0, y: 2.95, light: [0.46, 0.50, 0.52, 8.5, 1.5], flicker: true },
  { room: 'CORA', t: 'lamp',   x: 24.00, z: 7.50, yaw: 0, y: 2.95, light: [0.46, 0.50, 0.52, 8.5, 1.5] },
  { room: 'CORA', t: 'lamp',   x: 29.00, z: 7.50, yaw: 0, y: 2.95, light: [0.44, 0.48, 0.50, 7.5, 1.3] },

  /* -- RENDER PIT ------------------------------------------------------ */
  { room: 'REN', t: 'tank',    x: 2.00,  z: 11.50, yaw: 0 },
  { room: 'REN', t: 'tank',    x: 2.00,  z: 13.60, yaw: 0 },
  { room: 'REN', t: 'tank',    x: 2.00,  z: 15.70, yaw: 0 },
  { room: 'REN', t: 'pump',    x: 2.20,  z: 18.00, yaw: 0 },
  { room: 'REN', t: 'grinder', x: 8.50,  z: 11.50, yaw: 0 },
  { room: 'REN', t: 'bin',     x: 10.30, z: 14.00, yaw: 0, full: true },
  { room: 'REN', t: 'barrel',  x: 10.80, z: 10.50, yaw: 0 },
  { room: 'REN', t: 'barrel',  x: 11.20, z: 11.40, yaw: 0 },
  { room: 'REN', t: 'pillar',  x: 6.00,  z: 16.00, yaw: 0, h: 5.0 },
  { room: 'REN', t: 'drainplate', x: 6.00, z: 12.00, yaw: 0 },
  { room: 'REN', t: 'bloodpool',  x: 8.50, z: 13.20, yaw: 0, r: 1.1 },
  { room: 'REN', t: 'pipes',   x: 6.00,  z: 19.60, yaw: 0, w: 11.0, y: 4.3 },
  { room: 'REN', t: 'lamp',    x: 3.00,  z: 12.00, yaw: 0, y: 4.70, light: [0.44, 0.44, 0.42, 13.0, 1.9] },
  { room: 'REN', t: 'lamp',    x: 3.00,  z: 17.00, yaw: 0, y: 4.70, light: [0.44, 0.44, 0.42, 13.0, 1.9] },
  { room: 'REN', t: 'lamp',    x: 9.00,  z: 12.00, yaw: 0, y: 4.70, light: [0.44, 0.44, 0.42, 13.0, 1.9] },
  { room: 'REN', t: 'lamp',    x: 9.00,  z: 17.00, yaw: 0, y: 4.70, light: [0.44, 0.44, 0.42, 13.0, 1.9], flicker: true },

  /* -- CORRIDOR B ------------------------------------------------------ */
  { room: 'CORB', t: 'pipes',  x: 13.50, z: 14.50, yaw: Math.PI / 2, w: 10.0, y: 2.85 },
  { room: 'CORB', t: 'lamp',   x: 13.50, z: 11.00, yaw: 0, y: 2.95, light: [0.44, 0.48, 0.48, 8.0, 1.5] },
  { room: 'CORB', t: 'lamp',   x: 13.50, z: 15.00, yaw: 0, y: 2.95, light: [0.44, 0.48, 0.48, 8.0, 1.5] },
  { room: 'CORB', t: 'lamp',   x: 13.50, z: 18.50, yaw: 0, y: 2.95, light: [0.44, 0.48, 0.48, 8.0, 1.5] },

  /* -- PUMP HOUSE ------------------------------------------------------ */
  { room: 'UTL', t: 'pump',    x: 17.00, z: 10.50, yaw: 0 },
  { room: 'UTL', t: 'pump',    x: 19.00, z: 10.50, yaw: 0 },
  { room: 'UTL', t: 'tank',    x: 16.50, z: 14.00, yaw: 0 },
  { room: 'UTL', t: 'tank',    x: 16.50, z: 16.50, yaw: 0 },
  { room: 'UTL', t: 'forklift',x: 25.00, z: 12.00, yaw: Math.PI / 2 },
  { room: 'UTL', t: 'barrel',  x: 28.50, z: 10.50, yaw: 0 },
  { room: 'UTL', t: 'barrel',  x: 29.20, z: 11.30, yaw: 0 },
  { room: 'UTL', t: 'barrel',  x: 28.40, z: 11.60, yaw: 0 },
  { room: 'UTL', t: 'crate',   x: 27.00, z: 18.00, yaw: 0 },
  { room: 'UTL', t: 'shelf',   x: 29.50, z: 17.50, yaw: -Math.PI / 2 },
  { room: 'UTL', t: 'pillar',  x: 22.00, z: 14.00, yaw: 0, h: 4.0 },
  { room: 'UTL', t: 'pillar',  x: 22.00, z: 17.00, yaw: 0, h: 4.0 },
  { room: 'UTL', t: 'pipes',   x: 22.50, z: 9.50,  yaw: 0, w: 13.0, y: 3.4 },
  { room: 'UTL', t: 'lamp',    x: 18.00, z: 12.00, yaw: 0, y: 3.70, light: [0.42, 0.44, 0.44, 12.0, 1.7] },
  { room: 'UTL', t: 'lamp',    x: 18.00, z: 17.00, yaw: 0, y: 3.70, light: [0.42, 0.44, 0.44, 12.0, 1.7] },
  { room: 'UTL', t: 'lamp',    x: 26.00, z: 12.00, yaw: 0, y: 3.70, light: [0.42, 0.44, 0.44, 12.0, 1.7] },
  { room: 'UTL', t: 'lamp',    x: 26.00, z: 17.00, yaw: 0, y: 3.70, light: [0.42, 0.44, 0.44, 12.0, 1.7] },

  /* -- INTAKE BAY ------------------------------------------------------ */
  { room: 'INT', t: 'forklift',x: 34.00, z: 9.00,  yaw: 0 },
  { room: 'INT', t: 'pallet',  x: 37.00, z: 8.00,  yaw: 0 },
  { room: 'INT', t: 'pallet',  x: 38.40, z: 8.00,  yaw: 0 },
  { room: 'INT', t: 'pallet',  x: 37.00, z: 9.40,  yaw: 0 },
  { room: 'INT', t: 'crate',   x: 40.00, z: 8.50,  yaw: 0 },
  { room: 'INT', t: 'crate',   x: 40.00, z: 10.00, yaw: 0 },
  { room: 'INT', t: 'barrel',  x: 31.00, z: 18.50, yaw: 0 },
  { room: 'INT', t: 'bin',     x: 35.00, z: 17.50, yaw: 0 },
  { room: 'INT', t: 'shelf',   x: 30.30, z: 11.00, yaw: Math.PI / 2 },
  { room: 'INT', t: 'railing', x: 38.50, z: 17.60, yaw: 0, w: 4.0 },
  { room: 'INT', t: 'pipes',   x: 36.00, z: 19.50, yaw: 0, w: 10.0, y: 5.0 },
  { room: 'INT', t: 'lamp',    x: 33.00, z: 10.00, yaw: 0, y: 5.60, light: [0.42, 0.44, 0.48, 15.0, 2.4] },
  { room: 'INT', t: 'lamp',    x: 39.00, z: 10.00, yaw: 0, y: 5.60, light: [0.42, 0.44, 0.48, 15.0, 2.4] },
  { room: 'INT', t: 'lamp',    x: 33.00, z: 16.00, yaw: 0, y: 5.60, light: [0.42, 0.44, 0.48, 15.0, 2.4] },
  { room: 'INT', t: 'lamp',    x: 39.00, z: 16.00, yaw: 0, y: 5.60, light: [0.42, 0.44, 0.48, 15.0, 2.4], flicker: true },

  /* -- KILL FLOOR ------------------------------------------------------ */
  { room: 'KIL', t: 'conveyor', x: 9.00,  z: 27.00, yaw: 0, w: 14.0 },
  { room: 'KIL', t: 'hookrail', x: 10.00, z: 30.00, yaw: 0, w: 18.0, y: 4.30, rise: 2.6 },
  { room: 'KIL', t: 'grinder',  x: 17.50, z: 30.50, yaw: 0 },
  { room: 'KIL', t: 'bin',      x: 4.00,  z: 24.00, yaw: 0, full: true },
  { room: 'KIL', t: 'bin',      x: 6.00,  z: 24.00, yaw: 0 },
  { room: 'KIL', t: 'bin',      x: 2.50,  z: 31.50, yaw: 0, full: true },
  { room: 'KIL', t: 'cart',     x: 11.00, z: 23.00, yaw: 0 },
  { room: 'KIL', t: 'pallet',   x: 18.50, z: 22.40, yaw: 0 },
  { room: 'KIL', t: 'pillar',   x: 7.50,  z: 23.00, yaw: 0, h: 7.0 },
  { room: 'KIL', t: 'pillar',   x: 7.50,  z: 32.00, yaw: 0, h: 7.0 },
  { room: 'KIL', t: 'pillar',   x: 16.00, z: 23.00, yaw: 0, h: 7.0 },
  { room: 'KIL', t: 'carcass',  x: 3.00,  z: 30.00, yaw: 0, top: 4.30 },
  { room: 'KIL', t: 'carcass',  x: 5.20,  z: 30.00, yaw: 0, top: 4.30, dark: true },
  { room: 'KIL', t: 'carcass',  x: 12.40, z: 30.00, yaw: 0, top: 4.30 },
  { room: 'KIL', t: 'carcass',  x: 14.60, z: 30.00, yaw: 0, top: 4.30, dark: true },
  { room: 'KIL', t: 'curtain',  x: 19.96, z: 25.50, yaw: Math.PI / 2, w: 3.0, h: 3.2 },
  { room: 'KIL', t: 'drainplate', x: 9.00,  z: 25.20, yaw: 0 },
  { room: 'KIL', t: 'drainplate', x: 9.00,  z: 29.00, yaw: 0 },
  { room: 'KIL', t: 'drainplate', x: 4.50,  z: 32.60, yaw: 0 },
  { room: 'KIL', t: 'drainplate', x: 13.50, z: 32.60, yaw: 0 },
  { room: 'KIL', t: 'bloodpool',  x: 9.00,  z: 28.40, yaw: 0, r: 1.5 },
  { room: 'KIL', t: 'bloodpool',  x: 4.60,  z: 26.20, yaw: 0, r: 0.9 },
  { room: 'KIL', t: 'bloodpool',  x: 14.00, z: 29.20, yaw: 0, r: 1.1 },
  { room: 'KIL', t: 'lamp',    x: 5.00,  z: 23.00, yaw: 0, y: 6.50, light: [0.50, 0.50, 0.48, 12.0, 1.15] },
  { room: 'KIL', t: 'lamp',    x: 13.00, z: 23.00, yaw: 0, y: 6.50, light: [0.50, 0.50, 0.48, 12.0, 1.15] },
  { room: 'KIL', t: 'lamp',    x: 5.00,  z: 30.00, yaw: 0, y: 6.50, light: [0.50, 0.50, 0.48, 12.0, 1.15] },
  { room: 'KIL', t: 'lamp',    x: 13.00, z: 30.00, yaw: 0, y: 6.50, light: [0.50, 0.50, 0.48, 12.0, 1.15], flicker: true },
  { room: 'KIL', t: 'lamp',    x: 17.50, z: 26.50, yaw: 0, y: 6.50, light: [0.46, 0.46, 0.44, 10.0, 1.0] },
  { room: 'KIL', t: 'lampred', x: 9.00,  z: 27.00, yaw: 0, y: 6.60, dead: true, alarm: true },

  /* -- COOKER HOUSE ---------------------------------------------------- */
  { room: 'COO', t: 'cooker',  x: 23.00, z: 23.50, yaw: 0 },
  { room: 'COO', t: 'cooker',  x: 23.00, z: 26.90, yaw: 0 },
  { room: 'COO', t: 'cooker',  x: 27.50, z: 23.50, yaw: 0 },
  { room: 'COO', t: 'cooker',  x: 27.50, z: 26.90, yaw: 0 },
  { room: 'COO', t: 'tank',    x: 31.50, z: 22.00, yaw: 0 },
  { room: 'COO', t: 'tank',    x: 31.50, z: 24.50, yaw: 0 },
  { room: 'COO', t: 'pump',    x: 32.50, z: 27.50, yaw: 0 },
  { room: 'COO', t: 'grinder', x: 22.00, z: 29.30, yaw: 0 },
  { room: 'COO', t: 'barrel',  x: 30.20, z: 29.20, yaw: 0 },
  { room: 'COO', t: 'barrel',  x: 30.90, z: 29.40, yaw: 0 },
  { room: 'COO', t: 'pillar',  x: 25.50, z: 21.50, yaw: 0, h: 7.0 },
  { room: 'COO', t: 'pillar',  x: 25.50, z: 29.00, yaw: 0, h: 7.0 },
  { room: 'COO', t: 'pipes',   x: 27.00, z: 20.40, yaw: 0, w: 12.0, y: 5.2 },
  { room: 'COO', t: 'bloodpool', x: 25.30, z: 25.80, yaw: 0, r: 1.3 },
  { room: 'COO', t: 'drainplate', x: 25.50, z: 25.50, yaw: 0 },
  { room: 'COO', t: 'lamp',    x: 25.00, z: 22.50, yaw: 0, y: 6.40, light: [0.52, 0.44, 0.38, 15.0, 1.9] },
  { room: 'COO', t: 'lamp',    x: 25.00, z: 28.00, yaw: 0, y: 6.40, light: [0.52, 0.44, 0.38, 15.0, 1.9] },
  { room: 'COO', t: 'lamp',    x: 31.00, z: 25.50, yaw: 0, y: 6.40, light: [0.50, 0.42, 0.36, 13.0, 1.7], flicker: true },

  /* -- COLD STORAGE ---------------------------------------------------- */
  { room: 'CLD', t: 'hookrail', x: 5.00, z: 37.00, yaw: 0, w: 8.0, y: 3.40, rise: 1.0 },
  { room: 'CLD', t: 'hookrail', x: 5.00, z: 39.50, yaw: 0, w: 8.0, y: 3.40, rise: 1.0 },
  { room: 'CLD', t: 'carcass', x: 2.00, z: 37.00, yaw: 0, top: 3.40 },
  { room: 'CLD', t: 'carcass', x: 3.20, z: 37.00, yaw: 0, top: 3.40, dark: true },
  { room: 'CLD', t: 'carcass', x: 4.40, z: 37.00, yaw: 0, top: 3.40 },
  { room: 'CLD', t: 'carcass', x: 5.60, z: 37.00, yaw: 0, top: 3.40, dark: true },
  { room: 'CLD', t: 'carcass', x: 6.80, z: 37.00, yaw: 0, top: 3.40 },
  { room: 'CLD', t: 'carcass', x: 8.00, z: 37.00, yaw: 0, top: 3.40, dark: true },
  { room: 'CLD', t: 'carcass', x: 2.60, z: 39.50, yaw: 0, top: 3.40, dark: true },
  { room: 'CLD', t: 'carcass', x: 3.80, z: 39.50, yaw: 0, top: 3.40 },
  { room: 'CLD', t: 'carcass', x: 5.00, z: 39.50, yaw: 0, top: 3.40, dark: true },
  { room: 'CLD', t: 'carcass', x: 6.20, z: 39.50, yaw: 0, top: 3.40 },
  { room: 'CLD', t: 'crate',   x: 8.50, z: 41.00, yaw: 0 },
  { room: 'CLD', t: 'pallet',  x: 1.00, z: 41.00, yaw: 0 },
  { room: 'CLD', t: 'lamp',    x: 5.00, z: 35.60, yaw: 0, y: 4.20, light: [0.46, 0.52, 0.60, 9.0, 1.0] },
  { room: 'CLD', t: 'lamp',    x: 5.00, z: 40.80, yaw: 0, y: 4.20, light: [0.46, 0.52, 0.60, 9.0, 1.0] }
];

/* -------------------------------------------------------- wall fittings -- */
var WALLPROPS = [
  { room: 'SEC', t: 'corkboard', wall: 'S', s: 4.00, y: 1.30 },
  { room: 'SEC', t: 'camfix',    wall: 'N', s: 6.20, y: 2.70, aim: -2.2 },
  { room: 'SEC', t: 'sign',      wall: 'W', s: 1.20, y: 1.90, tex: 'SIGN_SECURITY', w: 1.0, h: 0.5 },

  { room: 'BRK', t: 'sign',      wall: 'S', s: 11.00, y: 1.85, tex: 'SIGN_NOSMOKE', w: 0.65, h: 0.65 },
  { room: 'BRK', t: 'poster',    wall: 'W', s: 2.00,  y: 1.10, tex: 'POSTER_SAFETY' },
  { room: 'BRK', t: 'camfix',    wall: 'N', s: 14.60, y: 2.70, aim: -2.5 },

  { room: 'LOK', t: 'poster',    wall: 'E', s: 2.20,  y: 1.15, tex: 'POSTER_SAFETY' },
  { room: 'LOK', t: 'camfix',    wall: 'N', s: 21.60, y: 2.70, aim: -2.5 },

  { room: 'OFF', t: 'corkboard', wall: 'N', s: 23.50, y: 1.40 },
  { room: 'OFF', t: 'camfix',    wall: 'N', s: 22.40, y: 2.70, aim: 2.5 },
  { room: 'OFF', t: 'sign',      wall: 'E', s: 4.60,  y: 1.90, tex: 'SIGN_GRADE6', w: 0.9, h: 0.9 },

  { room: 'CORA', t: 'sign', wall: 'S', s: 1.00,  y: 2.30, tex: 'SIGN_SECURITY', w: 1.1, h: 0.55 },
  { room: 'CORA', t: 'sign', wall: 'S', s: 8.50,  y: 2.30, tex: 'SIGN_BREAK',    w: 1.1, h: 0.55 },
  { room: 'CORA', t: 'sign', wall: 'S', s: 16.30, y: 2.30, tex: 'SIGN_LOCKER',   w: 1.1, h: 0.55 },
  { room: 'CORA', t: 'sign', wall: 'S', s: 24.00, y: 2.30, tex: 'SIGN_OFFICE',   w: 1.1, h: 0.55 },
  { room: 'CORA', t: 'sign', wall: 'N', s: 19.60, y: 2.30, tex: 'SIGN_UTIL',     w: 1.2, h: 0.6 },
  { room: 'CORA', t: 'exitsign', wall: 'W', s: 7.40, y: 2.55 },
  { room: 'CORA', t: 'hosereel', wall: 'N', s: 26.50, y: 1.60 },
  { room: 'CORA', t: 'camfix',   wall: 'N', s: 0.60,  y: 2.90, aim: -1.3 },
  { room: 'CORA', t: 'camfix',   wall: 'N', s: 29.40, y: 2.90, aim: 1.3 },

  { room: 'REN', t: 'camfix',  wall: 'E', s: 9.50,  y: 4.60, aim: 2.5 },
  { room: 'REN', t: 'bloodsmear', wall: 'W', s: 14.00, y: 0.60, w: 1.6, h: 1.6 },

  { room: 'CORB', t: 'exitsign', wall: 'S', s: 13.50, y: 2.75 },
  { room: 'CORB', t: 'camfix',   wall: 'E', s: 9.60,  y: 2.90, aim: 3.05 },

  { room: 'UTL', t: 'breaker',  wall: 'S', s: 18.00, y: 1.10 },
  { room: 'UTL', t: 'camfix',   wall: 'E', s: 19.40, y: 3.70, aim: 2.2 },
  { room: 'UTL', t: 'sign',     wall: 'S', s: 25.50, y: 2.60, tex: 'SIGN_COOKER', w: 1.1, h: 0.55 },

  { room: 'INT', t: 'sign',    wall: 'N', s: 36.00, y: 3.40, tex: 'SIGN_INTAKE', w: 1.8, h: 0.9 },
  { room: 'INT', t: 'camfix',  wall: 'N', s: 30.60, y: 5.40, aim: 2.4 },
  { room: 'INT', t: 'exitsign',wall: 'E', s: 16.20, y: 2.60 },

  { room: 'KIL', t: 'sign',   wall: 'S', s: 9.00,  y: 3.50, tex: 'SIGN_LINE3', w: 2.4, h: 1.2 },
  { room: 'KIL', t: 'poster', wall: 'W', s: 25.00, y: 1.40, tex: 'POSTER_SAFETY' },
  { room: 'KIL', t: 'sign',   wall: 'N', s: 6.20,  y: 2.80, tex: 'SIGN_COLD', w: 1.4, h: 0.7 },
  { room: 'KIL', t: 'bloodspray', wall: 'S', s: 2.60, y: 0.90, w: 2.4, h: 1.8 },
  { room: 'KIL', t: 'bloodsmear', wall: 'E', s: 31.50, y: 0.50, w: 1.7, h: 1.7 },
  { room: 'KIL', t: 'camfix', wall: 'S', s: 18.80, y: 5.40, aim: 2.6 },
  { room: 'KIL', t: 'camfix', wall: 'N', s: 1.00,  y: 5.00, aim: -0.4 },

  { room: 'COO', t: 'sign', wall: 'W', s: 22.00, y: 3.60, tex: 'SIGN_COOKER', w: 1.6, h: 0.8 },
  { room: 'COO', t: 'sign', wall: 'E', s: 27.00, y: 1.60, tex: 'SIGN_GRADE6', w: 1.1, h: 1.1 },
  { room: 'COO', t: 'bloodspray', wall: 'N', s: 24.00, y: 0.80, w: 2.6, h: 2.0 },
  { room: 'COO', t: 'camfix', wall: 'W', s: 29.20, y: 5.60, aim: -2.3 },

  { room: 'CLD', t: 'sign',   wall: 'S', s: 7.00, y: 2.60, tex: 'SIGN_COLD', w: 1.5, h: 0.75 },
  { room: 'CLD', t: 'camfix', wall: 'N', s: 9.40, y: 4.10, aim: 2.3 }
];

/* ------------------------------------------------------------- cameras --
   The plant's own CCTV. These double as the game's fixed cinematic angles:
   what the player watches on the monitor bank is exactly what frames them
   when they are down on the floor.                                        */
var CAMS = [
  { id: 'CAM00', ch: 0,  label: 'SECURITY OFFICE', room: 'SEC',
    pos: [6.75, 2.45, 5.72], look: [1.70, 0.85, 2.30], fov: 70, sees: ['SEC'],
    fog: [9, 9, 12, 4, 17] },
  { id: 'CAM01', ch: 1,  label: 'CORRIDOR A - WEST', room: 'CORA',
    pos: [0.55, 2.92, 8.70], look: [14.0, 1.10, 7.20], fov: 58, sees: ['CORA', 'CORB'],
    fog: [8, 9, 10, 5, 24] },
  { id: 'CAM02', ch: 2,  label: 'CORRIDOR A - EAST', room: 'CORA',
    pos: [29.45, 2.92, 8.70], look: [15.0, 1.10, 7.20], fov: 58, sees: ['CORA', 'CORB'],
    fog: [8, 9, 10, 5, 24] },
  { id: 'CAM03', ch: 3,  label: 'BREAK ROOM', room: 'BRK',
    pos: [14.60, 2.72, 5.62], look: [9.00, 1.00, 1.60], fov: 66, sees: ['BRK'],
    fog: [9, 10, 9, 4, 16] },
  { id: 'CAM04', ch: 4,  label: 'LOCKER ROOM', room: 'LOK',
    pos: [21.60, 2.72, 5.62], look: [16.60, 1.00, 1.30], fov: 66, sees: ['LOK'],
    fog: [8, 9, 9, 4, 16] },
  { id: 'CAM05', ch: 5,  label: 'FRONT OFFICE', room: 'OFF',
    pos: [22.40, 2.72, 5.62], look: [27.00, 1.05, 1.70], fov: 64, sees: ['OFF'],
    fog: [9, 9, 11, 4, 16] },
  { id: 'CAM06', ch: 6,  label: 'CORRIDOR B', room: 'CORB',
    pos: [14.60, 2.92, 9.55], look: [13.20, 1.10, 19.50], fov: 60, sees: ['CORB', 'KIL'],
    fog: [7, 8, 9, 4, 19] },
  { id: 'CAM07', ch: 7,  label: 'KILL FLOOR - LINE 3', room: 'KIL',
    pos: [18.80, 5.42, 20.35], look: [7.00, 1.60, 28.00], fov: 64, sees: ['KIL'],
    fog: [10, 7, 7, 5, 26] },
  { id: 'CAM08', ch: 8,  label: 'KILL FLOOR - HOOK LINE', room: 'KIL',
    pos: [1.00, 5.02, 33.30], look: [12.00, 2.40, 29.00], fov: 62, sees: ['KIL'],
    fog: [10, 7, 7, 5, 26] },
  { id: 'CAM09', ch: 9,  label: 'COOKER HOUSE', room: 'COO',
    pos: [20.60, 6.20, 20.60], look: [30.50, 1.60, 27.50], fov: 68, sees: ['COO'],
    fog: [12, 8, 6, 4, 23] },
  { id: 'CAM10', ch: 10, label: 'COLD STORAGE', room: 'CLD',
    pos: [9.45, 4.12, 41.45], look: [3.00, 1.60, 36.20], fov: 66, sees: ['CLD'],
    fog: [11, 13, 17, 3, 15] },
  { id: 'CAM11', ch: 11, label: 'PUMP HOUSE', room: 'UTL',
    pos: [29.45, 3.72, 19.45], look: [17.00, 1.20, 11.00], fov: 64, sees: ['UTL'],
    fog: [8, 9, 9, 4, 22] },
  { id: 'CAM12', ch: 12, label: 'INTAKE BAY 2', room: 'INT',
    pos: [30.60, 5.42, 19.45], look: [40.00, 1.40, 10.00], fov: 64, sees: ['INT'],
    fog: [7, 8, 11, 4, 24] },
  { id: 'CAM13', ch: 13, label: 'RENDER PIT', room: 'REN',
    pos: [11.55, 4.62, 9.55], look: [3.00, 1.40, 16.00], fov: 64, sees: ['REN'],
    fog: [8, 8, 8, 4, 20] }
];

var CAM_BY_ID = {};
for (var _ci = 0; _ci < CAMS.length; _ci++) CAM_BY_ID[CAMS[_ci].id] = CAMS[_ci];

/* Which camera frames the player when they are on foot in a given room.
   Some rooms hand off between two angles at a threshold, the way a fixed
   camera game cuts as you cross a room. */
var PATROL_VIEWS = {
  SEC:  [{ cam: 'CAM00' }],
  BRK:  [{ cam: 'CAM03' }],
  LOK:  [{ cam: 'CAM04' }],
  OFF:  [{ cam: 'CAM05' }],
  CORA: [{ cam: 'CAM01', xmax: 15.0 }, { cam: 'CAM02' }],
  CORB: [{ cam: 'CAM06' }],
  REN:  [{ cam: 'CAM13' }],
  UTL:  [{ cam: 'CAM11' }],
  INT:  [{ cam: 'CAM12' }],
  KIL:  [{ cam: 'CAM07', zmax: 27.5 }, { cam: 'CAM08' }],
  COO:  [{ cam: 'CAM09' }],
  CLD:  [{ cam: 'CAM10' }]
};
