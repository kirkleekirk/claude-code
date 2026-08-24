/* =========================================================================
   MEATLIGHT :: 20-tex.js
   Every texture in the game is generated at boot. No external assets, no
   network fetches -- the whole thing is one HTML file you can open offline.

   Textures are power-of-two, stored as Uint32Array in 0xAABBGGRR order so the
   span loop can read a texel with a single array index.
   ========================================================================= */

var TEX = {};

function mkTex(w, h, seed, fn) {
  var t = { w: w, h: h, shift: Math.log2(w) | 0, data: new Uint32Array(w * h) };
  rndSeed(seed);
  var px = [0, 0, 0, 255];
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      px[0] = 0; px[1] = 0; px[2] = 0; px[3] = 255;
      fn(x, y, px);
      var r = clamp(px[0] | 0, 0, 255), g = clamp(px[1] | 0, 0, 255),
          b = clamp(px[2] | 0, 0, 255), a = clamp(px[3] | 0, 0, 255);
      t.data[y * w + x] = (a << 24) | (b << 16) | (g << 8) | r;
    }
  }
  return t;
}

/* value noise, tiling on [0,period) so textures repeat seamlessly */
function vnoise(x, y, period, seed) {
  var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  function h(a, b) { return hash2(((a % period) + period) % period + seed * 131, ((b % period) + period) % period + seed * 977); }
  var sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  var n00 = h(xi, yi), n10 = h(xi + 1, yi), n01 = h(xi, yi + 1), n11 = h(xi + 1, yi + 1);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}
function fbm(x, y, period, seed, oct) {
  var s = 0, amp = 0.5, f = 1;
  for (var i = 0; i < oct; i++) {
    s += vnoise(x * f, y * f, period * f, seed + i * 17) * amp;
    amp *= 0.5; f *= 2;
  }
  return s;
}

/* ---- text-into-texture (signs, labels, monitor overlays) ---------------- */
function mkTextTex(w, h, bg, fg, lines, opt) {
  opt = opt || {};
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = 'rgb(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ')';
  g.fillRect(0, 0, w, h);
  if (opt.border) {
    g.strokeStyle = 'rgb(' + opt.border[0] + ',' + opt.border[1] + ',' + opt.border[2] + ')';
    g.lineWidth = opt.borderW || 2;
    g.strokeRect(1, 1, w - 2, h - 2);
  }
  var size = opt.size || Math.floor(h / (lines.length + 0.8));
  g.font = (opt.weight || 'bold') + ' ' + size + 'px ' + (opt.font || '"Arial Narrow", Arial, sans-serif');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgb(' + fg[0] + ',' + fg[1] + ',' + fg[2] + ')';
  var lh = size * 1.06;
  var y0 = h / 2 - (lines.length - 1) * lh / 2 + (opt.dy || 0);
  for (var i = 0; i < lines.length; i++) g.fillText(lines[i], w / 2, y0 + i * lh);

  var img = g.getImageData(0, 0, w, h).data;
  var t = { w: w, h: h, shift: Math.log2(w) | 0, data: new Uint32Array(w * h) };
  for (var p = 0; p < w * h; p++) {
    var r = img[p * 4], gg = img[p * 4 + 1], b = img[p * 4 + 2];
    /* grime pass so signage doesn't look freshly printed */
    var n = fbm(((p % w) / w) * 6, (Math.floor(p / w) / h) * 6, 6, 3, 3);
    var d = 0.72 + n * 0.42;
    t.data[p] = 0xFF000000 | ((clamp(b * d, 0, 255) | 0) << 16) | ((clamp(gg * d, 0, 255) | 0) << 8) | (clamp(r * d, 0, 255) | 0);
  }
  return t;
}

