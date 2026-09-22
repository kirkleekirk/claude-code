/* Character, enemy, and prop models built from primitives. Origin at the feet, facing +z. */
(function () {
  'use strict';
  const GF = AE.game.gfx;
  const R = AE.R;
  const MD = {};
  const G = (...a) => GF.geo(...a);
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, o);
  const INK = '#1d2340', WHITE = '#ffffff';
  const eye = (grp, x, y, z, r) => { grp.add(P(G('sphere', r || 0.05, 10, 8), INK, [x, y, z], { ink: false })); };

  /* ---------- Finn ---------- */
  MD.finn = function () {
    const g = new THREE.Group();
    const p = {};
    const SK = '#ffd9c2', SHIRT = '#56c3f5', SHORTS = '#2457b8', PACK = '#3fae4a';
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.13 * s, 0.42, 0);
      leg.add(P(G('cyl', 0.075, 0.075, 0.26, 10), SK, [0, -0.13, 0]));
      leg.add(P(G('cyl', 0.082, 0.082, 0.14, 10), WHITE, [0, -0.29, 0]));
      leg.add(P(G('box', 0.17, 0.1, 0.28), INK, [0, -0.37, 0.05]));
      g.add(leg);
      p[s < 0 ? 'legL' : 'legR'] = leg;
    }
    g.add(P(G('cyl', 0.27, 0.29, 0.2, 16), SHORTS, [0, 0.47, 0]));
    g.add(P(G('cyl', 0.24, 0.28, 0.42, 16), SHIRT, [0, 0.77, 0]));
    g.add(P(G('box', 0.44, 0.46, 0.2), PACK, [0, 0.8, -0.3]));
    g.add(P(G('box', 0.3, 0.12, 0.06), '#2f8f3a', [0, 0.72, -0.42], { ink: false }));
    for (const s of [-1, 1]) {
      const swing = new THREE.Group();
      swing.position.set(0.32 * s, 0.93, 0);
      const arm = new THREE.Group();
      arm.add(P(G('cyl', 0.065, 0.058, 0.38, 8), SK, [0, -0.19, 0]));
      arm.add(P(G('sphere', 0.085, 10, 8), SK, [0, -0.4, 0]));
      swing.add(arm);
      g.add(swing);
      p[s < 0 ? 'swingL' : 'swingR'] = swing;
      p[s < 0 ? 'armL' : 'armR'] = arm;
    }
    const sword = new THREE.Group();
    sword.position.set(0, -0.4, 0);
    sword.add(P(G('box', 0.07, 0.14, 0.07), '#8a5a2b', [0, 0, 0]));
    sword.add(P(G('box', 0.28, 0.05, 0.09), '#e8a91c', [0, -0.09, 0]));
    const blade = P(G('box', 0.07, 0.82, 0.14), '#ffd84a', [0, -0.52, 0]);
    sword.add(blade);
    sword.rotation.x = -1.25;
    p.armR.add(sword);
    p.sword = sword;
    p.blade = blade;
    const head = new THREE.Group();
    head.position.set(0, 1.34, 0);
    head.add(P(G('sphere', 0.45, 22, 18), WHITE, [0, 0, 0]));
    head.add(P(G('sphere', 0.36, 22, 18), SK, [0, -0.05, 0.19], { scale: [1, 0.86, 0.66], ink: false }));
    eye(head, -0.12, 0.0, 0.42, 0.048);
    eye(head, 0.12, 0.0, 0.42, 0.048);
    head.add(P(G('torus', 0.06, 0.014, 12, Math.PI), INK, [0, -0.13, 0.41], { rot: [0, 0, Math.PI], ink: false }));
    for (const s of [-1, 1]) head.add(P(G('sphere', 0.12, 12, 10), WHITE, [0.26 * s, 0.36, -0.02]));
    g.add(head);
    p.head = head;
    g.add(GF.blob(0.55));
    g.userData.parts = p;
    return g;
  };

  /* ---------- Jake ---------- */
  MD.jake = function () {
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
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(0.6 * s, 0.86, 0);
      const seg = P(G('cyl', 0.065, 0.065, 1, 8), OR, [0, -0.22, 0], { scale: [1, 0.44, 1] });
      const fist = P(G('sphere', 0.15, 12, 10), OR, [0, -0.46, 0]);
      arm.add(seg, fist);
      arm.rotation.z = 0.15 * s;
      body.add(arm);
      p[s < 0 ? 'armL' : 'armR'] = { group: arm, seg, fist, len: 0.44 };
    }
    g.add(GF.blob(0.7));
    g.userData.parts = p;
    return g;
  };
  /* Stretch one of Jake's arms to length L (world units) along its local -y. */
  MD.stretchArm = function (arm, L) {
    arm.seg.scale.y = L;
    arm.seg.position.y = -L / 2;
    arm.fist.position.y = -L - 0.02;
    arm.len = L;
  };

  /* ---------- enemies ---------- */
  const PASTELS = ['#ffb3d1', '#b8f0d8', '#d8c4ff', '#ffd6a8', '#bfe6ff'];
  MD.enemy = function (def) {
    const g = new THREE.Group();
    const p = {};
    const body = new THREE.Group();
    g.add(body);
    p.body = body;
    const c = def.color;
    switch (def.model) {
      case 'penguin': {
        const bc = def.tint || '#26283a';
        body.add(P(G('sphere', 0.42, 18, 14), bc, [0, 0.52, 0], { scale: [1, 1.25, 1] }));
        body.add(P(G('sphere', 0.34, 18, 14), WHITE, [0, 0.47, 0.17], { scale: [0.9, 1.1, 0.55], ink: false }));
        body.add(P(G('sphere', 0.08, 10, 8), WHITE, [-0.12, 0.84, 0.34], { ink: false }));
        body.add(P(G('sphere', 0.08, 10, 8), WHITE, [0.12, 0.84, 0.34], { ink: false }));
        eye(body, -0.12, 0.84, 0.41, 0.04); eye(body, 0.12, 0.84, 0.41, 0.04);
        body.add(P(G('cone', 0.09, 0.24, 10), '#ff9d2e', [0, 0.72, 0.46], { rot: [Math.PI / 2, 0, 0] }));
        for (const s of [-1, 1]) {
          body.add(P(G('sphere', 0.11, 10, 8), '#ff9d2e', [0.16 * s, 0.04, 0.12], { scale: [1, 0.35, 1.4] }));
          body.add(P(G('sphere', 0.14, 10, 8), bc, [0.42 * s, 0.5, 0], { scale: [0.3, 1, 0.6], rot: [0, 0, 0.3 * s] }));
        }
        if (def.arch === 'bomber') { body.add(P(G('sphere', 0.2, 12, 10), INK, [0, 1.12, 0])); body.add(P(G('cone', 0.05, 0.16, 6), '#ffcf3d', [0, 1.36, 0], { basic: true })); }
        break;
      }
      case 'slime': {
        body.add(P(G('sphere', 0.55, 20, 16), c || '#7ed957', [0, 0.42, 0], { scale: [1, 0.78, 1], opacity: 0.88 }));
        body.add(P(G('sphere', 0.09, 10, 8), WHITE, [-0.16, 0.55, 0.42], { ink: false })); body.add(P(G('sphere', 0.09, 10, 8), WHITE, [0.16, 0.55, 0.42], { ink: false }));
        eye(body, -0.16, 0.55, 0.5, 0.045); eye(body, 0.16, 0.55, 0.5, 0.045);
        break;
      }
      case 'gnome': {
        body.add(P(G('cone', 0.34, 0.72, 14), '#3a5fcf', [0, 0.36, 0]));
        body.add(P(G('sphere', 0.22, 14, 12), '#ffd4b8', [0, 0.82, 0]));
        body.add(P(G('cone', 0.2, 0.36, 10), WHITE, [0, 0.64, 0.12], { rot: [Math.PI, 0, 0] }));
        body.add(P(G('sphere', 0.07, 8, 6), '#ff9a8a', [0, 0.8, 0.22]));
        eye(body, -0.08, 0.88, 0.19, 0.03); eye(body, 0.08, 0.88, 0.19, 0.03);
        body.add(P(G('cone', 0.24, 0.62, 12), '#e0423a', [0, 1.26, -0.02], { rot: [-0.2, 0, 0] }));
        break;
      }
      case 'zombie': {
        const col = R.pick(PASTELS);
        body.add(P(G('box', 0.5, 0.6, 0.34), col, [0, 0.72, 0]));
        body.add(P(G('sphere', 0.3, 16, 12), col, [0, 1.22, 0]));
        body.add(P(G('sphere', 0.08, 8, 6), WHITE, [-0.1, 1.26, 0.25], { ink: false })); body.add(P(G('sphere', 0.05, 8, 6), WHITE, [0.12, 1.22, 0.26], { ink: false }));
        eye(body, -0.1, 1.26, 0.31, 0.035); eye(body, 0.12, 1.22, 0.3, 0.025);
        body.add(P(G('box', 0.16, 0.04, 0.04), INK, [0, 1.1, 0.28], { ink: false }));
        for (const s of [-1, 1]) {
          body.add(P(G('cyl', 0.07, 0.07, 0.5, 8), col, [0.3 * s, 0.95, 0.25], { rot: [Math.PI / 2, 0, 0] }));
          body.add(P(G('cyl', 0.09, 0.09, 0.44, 8), col, [0.14 * s, 0.22, 0]));
        }
        body.add(P(G('sphere', 0.07, 8, 6), '#ff5fa2', [0.15, 0.85, 0.18], { ink: false }));
        break;
      }
      case 'bean': {
        const col = R.pick(['#ff5f6d', '#ffc93c', '#6bd66b', '#6ab7ff', '#c77dff']);
        body.add(P(G('sphere', 0.34, 18, 14), col, [0, 0.46, 0], { scale: [0.82, 1.2, 0.82] }));
        body.add(P(G('sphere', 0.07, 8, 6), WHITE, [-0.1, 0.6, 0.25], { ink: false })); body.add(P(G('sphere', 0.07, 8, 6), WHITE, [0.1, 0.6, 0.25], { ink: false }));
        eye(body, -0.1, 0.6, 0.31, 0.035); eye(body, 0.1, 0.6, 0.31, 0.035);
        break;
      }
      case 'wolf': {
        body.add(P(G('box', 0.5, 0.44, 1.0), c, [0, 0.62, 0]));
        body.add(P(G('box', 0.4, 0.36, 0.4), c, [0, 0.82, 0.58]));
        body.add(P(G('box', 0.22, 0.18, 0.26), c, [0, 0.74, 0.86]));
        body.add(P(G('sphere', 0.05, 8, 6), INK, [0, 0.8, 1.0], { ink: false }));
        eye(body, -0.1, 0.9, 0.79, 0.04); eye(body, 0.1, 0.9, 0.79, 0.04);
        for (const s of [-1, 1]) body.add(P(G('cone', 0.08, 0.2, 6), c, [0.13 * s, 1.07, 0.52]));
        for (const [x, z] of [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]]) body.add(P(G('cyl', 0.07, 0.07, 0.42, 8), c, [x, 0.21, z]));
        body.add(P(G('cone', 0.08, 0.5, 8), c, [0, 0.75, -0.66], { rot: [-2.3, 0, 0] }));
        const flame = def.burn ? '#ffd23f' : '#e8fbff';
        for (let i = 0; i < 3; i++) body.add(P(G('cone', 0.09, 0.3, 6), flame, [0, 0.95, 0.25 - i * 0.28], { basic: true, opacity: 0.9 }));
        break;
      }
      case 'flameguy': {
        body.add(P(G('cone', 0.38, 0.9, 14), '#ff7a2e', [0, 0.45, 0], { emissive: '#ff4d00', ei: 0.4 }));
        body.add(P(G('sphere', 0.26, 14, 12), '#ffd23f', [0, 1.05, 0], { emissive: '#ffae00', ei: 0.4 }));
        eye(body, -0.08, 1.08, 0.23, 0.035); eye(body, 0.08, 1.08, 0.23, 0.035);
        for (let i = 0; i < 3; i++) body.add(P(G('cone', 0.1, 0.34, 6), '#ffae00', [(i - 1) * 0.12, 1.36, 0], { basic: true }));
        break;
      }
      case 'snowman': {
        body.add(P(G('sphere', 0.52, 18, 14), WHITE, [0, 0.5, 0]));
        body.add(P(G('sphere', 0.4, 18, 14), WHITE, [0, 1.22, 0]));
        body.add(P(G('sphere', 0.3, 18, 14), WHITE, [0, 1.8, 0]));
        eye(body, -0.1, 1.86, 0.27, 0.045); eye(body, 0.1, 1.86, 0.27, 0.045);
        body.add(P(G('cone', 0.06, 0.34, 8), '#ff8a2a', [0, 1.78, 0.4], { rot: [Math.PI / 2, 0, 0] }));
        for (const y of [1.3, 1.1]) eye(body, 0, y, 0.39, 0.05);
        for (const s of [-1, 1]) body.add(P(G('cyl', 0.04, 0.04, 0.8, 6), '#6b4226', [0.6 * s, 1.35, 0], { rot: [0, 0, 1.1 * s] }));
        body.add(P(G('cyl', 0.2, 0.2, 0.32, 12), INK, [0, 2.16, 0]));
        body.add(P(G('cyl', 0.3, 0.3, 0.04, 14), INK, [0, 2.0, 0]));
        break;
      }
      case 'imp': {
        body.add(P(G('sphere', 0.35, 16, 12), '#d8342c', [0, 0.55, 0]));
        body.add(P(G('sphere', 0.07, 8, 6), '#ffe14a', [-0.11, 0.66, 0.29], { basic: true })); body.add(P(G('sphere', 0.07, 8, 6), '#ffe14a', [0.11, 0.66, 0.29], { basic: true }));
        for (const s of [-1, 1]) {
          body.add(P(G('cone', 0.07, 0.22, 8), '#3a0d12', [0.16 * s, 0.94, 0], { rot: [0, 0, -0.35 * s] }));
          body.add(P(G('box', 0.5, 0.04, 0.3), '#6a1418', [0.46 * s, 0.7, -0.1], { rot: [0, 0, 0.5 * s] }));
        }
        body.add(P(G('cone', 0.04, 0.4, 6), '#3a0d12', [0, 0.35, -0.38], { rot: [-2, 0, 0] }));
        break;
      }
      case 'demon': {
        body.add(P(G('box', 1.0, 1.1, 0.7), '#8c1f2b', [0, 1.0, 0]));
        body.add(P(G('sphere', 0.36, 16, 12), '#a8283a', [0, 1.8, 0.05]));
        body.add(P(G('sphere', 0.07, 8, 6), '#ffe14a', [-0.13, 1.86, 0.33], { basic: true })); body.add(P(G('sphere', 0.07, 8, 6), '#ffe14a', [0.13, 1.86, 0.33], { basic: true }));
        for (const s of [-1, 1]) {
          body.add(P(G('cone', 0.1, 0.4, 8), '#2a0a0e', [0.25 * s, 2.2, 0], { rot: [0, 0, -0.4 * s] }));
          body.add(P(G('cyl', 0.16, 0.13, 0.9, 10), '#8c1f2b', [0.66 * s, 1.1, 0.1], { rot: [0.3, 0, 0.15 * s] }));
          body.add(P(G('cyl', 0.16, 0.16, 0.5, 10), '#5a121a', [0.26 * s, 0.25, 0]));
        }
        break;
      }
      case 'skeleton': {
        const B = '#f5f0e1';
        body.add(P(G('box', 0.4, 0.46, 0.22), B, [0, 0.98, 0]));
        body.add(P(G('cyl', 0.05, 0.05, 0.36, 6), B, [0, 0.62, 0]));
        body.add(P(G('sphere', 0.25, 14, 12), B, [0, 1.42, 0]));
        body.add(P(G('sphere', 0.07, 8, 6), INK, [-0.09, 1.44, 0.2], { ink: false })); body.add(P(G('sphere', 0.07, 8, 6), INK, [0.09, 1.44, 0.2], { ink: false }));
        for (const s of [-1, 1]) {
          body.add(P(G('cyl', 0.04, 0.04, 0.5, 6), B, [0.26 * s, 0.95, 0], { rot: [0, 0, 0.15 * s] }));
          body.add(P(G('cyl', 0.045, 0.045, 0.5, 6), B, [0.12 * s, 0.25, 0]));
        }
        if (def.arch === 'ranged') body.add(P(G('torus', 0.32, 0.03, 16, Math.PI), '#8a5a2b', [0.36, 0.95, 0.2], { rot: [0, Math.PI / 2, 0] }));
        else body.add(P(G('box', 0.06, 0.7, 0.1), '#b8c2cc', [0.34, 0.9, 0.3], { rot: [0.9, 0, 0] }));
        break;
      }
      case 'crystal': {
        body.add(P(G('octa', 0.72), '#a98bff', [0, 1.15, 0], { emissive: '#6b4bff', ei: 0.35, scale: [1, 1.35, 1] }));
        body.add(P(G('sphere', 0.08, 8, 6), '#ffffff', [-0.16, 1.3, 0.42], { basic: true })); body.add(P(G('sphere', 0.08, 8, 6), '#ffffff', [0.16, 1.3, 0.42], { basic: true }));
        const orbit = new THREE.Group();
        orbit.position.y = 1.15;
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; orbit.add(P(G('octa', 0.2), '#7fe3ff', [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0], { emissive: '#3fc6ff', ei: 0.4 })); }
        body.add(orbit);
        p.orbit = orbit;
        break;
      }
      case 'bat': {
        body.add(P(G('sphere', 0.26, 14, 12), '#8f7ae0', [0, 0, 0]));
        body.add(P(G('sphere', 0.05, 8, 6), '#ffffff', [-0.08, 0.05, 0.22], { basic: true })); body.add(P(G('sphere', 0.05, 8, 6), '#ffffff', [0.08, 0.05, 0.22], { basic: true }));
        for (const s of [-1, 1]) { const w = P(G('octa', 0.3), '#c3b3ff', [0.38 * s, 0.05, 0], { scale: [1.4, 0.2, 0.8] }); body.add(w); p[s < 0 ? 'wingL' : 'wingR'] = w; }
        body.position.y = 1.3;
        break;
      }
      case 'lemongrab': {
        body.add(P(G('box', 0.52, 0.9, 0.36), '#5d6370', [0, 0.88, 0]));
        for (const s of [-1, 1]) {
          body.add(P(G('cyl', 0.08, 0.08, 0.44, 8), '#3f434d', [0.14 * s, 0.22, 0]));
          body.add(P(G('cyl', 0.07, 0.07, 0.62, 8), '#5d6370', [0.34 * s, 0.9, 0], { rot: [0, 0, 0.12 * s] }));
          body.add(P(G('sphere', 0.08, 8, 6), '#fff176', [0.38 * s, 0.56, 0]));
        }
        body.add(P(G('sphere', 0.38, 20, 16), '#fff176', [0, 1.78, 0], { scale: [0.85, 1.35, 0.85] }));
        body.add(P(G('cone', 0.1, 0.24, 10), '#fff176', [0, 2.38, 0]));
        body.add(P(G('sphere', 0.05, 8, 6), INK, [-0.12, 1.9, 0.3], { ink: false })); body.add(P(G('sphere', 0.05, 8, 6), INK, [0.12, 1.9, 0.3], { ink: false }));
        body.add(P(G('box', 0.14, 0.03, 0.03), INK, [-0.12, 2.0, 0.3], { rot: [0, 0, -0.4], ink: false })); body.add(P(G('box', 0.14, 0.03, 0.03), INK, [0.12, 2.0, 0.3], { rot: [0, 0, 0.4], ink: false }));
        const mouth = P(G('box', 0.2, 0.08, 0.04), '#3a1a1a', [0, 1.66, 0.3], { ink: false });
        body.add(mouth);
        p.mouth = mouth;
        break;
      }
      case 'magicman': {
        body.add(P(G('cone', 0.5, 1.3, 16), '#2a3b8f', [0, 0.65, 0]));
        for (let i = 0; i < 5; i++) body.add(P(G('octa', 0.06), '#ffe14a', [Math.cos(i * 1.3) * 0.28, 0.45 + i * 0.15, 0.3 - i * 0.03], { basic: true }));
        body.add(P(G('sphere', 0.3, 16, 12), '#7fd18b', [0, 1.45, 0]));
        body.add(P(G('cone', 0.26, 0.6, 12), WHITE, [0, 1.12, 0.12], { rot: [Math.PI, 0, 0] }));
        eye(body, -0.1, 1.52, 0.27, 0.04); eye(body, 0.1, 1.52, 0.27, 0.04);
        body.add(P(G('cone', 0.3, 0.8, 12), '#6a3bb8', [0, 2.02, 0], { rot: [-0.15, 0, 0] }));
        break;
      }
      case 'iceking': {
        body.add(P(G('cone', 0.72, 1.6, 18), '#3b6fd6', [0, 0.8, 0]));
        body.add(P(G('sphere', 0.44, 20, 16), '#8fc9ff', [0, 1.86, 0]));
        body.add(P(G('cone', 0.46, 1.4, 16), WHITE, [0, 1.2, 0.2], { rot: [Math.PI, 0, 0] }));
        body.add(P(G('cone', 0.1, 0.5, 10), '#8fc9ff', [0, 1.84, 0.62], { rot: [Math.PI / 2, 0, 0] }));
        body.add(P(G('sphere', 0.07, 8, 6), WHITE, [-0.15, 1.98, 0.36], { ink: false })); body.add(P(G('sphere', 0.07, 8, 6), WHITE, [0.15, 1.98, 0.36], { ink: false }));
        eye(body, -0.15, 1.98, 0.42, 0.035); eye(body, 0.15, 1.98, 0.42, 0.035);
        const crown = new THREE.Group();
        crown.position.y = 2.28;
        crown.add(P(G('cyl', 0.3, 0.33, 0.2, 16), '#ffcf3d', [0, 0, 0]));
        for (let i = -1; i <= 1; i++) {
          crown.add(P(G('cone', 0.08, 0.32, 8), '#ffcf3d', [i * 0.18, 0.24, 0.16 - Math.abs(i) * 0.06]));
          crown.add(P(G('sphere', 0.06, 8, 6), '#e0283a', [i * 0.18, 0.05, 0.3 - Math.abs(i) * 0.05], { basic: true }));
        }
        body.add(crown);
        for (const s of [-1, 1]) {
          body.add(P(G('cyl', 0.13, 0.18, 0.7, 10), '#3b6fd6', [0.62 * s, 1.35, 0.1], { rot: [0.4, 0, 0.5 * s] }));
          body.add(P(G('sphere', 0.12, 10, 8), '#8fc9ff', [0.84 * s, 1.08, 0.3]));
        }
        g.scale.setScalar(1.35);
        break;
      }
      default:
        body.add(P(G('sphere', 0.4, 12, 10), '#999999', [0, 0.5, 0]));
    }
    if (def.elite) { const halo = P(G('torus', 0.55, 0.04, 24), '#ffcf3d', [0, 0.06, 0], { rot: [Math.PI / 2, 0, 0], basic: true }); g.add(halo); }
    g.add(GF.blob(def.r * 1.2));
    g.userData.parts = p;
    return g;
  };

  AE.game.models = MD;
})();

