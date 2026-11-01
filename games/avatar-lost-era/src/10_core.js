'use strict';
/* =====================================================================
   AVATAR: LEGENDS OF THE LOST ERA  —  an unofficial fan game
   Single-file A-Frame / WebXR open-world survival RPG.
   Source is split into src/*.js and assembled by build.sh.
   ===================================================================== */
const THREE = AFRAME.THREE;
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches);
const TEST_MODE = /[?&]test=1/.test(location.search);

/* ---------------- math utils ---------------- */
const U = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  smooth(e0, e1, x) { const t = U.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); },
  damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
  angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; },
  dampAng(a, b, k, dt) { return a + U.angDiff(a, b) * (1 - Math.exp(-k * dt)); },
  dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
  rng(seed) { let s = seed >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  hash2(x, z) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; },
  fmt(n) { return Math.round(n).toString(); },
  segDist(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
    const c = U.clamp((wx * vx + wz * vz) / (vx * vx + vz * vz || 1), 0, 1);
    const dx = px - (ax + vx * c), dz = pz - (az + vz * c); return Math.sqrt(dx * dx + dz * dz);
  },
  polyDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, U.segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; },
};
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TMP = { v1: V3(), v2: V3(), v3: V3(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), e: new THREE.Euler(), c: new THREE.Color() };

/* ---------------- simplex noise 2D (seeded) ---------------- */
const Noise = (() => {
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const r = U.rng(7741); const p = new Uint8Array(512); const perm = [];
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function s2(xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0; const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2; const x0 = xin - (i - t), y0 = yin - (j - t); const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2; const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 > 0) { const g = grad[p[ii + p[jj]] & 7]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 > 0) { const g = grad[p[ii + i1 + p[jj + j1]] & 7]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 > 0) { const g = grad[p[ii + 1 + p[jj + 1]] & 7]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2);
  }
  function fbm(x, y, oct = 4) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * s2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
  function ridged(x, y, oct = 4) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(s2(x * f, y * f)); s += a * v * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }
  return { s2, fbm, ridged };
})();

/* =====================================================================
   LORE & DATA
   ===================================================================== */
const ELEMENTS = ['fire', 'air', 'water', 'earth'];          // the Avatar Cycle order
const OPPOSITE = { fire: 'water', water: 'fire', air: 'earth', earth: 'air' };
const EL = {
  fire:  { name: 'Firebending',  short: 'Fire',  glyph: '火', color: '#ff7a2a', hex: 0xff7a2a, teacher: 'the Dragons', people: 'Fire Nation',
           quote: 'Fire is the element of power. Its strength comes from the breath, not the muscles.',
           blurb: 'Drawn from the sun and the breath. Stronger by day, weaker by night. Firebenders carry warmth within them.' },
  air:   { name: 'Airbending',   short: 'Air',   glyph: '气', color: '#f2c14e', hex: 0xf2c14e, teacher: 'the Sky Bison', people: 'Air Nomads',
           quote: 'Air is the element of freedom. The path of least resistance is the path of the wind.',
           blurb: 'Evasive and circular. Airbenders move lightly, fall softly, and push rather than break.' },
  water: { name: 'Waterbending', short: 'Water', glyph: '水', color: '#3fa9e0', hex: 0x3fa9e0, teacher: 'the Moon', people: 'Water Tribes',
           quote: 'Water is the element of change. It pushes, it pulls, and it never stops adapting.',
           blurb: 'Needs a source of water. Strongest under the moon. Waterbenders alone can heal with their element.' },
  earth: { name: 'Earthbending', short: 'Earth', glyph: '土', color: '#6fae3f', hex: 0x6fae3f, teacher: 'the Badgermoles', people: 'Earth Kingdom',
           quote: 'Earth is the element of substance. Wait, and listen, and strike when the moment is right.',
           blurb: 'Rooted and patient. Earthbenders must stay in contact with the ground — no earthbending in mid-air.' },
};
function affinity(native, el) { if (el === native) return 'native'; if (OPPOSITE[native] === el) return 'opposite'; return 'adjacent'; }
const AFF_MULT = { native: 1, adjacent: 1.5, opposite: 2.5 };

// Previous Avatars (invented for this lost era). The predecessor is always the previous element in the cycle.
const PAST_AVATARS = {
  fire:  { name: 'Kazan',   desc: 'a Fire Nation Avatar who mediated the Feud of the Nine Isles' },
  air:   { name: 'Tenpa',   desc: 'an Air Nomad Avatar who wandered the Earth Kingdom on sky bison back' },
  water: { name: 'Siku',    desc: 'a Southern Water Tribe Avatar who sailed farther than any before her' },
  earth: { name: 'Guo-Lin', desc: 'an Earth Kingdom Avatar who built the first roads between the walled cities' },
};
function prevElement(el) { const i = ELEMENTS.indexOf(el); return ELEMENTS[(i + 3) % 4]; }
function nextElement(el) { const i = ELEMENTS.indexOf(el); return ELEMENTS[(i + 1) % 4]; }

