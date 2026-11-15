// 3D math for the WebGL renderer. World space: X = east (ground x), Y = up, Z = south (ground y).
// mat4 = column-major Float32Array(16) for uniforms; affine = row-major [3x4] plain array for instances.

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function ortho(l, r, b, t, n, f) {
  const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
  return new Float32Array([-2 * lr, 0, 0, 0, 0, -2 * bt, 0, 0, 0, 0, 2 * nf, 0, (l + r) * lr, (t + b) * bt, (f + n) * nf, 1]);
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const v3 = { norm, cross, dot };

export function lookAt(eye, center, up) {
  const z = norm([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

export function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

export function xform4(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
}

// ---------- affine 3x4 (row-major): [m00 m01 m02 tx | m10 m11 m12 ty | m20 m21 m22 tz] ----------
export const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export function affMul(a, b) {
  return [
    a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
    a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
    a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
  ];
}
export const affT = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
export function affRotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; }
export function affRotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; }
export function affRotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; }
// Place a model whose local +X is "forward" at ground (x, z) facing ground angle `face` (atan2(dy, dx)).
export function affPlace(x, y, z, face) { const c = Math.cos(face), s = Math.sin(face); return [c, 0, -s, x, 0, 1, 0, y, s, 0, c, z]; }
export function affScale(m, k) { return [m[0] * k, m[1] * k, m[2] * k, m[3], m[4] * k, m[5] * k, m[6] * k, m[7], m[8] * k, m[9] * k, m[10] * k, m[11]]; }

// ---------- orbit camera ----------
export class Camera3D {
  constructor() {
    this.yaw = 0;            // 0 = camera south of the target, looking north (matches the 2D view)
    this.pitch = 0.98;       // elevation above the ground plane (radians)
    this.dist = 400;
    this.fov = 0.66;
    this.near = 8;
    this.far = 3200;
    this.target = [1024, 0, 1024];
    this.eye = [0, 0, 0];
    this.aspect = 16 / 9;
    this.vp = new Float32Array(16);
  }
  update(aspect) {
    this.aspect = aspect;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const t = this.target;
    this.eye = [t[0] + Math.sin(this.yaw) * cp * this.dist, t[1] + sp * this.dist, t[2] + Math.cos(this.yaw) * cp * this.dist];
    this.fwd = norm([t[0] - this.eye[0], t[1] - this.eye[1], t[2] - this.eye[2]]);
    this.right = norm(cross(this.fwd, [0, 1, 0]));
    this.up = cross(this.right, this.fwd);
    this.view = lookAt(this.eye, t, [0, 1, 0]);
    this.proj = perspective(this.fov, aspect, this.near, this.far);
    this.vp = mul4(this.proj, this.view);
  }
  // ndc in [-1, 1]; returns the point where the view ray meets the plane Y = h.
  groundPoint(nx, ny, h = 0) {
    const th = Math.tan(this.fov / 2);
    const d = norm([
      this.fwd[0] + this.right[0] * nx * th * this.aspect + this.up[0] * ny * th,
      this.fwd[1] + this.right[1] * nx * th * this.aspect + this.up[1] * ny * th,
      this.fwd[2] + this.right[2] * nx * th * this.aspect + this.up[2] * ny * th,
    ]);
    const t = d[1] < -1e-4 ? (h - this.eye[1]) / d[1] : 4000;
    return { x: this.eye[0] + d[0] * t, z: this.eye[2] + d[2] * t };
  }
  // World point -> ndc (x, y in [-1, 1]); w <= 0 means behind the camera.
  project(x, y, z) {
    const p = xform4(this.vp, x, y, z);
    return { x: p[0] / p[3], y: p[1] / p[3], w: p[3] };
  }
}