/* ------------------------------------------------------------ the library -- */
function buildTextures() {

  /* --- floors ----------------------------------------------------------- */
  TEX.CONCRETE = mkTex(64, 64, 11, function (x, y, p) {
    var n = fbm(x / 9, y / 9, 8, 1, 4);
    var g = 58 + n * 46 + (hash2(x, y) - 0.5) * 16;
    /* expansion joints every 32px */
    if (x % 32 === 0 || y % 32 === 0) g *= 0.62;
    p[0] = g * 0.99; p[1] = g; p[2] = g * 0.95;
  });

  TEX.CONCRETE_WET = mkTex(64, 64, 12, function (x, y, p) {
    var n = fbm(x / 9, y / 9, 8, 1, 4);
    var g = 44 + n * 34;
    if (x % 32 === 0 || y % 32 === 0) g *= 0.6;
    var stain = fbm(x / 17, y / 17, 4, 9, 3);
    var blood = smoothstep(0.56, 0.78, stain);
    p[0] = g * (1 - blood) + (56 + n * 26) * blood;
    p[1] = g * (1 - blood) + (10 + n * 8) * blood;
    p[2] = g * (1 - blood) + (10 + n * 6) * blood;
  });

  TEX.TILE = mkTex(64, 64, 13, function (x, y, p) {
    var gx = x % 16, gy = y % 16;
    var grout = (gx < 2 || gy < 2);
    var n = fbm(x / 7, y / 7, 8, 2, 3);
    var dirt = smoothstep(0.42, 0.85, fbm(x / 21, y / 21, 3, 5, 3));
    if (grout) { var q = 46 + n * 18; p[0] = q; p[1] = q * 1.02; p[2] = q * 0.94; }
    else {
      var v = 118 + n * 30 - dirt * 66;
      p[0] = v * 1.0; p[1] = v * 1.02; p[2] = v * 0.96;
    }
  });

  TEX.TILE_BLOOD = mkTex(64, 64, 14, function (x, y, p) {
    var gx = x % 16, gy = y % 16;
    var grout = (gx < 2 || gy < 2);
    var n = fbm(x / 7, y / 7, 8, 2, 3);
    var base = grout ? 32 + n * 12 : 106 + n * 26;
    /* dried spatter, heavier toward the bottom of the tile sheet */
    var sp = fbm(x / 5, y / 5, 12, 21, 4) + (y / 64) * 0.34;
    var blood = smoothstep(0.60, 0.80, sp);
    var run = (hash2(x, 0) > 0.86 && y > 20) ? smoothstep(20, 34, y) * 0.8 : 0;
    var bl = clamp(blood + run, 0, 1);
    p[0] = lerp(base, 74 + n * 30, bl);
    p[1] = lerp(base * 1.02, 9 + n * 8, bl);
    p[2] = lerp(base * 0.96, 9 + n * 6, bl);
  });

  /* --- walls ------------------------------------------------------------ */
  TEX.PANEL = mkTex(64, 64, 15, function (x, y, p) {
    var n = fbm(x / 11, y / 11, 8, 4, 3);
    var g = 66 + n * 26;
    if (x % 64 < 2) g *= 0.55;                    // panel seam
    if (y > 46) g = lerp(g, 44 + n * 12, smoothstep(46, 60, y));  // scuffed base
    p[0] = g * 0.88; p[1] = g * 0.96; p[2] = g * 0.86;
  });

  TEX.PANEL_RUST = mkTex(64, 64, 16, function (x, y, p) {
    var n = fbm(x / 11, y / 11, 8, 4, 3);
    var g = 62 + n * 24;
    var r = smoothstep(0.48, 0.76, fbm(x / 13, y / 13, 5, 31, 4));
    p[0] = lerp(g * 0.88, 104 + n * 40, r);
    p[1] = lerp(g * 0.96, 52 + n * 22, r);
    p[2] = lerp(g * 0.86, 26 + n * 12, r);
  });

  TEX.CINDER = mkTex(64, 64, 17, function (x, y, p) {
    var row = Math.floor(y / 16);
    var off = (row & 1) ? 16 : 0;
    var bx = (x + off) % 32, by = y % 16;
    var mortar = (bx < 2 || by < 2);
    var n = fbm(x / 6, y / 6, 8, 6, 3);
    var g = mortar ? 40 + n * 13 : 70 + n * 25;
    p[0] = g * 0.97; p[1] = g; p[2] = g * 0.93;
  });

  TEX.STEEL = mkTex(64, 64, 18, function (x, y, p) {
    var brush = hash2(x * 7, Math.floor(y / 2)) * 26;
    var n = fbm(x / 14, y / 14, 8, 7, 2);
    var g = 92 + n * 22 + brush;
    p[0] = g * 0.95; p[1] = g * 0.97; p[2] = g;
  });

  TEX.STEEL_DIRTY = mkTex(64, 64, 19, function (x, y, p) {
    var brush = hash2(x * 7, Math.floor(y / 2)) * 18;
    var n = fbm(x / 14, y / 14, 8, 7, 2);
    var grime = smoothstep(0.40, 0.80, fbm(x / 9, y / 9, 8, 44, 3));
    var g = 78 + n * 18 + brush - grime * 40;
    p[0] = g * 0.96; p[1] = g * 0.95; p[2] = g * 0.92;
  });

  TEX.CEIL_TILE = mkTex(64, 64, 20, function (x, y, p) {
    var gx = x % 32, gy = y % 32;
    var rail = (gx < 2 || gy < 2);
    var n = hash2(x * 3, y * 3);
    var stain = smoothstep(0.55, 0.9, fbm(x / 15, y / 15, 4, 12, 3));
    var g = rail ? 78 : 122 + n * 26;
    g = lerp(g, 92 + n * 20, stain * 0.8);
    p[0] = g * 1.0; p[1] = g * 0.98; p[2] = g * 0.88;
  });

  TEX.CEIL_DECK = mkTex(64, 64, 21, function (x, y, p) {
    /* corrugated roof deck */
    var wv = Math.sin((x / 64) * Math.PI * 8) * 0.5 + 0.5;
    var n = fbm(x / 10, y / 10, 8, 8, 2);
    var g = 30 + wv * 26 + n * 16;
    p[0] = g * 0.93; p[1] = g * 0.95; p[2] = g;
  });

  TEX.CARPET = mkTex(64, 64, 22, function (x, y, p) {
    var n = hash2(x, y) * 22 + fbm(x / 8, y / 8, 8, 9, 3) * 22;
    var g = 34 + n;
    p[0] = g * 0.86; p[1] = g * 0.9; p[2] = g * 0.82;
  });

  TEX.GRATE = mkTex(64, 64, 23, function (x, y, p) {
    var bx = x % 16, by = y % 16;
    var bar = (bx < 3 || by < 6);
    if (!bar) { p[3] = 0; return; }
    var n = fbm(x / 6, y / 6, 8, 10, 2);
    var g = 70 + n * 30;
    p[0] = g * 0.98; p[1] = g * 0.94; p[2] = g * 0.86;
  });

  TEX.DRAIN = mkTex(64, 64, 24, function (x, y, p) {
    var dx = x - 32, dy = y - 32, d = Math.sqrt(dx * dx + dy * dy);
    var n = fbm(x / 8, y / 8, 8, 11, 3);
    if (d < 20) {
      var slot = ((Math.atan2(dy, dx) * 6 / Math.PI) | 0) & 1;
      var g = slot && d > 5 ? 6 : 54 + n * 20;
      p[0] = g * 1.1; p[1] = g * 0.86; p[2] = g * 0.8;
    } else {
      var g2 = 42 + n * 26;
      var blood = smoothstep(22, 30, 52 - d);
      p[0] = lerp(g2, 52, blood); p[1] = lerp(g2, 12, blood); p[2] = lerp(g2, 12, blood);
    }
  });

  /* --- fixtures --------------------------------------------------------- */
  TEX.DOOR_STEEL = mkTex(64, 64, 25, function (x, y, p) {
    var n = fbm(x / 12, y / 12, 8, 13, 2);
    var g = 74 + n * 22;
    if (x < 4 || x > 59) g *= 0.7;                  // frame shadow
    if (y > 8 && y < 12) g *= 1.15;                 // kick rail highlight
    if (y > 52) g = lerp(g, 52 + n * 14, 0.7);      // scuffed kickplate
    p[0] = g * 0.9; p[1] = g * 0.95; p[2] = g * 0.9;
  });

  TEX.DOOR_WOOD = mkTex(64, 64, 26, function (x, y, p) {
    var grain = Math.sin(y * 0.5 + fbm(x / 20, y / 6, 8, 14, 3) * 9) * 0.5 + 0.5;
    var g = 56 + grain * 26;
    if (x < 4 || x > 59 || y < 4 || y > 59) g *= 0.72;
    p[0] = g * 1.18; p[1] = g * 0.86; p[2] = g * 0.6;
  });

  TEX.ROLLUP = mkTex(64, 64, 27, function (x, y, p) {
    var slat = y % 8;
    var n = fbm(x / 14, y / 14, 8, 15, 2);
    var g = 62 + n * 20 + (slat < 1 ? -26 : (slat < 3 ? 16 : 0));
    var rust = smoothstep(0.55, 0.82, fbm(x / 10, y / 10, 6, 51, 3));
    p[0] = lerp(g * 0.92, 100, rust); p[1] = lerp(g * 0.96, 48, rust); p[2] = lerp(g, 24, rust);
  });

  TEX.LOCKER = mkTex(64, 64, 28, function (x, y, p) {
    var col = x % 32;
    var n = fbm(x / 12, y / 12, 8, 16, 2);
    var g = 58 + n * 18;
    if (col < 2) g *= 0.5;
    if (y % 64 < 3) g *= 0.6;
    if (col > 24 && col < 28 && y % 64 > 26 && y % 64 < 32) g *= 1.6;   // latch
    if (col > 6 && col < 26 && y % 64 > 8 && y % 64 < 14) g *= 0.55;    // vent slots
    p[0] = g * 0.78; p[1] = g * 0.98; p[2] = g * 0.84;
  });

  TEX.DESK = mkTex(64, 64, 29, function (x, y, p) {
    var grain = Math.sin(x * 0.22 + fbm(x / 18, y / 8, 8, 17, 3) * 7) * 0.5 + 0.5;
    var g = 44 + grain * 20;
    var wear = smoothstep(0.6, 0.9, fbm(x / 11, y / 11, 6, 61, 3));
    p[0] = lerp(g * 1.2, g * 1.4, wear); p[1] = lerp(g * 0.9, g * 1.0, wear); p[2] = lerp(g * 0.68, g * 0.7, wear);
  });

  TEX.CRATE = mkTex(64, 64, 30, function (x, y, p) {
    var n = fbm(x / 9, y / 9, 8, 18, 3);
    var g = 78 + n * 30;
    if (x < 3 || x > 60 || y < 3 || y > 60) g *= 0.66;
    if (Math.abs(y - 32) < 2) g *= 0.8;             // tape seam
    p[0] = g * 1.12; p[1] = g * 0.92; p[2] = g * 0.64;
  });

  TEX.BARREL = mkTex(64, 64, 31, function (x, y, p) {
    var rib = (y % 22 < 3) ? 1.25 : 1.0;
    var n = fbm(x / 12, y / 12, 8, 19, 2);
    var g = (44 + n * 20) * rib;
    p[0] = g * 0.6; p[1] = g * 0.85; p[2] = g * 1.25;
  });

  TEX.PLASTIC = mkTex(64, 64, 32, function (x, y, p) {
    /* hanging strip curtain: vertical translucent strips with gaps */
    var strip = x % 16;
    if (strip > 13) { p[3] = 0; return; }
    var n = fbm(x / 8, y / 20, 8, 20, 2);
    var g = 132 + n * 40;
    var smear = smoothstep(0.55, 0.85, fbm(x / 6, y / 9, 8, 71, 3));
    p[0] = lerp(g, 96, smear); p[1] = lerp(g * 0.99, 40, smear); p[2] = lerp(g * 0.94, 40, smear);
    p[3] = 255;
  });

  /* --- organic ---------------------------------------------------------- */
  TEX.MEAT = mkTex(64, 64, 33, function (x, y, p) {
    var m = fbm(x / 7, y / 7, 8, 22, 4);
    var fat = smoothstep(0.62, 0.74, fbm(x / 4, y / 11, 8, 23, 3));
    var r = 88 + m * 76, g = 16 + m * 26, b = 18 + m * 24;
    p[0] = lerp(r, 176, fat); p[1] = lerp(g, 152, fat); p[2] = lerp(b, 128, fat);
  });

  TEX.MEAT_DARK = mkTex(64, 64, 34, function (x, y, p) {
    var m = fbm(x / 6, y / 6, 8, 24, 4);
    var r = 52 + m * 52, g = 10 + m * 16, b = 12 + m * 16;
    var sheen = smoothstep(0.7, 0.95, fbm(x / 3, y / 3, 8, 25, 2));
    p[0] = r + sheen * 40; p[1] = g + sheen * 18; p[2] = b + sheen * 18;
  });

  TEX.BONE = mkTex(64, 64, 35, function (x, y, p) {
    var m = fbm(x / 8, y / 8, 8, 26, 3);
    var g = 168 + m * 52;
    var stain = smoothstep(0.55, 0.85, fbm(x / 5, y / 14, 8, 27, 3));
    p[0] = lerp(g * 1.02, 128, stain); p[1] = lerp(g * 0.98, 92, stain); p[2] = lerp(g * 0.82, 74, stain);
  });

  TEX.HIDE = mkTex(64, 64, 36, function (x, y, p) {
    /* the Six: cured hide stretched over something that is not an animal */
    var m = fbm(x / 5, y / 5, 8, 28, 4);
    var seam = smoothstep(0.72, 0.78, fbm(x / 3, y / 16, 8, 29, 2));
    var r = 62 + m * 54, g = 26 + m * 24, b = 24 + m * 22;
    p[0] = lerp(r, 22, seam); p[1] = lerp(g, 10, seam); p[2] = lerp(b, 10, seam);
  });

  TEX.BLOOD = mkTex(64, 64, 37, function (x, y, p) {
    var dx = (x - 32) / 30, dy = (y - 32) / 30;
    var d = Math.sqrt(dx * dx + dy * dy);
    var edge = fbm(x / 6, y / 6, 8, 30, 3) * 0.55;
    if (d + edge > 1.0) { p[3] = 0; return; }
    var m = fbm(x / 9, y / 9, 8, 31, 3);
    p[0] = 46 + m * 44; p[1] = 5 + m * 10; p[2] = 6 + m * 10;
    p[3] = 255;
  });

  TEX.BLOOD_SPRAY = mkTex(64, 64, 38, function (x, y, p) {
    /* arterial cast-off: droplets thrown along +x */
    var d = hash2(x * 5, y * 5);
    var density = smoothstep(1.0, 0.1, x / 64) * 0.5 + 0.08;
    if (d > density) { p[3] = 0; return; }
    var m = fbm(x / 4, y / 4, 8, 32, 2);
    p[0] = 58 + m * 50; p[1] = 6 + m * 8; p[2] = 7 + m * 8; p[3] = 255;
  });

  /* --- emissive --------------------------------------------------------- */
  TEX.LAMP = mkTex(32, 32, 39, function (x, y, p) {
    var n = hash2(x, y) * 14;
    p[0] = 226 + n; p[1] = 232 + n; p[2] = 214 + n;
  });
  TEX.LAMP_RED = mkTex(32, 32, 40, function (x, y, p) {
    var n = hash2(x, y) * 14;
    p[0] = 224 + n; p[1] = 34 + n; p[2] = 26 + n;
  });
  TEX.LAMP_DEAD = mkTex(32, 32, 41, function (x, y, p) {
    var n = hash2(x, y) * 10;
    p[0] = 44 + n; p[1] = 46 + n; p[2] = 42 + n;
  });
  TEX.SCREEN_ON = mkTex(64, 64, 42, function (x, y, p) {
    var scan = (y % 2) ? 0.62 : 1.0;
    var n = hash2(x, y) * 30;
    p[0] = (18 + n) * scan; p[1] = (58 + n * 1.6) * scan; p[2] = (30 + n) * scan;
  });
  TEX.SCREEN_OFF = mkTex(64, 64, 43, function (x, y, p) {
    var n = hash2(x, y) * 8;
    p[0] = 14 + n; p[1] = 15 + n; p[2] = 17 + n;
  });

  /* --- cloth (actors) --------------------------------------------------- */
  function cloth(seed, r, g, b, rough) {
    return mkTex(32, 32, seed, function (x, y, p) {
      var n = fbm(x / 5, y / 5, 4, seed, 3) * rough + hash2(x, y) * 0.12;
      var k = 0.78 + n * 0.5;
      p[0] = r * k; p[1] = g * 0.99 * k; p[2] = b * k;
    });
  }
  TEX.CLOTH_SMOCK  = cloth(44, 168, 172, 158, 0.4);   // Dale: white plant smock
  TEX.CLOTH_APRON  = cloth(45, 128, 130, 122, 0.5);   // rubber apron
  TEX.CLOTH_NAVY   = cloth(46,  44,  52,  74, 0.35);  // Ray: security blues
  TEX.CLOTH_ORANGE = cloth(47, 176,  92,  30, 0.45);  // Sol: sanitation hi-vis
  TEX.CLOTH_SUIT   = cloth(48,  28,  30,  36, 0.22);  // Vosk: charcoal overcoat
  TEX.SKIN         = cloth(49, 176, 138, 116, 0.22);
  TEX.SKIN_DARK    = cloth(50, 128,  92,  70, 0.22);
  TEX.HAIR         = cloth(51,  42,  34,  30, 0.4);
  TEX.HAIR_GREY    = cloth(52, 126, 122, 116, 0.4);
  TEX.BOOT         = cloth(53,  26,  26,  28, 0.3);
  TEX.GLOVE        = cloth(54, 198, 198, 190, 0.3);

  /* --- signage ---------------------------------------------------------- */
  TEX.SIGN_LINE3    = mkTextTex(128, 64, [176, 148, 22], [22, 18, 8], ['LINE 3'], { size: 40, border: [22, 18, 8] });
  TEX.SIGN_COOKER   = mkTextTex(128, 64, [176, 148, 22], [22, 18, 8], ['COOKER', 'HOUSE'], { size: 24, border: [22, 18, 8] });
  TEX.SIGN_COLD     = mkTextTex(128, 64, [40, 88, 132], [214, 220, 226], ['COLD', 'STORAGE'], { size: 24 });
  TEX.SIGN_NOSMOKE  = mkTextTex(64, 64, [188, 188, 182], [140, 20, 20], ['NO', 'SMOKING'], { size: 15, border: [140, 20, 20] });
  TEX.SIGN_EXIT     = mkTextTex(64, 32, [18, 20, 18], [40, 200, 70], ['EXIT'], { size: 20 });
  TEX.SIGN_DAYS     = mkTextTex(128, 128, [206, 200, 176], [24, 24, 24],
                        ['DAYS SINCE', 'LOST-TIME', 'INJURY', '', '0'], { size: 17 });
  TEX.SIGN_INTAKE   = mkTextTex(128, 64, [176, 148, 22], [22, 18, 8], ['INTAKE', 'BAY 2'], { size: 24, border: [22, 18, 8] });
  TEX.SIGN_SECURITY = mkTextTex(128, 64, [72, 76, 84], [212, 214, 210], ['SECURITY'], { size: 26 });
  TEX.SIGN_AUTH     = mkTextTex(128, 64, [188, 30, 30], [240, 236, 230], ['AUTHORIZED', 'PERSONNEL', 'ONLY'], { size: 16 });
  TEX.SIGN_GRADE6   = mkTextTex(128, 128, [190, 186, 170], [26, 24, 22],
                        ['VOSK & SONS', 'RENDERING CO.', '', 'GRADE 6', 'NON-AGRICULTURAL', 'DO NOT LOG'], { size: 13 });
  TEX.POSTER_SAFETY = mkTextTex(64, 128, [186, 180, 156], [30, 28, 26],
                        ['KEEP', 'HANDS', 'CLEAR', 'OF THE', 'LINE'], { size: 16 });
  TEX.SIGN_BREAK    = mkTextTex(128, 64, [72, 76, 84], [212, 214, 210], ['BREAK ROOM'], { size: 20 });
  TEX.SIGN_LOCKER   = mkTextTex(128, 64, [72, 76, 84], [212, 214, 210], ['LOCKERS'], { size: 22 });
  TEX.SIGN_UTIL     = mkTextTex(128, 64, [72, 76, 84], [212, 214, 210], ['UTILITY', 'PUMP HOUSE'], { size: 18 });
  TEX.SIGN_OFFICE   = mkTextTex(128, 64, [72, 76, 84], [212, 214, 210], ['A. VOSK'], { size: 24 });
}