const NATIONS = {
  water: {
    name: 'Water Tribe', glyph: '水', element: 'water',
    homes: {
      north: { name: 'Northern Water Tribe', perk: 'Moon-blessed: Healing Waters cost 25% less chi.', bonus: { healCost: 0.75 },
               reveal: 'Under the full moon, the elders of the Northern Water Tribe saw the spirit of the Ocean stir in you — and the Moon Spirit answered.' },
      south: { name: 'Southern Water Tribe', perk: 'Child of the ice: you lose warmth 35% slower.', bonus: { coldResist: 0.65 },
               reveal: 'The tribe\'s elders tested you with the relics of Avatar Siku. You reached, without hesitation, for her whalebone knife and her old sealskin map.' },
    },
    skins: ['#a8714a', '#8d5a36', '#b98058', '#6e4428'], hairColors: ['#1b120c', '#2a1a10', '#3b2618'], eyes: ['#3a8fd0', '#2a6ea8', '#4aa7d9', '#5a3a22'],
    outfits: [['#2f5f9e', '#e8eef5', '#1f3d66'], ['#3a6f8f', '#f2f2ea', '#24485e'], ['#2b4b7a', '#d9c9a5', '#162d4f']],
    hairStyles: ['wolftail', 'braids', 'loopies', 'long', 'short'],
  },
  earth: {
    name: 'Earth Kingdom', glyph: '土', element: 'earth',
    homes: {
      basingse: { name: 'Ba Sing Se', perk: 'Walled-city discipline: Earth Wall lasts twice as long.', bonus: { wallTime: 2 },
                  reveal: 'In the Upper Ring, the Earth Sages laid out a thousand toys. You chose four — the very four Avatar Guo-Lin once owned.' },
      omashu:   { name: 'Omashu', perk: 'City of Oma and Shu: earthbending deals 10% more damage.', bonus: { earthDmg: 1.1 },
                  reveal: 'The sages of Omashu, city of the two lovers, found the Avatar\'s mark on you — the stones of the mail chutes would not stop trembling.' },
      rural:    { name: 'Farmlands of the West', perk: 'Farmer\'s hands: gather twice the wood and stone.', bonus: { gather: 2 },
                  reveal: 'A wandering Earth Sage came to your farm on your sixteenth birthday, carrying the relics of Avatar Guo-Lin. You knew them on sight.' },
    },
    skins: ['#e1b892', '#c99a72', '#b5835c', '#f0cba6'], hairColors: ['#1b120c', '#2b1d12', '#4a3020'], eyes: ['#3d7a3a', '#5a3a22', '#2f2416', '#6a8a3a'],
    outfits: [['#4f7a3a', '#d8c79a', '#2f4a22'], ['#6b8f3e', '#e5d6ad', '#3b5222'], ['#7a6a3a', '#cfc08f', '#4a3f1f']],
    hairStyles: ['bun', 'long', 'short', 'braids', 'topknot'],
  },
  fire: {
    name: 'Fire Nation', glyph: '火', element: 'fire',
    homes: {
      capital:  { name: 'Caldera Capital', perk: 'Royal training: firebending deals 10% more damage.', bonus: { fireDmg: 1.1 },
                  reveal: 'On the morning of your sixteenth birthday, the Fire Sages came to your door in their tall red headpieces and bowed. "Avatar," they said.' },
      ember:    { name: 'Outer Islands', perk: 'Island-born: your chi recovers 15% faster in sunlight.', bonus: { sunChi: 1.15 },
                  reveal: 'The Fire Sages sailed to your fishing island with the relics of Avatar Kazan. The temple flame flared white as you entered.' },
    },
    skins: ['#f2d3b0', '#e6c09a', '#d9ad84', '#f7dfc4'], hairColors: ['#111111', '#1b120c', '#2a1810'], eyes: ['#c98a1a', '#d9a441', '#8a5a1a', '#5a3a22'],
    outfits: [['#9e2a1e', '#2a1a14', '#d9a441'], ['#7a1f16', '#3a2a22', '#e0b050'], ['#b8402a', '#1e1410', '#c99a3a']],
    hairStyles: ['topknot', 'long', 'bun', 'short', 'braids'],
  },
  air: {
    name: 'Air Nomads', glyph: '气', element: 'air',
    homes: {
      southern: { name: 'Southern Air Temple', perk: 'Light-footed: stamina drains 30% slower.', bonus: { stamDrain: 0.7 },
                  reveal: 'The monks scattered thousands of toys before you. You chose four — the very relics Avatar Tenpa had carried. The bison groaned in recognition.' },
      western:  { name: 'Western Air Temple', perk: 'Cliff-dweller: no fall damage and airbending costs 10% less chi.', bonus: { airCost: 0.9 },
                  reveal: 'The nuns of the Western Air Temple tested you with Avatar Tenpa\'s relics. The wind chimes across the cliffs rang without wind.' },
      eastern:  { name: 'Eastern Air Temple', perk: 'Meditative: meditation restores chi 30% faster.', bonus: { medChi: 1.3 },
                  reveal: 'The Eastern Temple\'s abbess saw your aura in meditation and laid out the test of a thousand toys. You chose without thinking.' },
      northern: { name: 'Northern Air Temple', perk: 'Wind-rider: Air Jump launches you 20% higher.', bonus: { airJump: 1.2 },
                  reveal: 'High on the Northern Temple\'s spires, the elders presented the relics of Avatar Tenpa. You reached for his worn wooden flute.' },
    },
    skins: ['#e8c39a', '#d4a77c', '#c08f62', '#f3d6b5'], hairColors: ['#1b120c', '#3a2a1a', '#5a4030', '#111111'], eyes: ['#5a8fa8', '#7a5a2a', '#3a2a1a', '#8a9aa8'],
    outfits: [['#e0912e', '#f2c14e', '#8a3a1a'], ['#d9772a', '#e8b84a', '#7a2a12'], ['#c96a2a', '#ffd27a', '#6a2e12']],
    hairStyles: ['shaved', 'long', 'bun', 'short', 'braids'],
  },
};
const BACKGROUNDS = {
  hunter:  { name: 'Hunter',  desc: 'You grew up tracking game. Harvest more meat; prey notices you later.', items: { meat_cooked: 2 }, perk: { meat: 1.5, stealth: 0.75 } },
  monk:    { name: 'Spiritual', desc: 'Raised among sages and monks. Meditation and trials of the spirit come easier.', items: { berries: 4 }, perk: { meditate: 1.25 } },
  fisher:  { name: 'Fisher',  desc: 'Born by the water. Your waterskin holds more and fish never escape your hands.', items: { fish_cooked: 2 }, perk: { skin: 2 } },
  noble:   { name: 'Noble',   desc: 'You had tutors and a full purse. Begin with copper and a sturdier body.', items: { copper: 40 }, perk: { hp: 15 } },
};

