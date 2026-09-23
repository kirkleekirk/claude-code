/* Models built from primitives (origin at the feet, facing +z). Heroes are "dressed" from their gear,
   so swords, armor, backpacks, instruments and collars show up on the character. */
(function () {
  'use strict';
  const GF = DT.game.gfx;
  const D = DT.data;
  const R = DT.R;
  const MD = {};
  const G = (...a) => GF.geo(...a);
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, o);
  const INK = '#1d2340', WHITE = '#ffffff';
  const eye = (grp, x, y, z, r) => { grp.add(P(G('sphere', r || 0.05, 10, 8), INK, [x, y, z], { ink: false })); };
  const rarityGlow = (it) => (it && it.rarity >= 3 && !it.unique ? D.RARITIES[it.rarity].color : null);
  const setTint = (it, fallback) => (it && it.set ? D.SETS[it.set].color : fallback);

  /* ---------- Finn's swords ---------- */
  const SWORD_LOOK = {
    sword_wood: { blade: '#b07a45', len: 0.8, w: 0.07, d: 0.16, guard: '#6b4226', grip: '#6b4226' },
    sword_short: { blade: '#dfe6ee', len: 0.85, w: 0.07, d: 0.15, guard: '#8a8f9a', grip: '#6b4226' },
    sword_bone: { blade: '#f5f0e1', len: 0.9, w: 0.08, d: 0.17, guard: '#c8bfa8', grip: '#8a7a5c', jag: true },
    sword_great: { blade: '#cfd6de', len: 1.25, w: 0.1, d: 0.26, guard: '#5a5f6a', grip: '#3a3f4b' },
    sword_rapier: { blade: '#ffffff', len: 1.05, w: 0.035, d: 0.05, guard: '#ff5fa2', grip: '#ff8fc7', ring: true },
    sword_crystal: { blade: '#b69cff', len: 0.95, w: 0.07, d: 0.16, guard: '#7fe3ff', grip: '#3a2c6e', glow: '#6b4bff' },
    sword_scarlet: { blade: '#ffd84a', len: 0.9, w: 0.08, d: 0.16, guard: '#e8a91c', grip: '#8a5a2b', glow: '#ffae00' },
    sword_demon: { blade: '#c2213a', len: 0.95, w: 0.08, d: 0.16, guard: '#2a0a0e', grip: '#2a0a0e', glow: '#ff2a2a', jag: true },
    sword_root: { blade: '#6b8f3a', len: 1.2, w: 0.11, d: 0.24, guard: '#5a3b1e', grip: '#5a3b1e' },
    sword_grass: { blade: '#5ad05a', len: 1.35, w: 0.04, d: 0.08, guard: '#3fae4a', grip: '#3fae4a', glow: '#3fae4a' },
    sword_magma: { blade: '#ff7a2e', len: 0.9, w: 0.08, d: 0.17, guard: '#3f1c14', grip: '#3f1c14', glow: '#ff4d00' },
    sword_guardian: { blade: '#e1d6ff', len: 1.0, w: 0.08, d: 0.18, guard: '#6a58a8', grip: '#3a2c6e', glow: '#a98bff' },
    sword_night: { blade: '#2a2440', len: 1.0, w: 0.07, d: 0.16, guard: '#6b4bff', grip: '#1d1a26', glow: '#6b4bff' },
    sword_finn: { blade: '#e8fbff', len: 1.05, w: 0.08, d: 0.17, guard: '#56c3f5', grip: '#2457b8', glow: '#9fe3ff' },
  };
  MD.sword = function (it) {
    const look = SWORD_LOOK[(it && DT.meta.loot.artOf(it)) || 'sword_short'] || SWORD_LOOK.sword_short;
    const glow = look.glow || rarityGlow(it);
    const sword = new THREE.Group();
    sword.add(P(G('box', 0.07, 0.16, 0.07), look.grip, [0, 0, 0]));
    sword.add(P(G('box', look.ring ? 0.12 : 0.3, 0.05, 0.1), look.guard, [0, -0.1, 0]));
    if (look.ring) sword.add(P(G('torus', 0.09, 0.02, 12), look.guard, [0, -0.1, 0], { rot: [Math.PI / 2, 0, 0] }));
    const blade = P(G('box', look.w, look.len, look.d), look.blade, [0, -0.13 - look.len / 2, 0], glow ? { emissive: glow, ei: 0.45 } : {});
    sword.add(blade);
    if (look.jag) for (let i = 0; i < 3; i++) sword.add(P(G('cone', 0.04, 0.12, 4), look.blade, [0, -0.3 - i * 0.22, look.d / 2 + 0.03], { rot: [Math.PI / 2, 0, 0], ink: false }));
    sword.userData.blade = blade;
    sword.userData.len = look.len;
    return sword;
  };

  /* ---------- Finn ---------- */
  const HELM_LOOK = {
    hat: (g, c) => { g.add(P(G('sphere', 0.49, 18, 12, 0), c || '#8a5a2b', [0, 0.05, 0], { scale: [1, 0.7, 1] })); for (const s of [-1, 1]) g.add(P(G('sphere', 0.13, 10, 8), c || '#8a5a2b', [0.3 * s, 0.4, -0.02])); },
    helm: (g, c) => { g.add(P(G('sphere', 0.5, 18, 12), c || '#9aa3b0', [0, 0.06, -0.02], { scale: [1, 0.72, 1] })); g.add(P(G('box', 0.08, 0.3, 0.08), c || '#9aa3b0', [0, -0.08, 0.44])); },
    wizard_hat: (g, c) => { g.add(P(G('cyl', 0.55, 0.55, 0.06, 18), c || '#6a3bb8', [0, 0.2, 0])); g.add(P(G('cone', 0.36, 0.9, 16), c || '#6a3bb8', [0, 0.62, -0.05], { rot: [-0.2, 0, 0] })); },
    skull_helm: (g, c) => { g.add(P(G('sphere', 0.5, 18, 12), c || '#f5f0e1', [0, 0.06, 0], { scale: [1, 0.74, 1] })); for (const s of [-1, 1]) g.add(P(G('sphere', 0.08, 8, 6), INK, [0.16 * s, 0.14, 0.42], { ink: false })); },
    hat_og: () => {},
    hat_magic: (g) => { g.add(P(G('cyl', 0.55, 0.55, 0.06, 18), '#2a3b8f', [0, 0.22, 0])); g.add(P(G('cone', 0.34, 1.1, 16), '#6a3bb8', [0, 0.75, 0])); g.add(P(G('octa', 0.08), '#ffe14a', [0.1, 0.8, 0.26], { basic: true })); },
  };
  const BODY_LOOK = {
    tunic: '#3fae4a', chainmail: '#a4acb8', plate: '#cfd6de', robe: '#6a3bb8', plate_royal: '#ff9fcf', tunic_flame: '#ff7a2e', chainmail_crystal: '#c9b8ff',
  };
  MD.finn = function (eq) {
    eq = eq || {};
    const g = new THREE.Group();
    const p = {};
    const SK = '#ffd9c2', SHIRT = '#56c3f5', SHORTS = '#2457b8';
    const boots = eq.legs, arms = eq.arms, body = eq.body, head = eq.head, pack = eq.pack;
    const bootArt = boots ? DT.meta.loot.artOf(boots) : null;
    const bootCol = boots ? setTint(boots, { sneakers: '#e0423a', boots_iron: '#8a8f9a', boots_winged: '#f4f4f4', boots_jet: '#e0423a' }[bootArt] || '#8a8f9a') : null;
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.13 * s, 0.42, 0);
      leg.add(P(G('cyl', 0.075, 0.075, 0.26, 10), SK, [0, -0.13, 0]));
      leg.add(P(G('cyl', 0.082, 0.082, 0.14, 10), bootCol || WHITE, [0, -0.29, 0]));
      leg.add(P(G('box', 0.17, 0.1, 0.28), bootCol ? bootCol : INK, [0, -0.37, 0.05]));
      if (bootArt === 'boots_winged') leg.add(P(G('box', 0.02, 0.12, 0.16), WHITE, [0.1 * s, -0.27, -0.04], { rot: [0.4, 0, 0] }));
      if (bootArt === 'boots_jet') leg.add(P(G('cone', 0.06, 0.16, 8), '#ffae00', [0, -0.46, -0.1], { rot: [Math.PI, 0, 0], basic: true }));
      g.add(leg);
      p[s < 0 ? 'legL' : 'legR'] = leg;
    }
    g.add(P(G('cyl', 0.27, 0.29, 0.2, 16), SHORTS, [0, 0.47, 0]));
    g.add(P(G('cyl', 0.24, 0.28, 0.42, 16), SHIRT, [0, 0.77, 0]));
    if (body) {
      const art = DT.meta.loot.artOf(body);
      const col = setTint(body, BODY_LOOK[art] || '#a4acb8');
      const glow = art === 'tunic_flame' ? '#ff4d00' : rarityGlow(body);
      if (art === 'robe') g.add(P(G('cyl', 0.27, 0.38, 0.72, 16), col, [0, 0.62, 0], glow ? { emissive: glow, ei: 0.25 } : {}));
      else g.add(P(G('cyl', 0.27, 0.3, 0.44, 16), col, [0, 0.79, 0.01], glow ? { emissive: glow, ei: 0.25 } : {}));
      if (art === 'plate' || art === 'plate_royal') for (const s of [-1, 1]) g.add(P(G('sphere', 0.13, 10, 8), col, [0.3 * s, 0.98, 0]));
    }
    const packArt = pack ? DT.meta.loot.artOf(pack) : null;
    const packCol = { pack: '#3fae4a', pack_big: '#8a5a2b', pack_snack: '#f0b429', pack_finn: '#3fae4a' }[packArt];
    if (pack) {
      const big = packArt === 'pack_big' ? 1.25 : 1;
      g.add(P(G('box', 0.44 * big, 0.46 * big, 0.2 * big), packCol, [0, 0.8, -0.3 - (big - 1) * 0.1]));
      g.add(P(G('box', 0.3, 0.12, 0.06), '#2f8f3a', [0, 0.72, -0.42 - (big - 1) * 0.12], { ink: false }));
    }
    const armArt = arms ? DT.meta.loot.artOf(arms) : null;
    const handCol = arms ? setTint(arms, { gloves: '#8a5a2b', gauntlets: '#9aa3b0', gauntlets_spiked: '#7a808c', gauntlets_billy: '#e8b04a' }[armArt] || '#9aa3b0') : SK;
    for (const s of [-1, 1]) {
      const swing = new THREE.Group();
      swing.position.set(0.32 * s, 0.93, 0);
      const arm = new THREE.Group();
      arm.add(P(G('cyl', 0.065, 0.058, 0.38, 8), SK, [0, -0.19, 0]));
      if (arms) arm.add(P(G('cyl', 0.075, 0.07, 0.16, 8), handCol, [0, -0.3, 0]));
      arm.add(P(G('sphere', 0.085, 10, 8), handCol, [0, -0.4, 0]));
      if (armArt === 'gauntlets_spiked') arm.add(P(G('cone', 0.03, 0.1, 5), '#dfe6ee', [0, -0.3, 0.08], { rot: [Math.PI / 2, 0, 0], ink: false }));
      swing.add(arm);
      g.add(swing);
      p[s < 0 ? 'swingL' : 'swingR'] = swing;
      p[s < 0 ? 'armL' : 'armR'] = arm;
    }
    const sword = MD.sword(eq.weapon);
    sword.position.set(0, -0.4, 0);
    sword.rotation.x = -1.25;
    p.armR.add(sword);
    p.sword = sword;
    p.blade = sword.userData.blade;
    const hd = new THREE.Group();
    hd.position.set(0, 1.34, 0);
    hd.add(P(G('sphere', 0.45, 22, 18), WHITE, [0, 0, 0]));
    hd.add(P(G('sphere', 0.36, 22, 18), SK, [0, -0.05, 0.19], { scale: [1, 0.86, 0.66], ink: false }));
    eye(hd, -0.12, 0.0, 0.42, 0.048);
    eye(hd, 0.12, 0.0, 0.42, 0.048);
    hd.add(P(G('torus', 0.06, 0.014, 12, Math.PI), INK, [0, -0.13, 0.41], { rot: [0, 0, Math.PI], ink: false }));
    for (const s of [-1, 1]) hd.add(P(G('sphere', 0.12, 12, 10), WHITE, [0.26 * s, 0.36, -0.02]));
    if (head) { const art = DT.meta.loot.artOf(head); (HELM_LOOK[art] || HELM_LOOK.helm)(hd, head.set ? D.SETS[head.set].color : null); }
    g.add(hd);
    p.head = hd;
    g.add(GF.blob(0.55));
    g.userData.parts = p;
    return g;
  };

  /* ---------- Jake ---------- */
  const INSTRUMENT_LOOK = {
    viola: ['#a0522d', 'strings'], viola_jake: ['#8b4513', 'strings'], guitar: ['#e0423a', 'guitar'], guitar_rainbow: ['#ff8fc7', 'guitar'],
    drums: ['#f0b429', 'drum'], drums_party: ['#7fe3ff', 'drum'], bass: ['#6b4226', 'bass'], bass_axe: ['#c2213a', 'axe'],
    trumpet: ['#f0c419', 'horn'], trumpet_guardian: ['#ff8fc7', 'horn'], accordion: ['#e0423a', 'box'], accordion_lsp: ['#b58bff', 'box'],
    banjo: ['#e8d8b0', 'banjo'], banjo_trunks: ['#7ed957', 'banjo'], keytar: ['#f4f4f4', 'keys'], keytar_cosmic: ['#6a58a8', 'keys'],
  };
  function instrumentMesh(it) {
    const art = DT.meta.loot.artOf(it);
    const [col, shape] = INSTRUMENT_LOOK[art] || ['#a0522d', 'strings'];
    const glow = it.unique ? '#ffd24a' : rarityGlow(it);
    const o = glow ? { emissive: glow, ei: 0.2 } : {};
    const g = new THREE.Group();
    switch (shape) {
      case 'guitar': g.add(P(G('sphere', 0.26, 14, 10), col, [0, -0.1, 0], Object.assign({ scale: [1, 1.2, 0.35] }, o))); g.add(P(G('box', 0.06, 0.6, 0.05), '#3b2a1a', [0, 0.4, 0])); break;
      case 'drum': g.add(P(G('cyl', 0.3, 0.3, 0.32, 16), col, [0, 0, 0], o)); g.add(P(G('cyl', 0.31, 0.31, 0.04, 16), WHITE, [0, 0.17, 0], { ink: false })); break;
      case 'bass': g.add(P(G('sphere', 0.32, 14, 10), col, [0, -0.15, 0], Object.assign({ scale: [0.9, 1.4, 0.35] }, o))); g.add(P(G('box', 0.07, 0.8, 0.06), '#2a1a0a', [0, 0.55, 0])); break;
      case 'axe': g.add(P(G('box', 0.08, 1.0, 0.06), '#2a1a0a', [0, 0.2, 0])); g.add(P(G('box', 0.55, 0.45, 0.06), col, [0.12, -0.2, 0], o)); break;
      case 'horn': g.add(P(G('cone', 0.2, 0.5, 14), col, [0, 0.1, 0], Object.assign({ rot: [Math.PI, 0, 0] }, o))); g.add(P(G('cyl', 0.05, 0.05, 0.4, 8), col, [0, -0.28, 0])); break;
      case 'box': g.add(P(G('box', 0.5, 0.36, 0.26), col, [0, 0, 0], o)); g.add(P(G('box', 0.52, 0.06, 0.28), WHITE, [0, 0, 0], { ink: false })); break;
      case 'banjo': g.add(P(G('cyl', 0.24, 0.24, 0.08, 16), col, [0, -0.1, 0], Object.assign({ rot: [Math.PI / 2, 0, 0] }, o))); g.add(P(G('box', 0.05, 0.6, 0.04), '#6b4226', [0, 0.38, 0])); break;
      case 'keys': g.add(P(G('box', 0.62, 0.2, 0.06), col, [0, 0, 0], o)); g.add(P(G('box', 0.5, 0.06, 0.02), INK, [0, -0.02, 0.04], { ink: false })); break;
      default: g.add(P(G('sphere', 0.22, 14, 10), col, [0, -0.08, 0], Object.assign({ scale: [0.9, 1.3, 0.35] }, o))); g.add(P(G('box', 0.05, 0.5, 0.04), '#3b2a1a', [0, 0.35, 0]));
    }
    return g;
  }
  const COLLAR_LOOK = { collar: '#e0423a', collar_spiked: '#2a2e38', collar_bell: '#3d8bfd', bow_tie: '#e0423a', collar_holding: '#ffcf3d', scarf_rainbow: '#ff8fc7' };
  MD.jake = function (eq) {
    eq = eq || {};
    const g = new THREE.Group();
    const p = {};
    const OR = '#f6b42a', OR2 = '#dd931c', LIGHT = '#fcd371';
    const body = new THREE.Group();
    g.add(body);
    p.body = body;
    body.add(P(G('sphere', 0.62, 22, 18), OR, [0, 0.72, 0], { scale: [1, 0.9, 0.86] }));
    body.add(P(G('sphere', 0.52, 22, 18), OR, [0, 1.24, 0.05]));
    for (const s of [-1, 1]) body.add(P(G('sphere', 0.2, 14, 12), LIGHT, [0.17 * s, 1.07, 0.42]));
    body.add(P(G('sphere', 0.09, 12, 10), INK, [0, 1.2, 0.57], { scale: [1.3, 0.85, 1], ink: false }));
    for (const s of [-1, 1]) {
      body.add(P(G('sphere', 0.14, 14, 12), WHITE, [0.2 * s, 1.4, 0.4]));
      eye(body, 0.2 * s, 1.4, 0.53, 0.07);
      body.add(P(G('sphere', 0.26, 14, 12), OR2, [0.52 * s, 1.3, -0.02], { scale: [0.34, 1, 0.62], rot: [0, 0, 0.38 * s] }));
    }
    body.add(P(G('torus', 0.09, 0.016, 12, Math.PI), INK, [0, 1.02, 0.5], { rot: [0.2, 0, Math.PI], ink: false }));
    body.add(P(G('cone', 0.08, 0.34, 8), OR2, [0, 0.62, -0.58], { rot: [-2.2, 0, 0] }));
    for (const s of [-1, 1]) {
      body.add(P(G('cyl', 0.1, 0.1, 0.24, 10), OR, [0.26 * s, 0.14, 0]));
      body.add(P(G('sphere', 0.13, 12, 10), OR, [0.26 * s, 0.06, 0.08], { scale: [1, 0.6, 1.3] }));
    }
    if (eq.collar) {
      const art = DT.meta.loot.artOf(eq.collar);
      const col = COLLAR_LOOK[art] || '#e0423a';
      if (art === 'bow_tie') { for (const s of [-1, 1]) body.add(P(G('cone', 0.1, 0.16, 4), col, [0.09 * s, 0.9, 0.5], { rot: [0, 0, (Math.PI / 2) * s] })); }
      else if (art === 'scarf_rainbow') { body.add(P(G('torus', 0.46, 0.07, 18), col, [0, 0.92, 0.02], { rot: [Math.PI / 2, 0, 0], emissive: '#ff5fb4', ei: 0.3 })); }
      else body.add(P(G('torus', 0.46, 0.05, 18), col, [0, 0.92, 0.02], { rot: [Math.PI / 2, 0, 0] }));
      if (art === 'collar_bell' || art === 'collar_holding') body.add(P(G('sphere', 0.07, 10, 8), '#ffcf3d', [0, 0.84, 0.46]));
      if (art === 'collar_spiked') for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; body.add(P(G('cone', 0.03, 0.1, 5), '#dfe6ee', [Math.sin(a) * 0.5, 0.92, Math.cos(a) * 0.5], { rot: [Math.PI / 2, 0, -a], ink: false })); }
    }
    if (eq.instrument) {
      const inst = instrumentMesh(eq.instrument);
      inst.position.set(0, 0.9, -0.6);
      inst.rotation.z = 0.5;
      body.add(inst);
      p.instrument = inst;
    }
    const fistCol = eq.instrument && eq.instrument.rarity >= 3 ? D.RARITIES[eq.instrument.rarity].color : null;
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(0.6 * s, 0.86, 0);
      const seg = P(G('cyl', 0.065, 0.065, 1, 8), OR, [0, -0.22, 0], { scale: [1, 0.44, 1] });
      const fist = P(G('sphere', 0.15, 12, 10), OR, [0, -0.46, 0], fistCol ? { emissive: fistCol, ei: 0.35 } : {});
      arm.add(seg, fist);
      arm.rotation.z = 0.15 * s;
      body.add(arm);
      p[s < 0 ? 'armL' : 'armR'] = { group: arm, seg, fist, len: 0.44 };
    }
    g.add(GF.blob(0.7));
    g.userData.parts = p;
    return g;
  };
  /* Stretch one of Jake's arms to length L along its local -y. */
  MD.stretchArm = function (arm, L) {
    arm.seg.scale.y = L;
    arm.seg.position.y = -L / 2;
    arm.fist.position.y = -L - 0.02;
    arm.len = L;
  };
  /* A loose fist (for extra fists from split punches). */
  MD.fist = function (color) {
    const g = new THREE.Group();
    g.add(P(G('sphere', 0.17, 12, 10), color || '#f6b42a', [0, 0, 0]));
    return g;
  };

  MD.hero = (id, eq) => (id === 'finn' ? MD.finn(eq) : MD.jake(eq));
  DT.game.models = MD;
})();

