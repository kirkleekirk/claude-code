/* ============================================================================
   GROWTH LATTICES — one per family, and no two alike.
   Motes are spent ring by ring. Evolution is a node like any other: choosing
   one branch permanently closes the other, and half the lattice with it.
   ========================================================================== */
const LATTICES = {};
const RING_COST = [0, 2, 3, 4, 5, 8];
const RING_LV   = [1, 1,  6, 14, 22, 32];
const SOLO_LV   = [1, 1,  6, 14, 30];
const SOLO_COST = [0, 2, 3, 4, 8];

const L = (fam, o) => { o.fam = fam; LATTICES[fam] = o; return o; };
const N = (id, r, c, k, ref, o) => Object.assign({ id, r, c, k, ref: ref || null }, o || {});

/* ---------------- I. Emberkit ------------------------------------------- */
L('emberkit', {
  title: 'The Banked Fire',
  blurb: 'Heat kept rather than spent. Every attack banks a little more, and the lattice forks between wearing that heat as armour or carrying it as a knife.',
  nodes: [
    N('ek0', 0, 0, 'core', 'ember_fang'),
    N('ek_kin', 1, -1.3, 'passive', 'kindling', { req: ['ek0'] }),
    N('ek_flare', 1, 0, 'move', 'flare_step', { req: ['ek0'] }),
    N('ek_smol', 1, 1.3, 'move', 'smolder', { req: ['ek0'] }),
    N('ek_coal', 2, -2.0, 'stat', null, { req: ['ek_kin'], n: 'Coalcore', stat: { hp: 14, frc: 8 } }),
    N('ek_bank', 2, -0.7, 'ability', 'bank_the_coals', { req: ['ek_flare'] }),
    N('ek_wick', 2, 0.7, 'passive', 'wickburn', { req: ['ek_smol'] }),
    N('ek_magma', 2, 2.0, 'move', 'magma_lash', { req: ['ek_smol'] }),
    N('ek_evoA', 3, -2.4, 'evolve', 'pyrelisk', { req: ['ek_coal'], excl: 'evo' }),
    N('ek_sun', 3, 0, 'move', 'sunbrand', { req: ['ek_bank'] }),
    N('ek_evoB', 3, 2.4, 'evolve', 'cinderfox', { req: ['ek_magma'], excl: 'evo' }),
    N('ek_iron', 4, -3.0, 'move', 'ironclad_bash', { req: ['ek_evoA'] }),
    N('ek_skin', 4, -1.6, 'passive', 'cinderskin', { req: ['ek_evoA'] }),
    N('ek_ash', 4, 0, 'ability', 'ashen_veil', { req: ['ek_sun'] }),
    N('ek_night', 4, 1.6, 'move', 'nightsear', { req: ['ek_evoB'] }),
    N('ek_haze', 4, 3.0, 'passive', 'heat_haze', { req: ['ek_evoB'] }),
    N('ek_capA', 5, -2.3, 'passive', 'phoenix_ember', { req: ['ek_skin'] }),
    N('ek_immo', 5, 0, 'ability', 'immolate', { req: ['ek_ash'] }),
    N('ek_capB', 5, 2.3, 'move', 'cinder_nova', { req: ['ek_night'] }),
  ]
});

