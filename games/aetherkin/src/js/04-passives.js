/* ============================================================================
   PASSIVES — always on, but slots are scarce. A kin starts with 2 slots and
   earns a third on evolving, so a full lattice always outgrows what it can wear.
   Hooks (all optional, all receive c = { self, foe, bt, log, ...extra }):
     onEnter, onTurnEnd, afterDeal, afterTake, onKO
     dmgOut -> multiplier   dmgIn -> multiplier   statMult(c.stat) -> multiplier
     survive -> bool        blockStatus(c.status) -> bool
     critBonus -> stages    accMult -> multiplier   focusRegen -> extra Focus
   ========================================================================== */
const PASSIVES = {};
const P = (id, o) => { o.id = id; PASSIVES[id] = o; return o; };

/* I. Emberkit — heat compounds */
P('kindling', { n: 'Kindling', d: 'Every attack banks a Kindle, to a maximum of 5. Each Kindle adds 6% damage.',
  afterDeal: c => { c.self.counters.kindle = Math.min(5, (c.self.counters.kindle || 0) + 1); },
  dmgOut: c => 1 + 0.06 * (c.self.counters.kindle || 0) });
P('cinderskin', { n: 'Cinderskin', d: 'Anything that strikes it in close quarters takes 8% of its own max vitality in burns.',
  afterTake: c => { if (c.move && c.move.c === 'phys') { c.dealTo(c.foe, Math.round(c.foe.maxhp * 0.08)); c.log(c.foe.name + ' is scorched on contact.'); } } });
P('wickburn', { n: 'Wickburn', d: 'Burns it inflicts do double damage, and its Ember moves are 10% stronger against burning foes.',
  dmgOut: c => (c.def && c.def.status === 'burn' && c.move && c.move.t === 'ember' ? 1.1 : 1) });
P('phoenix_ember', { n: 'Phoenix Ember', d: 'Once per battle, survives a killing blow at 1 HP and mends a quarter of its vitality.',
  survive: c => { if (c.self.flags.phoenixUsed) return false; c.self.flags.phoenixUsed = true;
    c.self.hp = 1; c.healRaw(c.self, Math.round(c.self.maxhp * 0.25)); c.log(c.self.name + ' will not go out.'); return true; } });
P('heat_haze', { n: 'Heat Haze', d: 'Rising air spoils incoming aim by 10%.', accMult: () => 0.9 });

/* II. Brookling — flow and pressure */
P('tidewalker', { n: 'Tidewalker', d: 'Mends 8% of its vitality each turn while it is raining.',
  onTurnEnd: c => { if (c.bt.field === 'downpour') { c.healRaw(c.self, Math.round(c.self.maxhp * 0.08)); c.log(c.self.name + ' drinks the rain.'); } } });
P('pressure_hull', { n: 'Pressure Hull', d: 'Takes 18% less Arcana damage.', dmgIn: c => (c.move && c.move.c === 'arc' ? 0.82 : 1) });
P('momentum', { n: 'Momentum', d: 'Each Tide move used in a row adds 12% damage, up to three in a row.',
  afterDeal: c => { c.self.counters.flow = c.move && c.move.t === 'tide' ? Math.min(3, (c.self.counters.flow || 0) + 1) : 0; },
  dmgOut: c => (c.move && c.move.t === 'tide' ? 1 + 0.12 * (c.self.counters.flow || 0) : 1) });
P('deepcurrent', { n: 'Deep Current', d: 'Swift is a quarter higher while it is raining.',
  statMult: c => (c.stat === 'swf' && c.bt.field === 'downpour' ? 1.25 : 1) });
P('undertow_grip', { n: 'Undertow Grip', d: 'Anything it damages loses a stage of Swift one time in three.',
  afterDeal: c => { if (c.dmg > 0 && chance(0.33)) c.stageTo(c.foe, { swf: -1 }); } });

/* III. Mosskit — slow returns, then a flood of them */
P('verdant_bloom', { n: 'Verdant Heart', d: 'Mends 6% of its vitality every turn.',
  onTurnEnd: c => { c.healRaw(c.self, Math.round(c.self.maxhp * 0.06)); } });
P('thornhide', { n: 'Thornhide', d: 'Close-quarters attackers take back 12% of the damage they deal.',
  afterTake: c => { if (c.move && c.move.c === 'phys' && c.dmg > 0) c.dealTo(c.foe, Math.max(1, Math.round(c.dmg * 0.12))); } });
P('deep_roots', { n: 'Deep Roots', d: 'Its Swift cannot be lowered, and Guard is a fifth higher in a Bloom.',
  guardStage: c => (c.stat === 'swf' && c.delta < 0),
  statMult: c => (c.stat === 'grd' && c.bt.field === 'bloom' ? 1.2 : 1) });
