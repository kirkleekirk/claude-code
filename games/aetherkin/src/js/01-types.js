/* Thirteen aspects. AETHER is neutral: it neither beats nor bends anything.
   beats = 2x dealt, bends = 0.5x dealt, voids = 0x dealt. */
const TYPES = {
  aether:  { name: 'Aether',  hue: '#B9C2DA', beats: [], bends: [], voids: [] },
  ember:   { name: 'Ember',   hue: '#F2683C', beats: ['verdant', 'frost', 'iron', 'venom'], bends: ['ember', 'tide', 'stone'], voids: [] },
  tide:    { name: 'Tide',    hue: '#3FA9DE', beats: ['ember', 'stone', 'iron'], bends: ['tide', 'verdant', 'storm'], voids: [] },
  verdant: { name: 'Verdant', hue: '#5FBF6A', beats: ['tide', 'stone'], bends: ['ember', 'verdant', 'gale', 'venom', 'iron'], voids: [] },
  storm:   { name: 'Storm',   hue: '#F0C33C', beats: ['tide', 'gale'], bends: ['storm', 'verdant', 'stone'], voids: [] },
  stone:   { name: 'Stone',   hue: '#B98A5C', beats: ['ember', 'gale', 'frost', 'storm'], bends: ['verdant', 'iron'], voids: [] },
  frost:   { name: 'Frost',   hue: '#8FD9E0', beats: ['verdant', 'gale', 'stone'], bends: ['ember', 'tide', 'frost', 'iron'], voids: [] },
  gale:    { name: 'Gale',    hue: '#A6E3C4', beats: ['verdant', 'venom', 'mind'], bends: ['storm', 'stone', 'iron'], voids: [] },
  umbra:   { name: 'Umbra',   hue: '#9B77D6', beats: ['mind', 'lumen'], bends: ['umbra', 'iron'], voids: [] },
  lumen:   { name: 'Lumen',   hue: '#FFD98A', beats: ['umbra', 'venom'], bends: ['lumen', 'stone', 'iron'], voids: [] },
  iron:    { name: 'Iron',    hue: '#9AA7B8', beats: ['frost', 'stone', 'lumen'], bends: ['ember', 'tide', 'storm', 'iron'], voids: [] },
  venom:   { name: 'Venom',   hue: '#C062A8', beats: ['verdant', 'tide'], bends: ['stone', 'iron', 'venom', 'mind'], voids: [] },
  mind:    { name: 'Mind',    hue: '#E86A8A', beats: ['venom', 'storm'], bends: ['mind', 'iron'], voids: ['umbra'] },
};
const TYPE_IDS = Object.keys(TYPES);
const typeHue = id => (TYPES[id] || TYPES.aether).hue;
const typeName = id => (TYPES[id] || TYPES.aether).name;

function typeMult(atkType, defTypes) {
  const t = TYPES[atkType] || TYPES.aether;
  let m = 1;
  for (const d of defTypes) {
    if (t.voids.includes(d)) return 0;
    if (t.beats.includes(d)) m *= 2;
    else if (t.bends.includes(d)) m *= 0.5;
  }
  return m;
}
function effLabel(m) {
  if (m === 0) return { text: 'It passes straight through.', tone: 'null' };
  if (m >= 4) return { text: 'Devastating resonance!', tone: 'super' };
  if (m > 1) return { text: 'It resonates!', tone: 'super' };
  if (m <= 0.25) return { text: 'Almost nothing gets through.', tone: 'weak' };
  if (m < 1) return { text: 'The aspect is dulled.', tone: 'weak' };
  return { text: '', tone: 'even' };
}

