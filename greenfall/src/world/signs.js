// Shop signs & painted lettering: all strings are rendered into one canvas atlas.
import * as THREE from 'three';

const COLS = 4, ROWS = 32, CW = 512, CH = 128;
export class SignAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW * COLS;
    this.canvas.height = CH * ROWS;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.cells = new Map();
    this.next = 0;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, transparent: true, alphaTest: 0.05, roughness: 0.6, emissive: 0xffffff, emissiveMap: this.texture, emissiveIntensity: 0.0, side: THREE.DoubleSide });
    this.material.polygonOffset = true; this.material.polygonOffsetFactor = -2; this.material.polygonOffsetUnits = -2;
  }
  cell(text, colors = ['#ffffff', '#2a2a2a']) {
    const key = text + '|' + colors.join(',');
    if (this.cells.has(key)) return this.cells.get(key);
    const idx = this.next++ % (COLS * ROWS);
    const cx = (idx % COLS) * CW, cy = Math.floor(idx / COLS) * CH;
    const c = this.ctx;
    c.save();
    c.clearRect(cx, cy, CW, CH);
    const [fg, bg] = colors;
    if (bg && bg !== 'rgba(0,0,0,0)') {
      c.fillStyle = bg; c.fillRect(cx + 2, cy + 2, CW - 4, CH - 4);
      c.strokeStyle = fg; c.lineWidth = 5; c.strokeRect(cx + 10, cy + 10, CW - 20, CH - 20);
    }
    c.fillStyle = fg;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = 84;
    c.font = `${size}px "Lilita One", "Arial Black", sans-serif`;
    while (c.measureText(text).width > CW - 50 && size > 20) { size -= 4; c.font = `${size}px "Lilita One", "Arial Black", sans-serif`; }
    c.fillText(text, cx + CW / 2, cy + CH / 2 + 4);
    c.restore();
    const uv = { u0: cx / this.canvas.width, u1: (cx + CW) / this.canvas.width, v0: 1 - (cy + CH) / this.canvas.height, v1: 1 - cy / this.canvas.height };
    this.cells.set(key, uv);
    this.texture.needsUpdate = true;
    return uv;
  }
  // Emit sign quads into a GeoBuilder (uses the builder's position/normal/uv/color only)
  emit(gb, s) {
    const uv = this.cell(s.text, s.colors);
    gb.push();
    if (s.world) {
      gb.translate(s.x, s.y, s.z); gb.rotateY(s.yaw || 0);
    } else {
      gb.translate(s.b.x, s.b.y, s.b.z); gb.rotateY(s.b.rot); gb.translate(s.lx, s.ly, s.lz); gb.rotateY(s.yaw || 0);
    }
    gb.setColor(0xffffff).setLayer(0);
    const hw = s.w / 2, hh = s.h / 2;
    gb.quad([-hw, -hh, 0.01], [hw, -hh, 0.01], [hw, hh, 0.01], [-hw, hh, 0.01], [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]]);
    gb.pop();
  }
}
