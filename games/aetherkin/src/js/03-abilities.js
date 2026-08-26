/* ============================================================================
   ABILITIES — active, cost Focus, sit in their own two slots beside moves.
   Using one takes the turn. cost = Focus spent, cd = turns before reuse.
   use(c): c.self c.foe c.bt c.log c.heal c.stage c.give c.cure c.setField
   ========================================================================== */
const ABILITIES = {};
const A = (id, o) => { o.id = id; ABILITIES[id] = o; return o; };

/* I. Emberkit */
A('bank_the_coals', { n: 'Bank the Coals', cost: 1, cd: 2, d: 'Banks 3 Kindle at once and raises Force.',
  use: c => { c.give(c.self, 'kindle', 3); c.stage(c.self, { frc: 1 }); c.log(c.self.name + ' banks the coals — Kindle x' + c.self.counters.kindle + '.'); } });
A('ashen_veil', { n: 'Ashen Veil', cost: 2, cd: 3, d: 'A shroud of hot ash: Guard and Ward rise, and status cannot take hold for 3 turns.',
  use: c => { c.stage(c.self, { grd: 1, wrd: 1 }); c.self.timers.wardStatus = 3; c.log(c.self.name + ' draws an ashen veil closed.'); } });
A('immolate', { n: 'Immolate', cost: 3, cd: 4, d: 'Burns a fifth of its own vitality to raise Force and Arcana by two stages each.',
  use: c => { c.hurtSelf(Math.round(c.self.maxhp * 0.2)); c.stage(c.self, { frc: 2, arc: 2 }); c.log(c.self.name + ' feeds itself to the fire.'); } });

/* II. Brookling */
A('tidepool', { n: 'Tidepool', cost: 2, cd: 3, d: 'Mends 35% vitality — 50% while it is raining.',
  use: c => { c.heal(c.self, Math.round(c.self.maxhp * (c.bt.field === 'downpour' ? 0.5 : 0.35))); } });
A('riptide', { n: 'Riptide', cost: 2, cd: 3, d: 'Drags the foe under: Swift falls two stages and it is Rooted in place.',
  use: c => { c.stage(c.foe, { swf: -2 }); c.mark(c.foe, 'root'); c.log('The current closes around ' + c.foe.name + '.'); } });
A('current_shift', { n: 'Current Shift', cost: 1, cd: 2, d: 'Hands every stat drop it is carrying straight back to the foe.',
  use: c => { let moved = 0; for (const k in c.self.stages) { if (c.self.stages[k] < 0) { const v = c.self.stages[k]; c.self.stages[k] = 0; c.foe.stages[k] = clamp((c.foe.stages[k] || 0) + v, -6, 6); moved++; } }
    c.log(moved ? c.self.name + ' turns the current — ' + moved + ' ' + plural(moved, 'penalty', 'penalties') + ' passed to ' + c.foe.name + '.' : 'Nothing to send back.'); } });

/* III. Mosskit */
A('overgrow', { n: 'Overgrow', cost: 2, cd: 4, d: 'Raises a Verdant Bloom and mends a fifth of its vitality.',
  use: c => { c.setField('bloom'); c.heal(c.self, Math.round(c.self.maxhp * 0.2)); } });
A('graft', { n: 'Graft', cost: 2, cd: 3, d: 'Cures its own status, mends a quarter, and raises Ward.',
  use: c => { c.cure(c.self); c.heal(c.self, Math.round(c.self.maxhp * 0.25)); c.stage(c.self, { wrd: 1 }); } });
A('seedbank', { n: 'Seedbank', cost: 3, cd: 5, d: 'Plants a seed. In two turns it bursts, mending 60% of vitality.',
  use: c => { c.self.timers.seedbank = 2; c.log(c.self.name + ' buries a seed in the field.'); } });

/* IV. Zaplet */
A('capacitor', { n: 'Capacitor', cost: 1, cd: 1, d: 'Banks 2 Charge and restores a point of Focus next turn.',
  use: c => { c.give(c.self, 'charge', 2); c.self.timers.overclock = 2; c.log(c.self.name + ' banks 2 Charge — ' + c.self.counters.charge + ' held.'); } });
A('discharge', { n: 'Discharge', cost: 2, cd: 3, d: 'Dumps every Charge as unblockable Storm damage — 7% of the foe’s max vitality per Charge.',
  use: c => { const n = c.self.counters.charge || 0; if (!n) return c.log('Nothing banked to spend.');
    c.self.counters.charge = 0; c.hurtFoe(Math.round(c.foe.maxhp * 0.07 * n)); c.log('Every Charge goes at once — ' + n + ' released.'); } });
A('grounding_stake', { n: 'Grounding Stake', cost: 2, cd: 4, d: 'Drives a stake: Guard rises two stages and Shock is cured and warded off.',
  use: c => { c.stage(c.self, { grd: 2 }); if (c.self.status === 'shock') c.cure(c.self); c.self.timers.wardStatus = 3; } });

