// Five things that say what a survivor is good for, 1 to 10:
//   Fighting   – up close: how hard and how fast they swing
//   Shooting   – how true their shots go, and how hard they land
//   Endurance  – health, wind, and how long before they're spent out there
//   Scavenging – how fast they search and what they turn up
//   Charm      – talking people round: recruiting, calming fights, morale
// Your people start where their past and their nature put them; the
// leader's come from the survivor screen. They grow with use: fights,
// shots that land, miles walked, searches, talking people round.
import { traitMods } from './survivor.js';

export const STATS = [
  { id: 'fight', name: 'Fighting', short: 'FGT', desc: 'Melee damage and swing speed; holding off a crowd up close.' },
  { id: 'shoot', name: 'Shooting', short: 'SHT', desc: 'How true shots go and how hard they land.' },
  { id: 'endure', name: 'Endurance', short: 'END', desc: 'Health and stamina, and how slowly they tire out in the world.' },
  { id: 'scav', name: 'Scavenging', short: 'SCV', desc: 'Search speed, what turns up, and what a run brings home.' },
  { id: 'charm', name: 'Charm', short: 'CHA', desc: 'Recruiting, talking strangers round, keeping spirits up.' },
];
export const STAT_IDS = STATS.map((s) => s.id);
export const STAT_MAX = 10;

const clamp = (v) => Math.max(1, Math.min(STAT_MAX, Math.round(v)));
// a fixed little random spread per person, so they don't all come out alike
function jitter(seed, k) { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; }

// stats for someone who doesn't have them yet: from their past (skills
// 0..3) and their nature
export function deriveStats(person, bg, pers) {
  const s = (bg && bg.skills) || {}, t = (pers && pers.t) || {}, seed = person.seed || 1;
  const age = person.age || 35;
  const physical = (s.farming || 0) + (s.building || 0) + (s.mechanics || 0);
  return {
    fight: clamp(2.6 + (s.combat || 0) * 1.6 + (t.bravery ?? 0.5) * 2 + (t.temper ?? 0.3) * 0.8 + jitter(seed, 1) * 2),
    shoot: clamp(2.4 + (s.shooting || 0) * 1.9 + (t.discipline ?? 0.5) * 1.6 + jitter(seed, 2) * 2),
    endure: clamp(4 + physical * 0.55 + (age < 32 ? 1 : age > 55 ? -1.3 : 0) + (1 - (t.anxiety ?? 0.3)) * 0.8 + jitter(seed, 3) * 2),
    scav: clamp(2.8 + (s.scavenging || 0) * 1.8 + (s.stealth || 0) * 0.6 + (t.greed ?? 0.2) * 0.8 + jitter(seed, 4) * 2),
    charm: clamp(2.2 + (s.leadership || 0) * 1.2 + (t.warmth ?? 0.5) * 2.2 + (t.humor ?? 0.4) * 1.2 + (t.social ?? 0.5) * 1.2 - (t.temper ?? 0.3) * 1.2 + jitter(seed, 5) * 2),
  };
}
// traits that were about what the stats now cover (older saves)
export const STAT_TRAITS = ['athletic', 'outofshape', 'tough', 'frail', 'slugger', 'slowhands', 'marksman', 'badeyes', 'scavenger', 'unlucky'];
// stats an older save's leader had in traits, before there were stats
export function statsFromTraits(traits = []) {
  const h = (id) => traits.includes(id);
  return {
    fight: clamp(5 + (h('slugger') ? 2 : 0) - (h('slowhands') ? 1 : 0)),
    shoot: clamp(5 + (h('marksman') ? 2 : 0) - (h('badeyes') ? 2 : 0)),
    endure: clamp(5 + (h('tough') ? 2 : 0) + (h('athletic') ? 1 : 0) - (h('frail') ? 2 : 0) - (h('outofshape') ? 1 : 0)),
    scav: clamp(5 + (h('scavenger') ? 2 : 0) - (h('unlucky') ? 2 : 0)),
    charm: 6,
  };
}

// a 0..3 skill level the older systems read, from a stat
export const statSkill = (v) => Math.max(0, Math.min(3, (v - 2) / 2.4));

// what the stats do, as multipliers the rest of the game reads (5 is
// ordinary; each point either way is a few percent)
export function statEffects(st) {
  const d = (k) => (st[k] ?? 5) - 5;
  return {
    melee: 1 + d('fight') * 0.07, swing: 1 - d('fight') * 0.035, knockdown: 1 + d('fight') * 0.12,
    gun: 1 + d('shoot') * 0.05, spread: Math.max(0.35, 1 - d('shoot') * 0.09),
    health: 100 + d('endure') * 5, stamina: 1 + d('endure') * 0.05, tire: Math.max(0.45, 1 - d('endure') * 0.1),
    search: Math.max(0.5, 1 - d('scav') * 0.07), loot: 1 + d('scav') * 0.07,
    charm: (st.charm ?? 5) / 10,
  };
}

