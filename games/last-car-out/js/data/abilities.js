/* Active abilities granted by the skill tree.
   desc(k): k.sp(n) = scaled ability damage/healing number, k.S = stats, k.L = level.
   use(C, target): C is the combat API (engine/combat.js). */
(function () {
  'use strict';
  const D = LCO.data;
  const A = {};
  function ab(id, branch, name, icon, ap, focus, cd, target, desc, use, extra) {
    A[id] = Object.assign({ id, branch, name, icon, ap, focus, cd, target, desc, use }, extra || {});
  }

  /* Passenger */
  ab('first_aid', 'passenger', 'First Aid', 'bandage', 1, 3, 3, 'self',
    () => 'Heal 25% of max HP and wash out Bleed and Burn.',
    (C) => { C.heal(Math.round(C.p.maxHp * 0.25)); C.clear(C.p, 'bleed'); C.clear(C.p, 'burn'); });
  ab('duck_cover', 'passenger', 'Duck and Cover', 'shield', 1, 2, 3, 'self',
    () => 'Gain Guard worth 20% of max HP. Your next Flee this fight always works.',
    (C) => { C.gainGuard(Math.round(C.p.maxHp * 0.2)); C.p.sureFlee = true; });
  ab('adrenal_surge', 'passenger', 'Adrenal Surge', 'bolt', 0, 5, 5, 'self',
    () => 'Gain 2 AP right now.',
    (C) => { C.gainAp(2); });

  /* Denizen */
  ab('cleave', 'denizen', 'Cleave', 'axe', 2, 2, 1, 'all',
    () => 'Strike every enemy for 75% weapon damage.',
    (C) => { for (const e of C.alive()) C.strike(e, 0.75, { noCleave: true }); });
  ab('bellow', 'denizen', 'Bellow', 'fang', 1, 2, 3, 'none',
    () => 'Every enemy becomes Weak for 2 turns.',
    (C) => { for (const e of C.alive()) C.addStatus(e, 'weak', 2); });
  ab('crushing_blow', 'denizen', 'Crushing Blow', 'club', 2, 3, 3, 'enemy',
    () => 'Strike for 180% damage. Stuns the target if it drops below half HP.',
    (C, t) => { const h = C.strike(t, 1.8); if (!h.killed && t.hp < t.maxHp / 2) C.addStatus(t, 'stun', 1); });
  ab('whirlwind', 'denizen', 'Whirlwind', 'wind', 3, 5, 4, 'all',
    () => 'Strike every enemy three times for 45% damage each.',
    (C) => { for (let i = 0; i < 3; i++) for (const e of C.alive()) C.strike(e, 0.45, { noCleave: true }); });
  ab('execute', 'denizen', 'Execute', 'skull', 1, 4, 2, 'enemy',
    () => 'Strike for 100% damage, or 350% if the target is below 30% HP. A kill refunds the Focus.',
    (C, t) => { const low = t.hp < t.maxHp * 0.3; const h = C.strike(t, low ? 3.5 : 1); if (h.killed) C.gainFocus(4); });
  ab('primal_form', 'denizen', 'Heart of the Beast', 'fang', 1, 8, 8, 'self',
    () => 'For 3 turns: +2 AP each turn, +50% damage, and Strikes cause Bleed. Gain 2 AP now.',
    (C) => { C.addStatus(C.p, 'primal', 3); C.gainAp(2); });

  /* Conductor */
  ab('arc_bolt', 'conductor', 'Arc Bolt', 'bolt', 1, 2, 0, 'enemy',
    (k) => `Deal ${k.sp(9)} damage. 30% chance to Chill.`,
    (C, t) => { C.damage(t, C.spell(9), { src: 'ability', label: 'Arc Bolt' }); if (t.hp > 0 && Math.random() < 0.3) C.addStatus(t, 'chill', 1); });
  ab('sentry_lamp', 'conductor', 'Sentry Lamp', 'lantern', 2, 4, 4, 'none',
    (k) => `Deploy a lamp that zaps a random enemy for ${k.sp(6)} at the start of each of your turns, for 3 turns.`,
    (C) => { const twin = C.flag('twinLamps'); const n = twin ? 2 : 1; for (let i = 0; i < n; i++) C.summon({ id: 'lamp', name: 'Sentry Lamp', dmg: C.spell(6), turns: twin ? 5 : 3 }); });
  ab('overclock', 'conductor', 'Overclock', 'gear', 0, 3, 5, 'self',
    () => 'Cut every other cooldown by 2 turns.',
    (C) => { C.reduceCooldowns(2, 'overclock'); });
  ab('chain_lightning', 'conductor', 'Chain Lightning', 'spark', 2, 5, 3, 'enemy',
    (k) => `Deal ${k.sp(12)} to the target and 70% of that to every other enemy. Everything hit gets 1 Chill.`,
    (C, t) => { const dmg = C.spell(12); const others = C.alive().filter((e) => e !== t);
      C.damage(t, dmg, { src: 'ability', label: 'Chain Lightning' }); if (t.hp > 0) C.addStatus(t, 'chill', 1);
      for (const e of others) { C.damage(e, Math.round(dmg * 0.7), { src: 'ability', label: 'Chain' }); if (e.hp > 0) C.addStatus(e, 'chill', 1); } });
  ab('stopping_signal', 'conductor', 'Stopping Signal', 'lock', 2, 6, 5, 'all',
    (k) => `Stun every enemy for a turn. Each Chill stack on an enemy adds ${k.sp(5)} damage.`,
    (C) => { for (const e of C.alive()) { const ch = e.st.chill || 0; if (ch) C.damage(e, C.spell(5) * ch, { src: 'ability', label: 'Signal' }); if (e.hp > 0) C.addStatus(e, 'stun', 1); } });
  ab('protocol_one_one', 'conductor', 'Protocol One-One', 'coin', 2, 10, 9, 'none',
    (k) => `Call One-One for 4 turns. Glad-One heals 12% HP and adds Guard; Sad-One rains ${k.sp(10)} gloom on every enemy and makes them Weak.`,
    (C) => { C.summon({ id: 'oneone', name: 'One-One', dmg: C.spell(10), turns: 4, phase: 0 }); });

  /* Reflection */
  ab('shadowstep', 'reflection', 'Shadowstep', 'ghost', 1, 2, 2, 'self',
    () => 'Gain a Mirror Image. Your next Strike this turn is a guaranteed critical hit.',
    (C) => { C.addStatus(C.p, 'mirror', 1); C.p.nextCrit = true; });
  ab('smoke_bomb', 'reflection', 'Smoke Bomb', 'bomb', 1, 3, 4, 'self',
    () => 'Become Hidden for 2 turns. Your next Flee this fight always works.',
    (C) => { C.addStatus(C.p, 'hidden', 2); C.p.sureFlee = true; });
  ab('mirror_double', 'reflection', 'Mirror Double', 'copy', 2, 4, 4, 'self',
    () => 'For 3 turns, your reflection repeats every Strike for 50% damage.',
    (C) => { const twin = C.flag('twinReflection'); C.p.double = { turns: twin ? 5 : 3, mult: twin ? 0.75 : 0.5 }; });
  ab('glass_shatter', 'reflection', 'Glass Shatter', 'crystal', 1, 4, 3, 'enemy',
    (k) => `Shatter every Mirror Image you have: each deals ${k.sp(10)} to every enemy. With none, Strike the target instead.`,
    (C, t) => { const n = C.p.st.mirror || 0; if (!n) { C.strike(t, 1); return; } C.clear(C.p, 'mirror');
      for (const e of C.alive()) C.damage(e, C.spell(10) * n, { src: 'ability', label: 'Shards' }); });
  ab('hall_of_mirrors', 'reflection', 'Hall of Mirrors', 'mirror', 2, 6, 5, 'self',
    () => 'Gain 3 Mirror Images.',
    (C) => { C.addStatus(C.p, 'mirror', 3); });
  ab('flip_side', 'reflection', 'The Flip Side', 'refresh', 2, 10, 0, 'enemy',
    () => 'Once per raid: trade HP percentages with the target. Bosses resist — they take 25% of their max HP instead.',
    (C, t) => { if (t.boss) { C.damage(t, Math.round(t.maxHp * 0.25), { src: 'ability', label: 'Flip', ignoreBlock: true }); return; }
      const mine = C.p.hp / C.p.maxHp; const theirs = t.hp / t.maxHp;
      C.p.hp = Math.max(1, Math.round(C.p.maxHp * theirs)); t.hp = Math.max(1, Math.round(t.maxHp * mine));
      C.log(`The world flips: you ${Math.round(theirs * 100)}%, ${t.name} ${Math.round(mine * 100)}%.`, 'good'); },
    { oncePerRaid: true });

  /* Corruption */
  ab('blight', 'corruption', 'Blight', 'tar', 1, 2, 1, 'enemy',
    (k) => `Apply ${4 + Math.floor(k.L / 3)} Corruption, which grows every turn.`,
    (C, t) => { const n = 4 + Math.floor(C.L / 3); const targets = C.flag('pandemic') ? C.alive() : [t]; for (const e of targets) C.addStatus(e, 'corrupt', n); });
  ab('tape_drain', 'corruption', 'Tape Drain', 'tape', 2, 3, 2, 'enemy',
    (k) => `Deal ${k.sp(10)} damage and heal for all of it.`,
    (C, t) => { const r = C.damage(t, C.spell(10), { src: 'ability', label: 'Drain' }); C.heal(r.dealt); });
  ab('unmake', 'corruption', 'Unmake', 'x', 2, 5, 3, 'enemy',
    (k) => `Deal ${k.sp(26)} damage that ignores Block. Your Number rises by 1.`,
    (C, t) => { C.damage(t, C.spell(26), { src: 'ability', label: 'Unmake', ignoreBlock: true }); C.numberDelta(1); });
  ab('dread', 'corruption', 'Dread', 'eye', 1, 4, 4, 'none',
    () => 'Every enemy becomes Weak and Exposed for 2 turns.',
    (C) => { for (const e of C.alive()) { C.addStatus(e, 'weak', 2); C.addStatus(e, 'exposed', 2); } });
  ab('blood_offering', 'corruption', 'Blood Offering', 'drop', 0, 0, 3, 'self',
    () => 'Lose 20% of your current HP. Gain 6 Focus and deal 30% more damage this turn.',
    (C) => { C.p.hp = Math.max(1, C.p.hp - Math.round(C.p.hp * 0.2)); C.gainFocus(6); C.addStatus(C.p, 'empower', 1); });
  ab('eclipse', 'corruption', 'Eclipse', 'tar', 2, 12, 8, 'self',
    () => 'For 3 turns: take 50% less damage, your hits spread Corruption worth 25% of the damage, and enemy Corruption ticks twice. Your Number rises by 2.',
    (C) => { C.addStatus(C.p, 'eclipse', 3); C.numberDelta(2); });

  D.ABILITIES = A;
})();
