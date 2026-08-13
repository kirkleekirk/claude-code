/* BUNKER '86 — procedural sprite factory. Everything is drawn at boot into
   offscreen canvases: no external art, no network, works offline. */
(function (BK) {
  'use strict';

  const TW = BK.TW = 64;          // tile width  (iso diamond)
  const TH = BK.TH = 32;          // tile height
  const WALLH = BK.WALLH = 46;    // wall extrusion in px

  function mk(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext('2d');
    if (fn) fn(g, c.width, c.height);
    return c;
  }
  BK.mk = mk;

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = BK.clamp(Math.round(r + amt), 0, 255);
    g = BK.clamp(Math.round(g + amt), 0, 255);
    b = BK.clamp(Math.round(b + amt), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  BK.shade = shade;

  function diamond(g, ox, oy, w, h) {
    g.beginPath();
    g.moveTo(ox + w / 2, oy);
    g.lineTo(ox + w, oy + h / 2);
    g.lineTo(ox + w / 2, oy + h);
    g.lineTo(ox, oy + h / 2);
    g.closePath();
  }
  BK.diamond = diamond;

  // Deterministic per-sprite speckle so tiles look grimy but never flicker.
  function speckle(g, w, h, count, colors, seed) {
    const r = BK.rng(seed);
    for (let i = 0; i < count; i++) {
      const x = r() * w, y = r() * h;
      g.fillStyle = colors[r.int(colors.length)];
      const s = r.chance(0.15) ? 2 : 1;
      g.fillRect(x | 0, y | 0, s, s);
    }
  }

  // ------------------------------------------------------------- floors ----
  const FLOOR_STYLE = {};
  FLOOR_STYLE[BK.F.CONCRETE] = { base: '#3f4855', spec: ['#4a5462', '#374049'], seed: 11 };
  FLOOR_STYLE[BK.F.GRATE]    = { base: '#2b333d', spec: ['#333c47'], grid: true, seed: 12 };
  FLOOR_STYLE[BK.F.DIRT]     = { base: '#463d33', spec: ['#4f463a', '#3c342c'], seed: 13 };
  FLOOR_STYLE[BK.F.ASPHALT]  = { base: '#2f3238', spec: ['#373a41', '#292c31'], seed: 14 };
  FLOOR_STYLE[BK.F.SIDEWALK] = { base: '#565a61', spec: ['#61656d'], slab: true, seed: 15 };
  FLOOR_STYLE[BK.F.CARPET]   = { base: '#453542', spec: ['#4d3b49', '#3b2d38'], seed: 16 };
  FLOOR_STYLE[BK.F.TILE]     = { base: '#4e5764', spec: ['#586373'], check: true, seed: 17 };
  FLOOR_STYLE[BK.F.ASH]      = { base: '#585144', spec: ['#635b4c', '#4d473c'], seed: 18 };
  FLOOR_STYLE[BK.F.RUBBLE]   = { base: '#413d47', spec: ['#4b4752', '#38343d'], chunk: true, seed: 19 };
  FLOOR_STYLE[BK.F.LINO]     = { base: '#4c4f48', spec: ['#555850'], check: true, seed: 20 };
  FLOOR_STYLE[BK.F.ROAD_LINE]= { base: '#2f3238', spec: ['#373a41'], dash: true, seed: 21 };

  function floorSprite(styleKey, variant) {
    const st = FLOOR_STYLE[styleKey] || FLOOR_STYLE[BK.F.CONCRETE];
    return mk(TW, TH, (g) => {
      g.save();
      diamond(g, 0, 0, TW, TH);
      g.clip();
      g.fillStyle = st.base; g.fillRect(0, 0, TW, TH);
      speckle(g, TW, TH, 90, st.spec, st.seed + variant * 977);
      if (st.grid) {
        g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1;
        for (let i = -TW; i < TW * 2; i += 8) {
          g.beginPath(); g.moveTo(i, 0); g.lineTo(i + TH, TH); g.stroke();
          g.beginPath(); g.moveTo(i, TH); g.lineTo(i + TH, 0); g.stroke();
        }
      }
      if (st.check && variant % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, 0, TW, TH); }
      if (st.dash) {
        // worn centre-line paint, not a whole yellow tile
        g.fillStyle = 'rgba(196,178,90,.72)';
        g.beginPath();
        g.moveTo(TW / 2, TH * 0.30); g.lineTo(TW * 0.70, TH / 2);
        g.lineTo(TW / 2, TH * 0.70); g.lineTo(TW * 0.30, TH / 2);
        g.closePath(); g.fill();
        speckle(g, TW, TH, 30, ['#2f323866'], st.seed + variant);
      }
      if (st.slab) { g.strokeStyle = 'rgba(0,0,0,.35)'; diamond(g, 0, 0, TW, TH); g.stroke(); }
      if (st.chunk) {
        const r = BK.rng(st.seed + variant * 31);
        for (let i = 0; i < 7; i++) {
          g.fillStyle = r.chance(0.5) ? '#4f4b57' : '#33303a';
          g.fillRect(r.range(6, TW - 10) | 0, r.range(4, TH - 6) | 0, r.irange(3, 7), r.irange(2, 4));
        }
      }
      // edge darkening keeps the grid legible in the dark
      g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
      diamond(g, 0.5, 0.5, TW - 1, TH - 1); g.stroke();
      g.restore();
    });
  }

  // -------------------------------------------------------------- walls ----
  const WALL_STYLE = {};
  WALL_STYLE[BK.W.CONCRETE] = { top: '#78838f', l: '#525c68', r: '#3d454f', seed: 31 };
  WALL_STYLE[BK.W.BRICK]    = { top: '#7f5c52', l: '#5c423a', r: '#45322c', brick: true, seed: 32 };
  WALL_STYLE[BK.W.DRYWALL]  = { top: '#797263', l: '#585244', r: '#413c33', seed: 33 };
  WALL_STYLE[BK.W.RUBBLE]   = { top: '#4a4552', l: '#37333e', r: '#282530', jag: true, seed: 34 };
  WALL_STYLE[BK.W.STUCCO]   = { top: '#8e8474', l: '#6a6255', r: '#4e4840', seed: 35 };
  WALL_STYLE[BK.W.FENCE]    = { top: '#4a5058', l: '#3a4048', r: '#2c3138', fence: true, seed: 36 };
  WALL_STYLE[BK.W.WINDOW]   = { top: '#5c6673', l: '#3d4550', r: '#2e353e', window: true, seed: 37 };

  function wallSprite(kind, variant) {
    const st = WALL_STYLE[kind] || WALL_STYLE[BK.W.CONCRETE];
    const H = st.jag ? WALLH * 0.62 : WALLH;
    return mk(TW, TH + H, (g) => {
      const yTop = 0;
      // left face
      g.fillStyle = st.l;
      g.beginPath();
      g.moveTo(0, yTop + TH / 2); g.lineTo(TW / 2, yTop + TH);
      g.lineTo(TW / 2, yTop + TH + H); g.lineTo(0, yTop + TH / 2 + H);
      g.closePath(); g.fill();
      // right face
      g.fillStyle = st.r;
      g.beginPath();
      g.moveTo(TW / 2, yTop + TH); g.lineTo(TW, yTop + TH / 2);
      g.lineTo(TW, yTop + TH / 2 + H); g.lineTo(TW / 2, yTop + TH + H);
      g.closePath(); g.fill();
      // top
      g.fillStyle = st.top;
      diamond(g, 0, yTop, TW, TH); g.fill();

      const r = BK.rng(st.seed + variant * 613);
      if (st.brick) {
        g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1;
        for (let row = 0; row < 6; row++) {
          const off = row * 8;
          g.beginPath(); g.moveTo(0, TH / 2 + off); g.lineTo(TW / 2, TH + off); g.stroke();
          g.beginPath(); g.moveTo(TW / 2, TH + off); g.lineTo(TW, TH / 2 + off); g.stroke();
        }
      }
      if (st.fence) {
        g.clearRect(0, 0, TW, TH + H);
        g.strokeStyle = '#5b626b'; g.lineWidth = 1;
        for (let i = 0; i <= TW; i += 6) { g.beginPath(); g.moveTo(i, TH / 2 + Math.abs(i - TW / 2) * (TH / TW)); g.lineTo(i, TH / 2 + Math.abs(i - TW / 2) * (TH / TW) + H); g.stroke(); }
        g.beginPath(); g.moveTo(0, TH / 2); g.lineTo(TW / 2, TH); g.lineTo(TW, TH / 2); g.stroke();
      }
      if (st.window) {
        // punch a glowing pane in each face
        g.fillStyle = 'rgba(12,20,26,.85)';
        g.fillRect(TW * 0.12, TH * 0.75, TW * 0.26, H * 0.5);
        g.fillRect(TW * 0.62, TH * 0.75, TW * 0.26, H * 0.5);
        g.fillStyle = 'rgba(120,200,220,.16)';
        g.fillRect(TW * 0.12, TH * 0.75, TW * 0.26, H * 0.22);
        g.fillRect(TW * 0.62, TH * 0.75, TW * 0.26, H * 0.22);
      }
      if (st.jag) {
        // chew the top edge so rubble reads as broken
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 14; i++) {
          const x = r.range(0, TW), y = r.range(0, TH * 0.8);
          g.beginPath(); g.arc(x, y, r.range(3, 8), 0, 6.283); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
      // speckle + top rim light (the PSO-ish cold key light)
      g.save(); g.globalAlpha = 0.5; speckle(g, TW, TH + H, 120, ['#00000022', '#ffffff10'], st.seed + variant); g.restore();
      g.strokeStyle = 'rgba(150,220,235,.26)'; g.lineWidth = 1;
      diamond(g, 0.5, 0.5, TW - 1, TH - 1); g.stroke();
    });
  }

  // --------------------------------------------------------- characters ----
  // Chunky low-detail figures with a cold rim light, read clearly at phone size.
  const CH_W = 40, CH_H = 56;

  function drawFigure(g, dir, frame, look) {
    const cx = CH_W / 2, base = CH_H - 6;
    const skin = look.skin, jacket = look.jacket, pants = look.pants, hair = look.hair, accent = look.accent;
    const back = (dir === 2 || dir === 3);           // facing away
    const flip = (dir === 1 || dir === 2) ? -1 : 1;  // rough left/right
    const swing = [0, 1, 0, -1][frame % 4];

    g.save();
    g.translate(cx, 0);
    g.scale(flip, 1);
    g.translate(-cx, 0);

    // shadow
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(cx, base + 3, 11, 5, 0, 0, 6.283); g.fill();

    // legs
    g.fillStyle = pants;
    g.fillRect(cx - 7, base - 18, 6, 18 + swing);
    g.fillRect(cx + 1, base - 18, 6, 18 - swing);
    g.fillStyle = '#1b1f26';
    g.fillRect(cx - 8, base - 2 + swing, 8, 4);
    g.fillRect(cx + 1, base - 2 - swing, 8, 4);

    // torso
    g.fillStyle = jacket;
    g.fillRect(cx - 9, base - 34, 18, 17);
    // jacket highlight stripe — very 1986
    g.fillStyle = accent;
    g.fillRect(cx - 9, base - 27, 18, 3);

    // arms
    g.fillStyle = jacket;
    g.fillRect(cx - 12, base - 33, 4, 14 - swing * 2);
    g.fillRect(cx + 8, base - 33, 4, 14 + swing * 2);
    g.fillStyle = skin;
    g.fillRect(cx - 12, base - 20 - swing * 2, 4, 4);
    g.fillRect(cx + 8, base - 20 + swing * 2, 4, 4);

    // head
    g.fillStyle = skin;
    g.fillRect(cx - 6, base - 47, 12, 13);
    // hair
    g.fillStyle = hair;
    g.fillRect(cx - 7, base - 49, 14, 6);
    g.fillRect(cx - 7, base - 45, 3, 6);
    g.fillRect(cx + 4, base - 45, 3, 6);
    if (!back) {
      // eyes: two dark slots, no pupils. Reads a little wrong on purpose.
      g.fillStyle = '#0b0f14';
      g.fillRect(cx - 4, base - 41, 3, 2);
      g.fillRect(cx + 1, base - 41, 3, 2);
    }

    // cold rim light down one edge
    g.globalAlpha = 0.5;
    g.fillStyle = '#8fe8ff';
    g.fillRect(cx + 8, base - 47, 1, 30);
    g.fillRect(cx - 9, base - 34, 1, 17);
    g.globalAlpha = 1;
    g.restore();
  }

  BK.makeCharSheet = function (look) {
    // [dir][frame]
    const sheet = [];
    for (let d = 0; d < 4; d++) {
      const frames = [];
      for (let f = 0; f < 4; f++) frames.push(mk(CH_W, CH_H, (g) => drawFigure(g, d, f, look)));
      sheet.push(frames);
    }
    return sheet;
  };
  BK.CH_W = CH_W; BK.CH_H = CH_H;

  BK.randomLook = function (rng) {
    const r = rng || BK.rand;
    const skins = ['#c99878', '#a8724f', '#7a4f34', '#e0b48f', '#5d3a26', '#d9a17a'];
    const hairs = ['#241a14', '#4a2f1c', '#7a5230', '#171717', '#8a6b3d', '#5c2222'];
    const jackets = ['#2f5f8a', '#7a2f52', '#3f7a5a', '#8a5a24', '#5a3f8a', '#8a3a3a', '#2f6f7a'];
    const pants = ['#2b3550', '#3a3f4a', '#4a3a2f', '#31414a'];
    const accents = ['#ff3ea5', '#63f7c1', '#ffd166', '#7ee8ff', '#ff7a3d'];
    return {
      skin: r.pick ? r.pick(skins) : BK.pick(skins),
      hair: r.pick ? r.pick(hairs) : BK.pick(hairs),
      jacket: r.pick ? r.pick(jackets) : BK.pick(jackets),
      pants: r.pick ? r.pick(pants) : BK.pick(pants),
      accent: r.pick ? r.pick(accents) : BK.pick(accents)
    };
  };

  // -------------------------------------------------------- the watcher ----
  // Tall, thin, matte black. Two dim points where a face would be.
  BK.makeWatcher = function () {
    return mk(48, 96, (g) => {
      const cx = 24, base = 90;
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath(); g.ellipse(cx, base + 2, 12, 5, 0, 0, 6.283); g.fill();
      g.fillStyle = '#05070a';
      // legs, unnaturally long
      g.fillRect(cx - 6, base - 44, 5, 44);
      g.fillRect(cx + 1, base - 44, 5, 44);
      // torso, narrow
      g.fillRect(cx - 8, base - 74, 16, 32);
      // arms hanging past the knee
      g.fillRect(cx - 12, base - 72, 4, 44);
      g.fillRect(cx + 8, base - 72, 4, 44);
      // head
      g.fillRect(cx - 6, base - 88, 12, 15);
      // faint eye points
      g.fillStyle = 'rgba(190,255,240,.55)';
      g.fillRect(cx - 4, base - 82, 2, 2);
      g.fillRect(cx + 2, base - 82, 2, 2);
      // it does not catch the light like everything else does
      g.globalAlpha = 0.14;
      g.fillStyle = '#63f7c1';
      g.fillRect(cx + 7, base - 88, 1, 60);
    });
  };

  // -------------------------------------------------------------- props ----
  // Each entry draws into a TW x (TH + h) canvas anchored like a wall block.
  const P = {};
  const propC = (h, fn) => mk(TW, TH + h, (g) => fn(g, TW / 2, TH + h));

  // helper: a boxy object sitting on the tile
  function box(g, cx, baseY, w, d, h, topCol, lCol, rCol) {
    const hw = w / 2, hd = d / 2;
    // top face
    g.fillStyle = topCol;
    g.beginPath();
    g.moveTo(cx, baseY - h - hd * 0.5 - hw * 0.5 + hw * 0.5);
    g.closePath();
    // simple iso box
    const p = (dx, dy, dz) => [cx + (dx - dy) * 1, baseY - (dx + dy) * 0.5 - dz];
    const A = p(-hw, -hd, h), B = p(hw, -hd, h), C = p(hw, hd, h), D = p(-hw, hd, h);
    const A0 = p(-hw, hd, 0), B0 = p(hw, hd, 0), C0 = p(hw, -hd, 0);
    g.fillStyle = topCol;
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.lineTo(D[0], D[1]); g.closePath(); g.fill();
    g.fillStyle = lCol;
    g.beginPath(); g.moveTo(D[0], D[1]); g.lineTo(C[0], C[1]); g.lineTo(B0[0], B0[1]); g.lineTo(A0[0], A0[1]); g.closePath(); g.fill();
    g.fillStyle = rCol;
    g.beginPath(); g.moveTo(C[0], C[1]); g.lineTo(B[0], B[1]); g.lineTo(C0[0], C0[1]); g.lineTo(B0[0], B0[1]); g.closePath(); g.fill();
  }

  P.cot = () => propC(18, (g, cx, b) => {
    box(g, cx, b - 2, 22, 12, 8, '#5a6272', '#3b4250', '#2c323d');
    g.fillStyle = '#6d5b4a'; g.fillRect(cx - 16, b - 20, 26, 5);
  });
  P.hotplate = () => propC(22, (g, cx, b) => {
    box(g, cx, b, 16, 12, 14, '#4a5058', '#333941', '#272c33');
    g.fillStyle = '#ff5a3c'; g.beginPath(); g.ellipse(cx, b - 20, 7, 4, 0, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,120,60,.35)'; g.beginPath(); g.ellipse(cx, b - 20, 12, 7, 0, 0, 6.283); g.fill();
  });
  P.filter = () => propC(34, (g, cx, b) => {
    box(g, cx, b, 26, 16, 26, '#46525c', '#2f3941', '#242c33');
    g.fillStyle = '#7ee8ff'; g.globalAlpha = .5; g.fillRect(cx - 6, b - 34, 12, 10); g.globalAlpha = 1;
    g.fillStyle = '#2a343c'; g.fillRect(cx - 14, b - 18, 28, 3);
  });
  P.latrine = () => propC(20, (g, cx, b) => {
    box(g, cx, b, 14, 12, 12, '#6d7480', '#4a5058', '#383d45');
    g.fillStyle = '#8a919c'; g.beginPath(); g.ellipse(cx, b - 18, 7, 4, 0, 0, 6.283); g.fill();
  });
  P.shower = () => propC(40, (g, cx, b) => {
    g.fillStyle = '#3d454e'; g.fillRect(cx - 2, b - 40, 4, 26);
    box(g, cx, b, 18, 14, 6, '#4e5660', '#343b43', '#282e35');
    g.fillStyle = '#5c646e'; g.beginPath(); g.ellipse(cx, b - 40, 6, 3, 0, 0, 6.283); g.fill();
    g.globalAlpha = .25; g.fillStyle = '#9fdcff'; g.fillRect(cx - 4, b - 38, 8, 22);
  });
  P.arcade = () => propC(46, (g, cx, b) => {
    box(g, cx, b, 18, 14, 38, '#26202e', '#1b1622', '#141019');
    g.fillStyle = '#0a0f16'; g.fillRect(cx - 9, b - 40, 18, 13);
    g.fillStyle = '#ff3ea5'; g.fillRect(cx - 7, b - 38, 14, 9);
    g.fillStyle = '#7ee8ff'; g.fillRect(cx - 5, b - 35, 4, 3); g.fillRect(cx + 2, b - 33, 3, 3);
    g.fillStyle = '#ffd166'; g.fillRect(cx - 8, b - 25, 16, 2);
  });
  P.boombox = () => propC(18, (g, cx, b) => {
    box(g, cx, b, 22, 10, 12, '#3a3f47', '#282c33', '#1e2127');
    g.fillStyle = '#12161c'; g.beginPath(); g.arc(cx - 6, b - 12, 4, 0, 6.283); g.fill();
    g.beginPath(); g.arc(cx + 6, b - 12, 4, 0, 6.283); g.fill();
    g.fillStyle = '#63f7c1'; g.fillRect(cx - 2, b - 16, 4, 2);
  });
  P.tv = () => propC(30, (g, cx, b) => {
    box(g, cx, b, 20, 14, 8, '#4a4034', '#332c24', '#26211b');
    box(g, cx, b - 8, 20, 14, 18, '#3a3f47', '#282c33', '#1e2127');
    g.fillStyle = '#0b1016'; g.fillRect(cx - 8, b - 26, 16, 12);
    g.fillStyle = 'rgba(126,232,255,.5)'; g.fillRect(cx - 7, b - 25, 14, 10);
  });
  P.medstation = () => propC(28, (g, cx, b) => {
    box(g, cx, b, 30, 16, 16, '#6a7480', '#454e58', '#343b44');
    g.fillStyle = '#e6f0f4'; g.fillRect(cx - 6, b - 22, 12, 8);
    g.fillStyle = '#d43b4a'; g.fillRect(cx - 1, b - 21, 2, 6); g.fillRect(cx - 4, b - 19, 8, 2);
  });
  P.workbench = () => propC(24, (g, cx, b) => {
    box(g, cx, b, 32, 18, 14, '#6b5a44', '#463a2c', '#332b21');
    g.fillStyle = '#8a939c'; g.fillRect(cx - 10, b - 18, 8, 3); g.fillRect(cx + 3, b - 17, 6, 2);
  });
  P.growtray = () => propC(26, (g, cx, b) => {
    box(g, cx, b, 32, 18, 10, '#3d4a3a', '#2a332a', '#1f261f');
    g.fillStyle = '#5f9a45'; for (let i = -3; i <= 3; i++) g.fillRect(cx + i * 5, b - 16, 3, 5);
    g.fillStyle = 'rgba(182,255,90,.35)'; g.fillRect(cx - 16, b - 26, 32, 3);
  });
  P.generator = () => propC(34, (g, cx, b) => {
    box(g, cx, b, 38, 26, 24, '#4d5058', '#333740', '#262931');
    g.fillStyle = '#2a2d34'; g.fillRect(cx - 14, b - 30, 28, 6);
    g.fillStyle = '#ffb347'; g.fillRect(cx - 10, b - 22, 5, 3);
    g.fillStyle = '#8a3a2a'; g.fillRect(cx + 6, b - 34, 5, 12);
  });
  P.radiorig = () => propC(30, (g, cx, b) => {
    box(g, cx, b, 30, 16, 20, '#3b4048', '#282c33', '#1d2026');
    g.fillStyle = '#0d1219'; g.fillRect(cx - 10, b - 26, 20, 9);
    g.fillStyle = '#63f7c1'; g.fillRect(cx - 8, b - 24, 6, 2); g.fillRect(cx + 1, b - 21, 7, 2);
    g.strokeStyle = '#6b737d'; g.beginPath(); g.moveTo(cx + 12, b - 26); g.lineTo(cx + 16, b - 44); g.stroke();
  });
  P.shelf = () => propC(38, (g, cx, b) => {
    box(g, cx, b, 32, 14, 32, '#4a4f57', '#31363d', '#252930');
    g.fillStyle = '#2b2f36'; g.fillRect(cx - 15, b - 26, 30, 3); g.fillRect(cx - 15, b - 16, 30, 3);
    g.fillStyle = '#7a6a4a'; g.fillRect(cx - 12, b - 34, 7, 7); g.fillRect(cx - 2, b - 33, 6, 6);
  });
  P.lamp = () => propC(44, (g, cx, b) => {
    g.strokeStyle = '#3d434b'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, b - 4); g.lineTo(cx, b - 36); g.stroke();
    g.fillStyle = '#2f343b'; g.beginPath(); g.ellipse(cx, b - 3, 8, 4, 0, 0, 6.283); g.fill();
    g.fillStyle = '#ffd489'; g.beginPath(); g.arc(cx, b - 40, 6, 0, 6.283); g.fill();
    g.globalAlpha = .3; g.beginPath(); g.arc(cx, b - 40, 11, 0, 6.283); g.fill();
  });
  P.heater = () => propC(20, (g, cx, b) => {
    box(g, cx, b, 18, 12, 14, '#54453a', '#392f28', '#2b241e');
    g.fillStyle = '#ff7a3d'; for (let i = 0; i < 3; i++) g.fillRect(cx - 7 + i * 5, b - 20, 3, 8);
  });
  P.door = () => propC(44, (g, cx, b) => {
    g.fillStyle = '#4a4034'; g.fillRect(cx - 12, b - 42, 24, 42);
    g.fillStyle = '#5b5040'; g.fillRect(cx - 9, b - 38, 18, 34);
    g.fillStyle = '#c9b06a'; g.beginPath(); g.arc(cx + 6, b - 20, 2, 0, 6.283); g.fill();
  });
  P.dooropen = () => propC(44, (g, cx, b) => {
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(cx - 12, b - 42, 24, 42);
    g.fillStyle = '#4a4034'; g.fillRect(cx - 15, b - 42, 5, 42);
  });
  P.ladder = () => propC(40, (g, cx, b) => {
    g.fillStyle = '#0a0d12'; diamond(g, cx - TW / 2, b - TH, TW * 0.7, TH * 0.7); g.fill();
    g.strokeStyle = '#6d747d'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 7, b - 4); g.lineTo(cx - 7, b - 40); g.stroke();
    g.beginPath(); g.moveTo(cx + 7, b - 4); g.lineTo(cx + 7, b - 40); g.stroke();
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const y = b - 8 - i * 6; g.beginPath(); g.moveTo(cx - 7, y); g.lineTo(cx + 7, y); g.stroke(); }
  });
  P.hatch = () => propC(14, (g, cx, b) => {
    g.fillStyle = '#2a2f36'; diamond(g, cx - TW / 2, b - TH, TW, TH); g.fill();
    g.fillStyle = '#3d444d'; diamond(g, cx - TW / 2 + 8, b - TH + 4, TW - 16, TH - 8); g.fill();
    g.strokeStyle = '#ffb347'; g.lineWidth = 2; diamond(g, cx - TW / 2 + 8, b - TH + 4, TW - 16, TH - 8); g.stroke();
    g.fillStyle = '#8a919c'; g.beginPath(); g.arc(cx, b - TH / 2, 4, 0, 6.283); g.fill();
  });
  P.emerglight = () => propC(30, (g, cx, b) => {
    g.fillStyle = '#2b3038'; g.fillRect(cx - 7, b - 30, 14, 7);
    g.fillStyle = '#ff4d5e'; g.fillRect(cx - 5, b - 28, 10, 4);
    g.globalAlpha = .35; g.beginPath(); g.arc(cx, b - 26, 10, 0, 6.283); g.fill();
  });
  P.rubble = () => propC(26, (g, cx, b) => {
    const r = BK.rng(77);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = r.pick(['#4a4552', '#3a3644', '#565162']);
      const x = cx + r.range(-20, 16), y = b - r.range(2, 24);
      g.fillRect(x, y, r.irange(5, 11), r.irange(4, 8));
    }
  });
  P.barrel = () => propC(24, (g, cx, b) => {
    g.fillStyle = '#4a5a3e'; g.fillRect(cx - 8, b - 22, 16, 20);
    g.fillStyle = '#5d7050'; g.beginPath(); g.ellipse(cx, b - 22, 8, 4, 0, 0, 6.283); g.fill();
    g.fillStyle = '#2f3a28'; g.fillRect(cx - 8, b - 16, 16, 2); g.fillRect(cx - 8, b - 8, 16, 2);
    g.fillStyle = '#d6c34a'; g.fillRect(cx - 3, b - 14, 6, 6);
  });
  P.crate = () => propC(20, (g, cx, b) => {
    box(g, cx, b, 20, 16, 16, '#6a5a3f', '#463c2a', '#342d20');
    g.strokeStyle = '#2d2618'; g.lineWidth = 1; g.strokeRect(cx - 10, b - 18, 20, 14);
  });
  P.pipe = () => propC(10, (g, cx, b) => {
    g.fillStyle = '#4d545c'; g.fillRect(cx - 22, b - 8, 44, 5);
    g.fillStyle = '#3a4046'; g.fillRect(cx - 22, b - 4, 44, 2);
  });
  P.poster = () => propC(34, (g, cx, b) => {
    g.fillStyle = '#c8bda0'; g.fillRect(cx - 9, b - 34, 18, 22);
    g.fillStyle = '#a83b2c'; g.fillRect(cx - 7, b - 32, 14, 6);
    g.fillStyle = '#2f3a46'; g.fillRect(cx - 7, b - 24, 14, 2); g.fillRect(cx - 7, b - 20, 10, 2);
  });
  P.car = () => propC(24, (g, cx, b) => {
    const body = '#6b3f52';
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(cx, b - 2, 30, 10, 0, 0, 6.283); g.fill();
    g.fillStyle = body; g.fillRect(cx - 30, b - 16, 60, 12);
    g.fillStyle = shade(body, -28); g.fillRect(cx - 30, b - 8, 60, 5);
    g.fillStyle = '#243038'; g.fillRect(cx - 16, b - 24, 32, 9);
    g.fillStyle = 'rgba(160,220,240,.22)'; g.fillRect(cx - 14, b - 23, 28, 6);
    g.fillStyle = '#14181d'; g.fillRect(cx - 24, b - 6, 8, 6); g.fillRect(cx + 16, b - 6, 8, 6);
    g.fillStyle = '#d9d2b0'; g.fillRect(cx + 28, b - 14, 3, 3);
  });
  P.wreck = () => propC(22, (g, cx, b) => {
    g.fillStyle = '#2b2b30'; g.fillRect(cx - 26, b - 14, 52, 12);
    g.fillStyle = '#1b1b20'; g.fillRect(cx - 14, b - 20, 26, 7);
    const r = BK.rng(5);
    for (let i = 0; i < 10; i++) { g.fillStyle = r.pick(['#3a3a40', '#22222a']); g.fillRect(cx + r.range(-28, 22), b - r.range(2, 18), r.irange(4, 9), r.irange(3, 6)); }
  });
  P.deadtree = () => propC(58, (g, cx, b) => {
    g.strokeStyle = '#2f2a26'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx, b - 2); g.lineTo(cx + 2, b - 34); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx + 2, b - 30); g.lineTo(cx - 12, b - 46); g.stroke();
    g.beginPath(); g.moveTo(cx + 2, b - 32); g.lineTo(cx + 15, b - 50); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 8, b - 40); g.lineTo(cx - 16, b - 52); g.stroke();
    g.beginPath(); g.moveTo(cx + 10, b - 44); g.lineTo(cx + 20, b - 56); g.stroke();
  });
  P.trash = () => propC(12, (g, cx, b) => {
    const r = BK.rng(9);
    for (let i = 0; i < 9; i++) { g.fillStyle = r.pick(['#5a5560', '#48434e', '#6b6472']); g.fillRect(cx + r.range(-18, 14), b - r.range(1, 9), r.irange(3, 7), r.irange(2, 4)); }
  });
  P.rubblepile = () => propC(20, (g, cx, b) => {
    const r = BK.rng(23);
    for (let i = 0; i < 14; i++) { g.fillStyle = r.pick(['#4a4552', '#585264', '#38343e']); g.fillRect(cx + r.range(-20, 16), b - r.range(1, 18), r.irange(5, 10), r.irange(3, 6)); }
  });
  P.hydrant = () => propC(18, (g, cx, b) => {
    g.fillStyle = '#8a3a2a'; g.fillRect(cx - 4, b - 16, 8, 14);
    g.fillStyle = '#a04434'; g.fillRect(cx - 7, b - 12, 14, 4);
    g.beginPath(); g.arc(cx, b - 17, 4, 0, 6.283); g.fill();
  });
  P.sign = () => propC(44, (g, cx, b) => {
    g.fillStyle = '#484d54'; g.fillRect(cx - 1, b - 40, 3, 38);
    g.fillStyle = '#3f6a4a'; g.fillRect(cx - 14, b - 44, 28, 10);
    g.fillStyle = '#cfe3d4'; g.fillRect(cx - 10, b - 41, 20, 2);
  });
  P.pole = () => propC(66, (g, cx, b) => {
    g.fillStyle = '#3a3f45'; g.fillRect(cx - 2, b - 62, 4, 60);
    g.fillRect(cx - 14, b - 62, 28, 3);
    g.fillStyle = '#2b3036'; g.fillRect(cx + 10, b - 60, 8, 4);
  });
  P.phonebooth = () => propC(46, (g, cx, b) => {
    box(g, cx, b, 18, 16, 40, '#2f4a5a', '#20323e', '#18262f');
    g.fillStyle = 'rgba(150,210,230,.16)'; g.fillRect(cx - 8, b - 40, 16, 28);
    g.fillStyle = '#d94f5c'; g.fillRect(cx - 9, b - 44, 18, 5);
  });
  P.shopsign = () => propC(52, (g, cx, b) => {
    g.fillStyle = '#2a2f36'; g.fillRect(cx - 22, b - 50, 44, 16);
    g.fillStyle = '#ff3ea5'; g.fillRect(cx - 19, b - 47, 38, 3);
    g.fillStyle = '#7ee8ff'; g.fillRect(cx - 19, b - 42, 26, 3);
    g.fillStyle = '#ffd166'; g.fillRect(cx - 19, b - 38, 32, 2);
    g.fillStyle = '#484d54'; g.fillRect(cx - 2, b - 34, 4, 32);
  });
  P.corpse = () => propC(10, (g, cx, b) => {
    g.fillStyle = 'rgba(20,10,14,.5)'; g.beginPath(); g.ellipse(cx, b - 3, 20, 8, 0, 0, 6.283); g.fill();
    g.fillStyle = '#4a4a52'; g.fillRect(cx - 16, b - 8, 30, 7);
    g.fillStyle = '#8a7a6a'; g.beginPath(); g.arc(cx - 18, b - 6, 5, 0, 6.283); g.fill();
    g.fillStyle = '#5a2028'; g.fillRect(cx - 6, b - 5, 12, 3);
  });
  P.fridge = () => propC(38, (g, cx, b) => {
    box(g, cx, b, 20, 16, 32, '#8f9298', '#6a6d73', '#4f5257');
    g.fillStyle = '#5a5d62'; g.fillRect(cx - 9, b - 22, 2, 12);
  });
  P.cabinet = () => propC(28, (g, cx, b) => {
    box(g, cx, b, 22, 14, 22, '#6a5a44', '#463c2e', '#342c22');
    g.fillStyle = '#3a3226'; g.fillRect(cx - 1, b - 24, 2, 18);
  });
  P.locker = () => propC(38, (g, cx, b) => {
    box(g, cx, b, 18, 14, 34, '#3f5a5e', '#2b3e42', '#203033');
    g.fillStyle = '#243437'; g.fillRect(cx - 8, b - 32, 16, 2);
    g.fillStyle = '#9aa5a8'; g.fillRect(cx + 4, b - 22, 2, 5);
  });
  P.register = () => propC(22, (g, cx, b) => {
    box(g, cx, b, 26, 16, 12, '#5c6068', '#3e424a', '#2e3138');
    box(g, cx, b - 12, 14, 10, 10, '#787c84', '#565a62', '#42454c');
    g.fillStyle = '#2a2d33'; g.fillRect(cx - 5, b - 26, 10, 4);
  });
  P.table = () => propC(18, (g, cx, b) => box(g, cx, b, 28, 20, 14, '#6b5a44', '#463a2c', '#332b21'));
  P.chair = () => propC(22, (g, cx, b) => {
    box(g, cx, b, 12, 10, 10, '#5a4a38', '#3c3126', '#2c241c');
    g.fillStyle = '#4a3d2e'; g.fillRect(cx - 6, b - 22, 12, 10);
  });
  P.sofa = () => propC(20, (g, cx, b) => {
    box(g, cx, b, 34, 18, 10, '#4a3a48', '#332734', '#261d27');
    g.fillStyle = '#5a4658'; g.fillRect(cx - 17, b - 20, 34, 8);
  });
  P.shelfprop = () => propC(34, (g, cx, b) => {
    box(g, cx, b, 26, 12, 30, '#4a4238', '#322c26', '#26211c');
    g.fillStyle = '#2b2620'; g.fillRect(cx - 12, b - 24, 24, 2); g.fillRect(cx - 12, b - 14, 24, 2);
  });
  P.tvprop = () => propC(22, (g, cx, b) => {
    box(g, cx, b, 18, 14, 16, '#3a3f47', '#282c33', '#1e2127');
    g.fillStyle = '#0b1016'; g.fillRect(cx - 7, b - 20, 14, 10);
  });
  P.note = () => propC(8, (g, cx, b) => {
    g.fillStyle = '#d8d2bc'; g.save(); g.translate(cx, b - 4); g.rotate(-0.2); g.fillRect(-7, -5, 14, 10); g.restore();
    g.fillStyle = '#8a8470'; g.fillRect(cx - 4, b - 6, 8, 1);
  });

  BK.PROP_ART = P;

  // ------------------------------------------------------------- caches ----
  const cache = { floors: {}, walls: {}, props: {} };

  BK.floorArt = function (type, variant) {
    const k = type + ':' + variant;
    if (!cache.floors[k]) cache.floors[k] = floorSprite(type, variant);
    return cache.floors[k];
  };
  BK.wallArt = function (type, variant) {
    const k = type + ':' + variant;
    if (!cache.walls[k]) cache.walls[k] = wallSprite(type, variant);
    return cache.walls[k];
  };
  BK.propArt = function (sprite) {
    if (!cache.props[sprite]) {
      const fn = P[sprite] || P.crate;
      cache.props[sprite] = fn();
    }
    return cache.props[sprite];
  };

  // Warm the caches for the sprites we know we will need immediately.
  BK.preloadArt = function () {
    for (const f of Object.keys(FLOOR_STYLE)) for (let v = 0; v < 3; v++) BK.floorArt(+f, v);
    for (const w of Object.keys(WALL_STYLE)) for (let v = 0; v < 2; v++) BK.wallArt(+w, v);
    for (const k of Object.keys(P)) BK.propArt(k);
  };
})(window.BK = window.BK || {});