/* ---------------- techniques ----------------
 trial: { stat, n, desc } — progress stat compared to n (scaled by affinity multiplier for non-native elements)
 kind: 'proj' | 'melee' | 'self' | 'aoe' | 'util' | 'passive'
------------------------------------------------ */
const TECH = {
  // ===== FIRE =====
  fire_jab:   { el: 'fire', tier: 1, name: 'Fire Jab', glyph: '拳', sp: 1, chi: 6, cd: 0.32, kind: 'proj', dmg: 12, root: true,
                desc: 'A fast punch that launches a dart of flame. Burns targets.', quote: 'Breathe in. Let the fire ride the breath, not the muscles.',
                trial: { stat: 'meditate_time', n: 20, desc: 'Meditate for 20 seconds to learn breath control.' } },
  spark:      { el: 'fire', tier: 1, name: 'Hearth Flame', glyph: '炎', sp: 1, chi: 10, cd: 1.0, kind: 'util', root: true,
                desc: 'Survival. Kindle a campfire instantly, or cook raw food held in your hands. Never burn the food — control is everything.', quote: 'A flame that can cook a meal is a flame under control.',
                trial: { stat: 'cooked', n: 1, desc: 'Cook one meal by any means.' } },
  fire_blast: { el: 'fire', tier: 2, name: 'Twin Fire Blast', glyph: '爆', sp: 2, chi: 18, cd: 1.1, kind: 'proj', dmg: 10, req: ['fire_jab'],
                desc: 'Alternating fists hurl three blasts of fire in rapid succession.', quote: 'Power in firebending comes from the breath.',
                trial: { stat: 'hits_fire', n: 20, desc: 'Strike targets with firebending 20 times.' } },
  fire_arc:   { el: 'fire', tier: 2, name: 'Flame Arc Kick', glyph: '弧', sp: 2, chi: 22, cd: 2.0, kind: 'melee', dmg: 22, req: ['fire_blast'],
                desc: 'A spinning kick that sweeps a crescent of fire around you, scattering nearby foes.', quote: 'Fire is life, not just destruction — but it can burn a wide path.',
                trial: { stat: 'kills_fire', n: 4, desc: 'Defeat 4 creatures or foes with firebending.' } },
  breath_fire:{ el: 'fire', tier: 2, name: 'Breath of Fire', glyph: '息', sp: 2, chi: 24, cd: 4.0, kind: 'aoe', dmg: 9, req: ['spark'],
                desc: 'Exhale a roaring cone of flame. Also warms you to the bone.', quote: 'The breath of fire. A technique to keep warm in the coldest places.',
                trial: { stat: 'sunrise_med', n: 15, desc: 'Meditate at sunrise (5:00–8:00) for 15 seconds — greet the sun that fuels you.' } },
  inner_fire: { el: 'fire', tier: 3, name: 'Inner Fire', glyph: '心', sp: 3, kind: 'passive', req: ['breath_fire'],
                desc: 'Passive. Your body generates its own heat: you no longer lose warmth, and chi recovers faster in sunlight.', quote: 'Draw heat from within, as the sun does.',
                trial: { stat: 'cold_time', n: 45, desc: 'Endure 45 seconds of bitter cold (snowy peaks or freezing night) without fleeing it.' } },
  lightning:  { el: 'fire', tier: 4, name: 'Lightning Generation', glyph: '雷', late: true, req: ['inner_fire'], desc: 'Separate the energies of yin and yang… Later in your journey.' },
  dancing_dragon: { el: 'fire', tier: 4, name: 'Dancing Dragon', glyph: '龍', late: true, req: ['fire_arc'], desc: 'The ancient form of the Sun Warriors, taught by the masters themselves. Later in your journey.' },

  // ===== EARTH =====
  rock_toss:  { el: 'earth', tier: 1, name: 'Rock Toss', glyph: '石', sp: 1, chi: 10, cd: 0.75, kind: 'proj', dmg: 24, root: true, grounded: true,
                desc: 'Stomp to raise a boulder from the earth, then punch it at your foe.', quote: 'Rock is a stubborn element. You must be stubborn too.',
                trial: { stat: 'stones', n: 5, desc: 'Gather 5 stone with your hands to learn the feel of earth.' } },
  earth_wall: { el: 'earth', tier: 1, name: 'Earth Wall', glyph: '牆', sp: 1, chi: 15, cd: 3.0, kind: 'util', root: true, grounded: true,
                desc: 'Raise a wall of solid stone. Blocks attacks and charging beasts.', quote: 'Neutral jing: wait, and listen.',
                trial: { stat: 'hits_taken', n: 5, desc: 'Endure 5 blows — learn what it means to stand your ground.' } },
  earth_pillar:{ el: 'earth', tier: 2, name: 'Pillar Launch', glyph: '柱', sp: 2, chi: 14, cd: 2.0, kind: 'self', grounded: true, req: ['rock_toss'],
                desc: 'Drive a pillar of earth up beneath your feet to vault onto cliffs, or under an enemy to hurl it skyward.', quote: 'The earth will lift those who are rooted in it.',
                trial: { stat: 'blocked_earth', n: 6, desc: 'Block 6 attacks with Earth Wall.' } },
  rock_shelter:{ el: 'earth', tier: 2, name: 'Earth Tent', glyph: '庇', sp: 2, chi: 30, cd: 8.0, kind: 'util', grounded: true, req: ['earth_wall'],
                desc: 'Survival. Raise a sealed stone shelter around you. Rest safely through the night, stay warm, and keep predators out.', quote: 'Why sleep on the earth when you can sleep inside it?',
                trial: { stat: 'nights', n: 1, desc: 'Survive a full night in the wild — learn what shelter is worth.' } },
  shockwave:  { el: 'earth', tier: 2, name: 'Earth Shockwave', glyph: '震', sp: 2, chi: 25, cd: 4.0, kind: 'aoe', dmg: 20, grounded: true, req: ['earth_pillar'],
                desc: 'A mighty stomp sends a ring of jagged stone through the ground around you.', quote: 'Strike when the moment is right — and strike with the whole mountain.',
                trial: { stat: 'kills_earth', n: 4, desc: 'Defeat 4 creatures or foes with earthbending.' } },
  badger_stance:{ el: 'earth', tier: 3, name: 'Badgermole Stance', glyph: '獾', sp: 3, kind: 'passive', req: ['rock_shelter'],
                desc: 'Passive. While standing still on solid ground you regenerate health and chi, and take 20% less damage.', quote: 'The badgermoles do not fight the earth. They listen to it.',
                trial: { stat: 'cave_med', n: 25, desc: 'Meditate for 25 seconds inside the Badgermole Cave.' } },
  seismic:    { el: 'earth', tier: 4, name: 'Seismic Sense', glyph: '聽', late: true, req: ['badger_stance'], desc: 'Feel every footstep through the earth, as the badgermoles do. Later in your journey.' },
  metal:      { el: 'earth', tier: 4, name: '??? (Unknown to this Era)', glyph: '金', late: true, req: ['shockwave'], desc: 'No earthbender of this age believes metal can be bent. Perhaps none ever will… for a few thousand years.' },

  // ===== WATER =====
  water_whip: { el: 'water', tier: 1, name: 'Water Whip', glyph: '鞭', sp: 1, chi: 8, cd: 0.55, kind: 'melee', dmg: 15, root: true, water: true,
                desc: 'Lash out with a whip of water from your skin or a nearby source.', quote: 'Push and pull — like the tides beneath the moon.',
                trial: { stat: 'drinks', n: 2, desc: 'Drink from a river or lake twice. Know your element.' } },
  water_draw: { el: 'water', tier: 1, name: 'Draw Water', glyph: '汲', sp: 1, chi: 4, cd: 0.8, kind: 'util', root: true,
                desc: 'Survival. Pull water from a nearby source to refill your waterskin and drink — or, if you are skilled, pluck a fish right out of the water.', quote: 'Water is everywhere, if you know how to ask.',
                trial: { stat: 'swim_time', n: 10, desc: 'Spend 10 seconds in the water.' } },
  ice_darts:  { el: 'water', tier: 2, name: 'Ice Darts', glyph: '冰', sp: 2, chi: 14, cd: 1.0, kind: 'proj', dmg: 9, water: true, req: ['water_whip'],
                desc: 'Freeze water mid-flight into three razor shards. Slows targets.', quote: 'Water can be soft. It can also be ice.',
                trial: { stat: 'hits_water', n: 18, desc: 'Strike targets with waterbending 18 times.' } },
  healing:    { el: 'water', tier: 2, name: 'Healing Waters', glyph: '癒', sp: 2, chi: 30, cd: 10, kind: 'self', water: true, req: ['water_draw'],
                desc: 'Water glows around your hands and mends your wounds. A rare gift among benders.', quote: 'Healing is the gift of the Moon to those who listen.',
                trial: { stat: 'moon_med', n: 20, desc: 'Meditate at the Moon Pool Shrine at night (20:00–4:00) for 20 seconds.' } },
  tidal_push: { el: 'water', tier: 2, name: 'Tidal Push', glyph: '浪', sp: 2, chi: 22, cd: 3.0, kind: 'aoe', dmg: 14, water: true, req: ['ice_darts'],
                desc: 'Sweep a curling wave forward that knocks everything aside. Far stronger beside open water.', quote: 'Water does not resist. It flows around — and then it overwhelms.',
                trial: { stat: 'knock_water', n: 8, desc: 'Knock back foes with waterbending 8 times.' } },
  ice_prison: { el: 'water', tier: 3, name: 'Ice Prison', glyph: '凍', sp: 3, chi: 18, cd: 5.0, kind: 'proj', dmg: 6, water: true, req: ['tidal_push'],
                desc: 'Encase a target\'s legs in ice, freezing it in place for several seconds.', quote: 'Stillness is also a form of water.',
                trial: { stat: 'kills_water', n: 4, desc: 'Defeat 4 creatures or foes with waterbending.' } },
  octopus:    { el: 'water', tier: 4, name: 'Octopus Form', glyph: '章', late: true, req: ['ice_prison'], desc: 'Eight arms of water to defend from every side. Later in your journey.' },
  blood:      { el: 'water', tier: 4, name: 'Forbidden', glyph: '血', late: true, req: ['healing'], desc: 'Some knowledge should stay buried. Not in this life.' },

  // ===== AIR =====
  air_palm:   { el: 'air', tier: 1, name: 'Air Palm', glyph: '掌', sp: 1, chi: 5, cd: 0.32, kind: 'proj', dmg: 8, root: true,
                desc: 'A palm strike that fires a spinning ball of air. Light damage, heavy knockback.', quote: 'Air is the element of freedom.',
                trial: { stat: 'jumps', n: 20, desc: 'Jump 20 times. Feel the air hold you.' } },
  air_jump:   { el: 'air', tier: 1, name: 'Air Leap', glyph: '躍', sp: 1, chi: 8, cd: 0.6, kind: 'self', root: true,
                desc: 'Survival. A burst of wind launches you high into the air — even a second time mid-jump. Airbenders also take no fall damage.', quote: 'Let go of your earthly tether.',
                trial: { stat: 'falls', n: 2, desc: 'Fall from a great height twice (and live).' } },
  wind_step:  { el: 'air', tier: 2, name: 'Wind Step', glyph: '步', sp: 2, chi: 10, cd: 1.4, kind: 'self', req: ['air_jump'],
                desc: 'Dash on a gust of wind, slipping past attacks. Grants a moment of untouchability.', quote: 'Be the leaf. Go where the wind takes you.',
                trial: { stat: 'distance', n: 1500, desc: 'Travel 1,500 meters on foot. Airbenders are wanderers.' } },
  air_sweep:  { el: 'air', tier: 2, name: 'Air Sweep', glyph: '掃', sp: 2, chi: 18, cd: 3.0, kind: 'aoe', dmg: 10, req: ['air_palm'],
                desc: 'A wide circular gust that bowls over every foe in front of you.', quote: 'Circles. Always circles.',
                trial: { stat: 'knock_air', n: 15, desc: 'Knock back foes with airbending 15 times.' } },
  air_shield: { el: 'air', tier: 3, name: 'Air Swirl', glyph: '旋', sp: 3, chi: 20, cd: 7.0, kind: 'self', req: ['air_sweep'],
                desc: 'Surround yourself with a whirling sphere of wind that deflects projectiles and hurls back anything that gets close.', quote: 'The sky bison do not fight the storm. They ride it.',
                trial: { stat: 'peak_med', n: 20, desc: 'Meditate for 20 seconds atop Sky Bison Peak.' } },
  glider:     { el: 'air', tier: 4, name: 'Glider Flight', glyph: '翔', late: true, req: ['wind_step'], desc: 'Requires a glider staff, crafted by the Air Nomads. Later in your journey.' },
  scooter:    { el: 'air', tier: 4, name: '??? (Unknown to this Era)', glyph: '球', late: true, req: ['air_shield'], desc: 'A technique no airbender has yet imagined. Perhaps a playful monk will invent it someday.' },

  // ===== AVATAR / SPIRIT =====
  meditation: { el: 'avatar', tier: 1, name: 'Meditation', glyph: '禪', root: true, kind: 'util', desc: 'Sit and breathe. Rapidly restores chi and slowly restores health. Many trials are meditations.', quote: 'Let go of what weighs on you.' },
  awaken_fire:  { el: 'avatar', tier: 2, name: 'Awaken Fire', glyph: '火', sp: 2, awaken: 'fire', kind: 'util', req: ['meditation'],
                  desc: 'Learn firebending as the first firebenders did — from the fire that never dies.', quote: 'The Sun Warriors kept a flame burning for thousands of years.',
                  trial: { stat: 'flame_med', n: 20, desc: 'Meditate for 20 seconds before the Eternal Flame at the Sun Warrior Ruins, during the day.' } },
  awaken_air:   { el: 'avatar', tier: 2, name: 'Awaken Air', glyph: '气', sp: 2, awaken: 'air', kind: 'util', req: ['meditation'],
                  desc: 'Learn airbending as the first airbenders did — by watching the sky bison ride the wind.', quote: 'The first airbenders learned from the sky bison.',
                  trial: { stat: 'peak_med', n: 20, desc: 'Meditate for 20 seconds atop Sky Bison Peak, among the bison.' } },
  awaken_water: { el: 'avatar', tier: 2, name: 'Awaken Water', glyph: '水', sp: 2, awaken: 'water', kind: 'util', req: ['meditation'],
                  desc: 'Learn waterbending as the first waterbenders did — from the Moon\'s push and pull on the tides.', quote: 'The Moon was the first waterbender.',
                  trial: { stat: 'moon_med', n: 20, desc: 'Meditate for 20 seconds at the Moon Pool Shrine at night (20:00–4:00).' } },
  awaken_earth: { el: 'avatar', tier: 2, name: 'Awaken Earth', glyph: '土', sp: 2, awaken: 'earth', kind: 'util', req: ['meditation'],
                  desc: 'Learn earthbending as the first earthbenders did — from the blind badgermoles who listen to the earth.', quote: 'The badgermoles do not see. They listen.',
                  trial: { stat: 'cave_med', n: 25, desc: 'Meditate for 25 seconds beside the badgermole in its cave.' } },
  spirit_sense: { el: 'avatar', tier: 2, name: 'Spirit Sense', glyph: '靈', sp: 1, kind: 'passive', req: ['meditation'],
                  desc: 'Passive. Living creatures appear on your minimap, and you sense danger before it strikes.', quote: 'The Avatar is the bridge between our world and the spirit world.',
                  trial: { stat: 'meditate_time', n: 90, desc: 'Meditate for a total of 90 seconds.' } },
  avatar_state: { el: 'avatar', tier: 4, name: 'Avatar State', glyph: '神', late: true, req: ['spirit_sense'], desc: 'The combined power of every Avatar before you. Your past lives are not ready to answer… yet.' },
  energy:       { el: 'avatar', tier: 4, name: 'Energybending', glyph: '能', late: true, req: ['avatar_state'], desc: 'Before the elements, there was energy. Only the lion turtles remember.' },
};
// Skill tree layout (percent positions within the tree view)
const TREE_POS = {
  fire_jab: [28, 82], spark: [72, 82], fire_blast: [28, 56], breath_fire: [72, 56], fire_arc: [28, 30], inner_fire: [72, 30], dancing_dragon: [28, 8], lightning: [72, 8],
  rock_toss: [28, 82], earth_wall: [72, 82], earth_pillar: [28, 56], rock_shelter: [72, 56], shockwave: [28, 30], badger_stance: [72, 30], metal: [28, 8], seismic: [72, 8],
  water_whip: [28, 82], water_draw: [72, 82], ice_darts: [28, 56], healing: [72, 56], tidal_push: [28, 30], ice_prison: [50, 12], octopus: [16, 10], blood: [84, 30],
  air_palm: [28, 82], air_jump: [72, 82], air_sweep: [28, 56], wind_step: [72, 56], air_shield: [28, 30], glider: [72, 30], scooter: [28, 8],
  meditation: [50, 84], awaken_fire: [16, 56], awaken_air: [38, 56], awaken_water: [62, 56], awaken_earth: [84, 56], spirit_sense: [50, 32], avatar_state: [50, 12], energy: [80, 12],
};
const STARTING = { fire: ['fire_jab', 'spark'], earth: ['rock_toss', 'earth_wall'], water: ['water_whip', 'water_draw'], air: ['air_palm', 'air_jump'] };

