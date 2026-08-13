/* BUNKER '86 — isometric renderer: camera, line of sight, light pools, CRT. */
(function (BK) {
  'use strict';

  const TW = BK.TW, TH = BK.TH;
  const HW = TW / 2, HH = TH / 2;

  const R = BK.Render = {
    canvas: null, ctx: null,
    dark: null, dctx: null,       // half-res darkness/fog buffer
    grain: [], grainIdx: 0,
    cam: { x: 18, y: 16, zoom: 1 },
    w: 0, h: 0, dpr: 1,
    shakeT: 0, shakeMag: 0,
    flash: 0,
    _vis: null, _visMap: null
  };

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.dark = document.createElement('canvas');
    R.dctx = R.dark.getContext('2d');
    for (let i = 0; i < 4; i++) R.grain.push(makeGrain(128, 128, i));
    R.resize();
    window.addEventListener('resize', R.resize);
    window.addEventListener('orientationchange', () => setTimeout(R.resize, 120));
  };

  R.resize = function () {
    const c = R.canvas;
    const rect = c.parentElement.getBoundingClientRect();
    R.dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.w = Math.max(1, Math.floor(rect.width));
    R.h = Math.max(1, Math.floor(rect.height));
    c.width = Math.floor(R.w * R.dpr);
    c.height = Math.floor(R.h * R.dpr);
    c.style.width = R.w + 'px';
    c.style.height = R.h + 'px';
    R.dark.width = Math.max(1, Math.floor(R.w * 0.5));
    R.dark.height = Math.max(1, Math.floor(R.h * 0.5));
    R.ctx.imageSmoothingEnabled = false;
    // Phones get a tighter view so figures read at arm's length.
    R.baseZoom = BK.clamp(R.w / 380, 0.9, 1.8);
  };

  function makeGrain(w, h, seed) {
    const rng = BK.rng(1234 + seed * 77);
    return BK.mk(w, h, (g) => {
      const img = g.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = rng() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 22;
      }
      g.putImageData(img, 0, 0);
    });
  }

  // ------------------------------------------------------------ projection --
  R.worldToScreen = function (wx, wy) {
    const z = R.cam.zoom;
    return {
      x: (wx - wy) * HW * z + R.w / 2 - (R.cam.x - R.cam.y) * HW * z,
      y: (wx + wy) * HH * z + R.h / 2 - (R.cam.x + R.cam.y) * HH * z
    };
  };

  R.screenToWorld = function (px, py) {
    const z = R.cam.zoom;
    const dx = (px - R.w / 2) / z + (R.cam.x - R.cam.y) * HW;
    const dy = (py - R.h / 2) / z + (R.cam.x + R.cam.y) * HH;
    return { x: (dx / HW + dy / HH) / 2, y: (dy / HH - dx / HW) / 2 };
  };

  // ------------------------------------------------------ field of view -----
  // Recursive shadowcasting, 8 octants. Fills a Uint8Array of visible tiles.
  const OCT = [
    [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
    [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]
  ];

  function castLight(map, out, cx, cy, row, start, end, radius, xx, xy, yx, yy) {
    if (start < end) return;
    const r2 = radius * radius;
    let newStart = start;
    for (let i = row; i <= radius; i++) {
      let blocked = false;
      for (let dx = -i, dy = -i; dx <= 0; dx++) {
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        const X = cx + dx * xx + dy * xy;
        const Y = cy + dx * yx + dy * yy;
        if (!BK.inBounds(map, X, Y)) { if (!blocked) { /* keep scanning */ } continue; }
        const k = Y * map.w + X;
        if (dx * dx + dy * dy <= r2) out[k] = 1;
        const solid = map.opaque[k] === 1;
        if (blocked) {
          if (solid) { newStart = rSlope; continue; }
          blocked = false; start = newStart;
        } else if (solid && i < radius) {
          blocked = true;
          castLight(map, out, cx, cy, i + 1, start, lSlope, radius, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  }

  R.computeFOV = function (map, cx, cy, radius) {
    if (!R._vis || R._visMap !== map || R._vis.length !== map.w * map.h) {
      R._vis = new Uint8Array(map.w * map.h);
      R._visMap = map;
    }
    const out = R._vis;
    out.fill(0);
    cx = Math.floor(cx); cy = Math.floor(cy);
    if (BK.inBounds(map, cx, cy)) out[cy * map.w + cx] = 1;
    for (const o of OCT) castLight(map, out, cx, cy, 1, 1.0, 0.0, radius, o[0], o[1], o[2], o[3]);
    // Remember what we have seen, and decay current visibility for smooth fades.
    for (let i = 0; i < out.length; i++) {
      if (out[i]) { map.seen[i] = 1; map.vis[i] = Math.min(1, map.vis[i] + 0.35); }
      else map.vis[i] = Math.max(0, map.vis[i] - 0.12);
    }
    return out;
  };

  // ----------------------------------------------------------- main draw ----
  R.draw = function (S, dt) {
    const ctx = R.ctx, map = S.map;
    ctx.save();
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);

    // camera follow + shake
    const p = S.player;
    R.cam.zoom = R.baseZoom * (S.zoom || 1);
    R.cam.x = BK.lerp(R.cam.x, p.x, Math.min(1, dt * 6));
    R.cam.y = BK.lerp(R.cam.y, p.y, Math.min(1, dt * 6));
    let shx = 0, shy = 0;
    if (R.shakeT > 0) {
      R.shakeT -= dt;
      const m = R.shakeMag * Math.max(0, R.shakeT);
      shx = (Math.random() - 0.5) * m * 20; shy = (Math.random() - 0.5) * m * 20;
    }
    ctx.translate(shx, shy);

    // sky / void
    const amb = S.ambientLevel;
    ctx.fillStyle = map.outdoor ? mixSky(amb, S.time.minutes) : '#04070b';
    ctx.fillRect(-20, -20, R.w + 40, R.h + 40);

    // visible tile window
    const c0 = R.screenToWorld(-TW, -TH * 2), c1 = R.screenToWorld(R.w + TW, -TH * 2);
    const c2 = R.screenToWorld(-TW, R.h + TH * 4), c3 = R.screenToWorld(R.w + TW, R.h + TH * 4);
    const minX = Math.max(0, Math.floor(Math.min(c0.x, c1.x, c2.x, c3.x)) - 1);
    const maxX = Math.min(map.w - 1, Math.ceil(Math.max(c0.x, c1.x, c2.x, c3.x)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(c0.y, c1.y, c2.y, c3.y)) - 1);
    const maxY = Math.min(map.h - 1, Math.ceil(Math.max(c0.y, c1.y, c2.y, c3.y)) + 1);

    const z = R.cam.zoom;

    // ---- floors ----
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = y * map.w + x;
        if (!map.seen[k]) continue;
        const f = map.floor[k];
        if (!f) continue;
        const s = R.worldToScreen(x, y);
        const art = BK.floorArt(f, (x * 7 + y * 13) % 3);
        ctx.drawImage(art, s.x - HW * z, s.y - HH * z, TW * z, TH * z);
      }
    }

    // ---- depth-sorted: walls, props, entities ----
    const list = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = y * map.w + x;
        if (!map.seen[k]) continue;
        const w = map.wall[k];
        if (w) list.push({ d: x + y, sx: x, sy: y, kind: 'wall', t: w });
      }
    }
    for (const pr of map.props) {
      const ex = pr.x + (pr.w || 1) - 1, ey = pr.y + (pr.h || 1) - 1;
      if (ex < minX - 2 || pr.x > maxX + 2 || ey < minY - 2 || pr.y > maxY + 2) continue;
      if (!map.seen[pr.y * map.w + pr.x]) continue;
      list.push({ d: ex + ey + 0.05, sx: pr.x + ((pr.w || 1) - 1) / 2, sy: pr.y + ((pr.h || 1) - 1) / 2, kind: 'prop', p: pr });
    }
    const deferred = [];
    for (const e of S.entities) {
      if (e.map !== map.id || !e.alive) continue;
      if (e.x < minX - 3 || e.x > maxX + 3 || e.y < minY - 3 || e.y > maxY + 3) continue;
      // The watcher is drawn after the lighting pass — it is a hole in the
      // world, not a thing the world's lights fall on.
      if (e.kind === 'watcher') { deferred.push(e); continue; }
      list.push({ d: e.x + e.y + 0.1, sx: e.x, sy: e.y, kind: 'ent', e: e });
    }
    list.sort((a, b) => a.d - b.d || a.sy - b.sy);

    for (const it of list) {
      if (it.kind === 'wall') {
        const s = R.worldToScreen(it.sx, it.sy);
        const art = BK.wallArt(it.t, (it.sx * 3 + it.sy * 5) % 2);
        ctx.drawImage(art, s.x - HW * z, s.y - HH * z - (art.height - TH) * z, art.width * z, art.height * z);
      } else if (it.kind === 'prop') {
        drawProp(ctx, it.p, z, S);
      } else {
        drawEntity(ctx, it.e, z, S);
      }
    }

    // ---- darkness + fog ----
    drawDarkness(S, map, minX, maxX, minY, maxY);
    ctx.drawImage(R.dark, 0, 0, R.w, R.h);

    // ---- coloured glows punch back through ----
    ctx.globalCompositeOperation = 'lighter';
    for (const L of S.lights) {
      if (!L.color) continue;
      const s = R.worldToScreen(L.x, L.y);
      const rad = L.r * TW * 0.5 * z;
      if (s.x < -rad || s.x > R.w + rad || s.y < -rad || s.y > R.h + rad) continue;
      const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
      gr.addColorStop(0, hexA(L.color, 0.30 * (L.intensity || 1)));
      gr.addColorStop(0.5, hexA(L.color, 0.10 * (L.intensity || 1)));
      gr.addColorStop(1, hexA(L.color, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(s.x - rad, s.y - rad, rad * 2, rad * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // ---- the watcher, on top of the light ----
    for (const e of deferred) {
      const k = Math.floor(e.y) * map.w + Math.floor(e.x);
      if (!BK.inBounds(map, Math.floor(e.x), Math.floor(e.y))) continue;
      if (map.vis[k] < 0.25) continue;         // needs line of sight, not light
      drawEntity(ctx, e, z, S);
    }

    // ---- interaction highlight ----
    if (S.focusProp) {
      const pr = S.focusProp;
      const s = R.worldToScreen(pr.x + ((pr.w || 1) - 1) / 2, pr.y + ((pr.h || 1) - 1) / 2);
      ctx.save();
      ctx.strokeStyle = 'rgba(126,232,255,.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -(S.tSec * 14) % 9;
      const hw = TW * z * (pr.w || 1) * 1.06, hh = TH * z * (pr.h || 1) * 1.06;
      BK.diamond(ctx, s.x - hw / 2, s.y - hh / 2, hw, hh);
      ctx.stroke();
      ctx.restore();
    }

    // ---- build-mode ghost ----
    if (S.buildGhost) drawGhost(ctx, S, z);

    ctx.restore();

    // ---- post ----
    postFX(S, dt);
  };

  function mixSky(amb, minutes) {
    // Sky colour by hour: sodium dusk → dead-television night → sick dawn.
    const h = (minutes / 60) % 24;
    let c;
    if (h < 5) c = [8, 10, 18];
    else if (h < 7) c = [40, 30, 38];
    else if (h < 10) c = [58, 56, 58];
    else if (h < 17) c = [70, 68, 66];
    else if (h < 19) c = [72, 48, 40];
    else if (h < 21) c = [30, 26, 38];
    else c = [10, 12, 20];
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function drawProp(ctx, pr, z, S) {
    let sprite = pr.sprite;
    if (pr.kind === 'door') sprite = pr.open ? 'dooropen' : 'door';
    if (pr.kind === 'furniture') sprite = BK.OBJECTS[pr.type] ? BK.OBJECTS[pr.type].sprite : 'crate';
    const art = BK.propArt(sprite);
    const cx = pr.x + ((pr.w || 1) - 1) / 2, cy = pr.y + ((pr.h || 1) - 1) / 2;
    const s = R.worldToScreen(cx, cy);
    ctx.save();
    if (pr.looted) ctx.globalAlpha = 0.72;
    if (pr.broken) { ctx.globalAlpha = 0.85; ctx.filter = 'grayscale(1)'; }
    ctx.drawImage(art, s.x - HW * z, s.y - HH * z - (art.height - TH) * z, art.width * z, art.height * z);
    ctx.restore();
    // unlooted containers wear a faint tag so they read at a glance
    if (pr.kind === 'container' && !pr.looted && S.map.vis[pr.y * S.map.w + pr.x] > 0.3) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(S.tSec * 3) * 0.15;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(s.x - 2, s.y - TH * z - 10, 3, 3);
      ctx.restore();
    }
  }

  function drawEntity(ctx, e, z, S) {
    const s = R.worldToScreen(e.x, e.y);
    const scale = z * (e.scale || 1);
    if (e.kind === 'watcher') {
      const art = BK.watcherArt || (BK.watcherArt = BK.makeWatcher());
      const w = art.width * scale, h = art.height * scale;
      const x0 = s.x - w / 2, y0 = s.y - h + TH * 0.5 * scale;
      ctx.save();
      ctx.globalAlpha = BK.clamp(e.opacity === undefined ? 1 : e.opacity, 0, 1);
      // it drinks the light around itself before you see the shape
      const gr = ctx.createRadialGradient(s.x, s.y - h * 0.45, 0, s.x, s.y - h * 0.45, h * 0.85);
      gr.addColorStop(0, 'rgba(0,0,0,.72)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(s.x - h, s.y - h * 1.3, h * 2, h * 1.8);
      ctx.drawImage(art, x0, y0, w, h);
      ctx.restore();
      return;
    }
    if (!e.look) return;
    if (!e.sheet) e.sheet = BK.makeCharSheet(e.look);
    // dir/frame come from the sim and must never index off the sheet
    const dir = (e.dir | 0) & 3, frame = (e.frame | 0) & 3;
    const art = e.sheet[dir][frame];
    ctx.save();
    if (e.hallucination) ctx.globalAlpha = 0.55 + Math.sin(S.tSec * 9) * 0.12;
    ctx.drawImage(art, s.x - BK.CH_W / 2 * scale, s.y - BK.CH_H * scale + TH * 0.55 * scale, BK.CH_W * scale, BK.CH_H * scale);

    // active-survivor marker
    if (e === S.player) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#63f7c1';
      const by = s.y - BK.CH_H * scale - 6 + Math.sin(S.tSec * 3) * 2;
      ctx.beginPath();
      ctx.moveTo(s.x, by + 7); ctx.lineTo(s.x - 5, by); ctx.lineTo(s.x + 5, by);
      ctx.closePath(); ctx.fill();
    }
    // status pip: what they are doing
    if (e.actIcon) {
      ctx.globalAlpha = 0.95;
      ctx.font = Math.round(13 * z) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(e.actIcon, s.x, s.y - BK.CH_H * scale - 10);
    }
    ctx.restore();
  }

  function drawGhost(ctx, S, z) {
    const g = S.buildGhost;
    const def = BK.OBJECTS[g.type];
    const art = BK.propArt(def.sprite);
    const cx = g.x + (def.w - 1) / 2, cy = g.y + (def.h - 1) / 2;
    const s = R.worldToScreen(cx, cy);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(art, s.x - HW * z, s.y - HH * z - (art.height - TH) * z, art.width * z, art.height * z);
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.strokeStyle = g.valid ? '#63f7c1' : '#ff3ea5';
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const t = R.worldToScreen(g.x + dx, g.y + dy);
        BK.diamond(ctx, t.x - HW * z, t.y - HH * z, TW * z, TH * z);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --------------------------------------------------------- darkness ------
  function drawDarkness(S, map, minX, maxX, minY, maxY) {
    const d = R.dctx, DW = R.dark.width, DH = R.dark.height;
    const sc = 0.5;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.clearRect(0, 0, DW, DH);

    // base darkness for the current ambient level
    const darkness = BK.clamp(1 - S.ambientLevel, 0, 1);
    d.fillStyle = 'rgba(2,4,8,' + darkness.toFixed(3) + ')';
    d.fillRect(0, 0, DW, DH);

    // carve light pools
    d.globalCompositeOperation = 'destination-out';
    const z = R.cam.zoom;
    for (const L of S.lights) {
      const s = R.worldToScreen(L.x, L.y);
      const rad = L.r * TW * 0.5 * z * sc;
      const px = s.x * sc, py = s.y * sc;
      if (px < -rad || px > DW + rad || py < -rad || py > DH + rad) continue;
      if (L.cone) {
        drawCone(d, px, py, rad, L.angle, L.cone, L.intensity || 1);
      } else {
        const gr = d.createRadialGradient(px, py, 0, px, py, rad);
        const inten = L.intensity === undefined ? 1 : L.intensity;
        gr.addColorStop(0, 'rgba(0,0,0,' + (0.98 * inten) + ')');
        gr.addColorStop(0.45, 'rgba(0,0,0,' + (0.62 * inten) + ')');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gr;
        d.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
    }
    d.globalCompositeOperation = 'source-over';

    // fog of war: unseen is solid, remembered is dim, regardless of light
    const zz = R.cam.zoom * sc;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = y * map.w + x;
        const v = map.vis[k];
        if (v >= 0.98) continue;
        const seen = map.seen[k];
        const a = seen ? (1 - v) * 0.78 : 1;
        if (a <= 0.02) continue;
        const s = R.worldToScreen(x, y);
        d.fillStyle = 'rgba(2,4,8,' + a.toFixed(3) + ')';
        // slightly oversized diamonds so neighbours knit together without seams
        BK.diamond(d, s.x * sc - HW * zz * 1.06, s.y * sc - HH * zz * 1.3, TW * zz * 1.12, TH * zz * 2.0);
        d.fill();
      }
    }
  }

  function drawCone(d, px, py, rad, angle, spread, intensity) {
    const gr = d.createRadialGradient(px, py, 0, px, py, rad);
    gr.addColorStop(0, 'rgba(0,0,0,' + 0.98 * intensity + ')');
    gr.addColorStop(0.55, 'rgba(0,0,0,' + 0.7 * intensity + ')');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    d.save();
    d.beginPath();
    d.moveTo(px, py);
    d.arc(px, py, rad, angle - spread / 2, angle + spread / 2);
    d.closePath();
    d.clip();
    d.fillStyle = gr;
    d.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    d.restore();
    // a small always-on pool at the feet
    const g2 = d.createRadialGradient(px, py, 0, px, py, rad * 0.22);
    g2.addColorStop(0, 'rgba(0,0,0,' + 0.9 * intensity + ')');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g2;
    d.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  // ---------------------------------------------------------------- FX -----
  function postFX(S, dt) {
    const ctx = R.ctx;
    ctx.save();
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);

    const dread = S.dread || 0;              // 0..100
    const strain = S.player ? (1 - S.player.sanity / 100) : 0;
    const bright = BK.clamp(S.ambientLevel || 0, 0, 1);   // daylight relaxes the frame

    // chromatic bleed as sanity goes
    if (strain > 0.35) {
      const off = (strain - 0.35) * 6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.13 * strain;
      ctx.drawImage(R.canvas, -off, 0, R.w, R.h);
      ctx.drawImage(R.canvas, off, 0, R.w, R.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // grain
    R.grainIdx = (R.grainIdx + 1) % (R.grain.length * 3);
    const gi = Math.floor(R.grainIdx / 3);
    ctx.globalAlpha = (0.10 + strain * 0.18 + dread / 900) * (1 - bright * 0.45);
    const pat = ctx.createPattern(R.grain[gi], 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, R.w, R.h);
    ctx.globalAlpha = 1;

    // static tear when something is very wrong
    if (S.staticBurst > 0) {
      const rows = 6;
      for (let i = 0; i < rows; i++) {
        const y = Math.random() * R.h, h = 2 + Math.random() * 14;
        ctx.globalAlpha = 0.25 * S.staticBurst;
        ctx.drawImage(R.canvas, 0, y, R.w, h, (Math.random() - 0.5) * 40, y, R.w, h);
      }
      ctx.globalAlpha = 1;
    }

    // scanlines
    if (!R.scan || R.scanH !== R.h) {
      R.scanH = R.h;
      R.scan = BK.mk(4, 4, (g) => {
        g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(0, 0, 4, 2);
        g.fillStyle = 'rgba(255,255,255,.02)'; g.fillRect(0, 2, 4, 1);
      });
    }
    if (S.crt !== false) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = ctx.createPattern(R.scan, 'repeat');
      ctx.fillRect(0, 0, R.w, R.h);
      ctx.globalAlpha = 1;
    }

    // vignette, breathing harder as dread rises
    const pulse = 1 + Math.sin(S.tSec * (1.2 + dread / 60)) * (0.02 + dread / 1400);
    const vr = Math.max(R.w, R.h) * 0.78 * pulse;
    const vg = ctx.createRadialGradient(R.w / 2, R.h / 2, vr * 0.32, R.w / 2, R.h / 2, vr);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,' + ((0.66 + dread / 320) * (1 - bright * 0.55)).toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, R.w, R.h);

    // dread wash — the colour drains toward sick green as it closes in
    if (dread > 30) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = (dread - 30) / 260;
      ctx.fillStyle = '#5f8f7a';
      ctx.fillRect(0, 0, R.w, R.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // full-screen flash (lightning, floodlights, the bad moments)
    if (R.flash > 0) {
      R.flash = Math.max(0, R.flash - dt * 3);
      ctx.globalAlpha = R.flash;
      ctx.fillStyle = '#dff4ff';
      ctx.fillRect(0, 0, R.w, R.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  R.shake = function (mag, time) { R.shakeMag = mag; R.shakeT = time || 0.4; };
  R.doFlash = function (a) { R.flash = a === undefined ? 0.8 : a; };
})(window.BK = window.BK || {});
