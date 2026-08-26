/* ============================================================================
   MOVES
   n name   t type   c category (phys | arc | stat)   p power   a accuracy (0 = unerring)
   pri priority   cd cooldown (turns)   hits [min,max]   drain/recoil (fraction of dmg)
   heal (fraction of max HP)   st [status, chance]   mk [mark, chance]
   self/foe { stage deltas }   fld field id   pw(ctx) dynamic power   onHit(ctx)
   ========================================================================== */
const MOVES = {};
const M = (id, o) => { o.id = id; MOVES[id] = o; return o; };

/* ---- universal ---------------------------------------------------------- */
M('rend',       { n: 'Rend', t: 'aether', c: 'phys', p: 45, a: 100, d: 'A plain, honest strike. Every kin knows it.' });
M('pulse',      { n: 'Aether Pulse', t: 'aether', c: 'arc', p: 45, a: 100, d: 'A shove of raw unshaped aether.' });
M('brace',      { n: 'Brace', t: 'aether', c: 'stat', a: 0, self: { grd: 1, wrd: 1 }, d: 'Sets its stance. Raises Guard and Ward.' });
M('quickstep',  { n: 'Quickstep', t: 'aether', c: 'phys', p: 35, a: 100, pri: 1, d: 'A darting jab that always comes first.' });

/* ---- I. Emberkit line — heat that compounds ----------------------------- */
M('ember_fang', { n: 'Ember Fang', t: 'ember', c: 'phys', p: 45, a: 100, st: ['burn', 0.25], d: 'Jaws sheathed in flame. Often leaves a burn.' });
M('flare_step', { n: 'Flare Step', t: 'ember', c: 'phys', p: 60, a: 100, pri: 1, cd: 2, d: 'Closes the gap in a streak of fire before the foe can react.' });
M('smolder',    { n: 'Smolder', t: 'ember', c: 'arc', p: 35, a: 100, mk: ['smolder', 1], d: 'Sets a slow coal in the foe. Stacks, and every stack keeps burning.' });
M('magma_lash', { n: 'Magma Lash', t: 'ember', c: 'phys', p: 90, a: 90, recoil: 0.125, d: 'A whip of molten stone. The backlash scalds the user too.' });
M('sunbrand',   { n: 'Sunbrand', t: 'ember', c: 'arc', p: 80, a: 100, d: 'Doubles in power against a burning foe.',
  pw: c => (c.def.status === 'burn' ? 160 : 80) });
M('cinder_nova',{ n: 'Cinder Nova', t: 'ember', c: 'arc', p: 110, a: 95, cd: 3, fld: 'emberstorm', d: 'Detonates its stored heat and kicks up an Emberstorm.' });
M('ironclad_bash',{ n: 'Ironclad Bash', t: 'iron', c: 'phys', p: 80, a: 100, self: { grd: 1 }, d: 'Leads with the shoulder-plate, then settles behind it.' });
M('nightsear',  { n: 'Nightsear', t: 'umbra', c: 'arc', p: 75, a: 100, self: { crit: 1 }, d: 'Cold fire. Sharpens the caster’s focus as it burns.' });

/* ---- II. Brookling line — flow, mending, pressure ------------------------ */
M('brine_jet',  { n: 'Brine Jet', t: 'tide', c: 'arc', p: 50, a: 100, d: 'A needle of pressurised salt water.' });
M('undertow',   { n: 'Undertow', t: 'tide', c: 'phys', p: 55, a: 100, foe: { swf: -1 }, d: 'Sweeps the legs out. The foe slows.' });
M('tidal_coil', { n: 'Tidal Coil', t: 'tide', c: 'phys', p: 70, a: 100, drain: 0.4, d: 'Wraps and squeezes, drawing moisture back into itself.' });
M('deluge',     { n: 'Deluge', t: 'tide', c: 'arc', p: 95, a: 90, fld: 'downpour', d: 'Calls the sky down. Leaves a Downpour behind.' });
M('mistveil',   { n: 'Mistveil', t: 'tide', c: 'stat', a: 0, self: { eva: 1, wrd: 1 }, d: 'Wreathes itself in fog. Harder to hit, harder to unmake.' });
M('bulwark_wave',{ n: 'Bulwark Wave', t: 'stone', c: 'phys', p: 80, a: 100, self: { grd: 1 }, d: 'A wall of water and silt that hardens as it breaks.' });
M('stormsurge', { n: 'Stormsurge', t: 'storm', c: 'arc', p: 100, a: 90, cd: 2, st: ['shock', 0.2], d: 'Charged seawater. Lands like a thrown ocean.' });
M('deepcall',   { n: 'Deepcall', t: 'tide', c: 'arc', p: 0, a: 0, heal: 0.35, d: 'Draws on water far below. Mends a third of its vitality.' });