/* ---------------- items ---------------- */
const ITEMS = {
  meat_raw:    { name: 'Raw Meat', glyph: '肉', desc: 'Must be cooked. Eating it raw may make you sick.', food: 8, raw: true, cooksTo: 'meat_cooked', meat: true, value: 3 },
  meat_cooked: { name: 'Roast Meat', glyph: '烤', desc: 'Hearty and warm. Restores a lot of hunger.', food: 38, heal: 6, meat: true, value: 8 },
  fish_raw:    { name: 'Raw Fish', glyph: '魚', desc: 'Fresh from the water. Cook it first.', food: 6, raw: true, cooksTo: 'fish_cooked', meat: true, value: 3 },
  fish_cooked: { name: 'Grilled Fish', glyph: '燒', desc: 'Flaky and good. Restores hunger and a little thirst.', food: 28, drink: 6, heal: 4, meat: true, value: 7 },
  berries:     { name: 'Wild Berries', glyph: '莓', desc: 'Tart and juicy.', food: 9, drink: 4, value: 1 },
  cabbage:     { name: 'Cabbage', glyph: '菜', desc: 'A humble, crunchy cabbage. Treat it with respect.', food: 14, drink: 3, value: 2 },
  peach:       { name: 'Moon Peach', glyph: '桃', desc: 'Sweet fruit of the valley orchards.', food: 16, drink: 6, value: 3 },
  herb:        { name: 'Healing Herb', glyph: '草', desc: 'Chew to recover a little health.', heal: 15, food: 2, value: 4 },
  wood:        { name: 'Firewood', glyph: '木', desc: 'Four make a campfire (B).', value: 1 },
  stone:       { name: 'Stone', glyph: '石', desc: 'Useful for building — and for flint sparks.', value: 1 },
  hide:        { name: 'Animal Hide', glyph: '皮', desc: 'Merchants pay well for good hides.', value: 6 },
  copper:      { name: 'Copper Pieces', glyph: '銅', desc: 'Earth Kingdom coin with a square hole in the middle.', value: 1 },
  map_frag:    { name: 'Old Map Fragment', glyph: '圖', desc: 'Torn from a daofei map. It shows a route west, past the Great Divide, to an island marked with a spiral…', value: 0, key: true },
};

