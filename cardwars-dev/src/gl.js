/* GL */
// Tiny WebGL 1 toolkit: column-major matrix math, shader programs, static/dynamic buffers, canvas textures,
// render targets, and a resource registry so everything can be rebuilt after a lost context (mobile).
var GL3 = (function () {
'use strict';

// ------------------------------------------------------------------ math
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  copy(o, a) { o.set(a); return o; },
  mul(o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  },
  lookAt(o, e, t, up) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    o[15] = 1;
    return o;
  },
  invert(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  // translation * rotY * rotX * rotZ * scale
  trs(o, x, y, z, ry, rx, rz, sx, sy, sz) {
    const cy = Math.cos(ry || 0), syy = Math.sin(ry || 0), cx = Math.cos(rx || 0), sxx = Math.sin(rx || 0), cz = Math.cos(rz || 0), szz = Math.sin(rz || 0);
    // R = Ry * Rx * Rz
    const r00 = cy * cz + syy * sxx * szz, r01 = cx * szz, r02 = -syy * cz + cy * sxx * szz;
    const r10 = -cy * szz + syy * sxx * cz, r11 = cx * cz, r12 = syy * szz + cy * sxx * cz;
    const r20 = syy * cx, r21 = -sxx, r22 = cy * cx;
    sx = sx == null ? 1 : sx; sy = sy == null ? sx : sy; sz = sz == null ? sx : sz;
    o[0] = r00 * sx; o[1] = r01 * sx; o[2] = r02 * sx; o[3] = 0;
    o[4] = r10 * sy; o[5] = r11 * sy; o[6] = r12 * sy; o[7] = 0;
    o[8] = r20 * sz; o[9] = r21 * sz; o[10] = r22 * sz; o[11] = 0;
    o[12] = x; o[13] = y; o[14] = z; o[15] = 1;
    return o;
  },
  apply(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
  },
  applyDir(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; },
  // rotation about an arbitrary pivot (for bones): T(p) * R * T(-p)
  pivotRot(o, px, py, pz, rx, ry, rz) {
    M4.trs(o, 0, 0, 0, ry, rx, rz, 1, 1, 1);
    const x = o[0] * px + o[4] * py + o[8] * pz, y = o[1] * px + o[5] * py + o[9] * pz, z = o[2] * px + o[6] * py + o[10] * pz;
    o[12] = px - x; o[13] = py - y; o[14] = pz - z;
    return o;
  }
};
function hexRGB(h) {
  if (Array.isArray(h)) return h;
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function mixRGB(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ------------------------------------------------------------------ GL context & resources
function createContext(canvas) {
  const opts = { antialias: true, alpha: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  let gl = null;
  try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
  if (!gl) return null;
  const ctx = { gl, canvas, res: [], lost: false, programs: {} };
  return ctx;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('Shader compile failed: ' + log);
  }
  return s;
}
// A program with named attributes (bound to fixed locations in order) and auto-discovered uniforms.
function program(ctx, name, vs, fs, attribs) {
  const r = { kind: 'program', name, vs, fs, attribs, p: null, u: {}, a: {} };
  build(ctx, r);
  ctx.programs[name] = r;
  ctx.res.push(r);
  return r;
}
function buildProgram(ctx, r) {
  const gl = ctx.gl;
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, r.vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, r.fs));
  r.attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a.name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
  r.p = p; r.u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i); if (!info) continue;
    const nm = info.name.replace(/\[0\]$/, '');
    r.u[nm] = gl.getUniformLocation(p, info.name);
  }
  let stride = 0; for (const a of r.attribs) stride += a.size;
  r.stride = stride * 4;
  let off = 0; r.offs = r.attribs.map(a => { const o = off; off += a.size * 4; return o; });
}