/* ---------------- II. Brookling ----------------------------------------- */
L('brookling', {
  title: 'The Long Current',
  blurb: 'Water wins by not stopping. Tide moves compound while they keep coming, and the fork asks whether to become the riverbed or the flood.',
  nodes: [
    N('bk0', 0, 0, 'core', 'brine_jet'),
    N('bk_flow', 1, -1.3, 'passive', 'momentum', { req: ['bk0'] }),
    N('bk_und', 1, 0, 'move', 'undertow', { req: ['bk0'] }),
    N('bk_deep', 1, 1.3, 'move', 'deepcall', { req: ['bk0'] }),
    N('bk_hull', 2, -2.0, 'passive', 'pressure_hull', { req: ['bk_flow'] }),
    N('bk_coil', 2, -0.7, 'move', 'tidal_coil', { req: ['bk_und'] }),
    N('bk_mist', 2, 0.7, 'move', 'mistveil', { req: ['bk_und'] }),
    N('bk_mass', 2, 2.0, 'stat', null, { req: ['bk_deep'], n: 'Riverbed Mass', stat: { hp: 16, wrd: 8 } }),
    N('bk_evoA', 3, -2.4, 'evolve', 'tidewarden', { req: ['bk_hull'], excl: 'evo' }),
    N('bk_del', 3, 0, 'move', 'deluge', { req: ['bk_coil'] }),
    N('bk_evoB', 3, 2.4, 'evolve', 'maelstrix', { req: ['bk_mass'], excl: 'evo' }),
    N('bk_bul', 4, -3.0, 'move', 'bulwark_wave', { req: ['bk_evoA'] }),
    N('bk_grip', 4, -1.6, 'passive', 'undertow_grip', { req: ['bk_evoA'] }),
    N('bk_pool', 4, 0, 'ability', 'tidepool', { req: ['bk_del'] }),
    N('bk_cur', 4, 1.6, 'passive', 'deepcurrent', { req: ['bk_evoB'] }),
    N('bk_rip', 4, 3.0, 'ability', 'riptide', { req: ['bk_evoB'] }),
    N('bk_capA', 5, -2.3, 'passive', 'tidewalker', { req: ['bk_grip'] }),
    N('bk_shift', 5, 0, 'ability', 'current_shift', { req: ['bk_pool'] }),
    N('bk_capB', 5, 2.3, 'move', 'stormsurge', { req: ['bk_cur'] }),
  ]
});

/* ---------------- III. Mosskit ------------------------------------------ */
L('mosskit', {
  title: 'The Slow Return',
  blurb: 'Nothing here pays out immediately. Mend a little every turn, hold the foe in place, and let the arithmetic finish the fight — as armour, or as a garden.',
  nodes: [
    N('mk0', 0, 0, 'core', 'seed_lash'),
    N('mk_reg', 1, -1.3, 'passive', 'verdant_bloom', { req: ['mk0'] }),
    N('mk_snare', 1, 0, 'move', 'root_snare', { req: ['mk0'] }),
    N('mk_photo', 1, 1.3, 'move', 'photosynth', { req: ['mk0'] }),
    N('mk_thorn', 2, -2.0, 'passive', 'thornhide', { req: ['mk_reg'] }),
    N('mk_bram', 2, -0.7, 'move', 'bramble_burst', { req: ['mk_snare'] }),
    N('mk_graft', 2, 0.7, 'ability', 'graft', { req: ['mk_photo'] }),
    N('mk_mass', 2, 2.0, 'stat', null, { req: ['mk_photo'], n: 'Heartgrain', stat: { hp: 18, grd: 6 } }),
    N('mk_evoA', 3, -2.4, 'evolve', 'thornmane', { req: ['mk_thorn'], excl: 'evo' }),
    N('mk_spore', 3, 0, 'move', 'spore_cloud', { req: ['mk_bram'] }),
    N('mk_evoB', 3, 2.4, 'evolve', 'bloomwisp', { req: ['mk_mass'], excl: 'evo' }),
    N('mk_mant', 4, -3.0, 'move', 'thorn_mantle', { req: ['mk_evoA'] }),
    N('mk_root', 4, -1.6, 'passive', 'deep_roots', { req: ['mk_evoA'] }),
    N('mk_over', 4, 0, 'ability', 'overgrow', { req: ['mk_spore'] }),
    N('mk_ray', 4, 1.6, 'move', 'sunbloom_ray', { req: ['mk_evoB'] }),
    N('mk_heart', 4, 3.0, 'passive', 'heartwood', { req: ['mk_evoB'] }),
    N('mk_capA', 5, -2.3, 'passive', 'spore_wake', { req: ['mk_root'] }),
    N('mk_bank', 5, 0, 'ability', 'seedbank', { req: ['mk_over'] }),
    N('mk_capB', 5, 2.3, 'move', 'overgrowth', { req: ['mk_heart'] }),
  ]
});