/* V. Glimmoth */
A('lumen_shroud', { n: 'Lumen Shroud', cost: 2, cd: 4, d: 'For 3 turns, a third of all Arcana damage taken is thrown back at the sender.',
  use: c => { c.self.timers.shroud = 3; c.log(c.self.name + ' folds light into a shell.'); } });
A('eclipse_call', { n: 'Eclipse Call', cost: 2, cd: 3, d: 'Pulls an Eclipse over the field and sharpens its own focus.',
  use: c => { c.setField('eclipse'); c.stage(c.self, { crit: 1 }); } });
A('wingdust', { n: 'Wingdust', cost: 1, cd: 2, d: 'Fine scales everywhere: the foe’s aim and evasion both drop a stage.',
  use: c => { c.stage(c.foe, { acc: -1, eva: -1 }); } });

/* VI. Gravelump */
A('entrench', { n: 'Entrench', cost: 2, cd: 4, d: 'Digs in hard — Guard and Ward up two, Swift down one.',
  use: c => { c.stage(c.self, { grd: 2, wrd: 2, swf: -1 }); } });
A('seismic_call', { n: 'Seismic Call', cost: 2, cd: 3, d: 'Raises a Tremorfield and knocks a stage off the foe’s evasion.',
  use: c => { c.setField('tremor'); c.stage(c.foe, { eva: -1 }); } });
A('stone_answer', { n: 'Stone Answer', cost: 2, cd: 3, d: 'For 2 turns, every attacker takes back a quarter of what it deals.',
  use: c => { c.self.timers.answer = 2; c.log(c.self.name + ' sets itself to answer.'); } });

/* VII. Frostnip */
A('cold_snap', { n: 'Cold Snap', cost: 2, cd: 3, d: 'Chills the foe outright and drops its Swift a stage.',
  use: c => { c.inflict(c.foe, 'chill'); c.stage(c.foe, { swf: -1 }); } });
A('hibernate', { n: 'Hibernate', cost: 3, cd: 5, d: 'Sleeps off half its wounds and every status — but loses the next turn.',
  use: c => { c.heal(c.self, Math.round(c.self.maxhp * 0.5)); c.cure(c.self); c.self.timers.asleep = 2; c.log(c.self.name + ' goes still and deep.'); } });
A('frost_armour', { n: 'Frost Armour', cost: 1, cd: 2, d: 'A rind of ice: Guard up, and the next attacker is Chilled.',
  use: c => { c.stage(c.self, { grd: 1 }); c.self.timers.frostcoat = 3; } });

/* VIII. Nullwisp */
A('precognition', { n: 'Precognition', cost: 2, cd: 3, d: 'Reads two turns ahead. All damage taken is halved for 2 turns.',
  use: c => { c.self.timers.precog = 2; c.log(c.self.name + ' is already somewhere else.'); } });
A('mind_siphon', { n: 'Mind Siphon', cost: 2, cd: 3, d: 'Takes the foe’s best stat rise for itself.',
  use: c => { let best = null, bv = 0; for (const k in c.foe.stages) if (c.foe.stages[k] > bv) { bv = c.foe.stages[k]; best = k; }
    if (!best) return c.log('There is nothing to take.');
    c.foe.stages[best] -= bv; c.stage(c.self, { [best]: bv }); c.log(c.self.name + ' takes ' + c.foe.name + '’s ' + STAGE_NAME[best] + '.'); } });
A('thoughtwell', { n: 'Thoughtwell', cost: 0, cd: 3, d: 'Costs nothing and restores 3 Focus.',
  use: c => { c.self.focus = Math.min(c.self.focusMax, c.self.focus + 3); c.log(c.self.name + ' draws from the well — Focus ' + c.self.focus + '.'); } });

/* IX-XII. standalone kin */
A('slipstream', { n: 'Slipstream', cost: 1, cd: 2, d: 'Swift up two stages, and the next attack against it has a 40% chance to miss.',
  use: c => { c.stage(c.self, { swf: 2 }); c.self.timers.slip = 2; } });
A('venom_bloom', { n: 'Venom Bloom', cost: 2, cd: 3, d: 'Doubles the damage the foe’s poison is already doing, for 3 turns.',
  use: c => { c.foe.timers.venomBloom = 3; c.log('The poison in ' + c.foe.name + ' blooms.'); } });
A('scrap_weld', { n: 'Scrap Weld', cost: 2, cd: 3, d: 'Welds on plate: mends 25% and raises Guard.',
  use: c => { c.heal(c.self, Math.round(c.self.maxhp * 0.25)); c.stage(c.self, { grd: 1 }); } });
A('nightstep', { n: 'Nightstep', cost: 1, cd: 2, d: 'Evasion up two stages, and its next attack cannot miss.',
  use: c => { c.stage(c.self, { eva: 2 }); c.self.timers.sureStrike = 2; } });