/* ---- III. Mosskit line — growth that pays out later ---------------------- */
M('seed_lash',  { n: 'Seed Lash', t: 'verdant', c: 'phys', p: 50, a: 100, d: 'A green whip studded with hard seed-cases.' });
M('root_snare', { n: 'Root Snare', t: 'verdant', c: 'stat', a: 90, mk: ['root', 1], foe: { swf: -1 }, d: 'Pins the foe in place. It cannot be recalled.' });
M('photosynth', { n: 'Photosynthesis', t: 'verdant', c: 'stat', a: 0, heal: 0.3, d: 'Mends 30% — or half, standing in a Verdant Bloom.',
  onHit: c => { if (c.bt.field === 'bloom') c.heal(Math.round(c.atk.maxhp * 0.2)); } });
M('bramble_burst',{ n: 'Bramble Burst', t: 'verdant', c: 'arc', p: 85, a: 95, mk: ['bleed', 0.3], d: 'Thorns erupt from below and keep on cutting.' });
M('spore_cloud',{ n: 'Spore Cloud', t: 'venom', c: 'stat', a: 90, st: ['poison', 1], foe: { arc: -1 }, d: 'A drifting haze that poisons and fogs the mind.' });
M('thorn_mantle',{ n: 'Thorn Mantle', t: 'iron', c: 'phys', p: 85, a: 100, self: { grd: 1, frc: 1 }, cd: 2, d: 'Hardened bark plates driven forward as one mass.' });
M('sunbloom_ray',{ n: 'Sunbloom Ray', t: 'lumen', c: 'arc', p: 90, a: 100, d: 'Light focused through a living lens. Mends the caster for a fifth of the damage.', drain: 0.2 });
M('overgrowth', { n: 'Overgrowth', t: 'verdant', c: 'arc', p: 120, a: 85, cd: 3, fld: 'bloom', d: 'Everything grows at once, everywhere. Raises a Verdant Bloom.' });

/* ---- IV. Zaplet line — charge, then spend -------------------------------- */
M('spark_dart', { n: 'Spark Dart', t: 'storm', c: 'arc', p: 40, a: 100, pri: 1, d: 'A thrown spark. Faster than thought.' });
M('arc_lash',   { n: 'Arc Lash', t: 'storm', c: 'phys', p: 65, a: 100, st: ['shock', 0.2], d: 'A cracking whip of current.' });
M('overcharge', { n: 'Overcharge', t: 'storm', c: 'stat', a: 0, self: { arc: 1 }, d: 'Winds itself tight. Raises Arcana and banks two Charge.',
  onHit: c => c.addCounter(c.atk, 'charge', 2) });
M('chain_bolt', { n: 'Chain Bolt', t: 'storm', c: 'arc', p: 30, a: 95, hits: [2, 3], d: 'Forks two or three ways. Each fork lands separately.' });
M('thunderhead',{ n: 'Thunderhead', t: 'storm', c: 'arc', p: 70, a: 100, fld: 'thunderhead', d: 'Seeds the sky. Raises a Thunderhead that steadies every aim.' });
M('galeforce_lance',{ n: 'Galeforce Lance', t: 'gale', c: 'phys', p: 95, a: 95, foe: { grd: -1 }, d: 'A lance of compressed air that peels armour open.' });
M('rail_slam',  { n: 'Rail Slam', t: 'iron', c: 'phys', p: 100, a: 90, recoil: 0.1, d: 'Magnetises itself to the foe and arrives all at once.' });
M('tempest_crown',{ n: 'Tempest Crown', t: 'storm', c: 'arc', p: 90, a: 100, cd: 3, d: 'Spends every banked Charge. +20 power per Charge burned.',
  pw: c => 90 + 20 * (c.atk.counters.charge || 0), onHit: c => { c.atk.counters.charge = 0; } });