// Static vertex buffer (Float32 interleaved). Keeps the CPU copy for context restore.
function buffer(ctx, data, dynamic) {
  const r = { kind: 'buffer', data, dynamic: !!dynamic, b: null, bytes: data ? data.byteLength : 0 };
  build(ctx, r);
  ctx.res.push(r);
  return r;
}
function buildBuffer(ctx, r) {
  const gl = ctx.gl;
  r.b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, r.b);
  if (r.data) gl.bufferData(gl.ARRAY_BUFFER, r.data, r.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
}
function updateBuffer(ctx, r, data, count) {
  const gl = ctx.gl;
  r.data = data;
  gl.bindBuffer(gl.ARRAY_BUFFER, r.b);
  if (data.byteLength > r.bytes) { gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); r.bytes = data.byteLength; }
  else gl.bufferSubData(gl.ARRAY_BUFFER, 0, count != null ? data.subarray(0, count) : data);
}
function freeBuffer(ctx, r) {
  if (!r) return;
  const i = ctx.res.indexOf(r); if (i >= 0) ctx.res.splice(i, 1);
  if (r.b && !ctx.lost) ctx.gl.deleteBuffer(r.b);
  r.b = null; r.data = null;
}

// Texture from a canvas (or a function that draws one, so it can be regenerated after a lost context).
function texture(ctx, src, opts) {
  const r = { kind: 'texture', src, opts: opts || {}, t: null, w: 0, h: 0 };
  build(ctx, r);
  ctx.res.push(r);
  return r;
}
function buildTexture(ctx, r) {
  const gl = ctx.gl;
  const cv = typeof r.src === 'function' ? r.src() : r.src;
  r.t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, r.t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  r.w = cv.width; r.h = cv.height;
  const pot = (r.w & (r.w - 1)) === 0 && (r.h & (r.h - 1)) === 0;
  const rep = r.opts.repeat && pot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rep);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, rep);
  if (pot && r.opts.mip !== false) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}
function freeTexture(ctx, r) {
  if (!r) return;
  const i = ctx.res.indexOf(r); if (i >= 0) ctx.res.splice(i, 1);
  if (r.t && !ctx.lost) ctx.gl.deleteTexture(r.t);
  r.t = null;
}

// Offscreen render target with a depth buffer (card art portraits).
function target(ctx, w, h) {
  const r = { kind: 'target', w, h, fb: null, t: null, rb: null };
  build(ctx, r);
  ctx.res.push(r);
  return r;
}
function buildTarget(ctx, r) {
  const gl = ctx.gl;
  r.t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, r.t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, r.w, r.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  r.rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, r.rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, r.w, r.h);
  r.fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, r.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.t, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, r.rb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function build(ctx, r) {
  if (ctx.lost) return;
  if (r.kind === 'program') buildProgram(ctx, r);
  else if (r.kind === 'buffer') buildBuffer(ctx, r);
  else if (r.kind === 'texture') buildTexture(ctx, r);
  else if (r.kind === 'target') buildTarget(ctx, r);
}
// After 'webglcontextrestored': rebuild every registered resource from its CPU-side source.
function restore(ctx) {
  ctx.lost = false;
  for (const r of ctx.res) {
    try { build(ctx, r); } catch (e) { /* keep going: a broken resource just won't draw */ }
  }
}

// Bind a program's attributes to an interleaved buffer.
let curProg = null, curBuf = null, enabled = 0;
function use(ctx, prog) {
  const gl = ctx.gl;
  if (curProg !== prog) { gl.useProgram(prog.p); curProg = prog; curBuf = null; }
}
function attribs(ctx, prog, buf) {
  if (curBuf === buf && curProg === prog) return;
  const gl = ctx.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
  prog.attribs.forEach((a, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, a.size, gl.FLOAT, false, prog.stride, prog.offs[i]); });
  for (let i = prog.attribs.length; i < enabled; i++) gl.disableVertexAttribArray(i);
  enabled = prog.attribs.length;
  curBuf = buf;
}
function resetBindings() { curProg = null; curBuf = null; enabled = 8; }

return { M4, hexRGB, mixRGB, createContext, program, buffer, updateBuffer, freeBuffer, texture, freeTexture, target, restore, use, attribs, resetBindings };
})();
/* END GL */
