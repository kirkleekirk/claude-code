// Mipmaps for cut-out textures (leaves, stalks). Plain averaging thins a
// cut-out as it shrinks, until a far-off tree or field dissolves into specks.
// These levels are scaled so the same share of texels passes the alpha test
// at every size, which keeps foliage as full at a distance as it is close up.
import * as THREE from 'three';

// data: RGBA bytes (clear texels should already carry a sensible colour);
// ref: the material's alphaTest. Returns a DataTexture with its own mip chain.
export function cutoutTexture(data, w, h, ref = 0.4, opts = {}) {
  const levels = [{ data, width: w, height: h }];
  const cut = ref * 255;
  const cover = (d, n, k) => { let c = 0; for (let i = 3; i < n * 4; i += 4) if (d[i] * k >= cut) c++; return c / n; };
  const target = cover(data, w * h, 1);
  let src = data, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1), plain = new Uint8Array(dw * dh * 4);
    const fx = sw > 1 ? 2 : 1, fy = sh > 1 ? 2 : 1;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
      for (let j = 0; j < fy; j++) for (let i = 0; i < fx; i++) {
        const s = ((y * fy + j) * sw + x * fx + i) * 4, al = src[s + 3];
        r += src[s] * al; g += src[s + 1] * al; b += src[s + 2] * al; a += al;
        r0 += src[s]; g0 += src[s + 1]; b0 += src[s + 2];
      }
      const d = (y * dw + x) * 4, n = fx * fy;
      // colour weighted by how solid each texel is, so clear ones don't tint it
      if (a > 0) { plain[d] = r / a; plain[d + 1] = g / a; plain[d + 2] = b / a; } else { plain[d] = r0 / n; plain[d + 1] = g0 / n; plain[d + 2] = b0 / n; }
      plain[d + 3] = a / n;
    }
    // the alpha scale that keeps the cut-out as full as the original
    let lo = 0.25, hi = 16;
    for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (cover(plain, dw * dh, mid) < target) lo = mid; else hi = mid; }
    const k = Math.max(1, (lo + hi) / 2), out = plain.slice();
    for (let i = 3; i < out.length; i += 4) out[i] = Math.min(255, out[i] * k);
    levels.push({ data: out, width: dw, height: dh });
    src = plain; sw = dw; sh = dh;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.mipmaps = levels;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.wrapS = opts.repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = opts.anisotropy || 4;
  tex.needsUpdate = true;
  return tex;
}

// A canvas drawn on a clear ground, as cut-out texture data: flipped so v
// runs up the image, with clear texels given the average colour of the solid
// ones (so edges don't pick up a dark fringe).
export function canvasCutout(cv) {
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 200) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
  if (n) { r /= n; g /= n; b /= n; }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 4, a = d[s + 3], k = a / 255;
    out[o] = d[s] * k + r * (1 - k); out[o + 1] = d[s + 1] * k + g * (1 - k); out[o + 2] = d[s + 2] * k + b * (1 - k); out[o + 3] = a;
  }
  return out;
}
