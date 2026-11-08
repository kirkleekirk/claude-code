// How worn down a survivor is: fatigue from being out and doing things (the
// leader has the stamina for it; everyone else tires fast), and injuries
// picked up along the way that slow them, weaken them and need time and care
// at camp to heal.

// heal: game hours of rest at camp to mend; hp: max health it takes away
export const INJURIES = {
  sprain: { ouch: 'My ankle!', name: 'Sprained ankle', heal: 10, hp: 5, speed: 0.75, noSprint: true },
  cut: { ouch: 'I’m cut, I’m bleeding!', name: 'Deep cut', heal: 8, hp: 10, bleed: true },
  ribs: { ouch: 'My ribs!', name: 'Cracked ribs', heal: 20, hp: 15, stamina: 0.6 },
  arm: { ouch: 'My arm!', name: 'Hurt arm', heal: 14, hp: 5, melee: 0.65, spread: 1.7 },
  concussion: { ouch: 'My head…', name: 'Concussion', heal: 12, hp: 10, spread: 1.4, speed: 0.9 },
};
const FROM = {
  zombie: [['cut', 4], ['sprain', 2], ['arm', 2], ['ribs', 1.5], ['concussion', 0.5]],
  melee: [['concussion', 2], ['ribs', 2], ['arm', 2], ['cut', 1]],
  shot: [['cut', 3], ['arm', 2], ['ribs', 1.5]],
  fall: [['sprain', 5], ['ribs', 1]],
};

export function maxHealthOf(b) {
  const base = b.baseHealth || 100;
  return Math.max(30, base - (b.injuries || []).reduce((s, i) => s + (INJURIES[i.id] ? INJURIES[i.id].hp : 0), 0));
}
// a hit might leave a lasting injury
export function maybeInjure(b, how, dmg) {
  if (!b.injuries) b.injuries = [];
  const low = b.health < b.maxHealth * 0.5 ? 1.8 : 1;
  const p = { zombie: 0.08, melee: 0.12, shot: 0.3, fall: 0.6 }[how] * low * Math.min(2, Math.max(0.5, dmg / 12));
  if (Math.random() > p) return null;
  const opts = FROM[how].filter(([id]) => !b.injuries.some((i) => i.id === id));
  if (!opts.length) return null;
  let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), id = opts[0][0];
  for (const [k, w] of opts) { r -= w; if (r <= 0) { id = k; break; } }
  b.injuries.push({ id, t: INJURIES[id].heal });
  b.maxHealth = maxHealthOf(b);
  b.health = Math.min(b.health, b.maxHealth);
  return INJURIES[id];
}
// what injuries and fatigue do to someone right now
export function conditionMods(b) {
  const m = { speed: 1, sprint: true, stamina: 1, melee: 1, spread: 1 };
  for (const i of b.injuries || []) {
    const d = INJURIES[i.id];
    if (!d) continue;
    if (d.speed) m.speed *= d.speed;
    if (d.noSprint) m.sprint = false;
    if (d.stamina) m.stamina *= d.stamina;
    if (d.melee) m.melee *= d.melee;
    if (d.spread) m.spread *= d.spread;
  }
  const f = b.fatigue || 0;
  if (f > 60) m.stamina *= 1 - (f - 60) / 100;
  if (f > 85) m.speed *= 0.88;
  if (f >= 100) { m.speed *= 0.75; m.sprint = false; m.spread *= 1.5; m.melee *= 0.6; }
  return m;
}
// how fast being out wears someone down (per real second of activity)
export function fatigueRate(b) { return b.leader ? 0.3 : 1; }
export function addFatigue(b, n) {
  const before = b.fatigue || 0;
  b.fatigue = Math.min(100, before + n * fatigueRate(b));
  return before < 100 && b.fatigue >= 100;
}
export function fatigueWord(f) { return f >= 100 ? 'Exhausted' : f > 85 ? 'Worn out' : f > 60 ? 'Tired' : f > 30 ? 'Rested enough' : 'Fresh'; }
export function exhausted(b) { return (b.fatigue || 0) >= 100; }

// an hour (or part) passes: rest, healing, bleeding
export function tickCondition(b, hrs, ctx) {
  // rest takes the fatigue back off
  if (ctx.atCamp) b.fatigue = Math.max(0, (b.fatigue || 0) - hrs * (ctx.sleeping ? 26 : ctx.resting ? 10 : 4));
  // wounds close with time at camp; faster in a bed, with a medic around
  const inj = b.injuries || [];
  let changed = false;
  for (let k = inj.length - 1; k >= 0; k--) {
    const i = inj[k], d = INJURIES[i.id];
    if (!d) { inj.splice(k, 1); changed = true; continue; }
    if (d.bleed && !i.treated) b.health = Math.max(1, b.health - hrs * 6);
    if (ctx.atCamp) i.t -= hrs * (ctx.sleeping ? 2 : 1) * (ctx.medic ? 1.6 : 1) * (i.treated ? 1.5 : 1);
    if (i.t <= 0) { inj.splice(k, 1); changed = true; ctx.onHealed && ctx.onHealed(d); }
  }
  if (changed) b.maxHealth = maxHealthOf(b);
}
// meds on the worst wound: bleeding stops, healing speeds up
export function treat(b) {
  const inj = (b.injuries || []).filter((i) => !i.treated);
  if (!inj.length) return null;
  inj.sort((a, c) => (INJURIES[c.id].bleed ? 1 : 0) - (INJURIES[a.id].bleed ? 1 : 0) || c.t - a.t);
  inj[0].treated = true;
  inj[0].t *= 0.6;
  return INJURIES[inj[0].id];
}
export function injuryList(b) { return (b.injuries || []).map((i) => INJURIES[i.id] ? INJURIES[i.id].name + (i.treated ? ' (treated)' : '') : null).filter(Boolean); }

// what a survivor is good at, as modifiers on how they fight and work
export function skillMods(npc) {
  const s = (k) => npc.skill(k);
  return {
    maxHealth: 100, maxStamina: 100 * (1 + s('combat') * 0.05), sprint: 6.0, staminaRegen: 1,
    melee: 1 + s('combat') * 0.12, knockdown: 1 + s('combat') * 0.2, swing: 1 - s('combat') * 0.04,
    gun: 1 + s('shooting') * 0.08, spread: 1 - s('shooting') * 0.13,
    search: 1 - s('scavenging') * 0.1, loot: 1 + s('scavenging') * 0.08,
    noise: 1 - s('stealth') * 0.15, build: 1 - s('building') * 0.08, heal: 1 + s('medicine') * 0.2, nightSight: 1,
  };
}