P('heartwood', { n: 'Heartwood', d: 'Below half vitality, mends an extra 10% each turn.',
  onTurnEnd: c => { if (c.self.hp < c.self.maxhp / 2) { c.healRaw(c.self, Math.round(c.self.maxhp * 0.1)); c.log(c.self.name + ' draws on its heartwood.'); } } });
P('spore_wake', { n: 'Spore Wake', d: 'Whatever knocks it out is left poisoned.',
  onFaint: c => { c.inflictTo(c.foe, 'poison'); c.log('Spores burst from ' + c.self.name + ' as it falls.'); } });

/* IV. Zaplet — bank it, spend it */
P('static_field', { n: 'Static Field', d: 'One attacker in four walks away Shocked.',
  afterTake: c => { if (chance(0.25)) c.inflictTo(c.foe, 'shock'); } });
P('conduction', { n: 'Conduction', d: 'Storm moves gain 9% damage for every Charge banked.',
  dmgOut: c => (c.move && c.move.t === 'storm' ? 1 + 0.09 * (c.self.counters.charge || 0) : 1) });
P('flashstep', { n: 'Flashstep', d: 'While faster than the foe, its critical focus is one stage higher.',
  critBonus: c => (c.self.spd > c.foe.spd ? 1 : 0) });
P('grounding_rod', { n: 'Grounding Rod', d: 'Cannot be Shocked, and takes a fifth less Storm damage.',
  blockStatus: c => c.status === 'shock', dmgIn: c => (c.move && c.move.t === 'storm' ? 0.8 : 1) });
P('dynamo', { n: 'Dynamo', d: 'Banks a Charge at the end of every turn.',
  onTurnEnd: c => { c.self.counters.charge = Math.min(8, (c.self.counters.charge || 0) + 1); } });

/* V. Glimmoth — light, and its absence */
P('photophage', { n: 'Photophage', d: 'Mends a quarter of the damage its Lumen moves deal.',
  afterDeal: c => { if (c.move && c.move.t === 'lumen' && c.dmg > 0) c.healRaw(c.self, Math.round(c.dmg * 0.25)); } });
P('flicker', { n: 'Flicker', d: 'One attack in five simply passes through it.',
  dodge: () => chance(0.2) });
P('mothlight', { n: 'Mothlight', d: 'Raises Arcana a stage whenever it takes the field.',
  onEnter: c => { c.stageTo(c.self, { arc: 1 }); } });
P('umbral_mimic', { n: 'Umbral Mimic', d: 'The first hit it takes each battle is halved.',
  dmgIn: c => (c.self.flags.mimicUsed ? 1 : 0.5),
  afterTake: c => { c.self.flags.mimicUsed = true; } });
P('duskfed', { n: 'Duskfed', d: 'Gains an extra point of Focus each turn while an Eclipse holds.',
  focusRegen: c => (c.bt.field === 'eclipse' ? 1 : 0) });

/* VI. Gravelump — answer everything */
P('stonehide', { n: 'Stonehide', d: 'Takes 18% less close-quarters damage.',
  dmgIn: c => (c.move && c.move.c === 'phys' ? 0.82 : 1) });
P('weighted', { n: 'Weighted', d: 'Its Swift cannot be lowered, and Stone moves hit 12% harder.',
  guardStage: c => (c.stat === 'swf' && c.delta < 0),
  dmgOut: c => (c.move && c.move.t === 'stone' ? 1.12 : 1) });
P('retribution', { n: 'Retribution', d: 'Returns 15% of every wound to whoever made it.',
  afterTake: c => { if (c.dmg > 0) c.dealTo(c.foe, Math.max(1, Math.round(c.dmg * 0.15))); } });
P('unbreakable', { n: 'Unbreakable', d: 'Below a quarter vitality, Guard and Ward rise by half.',
  statMult: c => ((c.stat === 'grd' || c.stat === 'wrd') && c.self.hp < c.self.maxhp * 0.25 ? 1.5 : 1) });
P('ballast', { n: 'Ballast', d: 'Cannot be knocked below 1 HP by a hit taken at full vitality.',
  survive: c => { if (c.fullBefore) { c.self.hp = 1; c.log(c.self.name + ' refuses to fall from full.'); return true; } return false; } });

/* VII. Frostnip — slow it, then break it */
P('frostbound', { n: 'Frostbound', d: 'Chilled foes take 18% more damage from it.',
  dmgOut: c => (c.def && c.def.status === 'chill' ? 1.18 : 1) });
P('cryoshell', { n: 'Cryoshell', d: 'Cannot be Chilled, and Ward is a quarter higher in a Whiteout.',
  blockStatus: c => c.status === 'chill',
  statMult: c => (c.stat === 'wrd' && c.bt.field === 'whiteout' ? 1.25 : 1) });
P('shatterpoint', { n: 'Shatterpoint', d: 'Critical focus rises two stages against a Chilled foe.',
  critBonus: c => (c.foe.status === 'chill' ? 2 : 0) });
