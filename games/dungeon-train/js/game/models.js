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
      /* a big monster skull worn like a helmet: its face sits over his forehead, its teeth along the brim */
      const col = c || '#f5f0e1';
      g.add(P(G('cap', 0.49, 1.2), col, [0, 0, 0]));
      const zAt = (x, y) => Math.sqrt(Math.max(0, 0.49 * 0.49 - x * x - y * y));
      for (const s of [-1, 1]) {
        g.add(P(G('sphere', 0.1, 12, 10), '#2a2430', [0.15 * s, 0.25, zAt(0.15, 0.25) - 0.02], { ink: false, scale: [1, 0.85, 0.45], rot: [-0.5, 0, 0.3 * s] }));
        g.add(P(G('cone', 0.075, 0.34, 10), '#e8dcc0', [0.42 * s, 0.34, -0.02], { rot: [0, 0, -1.0 * s] }));
      }
      g.add(P(G('cone', 0.05, 0.08, 3), '#2a2430', [0, 0.14, zAt(0, 0.14) + 0.01], { ink: false, rot: [Math.PI - 0.3, 0, 0] }));
      for (let i = -3; i <= 3; i++) { const x = i * 0.065, y = 0.49 * Math.cos(1.2) - 0.03; g.add(P(G('cone', 0.028, 0.07, 4), col, [x, y, zAt(x, y) + 0.005], { rot: [Math.PI, 0, 0], inkT: 0.15 })); }
      return null;
    },
    hat_og: () => WHITE,
    helm_bucket: (g, c) => {
      const col = c || '#9aa3b0';
      g.add(P(G('cyl', 0.4, 0.49, 0.62, 22), col, [0, 0.2, 0]));
      g.add(P(G('torus', 0.49, 0.03, 24), '#6f7684', [0, -0.1, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
      g.add(P(G('torus', 0.42, 0.015, 20, Math.PI), '#6f7684', [0, 0.48, 0], { ink: false }));
      g.add(P(G('box', 0.44, 0.07, 0.02), INK, [0, 0.12, 0.46], { ink: false }));
      return null;
    },
    hood: (g, c) => {
      /* the hood takes the place of the bear hat: it wraps his whole head, his face peeks out of a
         rolled edge, and a point hangs off the back */
      const col = c || '#3a2a33';
      g.children[0].material = GF.mat(col);
      const fz = Math.sqrt(HR * HR - 0.3 * 0.3);
      g.add(P(G('torus', 0.3, 0.04, 28), '#2a1d25', [0, -0.045, fz - 0.02], { scale: [1.04, 0.9, 1] }));
      g.add(P(G('cone', 0.2, 0.42, 12), col, [0, 0.12, -0.44], { rot: [-2.05, 0, 0] }));
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
  /* An instrument, built facing +z with its neck up (+y). userData.depth is how far it sticks out from
     its back, userData.small says it rides on the strap in front instead of on Jake's back. */
  function instrumentMesh(it) {
    const art = DT.meta.loot.artOf(it);
    const [col, shape] = INSTRUMENT_LOOK[art] || ['#a0522d', 'strings'];
    const glow = it.unique ? '#ffd24a' : rarityGlow(it);
    const o = glow ? { emissive: glow, ei: 0.2 } : {};
    const O = (extra) => Object.assign({}, o, extra);
    const g = new THREE.Group();
    const DARK = '#2a1a0a', BOARD = '#1d1a26', GOLD = '#f0c419', SILVER = '#dfe6ee';
    let depth = 0.08;
    /* a violin-family body: a big lower bout and a smaller upper one with a waist between, f-holes, a
       bridge, a black fingerboard up a neck, and a curled scroll on top */
    const fiddle = (lo, up, neck, flat) => {
      const f = flat * lo;
      g.add(P(G('sphere', lo, 18, 12), col, [0, -lo * 0.6, 0], O({ scale: [1, 1, flat] })));
      g.add(P(G('sphere', up, 18, 12), col, [0, up * 0.75, 0], O({ scale: [1, 1, flat * lo / up] })));
      for (const sx of [-1, 1]) g.add(P(G('box', 0.018, lo * 0.55, 0.01), DARK, [sx * lo * 0.42, -lo * 0.2, f + 0.004], { ink: false, rot: [0, 0, -0.15 * sx] }));
      g.add(P(G('box', lo * 0.55, 0.03, 0.03), '#e8d5a8', [0, -lo * 0.55, f + 0.01], { ink: false }));
      g.add(P(G('box', 0.06, up * 1.4 + neck, 0.025), BOARD, [0, (up * 1.4 + neck) / 2 - lo * 0.3, f + 0.01], { ink: false }));
      g.add(P(G('box', 0.055, neck, 0.05), DARK, [0, up * 1.5 + neck / 2, 0]));
      g.add(P(G('torus', 0.04, 0.018, 14), DARK, [0, up * 1.5 + neck + 0.04, 0], { rot: [0, Math.PI / 2, 0] }));
      for (const sx of [-0.012, 0.012]) g.add(P(G('box', 0.004, up * 1.4 + neck + lo * 0.4, 0.004), '#fff4d6', [sx, (up * 1.4 + neck) / 2 - lo * 0.45, f + 0.026], { ink: false }));
      depth = f + 0.03;
    };
    switch (shape) {
      case 'strings': fiddle(0.2, 0.16, 0.2, 0.32); break;
      case 'bass': fiddle(0.28, 0.21, 0.32, 0.3); break;
      case 'guitar': {
        g.add(P(G('sphere', 0.25, 18, 12), col, [0, -0.15, 0], O({ scale: [1, 0.95, 0.3] })));
        g.add(P(G('sphere', 0.19, 18, 12), col, [0, 0.14, 0], O({ scale: [1, 0.95, 0.39] })));
        g.add(P(G('circle', 0.065, 20), DARK, [0, 0.02, 0.078], { basic: true }));
        g.add(P(G('torus', 0.07, 0.008, 20), '#fff4d6', [0, 0.02, 0.077], { ink: false }));
        g.add(P(G('box', 0.14, 0.03, 0.02), DARK, [0, -0.23, 0.074], { ink: false }));
        g.add(P(G('box', 0.065, 0.55, 0.04), '#3b2a1a', [0, 0.55, 0.02]));
        g.add(P(G('box', 0.11, 0.15, 0.04), col, [0, 0.9, 0.02], o));
        for (const sx of [-0.015, 0.015]) g.add(P(G('box', 0.004, 1.0, 0.004), '#fff4d6', [sx, 0.35, 0.082], { ink: false }));
        depth = 0.09;
        break;
      }
      case 'drum': {
        /* bongos: two drums joined side by side, heads facing out */
        for (const [x, r, h] of [[-0.13, 0.17, 0.15], [0.18, 0.13, 0.13]]) {
          g.add(P(G('cyl', r, r * 0.85, h, 18), col, [x, 0, 0], O({ rot: [Math.PI / 2, 0, 0] })));
          g.add(P(G('circle', r * 0.95, 20), '#fff8e8', [x, 0, h / 2 + 0.003], { basic: true }));
          g.add(P(G('torus', r, 0.018, 20), '#6b4226', [x, 0, h / 2], { ink: false }));
        }
        g.add(P(G('box', 0.14, 0.1, 0.1), '#6b4226', [0.02, 0, 0]));
        depth = 0.08;
        break;
      }
      case 'axe': {
        /* Marceline's axe bass: an axe head for a body */
        g.add(P(G('box', 0.08, 1.0, 0.06), DARK, [0, 0.2, 0]));
        g.add(P(G('box', 0.48, 0.42, 0.06), col, [0.1, -0.22, 0], o));
        g.add(P(G('cone', 0.21, 0.2, 3), col, [0.4, -0.22, 0], O({ rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.28] })));
        for (let i = 0; i < 4; i++) g.add(P(G('box', 0.004, 0.9, 0.004), SILVER, [-0.012 + i * 0.008, 0.2, 0.035], { ink: false }));
        depth = 0.05;
        break;
      }
      case 'horn': {
        /* a trumpet, bell up */
        g.add(P(G('cone', 0.13, 0.26, 16), col, [0, 0.3, 0], O({ rot: [Math.PI, 0, 0] })));
        g.add(P(G('circle', 0.12, 16), '#3a2a10', [0, 0.425, 0], { basic: true, rot: [-Math.PI / 2, 0, 0] }));
        g.add(P(G('cyl', 0.03, 0.03, 0.5, 8), col, [0, -0.08, 0], o));
        g.add(P(G('torus', 0.09, 0.022, 16), col, [0.09, -0.12, 0], O({ rot: [0, Math.PI / 2, 0] })));
        for (let i = 0; i < 3; i++) g.add(P(G('cyl', 0.022, 0.022, 0.1, 8), SILVER, [0.05, -0.05 + i * 0.07, 0.04], { rot: [Math.PI / 2, 0, 0] }));
        g.add(P(G('cyl', 0.02, 0.035, 0.06, 8), SILVER, [0, -0.36, 0]));
        depth = 0.13;
        break;
      }
      case 'box': {
        /* an accordion: two painted ends and pleated bellows */
        for (const x of [-0.2, 0.2]) g.add(P(G('box', 0.12, 0.38, 0.26), col, [x, 0, 0], o));
        g.add(P(G('box', 0.28, 0.34, 0.24), '#fff4d6', [0, 0, 0]));
        for (let i = 0; i < 5; i++) g.add(P(G('box', 0.012, 0.35, 0.25), '#3a2a2a', [-0.11 + i * 0.055, 0, 0], { ink: false }));
        for (let i = 0; i < 6; i++) g.add(P(G('box', 0.05, 0.035, 0.02), i % 2 ? BOARD : '#ffffff', [-0.2, -0.13 + i * 0.052, 0.135], { ink: false }));
        depth = 0.13;
        break;
      }
      case 'banjo': {
        g.add(P(G('cyl', 0.2, 0.2, 0.07, 22), col, [0, -0.1, 0], O({ rot: [Math.PI / 2, 0, 0] })));
        g.add(P(G('circle', 0.18, 22), '#fff8e8', [0, -0.1, 0.037], { basic: true }));
        g.add(P(G('torus', 0.19, 0.014, 22), SILVER, [0, -0.1, 0.036], { ink: false }));
        g.add(P(G('box', 0.05, 0.62, 0.035), '#6b4226', [0, 0.4, 0.01]));
        g.add(P(G('box', 0.09, 0.13, 0.035), '#6b4226', [0, 0.76, 0.01]));
        for (const sx of [-0.012, 0.012]) g.add(P(G('box', 0.004, 0.9, 0.004), SILVER, [sx, 0.3, 0.042], { ink: false }));
        depth = 0.05;
        break;
      }
      case 'keys': {
        /* a keytar: a slanted body with a keyboard along it and a neck with a grip */
        g.add(P(G('box', 0.62, 0.2, 0.07), col, [0, 0, 0], o));
        g.add(P(G('box', 0.5, 0.08, 0.02), '#ffffff', [-0.03, -0.04, 0.042], { ink: false }));
        for (let i = 0; i < 7; i++) if (i % 7 !== 2 && i % 7 !== 6) g.add(P(G('box', 0.03, 0.045, 0.02), BOARD, [-0.24 + i * 0.07, -0.02, 0.05], { ink: false }));
        g.add(P(G('box', 0.32, 0.07, 0.05), col, [0.44, 0.08, 0], O({ rot: [0, 0, 0.25] })));
        g.add(P(G('box', 0.1, 0.08, 0.06), BOARD, [0.6, 0.12, 0], { rot: [0, 0, 0.25] }));
        depth = 0.05;
        break;
      }
      case 'harp': {
        /* a harmonica: small enough to clip onto his strap */
        g.add(P(G('box', 0.26, 0.07, 0.07), col, [0, 0, 0], o));
        g.add(P(G('box', 0.2, 0.05, 0.075), '#6f7684', [0, 0, 0], { ink: false }));
        for (let i = 0; i < 7; i++) g.add(P(G('box', 0.016, 0.022, 0.02), BOARD, [-0.09 + i * 0.03, 0, 0.036], { ink: false }));
        depth = 0.04;
        g.userData.small = true;
        break;
      }
      case 'tuba': {
        g.add(P(G('torus', 0.2, 0.06, 18), col, [0, -0.1, 0], O({ rot: [0, 0, 0] })));
        g.add(P(G('cone', 0.24, 0.36, 18), col, [0.12, 0.3, 0], O({ rot: [Math.PI, 0, -0.2] })));
        g.add(P(G('circle', 0.23, 18), '#3a2a10', [0.16, 0.48, 0], { basic: true, rot: [-Math.PI / 2 + 0.2, 0, 0] }));
        for (let i = 0; i < 3; i++) g.add(P(G('cyl', 0.026, 0.026, 0.12, 8), SILVER, [-0.06 + i * 0.06, -0.1, 0.07], { rot: [Math.PI / 2, 0, 0] }));
        depth = 0.12;
        break;
      }
      case 'antenna': {
        /* a theremin: a wooden cabinet with a tall antenna and a loop */
        g.add(P(G('box', 0.44, 0.24, 0.22), col, [0, 0, 0], o));
        g.add(P(G('box', 0.38, 0.05, 0.225), '#3a2a2a', [0, 0.06, 0], { ink: false }));
        for (const x of [-0.1, 0.1]) g.add(P(G('cyl', 0.03, 0.03, 0.03, 10), SILVER, [x, -0.05, 0.115], { rot: [Math.PI / 2, 0, 0], ink: false }));
        g.add(P(G('cyl', 0.012, 0.012, 0.55, 6), SILVER, [0.16, 0.39, 0], { ink: false }));
        g.add(P(G('torus', 0.09, 0.012, 14), SILVER, [-0.3, 0.02, 0], { rot: [0, Math.PI / 2, 0], ink: false }));
        depth = 0.11;
        break;
      }
      default: fiddle(0.2, 0.16, 0.2, 0.32);
    }
    g.userData.depth = depth;
    return g;
  }
  const COLLAR_LOOK = { collar: '#e0423a', collar_spiked: '#2a2e38', collar_bell: '#3d8bfd', bow_tie: '#e0423a', collar_holding: '#ffcf3d', scarf_rainbow: '#ff8fc7', bandana: '#e0423a', collar_crystal: '#b77bff', cloak_wizard: '#6a3bb8' };

  /* ---------- things that hug Jake ---------- */
  /* Jake is built from these blobs (center, radii): his body, his head and his jowls. Collars, straps and
     capes are shaped from them so they sit on him instead of sinking in or floating off. */
  const JAKE_BLOBS = [
    { c: [0, 0.72, 0], r: [0.62, 0.558, 0.533] },
    { c: [0, 1.24, 0.05], r: [0.52, 0.52, 0.52] },
    { c: [0.17, 1.07, 0.42], r: [0.2, 0.2, 0.2], jowl: true },
    { c: [-0.17, 1.07, 0.42], r: [0.2, 0.2, 0.2], jowl: true },
  ];
  /* How far out from his middle Jake's surface is at height y, looking in direction a (0 = straight
     ahead, PI = straight back). Jowls hang over collars, so they're left out unless asked for. */
  function jakeR(a, y, jowls) {
    const dx = Math.sin(a), dz = Math.cos(a);
    let best = 0;
    for (const { c, r, jowl } of JAKE_BLOBS) {
      if (jowl && !jowls) continue;
      const A = (dx / r[0]) ** 2 + (dz / r[2]) ** 2;
      const B = -2 * ((dx * c[0]) / (r[0] * r[0]) + (dz * c[2]) / (r[2] * r[2]));
      const C = (c[0] / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + (c[2] / r[2]) ** 2 - 1;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) best = Math.max(best, (-B + Math.sqrt(disc)) / (2 * A));
    }
    return best;
  }
  const jakeAt = (a, y, out) => { const r = jakeR(a, y) + (out || 0); return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  /* A strap around Jake on a tilted ring, y = y0 - tz*cos(a) - tx*sin(a) (tz > 0: lower in front than at
     the back). It is h tall and sits t proud of his surface; o.from/o.to make it an open arc, o.rows
     lets a tall strip follow his curves, and o.flare pushes its lower edge out (a cape). Built around
     y0, so place the mesh at y0. */
  function jakeBand(y0, tz, tx, h, t, o) {
    o = o || {};
    const open = o.from != null, a0 = open ? o.from : 0, a1 = open ? o.to : Math.PI * 2;
    const N = o.n || 56, M = open ? N + 1 : N, rows = Math.max(2, o.rows || 2), flare = o.flare || 0;
    const sec = [[h / 2, 0, 0]];
    for (let k = 0; k < rows; k++) sec.push([h / 2 - (h * k) / (rows - 1), 1, k / (rows - 1)]);
    sec.push([-h / 2, 0, 1]);
    const S = sec.length, pos = [], idx = [];
    for (let i = 0; i < M; i++) {
      const a = a0 + ((a1 - a0) * i) / N, s = Math.sin(a), c = Math.cos(a);
      const yc = y0 - tz * c - tx * s;
      for (const [dy, out, f] of sec) {
        const y = yc + dy, r = jakeR(a, y) + (out ? t + flare * f * f : -0.02);
        pos.push(s * r, y - y0, c * r);
      }
    }
    for (let i = 0; i < N; i++) {
      const j = open ? i + 1 : (i + 1) % N;
      for (let k = 0; k < S; k++) { const k2 = (k + 1) % S; idx.push(i * S + k, i * S + k2, j * S + k2, i * S + k, j * S + k2, j * S + k); }
    }
    if (open) { const e = (M - 1) * S; for (let k = 1; k < S - 1; k++) idx.push(0, k + 1, k, e, e + k, e + k + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  /* A piece of cloth lying on Jake (a bandana's point, a cape): u runs 0 (top) to 1 (bottom); at each
     u it spans ac +- half(u) around him at height y(u, a), t thick, off above his skin. */
  function jakePatch(ac, half, yOf, off, t, o) {
    o = o || {};
    const U = o.rows || 8, K = o.cols || 14, flare = o.flare || 0, pos = [], idx = [];
    for (const layer of [0, 1]) for (let i = 0; i <= U; i++) for (let j = 0; j <= K; j++) {
      const u = i / U, hw = half(u), a = ac - hw + (2 * hw * j) / K, y = yOf(u, a);
      const r = jakeR(a, y, o.jowls) + off + flare * u * u + (layer ? 0 : t);
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
    }
    const L = (U + 1) * (K + 1), v = (l, i, j) => l * L + i * (K + 1) + j;
    for (let i = 0; i < U; i++) for (let j = 0; j < K; j++) {
      idx.push(v(0, i, j), v(0, i + 1, j), v(0, i + 1, j + 1), v(0, i, j), v(0, i + 1, j + 1), v(0, i, j + 1));
      idx.push(v(1, i, j), v(1, i + 1, j + 1), v(1, i + 1, j), v(1, i, j), v(1, i, j + 1), v(1, i + 1, j + 1));
    }
    for (let j = 0; j < K; j++) {
      idx.push(v(0, 0, j), v(0, 0, j + 1), v(1, 0, j + 1), v(0, 0, j), v(1, 0, j + 1), v(1, 0, j));
      idx.push(v(0, U, j), v(1, U, j), v(1, U, j + 1), v(0, U, j), v(1, U, j + 1), v(0, U, j + 1));
    }
    for (let i = 0; i < U; i++) {
      idx.push(v(0, i, 0), v(1, i, 0), v(1, i + 1, 0), v(0, i, 0), v(1, i + 1, 0), v(0, i + 1, 0));
      idx.push(v(0, i, K), v(0, i + 1, K), v(1, i + 1, K), v(0, i, K), v(1, i + 1, K), v(1, i, K));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  /* Jake's collars sit where his head meets his body: low at the throat, tucked under his jowls, and
     higher at the back of his neck. */
  const NECK = { y: 0.97, tz: 0.12 };
  const neckY = (a) => NECK.y - NECK.tz * Math.cos(a);
  function jakeCollar(body, it) {
    const art = DT.meta.loot.artOf(it);
    const col = COLLAR_LOOK[art] || '#e0423a';
    const glow = it.unique ? { emissive: col, ei: 0.25 } : {};
    const band = (color, h, t, o) => { const m = P(jakeBand(NECK.y, NECK.tz, 0, h, t, o), color, [0, NECK.y, 0], Object.assign({ inkW: 0.016 }, o && o.mat)); body.add(m); return m; };
    /* something hanging from the front of the collar (a tag, a bell), dy below the band's middle */
    const front = (dy, out) => jakeAt(0, neckY(0) - dy, out);
    if (art === 'bow_tie') {
      band(col, 0.05, 0.03);
      const [x, y, z] = jakeAt(0, neckY(0), 0.06);
      const bow = new THREE.Group();
      bow.position.set(x, y, z);
      for (const s of [-1, 1]) bow.add(P(G('cone', 0.075, 0.17, 4), col, [0.085 * s, 0, 0], { rot: [0, 0, (-Math.PI / 2) * s], scale: [1, 1, 0.55] }));
      bow.add(P(G('sphere', 0.045, 10, 8), '#b8322b', [0, 0, 0.01]));
      body.add(bow);
    } else if (art === 'scarf_rainbow') {
      /* Lady Rainicorn's colors, wrapped round his neck in stripes, with two tails hanging down the back */
      const RB = ['#ff5f6d', '#ffa94d', '#ffe066', '#6bd66b', '#5fb3ff', '#b77bff'];
      const n = RB.length;
      for (let i = 0; i < n; i++) band(RB[i], 0.15, 0.06, { from: (i / n) * Math.PI * 2 - 0.01, to: ((i + 1) / n) * Math.PI * 2 + 0.01, n: 10, mat: { emissive: RB[i], ei: 0.15 } });
      for (const [a, len] of [[Math.PI - 0.35, 0.34], [Math.PI - 0.12, 0.26]]) {
        const yTop = neckY(a) - 0.05;
        for (let k = 0; k < 3; k++) body.add(P(jakePatch(a, () => 0.075, (u) => yTop - (u * len) / 3 - (k * len) / 3, 0.035, 0.03, { rows: 2, cols: 4 }), RB[(k * 2 + (a > 2.9 ? 1 : 0)) % n], [0, 0, 0], { inkW: 0.012 }));
      }
    } else if (art === 'bandana') {
      band(col, 0.09, 0.04);
      /* the point of the bandana hangs down his chest */
      const yTop = neckY(0) - 0.035;
      body.add(P(jakePatch(0, (u) => 0.55 * (1 - u) + 0.02, (u) => yTop - u * 0.26, 0.012, 0.025, { rows: 8, cols: 14 }), col, [0, 0, 0], { inkW: 0.012 }));
      for (const [a, dy] of [[-0.22, 0.07], [0.2, 0.08], [0, 0.15], [-0.08, 0.04], [0.1, 0.2]]) {
        const [x, y, z] = jakeAt(a, yTop - dy, 0.043);
        body.add(P(G('sphere', 0.022, 8, 6), WHITE, [x, y, z], { ink: false, scale: [1, 1, 0.4], rot: [0, a, 0] }));
      }
      const [kx, ky, kz] = jakeAt(Math.PI, neckY(Math.PI), 0.05);
      body.add(P(G('sphere', 0.05, 10, 8), col, [kx, ky, kz]));
      for (const s of [-1, 1]) body.add(P(G('cone', 0.035, 0.14, 5), col, [kx + 0.04 * s, ky - 0.08, kz - 0.02], { rot: [0.3, 0, 0.4 * s] }));
    } else if (art === 'cloak_wizard') {
      /* a little wizard capelet: a purple cape with a gold lining hanging off the collar, a star clasp */
      band(col, 0.08, 0.035);
      const cape = (off, t, color) => P(jakePatch(Math.PI, (u) => 1.2 + u * 0.15, (u, a) => neckY(a) - 0.03 - u * 0.52, off, t, { rows: 10, cols: 22, flare: 0.07 }), color, [0, 0, 0], { inkW: 0.014 });
      body.add(cape(0.02, 0.03, col));
      const [cx, cy, cz] = jakeAt(0, neckY(0), 0.06);
      body.add(P(G('star4', 0.075), '#ffe14a', [cx, cy, cz], { basic: true }));
      body.add(P(G('sphere', 0.035, 8, 6), '#ffcf3d', [cx, cy, cz - 0.01]));
      const [sx, sy, sz] = jakeAt(Math.PI, neckY(Math.PI) - 0.3, 0.1);
      body.add(P(G('star4', 0.09), '#ffe14a', [sx, sy, sz], { basic: true, rot: [0, Math.PI, 0] }));
    } else {
      band(col, 0.11, 0.045, { mat: glow });
      if (art === 'collar' || art === 'collar_holding') {
        /* a round name tag on a little ring */
        const gold = art === 'collar_holding';
        const [rx, ry, rz] = front(0.07, 0.05);
        body.add(P(G('torus', 0.025, 0.008, 10), '#c9a03a', [rx, ry, rz], { ink: false }));
        const [tx, ty, tz] = front(0.13, 0.055);
        body.add(P(G('cyl', 0.06, 0.06, 0.02, 16), gold ? '#b77bff' : '#ffcf3d', [tx, ty, tz], { rot: [Math.PI / 2 - 0.25, 0, 0], emissive: gold ? '#8f5bff' : null, ei: gold ? 0.4 : 0 }));
        if (gold) for (const s of [-1, 1]) { const [bx, by, bz] = jakeAt(0.45 * s, neckY(0.45 * s), 0.05); body.add(P(G('octa', 0.035), '#fff4c2', [bx, by, bz], { ink: false, emissive: '#ffe066', ei: 0.4 })); }
      }
      if (art === 'collar_bell') {
        const [x, y, z] = front(0.12, 0.07);
        const bell = new THREE.Group();
        bell.position.set(x, y, z);
        bell.add(P(G('sphere', 0.075, 14, 10), '#ffcf3d', [0, 0, 0], { emissive: '#ffb000', ei: 0.15 }));
        bell.add(P(G('box', 0.1, 0.012, 0.02), '#8a6a10', [0, -0.018, 0.07], { ink: false }));
        bell.add(P(G('sphere', 0.018, 8, 6), '#8a6a10', [0, -0.05, 0.05], { ink: false }));
        bell.add(P(G('torus', 0.022, 0.008, 10), '#c9a03a', [0, 0.08, 0], { ink: false }));
        body.add(bell);
      }
      if (art === 'collar_spiked') {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const spike = new THREE.Group();
          spike.rotation.y = a;
          spike.position.y = neckY(a);
          spike.add(P(G('cone', 0.035, 0.11, 6), '#e8edf2', [0, 0, jakeR(a, neckY(a)) + 0.08], { rot: [Math.PI / 2, 0, 0], inkT: 0.12 }));
          body.add(spike);
        }
      }
      if (art === 'collar_crystal') {
        const gems = ['#d9ccff', '#9fe3ff', '#ffc2e8'];
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const [x, y, z] = jakeAt(a, neckY(a), 0.065);
          body.add(P(G('octa', 0.05), gems[i % 3], [x, y, z], { rot: [0, a, 0.3], scale: [0.8, 1.3, 0.8], emissive: '#8f6bff', ei: 0.35, inkT: 0.1 }));
        }
      }
    }
  }
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
    if (eq.collar) jakeCollar(body, eq.collar);
    if (eq.instrument) {
      /* slung on a leather strap across his body: most instruments ride on his back, the harmonica is
         clipped to the strap in front */
      const STRAP = { y: 0.72, tx: 0.19 };
      const strapY = (a) => STRAP.y - STRAP.tx * Math.sin(a);
      body.add(P(jakeBand(STRAP.y, 0, STRAP.tx, 0.065, 0.028), '#7a4a24', [0, STRAP.y, 0], { inkW: 0.014 }));
      const [bx, by, bz] = jakeAt(0, strapY(0), 0.035);
      body.add(P(G('box', 0.085, 0.085, 0.02), '#c9a03a', [bx, by, bz], { rot: [0, 0, 0.3] }));
      const inst = instrumentMesh(eq.instrument);
      const holder = new THREE.Group();
      if (inst.userData.small) {
        const a = 0.6, y = strapY(a);
        holder.position.set(...jakeAt(a, y, inst.userData.depth + 0.02));
        holder.rotation.set(0, a, -0.25);
      } else {
        const a = Math.PI, y = strapY(a) + 0.12;
        holder.position.set(...jakeAt(a, y, inst.userData.depth + 0.05));
        holder.rotation.set(0, Math.PI, -0.55);
      }
      holder.add(inst);
      body.add(holder);
      p.instrument = holder;
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
      case 'banquet': {
        g.add(P(G('box', 4.2, 0.12, 1.3), '#7a4b2a', [0, 0.85, 0])); for (const x of [-1.9, 1.9]) for (const z of [-0.5, 0.5]) g.add(P(G('box', 0.12, 0.8, 0.12), '#5c3b22', [x, 0.4, z]));
        if (o.pies) for (let i = 0; i < 4; i++) { g.add(P(G('cyl', 0.3, 0.26, 0.12, 14), '#e8a95a', [-1.5 + i * 1.0, 0.97, R.float(-0.25, 0.25)])); g.add(P(G('cyl', 0.24, 0.24, 0.02, 14), R.pick(['#c2413a', '#7a3bc4', '#f0b429']), [-1.5 + i * 1.0, 1.04, 0], { ink: false })); }
        else for (let i = 0; i < 4; i++) g.add(P(G('cyl', 0.07, 0.05, 0.2, 8), '#ffcf3d', [-1.4 + i * 0.95, 1.0, R.float(-0.3, 0.3)], { ink: false }));
        g.add(P(G('cyl', 0.04, 0.04, 0.3, 6), '#f4efe6', [0, 1.06, 0], { ink: false })); const f = new THREE.Mesh(G('cone', 0.05, 0.14, 6), FLAME()); f.position.set(0, 1.28, 0); g.add(f); break;
      }
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
      /* vampire ballrooms (plain: grey stone, for the subway station) */
      case 'pillar':
        g.add(P(G('cyl', 0.34, 0.38, 3.9, 12), o.plain ? '#8a8e86' : '#6a4a5a', [0, 1.95, 0]));
        g.add(P(G('box', 0.9, 0.2, 0.9), o.plain ? '#5a5e56' : '#4a3040', [0, 0.1, 0]));
        g.add(P(G('box', 0.9, 0.2, 0.9), o.plain ? '#5a5e56' : '#4a3040', [0, 3.9, 0]));
        if (!o.plain) g.add(P(G('cyl', 0.36, 0.36, 0.4, 12), '#a3122f', [0, 1.6, 0], { ink: false }));
        else g.add(P(G('cyl', 0.36, 0.36, 0.3, 12), '#e0c040', [0, 1.4, 0], { ink: false }));
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
      /* the Mystery Dungeon's carved stone at the entrance */
      case 'obelisk': {
        const c = o.color || '#c8b88a';
        g.add(P(G('box', 1.0, 2.8, 0.5), c, [0, 1.4, 0]));
        g.add(P(G('cone', 0.72, 0.5, 4), c, [0, 3.05, 0], { rot: [0, Math.PI / 4, 0] }));
        for (let i = 0; i < 6; i++) g.add(P(G('box', 0.62 - (i % 2) * 0.14, 0.05, 0.02), INK, [0, 1.0 + i * 0.26, 0.26], { ink: false }));
        g.add(P(G('ring', 0.08, 0.14, 16), INK, [0, 2.6, 0.26], { ink: false }));
        break;
      }
      /* Wizard City */
      case 'fountain': {
        const w = o.color || '#5ec8ff';
        g.add(P(G('cyl', 1.55, 1.65, 0.55, 24), '#b8b0a4', [0, 0.28, 0]));
        g.add(P(G('circle', 1.4, 24), w, [0, 0.52, 0], { rot: [-Math.PI / 2, 0, 0], basic: true, ink: false }));
        g.add(P(G('cyl', 0.22, 0.3, 1.3, 12), '#b8b0a4', [0, 0.9, 0]));
        g.add(P(G('cyl', 0.62, 0.4, 0.2, 18), '#b8b0a4', [0, 1.55, 0]));
        g.add(P(G('circle', 0.55, 18), w, [0, 1.66, 0], { rot: [-Math.PI / 2, 0, 0], basic: true, ink: false }));
        g.add(P(G('sphere', 0.16, 10, 8), w, [0, 1.85, 0], { basic: true, ink: false }));
        g.add(P(G('star4', 0.2), '#ffe14a', [0, 2.2, 0], { basic: true }));
        break;
      }
      case 'lamppost': {
        g.add(P(G('cyl', 0.2, 0.26, 0.3, 10), '#2a2e38', [0, 0.15, 0]));
        g.add(P(G('cyl', 0.07, 0.09, 3.2, 8), '#2a2e38', [0, 1.7, 0]));
        g.add(P(G('box', 0.42, 0.5, 0.42), '#2a2e38', [0, 3.45, 0]));
        g.add(P(G('box', 0.32, 0.4, 0.32), '#ffe9a8', [0, 3.45, 0], { basic: true, ink: false }));
        g.add(P(G('cone', 0.34, 0.3, 4), '#2a2e38', [0, 3.85, 0], { rot: [0, Math.PI / 4, 0] }));
        break;
      }
      case 'stall': {
        const c = o.color || '#e0423a';
        g.add(P(G('box', 2.4, 0.9, 1.2), '#8a5a34', [0, 0.45, 0]));
        for (const x of [-1.1, 1.1]) for (const z of [-0.55, 0.55]) g.add(P(G('cyl', 0.05, 0.05, 2.4, 6), '#5c3b22', [x, 1.2, z], { ink: false }));
        for (let i = 0; i < 5; i++) g.add(P(G('box', 0.52, 0.06, 1.7), i % 2 ? '#fff4e0' : c, [-1.04 + i * 0.52, 2.45, 0.1], { rot: [0.18, 0, 0] }));
        for (let i = 0; i < 6; i++) { const col = R.pick(['#7dff5a', '#b061ff', '#ff5fb4', '#5ec8ff', '#ffcf3d', '#e0423a']); if (i % 2) g.add(P(G('sphere', 0.13, 10, 8), col, [-0.9 + i * 0.36, 1.03, R.float(-0.2, 0.3)], { emissive: col, ei: 0.3 })); else g.add(P(G('cyl', 0.09, 0.11, 0.3, 8), col, [-0.9 + i * 0.36, 1.05, R.float(-0.2, 0.3)])); }
        break;
      }
      case 'hedge': {
        g.add(P(G('box', 1.6, 1.2, 1.1), '#3f8a3a', [0, 0.6, 0]));
        for (const x of [-0.45, 0.45]) g.add(P(G('sphere', 0.55, 12, 10), '#4fa84a', [x, 1.25, 0], { scale: [1, 0.7, 1] }));
        g.add(P(G('sphere', 0.12, 8, 6), '#ff5fb4', [0.3, 1.5, 0.35], { ink: false }));
        break;
      }
      /* the Mystery Dungeon's baking room and steamy pool */
      case 'oven': {
        g.add(P(G('box', 1.6, 1.8, 1.2), '#9a5a3a', [0, 0.9, 0]));
        g.add(P(G('cyl', 0.55, 0.55, 1.22, 16, Math.PI), '#9a5a3a', [0, 1.8, 0], { rot: [Math.PI / 2, 0, Math.PI / 2] }));
        g.add(P(G('box', 0.9, 0.7, 0.05), '#ff8a2e', [0, 0.8, 0.61], { emissive: '#ff5a00', ei: 0.9, ink: false }));
        g.add(P(G('box', 1.0, 0.1, 0.1), '#3a2a1a', [0, 1.2, 0.62], { ink: false }));
        g.add(P(G('cyl', 0.16, 0.16, 1.2, 8), '#6a3a2a', [0.45, 2.6, -0.2]));
        break;
      }
      case 'pool': {
        const w = o.w || 6, d = o.d || 5, c = o.color || '#5ec8ff';
        g.add(P(G('box', w - 0.3, 0.06, d - 0.3), c, [0, 0.06, 0], { basic: true, ink: false }));
        for (const s of [-1, 1]) { g.add(P(G('box', w, 0.45, 0.35), '#8a8278', [0, 0.22, s * (d / 2 - 0.17)])); g.add(P(G('box', 0.35, 0.45, d), '#8a8278', [s * (w / 2 - 0.17), 0.22, 0])); }
        for (let i = 0; i < 5; i++) g.add(P(G('sphere', 0.4 + (i % 2) * 0.2, 10, 8), '#ffffff', [R.float(-w / 3, w / 3), 0.6 + i * 0.25, R.float(-d / 3, d / 3)], { basic: true, opacity: 0.22, ink: false }));
        break;
      }
      /* the Vampire Hive: six-sided wax columns */
      case 'wax': {
        const c = o.color || '#b0703a';
        g.add(P(G('cyl', 0.82, 0.9, 4.4, 6), c, [0, 2.2, 0]));
        g.add(P(G('cyl', 0.95, 0.95, 0.3, 6), '#5a2a1a', [0, 4.35, 0]));
        for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; g.add(P(G('cone', 0.09, 0.4, 6), '#ffb84a', [Math.cos(a) * 0.82, 3.2 - i * 0.5, Math.sin(a) * 0.82], { rot: [Math.PI, 0, 0], emissive: '#ffae00', ei: 0.3, ink: false })); }
        break;
      }
      /* the Lich's Well: a wrecked subway car on its side of the platform */
      case 'subway_car': {
        const w = o.w || 14, c = o.color || '#7a8a7a';
        const car = new THREE.Group();
        car.add(P(G('box', w, 2.6, 2.8), c, [0, 1.5, 0]));
        car.add(P(G('box', w + 0.1, 0.3, 2.9), '#4a524a', [0, 2.9, 0]));
        car.add(P(G('box', w + 0.1, 0.25, 2.9), '#c9a23a', [0, 1.0, 0], { ink: false }));
        for (let x = -w / 2 + 1.2; x < w / 2 - 0.8; x += 1.8) car.add(P(G('box', 1.1, 0.8, 2.84), '#1e2a1c', [x, 2.0, 0], { ink: false }));
        for (let i = 0; i < 3; i++) car.add(P(G('dodeca', 0.3 + i * 0.1), '#6a4a2a', [R.float(-w / 2, w / 2), 2.5, 1.35], { scale: [1.4, 0.5, 0.3], ink: false }));
        for (const x of [-w / 2 + 1.5, w / 2 - 1.5]) car.add(P(G('cyl', 0.42, 0.42, 2.9, 12), '#2a2e38', [x, 0.2, 0], { rot: [Math.PI / 2, 0, 0] }));
        car.rotation.z = 0.035; car.rotation.x = 0.03;
        g.add(car);
        break;
      }
      case 'pole': g.add(P(G('cyl', 0.05, 0.05, 3.2, 8), '#c9c9c0', [0, 1.6, 0])); break;
      /* the Well of Power */
      case 'well': {
        g.add(P(G('cyl', 2.5, 2.7, 1.0, 24), '#4a524a', [0, 0.5, 0]));
        g.add(P(G('torus', 2.35, 0.18, 24), '#2a302a', [0, 1.0, 0], { rot: [Math.PI / 2, 0, 0] }));
        g.add(P(G('circle', 2.2, 28), o.color || '#7dff5a', [0, 0.96, 0], { rot: [-Math.PI / 2, 0, 0], basic: true, ink: false }));
        for (let i = 0; i < 6; i++) g.add(P(G('sphere', 0.14 + (i % 3) * 0.06, 8, 6), '#c8ffb8', [R.float(-1.4, 1.4), 1.1 + i * 0.1, R.float(-1.4, 1.4)], { basic: true, ink: false }));
        g.add(GF.beam(o.color || '#7dff5a', 7));
        break;
      }
      default: g.add(P(G('box', 0.8, 0.8, 0.8), '#999999', [0, 0.4, 0]));
    }
    return g;
  };
  /* Landmarks of Ooo around the Tree Fort, for the title screen's opening sweep (like the show's intro):
     the Ice Kingdom's mountain, the Candy Kingdom and a broken old highway from before the war. */
  MD.oooLandmarks = function () {
    const g = new THREE.Group();
    /* the Ice Kingdom */
    const ice = new THREE.Group();
    ice.position.set(72, 0, -96);
    ice.add(P(G('cone', 24, 38, 7), '#bfe9ff', [0, 19, 0], { inkT: 0.02 }));
    ice.add(P(G('cone', 10.5, 16.5, 7), '#ffffff', [0, 29.8, 0], { ink: false }));
    ice.add(P(G('box', 6, 4, 6), '#8fd3f5', [0, 39, 0]));
    ice.add(P(G('cone', 4.4, 6, 4), '#6fc3ee', [0, 44, 0], { rot: [0, Math.PI / 4, 0] }));
    for (const s of [-1, 1]) ice.add(P(G('cone', 1.6, 7, 6), '#8fd3f5', [s * 3.2, 42, 1.5]));
    for (const [x, z, r] of [[-26, 10, 9], [24, 8, 11], [-10, 16, 6]]) ice.add(P(G('cone', r, r * 1.3, 6), '#d9f3ff', [x, r * 0.65, z], { inkT: 0.02 }));
    g.add(ice);
    /* the Candy Kingdom: pink towers, gumdrop hills */
    const cc = new THREE.Group();
    cc.position.set(-64, 0, -84);
    cc.add(P(G('cyl', 8, 9, 13, 16), '#ffb3d9', [0, 6.5, 0]));
    cc.add(P(G('cone', 9.5, 5, 16), '#ff5fa2', [0, 15.5, 0]));
    for (const [x, z, h] of [[-9, 2, 20], [9, 2, 24], [0, -6, 30], [-4, 7, 16], [5, 7, 18]]) {
      cc.add(P(G('cyl', 2.4, 2.6, h, 12), h > 22 ? '#ffd1e8' : '#ff9ccf', [x, h / 2, z]));
      cc.add(P(G('cone', 3.2, 5, 12), ['#ff5fa2', '#b18cff', '#7ed6ff'][Math.round(h) % 3], [x, h + 2.5, z]));
      cc.add(P(G('torus', 2.5, 0.35, 16), '#ffffff', [x, h * 0.6, z], { rot: [Math.PI / 2, 0, 0], ink: false }));
    }
    for (const [x, z, r, c] of [[-20, 12, 5, '#7ed6ff'], [18, 14, 6, '#b18cff'], [-28, -4, 4, '#ffe066'], [26, -2, 5, '#ff5fa2']]) cc.add(P(G('sphere', r, 16, 12), c, [x, r * 0.4, z], { scale: [1, 0.9, 1] }));
    g.add(cc);
    /* a broken highway from before the Mushroom War, grown over */
    const hw = new THREE.Group();
    hw.position.set(-90, 0, 0);
    hw.rotation.y = 1.05;
    for (const x of [-14, 0, 13]) hw.add(P(G('box', 2.2, 9, 2.2), '#a9a9ae', [x, 4.5, 0]));
    hw.add(P(G('box', 16, 1.4, 6), '#9a9aa0', [-7, 9.6, 0]));
    const broken = P(G('box', 10, 1.4, 6), '#9a9aa0', [10, 8.2, 0]);
    broken.rotation.z = -0.28;
    hw.add(broken);
    hw.add(P(G('box', 16.2, 0.3, 0.3), '#ffe066', [-7, 10.35, 0], { ink: false }));
    for (const [x, y] of [[-12, 10.6], [-3, 10.7], [6, 9.6]]) hw.add(P(G('sphere', 1.6, 12, 10), '#5fbf4a', [x, y, 2.4], { scale: [1.3, 0.8, 1] }));
    /* an old car, half sunk into the grass under the broken end */
    const car = new THREE.Group();
    car.position.set(9, 0.5, 4.5);
    car.rotation.set(0.12, 0.7, 0.18);
    car.add(P(G('box', 4.4, 1.5, 2.2), '#c2413a', [0, 0, 0]));
    car.add(P(G('box', 2.4, 1.0, 2.0), '#9a2a24', [-0.3, 1.2, 0]));
    for (const x of [-1.4, 1.4]) car.add(P(G('cyl', 0.5, 0.5, 2.3, 12), '#2e2e36', [x, -0.6, 0], { rot: [Math.PI / 2, 0, 0] }));
    car.add(P(G('sphere', 1.1, 12, 8), '#5fbf4a', [-1.6, 1.4, 0.4], { scale: [1.2, 0.5, 1] }));
    hw.add(car);
    g.add(hw);
    /* a far ring of green hills */
    for (let i = 0; i < 9; i++) {
      const a = -0.4 - i * 0.28, rr = 130;
      g.add(P(G('sphere', 26 + (i % 3) * 8, 18, 12), i % 2 ? '#5fae45' : '#4f9e37', [Math.sin(a) * rr, -8, -Math.cos(a) * rr * 0.9], { ink: false, scale: [1.3, 0.55, 1] }));
    }
    return g;
  };
  /* The way home that opens in a boss room off the train: a swirling rainbow-ish ring. */
  MD.portal = function (color) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    spin.position.y = 1.7;
    spin.add(P(G('torus', 1.35, 0.16, 28), color || '#b88cff', [0, 0, 0], { emissive: color || '#b88cff', ei: 0.6 }));
    spin.add(P(G('circle', 1.22, 32), '#fff7d6', [0, 0, 0], { basic: true, opacity: 0.75, ink: false }));
    spin.add(P(G('circle', 1.22, 32), '#fff7d6', [0, 0, 0], { basic: true, opacity: 0.75, ink: false, rot: [0, Math.PI, 0] }));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spin.add(P(G('star4', 0.18), ['#ff5f6d', '#ffc93c', '#6bd66b', '#6ab7ff', '#c77dff', '#ffffff'][i], [Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.02], { basic: true })); }
    g.add(spin);
    g.add(P(G('circle', 1.6, 28), color || '#b88cff', [0, 0.04, 0], { rot: [-Math.PI / 2, 0, 0], basic: true, opacity: 0.35, ink: false }));
    g.add(GF.beam(color || '#b88cff', 5));
    g.userData.spin = spin;
    return g;
  };
  /* Wizard City's magic barrier: a see-through wall of light across a doorway. */
  MD.barrier = function (width, height, color) {
    const g = new THREE.Group();
    const c = color || '#b88cff';
    g.add(P(G('box', 0.06, height, width), c, [0, height / 2, 0], { basic: true, opacity: 0.32, ink: false }));
    for (let i = 0; i <= 4; i++) g.add(P(G('box', 0.08, height, 0.06), c, [0, height / 2, -width / 2 + (i * width) / 4], { basic: true, opacity: 0.8, ink: false }));
    g.add(P(G('box', 0.1, 0.08, width), '#ffffff', [0, 0.5, 0], { basic: true, opacity: 0.7, ink: false }));
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
    lock.add(P(G('torus', 0.07, 0.025, 12, Math.PI), '#8a8f9a', [0, 0.48, 0.36], { ink: false }));
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
  /* Finn and Jake's Tree Fort, like the show's: a huge old tree with rooms built into it. A fat trunk with
     an arched front door and windows cut into it, a plank cabin with a red roof up in the branches, a deck
     with a railing and a ladder up to it, a tire swing, a big puffy crown of leaves, and their boat (with
     its beach umbrella) wedged in the very top as a lookout. The front faces +z. */
  MD.treeFort = function () {
    const g = new THREE.Group();
    const barkTex = GF.barkTexture();
    barkTex.repeat.set(5, 2);
    const bark = GF.texMat(barkTex);
    const limbTex = GF.barkTexture();
    limbTex.repeat.set(2, 1);
    const limbMat = GF.texMat(limbTex);
    const plank = GF.texMat(GF.plankTexture('#d3a46a'));
    const deckWood = GF.texMat(GF.plankTexture('#b98a55'));
    const WOOD = '#8a5a2b', DARKWOOD = '#5a3a1e', ROOF = '#c2413a', LEAF = '#4fb84a', LEAF2 = '#43a63f', LEAF3 = '#7ad35a';
    /* the ground, a few far hills */
    g.add(P(G('cyl', 170, 170, 1, 48), '#4f9e37', [0, -0.5, 0], { ink: false }));
    for (const [x, z, r] of [[-30, -34, 16], [12, -44, 20], [38, -30, 14]]) g.add(P(G('sphere', r, 24, 14), '#3f8a30', [x, -r * 0.55, z], { ink: false }));
    /* the trunk: flared at the roots, thick all the way up, swelling where it splits into branches */
    const prof = [[3.3, 0], [2.8, 0.35], [2.45, 1.2], [2.2, 3], [2.05, 5.5], [2.1, 7.5], [2.35, 8.8], [2.7, 9.6], [2.2, 10.3], [0.05, 10.6]];
    const trunkR = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0); } return 0.05; };
    g.add(P(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28), null, [0, 0, 0], { mat: bark, inkW: 0.07 }));
    /* roots spreading into the grass */
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.35;
      if (Math.abs(Math.sin(a / 2)) < 0.16) continue;
      g.add(P(G('sphere', 1, 14, 10), null, [Math.sin(a) * 2.9, 0.05, Math.cos(a) * 2.9], { mat: limbMat, scale: [0.55, 0.42, 1.5], rot: [0, a, 0], inkT: 0.05 }));
    }
    /* a thick branch from a to b */
    const limb = (a, b, r0, r1) => {
      const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const m = P(G('cyl', r1, r0, dir.length(), 14), null, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { mat: limbMat, inkW: 0.05 });
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      g.add(m);
      g.add(P(G('sphere', r1, 12, 10), null, b, { mat: limbMat, inkT: 0.05 }));
    };
    limb([-0.9, 9.4, 0.3], [-5.0, 11.4, 1.0], 1.0, 0.6);
    limb([1.0, 9.6, 0.0], [4.6, 13.0, -0.8], 0.95, 0.55);
    limb([0.0, 10.0, -0.5], [0.3, 15.5, -1.4], 1.0, 0.55);
    limb([1.4, 8.6, 0.9], [4.8, 9.2, 2.6], 0.55, 0.32);
    limb([0.2, 15.0, -1.3], [0.5, 20.9, -0.9], 0.45, 0.28);
    /* something set into the trunk's surface at angle a (0 = the front), height y */
    const onTrunk = (a, y, out) => { const r = trunkR(y) + (out || 0); const grp = new THREE.Group(); grp.position.set(Math.sin(a) * r, y, Math.cos(a) * r); grp.rotation.y = a; g.add(grp); return grp; };
    /* the front door: an arched wooden door in a dark frame, with a step and a lamp */
    const door = onTrunk(0, 0, 0);
    door.position.set(0, 0, 2.3);
    door.add(P(G('box', 1.62, 2.1, 0.34), DARKWOOD, [0, 1.05, 0]));
    door.add(P(G('wedge', 0.81, 0, Math.PI), DARKWOOD, [0, 2.1, 0.171], { ink: false }));
    door.add(P(G('box', 1.3, 2.1, 0.34), WOOD, [0, 1.05, 0.03]));
    door.add(P(G('wedge', 0.65, 0, Math.PI), WOOD, [0, 2.1, 0.202], { ink: false }));
    for (const x of [-0.33, 0, 0.33]) door.add(P(G('box', 0.03, 2.5, 0.01), DARKWOOD, [x, 1.3, 0.205], { ink: false }));
    door.add(P(G('sphere', 0.07, 10, 8), '#ffcf3d', [0.45, 1.05, 0.24], { ink: false }));
    door.add(P(G('box', 2.0, 0.16, 0.9), '#9aa0a8', [0, 0.08, 0.75]));
    /* a lantern hanging from an iron arm beside the door */
    const lamp = onTrunk(-0.62, 2.6, 0);
    lamp.add(P(G('box', 0.07, 0.07, 0.62), '#3a3f4b', [0, 0.1, 0.3]));
    lamp.add(P(G('box', 0.025, 0.2, 0.025), '#3a3f4b', [0, 0, 0.58], { ink: false }));
    lamp.add(P(G('cone', 0.16, 0.14, 6), '#3a3f4b', [0, -0.13, 0.58]));
    lamp.add(P(G('cyl', 0.1, 0.12, 0.26, 6), '#ffe9a8', [0, -0.33, 0.58], { emissive: '#ffd36b', ei: 0.9 }));
    lamp.add(P(G('cyl', 0.13, 0.13, 0.04, 6), '#3a3f4b', [0, -0.47, 0.58], { ink: false }));
    /* windows cut into the trunk */
    const round = onTrunk(-0.5, 4.4, 0.02);
    round.add(P(G('torus', 0.48, 0.1, 22), DARKWOOD, [0, 0, 0]));
    round.add(P(G('circle', 0.44, 22), '#9fe0ff', [0, 0, -0.02], { emissive: '#dff7ff', ei: 0.35 }));
    round.add(P(G('box', 0.05, 0.86, 0.04), DARKWOOD, [0, 0, 0], { ink: false }));
    round.add(P(G('box', 0.86, 0.05, 0.04), DARKWOOD, [0, 0, 0], { ink: false }));
    for (const [a, y] of [[0.55, 7.2], [-1.35, 7.6]]) {
      const w = onTrunk(a, y, 0.03);
      w.add(P(G('box', 1.15, 1.25, 0.2), DARKWOOD, [0, 0, 0]));
      w.add(P(G('box', 0.9, 1.0, 0.2), '#ffe9a8', [0, 0, 0.03], { emissive: '#ffd36b', ei: 0.55 }));
      w.add(P(G('box', 0.06, 1.0, 0.22), DARKWOOD, [0, 0, 0.04], { ink: false }));
      w.add(P(G('box', 0.9, 0.06, 0.22), DARKWOOD, [0, 0.02, 0.04], { ink: false }));
      w.add(P(G('box', 1.35, 0.12, 0.3), WOOD, [0, -0.66, 0.08]));
    }
    /* a deck around the front of the trunk, with a railing and a ladder up to it */
    const DY = 5.4, DR = 3.7;
    const deck = P(G('cyl', DR, DR, 0.24, 30, Math.PI * 1.15), null, [0, DY, 0], { mat: deckWood, rot: [0, -Math.PI * 0.6, 0], inkT: 0.02 });
    g.add(deck);
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI * 0.6 + (i / 8) * Math.PI * 1.15;
      if (i === 6) continue;
      g.add(P(G('box', 0.14, 0.95, 0.14), WOOD, [Math.sin(a) * (DR - 0.12), DY + 0.55, Math.cos(a) * (DR - 0.12)]));
    }
    const rail = P(G('torus', DR - 0.12, 0.07, 30, Math.PI * 1.15), WOOD, [0, DY + 1.0, 0], { rot: [Math.PI / 2, 0, -Math.PI * 0.05], inkT: 0.02 });
    g.add(rail);
    for (let i = 0; i < 12; i++) { const a = -Math.PI * 0.6 + (i / 11) * Math.PI * 1.15; g.add(P(G('box', 0.08, 0.2, 0.3), DARKWOOD, [Math.sin(a) * (DR - 0.5), DY - 0.2, Math.cos(a) * (DR - 0.5)], { rot: [0, a, 0], ink: false })); }
    const la = -Math.PI * 0.6 + (6 / 8) * Math.PI * 1.15;
    const ladder = new THREE.Group();
    ladder.position.set(Math.sin(la) * (DR + 0.25), 0, Math.cos(la) * (DR + 0.25));
    ladder.rotation.y = la;
    for (const s of [-1, 1]) ladder.add(P(G('box', 0.12, DY + 1.1, 0.12), WOOD, [0.38 * s, (DY + 1.1) / 2, 0]));
    for (let i = 0; i < 12; i++) ladder.add(P(G('box', 0.8, 0.08, 0.1), WOOD, [0, 0.35 + i * 0.47, 0], { ink: false }));
    ladder.rotation.x = -0.12;
    g.add(ladder);
    /* the cabin up in the branches: plank walls, a red roof, a glowing window, a little porch */
    const cab = new THREE.Group();
    cab.position.set(-5.2, 10.2, 1.4);
    cab.rotation.y = 0.45;
    cab.add(P(G('box', 3.8, 0.28, 3.4), null, [0, -1.25, 0], { mat: deckWood }));
    cab.add(P(G('box', 3.0, 2.3, 2.6), null, [0, 0, 0], { mat: plank }));
    const roof = P(G('cone', 2.75, 1.7, 4), ROOF, [0, 2.0, 0], { rot: [0, Math.PI / 4, 0], scale: [1.05, 1, 0.93] });
    cab.add(roof);
    cab.add(P(G('box', 0.5, 0.9, 0.5), '#9aa0a8', [0.8, 2.4, -0.4]));
    cab.add(P(G('box', 1.0, 0.9, 0.12), DARKWOOD, [-0.55, 0.2, 1.32]));
    cab.add(P(G('box', 0.8, 0.7, 0.12), '#ffe9a8', [-0.55, 0.2, 1.36], { emissive: '#ffd36b', ei: 0.55 }));
    cab.add(P(G('box', 0.05, 0.7, 0.14), DARKWOOD, [-0.55, 0.2, 1.4], { ink: false }));
    cab.add(P(G('box', 0.7, 1.5, 0.12), DARKWOOD, [0.75, -0.35, 1.32]));
    for (const x of [-1.7, 1.7]) cab.add(P(G('box', 0.14, 2.2, 0.14), DARKWOOD, [x, -2.3, 0.9], { rot: [0.35, 0, x > 0 ? 0.35 : -0.35] }));
    g.add(cab);
    /* a tire swing on the low branch */
    g.add(P(G('cyl', 0.035, 0.035, 5.0, 6), '#d9c9a0', [4.7, 6.7, 2.6], { ink: false }));
    g.add(P(G('torus', 0.5, 0.2, 18), '#2e2e36', [4.7, 4.0, 2.6], { rot: [0, 0.35, 0] }));
    /* the crown: big puffy clumps of leaves, lighter bumps on top */
    const crown = [[0, 15.6, -0.8, 4.3], [-3.8, 14.4, 0.2, 3.3], [3.8, 14.6, -0.6, 3.4], [-1.6, 17.8, -1.6, 3.0], [2.2, 17.4, -2.0, 2.9],
      [-5.9, 13.2, -1.8, 2.5], [6.0, 12.9, -1.6, 2.4], [0.8, 13.0, 2.2, 2.7], [-2.2, 12.6, 3.0, 2.0], [3.4, 12.3, 2.6, 2.0], [-4.6, 16.4, -2.6, 2.3], [4.6, 16.2, -2.8, 2.3]];
    crown.forEach(([x, y, z, r], i) => g.add(P(G('sphere', r, 22, 16), i % 2 ? LEAF2 : LEAF, [x, y, z], { inkT: 0.03 })));
    for (const [x, y, z, r] of [[0.8, 18.6, 1.2, 1.5], [-3.2, 16.4, 1.8, 1.2], [3.6, 16.8, 1.2, 1.3], [-0.6, 15.8, 3.4, 1.4], [4.2, 13.6, 2.2, 1.1]]) g.add(P(G('sphere', r, 16, 12), LEAF3, [x, y, z], { inkT: 0.04 }));
    /* the boat lookout at the very top, with a beach umbrella */
    const boat = new THREE.Group();
    boat.position.set(0.5, 21.3, -0.8);
    boat.rotation.set(0.05, 0.5, -0.06);
    boat.scale.setScalar(1.25);
    boat.add(P(G('cap', 1, Math.PI / 2), '#b5533c', [0, 0, 0], { rot: [Math.PI, 0, 0], scale: [1.8, 0.62, 0.8] }));
    boat.add(P(G('torus', 1, 0.07, 32), '#f4e3c0', [0, 0.02, 0], { rot: [Math.PI / 2, 0, 0], scale: [1.8, 0.8, 1] }));
    boat.add(P(G('circle', 0.95, 24), '#8a5a2b', [0, -0.14, 0], { rot: [-Math.PI / 2, 0, 0], scale: [1.75, 0.75, 1], ink: false }));
    boat.add(P(G('box', 0.08, 0.5, 1.2), '#f4e3c0', [0.5, -0.1, 0], { ink: false }));
    boat.add(P(G('cyl', 0.04, 0.04, 2.2, 6), '#f4f4f4', [-0.3, 1.0, 0], { ink: false, rot: [0, 0, 0.12] }));
    boat.add(P(G('cone', 1.25, 0.55, 10), '#e0423a', [-0.44, 2.2, 0], { rot: [0, 0, 0.12] }));
    boat.add(P(G('cone', 0.45, 0.2, 10), '#ffffff', [-0.47, 2.44, 0], { rot: [0, 0, 0.12], ink: false }));
    boat.add(P(G('torus', 1.22, 0.05, 20), '#ffffff', [-0.41, 1.95, 0], { rot: [Math.PI / 2, 0.12, 0], ink: false }));
    boat.add(P(G('cyl', 0.07, 0.1, 0.8, 8), '#ffcf3d', [0.9, 0.5, 0.2], { rot: [0, 0, -0.9] }));
    g.add(boat);
    /* a path of flat stepping stones from the front door out across the grass */
    for (let i = 0; i < 9; i++) {
      const z = 3.9 + i * 1.25, x = Math.sin(i * 0.7) * 0.5 + i * 0.12;
      g.add(P(G('cyl', 0.5 - (i % 2) * 0.08, 0.5 - (i % 2) * 0.08, 0.06, 12), '#d9c9a0', [x, 0.02, z], { scale: [1.2, 1, 0.8], rot: [0, i * 0.9, 0], ink: false }));
    }
    /* flowers and rocks around the roots */
    for (const [x, z, c] of [[-3.6, 3.2, '#ff8fc7'], [3.9, 3.0, '#ffe066'], [-4.8, 1.2, '#ffffff'], [5.2, 1.6, '#ff8fc7'], [-2.2, 4.6, '#ffe066'], [2.6, 4.9, '#ffffff']]) {
      g.add(P(G('cyl', 0.02, 0.02, 0.3, 4), '#3f8a30', [x, 0.15, z], { ink: false }));
      g.add(P(G('sphere', 0.12, 8, 6), c, [x, 0.34, z], { inkT: 0.2 }));
    }
    for (const [x, z, r] of [[-5.4, 3.4, 0.5], [5.8, 3.8, 0.4], [-6.2, -1, 0.7]]) g.add(P(G('dodeca', r), '#a3a8b0', [x, r * 0.4, z], { scale: [1, 0.7, 1] }));
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