/* ---------------- IV. Zaplet -------------------------------------------- */
L('zaplet', {
  title: 'Charge and Spend',
  blurb: 'A battery with opinions. Bank Charge, then decide where it goes — out through the wings as speed, or down into iron as a single enormous hit.',
  nodes: [
    N('zp0', 0, 0, 'core', 'spark_dart'),
    N('zp_arc', 1, -1.3, 'move', 'arc_lash', { req: ['zp0'] }),
    N('zp_over', 1, 0, 'move', 'overcharge', { req: ['zp0'] }),
    N('zp_stat', 1, 1.3, 'passive', 'static_field', { req: ['zp0'] }),
    N('zp_swf', 2, -2.0, 'stat', null, { req: ['zp_arc'], n: 'Arcwire', stat: { swf: 12, arc: 8 } }),
    N('zp_chain', 2, -0.9, 'move', 'chain_bolt', { req: ['zp_arc'] }),
    N('zp_cond', 2, 0, 'passive', 'conduction', { req: ['zp_over'] }),
    N('zp_cap', 2, 0.9, 'ability', 'capacitor', { req: ['zp_over'] }),
    N('zp_dyn', 2, 2.0, 'passive', 'dynamo', { req: ['zp_stat'] }),
    N('zp_evoA', 3, -2.4, 'evolve', 'voltairn', { req: ['zp_swf'], excl: 'evo' }),
    N('zp_thun', 3, 0, 'move', 'thunderhead', { req: ['zp_cond'] }),
    N('zp_evoB', 3, 2.4, 'evolve', 'arcforge', { req: ['zp_dyn'], excl: 'evo' }),
    N('zp_lance', 4, -3.0, 'move', 'galeforce_lance', { req: ['zp_evoA'] }),
    N('zp_flash', 4, -1.6, 'passive', 'flashstep', { req: ['zp_evoA'] }),
    N('zp_dis', 4, 0, 'ability', 'discharge', { req: ['zp_thun'] }),
    N('zp_rail', 4, 1.6, 'move', 'rail_slam', { req: ['zp_evoB'] }),
    N('zp_grnd', 4, 3.0, 'passive', 'grounding_rod', { req: ['zp_evoB'] }),
    N('zp_capA', 5, -2.3, 'move', 'tempest_crown', { req: ['zp_flash'] }),
    N('zp_stake', 5, 0, 'ability', 'grounding_stake', { req: ['zp_dis'] }),
    N('zp_capB', 5, 2.3, 'move', 'forge_hammer', { req: ['zp_grnd'] }),
  ]
});