/* ---------------- animals ---------------- */
const SPECIES = {
  turtleduck:  { name: 'Turtle-Duck', prey: true, hp: 14, speed: 3.2, size: 0.55, meat: 1, hide: 0, xp: 6, zone: 'shore', count: 9, swim: true, sense: 9 },
  rabbaroo:    { name: 'Rabbaroo', prey: true, hp: 22, speed: 8.5, size: 0.8, meat: 1, hide: 1, xp: 9, zone: 'meadow', count: 10, sense: 15 },
  possumchicken:{ name: 'Possum-Chicken', prey: true, hp: 16, speed: 5.0, size: 0.6, meat: 1, hide: 0, xp: 7, zone: 'forest', count: 9, sense: 11 },
  hogmonkey:   { name: 'Hog-Monkey', prey: true, hp: 40, speed: 6.0, size: 1.0, meat: 2, hide: 1, xp: 14, zone: 'forest', count: 6, sense: 13, fights: true, dmg: 7 },
  ostrichhorse:{ name: 'Ostrich-Horse', prey: true, hp: 70, speed: 11, size: 2.0, meat: 3, hide: 2, xp: 20, zone: 'plains', count: 7, sense: 20, herd: true },
  platypusbear:{ name: 'Platypus-Bear', prey: false, hp: 150, speed: 6.6, size: 1.9, meat: 4, hide: 2, xp: 60, zone: 'river', count: 4, aggro: 18, dmg: 18, reach: 2.6 },
  mooselion:   { name: 'Saber-Tooth Moose-Lion', prey: false, hp: 120, speed: 9.2, size: 1.8, meat: 3, hide: 2, xp: 70, zone: 'highforest', count: 4, aggro: 24, dmg: 20, reach: 2.6 },
  crawler:     { name: 'Canyon Crawler', prey: false, hp: 95, speed: 7.6, size: 1.6, meat: 2, hide: 2, xp: 55, zone: 'crags', count: 6, aggro: 22, dmg: 14, reach: 2.3 },
  skybison:    { name: 'Sky Bison', prey: false, passive: true, hp: 9999, speed: 6, size: 4.2, zone: 'peak', count: 2, fly: true, xp: 0 },
  badgermole:  { name: 'Badgermole', prey: false, passive: true, hp: 9999, speed: 1.5, size: 3.0, zone: 'cave', count: 1, xp: 0 },
};
const BESTIARY = {
  turtleduck: 'Gentle waterfowl with a turtle\'s shell. Found on lakes and slow rivers. Easy prey, but they dive when startled.',
  rabbaroo: 'A rabbit with the powerful legs of a kangaroo. Extremely fast — ambush them or strike from range.',
  possumchicken: 'Hangs from branches by its tail when it sleeps. A common meal for travelers in the Earth Kingdom.',
  hogmonkey: 'Noisy, clever, and stubborn. Hog-monkeys will fight back if cornered.',
  ostrichhorse: 'Tall, flightless steeds of the Earth Kingdom. Wild herds roam the eastern plains. Taming one is a tale for another day.',
  platypusbear: 'A bear with a duck\'s bill and a beaver\'s tail. Lays eggs, and defends them fiercely. Do not wander near rivers carelessly.',
  mooselion: 'An apex predator of the Earth Kingdom forests, with saber fangs and a crown of antlers. Fast, and relentless.',
  crawler: 'Many-legged reptiles of the canyons, hunting in loose packs. The Great Divide is said to be full of them.',
  skybison: 'The first airbenders. Six-legged, gentle, and wise. Wild herds still graze on the highest peaks.',
  badgermole: 'The first earthbenders. Blind giants who feel the world through the earth. They tunnel through mountains as if through water.',
};

