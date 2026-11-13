// Stations: the places in a camp where people do things. Built from the
// furniture inside the camp's structure (the house you claimed, or what you
// placed), each with slots: where to stand or sit, facing which way, and
// what can be done there (act, held item, tags, roles).
import { STORY } from '../building/defs.js';

// act options: { act, item, tags, seatH, lie }
const SIT = (seatH, extra = []) => [
  { act: 'sit_chair', tags: ['rest', 'leisure'], seatH },
  { act: 'sit_read', item: 'book', tags: ['leisure', 'solo'], seatH },
  { act: 'sit_drink', item: 'mug', tags: ['leisure', 'meal', 'social'], seatH },
  { act: 'sit_eat', item: 'spoon', tags: ['meal'], seatH },
  ...extra,
];
const TABLE_SIT = (seatH) => [
  ...SIT(seatH),
  { act: 'sit_cards', item: 'cards', tags: ['leisure', 'social'], seatH },
  { act: 'sit_write', item: 'knife', tags: ['leisure', 'solo', 'work:quartermaster', 'work:counselor'], seatH },
];

// prop type -> slots [{ x, z, face, y, opts }] in prop-local metres; face is
// the yaw offset from the prop's front (0 = facing the prop's +Z).
const DEFS = {
  campfire: () => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = 1.55;
      out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, faceTo: [0, 0], opts: [
        { act: 'sit_ground', tags: ['social', 'leisure', 'rest', 'evening'], seatH: 0 },
        { act: 'sit_whittle', item: 'knife', tags: ['leisure', 'solo', 'evening'], seatH: 0 },
        { act: 'sit_ground', item: 'spoon', tags: ['meal'], seatH: 0, eat: true },
        { act: 'warm_hands', tags: ['social', 'leisure', 'evening', 'morning'] },
        { act: 'drink', item: 'mug', tags: ['social', 'leisure', 'morning'] },
      ] });
    }
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 1.0, r = 0.95;
      out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, faceTo: [0, 0], opts: [
        { act: 'cook', item: 'spatula', tags: ['cook', 'work:cook'] },
        { act: 'tend_fire', item: 'stick', tags: ['chore', 'leisure', 'evening'] },
      ] });
    }
    return out;
  },
  log_bench: () => [-0.45, 0.45].map((x) => ({ x, z: 0.05, face: 0, opts: [
    { act: 'sit_log', tags: ['social', 'leisure', 'rest', 'evening'], seatH: 0.4 },
    { act: 'sit_whittle', item: 'knife', tags: ['leisure', 'solo', 'evening'], seatH: 0.4 },
    { act: 'sit_eat', item: 'spoon', tags: ['meal'], seatH: 0.4 },
    { act: 'sit_drink', item: 'mug', tags: ['leisure', 'social', 'morning'], seatH: 0.4 },
    { act: 'sit_read', item: 'book', tags: ['leisure', 'solo', 'work:counselor'], seatH: 0.4 },
  ] })),
  hay_bale: () => [{ x: 0, z: 0, face: 0, opts: SIT(0.4) }],
  chair: () => [{ x: 0, z: 0.02, face: 0, opts: SIT(0.47), chair: true }],
  couch: (p) => {
    const w = p.w || 2.0, n = Math.max(1, Math.round((w - 0.4) / 0.6));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: -w / 2 + 0.2 + (i + 0.5) * ((w - 0.4) / n), z: 0.08, face: 0, opts: SIT(0.42) });
    return out;
  },
  armchair: () => [{ x: 0, z: 0.08, face: 0, opts: SIT(0.42) }],
  pew: (p) => { const w = p.w || 2.4; return [-w / 3, 0, w / 3].map((x) => ({ x, z: 0.05, face: 0, opts: [{ act: 'sit_chair', tags: ['rest', 'faith'], seatH: 0.45 }, { act: 'pray', tags: ['faith'] }] })); },
  stool: () => [{ x: 0, z: 0, face: 0, opts: [{ act: 'sit_drink', item: 'mug', tags: ['leisure', 'social'], seatH: 0.72 }] }],
  bed: (p) => {
    const w = p.w || 1.5;
    const xs = w > 1.2 ? [-w / 4, w / 4] : [0];
    return xs.map((x) => ({ x, z: 0.95, face: 0, y: 0.56, opts: [{ act: 'sleep', tags: ['sleep', 'rest'], lie: true }], bed: true }));
  },
  bedroll: () => [{ x: 0, z: 0.93, face: 0, y: 0.08, opts: [{ act: 'sleep', tags: ['sleep', 'rest'], lie: true }], bed: true }],
  medcot: () => [
    { x: 0, z: 0.93, face: 0, y: 0.46, opts: [{ act: 'sleep', tags: ['sleep', 'rest', 'patient'], lie: true }], bed: true, cot: true },
    { x: 0.75, z: 0.35, face: -Math.PI / 2, opts: [{ act: 'kneel_work', tags: ['work:medic'] }, { act: 'inspect', tags: ['work:medic'] }] },
  ],
  stove: () => [{ x: 0, z: 0.85, face: Math.PI, opts: [{ act: 'cook', item: 'spatula', tags: ['cook', 'work:cook'] }] }],
  grill: () => [{ x: 0, z: 0.75, face: Math.PI, opts: [{ act: 'cook', item: 'spatula', tags: ['cook', 'work:cook'] }] }],
  counter: () => [{ x: 0, z: 0.75, face: Math.PI, opts: [{ act: 'cook', item: 'knife', tags: ['cook', 'work:cook'] }, { act: 'inspect', tags: ['chore'] }] }],
  fridge: () => [{ x: 0, z: 0.8, face: Math.PI, opts: [{ act: 'inspect', tags: ['chore', 'work:quartermaster'] }] }],
  workbench: () => [{ x: 0, z: 0.75, face: Math.PI, opts: [{ act: 'hammer', item: 'hammer', tags: ['work:mechanic', 'work:builder'] }, { act: 'inspect', tags: ['work:mechanic', 'chore'] }] }],
  toolchest: () => [{ x: 0, z: 0.7, face: Math.PI, opts: [{ act: 'inspect', tags: ['work:mechanic', 'work:builder'] }] }],
  chopping_block: () => [{ x: 0, z: 0.78, face: Math.PI, opts: [{ act: 'chop', item: 'axe', tags: ['work:builder', 'chore'] }] }],
  garden_bed: () => [
    { x: 0, z: 0.85, face: Math.PI, opts: [{ act: 'kneel_work', tags: ['work:farmer', 'chore'] }] },
    { x: 0, z: -0.85, face: 0, opts: [{ act: 'kneel_work', tags: ['work:farmer'] }] },
  ],
  water_barrel: () => [{ x: 0, z: 0.65, face: Math.PI, opts: [{ act: 'drink', item: 'mug', tags: ['morning', 'chore'] }, { act: 'inspect', tags: ['chore'] }] }],
  lookout: () => [{ x: 0, z: -0.1, face: Math.PI, opts: [{ act: 'guard', item: 'rifle', tags: ['guard', 'work:guard'] }] }],
  crate: () => [{ x: 0, z: 0.75, face: Math.PI, opts: [{ act: 'inspect', tags: ['work:quartermaster', 'work:scavenger', 'chore'] }] }],
  metal_shelf: () => [{ x: 0, z: 0.7, face: Math.PI, opts: [{ act: 'inspect', tags: ['work:quartermaster', 'work:mechanic', 'chore'] }] }],
  bookshelf: () => [{ x: 0, z: 0.6, face: Math.PI, opts: [{ act: 'inspect', tags: ['leisure', 'solo'] }] }],
  fireplace: () => [{ x: 0, z: 1.0, face: Math.PI, opts: [{ act: 'warm_hands', tags: ['leisure', 'evening', 'social'] }, { act: 'tend_fire', item: 'stick', tags: ['leisure', 'chore'] }] }],
  church_altar: () => [{ x: 0, z: 0.9, face: Math.PI, opts: [{ act: 'pray', tags: ['faith'] }] }],
  piano: () => [{ x: 0, z: 0.55, face: Math.PI, opts: [{ act: 'sit_cards', tags: ['leisure', 'music'], seatH: 0.5 }] }],
  table: () => [],
  tent: () => [
    { x: 0, z: 0.85, face: 0, y: 0.07, opts: [{ act: 'sleep', tags: ['sleep', 'rest'], lie: true }], bed: true },
    { x: 0.55, z: 1.9, face: 0, opts: [{ act: 'smoke', item: 'cigarette', tags: ['leisure', 'solo'] }, { act: 'sit_ground', tags: ['rest', 'leisure'], seatH: 0 }] },
  ],
  grave: () => [{ x: 0, z: 1.55, face: Math.PI, opts: [{ act: 'pray', tags: ['grief', 'faith'] }, { act: 'cry', tags: ['grief'] }] }],
  desk: () => [{ x: 0, z: 0.5, face: Math.PI, opts: [{ act: 'inspect', tags: ['work:quartermaster', 'solo'] }] }],
};
export const STATION_TYPES = Object.keys(DEFS);