/* ---- V. Glimmoth line — light and its absence ---------------------------- */
M('glimmer_dust',{ n: 'Glimmer Dust', t: 'lumen', c: 'stat', a: 95, foe: { acc: -1 }, d: 'Scales that catch the light and ruin the foe’s aim.' });
M('radiant_beam',{ n: 'Radiant Beam', t: 'lumen', c: 'arc', p: 70, a: 100, d: 'A clean line of daylight.' });
M('moonveil_slash',{ n: 'Moonveil Slash', t: 'umbra', c: 'phys', p: 70, a: 100, self: { eva: 1 }, d: 'Cuts and steps into the afterimage.' });
M('prismbreak', { n: 'Prismbreak', t: 'lumen', c: 'arc', p: 80, a: 100, bypass: true, d: 'Splits the foe’s wards apart. Ignores raised Guard and Ward.' });
M('solar_flare',{ n: 'Solar Flare', t: 'lumen', c: 'arc', p: 115, a: 90, cd: 3, foe: { acc: -1 }, d: 'A silent white detonation that leaves the foe blinking.' });
M('duskwing_reap',{ n: 'Duskwing Reap', t: 'umbra', c: 'phys', p: 80, a: 100, drain: 0.5, d: 'Takes vitality and keeps half of it.' });
M('lumenfall',  { n: 'Lumenfall', t: 'lumen', c: 'arc', p: 100, a: 95, cd: 2, d: 'Doubles against anything standing in an Eclipse.',
  pw: c => (c.bt.field === 'eclipse' ? 200 : 100) });
M('shadowpin',  { n: 'Shadowpin', t: 'umbra', c: 'stat', a: 100, mk: ['root', 1], foe: { eva: -1 }, d: 'Nails the foe’s shadow down. It cannot be recalled.' });

/* ---- VI. Gravelump line — armour that answers back ----------------------- */
M('pebble_slam',{ n: 'Pebble Slam', t: 'stone', c: 'phys', p: 50, a: 100, d: 'Throws its own bulk shoulder-first.' });
M('tremor',     { n: 'Tremor', t: 'stone', c: 'phys', p: 65, a: 95, foe: { eva: -1 }, d: 'The ground bucks. Nothing dodges well on it.' });
M('granite_guard',{ n: 'Granite Guard', t: 'stone', c: 'stat', a: 0, self: { grd: 2 }, d: 'Locks its plates together. Guard rises sharply.' });
M('avalanche',  { n: 'Avalanche', t: 'stone', c: 'phys', p: 70, a: 100, d: 'Doubles in power if it was struck earlier this turn.',
  pw: c => (c.atk.tookHitThisTurn ? 140 : 70) });
M('tectonic_maul',{ n: 'Tectonic Maul', t: 'stone', c: 'phys', p: 105, a: 85, cd: 2, fld: 'tremor', d: 'Splits the plate beneath them both. Raises a Tremorfield.' });
M('alloy_crush',{ n: 'Alloy Crush', t: 'iron', c: 'phys', p: 85, a: 95, foe: { grd: -1 }, d: 'Deforms armour rather than breaking it.' });
M('sulfur_bite',{ n: 'Sulfur Bite', t: 'venom', c: 'phys', p: 75, a: 100, st: ['poison', 0.4], d: 'Teeth wet with yellow rock-blood.' });
M('bedrock_slam',{ n: 'Bedrock Slam', t: 'stone', c: 'phys', p: 130, a: 80, cd: 3, recoil: 0.15, d: 'Everything it has, delivered downward.' });

/* ---- VII. Frostnip line — slow them, then break them --------------------- */
M('frost_nip',  { n: 'Frost Nip', t: 'frost', c: 'phys', p: 45, a: 100, st: ['chill', 0.3], d: 'A small bite that leaves a large cold.' });
M('icicle_volley',{ n: 'Icicle Volley', t: 'frost', c: 'phys', p: 28, a: 95, hits: [2, 3], d: 'A rack of spines thrown in sequence.' });
M('permafrost', { n: 'Permafrost', t: 'frost', c: 'arc', p: 65, a: 100, fld: 'whiteout', d: 'The air gives up its heat. Raises a Whiteout.' });
M('glacial_maul',{ n: 'Glacial Maul', t: 'frost', c: 'phys', p: 95, a: 90, foe: { swf: -1 }, d: 'A slab of ice swung like a limb.' });
M('rime_spike', { n: 'Rime Spike', t: 'stone', c: 'phys', p: 85, a: 100, mk: ['bleed', 0.35], d: 'Frozen grit driven in and left there.' });
M('mindfrost',  { n: 'Mindfrost', t: 'mind', c: 'arc', p: 80, a: 100, st: ['daze', 0.3], d: 'Cold that reaches past the body.' });
M('shatterblow',{ n: 'Shatterblow', t: 'frost', c: 'phys', p: 75, a: 100, d: 'Doubles in power against a Chilled foe.',
  pw: c => (c.def.status === 'chill' ? 150 : 75) });
