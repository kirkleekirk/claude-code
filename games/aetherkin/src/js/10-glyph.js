/* ============================================================================
   GLYPHS — kin are drawn, not stored as images: a silhouette assembled from
   parametric parts, then filled with the same constellation of nodes and
   hairlines the Growth Lattice is drawn with. A kin looks like its lattice.
   ========================================================================== */
function glyphRng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
/* a tapered limb: quad between two points, w1 wide at the base, w2 at the tip */
function limb(p, x1, y1, x2, y2, w1, w2) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  p.moveTo(x1 + nx * w1, y1 + ny * w1);
  p.lineTo(x2 + nx * w2, y2 + ny * w2);
  p.lineTo(x2 - nx * w2, y2 - ny * w2);
  p.lineTo(x1 - nx * w1, y1 - ny * w1);
  p.closePath();
}
const blob = (p, x, y, rx, ry, rot) => { p.moveTo(x + rx, y); p.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); };

/* Each form returns the silhouette plus where the face and crest belong.
   Coordinates are normalised 0..1 and drawn facing right. */
const FORMS = {
  quad(p, r) {
    const bx = 0.44, by = 0.55;
    for (let i = 0; i < 4; i++) {
      const lx = bx - 0.17 + i * 0.115, sh = 0.02 * r();
      limb(p, lx, by + 0.06, lx + (i > 1 ? 0.02 : -0.02), 0.88 + sh, 0.045, 0.028);
    }
    limb(p, bx - 0.22, by - 0.02, 0.10, 0.30 + 0.06 * r(), 0.05, 0.015);
    blob(p, bx, by, 0.25, 0.16);
    limb(p, bx + 0.16, by - 0.06, 0.68, 0.40, 0.10, 0.08);
    blob(p, 0.73, 0.37, 0.135, 0.115);
    return { face: { x: 0.79, y: 0.35 }, crest: { x: 0.72, y: 0.25, a: -0.35 }, top: 0.2 };
  },
  bulk(p, r) {
    for (let i = 0; i < 4; i++) {
      const lx = 0.36 + i * 0.13;
      limb(p, lx, 0.68, lx + (i > 1 ? 0.015 : -0.015), 0.90, 0.062, 0.05);
    }
    blob(p, 0.5, 0.55, 0.31, 0.22);
    blob(p, 0.36, 0.44, 0.16, 0.12, -0.3);
    limb(p, 0.68, 0.5, 0.80, 0.47, 0.13, 0.11);
    blob(p, 0.79, 0.46, 0.14, 0.13);
    return { face: { x: 0.85, y: 0.44 }, crest: { x: 0.76, y: 0.34, a: -0.2 }, top: 0.3 };
  },
  biped(p, r) {
    limb(p, 0.43, 0.62, 0.40, 0.90, 0.055, 0.04);
    limb(p, 0.57, 0.62, 0.60, 0.90, 0.055, 0.04);
    limb(p, 0.36, 0.42, 0.26, 0.62 + 0.05 * r(), 0.05, 0.03);
    limb(p, 0.64, 0.42, 0.74, 0.62 + 0.05 * r(), 0.05, 0.03);
    blob(p, 0.5, 0.48, 0.17, 0.21);
    blob(p, 0.5, 0.23, 0.135, 0.13);
    return { face: { x: 0.5, y: 0.22 }, crest: { x: 0.5, y: 0.11, a: 0 }, top: 0.06 };
  },
  wisp(p, r) {
    for (let i = 0; i < 3; i++) {
      const x = 0.38 + i * 0.12;
      limb(p, x, 0.55, x + (i - 1) * 0.07, 0.80 + 0.09 * r(), 0.045, 0.012);
    }
    blob(p, 0.5, 0.42, 0.19, 0.235);
    blob(p, 0.5, 0.30, 0.135, 0.12);
    return { face: { x: 0.5, y: 0.32 }, crest: { x: 0.5, y: 0.17, a: 0 }, top: 0.14 };
  },
  serpent(p, r) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = 0.14 + t * 0.62, y = 0.62 - Math.sin(t * 3.1) * 0.24;
      blob(p, x, y, 0.10 - t * 0.028, 0.085 - t * 0.02, Math.sin(t * 3) * 0.6);
    }
    blob(p, 0.80, 0.37, 0.115, 0.10, -0.3);
    return { face: { x: 0.85, y: 0.35 }, crest: { x: 0.74, y: 0.26, a: -0.4 }, top: 0.16 };
  },
  winged(p, r) {
    p.moveTo(0.46, 0.46); p.quadraticCurveTo(0.14, 0.16, 0.06, 0.44); p.quadraticCurveTo(0.20, 0.52, 0.46, 0.60); p.closePath();
    p.moveTo(0.54, 0.46); p.quadraticCurveTo(0.86, 0.16, 0.94, 0.44); p.quadraticCurveTo(0.80, 0.52, 0.54, 0.60); p.closePath();
    limb(p, 0.5, 0.62, 0.5, 0.84, 0.05, 0.02);
    blob(p, 0.5, 0.52, 0.115, 0.165);
    blob(p, 0.5, 0.33, 0.105, 0.10);
    return { face: { x: 0.5, y: 0.32 }, crest: { x: 0.5, y: 0.22, a: 0 }, top: 0.14 };
  },
  insect(p, r) {
    p.moveTo(0.47, 0.42); p.quadraticCurveTo(0.10, 0.18, 0.10, 0.52); p.quadraticCurveTo(0.24, 0.66, 0.47, 0.58); p.closePath();
    p.moveTo(0.53, 0.42); p.quadraticCurveTo(0.90, 0.18, 0.90, 0.52); p.quadraticCurveTo(0.76, 0.66, 0.53, 0.58); p.closePath();
    blob(p, 0.5, 0.66, 0.085, 0.13);
    blob(p, 0.5, 0.48, 0.10, 0.13);
    blob(p, 0.5, 0.31, 0.095, 0.09);
    return { face: { x: 0.5, y: 0.30 }, crest: { x: 0.5, y: 0.21, a: 0 }, top: 0.12 };
  },
  blob(p, r) {
    blob(p, 0.5, 0.60, 0.26, 0.24);
    blob(p, 0.36, 0.50, 0.14, 0.13);
    blob(p, 0.64, 0.52, 0.15, 0.14);
    blob(p, 0.5, 0.40, 0.17, 0.14);
    return { face: { x: 0.5, y: 0.46 }, crest: { x: 0.5, y: 0.26, a: 0 }, top: 0.22 };
  },
};