/* ---------------- locations ---------------- */
const LOC = {
  village:   { x: 0, z: 0, r: 46, name: 'Tienhai Village', glyph: '村', color: '#ffd27a' },
  banyan:    { x: -46, z: 52, r: 18, name: 'The Elder Banyan', glyph: '樹', color: '#9fd68a' },
  pagoda:    { x: 82, z: -78, r: 14, name: 'Lookout Pagoda', glyph: '塔', color: '#ff9b52' },
  moonpool:  { x: -40, z: 102, r: 10, name: 'Moon Pool Shrine', glyph: '月', color: '#bfe7ff' },
  lake:      { x: -80, z: 140, r: 40, name: 'Lake Yue', glyph: '湖', color: '#3fa9e0' },
  sunruins:  { x: -205, z: -25, r: 30, name: 'Sun Warrior Ruins', glyph: '日', color: '#ff7a2a' },
  bisonpeak: { x: 25, z: -225, r: 22, name: 'Sky Bison Peak', glyph: '峰', color: '#f2c14e' },
  badgercave:{ x: 168, z: -118, r: 14, name: 'Badgermole Cave', glyph: '洞', color: '#6fae3f' },
  daofei:    { x: 145, z: 32, r: 22, name: 'Daofei Camp', glyph: '匪', color: '#ff6a55' },
  pillars:   { x: -170, z: 175, r: 45, name: 'Misty Pillars', glyph: '霧', color: '#9fd6c8' },
  shore:     { x: 226, z: 70, r: 30, name: 'Eastern Shore', glyph: '岸', color: '#e8d6aa' },
  crags:     { x: -215, z: -110, r: 60, name: 'Ember Crags', glyph: '岩', color: '#c8553a' },
};
const ROADS = [
  [[-14, 260], [-20, 150], [-30, 80], [-10, 30], [0, 0]],          // south road (arrival)
  [[0, 0], [60, 18], [145, 32], [229, 62]],                         // east road past the daofei, down to the beach
  [[0, 0], [-60, -10], [-130, -20], [-181, -25]],                   // west road to the ruins (ends at the pillar ring's gap)
  [[0, 0], [30, -40], [46, -53]],                                   // to the pagoda hill
  [[-16, 45], [-28, 72], [-40, 95]],                                 // to the moon pool shrine, branching off the south road past the gate
  [[60, 18], [120, -60], [165, -105]],                              // to the badgermole cave
  [[30, -40], [20, -120], [25, -170]],                              // north toward the peak trail
];
const RIVER = [[-50, 140], [-5, 152], [45, 140], [95, 116], [150, 98], [205, 92], [270, 96]];