/* ---------------- V. Glimmoth ------------------------------------------- */
L('glimmoth', {
  title: 'Two Halves of a Lamp',
  blurb: 'The same wing, read twice. One branch feeds on light and gives it back; the other ate its own and moves faster for the loss.',
  nodes: [
    N('gm0', 0, 0, 'core', 'radiant_beam'),
    N('gm_dust', 1, -1.3, 'move', 'glimmer_dust', { req: ['gm0'] }),
    N('gm_moon', 1, 0, 'move', 'moonveil_slash', { req: ['gm0'] }),
    N('gm_light', 1, 1.3, 'passive', 'mothlight', { req: ['gm0'] }),
    N('gm_phage', 2, -2.0, 'passive', 'photophage', { req: ['gm_dust'] }),
    N('gm_wing', 2, -0.7, 'ability', 'wingdust', { req: ['gm_dust'] }),
    N('gm_prism', 2, 0.7, 'move', 'prismbreak', { req: ['gm_moon'] }),
    N('gm_flick', 2, 2.0, 'passive', 'flicker', { req: ['gm_light'] }),
    N('gm_evoA', 3, -2.4, 'evolve', 'solmoth', { req: ['gm_phage'], excl: 'evo' }),
    N('gm_mimic', 3, 0, 'passive', 'umbral_mimic', { req: ['gm_prism'] }),
    N('gm_evoB', 3, 2.4, 'evolve', 'duskmoth', { req: ['gm_flick'], excl: 'evo' }),
    N('gm_fall', 4, -3.0, 'move', 'lumenfall', { req: ['gm_evoA'] }),
    N('gm_arc', 4, -1.6, 'stat', null, { req: ['gm_evoA'], n: 'Sunplate', stat: { arc: 12, wrd: 8 } }),
    N('gm_ecl', 4, 0, 'ability', 'eclipse_call', { req: ['gm_mimic'] }),
    N('gm_reap', 4, 1.6, 'move', 'duskwing_reap', { req: ['gm_evoB'] }),
    N('gm_fed', 4, 3.0, 'passive', 'duskfed', { req: ['gm_evoB'] }),
    N('gm_capA', 5, -2.3, 'move', 'solar_flare', { req: ['gm_fall'] }),
    N('gm_shrd', 5, 0, 'ability', 'lumen_shroud', { req: ['gm_ecl'] }),
    N('gm_capB', 5, 2.3, 'move', 'nightfall_rend', { req: ['gm_reap'] }),
  ]
});

/* ---------------- VI. Gravelump ----------------------------------------- */
L('gravelump', {
  title: 'Everything Answers',
  blurb: 'A lattice built on being hit. Damage taken is a resource here; the fork decides whether it comes back as a wall or as a mouth.',
  nodes: [
    N('gl0', 0, 0, 'core', 'pebble_slam'),
    N('gl_hide', 1, -1.3, 'passive', 'stonehide', { req: ['gl0'] }),
    N('gl_guard', 1, 0, 'move', 'granite_guard', { req: ['gl0'] }),
    N('gl_trem', 1, 1.3, 'move', 'tremor', { req: ['gl0'] }),
    N('gl_wt', 2, -2.0, 'passive', 'weighted', { req: ['gl_hide'] }),
    N('gl_aval', 2, -0.7, 'move', 'avalanche', { req: ['gl_guard'] }),
    N('gl_mass', 2, 0.7, 'stat', null, { req: ['gl_guard'], n: 'Deadweight', stat: { hp: 20, grd: 8 } }),
    N('gl_retr', 2, 2.0, 'passive', 'retribution', { req: ['gl_trem'] }),
    N('gl_evoA', 3, -2.4, 'evolve', 'bastionox', { req: ['gl_wt'], excl: 'evo' }),
    N('gl_tect', 3, 0, 'move', 'tectonic_maul', { req: ['gl_aval'] }),
    N('gl_evoB', 3, 2.4, 'evolve', 'quakemaw', { req: ['gl_retr'], excl: 'evo' }),
    N('gl_alloy', 4, -3.0, 'move', 'alloy_crush', { req: ['gl_evoA'] }),
    N('gl_ball', 4, -1.6, 'passive', 'ballast', { req: ['gl_evoA'] }),
    N('gl_ent', 4, 0, 'ability', 'entrench', { req: ['gl_tect'] }),
    N('gl_sulf', 4, 1.6, 'move', 'sulfur_bite', { req: ['gl_evoB'] }),
    N('gl_seis', 4, 3.0, 'ability', 'seismic_call', { req: ['gl_evoB'] }),
    N('gl_capA', 5, -2.3, 'passive', 'unbreakable', { req: ['gl_ball'] }),
    N('gl_ans', 5, 0, 'ability', 'stone_answer', { req: ['gl_ent'] }),
    N('gl_capB', 5, 2.3, 'move', 'bedrock_slam', { req: ['gl_sulf'] }),
  ]
});

