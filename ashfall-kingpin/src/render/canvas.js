// Canvas helpers (browser only).

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c) {
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return x;
}

// Pick an integer zoom in [2, 4] that keeps ~640x360 logical pixels visible.
export function pickScale(w, h) {
  const s = Math.floor(Math.min(w / 600, h / 330));
  return Math.max(2, Math.min(4, s || 2));
}

export function outlineSprite(src, color) {
  const w = src.width + 2, h = src.height + 2;
  const out = createCanvas(w, h);
  const c = ctx2d(out);
  const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  const od = c.createImageData(w, h);
  const [r, g, b] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  const opaque = (x, y) => x >= 0 && y >= 0 && x < src.width && y < src.height && sd[(y * src.width + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (opaque(x - 1, y - 1)) {
      const s = ((y - 1) * src.width + (x - 1)) * 4;
      od.data[o] = sd[s]; od.data[o + 1] = sd[s + 1]; od.data[o + 2] = sd[s + 2]; od.data[o + 3] = 255;
    } else if (opaque(x - 2, y - 1) || opaque(x, y - 1) || opaque(x - 1, y - 2) || opaque(x - 1, y)) {
      od.data[o] = r; od.data[o + 1] = g; od.data[o + 2] = b; od.data[o + 3] = 255;
    }
  }
  c.putImageData(od, 0, 0);
  return out;
}