M('absolute_still',{ n: 'Absolute Still', t: 'frost', c: 'arc', p: 110, a: 85, cd: 3, st: ['chill', 0.6], d: 'Stops every moving thing in a small sphere.' });

/* ---- VIII. Nullwisp line — know first, act first ------------------------- */
M('mind_spike', { n: 'Mind Spike', t: 'mind', c: 'arc', p: 50, a: 100, d: 'A thought sharpened to a point.' });
M('foresight',  { n: 'Foresight', t: 'mind', c: 'stat', a: 0, self: { arc: 1, acc: 1 }, d: 'Reads a second ahead. Arcana and aim both sharpen.' });
M('psi_lance',  { n: 'Psi Lance', t: 'mind', c: 'arc', p: 85, a: 100, foe: { wrd: -1 }, d: 'Goes through the ward rather than around it.' });
M('null_field', { n: 'Null Field', t: 'mind', c: 'stat', a: 0, d: 'Erases every stat change on the field, both sides.',
  onHit: c => { c.wipeStages(); c.log('Every rise and fall is erased.'); } });
M('oracle_ray', { n: 'Oracle Ray', t: 'lumen', c: 'arc', p: 90, a: 0, d: 'Aimed where the foe is going to be. Never misses.' });
M('void_grasp', { n: 'Void Grasp', t: 'umbra', c: 'arc', p: 75, a: 100, d: 'Closes on the foe’s reserves and drains two Focus into the caster.',
  onHit: c => { const t = Math.min(2, c.def.focus); c.def.focus -= t; c.atk.focus = Math.min(c.atk.focusMax, c.atk.focus + t); if (t) c.log(c.def.name + ' loses ' + t + ' Focus to the grasp.'); } });
M('certainty',  { n: 'Certainty', t: 'mind', c: 'arc', p: 100, a: 0, cd: 2, d: 'A conclusion, delivered. Unerring, and it ignores raised defences.', bypass: true });
M('unmake',     { n: 'Unmake', t: 'mind', c: 'arc', p: 125, a: 90, cd: 3, foe: { arc: -1, wrd: -1 }, d: 'Argues the foe out of its own shape.' });

/* ---- IX. Gustling — hit, leave, hit again -------------------------------- */
M('gust_cut',   { n: 'Gust Cut', t: 'gale', c: 'phys', p: 50, a: 100, d: 'A thin blade of moving air.' });
M('updraft',    { n: 'Updraft', t: 'gale', c: 'stat', a: 0, self: { swf: 2 }, d: 'Rides its own wind. Swift rises sharply.' });
M('featherfall',{ n: 'Featherfall', t: 'gale', c: 'phys', p: 45, a: 100, pri: 2, d: 'Arrives before anything else on the field.' });
M('cyclone_wrap',{ n: 'Cyclone Wrap', t: 'gale', c: 'arc', p: 80, a: 95, foe: { acc: -1 }, d: 'Spins the foe until the horizon stops agreeing with them.' });
M('skyshear',   { n: 'Skyshear', t: 'gale', c: 'phys', p: 90, a: 95, d: 'Gains 30 power if the user is faster than the foe.',
  pw: c => (c.atk.spd > c.def.spd ? 120 : 90) });
M('eye_of_calm',{ n: 'Eye of Calm', t: 'gale', c: 'stat', a: 0, heal: 0.25, self: { eva: 1 }, d: 'Steps into the still centre. Mends and grows hard to catch.' });

/* ---- X. Venomite — patience, in the blood -------------------------------- */
M('acid_spit',  { n: 'Acid Spit', t: 'venom', c: 'arc', p: 50, a: 100, foe: { grd: -1 }, d: 'Eats armour before it eats anything else.' });
M('toxin_fang', { n: 'Toxin Fang', t: 'venom', c: 'phys', p: 60, a: 100, st: ['poison', 0.5], d: 'Half of everything it bites is poisoned.' });
M('miasma',     { n: 'Miasma', t: 'venom', c: 'stat', a: 90, st: ['poison', 1], foe: { swf: -1 }, d: 'A low, heavy cloud. Poisons without fail.' });
M('creeping_rot',{ n: 'Creeping Rot', t: 'venom', c: 'arc', p: 70, a: 100, d: 'Doubles against a poisoned foe.',
  pw: c => (c.def.status === 'poison' ? 140 : 70) });