/* ---------------- VII. Frostnip ----------------------------------------- */
L('frostnip', {
  title: 'Slow It, Then Break It',
  blurb: 'Chill is the whole plan. Everything downstream of it hits harder, crits more often, or simply arrives while the foe is still getting up.',
  nodes: [
    N('fn0', 0, 0, 'core', 'frost_nip'),
    N('fn_vol', 1, -1.3, 'move', 'icicle_volley', { req: ['fn0'] }),
    N('fn_bnd', 1, 0, 'passive', 'frostbound', { req: ['fn0'] }),
    N('fn_shell', 1, 1.3, 'passive', 'cryoshell', { req: ['fn0'] }),
    N('fn_shat', 2, -2.0, 'move', 'shatterblow', { req: ['fn_vol'] }),
    N('fn_arm', 2, -0.7, 'ability', 'frost_armour', { req: ['fn_bnd'] }),
    N('fn_perm', 2, 0.7, 'move', 'permafrost', { req: ['fn_bnd'] }),
    N('fn_cold', 2, 2.0, 'ability', 'cold_snap', { req: ['fn_shell'] }),
    N('fn_evoA', 3, -2.4, 'evolve', 'rimeclaw', { req: ['fn_shat'], excl: 'evo' }),
    N('fn_maul', 3, 0, 'move', 'glacial_maul', { req: ['fn_perm'] }),
    N('fn_evoB', 3, 2.4, 'evolve', 'glacianth', { req: ['fn_cold'], excl: 'evo' }),
    N('fn_rime', 4, -3.2, 'move', 'rime_spike', { req: ['fn_evoA'] }),
    N('fn_ava', 4, -2.0, 'passive', 'avalanche_heart', { req: ['fn_evoA'] }),
    N('fn_pt', 4, -0.9, 'passive', 'shatterpoint', { req: ['fn_evoA'] }),
    N('fn_cb', 4, 0, 'passive', 'coldblood', { req: ['fn_maul'] }),
    N('fn_mf', 4, 1.6, 'move', 'mindfrost', { req: ['fn_evoB'] }),
    N('fn_wrd', 4, 3.0, 'stat', null, { req: ['fn_evoB'], n: 'Deep Ice', stat: { wrd: 12, arc: 8 } }),
    N('fn_capA', 5, -2.3, 'move', 'glacier_calve', { req: ['fn_pt'] }),
    N('fn_hib', 5, 0, 'ability', 'hibernate', { req: ['fn_cb'] }),
    N('fn_capB', 5, 2.3, 'move', 'absolute_still', { req: ['fn_wrd'] }),
  ]
});

/* ---------------- VIII. Nullwisp ---------------------------------------- */
L('nullwisp', {
  title: 'Known in Advance',
  blurb: 'Nullwisp lattices are about information. Strip the foe’s advantages, take them for yourself, and be standing somewhere else when the answer arrives.',
  nodes: [
    N('nw0', 0, 0, 'core', 'mind_spike'),
    N('nw_fore', 1, -1.3, 'move', 'foresight', { req: ['nw0'] }),
    N('nw_lance', 1, 0, 'move', 'psi_lance', { req: ['nw0'] }),
    N('nw_well', 1, 1.3, 'passive', 'psionic_well', { req: ['nw0'] }),
    N('nw_cert', 2, -2.0, 'passive', 'certainty_p', { req: ['nw_fore'] }),
    N('nw_null', 2, -0.7, 'move', 'null_field', { req: ['nw_lance'] }),
    N('nw_mir', 2, 0.7, 'passive', 'mirror_thought', { req: ['nw_lance'] }),
    N('nw_thw', 2, 2.0, 'ability', 'thoughtwell', { req: ['nw_well'] }),
    N('nw_evoA', 3, -2.4, 'evolve', 'oracline', { req: ['nw_cert'], excl: 'evo' }),
    N('nw_aura', 3, 0, 'passive', 'null_aura', { req: ['nw_null'] }),
    N('nw_evoB', 3, 2.4, 'evolve', 'voidmind', { req: ['nw_thw'], excl: 'evo' }),
    N('nw_ray', 4, -3.2, 'move', 'oracle_ray', { req: ['nw_evoA'] }),
    N('nw_creed', 4, -2.0, 'move', 'certainty', { req: ['nw_evoA'] }),
    N('nw_wrd', 4, -0.9, 'stat', null, { req: ['nw_evoA'], n: 'Clear Sight', stat: { wrd: 12, arc: 10 } }),
    N('nw_sip', 4, 0, 'ability', 'mind_siphon', { req: ['nw_aura'] }),
    N('nw_grasp', 4, 1.6, 'move', 'void_grasp', { req: ['nw_evoB'] }),
    N('nw_unr', 4, 3.0, 'passive', 'unraveling', { req: ['nw_evoB'] }),
    N('nw_capA', 5, -2.3, 'move', 'unmake', { req: ['nw_creed'] }),
    N('nw_pre', 5, 0, 'ability', 'precognition', { req: ['nw_sip'] }),
    N('nw_capB', 5, 2.3, 'move', 'void_collapse', { req: ['nw_grasp'] }),
  ]
});