/* ---------- enemies and bosses ---------- */
(function () {
  'use strict';
  const GF = DT.game.gfx;
  const R = DT.R;
  const MD = DT.game.models;
  const G = (...a) => GF.geo(...a);
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, o);
  const INK = '#1d2340', WHITE = '#ffffff';
  const eye = (grp, x, y, z, r) => { grp.add(P(G('sphere', r || 0.05, 10, 8), INK, [x, y, z], { ink: false })); };
  const PASTELS = ['#ffb3d1', '#b8f0d8', '#d8c4ff', '#ffd6a8', '#bfe6ff'];
  function crown(y, s, col) {
    const c = new THREE.Group();
    c.position.y = y;
    c.scale.setScalar(s || 1);
    c.add(P(G('cyl', 0.3, 0.33, 0.2, 16), col || '#ffcf3d', [0, 0, 0]));
    for (let i = -1; i <= 1; i++) {
      c.add(P(G('cone', 0.08, 0.32, 8), col || '#ffcf3d', [i * 0.18, 0.24, 0.16 - Math.abs(i) * 0.06]));
      c.add(P(G('sphere', 0.06, 8, 6), '#e0283a', [i * 0.18, 0.05, 0.3 - Math.abs(i) * 0.05], { basic: true }));
    }
    return c;
  }

  function body(def, g, p) {
    const b = new THREE.Group();
    g.add(b);
    p.body = b;
    const c = def.color;
    switch (def.model) {
      case 'penguin': {
        const bc = def.tint || '#26283a';
        b.add(P(G('sphere', 0.42, 18, 14), bc, [0, 0.52, 0], { scale: [1, 1.25, 1] }));
        b.add(P(G('sphere', 0.34, 18, 14), WHITE, [0, 0.47, 0.17], { scale: [0.9, 1.1, 0.55], ink: false }));
        for (const s of [-1, 1]) { b.add(P(G('sphere', 0.08, 10, 8), WHITE, [0.12 * s, 0.84, 0.34], { ink: false })); eye(b, 0.12 * s, 0.84, 0.41, 0.04); }
        b.add(P(G('cone', 0.09, 0.24, 10), '#ff9d2e', [0, 0.72, 0.46], { rot: [Math.PI / 2, 0, 0] }));
        for (const s of [-1, 1]) {
          b.add(P(G('sphere', 0.11, 10, 8), '#ff9d2e', [0.16 * s, 0.04, 0.12], { scale: [1, 0.35, 1.4] }));
          b.add(P(G('sphere', 0.14, 10, 8), bc, [0.42 * s, 0.5, 0], { scale: [0.3, 1, 0.6], rot: [0, 0, 0.3 * s] }));
        }
        if (def.arch === 'bomber') { b.add(P(G('sphere', 0.2, 12, 10), INK, [0, 1.12, 0])); b.add(P(G('cone', 0.05, 0.16, 6), '#ffcf3d', [0, 1.36, 0], { basic: true })); }
        break;
      }
      case 'slime': case 'king_slime': {
        b.add(P(G('sphere', 0.55, 20, 16), c || '#7ed957', [0, 0.42, 0], { scale: [1, 0.78, 1], opacity: 0.88 }));
        for (const s of [-1, 1]) { b.add(P(G('sphere', 0.09, 10, 8), WHITE, [0.16 * s, 0.55, 0.42], { ink: false })); eye(b, 0.16 * s, 0.55, 0.5, 0.045); }
        if (def.model === 'king_slime') { b.add(crown(0.86, 0.9)); g.scale.setScalar(2.5); }
        break;
      }
      case 'gnome': {
        b.add(P(G('cone', 0.34, 0.72, 14), '#3a5fcf', [0, 0.36, 0]));
        b.add(P(G('sphere', 0.22, 14, 12), '#ffd4b8', [0, 0.82, 0]));
        b.add(P(G('cone', 0.2, 0.36, 10), WHITE, [0, 0.64, 0.12], { rot: [Math.PI, 0, 0] }));
        b.add(P(G('sphere', 0.07, 8, 6), '#ff9a8a', [0, 0.8, 0.22]));
        eye(b, -0.08, 0.88, 0.19, 0.03); eye(b, 0.08, 0.88, 0.19, 0.03);
        b.add(P(G('cone', 0.24, 0.62, 12), '#e0423a', [0, 1.26, -0.02], { rot: [-0.2, 0, 0] }));
        break;
      }
      case 'zombie': {
        const col = R.pick(PASTELS);
        b.add(P(G('box', 0.5, 0.6, 0.34), col, [0, 0.72, 0]));
        b.add(P(G('sphere', 0.3, 16, 12), col, [0, 1.22, 0]));
        b.add(P(G('sphere', 0.08, 8, 6), WHITE, [-0.1, 1.26, 0.25], { ink: false })); b.add(P(G('sphere', 0.05, 8, 6), WHITE, [0.12, 1.22, 0.26], { ink: false }));
        eye(b, -0.1, 1.26, 0.31, 0.035); eye(b, 0.12, 1.22, 0.3, 0.025);
        b.add(P(G('box', 0.16, 0.04, 0.04), INK, [0, 1.1, 0.28], { ink: false }));
        for (const s of [-1, 1]) { b.add(P(G('cyl', 0.07, 0.07, 0.5, 8), col, [0.3 * s, 0.95, 0.25], { rot: [Math.PI / 2, 0, 0] })); b.add(P(G('cyl', 0.09, 0.09, 0.44, 8), col, [0.14 * s, 0.22, 0])); }
        break;
      }
      case 'bean': {
        const col = R.pick(['#ff5f6d', '#ffc93c', '#6bd66b', '#6ab7ff', '#c77dff']);
        b.add(P(G('sphere', 0.34, 18, 14), col, [0, 0.46, 0], { scale: [0.82, 1.2, 0.82] }));
        for (const s of [-1, 1]) { b.add(P(G('sphere', 0.07, 8, 6), WHITE, [0.1 * s, 0.6, 0.25], { ink: false })); eye(b, 0.1 * s, 0.6, 0.31, 0.035); }
        break;
      }
      case 'wolf': {
        b.add(P(G('box', 0.5, 0.44, 1.0), c, [0, 0.62, 0]));
        b.add(P(G('box', 0.4, 0.36, 0.4), c, [0, 0.82, 0.58]));
        b.add(P(G('box', 0.22, 0.18, 0.26), c, [0, 0.74, 0.86]));
        b.add(P(G('sphere', 0.05, 8, 6), INK, [0, 0.8, 1.0], { ink: false }));
        eye(b, -0.1, 0.9, 0.79, 0.04); eye(b, 0.1, 0.9, 0.79, 0.04);
        for (const s of [-1, 1]) b.add(P(G('cone', 0.08, 0.2, 6), c, [0.13 * s, 1.07, 0.52]));
        for (const [x, z] of [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]]) b.add(P(G('cyl', 0.07, 0.07, 0.42, 8), c, [x, 0.21, z]));
        b.add(P(G('cone', 0.08, 0.5, 8), c, [0, 0.75, -0.66], { rot: [-2.3, 0, 0] }));
        const flame = def.burn ? '#ffd23f' : '#e8fbff';
        for (let i = 0; i < 3; i++) b.add(P(G('cone', 0.09, 0.3, 6), flame, [0, 0.95, 0.25 - i * 0.28], { basic: true, opacity: 0.9 }));
        break;
      }
      case 'flameguy': case 'flame_king': {
        b.add(P(G('cone', 0.38, 0.9, 14), '#ff7a2e', [0, 0.45, 0], { emissive: '#ff4d00', ei: 0.4 }));
        b.add(P(G('sphere', 0.26, 14, 12), '#ffd23f', [0, 1.05, 0], { emissive: '#ffae00', ei: 0.4 }));
        eye(b, -0.08, 1.08, 0.23, 0.035); eye(b, 0.08, 1.08, 0.23, 0.035);
        for (let i = 0; i < 3; i++) b.add(P(G('cone', 0.1, 0.34, 6), '#ffae00', [(i - 1) * 0.12, 1.36, 0], { basic: true }));
        if (def.model === 'flame_king') { b.add(crown(1.32, 0.8, '#ff5a1f')); b.add(P(G('cone', 0.2, 0.4, 8), '#ffae00', [0, 0.84, 0.18], { rot: [Math.PI, 0, 0], basic: true })); g.scale.setScalar(2.1); }
        break;
      }
      case 'snowman': {
        b.add(P(G('sphere', 0.52, 18, 14), WHITE, [0, 0.5, 0])); b.add(P(G('sphere', 0.4, 18, 14), WHITE, [0, 1.22, 0])); b.add(P(G('sphere', 0.3, 18, 14), WHITE, [0, 1.8, 0]));
        eye(b, -0.1, 1.86, 0.27, 0.045); eye(b, 0.1, 1.86, 0.27, 0.045);
        b.add(P(G('cone', 0.06, 0.34, 8), '#ff8a2a', [0, 1.78, 0.4], { rot: [Math.PI / 2, 0, 0] }));
        for (const s of [-1, 1]) b.add(P(G('cyl', 0.04, 0.04, 0.8, 6), '#6b4226', [0.6 * s, 1.35, 0], { rot: [0, 0, 1.1 * s] }));
        b.add(P(G('cyl', 0.2, 0.2, 0.32, 12), INK, [0, 2.16, 0])); b.add(P(G('cyl', 0.3, 0.3, 0.04, 14), INK, [0, 2.0, 0]));
        break;
      }
      case 'imp': {
        b.add(P(G('sphere', 0.35, 16, 12), '#d8342c', [0, 0.55, 0]));
        for (const s of [-1, 1]) {
          b.add(P(G('sphere', 0.07, 8, 6), '#ffe14a', [0.11 * s, 0.66, 0.29], { basic: true }));
          b.add(P(G('cone', 0.07, 0.22, 8), '#3a0d12', [0.16 * s, 0.94, 0], { rot: [0, 0, -0.35 * s] }));
          b.add(P(G('box', 0.5, 0.04, 0.3), '#6a1418', [0.46 * s, 0.7, -0.1], { rot: [0, 0, 0.5 * s] }));
        }
        b.add(P(G('cone', 0.04, 0.4, 6), '#3a0d12', [0, 0.35, -0.38], { rot: [-2, 0, 0] }));
        break;
      }
      case 'demon': {
        b.add(P(G('box', 1.0, 1.1, 0.7), '#8c1f2b', [0, 1.0, 0]));
        b.add(P(G('sphere', 0.36, 16, 12), '#a8283a', [0, 1.8, 0.05]));
        for (const s of [-1, 1]) {
          b.add(P(G('sphere', 0.07, 8, 6), '#ffe14a', [0.13 * s, 1.86, 0.33], { basic: true }));
          b.add(P(G('cone', 0.1, 0.4, 8), '#2a0a0e', [0.25 * s, 2.2, 0], { rot: [0, 0, -0.4 * s] }));
          b.add(P(G('cyl', 0.16, 0.13, 0.9, 10), '#8c1f2b', [0.66 * s, 1.1, 0.1], { rot: [0.3, 0, 0.15 * s] }));
          b.add(P(G('cyl', 0.16, 0.16, 0.5, 10), '#5a121a', [0.26 * s, 0.25, 0]));
        }
        break;
      }
      case 'skeleton': case 'bone_baron': {
        const B = '#f5f0e1';
        b.add(P(G('box', 0.4, 0.46, 0.22), B, [0, 0.98, 0]));
        b.add(P(G('cyl', 0.05, 0.05, 0.36, 6), B, [0, 0.62, 0]));
        b.add(P(G('sphere', 0.25, 14, 12), B, [0, 1.42, 0]));
        for (const s of [-1, 1]) {
          b.add(P(G('sphere', 0.07, 8, 6), INK, [0.09 * s, 1.44, 0.2], { ink: false }));
          b.add(P(G('cyl', 0.04, 0.04, 0.5, 6), B, [0.26 * s, 0.95, 0], { rot: [0, 0, 0.15 * s] }));
          b.add(P(G('cyl', 0.045, 0.045, 0.5, 6), B, [0.12 * s, 0.25, 0]));
        }
        if (def.arch === 'ranged') b.add(P(G('torus', 0.32, 0.03, 16, Math.PI), '#8a5a2b', [0.36, 0.95, 0.2], { rot: [0, Math.PI / 2, 0] }));
        else b.add(P(G('box', 0.06, 0.7, 0.1), '#b8c2cc', [0.34, 0.9, 0.3], { rot: [0.9, 0, 0] }));
        if (def.model === 'bone_baron') { b.add(crown(1.7, 0.7)); b.add(P(G('box', 0.7, 1.0, 0.05), '#7a1422', [0, 0.95, -0.2], { rot: [0.1, 0, 0] })); g.scale.setScalar(1.9); }
        break;
      }
      case 'crystal': case 'colossus': {
        b.add(P(G('octa', 0.72), '#a98bff', [0, 1.15, 0], { emissive: '#6b4bff', ei: 0.35, scale: [1, 1.35, 1] }));
        for (const s of [-1, 1]) b.add(P(G('sphere', 0.08, 8, 6), '#ffffff', [0.16 * s, 1.3, 0.42], { basic: true }));
        const orbit = new THREE.Group();
        orbit.position.y = 1.15;
        const n = def.model === 'colossus' ? 6 : 3;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; orbit.add(P(G('octa', 0.2), '#7fe3ff', [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0], { emissive: '#3fc6ff', ei: 0.4 })); }
        b.add(orbit);
        p.orbit = orbit;
        if (def.model === 'colossus') g.scale.setScalar(2.2);
        break;
      }
      case 'bat': {
        b.add(P(G('sphere', 0.26, 14, 12), '#8f7ae0', [0, 0, 0]));
        for (const s of [-1, 1]) { b.add(P(G('sphere', 0.05, 8, 6), '#ffffff', [0.08 * s, 0.05, 0.22], { basic: true })); const w = P(G('octa', 0.3), '#c3b3ff', [0.38 * s, 0.05, 0], { scale: [1.4, 0.2, 0.8] }); b.add(w); p[s < 0 ? 'wingL' : 'wingR'] = w; }
        b.position.y = 1.3;
        break;
      }
      case 'lemongrab': case 'lemongrab_boss': {
        b.add(P(G('box', 0.52, 0.9, 0.36), '#5d6370', [0, 0.88, 0]));
        for (const s of [-1, 1]) {
          b.add(P(G('cyl', 0.08, 0.08, 0.44, 8), '#3f434d', [0.14 * s, 0.22, 0]));
          b.add(P(G('cyl', 0.07, 0.07, 0.62, 8), '#5d6370', [0.34 * s, 0.9, 0], { rot: [0, 0, 0.12 * s] }));
          b.add(P(G('sphere', 0.08, 8, 6), '#fff176', [0.38 * s, 0.56, 0]));
          b.add(P(G('sphere', 0.05, 8, 6), INK, [0.12 * s, 1.9, 0.3], { ink: false }));
          b.add(P(G('box', 0.14, 0.03, 0.03), INK, [0.12 * s, 2.0, 0.3], { rot: [0, 0, 0.4 * s], ink: false }));
        }
        b.add(P(G('sphere', 0.38, 20, 16), '#fff176', [0, 1.78, 0], { scale: [0.85, 1.35, 0.85] }));
        b.add(P(G('cone', 0.1, 0.24, 10), '#fff176', [0, 2.38, 0]));
        const mouth = P(G('box', 0.2, 0.08, 0.04), '#3a1a1a', [0, 1.66, 0.3], { ink: false });
        b.add(mouth);
        p.mouth = mouth;
        if (def.model === 'lemongrab_boss') g.scale.setScalar(1.6);
        break;
      }
      case 'magicman': {
        b.add(P(G('cone', 0.5, 1.3, 16), '#2a3b8f', [0, 0.65, 0]));
        for (let i = 0; i < 5; i++) b.add(P(G('octa', 0.06), '#ffe14a', [Math.cos(i * 1.3) * 0.28, 0.45 + i * 0.15, 0.3 - i * 0.03], { basic: true }));
        b.add(P(G('sphere', 0.3, 16, 12), '#7fd18b', [0, 1.45, 0]));
        b.add(P(G('cone', 0.26, 0.6, 12), WHITE, [0, 1.12, 0.12], { rot: [Math.PI, 0, 0] }));
        eye(b, -0.1, 1.52, 0.27, 0.04); eye(b, 0.1, 1.52, 0.27, 0.04);
        b.add(P(G('cone', 0.3, 0.8, 12), '#6a3bb8', [0, 2.02, 0], { rot: [-0.15, 0, 0] }));
        break;
      }
      case 'iceking': {
        b.add(P(G('cone', 0.72, 1.6, 18), '#3b6fd6', [0, 0.8, 0]));
        b.add(P(G('sphere', 0.44, 20, 16), '#8fc9ff', [0, 1.86, 0]));
        b.add(P(G('cone', 0.46, 1.4, 16), WHITE, [0, 1.2, 0.2], { rot: [Math.PI, 0, 0] }));
        b.add(P(G('cone', 0.1, 0.5, 10), '#8fc9ff', [0, 1.84, 0.62], { rot: [Math.PI / 2, 0, 0] }));
        for (const s of [-1, 1]) { b.add(P(G('sphere', 0.07, 8, 6), WHITE, [0.15 * s, 1.98, 0.36], { ink: false })); eye(b, 0.15 * s, 1.98, 0.42, 0.035); }
        b.add(crown(2.28, 1));
        for (const s of [-1, 1]) { b.add(P(G('cyl', 0.13, 0.18, 0.7, 10), '#3b6fd6', [0.62 * s, 1.35, 0.1], { rot: [0.4, 0, 0.5 * s] })); b.add(P(G('sphere', 0.12, 10, 8), '#8fc9ff', [0.84 * s, 1.08, 0.3])); }
        g.scale.setScalar(1.35);
        break;
      }
      case 'hunson': {
        const SUIT = '#2f3a57', SKIN = '#9fb3c8';
        for (const s of [-1, 1]) b.add(P(G('cyl', 0.09, 0.09, 0.8, 8), '#1d2340', [0.14 * s, 0.4, 0]));
        b.add(P(G('box', 0.62, 0.95, 0.38), SUIT, [0, 1.25, 0]));
        b.add(P(G('box', 0.16, 0.5, 0.02), '#ffffff', [0, 1.45, 0.2], { ink: false }));
        b.add(P(G('sphere', 0.13, 12, 10), '#e0283a', [0, 1.28, 0.22], { emissive: '#ff2a4a', ei: 0.8 }));
        b.add(P(G('sphere', 0.3, 16, 12), SKIN, [0, 2.0, 0], { scale: [0.9, 1.25, 0.9] }));
        b.add(P(G('sphere', 0.31, 16, 12), '#1d1a26', [0, 2.16, -0.04], { scale: [0.95, 0.7, 0.95] }));
        for (const s of [-1, 1]) {
          b.add(P(G('cone', 0.07, 0.24, 6), SKIN, [0.3 * s, 2.02, 0], { rot: [0, 0, -1.2 * s] }));
          b.add(P(G('sphere', 0.05, 8, 6), '#ff2a4a', [0.1 * s, 2.02, 0.26], { basic: true }));
          b.add(P(G('cyl', 0.08, 0.07, 0.8, 8), SUIT, [0.4 * s, 1.3, 0], { rot: [0, 0, 0.12 * s] }));
        }
        g.scale.setScalar(1.45);
        break;
      }
      case 'conductor': {
        const COAT = '#2a2440', B = '#f5f0e1';
        b.add(P(G('cone', 0.55, 1.5, 16), COAT, [0, 0.75, 0]));
        for (let i = 0; i < 3; i++) b.add(P(G('sphere', 0.05, 8, 6), '#ffcf3d', [0, 0.7 + i * 0.25, 0.3 - i * 0.05], { basic: true }));
        b.add(P(G('sphere', 0.3, 16, 12), B, [0, 1.72, 0]));
        for (const s of [-1, 1]) b.add(P(G('sphere', 0.08, 8, 6), INK, [0.1 * s, 1.74, 0.24], { ink: false }));
        b.add(P(G('cyl', 0.3, 0.3, 0.26, 16), '#1d2340', [0, 2.02, 0]));
        b.add(P(G('box', 0.34, 0.04, 0.2), '#1d2340', [0, 1.92, 0.26]));
        b.add(P(G('box', 0.2, 0.08, 0.02), '#ffcf3d', [0, 2.04, 0.3], { basic: true }));
        for (const s of [-1, 1]) b.add(P(G('cyl', 0.07, 0.06, 0.8, 8), COAT, [0.42 * s, 1.2, 0.05], { rot: [0.2, 0, 0.2 * s] }));
        const lamp = new THREE.Group();
        lamp.position.set(0.62, 0.85, 0.3);
        lamp.add(P(G('box', 0.2, 0.28, 0.2), '#3a3f4b', [0, 0, 0]));
        lamp.add(P(G('box', 0.14, 0.2, 0.14), '#ffcf3d', [0, 0, 0], { basic: true }));
        b.add(lamp);
        g.scale.setScalar(1.7);
        break;
      }
      default:
        b.add(P(G('sphere', 0.4, 12, 10), '#999999', [0, 0.5, 0]));
    }
  }
  MD.enemy = function (def) {
    const g = new THREE.Group();
    const p = {};
    body(def, g, p);
    if (def.elite && !def.boss) g.add(P(G('torus', 0.55, 0.04, 24), '#ffcf3d', [0, 0.06, 0], { rot: [Math.PI / 2, 0, 0], basic: true }));
    if (def.boss) g.add(P(G('torus', 0.62, 0.05, 28), '#ff4d6d', [0, 0.06, 0], { rot: [Math.PI / 2, 0, 0], basic: true }));
    g.add(GF.blob(def.r * 1.2 / (g.scale.x || 1)));
    g.userData.parts = p;
    return g;
  };
})();

