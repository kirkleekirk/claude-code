import { RNG } from '../../core/rng.js';

// Random looks for the people of the parish: the dead, and the Living Guard.
// Each kind comes from a fixed pool, so a horde of fifty shares a couple of dozen
// meshes and textures instead of building fifty.

const LIVE_SKIN = [0xf2d2b6, 0xe8c0a0, 0xd9a582, 0xc8946c, 0xb07e5a, 0x8e5e40, 0x6b4430, 0x4e3224];
const DEAD_SKIN = [0x8a9a78, 0x7e8a6c, 0x9aa088, 0x6f7a60, 0xa0a490, 0x7a7058, 0x5e6250, 0x8a8a70, 0xb0b09a, 0x6a5a48];
const HAIR = [0x1a1410, 0x2a1e14, 0x3a2a1e, 0x5a3a22, 0x7a5a3a, 0xa0703a, 0xc8a060, 0x8a8a84, 0xd0ccc4, 0x6a2a1a];
const SHIRT = [0x5a4a3a, 0x3a4a5a, 0x6a3a3a, 0x7a7a6a, 0x4a5a3a, 0x2a2a2a, 0x8a7a5a, 0x5a3a5a, 0x9a9a8a, 0x3a5a5a, 0xa04a3a, 0x3a6a8a, 0xc8b89a, 0x7a2a3a];
const PANTS = [0x2a3040, 0x3a3a34, 0x4a3a2a, 0x2a2a2a, 0x5a5448, 0x3a3a4a, 0x3a4a6a, 0x6a5a40];
const SHOES = [0x2a2a2a, 0x3a2a1e, 0x5a4a3a, 0xb8b8b0, 0x1a1a1a, 0x4a3a2a];
const BROW_COLORS = ['#1a1410', '#2a1e14', '#3a2a1e', '#5a3a22', '#6a6a64'];

// a hex colour pushed toward grey-green: skin a while after death
function deaden(hex, k) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const tr = 0x8a, tg = 0x94, tb = 0x78;
  const m = (a, t) => Math.round(a + (t - a) * k);
  return (m(r, tr) << 16) | (m(g, tg) << 8) | m(b, tb);
}

function deadFace(rng, fresh) {
  const marks = ['blood'];
  if (!fresh || rng.chance(0.3)) marks.push('rot');
  if (rng.chance(0.6)) marks.push('veins');
  if (rng.chance(0.25)) marks.push('stubble');
  return {
    eyes: rng.pick(['round', 'wide', 'narrow', 'sleepy', 'hooded']),
    dead: true,
    brows: rng.pick(['none', 'worried', 'heavy', 'soft', 'straight']),
    browColor: rng.pick(BROW_COLORS),
    mouth: rng.pick(['snarl', 'slack', 'snarl', 'grin']),
    nose: rng.pick(['soft', 'soft', 'wide', 'none']),
    marks,
  };
}

function walker(rng, { riot = false, fresh = false } = {}) {
  const sex = riot ? (rng.chance(0.8) ? 'm' : 'f') : rng.chance(0.5) ? 'm' : 'f';
  const skin = fresh ? deaden(rng.pick(LIVE_SKIN), 0.35) : rng.chance(0.25) ? deaden(rng.pick(LIVE_SKIN), 0.6) : rng.pick(DEAD_SKIN);
  const hairStyle = riot ? 'buzz' : sex === 'm' ? rng.pick(['short', 'short', 'buzz', 'bald']) : rng.pick(['bob', 'bob', 'bob', 'buzz']);
  const look = {
    sex,
    height: rng.range(0.94, 1.05),
    build: rng.range(0.92, 1.1),
    skin,
    hair: { style: hairStyle, color: rng.pick(HAIR) },
    top: { color: riot ? 0x22262a : rng.pick(SHIRT), sleeves: riot ? 'long' : rng.pick(['short', 'short', 'long']) },
    bottoms: { color: riot ? 0x1e2226 : rng.pick(PANTS) },
    shoes: { color: riot ? 0x151515 : rng.pick(SHOES), boots: riot },
    face: deadFace(rng, fresh),
    dead: { blood: rng.range(0.3, 1), rot: fresh ? rng.range(0.05, 0.25) : rng.range(0.35, 0.9), torn: rng.range(0.1, 0.6) },
    gore: true,
    seed: rng.int(1, 99999),
  };
  if (sex === 'f' && rng.chance(0.4)) look.bottoms.legs = rng.pick(PANTS);
  if (riot) {
    // what's left of the Living Guard: plate carrier, helmet, gloves
    look.gloves = 0x151515;
    look.bottoms.legs = 0x1e2226;
    look.gear = ['helmet', 'vest'];
    look.gearColor = { helmet: 0x16181b, vest: 0x2a2f34, patch: 0x9a1e18 };
  }
  return look;
}

function soldier(rng) {
  const sex = rng.chance(0.72) ? 'm' : 'f';
  const marks = [];
  if (sex === 'm' && rng.chance(0.5)) marks.push('stubble');
  if (rng.chance(0.15)) marks.push('scar');
  return {
    sex,
    height: rng.range(0.97, 1.05),
    build: sex === 'm' ? rng.range(1, 1.1) : rng.range(0.95, 1.03),
    skin: rng.pick(LIVE_SKIN),
    hair: { style: sex === 'm' ? 'buzz' : 'bald', color: rng.pick(HAIR.slice(0, 5)) },
    top: { color: 0x3a4048, sleeves: 'long' },
    bottoms: { color: 0x2e3338, legs: 0x2e3338 },
    shoes: { color: 0x1a1a1a, boots: true },
    gloves: 0x1a1a1a,
    gear: ['helmet', 'vest'],
    gearColor: { helmet: 0x1f2328, vest: 0x3d444a, patch: 0x9a1e18 },
    face: {
      eyes: rng.pick(['narrow', 'almond', 'hooded', 'round']),
      iris: rng.pick(['#2a1a10', '#3a2a1e', '#3a5a6a', '#4a5a3a']),
      brows: rng.pick(['heavy', 'straight', 'thick', 'angry']),
      browColor: rng.pick(BROW_COLORS.slice(0, 4)),
      mouth: rng.pick(['flat', 'flat', 'frown']),
      marks,
    },
    seed: rng.int(1, 99999),
  };
}

const pools = {};
function pool(kind, n, make) {
  if (!pools[kind]) {
    const rng = new RNG(0x5eed + kind.length * 977);
    pools[kind] = Array.from({ length: n }, () => make(rng));
  }
  return pools[kind];
}

// One of the walker looks. riot: the Guard's own dead; fresh: recently turned.
export function walkerLook(rng, opts = {}) {
  const kind = opts.riot ? 'riot' : opts.fresh ? 'fresh' : 'walker';
  const n = kind === 'walker' ? 28 : kind === 'fresh' ? 10 : 6;
  return rng.pick(pool(kind, n, (r) => walker(r, opts)));
}

export function guardLook(rng) {
  return rng.pick(pool('guard', 10, soldier));
}