P('avalanche_heart', { n: 'Avalanche Heart', d: 'Every kin it fells raises its Force two stages.',
  onKO: c => { c.stageTo(c.self, { frc: 2 }); c.log(c.self.name + ' gathers speed downhill.'); } });
P('coldblood', { n: 'Coldblood', d: 'Frost moves cost it nothing to hold back — its Frost moves ignore a stage of the foe’s Ward.',
  dmgOut: c => (c.move && c.move.t === 'frost' && c.def.stages.wrd > 0 ? 1.15 : 1) });

/* VIII. Nullwisp — know it first */
P('unraveling', { n: 'Unraveling', d: 'Stat drops it inflicts land one stage deeper.',
  deepen: c => (c.delta < 0 ? -1 : 0) });
P('psionic_well', { n: 'Psionic Well', d: 'Carries one more Focus than other kin, and regains an extra each turn.',
  focusMaxBonus: 2, focusRegen: () => 1 });
P('mirror_thought', { n: 'Mirror Thought', d: 'Two status effects in five are reflected back at the sender.',
  blockStatus: c => { if (chance(0.4)) { c.inflictTo(c.foe, c.status); c.log('The thought comes back to ' + c.foe.name + '.'); return true; } return false; } });
P('certainty_p', { n: 'Certainty', d: 'Its attacks are 15% more accurate, and it cannot be Dazed.',
  accSelf: () => 1.15, blockStatus: c => c.status === 'daze' });
P('null_aura', { n: 'Null Aura', d: 'The foe’s stat rises give it 20% less damage than they should.',
  dmgIn: c => (Object.values(c.foe.stages).some(v => v > 0) ? 0.8 : 1) });

/* IX. Gustling */
P('tailwind', { n: 'Tailwind', d: 'Swift is a fifth higher on the turn it takes the field, and it always acts first that turn.',
  statMult: c => (c.stat === 'swf' && c.self.justSwitchedIn ? 1.2 : 1) });
P('featherweight', { n: 'Featherweight', d: 'Takes 30% less Stone damage — there is not enough of it to hit.',
  dmgIn: c => (c.move && c.move.t === 'stone' ? 0.7 : 1) });
P('second_wind', { n: 'Second Wind', d: 'Regains 12% vitality the first time it drops below half.',
  onTurnEnd: c => { if (!c.self.flags.secondWind && c.self.hp > 0 && c.self.hp < c.self.maxhp / 2) { c.self.flags.secondWind = true; c.healRaw(c.self, Math.round(c.self.maxhp * 0.12)); c.log(c.self.name + ' catches a second wind.'); } } });

/* X. Venomite */
P('virulence', { n: 'Virulence', d: 'The poisons it inflicts start at double strength.',
  poisonBoost: 2 });
P('toxic_skin', { n: 'Toxic Skin', d: 'One close-quarters attacker in three is poisoned.',
  afterTake: c => { if (c.move && c.move.c === 'phys' && chance(0.33)) c.inflictTo(c.foe, 'poison'); } });
P('parasite', { n: 'Parasite', d: 'Mends 5% of its vitality each turn the foe is poisoned.',
  onTurnEnd: c => { if (c.foe && c.foe.status === 'poison') c.healRaw(c.self, Math.round(c.self.maxhp * 0.05)); } });

/* XI. Scrapjaw */
P('scrap_plating', { n: 'Scrap Plating', d: 'Takes 15% less of everything, but Swift is a tenth lower.',
  dmgIn: () => 0.85, statMult: c => (c.stat === 'swf' ? 0.9 : 1) });
P('salvage', { n: 'Salvage', d: 'Each kin it fells mends a fifth of its vitality.',
  onKO: c => { c.healRaw(c.self, Math.round(c.self.maxhp * 0.2)); c.log(c.self.name + ' strips the field for parts.'); } });
P('overbuilt', { n: 'Overbuilt', d: 'Its Guard cannot be lowered.',
  guardStage: c => (c.stat === 'grd' && c.delta < 0) });

/* XII. Shadeling */
P('ambusher', { n: 'Ambusher', d: 'Its first attack after taking the field deals 35% more.',
  dmgOut: c => (c.self.justSwitchedIn ? 1.35 : 1) });
P('shadowmeld', { n: 'Shadowmeld', d: 'One attack in four misses it entirely while an Eclipse holds — one in eight otherwise.',
  dodge: c => chance(c.bt.field === 'eclipse' ? 0.25 : 0.125) });
P('nightfed', { n: 'Nightfed', d: 'Umbra moves mend it for a tenth of the damage they deal.',
  afterDeal: c => { if (c.move && c.move.t === 'umbra' && c.dmg > 0) c.healRaw(c.self, Math.round(c.dmg * 0.1)); } });