/* ---------- stats ---------- */
const STATS = ['hp', 'frc', 'grd', 'arc', 'wrd', 'swf'];
const STAT_NAME = { hp: 'Vitality', frc: 'Force', grd: 'Guard', arc: 'Arcana', wrd: 'Ward', swf: 'Swift' };
const STAT_SHORT = { hp: 'HP', frc: 'FRC', grd: 'GRD', arc: 'ARC', wrd: 'WRD', swf: 'SWF' };
const STAGE_NAME = { frc: 'Force', grd: 'Guard', arc: 'Arcana', wrd: 'Ward', swf: 'Swift', acc: 'Accuracy', eva: 'Evasion', crit: 'Focus' };

const stageMult = s0 => { const s = clamp(s0, -6, 6); return s >= 0 ? (2 + s) / 2 : 2 / (2 - s); };
const accStageMult = s0 => { const s = clamp(s0, -6, 6); return s >= 0 ? (3 + s) / 3 : 3 / (3 - s); };
const CRIT_TIERS = [0.0625, 0.125, 0.25, 0.5, 1];
const critChanceFor = s => CRIT_TIERS[clamp(s, 0, 4)];

/* ---------- battlefield fields ---------- */
const FIELDS = {
  emberstorm: { name: 'Emberstorm', hue: '#F2683C', turns: 5, boost: { ember: 1.3 }, damp: { frost: 0.75, tide: 0.85 },
    blurb: 'Ash rides the wind. Ember surges; Frost gutters. Burn scorches twice as hard.' },
  downpour:   { name: 'Downpour', hue: '#3FA9DE', turns: 5, boost: { tide: 1.3 }, damp: { ember: 0.7 },
    blurb: 'Sheeting rain. Tide surges; Ember drowns.' },
  thunderhead:{ name: 'Thunderhead', hue: '#F0C33C', turns: 5, boost: { storm: 1.3 }, damp: {},
    blurb: 'The air hums. Storm surges, and every strike lands more surely.' },
  bloom:      { name: 'Verdant Bloom', hue: '#5FBF6A', turns: 5, boost: { verdant: 1.3 }, damp: { venom: 0.8 },
    blurb: 'Growth erupts underfoot. Verdant surges; all kin mend a little each turn.' },
  whiteout:   { name: 'Whiteout', hue: '#8FD9E0', turns: 5, boost: { frost: 1.3 }, damp: { ember: 0.85 },
    blurb: 'Blinding snow. Frost surges, and Chill bites twice as deep.' },
  eclipse:    { name: 'Eclipse', hue: '#9B77D6', turns: 5, boost: { umbra: 1.35 }, damp: { lumen: 0.7 },
    blurb: 'The light is eaten. Umbra surges; Lumen falters.' },
  tremor:     { name: 'Tremorfield', hue: '#B98A5C', turns: 5, boost: { stone: 1.25 }, damp: {},
    blurb: 'The ground will not hold still. Stone surges and every body blow lands heavier.' },
};

/* ---------- statuses ---------- */
const STATUSES = {
  burn:   { name: 'Burn', hue: '#F2683C', major: true, blurb: 'Loses 6% max HP each turn; Force cut by a quarter.' },
  poison: { name: 'Poison', hue: '#C062A8', major: true, blurb: 'Loses 5% max HP each turn, worsening by 2% every turn.' },
  chill:  { name: 'Chill', hue: '#8FD9E0', major: true, blurb: 'Swift cut by 40%; 15% chance each turn to seize up entirely.' },
  shock:  { name: 'Shock', hue: '#F0C33C', major: true, blurb: '25% chance each turn to lock up and lose the turn.' },
  daze:   { name: 'Daze', hue: '#E86A8A', major: true, blurb: '33% chance to strike itself instead of the foe.' },
  bleed:  { name: 'Bleed', hue: '#E0574B', major: false, blurb: 'Loses 7% max HP each turn. Wears off after 3 turns.' },
  root:   { name: 'Root', hue: '#5FBF6A', major: false, blurb: 'Cannot be recalled from the field.' },
  smolder:{ name: 'Smolder', hue: '#F0A03C', major: false, stacks: true, blurb: 'Each stack burns for 3% max HP per turn.' },
};