// role -> station prop types that count as "its" place
export const ROLE_STATIONS = {
  cook: ['grill', 'stove', 'campfire', 'counter'], farmer: ['garden_bed'], medic: ['medcot'], mechanic: ['workbench', 'toolchest', 'metal_shelf'],
  builder: ['chopping_block', 'workbench'], guard: ['lookout'], hunter: ['campfire'], scavenger: ['crate'], quartermaster: ['crate', 'metal_shelf', 'fridge'], counselor: ['campfire', 'log_bench'],
};

// Build the station list for a structure's props.
export function stationsFor(S) {
  const out = [];
  const props = S.props;
  for (let pi = 0; pi < props.length; pi++) {
    const p = props[pi];
    const def = DEFS[p.type];
    if (!def) continue;
    const r = ((p.rot || 0) % 4 + 4) % 4;
    const cos = [1, 0, -1, 0][r], sin = [0, 1, 0, -1][r];
    const tx = (x, z) => [p.x + x * cos + z * sin, p.z - x * sin + z * cos];
    const yaw = Math.atan2(sin, cos);
    const [cx, cz] = tx(0, 0);
    const st = { type: p.type, prop: p, x: S.ox + cx, y: S.oy + p.y, z: S.oz + cz, yaw, level: Math.round(p.y / STORY), slots: [] };
    for (const sl of def(p)) {
      const [lx, lz] = tx(sl.x, sl.z);
      const wx = S.ox + lx, wz = S.oz + lz;
      let face = yaw + (sl.face || 0);
      if (sl.faceTo) { const [fx, fz] = tx(sl.faceTo[0], sl.faceTo[1]); face = Math.atan2(S.ox + fx - wx, S.oz + fz - wz); }
      st.slots.push({ st, x: wx, z: wz, y: S.oy + p.y + (sl.y || 0), ground: S.oy + p.y, face, opts: sl.opts, bed: !!sl.bed, cot: !!sl.cot, chair: !!sl.chair, user: null });
    }
    out.push(st);
  }
  // chairs next to a table become table seats (cards, writing, meals)
  for (const t of out.filter((s) => s.type === 'table')) {
    for (const c of out.filter((s) => s.type === 'chair')) {
      if (Math.hypot(c.x - t.x, c.z - t.z) < 1.4 && Math.abs(c.y - t.y) < 0.5) for (const sl of c.slots) sl.opts = TABLE_SIT(0.47);
    }
  }
  return out;
}
