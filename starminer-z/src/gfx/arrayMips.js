// Texture arrays' smaller copies (mipmaps), made here on the CPU rather than by the GPU: an
// Xbox's GPU makes every layer's from the first, so faraway blocks all look like grass (and
// faraway avatars wear the first layer's clothes). Averaged in linear light for an sRGB texture,
// as a GPU does; alpha (coverage) averaged as it is.
//
// three uploads only a texture array's first level, so the rest go up from its onUpdate, which
// three calls after every upload (after the graphics are lost and come back, too).

let renderer = null;

// the renderer the levels go up through (set once it's made)
export function setMipRenderer(r) { renderer = r; }

const TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; TO_LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const toSrgb = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));

// every level below the first, down to 1 x 1: [{ data, width, height, depth }], the first included
function mipChain(data, width, height, depth, srgb) {
  const out = [{ data, width, height, depth }];
  let src = data, w = width, h = height;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), dst = new Uint8Array(nw * nh * 4 * depth);
    for (let l = 0; l < depth; l++) {
      const s0 = l * w * h * 4, d0 = l * nw * nh * 4;
      for (let y = 0; y < nh; y++) {
        const y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
        for (let x = 0; x < nw; x++) {
          const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1);
          const a = s0 + (y0 * w + x0) * 4, b = s0 + (y0 * w + x1) * 4, c = s0 + (y1 * w + x0) * 4, d = s0 + (y1 * w + x1) * 4;
          const o = d0 + (y * nw + x) * 4;
          for (let k = 0; k < 3; k++) {
            dst[o + k] = srgb ? toSrgb((TO_LIN[src[a + k]] + TO_LIN[src[b + k]] + TO_LIN[src[c + k]] + TO_LIN[src[d + k]]) / 4)
              : (src[a + k] + src[b + k] + src[c + k] + src[d + k] + 2) >> 2;
          }
          dst[o + 3] = (src[a + 3] + src[b + 3] + src[c + 3] + src[d + 3] + 2) >> 2;
        }
      }
    }
    out.push({ data: dst, width: nw, height: nh, depth });
    src = dst; w = nw; h = nh;
  }
  return out;
}

function upload(tex) {
  if (!renderer) return;
  const gl = renderer.getContext(), p = renderer.properties.get(tex);
  if (!p.__webglTexture) return;
  renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, p.__webglTexture);
  for (let i = 1; i < tex.mipmaps.length; i++) {
    const m = tex.mipmaps[i];
    renderer.state.texSubImage3D(gl.TEXTURE_2D_ARRAY, i, 0, 0, 0, m.width, m.height, m.depth, gl.RGBA, gl.UNSIGNED_BYTE, m.data);
  }
}

// An RGBA8 DataArrayTexture, mipmapped from here (srgb: its colours are sRGB)
export function cpuMips(tex, { srgb = true } = {}) {
  const { data, width, height, depth } = tex.image;
  tex.generateMipmaps = false;
  tex.mipmaps = mipChain(data, width, height, depth, srgb);
  tex.onUpdate = upload;
  return tex;
}
