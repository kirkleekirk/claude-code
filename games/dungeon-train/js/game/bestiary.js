/* Monsters and bosses, built from primitives the way the show draws them: round shapes, noodle limbs,
   dot eyes and thick ink lines. Every model hands actors.js its moving parts (legs, arms, wings, tail,
   jaw, flames, tentacles...) so it can walk, wind up, attack, flinch and pop. Origin at the feet, facing +z. */
(function () {
  'use strict';
  const GF = DT.game.gfx;
  const R = DT.R;
  const MD = DT.game.models;
  const G = (...a) => GF.geo(...a);
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, o);
  const INK = '#1d2340', WHITE = '#ffffff';
  const UP = window.THREE ? new THREE.Vector3(0, 1, 0) : null;

  const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };
  const tint = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };
  /* Radius of a G('drop', a, h, c) shape at height y above its bottom (to stick faces and buttons on it). */
  function dropR(a, h, c, y) {
    if (y <= a) return Math.sqrt(Math.max(0, a * a - (a - y) * (a - y)));
    const u = Math.min(1, (y - a) / (h - a));
    return a * Math.pow(1 - u, c || 1.3) * (1 + 0.22 * Math.sin(u * Math.PI));
  }
  /* A rubber-hose limb hanging from a pivot (rotate the pivot to swing it). end = [kind, size, color]. */
  function limb(parent, x, y, z, len, r, col, end) {
    const pv = grp(parent, x, y, z);
    pv.add(P(G('cyl', r, r * 0.85, len, 8), col, [0, -len / 2, 0]));
    if (end) {
      const [kind, es, ec] = end;
      if (kind === 'foot') pv.add(P(G('sphere', es, 10, 8), ec || col, [0, -len - es * 0.15, es * 0.45], { scale: [0.9, 0.55, 1.45] }));
      else if (kind === 'hand') pv.add(P(G('sphere', es, 10, 8), ec || col, [0, -len - es * 0.5, 0]));
      else if (kind === 'paw') pv.add(P(G('sphere', es, 10, 8), ec || col, [0, -len - es * 0.1, es * 0.3], { scale: [1, 0.6, 1.25] }));
      else if (kind === 'claw') {
        pv.add(P(G('sphere', es, 10, 8), ec || col, [0, -len - es * 0.4, 0]));
        for (const k of [-1, 0, 1]) pv.add(P(G('cone', es * 0.26, es * 1.1, 6), '#f4efe6', [k * es * 0.5, -len - es * 1.15, es * 0.35], { rot: [Math.PI + 0.35, 0, k * 0.25], ink: false }));
      } else if (kind === 'bird') {
        for (const k of [-1, 0, 1]) pv.add(P(G('cone', es * 0.22, es * 1.6, 5), ec || col, [k * es * 0.45, -len, es * 0.7], { rot: [Math.PI / 2, 0, -k * 0.35], ink: false }));
      }
    }
    return pv;
  }
  /* AT dot eyes: small black ovals. */
  const dots = (g, x, y, z, r) => { for (const s of [-1, 1]) g.add(P(G('sphere', r || 0.045, 10, 8), INK, [x * s, y, z], { ink: false, scale: [1, 1.3, 0.8] })); };
  /* Big white eyes with pupils (Jake and Gunter style). */
  function eyes(g, x, y, z, r, o) {
    o = o || {};
    for (const s of [-1, 1]) {
      g.add(P(G('sphere', r, 12, 10), o.white || WHITE, [x * s, y, z], { inkT: 0.12, scale: o.oval ? [1, o.oval, 1] : null }));
      g.add(P(G('sphere', r * (o.pupil || 0.5), 10, 8), o.iris || INK, [x * s + (o.look || 0) * s, y + (o.up || 0), z + r * 0.8], { ink: false, basic: !!o.glow, scale: o.slit ? [0.45, 1.6, 1] : null }));
    }
  }
  const brows = (g, x, y, z, w, ang, col) => { for (const s of [-1, 1]) g.add(P(G('box', w, 0.035, 0.03), col || INK, [x * s, y, z], { rot: [0, 0, -ang * s], ink: false })); };
  const smile = (g, y, z, r, frown, col) => g.add(P(G('torus', r, 0.015, 12, Math.PI), col || INK, [0, y, z], { rot: [0, 0, frown ? 0 : Math.PI], ink: false }));
  function fangs(g, y, z, w, n, h, up, col) {
    for (let i = 0; i < n; i++) g.add(P(G('cone', h * 0.35, h, 6), col || WHITE, [-w / 2 + (w * (i + 0.5)) / n, y, z], { rot: [up ? 0 : Math.PI, 0, 0], ink: false }));
  }
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
  /* A bat wing sticking out along x (s = side): a bone and three scalloped flaps. */
  function batWing(w, s, L, col) {
    w.add(P(G('cyl', 0.022, 0.018, L, 5), INK, [s * L / 2, 0.05, 0], { rot: [0, 0, Math.PI / 2], ink: false }));
    for (let i = 0; i < 3; i++) w.add(P(G('sphere', L * 0.21, 10, 6), col, [s * L * (0.2 + i * 0.3), -0.03 - (i === 1 ? 0.04 : 0), 0], { scale: [1, 1, 0.12], inkT: 0.14 }));
  }
  /* A feathered wing (angels): a stack of rounded feathers. */
  function featherWing(w, s, L, col) {
    for (let i = 0; i < 4; i++) w.add(P(G('drop', 0.1, L * (1 - i * 0.18), 1.1), col, [s * (0.1 + i * 0.1), L * 0.3 - i * 0.08, -i * 0.02], { rot: [0, 0, -s * (0.45 + i * 0.32)], scale: [1, 1, 0.35] }));
  }
  /* A wobbly tentacle: a chain of shrinking balls on nested pivots (each pivot sways). */
  function tentacle(parent, x, y, z, n, r0, col, rot) {
    const root = grp(parent, x, y, z);
    if (rot) root.rotation.set(rot[0], rot[1], rot[2]);
    const segs = [root];
    let prev = root;
    for (let i = 0; i < n; i++) {
      const r = r0 * (1 - i / (n + 1.5));
      prev.add(P(G('sphere', r, 10, 8), col, [0, 0, 0]));
      const next = grp(prev, 0, r * 1.45, 0);
      segs.push(next);
      prev = next;
    }
    root.userData.segs = segs;
    return root;
  }
  /* Point a mesh's +y along a direction (spikes, tufts, horns). */
  const aim = (m, x, y, z) => { m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(x, y, z).normalize()); return m; };
  const flame = (col, a, h, o) => new THREE.Mesh(G('drop', a, h, 1.5), GF.basic(col, o || {}));

  const B = {};

  /* ---------- the Grassland, Candy, Dungeon, Lava, Ice, Nightmare and Crystal regulars ---------- */
  B.penguin = function (def, b, p) {
    const bc = '#23263a';
    b.add(P(G('sphere', 0.42, 18, 14), bc, [0, 0.54, 0], { scale: [1, 1.28, 0.95] }));
    const belly = grp(b, 0, 0.54, 0);
    belly.scale.set(1, 1.28, 0.95);
    belly.add(P(MD.decal(0.425, 0.3, 0.3, -0.06), WHITE, [0, 0, 0], { ink: false }));
    eyes(b, 0.12, 0.86, 0.31, 0.085, { pupil: 0.45 });
    b.add(P(G('cone', 0.085, 0.22, 10), '#ffa02e', [0, 0.74, 0.46], { rot: [Math.PI / 2, 0, 0] }));
    p.legs = [];
    for (const s of [-1, 1]) { const f = grp(b, 0.15 * s, 0.1, 0.05); f.add(P(G('sphere', 0.11, 10, 8), '#ffa02e', [0, -0.05, 0.08], { scale: [1, 0.35, 1.5] })); p.legs.push(f); }
    p.arms = [];
    for (const s of [-1, 1]) { const fl = grp(b, 0.4 * s, 0.74, 0); fl.rotation.z = 0.28 * s; fl.userData.ax = 'z'; fl.userData.sgn = s; fl.add(P(G('sphere', 0.15, 10, 8), bc, [0.02 * s, -0.16, 0], { scale: [0.3, 1, 0.6] })); p.arms.push(fl); }
    p.waddle = 0.16; p.legAmp = 0.5; p.armAmp = 0.35;
    if (def.arch === 'bomber') {
      const bomb = grp(b, 0, 1.36, 0);
      bomb.add(P(G('sphere', 0.21, 12, 10), '#2a2a33', [0, 0, 0]));
      bomb.add(P(G('cyl', 0.02, 0.02, 0.14, 6), '#c8b89a', [0.07, 0.2, 0], { ink: false, rot: [0, 0, -0.45] }));
      const spark = new THREE.Mesh(G('star4', 0.1), GF.basic('#ffd23f', { side: 'double' }));
      spark.position.set(0.13, 0.29, 0.02);
      bomb.add(spark);
      p.flames = [spark];
      for (const a of p.arms) { a.rotation.z = -a.userData.sgn * 2.55; }
      p.armAmp = 0;
      b.add(P(G('torus', 0.31, 0.045, 16), def.tint || '#e0423a', [0, 1.0, 0.02], { rot: [Math.PI / 2 - 0.25, 0, 0] }));
    }
  };

  B.slime = function (def, b, p, g) {
    const c = def.color || '#7ed957';
    b.add(P(G('sphere', 0.55, 20, 16), c, [0, 0.44, 0], { scale: [1, 0.8, 1], opacity: 0.9 }));
    b.add(P(G('sphere', 0.13, 10, 8), WHITE, [-0.24, 0.7, 0.3], { basic: true, opacity: 0.75, scale: [1, 0.55, 0.45], rot: [0, 0, 0.6] }));
    eyes(b, 0.16, 0.56, 0.46, 0.09, { pupil: 0.5 });
    smile(b, 0.37, 0.535, 0.07);
    p.hop = true; p.hopH = 0.8;
    if (def.model === 'king_slime') { b.add(crown(0.9, 0.9)); g.scale.setScalar(2.5); }
  };

  B.gnome = function (def, b, p) {
    const robe = def.color || '#3a5fcf', SK = '#ffd4b8';
    p.legs = [limb(b, -0.1, 0.16, 0, 0.1, 0.045, '#5c3b22', ['foot', 0.07]), limb(b, 0.1, 0.16, 0, 0.1, 0.045, '#5c3b22', ['foot', 0.07])];
    b.add(P(G('drop', 0.3, 0.72, 1.1), robe, [0, 0.48, 0]));
    b.add(P(G('sphere', 0.21, 14, 12), SK, [0, 0.88, 0.02]));
    b.add(P(G('drop', 0.17, 0.42, 1.2), WHITE, [0, 0.66, 0.12], { rot: [Math.PI, 0, 0] }));
    b.add(P(G('sphere', 0.065, 8, 6), '#ff9a8a', [0, 0.85, 0.22]));
    dots(b, 0.075, 0.93, 0.19, 0.028);
    b.add(P(G('cone', 0.23, 0.64, 12), '#e0423a', [0, 1.29, -0.03], { rot: [-0.2, 0, 0] }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.24 * s, 0.72, 0.02, 0.24, 0.035, robe, ['hand', 0.05, SK]));
    const wand = grp(p.arms[1], 0, -0.28, 0.02);
    wand.add(P(G('cyl', 0.015, 0.015, 0.34, 6), '#6b4226', [0, 0, 0.15], { rot: [Math.PI / 2, 0, 0], ink: false }));
    wand.add(P(G('star4', 0.08), '#ffe14a', [0, 0, 0.34], { basic: true, rot: [0, 0, 0] }));
    p.armWind = -2.2; p.armHit = -1.3; p.legAmp = 0.7; p.waddle = 0.08;
  };

  const CANDY = ['gumdrop', 'peppermint', 'candycorn', 'gummy'];
  B.zombie = function (def, b, p) {
    const kind = R.pick(CANDY);
    const LIMB = '#a9c98f';
    const col = { gumdrop: R.pick(['#ff7ab8', '#7ed957', '#ffae34', '#b77bff']), peppermint: WHITE, candycorn: '#ffd84a', gummy: R.pick(['#ff5f6d', '#7ed957', '#ffd84a']) }[kind];
    p.legs = [limb(b, -0.12, 0.42, 0, 0.36, 0.06, LIMB, ['foot', 0.08, '#4a3b5c']), limb(b, 0.12, 0.42, 0, 0.36, 0.06, LIMB, ['foot', 0.08, '#4a3b5c'])];
    b.add(P(G('cyl', 0.2, 0.26, 0.42, 12), '#8c7aa8', [0, 0.62, 0]));
    b.add(P(G('box', 0.12, 0.1, 0.04), '#8c7aa8', [0.1, 0.42, 0.21], { rot: [0, 0, 0.5], ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.24 * s, 0.78, 0, 0.42, 0.05, LIMB, ['hand', 0.07]); a.rotation.set(-1.35, 0, 0.08 * s); p.arms.push(a); }
    p.armAmp = 0.18; p.armWind = -0.8; p.armHit = 0.7;
    const hd = grp(b, 0, 1.14, 0);
    p.head = hd;
    let zf = 0.27;
    switch (kind) {
      case 'gumdrop':
        hd.add(P(G('drop', 0.3, 0.52, 0.85), col, [0, 0.12, 0]));
        for (let i = 0; i < 8; i++) { const a = i * 2.4; hd.add(P(G('sphere', 0.024, 6, 4), WHITE, [Math.cos(a) * 0.27, -0.02 + (i % 3) * 0.1, Math.sin(a) * 0.27], { ink: false, basic: true })); }
        break;
      case 'peppermint':
        hd.add(P(G('cyl', 0.3, 0.3, 0.16, 24), WHITE, [0, 0.1, 0], { rot: [Math.PI / 2, 0, 0] }));
        for (let i = 0; i < 4; i++) for (const side of [1, -1]) hd.add(P(G('wedge', 0.29, i * (Math.PI / 2), Math.PI / 4), '#e0283a', [0, 0.1, 0.081 * side], { ink: false, rot: [0, side < 0 ? Math.PI : 0, 0] }));
        zf = 0.1;
        break;
      case 'candycorn':
        hd.add(P(G('cyl', 0.27, 0.31, 0.2, 16), '#ffd84a', [0, 0.02, 0]));
        hd.add(P(G('cyl', 0.17, 0.27, 0.2, 16), '#ff9d2e', [0, 0.22, 0]));
        hd.add(P(G('cone', 0.17, 0.26, 16), WHITE, [0, 0.45, 0]));
        break;
      default:
        hd.add(P(G('sphere', 0.27, 16, 12), col, [0, 0.1, 0], { opacity: 0.88 }));
        for (const s of [-1, 1]) hd.add(P(G('sphere', 0.1, 10, 8), col, [0.2 * s, 0.34, 0], { opacity: 0.88 }));
        zf = 0.25;
    }
    /* zombie face: one big droopy eye, one tiny one, a crooked frown with a tooth */
    hd.add(P(G('sphere', 0.075, 10, 8), '#fff9d6', [-0.1, 0.15, zf], { inkT: 0.14 }));
    hd.add(P(G('sphere', 0.03, 8, 6), INK, [-0.1, 0.13, zf + 0.065], { ink: false }));
    hd.add(P(G('sphere', 0.042, 8, 6), '#fff9d6', [0.11, 0.11, zf - 0.01], { inkT: 0.2 }));
    hd.add(P(G('sphere', 0.018, 6, 4), INK, [0.11, 0.11, zf + 0.03], { ink: false }));
    hd.add(P(G('box', 0.16, 0.03, 0.02), INK, [0.01, -0.02, zf + 0.01], { rot: [0, 0, -0.18], ink: false }));
    hd.add(P(G('box', 0.035, 0.05, 0.02), WHITE, [0.04, -0.045, zf + 0.015], { ink: false }));
    p.waddle = 0.1; p.legAmp = 0.45; p.headTilt = 0.25;
  };

  B.bean = function (def, b, p) {
    const col = def.color || R.pick(['#ff5f6d', '#ffc93c', '#6bd66b', '#6ab7ff', '#c77dff']);
    p.legs = [limb(b, -0.09, 0.14, 0, 0.1, 0.035, INK, ['foot', 0.06]), limb(b, 0.09, 0.14, 0, 0.1, 0.035, INK, ['foot', 0.06])];
    b.add(P(G('sphere', 0.3, 18, 14), col, [0, 0.47, 0], { scale: [0.85, 1.25, 0.8], rot: [0, 0, 0.18] }));
    b.add(P(G('sphere', 0.07, 8, 6), WHITE, [-0.13, 0.66, 0.17], { basic: true, opacity: 0.8, scale: [0.7, 1.6, 0.5], rot: [0, 0, 0.3] }));
    eyes(b, 0.09, 0.58, 0.2, 0.068, { pupil: 0.5 });
    smile(b, 0.45, 0.235, 0.05);
    p.hop = true; p.hopH = 0.5; p.legAmp = 0.8;
  };

  B.wolf = function (def, b, p) {
    const c = def.color || '#8a8f9a', c2 = tint(c, 0.78);
    const fl = def.burn ? ['#ffd23f', '#ff7a2e'] : ['#f2fbff', '#9fe3ff'];
    b.add(P(G('sphere', 0.34, 16, 12), c, [0, 0.68, -0.06], { scale: [1, 0.92, 1.55] }));
    const hd = grp(b, 0, 0.94, 0.5);
    p.head = hd;
    hd.add(P(G('sphere', 0.27, 16, 12), c, [0, 0, 0]));
    hd.add(P(G('cone', 0.15, 0.34, 12), c, [0, -0.07, 0.28], { rot: [Math.PI / 2, 0, 0] }));
    hd.add(P(G('sphere', 0.06, 8, 6), INK, [0, -0.03, 0.46], { ink: false, scale: [1.2, 0.9, 1] }));
    eyes(hd, 0.1, 0.07, 0.21, 0.06, { pupil: 0.55 });
    brows(hd, 0.1, 0.15, 0.26, 0.1, -0.4);
    for (const s of [-1, 1]) hd.add(P(G('cone', 0.09, 0.22, 4), c2, [0.15 * s, 0.26, -0.03], { rot: [0, 0, -0.25 * s] }));
    fangs(hd, -0.15, 0.31, 0.12, 2, 0.07);
    p.legs = [];
    for (const [x, z] of [[-0.17, 0.32], [0.17, 0.32], [-0.17, -0.4], [0.17, -0.4]]) p.legs.push(limb(b, x, 0.52, z, 0.42, 0.07, c, ['paw', 0.09, c2]));
    p.legPh = [0, Math.PI, Math.PI, 0]; p.legAmp = 0.75; p.bob = 0.08;
    const tl = grp(b, 0, 0.8, -0.56);
    p.tail = tl;
    tl.add(P(G('drop', 0.1, 0.5, 1.2), c, [0, 0.15, -0.14], { rot: [-0.9, 0, 0] }));
    p.flames = [];
    for (let i = 0; i < 4; i++) { const f = flame(fl[i % 2], 0.1, 0.36, { opacity: 0.95 }); f.position.set(0, 1.0 - i * 0.03, 0.28 - i * 0.2); f.rotation.x = -0.35; b.add(f); p.flames.push(f); }
  };

  B.flameguy = function (def, b, p, g) {
    const king = def.model === 'flame_king';
    const A = 0.36, H = 1.3, CY = 0.95;
    const at = (y) => dropR(A, H, 1.25, y - (CY - H / 2));
    p.legs = [limb(b, -0.12, 0.36, 0, 0.3, 0.06, '#e0582a', ['foot', 0.08, '#8a2b12']), limb(b, 0.12, 0.36, 0, 0.3, 0.06, '#e0582a', ['foot', 0.08, '#8a2b12'])];
    b.add(P(G('drop', A, H, 1.25), '#ff7a2e', [0, CY, 0], { emissive: '#ff4d00', ei: 0.3 }));
    b.add(P(G('drop', 0.24, 0.8, 1.2), '#ffd23f', [0, 0.84, 0.14], { emissive: '#ffae00', ei: 0.35, ink: false }));
    eyes(b, 0.085, 1.08, at(1.08) - 0.03, 0.055, { white: '#fff6c8', pupil: 0.55 });
    brows(b, 0.09, 1.16, at(1.16) + 0.01, 0.1, -0.35);
    smile(b, 0.92, at(0.92) - 0.005, 0.07, true);
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.3 * s, 1.0, 0, 0.36, 0.055, '#ff7a2e', ['hand', 0.07, '#ffd23f']));
    p.armWind = -2.4; p.armHit = -1.3;
    p.flames = [];
    const tips = king ? 5 : 3;
    for (let i = 0; i < tips; i++) { const k = i - (tips - 1) / 2; const f = flame(i % 2 ? '#ffd23f' : '#ffae00', 0.1, 0.44); f.position.set(k * 0.09, 1.66, -0.02); f.rotation.z = -k * 0.3; b.add(f); p.flames.push(f); }
    if (king) {
      b.add(crown(1.5, 0.72, '#ff5a1f'));
      for (let i = -2; i <= 2; i++) { const f = flame(i % 2 ? '#ffd23f' : '#ff7a2e', 0.08, 0.38); f.position.set(i * 0.08, 0.74, at(0.9) - 0.02); f.rotation.set(Math.PI - 0.35, 0, i * 0.12); b.add(f); p.flames.push(f); }
      g.scale.setScalar(2.1);
    } else {
      b.add(P(G('torus', 0.19, 0.035, 16), '#3a3f4b', [0, 1.3, 0], { rot: [Math.PI / 2, 0, 0] }));
      const spear = grp(p.arms[0], 0, -0.4, 0.04);
      spear.add(P(G('cyl', 0.02, 0.02, 1.15, 6), '#5c3b22', [0, 0.15, 0], { ink: false }));
      spear.add(P(G('cone', 0.05, 0.18, 6), '#cfd6de', [0, 0.8, 0]));
    }
  };

  B.snowman = function (def, b, p) {
    b.add(P(G('sphere', 0.52, 18, 14), WHITE, [0, 0.5, 0]));
    b.add(P(G('sphere', 0.4, 18, 14), WHITE, [0, 1.22, 0]));
    for (let i = 0; i < 3; i++) b.add(P(G('sphere', 0.045, 8, 6), INK, [0, 1.38 - i * 0.16, 0.38 - Math.abs(i - 1) * 0.03], { ink: false }));
    const hd = grp(b, 0, 1.8, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.3, 18, 14), WHITE, [0, 0, 0]));
    dots(hd, 0.1, 0.07, 0.27, 0.042);
    hd.add(P(G('cone', 0.06, 0.34, 8), '#ff8a2a', [0, -0.02, 0.42], { rot: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 5; i++) { const a = -0.55 + i * 0.275; hd.add(P(G('sphere', 0.024, 6, 4), INK, [Math.sin(a) * 0.17, -0.12 - Math.cos(a) * 0.03 + 0.03, 0.255], { ink: false })); }
    hd.add(P(G('cyl', 0.2, 0.2, 0.34, 14), INK, [0, 0.36, 0]));
    hd.add(P(G('cyl', 0.31, 0.31, 0.04, 16), INK, [0, 0.2, 0]));
    hd.add(P(G('cyl', 0.205, 0.205, 0.06, 14), '#e0423a', [0, 0.25, 0], { ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) {
      const a = grp(b, 0.34 * s, 1.35, 0);
      a.rotation.z = 2.0 * s; a.userData.ax = 'z'; a.userData.sgn = s;
      a.add(P(G('cyl', 0.035, 0.03, 0.75, 6), '#6b4226', [0, -0.37, 0]));
      for (const k of [-1, 1]) a.add(P(G('cyl', 0.02, 0.018, 0.18, 5), '#6b4226', [0.05 * k, -0.72, 0], { rot: [0, 0, 0.6 * k], ink: false }));
      p.arms.push(a);
    }
    p.armWind = 0.9; p.armHit = -0.5; p.armAmp = 0.25; p.bob = 0.03; p.waddle = 0.05;
  };

  B.imp = function (def, b, p) {
    const c = '#d8342c', dk = '#3a0d12';
    b.add(P(G('sphere', 0.35, 16, 12), c, [0, 0.64, 0]));
    eyes(b, 0.12, 0.74, 0.26, 0.08, { white: '#ffe14a', pupil: 0.4 });
    smile(b, 0.56, 0.33, 0.1);
    fangs(b, 0.52, 0.335, 0.12, 2, 0.07);
    for (const s of [-1, 1]) b.add(P(G('cone', 0.07, 0.24, 8), dk, [0.16 * s, 1.0, 0], { rot: [0, 0, -0.35 * s] }));
    p.legs = [limb(b, -0.12, 0.34, 0, 0.18, 0.045, c, ['foot', 0.06, dk]), limb(b, 0.12, 0.34, 0, 0.18, 0.045, c, ['foot', 0.06, dk])];
    p.wings = [];
    for (const s of [-1, 1]) { const w = grp(b, 0.26 * s, 0.78, -0.14); w.userData.sgn = s; batWing(w, s, 0.52, '#6a1418'); p.wings.push(w); }
    const tl = grp(b, 0, 0.45, -0.3);
    p.tail = tl;
    tl.add(P(G('cyl', 0.02, 0.02, 0.42, 5), dk, [0, 0.05, -0.2], { rot: [-1.2, 0, 0], ink: false }));
    tl.add(P(G('cone', 0.07, 0.14, 4), dk, [0, 0.14, -0.4], { rot: [-1.2, 0, 0] }));
    p.bob = 0.14; p.flapSpeed = 2.4; p.flapAmp = 0.5; p.legAmp = 0.9;
  };

  B.demon = function (def, b, p) {
    const c = '#9c2436', dk = '#4a0d18';
    p.legs = [limb(b, -0.3, 0.52, 0, 0.38, 0.13, dk, ['foot', 0.17]), limb(b, 0.3, 0.52, 0, 0.38, 0.13, dk, ['foot', 0.17])];
    b.add(P(G('sphere', 0.72, 20, 16), c, [0, 1.2, 0], { scale: [1, 0.95, 0.85] }));
    b.add(P(G('sphere', 0.5, 16, 12), tint(c, 1.3), [0, 1.0, 0.3], { scale: [1, 0.9, 0.55], ink: false }));
    eyes(b, 0.22, 1.52, 0.5, 0.1, { white: '#ffe14a', pupil: 0.35 });
    b.add(P(G('sphere', 0.08, 10, 8), '#ffe14a', [0, 1.66, 0.52], { inkT: 0.14 }));
    b.add(P(G('sphere', 0.03, 6, 4), INK, [0, 1.66, 0.6], { ink: false }));
    b.add(P(G('sphere', 0.3, 14, 10), '#2a0a0e', [0, 1.18, 0.56], { scale: [1.2, 0.48, 0.3], ink: false }));
    fangs(b, 1.26, 0.6, 0.5, 5, 0.12);
    const jaw = grp(b, 0, 1.06, 0.5);
    p.jaw = jaw;
    fangs(jaw, 0.02, 0.1, 0.4, 4, 0.1, true);
    for (const s of [-1, 1]) b.add(P(G('cone', 0.12, 0.55, 10), '#2a0a0e', [0.42 * s, 1.95, 0], { rot: [0, 0, -0.55 * s] }));
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.72 * s, 1.36, 0.05, 0.75, 0.13, c, ['claw', 0.17, dk]); a.rotation.z = 0.2 * s; p.arms.push(a); }
    p.armWind = -2.6; p.armHit = 0.3; p.legAmp = 0.4; p.bob = 0.05; p.waddle = 0.06;
  };

  B.skeleton = function (def, b, p) {
    const BN = '#f5f0e1';
    p.legs = [limb(b, -0.11, 0.52, 0, 0.46, 0.04, BN, ['foot', 0.07]), limb(b, 0.11, 0.52, 0, 0.46, 0.04, BN, ['foot', 0.07])];
    b.add(P(G('sphere', 0.14, 12, 10), BN, [0, 0.58, 0], { scale: [1.3, 0.6, 0.9] }));
    b.add(P(G('cyl', 0.035, 0.035, 0.36, 6), BN, [0, 0.78, -0.02]));
    for (let i = 0; i < 3; i++) b.add(P(G('torus', 0.15 - i * 0.015, 0.025, 6, 16), BN, [0, 1.04 - i * 0.1, 0], { rot: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1] }));
    const hd = grp(b, 0, 1.4, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.27, 16, 12), BN, [0, 0, 0]));
    hd.add(P(G('box', 0.26, 0.12, 0.2), BN, [0, -0.2, 0.08]));
    for (const s of [-1, 1]) hd.add(P(G('sphere', 0.075, 10, 8), INK, [0.1 * s, 0.02, 0.22], { ink: false, scale: [1, 1.2, 0.6] }));
    hd.add(P(G('cone', 0.03, 0.06, 3), INK, [0, -0.08, 0.255], { ink: false, rot: [Math.PI / 2, 0, 0] }));
    for (let i = -2; i <= 2; i++) hd.add(P(G('box', 0.012, 0.06, 0.01), INK, [i * 0.04, -0.2, 0.182], { ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.2 * s, 1.1, 0, 0.44, 0.035, BN, ['hand', 0.05]));
    if (def.arch === 'ranged') {
      /* the bow arm is held out in front, so the bow stands upright */
      p.arms[0].rotation.x = -1.35;
      const bow = grp(p.arms[0], 0, -0.48, 0);
      const arc = P(G('torus', 0.3, 0.025, 6, 16, Math.PI), '#8a5a2b', [0, 0, 0]);
      arc.rotation.order = 'YXZ'; arc.rotation.set(Math.PI, Math.PI / 2, 0);
      bow.add(arc);
      bow.add(P(G('cyl', 0.006, 0.006, 0.6, 4), '#e8e2cf', [0, 0, 0], { ink: false, rot: [Math.PI / 2, 0, 0] }));
      p.armWind = -0.15; p.armHit = -0.05; p.armAmp = 0.12;
    } else {
      const sw = grp(p.arms[1], 0, -0.49, 0.02);
      sw.add(P(G('box', 0.2, 0.04, 0.04), '#8a5a2b', [0, 0, 0.02]));
      sw.add(P(G('box', 0.045, 0.09, 0.62), '#b8c2cc', [0, 0, 0.34]));
      p.armWind = -2.4; p.armHit = 0.2;
    }
    p.legAmp = 0.55; p.headTilt = 0.15;
  };

  B.crystal = function (def, b, p) {
    b.add(P(G('octa', 0.62), '#a98bff', [0, 1.15, 0], { emissive: '#6b4bff', ei: 0.28, scale: [1, 1.4, 0.9] }));
    b.add(P(G('octa', 0.3), '#e1d6ff', [-0.12, 1.34, 0.2], { emissive: '#8f6bff', ei: 0.2, scale: [0.8, 1.3, 0.6], ink: false }));
    eyes(b, 0.13, 1.26, 0.4, 0.07, { pupil: 0.5 });
    smile(b, 1.1, 0.42, 0.06, true);
    const orbit = grp(b, 0, 1.15, 0);
    p.orbit = orbit;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; orbit.add(P(G('octa', 0.2), '#7fe3ff', [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0], { emissive: '#3fc6ff', ei: 0.4 })); }
    p.float = true;
  };

  B.bat = function (def, b, p) {
    const c = def.color || '#8f7ae0', c2 = def.color2 || '#c3b3ff';
    b.add(P(G('sphere', 0.26, 14, 12), c, [0, 0, 0]));
    for (const s of [-1, 1]) b.add(P(G('cone', 0.08, 0.22, 6), c, [0.14 * s, 0.26, 0], { rot: [0, 0, -0.3 * s] }));
    eyes(b, 0.08, 0.05, 0.19, 0.055, { white: def.eye || WHITE, pupil: 0.45 });
    fangs(b, -0.1, 0.225, 0.1, 2, 0.06);
    p.wings = [];
    for (const s of [-1, 1]) { const w = grp(b, 0.2 * s, 0.02, 0); w.rotation.z = 0.3 * s; w.userData.sgn = s; batWing(w, s, 0.55, c2); p.wings.push(w); }
    p.flapSpeed = 3.2; p.flapAmp = 0.7;
  };

  /* ---------- elites and the original line bosses ---------- */
  B.lemongrab = function (def, b, p, g) {
    const SUIT = '#5d6370', LEM = '#fff176';
    p.legs = [limb(b, -0.13, 0.48, 0, 0.44, 0.07, '#3f434d', ['foot', 0.09, '#2a2e38']), limb(b, 0.13, 0.48, 0, 0.44, 0.07, '#3f434d', ['foot', 0.09, '#2a2e38'])];
    b.add(P(G('box', 0.5, 0.9, 0.34), SUIT, [0, 0.9, 0]));
    b.add(P(G('box', 0.14, 0.4, 0.02), WHITE, [0, 1.12, 0.18], { ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.32 * s, 1.28, 0, 0.62, 0.06, SUIT, ['hand', 0.08, LEM]));
    const hd = grp(b, 0, 1.78, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.38, 20, 16), LEM, [0, 0, 0], { scale: [0.85, 1.35, 0.85] }));
    hd.add(P(G('cone', 0.1, 0.24, 10), LEM, [0, 0.6, 0]));
    for (const s of [-1, 1]) {
      hd.add(P(G('sphere', 0.05, 8, 6), INK, [0.12 * s, 0.12, 0.3], { ink: false }));
      hd.add(P(G('box', 0.14, 0.03, 0.03), INK, [0.12 * s, 0.22, 0.3], { rot: [0, 0, 0.4 * s], ink: false }));
    }
    const mouth = P(G('box', 0.2, 0.08, 0.04), '#3a1a1a', [0, -0.12, 0.3], { ink: false });
    hd.add(mouth);
    p.mouth = mouth;
    p.armWind = -2.2; p.armHit = -0.4; p.legAmp = 0.5; p.headTilt = 0.2;
    if (def.model === 'lemongrab_boss') g.scale.setScalar(1.6);
  };

  B.magicman = function (def, b, p) {
    const A = 0.5, H = 1.4;
    b.add(P(G('drop', A, H, 1.1), '#2a3b8f', [0, H / 2, 0]));
    for (let i = 0; i < 6; i++) {
      const y = 0.3 + i * 0.13, ang = -0.9 + (i % 3) * 0.9, r = dropR(A, H, 1.1, y);
      b.add(P(G('star4', 0.07), '#ffe14a', [Math.sin(ang) * (r + 0.01), y, Math.cos(ang) * (r + 0.01)], { basic: true, rot: [0, ang, 0] }));
    }
    const hd = grp(b, 0, 1.46, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.3, 16, 12), '#7fd18b', [0, 0, 0]));
    hd.add(P(G('drop', 0.24, 0.66, 1.2), WHITE, [0, -0.36, 0.14], { rot: [Math.PI, 0, 0] }));
    eyes(hd, 0.1, 0.07, 0.25, 0.05, { pupil: 0.55 });
    brows(hd, 0.1, 0.16, 0.27, 0.1, 0.25);
    hd.add(P(G('cone', 0.3, 0.8, 12), '#6a3bb8', [0, 0.56, -0.02], { rot: [-0.15, 0, 0] }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.32 * s, 1.08, 0, 0.4, 0.07, '#2a3b8f', ['hand', 0.07, '#7fd18b']));
    p.armWind = -2.4; p.armHit = -1.5; p.bob = 0.03; p.headTilt = 0.15;
  };

  B.iceking = function (def, b, p, g) {
    b.add(P(G('drop', 0.72, 1.7, 1.0), '#3b6fd6', [0, 0.85, 0]));
    const hd = grp(b, 0, 1.9, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.44, 20, 16), '#8fc9ff', [0, 0, 0]));
    hd.add(P(G('drop', 0.42, 1.3, 1.1), WHITE, [0, -0.62, 0.36], { rot: [Math.PI, 0, 0], scale: [1, 1, 0.7] }));
    hd.add(P(G('cone', 0.1, 0.5, 10), '#8fc9ff', [0, -0.06, 0.62], { rot: [Math.PI / 2, 0, 0] }));
    eyes(hd, 0.15, 0.09, 0.36, 0.075, { pupil: 0.45 });
    hd.add(crown(0.38, 1));
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.55 * s, 1.55, 0.05, 0.6, 0.13, '#3b6fd6', ['hand', 0.12, '#8fc9ff']); a.rotation.z = 0.35 * s; p.arms.push(a); }
    p.armWind = -2.5; p.armHit = -1.6; p.float = true; p.headTilt = 0.15;
    g.scale.setScalar(1.35);
  };

  B.hunson = function (def, b, p, g) {
    const SUIT = '#2f3a57', SKIN = '#9fb3c8';
    p.legs = [limb(b, -0.14, 0.82, 0, 0.78, 0.09, INK, ['foot', 0.1, INK]), limb(b, 0.14, 0.82, 0, 0.78, 0.09, INK, ['foot', 0.1, INK])];
    b.add(P(G('box', 0.62, 0.95, 0.38), SUIT, [0, 1.25, 0]));
    b.add(P(G('box', 0.16, 0.5, 0.02), WHITE, [0, 1.45, 0.2], { ink: false }));
    b.add(P(G('sphere', 0.13, 12, 10), '#e0283a', [0, 1.28, 0.22], { emissive: '#ff2a4a', ei: 0.8 }));
    const hd = grp(b, 0, 2.0, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.3, 16, 12), SKIN, [0, 0, 0], { scale: [0.9, 1.25, 0.9] }));
    hd.add(P(G('sphere', 0.31, 16, 12), '#1d1a26', [0, 0.16, -0.04], { scale: [0.95, 0.7, 0.95] }));
    for (const s of [-1, 1]) {
      hd.add(P(G('cone', 0.07, 0.24, 6), SKIN, [0.3 * s, 0.02, 0], { rot: [0, 0, -1.2 * s] }));
      hd.add(P(G('sphere', 0.05, 8, 6), '#ff2a4a', [0.1 * s, 0.02, 0.26], { basic: true }));
    }
    smile(hd, -0.15, 0.255, 0.06);
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.38 * s, 1.68, 0, 0.8, 0.075, SUIT, ['hand', 0.08, SKIN]));
    p.armWind = -2.4; p.armHit = -1.2; p.legAmp = 0.45;
    g.scale.setScalar(1.45);
  };

  /* ---------- Dungeon Train originals (Season 5, "Dungeon Train") ---------- */
  B.ant = function (def, b, p) {
    const c = def.color || R.pick(['#ffd84a', '#6ab7ff', '#ff6b8a']);
    const glow = (o) => Object.assign({ emissive: c, ei: 0.22 }, o);
    b.add(P(G('octa', 0.24), c, [0, 0.42, -0.42], glow({ scale: [1, 0.85, 1.4] })));
    b.add(P(G('octa', 0.14), c, [0, 0.42, -0.08], glow({ scale: [1, 0.9, 1.2] })));
    const hd = grp(b, 0, 0.48, 0.2);
    p.head = hd;
    hd.add(P(G('octa', 0.17), c, [0, 0, 0], glow({ scale: [1.15, 1, 1] })));
    eyes(hd, 0.08, 0.04, 0.1, 0.045, { pupil: 0.55 });
    for (const s of [-1, 1]) {
      hd.add(P(G('cyl', 0.012, 0.012, 0.3, 4), INK, [0.07 * s, 0.18, 0.06], { rot: [0.5, 0, -0.35 * s], ink: false }));
      hd.add(P(G('octa', 0.04), c, [0.12 * s, 0.31, 0.13], { ink: false }));
      hd.add(P(G('cone', 0.025, 0.1, 4), INK, [0.05 * s, -0.09, 0.13], { rot: [1.9, 0, 0.3 * s], ink: false }));
    }
    p.legs = [];
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const l = grp(b, 0.08 * s, 0.4, -0.18 + i * 0.12);
      l.rotation.z = 0.75 * s;
      l.add(P(G('cyl', 0.02, 0.016, 0.3, 5), INK, [0, -0.15, 0], { ink: false }));
      l.add(P(G('sphere', 0.028, 6, 4), INK, [0, -0.3, 0], { ink: false }));
      p.legs.push(l);
    }
    p.legPh = [0, Math.PI, Math.PI, 0, 0, Math.PI]; p.legAmp = 0.55; p.bob = 0.03; p.headTilt = 0.2;
  };

  B.geode = function (def, b, p) {
    const ROCK = '#8c8177', RK2 = '#6e645b', GEM = def.color || '#b77bff';
    p.legs = [limb(b, -0.26, 0.44, 0, 0.3, 0.12, RK2, ['foot', 0.16]), limb(b, 0.26, 0.44, 0, 0.3, 0.12, RK2, ['foot', 0.16])];
    b.add(P(G('dodeca', 0.7), ROCK, [0, 1.12, 0], { scale: [1, 0.95, 0.9] }));
    /* cracked open at the front: a dark hollow full of glowing crystals */
    b.add(P(G('sphere', 0.4, 16, 12), '#3a2a4a', [0, 1.02, 0.5], { scale: [1, 1.05, 0.35] }));
    for (let i = 0; i < 10; i++) { const a = i * 2.4, rr = 0.06 + (i % 4) * 0.075; b.add(P(G('octa', 0.07 + (i % 2) * 0.03), GEM, [Math.cos(a) * rr, 1.02 + Math.sin(a) * rr, 0.6], { emissive: GEM, ei: 0.5, scale: [0.7, 1.4, 0.7], rot: [0.5, 0, a], ink: false })); }
    eyes(b, 0.18, 1.55, 0.44, 0.07, { white: '#fff6c8', pupil: 0.5 });
    brows(b, 0.18, 1.66, 0.49, 0.14, -0.3);
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.66 * s, 1.36, 0, 0.55, 0.11, RK2); a.add(P(G('dodeca', 0.21), ROCK, [0, -0.66, 0])); a.rotation.z = 0.25 * s; p.arms.push(a); }
    p.armWind = -2.7; p.armHit = 0.25; p.legAmp = 0.35; p.bob = 0.04; p.waddle = 0.05;
  };

  B.mud = function (def, b, p) {
    const MUD = '#7a5230', MUD2 = '#9a6a3c';
    const SY = 0.78, RR = 0.66, CY = 0.5;
    const at = (y) => { const k = (y - CY) / (RR * SY); return RR * Math.sqrt(Math.max(0, 1 - k * k)); };
    b.add(P(G('sphere', RR, 20, 14), MUD, [0, CY, 0], { scale: [1.12, SY, 1] }));
    for (const [x, y, z, r] of [[-0.3, 0.92, 0.1, 0.18], [0.24, 0.95, -0.05, 0.2], [0.02, 1.02, -0.2, 0.16]]) b.add(P(G('sphere', r, 10, 8), MUD2, [x, y, z]));
    for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.4; b.add(P(G('sphere', 0.14 + (i % 2) * 0.05, 10, 8), MUD2, [Math.cos(a) * 0.58, 0.1, Math.sin(a) * 0.58], { scale: [1, 0.5, 1] })); }
    for (let i = 0; i < 3; i++) { const y = 0.36 - (i % 2) * 0.08, x = -0.3 + i * 0.3; b.add(P(G('drop', 0.05, 0.2, 1.4), MUD2, [x, y, Math.sqrt(Math.max(0.01, at(y) ** 2 - x * x)) + 0.01], { rot: [Math.PI, 0, 0], ink: false })); }
    eyes(b, 0.16, 0.74, at(0.74) - 0.03, 0.075, { white: '#fff3c8', pupil: 0.5 });
    b.add(P(G('sphere', 0.2, 12, 10), '#3a1f10', [0, 0.5, at(0.5) - 0.05], { scale: [1.25, 0.55, 0.4], ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.66 * s, 0.7, 0.05, 0.36, 0.1, MUD, ['hand', 0.14, MUD2]); a.rotation.z = 0.35 * s; p.arms.push(a); }
    p.armWind = -2.7; p.armHit = -0.9; p.bob = 0.02; p.ooze = true;
  };

  B.hairape = function (def, b, p) {
    const FUR = '#b0703a', FUR2 = '#8a5228', FACE = '#ecc9a2';
    p.legs = [limb(b, -0.2, 0.44, 0, 0.3, 0.09, FUR2, ['foot', 0.12, FACE]), limb(b, 0.2, 0.44, 0, 0.3, 0.09, FUR2, ['foot', 0.12, FACE])];
    b.add(P(G('sphere', 0.62, 18, 14), FUR, [0, 1.06, 0]));
    for (let i = 0; i < 30; i++) {
      const u = Math.acos(1 - 2 * ((i + 0.5) / 30)), v = i * 2.39996;
      const x = Math.sin(u) * Math.cos(v), y = Math.cos(u), z = Math.sin(u) * Math.sin(v);
      if (z > 0.45 && y < 0.55 && y > -0.45) continue;
      b.add(aim(P(G('cone', 0.1, 0.28, 5), i % 2 ? FUR : FUR2, [x * 0.62, 1.06 + y * 0.62, z * 0.62], { ink: false }), x, y, z));
    }
    b.add(P(G('sphere', 0.33, 14, 10), FACE, [0, 1.1, 0.45], { scale: [1, 0.9, 0.5] }));
    dots(b, 0.1, 1.19, 0.6, 0.042);
    brows(b, 0.1, 1.28, 0.6, 0.1, -0.25, FUR2);
    b.add(P(G('sphere', 0.06, 8, 6), '#6b3a1e', [0, 1.1, 0.62], { ink: false, scale: [1.4, 1, 1] }));
    smile(b, 0.99, 0.6, 0.07, true);
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.52 * s, 1.26, 0.1, 0.62, 0.1, FUR2, ['hand', 0.14, FACE]); a.rotation.z = 0.15 * s; a.userData.sgn = s; p.arms.push(a); }
    p.armWind = -1.1; p.armHit = -1.5; p.legAmp = 0.5; p.waddle = 0.1; p.rub = true;
  };

  B.dwarrior = function (def, b, p) {
    const ARM = '#4a4f5c', MET = '#9aa3b0', GLOW = '#6fd3ff';
    p.legs = [limb(b, -0.14, 0.5, 0, 0.44, 0.08, ARM, ['foot', 0.11, MET]), limb(b, 0.14, 0.5, 0, 0.44, 0.08, ARM, ['foot', 0.11, MET])];
    b.add(P(G('cyl', 0.3, 0.34, 0.62, 14), ARM, [0, 0.82, 0]));
    b.add(P(G('cyl', 0.31, 0.31, 0.14, 14), MET, [0, 1.08, 0]));
    for (const s of [-1, 1]) b.add(P(G('sphere', 0.16, 10, 8), MET, [0.34 * s, 1.1, 0]));
    const hd = grp(b, 0, 1.46, 0);
    p.head = hd;
    hd.add(P(G('cyl', 0.26, 0.28, 0.46, 16), MET, [0, 0, 0]));
    hd.add(P(G('cap', 0.26, 1.5), MET, [0, 0.22, 0]));
    hd.add(P(G('box', 0.34, 0.05, 0.02), INK, [0, 0.03, 0.27], { ink: false }));
    for (const s of [-1, 1]) hd.add(P(G('sphere', 0.025, 6, 4), GLOW, [0.08 * s, 0.03, 0.28], { basic: true }));
    hd.add(P(G('cone', 0.05, 0.3, 6), '#e0423a', [0, 0.5, -0.05], { rot: [-0.4, 0, 0] }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.36 * s, 1.12, 0, 0.46, 0.07, ARM, ['hand', 0.08, MET]));
    const sw = grp(p.arms[1], 0, -0.5, 0.02);
    sw.add(P(G('box', 0.24, 0.05, 0.05), '#8a5a2b', [0, 0, 0.02]));
    sw.add(P(G('box', 0.06, 0.1, 0.9), '#dff6ff', [0, 0, 0.48], { emissive: GLOW, ei: 0.6 }));
    const sh = grp(p.arms[0], 0, -0.38, 0.14);
    sh.add(P(G('cyl', 0.26, 0.26, 0.06, 18), '#6a1a2a', [0, 0, 0], { rot: [Math.PI / 2, 0, 0] }));
    sh.add(P(G('cyl', 0.1, 0.1, 0.07, 12), MET, [0, 0, 0.01], { rot: [Math.PI / 2, 0, 0] }));
    p.armWind = -2.5; p.armHit = 0.2; p.legAmp = 0.5;
  };

  B.flesh = function (def, b, p, g) {
    const F = '#e9899a', F2 = '#c9607a', F3 = '#f7b3bf';
    b.add(P(G('sphere', 0.9, 22, 16), F, [0, 1.0, 0], { scale: [1.15, 0.95, 1] }));
    b.add(P(G('sphere', 0.55, 16, 12), F2, [-0.62, 1.52, -0.2]));
    b.add(P(G('sphere', 0.5, 16, 12), F3, [0.64, 1.46, -0.1]));
    b.add(P(G('sphere', 0.42, 14, 10), F2, [0.35, 0.42, 0.45], { scale: [1.3, 0.7, 0.8] }));
    b.add(P(G('sphere', 0.35, 14, 10), F3, [-0.5, 0.4, 0.4], { scale: [1.2, 0.7, 0.9] }));
    const EYES = [[-0.34, 1.46, 0.74, 0.16], [0.3, 1.56, 0.7, 0.12], [0.66, 1.2, 0.66, 0.09], [-0.72, 1.12, 0.58, 0.08], [0.06, 1.84, 0.5, 0.1], [-0.84, 1.66, 0.22, 0.1], [0.92, 1.64, 0.26, 0.08]];
    p.eyes = [];
    for (const [x, y, z, r] of EYES) { const e = grp(b, x, y, z); e.add(P(G('sphere', r, 12, 10), WHITE, [0, 0, 0], { inkT: 0.12 })); e.add(P(G('sphere', r * 0.5, 10, 8), INK, [0, 0, r * 0.8], { ink: false })); p.eyes.push(e); }
    b.add(P(G('sphere', 0.5, 16, 12), '#5a1424', [0, 0.98, 0.72], { scale: [1.25, 0.55, 0.35], ink: false }));
    fangs(b, 1.2, 0.86, 0.95, 7, 0.17);
    const jaw = grp(b, 0, 0.78, 0.78);
    p.jaw = jaw;
    fangs(jaw, 0, 0.02, 0.8, 6, 0.15, true);
    p.tentacles = [];
    for (const [x, y, z, rz, rx] of [[-0.95, 1.0, 0.2, 1.2, 0.3], [0.95, 1.0, 0.2, -1.2, 0.3], [-0.7, 0.55, 0.55, 1.9, 0.6], [0.7, 0.55, 0.55, -1.9, 0.6]]) p.tentacles.push(tentacle(b, x, y, z, 6, 0.14, F2, [rx, 0, rz]));
    p.bob = 0.06; p.waddle = 0.08;
    g.scale.setScalar(1.55);
  };

  /* ---------- "Dungeon" (Season 1): bucket knights, a fake angel and the Demon Cat ---------- */
  B.bucket = function (def, b, p) {
    const MET = '#9aa3b0', CL = '#4a6fb8';
    p.legs = [limb(b, -0.12, 0.46, 0, 0.4, 0.07, '#5a5f6a', ['foot', 0.1, '#3a3f4b']), limb(b, 0.12, 0.46, 0, 0.4, 0.07, '#5a5f6a', ['foot', 0.1, '#3a3f4b'])];
    b.add(P(G('cyl', 0.24, 0.3, 0.56, 14), CL, [0, 0.74, 0]));
    b.add(P(G('cyl', 0.25, 0.25, 0.1, 14), MET, [0, 1.0, 0]));
    const hd = grp(b, 0, 1.32, 0);
    p.head = hd;
    hd.add(P(G('cyl', 0.25, 0.3, 0.5, 20), MET, [0, 0, 0]));
    hd.add(P(G('torus', 0.3, 0.025, 20), '#6f7684', [0, -0.24, 0], { rot: [Math.PI / 2, 0, 0] }));
    hd.add(P(G('torus', 0.25, 0.018, 20), '#6f7684', [0, 0.24, 0], { rot: [Math.PI / 2, 0, 0] }));
    hd.add(P(G('torus', 0.27, 0.014, 6, 20, Math.PI), '#6f7684', [0, 0.22, 0], { ink: false }));
    hd.add(P(G('box', 0.34, 0.05, 0.02), INK, [0, 0.02, 0.285], { ink: false }));
    for (const s of [-1, 1]) hd.add(P(G('sphere', 0.024, 6, 4), '#ffe14a', [0.08 * s, 0.02, 0.295], { basic: true }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.29 * s, 1.0, 0, 0.4, 0.055, CL, ['hand', 0.07, MET]));
    const sw = grp(p.arms[1], 0, -0.44, 0.02);
    sw.add(P(G('box', 0.18, 0.04, 0.04), '#8a5a2b', [0, 0, 0.02]));
    sw.add(P(G('box', 0.04, 0.08, 0.55), '#cfd6de', [0, 0, 0.3]));
    const sh = grp(p.arms[0], 0, -0.34, 0.12);
    sh.add(P(G('cyl', 0.22, 0.22, 0.05, 16), '#8a5a2b', [0, 0, 0], { rot: [Math.PI / 2, 0, 0] }));
    sh.add(P(G('torus', 0.21, 0.02, 16), MET, [0, 0, 0.03], { ink: false }));
    p.armWind = -2.3; p.armHit = 0.1; p.legAmp = 0.6; p.headTilt = 0.15;
  };

  B.angel = function (def, b, p) {
    const A = 0.42, H = 1.2;
    b.add(P(G('drop', A, H, 1.0), '#f4f1ea', [0, H / 2, 0]));
    b.add(P(G('torus', dropR(A, H, 1.0, 0.55) + 0.01, 0.025, 20), '#ffcf3d', [0, 0.55, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
    const hd = grp(b, 0, 1.36, 0);
    p.head = hd;
    const nice = grp(hd);
    nice.add(P(G('sphere', 0.24, 16, 12), '#ffe0cc', [0, 0, 0]));
    nice.add(P(G('cap', 0.255, 1.25), '#ffd95a', [0, 0.02, -0.02], { rot: [-0.25, 0, 0] }));
    for (const s of [-1, 1]) nice.add(P(G('torus', 0.035, 0.01, 8, 10, Math.PI), INK, [0.08 * s, 0.02, 0.23], { ink: false }));
    smile(nice, -0.08, 0.225, 0.04);
    const ugly = grp(hd);
    ugly.visible = false;
    ugly.add(P(G('sphere', 0.28, 14, 10), '#8fa37a', [0, 0, 0], { scale: [1.15, 1, 1.05] }));
    ugly.add(P(G('sphere', 0.11, 12, 10), '#fff3c8', [-0.1, 0.08, 0.2], { inkT: 0.12 }));
    ugly.add(P(G('sphere', 0.03, 8, 6), INK, [-0.1, 0.08, 0.305], { ink: false }));
    ugly.add(P(G('sphere', 0.05, 8, 6), '#ff4d4d', [0.13, 0.12, 0.24], { inkT: 0.15 }));
    ugly.add(P(G('sphere', 0.14, 12, 10), '#2a0a0e', [0.02, -0.12, 0.2], { scale: [1.3, 0.6, 0.5], ink: false }));
    fangs(ugly, -0.07, 0.27, 0.3, 6, 0.08);
    fangs(ugly, -0.19, 0.26, 0.26, 5, 0.07, true);
    p.faces = [nice, ugly];
    const halo = new THREE.Mesh(G('torus', 0.2, 0.03, 8, 24), GF.basic('#ffe066'));
    halo.position.set(0, 0.36, 0);
    halo.rotation.x = Math.PI / 2;
    hd.add(halo);
    p.halo = halo;
    p.wings = [];
    for (const s of [-1, 1]) { const w = grp(b, 0.16 * s, 1.02, -0.26); w.userData.sgn = s; featherWing(w, s, 0.7, WHITE); p.wings.push(w); }
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.28 * s, 1.0, 0.02, 0.36, 0.05, '#f4f1ea', ['hand', 0.06, '#ffe0cc']));
    p.armWind = -2.3; p.armHit = -0.6; p.float = true; p.flapSpeed = 1.2; p.flapAmp = 0.25;
  };

  B.demoncat = function (def, b, p, g) {
    const T = '#3fb7a8', T2 = '#2e8f84', MAROON = '#7a1f3d';
    b.add(P(G('sphere', 0.55, 18, 14), T, [0, 0.98, -0.12], { scale: [1, 0.85, 1.5] }));
    const hd = grp(b, 0, 1.34, 0.72);
    p.head = hd;
    hd.add(P(G('sphere', 0.5, 20, 16), T, [0, 0, 0], { scale: [1.12, 0.95, 1] }));
    for (const s of [-1, 1]) hd.add(P(G('cone', 0.14, 0.16, 4), T2, [0.3 * s, 0.43, -0.05], { rot: [0, Math.PI / 4, -0.35 * s] }));
    eyes(hd, 0.2, 0.1, 0.36, 0.13, { white: '#c8e05a', iris: '#ff4d6d', pupil: 0.42, slit: true, glow: true });
    hd.add(P(G('sphere', 0.06, 8, 6), INK, [0, -0.05, 0.5], { ink: false, scale: [1.3, 0.8, 1] }));
    for (const s of [-1, 1]) for (const k of [-1, 1]) hd.add(P(G('cyl', 0.008, 0.008, 0.42, 4), INK, [0.36 * s, -0.08 + k * 0.035, 0.36], { rot: [0, 0, Math.PI / 2 + k * 0.12 * s], ink: false }));
    hd.add(P(G('sphere', 0.28, 14, 10), '#3a0a18', [0, -0.22, 0.36], { scale: [1.15, 0.35, 0.45], ink: false }));
    fangs(hd, -0.15, 0.47, 0.52, 8, 0.1);
    const jaw = grp(hd, 0, -0.26, 0.4);
    p.jaw = jaw;
    fangs(jaw, 0, 0.04, 0.44, 7, 0.08, true);
    p.legs = [];
    const LEGS = [[-0.3, 0.44], [0.3, 0.44], [-0.3, -0.66], [0.3, -0.66]];
    LEGS.forEach(([x, z], i) => {
      if (i === 1 || i === 3) {
        /* bits of his right foreleg and hind leg just… aren't there */
        const pv = grp(b, x, 0.78, z);
        pv.add(P(G('cyl', 0.11, 0.1, 0.24, 10), T, [0, -0.12, 0]));
        pv.add(P(G('cyl', 0.09, 0.09, 0.14, 10), T, [0, -0.6, 0]));
        pv.add(P(G('sphere', 0.13, 10, 8), T2, [0, -0.72, 0.05], { scale: [1, 0.6, 1.3] }));
        p.legs.push(pv);
      } else p.legs.push(limb(b, x, 0.78, z, 0.66, 0.1, T, ['claw', 0.13, T2]));
    });
    p.legPh = [0, Math.PI, Math.PI, 0]; p.legAmp = 0.55;
    p.tentacles = [];
    for (let i = 0; i < 4; i++) p.tentacles.push(tentacle(b, (i - 1.5) * 0.12, 1.1, -0.9, 7, 0.1, MAROON, [-0.9 + (i % 2) * 0.3, 0, (i - 1.5) * 0.4]));
    p.headTilt = 0.2;
    g.scale.setScalar(1.6);
  };

  B.ghost = function (def, b, p) {
    const c = def.color || '#eef6ff';
    b.add(P(G('drop', 0.42, 1.2, 0.8), c, [0, 0.95, 0], { rot: [Math.PI, 0, 0], opacity: 0.85 }));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add(P(G('sphere', 0.1, 8, 6), c, [Math.cos(a) * 0.12, 0.36, Math.sin(a) * 0.12], { opacity: 0.85, ink: false })); }
    for (const s of [-1, 1]) b.add(P(G('sphere', 0.07, 10, 8), INK, [0.14 * s, 1.18, 0.38], { ink: false, scale: [0.8, 1.4, 0.6] }));
    b.add(P(G('sphere', 0.06, 10, 8), INK, [0, 1.0, 0.41], { ink: false, scale: [1, 1.3, 0.5] }));
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.36 * s, 1.1, 0.1, 0.22, 0.06, c, ['hand', 0.08]); a.rotation.set(-1.2, 0, 0.2 * s); p.arms.push(a); }
    p.float = true; p.armAmp = 0.2; p.armWind = -1.2; p.armHit = 0.2;
  };

  /* ---------- Wizard City ---------- */
  B.wizard = function (def, b, p) {
    const robe = def.color || R.pick(['#6a3bb8', '#2f6fd6', '#3fae4a', '#d9412b']);
    const skin = R.pick(['#ffd9c2', '#e8b996', '#c98d6a', '#b8e0a8']);
    const A = 0.38, H = 1.2;
    b.add(P(G('drop', A, H, 1.0), robe, [0, H / 2, 0]));
    b.add(P(G('torus', dropR(A, H, 1.0, 0.12) + 0.01, 0.03, 20), '#ffcf3d', [0, 0.12, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
    const hd = grp(b, 0, 1.3, 0.02);
    p.head = hd;
    hd.add(P(G('sphere', 0.22, 14, 12), skin, [0, 0, 0]));
    dots(hd, 0.08, 0.04, 0.2, 0.03);
    hd.add(P(G('sphere', 0.05, 8, 6), tint(skin, 0.88), [0, -0.02, 0.225]));
    if (R.chance(0.7)) hd.add(P(G('drop', 0.16, 0.5, 1.2), R.pick([WHITE, '#d9d9d9', '#8a5a2b', '#3a2a1a']), [0, -0.26, 0.12], { rot: [Math.PI, 0, 0] }));
    else smile(hd, -0.08, 0.2, 0.05);
    hd.add(P(G('cyl', 0.33, 0.33, 0.03, 20), robe, [0, 0.14, 0]));
    hd.add(P(G('cone', 0.22, 0.62, 14), robe, [0, 0.44, -0.04], { rot: [-0.25, 0, 0.1] }));
    hd.add(P(G('star4', 0.07), def.glow || '#ffe14a', [0, 0.34, 0.13], { basic: true, rot: [-0.25, 0, 0] }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.28 * s, 1.0, 0.02, 0.34, 0.055, robe, ['hand', 0.06, skin]));
    const wand = grp(p.arms[1], 0, -0.38, 0.02);
    wand.add(P(G('cyl', 0.018, 0.018, 0.44, 6), '#6b4226', [0, 0, 0.2], { rot: [Math.PI / 2, 0, 0], ink: false }));
    wand.add(P(G('sphere', 0.05, 8, 6), def.glow || '#ffe14a', [0, 0, 0.44], { basic: true }));
    p.armWind = -2.3; p.armHit = -1.4; p.bob = 0.03; p.headTilt = 0.1;
  };

  /* The Wizard Police: a tall, muscular wizard in a blue robe with a bandana over one eye (the eye under
     it fires the arresting beam) and a badge on the hat. */
  B.police = function (def, b, p, g) {
    const robe = '#2f4fa8', skin = R.pick(['#ffd9c2', '#e8b996', '#c98d6a']);
    const A = 0.5, H = 1.35;
    b.add(P(G('drop', A, H, 0.9), robe, [0, H / 2, 0]));
    b.add(P(G('sphere', 0.34, 14, 10), robe, [0, 1.22, 0], { scale: [1.5, 0.75, 1.0] }));
    b.add(P(G('torus', dropR(A, H, 0.9, 0.12) + 0.01, 0.035, 20), '#ffcf3d', [0, 0.12, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
    b.add(P(G('box', 0.5, 0.08, 0.05), '#ffcf3d', [0, 0.95, dropR(A, H, 0.9, 0.95) + 0.01], { ink: false }));
    const hd = grp(b, 0, 1.55, 0.03);
    p.head = hd;
    hd.add(P(G('sphere', 0.24, 14, 12), skin, [0, 0, 0]));
    hd.add(P(G('sphere', 0.035, 8, 6), INK, [0.085, 0.04, 0.215], { ink: false }));
    hd.add(P(G('box', 0.5, 0.09, 0.08), '#1d2340', [0, 0.06, 0.19], { rot: [0, 0, -0.15], ink: false }));
    hd.add(P(G('box', 0.14, 0.16, 0.05), '#1d2340', [-0.09, 0.03, 0.23], { ink: false }));
    hd.add(P(G('drop', 0.17, 0.45, 1.2), '#4a3a2a', [0, -0.28, 0.12], { rot: [Math.PI, 0, 0] }));
    hd.add(P(G('cyl', 0.36, 0.36, 0.03, 20), robe, [0, 0.15, 0]));
    hd.add(P(G('cone', 0.24, 0.66, 14), robe, [0, 0.46, -0.04], { rot: [-0.2, 0, 0] }));
    hd.add(P(G('star4', 0.09), '#ffe14a', [0, 0.36, 0.15], { basic: true, rot: [-0.2, 0, 0] }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.46 * s, 1.26, 0.02, 0.44, 0.09, robe, ['hand', 0.09, skin]));
    p.armWind = -2.0; p.armHit = -1.2; p.bob = 0.03; p.headTilt = 0.06;
    g.scale.setScalar(1.12);
  };

  B.bufo = function (def, b, p) {
    const SK = '#6fbf4a', SK2 = '#58a43a', ROBE = '#7a3bc4';
    b.add(P(G('sphere', 0.55, 20, 16), SK, [0, 0.62, 0], { scale: [1.2, 0.85, 1.05] }));
    b.add(P(G('sphere', 0.42, 16, 12), '#d8f0b0', [0, 0.52, 0.3], { scale: [1.1, 0.8, 0.5], ink: false }));
    b.add(P(G('tube', 0.62, 0.72, 0.62, 24, Math.PI), ROBE, [0, 0.62, -0.08], { rot: [0, Math.PI / 2, 0] }));
    b.add(P(G('tubein', 0.62, 0.72, 0.62, 24, Math.PI), '#4a1f7a', [0, 0.62, -0.08], { rot: [0, Math.PI / 2, 0], ink: false }));
    b.add(P(G('star4', 0.13), '#ffe14a', [0, 0.62, 0.53], { basic: true }));
    for (const s of [-1, 1]) {
      b.add(P(G('sphere', 0.17, 14, 12), '#ffe14a', [0.24 * s, 1.08, 0.18], { inkT: 0.1 }));
      b.add(P(G('sphere', 0.07, 10, 8), '#e0283a', [0.24 * s, 1.1, 0.33], { ink: false }));
      b.add(P(G('sphere', 0.07, 8, 6), '#2a3b8f', [0.42 * s, 0.72, 0.4], { ink: false, scale: [1, 0.8, 0.4] }));
      b.add(P(G('cone', 0.1, 0.3, 12), ROBE, [0.12 * s, 1.28, -0.02], { rot: [-0.15, 0, -0.2 * s] }));
      b.add(P(G('cyl', 0.13, 0.13, 0.02, 14), ROBE, [0.12 * s, 1.14, 0], { ink: false }));
    }
    smile(b, 0.78, 0.5, 0.2);
    p.legs = [];
    for (const s of [-1, 1]) { const l = limb(b, 0.4 * s, 0.34, -0.1, 0.24, 0.1, SK2, ['foot', 0.14]); l.rotation.z = 0.5 * s; p.legs.push(l); }
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.5 * s, 0.7, 0.15, 0.3, 0.06, SK2, ['hand', 0.08, SK]));
    p.hop = true; p.hopH = 1.2; p.legAmp = 0.8; p.armWind = -2.3; p.armHit = -1.2;
  };

  B.gmw = function (def, b, p, g) {
    const ROBE = '#2a3b8f', TRIM = '#8fd3ff', SK = '#ffd9c2';
    const bub = grp(b, 0, 0.88, 0);
    p.bubble = bub;
    bub.add(new THREE.Mesh(G('sphere', 0.88, 28, 20), GF.basic('#9fdcff', { opacity: 0.38 })));
    bub.add(new THREE.Mesh(G('sphere', 0.76, 24, 16), GF.basic('#e8f8ff', { opacity: 0.18 })));
    bub.add(P(G('sphere', 0.19, 10, 8), WHITE, [-0.38, 0.45, 0.62], { basic: true, opacity: 0.85, scale: [1, 0.55, 0.3], rot: [0, 0, 0.7] }));
    bub.add(P(G('sphere', 0.08, 8, 6), WHITE, [-0.15, 0.65, 0.56], { basic: true, opacity: 0.85 }));
    const rider = grp(b, 0, 1.62, 0);
    p.rider = rider;
    rider.add(P(G('drop', 0.46, 1.0, 1.1), ROBE, [0, 0.4, 0]));
    rider.add(P(G('torus', 0.44, 0.04, 20), TRIM, [0, 0.12, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
    const hd = grp(rider, 0, 1.02, 0.02);
    p.head = hd;
    hd.add(P(G('sphere', 0.28, 16, 12), SK, [0, 0, 0]));
    hd.add(P(G('drop', 0.3, 0.95, 1.1), WHITE, [0, -0.42, 0.2], { rot: [Math.PI, 0, 0], scale: [1, 1, 0.7] }));
    brows(hd, 0.1, 0.14, 0.25, 0.12, 0.2, WHITE);
    dots(hd, 0.09, 0.06, 0.25, 0.035);
    hd.add(P(G('sphere', 0.06, 8, 6), tint(SK, 0.88), [0, 0.0, 0.29]));
    hd.add(P(G('cyl', 0.42, 0.42, 0.04, 22), ROBE, [0, 0.18, 0]));
    hd.add(P(G('cone', 0.3, 0.8, 16), ROBE, [0, 0.56, -0.06], { rot: [-0.2, 0, 0] }));
    for (let i = 0; i < 3; i++) hd.add(P(G('star4', 0.07), '#ffe14a', [(i - 1) * 0.1, 0.4 + i * 0.1, 0.2 - i * 0.05], { basic: true, rot: [-0.2, 0, 0] }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(rider, 0.42 * s, 0.62, 0.05, 0.42, 0.08, ROBE, ['hand', 0.08, SK]));
    const can = grp(p.arms[0], 0, -0.5, 0.12);
    can.add(P(G('cyl', 0.13, 0.15, 0.24, 14), '#e0423a', [0, -0.06, 0]));
    can.add(P(G('cyl', 0.025, 0.02, 0.34, 6), '#e0423a', [0, 0.02, 0.2], { rot: [1.1, 0, 0] }));
    can.add(P(G('torus', 0.09, 0.02, 6, 12, Math.PI), '#c0302a', [0, 0.08, -0.12], { rot: [0, Math.PI / 2, 0], ink: false }));
    const staff = grp(p.arms[1], 0, -0.5, 0.05);
    staff.add(P(G('cyl', 0.03, 0.03, 1.5, 6), '#6b4226', [0, 0.35, 0]));
    const flies = grp(staff, 0, 1.15, 0);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; flies.add(P(G('sphere', 0.035, 6, 4), INK, [Math.cos(a) * 0.2, (i % 2) * 0.08, Math.sin(a) * 0.2], { ink: false })); }
    p.spin = flies; p.spinSpeed = 6;
    p.armWind = -2.2; p.armHit = -1.3; p.float = true;
    g.scale.setScalar(1.08);
  };

  /* ---------- Vampires (the "Stakes" miniseries) ---------- */
  const PALE = '#c9bfd8';
  function vampHead(parent, y, o) {
    o = o || {};
    const hd = grp(parent, 0, y, 0);
    hd.add(P(G('sphere', 0.25, 16, 12), o.skin || PALE, [0, 0, 0], { scale: [0.95, 1.1, 0.95] }));
    hd.add(P(G('cap', 0.265, 1.2), o.hair || '#1d1a26', [0, 0.02, -0.03], { rot: [-0.35, 0, 0] }));
    for (const s of [-1, 1]) hd.add(P(G('cone', 0.05, 0.18, 6), o.skin || PALE, [0.25 * s, 0.03, -0.02], { rot: [0, 0, -1.3 * s] }));
    eyes(hd, 0.08, 0.04, 0.2, 0.045, { white: '#fff0f0', iris: '#e0283a', pupil: 0.55 });
    brows(hd, 0.09, 0.11, 0.24, 0.09, -0.3);
    smile(hd, -0.12, 0.225, 0.05, true);
    fangs(hd, -0.12, 0.235, 0.07, 2, 0.05);
    return hd;
  }
  function cape(parent, y, h, r, col, lining) {
    parent.add(P(G('tube', r * 0.7, r, h, 16, Math.PI), col, [0, y, -0.04], { rot: [0, Math.PI / 2, 0] }));
    parent.add(P(G('tubein', r * 0.7, r, h, 16, Math.PI), lining || '#a3122f', [0, y, -0.04], { rot: [0, Math.PI / 2, 0], ink: false }));
    for (const s of [-1, 1]) parent.add(P(G('box', 0.2, 0.34, 0.03), col, [0.18 * s, y + h / 2 + 0.08, -0.06], { rot: [0.3, 0, 0.5 * s] }));
  }
  B.vampire = function (def, b, p) {
    const SUIT = '#2a1a33';
    p.legs = [limb(b, -0.12, 0.52, 0, 0.46, 0.065, SUIT, ['foot', 0.09, INK]), limb(b, 0.12, 0.52, 0, 0.46, 0.065, SUIT, ['foot', 0.09, INK])];
    b.add(P(G('cyl', 0.2, 0.25, 0.62, 12), SUIT, [0, 0.84, 0]));
    b.add(P(G('box', 0.1, 0.36, 0.02), '#e0283a', [0, 0.95, 0.22], { ink: false }));
    cape(b, 0.86, 0.9, 0.34, '#1d1226');
    p.head = vampHead(b, 1.42);
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.26 * s, 1.1, 0, 0.46, 0.05, SUIT, ['claw', 0.06, PALE]));
    p.armWind = -1.7; p.armHit = -0.9; p.legAmp = 0.5; p.headTilt = 0.2;
  };
  B.fool = function (def, b, p) {
    const SN = '#7fae5a', SN2 = '#5a8a3c';
    for (let i = 0; i < 5; i++) b.add(P(G('sphere', 0.2 - i * 0.02, 12, 10), i % 2 ? SN2 : SN, [Math.sin(i * 1.2) * 0.12, 0.3 + i * 0.2, Math.cos(i * 1.2) * 0.05]));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add(aim(P(G('cone', 0.06, 0.2, 4), i % 2 ? '#e0423a' : '#ffcf3d', [Math.cos(a) * 0.16, 1.2, Math.sin(a) * 0.16], { ink: false }), Math.cos(a), -0.4, Math.sin(a))); }
    const hd = grp(b, 0, 1.36, 0.04);
    p.head = hd;
    hd.add(P(G('sphere', 0.22, 14, 12), SN, [0, 0, 0.04], { scale: [1.1, 0.9, 1.3] }));
    eyes(hd, 0.1, 0.08, 0.2, 0.07, { white: '#fff6c8', pupil: 0.55 });
    fangs(hd, -0.08, 0.3, 0.08, 2, 0.06);
    hd.add(P(G('cyl', 0.008, 0.008, 0.16, 4), '#e0283a', [0, -0.1, 0.36], { rot: [Math.PI / 2, 0, 0], ink: false }));
    for (const s of [-1, 1]) hd.add(P(G('cone', 0.012, 0.06, 4), '#e0283a', [0.02 * s, -0.1, 0.45], { rot: [Math.PI / 2, 0, 0.4 * s], ink: false }));
    p.wings = [];
    for (const s of [-1, 1]) { const w = grp(b, 0.14 * s, 1.0, -0.1); w.userData.sgn = s; batWing(w, s, 0.36, '#4a2a5a'); p.wings.push(w); }
    p.flapSpeed = 4; p.flapAmp = 0.8; p.float = true; p.bob = 0.2;
  };
  B.empress = function (def, b, p) {
    const DRESS = '#5a1a4a';
    b.add(P(G('drop', 0.42, 1.3, 1.1), DRESS, [0, 0.65, 0]));
    const hd = grp(b, 0, 1.46, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.24, 16, 12), PALE, [0, 0, 0], { scale: [0.95, 1.1, 0.95] }));
    hd.add(P(G('drop', 0.26, 0.9, 1.2), '#2a1a33', [0, -0.12, -0.12], { rot: [Math.PI, 0, 0] }));
    hd.add(P(G('cap', 0.255, 1.1), '#2a1a33', [0, 0.02, -0.02], { rot: [-0.3, 0, 0] }));
    hd.add(P(G('torus', 0.245, 0.04, 20), '#1d1226', [0, 0.04, 0], { rot: [Math.PI / 2, 0, 0], ink: false }));
    hd.add(P(G('octa', 0.07), '#e0283a', [0, 0.05, 0.25], { emissive: '#ff2a4a', ei: 0.8, scale: [1, 1.3, 0.7] }));
    smile(hd, -0.12, 0.215, 0.04, true, '#7a1f3d');
    const snake = grp(b, 0, 1.2, 0);
    snake.add(P(G('torus', 0.2, 0.05, 8, 20), '#4f9a36', [0, 0, 0], { rot: [Math.PI / 2, 0, 0] }));
    const sh = grp(snake, 0.18, 0.08, 0.14);
    sh.add(P(G('sphere', 0.07, 10, 8), '#4f9a36', [0, 0, 0], { scale: [1, 0.8, 1.4] }));
    for (const s of [-1, 1]) sh.add(P(G('sphere', 0.018, 6, 4), '#ffe14a', [0.035 * s, 0.03, 0.06], { basic: true }));
    p.head2 = sh;
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.26 * s, 1.14, 0, 0.44, 0.045, DRESS, ['hand', 0.055, PALE]));
    p.armWind = -2.5; p.armHit = -1.8; p.bob = 0.02; p.float = true;
  };
  B.hierophant = function (def, b, p) {
    const ROBE = '#8a1f2b', GOLD = '#ffcf3d';
    b.add(P(G('drop', 0.46, 1.4, 1.0), ROBE, [0, 0.7, 0]));
    b.add(P(G('box', 0.14, 1.0, 0.02), GOLD, [0, 0.62, dropR(0.46, 1.4, 1.0, 0.62) - 0.02], { ink: false }));
    const hd = grp(b, 0, 1.5, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.24, 16, 12), PALE, [0, 0, 0]));
    hd.add(P(G('drop', 0.2, 0.62, 1.2), WHITE, [0, -0.28, 0.14], { rot: [Math.PI, 0, 0] }));
    dots(hd, 0.08, 0.05, 0.22, 0.03);
    hd.add(P(G('cone', 0.22, 0.62, 14), WHITE, [0, 0.46, 0], { scale: [1, 1, 0.6] }));
    for (let i = 0; i < 3; i++) hd.add(P(G('cyl', 0.2 - i * 0.05, 0.215 - i * 0.05, 0.04, 14), GOLD, [0, 0.24 + i * 0.16, 0], { scale: [1, 1, 0.6], ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.32 * s, 1.18, 0, 0.48, 0.06, ROBE, ['hand', 0.07, PALE]));
    /* at half health his arm turns into a snake */
    const snake = tentacle(b, 0.34, 1.16, 0.04, 7, 0.08, '#4f9a36', [Math.PI - 0.5, 0, 0.2]);
    const tip = snake.userData.segs[snake.userData.segs.length - 1];
    tip.add(P(G('sphere', 0.1, 10, 8), '#4f9a36', [0, 0.02, 0], { scale: [1, 0.8, 1.4] }));
    for (const s of [-1, 1]) tip.add(P(G('sphere', 0.02, 6, 4), '#ffe14a', [0.05 * s, 0.05, 0.08], { basic: true }));
    snake.visible = false;
    p.snake = snake;
    p.armWind = -2.4; p.armHit = -0.4; p.bob = 0.02; p.float = true;
  };
  B.moon = function (def, b, p) {
    const CAPE = '#1d2340', FACE = '#f2ecd0';
    b.add(P(G('drop', 0.5, 1.2, 1.0), CAPE, [0, 0.6, 0]));
    const hd = grp(b, 0, 1.5, 0);
    p.head = hd;
    hd.add(P(G('sphere', 0.5, 20, 16), FACE, [0, 0, 0], { emissive: '#fff6c8', ei: 0.15 }));
    for (const [x, y, r] of [[-0.22, 0.24, 0.08], [0.26, 0.18, 0.06], [0.14, -0.28, 0.07], [-0.3, -0.12, 0.05]]) hd.add(P(G('sphere', r, 10, 8), '#d8cfa8', [x, y, Math.sqrt(0.25 - x * x - y * y) - 0.02], { ink: false, scale: [1, 1, 0.3] }));
    for (const s of [-1, 1]) hd.add(P(G('torus', 0.07, 0.014, 8, 12, Math.PI), INK, [0.16 * s, 0.05, 0.47], { rot: [0, 0, Math.PI], ink: false }));
    smile(hd, -0.14, 0.47, 0.08, true);
    fangs(hd, -0.13, 0.48, 0.12, 2, 0.07);
    const orbit = grp(b, 0, 1.1, 0);
    p.orbit = orbit;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; orbit.add(P(G('sphere', 0.08, 10, 8), '#fffdf0', [Math.cos(a) * 0.8, Math.sin(i) * 0.1, Math.sin(a) * 0.8], { inkT: 0.14 })); }
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.4 * s, 1.08, 0, 0.44, 0.07, CAPE, ['hand', 0.08, FACE]));
    p.armWind = -2.4; p.armHit = -1.5; p.float = true;
  };
  B.vking = function (def, b, p, g) {
    const SK = '#b8a9c9', MANE = '#b8733a', SCALE = '#6f9a5a';
    p.legs = [limb(b, -0.2, 0.62, 0, 0.56, 0.07, '#e0b04a', ['bird', 0.12]), limb(b, 0.2, 0.62, 0, 0.56, 0.07, '#e0b04a', ['bird', 0.12])];
    b.add(P(G('cyl', 0.28, 0.3, 0.3, 14), '#3a1a2a', [0, 0.72, 0]));
    b.add(P(G('sphere', 0.5, 18, 14), SK, [0, 1.25, 0], { scale: [1.2, 0.95, 0.8] }));
    for (const s of [-1, 1]) b.add(P(G('sphere', 0.2, 12, 10), tint(SK, 0.92), [0.2 * s, 1.35, 0.3], { scale: [1, 0.8, 0.5], ink: false }));
    cape(b, 1.05, 1.1, 0.62, '#5a0f1f', '#1d1226');
    const hd = grp(b, 0, 1.92, 0.04);
    p.head = hd;
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; hd.add(aim(P(G('drop', 0.14, 0.4, 1.2), i % 2 ? MANE : tint(MANE, 0.85), [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.06]), Math.cos(a), Math.sin(a), -0.2)); }
    hd.add(P(G('sphere', 0.3, 16, 12), SK, [0, 0, 0.02]));
    hd.add(P(G('sphere', 0.12, 10, 8), tint(SK, 0.8), [0, -0.03, 0.29], { scale: [1.3, 0.9, 0.8] }));
    eyes(hd, 0.11, 0.09, 0.22, 0.055, { white: '#ffe8a0', iris: '#e0283a', pupil: 0.5, slit: true });
    brows(hd, 0.11, 0.18, 0.27, 0.12, -0.35);
    smile(hd, -0.14, 0.28, 0.07, true);
    fangs(hd, -0.15, 0.29, 0.1, 2, 0.07);
    hd.add(P(G('cyl', 0.01, 0.01, 0.16, 4), '#e0283a', [0, -0.2, 0.34], { rot: [Math.PI / 2 + 0.3, 0, 0], ink: false }));
    hd.add(P(G('cyl', 0.24, 0.26, 0.08, 16), '#ffcf3d', [0, 0.24, -0.02]));
    for (let i = -2; i <= 2; i++) hd.add(P(G('cone', 0.04, 0.12, 6), '#ffcf3d', [i * 0.09, 0.33, 0.2 - Math.abs(i) * 0.04]));
    p.arms = [];
    for (const s of [-1, 1]) { const a = limb(b, 0.62 * s, 1.5, 0, 0.72, 0.13, SK, ['claw', 0.15, SCALE]); a.rotation.z = 0.25 * s; p.arms.push(a); }
    p.armWind = -2.6; p.armHit = -1.0; p.legAmp = 0.45; p.headTilt = 0.15;
    g.scale.setScalar(1.55);
  };

  /* ---------- the Crystal Citadel, the Lich and Future Finn ---------- */
  B.citadel = function (def, b, p, g) {
    const PINK = '#ff9fcf', PINK2 = '#e87ab4', NERVE = '#fff4fa';
    const cr = (o) => Object.assign({ emissive: '#ff5fb4', ei: 0.18 }, o);
    const glass = (o) => Object.assign({ emissive: '#ff5fb4', ei: 0.25, opacity: 0.72, ink: false }, o);
    const nerve = (x, y, z, len, rx, rz) => { const n = new THREE.Mesh(G('cyl', 0.018, 0.018, len, 5), GF.basic(NERVE)); n.position.set(x, y, z); n.rotation.set(rx || 0, 0, rz || 0); b.add(n); };
    p.legs = [];
    for (const s of [-1, 1]) {
      const l = grp(b, 0.22 * s, 0.9, 0);
      l.add(P(G('cyl', 0.13, 0.1, 0.4, 6), PINK, [0, -0.2, 0], cr()));
      if (s > 0) l.add(P(G('octa', 0.08), PINK2, [0.14, -0.45, 0.05], cr()));
      l.add(P(G('cyl', 0.1, 0.13, 0.42, 6), PINK, [0, -0.66 + (s > 0 ? 0.03 : 0), 0], cr()));
      p.legs.push(l);
    }
    b.add(P(G('octa', 0.62), PINK, [0, 1.42, 0], glass({ scale: [1, 1.1, 0.7] })));
    nerve(0, 1.4, 0, 0.9);
    nerve(0.15, 1.5, 0, 0.5, 0, 0.8); nerve(-0.15, 1.5, 0, 0.5, 0, -0.8); nerve(0.12, 1.2, 0, 0.4, 0, -0.9); nerve(-0.12, 1.2, 0, 0.4, 0, 0.9);
    const hd = grp(b, 0, 2.18, 0);
    p.head = hd;
    hd.add(P(G('octa', 0.3), PINK, [0, 0, 0], cr({ scale: [1, 1.3, 0.8] })));
    hd.add(P(G('octa', 0.12), '#ffd6ec', [0.08, 0.06, 0.1], { basic: true, opacity: 0.6, ink: false }));
    const gem = P(G('octa', 0.08), WHITE, [0, 0.08, 0.2], { emissive: '#ffffff', ei: 1 });
    hd.add(gem);
    p.gem = gem;
    for (const s of [-1, 1]) hd.add(P(G('sphere', 0.035, 8, 6), INK, [0.09 * s, -0.04, 0.2], { ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) {
      const a = grp(b, 0.64 * s, 1.72, 0);
      a.add(P(G('cyl', 0.12, 0.1, 0.5, 6), PINK, [0, -0.25, 0], cr()));
      if (s < 0) { a.add(P(G('octa', 0.07), PINK2, [-0.12, -0.56, 0.05], cr())); a.add(P(G('cyl', 0.1, 0.12, 0.44, 6), PINK, [0, -0.8, 0], cr())); }
      else a.add(P(G('cyl', 0.1, 0.12, 0.5, 6), PINK, [0, -0.72, 0], cr()));
      a.add(P(G('octa', 0.14), PINK2, [0, -1.02, 0], cr()));
      a.rotation.z = 0.12 * s;
      p.arms.push(a);
    }
    p.armWind = -2.2; p.armHit = -0.2; p.legAmp = 0.35;
    g.scale.setScalar(1.5);
  };

  B.lich = function (def, b, p, g) {
    const CLOAK = '#26262e', BONE = '#d8d0b8', GREEN = '#7dff5a';
    const A = 0.55, H = 1.9;
    b.add(P(G('drop', A, H, 0.9), CLOAK, [0, H / 2 + 0.1, 0]));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.add(aim(P(G('cone', 0.12, 0.4, 5), CLOAK, [Math.cos(a) * 0.5, 0.16, Math.sin(a) * 0.5]), Math.cos(a) * 0.3, -1, Math.sin(a) * 0.3)); }
    const hd = grp(b, 0, 2.02, 0.08);
    p.head = hd;
    hd.add(P(G('sphere', 0.3, 16, 12), BONE, [0, 0, 0], { scale: [0.88, 1.22, 0.95] }));
    hd.add(P(G('box', 0.26, 0.14, 0.2), BONE, [0, -0.28, 0.08]));
    for (const s of [-1, 1]) {
      hd.add(P(G('sphere', 0.09, 10, 8), '#0b0b10', [0.1 * s, 0.04, 0.22], { ink: false, scale: [1, 1.2, 0.6] }));
      hd.add(new THREE.Mesh(G('sphere', 0.04, 8, 6), GF.basic(GREEN)));
      hd.children[hd.children.length - 1].position.set(0.1 * s, 0.04, 0.27);
      const horn = tentacle(hd, 0.22 * s, 0.24, -0.04, 7, 0.12, '#c8bfa8', [0.3, 0, -1.25 * s]);
      horn.userData.segs.forEach((sg, i) => { if (i) sg.rotation.set(0.12, 0, 0.42 * s); });
    }
    for (let i = -2; i <= 2; i++) hd.add(P(G('box', 0.012, 0.07, 0.01), INK, [i * 0.045, -0.28, 0.185], { ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) p.arms.push(limb(b, 0.5 * s, 1.72, 0.05, 0.7, 0.05, BONE, ['claw', 0.07, BONE]));
    p.flames = [];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const f = flame(GREEN, 0.09, 0.4, { add: true }); f.position.set(Math.cos(a) * 0.7, 0.35, Math.sin(a) * 0.7); b.add(f); p.flames.push(f); }
    p.armWind = -2.6; p.armHit = -1.4; p.float = true;
    g.scale.setScalar(1.45);
  };

  B.snail = function (def, b, p, g) {
    const GREEN = '#7dff5a';
    b.add(P(G('cyl', 0.07, 0.09, 0.4, 8), '#b8a88a', [0, 0.08, 0.06], { rot: [Math.PI / 2, 0, 0] }));
    b.add(P(G('sphere', 0.2, 14, 12), '#c98d4e', [0, 0.24, -0.06]));
    b.add(P(G('torus', 0.1, 0.02, 6, 20, Math.PI * 1.6), '#8a5a2b', [0.2, 0.26, -0.06], { rot: [0, Math.PI / 2, 0], ink: false }));
    for (const s of [-1, 1]) {
      b.add(P(G('cyl', 0.015, 0.015, 0.2, 5), '#b8a88a', [0.035 * s, 0.24, 0.24], { ink: false }));
      const e = new THREE.Mesh(G('sphere', 0.03, 8, 6), GF.basic(GREEN));
      e.position.set(0.035 * s, 0.35, 0.24);
      b.add(e);
    }
    const aura = new THREE.Mesh(G('ring', 0.3, 0.36, 24), GF.basic('#3fd62a', { opacity: 0.55 }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03;
    b.add(aura);
    p.hop = true; p.hopH = 0.25;
    g.scale.setScalar(1.8);
  };

  B.futurefinn = function (def, b, p, g) {
    const ARM = '#8e96a4', ARM2 = '#6f7684', CAPE = '#7a1f2b';
    p.legs = [];
    for (const s of [-1, 1]) p.legs.push(limb(b, 0.13 * s, 0.42, 0, 0.26, 0.08, ARM, ['foot', 0.11, ARM2]));
    b.add(P(G('cyl', 0.27, 0.29, 0.2, 16), '#2a5bc4', [0, 0.47, 0]));
    b.add(P(G('cyl', 0.27, 0.3, 0.46, 16), ARM, [0, 0.79, 0]));
    b.add(P(G('box', 0.05, 0.22, 0.02), ARM2, [0.08, 0.84, 0.29], { rot: [0, 0, 0.5], ink: false }));
    for (const s of [-1, 1]) b.add(P(G('sphere', 0.14, 10, 8), ARM, [0.3 * s, 0.98, 0]));
    b.add(P(G('tube', 0.24, 0.36, 0.9, 14, Math.PI), CAPE, [0, 0.62, -0.1], { rot: [0, Math.PI / 2, 0] }));
    b.add(P(G('tubein', 0.24, 0.36, 0.9, 14, Math.PI), '#4a0f1a', [0, 0.62, -0.1], { rot: [0, Math.PI / 2, 0], ink: false }));
    const hd = MD.finnHead({ skin: '#f0c8a8', hat: '#e7e1d2', frown: true });
    hd.position.set(0, 1.34, 0);
    b.add(hd);
    p.head = hd;
    hd.add(P(G('drop', 0.24, 0.8, 1.1), '#f4f4f4', [0, -0.46, 0.3], { rot: [Math.PI, 0, 0], scale: [1, 1, 0.55] }));
    brows(hd, 0.11, 0.08, 0.43, 0.1, -0.25, '#f4f4f4');
    hd.add(P(G('box', 0.02, 0.2, 0.01), '#c9606a', [-0.16, -0.02, 0.41], { rot: [0, 0.35, 0.3], ink: false }));
    p.arms = [];
    for (const s of [-1, 1]) {
      const a = grp(b, 0.31 * s, 0.93, 0);
      a.add(P(G('cyl', 0.07, 0.065, 0.38, 8), ARM, [0, -0.19, 0]));
      a.add(P(G('sphere', 0.095, 10, 8), ARM2, [0, -0.41, 0]));
      p.arms.push(a);
    }
    const sw = MD.sword(null, 'sword_finn');
    sw.position.set(0, -0.42, 0.02);
    sw.rotation.x = -1.3;
    p.arms[1].add(sw);
    p.armWind = -2.7; p.armHit = 0.3; p.legAmp = 0.6; p.headTilt = 0.1;
    g.scale.setScalar(1.5);
  };

  /* ---------- assembly ---------- */
  const ALIAS = { king_slime: 'slime', flame_king: 'flameguy', lemongrab_boss: 'lemongrab' };
  function rest(o) { if (o && o.isObject3D && !o.userData.r0) o.userData.r0 = o.rotation.clone(); if (o && o.isObject3D && !o.userData.s0) o.userData.s0 = o.scale.clone(); }
  MD.enemy = function (def) {
    const g = new THREE.Group();
    const p = {};
    const b = new THREE.Group();
    g.add(b);
    p.body = b;
    (B[ALIAS[def.model] || def.model] || B.slime)(def, b, p, g);
    for (const k of ['legs', 'arms', 'wings', 'flames', 'eyes', 'tentacles']) if (p[k]) p[k].forEach(rest);
    for (const k of ['tail', 'jaw', 'head', 'orbit', 'spin', 'halo', 'rider', 'bubble', 'head2']) rest(p[k]);
    for (const t of p.tentacles || []) for (const s of t.userData.segs) rest(s);
    const sc = g.scale.x || 1;
    if (def.elite && !def.boss) g.add(P(G('torus', 0.55, 0.04, 24), '#ffcf3d', [0, 0.06, 0], { rot: [Math.PI / 2, 0, 0], basic: true }));
    if (def.boss) g.add(P(G('torus', 0.62, 0.05, 28), '#ff4d6d', [0, 0.06, 0], { rot: [Math.PI / 2, 0, 0], basic: true }));
    g.add(GF.blob((def.r * 1.2) / sc));
    g.userData.parts = p;
    return g;
  };
  MD.enemyBuilders = B;
})();