const CRESTS = {
  flame(ctx, s, c, hue) {
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 0.055 * s, h = (0.13 - Math.abs(i - 1) * 0.035) * s;
      ctx.beginPath();
      ctx.moveTo(c.x + off - 0.022 * s, c.y);
      ctx.quadraticCurveTo(c.x + off, c.y - h * 1.5, c.x + off + 0.018 * s, c.y - h);
      ctx.quadraticCurveTo(c.x + off + 0.006 * s, c.y - h * 0.3, c.x + off + 0.022 * s, c.y);
      ctx.closePath(); ctx.fillStyle = hue; ctx.fill();
    }
  },
  horn(ctx, s, c, hue) {
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c.x + d * 0.02 * s, c.y + 0.02 * s);
      ctx.quadraticCurveTo(c.x + d * 0.10 * s, c.y - 0.05 * s, c.x + d * 0.085 * s, c.y - 0.13 * s);
      ctx.lineTo(c.x + d * 0.045 * s, c.y - 0.02 * s);
      ctx.closePath(); ctx.fillStyle = hue; ctx.fill();
    }
  },
  crystal(ctx, s, c, hue) {
    for (let i = 0; i < 3; i++) {
      const d = (i - 1), h = (0.13 - Math.abs(d) * 0.04) * s;
      ctx.beginPath();
      ctx.moveTo(c.x + d * 0.055 * s, c.y + 0.02 * s);
      ctx.lineTo(c.x + d * 0.055 * s - 0.022 * s, c.y - h * 0.4);
      ctx.lineTo(c.x + d * 0.055 * s, c.y - h);
      ctx.lineTo(c.x + d * 0.055 * s + 0.022 * s, c.y - h * 0.4);
      ctx.closePath(); ctx.fillStyle = hue; ctx.fill();
    }
  },
  fin(ctx, s, c, hue) {
    ctx.beginPath();
    ctx.moveTo(c.x - 0.10 * s, c.y + 0.05 * s);
    ctx.quadraticCurveTo(c.x - 0.02 * s, c.y - 0.14 * s, c.x + 0.09 * s, c.y + 0.01 * s);
    ctx.quadraticCurveTo(c.x, c.y + 0.02 * s, c.x - 0.10 * s, c.y + 0.05 * s);
    ctx.closePath(); ctx.fillStyle = hue; ctx.fill();
  },
  antenna(ctx, s, c, hue) {
    ctx.strokeStyle = hue; ctx.lineWidth = Math.max(1, 0.013 * s); ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c.x + d * 0.02 * s, c.y + 0.03 * s);
      ctx.quadraticCurveTo(c.x + d * 0.10 * s, c.y - 0.06 * s, c.x + d * 0.07 * s, c.y - 0.15 * s);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x + d * 0.07 * s, c.y - 0.15 * s, 0.022 * s, 0, 7); ctx.fillStyle = hue; ctx.fill();
    }
  },
  plume(ctx, s, c, hue) {
    ctx.strokeStyle = hue; ctx.lineWidth = Math.max(1.2, 0.02 * s); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const d = i - 1;
      ctx.beginPath();
      ctx.moveTo(c.x + d * 0.035 * s, c.y + 0.03 * s);
      ctx.quadraticCurveTo(c.x + d * 0.11 * s, c.y - 0.06 * s, c.x + d * 0.13 * s, c.y - 0.15 * s);
      ctx.stroke();
    }
  },
  none() {},
};