/* ---------------- IX-XII. solitary kin ---------------------------------- */
L('gustling', {
  title: 'Never Lands', solo: true,
  blurb: 'A short lattice with no fork in it — Gustling never changes shape, so every mote goes into being harder to catch and quicker to leave.',
  nodes: [
    N('gu0', 0, 0, 'core', 'gust_cut'),
    N('gu_up', 1, -1.3, 'move', 'updraft', { req: ['gu0'] }),
    N('gu_ff', 1, 0, 'move', 'featherfall', { req: ['gu0'] }),
    N('gu_light', 1, 1.3, 'passive', 'featherweight', { req: ['gu0'] }),
    N('gu_swf', 2, -2.0, 'stat', null, { req: ['gu_up'], n: 'Hollow Bones', stat: { swf: 14, frc: 6 } }),
    N('gu_cyc', 2, 0, 'move', 'cyclone_wrap', { req: ['gu_ff'] }),
    N('gu_slip', 2, 2.0, 'ability', 'slipstream', { req: ['gu_light'] }),
    N('gu_calm', 3, -1.6, 'move', 'eye_of_calm', { req: ['gu_swf'] }),
    N('gu_wind', 3, 0, 'passive', 'second_wind', { req: ['gu_cyc'] }),
    N('gu_tail', 3, 1.6, 'passive', 'tailwind', { req: ['gu_slip'] }),
    N('gu_capA', 4, -1.0, 'move', 'skyshear', { req: ['gu_calm'] }),
    N('gu_capB', 4, 1.0, 'stat', null, { req: ['gu_tail'], n: 'Stormrider', stat: { swf: 20, arc: 12, hp: 10 } }),
  ]
});
L('venomite', {
  title: 'Patient Chemistry', solo: true,
  blurb: 'Venomite does not need to win the turn. It needs the foe to still be poisoned in four turns, and it has a whole lattice about making sure of that.',
  nodes: [
    N('vn0', 0, 0, 'core', 'toxin_fang'),
    N('vn_acid', 1, -1.3, 'move', 'acid_spit', { req: ['vn0'] }),
    N('vn_mia', 1, 0, 'move', 'miasma', { req: ['vn0'] }),
    N('vn_skin', 1, 1.3, 'passive', 'toxic_skin', { req: ['vn0'] }),
    N('vn_rot', 2, -2.0, 'move', 'creeping_rot', { req: ['vn_acid'] }),
    N('vn_vir', 2, 0, 'passive', 'virulence', { req: ['vn_mia'] }),
    N('vn_mass', 2, 2.0, 'stat', null, { req: ['vn_skin'], n: 'Thick Ichor', stat: { hp: 16, wrd: 8 } }),
    N('vn_snap', 3, -1.6, 'move', 'carapace_snap', { req: ['vn_rot'] }),
    N('vn_bloom', 3, 0, 'ability', 'venom_bloom', { req: ['vn_vir'] }),
    N('vn_par', 3, 1.6, 'passive', 'parasite', { req: ['vn_mass'] }),
    N('vn_capA', 4, -1.0, 'move', 'final_dose', { req: ['vn_snap'] }),
    N('vn_capB', 4, 1.0, 'move', 'spore_cloud', { req: ['vn_par'] }),
  ]
});
L('scrapjaw', {
  title: 'Found Materials', solo: true,
  blurb: 'Armour, and the removal of armour. Scrapjaw wants the fight to last long enough that it has taken the foe apart piece by piece.',
  nodes: [
    N('sj0', 0, 0, 'core', 'scrap_bite'),
    N('sj_plate', 1, -1.3, 'move', 'plate_up', { req: ['sj0'] }),
    N('sj_riv', 1, 0, 'move', 'rivet_shot', { req: ['sj0'] }),
    N('sj_arm', 1, 1.3, 'passive', 'scrap_plating', { req: ['sj0'] }),
    N('sj_sund', 2, -2.0, 'move', 'sunder', { req: ['sj_plate'] }),
    N('sj_hail', 2, 0, 'move', 'junkyard_hail', { req: ['sj_riv'] }),
    N('sj_weld', 2, 2.0, 'ability', 'scrap_weld', { req: ['sj_arm'] }),
    N('sj_mass', 3, -1.6, 'stat', null, { req: ['sj_sund'], n: 'Ballast Plate', stat: { hp: 18, grd: 10 } }),
    N('sj_salv', 3, 0, 'passive', 'salvage', { req: ['sj_hail'] }),
    N('sj_over', 3, 1.6, 'passive', 'overbuilt', { req: ['sj_weld'] }),
    N('sj_capA', 4, -1.0, 'move', 'press', { req: ['sj_mass'] }),
    N('sj_capB', 4, 1.0, 'move', 'alloy_crush', { req: ['sj_over'] }),
  ]
});
L('shadeling', {
  title: 'Not Where You Struck', solo: true,
  blurb: 'Everything in this lattice is about the first hit and the missed one. Shadeling is fragile and does not intend to be found out.',
  nodes: [
    N('sd0', 0, 0, 'core', 'shade_claw'),
    N('sd_van', 1, -1.3, 'move', 'vanish', { req: ['sd0'] }),
    N('sd_amb', 1, 0, 'move', 'ambush', { req: ['sd0'] }),
    N('sd_night', 1, 1.3, 'passive', 'nightfed', { req: ['sd0'] }),
    N('sd_meld', 2, -2.0, 'passive', 'shadowmeld', { req: ['sd_van'] }),
    N('sd_nm', 2, 0, 'move', 'nightmare', { req: ['sd_amb'] }),
    N('sd_drain', 2, 2.0, 'move', 'umbral_drain', { req: ['sd_night'] }),
    N('sd_step', 3, -1.6, 'ability', 'nightstep', { req: ['sd_meld'] }),
    N('sd_ambu', 3, 0, 'passive', 'ambusher', { req: ['sd_nm'] }),
    N('sd_pin', 3, 1.6, 'move', 'shadowpin', { req: ['sd_drain'] }),
    N('sd_capA', 4, -1.0, 'move', 'eclipse_veil', { req: ['sd_step'] }),
    N('sd_capB', 4, 1.0, 'stat', null, { req: ['sd_pin'], n: 'Second Shadow', stat: { frc: 14, arc: 14, swf: 10 } }),
  ]
});

/* node cost / level gate, derived from ring unless overridden */
function nodeCost(fam, node) {
  if (node.cost != null) return node.cost;
  const c = (LATTICES[fam].solo ? SOLO_COST : RING_COST)[node.r];
  return c === undefined ? 2 : c;
}
function nodeLevel(fam, node) {
  if (node.lv != null) return node.lv;
  const v = (LATTICES[fam].solo ? SOLO_LV : RING_LV)[node.r];
  return v === undefined ? 1 : v;
}