/* ---------- props, loot, princesses, the Tree Fort ---------- */
(function () {
  'use strict';
  const GF = AE.game.gfx;
  const R = AE.R;
  const D = AE.data;
  const MD = AE.game.models;
  const G = (...a) => GF.geo(...a);
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, o);
  const INK = '#1d2340', WHITE = '#ffffff';

  MD.prop = function (type, o) {
    o = o || {};
    const g = new THREE.Group();
    switch (type) {
      case 'seat': {
        const col = o.color || '#c2413a';
        g.add(P(G('box', 1.5, 0.45, 0.85), col, [0, 0.32, 0]));
        g.add(P(G('box', 1.5, 0.75, 0.2), col, [0, 0.85, -0.34]));
        g.add(P(G('box', 1.4, 0.12, 0.7), '#e8e0d0', [0, 0.58, 0.02], { ink: false }));
        break;
      }
      case 'table': {
        g.add(P(G('cyl', 0.62, 0.62, 0.1, 18), '#f4efe6', [0, 0.82, 0]));
        g.add(P(G('cyl', 0.07, 0.1, 0.8, 8), '#6b4226', [0, 0.4, 0]));
        for (let i = 0; i < 2; i++) g.add(P(G('cyl', 0.16, 0.16, 0.03, 12), '#ffffff', [(i - 0.5) * 0.5, 0.9, 0.1], { ink: false }));
        g.add(P(G('sphere', 0.08, 8, 6), R.pick(['#ff5f6d', '#ffc93c', '#6bd66b']), [0.25, 0.95, 0.12], { ink: false }));
        break;
      }
      case 'crate': {
        const s = o.size || 0.9;
        g.add(P(G('box', s, s, s), '#c98d4e', [0, s / 2, 0]));
        g.add(P(G('box', s * 1.02, s * 0.14, s * 1.02), '#9c6634', [0, s * 0.2, 0], { ink: false }));
        g.add(P(G('box', s * 1.02, s * 0.14, s * 1.02), '#9c6634', [0, s * 0.8, 0], { ink: false }));
        break;
      }
      case 'barrel': {
        g.add(P(G('cyl', 0.38, 0.42, 0.9, 14), '#a8653a', [0, 0.45, 0]));
        g.add(P(G('torus', 0.4, 0.035, 18), '#5a5f6a', [0, 0.25, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
        g.add(P(G('torus', 0.4, 0.035, 18), '#5a5f6a', [0, 0.68, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
        break;
      }
      case 'luggage': {
        const col = o.color || R.pick(['#e05a47', '#4d8fd8', '#f0b429', '#7a5ab8', '#3fae7a']);
        g.add(P(G('box', 0.85, 0.55, 0.45), col, [0, 0.28, 0]));
        g.add(P(G('torus', 0.12, 0.03, 10, Math.PI), INK, [0, 0.56, 0], { ink: false }));
        g.add(P(G('box', 0.86, 0.06, 0.46), '#f4efe6', [0, 0.28, 0], { ink: false }));
        break;
      }
      case 'bunk': {
        g.add(P(G('box', 2.2, 0.35, 1.1), '#7a5ab8', [0, 0.35, 0]));
        g.add(P(G('box', 2.2, 0.35, 1.1), '#7a5ab8', [0, 1.55, 0]));
        g.add(P(G('box', 2.0, 0.12, 0.9), '#f4efe6', [0, 0.58, 0], { ink: false }));
        g.add(P(G('box', 2.0, 0.12, 0.9), '#f4efe6', [0, 1.78, 0], { ink: false }));
        for (const x of [-1.05, 1.05]) g.add(P(G('box', 0.1, 2.0, 0.1), '#4a3470', [x, 1.0, 0.45]));
        break;
      }
      case 'sofa': {
        const col = o.color || '#3fae7a';
        g.add(P(G('box', 1.9, 0.45, 0.9), col, [0, 0.3, 0]));
        g.add(P(G('box', 1.9, 0.6, 0.25), col, [0, 0.75, -0.33]));
        for (const x of [-0.9, 0.9]) g.add(P(G('box', 0.2, 0.55, 0.9), col, [x, 0.45, 0]));
        break;
      }
      case 'boiler': {
        g.add(P(G('cyl', 1.3, 1.3, 3.2, 20), '#3a3f4b', [0, 1.4, 0], { rot: [0, 0, Math.PI / 2] }));
        g.add(P(G('cyl', 0.5, 0.5, 0.2, 16), '#ff7a2e', [1.65, 1.2, 0], { rot: [0, 0, Math.PI / 2], emissive: '#ff4d00', ei: 0.8 }));
        g.add(P(G('cyl', 0.3, 0.3, 1.2, 12), '#2a2e38', [-0.8, 2.9, 0]));
        break;
      }
      case 'lever': {
        g.add(P(G('box', 0.6, 0.4, 0.6), '#3a3f4b', [0, 0.2, 0]));
        const arm = new THREE.Group();
        arm.position.y = 0.4;
        arm.add(P(G('cyl', 0.05, 0.05, 1.1, 8), '#b8c2cc', [0, 0.55, 0]));
        arm.add(P(G('sphere', 0.13, 10, 8), '#e0283a', [0, 1.12, 0]));
        arm.rotation.x = -0.5;
        g.add(arm);
        g.userData.arm = arm;
        break;
      }
      case 'coal': { for (let i = 0; i < 6; i++) g.add(P(G('ico', 0.22 + Math.random() * 0.12), '#2a2a30', [(Math.random() - 0.5) * 1.2, 0.18, (Math.random() - 0.5) * 1.0], { ink: false })); break; }
      case 'gold_pile': { for (let i = 0; i < 9; i++) g.add(P(G('cyl', 0.14, 0.14, 0.05, 10), '#ffcf3d', [(Math.random() - 0.5) * 0.9, 0.05 + i * 0.03, (Math.random() - 0.5) * 0.7], { ink: false, emissive: '#ffae00', ei: 0.3 })); break; }
      default: g.add(P(G('box', 0.8, 0.8, 0.8), '#999999', [0, 0.4, 0]));
    }
    return g;
  };

  MD.chest = function (fancy) {
    const g = new THREE.Group();
    const body = fancy ? '#ffcf3d' : '#b0703a', trim = fancy ? '#e0283a' : '#6b4226';
    g.add(P(G('box', 1.0, 0.55, 0.65), body, [0, 0.28, 0]));
    g.add(P(G('box', 1.02, 0.1, 0.67), trim, [0, 0.5, 0], { ink: false }));
    const lid = new THREE.Group();
    lid.position.set(0, 0.56, -0.32);
    lid.add(P(G('cyl', 0.33, 0.33, 1.0, 16, Math.PI), body, [0, 0, 0.32], { rot: [0, 0, Math.PI / 2], scale: [1, 1, 1] }));
    g.add(lid);
    g.add(P(G('box', 0.16, 0.2, 0.06), '#ffe066', [0, 0.45, 0.34], { ink: false }));
    g.userData.lid = lid;
    return g;
  };

  MD.iceBlock = function (princess) {
    const g = new THREE.Group();
    g.add(MD.princess(princess));
    const ice = P(G('box', 1.5, 2.3, 1.5), '#bfeeff', [0, 1.15, 0], { opacity: 0.55, emissive: '#7fdcff', ei: 0.2, inkT: 0.02 });
    g.add(ice);
    g.userData.ice = ice;
    return g;
  };

  MD.princess = function (pr) {
    const g = new THREE.Group();
    const col = pr ? pr.color : '#ff8fc7';
    if (pr && pr.id === 'lsp') {
      for (const [x, y, z, r] of [[0, 0.8, 0, 0.45], [0.3, 1.05, 0.1, 0.3], [-0.3, 1.0, 0.05, 0.32], [0.1, 1.3, 0, 0.3], [-0.2, 0.55, 0.15, 0.3]]) g.add(P(G('sphere', r, 14, 12), col, [x, y, z]));
      g.add(P(G('octa', 0.12), '#ffcf3d', [0, 1.62, 0], { basic: true }));
    } else {
      g.add(P(G('cone', 0.42, 0.9, 16), col, [0, 0.45, 0]));
      g.add(P(G('sphere', 0.26, 16, 12), pr && pr.id === 'flame' ? '#ffd23f' : pr && pr.id === 'slime' ? '#7ed957' : '#ffd9c2', [0, 1.1, 0]));
      g.add(P(G('sphere', 0.3, 16, 12), pr && pr.id === 'bubblegum' ? '#ff5fa2' : col, [0, 1.2, -0.08], { scale: [1.05, 1, 0.9] }));
      g.add(P(G('sphere', 0.04, 8, 6), INK, [-0.08, 1.12, 0.24], { ink: false })); g.add(P(G('sphere', 0.04, 8, 6), INK, [0.08, 1.12, 0.24], { ink: false }));
      g.add(P(G('cyl', 0.12, 0.14, 0.12, 5), '#ffcf3d', [0, 1.5, 0], { emissive: '#ffae00', ei: 0.3 }));
    }
    g.add(GF.blob(0.5));
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

  MD.drop = function (item) {
    const g = new THREE.Group();
    const col = D.RARITIES[item.rarity].color;
    const shape = item.kind === 'consumable' ? G('sphere', 0.2, 12, 10) : item.kind === 'valuable' ? G('octa', 0.24) : G('box', 0.32, 0.32, 0.32);
    const m = P(shape, col, [0, 0.55, 0], { emissive: col, ei: 0.45 });
    g.add(m);
    if (item.rarity >= 1 || item.kind === 'valuable') g.add(GF.beam(col, 1.5 + item.rarity * 1.1));
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

  /* The hub diorama: Finn and Jake's tree house on a grassy hill. */
  MD.treeFort = function () {
    const g = new THREE.Group();
    g.add(P(G('cyl', 60, 60, 1, 40), '#8ee06a', [0, -0.5, 0], { ink: false }));
    for (const [x, z, r] of [[-26, -30, 16], [10, -38, 20], [34, -26, 14]]) g.add(P(G('sphere', r, 24, 14), '#6cc24a', [x, -r * 0.55, z], { ink: false }));
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
    bmo.add(P(G('torus', 0.05, 0.01, 8, Math.PI), INK, [0, 0.5, 0.18], { rot: [0, 0, Math.PI], ink: false }));
    for (const s of [-1, 1]) bmo.add(P(G('cyl', 0.03, 0.03, 0.3, 6), '#5ec7b5', [0.08 * s, 0.1, 0]));
    bmo.position.set(-2.6, 0, 3.8);
    bmo.rotation.y = 0.5;
    g.add(bmo);
    return g;
  };
})();