M('carapace_snap',{ n: 'Carapace Snap', t: 'iron', c: 'phys', p: 80, a: 100, mk: ['bleed', 0.4], d: 'Shears through the shell and leaves the wound open.' });
M('final_dose', { n: 'Final Dose', t: 'venom', c: 'arc', p: 100, a: 90, cd: 3, d: 'Spends the poison already in the foe. +50 power if they are poisoned, and it cures them.',
  pw: c => (c.def.status === 'poison' ? 150 : 100), onHit: c => { if (c.def.status === 'poison') c.clearStatus(c.def); } });

/* ---- XI. Scrapjaw — armour, and the removal of armour -------------------- */
M('scrap_bite', { n: 'Scrap Bite', t: 'iron', c: 'phys', p: 55, a: 100, d: 'Teeth like sheared plate.' });
M('plate_up',   { n: 'Plate Up', t: 'iron', c: 'stat', a: 0, self: { grd: 1, frc: 1 }, d: 'Welds fresh scrap on. Guard and Force both rise.' });
M('rivet_shot', { n: 'Rivet Shot', t: 'iron', c: 'arc', p: 65, a: 100, mk: ['bleed', 0.3], d: 'Fires a hot rivet and leaves it in.' });
M('sunder',     { n: 'Sunder', t: 'iron', c: 'phys', p: 80, a: 95, foe: { grd: -2 }, d: 'Goes for the joints. Guard falls hard.' });
M('junkyard_hail',{ n: 'Junkyard Hail', t: 'iron', c: 'phys', p: 25, a: 90, hits: [2, 4], d: 'Everything it is carrying, all at once.' });
M('press',      { n: 'Hydraulic Press', t: 'iron', c: 'phys', p: 110, a: 85, cd: 3, foe: { swf: -1 }, d: 'Slow, total, and very hard to be underneath.' });

/* ---- XII. Shadeling — never quite where you struck ----------------------- */
M('shade_claw', { n: 'Shade Claw', t: 'umbra', c: 'phys', p: 55, a: 100, d: 'A claw that arrives from the wrong direction.' });
M('vanish',     { n: 'Vanish', t: 'umbra', c: 'stat', a: 0, self: { eva: 2 }, d: 'Steps sideways out of being looked at.' });
M('nightmare',  { n: 'Nightmare', t: 'umbra', c: 'arc', p: 70, a: 100, st: ['daze', 0.35], d: 'Shows the foe something it cannot unsee.' });
M('umbral_drain',{ n: 'Umbral Drain', t: 'umbra', c: 'arc', p: 70, a: 100, drain: 0.5, d: 'Feeds on what it takes.' });
M('ambush',     { n: 'Ambush', t: 'umbra', c: 'phys', p: 65, a: 100, pri: 1, d: 'Doubles in power on the turn it enters the field.',
  pw: c => (c.atk.justSwitchedIn ? 130 : 65) });
M('eclipse_veil',{ n: 'Eclipse Veil', t: 'umbra', c: 'arc', p: 85, a: 95, cd: 2, fld: 'eclipse', d: 'Pulls the dark over everything. Raises an Eclipse.' });

/* ---- capstones ---------------------------------------------------------- */
M('forge_hammer',  { n: 'Forge Hammer', t: 'iron', c: 'phys', p: 120, a: 90, cd: 3, foe: { grd: -1 },
  d: 'Brings the anvil to the work. Leaves the foe’s Guard bent out of true.' });
M('nightfall_rend',{ n: 'Nightfall Rend', t: 'umbra', c: 'phys', p: 120, a: 95, cd: 3, self: { crit: 1 },
  d: 'One cut delivered in the dark, and then a second before the first is noticed.' });
M('glacier_calve', { n: 'Glacier Calve', t: 'frost', c: 'phys', p: 125, a: 85, cd: 3, st: ['chill', 0.4],
  d: 'Sheds a face of itself onto the foe. What is left standing is usually cold.' });
M('void_collapse', { n: 'Void Collapse', t: 'umbra', c: 'arc', p: 125, a: 90, cd: 3, drain: 0.3,
  d: 'Folds a small space shut with the foe inside it, and keeps a little of what spills.' });
