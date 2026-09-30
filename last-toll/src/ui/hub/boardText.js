// Text for the corkboards (canvas): every line is fitted to the paper it's written on.
// font(size) returns a CSS font string for a size in px.

// One line in at most maxW: the font shrinks down to minSize, and past that the line
// is squeezed sideways rather than running off the paper. Honours the current textAlign.
export function fitLine(g, text, x, y, maxW, font, size, minSize = Math.round(size * 0.75)) {
  let s = size;
  g.font = font(s);
  while (s > minSize && g.measureText(text).width > maxW) g.font = font(--s);
  const w = g.measureText(text).width;
  if (w <= maxW) { g.fillText(text, x, y); return s; }
  g.save();
  g.translate(x, y);
  g.scale(maxW / w, 1);
  g.fillText(text, 0, 0);
  g.restore();
  return s;
}

// Break text into lines no wider than maxW with the current font.
export function wrapLines(g, text, maxW) {
  const out = [];
  let line = '';
  for (const w of String(text).split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (line && g.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// Lay text out in a box maxW wide and maxH tall (textBaseline 'top'), shrinking the font
// until it all fits. Returns { lines, size, lh, height } without drawing when draw is false.
export function wrapBox(g, text, x, y, maxW, maxH, font, size, minSize = Math.round(size * 0.75), { lead = 1.2, draw = true } = {}) {
  let s = size, lines, lh;
  for (;;) {
    g.font = font(s);
    lines = wrapLines(g, text, maxW);
    lh = Math.round(s * lead);
    if (lines.length * lh <= maxH || s <= minSize) break;
    s--;
  }
  if (draw) lines.forEach((l, i) => fitLine(g, l, x, y + i * lh, maxW, font, s, s));
  return { lines, size: s, lh, height: lines.length * lh };
}