function mixHex(a, bcol, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(bcol.substr(i, 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function drawGlyph(canvas, speciesId, opts) {
  const o = opts || {};
  const sp = SPECIES[speciesId];
  if (!sp || !canvas) return;
  const art = sp.art;
  const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const cssW = canvas.clientWidth || o.size || 160, cssH = canvas.clientHeight || o.size || 160;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const s = Math.min(cssW, cssH);
  const r = glyphRng(art.seed || 7);
  const path = new Path2D();
  const unit = new Path2D();
  const meta = FORMS[art.form] ? FORMS[art.form](unit, r) : FORMS.quad(unit, r);
  const m = new DOMMatrix();
  const wScale = (art.w || 1);
  m.a = s * wScale; m.d = s; m.e = (cssW - s * wScale) / 2; m.f = (cssH - s) / 2;
  path.addPath(unit, m);
  const px = v => v * s * wScale + (cssW - s * wScale) / 2;
  const py = v => v * s + (cssH - s) / 2;

  /* rim: the same silhouette, a touch larger, behind */
  ctx.save();
  ctx.translate(cssW / 2, cssH / 2); ctx.scale(1.045, 1.045); ctx.translate(-cssW / 2, -cssH / 2);
  ctx.fillStyle = mixHex(art.a, '#FFFFFF', 0.28);
  ctx.globalAlpha = o.silhouette ? 0.25 : 0.5;
  ctx.fill(path, 'nonzero');
  ctx.restore();

  /* body */
  const g = ctx.createLinearGradient(0, py(meta.top), 0, py(0.95));
  g.addColorStop(0, mixHex(art.a, '#FFFFFF', 0.16));
  g.addColorStop(0.55, art.a);
  g.addColorStop(1, mixHex(art.b, '#0B0E18', 0.45));
  ctx.fillStyle = o.silhouette ? '#0B0E18' : g;
  ctx.fill(path, 'nonzero');

  if (!o.silhouette) {
    /* constellation, clipped inside the body */
    ctx.save();
    ctx.clip(path, 'nonzero');
    const stars = [];
    for (let i = 0; i < 220 && stars.length < (o.dense === false ? 9 : 15); i++) {
      const x = px(0.08 + r() * 0.84), y = py(0.10 + r() * 0.82);
      if (ctx.isPointInPath(path, x * dpr, y * dpr)) stars.push({ x, y });
    }
    ctx.strokeStyle = mixHex(art.b, '#FFFFFF', 0.4);
    ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(0.6, s * 0.004);
    for (let i = 0; i < stars.length; i++) {
      const near = stars.map((q, j) => ({ j, d: Math.hypot(q.x - stars[i].x, q.y - stars[i].y) }))
        .filter(q => q.j !== i).sort((a2, b2) => a2.d - b2.d).slice(0, 2);
      for (const q of near) { ctx.beginPath(); ctx.moveTo(stars[i].x, stars[i].y); ctx.lineTo(stars[q.j].x, stars[q.j].y); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = mixHex(art.b, '#FFFFFF', 0.7);
    for (const st of stars) { ctx.beginPath(); ctx.arc(st.x, st.y, Math.max(0.9, s * 0.008), 0, 7); ctx.fill(); }
    ctx.restore();

    /* crest */
    (CRESTS[art.crest] || CRESTS.none)(ctx, s, { x: px(meta.crest.x), y: py(meta.crest.y) }, mixHex(art.b, '#FFFFFF', 0.2));

    /* eyes */
    const eyes = art.eyes || 2;
    ctx.save();
    ctx.shadowColor = mixHex(art.b, '#FFFFFF', 0.6); ctx.shadowBlur = s * 0.06;
    ctx.fillStyle = '#F6F2E6';
    for (let i = 0; i < eyes; i++) {
      const spread = eyes === 1 ? 0 : (i - (eyes - 1) / 2) * 0.052;
      const ex = px(meta.face.x + (art.form === 'quad' || art.form === 'bulk' || art.form === 'serpent' ? 0 : spread));
      const ey = py(meta.face.y + (art.form === 'quad' || art.form === 'bulk' || art.form === 'serpent' ? spread * 0.8 : 0));
      ctx.beginPath(); ctx.arc(ex, ey, s * 0.019, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* a canvas that redraws itself when the layout changes */
function glyphEl(speciesId, size, opts) {
  const c = el('canvas.glyph' + (opts && opts.flip ? '.flip' : ''), { width: size, height: size, style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
  requestAnimationFrame(() => drawGlyph(c, speciesId, opts));
  c._species = speciesId; c._opts = opts;
  return c;
}