/* ---------- props, loot, the Tree Fort ---------- */
(function () {
  'use strict';
  const GF = DT.game.gfx;
  const R = DT.R;
  const D = DT.data;
  const MD = DT.game.models;
  const G = (...a) => GF.geo(...a);
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, o);
  const INK = '#1d2340';
  const FLAME = () => GF.basic('#ffb02e', { add: true });

  MD.prop = function (type, o) {
    o = o || {};
    const g = new THREE.Group();
    const acc = o.accent || '#ffcf3d';
    switch (type) {
      case 'crate': { const s = o.size || 0.9; g.add(P(G('box', s, s, s), '#c98d4e', [0, s / 2, 0])); g.add(P(G('box', s * 1.02, s * 0.14, s * 1.02), '#9c6634', [0, s * 0.2, 0], { ink: false })); g.add(P(G('box', s * 1.02, s * 0.14, s * 1.02), '#9c6634', [0, s * 0.8, 0], { ink: false })); break; }
      case 'barrel': g.add(P(G('cyl', 0.38, 0.42, 0.9, 14), '#a8653a', [0, 0.45, 0])); for (const y of [0.25, 0.68]) g.add(P(G('torus', 0.4, 0.035, 18), '#5a5f6a', [0, y, 0], { rot: [Math.PI / 2, 0, 0], ink: false })); break;
      case 'urn': g.add(P(G('sphere', 0.36, 14, 12), o.color || '#b8653a', [0, 0.38, 0], { scale: [1, 1.1, 1] })); g.add(P(G('cyl', 0.16, 0.22, 0.2, 12), o.color || '#b8653a', [0, 0.82, 0])); break;
      case 'bookshelf': {
        g.add(P(G('box', 2.4, 3.0, 0.7), '#5c3b22', [0, 1.5, 0]));
        for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) g.add(P(G('box', 0.22, 0.52, 0.5), R.pick(['#c2413a', '#2f6fd6', '#3fae7a', '#f0b429', '#7a5ab8']), [-1.0 + i * 0.32, 0.4 + r * 0.72, 0.08], { ink: false }));
        break;
      }
      case 'coffin': g.add(P(G('box', 0.9, 0.5, 2.1), '#4a3326', [0, 0.25, 0])); g.add(P(G('box', 0.95, 0.12, 2.15), '#3a2518', [0, 0.54, 0], { rot: [0, 0, o.open ? 0.4 : 0] })); g.add(P(G('box', 0.08, 0.04, 0.5), '#c8bfa8', [0, 0.62, 0.2], { ink: false })); g.add(P(G('box', 0.3, 0.04, 0.08), '#c8bfa8', [0, 0.62, 0.3], { ink: false })); break;
      case 'bones': for (let i = 0; i < 5; i++) g.add(P(G('cyl', 0.04, 0.04, 0.5, 6), '#f5f0e1', [R.float(-0.5, 0.5), 0.05, R.float(-0.4, 0.4)], { rot: [Math.PI / 2, R.float(0, 3), 0], ink: false })); g.add(P(G('sphere', 0.14, 10, 8), '#f5f0e1', [0.2, 0.12, 0.1], { ink: false })); break;
      case 'cage': { g.add(P(G('box', 1.6, 0.12, 1.6), '#3a3f4b', [0, 0.06, 0])); g.add(P(G('box', 1.6, 0.12, 1.6), '#3a3f4b', [0, 2.3, 0])); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(P(G('cyl', 0.035, 0.035, 2.3, 6), '#5a5f6a', [Math.cos(a) * 0.72, 1.15, Math.sin(a) * 0.72], { ink: false })); } if (o.skull) g.add(P(G('sphere', 0.16, 10, 8), '#f5f0e1', [0, 0.2, 0])); break; }
      case 'rack': { g.add(P(G('box', 2.0, 0.12, 0.3), '#6b4226', [0, 1.8, 0])); g.add(P(G('box', 2.0, 0.12, 0.3), '#6b4226', [0, 0.4, 0])); for (let i = 0; i < 5; i++) g.add(P(G('box', 0.06, 1.6, 0.06), '#b8c2cc', [-0.8 + i * 0.4, 1.1, 0.1], { ink: false })); break; }
      case 'banquet': { g.add(P(G('box', 4.2, 0.12, 1.3), '#7a4b2a', [0, 0.85, 0])); for (const x of [-1.9, 1.9]) for (const z of [-0.5, 0.5]) g.add(P(G('box', 0.12, 0.8, 0.12), '#5c3b22', [x, 0.4, z])); for (let i = 0; i < 4; i++) g.add(P(G('cyl', 0.07, 0.05, 0.2, 8), '#ffcf3d', [-1.4 + i * 0.95, 1.0, R.float(-0.3, 0.3)], { ink: false })); g.add(P(G('cyl', 0.04, 0.04, 0.3, 6), '#f4efe6', [0, 1.06, 0], { ink: false })); const f = new THREE.Mesh(G('cone', 0.05, 0.14, 6), FLAME()); f.position.set(0, 1.28, 0); g.add(f); break; }
      case 'mushroom': { const s = o.size || 1; g.add(P(G('cyl', 0.18 * s, 0.24 * s, 1.2 * s, 10), '#f4efe6', [0, 0.6 * s, 0])); g.add(P(G('sphere', 0.8 * s, 16, 10), o.color || '#e0423a', [0, 1.25 * s, 0], { scale: [1, 0.55, 1] })); for (let i = 0; i < 5; i++) { const a = i * 1.3; g.add(P(G('sphere', 0.1 * s, 8, 6), '#ffffff', [Math.cos(a) * 0.5 * s, 1.5 * s, Math.sin(a) * 0.5 * s], { ink: false })); } break; }
      case 'throne': g.add(P(G('box', 1.4, 0.6, 1.2), '#5c1a2a', [0, 0.3, 0])); g.add(P(G('box', 1.4, 2.4, 0.3), '#5c1a2a', [0, 1.3, -0.5])); g.add(P(G('box', 1.5, 0.2, 0.35), acc, [0, 2.55, -0.5])); break;
      case 'bench': g.add(P(G('box', 2.2, 0.45, 0.8), '#7a5a3a', [0, 0.32, 0])); g.add(P(G('box', 2.2, 0.7, 0.18), '#7a5a3a', [0, 0.8, -0.32])); break;
      case 'candles': { g.add(P(G('cyl', 0.06, 0.1, 1.2, 8), '#3a3f4b', [0, 0.6, 0])); for (const x of [-0.25, 0, 0.25]) { g.add(P(G('cyl', 0.04, 0.04, 0.22, 6), '#f4efe6', [x, 1.3, 0], { ink: false })); const f = new THREE.Mesh(G('cone', 0.05, 0.14, 6), FLAME()); f.position.set(x, 1.48, 0); g.add(f); } g.add(P(G('box', 0.6, 0.05, 0.05), '#3a3f4b', [0, 1.2, 0], { ink: false })); break; }
      case 'boiler': g.add(P(G('cyl', 1.3, 1.3, 3.2, 20), '#3a3f4b', [0, 1.4, 0], { rot: [0, 0, Math.PI / 2] })); g.add(P(G('cyl', 0.5, 0.5, 0.2, 16), '#ff7a2e', [1.65, 1.2, 0], { rot: [0, 0, Math.PI / 2], emissive: '#ff4d00', ei: 0.8 })); g.add(P(G('cyl', 0.3, 0.3, 1.4, 12), '#2a2e38', [-0.8, 3.0, 0])); break;
      case 'lever': { g.add(P(G('box', 0.6, 0.4, 0.6), '#3a3f4b', [0, 0.2, 0])); const arm = new THREE.Group(); arm.position.y = 0.4; arm.add(P(G('cyl', 0.05, 0.05, 1.1, 8), '#b8c2cc', [0, 0.55, 0])); arm.add(P(G('sphere', 0.13, 10, 8), '#e0283a', [0, 1.12, 0])); arm.rotation.x = -0.5; g.add(arm); g.userData.arm = arm; break; }
      case 'coal': for (let i = 0; i < 6; i++) g.add(P(G('ico', 0.22 + Math.random() * 0.12), '#2a2a30', [(Math.random() - 0.5) * 1.2, 0.18, (Math.random() - 0.5) * 1.0], { ink: false })); break;
      case 'gold_pile': for (let i = 0; i < 9; i++) g.add(P(G('cyl', 0.14, 0.14, 0.05, 10), '#ffcf3d', [(Math.random() - 0.5) * 0.9, 0.05 + i * 0.03, (Math.random() - 0.5) * 0.7], { ink: false, emissive: '#ffae00', ei: 0.3 })); break;
      default: g.add(P(G('box', 0.8, 0.8, 0.8), '#999999', [0, 0.4, 0]));
    }
    return g;
  };

  /* Wall torch: bracket + flame. */
  MD.torch = function () {
    const g = new THREE.Group();
    g.add(P(G('box', 0.12, 0.3, 0.12), '#3a3f4b', [0, 0, 0], { ink: false }));
    g.add(P(G('cyl', 0.05, 0.04, 0.4, 6), '#6b4226', [0, 0.2, 0.12], { rot: [0.5, 0, 0], ink: false }));
    const f = new THREE.Mesh(G('cone', 0.1, 0.3, 7), FLAME());
    f.position.set(0, 0.5, 0.24);
    g.add(f);
    g.userData.flame = f;
    return g;
  };
  MD.lantern = function (color) {
    const g = new THREE.Group();
    g.add(P(G('cyl', 0.015, 0.015, 0.6, 4), '#1d2340', [0, 0.3, 0], { ink: false }));
    g.add(P(G('box', 0.3, 0.36, 0.3), '#3a3f4b', [0, -0.1, 0]));
    g.add(new THREE.Mesh(G('box', 0.22, 0.26, 0.22), GF.basic(color || '#ffd66b')));
    g.children[2].position.y = -0.1;
    return g;
  };

  MD.chest = function (fancy) {
    const g = new THREE.Group();
    const body = fancy ? '#ffcf3d' : '#b0703a', trim = fancy ? '#e0283a' : '#6b4226';
    g.add(P(G('box', 1.0, 0.55, 0.65), body, [0, 0.28, 0]));
    g.add(P(G('box', 1.02, 0.1, 0.67), trim, [0, 0.5, 0], { ink: false }));
    const lid = new THREE.Group();
    lid.position.set(0, 0.56, -0.32);
    lid.add(P(G('cyl', 0.33, 0.33, 1.0, 16, Math.PI), body, [0, 0, 0.32], { rot: [0, 0, Math.PI / 2] }));
    g.add(lid);
    const lock = new THREE.Group();
    lock.add(P(G('box', 0.22, 0.2, 0.06), '#8a8f9a', [0, 0.36, 0.36]));
    lock.add(P(G('torus', 0.07, 0.025, 8, 12, Math.PI), '#8a8f9a', [0, 0.48, 0.36], { ink: false }));
    g.add(lock);
    g.userData.lid = lid;
    g.userData.lock = lock;
    return g;
  };
  /* Iron bars across a doorway (vaults and boss cars). */
  MD.gate = function (width, color) {
    const g = new THREE.Group();
    const n = Math.round(width / 0.36);
    for (let i = 0; i <= n; i++) g.add(GF.part(G('cyl', 0.06, 0.06, 3.0, 8), color || '#8a8f9a', [0, 1.5, -width / 2 + (i * width) / n]));
    g.add(GF.part(G('box', 0.2, 0.2, width), color || '#8a8f9a', [0, 2.7, 0]));
    g.add(GF.part(G('sphere', 0.25, 12, 10), '#ffcf3d', [-0.2, 1.3, 0], { emissive: '#ffae00', ei: 0.3 }));
    return g;
  };

  MD.drop = function (item) {
    const g = new THREE.Group();
    const col = D.RARITIES[item.rarity].color;
    const shape = item.kind === 'consumable' ? G('sphere', 0.2, 12, 10) : item.kind === 'valuable' ? G('octa', 0.24) : item.kind === 'trophy' ? G('dodeca', 0.3) : G('box', 0.32, 0.32, 0.32);
    const m = P(shape, col, [0, 0.55, 0], { emissive: col, ei: 0.45 });
    g.add(m);
    if (item.rarity >= 1 || item.kind === 'valuable' || item.kind === 'trophy') g.add(GF.beam(col, 1.5 + item.rarity * 1.1));
    g.userData.spin = m;
    return g;
  };
  MD.coin = function () {
    const g = new THREE.Group();
    const m = P(G('cyl', 0.16, 0.16, 0.05, 14), '#ffcf3d', [0, 0.35, 0], { rot: [Math.PI / 2, 0, 0], emissive: '#ffae00', ei: 0.35, inkT: 0.12 });
    g.add(m);
    g.userData.spin = m;
    return g;
  };
  MD.snail = function () {
    const g = new THREE.Group();
    g.add(P(G('cyl', 0.06, 0.08, 0.34, 8), '#b8a88a', [0, 0.06, 0.05], { rot: [Math.PI / 2, 0, 0] }));
    g.add(P(G('sphere', 0.16, 12, 10), '#c98d4e', [0, 0.18, -0.05]));
    const stalk = P(G('cyl', 0.015, 0.015, 0.18, 6), '#b8a88a', [0.03, 0.2, 0.2], { ink: false });
    g.add(stalk);
    g.add(P(G('cyl', 0.015, 0.015, 0.18, 6), '#b8a88a', [-0.03, 0.2, 0.2], { ink: false }));
    g.userData.stalk = stalk;
    return g;
  };

  /* The hub diorama: Finn and Jake's tree house. */
  MD.treeFort = function () {
    const g = new THREE.Group();
    g.add(P(G('cyl', 60, 60, 1, 40), '#4f9e37', [0, -0.5, 0], { ink: false }));
    for (const [x, z, r] of [[-26, -30, 16], [10, -38, 20], [34, -26, 14]]) g.add(P(G('sphere', r, 24, 14), '#3f8a30', [x, -r * 0.55, z], { ink: false }));
    g.add(P(G('cyl', 1.3, 1.9, 9, 16), '#8b5a2b', [0, 4.5, 0]));
    for (const [x, y, z, r] of [[0, 9.2, 0, 3.6], [2.6, 8.2, 1, 2.6], [-2.8, 8.4, 0.6, 2.8], [0.5, 11, -0.5, 2.6], [-1.2, 7.4, 2.4, 2.2], [2, 10.4, -1.6, 2.2]]) g.add(P(G('sphere', r, 20, 16), '#4fb84a', [x, y, z], { inkT: 0.03 }));
    const house = new THREE.Group();
    house.position.set(0, 4.8, 1.2);
    house.add(P(G('box', 2.8, 2.0, 1.6), '#e7c08a', [0, 0, 0]));
    house.add(P(G('cone', 2.2, 1.3, 4), '#c2413a', [0, 1.6, 0], { rot: [0, Math.PI / 4, 0] }));
    for (const x of [-0.75, 0.75]) house.add(P(G('box', 0.6, 0.6, 0.06), '#7fd3f7', [x, 0.2, 0.82], { emissive: '#bfefff', ei: 0.3 }));
    house.add(P(G('box', 0.6, 1.0, 0.06), '#6b4226', [0, -0.5, 0.82]));
    g.add(house);
    g.add(P(G('cyl', 2.6, 2.6, 0.18, 20), '#a8733f', [0, 3.4, 0.6]));
    for (let i = 0; i < 7; i++) g.add(P(G('box', 0.7, 0.06, 0.1), '#8b5a2b', [2.3, 0.3 + i * 0.44, 1.7], { ink: false }));
    g.add(P(G('box', 0.08, 3.2, 0.08), '#8b5a2b', [2.0, 1.7, 1.7], { ink: false }));
    g.add(P(G('box', 0.08, 3.2, 0.08), '#8b5a2b', [2.6, 1.7, 1.7], { ink: false }));
    const bmo = new THREE.Group();
    bmo.add(P(G('box', 0.5, 0.65, 0.3), '#5ec7b5', [0, 0.45, 0]));
    bmo.add(P(G('box', 0.38, 0.28, 0.02), '#cff5e9', [0, 0.55, 0.16], { ink: false }));
    bmo.add(P(G('sphere', 0.03, 6, 4), INK, [-0.07, 0.58, 0.18], { ink: false })); bmo.add(P(G('sphere', 0.03, 6, 4), INK, [0.07, 0.58, 0.18], { ink: false }));
    for (const s of [-1, 1]) bmo.add(P(G('cyl', 0.03, 0.03, 0.3, 6), '#5ec7b5', [0.08 * s, 0.1, 0]));
    bmo.position.set(-2.6, 0, 3.8);
    bmo.rotation.y = 0.5;
    g.add(bmo);
    return g;
  };
})();
