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
    sword_storm: { blade: '#bfefff', len: 0.95, w: 0.07, d: 0.15, guard: '#2f6fd6', grip: '#1d2340', glow: '#3fc6ff', jag: true },
    sword_claymore: { blade: '#d6dde6', len: 1.4, w: 0.1, d: 0.24, guard: '#6b4a2e', grip: '#3a2618' },
    sword_cutlass: { blade: '#e6ecf2', len: 0.85, w: 0.07, d: 0.2, guard: '#ffcf3d', grip: '#6b4226', curve: 0.25 },
    sword_candycane: { blade: '#ffffff', len: 1.0, w: 0.06, d: 0.07, guard: '#e0283a', grip: '#e0283a', stripes: '#e0283a' },
    sword_geode: { blade: '#b77bff', len: 0.95, w: 0.09, d: 0.2, guard: '#8c8177', grip: '#5a5048', glow: '#8f5bff' },
    sword_stake: { blade: '#c9965a', len: 1.0, w: 0.05, d: 0.06, guard: '#8a1f2b', grip: '#5c3b22', point: true },
    sword_citadel: { blade: '#ffd6ec', len: 1.45, w: 0.1, d: 0.26, guard: '#ff9fcf', grip: '#6a3a5a', glow: '#ff5fb4' },
  };
  MD.sword = function (it, art) {
    const look = SWORD_LOOK[art || (it && DT.meta.loot.artOf(it)) || 'sword_short'] || SWORD_LOOK.sword_short;
    const glow = look.glow || rarityGlow(it);
    const sword = new THREE.Group();
    sword.add(P(G('box', 0.07, 0.16, 0.07), look.grip, [0, 0, 0]));
    sword.add(P(G('box', look.ring ? 0.12 : 0.3, 0.05, 0.1), look.guard, [0, -0.1, 0]));
    if (look.ring) sword.add(P(G('torus', 0.09, 0.02, 12), look.guard, [0, -0.1, 0], { rot: [Math.PI / 2, 0, 0] }));
    const blade = P(G('box', look.w, look.len, look.d), look.blade, [0, -0.13 - look.len / 2, 0], glow ? { emissive: glow, ei: 0.45 } : {});
    sword.add(blade);
    if (look.jag) for (let i = 0; i < 3; i++) sword.add(P(G('cone', 0.04, 0.12, 4), look.blade, [0, -0.3 - i * 0.22, look.d / 2 + 0.03], { rot: [Math.PI / 2, 0, 0], ink: false }));
    if (look.curve) blade.rotation.x = look.curve;
    if (look.stripes) for (let i = 0; i < 4; i++) sword.add(P(G('box', look.w * 1.05, 0.05, look.d * 1.05), look.stripes, [0, -0.25 - i * 0.2, 0], { rot: [0, 0, 0.5], ink: false }));
    if (look.point) sword.add(P(G('cone', look.w * 0.9, 0.2, 6), look.blade, [0, -0.13 - look.len - 0.08, 0], { rot: [Math.PI, 0, 0] }));
    sword.userData.blade = blade;
    sword.userData.len = look.len;
    return sword;
  };

  /* ---------- Finn ---------- */
  /* A patch that hugs a sphere of radius R (Finn's face in the opening of his hat, visors, masks).
     rx/ry = half size, cy = vertical center. Cached per shape. */
  const decals = new Map();
  MD.decal = function (R, rx, ry, cy) {
    const key = [R, rx, ry, cy].join(',');
    if (decals.has(key)) return decals.get(key);
    const geo = new THREE.RingGeometry(0.0001, 1, 40, 6);
    const pos = geo.attributes.position, nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * rx, y = pos.getY(i) * ry + cy;
      const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
      pos.setXYZ(i, x, y, z);
      nrm.setXYZ(i, x / R, y / R, z / R);
    }
    pos.needsUpdate = true; nrm.needsUpdate = true;
    geo.computeBoundingSphere();
    decals.set(key, geo);
    return geo;
  };
  /* Finn's hat is a white sphere (radius 0.45) with bear ears. Helmets sit on top of it as domes;
     they return what should happen to the ears. */
  const HR = 0.45;
  const capRim = (g, r, theta, col) => g.add(P(G('torus', r * Math.sin(theta), 0.03, 30), col, [0, r * Math.cos(theta), 0], { rot: [Math.PI / 2, 0, 0] }));
  const HELM_LOOK = {
    hat: (g, c) => { if (c) { g.add(P(G('cap', 0.468, 0.95), c, [0, 0, 0])); capRim(g, 0.468, 0.95, c); } return c || WHITE; },
    helm: (g, c) => {
      const col = c || '#a4acb8';
      g.add(P(G('cap', 0.478, 1.15), col, [0, 0, 0]));
      capRim(g, 0.478, 1.15, '#6f7684');
      g.add(P(G('box', 0.08, 0.3, 0.07), col, [0, 0.06, 0.46]));
      g.add(P(G('cone', 0.06, 0.2, 8), col, [0, 0.5, 0], {}));
      return null;
    },
    wizard_hat: (g, c) => {
      const col = c || '#6a3bb8';
      g.add(P(G('cyl', 0.6, 0.6, 0.05, 24), col, [0, 0.3, -0.02]));
      g.add(P(G('cone', 0.34, 1.0, 18), col, [0, 0.82, -0.08], { rot: [-0.22, 0, 0] }));
      g.add(P(G('cyl', 0.345, 0.36, 0.1, 18), '#ffcf3d', [0, 0.38, -0.03], { ink: false }));
      return null;
    },
    skull_helm: (g, c) => {
      const col = c || '#f5f0e1';
      g.add(P(G('cap', 0.478, 1.1), col, [0, 0, 0]));
      for (const s of [-1, 1]) {
        g.add(P(G('sphere', 0.075, 10, 8), INK, [0.14 * s, 0.26, 0.39], { ink: false, scale: [1, 1.2, 0.5] }));
        g.add(P(G('cone', 0.06, 0.24, 8), col, [0.36 * s, 0.4, 0], { rot: [0, 0, -0.7 * s] }));
      }
      for (let i = -2; i <= 2; i++) g.add(P(G('box', 0.045, 0.06, 0.03), col, [i * 0.06, 0.2, 0.43], { ink: false }));
      return null;
    },
    hat_og: () => WHITE,
    helm_bucket: (g, c) => {
      const col = c || '#9aa3b0';
      g.add(P(G('cyl', 0.4, 0.49, 0.62, 22), col, [0, 0.2, 0]));
      g.add(P(G('torus', 0.49, 0.03, 24), '#6f7684', [0, -0.1, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
      g.add(P(G('torus', 0.42, 0.015, 6, 20, Math.PI), '#6f7684', [0, 0.48, 0], { ink: false }));
      g.add(P(G('box', 0.44, 0.07, 0.02), INK, [0, 0.12, 0.46], { ink: false }));
      return null;
    },
    hood: (g, c) => {
      const col = c || '#3a2a33';
      g.add(P(G('cap', 0.49, 1.35), col, [0, 0.02, -0.03], { rot: [-0.3, 0, 0] }));
      g.add(P(G('cone', 0.12, 0.3, 8), col, [0, 0.2, -0.52], { rot: [-2.2, 0, 0] }));
      return null;
    },
    hat_mitre: (g) => {
      g.add(P(G('cone', 0.4, 1.0, 16), WHITE, [0, 0.72, 0], { scale: [1, 1, 0.62] }));
      for (let i = 0; i < 3; i++) g.add(P(G('cyl', 0.37 - i * 0.1, 0.39 - i * 0.1, 0.05, 16), '#ffcf3d', [0, 0.36 + i * 0.22, 0], { scale: [1, 1, 0.62], ink: false }));
      return null;
    },
    hat_magic: (g) => {
      g.add(P(G('cyl', 0.6, 0.6, 0.05, 24), '#2a3b8f', [0, 0.3, -0.02]));
      g.add(P(G('cone', 0.34, 1.15, 18), '#6a3bb8', [0, 0.88, -0.08], { rot: [-0.18, 0, 0] }));
      g.add(P(G('star4', 0.12), '#ffe14a', [0.02, 0.9, 0.23], { basic: true, rot: [-0.18, 0, 0] }));
      return null;
    },
  };
  const BODY_LOOK = {
    tunic: '#3fae4a', chainmail: '#a4acb8', plate: '#cfd6de', robe: '#6a3bb8', plate_royal: '#ff9fcf', tunic_flame: '#ff7a2e', chainmail_crystal: '#c9b8ff',
    coat_hunter: '#5a2a33', armor_bark: '#8a6a44',
  };
  /* Finn's head: the white hat, his face in the opening, eyes, smile and ears. Used by Future Finn too. */
  MD.finnHead = function (o) {
    o = o || {};
    const SK = o.skin || '#ffd9c2';
    const hd = new THREE.Group();
    hd.add(P(G('sphere', HR, 24, 18), o.hat || WHITE, [0, 0, 0]));
    hd.add(P(MD.decal(HR + 0.004, 0.318, 0.272, -0.045), INK, [0, 0, 0], { ink: false }));
    hd.add(P(MD.decal(HR + 0.008, 0.296, 0.25, -0.045), SK, [0, 0, 0], { ink: false }));
    const zAt = (x, y) => Math.sqrt(HR * HR - x * x - y * y);
    for (const s of [-1, 1]) hd.add(P(G('sphere', 0.042, 10, 8), INK, [0.11 * s, 0.01, zAt(0.11, 0.01) + 0.004], { ink: false, scale: [1, 1.3, 0.7] }));
    if (o.frown) hd.add(P(G('torus', 0.06, 0.013, 12, Math.PI), INK, [0, -0.16, zAt(0, 0.16) + 0.006], { ink: false }));
    else hd.add(P(G('torus', 0.065, 0.014, 12, Math.PI), INK, [0, -0.1, zAt(0, 0.1) + 0.006], { rot: [0, 0, Math.PI], ink: false }));
    const ears = [];
    for (const s of [-1, 1]) { const e = P(G('sphere', 0.12, 12, 10), o.hat || WHITE, [0.26 * s, 0.36, -0.02]); hd.add(e); ears.push(e); }
    hd.userData.ears = ears;
    return hd;
  };
  MD.finn = function (eq) {
    eq = eq || {};
    const g = new THREE.Group();
    const p = {};
    const SK = '#ffd9c2', SHIRT = '#5ec3f2', SHORTS = '#2a5bc4';
    const boots = eq.legs, arms = eq.arms, body = eq.body, head = eq.head, pack = eq.pack;
    const bootArt = boots ? DT.meta.loot.artOf(boots) : null;
    const bootCol = boots ? setTint(boots, { sneakers: '#e0423a', boots_iron: '#8a8f9a', boots_winged: '#f4f4f4', boots_jet: '#e0423a', boots_slime: '#7ed957', boots_fool: '#4a2a5a' }[bootArt] || '#8a8f9a') : null;
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.13 * s, 0.42, 0);
      leg.add(P(G('cyl', 0.07, 0.07, 0.24, 10), SK, [0, -0.12, 0]));
      leg.add(P(G('cyl', 0.078, 0.074, 0.16, 10), bootCol || WHITE, [0, -0.29, 0]));
      leg.add(P(G('sphere', 0.1, 12, 8), bootCol ? bootCol : '#20243a', [0, -0.39, 0.05], { scale: [0.95, 0.62, 1.45] }));
      if (bootArt === 'boots_winged') leg.add(P(G('box', 0.02, 0.12, 0.16), WHITE, [0.1 * s, -0.27, -0.04], { rot: [0.4, 0, 0] }));
      if (bootArt === 'boots_fool') leg.add(P(G('box', 0.02, 0.14, 0.2), '#7a3a6a', [0.1 * s, -0.25, -0.05], { rot: [0.5, 0, 0] }));
      if (bootArt === 'boots_jet') leg.add(P(G('cone', 0.06, 0.16, 8), '#ffae00', [0, -0.46, -0.1], { rot: [Math.PI, 0, 0], basic: true }));
      g.add(leg);
      p[s < 0 ? 'legL' : 'legR'] = leg;
    }
    g.add(P(G('cyl', 0.27, 0.29, 0.2, 16), SHORTS, [0, 0.47, 0]));
    g.add(P(G('cyl', 0.23, 0.275, 0.42, 16), SHIRT, [0, 0.77, 0]));
    if (body) {
      const art = DT.meta.loot.artOf(body);
      const col = setTint(body, BODY_LOOK[art] || '#a4acb8');
      const glow = art === 'tunic_flame' ? '#ff4d00' : rarityGlow(body);
      if (art === 'robe') g.add(P(G('cyl', 0.27, 0.38, 0.72, 16), col, [0, 0.62, 0], glow ? { emissive: glow, ei: 0.25 } : {}));
      else g.add(P(G('cyl', 0.27, 0.3, 0.44, 16), col, [0, 0.79, 0.01], glow ? { emissive: glow, ei: 0.25 } : {}));
      if (art === 'plate' || art === 'plate_royal') for (const s of [-1, 1]) g.add(P(G('sphere', 0.13, 10, 8), col, [0.3 * s, 0.98, 0]));
      if (art === 'chainmail' || art === 'chainmail_crystal') g.add(P(G('cyl', 0.285, 0.305, 0.06, 16), '#6f7684', [0, 0.6, 0.01], { ink: false }));
      if (art === 'coat_hunter') g.add(P(G('cyl', 0.3, 0.36, 0.5, 16), col, [0, 0.45, 0]));
      if (art === 'armor_bark') for (let i = 0; i < 4; i++) g.add(P(G('box', 0.05, 0.36, 0.03), '#5c4028', [-0.15 + i * 0.1, 0.8, 0.28], { ink: false }));
    }
    const packArt = pack ? DT.meta.loot.artOf(pack) : null;
    const packCol = { pack: '#3fae4a', pack_big: '#8a5a2b', pack_snack: '#f0b429', pack_finn: '#3fae4a', pack_treasure: '#c9a060' }[packArt] || '#3fae4a';
    if (pack) {
      const big = packArt === 'pack_big' ? 1.25 : 1;
      g.add(P(G('box', 0.44 * big, 0.46 * big, 0.2 * big), packCol, [0, 0.8, -0.3 - (big - 1) * 0.1]));
      g.add(P(G('box', 0.3, 0.12, 0.06), '#2f8f3a', [0, 0.72, -0.42 - (big - 1) * 0.12], { ink: false }));
      for (const s of [-1, 1]) g.add(P(G('box', 0.05, 0.4, 0.04), '#2f8f3a', [0.17 * s, 0.8, 0.21], { ink: false, rot: [0.12, 0, 0] }));
    }
    const armArt = arms ? DT.meta.loot.artOf(arms) : null;
    const handCol = arms ? setTint(arms, { gloves: '#8a5a2b', gauntlets: '#9aa3b0', gauntlets_spiked: '#7a808c', gauntlets_billy: '#e8b04a', gauntlets_geode: '#8c8177' }[armArt] || '#9aa3b0') : SK;
    for (const s of [-1, 1]) {
      const swing = new THREE.Group();
      swing.position.set(0.31 * s, 0.93, 0);
      const arm = new THREE.Group();
      arm.add(P(G('cyl', 0.062, 0.055, 0.38, 8), SK, [0, -0.19, 0]));
      arm.add(P(G('cyl', 0.085, 0.07, 0.1, 10), SHIRT, [0, -0.02, 0], { ink: false }));
      if (arms) arm.add(P(G('cyl', 0.075, 0.07, 0.16, 8), handCol, [0, -0.3, 0]));
      arm.add(P(G('sphere', 0.085, 10, 8), handCol, [0, -0.4, 0]));
      if (armArt === 'gauntlets_spiked') arm.add(P(G('cone', 0.03, 0.1, 5), '#dfe6ee', [0, -0.3, 0.08], { rot: [Math.PI / 2, 0, 0], ink: false }));
      if (armArt === 'gauntlets_geode') arm.add(P(G('octa', 0.05), '#b77bff', [0, -0.42, 0.08], { emissive: '#8f5bff', ei: 0.4, ink: false }));
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
    const hd = MD.finnHead({ skin: SK });
    hd.position.set(0, 1.34, 0);
    if (head) {
      const art = DT.meta.loot.artOf(head);
      const ears = (HELM_LOOK[art] || HELM_LOOK.helm)(hd, head.set ? D.SETS[head.set].color : null);
      for (const e of hd.userData.ears) { if (!ears) e.visible = false; else if (ears !== WHITE) e.material = GF.mat(ears); }
    }
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
    harmonica: ['#c9d1dc', 'harp'], harmonica_blues: ['#4d9bff', 'harp'], tuba: ['#ffcf3d', 'tuba'], tuba_big: ['#e0a82e', 'tuba'],
    theremin: ['#6b4a8a', 'antenna'], theremin_ghost: ['#bfe8ff', 'antenna'],
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
      case 'harp': g.add(P(G('box', 0.44, 0.12, 0.1), col, [0, 0, 0], o)); for (let i = 0; i < 6; i++) g.add(P(G('box', 0.04, 0.05, 0.02), INK, [-0.17 + i * 0.068, 0, 0.055], { ink: false })); break;
      case 'tuba': g.add(P(G('torus', 0.2, 0.06, 14), col, [0, -0.05, 0], Object.assign({ rot: [0, Math.PI / 2, 0] }, o))); g.add(P(G('cone', 0.22, 0.3, 16), col, [0, 0.26, 0], Object.assign({ rot: [Math.PI, 0, 0] }, o))); g.add(P(G('circle', 0.21, 16), '#3a2a10', [0, 0.415, 0], { rot: [-Math.PI / 2, 0, 0], ink: false })); break;
      case 'antenna': g.add(P(G('box', 0.44, 0.24, 0.24), col, [0, 0, 0], o)); g.add(P(G('cyl', 0.012, 0.012, 0.5, 5), '#dfe6ee', [0.16, 0.37, 0], { ink: false })); g.add(P(G('torus', 0.1, 0.012, 6, 14), '#dfe6ee', [-0.24, 0.05, 0], { rot: [0, Math.PI / 2, 0], ink: false })); break;
      default: g.add(P(G('sphere', 0.22, 14, 10), col, [0, -0.08, 0], Object.assign({ scale: [0.9, 1.3, 0.35] }, o))); g.add(P(G('box', 0.05, 0.5, 0.04), '#3b2a1a', [0, 0.35, 0]));
    }
    return g;
  }
  const COLLAR_LOOK = { collar: '#e0423a', collar_spiked: '#2a2e38', collar_bell: '#3d8bfd', bow_tie: '#e0423a', collar_holding: '#ffcf3d', scarf_rainbow: '#ff8fc7', bandana: '#e0423a', collar_crystal: '#b77bff', cloak_wizard: '#6a3bb8' };
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
      body.add(P(G('sphere', 0.14, 14, 12), WHITE, [0.2 * s, 1.4, 0.4], { inkT: 0.1 }));
      eye(body, 0.2 * s, 1.41, 0.53, 0.068);
      /* floppy ears hang from a pivot at the top of the head so they can flop while he walks */
      const ear = new THREE.Group();
      ear.position.set(0.4 * s, 1.52, -0.02);
      ear.rotation.z = 0.38 * s;
      ear.add(P(G('sphere', 0.26, 14, 12), OR2, [0.08 * s, -0.2, 0], { scale: [0.34, 1, 0.62] }));
      body.add(ear);
      p[s < 0 ? 'earL' : 'earR'] = ear;
    }
    body.add(P(G('torus', 0.09, 0.016, 12, Math.PI), INK, [0, 1.02, 0.5], { rot: [0.2, 0, Math.PI], ink: false }));
    const tail = new THREE.Group();
    tail.position.set(0, 0.58, -0.5);
    tail.add(P(G('cone', 0.08, 0.34, 8), OR2, [0, 0.12, -0.08], { rot: [-0.6, 0, 0] }));
    body.add(tail);
    p.tail = tail;
    for (const s of [-1, 1]) {
      body.add(P(G('cyl', 0.1, 0.1, 0.24, 10), OR, [0.26 * s, 0.14, 0]));
      body.add(P(G('sphere', 0.13, 12, 10), OR, [0.26 * s, 0.06, 0.08], { scale: [1, 0.6, 1.3] }));
    }
    if (eq.collar) {
      const art = DT.meta.loot.artOf(eq.collar);
      const col = COLLAR_LOOK[art] || '#e0423a';
      if (art === 'bow_tie') { for (const s of [-1, 1]) body.add(P(G('cone', 0.1, 0.16, 4), col, [0.09 * s, 0.9, 0.5], { rot: [0, 0, (Math.PI / 2) * s] })); }
      else if (art === 'scarf_rainbow') { body.add(P(G('torus', 0.46, 0.07, 18), col, [0, 0.92, 0.02], { rot: [Math.PI / 2, 0, 0], emissive: '#ff5fb4', ei: 0.3 })); }
      else if (art === 'bandana') { body.add(P(G('torus', 0.46, 0.06, 18), col, [0, 0.92, 0.02], { rot: [Math.PI / 2, 0, 0] })); body.add(P(G('cone', 0.2, 0.3, 3), col, [0, 0.8, 0.5], { rot: [Math.PI + 0.3, 0, 0] })); for (let i = 0; i < 3; i++) body.add(P(G('sphere', 0.025, 6, 4), WHITE, [-0.07 + i * 0.07, 0.8, 0.56], { ink: false })); }
      else if (art === 'cloak_wizard') {
        /* a little wizard capelet over Jake's shoulders */
        body.add(P(G('torus', 0.46, 0.05, 18), col, [0, 0.95, 0.02], { rot: [Math.PI / 2, 0, 0] }));
        body.add(P(G('tube', 0.5, 0.64, 0.28, 18, Math.PI), col, [0, 0.95, -0.02], { rot: [0, Math.PI / 2, 0] }));
        body.add(P(G('tubein', 0.5, 0.64, 0.28, 18, Math.PI), '#ffcf3d', [0, 0.95, -0.02], { rot: [0, Math.PI / 2, 0], ink: false }));
        body.add(P(G('star4', 0.08), '#ffe14a', [0.22, 0.95, -0.6], { basic: true, rot: [0, Math.PI, 0] }));
      }
      else body.add(P(G('torus', 0.46, 0.05, 18), col, [0, 0.92, 0.02], { rot: [Math.PI / 2, 0, 0] }));
      if (art === 'collar_bell' || art === 'collar_holding') body.add(P(G('sphere', 0.07, 10, 8), '#ffcf3d', [0, 0.84, 0.46]));
      if (art === 'collar_crystal') for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI - Math.PI / 2; body.add(P(G('octa', 0.06), '#d9ccff', [Math.sin(a) * 0.46, 0.9, Math.cos(a) * 0.46], { emissive: '#8f6bff', ei: 0.4, ink: false })); }
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

  /* Everything but the shadow hangs from a "rig" pivot in the middle of the body, so dodge rolls and flips
     turn around the hero's centre and never swing the model through the floor. */
  const RIG_Y = { finn: 0.82, jake: 0.8 };
  MD.hero = function (id, eq) {
    const g = id === 'finn' ? MD.finn(eq) : MD.jake(eq);
    const rig = new THREE.Group(), inner = new THREE.Group();
    rig.position.y = RIG_Y[id];
    inner.position.y = -RIG_Y[id];
    rig.add(inner);
    for (const c of g.children.slice()) if (c.renderOrder !== -1) inner.add(c);
    g.add(rig);
    rig.userData.y0 = RIG_Y[id];
    g.userData.parts.rig = rig;
    return g;
  };
  DT.game.models = MD;
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
      /* mine cars (the classic line) */
      case 'rails': {
        const len = o.size || 22;
        for (const z of [-0.5, 0.5]) g.add(P(G('box', len, 0.08, 0.1), '#7a808c', [0, 0.05, z], { ink: false }));
        for (let x = -len / 2 + 0.5; x < len / 2; x += 1.1) g.add(P(G('box', 0.22, 0.05, 1.4), '#6b4a2e', [x, 0.02, 0], { ink: false }));
        break;
      }
      case 'minecart': {
        g.add(P(G('box', 1.6, 0.8, 1.1), '#5a5f6a', [0, 0.62, 0]));
        g.add(P(G('box', 1.66, 0.12, 1.16), '#3a3f4b', [0, 1.0, 0], { ink: false }));
        for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) g.add(P(G('cyl', 0.2, 0.2, 0.1, 12), '#2a2e38', [x, 0.2, z], { rot: [Math.PI / 2, 0, 0] }));
        if (o.gold) for (let i = 0; i < 6; i++) g.add(P(G('ico', 0.18), '#ffcf3d', [R.float(-0.5, 0.5), 1.02, R.float(-0.3, 0.3)], { emissive: '#ffae00', ei: 0.3, ink: false }));
        else for (let i = 0; i < 5; i++) g.add(P(G('ico', 0.2), '#3a3a40', [R.float(-0.5, 0.5), 1.02, R.float(-0.3, 0.3)], { ink: false }));
        break;
      }
      case 'crystals': {
        const c = o.color || '#b77bff';
        for (let i = 0; i < 5; i++) { const a = i * 1.3; const h = 0.6 + (i % 3) * 0.35; const m = P(G('cone', 0.16 + (i % 2) * 0.06, h, 6), c, [Math.cos(a) * 0.25, h / 2, Math.sin(a) * 0.2], { emissive: c, ei: 0.35 }); m.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35); g.add(m); }
        g.add(P(G('dodeca', 0.3), '#6e645b', [0, 0.1, 0], { scale: [1.4, 0.5, 1.2] }));
        break;
      }
      case 'rocks': for (let i = 0; i < 3; i++) g.add(P(G('dodeca', 0.2 + i * 0.07), '#7a7066', [R.float(-0.3, 0.3), 0.12, R.float(-0.3, 0.3)])); break;
      /* Wizard City labs */
      case 'shelf': {
        g.add(P(G('box', 2.2, 2.4, 0.5), '#4a3326', [0, 1.2, 0]));
        for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
          const col = R.pick(['#7dff5a', '#b061ff', '#ff5fb4', '#5ec8ff', '#ffcf3d']);
          const x = -0.85 + i * 0.42, y = 0.45 + r * 0.72;
          if (i % 2) g.add(P(G('sphere', 0.14, 10, 8), col, [x, y + 0.1, 0.12], { emissive: col, ei: 0.35 }));
          else g.add(P(G('cyl', 0.09, 0.12, 0.3, 8), col, [x, y + 0.1, 0.12], { emissive: col, ei: 0.35 }));
        }
        break;
      }
      case 'cauldron': {
        const c = o.color || '#7dff5a';
        g.add(P(G('sphere', 0.62, 18, 12), '#2a2e38', [0, 0.55, 0], { scale: [1, 0.8, 1] }));
        g.add(P(G('torus', 0.52, 0.07, 20), '#3a3f4b', [0, 0.95, 0], { rot: [Math.PI / 2, 0, 0] }));
        g.add(P(G('circle', 0.5, 24), c, [0, 0.93, 0], { rot: [-Math.PI / 2, 0, 0], basic: true, ink: false }));
        for (let i = 0; i < 4; i++) g.add(P(G('sphere', 0.08 + (i % 2) * 0.04, 8, 6), c, [R.float(-0.3, 0.3), 1.0, R.float(-0.3, 0.3)], { basic: true, ink: false }));
        for (const a of [0, 2.1, 4.2]) g.add(P(G('cyl', 0.05, 0.05, 0.3, 6), '#2a2e38', [Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45], { ink: false }));
        break;
      }
      /* vampire ballrooms */
      case 'pillar':
        g.add(P(G('cyl', 0.34, 0.38, 3.9, 12), '#6a4a5a', [0, 1.95, 0]));
        g.add(P(G('box', 0.9, 0.2, 0.9), '#4a3040', [0, 0.1, 0]));
        g.add(P(G('box', 0.9, 0.2, 0.9), '#4a3040', [0, 3.9, 0]));
        g.add(P(G('cyl', 0.36, 0.36, 0.4, 12), '#a3122f', [0, 1.6, 0], { ink: false }));
        break;
      case 'chandelier': {
        const y = 3.6;
        g.add(P(G('cyl', 0.02, 0.02, 0.6, 4), '#3a3f4b', [0, y + 0.35, 0], { ink: false }));
        g.add(P(G('torus', 0.6, 0.05, 20), '#ffcf3d', [0, y, 0], { rot: [Math.PI / 2, 0, 0] }));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.add(P(G('cyl', 0.04, 0.04, 0.2, 6), '#f4efe6', [Math.cos(a) * 0.6, y + 0.12, Math.sin(a) * 0.6], { ink: false }));
          const f = new THREE.Mesh(G('cone', 0.05, 0.14, 6), FLAME());
          f.position.set(Math.cos(a) * 0.6, y + 0.3, Math.sin(a) * 0.6);
          g.add(f);
        }
        break;
      }
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