// everything a body brings to how you play them: the leader's traits, then
// anyone's stats and role know-how
export function bodyMods(b, profile) {
  const base = b.leader ? traitMods((profile && profile.traits) || []) : {
    maxHealth: 100, maxStamina: 100, sprint: 6.0, staminaRegen: 1, melee: 1, knockdown: 1, swing: 1, gun: 1, spread: 1,
    search: 1, loot: 1, noise: 1 - b.skill('stealth') * 0.15, build: 1 - b.skill('building') * 0.08, heal: 1 + b.skill('medicine') * 0.2, nightSight: 1,
  };
  const e = statEffects(b.stats || {});
  const m = { ...base };
  m.melee *= e.melee; m.knockdown *= e.knockdown; m.swing *= e.swing;
  m.gun *= e.gun; m.spread *= e.spread;
  m.search *= e.search; m.loot *= e.loot;
  m.maxStamina *= e.stamina; m.sprint *= 1 + ((b.stats && b.stats.endure) - 5 || 0) * 0.015;
  m.maxHealth = Math.round(m.maxHealth - 100 + e.health);
  return m;
}

// ---------------- growing ----------------
// experience to go from level L to L+1
export const xpNeed = (L) => 14 + L * 10;
// a bit of practice. Returns the new level when it goes up.
export function train(b, stat, amount, game) {
  if (!b || !b.stats || !(stat in b.stats) || amount <= 0) return 0;
  const xp = b.xp || (b.xp = {});
  if (b.stats[stat] >= STAT_MAX) return 0;
  xp[stat] = (xp[stat] || 0) + amount;
  const need = xpNeed(b.stats[stat]);
  if (xp[stat] < need) return 0;
  xp[stat] -= need;
  b.stats[stat]++;
  const name = STATS.find((s) => s.id === stat).name;
  if (stat === 'endure' && b.baseHealth != null) { const e = statEffects(b.stats); const was = b.baseHealth; b.baseHealth = e.health; if (b.maxHealth != null) { b.maxHealth += b.baseHealth - was; } }
  if (game) {
    const soc = game.society;
    if (soc) soc.camp.log(`${b.person.name}'s ${name.toLowerCase()} went up to ${b.stats[stat]}.`, 'camp');
    if (game.player.body === b || (soc && soc.playerNear(b.pos, 30))) game.hud.toast(`${b.first}: ${name} ${b.stats[stat]}`, 2.5);
    if (game.player.body === b && game.refreshMods) game.refreshMods();
  }
  return b.stats[stat];
}

// ---------------- the pentagon ----------------
// An SVG radar of the five stats. opts: size, labels (true/false/'short'),
// compare (another stats object drawn as an outline), max
export function radarSVG(st, opts = {}) {
  const size = opts.size || 160, max = opts.max || STAT_MAX, labels = opts.labels ?? true;
  const pad = labels ? (labels === 'short' ? 18 : 48) : 4;
  const c = size / 2, r = c - pad;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / 5; return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v]; };
  const poly = (vals) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
  let h = `<svg class="radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${STATS.map((s) => `${s.name} ${st[s.id] ?? '?'}`).join(', ')}">`;
  // rings and spokes
  for (const k of [0.25, 0.5, 0.75, 1]) h += `<polygon class="rd-ring${k === 1 ? ' outer' : ''}" points="${poly([k, k, k, k, k])}"/>`;
  for (let i = 0; i < 5; i++) { const [x, y] = pt(i, 1); h += `<line class="rd-spoke" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }
  if (opts.compare) h += `<polygon class="rd-compare" points="${poly(STAT_IDS.map((k) => Math.max(0.06, (opts.compare[k] || 0) / max)))}"/>`;
  const vals = STAT_IDS.map((k) => Math.max(0.06, (st[k] || 0) / max));
  h += `<polygon class="rd-fill" points="${poly(vals)}"/>`;
  vals.forEach((v, i) => { const [x, y] = pt(i, v); h += `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size > 100 ? 2.6 : 1.8}"/>`; });
  if (labels) {
    STATS.forEach((s, i) => {
      const [x, y] = pt(i, 1);
      const dx = x - c, dy = y - c, l = Math.hypot(dx, dy) || 1;
      const lx = x + (dx / l) * (labels === 'short' ? 9 : 14), ly = y + (dy / l) * (labels === 'short' ? 9 : 14);
      const anchor = Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end';
      if (labels === 'short') h += `<text class="rd-lab sm" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}">${s.short}</text>`;
      else h += `<text class="rd-lab" x="${lx.toFixed(1)}" y="${(ly - (dy < -4 ? 4 : 0)).toFixed(1)}" text-anchor="${anchor}">${s.name}</text><text class="rd-val" x="${lx.toFixed(1)}" y="${(ly + (dy < -4 ? 8 : 12)).toFixed(1)}" text-anchor="${anchor}">${st[s.id] ?? '?'}</text>`;
    });
  }
  return h + '</svg>';
}
// what someone is best at, in a word or two ("Fighting · Endurance")
export function bestAt(st) {
  const s = STATS.map((x) => [x, st[x.id] || 0]).sort((a, b) => b[1] - a[1]);
  return s[1][1] >= s[0][1] - 1 ? `${s[0][0].name} · ${s[1][0].name}` : s[0][0].name;
}
